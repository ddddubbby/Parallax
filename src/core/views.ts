// M32 / D-088: typed URL `view` parsers for one-section-at-a-time work surfaces.
// Components consume these helpers — never ad-hoc pathname/searchParams checks.

export const SETUP_VIEWS = ["basics", "brands", "personas", "markets", "attributes", "facts"] as const;
export type SetupView = (typeof SETUP_VIEWS)[number];

export const MATRIX_VIEWS = ["overview", "presence", "position", "perception"] as const;
export type MatrixView = (typeof MATRIX_VIEWS)[number];

export const RUN_DETAIL_VIEWS = ["overview", "events", "extraction", "metrics"] as const;
export type RunDetailView = (typeof RUN_DETAIL_VIEWS)[number];

export const DASHBOARD_VIEWS = [
  "overview",
  "presence",
  "position",
  "perception",
  "proof",
  "simulation",
] as const;
export type DashboardView = (typeof DASHBOARD_VIEWS)[number];

export const STUDY_VIEWS = ["overview", "design", "runs", "results", "evidence"] as const;
export type StudyView = (typeof STUDY_VIEWS)[number];

export const STUDY_RESULT_SECTIONS = ["ranking", "deltas", "segments", "excerpts"] as const;
export type StudyResultSection = (typeof STUDY_RESULT_SECTIONS)[number];

export const SETTINGS_VIEWS = ["providers", "defaults"] as const;
export type SettingsView = (typeof SETTINGS_VIEWS)[number];

/** Report section keys vary by matrix kind; invalid values fall back to the first section. */
export function parseReportView(
  raw: string | null | undefined,
  kind: "audit" | "resonance" = "audit",
): string {
  const sections = kind === "resonance"
    ? (["resonance_method", "resonance_results", "resonance_evidence"] as const)
    : ([
        "executive_summary",
        "method_confidence",
        "visibility",
        "perception",
        "competitive_dynamics",
        "sources",
        "misinformation_register",
        "recommendations",
        "raw_answer_appendix",
      ] as const);
  return parseOne(raw, sections, sections[0]);
}

function parseOne<T extends string>(
  raw: string | null | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  if (raw && (allowed as readonly string[]).includes(raw)) return raw as T;
  return fallback;
}

export function parseSetupView(raw: string | null | undefined): SetupView {
  return parseOne(raw, SETUP_VIEWS, "basics");
}

export function parseMatrixView(raw: string | null | undefined): MatrixView {
  return parseOne(raw, MATRIX_VIEWS, "overview");
}

export function parseRunDetailView(raw: string | null | undefined): RunDetailView {
  return parseOne(raw, RUN_DETAIL_VIEWS, "overview");
}

export function parseDashboardView(raw: string | null | undefined): DashboardView {
  return parseOne(raw, DASHBOARD_VIEWS, "overview");
}

export function parseStudyView(raw: string | null | undefined): StudyView {
  return parseOne(raw, STUDY_VIEWS, "overview");
}

export function parseStudyResultSection(raw: string | null | undefined): StudyResultSection {
  return parseOne(raw, STUDY_RESULT_SECTIONS, "ranking");
}

export function parseSettingsView(raw: string | null | undefined): SettingsView {
  return parseOne(raw, SETTINGS_VIEWS, "providers");
}

/** Build a path with a `view` query, preserving other params when provided. */
export function withViewParam(
  pathname: string,
  view: string,
  extra?: Record<string, string | undefined>,
): string {
  const params = new URLSearchParams();
  params.set("view", view);
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (value !== undefined && value !== "") params.set(key, value);
    }
  }
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}
