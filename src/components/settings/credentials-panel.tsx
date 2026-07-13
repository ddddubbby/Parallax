"use client";

import { useRouter } from "next/navigation";
import { Fragment, useRef, useState, useTransition } from "react";
import { AppConfirmDialog, AppDialog } from "@/components/ui/dialog";
import { AppMenu, AppMenuItem, AppMenuSeparator } from "@/components/ui/menu";
import { Button, Field, InlineStatus, Input, Select, Stamp } from "@/components/ui";
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
  return new Date(d).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
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
  const [notice, setNotice] = useState<string | null>(null);
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [rowStatus, setRowStatus] = useState<{
    id: string;
    tone: "success" | "danger";
    message: string;
  } | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"add" | "rotate">("add");
  const [lockedProvider, setLockedProvider] = useState<ProviderId | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CredentialRow | null>(null);

  const [providerId, setProviderId] = useState<ProviderId>("deepseek");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [defaultModel, setDefaultModel] = useState("");
  const apiKeyRef = useRef<HTMLInputElement>(null);
  const baseUrlRef = useRef<HTMLInputElement>(null);
  const deleteTriggerRef = useRef<HTMLElement | null>(null);

  function openAdd() {
    setDialogMode("add");
    setLockedProvider(null);
    setProviderId("deepseek");
    setApiKey("");
    setBaseUrl("");
    setDefaultModel("");
    setDialogError(null);
    setNotice(null);
    setDialogOpen(true);
  }

  function openRotate(row: CredentialRow) {
    setDialogMode("rotate");
    setLockedProvider(row.providerId);
    setProviderId(row.providerId);
    setApiKey("");
    setBaseUrl(row.baseUrl ?? "");
    setDefaultModel(row.defaultModel ?? "");
    setDialogError(null);
    setNotice(null);
    setDialogOpen(true);
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setDialogError(null);
    if (!apiKey.trim()) {
      setDialogError("API key is required");
      apiKeyRef.current?.focus();
      return;
    }
    const targetProvider = dialogMode === "rotate" && lockedProvider ? lockedProvider : providerId;
    const key = `dialog:${targetProvider}`;
    setActionKey(key);
    startTransition(async () => {
      const result = await saveCredential(targetProvider, apiKey, {
        baseUrl: baseUrl || undefined,
        defaultModel: defaultModel || undefined,
      }).catch(() => ({ ok: false as const, error: "Credential save did not complete. Retry." }));
      setActionKey(null);
      if (!result.ok) {
        setDialogError(result.error);
        if (result.error.toLowerCase().includes("base url")) baseUrlRef.current?.focus();
        else apiKeyRef.current?.focus();
        return;
      }
      setApiKey("");
      setBaseUrl("");
      setDefaultModel("");
      setDialogOpen(false);
      setNotice(
        `${LIVE_PROVIDERS.find((provider) => provider.id === targetProvider)?.displayName ?? targetProvider} credential ${dialogMode === "rotate" ? "rotated" : "saved"}.`,
      );
      router.refresh();
    });
  }

  function runRowAction(
    row: CredentialRow,
    action: "verify" | "disable" | "enable",
    operation: () => Promise<{ ok: true } | { ok: false; error: string }>,
    successMessage: string,
  ) {
    setNotice(null);
    setRowStatus(null);
    const key = `${row.id}:${action}`;
    setActionKey(key);
    startTransition(async () => {
      const result = await operation().catch(() => ({
        ok: false as const,
        error: "Credential action did not complete. Retry.",
      }));
      setActionKey(null);
      setRowStatus({
        id: row.id,
        tone: result.ok ? "success" : "danger",
        message: result.ok ? successMessage : result.error,
      });
      router.refresh();
    });
  }

  function handleVerify(row: CredentialRow) {
    runRowAction(
      row,
      "verify",
      () => verifyCredential(row.id, row.providerId),
      `${row.providerId} key verified — live call succeeded.`,
    );
  }

  function handleDisable(row: CredentialRow) {
    runRowAction(row, "disable", () => disableCredential(row.id), `${row.providerId} credential disabled.`);
  }

  function handleEnable(row: CredentialRow) {
    runRowAction(row, "enable", () => enableCredential(row.id), `${row.providerId} credential enabled.`);
  }

  function openDelete(row: CredentialRow) {
    setNotice(null);
    setRowStatus(null);
    deleteTriggerRef.current = document.querySelector(
      `[aria-label="More actions for ${row.providerId}"]`,
    );
    setDeleteTarget(row);
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    const key = `${target.id}:delete`;
    setActionKey(key);
    startTransition(async () => {
      const result = await deleteCredential(target.id).catch(() => ({
        ok: false as const,
        error: "Credential deletion did not complete. Retry.",
      }));
      setActionKey(null);
      if (!result.ok) {
        setDeleteTarget(null);
        setRowStatus({ id: target.id, tone: "danger", message: result.error });
        window.setTimeout(() => deleteTriggerRef.current?.focus(), 0);
        return;
      }
      setDeleteTarget(null);
      setNotice(`${target.providerId} credential deleted.`);
      window.setTimeout(() => deleteTriggerRef.current?.focus(), 0);
      router.refresh();
    });
  }

  const dialogPending = pending && actionKey?.startsWith("dialog:");
  const deletePending = pending && deleteTarget !== null && actionKey === `${deleteTarget.id}:delete`;

  return (
    <div>
      <div className="mb-4 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <p className="max-w-2xl text-sm leading-relaxed text-ink/60">
          Keys stay encrypted at rest and never return to the browser (C-11).
        </p>
        <Button type="button" onClick={openAdd}>
          Add provider
        </Button>
      </div>

      {notice && !dialogOpen && (
        <InlineStatus tone="success" className="mb-4">{notice}</InlineStatus>
      )}

      {credentials.length === 0 ? (
        <div className="rounded-xl border border-ink/15 p-6 text-center">
          <p className="label-mono text-sm text-ink/60">No provider credentials on file</p>
        </div>
      ) : (
        <div
          role="region"
          aria-label="Provider credential table"
          tabIndex={0}
          className="overflow-x-auto rounded-xl border border-ink/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
        <table className="min-w-[54rem] w-full border-collapse text-sm">
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
              <Fragment key={c.id}>
              <tr className="border-b border-ink/10">
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
                      <Button
                        type="button"
                        variant="ghost"
                        pending={pending && actionKey?.startsWith(`${c.id}:`)}
                        pendingLabel="Working…"
                        aria-label={`More actions for ${c.providerId}`}
                      >
                        More
                      </Button>
                    }
                  >
                    {c.status === "active" && (
                      <>
                        <AppMenuItem onSelect={() => handleVerify(c)}>
                          {actionKey === `${c.id}:verify` && pending ? "Verifying…" : "Verify"}
                        </AppMenuItem>
                        <AppMenuItem onSelect={() => openRotate(c)}>Rotate key</AppMenuItem>
                        <AppMenuItem onSelect={() => handleDisable(c)}>Disable</AppMenuItem>
                      </>
                    )}
                    {c.status === "disabled" && (
                      <AppMenuItem onSelect={() => handleEnable(c)}>
                        {actionKey === `${c.id}:enable` && pending ? "Enabling…" : "Enable"}
                      </AppMenuItem>
                    )}
                    {c.status !== "active" && c.status !== "disabled" && (
                      <AppMenuItem onSelect={() => openRotate(c)}>Rotate key</AppMenuItem>
                    )}
                    <AppMenuSeparator />
                    <AppMenuItem destructive onSelect={() => openDelete(c)}>
                      Delete
                    </AppMenuItem>
                  </AppMenu>
                </td>
              </tr>
              {rowStatus?.id === c.id && (
                <tr>
                  <td colSpan={6} className="px-3 py-2">
                    <InlineStatus tone={rowStatus.tone}>{rowStatus.message}</InlineStatus>
                  </td>
                </tr>
              )}
              </Fragment>
            ))}
          </tbody>
        </table>
        </div>
      )}

      <AppDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!dialogPending) setDialogOpen(open);
        }}
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
              ref={apiKeyRef}
              type="password"
              autoComplete="off"
              value={apiKey}
              aria-invalid={dialogError?.toLowerCase().includes("api key") || undefined}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </Field>
          <Field label="Base URL override" hint="Optional — leave blank to use the provider default.">
            <Input
              ref={baseUrlRef}
              value={baseUrl}
              aria-invalid={dialogError?.toLowerCase().includes("base url") || undefined}
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
          {dialogError && <InlineStatus tone="danger">{dialogError}</InlineStatus>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button type="submit" pending={dialogPending} pendingLabel="Saving…">
              Save changes
            </Button>
            <Button type="button" variant="secondary" disabled={dialogPending} onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </AppDialog>

      <AppConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            window.setTimeout(() => deleteTriggerRef.current?.focus(), 0);
          }
        }}
        title={`Delete ${LIVE_PROVIDERS.find((provider) => provider.id === deleteTarget?.providerId)?.displayName ?? "provider"} credential?`}
        description="This permanently removes the encrypted credential. Runs that need this provider will remain blocked until a new key is added."
        confirmLabel={`Delete ${LIVE_PROVIDERS.find((provider) => provider.id === deleteTarget?.providerId)?.displayName ?? "provider"} credential`}
        pending={deletePending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
