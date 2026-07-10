/** Run all four immutable v3 controls through offsets, clustering, blind review and eligibility. */
import "../../src/env-bootstrap";
import { join } from "node:path";
import {
  OUT_DIR,
  embedTexts,
  ensureDirs,
  log,
  preflightCredentials,
  reportFatal,
  writeJson,
} from "./shared";
import {
  completeLinkClusters,
  cosineSimilarity,
  createBlindReviewPacket,
  evaluateNeutralProfile,
  verifyV3Frames,
  type LabelVector,
  type LockedConceptMap,
  type RawV3Frame,
  type V3ExtractionRecord,
} from "./v3-core";
import {
  V3_ADMISSION_PROMPTS,
  V3_CLUSTERING_VERSION,
  V3_PREREGISTERED_RULES,
  hashCanonical,
  sha256,
} from "./v3-protocol";

type ControlName =
  | "synonym_consolidation"
  | "distinct_concepts"
  | "polysemy"
  | "over_merge";

interface ControlCase {
  name: ControlName;
  expectedStatus: "eligible" | "unstable_profile";
  expectedIdentityCount: number;
  labels: string[];
  records: V3ExtractionRecord[];
}

function frame(label: string, quote: string, dimension: "category" | "offering"): RawV3Frame {
  return {
    concept_label: label,
    frame_dimension: dimension,
    frame_kind: "identity",
    stance: "stated",
    evidence_quote: quote,
  };
}

function controlRecord(input: {
  control: ControlName;
  variantKey: string;
  repIndex: number;
  rawText: string;
  frames: RawV3Frame[];
}): V3ExtractionRecord {
  const verified = verifyV3Frames(input.rawText, "ok", input.frames);
  return {
    responseId: `${input.control}-${input.variantKey}-r${input.repIndex}`,
    projectKey: input.control,
    brandName: "ControlBrand",
    lane: "neutral_elicited",
    providerId: "control",
    generationMode: "ungrounded",
    sourceRunId: null,
    standardExtractionVersion: null,
    variantKey: input.variantKey,
    cellId: null,
    repIndex: input.repIndex,
    terminalState: verified.state,
    frames: verified.frames,
    unsupportedFrameCount: verified.unsupportedFrameCount,
    rawTextHash: sha256(input.rawText),
    extractorInputHash: "control-input",
    generationManifestHash: "control-generation",
    extractionManifestHash: "control-extraction",
    model: "immutable-control",
    costUsd: 0,
  };
}

function buildControls(): ControlCase[] {
  const variants = V3_ADMISSION_PROMPTS.map((prompt) => prompt.variantKey);
  const synonymLabels = ["foam clog", "foam clog shoe", "foam clog footwear"];
  const distinctLabels = ["tea shop", "action camera", "financial software", "running shoe", "hotel chain"];
  return [
    {
      name: "synonym_consolidation",
      expectedStatus: "eligible",
      expectedIdentityCount: 1,
      labels: synonymLabels,
      records: variants.flatMap((variantKey) =>
        Array.from({ length: 5 }, (_, index) => {
          const label = synonymLabels[index % synonymLabels.length]!;
          const quote = `ControlBrand is described as ${label} for everyday wear.`;
          return controlRecord({
            control: "synonym_consolidation",
            variantKey,
            repIndex: index + 1,
            rawText: quote,
            frames: [frame(label, quote, "category")],
          });
        }),
      ),
    },
    {
      name: "distinct_concepts",
      expectedStatus: "unstable_profile",
      expectedIdentityCount: 0,
      labels: distinctLabels,
      records: variants.flatMap((variantKey) =>
        Array.from({ length: 5 }, (_, index) => {
          const label = distinctLabels[index]!;
          const quote = `ControlBrand is described as a ${label} in this response.`;
          return controlRecord({
            control: "distinct_concepts",
            variantKey,
            repIndex: index + 1,
            rawText: quote,
            frames: [frame(label, quote, "category")],
          });
        }),
      ),
    },
    {
      name: "polysemy",
      expectedStatus: "eligible",
      expectedIdentityCount: 1,
      labels: ["action camera"],
      records: variants.flatMap((variantKey) =>
        Array.from({ length: 5 }, (_, index) => {
          const quote = "ControlBrand is an action camera brand offering action camera devices.";
          return controlRecord({
            control: "polysemy",
            variantKey,
            repIndex: index + 1,
            rawText: quote,
            frames: [
              frame("action camera", quote, index % 2 === 0 ? "category" : "offering"),
            ],
          });
        }),
      ),
    },
    {
      name: "over_merge",
      expectedStatus: "eligible",
      expectedIdentityCount: 2,
      labels: ["budget action camera", "professional action camera"],
      records: variants.flatMap((variantKey) =>
        Array.from({ length: 5 }, (_, index) => {
          const budget = "ControlBrand is framed as a budget action camera for casual buyers.";
          const professional = "It is also framed as a professional action camera for production crews.";
          const rawText = `${budget} ${professional}`;
          return controlRecord({
            control: "over_merge",
            variantKey,
            repIndex: index + 1,
            rawText,
            frames: [
              frame("budget action camera", budget, "category"),
              frame("professional action camera", professional, "category"),
            ],
          });
        }),
      ),
    },
  ];
}

async function main() {
  ensureDirs();
  await preflightCredentials(["openai"]);
  const controls = buildControls();
  const labels = [...new Set(controls.flatMap((control) => control.labels))].sort();
  const embedded = await embedTexts(labels);
  const vectors: LabelVector[] = labels.map((label, index) => ({
    label,
    vector: embedded.vectors[index]!,
  }));
  const resultsByThreshold = V3_PREREGISTERED_RULES.clusteringThresholdCandidates.map(
    (threshold) => {
      // Each control is its own project/run scope. Combining their labels would
      // itself violate the no-cross-scope clustering rule and let a label in one
      // control contaminate another control's outcome.
      const clustersByControl = Object.fromEntries(
        controls.map((control) => [
          control.name,
          completeLinkClusters(
            vectors.filter((vector) => control.labels.includes(vector.label)),
            threshold,
          ),
        ]),
      ) as Record<ControlName, string[][]>;
      const clusterFor = (control: ControlName, label: string) =>
        clustersByControl[control].find((cluster) => cluster.includes(label))!;
      const positivePass =
        new Set(
          controls[0]!.labels.map((label) =>
            clusterFor("synonym_consolidation", label).join("|"),
          ),
        ).size === 1;
      const negativePass = controls[1]!.labels.every(
        (label) => clusterFor("distinct_concepts", label).length === 1,
      );
      const polysemyPass = clusterFor("polysemy", "action camera").length === 1;
      const overMergePass =
        clusterFor("over_merge", "budget action camera").join("|") !==
        clusterFor("over_merge", "professional action camera").join("|");
      return {
        threshold,
        pass: positivePass && negativePass && polysemyPass && overMergePass,
        positivePass,
        negativePass,
        polysemyPass,
        overMergePass,
        clustersByControl,
      };
    },
  );
  const selected = [...resultsByThreshold]
    .filter((result) => result.pass)
    .sort((a, b) => b.threshold - a.threshold)[0];
  const pairwiseSimilarities = Object.fromEntries(
    controls.map((control) => [
      control.name,
      control.labels.flatMap((left, leftIndex) =>
        control.labels.slice(leftIndex + 1).map((right) => ({
          left,
          right,
          similarity: cosineSimilarity(
            vectors.find((vector) => vector.label === left)!.vector,
            vectors.find((vector) => vector.label === right)!.vector,
          ),
        })),
      ),
    ]),
  );

  const outputPath = join(OUT_DIR, "v3-controls-result.json");
  if (!selected) {
    writeJson(outputPath, {
      controlVersion: "framing-controls.v3",
      immutableInputHash: hashCanonical(
        controls.map((control) => ({ name: control.name, labels: control.labels, records: control.records })),
      ),
      clusteringVersion: V3_CLUSTERING_VERSION,
      embeddingModel: embedded.model,
      embeddingCostUsd: embedded.costUsd,
      thresholdSelectionRule: V3_PREREGISTERED_RULES.thresholdSelection,
      selectedThreshold: null,
      resultsByThreshold,
      pairwiseSimilarities,
      eligibility: [],
      pass: false,
      executedAt: new Date().toISOString(),
    });
    log("v3-controls", `NO-GO: no threshold passes all controls; diagnostics=${outputPath}`);
    process.exitCode = 2;
    return;
  }

  const eligibility = controls.map((control) => {
    const packet = createBlindReviewPacket(control.records, `control-${control.name}`);
    const mappings = packet.items.map((item) => {
      const cluster = selected.clustersByControl[control.name].find((candidate) =>
        candidate.includes(item.label),
      )!;
      return {
        labelId: item.labelId,
        conceptId: `control-${sha256(cluster.join("|")).slice(0, 10)}`,
        action: "accept" as const,
      };
    });
    const conceptMap: LockedConceptMap = {
      reviewVersion: "blind-review.v1",
      packetHash: packet.packetHash,
      lockedAt: "fixture-lock",
      reviewer: "immutable-control",
      mappings,
    };
    const result = evaluateNeutralProfile({
      records: control.records,
      packet,
      conceptMap,
    });
    return {
      name: control.name,
      expectedStatus: control.expectedStatus,
      expectedIdentityCount: control.expectedIdentityCount,
      actualStatus: result.status,
      actualIdentityCount: result.identityConcepts.length,
      pass:
        result.status === control.expectedStatus &&
        result.identityConcepts.length === control.expectedIdentityCount,
      stableConcepts: result.stableConcepts,
    };
  });
  const pass = eligibility.every((control) => control.pass);
  const output = {
    controlVersion: "framing-controls.v3",
    immutableInputHash: hashCanonical(
      controls.map((control) => ({ name: control.name, labels: control.labels, records: control.records })),
    ),
    clusteringVersion: V3_CLUSTERING_VERSION,
    embeddingModel: embedded.model,
    embeddingCostUsd: embedded.costUsd,
    thresholdSelectionRule: V3_PREREGISTERED_RULES.thresholdSelection,
    selectedThreshold: selected.threshold,
    resultsByThreshold,
    pairwiseSimilarities,
    eligibility,
    pass,
    executedAt: new Date().toISOString(),
  };
  writeJson(outputPath, output);
  log("v3-controls", `pass=${pass}; threshold=${selected.threshold}; output=${outputPath}`);
  if (!pass) process.exitCode = 2;
}

main().catch((error) => process.exit(reportFatal(error)));
