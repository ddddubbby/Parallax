/** M34A harness-side C-2 ledger. Raw collection calls do not create audit jobs. */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getProviderSpendToday } from "../../src/db/repositories/runner";
import { readDailyBudgetUsd } from "../../src/modules/runner/budget";
import { OUT_DIR, readJson, writeJson } from "./shared";

export const M34A_CALL_RESERVATION_USD = 0.1;
const LEDGER_PATH = join(OUT_DIR, "m34a-spend-ledger.json");

export interface M34ALedgerEntry {
  reservationId: string;
  runId: string;
  providerId: string;
  kind: "generation" | "span_assist";
  reservedUsd: number;
  actualUsd: number | null;
  createdAt: string;
  settledAt: string | null;
}

interface Ledger {
  ledgerVersion: "m34a-spend-ledger.v1";
  entries: M34ALedgerEntry[];
}

function todayUtc(value: string): string {
  return new Date(value).toISOString().slice(0, 10);
}

function loadLedger(): Ledger {
  if (!existsSync(LEDGER_PATH)) return { ledgerVersion: "m34a-spend-ledger.v1", entries: [] };
  const ledger = readJson<Ledger>(LEDGER_PATH);
  if (ledger.ledgerVersion !== "m34a-spend-ledger.v1" || !Array.isArray(ledger.entries)) {
    throw new Error("M34A spend ledger is malformed; stop rather than spending without C-2 accounting");
  }
  return ledger;
}

function recordedSpend(entries: readonly M34ALedgerEntry[], providerId: string, at: string): number {
  const day = todayUtc(at);
  return entries
    .filter((entry) => entry.providerId === providerId && todayUtc(entry.createdAt) === day)
    .reduce((sum, entry) => sum + (entry.actualUsd ?? entry.reservedUsd), 0);
}

function runReservedSpend(entries: readonly M34ALedgerEntry[], runId: string): number {
  return entries
    .filter((entry) => entry.runId === runId)
    .reduce((sum, entry) => sum + (entry.actualUsd ?? entry.reservedUsd), 0);
}

export async function reserveM34ASpend(input: {
  runId: string;
  providerId: string;
  kind: M34ALedgerEntry["kind"];
  responseId: string;
  runCapUsd: number;
}): Promise<string> {
  const ledger = loadLedger();
  const now = new Date().toISOString();
  const reservationId = `${input.runId}|${input.providerId}|${input.kind}|${input.responseId}`;
  if (ledger.entries.some((entry) => entry.reservationId === reservationId)) return reservationId;
  const projectedRunSpend = runReservedSpend(ledger.entries, input.runId) + M34A_CALL_RESERVATION_USD;
  if (projectedRunSpend > input.runCapUsd) {
    throw new Error(
      `M34A run cap would be exceeded: reserved $${projectedRunSpend.toFixed(4)} / $${input.runCapUsd.toFixed(2)}. ` +
        "Start a separately capped run instead of spending past the registered bound.",
    );
  }
  const providerBudget = readDailyBudgetUsd(input.providerId);
  const dbSpend = await getProviderSpendToday(input.providerId);
  const harnessSpend = recordedSpend(ledger.entries, input.providerId, now);
  if (Number.isFinite(providerBudget) && dbSpend + harnessSpend + M34A_CALL_RESERVATION_USD > providerBudget) {
    throw new Error(
      `${input.providerId} daily budget would be exceeded: audit $${dbSpend.toFixed(4)} + M34A $${harnessSpend.toFixed(4)} + ` +
        `reservation $${M34A_CALL_RESERVATION_USD.toFixed(4)} > $${providerBudget.toFixed(2)} (C-2).`,
    );
  }
  ledger.entries.push({
    reservationId,
    runId: input.runId,
    providerId: input.providerId,
    kind: input.kind,
    reservedUsd: M34A_CALL_RESERVATION_USD,
    actualUsd: null,
    createdAt: now,
    settledAt: null,
  });
  writeJson(LEDGER_PATH, ledger);
  return reservationId;
}

/** A failed call stays reserved: conservative accounting is safer than guessing it was free. */
export function settleM34ASpend(reservationId: string, actualUsd: number): void {
  const ledger = loadLedger();
  const entry = ledger.entries.find((candidate) => candidate.reservationId === reservationId);
  if (!entry) throw new Error(`M34A spend reservation is missing: ${reservationId}`);
  if (!Number.isFinite(actualUsd) || actualUsd < 0) throw new Error("M34A actual cost must be a non-negative finite number");
  entry.actualUsd = actualUsd;
  entry.settledAt = new Date().toISOString();
  writeJson(LEDGER_PATH, ledger);
}

/** Used on resume to preserve an interrupted paid call as an explicit denominator outcome. */
export function listM34ARunLedgerEntries(runId: string): M34ALedgerEntry[] {
  return loadLedger().entries.filter((entry) => entry.runId === runId);
}
