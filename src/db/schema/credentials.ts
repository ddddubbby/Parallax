import { sql } from "drizzle-orm";
import {
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { credentialStatus, providerId } from "./enums";

// Server-only table (C-11): raw keys are never stored; ciphertext is
// AES-256-GCM under CREDENTIALS_ENCRYPTION_KEY with per-row nonce (D-021).
export const providerCredentials = pgTable(
  "provider_credentials",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    providerId: providerId("provider_id").notNull(),
    label: text("label").notNull().default("default"),
    encryptedApiKey: text("encrypted_api_key").notNull(),
    keyVersion: integer("key_version").notNull().default(1),
    apiKeyLast4: text("api_key_last4").notNull(),
    apiKeyFingerprint: text("api_key_fingerprint").notNull(),
    // Non-null values override env defaults (D-020).
    baseUrl: text("base_url"),
    defaultModel: text("default_model"),
    status: credentialStatus("status").notNull().default("active"),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Partial, not global: rotate (D-022 saveCredential) disables the prior
    // active row rather than deleting it, so a global unique index on
    // (provider_id, label) would collide with its own disabled predecessor
    // the moment the same label was reused. Scoping to active rows only
    // still prevents two concurrently-active same-label credentials while
    // letting history accumulate under one label.
    uniqueIndex("provider_credentials_provider_label_uq")
      .on(t.providerId, t.label)
      .where(sql`${t.status} = 'active'`),
    // At most one active credential per provider (D-020).
    uniqueIndex("provider_credentials_one_active_uq")
      .on(t.providerId)
      .where(sql`${t.status} = 'active'`),
  ],
);
