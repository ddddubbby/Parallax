"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { Stamp } from "@/components/ui";
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

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search projects"
          aria-label="Search projects"
          className="rounded-lg border border-ink/20 bg-paper px-3 py-2 font-mono text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        />
        <fieldset className="flex items-center gap-1">
          <legend className="sr-only">Status filter</legend>
          {(["all", "active", "draft"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              aria-pressed={status === s}
              className={`label-mono rounded-full px-3 py-1 text-xs transition-micro ${
                status === s ? "bg-ink text-paper" : "border border-ink/15 text-ink/60 hover:border-ink"
              }`}
            >
              {s}
            </button>
          ))}
        </fieldset>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-ink/15 p-10 text-center">
          <p className="label-mono text-sm text-ink/60">No matching projects</p>
        </div>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-ink/20 text-left">
              <th className="label-mono py-2 pr-4 text-xs font-medium text-ink/60">Name</th>
              <th className="label-mono py-2 pr-4 text-xs font-medium text-ink/60">Status</th>
              <th className="label-mono py-2 pr-4 text-xs font-medium text-ink/60">Step</th>
              <th className="label-mono py-2 pr-4 text-xs font-medium text-ink/60">Updated</th>
              <th className="label-mono py-2 text-xs font-medium text-ink/60">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {filtered.map((p, i) => (
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
                  {p.updatedAt.slice(0, 10).replaceAll("-", ".")}
                </td>
                <td className="py-2.5 text-right">
                  <span className="inline-flex items-center gap-2">
                    {p.status === "draft" ? (
                      <Link
                        href={`/projects/new?id=${p.id}`}
                        className="label-mono text-xs text-accent-ink hover:text-accent"
                      >
                        Resume →
                      </Link>
                    ) : (
                      <Link
                        href={`/projects/${p.id}`}
                        className="label-mono text-xs text-accent-ink hover:text-accent"
                      >
                        Open →
                      </Link>
                    )}
                    {p.status === "active" && (
                      <AppMenu
                        trigger={
                          <button
                            type="button"
                            className="rounded-md p-1 text-ink/40 hover:bg-ink/5 hover:text-ink"
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
      )}
    </div>
  );
}
