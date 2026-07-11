/**
 * Shared helpers for M34 Phase 0 feasibility scripts.
 * Throwaway analysis harness — not wired into the app (D-086 §8).
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import { getActiveCredential } from "../../src/db/repositories/credentials";
import { CredentialConfigError, decryptApiKey, verifyFingerprint } from "../../src/modules/settings/crypto";
import { callDeepSeekChat, type DeepSeekCallCredentials } from "../../src/providers/deepseek";
import { createOpenAIProvider } from "../../src/providers/openai";
import { createOpenAIEmbeddingProvider } from "../../src/providers/openai/embeddings";
import type { LiveCredentials } from "../../src/providers/shared";
import type { ProviderId } from "../../src/providers/types";
import {
  BLIND_FRAME_SCHEMA_INSTRUCTIONS,
  FRAME_DIMENSIONS,
  FRAME_STANCES,
  FRAME_TERMINAL_STATES,
  NEUTRAL_SAMPLING,
  buildBlindFrameExtractionPrompt,
  type FrameDimension,
} from "./protocol";

export const OUT_DIR = join(process.cwd(), "docs", "audits", "m34");
export const FIXTURES_DIR = join(process.cwd(), "fixtures", "framing");

/** Deadline for every harness provider call (D-039 parity — no call runs undeadlined). */
export const HARNESS_PROVIDER_TIMEOUT_MS = 90_000;

/**
 * Retry a provider call with backoff. Retry-once-immediately is too weak: a
 * brief provider degradation window (e.g. an empty/non-JSON 200 under load —
 * `malformed_output`, seen live during v4 CAL) swallows two rapid attempts at
 * once. Backoff spans the window. Mirrors the production worker's D-042
 * backoff discipline rather than reinventing bare retries.
 */
export async function withProviderRetry<T>(fn: () => Promise<T>, label: string, attempts = 3): Promise<T> {
  const backoffMs = [0, 800, 2500];
  let lastErr: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts) {
        const wait = backoffMs[i] ?? 2500;
        log(label, `attempt ${i}/${attempts} failed (${err instanceof Error ? err.message : String(err)}); backing off ${wait}ms`);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }
  throw lastErr;
}

export function ensureDirs() {
  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(FIXTURES_DIR, { recursive: true });
}

export function writeJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function log(scope: string, msg: string) {
  console.log(`[${scope}] ${msg}`);
}

export async function resolveLiveCredentials(providerId: ProviderId): Promise<LiveCredentials> {
  const credential = await getActiveCredential(providerId);
  if (!credential) {
    throw new Error(`No active ${providerId} credential in Settings — configure one before Phase 0 live calls`);
  }
  const apiKey = decryptApiKey(credential.encryptedApiKey);
  if (apiKey === null) {
    throw new Error(`Stored ${providerId} credential could not be decrypted — re-enter it in Settings`);
  }
  return { apiKey, baseUrl: credential.baseUrl, defaultModel: credential.defaultModel };
}

export class PreflightError extends Error {}

/**
 * Print a fatal error the way an operator wants to read it. A PreflightError is
 * an expected, actionable stop (bad env / bad credential) — print its message,
 * not a stack. Exit code 3 distinguishes it from a genuine crash (1) and from
 * analyze's NO-GO verdict (2), so a wrapper can tell them apart.
 */
export function reportFatal(err: unknown): number {
  if (err instanceof PreflightError) {
    console.error(`\n${err.message}\n`);
    return 3;
  }
  console.error(err);
  return 1;
}

/**
 * Fail before spending. Every credential a script needs is checked up front,
 * so a broken key surfaces at second zero rather than after `framing:extract`
 * has already billed a DeepSeek extraction pass and `analyze` dies at its
 * embedding step (the OpenAI key is otherwise resolved lazily, deep in the run).
 *
 * Deliberately NEVER calls markInvalid: that is the worker's contract
 * (provider-resolver.ts, D-021) and Settings→Verify's. A read-only analysis
 * harness must not mutate credential status as a side effect of a dry check —
 * a wrong local KEK is the environment being wrong, not the row (D-047).
 *
 * Distinguishes the two failure classes D-047 separated:
 *   - CredentialConfigError (KEK missing/malformed) → environment problem
 *   - decrypt returns null (KEK valid but wrong, or ciphertext corrupt)
 * and additionally verifies the decrypted key round-trips to the stored
 * fingerprint, so silent corruption cannot pass as healthy.
 */
export async function preflightCredentials(required: readonly ProviderId[]): Promise<void> {
  const problems: string[] = [];

  for (const providerId of required) {
    const credential = await getActiveCredential(providerId);
    if (!credential) {
      problems.push(`${providerId}: no active credential — add one in Settings`);
      continue;
    }

    let apiKey: string | null;
    try {
      apiKey = decryptApiKey(credential.encryptedApiKey);
    } catch (err) {
      if (err instanceof CredentialConfigError) {
        throw new PreflightError(
          `CREDENTIALS_ENCRYPTION_KEY is missing or malformed (${err.message}).\n` +
            `  This is an environment problem, not a credential problem — no rows were touched.\n` +
            `  Fix .env.local, then re-run. Non-Next entrypoints load env via src/env-bootstrap (D-047).`,
        );
      }
      throw err;
    }

    if (apiKey === null) {
      problems.push(
        `${providerId}: stored ciphertext could not be decrypted under the current KEK ` +
          `(wrong CREDENTIALS_ENCRYPTION_KEY, or corrupt ciphertext) — re-enter the key in Settings`,
      );
      continue;
    }
    if (!verifyFingerprint(apiKey, credential.apiKeyFingerprint)) {
      problems.push(`${providerId}: decrypted key does not match its stored fingerprint — re-enter it in Settings`);
      continue;
    }
    log("preflight", `${providerId}: active credential decrypts, fingerprint OK (last4 ${credential.apiKeyLast4})`);
  }

  if (problems.length > 0) {
    throw new PreflightError(
      `Credential preflight failed — aborting before any paid call:\n` +
        problems.map((p) => `  - ${p}`).join("\n") +
        `\n  Nothing was spent and no credential rows were modified.`,
    );
  }
}

const frameItemSchema = z.object({
  frame_label: z.string().min(1),
  frame_dimension: z.enum(FRAME_DIMENSIONS),
  stance: z.enum(FRAME_STANCES),
  evidence_quote: z.string().max(240),
});

type FrameItem = z.infer<typeof frameItemSchema>;

// Envelope shape only used as a type since blind-frame-extraction.v2:
// validation is per-frame (salvage) + a state check, never whole-payload.
const _blindFramePayloadSchema = z.object({
  schema_version: z.literal(1),
  state: z.enum(FRAME_TERMINAL_STATES),
  frames: z.array(frameItemSchema),
});

export type BlindFramePayload = z.infer<typeof _blindFramePayloadSchema>;

export interface FrameExtractionRecord {
  sourceResponseId: string;
  lane: "organic_in_context" | "neutral_elicited";
  projectSlug: string;
  brandName: string;
  providerId: string;
  generationMode: string;
  cellId: string | null;
  intent: string | null;
  variantKey: string | null;
  model: string;
  costUsd: number;
  tokensIn: number;
  tokensOut: number;
  promptSnapshot: string;
  /** Assembled extractor input — used by snapshot isolation checks. */
  extractorInput: string;
  payload: BlindFramePayload | null;
  parseError: string | null;
  rawTextLength: number;
  /** frame-cluster.v2 salvage stats: quotes truncated to the 240-char cap. */
  truncatedQuotes?: number;
  /** frame-cluster.v2 salvage stats: individually invalid frames dropped. */
  droppedFrames?: number;
}

/** Snapshot of the blind prompt with a placeholder body — proves forbidden inputs are absent. */
export function blindPromptForbiddenTokens(): string[] {
  return [
    "FACT SHEET",
    "ATTRIBUTES OF INTEREST",
    "TRACKED BRANDS",
    "competitor",
    "desired attribute",
    "campaign",
    "job_to_be_done",
    "persona",
  ];
}

export function assertBlindPromptIsolation(extractorInput: string) {
  // The schema instructions themselves must not smuggle fact-sheet language.
  for (const token of ["FACT SHEET", "ATTRIBUTES OF INTEREST", "TRACKED BRANDS"]) {
    if (BLIND_FRAME_SCHEMA_INSTRUCTIONS.includes(token)) {
      throw new Error(`Blind schema instructions contain forbidden token: ${token}`);
    }
  }
  for (const token of blindPromptForbiddenTokens()) {
    if (extractorInput.toLowerCase().includes(token.toLowerCase()) && token !== "persona") {
      // "persona" can appear inside raw answer text; only flag structural headers.
      if (["FACT SHEET", "ATTRIBUTES OF INTEREST", "TRACKED BRANDS"].includes(token)) {
        throw new Error(`Blind extractor input contains forbidden token: ${token}`);
      }
    }
  }
  if (!extractorInput.includes("OBSERVED BRAND NAME:")) {
    throw new Error("Blind extractor input missing OBSERVED BRAND NAME");
  }
}

export async function callBlindFrameExtraction(
  credentials: DeepSeekCallCredentials,
  input: { observedBrandName: string; rawText: string; sourceResponseId: string },
): Promise<{
  payload: BlindFramePayload | null;
  parseError: string | null;
  model: string;
  costUsd: number;
  tokensIn: number;
  tokensOut: number;
  extractorInput: string;
  truncatedQuotes: number;
  droppedFrames: number;
}> {
  const extractorInput = buildBlindFrameExtractionPrompt({
    observedBrandName: input.observedBrandName,
    rawText: input.rawText,
  });
  assertBlindPromptIsolation(extractorInput);

  // D-039's lesson applies to the harness too: a provider call with no
  // deadline can hang the whole run on one ESTABLISHED socket (observed live
  // during Phase 0 run 2). 90s cap + one retry; a second failure propagates
  // to the caller as a normal error.
  const callOnce = () =>
    callDeepSeekChat(
      credentials,
      {
        messages: [{ role: "user", content: extractorInput }],
        temperature: 0,
        response_format: { type: "json_object" },
      },
      AbortSignal.timeout(HARNESS_PROVIDER_TIMEOUT_MS),
    );
  let result: Awaited<ReturnType<typeof callOnce>>;
  try {
    result = await callOnce();
  } catch (firstErr) {
    log("shared", `blind extraction call failed (${firstErr instanceof Error ? firstErr.message : String(firstErr)}); retrying once`);
    result = await callOnce();
  }

  // Per-frame salvage (blind-frame-extraction.v2). Run 1 voided 5 of 60
  // responses because ONE over-long evidence_quote failed whole-payload Zod
  // validation — the D-011 lesson (content-level partial validity is handled
  // at the field, not by discarding the response). An over-long quote is
  // truncated to a 240-char exact prefix (raw text is stored and linked, so
  // nothing evidentiary is lost); an individually invalid frame is dropped
  // and counted; only an unparseable envelope is malformed. Production (BF-9)
  // additionally gets retry/dead-letter semantics.
  let payload: BlindFramePayload | null = null;
  let parseError: string | null = null;
  let truncatedQuotes = 0;
  let droppedFrames = 0;
  try {
    const parsed = JSON.parse(result.text) as { state?: unknown; frames?: unknown };
    const state = (FRAME_TERMINAL_STATES as readonly string[]).includes(String(parsed?.state))
      ? (String(parsed.state) as BlindFramePayload["state"])
      : null;
    if (state === null) {
      parseError = `invalid or missing state: ${String(parsed?.state)}`;
      payload = { schema_version: 1, state: "malformed", frames: [] };
    } else {
      const rawFrames = Array.isArray(parsed.frames) ? parsed.frames : [];
      const frames: FrameItem[] = [];
      for (const raw of rawFrames) {
        const candidate =
          raw && typeof raw === "object" ? { ...(raw as Record<string, unknown>) } : raw;
        if (
          candidate &&
          typeof candidate === "object" &&
          typeof (candidate as { evidence_quote?: unknown }).evidence_quote === "string"
        ) {
          const quote = (candidate as { evidence_quote: string }).evidence_quote;
          if (quote.length > 240) {
            (candidate as { evidence_quote: string }).evidence_quote = quote.slice(0, 240);
            truncatedQuotes += 1;
          }
        }
        const validated = frameItemSchema.safeParse(candidate);
        if (validated.success) frames.push(validated.data);
        else droppedFrames += 1;
      }
      payload = { schema_version: 1, state, frames };
      if (droppedFrames > 0) parseError = `salvaged: dropped ${droppedFrames} invalid frame(s)`;
    }
  } catch (err) {
    parseError = err instanceof Error ? err.message : String(err);
    payload = { schema_version: 1, state: "malformed", frames: [] };
  }

  return {
    payload,
    parseError,
    model: result.model,
    costUsd: result.costUsd,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    extractorInput,
    truncatedQuotes,
    droppedFrames,
  };
}

export async function generateUngrounded(
  providerId: "deepseek" | "openai",
  promptText: string,
): Promise<{
  text: string;
  model: string;
  costUsd: number;
  tokensIn: number;
  tokensOut: number;
  temperature: number | undefined;
}> {
  const creds = await resolveLiveCredentials(providerId);
  // Sampling is a per-engine protocol parameter (NEUTRAL_SAMPLING), not a
  // constant: gpt-5.5 rejects any non-default temperature. `undefined` omits
  // the parameter entirely, which is NOT the same as sending a value.
  const { temperature } = NEUTRAL_SAMPLING[providerId];

  // Retry-once on a provider call, same as the extraction path. A generation
  // call can hit a transient transport error (a non-JSON envelope from a 429/5xx
  // — malformed_output at the provider layer, seen live during CAL); no retry
  // here crashed the whole run on one blip (D-011/D-039: transport → retry).
  const callOnce = async (): Promise<{ text: string; model: string; costUsd: number; tokensIn: number; tokensOut: number }> => {
    if (providerId === "deepseek") {
      const r = await callDeepSeekChat(
        creds,
        { messages: [{ role: "user", content: promptText }], ...(temperature !== undefined ? { temperature } : {}) },
        AbortSignal.timeout(HARNESS_PROVIDER_TIMEOUT_MS),
      );
      return { text: r.text, model: r.model, costUsd: r.costUsd, tokensIn: r.tokensIn, tokensOut: r.tokensOut };
    }
    const provider = createOpenAIProvider(creds);
    const r = await provider.generate(
      { promptText, mode: "ungrounded", ...(temperature !== undefined ? { temperature } : {}) },
      AbortSignal.timeout(HARNESS_PROVIDER_TIMEOUT_MS),
    );
    return { text: r.text, model: r.modelVersion, costUsd: r.costUsd, tokensIn: r.tokensIn, tokensOut: r.tokensOut };
  };

  const result = await withProviderRetry(callOnce, "generate");
  return { ...result, temperature };
}

/**
 * frame-cluster.v2 deterministic label normalization, applied before any
 * embedding merge. Two additions over v1 (lowercase/strip/collapse):
 * (1) conjunction lists split on " and "/"&"/"/" are sorted and rejoined, so
 *     "premium tea and boba" == "boba and premium tea";
 * (2) naive per-token plural fold (strip trailing "s" when token length >= 4
 *     and not ending "ss"). This is a uniform deterministic mapping, not
 *     linguistics ("lens" -> "len" is fine): applied identically to every
 *     token it can only merge labels, never split them, and clustering keys
 *     are never rendered as client copy.
 */
export function normalizeFrameLabel(label: string): string {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9\s+/&-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const foldToken = (t: string) =>
    t.length >= 4 && t.endsWith("s") && !t.endsWith("ss") ? t.slice(0, -1) : t;
  const normalizePhrase = (p: string) => p.trim().split(" ").filter(Boolean).map(foldToken).join(" ");
  const conjuncts = base
    .split(/ and |\s*&\s*|\s*\/\s*/)
    .map(normalizePhrase)
    .filter(Boolean);
  if (conjuncts.length > 1) return [...conjuncts].sort().join(" + ");
  return normalizePhrase(base);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export async function embedTexts(texts: string[]): Promise<{ vectors: number[][]; costUsd: number; model: string }> {
  if (texts.length === 0) return { vectors: [], costUsd: 0, model: "none" };
  const creds = await resolveLiveCredentials("openai");
  const provider = createOpenAIEmbeddingProvider(creds);
  const result = await provider.embed({ texts });
  return { vectors: result.vectors as number[][], costUsd: result.costUsd, model: result.model };
}

export function resolvePrompt(template: string, clientBrand: string): string {
  return template.replaceAll("{client_brand}", clientBrand);
}

export function loadExistingOrNull<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  return readJson<T>(path);
}

export type { FrameDimension };
