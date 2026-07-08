import Link from "next/link";
import { notFound } from "next/navigation";
import { SimulatedBadge } from "@/components/simulated-badge";
import { StudyWizard } from "@/components/resonance/study-wizard";
import { Button, Field, Input, Stamp } from "@/components/ui";
import { isUuid } from "@/core/id";
import { type PanelPersona, type StimulusKind } from "@/core/resonance";
import { RESONANCE_STUDY_TEMPLATES } from "@/core/resonance-templates";
import {
  getResonanceStudyResults,
  listAuditEvidenceResponses,
  listResonanceStudies,
  type ResonanceStudyResults,
} from "@/db/repositories/resonance";
import { getProjectSummary } from "@/db/repositories/runner";
import {
  createStudyFromTemplateFormAction,
  createStudyFormAction,
} from "@/modules/resonance/actions";

export const dynamic = "force-dynamic";

function excerpt(text: string) {
  return text.length > 180 ? `${text.slice(0, 180)}...` : text;
}

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

function ResponseEvidenceList({
  id,
  title,
  responses,
}: {
  id: string;
  title: string;
  responses: ResonanceStudyResults["variants"][number]["responses"];
}) {
  return (
    <section id={id} className="border-t border-ink/15 pt-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h4 className="label-mono text-xs font-semibold text-ink/70">{title}</h4>
        <SimulatedBadge />
        <Stamp tone="ink">{responses.length} responses</Stamp>
      </div>
      <div className="grid gap-3">
        {responses.map((response) => (
          <article key={response.responseId} className="rounded-lg border border-ink/10 p-3">
            <div className="mb-2 flex flex-wrap gap-2 font-mono text-[11px] text-ink/45">
              <span>{response.responseId.slice(0, 8)}</span>
              <span>{response.panelPersonaLabel}</span>
              <span>PI {formatPi(response.meanScore)}</span>
            </div>
            <p className="text-sm leading-6 text-ink/75">{response.rawText}</p>
            <div className="mt-3 grid grid-cols-5 gap-1">
              {response.pmf.map((value, idx) => (
                <div key={`${response.responseId}-${idx}`} className="min-w-0">
                  <div className="h-1.5 rounded-full bg-ink/10">
                    <div className="h-1.5 rounded-full bg-ink/70" style={{ width: pct(value) }} />
                  </div>
                  <div className="mt-1 font-mono text-[10px] text-ink/45">
                    {idx + 1}: {pct(value)}
                  </div>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ResonanceResultsPanel({ projectId, results }: { projectId: string; results: ResonanceStudyResults }) {
  return (
    <div className="mt-5 space-y-5 rounded-xl border border-ink/15 bg-paper-2/25 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="label-mono text-xs font-semibold text-ink/70">Simulation Layer results</h3>
        <SimulatedBadge />
        {results.study.genericUnconditioned && <Stamp tone="warn">GENERIC</Stamp>}
        <Stamp tone={results.run.runMode === "mock" ? "accent" : "ink"}>{results.run.runMode}</Stamp>
        <span className="font-mono text-xs text-ink/45">
          run {results.run.id.slice(0, 8)} · k={results.run.repetitions}
        </span>
        <Link
          href={`/projects/${projectId}/report?runId=${results.run.id}`}
          className="label-mono ml-auto rounded-full border border-ink/25 px-3 py-1 text-[11px] text-ink/70 hover:border-ink"
        >
          Report →
        </Link>
      </div>
      <p className="font-mono text-xs leading-5 text-ink/55">
        Mean PI and ΔPI are simulated Likert-scale survey-construct scores. They compare stimulus variants within this study; they are not forecasts of buying behavior or business outcomes.
      </p>

      <section>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h4 className="label-mono text-xs text-ink/55">Variant ranking</h4>
          <SimulatedBadge />
        </div>
        <div className="grid gap-3">
          {results.variants.map((variant, idx) => (
            <article key={variant.stimulusId} className="rounded-lg border border-ink/10 bg-paper p-3">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="label-mono text-xs text-ink/45">#{idx + 1}</span>
                <strong className="label-mono text-sm">{variant.label}</strong>
                <Stamp tone="ink">{variant.stimulusKind}</Stamp>
                {!variant.sufficientN && <Stamp tone="warn">DIRECTIONAL</Stamp>}
                <a
                  href={`#responses-${variant.stimulusId}`}
                  className="label-mono ml-auto rounded-full border border-ink/25 px-3 py-1 text-[11px] text-ink/70 hover:border-ink"
                >
                  View evidence →
                </a>
              </div>
              <div className="grid gap-3 md:grid-cols-[7rem_1fr_4rem] md:items-end">
                <div>
                  <div className="font-mono text-3xl tabular-nums">{formatPi(variant.piMean)}</div>
                  <div className="label-mono text-[11px] text-ink/45">mean PI · n={variant.n}</div>
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {variant.pmf.map((value, bucket) => (
                    <a
                      key={`${variant.stimulusId}-${bucket}`}
                      href={`#responses-${variant.stimulusId}`}
                      className="group min-w-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      <div className="flex h-20 items-end rounded-sm bg-ink/10">
                        <div
                          className="w-full rounded-sm bg-ink/70 transition-micro group-hover:bg-accent"
                          style={{ height: pct(value) }}
                        />
                      </div>
                      <div className="mt-1 text-center font-mono text-[10px] text-ink/50">
                        {bucket + 1} · {pct(value)}
                      </div>
                    </a>
                  ))}
                </div>
                <div className="text-right font-mono text-xs text-ink/45">Likert 1-5 PMF</div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {results.deltas.length > 0 && (
        <section>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h4 className="label-mono text-xs text-ink/55">Delta vs baseline</h4>
            <SimulatedBadge />
          </div>
          <div className="overflow-x-auto rounded-lg border border-ink/10 bg-paper">
            <table className="w-full border-collapse font-mono text-xs">
              <thead className="bg-paper-2 text-left text-ink/55">
                <tr>
                  <th className="px-3 py-2 font-medium">Variant</th>
                  <th className="px-3 py-2 font-medium">Baseline</th>
                  <th className="px-3 py-2 text-right font-medium">ΔPI</th>
                  <th className="px-3 py-2 text-right font-medium">n</th>
                  <th className="px-3 py-2 font-medium">Gate</th>
                </tr>
              </thead>
              <tbody>
                {results.deltas.map((delta) => (
                  <tr key={delta.stimulusId} className="border-t border-ink/10">
                    <td className="px-3 py-2">{delta.label}</td>
                    <td className="px-3 py-2 text-ink/55">{delta.baselineLabel}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatDelta(delta.deltaPiMean)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{delta.n}</td>
                    <td className="px-3 py-2">
                      {delta.directionalOnly ? <Stamp tone="warn">DIRECTIONAL</Stamp> : <Stamp tone="ok">AGGREGATE</Stamp>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {results.personaRows.length > 0 && (
        <section>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h4 className="label-mono text-xs text-ink/55">Segment slices</h4>
            <SimulatedBadge />
          </div>
          <div className="overflow-x-auto rounded-lg border border-ink/10 bg-paper">
            <table className="w-full border-collapse font-mono text-xs">
              <thead className="bg-paper-2 text-left text-ink/55">
                <tr>
                  <th className="px-3 py-2 font-medium">Persona</th>
                  <th className="px-3 py-2 font-medium">Variant</th>
                  <th className="px-3 py-2 text-right font-medium">Mean PI</th>
                  <th className="px-3 py-2 text-right font-medium">n</th>
                  <th className="px-3 py-2 font-medium">Evidence</th>
                </tr>
              </thead>
              <tbody>
                {results.personaRows.map((row) => (
                  <tr key={row.key} className="border-t border-ink/10">
                    <td className="px-3 py-2">{row.panelPersonaLabel}</td>
                    <td className="px-3 py-2 text-ink/65">{row.stimulusLabel}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatPi(row.piMean)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.n}</td>
                    <td className="px-3 py-2">
                      <a className="text-ink/70 underline-offset-2 hover:underline" href={`#responses-${row.key}`}>
                        responses
                      </a>{" "}
                      {row.directionalOnly ? <Stamp tone="warn">DIRECTIONAL</Stamp> : <Stamp tone="ok">AGGREGATE</Stamp>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h4 className="label-mono text-xs text-ink/55">Deterministic excerpt panels</h4>
          <SimulatedBadge />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {results.variants.map((variant) => {
            const sorted = [...variant.responses].sort(
              (a, b) => a.meanScore - b.meanScore || a.responseId.localeCompare(b.responseId),
            );
            const lowest = sorted[0];
            const highest = sorted[sorted.length - 1];
            return (
              <article key={`excerpt-${variant.stimulusId}`} className="rounded-lg border border-ink/10 bg-paper p-3">
                <div className="label-mono mb-2 text-xs text-ink/60">{variant.label}</div>
                <p className="text-sm leading-6 text-ink/70">
                  <span className="font-mono text-xs text-ink/45">LOW </span>
                  {lowest ? excerpt(lowest.rawText) : "No eligible response."}
                </p>
                <p className="mt-3 text-sm leading-6 text-ink/70">
                  <span className="font-mono text-xs text-ink/45">HIGH </span>
                  {highest ? excerpt(highest.rawText) : "No eligible response."}
                </p>
              </article>
            );
          })}
        </div>
      </section>

      <div className="space-y-5">
        {results.variants.map((variant) => (
          <ResponseEvidenceList
            key={`responses-${variant.stimulusId}`}
            id={`responses-${variant.stimulusId}`}
            title={`${variant.label} evidence`}
            responses={variant.responses}
          />
        ))}
        {results.personaRows.map((row) => (
          <ResponseEvidenceList
            key={`responses-${row.key}`}
            id={`responses-${row.key}`}
            title={`${row.panelPersonaLabel} · ${row.stimulusLabel}`}
            responses={row.responses}
          />
        ))}
      </div>
    </div>
  );
}

export default async function ResonancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [project, studies, evidence] = await Promise.all([
    getProjectSummary(id),
    listResonanceStudies(id),
    listAuditEvidenceResponses(id),
  ]);
  if (project === null) notFound();
  const resultEntries = await Promise.all(
    studies.map(async ({ study }) => [study.id, await getResonanceStudyResults(id, study.id, undefined, { refreshMetrics: true })] as const),
  );
  const resultsByStudy = new Map(resultEntries);

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-1 font-mono text-xs text-ink/45">
        <Link href="/projects" className="hover:text-ink">
          Projects
        </Link>{" "}
        /{" "}
        <Link href={`/projects/${id}/matrix`} className="hover:text-ink">
          {project.name}
        </Link>{" "}
        / Simulation
      </div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="label-mono text-lg font-semibold">Simulation Studies</h1>
        <SimulatedBadge />
      </div>

      <form action={createStudyFormAction.bind(null, id)} className="mb-6 flex gap-3 rounded-xl border border-ink/15 p-4">
        <Field label="New study name">
          <Input name="name" placeholder="AI-framing repair study" />
        </Field>
        <div className="flex items-end">
          <Button type="submit">Create</Button>
        </div>
      </form>

      <section className="mb-6 rounded-xl border border-ink/15 bg-paper-2/25 p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="label-mono text-sm font-semibold">Start from template</h2>
          <SimulatedBadge />
          <Stamp tone="ink">VALUE ADD</Stamp>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {RESONANCE_STUDY_TEMPLATES.map((template) => (
            <form
              key={template.id}
              action={createStudyFromTemplateFormAction.bind(null, id)}
              className="rounded-lg border border-ink/10 bg-paper p-3"
            >
              <input type="hidden" name="templateId" value={template.id} />
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <h3 className="label-mono text-xs font-semibold text-ink/75">{template.name}</h3>
                {template.default && <Stamp tone="accent">DEFAULT</Stamp>}
              </div>
              <p className="text-sm leading-6 text-ink/70">{template.summary}</p>
              <p className="mt-2 font-mono text-xs leading-5 text-ink/45">{template.guidance}</p>
              <div className="mt-3 flex flex-wrap gap-1">
                {template.stimuli.map((stimulus) => (
                  <Stamp key={`${template.id}-${stimulus.label}`} tone="ink">
                    {stimulus.kind}
                  </Stamp>
                ))}
              </div>
              <div className="mt-3">
                <Button type="submit" variant={template.default ? "primary" : "secondary"}>
                  Create draft
                </Button>
              </div>
            </form>
          ))}
        </div>
      </section>

      {studies.length === 0 ? (
        <section className="rounded-xl border border-ink/15 bg-paper-2/30 p-8 text-center">
          <p className="label-mono text-sm text-ink/60">No Simulation studies yet</p>
          <p className="mt-1 font-mono text-xs text-ink/45">
            create a study, add panel personas and stimulus variants, then compile it into a simulated run matrix
          </p>
        </section>
      ) : (
        <div className="flex flex-col gap-6">
          {studies.map(({ study, stimuli, matrixVersion }) => {
            const personas = study.panelPersonasJson as PanelPersona[];
            const isDraft = study.state === "draft";
            const results = resultsByStudy.get(study.id) ?? null;
            const personaRows = personas.map(
              ({ label, ageBand, incomeBand, locationContext, behavioralProfile }) => ({
                label,
                ageBand,
                incomeBand,
                locationContext,
                behavioralProfile,
              }),
            );
            const evidenceOptions = evidence.map((row) => ({ id: row.id, excerpt: excerpt(row.rawText) }));
            const wizardStimuli = stimuli.map((s) => ({
              id: s.id,
              kind: s.kind as StimulusKind,
              label: s.label,
              body: s.body,
              evidenceResponseIdsJson: (s.evidenceResponseIdsJson as string[] | null) ?? null,
            }));
            return (
              <section key={study.id} className="border-t border-ink/15 py-5">
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <h2 className="label-mono text-sm font-semibold">{study.name}</h2>
                  <Stamp tone={study.state === "approved" ? "ok" : "ink"}>{study.state}</Stamp>
                  {study.genericUnconditioned && <Stamp tone="warn">GENERIC</Stamp>}
                  {matrixVersion && (
                    <span className="font-mono text-xs text-ink/45">
                      matrix v{matrixVersion.version} · {matrixVersion.cellCount} cells
                    </span>
                  )}
                  {matrixVersion && (
                    <Link
                      href={`/projects/${id}/runs/new?matrixVersionId=${matrixVersion.id}`}
                      className="label-mono ml-auto rounded-full bg-accent px-4 py-1.5 text-xs text-paper transition-micro hover:bg-accent/90"
                    >
                      Start simulated run →
                    </Link>
                  )}
                </div>

                {results && <ResonanceResultsPanel projectId={id} results={results} />}

                {isDraft && (
                  <StudyWizard
                    projectId={id}
                    study={{ id: study.id, name: study.name, genericUnconditioned: study.genericUnconditioned }}
                    initialPersonas={personaRows}
                    stimuli={wizardStimuli}
                    evidenceOptions={evidenceOptions}
                  />
                )}
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
