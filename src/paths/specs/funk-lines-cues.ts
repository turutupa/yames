/**
 * Funk Lines: one thing to try, per Exercise (leg cues9, 2026-11-20).
 *
 * Funk is the count: most of these orders say where a note sits in
 * '1 e and a', which sixteenth stays silent, and what to wait out. Every
 * Exercise has one general cue (said before its first Take, after an ungraded
 * one, and as its evenness cue) and one cue for each other trigger it can
 * produce. The app hears when a note sounded and which pitch; it does not hear
 * a ghosted or muted stroke, the picking hand's swing, how short a note was,
 * or feel. "Keep the hand swinging" is said as teaching only, never as a
 * reason for a slip; a stray note is named only in `extras`, as an order to
 * leave a sixteenth silent.
 *
 * The warm-ups and two band pieces ("The second vamp with the band", "Eight
 * bars with the band") change key between Takes, so their cues name no fret,
 * string or note. Drafts, proof-read by a second reader: see
 * `plans/coach/progress/cues9.md`.
 */
import type { Cue, CueTrigger } from "../format";
import type { CueBook } from "../spec";

const c = (when: CueTrigger, say: string, more?: number): Cue => (more === undefined ? { when, say } : { when, say, more });
/** The general cue: said with nothing measured, and when evenness decided a Take. */
const g = (say: string, more?: number): Cue => ({ ...c("even", say, more), general: true });

// Shared orders, word for word, so each is translated once.
const QUIET_HEARD = "Pick the quiet notes too, just lighter.";
const FOUR_A_BEAT = "Play four notes a beat, no more.";
const BEAT_LATE = "Put the first note of each beat on the click.";
const BEAT_EARLY = "Wait for the click at the start of each beat.";
const NOTES_7_5 = "Three beats on fret seven, the last on five.";
const SHORT_PAIR = "Pick both short notes after each long one.";
const LONG_ON = "Put each beat's long note on the click.";
const LONG_FULL = "Wait the full eighth before the 'and'.";
const A_HEARD = "Pick the 'a' after each hole.";
const A_LATE = "Play the 'a' late, just before the next beat.";
const NO_234 = "Leave '2', '3' and '4' silent.";
const THREE_WAIT = "Wait out '3' before its 'e'.";
const HEARD_ALL = "Pick every written note, right to the end.";
const WAIT_REST = "Wait out each rest before the next note.";
const ONE_THREE = "Put '1' and '3' right on the click.";
const LOW_A_AGAIN = "Count the low A's beat, then start again.";
const LOW_A_HOLD = "Hold the low A on '4' for its whole beat.";
const SILENT_2 = "Leave the 'and' and 'a' of '2' silent.";
const C_LOW_E = "Play C on the low E string at fret eight.";
const BOTH_HEARD = "Pick every note of both lines.";
const BOTH_EXTRAS = "Leave the rests silent in both lines.";
const LOOK_NEXT = "Look at the next string during each rest.";
const HIGH_D_LAND = "Land the high D on '4' and let it ring.";
const WELL_UNDER = "Start well under your clean tempo.";
const ARRIVE = "Arrive on the new note as each bar starts.";

export const FUNK_LINES_CUES: CueBook = {
  // Level 1 (Beginner), Step 1: the engine
  "the-engine.on-the-beat": [
    g("Accent each beat; keep the other three quiet.", 1),
    c("heard", QUIET_HEARD),
    c("extras", FOUR_A_BEAT),
    c("late", "Put each accent right on the click."),
    c("early", "Wait for the click before each accent."),
  ],
  "the-engine.on-the-and": [
    g("Tap the beat with your foot, accent the 'and'.", 0),
    c("heard", QUIET_HEARD),
    c("extras", FOUR_A_BEAT),
    c("late", BEAT_LATE),
    c("early", "Wait for the click; the accent comes after."),
  ],
  "the-engine.backbeat": [
    g("Lean on the first note of '2' and of '4'.", 0),
    c("heard", QUIET_HEARD),
    c("extras", FOUR_A_BEAT),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
  ],

  // Step 2: holes
  "holes.no-e": [
    g("Count '1, and a' and leave each 'e' silent.", 0),
    c("heard", SHORT_PAIR),
    c("extras", "Leave the 'e' of every beat silent."),
    c("notes", NOTES_7_5, 1),
    c("late", LONG_ON),
    c("early", LONG_FULL),
  ],
  "holes.no-and": [
    g("Count '1 e (and) a' and leave the 'and' empty.", 0),
    c("heard", A_HEARD),
    c("extras", "Leave the 'and' of every beat silent."),
    c("notes", NOTES_7_5),
    c("late", BEAT_LATE),
    c("early", A_LATE, 1),
  ],
  "holes.no-one": [
    g("Count '(2) e and a': the beat itself is silent.", 0),
    c("heard", "Pick all three notes after each silent beat."),
    c("extras", NO_234),
    c("notes", NOTES_7_5),
    c("late", "Play each 'e' right after the silent beat.", 1),
    c("early", "Wait out each silent beat before the 'e'."),
  ],

  // Step 3: holes mixed
  "holes-mixed.three-in-a-bar": [
    g("Count '1, and a, 2 e (and) a, (3) e and a'.", 0),
    c("heard", "Pick all twelve notes, right to the end."),
    c("extras", "Leave '3' itself silent."),
    c("notes", "Play beat '4' at fret five, the rest at seven.", 1),
    c("late", "Play the 'e' of '3' right after the silence."),
    c("early", THREE_WAIT, 2),
  ],
  "holes-mixed.two-notes": [
    g("Play every 'a' at fret five, the rest at seven.", 0),
    c("heard", "Press fret five fully for each 'a'."),
    c("extras", "Leave '3' and the 'and' of '2' silent."),
    c("notes", "Lift the third finger off for every 'a'.", 1),
    c("late", "Keep the pick swinging as the note changes.", 2),
    c("early", THREE_WAIT),
  ],
  "holes-mixed.one-a": [
    g("Count '1 (e and) a': two silent strokes a beat.", 0),
    c("heard", "Pick the 'a' before every beat."),
    c("extras", "Leave the 'e' and the 'and' silent."),
    c("notes", NOTES_7_5, 2),
    c("late", BEAT_LATE),
    c("early", "Keep the gap after each beat its full length.", 1),
  ],
  "holes-mixed.one-note-part": [
    g("Count both halves out loud at the first rung.", 2),
    c("heard", HEARD_ALL),
    c("extras", "Swing through the silent beat; play nothing.", 3),
    c("notes", "Keep every note on fret seven."),
    c("late", BEAT_LATE),
    c("early", WAIT_REST),
    c("lastBars", "Land the one short note on '4' to finish.", 1),
  ],

  // Step 4: first lines
  "first-lines.line-one": [
    g("Count '1, and a', then play the 'e' of '2'.", 0),
    c("heard", "Pick every note down to the low A."),
    c("extras", SILENT_2),
    c("notes", "Cross to the A string on '3', fret seven."),
    c("late", ONE_THREE),
    c("early", WAIT_REST),
    c("afterHeld", LOW_A_AGAIN),
    c("stringChange", "Move to the A string in the rests of '2'."),
    c("lastBars", LOW_A_HOLD),
  ],
  "first-lines.line-two": [
    g("Count '1 (e and) a' and start on the low A.", 0),
    c("heard", "Pick every note up to the last A."),
    c("extras", "Leave the 'e' and 'and' of '1' silent."),
    c("notes", C_LOW_E, 0),
    c("late", "Put the low A right on the click."),
    c("early", WAIT_REST),
    c("afterHeld", "Count the held A's beat, then the low A."),
    c("stringChange", "Cross to the A string on the 'a' of '2'."),
    c("lastBars", "Land the held A on '4' and let it ring.", 0),
  ],
  "first-lines.both-lines": [
    g("Breathe on the held A, then start the answer.", 1),
    c("heard", BOTH_HEARD),
    c("extras", BOTH_EXTRAS),
    c("notes", "Start the answer on the low A, fret five."),
    c("late", ONE_THREE),
    c("early", WAIT_REST),
    c("afterHeld", "Count the held A's beat, then play it again.", 1),
    c("stringChange", LOOK_NEXT),
    c("lastBars", "Land the last A on '4' and let it ring."),
  ],

  // Step 5: lines in a second key
  "lines-second-key.d-line-top": [
    g("Count '1 e (and) a' and start on the high D.", 0),
    c("heard", "Pick every note down to the low D."),
    c("extras", "Leave '2' and its 'e' silent."),
    c("notes", "Reach fret eight on the A string for F.", 2),
    c("late", ONE_THREE),
    c("early", WAIT_REST),
    c("afterHeld", "Count the low D's beat, then start again."),
    c("stringChange", "Cross to the D string on '3'.", 1),
    c("lastBars", "Hold the low D on '4' for its whole beat.", 2),
  ],
  "lines-second-key.d-line-bottom": [
    g("Count '1 (e and) a, 2' and start on the low D.", 0),
    c("heard", "Pick every note up to the high D."),
    c("extras", "Leave the 'e', 'and' and 'a' of '2' silent."),
    c("notes", "Play C on the G string at fret five.", 3),
    c("late", "Put the low D right on the click."),
    c("early", THREE_WAIT, 1),
    c("afterHeld", "Count the high D's beat, then the low D."),
    c("stringChange", "Cross to the D string on the 'e' of '3'."),
    c("lastBars", HIGH_D_LAND, 2),
  ],
  "lines-second-key.d-both-lines": [
    g("Breathe on the low D, then start the answer.", 1),
    c("heard", BOTH_HEARD),
    c("extras", BOTH_EXTRAS),
    c("notes", "Start the answer on the low D, fret five."),
    c("late", "Put each line's first note on the click."),
    c("early", WAIT_REST),
    c("afterHeld", "Count the held D's beat, then play it again.", 1),
    c("stringChange", LOOK_NEXT),
    c("lastBars", HIGH_D_LAND, 2),
  ],
  "lines-second-key.figures-line": [
    g("Play a figure on '1', a figure on '3'.", 0),
    c("heard", "Pick every note of each figure."),
    c("extras", "Leave every '2' silent."),
    c("notes", "Find the low A on the low E string, fret five.", 1),
    c("late", "Place each figure's first note on its count."),
    c("early", "Wait out '2' in full before '3'."),
    c("afterHeld", LOW_A_AGAIN),
    c("stringChange", LOOK_NEXT),
    c("lastBars", LOW_A_HOLD, 2),
  ],
  "warmup-beginner.swing-up": [
    g(WELL_UNDER, 0),
    c("heard", SHORT_PAIR),
    c("late", LONG_ON),
    c("early", LONG_FULL),
    c("shift", ARRIVE),
    c("lastBars", "Keep counting '1, and a' to the top note."),
  ],
};
