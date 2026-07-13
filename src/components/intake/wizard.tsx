"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Button, InlineStatus } from "@/components/ui";
import {
  type FieldErrors,
  INTAKE_STEPS,
  type IntakeDraft,
  type IntakeStepKey,
  REVIEW_STEP,
} from "@/core/intake";
import {
  autosaveStep,
  completeStep,
  finishIntake,
} from "@/modules/intake/actions";
import { Review } from "./review";
import { STEP_DEFAULTS, StepForm } from "./step-forms";

const AUTOSAVE_DEBOUNCE_MS = 800;

type AutosaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved"; savedAt: string }
  | { status: "error" };

function withDefaults(server: IntakeDraft): Record<IntakeStepKey, unknown> {
  const merged = {} as Record<IntakeStepKey, unknown>;
  for (const { key } of INTAKE_STEPS) {
    const defaults = structuredClone(STEP_DEFAULTS[key]);
    const value = server[key];
    merged[key] =
      value && typeof value === "object" && !Array.isArray(value)
        ? { ...(defaults as Record<string, unknown>), ...(value as Record<string, unknown>) }
        : (value ?? defaults);
  }
  return merged;
}

export function IntakeWizard(props: {
  projectId: string | null;
  intakeStep: number;
  draft: IntakeDraft;
  initialStep: number | null;
}) {
  const router = useRouter();
  const [projectId, setProjectId] = useState(props.projectId);
  const [highWater, setHighWater] = useState(props.intakeStep);
  const [step, setStep] = useState(
    Math.min(props.initialStep ?? props.intakeStep, props.intakeStep),
  );
  const [draft, setDraft] = useState(() => withDefaults(props.draft));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [stepErrors, setStepErrors] = useState<
    Partial<Record<IntakeStepKey, FieldErrors>>
  >({});
  const [autosaveState, setAutosaveState] = useState<AutosaveState>({ status: "idle" });
  const [returnToReview, setReturnToReview] = useState(false);
  const [pending, startTransition] = useTransition();
  const projectIdRef = useRef(projectId);
  const saveVersion = useRef(0);

  const currentKey: IntakeStepKey | null =
    step <= 7 ? INTAKE_STEPS[step - 1].key : null;

  // Keep the URL resumable: refresh mid-step restores project and step.
  useEffect(() => {
    const params = new URLSearchParams();
    if (projectId) params.set("id", projectId);
    params.set("step", String(step));
    router.replace(`/projects/new?${params.toString()}`, { scroll: false });
  }, [projectId, step, router]);

  const performAutosave = useCallback(
    async (key: IntakeStepKey, payload: unknown, version: number) => {
      setAutosaveState({ status: "saving" });
      const result = await autosaveStep(projectIdRef.current, key, payload);
      if (version !== saveVersion.current) return;
      if (result.projectId && result.savedAt) {
        projectIdRef.current = result.projectId;
        setProjectId(result.projectId);
        setAutosaveState({ status: "saved", savedAt: result.savedAt });
        return;
      }
      setAutosaveState({ status: "error" });
    },
    [],
  );

  // PS-2: debounced server-side autosave of the current step's raw values.
  const skipNextSave = useRef(true);
  useEffect(() => {
    if (!currentKey) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    const key = currentKey;
    const payload = draft[key];
    if (
      !projectIdRef.current &&
      key === "basics" &&
      !(payload as { name?: string }).name?.trim()
    ) {
      setAutosaveState({ status: "idle" });
      return;
    }
    const version = ++saveVersion.current;
    const timer = setTimeout(
      () => void performAutosave(key, payload, version),
      AUTOSAVE_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [draft, currentKey, performAutosave]);

  function retryAutosave() {
    if (!currentKey) return;
    const version = ++saveVersion.current;
    void performAutosave(currentKey, draft[currentKey], version);
  }

  function focusFirstInvalidField() {
    requestAnimationFrame(() => {
      const field = document.querySelector<HTMLElement>(
        '[data-intake-step] [data-field-error="true"] input, ' +
          '[data-intake-step] [data-field-error="true"] select, ' +
          '[data-intake-step] [data-field-error="true"] textarea',
      );
      field?.focus();
    });
  }

  function goToStep(target: number) {
    saveVersion.current += 1;
    skipNextSave.current = true;
    setErrors({});
    setStep(target);
  }

  function onNext() {
    if (!currentKey) return;
    const key = currentKey;
    startTransition(async () => {
      const result = await completeStep(projectId, key, draft[key]);
      if (!result.ok) {
        setErrors(result.fieldErrors);
        focusFirstInvalidField();
        return;
      }
      setProjectId(result.projectId);
      setHighWater((h) => Math.max(h, step + 1));
      const target = returnToReview ? REVIEW_STEP : step + 1;
      setReturnToReview(false);
      goToStep(target);
    });
  }

  function onComplete() {
    if (!projectId) return;
    startTransition(async () => {
      const result = await finishIntake(projectId);
      if (result.ok) {
        router.push("/projects");
        return;
      }
      setStepErrors(result.stepErrors);
    });
  }

  function editFromReview(target: number) {
    setReturnToReview(true);
    goToStep(target);
  }

  return (
    <div className="flex min-w-0 flex-col gap-6 lg:flex-row lg:gap-8">
      {/* Progress rail: numbered mono stops (design §8 wizard). */}
      <aside className="w-full min-w-0 shrink-0 lg:w-56" aria-label="Project intake progress">
        <ol className="local-tab-rail flex gap-1 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
          {INTAKE_STEPS.map(({ step: n, label }) => {
            const reachable = n <= highWater;
            const active = n === step;
            const completed = n < highWater;
            return (
              <li key={n} className="shrink-0 lg:w-full">
                <button
                  type="button"
                  disabled={!reachable}
                  onClick={() => goToStep(n)}
                  aria-current={active ? "step" : undefined}
                  className={`label-mono min-h-11 w-full rounded-lg px-3 py-2 text-left text-xs transition-micro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                    active
                      ? "bg-accent text-ink"
                      : reachable
                        ? "text-ink/70 hover:bg-paper-2"
                        : "cursor-not-allowed text-ink/30"
                  }`}
                >
                  {String(n).padStart(2, "0")} {label}
                  <span className="sr-only">
                    {active ? ", current step" : completed ? ", completed" : ", future step"}
                  </span>
                  {completed && !active && <span className="float-right" aria-hidden>·</span>}
                </button>
              </li>
            );
          })}
          <li className="shrink-0 lg:w-full">
            <button
              type="button"
              disabled={highWater < REVIEW_STEP}
              onClick={() => goToStep(REVIEW_STEP)}
              aria-current={step === REVIEW_STEP ? "step" : undefined}
              className={`label-mono min-h-11 w-full rounded-lg px-3 py-2 text-left text-xs transition-micro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                step === REVIEW_STEP
                  ? "bg-accent text-ink"
                  : highWater >= REVIEW_STEP
                    ? "text-ink/70 hover:bg-paper-2"
                    : "cursor-not-allowed text-ink/30"
              }`}
            >
              08 Review
              <span className="sr-only">
                {step === REVIEW_STEP
                  ? ", current step"
                  : highWater >= REVIEW_STEP
                    ? ", available"
                    : ", future step"}
              </span>
            </button>
          </li>
        </ol>
      </aside>

      <section className="min-w-0 flex-1" data-intake-step>
        <div className="mb-4 flex min-h-8 flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
          <h1 className="label-mono text-lg font-semibold">
            {step === REVIEW_STEP
              ? "Review"
              : `${String(step).padStart(2, "0")} ${INTAKE_STEPS[step - 1].label}`}
          </h1>
          {/* Quiet autosave indicator — never a toast (design §8). */}
          <span className="label-mono min-h-5 text-xs text-ink/60" role="status" aria-live="polite">
            {autosaveState.status === "saving" && "SAVING…"}
            {autosaveState.status === "saved" &&
              `SAVED ${new Date(autosaveState.savedAt).toLocaleTimeString("en-GB", {
                hour12: false,
              })}`}
            {autosaveState.status === "error" && (
              <button
                type="button"
                className="rounded-sm text-danger underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                onClick={retryAutosave}
              >
                SAVE FAILED — RETRY
              </button>
            )}
          </span>
        </div>

        {errors._root?.map((e) => (
          <InlineStatus key={e} tone="danger" className="mb-3">
            {e}
          </InlineStatus>
        ))}

        {currentKey ? (
          <>
            <StepForm
              stepKey={currentKey}
              value={draft[currentKey]}
              errors={errors}
              onChange={(value) =>
                setDraft((d) => ({ ...d, [currentKey]: value }))
              }
            />
            <div className="mt-6 flex items-center justify-between gap-3">
              <Button
                variant="secondary"
                disabled={step === 1}
                onClick={() => goToStep(step - 1)}
              >
                Back
              </Button>
              <Button
                onClick={onNext}
                pending={pending}
                pendingLabel="Saving…"
              >
                {returnToReview ? "Save & Review" : "Next"}
              </Button>
            </div>
          </>
        ) : (
          <Review
            draft={draft}
            stepErrors={stepErrors}
            pending={pending}
            onEdit={editFromReview}
            onComplete={onComplete}
          />
        )}
      </section>
    </div>
  );
}
