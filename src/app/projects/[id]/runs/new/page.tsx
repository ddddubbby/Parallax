import { notFound, redirect } from "next/navigation";
import { RunCreationForm } from "@/components/runner/run-creation-form";
import { DEFAULT_AUDIT_RUN_CAP_USD, DEFAULT_VALIDATION_RUN_CAP_USD } from "@/core/constants";
import { getApprovedVersionForRun, getProjectStatus } from "@/db/repositories/runner";
import { listProviderOptions } from "@/modules/runner/actions";

export const dynamic = "force-dynamic";

export default async function NewRunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const status = await getProjectStatus(id);
  if (status === null) notFound();

  const version = await getApprovedVersionForRun(id);
  if (!version) redirect(`/projects/${id}/matrix`);

  // C-7: provider metadata comes through the runner module's action, never
  // from /src/providers directly (lint-enforced for app/components).
  const providers = await listProviderOptions();

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="label-mono mb-6 text-lg font-semibold">Start Run</h1>
      <RunCreationForm
        projectId={id}
        cellCount={version.cellCount}
        providers={providers}
        defaultValidationCapUsd={DEFAULT_VALIDATION_RUN_CAP_USD}
        defaultAuditCapUsd={DEFAULT_AUDIT_RUN_CAP_USD}
      />
    </main>
  );
}
