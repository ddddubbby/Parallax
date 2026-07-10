"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type UnsavedEditContextValue = {
  dirty: boolean;
  setDirty: (dirty: boolean) => void;
};

const UnsavedEditContext = createContext<UnsavedEditContextValue | null>(null);

/**
 * M33 / D-089: track explicit-edit dirty state for Setup (and similar forms).
 * Autosaved intake is exempt — only wire this around Edit/Save changes flows.
 */
export function UnsavedEditProvider({ children }: { children: ReactNode }) {
  const [dirty, setDirtyState] = useState(false);
  const setDirty = useCallback((next: boolean) => setDirtyState(next), []);
  const value = useMemo(() => ({ dirty, setDirty }), [dirty, setDirty]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  return <UnsavedEditContext.Provider value={value}>{children}</UnsavedEditContext.Provider>;
}

export function useUnsavedEdit() {
  const ctx = useContext(UnsavedEditContext);
  if (!ctx) {
    return {
      dirty: false,
      setDirty: (_dirty: boolean) => {},
    };
  }
  return ctx;
}

/** Lightweight always-visible signal near Save changes / Cancel. */
export function UnsavedChangesSignal({ className }: { className?: string }) {
  const { dirty } = useUnsavedEdit();
  if (!dirty) return null;
  return (
    <span className={className ?? "label-mono text-[11px] text-warn"} role="status">
      Unsaved changes
    </span>
  );
}
