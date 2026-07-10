/** Build a count-blinded concept review packet and unlocked draft mapping. */
import "../../src/env-bootstrap";
import { basename, join } from "node:path";
import {
  OUT_DIR,
  embedTexts,
  ensureDirs,
  log,
  preflightCredentials,
  readJson,
  reportFatal,
  writeJson,
} from "./shared";
import {
  completeLinkClusters,
  createBlindReviewPacket,
  type LabelVector,
  type LockedConceptMap,
  type V3ExtractionRecord,
} from "./v3-core";
import { V3_REVIEW_VERSION, sha256 } from "./v3-protocol";

interface Artifact {
  extractionManifestHash: string | null;
  records: V3ExtractionRecord[];
}

function requiredArg(name: string): string {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length);
  if (!value) throw new Error(`--${name}=... is required`);
  return value;
}

async function main() {
  ensureDirs();
  const artifactPath = requiredArg("artifact");
  const threshold = Number(requiredArg("threshold"));
  if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 1) {
    throw new Error("threshold must be in (0,1]");
  }
  await preflightCredentials(["openai"]);
  const artifact = readJson<Artifact>(artifactPath);
  if (!artifact.extractionManifestHash) throw new Error("artifact has no extraction manifest hash");
  if (artifact.records.length === 0) throw new Error("artifact has no extraction records");
  if (artifact.records.some((record) => record.extractionManifestHash !== artifact.extractionManifestHash)) {
    throw new Error("record/extraction manifest mismatch");
  }
  const packet = createBlindReviewPacket(artifact.records, artifact.extractionManifestHash);
  const embedded = await embedTexts(packet.items.map((item) => item.label));
  const vectors: LabelVector[] = packet.items.map((item, index) => ({
    label: item.label,
    vector: embedded.vectors[index]!,
  }));
  const clusters = completeLinkClusters(vectors, threshold);
  const mappings: LockedConceptMap["mappings"] = packet.items.map((item) => {
    const cluster = clusters.find((candidate) => candidate.includes(item.label))!;
    return {
      labelId: item.labelId,
      conceptId: `concept-${sha256(cluster.join("|")).slice(0, 12)}`,
      action: "accept",
    };
  });
  const draftMap: LockedConceptMap & {
    instructions: string[];
    clustering: Record<string, unknown>;
  } = {
    reviewVersion: V3_REVIEW_VERSION,
    packetHash: packet.packetHash,
    lockedAt: "",
    reviewer: "",
    mappings,
    instructions: [
      "Review without opening generation counts, prompt variants, cell ids, provider outcomes or eligibility output.",
      "Assign the same conceptId only when labels express the same underlying concept across dimensions.",
      "Keep strategically distinct concepts separate. Set action=reject and conceptId=null for unsupported/about-wrong-entity labels.",
      "After deciding every item, set reviewer and lockedAt. Any later mapping change requires a new review version.",
    ],
    clustering: {
      method: "complete_link",
      threshold,
      embeddingModel: embedded.model,
      embeddingCostUsd: embedded.costUsd,
      proposedClusters: clusters,
    },
  };
  const stem = basename(artifactPath).replace(/\.json$/, "");
  const packetPath = join(OUT_DIR, `${stem}-review-packet.json`);
  const mapPath = join(OUT_DIR, `${stem}-concept-map.draft.json`);
  writeJson(packetPath, packet);
  writeJson(mapPath, draftMap);
  log("v3-review", `packet=${packetPath}; draft=${mapPath}; labels=${packet.items.length}`);
}

main().catch((error) => process.exit(reportFatal(error)));
