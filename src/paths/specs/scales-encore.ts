/**
 * Scales and Modes: a second round of consolidation Steps (2026-11-19).
 * Drafts, like the Path they belong to.
 *
 * The Path met each idea once: a key in C, G and D, the relative minor as C
 * major and A minor, harmonic minor in A. Four Steps take them further and
 * join the scale to the chords the other harmony Paths build:
 *
 * - `keys-by-hand` (Beginner): A major and F major by name, the first flat.
 * - `minor-second-key` (Beginner): E minor from G major, D minor from F major.
 * - `chords-from-the-scale` (Intermediate): every other note of the scale is a
 *   chord; the seven chords of a key as single notes, and lines that use them.
 * - `harmonic-minor-again` (Intermediate): E harmonic minor over B7, and one
 *   line over one, four and five that raises the seventh only over the five.
 *
 * Every id is new, so nobody's progress moves. Helpers the Path file also has
 * are copied or come from `triadShapes.ts`, never from the Path: it imports
 * these Steps.
 */
import type { StepSpec, VariantParams } from "../spec";
import { ladder, shiftFrets } from "../templates";
import { ROCK, named } from "./triadShapes";

const SAY_CHECK = "Did you say each note's name, or its number in the scale, as you played it?";

/** One finger to a fret: every note gets the finger its fret has with the first finger at `first`. */
const inPosition = (tab: string, first: number) =>
  tab.replace(/(\d):(\d+)/g, (_all, string, fret) => `${string}:${fret}f${Number(fret) - first + 1}`);

/** The same line one string lower and `frets` higher, keeping fingers: the low four strings are a fourth apart. */
const oneStringDown = (tab: string, frets: number) =>
  tab.replace(/(\d):(\d+)/g, (_all, string, fret) => `${Number(string) + 1}:${Number(fret) + frets}`);

// --- Two more keys ----------------------------------------------------------------

// The movable major shape, second finger on the root: A at the low E string's fret 5.
const A_BY_NAME = inPosition(`/4 6:5 6:7 5:4 5:5 | 5:7 4:4 4:6 4:7 | 4:6 4:4 5:7 5:5 | 5:4 6:7 /2 6:5`, 4);
// One hand at fret 7: C major from the low E string, then F major from the A string.
const C_THEN_F = inPosition(
  `/8 6:8 6:10 5:7 5:8 5:10 4:7 4:9 4:10 | 4:9 4:7 5:10 5:8 5:7 6:10 /4 6:8 | /8 5:8 5:10 4:7 4:8 4:10 3:7 3:9 3:10 | 3:9 3:7 4:10 4:8 4:7 5:10 /4 5:8`,
  7,
);
// Notes one, two, three, four; then five, four and one: the roots of the chords.
const ROOTS_IN_A = inPosition(`/4 6:5 6:7 5:4 5:5 | /4 5:7 5:7 /2 5:7 | /4 5:5 5:5 /2 5:5 | /4 6:5 6:5 /2 6:5`, 4);
const ROOTS_IN_F = inPosition(`/4 5:8 5:10 4:7 4:8 | /4 4:10 4:10 /2 4:10 | /4 4:8 4:8 /2 4:8 | /4 5:8 5:8 /2 5:8`, 7);
const ONE_FIVE_FOUR_TEMPO = "Quarter notes and half notes, 60 BPM up to a pass at 90.";
// Four bars in F at fret 7, from the A string's shape.
const TUNE_IN_F = inPosition(
  `/4 4:10 /8 4:7 4:8 /4 4:10 3:7 | /4 4:8 /8 4:10 3:7 /2 3:10 | /4 3:9 /8 3:10 3:9 /4 3:7 4:10 | /8 4:7 4:8 4:7 5:10 /2 5:8`,
  7,
);

/** Beginner, after "What a key is": two more keys by name, one of them the first flat key. */
export const KEYS_BY_HAND: StepSpec = {
  id: "keys-by-hand",
  title: "Two more keys: A and F",
  goal: "Play A major and F major by name, say which notes each key sharpens or flattens, and find the first, fourth and fifth notes of both under a band.",
  why: "C, G and D are three keys you have named, and A you have met under the band. Two more by name turn the examples into something you can work out for yourself. A major carries on the way G and D went: it keeps their sharps, F# and C#, and adds G#. Each of those keys starts on the fifth note of the one before. F major goes the other way: C is its fifth note. It is the first key with a flat. Its fourth note is one fret above A, and it is called B flat, not A sharp, for one reason: a scale uses every letter once. F, G, A, then a B of some kind, C, D, E. Calling it A sharp would use A twice and leave B out.",
  howTo: [
    "A major is the shape with the second finger on the low E string at fret 5. Its three sharps are C# on the A string's fret 4, and F# and G# on the D string's frets 4 and 6.",
    "Going C, G, D, A, each key keeps the sharps of the one before and adds one. The new sharp is always the seventh note of the new key, one fret below its root: F# under G, C# under D, G# under A.",
    "A flat lowers a note one fret, as a sharp raises it one. B flat is one fret below B: the D string's fret 8, where C major has B at fret 9. A chord chart writes it Bb.",
    "F major is played from the A string here, second finger on fret 8, so that it sits under the same hand as C major from the low E string's fret 8.",
  ],
  payoff: "Five keys you can name, C, G, D, A and F, and a tune in the first flat key.",
  exercises: [
    {
      id: "a-by-name",
      title: "A major by name: three sharps",
      purpose: "The shape with the second finger on A, the low E string's fret 5, slow enough to say every letter. A major keeps the F# and C# of D major and adds G#.",
      howTo: [
        "Quarter notes, one to a click, 50 BPM up to a pass at 80.",
        "Low E string 5 and 7, A string 4, 5 and 7, D string 4, 6 and 7, and back down. Fingers 2 and 4, then 1, 2 and 4, then 1, 3 and 4.",
        "Say A, B, C#, D, E, F#, G#, A on the way up, and the same letters backwards on the way down.",
        "The new sharp, G#, is the D string's fret 6: the seventh note, one fret below the A at fret 7.",
      ],
      coach: "Right notes and steady quarters after the take. The names are yours to say.",
      tab: A_BY_NAME,
      position: 4,
      harmony: { scale: ["A", "major"], cover: true },
      rungs: ladder(50, 110, 10),
      passAt: 80,
      ...named(0.8),
      selfCheck: [SAY_CHECK],
      minutes: 4,
    },
    {
      id: "c-then-f",
      title: "C, then F: no sharps, then one flat",
      purpose: "Two keys under one hand at fret 7. C major, from the low E string, has no sharps and no flats. F major, from the A string, changes one note: B becomes B flat.",
      howTo: [
        "Straight eighths, two to a click, 50 BPM up to a pass at 80.",
        "Bars 1 and 2 are C major: low E string 8 and 10, A string 7, 8 and 10, D string 7, 9 and 10, and back down. The B is the D string's fret 9.",
        "Bars 3 and 4 are F major: A string 8 and 10, D string 7, 8 and 10, G string 7, 9 and 10, and back down. The B flat is the D string's fret 8.",
        "The fingers are the same for both: 2 and 4, then 1, 2 and 4, then 1, 3 and 4. On the D string the two keys differ by one note: C major has B at fret 9 where F major has B flat at fret 8.",
        "At each change of key the second finger hops to the next string at the same fret, fret 8.",
      ],
      coach: "Right notes and even eighths after the take.",
      tab: C_THEN_F,
      position: 7,
      rungs: ladder(50, 110, 10),
      passAt: 80,
      ...named(),
      minutes: 6,
    },
    {
      id: "one-five-four",
      title: "One, five and four under the band",
      purpose: "The first, fifth and fourth notes of the scale, in that order, as single notes over a band, through the chords built on them. A major on one Take, F major on the next.",
      howTo: [
        ONE_FIVE_FOUR_TEMPO,
        "In A, bar 1 counts up from home: A, B, C#, D, the low E string's frets 5 and 7, then the A string's frets 4 and 5. They are notes one, two, three and four.",
        "Bar 2 is note five, E, the A string's fret 7: the chord changes to E as you reach it. Bar 3 steps back down to note four, D, the A string's fret 5. Bar 4 is A again.",
        "The chords are A, E, D and A. Each time the chord changes, the note you are on is the note that chord is named after.",
      ],
      coach: "Band on. Right notes and time after the take.",
      vary: {
        values: { key: ["A", "F"] },
        pooled: ["key"],
        label: (p: VariantParams) => `${p.key} major`,
        build: (p: VariantParams) =>
          p.key === "A"
            ? { tab: ROOTS_IN_A, position: 4, chords: "A | E | D | A", jam: ROCK("A"), harmony: { scaleOverChords: ["A", "major"] as [string, string] } }
            : {
                tab: ROOTS_IN_F,
                position: 7,
                chords: "F | C | Bb | F",
                jam: ROCK("F"),
                harmony: { scaleOverChords: ["F", "major"] as [string, string] },
                purpose:
                  "The first, fifth and fourth notes of the scale, in that order, as single notes over a band, through the chords built on them. This Take is in F major, from the A string.",
                howTo: [
                  ONE_FIVE_FOUR_TEMPO,
                  "In F, bar 1 counts up from home: F, G, A, B flat, the A string's frets 8 and 10, then the D string's frets 7 and 8. They are notes one, two, three and four.",
                  "Bar 2 is note five, C, the D string's fret 10: the chord changes to C as you reach it. Bar 3 steps back down to note four, B flat, the D string's fret 8. Bar 4 is F again.",
                  "The chords are F, C, B flat and F. Each time the chord changes, the note you are on is the note that chord is named after.",
                ],
              },
      },
      tab: ROOTS_IN_A,
      position: 4,
      chords: "A | E | D | A",
      jam: ROCK("A"),
      harmony: { scaleOverChords: ["A", "major"] },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(0.8),
      minutes: 5,
    },
    {
      id: "tune-in-f",
      title: "A tune in F over F, B flat and C",
      purpose: "A four-bar tune in F major over a band. Each bar starts on a note of its chord: C over F, B flat over the B flat chord, E over C, and A on the way home to F.",
      howTo: [
        "Quarters, eighths and half notes, 60 BPM up to a pass at 90.",
        "All of it sits at fret 7 on the A, D and G strings. Bar 2 starts on B flat, the D string's fret 8, and climbs to a long F, the G string's fret 10.",
        "Bar 3 starts on E, the G string's fret 9, and bar 4 ends on a long F, the A string's fret 8.",
        "B flat is in bars 1, 2 and 4, always the D string's fret 8 under the second finger.",
      ],
      coach: "Band on. Right notes and time after the take.",
      tab: TUNE_IN_F,
      position: 7,
      chords: "F | Bb | C | F",
      jam: ROCK("F"),
      harmony: { scaleOverChords: ["F", "major"] },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(),
      minutes: 6,
    },
  ],
};

// --- The relative minor in other keys ------------------------------------------------

// The natural minor shape from the A string, first finger on the root: E minor at fret 7.
const E_MINOR_UP_BACK = `/8 5:7 5:9 5:10 4:7 4:9 4:10 3:7 3:9 | 3:7 4:10 4:9 4:7 5:10 5:9`;
// G, F#, E down the A string, then E minor up, and back as far as A: the loop finishes the descent.
const DOWN_TO_E = inPosition(`/4 5:10 5:9 /2 5:7 | /4 5:7 5:9 5:10 4:7 | 4:9 4:10 3:7 3:9 | 3:7 4:10 4:9 4:7`, 7);
// G major from the A string's fret 10, then E minor from fret 7 on the same string.
const G_THEN_E_MINOR = `${inPosition(`/8 5:10 5:12 4:9 4:10 4:12 3:9 3:11 3:12 | 3:11 3:9 4:12 4:10 4:9 5:12 /4 5:10`, 9)} | ${inPosition(`${E_MINOR_UP_BACK} /4 5:7`, 7)}`;
// D minor from the A string's fret 5, then F major from fret 8.
const D_MINOR_THEN_F = `${inPosition(shiftFrets(`${E_MINOR_UP_BACK} /4 5:7`, -2), 5)} | ${inPosition(`/8 5:8 5:10 4:7 4:8 4:10 3:7 3:9 3:10 | 3:9 3:7 4:10 4:8 4:7 5:10 /4 5:8`, 7)}`;
const E_MINOR_TUNE = inPosition(
  `/4 4:9 /8 4:7 5:10 /4 5:7 5:10 | /4 4:7 /8 4:9 4:10 /2 3:9 | /4 3:7 /8 4:10 4:9 /4 4:7 5:9 | /8 5:10 4:7 5:10 5:9 /2 5:7`,
  7,
);

/** Beginner, after the relative minor: the same idea in G and in F, found on the neck. */
export const MINOR_SECOND_KEY: StepSpec = {
  id: "minor-second-key",
  title: "The relative minor in other keys",
  goal: "Find the relative minor of G major and of F major on the neck, play E minor and D minor from the A string, and play a tune in E minor over a band.",
  why: "A minor came out of C major: the same seven notes with the sixth note as home. Every major key has a relative minor found the same way. G major from its sixth note is E minor, and it keeps G major's one sharp, F#. F major from its sixth note is D minor, and it keeps F major's one flat, B flat. On the neck there is a shortcut that works in every key: the minor root is three frets below the major root on the same string. (On the next lower string it is two frets above, on the low four strings, which is where you found A minor before.)",
  howTo: [
    "From the major root, step down the string two scale notes: one fret, then two. From G at the A string's fret 10 that is F# at fret 9 and E at fret 7. You know both ends of this already: C major starts on the low E string's fret 8 and A minor on fret 5, three frets below it.",
    "The minor shape works from the A string as it does from the low E string, first finger on the root. For E minor that is frets 7, 9 and 10 on the A and D strings and frets 7 and 9 on the G string.",
    "It goes the other way too: from a minor root, the major key with the same notes is three frets up the string.",
  ],
  payoff: "Two more minor keys, E minor and D minor, each found from the major key it shares its notes with, and a minor tune over a band.",
  difficultyException:
    "The relative minor again in two more keys, at the pace of the Step before. Its first Exercise is slow on purpose: quarter notes, to find the minor root on one string and say the names.",
  exercises: [
    {
      id: "three-frets-down",
      title: "From G down to E minor",
      purpose: "The root of G major, two scale notes down the string to its sixth note, E, and then the same seven notes with E as home: E minor, said by name.",
      howTo: [
        "Quarter notes, one to a click, 50 BPM up to a pass at 80; bar 1 ends on a half note.",
        "Bar 1 is on the A string: G at fret 10, F# at fret 9, then a long E at fret 7. Fingers 4, 3 and 1: the hand is already where E minor is played.",
        "Bars 2 and 3 climb E minor: A string 7, 9 and 10, D string 7, 9 and 10, G string 7 and 9. Say E, F#, G, A, B, C, D, E.",
        "Bar 4 comes back down as far as A, the D string's fret 7. When the line goes round, bar 1 finishes the descent: G, F#, E.",
      ],
      coach: "Right notes and steady quarters after the take. The names are yours to say.",
      tab: DOWN_TO_E,
      position: 7,
      harmony: { scale: ["E", "naturalMinor"], cover: true },
      rungs: ladder(50, 110, 10),
      passAt: 80,
      ...named(0.8),
      selfCheck: [SAY_CHECK],
      minutes: 4,
    },
    {
      id: "g-and-e-minor",
      title: "G major, then E minor: one sharp",
      purpose: "G major up and back from the A string's fret 10, then E minor up and back from fret 7 on the same string. The same seven notes, with F# in both, and they do not sound alike.",
      howTo: [
        "Straight eighths, two to a click, 50 BPM up to a pass at 80.",
        "Bars 1 and 2 are G major with the first finger at fret 9: A string 10 and 12, D string 9, 10 and 12, G string 9, 11 and 12, and back down.",
        "Bars 3 and 4 are E minor with the first finger at fret 7: A string 7, 9 and 10, D string 7, 9 and 10, G string 7 and 9, and back down.",
        "Hold the long G, then move the hand down two frets as it ends. After the long E the hand goes back up for the repeat.",
        "The F# is the G string's fret 11 in G major and the A string's fret 9 in E minor.",
      ],
      coach: "Right notes and even eighths after the take. Which half sounded finished to you, and on which note?",
      tab: G_THEN_E_MINOR,
      position: 9,
      shifts: true,
      harmony: { scale: ["G", "major"], cover: true },
      rungs: ladder(50, 110, 10),
      passAt: 80,
      ...named(),
      minutes: 6,
    },
    {
      id: "d-minor-and-f",
      title: "D minor, then F major: one flat",
      purpose: "The other way round: D minor up and back from the A string's fret 5, then F major up and back from fret 8, three frets higher on the same string. Both have B flat and no other flat or sharp.",
      howTo: [
        "Straight eighths, 50 BPM up to a pass at 80.",
        "Bars 1 and 2 are D minor with the first finger at fret 5: A string 5, 7 and 8, D string 5, 7 and 8, G string 5 and 7, and back down.",
        "Bars 3 and 4 are F major with the first finger at fret 7: A string 8 and 10, D string 7, 8 and 10, G string 7, 9 and 10, and back down.",
        "Hold the long D, then move the hand up two frets as it ends. After the long F the hand goes back down for the repeat.",
        "The B flat is the D string's fret 8 in both halves: under the fourth finger in D minor and under the second in F major.",
      ],
      coach: "Right notes and even eighths after the take.",
      tab: D_MINOR_THEN_F,
      position: 5,
      shifts: true,
      harmony: { scale: ["D", "naturalMinor"], cover: true },
      rungs: ladder(50, 110, 10),
      passAt: 80,
      ...named(),
      minutes: 6,
    },
    {
      id: "e-minor-tune",
      title: "A melody over Em, Am and Bm",
      purpose: "A four-bar tune in E minor over a band, starting each bar on a note of its chord: B, then A, then D, and G on the way home to E.",
      howTo: [
        "Quarters, eighths and half notes, 60 BPM up to a pass at 90.",
        "All of it sits in the minor shape at fret 7 on the A, D and G strings. Bar 2 climbs to a long E, the G string's fret 9, and bar 4 ends on a long E an octave lower, the A string's fret 7.",
        "The F# is the A string's fret 9, in bars 3 and 4.",
        "The chords stand on notes one, four and five of E minor: E, A and B.",
      ],
      coach: "Band on. Right notes and time after the take.",
      tab: E_MINOR_TUNE,
      position: 7,
      chords: "Em | Am | Bm | Em",
      jam: ROCK("E minor"),
      harmony: { scaleOverChords: ["E", "naturalMinor"] },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(),
      minutes: 6,
    },
  ],
};

// --- Chords from the scale -------------------------------------------------------------

// Root, third, fifth from each note of C major, in the shape at fret 7: two eighths and a quarter each.
const SEVEN_IN_C = inPosition(
  `/8 6:8 5:7 /4 5:10 /8 6:10 5:8 /4 4:7 | /8 5:7 5:10 /4 4:9 /8 5:8 4:7 /4 4:10 | /8 5:10 4:9 /4 3:7 /8 4:7 4:10 /4 3:9 | /8 4:9 3:7 /4 3:10 /8 4:10 3:9 /4 2:8`,
  7,
);
/** Each key the walk is played in: frets from C, and the scale's letters. */
const SEVEN_KEYS: Readonly<Record<string, { by: number; letters: readonly string[] }>> = {
  C: { by: 0, letters: ["C", "D", "E", "F", "G", "A", "B"] },
  D: { by: 2, letters: ["D", "E", "F#", "G", "A", "B", "C#"] },
  A: { by: -3, letters: ["A", "B", "C#", "D", "E", "F#", "G#"] },
};
const QUALITIES = ["", " minor", " minor", "", "", " minor", " diminished"] as const;
const SEVEN_TEMPO = "Two eighths and a quarter note for each chord, two chords to a bar, 50 BPM up to a pass at 80.";

/** The walk's words for one key, made from that key's own letters and frets. */
function sevenChords(key: string): { purpose: string; howTo: string[] } {
  const { by, letters } = SEVEN_KEYS[key];
  const triad = (from: number) => [0, 2, 4].map((step) => letters[(from + step) % 7]).join(", ");
  const names = letters.map((letter, index) => `${letter}${QUALITIES[index]}`);
  return {
    purpose: `${key} major's seven chords as single notes, one after another up the scale: root, third and fifth from each note. ${
      key === "C" ? "A different key comes round on each Take." : "The fingers are the same in every key, and so is the order of major and minor."
    }`,
    howTo: [
      SEVEN_TEMPO,
      `The notes: ${letters.map((_letter, index) => triad(index)).join("; ")}; then ${triad(0)} again an octave higher. Each group starts one scale note above the last.`,
      `Every note is in the ${key} major shape with the first finger at fret ${7 + by}, one finger to a fret. The line starts on the low E string's fret ${8 + by} and ends on the B string's fret ${8 + by}.`,
      "After most long notes the same finger plays the next root: same fret, one string lower. Hop it across, or roll the fingertip over, and let the long note be a little short. When the line goes round, the second finger drops from the B string to the low E string at the same fret.",
      `Say the names on the long notes: ${names.join(", ")}, ${key}.`,
    ],
  };
}

// The same seven chords counted from A, with the first finger at fret 2, ending on a long A.
const SEVEN_FROM_A = inPosition(
  `/8 6:5 5:3 /4 4:2 /8 5:2 5:5 /4 4:3 | /8 5:3 4:2 /4 4:5 /8 5:5 4:3 /4 3:2 | /8 4:2 4:5 /4 3:4 /8 4:3 3:2 /4 3:5 | /8 4:5 3:4 /4 2:3 /2 3:2`,
  2,
);
// Root, third, fifth of each chord, then down the scale to the next root.
const CHORD_THEN_WALK = inPosition(
  `/4 6:8 5:7 5:10 /8 4:7 5:10 | /4 5:8 4:7 4:10 /8 4:9 4:7 | /4 5:10 4:9 3:7 /8 3:9 3:7 | /4 4:10 3:9 /2 2:8`,
  7,
);
const LANDING_TUNE = inPosition(
  `/4 3:9 /8 3:7 4:10 /4 3:9 2:8 | /4 2:10 /8 2:8 3:9 /2 4:10 | /4 3:10 /8 3:9 3:7 /4 4:10 4:7 | /8 4:9 4:7 4:9 4:10 /2 3:7`,
  7,
);

/** Intermediate, before harmonic minor: the scale turned into the chords of its key. */
export const CHORDS_FROM_THE_SCALE: StepSpec = {
  id: "chords-from-the-scale",
  title: "Chords from the scale",
  goal: "Build the seven chords of a key by taking every other note of its scale, play them as single notes in C major and from A, and play two lines over a band that follow them.",
  why: "A chord is not a separate thing to learn beside a scale. Start on any note of the scale, skip one, play the next, skip one, play the next: those three notes are a chord. Do it from each of the seven notes and you have the seven chords of the key. In C major they are C, D minor, E minor, F, G, A minor and B diminished. Playing the movable shape in thirds, in the Beginner Level, was the first two notes of each chord without the names. It is why a band's chords and your scale agree, and why a note of the chord sounds at home while that chord is playing. A three-note chord like these is called a triad. This Step is a first look: Triads puts them under the hand, and Chords in a Key puts the seven of them into songs.",
  howTo: [
    "The three notes have names. The one the chord starts from is its root, the next is its third and the last is its fifth: they are the first, third and fifth notes counting up the scale from the root.",
    "Some of the chords come out major and some minor, because the steps of the scale are not all the same size. Counted along one string, a major chord's third is four frets above its root and a minor chord's is three. In every major key the order is the same: major, minor, minor, major, major, minor, diminished.",
    "The chord on the seventh note is the odd one: its third and its fifth are each one fret lower than a major chord's, and it is called diminished. Play it, hear that it does not rest, and move on.",
    "Say each chord's name on its long note. The small m you have seen in the charts means minor: Dm is D minor.",
  ],
  payoff: "The seven chords of a key under one hand, the same seven counted from A, and two lines over a band made from the notes of its chords.",
  exercises: [
    {
      id: "seven-chords",
      title: "The seven chords of a key",
      purpose: sevenChords("C").purpose,
      howTo: sevenChords("C").howTo,
      coach: "Right notes and time after the take. The names are yours to say.",
      vary: {
        values: { key: Object.keys(SEVEN_KEYS) },
        pooled: ["key"],
        label: (p: VariantParams) => `${p.key} major`,
        build: (p: VariantParams) => ({
          tab: shiftFrets(SEVEN_IN_C, SEVEN_KEYS[p.key].by),
          position: 7 + SEVEN_KEYS[p.key].by,
          harmony: { scale: [p.key, "major"] as [string, string], cover: true },
          ...(p.key === "C" ? {} : sevenChords(p.key)),
        }),
      },
      tab: SEVEN_IN_C,
      position: 7,
      harmony: { scale: ["C", "major"], cover: true },
      rungs: ladder(50, 110, 10),
      passAt: 80,
      ...named(),
      minutes: 6,
    },
    {
      id: "seven-chords-from-a",
      title: "The same seven chords from A",
      purpose: "A minor has the notes of C major, so it has the same seven chords. Counted from A they come in a new order: A minor, B diminished, C, D minor, E minor, F, G.",
      howTo: [
        "Two eighths and a quarter note for each chord, two chords to a bar, 50 BPM up to a pass at 80; the last note is a half note.",
        "The notes: A, C, E; B, D, F; C, E, G; D, F, A; E, G, B; F, A, C; G, B, D; then a long A.",
        "The first finger is at fret 2 and each finger keeps its own fret. The line starts with the fourth finger on the low E string's fret 5 and ends with the first finger on the G string's fret 2. Most new roots are under the finger that just played the long note, same fret, one string lower.",
        "The fifth chord, E minor, is E, G and B: the D string's frets 2 and 5, then the G string's fret 4. The next Step raises that G to G#, which makes the chord E major.",
      ],
      coach: "Right notes and time after the take. The names are yours to say.",
      tab: SEVEN_FROM_A,
      position: 2,
      harmony: { scale: ["A", "naturalMinor"], cover: true },
      rungs: ladder(50, 110, 10),
      passAt: 80,
      ...named(),
      minutes: 6,
    },
    {
      id: "chord-then-walk",
      title: "Chord notes, then a walk to the next root",
      purpose: "Four bars over C, F, G and C with a band. Each of the first three bars plays its chord's root, third and fifth, then walks down the scale into the root of the next chord.",
      howTo: [
        "Three quarter notes and two eighths in each of the first three bars, 60 BPM up to a pass at 90; bar 4 ends on a half note.",
        "Bar 1: C, E, G, then A, G and into F. Bar 2: F, A, C, then B, A and into G. Bar 3: G, B, D, then E, D and into C.",
        "Bar 4 is the C chord from that higher C: the D string's fret 10, the G string's fret 9 and a long G on the B string's fret 8.",
        "It starts on the low E string's fret 8, in the shape at fret 7. On beats 1, 2 and 3 you are playing the chord of the bar, one note at a time.",
      ],
      coach: "Band on. Right notes and time after the take.",
      tab: CHORD_THEN_WALK,
      position: 7,
      chords: "C | F | G | C",
      jam: ROCK("C"),
      harmony: { scaleOverChords: ["C", "major"] },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(),
      minutes: 6,
    },
    {
      id: "landing-tune",
      title: "A tune that lands on chord notes",
      purpose: "A four-bar tune over C, A minor, F and G with a band. It is a tune, not a run of chord notes, and it still starts every bar on a note of that bar's chord.",
      howTo: [
        "Quarters, eighths and half notes, 60 BPM up to a pass at 90.",
        "Bar 1 starts on E, the third of C. Bar 2 starts on A, the root of A minor, and ends on a long C, its third.",
        "Bar 3 starts on F, the root of F, and ends on A, its third. Bar 4 starts on B, the third of G, and ends on a long D, its fifth.",
        "It sits in the shape at fret 7 on the D, G and B strings, and starts with the third finger on the G string's fret 9.",
      ],
      coach: "Band on. Right notes and time after the take.",
      tab: LANDING_TUNE,
      position: 7,
      chords: "C | Am | F | G",
      jam: ROCK("C"),
      harmony: { scaleOverChords: ["C", "major"] },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(),
      minutes: 6,
    },
  ],
};

// --- Harmonic minor in a second key ------------------------------------------------------

// E harmonic minor from the A string: the minor shape with D# at the G string's fret 8.
const E_HARMONIC_UP_BACK = `/8 5:7 5:9 5:10 4:7 4:9 4:10 3:8 3:9 | 3:8 4:10 4:9 4:7 5:10 5:9`;
const E_HARMONIC_SHAPE = `${inPosition(E_HARMONIC_UP_BACK, 7)} hold`;
const E_NATURAL_THEN_HARMONIC = `${inPosition(E_MINOR_UP_BACK, 7)} hold | ${inPosition(E_HARMONIC_UP_BACK, 7)} hold`;
const HARMONIC_TEMPO = "Straight eighths, two to a click, 50 BPM up to a pass at 80.";
const E_HARMONIC_PHRASE = inPosition(
  `/8 5:7 5:10 4:9 4:7 /2 5:10 | /8 4:9 4:7 5:9 4:7 /2 3:8 | /8 3:9 4:10 4:9 4:7 /2 5:10 | /8 5:9 4:7 4:10 4:9 /2 3:8`,
  7,
);
// Eight bars over one, four and five of E minor: D over Em and Am, D# only over B7.
const E_MINOR_145 = inPosition(
  `/8 5:7 5:9 5:10 4:7 /4 4:9 5:10 | /8 4:7 4:9 4:10 3:7 /4 3:9 4:10 | /8 4:9 3:7 3:9 3:7 /4 4:9 5:10 | /8 5:9 4:7 4:9 4:10 /2 3:8 | /8 3:9 3:7 4:9 4:7 /4 5:10 5:7 | /8 4:10 4:9 4:7 5:10 /4 4:7 4:10 | /8 4:9 4:7 5:9 4:7 /4 4:9 3:8 | /4 3:9 /8 4:9 5:10 /2 5:7`,
  7,
);
const MINOR_145_TEMPO = "Eighths, quarters and half notes, 60 BPM up to a pass at 90.";

/** Intermediate, after harmonic minor: the raised seventh in E minor, and kept to the chord that asks for it. */
export const HARMONIC_MINOR_AGAIN: StepSpec = {
  id: "harmonic-minor-again",
  title: "Harmonic minor in a second key",
  goal: "Play E harmonic minor from the A string, use its D# over B7, and play a line over the three main chords of a minor key that raises the seventh only over the fifth chord.",
  why: "The raised seventh is not a fact about A minor. In any minor key the chord on the fifth note comes out minor when you build it from the scale, and raising the scale's seventh note one fret turns that chord major and gives it a pull back home. In E minor the seventh note is D and the fifth chord is built on B: raise D to D# and the B chord turns from minor to major, because D# is its third. That is why the chord is B7 here where the tune in E minor had B minor. The 7 in B7 is one more scale note, A, stacked on top of the chord. The note that matters here is the D#. The raised note belongs to that one chord. Over the other chords of the key, the plain minor scale is still the one that fits.",
  howTo: [
    "Take the E minor shape from the A string, first finger at fret 7, and raise the seventh note one fret: on the G string, fret 7 becomes fret 8.",
    "The raised seventh is always one fret below the root. D# at the G string's fret 8 sits under E at fret 9.",
    "Play D# over B7 and E over Em. Over Em and Am, when you want the seventh note, play D.",
  ],
  payoff: "E minor with both of its sevenths, and eight bars over Em, Am and B7 where one note follows the chord.",
  exercises: [
    {
      id: "e-harmonic-shape",
      title: "The raised seventh from the A string",
      purpose: "E harmonic minor, one octave up and back: the minor shape from the A string with D# at the G string's fret 8. E minor on one Take, D minor on the next.",
      howTo: [
        HARMONIC_TEMPO,
        "A string 7, 9 and 10; D string 7, 9 and 10; G string 8 and 9. The second finger takes fret 8 and the third takes fret 9.",
        "From C on the D string's fret 10 to D# on the G string's fret 8 is three frets' distance, counted along one string: the widest step in the scale.",
      ],
      coach: "Right notes and even eighths after the take. The raised seventh is the note to listen for.",
      vary: {
        values: { key: ["E", "D"] },
        pooled: ["key"],
        label: (p: VariantParams) => `${p.key} harmonic minor`,
        build: (p: VariantParams) =>
          p.key === "E"
            ? { tab: E_HARMONIC_SHAPE, position: 7, harmony: { scale: ["E", "harmonicMinor"] as [string, string], cover: true } }
            : {
                tab: shiftFrets(E_HARMONIC_SHAPE, -2),
                position: 5,
                harmony: { scale: ["D", "harmonicMinor"] as [string, string], cover: true },
                purpose:
                  "D harmonic minor, one octave up and back: the minor shape from the A string with C# at the G string's fret 6. It is the same shape as E harmonic minor, two frets lower.",
                howTo: [
                  HARMONIC_TEMPO,
                  "A string 5, 7 and 8; D string 5, 7 and 8; G string 6 and 7. The second finger takes fret 6 and the third takes fret 7.",
                  "From B flat on the D string's fret 8 to C# on the G string's fret 6 is three frets' distance, counted along one string: the widest step in the scale.",
                ],
              },
      },
      tab: E_HARMONIC_SHAPE,
      position: 7,
      harmony: { scale: ["E", "harmonicMinor"], cover: true },
      rungs: ladder(50, 110, 10),
      passAt: 80,
      ...named(),
      minutes: 5,
    },
    {
      id: "e-natural-then-harmonic",
      title: "E minor: natural, then harmonic",
      purpose: "The E minor shape up and back with D, then up and back with D#. One fret apart, and only the second one pulls toward E.",
      howTo: [
        "Straight eighths, 50 BPM up to a pass at 80.",
        "Bars 1 and 2: G string 7 and 9. Bars 3 and 4: G string 8 and 9. Everything else is the same: A string 7, 9 and 10, D string 7, 9 and 10.",
        "The first finger plays the D at fret 7 and the second finger plays the D# at fret 8.",
      ],
      coach: "Right notes and even eighths after the take.",
      tab: E_NATURAL_THEN_HARMONIC,
      position: 7,
      rungs: ladder(50, 110, 10),
      passAt: 80,
      ...named(),
      minutes: 5,
    },
    {
      id: "d-sharp-over-b7",
      title: "D# over B7, E over Em",
      purpose: "Four bars over Em and B7 with a band. The Em bars come to rest; the B7 bars end on D# and want to move.",
      howTo: [
        "Eighths and half notes, 60 BPM up to a pass at 90.",
        "Bars 1 and 3 are over Em, and each ends on a long G, the A string's fret 10. Bars 2 and 4 are over B7, and each ends on a long D#, the G string's fret 8.",
        "Bar 3 starts on E, the G string's fret 9: one fret above the D# that bar 2 was holding. All of it stays in the shape at fret 7.",
      ],
      coach: "Band on. Right notes and time after the take.",
      tab: E_HARMONIC_PHRASE,
      position: 7,
      chords: "Em | B7 | Em | B7",
      jam: ROCK("E minor"),
      harmony: { scaleOverChords: ["E", "harmonicMinor"] },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(),
      minutes: 6,
    },
    {
      id: "minor-one-four-five",
      title: "Eight bars over one, four and five",
      purpose: "A longer line over the three main chords of E minor, with a band. Over Em and Am it uses D, the plain seventh. Over B7, and only there, it uses D#. E minor on one Take, A minor on the next.",
      howTo: [
        MINOR_145_TEMPO,
        "The chords are Em, Am, Em, B7, then Em, Am, B7, Em. The D, the G string's fret 7, is in bars 2, 3 and 5. The D#, fret 8, is in bars 4 and 7.",
        "Bar 4 climbs to a long D#. Bar 5 answers with E, then D on the way down, with only the E between the two sevenths.",
        "All of it stays in the shape at fret 7 on the A, D and G strings, and it ends on a long E, the A string's fret 7.",
      ],
      coach: "Band on. Right notes and time after the take.",
      vary: {
        values: { key: ["E", "A"] },
        pooled: ["key"],
        label: (p: VariantParams) => `${p.key} minor`,
        build: (p: VariantParams) =>
          p.key === "E"
            ? {
                tab: E_MINOR_145,
                position: 7,
                chords: "Em | Am | Em | B7 | Em | Am | B7 | Em",
                jam: ROCK("E minor"),
                harmony: { scaleOverChords: ["E", "naturalMinor"] as [string, string], allowed: ["D#"] },
              }
            : {
                tab: oneStringDown(E_MINOR_145, -2),
                position: 5,
                chords: "Am | Dm | Am | E7 | Am | Dm | E7 | Am",
                jam: ROCK("A minor"),
                harmony: { scaleOverChords: ["A", "naturalMinor"] as [string, string], allowed: ["G#"] },
                purpose:
                  "A longer line over the three main chords of A minor, with a band. Over Am and Dm it uses G, the plain seventh. Over E7, and only there, it uses G#.",
                howTo: [
                  MINOR_145_TEMPO,
                  "The chords are Am, Dm, Am, E7, then Am, Dm, E7, Am. The G, the D string's fret 5, is in bars 2, 3 and 5. The G#, fret 6, is in bars 4 and 7.",
                  "Bar 4 climbs to a long G#. Bar 5 answers with A, then G on the way down, with only the A between the two sevenths.",
                  "All of it stays in the shape at fret 5 on the low E, A and D strings, and it ends on a long A, the low E string's fret 5.",
                ],
              },
      },
      tab: E_MINOR_145,
      position: 7,
      chords: "Em | Am | Em | B7 | Em | Am | B7 | Em",
      jam: ROCK("E minor"),
      harmony: { scaleOverChords: ["E", "naturalMinor"], allowed: ["D#"] },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(),
      minutes: 8,
    },
  ],
};
