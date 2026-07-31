"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/core/cn";
import { Button } from "@/components/ui";

export function AppDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="app-dialog-overlay fixed inset-0 z-40 bg-ink/40" />
        <Dialog.Content
          className={cn(
            "app-dialog-content fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[min(100%-2rem,28rem)] overflow-y-auto rounded-xl border border-ink/15 bg-paper p-5 shadow-lg focus:outline-none",
            className,
          )}
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="label-mono text-sm font-semibold text-ink">{title}</Dialog.Title>
              {description && (
                <Dialog.Description className="mt-1 text-sm leading-relaxed text-ink/60">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close
              className="interactive-press -m-2 flex min-h-11 min-w-11 items-center justify-center rounded-full text-ink/50 transition-micro hover:bg-ink/5 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              aria-label="Close"
            >
              <X className="h-4 w-4" aria-hidden />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function AppConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  details,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "danger",
  pending = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** Optional scrollable body between description and actions (e.g. prompt samples). */
  details?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "primary" | "danger";
  pending?: boolean;
  onConfirm: () => void | Promise<void>;
}) {
  return (
    <AppDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
      title={title}
      description={description}
      className={details ? "w-[min(100%-2rem,36rem)]" : undefined}
    >
      {details ? (
        <div className="mb-4 max-h-48 overflow-y-auto rounded-lg border border-ink/10 bg-paper-2/40 p-3 text-sm text-ink/75">
          {details}
        </div>
      ) : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="secondary"
          onClick={() => onOpenChange(false)}
          disabled={pending}
        >
          {cancelLabel}
        </Button>
        <Button
          type="button"
          variant={tone}
          pending={pending}
          pendingLabel="Working…"
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </div>
    </AppDialog>
  );
}
