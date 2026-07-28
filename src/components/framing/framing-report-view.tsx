import { Stamp } from "@/components/ui";
import type { FramingReportModel } from "@/core/framing-report";

export function FramingReportView({ report }: { report: FramingReportModel }) {
  return (
    <article className="framing-report-view mx-auto max-w-4xl bg-paper text-ink print:max-w-none">
      <header className="border-b border-ink/20 pb-8">
        <div className="label-mono mb-4 text-xs text-ink/65">
          RESONANCE / FRAMING EVIDENCE / {report.completedDate.replaceAll("-", ".")}
        </div>
        <h1 className="font-serif text-3xl leading-tight sm:text-4xl">
          {report.projectName}
          <br />
          AI framing evidence
        </h1>
        <div className="mt-5 flex flex-wrap gap-2">
          <Stamp tone="ink">HUMAN REVIEWED</Stamp>
          <Stamp tone="ink">DESCRIPTIVE N/N</Stamp>
          <Stamp tone={report.sourceRunMode === "live_audit" ? "ok" : "warn"}>
            {report.sourceRunMode === "mock"
              ? "MOCK"
              : report.sourceRunMode === "live_validation"
                ? "VALIDATION-ONLY"
                : "LIVE AUDIT"}
          </Stamp>
          <Stamp tone="ink">{report.promptProtocolVersion}</Stamp>
        </div>
      </header>

      <section className="framing-report-section mt-6 rounded-xl bg-paper-2/50 p-6">
        <h2 className="label-mono mb-4 text-sm font-semibold">01 / Decision summary</h2>
        {report.gapOutcome === "no_actionable_gap_identified" ? (
          <p className="text-base leading-7 text-ink/75">
            <strong>No actionable gap was identified.</strong> This review closes without a Simulation handoff.
          </p>
        ) : (
          <div className="grid gap-3">
            {report.gaps.map((gap, index) => (
              <div key={`${gap.classification}-${index}`} className="rounded-xl border border-ink/15 p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Stamp tone={gap.classification === "unsupported" ? "warn" : "ink"}>
                    {gap.classification.replaceAll("_", " ")}
                  </Stamp>
                  <strong className="label-mono text-sm">{gap.subject}</strong>
                </div>
                <p className="text-sm leading-6 text-ink/75">{gap.rationale}</p>
                {gap.factStatements.length > 0 && (
                  <ul className="mt-2 list-disc pl-5 text-sm leading-6 text-ink/70">
                    {gap.factStatements.map((fact) => <li key={fact}>{fact}</li>)}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="framing-report-section mt-6 rounded-xl bg-paper-2/50 p-6">
        <h2 className="label-mono mb-2 text-sm font-semibold">02 / Descriptive recurrence</h2>
        <p className="mb-4 text-sm leading-6 text-ink/70">
          Denominator: {report.denominator} sampled answer attempts / source jobs ({report.availableResponses} stored responses; {report.unavailableJobs} unavailable). Counts describe this reviewed sample only; they are not population estimates.
        </p>
        <div
          className="overflow-x-auto"
          role="region"
          aria-label="Framing report recurrence table"
          tabIndex={0}
        >
          <table className="w-full border-collapse text-left font-mono text-xs">
            <thead>
              <tr className="border-b border-ink/20 text-ink/65">
                <th className="py-2 pr-3">Association</th>
                <th className="px-3 py-2">Source jobs</th>
                <th className="px-3 py-2">Prompt spread</th>
                <th className="px-3 py-2">Model / mode scopes</th>
              </tr>
            </thead>
            <tbody>
              {report.recurrence.map((row) => (
                <tr key={row.associationId} className="border-b border-ink/10">
                  <td className="py-3 pr-3 text-ink/80">{row.associationLabel}</td>
                  <td className="px-3 py-3">{row.responsesContainingAssociation}/{row.denominator}</td>
                  <td className="px-3 py-3">{row.promptVariantsContainingAssociation.length}/{row.promptVariantDenominator}</td>
                  <td className="px-3 py-3 text-ink/65">
                    {row.scopes.map((scope) => `${scope.providerId}/${scope.modelVersion}/${scope.generationMode}: ${scope.responsesContainingAssociation}/${scope.denominator}`).join(" · ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="framing-report-section mt-6 rounded-xl bg-paper-2/50 p-6">
        <h2 className="label-mono mb-4 text-sm font-semibold">03 / Positioning used for comparison</h2>
        <p className="mb-2 font-mono text-xs text-ink/65">SOURCE · {report.positioningSource.toUpperCase()}</p>
        <p className="whitespace-pre-wrap break-words text-base leading-7 text-ink/80">{report.positioningText}</p>
      </section>

      <section className="framing-report-section mt-6 rounded-xl bg-paper-2/50 p-6">
        <h2 className="label-mono mb-4 text-sm font-semibold">04 / Evidence excerpts</h2>
        <div className="grid gap-3">
          {report.evidence.slice(0, 16).map((item, index) => (
            <blockquote key={`${item.variantKey}-${index}`} className="break-inside-avoid">
              <p className="text-sm leading-6 text-ink/80">“{item.quote}”</p>
              <footer className="mt-1 font-mono text-xs text-ink/65">
                {item.associationLabel} · {item.variantKey} · {item.providerId}/{item.modelVersion}/{item.generationMode}
              </footer>
            </blockquote>
          ))}
        </div>
        {report.evidence.length > 16 && (
          <p className="mt-3 text-sm text-ink/65">
            {report.evidence.length - 16} additional accepted spans are preserved in the JSON evidence export.
          </p>
        )}
      </section>

      <section className="framing-report-section mt-6 rounded-xl bg-paper-2/50 p-6">
        <h2 className="label-mono mb-4 text-sm font-semibold">05 / Method</h2>
        <div className="space-y-3 text-sm leading-6 text-ink/75">
          <p><strong>Review:</strong> {report.reviewerIdentity}; {report.reviewMethod.replaceAll("_", " ")}. {report.reviewDisclosure}</p>
          <p><strong>Discovery:</strong> metadata-masked manifest {report.discoveryManifestDigest}. {report.discoveryAttestation} The workflow cannot prove the analyst lacked prior knowledge from outside the product.</p>
          <p><strong>Review outcomes:</strong> {Object.entries(report.reviewOutcomeCounts).map(([key, value]) => `${key.replaceAll("_", " ")} ${value}`).join(" · ")}</p>
          <p><strong>Fact-sheet scope:</strong> {report.factSheetScope}</p>
          <p>The codebook was developed from metadata-masked raw text and locked before positioning and the fact sheet were revealed. Accepted associations link to literal source spans. Recurrence is descriptive and no automated inferential certification rule is applied.</p>
        </div>
        <h3 className="label-mono mb-2 mt-6 text-xs font-semibold">Fixed prompts, verbatim</h3>
        <ol className="grid gap-2">
          {report.promptWording.map((prompt) => (
            <li key={prompt.variantKey} className="break-inside-avoid rounded-lg bg-paper px-3 py-2 text-sm leading-6">
              <strong className="font-mono text-xs">{prompt.variantKey}</strong> · {prompt.text}
            </li>
          ))}
        </ol>
      </section>

      <section className="framing-report-section mt-6 rounded-xl bg-paper-2/50 p-6">
        <h2 className="label-mono mb-3 text-sm font-semibold">06 / Recommended next step</h2>
        <p className="text-base leading-7 text-ink/80">
          {report.gapOutcome === "actionable_gap_identified"
            ? "Treat the actionable gap as a candidate correction. Pre-screen comparative message variants if useful, then validate the selected fix with real buyers or in-market evidence before deployment."
            : "No Simulation handoff is recommended from this review. Re-audit after a material channel or positioning change."}
        </p>
      </section>
    </article>
  );
}
