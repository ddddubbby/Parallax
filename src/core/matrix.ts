import {
  DEFAULT_INTENT_ALLOCATION,
  DEFAULT_MATRIX_CELLS,
  MAX_CELLS_PER_RUN,
} from "./constants";
import { normalizePhrase } from "./intake";

// Matrix domain: allocation, template rendering, and approval rules
// (PRD 8.4). Pure module — no project-layer imports (C-7); randomness is
// injected so tests stay deterministic.

export type Intent =
  | "discovery"
  | "consideration"
  | "comparison"
  | "validation"
  | "objection";

export type CellIntent = Intent | "simulation";

export const INTENT_ORDER: Intent[] = [
  "comparison",
  "consideration",
  "validation",
  "objection",
  "discovery",
];

const INTENT_SET = new Set<string>(INTENT_ORDER);

export function isAuditIntent(intent: CellIntent | string | null | undefined): intent is Intent {
  return typeof intent === "string" && INTENT_SET.has(intent);
}

/** PM-9: unbranded intents may not contain tracked brand terms at approval. */
export const UNBRANDED_INTENTS: Intent[] = ["discovery", "consideration"];

export interface TemplateInput {
  intent: Intent;
  variantKey: string;
  templateText: string;
}

export interface PersonaInput {
  id: string;
  title: string;
}

export interface MarketInput {
  id: string;
  name: string;
}

export interface BrandTerms {
  name: string;
  aliases: string[];
}

export interface MatrixContext {
  category: string;
  jobToBeDone: string;
  clientBrand: BrandTerms;
  competitors: BrandTerms[];
  attributes: string[];
}

export interface CellPlan {
  intent: Intent;
  personaId: string;
  marketId: string;
  variantKey: string;
  resolvedText: string;
  competitorOrder: string[];
}

/** Fisher-Yates with injectable RNG (PM-8 randomized competitor order). */
export function shuffle<T>(items: T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function renderTemplate(
  templateText: string,
  input: {
    persona: PersonaInput;
    market: MarketInput;
    ctx: MatrixContext;
    competitorOrder: string[];
  },
): string {
  const replacements: Record<string, string> = {
    persona: input.persona.title,
    market: input.market.name,
    category: input.ctx.category,
    job_to_be_done: input.ctx.jobToBeDone,
    client_brand: input.ctx.clientBrand.name,
    competitor_list: input.competitorOrder.join(", "),
    attribute_list: input.ctx.attributes.join(", "),
  };
  return templateText.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in replacements ? replacements[key] : match,
  );
}

/**
 * PM-2 quotas scaled to the target with largest-remainder rounding.
 * At the default 40-cell target this returns the PM-2 table exactly.
 */
export function intentQuotas(target: number): Record<Intent, number> {
  const capped = Math.min(target, MAX_CELLS_PER_RUN);
  const shares = INTENT_ORDER.map((intent) => ({
    intent,
    exact: (DEFAULT_INTENT_ALLOCATION[intent] / DEFAULT_MATRIX_CELLS) * capped,
  }));
  const quotas = new Map(
    shares.map((s) => [s.intent, Math.floor(s.exact)] as const),
  );
  let remaining = capped - [...quotas.values()].reduce((a, b) => a + b, 0);
  const byRemainder = [...shares].sort(
    (a, b) => (b.exact % 1) - (a.exact % 1),
  );
  for (const s of byRemainder) {
    if (remaining <= 0) break;
    quotas.set(s.intent, (quotas.get(s.intent) ?? 0) + 1);
    remaining--;
  }
  return Object.fromEntries(quotas) as Record<Intent, number>;
}

interface Combo {
  personaIdx: number;
  marketIdx: number;
  variantIdx: number;
}

/**
 * PM-4 ordering: primary persona x primary market x the first two variants
 * lead; broader persona/market coverage comes before third variants.
 */
function orderedCombos(
  personaCount: number,
  marketCount: number,
  variantCount: number,
): Combo[] {
  const combos: Combo[] = [];
  for (let p = 0; p < personaCount; p++)
    for (let m = 0; m < marketCount; m++)
      for (let v = 0; v < variantCount; v++)
        combos.push({ personaIdx: p, marketIdx: m, variantIdx: v });
  return combos.sort(
    (a, b) =>
      Number(a.variantIdx >= 2) - Number(b.variantIdx >= 2) ||
      a.personaIdx + a.marketIdx - (b.personaIdx + b.marketIdx) ||
      a.personaIdx - b.personaIdx ||
      a.marketIdx - b.marketIdx ||
      a.variantIdx - b.variantIdx,
  );
}

/**
 * Budget-aware allocation (PM-1..PM-4, PM-11): fill each intent's quota
 * from its priority-ordered combos, redistribute unused quota to intents
 * with spare combos, and never exceed MAX_CELLS_PER_RUN (PM-3) or
 * duplicate a combo.
 */
export function allocateMatrix(
  templates: TemplateInput[],
  personas: PersonaInput[],
  markets: MarketInput[],
  ctx: MatrixContext,
  opts: { target?: number; rng?: () => number } = {},
): CellPlan[] {
  const target = Math.min(opts.target ?? DEFAULT_MATRIX_CELLS, MAX_CELLS_PER_RUN);
  const rng = opts.rng ?? Math.random;
  if (personas.length === 0 || markets.length === 0) return [];

  const variantsByIntent = new Map<Intent, TemplateInput[]>();
  for (const intent of INTENT_ORDER) {
    variantsByIntent.set(
      intent,
      templates
        .filter((t) => t.intent === intent)
        .sort((a, b) => a.variantKey.localeCompare(b.variantKey)),
    );
  }

  const quotas = intentQuotas(target);
  const queues = new Map<Intent, Combo[]>();
  for (const intent of INTENT_ORDER) {
    const variants = variantsByIntent.get(intent) ?? [];
    queues.set(
      intent,
      variants.length === 0
        ? []
        : orderedCombos(personas.length, markets.length, variants.length),
    );
  }

  const taken = new Map<Intent, Combo[]>(INTENT_ORDER.map((i) => [i, []]));
  const takeFrom = (intent: Intent, count: number): number => {
    const queue = queues.get(intent) ?? [];
    const grabbed = queue.splice(0, count);
    taken.get(intent)?.push(...grabbed);
    return grabbed.length;
  };

  let total = 0;
  for (const intent of INTENT_ORDER) {
    total += takeFrom(intent, quotas[intent]);
  }
  // PM-11: redistribute shortfall to intents that still have combos.
  let guard = INTENT_ORDER.length * MAX_CELLS_PER_RUN;
  while (total < target && guard-- > 0) {
    let progressed = false;
    for (const intent of INTENT_ORDER) {
      if (total >= target) break;
      if (takeFrom(intent, 1) === 1) {
        total++;
        progressed = true;
      }
    }
    if (!progressed) break;
  }

  const cells: CellPlan[] = [];
  const competitorNames = ctx.competitors.map((c) => c.name);
  for (const intent of INTENT_ORDER) {
    const variants = variantsByIntent.get(intent) ?? [];
    for (const combo of taken.get(intent) ?? []) {
      const persona = personas[combo.personaIdx];
      const market = markets[combo.marketIdx];
      const template = variants[combo.variantIdx];
      const competitorOrder =
        intent === "comparison" ? shuffle(competitorNames, rng) : [];
      cells.push({
        intent,
        personaId: persona.id,
        marketId: market.id,
        variantKey: template.variantKey,
        resolvedText: renderTemplate(template.templateText, {
          persona,
          market,
          ctx,
          competitorOrder,
        }),
        competitorOrder,
      });
    }
  }
  return cells.slice(0, MAX_CELLS_PER_RUN);
}

/**
 * PM-9 scanner: tracked brand names/aliases found in a text, normalized
 * case- and whitespace-insensitively on word boundaries.
 */
export function findBrandTerms(text: string, brands: BrandTerms[]): string[] {
  const haystack = normalizePhrase(text);
  const found = new Set<string>();
  for (const brand of brands) {
    for (const term of [brand.name, ...brand.aliases]) {
      const needle = normalizePhrase(term);
      if (!needle) continue;
      const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(`(^|\\W)${escaped}(\\W|$)`).test(haystack)) {
        found.add(term);
      }
    }
  }
  return [...found];
}

export interface UnbrandedViolation {
  cellId: string;
  intent: Intent;
  terms: string[];
}

/**
 * PM-9 over a cell set: tracked brand terms found in unbranded-intent cells.
 * Shared by the approval gate (hard block) and the matrix board (early
 * warning at generation time).
 */
export function scanUnbrandedCells(
  cells: Array<{ id: string; intent: Intent; resolvedText: string }>,
  brands: BrandTerms[],
): UnbrandedViolation[] {
  const violations: UnbrandedViolation[] = [];
  for (const cell of cells) {
    if (!UNBRANDED_INTENTS.includes(cell.intent)) continue;
    const terms = findBrandTerms(cell.resolvedText, brands);
    if (terms.length > 0)
      violations.push({ cellId: cell.id, intent: cell.intent, terms });
  }
  return violations;
}
