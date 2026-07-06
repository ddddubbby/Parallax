"use client";

import { useEffect } from "react";
import { ErrorFallback } from "@/components/error-fallback";
import { reportError } from "@/observability";

// Broad product fallback for route-segment render failures (App Router
// error.tsx convention). Catches errors thrown below the root layout; root
// layout / global failures fall through to global-error.tsx.
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportError(error, { boundary: "app" });
  }, [error]);

  return <ErrorFallback digest={error.digest} onRetry={reset} />;
}
