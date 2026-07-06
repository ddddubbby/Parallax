import { afterEach, describe, expect, it, vi } from "vitest";
import { reportError } from "./observability";

describe("reportError", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs the error with structured context via console.error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new Error("boom");
    reportError(err, { boundary: "test", projectId: "p1" });
    expect(spy).toHaveBeenCalledTimes(1);
    const [, payload, logged] = spy.mock.calls[0];
    expect(payload).toMatchObject({ boundary: "test", projectId: "p1" });
    expect(logged).toBe(err);
  });

  it("surfaces a Next digest when the error carries one", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = Object.assign(new Error("server"), { digest: "abc123" });
    reportError(err, { boundary: "app" });
    const [, payload] = spy.mock.calls[0];
    expect(payload).toMatchObject({ digest: "abc123" });
  });

  it("never throws, even on a non-Error value", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => reportError("just a string")).not.toThrow();
    expect(() => reportError(null)).not.toThrow();
    expect(() => reportError(undefined)).not.toThrow();
  });

  it("never throws even if the underlying logger throws", () => {
    vi.spyOn(console, "error").mockImplementation(() => {
      throw new Error("logger exploded");
    });
    expect(() => reportError(new Error("x"), { boundary: "y" })).not.toThrow();
  });
});
