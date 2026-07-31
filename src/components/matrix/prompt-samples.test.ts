import { describe, expect, it } from "vitest";
import { representativePromptSamples } from "./prompt-samples";
import type { Intent } from "@/core/matrix";

function cell(id: string, intent: Intent, text: string) {
  return {
    id,
    intent,
    personaLabel: "Buyer",
    marketLabel: "US",
    resolvedText: text,
  };
}

describe("representativePromptSamples", () => {
  it("covers each prompt-bearing pillar, then fills by canonical intent order", () => {
    const cells = [
      cell("c-validation", "validation", "validation prompt"),
      cell("c-discovery-b", "discovery", "discovery b"),
      cell("c-discovery-a", "discovery", "discovery a"),
      cell("c-comparison", "comparison", "comparison prompt"),
      cell("c-consideration", "consideration", "consideration prompt"),
      cell("c-objection", "objection", "objection prompt"),
    ];
    const samples = representativePromptSamples(cells, 5);
    expect(samples.map((c) => c.id)).toEqual([
      "c-consideration",
      "c-comparison",
      "c-validation",
      "c-objection",
      "c-discovery-a",
    ]);
  });

  it("is stable by id within an intent and handles empty limits", () => {
    expect(
      representativePromptSamples([
        cell("c-discovery-b", "discovery", "b"),
        cell("c-discovery-a", "discovery", "a"),
      ], 1).map((c) => c.id),
    ).toEqual(["c-discovery-a"]);
    expect(representativePromptSamples([], 5)).toEqual([]);
    expect(representativePromptSamples([cell("c", "discovery", "c")], 0)).toEqual([]);
  });
});
