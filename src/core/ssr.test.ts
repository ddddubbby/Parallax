import { describe, expect, it } from "vitest";
import {
  averagePmfsAcrossSets,
  cosineSimilarityMatrix,
  pmfMean,
  scoreSsrResponse,
  similaritiesToPmf,
} from "./ssr";

const close = (actual: number, expected: number, precision = 10) => {
  expect(actual).toBeCloseTo(expected, precision);
};

describe("SSR math", () => {
  it("rescales cosine similarities before min-subtraction normalization", () => {
    const matrix = cosineSimilarityMatrix(
      [
        [1, 0],
        [0, 1],
      ],
      [
        [1, 0],
        [0, 1],
        [-1, 0],
      ],
    );

    expect(matrix[0]).toEqual([1, 0.5, 0]);
    expect(matrix[1]).toEqual([0.5, 1, 0.5]);
  });

  it("matches a hand-computed PMF and catches skipped min-subtraction", () => {
    const response = [1, 0];
    const anchors = [
      [1, 0],
      [0, 1],
      [0.2, Math.sqrt(0.96)],
      [0, -1],
      [0.6, 0.8],
    ];

    // Rescaled cosine row: [1, .5, .6, .5, .8].
    // Subtract min (.5): [.5, 0, .1, 0, .3]. Sum = .9.
    const pmf = similaritiesToPmf(cosineSimilarityMatrix([response], anchors))[0];
    const expected = [0.5555555556, 0, 0.1111111111, 0, 0.3333333333];
    expected.forEach((value, idx) => close(pmf[idx], value, 9));
    close(pmf.reduce((sum, value) => sum + value, 0), 1);

    const noMinSubtractionWrong = [1, 0.5, 0.6, 0.5, 0.8].map((v) => v / 3.4);
    expect(noMinSubtractionWrong[1]).not.toBe(0);
  });

  it("normalizes every row and gives argmin zero probability when epsilon is zero", () => {
    const rows = similaritiesToPmf([
      [0.2, 0.7, 0.4, 0.9, 0.1],
      [3, 3, 3, 3, 3],
    ]);
    close(rows[0].reduce((sum, value) => sum + value, 0), 1);
    expect(rows[0][4]).toBe(0);
    rows[1].forEach((value) => close(value, 0.2));
  });

  it("averages PMFs and computes the 1-5 mean score", () => {
    const averaged = averagePmfsAcrossSets([
      [0, 0, 0, 0.5, 0.5],
      [0.1, 0.1, 0.2, 0.3, 0.3],
    ]);
    expect(averaged).toEqual([0.05, 0.05, 0.1, 0.4, 0.4]);
    close(pmfMean(averaged), 4.05);
  });

  it("scores one response against multiple anchor statement sets", () => {
    const scored = scoreSsrResponse(
      [1, 0],
      [
        [
          [1, 0],
          [0, 1],
          [-1, 0],
          [0, -1],
          [0.6, 0.8],
        ],
        [
          [0, 1],
          [1, 0],
          [0.6, 0.8],
          [-1, 0],
          [0, -1],
        ],
      ],
    );
    expect(scored.perSetPmfs).toHaveLength(2);
    close(scored.pmf.reduce((sum, value) => sum + value, 0), 1);
    close(scored.meanScore, pmfMean(scored.pmf));
  });
});
