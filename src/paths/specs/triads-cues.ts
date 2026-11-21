/**
 * Triads: one thing to try, per Exercise (leg cues8, 2026-11-20).
 *
 * Most graded Exercises of this Path roll a three-note shape low, middle,
 * high, middle in straight eighths, one chord to a bar; the first Steps count
 * a scale along one string in quarter notes. So the orders are about the
 * shape (which finger lies across, which fret leads), the move to the next
 * shape (look first, start on the last eighth, the note that stays), the
 * numbers of the chords, and the count. Never something the app heard about
 * the hand: it hears when notes sounded and which pitches.
 *
 * Exercises whose key changes between Takes (`key` variants, the warm-ups)
 * name no letter and no fret: chord numbers, string names and the shape only.
 * Every other Exercise is one version and may name its chords and frets.
 * Drafts, proof-read by a second reader: see `plans/coach/progress/cues8.md`.
 */
import type { Cue, CueTrigger } from "../format";
import type { CueBook } from "../spec";

const c = (when: CueTrigger, say: string, more?: number): Cue => (more === undefined ? { when, say } : { when, say, more });
/** The general cue: said with nothing measured, and when evenness decided a Take. */
const g = (say: string, more?: number): Cue => ({ ...c("even", say, more), general: true });

// Shared orders, word for word, so each is translated once.
// Rolled shapes in eighths.
const HEARD = "Press the whole shape down before you pick.";
const EXTRAS = "Pick one string on each eighth, no more.";
const LATE = "Have the next shape ready before '1'.";
const EARLY = "Wait for '1' before the new chord's first note.";
const CROSS = "Keep the pick close as it crosses strings.";
const SHIFT = "Start each change on the last eighth.";
const LAST_EVEN = "Keep the eighths even right to the last note.";
const LOOK = "Look at the next fret before you move.";
const IN_SHAPE = "Keep the fingers in shape as the hand slides.";
const HAND_STILL = "Keep the hand still; only the fingers change.";
const UNTIL_FIVE = "Keep the hand still until chord five.";
const FIVE_TO_ONE = "From five, go straight back to one on '1'.";
const TOP_BEAT = "Hold each chord's top note a full beat.";
const NEXT_RING = "Have the next chord ready as the top note rings.";
// One string, quarter notes.
const HEARD_ONE = "Press right behind the fret, then pick.";
const EXTRAS_Q = "Pick each note once, on its click.";
const LATE_ONE = "Move to the next fret before the click.";
const EARLY_ONE = "Wait for the click before each new note.";
const LATE_Q = "Pick each note right on its click.";
const EARLY_Q = "Wait for the click before each note.";
const SAY_NUMBERS = "Say each note's number as you play it.";
const HOLD_TOP = "Hold the top note for beats three and four.";
// Chord numbers, for the Exercises that change key.
const SAY_1451 = "Say one, four, five, one as each chord starts.";
const SAY_NUMBER = "Say each chord's number before you play it.";
const SAY_1645 = "Say one, six, four, five as each chord starts.";
const TOP_SAME = "Keep the top string's fret for one and four.";
const FOUR_ADD2 = "For four, add finger two on the B string.";
// Shapes, named where the Exercise has one version.
const BACK_TO_C = "From G, go straight back to C on '1'.";
const F_ACROSS_13 = "For F, lay finger one across fret thirteen.";
const G_FINGER1_7 = "For G, put finger one at fret seven.";
const G_ACROSS_3 = "For G, lay finger one across fret three.";
const F_ADD2 = "For F, add finger two on the B string, fret six.";
const AM_F3_10 = "For A minor, put finger three at fret ten.";
const EM_TO_AM = "From E minor, go straight back to A minor.";
const TEN_TO_FIVE = "From fret ten, drop to fret five as it loops.";
const SEVEN_TO_THREE = "From fret seven, drop to fret three as it loops.";
const NINE_TO_FIVE = "From fret nine, drop to fret five as it loops.";
const SEVEN_TO_FOUR = "From fret seven, drop to fret four as it loops.";
const TEN_TO_SEVEN = "From fret ten, drop to fret seven as it loops.";
const F_TO_C_FIVE = "From F, drop to fret five for C on '1'.";
const FOUR_TO_ONE = "From four, go straight back to one on '1'.";
const D_5_10_14 = "Lead with the D string: five, ten, fourteen.";
const ACROSS_FIVE = "Lay finger one across fret five, three strings.";
const FIVE_THREE = "Keep finger one at fret five for three chords.";
const F4_A = "For F, put finger four on the A string.";
const BDIM_F1 = "For B diminished, put finger one at fret one.";
const EM_F4_5 = "For E minor, put finger four at fret five.";
const LAST_G = "Stay on G for the last two bars.";
const TOP_SET = "Switch to the top three strings at the chorus.";
const VERSE_COUNT = "Count the verse's eight bars, then go up.";
const LOW_HIGH = "Play it low, then the same four a shape higher.";
const LONG_TWO = "Count the long note's two beats, then go.";
const LAST_B_HOLD = "Hold the last note on the B string two beats.";

/**
 * One rolled-shape Exercise: its general cue, its `notes`, `shift` and
 * `lastBars` cues, and the stock orders for the measured things between.
 */
const roll = (gen: Cue, notes: string, shift: string, last: string, cross = CROSS): Cue[] => [
  gen,
  c("notes", notes),
  c("heard", HEARD),
  c("extras", EXTRAS),
  c("late", LATE),
  c("early", EARLY),
  c("shift", shift),
  c("stringChange", cross),
  c("lastBars", last),
];
/** A scale or arpeggio along one string, first finger only, in quarter notes. */
const oneString = (gen: Cue, notes: string, last: string, held?: string): Cue[] => [
  gen,
  c("notes", notes),
  c("heard", HEARD_ONE),
  c("extras", EXTRAS_Q),
  c("late", LATE_ONE),
  c("early", EARLY_ONE),
  ...(held ? [c("afterHeld", held)] : []),
  c("shift", LOOK),
  c("lastBars", last),
];
/**
 * A key-varied warm-up: no `notes` or `extras` check, and nothing named. Its
 * chords jump an octave where the neck runs out, so the variants are not one
 * transposition: no shape, no next string, no direction either.
 */
const warm = (gen: Cue, last = LAST_EVEN): Cue[] => [
  gen,
  c("heard", "Sound all three notes of every chord."),
  c("late", "Have the new chord ready before '1'."),
  c("early", EARLY),
  c("shift", SHIFT),
  c("stringChange", "Keep the pick close to the strings."),
  c("lastBars", last),
];

export const TRIADS_CUES: CueBook = {
  // Level 1 (Beginner), Step 1: one, three and five
  "one-three-five.count-the-scale": oneString(
    g(SAY_NUMBERS, 1),
    "Move one fret only from three to four.",
    "Come down to fret one and hold it two beats.",
  ),
  "one-three-five.pick-three": oneString(
    g("Say each note's number: one, three or five.", 2),
    "Find the high one at fret thirteen.",
    "End on fret five and hold it two beats.",
    "Count fret eight's two beats, then jump up.",
  ),
  "one-three-five.under-one-hand": [
    g("Put all three fingers down and leave them down.", 1),
    c("notes", "Fourth finger on the B string, fret five."),
    c("heard", HEARD),
    c("extras", EXTRAS_Q),
    c("late", LATE_Q),
    c("early", EARLY_Q),
    c("afterHeld", "Count the high note's two beats, then go on."),
    c("stringChange", CROSS),
    c("lastBars", HOLD_TOP),
  ],

  // Level 1, Step 2: three shapes
  "three-shapes.first-two": roll(
    g("Look at fret eight before you leave shape one."),
    "Lay finger one flat across fret eight.",
    SHIFT,
    "Drop back to fret five as the loop starts.",
  ),
  "three-shapes.second-and-third": roll(
    g("Look at fret twelve before you leave shape two."),
    "Finger one on fret twelve, G and top strings.",
    SHIFT,
    "Go straight back to shape two as it loops.",
  ),
  "three-shapes.all-three": roll(
    g("Lead with the G string: five, nine, twelve.", 1),
    "Second finger on fret thirteen in shape three.",
    LOOK,
    "From shape two, drop to fret five as it loops.",
  ),

  // Level 1, Step 3: one, three and five again
  "one-three-five-again.count-f": oneString(
    g(SAY_NUMBERS, 1),
    "Play four at fret six: B flat.",
    "Come down to fret one and hold it two beats.",
  ),
  "one-three-five-again.f-under-one-hand": [
    g("Keep finger one on fret eight into the shape.", 2),
    c("notes", "Third finger on the G string, fret ten."),
    c("heard", HEARD),
    c("extras", EXTRAS_Q),
    c("late", LATE_Q),
    c("early", EARLY_Q),
    c("afterHeld", "Count fret eight's two beats, then the G string."),
    c("shift", LOOK),
    c("stringChange", CROSS),
    c("lastBars", HOLD_TOP),
  ],
  "one-three-five-again.count-g": oneString(
    g(SAY_NUMBERS, 1),
    "Play seven at fret fourteen: F sharp.",
    "Come down to fret three and hold it two beats.",
  ),
  "one-three-five-again.g-under-one-hand": [
    g("Keep finger one on fret ten into the shape.", 2),
    c("notes", "Third finger on the G string, fret twelve."),
    c("heard", HEARD),
    c("extras", EXTRAS_Q),
    c("late", LATE_Q),
    c("early", EARLY_Q),
    c("afterHeld", "Count fret ten's two beats, then the G string."),
    c("shift", LOOK),
    c("stringChange", CROSS),
    c("lastBars", HOLD_TOP),
  ],

  // Level 1, Step 4: F and G
  "f-and-g.f-three-places": roll(
    g("Lead with the G string: five, ten, fourteen.", 1),
    "Second finger on the G string, fret fourteen.",
    SHIFT,
    TEN_TO_FIVE,
  ),
  "f-and-g.g-three-places": roll(
    g("Lead with the G string: four, seven, twelve.", 1),
    "Second finger on the B string at fret eight.",
    SHIFT,
    SEVEN_TO_FOUR,
  ),
  "f-and-g.shape-three-moves": roll(
    g("Keep finger one across the G and top strings.", 1),
    "Finger two on the B string, fret six, for F.",
    "Look at fret five before you leave C.",
    "Hold the C shape down to the last note.",
  ),

  // Level 1, Step 5: three chords
  "three-chords.move-the-shape": roll(
    g(IN_SHAPE, 1),
    "Put fingers three and four at fret ten for F.",
    LOOK,
    "Drop to fret five for the last C.",
  ),
  "three-chords.stay-put": roll(
    g(HAND_STILL, 1),
    "Keep finger one on the top string, fret eight.",
    G_FINGER1_7,
    BACK_TO_C,
  ),
  "three-chords.stay-put-high": roll(
    g("Stay around fret twelve; let the fingers change."),
    F_ACROSS_13,
    "For G, put finger one at fret ten.",
    BACK_TO_C,
  ),
  "three-chords.stay-put-keys": roll(g(SAY_1451), TOP_SAME, HAND_STILL, FIVE_TO_ONE),

  // Level 1, Step 6: three chords, tunes
  "three-chords-tunes.five-before-four": roll(
    g("Keep the G string at fret twelve from C to G.", 3),
    F_ACROSS_13,
    "From G to F, look at fret thirteen first.",
    "Keep the B string at fret thirteen into C.",
  ),
  "three-chords-tunes.eight-bars": roll(
    g("Follow the form: C, F, G, F, then C, G, F, C.", 2),
    "Put fingers three and four at fret ten for F.",
    "From G to F, move finger one to fret eight.",
    "From F, go straight to C on '1'.",
  ),
  "three-chords-tunes.twelve-bars": roll(
    g("Count the lines of four all the way round.", 3),
    "Finger one across fret thirteen for the high F.",
    "Look at fret fourteen during the second C.",
    "Stay on C for the last two bars.",
  ),
  "three-chords-tunes.eight-bars-keys": roll(g(SAY_NUMBER), TOP_SAME, HAND_STILL, FOUR_TO_ONE),

  "warmup-beginner.shape-one-keys": warm(g(SAY_1451)),

  // Level 2 (Intermediate), Step 7: minor
  "minor.c-to-c-minor": [
    g("Move only the B string's note for C minor.", 1),
    c("notes", "For C minor, put finger two at fret four."),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", LATE),
    c("early", EARLY),
    c("stringChange", CROSS),
    c("lastBars", "From C minor, go straight back to C on '1'."),
  ],
  "minor.a-minor-three": roll(
    g("Lead with the G string: five, nine, fourteen.", 1),
    "Finger one flat across fret five for A minor.",
    SHIFT,
    NINE_TO_FIVE,
  ),
  "minor.c-and-a-minor": roll(
    g("Move one note for A minor; keep the other two.", 1),
    "For high A minor, put finger three at fret ten.",
    "Look at fret nine before you leave A minor.",
    "From A minor, drop to fret five for C.",
  ),

  // Level 2, Step 8: more minors
  "more-minors.d-minor-three": roll(
    g("Lead with the G string: two, seven, ten.", 1),
    "Barre fret ten with finger one for D minor.",
    SHIFT,
    "From fret seven, drop to fret two as it loops.",
  ),
  "more-minors.e-minor-three": roll(
    g("Lead with the G string: four, nine, twelve.", 1),
    "Barre fret twelve with finger one for E minor.",
    SHIFT,
    "From fret nine, drop to fret four as it loops.",
  ),
  "more-minors.three-minors": roll(
    g("Stay between frets three and seven throughout."),
    "For D minor, put finger three at fret seven.",
    "For E minor, move finger one to fret three.",
    EM_TO_AM,
  ),

  // Level 2, Step 9: four chords
  "four-chords.low": roll(g(UNTIL_FIVE), F_ADD2, G_ACROSS_3, BACK_TO_C),
  "four-chords.mid": roll(g("Keep finger one on the top string at fret eight."), AM_F3_10, G_FINGER1_7, BACK_TO_C),
  "four-chords.walk-the-key": roll(
    g("Say major, minor, minor, major as you climb."),
    "For the minors, put finger two on the B string.",
    "Keep finger three on the G string as you climb.",
    F_TO_C_FIVE,
  ),
  "four-chords.four-chords-keys": roll(g(SAY_1645), FOUR_ADD2, UNTIL_FIVE, FIVE_TO_ONE),

  // Level 2, Step 10: the top note
  "top-note.falling-line": [
    g(TOP_BEAT, 2),
    c("notes", AM_F3_10),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", LATE),
    c("early", EARLY),
    c("afterHeld", NEXT_RING),
    c("shift", "Keep the G string at fret twelve from C to G."),
    c("stringChange", CROSS),
    c("lastBars", "Keep finger one on fret eight from A minor to F."),
  ],
  "top-note.low-line": [
    g(TOP_BEAT),
    c("notes", G_ACROSS_3),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", LATE),
    c("early", EARLY),
    c("afterHeld", NEXT_RING),
    c("shift", "For A minor, lay finger one across fret five."),
    c("stringChange", CROSS),
    c("lastBars", F_ADD2),
  ],
  "top-note.your-line": [g("Find the shape whose top note moves least.", 1)],

  // Level 2, Step 11: the middle strings
  "middle-strings.c-middle": roll(
    g(D_5_10_14, 1),
    ACROSS_FIVE,
    SHIFT,
    TEN_TO_FIVE,
  ),
  "middle-strings.a-minor-middle": roll(
    g("Lead with the D string: seven, ten, fourteen.", 1),
    "Finger one on the B string, fret thirteen.",
    SHIFT,
    TEN_TO_SEVEN,
  ),
  "middle-strings.four-chords-middle": roll(
    g(FIVE_THREE),
    F_ADD2,
    "For G, put finger one at fret three.",
    BACK_TO_C,
  ),

  // Level 2, Step 12: F and G on the middle strings
  "f-and-g-middle.f-middle": roll(
    g("Lead with the D string: three, seven, ten.", 1),
    "Barre fret ten with finger one for F.",
    SHIFT,
    SEVEN_TO_THREE,
  ),
  "f-and-g-middle.g-middle": roll(
    g("Lead with the D string: five, nine, twelve.", 1),
    "Barre fret twelve with finger one for G.",
    SHIFT,
    NINE_TO_FIVE,
  ),
  "f-and-g-middle.three-chords-middle": roll(
    g("Keep the D string at fret ten from C to F.", 2),
    G_FINGER1_7,
    "Lay finger one across fret ten for F.",
    BACK_TO_C,
  ),
  "f-and-g-middle.three-chords-middle-keys": roll(
    g(SAY_1451),
    "For four, lay finger one across all three.",
    "Keep the D string's fret from one to four.",
    FIVE_TO_ONE,
  ),

  // Level 2, Step 13: minors on the middle strings
  "minors-middle.d-minor-middle": roll(
    g("Lead with the D string: three, seven, twelve.", 1),
    "Finger one across the G and B strings at ten.",
    SHIFT,
    SEVEN_TO_THREE,
  ),
  "minors-middle.e-minor-middle": roll(
    g("Lead with the D string: five, nine, fourteen.", 1),
    "Finger one across the G and B strings at twelve.",
    SHIFT,
    NINE_TO_FIVE,
  ),
  "minors-middle.three-minors-middle": roll(
    g("Keep fret seven on the D string into D minor.", 2),
    "For D minor, add finger four on the G string.",
    "For E minor, put finger one at fret four.",
    EM_TO_AM,
  ),
  "minors-middle.four-chords-middle-keys": roll(g(SAY_1645), FOUR_ADD2, UNTIL_FIVE, FIVE_TO_ONE),

  "warmup-intermediate.major-shapes": warm(g("Start well under your clean tempo.")),

  // Level 3 (Advanced), Step 14: two sets joined
  "two-sets.c-four-strings": roll(g(D_5_10_14, 1), "Put finger one on the top string at fret three.", SHIFT, TEN_TO_FIVE),
  "two-sets.four-chords-four-strings": roll(g("Start each chord on the D string."), F_ADD2, G_ACROSS_3, BACK_TO_C),
  "two-sets.up-the-neck": [
    g("Move to a new shape every two beats.", 0),
    c("notes", ACROSS_FIVE),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", LATE),
    c("early", EARLY),
    c("afterHeld", LONG_TWO),
    c("shift", LOOK),
    c("stringChange", CROSS),
    c("lastBars", "Stop on the top note and hold it two beats."),
  ],

  // Level 3, Step 15: the low set
  "low-set.c-low-set": roll(
    g("Lead with the A string: seven, ten, fifteen.", 1),
    "Finger one across the D and G strings at five.",
    SHIFT,
    TEN_TO_SEVEN,
  ),
  "low-set.a-minor-low-set": roll(
    g("Lead with the A string: three, seven, twelve.", 1),
    "Finger one across the D and G strings at two.",
    SHIFT,
    SEVEN_TO_THREE,
  ),
  "low-set.four-chords-low-set": roll(g(FIVE_THREE), F4_A, "For G, put finger one at fret four.", BACK_TO_C),

  // Level 3, Step 16: three sets
  "three-sets.one-four-five-low-set": roll(g("Slide the F shape up for G, fingers in place.", 1), F4_A, LOOK, BACK_TO_C),
  "three-sets.four-chords-low-set-keys": roll(
    g(SAY_1645),
    "For four, put finger four on the A string.",
    UNTIL_FIVE,
    FIVE_TO_ONE,
  ),
  "three-sets.three-sets-one-place": [
    g("Keep the hand still; move one string across.", 2),
    c("notes", "Keep the G string at fret nine all the way."),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", LATE),
    c("early", EARLY),
    c("stringChange", CROSS),
    c("lastBars", "Start the last bar back on the D string."),
  ],

  // Level 3, Step 17: diminished
  "diminished.minor-to-diminished": roll(
    g("Move only the top note, down to fret one.", 1),
    BDIM_F1,
    "Keep fingers three and four down all four bars.",
    "From B diminished, go straight back to B minor.",
  ),
  "diminished.b-diminished-three": roll(
    g("Lead with the G string: four, seven, ten.", 1),
    "Finger three on the B string at fret twelve.",
    SHIFT,
    SEVEN_TO_FOUR,
  ),
  "diminished.leading-home": roll(
    g("Keep frets four and three into B diminished.", 1),
    BDIM_F1,
    "For C, put fingers three and four at fret five.",
    "Stay on C for the last two bars.",
  ),

  // Level 3, Step 18: chords from triads
  "chords-from-triads.inside-open-c": [
    g("Hold the whole C chord down throughout.", 0),
    c("notes", "Play the B string at fret one, not open."),
    c("heard", HEARD),
    c("extras", EXTRAS_Q),
    c("late", LATE_Q),
    c("early", EARLY_Q),
    c("afterHeld", LONG_TWO),
    c("openString", "Pick the open G string like the fretted notes."),
    c("stringChange", CROSS),
    c("lastBars", LAST_B_HOLD),
  ],
  "chords-from-triads.inside-a-barre": [
    g("Hold the barre at fret three as you pick.", 0),
    c("notes", "Put finger two on the G string, fret four."),
    c("heard", HEARD),
    c("extras", "Pick each note once, no more."),
    c("late", "Pick each note right on its count."),
    c("early", "Wait for each note's count before you pick."),
    c("afterHeld", LONG_TWO),
    c("stringChange", CROSS),
    c("lastBars", LAST_B_HOLD),
  ],
  "chords-from-triads.add-a-seventh": [
    g("Walk the top note down: eight, seven, six.", 1),
    c("notes", "Finger one across the G and B strings at five."),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", LATE),
    c("early", EARLY),
    c("afterHeld", NEXT_RING),
    c("stringChange", CROSS),
    c("lastBars", F_ADD2),
  ],

  // Level 3, Step 19: a song
  "a-song.eight-bars": roll(g(LOW_HIGH), AM_F3_10, "Look at fret nine during the low F.", F_TO_C_FIVE),
  "a-song.eight-bars-keys": roll(g(LOW_HIGH), SAY_NUMBER, LOOK, FOUR_TO_ONE),
  "a-song.your-song": [g("Keep the top note moving as little as you can.", 1)],

  // Level 3, Step 20: a second song
  "second-song.verse": roll(
    g("Keep fingers three and two down into E minor.", 2),
    EM_F4_5,
    "Barre with finger one for the C and D chords.",
    "From D, go straight back to G on '1'.",
  ),
  "second-song.chorus": roll(
    g("Climb the neck: a new place for every chord."),
    "For E minor, put finger three at fret nine.",
    LOOK,
    LAST_G,
  ),
  "second-song.whole-song": roll(g(VERSE_COUNT, 2), TOP_SET, "Look at fret five during the verse's last D.", LAST_G),
  "second-song.whole-song-keys": roll(g(VERSE_COUNT), TOP_SET, LOOK, "Stay on one for the last two bars."),
  "second-song.your-second-song": [g("Give the chorus a new set of strings.", 1)],

  "warmup-advanced.minor-shapes": warm(g(SAY_1451)),
  "warmup-advanced.middle-shapes": warm(g("Start each chord on the D string.")),
};
