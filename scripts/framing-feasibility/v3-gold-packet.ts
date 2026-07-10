/** Prepare a deterministic, blinded coding-instrument check; no scoring until human review. */
import { basename, join } from "node:path";
import {
  OUT_DIR,
  ensureDirs,
  log,
  readJson,
  reportFatal,
  writeJson,
} from "./shared";
import { hashCanonical, sha256 } from "./v3-protocol";
import type { V3ExtractionRecord } from "./v3-core";

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

function main() {
  ensureDirs();
  const artifactPath = requiredArg("artifact");
  const size = Number(process.argv.find((item) => item.startsWith("--size="))?.slice(7) ?? 24);
  if (!Number.isInteger(size) || size < 12 || size > 40) throw new Error("size must be 12..40");
  const artifact = readJson<Artifact>(artifactPath);
  if (!artifact.extractionManifestHash) throw new Error("artifact extraction is incomplete");
  const candidates = artifact.records
    .flatMap((record) =>
      record.frames.map((frame) => ({
        itemId: sha256(`${record.responseId}|${frame.evidenceStart}|${frame.conceptLabel}`).slice(0, 14),
        responseHash: record.rawTextHash,
        observedBrand: record.brandName,
        conceptLabel: frame.conceptLabel,
        dimension: frame.dimension,
        kind: frame.kind,
        evidenceQuote: frame.evidenceQuote,
        evidenceStart: frame.evidenceStart,
        evidenceEnd: frame.evidenceEnd,
      })),
    )
    .sort((a, b) => sha256(a.itemId).localeCompare(sha256(b.itemId)))
    .slice(0, size);
  const body = {
    packetVersion: "human-coded-instrument-check.v1",
    extractionManifestHash: artifact.extractionManifestHash,
    instructions: [
      "For each item, mark supported=yes only if the quote supports the concept and is about the observed brand.",
      "Verify evidenceStart/evidenceEnd by comparing the quote with the archived raw response; mark offset_exact=yes/no.",
      "Mark dimension_reasonable and kind_reasonable yes/no; supply corrected values when no.",
      "Assign synonym_group only when two labels express the same concept; keep strategically distinct labels separate.",
      "Complete reviewer and lockedAt. This validates the coding instrument, not human-market calibration.",
    ],
    reviewer: "",
    lockedAt: "",
    items: candidates.map((candidate) => ({
      ...candidate,
      coding: {
        supported: null,
        about_observed_brand: null,
        offset_exact: null,
        dimension_reasonable: null,
        kind_reasonable: null,
        corrected_dimension: null,
        corrected_kind: null,
        synonym_group: null,
        notes: "",
      },
    })),
  };
  const output = { ...body, packetHash: hashCanonical(body) };
  const outputPath = join(
    OUT_DIR,
    `${basename(artifactPath).replace(/\.json$/, "")}-human-gold-packet.json`,
  );
  writeJson(outputPath, output);
  log("v3-gold", `items=${candidates.length}; output=${outputPath}`);
}

try {
  main();
} catch (error) {
  process.exit(reportFatal(error));
}
