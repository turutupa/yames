/**
 * Shred: one thing to try, per Exercise (leg cues14, 2026-11-20).
 *
 * Same shape as `alternate-picking-cues.ts` (the worked example for
 * `plans/coach/CUES_GUIDE.md`): one general cue per Exercise and one cue per
 * trigger it can produce, `more` pointing at the how-to line the cue comes
 * from. Sequences and bursts are worded as Alternate Picking words them, so
 * the two Paths agree.
 *
 * Teaching at speed: where the accent and the count sit in a long run, where
 * the hand changes position, and the last bars of a run (the count, never
 * "relax"). The app hears when a note sounded and which pitch; it does not
 * hear pick direction, hammered against picked, muting, tension or tone, so
 * no cue says or implies a slip came from them. Most Exercises change key,
 * string or position between Takes: their cues name no fret, string or note.
 * Proof-read by a second reader: see `plans/coach/progress/cues14.md`.
 */
import type { Cue, CueTrigger } from "../format";
import type { CueBook } from "../spec";

const c = (when: CueTrigger, say: string, more?: number): Cue => (more === undefined ? { when, say } : { when, say, more });
/** The general cue: said with nothing measured, and when evenness decided a Take. */
const g = (say: string, more?: number): Cue => ({ ...c("even", say, more), general: true });

// Shared orders, word for word, so each is translated once (several as Alternate Picking words them).
const RIGHT_THROUGH = "Pick every note right through.";
const BEAT_LATE = "Put the first note of each beat on the click.";
const BEAT_EARLY = "Wait for the click at the start of each beat.";
const CROSS_CLOSE = "Keep the pick close as you cross.";
const CROSS_SMALL = "Keep the stroke small as you cross strings.";
const TWO_STRINGS = "Keep the stroke small: just the two strings.";
const IN_USE = "Keep the stroke small: just the strings in use.";
const HOP = "Make the hop smaller, not faster.";
const ONE_STRING = "Keep the pick on one string only.";
const TOP_ONLY = "Keep the pick on the top string only.";
const A_ONLY = "Keep the pick on the A string only.";
const QUIET_HEARD = "Play every quiet note, just lighter.";
const SIX_LATE = "Put the first of each six on the click.";
const SIX_EARLY = "Wait for the click before each six.";
const NEW_PAIR_LATE = "Put each new pair right on the beat.";
const NEW_PAIR_EARLY = "Wait for the click before each new pair.";
const NEXT_PAIR = "Know the next pair before it comes.";
const WELL_UNDER = "Start well under your clean tempo.";
const GROUP_LATE = "Put each group's first note on the click.";
const GROUP_EARLY = "Wait for the click before each group.";
const FINGER_BEHIND = "Press each finger right behind the fret.";
const SHIFT_PASS = "Shift during the last note of a pass.";
const SHIFT_CROSS = "Have each new string's first note ready.";
const UP_DOWN = "Keep the way down as even as the way up.";
const DOWN_AS_UP = "Come back down as evenly as you went up.";
const SIX_NOTES = "Say the six notes once before you start.";
const STRING_THREE = "Count three notes on each string.";
const FINGERS_READY = "Have every finger ready before it plays.";
const LEAN_SIX = "Lean a little on the first of each six.";
const LAND_FOUR = "Land the last note right on beat four.";
const LONG_BEAT_GO = "Count the long note's beat, then go.";
const HELD_OUT = "Count the held note out, then start again.";
const UP_THEN_DOWN = "Start each group one note higher, then lower.";
const BURST_HEARD = "Pick every note of the burst right through.";
const BURST_LATE = "Start each burst right on the click.";
const BURST_EARLY = "Wait for the click before each burst.";
const BURST_STOP = "Stop each burst cleanly on the long note.";
const SKIP_CLEAR = "Stay clear of the skipped string.";
const RUN_LATE = "Start each run right on the click.";
const RUN_EARLY = "Wait for the click before each run.";
const MOVE_SMALL = "Keep the move to the next string small.";

export const SHRED_CUES: CueBook = {
  // Level 1, Step 1: one string
  "one-string.open-a": [
    g("Land every stroke on its '1 e and a'.", 0),
    c("heard", "Pick every open A right through."),
    c("extras", A_ONLY),
    c("late", "Put each '1' right on the click."),
    c("early", "Wait for the click on each '1'."),
    c("openString", "Keep every stroke the same size."),
    c("lastBars", "Keep counting '1 e and a' to the last note."),
  ],
  "one-string.chromatic-on-g": [
    g("Land each finger exactly as the pick strikes."),
    c("heard", "Press each finger right behind the fret."),
    c("extras", "Keep each finger down until the next lands.", 2),
    c("notes", "One finger per fret: never skip one."),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("shift", "Move the hand one fret as each bar starts.", 0),
    c("lastBars", "Keep the walk down as even as the walk up."),
  ],
  "one-string.four-of-each": [
    g("Move the fretting hand exactly on the beat.", 0),
    c("heard", RIGHT_THROUGH),
    c("extras", TOP_ONLY),
    c("notes", "Say A, C, B, A, then G, A, B, C.", 0),
    c("late", "Put each new note right on the click."),
    c("early", "Wait for the click before each new note."),
    c("shift", "Have the next finger ready over its fret."),
    c("lastBars", "Give the last C all four of its strokes."),
  ],
  "one-string.twelve-thirteen-fifteen": [
    g("Leave the first finger down through the loop.", 1),
    c("heard", "Press the little finger fully down."),
    c("extras", ONE_STRING),
    c("notes", "Reach two frets up with the little finger.", 0),
    c("late", "Put each loop's first note on the click."),
    c("early", "Wait for the click before each loop."),
  ],

  // Level 1, Step 2: accents
  "accents.walking-accent": [
    g("Keep the time still as the accent moves.", 0),
    c("heard", QUIET_HEARD),
    c("extras", "Keep the pick on the G string only."),
    c("late", "Put each '1' on the click, accent or not."),
    c("early", "Wait for the click; do not rush the accent."),
    c("lastBars", "Accent the last of each four, right on time."),
  ],
  "accents.open-triplets": [
    g("Accent the first and fourth of each six.", 0),
    c("heard", QUIET_HEARD),
    c("extras", A_ONLY),
    c("late", SIX_LATE),
    c("early", SIX_EARLY),
    c("openString", "Keep the six even between the accents."),
  ],
  "accents.sextuplet-accent": [
    g("Accent the first of each six; count the beat.", 0),
    c("heard", QUIET_HEARD),
    c("extras", ONE_STRING),
    c("late", SIX_LATE),
    c("early", SIX_EARLY),
  ],
  "accents.three-against-four": [
    g("Tap your foot on the click, not the accents.", 1),
    c("heard", QUIET_HEARD),
    c("extras", TOP_ONLY),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("lastBars", "Count the beats until the accent meets the '1'."),
  ],

  // Level 1, Step 3: crossing
  "crossing.outside-pairs": [
    g("Change the notes; keep the strokes the same.", 0),
    c("heard", "Pick the higher string as firmly as the lower."),
    c("extras", TWO_STRINGS),
    c("notes", NEXT_PAIR),
    c("late", NEW_PAIR_LATE),
    c("early", NEW_PAIR_EARLY),
    c("stringChange", CROSS_CLOSE),
  ],
  "crossing.inside-pairs": [
    g("Keep it as even as the outside pairs."),
    c("heard", "Pick the lower string as firmly as the higher."),
    c("extras", TWO_STRINGS),
    c("notes", NEXT_PAIR),
    c("late", NEW_PAIR_LATE),
    c("early", NEW_PAIR_EARLY),
    c("stringChange", HOP, 0),
  ],
  "crossing.outside-lick": [
    g("Alternate strictly; never add a stroke.", 1),
    c("heard", RIGHT_THROUGH),
    c("extras", IN_USE),
    c("notes", "Say the lick's first note before you start."),
    c("late", "Start each lick right on the click."),
    c("early", "Wait for the click before each lick."),
    c("stringChange", CROSS_CLOSE),
  ],
  "warmup-beginner.one-string-climb": [
    g(WELL_UNDER, 0),
    c("heard", RIGHT_THROUGH),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("shift", "Start one note higher as each bar starts."),
    c("lastBars", "Keep the highest notes as even as the low."),
  ],

  // Level 2, Step 4: chromatic
  "chromatic.petrucci-climb": [
    g("Count '1 e and a': one string to each beat."),
    c("heard", FINGER_BEHIND),
    c("extras", CROSS_SMALL),
    c("notes", "Say '1-2-3-4' going up, '4-3-2-1' coming down.", 0),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("shift", SHIFT_PASS, 1),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", "Keep the last pass down as even as the first."),
  ],
  "chromatic.spider": [
    g("Lift each finger only when its partner lands.", 2),
    c("heard", FINGER_BEHIND),
    c("extras", TWO_STRINGS),
    c("notes", "Say '1-3, 2-4' with the fingers each beat.", 0),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("shift", "Move the hand as each bar starts, not after.", 1),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", "Keep the crawl back down as even as the climb."),
  ],
  "chromatic.one-three-two-four": [
    g("Say '1-3-2-4' out loud for the first passes.", 1),
    c("heard", FINGER_BEHIND),
    c("extras", CROSS_SMALL),
    c("notes", "Say '4-2-3-1' before the way down.", 0),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("shift", SHIFT_PASS),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", UP_DOWN),
  ],

  // Level 2, Step 5: Gilbert loops
  "gilbert.six-loop": [
    g("Keep the six even through every crossing."),
    c("heard", RIGHT_THROUGH),
    c("extras", TWO_STRINGS),
    c("notes", SIX_NOTES),
    c("late", SIX_LATE),
    c("early", SIX_EARLY),
    c("stringChange", HOP),
  ],
  "gilbert.down-the-box": [
    g("Find each new pair of strings on the beat.", 0),
    c("heard", RIGHT_THROUGH),
    c("extras", CROSS_SMALL),
    c("notes", "Know the next string pair before it comes.", 2),
    c("late", SIX_LATE),
    c("early", SIX_EARLY),
    c("stringChange", "Change pairs right on the beat."),
    c("lastBars", "Climb back to the top pair just as evenly."),
  ],
  "gilbert.four-note": [
    g("Count '1 e and a': one loop to each beat."),
    c("heard", RIGHT_THROUGH),
    c("extras", TWO_STRINGS),
    c("notes", "Say the four notes once before you start."),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("stringChange", CROSS_CLOSE),
  ],
  "gilbert.mirror-loop": [
    g("Start each six from its top note, on the beat."),
    c("heard", RIGHT_THROUGH),
    c("extras", TWO_STRINGS),
    c("notes", SIX_NOTES),
    c("late", SIX_LATE),
    c("early", SIX_EARLY),
    c("stringChange", CROSS_CLOSE),
  ],

  // Level 2, Step 6: three notes per string
  "three-per-string.six-note-down": [
    g(LAND_FOUR),
    c("heard", RIGHT_THROUGH),
    c("extras", IN_USE),
    c("notes", SIX_NOTES),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("afterHeld", LONG_BEAT_GO),
    c("stringChange", HOP),
  ],
  "three-per-string.six-note-up": [
    g("Play it as evenly as the descending one."),
    c("heard", RIGHT_THROUGH),
    c("extras", TWO_STRINGS),
    c("notes", SIX_NOTES),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("afterHeld", LONG_BEAT_GO),
    c("stringChange", CROSS_CLOSE),
  ],
  "three-per-string.three-strings": [
    g("Come back down without repeating the top note.", 0),
    c("heard", RIGHT_THROUGH),
    c("extras", CROSS_SMALL),
    c("notes", FINGERS_READY),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("shift", SHIFT_CROSS),
    c("stringChange", CROSS_CLOSE),
  ],
  "three-per-string.six-strings": [
    g("Count '1 e and a' all the way up and down."),
    c("heard", RIGHT_THROUGH),
    c("extras", CROSS_SMALL),
    c("notes", STRING_THREE, 0),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("afterHeld", HELD_OUT),
    c("shift", "Shift as you cross to the B string.", 1),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", UP_DOWN),
  ],

  // Level 2, Step 7: sequences
  "sequences.threes": [
    g("Count '1-trip-let'; each group one note up.", 0),
    c("heard", RIGHT_THROUGH),
    c("extras", CROSS_SMALL),
    c("notes", "Start each group one note higher."),
    c("late", GROUP_LATE),
    c("early", GROUP_EARLY),
    c("afterHeld", "Count the landing's beat, then start again."),
    c("shift", SHIFT_CROSS),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", "Keep the triplets even right to the landing."),
  ],
  "sequences.fours": [
    g("Put the first note of each group on the beat.", 0),
    c("heard", RIGHT_THROUGH),
    c("extras", CROSS_SMALL),
    c("notes", UP_THEN_DOWN, 0),
    c("late", GROUP_LATE),
    c("early", GROUP_EARLY),
    c("shift", SHIFT_CROSS),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", "Keep the groups coming down even to the end."),
  ],
  "sequences.sixes": [
    g(LEAN_SIX),
    c("heard", RIGHT_THROUGH),
    c("extras", CROSS_SMALL),
    c("notes", UP_THEN_DOWN, 0),
    c("late", SIX_LATE),
    c("early", SIX_EARLY),
    c("shift", SHIFT_CROSS),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", "Keep the falling sixes as even as the climb."),
  ],
  "sequences.fours-down": [
    g("Land the half note exactly on beat three.", 1),
    c("heard", RIGHT_THROUGH),
    c("extras", CROSS_SMALL),
    c("notes", "Start each group one note lower.", 0),
    c("late", GROUP_LATE),
    c("early", GROUP_EARLY),
    c("afterHeld", "Count the half note's two beats, then go."),
    c("shift", SHIFT_CROSS),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", "Keep the groups even right to the landing."),
  ],

  // Level 2, Step 8: speed bursts
  "speed-bursts.one-beat": [
    g("Land the quarter note right with the click."),
    c("heard", BURST_HEARD),
    c("extras", BURST_STOP),
    c("late", BURST_LATE),
    c("early", BURST_EARLY),
    c("afterHeld", LONG_BEAT_GO),
  ],
  "speed-bursts.two-beats": [
    g("Count the burst, then land the half note.", 0),
    c("heard", BURST_HEARD),
    c("extras", BURST_STOP),
    c("late", BURST_LATE),
    c("early", BURST_EARLY),
    c("afterHeld", "Count the half note's two beats, then go."),
  ],
  "speed-bursts.expanding": [
    g("Play one more beat each bar, then rest.", 0),
    c("heard", BURST_HEARD),
    c("extras", BURST_STOP),
    c("late", BURST_LATE),
    c("early", BURST_EARLY),
    c("afterHeld", "Count the rest out, then start the burst."),
    c("lastBars", "Keep going through the last four beats.", 0),
  ],
  "speed-bursts.six-note-burst": [
    g("Land the first quarter note on beat two.", 0),
    c("heard", BURST_HEARD),
    c("extras", IN_USE),
    c("notes", "Name the walk-down's notes before you start."),
    c("late", BURST_LATE),
    c("early", BURST_EARLY),
    c("afterHeld", "Count the last quarter note, then start."),
    c("stringChange", CROSS_CLOSE),
  ],

  // Level 2, Step 9: string skipping
  "string-skipping.octaves": [
    g("Aim the pick at the far string before you go.", 0),
    c("heard", "Pick the high note as firmly as the low."),
    c("extras", "Rest a finger lightly on the skipped string.", 2),
    c("notes", "Name each octave's note before you play it."),
    c("late", "Put each beat's low note on the click."),
    c("early", NEW_PAIR_EARLY),
    c("shift", "Arrive at the next pair as each beat starts.", 1),
    c("stringChange", SKIP_CLEAR),
    c("lastBars", DOWN_AS_UP),
  ],
  "string-skipping.pentatonic-skip": [
    g("Find each new string before its pair starts."),
    c("heard", RIGHT_THROUGH),
    c("extras", SKIP_CLEAR),
    c("notes", NEXT_PAIR),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("stringChange", HOP, 1),
    c("lastBars", DOWN_AS_UP),
  ],
  "string-skipping.skipped-triad": [
    g("Keep the hand still after the first note.", 1),
    c("heard", RIGHT_THROUGH),
    c("extras", SKIP_CLEAR),
    c("notes", "Name each note's chord tone as you play it."),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("shift", "Shift up right after the lowest note."),
    c("stringChange", "Clear the skipped string in one small hop.", 2),
  ],

  // Level 2, Step 10: economy
  "economy.ascending-economy": [
    g("Let the pick fall through to each new string.", 0),
    c("heard", RIGHT_THROUGH),
    c("extras", CROSS_SMALL),
    c("notes", STRING_THREE),
    c("late", RUN_LATE),
    c("early", RUN_EARLY),
    c("shift", SHIFT_CROSS),
    c("stringChange", MOVE_SMALL),
    c("lastBars", "Start the low E run right on the '1'.", 1),
  ],
  "economy.quintuplet-group": [
    g("Count 'one-two-three-four-five' to each click.", 0),
    c("heard", RIGHT_THROUGH),
    c("extras", TWO_STRINGS),
    c("notes", "Say the five notes once before you start."),
    c("late", "Put the first of each five on the click."),
    c("early", "Wait for the click before each five."),
    c("stringChange", MOVE_SMALL),
  ],
  "economy.descending-economy": [
    g("Let each upstroke fall to the string below.", 0),
    c("heard", RIGHT_THROUGH),
    c("extras", CROSS_SMALL),
    c("notes", STRING_THREE),
    c("late", RUN_LATE),
    c("early", RUN_EARLY),
    c("shift", SHIFT_CROSS),
    c("stringChange", MOVE_SMALL),
    c("lastBars", "Start the run from the top string on the '1'.", 1),
  ],
  "economy.picked-arpeggios": [
    g("Alternate every stroke, even across strings.", 1),
    c("heard", RIGHT_THROUGH),
    c("extras", IN_USE),
    c("notes", "Know the next chord before it comes."),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", "Keep the last chord as even as the first."),
  ],
  "warmup-intermediate.scale-round": [
    g(WELL_UNDER, 0),
    c("heard", RIGHT_THROUGH),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("shift", "Keep the shift small, right as each bar starts.", 0),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", "Keep the second run as even as the first."),
  ],
};
