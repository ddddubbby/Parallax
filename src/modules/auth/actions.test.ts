import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_COOKIE } from "./constants";
import { resetFailuresForTest } from "./rate-limit";

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const mutableEnv = process.env as Record<string, string | undefined>;

const mocks = vi.hoisted(() => ({
  cookieSet: vi.fn(),
  cookieDelete: vi.fn(),
  forwardedFor: "203.0.113.9",
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    set: mocks.cookieSet,
    delete: mocks.cookieDelete,
  })),
  headers: vi.fn(async () => new Headers({ "x-forwarded-for": mocks.forwardedFor })),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));

describe("auth server actions", () => {
  beforeEach(() => {
    process.env.APP_PASSWORD = "correct horse battery staple";
    process.env.SESSION_SECRET = "session-secret-for-test";
    process.env.APP_ENV = "production";
    mocks.cookieSet.mockClear();
    mocks.cookieDelete.mockClear();
    mocks.forwardedFor = "203.0.113.9";
    resetFailuresForTest();
  });

  afterEach(() => {
    delete process.env.APP_PASSWORD;
    delete process.env.SESSION_SECRET;
    delete process.env.APP_ENV;
    if (ORIGINAL_NODE_ENV === undefined) delete mutableEnv.NODE_ENV;
    else mutableEnv.NODE_ENV = ORIGINAL_NODE_ENV;
    resetFailuresForTest();
  });

  it("sets a production session cookie with hardened attributes on successful login", async () => {
    const { login } = await import("./actions");

    const result = await login("correct horse battery staple");

    expect(result).toEqual({ ok: true });
    expect(mocks.cookieSet).toHaveBeenCalledTimes(1);
    const [name, token, options] = mocks.cookieSet.mock.calls[0];
    expect(name).toBe(SESSION_COOKIE);
    expect(typeof token).toBe("string");
    expect(options).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
    });
  });

  it("treats NODE_ENV=production as production for secure cookies even if APP_ENV is missing", async () => {
    delete process.env.APP_ENV;
    mutableEnv.NODE_ENV = "production";
    const { login } = await import("./actions");

    const result = await login("correct horse battery staple");

    expect(result).toEqual({ ok: true });
    const [, , options] = mocks.cookieSet.mock.calls[0];
    expect(options).toMatchObject({ secure: true });
  });

  it("does not set a cookie on failed login and rate-limits repeated failures", async () => {
    const { login } = await import("./actions");

    for (let i = 0; i < 5; i += 1) {
      const result = await login("wrong");
      expect(result.ok).toBe(false);
    }
    const locked = await login("correct horse battery staple");

    expect(locked).toEqual({ ok: false, error: "Too many failed attempts. Try again in 15 minutes." });
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });
});
