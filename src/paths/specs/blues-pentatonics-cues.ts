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
const SHUF_LATE = "Put each beat's long note right on the beat.";
const SHUF_EARLY = "Wait for the beat before each long note.";
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
const HEARD_EIGHTHS = "Pick every eighth, the first and the second.";
const EIGHTH_LATE = "Play each beat's first eighth right on the beat.";
const EIGHTH_EARLY = "Wait for the beat before each pair of eighths.";
const LAST_NOTE = "Hold the last note its full two beats.";
const REST_EMPTY = "Leave every written rest empty.";
const AFTER_REST = "Count every beat of the rest, then come in.";
const OPEN_ON_BEAT = "Put each open note right where you count it.";
const NEW_ROOT = "Move to the new root as each bar starts.";
const WALK_LAST = "Keep the walk going right to the last note.";
const PICK_SMALL = "Keep the pick small as you cross.";
// Whole-note roots.
const ROOT_NOTES = "Play D and E on the A string, A on the low E.";
const ROOT_HEARD = "Pick each root firmly and let it ring.";
const ROOT_EXTRAS = "Play one note a bar and let it ring.";
const ROOT_LATE = "Play each root right as its bar starts.";
const ROOT_EARLY = "Wait for '1' before each new root.";
const ROOT_CROSS = "Have the next root's finger ready early.";
const ROOT_LAST = "Hold the last E through all four beats.";
// Bends.
const BEND_LATE = "Pick each bend right on its beat.";
const BEND_EARLY = "Wait for the beat before each bend.";
// The riffs at the nut.
const RIFF_HEARD = "Pick both root notes at each riff's start.";
const NUT_END = "Count the rest, then D# and B.";

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
    c("heard", HEARD_EIGHTHS),
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
    c("heard", HEARD_EIGHTHS),
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
    c("lastBars", LAST_NOTE),
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
    c("stringChange", "Keep the pick close to the strings."),
    c("lastBars", "Play the last bar where you started."),
  ],

  // Level 2 (intermediate), Step 7: the blues scale
  "blues-scale.scale": [
    g("Give the blue note its own finger.", 1),
    c("notes", "Name the blue note each time you pass it.", 1),
    c("heard", HEARD_EIGHTHS),
    c("extras", EXTRAS),
    c("late", EIGHTH_LATE),
    c("early", EIGHTH_EARLY),
    c("afterHeld", "Count the held root out, then climb again."),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", "Keep the eighths even all the way down."),
  ],
  "blues-scale.passing": [
    g("Pass through the Eb; never stop on it.", 1),
    c("notes", "Play the Eb at fret eight on the G string.", 1),
    c("heard", HEARD_EIGHTHS),
    c("extras", EXTRAS),
    c("late", EIGHTH_LATE),
    c("early", EIGHTH_EARLY),
    c("afterHeld", "Count the held G's two beats, then start again."),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", "Hold the last G for its full two beats."),
  ],
  "blues-scale.blue-third": [
    g("Hammer from C onto C#, one fret up.", 1),
    c("notes", "Hammer onto fret six hard enough to sound.", 1),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", SHUF_LATE),
    c("early", SHUF_EARLY),
    c("afterHeld", "Count the last E's two beats, then start again."),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", "Hold the last E for its full two beats."),
  ],
  "blues-scale.one-blue-note": [g("Pass through one blue note per phrase.", 1)],

  // Level 2, Step 8: the twelve-bar form
  "twelve-bar.roots": [
    g("Listen for each chord change, then move.", 1),
    c("notes", ROOT_NOTES, 1),
    c("heard", ROOT_HEARD),
    c("extras", ROOT_EXTRAS),
    c("late", ROOT_LATE),
    c("early", ROOT_EARLY),
    c("stringChange", ROOT_CROSS),
    c("lastBars", ROOT_LAST),
  ],
  "twelve-bar.walking": [
    g("Hear each chord change, and follow it.", 1),
    c("notes", "Play root, third, fifth, sixth, flat seven.", 1),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", SHUF_LATE),
    c("early", SHUF_EARLY),
    c("shift", NEW_ROOT),
    c("stringChange", PICK_SMALL, 2),
    c("lastBars", WALK_LAST),
  ],
  "twelve-bar.the-turnaround": [
    g("Keep the G on the B string coming back.", 1),
    c("notes", "Step down one fret at a time on the G string.", 1),
    c("heard", "Pick the G again after every lower note."),
    c("extras", EXTRAS),
    c("late", SHUF_LATE),
    c("early", SHUF_EARLY),
    c("shift", "Move down a fret as each beat starts."),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", "Leave the rest empty, then G# and E."),
  ],
  "twelve-bar.written-chorus": [
    g("Count through every rest in the chorus.", 2),
    c("notes", "Play bar five with the same notes as bar one.", 2),
    c("heard", HEARD),
    c("extras", REST_EMPTY),
    c("late", SHUF_LATE),
    c("early", SHUF_EARLY),
    c("afterHeld", AFTER_HELD),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", LAST_E),
  ],
  "twelve-bar.follow-the-form": [g("Know the next chord before you get to it.", 1)],

  // Level 2, Step 9: the quick change
  "quick-change.quick-roots": [
    g("Go to D for bar two, then straight back.", 1),
    c("notes", ROOT_NOTES, 1),
    c("heard", ROOT_HEARD),
    c("extras", ROOT_EXTRAS),
    c("late", ROOT_LATE),
    c("early", ROOT_EARLY),
    c("stringChange", ROOT_CROSS),
    c("lastBars", ROOT_LAST),
  ],
  "quick-change.quick-boogie": [
    g("Look ahead to the next root as each bar ends.", 2),
    c("notes", "Start the D bar at fret five on the A string.", 1),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", SHUF_LATE),
    c("early", SHUF_EARLY),
    c("shift", NEW_ROOT),
    c("stringChange", PICK_SMALL),
    c("lastBars", WALK_LAST),
  ],
  "quick-change.quick-chorus": [
    g("Land on F# as the D7 arrives in bar two.", 1),
    c("notes", "Reach fret four on the D string for F#.", 1),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", SHUF_LATE),
    c("early", SHUF_EARLY),
    c("afterHeld", AFTER_HELD),
    c("shift", SHIFT_HELD),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", LAST_E),
  ],

  // Level 2, Step 10: bends
  "bends.reference": [g("Play the target, then bend until it matches.", 1)],
  "bends.half-step": [g("Bend fret eight until it sounds like fret nine.", 1)],
  "bends.bends-on-time": [
    g("Start the bend as you pick; reach the top fast.", 1),
    c("heard", "Pick each bend firmly, once per beat."),
    c("extras", "Pick each bend once, then let it ring."),
    c("late", BEND_LATE),
    c("early", BEND_EARLY),
    c("afterHeld", "Count through the rest, then bend on '1'."),
    c("stringChange", "Have the next string's finger ready to bend."),
    c("lastBars", "Hold the last bend up for its two beats."),
  ],
  "bends.bend-and-release": [
    g("Bend until the two E's sound as one note.", 1),
    c("notes", "Release the bend all the way down to D.", 1),
    c("heard", "Pick the D again as you release the bend.", 1),
    c("extras", "Pick only the G and B strings for the bend."),
    c("late", SHUF_LATE),
    c("early", SHUF_EARLY),
    c("afterHeld", "Count the long A's two beats, then bend."),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", "Hold the long A for its full two beats."),
  ],
  "bends.bends-over-changes": [
    g("Hear each bend's target before you pick it.", 1),
    c("heard", "Pick every fill note as firmly as the bend."),
    c("extras", EXTRAS),
    c("late", "Pick each bend right on '1'."),
    c("early", "Wait for '1' before each bend."),
    c("afterHeld", "Count the bend's two beats, then the fill."),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", "Make the last bend a half step, on '1'.", 1),
  ],

  // Level 2, Step 11: the blues in E, at the nut
  "open-e-blues.nut-box": [
    g("Say 'E' on each of the three E's.", 2),
    c("notes", "Second finger on fret two, third on three.", 0),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", SHUF_LATE),
    c("early", SHUF_EARLY),
    c("afterHeld", "Count each held E's two beats, then move on."),
    c("openString", OPEN_ON_BEAT),
    c("stringChange", CROSS_ON_BEAT),
    c("lastBars", "Hold the open low E its full two beats."),
  ],
  "open-e-blues.nut-riffs": [
    g("Start each riff on its chord's root, twice.", 1),
    c("notes", "Use the open B7 shape for the fourth riff.", 2),
    c("heard", RIFF_HEARD),
    c("extras", EXTRAS),
    c("late", SHUF_LATE),
    c("early", SHUF_EARLY),
    c("openString", OPEN_ON_BEAT),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", "Keep the B7 shape down to the riff's end."),
  ],
  "open-e-blues.nut-turnarounds": [
    g("Let the high E ring under the first turnaround.", 3),
    c("heard", "Pick every note twice in the low climb.", 2),
    c("extras", "Leave the beat of rest silent."),
    c("late", SHUF_LATE),
    c("early", SHUF_EARLY),
    c("openString", OPEN_ON_BEAT),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", NUT_END),
  ],
  "open-e-blues.nut-chorus": [
    g("Wait for the bass's root if you get lost.", 3),
    c("notes", "Play the A7 riff one string higher.", 1),
    c("heard", RIFF_HEARD),
    c("extras", EXTRAS),
    c("late", SHUF_LATE),
    c("early", SHUF_EARLY),
    c("openString", OPEN_ON_BEAT),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", NUT_END),
  ],

  // Level 2, Step 12: the minor blues
  "minor-blues.am7-dm7": [
    g("Play each arpeggio from its root up.", 1),
    c("notes", "Start Dm7 on the A string, fret five.", 2),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", SHUF_LATE),
    c("early", SHUF_EARLY),
    c("afterHeld", "Count the held A's two beats, then go to Dm7."),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", "Hold the last F for its full two beats."),
  ],
  "minor-blues.the-turn": [
    g("Hold each chord's own note: G#, F, A, G#.", 1),
    c("notes", "Reach fret six on the D string for the G#.", 1),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", SHUF_LATE),
    c("early", SHUF_EARLY),
    c("afterHeld", AFTER_HELD),
    c("shift", SHIFT_HELD),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", LAST_NOTE),
  ],
  "minor-blues.minor-chorus": [
    g("Land on F as the Dm7 arrives.", 2),
    c("notes", "Play the first phrase the same both times.", 1),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", SHUF_LATE),
    c("early", SHUF_EARLY),
    c("afterHeld", AFTER_HELD),
    c("shift", SHIFT_HELD),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", LAST_E),
  ],
  "minor-blues.your-minor-chorus": [g("Hold E over the Am7 and F over the Dm7.", 1)],

  // Level 2, Step 13: the minor blues in D
  "minor-blues-in-d.dm7-gm7": [
    g("Change only A to B flat for the Gm7 phrase.", 2),
    c("notes", "Second finger takes B flat at fret eleven.", 3),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", SHUF_LATE),
    c("early", SHUF_EARLY),
    c("afterHeld", AFTER_HELD),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", "Hold the last B flat its full two beats."),
  ],
  "minor-blues-in-d.d-minor-turn": [
    g("Land on C#, B flat, D, then the A chord.", 1),
    c("notes", "Play C# with the third finger at fret eleven.", 1),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", SHUF_LATE),
    c("early", SHUF_EARLY),
    c("afterHeld", AFTER_HELD),
    c("shift", "Drop the hand a fret for the A7 bars.", 1),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", LAST_NOTE),
  ],
  "minor-blues-in-d.d-minor-chorus": [
    g("Hold each chord's own note as it arrives.", 3),
    c("notes", "Play the first phrase the same both times.", 1),
    c("heard", HEARD),
    c("extras", EXTRAS),
    c("late", SHUF_LATE),
    c("early", SHUF_EARLY),
    c("afterHeld", AFTER_HELD),
    c("shift", SHIFT_HELD),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", LAST_HOLD),
  ],
  "minor-blues-in-d.your-d-minor-turn": [g("Play one long note per chord, the chord's own.", 1)],

  // Level 2, Step 14: question and answer
  "question-answer.written-pair": [
    g("End the question on G and the answer on A.", 1),
    c("notes", "End the question at fret eight, B string.", 1),
    c("heard", HEARD),
    c("extras", REST_EMPTY),
    c("late", SHUF_LATE),
    c("early", SHUF_EARLY),
    c("afterHeld", AFTER_REST),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", "Hold the A two beats, then rest two."),
  ],
  "question-answer.aab": [
    g("Play the first phrase the same over D7.", 1),
    c("notes", "Start the reply on the B string, fret five.", 1),
    c("heard", HEARD),
    c("extras", REST_EMPTY),
    c("late", SHUF_LATE),
    c("early", SHUF_EARLY),
    c("afterHeld", AFTER_REST),
    c("stringChange", CROSS_CLOSE),
    c("lastBars", "Stay silent through the last bar's four beats."),
  ],
  "question-answer.write-the-answer": [g("End your answer on an A on '1'.", 1)],
  "question-answer.free-aab": [g("Say a phrase, say it again, then answer it.", 1)],
  "warmup-intermediate.boogie-keys": [
    g("Start well under your clean tempo.", 0),
    c("heard", HEARD),
    c("late", SHUF_LATE),
    c("early", SHUF_EARLY),
    c("shift", "Arrive on the new note as each bar starts.", 0),
    c("stringChange", "Keep the pick close to the strings."),
    c("lastBars", WALK_LAST),
  ],
};
