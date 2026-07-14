"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button, Input, Stamp } from "@/components/ui";
import { AppMenu, AppMenuItem } from "@/components/ui/menu";

type ProjectRow = {
  id: string;
  name: string;
  status: string;
  intakeStep: number;
  updatedAt: string;
};

/** M32 / D-088: searchable/filterable projects table with one primary action. */
export function ProjectsTable({ projects }: { projects: ProjectRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "draft">("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.filter((p) => {
      if (status !== "all" && p.status !== status) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q);
    });
  }, [projects, query, status]);

  const hasFilters = query.trim().length > 0 || status !== "all";

  function clearFilters() {
    setQuery("");
    setStatus("all");
  }

  return (
    <div className="min-w-0">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search projects"
          aria-label="Search projects"
          className="min-h-11 min-w-0 font-mono sm:max-w-xs"
        />
        <fieldset className="flex min-w-0 items-center gap-1 overflow-x-auto pb-1">
          <legend className="sr-only">Status filter</legend>
          {(["all", "active", "draft"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              aria-pressed={status === s}
              className={`interactive-press label-mono min-h-11 shrink-0 rounded-full px-4 py-2 text-xs transition-micro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                status === s ? "bg-ink text-paper" : "border border-ink/15 text-ink/60 hover:border-ink"
              }`}
            >
              {s[0].toUpperCase() + s.slice(1)}
            </button>
          ))}
        </fieldset>
      </div>

      <div className="mb-3 flex min-h-8 items-center justify-between gap-3">
        <p className="text-sm text-ink/60" role="status" aria-live="polite">
          Showing <span className="font-mono tabular-nums text-ink">{filtered.length}</span> of{" "}
          <span className="font-mono tabular-nums text-ink">{projects.length}</span>{" "}
          {projects.length === 1 ? "project" : "projects"}
        </p>
        {hasFilters && (
          <Button type="button" variant="ghost" className="min-h-11 shrink-0 px-3" onClick={clearFilters}>
            Clear filters
          </Button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-ink/15 px-5 py-10 text-center">
          <p className="label-mono text-sm text-ink/70">No projects match these filters</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink/60">
            Try a different project name or restore the complete project library.
          </p>
          <Button type="button" variant="secondary" className="mt-4" onClick={clearFilters}>
            Show all projects
          </Button>
        </div>
      ) : (
        <div
          className="overflow-x-auto rounded-xl border border-ink/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          role="region"
          aria-label="Projects table"
          tabIndex={0}
        >
          <table className="w-full min-w-[44rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink/20 bg-paper-2 text-left">
                <th className="label-mono px-4 py-3 text-xs font-medium text-ink/60">Name</th>
                <th className="label-mono py-3 pr-4 text-xs font-medium text-ink/60">Status</th>
                <th className="label-mono py-3 pr-4 text-xs font-medium text-ink/60">Step</th>
                <th className="label-mono py-3 pr-4 text-xs font-medium text-ink/60">Updated</th>
                <th className="label-mono py-3 pr-3 text-xs font-medium text-ink/60">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {filtered.map((p, i) => (
                <tr
                  key={p.id}
                  className={`border-b border-ink/10 last:border-b-0 ${i % 2 === 1 ? "bg-paper-2/40" : ""}`}
                >
                  <td className="px-4 py-3 font-sans font-medium text-ink">{p.name}</td>
                  <td className="py-3 pr-4">
                    <Stamp tone={p.status === "active" ? "ok" : "ink"}>{p.status}</Stamp>
                  </td>
                  <td className="py-3 pr-4 text-xs text-ink/60">
                    {p.status === "draft" ? `${Math.min(p.intakeStep, 8)}/8` : "—"}
                  </td>
                  <td className="py-3 pr-4 text-xs tabular-nums text-ink/60">
                    {p.updatedAt.slice(0, 10).replaceAll("-", ".")}
                  </td>
                  <td className="py-1.5 pr-2 text-right">
                    <span className="inline-flex items-center gap-1">
                      {p.status === "draft" ? (
                        <Link
                          href={`/projects/new?id=${p.id}`}
                          className="label-mono inline-flex min-h-11 items-center rounded-md px-2 text-xs text-accent-ink transition-micro hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        >
                          Resume →
                        </Link>
                      ) : (
                        <Link
                          href={`/projects/${p.id}`}
                          className="label-mono inline-flex min-h-11 items-center rounded-md px-2 text-xs text-accent-ink transition-micro hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        >
                          Open →
                        </Link>
                      )}
                      {p.status === "active" && (
                        <AppMenu
                          trigger={
                            <button
                              type="button"
                              className="interactive-press inline-grid size-11 place-items-center rounded-md text-ink/55 transition-micro hover:bg-ink/5 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                              aria-label={`More actions for ${p.name}`}
                            >
                              <MoreHorizontal className="h-4 w-4" aria-hidden />
                            </button>
                          }
                        >
                          <AppMenuItem onSelect={() => router.push(`/projects/${p.id}/runs`)}>
                            Runs
                          </AppMenuItem>
                          <AppMenuItem onSelect={() => router.push(`/projects/${p.id}/dashboard`)}>
                            Evidence dashboard
                          </AppMenuItem>
                        </AppMenu>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
