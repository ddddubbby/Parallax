import { randomBytes } from "node:crypto";
import { eq, like } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, pool } from "@/db/client";
import { providerCredentials } from "@/db/schema";

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

afterAll(async () => {
  await db.delete(providerCredentials).where(like(providerCredentials.label, "test-m8%"));
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
    const { saveCredential } = await import("./actions");
    const empty = await saveCredential("deepseek", "   ", { label: "test-m8-empty" });
    expect(empty.ok).toBe(false);

    const unsupported = await saveCredential("openai", "sk-whatever", { label: "test-m8-unsupported" });
    expect(unsupported.ok).toBe(false);
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

  it("disableCredential and deleteCredential", async () => {
    const { saveCredential, disableCredential, deleteCredential } = await import("./actions");
    const saved = await saveCredential("deepseek", "sk-test-lifecycle", { label: "test-m8-lifecycle" });
    expect(saved.ok).toBe(true);
    const [row] = await db
      .select()
      .from(providerCredentials)
      .where(eq(providerCredentials.label, "test-m8-lifecycle"));

    await disableCredential(row.id);
    const [disabled] = await db
      .select()
      .from(providerCredentials)
      .where(eq(providerCredentials.id, row.id));
    expect(disabled.status).toBe("disabled");

    await deleteCredential(row.id);
    const gone = await db
      .select()
      .from(providerCredentials)
      .where(eq(providerCredentials.id, row.id));
    expect(gone).toHaveLength(0);
  });
});
