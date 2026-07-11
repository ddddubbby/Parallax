import { escapeModelText } from "./md";
import type { RecurrenceRow } from "./framing-evidence";

export interface FramingReportGap {
  classification: string;
  subject: string;
  rationale: string;
  factStatements: string[];
}

export interface FramingReportEvidence {
  associationLabel: string;
  quote: string;
  variantKey: string;
  providerId: string;
  modelVersion: string;
  generationMode: string;
}

export interface FramingReportModel {
  reportVersion: "m34a-framing-report.v1";
  projectName: string;
  studyId: string;
  completedDate: string;
  promptProtocolVersion: string;
  promptWording: Array<{ variantKey: string; text: string }>;
  positioningText: string;
  positioningSource: "client-supplied" | "official-public";
  reviewerIdentity: string;
  reviewMethod: string;
  reviewDisclosure: string;
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
    "",
    "## Decision summary",
    "",
    report.gaps.length > 0
      ? report.gaps.map((gap) => `- **${safe(gap.classification.replaceAll("_", " "))}: ${safe(gap.subject)}.** ${safe(gap.rationale)}`).join("\n")
      : "No post-reveal gap classification was recorded.",
    "",
    "## Descriptive recurrence",
    "",
    `Denominator: ${report.denominator} source jobs (${report.availableResponses} stored responses; ${report.unavailableJobs} unavailable). Counts are descriptive n/N over reviewed source jobs and do not estimate a wider population.`,
    "",
    "| Association | Responses | Prompt spread | Model / mode scope |",
    "|---|---:|---:|---|",
    ...report.recurrence.map((row) => [
      safe(row.associationLabel),
      `${row.responsesContainingAssociation}/${row.denominator}`,
      `${row.promptVariantsContainingAssociation.length}/${row.promptVariantDenominator}`,
      safe(row.scopes.map((scope) => `${scope.providerId}/${scope.modelVersion}/${scope.generationMode}`).join("; ")),
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
    "Treat the actionable gap as a candidate correction. Pre-screen comparative message variants if useful, then validate the selected fix with real buyers or in-market evidence before deployment.",
  ];
  return `${lines.join("\n")}\n`;
}
