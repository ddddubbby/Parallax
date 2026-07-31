import Link from "next/link";
import { SimulatedBadge } from "@/components/simulated-badge";
import { RunModeStamp } from "@/components/run-mode-stamp";
import { BaselineProvenance } from "@/components/resonance/baseline-provenance";
import { Stamp } from "@/components/ui";
import type { StudyResultSection } from "@/core/views";
import { withViewParam } from "@/core/views";
import type {
  ResonanceProviderSummaryGroup,
  ResonanceStudyResultSummary,
} from "@/db/repositories/resonance";

function formatPi(value: number) {
  return value.toFixed(2);
}

function formatDelta(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}`;
}

function pct(value: number) {
  return `${Math.round(value * 100)}%`;
}

function EngineSectionNav({
  basePath,
  engine,
  section,
}: {
  basePath: string;
  engine: string;
  section: StudyResultSection;
}) {
  const sections: Array<{ id: StudyResultSection; label: string }> = [
    { id: "ranking", label: "Scores" },
    { id: "deltas", label: "Lift" },
    { id: "segments", label: "Buyer profiles" },
    { id: "excerpts", label: "Responses" },
  ];
  return (
    <nav className="mb-4 flex gap-1 overflow-x-auto pb-1" aria-label="Results subsections">
      {sections.map((s) => {
        const active = s.id === section;
        return (
          <Link
            key={s.id}
            href={withViewParam(basePath, "results", { engine, section: s.id })}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "label-mono inline-flex min-h-11 shrink-0 items-center rounded-full bg-ink px-3 py-2 text-xs text-paper"
                : "label-mono inline-flex min-h-11 shrink-0 items-center rounded-full border border-ink/15 px-3 py-2 text-xs text-ink/65 hover:border-ink hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            }
          >
            {s.label}
          </Link>
        );
      })}
    </nav>
  );
}

function RankingSection({ group }: { group: ResonanceProviderSummaryGroup }) {
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h4 className="label-mono text-xs text-ink/65">Message scores</h4>
        <SimulatedBadge />
      </div>
      <div className="grid gap-3">
        {group.variants.map((variant) => (
          <article key={variant.stimulusId} className="rounded-lg border border-ink/10 bg-paper p-3">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <strong className="label-mono text-sm">{variant.label}</strong>
              <Stamp tone={variant.sufficientN ? "ok" : "warn"}>{variant.sufficientN ? "Enough samples" : "Early read"}</Stamp>
            </div>
            <div className="grid gap-3 md:grid-cols-[7rem_1fr_4rem] md:items-end">
              <div>
                <div className="font-mono text-3xl tabular-nums">{formatPi(variant.piMean)}</div>
                <div className="label-mono text-xs text-ink/65">buyer response score · {variant.n} responses</div>
              </div>
              <div
                className="grid grid-cols-5 gap-2"
                role="img"
                aria-label={`${variant.label} Likert distribution: ${variant.pmf.map((value, bucket) => `${bucket + 1} ${pct(value)}`).join(", ")}`}
              >
                {variant.pmf.map((value, bucket) => (
                  <div key={`${variant.stimulusId}-${bucket}`} className="min-w-0">
                    <div className="flex h-20 items-end rounded-sm bg-ink/10">
                      <div className="w-full rounded-sm bg-ink/70" style={{ height: pct(value) }} />
                    </div>
                    <div className="mt-1 text-center font-mono text-xs text-ink/65">
                      {bucket + 1} · {pct(value)}
                    </div>
                  </div>
                ))}
              </div>
              <div className="text-right font-mono text-xs text-ink/65">1–5 response distribution</div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function DeltasSection({ group }: { group: ResonanceProviderSummaryGroup }) {
  if (group.deltas.length === 0) {
    return <p className="text-sm text-ink/65">No delta rows for this engine.</p>;
  }
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h4 className="label-mono text-xs text-ink/65">Response lift</h4>
        <SimulatedBadge />
      </div>
      <div className="overflow-x-auto rounded-lg border border-ink/10 bg-paper" role="region" aria-label="Simulation deltas table" tabIndex={0}>
        <table className="w-full border-collapse font-mono text-xs">
          <thead className="bg-paper-2 text-left text-ink/65">
            <tr>
              <th className="px-3 py-2 font-medium">New message</th>
              <th className="px-3 py-2 font-medium">Current message</th>
              <th className="px-3 py-2 text-right font-medium">Response lift</th>
              <th className="px-3 py-2 text-right font-medium">n</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {group.deltas.map((delta) => (
              <tr key={delta.stimulusId} className="border-t border-ink/10">
                <td className="px-3 py-2">{delta.label}</td>
                <td className="px-3 py-2 text-ink/65">{delta.baselineLabel}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatDelta(delta.deltaPiMean)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{delta.n}</td>
                <td className="px-3 py-2">
                  {delta.directionalOnly ? <Stamp tone="warn">Early read</Stamp> : <Stamp tone="ok">Enough samples</Stamp>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SegmentsSection({ group }: { group: ResonanceProviderSummaryGroup }) {
  if (group.personaRows.length === 0) {
    return <p className="text-sm text-ink/65">No segment slices for this engine.</p>;
  }
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h4 className="label-mono text-xs text-ink/65">Buyer-profile breakdown</h4>
        <SimulatedBadge />
      </div>
      <div className="overflow-x-auto rounded-lg border border-ink/10 bg-paper" role="region" aria-label="Simulation segment table" tabIndex={0}>
        <table className="w-full border-collapse font-mono text-xs">
          <thead className="bg-paper-2 text-left text-ink/65">
            <tr>
              <th className="px-3 py-2 font-medium">Buyer profile</th>
              <th className="px-3 py-2 font-medium">Message</th>
              <th className="px-3 py-2 text-right font-medium">Buyer response score</th>
              <th className="px-3 py-2 text-right font-medium">n</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {group.personaRows.map((row) => (
              <tr key={row.key} className="border-t border-ink/10">
                <td className="px-3 py-2">{row.panelPersonaLabel}</td>
                <td className="px-3 py-2 text-ink/65">{row.stimulusLabel}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatPi(row.piMean)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{row.n}</td>
                <td className="px-3 py-2">
                  <Stamp tone="warn">Profile detail</Stamp>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ExcerptsSection({ group }: { group: ResonanceProviderSummaryGroup }) {
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h4 className="label-mono text-xs text-ink/65">Response examples</h4>
        <SimulatedBadge />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {group.variants.map((variant) => (
          <article key={`excerpt-${variant.stimulusId}`} className="rounded-lg border border-ink/10 bg-paper p-3">
            <div className="label-mono mb-2 text-xs text-ink/60">{variant.label}</div>
            <p className="text-sm leading-6 text-ink/70">
              <span className="font-mono text-xs text-ink/65">LOW </span>
              {variant.lowExcerpt ?? "No eligible response."}
            </p>
            <p className="mt-3 text-sm leading-6 text-ink/70">
              <span className="font-mono text-xs text-ink/65">HIGH </span>
              {variant.highExcerpt ?? "No eligible response."}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

/** M32 / D-088: one engine + one results subsection at a time. */
export function StudyResultsPanel({
  projectId,
  studyId,
  results,
  engine,
  section,
}: {
  projectId: string;
  studyId: string;
  results: ResonanceStudyResultSummary;
  engine: string;
  section: StudyResultSection;
}) {
  const basePath = `/projects/${projectId}/resonance/${studyId}`;
  const group = results.providerGroups.find((g) => g.providerId === engine) ?? results.providerGroups[0];
  if (!group) {
    return <p className="text-sm text-ink/65">No provider results for this study run.</p>;
  }

  return (
    <div className="space-y-5 rounded-xl border border-ink/15 bg-paper-2/25 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="label-mono text-xs font-semibold text-ink/70">Buyer response results</h3>
        <SimulatedBadge />
        {results.study.genericUnconditioned && <Stamp tone="warn">GENERIC</Stamp>}
        <RunModeStamp runMode={results.run.runMode} />
        <span className="font-mono text-xs text-ink/65">
          run {results.run.id.slice(0, 8)} · {results.study.panelCount * results.run.repetitions} responses per message
        </span>
        <Link
          href={`/projects/${projectId}/report?runId=${results.run.id}`}
          className="label-mono ml-auto inline-flex min-h-11 items-center rounded-full border border-ink/25 px-3 py-2 text-xs text-ink/70 hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Report →
        </Link>
      </div>
      <BaselineProvenance provenance={results.study.baselineProvenance} />
      <p className="text-sm leading-6 text-ink/70">
        The buyer response score uses a simulated 1–5 scale. Response lift is the New score minus
        the Current score. It is a controlled comparison, not a forecast of buying behavior, sales,
        or business outcomes.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <span className="label-mono text-xs text-ink/65">AI model</span>
        {results.providers.map((providerId) => {
          const active = providerId === group.providerId;
          return (
            <Link
              key={providerId}
              href={withViewParam(basePath, "results", { engine: providerId, section })}
              className={
                active
                  ? "label-mono inline-flex min-h-11 items-center rounded-full bg-ink px-3 py-2 text-xs text-paper"
                  : "label-mono inline-flex min-h-11 items-center rounded-full border border-ink/15 px-3 py-2 text-xs text-ink/65 hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              }
            >
              {providerId}
            </Link>
          );
        })}
        <SimulatedBadge />
      </div>

      <EngineSectionNav basePath={basePath} engine={group.providerId} section={section} />

      {section === "ranking" && <RankingSection group={group} />}
      {section === "deltas" && <DeltasSection group={group} />}
      {section === "segments" && <SegmentsSection group={group} />}
      {section === "excerpts" && <ExcerptsSection group={group} />}
    </div>
  );
}
