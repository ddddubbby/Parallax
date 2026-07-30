import { Stamp } from "@/components/ui";
import type { ResonanceBaselineProvenance } from "@/core/resonance";

export function BaselineProvenance({ provenance }: { provenance: ResonanceBaselineProvenance }) {
  return (
    <section className="rounded-lg border border-ink/15 bg-paper-2/25 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="label-mono text-xs text-ink/65">Current message source</span>
        <Stamp tone={provenance.status === "snapshot" || provenance.status === "stamp" ? "ok" : "warn"}>{provenance.label}</Stamp>
      </div>
      {provenance.status === "snapshot" ? (
        <div className="mt-2 space-y-1 font-mono text-xs leading-5 text-ink/65">
          <p>
            Selected association{provenance.associationLabel ? ` “${provenance.associationLabel}”` : ""} observed in {provenance.numerator}/{provenance.denominator} sampled source jobs
            {provenance.availableResponses !== null && provenance.availableResponses !== undefined ? ` · ${provenance.availableResponses} stored responses / ${provenance.unavailableJobs ?? 0} unavailable` : ""} · prompt spread {provenance.promptSpread}/{provenance.promptDenominator}.
          </p>
          <p>The Current message is one verbatim response containing that association; the full response is not claimed to be representative.</p>
          {provenance.scopes && provenance.scopes.length > 0 && <p>{provenance.scopes.map((scope) => `${scope.providerId}/${scope.modelVersion}/${scope.generationMode}: ${scope.numerator}/${scope.denominator}`).join(" · ")}</p>}
          <p>{provenance.gapClassification ? `gap ${provenance.gapClassification} · ${provenance.gapSubject} · ` : ""}{provenance.reviewMethod?.replaceAll("_", " ")} · codebook v{provenance.codebookVersion} · {provenance.promptProtocolVersion ?? "protocol unknown"} · observed {provenance.observedAt?.slice(0, 10) ?? "date unknown"}</p>
          <p>snapshot {provenance.snapshotId} · {provenance.snapshotVersion ?? "version unknown"} · sha256 {provenance.snapshotSha256 ?? "not available"}</p>
        </div>
      ) : provenance.status === "stamp" ? (
        <div className="mt-2 space-y-1 font-mono text-xs leading-5 text-ink/65">
          <p>
            {provenance.numerator === null || provenance.numerator <= 1
              ? "SINGLE OBSERVED INSTANCE — tested as-is, never called recurring."
              : `Theme${provenance.associationLabel ? ` “${provenance.associationLabel}”` : ""} appears in ${provenance.numerator}/${provenance.denominator} sampled responses (descriptive count, machine-grouped).`}
          </p>
          <p>The Current message is one verbatim stored response, picked by the operator; the full response is not claimed to be representative.</p>
          <p>
            {provenance.providerId}/{provenance.modelVersion}/{provenance.generationMode} · response {provenance.responseId?.slice(0, 8)} · observed {provenance.observedAt?.slice(0, 10) ?? "date unknown"}
          </p>
        </div>
      ) : (
        <p className="mt-2 text-sm leading-6 text-ink/65">
          {provenance.status === "b2b_evidence_id"
            ? "B2B remains on the stored audit-response evidence path; consumer framing snapshots do not apply."
            : "This study predates the immutable M34A framing-evidence handoff. No reviewed recurrence claim is attached."}
        </p>
      )}
    </section>
  );
}
