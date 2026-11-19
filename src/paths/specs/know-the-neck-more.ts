/**
 * Know the Neck: three consolidation Steps (2026-11-19). Drafts, like the Path
 * they belong to.
 *
 * The Path named only natural notes and showed octave shapes once. These Steps
 * give the player who arrives from First Chords the roots of the chords they
 * already play, name the notes between the naturals (which the thirds in other
 * keys, and the Paths after this one, depend on), and take the top three
 * strings into G major and F major so F sharp and B flat are used and not only
 * named. Every id is new, so nobody's progress moves.
 */
import type { ExerciseSpec, StepSpec, VariantBuild } from "../spec";
import { STANDARD_TUNING } from "../format";
import type { PassBar } from "../format";
import { scalePcs } from "../theory";
import { handAt, ladder } from "../templates";

// Copied from know-the-neck.ts, never imported from it: that file imports this one.
type Grading = Pick<ExerciseSpec, "grade" | "alsoGraded" | "pass">;

/** Written single-note lines: right notes first, then notes heard, extras and a loose timing bar. */
function named(evenness = 0.75, overBars = 4): Grading {
  const bars: PassBar[] = [
    { metric: "noteIdentity", min: 0.9, overBars },
    { metric: "notesHeard", min: 0.9, overBars },
    { metric: "extraNotes", max: 4, overBars: 4 },
    { metric: "timingEvenness", min: evenness, overBars },
  ];
  return { grade: "written", alsoGraded: ["timingEvenness"], pass: bars };
}

const SAY_CHECK = "Did you say each note's name out loud as you played it?";
const EYES_CHECK = "Could you play it once without looking at the neck?";

const C_MAJOR = { scale: ["C", "major"] as [string, string] };
const ROCK = (key: string) => ({ groove: "rock8", key });

const open = (string: number) => STANDARD_TUNING[string - 1];

/** An octave shape walked through four notes and back: `gap` frets up, two strings over. */
function octaves(low: number, high: number, gap: number, frets: readonly number[], upper: 3 | 4): string {
  const pair = (fret: number) => `${low}:${fret}f1 ${high}:${fret + gap}f${upper}`;
  const [a, b, c, d] = frets;
  return `/4 ${pair(a)} ${pair(b)} | ${pair(c)} ${pair(d)} | ${pair(c)} ${pair(b)} | /2 ${pair(a)}`;
}

/**
 * The notes of a major key on one string, eight of them up and back, with the
 * first finger walking: from the open string where it is in the key, from fret
 * 1 where it is not (the B string in F major).
 */
function keyWalk(string: number, key: string): string {
  const pcs = new Set(scalePcs(key, "major"));
  const frets: number[] = [];
  for (let fret = 0; frets.length < 8; fret += 1) if (pcs.has((open(string) + fret) % 12)) frets.push(fret);
  const tok = (fret: number) => (fret === 0 ? `${string}:0` : `${string}:${fret}f1`);
  const up = frets.map(tok);
  const down = [...frets].reverse().slice(1, -1).map(tok);
  return `/4 ${up.slice(0, 4).join(" ")} | ${up.slice(4).join(" ")} | ${down.slice(0, 4).join(" ")} | ${down.slice(4).join(" ")} /2 ${tok(frets[0])}`;
}

/** Every fret of one string from open to 12 and back, one finger to a fret, the hand moving every four. */
function everyFret(string: number): string {
  const tok = (fret: number) => (fret === 0 ? `${string}:0` : `${string}:${fret}f${((fret - 1) % 4) + 1}`);
  const run = (frets: number[]) => frets.map(tok).join(" ");
  return `/4 ${run([0, 1, 2, 3])} | ${run([4, 5, 6, 7])} | ${run([8, 9, 10, 11])} | ${run([12, 11, 10, 9])} | ${run([8, 7, 6, 5])} | ${run([4, 3, 2, 1])} | /1 ${tok(0)}`;
}

const STRING_OF: Record<string, number> = { "G string": 3, "B string": 2, "top E string": 1 };

/** On the one-string walks: the words are the G string's, and each other string has its own, written out below. */
const STRING_NOTE = "The frets and note names here are for the G string. Other Takes walk the B string and the top string in the same key.";
const OTHER_STRINGS = "Other Takes walk the other two of the G, B and top strings in the same key.";

type WalkText = Pick<VariantBuild, "purpose" | "howTo">;

/** The B and top strings in G major, in their own words: the tempo line is the Exercise's. */
const G_WALK_TEXT: Record<string, WalkText> = {
  "B string": {
    purpose: "B, C, D, E, F sharp, G, A, B up the B string and back: the walk you know, with F sharp at fret 7 where F was at fret 6.",
    howTo: (base) => [
      base[0],
      "Open, 1, 3, 5, 7, 8, 10, 12, with the first finger walking, then back down to the open string. B to C is the open string to fret 1, and F sharp to G is frets 7 to 8. The key note, G, is at fret 8.",
      OTHER_STRINGS,
    ],
  },
  "top E string": {
    purpose: "E, F sharp, G, A, B, C, D, E up the top string and back: the low E string's notes two octaves higher, with F sharp at fret 2 where F was at fret 1.",
    howTo: (base) => [
      base[0],
      "Open, 2, 3, 5, 7, 8, 10, 12, with the first finger walking, then back down to the open string. F sharp to G is frets 2 to 3, and B to C is frets 7 to 8. The key note, G, is at fret 3.",
      OTHER_STRINGS,
    ],
  },
};

/** The B and top strings in F major. The B string has no open note in this key: frets 1 to 13. */
const F_WALK_TEXT: Record<string, WalkText> = {
  "B string": {
    purpose: "C, D, E, F, G, A, B flat, C up the B string and back, with B flat at fret 11 where B was at fret 12. The open B string is not in this key, so the walk starts at fret 1 and tops out at fret 13.",
    howTo: (base) => [
      base[0],
      "Frets 1, 3, 5, 6, 8, 10, 11, 13, with the first finger walking, then back down to fret 1. E to F is frets 5 to 6, and A to B flat is frets 10 to 11. The key note, F, is at fret 6. Fret 13 is fret 1 again, an octave higher.",
      OTHER_STRINGS,
    ],
  },
  "top E string": {
    purpose: "E, F, G, A, B flat, C, D, E up the top string and back: the natural notes again, with B flat at fret 6 where B was at fret 7.",
    howTo: (base) => [
      base[0],
      "Open, 1, 3, 5, 6, 8, 10, 12, with the first finger walking, then back down to the open string. E to F is the open string to fret 1, and A to B flat is frets 5 to 6. The key note, F, is at fret 1.",
      OTHER_STRINGS,
    ],
  },
};

// --- Beginner, after the octave shapes: the roots of the open chords ---------

const OPEN_ROOTS = `/4 6:0 6:0 5:0 5:0 | 4:0 4:0 6:3f3 6:3f3 | 5:3f3 5:3f3 6:3f3 6:3f3 | 4:0 5:0 /2 6:0`;
const ROOTS_OCTAVE = `/4 6:0 4:2f2 5:0 3:2f2 | 6:3f1 4:5f3 5:3f1 3:5f3 | 6:3f1 4:5f3 5:0 3:2f2 | /2 6:0 4:2f2`;
const ROOTS_WIDE = `/4 4:0 2:3f3 4:2f1 2:5f4 | 3:2f1 1:5f4 4:5f1 2:8f4 | 3:5f1 1:8f4 4:5f1 2:8f4 | /2 4:0 2:3f3`;
const ROOTS_WALK_MAJOR = `/4 6:3f1 4:5f3 /2 2:8f4 | /4 5:3f1 3:5f3 /2 1:8f4 | /2 4:0 2:3f3 | /4 2:8f4 4:5f3 /2 6:3f1`;
const ROOTS_WALK_MINOR = `/4 5:0 3:2f1 /2 1:5f4 | /2 4:0 2:3f2 | /4 6:0 4:2f1 /2 2:5f4 | /4 1:5f4 3:2f1 /2 5:0`;

/**
 * Beginner, straight after `octaves`: the shapes that Step taught are used at
 * once on the chords the player arrives with, and nothing here needs the D, G
 * and B strings by name (the Step after it).
 */
export const CHORD_ROOTS: StepSpec = {
  id: "chord-roots",
  title: "The root of a chord you know",
  goal: "Find the root of E, A, D, G and C in the open chords you play, and the same root higher up the neck by the two octave shapes.",
  why: "A chord is named after one of its notes, the root. In the open chords E, A, D, G and C it is the lowest note you strum, on one of the three low strings, and you can name those now. The octave shapes then find the same root higher up, on the strings where the small chord shapes of later Steps sit. E minor, A minor and D minor have the same roots as E, A and D: the letter is the root, and the word after it says what kind of chord is built on it.",
  howTo: [
    "E, A and D have their roots on open strings: the low E string, the A string and the D string. G is the low E string at fret 3. C is the A string at fret 3.",
    "From a root on the low E or A string, the octave is two strings over and two frets up. From the D or G string it is two strings over and three frets up.",
    "Say the chord's name as you play its root, and again for each octave. It is one note in several places.",
  ],
  payoff: "You can point to the root of every open chord here in two or three places, and walk the roots of three chords up the neck in time.",
  difficultyException:
    "Three of the five roots are open strings, so there is less to fret and less distance to cover than in the octave shapes before it. The demand is tying each note to a chord the player already holds, which the metric does not count.",
  exercises: [
    {
      id: "open-chord-roots",
      title: "Five roots, where the chords have them",
      purpose: "E, A, D, G and C: the lowest note of each open chord, played alone and named. Three are open strings and two are at fret 3.",
      howTo: [
        "Quarter notes, one to a click, 50 BPM up to a pass at 80.",
        "Each root twice: the open low E string, the open A string, the open D string, the low E string at fret 3 for G, the A string at fret 3 for C. Then G twice more, and D, A and E once each, with that E held for two clicks.",
        "Use the third finger for both notes at fret 3. In the open G and C chords that finger is already on the root.",
      ],
      coach: "Right notes and steady quarters after the take. Say the chord's name on each new root.",
      tab: OPEN_ROOTS,
      position: 1,
      harmony: C_MAJOR,
      rungs: ladder(50, 110, 10),
      passAt: 80,
      ...named(0.8),
      selfCheck: [SAY_CHECK],
      minutes: 4,
    },
    {
      id: "roots-octave-up",
      title: "Each root, an octave up",
      purpose: "E, A, G and C, each followed by the same note an octave higher: two strings over and two frets up. For E and A, that higher note is one you already hold in the open chord.",
      howTo: [
        "Quarter notes, 50 BPM up to a pass at 80.",
        "E: the open low E string, then the D string at fret 2. A: the open A string, then the G string at fret 2. G: low E string 3, D string 5. C: A string 3, G string 5. Then G and A again, and E once more with both notes held for two clicks.",
        "Second finger for the two notes at fret 2, whichever finger holds them in the chord. For G and C the root goes under the first finger here, so the third finger can reach the octave two frets up.",
        "The G on the D string at fret 5 is the same note as the open G string, and the C on the G string at fret 5 is the same note as the B string at fret 1. So the open G and C chords hold these octaves too, in another place.",
      ],
      coach: "Right notes and steady quarters after the take. Each pair is one chord name, said twice.",
      tab: ROOTS_OCTAVE,
      position: 1,
      shifts: true,
      harmony: C_MAJOR,
      rungs: ladder(50, 110, 10),
      passAt: 80,
      ...named(0.8),
      minutes: 5,
    },
    {
      id: "roots-wide-shape",
      title: "Higher again: the wider shape",
      purpose: "From the D or G string the octave is two strings over and three frets up. That gives D its octave on the B string, and gives E, A, G and C a second octave on the B and top strings.",
      howTo: [
        "Quarter notes, 50 BPM up to a pass at 80.",
        "D: the open D string, then the B string at fret 3. E: D string 2, B string 5. A: G string 2, top string 5. G: D string 5, B string 8. C: G string 5, top string 8. Then G again, and D once more with both notes held for two clicks.",
        "First finger on the lower note and little finger on the upper one, as in the octave shape from the D and G strings. The D at fret 3 takes the third finger, which is where it sits in an open D chord.",
      ],
      coach: "Right notes and steady quarters after the take. The hand moves only between pairs, never inside one.",
      tab: ROOTS_WIDE,
      position: 1,
      shifts: true,
      harmony: C_MAJOR,
      rungs: ladder(50, 110, 10),
      passAt: 80,
      ...named(0.8),
      minutes: 5,
    },
    {
      id: "roots-walk",
      title: "Three chords, roots low to high",
      purpose: "The roots of G, C and D, each one climbing through its octaves, then G coming back down. G and C have three places here. D starts on the open D string, so it has two.",
      howTo: [
        "Quarter notes and half notes, 50 BPM up to a pass at 80.",
        "G: low E string 3, D string 5, then the B string at fret 8, held for two clicks. C: A string 3, G string 5, then the top string at fret 8, held. D: the open D string and the B string at fret 3, two clicks each. Then G back down: B string 8, D string 5, then the low E string at fret 3, held for two clicks.",
        "First finger, third finger, then the hand moves up two frets so the little finger takes fret 8. Coming down, move back two frets before the D string so the third finger takes fret 5.",
        "On other Takes the three chords are A minor, D minor and E.",
      ],
      coach: "Right notes and time after the take. Say each chord's name once, on its lowest root.",
      vary: {
        values: { progression: ["G, C and D", "A minor, D minor and E"] },
        pooled: ["progression"],
        label: (p) => p.progression,
        build: (p) =>
          p.progression === "G, C and D"
            ? { tab: ROOTS_WALK_MAJOR, position: 3, chords: "G | C | D | G" }
            : {
                tab: ROOTS_WALK_MINOR,
                position: 2,
                chords: "Am | Dm | E | Am",
                purpose:
                  "The roots of A minor, D minor and E, each one climbing through its octaves, then A coming back down. A and E have three places here. D starts on the open D string, so it has two.",
                howTo: (base) => [
                  base[0],
                  "A: the open A string, G string 2, then the top string at fret 5, held for two clicks. D: the open D string and the B string at fret 3, two clicks each. E: the open low E string, D string 2, then the B string at fret 5, held. Then A back down: top string 5, G string 2, then the open A string, held for two clicks.",
                  "Open string, first finger at fret 2, little finger at fret 5. The D at fret 3 takes the second finger, and the hand does not move.",
                  "On other Takes the three chords are G, C and D.",
                ],
              },
      },
      tab: ROOTS_WALK_MAJOR,
      position: 3,
      shifts: true,
      chords: "G | C | D | G",
      harmony: { chordTones: true },
      rungs: ladder(50, 110, 10),
      passAt: 80,
      ...named(0.7),
      selfCheck: [EYES_CHECK],
      minutes: 6,
    },
  ],
};

// --- Beginner, the last Step of the Level: sharps and flats --------------------

const BETWEEN_LOW_E = `/4 6:1f1 6:2f2 6:3f3 6:2f2 | 6:7f3 6:6f2 6:5f1 6:6f2 | 6:8f1 6:9f2 6:10f3 6:9f2 | 6:12f3 6:11f2 /2 6:12f3`;
const BETWEEN_A = `/4 5:0 5:1f1 5:2f2 5:1f1 | 5:5f3 5:4f2 5:3f1 5:4f2 | 5:5f1 5:6f2 5:7f3 5:6f2 | 5:10f3 5:9f2 /2 5:10f3`;

/**
 * Beginner, closing the Level: every natural note is in place by then, and the
 * thirds in D, E, F and A that open the next Level, and the Paths that build on
 * this Level, need these names.
 */
export const IN_BETWEEN: StepSpec = {
  id: "in-between",
  title: "The notes in between",
  goal: "Name the notes that sit between the natural notes, by both of their names, on the low E and A strings, and find four of them on the D and G strings by octave shape.",
  why: "Every note in the Steps so far has been a plain letter, and every walk up a string has skipped frets. The skipped frets are notes too. Each one sits between two letters and takes its name from either neighbour: one fret above F is F sharp, and the same fret is one below G, so it is also G flat. Between E and F, and between B and C, there is no fret to skip, so there is no note in between. Chords and scales away from the natural notes need these: the scale of G major has an F sharp in it, and the scale of F major has a B flat.",
  howTo: [
    "Sharp means one fret higher than the letter. Flat means one fret lower. Fret 2 of the low E string is F sharp and G flat: one fret, two names.",
    "Four come first here: F sharp, B flat, C sharp and E flat. The key of G has one sharp, F sharp, and the key of D adds C sharp. The key of F has one flat, B flat, and the key of B flat adds E flat.",
    "Say each name out loud, as before. The app checks the fret you played and cannot hear which of its two names you gave it.",
  ],
  payoff: "You can name every fret of the low E and A strings up to fret 12, and find F sharp, B flat, C sharp and E flat an octave higher by shape.",
  difficultyException:
    "Quarter notes on one string, mostly with fingers on next-door frets, so less distance to cover than the string walks before it. The demand is five new notes with two names each, which the metric does not count.",
  exercises: [
    {
      id: "between-low-e",
      title: "Four notes between, on the low E string",
      purpose: "F sharp, B flat, C sharp and E flat on the low E string. The first three are played between the natural notes on either side of them, and E flat next to the E above it.",
      howTo: [
        "Quarter notes, 50 BPM up to a pass at 80.",
        "Bar 1: frets 1, 2, 3, 2, which is F, F sharp, G, F sharp. Bar 2: frets 7, 6, 5, 6, which is B, B flat, A, B flat. Bar 3: frets 8, 9, 10, 9, which is C, C sharp, D, C sharp. Bar 4: frets 12, 11, 12, which is E, E flat, E, with the last E held for two clicks.",
        "First, second and third fingers on three frets in a row, and the hand moves at each bar line. B at fret 7 and C at fret 8 are next door, with nothing between them.",
        "Each of the four has a second name. Fret 2 is also G flat, fret 6 is also A sharp, fret 9 is also D flat and fret 11 is also D sharp.",
      ],
      coach: "Right notes and steady quarters after the take. The names are yours to say.",
      tab: BETWEEN_LOW_E,
      position: 1,
      shifts: true,
      rungs: ladder(50, 110, 10),
      passAt: 80,
      ...named(0.8),
      selfCheck: [SAY_CHECK],
      minutes: 5,
    },
    {
      id: "between-a-string",
      title: "The same four on the A string",
      purpose: "B flat, C sharp, E flat and F sharp on the A string, in the order they come up the string. The same four names, at different frets.",
      howTo: [
        "Quarter notes, 50 BPM up to a pass at 80.",
        "Bar 1: open, 1, 2, 1, which is A, B flat, B, B flat. Bar 2: frets 5, 4, 3, 4, which is D, C sharp, C, C sharp. Bar 3: frets 5, 6, 7, 6, which is D, E flat, E, E flat. Bar 4: frets 10, 9, 10, which is G, F sharp, G, with the last G held for two clicks.",
        "Bar 1 uses the open string and the first two fingers. After that it is three fingers on three frets in a row again. D at fret 5 is under the third finger in bar 2 and under the first finger in bar 3, because the hand has moved up two frets.",
        "The second names: fret 1 is also A sharp, fret 4 is also D flat, fret 6 is also D sharp and fret 9 is also G flat.",
      ],
      coach: "Right notes and steady quarters after the take. The names are yours to say.",
      tab: BETWEEN_A,
      position: 1,
      shifts: true,
      rungs: ladder(50, 110, 10),
      passAt: 80,
      ...named(0.8),
      selfCheck: [SAY_CHECK],
      minutes: 5,
    },
    {
      id: "every-fret",
      title: "Every fret, both names",
      purpose: "Every fret of the low E string from the open string to fret 12 and back, one at a time. Going up, name the in-between notes as sharps. Coming down, name them as flats.",
      howTo: [
        "Quarter notes, 50 BPM up to a pass at 80.",
        "Up: E, F, F sharp, G, G sharp, A, A sharp, B, C, C sharp, D, D sharp, E. Down from that E: E flat, D, D flat, C, B, B flat, A, A flat, G, G flat, F, E.",
        "One finger to a fret. Going up, the first finger takes fret 1, then fret 5, then fret 9. Coming down, the little finger takes fret 12, then fret 8, then fret 4. End on the open string, held for a whole bar.",
        "Fret 4 is the fifth in-between note: G sharp or A flat.",
        "On other Takes the same climb is on the A string.",
      ],
      coach: "Right notes and steady quarters after the take. Sharps on the way up, flats on the way down.",
      vary: {
        values: { stringSet: ["low E string", "A string"] },
        pooled: ["stringSet"],
        label: (p) => `Every fret of the ${p.stringSet}`,
        build: (p) =>
          p.stringSet === "low E string"
            ? { tab: everyFret(6), position: 1 }
            : {
                tab: everyFret(5),
                position: 1,
                purpose:
                  "Every fret of the A string from the open string to fret 12 and back, one at a time. Going up, name the in-between notes as sharps. Coming down, name them as flats.",
                howTo: (base) => [
                  base[0],
                  "Up: A, A sharp, B, C, C sharp, D, D sharp, E, F, F sharp, G, G sharp, A. Down from that A: A flat, G, G flat, F, E, E flat, D, D flat, C, B, B flat, A.",
                  base[2],
                  "Fret 11 is the fifth in-between note: G sharp or A flat.",
                  "On other Takes the same climb is on the low E string.",
                ],
              },
      },
      tab: everyFret(6),
      position: 1,
      shifts: true,
      rungs: ladder(50, 110, 10),
      passAt: 80,
      ...named(0.8),
      selfCheck: [SAY_CHECK],
      minutes: 6,
    },
    {
      id: "between-by-octave",
      title: "The same four, an octave up",
      purpose: "F sharp, B flat, C sharp and E flat on the low E string, each answered by its octave on the D string. The octave shape works from any fret, whatever the note is called.",
      howTo: [
        "Quarter notes, 50 BPM up to a pass at 80.",
        "First finger on the low E string, third finger on the D string two frets up: 2 and 4, 6 and 8, 9 and 11, 11 and 13, and back, with the last pair held for two clicks each. Fret 13 on the D string is fret 1 again, an octave higher.",
        "Say the name once for each pair: F sharp, B flat, C sharp, E flat.",
        "On other Takes the same four notes start on the A string.",
      ],
      coach: "Right notes and steady quarters after the take.",
      vary: {
        values: { stringSet: ["low E and D strings", "A and G strings"] },
        pooled: ["stringSet"],
        label: (p) => p.stringSet[0].toUpperCase() + p.stringSet.slice(1),
        build: (p) =>
          p.stringSet === "low E and D strings"
            ? { tab: octaves(6, 4, 2, [2, 6, 9, 11], 3), position: 2 }
            : {
                tab: octaves(5, 3, 2, [1, 4, 6, 9], 3),
                position: 1,
                purpose:
                  "B flat, C sharp, E flat and F sharp on the A string, each answered by its octave on the G string. The octave shape works from any fret, whatever the note is called.",
                howTo: (base) => [
                  base[0],
                  "First finger on the A string, third finger on the G string two frets up: 1 and 3, 4 and 6, 6 and 8, 9 and 11, and back, with the last pair held for two clicks each.",
                  "Say the name once for each pair: B flat, C sharp, E flat, F sharp.",
                  "On other Takes the same four notes start on the low E string.",
                ],
              },
      },
      tab: octaves(6, 4, 2, [2, 6, 9, 11], 3),
      position: 2,
      shifts: true,
      rungs: ladder(50, 110, 10),
      passAt: 80,
      ...named(0.8),
      minutes: 5,
    },
  ],
};

// --- Intermediate, after the thirds: the top three strings in G and in F --------

const G_POSITION = `/8 2:8f4 1:5f1 1:7f3 1:8f4 1:7f3 1:5f1 2:8f4 2:7f3 | 2:5f1 3:7f3 3:5f1 3:7f3 2:5f1 2:7f3 2:8f4 1:5f1 | 1:7f3 1:8f4 1:7f3 1:5f1 2:8f4 2:7f3 2:5f1 3:7f3 | 3:5f1 3:7f3 2:5f1 2:7f3 /2 2:8f4`;
const F_POSITION = `/8 2:6f2 2:8f4 1:5f1 1:6f2 1:8f4 1:6f2 1:5f1 2:8f4 | 2:6f2 2:5f1 3:7f3 3:5f1 3:7f3 2:5f1 2:6f2 2:8f4 | 1:5f1 1:6f2 1:8f4 1:6f2 1:5f1 2:8f4 2:6f2 2:5f1 | 3:7f3 3:5f1 3:7f3 2:5f1 /2 2:6f2`;
const G_TUNE = `/4 2:8f4 /8 3:7f3 2:5f1 /4 2:8f4 /8 2:7f3 2:8f4 | /4 2:5f1 /8 3:7f3 2:5f1 /4 2:8f4 /8 1:5f1 2:8f4 | /4 2:7f3 /8 2:5f1 2:7f3 /4 1:5f1 /8 1:7f3 1:5f1 | /4 2:8f4 /8 1:7f3 1:5f1 /2 2:8f4`;

/**
 * Intermediate, straight after `thirds`: that Step leaves the player on the G,
 * B and top strings and already moves its thirds to keys whose notes have not
 * been named there. The triads Step later asks which note is on top.
 */
export const TOP_STRINGS_KEYS: StepSpec = {
  id: "top-strings-keys",
  title: "The top three strings in other keys",
  goal: "Name and play the notes of G major and of F major on the G, B and top strings, one string at a time and then across all three in fifth position.",
  why: "The walks up each string used the natural notes, and those seven are the notes of C major. Change one of them and you are in another key. G major is C major with F sharp in place of F. F major is C major with B flat in place of B. On each of the top three strings that is one fret moved, except that in F major the open B string itself drops out. Knowing which fret moves lets you name what you play in three keys instead of one.",
  howTo: [
    "G major: G, A, B, C, D, E, F sharp. Only F has moved, one fret up.",
    "F major: F, G, A, B flat, C, D, E. Only B has moved, one fret down, so the open B string is not in this key.",
    "Say each name as you play it. F sharp and B flat are the two notes that tell these keys apart from C.",
  ],
  payoff: "A tune in G over a band, on three strings you can name in G major and in F major.",
  difficultyException:
    "Two of the four lines are one string at a time in quarter notes, slower than the thirds in eighths before them. The demand is the names of two new keys on three strings, which the metric does not count.",
  exercises: [
    {
      id: "g-major-strings",
      title: "G major, one string at a time",
      purpose: "G, A, B, C, D, E, F sharp, G up the G string and back: the walk you know, with F sharp at fret 11 where F was at fret 10.",
      howTo: [
        "Quarter notes, 50 BPM up to a pass at 85.",
        "Open, 2, 4, 5, 7, 9, 11, 12, with the first finger walking, then back down to the open string. B to C is frets 4 to 5, and F sharp to G is frets 11 to 12. The key note, G, is the open string and fret 12.",
        STRING_NOTE,
      ],
      coach: "Right notes and steady quarters after the take. The names are yours to say.",
      vary: {
        values: { stringSet: ["G string", "B string", "top E string"] },
        pooled: ["stringSet"],
        label: (p) => `G major on the ${p.stringSet}`,
        build: (p) => {
          const tab = keyWalk(STRING_OF[p.stringSet], "G");
          return { tab, position: handAt(tab), ...G_WALK_TEXT[p.stringSet] };
        },
      },
      tab: keyWalk(3, "G"),
      position: 2,
      shifts: true,
      harmony: { scale: ["G", "major"], cover: true },
      rungs: ladder(50, 110, 10),
      passAt: 85,
      ...named(0.8),
      selfCheck: [SAY_CHECK],
      minutes: 5,
    },
    {
      id: "f-major-strings",
      title: "F major, one string at a time",
      purpose: "G, A, B flat, C, D, E, F, G up the G string and back: the natural notes again, with B flat at fret 3 where B was at fret 4.",
      howTo: [
        "Quarter notes, 50 BPM up to a pass at 85.",
        "Open, 2, 3, 5, 7, 9, 10, 12, with the first finger walking, then back down to the open string. A to B flat is frets 2 to 3, and E to F is frets 9 to 10. The key note, F, is at fret 10.",
        STRING_NOTE,
      ],
      coach: "Right notes and steady quarters after the take. The names are yours to say.",
      vary: {
        values: { stringSet: ["G string", "B string", "top E string"] },
        pooled: ["stringSet"],
        label: (p) => `F major on the ${p.stringSet}`,
        build: (p) => {
          const tab = keyWalk(STRING_OF[p.stringSet], "F");
          return { tab, position: handAt(tab), ...F_WALK_TEXT[p.stringSet] };
        },
      },
      tab: keyWalk(3, "F"),
      position: 2,
      shifts: true,
      harmony: { scale: ["F", "major"], cover: true },
      rungs: ladder(50, 110, 10),
      passAt: 85,
      ...named(0.8),
      selfCheck: [SAY_CHECK],
      minutes: 5,
    },
    {
      id: "fifth-position-keys",
      title: "Three strings in fifth position",
      purpose: "G major across the G, B and top strings without moving the hand. The line starts on G, goes up to the C on the top string and down to the C an octave lower on the G string, twice, and comes home to G.",
      howTo: [
        "Straight eighths, two to a click, 50 BPM up to a pass at 80.",
        "First finger at fret 5, third finger at fret 7, little finger at fret 8. On the G string, C is fret 5 and D is fret 7. On the B string, E is fret 5, F sharp is fret 7 and G is fret 8. On the top string, A is fret 5, B is fret 7 and C is fret 8.",
        "Start on G, the B string at fret 8. Go up to the C on the top string, down to the C on the G string, up to the top C and down again, then up to G and hold it for two clicks.",
        "F sharp is the only note here that is not a natural note.",
        "On other Takes the key is F major, in the same position.",
      ],
      coach: "Right notes and even eighths after the take. Say the names slowly first, without the click.",
      vary: {
        values: { key: ["G", "F"] },
        pooled: ["key"],
        label: (p) => `${p.key} major`,
        build: (p) =>
          p.key === "G"
            ? { tab: G_POSITION, position: 5, harmony: { scale: ["G", "major"], cover: true } }
            : {
                tab: F_POSITION,
                position: 5,
                harmony: { scale: ["F", "major"], cover: true },
                purpose:
                  "F major across the G, B and top strings without moving the hand. The line starts on F, goes up to the C on the top string and down to the C an octave lower on the G string, twice, and comes home to F.",
                howTo: (base) => [
                  base[0],
                  "First finger at fret 5, second finger at fret 6, third finger at fret 7, little finger at fret 8. On the G string, C is fret 5 and D is fret 7. On the B string, E is fret 5, F is fret 6 and G is fret 8. On the top string, A is fret 5, B flat is fret 6 and C is fret 8.",
                  "Start on F, the B string at fret 6. Go up to the C on the top string, down to the C on the G string, up to the top C and down again, then up to F and hold it for two clicks.",
                  "B flat is the only note here that is not a natural note.",
                  "On other Takes the key is G major, in the same position.",
                ],
              },
      },
      tab: G_POSITION,
      position: 5,
      harmony: { scale: ["G", "major"], cover: true },
      rungs: ladder(50, 110, 10),
      passAt: 80,
      ...named(),
      minutes: 6,
    },
    {
      id: "g-tune",
      title: "A tune in G",
      purpose: "Four bars over G, C, D and G with a band, in the same fifth position. Bar 3 is bar 2 moved up one note of the scale, and that puts F sharp on the first beat of the D chord.",
      howTo: [
        "Quarter notes and straight eighths, 60 BPM up to a pass at 90.",
        "Each bar starts on a quarter note on the B string: G at fret 8, E at fret 5, F sharp at fret 7, and G at fret 8 again. They are the root of G, the third of C, the third of D and the root of G.",
        "First finger at fret 5, third finger at fret 7, little finger at fret 8, as in the Exercise before. The only note on the G string is D at fret 7, once in bar 1 and once in bar 2. The last G is held for two clicks.",
      ],
      coach: "Band on. Right notes and time after the take.",
      tab: G_TUNE,
      position: 5,
      chords: "G | C | D | G",
      jam: ROCK("G"),
      harmony: { scaleOverChords: ["G", "major"] },
      rungs: ladder(60, 110, 10),
      passAt: 90,
      ...named(),
      minutes: 6,
    },
  ],
};
