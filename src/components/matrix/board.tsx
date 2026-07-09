"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Stamp, Textarea } from "@/components/ui";
import { MAX_CELLS_PER_RUN } from "@/core/constants";
import { FRAME_ASPECT_LABELS, type PackCoverageResult } from "@/core/coverage";
import { INTENT_ORDER, type Intent } from "@/core/matrix";
import { GlossaryTerm } from "@/components/semantic/glossary-term";
import { PillarExplainer, PillarSection } from "@/components/semantic/pillar";
import { PILLAR_ORDER, PILLARS, intentToPillar, pillarMetricLabels, type Pillar } from "@/core/semantic";
import type { MatrixView } from "@/core/views";
import {
  activateCoverageAspectAction,
  addCell,
  approveMatrix,
  generateMatrix,
  newDraftFromVersion,
  regenerateCell,
  removeCell,
  saveCellText,
} from "@/modules/matrix/actions";

// EL-2: audit-grade repetitions (C-1). The sample-budget projection assumes
// k=5 and one engine-mode — the floor an audit run uses — so the operator can
// see at matrix time whether each pillar will clear the n>=30 aggregate gate.
const AUDIT_K = 5;
const SMALL_N_GATE = 30;

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
  packCoverage,
  activeCompetitorCount,
  staleDraft,
  view = "overview",
}: {
  projectId: string;
  projectStatus: string;
  versions: VersionListItem[];
  focus: VersionView | null;
  packCoverage: PackCoverageResult[];
  /** M27/D-084: active (non-archived) competitor count from Setup. */
  activeCompetitorCount: number;
  /** M27/D-084: the focused draft was generated before the last Setup edit. */
  staleDraft: boolean;
  /** M32 / D-088: overview = summary/actions; pillar views = cells only. */
  view?: MatrixView;
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
            {count} / {MAX_CELLS_PER_RUN} <GlossaryTerm term="cell">cells</GlossaryTerm>
          </span>
        )}
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-danger px-3 py-2 font-mono text-xs text-danger">
          {error}
        </p>
      )}

      {/* M27/D-084 pinned decision 6a: comparison prompts need >=1 active
          competitor; zero renders a broken {competitor_list} and is blocked
          server-side, so warn here before the operator hits that error. */}
      {activeCompetitorCount === 0 && (
        <div className="mb-4 rounded-lg border border-warn px-3 py-2">
          <span className="font-mono text-xs text-warn">
            No active competitors — comparison prompts cannot be generated. Unarchive or add a
            competitor in Setup.
          </span>
        </div>
      )}

      {/* M27/D-084 pinned decision 7: this draft predates the most recent
          Setup edit. Approved versions are frozen evidence (C-4) and never
          show this — only drafts, which can still be regenerated. */}
      {isDraft && staleDraft && (
        <div className="mb-4 rounded-lg border border-warn px-3 py-2">
          <span className="font-mono text-xs text-warn">
            Setup changed since this draft was generated — regenerate to reflect the current
            competitors, personas, markets, and fact sheet.
          </span>
        </div>
      )}

      {/* PM-9 early warning: surfaced at render time, not first at approval. */}
      {isDraft && violationCount > 0 && (
        <div className="mb-4 rounded-lg border border-warn px-3 py-2">
          <span className="font-mono text-xs text-warn">
            PM-9 — {violationCount} unbranded cell{violationCount === 1 ? "" : "s"} contain
            {violationCount === 1 ? "s" : ""} tracked brand terms; approval will be blocked.
            Discovery/consideration prompts must be brand-free — check the buyer&rsquo;s goal and
            category intake fields, then edit or regenerate the flagged cells below.
          </span>
        </div>
      )}

      {versions.length > 0 && (
        <div className="mb-4 flex items-center gap-2">
          <label htmlFor="matrix-version" className="label-mono text-xs text-ink/45">
            Version
          </label>
          <select
            id="matrix-version"
            className="label-mono rounded-lg border border-ink/20 bg-paper px-3 py-1.5 text-xs"
            value={focus?.id ?? ""}
            onChange={(e) => {
              const next = e.target.value;
              if (!next) return;
              const params = new URLSearchParams();
              params.set("v", next);
              if (view !== "overview") params.set("view", view);
              router.push(`/projects/${projectId}/matrix?${params.toString()}`);
            }}
          >
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                V{v.version} · {v.state} · {v.cellCount} cells
              </option>
            ))}
          </select>
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
                  onClick={() => router.push(`/projects/${projectId}/setup?view=basics`)}
                >
                  Review project inputs
                </Button>
                <Button
                  variant="secondary"
                  disabled={pending}
                  onClick={() =>
                    router.push(`/projects/${projectId}/runs/new?matrixVersionId=${focus.id}`)
                  }
                >
                  Configure run
                </Button>
                <Button
                  variant="secondary"
                  disabled={pending}
                  onClick={() => run(() => newDraftFromVersion(projectId, focus.id))}
                >
                  Create draft from V{focus.version}
                </Button>
              </>
            )}
          </div>

          {/* M32 / D-088: overview owns sample budget + simulation coverage;
              pillar views own their cells only. */}
          {view === "overview" && (
            <>
              {/* EL-2: per-pillar sample budget vs the n>=30 aggregate gate,
                  live as cells change — so coverage is a deliberate decision at
                  matrix time, not a surprise on the dashboard (S-024). */}
              <div className="mb-4 rounded-lg border border-ink/15 p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="label-mono text-xs text-ink/45">Sample budget</span>
                  <span className="font-mono text-[11px] text-ink/40">
                    projected at k={AUDIT_K}, one engine-mode — aggregate metrics need n ≥ {SMALL_N_GATE}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {pillarCounts.map(({ pillar, count: pillarCount }) => {
                    const samples = pillarCount * AUDIT_K;
                    const clears = samples >= SMALL_N_GATE;
                    return (
                      <Stamp key={pillar} tone={pillarCount === 0 ? "warn" : clears ? "ok" : "warn"}>
                        {pillar === "proof" ? "TRUST RAIL · " : ""}
                        {PILLARS[pillar].label}: {pillarCount} → {samples}
                        {clears ? " ✓" : ` (< ${SMALL_N_GATE})`}
                      </Stamp>
                    );
                  })}
                </div>
                <p className="mt-2 font-mono text-[11px] text-ink/45">
                  Proof draws on every response&rsquo;s claims and citations, so all {count} cells
                  count toward it (D-051). A pillar under {SMALL_N_GATE} still renders per-cell and
                  directional findings, just no aggregate claim (D-015).
                </p>
              </div>

              {/* M23 (D-079): Evidence-Layer -> Simulation-Layer coverage
                  contract — does this matrix produce evidence for each
                  resonance study pack's baseline? Informational, never a block
                  (D-058 precedent), computed before any run spends. */}
              <div className="mb-4 rounded-lg border border-ink/15 p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="label-mono text-xs text-ink/45">Simulation coverage</span>
                  <span className="font-mono text-[11px] text-ink/40">
                    whether this matrix would give each Simulation study pack real evidence to cite
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  {packCoverage.map((pack) => (
                    <div key={pack.packId} className="flex flex-wrap items-center gap-2">
                      <Stamp tone={pack.status === "ok" ? "ok" : "warn"}>
                        {pack.packName}: {FRAME_ASPECT_LABELS[pack.requiredAspect]} — {pack.cellCount}{" "}
                        cell
                        {pack.cellCount === 1 ? "" : "s"}
                        {pack.status === "ok" ? " ✓" : " (gap)"}
                      </Stamp>
                      {pack.status === "gap" && isDraft && (
                        <>
                          <span className="font-mono text-[11px] text-ink/45">
                            no {FRAME_ASPECT_LABELS[pack.requiredAspect].toLowerCase()} cells yet —
                            templates exist but are inactive by default (opt-in)
                          </span>
                          <Button
                            variant="secondary"
                            disabled={pending}
                            onClick={() =>
                              run(() => activateCoverageAspectAction(projectId, pack.requiredAspect))
                            }
                          >
                            Activate {FRAME_ASPECT_LABELS[pack.requiredAspect].toLowerCase()} templates
                          </Button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
                <p className="mt-2 font-mono text-[11px] text-ink/45">
                  Activating adds these prompts to the shared archetype template pool for future
                  matrices of this category — existing approved matrices stay frozen (C-4).
                  Regenerate or add cells afterward to bring them into this draft.
                </p>
              </div>
            </>
          )}

          {view !== "overview" && (
          <div className="flex flex-col gap-6">
            {PILLAR_ORDER.filter((p) => p !== "proof")
              .filter((pillar) => view === pillar)
              .map((pillar) => {
              const pillarIntents = INTENT_ORDER.filter((i) => intentToPillar(i) === pillar);
              const pillarCellCount = focus.cells.filter((c) => intentToPillar(c.intent) === pillar).length;
              if (pillarCellCount === 0) {
                return (
                  <p key={pillar} className="font-mono text-xs text-ink/45">
                    No {PILLARS[pillar].label} cells in this version.
                  </p>
                );
              }
              return (
                <PillarSection key={pillar} pillar={pillar} count={pillarCellCount}>
                  <PillarExplainer pillar={pillar} />
                  <div className="flex flex-col gap-5">
                    {pillarIntents.map((intent) => {
                      const cells = focus.cells.filter((c) => c.intent === intent);
                      if (cells.length === 0) return null;
                      const feeds = pillarMetricLabels(intentToPillar(intent)).join(", ");
                      return (
                        <section key={intent}>
                          <h3 className="label-mono mb-2 text-xs font-medium text-ink/60">
                            {intent} · {cells.length}
                          </h3>
                          <div className="flex flex-col gap-2">
                    {cells.map((cell) => (
                      <div
                        key={cell.id}
                        title={feeds ? `Feeds: ${feeds}` : undefined}
                        className={`rounded-xl border p-3 ${
                          cell.brandTermViolations.length > 0
                            ? "border-warn"
                            : "border-ink/15"
                        }`}
                      >
                        <div className="mb-1.5 flex items-center justify-between">
                          <span className="flex items-center gap-2 font-mono text-xs text-ink/45">
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
                </PillarSection>
              );
            })}
          </div>
          )}
        </>
      )}
    </div>
  );
}
