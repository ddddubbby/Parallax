/** Score one manifest-locked v3 artifact only after its blinded concept map is locked. */
import "../../src/env-bootstrap";
import { basename, join } from "node:path";
import {
  OUT_DIR,
  ensureDirs,
  log,
  readJson,
  reportFatal,
  writeJson,
} from "./shared";
import {
  assertLockedConceptMap,
  createBlindReviewPacket,
  evaluateNeutralProfile,
  type LockedConceptMap,
  type V3ExtractionRecord,
} from "./v3-core";
import { V3_PREREGISTERED_RULES, hashCanonical } from "./v3-protocol";

interface Artifact {
  manifestHash: string;
  extractionManifestHash: string | null;
  records: V3ExtractionRecord[];
  generationCostUsd: number;
  extractionCostUsd: number;
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
  const mapPath = requiredArg("concept-map");
  const artifact = readJson<Artifact>(artifactPath);
  if (!artifact.extractionManifestHash) throw new Error("artifact extraction is incomplete");
  const packet = createBlindReviewPacket(artifact.records, artifact.extractionManifestHash);
  const conceptMap = readJson<LockedConceptMap>(mapPath);
  assertLockedConceptMap(packet, conceptMap);
  const result = evaluateNeutralProfile({ records: artifact.records, packet, conceptMap });
  const terminalStates = Object.fromEntries(
    [...new Set(artifact.records.map((record) => record.terminalState))]
      .sort()
      .map((state) => [state, artifact.records.filter((record) => record.terminalState === state).length]),
  );
  const output = {
    analysisVersion: "framing-v3-analysis.v1",
    artifactManifestHash: artifact.manifestHash,
    extractionManifestHash: artifact.extractionManifestHash,
    reviewPacketHash: packet.packetHash,
    conceptMapHash: hashCanonical(conceptMap),
    rules: V3_PREREGISTERED_RULES,
    responseCount: artifact.records.length,
    terminalStates,
    unsupportedFrameCount: artifact.records.reduce(
      (sum, record) => sum + record.unsupportedFrameCount,
      0,
    ),
    result,
    costs: {
      generationUsd: artifact.generationCostUsd,
      extractionUsd: artifact.extractionCostUsd,
    },
    analyzedAt: new Date().toISOString(),
  };
  const outputPath = join(
    OUT_DIR,
    `${basename(artifactPath).replace(/\.json$/, "")}-analysis.json`,
  );
  writeJson(outputPath, output);
  log("v3-analyze", `status=${result.status}; output=${outputPath}`);
  if (result.status !== "eligible") process.exitCode = 2;
}

main().catch((error) => process.exit(reportFatal(error)));
