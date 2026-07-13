// Canonical JSON + digest — the one home for "same content ⇒ same bytes ⇒ same
// hash" across the agent surface (report digests, requirement hashes,
// deliverable envelopes, manifest digests). Key order is sorted recursively so
// insertion order never changes a digest.

import { createHash } from "node:crypto";

/** Recursively sort object keys so serialization is insertion-order independent. */
export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((k) => [k, canonicalize((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}

/** Deterministic JSON string of `value` (canonical key order). */
export function canonicalJsonStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** SHA-256 of the canonical JSON serialization — the identity of a payload. */
export function canonicalSha256(value: unknown): string {
  return sha256Hex(canonicalJsonStringify(value));
}
