import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { OperatorShell } from "@/components/shell/operator-shell";
import { isUuid } from "@/core/id";
import { listProjects } from "@/db/repositories/intake";
import { getProjectPipelineState, getProjectSummary } from "@/db/repositories/runner";

export const dynamic = "force-dynamic";

/** Project operator chrome for /projects/[id]/** (M32 / D-088). */
export default async function ProjectLayout({
  params,
  children,
}: {
  params: Promise<{ id: string }>;
  children: ReactNode;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const [project, pipeline, projects] = await Promise.all([
    getProjectSummary(id),
    getProjectPipelineState(id),
    listProjects(),
  ]);
  if (!project) notFound();

  return (
    <Suspense fallback={<div className="min-h-screen bg-paper" />}>
      <OperatorShell
        mode="project"
        projects={projects.map((p) => ({ id: p.id, name: p.name, status: p.status }))}
        project={{ id, name: project.name, pipeline }}
      >
        {children}
      </OperatorShell>
    </Suspense>
  );
}
