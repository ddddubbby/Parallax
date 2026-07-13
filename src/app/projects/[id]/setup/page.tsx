import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { LocalViewTabs } from "@/components/local-view-tabs";
import { SetupClient } from "@/components/setup/setup-client";
import { isUuid } from "@/core/id";
import { parseSetupView, withViewParam } from "@/core/views";
import { getProjectSetup } from "@/db/repositories/setup";

export const dynamic = "force-dynamic";

/**
 * M27 (D-084) / M32 (D-088): post-intake Setup editing, one section at a time
 * via `?view=`.
 */
export default async function SetupPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { id } = await params;
  const { view: viewRaw } = await searchParams;
  if (!isUuid(id)) notFound();

  const setup = await getProjectSetup(id);
  if (!setup) notFound();
  if (setup.project.status === "draft") redirect(`/projects/new?id=${id}`);

  const view = parseSetupView(viewRaw);
  const base = `/projects/${id}/setup`;

  return (
    <main className="mx-auto min-w-0 max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-4 font-mono text-xs text-ink/45">
        <Link href="/projects" className="hover:text-ink">
          Projects
        </Link>{" "}
        /{" "}
        <Link href={`/projects/${id}`} className="hover:text-ink">
          {setup.project.name}
        </Link>{" "}
        / Setup / Project inputs
      </div>
      <h1 className="label-mono mb-4 text-lg font-semibold">Project inputs</h1>
      <LocalViewTabs
        tabs={[
          { id: "basics", label: "Basics", href: withViewParam(base, "basics") },
          { id: "brands", label: "Brands", href: withViewParam(base, "brands") },
          { id: "personas", label: "Personas", href: withViewParam(base, "personas") },
          { id: "markets", label: "Markets", href: withViewParam(base, "markets") },
          { id: "attributes", label: "Attributes", href: withViewParam(base, "attributes") },
          { id: "facts", label: "Fact sheet", href: withViewParam(base, "facts") },
        ]}
        activeId={view}
        label="Setup sections"
      />
      <SetupClient
        projectId={id}
        view={view}
        data={{
          project: {
            id: setup.project.id,
            name: setup.project.name,
            category: setup.project.category ?? "",
            categoryArchetype: setup.project.categoryArchetype,
            jobToBeDone: setup.project.jobToBeDone ?? "",
          },
          brands: setup.brands.map((b) => ({
            id: b.id,
            role: b.role,
            name: b.name,
            domain: b.domain,
            description: b.description,
            aliases: (b.aliasesJson as string[]) ?? [],
            archived: b.archivedAt !== null,
          })),
          personas: setup.personas.map((p) => ({
            id: p.id,
            title: p.title,
            companyContext: p.companyContext,
            painPoints: (p.painPointsJson as string[]) ?? [],
            buyingCriteria: (p.buyingCriteriaJson as string[]) ?? [],
            archived: p.archivedAt !== null,
          })),
          markets: setup.markets.map((m) => ({
            id: m.id,
            name: m.name,
            archived: m.archivedAt !== null,
          })),
          attributes: setup.attributes.map((a) => ({ id: a.id, name: a.name })),
          factClaims: setup.factClaims.map((f) => ({
            id: f.id,
            type: f.type,
            statement: f.statement,
            sourceNote: f.sourceNote,
            sourceUrl: f.sourceUrl,
            archived: f.status === "archived",
          })),
        }}
      />
    </main>
  );
}
