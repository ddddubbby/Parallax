import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

// Credential encryption (D-021): AES-256-GCM, per-row random nonce,
// fingerprint = SHA-256 of the raw key. key_version exists on the schema
// for a future KEK rotation; this module always encrypts under the
// current key (version 1 for MVP — no rotation logic yet, D-021 only
// requires the column to exist so rotation is additive later).

const ALGORITHM = "aes-256-gcm";
const KEY_VERSION = 1;

/**
 * A misconfigured/missing KEK — distinct from a bad ciphertext. decryptApiKey
 * must NOT swallow this into a null return: doing so made a worker started
 * without the env var (local `pnpm worker`) mark a perfectly good stored
 * credential 'invalid'. A config error is the operator's environment being
 * wrong, not the credential; it must surface loudly and leave the row alone.
 */
export class CredentialConfigError extends Error {}

function loadKey(): Buffer {
  const raw = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!raw) throw new CredentialConfigError("CREDENTIALS_ENCRYPTION_KEY is not set");
  // Accept either a 32-byte hex string or a base64 string; Render's
  // generateValue:true produces a random string, not guaranteed hex.
  const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new CredentialConfigError("CREDENTIALS_ENCRYPTION_KEY must decode to exactly 32 bytes");
  }
  return key;
}

export interface EncryptedCredential {
  ciphertext: string; // base64: iv(12) + authTag(16) + encrypted
  keyVersion: number;
  fingerprint: string;
  last4: string;
}

export function encryptApiKey(rawKey: string): EncryptedCredential {
  const key = loadKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(rawKey, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const ciphertext = Buffer.concat([iv, authTag, encrypted]).toString("base64");
  return {
    ciphertext,
    keyVersion: KEY_VERSION,
    fingerprint: createHash("sha256").update(rawKey).digest("hex"),
    last4: rawKey.slice(-4),
  };
}

/**
 * Returns null when THIS ciphertext can't be decrypted under a valid key
 * (wrong KEK for this row, tampered ciphertext) — D-021: never throw, caller
 * marks the row 'invalid'. A CredentialConfigError (KEK missing/malformed)
 * propagates instead: that's the environment being wrong, not the credential,
 * and must not poison the row.
 */
export function decryptApiKey(ciphertext: string): string | null {
  const key = loadKey(); // throws CredentialConfigError — intentionally not caught
  try {
    const buf = Buffer.from(ciphertext, "base64");
    const iv = buf.subarray(0, 12);
    const authTag = buf.subarray(12, 28);
    const encrypted = buf.subarray(28);
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    return null;
  }
}

export function verifyFingerprint(rawKey: string, fingerprint: string): boolean {
  const computed = createHash("sha256").update(rawKey).digest();
  const expected = Buffer.from(fingerprint, "hex");
  if (computed.length !== expected.length) return false;
  return timingSafeEqual(computed, expected);
}
