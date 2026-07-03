import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtractedResponse } from "@/core/extraction";
import { loadMockFixtures, type MockFixture } from "./fixtures";

// D-022: mock runs and CI use fixture-backed extraction, never a live
// extraction engine. Given a stored response's raw text, this finds the
// mock-responses fixture that produced it and returns its golden
// extraction if one is authored, or a safe generic fallback otherwise —
// every one of the 38 fixtures must extract successfully, even though
// only the golden-labeled subset gets rich, asserted structure.

const GOLDEN_PATH = join(process.cwd(), "fixtures", "golden", "golden.json");

interface GoldenEntry {
  fixtureId: string;
  expected: ExtractedResponse;
}

let goldenCache: Map<string, ExtractedResponse> | null = null;
let fixtureByTextCache: Map<string, MockFixture> | null = null;

function loadGolden(): Map<string, ExtractedResponse> {
  if (!goldenCache) {
    const entries = JSON.parse(readFileSync(GOLDEN_PATH, "utf8")) as GoldenEntry[];
    goldenCache = new Map(entries.map((e) => [e.fixtureId, e.expected]));
  }
  return goldenCache;
}

function fixtureByText(): Map<string, MockFixture> {
  if (!fixtureByTextCache) {
    fixtureByTextCache = new Map(loadMockFixtures().map((f) => [f.text, f]));
  }
  return fixtureByTextCache;
}

function genericFallback(fixture: MockFixture): ExtractedResponse {
  return {
    schema_version: 1,
    answer_summary: fixture.text.slice(0, 100),
    brands: [],
    citations: fixture.citations.map((c) => ({
      url: c.url,
      domain: c.domain,
      title: c.title ?? null,
      cited_for_brand_ids: [],
    })),
    claims: [],
    refusal: fixture.archetype === "refusal",
    malformed: fixture.archetype === "malformed_output",
  };
}

/** Deep clone so callers can safely mutate (e.g., resolveBrandId in place). */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Given a stored response's raw text, return its extraction. Raw text not
 * matching any known fixture (shouldn't happen for mock-generated
 * responses) throws, since that indicates a real bug rather than a
 * recoverable extraction-quality issue.
 */
export function extractViaMockEngine(rawText: string): ExtractedResponse {
  const fixture = fixtureByText().get(rawText);
  if (!fixture) {
    throw new Error("mock extraction engine: raw text does not match any known fixture");
  }
  const golden = loadGolden().get(fixture.id);
  return clone(golden ?? genericFallback(fixture));
}

export const MOCK_EXTRACTION_MODEL = "mock-fixture-extractor-v1";
