"use client";

import { PILLARS } from "@/core/semantic";

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
  onDomainClick: (responseIds: string[], domain: string) => void;
}) {
  return (
    <section>
      <h2 className="label-mono mb-3 text-xs font-medium text-ink/60">
        {PILLARS.proof.label} <span className="text-ink/40">— {PILLARS.proof.clientQuestion}</span>
      </h2>
      {sources.length === 0 ? (
        <p className="font-mono text-xs text-ink/45">No citations in this run&rsquo;s grounded responses</p>
      ) : (
        <table className="w-full border-collapse font-mono text-xs">
          <thead>
            <tr className="border-b border-ink/20 text-left text-ink/50">
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
                    onClick={() => onDomainClick(s.responseIds, s.domain)}
                    className="text-accent-ink hover:underline"
                  >
                    View →
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
