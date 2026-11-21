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
const UP_DOWN = "Keep the way down as even as the way up.";
const MOVE_LAST_ENDS = "Move as each chord's last note ends.";
const BEAT_LATE = "Put the first note of each beat on the click.";
const BEAT_EARLY = "Wait for the click at the start of each beat.";
const SEVENTH_TOP = "Put the seventh on top with finger one.";
const SAY_1625 = "Say one, six, two, five as each chord starts.";
const LOOK_ROOT = "Look at the next root as the seventh sounds.";
const NEXT_READY = "Have the next chord's note ready before '1'.";
const HELD_FOUR = "Count the long root's four beats, then go.";
const LAST_FOUR = "Hold the last root for all four beats.";
const ROLL_TOP3 = "Roll finger one across the top three strings.";
const SAY_TONES = "Say root, third, fifth all the way up.";
const SAY_7TONES = "Say root, third, fifth, seventh as you climb.";
const MOVE_IN_HELD = "Move in the held root's second beat.";
const MOVE_HELD_LENGTH = "Use each held root's length to move.";
const LAST_ROOT_TWO = "Hold the last root for its full two beats.";
const AM_TO_C = "From A minor, go straight back to C on '1'.";
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
    c("lastBars", UP_DOWN),
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
    c("lastBars", UP_DOWN),
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
    c("lastBars", AM_TO_C),
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
    c("shift", MOVE_LAST_ENDS),
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
    c("shift", MOVE_LAST_ENDS),
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

  // Level 2, Step 6: sevenths
  "sevenths.major-seven-minor-seven": [
    g(SEVENTH_TOP, 1),
    c("notes", "Put each seventh on top: fret seven, then three.", 1),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", ROOT_LATE),
    c("early", ROOT_EARLY),
    c("shift", SHIFT_GAP),
    c("stringChange", CROSS),
    c("lastBars", "From A minor seven, go back to C on '1'."),
  ],
  "sevenths.sevenths-in-the-key": [
    g(SAY_1625),
    c("notes", "Roots at frets ten, seven, twelve, five.", 1),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", ROOT_LATE),
    c("early", ROOT_EARLY),
    c("shift", LOOK_ROOT),
    c("stringChange", CROSS),
    c("lastBars", "From G seven, go straight back to C on '1'."),
  ],
  "sevenths.two-five-one": [
    g("Let G seven's seventh fall to C's third.", 2),
    c("notes", "Keep G seven between frets six and ten.", 3),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", CHANGE_LATE),
    c("early", CHANGE_EARLY),
    c("afterHeld", HELD_FOUR),
    c("shift", NEXT_READY, 4),
    c("stringChange", CROSS),
    c("lastBars", LAST_FOUR),
  ],

  // Step 7: sevenths in G
  "sevenths-in-g.g-major-seven-e-minor-seven": [
    g(SEVENTH_TOP, 1),
    c("notes", "Put each seventh on top: fret two, then ten.", 1),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", ROOT_LATE),
    c("early", ROOT_EARLY),
    c("shift", CUT_SHORT, 2),
    c("stringChange", CROSS),
    c("lastBars", "From E minor seven, go back to G on '1'."),
  ],
  "sevenths-in-g.one-six-two-five": [
    g(SAY_1625),
    c("notes", "Roots at frets five, fourteen, seven, twelve.", 1),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", ROOT_LATE),
    c("early", ROOT_EARLY),
    c("shift", LOOK_ROOT, 2),
    c("stringChange", CROSS),
    c("lastBars", "From D seven, go straight back to G on '1'."),
  ],
  "sevenths-in-g.two-five-one": [
    g("Let D seven's seventh fall to G's third.", 2),
    c("notes", "Keep the whole line between frets two and seven.", 2),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", CHANGE_LATE),
    c("early", CHANGE_EARLY),
    c("afterHeld", HELD_FOUR),
    c("shift", NEXT_READY, 4),
    c("stringChange", CROSS),
    c("lastBars", LAST_FOUR),
  ],
  "sevenths-in-g.two-five-one-keys": [
    g("Let five's seventh fall to one's third."),
    c("notes", "Say two, five, one as each chord starts."),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", CHANGE_LATE),
    c("early", CHANGE_EARLY),
    c("afterHeld", HELD_FOUR),
    c("shift", NEXT_READY),
    c("stringChange", CROSS),
    c("lastBars", LAST_FOUR),
  ],

  // Step 8: two octaves
  "two-octaves.a-minor-two": [
    g(ROLL_TOP3, 1),
    c("notes", "Finger four on fret eight for the third.", 1),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("afterHeld", HELD_ROOT),
    c("stringChange", CROSS),
    c("lastBars", UP_DOWN),
  ],
  "two-octaves.c-major-two": [
    g(SAY_TONES),
    c("notes", "Play the A string at fret seven, then ten.", 1),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("afterHeld", HELD_ROOT),
    c("stringChange", CROSS),
    c("lastBars", UP_DOWN),
  ],
  "two-octaves.both-with-the-band": [
    g("Start C at fret eight, A minor at fret five.", 1),
    c("notes", "Roll finger one across fret five for A minor."),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", ROOT_LATE),
    c("early", ROOT_EARLY),
    c("afterHeld", HELD_ROOT),
    c("shift", MOVE_IN_HELD),
    c("stringChange", CROSS),
    c("lastBars", AM_TO_C),
  ],

  // Step 9: more two-octave shapes
  "two-octaves-more.g-major-two": [
    g("Let the hand move a little on the wide frets.", 2),
    c("notes", "Play the A string at fret two, then five.", 1),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("afterHeld", HELD_ROOT),
    c("shift", "Let the hand follow finger four to fret five."),
    c("stringChange", CROSS),
    c("lastBars", UP_DOWN),
  ],
  "two-octaves-more.d-minor-two": [
    g(SAY_TONES),
    c("notes", "Finger four on fret thirteen for the third.", 1),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("afterHeld", HELD_ROOT),
    c("stringChange", CROSS),
    c("lastBars", UP_DOWN),
  ],
  "two-octaves-more.one-four-five-across": [
    g(MOVE_HELD_LENGTH, 2),
    c("notes", "Low roots at frets three, eight, ten, three.", 1),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", ROOT_LATE),
    c("early", ROOT_EARLY),
    c("afterHeld", HELD_ROOT),
    c("shift", MOVE_IN_HELD),
    c("stringChange", CROSS),
    c("lastBars", LAST_ROOT_TWO),
  ],
  "two-octaves-more.minor-across": [
    g(MOVE_HELD_LENGTH),
    c("notes", "Low roots at frets five, ten, twelve, five.", 1),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", ROOT_LATE),
    c("early", ROOT_EARLY),
    c("afterHeld", HELD_ROOT),
    c("shift", MOVE_IN_HELD),
    c("stringChange", CROSS),
    c("lastBars", LAST_ROOT_TWO),
  ],

  // Step 10: sevenths across the neck
  "sevenths-across.a-minor-seven-two": [
    g(SAY_7TONES),
    c("notes", "Put the seventh at the B string's fret eight.", 1),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("afterHeld", HELD_ROOT),
    c("stringChange", CROSS),
    c("lastBars", UP_DOWN),
  ],
  "sevenths-across.c-major-seven-two": [
    g("Keep finger one at fret seven all the way.", 2),
    c("notes", "Play each seventh a fret below its root.", 1),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("afterHeld", HELD_ROOT),
    c("stringChange", CROSS),
    c("lastBars", UP_DOWN),
  ],
  "sevenths-across.g-seven-two": [
    g(SAY_7TONES),
    c("notes", "Finger one back to fret one for the seventh.", 2),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", BEAT_LATE),
    c("early", BEAT_EARLY),
    c("afterHeld", HELD_ROOT),
    c("stringChange", CROSS),
    c("lastBars", UP_DOWN),
  ],
  "sevenths-across.two-five-one-across": [
    g("Start each chord one step from the last note."),
    c("notes", "Move up to fret seven on the A string for C.", 3),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", CHANGE_LATE),
    c("early", CHANGE_EARLY),
    c("afterHeld", HELD_FOUR),
    c("shift", "Move the hand up as C major seven starts.", 3),
    c("stringChange", CROSS),
    c("lastBars", LAST_FOUR),
  ],

  // Step 11: a whole form
  "a-whole-form.twelve-bars": [
    g("Say each chord's name as its bar starts.", 1),
    c("notes", "Start C at ten, F at three, G at five.", 1),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", ROOT_LATE),
    c("early", ROOT_EARLY),
    c("shift", SHIFT_GAP),
    c("stringChange", CROSS),
    c("lastBars", G_TO_C),
  ],
  "a-whole-form.four-chords-keys": [
    g("Say one, six, four, five as each chord starts."),
    c("notes", "Find all four roots before you start."),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", ROOT_LATE),
    c("early", ROOT_EARLY),
    c("shift", SHIFT_GAP),
    c("stringChange", CROSS),
    c("lastBars", "From five, go straight back to one on '1'."),
  ],
  "a-whole-form.your-chorus": [g("Play only the notes of each bar's chord.", 1)],

  // Intermediate warm-up (key and direction change each Take: nothing named)
  "warmup-intermediate.sevenths-round": [
    g("Say each chord's name as you start it.", 0),
    c("heard", HEARD),
    c("late", CHANGE_LATE),
    c("early", CHANGE_EARLY),
    c("shift", MOVE_LAST_ENDS),
    c("stringChange", "Keep the pick close to the strings."),
    c("lastBars", "Keep the quarters even right to the last note."),
  ],
};
