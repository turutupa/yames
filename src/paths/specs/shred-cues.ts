/**
 * Shred: one thing to try, per Exercise (leg cues14, 2026-11-20).
 *
 * Same shape as `alternate-picking-cues.ts` (the worked example for
 * `plans/coach/CUES_GUIDE.md`): one general cue per Exercise and one cue per
 * trigger it can produce, `more` pointing at the how-to line the cue comes
 * from. Sequences and bursts are worded as Alternate Picking words them, so
 * the two Paths agree.
 *
 * Teaching at speed: where the accent and the count sit in a long run, where
 * the hand changes position, and the last bars of a run (the count, never
 * "relax"). The app hears when a note sounded and which pitch; it does not
 * hear pick direction, hammered against picked, muting, tension or tone, so
 * no cue says or implies a slip came from them. Most Exercises change key,
 * string or position between Takes: their cues name no fret, string or note.
 * Proof-read by a second reader: see `plans/coach/progress/cues14.md`.
 */
import type { Cue, CueTrigger } from "../format";
import type { CueBook } from "../spec";

const c = (when: CueTrigger, say: string, more?: number): Cue => (more === undefined ? { when, say } : { when, say, more });
/** The general cue: said with nothing measured, and when evenness decided a Take. */
const g = (say: string, more?: number): Cue => ({ ...c("even", say, more), general: true });

// Shared orders, word for word, so each is translated once (several as Alternate Picking words them).
const RIGHT_THROUGH = "Pick every note right through.";
const BEAT_LATE = "Put the first note of each beat on the click.";
const BEAT_EARLY = "Wait for the click at the start of each beat.";
const CROSS_CLOSE = "Keep the pick close as you cross.";
const CROSS_SMALL = "Keep the stroke small as you cross strings.";
const TWO_STRINGS = "Keep the stroke small: just the two strings.";
const IN_USE = "Keep the stroke small: just the strings in use.";
const HOP = "Make the hop smaller, not faster.";
const ONE_STRING = "Keep the pick on one string only.";
const TOP_ONLY = "Keep the pick on the top string only.";
const A_ONLY = "Keep the pick on the A string only.";
const QUIET_HEARD = "Play every quiet note, just lighter.";
const SIX_LATE = "Put the first of each six on the click.";
const SIX_EARLY = "Wait for the click before each six.";
const NEW_PAIR_LATE = "Put each new pair right on the beat.";
const NEW_PAIR_EARLY = "Wait for the click before each new pair.";
const NEXT_PAIR = "Know the next pair before it comes.";
const WELL_UNDER = "Start well under your clean tempo.";

export const SHRED_CUES: CueBook = {
  // Level 1, Step 1: one string
  "one-string.open-a": [
    g("Land every stroke on its '1 e and a'.", 0),
    c("heard", "Pick every open A right through."),
    c("extras", A_ONLY),
    c("late", "Put each '1' right on the click."),
    c("early", "Wait for the click on each '1'."),
    c("openString", "Keep every stroke the same size."),
    c("lastBars", "Keep counting '1 e and a' to the last note."),
  ],
  "one-string.chromatic-on-g": [
    g("Land each finger exactly as the pick strikes."),
    c("heard", "Press each finger right behind the fret."),
    c("extras", "Keep each finger down until the next lands.", 2),
    c("notes", "One finger per fret: never skip one."),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("shift", "Move the hand one fret as each bar starts.", 0),
    c("lastBars", "Keep the walk down as even as the walk up."),
  ],
  "one-string.four-of-each": [
    g("Move the fretting hand exactly on the beat.", 0),
    c("heard", RIGHT_THROUGH),
    c("extras", TOP_ONLY),
    c("notes", "Say A, C, B, A, then G, A, B, C.", 0),
    c("late", "Put each new note right on the click."),
    c("early", "Wait for the click before each new note."),
    c("shift", "Have the next finger ready over its fret."),
    c("lastBars", "Give the last C all four of its strokes."),
  ],
  "one-string.twelve-thirteen-fifteen": [
    g("Leave the first finger down through the loop.", 1),
    c("heard", "Press the little finger fully down."),
    c("extras", ONE_STRING),
    c("notes", "Reach two frets up with the little finger.", 0),
    c("late", "Put each loop's first note on the click."),
    c("early", "Wait for the click before each loop."),
  ],

  // Level 1, Step 2: accents
  "accents.walking-accent": [
    g("Keep the time still as the accent moves.", 0),
    c("heard", QUIET_HEARD),
    c("extras", "Keep the pick on the G string only."),
    c("late", "Put each '1' on the click, accent or not."),
    c("early", "Wait for the click; do not rush the accent."),
    c("lastBars", "Accent the last of each four, right on time."),
  ],
  "accents.open-triplets": [
    g("Accent the first and fourth of each six.", 0),
    c("heard", QUIET_HEARD),
    c("extras", A_ONLY),
    c("late", SIX_LATE),
    c("early", SIX_EARLY),
    c("openString", "Keep the six even between the accents."),
  ],
  "accents.sextuplet-accent": [
    g("Accent the first of each six; count the beat.", 0),
    c("heard", QUIET_HEARD),
    c("extras", ONE_STRING),
    c("late", SIX_LATE),
    c("early", SIX_EARLY),
  ],
  "accents.three-against-four": [
    g("Tap your foot on the click, not the accents.", 1),
    c("heard", QUIET_HEARD),
    c("extras", TOP_ONLY),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("lastBars", "Count the beats until the accent meets the '1'."),
  ],

  // Level 1, Step 3: crossing
  "crossing.outside-pairs": [
    g("Change the notes; keep the strokes the same.", 0),
    c("heard", "Pick the higher string as firmly as the lower."),
    c("extras", TWO_STRINGS),
    c("notes", NEXT_PAIR),
    c("late", NEW_PAIR_LATE),
    c("early", NEW_PAIR_EARLY),
    c("stringChange", CROSS_CLOSE),
  ],
  "crossing.inside-pairs": [
    g("Keep it as even as the outside pairs."),
    c("heard", "Pick the lower string as firmly as the higher."),
    c("extras", TWO_STRINGS),
    c("notes", NEXT_PAIR),
    c("late", NEW_PAIR_LATE),
    c("early", NEW_PAIR_EARLY),
    c("stringChange", HOP, 0),
  ],
  "crossing.outside-lick": [
    g("Alternate strictly; never add a stroke.", 1),
    c("heard", RIGHT_THROUGH),
    c("extras", IN_USE),
    c("notes", "Say the lick's first note before you start."),
    c("late", "Start each lick right on the click."),
    c("early", "Wait for the click before each lick."),
    c("stringChange", CROSS_CLOSE),
  ],
  "warmup-beginner.one-string-climb": [
    g(WELL_UNDER, 0),
    c("heard", RIGHT_THROUGH),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("shift", "Start one note higher as each bar starts."),
    c("lastBars", "Keep the highest notes as even as the low."),
  ],
};
