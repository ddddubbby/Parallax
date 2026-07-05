import { FUNNEL_STAGES, funnelStageForPillar, funnelStampForPillar } from "@/core/funnel";
import { PILLAR_ORDER, PILLARS, type Pillar, pillarMetricLabels } from "@/core/semantic";

// D-055 pillar visual system: pillars are identified by NUMBERED STRUCTURE
// (dossier sections) plus four muted structural tints used only here — for
// section spines, headers, and chips. The tints never style actions,
// verdicts, or emphasis; signal orange remains the only accent (V-2).
// Class strings are static so Tailwind can see them.
const TINT: Record<Pillar, { text: string; border: string }> = {
  presence: { text: "text-pillar-presence", border: "border-pillar-presence" },
  position: { text: "text-pillar-position", border: "border-pillar-position" },
  perception: { text: "text-pillar-perception", border: "border-pillar-perception" },
  proof: { text: "text-pillar-proof", border: "border-pillar-proof" },
};

export function pillarNumber(pillar: Pillar): string {
  return String(PILLAR_ORDER.indexOf(pillar) + 1).padStart(2, "0");
}

/** Small mono marker tying a card/cell to its pillar at a glance. */
export function PillarChip({ pillar }: { pillar: Pillar }) {
  const tint = TINT[pillar];
  return (
    <span
      className={`label-mono inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[11px] uppercase ${tint.text} ${tint.border}`}
      title={PILLARS[pillar].clientQuestion}
    >
      P{PILLAR_ORDER.indexOf(pillar) + 1} · {PILLARS[pillar].label}
    </span>
  );
}

/** Numbered dossier section frame: spine, header, client question. */
export function PillarSection({
  pillar,
  count,
  right,
  children,
}: {
  pillar: Pillar;
  count?: number;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  const tint = TINT[pillar];
  const funnelStage = funnelStageForPillar(pillar);
  const funnelStamp = funnelStampForPillar(pillar);
  const funnelTitle = funnelStage === null ? "Proof trust rail" : FUNNEL_STAGES[funnelStage].label;
  return (
    <section className={`border-l-2 pl-4 ${tint.border}`} aria-label={PILLARS[pillar].label}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 className={`label-mono text-sm font-medium uppercase ${tint.text}`}>
            {pillarNumber(pillar)} · {PILLARS[pillar].label}
            {count !== undefined && <span className="text-ink/45"> · {count}</span>}
          </h2>
          <span
            className="label-mono inline-flex rounded-xs border border-ink/30 px-1.5 py-0.5 text-[11px] text-ink/60"
            title={funnelTitle}
          >
            {funnelStamp}
          </span>
          <span className="font-mono text-xs text-ink/60">{PILLARS[pillar].clientQuestion}</span>
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

/**
 * EL-1: what a pillar's prompts do, why it matters to the client, and which
 * metrics the cells accumulate into. Rendered in the matrix (where the
 * operator builds and approves), not the dashboard (which shows the data).
 */
export function PillarExplainer({ pillar }: { pillar: Pillar }) {
  const meta = PILLARS[pillar];
  const feeds = pillarMetricLabels(pillar);
  return (
    <div className="mb-4 rounded-lg border border-ink/10 bg-paper-2/40 p-3">
      <p className="mb-1 font-mono text-xs text-ink/70">{meta.whatPromptsDo}</p>
      <p className="mb-2 font-mono text-xs text-ink/55">
        <span className="text-ink/70">Why it matters: </span>
        {meta.businessValue}
      </p>
      {feeds.length > 0 && (
        <p className="label-mono text-[11px] text-ink/45">Feeds: {feeds.join(" · ")}</p>
      )}
    </div>
  );
}
