"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Select } from "@/components/ui";
import { withViewParam } from "@/core/views";

export function EvidenceFilters({
  base,
  engine,
  stimulus,
  persona,
  stimuli,
  personas,
}: {
  base: string;
  engine?: string;
  stimulus?: string;
  persona?: string;
  stimuli: Array<{ id: string; label: string }>;
  personas: Array<{ key: string; label: string }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function push(next: { stimulus?: string; persona?: string }) {
    startTransition(() => {
      router.push(
        withViewParam(base, "evidence", {
          engine,
          stimulus: next.stimulus,
          persona: next.persona,
          page: "1",
        }),
      );
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-3" aria-busy={pending}>
      <label className="flex flex-col gap-1">
        <span className="label-mono text-xs text-ink/65">Stimulus</span>
        <Select
          disabled={pending}
          value={stimulus ?? ""}
          onChange={(e) =>
            push({ stimulus: e.target.value || undefined, persona })
          }
        >
          <option value="">All stimuli</option>
          {stimuli.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </Select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="label-mono text-xs text-ink/65">Persona</span>
        <Select
          disabled={pending}
          value={persona ?? ""}
          onChange={(e) =>
            push({ stimulus, persona: e.target.value || undefined })
          }
        >
          <option value="">All personas</option>
          {personas.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </Select>
      </label>
    </div>
  );
}
