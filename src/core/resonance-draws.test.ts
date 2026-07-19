import { describe, expect, it } from "vitest";
import { AUDIT_REPETITIONS, SMALL_N_THRESHOLD } from "./constants";
import {
  drawFloorMet,
  drawsPerVariant,
  formatSimulationMath,
  isPreviewOnlyPersonaCount,
  liveAuditDrawFloorError,
  MIN_PERSONAS_FOR_LIVE_AUDIT_DRAW_FLOOR,
  totalSimulationCalls,
} from "./resonance-draws";

describe("resonance draw floor (M46/D-117)", () => {
  it("computes draws per framing/provider as personas × repetitions", () => {
    expect(drawsPerVariant(6, 5)).toBe(30);
    expect(drawsPerVariant(1, 5)).toBe(5);
    expect(drawsPerVariant(2, 5)).toBe(10);
  });

  it("computes total calls without pooling providers toward the floor", () => {
    // Two providers double total calls but draws-per-variant stays personas×k.
    expect(
      totalSimulationCalls({ framingCount: 2, personaCount: 1, repetitions: 5, providerCount: 2 }),
    ).toBe(20);
    expect(drawsPerVariant(1, 5)).toBe(5);
    expect(drawFloorMet(5)).toBe(false);
  });

  it("treats n≥30 as the draw floor and requires ≥6 personas at k=5", () => {
    expect(SMALL_N_THRESHOLD).toBe(30);
    expect(AUDIT_REPETITIONS).toBe(5);
    expect(MIN_PERSONAS_FOR_LIVE_AUDIT_DRAW_FLOOR).toBe(6);
    expect(drawFloorMet(29)).toBe(false);
    expect(drawFloorMet(30)).toBe(true);
    expect(isPreviewOnlyPersonaCount(5)).toBe(true);
    expect(isPreviewOnlyPersonaCount(6)).toBe(false);
  });

  it("formats exact Simulation math lines", () => {
    const math = formatSimulationMath({
      personaCount: 6,
      framingCount: 2,
      repetitions: 5,
      providerCount: 1,
    });
    expect(math.drawsPerVariant).toBe(30);
    expect(math.totalCalls).toBe(60);
    expect(math.drawFloorMet).toBe(true);
    expect(math.drawsLine).toContain("6 personas × 5 repetitions = 30");
    expect(math.totalLine).toContain("2 framings × 6 personas × 5 repetitions × 1 providers = 60");
  });

  it("explains live_audit rejection without inventing personas", () => {
    const message = liveAuditDrawFloorError(10);
    expect(message).toMatch(/at least 30 draws/i);
    expect(message).toMatch(/at least 6/);
    expect(message).not.toMatch(/auto.?generat/i);
  });
});
