import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { OperatorShell } from "@/components/shell/operator-shell";
import { UnsavedEditProvider } from "@/components/unsaved-edit";
import { PageLoading } from "@/components/page-loading";
import { e2eNavDelay } from "@/app/e2e-nav-delay";
import { isUuid } from "@/core/id";
import { listProjects } from "@/db/repositories/intake";
import { getProjectPipelineState, getProjectSummary } from "@/db/repositories/runner";

export const dynamic = "force-dynamic";

/**
 * M47 / D-118: sync shell so a Suspense boundary can render before project
 * data resolves. An async layout that awaits at the top leaves no reachable
 * fallback — the previous UI freezes until the new route arrives.
 */
export default function ProjectLayout({
  params,
  children,
}: {
  params: Promise<{ id: string }>;
  children: ReactNode;
}) {
  return (
    <Suspense fallback={<PageLoading label="Opening project workspace" />}>
      <ProjectChrome params={params}>{children}</ProjectChrome>
    </Suspense>
  );
}

async function ProjectChrome({
  params,
  children,
}: {
  params: Promise<{ id: string }>;
  children: ReactNode;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  await e2eNavDelay();

  const [project, pipeline, projects] = await Promise.all([
    getProjectSummary(id),
    getProjectPipelineState(id),
    listProjects(),
  ]);
  if (!project) notFound();

  return (
    <UnsavedEditProvider>
      <OperatorShell
        mode="project"
        projects={projects.map((p) => ({ id: p.id, name: p.name, status: p.status }))}
        project={{ id, name: project.name, pipeline }}
      >
        {children}
      </OperatorShell>
    </UnsavedEditProvider>
  );
}
