/**
 * Tapping: three more consolidation Steps, for the Intermediate Level (2026-11-19).
 * Drafts, like the Path they belong to.
 *
 * Intermediate was three Steps: sixteenths, across the strings, a scale under
 * the tap. Three new things for the hands, each met once. These Steps give each
 * of them a second meeting and add nothing to the technique:
 *
 * - `sixteenths-in-e-minor`, after `sixteenths`: the four-note loop and the
 *   double tap through Em, C, D and B on the B string, the way `cell-in-e-minor`
 *   took the three-note cell there.
 * - `strings-through-chords`, after `two-strings`: the cell on the top and B
 *   strings at one place on the neck, where the same frets are Am and F on one
 *   string and Em and C on the other. One thing changes at each bar line.
 * - `scale-tap-again`, after `scale-under-the-tap`: the six-note figure on the
 *   B string in E minor, the tap walking down the scale, and the figure over
 *   Em and Am.
 *
 * Everything is graded on timing and notes heard, never on pitch. Every id is
 * new, so nobody's progress moves. Every line is original.
 */
import type { ExerciseSpec, StepSpec, VariantParams, VarySpec } from "../spec";
import type { PassBar } from "../format";
import { ladder, repeat, shiftFrets } from "../templates";
import { chartIn } from "./triadShapes";

// --- Copied from tapping.ts and tapping-more.ts (a Path's extra Steps cannot import the Path) ---

const even = (min: number, overBars = 4): PassBar => ({ metric: "timingEvenness", min, overBars });
const heard = (min: number, overBars = 4): PassBar => ({ metric: "notesHeard", min, overBars });
const extras = (max: number): PassBar => ({ metric: "extraNotes", max, overBars: 4 });

/** Taps are timed and counted; legato notes between them cost nothing if unheard. */
const TAPS = { grade: "timing", pass: [even(0.8), heard(0.9), extras(3)] } as const satisfies Partial<ExerciseSpec>;

const NOISE_CHECK = "Between takes, stop and listen: are the strings you are not playing silent?";
const SAFETY =
  "Stop at any pain in either hand, wrist or forearm. A tired hand is one thing and pain is another; pain ends the set.";

/** Said on every Exercise whose variants move the figure: the words name the first version's frets. */
const VARIANT_NOTE =
  "The frets and note names here are for the first version. Other Takes move the same figure to another string or key.";

/** tap, pull to the first finger, hammer the upper finger. */
const cell = (s: number, [t, a, b]: number[]) => `${s}:${t}t ${s}:${a}pf1 ${s}:${b}hf${b - a >= 3 ? 4 : 3}`;
/** The same with a pull back to the first finger: four notes. */
const four = (s: number, [t, a, b]: number[]) => `${cell(s, [t, a, b])} ${s}:${a}pf1`;

const bars = (s: number, value: string, chords: readonly number[][], group: (s: number, f: number[]) => string, per: number) =>
  chords.map((f) => `${value} ${repeat(group(s, f), per)}`).join(" | ");

/** Every note of a one-string tab on another string. */
const onString = (tab: string, s: number) => tab.replace(/\d:(\d+)/g, (_all, fret) => `${s}:${fret}`);

// --- Figures of this file ------------------------------------------------------

/** Two taps to a beat, with their fingers: tap, pull to the first finger, tap, pull to the little finger. */
const double = (s: number, [t, a, b]: number[]) => `${s}:${t}t ${s}:${a}pf1 ${s}:${t}t ${s}:${b}pf4`;
/** A tap on top of three scale notes, with their fingers: tap, pull, pull, pull, hammer, hammer. */
const scaleTap = (s: number, [t, a, b, c]: number[]) =>
  `${s}:${t}t ${s}:${c}pf4 ${s}:${b}pf3 ${s}:${a}pf1 ${s}:${b}hf3 ${s}:${c}hf4`;

// E minor on the B string: the frets A minor has on the top string.
const EM = [12, 5, 8];
const C = [13, 5, 8];
const D = [15, 7, 10];
const B = [12, 4, 7];
const EM_CHART = "Em | C | D | B";

const LOOP_EM_TO_C = bars(2, "/16", [EM, C], four, 4);
const DOUBLE_D_TO_B = bars(2, "/16", [D, B], double, 4);
const LOOP_EM_C_D_B = bars(2, "/16", [EM, C, D, B], four, 4);
const DOUBLE_EM_C_D_B = bars(2, "/16", [EM, C, D, B], double, 4);

/**
 * A B-string line on the other tapping strings. The same frets a string over are
 * the same shapes in another key: A minor on the top string, C minor on the G string.
 */
const STRING_KEYS: Readonly<Record<string, { string: number; by: number; key: string }>> = {
  "B: E minor": { string: 2, by: 0, key: "E minor" },
  "top E: A minor": { string: 1, by: 5, key: "A minor" },
  "G: C minor": { string: 3, by: -4, key: "C minor" },
};
type OwnText = Readonly<Record<string, { purpose: string; howTo: string[] }>>;
function onStringKeys(tab: string, chart: string, groove: string, own: OwnText = {}): VarySpec {
  return {
    values: { stringSet: Object.keys(STRING_KEYS) },
    pooled: ["stringSet"],
    label: (p: VariantParams) => p.stringSet,
    build: (p: VariantParams) => {
      const to = STRING_KEYS[p.stringSet];
      return {
        tab: onString(tab, to.string),
        position: 5,
        shifts: true,
        chords: chartIn(chart, to.by, to.key),
        jam: { groove, key: to.key },
        // Words written by hand for a version the rewrite gives none.
        ...(own[p.stringSet] ?? {}),
      };
    },
  };
}

// Two strings, one place on the neck: tap 12 or 13 over frets 5 and 8.
// On the top string that is Am and F; on the B string, Em and C.
const AM_TO_EM = `/8t ${repeat(cell(1, [12, 5, 8]), 4)} | /8t ${repeat(cell(2, [12, 5, 8]), 4)}`;
const AM_F_C_EM = [
  `/8t ${repeat(cell(1, [12, 5, 8]), 4)}`,
  `/8t ${repeat(cell(1, [13, 5, 8]), 4)}`,
  `/8t ${repeat(cell(2, [13, 5, 8]), 4)}`,
  `/8t ${repeat(cell(2, [12, 5, 8]), 4)}`,
].join(" | ");
const TWO_STRING_CHART = "Am | F | C | Em";

/** The two-string line moved up the neck: the chart moves with it. */
const KEY_SHIFT: Readonly<Record<string, number>> = { "A minor": 0, "B minor": 2, "C minor": 3 };
function inKeys(tab: string, chart: string, groove: string, own: OwnText = {}): VarySpec {
  return {
    values: { key: Object.keys(KEY_SHIFT) },
    pooled: ["key"],
    label: (p: VariantParams) => p.key,
    build: (p: VariantParams) => {
      const by = KEY_SHIFT[p.key];
      return {
        tab: shiftFrets(tab, by),
        position: 5 + by,
        chords: chartIn(chart, by, p.key),
        jam: { groove, key: p.key },
        ...(own[p.key] ?? {}),
      };
    },
  };
}

// The six-note figure in E minor: frets 5, 7 and 8 on the B string are E, F# and G.
const SCALE_TAP_EM = `/16t ${repeat(scaleTap(2, [12, 5, 7, 8]), 4)}`;
const SCALE_TAP_DOWN = `/16t ${[17, 15, 13, 12].map((t) => scaleTap(2, [t, 5, 7, 8])).join(" ")}`;
const SCALE_TAP_EM_AM = `${SCALE_TAP_EM} | /16t ${repeat(scaleTap(1, [12, 5, 7, 8]), 4)}`;

/** Intermediate, after `sixteenths`: the loop and the double tap through the chords of E minor. */
export const SIXTEENTHS_IN_E_MINOR: StepSpec = {
  id: "sixteenths-in-e-minor",
  title: "Sixteenths in E minor",
  goal: "Take the four-note loop and two taps to a beat through Em, C, D and B on the B string: two chords at a time, then all four, and the loop with the band.",
  why: "The loop and two taps to a beat (the double tap) were learned on one chord, and the loop then went through three chords in A minor. Here both go through Em, C, D and B on the B string, at the frets of the Step 'The cell in E minor'. Nothing in either figure is new. What takes the practice is the bar line: a sixteenth is shorter than a triplet note at the same tempo, so the hand that moves has less time to do it.",
  howTo: [
    "The middle finger of the picking hand taps. The first finger and the little finger of the fretting hand hold the two lower notes: frets 5 and 8 for Em and C, frets 7 and 10 for D, frets 4 and 7 for B.",
    "On the B string, Em is tap 12, C is tap 13, D is tap 15 and B is tap 12 again. Other Takes play the Exercise with the band at the same frets on the top string, in A minor, or on the G string, in C minor.",
    "The loop ends each bar on a pull-off to the first finger, and the double tap ends it on a pull-off to the little finger. In the loop the tapping hand has the three notes after its pull-off to get over the new fret; in the double tap it has only the last note of the bar. Either way the fretting hand moves while the first tap of the new bar sounds.",
    "On the B string and the G string, let the first finger lie a little flat so that it touches the thinner string beside it. On every string the heel of the tapping hand rests on the thicker strings.",
  ],
  payoff: "The four-note loop through Em, C, D and B over a band, and two taps a beat through the same four chords.",
  difficultyException:
    "The loop and the double tap pass at 85 BPM on one chord. Most lines here pass at 80, as the loop through the chords does, because a hand has to move inside one sixteenth. The demand is the chord changes in a second key, which the metric counts only as shifts.",
  exercises: [
    {
      id: "loop-em-to-c",
      title: "The loop, Em to C",
      purpose: "One bar of each on the B string, in the four-note loop. Tap 12 over frets 5 and 8 is B, E and G, an E minor chord. Tap 13 over the same two frets is C, E and G, a C chord: only the tap moves.",
      howTo: [
        "Sixteenths, four loops a bar: tap, pull off to the first finger at fret 5, hammer the little finger at fret 8, pull off to the first finger again. Tap fret 12 for the Em bar and fret 13 for the C bar.",
        "After its pull-off the tapping finger is free for three notes. Use them: be over the new fret before the bar line. The fretting hand does not move.",
        "After a take, check that the top string is not ringing.",
      ],
      coach: "The taps carry the timing. Where each one landed is for your ear.",
      tab: LOOP_EM_TO_C,
      position: 5,
      chords: "Em | C",
      harmony: { chordTones: true, cover: true },
      rungs: ladder(50, 120, 10),
      passAt: 85,
      ...TAPS,
      selfCheck: [NOISE_CHECK],
      minutes: 5,
    },
    {
      id: "double-tap-d-to-b",
      title: "Two taps a beat, D to B",
      purpose: "The double tap over the big move of this progression. D is tap 15 over frets 7 and 10: D, F# and A. B is tap 12 over frets 4 and 7: B, D# and F#. Both hands go down three frets, and back up for the repeat.",
      howTo: [
        "Sixteenths on the B string, four figures a bar: tap, pull off to the first finger, tap again, pull off to the little finger. The D bar is 15, 7, 15, 10. The B bar is 12, 4, 12, 7.",
        "Every bar ends on the little finger's note. The tapping hand moves while that note sounds. The fretting hand moves while the first tap of the new bar sounds, and the first finger is down at its new fret before that tap pulls off. The little finger lifts as the hand moves, so that the first pull-off lands on the first finger.",
        "Both hands move the same distance, so the gap between them does not change. Look at the fret the first finger is going to: fret 4 on the way down, fret 7 on the way back.",
      ],
      coach: "Two taps a beat carry the timing. Listen for the first beat of each new bar.",
      tab: DOUBLE_D_TO_B,
      position: 7,
      shifts: true,
      chords: "D | B",
      harmony: { chordTones: true, cover: true },
      rungs: ladder(50, 110, 10),
      passAt: 80,
      ...TAPS,
      minutes: 5,
    },
    {
      id: "loop-em-c-d-b",
      title: "The loop through Em, C, D and B",
      purpose: "Four bars of the four-note loop, one chord each. The tap moves alone for C, both hands go up two frets for D, both drop three frets for B, and the fretting hand comes up one fret to start again.",
      howTo: [
        "Sixteenths, four loops a bar, on the B string. Em: 12, 5, 8, 5. C: 13, 5, 8, 5. D: 15, 7, 10, 7. B: 12, 4, 7, 4.",
        "Each bar ends on a pull-off to the first finger. The tapping hand moves during the three notes after its last tap; the fretting hand moves while the first tap of the new bar sounds.",
        "Keep the first finger and the little finger the same distance apart as they slide. The shape never changes, only where it sits.",
      ],
      coach: "The taps carry the timing. The first tap of each bar shows whether the move was on time.",
      tab: LOOP_EM_C_D_B,
      position: 5,
      shifts: true,
      chords: EM_CHART,
      harmony: { chordTones: true, cover: true },
      rungs: ladder(50, 110, 10),
      passAt: 80,
      ...TAPS,
      selfCheck: [NOISE_CHECK],
      minutes: 6,
    },
    {
      id: "double-tap-em-c-d-b",
      title: "Two taps a beat through four chords",
      purpose: "The double tap over Em, C, D and B, a bar each. The tapped note sounds twice a beat, so the top note of each chord is heard all through its bar: B, then C, then D, then B again.",
      howTo: [
        "Sixteenths, four figures a bar, on the B string. Em: 12, 5, 12, 8. C: 13, 5, 13, 8. D: 15, 7, 15, 10. B: 12, 4, 12, 7.",
        "The tapping hand keeps a steady eighth-note pulse and never waits. When it changes fret, it changes between two taps.",
        "Inside a bar the first finger stays down. The little finger lifts for the first pull-off and is back down for the second.",
      ],
      coach: "Two taps a beat give a firm grid: they are timed and counted. The pull-offs between them are for your ear.",
      tab: DOUBLE_EM_C_D_B,
      position: 5,
      shifts: true,
      chords: EM_CHART,
      harmony: { chordTones: true, cover: true },
      rungs: ladder(50, 110, 10),
      passAt: 80,
      ...TAPS,
      minutes: 6,
    },
    {
      id: "loop-with-the-band",
      title: "The loop with the band",
      purpose: "Em, C, D and B in the four-note loop on the B string, over a rock band, one chord a bar.",
      howTo: [
        "Sixteenths, four loops a bar. Em is tap 12 over frets 5 and 8, C is tap 13 over frets 5 and 8, D is tap 15 over frets 7 and 10, and B is tap 12 over frets 4 and 7.",
        "The band follows the chord you are tapping. If a move is late, leave out a loop and come back in on the next beat.",
        VARIANT_NOTE,
      ],
      coach: "Band on. The taps carry the timing, and where each one landed is for your ear. Direct input or headphones is the honest way to take this.",
      vary: onStringKeys(LOOP_EM_C_D_B, EM_CHART, "rock8"),
      tab: LOOP_EM_C_D_B,
      position: 5,
      shifts: true,
      chords: EM_CHART,
      jam: { groove: "rock8", key: "E minor" },
      harmony: { chordTones: true, cover: true },
      rungs: ladder(50, 110, 10),
      passAt: 80,
      ...TAPS,
      minutes: 7,
    },
  ],
};

/** Intermediate, after `two-strings`: the cell on two strings while the chord changes. */
export const STRINGS_THROUGH_CHORDS: StepSpec = {
  id: "strings-through-chords",
  title: "Two strings, four chords",
  goal: "Change string and change chord in one tapped line: Am and F on the top string, C and Em on the B string, in triplets.",
  why: "The same frets on the next string are another chord. Tap 12 over frets 5 and 8 is Am on the top string and Em on the B string. Tap 13 over the same frets is F on the top string and C on the B string. So one hand shape and two tap frets give four chords, and a progression can cross strings without the fretting hand leaving its place. Until now a chord changed when a hand moved along the string. Here some chords change by crossing to the other string and some by moving the tap, so the string does not change every time the chord does.",
  howTo: [
    "The middle finger of the picking hand taps. The first finger holds fret 5 and the little finger hammers fret 8, on both strings: the fretting hand never moves along the neck in this Step.",
    "To change string, the tapping hand crosses during the last hammer-on of the bar. The first finger rolls onto the new string and is down at fret 5 before the first tap there pulls off.",
    "Going to the B string, let the first finger lie a little flat so that it touches the top string and stops it. Going back to the top string, the heel of the tapping hand comes down on the B string.",
    "Each bar line changes one thing only, the string or the tap's fret. Know which before you get there.",
    "Other Takes play the Exercise with the band two frets higher, in B minor, or three frets higher, in C minor.",
  ],
  payoff: "Am, F, C and Em in tapped triplets over a band, on two strings, with the fretting hand in one place.",
  difficultyException:
    "The string changes at a bar line here, at most once a bar, where the Step before changed string on every beat, and the metric counts crossings per note. The demand is that the chord changes at every bar line and the string only at some of them.",
  exercises: [
    {
      id: "am-to-em",
      title: "Am to Em, one string over",
      purpose: "These are the two cells of 'Top string, B string', now a bar each and with their chord names. Tap 12 over frets 5 and 8 is E, A and C on the top string, an A minor chord. On the B string it is B, E and G, an E minor chord.",
      howTo: [
        "Triplets, four cells a bar. The Am bar is on the top string and the Em bar is on the B string, both with the tap at fret 12, the first finger at fret 5 and the little finger at fret 8.",
        "The tapping hand crosses during the last hammer-on of the bar. The first finger is down on the new string before the first tap there pulls off. Neither hand moves along the neck.",
        "After a take, listen for the string you left: it should be silent.",
      ],
      coach: "The taps carry the timing. Which string each one landed on is for your ear. A string that gets struck in the crossing can count as an extra note; one that only rings is for your ear as well.",
      tab: AM_TO_EM,
      position: 5,
      chords: "Am | Em",
      harmony: { chordTones: true, cover: true },
      rungs: ladder(50, 120, 10),
      passAt: 90,
      ...TAPS,
      selfCheck: [NOISE_CHECK],
      minutes: 5,
    },
    {
      id: "am-f-c-em",
      title: "Am, F, C, Em",
      purpose: "Four bars, one chord each, and one thing changes at each bar line. The tap moves up a fret for F, both hands cross to the B string for C, the tap moves back down a fret for Em, and both hands cross back to the top string to start again.",
      howTo: [
        "Triplets, four cells a bar. Am: top string, tap 12. F: top string, tap 13. C: B string, tap 13. Em: B string, tap 12. The first finger is at fret 5 and the little finger at fret 8 throughout.",
        "The chord changes at every bar line and the string at every second one. Count the four bars aloud once, saying 'tap' or 'string' for what moves next.",
        "F on the top string is F, A and C. C on the B string is C, E and G.",
      ],
      coach: "The taps carry the timing. Where each one landed, fret and string, is for your ear.",
      tab: AM_F_C_EM,
      position: 5,
      chords: TWO_STRING_CHART,
      harmony: { chordTones: true, cover: true },
      rungs: ladder(50, 120, 10),
      passAt: 90,
      ...TAPS,
      selfCheck: [NOISE_CHECK],
      minutes: 6,
    },
    {
      id: "two-strings-with-the-band",
      title: "Two strings with the band",
      purpose: "Am, F, C and Em over a band with a triplet feel, one chord a bar: two bars on the top string, then two on the B string.",
      howTo: [
        "Triplets, four cells a bar. Am is tap 12 on the top string, F is tap 13 on the top string, C is tap 13 on the B string, and Em is tap 12 on the B string, all over the first finger at fret 5 and the little finger at fret 8.",
        "The band follows the chord you are tapping. If a crossing is late, leave out a cell and come back in on the next beat.",
        VARIANT_NOTE,
      ],
      coach: "Band on. The taps carry the timing, and where each one landed is for your ear. Direct input or headphones is the honest way to take this.",
      vary: inKeys(AM_F_C_EM, TWO_STRING_CHART, "rockTwelveEight"),
      tab: AM_F_C_EM,
      position: 5,
      chords: TWO_STRING_CHART,
      jam: { groove: "rockTwelveEight", key: "A minor" },
      harmony: { chordTones: true, cover: true },
      rungs: ladder(50, 120, 10),
      passAt: 90,
      ...TAPS,
      minutes: 7,
    },
  ],
};

/** Intermediate, after `scale-under-the-tap`: the six-note figure a second time, in E minor. */
export const SCALE_TAP_AGAIN: StepSpec = {
  id: "scale-tap-again",
  title: "The scale under the tap, in E minor",
  goal: "Play the six-note figure on the B string in E minor, walk the tap down the scale over it, and take the figure from Em to Am.",
  why: "Six notes from one tap is the hardest thing in this Level, and it was learned in one key. On the B string, frets 5, 7 and 8 are E, F# and G, the first three notes of the E minor scale, so the fingers the top string used, 1, 3 and 4, play the figure in a second key. The frets and fingers do not change, so what the second key tests is the string: the B string is thicker, has a string to keep quiet on each side, and until now took fingers 1, 2 and 4 for this figure. The tempos stay slow on purpose.",
  howTo: [
    "Sextuplets: six to the click, with the tap on the click. The middle finger of the picking hand taps.",
    "Fingers 1, 3 and 4 hold frets 5, 7 and 8. All three are down when you tap, so each pull-off has a note to land on.",
    "On the B string, let the first finger lie a little flat so that it touches the top string and keeps it quiet. On the top string, the heel of the tapping hand rests on the B string.",
    "If the last two notes fade, practise the fretting hand alone: pull, pull, hammer, hammer.",
    SAFETY,
  ],
  payoff: "The six-note figure in a second key, with a melody in the taps, and from Em to Am.",
  exercises: [
    {
      id: "scale-tap-e-minor",
      title: "Six notes from one tap, in E minor",
      purpose: "The figure on the B string: tap 12, pull off to 8, 7 and 5, hammer 7 and 8. B, G, F#, E, F#, G: six to the beat.",
      howTo: [
        "Sextuplets. One tap a beat; the fretting hand plays the other five notes.",
        "The frets and fingers are the ones the top string had: little finger at fret 8, third finger at fret 7, first finger at fret 5. In A minor the B string took the middle finger at fret 6; in E minor it does not.",
        "Lean a little on the fourth note, the E at fret 5. It is the middle of the beat and keeps the six even.",
      ],
      coach: "One tap a beat carries the timing. On a recording, count the notes between the taps: there should be five.",
      tab: SCALE_TAP_EM,
      position: 5,
      harmony: { scale: ["E", "naturalMinor"] },
      rungs: ladder(40, 90, 5),
      passAt: 60,
      ...TAPS,
      selfCheck: ["On a recording, can you hear all six notes of each beat?"],
      minutes: 7,
    },
    {
      id: "scale-tap-walks-down",
      title: "The tap walks down the scale",
      purpose: "The six-note figure with the tap at 17, 15, 13 and 12, a beat each: E, D, C and B, down the E minor scale, over the same five notes from the fretting hand.",
      howTo: [
        "Sextuplets, on the B string. The fretting hand repeats frets 8, 7, 5, 7, 8; only the tap changes.",
        "The steps down are two frets, two frets, then one. At the repeat the tap jumps five frets, from 12 back up to 17: move early and wait above the string.",
        "The first tap, at fret 17, is E, an octave above the first finger's E at fret 5.",
      ],
      coach: "The taps carry the timing. Where each one landed is for your ear.",
      tab: SCALE_TAP_DOWN,
      position: 5,
      harmony: { scale: ["E", "naturalMinor"] },
      rungs: ladder(40, 90, 5),
      passAt: 60,
      ...TAPS,
      minutes: 7,
    },
    {
      id: "scale-tap-em-to-am",
      title: "The figure from Em to Am",
      purpose: "One bar on the B string and one on the top string, at the same frets. On the B string the figure is B over E, F# and G, for the Em bar. On the top string it is E over A, B and C, the figure you learned first, for the Am bar.",
      howTo: [
        "Sextuplets, four figures a bar: tap 12 over frets 5, 7 and 8 on both strings, with the same fingers.",
        "The first finger's note is the root of each chord: E on the B string, A on the top string. The third finger's note, F# in the first bar and B in the second, is a step of the scale between the chord's notes.",
        "The tapping hand and the first and third fingers cross during the last hammer-on of the bar, while the little finger still holds its note. The little finger follows while the tap sounds: it must be down at fret 8 before the tap pulls off.",
      ],
      coach: "One tap a beat carries the timing. The first beat of each bar shows whether the crossing was on time.",
      tab: SCALE_TAP_EM_AM,
      position: 5,
      chords: "Em | Am",
      harmony: { scaleOverChords: ["E", "naturalMinor"] },
      rungs: ladder(40, 85, 5),
      passAt: 55,
      ...TAPS,
      selfCheck: [NOISE_CHECK],
      minutes: 7,
    },
  ],
};
