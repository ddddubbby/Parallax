import { checkCostCap } from "@/core/runner";
import { getProviderSpendToday } from "@/db/repositories/runner";

// The paid-engine id helpers live in a leaf module (provider-ids) so the
// repository layer can share them without an import cycle; re-exported here so
// existing `@/modules/runner/budget` importers are unaffected.
export {
  extractionProviderId,
  embeddingProviderId,
  secondaryProviderIdForKind,
} from "./provider-ids";

// C-2/D-012: global PROVIDER_DAILY_BUDGET_USD default, optional
// <PROVIDER>_DAILY_BUDGET_USD override — env-configured, not DB-editable
// (Settings surfaces the effective value read-only).
//
// A set-but-unparseable value (e.g. "25USD") fails CLOSED: budget 0, every
// run pauses immediately, and the misconfiguration is loud. NaN passing
// through would silently disable enforcement — the one failure direction a
// cost guard must never have. Only a genuinely unset budget means "no
// budget configured" (Infinity).
export function readDailyBudgetUsd(providerId: string): number {
  const raw =
    process.env[`${providerId.toUpperCase()}_DAILY_BUDGET_USD`] ||
    process.env.PROVIDER_DAILY_BUDGET_USD;
  if (!raw) return Infinity;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    console.warn(
      `[budget] unparseable daily budget "${raw}" for ${providerId} — failing closed (treating as $0)`,
    );
    return 0;
  }
  return parsed;
}

export interface BudgetTrip {
  providerId: string;
  spentUsd: number;
  budgetUsd: number;
}

/**
 * Mock never spends real money and has no budget to enforce.
 *
 * Enforcement runs after each job finishes (worker afterJobFinished), so
 * jobs already in flight when the budget trips still complete — overshoot
 * is bounded by provider concurrency (3 for DeepSeek) times one call's
 * cost, fractions of a cent at current pricing. Accepted for MVP rather
 * than paying a spend query on every claim.
 */
export async function findExceededDailyBudget(providerIds: string[]): Promise<BudgetTrip | null> {
  // Caller-driven: the worker passes the run's generation providers plus,
  // for LIVE runs, the extraction engine (D-041/C-2) — the extraction
  // engine spends real money on every live run even when it is not a
  // selected generation provider (an OpenAI run extracting via DeepSeek),
  // and getProviderSpendToday attributes all extraction cost to it. A mock
  // run passes only mock, so no live budget can ever pause it.
  for (const providerId of new Set(providerIds)) {
    if (providerId === "mock") continue;
    const budgetUsd = readDailyBudgetUsd(providerId);
    if (!Number.isFinite(budgetUsd)) continue;
    const spentUsd = await getProviderSpendToday(providerId);
    if (!checkCostCap(spentUsd, budgetUsd).ok) {
      return { providerId, spentUsd, budgetUsd };
    }
  }
  return null;
}
