"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui";

export type EmptyStateKind = "first-use" | "filtered-zero" | "unavailable" | "completed-success";

type EmptyStateAction =
  | { href: string; label: string; onClick?: never; pending?: never; pendingLabel?: never; disabled?: never }
  | {
      onClick: () => void;
      label: string;
      href?: never;
      pending?: boolean;
      pendingLabel?: string;
      disabled?: boolean;
    };

function cx(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

const kindBorder: Record<EmptyStateKind, string> = {
  "first-use": "border-ink/15",
  "filtered-zero": "border-ink/15",
  unavailable: "border-warn",
  "completed-success": "border-ink/15",
};

/** Shared dossier empty surface — one teach sentence, optional single CTA. */
export function EmptyState({
  kind,
  title,
  children,
  action,
  className,
}: {
  kind: EmptyStateKind;
  title: string;
  children: ReactNode;
  action?: EmptyStateAction;
  className?: string;
}) {
  const ctaClass =
    "interactive-press label-mono mt-4 inline-flex min-h-11 items-center rounded-full px-5 py-2 text-xs transition-micro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

  return (
    <div
      className={cx(
        "rounded-xl border px-5 py-10 text-center",
        kindBorder[kind],
        className,
      )}
    >
      <p className="label-mono text-sm text-ink/70">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink/60">{children}</p>
      {action &&
        ("href" in action && action.href ? (
          <Link
            href={action.href}
            className={cx(
              ctaClass,
              kind === "filtered-zero"
                ? "border border-ink/30 text-ink hover:border-ink"
                : "bg-accent text-ink hover:bg-accent/90",
            )}
          >
            {action.label}
          </Link>
        ) : (
          <Button
            type="button"
            variant={kind === "filtered-zero" ? "secondary" : "primary"}
            className="mt-4"
            onClick={action.onClick}
            pending={action.pending}
            pendingLabel={action.pendingLabel}
            disabled={action.disabled}
          >
            {action.label}
          </Button>
        ))}
    </div>
  );
}
