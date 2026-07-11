"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Field, Input, Select, Stamp, Textarea } from "@/components/ui";
import {
  UnsavedChangesSignal,
  useUnsavedEdit,
} from "@/components/unsaved-edit";
import type { CodebookAssociation } from "@/core/framing-evidence";
import {
  completeFramingReviewAction,
  createFramingEvidenceSnapshotAction,
  lockFramingCodebookAction,
  revealFramingPositioningAction,
  saveFramingCodebookAction,
  saveFramingGapsAction,
  saveFramingResponseReviewAction,
} from "@/modules/framing/actions";

export interface FramingWorkspaceReview {
  id: string;
  responseId: string | null;
  outcome: string;
  reviewedBy: string | null;
  note: string | null;
  variantKey: string;
  promptText: string;
  providerId: string;
  generationMode: string;
  repIndex: number;
  rawText: string | null;
  modelVersion: string | null;
  annotations: Array<{
    id?: string;
    associationId: string;
    decision: "accepted" | "rejected";
    proposalSource: "human_raw_read" | "ai_span_assist";
    quote: string | null;
    note: string | null;
  }>;
}

export interface FramingWorkspaceGap {
  classification: string;
  associationId: string | null;
  missingTarget: string | null;
  rationale: string;
  factReferences: string[];
}

const STAGES = ["Discovery", "Codebook", "Reveal", "Review", "Gaps", "Handoff"] as const;
type Stage = (typeof STAGES)[number];

function defaultStage(state: string, hasGaps: boolean): Stage {
  if (state === "draft") return "Discovery";
  if (state === "codebook_locked") return "Reveal";
  if (state === "revealed" || state === "reviewing") return "Review";
  return hasGaps ? "Handoff" : "Gaps";
}

function stateStageLimit(state: string): number {
  if (state === "draft") return 1;
  if (state === "codebook_locked") return 2;
  if (state === "revealed" || state === "reviewing") return 3;
  return 5;
}

function WorkspaceInner({
  projectId,
  studyId,
  state,
  codebook,
  blindPacket,
  reviews,
  gaps: initialGaps,
  facts,
  reviewerIdentity,
  reviewMethod,
  reviewedCount,
  denominator,
  elapsedLabel,
  snapshots,
}: {
  projectId: string;
  studyId: string;
  state: string;
  codebook: CodebookAssociation[];
  blindPacket: { instructions: string[]; items: Array<{ blindId: string; rawText: string }> } | null;
  reviews: FramingWorkspaceReview[];
  gaps: FramingWorkspaceGap[];
  facts: Array<{ id: string; statement: string }>;
  reviewerIdentity: string | null;
  reviewMethod: string | null;
  reviewedCount: number;
  denominator: number;
  elapsedLabel: string;
  snapshots: Array<{ id: string; annotationId: string; label: string }>;
}) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>(defaultStage(state, initialGaps.length > 0));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { setDirty } = useUnsavedEdit();
  const limit = stateStageLimit(state);

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error ?? "Action failed");
      else {
        setDirty(false);
        router.refresh();
      }
    });
  }

  return (
    <div>
      <ol className="mb-6 flex flex-wrap gap-2" aria-label="Framing workflow stages">
        {STAGES.map((item, index) => {
          const enabled = index <= limit;
          return (
            <li key={item}>
              <button
                type="button"
                disabled={!enabled}
                onClick={() => setStage(item)}
                className={`label-mono rounded-full border px-3 py-1.5 text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                  stage === item ? "border-ink bg-ink text-paper" : enabled ? "border-ink/25 text-ink/65" : "border-ink/10 text-ink/30"
                }`}
              >
                {String(index + 1).padStart(2, "0")} {item}
              </button>
            </li>
          );
        })}
      </ol>
      <div className="mb-4 flex flex-wrap items-center gap-2 font-mono text-xs text-ink/50">
        <Stamp tone={reviewedCount === denominator ? "ok" : "ink"}>{reviewedCount}/{denominator} REVIEWED</Stamp>
        <span>operator elapsed · {elapsedLabel}</span>
        {reviewMethod && <span>{reviewMethod.replaceAll("_", " ")}</span>}
        <UnsavedChangesSignal className="label-mono ml-auto text-[11px] text-warn" />
      </div>
      {error && <p role="alert" className="mb-4 rounded-lg border border-danger px-3 py-2 font-mono text-xs text-danger">{error}</p>}

      {stage === "Discovery" && (
        <DiscoveryStage packet={blindPacket} locked={state !== "draft"} />
      )}
      {stage === "Codebook" && (
        <CodebookStage
          projectId={projectId}
          studyId={studyId}
          initial={codebook}
          locked={state !== "draft"}
          pending={pending}
          run={run}
          setDirty={setDirty}
        />
      )}
      {stage === "Reveal" && (
        <RevealStage
          projectId={projectId}
          studyId={studyId}
          locked={state === "codebook_locked"}
          alreadyRevealed={state !== "codebook_locked"}
          reviewerIdentity={reviewerIdentity}
          pending={pending}
          run={run}
          setDirty={setDirty}
        />
      )}
      {stage === "Review" && (
        <ReviewStage
          projectId={projectId}
          studyId={studyId}
          reviews={reviews}
          codebook={codebook}
          reviewerIdentity={reviewerIdentity ?? ""}
          completed={state === "completed"}
          pending={pending}
          run={run}
          setDirty={setDirty}
        />
      )}
      {stage === "Gaps" && (
        <GapsStage
          projectId={projectId}
          studyId={studyId}
          initial={initialGaps}
          codebook={codebook}
          facts={facts}
          analyst={reviewerIdentity ?? ""}
          enabled={state === "completed"}
          pending={pending}
          run={run}
          setDirty={setDirty}
        />
      )}
      {stage === "Handoff" && (
        <section className="space-y-4 rounded-xl border border-ink/15 p-5">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h2 className="label-mono text-sm font-semibold">Simulation handoff</h2>
            <Stamp tone="ink">C-15 PROVENANCE</Stamp>
          </div>
          <p className="max-w-3xl text-sm leading-6 text-ink/65">
            Select one accepted exact-span annotation to create an immutable evidence snapshot.
            The snapshot will preserve the reviewed n/N, prompt spread, model scope, codebook,
            reveal order, and verbatim source response used by Simulation.
          </p>
          <p className="font-mono text-xs text-ink/45">
            {reviews.flatMap((review) => review.annotations).filter((annotation) => annotation.decision === "accepted").length} accepted evidence spans available
          </p>
          <div className="grid gap-3">
            {reviews.flatMap((review) => review.annotations
              .filter((annotation) => annotation.decision === "accepted" && annotation.id)
              .map((annotation) => ({ review, annotation })))
              .map(({ review, annotation }) => {
                const annotationId = annotation.id as string;
                const existing = snapshots.find((snapshot) => snapshot.annotationId === annotationId);
                return (
                  <article key={annotationId} className="rounded-lg border border-ink/10 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="label-mono text-xs">{annotation.associationId}</strong>
                      <span className="font-mono text-[11px] text-ink/45">{review.variantKey} · REP {review.repIndex + 1}</span>
                      {existing && <Stamp tone="ok">{existing.label}</Stamp>}
                    </div>
                    <p className="mt-2 text-sm leading-6 text-ink/70">{annotation.quote}</p>
                    <Button
                      className="mt-3"
                      type="button"
                      variant="secondary"
                      disabled={pending || Boolean(existing)}
                      onClick={() => run(() => createFramingEvidenceSnapshotAction(projectId, studyId, annotationId))}
                    >
                      {existing ? "Snapshot created" : "Create immutable handoff"}
                    </Button>
                  </article>
                );
              })}
          </div>
        </section>
      )}
    </div>
  );
}

function DiscoveryStage({
  packet,
  locked,
}: {
  packet: { instructions: string[]; items: Array<{ blindId: string; rawText: string }> } | null;
  locked: boolean;
}) {
  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-ink/15 p-4">
        <div className="mb-2 flex items-center gap-2">
          <h2 className="label-mono text-sm font-semibold">Blind discovery packet</h2>
          <Stamp tone={locked ? "ok" : "ink"}>{locked ? "CLOSED" : "BLIND"}</Stamp>
        </div>
        <p className="text-sm leading-6 text-ink/65">
          This subset is selected without reading response content. It exposes raw text only—no
          intended positioning, fact sheet, prompt variant, provider, frequency, or simulation candidate.
        </p>
      </div>
      {packet ? packet.items.map((item) => (
        <article key={item.blindId} className="rounded-xl border border-ink/15 p-4">
          <div className="label-mono mb-2 text-xs text-ink/45">{item.blindId}</div>
          <p className="whitespace-pre-wrap text-sm leading-6 text-ink/80">{item.rawText}</p>
        </article>
      )) : (
        <p className="font-mono text-xs text-ink/45">Discovery closed when the codebook was locked.</p>
      )}
    </section>
  );
}

function CodebookStage({
  projectId,
  studyId,
  initial,
  locked,
  pending,
  run,
  setDirty,
}: {
  projectId: string;
  studyId: string;
  initial: CodebookAssociation[];
  locked: boolean;
  pending: boolean;
  run: (action: () => Promise<{ ok: boolean; error?: string }>) => void;
  setDirty: (dirty: boolean) => void;
}) {
  const empty = { associationId: "", label: "", definition: "" };
  const [createdBy, setCreatedBy] = useState("");
  const [rows, setRows] = useState<CodebookAssociation[]>(initial.length ? initial : [{ ...empty }]);
  const reset = () => { setRows(initial.length ? initial : [{ ...empty }]); setCreatedBy(""); setDirty(false); };
  return (
    <section className="rounded-xl border border-ink/15 p-5">
      <div className="mb-4 flex items-center gap-2">
        <h2 className="label-mono text-sm font-semibold">Project association codebook</h2>
        <Stamp tone={locked ? "ok" : "warn"}>{locked ? "LOCKED" : "DRAFT"}</Stamp>
      </div>
      {locked ? (
        <div className="grid gap-2">
          {initial.map((row) => <div key={row.associationId} className="rounded-lg border border-ink/10 p-3"><strong className="label-mono text-xs">{row.label}</strong><p className="mt-1 text-sm text-ink/65">{row.definition}</p></div>)}
        </div>
      ) : (
        <div className="space-y-4">
          <Field label="Codebook creator"><Input value={createdBy} onChange={(event) => { setCreatedBy(event.target.value); setDirty(true); }} /></Field>
          {rows.map((row, index) => (
            <div key={index} className="grid gap-3 rounded-lg border border-ink/10 p-3 md:grid-cols-[1fr_1fr_2fr_auto]">
              <Field label="Association id"><Input value={row.associationId} onChange={(event) => { setRows(rows.map((item, i) => i === index ? { ...item, associationId: event.target.value } : item)); setDirty(true); }} /></Field>
              <Field label="Label"><Input value={row.label} onChange={(event) => { setRows(rows.map((item, i) => i === index ? { ...item, label: event.target.value } : item)); setDirty(true); }} /></Field>
              <Field label="Definition"><Input value={row.definition} onChange={(event) => { setRows(rows.map((item, i) => i === index ? { ...item, definition: event.target.value } : item)); setDirty(true); }} /></Field>
              <Button variant="ghost" type="button" onClick={() => { setRows(rows.filter((_, i) => i !== index)); setDirty(true); }}>Remove</Button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" type="button" onClick={() => { setRows([...rows, { ...empty }]); setDirty(true); }}>Add association</Button>
            <Button disabled={pending} type="button" onClick={() => run(() => saveFramingCodebookAction({ projectId, studyId, createdBy, associations: rows }))}>Save codebook</Button>
            <Button variant="secondary" type="button" onClick={reset}>Cancel</Button>
            {initial.length > 0 && <Button variant="danger" disabled={pending} type="button" onClick={() => { if (window.confirm("Lock this codebook? It cannot be edited afterward.")) run(() => lockFramingCodebookAction(projectId, studyId)); }}>Lock codebook</Button>}
          </div>
        </div>
      )}
    </section>
  );
}

function RevealStage({ projectId, studyId, locked, alreadyRevealed, reviewerIdentity, pending, run, setDirty }: {
  projectId: string; studyId: string; locked: boolean; alreadyRevealed: boolean; reviewerIdentity: string | null; pending: boolean;
  run: (action: () => Promise<{ ok: boolean; error?: string }>) => void; setDirty: (dirty: boolean) => void;
}) {
  const [positioning, setPositioning] = useState("");
  const [revealedBy, setRevealedBy] = useState("");
  const [reviewer, setReviewer] = useState(reviewerIdentity ?? "");
  const [method, setMethod] = useState("single_analyst");
  if (alreadyRevealed) return <section className="rounded-xl border border-ink/15 p-5"><h2 className="label-mono text-sm font-semibold">Positioning revealed</h2><p className="mt-2 text-sm text-ink/65">The lock/reveal order is preserved. Continue to full-sample review.</p></section>;
  return (
    <section className="space-y-4 rounded-xl border border-ink/15 p-5">
      <div><h2 className="label-mono text-sm font-semibold">Reveal positioning after lock</h2><p className="mt-1 text-sm text-ink/60">State whether this is client-supplied or official-public positioning in the text. Active fact-sheet rows are snapshotted at reveal.</p></div>
      <Field label="Positioning and source disclosure"><Textarea rows={6} value={positioning} onChange={(event) => { setPositioning(event.target.value); setDirty(true); }} placeholder="CLIENT-SUPPLIED POSITIONING — … or OFFICIAL-PUBLIC POSITIONING — …" /></Field>
      <div className="grid gap-3 md:grid-cols-2"><Field label="Revealed by"><Input value={revealedBy} onChange={(event) => { setRevealedBy(event.target.value); setDirty(true); }} /></Field><Field label="Full-sample reviewer"><Input value={reviewer} onChange={(event) => { setReviewer(event.target.value); setDirty(true); }} /></Field></div>
      <Field label="Review method"><Select value={method} onChange={(event) => { setMethod(event.target.value); setDirty(true); }}><option value="single_analyst">Single analyst</option><option value="intra_rater_consistency">Intra-rater consistency</option><option value="machine_discrepancy_check">Machine discrepancy check</option><option value="inter_rater_reliability">Inter-rater reliability</option></Select></Field>
      <div className="flex gap-2"><Button disabled={!locked || pending} type="button" onClick={() => run(() => revealFramingPositioningAction({ projectId, studyId, positioningText: positioning, revealedBy, reviewerIdentity: reviewer, reviewMethod: method }))}>Reveal and start review</Button><Button variant="secondary" type="button" onClick={() => { setPositioning(""); setRevealedBy(""); setReviewer(""); setDirty(false); }}>Cancel</Button></div>
    </section>
  );
}

function ReviewStage({ projectId, studyId, reviews, codebook, reviewerIdentity, completed, pending, run, setDirty }: {
  projectId: string; studyId: string; reviews: FramingWorkspaceReview[]; codebook: CodebookAssociation[]; reviewerIdentity: string; completed: boolean; pending: boolean;
  run: (action: () => Promise<{ ok: boolean; error?: string }>) => void; setDirty: (dirty: boolean) => void;
}) {
  return (
    <section className="space-y-3">
      {reviews.map((review) => <ReviewCard key={review.id} {...{ projectId, studyId, review, codebook, reviewerIdentity, completed, pending, run, setDirty }} />)}
      {!completed && <div className="flex justify-end"><Button disabled={pending} onClick={() => { if (window.confirm("Complete full-sample review? Every denominator row must be resolved.")) run(() => completeFramingReviewAction(projectId, studyId)); }}>Complete review</Button></div>}
    </section>
  );
}

function ReviewCard({ projectId, studyId, review, codebook, reviewerIdentity, completed, pending, run, setDirty }: {
  projectId: string; studyId: string; review: FramingWorkspaceReview; codebook: CodebookAssociation[]; reviewerIdentity: string; completed: boolean; pending: boolean;
  run: (action: () => Promise<{ ok: boolean; error?: string }>) => void; setDirty: (dirty: boolean) => void;
}) {
  const initialAnnotations = review.annotations.length ? review.annotations : [];
  const [outcome, setOutcome] = useState(review.outcome === "pending" ? "none" : review.outcome);
  const [annotations, setAnnotations] = useState(initialAnnotations);
  const unavailable = review.responseId === null;
  return (
    <article className="rounded-xl border border-ink/15 p-4">
      <div className="flex flex-wrap items-center gap-2"><span className="label-mono text-xs">{review.variantKey} · REP {review.repIndex + 1}</span><Stamp tone={review.outcome === "pending" ? "warn" : "ok"}>{review.outcome}</Stamp><span className="ml-auto font-mono text-[11px] text-ink/45">{review.providerId} · {review.modelVersion ?? "generation unavailable"} · {review.generationMode}</span></div>
      {unavailable ? <p className="mt-3 font-mono text-xs text-warn">No immutable response stored. This job remains in N as generation_unavailable.</p> : <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-ink/80">{review.rawText}</p>}
      {!completed && !unavailable && <div className="mt-4 space-y-3 border-t border-ink/10 pt-3">
        <Field label="Review outcome"><Select value={outcome} onChange={(event) => { setOutcome(event.target.value); setDirty(true); }}><option value="coded">Coded association</option><option value="none">No relevant association</option><option value="ambiguous">Ambiguous</option><option value="entity_ambiguous">Entity ambiguous</option></Select></Field>
        {annotations.map((annotation, index) => <div key={index} className="grid gap-2 rounded-lg bg-paper-2/40 p-3 md:grid-cols-2"><Field label="Association"><Select value={annotation.associationId} onChange={(event) => { setAnnotations(annotations.map((item, i) => i === index ? { ...item, associationId: event.target.value } : item)); setDirty(true); }}>{codebook.map((association) => <option key={association.associationId} value={association.associationId}>{association.label}</option>)}</Select></Field><Field label="Decision"><Select value={annotation.decision} onChange={(event) => { setAnnotations(annotations.map((item, i) => i === index ? { ...item, decision: event.target.value as "accepted" | "rejected" } : item)); setDirty(true); }}><option value="accepted">Accept</option><option value="rejected">Reject</option></Select></Field><Field label="Proposal source"><Select value={annotation.proposalSource} onChange={(event) => { setAnnotations(annotations.map((item, i) => i === index ? { ...item, proposalSource: event.target.value as "human_raw_read" | "ai_span_assist" } : item)); setDirty(true); }}><option value="human_raw_read">Human raw read</option><option value="ai_span_assist">AI span assist</option></Select></Field><Field label="Exact evidence quote"><Textarea value={annotation.quote ?? ""} onChange={(event) => { setAnnotations(annotations.map((item, i) => i === index ? { ...item, quote: event.target.value } : item)); setDirty(true); }} /></Field><Button variant="ghost" type="button" onClick={() => { setAnnotations(annotations.filter((_, i) => i !== index)); setDirty(true); }}>Remove annotation</Button></div>)}
        <div className="flex flex-wrap gap-2"><Button variant="secondary" type="button" disabled={codebook.length === 0} onClick={() => { setOutcome("coded"); setAnnotations([...annotations, { associationId: codebook[0]?.associationId ?? "", decision: "accepted", proposalSource: "human_raw_read", quote: "", note: null }]); setDirty(true); }}>Add annotation</Button><Button disabled={pending} type="button" onClick={() => run(() => saveFramingResponseReviewAction({ projectId, studyId, reviewId: review.id, outcome, reviewedBy: reviewerIdentity, annotations }))}>Save row</Button><Button variant="secondary" type="button" onClick={() => { setOutcome(review.outcome === "pending" ? "none" : review.outcome); setAnnotations(initialAnnotations); setDirty(false); }}>Cancel</Button></div>
      </div>}
    </article>
  );
}

function GapsStage({ projectId, studyId, initial, codebook, facts, analyst, enabled, pending, run, setDirty }: {
  projectId: string; studyId: string; initial: FramingWorkspaceGap[]; codebook: CodebookAssociation[]; facts: Array<{ id: string; statement: string }>; analyst: string; enabled: boolean; pending: boolean;
  run: (action: () => Promise<{ ok: boolean; error?: string }>) => void; setDirty: (dirty: boolean) => void;
}) {
  const empty: FramingWorkspaceGap = { classification: "missing", associationId: null, missingTarget: "", rationale: "", factReferences: [] };
  const [rows, setRows] = useState<FramingWorkspaceGap[]>(initial.length ? initial : [{ ...empty }]);
  if (!enabled) return <p className="font-mono text-xs text-warn">Complete every denominator review before classifying gaps.</p>;
  return <section className="space-y-4 rounded-xl border border-ink/15 p-5"><div><h2 className="label-mono text-sm font-semibold">Actionable gap classification</h2><p className="mt-1 text-sm text-ink/60">Human judgment after reveal. Missing targets remain separate from associations actually observed.</p></div>{rows.map((row, index) => <div key={index} className="grid gap-3 rounded-lg border border-ink/10 p-3 md:grid-cols-2"><Field label="Classification"><Select value={row.classification} onChange={(event) => { const classification = event.target.value; setRows(rows.map((item, i) => i === index ? { ...item, classification, associationId: classification === "missing" ? null : codebook[0]?.associationId ?? null, missingTarget: classification === "missing" ? item.missingTarget : null } : item)); setDirty(true); }}>{["reinforced", "missing", "misframed", "unsupported", "non_actionable"].map((kind) => <option key={kind} value={kind}>{kind.replaceAll("_", " ")}</option>)}</Select></Field>{row.classification === "missing" ? <Field label="Missing target"><Input value={row.missingTarget ?? ""} onChange={(event) => { setRows(rows.map((item, i) => i === index ? { ...item, missingTarget: event.target.value } : item)); setDirty(true); }} /></Field> : <Field label="Observed association"><Select value={row.associationId ?? ""} onChange={(event) => { setRows(rows.map((item, i) => i === index ? { ...item, associationId: event.target.value } : item)); setDirty(true); }}>{codebook.map((association) => <option key={association.associationId} value={association.associationId}>{association.label}</option>)}</Select></Field>}<Field label="Rationale"><Textarea value={row.rationale} onChange={(event) => { setRows(rows.map((item, i) => i === index ? { ...item, rationale: event.target.value } : item)); setDirty(true); }} /></Field><Field label="Fact-sheet reference"><Select value={row.factReferences[0] ?? ""} onChange={(event) => { setRows(rows.map((item, i) => i === index ? { ...item, factReferences: event.target.value ? [event.target.value] : [] } : item)); setDirty(true); }}><option value="">No fact reference</option>{facts.map((fact) => <option key={fact.id} value={fact.id}>{fact.statement}</option>)}</Select></Field><Button variant="ghost" type="button" onClick={() => { setRows(rows.filter((_, i) => i !== index)); setDirty(true); }}>Remove</Button></div>)}<div className="flex flex-wrap gap-2"><Button variant="secondary" type="button" onClick={() => { setRows([...rows, { ...empty }]); setDirty(true); }}>Add classification</Button><Button disabled={pending} type="button" onClick={() => run(() => saveFramingGapsAction({ projectId, studyId, classifiedBy: analyst, gaps: rows.map((row) => ({ ...row, classification: row.classification as "reinforced" | "missing" | "misframed" | "unsupported" | "non_actionable" })) }))}>Save gaps</Button><Button variant="secondary" type="button" onClick={() => { setRows(initial.length ? initial : [{ ...empty }]); setDirty(false); }}>Cancel</Button></div></section>;
}

export function FramingWorkspace(props: Parameters<typeof WorkspaceInner>[0]) {
  return <WorkspaceInner {...props} />;
}
