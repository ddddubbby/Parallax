"use client";

import { useParams } from "next/navigation";
import { useEffect } from "react";
import { ErrorFallback } from "@/components/error-fallback";
import { reportError } from "@/observability";

// Project-scoped boundary: matrix / dashboard / runs / report / resonance
// render failures keep a path back into the product without a browser refresh.
// Kind-agnostic — audit and resonance share this fallback (no C-12 chrome here).
export default function ProjectError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const params = useParams<{ id: string }>();
  const projectId = typeof params?.id === "string" ? params.id : null;

  useEffect(() => {
    reportError(error, { boundary: "project", projectId });
  }, [error, projectId]);

  const links = projectId
    ? [
        { href: `/projects/${projectId}`, label: "Back to this project" },
        { href: "/projects", label: "All projects" },
      ]
    : [{ href: "/projects", label: "Return to projects" }];

  return (
    <ErrorFallback
      stamp="ERROR / PROJECT VIEW FAULT"
      description="This project view hit an unexpected error. Retry it, or step back to the project or the projects list. Your saved data is untouched."
      digest={error.digest}
      onRetry={reset}
      links={links}
    />
  );
}
