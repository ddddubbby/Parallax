"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button, Field, Input, Select, Stamp, Textarea } from "@/components/ui";
import { UnsavedChangesSignal, useUnsavedEdit } from "@/components/unsaved-edit";
import type { CategoryArchetype } from "@/core/semantic";
import { CATEGORY_ARCHETYPES } from "@/core/semantic";
import {
  addAttributeAction,
  addCompetitorAction,
  addFactClaimAction,
  addMarketAction,
  addPersonaAction,
  archiveBrandAction,
  archiveFactClaimAction,
  archiveMarketAction,
  archivePersonaAction,
  deleteAttributeAction,
  unarchiveBrandAction,
  unarchiveFactClaimAction,
  unarchiveMarketAction,
  unarchivePersonaAction,
  updateAttributeAction,
  updateBasicsAction,
  updateClientBrandAction,
  updateCompetitorAction,
  updateFactClaimAction,
  updateMarketAction,
  updatePersonaAction,
} from "@/modules/setup/actions";

// M27 (D-084): post-intake Setup editing. Row-level identity is preserved
// throughout — every edit is an UPDATE keyed by the existing row id, every
// "remove" is an archive (reversible), never a delete of a row any FK might
// reference (see src/db/repositories/setup.ts). Forward-only effects: none
// of this retroactively touches historical runs/metrics (C-3); approved
// matrix versions stay frozen regardless of Setup edits (C-4).

const FACT_CLAIM_TYPES = ["pricing", "feature", "company_fact", "security", "availability"] as const;

interface BrandRow {
  id: string;
  role: "client" | "competitor";
  name: string;
  domain: string | null;
  description: string | null;
  aliases: string[];
  archived: boolean;
}
interface PersonaRow {
  id: string;
  title: string;
  companyContext: string | null;
  painPoints: string[];
  buyingCriteria: string[];
  archived: boolean;
}
interface MarketRow {
  id: string;
  name: string;
  archived: boolean;
}
interface AttributeRow {
  id: string;
  name: string;
}
interface FactClaimRow {
  id: string;
  type: string;
  statement: string;
  sourceNote: string | null;
  sourceUrl: string | null;
  archived: boolean;
}

export interface SetupData {
  project: {
    id: string;
    name: string;
    category: string;
    categoryArchetype: CategoryArchetype;
    jobToBeDone: string;
  };
  brands: BrandRow[];
  personas: PersonaRow[];
  markets: MarketRow[];
  attributes: AttributeRow[];
  factClaims: FactClaimRow[];
}

function linesToList(value: string): string[] {
  return value
    .split(/[,\n]/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function SectionHeader({ n, title, hint }: { n: string; title: string; hint?: string }) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline gap-3 border-l-2 border-ink/25 pl-4">
      <h2 className="label-mono text-sm font-medium uppercase text-ink/80">
        {n} · {title}
      </h2>
      {hint && <span className="font-mono text-xs text-ink/45">{hint}</span>}
    </div>
  );
}

export function SetupClient({
  projectId,
  data,
  view = "basics",
}: {
  projectId: string;
  data: SetupData;
  /** M32: one Setup section at a time via URL `view`. */
  view?: "basics" | "brands" | "personas" | "markets" | "attributes" | "facts";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const { setDirty } = useUnsavedEdit();

  function run(action: () => Promise<{ ok: boolean; error?: string; warning?: string }>, onOk?: () => void) {
    setError(null);
    setWarning(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "Action failed");
      } else {
        if (result.warning) setWarning(result.warning);
        onOk?.();
        setDirty(false);
      }
      router.refresh();
    });
  }

  const client = data.brands.find((b) => b.role === "client");
  const competitors = data.brands.filter((b) => b.role === "competitor");
  const activeCompetitorCount = competitors.filter((c) => !c.archived).length;

  // --- 01 Basics ---
  const [basics, setBasics] = useState({
    name: data.project.name,
    category: data.project.category,
    category_archetype: data.project.categoryArchetype,
    job_to_be_done: data.project.jobToBeDone,
  });

  // --- 02 Brands ---
  const [editingBrandId, setEditingBrandId] = useState<string | null>(null);
  const [brandForm, setBrandForm] = useState({ name: "", domain: "", description: "", aliases: "" });
  const [newCompetitor, setNewCompetitor] = useState({ name: "", domain: "", aliases: "" });

  function startEditBrand(b: BrandRow) {
    setEditingBrandId(b.id);
    setBrandForm({ name: b.name, domain: b.domain ?? "", description: b.description ?? "", aliases: b.aliases.join(", ") });
  }

  // --- 03 Personas ---
  const [editingPersonaId, setEditingPersonaId] = useState<string | null>(null);
  const [personaForm, setPersonaForm] = useState({ title: "", company_context: "", pain_points: "", buying_criteria: "" });
  const [newPersona, setNewPersona] = useState({ title: "", company_context: "", pain_points: "", buying_criteria: "" });
  const [showNewPersona, setShowNewPersona] = useState(false);

  function startEditPersona(p: PersonaRow) {
    setEditingPersonaId(p.id);
    setPersonaForm({
      title: p.title,
      company_context: p.companyContext ?? "",
      pain_points: p.painPoints.join("\n"),
      buying_criteria: p.buyingCriteria.join("\n"),
    });
  }

  // --- 04 Markets ---
  const [editingMarketId, setEditingMarketId] = useState<string | null>(null);
  const [marketName, setMarketName] = useState("");
  const [newMarket, setNewMarket] = useState("");

  // --- 05 Attributes ---
  const [editingAttrId, setEditingAttrId] = useState<string | null>(null);
  const [attrName, setAttrName] = useState("");
  const [newAttr, setNewAttr] = useState("");

  // --- 06 Fact sheet ---
  const [editingFactId, setEditingFactId] = useState<string | null>(null);
  const [factForm, setFactForm] = useState({ type: "feature", statement: "", source_note: "", source_url: "" });
  const [showNewFact, setShowNewFact] = useState(false);
  const [newFact, setNewFact] = useState({ type: "feature", statement: "", source_note: "", source_url: "" });

  function startEditFact(f: FactClaimRow) {
    setEditingFactId(f.id);
    setFactForm({ type: f.type, statement: f.statement, source_note: f.sourceNote ?? "", source_url: f.sourceUrl ?? "" });
  }

  const basicsDirty =
    basics.name !== data.project.name ||
    basics.category !== data.project.category ||
    basics.category_archetype !== data.project.categoryArchetype ||
    basics.job_to_be_done !== data.project.jobToBeDone;
  const rowEditOpen =
    editingBrandId !== null ||
    editingPersonaId !== null ||
    editingMarketId !== null ||
    editingAttrId !== null ||
    editingFactId !== null ||
    showNewPersona ||
    showNewFact ||
    newCompetitor.name.trim() !== "" ||
    newMarket.trim() !== "" ||
    newAttr.trim() !== "";

  useEffect(() => {
    setDirty(basicsDirty || rowEditOpen);
  }, [basicsDirty, rowEditOpen, setDirty]);

  return (
    <div className="flex flex-col gap-8">
      {(basicsDirty || rowEditOpen) && (
        <div className="sticky top-0 z-10 -mx-1 flex items-center justify-end px-1 py-1">
          <UnsavedChangesSignal />
        </div>
      )}
      <div className="rounded-lg border border-ink/15 p-3">
        <p className="font-mono text-xs text-ink/60">
          Changes here apply to future matrix generation and future runs. Approved matrices stay
          frozen (C-4) — regenerate a draft to pick up edits. Historical runs are unchanged
          evidence (C-3): adding a brand or attribute does not backfill past metrics.
        </p>
      </div>

      {error && (
        <p className="rounded-lg border border-danger px-3 py-2 font-mono text-xs text-danger">{error}</p>
      )}
      {warning && (
        <p className="rounded-lg border border-warn px-3 py-2 font-mono text-xs text-warn">{warning}</p>
      )}

      {/* 01 Basics */}
      {view === "basics" && (
      <section>
        <SectionHeader n="01" title="Basics" />
        <div className="flex flex-col gap-3 pl-4">
          <Field label="Project name">
            <Input value={basics.name} onChange={(e) => setBasics({ ...basics, name: e.target.value })} />
          </Field>
          <Field label="Category">
            <Input value={basics.category} onChange={(e) => setBasics({ ...basics, category: e.target.value })} />
          </Field>
          <Field label="Buyer-language archetype" hint="Selects the prompt-template pack used for future matrix generation">
            <Select
              value={basics.category_archetype}
              onChange={(e) => setBasics({ ...basics, category_archetype: e.target.value as CategoryArchetype })}
            >
              {(Object.entries(CATEGORY_ARCHETYPES) as Array<[CategoryArchetype, { label: string }]>).map(([key, meta]) => (
                <option key={key} value={key}>
                  {meta.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Buyer's goal (in their words)"
            hint={
              'What the buyer wants to accomplish, in their own words — e.g. "night street ' +
              'photography" or "spend management for a 20-person team." Not your business goal ' +
              '(e.g. "grow market share" or "penetrate the enterprise segment").'
            }
          >
            <Textarea
              value={basics.job_to_be_done}
              placeholder="e.g. night street photography"
              onChange={(e) => setBasics({ ...basics, job_to_be_done: e.target.value })}
            />
          </Field>
          <div>
            <Button disabled={pending} onClick={() => run(() => updateBasicsAction(projectId, basics))}>
              Save basics
            </Button>
          </div>
        </div>
      </section>
      )}

      {/* 02 Brands */}
      {view === "brands" && (
      <section>
        <SectionHeader n="02" title="Brands" hint={activeCompetitorCount === 0 ? "no active competitors — comparison prompts cannot be generated" : undefined} />
        <div className="flex flex-col gap-4 pl-4">
          {client && (
            <div className="rounded-xl border border-ink/15 p-3">
              <div className="mb-1.5 flex items-center gap-2">
                <Stamp tone="accent">Client</Stamp>
                <span className="label-mono text-sm">{client.name}</span>
              </div>
              {editingBrandId === client.id ? (
                <div className="flex flex-col gap-2">
                  <Input placeholder="Name" value={brandForm.name} onChange={(e) => setBrandForm({ ...brandForm, name: e.target.value })} />
                  <Input placeholder="Domain" value={brandForm.domain} onChange={(e) => setBrandForm({ ...brandForm, domain: e.target.value })} />
                  <Input placeholder="Description" value={brandForm.description} onChange={(e) => setBrandForm({ ...brandForm, description: e.target.value })} />
                  <Input placeholder="Aliases (comma-separated)" value={brandForm.aliases} onChange={(e) => setBrandForm({ ...brandForm, aliases: e.target.value })} />
                  <div className="flex gap-2">
                    <Button
                      disabled={pending}
                      onClick={() =>
                        run(
                          () =>
                            updateClientBrandAction(projectId, client.id, {
                              name: brandForm.name,
                              domain: brandForm.domain,
                              description: brandForm.description,
                              aliases: linesToList(brandForm.aliases),
                            }),
                          () => setEditingBrandId(null),
                        )
                      }
                    >
                      Save
                    </Button>
                    <Button variant="secondary" onClick={() => setEditingBrandId(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-ink/60">
                    {client.domain} · aliases: {client.aliases.join(", ") || "none"}
                  </span>
                  <Button variant="ghost" disabled={pending} onClick={() => startEditBrand(client)}>
                    Edit
                  </Button>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2">
            {competitors.map((c) => (
              <div key={c.id} className={`rounded-xl border p-3 ${c.archived ? "border-ink/10 opacity-50" : "border-ink/15"}`}>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-2 label-mono text-sm">
                    {c.name}
                    {c.archived && <Stamp tone="warn">Archived</Stamp>}
                  </span>
                  <span className="flex gap-1">
                    {!c.archived && (
                      <Button variant="ghost" disabled={pending} onClick={() => startEditBrand(c)}>
                        Edit
                      </Button>
                    )}
                    {c.archived ? (
                      <Button variant="ghost" disabled={pending} onClick={() => run(() => unarchiveBrandAction(projectId, c.id))}>
                        Unarchive
                      </Button>
                    ) : (
                      <Button variant="ghost" disabled={pending} onClick={() => run(() => archiveBrandAction(projectId, c.id))}>
                        Archive
                      </Button>
                    )}
                  </span>
                </div>
                {editingBrandId === c.id ? (
                  <div className="flex flex-col gap-2">
                    <Input placeholder="Name" value={brandForm.name} onChange={(e) => setBrandForm({ ...brandForm, name: e.target.value })} />
                    <Input placeholder="Domain" value={brandForm.domain} onChange={(e) => setBrandForm({ ...brandForm, domain: e.target.value })} />
                    <Input placeholder="Aliases (comma-separated)" value={brandForm.aliases} onChange={(e) => setBrandForm({ ...brandForm, aliases: e.target.value })} />
                    <div className="flex gap-2">
                      <Button
                        disabled={pending}
                        onClick={() =>
                          run(
                            () =>
                              updateCompetitorAction(projectId, c.id, {
                                name: brandForm.name,
                                domain: brandForm.domain,
                                aliases: linesToList(brandForm.aliases),
                              }),
                            () => setEditingBrandId(null),
                          )
                        }
                      >
                        Save
                      </Button>
                      <Button variant="secondary" onClick={() => setEditingBrandId(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <span className="font-mono text-xs text-ink/60">
                    {c.domain ?? "—"} · aliases: {c.aliases.join(", ") || "none"}
                  </span>
                )}
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-ink/15 p-3">
            <p className="label-mono mb-2 text-xs text-ink/60">+ Add competitor</p>
            <div className="flex flex-col gap-2">
              <Input placeholder="Name" value={newCompetitor.name} onChange={(e) => setNewCompetitor({ ...newCompetitor, name: e.target.value })} />
              <Input placeholder="Domain (optional)" value={newCompetitor.domain} onChange={(e) => setNewCompetitor({ ...newCompetitor, domain: e.target.value })} />
              <Input placeholder="Aliases (comma-separated)" value={newCompetitor.aliases} onChange={(e) => setNewCompetitor({ ...newCompetitor, aliases: e.target.value })} />
              <div>
                <Button
                  disabled={pending || !newCompetitor.name.trim()}
                  onClick={() =>
                    run(
                      () =>
                        addCompetitorAction(projectId, {
                          name: newCompetitor.name,
                          domain: newCompetitor.domain,
                          aliases: linesToList(newCompetitor.aliases),
                        }),
                      () => setNewCompetitor({ name: "", domain: "", aliases: "" }),
                    )
                  }
                >
                  Add competitor
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
      )}

      {/* 03 Personas */}
      {view === "personas" && (
      <section>
        <SectionHeader n="03" title="Personas" />
        <div className="flex flex-col gap-2 pl-4">
          {data.personas.map((p) => (
            <div key={p.id} className={`rounded-xl border p-3 ${p.archived ? "border-ink/10 opacity-50" : "border-ink/15"}`}>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-2 label-mono text-sm">
                  {p.title}
                  {p.archived && <Stamp tone="warn">Archived</Stamp>}
                </span>
                <span className="flex gap-1">
                  {!p.archived && (
                    <Button variant="ghost" disabled={pending} onClick={() => startEditPersona(p)}>
                      Edit
                    </Button>
                  )}
                  {p.archived ? (
                    <Button variant="ghost" disabled={pending} onClick={() => run(() => unarchivePersonaAction(projectId, p.id))}>
                      Unarchive
                    </Button>
                  ) : (
                    <Button variant="ghost" disabled={pending} onClick={() => run(() => archivePersonaAction(projectId, p.id))}>
                      Archive
                    </Button>
                  )}
                </span>
              </div>
              {editingPersonaId === p.id ? (
                <div className="flex flex-col gap-2">
                  <Input placeholder="Title" value={personaForm.title} onChange={(e) => setPersonaForm({ ...personaForm, title: e.target.value })} />
                  <Input placeholder="Company context" value={personaForm.company_context} onChange={(e) => setPersonaForm({ ...personaForm, company_context: e.target.value })} />
                  <Textarea placeholder="Pain points (one per line)" value={personaForm.pain_points} onChange={(e) => setPersonaForm({ ...personaForm, pain_points: e.target.value })} />
                  <Textarea placeholder="Buying criteria (one per line)" value={personaForm.buying_criteria} onChange={(e) => setPersonaForm({ ...personaForm, buying_criteria: e.target.value })} />
                  <div className="flex gap-2">
                    <Button
                      disabled={pending}
                      onClick={() =>
                        run(
                          () =>
                            updatePersonaAction(projectId, p.id, {
                              title: personaForm.title,
                              company_context: personaForm.company_context,
                              pain_points: linesToList(personaForm.pain_points),
                              buying_criteria: linesToList(personaForm.buying_criteria),
                            }),
                          () => setEditingPersonaId(null),
                        )
                      }
                    >
                      Save
                    </Button>
                    <Button variant="secondary" onClick={() => setEditingPersonaId(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <span className="font-mono text-xs text-ink/60">
                  {p.companyContext ?? "—"} · {p.painPoints.length} pain points · {p.buyingCriteria.length} buying criteria
                </span>
              )}
            </div>
          ))}

          {showNewPersona ? (
            <div className="rounded-xl border border-ink/15 p-3">
              <p className="label-mono mb-2 text-xs text-ink/60">+ Add persona</p>
              <div className="flex flex-col gap-2">
                <Input placeholder="Title" value={newPersona.title} onChange={(e) => setNewPersona({ ...newPersona, title: e.target.value })} />
                <Input placeholder="Company context" value={newPersona.company_context} onChange={(e) => setNewPersona({ ...newPersona, company_context: e.target.value })} />
                <Textarea placeholder="Pain points (one per line)" value={newPersona.pain_points} onChange={(e) => setNewPersona({ ...newPersona, pain_points: e.target.value })} />
                <Textarea placeholder="Buying criteria (one per line)" value={newPersona.buying_criteria} onChange={(e) => setNewPersona({ ...newPersona, buying_criteria: e.target.value })} />
                <div className="flex gap-2">
                  <Button
                    disabled={pending || !newPersona.title.trim()}
                    onClick={() =>
                      run(
                        () =>
                          addPersonaAction(projectId, {
                            title: newPersona.title,
                            company_context: newPersona.company_context,
                            pain_points: linesToList(newPersona.pain_points),
                            buying_criteria: linesToList(newPersona.buying_criteria),
                          }),
                        () => {
                          setNewPersona({ title: "", company_context: "", pain_points: "", buying_criteria: "" });
                          setShowNewPersona(false);
                        },
                      )
                    }
                  >
                    Add persona
                  </Button>
                  <Button variant="secondary" onClick={() => setShowNewPersona(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <Button variant="secondary" onClick={() => setShowNewPersona(true)}>
              + Add persona
            </Button>
          )}
        </div>
      </section>
      )}

      {/* 04 Markets */}
      {view === "markets" && (
      <section>
        <SectionHeader n="04" title="Markets" />
        <div className="flex flex-col gap-2 pl-4">
          {data.markets.map((m) => (
            <div key={m.id} className={`flex items-center justify-between rounded-xl border p-3 ${m.archived ? "border-ink/10 opacity-50" : "border-ink/15"}`}>
              {editingMarketId === m.id ? (
                <div className="flex flex-1 items-center gap-2">
                  <Input value={marketName} onChange={(e) => setMarketName(e.target.value)} />
                  <Button
                    disabled={pending}
                    onClick={() => run(() => updateMarketAction(projectId, m.id, { name: marketName }), () => setEditingMarketId(null))}
                  >
                    Save
                  </Button>
                  <Button variant="secondary" onClick={() => setEditingMarketId(null)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <span className="flex items-center gap-2 label-mono text-sm">
                  {m.name}
                  {m.archived && <Stamp tone="warn">Archived</Stamp>}
                </span>
              )}
              {editingMarketId !== m.id && (
                <span className="flex gap-1">
                  {!m.archived && (
                    <Button
                      variant="ghost"
                      disabled={pending}
                      onClick={() => {
                        setEditingMarketId(m.id);
                        setMarketName(m.name);
                      }}
                    >
                      Edit
                    </Button>
                  )}
                  {m.archived ? (
                    <Button variant="ghost" disabled={pending} onClick={() => run(() => unarchiveMarketAction(projectId, m.id))}>
                      Unarchive
                    </Button>
                  ) : (
                    <Button variant="ghost" disabled={pending} onClick={() => run(() => archiveMarketAction(projectId, m.id))}>
                      Archive
                    </Button>
                  )}
                </span>
              )}
            </div>
          ))}
          <div className="flex items-center gap-2">
            <Input placeholder="New market" value={newMarket} onChange={(e) => setNewMarket(e.target.value)} />
            <Button
              disabled={pending || !newMarket.trim()}
              onClick={() => run(() => addMarketAction(projectId, { name: newMarket }), () => setNewMarket(""))}
            >
              Add market
            </Button>
          </div>
        </div>
      </section>
      )}

      {/* 05 Attributes */}
      {view === "attributes" && (
      <section>
        <SectionHeader n="05" title="Attributes" hint="renaming does not retag historical extractions already tagged under the old name" />
        <div className="flex flex-col gap-2 pl-4">
          {data.attributes.map((a) => (
            <div key={a.id} className="flex items-center justify-between rounded-xl border border-ink/15 p-3">
              {editingAttrId === a.id ? (
                <div className="flex flex-1 items-center gap-2">
                  <Input value={attrName} onChange={(e) => setAttrName(e.target.value)} />
                  <Button
                    disabled={pending}
                    onClick={() => run(() => updateAttributeAction(projectId, a.id, { name: attrName }), () => setEditingAttrId(null))}
                  >
                    Save
                  </Button>
                  <Button variant="secondary" onClick={() => setEditingAttrId(null)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <span className="label-mono text-sm">{a.name}</span>
              )}
              {editingAttrId !== a.id && (
                <span className="flex gap-1">
                  <Button
                    variant="ghost"
                    disabled={pending}
                    onClick={() => {
                      setEditingAttrId(a.id);
                      setAttrName(a.name);
                    }}
                  >
                    Rename
                  </Button>
                  <Button variant="ghost" disabled={pending} onClick={() => run(() => deleteAttributeAction(projectId, a.id))}>
                    Remove
                  </Button>
                </span>
              )}
            </div>
          ))}
          <div className="flex items-center gap-2">
            <Input placeholder="New attribute" value={newAttr} onChange={(e) => setNewAttr(e.target.value)} />
            <Button
              disabled={pending || !newAttr.trim()}
              onClick={() => run(() => addAttributeAction(projectId, { name: newAttr }), () => setNewAttr(""))}
            >
              Add attribute
            </Button>
          </div>
        </div>
      </section>
      )}

      {/* 06 Fact sheet */}
      {view === "facts" && (
      <section>
        <SectionHeader n="06" title="Fact sheet" />
        <div className="flex flex-col gap-2 pl-4">
          {data.factClaims.map((f) => (
            <div key={f.id} className={`rounded-xl border p-3 ${f.archived ? "border-ink/10 opacity-50" : "border-ink/15"}`}>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-2 label-mono text-xs text-ink/60">
                  {f.type}
                  {f.archived && <Stamp tone="warn">Archived</Stamp>}
                </span>
                <span className="flex gap-1">
                  {!f.archived && (
                    <Button variant="ghost" disabled={pending} onClick={() => startEditFact(f)}>
                      Edit
                    </Button>
                  )}
                  {f.archived ? (
                    <Button variant="ghost" disabled={pending} onClick={() => run(() => unarchiveFactClaimAction(projectId, f.id))}>
                      Unarchive
                    </Button>
                  ) : (
                    <Button variant="ghost" disabled={pending} onClick={() => run(() => archiveFactClaimAction(projectId, f.id))}>
                      Archive
                    </Button>
                  )}
                </span>
              </div>
              {editingFactId === f.id ? (
                <div className="flex flex-col gap-2">
                  <Select value={factForm.type} onChange={(e) => setFactForm({ ...factForm, type: e.target.value })}>
                    {FACT_CLAIM_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </Select>
                  <Textarea placeholder="Statement" value={factForm.statement} onChange={(e) => setFactForm({ ...factForm, statement: e.target.value })} />
                  <Input placeholder="Source note (optional)" value={factForm.source_note} onChange={(e) => setFactForm({ ...factForm, source_note: e.target.value })} />
                  <Input placeholder="Source URL (optional)" value={factForm.source_url} onChange={(e) => setFactForm({ ...factForm, source_url: e.target.value })} />
                  <div className="flex gap-2">
                    <Button
                      disabled={pending}
                      onClick={() =>
                        run(() => updateFactClaimAction(projectId, f.id, factForm), () => setEditingFactId(null))
                      }
                    >
                      Save
                    </Button>
                    <Button variant="secondary" onClick={() => setEditingFactId(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-ink/85">{f.statement}</p>
              )}
            </div>
          ))}

          {showNewFact ? (
            <div className="rounded-xl border border-ink/15 p-3">
              <p className="label-mono mb-2 text-xs text-ink/60">+ Add fact claim</p>
              <div className="flex flex-col gap-2">
                <Select value={newFact.type} onChange={(e) => setNewFact({ ...newFact, type: e.target.value })}>
                  {FACT_CLAIM_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
                <Textarea placeholder="Statement" value={newFact.statement} onChange={(e) => setNewFact({ ...newFact, statement: e.target.value })} />
                <Input placeholder="Source note (optional)" value={newFact.source_note} onChange={(e) => setNewFact({ ...newFact, source_note: e.target.value })} />
                <Input placeholder="Source URL (optional)" value={newFact.source_url} onChange={(e) => setNewFact({ ...newFact, source_url: e.target.value })} />
                <div className="flex gap-2">
                  <Button
                    disabled={pending || !newFact.statement.trim()}
                    onClick={() =>
                      run(
                        () => addFactClaimAction(projectId, newFact),
                        () => {
                          setNewFact({ type: "feature", statement: "", source_note: "", source_url: "" });
                          setShowNewFact(false);
                        },
                      )
                    }
                  >
                    Add fact claim
                  </Button>
                  <Button variant="secondary" onClick={() => setShowNewFact(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <Button variant="secondary" onClick={() => setShowNewFact(true)}>
              + Add fact claim
            </Button>
          )}
        </div>
      </section>
      )}
    </div>
  );
}
