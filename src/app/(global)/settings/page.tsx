import { Fragment } from "react";
import { LocalViewTabs } from "@/components/local-view-tabs";
import { CredentialsPanel } from "@/components/settings/credentials-panel";
import { parseSettingsView, withViewParam } from "@/core/views";
import { listCredentialSummaries } from "@/db/repositories/credentials";

export const dynamic = "force-dynamic";

const PROVIDER_ROWS: Array<{ id: string; label: string; fallbackModel: string }> = [
  { id: "DEEPSEEK", label: "DeepSeek", fallbackModel: "deepseek-v4-flash" },
  { id: "OPENAI", label: "OpenAI", fallbackModel: "gpt-5.5" },
  { id: "ANTHROPIC", label: "Anthropic", fallbackModel: "claude-sonnet-5" },
  { id: "GOOGLE", label: "Gemini", fallbackModel: "gemini-2.5-flash" },
  { id: "PERPLEXITY", label: "Perplexity", fallbackModel: "sonar" },
];

function readDefaults() {
  return {
    validationCapUsd: Number(process.env.DEFAULT_VALIDATION_RUN_CAP_USD ?? 2),
    auditCapUsd: Number(process.env.DEFAULT_AUDIT_RUN_CAP_USD ?? 25),
    globalDailyBudgetUsd: Number(process.env.PROVIDER_DAILY_BUDGET_USD ?? 25),
    extractionProvider: process.env.EXTRACTION_PROVIDER || "deepseek",
    embeddingProvider: process.env.EMBEDDING_PROVIDER || "openai",
    providers: PROVIDER_ROWS.map((p) => ({
      label: p.label,
      model: process.env[`${p.id}_DEFAULT_MODEL`] || p.fallbackModel,
      dailyBudgetUsd: process.env[`${p.id}_DAILY_BUDGET_USD`] || null,
    })),
  };
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view: viewRaw } = await searchParams;
  const view = parseSettingsView(viewRaw);
  const [credentials, defaults] = await Promise.all([
    listCredentialSummaries(),
    Promise.resolve(readDefaults()),
  ]);

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="label-mono mb-1 text-lg font-semibold">Settings</h1>
      <p className="mb-4 font-mono text-xs text-ink/50">
        Provider credentials and run defaults (ST-1..ST-6)
      </p>
      <LocalViewTabs
        tabs={[
          { id: "providers", label: "Providers", href: withViewParam("/settings", "providers") },
          { id: "defaults", label: "Defaults", href: withViewParam("/settings", "defaults") },
        ]}
        activeId={view}
        label="Settings sections"
      />

      {view === "providers" ? (
        <section>
          <h2 className="label-mono mb-3 text-sm font-semibold text-ink">Provider credentials</h2>
          <CredentialsPanel credentials={credentials} />
        </section>
      ) : (
        <section>
          <h2 className="label-mono mb-3 text-sm font-semibold text-ink">Defaults</h2>
          <p className="mb-3 font-mono text-xs text-ink/45">
            Deployment-managed (D-012) — read-only here. Change via deploy config, not this UI.
          </p>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-3 rounded-xl border border-ink/15 p-6 font-mono text-sm">
            <dt className="text-ink/60">Validation run cap</dt>
            <dd>${defaults.validationCapUsd.toFixed(2)}</dd>
            <dt className="text-ink/60">Audit run cap</dt>
            <dd>${defaults.auditCapUsd.toFixed(2)}</dd>
            <dt className="text-ink/60">Global daily budget</dt>
            <dd>${defaults.globalDailyBudgetUsd.toFixed(2)} / provider / day</dd>
            <dt className="text-ink/60">Extraction engine (D-041)</dt>
            <dd>
              {defaults.extractionProvider}
              <span className="block text-xs text-ink/45">
                one engine for all live runs — its credential must be active
              </span>
            </dd>
            <dt className="text-ink/60">Embedding engine (M18)</dt>
            <dd>
              {defaults.embeddingProvider}
              <span className="block text-xs text-ink/45">
                scores live Simulation runs — its credential must be active
              </span>
            </dd>
            {defaults.providers.map((p) => (
              <Fragment key={p.label}>
                <dt className="text-ink/60">{p.label} model / daily budget</dt>
                <dd>
                  {p.model}
                  {p.dailyBudgetUsd ? ` · $${p.dailyBudgetUsd}/day` : " · global budget"}
                </dd>
              </Fragment>
            ))}
          </dl>
        </section>
      )}
    </main>
  );
}
