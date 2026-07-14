"use client";

import { Button, Stamp } from "@/components/ui";
import {
  type BrandAliasInput,
  type FieldErrors,
  findAliasOverlaps,
  INTAKE_STEPS,
  type IntakeStepKey,
} from "@/core/intake";
import { findBrandTerms, findBusinessVoicePhrases } from "@/core/matrix";
import { CATEGORY_ARCHETYPES, type CategoryArchetype } from "@/core/semantic";

// PS-4: review deep-links to steps and returns to review.

function Section({
  step,
  title,
  onEdit,
  hasErrors,
  children,
}: {
  step: number;
  title: string;
  onEdit: (step: number) => void;
  hasErrors: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-ink/15 p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="label-mono text-xs text-ink/60">
          {String(step).padStart(2, "0")} {title}
        </span>
        <div className="flex items-center gap-2">
          {hasErrors && <Stamp tone="danger">Incomplete</Stamp>}
          <Button type="button" variant="ghost" onClick={() => onEdit(step)}>
            Edit
          </Button>
        </div>
      </div>
      <div className="text-sm text-ink/85">{children}</div>
    </div>
  );
}

export function Review({
  draft,
  stepErrors,
  pending,
  onEdit,
  onComplete,
}: {
  draft: Record<IntakeStepKey, unknown>;
  stepErrors: Partial<Record<IntakeStepKey, FieldErrors>>;
  pending: boolean;
  onEdit: (step: number) => void;
  onComplete: () => void;
}) {
  const basics = draft.basics as { name: string; category_archetype?: CategoryArchetype; category: string; job_to_be_done: string };
  const client = draft.client_brand as BrandAliasInput & { domain: string };
  const competitors = (draft.competitors as { competitors: (BrandAliasInput & { domain?: string })[] })
    .competitors;
  const factRows = (draft.fact_sheet as { rows: { type: string; statement: string }[] }).rows;
  const attrs = (draft.attributes as { attributes: string[] }).attributes;
  const personas = (draft.personas as { personas: { title: string }[] }).personas;
  const markets = (draft.markets as { markets: string[] }).markets;

  // BC-3: overlapping aliases flagged before matrix generation.
  const allBrands = [
    { name: client.name, aliases: client.aliases ?? [] },
    ...competitors.map((c) => ({ name: c.name, aliases: c.aliases ?? [] })),
  ];
  const overlaps = findAliasOverlaps(allBrands);

  // PM-9 early warning: these fields are interpolated verbatim into unbranded
  // discovery/consideration prompts, so tracked brand terms in them will
  // block matrix approval. Warn here — the first moment all brands are known.
  const contaminatedFields = [
    { label: "buyer's goal", terms: findBrandTerms(basics.job_to_be_done ?? "", allBrands) },
    { label: "category", terms: findBrandTerms(basics.category ?? "", allBrands) },
  ].filter((f) => f.terms.length > 0);

  // M28 buyer-voice early warning: PM-9's "other half" — the buyer's goal
  // read as a business/marketing objective rather than the buyer's own
  // words. Same never-blocks philosophy, surfaced at the same moment.
  const businessVoiceHits = findBusinessVoicePhrases(basics.job_to_be_done ?? "");

  const errFor = (key: IntakeStepKey) =>
    Boolean(stepErrors[key] && Object.keys(stepErrors[key]).length > 0);

  return (
    <div className="flex flex-col gap-4">
      {overlaps.length > 0 && (
        <div className="rounded-xl border border-warn p-4">
          <div className="mb-2 flex items-center gap-2">
            <Stamp tone="warn">Alias overlap</Stamp>
            <span className="text-sm text-ink/65">
              same term tracked on two brands — extraction cannot attribute it
            </span>
          </div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-warn">
            {overlaps.map((o) => (
              <li key={`${o.value}-${o.brands.join()}`}>
                &ldquo;{o.value}&rdquo; — {o.brands[0]} and {o.brands[1]}
              </li>
            ))}
          </ul>
        </div>
      )}

      {contaminatedFields.length > 0 && (
        <div className="rounded-xl border border-warn p-4">
          <div className="mb-2 flex items-center gap-2">
            <Stamp tone="warn">Brand terms in basics</Stamp>
            <span className="text-sm text-ink/65">
              unbranded discovery/consideration prompts interpolate these fields verbatim —
              PM-9 will block matrix approval (describe the buyer&rsquo;s job, not the audit)
            </span>
          </div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-warn">
            {contaminatedFields.map((f) => (
              <li key={f.label}>
                {f.label} contains: {f.terms.join(", ")}
              </li>
            ))}
          </ul>
        </div>
      )}

      {businessVoiceHits.length > 0 && (
        <div className="rounded-xl border border-warn p-4">
          <div className="mb-2 flex items-center gap-2">
            <Stamp tone="warn">Buyer&rsquo;s goal reads like a business objective</Stamp>
            <span className="text-sm text-ink/65">
              templates interpolate this field as what the BUYER wants to accomplish —
              describe their goal in their own words, not a growth/market objective
            </span>
          </div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-warn">
            <li>buyer&rsquo;s goal contains: {businessVoiceHits.join(", ")}</li>
          </ul>
        </div>
      )}

      <Section step={1} title={INTAKE_STEPS[0].label} onEdit={onEdit} hasErrors={errFor("basics")}>
        {basics.name || "—"} · {basics.category || "—"} ·{" "}
        {CATEGORY_ARCHETYPES[basics.category_archetype ?? "b2b"].label}
        <p className="mt-1 text-ink/60">{basics.job_to_be_done || "—"}</p>
      </Section>

      <Section step={2} title={INTAKE_STEPS[1].label} onEdit={onEdit} hasErrors={errFor("client_brand")}>
        {client.name || "—"} ({client.domain || "no domain"})
        {client.aliases?.length > 0 && (
          <span className="text-ink/60"> · aliases: {client.aliases.join(", ")}</span>
        )}
      </Section>

      <Section step={3} title={INTAKE_STEPS[2].label} onEdit={onEdit} hasErrors={errFor("competitors")}>
        {competitors.filter((c) => c.name).map((c) => c.name).join(", ") || "—"}{" "}
        <span className="text-ink/60">({competitors.length} of 3-8)</span>
      </Section>

      <Section step={4} title={INTAKE_STEPS[3].label} onEdit={onEdit} hasErrors={errFor("fact_sheet")}>
        {factRows.length} fact claim{factRows.length === 1 ? "" : "s"}
        {factRows.length === 0 && (
          <span className="text-ink/60"> — misinformation register will have nothing to verify against</span>
        )}
      </Section>

      <Section step={5} title={INTAKE_STEPS[4].label} onEdit={onEdit} hasErrors={errFor("attributes")}>
        {attrs.join(", ") || "—"} <span className="text-ink/60">({attrs.length} of 6-12)</span>
      </Section>

      <Section step={6} title={INTAKE_STEPS[5].label} onEdit={onEdit} hasErrors={errFor("personas")}>
        {personas.filter((p) => p.title).map((p) => p.title).join(", ") || "—"}{" "}
        <span className="text-ink/60">({personas.length} of 2-5)</span>
      </Section>

      <Section step={7} title={INTAKE_STEPS[6].label} onEdit={onEdit} hasErrors={errFor("markets")}>
        {markets.join(" → ") || "—"}
      </Section>

      <div className="mt-2 flex justify-end">
        <Button onClick={onComplete} pending={pending} pendingLabel="Completing…">
          Complete intake
        </Button>
      </div>
    </div>
  );
}
