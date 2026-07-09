"use client";

import Link from "next/link";
import { cn } from "@/core/cn";

export type LocalViewTab = {
  id: string;
  label: string;
  href: string;
};

/** M32 / D-088: vertical-or-horizontal local view switcher for one-section pages. */
export function LocalViewTabs({
  tabs,
  activeId,
  label = "Section",
}: {
  tabs: LocalViewTab[];
  activeId: string;
  label?: string;
}) {
  return (
    <nav className="mb-6 flex flex-wrap gap-1" aria-label={label}>
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "label-mono rounded-full px-3 py-1 text-xs transition-micro",
              active
                ? "bg-ink text-paper"
                : "border border-ink/15 text-ink/60 hover:border-ink hover:text-ink",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
