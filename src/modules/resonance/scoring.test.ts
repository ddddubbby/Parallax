import { describe, expect, it } from "vitest";
import { embeddingVectorsAreValid } from "./scoring";

describe("SSR embedding vector validation", () => {
  it("accepts finite vectors with the expected count and consistent dimensions", () => {
    expect(embeddingVectorsAreValid([[1, 0], [0.5, 0.5]], 2)).toBe(true);
  });

  it("rejects malformed vectors before SSR scoring can persist NaN metrics", () => {
    expect(embeddingVectorsAreValid([[1, 0]], 2)).toBe(false);
    expect(embeddingVectorsAreValid([[1, 0], []], 2)).toBe(false);
    expect(embeddingVectorsAreValid([[1, 0], [0.5]], 2)).toBe(false);
    expect(embeddingVectorsAreValid([[1, Number.NaN], [0.5, 0.5]], 2)).toBe(false);
    expect(embeddingVectorsAreValid([[1, "0"], [0.5, 0.5]], 2)).toBe(false);
  });
});
