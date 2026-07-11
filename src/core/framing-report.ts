import { escapeModelText } from "./md";
import type { RecurrenceRow } from "./framing-evidence";

export interface FramingReportGap {
  classification: string;
  subject: string;
  rationale: string;
  factStatements: string[];
}

export interface FramingReportEvidence {
  responseId: string;
  rawText: string;
  associationLabel: string;
  quote: string;
  startOffset: number;
  endOffset: number;
  variantKey: string;
  providerId: string;
  modelVersion: string;
  generationMode: string;
  observedAt: string;
}

export interface FramingReportModel {
  reportVersion: "m34a-framing-report.v1";
  projectName: string;
  studyId: string;
  sourceRunId: string;
  sourceRunMode: "mock" | "live_validation" | "live_audit";
  sourceRepetitions: number;
  completedDate: string;
  promptProtocolVersion: string;
  promptWording: Array<{ variantKey: string; text: string }>;
  positioningText: string;
  positioningSource: "client-supplied" | "official-public";
  reviewerIdentity: string;
  reviewMethod: string;
  reviewDisclosure: string;
  discoveryManifestDigest: string;
  discoveryAttestation: string;
  codebookLockedAt: string;
  revealedAt: string;
  codebook: Array<{ associationId: string; label: string; definition: string }>;
  gapOutcome: "actionable_gap_identified" | "no_actionable_gap_identified";
  reviewOutcomeCounts: Record<string, number>;
  denominator: number;
  availableResponses: number;
  unavailableJobs: number;
  recurrence: RecurrenceRow[];
  gaps: FramingReportGap[];
  evidence: FramingReportEvidence[];
  factSheetScope: string;
}

function safe(value: string) {
  return escapeModelText(value);
}

export function renderFramingReportMarkdown(report: FramingReportModel): string {
  const lines = [
    `# ${safe(report.projectName)} — AI framing evidence`,
    "",
    `**Study:** ${report.studyId}`,
    `**Completed:** ${report.completedDate}`,
    `**Protocol:** ${report.promptProtocolVersion}`,
    `**Source mode:** ${report.sourceRunMode}`,
    "",
    "## Decision summary",
    "",
    report.gapOutcome === "no_actionable_gap_identified"
      ? "**No actionable gap was identified.** This report closes without a Simulation handoff."
      : report.gaps.length > 0
      ? report.gaps.map((gap) => `- **${safe(gap.classification.replaceAll("_", " "))}: ${safe(gap.subject)}.** ${safe(gap.rationale)}`).join("\n")
      : "No post-reveal gap classification was recorded.",
    "",
    "## Descriptive recurrence",
    "",
    `Denominator: ${report.denominator} sampled answer attempts / source jobs (${report.availableResponses} stored responses; ${report.unavailableJobs} unavailable). Counts are descriptive n/N over reviewed source jobs and do not estimate a wider population.`,
    "",
    "| Association | Source jobs containing association | Prompt spread | Model / mode scope |",
    "|---|---:|---:|---|",
    ...report.recurrence.map((row) => [
      safe(row.associationLabel),
      `${row.responsesContainingAssociation}/${row.denominator}`,
      `${row.promptVariantsContainingAssociation.length}/${row.promptVariantDenominator}`,
      safe(row.scopes.map((scope) => `${scope.providerId}/${scope.modelVersion}/${scope.generationMode}: ${scope.responsesContainingAssociation}/${scope.denominator}`).join("; ")),
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |")),
    "",
    "## Positioning used for gap analysis",
    "",
    `Source: **${report.positioningSource}**.`,
    "",
    safe(report.positioningText),
    "",
    "## Evidence excerpts",
    "",
    ...report.evidence.map((item) => `- **${safe(item.associationLabel)}** — “${safe(item.quote)}” (${item.variantKey}; ${safe(item.providerId)}/${safe(item.modelVersion)}/${safe(item.generationMode)})`),
    "",
    "## Method",
    "",
    `Review: ${safe(report.reviewerIdentity)}; ${safe(report.reviewMethod.replaceAll("_", " "))}. ${safe(report.reviewDisclosure)}`,
    "",
    `Discovery: metadata-masked packet ${safe(report.discoveryManifestDigest)}; ${safe(report.discoveryAttestation)} The workflow cannot prove the analyst lacked prior knowledge from outside the product.`,
    "",
    `Fact-sheet scope: ${safe(report.factSheetScope)}`,
    "",
    "Fixed prompts (verbatim):",
    "",
    ...report.promptWording.map((prompt) => `- **${prompt.variantKey}:** ${safe(prompt.text)}`),
    "",
    "The codebook was developed from a blinded raw-text subset and locked before positioning and the active fact sheet were revealed. Every accepted association links to a literal source span. Recurrence is descriptive; no automated inferential certification rule or independence claim is applied.",
    "",
    "## Recommended next step",
    "",
    report.gapOutcome === "actionable_gap_identified"
      ? "Treat the actionable gap as a candidate correction. Pre-screen comparative message variants if useful, then validate the selected fix with real buyers or in-market evidence before deployment."
      : "No Simulation handoff is recommended from this review. Re-audit after a material channel or positioning change.",
  ];
  return `${lines.join("\n")}\n`;
}
