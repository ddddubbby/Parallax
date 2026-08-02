"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { GlossaryTerm } from "@/components/semantic/glossary-term";
import { SimulatedBadge } from "@/components/simulated-badge";
import { Button, Field, InlineStatus, Input, Select, Stamp } from "@/components/ui";
import { AppConfirmDialog } from "@/components/ui/dialog";
import {
  drawFloorMet,
  drawsPerVariant,
  totalSimulationCalls,
} from "@/core/resonance-draws";
import type { GenerationMode, ProviderId, RunMode } from "@/core/runner";
import { startRunLabel } from "@/core/run-labels";
import {
  createRun,
  projectRunCost,
  type RunCreationInput,
  type SecondaryRequirement,
} from "@/modules/runner/actions";
import { reportError } from "@/observability";

type LiveConfirmSnapshot = {
  runMode: RunMode;
  providers: ProviderId[];
  modes: GenerationMode[];
  repetitions: number;
  costCapUsd: number;
  plannedCalls: number | null;
  projectedCostUsd: number | null;
  projectionUnavailable: boolean;
};

interface ProviderOption {
  id: ProviderId;
  displayName: string;
  supportsGrounded: boolean;
  supportsUngrounded: boolean;
  /** M32 / D-088: live providers need an active Settings credential. */
  credentialState?: "not_required" | "active" | "disabled" | "missing";
}

const MODES: GenerationMode[] = ["ungrounded", "grounded"];

// C-9: run mode is the first choice, and it constrains everything below —
// mock runs see only the mock provider (free, fixture-backed), live runs
// see only real providers (real spend). live_audit locks k=5 (C-1).
const RUN_MODES: Array<{ id: RunMode; label: string; hint: string }> = [
  { id: "mock", label: "Mock", hint: "fixtures, free" },
  { id: "live_validation", label: "Live validation", hint: "real spend, never client-ready" },
  { id: "live_audit", label: "Live audit", hint: "real spend, 5 repeats per prompt" },
];

export function RunCreationForm({
  projectId,
  cellCount,
  providers,
  defaultValidationCapUsd,
  defaultAuditCapUsd,
  matrixVersionId,
  singleMode = false,
  secondaryRequirement = null,
  matrixLabel,
  panelCount = null,
  framingCount = null,
  messageLiftTestType = null,
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
  /** M32 / D-088: extraction (audit) or embedding (simulation) readiness. */
  secondaryRequirement?: SecondaryRequirement | null;
  matrixLabel?: string;
  /** M46/D-117: Simulation footprint for draw math when projection is sparse. */
  panelCount?: number | null;
  framingCount?: number | null;
  messageLiftTestType?: "buyer_response" | "ai_recommendation" | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [runMode, setRunMode] = useState<RunMode>("mock");
  const [selectedProviders, setSelectedProviders] = useState<ProviderId[]>(["mock"]);
  const [selectedModes, setSelectedModes] = useState<GenerationMode[]>(["ungrounded"]);
  const [repetitions, setRepetitions] = useState(5);
  const [costCapUsd, setCostCapUsd] = useState(defaultAuditCapUsd);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [injectionEnabled, setInjectionEnabled] = useState(false);
  const [injectionRate, setInjectionRate] = useState(0.15);
  const [injectionErrorType, setInjectionErrorType] = useState("rate_limit");
  const [extractionInjectionEnabled, setExtractionInjectionEnabled] = useState(false);
  const [extractionInvalidRate, setExtractionInvalidRate] = useState(0.15);
  const [projectionFailed, setProjectionFailed] = useState(false);
  const [projecting, setProjecting] = useState(false);
  const [liveConfirm, setLiveConfirm] = useState<LiveConfirmSnapshot | null>(null);
  const [projection, setProjection] = useState<{
    plannedCalls: number;
    projectedCostUsd: number;
    budgets: Array<{ providerId: string; spentUsd: number; budgetUsd: number; projectedUsd: number }>;
    drawsPerVariant: number | null;
    totalCalls: number;
    drawFloorMet: boolean | null;
    panelCount: number | null;
    framingCount: number | null;
  } | null>(null);

  const visibleProviders = providers.filter((p) =>
    runMode === "mock" ? p.id === "mock" : p.id !== "mock",
  );
  const isLive = runMode !== "mock";
  const isMessageLift = messageLiftTestType !== null;
  const effectiveRepetitions = isMessageLift || runMode === "live_audit" ? 5 : repetitions;

  const secondaryBlocks =
    isLive &&
    secondaryRequirement !== null &&
    secondaryRequirement.credentialState !== "active";

  const selectedBlocked = selectedProviders.some((id) => {
    const p = providers.find((x) => x.id === id);
    return p && p.credentialState !== "not_required" && p.credentialState !== "active" && isLive;
  });

  function selectRunMode(next: RunMode) {
    setRunMode(next);
    // Reset dependent state so a mode switch can't smuggle a provider or
    // injection config across the mock/live boundary (C-9).
    setSelectedProviders(next === "mock" ? ["mock"] : []);
    setCostCapUsd(next === "live_validation" ? defaultValidationCapUsd : defaultAuditCapUsd);
    if (next !== "mock") {
      setInjectionEnabled(false);
      setExtractionInjectionEnabled(false);
      setAdvancedOpen(false);
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
      setProjecting(false);
      return;
    }
    let cancelled = false;
    setProjectionFailed(false);
    setProjecting(true);
    projectRunCost(projectId, input)
      .then((result) => {
        if (cancelled) return;
        if (result.ok) {
          setProjection({
            plannedCalls: result.plannedCalls,
            projectedCostUsd: result.projectedCostUsd,
            budgets: result.budgets,
            drawsPerVariant: result.drawsPerVariant,
            totalCalls: result.totalCalls,
            drawFloorMet: result.drawFloorMet,
            panelCount: result.panelCount,
            framingCount: result.framingCount,
          });
        } else {
          setProjection(null);
          setProjectionFailed(true);
        }
        setProjecting(false);
      })
      .catch((err) => {
        if (cancelled) return;
        // Don't silently drop the projection — the operator needs to know the
        // cost preview is unavailable before submitting a paid run.
        reportError(err, { boundary: "run-cost-projection", projectId });
        setProjection(null);
        setProjectionFailed(true);
        setProjecting(false);
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

  const overCap = projection ? projection.projectedCostUsd > costCapUsd : false;
  // Prefer live projection; fall back to server-passed study footprint so
  // draw-floor copy stays visible when live providers aren't selected yet.
  const effectivePanelCount = projection?.panelCount ?? panelCount;
  const effectiveFramingCount = projection?.framingCount ?? framingCount;
  const effectiveDraws =
    projection?.drawsPerVariant ??
    (effectivePanelCount !== null
      ? drawsPerVariant(effectivePanelCount, effectiveRepetitions)
      : null);
  const effectiveFloorMet =
    projection?.drawFloorMet ??
    (effectiveDraws !== null ? drawFloorMet(effectiveDraws) : null);
  const effectiveTotalCalls =
    projection?.totalCalls ??
    (effectivePanelCount !== null && effectiveFramingCount !== null
      ? totalSimulationCalls({
          framingCount: effectiveFramingCount,
          personaCount: effectivePanelCount,
          repetitions: effectiveRepetitions,
          providerCount: Math.max(1, selectedProviders.length),
        })
      : null);
  const belowLiveDrawFloor =
    singleMode && runMode === "live_audit" && effectiveFloorMet === false;
  const previewBelowFloor =
    singleMode &&
    (runMode === "mock" || runMode === "live_validation") &&
    effectiveFloorMet === false;
  const canSubmit =
    !pending &&
    selectedProviders.length > 0 &&
    selectedModes.length > 0 &&
    !selectedBlocked &&
    !secondaryBlocks &&
    !projecting &&
    !overCap &&
    !belowLiveDrawFloor;
  const projectionState = projectionFailed
    ? "UNAVAILABLE"
    : projecting
      ? "LOADING"
      : overCap
        ? "OVER CAP"
        : belowLiveDrawFloor
          ? isMessageLift ? "MORE CONTEXT NEEDED" : "BELOW FLOOR"
          : projection
            ? "READY"
            : "UNAVAILABLE";

  function submitRun() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await createRun(projectId, input);
        if (!result.ok) {
          setError(result.error);
          setLiveConfirm(null);
          return;
        }
        setLiveConfirm(null);
        router.push(`/projects/${projectId}/runs/${result.runId}`);
      } catch {
        setError("The run could not be started. Your configuration is still here; try again.");
        setLiveConfirm(null);
      }
    });
  }

  function onSubmit() {
    if (!canSubmit) return;
    if (runMode === "mock") {
      submitRun();
      return;
    }
    // Live confirm only when projection is READY, or UNAVAILABLE with disclosure.
    // OVER CAP / BELOW FLOOR / LOADING keep Start disabled via canSubmit.
    if (projectionState === "LOADING" || projectionState === "OVER CAP" || projectionState === "BELOW FLOOR" || projectionState === "MORE CONTEXT NEEDED") {
      return;
    }
    setLiveConfirm({
      runMode,
      providers: [...selectedProviders],
      modes: [...selectedModes],
      repetitions: effectiveRepetitions,
      costCapUsd,
      plannedCalls: projection?.plannedCalls ?? null,
      projectedCostUsd: projection?.projectedCostUsd ?? null,
      projectionUnavailable: projectionFailed || !projection,
    });
  }

  // Any configuration change while the live confirm is open invalidates the snapshot.
  useEffect(() => {
    if (!liveConfirm) return;
    const changed =
      liveConfirm.runMode !== runMode ||
      liveConfirm.repetitions !== effectiveRepetitions ||
      liveConfirm.costCapUsd !== costCapUsd ||
      liveConfirm.providers.join(",") !== selectedProviders.join(",") ||
      liveConfirm.modes.join(",") !== selectedModes.join(",");
    if (changed) setLiveConfirm(null);
  }, [
    liveConfirm,
    runMode,
    effectiveRepetitions,
    costCapUsd,
    selectedProviders,
    selectedModes,
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-ink/15 p-4">
        <span className="label-mono text-xs text-ink/60">
          {isMessageLift ? "Approved Message Lift prompts" : singleMode ? "Approved simulation matrix" : "Approved matrix"}
        </span>
        <p className="text-sm text-ink/85">
          {matrixLabel ? <span>{matrixLabel} · </span> : null}
          {cellCount} <GlossaryTerm term="cell">cells</GlossaryTerm>
          {singleMode && (
            <span className="ml-2">
              <SimulatedBadge />
            </span>
          )}
        </p>
        {singleMode && !isMessageLift && (
          <p className="mt-2 text-sm leading-relaxed text-ink/60">
            Simulation runs may select multiple providers but exactly one generation mode; each
            engine is reported as its own synthetic population, never pooled (D-080).
          </p>
        )}
        {isMessageLift && (
          <p className="mt-2 text-sm leading-relaxed text-ink/60">
            The test uses one AI model and the same settings for both messages.
          </p>
        )}
      </div>

      <fieldset>
        <legend className="label-mono mb-1.5 text-xs text-ink/70">Run mode</legend>
        <div className="flex flex-wrap gap-2">
          {RUN_MODES.map((m) => {
            const label = isMessageLift
              ? m.id === "mock"
                ? "Mock preview"
                : m.id === "live_validation"
                  ? "Live check"
                  : "Full run"
              : m.label;
            const hint = isMessageLift
              ? m.id === "mock"
                ? "fixtures, free"
                : m.id === "live_validation"
                  ? "real spend, early read"
                  : "real spend"
              : m.hint;
            return (
            <button
              key={m.id}
              type="button"
              onClick={() => selectRunMode(m.id)}
              aria-pressed={runMode === m.id}
              aria-label={`${label}: ${hint}`}
              className={`interactive-press label-mono min-h-11 rounded-full px-4 py-2 text-xs transition-micro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                runMode === m.id
                  ? "bg-ink text-paper"
                  : "border border-ink/25 text-ink/60 hover:border-ink"
              }`}
            >
              {label}
              <span className={runMode === m.id ? "ml-1.5 text-paper/60" : "ml-1.5 text-ink/40"}>
                {hint}
              </span>
            </button>
            );
          })}
        </div>
      </fieldset>

      {isLive && (
        <InlineStatus tone="warning">
          {isMessageLift
            ? "This option spends real money. Resonance keeps the A/B settings fixed."
            : runMode === "live_validation"
            ? "Live validation spends real money and is labeled VALIDATION-ONLY — never client-ready evidence."
            : (
                <>
                  Live audit spends real money on 5 repeats per prompt for each <GlossaryTerm term="cell">cell</GlossaryTerm>{" "}
                  per <GlossaryTerm term="engine-mode">engine-mode</GlossaryTerm>.
                </>
              )}
        </InlineStatus>
      )}

      <fieldset>
        <legend className="label-mono mb-1.5 text-xs text-ink/70">Providers</legend>
        <div className="flex flex-wrap gap-2">
          {visibleProviders.map((p) => {
            const ready = !isLive || p.credentialState === "active" || p.credentialState === "not_required";
            const selected = selectedProviders.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                disabled={!ready}
                aria-pressed={selected}
                aria-label={`${p.displayName}${ready ? "" : `: ${p.credentialState}`}`}
                title={
                  ready
                    ? undefined
                    : `${p.displayName} credential is ${p.credentialState} — add or enable in Settings`
                }
                onClick={() => toggle(selectedProviders, p.id, setSelectedProviders, isMessageLift)}
                className={`interactive-press label-mono min-h-11 rounded-full px-4 py-2 text-xs transition-micro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                  !ready
                    ? "cursor-not-allowed border border-ink/10 text-ink/30"
                    : selected
                      ? "bg-ink text-paper"
                      : "border border-ink/25 text-ink/60 hover:border-ink"
                }`}
              >
                {p.displayName}
                {!ready && (
                  <span className="ml-1.5 text-ink/35">
                    ({p.credentialState})
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {isLive &&
          visibleProviders.some(
            (p) => p.credentialState !== "active" && p.credentialState !== "not_required",
          ) && (
            <p className="mt-2 text-sm text-ink/60">
              Missing or disabled providers are unavailable until you{" "}
              <Link href="/settings?view=providers" className="text-accent-ink hover:text-accent">
                add or enable a credential in Settings
              </Link>
              . Server checks remain authoritative.
            </p>
          )}
      </fieldset>

      {isLive && secondaryRequirement && (
        <div
          className={`rounded-xl border p-4 ${
            secondaryRequirement.credentialState === "active"
              ? "border-ink/15"
              : "border-warn"
          }`}
        >
          <span className="label-mono text-xs text-ink/60">
            {secondaryRequirement.role === "embedding" ? "Embedding engine" : "Extraction engine"}{" "}
            readiness
          </span>
          <p className="mt-1 font-mono text-sm text-ink/85">
            {secondaryRequirement.providerId}{" "}
            <Stamp
              tone={secondaryRequirement.credentialState === "active" ? "ok" : "warn"}
            >
              {secondaryRequirement.credentialState}
            </Stamp>
          </p>
          {secondaryRequirement.credentialState !== "active" && (
            <p className="mt-2 text-sm text-warn">
              Live runs need an active credential for the{" "}
              {secondaryRequirement.role === "embedding" ? "embedding" : "extraction"} engine.{" "}
              <Link href="/settings?view=providers" className="underline hover:text-accent">
                Open Settings
              </Link>
            </p>
          )}
        </div>
      )}

      {!isMessageLift && <fieldset>
        <legend className="label-mono mb-1.5 text-xs text-ink/70">Generation modes</legend>
        <div className="flex flex-wrap gap-2">
          {MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => toggle(selectedModes, mode, setSelectedModes, singleMode)}
              aria-pressed={selectedModes.includes(mode)}
              aria-label={mode}
              className={`interactive-press label-mono min-h-11 rounded-full px-4 py-2 text-xs transition-micro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                selectedModes.includes(mode)
                  ? "bg-ink text-paper"
                  : "border border-ink/25 text-ink/60 hover:border-ink"
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
        {singleMode && (
          <p className="mt-1.5 text-sm text-ink/55">
            Resonance runs lock to one mode; there is no mode dimension in resonance scopes (D-080).
          </p>
        )}
      </fieldset>}
      {isMessageLift && (
        <p className="text-sm text-ink/60">
          Resonance keeps the sampling and comparison settings fixed so only the message changes.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {!isMessageLift && <Field
          label="Repeats per prompt"
          hint={runMode === "live_audit" ? "5 repeats are protected for audit-grade runs (C-1)" : undefined}
        >
          <Input
            type="number"
            min={1}
            max={5}
            value={effectiveRepetitions}
            disabled={runMode === "live_audit"}
            onChange={(e) => setRepetitions(Number(e.target.value))}
          />
        </Field>}
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

      <div
        className="flex min-h-16 items-center justify-between gap-4 rounded-xl border border-ink/15 px-4 py-3"
        role="status"
        aria-live="polite"
        aria-busy={projecting || undefined}
      >
        <div>
          <span className="label-mono text-xs text-ink/60">Cost projection</span>
          <p className="mt-1 text-sm text-ink/60">
            {projectionState === "LOADING"
              ? "Calculating calls, cost, and provider budgets…"
              : projectionState === "READY"
                ? "Calls, cost, and provider budgets are ready for review."
                : projectionState === "OVER CAP"
                  ? "Projected cost exceeds this run’s dollar cap."
                  : selectedProviders.length === 0
                    ? "Select at least one available provider to calculate the projection."
                    : "The projection is unavailable; server-side limits remain authoritative."}
          </p>
        </div>
        <span
          className={`label-mono shrink-0 text-xs ${
            projectionState === "OVER CAP" || projectionState === "BELOW FLOOR"
              ? "text-danger"
              : projectionState === "UNAVAILABLE"
                ? "text-warn"
                : "text-ink/70"
          }`}
        >
          {projectionState}
        </span>
      </div>

      {projectionFailed && (
        <InlineStatus tone="warning">
          Cost projection is unavailable right now. You can still submit — the run&rsquo;s cost cap
          and daily budgets are re-checked server-side before any spend.
        </InlineStatus>
      )}

      {singleMode && !isMessageLift && effectiveDraws !== null && (
        <div className="rounded-xl border border-ink/15 p-4 font-mono text-xs text-ink/70">
          <p className="label-mono mb-2 text-xs text-ink/60">Simulation math</p>
          <p>
            {effectivePanelCount ?? "—"} {messageLiftTestType === "ai_recommendation" ? "shopping situations" : "buyer profiles"} × {effectiveRepetitions} repeats per message ={" "}
            {effectiveDraws} responses per message/model
          </p>
          <p className="mt-1">
            {effectiveFramingCount ?? "—"} messages × {effectivePanelCount ?? "—"} contexts ×{" "}
            {effectiveRepetitions} repeats per message × {Math.max(1, selectedProviders.length)} AI model ={" "}
            {effectiveTotalCalls ?? "—"} total calls
          </p>
          <p className="mt-1 text-ink/55">
            Enough-samples status is assessed per message and AI model.
          </p>
        </div>
      )}

      {previewBelowFloor && (
        <InlineStatus tone="warning">
          Early read. A full run needs at least six contexts.
        </InlineStatus>
      )}

      {belowLiveDrawFloor && (
        <InlineStatus tone="danger">
          Full run blocked — at least six contexts are required.
        </InlineStatus>
      )}

      {projection && (
        <div className="rounded-xl border border-ink/15 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-sm">
            <span>Planned calls</span>
            <span>{projection.plannedCalls}</span>
          </div>
          <div
            className={`flex flex-wrap items-center justify-between gap-2 font-mono text-sm ${overCap ? "text-danger" : ""}`}
          >
            <span>
              Projected cost
              {isLive
                ? singleMode
                  ? messageLiftTestType === "ai_recommendation"
                    ? " (generation only)"
                    : " (generation + response scoring)"
                  : " (generation + extraction, D-022)"
                : ""}
            </span>
            <span>${projection.projectedCostUsd.toFixed(4)}</span>
          </div>
          {overCap && (
            <p className="mt-2 text-sm text-danger">
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
                    className={`mt-2 flex flex-col gap-1 font-mono text-xs sm:flex-row sm:items-center sm:justify-between ${
                      already ? "text-danger" : wouldExceed ? "text-warn" : "text-ink/60"
                    }`}
                  >
                    <span>{b.providerId}</span>
                    <span>
                      ${b.spentUsd.toFixed(4)} + ${b.projectedUsd.toFixed(4)} projected / $
                      {b.budgetUsd.toFixed(2)}
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
        <div className="rounded-xl border border-ink/15">
          <button
            type="button"
            id="advanced-run-controls-trigger"
            className="interactive-press label-mono flex min-h-11 w-full items-center justify-between rounded-xl px-4 py-3 text-xs text-ink/70 transition-micro hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            onClick={() => setAdvancedOpen((o) => !o)}
            aria-expanded={advancedOpen}
            aria-controls="advanced-run-controls"
          >
            Advanced — failure injection
            <span className="text-ink/40">{advancedOpen ? "−" : "+"}</span>
          </button>
          {advancedOpen && (
            <div id="advanced-run-controls" className="border-t border-ink/10 p-4">
              <label className="label-mono flex items-center gap-2 text-xs text-ink/70">
                <input
                  type="checkbox"
                  checked={injectionEnabled}
                  onChange={(e) => setInjectionEnabled(e.target.checked)}
                />
                Generation failure injection (testing) <Stamp tone="warn">Debug</Stamp>
              </label>
              {injectionEnabled && (
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                    <Select
                      value={injectionErrorType}
                      onChange={(e) => setInjectionErrorType(e.target.value)}
                    >
                      {["rate_limit", "timeout", "server_error", "auth_error", "malformed_output"].map(
                        (t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ),
                      )}
                    </Select>
                  </Field>
                </div>
              )}
              <label className="label-mono mt-4 flex items-center gap-2 border-t border-ink/10 pt-4 text-xs text-ink/70">
                <input
                  type="checkbox"
                  checked={extractionInjectionEnabled}
                  onChange={(e) => setExtractionInjectionEnabled(e.target.checked)}
                />
                Extraction failure injection (testing) <Stamp tone="warn">Debug</Stamp>
              </label>
              {extractionInjectionEnabled && (
                <div className="mt-3">
                  <Field
                    label="Invalid rate (0-1)"
                    hint="Forces validation to fail this fraction of extraction attempts (SM-2/SM-3)"
                  >
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
        </div>
      )}

      {error && (
        <InlineStatus tone="danger">
          {error}
        </InlineStatus>
      )}

      <Button
        disabled={!canSubmit || (isLive && projectionState === "LOADING")}
        pending={pending}
        pendingLabel="Starting…"
        onClick={onSubmit}
      >
        {isMessageLift
          ? runMode === "mock"
            ? "Start mock preview"
            : runMode === "live_validation"
              ? "Start live check"
              : "Start full run"
          : startRunLabel(runMode)}
      </Button>

      <AppConfirmDialog
        open={liveConfirm !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setLiveConfirm(null);
        }}
        title={
          liveConfirm?.runMode === "live_audit"
            ? "Start live audit?"
            : "Start live validation?"
        }
        description={
          liveConfirm?.projectionUnavailable
            ? "Cost projection is unavailable right now. The server will still enforce the run cost cap and daily provider budgets before any live calls are made — no dollar figure is invented here."
            : "This starts real provider spend. Confirm the projected footprint before continuing."
        }
        details={
          liveConfirm ? (
            <dl className="grid gap-1 font-mono text-xs text-ink/70">
              <div className="flex justify-between gap-4">
                <dt>Mode</dt>
                <dd>{liveConfirm.runMode === "live_audit" ? "Live audit" : "Live validation"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Providers</dt>
                <dd>{liveConfirm.providers.join(", ")}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Modes</dt>
                <dd>{liveConfirm.modes.join(", ")}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Repeats per prompt</dt>
                <dd>{liveConfirm.repetitions}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Planned calls</dt>
                <dd>{liveConfirm.plannedCalls ?? "Unavailable"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Projected cost</dt>
                <dd>
                  {liveConfirm.projectedCostUsd != null
                    ? `$${liveConfirm.projectedCostUsd.toFixed(2)}`
                    : "Unavailable"}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Cost cap</dt>
                <dd>${liveConfirm.costCapUsd.toFixed(2)}</dd>
              </div>
            </dl>
          ) : null
        }
        confirmLabel="Start live run"
        pending={pending}
        onConfirm={submitRun}
      />
    </div>
  );
}
