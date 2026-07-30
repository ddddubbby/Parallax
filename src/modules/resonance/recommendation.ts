import { parseRecommendationExtraction } from "@/core/recommendation";
import {
  commitValidExtraction,
  createPendingExtraction,
  getProjectBrandsForRun,
  getResponse,
  markExtractionDeadLettered,
  requeueExtraction,
} from "@/db/repositories/extraction";
import { appendRunEvent, getRun } from "@/db/repositories/runner";

const RECOMMENDATION_EXTRACTION_MODEL = "deterministic-recommendation-v1";

async function runRecommendationParsing(responseId: string, extractionId: string) {
  const response = await getResponse(responseId);
  if (!response) throw new Error(`response ${responseId} not found`);
  const run = await getRun(response.runId);
  if (!run) throw new Error(`run ${response.runId} not found`);
  const projectBrands = await getProjectBrandsForRun(run.projectId);
  const client = projectBrands.find((brand) => brand.role === "client");
  if (!client) throw new Error("AI recommendation test requires a client brand");
  try {
    const extracted = parseRecommendationExtraction({
      rawText: response.rawText,
      trackedBrands: projectBrands.map((brand) => ({
        id: brand.id,
        name: brand.name,
        aliases: Array.isArray(brand.aliasesJson) ? (brand.aliasesJson as string[]) : [],
      })),
      clientBrandId: client.id,
    });
    await commitValidExtraction(
      extractionId,
      extracted,
      RECOMMENDATION_EXTRACTION_MODEL,
      [],
      [],
    );
    return { outcome: "valid" as const, attempts: 1 };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markExtractionDeadLettered(extractionId, message);
    await appendRunEvent({
      runId: response.runId,
      level: "warn",
      eventType: "recommendation_output_invalid",
      message: `Recommendation output was stored but excluded from lift metrics: ${message}`,
    });
    return { outcome: "dead_lettered" as const, attempts: 1 };
  }
}

export async function parseRecommendationResponse(responseId: string) {
  const extractionId = await createPendingExtraction(responseId, 1);
  return runRecommendationParsing(responseId, extractionId);
}

export async function reparseRecommendationResponse(responseId: string) {
  const extractionId = await requeueExtraction(responseId, ["dead_lettered"]);
  return runRecommendationParsing(responseId, extractionId);
}
