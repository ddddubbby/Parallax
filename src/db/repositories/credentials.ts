import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { db } from "../client";
import { auditRuns, matrixVersions, providerCredentials } from "../schema";

export type ProviderIdValue = (typeof providerCredentials.$inferSelect)["providerId"];

/** ST-2: never selects encrypted_api_key — the raw/encrypted value never leaves this repo layer unnecessarily. */
export async function listCredentialSummaries() {
  return db
    .select({
      id: providerCredentials.id,
      providerId: providerCredentials.providerId,
      label: providerCredentials.label,
      apiKeyLast4: providerCredentials.apiKeyLast4,
      baseUrl: providerCredentials.baseUrl,
      defaultModel: providerCredentials.defaultModel,
      status: providerCredentials.status,
      lastVerifiedAt: providerCredentials.lastVerifiedAt,
      lastUsedAt: providerCredentials.lastUsedAt,
      updatedAt: providerCredentials.updatedAt,
    })
    .from(providerCredentials)
    .orderBy(desc(providerCredentials.updatedAt));
}

/** The only place the encrypted value is read — for a live provider call, server-side only (C-11). */
export async function getActiveCredential(providerId: ProviderIdValue) {
  const [row] = await db
    .select()
    .from(providerCredentials)
    .where(and(eq(providerCredentials.providerId, providerId), eq(providerCredentials.status, "active")));
  return row ?? null;
}

export async function getActiveCredentialLifecycleSummary(providerId: ProviderIdValue) {
  const [row] = await db
    .select({
      id: providerCredentials.id,
      providerId: providerCredentials.providerId,
      status: providerCredentials.status,
      baseUrl: providerCredentials.baseUrl,
    })
    .from(providerCredentials)
    .where(and(eq(providerCredentials.providerId, providerId), eq(providerCredentials.status, "active")));
  return row ?? null;
}

/** Non-secret row data used before re-enabling a disabled credential. */
export async function getCredentialEnableSummary(credentialId: string) {
  const [row] = await db
    .select({
      id: providerCredentials.id,
      providerId: providerCredentials.providerId,
      status: providerCredentials.status,
      baseUrl: providerCredentials.baseUrl,
    })
    .from(providerCredentials)
    .where(eq(providerCredentials.id, credentialId));
  return row ?? null;
}

export async function getCredentialLifecycleSummary(credentialId: string) {
  const [row] = await db
    .select({
      id: providerCredentials.id,
      providerId: providerCredentials.providerId,
      status: providerCredentials.status,
      baseUrl: providerCredentials.baseUrl,
    })
    .from(providerCredentials)
    .where(eq(providerCredentials.id, credentialId));
  return row ?? null;
}

export async function findActiveLiveRunUsingProvider(
  providerId: ProviderIdValue,
  secondaryProviders: { audit: ProviderIdValue; resonance: ProviderIdValue },
) {
  const rows = await db
    .select({
      id: auditRuns.id,
      state: auditRuns.state,
      runMode: auditRuns.runMode,
      selectedProvidersJson: auditRuns.selectedProvidersJson,
      matrixKind: matrixVersions.kind,
    })
    .from(auditRuns)
    .innerJoin(matrixVersions, eq(matrixVersions.id, auditRuns.matrixVersionId))
    .where(
      and(
        inArray(auditRuns.state, ["queued", "running"]),
        ne(auditRuns.runMode, "mock"),
      ),
    );

  return rows.find((run) => {
    const selectedProviders = Array.isArray(run.selectedProvidersJson) ? run.selectedProvidersJson : [];
    const secondary = run.matrixKind === "resonance" ? secondaryProviders.resonance : secondaryProviders.audit;
    return selectedProviders.includes(providerId) || secondary === providerId;
  }) ?? null;
}

/** D-020: at most one active credential per provider — disable any existing active row first. */
export async function saveCredential(input: {
  providerId: ProviderIdValue;
  label: string;
  encryptedApiKey: string;
  keyVersion: number;
  apiKeyLast4: string;
  apiKeyFingerprint: string;
  baseUrl?: string | null;
  defaultModel?: string | null;
}) {
  await db.transaction(async (tx) => {
    await tx
      .update(providerCredentials)
      .set({ status: "disabled", updatedAt: new Date() })
      .where(and(eq(providerCredentials.providerId, input.providerId), eq(providerCredentials.status, "active")));
    await tx.insert(providerCredentials).values({
      providerId: input.providerId,
      label: input.label,
      encryptedApiKey: input.encryptedApiKey,
      keyVersion: input.keyVersion,
      apiKeyLast4: input.apiKeyLast4,
      apiKeyFingerprint: input.apiKeyFingerprint,
      baseUrl: input.baseUrl ?? null,
      defaultModel: input.defaultModel ?? null,
      status: "active",
    });
  });
}

export async function markVerified(credentialId: string) {
  await db
    .update(providerCredentials)
    .set({ lastVerifiedAt: new Date(), status: "active", updatedAt: new Date() })
    .where(eq(providerCredentials.id, credentialId));
}

/** D-021: decrypt failure marks the row invalid, prompting re-entry — never crashes the worker. */
export async function markInvalid(credentialId: string) {
  await db
    .update(providerCredentials)
    .set({ status: "invalid", updatedAt: new Date() })
    .where(eq(providerCredentials.id, credentialId));
}

export async function markUsed(credentialId: string) {
  await db
    .update(providerCredentials)
    .set({ lastUsedAt: new Date() })
    .where(eq(providerCredentials.id, credentialId));
}

export async function disableCredential(credentialId: string) {
  const updated = await db
    .update(providerCredentials)
    .set({ status: "disabled", updatedAt: new Date() })
    .where(eq(providerCredentials.id, credentialId))
    .returning({ id: providerCredentials.id });
  return updated.length;
}

/**
 * Re-enable a deliberately disabled credential without asking the operator
 * to paste the secret again. This is intentionally NOT available for
 * invalid rows: invalid can mean a bad key or a decrypt failure, and those
 * require re-entry/rotation (D-021). D-020 still holds — enabling one row
 * disables any other active row for the same provider in the same
 * transaction.
 */
export async function enableCredential(credentialId: string): Promise<number> {
  return db.transaction(async (tx) => {
    const [credential] = await tx
      .select({
        id: providerCredentials.id,
        providerId: providerCredentials.providerId,
        status: providerCredentials.status,
      })
      .from(providerCredentials)
      .where(eq(providerCredentials.id, credentialId));

    if (!credential || credential.status !== "disabled") return 0;

    await tx
      .update(providerCredentials)
      .set({ status: "disabled", updatedAt: new Date() })
      .where(
        and(
          eq(providerCredentials.providerId, credential.providerId),
          eq(providerCredentials.status, "active"),
        ),
      );

    const enabled = await tx
      .update(providerCredentials)
      .set({ status: "active", updatedAt: new Date() })
      .where(and(eq(providerCredentials.id, credentialId), eq(providerCredentials.status, "disabled")))
      .returning({ id: providerCredentials.id });
    return enabled.length;
  });
}

export async function deleteCredential(credentialId: string) {
  const deleted = await db
    .delete(providerCredentials)
    .where(eq(providerCredentials.id, credentialId))
    .returning({ id: providerCredentials.id });
  return deleted.length;
}
