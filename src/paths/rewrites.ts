/**
 * What `npm run paths -- check` says about the variant rewriter (`variantText.ts`) for one pack, so a
 * content leg reads it without a side script:
 *
 * - every sentence a variant says in other words than its Exercise (a cue, the purpose, a how-to line),
 *   as information: "from" and "to", for a person to read;
 * - every cue a variant cannot say, and why, as information;
 * - as errors, a variant text in the pack that the rewriter would not write for those notes: a cue that
 *   is neither the Exercise's nor the rewriter's, or a how-to line or purpose shaped like one of the
 *   Exercise's (the same words with other note names, frets or strings) that the rewriter refuses or
 *   says otherwise. That is a pack written by an older rewriter, or by hand.
 */
import type { Exercise, ExerciseVariant, PathDoc } from "./format";
import { FIRST_VERSION_LINE, cueTexts, describeVariant } from "./variantText";
import type { ExerciseText, TextSide } from "./variantText";

export type RewriteNote = { where: string; kind: "purpose" | "howTo" | "cue"; from: string; to: string };
export type CueRefusal = { where: string; cue: string; reason: string };
export type RewriteError = { where: string; kind: "purpose" | "howTo" | "cue"; text: string; message: string };
export type RewriteReport = { rewritten: RewriteNote[]; refused: CueRefusal[]; errors: RewriteError[] };

const exercisesOf = (d: PathDoc): Exercise[] => [...d.steps.flatMap((s) => s.exercises), ...(d.levels ?? []).flatMap((l) => l.warmups)];

/** A sentence with its note names, numbers and string names blanked: two sentences of one shape say the same of other notes. */
export function shapeOf(text: string): string {
  return text
    .replace(/\b(low |high |top )?[A-G](?: string| strings)\b/g, "S")
    .replace(/\b(low|high|top) E\b/g, "S")
    .replace(/\btop string\b/g, "S")
    .replace(/\b[A-G](#|b)?(?: sharp| flat)?(?![A-Za-z0-9#])/g, "N")
    .replace(/\d+/g, "#");
}

function sides(ex: Exercise, v: ExerciseVariant): { exercise: ExerciseText; variant: TextSide } {
  return {
    exercise: { purpose: ex.purpose, howTo: ex.howTo, notes: ex.notes, position: ex.position, harmony: ex.harmony, chords: ex.chords, params: ex.variation!.variants[0].params },
    variant: { notes: v.notes, position: v.position, harmony: v.harmony, chords: v.chords, params: v.params },
  };
}

/**
 * `byHand`: the same Path built without the rewriter (`variantText` off), or null when its spec does not
 * set the flag. A variant's purpose or how-to line that is in it was written by its build, by hand, and is
 * not held to the rewriter; with null, only cues are.
 */
export function rewriteReport(doc: PathDoc, byHand: PathDoc | null): RewriteReport {
  const report: RewriteReport = { rewritten: [], refused: [], errors: [] };
  const howTo = byHand !== null;
  const handText = new Map<string, Set<string>>();
  if (byHand) {
    for (const ex of exercisesOf(byHand)) {
      for (const v of ex.variation?.variants ?? []) handText.set(`${ex.id}#${v.id}`, new Set([...(v.purpose !== undefined ? [v.purpose] : []), ...(v.howTo ?? [])]));
    }
  }
  for (const ex of exercisesOf(doc)) {
    const variants = ex.variation?.variants ?? [];
    variants.forEach((v, i) => {
      if (i === 0) return;
      const where = `${ex.id}#${v.id}`;
      const { exercise, variant } = sides(ex, v);
      // Cues.
      const exCues = ex.cues ?? [];
      const said = cueTexts(exercise, variant, exCues.map((c) => c.say));
      said.forEach((s, k) => {
        if (!s.ok) report.refused.push({ where, cue: exCues[k].say, reason: s.reason });
        else if (s.text !== exCues[k].say) report.rewritten.push({ where, kind: "cue", from: exCues[k].say, to: s.text });
      });
      if (v.cues) {
        const allowed = new Set([...exCues.map((c) => c.say), ...said.flatMap((s) => (s.ok ? [s.text] : []))]);
        for (const cue of v.cues) {
          if (!allowed.has(cue.say)) report.errors.push({ where, kind: "cue", text: cue.say, message: "a cue the rewriter does not say for these notes" });
        }
      }
      // Purpose and how-to.
      const described = describeVariant(exercise, variant);
      const text = described.text;
      if (text?.purpose !== undefined && text.purpose !== ex.purpose) report.rewritten.push({ where, kind: "purpose", from: ex.purpose, to: text.purpose });
      text?.howTo?.forEach((line, k) => {
        const from = ex.howTo[described.howToFrom[k]];
        if (from !== undefined && line !== from) report.rewritten.push({ where, kind: "howTo", from, to: line });
      });
      if (!howTo) return;
      const exLines = [ex.purpose, ...ex.howTo];
      const written = new Set([text?.purpose ?? ex.purpose, ...(text?.howTo ?? ex.howTo)]);
      const shown: Array<["purpose" | "howTo", string]> = [
        ...(v.purpose !== undefined ? [["purpose", v.purpose] as ["purpose", string]] : []),
        ...(v.howTo ?? []).map((line): ["howTo", string] => ["howTo", line]),
      ];
      for (const [kind, line] of shown) {
        if (exLines.includes(line) || written.has(line) || FIRST_VERSION_LINE.test(line) || handText.get(where)?.has(line)) continue;
        // Shaped like one of the Exercise's lines, or its start (a line is kept up to its first refused sentence).
        const shape = shapeOf(line);
        const like = exLines.find((e) => shapeOf(e) === shape || shapeOf(e).startsWith(`${shape} `));
        if (like) report.errors.push({ where, kind, text: line, message: `the rewriter does not write this for these notes (from "${like}")` });
      }
    });
  }
  return report;
}
