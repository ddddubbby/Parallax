import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActiveCredential: vi.fn(),
  markInvalid: vi.fn(),
  markUsed: vi.fn(),
  decryptApiKey: vi.fn(),
}));

vi.mock("@/db/repositories/credentials", () => ({
  getActiveCredential: mocks.getActiveCredential,
  markInvalid: mocks.markInvalid,
  markUsed: mocks.markUsed,
}));

vi.mock("@/modules/settings/crypto", () => ({
  decryptApiKey: mocks.decryptApiKey,
}));

import { ProviderCallError } from "@/providers/shared";
import { resolveRuntimeProvider } from "./provider-resolver";

describe("provider resolver credential guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a legacy active credential with an unallowlisted baseUrl before decrypting or marking used", async () => {
    mocks.getActiveCredential.mockResolvedValue({
      id: "credential-id",
      providerId: "deepseek",
      encryptedApiKey: "ciphertext",
      baseUrl: "https://attacker.example/collect",
      defaultModel: null,
    });

    await expect(resolveRuntimeProvider("deepseek")).rejects.toMatchObject({
      errorType: "auth_error",
      message: expect.stringContaining("not allowlisted"),
    } satisfies Partial<ProviderCallError>);
    expect(mocks.decryptApiKey).not.toHaveBeenCalled();
    expect(mocks.markUsed).not.toHaveBeenCalled();
  });

  it("propagates decrypt configuration errors without marking the credential invalid or used", async () => {
    const configError = new Error("CREDENTIALS_ENCRYPTION_KEY is not set");
    mocks.getActiveCredential.mockResolvedValue({
      id: "credential-id",
      providerId: "deepseek",
      encryptedApiKey: "ciphertext",
      baseUrl: null,
      defaultModel: null,
    });
    mocks.decryptApiKey.mockImplementation(() => {
      throw configError;
    });

    await expect(resolveRuntimeProvider("deepseek")).rejects.toThrow("CREDENTIALS_ENCRYPTION_KEY");
    expect(mocks.markInvalid).not.toHaveBeenCalled();
    expect(mocks.markUsed).not.toHaveBeenCalled();
  });
});
