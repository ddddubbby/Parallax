import { z } from "zod";

// M44 / D-114: the Simulation baseline stamp — immutable provenance attached
// server-side when a measured_ai stimulus is saved. The stimulus body is
// always the verbatim stored response (C-13); the stamp records where it came
// from and how often its theme recurs, as descriptive counts only (never
// Wilson/CI on correlated draws). Theme labels are presentation metadata:
// machine-grouped, never certified coding, never an admission gate.

export const baselineStampSchema = z
  .object({
    responseId: z.string().uuid(),
    providerId: z.string().min(1),
    generationMode: z.string().min(1),
    modelVersion: z.string().min(1),
    promptText: z.string().min(1),
    respondedAt: z.string().min(1),
    /** Machine-generated theme the operator picked from; null when picked from the flat list. */
    themeLabel: z.string().nullable(),
    /** Descriptive recurrence: responses whose client-brand attributes include the theme, over all sampled responses. */
    recurrence: z
      .object({ matching: z.number().int().nonnegative(), total: z.number().int().positive() })
      .nullable(),
  })
  .strict();

export type BaselineStamp = z.infer<typeof baselineStampSchema>;

/** True when the stamp's theme was observed in at most one sampled response. */
export function isSingleInstance(stamp: BaselineStamp): boolean {
  return stamp.recurrence === null || stamp.recurrence.matching <= 1;
}

/** The one truthful recurrence line rendered wherever the baseline renders. */
export function recurrenceLine(stamp: BaselineStamp): string {
  if (isSingleInstance(stamp)) return "SINGLE OBSERVED INSTANCE";
  const r = stamp.recurrence!;
  return `theme appears in ${r.matching}/${r.total} sampled responses`;
}

// ---- theme grouping (v1: attribute-association themes, zero new spend) ----

export interface ThemeSourceRow {
  responseId: string;
  /** Client-brand attributes extracted from this response (may be empty). */
  attributes: string[];
}

export interface FramingTheme {
  /** The normalized attribute this theme groups on. */
  key: string;
  /** Display label (the most common original casing). */
  label: string;
  /** Distinct response ids the theme appears in, insertion-ordered. */
  responseIds: string[];
  /** Descriptive count over the full sampled set. */
  matching: number;
  total: number;
}

const MAX_THEMES = 8;

/**
 * Group stored responses into framing themes by their extracted client-brand
 * attributes. Pure and deterministic: themes order by (count desc, key asc),
 * capped at MAX_THEMES; a response can belong to several themes (a response
 * that says "affordable and reliable" evidences both). Responses with no
 * extracted attributes stay reachable via the flat list — grouping organizes,
 * it never hides evidence.
 */
export function groupResponsesByAttributeThemes(rows: ThemeSourceRow[]): FramingTheme[] {
  const total = new Set(rows.map((r) => r.responseId)).size;
  if (total === 0) return [];
  const byKey = new Map<string, { label: Map<string, number>; ids: Set<string> }>();
  for (const row of rows) {
    for (const attribute of row.attributes) {
      const key = attribute.trim().toLowerCase();
      if (key === "") continue;
      const entry = byKey.get(key) ?? { label: new Map(), ids: new Set() };
      entry.label.set(attribute.trim(), (entry.label.get(attribute.trim()) ?? 0) + 1);
      entry.ids.add(row.responseId);
      byKey.set(key, entry);
    }
  }
  return [...byKey.entries()]
    .map(([key, entry]) => ({
      key,
      label: [...entry.label.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0],
      responseIds: [...entry.ids],
      matching: entry.ids.size,
      total,
    }))
    .sort((a, b) => b.matching - a.matching || a.key.localeCompare(b.key))
    .slice(0, MAX_THEMES);
}
