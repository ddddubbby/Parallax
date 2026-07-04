import { describe, expect, it } from "vitest";
import {
  attributesSchema,
  basicsSchema,
  competitorsSchema,
  findAliasOverlaps,
  normalizePhrase,
  personasSchema,
  slugify,
  validateStep,
} from "./intake";

describe("intake step schemas", () => {
  it("requires a category archetype in basics (AT-1)", () => {
    expect(
      basicsSchema.safeParse({
        name: "Heytea",
        category: "bubble tea",
        job_to_be_done: "choose a drink",
      }).success,
    ).toBe(false);
    expect(
      basicsSchema.safeParse({
        name: "Heytea",
        category_archetype: "consumer_venue",
        category: "bubble tea",
        job_to_be_done: "choose a drink",
      }).success,
    ).toBe(true);
  });

  it("rejects fewer than 3 competitors (BC-2)", () => {
    const result = competitorsSchema.safeParse({
      competitors: [{ name: "A", aliases: [] }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts 3 competitors and trims fields", () => {
    const result = competitorsSchema.safeParse({
      competitors: [
        { name: " A ", aliases: ["a1"] },
        { name: "B", aliases: [], domain: "" },
        { name: "C", aliases: [] },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.competitors[0].name).toBe("A");
      expect(result.data.competitors[1].domain).toBeUndefined();
    }
  });

  it("enforces 6-12 unique attributes after normalization (CM-2)", () => {
    const five = ["a", "b", "c", "d", "e"];
    expect(attributesSchema.safeParse({ attributes: five }).success).toBe(false);
    const withDupe = ["Easy  Setup", "easy setup", "c", "d", "e", "f"];
    expect(attributesSchema.safeParse({ attributes: withDupe }).success).toBe(false);
    const six = ["a", "b", "c", "d", "e", "f"];
    expect(attributesSchema.safeParse({ attributes: six }).success).toBe(true);
  });

  it("enforces 2-5 personas (CM-3)", () => {
    expect(
      personasSchema.safeParse({ personas: [{ title: "VP" }] }).success,
    ).toBe(false);
    expect(
      personasSchema.safeParse({
        personas: [{ title: "VP" }, { title: "Controller" }],
      }).success,
    ).toBe(true);
  });

  it("returns field-level errors keyed by path (PS-3)", () => {
    const result = validateStep("competitors", {
      competitors: [
        { name: "", aliases: [] },
        { name: "B", aliases: [] },
        { name: "C", aliases: [] },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors["competitors.0.name"]).toContain("Required");
    }
  });
});

describe("alias overlap (BC-3)", () => {
  it("flags the same alias on two brands, case/space-insensitive", () => {
    const overlaps = findAliasOverlaps([
      { name: "LedgerFox", aliases: ["Ledger  Fox"] },
      { name: "Northstar", aliases: ["ledger fox"] },
    ]);
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0].brands).toEqual(["LedgerFox", "Northstar"]);
  });

  it("does not flag a brand overlapping itself", () => {
    expect(
      findAliasOverlaps([{ name: "LedgerFox", aliases: ["ledgerfox"] }]),
    ).toHaveLength(0);
  });
});

describe("helpers", () => {
  it("normalizes phrases", () => {
    expect(normalizePhrase("  Easy   Setup ")).toBe("easy setup");
  });

  it("slugifies names with a suffix", () => {
    expect(slugify("LedgerFox AI Demo!", "ab12")).toBe("ledgerfox-ai-demo-ab12");
    expect(slugify("---", "ab12")).toBe("project-ab12");
  });
});
