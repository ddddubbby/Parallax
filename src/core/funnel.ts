import { PILLAR_ORDER, type Pillar } from "./semantic";

export type FunnelStage = "upper" | "mid" | "lower";

// D-077: the funnel-stage internal grouping (upper/mid/lower, pillar mapping)
// stays as-is (D-063) — only the client-facing label strings change to the
// two-layer naming (Evidence Layer / Simulation Layer). "FunnelStage" and its
// upper/mid/lower values are non-rendered internals; renaming them is out of
// scope for a copy-only milestone.
export const FUNNEL_STAGES: Record<
  FunnelStage,
  { label: string; question: string; pillarIds: Pillar[] }
> = {
  upper: {
    label: "Evidence Layer - Awareness & Reach",
    question: "Does AI put us in front of buyers?",
    pillarIds: ["presence"],
  },
  mid: {
    label: "Evidence Layer - Consideration & Education",
    question: "When buyers evaluate, does AI make our case?",
    pillarIds: ["position", "perception"],
  },
  lower: {
    label: "Simulation Layer - Simulated Action (SIM)",
    question: "What would buyers do about it?",
    pillarIds: [],
  },
};

const PILLAR_TO_STAGE = new Map<Pillar, FunnelStage>(
  Object.entries(FUNNEL_STAGES).flatMap(([stage, meta]) =>
    meta.pillarIds.map((pillar) => [pillar, stage as FunnelStage] as const),
  ),
);

export function funnelStageForPillar(pillar: Pillar): FunnelStage | null {
  return PILLAR_TO_STAGE.get(pillar) ?? null;
}

export function funnelStampForPillar(pillar: Pillar): string {
  const stage = funnelStageForPillar(pillar);
  if (stage === null) return "TRUST RAIL";
  return stage === "lower" ? "SIMULATION LAYER" : "EVIDENCE LAYER";
}

export function allAuditPillarsAreMapped(): boolean {
  return PILLAR_ORDER.every((pillar) => pillar === "proof" || funnelStageForPillar(pillar) !== null);
}
