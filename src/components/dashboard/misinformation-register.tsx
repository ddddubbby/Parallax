"use client";

import { useState, useTransition } from "react";
import { Button, InlineStatus, Select, Stamp } from "@/components/ui";
import { PILLARS } from "@/core/semantic";
import { reviewClaim } from "@/modules/dashboard/actions";

interface MisinfoRow {
  id: string;
  responseId: string;
  claimText: string;
  claimType: string;
  extractedVerdict: string;
  extractedSeverity: string;
  operatorVerdict: string | null;
  operatorSeverity: string | null;
  reviewState: string;
  evidenceQuote: string | null;
  factStatement: string | null;
}

const VERDICTS = ["supported", "contradicted", "outdated", "unsupported", "ambiguous", "not_checked"] as const;
const SEVERITIES = ["none", "low", "medium", "high"] as const;

function severityTone(severity: string): "danger" | "warn" | "ink" {
  if (severity === "high") return "danger";
  if (severity === "medium") return "warn";
  return "ink";
}

/** One reviewable row: claim text drills to evidence; the controls set reviewed_at (D-024). */
function MisinfoRowCard({
  row,
  projectId,
  runId,
  onRowClick,
  onReviewed,
}: {
  row: MisinfoRow;
  projectId: string;
  runId: string;
  onRowClick: (responseId: string, claimText: string, trigger?: HTMLElement) => void;
  onReviewed: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [actionKey, setActionKey] = useState<"confirm" | "correct" | "reopen" | null>(null);
  const [correcting, setCorrecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verdict, setVerdict] = useState(row.operatorVerdict ?? row.extractedVerdict);
  const [severity, setSeverity] = useState(row.operatorSeverity ?? row.extractedSeverity);

  const shownVerdict = row.operatorVerdict ?? row.extractedVerdict;
  const shownSeverity = row.operatorSeverity ?? row.extractedSeverity;
  const reviewed = row.reviewState !== "unreviewed";

  function run(key: "confirm" | "correct" | "reopen", action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    setActionKey(key);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "Review failed");
        setActionKey(null);
        return;
      }
      setCorrecting(false);
      setActionKey(null);
      onReviewed();
    });
  }

  return (
    <div className="rounded-lg border border-ink/15 p-3">
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <Stamp tone={severityTone(shownSeverity)}>{shownSeverity}</Stamp>
        <Stamp tone="ink">{shownVerdict}</Stamp>
        <Stamp tone="ink">{row.claimType}</Stamp>
        {reviewed ? (
          <Stamp tone="ok">{row.reviewState}</Stamp>
        ) : (
          <Stamp tone="warn">unreviewed</Stamp>
        )}
      </div>
      <button
        type="button"
        onClick={(event) => onRowClick(row.responseId, row.claimText, event.currentTarget)}
        className="mb-1 block min-h-11 rounded-sm text-left text-sm leading-relaxed text-ink/85 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {row.claimText}
      </button>
      {row.factStatement && (
        <p className="mb-2 text-sm leading-relaxed text-ink/65">
          <span className="label-mono mr-1 text-[11px]">Fact sheet</span> {row.factStatement}
        </p>
      )}

      {correcting ? (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="label-mono flex flex-col gap-1 text-[11px] text-ink/60">
            Verdict
            <Select value={verdict} onChange={(e) => setVerdict(e.target.value)} className="py-1 text-xs">
              {VERDICTS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </Select>
          </label>
          <label className="label-mono flex flex-col gap-1 text-[11px] text-ink/60">
            Severity
            <Select value={severity} onChange={(e) => setSeverity(e.target.value)} className="py-1 text-xs">
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </label>
          <Button
            variant="primary"
            pending={actionKey === "correct"}
            pendingLabel="Saving…"
            disabled={pending && actionKey !== "correct"}
            onClick={() =>
              run("correct", () =>
                reviewClaim(projectId, runId, row.id, {
                  reviewState: "corrected",
                  operatorVerdict: verdict as (typeof VERDICTS)[number],
                  operatorSeverity: severity as (typeof SEVERITIES)[number],
                }),
              )
            }
          >
            Save correction
          </Button>
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() => {
              setVerdict(row.operatorVerdict ?? row.extractedVerdict);
              setSeverity(row.operatorSeverity ?? row.extractedSeverity);
              setCorrecting(false);
              setError(null);
            }}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            pending={actionKey === "confirm"}
            pendingLabel="Saving…"
            disabled={pending && actionKey !== "confirm"}
            onClick={() => run("confirm", () => reviewClaim(projectId, runId, row.id, { reviewState: "confirmed" }))}
          >
            {reviewed ? "Re-confirm" : "Confirm"}
          </Button>
          <Button variant="secondary" disabled={pending} onClick={() => setCorrecting(true)}>
            Correct
          </Button>
          {reviewed && (
            <Button
              variant="ghost"
              pending={actionKey === "reopen"}
              pendingLabel="Re-opening…"
              disabled={pending && actionKey !== "reopen"}
              onClick={() => run("reopen", () => reviewClaim(projectId, runId, row.id, { reviewState: "unreviewed" }))}
            >
              Re-open
            </Button>
          )}
        </div>
      )}
      {error && <InlineStatus tone="danger" className="mt-2">{error}</InlineStatus>}
    </div>
  );
}

/**
 * DB-1 misinformation register: checkable claims that contradict, are
 * unsupported by, or outdate the fact sheet. DB-2: claim text drills to
 * evidence. D-024: each row is reviewable (confirm / correct / re-open),
 * which is what sets claims_found.reviewed_at for the release-checklist gate.
 */
export function MisinformationRegister({
  projectId,
  runId,
  rows,
  onRowClick,
  onReviewed,
}: {
  projectId: string;
  runId: string;
  rows: MisinfoRow[];
  onRowClick: (responseId: string, claimText: string, trigger?: HTMLElement) => void;
  onReviewed: () => void;
}) {
  const unreviewedCount = rows.filter((r) => r.reviewState === "unreviewed").length;

  return (
    <section>
      <h2 className="label-mono mb-3 text-xs font-medium text-ink/60">
        {PILLARS.proof.label} <span className="text-ink/65">— Misinformation Register ({rows.length})</span>
        {unreviewedCount > 0 && (
          <span className="ml-2 text-warn">{unreviewedCount} unreviewed</span>
        )}
      </h2>
      {rows.length === 0 ? (
        <p className="text-sm text-ink/65">No contradicted, outdated, or unsupported claims were found.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((r) => (
            <MisinfoRowCard key={r.id} row={r} projectId={projectId} runId={runId} onRowClick={onRowClick} onReviewed={onReviewed} />
          ))}
        </div>
      )}
    </section>
  );
}
