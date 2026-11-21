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
const NEW_FRET_FIRM = "Look at each new fret before you tap it.";
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
const FLICK_LAST = "Flick the last pull-off of each beat.";
const PUT_BACK = "Put the little finger back down as you tap.";
const BOTH_TAPS_LATE = "Put both taps of each beat on the count.";
const BOTH_TAPS_EARLY = "Wait for '1' and 'and' before each tap.";
const SHAPE_BACK_AM = "Bring the shape back to frets 5 and 8 for Am.";
const EACH_STRING_FIRM = "Fret the new string before the tap pulls off.";
const ONE_ON_ONE = "Land each tap on one string, not two.";
const ROLL_ACROSS = "Roll the first finger across without lifting.";
const CROSS_ON_HAMMER = "Cross both hands during the last hammer-on.";
const FRET_STRING_FIRST = "Fret the new string before the tap pulls off.";
const BEAT_TAP_LATE = "Put each beat's first tap on the click.";
const BEAT_TAP_EARLY = "Wait for the click on each beat's first tap.";
const ALL_THREE = "Fret all three notes before you tap.";
const JUMP_OVER = "Jump both hands over the middle string at once.";
const MOVE_EARLY_WAIT = "Move the tap early and wait above the string.";
const WAIT_ABOVE = "Wait above the string for the click.";
const BOTH_DOWN_TAPS = "Keep both fretting fingers down for the taps.";
const SKIP_HALF_BEAT = "Cross every half beat, both hands at once.";
const BOTH_DOWN_LEAVES = "Land each hammer-on firmly enough to sound.";

export const TAPPING_CUES: CueBook = {
  // Step 1: first taps
  "first-taps.tap-and-pull": [
    g("Tap on the beat, pull off on the 'and'.", 0),
    c("heard", "Pull the tap off toward the floor, not up.", 1),
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
    c("heard", "Hold the long tap down for its whole beat."),
    c("extras", TOP_ONLY),
    c("late", TAP_LATE),
    c("early", "Wait for '1' before the tap after the rest."),
    c("afterHeld", "Have the tap just above the string on '4'.", 1),
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
    g("Move both hands down three frets each.", 1),
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

  // Step 5: sixteenths
  "sixteenths.four-note-loop": [
    g("Count '1 e and a' with the tap on the '1'.", 0),
    c("heard", FLICK_LAST, 1),
    c("extras", ONE_STRING),
    c("late", TAP_LATE),
    c("early", TAP_EARLY),
  ],
  "sixteenths.double-tap": [
    g("Tap twice a beat: on '1' and on the 'and'.", 0),
    c("heard", "Put the lifted finger back down as you tap.", 1),
    c("extras", ONE_STRING),
    c("late", BOTH_TAPS_LATE),
    c("early", BOTH_TAPS_EARLY),
  ],
  "sixteenths.sixteenth-changes": [
    g("Move from each chord's last pull-off.", 1),
    c("heard", FRET_FIRST),
    c("extras", TOP_ONLY),
    c("late", CHORD_LATE),
    c("early", CHORD_EARLY),
    c("lastBars", SHAPE_BACK_AM),
  ],

  // Step 6: sixteenths in E minor
  "sixteenths-in-e-minor.loop-em-to-c": [
    g("Be over the new fret before the chord changes.", 1),
    c("heard", FLICK_LAST),
    c("extras", B_ONLY),
    c("late", CHORD_LATE),
    c("early", CHORD_EARLY),
    c("lastBars", BACK_TO_12_C),
  ],
  "sixteenths-in-e-minor.double-tap-d-to-b": [
    g("Move the tapping hand on each chord's last note.", 1),
    c("heard", "Lift the little finger as the hand moves.", 1),
    c("extras", B_ONLY),
    c("late", BOTH_TAPS_LATE),
    c("early", BOTH_TAPS_EARLY),
    c("lastBars", LOOK_AT_7, 2),
  ],
  "sixteenths-in-e-minor.loop-em-c-d-b": [
    g("Move the tap while the fretting hand plays.", 1),
    c("heard", FRET_FIRST),
    c("extras", B_ONLY),
    c("late", CHORD_LATE),
    c("early", CHORD_EARLY),
    c("lastBars", DOWN_TO_B),
  ],
  "sixteenths-in-e-minor.double-tap-em-c-d-b": [
    g("Keep the taps in steady eighths throughout.", 1),
    c("heard", PUT_BACK, 2),
    c("extras", B_ONLY),
    c("late", "Change the tap's fret between two taps.", 1),
    c("early", BOTH_TAPS_EARLY),
    c("lastBars", DOWN_TO_B),
  ],
  "sixteenths-in-e-minor.loop-with-the-band": [
    g("Play the loop with the band, not ahead of it."),
    c("heard", FLICK_LAST),
    c("extras", ONE_STRING),
    c("late", BAND_LATE),
    c("early", BAND_EARLY),
    c("lastBars", DOWN_TO_LAST),
  ],

  // Step 7: two strings
  "two-strings.two-string-triplets": [
    g("Cross with both hands together, every beat.", 1),
    c("heard", EACH_STRING_FIRM),
    c("extras", ONE_ON_ONE),
    c("late", TAP_LATE),
    c("early", TAP_EARLY),
    c("stringChange", ROLL_ACROSS, 1),
  ],
  "two-strings.three-strings": [
    g("Use the third finger for the G string's fret 7.", 1),
    c("heard", EACH_STRING_FIRM),
    c("extras", ONE_ON_ONE),
    c("late", TAP_LATE),
    c("early", TAP_EARLY),
    c("stringChange", "Move both hands across during the hammer-on."),
  ],
  "two-strings.two-strings-sixteenths": [
    g("Cross on each loop's last pull-off.", 1),
    c("heard", FLICK_LAST),
    c("extras", ONE_ON_ONE),
    c("late", TAP_LATE),
    c("early", TAP_EARLY),
    c("stringChange", ROLL_ACROSS),
  ],

  // Step 8: strings through the chords
  "strings-through-chords.am-to-em": [
    g(CROSS_ON_HAMMER, 1),
    c("heard", FRET_STRING_FIRST, 1),
    c("extras", ONE_ON_ONE),
    c("late", CHORD_LATE),
    c("early", CHORD_EARLY),
    c("stringChange", "Keep both hands at the same frets as you cross."),
    c("lastBars", "Cross back to the top string for Am."),
  ],
  "strings-through-chords.am-f-c-em": [
    g("Say 'tap' or 'string' for what moves next.", 1),
    c("heard", FRET_STRING_FIRST),
    c("extras", ONE_ON_ONE),
    c("late", CHORD_LATE),
    c("early", CHORD_EARLY),
    c("stringChange", CROSS_ON_HAMMER),
    c("lastBars", "Move the tap back down a fret for Em."),
  ],
  "strings-through-chords.two-strings-with-the-band": [
    g("Play two chords on each string with the band."),
    c("heard", FRET_STRING_FIRST),
    c("extras", ONE_ON_ONE),
    c("late", BAND_LATE),
    c("early", BAND_EARLY),
    c("stringChange", CROSS_ON_HAMMER),
    c("lastBars", "Move the tap down a fret for the last chord."),
  ],
  "warmup-intermediate.loop-around": [
    g(WELL_UNDER, 0),
    c("heard", FLICK_LAST),
    c("late", TAP_LATE),
    c("early", TAP_EARLY),
    c("lastBars", HIGH_TAP),
  ],

  // Step 9: sextuplet taps
  "sextuplet-taps.fast-cell": [
    g("Lean on the first tap of each beat.", 0),
    c("heard", HAMMER_FIRM),
    c("extras", ONE_STRING),
    c("late", BEAT_TAP_LATE),
    c("early", BEAT_TAP_EARLY),
  ],
  "sextuplet-taps.fast-melody": [
    g("Move the tap during the beat's last hammer-on.", 1),
    c("heard", NEW_FRET_FIRM),
    c("extras", TOP_ONLY),
    c("late", NEXT_FRET_LATE),
    c("early", BEAT_TAP_EARLY),
  ],
  "sextuplet-taps.fast-changes": [
    g("Move both hands on the F chord's last note.", 1),
    c("heard", FRET_FIRST),
    c("extras", TOP_ONLY),
    c("late", CHORD_LATE),
    c("early", CHORD_EARLY),
    c("lastBars", SHAPE_BACK_AM),
  ],

  // Step 10: the scale under the tap
  "scale-under-the-tap.scale-tap": [
    g("Lean a little on the fourth note of six.", 1),
    c("heard", "Have the fretting hand ready before you tap."),
    c("extras", ONE_STRING),
    c("late", TAP_LATE),
    c("early", TAP_EARLY),
  ],
  "scale-under-the-tap.scale-tap-moves": [
    g(MOVE_EARLY_WAIT, 1),
    c("heard", ALL_THREE),
    c("extras", TOP_ONLY),
    c("late", NEXT_FRET_LATE),
    c("early", WAIT_ABOVE),
  ],
  "scale-under-the-tap.scale-two-strings": [
    g("Use the middle finger at the B string's fret 6.", 0),
    c("heard", ALL_THREE),
    c("extras", ONE_ON_ONE),
    c("late", TAP_LATE),
    c("early", TAP_EARLY),
    c("stringChange", "Cross during the last hammer-on of each beat."),
  ],

  // Step 11: the scale under the tap, again
  "scale-tap-again.scale-tap-e-minor": [
    g("Use the third finger, not the middle, at fret 7.", 1),
    c("heard", ALL_THREE),
    c("extras", B_ONLY),
    c("late", TAP_LATE),
    c("early", TAP_EARLY),
  ],
  "scale-tap-again.scale-tap-walks-down": [
    g("Walk the tap down two frets, two, then one.", 1),
    c("heard", ALL_THREE),
    c("extras", B_ONLY),
    c("late", MOVE_EARLY_WAIT, 1),
    c("early", WAIT_ABOVE),
  ],
  "scale-tap-again.scale-tap-em-to-am": [
    g("Keep the little finger down as the others cross.", 2),
    c("heard", "Put the little finger down before the pull-off.", 2),
    c("extras", ONE_ON_ONE),
    c("late", CHORD_LATE),
    c("early", CHORD_EARLY),
    c("stringChange", "Cross as the last hammer-on sounds."),
    c("lastBars", "Keep the Am figure as even as the Em one."),
  ],

  // Step 12: two taps and string skips
  "two-taps-and-skips.two-taps": [
    g("Tap on the click, then halfway through the beat.", 0),
    c("heard", BOTH_DOWN_TAPS, 1),
    c("extras", TOP_ONLY),
    c("late", BOTH_TAPS_LATE),
    c("early", BOTH_TAPS_EARLY),
  ],
  "two-taps-and-skips.skip-taps": [
    g(JUMP_OVER, 1),
    c("heard", EACH_STRING_FIRM),
    c("extras", ONE_ON_ONE),
    c("late", BOTH_TAPS_LATE),
    c("early", BOTH_TAPS_EARLY),
    c("stringChange", SKIP_HALF_BEAT, 0),
  ],
  "two-taps-and-skips.roll-down": [
    g("Have both fingers down when you tap.", 1),
    c("heard", "Flick both pull-offs toward the floor."),
    c("extras", ONE_STRING),
    c("late", TAP_LATE),
    c("early", TAP_EARLY),
  ],

  // Step 13: two taps through the chords
  "two-taps-through-chords.two-taps-em-am": [
    g("Keep the taps still; move the fretting hand.", 1),
    c("heard", FRET_FIRST),
    c("extras", ONE_STRING),
    c("late", BOTH_TAPS_LATE),
    c("early", BOTH_TAPS_EARLY),
    c("lastBars", "Move the fretting hand as the first tap sounds.", 1),
  ],
  "two-taps-through-chords.two-taps-em-bm": [
    g("Keep the fretting hand still; move the taps.", 0),
    c("heard", BOTH_DOWN_TAPS),
    c("extras", ONE_STRING),
    c("late", BOTH_TAPS_LATE),
    c("early", BOTH_TAPS_EARLY),
    c("lastBars", "Slide the whole tapping hand, thumb and all.", 1),
  ],
  "two-taps-through-chords.skip-em-am": [
    g(JUMP_OVER, 1),
    c("heard", EACH_STRING_FIRM),
    c("extras", ONE_ON_ONE),
    c("late", BOTH_TAPS_LATE),
    c("early", BOTH_TAPS_EARLY),
    c("stringChange", SKIP_HALF_BEAT, 0),
    c("lastBars", "Move only the fretting hand, two frets down."),
  ],
  "two-taps-through-chords.taps-and-skip-line": [
    g("Know each change before it comes.", 1),
    c("heard", FRET_FIRST),
    c("extras", ONE_ON_ONE),
    c("late", BOTH_TAPS_LATE),
    c("early", BOTH_TAPS_EARLY),
    c("stringChange", SKIP_HALF_BEAT),
    c("lastBars", "Have the two-tap figure ready before it starts.", 1),
  ],

  // Step 14: over the band
  "over-the-band.etude-chords": [
    g("Count four cells to every chord.", 0),
    c("heard", HAMMER_FIRM),
    c("extras", TOP_ONLY),
    c("late", BAND_LATE),
    c("early", BAND_EARLY),
    c("lastBars", DOWN_TO_E),
  ],
  "over-the-band.etude-melody": [
    g("Know each chord's four taps before it comes.", 0),
    c("heard", NEW_FRET_FIRM),
    c("extras", TOP_ONLY),
    c("late", NEXT_FRET_LATE),
    c("early", BAND_EARLY),
    c("lastBars", "Reach the tap up to fret 19 and back down."),
  ],
  "over-the-band.tap-minute": [
    g("Let both shoulders drop.", 0),
    c("heard", "Flick every pull-off right to the end."),
    c("late", TAP_LATE),
    c("early", TAP_EARLY),
    c("lastBars", "Start at a tempo you can hold a whole minute."),
  ],

  // Step 15: the second solo
  "second-solo.em-line": [
    g("Move the whole hand as the tap lands.", 1),
    c("heard", BOTH_DOWN_LEAVES, 1),
    c("extras", ONE_STRING),
    c("late", BAND_LATE),
    c("early", BAND_EARLY),
    c("lastBars", DOWN_TO_LAST),
  ],
  "second-solo.em-melody": [
    g("Move the tap during the three fretted notes.", 2),
    c("heard", NEW_FRET_FIRM),
    c("extras", ONE_STRING),
    c("late", NEXT_FRET_LATE),
    c("early", BAND_EARLY),
    c("lastBars", "Move the tap early into the last chord.", 2),
  ],
  "second-solo.em-eight-bars": [
    g("Move both hands up as the melody begins.", 1),
    c("heard", BOTH_DOWN_LEAVES),
    c("extras", ONE_STRING),
    c("late", BAND_LATE),
    c("early", BAND_EARLY),
    c("lastBars", "Keep the last chord as even as the first."),
  ],
  "warmup-advanced.fast-around": [
    g(WELL_UNDER, 1),
    c("heard", HAMMER_FIRM),
    c("late", BEAT_TAP_LATE),
    c("early", BEAT_TAP_EARLY),
    c("lastBars", HIGH_TAP),
  ],
};
