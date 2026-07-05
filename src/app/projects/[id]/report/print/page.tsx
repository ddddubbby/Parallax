import { marked } from "marked";
import { notFound } from "next/navigation";
import { REPORT_SECTIONS, RESONANCE_REPORT_SECTIONS } from "@/core/report-templates";
import { getReportSections } from "@/db/repositories/report";
import { getRun, getRunMatrixKind } from "@/db/repositories/runner";
import { getProjectBrandNames } from "@/db/repositories/dashboard";

export const dynamic = "force-dynamic";

// EX-2, DESIGN_GUIDELINES V-4: exports are paper-surface, texture-free,
// conservatively styled — the operator's cyberpunk register never leaves
// this route. The operator prints this page to PDF via their browser;
// there is no server-side PDF renderer (D-013 keeps exports synchronous
// and dependency-light). The app-wide nav is hidden here via the
// `print-hide-chrome` @media print rule in globals.css, so the printed
// PDF has zero app chrome even though the on-screen preview still shows
// it for navigation.
//
// Markdown -> HTML is rendered server-side without a sanitizer library.
// That is only safe because generated sections escape every MODEL-DERIVED
// string (claim text, evidence quotes, citation domains) at the template
// source — src/core/md.ts escapeModelText — so provider/web-origin text
// can never smuggle raw HTML through marked into this
// dangerouslySetInnerHTML. What remains unescaped is the operator's own
// content (their edits, brand names, fact sheet), which the operator
// already fully controls (single shared-password operator, same trust
// boundary as Debug's raw SQL access).
export default async function ReportPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ runId?: string }>;
}) {
  const { id } = await params;
  const { runId } = await searchParams;
  if (!runId) notFound();

  const run = await getRun(runId);
  if (!run || run.projectId !== id) notFound();
  const kind = await getRunMatrixKind(runId);
  const reportSections = kind?.kind === "resonance" ? RESONANCE_REPORT_SECTIONS : REPORT_SECTIONS;

  const [sections, brands] = await Promise.all([getReportSections(runId), getProjectBrandNames(id)]);
  const byKey = new Map(sections.map((s) => [s.sectionKey, s]));
  const client = brands.find((b) => b.role === "client");

  // Colors reference the design tokens (globals.css @theme, available on
  // this page via the root layout) rather than raw hex — the "colors live
  // only in tokens" guardrail (V-10) applies here too. Alpha variants use
  // color-mix so a token change still propagates. Font/spacing stay inline:
  // this is a deliberately self-contained print document (V-4).
  return (
    <div
      style={{
        background: "var(--color-paper)",
        color: "var(--color-ink)",
        fontFamily: "Georgia, 'Times New Roman', serif",
        maxWidth: "48rem",
        margin: "0 auto",
        padding: "3rem 2rem",
        minHeight: "100vh",
      }}
    >
      <style>{`
        @media print {
          .section { page-break-after: always; }
          .section:last-child { page-break-after: auto; }
        }
        table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
        th, td { border: 1px solid color-mix(in srgb, var(--color-ink) 20%, transparent); padding: 0.4rem 0.6rem; text-align: left; font-size: 0.9rem; }
        h2 { font-family: ui-monospace, monospace; text-transform: uppercase; letter-spacing: 0.04em; font-size: 1rem; border-bottom: 1px solid color-mix(in srgb, var(--color-ink) 20%, transparent); padding-bottom: 0.4rem; margin-top: 0; }
        blockquote { border-left: 3px solid var(--color-accent); margin: 0.75rem 0; padding: 0.25rem 0 0.25rem 0.75rem; color: color-mix(in srgb, var(--color-ink) 60%, transparent); }
      `}</style>

      <div style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.75rem", color: "color-mix(in srgb, var(--color-ink) 60%, transparent)", marginBottom: "0.5rem" }}>
        {new Date().toISOString().slice(0, 10).replaceAll("-", ".")} · RUN {runId.slice(0, 8)}
      </div>
      <h1 style={{ fontSize: "2rem", marginBottom: "2rem" }}>
        {kind?.kind === "resonance" ? "Resonance Simulation Report" : "AI Visibility Audit"}{client ? ` — ${client.name}` : ""}
      </h1>

      {reportSections.map(({ key, title }) => {
        const section = byKey.get(key);
        const md = section?.editedMd ?? section?.generatedMd ?? "_Not yet generated._";
        const html = marked.parse(md, { async: false });
        return (
          <div key={key} className="section" style={{ marginBottom: "2rem" }}>
            <h2>{title}</h2>
            {/* Operator's own generated/edited content, see file header. */}
            <div dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        );
      })}
    </div>
  );
}
