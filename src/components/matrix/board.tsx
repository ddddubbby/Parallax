"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Stamp, Textarea } from "@/components/ui";
import { MAX_CELLS_PER_RUN } from "@/core/constants";
import { INTENT_ORDER, type Intent } from "@/core/matrix";
import { PILLARS, intentToPillar, type Pillar } from "@/core/semantic";
import {
  addCell,
  approveMatrix,
  generateMatrix,
  newDraftFromVersion,
  regenerateCell,
  removeCell,
  saveCellText,
} from "@/modules/matrix/actions";

interface CellView {
  id: string;
  intent: Intent;
  personaLabel: string;
  marketLabel: string;
  variantKey: string;
  resolvedText: string;
  /** PM-9: tracked brand terms found in an unbranded-intent cell. */
  brandTermViolations: string[];
}

interface VersionView {
  id: string;
  version: number;
  state: string;
  cells: CellView[];
}

interface VersionListItem {
  id: string;
  version: number;
  state: string;
  cellCount: number;
}

export function MatrixBoard({
  projectId,
  projectStatus,
  versions,
  focus,
}: {
  projectId: string;
  projectStatus: string;
  versions: VersionListItem[];
  focus: VersionView | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const isDraft = focus?.state === "draft";
  const count = focus?.cells.length ?? 0;
  const atCap = count >= MAX_CELLS_PER_RUN;
  const pillarCounts = (["presence", "position", "perception", "proof"] as Pillar[]).map((pillar) => ({
    pillar,
    count: pillar === "proof"
      ? count
      : focus?.cells.filter((c) => intentToPillar(c.intent) === pillar).length ?? 0,
  }));
  const violationCount =
    focus?.cells.filter((c) => c.brandTermViolations.length > 0).length ?? 0;

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error ?? "Action failed");
      router.refresh();
    });
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="label-mono text-lg font-semibold">Prompt Matrix</h1>
          {focus && (
            <>
              <Stamp tone="ink">V{focus.version}</Stamp>
              <Stamp tone={isDraft ? "warn" : focus.state === "approved" ? "ok" : "ink"}>
                {focus.state}
              </Stamp>
            </>
          )}
        </div>
        {/* PM-5: live cell counter. */}
        {focus && (
          <span
            className={`label-mono text-sm ${atCap ? "text-accent-ink font-semibold" : "text-ink/60"}`}
          >
            {count} / {MAX_CELLS_PER_RUN} cells
          </span>
        )}
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-danger px-3 py-2 font-mono text-xs text-danger">
          {error}
        </p>
      )}

      {/* PM-9 early warning: surfaced at render time, not first at approval. */}
      {isDraft && violationCount > 0 && (
        <div className="mb-4 rounded-lg border border-warn px-3 py-2">
          <span className="font-mono text-xs text-warn">
            PM-9 — {violationCount} unbranded cell{violationCount === 1 ? "" : "s"} contain
            {violationCount === 1 ? "s" : ""} tracked brand terms; approval will be blocked.
            Discovery/consideration prompts must be brand-free — check the job-to-be-done and
            category intake fields, then edit or regenerate the flagged cells below.
          </span>
        </div>
      )}

      {versions.length > 1 && (
        <div className="mb-4 flex items-center gap-2">
          <span className="label-mono text-xs text-ink/45">Versions:</span>
          {versions.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => router.push(`/projects/${projectId}/matrix?v=${v.id}`)}
              className={`label-mono rounded-full px-3 py-1 text-xs transition-micro ${
                v.id === focus?.id
                  ? "bg-ink text-paper"
                  : "border border-ink/25 text-ink/60 hover:border-ink"
              }`}
            >
              V{v.version} · {v.state} · {v.cellCount}
            </button>
          ))}
        </div>
      )}

      {!focus ? (
        <div className="rounded-xl border border-ink/15 p-10 text-center">
          <p className="label-mono text-sm text-ink/60">No matrix on file</p>
          <p className="mt-1 mb-4 font-mono text-xs text-ink/45">
            generate the default 40-cell, bottom-funnel-weighted matrix
          </p>
          <Button
            disabled={pending || projectStatus !== "active"}
            onClick={() => run(() => generateMatrix(projectId))}
          >
            {pending ? "Generating…" : "Generate matrix"}
          </Button>
          {projectStatus !== "active" && (
            <p className="mt-3 font-mono text-xs text-warn">
              complete intake first
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="mb-6 flex flex-wrap items-center gap-2">
            {isDraft ? (
              <>
                {/* PM-5: add-cell disabled at 50. */}
                {INTENT_ORDER.map((intent) => (
                  <Button
                    key={intent}
                    variant="secondary"
                    disabled={pending || atCap}
                    onClick={() => run(() => addCell(projectId, focus.id, intent))}
                  >
                    + {intent}
                  </Button>
                ))}
                <div className="flex-1" />
                <Button
                  disabled={pending}
                  onClick={() => run(() => approveMatrix(projectId, focus.id))}
                >
                  Approve V{focus.version}
                </Button>
              </>
            ) : (
              <>
                <span className="font-mono text-xs text-ink/60">
                  approved versions are frozen (C-4) — edits go into a new draft
                </span>
                <div className="flex-1" />
                <Button
                  variant="secondary"
                  disabled={pending}
                  onClick={() => router.push(`/projects/${projectId}/runs/new`)}
                >
                  Start run
                </Button>
                <Button
                  variant="secondary"
                  disabled={pending}
                  onClick={() => router.push(`/projects/${projectId}/dashboard`)}
                >
                  Dashboard
                </Button>
                <Button
                  variant="secondary"
                  disabled={pending}
                  onClick={() => run(() => newDraftFromVersion(projectId, focus.id))}
                >
                  New draft from V{focus.version}
                </Button>
              </>
            )}
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="label-mono text-xs text-ink/45">Pillar coverage:</span>
            {pillarCounts.map(({ pillar, count }) => (
              <Stamp key={pillar} tone={count > 0 ? "ink" : "warn"}>
                {PILLARS[pillar].label}: {count}
              </Stamp>
            ))}
          </div>

          <div className="flex flex-col gap-6">
            {INTENT_ORDER.map((intent) => {
              const cells = focus.cells.filter((c) => c.intent === intent);
              if (cells.length === 0) return null;
              const pillar = intentToPillar(intent);
              return (
                <section key={intent}>
                  <h2 className="label-mono mb-2 text-xs font-medium text-ink/60">
                    {PILLARS[pillar].label} / {intent} · {cells.length}
                  </h2>
                  <div className="flex flex-col gap-2">
                    {cells.map((cell) => (
                      <div
                        key={cell.id}
                        className={`rounded-xl border p-3 ${
                          cell.brandTermViolations.length > 0
                            ? "border-warn"
                            : "border-ink/15"
                        }`}
                      >
                        <div className="mb-1.5 flex items-center justify-between">
                          <span className="flex items-center gap-2 font-mono text-xs text-ink/45">
                            <Stamp tone="ink">{PILLARS[intentToPillar(cell.intent)].label}</Stamp>
                            {cell.personaLabel} · {cell.marketLabel} ·{" "}
                            {cell.variantKey}
                            {cell.brandTermViolations.length > 0 && (
                              <Stamp tone="warn">
                                PM-9: {cell.brandTermViolations.join(", ")}
                              </Stamp>
                            )}
                          </span>
                          {isDraft && (
                            <span className="flex gap-1">
                              <Button
                                variant="ghost"
                                disabled={pending}
                                onClick={() => {
                                  setEditingId(cell.id);
                                  setEditText(cell.resolvedText);
                                }}
                              >
                                Edit
                              </Button>
                              <Button
                                variant="ghost"
                                disabled={pending}
                                onClick={() =>
                                  run(() => regenerateCell(projectId, focus.id, cell.id))
                                }
                              >
                                Regenerate
                              </Button>
                              <Button
                                variant="ghost"
                                disabled={pending}
                                onClick={() =>
                                  run(() => removeCell(projectId, focus.id, cell.id))
                                }
                              >
                                Remove
                              </Button>
                            </span>
                          )}
                        </div>
                        {editingId === cell.id ? (
                          <div className="flex flex-col gap-2">
                            <Textarea
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                            />
                            <div className="flex gap-2">
                              <Button
                                disabled={pending}
                                onClick={() => {
                                  setEditingId(null);
                                  run(() =>
                                    saveCellText(projectId, focus.id, cell.id, editText),
                                  );
                                }}
                              >
                                Save
                              </Button>
                              <Button
                                variant="secondary"
                                onClick={() => setEditingId(null)}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-ink/85">{cell.resolvedText}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
