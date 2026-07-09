"use client";

import { useState } from "react";
import { Button, Field, Input, Stamp } from "@/components/ui";
import { AppDialog } from "@/components/ui/dialog";
import { RESONANCE_STUDY_TEMPLATES } from "@/core/resonance-templates";
import {
  createStudyFormAction,
  createStudyFromTemplateFormAction,
} from "@/modules/resonance/actions";

/** M32 / D-088: Blank or Template creation; form actions redirect to design. */
export function NewStudyDialog({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"blank" | "template">("blank");

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
        <div className="mb-4 flex gap-2">
          <Button
            type="button"
            variant={mode === "blank" ? "primary" : "secondary"}
            onClick={() => setMode("blank")}
          >
            Blank
          </Button>
          <Button
            type="button"
            variant={mode === "template" ? "primary" : "secondary"}
            onClick={() => setMode("template")}
          >
            Template
          </Button>
        </div>

        {mode === "blank" ? (
          <form action={createStudyFormAction.bind(null, projectId)} className="flex flex-col gap-3">
            <Field label="Study name">
              <Input name="name" placeholder="AI-framing repair study" required />
            </Field>
            <Button type="submit">Create draft</Button>
          </form>
        ) : (
          <div className="grid max-h-[24rem] gap-3 overflow-y-auto">
            {RESONANCE_STUDY_TEMPLATES.map((template) => (
              <form
                key={template.id}
                action={createStudyFromTemplateFormAction.bind(null, projectId)}
                className="rounded-lg border border-ink/10 bg-paper-2/40 p-3"
              >
                <input type="hidden" name="templateId" value={template.id} />
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
                  <Button type="submit" variant={template.default ? "primary" : "secondary"}>
                    Create draft
                  </Button>
                </div>
              </form>
            ))}
          </div>
        )}
      </AppDialog>
    </>
  );
}
