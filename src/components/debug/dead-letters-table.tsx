"use client";

import { useState, useTransition } from "react";
import { Button, InlineStatus } from "@/components/ui";
import { reExtract } from "@/modules/extraction/actions";

interface DeadLetterRow {
  id: string;
  responseId: string;
  extractionVersion: number;
  validationError: string | null;
  updatedAt: string | Date;
  runId: string;
  providerId: string;
}

/** AD-2: dead-lettered extractions with re-extract, parallel to the jobs table. */
export function DeadLettersTable({ rows }: { rows: DeadLetterRow[] }) {
  const [pending, startTransition] = useTransition();
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<{
    rowId: string;
    tone: "success" | "danger";
    message: string;
  } | null>(null);

  function onReExtract(row: DeadLetterRow) {
    setActionKey(row.id);
    setActionStatus(null);
    startTransition(async () => {
      const result = await reExtract(row.responseId).catch(() => ({
        ok: false as const,
        error: "Re-extraction did not complete. Retry.",
      }));
      setActionKey(null);
      setActionStatus({
        rowId: row.id,
        tone: result.ok ? "success" : "danger",
        message: result.ok ? `Response ${row.responseId.slice(0, 8)} queued for re-extraction.` : result.error,
      });
    });
  }

  return (
    <section>
      <h2 className="label-mono mb-2 text-xs font-medium text-paper/60">
        Extraction dead-letters · {rows.length}
      </h2>
      {actionStatus && (
        <InlineStatus
          tone={actionStatus.tone}
          className="mb-3 border-paper/20 bg-paper/[0.06] text-paper"
        >
          {actionStatus.message}
        </InlineStatus>
      )}
      <div
        role="region"
        aria-label="Extraction dead-letter table"
        tabIndex={0}
        className="overflow-x-auto rounded-lg border border-paper/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
      <table className="w-full min-w-[38rem] border-collapse font-mono text-xs">
        <thead>
          <tr className="border-b border-paper/20 text-left text-paper/50">
            <th className="py-1.5 pr-3">Provider</th>
            <th className="py-1.5 pr-3">Version</th>
            <th className="py-1.5 pr-3">Validation error</th>
            <th className="py-1.5 pr-3" />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} className="py-4 text-paper/55">
                No dead-lettered extractions
              </td>
            </tr>
          )}
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-paper/10 align-top">
              <td className="py-1.5 pr-3">{row.providerId}</td>
              <td className="py-1.5 pr-3">{row.extractionVersion}</td>
              <td className="max-w-96 break-words py-1.5 pr-3 text-paper/70">{row.validationError ?? "—"}</td>
              <td className="py-1.5 pr-3">
                <Button
                  variant="ghost"
                  pending={pending && actionKey === row.id}
                  pendingLabel="Re-extracting…"
                  className="min-h-11 px-3 text-accent hover:text-accent"
                  onClick={() => onReExtract(row)}
                >
                  Re-extract
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </section>
  );
}
