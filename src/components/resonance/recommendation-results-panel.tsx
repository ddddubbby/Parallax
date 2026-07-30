import { SimulatedBadge } from "@/components/simulated-badge";
import { Stamp } from "@/components/ui";
import type { RecommendationStudyResultSummary } from "@/db/repositories/resonance";

function rate(value: number) {
  return `${Math.round(value * 100)}%`;
}

function points(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)} pp`;
}

export function RecommendationResultsPanel({
  results,
  model,
}: {
  results: RecommendationStudyResultSummary;
  model: string;
}) {
  const group = results.providerGroups.find((item) => item.providerId === model)
    ?? results.providerGroups[0];
  if (!group) return <p className="text-sm text-ink/65">No valid recommendation results yet.</p>;

  const current = group.conditions[0];
  const next = group.conditions[1];
  const lift = group.lifts[0];
  if (!current || !next || !lift) {
    return <p className="text-sm text-ink/65">No valid recommendation results yet.</p>;
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="label-mono text-sm font-semibold">AI recommendation results</h2>
        <SimulatedBadge />
        <Stamp tone={lift.directionalOnly ? "warn" : "ok"}>
          {lift.directionalOnly ? "Early read" : "Enough samples"}
        </Stamp>
        <span className="font-mono text-xs text-ink/55">{group.providerId}</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Current top-five inclusion" value={rate(current.inclusionRate)} />
        <Metric label="New top-five inclusion" value={rate(next.inclusionRate)} />
        <Metric label="Shortlist lift" value={points(lift.shortlistLiftPp)} accent />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Metric label="Current top-choice rate" value={rate(current.topPickRate)} />
        <Metric label="New top-choice rate" value={rate(next.topPickRate)} />
      </div>

      <div className="rounded-xl border border-ink/15 p-4">
        <p className="label-mono mb-2 text-xs text-ink/55">Reliability</p>
        <p className="text-sm leading-6 text-ink/70">
          {lift.shortlistCiLow !== null && lift.shortlistCiHigh !== null
            ? `Shortlist-lift uncertainty range: ${points(lift.shortlistCiLow)} to ${points(lift.shortlistCiHigh)}. `
            : "The uncertainty range is not available yet. "}
          {Math.min(current.n, next.n)} valid responses across {lift.scenarioCount} shopping situations.
          Situations are weighted equally.
        </p>
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-4 ${accent ? "border-accent bg-accent/10" : "border-ink/15"}`}>
      <p className="label-mono text-xs text-ink/55">{label}</p>
      <p className="mt-2 font-mono text-2xl font-semibold text-ink">{value}</p>
    </div>
  );
}
