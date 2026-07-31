"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Button, InlineStatus, Select, Stamp, Textarea } from "@/components/ui";
import { AppConfirmDialog } from "@/components/ui/dialog";
import { useUnsavedEdit } from "@/components/unsaved-edit";
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
import { representativePromptSamples } from "@/components/matrix/prompt-samples";

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

type MatrixConfirmation =
  | { kind: "approve" }
  | { kind: "remove"; cell: CellView }
  | { kind: "switch-version"; versionId: string };

export function MatrixBoard({
  projectId,
  projectStatus,
  versions,
  focus,
  packCoverage,
  activeCompetitorCount,
  supportsFramingEvidence,
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
  /** M34A: representation prompts exist only for consumer archetypes. */
  supportsFramingEvidence: boolean;
  /** M27/D-084: the focused draft was generated before the last Setup edit. */
  staleDraft: boolean;
  /** M32 / D-088: overview = summary/actions; pillar views = cells only. */
  view?: MatrixView;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [actionState, setActionState] = useState<{
    key: string;
    status: "pending" | "success" | "danger";
    message?: string;
  } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [confirmation, setConfirmation] = useState<MatrixConfirmation | null>(null);
  const { setDirty } = useUnsavedEdit();

  const isDraft = focus?.state === "draft";
  const count = focus?.cells.length ?? 0;
  const standardCellCount = focus?.cells.filter((cell) => cell.intent !== "representation").length ?? 0;
  const atCap = count >= MAX_CELLS_PER_RUN;
  const hasAllRepresentationPrompts =
    (focus?.cells.filter((cell) => cell.intent === "representation").length ?? 0) >= 5;
  const pillarCounts = (["presence", "position", "perception", "proof"] as Pillar[]).map((pillar) => ({
    pillar,
    count: pillar === "proof"
      ? standardCellCount
      : focus?.cells.filter((c) => intentToPillar(c.intent) === pillar).length ?? 0,
  }));
  const violationCount =
    focus?.cells.filter((c) => c.brandTermViolations.length > 0).length ?? 0;
  const editingCell = focus?.cells.find((cell) => cell.id === editingId) ?? null;
  const editDirty = Boolean(editingCell && editText !== editingCell.resolvedText);
  const approveSamples = useMemo(
    () => (focus ? representativePromptSamples(focus.cells) : []),
    [focus],
  );

  useEffect(() => {
    setDirty(editDirty);
    return () => setDirty(false);
  }, [editDirty, setDirty]);

  function run(
    key: string,
    action: () => Promise<{ ok: boolean; error?: string }>,
    onOk?: () => void,
    onSettled?: () => void,
  ) {
    setActionState({ key, status: "pending" });
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          setActionState({ key, status: "danger", message: result.error ?? "Action failed" });
        } else {
          setActionState({
            key,
            status: "success",
            message: key === "approve" ? "Approved — configure a run." : "Saved.",
          });
          onOk?.();
        }
      } catch {
        setActionState({
          key,
          status: "danger",
          message: "That matrix change could not be completed. Your current edit is still here.",
        });
      } finally {
        onSettled?.();
      }
    });
  }

  function isPending(key: string) {
    return actionState?.key === key && actionState.status === "pending";
  }

  function actionStatus(key: string) {
    if (!actionState || actionState.key !== key || actionState.status === "pending") return null;
    return (
      <InlineStatus tone={actionState.status} className="mt-2">
        {actionState.message}
      </InlineStatus>
    );
  }

  function navigateToVersion(versionId: string) {
    setEditingId(null);
    setEditText("");
    const params = new URLSearchParams();
    params.set("v", versionId);
    if (view !== "overview") params.set("view", view);
    router.push(`/projects/${projectId}/matrix?${params.toString()}`);
  }

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 rounded-xl border border-ink/15 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3" aria-label="Matrix version state">
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
          <span className={`text-sm ${atCap ? "font-medium text-danger" : "text-ink/65"}`}>
            <span className="font-mono tabular-nums text-ink">{count}</span> used ·{" "}
            <span className="font-mono tabular-nums text-ink">{MAX_CELLS_PER_RUN - count}</span>{" "}
            remaining · {MAX_CELLS_PER_RUN} <GlossaryTerm term="cell">cell</GlossaryTerm> maximum
          </span>
        )}
      </div>

      {actionState?.status === "danger" && actionState.key !== `cell-${editingId}` && (
        <InlineStatus tone="danger" className="mb-4">
          {actionState.message}
        </InlineStatus>
      )}
      {actionState?.status === "success" && (
        <InlineStatus tone="success" className="mb-4">
          {actionState.message}
        </InlineStatus>
      )}

      {/* M27/D-084 pinned decision 6a: comparison prompts need >=1 active
          competitor; zero yields a non-comparison {brand_list} and is blocked
          server-side, so warn here before the operator hits that error. */}
      {activeCompetitorCount === 0 && (
        <InlineStatus tone="warning" className="mb-4">
          <span>
            No active competitors — comparison prompts cannot be generated. Unarchive or add a
            competitor in Setup.
          </span>
        </InlineStatus>
      )}

      {/* M27/D-084 pinned decision 7: this draft predates the most recent
          Setup edit. Approved versions are frozen evidence (C-4) and never
          show this — only drafts, which can still be regenerated. */}
      {isDraft && staleDraft && (
        <InlineStatus tone="warning" className="mb-4">
          <span>
            Setup changed since this draft was generated — regenerate to reflect the current
            competitors, personas, markets, and fact sheet.
          </span>
        </InlineStatus>
      )}

      {/* PM-9 early warning: surfaced at render time, not first at approval. */}
      {isDraft && violationCount > 0 && (
        <InlineStatus tone="warning" className="mb-4">
          <span>
            PM-9 — {violationCount} unbranded cell{violationCount === 1 ? "" : "s"} contain
            {violationCount === 1 ? "s" : ""} tracked brand terms; approval will be blocked.
            Discovery/consideration prompts must be brand-free — check the buyer&rsquo;s goal and
            category intake fields, then edit or regenerate the flagged cells below.
          </span>
        </InlineStatus>
      )}

      {versions.length > 0 && (
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <label htmlFor="matrix-version" className="label-mono text-xs text-ink/45">
            Version
          </label>
          <Select
            id="matrix-version"
            className="label-mono min-h-11 text-xs sm:max-w-sm"
            value={focus?.id ?? ""}
            onChange={(e) => {
              const next = e.target.value;
              if (!next) return;
              if (editDirty) setConfirmation({ kind: "switch-version", versionId: next });
              else navigateToVersion(next);
            }}
          >
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                V{v.version} · {v.state} · {v.cellCount} cells
              </option>
            ))}
          </Select>
        </div>
      )}

      {!focus ? (
        <div className="rounded-xl border border-ink/15 px-5 py-10 text-center">
          <p className="label-mono text-sm text-ink/70">No matrix on file</p>
          <p className="mx-auto mt-2 mb-4 max-w-lg text-sm text-ink/60">
            Generate the default audit matrix. Consumer projects include the established framing-evidence prompts where applicable.
          </p>
          <Button
            disabled={projectStatus !== "active"}
            pending={isPending("generate")}
            pendingLabel="Generating…"
            onClick={() => run("generate", () => generateMatrix(projectId))}
          >
            Generate matrix
          </Button>
          {projectStatus !== "active" && (
            <p className="mt-3 text-sm text-warn">
              Complete intake before generating a matrix.
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="mb-6 flex flex-wrap items-center gap-2">
            {isDraft ? (
              <>
                {/* PM-5: add-cell disabled at 50. */}
                {INTENT_ORDER.filter(
                  (intent) => intent !== "representation" || supportsFramingEvidence,
                ).map((intent) => (
                  <Button
                    key={intent}
                    variant="secondary"
                    disabled={atCap || (intent === "representation" && hasAllRepresentationPrompts)}
                    pending={isPending(`add-${intent}`)}
                    pendingLabel="Adding…"
                    onClick={() => run(`add-${intent}`, () => addCell(projectId, focus.id, intent))}
                  >
                    + {intent}
                  </Button>
                ))}
                <div className="flex-1" />
                <Button
                  pending={isPending("approve")}
                  pendingLabel="Approving…"
                  onClick={() => setConfirmation({ kind: "approve" })}
                >
                  Approve V{focus.version}
                </Button>
                {atCap && (
                  <InlineStatus tone="warning" className="w-full">
                    This version has reached the 50-cell cap. Remove a named cell before adding another.
                  </InlineStatus>
                )}
              </>
            ) : (
              <>
                <span className="text-sm text-ink/65">
                  Approved versions are frozen evidence (C-4). Further edits belong in a new draft.
                </span>
                <div className="flex-1" />
                <Button
                  variant="secondary"
                  onClick={() => router.push(`/projects/${projectId}/setup?view=basics`)}
                >
                  Review project inputs
                </Button>
                <Button
                  variant="secondary"
                  onClick={() =>
                    router.push(`/projects/${projectId}/runs/new?matrixVersionId=${focus.id}`)
                  }
                >
                  Configure run
                </Button>
                <Button
                  variant="secondary"
                  pending={isPending("new-draft")}
                  pendingLabel="Creating…"
                  onClick={() => run("new-draft", () => newDraftFromVersion(projectId, focus.id))}
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
                  <span className="text-sm text-ink/55">
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
                <p className="mt-2 text-sm leading-relaxed text-ink/60">
                  Proof&rsquo;s shared projection uses the {standardCellCount} standard audit cells.
                  Representation cells feed factual-claim accuracy only and never citation or
                  Stability Index denominators. A pillar under {SMALL_N_GATE} still renders per-cell and
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
                  <span className="text-sm text-ink/55">
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
                          <span className="text-sm text-ink/60">
                            no {FRAME_ASPECT_LABELS[pack.requiredAspect].toLowerCase()} cells yet —
                            templates exist but are inactive by default (opt-in)
                          </span>
                          <Button
                            variant="secondary"
                            pending={isPending(`coverage-${pack.requiredAspect}`)}
                            pendingLabel="Activating…"
                            onClick={() =>
                              run(
                                `coverage-${pack.requiredAspect}`,
                                () => activateCoverageAspectAction(projectId, pack.requiredAspect),
                              )
                            }
                          >
                            Activate {FRAME_ASPECT_LABELS[pack.requiredAspect].toLowerCase()} templates
                          </Button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-sm leading-relaxed text-ink/60">
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
                        <div className="mb-1.5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <span className="flex flex-wrap items-center gap-2 font-mono text-xs text-ink/55">
                            {cell.personaLabel} · {cell.marketLabel} ·{" "}
                            {cell.variantKey}
                            {cell.brandTermViolations.length > 0 && (
                              <Stamp tone="warn">
                                PM-9: {cell.brandTermViolations.join(", ")}
                              </Stamp>
                            )}
                          </span>
                          {isDraft && cell.intent !== "representation" && (
                            <span className="flex flex-wrap gap-1">
                              <Button
                                variant="ghost"
                                disabled={editingId !== null && editingId !== cell.id}
                                onClick={() => {
                                  setEditingId(cell.id);
                                  setEditText(cell.resolvedText);
                                }}
                              >
                                Edit
                              </Button>
                              <Button
                                variant="ghost"
                                disabled={editingId !== null}
                                pending={isPending(`regenerate-${cell.id}`)}
                                pendingLabel="Regenerating…"
                                onClick={() => run(
                                  `regenerate-${cell.id}`,
                                  () => regenerateCell(projectId, focus.id, cell.id),
                                )}
                              >
                                Regenerate
                              </Button>
                              <Button
                                variant="ghost"
                                disabled={editingId !== null}
                                pending={isPending(`remove-${cell.id}`)}
                                pendingLabel="Removing…"
                                onClick={() => setConfirmation({ kind: "remove", cell })}
                              >
                                Remove
                              </Button>
                            </span>
                          )}
                        </div>
                        {cell.intent === "representation" ? (
                          <div>
                            <p className="text-sm text-ink/85">{cell.resolvedText}</p>
                            <p className="mt-1 font-mono text-[11px] text-ink/45">
                              Fixed neutral-branded prompt · representation-prompts.v4
                            </p>
                          </div>
                        ) : editingId === cell.id ? (
                          <div className="flex flex-col gap-2">
                            <Textarea
                              autoFocus
                              aria-label={`Edit ${cell.variantKey} prompt`}
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                            />
                            <div className="flex gap-2">
                              <Button
                                pending={isPending(`cell-${cell.id}`)}
                                pendingLabel="Saving…"
                                onClick={() => run(
                                  `cell-${cell.id}`,
                                  () => saveCellText(projectId, focus.id, cell.id, editText),
                                  () => {
                                    setEditingId(null);
                                    setEditText("");
                                  },
                                )}
                              >
                                Save
                              </Button>
                              <Button
                                variant="secondary"
                                onClick={() => {
                                  setEditingId(null);
                                  setEditText("");
                                }}
                              >
                                Cancel
                              </Button>
                            </div>
                            {actionStatus(`cell-${cell.id}`)}
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

      <AppConfirmDialog
        open={confirmation !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmation(null);
        }}
        title={
          confirmation?.kind === "approve"
            ? `Approve matrix V${focus?.version ?? ""}?`
            : confirmation?.kind === "remove"
              ? "Remove matrix cell?"
              : "Discard cell edit?"
        }
        description={
          confirmation?.kind === "approve"
            ? `Approval freezes all ${focus?.cells.length ?? 0} cells as immutable evidence (C-4). This sample is a last-chance summary — review the full prompt set before continuing.`
            : confirmation?.kind === "remove"
              ? `Remove “${confirmation.cell.variantKey} · ${confirmation.cell.personaLabel} · ${confirmation.cell.marketLabel}” from this draft?`
              : "The edited prompt text has not been saved. Switching versions will discard it."
        }
        details={
          confirmation?.kind === "approve" && focus ? (
            <div className="flex flex-col gap-3">
              <p className="label-mono text-[11px] text-ink/55">
                {focus.cells.length} cells · showing {approveSamples.length} representative prompts
              </p>
              <ul className="flex flex-col gap-2">
                {approveSamples.map((cell) => (
                  <li key={cell.id} className="border-b border-ink/10 pb-2 last:border-0 last:pb-0">
                    <p className="label-mono text-[10px] uppercase tracking-wide text-ink/45">
                      {cell.intent} · {cell.personaLabel} · {cell.marketLabel}
                    </p>
                    <p className="mt-1 font-sans text-xs leading-relaxed text-ink/75">
                      {cell.resolvedText.length > 120
                        ? `${cell.resolvedText.slice(0, 120)}…`
                        : cell.resolvedText}
                    </p>
                  </li>
                ))}
              </ul>
              <Link
                href={`/projects/${projectId}/matrix?v=${focus.id}&view=presence`}
                className="label-mono text-xs text-accent-ink underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                onClick={() => setConfirmation(null)}
              >
                Review prompt sections →
              </Link>
            </div>
          ) : undefined
        }
        confirmLabel={
          confirmation?.kind === "approve"
            ? `Approve V${focus?.version ?? ""}`
            : confirmation?.kind === "remove"
              ? "Remove named cell"
              : "Discard and switch"
        }
        tone={confirmation?.kind === "approve" || confirmation?.kind === "switch-version" ? "primary" : "danger"}
        pending={
          confirmation?.kind === "approve"
            ? isPending("approve")
            : confirmation?.kind === "remove"
              ? isPending(`remove-${confirmation.cell.id}`)
              : false
        }
        onConfirm={() => {
          if (!focus || !confirmation) return;
          if (confirmation.kind === "approve") {
            run(
              "approve",
              () => approveMatrix(projectId, focus.id),
              undefined,
              () => setConfirmation(null),
            );
            return;
          }
          if (confirmation.kind === "remove") {
            const cell = confirmation.cell;
            run(
              `remove-${cell.id}`,
              () => removeCell(projectId, focus.id, cell.id),
              undefined,
              () => setConfirmation(null),
            );
            return;
          }
          navigateToVersion(confirmation.versionId);
          setConfirmation(null);
        }}
      />
    </div>
  );
}
