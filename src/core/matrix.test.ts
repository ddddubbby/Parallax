import { describe, expect, it } from "vitest";
import {
  allocateMatrix,
  ALLOCATED_INTENT_ORDER,
  type BrandTerms,
  type CellPlan,
  findBrandTerms,
  findBusinessVoicePhrases,
  intentQuotas,
  type MatrixContext,
  renderTemplate,
  renderRepresentationTemplate,
  scanUnbrandedCells,
  shuffle,
  type TemplateInput,
} from "./matrix";
import { TEMPLATE_SEED } from "./prompt-templates";

// Deterministic RNG for PM-8 tests.
function seededRng(seed = 42): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const TEMPLATES: TemplateInput[] = (
  [
    ["discovery", "What tools should a {persona} in {market} consider for {job_to_be_done}?"],
    ["consideration", "Best options for {persona} teams evaluating {category} in {market}?"],
    ["comparison", "Compare {client_brand} against {competitor_list} for {persona} in {market}."],
    ["validation", "Is {client_brand} good for {persona} teams that care about {attribute_list}?"],
    ["objection", "What concerns should a {persona} have before choosing {client_brand}?"],
  ] as const
).flatMap(([intent, text]) =>
  ["v1", "v2", "v3"].map((variantKey) => ({
    intent,
    variantKey,
    templateText: `${text} (${variantKey})`,
  })),
);

const CTX: MatrixContext = {
  category: "spend management",
  jobToBeDone: "reduce manual reconciliation",
  clientBrand: { name: "LedgerFox", aliases: ["Ledger Fox"] },
  competitors: [
    { name: "SpendPilot", aliases: [] },
    { name: "Northstar AP", aliases: ["Northstar"] },
    { name: "CloseBooks AI", aliases: [] },
  ],
  attributes: ["easy implementation", "mid-market fit"],
};

const personas = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, title: `Persona ${i}` }));
const markets = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `m${i}`, name: `Market ${i}` }));

function alloc(p: number, m: number, opts: { target?: number } = {}): CellPlan[] {
  return allocateMatrix(TEMPLATES, personas(p), markets(m), CTX, {
    ...opts,
    rng: seededRng(),
  });
}

describe("intentQuotas (PM-2)", () => {
  it("returns the PM-2 table exactly at the 40-cell default", () => {
    expect(intentQuotas(40)).toEqual({
      comparison: 12,
      consideration: 10,
      validation: 8,
      objection: 6,
      discovery: 4,
      representation: 0,
    });
  });

  it("sums to the target for other sizes and never exceeds 50", () => {
    for (const target of [15, 20, 37, 50, 60]) {
      const q = intentQuotas(target);
      const sum = Object.values(q).reduce((a, b) => a + b, 0);
      expect(sum).toBe(Math.min(target, 50));
    }
  });
});

describe("allocateMatrix", () => {
  it("hits the 40-cell default with the demo-sizing contract (2p x 2m x 3v)", () => {
    const cells = alloc(2, 2);
    expect(cells).toHaveLength(40);
    const byIntent = Object.groupBy(cells, (c) => c.intent);
    expect(byIntent.comparison).toHaveLength(12);
    expect(byIntent.consideration).toHaveLength(10);
    expect(byIntent.validation).toHaveLength(8);
    expect(byIntent.objection).toHaveLength(6);
    expect(byIntent.discovery).toHaveLength(4);
  });

  it("never duplicates a combo (PM-11)", () => {
    const cells = alloc(2, 2, { target: 50 });
    const keys = cells.map(
      (c) => `${c.intent}|${c.personaId}|${c.marketId}|${c.variantKey}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("redistributes quota when an intent lacks combos (PM-11)", () => {
    // 1 persona x 1 market x 3 variants = 3 combos/intent, 15 total.
    const cells = alloc(1, 1);
    expect(cells).toHaveLength(15);
  });

  it("never exceeds 50 even when asked to (PM-3)", () => {
    const cells = allocateMatrix(TEMPLATES, personas(4), markets(4), CTX, {
      target: 200,
      rng: seededRng(),
    });
    expect(cells.length).toBeLessThanOrEqual(50);
    expect(cells).toHaveLength(50);
  });

  it("leads with primary persona x primary market x two variants (PM-4)", () => {
    const cells = alloc(2, 2);
    const comparison = cells.filter((c) => c.intent === "comparison");
    expect(comparison[0]).toMatchObject({ personaId: "p0", marketId: "m0", variantKey: "v1" });
    expect(comparison[1]).toMatchObject({ personaId: "p0", marketId: "m0", variantKey: "v2" });
    // Broader coverage precedes the primary pair's third variant.
    const v3Idx = comparison.findIndex(
      (c) => c.personaId === "p0" && c.marketId === "m0" && c.variantKey === "v3",
    );
    const broaderIdx = comparison.findIndex((c) => c.personaId === "p1");
    expect(broaderIdx).toBeLessThan(v3Idx === -1 ? Infinity : v3Idx);
  });

  it("stores randomized competitor order on comparison cells only (PM-8)", () => {
    const cells = alloc(2, 2);
    for (const cell of cells) {
      if (cell.intent === "comparison") {
        expect([...cell.competitorOrder].sort()).toEqual(
          ["CloseBooks AI", "Northstar AP", "SpendPilot"].sort(),
        );
        expect(cell.resolvedText).toContain(cell.competitorOrder.join(", "));
      } else {
        expect(cell.competitorOrder).toEqual([]);
      }
    }
    const orders = new Set(
      cells.filter((c) => c.intent === "comparison").map((c) => c.competitorOrder.join("|")),
    );
    expect(orders.size).toBeGreaterThan(1);
  });

  it("returns nothing without personas or markets", () => {
    expect(allocateMatrix(TEMPLATES, [], markets(1), CTX)).toEqual([]);
    expect(allocateMatrix(TEMPLATES, personas(1), [], CTX)).toEqual([]);
  });

  it("appends each fixed representation prompt once without persona or market", () => {
    const representation: TemplateInput[] = [
      ["a1", "What is {client_brand}?"],
      ["a2", "Describe {client_brand}."],
      ["a3", "Tell me about {client_brand}."],
      ["a4", "Give an overview of {client_brand}."],
      ["a5", "Explain {client_brand}."],
    ].map(([variantKey, templateText]) => ({
      intent: "representation" as const,
      variantKey,
      templateText,
    }));
    const cells = allocateMatrix(
      [...TEMPLATES, ...representation],
      personas(2),
      markets(2),
      CTX,
      { rng: seededRng() },
    );
    expect(cells).toHaveLength(45);
    expect(cells.filter((cell) => cell.intent !== "representation")).toHaveLength(40);
    expect(cells.filter((cell) => cell.intent === "representation")).toEqual(
      representation.map((template) => ({
        intent: "representation",
        personaId: null,
        marketId: null,
        variantKey: template.variantKey,
        resolvedText: renderRepresentationTemplate(template.templateText, "LedgerFox"),
        competitorOrder: [],
      })),
    );
    expect(ALLOCATED_INTENT_ORDER).not.toContain("representation");
  });

  it("allocates 45 cells for seeded consumer packs and 40 for B2B", () => {
    const templatesFor = (archetype: "b2b" | "consumer_product") =>
      TEMPLATE_SEED.filter(
        (template) => template.archetype === archetype && template.active !== false,
      ).map((template) => ({
        intent: template.intent,
        variantKey: template.variantKey,
        templateText: template.text,
      }));
    expect(
      allocateMatrix(templatesFor("consumer_product"), personas(2), markets(2), CTX, {
        rng: seededRng(),
      }),
    ).toHaveLength(45);
    expect(
      allocateMatrix(templatesFor("b2b"), personas(2), markets(2), CTX, {
        rng: seededRng(),
      }),
    ).toHaveLength(40);
  });
});

describe("renderTemplate (PM-1)", () => {
  it("resolves every placeholder", () => {
    const text = renderTemplate(
      "{persona} / {market} / {category} / {job_to_be_done} / {client_brand} / {competitor_list} / {attribute_list}",
      {
        persona: { id: "p", title: "VP Finance" },
        market: { id: "m", name: "US" },
        ctx: CTX,
        competitorOrder: ["A", "B"],
      },
    );
    expect(text).toBe(
      "VP Finance / US / spend management / reduce manual reconciliation / LedgerFox / A, B / easy implementation, mid-market fit",
    );
  });

  it("leaves unknown placeholders untouched for operator visibility", () => {
    const text = renderTemplate("{persona} wants {unknown_thing}", {
      persona: { id: "p", title: "VP" },
      market: { id: "m", name: "US" },
      ctx: CTX,
      competitorOrder: [],
    });
    expect(text).toBe("VP wants {unknown_thing}");
  });
});

describe("renderRepresentationTemplate (M34A FE-1)", () => {
  it("replaces only the client brand and rejects any other placeholder", () => {
    expect(renderRepresentationTemplate("What is {client_brand}?", "LedgerFox")).toBe(
      "What is LedgerFox?",
    );
    expect(() =>
      renderRepresentationTemplate("Describe {client_brand} in {market}.", "LedgerFox"),
    ).toThrow(/only use \{client_brand\}/i);
  });
});

describe("findBrandTerms (PM-9)", () => {
  const brands: BrandTerms[] = [
    { name: "LedgerFox", aliases: ["Ledger Fox"] },
    { name: "SpendPilot", aliases: [] },
  ];

  it("finds names and aliases case-insensitively on word boundaries", () => {
    expect(findBrandTerms("Why choose ledgerfox?", brands)).toEqual(["LedgerFox"]);
    expect(findBrandTerms("Compare ledger  fox and spendpilot", brands)).toEqual(
      expect.arrayContaining(["Ledger Fox", "SpendPilot"]),
    );
  });

  it("does not match substrings inside larger words", () => {
    expect(findBrandTerms("spendpiloting is not a brand", brands)).toEqual([]);
  });

  it("returns empty for clean unbranded text", () => {
    expect(findBrandTerms("What tools should a VP consider?", brands)).toEqual([]);
  });
});

describe("scanUnbrandedCells (PM-9)", () => {
  const brands: BrandTerms[] = [
    { name: "LedgerFox", aliases: ["Ledger Fox"] },
    { name: "SpendPilot", aliases: [] },
  ];

  it("flags only unbranded intents containing tracked terms", () => {
    const violations = scanUnbrandedCells(
      [
        { id: "a", intent: "discovery", resolvedText: "Why is LedgerFox good?" },
        { id: "b", intent: "comparison", resolvedText: "LedgerFox vs SpendPilot" },
        { id: "c", intent: "consideration", resolvedText: "Best expense tools?" },
        { id: "d", intent: "consideration", resolvedText: "Is spendpilot a fit?" },
        { id: "e", intent: "representation", resolvedText: "What is LedgerFox?" },
      ],
      brands,
    );
    expect(violations).toEqual([
      { cellId: "a", intent: "discovery", terms: ["LedgerFox"] },
      { cellId: "d", intent: "consideration", terms: ["SpendPilot"] },
    ]);
  });

  it("returns empty when unbranded cells are clean", () => {
    expect(
      scanUnbrandedCells(
        [{ id: "a", intent: "discovery", resolvedText: "Best expense tools?" }],
        brands,
      ),
    ).toEqual([]);
  });
});

describe("findBusinessVoicePhrases (M28 buyer-voice guard)", () => {
  it("returns empty for clean buyer-voice phrasing", () => {
    expect(findBusinessVoicePhrases("night street photography")).toEqual([]);
    expect(findBusinessVoicePhrases("keep invoices reconciled every month")).toEqual([]);
    expect(findBusinessVoicePhrases("spend management for a 20-person team")).toEqual([]);
  });

  it("flags leading imperative marketing verbs", () => {
    expect(findBusinessVoicePhrases("Penetrate the enterprise segment")).toContain("penetrate");
    expect(findBusinessVoicePhrases("Dominate the regional market")).toContain("dominate");
  });

  it("flags market-objective phrases", () => {
    expect(findBusinessVoicePhrases("Grow market share this quarter")).toContain("market share");
    expect(findBusinessVoicePhrases("Increase adoption among enterprise teams")).toContain(
      "increase adoption",
    );
    expect(findBusinessVoicePhrases("Acquire customers in APAC")).toContain("acquire customers");
    expect(findBusinessVoicePhrases("Launch into the SMB tier")).toContain("launch into");
    expect(findBusinessVoicePhrases("Scale to 10,000 users")).toContain("scale to");
  });

  it("flags the target ... segment pattern even with words in between", () => {
    expect(findBusinessVoicePhrases("Target the traditional DSLR consumer segment")).toContain(
      "target ... segment",
    );
  });

  it("does not false-positive on a word containing the phrase (word boundary, D-062 lesson)", () => {
    expect(findBusinessVoicePhrases("Our captured audience loves the app")).toEqual([]);
    expect(findBusinessVoicePhrases("Converting RAW photos to JPEG at night")).toEqual([]);
  });

  it("returns multiple matches when several phrases are present", () => {
    const hits = findBusinessVoicePhrases("Penetrate the market and grow share fast");
    expect(hits).toEqual(expect.arrayContaining(["penetrate", "grow share"]));
  });
});

describe("shuffle", () => {
  it("is deterministic under a seeded rng and preserves members", () => {
    const rng1 = seededRng(7);
    const rng2 = seededRng(7);
    const items = ["a", "b", "c", "d"];
    expect(shuffle(items, rng1)).toEqual(shuffle(items, rng2));
    expect([...shuffle(items, seededRng(9))].sort()).toEqual(items);
  });
});
