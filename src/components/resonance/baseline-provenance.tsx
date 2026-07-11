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
        <p className="mt-2 font-mono text-[11px] leading-5 text-ink/55">
          reviewed recurrence {provenance.numerator}/{provenance.denominator} responses · prompt spread {provenance.promptSpread}/{provenance.promptDenominator} · {provenance.providerId}/{provenance.modelVersion}/{provenance.generationMode} · {provenance.reviewMethod?.replaceAll("_", " ")} · codebook v{provenance.codebookVersion} · snapshot {provenance.snapshotId?.slice(0, 8)}
        </p>
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
