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
// cues13b: the link (the first note of a new shape, hammered, pulled or slid on the same string).
const LINK_HEARD = "Sound the link note firmly, fretting hand only.";
const LINK_LATE = "Land the link note right on beat one.";
const LINK_EARLY = "Wait for beat one before the link note.";
const CROSS_AFTER_LINK = "Let the link note sound before you pick again.";
const HELD_THEN_LINK = "Count the held note's two beats, then link.";
const LAST_TWO_BEATS = "Count the last note's two beats, then go round.";
// cues13b: loops whose top note is a hammer in some bars and a slide in others.
const TOP_NOTE_LATE = "Put the top note on beats two and four.";
const TOP_NOTE_EARLY = "Wait for beats two and four to reach the top.";
const REST_MOVE = "Use the two-note rests to move.";
// cues13b: Advanced.
const ONE_PER_STRING = "Pick each string once each way, no more.";
const THREE_TO_TWO = "Keep three even notes to every two clicks.";
const TWO_LOOPS_EACH = "Play two loops of each, then move on the click.";
const HELD_E_COUNT = "Count the held E's two beats, then go round.";
const HELD_E_LAND = "Land the held E right on beat three.";
const SWAP_ONE = "Swap one bar for a line of your own.";

export const SWEEP_PICKING_CUES: CueBook = {
  // ── Beginner ──────────────────────────────────────────────────────────

  // Step 1: triads
  "triads.two-string-push": [
    g("Push through both strings in one motion.", 0),
    c("heard", "Let each of the two notes sound in turn.", 0),
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
    c("lastBars", SEPARATE_TO_END),
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
    c("stringChange", "Turn at each end without a pause."),
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
    g("Use one finger per note, no rolling.", 0),
    c("heard", EACH_ARRIVES),
    c("extras", TOP_THREE),
    c("late", TOP_HAMMER),
    c("early", TURN_EARLY),
    c("stringChange", OWN_MOMENT),
  ],
  "turnaround.minor-high": [
    g("Reach the little finger to fret 17.", 0),
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
    c("lastBars", "Land the last A right on beat one."),
  ],
  "phrases.lick-to-bend": [
    g("Roll the index across fret 5, one string each.", 0),
    c("heard", "Press fret 5 as the pick reaches each string.", 0),
    c("extras", IN_USE),
    c("late", "Put the hammer to fret 8 right on beat two."),
    c("early", "Wait for beat two before the hammer."),
    c("afterHeld", "Count the bend's two beats and the rests."),
    c("stringChange", "Pick the G string after the second pull-off."),
    c("lastBars", "Land the bend's note right on beat one.", 1),
  ],
  "phrases.triad-pair": [
    g("One shape up, the other down, one per beat.", 0),
    c("heard", EACH_ARRIVES),
    c("extras", TOP_THREE),
    c("late", "Pull off to fret 10 on beats two and four."),
    c("early", "Wait for beats two and four to pull off."),
    c("stringChange", OWN_MOMENT),
  ],
  "phrases.pickup-sweep": [g("Aim the sextuplet at the next downbeat.", 1)],

  // Step 4: qualities
  "qualities.minor-inversions": [
    g("Know where the next shape sits before you go.", 0),
    c("heard", EACH_ARRIVES),
    c("extras", TOP_THREE),
    c("late", NEW_SHAPE_LATE),
    c("early", SWEEP_EARLY),
    c("shift", MOVE_ON_LAST),
    c("stringChange", OWN_MOMENT),
    c("lastBars", "Keep the last shape as even as the first."),
  ],
  "qualities.major-inversions": [
    g("Start each new shape on its lowest note.", 0),
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
    c("heard", EACH_ARRIVES),
    c("extras", TOP_THREE),
    c("late", NEW_SHAPE_LATE),
    c("early", SWEEP_EARLY),
    c("shift", MOVE_ON_LAST),
    c("stringChange", OWN_MOMENT),
    c("lastBars", "Keep the fret-10 roll even to the last note."),
  ],

  // Step 5: first-solo
  "first-solo.band-three": [
    g("Play two loops of each chord with the band.", 0),
    c("heard", EACH_ARRIVES),
    c("extras", TOP_THREE),
    c("late", NEW_SHAPE_LATE),
    c("early", SWEEP_EARLY),
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
    c("shift", "Keep each shape close to the last one.", 0),
    c("stringChange", OWN_MOMENT),
    c("lastBars", "Land the last A minor right on the click."),
  ],
  "first-solo.first-etude": [
    g("Play two loops of each shape, then the long A.", 0),
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
    c("heard", EACH_ARRIVES),
    c("extras", FOUR_ONLY),
    c("late", TOP_HAMMER),
    c("early", TURN_EARLY),
    c("stringChange", OWN_MOMENT),
  ],
  "four-strings.g-four": [
    g("Roll fret 12 over three strings, one by one.", 0),
    c("heard", EACH_ARRIVES),
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
    c("heard", "Slide all the way to fret 15 and press.", 0),
    c("extras", FIVE_ONLY),
    c("late", "Put the slide's start right on the click."),
    c("early", TOP_THREE_EARLY),
    c("shift", "Land the index at fret 12 as you slide.", 0),
    c("stringChange", OWN_MOMENT),
  ],
  "five-strings.g-five": [
    g("Turn at the bottom with the pick alone.", 0),
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
    c("shift", "Land the hand at fret 12 as the slide ends.", 0),
    c("stringChange", OWN_MOMENT),
  ],

  // Step 8: five-e-shape
  "five-e-shape.am-e-shape": [
    g("Roll fret 5 so one note sounds at a time.", 0),
    c("heard", EACH_ARRIVES),
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
    g("Pull off to fret 12 right after the tap.", 0),
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
    c("shift", "Move the index two frets between the chords."),
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
    c("shift", "Jump back down on the last note.", 0),
    c("stringChange", OWN_MOMENT),
    c("lastBars", "Keep the fret-12 loop as even as the first."),
  ],
  "moving-shapes.am-dm": [
    g("Make the seven-fret move in one throw.", 0),
    c("heard", AFTER_JUMP),
    c("extras", FIVE_ONLY),
    c("late", NEW_SHAPE_LATE),
    c("early", SWEEP_EARLY),
    c("shift", MOVE_ON_LAST),
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
    c("lastBars", "Be back on fret 12 as the loop starts again."),
  ],
  "moving-shapes.turn-in-the-middle": [
    g("Start each new shape right on beat one."),
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
    c("lastBars", END_AS_START),
  ],
  "warmup-intermediate.progression-of-the-day": [
    g("Keep your place by ear, not by counting.", 1),
    c("heard", ONE_BY_ONE),
    c("late", SWEEP_LATE),
    c("early", SWEEP_EARLY),
    c("shift", MOVE_AT_START),
    c("stringChange", OWN_MOMENT),
    c("lastBars", END_AS_START),
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

  // Step 10: the-link
  "the-link.link-alone": [
    g("Make the link note with the fretting hand.", 0),
    c("heard", LINK_HEARD, 0),
    c("extras", IN_USE),
    c("late", LINK_LATE),
    c("early", LINK_EARLY),
    c("shift", MOVE_AT_START),
    c("stringChange", CROSS_AFTER_LINK, 0),
    c("lastBars", LAST_TWO_BEATS),
  ],
  "the-link.two-shapes": [
    g("Play it as one gesture, link in the middle.", 1),
    c("heard", LINK_HEARD, 1),
    c("extras", IN_USE),
    c("late", LINK_LATE),
    c("early", LINK_EARLY),
    c("afterHeld", HELD_THEN_LINK, 0),
    c("shift", MOVE_AT_START),
    c("stringChange", CROSS_AFTER_LINK, 1),
    c("lastBars", LAST_TWO_BEATS),
  ],
  "the-link.round-the-loop": [
    g("Go straight into each new loop, no stop.", 1),
    c("heard", EACH_ARRIVES),
    c("extras", IN_USE),
    c("late", "Start each new loop right on beat one."),
    c("early", "Wait for beat one before each new loop."),
    c("shift", MOVE_AT_START),
    c("stringChange", THREE_TO_TWO, 0),
    c("lastBars", END_AS_START),
  ],

  // Step 11: link-chains
  "link-chains.one-pass-each": [
    g("Keep each link to the smallest move you can.", 1),
    c("heard", LINK_HEARD),
    c("extras", IN_USE),
    c("late", LINK_LATE),
    c("early", LINK_EARLY),
    c("afterHeld", HELD_THEN_LINK, 0),
    c("shift", MOVE_AT_START, 1),
    c("stringChange", CROSS_AFTER_LINK),
    c("lastBars", LAST_TWO_BEATS),
  ],
  "link-chains.looped-chain": [
    g("Play it as one gesture, not four pieces.", 0),
    c("heard", EACH_ARRIVES),
    c("extras", IN_USE),
    c("late", NEW_SHAPE_LATE),
    c("early", SWEEP_EARLY),
    c("shift", MOVE_AT_START),
    c("stringChange", OWN_MOMENT),
    c("lastBars", "Go round from the last loop with no gap."),
  ],
  "link-chains.start-anywhere": [
    g("Find the first note before the count-in.", 0),
    c("heard", EACH_ARRIVES),
    c("extras", IN_USE),
    c("late", NEW_SHAPE_LATE),
    c("early", SWEEP_EARLY),
    c("shift", MOVE_AT_START),
    c("stringChange", OWN_MOMENT),
    c("lastBars", END_AS_START),
  ],

  // Step 12: minor-progressions
  "minor-progressions.the-pull": [
    g("Move only the fingers whose notes change.", 1),
    c("heard", EACH_ARRIVES),
    c("extras", TOP_THREE),
    c("late", TOP_HAMMER),
    c("early", TURN_EARLY),
    c("shift", MOVE_AT_START),
    c("stringChange", OWN_MOMENT),
    c("lastBars", LAST_AS_FIRST),
  ],
  "minor-progressions.with-the-v-three": [
    g("Play two loops, then change right on beat one.", 0),
    c("heard", EACH_ARRIVES),
    c("extras", IN_USE),
    c("late", TOP_HAMMER),
    c("early", TURN_EARLY),
    c("shift", MOVE_AT_START),
    c("stringChange", OWN_MOMENT),
    c("lastBars", END_AS_START),
  ],
  "minor-progressions.linked-with-the-v": [
    g("One note per click, and link at each end.", 0),
    c("heard", LINK_HEARD),
    c("extras", IN_USE),
    c("late", LINK_LATE),
    c("early", LINK_EARLY),
    c("shift", "Let the link carry the hand to its new place."),
    c("stringChange", CROSS_AFTER_LINK),
    c("lastBars", "Keep the last pass as even as the first."),
  ],
  "minor-progressions.minor-two-five-one": [
    g(TWO_LOOPS_EACH, 0),
    c("heard", EACH_ARRIVES),
    c("extras", IN_USE),
    c("late", SWEEP_LATE),
    c("early", SWEEP_EARLY),
    c("shift", MOVE_AT_START),
    c("stringChange", OWN_MOMENT),
    c("lastBars", END_AS_START),
  ],

  // Step 13: long-chains
  "long-chains.chain-four": [
    g("Start each new loop as near the last as you can.", 0),
    c("heard", EACH_ARRIVES),
    c("extras", IN_USE),
    c("late", SWEEP_LATE),
    c("early", SWEEP_EARLY),
    c("shift", MOVE_AT_START, 1),
    c("stringChange", OWN_MOMENT),
    c("lastBars", END_AS_START),
  ],
  "long-chains.chain-five": [
    g("Keep every note separate in the big loops.", 0),
    c("heard", EACH_ARRIVES),
    c("extras", IN_USE),
    c("late", SWEEP_LATE),
    c("early", TOP_THREE_EARLY),
    c("shift", MOVE_AT_START),
    c("stringChange", OWN_MOMENT),
    c("lastBars", END_AS_START),
  ],
  "long-chains.mixed-lengths": [
    g("Keep the triplets even as the loops change size.", 0),
    c("heard", EACH_ARRIVES),
    c("extras", IN_USE),
    c("late", SWEEP_LATE),
    c("early", SWEEP_EARLY),
    c("shift", MOVE_AT_START),
    c("stringChange", OWN_MOMENT),
    c("lastBars", END_AS_START),
  ],

  // Step 14: over-the-progression
  "over-the-progression.band-four": [
    g("Play two loops a bar, locked to the band.", 0),
    c("heard", EACH_ARRIVES),
    c("extras", FOUR_ONLY),
    c("late", TOP_NOTE_LATE),
    c("early", TOP_NOTE_EARLY),
    c("shift", MOVE_ON_LAST),
    c("stringChange", OWN_MOMENT),
    c("lastBars", LAST_AS_FIRST),
  ],
  "over-the-progression.band-five": [
    g("Keep it slow enough that every note is separate."),
    c("heard", EACH_ARRIVES),
    c("extras", FIVE_ONLY),
    c("late", LOOP_A_LATE),
    c("early", REST_EARLY),
    c("shift", REST_MOVE, 0),
    c("stringChange", OWN_MOMENT),
    c("lastBars", "Use the last rest to get back to fret 12."),
  ],
  "over-the-progression.etude": [
    g("Learn it two bars at a time, then join them.", 1),
    c("heard", EACH_ARRIVES),
    c("extras", FIVE_ONLY),
    c("late", NEW_SHAPE_LATE),
    c("early", SWEEP_EARLY),
    c("afterHeld", "Count the held A's two beats, then go round."),
    c("shift", MOVE_ON_LAST),
    c("stringChange", OWN_MOMENT),
    c("lastBars", "Hammer the high A right on beat three.", 0),
  ],
  "over-the-progression.your-chorus": [g(SWAP_ONE, 0)],

  // ── Advanced ──────────────────────────────────────────────────────────

  // Step 15: six-strings
  "six-strings.minor-six": [
    g("Hammer on the low E and on the top string.", 0),
    c("heard", EACH_ARRIVES),
    c("extras", ONE_PER_STRING),
    c("late", SWEEP_LATE),
    c("early", REST_EARLY),
    c("stringChange", OWN_MOMENT),
  ],
  "six-strings.major-six": [
    g("Turn at the bottom with the pick alone.", 0),
    c("heard", EACH_ARRIVES),
    c("extras", ONE_PER_STRING),
    c("late", SWEEP_LATE),
    c("early", SWEEP_EARLY),
    c("shift", "Keep the hand in one place for the whole loop."),
    c("stringChange", OWN_MOMENT),
  ],
  "six-strings.six-string-links": [
    g("Keep the link moving: no stop between passes.", 1),
    c("heard", LINK_HEARD),
    c("extras", IN_USE),
    c("late", LINK_LATE),
    c("early", LINK_EARLY),
    c("shift", MOVE_AT_START),
    c("stringChange", THREE_TO_TWO, 0),
    c("lastBars", END_AS_START),
  ],

  // Step 16: six-string-changes
  "six-string-changes.minor-into-major": [
    g("Start the major bar on the note you ended on.", 1),
    c("heard", EACH_ARRIVES),
    c("extras", ONE_PER_STRING),
    c("late", NEW_SHAPE_LATE),
    c("early", REST_EARLY),
    c("shift", "Drop the index two frets for the top string.", 2),
    c("stringChange", OWN_MOMENT),
    c("lastBars", "Use the last rest to get back to the start."),
  ],
  "six-string-changes.four-chords-six": [
    g("Leave the first chord early for the long move.", 1),
    c("heard", AFTER_JUMP),
    c("extras", ONE_PER_STRING),
    c("late", NEW_SHAPE_LATE),
    c("early", REST_EARLY),
    c("shift", "Move in the rest at the end of each bar."),
    c("stringChange", OWN_MOMENT),
    c("lastBars", "Drop back to the first shape in the last rest.", 3),
  ],
  "six-string-changes.big-meets-small": [
    g("Join the big shape to the small one, no gap."),
    c("heard", EACH_ARRIVES),
    c("extras", IN_USE),
    c("late", NEW_SHAPE_LATE),
    c("early", SWEEP_EARLY),
    c("shift", "Move down one fret as the pick skips a string.", 3),
    c("stringChange", OWN_MOMENT),
    c("lastBars", "Rest one full beat before going round.", 2),
  ],

  // Step 17: fast-shifts
  "fast-shifts.octave-jump": [
    g("Make the jump in the time of one note."),
    c("heard", AFTER_JUMP, 0),
    c("extras", IN_USE),
    c("late", "Land the first note after the jump on the click."),
    c("early", SWEEP_EARLY),
    c("shift", "Leave each loop's last note early to jump.", 0),
    c("stringChange", OWN_MOMENT),
    c("lastBars", "Drop back down right after the last note."),
  ],
  "fast-shifts.inversion-runs": [g("Learn each beat alone, then join them up.", 0)],
  "fast-shifts.big-shape-jumps": [
    g("Switch from three to four notes per click.", 0),
    c("heard", EACH_ARRIVES),
    c("extras", IN_USE),
    c("late", "Put the first sixteenth right on the click."),
    c("early", "Wait for the click before the sixteenths."),
    c("shift", MOVE_AT_START),
    c("stringChange", OWN_MOMENT),
    c("lastBars", "Keep the sixteenths even to the last note."),
  ],

  // Step 18: neoclassical
  "neoclassical.diminished-resolves": [
    g("Move the whole shape up three frets, same notes.", 0),
    c("heard", EACH_ARRIVES),
    c("extras", TOP_THREE),
    c("late", TOP_HAMMER),
    c("early", TURN_EARLY),
    c("shift", MOVE_ON_LAST),
    c("stringChange", OWN_MOMENT),
    c("lastBars", "Land the last A minor right on the click.", 1),
  ],
  "neoclassical.i-iv-dim-i": [
    g(TWO_LOOPS_EACH, 0),
    c("heard", EACH_ARRIVES),
    c("extras", IN_USE),
    c("late", TOP_HAMMER),
    c("early", TURN_EARLY),
    c("shift", MOVE_AT_START),
    c("stringChange", OWN_MOMENT),
    c("lastBars", LAST_AS_FIRST),
  ],
  "neoclassical.diminished-ladder": [
    g("Climb three frets at a time, same shape.", 0),
    c("heard", EACH_ARRIVES),
    c("extras", IN_USE),
    c("late", NEW_SHAPE_LATE),
    c("early", SWEEP_EARLY),
    c("shift", MOVE_ON_LAST),
    c("stringChange", OWN_MOMENT),
    c("lastBars", "Keep the highest shape as even as the first."),
  ],
  "neoclassical.walking-triads": [
    g("Start each new shape right on beat one."),
    c("heard", EACH_ARRIVES),
    c("extras", IN_USE),
    c("late", NEW_SHAPE_LATE),
    c("early", SWEEP_EARLY),
    c("shift", MOVE_ON_LAST),
    c("stringChange", OWN_MOMENT),
    c("lastBars", "Keep the last shape as even as the first."),
  ],
  "neoclassical.linked-phrase": [
    g("Link into E major with the pull-off, no pick.", 0),
    c("heard", LINK_HEARD),
    c("extras", FIVE_ONLY),
    c("late", LOOP_A_LATE),
    c("early", SWEEP_EARLY),
    c("afterHeld", "Count the held A and both rests, then go.", 0),
    c("stringChange", OWN_MOMENT),
    c("lastBars", "Land the last A right on beat one."),
  ],

  // Step 19: advanced-etude
  "advanced-etude.part-one": [
    g("Play the big shapes and small ones as one line."),
    c("heard", EACH_ARRIVES),
    c("extras", IN_USE),
    c("late", NEW_SHAPE_LATE),
    c("early", SWEEP_EARLY),
    c("shift", "Move one fret as the pick skips the D string.", 3),
    c("stringChange", OWN_MOMENT),
    c("lastBars", "Climb three frets on beat three, then go round.", 3),
  ],
  "advanced-etude.part-two": [
    g("Count the beat of rest before the last sweep."),
    c("heard", EACH_ARRIVES),
    c("extras", IN_USE),
    c("late", NEW_SHAPE_LATE),
    c("early", REST_EARLY),
    c("afterHeld", HELD_E_COUNT, 3),
    c("shift", "Move the index down three frets for A minor.", 1),
    c("stringChange", OWN_MOMENT),
    c("lastBars", HELD_E_LAND, 3),
  ],
  "advanced-etude.both-parts": [
    g("Practise the join in the middle alone first.", 1),
    c("heard", EACH_ARRIVES),
    c("extras", IN_USE),
    c("late", NEW_SHAPE_LATE),
    c("early", SWEEP_EARLY),
    c("afterHeld", HELD_E_COUNT, 2),
    c("shift", "Move up one fret at the join in the middle.", 1),
    c("stringChange", OWN_MOMENT),
    c("lastBars", HELD_E_LAND),
  ],
  "advanced-etude.with-the-band": [
    g("Start at a tempo where you can look up.", 0),
    c("heard", EACH_ARRIVES),
    c("extras", IN_USE),
    c("late", "Lock the first note of each shape to the band.", 1),
    c("early", SWEEP_EARLY),
    c("afterHeld", HELD_E_COUNT),
    c("shift", MOVE_ON_LAST),
    c("stringChange", OWN_MOMENT),
    c("lastBars", HELD_E_LAND),
  ],

  // Step 20: over-a-heavy-band
  "over-a-heavy-band.band-big-chain": [
    g("Lock the first note of each loop to the kick.", 1),
    c("heard", EACH_ARRIVES),
    c("extras", IN_USE),
    c("late", SWEEP_LATE),
    c("early", SWEEP_EARLY),
    c("shift", MOVE_AT_START),
    c("stringChange", OWN_MOMENT),
    c("lastBars", END_AS_START),
  ],
  "over-a-heavy-band.band-six-links": [
    g("Keep three even notes across every two beats.", 1),
    c("heard", LINK_HEARD),
    c("extras", IN_USE),
    c("late", LINK_LATE),
    c("early", LINK_EARLY),
    c("shift", MOVE_AT_START),
    c("stringChange", OWN_MOMENT),
    c("lastBars", END_AS_START),
  ],
  "over-a-heavy-band.your-solo": [g(SWAP_ONE, 0)],
};
