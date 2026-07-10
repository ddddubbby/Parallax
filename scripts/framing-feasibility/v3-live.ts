import { z } from "zod";
import { callDeepSeekChat, type DeepSeekCallCredentials } from "../../src/providers/deepseek";
import {
  HARNESS_PROVIDER_TIMEOUT_MS,
  log,
} from "./shared";
import {
  buildV3ExtractionPrompt,
  sha256,
  V3_DIMENSIONS,
  V3_FRAME_KINDS,
  V3_STANCES,
  V3_TERMINAL_STATES,
} from "./v3-protocol";
import {
  verifyV3Frames,
  type RawV3Frame,
  type VerifiedV3Frame,
} from "./v3-core";

const rawFrameSchema = z.object({
  concept_label: z.string().min(1),
  frame_dimension: z.enum(V3_DIMENSIONS),
  frame_kind: z.enum(V3_FRAME_KINDS),
  stance: z.enum(V3_STANCES),
  evidence_quote: z.string(),
});

const payloadSchema = z.object({
  schema_version: z.literal(3),
  state: z.enum(V3_TERMINAL_STATES),
  frames: z.array(z.unknown()),
});

export interface V3LiveExtractionResult {
  terminalState: (typeof V3_TERMINAL_STATES)[number];
  frames: VerifiedV3Frame[];
  unsupportedFrameCount: number;
  invalidFrameCount: number;
  parseError: string | null;
  model: string;
  costUsd: number;
  tokensIn: number;
  tokensOut: number;
  extractorInputHash: string;
}

export async function callV3BlindExtraction(
  credentials: DeepSeekCallCredentials,
  input: { observedBrandName: string; rawText: string },
): Promise<V3LiveExtractionResult> {
  const extractorInput = buildV3ExtractionPrompt(input);
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
  } catch (error) {
    log(
      "v3-live",
      `extraction failed (${error instanceof Error ? error.message : String(error)}); retrying once`,
    );
    result = await callOnce();
  }

  let terminalState: (typeof V3_TERMINAL_STATES)[number] = "malformed";
  let frames: VerifiedV3Frame[] = [];
  let unsupportedFrameCount = 0;
  let invalidFrameCount = 0;
  let parseError: string | null = null;
  try {
    const envelope = payloadSchema.parse(JSON.parse(result.text));
    const rawFrames: RawV3Frame[] = [];
    for (const raw of envelope.frames) {
      const parsed = rawFrameSchema.safeParse(raw);
      if (parsed.success) rawFrames.push(parsed.data);
      else invalidFrameCount += 1;
    }
    const verified = verifyV3Frames(input.rawText, envelope.state, rawFrames);
    terminalState = verified.state;
    frames = verified.frames;
    unsupportedFrameCount = verified.unsupportedFrameCount;
    if (invalidFrameCount > 0 || unsupportedFrameCount > 0) {
      parseError = `salvaged: invalid=${invalidFrameCount}; unsupported=${unsupportedFrameCount}`;
    }
  } catch (error) {
    parseError = error instanceof Error ? error.message : String(error);
  }

  return {
    terminalState,
    frames,
    unsupportedFrameCount,
    invalidFrameCount,
    parseError,
    model: result.model,
    costUsd: result.costUsd,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    extractorInputHash: sha256(extractorInput),
  };
}
