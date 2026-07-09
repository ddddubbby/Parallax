"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useEffect, useId, useState, type ReactNode } from "react";
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
import { AppMenu, AppMenuItem, AppMenuSeparator } from "@/components/ui/menu";
import { AppTooltip, AppTooltipProvider } from "@/components/ui/tooltip";

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
}: {
  href: string;
  active: boolean;
  children: ReactNode;
  onNavigate?: () => void;
  indent?: boolean;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "label-mono block rounded-md px-3 py-1.5 text-xs transition-micro",
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
}: {
  mode: "global" | "project";
  projects: ProjectSwitcherItem[];
  project?: OperatorShellProps["project"];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const next = project ? sidebarNextAction(project.pipeline, project.id) : null;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-ink/10 px-4 py-4">
        <Link
          href="/projects"
          onClick={onNavigate}
          className="flex flex-col text-ink"
        >
          <span className="label-mono text-sm font-semibold">Resonance</span>
          <span className="font-mono text-[10px] text-ink/45">Parallax measurement engine</span>
        </Link>
      </div>

      {mode === "project" && project && (
        <div className="border-b border-ink/10 px-3 py-3">
          <AppMenu
            align="start"
            trigger={
              <button
                type="button"
                className="label-mono flex w-full items-center justify-between rounded-md border border-ink/15 px-3 py-2 text-left text-xs text-ink transition-micro hover:border-ink"
                aria-label="Switch project"
              >
                <span className="truncate">{project.name}</span>
                <span className="text-ink/40">▾</span>
              </button>
            }
          >
            {projects.map((p) => (
              <AppMenuItem
                key={p.id}
                onSelect={() => {
                  onNavigate?.();
                  router.push(projectSwitcherHref(p));
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
          >
            Project overview
          </NavLink>

          {next && (
            <div className="mt-3 rounded-lg border border-ink/10 bg-paper-2/50 px-3 py-2">
              <div className="label-mono text-[10px] text-ink/45">Stage</div>
              <div className="mt-0.5 font-mono text-xs text-ink/75">{next.stageLabel}</div>
              {next.nextLabel && next.href && (
                <Link
                  href={next.href}
                  onClick={onNavigate}
                  className="label-mono mt-2 inline-block text-[11px] text-accent-ink hover:text-accent"
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
                <div className="label-mono mb-1 px-3 text-[10px] text-ink/40">{group.label}</div>
                <div className="space-y-0.5">
                  {group.items.map((item) => (
                    <NavLink
                      key={item.id}
                      href={item.href}
                      active={isNavItemActive(pathname, search, item)}
                      onNavigate={onNavigate}
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
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        )}
        <form action={logout}>
          <button
            type="submit"
            className="label-mono w-full rounded-md px-3 py-1.5 text-left text-xs text-ink/55 transition-micro hover:bg-ink/5 hover:text-ink"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}

/**
 * M32 / D-088: one responsive left sidebar for authenticated operator surfaces.
 * Desktop: fixed ~248px. Below 1024px: focus-trapped drawer.
 */
export function OperatorShell(props: OperatorShellProps) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const pathname = usePathname();
  const search = useSearchParams().toString();

  // Close drawer on navigation.
  useEffect(() => {
    setOpen(false);
  }, [pathname, search]);

  // Escape closes drawer.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <AppTooltipProvider>
      <div className="min-h-screen bg-paper lg:flex">
        {/* Desktop sidebar */}
        <aside
          className="hidden w-[var(--sidebar-width)] shrink-0 border-r border-ink/10 bg-paper lg:fixed lg:inset-y-0 lg:flex lg:flex-col"
          aria-label="Sidebar"
        >
          <SidebarBody {...props} />
        </aside>

        {/* Mobile top bar */}
        <div className="operator-mobile-bar sticky top-0 z-30 flex items-center gap-3 border-b border-ink/10 bg-paper px-4 py-3 lg:hidden">
          <AppTooltip label="Open navigation">
            <button
              type="button"
              className="rounded-md border border-ink/15 p-2 text-ink transition-micro hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              aria-label="Open navigation"
              aria-expanded={open}
              aria-controls={titleId}
              onClick={() => setOpen(true)}
            >
              <Menu className="h-4 w-4" aria-hidden />
            </button>
          </AppTooltip>
          <span className="label-mono truncate text-xs font-semibold">
            {props.mode === "project" && props.project ? props.project.name : "Resonance"}
          </span>
        </div>

        {/* Mobile drawer */}
        {open && (
          <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-labelledby={titleId}>
            <button
              type="button"
              className="absolute inset-0 bg-ink/40"
              aria-label="Close navigation"
              onClick={() => setOpen(false)}
            />
            <aside
              id={titleId}
              className="absolute inset-y-0 left-0 flex w-[min(100%,var(--sidebar-width))] flex-col border-r border-ink/10 bg-paper shadow-xl"
            >
              <div className="flex justify-end p-2">
                <button
                  type="button"
                  className="rounded-md p-2 text-ink/50 hover:bg-ink/5 hover:text-ink"
                  aria-label="Close navigation"
                  onClick={() => setOpen(false)}
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <SidebarBody {...props} onNavigate={() => setOpen(false)} />
            </aside>
          </div>
        )}

        <div className="min-w-0 flex-1 lg:pl-[var(--sidebar-width)]">{props.children}</div>
      </div>
    </AppTooltipProvider>
  );
}
