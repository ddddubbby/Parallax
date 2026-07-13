import { randomBytes } from "node:crypto";
import { eq, like } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db, pool } from "@/db/client";
import { providerCredentials } from "@/db/schema";
import {
  acquireCredentialsSuiteLock,
  releaseCredentialsSuiteLock,
} from "@/db/repositories/credentials.test-helpers";

// ST-3: add/update+rotate share saveCredential's disable-then-insert
// mechanics (D-020); verify only deactivates on a real auth failure.
// Runs against the local dev database and self-skips when no Postgres is
// reachable (matches src/modules/matrix/actions.test.ts's convention).
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

let dbUp = false;
try {
  await pool.query("select 1");
  dbUp = true;
} catch {
  dbUp = false;
}

// This suite mutates ACTIVE deepseek credential rows; so does
// extraction/live-pipeline.test.ts. Serialize the two (see the helper's note).
let suiteLock: Awaited<ReturnType<typeof acquireCredentialsSuiteLock>> | null = null;
beforeAll(async () => {
  if (dbUp) suiteLock = await acquireCredentialsSuiteLock(pool);
});

afterAll(async () => {
  await db.delete(providerCredentials).where(like(providerCredentials.label, "test-m8%"));
  await releaseCredentialsSuiteLock(suiteLock);
  await pool.end().catch(() => {});
});

describe.skipIf(!dbUp)("settings actions against the dev database", () => {
  beforeEach(() => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("saveCredential adds an active row, then rotate disables the prior one (D-020)", async () => {
    const { saveCredential } = await import("./actions");
    const first = await saveCredential("deepseek", "sk-test-key-one", { label: "test-m8-rotate" });
    expect(first.ok).toBe(true);

    const rows1 = await db
      .select()
      .from(providerCredentials)
      .where(eq(providerCredentials.label, "test-m8-rotate"));
    expect(rows1).toHaveLength(1);
    expect(rows1[0].status).toBe("active");
    const firstId = rows1[0].id;

    const second = await saveCredential("deepseek", "sk-test-key-two", { label: "test-m8-rotate" });
    expect(second.ok).toBe(true);

    const rows2 = await db
      .select()
      .from(providerCredentials)
      .where(eq(providerCredentials.label, "test-m8-rotate"));
    expect(rows2).toHaveLength(2); // disable, not delete — both rows remain
    const active = rows2.filter((r) => r.status === "active");
    expect(active).toHaveLength(1);
    expect(active[0].id).not.toBe(firstId);
  });

  it("rejects an empty key and an unsupported provider", async () => {
    const { saveCredential, verifyCredential } = await import("./actions");
    const empty = await saveCredential("deepseek", "   ", { label: "test-m8-empty" });
    expect(empty.ok).toBe(false);

    // minimax is the PV-3 candidate with no adapter built — the only
    // remaining unsupported id now that M9 added the four audit providers.
    const unsupported = await saveCredential("minimax", "sk-whatever", { label: "test-m8-unsupported" });
    expect(unsupported.ok).toBe(false);

    const invalidVerify = await verifyCredential(
      "00000000-0000-4000-8000-000000000000",
      "not-a-provider" as "deepseek",
    );
    expect(invalidVerify.ok).toBe(false);
    if (!invalidVerify.ok) expect(invalidVerify.error).toContain("No live adapter");
  });

  it("saveCredential returns a controlled error when credential encryption is misconfigured", async () => {
    const { saveCredential } = await import("./actions");
    delete process.env.CREDENTIALS_ENCRYPTION_KEY;

    const result = await saveCredential("deepseek", "sk-test-missing-kek", { label: "test-m8-missing-kek" });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("CREDENTIALS_ENCRYPTION_KEY");
  });

  it("allowlists baseUrl overrides — every provider call sends the bearer key there, so an arbitrary host is a one-field exfiltration path (C-11)", async () => {
    const { saveCredential } = await import("./actions");

    const attacker = await saveCredential("deepseek", "sk-test-baseurl", {
      label: "test-m8-baseurl-evil",
      baseUrl: "https://attacker.example/collect",
    });
    expect(attacker.ok).toBe(false);
    if (!attacker.ok) expect(attacker.error).toContain("not allowlisted");

    const plainHttp = await saveCredential("deepseek", "sk-test-baseurl", {
      label: "test-m8-baseurl-http",
      baseUrl: "http://api.deepseek.com",
    });
    expect(plainHttp.ok).toBe(false);
    if (!plainHttp.ok) expect(plainHttp.error).toContain("https");

    const notAUrl = await saveCredential("deepseek", "sk-test-baseurl", {
      label: "test-m8-baseurl-junk",
      baseUrl: "not a url at all",
    });
    expect(notAUrl.ok).toBe(false);

    const official = await saveCredential("deepseek", "sk-test-baseurl", {
      label: "test-m8-baseurl-official",
      baseUrl: "https://api.deepseek.com",
    });
    expect(official.ok).toBe(true);

    // A deploy-layer proxy host (env DEEPSEEK_BASE_URL) is allowlisted too (D-020).
    process.env.DEEPSEEK_BASE_URL = "https://deepseek-proxy.internal.example";
    const proxied = await saveCredential("deepseek", "sk-test-baseurl", {
      label: "test-m8-baseurl-proxy",
      baseUrl: "https://deepseek-proxy.internal.example/v1",
    });
    expect(proxied.ok).toBe(true);
    delete process.env.DEEPSEEK_BASE_URL;
  });

  it("verifyCredential marks verified on success, invalid on auth_error, and leaves it active on a transient error", async () => {
    const { saveCredential, verifyCredential } = await import("./actions");
    const saved = await saveCredential("deepseek", "sk-test-verify", { label: "test-m8-verify" });
    expect(saved.ok).toBe(true);
    const [row] = await db
      .select()
      .from(providerCredentials)
      .where(eq(providerCredentials.label, "test-m8-verify"));

    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              choices: [{ message: { content: "OK" } }],
              usage: { prompt_tokens: 5, completion_tokens: 1 },
              model: "deepseek-v4-flash",
            }),
            { status: 200 },
          ),
      ),
    );
    const okResult = await verifyCredential(row.id, "deepseek");
    expect(okResult.ok).toBe(true);
    const [verified] = await db
      .select()
      .from(providerCredentials)
      .where(eq(providerCredentials.id, row.id));
    expect(verified.lastVerifiedAt).not.toBeNull();
    expect(verified.status).toBe("active");

    vi.stubGlobal("fetch", vi.fn(async () => new Response("server exploded", { status: 500 })));
    const transientResult = await verifyCredential(row.id, "deepseek");
    expect(transientResult.ok).toBe(false);
    const [afterTransient] = await db
      .select()
      .from(providerCredentials)
      .where(eq(providerCredentials.id, row.id));
    expect(afterTransient.status).toBe("active"); // transient failure never deactivates

    vi.stubGlobal("fetch", vi.fn(async () => new Response("unauthorized", { status: 401 })));
    const authFailResult = await verifyCredential(row.id, "deepseek");
    expect(authFailResult.ok).toBe(false);
    const [afterAuthFail] = await db
      .select()
      .from(providerCredentials)
      .where(eq(providerCredentials.id, row.id));
    expect(afterAuthFail.status).toBe("invalid");
  });

  it("verifyCredential refuses active legacy baseUrl overrides before any provider call (C-11)", async () => {
    const { verifyCredential } = await import("./actions");
    await db
      .update(providerCredentials)
      .set({ status: "disabled" })
      .where(eq(providerCredentials.providerId, "google"));
    const [legacy] = await db
      .insert(providerCredentials)
      .values({
        providerId: "google",
        label: "test-m8-verify-legacy-evil",
        encryptedApiKey: "legacy-ciphertext",
        keyVersion: 1,
        apiKeyLast4: "evil",
        apiKeyFingerprint: "legacy-verify-fingerprint",
        baseUrl: "https://attacker.example/collect",
        status: "active",
      })
      .returning({ id: providerCredentials.id });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await verifyCredential(legacy.id, "google");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("not allowlisted");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("verifyCredential reports KEK config errors without marking the credential invalid", async () => {
    const { saveCredential, verifyCredential } = await import("./actions");
    const saved = await saveCredential("deepseek", "sk-test-verify-kek", { label: "test-m8-verify-kek" });
    expect(saved.ok).toBe(true);
    const [row] = await db
      .select()
      .from(providerCredentials)
      .where(eq(providerCredentials.label, "test-m8-verify-kek"));

    delete process.env.CREDENTIALS_ENCRYPTION_KEY;
    const result = await verifyCredential(row.id, "deepseek");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("CREDENTIALS_ENCRYPTION_KEY");
    const [after] = await db
      .select()
      .from(providerCredentials)
      .where(eq(providerCredentials.id, row.id));
    expect(after.status).toBe("active");
  });

  it("verifyCredential passes a real AbortSignal to the provider call — a hung provider must not tie up the request forever (Fix C)", async () => {
    const { saveCredential, verifyCredential } = await import("./actions");
    const saved = await saveCredential("deepseek", "sk-test-timeout", { label: "test-m8-timeout" });
    expect(saved.ok).toBe(true);
    const [row] = await db
      .select()
      .from(providerCredentials)
      .where(eq(providerCredentials.label, "test-m8-timeout"));

    const fetchSpy = vi.fn(
      async (...args: [RequestInfo | URL, RequestInit?]) => {
        void args;
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: "OK" } }],
            usage: { prompt_tokens: 5, completion_tokens: 1 },
            model: "deepseek-v4-flash",
          }),
          { status: 200 },
        );
      },
    );
    vi.stubGlobal("fetch", fetchSpy);

    await verifyCredential(row.id, "deepseek");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const requestInit = fetchSpy.mock.calls[0][1] as RequestInit;
    // Before Fix C this was undefined — a hung provider.generate() call had
    // no deadline and could tie up the server action indefinitely.
    expect(requestInit.signal).toBeInstanceOf(AbortSignal);
    expect(requestInit.signal?.aborted).toBe(false);
  });

  it("enableCredential reactivates a disabled row and disables any other active credential for that provider", async () => {
    const { saveCredential, disableCredential, enableCredential } = await import("./actions");

    const first = await saveCredential("deepseek", "sk-test-enable-one", { label: "test-m8-enable-one" });
    expect(first.ok).toBe(true);
    const [firstRow] = await db
      .select()
      .from(providerCredentials)
      .where(eq(providerCredentials.label, "test-m8-enable-one"));

    await disableCredential(firstRow.id);
    const [disabledFirst] = await db
      .select()
      .from(providerCredentials)
      .where(eq(providerCredentials.id, firstRow.id));
    expect(disabledFirst.status).toBe("disabled");

    const second = await saveCredential("deepseek", "sk-test-enable-two", { label: "test-m8-enable-two" });
    expect(second.ok).toBe(true);
    const [secondRow] = await db
      .select()
      .from(providerCredentials)
      .where(eq(providerCredentials.label, "test-m8-enable-two"));
    expect(secondRow.status).toBe("active");

    const enabled = await enableCredential(firstRow.id);
    expect(enabled.ok).toBe(true);

    const rows = await db
      .select()
      .from(providerCredentials)
      .where(like(providerCredentials.label, "test-m8-enable-%"));
    expect(rows.find((r) => r.id === firstRow.id)?.status).toBe("active");
    expect(rows.find((r) => r.id === secondRow.id)?.status).toBe("disabled");
    expect(rows.filter((r) => r.providerId === "deepseek" && r.status === "active")).toHaveLength(1);
  });

  it("enableCredential re-validates legacy disabled baseUrl overrides before reactivation (C-11)", async () => {
    const { enableCredential } = await import("./actions");
    const [legacy] = await db
      .insert(providerCredentials)
      .values({
        providerId: "deepseek",
        label: "test-m8-enable-legacy-evil",
        encryptedApiKey: "legacy-ciphertext",
        keyVersion: 1,
        apiKeyLast4: "evil",
        apiKeyFingerprint: "legacy-fingerprint",
        baseUrl: "https://attacker.example/collect",
        status: "disabled",
      })
      .returning({ id: providerCredentials.id });

    const result = await enableCredential(legacy.id);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("not allowlisted");
    const [after] = await db
      .select()
      .from(providerCredentials)
      .where(eq(providerCredentials.id, legacy.id));
    expect(after.status).toBe("disabled");
  });

  it("enableCredential refuses invalid rows; those require re-entry or rotation", async () => {
    const { saveCredential, enableCredential } = await import("./actions");
    const saved = await saveCredential("deepseek", "sk-test-enable-invalid", { label: "test-m8-enable-invalid" });
    expect(saved.ok).toBe(true);
    const [row] = await db
      .select()
      .from(providerCredentials)
      .where(eq(providerCredentials.label, "test-m8-enable-invalid"));

    await db
      .update(providerCredentials)
      .set({ status: "invalid" })
      .where(eq(providerCredentials.id, row.id));

    const result = await enableCredential(row.id);
    expect(result.ok).toBe(false);
    const [after] = await db
      .select()
      .from(providerCredentials)
      .where(eq(providerCredentials.id, row.id));
    expect(after.status).toBe("invalid");
  });

  it("disableCredential and deleteCredential", async () => {
    const { saveCredential, disableCredential, deleteCredential } = await import("./actions");
    const saved = await saveCredential("deepseek", "sk-test-lifecycle", { label: "test-m8-lifecycle" });
    expect(saved.ok).toBe(true);
    const [row] = await db
      .select()
      .from(providerCredentials)
      .where(eq(providerCredentials.label, "test-m8-lifecycle"));

    const disabledResult = await disableCredential(row.id);
    expect(disabledResult.ok).toBe(true);
    const [disabled] = await db
      .select()
      .from(providerCredentials)
      .where(eq(providerCredentials.id, row.id));
    expect(disabled.status).toBe("disabled");
    const missingDisable = await disableCredential("00000000-0000-4000-8000-000000000000");
    expect(missingDisable.ok).toBe(false);
    if (!missingDisable.ok) expect(missingDisable.error).toContain("not found");

    const deletedResult = await deleteCredential(row.id);
    expect(deletedResult.ok).toBe(true);
    const gone = await db
      .select()
      .from(providerCredentials)
      .where(eq(providerCredentials.id, row.id));
    expect(gone).toHaveLength(0);
    const missingDelete = await deleteCredential(row.id);
    expect(missingDelete.ok).toBe(false);
    if (!missingDelete.ok) expect(missingDelete.error).toContain("not found");
  });

  it("credential lifecycle actions reject malformed ids before DB UUID casts", async () => {
    const { disableCredential, enableCredential, deleteCredential } = await import("./actions");

    await expect(disableCredential("not-a-uuid")).resolves.toEqual({ ok: false, error: "Invalid credential id" });
    await expect(enableCredential("not-a-uuid")).resolves.toEqual({ ok: false, error: "Invalid credential id" });
    await expect(deleteCredential("not-a-uuid")).resolves.toEqual({ ok: false, error: "Invalid credential id" });
  });
});
