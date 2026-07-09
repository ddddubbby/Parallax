import type { RunMode } from "./runner";

/** M32 / D-088: dynamic configure-run submit labels. */
export function startRunLabel(mode: RunMode): string {
  if (mode === "mock") return "Start mock run";
  if (mode === "live_validation") return "Start live validation";
  return "Start live audit";
}
