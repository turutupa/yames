/**
 * Blues Pentatonics: one thing to try, per Exercise (leg cues2, 2026-11-20).
 *
 * The blues Path: boxes, landings, call and response, the twelve-bar form,
 * bends, slides and phrasing over a shuffle. Every graded Exercise has one
 * general cue (said before its first Take, after an ungraded one, and as its
 * evenness cue) and one cue for each other trigger it can produce; the
 * self-checked and practice-only ones have the general cue alone.
 *
 * The orders are about where a phrase starts in the count, which note it
 * lands on and for how long, where a bend must arrive, and when the hand
 * moves. The app hears when a note sounded and which pitch it was; it does
 * not hear vibrato, the pick, muting or tone, so no cue says it did.
 *
 * Exercises that change key between Takes (`key` variants) and the three
 * warm-ups name no fret, note or chord; every other Exercise is one version
 * and may name its own. No `openString` cue where only some keys have one.
 * Drafts, proof-read by a second reader: see `plans/coach/progress/cues2.md`.
 */
import type { Cue, CueTrigger } from "../format";
import type { CueBook } from "../spec";

const c = (when: CueTrigger, say: string, more?: number): Cue => (more === undefined ? { when, say } : { when, say, more });
/** The general cue: said with nothing measured, and when evenness decided a Take. */
const g = (say: string, more?: number): Cue => ({ ...c("even", say, more), general: true });

// Shared orders, word for word, so each is translated once.
// Notes missed, extra notes.
const HEARD = "Pick every short note as firmly as the long.";
const EXTRAS = "Pick only the written string for each note.";
const CALL_QUIET = "Stay silent while the call plays.";
// The shuffle: long-short pairs over the band.
const SHUF_LATE = "Start each long-short pair right on the beat.";
const SHUF_EARLY = "Wait for the beat before each long-short pair.";
// Straight eighths over the band.
const STRAIGHT_LATE = "Land each beat's first eighth with the drums.";
const STRAIGHT_EARLY = "Wait for the drums on each beat's first eighth.";
// Crossings, held notes, endings.
const CROSS_CLOSE = "Keep the pick close as you cross strings.";
const CROSS_ON_BEAT = "Land each new string right on its beat.";
const CROSS_STILL = "Hold the hand still as the pick changes strings.";
const AFTER_HELD = "Count the held note's two beats, then go on.";
const SHIFT_HELD = "Move the hand while the held note rings.";
const LAST_HOLD = "Hold the last note for two beats, then stop.";
const LAST_A = "Hold the last A for its full two beats.";
const LAST_E = "Hold the last E for two beats, then stop.";
const FIRST_FIVE = "Use finger one for each note at fret five.";
const SHIFT_UP_FRET = "Move up a fret for the top two strings.";

export const BLUES_PENTATONICS_CUES: CueBook = {
  // Level 1 (beginner), Step 1: box 1
  "box-one.box-eighths": [
    g("Say each A out loud as you pass it.", 2),
    c("notes", FIRST_FIVE, 2),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", SHUF_LATE),
    c("early", SHUF_EARLY),
    c("afterHeld", "Count each held A's two beats, then move on."),
    c("stringChange", CROSS_ON_BEAT),
    c("lastBars", "Hold the low A its full two beats."),
  ],
  "box-one.three-as": [
    g("Start each bar on its A without looking.", 2),
    c("notes", "Find the low, middle and high A first."),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", "Put each bar's first A right on the beat."),
    c("early", SHUF_EARLY),
    c("afterHeld", "Count the held A's two beats, then the low A."),
    c("stringChange", CROSS_STILL),
    c("lastBars", LAST_A),
  ],
  "box-one.first-lick": [
    g("Play long-short, like the drummer's shuffle.", 2),
    c("notes", "Name the notes as you play: A, C, A, G."),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", SHUF_LATE),
    c("early", SHUF_EARLY),
    c("afterHeld", "Count the last A's two beats, then start again."),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", LAST_A),
  ],
  "box-one.first-chorus": [
    g("Count the twelve bars as they go by.", 0),
    c("notes", "Play the same line over D7 as over A7.", 1),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", SHUF_LATE),
    c("early", SHUF_EARLY),
    c("afterHeld", AFTER_HELD),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", LAST_E),
  ],

  // Level 1, Step 2: the box in other keys
  "box-keys.box-in-g": [
    g("Say 'G' as you pass each of the three G's.", 2),
    c("notes", "Use finger one for each note at fret three.", 0),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", SHUF_LATE),
    c("early", SHUF_EARLY),
    c("afterHeld", "Count each held G's two beats, then move on."),
    c("stringChange", CROSS_ON_BEAT),
    c("lastBars", "Hold the low G its full two beats."),
  ],
  "box-keys.riffs-in-c": [
    g("Start each bar on its C without looking.", 1),
    c("notes", "Keep one finger per fret from fret eight.", 2),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", "Put each bar's first C right on the beat."),
    c("early", SHUF_EARLY),
    c("afterHeld", "Count the held C's two beats, then the low C."),
    c("stringChange", CROSS_STILL),
    c("lastBars", "Hold the last C for its full two beats."),
  ],
  "box-keys.lick-in-e": [
    g("Start the lick on the top string, fret twelve.", 1),
    c("notes", "Keep the first finger on fret twelve.", 0),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", SHUF_LATE),
    c("early", SHUF_EARLY),
    c("afterHeld", "Count the last E's two beats, then start again."),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", "Hold the last E for its full two beats."),
  ],
  "box-keys.chorus-in-keys": [
    g("Find the key's root on the low E string first.", 0),
    c("notes", "Keep one finger per fret for the whole chorus."),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", SHUF_LATE),
    c("early", SHUF_EARLY),
    c("afterHeld", AFTER_HELD),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", LAST_HOLD),
  ],

  // Level 1, Step 3: straight eighths
  "straight-feel.straight-box": [
    g("Make every eighth the same length.", 2),
    c("notes", FIRST_FIVE),
    c("heard", "Pick every eighth, the first and the second."),
    c("extras", EXTRAS),
    c("late", STRAIGHT_LATE),
    c("early", STRAIGHT_EARLY),
    c("afterHeld", "Count each held A's two beats, then move on."),
    c("stringChange", CROSS_ON_BEAT),
    c("lastBars", "Hold the low A its full two beats."),
  ],
  "straight-feel.straight-lick": [
    g("Keep the eighths even as the lick runs down."),
    c("notes", "Go back up to the G string for C and D.", 1),
    c("heard", "Pick every eighth, the first and the second."),
    c("extras", EXTRAS),
    c("late", STRAIGHT_LATE),
    c("early", STRAIGHT_EARLY),
    c("afterHeld", "Count each held A to its end, then go on."),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", LAST_A),
  ],
  "straight-feel.low-riff": [
    g("Pick down-up all the way through.", 2),
    c("notes", "Play the C at fret eight on the low E string.", 1),
    c("heard", "Pick both A's at the start of the riff."),
    c("extras", EXTRAS),
    c("late", STRAIGHT_LATE),
    c("early", STRAIGHT_EARLY),
    c("stringChange", CROSS_STILL),
  ],
  "straight-feel.straight-chorus": [
    g("Start each riff on its chord's root.", 3),
    c("notes", "Start the D7 riff on the A string, fret five.", 1),
    c("heard", "Pick both repeated notes at each riff's start."),
    c("extras", EXTRAS),
    c("late", STRAIGHT_LATE),
    c("early", STRAIGHT_EARLY),
    c("afterHeld", "Count the last E's two beats, then start again."),
    c("stringChange", CROSS_STILL),
    c("lastBars", LAST_E, 2),
  ],

  // Level 1, Step 4: landing on chord tones
  "landing.root-on-one": [
    g("Land on the A right as each bar starts.", 1),
    c("notes", "Play every held A at fret seven, D string."),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", "Put the held A right on '1' each time."),
    c("early", "Wait for '1' before the held A."),
    c("afterHeld", "Count the A's two beats, then walk away."),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", "Lead the last four notes back to the A."),
  ],
  "landing.a7-arpeggio": [
    g("Move from C up to C# and hold it.", 2),
    c("notes", "Second finger on the low A, first on the C#.", 1),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", SHUF_LATE),
    c("early", SHUF_EARLY),
    c("afterHeld", "Count the C#'s two beats, then the low A."),
    c("shift", "Move up a fret after the C# on the G string.", 1),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", "Hold the C# for its full two beats."),
  ],
  "landing.d7-arpeggio": [
    g("Step down from G to F# and hold it.", 2),
    c("notes", "Put the first finger on fret four for the F#.", 1),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", SHUF_LATE),
    c("early", SHUF_EARLY),
    c("afterHeld", "Count the F#'s two beats, then the D."),
    c("shift", SHIFT_UP_FRET, 1),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", "Hold the F# for its full two beats."),
  ],
  "landing.e7-arpeggio": [
    g("Step down from A to G# and hold it.", 2),
    c("notes", "Put the first finger on fret six for the G#.", 1),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", SHUF_LATE),
    c("early", SHUF_EARLY),
    c("afterHeld", "Count the G#'s two beats, then the root."),
    c("shift", SHIFT_UP_FRET, 1),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", "Hold the G# for its full two beats."),
  ],
  "landing.land-any-tone": [g("Choose each landing note before you reach it.", 1)],

  // Level 1, Step 5: call and response
  "call-response.echo": [
    g("Sing the call back before you play it.", 1),
    c("notes", "Start the echo on the call's first note."),
    c("heard", HEARD),
    c("extras", CALL_QUIET),
    c("late", "Come in on '1' right after the call ends."),
    c("early", "Wait for '1' after the call before you start."),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", "Play the last A short and stop."),
  ],
  "call-response.four-answers": [
    g("Let each answer's last note ring two beats.", 2),
    c("notes", "End the answers on A, E, G, then high C.", 1),
    c("heard", HEARD),
    c("extras", CALL_QUIET),
    c("late", "Start each answer right on '1'."),
    c("early", "Wait for '1' before each answer."),
    c("afterHeld", "Count both bars of the call, then answer."),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", "Hold the high C two beats, then stop."),
  ],
  "call-response.two-on-two-off": [
    g("Count the two silent bars out loud.", 1),
    c("notes", "Start the second phrase on the B string."),
    c("heard", HEARD),
    c("extras", "Play nothing at all in the two silent bars."),
    c("late", SHUF_LATE),
    c("early", "Wait for '1' before each phrase starts."),
    c("afterHeld", "Count both silent bars, then come in."),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", "Keep counting through the last two silent bars."),
  ],
  "call-response.free-trade": [g("Answer once with few notes, once with many.", 1)],

  // Level 1, Step 6: landings in other keys
  "landing-review.g7-third": [
    g("Move from B flat up to B and hold it.", 2),
    c("notes", "Second finger on the low G, first on the B.", 1),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", SHUF_LATE),
    c("early", SHUF_EARLY),
    c("afterHeld", "Count the B's two beats, then the low G."),
    c("shift", "Move up a fret after the B on the G string."),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", "Hold the B for its full two beats."),
  ],
  "landing-review.c7-third": [
    g("Move from E flat up to E and hold it.", 2),
    c("notes", "Second finger on the low C at fret eight.", 1),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", SHUF_LATE),
    c("early", SHUF_EARLY),
    c("afterHeld", "Count the third's two beats, then the low C."),
    c("shift", "Move up a fret after fret nine on the G string."),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", "Hold the last note its full two beats."),
  ],
  "landing-review.landing-chorus": [
    g("Hold each third its full two beats.", 1),
    c("notes", "Reach back to fret four with the first finger.", 2),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", SHUF_LATE),
    c("early", SHUF_EARLY),
    c("afterHeld", AFTER_HELD),
    c("shift", SHIFT_HELD),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", LAST_E),
  ],
  "landing-review.landing-chorus-keys": [
    g("Listen to each held third as you land on it.", 1),
    c("notes", "Play it from the shape, the way you know it.", 1),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", SHUF_LATE),
    c("early", SHUF_EARLY),
    c("afterHeld", AFTER_HELD),
    c("shift", SHIFT_HELD),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", LAST_HOLD),
  ],
  "warmup-beginner.box-around": [
    g("Start well under your clean tempo.", 0),
    c("heard", HEARD),
    c("late", SHUF_LATE),
    c("early", SHUF_EARLY),
    c("shift", "Arrive on the new note as each bar starts.", 0),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", "Play the last bar where you started."),
  ],
};
