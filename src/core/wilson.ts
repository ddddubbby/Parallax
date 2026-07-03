// Wilson score interval — the one implementation used everywhere a metric
// qualifies for it (E2). Valid only for per-sample binomial proportions
// (D-023): Mention Rate, Recommendation Rate, Accuracy Rate. Do not apply
// to count ratios (Share of Voice, Citation Share) or means (Avg First
// Position, Stability Index) — those ship as point estimates with no
// interval in MVP.

const Z_95 = 1.959963984540054; // two-sided 95% normal quantile

export interface WilsonInterval {
  value: number;
  ciLow: number;
  ciHigh: number;
}

/** successes/n must come from independent Bernoulli trials over eligible samples. */
export function wilsonInterval(successes: number, n: number, z = Z_95): WilsonInterval {
  if (n === 0) return { value: 0, ciLow: 0, ciHigh: 0 };
  const p = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = p + z2 / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return {
    value: p,
    ciLow: Math.max(0, (center - margin) / denom),
    ciHigh: Math.min(1, (center + margin) / denom),
  };
}
