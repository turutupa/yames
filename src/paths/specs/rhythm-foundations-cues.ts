/**
 * Rhythm Foundations: one thing to try, per Exercise (leg cues1, 2026-11-20).
 *
 * The beginner's rhythm Path: the reader may have held a guitar for a week.
 * Every Exercise has one general cue (said before its first Take, after an
 * ungraded one, and as its evenness cue) and one cue for each other trigger
 * it can produce. The orders are about the count and the picking hand's
 * swing, said as teaching, never as something the app heard.
 *
 * Most Exercises here change strings between Takes (`stringSet`), so their
 * cues name no string, fret or note; only the one-version Exercises (the
 * fifth-fret tunes, the shuffle, the funk line, the band pieces) do.
 * Drafts, proof-read by a second reader: see `plans/coach/progress/cues1.md`.
 */
import type { Cue, CueTrigger } from "../format";
import type { CueBook } from "../spec";

const c = (when: CueTrigger, say: string, more?: number): Cue => (more === undefined ? { when, say } : { when, say, more });
/** The general cue: said with nothing measured, and when evenness decided a Take. */
const g = (say: string, more?: number): Cue => ({ ...c("even", say, more), general: true });

// Shared orders, word for word, so each is translated once.
const HEARD_ALL = "Pick every written note, right to the end.";
const NOTES_SAY = "Read one note ahead in the tab as you play.";
const CLICK_LATE = "Play each note right with the click.";
const CLICK_EARLY = "Wait for the click before each note.";
const BEAT_LATE = "Put the first note of each beat on the click.";
const BEAT_EARLY = "Wait for the click at the start of each beat.";
const LONG_LATE = "Put each long note right on the click.";
const LONG_EARLY = "Wait for the click on each long note.";
const HELD_AFTER = "Count the long note out, then come in.";
const LONG_BEAT = "Count the long note's beat, then come in.";
const RING_ONCE = "Let the long note ring; don't pick it again.";
const OPEN_LIFT = "Lift the finger off in time for open notes.";
const STRING_AHEAD = "Move the pick across during the note before.";
const TWO_IN_USE = "Keep the pick on the two strings in use.";
const SHORT_PAIR = "Pick both short notes of each pair.";
const REST_QUIET = "Keep the pick off the strings in the rests.";
const REST_LATE = "Play right on the click after each rest.";
const REST_EARLY = "Count the rest out loud before you come in.";
const REST_MOVE = "Move to the next string during the rest.";
const EXTRA_CLICK = "Pick one note on each click, no more.";
const LSS_LAST = "Count '1, 2 and, 3, 4 and' to the last note.";
const LAND_LAST = "Count '3 and, 4' and land the last note.";
const FRET_BEHIND = "Press each finger right behind the fret.";
const FINGERS_578 = "Use one finger per fret: five, seven, eight.";
const NEXT_FINGER_CROSS = "Have the next finger ready as you cross.";
const LAST_TWO_BEATS = "Hold the last note for both beats.";
const SHIFT_BAR = "Move the hand up as each new bar starts.";

export const RHYTHM_FOUNDATIONS_CUES: CueBook = {
  // Level 1, Step 1: on the beat
  "on-the-beat.open-quarters": [
    g("Play so the click vanishes under each note.", 1),
    c("heard", "Strike every note, one on each click."),
    c("extras", EXTRA_CLICK),
    c("late", CLICK_LATE),
    c("early", CLICK_EARLY),
    c("afterHeld", HELD_AFTER),
    c("openString", "Rest the fretting hand and count the beats."),
    c("stringChange", STRING_AHEAD),
    c("lastBars", "Hold each long note for two full clicks."),
  ],
  "on-the-beat.halves": [
    g("Count '1, 2' right through each long note.", 0),
    c("heard", HEARD_ALL),
    c("extras", RING_ONCE),
    c("notes", NOTES_SAY, 1),
    c("late", "Play the notes on '3' and '4' with the click.", 0),
    c("early", "Wait for '3' before you play again."),
    c("afterHeld", HELD_AFTER),
    c("openString", OPEN_LIFT),
    c("stringChange", "Find the next string during the long note."),
    c("lastBars", "Hold the last note for all four clicks.", 0),
  ],
  "on-the-beat.quarter-riff": [
    g("Keep the fretting fingers close to the strings.", 0),
    c("heard", HEARD_ALL),
    c("extras", EXTRA_CLICK),
    c("notes", "Say 'open, fret, open, fret' as you play."),
    c("late", "Have the finger down before its click.", 1),
    c("early", CLICK_EARLY),
    c("afterHeld", HELD_AFTER),
    c("openString", OPEN_LIFT),
    c("stringChange", STRING_AHEAD),
    c("lastBars", "Hold each of the last two notes for two clicks."),
  ],

  // Level 1, Step 2: eighths
  "eighths.gear-one": [
    g("Fit two notes into each click, down then up.", 0),
    c("heard", "Pick both notes of each pair, down and up."),
    c("extras", "Pick each note twice in bar two, not more.", 0),
    c("notes", NOTES_SAY),
    c("late", "Put the first note of bar two on the click.", 1),
    c("early", "Wait for the click before bar two starts.", 1),
    c("afterHeld", "Let each quarter note last its whole click."),
    c("openString", OPEN_LIFT),
    c("stringChange", STRING_AHEAD),
    c("lastBars", "Keep the down-up going to the last note."),
  ],
  "eighths.eighth-riff": [
    g("Down on the beat, up on the 'and'.", 0),
    c("heard", "Pick every note, down and up alike."),
    c("extras", TWO_IN_USE),
    c("notes", NOTES_SAY),
    c("late", "Put each downstroke on the foot's tap.", 1),
    c("early", "Wait for the foot's tap on each downstroke.", 1),
    c("afterHeld", "Count the last note's beat, then start again."),
    c("openString", OPEN_LIFT),
    c("stringChange", "Stay down-up as you change string.", 0),
    c("lastBars", "Keep the pick going down-up to the end."),
  ],
  "eighths.long-short-short": [
    g("Keep the hand swinging through the long note.", 1),
    c("heard", SHORT_PAIR),
    c("extras", "Let the upstroke miss on each long note.", 1),
    c("notes", NOTES_SAY),
    c("late", LONG_LATE),
    c("early", LONG_EARLY),
    c("afterHeld", LONG_BEAT),
    c("openString", OPEN_LIFT),
    c("stringChange", STRING_AHEAD),
    c("lastBars", LSS_LAST, 0),
  ],

  // Level 1, Step 3: rests
  "rests.quarter-rests": [
    g("Count the rests as loudly as the notes.", 0),
    c("heard", HEARD_ALL),
    c("extras", REST_QUIET, 0),
    c("notes", NOTES_SAY),
    c("late", REST_LATE),
    c("early", REST_EARLY),
    c("openString", OPEN_LIFT),
    c("stringChange", REST_MOVE),
    c("lastBars", "Count '2, 3, 4' out loud in the last rests.", 1),
  ],
  "rests.stops": [
    g("Stop the string on '4', come in on '1'.", 0),
    c("heard", HEARD_ALL),
    c("extras", "Keep the pick off the strings on '4'.", 0),
    c("notes", NOTES_SAY),
    c("late", "Come in right on the '1' after the stop."),
    c("early", "Keep the eighths steady going into the stop.", 1),
    c("afterHeld", "Count '(4)' in silence, then come in.", 0),
    c("openString", OPEN_LIFT),
    c("stringChange", STRING_AHEAD),
    c("lastBars", "Count the last '(4)' before starting again."),
  ],
  "rests.call-answer": [
    g("Echo the phrase in your head during the rest.", 1),
    c("heard", HEARD_ALL),
    c("extras", REST_QUIET),
    c("notes", NOTES_SAY),
    c("late", REST_LATE),
    c("early", REST_EARLY),
    c("afterHeld", LONG_BEAT),
    c("openString", OPEN_LIFT),
    c("stringChange", STRING_AHEAD),
    c("lastBars", "Count both beats of the last rest.", 0),
  ],
  "rests.half-rest": [
    g("Count '3, 4' in silence, then come in on '1'.", 0),
    c("heard", HEARD_ALL),
    c("extras", REST_QUIET),
    c("notes", NOTES_SAY),
    c("late", REST_LATE),
    c("early", "Breathe out through both silent beats.", 1),
    c("openString", OPEN_LIFT),
    c("stringChange", REST_MOVE),
    c("lastBars", "Count the last two silent beats out loud."),
  ],

  // Level 1, Step 4: other strings
  "other-strings.d-and-g": [
    g("Let the half note ring while you say '4'.", 0),
    c("heard", HEARD_ALL),
    c("extras", TWO_IN_USE),
    c("notes", NOTES_SAY),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("afterHeld", HELD_AFTER),
    c("openString", OPEN_LIFT),
    c("stringChange", STRING_AHEAD),
    c("lastBars", "Hold the last note while you count '3, 4'."),
  ],
  "other-strings.g-and-b": [
    g("Swing up past the string on each quarter.", 2),
    c("heard", "Pick each upstroke as firmly as the down."),
    c("extras", TWO_IN_USE),
    c("notes", NOTES_SAY),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("afterHeld", LONG_BEAT),
    c("openString", OPEN_LIFT),
    c("stringChange", STRING_AHEAD),
    c("lastBars", LAND_LAST, 0),
  ],
  "other-strings.stops-higher-up": [
    g("Say each rest as loudly as the notes.", 0),
    c("heard", HEARD_ALL),
    c("extras", REST_QUIET),
    c("notes", NOTES_SAY),
    c("late", REST_LATE),
    c("early", REST_EARLY),
    c("openString", OPEN_LIFT),
    c("stringChange", STRING_AHEAD),
    c("lastBars", "Count '(3)' in silence, then play '4'.", 0),
  ],
  "eighths.fifth-tune": [
    g("Count it once without the guitar, then play.", 1),
    c("heard", FRET_BEHIND),
    c("extras", "Keep the pick on the G and B strings."),
    c("notes", FINGERS_578, 0),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("afterHeld", LONG_BEAT),
    c("stringChange", NEXT_FINGER_CROSS),
    c("lastBars", LAST_TWO_BEATS),
  ],
  "other-strings.three-strings": [
    g("Count each bar out loud before you play it.", 2),
    c("heard", HEARD_ALL),
    c("extras", "Keep the pick on the three strings in use."),
    c("notes", NOTES_SAY),
    c("late", "Land each bar's first note with the band."),
    c("early", "Wait for the band at the start of each beat."),
    c("afterHeld", LONG_BEAT),
    c("openString", OPEN_LIFT),
    c("stringChange", STRING_AHEAD),
    c("lastBars", "Count the last bar out loud as you play it."),
  ],
  "warmup-beginner.walk-up": [
    g("Start well under your clean tempo.", 0),
    c("heard", SHORT_PAIR),
    c("late", LONG_LATE),
    c("early", LONG_EARLY),
    c("afterHeld", LONG_BEAT),
    c("shift", SHIFT_BAR, 0),
    c("lastBars", LSS_LAST, 0),
  ],
  "warmup-beginner.three-and-rest": [
    g("Count '1, 2, 3, (4)' out loud as you play.", 0),
    c("heard", HEARD_ALL),
    c("late", REST_LATE),
    c("early", REST_EARLY),
    c("shift", "Move the hand up during the rest.", 0),
    c("lastBars", "Stop the string on '4' right to the end."),
  ],
};
