import type { FramingReportModel } from "@/core/framing-report";
import {
  computeFramingRecurrence,
  getFramingStudy,
} from "@/db/repositories/framing";
import { getProjectSummary } from "@/db/repositories/runner";

function reviewDisclosure(method: string) {
  if (method === "inter_rater_reliability") {
    return "A defined subset received second-human coding; the engagement records inter-rater reliability separately from other checks.";
  }
  if (method === "intra_rater_consistency") {
    return "The same analyst re-coded a defined blinded subset; this is intra-rater consistency, not independent-human agreement.";
  }
  if (method === "machine_discrepancy_check") {
    return "A machine discrepancy check was used for comparison; it is not an independent coder or inter-rater reliability result.";
  }
  return "One analyst completed full-sample coding; no intra-rater, machine-discrepancy, or second-human reliability result is claimed.";
}

export async function buildFramingReport(
  projectId: string,
  studyId: string,
): Promise<FramingReportModel | null> {
  const [project, detail] = await Promise.all([
    getProjectSummary(projectId),
    getFramingStudy(projectId, studyId),
  ]);
  if (!project || !detail || detail.study.state !== "completed") return null;
  const recurrence = await computeFramingRecurrence(projectId, studyId);
  const associations = new Map(
    detail.codebook.map((association) => [association.associationId, association.label]),
  );
  const facts = (Array.isArray(detail.study.factSheetSnapshotJson)
    ? detail.study.factSheetSnapshotJson
    : [])
    .map((fact) => fact as { id?: unknown; statement?: unknown })
    .filter((fact): fact is { id: string; statement: string } =>
      typeof fact.id === "string" && typeof fact.statement === "string",
    );
  const factById = new Map(facts.map((fact) => [fact.id, fact.statement]));
  const positioningText = detail.study.positioningText ?? "";
  const positioningSource = /^CLIENT-SUPPLIED POSITIONING\b/i.test(positioningText)
    ? "client-supplied" as const
    : "official-public" as const;
  const promptWording = [...new Map(
    detail.reviews.map((review) => [review.variantKey, review.promptText]),
  )].map(([variantKey, text]) => ({ variantKey, text }))
    .sort((a, b) => a.variantKey.localeCompare(b.variantKey));
  const evidence = detail.reviews.flatMap((review) =>
    review.annotations
      .filter(
        (annotation) =>
          annotation.decision === "accepted" &&
          review.rawText !== null &&
          annotation.startOffset !== null &&
          annotation.endOffset !== null,
      )
      .map((annotation) => ({
        associationLabel: associations.get(annotation.associationId) ?? annotation.associationId,
        quote: review.rawText!.slice(annotation.startOffset!, annotation.endOffset!),
        variantKey: review.variantKey,
        providerId: review.providerId,
        modelVersion: review.modelVersion ?? "generation_unavailable",
        generationMode: review.generationMode,
      })),
  );
  const reviewMethod = detail.study.reviewMethod ?? "single_analyst";
  return {
    reportVersion: "m34a-framing-report.v1",
    projectName: project.name,
    studyId,
    completedDate: (detail.study.completedAt ?? detail.study.updatedAt).toISOString().slice(0, 10),
    promptProtocolVersion: detail.study.promptProtocolVersion,
    promptWording,
    positioningText,
    positioningSource,
    reviewerIdentity: detail.study.reviewerIdentity ?? "Not recorded",
    reviewMethod,
    reviewDisclosure: reviewDisclosure(reviewMethod),
    denominator: detail.reviews.length,
    availableResponses: detail.reviews.filter((review) => review.responseId !== null).length,
    unavailableJobs: detail.reviews.filter((review) => review.responseId === null).length,
    recurrence,
    gaps: detail.gaps.map((gap) => {
      const factReferences = (gap.factReferencesJson as string[]) ?? [];
      return {
        classification: gap.classification,
        subject: gap.classification === "missing"
          ? gap.missingTarget ?? "Missing target"
          : associations.get(gap.associationId ?? "") ?? gap.associationId ?? "Observed association",
        rationale: gap.rationale,
        factStatements: factReferences
          .map((id) => factById.get(id))
          .filter((statement): statement is string => Boolean(statement)),
      };
    }),
    evidence,
    factSheetScope: `${facts.length} active fact-sheet row${facts.length === 1 ? "" : "s"} snapshotted at positioning reveal.`,
  };
}
