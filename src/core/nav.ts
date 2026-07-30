import { resolveProjectStage, type PipelineState } from "./pipeline";

/** M32 / D-088: single source for sidebar hierarchy labels and hrefs. */

export type NavItem = {
  id: string;
  label: string;
  /** Absolute href. */
  href: string;
  /** Pathname prefixes that mark this item active. */
  match: string[];
};

export type NavGroup = {
  id: string;
  label: string;
  items: NavItem[];
};

export function projectNavGroups(projectId: string): NavGroup[] {
  const base = `/projects/${projectId}`;
  return [
    {
      id: "setup",
      label: "Setup",
      items: [
        {
          id: "inputs",
          label: "Project inputs",
          href: `${base}/setup`,
          match: [`${base}/setup`],
        },
        {
          id: "matrix",
          label: "Prompt matrix",
          href: `${base}/matrix`,
          match: [`${base}/matrix`],
        },
        {
          id: "studies",
          label: "Message Lift tests",
          href: `${base}/resonance`,
          match: [`${base}/resonance`],
        },
      ],
    },
    {
      id: "execution",
      label: "Execution",
      items: [
        {
          id: "runs",
          label: "Runs",
          href: `${base}/runs`,
          match: [`${base}/runs`],
        },
      ],
    },
    {
      id: "results",
      label: "Results",
      items: [
        {
          id: "dashboard",
          label: "Evidence dashboard",
          href: `${base}/dashboard`,
          match: [`${base}/dashboard`],
        },
        {
          id: "sim-results",
          label: "Message Lift results",
          href: `${base}/dashboard?view=simulation`,
          match: [`${base}/dashboard`],
        },
        {
          id: "framing",
          label: "Framing evidence (historical)",
          href: `${base}/framing`,
          match: [`${base}/framing`],
        },
        {
          id: "report",
          label: "Reports",
          href: `${base}/report`,
          match: [`${base}/report`],
        },
      ],
    },
  ];
}

export const GLOBAL_NAV_ITEMS: NavItem[] = [
  { id: "projects", label: "All projects", href: "/projects", match: ["/projects"] },
  { id: "settings", label: "Settings", href: "/settings", match: ["/settings"] },
  { id: "debug", label: "Debug", href: "/debug", match: ["/debug"] },
];

export function isNavItemActive(pathname: string, search: string, item: NavItem): boolean {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  if (item.id === "sim-results") {
    return pathname.startsWith(item.match[0]!) && params.get("view") === "simulation";
  }
  if (item.id === "dashboard") {
    if (!pathname.startsWith(item.match[0]!)) return false;
    return params.get("view") !== "simulation";
  }
  if (item.id === "projects") {
    return pathname === "/projects" || pathname === "/projects/new";
  }
  return item.match.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function projectOverviewHref(projectId: string) {
  return `/projects/${projectId}`;
}

export type ProjectSwitcherItem = {
  id: string;
  name: string;
  status: "active" | "draft" | string;
};

export function projectSwitcherHref(project: ProjectSwitcherItem): string {
  return project.status === "draft" ? `/projects/new?id=${project.id}` : `/projects/${project.id}`;
}

export function sidebarNextAction(state: PipelineState, projectId: string) {
  const stage = resolveProjectStage(state);
  const href =
    stage.nextPath === null
      ? null
      : stage.nextPath === ""
        ? `/projects/new?id=${projectId}`
        : `/projects/${projectId}/${stage.nextPath}`;
  return { stageLabel: stage.stageLabel, nextLabel: stage.nextLabel, href };
}
