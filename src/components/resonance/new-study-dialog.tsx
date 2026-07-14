"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Button, Field, InlineStatus, Input, Stamp } from "@/components/ui";
import { AppDialog } from "@/components/ui/dialog";
import { RESONANCE_STUDY_TEMPLATES } from "@/core/resonance-templates";
import {
  createStudyAction,
  createStudyFromTemplateAction,
} from "@/modules/resonance/actions";

/** M32 / D-088: Blank or Template creation; form actions redirect to design. */
export function NewStudyDialog({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"blank" | "template">("blank");
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
    startTransition(async () => finish(await createStudyAction(projectId, formData)));
  }

  function createTemplate(templateId: string) {
    setError(null);
    const formData = new FormData();
    formData.set("templateId", templateId);
    setPendingKey(templateId);
    startTransition(async () => finish(await createStudyFromTemplateAction(projectId, formData)));
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        New study
      </Button>
      <AppDialog
        open={open}
        onOpenChange={setOpen}
        title="New study"
        description="Start blank or from a template. Creation opens the design workspace."
        className="w-[min(100%-2rem,36rem)]"
      >
        <div className="mb-4 flex gap-2" role="group" aria-label="Study creation mode">
          <Button
            type="button"
            variant={mode === "blank" ? "primary" : "secondary"}
            aria-pressed={mode === "blank"}
            onClick={() => { setMode("blank"); setError(null); }}
          >
            Blank
          </Button>
          <Button
            type="button"
            variant={mode === "template" ? "primary" : "secondary"}
            aria-pressed={mode === "template"}
            onClick={() => { setMode("template"); setError(null); }}
          >
            Template
          </Button>
        </div>

        {error && <InlineStatus tone="danger">{error}</InlineStatus>}

        {mode === "blank" ? (
          <form onSubmit={createBlank} className="mt-3 flex flex-col gap-3">
            <Field label="Study name">
              <Input
                ref={nameRef}
                name="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="AI-framing repair study"
                required
              />
            </Field>
            <Button type="submit" pending={pending && pendingKey === "blank"} pendingLabel="Creating draft">
              Create draft
            </Button>
          </form>
        ) : (
          <div className="mt-3 grid max-h-[24rem] gap-3 overflow-y-auto" aria-label="Study templates">
            {RESONANCE_STUDY_TEMPLATES.map((template) => (
              <article
                key={template.id}
                className="rounded-lg border border-ink/10 bg-paper-2/40 p-3"
              >
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <h3 className="label-mono text-xs font-semibold text-ink/75">{template.name}</h3>
                  {template.default && <Stamp tone="accent">DEFAULT</Stamp>}
                </div>
                <p className="text-sm leading-6 text-ink/70">{template.summary}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {template.stimuli.map((stimulus) => (
                    <Stamp key={`${template.id}-${stimulus.label}`} tone="ink">
                      {stimulus.kind}
                    </Stamp>
                  ))}
                </div>
                <div className="mt-3">
                  <Button
                    type="button"
                    variant={template.default ? "primary" : "secondary"}
                    pending={pending && pendingKey === template.id}
                    pendingLabel={`Creating ${template.name}`}
                    disabled={pending && pendingKey !== template.id}
                    onClick={() => createTemplate(template.id)}
                  >
                    Create draft
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </AppDialog>
    </>
  );
}
