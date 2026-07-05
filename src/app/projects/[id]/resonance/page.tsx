import Link from "next/link";
import { notFound } from "next/navigation";
import { SimulatedBadge } from "@/components/simulated-badge";
import { Button, Field, Input, Select, Stamp, Textarea } from "@/components/ui";
import { formatPanelPersonaLines, STIMULUS_KINDS, type PanelPersona } from "@/core/resonance";
import { listAuditEvidenceResponses, listResonanceStudies } from "@/db/repositories/resonance";
import { getProjectSummary } from "@/db/repositories/runner";
import {
  addStimulusFormAction,
  approveStudyFormAction,
  createStudyFormAction,
  deleteStimulusAction,
  updateStimulusFormAction,
  updateStudyFormAction,
} from "@/modules/resonance/actions";

export const dynamic = "force-dynamic";

function excerpt(text: string) {
  return text.length > 180 ? `${text.slice(0, 180)}...` : text;
}

export default async function ResonancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [project, studies, evidence] = await Promise.all([
    getProjectSummary(id),
    listResonanceStudies(id),
    listAuditEvidenceResponses(id),
  ]);
  if (project === null) notFound();

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
        / Resonance
      </div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="label-mono text-lg font-semibold">Resonance Studies</h1>
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

      {studies.length === 0 ? (
        <section className="rounded-xl border border-ink/15 bg-paper-2/30 p-8 text-center">
          <p className="label-mono text-sm text-ink/60">No Resonance studies yet</p>
          <p className="mt-1 font-mono text-xs text-ink/45">
            create a study, add panel personas and stimulus variants, then compile it into a simulated run matrix
          </p>
        </section>
      ) : (
        <div className="flex flex-col gap-6">
          {studies.map(({ study, stimuli, matrixVersion }) => {
            const personas = study.panelPersonasJson as PanelPersona[];
            const isDraft = study.state === "draft";
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

                <form action={updateStudyFormAction.bind(null, id, study.id)} className="mb-5 grid gap-4 md:grid-cols-[1fr_1.5fr]">
                  <Field label="Study name">
                    <Input name="name" defaultValue={study.name} disabled={!isDraft} />
                  </Field>
                  <Field
                    label="Panel personas"
                    hint="One per line: label | age band | income band | location context | behavioral profile"
                  >
                    <Textarea
                      name="panelPersonas"
                      defaultValue={formatPanelPersonaLines(personas)}
                      disabled={!isDraft}
                      rows={4}
                    />
                  </Field>
                  <label className="label-mono flex items-center gap-2 text-xs text-ink/70">
                    <input
                      name="genericUnconditioned"
                      type="checkbox"
                      defaultChecked={study.genericUnconditioned}
                      disabled={!isDraft}
                    />
                    allow GENERIC unconditioned study
                  </label>
                  {isDraft && (
                    <div className="flex items-end justify-end">
                      <Button type="submit" variant="secondary">Save study</Button>
                    </div>
                  )}
                </form>

                {study.genericUnconditioned && (
                  <p className="mb-4 rounded-lg border border-warn px-3 py-2 font-mono text-xs text-warn">
                    GENERIC studies are not conditioned on stored AI-channel evidence and must remain labeled as simulated proxy output (C-13).
                  </p>
                )}

                <div className="mb-4 grid gap-3">
                  {stimuli.map((stimulus) => {
                    const selected = new Set((stimulus.evidenceResponseIdsJson as string[]) ?? []);
                    return (
                      <form
                        key={stimulus.id}
                        action={updateStimulusFormAction.bind(null, id, study.id, stimulus.id)}
                        className="rounded-lg border border-ink/10 p-4"
                      >
                        <div className="mb-3 grid gap-3 md:grid-cols-[10rem_1fr]">
                          <Field label="Kind">
                            <Select name="kind" defaultValue={stimulus.kind} disabled={!isDraft}>
                              {STIMULUS_KINDS.map((kind) => (
                                <option key={kind} value={kind}>
                                  {kind}
                                </option>
                              ))}
                            </Select>
                          </Field>
                          <Field label="Label">
                            <Input name="label" defaultValue={stimulus.label} disabled={!isDraft} />
                          </Field>
                        </div>
                        <Field label="Stimulus text">
                          <Textarea name="body" defaultValue={stimulus.body} disabled={!isDraft} rows={4} />
                        </Field>
                        {evidence.length > 0 && (
                          <div className="mt-3">
                            <span className="label-mono text-xs text-ink/60">Evidence responses</span>
                            <div className="mt-2 grid gap-2">
                              {evidence.slice(0, 6).map((row) => (
                                <label key={row.id} className="flex gap-2 rounded-md border border-ink/10 p-2 font-mono text-xs text-ink/65">
                                  <input
                                    name="evidenceResponseIds"
                                    type="checkbox"
                                    value={row.id}
                                    defaultChecked={selected.has(row.id)}
                                    disabled={!isDraft}
                                  />
                                  <span>{excerpt(row.rawText)}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        )}
                        {isDraft && (
                          <div className="mt-3 flex gap-2">
                            <Button type="submit" variant="secondary">Save stimulus</Button>
                            <Button
                              type="submit"
                              variant="danger"
                              formAction={deleteStimulusAction.bind(null, id, study.id, stimulus.id)}
                            >
                              Delete
                            </Button>
                          </div>
                        )}
                      </form>
                    );
                  })}
                </div>

                {isDraft && (
                  <>
                    <form action={addStimulusFormAction.bind(null, id, study.id)} className="mb-4 rounded-lg border border-ink/10 p-4">
                      <div className="mb-3 grid gap-3 md:grid-cols-[10rem_1fr]">
                        <Field label="Kind">
                          <Select name="kind" defaultValue="measured_ai">
                            {STIMULUS_KINDS.map((kind) => (
                              <option key={kind} value={kind}>
                                {kind}
                              </option>
                            ))}
                          </Select>
                        </Field>
                        <Field label="Label">
                          <Input name="label" placeholder="Measured AI framing" />
                        </Field>
                      </div>
                      <Field label="Stimulus text">
                        <Textarea name="body" rows={4} placeholder="Paste the framing the panel should react to." />
                      </Field>
                      {evidence.length > 0 && (
                        <div className="mt-3">
                          <span className="label-mono text-xs text-ink/60">Evidence responses</span>
                          <div className="mt-2 grid gap-2">
                            {evidence.slice(0, 6).map((row) => (
                              <label key={row.id} className="flex gap-2 rounded-md border border-ink/10 p-2 font-mono text-xs text-ink/65">
                                <input name="evidenceResponseIds" type="checkbox" value={row.id} />
                                <span>{excerpt(row.rawText)}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="mt-3">
                        <Button type="submit" variant="secondary">Add stimulus</Button>
                      </div>
                    </form>

                    <form action={approveStudyFormAction.bind(null, id, study.id)}>
                      <Button type="submit">Approve and compile</Button>
                    </form>
                  </>
                )}
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
