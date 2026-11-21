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
const STAB_BOTH = "Catch both strings with every stab.";
const STAB_EARLY = "Wait for the click before each stab.";
const ROOT_BEAT = "Count the root's full beat, then stab.";
const AND_HALFWAY = "Play each 'and' halfway between the clicks.";
const AND_WAIT = "Wait for the click, then stab on the 'and'.";
const ROOT_TO_STAB = "Move from the root to the stab on the 'and'.";
const LOW_FIRM = "Pick every low note as firmly as the stabs.";
const AND_24_ONLY = "Play only the 'and' of '2' and of '4'.";
const STAB_LATE24 = "Put the stabs right on the 'and' of '2' and '4'.";
const WAIT_AND2 = "Wait for the 'and' of '2' before the stab.";
const LOOK_STAB = "Look at the stab's strings during the rest.";
const D9_READY = "Have the D9 shape ready before '1'.";
const SNARE = "Put your stabs just after the snare.";
const SNARE_EARLY = "Let the snare sound before each stab.";
const F4_REACH = "Reach back to fret four for the F sharp.";
const SECOND_HALF = "Keep the second half as even as the first.";
const OCT_BOTH = "Strike both strings of every octave.";
const CROSS3 = "Keep the stroke small across the three strings.";
const E_24_ONLY = "Play only the 'e' of '2' and of '4'.";
const TWO_WAIT = "Wait out '2' before its 'e'.";
const SHAPE_OVER = "Keep the shape as it moves a string over.";
const PAIR_HEARD = "Pick both notes of every figure.";
const THIRD_SILENT = "Leave the third sixteenth of each figure silent.";
const LAST_FIGURE = "Start the last figure right on '4'.";
const SECOND_FIGURE = "Wait for the 'a' of '1' for the second figure.";
const COUNT_OFF_E = "Count '1 e (and) a, 2 (e) and (a)' aloud.";
const THREE_SILENT = "Leave '3' itself silent.";
const ON_124 = "Put '1', '2' and '4' right on the click.";
const LOW_A_LAND = "Land the held low A on '4'.";
const F_SHARP = "Play F sharp at the D string's fret four.";
const STRIKE_ALL = "Strike every attack: notes, stabs, octaves.";
const REST_QUIET = "Keep the pick off the strings in the rests.";
const EACH_ONE = "Put each '1' right on the click.";
const SAME_ROUND = "Play every round the same, holes and all.";
const ROUND_HEARD = "Pick every note of every round.";
const HIHAT = "Lock back onto the hi-hat, round after round.";
const CROSS_A3 = "Cross to the A string on '3' every round.";
const WHOLE_MINUTE = "Start at a tempo you can hold a whole minute.";
const FIRST_OCTAVE_WAIT = "Wait for '1' before the first octave.";

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

  // Level 2 (Intermediate), Step 6: stabs
  "stabs.stab-backbeat": [
    g("Low A on '1' and '3', stab on '2' and '4'.", 0),
    c("heard", STAB_BOTH),
    c("extras", "Leave the 'and' after each stab silent."),
    c("late", "Put each stab right on '2' and '4'."),
    c("early", STAB_EARLY),
    c("afterHeld", ROOT_BEAT),
    c("stringChange", "Jump from the low A to the stab in one move."),
  ],
  "stabs.stab-offbeat": [
    g("Count '1 and, (2) and': stab on every 'and'.", 0),
    c("heard", STAB_BOTH),
    c("extras", NO_234),
    c("late", AND_HALFWAY),
    c("early", AND_WAIT),
    c("stringChange", ROOT_TO_STAB),
  ],
  "stabs.stab-sixteenths": [
    g("Learn it a beat at a time with the count.", 0),
    c("heard", "Catch both strings on the upstroke stabs too.", 1),
    c("extras", "Strike the strings only where a stab is written."),
    c("late", "Put the stab on '4' right on the click."),
    c("early", "Wait out each rest before the next stab."),
    c("stringChange", "Move to the stab right after the low A."),
  ],

  // Step 7: a line and a stab
  "line-and-stab.call-and-stab": [
    g("Count '1 (e) and a', then stab on the 'and'.", 0),
    c("heard", LOW_FIRM),
    c("extras", AND_24_ONLY),
    c("late", STAB_LATE24),
    c("early", WAIT_AND2),
    c("stringChange", LOOK_STAB),
  ],
  "line-and-stab.am-to-d": [
    g("Ready the next chord's fingers in the long rest.", 1),
    c("heard", STAB_BOTH),
    c("extras", "Leave '3' and '4' silent; stab on the 'and'."),
    c("late", "Put each root right on '1'."),
    c("early", "Wait out the long rest before the last stab."),
    c("stringChange", ROOT_TO_STAB),
    c("lastBars", D9_READY, 1),
  ],
  "line-and-stab.vamp": [
    g(SNARE, 1),
    c("heard", LOW_FIRM),
    c("extras", AND_24_ONLY),
    c("late", STAB_LATE24),
    c("early", SNARE_EARLY),
    c("shift", F4_REACH, 0),
    c("stringChange", LOOK_STAB),
    c("lastBars", D9_READY),
  ],

  // Step 8: the second pair
  "second-pair.bm-stabs": [
    g("Stab on '2' and '4', then on every 'and'.", 0),
    c("heard", STAB_BOTH),
    c("extras", "Leave the 'and' after each backbeat stab silent."),
    c("late", "Put each root right on the click."),
    c("early", STAB_EARLY),
    c("afterHeld", ROOT_BEAT),
    c("stringChange", "Play both roots with the first finger.", 2),
    c("lastBars", "Count '1 and, (2) and' to the last stab."),
  ],
  "second-pair.bm-line-stab": [
    g("Play the beat, 'and' and 'a' on '1' and '3'.", 0),
    c("heard", LOW_FIRM),
    c("extras", AND_24_ONLY),
    c("late", STAB_LATE24),
    c("early", WAIT_AND2),
    c("stringChange", LOOK_STAB),
  ],
  "second-pair.e9-line-stab": [
    g("Reach back one fret for the G sharp.", 1),
    c("heard", LOW_FIRM),
    c("extras", AND_24_ONLY),
    c("late", STAB_LATE24),
    c("early", WAIT_AND2),
    c("stringChange", "Cross to the D string a fret lower."),
  ],
  "second-pair.bm-vamp": [
    g(SNARE, 2),
    c("heard", LOW_FIRM),
    c("extras", AND_24_ONLY),
    c("late", STAB_LATE24),
    c("early", SNARE_EARLY),
    c("stringChange", LOOK_STAB),
    c("lastBars", SECOND_HALF),
  ],

  // Step 9: octaves
  "octaves.octave-eighths": [
    g("Keep the fingers' spacing as the shape slides.", 0),
    c("heard", OCT_BOTH),
    c("extras", "Leave '2' and '3' silent; play their 'and'."),
    c("late", "Put the octave on '1' right on the click."),
    c("early", "Wait out '2' and '3' in full."),
    c("afterHeld", "Count the held octave's beat, then start again."),
    c("shift", "Slide up three frets on the 'and' of '3'."),
    c("stringChange", CROSS3),
    c("lastBars", "Slide back down for the held A on '4'.", 1),
  ],
  "octaves.octave-sixteenths": [
    g("Squeeze for each octave, relax for each rest.", 1),
    c("heard", OCT_BOTH),
    c("extras", E_24_ONLY),
    c("late", ONE_THREE),
    c("early", TWO_WAIT),
    c("stringChange", CROSS3, 0),
  ],
  "octaves.octave-line": [
    g("Move the shape in the rests after each 'e'.", 1),
    c("heard", OCT_BOTH),
    c("extras", E_24_ONLY),
    c("late", ONE_THREE),
    c("early", TWO_WAIT),
    c("shift", "Move two frets in the rest before '1' and '3'.", 1),
    c("stringChange", SHAPE_OVER, 0),
    c("lastBars", SECOND_HALF),
  ],
  "warmup-intermediate.hole-up": [
    g(WELL_UNDER, 0),
    c("heard", A_HEARD),
    c("late", BEAT_LATE),
    c("early", A_LATE),
    c("shift", ARRIVE),
    c("lastBars", "Keep counting '1 e (and) a' to the top note."),
  ],

  // Level 3 (Advanced), Step 10: displaced
  "displaced.threes": [
    g("Count '1 e and a' out loud as the figure slides.", 0),
    c("heard", PAIR_HEARD),
    c("extras", THIRD_SILENT),
    c("notes", "Play A then G, fret seven then five."),
    c("late", LAST_FIGURE, 1),
    c("early", SECOND_FIGURE, 0),
  ],
  "displaced.off-the-e": [
    g(COUNT_OFF_E, 0),
    c("heard", "Pick every note on the 'e' and the 'a'."),
    c("extras", THREE_SILENT),
    c("notes", "Play G at fret five on '2' and on '4'."),
    c("late", ON_124),
    c("early", THREE_WAIT),
    c("stringChange", "Cross from the low A to the D string on 'e'."),
  ],
  "displaced.long-phrase": [
    g("Sing the rhythm once before you play it.", 0),
    c("heard", "Pick every short note up to the held A."),
    c("extras", "Play only the written sixteenths, no more."),
    c("notes", C_LOW_E),
    c("late", ONE_THREE),
    c("early", WAIT_REST),
    c("afterHeld", LOW_A_AGAIN),
    c("stringChange", LOOK_NEXT),
    c("lastBars", LOW_A_LAND, 1),
  ],

  // Step 11: displaced shapes
  "displaced-shapes.stab-threes": [
    g("Keep the foot on the beat as the stabs slide.", 0),
    c("heard", STAB_BOTH),
    c("extras", THIRD_SILENT),
    c("late", LAST_FIGURE),
    c("early", SECOND_FIGURE),
    c("stringChange", "Keep the stroke small: just the two strings.", 2),
  ],
  "displaced-shapes.octave-off-the-e": [
    g(COUNT_OFF_E, 0),
    c("heard", OCT_BOTH),
    c("extras", THREE_SILENT),
    c("late", ON_124),
    c("early", THREE_WAIT),
    c("stringChange", CROSS3, 2),
  ],
  "displaced-shapes.slide-and-stab": [
    g("Keep the first finger flat across fret five.", 2),
    c("heard", "Pick every note as firmly as the stabs."),
    c("extras", THIRD_SILENT),
    c("late", "Put the two stabs right on '4' and its 'e'.", 0),
    c("early", WAIT_REST),
    c("afterHeld", LOW_A_AGAIN),
    c("stringChange", "Let the swing carry past the low E string.", 3),
    c("lastBars", LOW_A_LAND, 1),
  ],

  // Step 12: the sixth
  "the-sixth.sixth": [
    g(F_SHARP, 0),
    c("heard", "Pick every note of the answer."),
    c("extras", SILENT_2),
    c("notes", "Play D on the A string at fret five.", 0),
    c("late", ONE_THREE),
    c("early", WAIT_REST),
    c("shift", "Move back one fret as the answer starts.", 1),
    c("stringChange", LOOK_NEXT),
    c("lastBars", "Keep the answer as even as the first line."),
  ],
  "the-sixth.hammered": [
    g("Pick fret five, hammer seven: two even notes.", 0),
    c("heard", "Hammer hard enough to hear the note."),
    c("extras", "Leave the sixteenth after each hammer silent."),
    c("notes", "Hammer with the third finger at fret seven.", 0),
    c("late", "Put each picked note right where you count it."),
    c("early", WAIT_REST),
    c("stringChange", "Cross to the A string on '3'."),
  ],
  "the-sixth.two-chord-line": [
    g("Play F sharp over D9, the box over Am7.", 0),
    c("heard", "Pick every note through to the held D."),
    c("extras", "Leave the rests between notes silent."),
    c("notes", "Play D at the A string's fret five for D9."),
    c("late", ONE_THREE),
    c("early", WAIT_REST),
    c("afterHeld", "Count the held D's beat, then start again."),
    c("shift", "Shift one fret as each new chord starts."),
    c("stringChange", LOOK_NEXT),
    c("lastBars", "Land the held D on '4' and let it ring."),
  ],

  // Step 13: the pocket
  "the-pocket.groove": [
    g("Change part on '1' without a gap in the count."),
    c("heard", STRIKE_ALL),
    c("extras", REST_QUIET),
    c("late", EACH_ONE),
    c("early", WAIT_REST),
    c("shift", F4_REACH, 0),
    c("stringChange", LOOK_NEXT, 1),
    c("lastBars", "Walk up D, E, F sharp, G in even eighths."),
  ],
  "the-pocket.pocket-minute": [
    g(SAME_ROUND, 0),
    c("heard", ROUND_HEARD),
    c("late", HIHAT, 1),
    c("early", "Wait out each rest in full, every round."),
    c("stringChange", CROSS_A3),
    c("lastBars", WHOLE_MINUTE),
  ],
  "the-pocket.stab-minute": [
    g("Keep every stab the same length.", 0),
    c("heard", STAB_BOTH),
    c("late", AND_HALFWAY),
    c("early", AND_WAIT),
    c("stringChange", ROOT_TO_STAB),
    c("lastBars", WHOLE_MINUTE),
  ],

  // Step 14: the long form
  "long-form.bm-octaves": [
    g("Change octave in the two rests after each 'e'.", 1),
    c("heard", OCT_BOTH),
    c("extras", REST_QUIET),
    c("late", ONE_THREE),
    c("early", TWO_WAIT),
    c("stringChange", SHAPE_OVER, 0),
    c("lastBars", "Walk down F sharp, E, D, C sharp in eighths.", 2),
  ],
  "long-form.the-change": [
    g("Look at the low E string during the last stab.", 2),
    c("heard", STRIKE_ALL),
    c("extras", REST_QUIET),
    c("late", "Put the first octave right on '1'."),
    c("early", FIRST_OCTAVE_WAIT),
    c("stringChange", "Hop the third finger to the D string, same fret.", 1),
    c("lastBars", SECOND_HALF),
  ],
  "long-form.eight-bars": [
    g("Count four of stabs, then four of octaves.", 3),
    c("heard", STRIKE_ALL),
    c("extras", REST_QUIET),
    c("late", EACH_ONE),
    c("early", FIRST_OCTAVE_WAIT, 2),
    c("stringChange", LOOK_NEXT),
    c("lastBars", "Walk down to the start in even eighths."),
  ],
  "long-form.bm-pocket-minute": [
    g(SAME_ROUND, 0),
    c("heard", ROUND_HEARD),
    c("late", HIHAT),
    c("early", SNARE_EARLY, 1),
    c("stringChange", CROSS_A3),
    c("lastBars", WHOLE_MINUTE),
  ],
  "warmup-advanced.threes-up": [
    g(WELL_UNDER, 0),
    c("heard", PAIR_HEARD),
    c("late", LAST_FIGURE),
    c("early", SECOND_FIGURE),
    c("shift", ARRIVE),
    c("lastBars", "Keep the foot on the beat to the top note."),
  ],
};
