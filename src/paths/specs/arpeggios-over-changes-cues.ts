/**
 * Arpeggios over Changes: one thing to try, per Exercise (leg cues11, 2026-11-20).
 *
 * Chord tones over a progression, one note a string, each note let go as the
 * next sounds. The order a teacher gives here is nearly always about the
 * change: which chord tone to aim at as the new chord starts, where the hand
 * has to be before '1', and the nearest note of the next chord. Tones are
 * named by their number in the chord ("the third"), and frets where the
 * Exercise is one version; never something the app heard about the hand: it
 * hears when notes sounded and which pitches, not fingering, picking or tone.
 *
 * Exercises whose key or shape changes between Takes (`key` variants, the
 * warm-ups) name no chord, fret or note; every other Exercise is one version
 * and may. Drafts, proof-read by a second reader: see
 * `plans/coach/progress/cues11.md`.
 */
import type { Cue, CueTrigger } from "../format";
import type { CueBook } from "../spec";

const c = (when: CueTrigger, say: string, more?: number): Cue => (more === undefined ? { when, say } : { when, say, more });
/** The general cue: said with nothing measured, and when evenness decided a Take. */
const g = (say: string, more?: number): Cue => ({ ...c("even", say, more), general: true });

// Shared orders, word for word, so each is translated once.
const LET_GO = "Let each note go as the next one sounds.";
const HEARD = "Press each note fully before you pick it.";
const EXTRAS = "Pick one string for each note, no more.";
const CROSS = "Keep the pick close as it crosses strings.";
const Q_LATE = "Put each quarter note right on the beat.";
const Q_EARLY = "Wait for the beat on each quarter note.";
const ROOT_LATE = "Land each new chord's root right on '1'.";
const ROOT_EARLY = "Wait for '1' before the new chord's root.";
const CHANGE_LATE = "Land each new chord's first note on '1'.";
const CHANGE_EARLY = "Wait for '1' before the new chord's first note.";
const SHIFT_GAP = "Move the hand on the last eighth before '1'.";
const CUT_SHORT = "Cut each chord's last note short and move.";
const LAST_EVEN = "Keep the eighths even right to the last note.";
const HELD_ROOT = "Count the held root's two beats, then go.";
const HOLD_LAST = "Hold the last root its full two beats.";
const SAY_NAME = "Say each chord's name as you land on its root.";
const ROOT_RING = "Let each root ring for its two beats.";
const D_ONLY = "Keep the pick on the D string only.";
const ARRIVE_ROOT = "Arrive at each new root before '1'.";
const MOVE_AS_ENDS = "Move as the second root ends, not before.";
const SAME_STRING = "Start each chord on the string you ended on.";
const SLIDE_INTO = "Slide along the same string into each chord.";
const LOOK_AHEAD = "Use each bar's last note to see the next root.";
const G_TO_C = "From G, go straight back to C on '1'.";
const D_TO_G = "From D, go straight back to G on '1'.";
const NEAREST = "Start each chord on its nearest note.";
const WITHIN_TWO = "Keep every change within two frets.";
const JUMP_TEN = "Jump back up to fret ten for C on '1'.";

export const ARPEGGIOS_OVER_CHANGES_CUES: CueBook = {
  // Level 1, Step 1: one chord, one octave
  "one-octave.c-major": [
    g(LET_GO, 2),
    c("notes", "Fingers three, two, one: frets ten, nine, eight."),
    c("heard", "Roll finger one across to the top string."),
    c("extras", EXTRAS),
    c("late", Q_LATE),
    c("early", Q_EARLY),
    c("afterHeld", HELD_ROOT),
    c("stringChange", CROSS),
    c("lastBars", HOLD_LAST),
  ],
  "one-octave.a-minor": [
    g("Roll finger one across fret five, note by note.", 1),
    c("notes", "Put the minor third on fret five, not six."),
    c("heard", "Press the roll down fully on each string."),
    c("extras", EXTRAS),
    c("late", Q_LATE),
    c("early", Q_EARLY),
    c("afterHeld", HELD_ROOT),
    c("stringChange", CROSS),
    c("lastBars", HOLD_LAST),
  ],
  "one-octave.major-and-minor": [
    g("Start C at fret ten, A minor at fret seven.", 1),
    c("notes", "Minor third on fret five, major third on nine."),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", ROOT_LATE),
    c("early", ROOT_EARLY),
    c("shift", SHIFT_GAP),
    c("stringChange", CROSS),
    c("lastBars", "From A minor, go straight back to C on '1'."),
  ],

  // Step 2: four chords from their roots
  "four-chords.roots": [
    g(SAY_NAME, 1),
    c("notes", "Third finger: frets ten, seven, three, five.", 0),
    c("heard", ROOT_RING),
    c("extras", D_ONLY),
    c("late", ARRIVE_ROOT),
    c("early", ROOT_EARLY),
    c("shift", MOVE_AS_ENDS),
    c("lastBars", G_TO_C),
  ],
  "four-chords.up-and-down": [
    g(SAME_STRING),
    c("notes", "Count the first frets: ten, five, three, three.", 1),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", CHANGE_LATE),
    c("early", CHANGE_EARLY),
    c("shift", SLIDE_INTO),
    c("stringChange", CROSS),
    c("lastBars", "From G, slide up the D string to C on '1'."),
  ],
  "four-chords.four-arpeggios": [
    g(LOOK_AHEAD, 1),
    c("notes", "Roots at frets ten, seven, three, five.", 1),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", ROOT_LATE),
    c("early", ROOT_EARLY),
    c("shift", SHIFT_GAP),
    c("stringChange", CROSS),
    c("lastBars", G_TO_C),
  ],

  // Step 3: the same four, in G
  "four-chords-in-g.roots-by-name": [
    g(SAY_NAME, 2),
    c("notes", "Third finger: frets five, fourteen, ten, twelve.", 0),
    c("heard", ROOT_RING),
    c("extras", D_ONLY),
    c("late", ARRIVE_ROOT),
    c("early", ROOT_EARLY),
    c("shift", MOVE_AS_ENDS),
    c("lastBars", D_TO_G),
  ],
  "four-chords-in-g.up-and-down": [
    g(SAME_STRING),
    c("notes", "Count the first frets: five, twelve, ten, ten.", 1),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", CHANGE_LATE),
    c("early", CHANGE_EARLY),
    c("shift", CUT_SHORT, 2),
    c("stringChange", CROSS),
    c("lastBars", "From fret twelve, slide down to five for G."),
  ],
  "four-chords-in-g.g-and-e-minor": [
    g("Start G at fret five, E minor at fourteen.", 1),
    c("notes", "Roll finger one across fret twelve for E minor.", 1),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", ROOT_LATE),
    c("early", ROOT_EARLY),
    c("shift", CUT_SHORT, 2),
    c("stringChange", CROSS),
    c("lastBars", "From E minor, go straight back to G on '1'."),
  ],
  "four-chords-in-g.four-arpeggios": [
    g(LOOK_AHEAD, 1),
    c("notes", "Roots at frets five, fourteen, ten, twelve.", 1),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", ROOT_LATE),
    c("early", ROOT_EARLY),
    c("shift", SHIFT_GAP),
    c("stringChange", CROSS),
    c("lastBars", D_TO_G),
  ],

  // Step 4: the nearest note
  "nearest-note.shared-note": [
    g("Start A minor on the same top note.", 2),
    c("notes", "Say C, A, E, C as you come down.", 1),
    c("heard", "Pick the top note again as A minor starts."),
    c("extras", EXTRAS),
    c("late", "Put the repeated top note right on '1'."),
    c("early", "Wait for '1' before playing the top note again."),
    c("shift", "Reach down to fret five right after '1'."),
    c("stringChange", CROSS),
    c("lastBars", JUMP_TEN),
  ],
  "nearest-note.joined": [
    g(NEAREST),
    c("notes", "Start F on its fifth, G on its third.", 2),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", CHANGE_LATE),
    c("early", CHANGE_EARLY),
    c("shift", "Reach down to fret five right after '1'."),
    c("stringChange", CROSS),
    c("lastBars", JUMP_TEN),
  ],
  "nearest-note.your-line": [g("Move to the nearest note of each new chord.", 0)],

  // Step 5: the nearest note, a new order and in G
  "nearest-note-again.new-order": [
    g(WITHIN_TWO),
    c("notes", "Play the top G as C's fifth, then G's root.", 3),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", CHANGE_LATE),
    c("early", CHANGE_EARLY),
    c("shift", SHIFT_GAP),
    c("stringChange", CROSS),
    c("lastBars", "Step back down to fret five for C on '1'."),
  ],
  "nearest-note-again.line-in-g": [
    g("Keep the hand between frets two and five.", 3),
    c("notes", "Start D on its third: F sharp, fret two.", 2),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", CHANGE_LATE),
    c("early", CHANGE_EARLY),
    c("shift", "Put finger one on fret two for D.", 4),
    c("stringChange", CROSS),
    c("lastBars", "From F sharp, play G right on '1'."),
  ],
  "nearest-note-again.new-order-in-g": [
    g(WITHIN_TWO),
    c("notes", "Play the top D as G's fifth, then D's root.", 1),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", CHANGE_LATE),
    c("early", CHANGE_EARLY),
    c("shift", SHIFT_GAP),
    c("stringChange", CROSS),
    c("lastBars", "Step back down to fret twelve for G on '1'."),
  ],
  "nearest-note-again.your-line-in-g": [g("Pick the nearest chord note at each change.", 2)],

  // Beginner warm-up (a new key each Take: nothing named)
  "warmup-beginner.arpeggios-one-four-five": [
    g("Find each root on the D string before '1'.", 0),
    c("heard", HEARD),
    c("late", ROOT_LATE),
    c("early", ROOT_EARLY),
    c("shift", SHIFT_GAP),
    c("stringChange", CROSS),
    c("lastBars", LAST_EVEN),
  ],
};
