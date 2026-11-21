/**
 * Sweep Picking: one thing to try, per Exercise (legs cues13a and cues13b, 2026-11-20).
 *
 * Every Exercise has one general cue (said before its first Take, after an
 * ungraded one, and as its evenness cue) and one cue for each other trigger
 * it can produce. Right notes are not graded on this Path, so no Exercise has
 * a `notes` cue; the warm-ups grade no extra notes, so they have no `extras`.
 *
 * What a sweep teacher says at the slips the app measures: notes bunching
 * together (the sweep rushing into the top note), the turnaround coming late,
 * notes missed where a finger rolls. The cues say where the count sits in the
 * shape ("the top note on beats two and four"), which note to aim at, and to
 * slow the hand so each string gets its own moment. The app hears when a note
 * sounded and which pitch; it does not hear pick direction, muting, strings
 * ringing together or the roll, so no cue gives any of them as a reason.
 *
 * Laid out Level by Level. cues13a wrote the Beginner Level, Intermediate
 * Steps 6 to 9 (four-strings, five-strings, five-e-shape, moving-shapes) and
 * the three warm-ups; cues13b appends the rest of Intermediate and Advanced
 * below, reusing the shared constants rather than writing new ones.
 */
import type { Cue, CueTrigger } from "../format";
import type { CueBook } from "../spec";

const c = (when: CueTrigger, say: string, more?: number): Cue => (more === undefined ? { when, say } : { when, say, more });
/** The general cue: said with nothing measured, and when evenness decided a Take. */
const g = (say: string, more?: number): Cue => ({ ...c("even", say, more), general: true });

// Shared orders, word for word, so each is translated once.
// late / early: where a sweep or a new shape starts.
const SWEEP_LATE = "Put the first note of each sweep on the click.";
const SWEEP_EARLY = "Wait for the click before each sweep.";
const NEW_SHAPE_LATE = "Land each new shape's first note on the click.";
const LOOP_A_LATE = "Start each loop on the A string on the click.";
const REST_EARLY = "Wait out the rest before the next loop.";
// late / early at the turnaround (three- and four-string loops: the top hammer is on beats two and four).
const TOP_HAMMER = "Hammer the top note on beats two and four.";
const TURN_EARLY = "Wait for the top note's beat before the hammer.";
// five-string A-shape loops: the top note is on beat three.
const TOP_THREE_EARLY = "Wait for beat three before the top hammer.";
const TAP_LATE = "Put the tap right on beat three.";
const TAP_EARLY = "Wait for beat three before the tap.";
// heard: aim the note.
const EACH_ARRIVES = "Press each note fully as the pick gets there.";
const AFTER_JUMP = "Press the first note after each jump fully.";
// extras: keep the pick to the shape.
const TOP_THREE = "Keep the pick on the top three strings only.";
const FOUR_ONLY = "Keep the pick on the top four strings only.";
const FIVE_ONLY = "Keep the pick on the top five strings only.";
const IN_USE = "Keep the pick on the strings in use.";
// stringChange: the bunching sweep.
const OWN_MOMENT = "Slow the hand so each string gets its moment.";
const DOWN_AS_UP = "Sweep back down as evenly as you went up.";
// shift and lastBars.
const MOVE_ON_LAST = "Move to the next shape on each bar's last note.";
const MOVE_AT_START = "Be in place before each bar starts.";
const SEPARATE_TO_END = "Keep every note separate right to the end.";
const LAST_AS_FIRST = "Keep the last chord as even as the first.";
// warm-ups (their keys, shapes and progressions change, so these name nothing).
const WELL_UNDER = "Start well under your clean tempo.";
const ONE_BY_ONE = "Sound every note of the sweep, one by one.";
const END_AS_START = "Keep the end as even as the start.";

export const SWEEP_PICKING_CUES: CueBook = {
  // ── Beginner ──────────────────────────────────────────────────────────

  // Step 1: triads
  "triads.two-string-push": [
    g("Push through both strings in one motion.", 0),
    c("heard", "Let the pick rest on the second string first.", 0),
    c("extras", "Keep the third triplet silent every time.", 2),
    c("late", "Put the first of the two notes on the click."),
    c("early", "Wait for the click before each push and pull."),
    c("stringChange", "Make the pull back as even as the push."),
  ],
  "triads.triad-rolls": [
    g("Play one sweep per click: up, back, up, back.", 0),
    c("heard", "Play the top note twice where the pick turns.", 0),
    c("extras", IN_USE),
    c("late", SWEEP_LATE),
    c("early", SWEEP_EARLY),
    c("stringChange", OWN_MOMENT),
    c("shift", "Move only the fingers whose notes change.", 1),
    c("lastBars", "Keep the last sweeps as even as the first."),
  ],
  "triads.four-chords-rock": [
    g("Move the fingers during each bar's last note.", 0),
    c("heard", EACH_ARRIVES),
    c("extras", TOP_THREE),
    c("late", NEW_SHAPE_LATE),
    c("early", SWEEP_EARLY),
    c("shift", "Make each move as small as it can be."),
    c("stringChange", OWN_MOMENT),
    c("lastBars", LAST_AS_FIRST),
  ],
  "triads.picked-turn": [
    g("Turn with the pick at both ends: one motion.", 0),
    c("heard", "Keep the stroke small at each turn.", 0),
    c("extras", TOP_THREE),
    c("late", "Put fret 14 on the G string on each click."),
    c("early", "Wait for the click before each fret 14."),
    c("stringChange", "Make each turn as small as the sweep."),
  ],

  // Step 2: turnaround
  "turnaround.major-loop": [
    g("Keep it one loop: never stop at the bottom.", 0),
    c("heard", EACH_ARRIVES),
    c("extras", TOP_THREE),
    c("late", TOP_HAMMER),
    c("early", TURN_EARLY),
    c("stringChange", "Turn at the G string without a pause.", 0),
  ],
  "turnaround.minor-mid": [
    g("One finger per note; the little finger hammers.", 0),
    c("heard", EACH_ARRIVES),
    c("extras", TOP_THREE),
    c("late", TOP_HAMMER),
    c("early", TURN_EARLY),
    c("stringChange", OWN_MOMENT),
  ],
  "turnaround.minor-high": [
    g("Reach the little finger to fret 17, or slide.", 0),
    c("heard", EACH_ARRIVES),
    c("extras", TOP_THREE),
    c("late", TOP_HAMMER),
    c("early", TURN_EARLY),
    c("stringChange", DOWN_AS_UP),
  ],

  // Step 3: phrases
  "phrases.sweep-then-scale": [
    g("Keep the run down as even as the sweep up.", 0),
    c("heard", "Pick every note of the run down."),
    c("extras", TOP_THREE),
    c("late", "Put the hammer to fret 17 right on beat two."),
    c("early", "Wait for beat two before the hammer."),
    c("afterHeld", "Count the held A and both rests, then go."),
    c("stringChange", "Pick the B string as the last pull-off ends.", 0),
    c("lastBars", "Hold the last A its full two beats."),
  ],
  "phrases.lick-to-bend": [
    g("Roll the index across fret 5, one string each.", 0),
    c("heard", "Press fret 5 as the pick reaches each string.", 0),
    c("extras", IN_USE),
    c("late", "Put the hammer to fret 8 right on beat two."),
    c("early", "Wait for beat two before the hammer."),
    c("afterHeld", "Count the bend's two beats and the rests."),
    c("stringChange", "Pick the G string right after the pull-off."),
    c("lastBars", "Hold the bend for its full two beats.", 1),
  ],
  "phrases.triad-pair": [
    g("One shape up, the other down, one per beat.", 0),
    c("heard", EACH_ARRIVES),
    c("extras", TOP_THREE),
    c("late", "Put the pull-off to 10 right on its beat."),
    c("early", "Wait for its beat before the pull-off to 10."),
    c("stringChange", OWN_MOMENT),
  ],
  "phrases.pickup-sweep": [g("Aim the sextuplet at the next downbeat.", 1)],

  // Step 4: qualities
  "qualities.minor-inversions": [
    g("Be on the new shape before each bar starts.", 0),
    c("heard", EACH_ARRIVES),
    c("extras", TOP_THREE),
    c("late", NEW_SHAPE_LATE),
    c("early", SWEEP_EARLY),
    c("shift", MOVE_ON_LAST),
    c("stringChange", OWN_MOMENT),
    c("lastBars", "Keep the fret-8 shape as even as the first."),
  ],
  "qualities.major-inversions": [
    g("Say E, G, C as each new shape starts.", 0),
    c("heard", EACH_ARRIVES),
    c("extras", TOP_THREE),
    c("late", NEW_SHAPE_LATE),
    c("early", SWEEP_EARLY),
    c("shift", MOVE_ON_LAST),
    c("stringChange", DOWN_AS_UP),
    c("lastBars", "Come back to the fret-12 shape on the click."),
  ],
  "qualities.dm-inversions": [
    g("Play two loops of each shape, then move.", 0),
    c("heard", "At fret 10, press only the string being picked.", 0),
    c("extras", TOP_THREE),
    c("late", NEW_SHAPE_LATE),
    c("early", SWEEP_EARLY),
    c("shift", MOVE_ON_LAST),
    c("stringChange", OWN_MOMENT),
    c("lastBars", "Keep the fret-10 roll even to the last note."),
  ],

  // Step 5: first-solo
  "first-solo.band-three": [
    g("Land each chord's first note with the band.", 0),
    c("heard", EACH_ARRIVES),
    c("extras", TOP_THREE),
    c("late", NEW_SHAPE_LATE),
    c("early", "Wait for the band's beat before each sweep."),
    c("shift", MOVE_ON_LAST),
    c("stringChange", OWN_MOMENT),
    c("lastBars", LAST_AS_FIRST),
  ],
  "first-solo.minor-cadence": [
    g("Put G sharp on the G string's fret 13 for E.", 1),
    c("heard", EACH_ARRIVES),
    c("extras", TOP_THREE),
    c("late", NEW_SHAPE_LATE),
    c("early", SWEEP_EARLY),
    c("shift", "Reach for the nearest shape, a fret or two.", 0),
    c("stringChange", OWN_MOMENT),
    c("lastBars", "Land the last A minor right on the click."),
  ],
  "first-solo.first-etude": [
    g("Give the held high A its full three beats.", 1),
    c("heard", "Hammer the high A firmly and let it ring.", 0),
    c("extras", TOP_THREE),
    c("late", NEW_SHAPE_LATE),
    c("early", SWEEP_EARLY),
    c("afterHeld", "Count the held A's three beats, then go.", 1),
    c("shift", MOVE_ON_LAST),
    c("stringChange", OWN_MOMENT),
    c("lastBars", "Hammer the high A right on beat two.", 0),
  ],

  // ── Intermediate ──────────────────────────────────────────────────────

  // Step 6: four-strings
  "four-strings.c-four": [
    g("Turn at fret 10 on the D string: up, then down.", 0),
    c("heard", EACH_ARRIVES),
    c("extras", FOUR_ONLY),
    c("late", TOP_HAMMER),
    c("early", TURN_EARLY),
    c("stringChange", OWN_MOMENT),
  ],
  "four-strings.am-four": [
    g("Roll fret 14 from the D string to the G.", 0),
    c("heard", "Press fret 14 only on the string being picked.", 0),
    c("extras", FOUR_ONLY),
    c("late", TOP_HAMMER),
    c("early", TURN_EARLY),
    c("stringChange", OWN_MOMENT),
  ],
  "four-strings.g-four": [
    g("Roll fret 12 over three strings, one by one.", 0),
    c("heard", "Press fret 12 only on the string being picked.", 0),
    c("extras", FOUR_ONLY),
    c("late", TOP_HAMMER),
    c("early", TURN_EARLY),
    c("stringChange", "Have the first finger on fret 10 for the top.", 0),
  ],
  "four-strings.changes-four": [
    g("Have each new shape ready as each bar starts.", 0),
    c("heard", EACH_ARRIVES),
    c("extras", FOUR_ONLY),
    c("late", NEW_SHAPE_LATE),
    c("early", SWEEP_EARLY),
    c("shift", MOVE_ON_LAST, 0),
    c("stringChange", OWN_MOMENT),
    c("lastBars", "Roll fret 12 one string at a time in the G."),
  ],

  // Step 7: five-strings
  "five-strings.am-five": [
    g("Hammer the top note right on beat three.", 0),
    c("heard", "Press fret 14 one string at a time."),
    c("extras", FIVE_ONLY),
    c("late", LOOP_A_LATE),
    c("early", TOP_THREE_EARLY),
    c("stringChange", OWN_MOMENT),
  ],
  "five-strings.c-five": [
    g("Slide the little finger from fret 10 to 15.", 0),
    c("heard", "Pick the D string firmly after the slide."),
    c("extras", FIVE_ONLY),
    c("late", "Put the slide's start right on the click."),
    c("early", TOP_THREE_EARLY),
    c("shift", "Land the index at fret 12 as you slide.", 0),
    c("stringChange", OWN_MOMENT),
  ],
  "five-strings.g-five": [
    g("Use the two-note rest to reset the hand.", 0),
    c("heard", EACH_ARRIVES),
    c("extras", FIVE_ONLY),
    c("late", LOOP_A_LATE),
    c("early", REST_EARLY),
    c("stringChange", OWN_MOMENT),
  ],
  "five-strings.em-five": [
    g("Slide from fret 7 to 12 on the top string.", 0),
    c("heard", "Slide back to fret 7 firmly enough to hear it."),
    c("extras", FIVE_ONLY),
    c("late", LOOP_A_LATE),
    c("early", "Wait for beat three to arrive at fret 12."),
    c("shift", "Move the hand with the slide to fret 12.", 0),
    c("stringChange", OWN_MOMENT),
  ],

  // Step 8: five-e-shape
  "five-e-shape.am-e-shape": [
    g("Roll fret 5 so one note sounds at a time.", 0),
    c("heard", "Press fret 5 only on the string being picked.", 0),
    c("extras", FIVE_ONLY),
    c("late", LOOP_A_LATE),
    c("early", REST_EARLY),
    c("stringChange", OWN_MOMENT),
  ],
  "five-e-shape.c-e-shape": [
    g("Reach fret 12 with the hammer from fret 8.", 0),
    c("heard", "Press fret 8 only on the string being picked."),
    c("extras", FIVE_ONLY),
    c("late", LOOP_A_LATE),
    c("early", REST_EARLY),
    c("stringChange", OWN_MOMENT),
  ],
  "five-e-shape.tap-octave": [
    g("Tap 17, pull off to 12, sweep back down.", 0),
    c("heard", "Tap fret 17 firmly enough to hear it."),
    c("extras", FIVE_ONLY),
    c("late", TAP_LATE),
    c("early", TAP_EARLY),
    c("stringChange", OWN_MOMENT),
  ],
  "five-e-shape.e-shape-tap": [
    g("Keep the little finger on fret 8 as you tap.", 0),
    c("heard", "Tap fret 12 firmly enough to hear it."),
    c("extras", FIVE_ONLY),
    c("late", TAP_LATE),
    c("early", TAP_EARLY),
    c("stringChange", OWN_MOMENT),
  ],
  "five-e-shape.a-and-e": [
    g("Drop the index to fret 10 for D minor.", 0),
    c("heard", EACH_ARRIVES),
    c("extras", FIVE_ONLY),
    c("late", NEW_SHAPE_LATE),
    c("early", SWEEP_EARLY),
    c("shift", "Move the index two frets as each chord starts."),
    c("stringChange", OWN_MOMENT),
    c("lastBars", "Use the rest to get back to fret 12.", 0),
  ],

  // Step 9: moving-shapes
  "moving-shapes.am-two-shapes": [
    g("Use the rest to throw the hand up to fret 12.", 0),
    c("heard", AFTER_JUMP),
    c("extras", FIVE_ONLY),
    c("late", NEW_SHAPE_LATE),
    c("early", SWEEP_EARLY),
    c("shift", "Jump up during the rest, back on the last note.", 0),
    c("stringChange", OWN_MOMENT),
    c("lastBars", "Head back down to fret 5 from the last note."),
  ],
  "moving-shapes.am-dm": [
    g("Make the seven-fret move in one throw.", 0),
    c("heard", AFTER_JUMP),
    c("extras", FIVE_ONLY),
    c("late", NEW_SHAPE_LATE),
    c("early", SWEEP_EARLY),
    c("shift", "Look at the new fret before you move."),
    c("stringChange", OWN_MOMENT),
    c("lastBars", "Slide the top note from fret 5 to 10 and back.", 0),
  ],
  "moving-shapes.am-f-c-g": [
    g("Use the rests in F and G to move.", 0),
    c("heard", EACH_ARRIVES),
    c("extras", FIVE_ONLY),
    c("late", NEW_SHAPE_LATE),
    c("early", SWEEP_EARLY),
    c("shift", "Move in the rest, or on the last note.", 0),
    c("stringChange", OWN_MOMENT),
    c("lastBars", "Use the G's rest to get back to A minor."),
  ],
  "moving-shapes.turn-in-the-middle": [
    g("Sing the top note of each shape as you go.", 0),
    c("heard", EACH_ARRIVES),
    c("extras", FOUR_ONLY),
    c("late", TOP_HAMMER),
    c("early", TURN_EARLY),
    c("shift", MOVE_ON_LAST),
    c("stringChange", OWN_MOMENT),
    c("lastBars", "Reach fret 17 on top in the last chord."),
  ],

  // ── Warm-ups (all three Levels) ───────────────────────────────────────
  "warmup-beginner.triads-around": [
    g(WELL_UNDER, 0),
    c("heard", ONE_BY_ONE),
    c("late", SWEEP_LATE),
    c("early", SWEEP_EARLY),
    c("shift", MOVE_AT_START, 1),
    c("stringChange", OWN_MOMENT),
    c("lastBars", SEPARATE_TO_END),
  ],
  "warmup-intermediate.progression-of-the-day": [
    g("Keep your place by ear, not by counting.", 1),
    c("heard", ONE_BY_ONE),
    c("late", SWEEP_LATE),
    c("early", SWEEP_EARLY),
    c("shift", MOVE_AT_START),
    c("stringChange", OWN_MOMENT),
    c("lastBars", SEPARATE_TO_END),
  ],
  "warmup-advanced.big-round": [
    g("Keep every note separate, however easy.", 1),
    c("heard", ONE_BY_ONE),
    c("late", SWEEP_LATE),
    c("early", SWEEP_EARLY),
    c("shift", MOVE_AT_START),
    c("stringChange", OWN_MOMENT),
    c("lastBars", END_AS_START),
  ],

  // ── cues13b: Intermediate Steps 10 to 14, then Advanced, from here ─────
};
