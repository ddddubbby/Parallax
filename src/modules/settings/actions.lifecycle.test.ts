import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteCredentialRow: vi.fn(),
  disableCredentialRow: vi.fn(),
  enableCredentialRow: vi.fn(),
  findActiveLiveRunUsingProvider: vi.fn(),
  getActiveCredential: vi.fn(),
  getActiveCredentialLifecycleSummary: vi.fn(),
  getCredentialEnableSummary: vi.fn(),
  getCredentialLifecycleSummary: vi.fn(),
  markInvalid: vi.fn(),
  markVerified: vi.fn(),
  saveCredentialRow: vi.fn(),
  embeddingProviderId: vi.fn(),
  extractionProviderId: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/db/repositories/credentials", () => ({
  deleteCredential: mocks.deleteCredentialRow,
  disableCredential: mocks.disableCredentialRow,
  enableCredential: mocks.enableCredentialRow,
  findActiveLiveRunUsingProvider: mocks.findActiveLiveRunUsingProvider,
  getActiveCredential: mocks.getActiveCredential,
  getActiveCredentialLifecycleSummary: mocks.getActiveCredentialLifecycleSummary,
  getCredentialEnableSummary: mocks.getCredentialEnableSummary,
  getCredentialLifecycleSummary: mocks.getCredentialLifecycleSummary,
  markInvalid: mocks.markInvalid,
  markVerified: mocks.markVerified,
  saveCredential: mocks.saveCredentialRow,
}));
vi.mock("@/modules/runner/provider-ids", () => ({
  embeddingProviderId: mocks.embeddingProviderId,
  extractionProviderId: mocks.extractionProviderId,
}));

import { deleteCredential, disableCredential, enableCredential, saveCredential } from "./actions";

describe("settings credential lifecycle guards", () => {
  const credentialId = "00000000-0000-4000-8000-000000000001";

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.embeddingProviderId.mockReturnValue("openai");
    mocks.extractionProviderId.mockReturnValue("deepseek");
  });

  it("blocks disabling an active credential while a live run depends on its provider", async () => {
    mocks.getCredentialLifecycleSummary.mockResolvedValue({
      id: credentialId,
      providerId: "deepseek",
      status: "active",
      baseUrl: null,
    });
    mocks.findActiveLiveRunUsingProvider.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      state: "running",
    });

    await expect(disableCredential(credentialId)).resolves.toEqual({
      ok: false,
      error: "Credential is in use by running live run 11111111. Pause or finish the run before disabling or deleting this key.",
    });
    expect(mocks.disableCredentialRow).not.toHaveBeenCalled();
  });

  it("blocks rotating an active credential while a live run depends on its provider", async () => {
    mocks.getActiveCredentialLifecycleSummary.mockResolvedValue({
      id: credentialId,
      providerId: "deepseek",
      status: "active",
      baseUrl: null,
    });
    mocks.findActiveLiveRunUsingProvider.mockResolvedValue({
      id: "33333333-3333-4333-8333-333333333333",
      state: "running",
    });

    const result = await saveCredential("deepseek", "sk-replacement");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("running live run 33333333");
    if (!result.ok) expect(result.error).toContain("before rotating this key");
    expect(mocks.saveCredentialRow).not.toHaveBeenCalled();
  });

  it("rejects very short API keys so the last4 display can never reveal the entire secret", async () => {
    const result = await saveCredential("deepseek", "abc");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("entire secret");
    expect(mocks.getActiveCredentialLifecycleSummary).not.toHaveBeenCalled();
    expect(mocks.saveCredentialRow).not.toHaveBeenCalled();
  });

  it("allows adding a provider key when no active credential exists even if a live run needs that provider", async () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = "a".repeat(64);
    mocks.getActiveCredentialLifecycleSummary.mockResolvedValue(null);
    mocks.saveCredentialRow.mockResolvedValue(undefined);

    await expect(saveCredential("openai", "sk-new-key")).resolves.toEqual({ ok: true });
    expect(mocks.findActiveLiveRunUsingProvider).not.toHaveBeenCalled();
    expect(mocks.saveCredentialRow).toHaveBeenCalledWith(expect.objectContaining({ providerId: "openai" }));
  });

  it("blocks enabling a disabled credential while a live run depends on the currently active provider key", async () => {
    mocks.getCredentialEnableSummary.mockResolvedValue({
      id: credentialId,
      providerId: "deepseek",
      status: "disabled",
      baseUrl: null,
    });
    mocks.getActiveCredentialLifecycleSummary.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000002",
      providerId: "deepseek",
      status: "active",
      baseUrl: null,
    });
    mocks.findActiveLiveRunUsingProvider.mockResolvedValue({
      id: "44444444-4444-4444-8444-444444444444",
      state: "running",
    });

    const result = await enableCredential(credentialId);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("running live run 44444444");
    if (!result.ok) expect(result.error).toContain("before rotating this key");
    expect(mocks.enableCredentialRow).not.toHaveBeenCalled();
  });

  it("allows enabling a disabled credential when there is no active provider key to rotate away from", async () => {
    mocks.getCredentialEnableSummary.mockResolvedValue({
      id: credentialId,
      providerId: "deepseek",
      status: "disabled",
      baseUrl: null,
    });
    mocks.getActiveCredentialLifecycleSummary.mockResolvedValue(null);
    mocks.enableCredentialRow.mockResolvedValue(1);

    await expect(enableCredential(credentialId)).resolves.toEqual({ ok: true });
    expect(mocks.findActiveLiveRunUsingProvider).not.toHaveBeenCalled();
    expect(mocks.enableCredentialRow).toHaveBeenCalledWith(credentialId);
  });

  it("blocks deleting an active secondary-engine credential while a queued live run depends on it", async () => {
    mocks.getCredentialLifecycleSummary.mockResolvedValue({
      id: credentialId,
      providerId: "openai",
      status: "active",
      baseUrl: null,
    });
    mocks.findActiveLiveRunUsingProvider.mockResolvedValue({
      id: "22222222-2222-4222-8222-222222222222",
      state: "queued",
    });

    const result = await deleteCredential(credentialId);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("queued live run 22222222");
    expect(mocks.deleteCredentialRow).not.toHaveBeenCalled();
    expect(mocks.findActiveLiveRunUsingProvider).toHaveBeenCalledWith("openai", {
      audit: "deepseek",
      resonance: "openai",
    });
  });

  it("allows deleting a disabled historical credential without live-run dependency checks", async () => {
    mocks.getCredentialLifecycleSummary.mockResolvedValue({
      id: credentialId,
      providerId: "deepseek",
      status: "disabled",
      baseUrl: null,
    });
    mocks.deleteCredentialRow.mockResolvedValue(1);

    await expect(deleteCredential(credentialId)).resolves.toEqual({ ok: true });
    expect(mocks.findActiveLiveRunUsingProvider).not.toHaveBeenCalled();
    expect(mocks.deleteCredentialRow).toHaveBeenCalledWith(credentialId);
  });
});
