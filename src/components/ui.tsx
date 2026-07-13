import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import React from "react";

// Token-backed primitives per DESIGN_GUIDELINES sections 5 and 8. shadcn/ui
// components are adopted when a complex widget (dialog, combobox) arrives.

function cx(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export function Button({
  variant = "primary",
  className,
  pending = false,
  pendingLabel = "Working…",
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  pending?: boolean;
  pendingLabel?: string;
}) {
  const variants = {
    primary: "bg-accent text-ink hover:bg-accent/90",
    secondary: "border border-ink/30 text-ink hover:border-ink",
    danger: "border border-danger text-danger hover:bg-danger hover:text-paper",
    ghost: "text-ink/70 hover:text-ink",
  } as const;
  return (
    <button
      className={cx(
        "interactive-press label-mono min-h-11 cursor-pointer rounded-full px-5 py-2 text-xs transition-micro disabled:cursor-not-allowed disabled:opacity-50",
        focusRing,
        variants[variant],
        className,
      )}
      aria-busy={pending || undefined}
      disabled={disabled || pending}
      {...props}
    >
      <span className="grid place-items-center">
        <span
          className={cx(
            "col-start-1 row-start-1 transition-micro",
            pending && "invisible opacity-0",
          )}
          aria-hidden={pending || undefined}
        >
          {children}
        </span>
        <span
          className={cx(
            "col-start-1 row-start-1 transition-micro",
            pending ? "opacity-100" : "invisible opacity-0",
          )}
          aria-hidden={!pending || undefined}
        >
          {pendingLabel}
        </span>
      </span>
    </button>
  );
}

const fieldBase =
  "w-full rounded-lg border border-ink/20 bg-paper px-3 py-2 text-sm text-ink transition-micro placeholder:text-ink/40 hover:border-ink/40 disabled:cursor-not-allowed disabled:bg-paper-2 disabled:text-ink/45";

export const Input = React.forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, ...props }, ref) {
  return (
    <input ref={ref} className={cx(fieldBase, focusRing, className)} {...props} />
  );
});

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea rows={3} className={cx(fieldBase, focusRing, className)} {...props} />
  );
}

export const Select = React.forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, ...props }, ref) {
  return <select ref={ref} className={cx(fieldBase, focusRing, className)} {...props} />;
});

/** Label above control, danger-mono errors beneath (PS-3, design §8 forms). */
export function Field({
  label,
  errors,
  children,
  hint,
}: {
  label: string;
  errors?: string[];
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label
      className="flex flex-col gap-1.5"
      data-field-error={errors?.length ? "true" : undefined}
    >
      <span className="label-mono text-xs text-ink/70">{label}</span>
      {children}
      {hint && !errors?.length && (
        <span className="font-mono text-xs text-ink/45">{hint}</span>
      )}
      {errors?.map((e) => (
        <span key={e} className="font-mono text-xs text-danger">
          {e}
        </span>
      ))}
    </label>
  );
}

export function InlineStatus({
  tone = "neutral",
  children,
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement> & {
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  const tones = {
    neutral: "border-ink/15 bg-paper-2 text-ink/65",
    success: "border-ok/30 bg-ok/5 text-ok",
    warning: "border-warn/30 bg-warn/5 text-warn",
    danger: "border-danger/30 bg-danger/5 text-danger",
  } as const;
  return (
    <p
      className={cx(
        "rounded-lg border px-3 py-2 text-sm",
        tones[tone],
        className,
      )}
      {...props}
      role={tone === "danger" ? "alert" : "status"}
      aria-live={tone === "danger" ? "assertive" : "polite"}
    >
      {children}
    </p>
  );
}

/** Dossier stamp: 2px radius, mono uppercase (design §8 badges). */
export function Stamp({
  tone = "ink",
  children,
}: {
  tone?: "ink" | "accent" | "warn" | "danger" | "ok";
  children: ReactNode;
}) {
  const tones = {
    ink: "border-ink/40 text-ink/70",
    accent: "border-accent bg-accent text-ink",
    warn: "border-warn text-warn",
    danger: "border-danger text-danger",
    ok: "border-ok text-ink",
  } as const;
  return (
    <span
      className={cx(
        "label-mono inline-block rounded-xs border px-1.5 py-0.5 text-[11px]",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}
