import { afterEach, describe, expect, it, vi } from "vitest";
import { callDeepSeekChat, createDeepSeekProvider, estimateExtractionCostUsd, ProviderCallError } from "./index";

// RN-6 error-type mapping for the live adapter, network fully stubbed.
const CREDS = { apiKey: "sk-test" };
const BODY = { messages: [{ role: "user", content: "hi" }] };

async function expectErrorType(promise: Promise<unknown>, errorType: ProviderCallError["errorType"]) {
  try {
    await promise;
    expect.unreachable("expected ProviderCallError");
  } catch (err) {
    expect(err).toBeInstanceOf(ProviderCallError);
    expect((err as ProviderCallError).errorType).toBe(errorType);
  }
}

describe("DeepSeek adapter error mapping (RN-6)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps 401/403 to auth_error and 429 to rate_limit and 5xx to server_error", async () => {
    for (const [status, errorType] of [
      [401, "auth_error"],
      [403, "auth_error"],
      [429, "rate_limit"],
      [500, "server_error"],
      [503, "server_error"],
    ] as const) {
      vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status })));
      await expectErrorType(callDeepSeekChat(CREDS, BODY), errorType);
    }
  });

  it("maps AbortSignal.timeout's TimeoutError (not just AbortError) to the timeout error type", async () => {
    // AbortSignal.timeout() rejects fetch with a DOMException named
    // "TimeoutError" — the worker's per-call deadline produces exactly this.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("The operation timed out", "TimeoutError");
      }),
    );
    await expectErrorType(callDeepSeekChat(CREDS, BODY), "timeout");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("Aborted", "AbortError");
      }),
    );
    await expectErrorType(callDeepSeekChat(CREDS, BODY), "timeout");
  });

  it("maps a non-JSON 200 body to malformed_output", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>gateway error page</html>", { status: 200 })));
    await expectErrorType(callDeepSeekChat(CREDS, BODY), "malformed_output");
  });

  it("rejects grounded mode as unsupported_mode without touching the network (PV-5)", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const provider = createDeepSeekProvider(CREDS);
    await expectErrorType(provider.generate({ promptText: "x", mode: "grounded" }), "unsupported_mode");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("extraction cost estimate is nonzero (D-022: run planning includes extraction calls)", () => {
    expect(estimateExtractionCostUsd()).toBeGreaterThan(0);
  });
});
