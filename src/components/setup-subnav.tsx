"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { label: "Inputs", segment: "setup" },
  { label: "Prompt matrix", segment: "matrix" },
  { label: "Simulation studies", segment: "resonance" },
] as const;

/**
 * M31 / D-087: Setup section sub-tabs. Matrix board and resonance study
 * wizard stay on their own routes (C-4: approved matrices are frozen
 * evidence; Setup inputs are mutable — never merge the pages).
 */
export function SetupSubnav({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  return (
    <nav className="mb-6 flex flex-wrap items-center gap-1" aria-label="Setup sections">
      {TABS.map(({ label, segment }) => {
        const href = `/projects/${projectId}/${segment}`;
        const active = pathname.startsWith(href);
        return (
          <Link
            key={segment}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`label-mono rounded-full px-3 py-1 text-xs transition-micro ${
              active ? "bg-ink text-paper" : "border border-ink/15 text-ink/60 hover:border-ink hover:text-ink"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
