/** Produces the M34A descriptive recurrence + actionable-gap report. */
import { basename, join } from "node:path";
import {
  assertGapClassifications,
  computeRecurrenceMatrix,
  framingStudySchema,
  lockedCodebookSchema,
  positioningRevealSchema,
  codingRecordSchema,
  type GapClassification,
} from "../../src/core/framing-evidence";
import { OUT_DIR, ensureDirs, log, readJson, reportFatal } from "./shared";
import { writeFileSync } from "node:fs";

function requiredArg(name: string): string {
  const value = process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  if (!value) throw new Error(`--${name}=... is required`);
  return value;
}

function optionalArg(name: string): string | null {
  return process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;
}

function readStudy(path: string) {
  const raw = readJson<{ study?: unknown } | unknown>(path);
  const candidate = raw && typeof raw === "object" && "study" in raw ? (raw as { study: unknown }).study : raw;
  return framingStudySchema.parse(candidate);
}

function scopeLabel(row: ReturnType<typeof computeRecurrenceMatrix>[number]): string {
  return row.scopes
    .map((scope) => `${scope.providerId}/${scope.modelVersion}/${scope.generationMode}: ${scope.responsesContainingAssociation}/${scope.denominator}`)
    .join("; ");
}

function consistencyLine(type: "intra_rater_consistency" | "machine_discrepancy_check" | "inter_rater_reliability", coding: ReturnType<typeof codingRecordSchema.parse>): string {
  const check = coding.consistencyChecks.find((candidate) => candidate.type === type);
  const label = type.replaceAll("_", " ");
  if (!check || check.status === "not_run") return `- ${label}: not run. ${check?.note ?? "No result is claimed."}`;
  return `- ${label}: ${check.agreementCount}/${check.comparisonCount} agreement; ${check.reviewerDescription}. ${check.note}`;
}

function main() {
  ensureDirs();
  const studyPath = requiredArg("study");
  const study = readStudy(studyPath);
  const codebook = lockedCodebookSchema.parse(readJson<unknown>(requiredArg("codebook")));
  const coding = codingRecordSchema.parse(readJson<unknown>(requiredArg("coding")));
  const reveal = positioningRevealSchema.parse(readJson<unknown>(requiredArg("reveal")));
  const classifications = readJson<GapClassification[]>(requiredArg("gaps"));
  assertGapClassifications({ codebook, reveal, classifications });
  const matrix = computeRecurrenceMatrix({ study, codebook, coding });
  const rawResponseCount = study.responses.filter((response) => response.rawText !== null).length;
  const unavailableGenerationCount = study.responses.length - rawResponseCount;
  const associationLabel = new Map(matrix.map((row) => [row.associationId, row.associationLabel]));
  const lines = [
    `# M34A Framing Evidence & Actionable Gap — ${study.projectLabel}`,
    "",
    `> Descriptive, human-reviewed evidence. Neutral-elicited lane; ${study.responses.length} denominator responses (${rawResponseCount} stored raw responses${unavailableGenerationCount > 0 ? `, ${unavailableGenerationCount} generation-unavailable` : ""}); prompt protocol \`${study.promptProtocolVersion}\`.`,
    `> Coding: ${coding.reviewMethod.replaceAll("_", " ")} by ${coding.reviewerId}. This report contains no confidence interval, synthetic-respondent count, semantic eligibility verdict, or automated stability claim.`,
    "",
    "## Recurrence matrix",
    "",
    "| Association | Responses | Prompt spread | Model/mode scope | Review status |",
    "|---|---:|---|---|---|",
    ...matrix.map((row) => `| ${row.associationLabel} | ${row.responsesContainingAssociation}/${row.denominator} | ${row.promptVariantsContainingAssociation.length}/${row.promptVariantDenominator} (${row.promptVariantsContainingAssociation.join(", ") || "none"}) | ${scopeLabel(row)} | ${row.reviewStatus} |`),
    "",
    "## Coding consistency",
    "",
    `- Primary coding method: ${coding.reviewMethod.replaceAll("_", " ")} by ${coding.reviewerId}.`,
    consistencyLine("intra_rater_consistency", coding),
    consistencyLine("machine_discrepancy_check", coding),
    consistencyLine("inter_rater_reliability", coding),
    "",
    "## Actionable framing gaps",
    "",
    "| Classification | Association or target | Evidence basis |",
    "|---|---|---|",
    ...classifications.map((gap) => {
      const subject = gap.kind === "missing" ? gap.targetAssociation! : associationLabel.get(gap.associationId!)!;
      const facts = gap.factSheetReferences.length > 0 ? `Fact-sheet refs: ${gap.factSheetReferences.join(", ")}. ` : "";
      return `| ${gap.kind.replaceAll("_", " ")} | ${subject} | ${facts}${gap.rationale} |`;
    }),
    "",
    "## Method and evidence",
    "",
    "- Fixed representation prompts (verbatim):",
    ...[...new Map(study.responses.map((response) => [response.promptVariant, response.promptText])).entries()].sort(([a], [b]) => a.localeCompare(b)).map(([variant, text]) => `  - \`${variant}\`: ${text}`),
    "- Headline surfaces report prompt spread rather than claiming prompt-invariant stability.",
    "- Every accepted association links to a literal offset-verified span in an immutable stored response. AI span extraction was assistive only; a human accepted or rejected every code.",
    "- The positioning and fact sheet were revealed after the codebook was locked. The recorded reveal and lock timestamps are retained with the coding record.",
    "- Any Simulation handoff must use a verbatim reviewed response and separately render its immutable M34A evidence snapshot under C-15.",
  ];
  const out = optionalArg("out") ?? join(OUT_DIR, `${basename(studyPath).replace(/\.json$/, "")}-gap-report.md`);
  writeFileSync(out, `${lines.join("\n")}\n`, "utf8");
  log("m34a-report", `wrote ${out}; rows=${matrix.length}; gaps=${classifications.length}`);
}

try {
  main();
} catch (error) {
  process.exit(reportFatal(error));
}
