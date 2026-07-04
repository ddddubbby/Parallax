import { notFound } from "next/navigation";
import { ProjectSubnav } from "@/components/project-subnav";
import { getProjectSummary } from "@/db/repositories/runner";

export default async function ProjectLayout({
  params,
  children,
}: {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}) {
  const { id } = await params;
  const project = await getProjectSummary(id);
  if (!project) notFound();

  return (
    <>
      <ProjectSubnav projectId={id} projectName={project.name} />
      {children}
    </>
  );
}
