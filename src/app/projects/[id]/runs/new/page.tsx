import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { RunCreationForm } from "@/components/runner/run-creation-form";
import { DEFAULT_AUDIT_RUN_CAP_USD, DEFAULT_VALIDATION_RUN_CAP_USD } from "@/core/constants";
import { getApprovedVersionForRun, getMatrixVersionForRun, getProjectSummary } from "@/db/repositories/runner";
import { listProviderOptions } from "@/modules/runner/actions";

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
  const project = await getProjectSummary(id);
  if (project === null) notFound();

  const version = matrixVersionId
    ? await getMatrixVersionForRun(id, matrixVersionId)
    : await getApprovedVersionForRun(id);
  if (!version || version.state !== "approved") redirect(`/projects/${id}/matrix`);

  // C-7: provider metadata comes through the runner module's action, never
  // from /src/providers directly (lint-enforced for app/components).
  const providers = await listProviderOptions();

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-1 font-mono text-xs text-ink/45">
        <Link href="/projects" className="hover:text-ink">
          Projects
        </Link>{" "}
        /{" "}
        <Link href={`/projects/${id}/matrix`} className="hover:text-ink">
          {project.name}
        </Link>{" "}
        / New run
      </div>
      <h1 className="label-mono mb-6 text-lg font-semibold">Start Run</h1>
      <RunCreationForm
        projectId={id}
        cellCount={version.cellCount}
        providers={providers}
        defaultValidationCapUsd={DEFAULT_VALIDATION_RUN_CAP_USD}
        defaultAuditCapUsd={DEFAULT_AUDIT_RUN_CAP_USD}
        matrixVersionId={version.id}
        singleEngine={version.kind === "resonance"}
      />
    </main>
  );
}
