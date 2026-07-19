// M46/D-117: Simulation draw math and live draw-floor gate (pure helpers).
// Providers never combine toward the floor — draws are per framing/provider.

import { AUDIT_REPETITIONS, SMALL_N_THRESHOLD } from "@/core/constants";

/** Minimum personas for a live_audit Simulation at protected k=5 to meet n≥30. */
export const MIN_PERSONAS_FOR_LIVE_AUDIT_DRAW_FLOOR = Math.ceil(
  SMALL_N_THRESHOLD / AUDIT_REPETITIONS,
);

export function drawsPerVariant(personaCount: number, repetitions: number): number {
  if (!Number.isFinite(personaCount) || !Number.isFinite(repetitions)) return 0;
  if (personaCount < 0 || repetitions < 0) return 0;
  return Math.floor(personaCount) * Math.floor(repetitions);
}

export function totalSimulationCalls(input: {
  framingCount: number;
  personaCount: number;
  repetitions: number;
  providerCount: number;
}): number {
  const { framingCount, personaCount, repetitions, providerCount } = input;
  if (
    ![framingCount, personaCount, repetitions, providerCount].every(
      (n) => Number.isFinite(n) && n >= 0,
    )
  ) {
    return 0;
  }
  return (
    Math.floor(framingCount) *
    Math.floor(personaCount) *
    Math.floor(repetitions) *
    Math.floor(providerCount)
  );
}

export function drawFloorMet(draws: number, threshold = SMALL_N_THRESHOLD): boolean {
  return Number.isFinite(draws) && draws >= threshold;
}

/** True when a frozen study cannot meet the live_audit floor at k=5. */
export function isPreviewOnlyPersonaCount(personaCount: number): boolean {
  return personaCount > 0 && personaCount < MIN_PERSONAS_FOR_LIVE_AUDIT_DRAW_FLOOR;
}

export function liveAuditDrawFloorError(draws: number): string {
  return (
    `Live audit Simulation runs require at least ${SMALL_N_THRESHOLD} draws per framing and provider ` +
    `(personas × repetitions). This configuration yields ${draws}. ` +
    `With k=${AUDIT_REPETITIONS}, add personas until you have at least ` +
    `${MIN_PERSONAS_FOR_LIVE_AUDIT_DRAW_FLOOR} (never invent personas). ` +
    `Use mock or live validation for preview-only configs (D-117).`
  );
}

export function formatSimulationMath(input: {
  personaCount: number;
  framingCount: number;
  repetitions: number;
  providerCount: number;
}): {
  drawsPerVariant: number;
  totalCalls: number;
  drawFloorMet: boolean;
  drawsLine: string;
  totalLine: string;
} {
  const draws = drawsPerVariant(input.personaCount, input.repetitions);
  const total = totalSimulationCalls(input);
  return {
    drawsPerVariant: draws,
    totalCalls: total,
    drawFloorMet: drawFloorMet(draws),
    drawsLine: `${input.personaCount} personas × ${input.repetitions} repetitions = ${draws} draws per framing/provider`,
    totalLine: `${input.framingCount} framings × ${input.personaCount} personas × ${input.repetitions} repetitions × ${input.providerCount} providers = ${total} total calls`,
  };
}
