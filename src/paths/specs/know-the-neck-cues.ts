/**
 * Know the Neck: one thing to try, per Exercise (leg cues4, 2026-11-20).
 *
 * This Path teaches where the notes are, so its orders are a fretboard
 * teacher's: say the note's name as it sounds, find it from the open string,
 * the marker dots or a shape you know (the octave, the same note on the next
 * string), and see the next place before the hand goes there. The `notes` cue
 * (a wrong pitch was heard) always says how to find the right note. The app
 * hears when a note sounded and which pitch; it cannot hear the name said, or
 * which string a pitch was played on, so no cue says or implies it did.
 *
 * Exercises that change key, string or chords between Takes name no string,
 * fret or note; every other Exercise is one version and may.
 * Drafts, proof-read by a second reader: see `plans/coach/progress/cues4.md`.
 */
import type { Cue, CueTrigger } from "../format";
import type { CueBook } from "../spec";

const c = (when: CueTrigger, say: string, more?: number): Cue => (more === undefined ? { when, say } : { when, say, more });
/** The general cue: said with nothing measured, and when evenness decided a Take. */
const g = (say: string, more?: number): Cue => ({ ...c("even", say, more), general: true });

// Shared orders, word for word, so each is translated once.
const HEARD = "Press right behind each fret so it rings.";
const EXTRAS = "Play one note on each click, no more.";
const LATE = "Look at the next fret before the click.";
const EARLY = "Wait for the click before each new note.";
const HELD = "Count each long note's two clicks, then move.";
const HELD_LOOP = "Count the last note's two clicks, then go again.";
const HELD_WHOLE = "Count the last note's four clicks, then go.";
const CROSS = "Keep the pick close as you cross strings.";
const DOTS = "Find frets five, seven and twelve by the dots.";
const OPEN_CLICK = "Put the open string right on the click.";
const SHAPE_MOVE = "Move both fingers as one shape to each fret.";
const KEEP_NAMING = "Keep naming the notes to the last one.";
const BY_SHAPE = "Find each note by shape, not by counting.";
const BAR_MOVE = "Move the hand as each bar starts.";
const SAY_NAME ="Say each note's name as you play it.";
const ONE_PER_FRET3 = "Keep one finger per fret, three in a row.";
const SKIP_BETWEEN = "Skip the string between the two notes.";
// The same orders naming no fret, string, shape or interval: for Exercises whose notes move between Takes.
const HEARD_ANY = "Press each note firmly so it rings.";
const LATE_SAY = "Say each note's name before you play it.";
const LATE_FIND = "Find each note's place before its click.";
const CLOSE = "Keep the pick close to the strings.";
const LOOK_AHEAD = "Look ahead while each note rings.";
const TOGETHER = "Move both fingers together each time.";
const OPEN_ANY = "Put the unfretted notes right on the click.";
// Named places, said where the Exercise has one version.
const DOWN_DAE = "Say D, A, E as you come back down.";

/** A one-string walk of the natural notes from the open string to fret 12 and back. */
const walk = (gen: string, notes: string, open: string, last: string): Cue[] => [
  g(gen),
  c("notes", notes, 1),
  c("heard", HEARD),
  c("extras", EXTRAS),
  c("late", LATE),
  c("early", EARLY),
  c("afterHeld", HELD_LOOP),
  c("openString", open),
  c("shift", DOTS),
  c("lastBars", last),
];

export const KNOW_THE_NECK_CUES: CueBook = {
  // Level 1 (Beginner), Step 1: the low E and A strings
  "low-strings.open-strings": [
    g("Say each string's name as you pick it.", 2),
    c("notes", "Count up from the low E to find each string."),
    c("heard", "Pick each string firmly enough to ring."),
    c("extras", "Pick one string on each click, no more."),
    c("late", "Find the next string before the click."),
    c("early", "Wait for the click before each new string."),
    c("afterHeld", "Count the open E's two clicks, then go again."),
    c("openString", "Keep the fretting hand off the strings."),
    c("stringChange", "Move the pick one string at a time."),
    c("lastBars", DOWN_DAE),
  ],
  "low-strings.low-e-naturals": walk(
    "Name each note aloud: E, F, G, A, B, C, D.",
    "Find F at fret one and C at fret eight.",
    "Put the open E right on the click.",
    "Name G, F and E on the way back down.",
  ),
  "low-strings.a-string-naturals": walk(
    "Name each note aloud: A, B, C, D, E, F, G.",
    "Find C at fret three and F at fret eight.",
    "Put the open A right on the click.",
    "Name C, B and A on the way back down.",
  ),
  "low-strings.two-places": [
    g("Say each name twice, once on each string."),
    c("notes", "Play the A string five frets below the low E.", 1),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", "Find the A string's fret before the click."),
    c("early", EARLY),
    c("afterHeld", HELD),
    c("openString", "Put the open A right on its click."),
    c("shift", "Shift on the way back to the low E string."),
    c("stringChange", CROSS),
    c("lastBars", "Name E twice: fret twelve, then fret seven."),
  ],
  // Step 2: octaves
  "octaves.octave-e-d": [
    g("See the octave shape: two strings, two frets."),
    c("notes", "Put finger three two frets up on the D string.", 1),
    c("heard", HEARD),
    c("extras", SKIP_BETWEEN),
    c("late", "Have the octave shape ready before the click."),
    c("early", EARLY),
    c("afterHeld", HELD),
    c("shift", SHAPE_MOVE),
    c("stringChange", CROSS),
    c("lastBars", "Say G for both of the last two notes."),
  ],
  "octaves.octave-a-g": [
    g("Move the octave shape over one string."),
    c("notes", "Put finger three two frets up on the G string.", 1),
    c("heard", HEARD),
    c("extras", SKIP_BETWEEN),
    c("late", "Have the octave shape ready before the click."),
    c("early", EARLY),
    c("afterHeld", HELD),
    c("shift", SHAPE_MOVE),
    c("stringChange", CROSS),
    c("lastBars", "Say C for both of the last two notes."),
  ],
  "octaves.octave-d-b": [
    g("Say one name for both notes of each pair."),
    c("notes", "Take each higher note with the little finger.", 1),
    c("heard", HEARD_ANY),
    c("extras", EXTRAS),
    c("late", LATE_SAY),
    c("early", EARLY),
    c("afterHeld", HELD),
    c("shift", TOGETHER),
    c("stringChange", CLOSE),
    c("lastBars", "Finish on the opening pair, two clicks each."),
  ],
  "octaves.every-a": [
    g("Say the same name at every place you play."),
    c("notes", "Find each place from the one before it.", 1),
    c("heard", HEARD_ANY),
    c("extras", EXTRAS),
    c("late", LATE_FIND),
    c("early", EARLY),
    c("afterHeld", HELD_WHOLE),
    c("shift", LOOK_AHEAD),
    c("stringChange", CLOSE),
    c("lastBars", KEEP_NAMING),
  ],
  // Step 3: the roots of the open chords
  "chord-roots.open-chord-roots": [
    g("Say the chord each root belongs to."),
    c("notes", "Put finger three on fret three for G and C.", 2),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", LATE),
    c("early", EARLY),
    c("afterHeld", "Count the open E's two clicks, then go again."),
    c("openString", "Put each open root right on the click."),
    c("stringChange", CROSS),
    c("lastBars", DOWN_DAE),
  ],
  "chord-roots.roots-octave-up": [
    g("Find each root's octave: two strings, two frets."),
    c("notes", "Put finger two on both notes at fret two.", 2),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", "Have the octave shape ready before the click."),
    c("early", EARLY),
    c("afterHeld", HELD),
    c("openString", "Put the open E and A right on the click."),
    c("shift", "Move up to fret three for G and C."),
    c("stringChange", CROSS),
    c("lastBars", "Say E for both of the last two notes."),
  ],
  "chord-roots.roots-wide-shape": [
    g("Reach three frets up from the D and G strings."),
    c("notes", "Reach the octave with the little finger.", 2),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", "Have the octave shape ready before the click."),
    c("early", EARLY),
    c("afterHeld", HELD),
    c("openString", "Put the open D right on the click."),
    c("shift", "Move up to fret five for G and C."),
    c("stringChange", CROSS),
    c("lastBars", "Say D for both of the last two notes."),
  ],
  "chord-roots.roots-walk": [
    g(SAY_NAME),
    c("notes", "Picture each place before you play it.", 2),
    c("heard", HEARD_ANY),
    c("extras", EXTRAS),
    c("late", LATE_SAY),
    c("early", EARLY),
    c("afterHeld", HELD),
    c("openString", OPEN_ANY),
    c("stringChange", CLOSE),
    c("lastBars", KEEP_NAMING),
  ],
  // Step 4: the D, G and B strings
  "upper-strings.d-string-naturals": walk(
    "Name each note aloud: D, E, F, G, A, B, C.",
    "Find F at fret three and C at fret ten.",
    "Put the open D right on the click.",
    "Name F, E and D on the way back down.",
  ),
  "upper-strings.g-string-naturals": walk(
    "Name each note aloud: G, A, B, C, D, E, F.",
    "Find C at fret five and F at fret ten.",
    "Put the open G right on the click.",
    "Name B, A and G on the way back down.",
  ),
  "upper-strings.b-string-naturals": walk(
    "Name each note aloud: B, C, D, E, F, G, A.",
    "Find C at fret one and F at fret six.",
    "Put the open B right on the click.",
    "Name D, C and B on the way back down.",
  ),
  "upper-strings.one-note-six-strings": [
    g("Say the same name on every string."),
    c("notes", "Find each place from the one before it."),
    c("heard", HEARD_ANY),
    c("extras", EXTRAS),
    c("late", LATE_FIND),
    c("early", EARLY),
    c("afterHeld", HELD_WHOLE),
    c("shift", LOOK_AHEAD, 1),
    c("stringChange", CLOSE),
    c("lastBars", KEEP_NAMING),
  ],
  // Step 5: the notes in between
  "in-between.between-low-e": [
    g("Name each in-between note from its neighbours.", 1),
    c("notes", ONE_PER_FRET3, 2),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", LATE),
    c("early", EARLY),
    c("afterHeld", HELD_LOOP),
    c("shift", BAR_MOVE, 2),
    c("lastBars", "Say E, E flat, E to finish."),
  ],
  "in-between.between-a-string": [
    g("Find the same four names on the A string.", 1),
    c("notes", ONE_PER_FRET3, 2),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", LATE),
    c("early", EARLY),
    c("afterHeld", HELD_LOOP),
    c("openString", "Put the open A right on the click."),
    c("shift", "Take the second D with finger one.", 2),
    c("lastBars", "Say G, F sharp, G to finish."),
  ],
  "in-between.every-fret": [
    g("Say sharps going up and flats coming down.", 1),
    c("notes", "Keep one finger per fret, four in a row.", 2),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", LATE),
    c("early", EARLY),
    c("afterHeld", HELD_WHOLE),
    c("openString", OPEN_CLICK),
    c("shift", BAR_MOVE, 2),
    c("lastBars", "Keep naming flats right down to the open string."),
  ],
  "in-between.between-by-octave": [
    g("Say one name for both notes of each pair.", 2),
    c("notes", "Take each higher note with finger three.", 1),
    c("heard", HEARD_ANY),
    c("extras", EXTRAS),
    c("late", LATE_SAY),
    c("early", EARLY),
    c("afterHeld", HELD),
    c("shift", TOGETHER),
    c("stringChange", CLOSE),
    c("lastBars", "Say the first name again for the last pair."),
  ],
  // Level 1 warm-up: a key and a string that change every Take
  "warmup-beginner.walk-a-string": [
    g(SAY_NAME),
    c("heard", HEARD_ANY),
    c("late", LATE_SAY),
    c("early", EARLY),
    c("shift", "Move up a note as each bar starts."),
    c("lastBars", KEEP_NAMING),
  ],
};
