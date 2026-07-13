import Link from "next/link";
import { notFound } from "next/navigation";
import { FramingReportView } from "@/components/framing/framing-report-view";
import { PrintButton } from "@/components/framing/print-button";
import { isUuid } from "@/core/id";
import { buildFramingReport } from "@/modules/framing/report";

export const dynamic = "force-dynamic";

export default async function FramingReportPage({ params }: { params: Promise<{ id: string; studyId: string }> }) {
  const { id, studyId } = await params;
  if (!isUuid(id) || !isUuid(studyId)) notFound();
  const report = await buildFramingReport(id, studyId);
  if (!report) notFound();
  const base = `/projects/${id}/framing/${studyId}/report/export`;
  return (
    <main className="framing-report-document fixed inset-0 z-[60] overflow-auto bg-paper px-4 py-4 text-ink sm:px-6 sm:py-6 print:static print:overflow-visible print:p-0">
      <style>{`
        @media print {
          .framing-report-section { break-inside: auto; }
          .framing-report-view table { break-inside: avoid; }
        }
      `}</style>
      <div className="mx-auto mb-6 flex max-w-4xl flex-wrap items-center gap-2 print:hidden">
        <Link href={`/projects/${id}/framing/${studyId}`} className="label-mono mr-auto inline-flex min-h-11 items-center rounded-full px-3 text-xs text-ink/70 hover:bg-ink/5 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">← Back to review</Link>
        <a href={`${base}/markdown`} className="label-mono inline-flex min-h-11 items-center rounded-full border border-ink/30 px-4 py-2 text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">Markdown</a>
        <a href={`${base}/json`} className="label-mono inline-flex min-h-11 items-center rounded-full border border-ink/30 px-4 py-2 text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">JSON evidence</a>
        <PrintButton />
      </div>
      <FramingReportView report={report} />
    </main>
  );
}
