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
const EXTRAS = "Play one note on each beat, no more.";
const EXTRAS8 = "Play two notes to each beat, no more.";
const EXTRAS_TAB = "Play just the notes on the tab, no more.";
const EARLY_BEAT = "Wait for the beat before each new note.";
const HELD_LOOP_BEAT = "Count the last note's two beats, then go again.";
const LATE_CHORD = "See each chord's place before '1'.";
const SAY_CHORD = "Say each chord's name on its first beat.";
const NEXT_PAIR = "Have the next pair ready before the click.";
const LAST_PAIR = "Finish on the opening pair, two clicks each.";
const SHIFT_NAME = "Move the first finger with each new name.";
const NEXT_SHAPE = "Move the whole shape in one go, on the beat.";
const SHAPE_READY = "Have the next shape ready before the click.";
const BACK_TO_FIRST = "Go from the middle shape back to the first.";
const GUIDE_TWO = "Move the hand with each new pair, not after.";
const CALL_THIRDS = "Call each third major or minor as you play it.";
const A_TO_C = "Cross to the A string with finger one for C.";
const E_FOR_G = "Drop to the low E string with finger one for G.";
const BACK_G = "Go back to the low E string on '1' for G.";
const BACK_D = "Go back to the A string on '1' for D.";
const EXTRAS_TWO = "Play two notes on each string, no more.";
const EXTRAS_HALF = "Play one note every two beats, no more.";
const HELD_OUT = "Count the held note out, then go again.";
const STRING_PAIRS = "Find the key note first, then count from it.";
const JOIN = "Start each box where the last one ended.";
const SEE_BOX = "See the next box before the hand moves.";
const DOWN_BOXES = "Come down box by box to where you started.";
const SHIFT_OCT = "Shift up as each new octave starts.";
const R3F3 = "Say root, third, fifth, third for each chord.";
const FINGER_AT_TWO = "One finger per fret, finger one at fret two.";
const LAND = "Land on a note of the chord on every '1'.";
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
const walk = (gen: string, notes: string, open: string, last: string, dots = DOTS): Cue[] => [
  g(gen),
  c("notes", notes, 1),
  c("heard", HEARD),
  c("extras", EXTRAS),
  c("late", LATE),
  c("early", EARLY),
  c("afterHeld", HELD_LOOP),
  c("openString", open),
  c("shift", dots),
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
    c("notes", "Find it five frets lower on the A string.", 1),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", "Find the A string's fret before the click."),
    c("early", EARLY),
    c("afterHeld", HELD),
    c("openString", "Put the open A right on its click."),
    c("shift", "Find the low E fret before the hand moves."),
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
    c("lastBars", LAST_PAIR),
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
    c("notes", "Reach three frets up, two strings over.", 2),
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
    "Find frets five and twelve by the dots.",
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
    c("notes", "Keep one finger per fret as the hand moves.", 2),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", LATE),
    c("early", EARLY),
    c("afterHeld", HELD_LOOP),
    c("openString", "Put the open A right on the click."),
    c("shift", "Take the second D with finger one.", 2),
    c("lastBars", "Say G, F sharp, G to finish."),
  ],  "in-between.every-fret": [
    g("Say sharps going up and flats coming down.", 1),
    c("notes", "Keep one finger per fret, four in a row.", 2),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", LATE),
    c("early", EARLY),
    c("afterHeld", HELD_WHOLE),
    c("openString", OPEN_CLICK),
    c("shift", BAR_MOVE, 2),
    c("lastBars", "Land on the open string and let it ring."),
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

  // Level 2 (Intermediate), Step 6: G major and F major on the top strings
  "top-strings-keys.g-major-strings": [
    g("Name the key's one sharp every time it comes.", 1),
    c("notes", "Find the sharp just under the key note.", 1),
    c("heard", HEARD_ANY),
    c("extras", EXTRAS),
    c("late", LATE_SAY),
    c("early", EARLY),
    c("afterHeld", HELD_LOOP),
    c("openString", OPEN_CLICK),
    c("shift", SHIFT_NAME),
    c("lastBars", KEEP_NAMING),
  ],
  "top-strings-keys.f-major-strings": [
    g("Name the key's one flat every time it comes.", 1),
    c("notes", "Find the flat just under its natural note.", 1),
    c("heard", HEARD_ANY),
    c("extras", EXTRAS),
    c("late", LATE_SAY),
    c("early", EARLY),
    c("afterHeld", HELD_LOOP),
    c("shift", "Slide to each new name in one move."),
    c("lastBars", KEEP_NAMING),
  ],
  "top-strings-keys.fifth-position-keys": [
    g("Keep the hand where it is for every note.", 1),
    c("notes", "Find each place from the one before it.", 1),
    c("heard", HEARD_ANY),
    c("extras", EXTRAS8),
    c("late", LATE_SAY),
    c("early", EARLY),
    c("afterHeld", HELD_LOOP),
    c("stringChange", CLOSE),
    c("lastBars", KEEP_NAMING),
  ],
  "top-strings-keys.g-tune": [
    g(SAY_CHORD, 3),
    c("notes", "One finger per fret: five, seven and eight.", 4),
    c("heard", HEARD),
    c("extras", EXTRAS_TAB),
    c("late", "Find each bar's first note before '1'.", 3),
    c("early", EARLY_BEAT),
    c("afterHeld", "Give each quarter note its full beat."),
    c("stringChange", CROSS),
    c("lastBars", "Hold the last G its full two beats."),
  ],
  // Step 7: thirds
  "thirds.thirds-g-b": [
    g(CALL_THIRDS, 1),
    c("notes", "Same fret for major, one fret back for minor.", 1),
    c("heard", HEARD_ANY),
    c("extras", EXTRAS8),
    c("late", NEXT_PAIR),
    c("early", EARLY),
    c("afterHeld", HELD_LOOP),
    c("shift", GUIDE_TWO),
    c("stringChange", CROSS),
    c("lastBars", LAST_PAIR),
  ],
  "thirds.thirds-top": [
    g("Let finger one guide on the top string."),
    c("notes", "Go two frets back for minor, one for major.", 1),
    c("heard", HEARD),
    c("extras", EXTRAS8),
    c("late", NEXT_PAIR),
    c("early", EARLY),
    c("afterHeld", HELD_LOOP),
    c("shift", GUIDE_TWO),
    c("stringChange", CROSS),
    c("lastBars", LAST_PAIR),
  ],
  "thirds.thirds-tune": [
    g("Play root and third, then third and fifth.", 1),
    c("notes", "Find C, F and G at frets five, ten and twelve.", 1),
    c("heard", HEARD),
    c("extras", EXTRAS8),
    c("late", LATE_CHORD),
    c("early", EARLY_BEAT),
    c("afterHeld", HELD_LOOP_BEAT),
    c("shift", "Shift as each bar starts, not after."),
    c("stringChange", CROSS),
    c("lastBars", "Come back down to C and hold it two beats."),
  ],
  // Step 8: roots
  "roots.one-four-five": [
    g("Say one, four, five as you play each root.", 1),
    c("notes", "Fourth at the same fret, fifth two frets up.", 1),
    c("heard", HEARD_ANY),
    c("extras", EXTRAS),
    c("late", "Have each root ready before its click."),
    c("early", EARLY),
    c("afterHeld", HELD_LOOP),
    c("stringChange", CROSS),
    c("lastBars", "Finish on the root, held for two clicks."),
  ],
  "roots.roots-and-fifths": [
    g("Say A, D, E as each chord comes round.", 1),
    c("notes", "Find each fifth one string over, two frets up.", 1),
    c("heard", HEARD),
    c("extras", EXTRAS8),
    c("late", "Have each root ready before its click."),
    c("early", EARLY_BEAT),
    c("afterHeld", HELD_LOOP_BEAT),
    c("shift", "Move the shape to the next root before '1'."),
    c("stringChange", CROSS),
    c("lastBars", "Land back on A and hold it two beats."),
  ],
  "roots.root-octaves": [
    g("See the octave shape under every root.", 1),
    c("notes", "Move the shape to the A string for C.", 1),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", LATE_CHORD),
    c("early", EARLY_BEAT),
    c("shift", SHAPE_MOVE),
    c("stringChange", CROSS),
    c("lastBars", "Say G on both notes of the last chord."),
  ],
  // Step 9: roots in G and D
  "roots-other-keys.g-one-four-five": [
    g(SAY_CHORD, 3),
    c("notes", "Keep finger one at fret three on both strings.", 2),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", LATE_CHORD),
    c("early", EARLY_BEAT),
    c("stringChange", A_TO_C),
    c("lastBars", BACK_G),
  ],
  "roots-other-keys.d-one-four-five": [
    g(SAY_CHORD, 3),
    c("notes", "Keep finger three at fret five on both strings.", 2),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", LATE_CHORD),
    c("early", EARLY_BEAT),
    c("stringChange", E_FOR_G),
    c("lastBars", BACK_D),
  ],
  "roots-other-keys.g-one-six-four-five": [
    g(SAY_CHORD, 3),
    c("notes", "Lift finger one for E minor's open string.", 2),
    c("heard", HEARD),
    c("extras", EXTRAS8),
    c("late", LATE_CHORD),
    c("early", EARLY_BEAT),
    c("openString", "Leave the hand where it is for the open E."),
    c("stringChange", A_TO_C),
    c("lastBars", BACK_G),
  ],
  "roots-other-keys.d-one-six-four-five": [
    g(SAY_CHORD, 3),
    c("notes", "Move finger one to fret two for B minor.", 2),
    c("heard", HEARD),
    c("extras", EXTRAS8),
    c("late", LATE_CHORD),
    c("early", EARLY_BEAT),
    c("stringChange", E_FOR_G),
    c("lastBars", BACK_D),
  ],
  // Step 10: triads
  "triads.c-three-places": [
    g("Say C, E, G in each of the three shapes.", 1),
    c("notes", "Name the top note: G, then C, then E."),
    c("heard", HEARD),
    c("extras", EXTRAS8),
    c("late", SHAPE_READY),
    c("early", EARLY),
    c("shift", NEXT_SHAPE),
    c("stringChange", CROSS),
    c("lastBars", BACK_TO_FIRST),
  ],
  "triads.am-three-places": [
    g("Say A, C, E in each of the three shapes.", 1),
    c("notes", "Start with all three strings at fret five.", 1),
    c("heard", HEARD),
    c("extras", EXTRAS8),
    c("late", SHAPE_READY),
    c("early", EARLY),
    c("shift", NEXT_SHAPE),
    c("stringChange", CROSS),
    c("lastBars", BACK_TO_FIRST),
  ],
  "triads.near-triads": [
    g("Keep the hand in one place for all three chords."),
    c("notes", "For F, play the B string at fret six.", 1),
    c("heard", HEARD),
    c("extras", EXTRAS8),
    c("late", LATE_CHORD),
    c("early", EARLY_BEAT),
    c("afterHeld", HELD_LOOP_BEAT),
    c("shift", "Move only the fingers the new chord needs."),
    c("stringChange", CROSS),
    c("lastBars", "Roll C once, then hold its lowest note.", 1),
  ],
  // Level 2 warm-up: a key that changes every Take
  "warmup-intermediate.thirds-around": [
    g(CALL_THIRDS),
    c("heard", HEARD_ANY),
    c("late", LATE_SAY),
    c("early", EARLY),
    c("afterHeld", HELD_LOOP),
    c("shift", GUIDE_TWO),
    c("stringChange", CLOSE),
    c("lastBars", LAST_PAIR),
  ],

  // Level 3 (Advanced), Step 11: the five boxes
  "five-boxes.each-box": [
    g("Find every key note before you start.", 1),
    c("notes", STRING_PAIRS, 1),
    c("heard", HEARD_ANY),
    c("extras", EXTRAS_TWO),
    c("late", LATE_SAY),
    c("early", EARLY),
    c("afterHeld", HELD_OUT),
    c("stringChange", CLOSE),
    c("lastBars", KEEP_NAMING),
  ],
  "five-boxes.ladder": [
    g(JOIN, 1),
    c("notes", "Say each note's name, then find its fret."),
    c("heard", HEARD),
    c("extras", EXTRAS8),
    c("late", SEE_BOX),
    c("early", EARLY),
    c("afterHeld", "Give the last note its full beat, then go again."),
    c("shift", "Move the whole hand to the next box's frets.", 1),
    c("stringChange", CROSS),
    c("lastBars", DOWN_BOXES),
  ],
  "five-boxes.three-octaves": [
    g("Say A, C, D, E in each of the three octaves."),
    c("notes", "Start each octave on A: frets five, seven, ten.", 1),
    c("heard", HEARD),
    c("extras", EXTRAS8),
    c("late", LATE),
    c("early", EARLY),
    c("shift", SHIFT_OCT),
    c("stringChange", CROSS),
    c("lastBars", "Hold the top A at fret seventeen two clicks."),
  ],
  // Step 12: the boxes in E minor
  "boxes-second-key.e-minor-each-box": [
    g("Find every key note before you start.", 2),
    c("notes", STRING_PAIRS, 1),
    c("heard", HEARD_ANY),
    c("extras", EXTRAS_TWO),
    c("late", LATE_SAY),
    c("early", EARLY),
    c("afterHeld", HELD_OUT),
    c("stringChange", CLOSE),
    c("lastBars", KEEP_NAMING),
  ],
  "boxes-second-key.e-minor-ladder": [
    g(JOIN, 2),
    c("notes", "Name the two E's where the boxes join.", 3),
    c("heard", HEARD),
    c("extras", EXTRAS8),
    c("late", SEE_BOX),
    c("early", EARLY),
    c("openString", "Put the open G and B right on the click."),
    c("shift", "Move the hand as one to each new box.", 2),
    c("stringChange", CROSS),
    c("lastBars", DOWN_BOXES),
  ],
  "boxes-second-key.e-minor-three-octaves": [
    g("Say E, G, A, B in each of the three octaves."),
    c("notes", "Start each octave on an E, low to high.", 3),
    c("heard", HEARD),
    c("extras", EXTRAS8),
    c("late", LATE),
    c("early", EARLY),
    c("openString", "Put the open E and A right on the click."),
    c("shift", SHIFT_OCT),
    c("stringChange", CROSS),
    c("lastBars", "Hold the top E at fret twelve two clicks."),
  ],
  "boxes-second-key.e-minor-box-one-twice": [
    g("See one shape twice: the nut, then fret twelve."),
    c("notes", "Put finger one at fret twelve for every string.", 3),
    c("heard", HEARD),
    c("extras", EXTRAS8),
    c("late", LATE),
    c("early", EARLY),
    c("afterHeld", "Count the held note's two clicks, then move up.", 1),
    c("openString", OPEN_CLICK),
    c("shift", "Be at fret twelve before the next '1'.", 1),
    c("stringChange", CROSS),
    c("lastBars", "Hold the last note at fret fifteen."),
  ],
  // Step 13: arpeggios
  "arpeggios.am-up": [
    g("Say A, C and E as each one sounds."),
    c("notes", "Find each A first: frets five, seven and ten.", 1),
    c("heard", HEARD),
    c("extras", EXTRAS8),
    c("late", LATE),
    c("early", EARLY),
    c("shift", "Shift once: G string, fret five to fret nine.", 1),
    c("stringChange", CROSS),
    c("lastBars", "End on the A at the D string's fret seven."),
  ],
  "arpeggios.c-up": [
    g("Pick each string of the open C chord in turn.", 1),
    c("notes", "Say which of C, E and G each string is.", 1),
    c("heard", HEARD),
    c("extras", EXTRAS8),
    c("late", LATE),
    c("early", EARLY),
    c("openString", "Put the open G right on the click."),
    c("shift", "Play fret eight with the little finger."),
    c("stringChange", CROSS),
    c("lastBars", "Finish on C, the A string at fret three."),
  ],
  "arpeggios.changes-in-position": [
    g(SAY_CHORD),
    c("notes", "Find each chord's notes from the one before it.", 1),
    c("heard", HEARD_ANY),
    c("extras", EXTRAS8),
    c("late", LATE_CHORD),
    c("early", EARLY_BEAT),
    c("stringChange", CLOSE),
    c("lastBars", "Go from the last chord back to the first on '1'."),
  ],
  // Step 14: the changes in A minor
  "the-changes.thirds-of-the-chords": [
    g("Say C, A, E, B as the chords change."),
    c("notes", "Find each third from its chord's root.", 1),
    c("heard", HEARD),
    c("extras", EXTRAS_HALF),
    c("late", LATE_CHORD),
    c("early", EARLY_BEAT),
    c("stringChange", CROSS),
    c("lastBars", "Go from B back to C on '1'."),
  ],
  "the-changes.root-third-fifth": [
    g(R3F3),
    c("notes", "Keep every note within a fret of fifth position.", 1),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", LATE_CHORD),
    c("early", EARLY_BEAT),
    c("shift", "Drop finger one to fret four for G."),
    c("stringChange", CROSS),
    c("lastBars", "Go from the G chord back to A minor on '1'."),
  ],
  "the-changes.land-on-a-chord-tone": [g(LAND, 1)],
  // Step 15: the changes in G
  "changes-in-g.g-three-lines": [
    g("Say what job the note does on each chord.", 1),
    c("notes", "Name the note's job, then find it by fret.", 1),
    c("heard", HEARD),
    c("extras", EXTRAS_HALF),
    c("late", LATE_CHORD),
    c("early", EARLY_BEAT),
    c("stringChange", "Move to the next string every four bars."),
    c("lastBars", "Go back to the D string on '1' to start again."),
  ],
  "changes-in-g.g-root-third-fifth": [
    g(R3F3),
    c("notes", FINGER_AT_TWO, 2),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", LATE_CHORD),
    c("early", EARLY_BEAT),
    c("stringChange", CROSS),
    c("lastBars", "Go from the D chord back to G on '1'."),
  ],
  "changes-in-g.g-arpeggios": [
    g("Keep the fingers that stay; move only one.", 2),
    c("notes", "Add the little finger at fret five for E minor.", 2),
    c("heard", HEARD),
    c("extras", EXTRAS8),
    c("late", LATE_CHORD),
    c("early", EARLY_BEAT),
    c("shift", "Move the hand down a fret for D, then back.", 4),
    c("stringChange", CROSS),
    c("lastBars", "Go back to the G shape on '1'.", 2),
  ],
  "changes-in-g.g-land-on-a-chord-tone": [g("Land on a note of the chord and name its job.")],
  // Level 3 warm-up: a key and a pair of boxes that change every Take
  "warmup-advanced.two-boxes-up": [
    g(SAY_NAME),
    c("heard", HEARD_ANY),
    c("late", LATE_SAY),
    c("early", EARLY),
    c("afterHeld", HELD_OUT),
    c("shift", "Move up as the held note ends."),
    c("stringChange", CLOSE),
    c("lastBars", KEEP_NAMING),
  ],
};
