import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { RunCreationForm } from "@/components/runner/run-creation-form";
import { DEFAULT_AUDIT_RUN_CAP_USD, DEFAULT_VALIDATION_RUN_CAP_USD } from "@/core/constants";
import { isUuid } from "@/core/id";
import { getApprovedVersionForRun, getMatrixVersionForRun, getProjectSummary } from "@/db/repositories/runner";
import {
  getResonanceDrawFootprint,
  getResonanceStudyExportLabel,
} from "@/db/repositories/resonance";
import { getSecondaryRequirement, listProviderOptions } from "@/modules/runner/actions";

export const dynamic = "force-dynamic";

export default async function NewRunPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ matrixVersionId?: string }>;
}) {
  const { id } = await params;
  const { matrixVersionId } = await searchParams;
  if (!isUuid(id)) notFound();
  const project = await getProjectSummary(id);
  if (project === null) notFound();
  if (matrixVersionId && !isUuid(matrixVersionId)) redirect(`/projects/${id}/matrix`);

  const version = matrixVersionId
    ? await getMatrixVersionForRun(id, matrixVersionId)
    : await getApprovedVersionForRun(id);
  if (!version || version.state !== "approved") redirect(`/projects/${id}/matrix`);

  // C-7: provider metadata comes through the runner module's action, never
  // from /src/providers directly (lint-enforced for app/components).
  const [providers, secondaryRequirement] = await Promise.all([
    listProviderOptions(),
    getSecondaryRequirement(version.kind === "resonance" ? "resonance" : "audit"),
  ]);

  let matrixLabel = `V${version.version}`;
  let panelCount: number | null = null;
  let framingCount: number | null = null;
  if (version.kind === "resonance" && version.resonanceStudyId) {
    const study = await getResonanceStudyExportLabel(id, version.resonanceStudyId);
    if (study?.name) matrixLabel = `${study.name} · V${version.version}`;
    const footprint = await getResonanceDrawFootprint(version.resonanceStudyId);
    panelCount = footprint?.panelCount ?? null;
    framingCount = footprint?.framingCount ?? null;
  }

  return (
    <main className="mx-auto min-w-0 max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-1 font-mono text-xs text-ink/45">
        <Link href="/projects" className="hover:text-ink">
          Projects
        </Link>{" "}
        /{" "}
        <Link href={`/projects/${id}`} className="hover:text-ink">
          {project.name}
        </Link>{" "}
        / Configure run
      </div>
      <h1 className="label-mono mb-6 text-lg font-semibold">Configure run</h1>
      <RunCreationForm
        projectId={id}
        cellCount={version.cellCount}
        providers={providers}
        defaultValidationCapUsd={DEFAULT_VALIDATION_RUN_CAP_USD}
        defaultAuditCapUsd={DEFAULT_AUDIT_RUN_CAP_USD}
        matrixVersionId={version.id}
        singleMode={version.kind === "resonance"}
        secondaryRequirement={secondaryRequirement}
        matrixLabel={matrixLabel}
        panelCount={panelCount}
        framingCount={framingCount}
      />
    </main>
  );
}
