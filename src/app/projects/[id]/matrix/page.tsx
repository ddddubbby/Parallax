import Link from "next/link";
import { notFound } from "next/navigation";
import { LocalViewTabs } from "@/components/local-view-tabs";
import { MatrixBoard } from "@/components/matrix/board";
import { countAspects, evaluatePackCoverage } from "@/core/coverage";
import { isUuid } from "@/core/id";
import { scanUnbrandedCells } from "@/core/matrix";
import { frameAspectsForCell } from "@/core/prompt-templates";
import { parseMatrixView, withViewParam } from "@/core/views";
import {
  getMarketLabelsForProject,
  getMatrixInputs,
  getPersonaLabelsForProject,
  getVersionWithCells,
  listVersions,
} from "@/db/repositories/matrix";

export const dynamic = "force-dynamic";

export default async function MatrixPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ v?: string; view?: string }>;
}) {
  const { id } = await params;
  const { v, view: viewRaw } = await searchParams;
  const view = parseMatrixView(viewRaw);
  if (!isUuid(id)) notFound();

  const inputs = await getMatrixInputs(id);
  if (!inputs) notFound();

  const versions = await listVersions(id);
  // Default focus: requested version, else newest draft, else newest.
  const focusId =
    (v && versions.find((x) => x.id === v)?.id) ??
    versions.find((x) => x.state === "draft")?.id ??
    versions[0]?.id ??
    null;
  const focus = focusId ? await getVersionWithCells(focusId, id) : null;

  // M27/D-084 two-reads rule: label maps must resolve EVERY historical cell,
  // including ones referencing a persona/market since archived in Setup — so
  // these come from the archived-inclusive lookups, never inputs.personas/
  // inputs.markets (which are generation-input, active-only).
  const [personaLabelRows, marketLabelRows] = await Promise.all([
    getPersonaLabelsForProject(id),
    getMarketLabelsForProject(id),
  ]);
  const personaLabels = Object.fromEntries(personaLabelRows.map((p) => [p.id, p.title]));
  const marketLabels = Object.fromEntries(marketLabelRows.map((m) => [m.id, m.name]));

  // M27/D-084 pinned decision 7: warn on a draft generated before the most
  // recent Setup edit — approved versions are frozen evidence (C-4) and
  // never get this banner.
  const staleDraft = Boolean(
    focus &&
      focus.version.state === "draft" &&
      inputs.project.setupUpdatedAt &&
      inputs.project.setupUpdatedAt > focus.version.createdAt,
  );

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

  // M23 (D-079): coverage contract — cross-check the focused matrix's
  // produced frame aspects against what each resonance study pack needs
  // (informational, never a block; D-058 sample-budget-panel precedent).
  const packCoverage = focus
    ? evaluatePackCoverage(
        countAspects(
          focus.cells.map((c) =>
            frameAspectsForCell(inputs.project.categoryArchetype, c.intent, c.variantKey),
          ),
        ),
      )
    : [];

  const base = `/projects/${id}/matrix`;
  const vParam = focusId ?? undefined;
  const tabs = [
    { id: "overview", label: "Overview", href: withViewParam(base, "overview", { v: vParam }) },
    { id: "presence", label: "Presence", href: withViewParam(base, "presence", { v: vParam }) },
    { id: "position", label: "Position", href: withViewParam(base, "position", { v: vParam }) },
    {
      id: "perception",
      label: "Perception",
      href: withViewParam(base, "perception", { v: vParam }),
    },
  ];

  return (
    <main className="mx-auto min-w-0 max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-1 font-mono text-xs text-ink/45">
        <Link href="/projects" className="hover:text-ink">
          Projects
        </Link>{" "}
        /{" "}
        <Link href={`/projects/${id}`} className="hover:text-ink">
          {inputs.project.name}
        </Link>{" "}
        / Setup / Prompt matrix
      </div>
      <h1 className="label-mono mb-4 mt-4 text-lg font-semibold">Prompt matrix</h1>
      <LocalViewTabs tabs={tabs} activeId={view} label="Matrix sections" />
      <MatrixBoard
        projectId={id}
        projectStatus={inputs.project.status}
        versions={versions}
        packCoverage={packCoverage}
        activeCompetitorCount={inputs.competitors.length}
        supportsFramingEvidence={inputs.project.categoryArchetype !== "b2b"}
        staleDraft={staleDraft}
        view={view}
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
