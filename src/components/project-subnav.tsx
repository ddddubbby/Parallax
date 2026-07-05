"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SECTIONS = [
  { label: "Matrix", segment: "matrix" },
  { label: "Runs", segment: "runs" },
  { label: "Dashboard", segment: "dashboard" },
  { label: "Report", segment: "report" },
  { label: "Resonance", segment: "resonance" },
] as const;

/**
 * OX-1: persistent per-project navigation on every project page. Before
 * this, each page carried only a breadcrumb pointing at Matrix — the
 * dashboard was unreachable from the matrix board without editing the URL.
 */
export function ProjectSubnav({ projectId, projectName }: { projectId: string; projectName: string }) {
  const pathname = usePathname();
  return (
    <div className="border-b border-ink/10">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-2">
        <span className="label-mono max-w-48 truncate text-xs font-medium text-ink/70" title={projectName}>
          {projectName}
        </span>
        <nav className="flex items-center gap-1" aria-label="Project sections">
          {SECTIONS.map(({ label, segment }) => {
            const href = `/projects/${projectId}/${segment}`;
            const active = pathname.startsWith(href);
            return (
              <Link
                key={segment}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`label-mono rounded-full px-3 py-1 text-xs transition-micro ${
                  active ? "bg-ink text-paper" : "text-ink/60 hover:text-ink"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
