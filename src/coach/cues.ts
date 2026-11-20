/**
 * One thing to try (DESIGN 4.2): which of the Path's cues the coach says
 * next, chosen only from what the last Take measured.
 *
 * The trigger is read off the note (`takeNote()`), never guessed: the check
 * the verdict turned on when it was not timing (notes heard, extras, right
 * notes), then what the place that slipped has in it (a note after a held one,
 * an open string, a shift, a change of string, the tune's last bars), then
 * the way it leaned (late, early), then evenness itself. The first of those
 * the author wrote a cue for wins. The first time at a spot gets that
 * trigger's first cue, the second time its second if there is one: the
 * note's `repeat` is the history (takeNote has already compared this Take
 * with the earlier ones at the same tempo), so no second count is kept here.
 *
 * With nothing measured (no Take yet, ungraded, not caught, too short) or a
 * pass that moves on, the cue is the Exercise's general one, if it has one,
 * and nothing otherwise: never something generic. A pass that goes up a rung
 * carries no cue from the old tempo's miss.
 *
 * Pure. The words are the pack's, already in the player's language.
 */
import { metricTrigger, placeTriggers } from "../paths/cues";
import { CUE_MAX_CHARS } from "../paths/format";
import type { Cue, CueTrigger, Exercise } from "../paths/format";
import type { TakeNote } from "./takeNote";

export type CuePick = {
  cue: Cue;
  /** Its position in the played Exercise's `cues`: what the source and the How point at. */
  index: number;
  trigger: CueTrigger;
  /**
   * `measured`: chosen by what the last Take measured, so the result may say
   * "Next time: …" under the finding. `general`: the Exercise's general cue,
   * said before a Take and during it, never as the answer to a finding.
   */
  basis: "measured" | "general";
};

type Played = Pick<Exercise, "cues" | "notes" | "meter" | "bars" | "loops" | "position">;

/** The triggers a Take's note measured, in the order they choose a cue. Empty when nothing was. */
export function measuredTriggers(exercise: Played, note: TakeNote | null | undefined): CueTrigger[] {
  if (!note || note.kind !== "result") return [];
  const passedHere = note.verdict === "passed" && note.onceMoreHere;
  if (note.verdict !== "belowBar" && !passedHere) return [];
  const out: CueTrigger[] = [];
  const add = (t: CueTrigger | null) => {
    if (t && !out.includes(t)) out.push(t);
  };
  const metric = passedHere ? null : metricTrigger(note.deciding?.metric);
  // What decided the verdict, when it was not timing: said before any bar is.
  if (metric && metric !== "even") add(metric);
  if (note.place) {
    // A Take that came apart from a round on: that is the place, whatever its bars hold.
    if (note.place.shape === "fromRound") add("lastBars");
    // The note most of the leaning onsets were, when there was one: an open one says so first.
    if (note.direction?.note?.fret === 0) add("openString");
    for (const t of placeTriggers(exercise, note.place.patternBars, note.place.shape === "fromRound")) add(t);
  }
  add(note.direction?.way ?? null);
  if (metric === "even") add("even");
  return out;
}

/** The Exercise's general cue, or null. */
export function generalCue(exercise: Pick<Exercise, "cues">): CuePick | null {
  const cues = exercise.cues ?? [];
  const index = cues.findIndex((c) => c.general === true);
  return index < 0 ? null : { cue: cues[index], index, trigger: cues[index].when, basis: "general" };
}

/**
 * The cue for the next Take, after `note` (null: before the first). The
 * played Exercise is the variant's (`exerciseWithVariant`), whose cues are
 * the ones said for its notes.
 */
export function cueFor(exercise: Played, note: TakeNote | null | undefined): CuePick | null {
  const cues = exercise.cues ?? [];
  if (cues.length === 0) return null;
  for (const trigger of measuredTriggers(exercise, note)) {
    const mine = cues.map((c, i) => (c.when === trigger ? i : -1)).filter((i) => i >= 0);
    if (mine.length === 0) continue;
    const nth = Math.min(Math.max(1, note?.repeat ?? 1), mine.length) - 1;
    const index = mine[nth];
    return { cue: cues[index], index, trigger, basis: "measured" };
  }
  return generalCue(exercise);
}

/** A cue's words as the Take's order: the same sentence, or null when this language made it too long. */
export function cueOrder(pick: CuePick | null | undefined): string | null {
  const said = pick?.cue.say.trim();
  if (!said) return null;
  return [...said].length <= CUE_MAX_CHARS ? said : null;
}
