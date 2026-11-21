/**
 * Tapping: one thing to try, per Exercise (leg cues12, 2026-11-20).
 *
 * Written to `plans/coach/CUES_GUIDE.md`, on the shape of
 * `alternate-picking-cues.ts`. Every Exercise has one general cue (said
 * before its first Take, after an ungraded one, and as its evenness cue) and
 * one cue for each other trigger it can produce. The teaching is in the
 * group: the tap carries the count, the fretting hand moves during a named
 * note, the tap goes to its next fret while the hammer-on sounds.
 *
 * Orders, at most 48 characters, about the hands or the count. The app hears
 * when a note sounded and its pitch; it does not hear which hand played it,
 * how hard a tap landed, string noise or muting, so no cue gives any of those
 * as the reason for a slip. Exercises that change string set or key between
 * Takes get cues that name no fret, string, note or chord.
 */
import type { Cue, CueTrigger } from "../format";
import type { CueBook } from "../spec";

const c = (when: CueTrigger, say: string, more?: number): Cue => (more === undefined ? { when, say } : { when, say, more });
/** The general cue: said with nothing measured, and when evenness decided a Take. */
const g = (say: string, more?: number): Cue => ({ ...c("even", say, more), general: true });

// Shared orders, word for word, so each is translated once.
const TAP_LATE = "Put each tap right on the click.";
const TAP_EARLY = "Wait for the click before each tap.";
const ONE_STRING = "Keep the tap on the one string.";
const TOP_ONLY = "Keep the tap on the top string only.";
const B_ONLY = "Keep the tap on the B string only.";
const HAMMER_FIRM = "Land each hammer-on firmly enough to sound.";
const NEXT_FRET_LATE = "Be over the next fret before its beat.";
const NEW_TAP_EARLY = "Wait for the click before each new tap.";
const NEW_FRET_FIRM = "Tap each new fret as firmly as the first.";
const CHORD_LATE = "Put the first tap of each chord on the click.";
const CHORD_EARLY = "Wait for the click on each chord's first tap.";
const BAND_LATE = "Land each chord's first tap with the band.";
const BAND_EARLY = "Wait for the band on each chord's first tap.";
const FRET_FIRST = "Fret the new note before the tap pulls off.";
const MOVE_ON_HAMMER = "Move the tap during the last hammer-on.";
const BACK_TO_12_C = "Move back to fret 12 as the C chord ends.";
const DOWN_TO_B = "Drop both hands three frets for the B chord.";
const DOWN_TO_LAST = "Drop both hands three frets for the last chord.";
const DOWN_TO_E = "Drop both hands one fret for the last chord.";
const LOOK_AT_7 = "Look at fret 7 as the B chord ends.";
const WELL_UNDER = "Start well under your clean tempo.";
const HIGH_TAP = "Keep the high tap as even as the low one.";

export const TAPPING_CUES: CueBook = {
  // Step 1: first taps
  "first-taps.tap-and-pull": [
    g("Tap on the beat, pull off on the 'and'.", 0),
    c("heard", "Pull the tap off sideways, toward the floor.", 1),
    c("extras", ONE_STRING),
    c("late", TAP_LATE),
    c("early", TAP_EARLY),
  ],
  "first-taps.tap-pull-hammer": [
    g("Count '1-trip-let' with the tap on the '1'.", 0),
    c("heard", HAMMER_FIRM, 1),
    c("extras", ONE_STRING),
    c("late", "Bring the tap down as the hammer-on lands.", 1),
    c("early", TAP_EARLY),
  ],
  "first-taps.four-notes": [
    g("Tap on '1' and '3', four notes from each.", 0),
    c("heard", "Flick the last pull-off toward the floor.", 1),
    c("extras", ONE_STRING),
    c("late", "Put the taps right on '1' and '3'."),
    c("early", "Wait for '1' and '3' before you tap."),
  ],

  // Step 2: moving the tap
  "moving-the-tap.tap-melody": [
    g("Move the tap while the little finger hammers.", 1),
    c("heard", "Aim each new tap before it comes down."),
    c("extras", TOP_ONLY),
    c("late", NEXT_FRET_LATE, 1),
    c("early", NEW_TAP_EARLY),
  ],
  "moving-the-tap.tap-scale": [
    g("Know the next tap's fret before you leave.", 1),
    c("heard", NEW_FRET_FIRM),
    c("extras", TOP_ONLY),
    c("late", NEXT_FRET_LATE),
    c("early", NEW_TAP_EARLY),
    c("lastBars", "Keep the taps even on the way back down."),
  ],
  "moving-the-tap.tap-and-stop": [
    g("Count the rest, then tap from just above.", 1),
    c("heard", "Tap the long note as firmly as the cells."),
    c("extras", TOP_ONLY),
    c("late", TAP_LATE),
    c("early", "Wait for '1' before the tap after the rest."),
    c("afterHeld", "Count the rest out, then tap on '1'.", 1),
    c("lastBars", "Hold the last tap a full beat, then rest."),
  ],

  // Step 3: changing the chord
  "changing-the-chord.am-to-f": [
    g("Move the tap a fret during the last hammer-on."),
    c("heard", HAMMER_FIRM),
    c("extras", TOP_ONLY),
    c("late", CHORD_LATE),
    c("early", CHORD_EARLY),
    c("lastBars", "Move back to fret 12 as the F chord ends."),
  ],
  "changing-the-chord.am-f-e": [
    g("Keep the fretting fingers' gap as they slide.", 1),
    c("heard", HAMMER_FIRM),
    c("extras", TOP_ONLY),
    c("late", CHORD_LATE),
    c("early", CHORD_EARLY),
    c("lastBars", "Slide the fretting hand back up a fret for Am."),
  ],
  "changing-the-chord.andalusian": [
    g("Look at fret 7 before you leave Am.", 2),
    c("heard", HAMMER_FIRM),
    c("extras", TOP_ONLY),
    c("late", BAND_LATE),
    c("early", BAND_EARLY),
    c("lastBars", DOWN_TO_E),
  ],

  // Step 4: the cell in E minor
  "cell-in-e-minor.em-to-c": [
    g("Move only the tap: fret 12, then fret 13.", 0),
    c("heard", HAMMER_FIRM),
    c("extras", B_ONLY),
    c("late", CHORD_LATE),
    c("early", CHORD_EARLY),
    c("lastBars", BACK_TO_12_C),
  ],
  "cell-in-e-minor.d-to-b": [
    g("Move both hands down three frets together.", 1),
    c("heard", FRET_FIRST, 2),
    c("extras", B_ONLY),
    c("late", MOVE_ON_HAMMER, 2),
    c("early", CHORD_EARLY),
    c("lastBars", LOOK_AT_7, 1),
  ],
  "cell-in-e-minor.em-c-d-b": [
    g("Keep the shape; only where it sits changes.", 1),
    c("heard", FRET_FIRST),
    c("extras", B_ONLY),
    c("late", MOVE_ON_HAMMER),
    c("early", CHORD_EARLY),
    c("lastBars", DOWN_TO_B),
  ],
  "cell-in-e-minor.em-with-the-band": [
    g("Keep the shape as it moves under the tap."),
    c("heard", HAMMER_FIRM),
    c("extras", ONE_STRING),
    c("late", BAND_LATE),
    c("early", BAND_EARLY),
    c("lastBars", DOWN_TO_LAST),
  ],
  "warmup-beginner.cell-around": [
    g(WELL_UNDER, 0),
    c("heard", HAMMER_FIRM),
    c("late", TAP_LATE),
    c("early", TAP_EARLY),
    c("lastBars", HIGH_TAP),
  ],
};
