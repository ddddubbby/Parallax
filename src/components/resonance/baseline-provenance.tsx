import { Stamp } from "@/components/ui";
import type { ResonanceBaselineProvenance } from "@/core/resonance";

export function BaselineProvenance({ provenance }: { provenance: ResonanceBaselineProvenance }) {
  return (
    <section className="rounded-lg border border-ink/15 bg-paper-2/25 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="label-mono text-xs text-ink/55">Baseline provenance</span>
        <Stamp tone={provenance.status === "snapshot" ? "ok" : "warn"}>{provenance.label}</Stamp>
      </div>
      {provenance.status === "snapshot" ? (
        <div className="mt-2 space-y-1 font-mono text-[11px] leading-5 text-ink/55">
          <p>
            Selected association{provenance.associationLabel ? ` “${provenance.associationLabel}”` : ""} observed in {provenance.numerator}/{provenance.denominator} sampled source jobs
            {provenance.availableResponses !== null && provenance.availableResponses !== undefined ? ` · ${provenance.availableResponses} stored responses / ${provenance.unavailableJobs ?? 0} unavailable` : ""} · prompt spread {provenance.promptSpread}/{provenance.promptDenominator}.
          </p>
          <p>The baseline is one verbatim response containing that association; the full response is not claimed to be representative.</p>
          {provenance.scopes && provenance.scopes.length > 0 && <p>{provenance.scopes.map((scope) => `${scope.providerId}/${scope.modelVersion}/${scope.generationMode}: ${scope.numerator}/${scope.denominator}`).join(" · ")}</p>}
          <p>{provenance.gapClassification ? `gap ${provenance.gapClassification} · ${provenance.gapSubject} · ` : ""}{provenance.reviewMethod?.replaceAll("_", " ")} · codebook v{provenance.codebookVersion} · {provenance.promptProtocolVersion ?? "protocol unknown"} · observed {provenance.observedAt?.slice(0, 10) ?? "date unknown"}</p>
          <p>snapshot {provenance.snapshotId} · {provenance.snapshotVersion ?? "version unknown"} · sha256 {provenance.snapshotSha256 ?? "not available"}</p>
        </div>
      ) : (
        <p className="mt-2 font-mono text-[11px] leading-5 text-ink/55">
          {provenance.status === "b2b_evidence_id"
            ? "B2B remains on the stored audit-response evidence path; consumer framing snapshots do not apply."
            : "This study predates the immutable M34A framing-evidence handoff. No reviewed recurrence claim is attached."}
        </p>
      )}
    </section>
  );
}
