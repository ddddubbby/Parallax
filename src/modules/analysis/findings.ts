import {
  findGroundedUngroundedSplit,
  findLostShortlistCells,
  findLowStabilityClusters,
  findMisinformationFlag,
  findPositioningGaps,
  findSourceConcentration,
  type Finding,
} from "@/core/findings";
import { isSufficientN } from "@/core/metrics";
import { getCitedSources, getMisinformationRegister } from "@/db/repositories/dashboard";
import { getCellBrandPresence, saveFindings } from "@/db/repositories/findings";
import { listMetrics } from "@/db/repositories/metrics";
import { getRun, getRunMatrixKind } from "@/db/repositories/runner";

/** RB-1/C-5: compute every audit finding type and replace disposable rows. */
export async function computeFindings(runId: string): Promise<number> {
  const kind = await getRunMatrixKind(runId);
  if (kind?.kind === "resonance") {
    throw new Error("Audit findings cannot be computed for a resonance run (C-12)");
  }
  const [metrics, cellPresence] = await Promise.all([
    listMetrics(runId),
    getCellBrandPresence(runId),
  ]);

  const attributeRows = metrics.filter(
    (metric) =>
      metric.scopeType === "overall" && metric.metricKey.startsWith("attribute_"),
  );
  const stabilityByCell = metrics.filter(
    (metric) =>
      metric.scopeType === "cell" && metric.metricKey === "stability_index",
  );
  const groundedRow = metrics.find(
    (metric) =>
      metric.scopeType === "mode" &&
      metric.scopeKey === "grounded" &&
      metric.metricKey === "mention_rate",
  );
  const ungroundedRow = metrics.find(
    (metric) =>
      metric.scopeType === "mode" &&
      metric.scopeKey === "ungrounded" &&
      metric.metricKey === "mention_rate",
  );

  const run = await getRun(runId);
  const misinformation = run ? await getMisinformationRegister(runId) : [];
  const citedSources = run ? await getCitedSources(runId) : [];

  const computed: Finding[] = [
    ...findLostShortlistCells(cellPresence),
    ...(attributeRows.length > 0 && isSufficientN(attributeRows[0].n)
      ? findPositioningGaps(
          attributeRows.map((row) => ({
            attribute: row.metricKey.replace("attribute_", ""),
            rate: row.value,
            n: row.n,
          })),
        )
      : []),
    ...findMisinformationFlag({
      highSeverityCount: misinformation.filter(
        (item) => (item.operatorSeverity ?? item.extractedSeverity) === "high",
      ).length,
      mediumSeverityCount: misinformation.filter(
        (item) => (item.operatorSeverity ?? item.extractedSeverity) === "medium",
      ).length,
      totalCount: misinformation.length,
    }),
    ...(groundedRow &&
    ungroundedRow &&
    isSufficientN(groundedRow.n) &&
    isSufficientN(ungroundedRow.n)
      ? findGroundedUngroundedSplit([
          { mode: "grounded", rate: groundedRow.value, n: groundedRow.n },
          { mode: "ungrounded", rate: ungroundedRow.value, n: ungroundedRow.n },
        ])
      : []),
    ...findSourceConcentration(
      citedSources.map((source) => ({
        domain: source.domain,
        citationCount: source.total,
      })),
    ),
    ...findLowStabilityClusters(
      stabilityByCell.map((row) => {
        const [cellId] = row.scopeKey.split("|");
        const cell = cellPresence.find((item) => item.cellId === cellId);
        return {
          cellId,
          intent: cell?.intent ?? "unknown",
          stabilityIndex: row.value,
          n: row.n,
        };
      }),
    ),
  ];

  return saveFindings(runId, computed);
}
