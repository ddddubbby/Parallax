"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AppDialog } from "@/components/ui/dialog";
import { AppMenu, AppMenuItem, AppMenuSeparator } from "@/components/ui/menu";
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
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"add" | "rotate">("add");
  const [lockedProvider, setLockedProvider] = useState<ProviderId | null>(null);

  const [providerId, setProviderId] = useState<ProviderId>("deepseek");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [defaultModel, setDefaultModel] = useState("");

  function openAdd() {
    setDialogMode("add");
    setLockedProvider(null);
    setProviderId("deepseek");
    setApiKey("");
    setBaseUrl("");
    setDefaultModel("");
    setError(null);
    setDialogOpen(true);
  }

  function openRotate(row: CredentialRow) {
    setDialogMode("rotate");
    setLockedProvider(row.providerId);
    setProviderId(row.providerId);
    setApiKey("");
    setBaseUrl(row.baseUrl ?? "");
    setDefaultModel(row.defaultModel ?? "");
    setError(null);
    setDialogOpen(true);
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const targetProvider = dialogMode === "rotate" && lockedProvider ? lockedProvider : providerId;
    startTransition(async () => {
      const result = await saveCredential(targetProvider, apiKey, {
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
      setDialogOpen(false);
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
      const result = await disableCredential(id);
      setBusyId(null);
      if (!result.ok) setError(result.error);
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
      const result = await deleteCredential(id);
      setBusyId(null);
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="font-mono text-xs text-ink/50">
          Keys stay encrypted at rest and never return to the browser (C-11).
        </p>
        <Button type="button" onClick={openAdd}>
          Add provider
        </Button>
      </div>

      {error && !dialogOpen && (
        <p className="mb-4 font-mono text-xs text-danger">{error}</p>
      )}

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
                  <AppMenu
                    trigger={
                      <Button type="button" variant="ghost" aria-label={`More actions for ${c.providerId}`}>
                        More
                      </Button>
                    }
                  >
                    {c.status === "active" && (
                      <>
                        <AppMenuItem onSelect={() => handleVerify(c.id, c.providerId)}>
                          {busyId === c.id && pending ? "Verifying…" : "Verify"}
                        </AppMenuItem>
                        <AppMenuItem onSelect={() => openRotate(c)}>Rotate key</AppMenuItem>
                        <AppMenuItem onSelect={() => handleDisable(c.id)}>Disable</AppMenuItem>
                      </>
                    )}
                    {c.status === "disabled" && (
                      <AppMenuItem onSelect={() => handleEnable(c.id)}>
                        {busyId === c.id && pending ? "Enabling…" : "Enable"}
                      </AppMenuItem>
                    )}
                    {c.status !== "active" && c.status !== "disabled" && (
                      <AppMenuItem onSelect={() => openRotate(c)}>Rotate key</AppMenuItem>
                    )}
                    <AppMenuSeparator />
                    <AppMenuItem destructive onSelect={() => handleDelete(c.id)}>
                      Delete
                    </AppMenuItem>
                  </AppMenu>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <AppDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={dialogMode === "rotate" ? "Rotate key" : "Add provider"}
        description={
          dialogMode === "rotate"
            ? "Provider is locked. Enter the replacement key — the previous secret is never shown."
            : "Store an encrypted API key for a live provider (C-11)."
        }
      >
        <form onSubmit={handleSave} className="flex flex-col gap-4">
          <Field label="Provider">
            <Select
              value={providerId}
              disabled={dialogMode === "rotate"}
              onChange={(e) => setProviderId(e.target.value as ProviderId)}
            >
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
            <Input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.deepseek.com"
            />
          </Field>
          <Field label="Model override" hint="Optional — leave blank to use the provider default.">
            <Input
              value={defaultModel}
              onChange={(e) => setDefaultModel(e.target.value)}
              placeholder="deepseek-v4-flash"
            />
          </Field>
          {error && <p className="font-mono text-xs text-danger">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={pending || !apiKey}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </AppDialog>
    </div>
  );
}
