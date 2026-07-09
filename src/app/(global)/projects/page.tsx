import Link from "next/link";
import { Stamp } from "@/components/ui";
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
          className="label-mono rounded-full bg-accent px-5 py-2 text-xs text-paper transition-micro hover:bg-accent/90"
        >
          New project
        </Link>
      </div>

      {projects.length === 0 ? (
        <div className="rounded-xl border border-ink/15 p-10 text-center">
          <p className="label-mono text-sm text-ink/60">No projects on file</p>
          <p className="mt-1 font-mono text-xs text-ink/45">
            create a project to begin an audit
          </p>
        </div>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-ink/20 text-left">
              <th className="label-mono py-2 pr-4 text-xs font-medium text-ink/60">Name</th>
              <th className="label-mono py-2 pr-4 text-xs font-medium text-ink/60">Status</th>
              <th className="label-mono py-2 pr-4 text-xs font-medium text-ink/60">Step</th>
              <th className="label-mono py-2 pr-4 text-xs font-medium text-ink/60">Updated</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody className="font-mono">
            {projects.map((p, i) => (
              <tr
                key={p.id}
                className={`border-b border-ink/10 ${i % 2 === 1 ? "bg-paper-2/40" : ""}`}
              >
                <td className="py-2.5 pr-4">{p.name}</td>
                <td className="py-2.5 pr-4">
                  <Stamp tone={p.status === "active" ? "ok" : "ink"}>{p.status}</Stamp>
                </td>
                <td className="py-2.5 pr-4 text-xs text-ink/60">
                  {p.status === "draft" ? `${Math.min(p.intakeStep, 8)}/8` : "—"}
                </td>
                <td className="py-2.5 pr-4 text-xs text-ink/60">
                  {p.updatedAt.toISOString().slice(0, 10).replaceAll("-", ".")}
                </td>
                <td className="py-2.5 text-right">
                  {p.status === "draft" ? (
                    <Link
                      href={`/projects/new?id=${p.id}`}
                      className="label-mono text-xs text-accent-ink hover:text-accent"
                    >
                      Resume →
                    </Link>
                  ) : (
                    <span className="flex justify-end gap-3">
                      <Link
                        href={`/projects/${p.id}`}
                        className="label-mono text-xs text-accent-ink hover:text-accent"
                      >
                        Open →
                      </Link>
                      <Link
                        href={`/projects/${p.id}/runs`}
                        className="label-mono text-xs text-accent-ink hover:text-accent"
                      >
                        Runs →
                      </Link>
                      <Link
                        href={`/projects/${p.id}/dashboard`}
                        className="label-mono text-xs text-accent-ink hover:text-accent"
                      >
                        Dashboard →
                      </Link>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
