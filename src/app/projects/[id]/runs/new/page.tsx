import { notFound, redirect } from "next/navigation";
import { RunCreationForm } from "@/components/runner/run-creation-form";
import { DEFAULT_VALIDATION_RUN_CAP_USD } from "@/core/constants";
import { getApprovedVersionForRun, getProjectStatus } from "@/db/repositories/runner";
import { listRegisteredProviders } from "@/providers/registry";

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

  const providers = listRegisteredProviders().map((p) => ({
    id: p.id,
    displayName: p.displayName,
    supportsGrounded: p.supportsGrounded,
    supportsUngrounded: p.supportsUngrounded,
  }));

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="label-mono mb-6 text-lg font-semibold">Start Run</h1>
      <RunCreationForm
        projectId={id}
        cellCount={version.cellCount}
        providers={providers}
        defaultCostCapUsd={DEFAULT_VALIDATION_RUN_CAP_USD}
      />
    </main>
  );
}
