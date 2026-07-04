"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Field, Input, Select, Stamp } from "@/components/ui";
import type { ProviderId } from "@/core/runner";
import {
  deleteCredential,
  disableCredential,
  enableCredential,
  saveCredential,
  verifyCredential,
} from "@/modules/settings/actions";

export interface CredentialRow {
  id: string;
  providerId: ProviderId;
  label: string;
  apiKeyLast4: string;
  baseUrl: string | null;
  defaultModel: string | null;
  status: string;
  lastVerifiedAt: string | Date | null;
  lastUsedAt: string | Date | null;
  updatedAt: string | Date;
}

// MiniMax remains a PV-3 candidate, not built.
const LIVE_PROVIDERS: { id: ProviderId; displayName: string }[] = [
  { id: "deepseek", displayName: "DeepSeek" },
  { id: "openai", displayName: "OpenAI" },
  { id: "anthropic", displayName: "Anthropic" },
  { id: "google", displayName: "Gemini" },
  { id: "perplexity", displayName: "Perplexity" },
];

function formatDate(d: string | Date | null): string {
  if (!d) return "never";
  return new Date(d).toLocaleString();
}

function statusTone(status: string): "ok" | "warn" | "danger" | "ink" {
  if (status === "active") return "ok";
  if (status === "invalid") return "danger";
  if (status === "disabled") return "ink";
  return "warn";
}

export function CredentialsPanel({ credentials }: { credentials: CredentialRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [providerId, setProviderId] = useState<ProviderId>("deepseek");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [defaultModel, setDefaultModel] = useState("");

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await saveCredential(providerId, apiKey, {
        baseUrl: baseUrl || undefined,
        defaultModel: defaultModel || undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setApiKey("");
      setBaseUrl("");
      setDefaultModel("");
      router.refresh();
    });
  }

  function handleVerify(id: string, provider: ProviderId) {
    setError(null);
    setBusyId(id);
    startTransition(async () => {
      const result = await verifyCredential(id, provider);
      setBusyId(null);
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  }

  function handleDisable(id: string) {
    setError(null);
    setBusyId(id);
    startTransition(async () => {
      await disableCredential(id);
      setBusyId(null);
      router.refresh();
    });
  }

  function handleEnable(id: string) {
    setError(null);
    setBusyId(id);
    startTransition(async () => {
      const result = await enableCredential(id);
      setBusyId(null);
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  }

  function handleDelete(id: string) {
    setError(null);
    setBusyId(id);
    startTransition(async () => {
      await deleteCredential(id);
      setBusyId(null);
      router.refresh();
    });
  }

  return (
    <div>
      {credentials.length === 0 ? (
        <div className="rounded-xl border border-ink/15 p-6 text-center">
          <p className="label-mono text-sm text-ink/60">No provider credentials on file</p>
        </div>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-ink/20 text-left">
              <th className="label-mono py-2 pr-4 text-xs font-medium text-ink/60">Provider</th>
              <th className="label-mono py-2 pr-4 text-xs font-medium text-ink/60">Key</th>
              <th className="label-mono py-2 pr-4 text-xs font-medium text-ink/60">Status</th>
              <th className="label-mono py-2 pr-4 text-xs font-medium text-ink/60">Last verified</th>
              <th className="label-mono py-2 pr-4 text-xs font-medium text-ink/60">Last used</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody className="font-mono">
            {credentials.map((c) => (
              <tr key={c.id} className="border-b border-ink/10">
                <td className="py-2 pr-4">{c.providerId}</td>
                <td className="py-2 pr-4 text-ink/70">••••{c.apiKeyLast4}</td>
                <td className="py-2 pr-4">
                  <Stamp tone={statusTone(c.status)}>{c.status}</Stamp>
                </td>
                <td className="py-2 pr-4 text-xs text-ink/60">{formatDate(c.lastVerifiedAt)}</td>
                <td className="py-2 pr-4 text-xs text-ink/60">{formatDate(c.lastUsedAt)}</td>
                <td className="py-2">
                  <div className="flex gap-2">
                    {c.status === "active" && (
                      <>
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={pending && busyId === c.id}
                          onClick={() => handleVerify(c.id, c.providerId)}
                        >
                          {busyId === c.id && pending ? "Verifying…" : "Verify"}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={pending && busyId === c.id}
                          onClick={() => handleDisable(c.id)}
                        >
                          Disable
                        </Button>
                      </>
                    )}
                    {c.status === "disabled" && (
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={pending && busyId === c.id}
                        onClick={() => handleEnable(c.id)}
                      >
                        {busyId === c.id && pending ? "Enabling…" : "Enable"}
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="danger"
                      disabled={pending && busyId === c.id}
                      onClick={() => handleDelete(c.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <form onSubmit={handleSave} className="mt-8 max-w-md rounded-xl border border-ink/15 p-6">
        <h2 className="label-mono mb-4 text-sm font-semibold text-ink">Add / rotate key</h2>
        <div className="flex flex-col gap-4">
          <Field label="Provider">
            <Select value={providerId} onChange={(e) => setProviderId(e.target.value as ProviderId)}>
              {LIVE_PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="API key" hint="Never logged or displayed again after saving (C-11).">
            <Input
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </Field>
          <Field label="Base URL override" hint="Optional — leave blank to use the provider default.">
            <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.deepseek.com" />
          </Field>
          <Field label="Model override" hint="Optional — leave blank to use the provider default.">
            <Input value={defaultModel} onChange={(e) => setDefaultModel(e.target.value)} placeholder="deepseek-v4-flash" />
          </Field>
          {error && <p className="font-mono text-xs text-danger">{error}</p>}
          <Button type="submit" disabled={pending || !apiKey}>
            {pending && busyId === null ? "Saving…" : "Save key"}
          </Button>
        </div>
      </form>
    </div>
  );
}
