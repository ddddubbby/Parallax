/**
 * M34A human-review workflow steps after collection:
 *   packet   -> a blind discovery packet plus separate key
 *   lock     -> a versioned codebook lock timestamp
 *   matrix   -> complete-denominator recurrence matrix
 *   snapshot -> immutable-at-handoff simulation evidence snapshot
 *
 * No command scores eligibility, clusters concepts, selects a medoid, or
 * alters simulation approval. Production integration is intentionally later.
 */
import { basename, dirname, join } from "node:path";
import { createHash } from "node:crypto";
import {
  assertCompleteCoding,
  computeRecurrenceMatrix,
  createBlindDiscoveryPacket,
  createSimulationEvidenceSnapshot,
  framingStudySchema,
  lockCodebook,
  lockedCodebookSchema,
  positioningRevealSchema,
  codingRecordSchema,
  type CodebookDraft,
  type CodingRecord,
  type FramingStudy,
  type LockedCodebook,
  type PositioningReveal,
} from "../../src/core/framing-evidence";
import { OUT_DIR, ensureDirs, log, readJson, reportFatal, writeJson } from "./shared";

function requiredArg(name: string): string {
  const value = process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  if (!value) throw new Error(`--${name}=... is required`);
  return value;
}

function optionalArg(name: string): string | null {
  return process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;
}

function outputPath(name: string, explicit: string | null): string {
  return explicit ?? join(OUT_DIR, name);
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function readStudy(path: string): FramingStudy {
  const raw = readJson<{ study?: unknown } | unknown>(path);
  const candidate = raw && typeof raw === "object" && "study" in raw ? (raw as { study: unknown }).study : raw;
  return framingStudySchema.parse(candidate);
}

function sampleResponseIds(study: FramingStudy, size: number): string[] {
  const available = study.responses.filter((response) => response.rawText !== null);
  if (!Number.isInteger(size) || size < 1 || size > available.length) {
    throw new Error(`--sample-size must be an integer from 1 to ${available.length} stored raw responses`);
  }
  // Stable selection before packet shuffling. It considers only response ids,
  // not provider, prompt, outcome, or response content/frequency.
  return [...available]
    .sort((a, b) => a.responseId.localeCompare(b.responseId))
    .slice(0, size)
    .map((response) => response.responseId);
}

function commandPacket() {
  const studyPath = requiredArg("study");
  const study = readStudy(studyPath);
  const responseIds = optionalArg("response-ids")?.split(",").filter(Boolean)
    ?? sampleResponseIds(study, Number(optionalArg("sample-size") ?? Math.min(12, study.responses.length)));
  const packetId = requiredArg("packet-id");
  const createdAt = optionalArg("created-at") ?? new Date().toISOString();
  const shuffleSeed = requiredArg("shuffle-seed");
  const { packet, key } = createBlindDiscoveryPacket({ study, responseIds, packetId, createdAt, shuffleSeed });
  const base = basename(studyPath).replace(/\.json$/, "");
  const packetPath = outputPath(`${base}-${packetId}-blind-packet.json`, optionalArg("out"));
  const keyPath = join(dirname(packetPath), `${basename(packetPath).replace(/(?:-blind-packet)?\.json$/, "")}-blind-key.json`);
  writeJson(packetPath, packet);
  writeJson(keyPath, key);
  log("m34a-workflow", `blind packet=${packetPath}; key=${keyPath}; items=${packet.items.length}`);
}

function commandLock() {
  const draft = readJson<CodebookDraft>(requiredArg("draft"));
  const locked = lockCodebook({ ...draft, lockedAt: requiredArg("locked-at") });
  const path = outputPath(`${locked.codebookId}-${locked.version}-locked.json`, optionalArg("out"));
  writeJson(path, locked);
  log("m34a-workflow", `locked codebook=${path}; associations=${locked.associations.length}`);
}

function readCoding(path: string): CodingRecord {
  return codingRecordSchema.parse(readJson<unknown>(path));
}

function readCodebook(path: string): LockedCodebook {
  return lockedCodebookSchema.parse(readJson<unknown>(path));
}

function commandMatrix() {
  const study = readStudy(requiredArg("study"));
  const codebook = readCodebook(requiredArg("codebook"));
  const coding = readCoding(requiredArg("coding"));
  assertCompleteCoding({ study, codebook, coding });
  const matrix = computeRecurrenceMatrix({ study, codebook, coding });
  const path = outputPath(`${study.studyId}-${coding.codingRunId}-recurrence-matrix.json`, optionalArg("out"));
  writeJson(path, {
    matrixVersion: "m34a-recurrence-matrix.v1",
    studyId: study.studyId,
    codebook: { id: codebook.codebookId, version: codebook.version, lockedAt: codebook.lockedAt },
    codingRun: { id: coding.codingRunId, reviewerId: coding.reviewerId, reviewMethod: coding.reviewMethod },
    rows: matrix,
  });
  log("m34a-workflow", `recurrence matrix=${path}; associations=${matrix.length}; denominator=${study.responses.length}`);
}

function commandSnapshot() {
  const study = readStudy(requiredArg("study"));
  const codebook = readCodebook(requiredArg("codebook"));
  const coding = readCoding(requiredArg("coding"));
  const reveal = positioningRevealSchema.parse(readJson<unknown>(requiredArg("reveal"))) as PositioningReveal;
  const snapshot = createSimulationEvidenceSnapshot({
    study,
    codebook,
    coding,
    reveal,
    responseId: requiredArg("response-id"),
    annotationId: requiredArg("annotation-id"),
  });
  const path = outputPath(`${study.studyId}-${snapshot.annotationId}-simulation-evidence.json`, optionalArg("out"));
  const snapshotSha256 = sha256(JSON.stringify(snapshot));
  writeJson(path, { ...snapshot, snapshotSha256 });
  log("m34a-workflow", `simulation evidence snapshot=${path}; sha256=${snapshotSha256}; ${snapshot.recurrence.label}`);
}

function usage(): never {
  throw new Error(
    "Usage: m34a-workflow <packet|lock|matrix|snapshot> --key=value\n" +
      "packet: --study --packet-id --shuffle-seed [--response-ids=id,id | --sample-size=n] [--out]\n" +
      "lock: --draft --locked-at [--out]\n" +
      "matrix: --study --codebook --coding [--out]\n" +
      "snapshot: --study --codebook --coding --reveal --response-id --annotation-id [--out]",
  );
}

try {
  ensureDirs();
  const command = process.argv.slice(2).find((arg) => arg !== "--" && !arg.startsWith("--"));
  if (command === "packet") commandPacket();
  else if (command === "lock") commandLock();
  else if (command === "matrix") commandMatrix();
  else if (command === "snapshot") commandSnapshot();
  else usage();
} catch (error) {
  process.exit(reportFatal(error));
}
