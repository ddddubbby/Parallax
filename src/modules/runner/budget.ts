import { checkCostCap } from "@/core/runner";
import { getProviderSpendToday } from "@/db/repositories/runner";

// C-2/D-012: global PROVIDER_DAILY_BUDGET_USD default, optional
// <PROVIDER>_DAILY_BUDGET_USD override — env-configured, not DB-editable
// (Settings surfaces the effective value read-only).
export function readDailyBudgetUsd(providerId: string): number {
  const override = process.env[`${providerId.toUpperCase()}_DAILY_BUDGET_USD`];
  if (override) return Number(override);
  const global = process.env.PROVIDER_DAILY_BUDGET_USD;
  return global ? Number(global) : Infinity;
}

export interface BudgetTrip {
  providerId: string;
  spentUsd: number;
  budgetUsd: number;
}

/** Mock never spends real money and has no budget to enforce. */
export async function findExceededDailyBudget(providerIds: string[]): Promise<BudgetTrip | null> {
  for (const providerId of providerIds) {
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
