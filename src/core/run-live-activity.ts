/** M54/D-124: plain-language Collecting responses helpers (no jargon in UI copy). */

export const LIVE_ACTIVITY_ASKING_LIMIT = 3;
export const LIVE_ACTIVITY_ANSWERED_LIMIT = 5;
export const LIVE_ACTIVITY_SECONDARY_LIMIT = 5;
export const LIVE_ACTIVITY_PREVIEW_CHARS = 140;

export type LiveActivityAsking = {
  jobId: string;
  engineLabel: string;
  promptPreview: string;
  startedAt: string;
};

export type LiveActivityAnswered = {
  jobId: string;
  responseId: string;
  engineLabel: string;
  responsePreview: string;
  latencyMs: number | null;
  completedAt: string;
};

export type LiveActivitySecondaryKind =
  | "extraction"
  | "ssr"
  | "recommendation"
  | "pending";

export type LiveActivitySecondary = {
  jobId: string;
  kind: LiveActivitySecondaryKind;
  label: string;
  state: string;
  completedAt: string | null;
};

export type LiveActivity = {
  asking: LiveActivityAsking[];
  answered: LiveActivityAnswered[];
  secondary: LiveActivitySecondary[];
  showSecondary: boolean;
};

const ENGINE_LABELS: Record<string, string> = {
  mock: "Mock",
  deepseek: "DeepSeek",
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Gemini",
  perplexity: "Perplexity",
  xai: "Grok",
  minimax: "MiniMax",
};

export function engineLabel(providerId: string, generationMode?: string | null): string {
  const name = ENGINE_LABELS[providerId] ?? providerId;
  if (generationMode === "grounded") return `${name} with web`;
  return name;
}

export function truncatePreview(text: string, max = LIVE_ACTIVITY_PREVIEW_CHARS): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

export function formatElapsedShort(startedAt: Date | string, now = new Date()): string {
  const start = startedAt instanceof Date ? startedAt : new Date(startedAt);
  const seconds = Math.max(0, Math.floor((now.getTime() - start.getTime()) / 1000));
  if (seconds < 60) return `for ${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `for ${minutes}m`;
  return `for ${Math.floor(minutes / 60)}h`;
}

export function formatTookShort(latencyMs: number | null | undefined): string | null {
  if (latencyMs == null || !Number.isFinite(latencyMs) || latencyMs < 0) return null;
  if (latencyMs < 1000) return `took ${Math.round(latencyMs)}ms`;
  const seconds = latencyMs / 1000;
  if (seconds < 10) return `took ${seconds.toFixed(1)}s`;
  return `took ${Math.round(seconds)}s`;
}

export function leanScoreLabel(meanScore: number): string {
  if (meanScore >= 4) return "leaning positive";
  if (meanScore <= 2) return "leaning negative";
  return "mixed";
}

export function secondaryHitLabel(input: {
  matrixKind: "audit" | "resonance";
  extractionState: string | null;
  extractedJson: unknown;
  mentionNames: string[];
  mentionCount: number;
  claimCount: number;
}): { kind: LiveActivitySecondaryKind; label: string } | null {
  const state = input.extractionState;
  if (!state) return null;
  if (state === "pending" || state === "retrying") {
    return { kind: "pending", label: "Reading this answer…" };
  }
  if (state !== "valid" && state !== "qa_reviewed" && state !== "dead_lettered") {
    return null;
  }
  if (state === "dead_lettered") {
    return { kind: "extraction", label: "Couldn’t finish reading this answer" };
  }

  const payload =
    input.extractedJson && typeof input.extractedJson === "object"
      ? (input.extractedJson as Record<string, unknown>)
      : null;

  if (payload?.kind === "recommendation") {
    const rank = typeof payload.targetRank === "number" ? payload.targetRank : null;
    if (rank != null) {
      return { kind: "recommendation", label: `Shortlist read — client at #${rank}` };
    }
    if (payload.targetIncluded === false) {
      return { kind: "recommendation", label: "Shortlist read — client not listed" };
    }
    return { kind: "recommendation", label: "Shortlist read" };
  }

  if (typeof payload?.meanScore === "number" && Number.isFinite(payload.meanScore)) {
    return {
      kind: "ssr",
      label: `Scored reaction — ${leanScoreLabel(payload.meanScore)}`,
    };
  }

  if (input.matrixKind === "resonance") {
    return { kind: "ssr", label: "Reaction scored" };
  }

  if (input.mentionCount > 0) {
    const names = input.mentionNames.slice(0, 3).join(", ");
    const suffix = names ? ` — ${names}` : "";
    const noun = input.mentionCount === 1 ? "brand mention" : "brand mentions";
    return {
      kind: "extraction",
      label: `Found ${input.mentionCount} ${noun}${suffix}`,
    };
  }
  if (input.claimCount > 0) {
    const noun = input.claimCount === 1 ? "claim" : "claims";
    return { kind: "extraction", label: `Found ${input.claimCount} ${noun}` };
  }
  return { kind: "extraction", label: "Answer read — no brand mentions" };
}

export function collectingStatusLine(input: {
  runState: string;
  workerOffline?: boolean;
  askingCount: number;
  answeredCount: number;
  secondaryPendingCount: number;
  showSecondary: boolean;
}): string {
  const { runState } = input;
  if (runState === "completed") return "Collection finished";
  if (runState === "failed" || runState === "cancelled") return "Collection stopped";
  if (runState === "paused") return "Paused — collection stopped until you resume";
  if (input.workerOffline && (runState === "queued" || runState === "running")) {
    return "Collection paused — processing hasn’t started yet";
  }
  if (runState === "queued" && input.askingCount === 0) return "Starting soon…";
  if (input.askingCount > 0 && input.answeredCount === 0) return "Asking models now";
  if (
    input.showSecondary &&
    input.secondaryPendingCount > 0 &&
    input.askingCount === 0 &&
    input.answeredCount > 0
  ) {
    return "Responses in — finishing the read";
  }
  if (input.askingCount > 0 || input.secondaryPendingCount > 0) {
    return input.showSecondary
      ? "Collecting answers and reading them"
      : "Collecting answers";
  }
  if (runState === "running" || runState === "queued") return "Collecting answers";
  return "Collecting responses";
}
