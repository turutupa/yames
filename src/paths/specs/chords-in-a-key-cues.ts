/**
 * Chords in a Key: one thing to try, per Exercise (leg cues3, 2026-11-20).
 *
 * Every graded Exercise of this Path is a triad (from Sevenths on, a
 * four-note chord) picked one string at a time in straight eighths, low,
 * middle, high, middle, one chord to a bar. So the orders are a rhythm
 * guitarist's: have the next shape ready before '1', start the change on
 * the last eighth, which finger stays down, which string each chord starts
 * on, and the numbers of the progression. Never something the app heard
 * about the hand: it hears when notes sounded and which pitches.
 *
 * Exercises whose key changes between Takes (`key` variants, the warm-ups)
 * name no chord, fret or finger; every other Exercise is one version and may.
 * Drafts, proof-read by a second reader: see `plans/coach/progress/cues3.md`.
 */
import type { Cue, CueTrigger } from "../format";
import type { CueBook } from "../spec";

const c = (when: CueTrigger, say: string, more?: number): Cue => (more === undefined ? { when, say } : { when, say, more });
/** The general cue: said with nothing measured, and when evenness decided a Take. */
const g = (say: string, more?: number): Cue => ({ ...c("even", say, more), general: true });

// Shared orders, word for word, so each is translated once.
const HEARD = "Press the whole shape down before you pick.";
const EXTRAS = "Pick one string on each eighth, no more.";
const LATE = "Have the next shape ready before '1'.";
const EARLY = "Wait for '1' before the new chord's first note.";
const CROSS = "Keep the pick close as it crosses strings.";
const SHIFT = "Start each change on the last eighth.";
const LAST_EVEN = "Keep the eighths even right to the last note.";
const KEEP_LOOP = "Keep the shape down as the loop starts again.";
const D_FIRST = "Start each chord on the D string.";
const FIND_FIRST = "Find every shape of the key before you start.";
// Shapes, named where the Exercise has one version.
const BDIM = "Fourth finger on fret nine for B diminished.";
const DROP_BACK = "Play the last C through, then drop to fret five.";
const AM_BARRE = "Lay one finger across fret five for A minor.";
const C_MID_BARRE = "Lay finger one across fret five for C.";
const C_F_MID = "Keep finger one on the G string from C to F.";
const F_FINGER2 = "Put finger two on the B string, fret six, for F.";
const G_FLAT = "Lay finger one flat at fret three for G.";
const BACK_TO_C = "Go straight from G back to C on '1'.";
const FORM_CFCG = "Follow the form: C, F, C, G, then C, F, G, C.";
const DM_G7 = "For D minor, put the G string at fret seven.";
const AM_F = "Keep finger one across fret five, A minor to F.";
const BB_BARRE = "Lay finger one across fret six for B flat.";
const DM_ADD3 = "For D minor, add finger three at fret seven.";
const LAST_TWO_C = "Stay on C for the last two bars.";
const LAST_TWO_F = "Stay on F for the last two bars.";
const LAST_TWO_ONE = "Stay on one for the last two bars.";
const LOOP_ONE = "Land back on one right on '1'.";
const SAY_PATTERN = "Say the pattern: major, minor, minor, major.";
const SAY_1625 = "Say one, six, two, five as each chord starts.";
const SAY_1564 = "Say one, five, six, four as each chord starts.";
const AM_LAST = "Keep A minor's barre down to the last note.";
const EM_LAST = "Keep E minor down to the last note.";
const EM_B5 = "Put finger three on the B string, fret five.";
const DM_TEN = "Lay finger one across fret ten for D minor.";
const D_TWO = "Lay finger one across fret two for D.";
const E_FOUR = "Lay finger one across fret four for E.";
const BM_SEVEN = "Lay finger one across fret seven for B minor.";
const EM_C_SLIDE = "Slide finger two up a fret from E minor to C.";
const TOP_SET = "Move to the top three strings for chord five.";
const D_TO_G = "From D, go straight back to G on '1'.";
const C_TO_G = "From C, go straight back to G on '1'.";

/**
 * One picked-chord Exercise: its general cue, its `notes`, `shift` and
 * `lastBars` cues, and the stock orders for the measured things between.
 */
const arp = (gen: Cue, notes: string, shift: string, last: string, cross = CROSS): Cue[] => [
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
/** A key-varied warm-up: no `notes` or `extras` check, and nothing named. */
const warm = (gen: Cue, last = LAST_EVEN): Cue[] => [
  gen,
  c("heard", HEARD),
  c("late", LATE),
  c("early", EARLY),
  c("shift", SHIFT),
  c("stringChange", CROSS),
  c("lastBars", last),
];

export const CHORDS_IN_A_KEY_CUES: CueBook = {
  // Level 1 (Beginner), Step 1: the seven chords
  "seven-chords.upper-four": [
    g("Climb one chord per bar, root on the D string.", 1),
    c("notes", BDIM, 2),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", LATE),
    c("early", EARLY),
    c("shift", "Lead each move up with the root on the D string."),
    c("stringChange", CROSS),
    c("lastBars", DROP_BACK),
  ],
  "seven-chords.all-seven": [
    g(SAY_PATTERN, 3),
    c("notes", BDIM),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", LATE),
    c("early", EARLY),
    c("shift", "Drop to fret five on the D string for G.", 2),
    c("stringChange", CROSS),
    c("lastBars", DROP_BACK),
  ],
  "seven-chords.majors-and-minors": [
    g("Stay near fret five; only the fingers change."),
    c("notes", AM_BARRE, 2),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", LATE),
    c("early", EARLY),
    c("shift", SHIFT),
    c("stringChange", CROSS),
    c("lastBars", AM_LAST),
  ],

  // Level 1, Step 2: numbers
  "numbers.one-four-five-middle": [
    g("Say one, four, five, one as each chord starts.", 2),
    c("notes", C_MID_BARRE, 1),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", LATE),
    c("early", EARLY),
    c("shift", C_F_MID),
    c("stringChange", D_FIRST),
    c("lastBars", LAST_EVEN),
  ],
  "numbers.eight-bar-form": [
    g("Count two bars of C and two of F, then G.", 2),
    c("notes", F_FINGER2, 1),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", LATE),
    c("early", EARLY),
    c("shift", SHIFT),
    c("stringChange", CROSS),
    c("lastBars", LAST_TWO_C),
  ],
  "numbers.eight-bar-keys": [
    g("Count two bars of one, two of four, then five."),
    c("notes", FIND_FIRST),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", LATE),
    c("early", EARLY),
    c("shift", SHIFT),
    c("stringChange", CROSS),
    c("lastBars", LAST_TWO_ONE),
  ],

  // Level 1, Step 3: one, four and five again
  "one-four-five-again.one-four-one-five": [
    g("Say one, four, one, five as each chord starts.", 4),
    c("notes", G_FLAT, 2),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", LATE),
    c("early", EARLY),
    c("shift", "Keep finger one on the top string, C to G.", 2),
    c("stringChange", CROSS),
    c("lastBars", BACK_TO_C),
  ],
  "one-four-five-again.one-one-four-five": [
    g("Count two bars of C before the change to F.", 2),
    c("notes", F_FINGER2),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", LATE),
    c("early", EARLY),
    c("shift", SHIFT),
    c("stringChange", CROSS),
    c("lastBars", BACK_TO_C),
  ],
  "one-four-five-again.eight-bars-home": [
    g(FORM_CFCG, 1),
    c("notes", G_FLAT),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", LATE),
    c("early", EARLY),
    c("shift", SHIFT),
    c("stringChange", CROSS),
    c("lastBars", KEEP_LOOP),
  ],
  "one-four-five-again.eight-bars-home-middle": [
    g(FORM_CFCG, 1),
    c("notes", C_MID_BARRE),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", LATE),
    c("early", EARLY),
    c("shift", C_F_MID, 2),
    c("stringChange", D_FIRST),
    c("lastBars", KEEP_LOOP),
  ],

  // Level 1, Step 4: the minor chords
  "the-minors.pairs": [
    g("Move just one note in each pair.", 1),
    c("notes", DM_G7, 1),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", LATE),
    c("early", EARLY),
    c("shift", AM_BARRE),
    c("stringChange", CROSS),
    c("lastBars", "From D minor, go straight back to C on '1'."),
  ],
  "the-minors.five-and-three": [
    g("Change only the B string for E minor.", 1),
    c("notes", EM_B5),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", LATE),
    c("early", EARLY),
    c("stringChange", CROSS),
    c("lastBars", KEEP_LOOP),
  ],
  "the-minors.one-six-two-five": [
    g(SAY_1625, 2),
    c("notes", DM_G7),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", LATE),
    c("early", EARLY),
    c("shift", AM_BARRE),
    c("stringChange", CROSS),
    c("lastBars", BACK_TO_C),
  ],

  // Level 1, Step 5: coming home
  "coming-home.one-six-four-five": [
    g("Say one, six, four, five as each chord starts.", 3),
    c("notes", AM_F, 2),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", LATE),
    c("early", EARLY),
    c("shift", AM_BARRE),
    c("stringChange", CROSS),
    c("lastBars", BACK_TO_C),
  ],
  "coming-home.one-six-four-five-home": [
    g("Let G hang in bar four and C settle in eight.", 3),
    c("notes", AM_F),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", LATE),
    c("early", EARLY),
    c("shift", SHIFT),
    c("stringChange", CROSS),
    c("lastBars", KEEP_LOOP),
  ],
  "coming-home.one-six-two-five-home": [
    g("Play D minor where F was: one, six, two, five.", 3),
    c("notes", DM_G7),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", LATE),
    c("early", EARLY),
    c("shift", SHIFT),
    c("stringChange", CROSS),
    c("lastBars", KEEP_LOOP),
  ],
  "coming-home.your-turn-home": [g("Stop on G and listen, then end on C.", 1)],

  // Level 1, Step 6: the numbers in F
  "numbers-in-f.one-four-five-f": [
    g("Say one, four, five, one: F is home now.", 3),
    c("notes", BB_BARRE, 2),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", LATE),
    c("early", EARLY),
    c("shift", "Move finger one up to fret six for B flat.", 2),
    c("stringChange", CROSS),
    c("lastBars", KEEP_LOOP),
  ],
  "numbers-in-f.eight-bar-form-f": [
    g("Count two bars of F and two of B flat, then C.", 2),
    c("notes", BB_BARRE),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", LATE),
    c("early", EARLY),
    c("shift", "Move finger one down to fret three for C.", 3),
    c("stringChange", CROSS),
    c("lastBars", LAST_TWO_F),
  ],
  "numbers-in-f.one-six-four-five-f": [
    g("Say one, six, four, five, and stop on C.", 4),
    c("notes", DM_ADD3, 2),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", LATE),
    c("early", EARLY),
    c("shift", BB_BARRE, 3),
    c("stringChange", CROSS),
    c("lastBars", "From C, go straight back to F on '1'."),
  ],
  "numbers-in-f.home-in-f": [
    g("Let C hang in bar four and F settle in eight.", 3),
    c("notes", DM_ADD3),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", LATE),
    c("early", EARLY),
    c("shift", BB_BARRE),
    c("stringChange", CROSS),
    c("lastBars", KEEP_LOOP),
  ],

  // Level 1 warm-up (the key changes between Takes)
  "warmup-beginner.first-four-keys": [
    g("Say major or minor as each chord starts.", 0),
    c("heard", HEARD),
    c("late", LATE),
    c("early", EARLY),
    c("shift", SHIFT),
    c("stringChange", CROSS),
    c("lastBars", LAST_EVEN),
  ],

  // Level 2 (Intermediate), Step 7: named progressions
  "progressions.two-five-one": arp(
    g("Climb with each chord and arrive on C on '1'.", 2),
    "Lay finger one across fret seven for G.",
    "Move finger one up to fret eight for C.",
    LAST_TWO_C,
  ),
  "progressions.six-four-one-five": arp(
    g("Say six, four, one, five as each chord starts."),
    AM_F,
    SHIFT,
    "From G, go straight to A minor on '1'.",
  ),
  "progressions.one-three-four-five": arp(
    g("Move only the top note from C to E minor."),
    "Put the fourth finger on the B string for F.",
    "Drop finger one to fret seven for G.",
    BACK_TO_C,
  ),

  // Level 2, Step 8: two places on the neck
  "two-places.one-six-two-five-high": arp(
    g("Play the turn a shape higher, around fret eight."),
    DM_TEN,
    "Move finger one down to fret seven for G.",
    BACK_TO_C,
  ),
  "two-places.low-then-high": arp(
    g("Play the turn low, then a shape higher."),
    DM_TEN,
    "Move up to fret eight for the second C.",
    "From G, drop back to the low C on '1'.",
  ),
  "two-places.your-turn": [g("Say each chord's number before you play it.", 1)],

  // Level 2, Step 9: other keys
  "other-keys.seven-in-d": arp(
    g(SAY_PATTERN),
    "For C sharp diminished, reach with finger four.",
    "Drop to fret seven on the D string for A.",
    "Play the last D chord, then drop to fret seven.",
  ),
  "other-keys.one-six-two-five-keys": arp(g(SAY_1625), FIND_FIRST, SHIFT, LOOP_ONE),
  "other-keys.two-five-one-keys": arp(g("Let five fall into one, then hold one two bars."), FIND_FIRST, SHIFT, LAST_TWO_ONE),

  // Level 2, Step 10: the key of G
  "key-of-g.seven-in-g": arp(
    g(SAY_PATTERN, 3),
    "For F sharp diminished, reach with finger four.",
    TOP_SET,
    "Play the last G chord, then drop to fret five.",
  ),
  "key-of-g.one-four-five-g": arp(g("Count two bars of G and two of C, then D."), D_TWO, SHIFT, "Stay on G for the last two bars."),
  "key-of-g.one-six-two-five-g": arp(g(SAY_1625, 2), EM_B5, AM_BARRE, D_TO_G),

  // Level 2, Step 11: the key of A
  "key-of-a.seven-in-a": arp(
    g(SAY_PATTERN, 3),
    "For G sharp diminished, reach with finger four.",
    TOP_SET,
    "Play the last A chord, then drop to fret seven.",
  ),
  "key-of-a.one-four-five-a": arp(g("Count two bars of A and two of D, then E."), E_FOUR, SHIFT, "Stay on A for the last two bars."),
  "key-of-a.one-six-two-five-a": arp(
    g(SAY_1625, 2),
    BM_SEVEN,
    "Move finger one down to fret four for E.",
    "From E, go straight back to A on '1'.",
  ),

  // Level 2, Step 12: four-chord songs
  "four-chord-songs.one-five-six-four-g": arp(g(SAY_1564), EM_C_SLIDE, D_TWO, C_TO_G),
  "four-chord-songs.one-five-six-four-a": arp(g(SAY_1564), E_FOUR, SHIFT, "From D, go straight back to A on '1'."),
  "four-chord-songs.one-six-four-five-g": arp(
    g("Keep fret three on the top string, G to C."),
    EM_C_SLIDE,
    "Keep the C shape and move it up for D.",
    D_TO_G,
  ),
  "four-chord-songs.one-five-six-four-keys": arp(g(SAY_1564), FIND_FIRST, SHIFT, LOOP_ONE),

  // Level 2, Step 13: the minor key
  "minor-key.minor-one-four-five": arp(g("Say one, four, five, one: A minor is home."), DM_G7, EM_B5, AM_LAST),
  "minor-key.minor-six-seven": arp(g("Say one, six, seven, one: A minor is home."), AM_F, G_FLAT, AM_LAST),
  "minor-key.down-to-e": arp(
    g("Keep one shape and walk it down: G, F, E.", 2),
    E_FOUR,
    "Move finger one down to fret five for F.",
    "From E, jump back up to A minor on '1'.",
  ),

  // Level 2, Step 14: the minor key from E
  "minor-key-e.e-minor-one-four-five": arp(g("Hold fret nine on the G string into A minor."), BM_SEVEN, SHIFT, EM_LAST),
  "minor-key-e.e-minor-six-seven": arp(g("Move only finger one to fret eight for C.", 2), "Lay finger one across fret ten for D.", SHIFT, EM_LAST),
  "minor-key-e.down-to-b": arp(
    g("Keep one shape and walk it down: D, C, B.", 2),
    "Lay finger one at fret two for B major.",
    "Move finger one down to fret three for C.",
    "From B, jump back up to E minor on '1'.",
  ),
  "minor-key-e.two-homes": arp(
    g("Hear G as home, then E minor as home.", 3),
    D_TWO,
    "Move up to fret nine for the second E minor.",
    D_TO_G,
  ),

  // Level 2 warm-up (the key changes between Takes)
  "warmup-intermediate.one-six-two-five-warm": warm(g(SAY_1625, 0), LOOP_ONE),
};
