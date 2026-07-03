"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button, Field, Input, Stamp } from "@/components/ui";
import { createRun, projectRunCost, type RunCreationInput } from "@/modules/runner/actions";
import type { GenerationMode, ProviderId } from "@/providers/types";

interface ProviderOption {
  id: ProviderId;
  displayName: string;
  supportsGrounded: boolean;
  supportsUngrounded: boolean;
}

const MODES: GenerationMode[] = ["ungrounded", "grounded"];

export function RunCreationForm({
  projectId,
  cellCount,
  providers,
  defaultCostCapUsd,
}: {
  projectId: string;
  cellCount: number;
  providers: ProviderOption[];
  defaultCostCapUsd: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedProviders, setSelectedProviders] = useState<ProviderId[]>(
    providers.length > 0 ? [providers[0].id] : [],
  );
  const [selectedModes, setSelectedModes] = useState<GenerationMode[]>(["ungrounded"]);
  const [repetitions, setRepetitions] = useState(5);
  const [costCapUsd, setCostCapUsd] = useState(defaultCostCapUsd);
  const [injectionEnabled, setInjectionEnabled] = useState(false);
  const [injectionRate, setInjectionRate] = useState(0.15);
  const [injectionErrorType, setInjectionErrorType] = useState("rate_limit");
  const [extractionInjectionEnabled, setExtractionInjectionEnabled] = useState(false);
  const [extractionInvalidRate, setExtractionInvalidRate] = useState(0.15);
  const [projection, setProjection] = useState<{ plannedCalls: number; projectedCostUsd: number } | null>(null);

  const input: RunCreationInput = {
    providers: selectedProviders,
    modes: selectedModes,
    repetitions,
    costCapUsd,
    debugFailureInjection:
      injectionEnabled || extractionInjectionEnabled
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
    projectRunCost(projectId, input).then((result) => {
      if (!cancelled && result.ok) {
        setProjection({ plannedCalls: result.plannedCalls, projectedCostUsd: result.projectedCostUsd });
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, selectedProviders.join(","), selectedModes.join(","), repetitions]);

  function toggle<T>(list: T[], value: T, set: (next: T[]) => void) {
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
        <p className="text-sm text-ink/85">{cellCount} cells</p>
      </div>

      <Field label="Providers">
        <div className="flex flex-wrap gap-2">
          {providers.map((p) => (
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

      <Field label="Generation modes">
        <div className="flex gap-2">
          {MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => toggle(selectedModes, mode, setSelectedModes)}
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
        <Field label="Repetitions">
          <Input
            type="number"
            min={1}
            max={5}
            value={repetitions}
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

      {projection && (
        <div className="rounded-xl border border-ink/15 p-4">
          <div className="flex items-center justify-between font-mono text-sm">
            <span>Planned calls</span>
            <span>{projection.plannedCalls}</span>
          </div>
          <div
            className={`flex items-center justify-between font-mono text-sm ${overCap ? "text-danger" : ""}`}
          >
            <span>Projected cost</span>
            <span>${projection.projectedCostUsd.toFixed(4)}</span>
          </div>
          {overCap && (
            <p className="mt-2 font-mono text-xs text-danger">
              Exceeds the ${costCapUsd} cap — run creation will be blocked server-side (RN-2)
            </p>
          )}
        </div>
      )}

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

      {error && (
        <p className="rounded-lg border border-danger px-3 py-2 font-mono text-xs text-danger">
          {error}
        </p>
      )}

      <Button disabled={pending} onClick={onSubmit}>
        {pending ? "Starting…" : "Start run"}
      </Button>
    </div>
  );
}
