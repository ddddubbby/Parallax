"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { GlossaryTerm } from "@/components/semantic/glossary-term";
import { SimulatedBadge } from "@/components/simulated-badge";
import { Button, Field, Input, Stamp } from "@/components/ui";
import type { GenerationMode, ProviderId, RunMode } from "@/core/runner";
import { createRun, projectRunCost, type RunCreationInput } from "@/modules/runner/actions";
import { reportError } from "@/observability";

interface ProviderOption {
  id: ProviderId;
  displayName: string;
  supportsGrounded: boolean;
  supportsUngrounded: boolean;
}

const MODES: GenerationMode[] = ["ungrounded", "grounded"];

// C-9: run mode is the first choice, and it constrains everything below —
// mock runs see only the mock provider (free, fixture-backed), live runs
// see only real providers (real spend). live_audit locks k=5 (C-1).
const RUN_MODES: Array<{ id: RunMode; label: string; hint: string }> = [
  { id: "mock", label: "Mock", hint: "fixtures, free" },
  { id: "live_validation", label: "Live validation", hint: "real spend, never client-ready" },
  { id: "live_audit", label: "Live audit", hint: "real spend, k=5 locked" },
];

export function RunCreationForm({
  projectId,
  cellCount,
  providers,
  defaultValidationCapUsd,
  defaultAuditCapUsd,
  matrixVersionId,
  singleMode = false,
}: {
  projectId: string;
  cellCount: number;
  providers: ProviderOption[];
  defaultValidationCapUsd: number;
  defaultAuditCapUsd: number;
  matrixVersionId?: string;
  // D-080 (supersedes D-067): a Resonance run locks generation MODE to a
  // single choice (no mode dimension in resonance scopes) but now allows
  // multiple providers — each scored as its own synthetic population.
  singleMode?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [runMode, setRunMode] = useState<RunMode>("mock");
  const [selectedProviders, setSelectedProviders] = useState<ProviderId[]>(["mock"]);
  const [selectedModes, setSelectedModes] = useState<GenerationMode[]>(["ungrounded"]);
  const [repetitions, setRepetitions] = useState(5);
  const [costCapUsd, setCostCapUsd] = useState(defaultAuditCapUsd);
  const [injectionEnabled, setInjectionEnabled] = useState(false);
  const [injectionRate, setInjectionRate] = useState(0.15);
  const [injectionErrorType, setInjectionErrorType] = useState("rate_limit");
  const [extractionInjectionEnabled, setExtractionInjectionEnabled] = useState(false);
  const [extractionInvalidRate, setExtractionInvalidRate] = useState(0.15);
  const [projectionFailed, setProjectionFailed] = useState(false);
  const [projection, setProjection] = useState<{
    plannedCalls: number;
    projectedCostUsd: number;
    budgets: Array<{ providerId: string; spentUsd: number; budgetUsd: number; projectedUsd: number }>;
  } | null>(null);

  const visibleProviders = providers.filter((p) =>
    runMode === "mock" ? p.id === "mock" : p.id !== "mock",
  );
  const isLive = runMode !== "mock";
  const effectiveRepetitions = runMode === "live_audit" ? 5 : repetitions;

  function selectRunMode(next: RunMode) {
    setRunMode(next);
    // Reset dependent state so a mode switch can't smuggle a provider or
    // debug flag the new mode disallows (server re-validates regardless).
    setSelectedProviders(next === "mock" ? ["mock"] : []);
    setCostCapUsd(next === "live_validation" ? defaultValidationCapUsd : defaultAuditCapUsd);
    if (next !== "mock") {
      setInjectionEnabled(false);
      setExtractionInjectionEnabled(false);
    }
    if (next === "live_validation") setRepetitions(2);
    if (next === "live_audit") setRepetitions(5);
  }

  const input: RunCreationInput = {
    matrixVersionId,
    runMode,
    providers: selectedProviders,
    modes: selectedModes,
    repetitions: effectiveRepetitions,
    costCapUsd,
    debugFailureInjection:
      runMode === "mock" && (injectionEnabled || extractionInjectionEnabled)
        ? {
            ...(injectionEnabled && { generation: { rate: injectionRate, errorType: injectionErrorType } }),
            ...(extractionInjectionEnabled && { extraction: { invalidRate: extractionInvalidRate } }),
          }
        : null,
  };

  useEffect(() => {
    if (selectedProviders.length === 0 || selectedModes.length === 0) {
      setProjection(null);
      return;
    }
    let cancelled = false;
    setProjectionFailed(false);
    projectRunCost(projectId, input)
      .then((result) => {
        if (cancelled) return;
        if (result.ok) {
          setProjection({
            plannedCalls: result.plannedCalls,
            projectedCostUsd: result.projectedCostUsd,
            budgets: result.budgets,
          });
        } else {
          setProjection(null);
          setProjectionFailed(true);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        // Don't silently drop the projection — the operator needs to know the
        // cost preview is unavailable before submitting a paid run.
        reportError(err, { boundary: "run-cost-projection", projectId });
        setProjection(null);
        setProjectionFailed(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, matrixVersionId, runMode, selectedProviders.join(","), selectedModes.join(","), effectiveRepetitions]);

  function toggle<T>(list: T[], value: T, set: (next: T[]) => void, single = false) {
    if (single) {
      set([value]);
      return;
    }
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  function onSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await createRun(projectId, input);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/projects/${projectId}/runs/${result.runId}`);
    });
  }

  const overCap = projection ? projection.projectedCostUsd > costCapUsd : false;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <span className="label-mono text-xs text-ink/60">Approved matrix</span>
        <p className="text-sm text-ink/85">
          {cellCount} <GlossaryTerm term="cell">cells</GlossaryTerm>
          {singleMode && <span className="ml-2"><SimulatedBadge /></span>}
        </p>
        {singleMode && (
          <p className="mt-2 font-mono text-xs text-ink/55">
            Simulation runs may select multiple providers but exactly one generation mode; each engine is reported as its own synthetic population, never pooled (D-080).
          </p>
        )}
      </div>

      <Field label="Run mode">
        <div className="flex flex-wrap gap-2">
          {RUN_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => selectRunMode(m.id)}
              className={`label-mono rounded-full px-4 py-1.5 text-xs transition-micro ${
                runMode === m.id
                  ? "bg-ink text-paper"
                  : "border border-ink/25 text-ink/60 hover:border-ink"
              }`}
            >
              {m.label}
              <span className={runMode === m.id ? "ml-1.5 text-paper/60" : "ml-1.5 text-ink/40"}>
                {m.hint}
              </span>
            </button>
          ))}
        </div>
      </Field>

      {isLive && (
        <p className="rounded-lg border border-warn px-3 py-2 font-mono text-xs text-warn">
          {runMode === "live_validation"
            ? "Live validation spends real money and is labeled VALIDATION-ONLY — never client-ready evidence."
            : <>Live audit spends real money at k=5 per <GlossaryTerm term="cell">cell</GlossaryTerm> per <GlossaryTerm term="engine-mode">engine-mode</GlossaryTerm>.</>}
        </p>
      )}

      <Field label="Providers">
        <div className="flex flex-wrap gap-2">
          {visibleProviders.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => toggle(selectedProviders, p.id, setSelectedProviders)}
              className={`label-mono rounded-full px-4 py-1.5 text-xs transition-micro ${
                selectedProviders.includes(p.id)
                  ? "bg-ink text-paper"
                  : "border border-ink/25 text-ink/60 hover:border-ink"
              }`}
            >
              {p.displayName}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Generation modes" hint={singleMode ? "Resonance runs lock to one mode — no mode dimension in resonance scopes (D-080)" : undefined}>
        <div className="flex gap-2">
          {MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => toggle(selectedModes, mode, setSelectedModes, singleMode)}
              className={`label-mono rounded-full px-4 py-1.5 text-xs transition-micro ${
                selectedModes.includes(mode)
                  ? "bg-ink text-paper"
                  : "border border-ink/25 text-ink/60 hover:border-ink"
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Repetitions"
          hint={runMode === "live_audit" ? "k=5 is protected for audit-grade runs (C-1)" : undefined}
        >
          <Input
            type="number"
            min={1}
            max={5}
            value={effectiveRepetitions}
            disabled={runMode === "live_audit"}
            onChange={(e) => setRepetitions(Number(e.target.value))}
          />
        </Field>
        <Field label="Run dollar cap (USD)">
          <Input
            type="number"
            min={0}
            step={0.01}
            value={costCapUsd}
            onChange={(e) => setCostCapUsd(Number(e.target.value))}
          />
        </Field>
      </div>

      {projectionFailed && (
        <p className="rounded-lg border border-warn px-3 py-2 font-mono text-xs text-warn">
          Cost projection is unavailable right now. You can still submit — the
          run&rsquo;s cost cap and daily budgets are re-checked server-side before
          any spend.
        </p>
      )}

      {projection && (
        <div className="rounded-xl border border-ink/15 p-4">
          <div className="flex items-center justify-between font-mono text-sm">
            <span>Planned calls</span>
            <span>{projection.plannedCalls}</span>
          </div>
          <div
            className={`flex items-center justify-between font-mono text-sm ${overCap ? "text-danger" : ""}`}
          >
            <span>
              Projected cost
              {isLive ? (singleMode ? " (generation + SSR scoring, D-022)" : " (generation + extraction, D-022)") : ""}
            </span>
            <span>${projection.projectedCostUsd.toFixed(4)}</span>
          </div>
          {overCap && (
            <p className="mt-2 font-mono text-xs text-danger">
              Exceeds the ${costCapUsd} cap — run creation will be blocked server-side (RN-2)
            </p>
          )}
          {projection.budgets.length > 0 && (
            <div className="mt-3 border-t border-ink/10 pt-3">
              <span className="label-mono text-xs text-ink/45">
                Daily budget (spent today / cap, C-2)
              </span>
              {projection.budgets.map((b) => {
                const already = b.spentUsd >= b.budgetUsd;
                const wouldExceed = b.spentUsd + b.projectedUsd > b.budgetUsd;
                return (
                  <div
                    key={b.providerId}
                    className={`mt-1 flex items-center justify-between font-mono text-xs ${
                      already ? "text-danger" : wouldExceed ? "text-warn" : "text-ink/60"
                    }`}
                  >
                    <span>{b.providerId}</span>
                    <span>
                      ${b.spentUsd.toFixed(4)} + ${b.projectedUsd.toFixed(4)} projected / ${b.budgetUsd.toFixed(2)}
                      {already
                        ? " — already over; run blocked server-side"
                        : wouldExceed
                          ? " — projected spend will be blocked server-side"
                          : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {runMode === "mock" && (
        <div className="rounded-xl border border-warn p-4">
          <label className="label-mono flex items-center gap-2 text-xs text-ink/70">
            <input
              type="checkbox"
              checked={injectionEnabled}
              onChange={(e) => setInjectionEnabled(e.target.checked)}
            />
            Generation failure injection (testing) <Stamp tone="warn">Debug</Stamp>
          </label>
          {injectionEnabled && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label="Rate (0-1)">
                <Input
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={injectionRate}
                  onChange={(e) => setInjectionRate(Number(e.target.value))}
                />
              </Field>
              <Field label="Error type">
                <select
                  className="w-full rounded-lg border border-ink/20 bg-paper px-3 py-2 text-sm"
                  value={injectionErrorType}
                  onChange={(e) => setInjectionErrorType(e.target.value)}
                >
                  {["rate_limit", "timeout", "server_error", "auth_error", "malformed_output"].map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}
          <label className="label-mono mt-4 flex items-center gap-2 border-t border-warn/40 pt-4 text-xs text-ink/70">
            <input
              type="checkbox"
              checked={extractionInjectionEnabled}
              onChange={(e) => setExtractionInjectionEnabled(e.target.checked)}
            />
            Extraction failure injection (testing) <Stamp tone="warn">Debug</Stamp>
          </label>
          {extractionInjectionEnabled && (
            <div className="mt-3">
              <Field label="Invalid rate (0-1)" hint="Forces validation to fail this fraction of extraction attempts (SM-2/SM-3)">
                <Input
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={extractionInvalidRate}
                  onChange={(e) => setExtractionInvalidRate(Number(e.target.value))}
                />
              </Field>
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="rounded-lg border border-danger px-3 py-2 font-mono text-xs text-danger">
          {error}
        </p>
      )}

      <Button disabled={pending || selectedProviders.length === 0} onClick={onSubmit}>
        {pending ? "Starting…" : "Start run"}
      </Button>
    </div>
  );
}
