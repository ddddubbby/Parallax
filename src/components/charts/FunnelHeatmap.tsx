"use client";

// Intent (funnel stage) x persona grid. Not a Recharts chart — Recharts has
// no heatmap primitive, and a dossier-style table fits the design language
// better than forcing one (DESIGN_GUIDELINES §5/§9). Still wrapped as its
// own component per C1.6: pages never touch the color scale directly.

export interface HeatmapCell {
  intent: string;
  personaId: string;
  personaLabel: string;
  n: number;
  value: number | null; // null = no data for this cell
}

const INTENT_ORDER = ["discovery", "consideration", "comparison", "validation", "objection"];

function cellBackground(value: number | null): string {
  if (value === null) return "transparent";
  // Signal orange at increasing opacity — one accent, per DESIGN_GUIDELINES §3.
  const alpha = 0.08 + value * 0.55;
  return `color-mix(in srgb, var(--color-accent) ${Math.round(alpha * 100)}%, transparent)`;
}

export function FunnelHeatmap({
  cells,
  onCellClick,
}: {
  cells: HeatmapCell[];
  onCellClick?: (intent: string, personaId: string) => void;
}) {
  const personas = [...new Map(cells.map((c) => [c.personaId, c.personaLabel])).entries()];
  const byKey = new Map(cells.map((c) => [`${c.intent}|${c.personaId}`, c]));
  const presentIntents = INTENT_ORDER.filter((i) => cells.some((c) => c.intent === i));

  if (personas.length === 0 || presentIntents.length === 0) {
    return <p className="font-mono text-xs text-ink/45">No cell-scoped data yet</p>;
  }

  return (
    <table className="w-full border-collapse font-mono text-xs">
      <thead>
        <tr>
          <th className="w-32 py-1.5 pr-3 text-left text-ink/50">Intent \ Persona</th>
          {personas.map(([id, label]) => (
            <th key={id} className="px-2 py-1.5 text-center text-ink/50">
              {label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {presentIntents.map((intent) => (
          <tr key={intent} className="border-t border-ink/10">
            <td className="py-1.5 pr-3 text-ink/70">{intent}</td>
            {personas.map(([personaId]) => {
              const cell = byKey.get(`${intent}|${personaId}`);
              const clickable = Boolean(cell && onCellClick);
              return (
                <td key={personaId} className="p-1">
                  <button
                    type="button"
                    disabled={!clickable}
                    onClick={() => cell && onCellClick?.(intent, personaId)}
                    className={`w-full rounded-lg px-2 py-2 text-center transition-micro ${clickable ? "cursor-pointer hover:ring-1 hover:ring-ink/30" : "cursor-default"}`}
                    style={{ backgroundColor: cellBackground(cell?.value ?? null) }}
                  >
                    {cell && cell.value !== null ? (
                      <>
                        <div className="font-medium text-ink">{Math.round(cell.value * 100)}%</div>
                        <div className="text-[10px] text-ink/45">n={cell.n}</div>
                      </>
                    ) : (
                      <span className="text-ink/30">—</span>
                    )}
                  </button>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
