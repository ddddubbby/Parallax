import { notFound } from "next/navigation";
import { ProjectNextAction } from "@/components/project-next-action";
import { ProjectSubnav } from "@/components/project-subnav";
import { getProjectPipelineState, getProjectSummary } from "@/db/repositories/runner";

export default async function ProjectLayout({
  params,
  children,
}: {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}) {
  const { id } = await params;
  const [project, pipeline] = await Promise.all([getProjectSummary(id), getProjectPipelineState(id)]);
  if (!project) notFound();

  return (
    <>
      <ProjectSubnav projectId={id} projectName={project.name} />
      <ProjectNextAction projectId={id} state={pipeline} />
      {children}
    </>
  );
}
