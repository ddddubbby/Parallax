/**
 * M26 calibration spike (D-082). Pure comparison harness: given paired
 * (human Likert PMF, SSR PMF) observations per stimulus, compute the
 * statistics `CALIBRATION_PROTOCOL.md` uses to decide whether a NEW anchor
 * set version has earned `calibrated: true` (D-069 versioning — v1 is never
 * edited in place). No DB, no network, no side effects: this module never
 * flips a flag itself, it only scores a benchmark dataset someone else
 * supplies. Anchors stay `calibrated: false` until a human runs this
 * against real paired data and the protocol's thresholds are met.
 */

const LIKERT_SCORES = [1, 2, 3, 4, 5] as const;
const PMF_LENGTH = LIKERT_SCORES.length;
/** Real survey aggregates can round to e.g. 0.999/1.001; tolerate a hair. */
const PMF_SUM_TOLERANCE = 1e-3;

export interface PairedStimulusPmf {
  /** Identifies the stimulus variant this pairing benchmarks. */
  stimulusId: string;
  /** Human respondents' aggregate 5-point Likert distribution (sums to ~1). */
  humanPmf: number[];
  /** The SSR-scored PMF for the same stimulus (sums to ~1). */
  ssrPmf: number[];
}

export interface StimulusCalibrationResult {
  stimulusId: string;
  humanMean: number;
  ssrMean: number;
  /** |humanMean - ssrMean|, in Likert points. */
  absoluteError: number;
  /** Discrete 1-Wasserstein distance between the two PMFs (see below). */
  wasserstein1: number;
}

export interface CalibrationSummary {
  n: number;
  /** Pearson correlation of per-stimulus means; null if variance is zero on either side. */
  pearsonR: number | null;
  meanAbsoluteError: number;
  meanWasserstein1: number;
  perStimulus: StimulusCalibrationResult[];
}

function meanOfPmf(pmf: number[]): number {
  return pmf.reduce((sum, p, idx) => sum + p * LIKERT_SCORES[idx], 0);
}

function cumulative(pmf: number[]): number[] {
  const out: number[] = [];
  let running = 0;
  for (const p of pmf) {
    running += p;
    out.push(running);
  }
  return out;
}

/**
 * Closed-form 1-Wasserstein (earth mover's) distance for two distributions
 * over the same ordered, equally-spaced 5-point scale: the sum of absolute
 * CDF differences at every interior category boundary (k=1..4 — the k=5
 * boundary always cancels, since both CDFs reach 1 there). Equivalent to
 * "how many unit-steps of probability mass must move to turn one
 * distribution into the other."
 */
function wasserstein1(pmfA: number[], pmfB: number[]): number {
  const cdfA = cumulative(pmfA);
  const cdfB = cumulative(pmfB);
  let total = 0;
  for (let k = 0; k < PMF_LENGTH - 1; k++) {
    total += Math.abs(cdfA[k] - cdfB[k]);
  }
  return total;
}

function assertValidPmf(pmf: number[], label: string): void {
  if (!Array.isArray(pmf) || pmf.length !== PMF_LENGTH) {
    throw new Error(`${label} must have exactly ${PMF_LENGTH} entries (a 5-point Likert PMF)`);
  }
  for (const p of pmf) {
    if (typeof p !== "number" || !Number.isFinite(p) || p < 0) {
      throw new Error(`${label} entries must be non-negative finite numbers`);
    }
  }
  const total = pmf.reduce((a, b) => a + b, 0);
  if (Math.abs(total - 1) > PMF_SUM_TOLERANCE) {
    throw new Error(`${label} must sum to ~1 (got ${total})`);
  }
}

function pearsonCorrelation(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  const xbar = xs.reduce((a, b) => a + b, 0) / n;
  const ybar = ys.reduce((a, b) => a + b, 0) / n;
  let numerator = 0;
  let dxSumSq = 0;
  let dySumSq = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - xbar;
    const dy = ys[i] - ybar;
    numerator += dx * dy;
    dxSumSq += dx * dx;
    dySumSq += dy * dy;
  }
  // Undefined (not zero) when either side has no variance — e.g. every
  // stimulus scored an identical mean. Reported as null, never coerced to 0.
  if (dxSumSq === 0 || dySumSq === 0) return null;
  return numerator / Math.sqrt(dxSumSq * dySumSq);
}

/**
 * Scores a paired human/SSR benchmark dataset. Requires at least 2 distinct
 * stimuli (a correlation over one point is meaningless) and validates every
 * PMF's shape before computing anything.
 */
export function computeCalibrationSummary(pairs: PairedStimulusPmf[]): CalibrationSummary {
  if (!Array.isArray(pairs) || pairs.length < 2) {
    throw new Error("Calibration comparison needs at least 2 paired stimuli to compute a correlation");
  }

  const seen = new Set<string>();
  const perStimulus: StimulusCalibrationResult[] = pairs.map((pair) => {
    if (typeof pair.stimulusId !== "string" || pair.stimulusId.length === 0) {
      throw new Error("Each paired stimulus needs a non-empty stimulusId");
    }
    if (seen.has(pair.stimulusId)) {
      throw new Error(`Duplicate stimulusId in calibration input: ${pair.stimulusId}`);
    }
    seen.add(pair.stimulusId);
    assertValidPmf(pair.humanPmf, `stimulus "${pair.stimulusId}"'s humanPmf`);
    assertValidPmf(pair.ssrPmf, `stimulus "${pair.stimulusId}"'s ssrPmf`);

    const humanMean = meanOfPmf(pair.humanPmf);
    const ssrMean = meanOfPmf(pair.ssrPmf);
    return {
      stimulusId: pair.stimulusId,
      humanMean,
      ssrMean,
      absoluteError: Math.abs(humanMean - ssrMean),
      wasserstein1: wasserstein1(pair.humanPmf, pair.ssrPmf),
    };
  });

  const pearsonR = pearsonCorrelation(
    perStimulus.map((p) => p.humanMean),
    perStimulus.map((p) => p.ssrMean),
  );
  const meanAbsoluteError =
    perStimulus.reduce((sum, p) => sum + p.absoluteError, 0) / perStimulus.length;
  const meanWasserstein1 =
    perStimulus.reduce((sum, p) => sum + p.wasserstein1, 0) / perStimulus.length;

  return {
    n: perStimulus.length,
    pearsonR,
    meanAbsoluteError,
    meanWasserstein1,
    perStimulus,
  };
}
