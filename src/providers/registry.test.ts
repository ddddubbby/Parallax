import { describe, expect, it, vi } from "vitest";
import { getProvider, listRegisteredProviders } from "./registry";

describe("provider registry", () => {
  it("keeps live registry entries metadata-only so empty credentials can never make network calls", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const provider = getProvider("deepseek");

    expect(provider).toBeDefined();
    await expect(provider?.generate({ promptText: "hello", mode: "ungrounded" })).rejects.toMatchObject({
      errorType: "unsupported_mode",
      message: expect.stringContaining("metadata-only"),
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("still exposes provider metadata and cost estimates for run planning", () => {
    const providers = listRegisteredProviders();
    const deepseek = providers.find((provider) => provider.id === "deepseek");

    expect(deepseek).toMatchObject({
      displayName: "DeepSeek",
      supportsUngrounded: true,
      supportsGrounded: false,
    });
    expect(deepseek?.estimateCostUsd({ promptText: "short prompt", mode: "ungrounded" })).toBeGreaterThan(0);
  });

  it("registers the M63 shopping-agent model engines as grounded-capable (D-143)", () => {
    for (const [id, displayName] of [
      ["xai", "Grok"],
      ["meta", "Muse Spark"],
    ] as const) {
      expect(getProvider(id)).toMatchObject({ displayName, supportsGrounded: true, supportsUngrounded: true });
      expect(getProvider(id)?.estimateCostUsd({ promptText: "short prompt", mode: "grounded" })).toBeGreaterThan(0);
    }
  });
});
