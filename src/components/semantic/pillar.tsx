import { PILLAR_ORDER, PILLARS, type Pillar } from "@/core/semantic";

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
  return (
    <section className={`border-l-2 pl-4 ${tint.border}`} aria-label={PILLARS[pillar].label}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 className={`label-mono text-sm font-medium uppercase ${tint.text}`}>
            {pillarNumber(pillar)} · {PILLARS[pillar].label}
            {count !== undefined && <span className="text-ink/45"> · {count}</span>}
          </h2>
          <span className="font-mono text-xs text-ink/60">{PILLARS[pillar].clientQuestion}</span>
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}
