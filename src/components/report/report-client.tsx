"use client";

import { useState, useTransition } from "react";
import { Button, Stamp, Textarea } from "@/components/ui";
import { REPORT_SECTIONS, RESONANCE_REPORT_SECTIONS } from "@/core/report-templates";
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
}: {
  projectId: string;
  runId: string;
  initialSections: SectionRow[];
  kind?: "audit" | "resonance";
}) {
  const [sections, setSections] = useState(initialSections);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();

  function startEdit(s: SectionRow) {
    setEditingKey(s.sectionKey);
    setDraft(displayMd(s));
  }

  function saveEdit(s: SectionRow) {
    startTransition(async () => {
      await saveSectionEdit(runId, s.id, draft);
      setSections((prev) => prev.map((x) => (x.id === s.id ? { ...x, editedMd: draft, state: "edited" } : x)));
      setEditingKey(null);
    });
  }

  function regenerate(s: SectionRow) {
    startTransition(async () => {
      const result = await regenerateSectionAction(runId, s.id, s.sectionKey);
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
              await generateReportForRun(runId);
              window.location.reload();
            })
          }
        >
          {pending ? "Generating…" : "Generate report"}
        </Button>
      </div>
    );
  }

  const ordered = [...sections].sort((a, b) => a.position - b.position);
  const exportBase = `/projects/${projectId}/report/export`;
  const reportSections = kind === "resonance" ? RESONANCE_REPORT_SECTIONS : REPORT_SECTIONS;
  const csvDatasets =
    kind === "resonance"
      ? (["resonance_responses", "resonance_metrics"] as const)
      : (["responses", "extractions", "metrics", "brand_metrics", "citations"] as const);

  return (
    <div>
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
