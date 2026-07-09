import { describe, expect, it } from "vitest";
import {
  parseDashboardView,
  parseMatrixView,
  parseReportView,
  parseRunDetailView,
  parseSettingsView,
  parseSetupView,
  parseStudyResultSection,
  parseStudyView,
  withViewParam,
} from "./views";

describe("URL view parsers (M32 / D-088)", () => {
  it("falls back to documented defaults for missing/invalid values", () => {
    expect(parseSetupView(undefined)).toBe("basics");
    expect(parseSetupView("nope")).toBe("basics");
    expect(parseMatrixView(null)).toBe("overview");
    expect(parseRunDetailView("")).toBe("overview");
    expect(parseDashboardView("audit")).toBe("overview");
    expect(parseStudyView("wizard")).toBe("overview");
    expect(parseStudyResultSection(undefined)).toBe("ranking");
    expect(parseSettingsView("secrets")).toBe("providers");
    expect(parseReportView(undefined)).toBe("executive_summary");
    expect(parseReportView("nope", "resonance")).toBe("resonance_method");
  });

  it("accepts each allowed view token", () => {
    expect(parseSetupView("facts")).toBe("facts");
    expect(parseMatrixView("perception")).toBe("perception");
    expect(parseRunDetailView("extraction")).toBe("extraction");
    expect(parseDashboardView("simulation")).toBe("simulation");
    expect(parseStudyView("evidence")).toBe("evidence");
    expect(parseStudyResultSection("deltas")).toBe("deltas");
    expect(parseSettingsView("defaults")).toBe("defaults");
    expect(parseReportView("recommendations")).toBe("recommendations");
    expect(parseReportView("resonance_results", "resonance")).toBe("resonance_results");
  });

  it("builds view query strings without dropping extra params", () => {
    expect(withViewParam("/projects/x/matrix", "presence", { v: "abc" })).toBe(
      "/projects/x/matrix?view=presence&v=abc",
    );
    expect(withViewParam("/settings", "providers")).toBe("/settings?view=providers");
  });
});
