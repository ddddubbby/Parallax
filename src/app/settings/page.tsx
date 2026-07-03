import { CredentialsPanel } from "@/components/settings/credentials-panel";
import { listCredentialSummaries } from "@/db/repositories/credentials";

export const dynamic = "force-dynamic";

// ST-4: defaults are env-configured (D-012), not DB-editable in MVP —
// Settings surfaces the currently effective values rather than owning a
// second source of truth for them.
function readDefaults() {
  return {
    validationCapUsd: Number(process.env.DEFAULT_VALIDATION_RUN_CAP_USD ?? 2),
    auditCapUsd: Number(process.env.DEFAULT_AUDIT_RUN_CAP_USD ?? 25),
    globalDailyBudgetUsd: Number(process.env.PROVIDER_DAILY_BUDGET_USD ?? 25),
    deepseekDailyBudgetUsd: process.env.DEEPSEEK_DAILY_BUDGET_USD || null,
    deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
    deepseekModel: process.env.DEEPSEEK_DEFAULT_MODEL || "deepseek-v4-flash",
  };
}

export default async function SettingsPage() {
  const [credentials, defaults] = await Promise.all([
    listCredentialSummaries(),
    Promise.resolve(readDefaults()),
  ]);

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="label-mono mb-1 text-lg font-semibold">Settings</h1>
      <p className="mb-6 font-mono text-xs text-ink/50">
        Provider credentials and run defaults (ST-1..ST-6)
      </p>

      <section className="mb-10">
        <h2 className="label-mono mb-3 text-sm font-semibold text-ink">Provider credentials</h2>
        <CredentialsPanel credentials={credentials} />
      </section>

      <section>
        <h2 className="label-mono mb-3 text-sm font-semibold text-ink">Defaults</h2>
        <p className="mb-3 font-mono text-xs text-ink/45">
          Env-configured (D-012) — change via deploy config, not this UI.
        </p>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-3 rounded-xl border border-ink/15 p-6 font-mono text-sm">
          <dt className="text-ink/60">Validation run cap</dt>
          <dd>${defaults.validationCapUsd.toFixed(2)}</dd>
          <dt className="text-ink/60">Audit run cap</dt>
          <dd>${defaults.auditCapUsd.toFixed(2)}</dd>
          <dt className="text-ink/60">Global daily budget</dt>
          <dd>${defaults.globalDailyBudgetUsd.toFixed(2)} / provider / day</dd>
          <dt className="text-ink/60">DeepSeek daily budget</dt>
          <dd>{defaults.deepseekDailyBudgetUsd ? `$${defaults.deepseekDailyBudgetUsd}` : "uses global default"}</dd>
          <dt className="text-ink/60">Generation + extraction engine</dt>
          <dd>
            DeepSeek — {defaults.deepseekModel}
            <span className="block text-xs text-ink/45">{defaults.deepseekBaseUrl}</span>
          </dd>
        </dl>
      </section>
    </main>
  );
}
