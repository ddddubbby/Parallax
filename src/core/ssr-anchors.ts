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
const SENTENCES_PER_SET = 5;

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
  if (!Array.isArray(set.sets) || set.sets.length < MIN_ANCHOR_SETS) {
    throw new Error(`SSR anchor set ${set.version} needs at least ${MIN_ANCHOR_SETS} sentence sets`);
  }

  const scores = new Set<number>();
  for (const sentenceSet of set.sets as Array<Partial<SsrAnchorSentenceSet>>) {
    const score = sentenceSet.score;
    if (score === undefined || ![1, 2, 3, 4, 5].includes(score)) {
      throw new Error(`SSR anchor set ${set.version} has an invalid Likert score`);
    }
    scores.add(score);
    if (!Array.isArray(sentenceSet.sentences) || sentenceSet.sentences.length !== SENTENCES_PER_SET) {
      throw new Error(
        `SSR anchor set ${set.version} requires exactly ${SENTENCES_PER_SET} sentences per set`,
      );
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
