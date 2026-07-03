import { and, desc, eq } from "drizzle-orm";
import { db } from "../client";
import { providerCredentials } from "../schema";

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
  await db
    .update(providerCredentials)
    .set({ status: "disabled", updatedAt: new Date() })
    .where(eq(providerCredentials.id, credentialId));
}

export async function deleteCredential(credentialId: string) {
  await db.delete(providerCredentials).where(eq(providerCredentials.id, credentialId));
}
