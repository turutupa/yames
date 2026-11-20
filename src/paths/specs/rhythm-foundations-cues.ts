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
const SHIFT_BAR = "Arrive on the new note as each bar starts.";
const AND_LATE = "Play each 'and' as soon as the foot lifts.";
const AND_EARLY = "Wait for the foot to lift before each 'and'.";
const UP_CATCH = "Catch the string on every upstroke.";
const FOOT_LAST = "Keep the foot tapping to the last 'and'.";
const SILENT_SWING = "Swing past the strings on the silent beats.";
const COUNT_THREES = "Keep counting in threes to the last note.";
const PUSH_AFTER_EARLY = "Wait for the click on the note after a push.";
const PUSH_COUNT = "Keep counting through each pushed note.";
const SWING_ON = "Keep the swing going right to the last note.";
const TOUCH_WRITTEN = "Touch the string only on the written notes.";
const TRIPLETS = "Count '1-trip-let' and keep it even.";
const PAIR_BOTH = "Pick both notes of every pair, long and short.";
const TWICE = "Play each note twice, then move on.";
const F24 = "First finger on fret two, third on fret four.";
const SHORT_LATE = "Play the short note late, just before the beat.";
const OPEN_BOTH = "Lift both fingers off for the open notes.";
const OPEN_CROSS = "Move across as each open note ends.";
const LAST_BEAT = "Hold the last note for its whole beat.";
const GALLOP_HEARD = "Pick the two short notes light but clear.";
const A_LATE = "Play the 'a' late, just before the next beat.";
const LAND_FOUR = "Land the last quarter note on '4'.";
const CHORD_BOTH = "Strike both strings with every stroke.";
const CHORD_SMALL = "Keep the stroke small: just the two strings.";
const CHORD_FINGER = "Keep the first finger down on every chord.";
const CHORD_ACROSS = "Brush both strings in one stroke, not two.";
const LAST_CHORD = "Hold the last chord through '4'.";
const WITH_BAND = "Land each bar's first note with the band.";
const BAND_EARLY = "Wait for the band at the start of each beat.";

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
    c("late", WITH_BAND),
    c("early", BAND_EARLY),
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

  // Level 2, Step 5: off-beats
  "off-beats.the-and": [
    g("Play each note as the foot comes up.", 1),
    c("heard", UP_CATCH),
    c("extras", "Miss the string on each beat after the first.", 0),
    c("notes", NOTES_SAY),
    c("late", AND_LATE, 1),
    c("early", AND_EARLY, 1),
    c("openString", OPEN_LIFT),
    c("stringChange", STRING_AHEAD),
    c("lastBars", FOOT_LAST),
  ],
  "off-beats.dotted-quarter": [
    g("Put each short note on its 'and'.", 0),
    c("heard", "Catch the string on each short upstroke.", 1),
    c("extras", RING_ONCE, 1),
    c("notes", NOTES_SAY),
    c("late", "Play each short note on its 'and', not later."),
    c("early", "Hold the long note for a beat and a half."),
    c("openString", OPEN_LIFT),
    c("stringChange", STRING_AHEAD),
    c("lastBars", "Hold the last note from '3' to the end.", 0),
  ],
  "off-beats.three-three-two": [
    g("Count '1 2 3, 1 2 3, 1 2' and play each '1'.", 0),
    c("heard", HEARD_ALL),
    c("extras", "Play three notes in each bar, no more."),
    c("notes", NOTES_SAY),
    c("late", "Play the middle note on the 'and' of '2'.", 0),
    c("early", "Wait for the click on '4' for the last note."),
    c("openString", OPEN_LIFT),
    c("stringChange", STRING_AHEAD),
    c("lastBars", COUNT_THREES),
  ],
  "off-beats.sync-riff": [
    g("Count '1 and, (2) and, (3) and 4' out loud.", 0),
    c("heard", HEARD_ALL),
    c("extras", SILENT_SWING, 0),
    c("notes", NOTES_SAY),
    c("late", AND_LATE),
    c("early", AND_EARLY),
    c("afterHeld", HELD_AFTER),
    c("openString", OPEN_LIFT),
    c("stringChange", STRING_AHEAD),
    c("lastBars", "Hold the last note for the whole of '4'."),
  ],

  // Level 2, Step 6: the push
  "the-push.push-in-the-bar": [
    g("Let the pushed note ring through '3'.", 0),
    c("heard", HEARD_ALL),
    c("extras", "Miss the string on '3' while the note rings.", 0),
    c("notes", NOTES_SAY),
    c("late", "Play the push on the 'and', before '3'.", 0),
    c("early", "Wait for the click on '4' after the push."),
    c("openString", OPEN_LIFT),
    c("stringChange", STRING_AHEAD),
    c("lastBars", "Keep the finger down through the pushed note.", 2),
  ],
  "the-push.push-over-the-line": [
    g("Let the pushed note ring through the next '1'.", 2),
    c("heard", HEARD_ALL),
    c("extras", "Let the foot tap the '1' alone.", 0),
    c("late", "Play the push on the 'and' of '4'.", 0),
    c("early", "Wait for the click on '2' after the push."),
    c("openString", OPEN_LIFT),
    c("stringChange", STRING_AHEAD),
    c("lastBars", "Keep counting '2, 3, 4' after the push."),
  ],
  "the-push.two-pushes": [
    g("Count '4 AND, (1), 2 AND, (3), 4' out loud.", 0),
    c("heard", HEARD_ALL),
    c("extras", "Let the foot tap '1' and '3' alone.", 3),
    c("late", "Play both pushes as upstrokes, on the 'and'.", 3),
    c("early", PUSH_AFTER_EARLY),
    c("afterHeld", PUSH_COUNT),
    c("openString", OPEN_LIFT),
    c("stringChange", STRING_AHEAD),
    c("lastBars", "Hold the push through '3', then play '4'.", 2),
  ],
  "the-push.push-riff": [
    g("Keep the hand swinging in eighths throughout.", 4),
    c("heard", HEARD_ALL),
    c("extras", "Let each pushed note ring; don't pick it again.", 3),
    c("late", "Play each push on its 'and', not on the beat."),
    c("early", PUSH_AFTER_EARLY),
    c("afterHeld", PUSH_COUNT),
    c("openString", OPEN_LIFT),
    c("stringChange", STRING_AHEAD),
    c("lastBars", "Count '(1), 2 AND, (3), 4' in the last bar.", 0),
  ],

  // Level 2, Step 7: sixteenths
  "sixteenths.four-and-one": [
    g("Fit the four notes exactly into one click.", 1),
    c("heard", "Pick all four fast notes, down-up-down-up.", 0),
    c("extras", "Play four fast notes, then one long one."),
    c("notes", NOTES_SAY),
    c("late", "Put the first of each four on the click."),
    c("early", "Spread the four notes to fill the whole beat.", 1),
    c("afterHeld", LONG_BEAT),
    c("openString", OPEN_LIFT),
    c("stringChange", STRING_AHEAD),
  ],
  "sixteenths.long-short-short-16": [
    g("Count '1, and a' on every beat.", 0),
    c("heard", GALLOP_HEARD, 1),
    c("extras", "Miss the string on the 'e' each beat.", 0),
    c("notes", NOTES_SAY),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("openString", OPEN_LIFT),
    c("stringChange", STRING_AHEAD),
  ],
  "sixteenths.short-short-long": [
    g("Count '1 e and' on every beat.", 0),
    c("heard", "Pick both short notes, then the long one."),
    c("extras", "Miss the string on the 'a' each beat.", 0),
    c("notes", NOTES_SAY),
    c("late", "Put the first short note right on the click.", 1),
    c("early", "Wait for the click before each short pair.", 1),
    c("openString", OPEN_LIFT),
    c("stringChange", STRING_AHEAD),
  ],
  "sixteenths.sixteenth-riff": [
    g("Clap the rhythm once before you play it.", 0),
    c("heard", HEARD_ALL),
    c("extras", TOUCH_WRITTEN, 1),
    c("notes", NOTES_SAY),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("afterHeld", LONG_BEAT),
    c("openString", OPEN_LIFT),
    c("stringChange", STRING_AHEAD),
    c("lastBars", SWING_ON, 1),
  ],

  // Level 2, Step 8: triplets
  "triplets.triplets": [
    g(TRIPLETS, 0),
    c("heard", HEARD_ALL),
    c("extras", "Play three notes on each click, no more."),
    c("notes", NOTES_SAY),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("openString", OPEN_LIFT),
    c("stringChange", STRING_AHEAD),
  ],
  "triplets.two-and-three": [
    g("Switch between two and three on the click.", 0),
    c("heard", HEARD_ALL),
    c("extras", "Play just three notes in each triplet."),
    c("notes", NOTES_SAY),
    c("late", BEAT_LATE, 0),
    c("early", "Speed the hand up less for the triplets.", 1),
    c("openString", OPEN_LIFT),
    c("stringChange", STRING_AHEAD),
  ],
  "triplets.shuffle": [
    g("Down on the long note, up on the short one.", 1),
    c("heard", PAIR_BOTH),
    c("extras", TWICE, 0),
    c("notes", F24, 0),
    c("late", LONG_LATE),
    c("early", SHORT_LATE, 1),
    c("openString", OPEN_BOTH),
    c("stringChange", OPEN_CROSS),
    c("lastBars", LAST_BEAT),
  ],
  "triplets.triplet-tune": [
    g("Keep strictly down-up through the crossings.", 1),
    c("heard", FRET_BEHIND),
    c("extras", REST_QUIET),
    c("notes", FINGERS_578),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("afterHeld", "Count the rest out loud before the triplets.", 0),
    c("stringChange", "Keep the pick close as you cross."),
    c("lastBars", LAST_TWO_BEATS),
  ],
  "warmup-intermediate.gallop-up": [
    g("Count '1, and a, 2, and a' as you climb.", 0),
    c("heard", GALLOP_HEARD),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("afterHeld", LONG_BEAT),
    c("shift", SHIFT_BAR, 0),
    c("lastBars", LAND_FOUR),
  ],
  "warmup-intermediate.off-beat-walk": [
    g("Keep the foot on every click as you climb.", 0),
    c("heard", UP_CATCH),
    c("late", AND_LATE),
    c("early", AND_EARLY),
    c("shift", SHIFT_BAR, 0),
    c("lastBars", FOOT_LAST),
  ],

  // Level 3, Step 9: sixteenth syncopation
  "sixteenth-syncopation.one-e-a": [
    g("Count '1 e (and) a' and leave the gap open.", 1),
    c("heard", HEARD_ALL),
    c("extras", "Miss the string on each 'and'.", 0),
    c("notes", NOTES_SAY),
    c("late", BEAT_LATE),
    c("early", A_LATE, 1),
    c("afterHeld", LONG_BEAT),
    c("openString", OPEN_LIFT),
    c("stringChange", STRING_AHEAD),
  ],
  "sixteenth-syncopation.after-the-beat": [
    g("Let the foot land, then play right after it.", 1),
    c("heard", HEARD_ALL),
    c("extras", "Swing past the string on '2' and '4'.", 0),
    c("notes", NOTES_SAY),
    c("late", "Come in straight after the foot lands.", 1),
    c("early", "Wait for the click before each group."),
    c("afterHeld", "Let the long note fill its whole beat."),
    c("openString", OPEN_LIFT),
    c("stringChange", STRING_AHEAD),
  ],
  "sixteenth-syncopation.dotted-eighths": [
    g("Count the sixteenths in threes as you play.", 0),
    c("heard", HEARD_ALL),
    c("extras", "Play five notes in each bar, no more."),
    c("notes", NOTES_SAY),
    c("late", "Land the long note right on '4'.", 1),
    c("early", "Give each note three sixteenths, no less."),
    c("openString", OPEN_LIFT),
    c("stringChange", STRING_AHEAD),
    c("lastBars", COUNT_THREES),
  ],
  "sixteenth-syncopation.funk-line": [
    g("Learn it a beat at a time with the count.", 0),
    c("heard", FRET_BEHIND),
    c("extras", "Play only the written notes; leave the gaps."),
    c("notes", "Keep the first finger at fret five.", 0),
    c("late", "Put each note on its sixteenth, no later."),
    c("early", "Wait for each note's sixteenth; don't rush."),
    c("afterHeld", "Count through the gap, then come in."),
    c("stringChange", NEXT_FINGER_CROSS),
    c("lastBars", LAST_BEAT),
  ],

  // Level 3, Step 10: gear changes
  "gear-changes.gears": [
    g("Count '1 and, 2-trip-let, 3 e and a, 4'.", 0),
    c("heard", HEARD_ALL),
    c("extras", "Play two, three, then four notes, no more."),
    c("notes", NOTES_SAY),
    c("late", "Land the note on '4' right on the click.", 1),
    c("early", "Give each beat its full length."),
    c("afterHeld", LONG_BEAT),
    c("openString", OPEN_LIFT),
    c("stringChange", STRING_AHEAD),
  ],
  "gear-changes.pyramid": [
    g("Add one note a beat, then take one away.", 0),
    c("heard", HEARD_ALL),
    c("extras", "Play one, two, three, then four notes a beat.", 0),
    c("notes", NOTES_SAY),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("afterHeld", LONG_BEAT),
    c("openString", OPEN_LIFT),
    c("stringChange", STRING_AHEAD),
    c("lastBars", "Step down evenly: four, three, two, one.", 0),
  ],
  "gear-changes.three-over-two": [
    g("Count triplets and play every second syllable.", 0),
    c("heard", HEARD_ALL),
    c("extras", "Play just three notes over two beats."),
    c("notes", NOTES_SAY),
    c("late", "Make the three wide notes all the same length.", 1),
    c("early", "Give the third note its full length.", 1),
    c("openString", OPEN_LIFT),
    c("stringChange", STRING_AHEAD),
    c("lastBars", "Keep the foot tapping to the last note."),
  ],
  "gear-changes.gear-riff": [
    g("Aim the phrase at the long notes.", 1),
    c("heard", FRET_BEHIND),
    c("extras", "Keep the stroke small: just the strings in use."),
    c("notes", FINGERS_578),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("afterHeld", LONG_BEAT),
    c("stringChange", "Keep the pick close as you cross."),
    c("lastBars", LAND_LAST, 0),
  ],

  // Level 3, Step 11: two strings at once
  "two-strings-at-once.two-string-eighths": [
    g("Make the upstroke reach both strings.", 2),
    c("heard", CHORD_BOTH, 1),
    c("extras", CHORD_SMALL),
    c("late", "Put each chord's downstroke on the click."),
    c("early", "Wait for the click before each chord."),
    c("afterHeld", "Start the eighths right on the click.", 0),
    c("openString", CHORD_FINGER, 1),
    c("stringChange", CHORD_ACROSS),
    c("lastBars", LAST_CHORD),
  ],
  "two-strings-at-once.two-string-long-short": [
    g("Keep the strokes small in the fast bar.", 2),
    c("heard", CHORD_BOTH),
    c("extras", CHORD_SMALL, 2),
    c("late", "Put the first chord of each bar on the click."),
    c("early", "Wait for the click on the first fast chord.", 2),
    c("afterHeld", LONG_BEAT),
    c("openString", CHORD_FINGER),
    c("stringChange", CHORD_ACROSS),
    c("lastBars", "Count '1, and a' through the fast bar.", 1),
  ],
  "two-strings-at-once.two-string-syncopation": [
    g("Tap the foot on the silent beats.", 2),
    c("heard", CHORD_BOTH),
    c("extras", SILENT_SWING, 1),
    c("late", AND_LATE),
    c("early", AND_EARLY),
    c("afterHeld", LONG_BEAT),
    c("openString", CHORD_FINGER),
    c("stringChange", CHORD_ACROSS),
    c("lastBars", "Hold the last chord for all of '4'.", 0),
  ],
  "two-strings-at-once.two-chord-riff": [
    g("Hop the finger across just before the '1'.", 2),
    c("heard", CHORD_BOTH),
    c("extras", CHORD_SMALL),
    c("late", "Land each bar's first chord on the click."),
    c("early", "Let the long chord last its full length.", 2),
    c("afterHeld", "Count the long chord out, then hop.", 2),
    c("openString", CHORD_FINGER),
    c("stringChange", "Keep the hop small: one string across."),
    c("lastBars", LAST_CHORD, 0),
  ],

  // Level 3, Step 12: with the band
  "with-the-band.band-eighths": [
    g("Leave '2' and '3' to the drums.", 0),
    c("heard", HEARD_ALL),
    c("extras", SILENT_SWING),
    c("notes", "Start each bar on its chord's root note.", 1),
    c("late", WITH_BAND),
    c("early", BAND_EARLY),
    c("afterHeld", LONG_BEAT),
    c("openString", OPEN_LIFT),
    c("stringChange", STRING_AHEAD),
    c("lastBars", "Fill beat three, then hold the last note.", 0),
  ],
  "with-the-band.band-sixteenths": [
    g("Keep every note short; let the band fill in.", 1),
    c("heard", HEARD_ALL),
    c("extras", TOUCH_WRITTEN),
    c("notes", NOTES_SAY),
    c("late", WITH_BAND),
    c("early", BAND_EARLY),
    c("afterHeld", LONG_BEAT),
    c("openString", OPEN_LIFT),
    c("stringChange", STRING_AHEAD),
    c("lastBars", SWING_ON),
  ],
  "with-the-band.band-shuffle": [
    g("Swing your long-short with the hi-hat.", 1),
    c("heard", PAIR_BOTH),
    c("extras", TWICE),
    c("notes", F24),
    c("late", LONG_LATE),
    c("early", SHORT_LATE),
    c("openString", OPEN_BOTH),
    c("stringChange", OPEN_CROSS),
    c("lastBars", LAST_BEAT),
  ],
  "warmup-advanced.pyramid-up": [
    g("Count '1, 2 and, 3-trip-let, 4 e and a'.", 0),
    c("heard", HEARD_ALL),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("afterHeld", LONG_BEAT),
    c("shift", SHIFT_BAR, 0),
    c("lastBars", "Keep the sixteenths even to the last note."),
  ],
  "warmup-advanced.skip-up": [
    g("Count '1 e (and) a': down, up, miss, up.", 0),
    c("heard", HEARD_ALL),
    c("late", BEAT_LATE),
    c("early", A_LATE),
    c("afterHeld", LONG_BEAT),
    c("shift", SHIFT_BAR, 0),
    c("lastBars", LAND_FOUR),
  ],
};
