import anchorFixture from "../../fixtures/ssr/anchor-sets.json";

export interface SsrAnchorSentenceSet {
  score: 1 | 2 | 3 | 4 | 5;
  sentences: string[];
}

export interface SsrAnchorSet {
  version: string;
  construct: "purchase_intent";
  calibrated: boolean;
  sets: SsrAnchorSentenceSet[];
}

const MIN_ANCHOR_SETS = 4;
const TARGET_ANCHOR_SETS = 6;

function assertAnchorSet(raw: unknown): asserts raw is SsrAnchorSet {
  const set = raw as Partial<SsrAnchorSet>;
  if (typeof set.version !== "string" || set.version.length === 0) {
    throw new Error("SSR anchor set is missing a version");
  }
  if (set.construct !== "purchase_intent") {
    throw new Error(`SSR anchor set ${set.version} has unsupported construct`);
  }
  if (typeof set.calibrated !== "boolean") {
    throw new Error(`SSR anchor set ${set.version} is missing calibrated flag`);
  }
  if (!Array.isArray(set.sets) || set.sets.length !== 5) {
    throw new Error(`SSR anchor set ${set.version} needs one sentence bucket for each Likert score`);
  }

  const scores = new Set<number>();
  let sentenceCount: number | null = null;
  for (const sentenceSet of set.sets as Array<Partial<SsrAnchorSentenceSet>>) {
    const score = sentenceSet.score;
    if (score === undefined || ![1, 2, 3, 4, 5].includes(score)) {
      throw new Error(`SSR anchor set ${set.version} has an invalid Likert score`);
    }
    if (scores.has(score)) {
      throw new Error(`SSR anchor set ${set.version} has duplicate score ${score}`);
    }
    scores.add(score);
    if (!Array.isArray(sentenceSet.sentences) || sentenceSet.sentences.length < MIN_ANCHOR_SETS) {
      throw new Error(
        `SSR anchor set ${set.version} requires at least ${MIN_ANCHOR_SETS} sentences per score`,
      );
    }
    sentenceCount ??= sentenceSet.sentences.length;
    if (sentenceSet.sentences.length !== sentenceCount) {
      throw new Error(`SSR anchor set ${set.version} must have the same sentence count for every score`);
    }
    for (const sentence of sentenceSet.sentences) {
      if (typeof sentence !== "string" || sentence.trim().length === 0) {
        throw new Error(`SSR anchor set ${set.version} includes an empty sentence`);
      }
    }
  }

  for (const score of [1, 2, 3, 4, 5]) {
    if (!scores.has(score)) throw new Error(`SSR anchor set ${set.version} is missing score ${score}`);
  }
}

const ANCHOR_SETS: SsrAnchorSet[] = anchorFixture.map((raw) => {
  assertAnchorSet(raw);
  return raw;
});

export function listSsrAnchorSets(): SsrAnchorSet[] {
  return ANCHOR_SETS;
}

export function getSsrAnchorSet(version: string): SsrAnchorSet {
  const found = ANCHOR_SETS.find((set) => set.version === version);
  if (!found) throw new Error(`Unknown SSR anchor set version: ${version}`);
  return found;
}

export function anchorStatementSets(anchorSet: SsrAnchorSet): string[][] {
  const byScore = [...anchorSet.sets].sort((a, b) => a.score - b.score);
  const count = byScore[0]?.sentences.length ?? 0;
  if (count < MIN_ANCHOR_SETS) {
    throw new Error(`SSR anchor set ${anchorSet.version} needs at least ${MIN_ANCHOR_SETS} statement sets`);
  }
  return Array.from({ length: count }, (_, idx) => byScore.map((bucket) => bucket.sentences[idx]));
}

export const SSR_TARGET_ANCHOR_SET_COUNT = TARGET_ANCHOR_SETS;
