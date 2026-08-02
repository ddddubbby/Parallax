import { describe, expect, it } from "vitest";
import {
  collectingStatusLine,
  engineLabel,
  formatElapsedShort,
  formatTookShort,
  secondaryHitLabel,
  truncatePreview,
} from "./run-live-activity";

describe("run-live-activity helpers (M54/D-124)", () => {
  it("truncates previews with an ellipsis", () => {
    const long = "word ".repeat(50);
    const preview = truncatePreview(long, 40);
    expect(preview.endsWith("…")).toBe(true);
    expect(preview.length).toBeLessThanOrEqual(40);
  });

  it("labels engines in plain language", () => {
    expect(engineLabel("deepseek", "ungrounded")).toBe("DeepSeek");
    expect(engineLabel("google", "grounded")).toBe("Gemini with web");
    expect(engineLabel("mock")).toBe("Mock");
  });

  it("formats elapsed and took without jargon words", () => {
    const started = new Date(Date.now() - 12_000);
    expect(formatElapsedShort(started)).toBe("for 12s");
    expect(formatTookShort(1800)).toBe("took 1.8s");
    expect(formatTookShort(null)).toBeNull();
    for (const s of [formatElapsedShort(started), formatTookShort(1800) ?? ""]) {
      expect(s.toLowerCase()).not.toMatch(/latency|worker|api|job/);
    }
  });

  it("builds audit and scoring hit labels", () => {
    expect(
      secondaryHitLabel({
        matrixKind: "audit",
        extractionState: "valid",
        extractedJson: {},
        mentionNames: ["Acme", "Contoso"],
        mentionCount: 2,
        claimCount: 0,
      })?.label,
    ).toBe("Found 2 brand mentions — Acme, Contoso");

    expect(
      secondaryHitLabel({
        matrixKind: "resonance",
        extractionState: "valid",
        extractedJson: { kind: "ssr", meanScore: 4.2 },
        mentionNames: [],
        mentionCount: 0,
        claimCount: 0,
      })?.label,
    ).toBe("Scored reaction — leaning positive");

    expect(
      secondaryHitLabel({
        matrixKind: "resonance",
        extractionState: "valid",
        extractedJson: { kind: "recommendation", targetRank: 2, targetIncluded: true },
        mentionNames: [],
        mentionCount: 0,
        claimCount: 0,
      })?.label,
    ).toBe("Shortlist read — client at #2");

    expect(
      secondaryHitLabel({
        matrixKind: "audit",
        extractionState: "pending",
        extractedJson: null,
        mentionNames: [],
        mentionCount: 0,
        claimCount: 0,
      })?.label,
    ).toBe("Reading this answer…");
  });

  it("status lines stay outcome-language", () => {
    expect(
      collectingStatusLine({
        runState: "running",
        askingCount: 2,
        answeredCount: 0,
        secondaryPendingCount: 0,
        showSecondary: true,
      }),
    ).toBe("Asking models now");

    expect(
      collectingStatusLine({
        runState: "paused",
        askingCount: 0,
        answeredCount: 3,
        secondaryPendingCount: 0,
        showSecondary: true,
      }),
    ).toBe("Paused — collection stopped until you resume");

    expect(
      collectingStatusLine({
        runState: "queued",
        workerOffline: true,
        askingCount: 0,
        answeredCount: 0,
        secondaryPendingCount: 0,
        showSecondary: true,
      }),
    ).toBe("Collection paused — processing hasn’t started yet");

    const lines = [
      collectingStatusLine({
        runState: "running",
        askingCount: 1,
        answeredCount: 2,
        secondaryPendingCount: 1,
        showSecondary: true,
      }),
      collectingStatusLine({
        runState: "completed",
        askingCount: 0,
        answeredCount: 5,
        secondaryPendingCount: 0,
        showSecondary: true,
      }),
    ];
    for (const line of lines) {
      expect(line.toLowerCase()).not.toMatch(/worker|api|job|pipeline|heartbeat|latency/);
    }
  });
});
