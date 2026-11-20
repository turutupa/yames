/**
 * Metal Rhythm: consolidation Steps (2026-11-19). Drafts, like the Path they
 * belong to.
 *
 * The Path was written almost wholly on the open low E string and had not
 * grown since. These three Steps add nothing new for either hand. They take
 * what the Path taught to another place: the chug and the power chord to the A
 * string, the gallop and its reverse under chords that change, and two riffs of
 * earlier Steps into one eight-bar riff with a change of part. Every id is new,
 * so nobody's progress moves. Every line is original.
 *
 * Strokes are taught in words, as in the Path (`pick: "free"`), and a power
 * chord is one attack: timed and counted, never pitch-checked.
 */
import type { ExerciseSpec, StepSpec, VariantParams } from "../spec";
import type { PassBar } from "../format";
import { ladder, moveChart, repeat } from "../templates";

// Copied from metal-rhythm.ts (a Path importing its extra Steps cannot be imported by them).
const even = (min: number, overBars = 4): PassBar => ({ metric: "timingEvenness", min, overBars });
const heard = (min: number, overBars = 4): PassBar => ({ metric: "notesHeard", min, overBars });
const extras = (max: number): PassBar => ({ metric: "extraNotes", max, overBars: 4 });

/** Power chords: timing, notes heard and extras. Two notes at once are not pitch-checked. */
const CHORDS = { grade: "timing", pass: [even(0.85), heard(0.9), extras(4)] } as const satisfies Partial<ExerciseSpec>;
/** Fast figures: the time is harder to hold. */
const FAST = [even(0.8), heard(0.9), extras(3)];

const FREE = { pick: "free" } as const satisfies Partial<ExerciseSpec>;

const MUTE_CHECK = "Did the muted notes thud with a clear pitch, neither ringing open nor choked dead?";
const LOW_E_CHECK = "Did the low E string stay silent from the first bar to the last?";

const A_BLUES = { scale: ["A", "blues"] as [string, string] };

/** Said on every Exercise that also comes a string higher: the words name the first version. */
const VARIANT_NOTE =
  "The strings and the note and chord names here are for the first version. Other Takes play the same frets one string higher, over the open A string.";
/** The same for the chord-change Step, where the roots are fretted after the first bar. */
const CHANGES_NOTE =
  "The strings and chord names here are for the first version. Other Takes play the same frets one string higher: A, C, D and F, with the roots on the A string.";

// What the A-string version adds, and no rewrite of names can: the low E string now lies unplayed under the pick.
const LOW_E_QUIET = "The low E string is not played. Begin every stroke on the A string and let the palm keep the low E string quiet.";
const LOW_E_UNDER = "The low E string is not played. The lowest string the pick touches is the A string, and the palm keeps the low E string quiet.";

/** The A-string version's own words, written by hand: its whole how-to, and its purpose where that names strings, notes or chords. */
type OnA = { purpose?: string; howTo: string[] };

// Power chords, root on the low E string, first and third fingers (as the Path spells them).
const E5 = "6:0+5:2f1";
const G5 = "6:3f1+5:5f3";
const A5 = "6:5f1+5:7f3";
const C5 = "6:8f1+5:10f3";

// The same shape with its root on the A string.
const A5_ON_A = "5:0+4:2f1";
const C5_ON_A = "5:3f1+4:5f3";
const D5_ON_A = "5:5f1+4:7f3";

const gallop = (note: string) => `/8 ${note} /16 ${note} ${note}`;
const reverse = (note: string) => `/16 ${note} ${note} /8 ${note}`;

/** A riff on the low E, A and D strings, also played a string higher: the same frets, a fourth up. */
function aStringHigher(tab: string, position: number, also: { chords?: string; scale?: string; onA?: OnA } = {}) {
  return {
    values: { stringSet: ["low E string", "A string"] },
    pooled: ["stringSet"] as const,
    label: (p: VariantParams) => p.stringSet,
    build: (p: VariantParams) => {
      const higher = p.stringSet === "A string";
      const moved = higher ? tab.replace(/\b4:/g, "3:").replace(/\b5:/g, "4:").replace(/\b6:/g, "5:") : tab;
      return {
        tab: moved,
        position,
        ...(also.chords ? { chords: higher ? moveChart(also.chords, 5) : also.chords } : {}),
        ...(also.scale ? { harmony: { scale: [higher ? "A" : "E", also.scale] as [string, string] } } : {}),
        ...(higher && also.onA ? also.onA : {}),
      };
    },
  };
}

// --- Beginner: the chug from the A string ------------------------------------

// Fingers printed, so the tab shows what the how-to names.
const A_CHUG_NOTES = `/8 5:0m 5:0m 5:3f1 5:0m 5:0m 5:5f3 5:0m 5:0m | 5:0m 5:0m 5:3f1 5:0m 5:5f3 5:6f4 5:5f3 5:3f1`;
const A_C_D = `/4 ${A5_ON_A} ${A5_ON_A} ${C5_ON_A} ${C5_ON_A} | /8 ${repeat(D5_ON_A, 4)} ${repeat(C5_ON_A, 4)}`;
const A_CHUG_CHORDS = `/8 ${A5_ON_A} 5:0m 5:0m ${C5_ON_A} 5:0m 5:0m ${D5_ON_A} 5:0m | ${A5_ON_A} 5:0m 5:0m ${D5_ON_A} 5:0m 5:0m ${C5_ON_A} ${C5_ON_A}`;
const TWO_STRING_RIFF = `/8 6:0m 6:0m ${A5_ON_A} 6:0m 6:0m ${C5_ON_A} 6:0m 6:0m | 6:0m 6:0m ${D5_ON_A} 6:0m 6:0m ${C5_ON_A} /4 ${A5_ON_A}`;

/** Beginner, last Step of the Level: the chug and the chords, one string higher. */
export const A_STRING_CHUG: StepSpec = {
  id: "a-string-chug",
  title: "The chug from the A string",
  goal: "Play the palm-muted chug on the open A string, play A, C and D power chords with their roots on the A string, and put a low E chug under those chords in one riff.",
  why: "So far every chord has had its root on the low E string, and the A string has only had the plain chug to itself. The same chug and the same chord shape work one string higher, and a riff can use both strings at once. Nothing here is new for the picking hand except where it sits: the mute has to be found again on a thinner string, and the low E string, which now lies next to the pick without being played, has to stay silent.",
  howTo: [
    "Move the side of the picking hand so it lies on the A string where the string leaves the bridge. It rests on the low E string too, and that keeps the low E string quiet.",
    "Begin each downstroke on the A string itself, not above it. For a chord, lift the palm and carry the stroke through the A and D strings only.",
    "The chord shape is the one you know: first finger on the root, third finger two frets up on the next string. For A, the A string is open and the first finger takes fret 2 of the D string.",
  ],
  payoff: "A riff with a muted low E string under chords on the A string, and a chug that is at home on two strings.",
  exercises: [
    {
      id: "a-chug-notes",
      title: "Muted and open on the A string",
      purpose: "The chug on the open A string with fretted notes let out of the mute: C, D and E flat on frets 3, 5 and 6. The same move as on the low E string, with the mute found again on a thinner string.",
      howTo: [
        "Eighth notes, two to the click, all downstrokes. Mute the open A notes and let the fretted notes ring: lift the palm just enough as you play them.",
        "First finger on fret 3, third on fret 5, little finger on fret 6, all on the A string. Bar 1 lets out fret 3 and then fret 5. Bar 2 lets out fret 3 and ends on frets 5, 6, 5, 3.",
        "The low E string is not played. Begin every stroke on the A string.",
      ],
      coach: "Every note is timed, and after the take the notes are checked against the written ones. The mute, the direction of the strokes and a quiet low E string are yours to judge.",
      ...FREE,
      tab: A_CHUG_NOTES,
      position: 3,
      harmony: A_BLUES,
      rungs: ladder(60, 160, 10),
      passAt: 100,
      grade: "timingNotes",
      selfCheck: [MUTE_CHECK, LOW_E_CHECK],
      minutes: 5,
    },
    {
      id: "a-c-d-chords",
      title: "A, C and D",
      purpose: "A, C and D power chords with their roots on the A string: the shapes of E, G and A, one string higher. Quarter notes in bar 1, eighth notes in bar 2.",
      howTo: [
        "A: the open A string and fret 2 on the D string. C: fret 3 on the A string and fret 5 on the D string. D: fret 5 and fret 7. Downstrokes through both strings.",
        "Bar 1 is quarter notes: A twice, C twice. Bar 2 is eighth notes: D four times, then C four times.",
        "Begin every stroke on the A string itself, so the low E string is never touched.",
      ],
      coach: "A chord is one attack: it is timed and counted, and its pitch is not checked. Whether only the A and D strings sounded is yours to judge.",
      ...FREE,
      tab: A_C_D,
      position: 2,
      shifts: true,
      chords: "A5 | D5",
      ...CHORDS,
      rungs: ladder(60, 140, 10),
      passAt: 90,
      selfCheck: ["Did both strings of every chord sound, and no others?"],
      minutes: 5,
    },
    {
      id: "a-chug-chords",
      title: "Chords out of the A chug",
      purpose: "Three plus three plus two from the A string: a chord, two muted open A notes, a chord, two more, a chord and one. Bar 1 has A, C and D; bar 2 has A and D, and ends on two C chords.",
      howTo: [
        "Eighth notes, all downstrokes. Muted notes: one string, palm down, small stroke. Chords: palm up, a bigger stroke through the A and D strings.",
        "Bar 1 is A, C, D with two muted notes after the A and the C and one after the D. Bar 2 is A, D, and then C twice to end the bar.",
        "The fretting hand has two muted notes to get to each C and D chord. Keep its fingers off the A string while the open string chugs, and hover over the next chord.",
        "After the A chord, lift the first finger off the D string so the chord does not ring on over the chug.",
      ],
      coach: "Every attack is timed, chug and chord alike, and the evenness is reported. A chord's pitch is not checked, and the mute is yours to judge.",
      ...FREE,
      tab: A_CHUG_CHORDS,
      position: 2,
      shifts: true,
      chords: "A5 | A5",
      ...CHORDS,
      rungs: ladder(60, 150, 10),
      passAt: 100,
      selfCheck: [MUTE_CHECK, LOW_E_CHECK],
      minutes: 6,
    },
    {
      id: "two-string-riff",
      title: "Low E chug, A-string chords",
      purpose: "A riff on both low strings: the muted chug goes back to the open low E string and the chords stay on the A string. Two chugs and a chord, through A, C, D and C, with four chugs in a row over the bar line, to an A held for a beat.",
      howTo: [
        "Eighth notes, all downstrokes. Bar 1: two chugs, A, two chugs, C, two chugs. Bar 2: two chugs, D, two chugs, C, and A held for a beat.",
        "The pick changes string for every chord. Begin the chord's stroke on the A string, so the low E string does not ring under it, and bring the palm back down for the chug.",
        "The last chord is the open A string and fret 2 of the D string. Let it ring for the whole beat.",
      ],
      coach: "Every attack is timed, chug and chord alike, and the evenness is reported. A chord's pitch is not checked; the mute and which strings rang are yours to judge.",
      ...FREE,
      tab: TWO_STRING_RIFF,
      position: 2,
      shifts: true,
      ...CHORDS,
      rungs: ladder(60, 150, 10),
      passAt: 100,
      selfCheck: [MUTE_CHECK, "Did each chord sound on the A and D strings only, with the low E string quiet under it?"],
      minutes: 6,
    },
  ],
};

// --- Intermediate: gallops through chord changes --------------------------------

// Each chord with the muted root the gallops run on.
const CHANGES: ReadonlyArray<readonly [chord: string, root: string]> = [
  [E5, "6:0m"],
  [G5, "6:3mf1"],
  [A5, "6:5mf1"],
  [C5, "6:8mf1"],
];
/** A gallop whose long note is the chord: chord, then two short notes on the muted root. */
const chordGallop = (chord: string, root: string) => `/8 ${chord} /16 ${root} ${root}`;
/** A reverse gallop whose long note is the chord. */
const reverseChord = (chord: string, root: string) => `/16 ${root} ${root} /8 ${chord}`;

// The last beat of each bar is two eighths, so the hand has an eighth note to reach the next chord.
const GALLOP_BAR_CHANGES = CHANGES.map(([chord, root]) => `${chordGallop(chord, root)} ${repeat(gallop(root), 2)} /8 ${root} ${root}`).join(" | ");
const REVERSE_BAR_CHANGES = CHANGES.map(([chord, root]) => repeat(`${reverse(root)} ${reverseChord(chord, root)}`, 2)).join(" | ");
const twoBeats = ([chord, root]: readonly [string, string]) => `${chordGallop(chord, root)} ${reverse(root)}`;
const TWO_BEAT_CHANGES = `${twoBeats(CHANGES[0])} ${twoBeats(CHANGES[1])} | ${twoBeats(CHANGES[2])} ${twoBeats(CHANGES[3])}`;
const BAND_CHANGES = [
  ...CHANGES.slice(0, 3).map(([chord, root]) => `${chordGallop(chord, root)} ${gallop(root)} ${chordGallop(chord, root)} ${reverse(root)}`),
  `${chordGallop(C5, "6:8mf1")} ${gallop("6:8mf1")} ${reverse("6:8mf1")} /4 ${C5}`,
].join(" | ");

/** Intermediate, last Step of the Level: the gallop and its reverse while the chord moves. */
export const GALLOP_CHANGES: StepSpec = {
  id: "gallop-changes",
  title: "Gallops through chord changes",
  goal: "Keep the gallop and the reverse gallop even while the chord under them changes, first every bar and then every two beats.",
  why: "So far the gallop has mostly sat on the open string while a chord or two went by. In a riff with a progression the gallop follows the chords: each chord gets its own galloping root, and the fretting hand has to move the shape without the picking hand waiting for it. A gap or a rushed beat at the change is the usual fault, and the figures themselves are the ones you already have.",
  howTo: [
    "Each chord has its root on one low string. On the low E string, E is the open string, G is fret 3, A is fret 5 and C is fret 8; other Takes play the same frets on the A string, which makes them A, C, D and F.",
    "Play the three fretted chords with the first and third fingers. The chord on the open string needs only the first finger, on fret 2 of the next string. Keep the shape down while you gallop on its root, palm-muted.",
    "The strokes are the ones you know: down, down-up for the gallop, and down-up, down for the reverse gallop. The picking hand swings in sixteenths and never waits.",
    "Start moving the fretting hand on the last note before a change, and let that note be a little short if it has to be. A short note is better than a late chord.",
  ],
  payoff: "A galloping riff that carries four chords, with the click and then with a band.",
  difficultyException:
    "Three attacks to a beat after four in the sixteenth-note Step, at the tempo the gallop Steps pass at or a little under it, so the rate falls. The demand is moving the chord shape under a gallop that does not wait, and the metric does not count a change of chord shape.",
  exercises: [
    {
      id: "gallop-bar-changes",
      title: "The gallop, a chord to a bar",
      purpose: "Four bars, one chord each: E, G, A and C. Every bar starts with its power chord, gallops on that chord's root, and ends on two eighth notes.",
      howTo: [
        "The chord takes the place of the first gallop's long note: chord and two short muted notes on beat 1, a full gallop on beat 2 and another on beat 3, and two muted eighth notes on beat 4. Down, down-up, and two downstrokes to end the bar.",
        "E gallops on the open low E string, G on fret 3, A on fret 5 and C on fret 8, each fretted root under the first finger. Lift the palm for the chord and drop it straight back.",
        "The last eighth note of the bar is where the fretting hand moves. Let that note be short and land the next chord on the click.",
        CHANGES_NOTE,
      ],
      coach: "Every attack is timed, chord and gallop alike, and the evenness is reported. A chord's pitch is not checked; the mute and the strokes are yours to judge.",
      ...FREE,
      vary: aStringHigher(GALLOP_BAR_CHANGES, 2, {
        chords: "E5 | G5 | A5 | C5",
        onA: {
          purpose: "Four bars, one chord each: A, C, D and F, with their roots on the A string. Every bar starts with its power chord, gallops on that chord's root, and ends on two eighth notes.",
          howTo: [
            "The chord takes the place of the first gallop's long note: chord and two short muted notes on beat 1, a full gallop on beat 2 and another on beat 3, and two muted eighth notes on beat 4. Down, down-up, and two downstrokes to end the bar.",
            "The A bar gallops on the open A string, C on fret 3, D on fret 5 and F on fret 8, each fretted root under the first finger. Lift the palm for the chord and drop it straight back.",
            "The last eighth note of the bar is where the fretting hand moves. Let that note be short and land the next chord on the click.",
            LOW_E_QUIET,
          ],
        },
      }),
      tab: GALLOP_BAR_CHANGES,
      position: 2,
      shifts: true,
      chords: "E5 | G5 | A5 | C5",
      ...CHORDS,
      pass: FAST,
      rungs: ladder(50, 140, 10),
      passAt: 100,
      selfCheck: [MUTE_CHECK],
      minutes: 6,
    },
    {
      id: "reverse-bar-changes",
      title: "The reverse gallop, a chord to a bar",
      purpose: "E, G, A and C again, now under the reverse gallop, a bar each. The short notes are muted on the root, and on beats 2 and 4 the long note is the chord.",
      howTo: [
        "Count '1 e and, 2 e and'. Beats 1 and 3 are short-short-long on the muted root. On beats 2 and 4 the long note is the chord: lift the palm and strike both strings with a downstroke.",
        "Down-up, down on every beat. E, G, A and C, with the roots on the low E string: the open string, then frets 3, 5 and 8.",
        "Each bar ends on a chord and the next bar starts on the new root half a beat later. Cut the chord a little short and move on it, so the first short note of the new bar is not late.",
        CHANGES_NOTE,
      ],
      coach: "Every attack is timed, chord and muted note alike, and the evenness is reported. A chord's pitch is not checked; the mute and the strokes are yours to judge.",
      ...FREE,
      vary: aStringHigher(REVERSE_BAR_CHANGES, 2, {
        chords: "E5 | G5 | A5 | C5",
        onA: {
          purpose: "A, C, D and F under the reverse gallop, a bar each. The short notes are muted on the root, and on beats 2 and 4 the long note is the chord.",
          howTo: [
            "Count '1 e and, 2 e and'. Beats 1 and 3 are short-short-long on the muted root. On beats 2 and 4 the long note is the chord: lift the palm and strike both strings with a downstroke.",
            "Down-up, down on every beat. A, C, D and F, with the roots on the A string: the open string, then frets 3, 5 and 8.",
            "Each bar ends on a chord and the next bar starts on the new root half a beat later. Cut the chord a little short and move on it, so the first short note of the new bar is not late.",
            LOW_E_QUIET,
          ],
        },
      }),
      tab: REVERSE_BAR_CHANGES,
      position: 2,
      shifts: true,
      chords: "E5 | G5 | A5 | C5",
      ...CHORDS,
      pass: FAST,
      rungs: ladder(50, 140, 10),
      passAt: 100,
      selfCheck: [MUTE_CHECK],
      minutes: 6,
    },
    {
      id: "two-beat-changes",
      title: "Two beats a chord",
      purpose: "The chords now change twice a bar: E and G in bar 1, A and C in bar 2. Each chord gets one gallop, with the chord as its long note, and one reverse gallop on the root.",
      howTo: [
        "Say it first: '1, and a, 2 e and, 3, and a, 4 e and'. The chord is on beats 1 and 3, and every other note is the muted root.",
        "Down, down-up, then down-up, down. The last note before each change is an eighth note on the root: move on it.",
        "From C at fret 8 back to E is the longest move. E needs only the first finger, on fret 2 of the A string, so let go of the C shape early and drop to it.",
        CHANGES_NOTE,
      ],
      coach: "Every attack is timed, chord and muted note alike, and the evenness is reported. A chord's pitch is not checked; the mute and the strokes are yours to judge.",
      ...FREE,
      vary: aStringHigher(TWO_BEAT_CHANGES, 2, {
        chords: "E5 | A5",
        onA: {
          purpose: "The chords now change twice a bar: A and C in bar 1, D and F in bar 2. Each chord gets one gallop, with the chord as its long note, and one reverse gallop on the root.",
          howTo: [
            "Say it first: '1, and a, 2 e and, 3, and a, 4 e and'. The chord is on beats 1 and 3, and every other note is the muted root.",
            "Down, down-up, then down-up, down. The last note before each change is an eighth note on the root: move on it.",
            "From F at fret 8 back to A is the longest move. A needs only the first finger, on fret 2 of the D string, so let go of the F shape early and drop to it.",
            LOW_E_QUIET,
          ],
        },
      }),
      tab: TWO_BEAT_CHANGES,
      position: 2,
      shifts: true,
      chords: "E5 | A5",
      ...CHORDS,
      pass: FAST,
      rungs: ladder(50, 130, 10),
      passAt: 90,
      selfCheck: [MUTE_CHECK],
      minutes: 6,
    },
    {
      id: "band-changes",
      title: "Four chords with the band",
      purpose: "Four bars over a hard rock groove in E minor: E, G, A and C, a bar each. In the E, G and A bars the chord lands on beats 1 and 3, with a gallop after the first and a reverse gallop after the second. The C bar has its chord on beat 1 and again on beat 4, held for a beat.",
      howTo: [
        "Bars 1 to 3, on E, G and A: chord and two short notes, a gallop, chord and two short notes, a reverse gallop. Bar 4, on C: chord and two short notes, a gallop, a reverse gallop, and the C chord held on beat 4.",
        "The chord changes on beat 1 of every bar. Land your chord with the change, and keep every muted note on that chord's root.",
        "Back to bar 1: the held C chord is where the hand moves. Let it ring short; E needs only the first finger, on fret 2 of the A string.",
      ],
      coach: "Band on. Every attack is timed against it and the evenness is reported. A chord's pitch is not checked, and the mute and the strokes are yours to judge. Direct input or headphones make the timing fair.",
      ...FREE,
      tab: BAND_CHANGES,
      position: 2,
      shifts: true,
      chords: "E5 | G5 | A5 | C5",
      jam: { groove: "hardRock", key: "E minor" },
      ...CHORDS,
      pass: FAST,
      rungs: ladder(60, 140, 10),
      passAt: 100,
      selfCheck: [MUTE_CHECK],
      minutes: 7,
    },
  ],
};

// --- Advanced: a riff in two parts ------------------------------------------------

const P = "6:0m";
// Part one: a melody on the A and D strings over the muted open low E, three sixteenths, three and two.
const PEDAL_UP = `5:7f1 ${P} ${P} 5:9f3 ${P} ${P} 5:10f4 ${P}`;
const PEDAL_PART = [
  `/16 ${PEDAL_UP} 5:9f3 ${P} ${P} 5:7f1 ${P} ${P} 5:9f3 ${P}`,
  `${PEDAL_UP} 4:7f1 ${P} ${P} 4:9f3 ${P} ${P} 4:7f1 ${P}`,
  `${PEDAL_UP} 5:9f3 ${P} ${P} 5:7f1 ${P} ${P} 5:9f3 ${P}`,
  `5:10f4 ${P} ${P} 5:9f3 ${P} ${P} 5:7f1 ${P} 5:9f3 ${P} ${P} 5:7f1 ${repeat(P, 4)}`,
].join(" | ");
// Part two: the gallop on the open low E with a chord on beats 1 and 3.
// Its A chord is the open one of the Beginner Level's last Step: the fretted A would put a second finger on the melody's fret 7.
const half = (chord: string) => `${chordGallop(chord, P)} ${gallop(P)}`;
const GALLOP_PART = [`${half(E5)} ${half(E5)}`, `${half(G5)} ${half(A5_ON_A)}`, `${half(E5)} ${half(E5)}`, `${half(A5_ON_A)} ${half(G5)}`].join(" | ");
const TWO_PARTS = `${PEDAL_PART} | ${GALLOP_PART}`;

const GALLOP_PART_CHORDS = "E5 | G5 | E5 | A5";

/** Advanced, before the band and the minute: a second long riff, with a change of part. */
export const TWO_PART_RIFF: StepSpec = {
  id: "two-part-riff",
  title: "A riff in two parts",
  goal: "Play an eight-bar riff made of a pedal-tone part and a gallop-and-chord part, each part alone and then the two joined without a gap.",
  why: "A song puts riffs one after another: one part runs for four bars, another answers it, and the change has to arrive on the bar line. The two parts here ask different things. The pedal part is alternate-picked sixteenths with the hand at fret 7. The gallop part is down, down-up, with chords at the first frets. Neither is new. Holding one for four bars and then changing hand position and strokes in time is the work.",
  howTo: [
    "Learn each part by itself first. Part one is a pedal riff: a melody on the next two strings at frets 7, 9 and 10 over a muted open low string, strict down-up.",
    "Part two is the gallop on the same open string with three power chords near the nut: down, down-up, and the chord in place of the long note.",
    "At the join the fretting hand travels between fret 7 and the first frets. Both parts end on notes of the open string, and that is when the hand moves.",
    "The first version is on the low E string; other Takes play the same frets one string higher, over the open A string.",
  ],
  payoff: "An eight-bar riff whose two parts follow each other without a seam.",
  exercises: [
    {
      id: "pedal-part",
      title: "Part one: the pedal",
      purpose: "Four bars of sixteenths: a melody on the A and D strings, E, F sharp and G with A and B above them, over a muted open low E string. The groups are three sixteenths, three and two, twice a bar, until bar 4 runs out on the open string.",
      howTo: [
        "Strict down-up. A group of three is one melody note and two muted open E notes; a group of two is one of each. The melody rings and the open string is muted.",
        "First finger on fret 7, third on fret 9, little finger on fret 10. Bars 1 and 3 stay on the A string: frets 7, 9, 10, then 9, 7, 9. Bar 2 is frets 7, 9, 10 on the A string, then frets 7, 9, 7 on the D string.",
        "Where fret 7 comes on both strings, across the bar line into bar 3, lay the first finger flat over the A and D strings; do not hop it.",
        "Bar 4 comes down the A string, frets 10, 9, 7, then 9 and 7, and ends on four open E notes, a whole beat of them.",
        VARIANT_NOTE,
      ],
      coach: "After the take the evenness is reported and the notes are checked against the written ones. The mute and the strokes are yours to judge.",
      vary: aStringHigher(PEDAL_PART, 7, {
        scale: "naturalMinor",
        onA: {
          purpose: "Four bars of sixteenths: a melody on the D and G strings, A, B and C with D and E above them, over a muted open A string. The groups are three sixteenths, three and two, twice a bar, until bar 4 runs out on the open string.",
          howTo: [
            "Strict down-up. A group of three is one melody note and two muted open A notes; a group of two is one of each. The melody rings and the open string is muted.",
            "First finger on fret 7, third on fret 9, little finger on fret 10. Bars 1 and 3 stay on the D string: frets 7, 9, 10, then 9, 7, 9. Bar 2 is frets 7, 9, 10 on the D string, then frets 7, 9, 7 on the G string.",
            "Where fret 7 comes on both strings, across the bar line into bar 3, lay the first finger flat over the D and G strings; do not hop it.",
            "Bar 4 comes down the D string, frets 10, 9, 7, then 9 and 7, and ends on four open A notes, a whole beat of them.",
            LOW_E_UNDER,
          ],
        },
      }),
      tab: PEDAL_PART,
      position: 7,
      harmony: { scale: ["E", "naturalMinor"] },
      rungs: ladder(50, 130, 10),
      passAt: 85,
      grade: "timingNotes",
      pass: [...FAST, { metric: "noteIdentity", min: 0.85, overBars: 4 }],
      selfCheck: [MUTE_CHECK],
      minutes: 6,
    },
    {
      id: "gallop-part",
      title: "Part two: gallops and chords",
      purpose: "Four bars of gallops on the muted open low E string with a power chord on beats 1 and 3: E twice, G and A, E twice, A and G.",
      howTo: [
        "Each half bar is a chord, two short muted notes and a full gallop: '1, and a, 2, and a'. Down, down-up, with the chord in place of the long note.",
        "Bars 1 and 3 have the E chord on beats 1 and 3. Bar 2 has G, then A. Bar 4 has A, then G. The gallops stay on the open string, so the fretting hand moves while they play.",
        "E is the open low E string and fret 2 of the A string. G is frets 3 and 5 of the same two strings. A is the open A string and fret 2 of the D string, the E shape one string higher: begin its stroke on the A string.",
        VARIANT_NOTE,
      ],
      coach: "Every attack is timed, chord and gallop alike, and the evenness is reported. A chord's pitch is not checked; the mute and the strokes are yours to judge.",
      ...FREE,
      vary: aStringHigher(GALLOP_PART, 2, {
        chords: GALLOP_PART_CHORDS,
        onA: {
          purpose: "Four bars of gallops on the muted open A string with a power chord on beats 1 and 3: A twice, C and D, A twice, D and C.",
          howTo: [
            "Each half bar is a chord, two short muted notes and a full gallop: '1, and a, 2, and a'. Down, down-up, with the chord in place of the long note.",
            "Bars 1 and 3 have the A chord on beats 1 and 3. Bar 2 has C, then D. Bar 4 has D, then C. The gallops stay on the open string, so the fretting hand moves while they play.",
            "A is the open A string and fret 2 of the D string. C is frets 3 and 5 of the same two strings. D is the open D string and fret 2 of the G string, the A shape one string higher: begin its stroke on the D string.",
            LOW_E_UNDER,
          ],
        },
      }),
      tab: GALLOP_PART,
      position: 2,
      shifts: true,
      chords: GALLOP_PART_CHORDS,
      ...CHORDS,
      pass: FAST,
      rungs: ladder(50, 140, 10),
      passAt: 100,
      selfCheck: [MUTE_CHECK],
      minutes: 6,
    },
    {
      id: "two-parts-joined",
      title: "Both parts, eight bars",
      purpose: "The whole riff: four bars of the pedal part, four bars of the gallop part, and round again. Eight bars at one tempo, with the change of part on a bar line.",
      howTo: [
        "Bars 1 to 4 are part one, strict down-up, with the hand at fret 7. Bars 5 to 8 are part two, down, down-up, with the chords at frets 2 to 5.",
        "Into bar 5: bar 4 ends on open E notes. Move the hand down during them, so the first finger is over fret 2 of the A string for the E chord.",
        "Back to bar 1: bar 8 ends on a gallop on the open string, after the G chord. Move up during it, so the first finger is on fret 7 of the A string for the first note.",
        "The tempo is set by the pedal part. The gallop part will feel slow at it: keep it exactly that slow.",
        VARIANT_NOTE,
      ],
      coach: "Eight bars are timed without a break, every attack in both parts, and the evenness is reported. A chord's pitch is not checked; the mute and the strokes are yours to judge.",
      ...FREE,
      vary: aStringHigher(TWO_PARTS, 7, {
        onA: {
          howTo: [
            "Bars 1 to 4 are part one, strict down-up, with the hand at fret 7. Bars 5 to 8 are part two, down, down-up, with the chords at frets 2 to 5.",
            "Into bar 5: bar 4 ends on open A notes. Move the hand down during them, so the first finger is over fret 2 of the D string for the A chord.",
            "Back to bar 1: bar 8 ends on a gallop on the open string, after the C chord. Move up during it, so the first finger is on fret 7 of the D string for the first note.",
            "The tempo is set by the pedal part. The gallop part will feel slow at it: keep it exactly that slow.",
            LOW_E_UNDER,
          ],
        },
      }),
      tab: TWO_PARTS,
      position: 7,
      shifts: true,
      ...CHORDS,
      pass: [even(0.8, 8), heard(0.9, 8), extras(3)],
      rungs: ladder(50, 130, 10),
      passAt: 85,
      selfCheck: [MUTE_CHECK, "Did the change of part arrive on time both ways, into bar 5 and back to bar 1?"],
      minutes: 8,
    },
  ],
};
