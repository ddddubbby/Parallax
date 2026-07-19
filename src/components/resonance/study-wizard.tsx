"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Button, Field, InlineStatus, Input, Select, Textarea } from "@/components/ui";
import { AppConfirmDialog } from "@/components/ui/dialog";
import { useUnsavedEdit } from "@/components/unsaved-edit";
import { STIMULUS_KINDS, type StimulusKind } from "@/core/resonance";
import {
  addStimulusAction,
  buildFramingThemesAction,
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
  framingEvidenceSnapshotId: string | null;
  /** M44 / D-114: the truthful recurrence line of a stamped baseline, or null. */
  stampLine: string | null;
}

interface BaselineTheme {
  key: string;
  label: string;
  responseIds: string[];
  matching: number;
  total: number;
}

interface ResponseOption {
  id: string;
  excerpt: string;
  verbatim: string;
  providerId: string;
  promptText: string;
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
  themes,
  responseOptions,
  themesSource,
}: {
  projectId: string;
  study: { id: string; name: string };
  initialPersonas: PersonaRow[];
  stimuli: StimulusRow[];
  themes: BaselineTheme[];
  responseOptions: ResponseOption[];
  themesSource: "framing_observations" | "attributes";
}) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [furthestStep, setFurthestStep] = useState(1);
  const [pending, startTransition] = useTransition();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<
    { kind: "approve" } | { kind: "delete"; stimulus: StimulusRow } | null
  >(null);
  const { setDirtySource, clearDirty } = useUnsavedEdit();
  const wizardRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

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
    clearDirty();
    router.refresh();
    return true;
  }

  function next() {
    setError(null);
    if (step === 1 && name.trim().length === 0) {
      setError("Give the study a name to continue.");
      nameRef.current?.focus();
      return;
    }
    if (step === 2 && !personas.some(personaComplete)) {
      setError("Add at least one buyer type with all five fields filled in.");
      const firstIncomplete = personas.findIndex((persona) => !personaComplete(persona));
      wizardRef.current
        ?.querySelector<HTMLInputElement>(`[data-persona-row="${Math.max(firstIncomplete, 0)}"] input`)
        ?.focus();
      return;
    }
    // Steps that changed the study's own fields persist before advancing.
    if (step === 1 || step === 2) {
      setPendingKey(`study-${step}`);
      startTransition(async () => {
        if (await saveStudy()) {
          setStep(step + 1);
          setFurthestStep((current) => Math.max(current, step + 1));
        }
        setPendingKey(null);
      });
      return;
    }
    setStep(Math.min(4, step + 1));
    setFurthestStep((current) => Math.max(current, Math.min(4, step + 1)));
  }

  function back() {
    setError(null);
    setStep(Math.max(1, step - 1));
  }

  // --- framing (stimulus) mutations, persisted immediately ---
  function runAction(
    key: string,
    fn: () => Promise<{ ok: boolean; error?: string }>,
    dirtyKey?: string,
    onSuccess?: () => void,
  ) {
    setError(null);
    setPendingKey(key);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong");
      else {
        if (dirtyKey) setDirtySource(dirtyKey, false);
        onSuccess?.();
        router.refresh();
      }
      setPendingKey(null);
    });
  }

  function refineThemes() {
    runAction("refine-themes", () => buildFramingThemesAction(projectId, study.id));
  }

  function addFraming() {
    const fd = new FormData();
    // First framing is the measured baseline when responses exist to pick
    // from; otherwise start with a custom challenger (never a dead end).
    const kind = responseOptions.length > 0 && !stimuli.some((s) => s.kind === "measured_ai")
      ? "measured_ai"
      : "custom";
    fd.set("kind", kind);
    fd.set("label", kind === "measured_ai" ? "What AI says today" : "New framing");
    if (kind === "measured_ai") {
      fd.set("body", responseOptions[0].verbatim);
      fd.append("evidenceResponseIds", responseOptions[0].id);
    } else {
      fd.set("body", "Paste the framing the panel should react to.");
    }
    runAction("add-framing", () => addStimulusAction(projectId, study.id, fd));
  }

  function saveFraming(
    row: StimulusRow,
    patch: Partial<StimulusRow>,
    evidenceIds: string[],
    themeKey: string | null,
  ) {
    const merged = { ...row, ...patch };
    const fd = new FormData();
    fd.set("kind", merged.kind);
    fd.set("label", merged.label);
    fd.set("body", merged.body);
    for (const eid of evidenceIds) fd.append("evidenceResponseIds", eid);
    if (themeKey) fd.set("baselineThemeKey", themeKey);
    runAction(
      `save-${row.id}`,
      () => updateStimulusAction(projectId, study.id, row.id, fd),
      `stimulus-${row.id}`,
    );
  }

  function approve() {
    setError(null);
    setPendingKey("approve");
    startTransition(async () => {
      const res = await approveStudyAction(projectId, study.id);
      if (!res.ok) setError(res.error);
      else {
        setConfirmation(null);
        clearDirty();
        router.refresh();
      }
      setPendingKey(null);
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
    readiness.push("Pick a stored AI response as the Measured AI baseline before approval (step 3, C-13).");
  }
  for (const s of stimuli) {
    if (s.kind === "measured_ai" && (s.evidenceResponseIdsJson ?? []).length === 0) {
      readiness.push(`"${s.label}" is a Measured AI framing but no stored response is picked yet (step 3).`);
    }
  }

  return (
    <div ref={wizardRef}>
      {/* progress rail */}
      <div className="mb-6 overflow-x-auto" aria-label="Study design progress">
      <ol className="flex min-w-max gap-2 pb-1">
        {STEPS.map((s) => {
          const active = s.n === step;
          const done = s.n < step;
          const available = s.n <= furthestStep;
          return (
            <li key={s.n}>
              <button
                type="button"
                disabled={!available || pending}
                aria-current={active ? "step" : undefined}
                onClick={() => setStep(s.n)}
                className={`label-mono min-h-11 rounded-full border px-3 py-2 text-xs transition-micro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                  active
                    ? "border-ink bg-ink text-paper"
                    : done
                      ? "border-ink/40 text-ink/70 hover:border-ink"
                      : available
                        ? "border-ink/25 text-ink/65 hover:border-ink/40"
                        : "border-ink/10 text-ink/60"
                }`}
              >
                0{s.n} · {s.title}
              </button>
            </li>
          );
        })}
      </ol>
      </div>

      <div className="mb-2 label-mono text-xs text-ink/65">
        STEP {step} OF 4 — {STEPS[step - 1].title}
      </div>

      {error && <InlineStatus className="mb-4" tone="danger">{error}</InlineStatus>}

      {/* STEP 1 — name */}
      {step === 1 && (
        <div className="max-w-xl">
          <Field label="Study name (required)" hint="A short name for this simulation, e.g. 'Weekday lunch $1 off'.">
            <Input
              ref={nameRef}
              value={name}
              onChange={(e) => { setName(e.target.value); setDirtySource("study", true); }}
              placeholder="Weekday lunch $1 off"
            />
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
              <div key={i} data-persona-row={i} className="rounded-lg border border-ink/10 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="label-mono text-xs text-ink/65">Buyer type {i + 1}</span>
                  {personas.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={(event) => {
                        setPersonas(personas.filter((_, j) => j !== i));
                        setDirtySource("study", true);
                        window.setTimeout(() => {
                          const rows = wizardRef.current?.querySelectorAll<HTMLElement>("[data-persona-row]");
                          rows?.[Math.max(0, i - 1)]?.querySelector<HTMLInputElement>("input")?.focus();
                          if (!rows?.length) (event.currentTarget.closest("section")?.querySelector("button") as HTMLButtonElement | null)?.focus();
                        }, 0);
                      }}
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
                          { setPersonas(personas.map((row, j) => (j === i ? { ...row, [field]: e.target.value } : row))); setDirtySource("study", true); }
                        }
                      />
                    </Field>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3">
            <Button type="button" variant="secondary" onClick={() => {
              const nextIndex = personas.length;
              setPersonas([...personas, { ...EMPTY_PERSONA }]);
              setDirtySource("study", true);
              window.setTimeout(() => wizardRef.current?.querySelector<HTMLInputElement>(`[data-persona-row="${nextIndex}"] input`)?.focus(), 0);
            }}>
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
            <strong>Measured AI framing</strong> quoting a real stored response — that is the study&rsquo;s baseline
            (C-13).
          </p>

          <div className="flex flex-col gap-4">
            {stimuli.map((s) => (
              <FramingCard
                key={s.id}
                stimulus={s}
                themes={themes}
                responseOptions={responseOptions}
                themesSource={themesSource}
                onRefineThemes={refineThemes}
                refining={pendingKey === "refine-themes"}
                pending={pendingKey === `save-${s.id}` || pendingKey === `delete-${s.id}`}
                pendingKey={pendingKey}
                onDirty={(dirty) => setDirtySource(`stimulus-${s.id}`, dirty)}
                onSave={(patch, evidenceIds, themeKey) => saveFraming(s, patch, evidenceIds, themeKey)}
                onDelete={() => setConfirmation({ kind: "delete", stimulus: s })}
              />
            ))}
          </div>

          <div className="mt-4">
            <Button
              type="button"
              variant="secondary"
              pending={pendingKey === "add-framing"}
              pendingLabel="Adding framing"
              disabled={pending && pendingKey !== "add-framing"}
              onClick={addFraming}
            >
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
            <Button
              type="button"
              disabled={pending || readiness.length > 0}
              onClick={() => setConfirmation({ kind: "approve" })}
            >
              Approve study
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
          <Button
            type="button"
            pending={pendingKey === `study-${step}`}
            pendingLabel="Saving study"
            disabled={pending && pendingKey !== `study-${step}`}
            onClick={next}
          >
            Next →
          </Button>
        )}
      </div>

      <AppConfirmDialog
        open={confirmation !== null}
        onOpenChange={(open) => { if (!open) setConfirmation(null); }}
        title={confirmation?.kind === "approve" ? "Approve and lock this study?" : "Delete framing?"}
        description={
          confirmation?.kind === "approve"
            ? "Approval freezes the buyer panel, framings, and evidence provenance as an immutable Simulation definition (C-13/C-15). Review every blocker before continuing."
            : confirmation?.kind === "delete"
              ? `Permanently delete “${confirmation.stimulus.label}” from this draft study?`
              : ""
        }
        confirmLabel={confirmation?.kind === "approve" ? "Approve and lock study" : `Delete ${confirmation?.kind === "delete" ? confirmation.stimulus.label : "framing"}`}
        tone={confirmation?.kind === "approve" ? "primary" : "danger"}
        pending={pendingKey === "approve" || pendingKey?.startsWith("delete-") === true}
        onConfirm={() => {
          if (confirmation?.kind === "approve") approve();
          if (confirmation?.kind === "delete") {
            const target = confirmation.stimulus;
            runAction(
              `delete-${target.id}`,
              () => deleteStimulusAction(projectId, study.id, target.id),
              `stimulus-${target.id}`,
              () => setConfirmation(null),
            );
          }
        }}
      />
    </div>
  );
}

function FramingCard({
  stimulus,
  themes,
  responseOptions,
  themesSource,
  onRefineThemes,
  refining,
  pending,
  pendingKey,
  onDirty,
  onSave,
  onDelete,
}: {
  stimulus: StimulusRow;
  themes: BaselineTheme[];
  responseOptions: ResponseOption[];
  themesSource: "framing_observations" | "attributes";
  onRefineThemes: () => void;
  refining: boolean;
  pending: boolean;
  pendingKey: string | null;
  onDirty: (dirty: boolean) => void;
  onSave: (patch: Partial<StimulusRow>, evidenceIds: string[], themeKey: string | null) => void;
  onDelete: () => void;
}) {
  const [kind, setKind] = useState<StimulusKind>(stimulus.kind);
  const [label, setLabel] = useState(stimulus.label);
  const [body, setBody] = useState(stimulus.body);
  const [selectedResponseId, setSelectedResponseId] = useState(
    stimulus.evidenceResponseIdsJson?.[0] ?? "",
  );
  const [themeKey, setThemeKey] = useState("");

  const needsEvidence = kind === "measured_ai" && selectedResponseId === "";
  const activeTheme = themes.find((t) => t.key === themeKey) ?? null;
  const visibleResponses = activeTheme
    ? responseOptions.filter((r) => activeTheme.responseIds.includes(r.id))
    : responseOptions;

  return (
    <div
      className="rounded-lg border border-ink/10 p-4"
      role="group"
      aria-label={`Framing ${label || stimulus.id.slice(0, 8)}`}
    >
      <div className="mb-3 grid gap-3 md:grid-cols-[16rem_1fr]">
        <Field label="Framing type" hint={KIND_META[kind].help}>
          <Select value={kind} onChange={(e) => {
            const nextKind = e.target.value as StimulusKind;
            setKind(nextKind);
            if (nextKind !== "measured_ai") { setSelectedResponseId(""); setThemeKey(""); }
            onDirty(true);
          }}>
            {STIMULUS_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_META[k].label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Short label" hint="How this framing is named in the results.">
          <Input value={label} onChange={(e) => { setLabel(e.target.value); onDirty(true); }} placeholder="What AI says today" />
        </Field>
      </div>

      {kind === "measured_ai" && (
        <div className="mb-3">
          <span className="label-mono text-xs text-ink/60">
            Pick the framing to fight — how AI talks about you today
          </span>
          {responseOptions.length === 0 ? (
            <p className="mt-2 rounded-md border border-warn px-3 py-2 font-mono text-xs text-warn">
              No stored responses yet — the baseline must quote a real audit response (C-13). Complete an
              audit run first, then return here to pick its framing.
            </p>
          ) : (
            <>
              {themes.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Framing themes">
                  <button
                    type="button"
                    onClick={() => setThemeKey("")}
                    aria-pressed={themeKey === ""}
                    className={`label-mono rounded-md border px-2 py-1.5 text-xs transition-micro ${themeKey === "" ? "border-accent bg-accent text-ink" : "border-ink/20 text-ink/65 hover:border-ink/40"}`}
                  >
                    All responses · {responseOptions.length}
                  </button>
                  {themes.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setThemeKey(t.key)}
                      aria-pressed={themeKey === t.key}
                      className={`label-mono rounded-md border px-2 py-1.5 text-xs transition-micro ${themeKey === t.key ? "border-accent bg-accent text-ink" : "border-ink/20 text-ink/65 hover:border-ink/40"}`}
                    >
                      {t.label} · {t.matching}/{t.total}
                    </button>
                  ))}
                </div>
              )}
              <div className="mt-2 grid max-h-72 gap-2 overflow-y-auto pr-1" role="radiogroup" aria-label="Stored responses">
                {visibleResponses.slice(0, 12).map((row) => (
                  <label
                    key={row.id}
                    className={`flex cursor-pointer gap-2 rounded-md border p-2 font-mono text-xs transition-micro ${selectedResponseId === row.id ? "border-accent bg-paper-2/50 text-ink/85" : "border-ink/10 text-ink/65 hover:border-ink/30"}`}
                  >
                    <input
                      type="radio"
                      name={`baseline-${stimulus.id}`}
                      checked={selectedResponseId === row.id}
                      onChange={() => {
                        setSelectedResponseId(row.id);
                        setBody(row.verbatim);
                        onDirty(true);
                      }}
                    />
                    <span>
                      <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-ink/45">
                        {row.providerId} · “{row.promptText.slice(0, 64)}{row.promptText.length > 64 ? "…" : ""}”
                      </span>
                      {row.excerpt}
                    </span>
                  </label>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <p className="font-mono text-[11px] text-ink/65">
                  {themesSource === "framing_observations"
                    ? "Themes machine-grouped from blind framing observations (D-114) — labels are machine-generated."
                    : "Themes grouped by extracted attributes."}
                </p>
                {themesSource === "attributes" && (
                  <Button
                    type="button"
                    variant="secondary"
                    pending={refining}
                    pendingLabel="Extracting framings"
                    disabled={pending && !refining}
                    onClick={onRefineThemes}
                  >
                    Refine themes with AI framing extraction
                  </Button>
                )}
              </div>
              {activeTheme && (
                <p className="mt-2 font-mono text-[11px] text-ink/65">
                  {activeTheme.matching <= 1
                    ? "SINGLE OBSERVED INSTANCE — this framing was seen once; it can be tested, but is never called recurring."
                    : `Theme “${activeTheme.label}” appears in ${activeTheme.matching}/${activeTheme.total} sampled responses (descriptive count).`}
                </p>
              )}
              {stimulus.stampLine && selectedResponseId === (stimulus.evidenceResponseIdsJson?.[0] ?? "") && (
                <p className="mt-1 font-mono text-[11px] text-ink/55">Saved baseline: {stimulus.stampLine}</p>
              )}
            </>
          )}
        </div>
      )}

      <Field
        label="Framing text"
        hint={kind === "measured_ai" ? "Verbatim from the picked stored response — saved server-side, never edited (C-13)." : "Paste the exact wording the panel should react to."}
      >
        <Textarea value={body} rows={4} readOnly={kind === "measured_ai"} onChange={(e) => { setBody(e.target.value); onDirty(true); }} />
      </Field>

      {needsEvidence && (
        <p className="mt-2 rounded-md border border-warn px-3 py-2 font-mono text-xs text-warn">
          Pick the stored AI response this baseline quotes above (C-13).
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <Button
          type="button"
          variant="secondary"
          pending={pendingKey === `save-${stimulus.id}`}
          pendingLabel={`Saving ${label || "framing"}`}
          disabled={pending && pendingKey !== `save-${stimulus.id}`}
          onClick={() =>
            onSave(
              { kind, label, body },
              selectedResponseId ? [selectedResponseId] : [],
              themeKey || null,
            )
          }
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
