"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui";
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

function withDefaults(server: IntakeDraft): Record<IntakeStepKey, unknown> {
  const merged = {} as Record<IntakeStepKey, unknown>;
  for (const { key } of INTAKE_STEPS) {
    merged[key] = server[key] ?? structuredClone(STEP_DEFAULTS[key]);
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
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [returnToReview, setReturnToReview] = useState(false);
  const [pending, startTransition] = useTransition();

  const currentKey: IntakeStepKey | null =
    step <= 7 ? INTAKE_STEPS[step - 1].key : null;

  // Keep the URL resumable: refresh mid-step restores project and step.
  useEffect(() => {
    const params = new URLSearchParams();
    if (projectId) params.set("id", projectId);
    params.set("step", String(step));
    router.replace(`/projects/new?${params.toString()}`, { scroll: false });
  }, [projectId, step, router]);

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
    const timer = setTimeout(async () => {
      const result = await autosaveStep(projectId, key, payload);
      if (result.projectId) {
        setProjectId(result.projectId);
        setSavedAt(result.savedAt);
      }
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft, currentKey, projectId]);

  function goToStep(target: number) {
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
    <div className="flex gap-8">
      {/* Progress rail: numbered mono stops (design §8 wizard). */}
      <aside className="w-56 shrink-0">
        <ol className="flex flex-col gap-1">
          {INTAKE_STEPS.map(({ step: n, label }) => {
            const reachable = n <= highWater;
            const active = n === step;
            return (
              <li key={n}>
                <button
                  type="button"
                  disabled={!reachable}
                  onClick={() => goToStep(n)}
                  className={`label-mono w-full rounded-lg px-3 py-2 text-left text-xs transition-micro ${
                    active
                      ? "bg-accent text-paper"
                      : reachable
                        ? "text-ink/70 hover:bg-paper-2"
                        : "cursor-not-allowed text-ink/30"
                  }`}
                >
                  {String(n).padStart(2, "0")} {label}
                  {n < highWater && !active && <span className="float-right">·</span>}
                </button>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              disabled={highWater < REVIEW_STEP}
              onClick={() => goToStep(REVIEW_STEP)}
              className={`label-mono w-full rounded-lg px-3 py-2 text-left text-xs transition-micro ${
                step === REVIEW_STEP
                  ? "bg-accent text-paper"
                  : highWater >= REVIEW_STEP
                    ? "text-ink/70 hover:bg-paper-2"
                    : "cursor-not-allowed text-ink/30"
              }`}
            >
              08 Review
            </button>
          </li>
        </ol>
      </aside>

      <section className="min-w-0 flex-1">
        <div className="mb-4 flex items-baseline justify-between">
          <h1 className="label-mono text-lg font-semibold">
            {step === REVIEW_STEP
              ? "Review"
              : `${String(step).padStart(2, "0")} ${INTAKE_STEPS[step - 1].label}`}
          </h1>
          {/* Quiet autosave indicator — never a toast (design §8). */}
          {savedAt && (
            <span className="font-mono text-xs text-ink/45">
              Saved{" "}
              {new Date(savedAt).toLocaleTimeString("en-GB", { hour12: false })}
            </span>
          )}
        </div>

        {errors._root?.map((e) => (
          <p key={e} className="mb-3 font-mono text-xs text-danger">
            {e}
          </p>
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
            <div className="mt-6 flex justify-between">
              <Button
                variant="secondary"
                disabled={step === 1}
                onClick={() => goToStep(step - 1)}
              >
                Back
              </Button>
              <Button onClick={onNext} disabled={pending}>
                {pending ? "Saving…" : returnToReview ? "Save & Review" : "Next"}
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
