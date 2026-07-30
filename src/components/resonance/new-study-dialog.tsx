"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Button, Field, InlineStatus, Input } from "@/components/ui";
import { AppDialog } from "@/components/ui/dialog";
import { createMessageLiftTestAction } from "@/modules/resonance/actions";

/** M32 / D-088: Blank or Template creation; form actions redirect to design. */
export function NewStudyDialog({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [testType, setTestType] = useState<"buyer_response" | "ai_recommendation">("buyer_response");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const nameRef = useRef<HTMLInputElement>(null);

  function finish(result: { ok: boolean; id?: string; error?: string }) {
    if (!result.ok || !result.id) {
      setError(result.error ?? "Study creation did not complete. Retry without re-entering your work.");
      setPendingKey(null);
      return;
    }
    router.push(`/projects/${projectId}/resonance/${result.id}?view=design`);
  }

  function createBlank(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Study name is required.");
      nameRef.current?.focus();
      return;
    }
    const formData = new FormData();
    formData.set("name", name);
    setPendingKey("blank");
    formData.set("testType", testType);
    startTransition(async () => finish(await createMessageLiftTestAction(projectId, formData)));
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        New test
      </Button>
      <AppDialog
        open={open}
        onOpenChange={setOpen}
        title="New Message Lift test"
        description="Compare what AI says today with one new message."
        className="w-[min(100%-2rem,36rem)]"
      >
        <div className="mb-4 grid gap-3 sm:grid-cols-2" role="group" aria-label="Message Lift test type">
          <Button
            type="button"
            variant={testType === "buyer_response" ? "primary" : "secondary"}
            aria-pressed={testType === "buyer_response"}
            onClick={() => { setTestType("buyer_response"); setError(null); }}
          >
            Buyer response
          </Button>
          <Button
            type="button"
            variant={testType === "ai_recommendation" ? "primary" : "secondary"}
            aria-pressed={testType === "ai_recommendation"}
            onClick={() => { setTestType("ai_recommendation"); setError(null); }}
          >
            AI recommendation
          </Button>
        </div>
        <p className="mb-4 text-sm leading-6 text-ink/65">
          {testType === "buyer_response"
            ? "See whether the new message improves simulated buyer response."
            : "See whether the new message increases the brand's top-five or top-choice inclusion when supplied to an AI model."}
        </p>

        {error && <InlineStatus tone="danger">{error}</InlineStatus>}

          <form onSubmit={createBlank} className="mt-3 flex flex-col gap-3">
            <Field label="Test name">
              <Input
                ref={nameRef}
                name="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={testType === "buyer_response" ? "Buyer response lift" : "AI shortlist lift"}
                required
              />
            </Field>
            <Button type="submit" pending={pending && pendingKey === "blank"} pendingLabel="Creating draft">
              Create test
            </Button>
          </form>
      </AppDialog>
    </>
  );
}
