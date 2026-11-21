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
const ONE_STRING = "Keep the pick on the one string only.";
const FRETTED_READY = "Have the fretted notes ready before they come.";
const LIFT_FOR_FRETTED = "Lift the palm for the fretted notes only.";
const TWO_NOT_ONE = "Pick both short notes as two, not one.";
const SHORTS_AFTER_CHORD = "Pick both short notes right after each chord.";
const SHORTS_GALLOP = "Pick both short notes of every gallop.";
const LONG_LATE = "Put every long note right on the click.";
const LONG_EARLY = "Wait for the click before each long note.";
const FIRST_SHORT_LATE = "Put the first short note right on the click.";
const FIRST_SHORT_EARLY = "Wait for the click before each short pair.";
const ACCENT_LATE = "Land each accent right on its count.";
const ACCENT_EARLY = "Wait for the count before each accent.";
const QUIET_HEARD = "Play every quiet note, just lighter.";
const HOLD_G = "Hold the last G its full beat, then gallop.";
const BB_A_G = "Put B flat on '3', A on its 'and', G on '4'.";
const GALLOP_SAY = "Say '1, and a, 2 e and' before you start.";
const FIVE_FRETS = "Move the hand five frets as each bar starts.";
const OFF_IN_RESTS = "Keep the pick off the string on each rest.";
const SILENCE_CHORD = "Silence each chord with both hands on its rest.";
const CLICK_ACCENT_LATE = "Put each accent right on the click.";
const CLICK_ACCENT_EARLY = "Wait for the click before each accent.";
const FINGERS_7910 = "Fingers one, three, four on frets 7, 9 and 10.";
const MELODY_LATE = "Put each melody note right on its count.";
const MELODY_EARLY = "Wait for the count before each melody note.";
const OPEN_E_FIRM = "Pick each open E as firmly as the melody.";
const OPEN_A_FIRM = "Pick each open A as firmly as the melody.";
const CROSS_ALTERNATE = "Keep the strokes alternating at every crossing.";
const SKIP_SMALL = "Make the skip smaller, not faster.";
const LAST_TWOS = "Count the last beat in twos: melody, pedal.";
const IN_USE = "Keep the pick on the strings in use.";
const OFF_SKIPPED = "Keep the pick off the string you skip.";
const LOW_TWO = "Keep the pick on the two low strings only.";
const OPEN_FIRM = "Pick each open note as firmly as the melody.";
const COUNT_4AND = "Count '4 and' on the two fretted notes.";
const MOVE_LAST_EIGHTH = "Move on the last eighth; chord on the click.";
const CUT_LAST_EIGHTH = "Cut the last eighth short and move on it.";
const LONG_TWO = "Count the long chord's two beats, then play.";
const C_D_ON_A = "Begin C and D on the A string.";
const CROSS_ON_COUNT = "Cross to the A string right on its count.";
const EVERY_ATTACK = "Strike every gallop note and every chord.";
const PART_STRINGS = "Keep the pick on the strings each part uses.";
const CHANGE_EARLY = "Wait for the band's beat one at each change.";
const SIXTEENTHS_END = "Count '1 e and a' right to the last note.";
const TRIPLETS_END = "Count '1-trip-let' right to the last note.";

export const METAL_RHYTHM_CUES: CueBook = {
  // ---------------------------------------------------------------- Level 1
  // Step 1: the chug
  "the-chug.open-chug": [
    g("Down on every eighth, two to the click.", 0),
    c("heard", SAME_STROKE),
    c("extras", ONE_STRING),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("openString", FRETTED_READY),
    c("lastBars", COUNT_4AND, 0),
  ],
  "the-chug.chug-and-note": [
    g(LIFT_FOR_FRETTED, 0),
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
    c("heard", QUIET_HEARD),
    c("extras", LOW_E_ONLY),
    c("late", ACCENT_LATE),
    c("early", ACCENT_EARLY),
    c("openString", "Keep the quiet open Es even with each other."),
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
    c("extras", SILENCE_CHORD, 0),
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
    c("shift", FIVE_FRETS),
    c("lastBars", EVEN_TO_END),
  ],

  // ---------------------------------------------------------------- Level 2
  // Step 5: the gallop (gallop-one changes string between Takes)
  "gallop.gallop-one": [
    g("Count '1, and a': the long note on the click.", 0),
    c("heard", TWO_NOT_ONE, 1),
    c("extras", ONE_STRING),
    c("late", LONG_LATE, 0),
    c("early", LONG_EARLY),
    c("openString", "Say 'and a' on the short notes out loud."),
    c("lastBars", "Move to frets 3 and 5 for the last two gallops."),
  ],
  "gallop.gallop-chords": [
    g("Strike the chord as the gallop's long note.", 0),
    c("heard", SHORTS_AFTER_CHORD, 0),
    c("extras", JUST_TWO),
    c("late", CHORD_COUNT_LATE),
    c("early", CHORD_COUNT_EARLY),
    c("openString", "Keep the gallop going while the hand moves."),
    c("stringChange", TWO_ONE),
    c("lastBars", "Land A on beat three, then gallop on."),
  ],
  "gallop.gallop-riff": [
    g("Keep the sixteenths going through the eighths.", 1),
    c("heard", "Pick frets 3 and 5 as firmly as the gallops."),
    c("extras", LOW_E_ONLY),
    c("notes", FINGERS_356, 0),
    c("late", "Put the gallop after the eighths on beat four.", 1),
    c("early", "Wait for beat four before the next gallop."),
    c("afterHeld", HOLD_G),
    c("openString", FRETTED_READY),
    c("lastBars", BB_A_G),
  ],

  // Step 6: the reverse gallop (reverse-one changes string between Takes)
  "reverse-gallop.reverse-one": [
    g("Count '1 e and': two short, then the long.", 0),
    c("heard", TWO_NOT_ONE),
    c("extras", ONE_STRING),
    c("late", FIRST_SHORT_LATE),
    c("early", FIRST_SHORT_EARLY),
    c("openString", "Give each beat's first note a little weight.", 1),
    c("lastBars", "Move to frets 3 and 5 for the last two beats."),
  ],
  "reverse-gallop.four-two": [
    g("Count '1 e and a, 2 and' out loud as you play."),
    c("heard", "Pick all four sixteenths, every one clear."),
    c("extras", LOW_E_ONLY),
    c("notes", FINGERS_356),
    c("late", BEAT_LATE),
    c("early", "Hold the eighths back to half the speed.", 1),
    c("openString", "Keep the four open sixteenths even."),
    c("lastBars", "Put B flat on '4' and A on its 'and'."),
  ],
  "reverse-gallop.both-gallops": [
    g(GALLOP_SAY, 0),
    c("heard", TWO_NOT_ONE),
    c("extras", LOW_E_ONLY),
    c("notes", "Say G, A, then B flat, A, G as you fret them."),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("afterHeld", HOLD_G),
    c("openString", "Keep the hand swinging in sixteenths throughout.", 1),
    c("lastBars", BB_A_G),
  ],

  // Step 7: the sixteenth chug (straight-sixteenths changes string between Takes)
  "sixteenth-chug.straight-sixteenths": [
    g("Down-up-down-up, four notes to every click.", 0),
    c("heard", "Pick all four notes of every beat."),
    c("extras", ONE_STRING),
    c("late", CLICK_ACCENT_LATE),
    c("early", CLICK_ACCENT_EARLY),
    c("openString", "Accent just the first of each four.", 0),
    c("lastBars", SIXTEENTHS_END),
  ],
  "sixteenth-chug.accent-threes": [
    g("Count the sixteenths in threes as you play.", 0),
    c("heard", QUIET_HEARD),
    c("extras", LOW_E_ONLY),
    c("late", ACCENT_LATE),
    c("early", ACCENT_EARLY),
    c("openString", "Tap your foot on the beat under the accents.", 1),
  ],
  "sixteenth-chug.sixteenth-riff": [
    g(LIFT_FOR_FRETTED, 0),
    c("heard", FRETTED_FIRM),
    c("extras", LOW_E_ONLY),
    c("notes", FINGERS_356, 0),
    c("late", FRETTED_LATE),
    c("early", FRETTED_EARLY),
    c("openString", "Keep the picking going between fretted notes.", 1),
    c("lastBars", "Count '4 e and a' for the last four notes."),
  ],

  // Step 8: gallop changes (the first three change string between Takes)
  "gallop-changes.gallop-bar-changes": [
    g(MOVE_LAST_EIGHTH, 2),
    c("heard", SHORTS_AFTER_CHORD),
    c("extras", JUST_TWO),
    c("late", "Land each new chord right on beat one."),
    c("early", "Wait for beat one before each new chord."),
    c("openString", "Gallop on the open string right to beat four."),
    c("shift", "Lift the hand off as the last eighth starts.", 2),
    c("stringChange", TWO_ONE),
    c("lastBars", "Come back to the open chord right on the click."),
  ],
  "gallop-changes.reverse-bar-changes": [
    g("Count '1 e and, 2 e and': chord on two and four.", 0),
    c("heard", "Pick both short notes at the start of each beat."),
    c("extras", JUST_TWO),
    c("late", "Put each new root's first note on the click."),
    c("early", "Wait for the click to start each new root."),
    c("openString", "Count '1 e and' on every open-string beat."),
    c("shift", "Move on the chord, so the new root is on time.", 2),
    c("stringChange", TWO_ONE),
    c("lastBars", "Cut the last chord a little short to go round.", 2),
  ],
  "gallop-changes.two-beat-changes": [
    g(GALLOP_SAY, 0),
    c("heard", SHORTS_GALLOP),
    c("extras", JUST_TWO),
    c("late", CHORD_COUNT_LATE),
    c("early", CHORD_COUNT_EARLY),
    c("openString", "Let go of the high chord early to go round.", 2),
    c("shift", "Move on the eighth before each chord.", 1),
    c("stringChange", TWO_ONE),
    c("lastBars", "Count '3, and a, 4 e and' to the end."),
  ],
  "gallop-changes.band-changes": [
    g("Land each chord with the kick on one and three.", 3),
    c("heard", SHORTS_AFTER_CHORD),
    c("extras", JUST_TWO),
    c("late", "Land each new chord with the band's beat one."),
    c("early", "Wait for the beat before each chord."),
    c("afterHeld", "Cut the held C a little short to go round.", 4),
    c("openString", "Drop to E with the first finger only.", 4),
    c("shift", "Move to the next root as beat four ends."),
    c("stringChange", TWO_ONE),
    c("lastBars", "If you get lost, come back in on beat one.", 5),
  ],

  // Warm-ups, Level 2 (a new key and string each Take: name nothing)
  "warmup-intermediate.root-gallop": [
    g(WELL_UNDER, 0),
    c("heard", SHORTS_GALLOP),
    c("late", LONG_LATE),
    c("early", LONG_EARLY),
    c("shift", FIVE_FRETS),
    c("lastBars", "Keep '1, and a' even right to the last note."),
  ],
  "warmup-intermediate.root-reverse": [
    g(WELL_UNDER, 0),
    c("heard", TWO_NOT_ONE),
    c("late", FIRST_SHORT_LATE, 0),
    c("early", FIRST_SHORT_EARLY),
    c("shift", FIVE_FRETS),
    c("lastBars", "Keep '1 e and' even right to the last note."),
  ],

  // ---------------------------------------------------------------- Level 3
  // Step 9: stop and start (chug-rest changes string between Takes)
  "stop-start.chug-rest": [
    g("Count '1 2 3' in sixteenths; play on 1 and 2.", 0),
    c("heard", "Pick every chug of every group."),
    c("extras", OFF_IN_RESTS),
    c("late", "Put each group's first chug on its count."),
    c("early", "Wait out each rest before the next chug."),
    c("openString", "Keep the hand swinging down-up through rests.", 1),
    c("lastBars", "Put the two fretted eighths on '4 and'.", 0),
  ],
  "stop-start.chord-and-burst": [
    g("Start the chugs after each hole on the beat.", 1),
    c("heard", "Pick all four chugs of every burst."),
    c("extras", SILENCE_CHORD, 1),
    c("late", "Land each off-beat chord on its 'and'."),
    c("early", "Wait for beat two before the four chugs.", 1),
    c("openString", "Count the rest after the first chord in full."),
    c("stringChange", TWO_ONE),
    c("lastBars", STOP_LAST_G),
  ],
  "stop-start.gallop-holes": [
    g("Say '1, and a, (2) e and, 3, a, 4' first.", 0),
    c("heard", "Pick the single chug before beat four.", 0),
    c("extras", OFF_IN_RESTS),
    c("notes", "One finger per fret on frets 3, 5 and 6.", 1),
    c("late", "Put each note after a rest on its count."),
    c("early", "Wait out each rest in full before playing."),
    c("openString", "Put the single chug right on the 'a'.", 0),
    c("lastBars", "Put A on '4' and G on its 'and' to end."),
  ],

  // Step 10: triplets and bursts (triplet-chug changes string between Takes)
  "triplets-and-bursts.triplet-chug": [
    g("Count '1-trip-let, 2-trip-let' as you play.", 0),
    c("heard", "Pick all three notes of every beat."),
    c("extras", ONE_STRING),
    c("late", CLICK_ACCENT_LATE),
    c("early", CLICK_ACCENT_EARLY),
    c("openString", "Accent beats two and four just as strongly.", 1),
    c("lastBars", TRIPLETS_END),
  ],
  "triplets-and-bursts.sextuplet-burst": [
    g("Six notes to the click, then the chord.", 0),
    c("heard", "Pick all six notes of every burst."),
    c("extras", JUST_TWO),
    c("late", CHORD_COUNT_LATE),
    c("early", "Fill the whole beat with six before the chord."),
    c("afterHeld", "Set the next chord while this one rings.", 1),
    c("openString", "Start each burst right on the click."),
    c("stringChange", TWO_ONE),
    c("lastBars", "Hold the last chord its full beat, then burst."),
  ],
  "triplets-and-bursts.tremolo": [
    g("Change note exactly on the beat.", 1),
    c("heard", "Pick every note four times, right through."),
    c("extras", "Keep the pick on the A string only."),
    c("notes", "Fingers one, three, four first: frets 7, 9, 10.", 0),
    c("late", "Put each new note right on the click."),
    c("early", "Wait for the click before each new note."),
    c("shift", "Move up two frets: first finger on fret 9.", 0),
    c("lastBars", "Count '1 e and a' on every note to the end."),
  ],

  // Step 11: pedal riffs
  "pedal-riffs.pedal-a": [
    g("Play one melody note, then two open Es.", 0),
    c("heard", OPEN_E_FIRM),
    c("extras", LOW_TWO),
    c("notes", FINGERS_7910, 0),
    c("late", MELODY_LATE),
    c("early", MELODY_EARLY),
    c("openString", "Keep the open Es even between melody notes."),
    c("stringChange", CROSS_ALTERNATE, 1),
    c("lastBars", LAST_TWOS),
  ],
  "pedal-riffs.pedal-skip": [
    g("Rest a spare finger on the string you skip.", 0),
    c("heard", OPEN_E_FIRM),
    c("extras", OFF_SKIPPED),
    c("notes", FINGERS_7910, 0),
    c("late", MELODY_LATE),
    c("early", MELODY_EARLY),
    c("openString", "Slow down until the open Es are even.", 1),
    c("stringChange", SKIP_SMALL),
    c("lastBars", LAST_TWOS),
  ],
  "pedal-riffs.pedal-both": [
    g("Lay one finger flat over each climbing pair.", 1),
    c("heard", OPEN_E_FIRM),
    c("extras", "Pick one string at a time under the flat finger.", 1),
    c("notes", "Start the way down on the D string's fret 9.", 0),
    c("late", MELODY_LATE),
    c("early", MELODY_EARLY),
    c("openString", "Keep the open Es even through every skip."),
    c("stringChange", SKIP_SMALL),
    c("lastBars", "End on both 7s: the A string, then the D string.", 0),
  ],

  // Step 12: the pedal from the A string
  "pedal-from-a.a-pedal-d": [
    g("Keep the fingers arched, clear of the A string.", 1),
    c("heard", OPEN_A_FIRM),
    c("extras", IN_USE, 2),
    c("notes", FINGERS_7910, 1),
    c("late", MELODY_LATE),
    c("early", MELODY_EARLY),
    c("openString", "Keep the open As even between melody notes."),
    c("stringChange", CROSS_ALTERNATE),
    c("lastBars", LAST_TWOS),
  ],
  "pedal-from-a.a-pedal-g": [
    g("Lean the fingertip on the string you skip.", 2),
    c("heard", OPEN_A_FIRM),
    c("extras", OFF_SKIPPED),
    c("notes", FINGERS_7910),
    c("late", MELODY_LATE),
    c("early", MELODY_EARLY),
    c("openString", "Slow down until the open As are even.", 1),
    c("stringChange", SKIP_SMALL),
    c("lastBars", LAST_TWOS),
  ],
  "pedal-from-a.a-pedal-both": [
    g("Count three, three, three, three, two and two.", 0),
    c("heard", OPEN_A_FIRM),
    c("extras", IN_USE),
    c("notes", "Say A, B, C, D, E as you climb."),
    c("late", MELODY_LATE),
    c("early", MELODY_EARLY),
    c("openString", "Keep the open As even through both skips.", 2),
    c("stringChange", "Skip the D string both ways, evenly.", 2),
    c("lastBars", "Come down frets 10, 9, 7 on each string.", 1),
  ],
  "pedal-from-a.pedal-a-to-e": [
    g("Keep the hand still: one finger per fret.", 3),
    c("heard", "Pick every pedal note as firmly as the melody."),
    c("extras", "Keep the pick on the pedal and melody strings."),
    c("notes", FINGERS_7910, 3),
    c("late", MELODY_LATE),
    c("early", MELODY_EARLY),
    c("openString", "Keep the open pedal even across the change."),
    c("stringChange", "Drop the pedal to the low E at the change.", 4),
    c("lastBars", "Go back to the open A right on beat one."),
  ],

  // Step 13: a riff in two parts (all three change string between Takes)
  "two-part-riff.pedal-part": [
    g("Count the groups: three, three, two, twice.", 0),
    c("heard", OPEN_FIRM),
    c("extras", IN_USE),
    c("notes", FINGERS_7910, 1),
    c("late", MELODY_LATE),
    c("early", MELODY_EARLY),
    c("openString", "Count the last four open notes as one beat.", 3),
    c("stringChange", "Lay the first finger flat where fret 7 repeats.", 2),
    c("lastBars", "Walk down frets 10, 9, 7 to the open notes.", 3),
  ],
  "two-part-riff.gallop-part": [
    g("Count '1, and a, 2, and a', chord on the 1.", 0),
    c("heard", SHORTS_AFTER_CHORD),
    c("extras", JUST_TWO),
    c("late", CHORD_COUNT_LATE),
    c("early", CHORD_COUNT_EARLY),
    c("openString", "Move the fretting hand while the gallops play.", 1),
    c("stringChange", "Begin each stroke on the chord's own root.", 2),
    c("lastBars", "Land the last chord on beat three, then gallop."),
  ],
  "two-part-riff.two-parts-joined": [
    g("Hold the gallop part at the pedal part's tempo.", 3),
    c("heard", OPEN_FIRM),
    c("extras", IN_USE),
    c("late", "Land the first note of each part on the click."),
    c("early", "Wait for the click before each new part."),
    c("openString", "Move the hand down during the four open notes.", 1),
    c("stringChange", "Move up during the last gallop to fret 7.", 2),
    c("lastBars", "Land the last gallop's long note on beat four."),
  ],

  // Step 14: riffs at length (the two minutes change string between Takes)
  "riffs-at-length.band-riff": [
    g("Keep the gallop going through the answers."),
    c("heard", SHORTS_GALLOP),
    c("extras", LOW_TWO),
    c("notes", "Play frets 3 and 5, then 5, 6, 5 as answers.", 0),
    c("late", "Put each gallop's long note with the kick.", 1),
    c("early", "Wait for the kick before each long note.", 1),
    c("afterHeld", "Count the last open A's beat, then gallop."),
    c("openString", "Have the answer's fret ready during the gallop."),
    c("stringChange", "Move to the A string for the last gallops.", 0),
    c("lastBars", "Put frets 3 and 5 on '3 and', then the open A."),
  ],
  "riffs-at-length.down-minute": [
    g("Down on every eighth, for the whole minute.", 0),
    c("heard", SAME_STROKE),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("openString", COUNT_4AND, 0),
    c("lastBars", "Make the stroke smaller before you slow down.", 1),
  ],
  "riffs-at-length.gallop-minute": [
    g("Down, down-up without a break, all minute.", 0),
    c("heard", TWO_NOT_ONE, 0),
    c("late", LONG_LATE),
    c("early", LONG_EARLY),
    c("openString", "Move to the fretted gallop on beat four."),
    c("lastBars", "Count 'and a' on the short notes to the end."),
  ],

  // Step 15: verse and chorus
  "verse-and-chorus.verse-riff": [
    g("Count '1, and a, 2, and a, 3 and, 4, and a'.", 0),
    c("heard", "Pick each answer note as firmly as the gallop."),
    c("extras", LOW_TWO),
    c("notes", "Fingers one, two, four on frets 2, 3 and 5.", 1),
    c("late", "Put each answer note right on its count."),
    c("early", "Wait for the count before each answer note."),
    c("openString", "Keep the first finger over fret 2 throughout.", 1),
    c("stringChange", "Cross to the A string for each answer and back."),
    c("lastBars", "Run down frets 5, 3, 2, then 3 on the low E.", 2),
  ],
  "verse-and-chorus.chorus-riff": [
    g("Count '1, 2, 3, 4 and': play on 1, 3, 4, 'and'.", 0),
    c("heard", BOTH_STRINGS),
    c("extras", JUST_TWO, 0),
    c("late", MOVE_LAST_EIGHTH, 3),
    c("early", NEW_CHORD_EARLY),
    c("afterHeld", LONG_TWO),
    c("openString", "Fret E with the first finger alone.", 2),
    c("shift", CUT_LAST_EIGHTH, 3),
    c("stringChange", C_D_ON_A, 4),
    c("lastBars", "Go round to E right on the click."),
  ],
  "verse-and-chorus.verse-into-chorus": [
    g("Lift the palm and open up for the chorus.", 1),
    c("heard", EVERY_ATTACK),
    c("extras", PART_STRINGS),
    c("late", "Land the chorus's first chord with the band.", 1),
    c("early", CHANGE_EARLY),
    c("afterHeld", LONG_TWO),
    c("openString", "Bring the hand down to fret 2 in the gallops.", 2),
    c("shift", CUT_LAST_EIGHTH),
    c("stringChange", CROSS_ON_COUNT),
    c("lastBars", "Bring the palm down first, then gallop.", 2),
  ],
  "verse-and-chorus.song-form": [
    g("Count the fours: verse one, verse two, chorus.", 1),
    c("heard", EVERY_ATTACK),
    c("extras", PART_STRINGS),
    c("late", "Land each chorus chord with the band."),
    c("early", CHANGE_EARLY),
    c("afterHeld", LONG_TWO),
    c("openString", "Keep the open E even under every gallop."),
    c("shift", CUT_LAST_EIGHTH, 2),
    c("stringChange", CROSS_ON_COUNT),
    c("lastBars", "Go back to the verse right on beat one.", 3),
  ],

  // Warm-ups, Level 3 (a new key and string each Take: name nothing)
  "warmup-advanced.root-sixteenths": [
    g(WELL_UNDER, 0),
    c("heard", "Pick all four notes of every beat."),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("shift", FIVE_FRETS),
    c("lastBars", SIXTEENTHS_END),
  ],
  "warmup-advanced.root-triplets": [
    g(WELL_UNDER, 0),
    c("heard", "Pick all three notes of every beat."),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("shift", FIVE_FRETS),
    c("lastBars", TRIPLETS_END),
  ],
};
