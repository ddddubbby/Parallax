"use client";

import { useState, useTransition } from "react";
import { Button, Stamp, Textarea } from "@/components/ui";
import { csvDatasetsForKind, reportSectionsForKind } from "@/core/report-templates";
import { SimulatedBadge } from "@/components/simulated-badge";
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
}: {
  projectId: string;
  runId: string;
  initialSections: SectionRow[];
  kind?: "audit" | "resonance";
  initialIsStale?: boolean;
}) {
  const [sections, setSections] = useState(initialSections);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function startEdit(s: SectionRow) {
    setError(null);
    setEditingKey(s.sectionKey);
    setDraft(displayMd(s));
  }

  function saveEdit(s: SectionRow) {
    setError(null);
    startTransition(async () => {
      const result = await saveSectionEdit(projectId, runId, s.id, draft);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSections((prev) => prev.map((x) => (x.id === s.id ? { ...x, editedMd: draft, state: "edited" } : x)));
      setEditingKey(null);
    });
  }

  function regenerate(s: SectionRow) {
    setError(null);
    startTransition(async () => {
      const result = await regenerateSectionAction(projectId, runId, s.id, s.sectionKey);
      if (result.ok) {
        // Update THIS section's generatedMd with the freshly-returned markdown
        // and clear its edit (RB-3: never touch siblings). Previously only
        // editedMd was cleared, leaving the editor/preview showing stale
        // generatedMd while exports carried the new content (audit finding).
        setSections((prev) =>
          prev.map((x) =>
            x.id === s.id ? { ...x, generatedMd: result.generatedMd, editedMd: null, state: "regenerated" } : x,
          ),
        );
      } else {
        setError(result.error);
      }
    });
  }

  if (sections.length === 0) {
    return (
      <div className="rounded-xl border border-ink/15 p-10 text-center">
        <p className="label-mono mb-4 text-sm text-ink/60">No report generated yet</p>
        <Button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await generateReportForRun(projectId, runId);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              window.location.reload();
            })
          }
        >
          {pending ? "Generating…" : "Generate report"}
        </Button>
        {error && <p className="mt-3 font-mono text-xs text-danger">{error}</p>}
      </div>
    );
  }

  const ordered = [...sections].sort((a, b) => a.position - b.position);
  const exportBase = `/projects/${projectId}/report/export`;
  const reportSections = reportSectionsForKind(kind);
  const csvDatasets = csvDatasetsForKind(kind);

  return (
    <div>
      {kind === "resonance" && (
        <div className="mb-4">
          <SimulatedBadge />
        </div>
      )}
      {initialIsStale && (
        <div className="mb-4 rounded-lg border border-danger/25 bg-danger/5 p-3 font-mono text-xs text-danger">
          Report sections predate the latest computed metrics. Regenerate affected sections before exporting final
          client deliverables.
        </div>
      )}
      <div className="mb-6 flex flex-wrap gap-2">
        <a href={`${exportBase}/markdown?runId=${runId}`} className="label-mono rounded-full border border-ink/25 px-4 py-1.5 text-xs hover:border-ink">
          Download Markdown
        </a>
        <a href={`/projects/${projectId}/report/print?runId=${runId}`} target="_blank" rel="noreferrer" className="label-mono rounded-full border border-ink/25 px-4 py-1.5 text-xs hover:border-ink">
          Print / PDF view
        </a>
        <a href={`${exportBase}/json?runId=${runId}`} className="label-mono rounded-full border border-ink/25 px-4 py-1.5 text-xs hover:border-ink">
          Evidence JSON
        </a>
        {csvDatasets.map((d) => (
          <a key={d} href={`${exportBase}/csv/${d}?runId=${runId}`} className="label-mono rounded-full border border-ink/25 px-4 py-1.5 text-xs hover:border-ink">
            {d}.csv
          </a>
        ))}
      </div>
      {error && <p className="mb-4 font-mono text-xs text-danger">{error}</p>}

      <div className="flex flex-col gap-6">
        {reportSections.map(({ key, title }) => {
          const s = ordered.find((x) => x.sectionKey === key);
          if (!s) return null;
          const editing = editingKey === key;
          return (
            <section key={key} className="rounded-xl border border-ink/15 p-4">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="label-mono text-xs font-medium text-ink/60">{title}</h2>
                <div className="flex items-center gap-2">
                  {s.editedMd && <Stamp tone="ok">edited</Stamp>}
                  {!editing && (
                    <>
                      <Button variant="ghost" disabled={pending} onClick={() => startEdit(s)}>
                        Edit
                      </Button>
                      <Button variant="ghost" disabled={pending} onClick={() => regenerate(s)}>
                        Regenerate
                      </Button>
                    </>
                  )}
                </div>
              </div>
              {editing ? (
                <div className="flex flex-col gap-2">
                  <Textarea rows={8} value={draft} onChange={(e) => setDraft(e.target.value)} />
                  <div className="flex gap-2">
                    <Button disabled={pending} onClick={() => saveEdit(s)}>
                      Save
                    </Button>
                    <Button variant="secondary" onClick={() => setEditingKey(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="whitespace-pre-wrap font-mono text-sm text-ink/85">{displayMd(s)}</p>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
