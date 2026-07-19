"use client";

import { useEffect, useState, useTransition } from "react";
import { Button, Select, Stamp } from "@/components/ui";
import {
  adoptBrandAliasAction,
  fetchUnresolvedMentions,
  reResolveRunAction,
} from "@/modules/dashboard/actions";

type Summary = {
  top: Array<{ observedName: string; count: number }>;
  unresolvedTotal: number;
  trackedTotal: number;
  warning: boolean;
};
type BrandOption = { id: string; role: string; name: string };

/**
 * M45 / D-115: resolution health. The operator cannot enumerate every
 * spelling an engine will use, so the system surfaces what it failed to
 * resolve, ranked by frequency, with one-click alias adoption that
 * re-resolves the run at $0 and recomputes metrics. Renders nothing when
 * every mention resolved — silence is the healthy state.
 */
export function ResolutionHealthCard({
  projectId,
  runId,
  onMetricsChanged,
}: {
  projectId: string;
  runId: string;
  onMetricsChanged: () => void;
}) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingName, setPendingName] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    setSummary(null);
    setError(null);
    setNotice(null);
    fetchUnresolvedMentions(projectId, runId).then((result) => {
      if (cancelled || !result) return;
      setSummary(result.summary);
      setBrands(result.brands);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, runId]);

  if (!summary || summary.top.length === 0) return null;

  function adopt(observedName: string) {
    const brandId = selection[observedName] ?? "";
    if (!brandId) {
      setError(`Pick which brand "${observedName}" belongs to first.`);
      return;
    }
    setError(null);
    setPendingName(observedName);
    startTransition(async () => {
      const result = await adoptBrandAliasAction(projectId, runId, brandId, observedName);
      if (!result.ok) {
        setError(result.error);
      } else {
        setNotice(
          `"${observedName}" adopted — ${result.reResolved} extraction${result.reResolved === 1 ? "" : "s"} re-resolved at $0 and metrics recomputed.`,
        );
        const refreshed = await fetchUnresolvedMentions(projectId, runId);
        if (refreshed) setSummary(refreshed.summary);
        onMetricsChanged();
      }
      setPendingName(null);
    });
  }

  return (
    <section
      aria-label="Brand resolution health"
      className="rounded-xl border border-ink/15 bg-paper-2/30 p-4"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="label-mono text-sm font-semibold">Brand resolution health</h3>
        {summary.warning ? (
          <Stamp tone="warn">UNRESOLVED MENTIONS MAY BE SKEWING METRICS</Stamp>
        ) : (
          <Stamp tone="ink">MINOR UNRESOLVED TAIL</Stamp>
        )}
      </div>
      <p className="mb-3 max-w-3xl text-sm leading-6 text-ink/65">
        {summary.unresolvedTotal} brand mention{summary.unresolvedTotal === 1 ? "" : "s"} did not
        resolve to a tracked brand ({summary.trackedTotal} did). Names below are what the engines
        actually wrote — adopting one as an alias re-resolves this run at $0 and recomputes metrics.
      </p>
      {error && (
        <p role="alert" className="mb-2 rounded-md border border-danger px-3 py-2 font-mono text-xs text-danger">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mb-2 rounded-md border border-ok px-3 py-2 font-mono text-xs text-ink/75">
          {notice}
        </p>
      )}
      <div className="mb-3">
        <Button
          type="button"
          variant="secondary"
          pending={pendingName === "__reresolve__"}
          pendingLabel="Re-resolving"
          disabled={pending && pendingName !== "__reresolve__"}
          onClick={() => {
            setError(null);
            setPendingName("__reresolve__");
            startTransition(async () => {
              const result = await reResolveRunAction(projectId, runId);
              if (!result.ok) {
                setError(result.error);
              } else {
                setNotice(
                  result.reResolved === 0
                    ? "Nothing changed — these names need aliases (or belong to untracked brands)."
                    : `${result.reResolved} extraction${result.reResolved === 1 ? "" : "s"} re-resolved at $0 under the current matching rules.`,
                );
                const refreshed = await fetchUnresolvedMentions(projectId, runId);
                if (refreshed) setSummary(refreshed.summary);
                onMetricsChanged();
              }
              setPendingName(null);
            });
          }}
        >
          Re-resolve with current rules ($0)
        </Button>
      </div>
      <ul className="flex flex-col gap-2">
        {summary.top.map((row) => (
          <li
            key={row.observedName}
            className="flex flex-wrap items-center gap-2 rounded-lg border border-ink/10 p-2"
          >
            <span className="min-w-0 flex-1 break-words font-mono text-xs text-ink/80">
              “{row.observedName}” <span className="text-ink/50">× {row.count}</span>
            </span>
            <Select
              aria-label={`Brand for ${row.observedName}`}
              value={selection[row.observedName] ?? ""}
              onChange={(e) =>
                setSelection((prev) => ({ ...prev, [row.observedName]: e.target.value }))
              }
              className="w-44"
            >
              <option value="">Belongs to…</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.role})
                </option>
              ))}
            </Select>
            <Button
              type="button"
              variant="secondary"
              pending={pendingName === row.observedName}
              pendingLabel={`Adopting ${row.observedName}`}
              disabled={pending && pendingName !== row.observedName}
              onClick={() => adopt(row.observedName)}
            >
              Add alias & re-resolve
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
