import { Stamp } from "@/components/ui";

export type FindingRow = {
  id: string;
  findingType: string;
  severity: string;
  title: string;
  bodyMd: string;
  evidenceJson: unknown;
};

/**
 * Soft findings list for the Evidence dashboard (D-121). Not a hard gate —
 * report generation remains available regardless.
 */
export function FindingsPanel({ findings }: { findings: FindingRow[] }) {
  if (findings.length === 0) {
    return (
      <section className="mt-8 rounded-xl border border-ink/15 p-4" aria-label="Findings">
        <h2 className="label-mono mb-2 text-xs font-medium text-ink/60">Findings</h2>
        <p className="text-sm text-ink/65">No findings for this run yet.</p>
      </section>
    );
  }

  return (
    <section className="mt-8 rounded-xl border border-ink/15 p-4" aria-label="Findings">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="label-mono text-xs font-medium text-ink/60">Findings</h2>
        <Stamp tone="ink">{findings.length}</Stamp>
      </div>
      <ul className="flex flex-col gap-3">
        {findings.map((f) => {
          const evidence = f.evidenceJson as { directionalOnly?: boolean } | null;
          return (
            <li key={f.id} className="border-b border-ink/10 pb-3 last:border-0 last:pb-0">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <Stamp
                  tone={
                    f.severity === "high" ? "danger" : f.severity === "medium" ? "warn" : "ink"
                  }
                >
                  {f.severity}
                </Stamp>
                <span className="label-mono text-[10px] uppercase tracking-wide text-ink/45">
                  {f.findingType.replaceAll("_", " ")}
                </span>
                {evidence?.directionalOnly ? <Stamp tone="warn">DIRECTIONAL</Stamp> : null}
              </div>
              <p className="label-mono text-sm text-ink/85">{f.title}</p>
              <p className="mt-1 whitespace-pre-wrap font-sans text-sm leading-relaxed text-ink/65">
                {f.bodyMd}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
