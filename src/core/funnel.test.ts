import { describe, expect, it } from "vitest";
import {
  FUNNEL_STAGES,
  allAuditPillarsAreMapped,
  funnelStageForPillar,
  funnelStampForPillar,
} from "./funnel";
import { PILLARS, PILLAR_ORDER } from "./semantic";

describe("funnel presentation mapping (M16)", () => {
  it("maps every audit pillar to a funnel stage or the proof trust rail", () => {
    expect(allAuditPillarsAreMapped()).toBe(true);
    expect(funnelStageForPillar("presence")).toBe("upper");
    expect(funnelStageForPillar("position")).toBe("mid");
    expect(funnelStageForPillar("perception")).toBe("mid");
    expect(funnelStageForPillar("proof")).toBeNull();
  });

  it("only references existing pillar ids", () => {
    for (const stage of Object.values(FUNNEL_STAGES)) {
      for (const pillar of stage.pillarIds) {
        expect(PILLARS[pillar], pillar).toBeDefined();
      }
    }
  });

  it("keeps lower funnel separate from audit pillars", () => {
    expect(FUNNEL_STAGES.lower.pillarIds).toEqual([]);
    expect(PILLAR_ORDER.filter((pillar) => funnelStageForPillar(pillar) === "lower")).toEqual([]);
  });

  it("renders structural stamps for audit surfaces", () => {
    expect(funnelStampForPillar("presence")).toBe("EVIDENCE LAYER");
    expect(funnelStampForPillar("position")).toBe("EVIDENCE LAYER");
    expect(funnelStampForPillar("perception")).toBe("EVIDENCE LAYER");
    expect(funnelStampForPillar("proof")).toBe("TRUST RAIL");
  });
});
