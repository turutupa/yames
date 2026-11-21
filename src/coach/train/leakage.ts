/**
 * The held-out set stays held out (leg c3d1, brief item 1): a training text
 * leaks when, in the same language, its normalised form equals a test item's
 * or is within an edit distance of 3 of one. Normalised: lower case (NFKC),
 * accents kept, every character that is not a letter or a digit folded away
 * (punctuation and spaces alike), so "Open  Paths!" and "openpaths" are one.
 */

export const LEAK_DISTANCE = 3;

export function leakKey(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

/** Levenshtein distance by code point, or `limit + 1` as soon as it must exceed `limit`. */
export function editDistance(a: string, b: string, limit = Number.POSITIVE_INFINITY): number {
  const x = [...a];
  const y = [...b];
  if (Math.abs(x.length - y.length) > limit) return limit + 1;
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= y.length; j++) {
      const d = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
      cur.push(d);
      if (d < best) best = d;
    }
    if (best > limit) return limit + 1;
    prev = cur;
  }
  return prev[y.length];
}

/** The held-out texts of one language, ready to test against. */
export class LeakGuard {
  private readonly keys: Map<string, string[]> = new Map();
  add(lang: string, text: string): void {
    const list = this.keys.get(lang) ?? [];
    list.push(leakKey(text));
    this.keys.set(lang, list);
  }
  size(lang: string): number {
    return this.keys.get(lang)?.length ?? 0;
  }
  /** The held-out key `text` is too close to, or null. */
  leak(lang: string, text: string): string | null {
    const k = leakKey(text);
    for (const t of this.keys.get(lang) ?? []) {
      if (t === k || editDistance(t, k, LEAK_DISTANCE) <= LEAK_DISTANCE) return t;
    }
    return null;
  }
}
