import Link from "next/link";
import { notFound } from "next/navigation";
import { LocalViewTabs } from "@/components/local-view-tabs";
import { EvidenceFilters } from "@/components/resonance/evidence-filters";
import { StudyResultsPanel } from "@/components/resonance/study-results-panel";
import { StudyWizard } from "@/components/resonance/study-wizard";
import { BaselineProvenance } from "@/components/resonance/baseline-provenance";
import { SimulatedBadge } from "@/components/simulated-badge";
import { Stamp } from "@/components/ui";
import { isUuid } from "@/core/id";
import { type PanelPersona, type StimulusKind } from "@/core/resonance";
import {
  parseStudyResultSection,
  parseStudyView,
  withViewParam,
  type StudyView,
} from "@/core/views";
import {
  getResonanceStudy,
  getResonanceStudyResultSummary,
  listAuditEvidenceResponses,
  listResonanceEvidencePage,
} from "@/db/repositories/resonance";
import { getProjectSummary } from "@/db/repositories/runner";
import { listFramingEvidenceSnapshots } from "@/db/repositories/framing";

export const dynamic = "force-dynamic";

function excerpt(text: string) {
  return text.length > 180 ? `${text.slice(0, 180)}...` : text;
}

function pct(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatPi(value: number) {
  return value.toFixed(2);
}

function nextAction(input: {
  projectId: string;
  studyId: string;
  state: string;
  matrixVersionId: string | null;
  latestRun: { id: string; state: string } | null;
  hasResults: boolean;
}): { label: string; href: string } {
  const base = `/projects/${input.projectId}/resonance/${input.studyId}`;
  if (input.state === "draft" || !input.matrixVersionId) {
    return { label: "Continue design", href: withViewParam(base, "design") };
  }
  if (!input.latestRun) {
    return {
      label: "Configure simulation run",
      href: `/projects/${input.projectId}/runs/new?matrixVersionId=${input.matrixVersionId}`,
    };
  }
  if (input.latestRun.state !== "completed") {
    return {
      label: "Watch run",
      href: `/projects/${input.projectId}/runs/${input.latestRun.id}`,
    };
  }
  if (input.hasResults) {
    return { label: "View results", href: withViewParam(base, "results") };
  }
  return {
    label: "Configure simulation run",
    href: `/projects/${input.projectId}/runs/new?matrixVersionId=${input.matrixVersionId}`,
  };
}

function LockedDefinition({
  studyName,
  personas,
  stimuli,
  genericUnconditioned,
  baselineProvenance,
}: {
  studyName: string;
  personas: PanelPersona[];
  stimuli: Array<{ id: string; kind: string; label: string; body: string }>;
  genericUnconditioned: boolean;
  baselineProvenance: import("@/core/resonance").ResonanceBaselineProvenance;
}) {
  return (
    <div className="space-y-5 rounded-xl border border-ink/15 bg-paper-2/25 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="label-mono text-sm font-semibold">Approved definition</h2>
        <Stamp tone="ok">locked</Stamp>
        <SimulatedBadge />
        {genericUnconditioned && <Stamp tone="warn">GENERIC</Stamp>}
      </div>
      <p className="font-mono text-xs text-ink/55">
        Approved studies are immutable (C-13). Create a new study to change the panel or framings.
      </p>
      <BaselineProvenance provenance={baselineProvenance} />
      <div>
        <h3 className="label-mono mb-2 text-xs text-ink/55">Study</h3>
        <p className="text-sm text-ink/80">{studyName}</p>
      </div>
      <div>
        <h3 className="label-mono mb-2 text-xs text-ink/55">Buyer panel ({personas.length})</h3>
        <ul className="grid gap-2">
          {personas.map((p) => (
            <li key={p.key} className="rounded-lg border border-ink/10 bg-paper px-3 py-2 font-mono text-xs text-ink/70">
              {p.label} · {p.ageBand} · {p.incomeBand} · {p.locationContext}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="label-mono mb-2 text-xs text-ink/55">Framings ({stimuli.length})</h3>
        <ul className="grid gap-3">
          {stimuli.map((s) => (
            <li key={s.id} className="rounded-lg border border-ink/10 bg-paper p-3">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <strong className="label-mono text-xs">{s.label}</strong>
                <Stamp tone="ink">{s.kind}</Stamp>
              </div>
              <p className="text-sm leading-6 text-ink/70">{s.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * M32 / D-088: study workspace — overview | design | runs | results | evidence.
 * Validates study belongs to project. Results select one engine at a time.
 */
export default async function ResonanceStudyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; studyId: string }>;
  searchParams: Promise<{
    view?: string;
    engine?: string;
    section?: string;
    page?: string;
    stimulus?: string;
    persona?: string;
  }>;
}) {
  const { id, studyId } = await params;
  const sp = await searchParams;
  if (!isUuid(id) || !isUuid(studyId)) notFound();

  const view = parseStudyView(sp.view);
  const section = parseStudyResultSection(sp.section);
  const evidencePage = Math.max(Number.parseInt(sp.page ?? "1", 10) || 1, 1);

  const [project, detail] = await Promise.all([getProjectSummary(id), getResonanceStudy(id, studyId)]);
  if (project === null || detail === null) notFound();

  const { study, stimuli, matrixVersion, latestRun, studyRuns, baselineProvenance } = detail;
  const personas = study.panelPersonasJson as PanelPersona[];
  const isDraft = study.state === "draft";
  const base = `/projects/${id}/resonance/${studyId}`;

  const needsResults = view === "results" || view === "overview" || view === "evidence";
  const [results, evidenceOptions, snapshotOptions, evidencePageData] = await Promise.all([
    needsResults
      ? getResonanceStudyResultSummary(id, studyId, undefined, { refreshMetrics: view === "results" })
      : Promise.resolve(null),
    view === "design" && isDraft ? listAuditEvidenceResponses(id) : Promise.resolve([]),
    view === "design" && isDraft && project.categoryArchetype !== "b2b"
      ? listFramingEvidenceSnapshots(id)
      : Promise.resolve([]),
    view === "evidence"
      ? listResonanceEvidencePage({
          projectId: id,
          studyId,
          providerId: sp.engine,
          stimulusId: sp.stimulus,
          panelPersonaKey: sp.persona,
          page: evidencePage,
          pageSize: 25,
        })
      : Promise.resolve(null),
  ]);

  const engine =
    sp.engine && results?.providers.includes(sp.engine)
      ? sp.engine
      : (results?.providers[0] ?? sp.engine ?? "");

  const action = nextAction({
    projectId: id,
    studyId,
    state: study.state,
    matrixVersionId: matrixVersion?.id ?? null,
    latestRun,
    hasResults: results !== null,
  });

  const tabs: Array<{ id: StudyView; label: string; href: string }> = [
    { id: "overview", label: "Overview", href: withViewParam(base, "overview") },
    { id: "design", label: "Design", href: withViewParam(base, "design") },
    { id: "runs", label: "Runs", href: withViewParam(base, "runs") },
    { id: "results", label: "Results", href: withViewParam(base, "results", engine ? { engine } : undefined) },
    {
      id: "evidence",
      label: "Evidence",
      href: withViewParam(base, "evidence", engine ? { engine } : undefined),
    },
  ];

  const wizardStimuli = stimuli.map((s) => ({
    id: s.id,
    kind: s.kind as StimulusKind,
    label: s.label,
    body: s.body,
    evidenceResponseIdsJson: (s.evidenceResponseIdsJson as string[] | null) ?? null,
    framingEvidenceSnapshotId: s.framingEvidenceSnapshotId,
  }));
  const personaRows = personas.map(
    ({ label, ageBand, incomeBand, locationContext, behavioralProfile }) => ({
      label,
      ageBand,
      incomeBand,
      locationContext,
      behavioralProfile,
    }),
  );

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-1 font-mono text-xs text-ink/45">
        <Link href="/projects" className="hover:text-ink">
          Projects
        </Link>{" "}
        /{" "}
        <Link href={`/projects/${id}`} className="hover:text-ink">
          {project.name}
        </Link>{" "}
        /{" "}
        <Link href={`/projects/${id}/resonance`} className="hover:text-ink">
          Simulation studies
        </Link>{" "}
        / {study.name}
      </div>

      <div className="mb-4 mt-4 flex flex-wrap items-center gap-2">
        <h1 className="label-mono text-lg font-semibold">{study.name}</h1>
        <Stamp tone={study.state === "approved" ? "ok" : "ink"}>{study.state}</Stamp>
        <SimulatedBadge />
        {study.genericUnconditioned && <Stamp tone="warn">GENERIC</Stamp>}
      </div>

      <LocalViewTabs tabs={tabs} activeId={view} label="Study sections" />

      {view === "overview" && (
        <section className="space-y-4 rounded-xl border border-ink/15 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="label-mono text-sm font-semibold">Status</h2>
            <Stamp tone={study.state === "approved" ? "ok" : "ink"}>{study.state}</Stamp>
            {latestRun && <Stamp tone="ink">{latestRun.state}</Stamp>}
            {latestRun && (
              <Stamp tone={latestRun.runMode === "mock" ? "accent" : "ink"}>{latestRun.runMode}</Stamp>
            )}
          </div>
          <p className="font-mono text-xs leading-5 text-ink/55">
            {personas.length} buyer persona{personas.length === 1 ? "" : "s"} · {stimuli.length} framing
            {stimuli.length === 1 ? "" : "s"}
            {matrixVersion ? ` · matrix v${matrixVersion.version} (${matrixVersion.cellCount} cells)` : ""}
          </p>
          <BaselineProvenance provenance={baselineProvenance} />
          <div>
            <p className="label-mono mb-2 text-xs text-ink/55">Next action</p>
            <Link
              href={action.href}
              className="label-mono inline-block rounded-full bg-accent px-4 py-1.5 text-xs text-paper transition-micro hover:bg-accent/90"
            >
              {action.label} →
            </Link>
          </div>
        </section>
      )}

      {view === "design" &&
        (isDraft ? (
          <StudyWizard
            projectId={id}
            study={{ id: study.id, name: study.name }}
            initialPersonas={personaRows}
            stimuli={wizardStimuli}
            evidenceOptions={evidenceOptions.map((row) => ({
              id: row.id,
              excerpt: excerpt(row.rawText),
            }))}
            snapshotOptions={snapshotOptions.map((snapshot) => ({
              id: snapshot.id,
              label: snapshot.payload.recurrence.label,
              associationId: snapshot.payload.associationId,
              excerpt: excerpt(snapshot.payload.evidence.text),
              verbatimResponse: snapshot.payload.verbatimResponse,
            }))}
            requiresFramingSnapshot={project.categoryArchetype !== "b2b"}
          />
        ) : (
          <LockedDefinition
            studyName={study.name}
            personas={personas}
            stimuli={stimuli.map((s) => ({
              id: s.id,
              kind: s.kind,
              label: s.label,
              body: s.body,
            }))}
            genericUnconditioned={study.genericUnconditioned}
            baselineProvenance={baselineProvenance}
          />
        ))}

      {view === "runs" && (
        <section className="space-y-4">
          {matrixVersion && (
            <Link
              href={`/projects/${id}/runs/new?matrixVersionId=${matrixVersion.id}`}
              className="label-mono inline-block rounded-full bg-accent px-4 py-1.5 text-xs text-paper transition-micro hover:bg-accent/90"
            >
              Configure simulation run →
            </Link>
          )}
          {!matrixVersion && (
            <p className="font-mono text-xs text-ink/55">
              Approve the study before configuring a simulation run.
            </p>
          )}
          {studyRuns.length === 0 ? (
            <p className="font-mono text-xs text-ink/45">No runs for this study yet.</p>
          ) : (
            <ul className="grid gap-2">
              {studyRuns.map((run) => (
                <li key={run.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-ink/10 px-3 py-2">
                  <SimulatedBadge />
                  <Stamp tone="ink">{run.state}</Stamp>
                  <Stamp tone={run.runMode === "mock" ? "accent" : "ink"}>{run.runMode}</Stamp>
                  <span className="font-mono text-xs text-ink/50">{run.id.slice(0, 8)}</span>
                  <Link
                    href={`/projects/${id}/runs/${run.id}`}
                    className="label-mono ml-auto text-xs text-accent-ink hover:text-accent"
                  >
                    Open →
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {view === "results" &&
        (results ? (
          <StudyResultsPanel
            projectId={id}
            studyId={studyId}
            results={results}
            engine={engine || results.providers[0] || ""}
            section={section}
          />
        ) : (
          <p className="font-mono text-xs text-ink/45">
            No completed simulation results yet.{" "}
            {matrixVersion ? (
              <Link
                href={`/projects/${id}/runs/new?matrixVersionId=${matrixVersion.id}`}
                className="text-accent-ink hover:text-accent"
              >
                Configure a run →
              </Link>
            ) : (
              "Approve the study first."
            )}
          </p>
        ))}

      {view === "evidence" && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="label-mono text-sm font-semibold">Evidence</h2>
            <SimulatedBadge />
            {results && results.providers.length > 0 && (
              <>
                <span className="label-mono text-xs text-ink/55">Engine</span>
                {results.providers.map((providerId) => {
                  const active = providerId === (engine || results.providers[0]);
                  return (
                    <Link
                      key={providerId}
                      href={withViewParam(base, "evidence", {
                        engine: providerId,
                        stimulus: sp.stimulus,
                        persona: sp.persona,
                      })}
                      className={
                        active
                          ? "label-mono rounded-full bg-ink px-3 py-1 text-[11px] text-paper"
                          : "label-mono rounded-full border border-ink/15 px-3 py-1 text-[11px] text-ink/60 hover:border-ink"
                      }
                    >
                      {providerId}
                    </Link>
                  );
                })}
              </>
            )}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <EvidenceFilters
              base={base}
              engine={engine || undefined}
              stimulus={sp.stimulus}
              persona={sp.persona}
              stimuli={stimuli.map((s) => ({ id: s.id, label: s.label }))}
              personas={personas.map((p) => ({ key: p.key, label: p.label }))}
            />
          </div>
          {!evidencePageData || evidencePageData.total === 0 ? (
            <p className="font-mono text-xs text-ink/45">No evidence responses for this filter yet.</p>
          ) : (
            <>
              <p className="font-mono text-xs text-ink/50">
                {evidencePageData.total} response{evidencePageData.total === 1 ? "" : "s"} · page{" "}
                {evidencePageData.page}
                {evidencePageData.totalPages > 0 ? ` of ${evidencePageData.totalPages}` : ""}
              </p>
              <div className="grid gap-3">
                {evidencePageData.items.map((response) => (
                  <article key={response.responseId} className="rounded-lg border border-ink/10 p-3">
                    <div className="mb-2 flex flex-wrap gap-2 font-mono text-[11px] text-ink/45">
                      <span>{response.responseId.slice(0, 8)}</span>
                      <span>{response.stimulusLabel}</span>
                      <span>{response.panelPersonaLabel}</span>
                      <span>PI {formatPi(response.meanScore)}</span>
                      <SimulatedBadge />
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
              {evidencePageData.totalPages > 1 && (
                <div className="flex flex-wrap gap-2">
                  {evidencePageData.page > 1 && (
                    <Link
                      href={withViewParam(base, "evidence", {
                        engine: engine || undefined,
                        stimulus: sp.stimulus,
                        persona: sp.persona,
                        page: String(evidencePageData.page - 1),
                      })}
                      className="label-mono rounded-full border border-ink/25 px-3 py-1 text-[11px] text-ink/70 hover:border-ink"
                    >
                      ← Prev
                    </Link>
                  )}
                  {evidencePageData.page < evidencePageData.totalPages && (
                    <Link
                      href={withViewParam(base, "evidence", {
                        engine: engine || undefined,
                        stimulus: sp.stimulus,
                        persona: sp.persona,
                        page: String(evidencePageData.page + 1),
                      })}
                      className="label-mono rounded-full border border-ink/25 px-3 py-1 text-[11px] text-ink/70 hover:border-ink"
                    >
                      Next →
                    </Link>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      )}
    </main>
  );
}
