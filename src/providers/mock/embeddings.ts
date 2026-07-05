import { createHash } from "node:crypto";
import type { EmbeddingProvider } from "../types";

const DIMENSIONS = 64;

function vectorForText(text: string): number[] {
  const values: number[] = [];
  let counter = 0;
  while (values.length < DIMENSIONS) {
    const digest = createHash("sha256").update(`${text}|${counter}`).digest();
    for (const byte of digest) {
      values.push(byte / 127.5 - 1);
      if (values.length === DIMENSIONS) break;
    }
    counter++;
  }
  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  return values.map((value) => value / norm);
}

export const mockEmbeddingProvider: EmbeddingProvider = {
  providerId: "mock",
  displayName: "Mock embeddings",
  defaultModel: "mock-embedding-v1",

  async embed(req) {
    return {
      vectors: req.texts.map(vectorForText),
      model: req.model ?? "mock-embedding-v1",
      tokens: 0,
      costUsd: 0,
    };
  },

  estimateCostUsd() {
    return 0;
  },
};
