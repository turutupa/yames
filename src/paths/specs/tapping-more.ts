/**
 * Tapping: consolidation Steps (2026-11-19). Drafts, like the Path they belong to.
 *
 * The Path is short on purpose, but three of its ideas are met once and in A
 * minor only: the cell through a progression, two tapped notes with a string
 * skip, and a four-bar line over a band. These Steps take each of them to a
 * second key, E minor, and add nothing to the technique.
 *
 * - `cell-in-e-minor` closes the Beginner Level: it is the triplet cell and the
 *   chord moves of the Step before it and nothing else, so it belongs with them
 *   and not with the sixteenths that open Intermediate.
 * - `two-taps-through-chords` follows the Advanced Step that teaches its two figures.
 * - `second-solo` is the last Step: it is the second of two solos, in sixteenths
 *   where the first is in triplets, so it comes after `over-the-band`.
 *
 * Everything is graded on timing and notes heard, never on pitch. Every id is
 * new, so nobody's progress moves. Every line is original.
 */
import type { ExerciseSpec, StepSpec, VariantParams, VarySpec } from "../spec";
import type { PassBar } from "../format";
import { ladder, repeat, shiftFrets } from "../templates";
import { chartIn } from "./triadShapes";

// --- Copied from tapping.ts (a Path's extra Steps cannot import the Path) ---------

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

// --- Figures of this file ------------------------------------------------------

/** The cell from the top down, with its fingers: tap, pull to the little finger, pull to the first, hammer the little finger. */
const roll = (s: number, [t, a, b]: number[]) => `${s}:${t}t ${s}:${b}pf4 ${s}:${a}pf1 ${s}:${b}hf4`;
/** Two tapped notes over two fretted ones: tap, pull, hammer, the higher tap, pull, pull. */
const twoTap = (s: number, [t, u, a, b]: number[]) =>
  `${s}:${t}t ${s}:${a}pf1 ${s}:${b}hf4 ${s}:${u}t ${s}:${b}pf4 ${s}:${a}pf1`;
/** The cell on the top string, then on the G string with the third finger, both tapped at one fret. */
const skip = ([t, a, b]: number[]) => `${cell(1, [t, a, b])} ${cell(3, [t, a, b - 1])}`;

/** Every note of a one-string tab on another string. */
const onString = (tab: string, s: number) => tab.replace(/\d:(\d+)/g, (_all, fret) => `${s}:${fret}`);

// E minor on the B string: the frets A minor has on the top string.
const EM = [12, 5, 8];
const C = [13, 5, 8];
const D = [15, 7, 10];
const B = [12, 4, 7];
const EM_CHART = "Em | C | D | B";

const EM_TO_C = bars(2, "/8t", [EM, C], cell, 4);
const D_TO_B = bars(2, "/8t", [D, B], cell, 4);
const EM_C_D_B = bars(2, "/8t", [EM, C, D, B], cell, 4);

/**
 * A B-string line on the other tapping strings. The same frets a string over are
 * the same shapes in another key: A minor on the top string, C minor on the G string.
 */
const STRING_KEYS: Readonly<Record<string, { string: number; by: number; key: string; root: string; leading: string }>> = {
  "B: E minor": { string: 2, by: 0, key: "E minor", root: "E", leading: "D#" },
  "top E: A minor": { string: 1, by: 5, key: "A minor", root: "A", leading: "G#" },
  "G: C minor": { string: 3, by: -4, key: "C minor", root: "C", leading: "B" },
};
type OwnText = Readonly<Record<string, { purpose: string; howTo: string[] }>>;
function onStringKeys(tab: string, chart: string, groove: string, melody = false, own: OwnText = {}): VarySpec {
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
        ...(melody ? { harmony: { scaleOverChords: [to.root, "naturalMinor"], allowed: [to.leading] } } : {}),
        // Words written by hand for a version the rewrite gives none.
        ...(own[p.stringSet] ?? {}),
      };
    },
  };
}

// Two taps and the skip, on the top and G strings with the fretting hand at fret 7.
const EM7_TAPS = [12, 15, 7, 10];
const AM7_TAPS = [12, 15, 5, 8];
const BM7_TAPS = [14, 17, 7, 10];
const EM7_SKIP = [12, 7, 10];
const AM7_SKIP = [12, 5, 8];
const sextuplets = (figure: string) => `/16t ${repeat(figure, 4)}`;

const TWO_TAPS_EM_AM = `${sextuplets(twoTap(1, EM7_TAPS))} | ${sextuplets(twoTap(1, AM7_TAPS))}`;
const TWO_TAPS_EM_BM = `${sextuplets(twoTap(1, EM7_TAPS))} | ${sextuplets(twoTap(1, BM7_TAPS))}`;
const SKIP_EM_AM = `${sextuplets(skip(EM7_SKIP))} | ${sextuplets(skip(AM7_SKIP))}`;
const TAPS_AND_SKIP_LINE = [
  sextuplets(twoTap(1, EM7_TAPS)),
  sextuplets(skip(EM7_SKIP)),
  sextuplets(skip(AM7_SKIP)),
  sextuplets(twoTap(1, BM7_TAPS)),
].join(" | ");

/** A figure of this Step moved up the neck: the chart moves with it. */
const KEY_SHIFT: Readonly<Record<string, number>> = { "E minor": 0, "F# minor": 2, "G minor": 3 };
function inKeys(tab: string, chart: string, shifts: boolean, chordTones: boolean, groove?: string): VarySpec {
  return {
    values: { key: Object.keys(KEY_SHIFT) },
    pooled: ["key"],
    label: (p: VariantParams) => p.key,
    build: (p: VariantParams) => {
      const by = KEY_SHIFT[p.key];
      return {
        tab: shiftFrets(tab, by),
        position: 7 + by,
        shifts,
        chords: chartIn(chart, by, p.key),
        ...(groove ? { jam: { groove, key: p.key } } : {}),
        harmony: chordTones
          ? { chordTones: true, cover: true }
          : { scaleOverChords: [p.key.split(" ")[0], "naturalMinor"] },
      };
    },
  };
}

// The second solo: the loop for Em and C, the cell from the top down for D and B.
const SOLO_LINE = [
  `/16 ${repeat(four(2, EM), 4)}`,
  `/16 ${repeat(four(2, C), 4)}`,
  `/16 ${repeat(roll(2, D), 4)}`,
  `/16 ${repeat(roll(2, B), 4)}`,
].join(" | ");
/** One tapped note a beat over a bar's two fretted notes. */
const tune = (taps: readonly number[], [, a, b]: number[], group: (s: number, f: number[]) => string) =>
  `/16 ${taps.map((t) => group(2, [t, a, b])).join(" ")}`;
const SOLO_MELODY = [
  tune([17, 15, 12, 15], EM, four),
  tune([17, 15, 13, 15], C, four),
  tune([19, 17, 15, 17], D, roll),
  tune([19, 16, 12, 16], B, roll),
].join(" | ");
const SOLO_EIGHT = `${SOLO_LINE} | ${SOLO_MELODY}`;
const EIGHT_CHART = `${EM_CHART} | ${EM_CHART}`;

/** Beginner, after the cell through Am, F, G and E: the same cell in a second key, on the B string. */
export const CELL_IN_E_MINOR: StepSpec = {
  id: "cell-in-e-minor",
  title: "The cell in E minor",
  goal: "Take the tapped cell through Em, C, D and B on the B string: two chords at a time, then all four, then all four with the band.",
  why: "A tapped arpeggio is a shape, and a shape moves. The frets you played on the top string for A minor are E minor on the B string: tap 12 over frets 5 and 8 is B, E and G. So a second key needs no new shape. What is different is staying on the B string, which has a string to keep quiet on each side of it, and the order of the chords, which holds a bigger move for the fretting hand than any so far: from D to B both hands go down three frets.",
  howTo: [
    "On the B string, Em is tap 12 over frets 5 and 8. C is tap 13 over the same two frets: only the tap moves.",
    "For D the fretting hand moves up to frets 7 and 10 and the tap to 15. For B it drops to frets 4 and 7 with the tap at 12.",
    "On the B string the pull-off from the tap ends against the top string, and on the G string it ends against the B string. Let the first finger lie a little flat, so that it touches that thinner string and keeps it quiet. The heel of the tapping hand rests on the thicker strings.",
  ],
  payoff: "Em, C, D and B in tapped triplets over a band: the cell in a second key, on a second string.",
  exercises: [
    {
      id: "em-to-c",
      title: "Em to C",
      purpose: "One bar of each on the B string. Tap 12 over frets 5 and 8 is B, E and G, an E minor chord. Move the tap to fret 13 and it is C, E and G, a C chord, without the fretting hand doing anything.",
      howTo: [
        "Triplets, four cells a bar. Tap fret 12 for the Em bar and fret 13 for the C bar, each over the first finger at fret 5 and the little finger at fret 8.",
        "These are the frets of Am to F, one string over. After a take, check that the top string is not ringing.",
      ],
      coach: "The taps carry the timing. The change at the bar line is where it slips.",
      tab: EM_TO_C,
      position: 5,
      chords: "Em | C",
      harmony: { chordTones: true, cover: true },
      rungs: ladder(50, 120, 10),
      passAt: 90,
      ...TAPS,
      selfCheck: [NOISE_CHECK],
      minutes: 5,
    },
    {
      id: "d-to-b",
      title: "D to B",
      purpose: "The big move of this progression, by itself. D is tap 15 over frets 7 and 10: D, F# and A. B is tap 12 over frets 4 and 7: B, D# and F#. Both hands go down three frets, and back up for the repeat.",
      howTo: [
        "Triplets, four cells a bar, on the B string: one bar of D, one bar of B.",
        "Both hands move the same distance, so the gap between them does not change. Look at the fret the first finger is going to: fret 4 on the way down, fret 7 on the way back.",
        "The tapping hand moves during the last hammer-on of the bar. The fretting hand moves while the first tap of the new bar sounds, and the first finger is down at its new fret before that tap pulls off.",
      ],
      coach: "The taps carry the timing. Listen for the first cell of each new bar.",
      tab: D_TO_B,
      position: 7,
      shifts: true,
      chords: "D | B",
      harmony: { chordTones: true, cover: true },
      rungs: ladder(50, 120, 10),
      passAt: 90,
      ...TAPS,
      minutes: 5,
    },
    {
      id: "em-c-d-b",
      title: "Em, C, D, B",
      purpose: "Four bars, one chord each. The tap moves alone for C, both hands go up two frets for D, both drop three frets for B, and the fretting hand comes up one fret to start again.",
      howTo: [
        "Triplets, four cells a bar, on the B string. Em: 12 over 5 and 8. C: 13 over 5 and 8. D: 15 over 7 and 10. B: 12 over 4 and 7.",
        "Keep the first finger and the little finger the same distance apart as they slide. The shape never changes, only where it sits.",
      ],
      coach: "The taps carry the timing. Listen for the first cell of each new bar.",
      tab: EM_C_D_B,
      position: 5,
      shifts: true,
      chords: EM_CHART,
      harmony: { chordTones: true, cover: true },
      rungs: ladder(50, 120, 10),
      passAt: 90,
      ...TAPS,
      selfCheck: [NOISE_CHECK],
      minutes: 6,
    },
    {
      id: "em-with-the-band",
      title: "Four chords with the band",
      purpose: "Em, C, D and B on the B string over a band with a triplet feel, one chord a bar.",
      howTo: [
        "Triplets, four cells a bar. Em is tap 12 over frets 5 and 8, C is tap 13 over frets 5 and 8, D is tap 15 over frets 7 and 10, and B is tap 12 over frets 4 and 7.",
        "The band follows the chord you are tapping. If a move is late, leave out a cell and come back in on the next beat.",
        VARIANT_NOTE,
      ],
      coach: "Band on. The taps carry the timing; direct input or headphones is the honest way to take this.",
      vary: onStringKeys(EM_C_D_B, EM_CHART, "rockTwelveEight", false, {
        "G: C minor": {
          purpose: "Cm, Ab, Bb and G on the G string over a band with a triplet feel, one chord a bar.",
          howTo: [
            "Triplets, four cells a bar. Cm is tap 12 over frets 5 and 8, Ab is tap 13 over frets 5 and 8, Bb is tap 15 over frets 7 and 10, and G is tap 12 over frets 4 and 7.",
            "The band follows the chord you are tapping. If a move is late, leave out a cell and come back in on the next beat.",
          ],
        },
      }),
      tab: EM_C_D_B,
      position: 5,
      shifts: true,
      chords: EM_CHART,
      jam: { groove: "rockTwelveEight", key: "E minor" },
      harmony: { chordTones: true, cover: true },
      rungs: ladder(50, 120, 10),
      passAt: 90,
      ...TAPS,
      minutes: 7,
    },
  ],
};

/** Advanced, after the two figures are learned on one chord: the same figures in E minor, through chords. */
export const TWO_TAPS_THROUGH_CHORDS: StepSpec = {
  id: "two-taps-through-chords",
  title: "Two taps and the skip through chords",
  goal: "Play the two-tap figure and the string skip in E minor, move each between two chords, and join them in a four-bar line.",
  why: "Both figures were learned on one chord, with the fretting hand at fret 5. Here the hand goes to fret 7, where the same taps make an E minor seventh chord, and the figures start to follow chords: sometimes the fretting hand moves under taps that stay, sometimes the taps move over a hand that stays. Nothing in the motion is new. The work is making the move at the bar line without a gap in the sextuplets.",
  howTo: [
    "In E minor, on the top string, put the first finger at fret 7 and the little finger at fret 10 and tap frets 12 and 15: E, B, D and G, an E minor seventh chord. Move the fretting hand down to frets 5 and 8 and the same taps give A minor seventh, the two-tap figure of the Step before.",
    "For B minor seventh the fretting hand stays at frets 7 and 10 and both taps go up two frets, to 14 and 17.",
    "The skip is the cell on the top string and then on the G string, both tapped at fret 12. On the G string the third finger hammers: fret 9 in the E minor bar, fret 7 in the A minor bar.",
    "Other Takes play the same shapes two frets higher, in F# minor, or three frets higher, in G minor.",
  ],
  payoff: "A four-bar tapped line in E minor with two tapped notes, a string skip and three chords, over a band.",
  exercises: [
    {
      id: "two-taps-em-am",
      title: "Two taps, the fretting hand moves",
      purpose: "The two-tap figure for a bar on each chord. The taps stay at frets 12 and 15, E and G, and the fretting hand moves under them: frets 7 and 10 for E minor seventh, frets 5 and 8 for A minor seventh.",
      howTo: [
        "Sextuplets on the top string, four figures a bar: tap 12, pull off to the first finger, hammer the little finger, tap 15, pull off to the little finger, pull off to the first.",
        "The fretting hand moves two frets while the first tap of the new bar is sounding. Keep both fingers in their shape as it moves, and have the first finger down before that tap pulls off.",
        VARIANT_NOTE,
      ],
      coach: "Two taps a beat, at two frets, carry the timing. The first beat after each move is where it slips.",
      vary: inKeys(TWO_TAPS_EM_AM, "Em7 | Am7", true, true),
      tab: TWO_TAPS_EM_AM,
      position: 7,
      shifts: true,
      chords: "Em7 | Am7",
      harmony: { chordTones: true, cover: true },
      rungs: ladder(40, 90, 5),
      passAt: 65,
      ...TAPS,
      minutes: 7,
    },
    {
      id: "two-taps-em-bm",
      title: "Two taps, the taps move",
      purpose: "The opposite move: the fretting hand stays at frets 7 and 10 and both taps go up two frets. Taps at 12 and 15 make E minor seventh. Taps at 14 and 17, F# and A, make B minor seventh.",
      howTo: [
        "Sextuplets on the top string, four figures a bar. Bar 1 taps frets 12 and 15 and bar 2 taps frets 14 and 17, all over the first finger at fret 7 and the little finger at fret 10.",
        "Move the tapping hand as a whole, with the thumb sliding along the edge of the neck, while the pull-offs at the end of the bar sound.",
        VARIANT_NOTE,
      ],
      coach: "The taps carry the timing. Where each one landed is for your ear.",
      vary: inKeys(TWO_TAPS_EM_BM, "Em7 | Bm7", false, true),
      tab: TWO_TAPS_EM_BM,
      position: 7,
      chords: "Em7 | Bm7",
      harmony: { chordTones: true, cover: true },
      rungs: ladder(40, 90, 5),
      passAt: 70,
      ...TAPS,
      minutes: 7,
    },
    {
      id: "skip-em-am",
      title: "The skip over two chords",
      purpose: "The string skip for a bar on each chord, tapped at fret 12 throughout. In the E minor bar the top string plays E, B, D and the G string plays G, D, E: every note belongs to E minor seventh. The second bar is the same skip with the fretting hand two frets lower; its D is a note of the scale, not of the chord.",
      howTo: [
        "Sextuplets, changing string every half beat: the cell on the top string, then on the G string. Em7: tap 12 over frets 7 and 10, then tap 12 over frets 7 and 9. Am7: tap 12 over frets 5 and 8, then tap 12 over frets 5 and 7.",
        "On the G string the third finger hammers. Rest the middle finger on the string in between so it can't ring when both hands jump over it.",
        VARIANT_NOTE,
      ],
      coach: "The taps carry the timing. A B string that gets struck can count as an extra note; one that only rings is for your ear.",
      vary: inKeys(SKIP_EM_AM, "Em7 | Am7", true, false),
      tab: SKIP_EM_AM,
      position: 7,
      shifts: true,
      chords: "Em7 | Am7",
      harmony: { scaleOverChords: ["E", "naturalMinor"] },
      rungs: ladder(40, 90, 5),
      passAt: 65,
      ...TAPS,
      selfCheck: [NOISE_CHECK],
      minutes: 7,
    },
    {
      id: "taps-and-skip-line",
      title: "Four bars: two taps and the skip",
      purpose: "Four bars that use everything in this Step: two taps over E minor seventh, the skip over E minor seventh, the skip over A minor seventh, and two taps over B minor seventh.",
      howTo: [
        "Sextuplets, one kind of figure in each bar, played four times. Bar 1: two taps at frets 12 and 15 over frets 7 and 10. Bar 2: the skip, tapped at fret 12, over frets 7 and 10 on the top string and frets 7 and 9 on the G string. Bar 3: the same skip with the fretting hand at frets 5 and 8, then 5 and 7. Bar 4: back to frets 7 and 10 on the top string, with two taps at frets 14 and 17.",
        "Take the bar lines one at a time before joining them. Bar 3 into bar 4 is the hard one: both hands move and the figure changes.",
        VARIANT_NOTE,
      ],
      coach: "Band on. The taps carry the timing. Record it: at this speed your ear in the moment is not a fair judge.",
      vary: inKeys(TAPS_AND_SKIP_LINE, "Em7 | Em7 | Am7 | Bm7", true, false, "rock8"),
      tab: TAPS_AND_SKIP_LINE,
      position: 7,
      shifts: true,
      chords: "Em7 | Em7 | Am7 | Bm7",
      jam: { groove: "rock8", key: "E minor" },
      harmony: { scaleOverChords: ["E", "naturalMinor"] },
      rungs: ladder(40, 90, 5),
      passAt: 65,
      ...TAPS,
      selfCheck: [NOISE_CHECK],
      minutes: 8,
    },
  ],
};

/** Advanced, the last Step: a second solo, in E minor and in sixteenths, as `over-the-band` is in A minor and triplets. */
export const SECOND_SOLO: StepSpec = {
  id: "second-solo",
  title: "A second solo, in E minor",
  goal: "Play a four-bar tapped line in sixteenths over a band in E minor, then the same line with a melody in the taps, then both back to back.",
  why: "The first solo was in A minor and in triplets. This one is in E minor, on the B string, in sixteenths over a straight rock beat, and it is made only of figures you have: the four-note loop, the cell from the top down, and a tap that moves once a beat. Joined, the two halves make eight bars with a chord change in every one.",
  howTo: [
    "Em and C use the four-note loop: tap, pull off to the first finger, hammer the little finger, pull off to the first. D and B use the cell from the top down: tap, pull off to the little finger, pull off to the first, hammer the little finger.",
    "The fretting hand is where the cell in E minor put it: frets 5 and 8 for Em and C, frets 7 and 10 for D, frets 4 and 7 for B. In E minor that is the B string. Other Takes play the same frets on the top string, in A minor, or on the G string, in C minor.",
    "Learn the line first, then the melody over the same fretted notes.",
    SAFETY,
  ],
  payoff: "Eight bars of tapping over a band in a second key: a line, then a melody over the same chords.",
  exercises: [
    {
      id: "em-line",
      title: "Four bars: the line",
      purpose: "Em, C, D and B in tapped sixteenths on the B string, over a rock band. The first two bars are the four-note loop and the last two are the cell from the top down.",
      howTo: [
        "Sixteenths, a tap on every beat. Em: 12, 5, 8, 5. C: 13, 5, 8, 5. D: 15, 10, 7, 10. B: 12, 7, 4, 7.",
        "In the D bar and the B bar the first pull-off lands on the little finger, so the whole hand has to be in its new place, both fingers down, before the tap leaves. The tap holds the string for one sixteenth: move as it lands, not after.",
        VARIANT_NOTE,
      ],
      coach: "Band on. One tap a beat carries the timing; the three notes after it are for your ear.",
      vary: onStringKeys(SOLO_LINE, EM_CHART, "rock8"),
      tab: SOLO_LINE,
      position: 5,
      shifts: true,
      chords: EM_CHART,
      jam: { groove: "rock8", key: "E minor" },
      harmony: { chordTones: true, cover: true },
      rungs: ladder(50, 120, 10),
      passAt: 80,
      ...TAPS,
      minutes: 7,
    },
    {
      id: "em-melody",
      title: "Four bars: a melody over the line",
      purpose: "The same four bars with the tap moving every beat, so the taps play a tune over the chords: E, D, B, D over Em, then E, D, C, D over C, F#, E, D, E over D and F#, D#, B, D# over B.",
      howTo: [
        "Sixteenths, one tapped note a beat, on the B string. Em: tap frets 17, 15, 12 and 15 over frets 5 and 8. C: tap frets 17, 15, 13 and 15 over frets 5 and 8. D: tap frets 19, 17, 15 and 17 over frets 7 and 10. B: tap frets 19, 16, 12 and 16 over frets 4 and 7.",
        "The fretting hand plays what it played in the line. The first tap of every bar is a note of its chord.",
        "Move the tap while the fretting hand plays its three notes. Look at the fret you are going to.",
        VARIANT_NOTE,
      ],
      coach: "Band on. Sixteen taps in four bars carry the timing; where each one landed is for your ear.",
      vary: onStringKeys(SOLO_MELODY, EM_CHART, "rock8", true),
      tab: SOLO_MELODY,
      position: 5,
      shifts: true,
      chords: EM_CHART,
      jam: { groove: "rock8", key: "E minor" },
      harmony: { scaleOverChords: ["E", "naturalMinor"], allowed: ["D#"] },
      rungs: ladder(50, 120, 10),
      passAt: 80,
      ...TAPS,
      minutes: 8,
    },
    {
      id: "em-eight-bars",
      title: "Eight bars: line, then melody",
      purpose: "The two halves joined: four bars of the line and four of the melody, over two rounds of Em, C, D and B with the band.",
      howTo: [
        "Sixteenths, a tap on every beat, on the B string. Bars 1 to 4 are the line, with the tap at fret 12, 13, 15 and 12. Bars 5 to 8 are the melody over the same fretted notes.",
        "The join is bar 4 into bar 5: the tap goes from fret 12 up to fret 17 while the fretting hand comes up one fret, from frets 4 and 7 to frets 5 and 8.",
        VARIANT_NOTE,
      ],
      coach: "Band on. The taps carry the timing. Record it and listen for the bar where the melody begins.",
      vary: onStringKeys(SOLO_EIGHT, EIGHT_CHART, "rock8", true),
      tab: SOLO_EIGHT,
      position: 5,
      shifts: true,
      chords: EIGHT_CHART,
      jam: { groove: "rock8", key: "E minor" },
      harmony: { scaleOverChords: ["E", "naturalMinor"], allowed: ["D#"] },
      rungs: ladder(50, 120, 10),
      passAt: 80,
      ...TAPS,
      selfCheck: ["On a recording, is the eighth bar as even as the first?"],
      minutes: 8,
    },
  ],
};
