"use client";

import { useEffect, useState, useTransition } from "react";
import { AppMenu, AppMenuItem, AppMenuSeparator } from "@/components/ui/menu";
import { Button, InlineStatus, Stamp, Textarea } from "@/components/ui";
import { AppConfirmDialog } from "@/components/ui/dialog";
import { UnsavedChangesSignal, useUnsavedEdit } from "@/components/unsaved-edit";
import { csvDatasetsForKind, reportSectionsForKind } from "@/core/report-templates";
import { SimulatedBadge } from "@/components/simulated-badge";
import { BaselineProvenance } from "@/components/resonance/baseline-provenance";
import type { ResonanceBaselineProvenance } from "@/core/resonance";
import { LocalViewTabs } from "@/components/local-view-tabs";
import { withViewParam } from "@/core/views";
import { generateReportForRun, regenerateSectionAction, saveSectionEdit } from "@/modules/report/actions";

interface SectionRow {
  id: string;
  sectionKey: string;
  position: number;
  generatedMd: string | null;
  editedMd: string | null;
  state: string;
}

function displayMd(s: SectionRow): string {
  return s.editedMd ?? s.generatedMd ?? "";
}

export function ReportClient({
  projectId,
  runId,
  initialSections,
  kind = "audit",
  initialIsStale = false,
  activeSectionKey,
  baselineProvenance = null,
}: {
  projectId: string;
  runId: string;
  initialSections: SectionRow[];
  kind?: "audit" | "resonance";
  initialIsStale?: boolean;
  /** M32 / D-088: one outline section at a time. */
  activeSectionKey: string;
  baselineProvenance?: ResonanceBaselineProvenance | null;
}) {
  const [sections, setSections] = useState(initialSections);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [actionKey, setActionKey] = useState<"generate" | "save" | "regenerate" | null>(null);
  const [regenerateTarget, setRegenerateTarget] = useState<SectionRow | null>(null);
  const [pending, startTransition] = useTransition();
  const { setDirtySource } = useUnsavedEdit();

  useEffect(() => () => setDirtySource("report-section", false), [setDirtySource]);

  function startEdit(s: SectionRow) {
    setError(null);
    setEditingKey(s.sectionKey);
    setDraft(displayMd(s));
    setDirtySource("report-section", false);
  }

  function saveEdit(s: SectionRow) {
    setError(null);
    setActionKey("save");
    startTransition(async () => {
      const result = await saveSectionEdit(projectId, runId, s.id, draft);
      if (!result.ok) {
        setError(result.error);
        setActionKey(null);
        return;
      }
      setSections((prev) =>
        prev.map((x) => (x.id === s.id ? { ...x, editedMd: draft, state: "edited" } : x)),
      );
      setEditingKey(null);
      setDirtySource("report-section", false);
      setActionKey(null);
    });
  }

  function regenerate(s: SectionRow) {
    if (s.editedMd) {
      setRegenerateTarget(s);
      return;
    }
    executeRegenerate(s);
  }

  function executeRegenerate(s: SectionRow) {
    setError(null);
    setActionKey("regenerate");
    startTransition(async () => {
      const result = await regenerateSectionAction(projectId, runId, s.id, s.sectionKey);
      if (result.ok) {
        // Update THIS section's generatedMd with the freshly-returned markdown
        // and clear its edit (RB-3: never touch siblings). Previously only
        // editedMd was cleared, leaving the editor/preview showing stale
        // generatedMd while exports carried the new content (audit finding).
        setSections((prev) =>
          prev.map((x) =>
            x.id === s.id
              ? { ...x, generatedMd: result.generatedMd, editedMd: null, state: "regenerated" }
              : x,
          ),
        );
      } else {
        setError(result.error);
      }
      setRegenerateTarget(null);
      setActionKey(null);
    });
  }

  function generate() {
    setError(null);
    setActionKey("generate");
    startTransition(async () => {
      const result = await generateReportForRun(projectId, runId);
      if (!result.ok) {
        setError(result.error);
        setActionKey(null);
        return;
      }
      window.location.reload();
    });
  }

  if (sections.length === 0) {
    return (
      <div className="rounded-xl border border-ink/15 p-10 text-center">
        <p className="label-mono mb-4 text-sm text-ink/60">No report generated yet</p>
        <Button
          pending={actionKey === "generate"}
          pendingLabel="Generating…"
          disabled={pending && actionKey !== "generate"}
          onClick={generate}
        >
          Generate report
        </Button>
        {error && <InlineStatus tone="danger" className="mt-3">{error}</InlineStatus>}
      </div>
    );
  }

  const ordered = [...sections].sort((a, b) => a.position - b.position);
  const exportBase = `/projects/${projectId}/report/export`;
  const reportSections = reportSectionsForKind(kind);
  const csvDatasets = csvDatasetsForKind(kind);
  const base = `/projects/${projectId}/report`;
  const tabs = reportSections.map(({ key, title }) => {
    const row = ordered.find((x) => x.sectionKey === key);
    const status =
      row?.editedMd != null
        ? " · edited"
        : row?.state === "regenerated"
          ? " · regenerated"
          : "";
    return {
      id: key,
      label: `${title}${status}`,
      href: withViewParam(base, key, { runId }),
    };
  });

  const activeMeta = reportSections.find((s) => s.key === activeSectionKey) ?? reportSections[0];
  const s = ordered.find((x) => x.sectionKey === activeMeta.key);
  const editing = s != null && editingKey === s.sectionKey;

  return (
    <div>
      {kind === "resonance" && (
        <div className="mb-4 space-y-3">
          <SimulatedBadge />
          {baselineProvenance && <BaselineProvenance provenance={baselineProvenance} />}
        </div>
      )}
      {initialIsStale && (
        <InlineStatus tone="danger" className="mb-4">
          Report sections predate the latest computed metrics. Regenerate affected sections before
          exporting final client deliverables.
        </InlineStatus>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <LocalViewTabs tabs={tabs} activeId={activeMeta.key} label="Report outline" />
        <AppMenu
          trigger={
            <Button variant="secondary" type="button">
              Export
            </Button>
          }
        >
          <AppMenuItem
            onSelect={() => {
              window.location.href = `${exportBase}/markdown?runId=${runId}`;
            }}
          >
            Report · Markdown
          </AppMenuItem>
          <AppMenuItem
            onSelect={() => {
              window.open(`/projects/${projectId}/report/print?runId=${runId}`, "_blank");
            }}
          >
            Report · Print / PDF
          </AppMenuItem>
          <AppMenuSeparator />
          <AppMenuItem
            onSelect={() => {
              window.location.href = `${exportBase}/json?runId=${runId}`;
            }}
          >
            Evidence · JSON
          </AppMenuItem>
          <AppMenuSeparator />
          {csvDatasets.map((d) => (
            <AppMenuItem
              key={d}
              onSelect={() => {
                window.location.href = `${exportBase}/csv/${d}?runId=${runId}`;
              }}
            >
              CSV · {d}
            </AppMenuItem>
          ))}
        </AppMenu>
      </div>

      {error && <InlineStatus tone="danger" className="mb-4">{error}</InlineStatus>}

      {!s ? (
        <p className="font-mono text-xs text-ink/65">Section not generated for this run.</p>
      ) : (
        <section className="rounded-xl border border-ink/15 p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="label-mono text-xs font-medium text-ink/60">{activeMeta.title}</h2>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {s.editedMd && <Stamp tone="ok">edited</Stamp>}
              <UnsavedChangesSignal />
              {!editing && (
                <>
                  <Button variant="ghost" disabled={pending} onClick={() => startEdit(s)}>
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    pending={actionKey === "regenerate"}
                    pendingLabel="Regenerating…"
                    disabled={pending && actionKey !== "regenerate"}
                    onClick={() => regenerate(s)}
                  >
                    Regenerate
                  </Button>
                </>
              )}
            </div>
          </div>
          {editing ? (
            <div className="flex flex-col gap-2">
              <Textarea
                rows={12}
                value={draft}
                autoFocus
                aria-label={`Edit ${activeMeta.title}`}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setDirtySource("report-section", e.target.value !== displayMd(s));
                }}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  pending={actionKey === "save"}
                  pendingLabel="Saving…"
                  disabled={pending && actionKey !== "save"}
                  onClick={() => saveEdit(s)}
                >
                  Save changes
                </Button>
                <Button
                  variant="secondary"
                  disabled={pending}
                  onClick={() => {
                    setDraft(displayMd(s));
                    setEditingKey(null);
                    setError(null);
                    setDirtySource("report-section", false);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink/85">{displayMd(s)}</p>
          )}
        </section>
      )}

      <AppConfirmDialog
        open={regenerateTarget !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setRegenerateTarget(null);
        }}
        title="Replace this edited section?"
        description={`Regenerating ${activeMeta.title} permanently replaces its operator edit. Other report sections and exports are unchanged.`}
        confirmLabel="Replace and regenerate"
        pending={actionKey === "regenerate"}
        onConfirm={() => {
          if (regenerateTarget) executeRegenerate(regenerateTarget);
        }}
      />
    </div>
  );
}
