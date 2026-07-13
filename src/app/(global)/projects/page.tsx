import Link from "next/link";
import { ProjectsTable } from "@/components/projects-table";
import { listProjects } from "@/db/repositories/intake";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const projects = await listProjects();

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="label-mono text-lg font-semibold">Projects</h1>
        <Link
          href="/projects/new"
          className="interactive-press label-mono rounded-full bg-accent px-5 py-2 text-xs text-ink transition-micro hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          New project
        </Link>
      </div>

      {projects.length === 0 ? (
        <div className="rounded-xl border border-ink/15 p-10 text-center">
          <p className="label-mono text-sm text-ink/60">No projects on file</p>
          <p className="mt-1 text-sm text-ink/60">Create a project to begin an audit.</p>
        </div>
      ) : (
        <ProjectsTable
          projects={projects.map((p) => ({
            id: p.id,
            name: p.name,
            status: p.status,
            intakeStep: p.intakeStep,
            updatedAt: p.updatedAt.toISOString(),
          }))}
        />
      )}
    </main>
  );
}
