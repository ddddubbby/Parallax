"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { EmptyState } from "@/components/empty-state";
import { FramingBatchProgress } from "@/components/resonance/framing-batch-progress";
import {
  PromptDisclosurePanel,
  type PromptDisclosureData,
} from "@/components/resonance/prompt-disclosure-panel";
import { Button, Field, InlineStatus, Input, Stamp, Textarea } from "@/components/ui";
import { AppConfirmDialog, AppDialog } from "@/components/ui/dialog";
import { useUnsavedEdit } from "@/components/unsaved-edit";
import type { FramingObservationBatchProgress } from "@/core/framing-batch";
import {
  isPreviewOnlyPersonaCount,
  MIN_PERSONAS_FOR_LIVE_AUDIT_DRAW_FLOOR,
} from "@/core/resonance-draws";
import type { StimulusKind } from "@/core/resonance";
import {
  addStimulusAction,
  buildFramingThemesAction,
  approveStudyAction,
  deleteStimulusAction,
  excludeRecommendationScenarioAction,
  fetchBaselinePickerPageAction,
  fetchFramingBatchProgressAction,
  updateStimulusAction,
  updateStudyAction,
} from "@/modules/resonance/actions";

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
  generationMode?: string;
  modelVersion?: string;
  createdAt?: string;
  /** Exact framing-observation quote when available (M46/D-117). */
  observationQuote?: string | null;
}

const STEPS = [
  { n: 1, title: "Name the test" },
  { n: 2, title: "Set the context" },
  { n: 3, title: "Compare messages" },
  { n: 4, title: "Review prompts" },
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
  selectedResponseOptions = [],
  themesSource,
  initialFramingBatch,
  testType,
  recommendationScenarios,
  promptDisclosure,
  baselineNextCursor = null,
  baselineTotalCount = 0,
}: {
  projectId: string;
  study: { id: string; name: string };
  initialPersonas: PersonaRow[];
  stimuli: StimulusRow[];
  themes: BaselineTheme[];
  responseOptions: ResponseOption[];
  selectedResponseOptions?: ResponseOption[];
  themesSource: "framing_observations" | "attributes";
  initialFramingBatch?: FramingObservationBatchProgress | null;
  testType: "buyer_response" | "ai_recommendation";
  recommendationScenarios: Array<{ key: string; label: string; promptText: string }>;
  promptDisclosure: PromptDisclosureData;
  baselineNextCursor?: string | null;
  baselineTotalCount?: number;
}) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [furthestStep, setFurthestStep] = useState(1);
  const [pending, startTransition] = useTransition();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [framingBatch, setFramingBatch] = useState<FramingObservationBatchProgress | null>(
    initialFramingBatch ?? null,
  );
  const [confirmation, setConfirmation] = useState<
    { kind: "approve" } | { kind: "delete"; stimulus: StimulusRow } | null
  >(null);
  const { dirty, setDirtySource, clearDirty } = useUnsavedEdit();
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
    setDirtySource("study", false);
    return true;
  }

  function next() {
    setError(null);
    if (step === 1 && name.trim().length === 0) {
      setError("Give the study a name to continue.");
      nameRef.current?.focus();
      return;
    }
    if (step === 2 && testType === "buyer_response" && !personas.some(personaComplete)) {
      setError("Add at least one buyer profile with all five fields filled in.");
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
      }
      setPendingKey(null);
    });
  }

  function refineThemes() {
    setError(null);
    setPendingKey("refine-themes");
    startTransition(async () => {
      const res = await buildFramingThemesAction(projectId, study.id);
      if (!res.ok) {
        setError(res.error ?? "Something went wrong");
        setPendingKey(null);
        return;
      }
      if (res.batchId) {
        const progress = await fetchFramingBatchProgressAction(projectId, res.batchId);
        if (progress) setFramingBatch(progress);
      }
      setPendingKey(null);
    });
  }

  function addFraming() {
    if (stimuli.length >= 2) return;
    const fd = new FormData();
    // First framing is the measured baseline when responses exist to pick
    // from; otherwise start with a custom challenger (never a dead end).
    const kind = responseOptions.length > 0 && !stimuli.some((s) => s.kind === "measured_ai")
      ? "measured_ai"
      : "custom";
    fd.set("kind", kind);
    fd.set("label", kind === "measured_ai" ? "Current message" : "New message");
    if (kind === "measured_ai") {
      fd.set("body", responseOptions[0].verbatim);
      fd.append("evidenceResponseIds", responseOptions[0].id);
    } else {
      fd.set("body", "Paste the new message to test.");
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
      }
      setPendingKey(null);
    });
  }

  // --- review-step readiness checks (plain language) ---
  const readiness: string[] = [];
  if (name.trim().length === 0) readiness.push("This test needs a name (step 1).");
  if (testType === "buyer_response" && !personas.some(personaComplete)) {
    readiness.push("Add at least one buyer profile (step 2).");
  }
  if (testType === "ai_recommendation" && recommendationScenarios.length < 6) {
    readiness.push("At least six eligible shopping situations are required (step 2).");
  }
  if (stimuli.length !== 2) readiness.push("Add exactly two messages to compare (step 3).");
  // C-13 hard rule: every new test needs one evidence-backed Current message.
  // with real evidence attached before it can be approved — no exceptions.
  const hasEvidencedMeasuredAi = stimuli.some(
    (s) => s.kind === "measured_ai" && (s.evidenceResponseIdsJson ?? []).length > 0,
  );
  if (!hasEvidencedMeasuredAi) {
    readiness.push("Pick a stored AI response as the Current message before approval (step 3).");
  }
  for (const s of stimuli) {
    if (s.kind === "measured_ai" && (s.evidenceResponseIdsJson ?? []).length === 0) {
      readiness.push(`"${s.label}" needs a stored response (step 3).`);
    }
  }
  if (!promptDisclosure.parityVerified) {
    readiness.push("Prompt parity must pass: only the message may change (step 4).");
  }
  if (dirty) {
    readiness.push("Save the Current or New message before approval (step 3 — Save message).");
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
          <Field label="Test name (required)" hint="A short name for this comparison.">
            <Input
              ref={nameRef}
              value={name}
              onChange={(e) => { setName(e.target.value); setDirtySource("study", true); }}
              placeholder="Weekday lunch $1 off"
            />
          </Field>
        </div>
      )}

      {/* STEP 2 — context */}
      {step === 2 && (
        <div>
          {testType === "ai_recommendation" ? (
            <>
              <p className="mb-4 max-w-2xl text-sm leading-6 text-ink/70">
                Resonance selected brand-neutral shopping situations from the latest approved Evidence
                audit. The same situations are used for both messages.
              </p>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <Stamp tone={recommendationScenarios.length >= 6 ? "ok" : "warn"}>
                  {recommendationScenarios.length} eligible situations
                </Stamp>
                <span className="text-xs text-ink/55">Six or more are required for a full run.</span>
              </div>
              <ul className="grid gap-2">
                {recommendationScenarios.map((scenario) => (
                  <li key={scenario.key} className="flex items-start gap-3 rounded-lg border border-ink/10 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="label-mono mb-1 text-xs text-ink/55">{scenario.label}</p>
                      <p className="text-sm leading-6 text-ink/75">{scenario.promptText}</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={pending || recommendationScenarios.length <= 6}
                      pending={pendingKey === `exclude-${scenario.key}`}
                      pendingLabel="Excluding"
                      onClick={() =>
                        runAction(
                          `exclude-${scenario.key}`,
                          () => excludeRecommendationScenarioAction(projectId, study.id, scenario.key),
                        )
                      }
                    >
                      Exclude
                    </Button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
          <p className="mb-4 max-w-2xl text-sm leading-6 text-ink/70">
            Add the buyer profiles used for both messages. Six profiles are required for a full
            run; fewer profiles produce an Early read.
          </p>
          <div className="flex flex-col gap-3">
            {personas.map((p, i) => (
              <div key={i} data-persona-row={i} className="rounded-lg border border-ink/10 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="label-mono text-xs text-ink/65">Buyer profile {i + 1}</span>
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
                      ["label", "Profile name (required)", "e.g. Young professional"],
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
              + Add buyer profile
            </Button>
          </div>
            </>
          )}
        </div>
      )}

      {/* STEP 3 — framings */}
      {step === 3 && (
        <div>
          <p className="mb-3 max-w-2xl text-sm leading-6 text-ink/70">
            Pick one stored response as the <strong>Current message</strong>, then enter exactly one{" "}
            <strong>New message</strong>. Both are tested in the same contexts with the same instructions.
          </p>

          {/* Study-level batch ring (one poller) — not per measured-AI card. */}
          {framingBatch && (
            <div className="mb-4">
              <FramingBatchProgress
                projectId={projectId}
                studyId={study.id}
                initial={framingBatch}
                onTerminal={() => {
                  setFramingBatch(null);
                  router.refresh();
                }}
              />
            </div>
          )}

          <div className="flex flex-col gap-4">
            {stimuli.map((s, index) => (
              <FramingCard
                key={s.id}
                projectId={projectId}
                stimulus={s}
                themes={themes}
                responseOptions={responseOptions}
                selectedResponseOption={selectedResponseOptions.find(
                  (option) => option.id === s.evidenceResponseIdsJson?.[0],
                ) ?? null}
                themesSource={themesSource}
                initialNextCursor={baselineNextCursor}
                totalCount={baselineTotalCount > 0 ? baselineTotalCount : responseOptions.length}
                onRefineThemes={refineThemes}
                refining={pendingKey === "refine-themes"}
                framingBatchActive={Boolean(framingBatch)}
                pending={pendingKey === `save-${s.id}` || pendingKey === `delete-${s.id}`}
                pendingKey={pendingKey}
                onDirty={(dirty) => setDirtySource(`stimulus-${s.id}`, dirty)}
                onSave={(patch, evidenceIds, themeKey) => saveFraming(s, patch, evidenceIds, themeKey)}
                onDelete={() => setConfirmation({ kind: "delete", stimulus: s })}
                messageRole={index === 0 ? "Current message" : "New message"}
              />
            ))}
          </div>

          {stimuli.length < 2 && <div className="mt-4">
            <Button
              type="button"
              variant="secondary"
              pending={pendingKey === "add-framing"}
              pendingLabel="Adding message"
              disabled={pending && pendingKey !== "add-framing"}
              onClick={addFraming}
            >
              + Add message
            </Button>
          </div>}
        </div>
      )}

      {/* STEP 4 — review & run */}
      {step === 4 && (
        <div className="max-w-2xl">
          {(() => {
            const personaCount = testType === "buyer_response"
              ? personas.filter(personaComplete).length
              : recommendationScenarios.length;
            const previewOnly = isPreviewOnlyPersonaCount(personaCount);
            return (
              <>
                <ul className="mb-4 flex flex-col gap-2 font-mono text-sm">
                  <li>Test: {name || "—"}</li>
                  <li>{testType === "buyer_response" ? "Buyer profiles" : "Shopping situations"}: {personaCount}</li>
                  <li>Messages: {stimuli.length}</li>
                </ul>
                <PromptDisclosurePanel disclosure={promptDisclosure} compact />
                {previewOnly && readiness.length === 0 && (
                  <InlineStatus tone="warning" className="mb-4">
                    Early read — add {testType === "buyer_response" ? "buyer profiles" : "shopping situations"} until
                    you have at least {MIN_PERSONAS_FOR_LIVE_AUDIT_DRAW_FLOOR} for a full run.
                  </InlineStatus>
                )}
                {readiness.length > 0 ? (
                  <div className="rounded-lg border border-warn p-3">
                    <p className="mb-2 label-mono text-xs text-warn">Before you can run this test:</p>
                    <ul className="flex flex-col gap-1 font-mono text-xs text-warn">
                      {readiness.map((r) => (
                        <li key={r}>• {r}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="mb-4 rounded-lg border border-ink/15 p-3 font-mono text-xs text-ink/60">
                    Ready. Approving freezes the messages, contexts, and exact prompts.
                  </p>
                )}
                <div className="mt-4">
                  <Button
                    type="button"
                    disabled={pending || readiness.length > 0}
                    onClick={() => setConfirmation({ kind: "approve" })}
                  >
                    Approve test
                  </Button>
                </div>
              </>
            );
          })()}
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
        title={confirmation?.kind === "approve" ? "Approve and lock this test?" : "Delete message?"}
        description={
          confirmation?.kind === "approve"
            ? "Approval freezes the contexts, messages, evidence provenance, and exact A/B prompts."
            : confirmation?.kind === "delete"
              ? `Permanently delete “${confirmation.stimulus.label}” from this draft test?`
              : ""
        }
        confirmLabel={confirmation?.kind === "approve" ? "Approve and lock test" : `Delete ${confirmation?.kind === "delete" ? confirmation.stimulus.label : "message"}`}
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
  projectId,
  stimulus,
  themes: initialThemes,
  responseOptions: initialResponses,
  selectedResponseOption: initialSelectedResponse,
  themesSource: initialThemesSource,
  initialNextCursor,
  totalCount: initialTotalCount,
  onRefineThemes,
  refining,
  framingBatchActive,
  pending,
  pendingKey,
  onDirty,
  onSave,
  onDelete,
  messageRole,
}: {
  projectId: string;
  stimulus: StimulusRow;
  themes: BaselineTheme[];
  responseOptions: ResponseOption[];
  selectedResponseOption: ResponseOption | null;
  themesSource: "framing_observations" | "attributes";
  initialNextCursor: string | null;
  totalCount: number;
  onRefineThemes: () => void;
  refining: boolean;
  /** True while a study-level framing batch is active (hides per-card refine CTA). */
  framingBatchActive: boolean;
  pending: boolean;
  pendingKey: string | null;
  onDirty: (dirty: boolean) => void;
  onSave: (patch: Partial<StimulusRow>, evidenceIds: string[], themeKey: string | null) => void;
  onDelete: () => void;
  messageRole: "Current message" | "New message";
}) {
  const kind = stimulus.kind;
  const [label, setLabel] = useState(stimulus.label);
  const [body, setBody] = useState(stimulus.body);
  const [selectedResponseId, setSelectedResponseId] = useState(
    stimulus.evidenceResponseIdsJson?.[0] ?? "",
  );
  const [selectedOption, setSelectedOption] = useState<ResponseOption | null>(
    () =>
      initialResponses.find((r) => r.id === stimulus.evidenceResponseIdsJson?.[0]) ??
      initialSelectedResponse,
  );
  const [themeKey, setThemeKey] = useState("");
  const [themes, setThemes] = useState(initialThemes);
  const [themesSource, setThemesSource] = useState(initialThemesSource);
  const [visibleResponses, setVisibleResponses] = useState(() =>
    initialSelectedResponse &&
    !initialResponses.some((response) => response.id === initialSelectedResponse.id)
      ? [initialSelectedResponse, ...initialResponses]
      : initialResponses,
  );
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [totalCount, setTotalCount] = useState(initialTotalCount);
  const [pageLoading, setPageLoading] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [fullResponseId, setFullResponseId] = useState<string | null>(null);

  const needsEvidence = kind === "measured_ai" && selectedResponseId === "";
  const activeTheme = themes.find((t) => t.key === themeKey) ?? null;
  const fullResponse =
    (fullResponseId
      ? visibleResponses.find((r) => r.id === fullResponseId) ??
        (selectedOption?.id === fullResponseId ? selectedOption : null)
      : null);

  async function loadPickerPage(opts: {
    cursor?: string | null;
    themeKey?: string;
    append?: boolean;
  }) {
    setPageLoading(true);
    setPageError(null);
    try {
      const result = await fetchBaselinePickerPageAction(projectId, {
        cursor: opts.cursor ?? null,
        themeKey: opts.themeKey || null,
      });
      if (!result.ok) {
        setPageError(result.error);
        return;
      }
      setThemes(result.themes);
      setThemesSource(result.themesSource);
      setTotalCount(result.totalCount);
      setNextCursor(result.nextCursor);
      setVisibleResponses((prev) => {
        if (!opts.append) {
          return initialSelectedResponse &&
            !result.items.some((response) => response.id === initialSelectedResponse.id)
            ? [initialSelectedResponse, ...result.items]
            : result.items;
        }
        const seen = new Set(prev.map((response) => response.id));
        return [...prev, ...result.items.filter((response) => !seen.has(response.id))];
      });
    } catch {
      setPageError("Could not load more responses.");
    } finally {
      setPageLoading(false);
    }
  }

  function chooseTheme(nextKey: string) {
    setThemeKey(nextKey);
    void loadPickerPage({ themeKey: nextKey, append: false });
  }

  function chooseAsBaseline(row: ResponseOption) {
    setSelectedResponseId(row.id);
    setSelectedOption(row);
    setBody(row.verbatim);
    onDirty(true);
    setFullResponseId(null);
  }

  return (
    <div
      className="rounded-lg border border-ink/10 p-4"
      role="group"
      aria-label={`${messageRole} ${label || stimulus.id.slice(0, 8)}`}
    >
      <div className="mb-3">
        <Field label={messageRole} hint={messageRole === "Current message" ? "A verbatim stored AI response." : "The only new wording being tested."}>
          <Input value={label} onChange={(e) => { setLabel(e.target.value); onDirty(true); }} placeholder="What AI says today" />
        </Field>
      </div>

      {kind === "measured_ai" && (
        <div className="mb-3">
          <span className="label-mono text-xs text-ink/60">
            Pick one verbatim stored response
          </span>
          {totalCount === 0 && initialResponses.length === 0 ? (
            <p className="mt-2 rounded-md border border-warn px-3 py-2 font-mono text-xs text-warn">
              No stored responses yet. Complete an Evidence audit first, then return here.
            </p>
          ) : (
            <>
              {themes.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Message themes">
                  <button
                    type="button"
                    onClick={() => chooseTheme("")}
                    aria-pressed={themeKey === ""}
                    disabled={pageLoading}
                    className={`label-mono rounded-md border px-2 py-1.5 text-xs transition-micro ${themeKey === "" ? "border-accent bg-accent text-ink" : "border-ink/20 text-ink/65 hover:border-ink/40"}`}
                  >
                    All responses · {totalCount}
                  </button>
                  {themes.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => chooseTheme(t.key)}
                      aria-pressed={themeKey === t.key}
                      disabled={pageLoading}
                      className={`label-mono rounded-md border px-2 py-1.5 text-xs transition-micro ${themeKey === t.key ? "border-accent bg-accent text-ink" : "border-ink/20 text-ink/65 hover:border-ink/40"}`}
                    >
                      {t.label} · {t.matching}/{t.total}
                    </button>
                  ))}
                </div>
              )}
              {selectedOption && (
                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-accent/40 bg-paper-2/40 px-3 py-2">
                  <Stamp tone="accent">Selected</Stamp>
                  <span className="min-w-0 flex-1 font-mono text-xs text-ink/75">
                    {selectedOption.providerId}
                    {" · "}
                    {(selectedOption.observationQuote?.trim() || selectedOption.excerpt).slice(0, 120)}
                  </span>
                </div>
              )}
              {themeKey && visibleResponses.length === 0 && !pageLoading ? (
                <EmptyState
                  kind="filtered-zero"
                  title="No responses in this theme"
                  action={{ onClick: () => chooseTheme(""), label: "Clear theme" }}
                  className="mt-2 py-6"
                >
                  Try another theme or show all stored responses.
                </EmptyState>
              ) : (
                <div className="mt-2 grid max-h-72 gap-2 overflow-y-auto pr-1" role="radiogroup" aria-label="Stored responses">
                  {visibleResponses.map((row) => {
                    const preview = row.observationQuote?.trim() || row.excerpt;
                    return (
                      <div
                        key={row.id}
                        className={`rounded-md border p-2 font-mono text-xs transition-micro ${selectedResponseId === row.id ? "border-accent bg-paper-2/50 text-ink/85" : "border-ink/10 text-ink/65"}`}
                      >
                        <label className="flex cursor-pointer gap-2">
                          <input
                            type="radio"
                            name={`baseline-${stimulus.id}`}
                            checked={selectedResponseId === row.id}
                            onChange={() => chooseAsBaseline(row)}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-ink/45">
                              {row.providerId}
                              {row.generationMode ? ` · ${row.generationMode}` : ""}
                              {" · “"}
                              {row.promptText.slice(0, 64)}
                              {row.promptText.length > 64 ? "…" : ""}”
                            </span>
                            {preview}
                          </span>
                        </label>
                        <div className="mt-2 pl-6">
                          <button
                            type="button"
                            className="label-mono rounded-sm text-[11px] text-ink/55 underline underline-offset-4 transition-micro hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                            onClick={() => setFullResponseId(row.id)}
                          >
                            View full response
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {nextCursor && (
                <div className="mt-2">
                  <Button
                    type="button"
                    variant="secondary"
                    pending={pageLoading}
                    pendingLabel="Loading…"
                    onClick={() =>
                      void loadPickerPage({ cursor: nextCursor, themeKey, append: true })
                    }
                  >
                    Load more responses
                  </Button>
                </div>
              )}
              {pageError && (
                <InlineStatus tone="danger" className="mt-2">
                  {pageError}
                </InlineStatus>
              )}
              <AppDialog
                open={fullResponse !== null}
                onOpenChange={(open) => {
                  if (!open) setFullResponseId(null);
                }}
                title="Full stored response"
                description="Use as Current message selects this stored response for the A/B comparison."
                className="w-[min(100%-2rem,48rem)]"
              >
                {fullResponse && (
                  <div className="space-y-4">
                    <dl className="grid gap-2 font-mono text-xs text-ink/65 sm:grid-cols-2">
                      <div>
                        <dt className="text-ink/45">Provider</dt>
                        <dd>{fullResponse.providerId}</dd>
                      </div>
                      <div>
                        <dt className="text-ink/45">Mode</dt>
                        <dd>{fullResponse.generationMode ?? "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-ink/45">Model</dt>
                        <dd>{fullResponse.modelVersion ?? "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-ink/45">Date</dt>
                        <dd>
                          {fullResponse.createdAt
                            ? new Date(fullResponse.createdAt).toLocaleString("en-GB", {
                                hour12: false,
                              })
                            : "—"}
                        </dd>
                      </div>
                    </dl>
                    <div>
                      <p className="label-mono mb-1 text-xs text-ink/45">Original prompt</p>
                      <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md border border-ink/10 bg-paper-2/40 p-3 font-mono text-xs text-ink/75">
                        {fullResponse.promptText}
                      </pre>
                    </div>
                    <div>
                      <p className="label-mono mb-1 text-xs text-ink/45">Full response</p>
                      <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-md border border-ink/10 bg-paper-2/40 p-3 font-mono text-xs text-ink/80">
                        {fullResponse.verbatim}
                      </pre>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" onClick={() => chooseAsBaseline(fullResponse)}>
                        Use as Current message
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setFullResponseId(null)}
                      >
                        Close
                      </Button>
                    </div>
                  </div>
                )}
              </AppDialog>
              <div className="mt-2 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-mono text-[11px] text-ink/65">
                    {themesSource === "framing_observations"
                      ? "Themes machine-grouped from blind framing observations (D-114) — labels are machine-generated."
                      : "Themes grouped by extracted attributes."}
                  </p>
                  {themesSource === "attributes" && !framingBatchActive && (
                    <Button
                      type="button"
                      variant="secondary"
                      pending={refining}
                      pendingLabel="Queueing extraction"
                      disabled={pending && !refining}
                      onClick={onRefineThemes}
                    >
                      Group messages from Evidence
                    </Button>
                  )}
                </div>
              </div>
              {activeTheme && (
                <p className="mt-2 font-mono text-[11px] text-ink/65">
                  {activeTheme.matching <= 1
                    ? "SINGLE OBSERVED INSTANCE — this framing was seen once; it can be tested, but is never called recurring."
                    : `Theme “${activeTheme.label}” appears in ${activeTheme.matching}/${activeTheme.total} sampled responses (descriptive count).`}
                </p>
              )}
              {stimulus.stampLine && selectedResponseId === (stimulus.evidenceResponseIdsJson?.[0] ?? "") && (
                <p className="mt-1 font-mono text-[11px] text-ink/55">Saved Current message source: {stimulus.stampLine}</p>
              )}
            </>
          )}
        </div>
      )}

      <Field
        label="Message text"
        hint={kind === "measured_ai" ? "Verbatim from the stored response." : "Paste the exact new wording to test."}
      >
        <Textarea value={body} rows={4} readOnly={kind === "measured_ai"} onChange={(e) => { setBody(e.target.value); onDirty(true); }} />
      </Field>

      {needsEvidence && (
        <p className="mt-2 rounded-md border border-warn px-3 py-2 font-mono text-xs text-warn">
          Pick the stored AI response used as the Current message.
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          pending={pendingKey === `save-${stimulus.id}`}
          pendingLabel="Saving message"
          disabled={pending && pendingKey !== `save-${stimulus.id}`}
          onClick={() =>
            onSave(
              { kind, label, body },
              selectedResponseId ? [selectedResponseId] : [],
              themeKey || null,
            )
          }
        >
          Save message
        </Button>
        <Button type="button" variant="danger" disabled={pending} onClick={onDelete}>
          Delete
        </Button>
      </div>
    </div>
  );
}
