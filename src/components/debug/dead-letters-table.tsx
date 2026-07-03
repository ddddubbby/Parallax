"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui";
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
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onReExtract(row: DeadLetterRow) {
    startTransition(async () => {
      await reExtract(row.responseId);
      router.refresh();
    });
  }

  return (
    <section>
      <h2 className="label-mono mb-2 text-xs font-medium text-paper/60">
        Extraction dead-letters · {rows.length}
      </h2>
      <table className="w-full border-collapse font-mono text-xs">
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
              <td colSpan={4} className="py-4 text-paper/40">
                No dead-lettered extractions
              </td>
            </tr>
          )}
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-paper/10">
              <td className="py-1.5 pr-3">{row.providerId}</td>
              <td className="py-1.5 pr-3">{row.extractionVersion}</td>
              <td className="py-1.5 pr-3 text-paper/70">{row.validationError ?? "—"}</td>
              <td className="py-1.5 pr-3">
                <Button variant="ghost" disabled={pending} onClick={() => onReExtract(row)}>
                  Re-extract
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
