import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

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
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
}) {
  const variants = {
    primary: "bg-accent text-paper hover:bg-accent/90",
    secondary: "border border-ink/30 text-ink hover:border-ink",
    danger: "border border-danger text-danger hover:bg-danger hover:text-paper",
    ghost: "text-ink/70 hover:text-ink",
  } as const;
  return (
    <button
      className={cx(
        "label-mono cursor-pointer rounded-full px-5 py-2 text-xs transition-micro disabled:cursor-not-allowed disabled:opacity-50",
        focusRing,
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

const fieldBase =
  "w-full rounded-lg border border-ink/20 bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink/40";

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(fieldBase, focusRing, className)} {...props} />;
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea rows={3} className={cx(fieldBase, focusRing, className)} {...props} />
  );
}

export function Select({
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx(fieldBase, focusRing, className)} {...props} />;
}

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
    <div className="flex flex-col gap-1.5">
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
    </div>
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
    accent: "border-accent bg-accent text-paper",
    warn: "border-warn text-warn",
    danger: "border-danger text-danger",
    ok: "border-ok text-ok",
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
