import type { FrameAspect } from "./prompt-templates";
import { RESONANCE_STUDY_TEMPLATES, type ResonanceStudyTemplateId } from "./resonance-templates";

/**
 * M23 (D-079): the Evidence-Layer -> Simulation-Layer coverage contract
 * (LAYERS_AND_EVIDENCE_ONLY_EVALUATION.md synthesis section). Each resonance
 * study pack declares the frame aspect its measured_ai baseline needs
 * (`ResonanceStudyTemplate.requiredAspect`); this pure function cross-checks
 * those needs against the aspects a draft/approved matrix's cells actually
 * produce, stamped ok/gap — never a hard block (D-058 sample-budget-panel
 * precedent: informational, computed at matrix-approval time, before any
 * run spends).
 */
export const FRAME_ASPECT_LABELS: Record<FrameAspect, string> = {
  presence: "Presence",
  positioning: "Positioning",
  perception_attributes: "Perception attributes",
  factual_claims: "Factual claims",
  pricing: "Pricing",
  promotions: "Promotions",
};

export interface PackCoverageResult {
  packId: ResonanceStudyTemplateId;
  packName: string;
  requiredAspect: FrameAspect;
  cellCount: number;
  status: "ok" | "gap";
}

export function evaluatePackCoverage(
  aspectCellCounts: Partial<Record<FrameAspect, number>>,
): PackCoverageResult[] {
  return RESONANCE_STUDY_TEMPLATES.map((pack) => {
    const cellCount = aspectCellCounts[pack.requiredAspect] ?? 0;
    return {
      packId: pack.id,
      packName: pack.name,
      requiredAspect: pack.requiredAspect,
      cellCount,
      status: cellCount > 0 ? "ok" : "gap",
    };
  });
}

/** Tally how many cells produce each frame aspect, from a per-cell aspect list. */
export function countAspects(cellsAspects: FrameAspect[][]): Partial<Record<FrameAspect, number>> {
  const counts: Partial<Record<FrameAspect, number>> = {};
  for (const aspects of cellsAspects) {
    for (const aspect of aspects) {
      counts[aspect] = (counts[aspect] ?? 0) + 1;
    }
  }
  return counts;
}
