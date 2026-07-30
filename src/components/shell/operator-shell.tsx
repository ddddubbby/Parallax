"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode, type MouseEvent } from "react";
import { useFormStatus } from "react-dom";
import {
  GLOBAL_NAV_ITEMS,
  isNavItemActive,
  projectNavGroups,
  projectOverviewHref,
  projectSwitcherHref,
  sidebarNextAction,
  type ProjectSwitcherItem,
} from "@/core/nav";
import type { PipelineState } from "@/core/pipeline";
import { cn } from "@/core/cn";
import { logout } from "@/modules/auth/actions";
import { AppMenu, AppMenuItem } from "@/components/ui/menu";
import { AppConfirmDialog } from "@/components/ui/dialog";
import { AppTooltip, AppTooltipProvider } from "@/components/ui/tooltip";
import { useUnsavedEdit } from "@/components/unsaved-edit";

export type OperatorShellProps = {
  mode: "global" | "project";
  projects: ProjectSwitcherItem[];
  children: ReactNode;
  project?: {
    id: string;
    name: string;
    pipeline: PipelineState;
  };
};

function NavLink({
  href,
  active,
  children,
  onNavigate,
  indent,
  beforeNavigate,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
  onNavigate?: () => void;
  indent?: boolean;
  beforeNavigate?: (href: string, returnFocus?: HTMLElement) => boolean;
}) {
  function onClick(e: MouseEvent<HTMLAnchorElement>) {
    if (beforeNavigate?.(href, e.currentTarget)) {
      e.preventDefault();
      return;
    }
    onNavigate?.();
  }

  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "interactive-press label-mono block rounded-md px-3 py-2 text-xs transition-micro",
        indent && "ml-2",
        active ? "bg-ink text-paper" : "text-ink/65 hover:bg-ink/5 hover:text-ink",
      )}
    >
      {children}
    </Link>
  );
}

function SidebarBody({
  mode,
  projects,
  project,
  onNavigate,
  beforeNavigate,
}: {
  mode: "global" | "project";
  projects: ProjectSwitcherItem[];
  project?: OperatorShellProps["project"];
  onNavigate?: () => void;
  beforeNavigate?: (href: string, returnFocus?: HTMLElement) => boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const switchProjectRef = useRef<HTMLButtonElement>(null);
  const search = searchParams.toString();
  const next = project ? sidebarNextAction(project.pipeline, project.id) : null;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-ink/10 px-4 py-4">
        <Link
          href="/projects"
          onClick={(event) => {
            if (beforeNavigate?.("/projects", event.currentTarget)) {
              event.preventDefault();
              return;
            }
            onNavigate?.();
          }}
          className="flex flex-col text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <span className="label-mono text-sm font-semibold">Resonance</span>
        </Link>
      </div>

      {mode === "project" && project && (
        <div className="border-b border-ink/10 px-3 py-3">
          <AppMenu
            align="start"
            trigger={
              <button
                ref={switchProjectRef}
                type="button"
                className="interactive-press label-mono flex min-h-11 w-full items-center justify-between rounded-md border border-ink/15 px-3 py-2 text-left text-xs text-ink transition-micro hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                aria-label="Switch project"
              >
                <span className="truncate">{project.name}</span>
                <span className="text-ink/60">▾</span>
              </button>
            }
          >
            {projects.map((p) => (
              <AppMenuItem
                key={p.id}
                onSelect={() => {
                  const href = projectSwitcherHref(p);
                  if (!beforeNavigate?.(href, switchProjectRef.current ?? undefined)) {
                    onNavigate?.();
                    router.push(href);
                  }
                }}
              >
                {p.name}
                {p.status === "draft" ? " · draft" : ""}
              </AppMenuItem>
            ))}
          </AppMenu>

          <NavLink
            href={projectOverviewHref(project.id)}
            active={pathname === `/projects/${project.id}`}
            onNavigate={onNavigate}
            beforeNavigate={beforeNavigate}
          >
            Project overview
          </NavLink>

          {next && (
            <div className="mt-3 rounded-lg border border-ink/10 bg-paper-2/50 px-3 py-2">
              <div className="label-mono text-[10px] text-ink/60">Stage</div>
              <div className="mt-0.5 font-mono text-xs text-ink/75">{next.stageLabel}</div>
              {next.nextLabel && next.href && (
                <Link
                  href={next.href}
                  onClick={(event) => {
                    if (beforeNavigate?.(next.href!, event.currentTarget)) {
                      event.preventDefault();
                      return;
                    }
                    onNavigate?.();
                  }}
                  className="label-mono mt-2 inline-block rounded-sm text-[11px] text-accent-ink hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  {next.nextLabel} →
                </Link>
              )}
            </div>
          )}
        </div>
      )}

      <nav className="flex-1 overflow-y-auto px-3 py-3" aria-label="Operator navigation">
        {mode === "project" && project ? (
          <div className="space-y-4">
            {projectNavGroups(project.id).map((group) => (
              <div key={group.id}>
                <div className="label-mono mb-1 px-3 text-[10px] text-ink/60">{group.label}</div>
                <div className="space-y-0.5">
                  {group.items.map((item) => (
                    <NavLink
                      key={item.id}
                      href={item.href}
                      active={isNavItemActive(pathname, search, item)}
                      onNavigate={onNavigate}
                      beforeNavigate={beforeNavigate}
                      indent
                    >
                      {item.label}
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-0.5">
            {GLOBAL_NAV_ITEMS.map((item) => (
              <NavLink
                key={item.id}
                href={item.href}
                active={isNavItemActive(pathname, search, item)}
                onNavigate={onNavigate}
                beforeNavigate={beforeNavigate}
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        )}
      </nav>

      <div className="border-t border-ink/10 px-3 py-3">
        {mode === "project" && (
          <div className="mb-2 space-y-0.5">
            {GLOBAL_NAV_ITEMS.map((item) => (
              <NavLink
                key={item.id}
                href={item.href}
                active={isNavItemActive(pathname, search, item)}
                onNavigate={onNavigate}
                beforeNavigate={beforeNavigate}
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        )}
        <form action={logout}>
          <SignOutButton />
        </form>
      </div>
    </div>
  );
}

function SignOutButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="interactive-press label-mono min-h-11 w-full rounded-md px-3 py-2 text-left text-xs text-ink/65 transition-micro hover:bg-ink/5 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-wait disabled:opacity-50"
      aria-busy={pending || undefined}
      disabled={pending}
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}

/**
 * M32 / D-088: one responsive left sidebar for authenticated operator surfaces.
 * Desktop: fixed ~248px. Below 1024px: Radix Dialog drawer (M33 / D-089 focus trap).
 */
export function OperatorShell(props: OperatorShellProps) {
  const [open, setOpen] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const router = useRouter();
  const { dirty, clearDirty } = useUnsavedEdit();
  const returnFocusRef = useRef<HTMLElement | null>(null);

  function beforeNavigate(href: string, returnFocus?: HTMLElement) {
    if (!dirty) return false;
    returnFocusRef.current = returnFocus ?? null;
    setPendingHref(href);
    return true;
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
    setOpen(false);
    router.push(href);
  }

  // Close drawer on navigation.
  useEffect(() => {
    setOpen(false);
  }, [pathname, search]);

  return (
    <AppTooltipProvider>
      <div className="min-h-screen bg-paper lg:flex">
        {/* Desktop sidebar */}
        <aside
          className="hidden w-[var(--sidebar-width)] shrink-0 border-r border-ink/10 bg-paper lg:fixed lg:inset-y-0 lg:flex lg:flex-col"
          aria-label="Sidebar"
        >
          <SidebarBody {...props} beforeNavigate={beforeNavigate} />
        </aside>

        {/* Mobile top bar + drawer (Radix Dialog = focus trap + restore). */}
        <Dialog.Root open={open} onOpenChange={setOpen}>
          <div className="operator-mobile-bar sticky top-0 z-30 flex items-center gap-3 border-b border-ink/10 bg-paper px-4 py-3 lg:hidden">
            <AppTooltip label="Open navigation">
              <Dialog.Trigger asChild>
                <button
                  type="button"
                  className="interactive-press flex min-h-11 min-w-11 items-center justify-center rounded-md border border-ink/15 p-2 text-ink transition-micro hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  aria-label="Open navigation"
                >
                  <Menu className="h-4 w-4" aria-hidden />
                </button>
              </Dialog.Trigger>
            </AppTooltip>
            <span className="label-mono truncate text-xs font-semibold">
              {props.mode === "project" && props.project ? props.project.name : "Resonance"}
            </span>
          </div>

          <Dialog.Portal>
            <Dialog.Overlay className="app-dialog-overlay fixed inset-0 z-40 bg-ink/40 lg:hidden" />
            <Dialog.Content
              aria-describedby={undefined}
              className="operator-drawer fixed inset-y-0 left-0 z-50 flex w-[min(100%,var(--sidebar-width))] flex-col border-r border-ink/10 bg-paper shadow-xl outline-none lg:hidden"
            >
              <div className="flex items-center justify-between border-b border-ink/10 px-3 py-2">
                <Dialog.Title className="label-mono text-xs font-semibold text-ink">
                  Navigation
                </Dialog.Title>
                <Dialog.Close
                  className="interactive-press flex min-h-11 min-w-11 items-center justify-center rounded-md p-2 text-ink/50 transition-micro hover:bg-ink/5 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  aria-label="Close navigation"
                >
                  <X className="h-4 w-4" aria-hidden />
                </Dialog.Close>
              </div>
              <SidebarBody
                {...props}
                onNavigate={() => setOpen(false)}
                beforeNavigate={beforeNavigate}
              />
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>

        <div className="min-w-0 flex-1 lg:pl-[var(--sidebar-width)]">{props.children}</div>
      </div>
      <AppConfirmDialog
        open={pendingHref !== null}
        onOpenChange={(next) => {
          if (!next) closeConfirmation();
        }}
        title="Discard unsaved changes?"
        description="Your unsaved edits on this page will be lost. Saved project data will not be changed."
        confirmLabel="Discard and leave"
        onConfirm={discardAndNavigate}
      />
    </AppTooltipProvider>
  );
}
