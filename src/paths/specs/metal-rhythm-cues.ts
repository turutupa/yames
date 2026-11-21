/**
 * Metal Rhythm: one thing to try, per Exercise (leg cues10, 2026-11-20).
 *
 * Shaped like `alternate-picking-cues.ts` (see `plans/coach/CUES_GUIDE.md`).
 * Every Exercise has one general cue (said before its first Take, after an
 * ungraded one, and as its evenness cue) and one cue for each other trigger
 * it can produce. `more` points at the how-to line the cue comes from.
 *
 * The app measures when a note sounded and which pitch. It does not hear the
 * palm mute, downstrokes against alternate picking, tightness, gain or tone,
 * so no cue gives any of them as the reason for a slip. "All downstrokes" and
 * the palm are said only as the Exercise's own instruction, in its general
 * cue. The place cues carry the count: where the gallop's short notes fall,
 * where the chord stab lands, how a long run of sixteenths is held together.
 * Exercises that change string or key between Takes name no string, fret or
 * note.
 */
import type { Cue, CueTrigger } from "../format";
import type { CueBook } from "../spec";

const c = (when: CueTrigger, say: string, more?: number): Cue => (more === undefined ? { when, say } : { when, say, more });
/** The general cue: said with nothing measured, and when evenness decided a Take. */
const g = (say: string, more?: number): Cue => ({ ...c("even", say, more), general: true });

// Shared orders, word for word, so each is translated once.
const BEAT_LATE = "Put the first note of each beat on the click.";
const BEAT_EARLY = "Wait for the click at the start of each beat.";
const SAME_STROKE = "Give every eighth the same firm stroke.";
const BOTH_STRINGS = "Strike both strings of every chord.";
const JUST_TWO = "Strike just the two strings of each chord.";
const LOW_E_ONLY = "Keep the pick on the low E only.";
const CHUGS_LOW_E = "Keep the chugs on the low E only.";
const START_LOW_E = "Start every stroke on the low E string.";
const NEW_CHORD_LATE = "Arrive at each new chord before the click.";
const NEW_CHORD_EARLY = "Wait for the click before each new chord.";
const CHORD_COUNT_LATE = "Land each chord right on its count.";
const CHORD_COUNT_EARLY = "Wait for the count before each chord.";
const CHORD_ARRIVE = "Arrive at each chord before its count.";
const CHUGS_BETWEEN = "Pick every chug between the chords.";
const TWO_ONE = "Hit two strings on chords, one on chugs.";
const FRETTED_FIRM = "Pick each fretted note as firmly as the chug.";
const FRETTED_LATE = "Put each fretted note right on its count.";
const FRETTED_EARLY = "Wait for the count before each fretted note.";
const FINGERS_356 = "Fingers one, three, four on frets 3, 5 and 6.";
const AND_LATE = "Put the note after each rest on its 'and'.";
const AND_EARLY = "Wait for the 'and' after each rest.";
const SLIDE_SPACING = "Keep the fingers' spacing as the hand slides.";
const MOVE_IN_REST = "Move to the A chord during the rest before it.";
const STOP_LAST_G = "Stop the last G on the 'and', then go round.";
const CHUG_ON_E = "Move the fretting hand while the open E chugs.";
const THREES = "Count '1 2 3, 1 2 3, 1 2': chord on each 1.";
const WELL_UNDER = "Start well under your clean tempo.";
const EVEN_TO_END = "Keep the eighths even right to the last note.";

export const METAL_RHYTHM_CUES: CueBook = {
  // ---------------------------------------------------------------- Level 1
  // Step 1: the chug
  "the-chug.open-chug": [
    g("Down on every eighth, two to the click.", 0),
    c("heard", SAME_STROKE),
    c("extras", "Keep the pick on the one string only."),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("openString", "Have the fretted notes ready before they come."),
    c("lastBars", "Count '4 and' on the two fretted notes.", 0),
  ],
  "the-chug.chug-and-note": [
    g("Lift the palm for the fretted notes only.", 0),
    c("heard", FRETTED_FIRM),
    c("extras", LOW_E_ONLY),
    c("notes", FINGERS_356, 1),
    c("late", FRETTED_LATE),
    c("early", FRETTED_EARLY),
    c("openString", CHUG_ON_E),
    c("lastBars", "Walk B flat, A, G down evenly to the end."),
  ],
  "the-chug.accent-open": [
    g("Count '1 2 3, 1 2 3, 1 2', accent on each 1.", 1),
    c("heard", "Play every quiet note, just lighter."),
    c("extras", LOW_E_ONLY),
    c("late", "Land each accent right on its count."),
    c("early", "Wait for the count before each accent."),
    c("openString", "Keep the quiet open Es as even as the accents."),
    c("lastBars", "Accent both fretted notes at the end.", 1),
  ],

  // Step 2: power chords
  "power-chords.two-note-chords": [
    g("Move the hand as one shape between chords.", 1),
    c("heard", BOTH_STRINGS),
    c("extras", JUST_TWO),
    c("late", NEW_CHORD_LATE),
    c("early", NEW_CHORD_EARLY),
    c("openString", "Hover over fret 3 while the open E rings."),
    c("shift", SLIDE_SPACING, 1),
    c("stringChange", START_LOW_E, 0),
    c("lastBars", "Come back down to G right on beat three."),
  ],
  "power-chords.chord-stops": [
    g("Keep the hand moving in eighths through rests.", 1),
    c("heard", BOTH_STRINGS),
    c("extras", "Stop the strings with both hands on each rest.", 0),
    c("late", "Put each chord after a rest on its 'and'."),
    c("early", AND_EARLY),
    c("openString", "Count each rest out before the next E chord."),
    c("shift", MOVE_IN_REST),
    c("stringChange", START_LOW_E),
    c("lastBars", STOP_LAST_G),
  ],
  "power-chords.moving-fifths": [
    g("Leave the first chord a hair before beat two.", 0),
    c("heard", BOTH_STRINGS),
    c("extras", JUST_TWO),
    c("late", "Arrive at G before the click on two."),
    c("early", "Wait for the click on two before the G."),
    c("afterHeld", "Count the long chord's beat, then jump to G.", 0),
    c("openString", "Have fret 3 ready while the open E rings."),
    c("shift", "Keep fingers one and three on their strings.", 1),
    c("stringChange", START_LOW_E),
    c("lastBars", "Hold the last G for its whole beat."),
  ],

  // Step 3: chug and chord
  "chug-and-chord.chug-chord": [
    g(THREES),
    c("heard", CHUGS_BETWEEN),
    c("extras", CHUGS_LOW_E),
    c("late", CHORD_COUNT_LATE),
    c("early", CHORD_COUNT_EARLY),
    c("openString", "Leave the first finger on fret 2 for the chugs.", 0),
    c("shift", "Move to G and A for the last two eighths.", 1),
    c("stringChange", TWO_ONE),
    c("lastBars", "Put G on '4' and A on its 'and'.", 1),
  ],
  "chug-and-chord.chug-riff": [
    g("Move to each chord during the two chugs.", 0),
    c("heard", CHUGS_BETWEEN),
    c("extras", JUST_TWO),
    c("late", CHORD_ARRIVE),
    c("early", CHORD_COUNT_EARLY),
    c("afterHeld", "Count the long chord's beat out, then chug.", 1),
    c("openString", CHUG_ON_E),
    c("shift", "Slide from A straight back down to G.", 0),
    c("stringChange", TWO_ONE),
    c("lastBars", "Count '3 and 4' for the A, G and E chords."),
  ],
  "chug-and-chord.stop-riff": [
    g("Count every rest; play after it on the 'and'.", 1),
    c("heard", CHUGS_BETWEEN),
    c("extras", "Silence each chord with both hands on its rest.", 0),
    c("late", AND_LATE),
    c("early", AND_EARLY, 1),
    c("openString", CHUG_ON_E),
    c("shift", MOVE_IN_REST),
    c("stringChange", TWO_ONE),
    c("lastBars", STOP_LAST_G),
  ],

  // Step 4: the A-string chug
  "a-string-chug.a-chug-notes": [
    g("Begin every stroke on the A string.", 2),
    c("heard", FRETTED_FIRM),
    c("extras", "Keep the pick on the A string only.", 2),
    c("notes", FINGERS_356, 1),
    c("late", FRETTED_LATE),
    c("early", FRETTED_EARLY),
    c("openString", "Move the fretting hand while the open A chugs."),
    c("lastBars", "Walk D, E flat, D, C evenly to the end.", 1),
  ],
  "a-string-chug.a-c-d-chords": [
    g("Switch to eighths on the D chord, same tempo.", 1),
    c("heard", BOTH_STRINGS),
    c("extras", "Strike just the A string and the D string.", 0),
    c("late", NEW_CHORD_LATE),
    c("early", NEW_CHORD_EARLY),
    c("afterHeld", "Count each chord's full beat, then move."),
    c("openString", "Have the C shape ready as the A chord rings."),
    c("shift", SLIDE_SPACING),
    c("stringChange", "Begin every stroke on the A string.", 2),
    c("lastBars", "Count four eighths on D, four on C.", 1),
  ],
  "a-string-chug.a-chug-chords": [
    g("Palm down for the chugs, up for the chords.", 0),
    c("heard", CHUGS_BETWEEN),
    c("extras", "Begin every stroke on the A string."),
    c("late", CHORD_COUNT_LATE),
    c("early", CHORD_COUNT_EARLY),
    c("openString", "Hover over the next chord while the A chugs.", 2),
    c("stringChange", TWO_ONE),
    c("lastBars", "Strike the last two C chords on '4 and'.", 1),
  ],
  "a-string-chug.two-string-riff": [
    g("Begin each chord's stroke on the A string.", 1),
    c("heard", CHUGS_BETWEEN),
    c("extras", CHUGS_LOW_E),
    c("late", CHORD_ARRIVE),
    c("early", CHORD_COUNT_EARLY),
    c("afterHeld", "Count the A chord's beat, then chug again.", 2),
    c("openString", "Hover over each chord while the open E chugs."),
    c("stringChange", "Cross to the A string for each chord, then back."),
    c("lastBars", "Put D on '2', C on '3 and', A on '4'.", 0),
  ],

  // Warm-up, Level 1 (a new key and string each Take: name nothing)
  "warmup-beginner.root-chug": [
    g(WELL_UNDER, 0),
    c("heard", SAME_STROKE),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("shift", "Move the hand five frets as each bar starts."),
    c("lastBars", EVEN_TO_END),
  ],
};
