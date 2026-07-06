import type { ReportEvidenceExcerpt } from "@/core/report-templates";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../client";
import { extractions, metrics, reportSections, responses } from "../schema";
import {
  getBrandMentionsForExtractions,
  getClaimsForExtractions,
  getEligibleExtractionsForRun,
} from "./extraction";

export async function getReportSections(runId: string) {
  return db.select().from(reportSections).where(eq(reportSections.runId, runId)).orderBy(reportSections.position);
}

export async function getReportFreshness(runId: string) {
  // Raw sql`max(...)`/`min(...)` fragments bypass drizzle's per-column decoder
  // and come back as strings, not Dates (same reality D-074 hit in
  // areMetricsStale) — type them string and convert before comparing.
  const [[metricRow], [extractionRow], [sectionRow]] = await Promise.all([
    db
      .select({ latestMetricComputedAt: sql<string | null>`max(${metrics.computedAt})` })
      .from(metrics)
      .where(eq(metrics.runId, runId)),
    db
      .select({ latestExtractionUpdatedAt: sql<string | null>`max(${extractions.updatedAt})` })
      .from(extractions)
      .innerJoin(responses, eq(responses.id, extractions.responseId))
      .where(eq(responses.runId, runId)),
    db
      .select({ oldestSectionUpdatedAt: sql<string | null>`min(${reportSections.updatedAt})` })
      .from(reportSections)
      .where(eq(reportSections.runId, runId)),
  ]);
  const latestMetricComputedAt = toDate(metricRow?.latestMetricComputedAt);
  const latestExtractionUpdatedAt = toDate(extractionRow?.latestExtractionUpdatedAt);
  const oldestSectionUpdatedAt = toDate(sectionRow?.oldestSectionUpdatedAt);
  const latestInputUpdatedAt = maxDate(latestMetricComputedAt, latestExtractionUpdatedAt);
  return {
    latestMetricComputedAt,
    latestExtractionUpdatedAt,
    oldestSectionUpdatedAt,
    stale: Boolean(
      latestInputUpdatedAt &&
        oldestSectionUpdatedAt &&
        oldestSectionUpdatedAt.getTime() < latestInputUpdatedAt.getTime(),
    ),
  };
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (value == null) return null;
  return value instanceof Date ? value : new Date(value);
}

function maxDate(...dates: Array<Date | null>): Date | null {
  const present = dates.filter((date): date is Date => date !== null);
  if (present.length === 0) return null;
  return new Date(Math.max(...present.map((date) => date.getTime())));
}

/** Report generation: only creates rows that don't already exist — never overwrites an edited section (RB-2/RB-3). */
export async function ensureSection(
  runId: string,
  sectionKey: string,
  position: number,
  generatedMd: string,
) {
  const [existing] = await db
    .select({ id: reportSections.id })
    .from(reportSections)
    .where(and(eq(reportSections.runId, runId), eq(reportSections.sectionKey, sectionKey)));
  if (existing) return existing.id;
  const [row] = await db
    .insert(reportSections)
    .values({ runId, sectionKey, position, generatedMd, state: "generated" })
    .returning({ id: reportSections.id });
  return row.id;
}

/** RB-2: an operator edit always wins over generated_md going forward. */
export async function saveEdit(runId: string, sectionId: string, editedMd: string) {
  const updated = await db
    .update(reportSections)
    .set({ editedMd, state: "edited", updatedAt: new Date() })
    .where(and(eq(reportSections.id, sectionId), eq(reportSections.runId, runId)))
    .returning({ id: reportSections.id });
  return updated.length;
}

/** RB-3: regenerating a section replaces generated_md and clears the edit — this section only, never siblings. */
export async function regenerateSection(runId: string, sectionId: string, sectionKey: string, generatedMd: string) {
  const updated = await db
    .update(reportSections)
    .set({ generatedMd, editedMd: null, state: "regenerated", updatedAt: new Date() })
    .where(
      and(
        eq(reportSections.id, sectionId),
        eq(reportSections.runId, runId),
        eq(reportSections.sectionKey, sectionKey),
      ),
    )
    .returning({ id: reportSections.id });
  return updated.length;
}

export async function getSection(sectionId: string) {
  const [row] = await db.select().from(reportSections).where(eq(reportSections.id, sectionId));
  return row ?? null;
}

interface FindingEvidenceRow {
  id: string;
  findingType: string;
  title: string;
  evidenceJson: unknown;
}

const UNSUPPORTED_VERDICTS = new Set(["contradicted", "unsupported", "outdated"]);

/** TP-2: deterministic first-k raw-response excerpts for each report finding. */
export async function getFindingEvidenceExcerpts(
  runId: string,
  findingRows: FindingEvidenceRow[],
  limitPerFinding = 1,
): Promise<ReportEvidenceExcerpt[]> {
  if (findingRows.length === 0) return [];

  const eligible = await getEligibleExtractionsForRun(runId);
  if (eligible.length === 0) return [];

  const responseIds = eligible.map((e) => e.responseId);
  const extractionIds = eligible.map((e) => e.extractionId);
  const [responseRows, mentionRows, claimRows] = await Promise.all([
    db
      .select({
        id: responses.id,
        rawText: responses.rawText,
        providerId: responses.providerId,
        generationMode: responses.generationMode,
      })
      .from(responses)
      .where(inArray(responses.id, responseIds)),
    getBrandMentionsForExtractions(extractionIds),
    getClaimsForExtractions(extractionIds),
  ]);

  const responseById = new Map(responseRows.map((r) => [r.id, r]));
  const mentionsByExtraction = groupBy(mentionRows, (m) => m.extractionId);
  const claimsByExtraction = groupBy(claimRows, (c) => c.extractionId);
  const sortedEligible = [...eligible].sort((a, b) => a.responseId.localeCompare(b.responseId));

  const excerpts: ReportEvidenceExcerpt[] = [];
  for (const finding of findingRows) {
    const matches = matchingEligibleForFinding(
      finding,
      sortedEligible,
      mentionsByExtraction,
      claimsByExtraction,
    );
    // TP-2: cite only responses that actually match the finding. A finding
    // with no match gets no excerpt (the report template renders "no excerpt
    // available") rather than a misleading unrelated one.
    const selected = matches.slice(0, limitPerFinding);

    for (const sample of selected) {
      const response = responseById.get(sample.responseId);
      if (!response) continue;
      excerpts.push({
        findingId: finding.id,
        findingType: finding.findingType,
        findingTitle: finding.title,
        responseId: response.id,
        providerId: response.providerId,
        generationMode: response.generationMode,
        quote: rawExcerpt(response.rawText),
      });
    }
  }
  return excerpts;
}

function matchingEligibleForFinding<TMention extends { extractionId: string; attributesJson: unknown }, TClaim extends { extractionId: string; extractedVerdict: string; operatorVerdict: string | null }>(
  finding: FindingEvidenceRow,
  eligible: Array<{
    responseId: string;
    cellId: string;
    generationMode: string;
    extractionId: string;
    extractedJson: unknown;
  }>,
  mentionsByExtraction: Map<string, TMention[]>,
  claimsByExtraction: Map<string, TClaim[]>,
) {
  const evidence = (finding.evidenceJson ?? {}) as Record<string, unknown>;
  const cellId = typeof evidence.cellId === "string" ? evidence.cellId : null;
  const attribute = typeof evidence.attribute === "string" ? evidence.attribute : null;
  const domain = typeof evidence.domain === "string" ? evidence.domain : null;

  if (finding.findingType === "lost_shortlist" || finding.findingType === "low_stability") {
    return cellId ? eligible.filter((e) => e.cellId === cellId) : [];
  }

  if (finding.findingType === "positioning_gap" && attribute) {
    return eligible.filter((e) =>
      (mentionsByExtraction.get(e.extractionId) ?? []).some((m) =>
        Array.isArray(m.attributesJson) && m.attributesJson.includes(attribute),
      ),
    );
  }

  if (finding.findingType === "misinformation") {
    return eligible.filter((e) =>
      (claimsByExtraction.get(e.extractionId) ?? []).some((c) =>
        UNSUPPORTED_VERDICTS.has(c.operatorVerdict ?? c.extractedVerdict),
      ),
    );
  }

  if (finding.findingType === "grounded_ungrounded_split") {
    return eligible.filter((e) => e.generationMode === "grounded" || e.generationMode === "ungrounded");
  }

  if (finding.findingType === "source_concentration" && domain) {
    return eligible.filter((e) => {
      const payload = e.extractedJson as { citations?: Array<{ domain?: string }> } | null;
      return (payload?.citations ?? []).some((c) => c.domain === domain);
    });
  }

  return [];
}

function rawExcerpt(rawText: string, max = 320): string {
  const normalized = rawText.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 3).trimEnd()}...`;
}

function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    map.set(k, [...(map.get(k) ?? []), item]);
  }
  return map;
}
