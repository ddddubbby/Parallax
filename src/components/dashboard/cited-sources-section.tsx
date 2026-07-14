"use client";

interface CitedSource {
  domain: string;
  total: number;
  citesCompetitor: number;
  responseIds: string[];
}

/** DB-1 cited sources, DB-2 drill-down straight to the citing responses. */
export function CitedSourcesSection({
  sources,
  onDomainClick,
}: {
  sources: CitedSource[];
  onDomainClick: (responseIds: string[], domain: string, trigger?: HTMLElement) => void;
}) {
  return (
    <section>
      <h2 className="label-mono mb-3 text-xs font-medium text-ink/70">Cited sources</h2>
      {sources.length === 0 ? (
        <p className="text-sm text-ink/65">No citations appear in this run&rsquo;s grounded responses.</p>
      ) : (
        <div className="overflow-x-auto" role="region" aria-label="Cited sources table" tabIndex={0}>
        <table className="min-w-[30rem] w-full border-collapse font-mono text-xs">
          <thead>
            <tr className="border-b border-ink/20 text-left text-ink/65">
              <th className="py-1.5 pr-3">Domain</th>
              <th className="py-1.5 pr-3">Citations</th>
              <th className="py-1.5" />
            </tr>
          </thead>
          <tbody>
            {sources.slice(0, 15).map((s) => (
              <tr key={s.domain} className="border-b border-ink/10">
                <td className="py-1.5 pr-3">{s.domain}</td>
                <td className="py-1.5 pr-3 tabular-nums">{s.total}</td>
                <td className="py-1.5 text-right">
                  <button
                    type="button"
                    onClick={(event) => onDomainClick(s.responseIds, s.domain, event.currentTarget)}
                    className="inline-flex min-h-11 items-center rounded-sm text-accent-ink underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    aria-label={`View ${s.total} citations from ${s.domain}`}
                  >
                    View →
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </section>
  );
}
