"use client";

import { useEffect } from "react";
import { ErrorFallback } from "@/components/error-fallback";
import { reportError } from "@/observability";
import "./globals.css";

// Root-layout / global failure boundary. Unlike error.tsx this REPLACES the
// root layout, so it must render its own <html> and <body>. Only mounts in
// production — in dev the Next error overlay pre-empts it (validate via
// `pnpm build` + `pnpm start`, not the dev server).
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportError(error, { boundary: "global" });
  }, [error]);

  return (
    <html lang="en">
      <body>
        <ErrorFallback
          stamp="ERROR / SYSTEM FAULT"
          heading="The application hit a fault"
          digest={error.digest}
          onRetry={reset}
        />
      </body>
    </html>
  );
}
