import type { Finding } from "./findings";
import { escapeModelText } from "./md";
import { PILLARS } from "./semantic";

// Report section templates (RB-4). Deterministic markdown generation from
// already-computed metrics/findings data — no LLM call, matching the
// fixture-backed determinism the rest of MVP mock mode relies on, and
// making RB-5's cautious tone a property of the template, not a hope about
// what a model will say. No project-layer imports (C-7).
//
// RB-5: never promises rankings or guaranteed remediation. Every template
// here is written to report what was OBSERVED in sampled answers, not
// what the brand "is" or what will happen if changes are made.

export const REPORT_SECTIONS = [
  { key: "executive_summary", title: "Executive Summary" },
  { key: "method_confidence", title: "Method & Confidence" },
  { key: "visibility", title: `${PILLARS.presence.label}: ${PILLARS.presence.clientQuestion}` },
  { key: "perception", title: `${PILLARS.perception.label}: ${PILLARS.perception.clientQuestion}` },
  { key: "competitive_dynamics", title: `${PILLARS.position.label}: ${PILLARS.position.clientQuestion}` },
  { key: "sources", title: `${PILLARS.proof.label}: Sources` },
  { key: "misinformation_register", title: `${PILLARS.proof.label}: Claim Accuracy` },
  { key: "recommendations", title: "Recommendations" },
  { key: "raw_answer_appendix", title: "Raw Answer Appendix" },
] as const;

export type SectionKey = (typeof REPORT_SECTIONS)[number]["key"];

interface MetricLike {
  scopeType: string;
  metricKey: string;
  n: number;
  value: number;
  ciLow: number | null;
  ciHigh: number | null;
}

export interface ReportContext {
  clientBrandName: string;
  competitorNames: string[];
  runMode: string;
  isMock: boolean;
  isPartial: boolean;
  repetitions: number;
  providers: string[];
  modes: string[];
  metrics: MetricLike[];
  findings: Finding[];
  misinformation: Array<{
    claimText: string;
    verdict: string;
    severity: string;
    evidenceQuote: string | null;
    factStatement: string | null;
  }>;
  citedSources: Array<{ domain: string; total: number }>;
  sentiment: Record<string, number>;
}

function overall(ctx: ReportContext, key: string): MetricLike | undefined {
  return ctx.metrics.find((m) => m.scopeType === "overall" && m.metricKey === key);
}

function pct(v: number | undefined): string {
  return v === undefined ? "not available" : `${Math.round(v * 100)}%`;
}

function ci(m: MetricLike | undefined): string {
  if (!m || m.ciLow === null || m.ciHigh === null) return "";
  return ` (95% CI ${Math.round(m.ciLow * 100)}–${Math.round(m.ciHigh * 100)}%)`;
}

function findingsByType(ctx: ReportContext, type: string): Finding[] {
  return ctx.findings.filter((f) => f.findingType === type);
}

function badgeLine(ctx: ReportContext): string {
  const badges: string[] = [];
  if (ctx.isMock) badges.push("**MOCK** — this run used simulated provider fixtures, not live AI answers.");
  if (ctx.runMode === "live_validation") badges.push("**VALIDATION-ONLY** — a small dry-run, not client-ready evidence.");
  if (ctx.isPartial) badges.push("**PARTIAL** — some samples in this run did not complete or could not be extracted.");
  return badges.length > 0 ? badges.map((b) => `> ${b}`).join("\n") + "\n\n" : "";
}

function generateExecutiveSummary(ctx: ReportContext): string {
  const mention = overall(ctx, "mention_rate");
  const rec = overall(ctx, "recommendation_rate");
  const sov = overall(ctx, "share_of_voice");
  const highFindings = ctx.findings.filter((f) => f.severity === "high").length;

  return `${badgeLine(ctx)}This report summarizes how AI assistants described **${ctx.clientBrandName}** across ${mention?.n ?? 0} sampled answers in this run, compared against ${ctx.competitorNames.length} tracked competitors.

In the sampled answers, ${ctx.clientBrandName} was mentioned in ${pct(mention?.value)} of eligible responses${ci(mention)} and recommended in ${pct(rec?.value)}${ci(rec)}. Its share of voice against tracked competitors was ${pct(sov?.value)}.

${highFindings > 0 ? `${highFindings} high-severity finding${highFindings === 1 ? "" : "s"} ${highFindings === 1 ? "requires" : "require"} attention — see the sections below.` : "No high-severity findings were flagged in this run."} These figures describe what was observed in this specific sample and should be read alongside the confidence intervals and sample sizes noted throughout this report, not as a guarantee of future AI behavior.`;
}

function generateMethodConfidence(ctx: ReportContext): string {
  const mention = overall(ctx, "mention_rate");
  return `${badgeLine(ctx)}This audit sampled each approved prompt ${ctx.repetitions} time${ctx.repetitions === 1 ? "" : "s"} per engine-mode, across provider(s) ${ctx.providers.join(", ") || "none"} and mode(s) ${ctx.modes.join(", ") || "none"}.

${mention?.n ?? 0} responses were eligible for aggregate metrics — refusals and responses that could not be extracted are excluded from every rate in this report and reported separately, not silently dropped.

Aggregate figures render only where the eligible sample size is at least 30; smaller samples show as "insufficient data" rather than a number that could mislead. Cell-level findings such as lost-shortlist cells are exempt from that threshold but are always labeled directional-only, since a single cell reflects only a handful of samples.

Wilson confidence intervals are shown for true proportions (Mention Rate, Recommendation Rate, Accuracy Rate). Share of Voice, Citation Share, Avg First Position, and Stability Index are point estimates without a defined interval in this version of the tool.`;
}

function generateVisibility(ctx: ReportContext): string {
  const mention = overall(ctx, "mention_rate");
  const rec = overall(ctx, "recommendation_rate");
  const pos = overall(ctx, "avg_first_position");
  const stability = overall(ctx, "stability_index");
  const lowStability = findingsByType(ctx, "low_stability");

  return `${PILLARS.presence.clientQuestion}

| Metric | Value | n |
|---|---|---|
| Mention Rate | ${pct(mention?.value)}${ci(mention)} | ${mention?.n ?? "—"} |
| Recommendation Rate | ${pct(rec?.value)}${ci(rec)} | ${rec?.n ?? "—"} |
| Avg First Position (when mentioned) | ${pos?.value !== undefined ? pos.value.toFixed(1) : "not available"} | ${pos?.n ?? "—"} |
| Stability Index | ${stability?.value !== undefined ? stability.value.toFixed(2) : "not available"} | ${stability?.n ?? "—"} |

${lowStability.length > 0 ? `${lowStability.length} cell${lowStability.length === 1 ? "" : "s"} showed low stability (repeated samples disagreeing on which brands appear) — see the evidence appendix for specifics. These are cell-level observations, not aggregate claims.` : "No cells fell below the stability threshold in this run."}`;
}

function generatePerception(ctx: ReportContext): string {
  const positioningGaps = findingsByType(ctx, "positioning_gap");
  const sentimentLines = Object.entries(ctx.sentiment)
    .map(([label, rate]) => `- ${label}: ${pct(rate)}`)
    .join("\n");

  return `${PILLARS.perception.clientQuestion}

Sentiment observed in mentions of ${ctx.clientBrandName}:

${sentimentLines || "No sentiment data available."}

${
  positioningGaps.length > 0
    ? `${positioningGaps.length} desired attribute${positioningGaps.length === 1 ? "" : "s"} showed a low association rate with ${ctx.clientBrandName} in sampled answers:\n\n${positioningGaps.map((f) => `- ${f.title}: ${f.bodyMd}`).join("\n")}`
    : "No positioning gaps were flagged against the desired attribute list in this run."
}`;
}

function generateCompetitiveDynamics(ctx: ReportContext): string {
  const sov = overall(ctx, "share_of_voice");
  const lostShortlist = findingsByType(ctx, "lost_shortlist");
  const groundedSplit = findingsByType(ctx, "grounded_ungrounded_split");

  return `${PILLARS.position.clientQuestion}

${ctx.clientBrandName}'s observed share of voice against ${ctx.competitorNames.join(", ") || "tracked competitors"} was ${pct(sov?.value)} in this run.

${
  lostShortlist.length > 0
    ? `${lostShortlist.length} cell${lostShortlist.length === 1 ? "" : "s"} showed a competitor dominating a high-intent comparison while ${ctx.clientBrandName} was nearly absent (directional, cell-level observations, not aggregate claims):\n\n${lostShortlist.map((f) => `- ${f.title}`).join("\n")}`
    : "No lost-shortlist cells were flagged in this run."
}

${groundedSplit.length > 0 ? groundedSplit.map((f) => f.bodyMd).join("\n\n") : ""}`;
}

function generateSources(ctx: ReportContext): string {
  const concentration = findingsByType(ctx, "source_concentration");
  const topSources = ctx.citedSources.slice(0, 10);
  const table =
    topSources.length > 0
      ? `| Domain | Citations |\n|---|---|\n${topSources.map((s) => `| ${escapeModelText(s.domain)} | ${s.total} |`).join("\n")}`
      : "No citations were recorded in this run's grounded responses.";

  return `${PILLARS.proof.clientQuestion}

${table}\n\n${concentration.length > 0 ? concentration.map((f) => f.bodyMd).join("\n\n") : ""}`;
}

function generateMisinformationRegister(ctx: ReportContext): string {
  if (ctx.misinformation.length === 0) {
    return `${PILLARS.proof.clientQuestion}

No contradicted, unsupported, or outdated claims about the client brand were found in this run's sampled answers.`;
  }
  // claim_text and evidence_quote are model-derived (untrusted in live
  // mode); verdict/severity are DB enums and fact_statement is the
  // operator's own fact sheet.
  const rows = ctx.misinformation
    .map(
      (m) =>
        `### ${m.verdict} (${m.severity} severity)\n\n> ${escapeModelText(m.claimText)}\n\n${m.evidenceQuote ? `Evidence: "${escapeModelText(m.evidenceQuote)}"\n\n` : ""}${m.factStatement ? `Fact sheet: ${m.factStatement}` : "Not checked against a specific fact-sheet entry."}`,
    )
    .join("\n\n---\n\n");
  return `${PILLARS.proof.clientQuestion}

${ctx.misinformation.length} claim${ctx.misinformation.length === 1 ? "" : "s"} in this run's sampled answers did not match the client fact sheet:\n\n${rows}`;
}

function generateRecommendations(ctx: ReportContext): string {
  const talkingPoints = ctx.findings.map((f) => `- ${f.title}`).join("\n");
  return `_This section is a starting scaffold, not a finished deliverable — the operator is responsible for final recommendations based on professional judgment, client context, and claim confirmation._

Findings from this run worth discussing with the client:

${talkingPoints || "No findings were flagged in this run to build recommendations from."}

Add your analysis and recommended next steps below.`;
}

function generateRawAnswerAppendix(ctx: ReportContext): string {
  const mention = overall(ctx, "mention_rate");
  return `This run sampled ${mention?.n ?? 0} eligible responses across provider(s) ${ctx.providers.join(", ") || "none"} and mode(s) ${ctx.modes.join(", ") || "none"}.

Full raw response text, structured extractions, computed metrics, and citations for every sample are available via the CSV/JSON evidence export (EX-3), not duplicated inline here — every figure in this report traces back to a specific stored raw response.`;
}

const GENERATORS: Record<SectionKey, (ctx: ReportContext) => string> = {
  executive_summary: generateExecutiveSummary,
  method_confidence: generateMethodConfidence,
  visibility: generateVisibility,
  perception: generatePerception,
  competitive_dynamics: generateCompetitiveDynamics,
  sources: generateSources,
  misinformation_register: generateMisinformationRegister,
  recommendations: generateRecommendations,
  raw_answer_appendix: generateRawAnswerAppendix,
};

/** RB-3: generates exactly one section's markdown — callers control which sections get touched. */
export function generateSection(key: SectionKey, ctx: ReportContext): string {
  return GENERATORS[key](ctx);
}
