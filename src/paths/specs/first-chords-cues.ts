/**
 * First Chords: one thing to try, per Exercise (leg cues1, 2026-11-20).
 *
 * The beginner's chord Path: the reader may have held a guitar for a week.
 * Every Exercise has one general cue (said before its first Take, after an
 * ungraded one, and as its evenness cue) and one cue for each other trigger
 * it can produce. The orders are about where the fingers land, which strings
 * sound, and when a change starts, said as teaching, never as something the
 * app heard about the hand.
 *
 * Only the three warm-ups change between Takes (`stringSet`), so their cues
 * name no string or fret; every other Exercise is one version and may name
 * its chords, strings, frets and fingers.
 * Drafts, proof-read by a second reader: see `plans/coach/progress/cues1.md`.
 */
import type { Cue, CueTrigger } from "../format";
import type { CueBook } from "../spec";

const c = (when: CueTrigger, say: string, more?: number): Cue => (more === undefined ? { when, say } : { when, say, more });
/** The general cue: said with nothing measured, and when evenness decided a Take. */
const g = (say: string, more?: number): Cue => ({ ...c("even", say, more), general: true });

// Shared orders, word for word, so each is translated once.
// One string at a time (the "Check every string" Exercises).
const PRESS = "Press each fingertip just behind its fret.";
const ONE_PICK = "Pick one string on each click, no more.";
const PICK_LATE = "Pick each string right with the click.";
const PICK_EARLY = "Wait for the click before each string.";
const NEXT_STRING = "Find the next string while the note rings.";
const SHAPE_LAST = "Keep the whole shape down to the last note.";
// Strumming.
const ARCH = "Arch the fingers so the open strings ring.";
const ALL_STRINGS = "Strum through every string of the chord.";
const ONCE_A_BEAT = "Strum once on each beat, no more.";
const ONLY_ONE = "Strum only on '1'; let '2, 3, 4' ring.";
const ONLY_ONE_THREE = "Strum only on '1' and '3'.";
const SWEEP = "Brush all the strings in one quick stroke.";
const BRUSH_DOWN = "Make each downstroke one quick brush.";
const ONLY_DDU = "Strum only on '1', '2 and', '3', '4 and'.";
const CLICK_LATE = "Strum right with each click.";
const CLICK_EARLY = "Wait for the click before each strum.";
const BAND_EARLY = "Wait for the band's beat before each strum.";
const DOWN_LATE = "Put each downstroke right on the click.";
const DOWN_EARLY = "Wait for the click before each downstroke.";
const BEAT_LATE = "Put each beat's first stroke on the click.";
const BEAT_EARLY = "Wait for the click at the start of each beat.";
const UP_CATCH = "Catch the top three strings on each upstroke.";
const UP_SHORT = "Keep the upstrokes short: top three strings.";
const ONE_DOWN_UP = "Play one down and one up per click, no more.";
const SILENT_PAST = "Swing past the strings on the silent strokes.";
const UP_PAST_13 = "Swing up past the strings after '1' and '3'.";
const UP_PAST_4 = "Swing up past the strings after '4'.";
const UP_PAST_E = "Swing up past the strings on each 'e'.";
const LONG_SWING = "Swing up past the strings after the long strum.";
const LONG_ONE = "Keep swinging through the long strum on '1'.";
const LONG_FOUR = "Keep swinging through the long strum on '4'.";
const SWING_LAST = "Keep the down-up swing to the last stroke.";
const OPEN_UP = "Let the last upstroke catch open strings.";
// Changes.
const CHANGE_LATE = "Start the change on '4', land on '1'.";
const CHANGE_EARLY = "Wait for '1' before the new chord's strum.";
const LET_GO = "Let go on the last upstroke, land on '1'.";
const LAND_ONE = "Land each new chord right on '1'.";
const AIM = "Aim the pick at each chord's lowest string.";
const FROM_A = "Start each strum on the A string.";
const AM_C_FROM_A = "Strum A minor and C from the A string.";
const AM_FROM_A = "Strum A minor from the A string.";
const C_FROM_A = "Start C's strum from the A string.";
const D_FROM_D = "Start the D chord's strum on the D string.";
const D_C_FROM = "Strum D from the D string, C from the A.";
const SECOND_STAYS = "Keep the second finger on the A string.";
const EM_REPEAT = "Change back to E minor as the tune repeats.";
const AM_REPEAT = "Change back to A minor as the tune repeats.";
const G_REPEAT = "Change back to G as the tune repeats.";
const C_REPEAT = "Change back to C as the tune repeats.";
const D_LAST = "Count both bars of D, then change to C.";
const A7_HOME = "Go back to A7 after the last E7.";
// The warm-ups along one string (their string changes between Takes).
const ARRIVE = "Arrive at each new fret by its click.";
const ARRIVE_EARLY = "Wait for the click before each new fret.";
const ARRIVE_PRESS = "Press just behind each fret as you arrive.";
const EASE = "Ease off as you move, press as you arrive.";
const OPEN_READY = "Have the finger ready as the open note rings.";
const HOLD_FULL = "Hold each note its full length, then move.";
const PRESS_LAST = "Keep pressing just behind the fret to the end.";

export const FIRST_CHORDS_CUES: CueBook = {
  // Level 1, Step 1: E minor
  "e-minor.em-strings": [
    g("Hold the shape down and let each string ring.", 2),
    c("heard", PRESS),
    c("notes", "Put both fingers at fret two: A and D strings.", 3),
    c("extras", ONE_PICK),
    c("late", PICK_LATE),
    c("early", PICK_EARLY),
    c("openString", ARCH),
    c("stringChange", NEXT_STRING),
    c("lastBars", SHAPE_LAST),
  ],
  "e-minor.em-once": [
    g("Strum once on '1', then count '2, 3, 4'."),
    c("heard", "Strum all six strings, starting on the low E."),
    c("extras", ONLY_ONE),
    c("late", "Strum right on the click for '1'."),
    c("early", "Wait for the click on '1' before you strum."),
    c("openString", ARCH),
    c("stringChange", SWEEP, 2),
    c("lastBars", "Keep counting '1, 2, 3, 4' to the last chord."),
  ],
  "e-minor.em-four": [
    g("Make all four downstrokes the same size.", 1),
    c("heard", "Strum all six strings, starting on the low E."),
    c("extras", ONCE_A_BEAT),
    c("late", CLICK_LATE),
    c("early", CLICK_EARLY),
    c("openString", ARCH),
    c("stringChange", SWEEP),
    c("lastBars", "Keep the chord pressed down to the last strum.", 2),
  ],

  // Level 1, Step 2: A minor
  "a-minor.am-strings": [
    g("Arch the first finger so the top string rings.", 2),
    c("heard", PRESS),
    c("notes", "Put the first finger on the B string, fret one."),
    c("extras", ONE_PICK),
    c("late", PICK_LATE),
    c("early", PICK_EARLY),
    c("openString", ARCH),
    c("stringChange", NEXT_STRING),
    c("lastBars", SHAPE_LAST),
  ],
  "a-minor.em-am-once": [
    g("Move on '4' so the new chord lands on '1'.", 1),
    c("heard", ALL_STRINGS),
    c("extras", ONLY_ONE),
    c("late", "Have the new chord down before '1'.", 1),
    c("early", CHANGE_EARLY),
    c("openString", ARCH),
    c("stringChange", AM_FROM_A, 2),
    c("lastBars", EM_REPEAT),
  ],
  "a-minor.em-am-twice": [
    g("Strum on '1' and '3', move on '4'.", 1),
    c("heard", ALL_STRINGS),
    c("extras", ONLY_ONE_THREE),
    c("late", CHANGE_LATE, 1),
    c("early", CHANGE_EARLY),
    c("openString", ARCH),
    c("stringChange", AM_FROM_A),
    c("lastBars", EM_REPEAT),
  ],
  "a-minor.em-am-four": [
    g("Keep strumming whatever the other hand does.", 3),
    c("heard", ALL_STRINGS),
    c("extras", ONCE_A_BEAT),
    c("late", CHANGE_LATE, 2),
    c("early", BAND_EARLY),
    c("openString", ARCH),
    c("stringChange", AM_FROM_A),
    c("lastBars", EM_REPEAT),
  ],

  // Level 1, Step 3: C major
  "c-major.c-strings": [
    g("Keep the G and top strings ringing clear.", 2),
    c("heard", PRESS),
    c("notes", "Press the A string at fret three."),
    c("extras", ONE_PICK),
    c("late", PICK_LATE),
    c("early", PICK_EARLY),
    c("openString", ARCH),
    c("stringChange", NEXT_STRING),
    c("lastBars", SHAPE_LAST),
  ],
  "c-major.am-c": [
    g("Move only the third finger; keep two down.", 1),
    c("heard", ALL_STRINGS),
    c("extras", FROM_A),
    c("late", CHANGE_LATE),
    c("early", BAND_EARLY),
    c("openString", ARCH),
    c("stringChange", "Lift the third finger only a little to cross."),
    c("lastBars", AM_REPEAT),
  ],
  "c-major.three-chords": [
    g("Move the fingers together, not one by one.", 1),
    c("heard", ALL_STRINGS),
    c("extras", ONCE_A_BEAT),
    c("late", CHANGE_LATE),
    c("early", BAND_EARLY),
    c("openString", ARCH),
    c("stringChange", AM_C_FROM_A),
    c("lastBars", EM_REPEAT, 2),
  ],
  "c-major.first-tune": [
    g("Count the bars: '1, 2, 3, 4, 2, 2, 3, 4'.", 1),
    c("heard", ALL_STRINGS),
    c("extras", ONCE_A_BEAT),
    c("late", CHANGE_LATE),
    c("early", BAND_EARLY),
    c("openString", ARCH),
    c("stringChange", AM_C_FROM_A),
    c("lastBars", EM_REPEAT),
  ],

  // Level 2, Step 4: G major
  "g-major.g-strings": [
    g("Stand the fourth finger up so the B rings.", 2),
    c("heard", PRESS),
    c("notes", "Press the low and top strings at fret three.", 2),
    c("extras", ONE_PICK),
    c("late", PICK_LATE),
    c("early", PICK_EARLY),
    c("openString", ARCH),
    c("stringChange", NEXT_STRING),
    c("lastBars", SHAPE_LAST),
  ],
  "g-major.g-em": [
    g(SECOND_STAYS, 1),
    c("heard", ALL_STRINGS),
    c("extras", ONCE_A_BEAT),
    c("late", CHANGE_LATE),
    c("early", BAND_EARLY),
    c("openString", ARCH),
    c("stringChange", "Strum both chords from the low E string."),
    c("lastBars", G_REPEAT),
  ],
  "g-major.g-c": [
    g("Move the second and third fingers as a pair.", 1),
    c("heard", ALL_STRINGS),
    c("extras", ONLY_ONE_THREE),
    c("late", CHANGE_LATE),
    c("early", CHANGE_EARLY),
    c("openString", ARCH),
    c("stringChange", "Strum G from the low E, C from the A string.", 2),
    c("lastBars", G_REPEAT),
  ],
  "g-major.g-em-c": [
    g("Swap the second and third fingers for C.", 1),
    c("heard", ALL_STRINGS),
    c("extras", ONCE_A_BEAT),
    c("late", CHANGE_LATE),
    c("early", BAND_EARLY),
    c("openString", ARCH),
    c("stringChange", C_FROM_A),
    c("lastBars", G_REPEAT),
  ],

  // Level 2, Step 5: D major
  "d-major.d-strings": [
    g("Keep the third finger off the top string.", 2),
    c("heard", PRESS),
    c("notes", "Press the B string at fret three."),
    c("extras", ONE_PICK),
    c("late", PICK_LATE),
    c("early", PICK_EARLY),
    c("openString", ARCH),
    c("stringChange", NEXT_STRING),
    c("lastBars", SHAPE_LAST),
  ],
  "d-major.g-d": [
    g("Lift all fingers together, third lands first.", 2),
    c("heard", ALL_STRINGS),
    c("extras", D_FROM_D, 1),
    c("late", CHANGE_LATE),
    c("early", BAND_EARLY),
    c("openString", ARCH),
    c("stringChange", "Shorten the stroke for D: four strings."),
    c("lastBars", G_REPEAT),
  ],
  "d-major.g-c-d": [
    g("Start G, C and D each one string thinner.", 1),
    c("heard", ALL_STRINGS),
    c("extras", D_C_FROM),
    c("late", CHANGE_LATE),
    c("early", BAND_EARLY),
    c("openString", ARCH),
    c("stringChange", AIM),
    c("lastBars", "Keep the last G steady into the repeat."),
  ],
  "d-major.d-c-g": [
    g("Move the first finger from G string to B.", 1),
    c("heard", ALL_STRINGS),
    c("extras", D_C_FROM),
    c("late", CHANGE_LATE),
    c("early", BAND_EARLY),
    c("openString", ARCH),
    c("stringChange", AIM),
    c("lastBars", "Change back to D as the tune repeats."),
  ],

  // Level 2, Step 6: down and up
  "down-up.eighths-em": [
    g("Down on each beat, up on each 'and'.", 0),
    c("heard", UP_CATCH, 1),
    c("extras", ONE_DOWN_UP),
    c("late", DOWN_LATE),
    c("early", DOWN_EARLY),
    c("openString", ARCH),
    c("stringChange", UP_SHORT),
    c("lastBars", SWING_LAST),
  ],
  "down-up.down-down-up": [
    g("Count '1, 2 and, 3, 4 and' as you strum.", 0),
    c("heard", UP_CATCH),
    c("extras", ONLY_DDU, 0),
    c("late", DOWN_LATE),
    c("early", DOWN_EARLY),
    c("afterHeld", LONG_SWING, 1),
    c("openString", ARCH),
    c("stringChange", BRUSH_DOWN),
    c("lastBars", EM_REPEAT),
  ],
  "down-up.eighths-change": [
    g("Keep the hand swinging while the chords change.", 1),
    c("heard", UP_CATCH),
    c("extras", ONE_DOWN_UP),
    c("late", LET_GO, 1),
    c("early", CHANGE_EARLY),
    c("openString", OPEN_UP, 1),
    c("stringChange", BRUSH_DOWN),
    c("lastBars", G_REPEAT),
  ],

  // Level 2, Step 7: patterns
  "patterns.pattern-em": [
    g("Say 'down, down-up, up-down-up' as you play.", 1),
    c("heard", UP_CATCH),
    c("extras", SILENT_PAST, 2),
    c("late", DOWN_LATE),
    c("early", DOWN_EARLY),
    c("afterHeld", LONG_ONE),
    c("openString", ARCH),
    c("stringChange", BRUSH_DOWN),
    c("lastBars", SWING_LAST),
  ],
  "patterns.pattern-g-em": [
    g(SECOND_STAYS, 1),
    c("heard", UP_CATCH),
    c("extras", SILENT_PAST),
    c("late", DOWN_LATE),
    c("early", DOWN_EARLY),
    c("afterHeld", LONG_ONE),
    c("openString", ARCH),
    c("stringChange", BRUSH_DOWN),
    c("lastBars", G_REPEAT),
  ],
  "patterns.pattern-song": [
    g(LET_GO, 1),
    c("heard", UP_CATCH),
    c("extras", SILENT_PAST),
    c("late", LAND_ONE),
    c("early", CHANGE_EARLY),
    c("afterHeld", LONG_ONE),
    c("openString", ARCH),
    c("stringChange", AIM, 2),
    c("lastBars", G_REPEAT),
  ],
  "patterns.your-pattern": [g("Keep the down on '1' and the hand swinging.", 1)],

  // Level 2, Step 8: strums between the beats
  "strums-between-beats.rest-beat": [
    g("Swing down past the strings on '3'.", 1),
    c("heard", ALL_STRINGS),
    c("extras", "Keep '3' silent: let the chord ring on."),
    c("late", CLICK_LATE),
    c("early", CLICK_EARLY),
    c("openString", ARCH),
    c("stringChange", SECOND_STAYS, 2),
    c("lastBars", G_REPEAT),
  ],
  "strums-between-beats.only-ands": [
    g("Tap the foot on the beat, strum on the 'and'.", 2),
    c("heard", UP_CATCH, 1),
    c("extras", "Swing down past the strings on silent beats.", 1),
    c("late", "Strum each 'and' as soon as the foot lifts."),
    c("early", "Wait for the foot to lift before each 'and'."),
    c("openString", ARCH),
    c("stringChange", UP_SHORT),
    c("lastBars", "Keep the foot tapping to the last 'and'."),
  ],
  "strums-between-beats.short-pattern": [
    g("Move to the new chord during the long '4'.", 2),
    c("heard", UP_CATCH),
    c("extras", UP_PAST_4, 1),
    c("late", CHANGE_LATE, 2),
    c("early", CHANGE_EARLY),
    c("afterHeld", LONG_ONE),
    c("openString", ARCH),
    c("stringChange", C_FROM_A),
    c("lastBars", G_REPEAT),
  ],
  "strums-between-beats.short-pattern-song": [
    g("Use all of beat four to reach the next chord."),
    c("heard", UP_CATCH),
    c("extras", UP_PAST_4),
    c("late", CHANGE_LATE),
    c("early", CHANGE_EARLY),
    c("afterHeld", LONG_ONE),
    c("openString", ARCH),
    c("stringChange", AIM, 3),
    c("lastBars", C_REPEAT),
  ],

  // Level 3, Step 9: A and E
  "a-and-e.a-strings": [
    g("Push the third finger closest to the fret.", 2),
    c("heard", PRESS),
    c("notes", "Three fingers at fret two: D, G and B strings."),
    c("extras", ONE_PICK),
    c("late", PICK_LATE),
    c("early", PICK_EARLY),
    c("openString", ARCH),
    c("stringChange", NEXT_STRING),
    c("lastBars", SHAPE_LAST),
  ],
  "a-and-e.em-to-e": [
    g("Add the first finger on the G string, fret one.", 1),
    c("heard", ALL_STRINGS),
    c("extras", ONCE_A_BEAT),
    c("late", CHANGE_LATE),
    c("early", CHANGE_EARLY),
    c("openString", ARCH),
    c("stringChange", SWEEP),
    c("lastBars", EM_REPEAT),
  ],
  "a-and-e.a-d": [
    g("Slide the third finger along the B string.", 1),
    c("heard", ALL_STRINGS),
    c("extras", D_FROM_D, 2),
    c("late", LET_GO),
    c("early", CHANGE_EARLY),
    c("afterHeld", LONG_SWING),
    c("openString", ARCH),
    c("stringChange", AIM),
    c("lastBars", "Change back to A as the tune repeats."),
  ],
  "a-and-e.a-d-e": [
    g("Count the bars: A, A, D, D, E, D, A, A.", 1),
    c("heard", ALL_STRINGS),
    c("extras", D_FROM_D),
    c("late", LET_GO),
    c("early", CHANGE_EARLY),
    c("afterHeld", LONG_SWING),
    c("openString", ARCH),
    c("stringChange", "Slide the first finger along the G string.", 2),
    c("lastBars", "Count both bars of A before the repeat."),
  ],

  // Level 3, Step 10: sevenths and the blues
  "sevenths-blues.a7-strings": [
    g("Stand both fingers up so the G string rings.", 2),
    c("heard", PRESS),
    c("notes", "Fret two on the D and B strings, G open."),
    c("extras", ONE_PICK),
    c("late", PICK_LATE),
    c("early", PICK_EARLY),
    c("openString", ARCH),
    c("stringChange", NEXT_STRING),
    c("lastBars", SHAPE_LAST),
  ],
  "sevenths-blues.d7-strings": [
    g("Put the first finger on the B string, fret one.", 2),
    c("heard", PRESS),
    c("notes", "Press the G and top strings at fret two."),
    c("extras", ONE_PICK),
    c("late", PICK_LATE),
    c("early", PICK_EARLY),
    c("openString", ARCH),
    c("stringChange", NEXT_STRING),
    c("lastBars", SHAPE_LAST),
  ],
  "sevenths-blues.three-sevenths": [
    g("Keep the third finger at fret two for D7.", 1),
    c("heard", ALL_STRINGS),
    c("extras", AIM, 3),
    c("late", CHANGE_LATE),
    c("early", BAND_EARLY),
    c("openString", ARCH),
    c("stringChange", SWEEP),
    c("lastBars", "Change back to A7 as the tune repeats."),
  ],
  "sevenths-blues.blues-four": [
    g("Count the bars as well as the beats.", 1),
    c("heard", ALL_STRINGS),
    c("extras", AIM),
    c("late", CHANGE_LATE),
    c("early", BAND_EARLY),
    c("openString", ARCH),
    c("stringChange", "Move the first finger to the B string for D7.", 2),
    c("lastBars", A7_HOME, 3),
  ],
  "sevenths-blues.blues-down-down-up": [
    g("Keep both short strums the same length.", 3),
    c("heard", UP_CATCH),
    c("extras", ONLY_DDU),
    c("late", LET_GO, 2),
    c("early", CHANGE_EARLY),
    c("afterHeld", LONG_SWING),
    c("openString", OPEN_UP, 2),
    c("stringChange", AIM),
    c("lastBars", A7_HOME),
  ],

  // Level 3, Step 11: the small F
  "small-f.dm-strings": [
    g("Reach the first finger to the top string.", 2),
    c("heard", PRESS),
    c("notes", "Fret three on the B string, one on the top."),
    c("extras", ONE_PICK),
    c("late", PICK_LATE),
    c("early", PICK_EARLY),
    c("openString", ARCH),
    c("stringChange", NEXT_STRING),
    c("lastBars", SHAPE_LAST),
  ],
  "small-f.am-dm": [
    g("Move all three fingers one string thinner.", 2),
    c("heard", ALL_STRINGS),
    c("extras", "Start D minor's strum on the D string.", 1),
    c("late", CHANGE_LATE),
    c("early", BAND_EARLY),
    c("openString", ARCH),
    c("stringChange", "Take the third finger up a fret as it moves."),
    c("lastBars", AM_REPEAT),
  ],
  "small-f.c-fmaj7": [
    g("Keep the first finger on the B string.", 2),
    c("heard", ALL_STRINGS),
    c("extras", "Start F major seven's strum on the D string.", 1),
    c("late", CHANGE_LATE),
    c("early", BAND_EARLY),
    c("openString", ARCH),
    c("stringChange", "Move the other two fingers across as a pair."),
    c("lastBars", C_REPEAT),
  ],
  "small-f.f-strings": [
    g("Hold B and top strings with one flat finger.", 2),
    c("heard", "Move the first finger closer to the fret.", 2),
    c("notes", "Press the D string at fret three."),
    c("extras", ONE_PICK),
    c("late", PICK_LATE),
    c("early", PICK_EARLY),
    c("stringChange", NEXT_STRING),
    c("lastBars", SHAPE_LAST),
  ],
  "small-f.am-f-c-g": [
    g("Lay the first finger flat for F.", 1),
    c("heard", ALL_STRINGS),
    c("heard", "Play F major seven until the small F rings.", 2),
    c("extras", UP_PAST_4),
    c("late", CHANGE_LATE),
    c("early", CHANGE_EARLY),
    c("afterHeld", LONG_ONE),
    c("openString", ARCH),
    c("stringChange", "Swap the second and third fingers for F.", 1),
    c("lastBars", AM_REPEAT),
  ],

  // Level 3, Step 12: light and shade
  "light-and-shade.accents": [
    g("Make the light strokes lighter first.", 2),
    c("heard", "Keep every light stroke on the strings."),
    c("extras", ONE_DOWN_UP),
    c("late", DOWN_LATE),
    c("early", DOWN_EARLY),
    c("openString", ARCH),
    c("stringChange", UP_SHORT),
    c("lastBars", G_REPEAT),
  ],
  "light-and-shade.stop": [
    g("Count '1, 2 and, (3), 4 and' as you strum.", 0),
    c("heard", UP_CATCH),
    c("extras", "Stop the strings with the hand's side on '3'.", 2),
    c("late", "Lift the hand in time for the down on '4'.", 1),
    c("early", "Wait for the click on '4' after the stop."),
    c("afterHeld", LONG_SWING),
    c("openString", ARCH),
    c("stringChange", AIM),
    c("lastBars", "Keep the last G steady into the repeat."),
  ],
  "light-and-shade.bass-strum": [
    g("Hold the whole chord down for bass and strum.", 2),
    c("heard", "Strum just the G, B and top strings.", 1),
    c("extras", "Pick the bass note alone, one string."),
    c("late", CLICK_LATE),
    c("early", CLICK_EARLY),
    c("openString", ARCH),
    c("stringChange", "Find each chord's bass note before '1'.", 1),
    c("lastBars", AM_REPEAT),
  ],

  // Level 3, Step 13: sixteenth strums
  "sixteenth-strums.sixteenths-em": [
    g("Count '1 e and a' on every beat.", 0),
    c("heard", UP_CATCH, 1),
    c("extras", "Play four strokes to each click, no more."),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("openString", ARCH),
    c("stringChange", UP_SHORT),
    c("lastBars", "Count '1 e and a' right to the end."),
  ],
  "sixteenth-strums.sixteenth-pattern": [
    g("Count '1, and a, 2, and a, 3, and a, 4'.", 0),
    c("heard", UP_CATCH),
    c("extras", UP_PAST_E, 1),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("afterHeld", LONG_FOUR, 1),
    c("openString", ARCH),
    c("stringChange", UP_SHORT),
    c("lastBars", "Keep the hand swinging in the air after '4'."),
  ],
  "sixteenth-strums.sixteenth-pattern-g-em": [
    g(SECOND_STAYS, 1),
    c("heard", UP_CATCH),
    c("extras", UP_PAST_E),
    c("late", CHANGE_LATE, 1),
    c("early", BEAT_EARLY),
    c("afterHeld", LONG_FOUR),
    c("openString", ARCH),
    c("stringChange", UP_SHORT),
    c("lastBars", G_REPEAT),
  ],
  "sixteenth-strums.sixteenth-pattern-song": [
    g("Keep swinging while the fingers travel.", 1),
    c("heard", UP_CATCH),
    c("extras", UP_PAST_E),
    c("late", CHANGE_LATE, 1),
    c("early", BEAT_EARLY),
    c("afterHeld", LONG_FOUR),
    c("openString", ARCH),
    c("stringChange", AIM, 2),
    c("lastBars", G_REPEAT),
  ],

  // Level 3, Step 14: a whole song
  "a-whole-song.verse": [
    g(LET_GO, 1),
    c("heard", UP_CATCH),
    c("extras", UP_PAST_13),
    c("late", LAND_ONE),
    c("early", CHANGE_EARLY),
    c("afterHeld", LONG_SWING),
    c("openString", ARCH),
    c("stringChange", "Keep the second finger down from G to E minor.", 1),
    c("lastBars", G_REPEAT),
  ],
  "a-whole-song.chorus": [
    g("Have the C shape ready before you start.", 1),
    c("heard", UP_CATCH),
    c("extras", SILENT_PAST),
    c("late", LET_GO),
    c("early", CHANGE_EARLY),
    c("afterHeld", LONG_ONE),
    c("openString", ARCH),
    c("stringChange", AIM),
    c("lastBars", D_LAST, 2),
  ],
  "a-whole-song.the-song": [
    g("Say 'chorus' to yourself in bar eight.", 2),
    c("heard", UP_CATCH),
    c("extras", SILENT_PAST),
    c("late", LET_GO),
    c("early", CHANGE_EARLY),
    c("afterHeld", LONG_SWING),
    c("openString", ARCH),
    c("stringChange", AIM),
    c("lastBars", "Count both bars of D, then go back to G."),
  ],
  "a-whole-song.your-song": [g("Start with four downstrokes a bar.", 1)],

  // Warm-ups (a different string or string pair each time: they name none)
  "warmup-beginner.string-walk": [
    g("Press only as hard as each note needs.", 0),
    c("heard", ARRIVE_PRESS),
    c("late", ARRIVE),
    c("early", ARRIVE_EARLY),
    c("afterHeld", HOLD_FULL),
    c("openString", OPEN_READY),
    c("shift", EASE),
    c("lastBars", PRESS_LAST),
  ],
  "warmup-intermediate.major-walk": [
    g("Glide between notes without pressing.", 0),
    c("heard", ARRIVE_PRESS),
    c("late", "Start each move as the last note sounds."),
    c("early", "Let each note ring its full length."),
    c("afterHeld", HOLD_FULL),
    c("openString", OPEN_READY),
    c("shift", EASE),
    c("lastBars", PRESS_LAST),
  ],
  "warmup-advanced.small-barre": [
    g("Lay the first finger flat over both strings.", 0),
    c("heard", "Pick both strings together on each click."),
    c("late", ARRIVE),
    c("early", ARRIVE_EARLY),
    c("shift", EASE, 0),
    c("stringChange", "Strike both strings in one small stroke."),
    c("lastBars", "Keep the finger flat to the last note."),
  ],
};
