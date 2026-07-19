import type { FramingTheme } from "./baseline";

// M44 / D-114 (themes v2): deterministic clustering of blind framing
// observations into presentation themes. Pure math over stored vectors —
// page loads never embed. Themes organize browsing and are never a gate;
// labels are machine-generated (the cluster's most central phrase) and are
// always marked as such wherever they render.

export interface ObservationRow {
  responseId: string;
  /** Framing phrases, aligned index-for-index with vectors. */
  phrases: string[];
  /** Unit-normalized embedding vectors, one per phrase. */
  vectors: number[][];
}

/** Cosine similarity for unit-or-not vectors; 0 when either norm is 0. */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

const DEFAULT_THRESHOLD = 0.8;
const MAX_THEMES = 8;

interface Cluster {
  memberPhrases: string[];
  memberVectors: number[][];
  responseIds: Set<string>;
  centroid: number[];
}

function addToCentroid(cluster: Cluster, vector: number[]) {
  const size = cluster.memberVectors.length;
  if (cluster.centroid.length === 0) {
    cluster.centroid = [...vector];
    return;
  }
  for (let i = 0; i < cluster.centroid.length; i++) {
    cluster.centroid[i] = (cluster.centroid[i] * (size - 1) + (vector[i] ?? 0)) / size;
  }
}

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "theme"
  );
}

/**
 * Greedy deterministic clustering: observations are visited in stable input
 * order (rows as given, phrases in index order); each joins the first
 * cluster whose centroid similarity clears the threshold, else founds a new
 * cluster. Label = the member phrase nearest the final centroid (medoid —
 * a browsing label only, never an eligibility device; D-114 upholds
 * D-099's retirement of selection law). Output shape matches the v1
 * attribute themes so the picker upgrades transparently.
 *
 * `totalResponses` is the full sampled denominator, not just responses with
 * observations — recurrence counts must never shrink their denominator.
 */
export function clusterFramingObservations(
  rows: ObservationRow[],
  totalResponses: number,
  threshold = DEFAULT_THRESHOLD,
): FramingTheme[] {
  if (totalResponses <= 0) return [];
  const clusters: Cluster[] = [];
  for (const row of rows) {
    for (let i = 0; i < row.phrases.length; i++) {
      const vector = row.vectors[i];
      if (!Array.isArray(vector) || vector.length === 0) continue;
      let target: Cluster | null = null;
      for (const cluster of clusters) {
        if (cosineSimilarity(cluster.centroid, vector) >= threshold) {
          target = cluster;
          break;
        }
      }
      if (!target) {
        target = { memberPhrases: [], memberVectors: [], responseIds: new Set(), centroid: [] };
        clusters.push(target);
      }
      target.memberPhrases.push(row.phrases[i]);
      target.memberVectors.push(vector);
      target.responseIds.add(row.responseId);
      addToCentroid(target, vector);
    }
  }
  const themes = clusters.map((cluster) => {
    let bestIdx = 0;
    let bestSim = -Infinity;
    for (let i = 0; i < cluster.memberVectors.length; i++) {
      const sim = cosineSimilarity(cluster.centroid, cluster.memberVectors[i]);
      if (sim > bestSim) {
        bestSim = sim;
        bestIdx = i;
      }
    }
    const label = cluster.memberPhrases[bestIdx];
    return {
      key: `fo-${slugify(label)}`,
      label,
      responseIds: [...cluster.responseIds],
      matching: cluster.responseIds.size,
      total: totalResponses,
    };
  });
  // Deterministic order: count desc, then key asc; de-duplicate keys by
  // suffixing (two distinct clusters can share a slugged label).
  themes.sort((a, b) => b.matching - a.matching || a.key.localeCompare(b.key));
  const seen = new Map<string, number>();
  for (const theme of themes) {
    const count = seen.get(theme.key) ?? 0;
    seen.set(theme.key, count + 1);
    if (count > 0) theme.key = `${theme.key}-${count + 1}`;
  }
  return themes.slice(0, MAX_THEMES);
}
