/**
 * Scales and Modes: one thing to try, per Exercise (leg cues5, 2026-11-20).
 *
 * This Path teaches scales as patterns of steps, keys as the sharps and flats
 * they carry, and modes as one changed note. Its orders are a scale teacher's:
 * say the names or the steps, find the half steps, find the note a key or a
 * mode changes, keep the hand where the shape lives, and move it at the right
 * moment. The `notes` cue (a wrong pitch was heard) always says where the right
 * note is. The app hears when a note sounded and which pitch; it cannot hear a
 * name said aloud, a finger or a string, so no cue says or implies it did.
 *
 * Exercises that change key, string or shape between Takes name no letter, key
 * or mode: they say the degree, the step, the finger or the fret distance.
 * Every other Exercise is one version and may name its notes.
 * Drafts, proof-read by a second reader: see `plans/coach/progress/cues5.md`.
 */
import type { Cue, CueTrigger } from "../format";
import type { CueBook } from "../spec";

const c = (when: CueTrigger, say: string, more?: number): Cue => (more === undefined ? { when, say } : { when, say, more });
/** The general cue: said with nothing measured, and when evenness decided a Take. */
const g = (say: string, more?: number): Cue => ({ ...c("even", say, more), general: true });

// Shared orders, word for word, so each is translated once.
const HEARD = "Press right behind each fret so it rings.";
const HEARD_ANY = "Press each note firmly so it rings.";
const EXTRAS4 = "Play one note on each click, no more.";
const EXTRAS8 = "Play two notes to each click, no more.";
const EXTRAS_TAB = "Play just the notes on the tab, no more.";
const NEXT_FINGER = "Have the next finger ready before the click.";
const EARLY = "Wait for the click before each new note.";
const BEAT_LATE = "Put each beat's first note on the click.";
const BEAT_EARLY = "Wait for the click at the start of each beat.";
const BAND_LATE = "Land each bar's first note with the band.";
const BAND_EARLY = "Wait for the band's '1' before each bar.";
const CROSS = "Keep the pick close as you cross strings.";
const HELD_LOOP = "Count the held note out, then start again.";
const LONG_BEAT = "Count the long note's beat, then go on.";
const LONG_EACH = "Hold each long note its two beats, then move.";
const SHIFT_TWO = "Move two frets as each long note ends.";
const SEE_NEXT = "See where the next note is before the click.";
const MOVE_EARLY = "Wait for the click before each move.";
const STEPS_END = "Keep saying 'whole' or 'half' to the end.";
const OPEN_CLICK = "Put each open string right on the click.";
const DOWN_EVEN = "Come down as evenly as you went up.";
const ON_CHORD = "Start each bar on a note of its chord.";
const FROM_ROOT = "Count up the scale from the root to each note.";
const ROOT_HOME = "Land on the root as the last chord comes.";
const HALF_EB = "Play F and C one fret above E and B.";
const C_LOOP = "Count the last C's two beats, then go again.";
const DOWN_EDC = "Say E, D, C as you come back down.";
const HOP_KEY = "Hop finger two a string over for each new key.";
const LONG_A = "Hold the long A two beats, then come in.";
const END_LOW_A = "End on the low A and let it ring two beats.";
const F_SHARP_A9 = "Play F sharp at the A string's fret nine.";
const B_FLAT_D8 = "Keep B flat on the D string's fret eight.";
const STILL_HAND = "Keep the hand still: one finger per fret.";
const CHORD_NAMES = "Say each chord's name on its long note.";
const CHORD_LATE = "Put each chord's first note on the click.";
const CHORD_EARLY = "Wait for the click before each new chord.";
const HOP_ROOT = "Hop the same finger to the next root in time.";
const LONG_TWO = "Count each long note's two beats, then go.";
const LONG_OUT = "Count each long note out, then move on.";
const RAISED_LISTEN = "Listen for the raised seventh each time.";
const RAISE_SEVENTH = "Raise the seventh: one fret under the root.";
const FINGER_TWO_SEVENTH = "Put finger two on the raised seventh.";
const EXTRAS3 = "Play three notes to each click, no more.";
const GROUP_UP = "Start each group one scale note higher.";
const GROUP_LATE = "Put each group's first note on the click.";
const GROUP_EARLY = "Wait for the click before each group.";
const GROUPS_TOP = "Keep the groups even right to the top.";
const COUNT_TWO = "Count up two scale notes, not two frets.";
const PAIR_LATE = "Put each pair's first note on the click.";
const PAIR_EARLY = "Wait for the click before each new pair.";
const LAST_TWO = "Give each of the last two notes a full click.";
const SHAPE_STRING = "Let the shape tell you which string is next.";
const PAIRS_TOP = "Keep the pairs even right to the top note.";
const MOVE_ON = "Move on as soon as each note sounds.";
// The same orders naming no fret, string, shape or distance: for warm-ups whose shape changes between Takes.
const TWICE_EVEN = "Play it twice: the second time just as even.";
const FIRST_READY = "Have the first note ready as the held one ends.";
const CLOSE = "Keep the pick close to the strings.";

export const SCALES_AND_MODES_CUES: CueBook = {
  // Step 1: the major scale
  "major-scale.c-open": [
    g("Say C, D, E, F, G, A, B, C as you climb.", 1),
    c("notes", HALF_EB, 1),
    c("heard", HEARD),
    c("extras", EXTRAS4, 0),
    c("late", NEXT_FINGER),
    c("early", EARLY),
    c("afterHeld", C_LOOP),
    c("openString", OPEN_CLICK),
    c("stringChange", CROSS),
    c("lastBars", DOWN_EDC),
  ],
  "major-scale.g-open": [
    g("Say each note's name as you play it: G to G.", 1),
    c("notes", "Play F sharp at the D string's fret four.", 1),
    c("heard", HEARD),
    c("extras", EXTRAS4, 0),
    c("late", NEXT_FINGER),
    c("early", EARLY),
    c("afterHeld", "Count the last G's two beats, then go again."),
    c("openString", OPEN_CLICK),
    c("stringChange", CROSS),
    c("lastBars", "Say B, A, G as you come back down."),
  ],
  "major-scale.formula": [
    g("Say 'whole, whole, half' as the finger moves.", 1),
    c("notes", "Say 'half' as you play notes four and eight."),
    c("heard", HEARD_ANY),
    c("extras", EXTRAS4, 0),
    c("late", SEE_NEXT),
    c("early", MOVE_EARLY),
    c("afterHeld", "Count the long note's two beats, then go."),
    c("shift", MOVE_ON),
    c("lastBars", STEPS_END),
  ],
  "major-scale.ode": [
    g("Sing the tune as you play it."),
    c("notes", "Use the B string for D and C: frets three, one.", 1),
    c("heard", HEARD),
    c("extras", EXTRAS_TAB),
    c("late", "Have the next fret ready before the click."),
    c("early", EARLY),
    c("afterHeld", "Hold the last D two beats, then start again."),
    c("openString", "Put each open E right on the click."),
    c("stringChange", CROSS),
    c("lastBars", "Play the short D on the 'and' of '2'.", 0),
  ],

  // Step 2: the movable shape
  "movable-major.one-octave": [
    g("Keep one finger per fret; the hand stays still.", 1),
    c("notes", "Put finger two on the root before you start.", 1),
    c("heard", HEARD),
    c("extras", EXTRAS8, 0),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("afterHeld", HELD_LOOP),
    c("stringChange", CROSS),
    c("lastBars", DOWN_EVEN),
  ],
  "movable-major.two-octaves": [
    g(STILL_HAND, 1),
    c("notes", "Play the B string with fingers two and four.", 1),
    c("heard", HEARD),
    c("extras", EXTRAS8, 0),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("afterHeld", HELD_LOOP),
    c("stringChange", CROSS),
    c("lastBars", DOWN_EVEN),
  ],
  "movable-major.in-thirds": [
    g("Say 'one-three, two-four' as you play the pairs.", 1),
    c("notes", COUNT_TWO),
    c("heard", HEARD),
    c("extras", EXTRAS8, 0),
    c("late", PAIR_LATE),
    c("early", PAIR_EARLY),
    c("afterHeld", LAST_TWO),
    c("stringChange", SHAPE_STRING, 1),
    c("lastBars", PAIRS_TOP),
  ],
  "movable-major.tune-in-a": [
    g(ON_CHORD, 1),
    c("notes", "Play G sharp at the D string's fret six."),
    c("heard", HEARD),
    c("extras", EXTRAS_TAB),
    c("late", BAND_LATE, 2),
    c("early", BAND_EARLY, 2),
    c("afterHeld", LONG_A),
    c("stringChange", CROSS),
    c("lastBars", END_LOW_A),
  ],

  // Step 3: what a key is
  "what-a-key-is.c-by-name": [
    g("Say C, D, E, F, G, A, B, C as you climb.", 2),
    c("notes", HALF_EB, 1),
    c("heard", HEARD),
    c("extras", EXTRAS4, 0),
    c("late", NEXT_FINGER, 1),
    c("early", EARLY),
    c("afterHeld", C_LOOP),
    c("stringChange", CROSS),
    c("lastBars", DOWN_EDC, 2),
  ],
  "what-a-key-is.g-and-d": [
    g("Keep the hand at fret nine for both keys.", 3),
    c("notes", "Play C sharp at fret eleven in the D bars.", 2),
    c("heard", HEARD),
    c("extras", EXTRAS8, 0),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("afterHeld", HOP_KEY, 4),
    c("stringChange", CROSS),
    c("lastBars", "Come down to the long D, then back to G."),
  ],
  "what-a-key-is.one-four-five": [
    g("Say 'one, four, five' as each chord comes.", 3),
    c("notes", FROM_ROOT, 1),
    c("heard", HEARD),
    c("extras", EXTRAS_TAB),
    c("late", BAND_LATE),
    c("early", BAND_EARLY),
    c("afterHeld", LONG_EACH),
    c("stringChange", CROSS),
    c("lastBars", ROOT_HOME),
  ],
  "what-a-key-is.tune-two-keys": [
    g("Play the tune again two frets higher in D.", 2),
    c("notes", "Keep the same fingers when the tune moves up.", 2),
    c("heard", HEARD),
    c("extras", EXTRAS_TAB),
    c("late", BAND_LATE),
    c("early", BAND_EARLY),
    c("afterHeld", LONG_TWO),
    c("shift", SHIFT_TWO, 2),
    c("stringChange", CROSS),
    c("lastBars", "Hold the long D, then go back down for C.", 2),
  ],

  // Step 4: keys by hand
  "keys-by-hand.a-by-name": [
    g("Say each name, sharps too, as you climb.", 2),
    c("notes", "Play G sharp one fret under the D string's A.", 3),
    c("heard", HEARD),
    c("extras", EXTRAS4, 0),
    c("late", NEXT_FINGER, 1),
    c("early", EARLY),
    c("afterHeld", "Count the last A's two beats, then go again."),
    c("stringChange", CROSS),
    c("lastBars", "Say C sharp, B, A as you come back down.", 2),
  ],
  "keys-by-hand.c-then-f": [
    g("Keep the hand at fret seven for both keys.", 3),
    c("notes", "Play B flat at fret eight in the F bars.", 2),
    c("heard", HEARD),
    c("extras", EXTRAS8, 0),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("afterHeld", HOP_KEY, 4),
    c("stringChange", CROSS),
    c("lastBars", "Come down to the long F, then back to C."),
  ],
  "keys-by-hand.one-five-four": [
    g("Say 'one, five, four' as each chord comes.", 3),
    c("notes", FROM_ROOT, 1),
    c("heard", HEARD),
    c("extras", EXTRAS_TAB),
    c("late", BAND_LATE),
    c("early", BAND_EARLY),
    c("afterHeld", LONG_EACH),
    c("stringChange", CROSS),
    c("lastBars", ROOT_HOME),
  ],
  "keys-by-hand.tune-in-f": [
    g(ON_CHORD),
    c("notes", B_FLAT_D8, 3),
    c("heard", HEARD),
    c("extras", EXTRAS_TAB),
    c("late", BAND_LATE),
    c("early", BAND_EARLY),
    c("afterHeld", "Hold the long F two beats, then come in."),
    c("stringChange", CROSS),
    c("lastBars", "End on the long F and let it ring two beats.", 2),
  ],

  // Step 5: the relative minor
  "relative-minor.minor-shape": [
    g("Fingers one, three, four on the low two strings.", 1),
    c("notes", "Play the third three frets above the root."),
    c("heard", HEARD),
    c("extras", EXTRAS8, 0),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("afterHeld", HELD_LOOP),
    c("stringChange", CROSS),
    c("lastBars", DOWN_EVEN),
  ],
  "relative-minor.two-homes": [
    g("Listen for home: C first, then A."),
    c("notes", "Start C on the A string, A on the low E string."),
    c("heard", HEARD),
    c("extras", EXTRAS8, 0),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("afterHeld", LONG_BEAT),
    c("shift", "Move the hand during each long note.", 1),
    c("stringChange", CROSS),
    c("lastBars", "Come down to the low A and hold it a beat."),
  ],
  "relative-minor.minor-tune": [
    g(ON_CHORD),
    c("notes", "Keep it all in the minor shape at fret five.", 1),
    c("heard", HEARD),
    c("extras", EXTRAS_TAB),
    c("late", BAND_LATE),
    c("early", BAND_EARLY),
    c("afterHeld", LONG_A),
    c("stringChange", CROSS),
    c("lastBars", END_LOW_A),
  ],

  // Step 6: a second minor key
  "minor-second-key.three-frets-down": [
    g("Say each name from E to E as you climb.", 2),
    c("notes", F_SHARP_A9, 1),
    c("heard", HEARD),
    c("extras", EXTRAS4, 0),
    c("late", NEXT_FINGER),
    c("early", EARLY),
    c("afterHeld", "Hold the long E two beats, then climb."),
    c("stringChange", CROSS),
    c("lastBars", "Keep coming down: A, then G, F sharp, E.", 3),
  ],
  "minor-second-key.g-and-e-minor": [
    g("Listen for home: G first, then E."),
    c("notes", "Keep F sharp in both halves of the line.", 4),
    c("heard", HEARD),
    c("extras", EXTRAS8, 0),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("afterHeld", LONG_BEAT),
    c("shift", SHIFT_TWO, 3),
    c("stringChange", CROSS),
    c("lastBars", "Come down to the long E, then back up for G.", 3),
  ],
  "minor-second-key.d-minor-and-f": [
    g("Listen for home: D first, then F."),
    c("notes", B_FLAT_D8, 4),
    c("heard", HEARD),
    c("extras", EXTRAS8, 0),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("afterHeld", LONG_BEAT),
    c("shift", SHIFT_TWO, 3),
    c("stringChange", CROSS),
    c("lastBars", "Come down to the long F, then back to D.", 3),
  ],
  "minor-second-key.e-minor-tune": [
    g(ON_CHORD),
    c("notes", F_SHARP_A9, 2),
    c("heard", HEARD),
    c("extras", EXTRAS_TAB),
    c("late", BAND_LATE),
    c("early", BAND_EARLY),
    c("afterHeld", "Hold the long E two beats, then come in."),
    c("stringChange", CROSS),
    c("lastBars", "End on the lower E and let it ring two beats.", 1),
  ],

  // Step 7: chords from the scale
  "chords-from-the-scale.seven-chords": [
    g(CHORD_NAMES, 4),
    c("notes", "Skip one scale note between each chord note.", 1),
    c("heard", HEARD),
    c("extras", EXTRAS_TAB, 0),
    c("late", CHORD_LATE),
    c("early", CHORD_EARLY),
    c("afterHeld", HOP_ROOT, 3),
    c("stringChange", CROSS),
    c("lastBars", "Put the high root's group right on '3'."),
  ],
  "chords-from-the-scale.seven-chords-from-a": [
    g(CHORD_NAMES),
    c("notes", "Play G at the D string's fret five.", 3),
    c("heard", HEARD),
    c("extras", EXTRAS_TAB, 0),
    c("late", CHORD_LATE),
    c("early", CHORD_EARLY),
    c("afterHeld", HOP_ROOT, 2),
    c("stringChange", CROSS),
    c("lastBars", "Hold the last A for its two beats.", 0),
  ],
  "chords-from-the-scale.chord-then-walk": [
    g("Play the chord's three notes on '1', '2', '3'.", 3),
    c("notes", "Walk down the scale into the next root.", 1),
    c("heard", HEARD),
    c("extras", EXTRAS_TAB, 0),
    c("late", BAND_LATE),
    c("early", BAND_EARLY),
    c("afterHeld", "Hold the long G two beats, then start again."),
    c("stringChange", CROSS),
    c("lastBars", "Play the high C chord, then hold the G.", 2),
  ],
  "chords-from-the-scale.landing-tune": [
    g(ON_CHORD),
    c("notes", "Start on E, the G string's fret nine.", 3),
    c("heard", HEARD),
    c("extras", EXTRAS_TAB),
    c("late", BAND_LATE),
    c("early", BAND_EARLY),
    c("afterHeld", LONG_TWO),
    c("stringChange", CROSS),
    c("lastBars", "Hold the long D, then start again on E.", 2),
  ],

  // Step 8: the harmonic minor
  "harmonic-minor.harmonic-shape": [
    g(RAISED_LISTEN),
    c("notes", RAISE_SEVENTH),
    c("heard", HEARD),
    c("extras", EXTRAS8, 0),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("afterHeld", HELD_LOOP),
    c("stringChange", FINGER_TWO_SEVENTH, 1),
    c("lastBars", DOWN_EVEN),
  ],
  "harmonic-minor.harmonic-lick": [
    g("Lean on G sharp over E7, rest on A over Am."),
    c("notes", "Play G sharp at the D string's fret six.", 1),
    c("heard", HEARD),
    c("extras", EXTRAS_TAB),
    c("late", BAND_LATE),
    c("early", BAND_EARLY),
    c("afterHeld", LONG_EACH),
    c("stringChange", CROSS),
    c("lastBars", "End on G sharp and let it pull to A."),
  ],
  "harmonic-minor.natural-then-harmonic": [
    g("Play G the first time up, G sharp the second."),
    c("notes", "Play G at fret five, then G sharp at six.", 1),
    c("heard", HEARD),
    c("extras", EXTRAS8, 0),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("afterHeld", HELD_LOOP),
    c("stringChange", CROSS),
    c("lastBars", DOWN_EVEN),
  ],

  // Step 9: the harmonic minor again
  "harmonic-minor-again.e-harmonic-shape": [
    g(RAISED_LISTEN),
    c("notes", RAISE_SEVENTH, 2),
    c("heard", HEARD),
    c("extras", EXTRAS8, 0),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("afterHeld", HELD_LOOP),
    c("stringChange", FINGER_TWO_SEVENTH, 1),
    c("lastBars", DOWN_EVEN),
  ],
  "harmonic-minor-again.e-natural-then-harmonic": [
    g("Play D the first time up, D sharp the second."),
    c("notes", "Play D with finger one, D sharp with two.", 2),
    c("heard", HEARD),
    c("extras", EXTRAS8, 0),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("afterHeld", HELD_LOOP),
    c("stringChange", CROSS),
    c("lastBars", DOWN_EVEN),
  ],
  "harmonic-minor-again.d-sharp-over-b7": [
    g("Lean on D sharp over B7, rest on G over Em."),
    c("notes", "Play D sharp at the G string's fret eight.", 1),
    c("heard", HEARD),
    c("extras", EXTRAS_TAB),
    c("late", BAND_LATE),
    c("early", BAND_EARLY),
    c("afterHeld", LONG_EACH),
    c("stringChange", CROSS),
    c("lastBars", "End on D sharp and let it pull to E.", 2),
  ],
  "harmonic-minor-again.minor-one-four-five": [
    g("Raise the seventh over the five chord only."),
    c("notes", "Keep the plain seventh over the other chords."),
    c("heard", HEARD),
    c("extras", EXTRAS_TAB),
    c("late", BAND_LATE),
    c("early", BAND_EARLY),
    c("afterHeld", LONG_OUT),
    c("stringChange", CROSS),
    c("lastBars", "Land on the root and hold it two beats."),
  ],

  // Step 10: sequences
  "sequences.threes": [
    g("Count 'one-trip-let', a group to each click.", 0),
    c("notes", GROUP_UP, 1),
    c("heard", HEARD),
    c("extras", EXTRAS3),
    c("late", GROUP_LATE, 1),
    c("early", GROUP_EARLY),
    c("stringChange", CROSS),
    c("lastBars", GROUPS_TOP),
  ],
  "sequences.fours": [
    g("Lean a little on each group's first note.", 1),
    c("notes", GROUP_UP),
    c("heard", HEARD),
    c("extras", EXTRAS8, 0),
    c("late", "Put each group's first note on '1' or '3'.", 1),
    c("early", GROUP_EARLY),
    c("stringChange", CROSS),
    c("lastBars", GROUPS_TOP),
  ],
  "sequences.thirds": [
    g("Think 'skip one' for every pair.", 1),
    c("notes", COUNT_TWO),
    c("heard", HEARD),
    c("extras", EXTRAS8, 0),
    c("late", PAIR_LATE),
    c("early", PAIR_EARLY),
    c("afterHeld", LAST_TWO),
    c("stringChange", SHAPE_STRING, 1),
    c("lastBars", PAIRS_TOP),
  ],
  "sequences.threes-down": [
    g("Start each group one scale note lower.", 1),
    c("notes", "Play B at the G string's fret four.", 1),
    c("heard", HEARD),
    c("extras", EXTRAS3),
    c("late", GROUP_LATE),
    c("early", GROUP_EARLY),
    c("shift", "Reach finger one back a fret for each B.", 1),
    c("stringChange", CROSS),
    c("lastBars", "Hold the low A until the count ends."),
  ],

  // Step 11: more of the neck
  "more-neck.two-positions": [
    g("Shift on the repeated note, finger four to one.", 1),
    c("notes", "Play the B string at five, six and eight."),
    c("heard", HEARD),
    c("extras", EXTRAS8, 0),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("shift", "Move during the first of the two fret fives.", 1),
    c("stringChange", CROSS),
    c("lastBars", "Come down to the A string's fret three."),
  ],
  "more-neck.three-per-string": [
    g("Give each string one click: three notes.", 1),
    c("notes", "Play the D and G strings at nine, ten, twelve.", 1),
    c("heard", HEARD),
    c("extras", EXTRAS3, 0),
    c("late", "Put each string's first note on the click."),
    c("early", "Wait for the click before each new string."),
    c("shift", "Move finger one up a fret on the D string.", 1),
    c("stringChange", CROSS),
    c("lastBars", "Keep the way down as even as the way up."),
  ],
  "more-neck.walk-and-shape": [
    g("Play the same eight notes along, then across.", 1),
    c("notes", "Say 'whole, whole, half' along the string.", 1),
    c("heard", HEARD),
    c("extras", EXTRAS_TAB, 0),
    c("late", SEE_NEXT),
    c("early", EARLY),
    c("afterHeld", "Hold the long A, then move to fret five.", 1),
    c("shift", MOVE_ON),
    c("stringChange", CROSS),
    c("lastBars", "Play the eighths as evenly as the quarters."),
  ],

  // Step 12: the second shape
  "second-shape.a-string-shape": [
    g("Move the hand up a fret for the top two strings.", 1),
    c("notes", "Play three notes below the root, then climb.", 2),
    c("heard", HEARD),
    c("extras", EXTRAS8, 0),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("afterHeld", "Hold the note under the root, then start again.", 2),
    c("shift", "Move a fret as you cross the G and B strings.", 1),
    c("stringChange", CROSS),
    c("lastBars", "Turn at the lowest note and climb back.", 2),
  ],
  "second-shape.one-octave-two-places": [
    g("Play the same eight notes in two places.", 2),
    c("notes", "Keep the same fingers in both halves.", 2),
    c("heard", HEARD),
    c("extras", EXTRAS8, 0),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("afterHeld", LONG_BEAT),
    c("shift", "Move five frets as each half's last note ends.", 2),
    c("stringChange", CROSS),
    c("lastBars", "Land on the root, then move back for the repeat.", 2),
  ],
  "second-shape.shapes-joined": [
    g("Join the shapes on the G string, both ways.", 1),
    c("notes", "Play the top string with fingers one and two.", 1),
    c("heard", HEARD),
    c("extras", EXTRAS8, 0),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("afterHeld", "Hold the root two beats, then start again."),
    c("shift", "Lead with finger one up, finger four down.", 2),
    c("stringChange", CROSS),
    c("lastBars", "Come down to the root and hold it two beats."),
  ],
  "second-shape.tune-both-shapes": [
    g("Play the tune low, then an octave higher."),
    c("notes", "Start the octave-up half with the fourth finger.", 2),
    c("heard", HEARD),
    c("extras", EXTRAS_TAB),
    c("late", BAND_LATE),
    c("early", BAND_EARLY),
    c("afterHeld", LONG_TWO),
    c("shift", "Move the hand as each long D ends.", 2),
    c("stringChange", CROSS),
    c("lastBars", "Hold the high D, then go back down to fret four.", 2),
  ],

  // Warm-ups
  "warmup-intermediate.shape-of-the-day": [
    g(TWICE_EVEN, 0),
    c("heard", HEARD_ANY),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("afterHeld", HELD_LOOP),
    c("shift", FIRST_READY, 0),
    c("stringChange", CLOSE),
    c("lastBars", "Keep the second time as even as the first."),
  ],
  "warmup-beginner.scale-walk": [
    g("Say 'whole' or 'half' as you move.", 0),
    c("heard", HEARD_ANY),
    c("late", SEE_NEXT),
    c("early", MOVE_EARLY),
    c("shift", "Start one note higher as each bar starts.", 0),
    c("lastBars", STEPS_END),
  ],
};
