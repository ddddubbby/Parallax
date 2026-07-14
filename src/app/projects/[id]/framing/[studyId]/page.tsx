import Link from "next/link";
import { notFound } from "next/navigation";
import { FramingWorkspace } from "@/components/framing/framing-workspace";
import { Stamp } from "@/components/ui";
import { isUuid } from "@/core/id";
import {
  computeFramingRecurrence,
  getBlindDiscoveryPacket,
  getFramingStudy,
  listFramingEvidenceSnapshots,
} from "@/db/repositories/framing";
import { getProjectSummary, getRun } from "@/db/repositories/runner";

export const dynamic = "force-dynamic";

function elapsedLabel(start: Date | null, end: Date | null) {
  if (!start) return "not started";
  const milliseconds = Math.max(0, (end ?? new Date()).getTime() - start.getTime());
  const minutes = Math.floor(milliseconds / 60_000);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export default async function FramingStudyPage({
  params,
}: {
  params: Promise<{ id: string; studyId: string }>;
}) {
  const { id, studyId } = await params;
  if (!isUuid(id) || !isUuid(studyId)) notFound();
  const [project, detail, projectSnapshots] = await Promise.all([
    getProjectSummary(id),
    getFramingStudy(id, studyId),
    listFramingEvidenceSnapshots(id),
  ]);
  if (!project || !detail) notFound();
  const sourceRun = await getRun(detail.study.sourceRunId);
  if (!sourceRun || sourceRun.projectId !== id) notFound();
  const blindPacket = detail.study.state === "draft"
    ? await getBlindDiscoveryPacket(id, studyId)
    : null;
  const recurrence = detail.reviews.some((review) => review.outcome === "pending")
    ? []
    : await computeFramingRecurrence(id, studyId);
  const facts = (Array.isArray(detail.study.factSheetSnapshotJson)
    ? detail.study.factSheetSnapshotJson
    : [])
    .map((fact) => fact as { id?: unknown; statement?: unknown })
    .filter((fact): fact is { id: string; statement: string } =>
      typeof fact.id === "string" && typeof fact.statement === "string",
    );
  const reviewedCount = detail.reviews.filter((review) => review.outcome !== "pending").length;

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-1 font-mono text-xs text-ink/65">
        <Link href="/projects" className="hover:text-ink">Projects</Link>
        {" / "}
        <Link href={`/projects/${id}`} className="hover:text-ink">{project.name}</Link>
        {" / "}
        <Link href={`/projects/${id}/framing`} className="hover:text-ink">Framing evidence</Link>
        {" / Review"}
      </div>
      <div className="mb-2 mt-4 flex flex-wrap items-center gap-3">
        <h1 className="label-mono text-lg font-semibold">Framing review {studyId.slice(0, 8).toUpperCase()}</h1>
        <Stamp tone={detail.study.state === "completed" ? "ok" : "ink"}>{detail.study.state}</Stamp>
        <Stamp tone="ink">{detail.study.promptProtocolVersion}</Stamp>
        {detail.study.state === "completed" && detail.study.gapOutcome && (
          <Link href={`/projects/${id}/framing/${studyId}/report`} className="interactive-press label-mono ml-auto inline-flex min-h-11 items-center rounded-full bg-accent px-4 py-2 text-xs text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            Open client report →
          </Link>
        )}
      </div>
      <p className="mb-6 max-w-3xl text-sm leading-6 text-ink/65">
        Human-reviewed framing evidence from {detail.reviews.length} source jobs. The denominator
        includes unavailable and abstained rows; recurrence is descriptive n/N with no confidence
        interval, eligibility threshold, or independence claim.
      </p>

      {recurrence.length > 0 && (
        <section className="mb-6 rounded-xl border border-ink/15 p-4">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="label-mono text-sm font-semibold">Descriptive recurrence</h2>
            <Stamp tone="ink">HUMAN REVIEWED</Stamp>
          </div>
          <div className="overflow-x-auto" role="region" aria-label="Descriptive recurrence table" tabIndex={0}>
            <table className="w-full border-collapse text-left font-mono text-xs">
              <thead><tr className="border-b border-ink/15 text-ink/65"><th className="px-2 py-2">Association</th><th className="px-2 py-2">Source jobs</th><th className="px-2 py-2">Prompt spread</th><th className="px-2 py-2">Scope</th></tr></thead>
              <tbody>{recurrence.map((row) => <tr key={row.associationId} className="border-b border-ink/10"><td className="px-2 py-3 text-ink/80">{row.associationLabel}</td><td className="px-2 py-3">{row.responsesContainingAssociation}/{row.denominator}</td><td className="px-2 py-3">{row.promptVariantsContainingAssociation.length}/{row.promptVariantDenominator} prompts</td><td className="px-2 py-3 text-ink/65">{row.scopes.map((scope) => `${scope.providerId}/${scope.modelVersion}/${scope.generationMode}`).join(" · ")}</td></tr>)}</tbody>
            </table>
          </div>
        </section>
      )}

      <FramingWorkspace
        projectId={id}
        studyId={studyId}
        state={detail.study.state}
        codebook={detail.codebook}
        blindPacket={blindPacket ? { instructions: blindPacket.instructions, items: blindPacket.items } : null}
        reviews={detail.reviews.map((review) => ({
          id: review.id,
          responseId: review.responseId,
          outcome: review.outcome,
          reviewedBy: review.reviewedBy,
          note: review.note,
          variantKey: review.variantKey,
          promptText: review.promptText,
          providerId: review.providerId,
          generationMode: review.generationMode,
          repIndex: review.repIndex,
          rawText: review.rawText,
          modelVersion: review.modelVersion,
          annotations: review.annotations.map((annotation) => ({
            id: annotation.id,
            associationId: annotation.associationId,
            decision: annotation.decision,
            proposalSource: annotation.proposalSource,
            quote:
              review.rawText !== null && annotation.startOffset !== null && annotation.endOffset !== null
                ? review.rawText.slice(annotation.startOffset, annotation.endOffset)
                : null,
            note: annotation.note,
          })),
        }))}
        gaps={detail.gaps.map((gap) => ({
          id: gap.id,
          classification: gap.classification,
          associationId: gap.associationId,
          missingTarget: gap.missingTarget,
          rationale: gap.rationale,
          factReferences: (gap.factReferencesJson as string[]) ?? [],
        }))}
        gapOutcome={detail.study.gapOutcome}
        sourceRunMode={sourceRun.runMode}
        facts={facts}
        reviewerIdentity={detail.study.reviewerIdentity}
        reviewMethod={detail.study.reviewMethod}
        reviewedCount={reviewedCount}
        denominator={detail.reviews.length}
        elapsedLabel={elapsedLabel(detail.study.reviewStartedAt, detail.study.completedAt)}
        snapshots={projectSnapshots
          .filter((snapshot) => snapshot.payload.studyId === studyId)
          .map((snapshot) => ({
            id: snapshot.id,
            annotationId: snapshot.payload.annotationId,
            gapClassificationId: snapshot.payload.snapshotVersion === "m34a-simulation-evidence.v2"
              ? snapshot.payload.gap.id
              : null,
            label: snapshot.payload.recurrence.label,
          }))}
      />
    </main>
  );
}
