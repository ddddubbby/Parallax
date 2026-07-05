import { PILLAR_ORDER, type Pillar } from "./semantic";

export type FunnelStage = "upper" | "mid" | "lower";

export const FUNNEL_STAGES: Record<
  FunnelStage,
  { label: string; question: string; pillarIds: Pillar[] }
> = {
  upper: {
    label: "Upper Funnel - Awareness & Reach",
    question: "Does AI put us in front of buyers?",
    pillarIds: ["presence"],
  },
  mid: {
    label: "Mid Funnel - Consideration & Education",
    question: "When buyers evaluate, does AI make our case?",
    pillarIds: ["position", "perception"],
  },
  lower: {
    label: "Lower Funnel - Simulated Action (SIM)",
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
  return stage === "upper" ? "UPPER FUNNEL" : stage === "mid" ? "MID FUNNEL" : "LOWER FUNNEL";
}

export function allAuditPillarsAreMapped(): boolean {
  return PILLAR_ORDER.every((pillar) => pillar === "proof" || funnelStageForPillar(pillar) !== null);
}
