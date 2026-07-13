"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, InlineStatus, Input } from "@/components/ui";
import { login } from "@/modules/auth/actions";

// Ink surface per DESIGN_GUIDELINES §6: auth screens are an explicit
// ink-surface use case, not the paper workbench.
export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await login(password);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push("/projects");
      router.refresh();
    });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-ink px-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-xl border border-paper/20 p-8"
        aria-busy={pending}
      >
        <p className="label-mono mb-4 text-[11px] text-paper/45">Operator dossier / secure access</p>
        <h1 className="label-mono mb-1 text-lg font-semibold text-paper">Resonance</h1>
        <p className="mb-6 text-sm text-paper/55">
          Parallax measurement engine · Operator access only
        </p>
        <label className="label-mono mb-1.5 block text-xs text-paper/70" htmlFor="password">
          Password
        </label>
        <Input
          id="password"
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "login-error" : undefined}
          disabled={pending}
          className="border-paper/25 bg-ink text-paper placeholder:text-paper/30"
        />
        {error && (
          <InlineStatus id="login-error" tone="danger" className="mt-3 border-danger/50 bg-ink text-danger">
            {error}
          </InlineStatus>
        )}
        <Button
          type="submit"
          disabled={!password}
          pending={pending}
          pendingLabel="Signing in…"
          className="mt-4 w-full"
        >
          Sign in
        </Button>
      </form>
    </main>
  );
}
