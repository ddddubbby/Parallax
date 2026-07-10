import {
  V3_PREREGISTERED_RULES,
  hashCanonical,
  sha256,
  type V3Dimension,
  type V3FrameKind,
  type V3Stance,
  type V3TerminalState,
} from "./v3-protocol";

export interface RawV3Frame {
  concept_label: string;
  frame_dimension: V3Dimension;
  frame_kind: V3FrameKind;
  stance: V3Stance;
  evidence_quote: string;
}

export interface VerifiedV3Frame {
  conceptLabel: string;
  dimension: V3Dimension;
  kind: V3FrameKind;
  stance: V3Stance;
  evidenceQuote: string;
  evidenceStart: number;
  evidenceEnd: number;
}

export interface V3ExtractionRecord {
  responseId: string;
  projectKey: string;
  brandName: string;
  lane: "neutral_elicited" | "organic_in_context";
  providerId: string;
  generationMode: string;
  sourceRunId: string | null;
  standardExtractionVersion: number | null;
  variantKey: string | null;
  cellId: string | null;
  repIndex: number | null;
  terminalState: V3TerminalState;
  frames: VerifiedV3Frame[];
  unsupportedFrameCount: number;
  rawTextHash: string;
  extractorInputHash: string;
  generationManifestHash: string;
  extractionManifestHash: string;
  model: string;
  costUsd: number;
}

export interface RunManifest {
  manifestVersion: "m34-run-manifest.v1";
  stage: "development" | "heldout" | "control";
  projectKey: string;
  brandName: string;
  providerId: string;
  generationMode: "ungrounded";
  modelRequested: string | null;
  decoding: { temperature: number | null };
  promptProtocolVersion: string;
  promptArm: string;
  prompts: Array<{ variantKey: string; text: string }>;
  repetitions: number;
  sourceRunId: string | null;
  standardExtractionVersion: number | null;
  protocolVersion: string;
  createdAt: string;
}

export function createRunManifest(
  input: Omit<RunManifest, "manifestVersion" | "createdAt"> & { createdAt?: string },
): RunManifest {
  return {
    manifestVersion: "m34-run-manifest.v1",
    ...input,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

export function immutableManifestHash(manifest: RunManifest): string {
  const { createdAt: _createdAt, ...identity } = manifest;
  return hashCanonical(identity);
}

export function assertManifestMatch(expectedHash: string, actual: RunManifest): void {
  const actualHash = immutableManifestHash(actual);
  if (actualHash !== expectedHash) {
    throw new Error(
      `manifest mismatch: existing=${expectedHash} requested=${actualHash}; start a new run instead of resuming`,
    );
  }
}

export function normalizeConceptLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function resolveExactEvidenceOffset(
  rawText: string,
  quote: string,
): { start: number; end: number } | null {
  if (quote.length < 16 || quote.length > 240) return null;
  const start = rawText.indexOf(quote);
  if (start < 0) return null;
  return { start, end: start + quote.length };
}

export function verifyV3Frames(
  rawText: string,
  state: V3TerminalState,
  frames: RawV3Frame[],
): { state: V3TerminalState; frames: VerifiedV3Frame[]; unsupportedFrameCount: number } {
  const verified: VerifiedV3Frame[] = [];
  let unsupportedFrameCount = 0;
  for (const frame of frames) {
    const conceptLabel = normalizeConceptLabel(frame.concept_label);
    const offset = resolveExactEvidenceOffset(rawText, frame.evidence_quote);
    if (!conceptLabel || !offset) {
      unsupportedFrameCount += 1;
      continue;
    }
    verified.push({
      conceptLabel,
      dimension: frame.frame_dimension,
      kind: frame.frame_kind,
      stance: frame.stance,
      evidenceQuote: frame.evidence_quote,
      evidenceStart: offset.start,
      evidenceEnd: offset.end,
    });
  }
  return {
    state: state === "ok" && verified.length === 0 ? "insufficient_evidence" : state,
    frames: verified,
    unsupportedFrameCount,
  };
}

export function rawTextHash(rawText: string): string {
  return sha256(rawText);
}

export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let aa = 0;
  let bb = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index]! * b[index]!;
    aa += a[index]! * a[index]!;
    bb += b[index]! * b[index]!;
  }
  return aa === 0 || bb === 0 ? 0 : dot / Math.sqrt(aa * bb);
}

export interface LabelVector {
  label: string;
  vector: readonly number[];
}

function clusterKey(cluster: readonly string[]): string {
  return [...cluster].sort().join("|");
}

export function completeLinkClusters(
  inputs: readonly LabelVector[],
  threshold: number,
): string[][] {
  const vectors = new Map(inputs.map((item) => [item.label, item.vector]));
  const uniqueLabels = [...new Set(inputs.map((item) => item.label))].sort();
  const clusters: string[][] = uniqueLabels.map((label) => [label]);

  while (true) {
    let candidate: { left: number; right: number; similarity: number; key: string } | null = null;
    for (let left = 0; left < clusters.length; left += 1) {
      for (let right = left + 1; right < clusters.length; right += 1) {
        let minimum = 1;
        for (const a of clusters[left]!) {
          for (const b of clusters[right]!) {
            minimum = Math.min(minimum, cosineSimilarity(vectors.get(a)!, vectors.get(b)!));
          }
        }
        if (minimum < threshold) continue;
        const key = `${clusterKey(clusters[left]!)}::${clusterKey(clusters[right]!)}`;
        if (
          candidate === null ||
          minimum > candidate.similarity ||
          (minimum === candidate.similarity && key < candidate.key)
        ) {
          candidate = { left, right, similarity: minimum, key };
        }
      }
    }
    if (candidate === null) break;
    const merged = [...clusters[candidate.left]!, ...clusters[candidate.right]!].sort();
    clusters.splice(candidate.right, 1);
    clusters.splice(candidate.left, 1, merged);
  }
  return clusters.sort((a, b) => clusterKey(a).localeCompare(clusterKey(b)));
}

export interface BlindReviewPacket {
  packetVersion: "blind-review-packet.v1";
  extractionManifestHash: string;
  items: Array<{
    labelId: string;
    label: string;
    dimensions: V3Dimension[];
    kinds: V3FrameKind[];
    supportExcerpt: string;
  }>;
  packetHash: string;
}

export function createBlindReviewPacket(
  records: readonly V3ExtractionRecord[],
  extractionManifestHash: string,
): BlindReviewPacket {
  const frames = records.flatMap((record) => record.frames);
  const labels = [...new Set(frames.map((frame) => frame.conceptLabel))].sort();
  const items = labels.map((label) => {
    const matches = frames.filter((frame) => frame.conceptLabel === label);
    const excerpt = [...matches.map((frame) => frame.evidenceQuote)].sort()[0] ?? "";
    return {
      labelId: sha256(label).slice(0, 12),
      label,
      dimensions: [...new Set(matches.map((frame) => frame.dimension))].sort(),
      kinds: [...new Set(matches.map((frame) => frame.kind))].sort(),
      supportExcerpt: excerpt,
    };
  });
  const body = {
    packetVersion: "blind-review-packet.v1" as const,
    extractionManifestHash,
    items,
  };
  return { ...body, packetHash: hashCanonical(body) };
}

export interface LockedConceptMap {
  reviewVersion: string;
  packetHash: string;
  lockedAt: string;
  reviewer: string;
  mappings: Array<{
    labelId: string;
    conceptId: string | null;
    action: "accept" | "reject";
  }>;
}

export function assertLockedConceptMap(
  packet: BlindReviewPacket,
  map: LockedConceptMap,
): void {
  if (!map.lockedAt || !map.reviewer.trim()) throw new Error("concept map is not reviewer-locked");
  if (map.packetHash !== packet.packetHash) throw new Error("concept map packet hash mismatch");
  const expected = new Set(packet.items.map((item) => item.labelId));
  const received = new Set(map.mappings.map((item) => item.labelId));
  if (expected.size !== received.size || [...expected].some((id) => !received.has(id))) {
    throw new Error("concept map must decide every blind packet label exactly once");
  }
}

function conceptLookup(packet: BlindReviewPacket, map: LockedConceptMap): Map<string, string> {
  assertLockedConceptMap(packet, map);
  const labelById = new Map(packet.items.map((item) => [item.labelId, item.label]));
  const result = new Map<string, string>();
  for (const mapping of map.mappings) {
    const label = labelById.get(mapping.labelId)!;
    if (mapping.action === "accept" && mapping.conceptId) result.set(label, mapping.conceptId);
  }
  return result;
}

export type V3EligibilityStatus =
  | "eligible"
  | "extraction_incomplete"
  | "entity_ambiguous"
  | "no_stable_identity"
  | "unstable_profile";

export interface StableConcept {
  conceptId: string;
  kind: V3FrameKind;
  variantWins: number;
  dimensions: Partial<Record<V3Dimension, number>>;
}

export interface V3EligibilityResult {
  status: V3EligibilityStatus;
  stableConcepts: StableConcept[];
  identityConcepts: string[];
  associationConcepts: string[];
  medoidResponseId: string | null;
  diagnostics: Record<string, unknown>;
}

function jaccardDistance(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  const union = new Set([...a, ...b]);
  if (union.size === 0) return 0;
  let intersection = 0;
  for (const value of a) if (b.has(value)) intersection += 1;
  return 1 - intersection / union.size;
}

function selectProfileMedoid(
  responseConcepts: Map<string, Set<string>>,
  stableIds: ReadonlySet<string>,
): string | null {
  const candidates = [...responseConcepts.entries()]
    .map(([responseId, concepts]) => [
      responseId,
      new Set([...concepts].filter((concept) => stableIds.has(concept))),
    ] as const)
    .filter(([, concepts]) => concepts.size > 0);
  if (candidates.length === 0) return null;
  return candidates
    .map(([responseId, concepts]) => ({
      responseId,
      meanDistance:
        candidates.reduce((sum, [, other]) => sum + jaccardDistance(concepts, other), 0) /
        candidates.length,
    }))
    .sort((a, b) => a.meanDistance - b.meanDistance || a.responseId.localeCompare(b.responseId))[0]!
    .responseId;
}

export function evaluateNeutralProfile(input: {
  records: readonly V3ExtractionRecord[];
  packet: BlindReviewPacket;
  conceptMap: LockedConceptMap;
  admissionVariantKeys?: readonly string[];
  repetitions?: number;
}): V3EligibilityResult {
  const admissionVariantKeys =
    input.admissionVariantKeys ?? V3_PREREGISTERED_RULES.admissionVariantKeys;
  const repetitions = input.repetitions ?? V3_PREREGISTERED_RULES.repetitionsPerVariant;
  const records = input.records.filter(
    (record) => record.variantKey && admissionVariantKeys.includes(record.variantKey),
  );
  const byVariant = new Map<string, V3ExtractionRecord[]>();
  for (const variant of admissionVariantKeys) byVariant.set(variant, []);
  for (const record of records) byVariant.get(record.variantKey!)?.push(record);
  const incomplete = [...byVariant.entries()]
    .filter(([, values]) => new Set(values.map((record) => record.responseId)).size !== repetitions)
    .map(([variant, values]) => ({ variant, responses: values.length }));
  if (incomplete.length > 0) {
    return {
      status: "extraction_incomplete",
      stableConcepts: [],
      identityConcepts: [],
      associationConcepts: [],
      medoidResponseId: null,
      diagnostics: { incomplete },
    };
  }
  const ambiguous = records.filter((record) => record.terminalState === "entity_ambiguous");
  if (ambiguous.length > 0) {
    return {
      status: "entity_ambiguous",
      stableConcepts: [],
      identityConcepts: [],
      associationConcepts: [],
      medoidResponseId: null,
      diagnostics: { responseIds: ambiguous.map((record) => record.responseId).sort() },
    };
  }

  const lookup = conceptLookup(input.packet, input.conceptMap);
  const responseConcepts = new Map<string, Set<string>>();
  const kindByConcept = new Map<string, V3FrameKind>();
  const dimensionsByConcept = new Map<string, Map<V3Dimension, number>>();
  for (const record of records) {
    const concepts = new Set<string>();
    for (const frame of record.frames) {
      const conceptId = lookup.get(frame.conceptLabel);
      if (!conceptId) continue;
      concepts.add(conceptId);
      const priorKind = kindByConcept.get(conceptId);
      kindByConcept.set(
        conceptId,
        priorKind === "identity" || frame.kind === "identity" ? "identity" : "association",
      );
      const dimensions = dimensionsByConcept.get(conceptId) ?? new Map<V3Dimension, number>();
      dimensions.set(frame.dimension, (dimensions.get(frame.dimension) ?? 0) + 1);
      dimensionsByConcept.set(conceptId, dimensions);
    }
    responseConcepts.set(record.responseId, concepts);
  }

  const variantWins = new Map<string, Set<string>>();
  for (const [variant, variantRecords] of byVariant) {
    const counts = new Map<string, number>();
    for (const record of variantRecords) {
      for (const concept of responseConcepts.get(record.responseId) ?? []) {
        counts.set(concept, (counts.get(concept) ?? 0) + 1);
      }
    }
    for (const [concept, count] of counts) {
      if (count >= V3_PREREGISTERED_RULES.conceptWinsVariantAt) {
        const wins = variantWins.get(concept) ?? new Set<string>();
        wins.add(variant);
        variantWins.set(concept, wins);
      }
    }
  }

  const stableIds = [...variantWins.entries()]
    .filter(([, wins]) => wins.size >= V3_PREREGISTERED_RULES.conceptWinsRequired)
    .filter(([, wins]) =>
      admissionVariantKeys.every((excluded) => {
        const remainingWins = [...wins].filter((variant) => variant !== excluded).length;
        return remainingWins >= V3_PREREGISTERED_RULES.leaveOneVariantOutWinsRequired;
      }),
    )
    .map(([concept]) => concept)
    .sort();

  const stableConcepts = stableIds.map((conceptId) => ({
    conceptId,
    kind: kindByConcept.get(conceptId) ?? "association",
    variantWins: variantWins.get(conceptId)!.size,
    dimensions: Object.fromEntries(dimensionsByConcept.get(conceptId) ?? []),
  }));
  const identityConcepts = stableConcepts
    .filter((concept) => concept.kind === "identity")
    .map((concept) => concept.conceptId);
  const associationConcepts = stableConcepts
    .filter((concept) => concept.kind === "association")
    .map((concept) => concept.conceptId);
  if (identityConcepts.length === 0) {
    return {
      status: stableConcepts.length === 0 ? "unstable_profile" : "no_stable_identity",
      stableConcepts,
      identityConcepts,
      associationConcepts,
      medoidResponseId: null,
      diagnostics: { variantWins: Object.fromEntries([...variantWins].map(([k, v]) => [k, [...v].sort()])) },
    };
  }
  return {
    status: "eligible",
    stableConcepts,
    identityConcepts,
    associationConcepts,
    medoidResponseId: selectProfileMedoid(responseConcepts, new Set(stableIds)),
    diagnostics: { variantWins: Object.fromEntries([...variantWins].map(([k, v]) => [k, [...v].sort()])) },
  };
}

export function assertOrganicPin(records: readonly V3ExtractionRecord[]): void {
  const runIds = new Set(records.map((record) => record.sourceRunId));
  const versions = new Set(records.map((record) => record.standardExtractionVersion));
  if (runIds.size !== 1 || runIds.has(null)) throw new Error("organic evidence must pin exactly one source run");
  if (versions.size !== 1 || versions.has(null)) {
    throw new Error("organic evidence must pin exactly one standard extraction version");
  }
}
