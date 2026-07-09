"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SECTIONS = [
  // M31 / D-087: four top-level items. Matrix + Simulation studies live under
  // Setup as sub-tabs (routes stay /matrix and /resonance — D-077 protect).
  { label: "Setup", segment: "setup", alsoActive: ["matrix", "resonance"] as const },
  { label: "Runs", segment: "runs", alsoActive: [] as const },
  { label: "Dashboard", segment: "dashboard", alsoActive: [] as const },
  { label: "Report", segment: "report", alsoActive: [] as const },
] as const;

/**
 * OX-1 / M31: persistent per-project navigation. Project name links to the
 * hub (`/projects/[id]`); Setup is active for /setup, /matrix, and /resonance.
 */
export function ProjectSubnav({ projectId, projectName }: { projectId: string; projectName: string }) {
  const pathname = usePathname();
  const hubHref = `/projects/${projectId}`;
  const onHub = pathname === hubHref || pathname === `${hubHref}/`;

  return (
    <div className="border-b border-ink/10">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-2">
        <Link
          href={hubHref}
          className={`label-mono max-w-48 truncate text-xs font-medium transition-micro ${
            onHub ? "text-ink" : "text-ink/70 hover:text-ink"
          }`}
          title={projectName}
        >
          {projectName}
        </Link>
        <nav className="flex items-center gap-1" aria-label="Project sections">
          {SECTIONS.map(({ label, segment, alsoActive }) => {
            const href = `/projects/${projectId}/${segment}`;
            const active =
              pathname.startsWith(href) ||
              alsoActive.some((s) => pathname.startsWith(`/projects/${projectId}/${s}`));
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
