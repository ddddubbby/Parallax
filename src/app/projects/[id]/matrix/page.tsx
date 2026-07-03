import Link from "next/link";
import { notFound } from "next/navigation";
import { MatrixBoard } from "@/components/matrix/board";
import { scanUnbrandedCells } from "@/core/matrix";
import {
  getMatrixInputs,
  getVersionWithCells,
  listVersions,
} from "@/db/repositories/matrix";

export const dynamic = "force-dynamic";

export default async function MatrixPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ v?: string }>;
}) {
  const { id } = await params;
  const { v } = await searchParams;

  const inputs = await getMatrixInputs(id);
  if (!inputs) notFound();

  const versions = await listVersions(id);
  // Default focus: requested version, else newest draft, else newest.
  const focusId =
    (v && versions.find((x) => x.id === v)?.id) ??
    versions.find((x) => x.state === "draft")?.id ??
    versions[0]?.id ??
    null;
  const focus = focusId ? await getVersionWithCells(focusId) : null;

  const personaLabels = Object.fromEntries(inputs.personas.map((p) => [p.id, p.title]));
  const marketLabels = Object.fromEntries(inputs.markets.map((m) => [m.id, m.name]));

  // PM-9 early warning: badge violating unbranded cells on drafts at render
  // time instead of first surfacing the problem at approval.
  const violatingTerms = new Map<string, string[]>();
  if (focus && focus.version.state === "draft" && inputs.client) {
    const brands = [
      { name: inputs.client.name, aliases: (inputs.client.aliasesJson as string[]) ?? [] },
      ...inputs.competitors.map((c) => ({
        name: c.name,
        aliases: (c.aliasesJson as string[]) ?? [],
      })),
    ];
    for (const v of scanUnbrandedCells(focus.cells, brands)) {
      violatingTerms.set(v.cellId, v.terms);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-1 font-mono text-xs text-ink/45">
        <Link href="/projects" className="hover:text-ink">
          Projects
        </Link>{" "}
        / {inputs.project.name} / Matrix
      </div>
      <MatrixBoard
        projectId={id}
        projectStatus={inputs.project.status}
        versions={versions}
        focus={
          focus
            ? {
                id: focus.version.id,
                version: focus.version.version,
                state: focus.version.state,
                cells: focus.cells.map((c) => ({
                  id: c.id,
                  intent: c.intent,
                  personaLabel: c.personaId ? (personaLabels[c.personaId] ?? "—") : "—",
                  marketLabel: c.marketId ? (marketLabels[c.marketId] ?? "—") : "—",
                  variantKey: c.variantKey,
                  resolvedText: c.resolvedText,
                  brandTermViolations: violatingTerms.get(c.id) ?? [],
                })),
              }
            : null
        }
      />
    </main>
  );
}
