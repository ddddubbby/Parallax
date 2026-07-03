import { describe, expect, it } from "vitest";
import {
  constantTimeEqual,
  createSessionToken,
  isLockedOut,
  signSession,
  verifySession,
} from "./auth";

describe("constantTimeEqual", () => {
  it("returns true for identical strings", () => {
    expect(constantTimeEqual("hunter2", "hunter2")).toBe(true);
  });

  it("returns false for different strings, including different lengths", () => {
    expect(constantTimeEqual("hunter2", "hunter3")).toBe(false);
    expect(constantTimeEqual("short", "much-longer-string")).toBe(false);
  });

  it("returns false for empty vs non-empty", () => {
    expect(constantTimeEqual("", "x")).toBe(false);
    expect(constantTimeEqual("", "")).toBe(true);
  });
});

describe("signSession / verifySession", () => {
  const secret = "test-secret";

  it("round-trips a valid, unexpired session", () => {
    const token = signSession({ issuedAt: 1000, expiresAt: 2000 }, secret);
    const payload = verifySession(token, secret, 1500);
    expect(payload).toEqual({ issuedAt: 1000, expiresAt: 2000 });
  });

  it("rejects an expired session", () => {
    const token = signSession({ issuedAt: 1000, expiresAt: 2000 }, secret);
    expect(verifySession(token, secret, 2001)).toBeNull();
  });

  it("rejects a token signed with a different secret", () => {
    const token = signSession({ issuedAt: 1000, expiresAt: 2000 }, secret);
    expect(verifySession(token, "wrong-secret", 1500)).toBeNull();
  });

  it("rejects a tampered payload", () => {
    const token = signSession({ issuedAt: 1000, expiresAt: 2000 }, secret);
    const [, sig] = token.split(".");
    const tamperedBody = Buffer.from(JSON.stringify({ issuedAt: 1000, expiresAt: 9_999_999_999 })).toString("base64url");
    expect(verifySession(`${tamperedBody}.${sig}`, secret, 1500)).toBeNull();
  });

  it("rejects malformed tokens", () => {
    expect(verifySession("not-a-valid-token", secret)).toBeNull();
    expect(verifySession("", secret)).toBeNull();
  });
});

describe("createSessionToken", () => {
  it("creates a session that expires in <=7 days (ST-6)", () => {
    const now = Date.now();
    const token = createSessionToken("secret", now);
    const sevenDaysLater = now + 7 * 24 * 60 * 60 * 1000;
    expect(verifySession(token, "secret", sevenDaysLater - 1)).not.toBeNull();
    expect(verifySession(token, "secret", sevenDaysLater + 1)).toBeNull();
  });
});

describe("isLockedOut (ST-6 rate limiting)", () => {
  it("is not locked out below the threshold", () => {
    const now = Date.now();
    expect(isLockedOut([now, now, now, now], now)).toBe(false);
  });

  it("locks out at the threshold within the window", () => {
    const now = Date.now();
    expect(isLockedOut([now, now, now, now, now], now)).toBe(true);
  });

  it("ignores failures outside the lockout window", () => {
    const now = Date.now();
    const old = now - 20 * 60 * 1000; // 20 minutes ago, outside the 15-minute window
    expect(isLockedOut([old, old, old, old, old], now)).toBe(false);
  });
});
