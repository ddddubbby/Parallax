import { describe, expect, it } from "vitest";
import {
  baselineStampSchema,
  groupResponsesByAttributeThemes,
  isSingleInstance,
  recurrenceLine,
} from "./baseline";

const stamp = {
  responseId: "6f9619ff-8b86-4d01-b42d-00cf4fc964ff",
  providerId: "mock",
  generationMode: "ungrounded",
  modelVersion: "mock-1",
  promptText: "best 360 cameras for beginners",
  respondedAt: "2026-07-19T00:00:00.000Z",
  themeLabel: "budget-friendly",
  recurrence: { matching: 12, total: 30 },
};

describe("baseline stamp (M44 / D-114)", () => {
  it("validates the strict stamp shape", () => {
    expect(baselineStampSchema.parse(stamp)).toEqual(stamp);
    expect(() => baselineStampSchema.parse({ ...stamp, extra: 1 })).toThrow();
    expect(() => baselineStampSchema.parse({ ...stamp, responseId: "not-a-uuid" })).toThrow();
  });

  it("renders the truthful recurrence line, never 'recurring' without its count", () => {
    expect(recurrenceLine(stamp)).toBe("theme appears in 12/30 sampled responses");
    expect(recurrenceLine({ ...stamp, recurrence: { matching: 1, total: 30 } })).toBe(
      "SINGLE OBSERVED INSTANCE",
    );
    expect(recurrenceLine({ ...stamp, recurrence: null, themeLabel: null })).toBe(
      "SINGLE OBSERVED INSTANCE",
    );
  });

  it("flags single instances", () => {
    expect(isSingleInstance(stamp)).toBe(false);
    expect(isSingleInstance({ ...stamp, recurrence: { matching: 0, total: 30 } })).toBe(true);
    expect(isSingleInstance({ ...stamp, recurrence: null })).toBe(true);
  });
});

describe("groupResponsesByAttributeThemes", () => {
  it("groups by normalized attribute with descriptive counts over the full set", () => {
    const themes = groupResponsesByAttributeThemes([
      { responseId: "r1", attributes: ["Budget-friendly", "reliable"] },
      { responseId: "r2", attributes: ["Budget-friendly"] },
      { responseId: "r3", attributes: [] },
    ]);
    expect(themes[0]).toMatchObject({ key: "budget-friendly", matching: 2, total: 3 });
    expect(themes[0].label).toBe("Budget-friendly");
    expect(themes[1]).toMatchObject({ key: "reliable", matching: 1, total: 3 });
  });

  it("is deterministic: count desc, then key asc; capped", () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({
      responseId: `r${i}`,
      attributes: [`attr-${i % 10}`],
    }));
    const themes = groupResponsesByAttributeThemes(rows);
    expect(themes).toHaveLength(8);
    expect(themes.map((t) => t.key).slice(0, 2)).toEqual(["attr-0", "attr-1"]);
  });

  it("a response can evidence several themes; empty input yields no themes", () => {
    expect(groupResponsesByAttributeThemes([])).toEqual([]);
    const themes = groupResponsesByAttributeThemes([
      { responseId: "r1", attributes: ["a", "b"] },
    ]);
    expect(themes.every((t) => t.responseIds.includes("r1"))).toBe(true);
  });
});
