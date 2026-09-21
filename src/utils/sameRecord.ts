/**
 * Do two saved records say the same thing?
 *
 * What "unsaved changes" asks, for a jam and for a setlist. It used to be
 * `JSON.stringify(a) !== JSON.stringify(b)`, which answers a narrower question
 * — "are these the same TEXT?" — and gets it wrong in two ways a player can
 * trigger:
 *
 * - KEY ORDER. An edit that adds a field puts it at the end of the working
 *   copy; the stored record has it wherever it was written. Same values,
 *   different text, "unsaved".
 * - ABSENT VERSUS EMPTY. Turning an option on and back off can leave
 *   `customKit: null` where the stored record has no `customKit` at all. Both
 *   mean "none", and every reader of these records treats them alike.
 *
 * So: key order is ignored, and a field that is `null`, `undefined` or absent
 * is the same as any other of the three. Everything else — numbers, strings,
 * arrays in order — must match exactly.
 */
export function sameRecord(a: unknown, b: unknown): boolean {
  if (isNothing(a) || isNothing(b)) return isNothing(a) && isNothing(b);
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => sameRecord(v, b[i]));
  }
  if (typeof a === "object" && typeof b === "object") {
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    const keys = new Set([...Object.keys(ao), ...Object.keys(bo)]);
    for (const k of keys) {
      if (!sameRecord(ao[k], bo[k])) return false;
    }
    return true;
  }
  return Object.is(a, b);
}

function isNothing(v: unknown): boolean {
  return v === null || v === undefined;
}
