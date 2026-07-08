import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SetupClient } from "@/components/setup/setup-client";
import { isUuid } from "@/core/id";
import { getProjectSetup } from "@/db/repositories/setup";

export const dynamic = "force-dynamic";

/**
 * M27 (D-084): post-intake Setup editing. Reads directly from the repo
 * layer (matching the matrix/dashboard page convention — server actions in
 * modules/setup/actions.ts handle mutations only).
 */
export default async function SetupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const setup = await getProjectSetup(id);
  if (!setup) notFound();
  // Setup editing is post-intake only; a draft project has no normalized
  // rows yet (D-026) — send the operator back to finish the wizard.
  if (setup.project.status === "draft") redirect(`/projects/new?id=${id}`);

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-4 font-mono text-xs text-ink/45">
        <Link href="/projects" className="hover:text-ink">
          Projects
        </Link>{" "}
        / {setup.project.name} / Setup
      </div>
      <h1 className="label-mono mb-6 text-lg font-semibold">Project Setup</h1>
      <SetupClient
        projectId={id}
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
