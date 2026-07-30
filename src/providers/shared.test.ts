import { afterEach, describe, expect, it, vi } from "vitest";
import type { RequestInit as UndiciRequestInit } from "undici";

const mocks = vi.hoisted(() => ({
  undiciFetch: vi.fn(),
}));

vi.mock("undici", async (importOriginal) => {
  const actual = await importOriginal<typeof import("undici")>();
  return { ...actual, fetch: mocks.undiciFetch };
});

import { postProviderJson } from "./shared";

const proxyKeys = ["http_proxy", "HTTP_PROXY", "https_proxy", "HTTPS_PROXY", "no_proxy", "NO_PROXY"] as const;
const originalProxyEnv = new Map(proxyKeys.map((key) => [key, process.env[key]]));

function clearProxyEnv() {
  for (const key of proxyKeys) delete process.env[key];
}

function stubFetch() {
  const spy = vi.fn(async (...args: [RequestInfo | URL, RequestInit?]) => {
    void args;
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
  mocks.undiciFetch.mockReset();
  for (const key of proxyKeys) {
    const value = originalProxyEnv.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("provider proxy transport", () => {
  it("keeps direct provider requests unchanged when no proxy is configured", async () => {
    clearProxyEnv();
    const spy = stubFetch();

    await postProviderJson("Provider", "https://provider.example/v1/test", {}, {});

    const request = spy.mock.calls[0][1] as RequestInit & { dispatcher?: unknown };
    expect(request.dispatcher).toBeUndefined();
  });

  it("attaches an environment proxy dispatcher only to provider requests", async () => {
    clearProxyEnv();
    process.env.HTTPS_PROXY = "http://127.0.0.1:7890";
    process.env.NO_PROXY = "localhost,127.0.0.1";
    const globalSpy = stubFetch();
    mocks.undiciFetch.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    await postProviderJson("Provider", "https://provider.example/v1/test", {}, {});

    expect(globalSpy).not.toHaveBeenCalled();
    const request = mocks.undiciFetch.mock.calls[0][1] as UndiciRequestInit & {
      dispatcher?: unknown;
    };
    expect(request.dispatcher).toBeDefined();
  });
});
