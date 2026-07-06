import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSessionToken } from "@/core/auth";
import { SESSION_COOKIE } from "@/modules/auth/constants";

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const mutableEnv = process.env as Record<string, string | undefined>;

function request(path: string, cookie?: string) {
  const req = new NextRequest(`https://resonance.test${path}`);
  if (cookie) req.cookies.set(SESSION_COOKIE, cookie);
  return req;
}

describe("middleware auth gate", () => {
  afterEach(() => {
    delete process.env.APP_ENV;
    delete process.env.DISABLE_AUTH;
    delete process.env.SESSION_SECRET;
    if (ORIGINAL_NODE_ENV === undefined) delete mutableEnv.NODE_ENV;
    else mutableEnv.NODE_ENV = ORIGINAL_NODE_ENV;
    vi.resetModules();
  });

  it("redirects unauthenticated app pages to login", async () => {
    process.env.APP_ENV = "production";
    process.env.SESSION_SECRET = "secret";
    vi.resetModules();
    const { middleware } = await import("./middleware");

    const res = middleware(request("/projects"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://resonance.test/login");
  });

  it("does not let DISABLE_AUTH bypass production auth", async () => {
    process.env.APP_ENV = "production";
    process.env.DISABLE_AUTH = "true";
    process.env.SESSION_SECRET = "secret";
    vi.resetModules();
    const { middleware } = await import("./middleware");

    const res = middleware(request("/settings"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://resonance.test/login");
  });

  it("does not let DISABLE_AUTH bypass auth when NODE_ENV is production and APP_ENV is missing", async () => {
    delete process.env.APP_ENV;
    mutableEnv.NODE_ENV = "production";
    process.env.DISABLE_AUTH = "true";
    process.env.SESSION_SECRET = "secret";
    vi.resetModules();
    const { middleware } = await import("./middleware");

    const res = middleware(request("/settings"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://resonance.test/login");
  });

  it("accepts a valid signed session cookie", async () => {
    process.env.APP_ENV = "production";
    process.env.SESSION_SECRET = "secret";
    const token = createSessionToken("secret");
    vi.resetModules();
    const { middleware } = await import("./middleware");

    const res = middleware(request("/projects", token));

    expect(res.status).toBe(200);
  });

  it("only excludes the exact /health route from the auth matcher", async () => {
    process.env.APP_ENV = "production";
    process.env.SESSION_SECRET = "secret";
    vi.resetModules();
    const { config } = await import("./middleware");

    expect(config.matcher).toEqual(["/((?!_next/static|_next/image|favicon.ico|health$).*)"]);
  });
});
