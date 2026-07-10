"use client";

import { useRouter } from "next/navigation";
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

  function push(next: { stimulus?: string; persona?: string }) {
    router.push(
      withViewParam(base, "evidence", {
        engine,
        stimulus: next.stimulus,
        persona: next.persona,
        page: "1",
      }),
    );
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1">
        <span className="label-mono text-[10px] text-ink/45">Stimulus</span>
        <select
          className="label-mono rounded-lg border border-ink/20 bg-paper px-3 py-1.5 text-xs"
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
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="label-mono text-[10px] text-ink/45">Persona</span>
        <select
          className="label-mono rounded-lg border border-ink/20 bg-paper px-3 py-1.5 text-xs"
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
        </select>
      </label>
    </div>
  );
}
