export interface SsrScoreResult {
  perSetPmfs: number[][];
  pmf: number[];
  meanScore: number;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error("cosineSimilarity requires equal-length vectors");
  let dot = 0;
  let aNorm = 0;
  let bNorm = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    aNorm += a[i] * a[i];
    bNorm += b[i] * b[i];
  }
  if (aNorm === 0 || bNorm === 0) return 0;
  return dot / (Math.sqrt(aNorm) * Math.sqrt(bNorm));
}

export function cosineSimilarityMatrix(responses: number[][], anchors: number[][]): number[][] {
  return responses.map((response) =>
    anchors.map((anchor) => (1 + cosineSimilarity(response, anchor)) / 2),
  );
}

export function similaritiesToPmf(similarities: number[][], epsilon = 0): number[][] {
  return similarities.map((row) => {
    if (row.length === 0) throw new Error("Cannot normalize an empty similarity row");
    const min = Math.min(...row);
    const adjusted = row.map((value) => value - min);
    if (epsilon > 0) {
      const minIdx = row.indexOf(min);
      adjusted[minIdx] = epsilon;
    }
    const total = adjusted.reduce((sum, value) => sum + value, 0);
    if (total === 0) return row.map(() => 1 / row.length);
    return adjusted.map((value) => value / total);
  });
}

export function averagePmfsAcrossSets(perSetPmfs: number[][]): number[] {
  if (perSetPmfs.length === 0) throw new Error("Cannot average zero PMFs");
  const width = perSetPmfs[0].length;
  if (width === 0) throw new Error("Cannot average empty PMFs");
  const totals = Array.from({ length: width }, () => 0);
  for (const pmf of perSetPmfs) {
    if (pmf.length !== width) throw new Error("PMFs must have the same length");
    for (let i = 0; i < width; i++) totals[i] += pmf[i];
  }
  return totals.map((value) => value / perSetPmfs.length);
}

export function pmfMean(pmf: number[]): number {
  return pmf.reduce((sum, probability, idx) => sum + probability * (idx + 1), 0);
}

export function scoreSsrResponse(responseVector: number[], anchorVectorSets: number[][][]): SsrScoreResult {
  const perSetPmfs = anchorVectorSets.map((anchorVectors) =>
    similaritiesToPmf(cosineSimilarityMatrix([responseVector], anchorVectors))[0],
  );
  const pmf = averagePmfsAcrossSets(perSetPmfs);
  return { perSetPmfs, pmf, meanScore: pmfMean(pmf) };
}
