import { createHash, createHmac, timingSafeEqual } from "node:crypto";

// Auth domain (ST-6, D-024). Pure functions over provided secrets — no env
// or DB access here, so every path is testable with a fixed key. No
// project-layer imports (C-7).

/** Constant-time comparison — never use `===` for password checks (timing side-channel). */
export function constantTimeEqual(a: string, b: string): boolean {
  const digestA = createHash("sha256").update(a).digest();
  const digestB = createHash("sha256").update(b).digest();
  return timingSafeEqual(digestA, digestB) && Buffer.byteLength(a) === Buffer.byteLength(b);
}

export interface SessionPayload {
  issuedAt: number;
  expiresAt: number;
}

/**
 * Stateless signed session token (HMAC-SHA256 over payload + secret). No
 * session table (A2) — the single shared-password operator has no
 * per-user state worth persisting; the signature and expiry are the
 * entire trust mechanism.
 */
export function signSession(payload: SessionPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifySession(token: string, secret: string, now: number = Date.now()): SessionPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expectedSig = createHmac("sha256", secret).update(body).digest("base64url");
  if (!constantTimeEqual(sig, expectedSig)) return null;
  let payload: SessionPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof payload.expiresAt !== "number" || payload.expiresAt < now) return null;
  return payload;
}

const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // ST-6: <=7 days

export function createSessionToken(secret: string, now: number = Date.now()): string {
  return signSession({ issuedAt: now, expiresAt: now + SESSION_MAX_AGE_MS }, secret);
}

// ST-6 login rate limiting: pure decision logic over a caller-supplied
// attempt history — the repository/route layer owns where attempts are
// tracked (in-memory for MVP; see modules/auth/rate-limit.ts).
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

export function isLockedOut(recentFailureTimestamps: number[], now: number = Date.now()): boolean {
  const withinWindow = recentFailureTimestamps.filter((t) => now - t < LOCKOUT_WINDOW_MS);
  return withinWindow.length >= LOCKOUT_THRESHOLD;
}
