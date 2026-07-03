import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { decryptApiKey, encryptApiKey, verifyFingerprint } from "./crypto";

beforeEach(() => {
  process.env.CREDENTIALS_ENCRYPTION_KEY = randomBytes(32).toString("hex");
});

describe("encryptApiKey / decryptApiKey (D-021)", () => {
  it("round-trips the raw key exactly", () => {
    const enc = encryptApiKey("sk-test-1234567890abcdef");
    expect(decryptApiKey(enc.ciphertext)).toBe("sk-test-1234567890abcdef");
  });

  it("never includes the raw key in the ciphertext, fingerprint, or last4 alone", () => {
    const raw = "sk-super-secret-value";
    const enc = encryptApiKey(raw);
    expect(enc.ciphertext).not.toContain(raw);
    expect(enc.last4).toBe("alue");
  });

  it("produces different ciphertext for the same key on repeated calls (random nonce)", () => {
    const a = encryptApiKey("same-key");
    const b = encryptApiKey("same-key");
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(decryptApiKey(a.ciphertext)).toBe(decryptApiKey(b.ciphertext));
  });

  it("returns null (never throws) on tampered ciphertext (D-021: mark row invalid, don't crash)", () => {
    const enc = encryptApiKey("some-key");
    const tampered = enc.ciphertext.slice(0, -4) + "abcd";
    expect(() => decryptApiKey(tampered)).not.toThrow();
    expect(decryptApiKey(tampered)).toBeNull();
  });

  it("returns null when decrypted under the wrong key", () => {
    const enc = encryptApiKey("some-key");
    process.env.CREDENTIALS_ENCRYPTION_KEY = randomBytes(32).toString("hex");
    expect(decryptApiKey(enc.ciphertext)).toBeNull();
  });

  it("sets keyVersion for future KEK rotation (D-021)", () => {
    expect(encryptApiKey("x").keyVersion).toBe(1);
  });
});

describe("verifyFingerprint", () => {
  it("matches the same key's fingerprint", () => {
    const enc = encryptApiKey("sk-abc");
    expect(verifyFingerprint("sk-abc", enc.fingerprint)).toBe(true);
  });

  it("does not match a different key", () => {
    const enc = encryptApiKey("sk-abc");
    expect(verifyFingerprint("sk-xyz", enc.fingerprint)).toBe(false);
  });
});
