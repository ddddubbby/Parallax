/** Write the v3 preregistration artifacts before any v3 development scoring. */
import { join } from "node:path";
import { FIXTURES_DIR, ensureDirs, log, writeJson } from "./shared";
import {
  UNCERTAINTY_ALLOWANCE_V3,
  V3_ADMISSION_PROMPTS,
  V3_CLUSTERING_VERSION,
  V3_DIAGNOSTIC_PROBES,
  V3_EXTRACTION_INSTRUCTIONS,
  V3_EXTRACTION_VERSION,
  V3_PROMPT_VERSION,
  V3_PROTOCOL_VERSION,
  V3_PREREGISTERED_RULES,
  V3_REVIEW_VERSION,
  hashCanonical,
} from "./v3-protocol";

ensureDirs();
const createdAt = new Date().toISOString();
const prompts = {
  version: V3_PROMPT_VERSION,
  admission: V3_ADMISSION_PROMPTS,
  diagnosticProbes: V3_DIAGNOSTIC_PROBES,
  uncertaintyAllowance: UNCERTAINTY_ALLOWANCE_V3,
  armDecisionRule: V3_PREREGISTERED_RULES.uncertaintyClauseDecision,
  status: "preregistered-not-frozen",
  preregisteredAt: createdAt,
};
const extraction = {
  version: V3_EXTRACTION_VERSION,
  schemaVersion: 3,
  instructions: V3_EXTRACTION_INSTRUCTIONS,
  evidencePolicy: "exact case-sensitive contiguous substring resolved to source offsets; unsupported frame rejected",
  terminalStates: [
    "ok",
    "insufficient_evidence",
    "no_frame",
    "uncertain",
    "entity_ambiguous",
    "malformed",
  ],
  status: "preregistered-not-frozen",
  preregisteredAt: createdAt,
};
const protocol = {
  protocolVersion: V3_PROTOCOL_VERSION,
  promptProtocolVersion: V3_PROMPT_VERSION,
  extractionVersion: V3_EXTRACTION_VERSION,
  clusteringVersion: V3_CLUSTERING_VERSION,
  reviewVersion: V3_REVIEW_VERSION,
  status: "preregistered-not-frozen",
  preregisteredAt: createdAt,
  frozenAt: null,
  selectedPromptArm: null,
  selectedClusteringThreshold: null,
  rules: V3_PREREGISTERED_RULES,
  developmentSources: {
    insta360: "development only; may shape v3; never held-out evidence",
    heytea: {
      projectId: "d4a65f05-fca2-432b-a3be-39edd59410bd",
      runId: "0241898e-d930-4ab7-b326-4760e5f86b3b",
      standardExtractionVersion: 1,
      role: "organic-lane development only",
    },
  },
  heldoutBrands: ["Crocs", "Xiaomi"],
  gate: {
    controls: "all four pass through offsets, complete-link clustering, blind mapping and profile eligibility",
    humanInstrumentCheck: "required before freeze; small blinded human-coded set, not calibration",
    development: "uncertainty-clause rule resolves arm; at least one development profile behaves coherently",
    heldout: V3_PREREGISTERED_RULES.heldoutGate,
    noTuning: "any method change after held-out scoring creates v4 and replacement held-outs",
  },
  artifactHashes: {
    prompts: hashCanonical(prompts),
    extraction: hashCanonical(extraction),
  },
};

writeJson(join(FIXTURES_DIR, "representation-prompts.v3.json"), prompts);
writeJson(join(FIXTURES_DIR, "blind-frame-extraction.v3.json"), extraction);
writeJson(join(FIXTURES_DIR, "framing-protocol.v3.json"), protocol);
log("v3-preregister", `wrote preregistration at ${createdAt}`);
