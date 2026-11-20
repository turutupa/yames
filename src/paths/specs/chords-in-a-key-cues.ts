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
    g("Say the pattern: major, minor, minor, major.", 3),
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
    c("lastBars", "Keep A minor's barre down to the last note."),
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
    c("lastBars", "Stay on one for the last two bars."),
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
    c("notes", "Put finger three on the B string, fret five."),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", LATE),
    c("early", EARLY),
    c("stringChange", CROSS),
    c("lastBars", KEEP_LOOP),
  ],
  "the-minors.one-six-two-five": [
    g("Say one, six, two, five as each chord starts.", 2),
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
};
