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
const BOX_HEARD = "Pick every note, top string to bottom.";
const HELD_CLIMB = "Count the held note out, then climb again.";
const TWO_A_STRING = "Cross after every two notes, without a gap.";
const DOWN_EVEN = "Come down as evenly as you went up.";
const AFTER_LONG = "Count each long note out, then go on.";
// Loops with a pull-off.
const PICKED_HEARD = "Pick the first and last note of every triplet.";
const S16_LATE = "Put each beat's first sixteenth on the beat.";
const S16_EARLY = "Wait for each beat before its first sixteenth.";
// Double stops.
const SINGLE_ONE = "Strike one string only for each single note.";
const STOP_HELD = "Count the held stop's two beats, then go.";
const STOP_LAST = "Hold the last stop for its two beats.";
const GB_ONLY = "Strike just the G and B strings each time.";
// Embellishments inside a chord.
const HAMMER_THIRD = "Hammer hard enough to hear the third.";
const CHORD_HELD = "Keep the chord held while open strings ring.";
const ONE_FINGER_OPEN = "Lift one finger for the open string, not all.";
const BEAT_LATE = "Put each beat's first note right on the beat.";
const BEAT_EARLY = "Wait for each beat before its first note.";
// Chord tones.
const TONES_HEARD = "Pick every chord tone, up and back.";
const NEW_CHORD_MOVE = "Move the hand as each new chord starts.";
const HELD_OUT = "Count the held note out, then start again.";
const ROOT_END = "End each bar on that chord's root.";
const ROOT_SING = "Sing the root before each bar starts.";
const ROOT_HEARD = "Pick all four eighths before each root.";
const ROOT_LATE = "Land each root right on beat three.";
const ROOT_EARLY = "Wait for beat three before each root.";
const ROOT_HELD = "Count each root's two beats, then go on.";
const WHOLE_HOLD = "Hold each third for all four beats.";
const WHOLE_HEARD = "Pick each note firmly and let it ring.";
const WHOLE_EXTRAS = "Play one note a bar and let it ring.";
const WHOLE_LATE = "Play each note right as its bar starts.";
const WHOLE_EARLY = "Wait for '1' before each new note.";
const WHOLE_NEXT = "Have the next finger ready during beat four.";
const WHOLE_LAST = "Hold the last C sharp through all four beats.";

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

  // Level 2, Step 6: box 2
  "box-two.box-two-shape": [
    g("First finger on fret 7, one finger per fret.", 1),
    c("notes", "Say 'A' each time you play one.", 2),
    c("heard", BOX_HEARD),
    c("extras", EXTRAS),
    c("late", EIGHTH_LATE),
    c("early", EIGHTH_EARLY),
    c("afterHeld", HELD_CLIMB),
    c("stringChange", TWO_A_STRING),
    c("lastBars", DOWN_EVEN),
  ],
  "box-two.two-boxes-line": [
    g("Move up two frets on the G string into box 2.", 3),
    c("notes", "Play fret 9 on the G string to enter box 2.", 1),
    c("heard", "Pick every eighth through both boxes."),
    c("extras", EXTRAS),
    c("late", EIGHTH_LATE),
    c("early", EIGHTH_EARLY),
    c("afterHeld", "Count every quarter and the held A in full."),
    c("shift", "Shift up on the G string, back on the low E.", 3),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", "Play the last three notes right on the beat.", 2),
  ],
  "box-two.box-two-lick": [
    g("Keep finger one on fret 7 the whole time.", 2),
    c("notes", "Say A, C, D, C as you start the lick.", 1),
    c("heard", "Pick every eighth, the turn and the walk down."),
    c("extras", EXTRAS),
    c("late", EIGHTH_LATE),
    c("early", EIGHTH_EARLY),
    c("afterHeld", QUARTER_FULL),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", "Play C and A as two full quarter notes.", 1),
  ],
  "box-two.your-two-boxes": [g("Cross over at fret 7 on the G string.", 1)],

  // Level 2, Step 7: repeating licks
  "repeating-licks.pulloff-loop": [
    g("Pick, pull off, pick: count '1-trip-let'.", 1),
    c("notes", "Pull off onto the finger already down.", 1),
    c("heard", PICKED_HEARD),
    c("extras", "Keep the pick on the loop's two strings."),
    c("late", TRIP_LATE),
    c("early", TRIP_EARLY),
    c("afterHeld", "Hold the last note two beats, then start again."),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", "Count the triplets right to the held note."),
  ],
  "repeating-licks.three-over-four": [
    g("Count '1 e and a' under the groups of three.", 1),
    c("notes", "Play C, A, G over and over, then the held A.", 1),
    c("heard", "Pick C and G each time; pull off for A."),
    c("extras", TOP_TWO),
    c("late", S16_LATE),
    c("early", S16_EARLY),
    c("afterHeld", "Count the rest out in full, then start again."),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", "Land the last A on beat one and stop."),
  ],
  "repeating-licks.open-string-repeat": [
    g("Pick the open E as firmly as the fretted notes.", 2),
    c("notes", "Say G, F sharp, G, F sharp on the B string.", 1),
    c("heard", "Pick every open E, every other note."),
    c("extras", TOP_TWO),
    c("late", S16_LATE),
    c("early", S16_EARLY),
    c("afterHeld", "Count the last E's beat, then start again."),
    c("openString", "Move along the B string while the open E rings."),
    c("stringChange", "Keep the pick between the top two strings."),
    c("lastBars", "Climb G, A, B, then land on E at fret 5.", 1),
  ],

  // Level 2, Step 8: double stops
  "double-stops.stops-and-run": [
    g("Hit each double stop short, like a snare."),
    c("notes", "Say A, G, E, D, C, A, C, A down the box.", 1),
    c("heard", "Play all eight double stops of the first bar.", 1),
    c("extras", "Strike two strings for stops, one for the run."),
    c("late", EIGHTH_LATE),
    c("early", EIGHTH_EARLY),
    c("afterHeld", AFTER_LONG),
    c("stringChange", "Go from stops to single notes with no gap."),
    c("lastBars", "Play G, E, G, then hold the A two beats.", 1),
  ],
  "double-stops.stops-and-single": [
    g("Switch from two strings to one without a gap.", 1),
    c("notes", "Say E, D, C, A, then G as you play bar two.", 1),
    c("heard", "Pick the single notes as firmly as the stops."),
    c("extras", SINGLE_ONE),
    c("late", EIGHTH_LATE),
    c("early", EIGHTH_EARLY),
    c("afterHeld", AFTER_LONG),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", "Hold the last G its two beats, then go again."),
  ],
  "double-stops.thirds-over-changes": [
    g("Play each stop on the beat, then count the rest.", 1),
    c("notes", "Play C sharp in the first run, D in the second.", 1),
    c("heard", "Strike all three stops before each rest."),
    c("extras", "Leave each rest silent, then pick the run."),
    c("late", EIGHTH_LATE),
    c("early", EIGHTH_EARLY),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", "Keep the run's eighths even to the last A."),
  ],

  // Level 2, Step 9: double stops in E
  "double-stops-in-e.stops-on-e": [
    g("Lay finger one flat across fret 12.", 2),
    c("heard", "Strike all eight stops in the first bar.", 1),
    c("extras", SHAPE_TWO_ONLY),
    c("late", RIFF_LATE),
    c("early", RIFF_EARLY),
    c("afterHeld", STOP_HELD),
    c("stringChange", "Hold the B string at fret 12; walk the G string.", 1),
    c("lastBars", STOP_LAST),
  ],
  "double-stops-in-e.stops-on-a": [
    g("Third finger flat at fret 14, first at fret 12.", 2),
    c("heard", "Strike the fret 12 stops as firmly as fret 14."),
    c("extras", GB_ONLY, 1),
    c("late", RIFF_LATE),
    c("early", RIFF_EARLY),
    c("afterHeld", STOP_HELD),
    c("stringChange", SHAPE_FLAT),
    c("lastBars", STOP_LAST),
  ],
  "double-stops-in-e.stops-on-b": [
    g("Move the whole hand up two frets from A.", 2),
    c("heard", "Strike the fret 14 stops as firmly as fret 16."),
    c("extras", GB_ONLY, 1),
    c("late", RIFF_LATE),
    c("early", RIFF_EARLY),
    c("afterHeld", STOP_HELD),
    c("stringChange", SHAPE_FLAT),
    c("lastBars", STOP_LAST),
  ],
  "double-stops-in-e.stops-chorus": [
    g("Know the next chord before each figure starts.", 1),
    c("heard", "Strike every stop, all twelve bars through."),
    c("extras", SHAPE_TWO_ONLY),
    c("late", RIFF_LATE),
    c("early", RIFF_EARLY),
    c("afterHeld", STOP_HELD),
    c("shift", "Move up two frets for the B bar, then back.", 2),
    c("stringChange", SHAPE_FLAT),
    c("lastBars", "Hold the last G sharp and B for two beats.", 1),
  ],

  // Level 2, Step 10: embellishment
  "embellishment.open-e": [
    g("Hammer onto fret 1 right on its eighth.", 1),
    c("heard", HAMMER_THIRD),
    c("extras", EXTRAS),
    c("late", EIGHTH_LATE),
    c("early", EIGHTH_EARLY),
    c("afterHeld", "Count the held G sharp out, then start again."),
    c("openString", CHORD_HELD),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", "Hold the last G sharp for its full beat."),
  ],
  "embellishment.hammered-thirds": [
    g("Hammer both strings to fret 9 together.", 2),
    c("heard", "Hammer both fingers down hard, as one."),
    c("extras", EXTRAS),
    c("late", EIGHTH_LATE),
    c("early", EIGHTH_EARLY),
    c("afterHeld", AFTER_LONG),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", "Hold the last E for both beats.", 1),
  ],
  "embellishment.e-to-a": [
    g("Barre fret 5 for the A, then play the same move.", 1),
    c("heard", HAMMER_THIRD),
    c("extras", EXTRAS),
    c("late", EIGHTH_LATE),
    c("early", EIGHTH_EARLY),
    c("afterHeld", "Count the held E out, then hit the low E."),
    c("openString", CHORD_HELD),
    c("shift", "Barre fret 5 as the second bar starts.", 1),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", "Hold the open high E for two beats.", 1),
  ],

  // Level 2, Step 11: embellishment in A
  "embellishment-in-a.open-a": [
    g("Hold the A chord; move only the third finger.", 2),
    c("heard", HAMMER_THIRD),
    c("extras", EXTRAS),
    c("late", EIGHTH_LATE),
    c("early", EIGHTH_EARLY),
    c("afterHeld", "Count the held C sharp out, then start again."),
    c("openString", "Lift the third finger just for the open B.", 2),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", "Hold the last C sharp for its full beat."),
  ],
  "embellishment-in-a.open-d": [
    g("Hold the D chord; move only the second finger.", 2),
    c("heard", HAMMER_THIRD),
    c("extras", EXTRAS),
    c("late", EIGHTH_LATE),
    c("early", EIGHTH_EARLY),
    c("afterHeld", "Count the held F sharp out, then start again."),
    c("openString", "Lift the second finger for the open high E.", 2),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", "Hold the last F sharp for its full beat."),
  ],
  "embellishment-in-a.fourth-and-back": [
    g("Keep the lower finger down; move the top one.", 3),
    c("heard", "Strike every pair, the quarters and the eighths."),
    c("extras", "Strike just the two strings after the bass note."),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("afterHeld", QUARTER_FULL),
    c("openString", ONE_FINGER_OPEN, 3),
    c("stringChange", "Slide the third finger along the B string to D.", 4),
    c("lastBars", "Hold the D shape through to the last pair."),
  ],
  "embellishment-in-a.a-and-d-part": [
    g("Change shape while the open bass string sounds.", 2),
    c("heard", HAMMER_THIRD),
    c("extras", EXTRAS),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("afterHeld", "Count the bass note's beat, then the pair."),
    c("openString", ONE_FINGER_OPEN),
    c("stringChange", "Lead the change with the third finger.", 3),
    c("lastBars", "Hold the last pair for both beats.", 1),
  ],

  // Level 2, Step 12: chord tones
  "chord-tones.arpeggios": [
    g("Say the chord's name as each bar starts."),
    c("notes", "Play the second chord's shape two frets lower.", 1),
    c("heard", TONES_HEARD),
    c("extras", EXTRAS),
    c("late", EIGHTH_LATE),
    c("early", EIGHTH_EARLY),
    c("afterHeld", HELD_OUT),
    c("shift", NEW_CHORD_MOVE),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", "Land the held last note on beat three."),
  ],
  "chord-tones.to-the-root": [
    g(ROOT_END),
    c("notes", ROOT_SING),
    c("heard", ROOT_HEARD),
    c("extras", EXTRAS),
    c("late", ROOT_LATE),
    c("early", ROOT_EARLY),
    c("afterHeld", ROOT_HELD),
    c("shift", NEW_CHORD_MOVE),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", "Hold the last root for both beats."),
  ],
  "chord-tones.thirds-line": [
    g(WHOLE_HOLD, 1),
    c("notes", "Play C sharp, B, F sharp, then C sharp.", 1),
    c("heard", WHOLE_HEARD),
    c("extras", WHOLE_EXTRAS),
    c("late", WHOLE_LATE),
    c("early", WHOLE_EARLY),
    c("stringChange", WHOLE_NEXT),
    c("lastBars", WHOLE_LAST),
  ],
  "chord-tones.land-on-roots": [g(ROOT_END, 1)],

  // Level 2, Step 13: chord tones over A, D and E
  "chord-tones-ade.ade-arpeggios": [
    g("Lay the third finger flat for D and E.", 2),
    c("notes", "Play the D shape two frets higher for E.", 1),
    c("heard", TONES_HEARD),
    c("extras", EXTRAS),
    c("late", EIGHTH_LATE),
    c("early", EIGHTH_EARLY),
    c("afterHeld", "Count the held A out, then start again."),
    c("shift", "Move the barre up two frets, then back."),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", "Land the held A on beat three."),
  ],
  "chord-tones-ade.ade-roots": [
    g("First finger on fret 4; the hand stays put.", 2),
    c("notes", ROOT_SING),
    c("heard", ROOT_HEARD),
    c("extras", EXTRAS),
    c("late", ROOT_LATE),
    c("early", ROOT_EARLY),
    c("afterHeld", ROOT_HELD),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", "Hold the high A for both beats.", 1),
  ],
  "chord-tones-ade.ade-thirds": [
    g(WHOLE_HOLD, 2),
    c("notes", "Play C sharp, F sharp, G sharp, then C sharp.", 1),
    c("heard", WHOLE_HEARD),
    c("extras", WHOLE_EXTRAS),
    c("late", WHOLE_LATE),
    c("early", WHOLE_EARLY),
    c("stringChange", WHOLE_NEXT),
    c("lastBars", WHOLE_LAST),
  ],
  "chord-tones-ade.ade-your-turn": [g("Over E, try landing on G sharp.", 1)],

  // Level 2 warm-up
  "warmup-intermediate.loop-around": [
    g(WELL_UNDER, 0),
    c("heard", PICKED_HEARD),
    c("late", TRIP_LATE),
    c("early", TRIP_EARLY),
    c("shift", NEW_BAR_MOVE, 0),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", "Count the triplets right to the last note."),
  ],
};
