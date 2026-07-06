"use client";

import Link from "next/link";
import { Button } from "@/components/ui";

// Shared recovery surface for App Router error boundaries. Matches
// src/app/not-found.tsx (dossier framing, mono labels, accent only on the
// primary action). The error stamp uses semantic --danger (V-2: danger encodes
// error/severity; accent stays reserved for the retry action).
//
// Never render raw error.message for server-thrown production errors — Next
// replaces it with a generic string and exposes only a digest. Callers pass the
// digest for support correlation; no stack, secret, or provider payload appears.

export function ErrorFallback({
  stamp = "ERROR / UNEXPECTED FAULT",
  heading = "Something went wrong",
  description = "This view hit an unexpected error. Retry the current page, or return to a known-good screen. Nothing you were viewing has been changed.",
  digest,
  onRetry,
  links = [{ href: "/projects", label: "Return to projects" }],
}: {
  stamp?: string;
  heading?: string;
  description?: string;
  digest?: string;
  onRetry?: () => void;
  links?: Array<{ href: string; label: string }>;
}) {
  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <p className="label-mono text-xs text-danger">{stamp}</p>
      <h1 className="mt-4 font-mono text-3xl font-semibold text-ink">{heading}</h1>
      <p className="mt-3 max-w-xl text-sm text-ink/65">{description}</p>
      {digest && (
        <p className="mt-4 font-mono text-xs text-ink/45">
          Reference:{" "}
          <span className="text-ink/70" data-testid="error-digest">
            {digest}
          </span>
        </p>
      )}
      <div className="mt-8 flex flex-wrap items-center gap-3">
        {onRetry && (
          <Button variant="primary" onClick={onRetry}>
            Retry
          </Button>
        )}
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="label-mono inline-flex rounded-full border border-ink/30 px-5 py-2 text-xs text-ink transition-micro hover:border-ink"
          >
            {l.label}
          </Link>
        ))}
      </div>
    </main>
  );
}
