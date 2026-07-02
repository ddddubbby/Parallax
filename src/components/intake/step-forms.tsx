"use client";

import { useState } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import type { FieldErrors, IntakeStepKey } from "@/core/intake";

// Draft value shapes: raw form state, validated server-side on Next (PS-3).

interface BrandDraft {
  name: string;
  aliases: string[];
  domain: string;
  description?: string;
}
interface CompetitorDraft {
  name: string;
  aliases: string[];
  domain: string;
}
interface FactRowDraft {
  type: string;
  statement: string;
  source_note: string;
  source_url: string;
}
interface PersonaDraft {
  title: string;
  company_context: string;
  pain_points: string[];
  buying_criteria: string[];
}

export const STEP_DEFAULTS: Record<IntakeStepKey, unknown> = {
  basics: { name: "", category: "", job_to_be_done: "" },
  client_brand: { name: "", aliases: [], domain: "", description: "" },
  competitors: {
    competitors: [
      { name: "", aliases: [], domain: "" },
      { name: "", aliases: [], domain: "" },
      { name: "", aliases: [], domain: "" },
    ] satisfies CompetitorDraft[],
  },
  fact_sheet: { rows: [] as FactRowDraft[] },
  attributes: { attributes: [] as string[] },
  personas: {
    personas: [
      { title: "", company_context: "", pain_points: [], buying_criteria: [] },
      { title: "", company_context: "", pain_points: [], buying_criteria: [] },
    ] satisfies PersonaDraft[],
  },
  markets: { markets: [] as string[] },
};

/** Chip editor for string lists: aliases, attributes, markets, persona lists. */
function TagListInput({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [text, setText] = useState("");
  function add() {
    const v = text.trim();
    if (!v) return;
    onChange([...value, v]);
    setText("");
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input
          value={text}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button type="button" variant="secondary" onClick={add}>
          Add
        </Button>
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((item, i) => (
            <span
              key={`${item}-${i}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-ink/25 px-2.5 py-0.5 font-mono text-xs"
            >
              {item}
              <button
                type="button"
                aria-label={`Remove ${item}`}
                className="cursor-pointer text-ink/50 hover:text-danger"
                onClick={() => onChange(value.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function errsFor(errors: FieldErrors, key: string) {
  return errors[key];
}

export function StepForm({
  stepKey,
  value,
  errors,
  onChange,
}: {
  stepKey: IntakeStepKey;
  value: unknown;
  errors: FieldErrors;
  onChange: (value: unknown) => void;
}) {
  switch (stepKey) {
    case "basics": {
      const v = value as { name: string; category: string; job_to_be_done: string };
      return (
        <div className="flex max-w-xl flex-col gap-4">
          <Field label="Project / client name" errors={errsFor(errors, "name")}>
            <Input
              value={v.name}
              onChange={(e) => onChange({ ...v, name: e.target.value })}
            />
          </Field>
          <Field
            label="Category"
            hint="e.g. B2B spend management and accounting automation"
            errors={errsFor(errors, "category")}
          >
            <Input
              value={v.category}
              onChange={(e) => onChange({ ...v, category: e.target.value })}
            />
          </Field>
          <Field
            label="Job to be done"
            hint="What the buyer is trying to accomplish"
            errors={errsFor(errors, "job_to_be_done")}
          >
            <Textarea
              value={v.job_to_be_done}
              onChange={(e) => onChange({ ...v, job_to_be_done: e.target.value })}
            />
          </Field>
        </div>
      );
    }
    case "client_brand": {
      const v = value as BrandDraft;
      return (
        <div className="flex max-w-xl flex-col gap-4">
          <Field label="Brand name" errors={errsFor(errors, "name")}>
            <Input
              value={v.name}
              onChange={(e) => onChange({ ...v, name: e.target.value })}
            />
          </Field>
          <Field label="Domain" errors={errsFor(errors, "domain")}>
            <Input
              value={v.domain}
              placeholder="example.com"
              onChange={(e) => onChange({ ...v, domain: e.target.value })}
            />
          </Field>
          <Field label="Aliases" hint="Alternate spellings AI answers might use">
            <TagListInput
              value={v.aliases}
              placeholder="Add an alias"
              onChange={(aliases) => onChange({ ...v, aliases })}
            />
          </Field>
          <Field label="Description" errors={errsFor(errors, "description")}>
            <Textarea
              value={v.description ?? ""}
              onChange={(e) => onChange({ ...v, description: e.target.value })}
            />
          </Field>
        </div>
      );
    }
    case "competitors": {
      const v = value as { competitors: CompetitorDraft[] };
      const list = v.competitors;
      const set = (next: CompetitorDraft[]) => onChange({ competitors: next });
      return (
        <div className="flex flex-col gap-4">
          {errsFor(errors, "competitors")?.map((e) => (
            <p key={e} className="font-mono text-xs text-danger">
              {e}
            </p>
          ))}
          {list.map((c, i) => (
            <div
              key={i}
              className="rounded-xl border border-ink/15 bg-paper-2/50 p-4"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="label-mono text-xs text-ink/60">
                  Competitor {String(i + 1).padStart(2, "0")}
                </span>
                {list.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => set(list.filter((_, j) => j !== i))}
                  >
                    Remove
                  </Button>
                )}
              </div>
              <div className="flex flex-col gap-3">
                <Field label="Name" errors={errsFor(errors, `competitors.${i}.name`)}>
                  <Input
                    value={c.name}
                    onChange={(e) =>
                      set(list.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
                    }
                  />
                </Field>
                <Field label="Domain (optional)">
                  <Input
                    value={c.domain}
                    onChange={(e) =>
                      set(list.map((x, j) => (j === i ? { ...x, domain: e.target.value } : x)))
                    }
                  />
                </Field>
                <Field label="Aliases">
                  <TagListInput
                    value={c.aliases}
                    onChange={(aliases) =>
                      set(list.map((x, j) => (j === i ? { ...x, aliases } : x)))
                    }
                  />
                </Field>
              </div>
            </div>
          ))}
          {list.length < 8 && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => set([...list, { name: "", aliases: [], domain: "" }])}
            >
              Add competitor
            </Button>
          )}
        </div>
      );
    }
    case "fact_sheet": {
      const v = value as { rows: FactRowDraft[] };
      const set = (rows: FactRowDraft[]) => onChange({ rows });
      return (
        <div className="flex flex-col gap-4">
          <p className="max-w-xl text-sm text-ink/70">
            Ground truth about the client brand. AI claims are verified against
            these rows in the misinformation register.
          </p>
          {v.rows.map((row, i) => (
            <div key={i} className="rounded-xl border border-ink/15 bg-paper-2/50 p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="label-mono text-xs text-ink/60">
                  Claim {String(i + 1).padStart(2, "0")}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => set(v.rows.filter((_, j) => j !== i))}
                >
                  Remove
                </Button>
              </div>
              <div className="flex flex-col gap-3">
                <Field label="Type" errors={errsFor(errors, `rows.${i}.type`)}>
                  <Select
                    value={row.type}
                    onChange={(e) =>
                      set(v.rows.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)))
                    }
                  >
                    <option value="pricing">pricing</option>
                    <option value="feature">feature</option>
                    <option value="company_fact">company_fact</option>
                    <option value="security">security</option>
                    <option value="availability">availability</option>
                  </Select>
                </Field>
                <Field label="Statement" errors={errsFor(errors, `rows.${i}.statement`)}>
                  <Textarea
                    value={row.statement}
                    onChange={(e) =>
                      set(v.rows.map((x, j) => (j === i ? { ...x, statement: e.target.value } : x)))
                    }
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Source note (optional)">
                    <Input
                      value={row.source_note}
                      onChange={(e) =>
                        set(v.rows.map((x, j) => (j === i ? { ...x, source_note: e.target.value } : x)))
                      }
                    />
                  </Field>
                  <Field label="Source URL (optional)">
                    <Input
                      value={row.source_url}
                      onChange={(e) =>
                        set(v.rows.map((x, j) => (j === i ? { ...x, source_url: e.target.value } : x)))
                      }
                    />
                  </Field>
                </div>
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              set([...v.rows, { type: "pricing", statement: "", source_note: "", source_url: "" }])
            }
          >
            Add fact claim
          </Button>
        </div>
      );
    }
    case "attributes": {
      const v = value as { attributes: string[] };
      return (
        <div className="flex max-w-xl flex-col gap-4">
          <Field
            label="Desired attributes"
            hint="6-12 phrases you want AI answers to associate with the brand"
            errors={errsFor(errors, "attributes")}
          >
            <TagListInput
              value={v.attributes}
              placeholder="e.g. easy implementation"
              onChange={(attributes) => onChange({ attributes })}
            />
          </Field>
        </div>
      );
    }
    case "personas": {
      const v = value as { personas: PersonaDraft[] };
      const set = (personas: PersonaDraft[]) => onChange({ personas });
      return (
        <div className="flex flex-col gap-4">
          {errsFor(errors, "personas")?.map((e) => (
            <p key={e} className="font-mono text-xs text-danger">
              {e}
            </p>
          ))}
          {v.personas.map((p, i) => (
            <div key={i} className="rounded-xl border border-ink/15 bg-paper-2/50 p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="label-mono text-xs text-ink/60">
                  Persona {String(i + 1).padStart(2, "0")}
                </span>
                {v.personas.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => set(v.personas.filter((_, j) => j !== i))}
                  >
                    Remove
                  </Button>
                )}
              </div>
              <div className="flex flex-col gap-3">
                <Field label="Title" errors={errsFor(errors, `personas.${i}.title`)}>
                  <Input
                    value={p.title}
                    placeholder="e.g. VP Finance"
                    onChange={(e) =>
                      set(v.personas.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))
                    }
                  />
                </Field>
                <Field label="Company context">
                  <Textarea
                    value={p.company_context}
                    onChange={(e) =>
                      set(v.personas.map((x, j) => (j === i ? { ...x, company_context: e.target.value } : x)))
                    }
                  />
                </Field>
                <Field label="Pain points">
                  <TagListInput
                    value={p.pain_points}
                    onChange={(pain_points) =>
                      set(v.personas.map((x, j) => (j === i ? { ...x, pain_points } : x)))
                    }
                  />
                </Field>
                <Field label="Buying criteria">
                  <TagListInput
                    value={p.buying_criteria}
                    onChange={(buying_criteria) =>
                      set(v.personas.map((x, j) => (j === i ? { ...x, buying_criteria } : x)))
                    }
                  />
                </Field>
              </div>
            </div>
          ))}
          {v.personas.length < 5 && (
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                set([
                  ...v.personas,
                  { title: "", company_context: "", pain_points: [], buying_criteria: [] },
                ])
              }
            >
              Add persona
            </Button>
          )}
        </div>
      );
    }
    case "markets": {
      const v = value as { markets: string[] };
      return (
        <div className="flex max-w-xl flex-col gap-4">
          <Field
            label="Markets"
            hint="Ordered — the first market gets allocation priority (CM-4)"
            errors={errsFor(errors, "markets")}
          >
            <TagListInput
              value={v.markets}
              placeholder="e.g. United States"
              onChange={(markets) => onChange({ markets })}
            />
          </Field>
        </div>
      );
    }
  }
}
