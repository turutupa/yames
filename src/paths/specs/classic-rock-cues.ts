/**
 * Classic Rock: one thing to try, per Exercise (leg cues6, 2026-11-20).
 *
 * The rock Path: riffs locked to a drummer, fourths and pedal riffs, the
 * minor and major pentatonic boxes and their licks, repeating loops, double
 * stops, chord embellishments, chord tones, a slow melody with bends, call
 * and response and two written solos. Every graded Exercise has one general
 * cue (said before its first Take, after an ungraded one, and as its evenness
 * cue) and one cue for each other trigger it can produce; the self-checked
 * and practice-only ones have the general cue alone.
 *
 * The orders are what a rock teacher says at that spot in that riff: where
 * the hi-hat is, which beat a shape lands on, how long a held note or a bend
 * lasts in counts, when the hand moves. The app hears when a note sounded and
 * which pitch it was; it does not hear palm muting, vibrato, the pick, tone or
 * gain, so no cue says or implies a slip came from them. Bends are timed and
 * never pitch-checked in this Path: a bend cue is about the count or about
 * hearing the target before the bend, never "the bend was flat".
 *
 * Exercises that change key or position between Takes (`key`, `position`,
 * `stringSet` variants) and the three warm-ups name no fret, note or string;
 * every other Exercise is one version and may name its own.
 * Drafts, proof-read by a second reader: see `plans/coach/progress/cues6.md`.
 */
import type { Cue, CueTrigger } from "../format";
import type { CueBook } from "../spec";

const c = (when: CueTrigger, say: string, more?: number): Cue => (more === undefined ? { when, say } : { when, say, more });
/** The general cue: said with nothing measured, and when evenness decided a Take. */
const g = (say: string, more?: number): Cue => ({ ...c("even", say, more), general: true });

// Shared orders, word for word, so each is translated once.
// The riffs: eighths with the drummer.
const RIFF_LATE = "Lock each eighth to the hi-hat, not behind it.";
const RIFF_EARLY = "Sit back: let the hi-hat lead each eighth.";
const RIFF_OPENERS = "Pick both muted notes that start each bar.";
const RIFF_CROSS = "Cross strings with no gap in the eighths.";
const QUARTER_FULL = "Give each quarter note its full beat.";
// Single notes, written.
const EXTRAS = "Pick only the written string for each note.";
const CROSS_CLOSE = "Keep the pick close as you cross strings.";
const EIGHTH_LATE = "Play each beat's first eighth right on the beat.";
const EIGHTH_EARLY = "Wait for the beat before each pair of eighths.";
// Two notes as one hit.
const SHAPE_ONE_HIT = "Strike both strings together, as one hit.";
const SHAPE_TWO_ONLY = "Strike only the two strings of the shape.";
const SHAPE_AGAIN = "Hit every shape, even right after a rest.";
const SHAPE_LONG = "Give each long shape its full count.";
const SHAPE_FLAT = "Keep the fingers flat across both strings.";
const LAST_FIVE = "Hold the last fret 5 for its two beats.";
// Sixteenth groups.
const GROUP_LATE = "Put each group's first note on the beat.";
const GROUP_EARLY = "Wait for the beat before each group.";
const GROUP_TWICE = "Play each four-note group twice, then move.";
const GROUP_HEARD = "Pick every sixteenth, all four in each group.";
const TWO_QUARTERS = "Count the two quarters out, then start again.";
// Triplet repeats.
const TRIP_LATE = "Put each triplet's first note on the beat.";
const TRIP_EARLY = "Wait for the beat before each triplet.";
const TRIP_HEARD = "Pick all three notes of every triplet.";
const ROLL = "Roll one finger between the top two strings.";
const ROLL_CROSS = "Roll from the high E to the B, don't lift.";
const TOP_TWO = "Keep the pick on the top two strings.";
// The extension licks, the boxes.
const UP_AND_BACK = "Pick every eighth, up and back.";
const HOLD_A_AGAIN = "Hold the last A two beats, then start again.";
const LAST_A_BOTH = "Hold the last A for both beats.";
const WELL_UNDER = "Start well under your clean tempo.";
const NEW_BAR_MOVE = "Move the whole hand as each new bar starts.";

export const CLASSIC_ROCK_CUES: CueBook = {
  // Level 1, Step 1: riffs
  "riffs.root-riff": [
    g("Lock every eighth to the drummer's hi-hat.", 0),
    c("notes", "One finger per fret; keep the hand still.", 2),
    c("heard", RIFF_OPENERS),
    c("extras", EXTRAS),
    c("late", RIFF_LATE),
    c("early", RIFF_EARLY),
    c("afterHeld", QUARTER_FULL),
    c("stringChange", RIFF_CROSS),
    c("lastBars", "Land the last two quarters right on the beat."),
  ],
  "riffs.fourths-riff": [
    g(SHAPE_ONE_HIT, 2),
    c("heard", SHAPE_AGAIN),
    c("extras", SHAPE_TWO_ONLY, 2),
    c("late", RIFF_LATE),
    c("early", RIFF_EARLY),
    c("afterHeld", SHAPE_LONG),
    c("shift", "Keep the finger shape as the hand moves."),
    c("stringChange", SHAPE_FLAT, 2),
    c("lastBars", LAST_FIVE),
  ],
  "riffs.pedal-riff": [
    g("Count eighths and let the open A fill the gaps."),
    c("notes", "Say E, G, F sharp, D as you fret them.", 1),
    c("heard", "Pick each open A again, every time."),
    c("extras", "Keep the pick on the A string and the D string."),
    c("late", RIFF_LATE),
    c("early", RIFF_EARLY),
    c("openString", "Ready the next finger as the open A sounds.", 1),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", "Play the run down to the open D evenly."),
  ],

  // Level 1, Step 2: riffs in E
  "riffs-in-e.e-root-riff": [
    g("Lock every open E to the drummer's hi-hat.", 0),
    c("notes", "Use finger two for fret 2, three for fret 3.", 2),
    c("heard", "Pick both open E's that start each bar."),
    c("extras", EXTRAS),
    c("late", RIFF_LATE),
    c("early", RIFF_EARLY),
    c("afterHeld", QUARTER_FULL),
    c("openString", "Have the next finger ready as the open E sounds."),
    c("stringChange", "Cross to the A string with no gap."),
    c("lastBars", "Land G and F sharp right on the beat."),
  ],
  "riffs-in-e.e-fourths-riff": [
    g("Lay one finger flat across both strings.", 2),
    c("heard", SHAPE_AGAIN),
    c("extras", SHAPE_TWO_ONLY),
    c("late", RIFF_LATE),
    c("early", RIFF_EARLY),
    c("afterHeld", SHAPE_LONG),
    c("shift", "Move the hand up for frets 10 and 9.", 2),
    c("stringChange", SHAPE_ONE_HIT),
    c("lastBars", LAST_FIVE),
  ],
  "riffs-in-e.e-pedal-riff": [
    g("Count eighths and let the open E fill the gaps.", 2),
    c("notes", "Say B, D, C sharp as you fret them.", 1),
    c("heard", "Pick each open E again, every time."),
    c("extras", "Keep the pick on the low E and the A string."),
    c("late", RIFF_LATE),
    c("early", RIFF_EARLY),
    c("openString", "Ready the next finger as the open E sounds."),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", "Play the run down to the open A evenly."),
  ],

  // Level 1, Step 3: the box and its extension
  "box-extension.page-descent": [
    g("Count '1 e and a' and keep the groups even.", 1),
    c("notes", GROUP_TWICE, 2),
    c("heard", GROUP_HEARD),
    c("extras", EXTRAS),
    c("late", GROUP_LATE),
    c("early", GROUP_EARLY),
    c("afterHeld", TWO_QUARTERS),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", "Land both closing quarters on the beat."),
  ],
  "box-extension.clapton-repeat": [
    g(ROLL, 1),
    c("notes", "Play A, G, E four times, then C, A, G.", 1),
    c("heard", TRIP_HEARD),
    c("extras", TOP_TWO),
    c("late", TRIP_LATE),
    c("early", TRIP_EARLY),
    c("afterHeld", HOLD_A_AGAIN),
    c("stringChange", ROLL_CROSS, 1),
    c("lastBars", "Count the triplets right to the held A."),
  ],
  "box-extension.sixes-down": [
    g("Say 'one-two-three-four-five-six' each beat.", 3),
    c("notes", "Start each group one box note lower.", 2),
    c("heard", "Pick all six notes of every group."),
    c("extras", EXTRAS),
    c("late", GROUP_LATE, 3),
    c("early", GROUP_EARLY),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", "Land the low A on the beat and hold it."),
  ],
  "box-extension.extension-lick": [
    g("Put finger one at fret 7 for the extension.", 2),
    c("notes", "Say D, G, A, C, D as you climb.", 1),
    c("heard", UP_AND_BACK),
    c("extras", EXTRAS),
    c("late", EIGHTH_LATE),
    c("early", EIGHTH_EARLY),
    c("afterHeld", "Count the last A's beat, then climb again."),
    c("shift", "Move up to fret 7, then back to 5 at the end.", 2),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", "Land the last A on beat four, a full beat."),
  ],

  // Level 1, Step 4: the box at fret 12
  "box-at-twelve.twelve-descent": [
    g("Use finger one for every note at fret 12.", 2),
    c("notes", GROUP_TWICE, 1),
    c("heard", GROUP_HEARD),
    c("extras", EXTRAS),
    c("late", GROUP_LATE),
    c("early", GROUP_EARLY),
    c("afterHeld", TWO_QUARTERS),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", "Land B and E right on the beat."),
  ],
  "box-at-twelve.twelve-triplets": [
    g(ROLL, 1),
    c("notes", "Play E, D, B four times, then G, E, D.", 1),
    c("heard", TRIP_HEARD),
    c("extras", TOP_TWO),
    c("late", TRIP_LATE),
    c("early", TRIP_EARLY),
    c("afterHeld", "Hold the last E two beats, then start again."),
    c("stringChange", ROLL_CROSS, 1),
    c("lastBars", "Count the triplets right to the held E."),
  ],
  "box-at-twelve.twelve-extension": [
    g("Put finger one at fret 14 for the extension.", 2),
    c("notes", "Say A, D, E, G, A as you climb.", 1),
    c("heard", UP_AND_BACK),
    c("extras", EXTRAS),
    c("late", EIGHTH_LATE),
    c("early", EIGHTH_EARLY),
    c("afterHeld", "Count the last E's beat, then climb again."),
    c("shift", "Move up to fret 14, then back to 12 at the end.", 2),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", "Land the last E on beat four, a full beat."),
  ],

  // Level 1, Step 5: the major pentatonic
  "major-pentatonic.major-box": [
    g("Keep one finger per fret across the box.", 1),
    c("notes", "Name each A as you pass it, up and down.", 1),
    c("heard", "Pick every note, top string to bottom."),
    c("extras", EXTRAS),
    c("late", EIGHTH_LATE),
    c("early", EIGHTH_EARLY),
    c("afterHeld", "Count the held note out, then climb again."),
    c("stringChange", "Cross after every two notes, without a gap."),
    c("lastBars", "Come down as evenly as you went up."),
  ],
  "major-pentatonic.southern-lick": [
    g("First finger on 14, third on 16, fourth on 17.", 2),
    c("notes", "Say A, F sharp, E, C sharp as you start.", 1),
    c("heard", "Pick every note of the roll, high to low."),
    c("extras", EXTRAS),
    c("late", EIGHTH_LATE),
    c("early", EIGHTH_EARLY),
    c("afterHeld", HOLD_A_AGAIN),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", LAST_A_BOTH),
  ],
  "major-pentatonic.minor-vs-major": [
    g("Drop the hand a fret for the major bars.", 1),
    c("notes", "Play C sharp, not C, in the major bars.", 1),
    c("heard", "Pick every eighth in both phrases."),
    c("extras", EXTRAS),
    c("late", EIGHTH_LATE),
    c("early", EIGHTH_EARLY),
    c("afterHeld", "Count each long note out, then go on."),
    c("shift", "Move the hand one fret as the mood changes."),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", LAST_A_BOTH),
  ],
  "major-pentatonic.your-mood": [g("Change one note at a time from the written line.", 1)],

  // Level 1 warm-up
  "warmup-beginner.riff-around": [
    g(WELL_UNDER, 0),
    c("heard", RIFF_OPENERS),
    c("late", RIFF_LATE),
    c("early", RIFF_EARLY),
    c("shift", NEW_BAR_MOVE, 0),
    c("stringChange", RIFF_CROSS),
    c("lastBars", "Keep the riff even right to the last note."),
  ],
};
