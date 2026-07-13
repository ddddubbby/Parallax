// ACP deliverable envelope + capability tokens (AGENT_BUILD_PLAN §2). The
// envelope is the small canonical-JSON payload submitted through ACP's string
// field: `type`/`value` retained, < 2 KB, carrying the report URL (256-bit
// capability token) and the report digest (immutable ETag). Report links are
// durable but not confidential (§2); the token gates retrieval, the digest
// proves integrity.

import { randomBytes } from "node:crypto";
import { constantTimeEqual } from "./auth";
import { canonicalJsonStringify, sha256Hex } from "./canonical-json";
import type { RepresentationState } from "./agent-identity";

/** Build plan §2: the envelope must stay under 2 KB. */
export const ENVELOPE_MAX_BYTES = 2048;

export interface DeliverableEnvelopeInput {
  reportUrl: string;
  reportSha256: string;
  representationState: RepresentationState;
  methodologyVersion: string;
  promptMatrixVersion: string;
  termsVersion: string;
}

export interface DeliverableEnvelope {
  type: "object";
  value: {
    schema: "resonance-geo-deliverable-1.0";
    report_url: string;
    report_sha256: string;
    /** Echoed informationally (AGENT_PRD §9) — never a completion gate. */
    representation_state: RepresentationState;
    methodology_version: string;
    prompt_matrix_version: string;
    terms_version: string;
  };
}

export interface SerializedEnvelope {
  envelope: DeliverableEnvelope;
  /** The canonical string that goes into the SDK's deliverable field. */
  canonical: string;
  bytes: number;
  /** SHA-256 of the canonical string — the on-chain submit hash's preimage identity. */
  sha256: string;
}

export class EnvelopeTooLargeError extends Error {
  constructor(bytes: number) {
    super(`deliverable envelope is ${bytes} bytes; max ${ENVELOPE_MAX_BYTES}`);
    this.name = "EnvelopeTooLargeError";
  }
}

export function buildDeliverableEnvelope(input: DeliverableEnvelopeInput): SerializedEnvelope {
  const envelope: DeliverableEnvelope = {
    type: "object",
    value: {
      schema: "resonance-geo-deliverable-1.0",
      report_url: input.reportUrl,
      report_sha256: input.reportSha256,
      representation_state: input.representationState,
      methodology_version: input.methodologyVersion,
      prompt_matrix_version: input.promptMatrixVersion,
      terms_version: input.termsVersion,
    },
  };
  const canonical = canonicalJsonStringify(envelope);
  const bytes = Buffer.byteLength(canonical, "utf8");
  if (bytes > ENVELOPE_MAX_BYTES) throw new EnvelopeTooLargeError(bytes);
  return { envelope, canonical, bytes, sha256: sha256Hex(canonical) };
}

// --- Capability tokens: 256-bit random; only the SHA-256 is stored. ---

export interface CapabilityToken {
  /** The raw token — appears exactly once (in the report URL), never persisted. */
  token: string;
  /** What the DB stores; lookups hash the presented token and compare. */
  capabilityHash: string;
}

export function generateCapabilityToken(): CapabilityToken {
  const token = randomBytes(32).toString("hex"); // 256 bits
  return { token, capabilityHash: sha256Hex(token) };
}

/** True iff `candidate` hashes to `storedHash` — constant-time on the compare. */
export function verifyCapabilityToken(candidate: string, storedHash: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(candidate)) return false;
  return constantTimeEqual(sha256Hex(candidate), storedHash);
}
