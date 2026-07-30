import { z } from "zod";
import { resolveBrandId, type TrackedBrand } from "./extraction";

const recommendationItemSchema = z.object({
  rank: z.number().int().min(1).max(5),
  brand: z.string().min(1),
  product: z.string().nullable(),
  reason: z.string().min(1),
});

const recommendationPayloadSchema = z.object({
  recommendations: z.array(recommendationItemSchema).length(5),
});

export type RecommendationExtractionV1 = {
  kind: "recommendation";
  schemaVersion: "recommendation-v1";
  recommendations: Array<z.infer<typeof recommendationItemSchema>>;
  targetIncluded: boolean;
  targetRank: number | null;
  targetTopPick: boolean;
};

function jsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1] ?? trimmed;
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Recommendation output does not contain a JSON object");
  return JSON.parse(fenced.slice(start, end + 1));
}

export function parseRecommendationExtraction(input: {
  rawText: string;
  trackedBrands: TrackedBrand[];
  clientBrandId: string;
}): RecommendationExtractionV1 {
  const parsed = recommendationPayloadSchema.parse(jsonObject(input.rawText));
  const ranks = parsed.recommendations.map((row) => row.rank).sort((a, b) => a - b);
  if (ranks.some((rank, index) => rank !== index + 1)) {
    throw new Error("Recommendation ranks must be unique and cover 1 through 5");
  }
  const distinctBrands = parsed.recommendations.map((row) =>
    row.brand.trim().toLocaleLowerCase().replaceAll(/\s+/g, " "),
  );
  if (new Set(distinctBrands).size !== distinctBrands.length) {
    throw new Error("Recommendation list must contain five distinct brands");
  }
  const canonical = parsed.recommendations.map((row) => ({
    row,
    brandId: resolveBrandId(row.brand, input.trackedBrands),
  }));
  const resolvedIds = canonical.map((row) => row.brandId).filter((id): id is string => id !== null);
  if (new Set(resolvedIds).size !== resolvedIds.length) {
    throw new Error("Recommendation list contains duplicate tracked brands");
  }
  const target = canonical.find((row) => row.brandId === input.clientBrandId)?.row ?? null;
  return {
    kind: "recommendation",
    schemaVersion: "recommendation-v1",
    recommendations: parsed.recommendations,
    targetIncluded: target !== null,
    targetRank: target?.rank ?? null,
    targetTopPick: target?.rank === 1,
  };
}
