import { INTENT_ORDER, type Intent } from "@/core/matrix";
import { intentToPillar, PILLAR_ORDER, type Pillar } from "@/core/semantic";

const PILLAR_RANK = new Map<Pillar, number>(
  PILLAR_ORDER.map((pillar, index) => [pillar, index]),
);
const INTENT_RANK = new Map<Intent, number>(
  INTENT_ORDER.map((intent, index) => [intent, index]),
);

export interface PromptSampleCell {
  id: string;
  intent: Intent;
  personaLabel: string;
  marketLabel: string;
  resolvedText: string;
}

/** Deterministic last-chance sample for the approve confirm (not a full-review proof). */
export function representativePromptSamples<T extends PromptSampleCell>(
  cells: T[],
  limit = 5,
): T[] {
  if (limit <= 0) return [];
  const ordered = [...cells].sort((a, b) => {
    const pillarDelta =
      (PILLAR_RANK.get(intentToPillar(a.intent)) ?? Number.MAX_SAFE_INTEGER) -
      (PILLAR_RANK.get(intentToPillar(b.intent)) ?? Number.MAX_SAFE_INTEGER);
    if (pillarDelta !== 0) return pillarDelta;
    const intentDelta =
      (INTENT_RANK.get(a.intent) ?? Number.MAX_SAFE_INTEGER) -
      (INTENT_RANK.get(b.intent) ?? Number.MAX_SAFE_INTEGER);
    if (intentDelta !== 0) return intentDelta;
    return a.id.localeCompare(b.id);
  });

  const selected: T[] = [];
  const selectedIds = new Set<string>();
  const addFirstMatching = (predicate: (cell: T) => boolean) => {
    if (selected.length >= limit) return;
    const match = ordered.find((cell) => !selectedIds.has(cell.id) && predicate(cell));
    if (!match) return;
    selected.push(match);
    selectedIds.add(match.id);
  };

  // Cover every prompt-bearing pillar before filling from canonical intents.
  for (const pillar of PILLAR_ORDER) {
    addFirstMatching((cell) => intentToPillar(cell.intent) === pillar);
  }
  for (const intent of INTENT_ORDER) {
    addFirstMatching((cell) => cell.intent === intent);
  }
  for (const cell of ordered) {
    if (selected.length >= limit) break;
    if (!selectedIds.has(cell.id)) selected.push(cell);
  }
  return selected;
}
