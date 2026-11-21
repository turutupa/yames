/**
 * Legato: one thing to try, per Exercise (leg cues7, 2026-11-20).
 *
 * Shaped as `alternate-picking-cues.ts` (the worked example for
 * `plans/coach/CUES_GUIDE.md`): one general cue per Exercise (said before its
 * first Take, after an ungraded one, and as its evenness cue) and one cue for
 * each other trigger it can produce. `more` points at the how-to line the cue
 * comes from.
 *
 * What a legato teacher says: where to count (the hammered note on its own
 * 'and', not rushing after the pick), which note of the group to aim at (the
 * picked one on the click, the last pull-off sounded), which finger to have
 * ready (down before the pick, on the next string early). The app hears when a
 * note sounded and which pitch; it does not hear whether a note was hammered
 * or picked, nor finger strength, tension or tone, so no cue says it did.
 * "Hammer hard enough to hear the note" is plain teaching, used sparingly.
 * Exercises that change key or string between Takes get cues that name no
 * fret, string or note.
 */
import type { Cue, CueTrigger } from "../format";
import type { CueBook } from "../spec";

const c = (when: CueTrigger, say: string, more?: number): Cue => (more === undefined ? { when, say } : { when, say, more });
/** The general cue: said with nothing measured, and when evenness decided a Take. */
const g = (say: string, more?: number): Cue => ({ ...c("even", say, more), general: true });

// Shared orders, word for word, so each is translated once.
const PICK_LATE = "Put each picked note right on the click.";
const BEAT_PICK_LATE = "Put each beat's picked note on the click.";
const HAMMER_EARLY = "Place each hammer-on on its count, not before.";
const PULL_EARLY = "Let the pulled note wait for its 'and'.";
const SPREAD_THREE = "Spread the three notes evenly to the next pick.";
const HAMMER_HEAR = "Hammer hard enough to hear the note.";
const PULL_FLICK = "Flick the finger toward the floor as you pull.";
const PULL_CLEAR = "Pull off without catching the next string.";
const FIRST_ON_FIVE = "Keep the first finger on fret 5 throughout.";
const LIFT_LEAVE = "Lift each string's fingers as you leave it.";
const FIRST_NEXT = "Have the first finger on the next string early.";
const NEXT_STRING_KNOW = "Know the next string before each pair starts.";
const HELD_BEAT = "Count the long note's beat, then start again.";
const HELD_TWO = "Count the long note's two beats, then go.";
const LAND_HOLD = "Land the last note on its beat and hold it.";
const SAME_AND_HAMMER = "Hammer on the same 'and' you picked on.";
const SAME_AND_PULL = "Pull off on the same 'and' you picked on.";
const GROUP_NOTES = "Say the group's three notes before you start.";
const SHIFT_ON_PICK = "Move the hand on the picked note, not after.";
const PAIRS_TOP = "Keep the pairs even right to the top.";

export const LEGATO_CUES: CueBook = {
  // Level 1 · Step 1: first hammer-ons
  "first-hammers.pick-then-hammer": [
    g("Hammer on the 'and', just where you picked it.", 1),
    c("heard", HAMMER_HEAR),
    c("extras", "Keep the first finger down as you hammer."),
    c("notes", "Hammer exactly two frets above the first finger."),
    c("late", PICK_LATE),
    c("early", HAMMER_EARLY, 1),
    c("lastBars", SAME_AND_HAMMER),
  ],
  "first-hammers.hammer-each-finger": [
    g("Hammer the little finger from the same height.", 1),
    c("heard", "Hammer fret 8 with the little finger's tip."),
    c("extras", FIRST_ON_FIVE, 0),
    c("late", "Put each fret 5 right on the click."),
    c("early", HAMMER_EARLY),
    c("lastBars", SAME_AND_HAMMER),
  ],
  "first-hammers.hammer-tune": [
    g("One pick, one hammer-on on every string.", 0),
    c("heard", "Hammer each string's upper note firmly."),
    c("extras", LIFT_LEAVE),
    c("notes", "Little finger on the B string, third elsewhere.", 1),
    c("late", PICK_LATE),
    c("early", HAMMER_EARLY),
    c("afterHeld", HELD_BEAT),
    c("stringChange", FIRST_NEXT),
    c("lastBars", LAND_HOLD, 1),
  ],

  // Level 1 · Step 2: first pull-offs
  "first-pulls.pick-then-pull": [
    g("Pull off on the 'and', just where you picked it.", 0),
    c("heard", PULL_FLICK, 1),
    c("extras", PULL_CLEAR),
    c("notes", "Keep the lower finger down before you pull.", 0),
    c("late", PICK_LATE),
    c("early", PULL_EARLY),
    c("lastBars", SAME_AND_PULL),
  ],
  "first-pulls.pull-each-finger": [
    g("Have the pulling finger down before you pick.", 1),
    c("heard", "Flick each finger toward the floor to pull."),
    c("extras", FIRST_ON_FIVE, 0),
    c("late", PICK_LATE),
    c("early", PULL_EARLY),
    c("lastBars", SAME_AND_PULL),
  ],
  "first-pulls.pull-to-open": [
    g("Pick the fretted note, pull to the open string.", 0),
    c("heard", "Flick off firmly so the open string sounds.", 1),
    c("extras", PULL_CLEAR, 1),
    c("notes", "Second finger at fret two, third at fret three.", 1),
    c("late", "Put each fretted note right on the click."),
    c("early", "Let each open note wait for its 'and'."),
    c("afterHeld", "Count the last open E's beat, then go again."),
    c("openString", "Have the next fret ready as the open rings."),
    c("stringChange", NEXT_STRING_KNOW),
    c("lastBars", "Finish on the open top E and let it ring.", 0),
  ],
  "first-pulls.pull-tune": [
    g("One pick, one pull-off on every string.", 0),
    c("heard", "Have the first finger down before each pull."),
    c("extras", PULL_CLEAR),
    c("notes", "Little finger on the top two strings only.", 1),
    c("late", PICK_LATE),
    c("early", PULL_EARLY),
    c("afterHeld", HELD_BEAT),
    c("stringChange", "Lay the first finger on the next string early.", 1),
    c("lastBars", LAND_HOLD, 0),
  ],

  // Level 1 · Step 3: hammer and pull together
  "hammer-and-pull.slow-trill": [
    g("Keep the upper finger close to the string.", 1),
    c("heard", HAMMER_HEAR),
    c("extras", "Keep the lower note fretted the whole time.", 1),
    c("notes", "Trill between the same two notes only."),
    c("late", PICK_LATE),
    c("early", "Count every 'and' through the trill."),
    c("lastBars", "Trill in the same eighths you just picked.", 0),
  ],
  "hammer-and-pull.triplet-up": [
    g("Pick once, then hammer twice, all in one beat.", 0),
    c("heard", "Leave each finger down as the next one lands.", 1),
    c("extras", "Lift both fingers together just before the pick.", 1),
    c("notes", GROUP_NOTES),
    c("late", BEAT_PICK_LATE),
    c("early", SPREAD_THREE),
    c("lastBars", "Hammer the triplets in the picked rhythm."),
  ],
  "hammer-and-pull.triplet-down": [
    g("Have every finger down before the pick.", 1),
    c("heard", "Pull the second pull-off as firmly as the first."),
    c("extras", PULL_CLEAR),
    c("notes", GROUP_NOTES),
    c("late", BEAT_PICK_LATE),
    c("early", SPREAD_THREE),
    c("lastBars", "Pull the triplets in the picked rhythm."),
  ],
  "hammer-and-pull.triplet-tune": [
    g("Hammer up, pull down, one pick each beat.", 0),
    c("heard", "Keep the little finger down across the turn.", 1),
    c("extras", LIFT_LEAVE),
    c("notes", "Pick the top note again to start down.", 1),
    c("late", BEAT_PICK_LATE),
    c("early", SPREAD_THREE),
    c("afterHeld", HELD_TWO),
    c("stringChange", FIRST_NEXT),
    c("lastBars", "Hold the last note its full two beats."),
  ],

  // Level 1 · warm-ups
  "warmup-beginner.hammer-climb": [
    g("Pick the lower note, hammer the upper one.", 0),
    c("heard", HAMMER_HEAR),
    c("late", PICK_LATE),
    c("early", HAMMER_EARLY),
    c("shift", "Step up on the picked note, not after."),
    c("lastBars", PAIRS_TOP),
  ],
  "warmup-beginner.pull-climb": [
    g("Both fingers down, then pick the upper note.", 0),
    c("heard", PULL_FLICK),
    c("late", PICK_LATE),
    c("early", PULL_EARLY),
    c("shift", "Set both fingers down before each pick."),
    c("lastBars", PAIRS_TOP),
  ],
};
