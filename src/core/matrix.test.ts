import { describe, expect, it } from "vitest";
import {
  allocateMatrix,
  ALLOCATED_INTENT_ORDER,
  balancedBrandOrders,
  brandRosterMatches,
  type BrandTerms,
  type CellPlan,
  competitorOrderFromBrandOrder,
  findBrandTerms,
  findBusinessVoicePhrases,
  hasMarketContextPrompt,
  intentQuotas,
  MARKET_CONTEXT_PROTOCOL_VERSION,
  marketContextPrefix,
  type MatrixContext,
  nextBalancedBrandOrder,
  renderTemplate,
  renderMarketContextPrompt,
  renderRepresentationTemplate,
  rotateBrandOrder,
  scanUnbrandedCells,
  scanMarketContextCells,
  shuffle,
  trackedBrandRoster,
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
    ["comparison", "Compare {brand_list} for {persona} in {market}."],
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
    for (const cell of cells) {
      const market = markets(2).find((candidate) => candidate.id === cell.marketId);
      expect(market).toBeDefined();
      expect(hasMarketContextPrompt(cell.resolvedText, market!.name)).toBe(true);
    }
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

  it("stores balanced frozen brand order on comparison cells only (M46/D-117)", () => {
    const cells = alloc(2, 2);
    const roster = trackedBrandRoster(CTX);
    const comparison = cells.filter((c) => c.intent === "comparison");
    expect(comparison.length).toBeGreaterThan(1);
    const positionCounts = new Map(roster.map((name) => [name, new Array(roster.length).fill(0)]));
    for (const cell of comparison) {
      expect(brandRosterMatches(cell.brandOrder, roster)).toBe(true);
      expect(cell.competitorOrder).toEqual(
        competitorOrderFromBrandOrder(cell.brandOrder, CTX.clientBrand.name),
      );
      expect(cell.resolvedText).toContain(cell.brandOrder.join(", "));
      // Client is in the list but not fixed at position 0 across the matrix.
      cell.brandOrder.forEach((name, pos) => {
        positionCounts.get(name)![pos] += 1;
      });
    }
    for (const cell of cells.filter((c) => c.intent !== "comparison")) {
      expect(cell.brandOrder).toEqual([]);
      expect(cell.competitorOrder).toEqual([]);
    }
    for (const name of roster) {
      const counts = positionCounts.get(name)!;
      expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    }
    // Same seed ⇒ same orders (reproducible balancing).
    const again = alloc(2, 2).filter((c) => c.intent === "comparison");
    expect(again.map((c) => c.brandOrder.join("|"))).toEqual(
      comparison.map((c) => c.brandOrder.join("|")),
    );
    // Client is not fixed first on every cell.
    expect(comparison.every((c) => c.brandOrder[0] === CTX.clientBrand.name)).toBe(false);
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
        brandOrder: [],
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
  it("renders the exact market-context.v1 block", () => {
    expect(MARKET_CONTEXT_PROTOCOL_VERSION).toBe("market-context.v1");
    expect(marketContextPrefix("Singapore")).toBe(
      "Market context: Singapore\n\n" +
        "Answer specifically for this market. Where relevant, use market-specific availability, pricing, regulations, cultural norms, brands, and buyer behavior. Do not infer or substitute a market based on IP address or other location signals. If reliable market-specific information is unavailable, state the uncertainty rather than assuming another market.",
    );
  });

  it("resolves every placeholder including brand_list", () => {
    const text = renderTemplate(
      "{persona} / {market} / {category} / {job_to_be_done} / {client_brand} / {brand_list} / {competitor_list} / {attribute_list}",
      {
        persona: { id: "p", title: "VP Finance" },
        market: { id: "m", name: "US" },
        ctx: CTX,
        competitorOrder: ["A", "B"],
        brandOrder: ["B", "LedgerFox", "A"],
      },
    );
    expect(text).toBe(
      `${marketContextPrefix("US")}\n\n` +
        "VP Finance / US / spend management / reduce manual reconciliation / LedgerFox / B, LedgerFox, A / A, B / easy implementation, mid-market fit",
    );
  });

  it("leaves unknown placeholders untouched for operator visibility", () => {
    const text = renderTemplate("{persona} wants {unknown_thing}", {
      persona: { id: "p", title: "VP" },
      market: { id: "m", name: "US" },
      ctx: CTX,
      competitorOrder: [],
      brandOrder: [],
    });
    expect(text).toBe(`${marketContextPrefix("US")}\n\nVP wants {unknown_thing}`);
  });

  it("distinguishes markets even when the question template has no market placeholder", () => {
    const input = {
      persona: { id: "p", title: "VP" },
      ctx: CTX,
      competitorOrder: [] as string[],
      brandOrder: [] as string[],
    };
    const singapore = renderTemplate("Would you recommend {client_brand}?", {
      ...input,
      market: { id: "sg", name: "Singapore" },
    });
    const unitedStates = renderTemplate("Would you recommend {client_brand}?", {
      ...input,
      market: { id: "us", name: "United States" },
    });
    expect(singapore).not.toBe(unitedStates);
    expect(hasMarketContextPrompt(singapore, "Singapore")).toBe(true);
    expect(hasMarketContextPrompt(unitedStates, "United States")).toBe(true);
  });

  it("replaces a recognized old market block without duplicating it", () => {
    const old = renderMarketContextPrompt("Would you recommend LedgerFox?", "United States");
    const updated = renderMarketContextPrompt(old, "Singapore");
    expect(updated).toBe(`${marketContextPrefix("Singapore")}\n\nWould you recommend LedgerFox?`);
    expect(updated).not.toContain("Market context: United States");
  });

  it("scans missing, unknown, and altered market context while exempting representation", () => {
    const cells = [
      { id: "a", intent: "discovery", marketId: null, variantKey: "v1", resolvedText: "Question" },
      { id: "b", intent: "validation", marketId: "outside", variantKey: "v2", resolvedText: "Question" },
      { id: "c", intent: "objection", marketId: "sg", variantKey: "v3", resolvedText: "Question" },
      { id: "d", intent: "representation", marketId: null, variantKey: "a1", resolvedText: "What is LedgerFox?" },
    ];
    expect(scanMarketContextCells(cells, [{ id: "sg", name: "Singapore" }])).toEqual([
      expect.objectContaining({ cellId: "a", reason: "missing_market" }),
      expect.objectContaining({ cellId: "b", reason: "unknown_market" }),
      expect.objectContaining({ cellId: "c", reason: "invalid_context", marketName: "Singapore" }),
    ]);
  });
});

describe("balanced brand order helpers (M46/D-117)", () => {
  const roster = ["LedgerFox", "SpendPilot", "Northstar AP", "CloseBooks AI"];

  it("rotates cyclically and balances position counts within one", () => {
    const orders = balancedBrandOrders(roster, 12, seededRng(3));
    expect(orders[0]).toEqual(rotateBrandOrder(orders[0]!, 0));
    expect(orders[1]).toEqual(rotateBrandOrder(orders[0]!, 1));
    const counts = roster.map(() => new Array(roster.length).fill(0));
    for (const order of orders) {
      expect(brandRosterMatches(order, roster)).toBe(true);
      order.forEach((name, pos) => {
        counts[roster.indexOf(name)]![pos] += 1;
      });
    }
    for (const perBrand of counts) {
      expect(Math.max(...perBrand) - Math.min(...perBrand)).toBeLessThanOrEqual(1);
    }
  });

  it("nextBalancedBrandOrder continues the rotation sequence", () => {
    const base = shuffle(roster, seededRng(11));
    const existing = [0, 1, 2].map((i) => rotateBrandOrder(base, i));
    expect(nextBalancedBrandOrder(existing, roster, seededRng(99))).toEqual(
      rotateBrandOrder(base, 3),
    );
  });

  it("seeded comparison templates use brand_list and keep ranking prompts unbranded", () => {
    const comparison = TEMPLATE_SEED.filter((t) => t.intent === "comparison");
    expect(comparison.length).toBeGreaterThan(0);
    for (const t of comparison) {
      expect(t.text).toContain("{brand_list}");
      expect(t.text).not.toContain("{competitor_list}");
    }
    const ranking = TEMPLATE_SEED.filter(
      (t) =>
        (t.intent === "discovery" || t.intent === "consideration") &&
        t.text.toLowerCase().includes("rank"),
    );
    expect(ranking.length).toBeGreaterThan(0);
    for (const t of ranking) {
      expect(t.text).not.toContain("{brand_list}");
      expect(t.text).not.toContain("{client_brand}");
      expect(t.text).not.toContain("{competitor_list}");
    }
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
    // M45 / D-115: compact matching means the spaced alias "Ledger Fox" is
    // ALSO found in "ledgerfox" — spacing variants of the same brand are one
    // term family now, so both terms report. Sorted for determinism.
    expect(findBrandTerms("Why choose ledgerfox?", brands).sort()).toEqual([
      "Ledger Fox",
      "LedgerFox",
    ]);
    expect(findBrandTerms("Compare ledger  fox and spendpilot", brands)).toEqual(
      expect.arrayContaining(["Ledger Fox", "LedgerFox", "SpendPilot"]),
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
    // M45 / D-115: the compact matcher reports the whole term family
    // (name + spaced alias) wherever either form appears.
    expect(violations.map((v) => ({ ...v, terms: [...v.terms].sort() }))).toEqual([
      { cellId: "a", intent: "discovery", terms: ["Ledger Fox", "LedgerFox"] },
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
