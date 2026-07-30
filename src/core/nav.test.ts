import { describe, expect, it } from "vitest";
import {
  GLOBAL_NAV_ITEMS,
  isNavItemActive,
  projectNavGroups,
  projectSwitcherHref,
  sidebarNextAction,
} from "./nav";

describe("nav config (M32 / D-088)", () => {
  const groups = projectNavGroups("p1");

  it("exposes Setup / Execution / Results hierarchy", () => {
    expect(groups.map((g) => g.id)).toEqual(["setup", "execution", "results"]);
    expect(groups[0]?.items.map((i) => i.id)).toEqual(["inputs", "matrix", "studies"]);
    expect(groups[2]?.items.map((i) => i.id)).toEqual([
      "dashboard",
      "sim-results",
      "framing",
      "report",
    ]);
  });

  it("distinguishes Evidence dashboard from Simulation results via view param", () => {
    const dash = groups.flatMap((g) => g.items).find((i) => i.id === "dashboard")!;
    const sim = groups.flatMap((g) => g.items).find((i) => i.id === "sim-results")!;
    expect(isNavItemActive("/projects/p1/dashboard", "", dash)).toBe(true);
    expect(isNavItemActive("/projects/p1/dashboard", "view=simulation", dash)).toBe(false);
    expect(isNavItemActive("/projects/p1/dashboard", "view=simulation", sim)).toBe(true);
    expect(isNavItemActive("/projects/p1/dashboard", "", sim)).toBe(false);
  });

  it("does not mark All projects active on a project hub", () => {
    const projects = GLOBAL_NAV_ITEMS.find((i) => i.id === "projects")!;
    expect(isNavItemActive("/projects", "", projects)).toBe(true);
    expect(isNavItemActive("/projects/p1", "", projects)).toBe(false);
  });

  it("routes draft switcher items to resumable intake", () => {
    expect(projectSwitcherHref({ id: "d1", name: "Draft", status: "draft" })).toBe(
      "/projects/new?id=d1",
    );
    expect(projectSwitcherHref({ id: "a1", name: "Live", status: "active" })).toBe("/projects/a1");
  });

  it("builds sidebar next-action hrefs from pipeline state", () => {
    const action = sidebarNextAction(
      {
        intakeComplete: true,
        hasMatrix: true,
        hasApprovedMatrix: true,
        hasActiveRun: false,
        hasCompletedRun: true,
        hasCompletedResonanceRun: true,
      },
      "p1",
    );
    expect(action.href).toBe("/projects/p1/dashboard?view=simulation");
    expect(action.nextLabel).toMatch(/message lift/i);
  });
});
