import { Stamp } from "@/components/ui";
import type { RunMode } from "@/core/runner";

/**
 * Mode → reserved stamp label. Completeness stamps (PARTIAL) stay separate —
 * they are not run modes.
 */
export function RunModeStamp({ runMode }: { runMode: RunMode | string | null | undefined }) {
  if (!runMode) return null;
  if (runMode === "mock") return <Stamp tone="accent">MOCK</Stamp>;
  if (runMode === "live_validation") return <Stamp tone="warn">VALIDATION-ONLY</Stamp>;
  return null;
}
