import type { Finding } from "./findings";
import { escapeModelText } from "./md";
import { PILLARS, resolveGlossary, type Pillar } from "./semantic";

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

interface ReportFinding extends Finding {
  id?: string;
}

export interface ReportEvidenceExcerpt {
  findingId: string;
  findingType: string;
  findingTitle: string;
  responseId: string;
  providerId: string;
  generationMode: string;
  quote: string;
}

export interface ReportContext {
  clientBrandName: string;
  competitorNames: string[];
  runMode: string;
  runDate: string;
  isMock: boolean;
  isPartial: boolean;
  repetitions: number;
  plannedCalls: number;
  costCapUsd: number;
  providers: string[];
  modes: string[];
  metrics: MetricLike[];
  findings: ReportFinding[];
  evidenceExcerpts: ReportEvidenceExcerpt[];
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

function runProvenance(ctx: ReportContext, n: number | null | undefined): string {
  const sample = typeof n === "number" ? `n=${n}` : "n=not available";
  return `${sample}; providers: ${ctx.providers.join(", ") || "none"}; modes: ${ctx.modes.join(", ") || "none"}; run date: ${ctx.runDate}`;
}

function metricProvenance(ctx: ReportContext, metric: MetricLike | undefined): string {
  return `(${runProvenance(ctx, metric?.n)})`;
}

function findingProvenance(ctx: ReportContext, finding: Finding): string {
  const n = typeof finding.evidence.n === "number" ? finding.evidence.n : null;
  return `(${runProvenance(ctx, n)})`;
}

function countProvenance(ctx: ReportContext, count: number, unit: string): string {
  return `(n=${count} ${unit}; providers: ${ctx.providers.join(", ") || "none"}; modes: ${ctx.modes.join(", ") || "none"}; run date: ${ctx.runDate})`;
}

function metricRowsByPillar(ctx: ReportContext): Array<{ pillar: Pillar; rows: MetricLike[] }> {
  const overall = ctx.metrics.filter((m) => m.scopeType === "overall");
  const byKey = new Map(overall.map((m) => [m.metricKey, m]));
  const pillarOrder: Pillar[] = ["presence", "position", "perception", "proof"];
  const ordered = [...byKey.values()].sort((a, b) => {
    const ga = resolveGlossary(a.metricKey);
    const gb = resolveGlossary(b.metricKey);
    return ga.pillar === gb.pillar ? ga.label.localeCompare(gb.label) : pillarOrder.indexOf(ga.pillar) - pillarOrder.indexOf(gb.pillar);
  });

  const groups = new Map<Pillar, MetricLike[]>();
  for (const row of ordered) {
    const pillar = resolveGlossary(row.metricKey).pillar;
    groups.set(pillar, [...(groups.get(pillar) ?? []), row]);
  }
  return [...groups.entries()].map(([pillar, rows]) => ({ pillar, rows }));
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

  return `${badgeLine(ctx)}This report summarizes how AI assistants described **${ctx.clientBrandName}** across this run's eligible sampled answers (${runProvenance(ctx, mention?.n)}), compared against ${ctx.competitorNames.length} tracked competitors.

In the sampled answers, ${ctx.clientBrandName} was mentioned in ${pct(mention?.value)} of eligible responses${ci(mention)} ${metricProvenance(ctx, mention)} and recommended in ${pct(rec?.value)}${ci(rec)} ${metricProvenance(ctx, rec)}. Its share of voice against tracked competitors was ${pct(sov?.value)} ${metricProvenance(ctx, sov)}.

${highFindings > 0 ? `${highFindings} high-severity finding${highFindings === 1 ? "" : "s"} ${highFindings === 1 ? "requires" : "require"} attention — see the sections below.` : "No high-severity findings were flagged in this run."} These figures describe what was observed in this specific sample and should be read alongside the confidence intervals and sample sizes noted throughout this report, not as a guarantee of future AI behavior.`;
}

function generateMethodConfidence(ctx: ReportContext): string {
  const mention = overall(ctx, "mention_rate");
  const metricRows = metricRowsByPillar(ctx)
    .flatMap(({ rows }) => rows)
    .map((m) => {
      const glossary = resolveGlossary(m.metricKey);
      return `| ${glossary.label} | ${PILLARS[glossary.pillar].label} | ${glossary.computationSummary} | ${glossary.intervalCaveat} |`;
    })
    .join("\n");

  return `${badgeLine(ctx)}## Run configuration

| Field | Value |
|---|---|
| Run date | ${ctx.runDate} |
| Run mode | ${ctx.runMode} |
| Planned calls | ${ctx.plannedCalls} |
| Repetitions per approved prompt | ${ctx.repetitions} |
| Providers | ${ctx.providers.join(", ") || "none"} |
| Grounding modes | ${ctx.modes.join(", ") || "none"} |
| Run cost cap | $${ctx.costCapUsd.toFixed(2)} |

## Eligibility

${mention?.n ?? 0} responses were eligible for aggregate metrics (${runProvenance(ctx, mention?.n)}). Per D-014, an eligible sample is a stored response whose latest extraction is valid or QA-reviewed with \`refusal=false\`; refusals, dead-lettered jobs, and unusable extractions are excluded from metric denominators rather than silently mixed in.

Aggregate figures render only where the eligible sample size is at least 30; smaller samples show as "insufficient data" rather than a number that could mislead. Cell-level findings such as lost-shortlist cells are exempt from that threshold but are always labeled directional-only, since a single cell reflects only a handful of samples.

## Metric glossary used in this run

| Metric | Pillar | Computation | Interval method |
|---|---|---|---|
${metricRows || "| No metrics computed | — | — | — |"}`;
}

function generateVisibility(ctx: ReportContext): string {
  const mention = overall(ctx, "mention_rate");
  const sov = overall(ctx, "share_of_voice");
  const pos = overall(ctx, "avg_first_position");
  const stability = overall(ctx, "stability_index");
  const lowStability = findingsByType(ctx, "low_stability");

  return `${PILLARS.presence.clientQuestion}

Presence metrics are computed over unbranded prompts only — questions that name no tracked brand — so every mention below is one the AI volunteered, never one the prompt planted (D-054).

| Metric | Value | Provenance |
|---|---|---|
| Mention Rate | ${pct(mention?.value)}${ci(mention)} | ${runProvenance(ctx, mention?.n)} |
| Share of Voice | ${pct(sov?.value)} | ${runProvenance(ctx, sov?.n)} |
| Avg First Position (when mentioned) | ${pos?.value !== undefined ? pos.value.toFixed(1) : "not available"} | ${runProvenance(ctx, pos?.n)} |
| Stability Index | ${stability?.value !== undefined ? stability.value.toFixed(2) : "not available"} | ${runProvenance(ctx, stability?.n)} |

${lowStability.length > 0 ? `${lowStability.length} cell${lowStability.length === 1 ? "" : "s"} showed low stability (repeated samples disagreeing on which brands appear) — see the evidence appendix for specifics. These are cell-level observations, not aggregate claims. ${countProvenance(ctx, lowStability.length, "flagged cells")}` : "No cells fell below the stability threshold in this run."}`;
}

function generatePerception(ctx: ReportContext): string {
  const positioningGaps = findingsByType(ctx, "positioning_gap");
  const sentimentLines = ctx.metrics
    .filter((m) => m.scopeType === "overall" && m.metricKey.startsWith("sentiment_"))
    .sort((a, b) => resolveGlossary(a.metricKey).label.localeCompare(resolveGlossary(b.metricKey).label))
    .map((m) => `- ${resolveGlossary(m.metricKey).label}: ${pct(m.value)} ${metricProvenance(ctx, m)}`)
    .join("\n");

  return `${PILLARS.perception.clientQuestion}

Sentiment is reported in two separate groups that are never pooled (D-054): organic (how AI talks about ${ctx.clientBrandName} when AI brings it up in unbranded answers) and solicited (how AI answers a direct fit question). Objection-cell answers are excluded from sentiment entirely — those prompts ask for concerns, so their negative skew is by design; their content feeds the findings below instead.

${sentimentLines || "No sentiment data available."}

  ${
  positioningGaps.length > 0
    ? `${positioningGaps.length} desired attribute${positioningGaps.length === 1 ? "" : "s"} showed a low association rate with ${ctx.clientBrandName} in sampled answers ${countProvenance(ctx, positioningGaps.length, "flagged attributes")}:\n\n${positioningGaps.map((f) => `- ${f.title}: ${f.bodyMd} ${findingProvenance(ctx, f)}`).join("\n")}`
    : "No positioning gaps were flagged against the desired attribute list in this run."
  }`;
}

function generateCompetitiveDynamics(ctx: ReportContext): string {
  const organicRec = overall(ctx, "recommendation_rate");
  const compWin = overall(ctx, "comparative_win_rate");
  const lostShortlist = findingsByType(ctx, "lost_shortlist");
  const groundedSplit = findingsByType(ctx, "grounded_ungrounded_split");

  return `${PILLARS.position.clientQuestion}

Two distinct winning conditions are measured separately and never pooled (D-054): the organic recommendation rate counts only unbranded prompts (does AI recommend ${ctx.clientBrandName} when nobody asked about it), while the comparative win rate counts only head-to-head prompts against ${ctx.competitorNames.join(", ") || "the tracked competitor set"} (when forced to compare, does AI pick ${ctx.clientBrandName}).

| Metric | Value | Provenance |
|---|---|---|
| Organic Recommendation Rate | ${pct(organicRec?.value)}${ci(organicRec)} | ${runProvenance(ctx, organicRec?.n)} |
| Comparative Win Rate | ${pct(compWin?.value)}${ci(compWin)} | ${runProvenance(ctx, compWin?.n)} |

${
  lostShortlist.length > 0
    ? `${lostShortlist.length} cell${lostShortlist.length === 1 ? "" : "s"} showed a competitor dominating a high-intent comparison while ${ctx.clientBrandName} was nearly absent (directional, cell-level observations, not aggregate claims) ${countProvenance(ctx, lostShortlist.length, "flagged cells")}:\n\n${lostShortlist.map((f) => `- ${f.title}: ${f.bodyMd} ${findingProvenance(ctx, f)}`).join("\n")}`
    : "No lost-shortlist cells were flagged in this run."
}

${groundedSplit.length > 0 ? groundedSplit.map((f) => `${f.bodyMd} ${findingProvenance(ctx, f)}`).join("\n\n") : ""}`;
}

function generateSources(ctx: ReportContext): string {
  const concentration = findingsByType(ctx, "source_concentration");
  const topSources = ctx.citedSources.slice(0, 10);
  const table =
    topSources.length > 0
      ? `| Domain | Citations |\n|---|---|\n${topSources.map((s) => `| ${escapeModelText(s.domain)} | ${s.total} |`).join("\n")}`
      : "No citations were recorded in this run's grounded responses.";

  return `${PILLARS.proof.clientQuestion}

${table}

Citation counts are drawn from eligible responses in this run (${runProvenance(ctx, overall(ctx, "citation_share")?.n)}).

${concentration.length > 0 ? concentration.map((f) => `${f.bodyMd} ${findingProvenance(ctx, f)}`).join("\n\n") : ""}`;
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

${ctx.misinformation.length} claim${ctx.misinformation.length === 1 ? "" : "s"} in this run's sampled answers did not match the client fact sheet ${countProvenance(ctx, ctx.misinformation.length, "extracted claims")}:\n\n${rows}`;
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
  if (ctx.findings.length === 0) {
    return `This run sampled ${mention?.n ?? 0} eligible responses (${runProvenance(ctx, mention?.n)}).

No findings were generated for this run. Full raw response text, structured extractions, computed metrics, and citations for every sample remain available via the CSV/JSON evidence export (EX-3).`;
  }

  const excerptsByFinding = new Map<string, ReportEvidenceExcerpt[]>();
  for (const excerpt of ctx.evidenceExcerpts) {
    excerptsByFinding.set(excerpt.findingId, [...(excerptsByFinding.get(excerpt.findingId) ?? []), excerpt]);
  }

  const findingBlocks = ctx.findings
    .map((finding, index) => {
      const id = finding.id ?? `${finding.findingType}:${index}`;
      const excerpts = excerptsByFinding.get(id) ?? [];
      const quoteLines =
        excerpts.length > 0
          ? excerpts
              .map(
                (e) =>
                  `> "${escapeModelText(e.quote)}"\n\nResponse: \`${e.responseId}\` · provider: ${e.providerId} · mode: ${e.generationMode}`,
              )
              .join("\n\n")
          : "No eligible raw-response excerpt was available for this finding.";
      return `### ${finding.title}\n\n${quoteLines}`;
    })
    .join("\n\n---\n\n");

  return `This run sampled ${mention?.n ?? 0} eligible responses (${runProvenance(ctx, mention?.n)}).

Each finding below cites deterministic raw-response evidence: first eligible matching response by response id, so regenerated reports stay stable.

${findingBlocks}

Full raw response text, structured extractions, computed metrics, and citations for every sample are available via the CSV/JSON evidence export (EX-3).`;
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
