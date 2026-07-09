"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { STIMULUS_KINDS, type StimulusKind } from "@/core/resonance";
import {
  addStimulusAction,
  approveStudyAction,
  deleteStimulusAction,
  updateStimulusAction,
  updateStudyAction,
} from "@/modules/resonance/actions";

// Plain-language names + one-line help for the pipeline's stimulus kinds, so
// the operator never sees a raw enum like "measured_ai".
const KIND_META: Record<StimulusKind, { label: string; help: string }> = {
  measured_ai: {
    label: "Measured AI framing",
    help: "What AI assistants actually say about you today — attach the real audit responses as evidence.",
  },
  corrected: { label: "Corrected framing", help: "The accurate version — how the facts should be stated." },
  repositioned: { label: "Repositioned framing", help: "A new angle or positioning you want to test." },
  custom: { label: "Custom framing", help: "Any other framing to put in front of the panel." },
};

interface PersonaRow {
  label: string;
  ageBand: string;
  incomeBand: string;
  locationContext: string;
  behavioralProfile: string;
}

interface StimulusRow {
  id: string;
  kind: StimulusKind;
  label: string;
  body: string;
  evidenceResponseIdsJson: string[] | null;
}

const STEPS = [
  { n: 1, title: "Name your study" },
  { n: 2, title: "Who reacts — the buyer panel" },
  { n: 3, title: "What they react to — framings" },
  { n: 4, title: "Review & run" },
] as const;

const EMPTY_PERSONA: PersonaRow = { label: "", ageBand: "", incomeBand: "", locationContext: "", behavioralProfile: "" };

function personaComplete(p: PersonaRow) {
  return [p.label, p.ageBand, p.incomeBand, p.locationContext, p.behavioralProfile].every((v) => v.trim().length > 0);
}

function personasToLines(rows: PersonaRow[]) {
  return rows
    .filter(personaComplete)
    .map((p) => [p.label, p.ageBand, p.incomeBand, p.locationContext, p.behavioralProfile].map((v) => v.trim()).join(" | "))
    .join("\n");
}

export function StudyWizard({
  projectId,
  study,
  initialPersonas,
  stimuli,
  evidenceOptions,
}: {
  projectId: string;
  study: { id: string; name: string };
  initialPersonas: PersonaRow[];
  stimuli: StimulusRow[];
  evidenceOptions: Array<{ id: string; excerpt: string }>;
}) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(study.name);
  const [personas, setPersonas] = useState<PersonaRow[]>(
    initialPersonas.length > 0 ? initialPersonas : [{ ...EMPTY_PERSONA }],
  );

  // Persist name + panel together (updateStudyAction sets both). M22
  // (D-078): no genericUnconditioned field — evidence-only is a hard rule,
  // there is no toggle to escape it with.
  async function saveStudy(): Promise<boolean> {
    const fd = new FormData();
    fd.set("name", name.trim());
    fd.set("panelPersonas", personasToLines(personas));
    const res = await updateStudyAction(projectId, study.id, fd);
    if (!res.ok) {
      setError(res.error);
      return false;
    }
    router.refresh();
    return true;
  }

  function next() {
    setError(null);
    if (step === 1 && name.trim().length === 0) {
      setError("Give the study a name to continue.");
      return;
    }
    if (step === 2 && !personas.some(personaComplete)) {
      setError("Add at least one buyer type with all five fields filled in.");
      return;
    }
    // Steps that changed the study's own fields persist before advancing.
    if (step === 1 || step === 2) {
      startTransition(async () => {
        if (await saveStudy()) setStep(step + 1);
      });
      return;
    }
    setStep(Math.min(4, step + 1));
  }

  function back() {
    setError(null);
    setStep(Math.max(1, step - 1));
  }

  // --- framing (stimulus) mutations, persisted immediately ---
  function runAction(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong");
      else router.refresh();
    });
  }

  function addFraming() {
    const fd = new FormData();
    fd.set("kind", "measured_ai");
    fd.set("label", "New framing");
    fd.set("body", "Paste the framing the panel should react to.");
    runAction(() => addStimulusAction(projectId, study.id, fd));
  }

  function saveFraming(row: StimulusRow, patch: Partial<StimulusRow>, evidenceIds: string[]) {
    const merged = { ...row, ...patch };
    const fd = new FormData();
    fd.set("kind", merged.kind);
    fd.set("label", merged.label);
    fd.set("body", merged.body);
    for (const eid of evidenceIds) fd.append("evidenceResponseIds", eid);
    runAction(() => updateStimulusAction(projectId, study.id, row.id, fd));
  }

  function approve() {
    setError(null);
    startTransition(async () => {
      const res = await approveStudyAction(projectId, study.id);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  // --- review-step readiness checks (plain language) ---
  const readiness: string[] = [];
  if (name.trim().length === 0) readiness.push("This study needs a name (step 1).");
  if (!personas.some(personaComplete)) readiness.push("Add at least one buyer type (step 2).");
  if (stimuli.length < 2) readiness.push("Add at least two framings to compare (step 3).");
  // C-13 hard rule (M22/D-078): every study needs a Measured AI framing
  // with real evidence attached before it can be approved — no exceptions.
  const hasEvidencedMeasuredAi = stimuli.some(
    (s) => s.kind === "measured_ai" && (s.evidenceResponseIdsJson ?? []).length > 0,
  );
  if (!hasEvidencedMeasuredAi) {
    readiness.push(
      "Attach a Measured AI framing with at least one real audit response as evidence before approval (step 3, C-13).",
    );
  }
  for (const s of stimuli) {
    if (s.kind === "measured_ai" && (s.evidenceResponseIdsJson ?? []).length === 0) {
      readiness.push(`"${s.label}" is a Measured AI framing but has no evidence attached (step 3).`);
    }
  }

  return (
    <div>
      {/* progress rail */}
      <ol className="mb-6 flex flex-wrap gap-2">
        {STEPS.map((s) => {
          const active = s.n === step;
          const done = s.n < step;
          return (
            <li key={s.n}>
              <button
                type="button"
                onClick={() => setStep(s.n)}
                className={`label-mono rounded-full border px-3 py-1 text-xs transition-micro ${
                  active
                    ? "border-ink bg-ink text-paper"
                    : done
                      ? "border-ink/40 text-ink/70 hover:border-ink"
                      : "border-ink/15 text-ink/45 hover:border-ink/40"
                }`}
              >
                0{s.n} · {s.title}
              </button>
            </li>
          );
        })}
      </ol>

      <div className="mb-2 label-mono text-xs text-ink/45">
        STEP {step} OF 4 — {STEPS[step - 1].title}
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-danger px-3 py-2 font-mono text-xs text-danger">{error}</p>
      )}

      {/* STEP 1 — name */}
      {step === 1 && (
        <div className="max-w-xl">
          <Field label="Study name (required)" hint="A short name for this simulation, e.g. 'Weekday lunch $1 off'.">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Weekday lunch $1 off" />
          </Field>
        </div>
      )}

      {/* STEP 2 — panel */}
      {step === 2 && (
        <div>
          <p className="mb-4 max-w-2xl text-sm leading-6 text-ink/70">
            Add the buyer types the simulated panel will represent. <strong>Age and income</strong> are the
            research-validated axes; location and buying habits add context. One row per buyer type.
          </p>
          <div className="flex flex-col gap-3">
            {personas.map((p, i) => (
              <div key={i} className="rounded-lg border border-ink/10 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="label-mono text-xs text-ink/55">Buyer type {i + 1}</span>
                  {personas.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setPersonas(personas.filter((_, j) => j !== i))}
                    >
                      Remove
                    </Button>
                  )}
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {(
                    [
                      ["label", "Label (required)", "e.g. Young professional"],
                      ["ageBand", "Age band (required)", "e.g. 25–34"],
                      ["incomeBand", "Income band (required)", "e.g. $60k–$90k"],
                      ["locationContext", "Location (required)", "e.g. Singapore"],
                      ["behavioralProfile", "Buying habits (required)", "e.g. buys tea daily near the office"],
                    ] as const
                  ).map(([field, label, ph]) => (
                    <Field key={field} label={label}>
                      <Input
                        value={p[field]}
                        placeholder={ph}
                        onChange={(e) =>
                          setPersonas(personas.map((row, j) => (j === i ? { ...row, [field]: e.target.value } : row)))
                        }
                      />
                    </Field>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3">
            <Button type="button" variant="secondary" onClick={() => setPersonas([...personas, { ...EMPTY_PERSONA }])}>
              + Add buyer type
            </Button>
          </div>
        </div>
      )}

      {/* STEP 3 — framings */}
      {step === 3 && (
        <div>
          <p className="mb-3 max-w-2xl text-sm leading-6 text-ink/70">
            Add at least <strong>two framings</strong> to compare — for example, what AI says about you today vs. a
            corrected or repositioned version. The panel reacts to each. At least one framing must be a{" "}
            <strong>Measured AI framing</strong> citing real audit evidence — that is the study&rsquo;s baseline
            (C-13).
          </p>

          <div className="flex flex-col gap-4">
            {stimuli.map((s) => (
              <FramingCard
                key={s.id}
                stimulus={s}
                evidenceOptions={evidenceOptions}
                pending={pending}
                onSave={(patch, evidenceIds) => saveFraming(s, patch, evidenceIds)}
                onDelete={() => runAction(() => deleteStimulusAction(projectId, study.id, s.id))}
              />
            ))}
          </div>

          <div className="mt-4">
            <Button type="button" variant="secondary" disabled={pending} onClick={addFraming}>
              + Add framing
            </Button>
          </div>
        </div>
      )}

      {/* STEP 4 — review & run */}
      {step === 4 && (
        <div className="max-w-2xl">
          <ul className="mb-4 flex flex-col gap-2 font-mono text-sm">
            <li>Study: {name || "—"}</li>
            <li>Buyer types: {personas.filter(personaComplete).length}</li>
            <li>Framings: {stimuli.length}</li>
          </ul>
          {readiness.length > 0 ? (
            <div className="rounded-lg border border-warn p-3">
              <p className="mb-2 label-mono text-xs text-warn">Before you can run this study:</p>
              <ul className="flex flex-col gap-1 font-mono text-xs text-warn">
                {readiness.map((r) => (
                  <li key={r}>• {r}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mb-4 rounded-lg border border-ink/15 p-3 font-mono text-xs text-ink/60">
              Ready. Approving freezes this study and compiles a simulated matrix. Next: configure a simulation run.
            </p>
          )}
          <div className="mt-4">
            <Button type="button" disabled={pending || readiness.length > 0} onClick={approve}>
              {pending ? "Working…" : "Approve study"}
            </Button>
          </div>
        </div>
      )}

      {/* footer nav */}
      <div className="mt-6 flex items-center justify-between border-t border-ink/10 pt-4">
        <Button type="button" variant="secondary" disabled={step === 1 || pending} onClick={back}>
          ← Back
        </Button>
        {step < 4 && (
          <Button type="button" disabled={pending} onClick={next}>
            {pending ? "Saving…" : "Next →"}
          </Button>
        )}
      </div>
    </div>
  );
}

function FramingCard({
  stimulus,
  evidenceOptions,
  pending,
  onSave,
  onDelete,
}: {
  stimulus: StimulusRow;
  evidenceOptions: Array<{ id: string; excerpt: string }>;
  pending: boolean;
  onSave: (patch: Partial<StimulusRow>, evidenceIds: string[]) => void;
  onDelete: () => void;
}) {
  const [kind, setKind] = useState<StimulusKind>(stimulus.kind);
  const [label, setLabel] = useState(stimulus.label);
  const [body, setBody] = useState(stimulus.body);
  const [evidence, setEvidence] = useState<Set<string>>(new Set(stimulus.evidenceResponseIdsJson ?? []));

  const needsEvidence = kind === "measured_ai" && evidence.size === 0;

  return (
    <div className="rounded-lg border border-ink/10 p-4">
      <div className="mb-3 grid gap-3 md:grid-cols-[16rem_1fr]">
        <Field label="Framing type" hint={KIND_META[kind].help}>
          <Select value={kind} onChange={(e) => setKind(e.target.value as StimulusKind)}>
            {STIMULUS_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_META[k].label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Short label" hint="How this framing is named in the results.">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Measured AI framing" />
        </Field>
      </div>
      <Field label="Framing text" hint="Paste the exact wording the panel should react to.">
        <Textarea value={body} rows={4} onChange={(e) => setBody(e.target.value)} />
      </Field>

      {needsEvidence && (
        <p className="mt-2 rounded-md border border-warn px-3 py-2 font-mono text-xs text-warn">
          A Measured AI framing needs at least one real response attached below (C-13).
        </p>
      )}

      {kind === "measured_ai" && evidenceOptions.length > 0 && (
        <div className="mt-3">
          <span className="label-mono text-xs text-ink/60">Evidence — the real AI responses this framing quotes</span>
          <div className="mt-2 grid gap-2">
            {evidenceOptions.slice(0, 6).map((row) => (
              <label key={row.id} className="flex gap-2 rounded-md border border-ink/10 p-2 font-mono text-xs text-ink/65">
                <input
                  type="checkbox"
                  checked={evidence.has(row.id)}
                  onChange={(e) => {
                    const nextSet = new Set(evidence);
                    if (e.target.checked) nextSet.add(row.id);
                    else nextSet.delete(row.id);
                    setEvidence(nextSet);
                  }}
                />
                <span>{row.excerpt}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={() => onSave({ kind, label, body }, [...evidence])}
        >
          Save framing
        </Button>
        <Button type="button" variant="danger" disabled={pending} onClick={onDelete}>
          Delete
        </Button>
      </div>
    </div>
  );
}
