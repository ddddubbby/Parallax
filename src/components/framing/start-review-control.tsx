"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, InlineStatus } from "@/components/ui";
import { createFramingStudyAction } from "@/modules/framing/actions";

export function StartReviewControl({
  projectId,
  sourceRunId,
}: {
  projectId: string;
  sourceRunId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function startReview() {
    setError(null);
    startTransition(async () => {
      const result = await createFramingStudyAction(projectId, sourceRunId);
      if (!result.ok || !result.id) {
        setError(result.ok ? "Review creation did not complete. Retry this run." : result.error);
        return;
      }
      router.push(`/projects/${projectId}/framing/${result.id}`);
    });
  }

  return (
    <div className="ml-auto flex min-w-0 flex-col items-end gap-2">
      <Button
        type="button"
        pending={pending}
        pendingLabel="Starting review"
        onClick={startReview}
      >
        Start review →
      </Button>
      {error && <InlineStatus tone="danger">{error}</InlineStatus>}
    </div>
  );
}
