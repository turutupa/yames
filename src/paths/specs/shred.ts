/**
 * Shred, a Mechanics Path: one Path of fifteen Steps that rotates the
 * techniques a shredder needs (alternate, economy, legato, sweeps, tapping),
 * from the teacher's outline in `plans/tasks/mvp/CONTENT.md`. A draft: no
 * teacher or guitarist has reviewed it, and nothing here has been played into
 * the app on a real guitar.
 *
 * Where the outline says "keep", the note data is copied from the Alternate
 * Picking and Sweep Picking specs, not imported from them: each Path owns its
 * notes, so a change to a deep-dive Path never moves this one under a player.
 */
import { definePath } from "../spec";
import type { ExerciseSpec, StepSpec, VariantParams } from "../spec";
import type { PassBar } from "../format";
import {
  acrossStrings,
  handAt,
  inPositions,
  ladder,
  linkedSweep,
  moveChart,
  oneStringClimb,
  repeat,
  shiftFrets,
  sweepChain,
  sweepLoop,
  threeNps,
  threeNpsCells,
} from "../templates";
import type { FretCell } from "../templates";

// ---------------------------------------------------------------------------
// Pass bars. Easy Steps ask for tighter evenness; finales ask for 16 bars.
// ---------------------------------------------------------------------------

const even = (min: number, overBars = 4): PassBar => ({ metric: "timingEvenness", min, overBars });
const heard = (min: number, overBars = 4): PassBar => ({ metric: "notesHeard", min, overBars });
const extras = (max: number): PassBar => ({ metric: "extraNotes", max, overBars: 4 });
const right = (min: number, overBars = 4): PassBar => ({ metric: "noteIdentity", min, overBars });
const accent = (min: number): PassBar => ({ metric: "accentPlacement", min, overBars: 4 });

/** One string, slow enough to be strict: evenness 0.9. */
/** Hammers from nowhere are soft like any hammer: an unheard one costs nothing, so the bar on the rest stays firm. */
const LEGATO_TAPPED = [even(0.8), heard(0.85), extras(3), right(0.85)];
const TIGHT = [even(0.9), heard(0.95), extras(2)];
const TIGHT_NOTES = [...TIGHT, right(0.9)];
/** Bursts, skips and odd groupings: the time is harder to hold, so 0.8. */
const LOOSE_NOTES = [even(0.8), heard(0.9), extras(3), right(0.85)];
/** Legato: only the picked notes can be missed, so the bar on them is firm. */
const LEGATO = [even(0.8), heard(0.9), extras(3), right(0.85)];
const ACCENTS = [even(0.85), heard(0.9), extras(3), accent(0.7)];
/** A finale: sixteen bars, held to the end. */
const FINALE_NOTES = [even(0.85, 16), heard(0.9, 16), extras(3), right(0.85)];

// ---------------------------------------------------------------------------
// Self-checks, said the same way everywhere they apply.
// ---------------------------------------------------------------------------

const VOLUME_CHECK = "In the legato bar, did the third note sound as loud as the first?";
const SAME_BAR_CHECK = "Did the legato bar keep the picked bar's rhythm, with no note rushing in early?";
const RING_CHECK =
  "Record a take and listen back. Does each note stop as the next one starts, or do they ring together like a strummed chord?";
const NOISE_CHECK = "Between takes, stop and listen: are the strings you are not playing silent?";
const SAFETY =
  "Stop at any pain in the hand, wrist or forearm. A tired forearm is one thing and pain is another; pain ends the set.";

// ---------------------------------------------------------------------------
// Keys and moves. A minor unless a variant moves it.
// ---------------------------------------------------------------------------

/** Semitones from A minor for the natural-minor licks. */
const KEY_SHIFT: Readonly<Record<string, number>> = { A: 0, B: 2, C: 3, D: 5, E: 7, G: -2 };

/** The same tab moved to other minor keys. Key doesn't change how hard it is. */
function inKeys(tab: string, keys: readonly string[], scale = "naturalMinor", chart?: string) {
  return {
    values: { key: keys },
    pooled: ["key"] as const,
    label: (p: VariantParams) => `${p.key} minor`,
    build: (p: VariantParams) => {
      const moved = shiftFrets(tab, KEY_SHIFT[p.key]);
      return {
        tab: moved,
        position: handAt(moved),
        ...(chart ? { chords: moveChart(chart, KEY_SHIFT[p.key]) } : {}),
        harmony: { scale: [p.key, scale] as [string, string] },
      };
    },
  };
}

const cellsTab = (cells: readonly FretCell[], suffix: (c: FretCell, i: number) => string = () => "") =>
  cells.map((c, i) => `${c.string}:${c.fret}${suffix(c, i)}`).join(" ");

/** Groups of `size` from `cells`, starting at each index in `starts`, walking forward or back. */
function groupsAt(cells: readonly FretCell[], size: number, starts: readonly number[], direction: 1 | -1): FretCell[] {
  return starts.flatMap((s) => Array.from({ length: size }, (_v, i) => cells[s + i * direction]));
}

/** Three notes per string in A minor from a note on `string` at fret 5 (or `fret`). */
const nps = (string: number, strings: number, fret = 5) =>
  threeNpsCells({ root: "A", scale: "naturalMinor", string, fret, strings });

/** Where each three-per-string start sits, by the string it starts on. */
const NPS_START: Readonly<Record<string, { string: number; fret: number }>> = {
  "from A on the low E": { string: 6, fret: 5 },
  "from D on the A string": { string: 5, fret: 5 },
  "from G on the D string": { string: 4, fret: 5 },
};
const NPS_STARTS = Object.keys(NPS_START);

// ---------------------------------------------------------------------------
// The eight-bar run over the band: bars 1-4 are Alternate Picking's
// sixteenth-note etude, kept; bars 5-8 are new, and use this Path's licks.
// Every bar starts on a tone of its chord.
// ---------------------------------------------------------------------------

const A_MINOR_LICK = "4:7 3:5 3:7 2:5 3:7 3:5 4:7 4:5";
const ETUDE = `/16
  ${A_MINOR_LICK} ${A_MINOR_LICK} |
  4:7 3:5 2:6 1:5 2:6 3:5 4:7 3:5 4:7 3:5 2:6 1:5 2:6 3:5 3:7 3:5 |
  4:5 3:5 2:5 2:8 2:5 3:5 4:5 3:5 4:5 3:5 2:5 1:8 2:5 3:5 3:7 3:5 |
  2:8 2:6 2:5 3:7 3:5 3:7 2:5 2:6 2:8 2:6 2:5 3:7 3:5 3:4 4:7 4:5 |
  2:5 2:8 1:5 1:8 2:5 2:8 1:5 1:8 1:7 1:5 2:8 2:6 2:5 3:7 3:5 3:4 |
  /8t ${repeat("1:13t 1:5p 1:8h", 4)} |
  /16t ${repeat("1:8 1:7p 1:5p 2:8 2:6p 2:5p", 4)} |
  /16
  2:8 2:6 2:5 3:7 3:5 3:4 4:7 4:5 3:4 3:5 3:7 3:5 3:4 3:5 4:7 4:5`;

// ---------------------------------------------------------------------------
// Sweeps: every Exercise is timing only, said in its title.
// ---------------------------------------------------------------------------

/**
 * Print an upstroke on a loop's last note. A loop's last note comes a full beat
 * after the last picked note before it (a hammer and a pull sit between).
 * `markSweep` used to look only within a beat and printed a downstroke there;
 * it now follows the line through the legato notes and gives the same upstroke,
 * so this is belt and braces, kept so the Shred pack's marks stay as written.
 */
function endsUp(tab: string): string {
  return tab.replace(/(\d:\d+)\s*$/, "$1u");
}

function sweep(args: Omit<ExerciseSpec, "pick" | "grade"> & { grade?: ExerciseSpec["grade"] }): ExerciseSpec {
  return { pick: "sweep", grade: "sweepTiming", selfCheck: [RING_CHECK, NOISE_CHECK], ...args };
}

const SWEEP_SHIFT: Readonly<Record<string, number>> = { A: 0, C: 3, D: 5, E: -5, G: -2 };

// ---------------------------------------------------------------------------
// The Steps.
// ---------------------------------------------------------------------------

const BEGINNER: StepSpec[] = [
  {
    id: "one-string",
    title: "One-string sixteenths",
    goal: "Four notes to every click on one string, even, at 110 to 120 BPM.",
    why: "Every fast line in this Path is this motion with something added: a crossing, a shape, a legato note. On one string there is nothing to hide behind, so an uneven stroke shows up at once, and it is the cheapest place to fix it. Sixteenths at 110 to 120 is where most players' picking either becomes a motion they trust or starts to lock up.",
    howTo: [
      "Count '1 e and a': down on 1 and 'and', up on 'e' and 'a'. Every Exercise in this Step is sixteenth notes, four to each click.",
      "Pick from the wrist, small. If the forearm locks, drop one rung: the locked arm is the usual speed wall, not the fingers.",
      "Keep down and up strokes the same loudness. Uneven pick depth is the most common reason they are not.",
    ],
    payoff: "Two bars of open-string sixteenths that sound like a machine, and a one-string lick at fret 12 that already sounds like shred.",
    exercises: [
      {
        id: "open-a",
        title: "Open A, sixteenths",
        purpose: "Take the fretting hand out of it, so the only question is whether every stroke lands on its sixteenth.",
        howTo: ["Sixteenth notes on the open A string, strictly down-up, right through the take. Rest the picking hand lightly on the bridge so the low E stays quiet."],
        coach: "This one is only about time. I'll say how even your best eight bars in a row were and whether any note went missing.",
        tab: `/16 ${repeat("5:0", 16)} | ${repeat("5:0", 16)}`,
        position: 0,
        rungs: ladder(60, 130, 5),
        passAt: 110,
        grade: "timing",
        pass: [even(0.9, 8), heard(0.95, 8), extras(2)],
        minutes: 5,
      },
      {
        id: "chromatic-on-g",
        title: "1-2-3-4 on one string",
        purpose: "All four fingers, one per fret, at sixteenths: the fingers have to land exactly when the pick does.",
        howTo: [
          "Sixteenths. Bar 1: four frets in a row with fingers 1, 2, 3, 4, four times (frets 5 to 8 on the G string to start). Bar 2: move the hand up one fret and come down with 4, 3, 2, 1 (frets 9 to 6).",
          "The variants move it to other strings and positions; the fingers do the same thing.",
          "Keep each finger down until the next one lands. If the notes come out as flams, the fingers are running ahead of the pick: make them lazier.",
        ],
        coach: "If the notes bunch up, drop one rung. I'll check the notes and the timing after the take.",
        vary: {
          values: { stringSet: ["3", "4", "2", "5"], position: ["fret 5", "fret 7", "fret 9", "fret 3"] },
          pooled: ["stringSet"],
          notPooled: { position: "The frets get wider toward the nut, so a low position is harder than a high one." },
          label: (p) => `String ${p.stringSet}, ${p.position}`,
          build: (p) => {
            const fret = Number(p.position.replace("fret ", ""));
            const base = `/16 ${repeat("3:5 3:6 3:7 3:8", 4)} | ${repeat("3:9 3:8 3:7 3:6", 4)}`;
            const tab = shiftFrets(base.replace(/\b3:/g, `${p.stringSet}:`), fret - 5);
            return { tab, position: fret, shifts: true };
          },
        },
        tab: `/16 ${repeat("3:5 3:6 3:7 3:8", 4)} | ${repeat("3:9 3:8 3:7 3:6", 4)}`,
        position: 5,
        shifts: true,
        rungs: ladder(60, 130, 5),
        passAt: 110,
        grade: "timingNotes",
        pass: TIGHT_NOTES,
        minutes: 6,
      },
      {
        id: "four-of-each",
        title: "Four of each, on the top string",
        purpose: "A melody where the fretting hand moves once a beat and the pick never stops: the rate in the right hand, the music in the left.",
        howTo: [
          "Sixteenths, four per note, on the top string: A, C, B, A, then G, A, B, C. Move the fretting hand exactly on the beat, not a hair before.",
          "This is tremolo picking in slow motion, and a good first thing to play on any day.",
        ],
        coach: "Four notes per pitch makes the time easy to judge, and I'll check the notes after the take.",
        tab: `/16 ${repeat("1:5", 4)} ${repeat("1:8", 4)} ${repeat("1:7", 4)} ${repeat("1:5", 4)} | ${repeat("1:3", 4)} ${repeat("1:5", 4)} ${repeat("1:7", 4)} ${repeat("1:8", 4)}`,
        position: 5,
        shifts: true,
        harmony: { scale: ["A", "naturalMinor"] },
        rungs: ladder(55, 120, 5),
        passAt: 100,
        grade: "timingNotes",
        pass: TIGHT_NOTES,
        minutes: 5,
      },
      {
        id: "twelve-thirteen-fifteen",
        title: "The fret-12 loop: 12-13-15-13",
        purpose: "A one-string loop high on the neck, the kind of figure a shredder repeats for a whole bar. Three fingers, one string, the pick never stops.",
        howTo: [
          "Sixteenths. First finger on the low fret, second finger one fret up, little finger two frets above that, then back to the second finger: 12, 13, 15, 13 on the top string. Repeat without a break; the 13 leads back into the 12.",
          "Leave the first finger down while the others play, so it is already there for the next loop.",
        ],
        coach: "Evenness first, then the notes. I'll check both after the take.",
        vary: {
          values: { stringSet: ["1", "2", "3", "4"] },
          pooled: ["stringSet"],
          label: (p) => `String ${p.stringSet}, ${p.stringSet === "1" || p.stringSet === "2" ? "fret 12" : "fret 9"}`,
          build: (p) => {
            const string = Number(p.stringSet);
            const fret = string <= 2 ? 12 : 9;
            const tab = `/16 ${repeat(`${string}:${fret} ${string}:${fret + 1} ${string}:${fret + 3} ${string}:${fret + 1}`, 4)}`;
            return { tab, position: fret };
          },
        },
        tab: `/16 ${repeat("1:12 1:13 1:15 1:13", 4)}`,
        position: 12,
        harmony: { scale: ["A", "naturalMinor"] },
        rungs: ladder(60, 140, 5),
        passAt: 120,
        grade: "timingNotes",
        pass: TIGHT_NOTES,
        minutes: 5,
      },
    ],
  },
  {
    id: "accents",
    title: "Accents and groupings",
    goal: "Put the accent where the music wants it, on a downstroke or an upstroke, in sextuplets and across the beat, without the time moving.",
    why: "Fast playing is heard in groups, not notes: a run of sextuplets sounds like shred only when the first of every six is stronger. Accents also prove the picking hand is under control rather than running on its own, and an accent on an upstroke is the honest test of that.",
    howTo: [
      "An accent is a little more depth and speed in one stroke. Don't squeeze, and keep the unaccented notes quiet on purpose: the contrast makes the accent.",
      "Sextuplets are six notes to the click, two groups of three: say 'one-trip-let-two-trip-let'. Sixteenths are four to the click.",
      "Use a clean or light-crunch tone. Compression and high gain flatten accents, for your ear and for the app.",
    ],
    payoff: "The same notes that sounded like a typewriter now have a pulse, and a six-note figure rolls against the beat the way it does on the records.",
    difficultyException:
      "Accents are a control problem and the sixteenth tempos drop to 85 to 90; the sextuplet Exercises pass at 75, which is about the note rate of Step 1. The note-rate metric only counts speed.",
    exercises: [
      {
        id: "sextuplet-accent",
        title: "8-7-5-7-8-7 in sextuplets, accent on the beat",
        purpose: "The classic six-note one-string figure, with the first of every six marked so you hear the beat inside the blur.",
        howTo: [
          "Sextuplets, six to the click. On the top string: frets 8, 7, 5, 7, 8, 7 with fingers 4, 3, 1, 3, 4, 3. On the other strings the shape is the same idea, one finger per fret. Accent the first note of each six.",
          "Six is even, so every group starts on a downstroke and the accent is always a downstroke here.",
        ],
        coach: "Accent checks are rough: I can only tell louder from not louder. Evenness and missed notes are firmer.",
        vary: {
          values: { stringSet: ["1", "2", "3", "5"] },
          pooled: ["stringSet"],
          label: (p) => `String ${p.stringSet}`,
          build: (p) => {
            const frets: Record<string, [number, number, number]> = { "1": [8, 7, 5], "2": [8, 6, 5], "3": [7, 5, 4], "5": [8, 7, 5] };
            const [a, b, c] = frets[p.stringSet];
            const s = p.stringSet;
            const tab = `/16t ${repeat(`${s}:${a}> ${s}:${b} ${s}:${c} ${s}:${b} ${s}:${a} ${s}:${b}`, 4)}`;
            return { tab, position: c };
          },
        },
        tab: `/16t ${repeat("1:8> 1:7 1:5 1:7 1:8 1:7", 4)}`,
        position: 5,
        harmony: { scale: ["A", "naturalMinor"] },
        rungs: ladder(50, 90, 5),
        passAt: 75,
        grade: "accents",
        pass: ACCENTS,
        minutes: 5,
      },
      {
        id: "three-against-four",
        title: "The same six as sixteenths: three against four",
        purpose: "The six notes again, now four to the click, with an accent every three notes. The accents walk across the beat and fall on upstrokes half the time.",
        howTo: [
          "Sixteenths. Frets 8, 7, 5, 7, 8, 7 on the top string, accents on the first and fourth note of each six: the 8 and the second 7. That is an accent every three sixteenths: it lands back on a click every three beats, and the whole figure comes round to beat 1 of a bar after three bars.",
          "Tap your foot on the click, not on the accents, and let the two disagree.",
        ],
        coach: "Your accents should fall against the click here, which makes it a good one to listen back to.",
        tab: `/16 ${repeat("1:8> 1:7 1:5 1:7> 1:8 1:7", 8)}`,
        position: 5,
        harmony: { scale: ["A", "naturalMinor"] },
        rungs: ladder(55, 100, 5),
        passAt: 90,
        grade: "accents",
        pass: ACCENTS,
        minutes: 6,
      },
      {
        id: "open-triplets",
        title: "Sixteenth triplets on open A, accent every third",
        purpose: "Six to the click on one open string, with the accent on every third note, so it lands on a downstroke, then an upstroke, then a downstroke.",
        howTo: [
          "Sextuplets (sixteenth triplets), six to the click, on the open A string. Accent notes 1 and 4 of each six: the first is a downstroke, the second an upstroke.",
          "If only the downstroke accents come out, dig the upstroke a little deeper rather than hitting the downstroke softer.",
        ],
        coach: "Accent checks are rough. If the upstroke accents disappear on the recording, that is the thing to work on.",
        tab: `/16t ${repeat("5:0> 5:0 5:0 5:0> 5:0 5:0", 4)}`,
        position: 0,
        rungs: ladder(50, 90, 5),
        passAt: 75,
        grade: "accents",
        pass: ACCENTS,
        minutes: 5,
      },
      {
        id: "walking-accent",
        title: "Walk the accent through the beat",
        purpose: "One note, four bars, and the accent moves from the first sixteenth to the last. Bars 2 and 4 put it on an upstroke.",
        howTo: ["Sixteenths on fret 7 of the G string. Bar 1 accents the first of each four, bar 2 the second, bar 3 the third, bar 4 the fourth. Keep the time dead still at each change."],
        coach: "Bars 2 and 4 are the test. The accent reading is rough, so trust your ear too.",
        tab: `/16 ${repeat("3:7> 3:7 3:7 3:7", 4)} | ${repeat("3:7 3:7> 3:7 3:7", 4)} | ${repeat("3:7 3:7 3:7> 3:7", 4)} | ${repeat("3:7 3:7 3:7 3:7>", 4)}`,
        position: 5,
        rungs: ladder(50, 100, 5),
        passAt: 85,
        grade: "accents",
        pass: ACCENTS,
        minutes: 6,
      },
    ],
  },
  {
    id: "crossing",
    title: "Crossing two strings",
    goal: "Change strings at sixteenths with no gap and no scrape, on both kinds of crossing.",
    why: "On one string the pick has nothing in its way; between two strings it has to get over one of them. There are only two kinds of crossing, and every line in the rest of this Path is built from them: outside, where the pick travels around the pair, and inside, where it is trapped between the strings and has to escape.",
    howTo: [
      "Outside: a downstroke on the lower-pitched string, then an upstroke on the higher one. Each stroke starts from outside the pair.",
      "Inside: an upstroke on the lower-pitched string, then a downstroke on the higher one. Each stroke starts between the two strings, so the pick must hop out of the gap.",
      "Much of this motion is a small tilt of the wrist. Try it slowly with no click first, then sixteenths with the click.",
    ],
    payoff: "A short A minor lick that used to trip every time now rolls, and you can name which crossing is the one that catches you.",
    exercises: [
      {
        id: "outside-pairs",
        title: "Outside pairs on G and B",
        purpose: "Moving pairs of notes, all outside crossings, so the fretting hand gets busier while the pick path never changes.",
        howTo: ["Sixteenths. Two of each pair, then change: in A minor, C and E, D and G, C and F, D and E. The strokes never change: down on the G string, up on the B string."],
        coach: "I can time these and check the notes. Which way the pick went is yours to keep honest, so the checklist asks.",
        vary: inKeys("/16 3:5 2:5 3:5 2:5 3:7 2:8 3:7 2:8 3:5 2:6 3:5 2:6 3:7 2:5 3:7 2:5", ["A", "C", "D", "E", "G"]),
        tab: "/16 3:5 2:5 3:5 2:5 3:7 2:8 3:7 2:8 3:5 2:6 3:5 2:6 3:7 2:5 3:7 2:5",
        position: 5,
        crossing: "outside",
        harmony: { scale: ["A", "naturalMinor"] },
        rungs: ladder(50, 110, 5),
        passAt: 100,
        grade: "timingNotes",
        selfCheck: ["Watch the pick for one pass, or film it: was every G-string note a downstroke and every B-string note an upstroke?"],
        minutes: 6,
      },
      {
        id: "inside-pairs",
        title: "Inside pairs on B and G",
        purpose: "The same four pairs, top note first, so every crossing is inside. Compare it honestly with the outside take.",
        howTo: ["Sixteenths. Down on the B string, up on the G string. If you hear a tiny gap at each change, that is the hop out of the strings: make it smaller."],
        coach: "Compare this take with the outside one. The gap between the two is what you are working on.",
        vary: inKeys("/16 2:5 3:5 2:5 3:5 2:8 3:7 2:8 3:7 2:6 3:5 2:6 3:5 2:5 3:7 2:5 3:7", ["A", "C", "D", "E", "G"]),
        tab: "/16 2:5 3:5 2:5 3:5 2:8 3:7 2:8 3:7 2:6 3:5 2:6 3:5 2:5 3:7 2:5 3:7",
        position: 5,
        crossing: "inside",
        harmony: { scale: ["A", "naturalMinor"] },
        rungs: ladder(50, 105, 5),
        passAt: 95,
        grade: "timingNotes",
        selfCheck: ["Watch the pick for one pass: was every B-string note a downstroke and every G-string note an upstroke?"],
        minutes: 6,
      },
      {
        id: "outside-lick",
        title: "The all-outside A minor lick",
        purpose: "Eight notes that sound like a real pentatonic lick and happen to contain only outside crossings. This is the Step's payoff.",
        howTo: [
          "Sixteenths, the lick twice a bar: A on the D string, C and D on the G string, E on the B string, back down D and C, then A and G on the D string.",
          "Start on a downstroke on the D string. Every string change works out as outside; keep it that way by never adding a stroke.",
        ],
        coach: "This is music now. Get it even, then take it up one rung at a time.",
        vary: inKeys(`/16 ${repeat(A_MINOR_LICK, 2)}`, ["A", "C", "D", "E", "G"], "minorPentatonic"),
        tab: `/16 ${repeat(A_MINOR_LICK, 2)}`,
        position: 5,
        crossing: "outside",
        harmony: { scale: ["A", "minorPentatonic"], cover: true },
        rungs: ladder(50, 110, 5),
        passAt: 100,
        grade: "timingNotes",
        selfCheck: ["Was the first note of every lick a downstroke on the D string?"],
        minutes: 6,
      },
    ],
  },
];

const INTERMEDIATE: StepSpec[] = [
  {
    id: "chromatic",
    title: "Petrucci chromatic and the spider",
    goal: "One finger per fret across all six strings, even at sixteenths, with the hand moving up the neck.",
    why: "Chromatic drills are not music, and that is why they work: there is no tune to carry you, so every weak finger and every awkward string change is exposed. Ten minutes of this a day is the classic way to make the fourth finger as useful as the first and to make string changes stop being events.",
    howTo: [
      "One finger per fret: first finger on the lowest fret of the four, little finger on the highest. Keep the fingers close to the strings, curved, tips down.",
      "Sixteenths throughout, four to the click.",
      "Thumb behind the neck, relaxed. If it squeezes, the little finger tires first.",
      SAFETY,
    ],
    payoff: "Your little finger keeps up, and a six-string crawl that used to stumble at the B string now sounds like one line.",
    difficultyException:
      "Four fingers across six strings, and the spider's permutations: the work is fretting-hand independence and stamina, which the note rate does not count.",
    exercises: [
      {
        id: "petrucci-climb",
        title: "1-2-3-4 across six strings, up a fret each pass",
        purpose: "Up all six strings at fret 5, move up a fret, come back down; up at fret 7, down at fret 8. The whole fretting hand works, and it shifts.",
        howTo: [
          "Sixteenths. Bar 1 and a half: 1-2-3-4 on each string from the low E to the top E, starting at fret 5. Then shift up one fret and play 4-3-2-1 on each string from the top E down.",
          "Shift during the last note of a pass, not after it. Six bars, then it starts again.",
        ],
        coach: "Long lines are where the time drifts. I'll report evenness over the whole take and the notes after it.",
        vary: {
          values: { position: ["fret 5", "fret 9", "fret 12", "fret 3"] },
          notPooled: { position: "The frets get wider toward the nut, so a low start is harder than a high one." },
          label: (p) => `Starting at ${p.position}`,
          build: (p) => {
            const fret = Number(p.position.replace("fret ", ""));
            return { tab: petrucci(fret), position: fret, shifts: true };
          },
        },
        tab: petrucci(5),
        position: 5,
        shifts: true,
        rungs: ladder(55, 110, 5),
        passAt: 100,
        grade: "timingNotes",
        pass: TIGHT_NOTES,
        minutes: 6,
      },
      {
        id: "spider",
        title: "The spider: 1-3 then 2-4 on a pair of strings",
        purpose: "Two fingers on one string while two work on the next, so the fingers move in pairs and never all at once. It is the best cure there is for a hand that collapses.",
        howTo: [
          "Sixteenths, a pair of strings to each beat. On the low E and A: finger 1 at fret 5 on the E, finger 3 at fret 7 on the A, then finger 2 at fret 6 on the E, finger 4 at fret 8 on the A.",
          "Bar 1 crawls up a string pair each beat (E-A, A-D, D-G, G-B); bar 2 moves the hand up a fret, goes on to B-E and crawls back (G-B, D-G, A-D). Bars 3 and 4 do the same a fret higher again, and then it starts over at the first fret.",
          "Lift each finger only when its partner on the other string has landed.",
        ],
        coach: "This is a diagnostic, so play it slowly enough to hear the weakest change. I'll check the timing and the notes.",
        vary: {
          values: { position: ["fret 5", "fret 7", "fret 9", "fret 3"] },
          notPooled: { position: "The frets get wider toward the nut, so a low position is harder than a high one." },
          label: (p) => `At ${p.position}`,
          build: (p) => {
            const fret = Number(p.position.replace("fret ", ""));
            return { tab: spider(fret), position: fret, shifts: true };
          },
        },
        tab: spider(5),
        position: 5,
        shifts: true,
        rungs: ladder(50, 100, 5),
        passAt: 90,
        grade: "timingNotes",
        minutes: 6,
      },
      {
        id: "one-three-two-four",
        title: "The 1-3-2-4 permutation",
        purpose: "The same four fingers in a crossed order, so no finger can lean on its neighbour. It is harder than it looks and it shows exactly which finger is weak.",
        howTo: [
          "Sixteenths. Up: frets 5, 7, 6, 8 (fingers 1, 3, 2, 4) on each string from the low E to the top. Then shift up a fret and come down with 4-2-3-1: frets 9, 7, 8, 6 on each string from the top E.",
          "Say the finger numbers out loud for the first few passes.",
        ],
        coach: "Stay on a rung that keeps it even. Fast and rough teaches the wrong thing here.",
        vary: {
          values: { position: ["fret 5", "fret 9", "fret 12", "fret 3"] },
          notPooled: { position: "The frets get wider toward the nut, so a low start is harder than a high one." },
          label: (p) => `Starting at ${p.position}`,
          build: (p) => {
            const fret = Number(p.position.replace("fret ", ""));
            return { tab: permutation(fret), position: fret, shifts: true };
          },
        },
        tab: permutation(5),
        position: 5,
        shifts: true,
        rungs: ladder(50, 100, 5),
        passAt: 90,
        grade: "timingNotes",
        minutes: 6,
      },
    ],
  },
  {
    id: "gilbert",
    title: "Gilbert pentatonic crossings",
    goal: "Loop a two-string pentatonic figure in sextuplets, then move it down the box, without the crossing ever catching.",
    why: "Two notes on each of two strings, looped, is the figure behind a great deal of fast rock soloing: it sounds wild and is only four frets. It is also the purest inside-crossing drill there is, because every string change in the six-note loop is inside. Learn it here and the pentatonic box stops being something you walk through and becomes something you can play fast.",
    howTo: [
      "The box is A minor pentatonic at fret 5: first finger on fret 5, third or little finger on the upper note of each string.",
      "Sextuplets: six to the click. The six-note loop fills one beat exactly, so the loop starts on every click.",
      "Keep the crossings small. The pick only has to clear one string; most of the miss comes from swinging too wide.",
    ],
    payoff: "A blurring pentatonic loop at a tempo you can play in a solo, and the same loop on any pair of strings in the box.",
    exercises: [
      {
        id: "six-loop",
        title: "The six-note loop on B and E",
        purpose: "E, G on the B string, A, C, A on the top string, G again: six notes, all inside crossings, looped.",
        howTo: [
          "Sextuplets. B string fret 5 then 8, top string 5, 8, 5, then B string 8, and round again from the B string's 5.",
          "Down, up, down, up, down, up: six is even, so every loop starts on a downstroke.",
        ],
        coach: "This is the corner that long runs trip on. Evenness tells the story, and I'll check the notes after.",
        vary: inKeys(`/16t ${repeat("2:5 2:8 1:5 1:8 1:5 2:8", 4)}`, ["A", "B", "C", "D", "E"], "minorPentatonic"),
        tab: `/16t ${repeat("2:5 2:8 1:5 1:8 1:5 2:8", 4)}`,
        position: 5,
        crossing: "inside",
        harmony: { scale: ["A", "minorPentatonic"] },
        rungs: ladder(50, 100, 5),
        passAt: 80,
        grade: "timingNotes",
        selfCheck: ["Watch the pick for one loop: did every loop start with a downstroke on the B string?"],
        minutes: 6,
      },
      {
        id: "down-the-box",
        title: "The same loop down the box",
        purpose: "One loop on each pair of strings: B and E, G and B, D and G, A and D, then back up. The pick path inside a loop is the same; the fretting hand has to find each pair in time.",
        howTo: [
          "Sextuplets, one loop to a beat. Bar 1 moves down a string pair each beat; bar 2 comes back up from A and D to B and E.",
          "Inside each loop every crossing is inside, as before. In bar 1 the move down to the next pair (an upstroke, then a downstroke on the string below) is an outside crossing; in bar 2 the move up to the next pair is inside. So this one has both.",
          "From G and B down, the lower string's upper note is fret 7, not 8 (G, D and A are 5-7; B and the top E are 5-8): the box's shape changes, the picking doesn't.",
        ],
        coach: "The change of string pair is the risk. If a note goes missing, look at the beat it changed on.",
        vary: inKeys(downTheBox(), ["A", "B", "C", "D", "E"], "minorPentatonic"),
        tab: downTheBox(),
        position: 5,
        crossing: "both",
        harmony: { scale: ["A", "minorPentatonic"], cover: true },
        rungs: ladder(50, 95, 5),
        passAt: 75,
        grade: "timingNotes",
        minutes: 6,
      },
      {
        id: "four-note",
        title: "Four notes: B5-B8-e5-e8 in sixteenths",
        purpose: "The four-note version, four to the click: one inside crossing and one outside in every loop, so it is the two kinds taking turns at speed.",
        howTo: [
          "Sixteenths. Two notes on the lower string of the pair, two on the higher (B 5 and 8, top E 5 and 8 to start), round again. Down, up, down, up.",
          "Going up, the crossing is inside (upstroke on the lower string, downstroke on the higher); coming round from the higher string's top note to the lower string's first it is outside.",
        ],
        coach: "Four to the click at 110 is a little slower than the six-note loop at 80. The turn back to the lower string is the place to listen to.",
        vary: {
          values: { stringSet: ["B and E", "G and B", "D and G", "A and D"] },
          pooled: ["stringSet"],
          label: (p) => `${p.stringSet} strings`,
          build: (p) => {
            const cells: Record<string, string> = {
              "B and E": "2:5 2:8 1:5 1:8",
              "G and B": "3:5 3:7 2:5 2:8",
              "D and G": "4:5 4:7 3:5 3:7",
              "A and D": "5:5 5:7 4:5 4:7",
            };
            return { tab: `/16 ${repeat(cells[p.stringSet], 4)}`, position: 5 };
          },
        },
        tab: `/16 ${repeat("2:5 2:8 1:5 1:8", 4)}`,
        position: 5,
        crossing: "both",
        harmony: { scale: ["A", "minorPentatonic"] },
        rungs: ladder(60, 120, 5),
        passAt: 110,
        grade: "timingNotes",
        minutes: 5,
      },
      {
        id: "mirror-loop",
        title: "The mirror: the loop coming down",
        purpose: "The six notes in reverse, from the top string's 8 down to the B string and back, and now every crossing is outside.",
        howTo: [
          "Sextuplets. Top string 8, 5, B string 8, 5, 8, top string 5, and round. Down, up, down, up, down, up.",
          "If this one is clean and the first loop is not, your inside crossing is the weaker one: spend the extra minutes there.",
        ],
        coach: "Compare this with the first loop. A big difference is worth knowing about.",
        vary: inKeys(`/16t ${repeat("1:8 1:5 2:8 2:5 2:8 1:5", 4)}`, ["A", "B", "C", "D", "E"], "minorPentatonic"),
        tab: `/16t ${repeat("1:8 1:5 2:8 2:5 2:8 1:5", 4)}`,
        position: 5,
        crossing: "outside",
        harmony: { scale: ["A", "minorPentatonic"] },
        rungs: ladder(50, 100, 5),
        passAt: 80,
        grade: "timingNotes",
        minutes: 5,
      },
    ],
  },
  {
    id: "three-per-string",
    title: "Three notes per string",
    goal: "Run A minor in three-note-per-string shapes at sixteenths, where the crossing changes type at every string.",
    why: "An odd number of notes per string flips the stroke at each change, so outside and inside crossings take turns. This is the shape of most fast scalar playing: a long scale with no position shift to manage, and the same fingering idea on every string.",
    howTo: [
      "Each string has three notes, fretted 1-2-4 or 1-3-4 depending on the gaps. Open the hand from the first finger; don't twist the wrist to reach.",
      "Sixteenths throughout, four to the click, so the string changes fall in different places in the beat. Count the beat, not the strings.",
      "Ascending, the changes go outside, inside, outside. Say which one is next until you stop needing to.",
    ],
    payoff: "A two-and-a-half-octave A minor run, and a six-note lick you will use for the rest of your life.",
    difficultyException:
      "The rate drops from the Gilbert loops' sextuplets to sixteenths because the lines get long: runs across three and six strings with a crossing that changes type at every string, which a per-note metric doesn't count.",
    exercises: [
      {
        id: "six-note-down",
        title: "The six-note lick, descending",
        purpose: "C, B, A on the top string, then G, F, E on the B string, twice, landing on D. A real lick, with both crossings inside while it loops.",
        howTo: [
          "Sixteenths: the six notes twice (three beats), then a quarter note on the G string's fret 7. Fingers 4, 3, 1 on the top string (8, 7, 5) and 4, 2, 1 on the B string (8, 6, 5).",
          "Starting on a downstroke, the change from the top string to the B string is inside both times. The landing note is a downstroke on the G string, an outside crossing.",
        ],
        coach: "Even sixteenths first. This one is worth owning at a moderate tempo before it gets fast.",
        vary: inKeys("/16 1:8 1:7 1:5 2:8 2:6 2:5 1:8 1:7 1:5 2:8 2:6 2:5 /4 3:7", ["A", "B", "C", "D", "E", "G"]),
        tab: "/16 1:8 1:7 1:5 2:8 2:6 2:5 1:8 1:7 1:5 2:8 2:6 2:5 /4 3:7",
        position: 5,
        crossing: "both",
        harmony: { scale: ["A", "naturalMinor"] },
        rungs: ladder(55, 115, 5),
        passAt: 100,
        grade: "timingNotes",
        minutes: 6,
      },
      {
        id: "six-note-up",
        title: "The six-note lick, ascending",
        purpose: "The mirror image, E, F, G then A, B, C, twice, landing on A: both crossings outside, so the two versions tell you which hop you own.",
        howTo: ["Sixteenths: the six notes twice, then a quarter note on the top string's fret 5. Starting on a downstroke, the pick stays outside the pair at each change."],
        coach: "Compare this with the descending take. A big difference is worth a note in your practice.",
        vary: inKeys("/16 2:5 2:6 2:8 1:5 1:7 1:8 2:5 2:6 2:8 1:5 1:7 1:8 /4 1:5", ["A", "B", "C", "D", "E", "G"]),
        tab: "/16 2:5 2:6 2:8 1:5 1:7 1:8 2:5 2:6 2:8 1:5 1:7 1:8 /4 1:5",
        position: 5,
        crossing: "outside",
        harmony: { scale: ["A", "naturalMinor"] },
        rungs: ladder(55, 115, 5),
        passAt: 100,
        grade: "timingNotes",
        minutes: 6,
      },
      {
        id: "three-strings",
        title: "Three strings, up and down",
        purpose: "Both kinds of crossing in one line, one straight after the other: nine notes up, seven back, one bar.",
        howTo: [
          "Sixteenths. From the start note, three notes on each of three strings going up, then back down without repeating the top note.",
          "Two frets then one (5, 7, 8): fingers 1, 3, 4. Two then two (5, 7, 9): fingers 1, 2, 4, so the stretch is between the first and second fingers and not between the third and little.",
          "Starting from G on the D string, the B string's notes are a fret higher (6, 8, 10): move the hand up a fret at that string change.",
        ],
        coach: "When it is even both ways, the whole neck is the same idea with more strings.",
        vary: {
          values: { stringSet: NPS_STARTS },
          pooled: ["stringSet"],
          label: (p) => `A minor ${p.stringSet}`,
          build: (p) => {
            const { string, fret } = NPS_START[p.stringSet];
            const tab = `/16 ${threeNps({ root: "A", scale: "naturalMinor", string, fret, strings: 3, sequence: "updown" })}`;
            return { tab, position: handAt(tab), shifts: true };
          },
        },
        tab: `/16 ${threeNps({ root: "A", scale: "naturalMinor", string: 6, fret: 5, strings: 3, sequence: "updown" })}`,
        position: 5,
        shifts: true,
        crossing: "both",
        harmony: { scale: ["A", "naturalMinor"], cover: true },
        rungs: ladder(55, 105, 5),
        passAt: 95,
        grade: "timingNotes",
        minutes: 6,
      },
      {
        id: "six-strings",
        title: "Two and a half octaves at fifth position",
        purpose: "The whole shape up and down in sixteenths, with the small hand shift where the top two strings move up a fret.",
        howTo: [
          "Sixteenths: eighteen notes up from the low E's fret 5, sixteen back down, and the A held to the end of bar 3.",
          "The hand moves up one fret when you reach the B string (6, 8, 10) and again for the top string (7, 8, 10), and back down the same way. Do each move during the string change, not after it.",
        ],
        coach: "Long lines are where the time drifts. Evenness across the whole take is the number.",
        tab: `/16 ${threeNps({ root: "A", scale: "naturalMinor", string: 6, fret: 5, strings: 6, sequence: "updown" })} 6:5 hold`,
        position: 5,
        shifts: true,
        crossing: "both",
        harmony: { scale: ["A", "naturalMinor"], cover: true },
        rungs: ladder(50, 100, 5),
        passAt: 90,
        grade: "timingNotes",
        minutes: 7,
      },
    ],
  },
  {
    id: "sequences",
    title: "Three-per-string sequences",
    goal: "Play A minor in groups of three, four and six, so the scale becomes phrases rather than a staircase.",
    why: "Nobody plays a scale straight up in a solo. Sequences are how a scale turns into lines: each group starts one note further on, and the ear hears the pattern rather than the notes. The group size is matched to the rhythm (threes as triplets, fours as sixteenths, sixes as sextuplets) so the group always starts on the beat.",
    howTo: [
      "Learn each sequence slowly by saying the first note of each group. If you lose the first note, you have lost the sequence.",
      "Each Exercise names its rhythm: triplets are three to the click, sixteenths four, sextuplets six.",
      "The fingering is the three-notes-per-string shape from the last Step. Don't change it to make a group easier.",
    ],
    payoff: "'A minor in fours' up and down, and a six-note sequence in sextuplets that sounds like a real run.",
    exercises: [
      {
        id: "threes",
        title: "Groups of three, as triplets",
        purpose: "Three notes to the click, each group one scale note higher, up three strings and onto a landing.",
        howTo: [
          "Eighth-note triplets, three to the click: seven groups climbing, then a quarter note on the next string's first note.",
          "Three is odd, so each group starts on the opposite stroke from the last. That is the point: the crossings keep changing.",
        ],
        coach: "A long run like this usually slips in the same place. The evenness after the take helps you find it.",
        vary: {
          values: { stringSet: NPS_STARTS },
          pooled: ["stringSet"],
          label: (p) => `A minor ${p.stringSet}`,
          build: (p) => {
            const { string, fret } = NPS_START[p.stringSet];
            const tab = threesTab(string, fret);
            return { tab, position: handAt(tab), shifts: true };
          },
        },
        tab: threesTab(6, 5),
        position: 5,
        shifts: true,
        harmony: { scale: ["A", "naturalMinor"] },
        rungs: ladder(60, 120, 5),
        passAt: 110,
        grade: "timingNotes",
        minutes: 6,
      },
      {
        id: "fours",
        title: "A minor in fours",
        purpose: "Sixteenths in groups of four, up three strings and back: this is what most fast scale lines are made of.",
        howTo: ["Sixteenths. Each group starts one scale note higher going up, and one lower coming down. The first note of each group is on the click."],
        coach: "The turn at the top is the place to listen to.",
        vary: {
          values: { stringSet: NPS_STARTS },
          pooled: ["stringSet"],
          label: (p) => `A minor ${p.stringSet}`,
          build: (p) => {
            const { string, fret } = NPS_START[p.stringSet];
            const args = { root: "A", scale: "naturalMinor" as const, string, fret, strings: 3 };
            const tab = `/16 ${threeNps({ ...args, sequence: "foursUp" })} ${threeNps({ ...args, sequence: "foursDown" })}`;
            return { tab, position: handAt(tab), shifts: true };
          },
        },
        tab: `/16 ${threeNps({ root: "A", scale: "naturalMinor", string: 6, fret: 5, strings: 3, sequence: "foursUp" })} ${threeNps({ root: "A", scale: "naturalMinor", string: 6, fret: 5, strings: 3, sequence: "foursDown" })}`,
        position: 5,
        shifts: true,
        loops: false,
        harmony: { scale: ["A", "naturalMinor"], cover: true },
        rungs: ladder(50, 100, 5),
        passAt: 90,
        grade: "timingNotes",
        minutes: 6,
      },
      {
        id: "sixes",
        title: "Groups of six, as sextuplets",
        purpose: "Six notes to the click across four strings: four groups climbing in bar 1, four falling in bar 2. The shred sound, at a tempo where it is clean.",
        howTo: [
          "Sextuplets, six to the click. Bar 1 starts each group one note higher; bar 2 starts each group one note lower, from a note above where bar 1 ended.",
          "Six is even, so every group starts on a downstroke. The string changes move around inside the beat.",
        ],
        coach: "This is fast enough that the onset timing on a real rig is the weakest part of the reading, so trust your ear on the recording too.",
        vary: {
          values: { stringSet: NPS_STARTS },
          pooled: ["stringSet"],
          label: (p) => `A minor ${p.stringSet}`,
          build: (p) => {
            const { string, fret } = NPS_START[p.stringSet];
            const tab = sixesTab(string, fret);
            return { tab, position: handAt(tab), shifts: true };
          },
        },
        tab: sixesTab(6, 5),
        position: 5,
        shifts: true,
        harmony: { scale: ["A", "naturalMinor"] },
        rungs: ladder(45, 85, 5),
        passAt: 80,
        grade: "timingNotes",
        minutes: 6,
      },
      {
        id: "fours-down",
        title: "Descending fours, onto a landing",
        purpose: "Fours coming down three strings, then a half note: the descending sequence on its own, which most players find harder than the climb.",
        howTo: [
          "Sixteenths: six groups of four, each starting one scale note lower, then a half note two scale steps below where the run ends.",
          "The landing is a downstroke after an even number of notes. Arrive on it exactly on beat 3.",
        ],
        coach: "Land on time and the run was fine. I'll check the notes after the take.",
        vary: {
          values: { stringSet: ["top three, down from D", "middle three, down from A", "low middle, down from F"] },
          pooled: ["stringSet"],
          label: (p) => `A minor, ${p.stringSet}`,
          build: (p) => {
            const tab = foursDownTab(p.stringSet);
            return { tab, position: FOURS_DOWN_AT[p.stringSet], shifts: true };
          },
        },
        tab: foursDownTab("top three, down from D"),
        position: 7,
        shifts: true,
        harmony: { scale: ["A", "naturalMinor"] },
        rungs: ladder(50, 95, 5),
        passAt: 85,
        grade: "timingNotes",
        minutes: 6,
      },
    ],
  },
  {
    id: "speed-bursts",
    title: "Speed bursts",
    goal: "Play short runs above your clean tempo and land on time, without tensing up for the whole bar.",
    why: "You can't practise speed by doing everything slowly and you can't do it by flailing. A burst is the honest middle: one beat of real speed, then a rest long enough that the hand lets go. Most players find a burst runs several rungs above what they can sustain, which tells them the wall is stamina or tension rather than how fast the fingers can go.",
    howTo: [
      "Rest between bursts. The rest is half the Exercise: let the hand go soft before the next one.",
      "Aim at the landing note, not at the run. If you land on time, the run was fine.",
      "Sixteenths in the bursts, sextuplets in the last one; the tempos here are well above the last Steps on purpose.",
    ],
    payoff: "You will hear yourself play a short run far faster than you thought you could, and it will be clean.",
    difficultyException:
      "The metric averages over the rests. Inside a burst the local rate is well above any earlier Step, which is the point.",
    exercises: [
      {
        id: "one-beat",
        title: "One beat on, one beat off",
        purpose: "The shortest honest burst: Step 1's fret-12 figure once at speed, then a quarter-note landing on the note it started from, twice a bar.",
        howTo: ["Sixteenths: the fret-12 figure from its top, 15, 13, 12, 13 on the top string (fingers 4, 2, 1, 2), then a quarter note on 12, the E. Everything relaxes during the quarter."],
        coach: "Landing on time counts more than the run. Timing and missed notes are what I have here.",
        vary: burstsOn((a, b, c) => `/16 ${c} ${b} ${a} ${b} /4 ${a} /16 ${c} ${b} ${a} ${b} /4 ${a}`),
        tab: burstTab(1, (a, b, c) => `/16 ${c} ${b} ${a} ${b} /4 ${a} /16 ${c} ${b} ${a} ${b} /4 ${a}`),
        position: 12,
        harmony: { scale: ["A", "naturalMinor"] },
        rungs: ladder(80, 160, 10),
        passAt: 130,
        grade: "timing",
        pass: [even(0.8), heard(0.9), extras(3)],
        selfCheck: ["Did the last note land with the click, and did the hand let go in the rest?"],
        minutes: 5,
      },
      {
        id: "two-beats",
        title: "Two beats on, two off",
        purpose: "Twice the length with the same rest, so you find out how much of the speed survives eight notes.",
        howTo: ["Sixteenths: the fret-12 figure twice (12, 13, 15, 13, 12, 13, 15, 13), then a half note on 12. The halfway point of the run is where the time usually moves."],
        coach: "If one beat was clean and two is not, that is a stamina question and not a speed one.",
        vary: burstsOn((a, b, c) => `/16 ${a} ${b} ${c} ${b} ${a} ${b} ${c} ${b} /2 ${a}`),
        tab: burstTab(1, (a, b, c) => `/16 ${a} ${b} ${c} ${b} ${a} ${b} ${c} ${b} /2 ${a}`),
        position: 12,
        harmony: { scale: ["A", "naturalMinor"] },
        rungs: ladder(80, 150, 10),
        passAt: 120,
        grade: "timing",
        pass: [even(0.8), heard(0.9), extras(3)],
        minutes: 5,
      },
      {
        id: "expanding",
        title: "Expanding bursts",
        purpose: "One beat, then two, three and four beats on: the classic way of walking a burst into a line.",
        howTo: ["Sixteenths on the fret-12 figure. The bar tells you how long to keep going: bar 1 one beat, bar 2 two, bar 3 three, each landing on 12; bar 4 has no rest at all, so the hand has to stay loose while moving."],
        coach: "Most people slip somewhere in the third bar. It helps to know which one is yours.",
        vary: burstsOn((a, b, c) => expanding(a, b, c)),
        tab: burstTab(1, expanding),
        position: 12,
        harmony: { scale: ["A", "naturalMinor"] },
        rungs: ladder(70, 130, 10),
        passAt: 110,
        grade: "timing",
        pass: [even(0.8), heard(0.9), extras(3)],
        minutes: 6,
      },
      {
        id: "six-note-burst",
        title: "The six-note burst, into a landing",
        purpose: "Your descending six-note lick at sextuplet speed, then a walk down to A: this is how a fast run actually gets used in a solo.",
        howTo: ["One beat of sextuplets from the top string (C, B, A, G, F, E), then D, C and A as quarter notes. Land exactly on beat 2."],
        coach: "Fast notes on a real rig are the hardest to time, so trust the landing and your own ear as much as the numbers.",
        vary: inKeys("/16t 1:8 1:7 1:5 2:8 2:6 2:5 /4 3:7 3:5 4:7", ["A", "B", "C", "D", "E", "G"]),
        tab: "/16t 1:8 1:7 1:5 2:8 2:6 2:5 /4 3:7 3:5 4:7",
        position: 5,
        harmony: { scale: ["A", "naturalMinor"] },
        rungs: ladder(50, 110, 5),
        passAt: 90,
        grade: "timingNotes",
        pass: LOOSE_NOTES,
        selfCheck: ["On a recording, can you still hear all six notes as six?"],
        minutes: 5,
      },
    ],
  },
  {
    id: "string-skipping",
    title: "String skipping",
    goal: "Keep strict alternate picking going when the line jumps over a string, in octaves, pentatonics and a triad.",
    why: "So far every crossing has been to a neighbour. A skip makes the pick aim: it has to travel over a string it must not touch and arrive on time. Skipping is also where a lot of the modern shred sound comes from, because wide intervals on adjacent beats sound like nothing a scale can do.",
    howTo: [
      "On a skip, let the pick travel in a small arc over the string in between. Do not lift the whole forearm.",
      "Mute the skipped string with the side of the picking hand and a spare fretting finger. Noise appears on skips before it appears anywhere else.",
      "Sixteenths throughout.",
    ],
    payoff: "Octaves climbing the neck, a pentatonic line that leaps instead of walking, and an A minor triad that sounds like a sweep but is picked.",
    exercises: [
      {
        id: "octaves",
        title: "Octaves across a skipped string",
        purpose: "Every pair is a skip and the same two fingers do all the fretting, so the aim is all that is left to practise.",
        howTo: [
          "Sixteenths, each octave twice. First finger on the lower string, third or little finger two strings up. Down on the low note, up on the high one: every crossing is outside.",
          "A small shift each beat, up the scale in bar 1 and back in bar 2.",
          "Muting is the technique here: the underside of the first finger damps the string between the octave notes, and the picking hand's palm damps the strings below.",
        ],
        coach: "If notes go missing here it is usually the skip or the shift. Slow down until neither is a surprise.",
        vary: {
          values: { stringSet: ["A and G", "low E and D", "D and B"] },
          pooled: ["stringSet"],
          label: (p) => `${p.stringSet} strings`,
          build: (p) => {
            const tab = octavesTab(p.stringSet);
            return { tab, position: handAt(tab), shifts: true };
          },
        },
        tab: octavesTab("A and G"),
        position: 7,
        shifts: true,
        crossing: "outside",
        harmony: { scale: ["A", "naturalMinor"] },
        rungs: ladder(50, 100, 5),
        passAt: 90,
        grade: "timingNotes",
        minutes: 5,
      },
      {
        id: "pentatonic-skip",
        title: "The pentatonic box, skipping",
        purpose: "Box 1 in pairs, every other pair a string further on: low E, D, A, G, D, B, G, E going up. It is the box you know, made to sound wide.",
        howTo: [
          "Sixteenths, two notes to a string. Bar 1 climbs: low E 5-8, D 5-7, A 5-7, G 5-7, D 7-5, B 5-8, G 7-5, top E 5-8. Bar 2 comes back down the same way.",
          "Each pair is down-up, so every string change is a downstroke after an upstroke: going up the strings that is an inside crossing, and on the skips an inside crossing over a string.",
          "Bar 2 comes down in pairs (top E 8-5, G 7-5, B 8-5, D 7-5, G 7-5, A 7-5, D 7-5) and ends low E 5-8, which leads back to the 5 at the start.",
        ],
        coach: "Skips are where noise starts. If extra notes show up in the report, the skipped string is the likely source.",
        vary: inKeys(pentSkipTab(), ["A", "C", "D", "E"], "minorPentatonic"),
        tab: pentSkipTab(),
        position: 5,
        harmony: { scale: ["A", "minorPentatonic"], cover: true },
        rungs: ladder(50, 100, 5),
        passAt: 90,
        grade: "timingNotes",
        pass: LOOSE_NOTES,
        minutes: 6,
      },
      {
        id: "skipped-triad",
        title: "A minor over a skipped string",
        purpose: "A, C on the D string, A, C on the B string, E on top, and back: an arpeggio with a skip in the middle, picked note by note.",
        howTo: [
          "Sixteenths, the eight notes twice a bar: D string 7 and 10, B string 10 and 13, top string 12, then B 13, B 10, D 10.",
          "First finger on the D string's 7, then let the hand sit at fret 10: little finger for 13, ring for 12.",
          "Every string change is an inside crossing. The two between the D and B strings also skip the G string, the hardest kind: the pick has to escape the strings and clear one.",
        ],
        coach: "I'll check the notes against the chord and the timing after the take.",
        vary: {
          values: { key: ["A", "G", "B", "C"] },
          pooled: ["key"],
          label: (p) => `${p.key} minor`,
          build: (p) => {
            const tab = shiftFrets(`/16 ${repeat("4:7 4:10 2:10 2:13 1:12 2:13 2:10 4:10", 2)}`, KEY_SHIFT[p.key]);
            return { tab, position: handAt(tab), shifts: true, harmony: { arpeggio: `${p.key}m` } };
          },
        },
        tab: `/16 ${repeat("4:7 4:10 2:10 2:13 1:12 2:13 2:10 4:10", 2)}`,
        position: 7,
        shifts: true,
        harmony: { arpeggio: "Am" },
        rungs: ladder(50, 95, 5),
        passAt: 85,
        grade: "timingNotes",
        pass: LOOSE_NOTES,
        minutes: 6,
      },
    ],
  },
  {
    id: "economy",
    title: "Economy picking",
    goal: "Alternate on a string, and let the pick carry straight through to the next string when it is already travelling that way.",
    why: "Strict alternate picking spends a stroke getting back over a string every time a three-note group changes string. Economy picking keeps going instead: the downstroke that ends one string falls through onto the next. Many shred players mix the two, and a five-note group is where economy picking shines, because the strokes come out the same on every repeat.",
    howTo: [
      "On one string, alternate. At a string change, if the next string is in the direction the pick is already moving, play it with the same stroke: one push, two strings.",
      "The strokes are printed above the tab. The app cannot tell a downstroke from an upstroke, so each Exercise has a checklist question about them.",
      "Don't let the push turn into a strum: the pick rests against the next string for an instant, then plays it, exactly in time.",
    ],
    payoff: "A three-string run that feels lighter than it did alternate-picked, and a five-note figure in quintuplets that rolls on its own.",
    difficultyException:
      "Economy picking saves motion, so the note rate holds or drops. The new demand is the stroke plan, which no note-rate metric counts.",
    exercises: [
      {
        id: "ascending-economy",
        title: "Three per string, up: down-up-down, then through",
        purpose: "Three strings up in A minor with the crossing downstroke carried through, one run a bar, from a different string each bar.",
        howTo: [
          "Sixteenths: nine notes up three strings, then rest for the remaining beat and three quarters. Strokes: down, up, down on each string, so each new string starts with a second downstroke that falls straight through from the last.",
          "Bar 1 starts on the G string's fret 5, bar 2 the D string's, bar 3 the A string's, bar 4 the low E's, so each bar starts a string lower.",
        ],
        coach: "I can check the notes and the timing. Whether the pick fell through or went round is on the checklist.",
        tab: economyUp(),
        position: 5,
        shifts: true,
        pick: "economy",
        harmony: { scale: ["A", "naturalMinor"] },
        rungs: ladder(60, 120, 5),
        passAt: 110,
        grade: "timingNotes",
        selfCheck: ["Watch the pick for one bar, or film it: did each new string start with a downstroke that carried on from the last?"],
        minutes: 6,
      },
      {
        id: "quintuplet-group",
        title: "A five-note group in quintuplets",
        purpose: "E, F, G on the B string, A, C on the top string: five notes to the click. Economy going up, so every group starts on a downstroke, which is exactly why players use a five-note group.",
        howTo: [
          "Quintuplets: five notes to the click. Count 'one-two-three-four-five' evenly against the beat; it should feel slightly lopsided at first.",
          "B string 5, 6, 8 (fingers 1, 2, 4), top string 5, 8 (fingers 1, 4). Strokes: down, up, down, then down again straight through to the top string, up. The return to the B string is a downstroke after that upstroke: an outside crossing, so the next group starts down again.",
        ],
        coach: "Quintuplets are a feel thing, so the evenness bar here is a little looser. I'll check the notes after the take.",
        vary: inKeys(`/16q ${repeat("2:5d 2:6 2:8 1:5 1:8", 4)}`, ["A", "B", "C", "D", "E", "G"]),
        tab: `/16q ${repeat("2:5d 2:6 2:8 1:5 1:8", 4)}`,
        position: 5,
        pick: "economy",
        harmony: { scale: ["A", "naturalMinor"] },
        rungs: ladder(45, 85, 5),
        passAt: 80,
        grade: "timingNotes",
        pass: LOOSE_NOTES,
        selfCheck: ["Did every group of five start on a downstroke on the B string, with the push carrying straight through to the top string?"],
        minutes: 6,
      },
      {
        id: "descending-economy",
        title: "Three per string, down: up-down-up, then through",
        purpose: "The mirror: three strings down, starting on an upstroke, so the upstroke that ends each string falls through to the string below.",
        howTo: [
          "Sixteenths: nine notes down three strings, then rest. Strokes: up, down, up on each string; each new string starts with a second upstroke.",
          "Bar 1 comes down from the D string's fret 9 to the low E, bar 2 from the G string to the A, bar 3 from the B to the D, bar 4 from the top string to the G.",
        ],
        coach: "Most players find this direction stickier. I'll check the notes and timing; the strokes are yours to check.",
        tab: economyDown(),
        position: 6,
        shifts: true,
        pick: "economy",
        harmony: { scale: ["A", "naturalMinor"] },
        rungs: ladder(60, 115, 5),
        passAt: 100,
        grade: "timingNotes",
        selfCheck: ["Watch the pick for one bar: did each new string start with an upstroke carried on from the last?"],
        minutes: 6,
      },
      {
        id: "picked-arpeggios",
        title: "Picked arpeggios: Am, F, C, G",
        purpose: "Four-string arpeggios with strict alternate strokes, one chord a bar, for contrast: here every string change is picked, so you feel what economy saves and what it costs.",
        howTo: [
          "Eighth-note triplets, three to the click. Each bar is one chord, up and down twice. Am to F moves one note. Stay at fifth position.",
          "These are alternate-picked, not swept: every stroke alternates even though the notes run across strings.",
        ],
        coach: "I'll check the notes against the chords after the take. Whether it rings like a chord or sounds separated is yours to judge.",
        vary: inKeys(`/8t ${repeat("4:7 3:5 2:5 1:5 2:5 3:5", 2)} | ${repeat("4:7 3:5 2:6 1:5 2:6 3:5", 2)} | ${repeat("4:5 3:5 2:5 1:8 2:5 3:5", 2)} | ${repeat("4:5 3:7 2:8 1:7 2:8 3:7", 2)}`, ["A", "C", "D", "G"], "naturalMinor", "Am | F | C | G"),
        tab: `/8t ${repeat("4:7 3:5 2:5 1:5 2:5 3:5", 2)} | ${repeat("4:7 3:5 2:6 1:5 2:6 3:5", 2)} | ${repeat("4:5 3:5 2:5 1:8 2:5 3:5", 2)} | ${repeat("4:5 3:7 2:8 1:7 2:8 3:7", 2)}`,
        position: 5,
        crossing: "both",
        chords: "Am | F | C | G",
        harmony: { chordTones: true },
        rungs: ladder(50, 110, 5),
        passAt: 100,
        grade: "timingNotes",
        minutes: 6,
      },
    ],
  },
];

const ADVANCED: StepSpec[] = [
  {
    id: "legato-one",
    title: "Legato I: trills and pulls",
    goal: "Hammer-ons and pull-offs as loud and as even as picked notes, tied to a picked note on the beat.",
    why: "Legato is the other half of shred: the fretting hand plays most of the notes and the pick only marks the time. It sounds smooth only when the hammered notes are as strong as the picked ones, which is a strength and accuracy problem for the fretting hand. Every legato bar here comes after a picked bar of the same notes, so the picked bar sets the sound and the rhythm the legato bar has to match.",
    howTo: [
      "Hammer from a little height with the fingertip, and land exactly on the beat's subdivision. Pull off slightly sideways, toward the floor, so the string is plucked and not just released.",
      "Keep the picked notes on the beat. They are what the timing is measured on most firmly.",
      "Mute the strings you are not playing with the picking hand: legato rings the open strings more than picking does.",
    ],
    payoff: "A trill that sounds like one note shimmering, and a pentatonic waterfall of pull-offs in sextuplets.",
    exercises: [
      {
        id: "trill",
        title: "Trill: picked, then hammered",
        purpose: "Two notes a tone apart, sixteenths: one bar picked, one bar with only the first note of each beat picked and the rest hammered and pulled. Sixteen bars, for stamina in the fretting hand.",
        howTo: [
          "Sixteenths. Bar 1: alternate-pick the two notes for the whole bar (G string 5 and 7 to start; the variants move it). Bar 2: pick the lower note on each beat with an accent, then hammer the upper, pull to the lower, hammer the upper.",
          "First finger on the lower note, third finger a tone up (second finger where the variant is a semitone). The first finger stays down for the whole trill; only the upper finger moves.",
        ],
        coach: "Hammers and pulls I can't hear cost nothing here, so the picked notes carry the timing. Listen to the legato bar for volume.",
        vary: {
          values: { stringSet: ["G 5-7", "B 5-6", "top E 8-10", "D 7-9", "A 5-7"] },
          pooled: ["stringSet"],
          label: (p) => `${p.stringSet}`,
          build: (p) => {
            const [name, frets] = p.stringSet.split(/ (?=\d)/);
            const string = { G: 3, B: 2, "top E": 1, D: 4, A: 5 }[name] ?? 3;
            const [lo, hi] = frets.split("-").map(Number);
            return { tab: trillTab(string, lo, hi), position: lo };
          },
        },
        tab: trillTab(3, 5, 7),
        position: 5,
        harmony: { scale: ["A", "naturalMinor"] },
        rungs: ladder(60, 110, 5),
        passAt: 100,
        grade: "timingNotes",
        pass: [even(0.8, 16), heard(0.9, 16), extras(3), right(0.85)],
        selfCheck: [VOLUME_CHECK, SAME_BAR_CHECK],
        minutes: 6,
      },
      {
        id: "five-seven-eight",
        title: "5-7-8-7 on the top string, one pick a beat",
        purpose: "A, B, C, B: three fingers, one string. One bar picked, then one bar where only the first note of each beat is picked and the other three are hammered and pulled.",
        howTo: [
          "Sixteenths. Bar 1: alternate-pick top string 5, 7, 8, 7 four times. Bar 2: pick 5 on each beat, hammer 7, hammer 8, pull to 7, and pick 5 again on the next beat.",
          "Keep the middle finger down on its note when you hammer the top one, so the pull back has somewhere to land. Only the top finger moves.",
        ],
        coach: "The picked notes on the beat are the anchor I time against most firmly. The volume of the legato notes is for your ear.",
        vary: {
          values: { stringSet: ["top E 5-7-8", "B 5-6-8", "G 4-5-7", "D 5-7-9"] },
          pooled: ["stringSet"],
          label: (p) => p.stringSet,
          build: (p) => {
            const [name, frets] = p.stringSet.split(/ (?=\d)/);
            const string = { "top E": 1, B: 2, G: 3, D: 4 }[name] ?? 1;
            const [a, b, c] = frets.split("-").map(Number);
            return { tab: rollTab(string, a, b, c), position: a };
          },
        },
        tab: rollTab(1, 5, 7, 8),
        position: 5,
        harmony: { scale: ["A", "naturalMinor"] },
        rungs: ladder(60, 110, 5),
        passAt: 100,
        grade: "timingNotes",
        pass: LEGATO,
        selfCheck: [VOLUME_CHECK, SAME_BAR_CHECK],
        minutes: 6,
      },
      {
        id: "pentatonic-pulls",
        title: "Pentatonic pull-offs in sextuplets",
        purpose: "Down the box two strings at a time, a pull-off on every string: e 8 to 5, B 8 to 5, G 7 to 5. Bar 1 is picked, bar 2 picks only the upper note on each string.",
        howTo: [
          "Sextuplets, six to the click. Beats 1 and 2: top E, B and G strings; beats 3 and 4: B, G and D. Bar 1 picks every note. Bar 2 picks the upper note and pulls off to fret 5 on each string.",
          "In bar 2 the picked notes alternate down, up, down across the strings.",
        ],
        coach: "I'll check the notes where they are far enough apart to be sure of, and the timing. A pull-off I can't hear costs nothing.",
        vary: inKeys(pentPullsTab(), ["A", "C", "D", "E"], "minorPentatonic"),
        tab: pentPullsTab(),
        position: 5,
        harmony: { scale: ["A", "minorPentatonic"] },
        rungs: ladder(50, 90, 5),
        passAt: 85,
        grade: "timingNotes",
        pass: LEGATO,
        selfCheck: [VOLUME_CHECK, SAME_BAR_CHECK],
        minutes: 6,
      },
    ],
  },
  {
    id: "legato-two",
    title: "Legato II: three-per-string runs",
    goal: "Run three-note-per-string scales with one pick a string or less, hammering from nowhere going up and pulling off coming down.",
    why: "Three notes per string is where legato becomes a way to play scales fast with almost no picking. Going up, the first note of each new string has nothing to hammer from, so the finger hammers onto it from the air: the hammer-on from nowhere, and the skill that makes or breaks a legato run. Coming down, each string's first note is picked and the rest pulled.",
    howTo: [
      "Hammer-on from nowhere: the finger comes down hard and fast on the new string with no pick. The tab marks it h with no note before it on that string. It has to be loud, because there is no pick to help.",
      "Sextuplets: six to the click, two strings to each beat.",
      "Each Exercise is a picked bar, then the same notes legato. Match the legato bar to the picked one: same rhythm, same volume.",
    ],
    payoff: "Four strings of A minor at sextuplet speed with one picked note, and a lick you can play either way at will.",
    difficultyException:
      "Legato is a fretting-hand strength problem: the picking drops to one note a string or less, so the note rate falls while the hammers from nowhere, which no metric counts, are the new demand.",
    exercises: [
      {
        id: "hammer-ascent",
        title: "Up with hammers, from nowhere",
        purpose: "Twelve notes up four strings, held at the top. Bar 1 picked; bar 2 picks the first note only, then hammers everything, the first note of each string from nowhere.",
        howTo: [
          "Sextuplets. Bar 1: alternate-pick the twelve notes from the low E's fret 5 up to the G string's fret 9 and hold the last one to the bar line. Bar 2: pick the first note, hammer the rest; on the A, D and G strings the first note is a hammer-on from nowhere (an h with no note before it on that string).",
          "Fingers 1-3-4 on the low E (5, 7, 8) and the A (5, 7, 8); 1-2-4 on the D and G (5, 7, 9), so each hammer to the little finger comes from the second finger with the stretch in front of it.",
        ],
        coach: "A hammer-on from nowhere is graded like any hammer-on: one too quiet for me to catch costs nothing, so your ear decides whether it spoke. Make them loud.",
        vary: {
          values: { key: ["A", "B", "C", "D", "E"] },
          pooled: ["key"],
          label: (p) => `${p.key} minor`,
          build: (p) => {
            const tab = shiftFrets(hammerAscent(), KEY_SHIFT[p.key]);
            return { tab, position: handAt(tab), harmony: { scale: [p.key, "naturalMinor"] } };
          },
        },
        tab: hammerAscent(),
        position: 5,
        harmony: { scale: ["A", "naturalMinor"] },
        rungs: ladder(55, 95, 5),
        passAt: 90,
        grade: "timingNotes",
        pass: LEGATO_TAPPED,
        selfCheck: [VOLUME_CHECK, "Were the hammer-ons from nowhere as loud as the picked first note?"],
        minutes: 6,
      },
      {
        id: "pull-descent",
        title: "Down with pull-offs",
        purpose: "The same twelve notes coming down. Bar 1 picked; bar 2 picks the first note on each string and pulls off the other two.",
        howTo: [
          "Sextuplets. Bar 1: alternate-pick from the G string's fret 9 down to the low E's fret 5 and hold it. Bar 2: pick 9 on the G string, pull to 7 and 5; pick 9 on the D, pull to 7 and 5; and so on down.",
          "Have every finger of a string down before you pick its top note: you can only pull off to a note that is already fretted.",
        ],
        coach: "The picked note on each string is the anchor. Pull-offs I can't hear cost nothing, so judge their volume by ear.",
        vary: {
          values: { key: ["A", "B", "C", "D", "E"] },
          pooled: ["key"],
          label: (p) => `${p.key} minor`,
          build: (p) => {
            const tab = shiftFrets(pullDescent(), KEY_SHIFT[p.key]);
            return { tab, position: handAt(tab), harmony: { scale: [p.key, "naturalMinor"] } };
          },
        },
        tab: pullDescent(),
        position: 5,
        harmony: { scale: ["A", "naturalMinor"] },
        rungs: ladder(55, 95, 5),
        passAt: 90,
        grade: "timingNotes",
        pass: LEGATO,
        selfCheck: [VOLUME_CHECK, SAME_BAR_CHECK],
        minutes: 6,
      },
      {
        id: "picked-then-legato",
        title: "A picked bar, then a legato bar",
        purpose: "The six-note lick (C, B, A, G, F, E) in sextuplets: four times picked, then four times with only the top note of each string picked. Same notes, two techniques, side by side.",
        howTo: [
          "Sextuplets. Bar 1: alternate-pick the lick four times. Bar 2: pick the top string's 8, pull to 7 and 5; pick the B string's 8, pull to 6 and 5.",
          "Listen for the change at the bar line. If the legato bar is quieter or rushes, slow down until it doesn't.",
        ],
        coach: "The picked bar is the one I can check most closely. The legato bar's volume is yours to judge against it.",
        vary: inKeys(`/16t ${repeat("1:8 1:7 1:5 2:8 2:6 2:5", 4)} | ${repeat("1:8 1:7p 1:5p 2:8 2:6p 2:5p", 4)}`, ["A", "B", "C", "D", "E", "G"]),
        tab: `/16t ${repeat("1:8 1:7 1:5 2:8 2:6 2:5", 4)} | ${repeat("1:8 1:7p 1:5p 2:8 2:6p 2:5p", 4)}`,
        position: 5,
        harmony: { scale: ["A", "naturalMinor"] },
        rungs: ladder(50, 95, 5),
        passAt: 90,
        grade: "timingNotes",
        pass: LEGATO,
        selfCheck: [VOLUME_CHECK, SAME_BAR_CHECK],
        minutes: 6,
      },
    ],
  },
  {
    id: "sweep-basics",
    title: "Sweep basics (timing only)",
    goal: "One continuous push of the pick through two and three strings, separate notes, nothing ringing, and a turn at the top.",
    why: "A sweep is one motion that plays several notes, which is why it is not alternate picking done faster. The smallest sweep, two strings, contains the whole technique and the whole problem: if the first note keeps ringing, you get a chord. The app grades these on timing only: swept notes ring into each other, so right notes mostly read 'not checked', and nothing here promises them.",
    howTo: [
      "One push from the arm, the wrist quiet. The pick comes to rest on the next string between notes, then falls through it.",
      "Fretting hand: as soon as the next note sounds, release the last one without leaving the string. That is the mute that does most of the work.",
      "Eighth-note triplets throughout, three to the click.",
    ],
    payoff: "A three-string A minor arpeggio that comes out of one stroke, turns at the top without a seam, and a two-string lick you can drop into a solo.",
    difficultyException:
      "Sweeps restart the tempo low: they are a new motion, graded on slow rungs only, and the note-rate metric doesn't count the mute.",
    exercises: [
      sweep({
        id: "two-string-rolls",
        title: "Two-string rolls (timing only)",
        purpose: "Down through two strings at the same fret, rest, then up through them: the push, and the fingertip roll that keeps two notes from ringing.",
        howTo: [
          "Eighth-note triplets: two notes down, a rest, two notes up, a rest. One finger covers both strings and rolls so only the sounding note is pressed.",
          "Down is one push through both strings; up is one pull back through them.",
        ],
        coach: "Timing only: I can time the notes and say if one went missing or rang on as an extra. The roll is for your ear.",
        vary: {
          values: { stringSet: ["B and E at fret 5", "G and B at fret 5"] },
          pooled: ["stringSet"],
          label: (p) => p.stringSet,
          build: (p) => {
            const [lo, hi] = p.stringSet.startsWith("B") ? [2, 1] : [3, 2];
            return { tab: `/8t ${repeat(`${lo}:5 ${hi}:5 r ${hi}:5 ${lo}:5 r`, 2)}`, position: 5 };
          },
        },
        tab: `/8t ${repeat("2:5 1:5 r 1:5 2:5 r", 2)}`,
        position: 5,
        harmony: { arpeggio: "Am", cover: false },
        rungs: ladder(50, 110, 5),
        passAt: 90,
        minutes: 5,
      }),
      sweep({
        id: "three-both-ways",
        title: "Am on three strings, both ways (timing only)",
        purpose: "Up the A minor triad at fret 12 and back, with the top note as the only turn: the shape of a real sweep, slowly.",
        howTo: [
          "Eighth-note triplets: G string 14, B 13, top E 12, B 13, G 14, rest. Ring finger, middle, first.",
          "The stroke changes once, right after the top note. Keep that change as small as you can.",
        ],
        coach: "Timing only: right notes on a sweep mostly can't be checked, so I'm not claiming them. Evenness and missed notes I can give you.",
        tab: `/8t ${repeat("3:14 2:13 1:12 2:13 3:14 r", 2)}`,
        position: 12,
        harmony: { arpeggio: "Am", cover: true },
        rungs: ladder(50, 110, 5),
        passAt: 90,
        minutes: 5,
      }),
      sweep({
        id: "turnaround",
        title: "The turnaround at fret 8 (timing only)",
        purpose: "The whole loop: up three strings, a hammer to the top note and a pull back, down, and round with no extra stroke.",
        howTo: [
          "Eighth-note triplets, two loops a bar. On the Am shape: G string 9, B 10, top E 8, hammer to 12, pull to 8, B 10, and round. First finger on 8, second on 9, third on 10, little finger hammering 12. The other keys are the same shape further up the neck.",
          "After the top string's push the next note is a hammer, so the pick has nothing to do: use that moment to turn it round.",
        ],
        coach: "Timing only. A quiet hammer or pull doesn't count against you, so don't dig in to please me.",
        vary: {
          values: { key: ["A", "D", "E"] },
          pooled: ["key"],
          label: (p) => `${p.key} minor`,
          build: (p) => {
            const near: Record<string, number> = { A: 9, D: 14, E: 16 };
            const loop = sweepLoop({ chord: `${p.key}m`, strings: [3, 2, 1], near: near[p.key] });
            const tab = endsUp(`/8t ${repeat(loop, 2)}`);
            return { tab, position: handAt(tab), harmony: { arpeggio: `${p.key}m` } };
          },
        },
        tab: endsUp(`/8t ${repeat(sweepLoop({ chord: "Am", strings: [3, 2, 1], near: 9 }), 2)}`),
        position: 8,
        harmony: { arpeggio: "Am" },
        rungs: ladder(50, 110, 5),
        passAt: 90,
        minutes: 6,
      }),
      sweep({
        id: "two-string-lick",
        title: "A two-string lick you can use (timing only)",
        purpose: "Two-string sweeps with a hammer and a pull, ending on D: the Step's audible payoff, and a phrase that works in a solo.",
        howTo: [
          "Eighth-note triplets. Down through B and E at fret 5, hammer to 8, pull back to 5, then up through the B string's 8, pull to 5, and land on the G string's 7.",
          "Only the unmarked notes are picked. The hammer and pulls give you notes for free.",
        ],
        coach: "Timing only. A hammer or pull I can't hear costs nothing.",
        tab: "/8t 2:5 1:5 1:8h 1:5p 2:8 2:5p /4 3:7 r",
        position: 5,
        harmony: { scale: ["A", "minorPentatonic"] },
        rungs: ladder(50, 115, 5),
        passAt: 95,
        minutes: 5,
      }),
    ],
  },
  {
    id: "five-string-sweeps",
    title: "Five-string sweeps and links (timing only)",
    goal: "The classic five-string A minor sweep from fret 12, the link from one shape into the next, and Am, F, C, G one pass a chord.",
    why: "Five strings is the big sweep, the sound people mean by the word. It is only worth having if it connects: a progression doesn't wait while you find the next shape, so the link from one arpeggio into the next is practised as its own skill. As before, these are graded on timing only.",
    howTo: [
      "Mute everything. With five strings moving there is more to keep silent than there are fingers: palm on the low strings, fretting fingers across the high ones.",
      "A link is one small move of the fretting hand on the top or bottom string: a hammer, a pull or a slide into the next chord's nearest note. The pick does nothing at that moment.",
      "Eighth-note triplets for the loops; quarter-note triplets, three to every two clicks, for the one-pass progression.",
    ],
    payoff: "A five-string arpeggio up the neck and back with every note separate, and a four-chord progression played as one unbroken sweep.",
    exercises: [
      sweep({
        id: "am-five",
        title: "A minor, the classic five-string shape (timing only)",
        purpose: "A, C, E, A, C, E, A on five strings from the A string's fret 12, with a turn at each end. The most-used sweep shape there is.",
        howTo: [
          "Eighth-note triplets, one loop a bar. Hammer 12 to 15 on the A string at the bottom, one note a string up to the top, hammer and pull at the top, and down. The last note, back on the A string's 15, is an upstroke; the next loop starts with a downstroke on 12.",
          "Fingers on the A minor shape: first finger 12 on the A and top E, little finger 15 on the A and 17 on the top E, ring finger rolling from the D string's 14 to the G string's 14, middle finger 13 on the B.",
        ],
        coach: "Timing only, and only up to the graded rungs. Above them the tempo is yours to judge on a recording.",
        vary: {
          values: { key: ["A", "B", "C", "G"] },
          pooled: ["key"],
          label: (p) => `${p.key} minor`,
          build: (p) => {
            const near: Record<string, number> = { A: 12, B: 14, C: 15, G: 10 };
            const tab = `/8t ${sweepLoop({ chord: `${p.key}m`, strings: [5, 4, 3, 2, 1], near: near[p.key], doubleLow: true })}`;
            return { tab, position: handAt(tab), harmony: { arpeggio: `${p.key}m`, cover: true } };
          },
        },
        tab: `/8t ${sweepLoop({ chord: "Am", strings: [5, 4, 3, 2, 1], near: 12, doubleLow: true })}`,
        position: 12,
        harmony: { arpeggio: "Am", cover: true },
        rungs: ladder(50, 110, 5),
        passAt: 90,
        minutes: 7,
      }),
      sweep({
        id: "the-link",
        title: "The link: one shape into the next (timing only)",
        purpose: "Two loops of one three-string shape, then two of the next, carried straight across the bar line: the link on its own, where it is easiest to hear.",
        howTo: [
          "Eighth-note triplets, two loops a bar. After the very first note, every G-string note is an upstroke that turns the sweep round, inside the bar and across the bar line alike: the upward push that finishes bar 1 carries straight on into bar 2's shape. Don't stop it and don't restart it.",
          "Choose the nearest note of the new chord, not its root. Good links barely move the hand.",
        ],
        coach: "Timing only. Listen for a gap at the bar line: it is the one thing a recording shows at once.",
        vary: {
          values: { progression: ["Am to F", "Am to G", "Am to E", "Am to Dm"] },
          pooled: ["progression"],
          label: (p) => p.progression,
          build: (p) => {
            const chords = p.progression.split(" to ");
            const tab = endsUp(sweepChain({ chords, strings: [3, 2, 1], near: 14, perBar: 2, rhythm: "/8t" }));
            return { tab, position: handAt(tab), shifts: true, chords: chords.join(" | ") };
          },
        },
        tab: endsUp(sweepChain({ chords: ["Am", "F"], strings: [3, 2, 1], near: 14, perBar: 2, rhythm: "/8t" })),
        chain: { maxJointFrets: 5 },
        position: 12,
        shifts: true,
        chords: "Am | F",
        harmony: { chordTones: true },
        rungs: ladder(50, 110, 5),
        passAt: 90,
        selfCheck: ["At the bar line, did the sweep keep going, with no gap and no extra pick stroke before the new shape?", RING_CHECK],
        minutes: 6,
      }),
      sweep({
        id: "one-pass-each",
        title: "Am, F, C, G: one pass a chord (timing only)",
        purpose: "Up five strings on Am, link, down F, link, up C, link, down G: every chord change is a single small step on an outer string.",
        howTo: [
          "Quarter-note triplets, six notes a bar, three to every two clicks: one pass across five strings and one more note on the last string. In bars 2 to 4 the first note comes from the last bar's final note without a pick, by hammer, pull or slide; bar 1's first note is picked each time round.",
          "Where the last note is four frets away, it is a slide on one finger, not a hammer: the top string's 8 to 12 is the index, and the hand arrives over the F. In bar 2 the pull lands on the ring finger, which slides down into C.",
          "At 150 this is the note rate of eighth-note triplets at 75: slow on purpose, because the links are what you are learning. Bar 4's G rolls a barre across the D, G and B strings at fret 12.",
          "Sing the top notes if you can. They make a tune, and the tune is how you keep your place.",
        ],
        coach: "Timing only. Four links a round; whether a link was picked is up to your ear.",
        vary: {
          values: { key: ["A", "G", "C"] },
          pooled: ["key"],
          label: (p) => `${p.key} minor: i-VI-III-VII`,
          build: (p) => {
            const chart = moveChart("Am | F | C | G", SWEEP_SHIFT[p.key]);
            const chords = chart.split("|").map((c) => c.trim());
            const near = p.key === "A" ? 12 : p.key === "G" ? 10 : 15;
            const tab = onePassFingers(linkedSweep({ chords, strings: [5, 4, 3, 2, 1], near, rhythm: "/4t", extra: true }));
            return { tab, position: handAt(tab), shifts: true, chords: chart };
          },
        },
        tab: onePassFingers(linkedSweep({ chords: ["Am", "F", "C", "G"], strings: [5, 4, 3, 2, 1], near: 12, rhythm: "/4t", extra: true })),
        chain: { maxJointFrets: 5 },
        position: 12,
        shifts: true,
        chords: "Am | F | C | G",
        harmony: { chordTones: true },
        rungs: ladder(100, 190, 10),
        passAt: 150,
        minutes: 6,
      }),
    ],
  },
  {
    id: "tapping-etude",
    title: "Tapping, then the etude",
    goal: "Tap a triplet arpeggio with the picking hand over the chords, hold a line for a minute, then play an eight-bar run over the band.",
    why: "Tapping adds notes no fretting hand could reach, and over chord changes it sounds bigger than anything else in this Path for the effort. Then the finale: a minute of unbroken sixteenths shows whether the speed is built on tension, and an eight-bar run with a band is the reason you did all the rest.",
    howTo: [
      "Tap with the middle finger of the picking hand, holding the pick tucked away. Tap hard and pull off slightly downward so the next note sounds. The tab marks a tap T.",
      "Taps are the loud notes and the timing is read from them most firmly. The pulled and hammered notes between them may be too quiet to catch, and cost nothing if they are.",
      SAFETY,
    ],
    payoff: "A tapped arpeggio that moves with the chords, a full minute of sixteenths that sounds the same at the end as at the start, and an eight-bar run over a band.",
    exercises: [
      {
        id: "tap-triplets",
        title: "Tap, pull, hammer: A minor in triplets",
        purpose: "The tapping cell on A minor's notes: tap the high note, pull off to the low fretted note, hammer the middle one. On the top string: E tapped at 12, A at 5, C at 8. One tap to every click.",
        howTo: [
          "Eighth-note triplets, three to the click. The picking hand taps on every click; the fretting hand holds the low note with the first finger and hammers the middle note with the ring or little finger (top string 12-5-8, B string 17-10-13, G string 14-5-9).",
          "Mute: the fretting hand's first finger lies lightly across the higher strings, and the picking hand's palm rests on the low strings while it taps.",
        ],
        coach: "The taps carry the timing. Pull-offs and hammers I can't hear cost nothing.",
        vary: {
          values: { stringSet: ["top E: 12-5-8", "B: 17-10-13", "G: 14-5-9"] },
          pooled: ["stringSet"],
          label: (p) => p.stringSet,
          build: (p) => {
            const [name, frets] = p.stringSet.split(": ");
            const string = { "top E": 1, B: 2, G: 3 }[name] ?? 1;
            const [t, a, b] = frets.split("-").map(Number);
            const chord = "Am";
            return {
              tab: `/8t ${repeat(`${string}:${t}t ${string}:${a}p ${string}:${b}h`, 4)}`,
              position: a,
              harmony: { arpeggio: chord, cover: true },
            };
          },
        },
        tab: `/8t ${repeat("1:12t 1:5p 1:8h", 4)}`,
        position: 5,
        harmony: { arpeggio: "Am", cover: true },
        rungs: ladder(60, 120, 5),
        passAt: 110,
        grade: "timing",
        pass: [even(0.8), heard(0.9), extras(3)],
        selfCheck: ["Was the pulled-off note as loud as the tapped one?"],
        minutes: 5,
      },
      {
        id: "tap-changes",
        title: "Tap, pull, hammer over Am, F and G",
        purpose: "The same cell with the tap moving to each chord over a band: E for Am, F for F, G for G. The fretting hand moves only for the G.",
        howTo: [
          "Eighth-note triplets, one chord a bar. Am: tap 12, pull to 5, hammer 8. F: tap 13, pull to 5, hammer 8. G: tap 15, pull to 7, hammer 10, twice. Then round again.",
          "Move the tap during the last hammer of the bar, so it lands on the next bar's first click.",
        ],
        coach: "The taps carry the timing. With a band, direct input or headphones is the honest way to take this.",
        tab: `/8t ${repeat("1:12t 1:5p 1:8h", 4)} | ${repeat("1:13t 1:5p 1:8h", 4)} | ${repeat("1:15t 1:7p 1:10h", 4)} | ${repeat("1:15t 1:7p 1:10h", 4)}`,
        position: 5,
        shifts: true,
        chords: "Am | F | G | G",
        jam: { groove: "rockTwelveEight", key: "A minor" },
        harmony: { chordTones: true, cover: true },
        rungs: ladder(60, 110, 5),
        passAt: 100,
        grade: "timing",
        pass: [even(0.8), heard(0.9), extras(3)],
        selfCheck: ["Did each tap land on the bar's first click when the chord changed?"],
        minutes: 6,
      },
      {
        id: "stamina-minute",
        title: "The stamina minute",
        purpose: "Three strings of A minor up and back, sixteenths, for sixty seconds without a stop, with both crossing types in every bar.",
        howTo: [
          "Sixteenths. Choose a rung about 20% below your clean tempo on three-per-string. It should feel slow for the first ten seconds.",
          "Breathe. If the shoulder comes up, drop it during a bar line without stopping.",
        ],
        coach: "If I stop catching notes on a long take, trust that report over your doubts about your hands. Long unbroken playing is something the listening has not been proven on.",
        vary: {
          values: { stringSet: NPS_STARTS },
          pooled: ["stringSet"],
          label: (p) => `A minor ${p.stringSet}`,
          build: (p) => {
            const { string, fret } = NPS_START[p.stringSet];
            const tab = `/16 ${threeNps({ root: "A", scale: "naturalMinor", string, fret, strings: 3, sequence: "updown" })}`;
            return { tab, position: handAt(tab), shifts: true };
          },
        },
        tab: `/16 ${threeNps({ root: "A", scale: "naturalMinor", string: 6, fret: 5, strings: 3, sequence: "updown" })}`,
        position: 5,
        shifts: true,
        crossing: "both",
        holdSeconds: 60,
        harmony: { scale: ["A", "naturalMinor"], cover: true },
        rungs: ladder(50, 90, 5),
        passAt: 75,
        grade: "stamina",
        // Twenty bars at 75 is just over the minute; the profile's sixteen is 51 seconds.
        pass: [even(0.8, 20), heard(0.9, 20), { metric: "evennessHold", min: 0.75, overBars: 4 }],
        minutes: 4,
      },
      {
        id: "the-run",
        title: "The eight-bar run over the band",
        purpose: "Eight bars over Am, F, C, G twice, using the whole Path: the outside lick, a picked arpeggio, a C line and a scale run home in sixteenths, then the Gilbert four-note loop, the tap figure over F, the six-note lick as pull-offs in sextuplets, and a run back to A.",
        howTo: [
          "Sixteenths, except bar 6 (eighth-note triplets: tap 13, pull to 5, hammer 8, the F chord) and bar 7 (sextuplets: pick the top string's 8 and pull to 7 and 5, pick the B string's 8 and pull to 6 and 5). One idea a bar, and every bar lands on a tone of its chord on beat 1. Play it dry first and hear that happen.",
          "Listen to the snare, not to your own fingers. If you get lost, catch the next bar line and carry on.",
          "Use direct input or headphones for a graded take: the band reaching a microphone has not been tested.",
        ],
        coach: "This is the finale: sixteen bars, held to the end. Fast notes on a real rig are the hardest for me to place, so trust the evenness and your ear together.",
        tab: ETUDE,
        position: 5,
        shifts: true,
        chords: "Am | F | C | G | Am | F | C | G",
        jam: { groove: "rock8", key: "A minor" },
        harmony: { scaleOverChords: ["A", "naturalMinor"] },
        rungs: ladder(70, 110, 5),
        passAt: 100,
        grade: "timingNotes",
        pass: FINALE_NOTES,
        minutes: 7,
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Tab builders for the longer drills.
// ---------------------------------------------------------------------------

/** 1-2-3-4 up six strings, up a fret, 4-3-2-1 down; twice, climbing. Six bars. */
function petrucci(fret: number): string {
  const up = (f: number) => acrossStrings({ cell: [0, 1, 2, 3], strings: [6, 5, 4, 3, 2, 1], fret: f });
  const down = (f: number) => acrossStrings({ cell: [3, 2, 1, 0], strings: [1, 2, 3, 4, 5, 6], fret: f });
  return `/16 ${up(fret)} ${down(fret + 1)} ${up(fret + 2)} ${down(fret + 3)}`;
}

/** The spider, a string pair to each beat, crawling across and back. */
function spider(fret: number): string {
  const pair = (f: number, low: number, high: number) => `${low}:${f} ${high}:${f + 2} ${low}:${f + 1} ${high}:${f + 3}`;
  const up = (f: number) => [pair(f, 6, 5), pair(f, 5, 4), pair(f, 4, 3), pair(f, 3, 2)].join(" ");
  const back = (f: number) => [pair(f, 2, 1), pair(f, 3, 2), pair(f, 4, 3), pair(f, 5, 4)].join(" ");
  return `/16 ${up(fret)} | ${back(fret + 1)} | ${up(fret + 2)} | ${back(fret + 3)}`;
}

/** 1-3-2-4 up six strings, then up a fret and 4-2-3-1 down. Three bars. */
function permutation(fret: number): string {
  const up = acrossStrings({ cell: [0, 2, 1, 3], strings: [6, 5, 4, 3, 2, 1], fret });
  const down = acrossStrings({ cell: [3, 1, 2, 0], strings: [1, 2, 3, 4, 5, 6], fret: fret + 1 });
  return `/16 ${up} ${down}`;
}

/** The six-note loop on each string pair of box 1, down the box and back up. */
function downTheBox(): string {
  const cell: Record<string, string> = {
    "2,1": "2:5 2:8 1:5 1:8 1:5 2:8",
    "3,2": "3:5 3:7 2:5 2:8 2:5 3:7",
    "4,3": "4:5 4:7 3:5 3:7 3:5 4:7",
    "5,4": "5:5 5:7 4:5 4:7 4:5 5:7",
  };
  return `/16t ${["2,1", "3,2", "4,3", "5,4"].map((k) => cell[k]).join(" ")} | ${["5,4", "4,3", "3,2", "2,1"].map((k) => cell[k]).join(" ")}`;
}

/** Groups of three up three strings as triplets, then a quarter on the next string's first note. */
function threesTab(string: number, fret: number): string {
  const four = nps(string, 4, fret);
  const cells = four.slice(0, 9);
  return `/8t ${cellsTab(groupsAt(cells, 3, [0, 1, 2, 3, 4, 5, 6], 1))} /4 ${cellsTab([four[9]])}`;
}

/** Groups of six as sextuplets: four up across four strings, four down. */
function sixesTab(string: number, fret: number): string {
  const cells = nps(string, 4, fret);
  return `/16t ${cellsTab(groupsAt(cells, 6, [0, 1, 2, 3], 1))} | ${cellsTab(groupsAt(cells, 6, [9, 8, 7, 6], -1))}`;
}

/** Where the hand starts for each descending-fours set: over its first, highest note. */
const FOURS_DOWN_AT: Readonly<Record<string, number>> = {
  "top three, down from D": 7,
  "middle three, down from A": 6,
  "low middle, down from F": 7,
};

/** Descending fours on three strings, then a half note two scale steps below. */
function foursDownTab(set: string): string {
  const starts: Record<string, { string: number; fret: number; land: string }> = {
    "top three, down from D": { string: 3, fret: 5, land: "4:7" },
    "middle three, down from A": { string: 4, fret: 5, land: "5:7" },
    "low middle, down from F": { string: 5, fret: 7, land: "6:8" },
  };
  const { string, fret, land } = starts[set];
  return `/16 ${threeNps({ root: "A", scale: "naturalMinor", string, fret, strings: 3, sequence: "foursDown" })} /2 ${land}`;
}

/** Where Step 1's semitone-tone figure (E-F-G or B-C-D) sits on each string. */
function figureAt(string: number | string): number {
  return Number(string) <= 2 ? 12 : 9;
}

type Figure = (a: string, b: string, c: string) => string;

/** A burst on the figure: `a`, `b` a fret up, `c` two frets above that. */
function burstTab(string: number, figure: Figure): string {
  const f = figureAt(string);
  return figure(`${string}:${f}`, `${string}:${f + 1}`, `${string}:${f + 3}`);
}

/** One, two, three bursts landing on the figure's first note, then a full bar. */
function expanding(a: string, b: string, c: string): string {
  const cell = `${a} ${b} ${c} ${b}`;
  return `/16 ${cell} /4 ${a} r r | /16 ${repeat(cell, 2)} /4 ${a} r | /16 ${repeat(cell, 3)} /4 ${a} | /16 ${repeat(cell, 4)}`;
}

/** Bursts on the four strings where the figure stays in A minor. */
function burstsOn(figure: Figure) {
  return {
    values: { stringSet: ["1", "2", "3", "4"] },
    pooled: ["stringSet"] as const,
    label: (p: VariantParams) => `String ${p.stringSet}, fret ${figureAt(p.stringSet)}`,
    build: (p: VariantParams) => ({ tab: burstTab(Number(p.stringSet), figure), position: figureAt(p.stringSet) }),
  };
}

/** Octaves, each twice, up the scale and back. */
/**
 * The two fingers the one-pass chain needs written (fingering audit 2): F's last
 * pull lands on the ring finger, which slides down into C's shape at its own fret,
 * and C's top note is the middle finger, which slides up so the index is free for
 * the pull into G. Bar 2's last note and bar 3's fifth.
 */
function onePassFingers(tab: string): string {
  const bars = tab.split("|").map((bar) => bar.trim().split(/\s+/));
  const mark = (bar: number, index: number, finger: number) => {
    bars[bar][index] = bars[bar][index].replace(/^(\d:\d+)/, `$1f${finger}`);
  };
  mark(1, bars[1].length - 1, 3);
  mark(2, 5, 2);
  return bars.map((bar) => bar.join(" ")).join(" | ");
}

function octavesTab(set: string): string {
  const shapes: Record<string, { low: number; high: number; gap: number; frets: number[] }> = {
    "A and G": { low: 5, high: 3, gap: 2, frets: [7, 8, 10, 12] },
    "low E and D": { low: 6, high: 4, gap: 2, frets: [5, 7, 8, 10] },
    "D and B": { low: 4, high: 2, gap: 3, frets: [7, 9, 10, 12] },
  };
  const { low, high, gap, frets } = shapes[set];
  // The octave grip moves as one: index below, ring (two frets up) or little finger (three) above.
  const pair = (f: number) => repeat(`${low}:${f}f1 ${high}:${f + gap}f${gap === 2 ? 3 : 4}`, 2);
  return `/16 ${frets.map(pair).join(" ")} | ${[...frets].reverse().map(pair).join(" ")}`;
}

/** Box 1 in pairs with every other pair skipping a string, up and down. */
function pentSkipTab(): string {
  return `/16 6:5 6:8 4:5 4:7 5:5 5:7 3:5 3:7 4:7 4:5 2:5 2:8 3:7 3:5 1:5 1:8 | 1:8 1:5 3:7 3:5 2:8 2:5 4:7 4:5 3:7 3:5 5:7 5:5 4:7 4:5 6:5 6:8`;
}

/** Economy, ascending: a three-string run a bar from four strings, with a rest to reset. */
function economyUp(): string {
  return [3, 4, 5, 6]
    .map((s) => `/16 ${threeNps({ root: "A", scale: "naturalMinor", string: s, fret: 5, strings: 3, sequence: "up" })} r r r /4 r`)
    .join(" | ");
}

/** Economy, descending: a three-string run a bar, starting on an upstroke. */
function economyDown(): string {
  return [6, 5, 4, 3]
    .map((s) => {
      const cells = [...nps(s, 3)].reverse();
      return `/16 ${cellsTab(cells, (_c, i) => (i === 0 ? "u" : ""))} r r r /4 r`;
    })
    .join(" | ");
}

/** A trill: one bar picked, one bar with one picked note a beat. */
function trillTab(string: number, lo: number, hi: number): string {
  const a = `${string}:${lo}`;
  const b = `${string}:${hi}`;
  return `/16 ${repeat(`${a} ${b}`, 8)} | ${repeat(`${a}> ${b}h ${a}p ${b}h`, 4)}`;
}

/** a-b-c-b on one string: picked bar, then a legato bar picking each beat's first note. */
function rollTab(string: number, a: number, b: number, c: number): string {
  const s = string;
  return `/16 ${repeat(`${s}:${a} ${s}:${b} ${s}:${c} ${s}:${b}`, 4)} | ${repeat(`${s}:${a} ${s}:${b}h ${s}:${c}h ${s}:${b}p`, 4)}`;
}

/** Pentatonic pull-offs down two string trios: a picked bar, then the legato bar. */
function pentPullsTab(): string {
  const picked = (t: string) => t.replace(/p/g, "");
  const ebg = "1:8 1:5p 2:8 2:5p 3:7 3:5p";
  const bgd = "2:8 2:5p 3:7 3:5p 4:7 4:5p";
  const bar = [ebg, ebg, bgd, bgd].join(" ");
  return `/16t ${picked(bar)} | ${bar}`;
}

/** Twelve notes up four strings: a picked bar, then hammers with a hammer from nowhere on each string. */
function hammerAscent(): string {
  const cells = nps(6, 4);
  const picked = cellsTab(cells);
  // Every note after the first hammered; a string's first one is a hammer from nowhere (`fromNowhere`).
  const legato = cellsTab(cells, (_c, i) => (i === 0 ? "" : "h"));
  return `/16t ${picked} hold | ${legato} hold`;
}

/** Twelve notes down four strings: a picked bar, then a pick on each string's first note and pulls. */
function pullDescent(): string {
  const cells = [...nps(6, 4)].reverse();
  const picked = cellsTab(cells);
  const legato = cellsTab(cells, (_c, i) => (i % 3 === 0 ? "" : "p"));
  return `/16t ${picked} hold | ${legato} hold`;
}

// ---------------------------------------------------------------------------
// The Path.
// ---------------------------------------------------------------------------

export default definePath({
  id: "shred",
  title: "Shred",
  kind: "mechanics",
  goal: "Alternate, economy, legato, sweeps and tapping in A minor, built up one technique at a time, finishing with an eight-bar sixteenth-note run over a band at 100 BPM.",
  level: "intermediate",
  assumes:
    "You can play the A minor pentatonic box at fret 5 and eighth notes with a click at 90 BPM. No speed is assumed. The minutes are one pass through the material; the drills are meant to be repeated for weeks, and their variants change keys and strings so the repetition stays fresh.",
  prerequisites: { skills: ["The A minor pentatonic box", "Eighth notes with a click at 90 BPM"] },
  labelSubdivisions: true,
  paceLadders: true,
  orderRationale:
    "The teacher's fifteen-Step outline, in its order: one string, then accents and groupings, then four-finger independence, then crossings, so that by Step 5 every later technique has its parts. The Path rotates techniques instead of finishing one before the next, because a shredder needs them together and because a rotation keeps a daily Session from being one drill. Picking comes first and stays the backbone: economy picking (Step 10) is taught only after strict alternate picking is reliable across strings and skips, so it is a choice and not a crutch. Legato and sweeps come late because both lean on a fretting hand built by the chromatic Step, and because the app can grade them least: legato is tied to picked notes, and sweeps say 'timing only' in their titles. Tapping and the eight-bar run close it. Where it departs from the outline: Step 1 adds Alternate Picking's 'four of each' as a fourth graded Exercise, Step 6 lands the six-note licks on a quarter note so they stay in sixteenths, Step 10 keeps the alternate-picked arpeggios beside the economy ones for contrast, and every legato Exercise is a picked bar followed by the same notes legato.",
  gradingLimits:
    "Picked single notes, sixteenths to about 120 BPM and sextuplets to about 90, are the case the app is built for: timing evenness, notes heard and extra notes, plus right notes where the notes are at least 75 ms apart and the pitch is clear, after the take. None of it has been tried on a real guitar. Legato: a hammer-on or pull-off the app doesn't hear costs nothing, so the timing leans on the picked notes and the volume of the legato notes is a self-check; a hammer-on from nowhere and a tap count as attacks that must be heard. Sweeps are graded on timing only: swept notes ring into each other, right notes mostly read 'not checked', and their titles say so; only rungs with at least 150 ms between notes are graded. Accents are rough, louder or not. Pick direction is never heard: it is a checklist item wherever the strokes matter. Above sixteenths at 100 BPM, read the timing as provisional until the input delay is calibrated, and use a clean or light-crunch tone for graded takes.",
  steps: [...BEGINNER, ...INTERMEDIATE, ...ADVANCED],
  levels: [
    {
      id: "beginner",
      title: "Beginner: one string, then two",
      summary: "Sixteenths and sextuplets on one string, accents and groupings, then crossing two strings.",
      startHereIf: [
        "You can play eighth notes with a click at 90 BPM, but sixteenths come out uneven above about 90.",
        "Accents drift off the beat when you group notes in threes or sixes.",
        "Crossing between two strings catches the pick, or the crossing notes come out quieter.",
      ],
      steps: ["one-string", "accents", "crossing"],
      warmups: [
        {
          id: "one-string-climb",
          title: "A melody up one string",
          purpose: "Sixteenths up one string in a minor key, a scale step higher each bar. A different string and key each time, so there is a tune to follow and a reason to move.",
          howTo: ["Sixteenths. Start well under your clean tempo. Follow the tune and let the hand travel with it."],
          coach: "This is a warm-up. It tells you how it went, and it decides nothing.",
          vary: {
            values: { key: ["A", "C", "D", "E", "G"], stringSet: ["1", "2", "3"] },
            pooled: ["key", "stringSet"],
            label: (p) => `${p.key} minor on string ${p.stringSet}`,
            build: (p) => {
              const bars = oneStringClimb({
                root: p.key,
                scale: "naturalMinor",
                string: Number(p.stringSet),
                from: 3,
                cell: [0, 1, 2, 3, 2, 1, 0, 1, 0, 1, 2, 3, 2, 1, 0, 1],
                bars: 4,
              });
              const tab = bars.split(" | ").map((bar) => `/16 ${bar}`).join(" | ");
              return { tab, position: handAt(tab), shifts: true, harmony: { scale: [p.key, "naturalMinor"] } };
            },
          },
          grade: "warmup",
          warmup: { start: 0.6, top: 0.8, reference: "one-string.four-of-each", fallback: 60 },
          rungs: ladder(60, 100, 10),
          minutes: 3,
        },
      ],
    },
    {
      id: "intermediate",
      title: "Intermediate: fingers, scales, speed, skips and economy",
      summary: "The chromatic and spider drills and the Gilbert pentatonic loops, then three notes per string and its sequences, speed bursts, string skipping, and economy picking with quintuplets.",
      startHereIf: [
        "You can hold even sixteenths on one string at about 110 BPM.",
        "Crossings between two strings are clean in sixteenths at about 100 BPM.",
        "Scale runs across three strings fall apart, or you've hit a speed wall.",
      ],
      steps: ["chromatic", "gilbert", "three-per-string", "sequences", "speed-bursts", "string-skipping", "economy"],
      warmups: [
        {
          id: "scale-round",
          title: "A scale in two positions",
          purpose: "Three strings of a minor scale, up and back from two places on the neck, starting from a different root each time.",
          howTo: ["Sixteenths. Start well under your clean tempo. Change position at the bar line, and keep the shift small."],
          coach: "This is a warm-up. It tells you how it went, and it decides nothing.",
          vary: {
            values: { key: ["A", "B", "C", "D", "E", "G"], stringSet: ["low strings", "middle strings"] },
            pooled: ["key", "stringSet"],
            label: (p) => `${p.key} minor, ${p.stringSet}`,
            build: (p) => {
              const lowFret: Record<string, number> = { A: 5, B: 7, C: 8, D: 10, E: 12, G: 3 };
              const string = p.stringSet === "low strings" ? 6 : 5;
              const root = string === 6 ? lowFret[p.key] : (lowFret[p.key] + 7) % 12 || 12;
              const first = threeNps({ root: p.key, scale: "naturalMinor", string, fret: root, strings: 3, sequence: "updown" });
              const second = threeNps({ root: p.key, scale: "naturalMinor", string, fret: root + (root + 3 <= 15 ? 3 : -2), strings: 3, sequence: "updown" });
              const tab = `/16 ${first} | ${second}`;
              return { tab, position: handAt(tab), shifts: true, harmony: { scale: [p.key, "naturalMinor"] } };
            },
          },
          grade: "warmup",
          warmup: { start: 0.6, top: 0.8, reference: "three-per-string.three-strings", fallback: 55 },
          rungs: ladder(50, 80, 5),
          minutes: 4,
        },
      ],
    },
    {
      id: "advanced",
      title: "Advanced: legato, sweeps, tapping and the band",
      summary: "Legato tied to picked notes, sweeps graded on timing only, tapping over chords, a stamina minute and the eight-bar run.",
      reachLevel: "advanced",
      startHereIf: [
        "You can run A minor three notes per string across three strings at sixteenths, 95 BPM.",
        "Your picking is reliable and you want the fretting hand to do more of the work.",
        "You've never swept, or your sweeps come out as a strummed chord.",
      ],
      steps: ["legato-one", "legato-two", "sweep-basics", "five-string-sweeps", "tapping-etude"],
      warmups: [
        {
          id: "loop-round",
          title: "The six-note loop around the chords",
          purpose: "The Gilbert loop in sextuplets moved through i, iv and v of a minor key, on one of two string pairs, in a different key each time.",
          howTo: ["Sextuplets. Start well under your clean tempo. The hand moves at the bar line; the strokes don't change."],
          coach: "This is a warm-up. It tells you how it went, and it decides nothing.",
          vary: {
            values: { key: ["A", "C", "D", "E", "G"], stringSet: ["B and E", "G and B"] },
            pooled: ["key", "stringSet"],
            label: (p) => `${p.key} minor, ${p.stringSet}`,
            build: (p) => {
              const cell = p.stringSet === "B and E" ? "2:5 2:8 1:5 1:8 1:5 2:8" : "3:5 3:7 2:5 2:8 2:5 3:7";
              const shift = { A: 0, C: 3, D: 5, E: -5, G: -2 }[p.key] ?? 0;
              const tab = `/16t ${inPositions(repeat(cell, 4), [shift, shift + 5, shift + 7, shift])}`;
              return { tab, position: handAt(tab), shifts: true, chords: moveChart("Am | Dm | Em | Am", shift) };
            },
          },
          grade: "warmup",
          warmup: { start: 0.6, top: 0.8, reference: "gilbert.six-loop", fallback: 50 },
          rungs: ladder(45, 80, 5),
          minutes: 4,
        },
      ],
    },
  ],
});
