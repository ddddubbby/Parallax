"use client";

import { Stamp } from "@/components/ui";

interface MisinfoRow {
  id: string;
  responseId: string;
  claimText: string;
  claimType: string;
  extractedVerdict: string;
  extractedSeverity: string;
  operatorVerdict: string | null;
  operatorSeverity: string | null;
  reviewState: string;
  evidenceQuote: string | null;
  factStatement: string | null;
}

function severityTone(severity: string): "danger" | "warn" | "ink" {
  if (severity === "high") return "danger";
  if (severity === "medium") return "warn";
  return "ink";
}

/** DB-1 misinformation register: checkable claims that contradict, are unsupported by, or outdate the fact sheet. DB-2: one click straight to evidence. */
export function MisinformationRegister({
  rows,
  onRowClick,
}: {
  rows: MisinfoRow[];
  onRowClick: (responseId: string, claimText: string) => void;
}) {
  return (
    <section>
      <h2 className="label-mono mb-3 text-xs font-medium text-ink/60">
        Misinformation Register <span className="text-ink/40">({rows.length})</span>
      </h2>
      {rows.length === 0 ? (
        <p className="font-mono text-xs text-ink/45">No contradicted or unsupported claims found</p>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((r) => {
            const verdict = r.operatorVerdict ?? r.extractedVerdict;
            const severity = r.operatorSeverity ?? r.extractedSeverity;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => onRowClick(r.responseId, r.claimText)}
                className="rounded-lg border border-ink/15 p-3 text-left transition-micro hover:border-ink/40"
              >
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <Stamp tone={severityTone(severity)}>{severity}</Stamp>
                  <Stamp tone="ink">{verdict}</Stamp>
                  <Stamp tone="ink">{r.claimType}</Stamp>
                  {r.reviewState !== "unreviewed" && <Stamp tone="ok">{r.reviewState}</Stamp>}
                </div>
                <p className="mb-1 font-mono text-xs text-ink/85">{r.claimText}</p>
                {r.factStatement && (
                  <p className="font-mono text-[11px] text-ink/50">Fact sheet: {r.factStatement}</p>
                )}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
