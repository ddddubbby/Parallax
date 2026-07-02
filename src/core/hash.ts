// Stable string hashing (D-016): mock fixture selection is keyed by a hash
// of (resolved_text, provider_id, rep_index), never row UUIDs, so selection
// is reproducible across re-seeds and fresh clones. FNV-1a: simple,
// dependency-free, and deterministic across platforms.

export function stableHash(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Deterministic index into a list of the given length, or -1 if empty. */
export function stableIndex(input: string, length: number): number {
  if (length <= 0) return -1;
  return stableHash(input) % length;
}
