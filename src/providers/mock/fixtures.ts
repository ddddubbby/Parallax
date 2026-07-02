import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Citation } from "../types";

export interface MockFixture {
  id: string;
  archetype: string;
  text: string;
  citations: Citation[];
}

// process.cwd()-relative, matching scripts/seed.ts — a bundler-relative
// `new URL(..., import.meta.url)` path reaching outside src/ does not
// survive Next's server webpack bundling.
const FIXTURES_PATH = join(process.cwd(), "fixtures", "mock-responses", "fixtures.json");

let cached: MockFixture[] | null = null;

export function loadMockFixtures(): MockFixture[] {
  if (!cached) {
    cached = JSON.parse(readFileSync(FIXTURES_PATH, "utf8")) as MockFixture[];
  }
  return cached;
}
