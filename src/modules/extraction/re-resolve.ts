import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { auditRuns, brandMentions, brands, claimsFound, extractions, responses } from "@/db/schema";
import {
  collapseDuplicateBrandMentions,
  resolveBrandId,
  type ExtractedBrand,
} from "@/core/extraction";
import { recomputeMetrics } from "@/db/repositories/metrics";

// M45 / D-115: re-resolution as a first-class $0 operation. When brand terms
// change (an alias added, or the matcher itself improves), stored runs can be
// brought current without re-extraction: resolution is OUR deterministic code
// (SM-4), so it re-runs over the stored extraction payloads for free.
//
// C-3 discipline: never edit an extraction in place. A changed resolution
// creates a NEW extraction version carrying the re-resolved payload, fresh
// derived brand_mentions, and a COPY of the claims rows — including operator
// review state (SM-5: operator verdicts live beside extracted values and must
// survive re-derivation). Unchanged resolutions create nothing, so the
// operation is idempotent. Metrics recompute at the end (C-5).

export interface ReResolveSummary {
  examined: number;
  reResolved: number;
  clientMentionsBefore: number;
  clientMentionsAfter: number;
}

export async function reResolveRunBrands(projectId: string, runId: string): Promise<ReResolveSummary> {
  const [run] = await db
    .select({ id: auditRuns.id })
    .from(auditRuns)
    .where(and(eq(auditRuns.id, runId), eq(auditRuns.projectId, projectId)));
  if (!run) throw new Error("Run not found in this project");

  const tracked = (await db.select().from(brands).where(eq(brands.projectId, projectId))).map((b) => ({
    id: b.id,
    name: b.name,
    aliases: Array.isArray(b.aliasesJson) ? (b.aliasesJson as string[]) : [],
  }));
  const clientId = (await db
    .select({ id: brands.id })
    .from(brands)
    .where(and(eq(brands.projectId, projectId), eq(brands.role, "client"))))[0]?.id;

  const responseRows = await db
    .select({ id: responses.id })
    .from(responses)
    .where(eq(responses.runId, runId));
  if (responseRows.length === 0) {
    return { examined: 0, reResolved: 0, clientMentionsBefore: 0, clientMentionsAfter: 0 };
  }
  const allExtractions = await db
    .select()
    .from(extractions)
    .where(inArray(extractions.responseId, responseRows.map((r) => r.id)));

  // Latest valid extraction per response — the rows metrics read.
  const latestValid = new Map<string, (typeof allExtractions)[number]>();
  for (const ext of allExtractions) {
    if (ext.state !== "valid") continue;
    const current = latestValid.get(ext.responseId);
    if (!current || ext.extractionVersion > current.extractionVersion) {
      latestValid.set(ext.responseId, ext);
    }
  }
  // Highest version per response regardless of state (version allocation).
  const maxVersion = new Map<string, number>();
  for (const ext of allExtractions) {
    maxVersion.set(ext.responseId, Math.max(maxVersion.get(ext.responseId) ?? 0, ext.extractionVersion));
  }

  const summary: ReResolveSummary = {
    examined: 0,
    reResolved: 0,
    clientMentionsBefore: 0,
    clientMentionsAfter: 0,
  };

  for (const ext of latestValid.values()) {
    summary.examined++;
    const payload = ext.extractedJson as { brands?: ExtractedBrand[] } | null;
    if (!payload?.brands) continue;

    const reResolved = payload.brands.map((b) => ({
      ...b,
      canonical_brand_id: resolveBrandId(b.observed_name, tracked),
    }));
    const collapsed = collapseDuplicateBrandMentions(reResolved);

    const before = payload.brands.filter((b) => b.mentioned && b.canonical_brand_id === clientId).length;
    const after = collapsed.filter((b) => b.mentioned && b.canonical_brand_id === clientId).length;
    summary.clientMentionsBefore += before > 0 ? 1 : 0;
    summary.clientMentionsAfter += after > 0 ? 1 : 0;

    const unchanged =
      payload.brands.length === collapsed.length &&
      payload.brands.every((b, i) => b.canonical_brand_id === collapsed[i]?.canonical_brand_id);
    if (unchanged) continue;
    summary.reResolved++;

    const nextVersion = (maxVersion.get(ext.responseId) ?? ext.extractionVersion) + 1;
    maxVersion.set(ext.responseId, nextVersion);
    const claims = await db.select().from(claimsFound).where(eq(claimsFound.extractionId, ext.id));

    await db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(extractions)
        .values({
          responseId: ext.responseId,
          extractionVersion: nextVersion,
          state: "valid",
          schemaVersion: ext.schemaVersion,
          extractionModel: ext.extractionModel,
          extractedJson: { ...payload, brands: collapsed },
          costUsd: "0",
          tokensIn: 0,
          tokensOut: 0,
          qaNotes: "re-resolved (D-115) — no LLM call; brand resolution re-run over the stored payload",
        })
        .returning({ id: extractions.id });

      const mentionValues = collapsed
        .filter((b) => b.mentioned)
        .map((b) => ({
          extractionId: inserted.id,
          brandId: b.canonical_brand_id,
          observedName: b.observed_name,
          position: b.position,
          recommended: b.recommended,
          recommendationStrength: b.recommendation_strength,
          sentiment: b.sentiment,
          attributesJson: b.attributes,
          evidenceQuote: b.evidence_quote,
        }));
      if (mentionValues.length > 0) await tx.insert(brandMentions).values(mentionValues);

      // SM-5: operator review state survives re-derivation.
      if (claims.length > 0) {
        await tx.insert(claimsFound).values(
          claims.map((c) => ({
            extractionId: inserted.id,
            brandId: c.brandId,
            factClaimId: c.factClaimId,
            claimText: c.claimText,
            claimType: c.claimType,
            extractedVerdict: c.extractedVerdict,
            extractedSeverity: c.extractedSeverity,
            operatorVerdict: c.operatorVerdict,
            operatorSeverity: c.operatorSeverity,
            reviewState: c.reviewState,
            reviewedAt: c.reviewedAt,
            evidenceQuote: c.evidenceQuote,
          })),
        );
      }
    });
  }

  if (summary.reResolved > 0) await recomputeMetrics(runId);
  return summary;
}
