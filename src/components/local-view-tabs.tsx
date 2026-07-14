"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type MouseEvent } from "react";
import { cn } from "@/core/cn";
import { AppConfirmDialog } from "@/components/ui/dialog";
import { useUnsavedEdit } from "@/components/unsaved-edit";

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
  const router = useRouter();
  const { dirty, clearDirty } = useUnsavedEdit();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const returnFocusRef = useRef<HTMLAnchorElement | null>(null);

  function onTabClick(event: MouseEvent<HTMLAnchorElement>, href: string) {
    if (!dirty) return;
    event.preventDefault();
    returnFocusRef.current = event.currentTarget;
    setPendingHref(href);
  }

  function closeConfirmation() {
    setPendingHref(null);
    requestAnimationFrame(() => returnFocusRef.current?.focus());
  }

  function discardAndNavigate() {
    if (!pendingHref) return;
    const href = pendingHref;
    clearDirty();
    setPendingHref(null);
    router.push(href);
  }

  return (
    <>
      <nav
        className="local-tab-rail -mx-1 mb-6 flex gap-1 overflow-x-auto px-1 pb-1"
        aria-label={label}
      >
        {tabs.map((tab) => {
          const active = tab.id === activeId;
          return (
            <Link
              key={tab.id}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              onClick={(event) => onTabClick(event, tab.href)}
              className={cn(
                "interactive-press label-mono inline-flex min-h-9 shrink-0 items-center rounded-full px-3 py-1 text-xs transition-micro max-sm:min-h-11",
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
      <AppConfirmDialog
        open={pendingHref !== null}
        onOpenChange={(next) => {
          if (!next) closeConfirmation();
        }}
        title="Discard unsaved changes?"
        description="Your unsaved edits in this section will be lost. Saved project data will not be changed."
        confirmLabel="Discard and continue"
        onConfirm={discardAndNavigate}
      />
    </>
  );
}
