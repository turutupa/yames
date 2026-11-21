/**
 * Triads: one thing to try, per Exercise (leg cues8, 2026-11-20).
 *
 * Most graded Exercises of this Path roll a three-note shape low, middle,
 * high, middle in straight eighths, one chord to a bar; the first Steps count
 * a scale along one string in quarter notes. So the orders are about the
 * shape (which finger lies across, which fret leads), the move to the next
 * shape (look first, start on the last eighth, the note that stays), the
 * numbers of the chords, and the count. Never something the app heard about
 * the hand: it hears when notes sounded and which pitches.
 *
 * Exercises whose key changes between Takes (`key` variants, the warm-ups)
 * name no letter and no fret: chord numbers, string names and the shape only.
 * Every other Exercise is one version and may name its chords and frets.
 * Drafts, proof-read by a second reader: see `plans/coach/progress/cues8.md`.
 */
import type { Cue, CueTrigger } from "../format";
import type { CueBook } from "../spec";

const c = (when: CueTrigger, say: string, more?: number): Cue => (more === undefined ? { when, say } : { when, say, more });
/** The general cue: said with nothing measured, and when evenness decided a Take. */
const g = (say: string, more?: number): Cue => ({ ...c("even", say, more), general: true });

// Shared orders, word for word, so each is translated once.
// Rolled shapes in eighths.
const HEARD = "Press the whole shape down before you pick.";
const EXTRAS = "Pick one string on each eighth, no more.";
const LATE = "Have the next shape ready before '1'.";
const EARLY = "Wait for '1' before the new chord's first note.";
const CROSS = "Keep the pick close as it crosses strings.";
const SHIFT = "Start each change on the last eighth.";
const LAST_EVEN = "Keep the eighths even right to the last note.";
const LOOK = "Look at the next fret before you move.";
const IN_SHAPE = "Keep the fingers in shape as the hand slides.";
const HAND_STILL = "Keep the hand still; only the fingers change.";
const LOOP_ONE = "Land back on one right on '1'.";
// One string, quarter notes.
const HEARD_ONE = "Press right behind the fret, then pick.";
const EXTRAS_Q = "Pick each note once, on its click.";
const LATE_ONE = "Move to the next fret before the click.";
const EARLY_ONE = "Wait for the click before each new note.";
const LATE_Q = "Pick each note right on its click.";
const EARLY_Q = "Wait for the click before each note.";
const SAY_NUMBERS = "Say each note's number as you play it.";
const HOLD_TOP = "Hold the top note for beats three and four.";
// Chord numbers, for the Exercises that change key.
const SAY_1451 = "Say one, four, five, one as each chord starts.";
const SAY_NUMBER = "Say each chord's number before you play it.";
const TOP_SAME = "Keep the top string's fret for one and four.";
// Shapes, named where the Exercise has one version.
const BACK_TO_C = "From G, go straight back to C on '1'.";
const F_ACROSS_13 = "For F, lay finger one across fret thirteen.";
const G_FINGER1_7 = "For G, put finger one at fret seven.";

/**
 * One rolled-shape Exercise: its general cue, its `notes`, `shift` and
 * `lastBars` cues, and the stock orders for the measured things between.
 */
const roll = (gen: Cue, notes: string, shift: string, last: string, cross = CROSS): Cue[] => [
  gen,
  c("notes", notes),
  c("heard", HEARD),
  c("extras", EXTRAS),
  c("late", LATE),
  c("early", EARLY),
  c("shift", shift),
  c("stringChange", cross),
  c("lastBars", last),
];
/** A scale or arpeggio along one string, first finger only, in quarter notes. */
const oneString = (gen: Cue, notes: string, last: string, held?: string): Cue[] => [
  gen,
  c("notes", notes),
  c("heard", HEARD_ONE),
  c("extras", EXTRAS_Q),
  c("late", LATE_ONE),
  c("early", EARLY_ONE),
  ...(held ? [c("afterHeld", held)] : []),
  c("shift", LOOK),
  c("lastBars", last),
];
/**
 * A key-varied warm-up: no `notes` or `extras` check, and nothing named. Its
 * chords jump an octave where the neck runs out, so the variants are not one
 * transposition: no shape, no next string, no direction either.
 */
const warm = (gen: Cue, last = LAST_EVEN): Cue[] => [
  gen,
  c("heard", "Sound all three notes of every chord."),
  c("late", "Have the new chord ready before '1'."),
  c("early", EARLY),
  c("shift", SHIFT),
  c("stringChange", "Keep the pick close to the strings."),
  c("lastBars", last),
];

export const TRIADS_CUES: CueBook = {
  // Level 1 (Beginner), Step 1: one, three and five
  "one-three-five.count-the-scale": oneString(
    g(SAY_NUMBERS, 1),
    "Move one fret only from three to four.",
    "Come down to fret one and hold it two beats.",
  ),
  "one-three-five.pick-three": oneString(
    g("Say each note's number: one, three or five.", 2),
    "Find the high one at fret thirteen.",
    "End on fret five and hold it two beats.",
    "Count fret eight's two beats, then jump up.",
  ),
  "one-three-five.under-one-hand": [
    g("Put all three fingers down and leave them down.", 1),
    c("notes", "Fourth finger on the B string, fret five."),
    c("heard", HEARD),
    c("extras", EXTRAS_Q),
    c("late", LATE_Q),
    c("early", EARLY_Q),
    c("afterHeld", "Count the high note's two beats, then go on."),
    c("stringChange", CROSS),
    c("lastBars", HOLD_TOP),
  ],

  // Level 1, Step 2: three shapes
  "three-shapes.first-two": roll(
    g("Look at fret eight before you leave shape one."),
    "Lay finger one flat across fret eight.",
    SHIFT,
    "Drop back to fret five as the loop starts.",
  ),
  "three-shapes.second-and-third": roll(
    g("Look at fret twelve before you leave shape two."),
    "Finger one on fret twelve, G and top strings.",
    SHIFT,
    "Go straight back to shape two as it loops.",
  ),
  "three-shapes.all-three": roll(
    g("Lead with the G string: five, nine, twelve.", 1),
    "Second finger on fret thirteen in shape three.",
    LOOK,
    "From shape two, drop to fret five as it loops.",
  ),

  // Level 1, Step 3: one, three and five again
  "one-three-five-again.count-f": oneString(
    g(SAY_NUMBERS, 1),
    "Play four at fret six: B flat.",
    "Come down to fret one and hold it two beats.",
  ),
  "one-three-five-again.f-under-one-hand": [
    g("Keep finger one on fret eight into the shape.", 2),
    c("notes", "Third finger on the G string, fret ten."),
    c("heard", HEARD),
    c("extras", EXTRAS_Q),
    c("late", LATE_Q),
    c("early", EARLY_Q),
    c("afterHeld", "Count fret eight's two beats, then the G string."),
    c("shift", LOOK),
    c("stringChange", CROSS),
    c("lastBars", HOLD_TOP),
  ],
  "one-three-five-again.count-g": oneString(
    g(SAY_NUMBERS, 1),
    "Play seven at fret fourteen: F sharp.",
    "Come down to fret three and hold it two beats.",
  ),
  "one-three-five-again.g-under-one-hand": [
    g("Keep finger one on fret ten into the shape.", 2),
    c("notes", "Third finger on the G string, fret twelve."),
    c("heard", HEARD),
    c("extras", EXTRAS_Q),
    c("late", LATE_Q),
    c("early", EARLY_Q),
    c("afterHeld", "Count fret ten's two beats, then the G string."),
    c("shift", LOOK),
    c("stringChange", CROSS),
    c("lastBars", HOLD_TOP),
  ],

  // Level 1, Step 4: F and G
  "f-and-g.f-three-places": roll(
    g("Lead with the G string: five, ten, fourteen.", 1),
    "Second finger on the G string, fret fourteen.",
    SHIFT,
    "From fret ten, drop to fret five as it loops.",
  ),
  "f-and-g.g-three-places": roll(
    g("Lead with the G string: four, seven, twelve.", 1),
    "Second finger on the B string at fret eight.",
    SHIFT,
    "From fret seven, drop to fret four as it loops.",
  ),
  "f-and-g.shape-three-moves": roll(
    g("Keep finger one across the G and top strings.", 1),
    "Finger two on the B string, fret six, for F.",
    "Look at fret five before you leave C.",
    "Hold the C shape down to the last note.",
  ),

  // Level 1, Step 5: three chords
  "three-chords.move-the-shape": roll(
    g(IN_SHAPE, 1),
    "Put fingers three and four at fret ten for F.",
    LOOK,
    "Drop to fret five for the last C.",
  ),
  "three-chords.stay-put": roll(
    g(HAND_STILL, 1),
    "Keep finger one on the top string, fret eight.",
    G_FINGER1_7,
    BACK_TO_C,
  ),
  "three-chords.stay-put-high": roll(
    g("Stay around fret twelve; let the fingers change."),
    F_ACROSS_13,
    "For G, put finger one at fret ten.",
    BACK_TO_C,
  ),
  "three-chords.stay-put-keys": roll(g(SAY_1451), TOP_SAME, HAND_STILL, "From five, go straight back to one on '1'."),

  // Level 1, Step 6: three chords, tunes
  "three-chords-tunes.five-before-four": roll(
    g("Keep the G string at fret twelve from C to G.", 3),
    F_ACROSS_13,
    "From G to F, look at fret thirteen first.",
    "Keep the B string at fret thirteen into C.",
  ),
  "three-chords-tunes.eight-bars": roll(
    g("Follow the form: C, F, G, F, then C, G, F, C.", 2),
    "Put fingers three and four at fret ten for F.",
    "From G to F, move finger one to fret eight.",
    "From F, go straight to C on '1'.",
  ),
  "three-chords-tunes.twelve-bars": roll(
    g("Count the lines of four all the way round.", 3),
    "Finger one across fret thirteen for the high F.",
    "Look at fret fourteen during the second C.",
    "Stay on C for the last two bars.",
  ),
  "three-chords-tunes.eight-bars-keys": roll(g(SAY_NUMBER), TOP_SAME, HAND_STILL, "From four, go straight back to one on '1'."),

  "warmup-beginner.shape-one-keys": warm(g(SAY_1451)),
};
