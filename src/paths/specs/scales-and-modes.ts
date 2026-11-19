/**
 * Scales and Modes, a Theory Path. A draft: no teacher or guitarist has
 * reviewed it.
 *
 * The major scale as a formula and as a shape, its relative minor, sequences
 * through it, harmonic minor, and then the two modes a rock or blues player
 * meets first: Dorian and Mixolydian, each as one changed note heard over a
 * band. Written lines, graded on right notes first.
 */
import { definePath } from "../spec";
import type { ExerciseSpec, VariantParams } from "../spec";
import type { PassBar } from "../format";
import type { FretCell, Sequence } from "../templates";
import { handAt, ladder, moveChart, oneStringClimb, sequenced, shiftFrets } from "../templates";

type Grading = Pick<ExerciseSpec, "grade" | "alsoGraded" | "pass">;

/** Written single-note lines: right notes first, then notes heard, extras and a timing bar. */
function named(evenness = 0.75, overBars = 4): Grading {
  const bars: PassBar[] = [
    { metric: "noteIdentity", min: 0.9, overBars },
    { metric: "notesHeard", min: 0.9, overBars },
    { metric: "extraNotes", max: 4, overBars: 4 },
    { metric: "timingEvenness", min: evenness, overBars },
  ];
  return { grade: "written", alsoGraded: ["timingEvenness"], pass: bars };
}

const YOUR_TURN = { grade: "selfChecked", example: true } as const;
const NOT_CHECKED_YET =
  "Your turn, and not checked yet: the app can't judge notes you choose, so you tick it off yourself.";
const SAY_CHECK = "Did you say each note's name, or its number in the scale, as you played it?";

const ROCK = (key: string) => ({ groove: "rock8", key });

/** Semitones from the key each shape is written in. */
const FROM_A: Readonly<Record<string, number>> = { A: 0, B: 2, C: 3, D: 5, E: 7 };

function inKeys(tab: string, shifts: Readonly<Record<string, number>>, scale: string, keys = Object.keys(shifts), at?: number) {
  return {
    values: { key: keys },
    pooled: ["key"] as const,
    label: (p: VariantParams) => `${p.key} ${scale === "major" ? "major" : scale === "naturalMinor" ? "minor" : scale}`,
    build: (p: VariantParams) => {
      const moved = shiftFrets(tab, shifts[p.key]);
      return { tab: moved, position: at === undefined ? handAt(moved) : at + shifts[p.key], harmony: { scale: [p.key, scale] as [string, string] } };
    },
  };
}

const cell = (text: string): FretCell[] =>
  text.split(" ").map((t) => {
    const [string, fret] = t.split(":").map(Number);
    return { string, fret };
  });
const tab = (cells: readonly FretCell[]) => cells.map((c) => `${c.string}:${c.fret}`).join(" ");
const seq = (cells: readonly FretCell[], sequence: Sequence) => tab(sequenced(cells, sequence));

// --- The major scale ---------------------------------------------------------

const C_OPEN = `/4 5:3 4:0 4:2 4:3 | 3:0 3:2 2:0 2:1 | 2:0 3:2 3:0 4:3 | 4:2 4:0 /2 5:3`;
const G_OPEN = `/4 6:3 5:0 5:2 5:3 | 4:0 4:2 4:4 3:0 | 4:4 4:2 4:0 5:3 | 5:2 5:0 /2 6:3`;
const ODE = `/4 1:0 1:0 1:1 1:3 | 1:3 1:1 1:0 2:3 | 2:1 2:1 2:3 1:0 | /4. 1:0 /8 2:3 /2 2:3`;

/** Whole, whole, half, whole, whole, whole, half, walked up one string with the first finger. */
function formula(string: number, from: number): string {
  const frets = [0, 2, 4, 5, 7, 9, 11, 12].map((step) => from + step);
  const tok = (fret: number) => (fret === 0 ? `${string}:0` : `${string}:${fret}f1`);
  const up = frets.map(tok);
  const down = [...frets].reverse().slice(1, -1).map(tok);
  return `/4 ${up.slice(0, 4).join(" ")} | ${up.slice(4).join(" ")} | ${down.slice(0, 4).join(" ")} | ${down.slice(4).join(" ")} /2 ${tok(from)}`;
}

// The movable major shape, root under the second finger on the low E string: A major at fret 4.
const MAJOR_OCTAVE = cell("6:5 6:7 5:4 5:5 5:7 4:4 4:6 4:7");
const MAJOR_TWO = cell("6:5 6:7 5:4 5:5 5:7 4:4 4:6 4:7 3:4 3:6 2:5 2:7 1:4 1:5");
const MAJOR_ONE = `/8 ${seq(MAJOR_OCTAVE, "updown")} hold`;
const MAJOR_BOTH = `/8 ${seq(MAJOR_TWO, "updown")} hold`;
const MAJOR_THIRDS = `/8 6:5 5:4 6:7 5:5 5:4 5:7 5:5 4:4 | 5:7 4:6 4:4 4:7 /4 4:6 4:7`;
const MAJOR_TUNE = `/4 4:7 /8 4:6 4:4 /4 5:7 5:4 | /4 5:5 /8 5:7 4:4 /2 4:7 | /4 4:6 /8 4:4 5:7 /4 5:5 5:4 | /8 5:7 4:4 4:6 4:4 /2 6:5`;

// --- The relative minor ------------------------------------------------------

// The movable natural minor shape, root under the first finger: A minor at fret 5.
const MINOR_OCTAVE = cell("6:5 6:7 6:8 5:5 5:7 5:8 4:5 4:7");
const MINOR_ONE = `/8 ${seq(MINOR_OCTAVE, "updown")} hold`;
const TWO_HOMES = `/8 5:3 5:5 4:2 4:3 4:5 3:2 3:4 3:5 | 3:4 3:2 4:5 4:3 4:2 5:5 /4 5:3 | /8 6:5 6:7 6:8 5:5 5:7 5:8 4:5 4:7 | 4:5 5:8 5:7 5:5 6:8 6:7 /4 6:5`;
const MINOR_TUNE = `/4 4:7 /8 4:5 5:8 /4 5:7 5:5 | /4 5:5 /8 5:7 5:8 /2 4:7 | /4 5:7 /8 5:8 4:5 /4 4:7 5:7 | /8 5:7 5:8 5:7 5:5 /2 6:5`;

// --- Sequences ---------------------------------------------------------------

const MINOR_TEN = cell("6:5 6:7 6:8 5:5 5:7 5:8 4:5 4:7 3:4 3:5");
const THREES = `/8t ${seq(MINOR_OCTAVE, "threesUp")} hold`;
const FOURS = `/8 ${seq(MINOR_OCTAVE, "foursUp")} hold`;
const THIRDS_UP = `/8 6:5 6:8 6:7 5:5 6:8 5:7 5:5 5:8 | 5:7 4:5 5:8 4:7 /4 4:5 4:7`;
const THREES_DOWN = `/8t ${seq(MINOR_TEN, "threesDown")} hold`;

// --- Along the neck, and harmonic minor ---------------------------------------

const TWO_POSITIONS = `/8 5:3f2 5:5f4 4:2f1 4:3f2 4:5f4 3:2f1 3:4f3 3:5f4 | 3:5f1 3:7f3 2:5f1 2:6f2 2:8f4 1:5f1 1:7f3 1:8f4 | 1:8f4 1:7f3 1:5f1 2:8f4 2:6f2 2:5f1 3:7f3 3:5f1 | 3:5f4 3:4f3 3:2f1 4:5f4 4:3f2 4:2f1 /4 5:3f2`;
const C_THREE_NPS = cell("6:8 6:10 6:12 5:8 5:10 5:12 4:9 4:10 4:12 3:9 3:10 3:12");
const THREE_NPS = `/8t ${tab(C_THREE_NPS)} | ${tab([...C_THREE_NPS].reverse())}`;
const HARMONIC_SHAPE = `/8 6:5 6:7 6:8 5:5 5:7 5:8 4:6 4:7 | 4:6 5:8 5:7 5:5 6:8 6:7 hold`;
const HARMONIC_LICK = `/8 4:7 5:8 5:7 5:5 /2 5:7 | /8 4:6 4:7 5:7 4:6 /2 5:7 | /8 4:7 5:8 5:7 5:5 /2 6:8 | /8 5:7 4:6 5:7 5:5 /2 4:6`;

// --- Dorian -------------------------------------------------------------------

const DORIAN_SHAPE = `/8 6:5 6:7 6:8 5:5 5:7 4:4 4:5 4:7 | 4:5 4:4 5:7 5:5 6:8 6:7 hold`;
const MINOR_VS_DORIAN = `/8 4:7 4:5 5:8 5:7 /2 5:5 | /8 4:7 4:5 4:4 5:7 /2 5:5 | /8 5:7 5:8 4:5 4:7 /2 4:5 | /8 5:7 4:4 4:5 4:7 /2 4:5`;
const DORIAN_LICK = `/8 4:7 4:5 4:4 5:7 /4 5:5 5:7 | /8 4:4 4:5 4:7 4:5 /2 4:4 | /8 4:7 4:5 5:7 5:5 /4 6:8 5:5 | /8 4:4 5:7 4:4 4:5 /2 4:7`;

// --- Mixolydian ---------------------------------------------------------------

const MIXO_SHAPE = `/8 6:5 6:7 5:4 5:5 5:7 4:4 4:5 4:7 | 4:5 4:4 5:7 5:5 5:4 6:7 hold`;
const MAJOR_VS_MIXO = `/8 4:7 4:6 4:4 5:7 /2 5:4 | /8 4:7 4:5 4:4 5:7 /2 5:4 | /8 5:7 4:4 4:6 4:7 /2 4:6 | /8 5:7 4:4 4:5 4:7 /2 4:5`;
const MIXO_LICK = `/8 4:7 4:5 4:4 5:7 /4 5:4 5:7 | /8 4:5 4:4 5:7 5:5 /2 6:3 | /8 5:7 5:5 5:7 4:4 /4 4:7 4:4 | /8 4:5 4:4 5:7 5:5 /2 5:5`;

// --- The etude ----------------------------------------------------------------

const ETUDE_DORIAN = `/8 4:7 4:5 4:4 5:7 /4 5:5 5:7 | /8 4:4 5:7 4:4 4:5 /2 4:4 | /8 5:7 5:5 6:8 6:7 /4 6:5 5:5 | /8 5:7 5:5 5:7 4:5 /2 4:7`;
const ETUDE_MIXO = `/8 4:7 4:5 4:4 5:7 /4 5:4 5:7 | /8 4:5 4:4 5:7 5:5 /2 6:3 | /8 5:7 5:5 5:4 5:5 /4 5:7 4:4 | /8 4:7 4:5 4:4 5:7 /2 6:5`;
const MODE_EXAMPLE = `/2 4:7 /8 4:5 4:4 5:7 5:5 | /2 4:5 /8 4:4 4:5 4:7 4:5 | /2 4:7 /8 4:5 4:4 5:7 5:4 | /2 5:4 /8 5:5 5:7 4:4 5:7`;

export default definePath({
  id: "scales-and-modes",
  title: "Scales and Modes",
  kind: "theory",
  goal: "Play the major scale and its relative minor as movable shapes, run sequences through them, and hear Dorian and Mixolydian as one changed note over a band.",
  level: "early-intermediate",
  assumes:
    "You can fret and pick single notes and play eighth notes with a click at 70 BPM. Knowing the pentatonic box helps and isn't needed. The minutes listed are one pass through the material; a scale is learned when your ear knows it, which takes many short visits.",
  prerequisites: { paths: [{ path: "know-the-neck", level: "beginner" }], skills: ["Clean single notes", "Eighth notes with a click at 70 BPM"] },
  labelSubdivisions: "mostly",
  paceLadders: true,
  orderRationale:
    "The major scale first as a sound and a formula on one string, then as one movable shape, because every other scale here is described as a change to it. The relative minor comes next: the same notes from a different home, which is the idea a mode rests on. Sequences turn a shape into something the fingers know in any order. Harmonic minor is one raised note, and it prepares the ear for the modes, which are also one changed note each. Dorian comes before Mixolydian because it sits on the minor shape players already have.",
  gradingLimits:
    "The app checks that the notes you played were the written ones, after the take, and times them. It can tell a wrong note from a right one, which is what matters in a scale. It cannot tell whether you heard the changed note as a colour or just played the fret, and it cannot judge the 'your turn' Exercises at all. Naming notes and scale degrees out loud is taught and not heard. None of this has been tried on a real guitar yet.",
  steps: [
    {
      id: "major-scale",
      title: "The major scale",
      goal: "Play a major scale in open position and along one string, and know the pattern of whole and half steps that makes it.",
      why: "The major scale is the ruler everything else is measured with. Chords, intervals and every mode are named by comparing them to it. It is seven notes in a fixed pattern of steps: whole, whole, half, whole, whole, whole, half. On one string you can see that pattern laid out in frets.",
      howTo: [
        "A whole step is two frets and a half step is one. From any note, the pattern two, two, one, two, two, two, one gives its major scale.",
        "Say the numbers 1 to 8 as you go up. The eighth note is the first one again, an octave higher.",
        "In C major's open position each fret has its own finger: first finger for fret 1, second for fret 2, third for fret 3. For G the hand sits one fret higher.",
      ],
      payoff: "A tune everybody knows, played from the scale you just learned.",
      exercises: [
        {
          id: "c-open",
          title: "C major in open position",
          purpose: "Eight notes from C on the A string up to the C on the B string, and back. No sharps, no flats: the white keys of a piano.",
          howTo: [
            "Quarter notes, one to a click, 50 BPM up to a pass at 80.",
            "A string 3, the open D string, 2 and 3, the open G string and 2, the open B string and 1. Say C, D, E, F, G, A, B, C.",
          ],
          coach: "Right notes and steady quarters after the take. The names are yours to say.",
          tab: C_OPEN,
          position: 1,
          harmony: { scale: ["C", "major"], cover: true },
          rungs: ladder(50, 110, 10),
          passAt: 80,
          ...named(0.8),
          selfCheck: [SAY_CHECK],
          minutes: 4,
        },
        {
          id: "g-open",
          title: "G major in open position",
          purpose: "The same scale from G on the low E string. One note is different from the white keys: F is sharp, at the D string's fret 4.",
          howTo: [
            "Quarter notes, 50 BPM up to a pass at 80.",
            "Low E string 3, the open A string, 2 and 3, the open D string, 2 and 4, the open G string. First finger on the frets at 2, second on 3, third on the F# at fret 4.",
          ],
          coach: "Right notes and steady quarters after the take.",
          tab: G_OPEN,
          position: 2,
          harmony: { scale: ["G", "major"], cover: true },
          rungs: ladder(50, 110, 10),
          passAt: 80,
          ...named(0.8),
          selfCheck: [SAY_CHECK],
          minutes: 4,
        },
        {
          id: "formula",
          title: "The formula on one string",
          purpose: "A major scale walked up a single string with one finger, so the pattern of steps is all you see: two frets, two, one, two, two, two, one.",
          howTo: [
            "Quarter notes, 50 BPM up to a pass at 80.",
            "On the B string from fret 1: 1, 3, 5, 6, 8, 10, 12, 13, and back. Say 'whole, whole, half' as you move.",
          ],
          coach: "Right notes and steady quarters after the take. The half steps are where a wrong fret usually is.",
          vary: {
            values: { stringSet: ["C on the B string", "G on the G string", "D on the D string", "F on the top string"] },
            pooled: ["stringSet"],
            label: (p) => p.stringSet,
            build: (p) => {
              const [key, string, from] = (
                { "C on the B string": ["C", 2, 1], "G on the G string": ["G", 3, 0], "D on the D string": ["D", 4, 0], "F on the top string": ["F", 1, 1] } as Record<string, [string, number, number]>
              )[p.stringSet];
              return { tab: formula(string, from), position: Math.max(1, from), harmony: { scale: [key, "major"] as [string, string], cover: true } };
            },
          },
          tab: formula(2, 1),
          position: 1,
          shifts: true,
          harmony: { scale: ["C", "major"], cover: true },
          rungs: ladder(50, 110, 10),
          passAt: 80,
          ...named(0.8),
          minutes: 5,
        },
        {
          id: "ode",
          title: "A tune from the scale",
          purpose: "The opening of Beethoven's Ode to Joy on the top two strings in C major: five notes of the scale, and you already know how it goes.",
          howTo: [
            "Quarter notes, 60 BPM up to a pass at 90; the last bar has a dotted quarter and an eighth.",
            "Open top string, fret 1 and fret 3; then the B string's fret 3 and fret 1. E, E, F, G, G, F, E, D, C, C, D, E, E, D, D.",
          ],
          coach: "Right notes and time after the take. If you can sing it, you will hear a wrong note before I do.",
          tab: ODE,
          position: 1,
          harmony: { scale: ["C", "major"] },
          rungs: ladder(60, 120, 10),
          passAt: 90,
          ...named(0.8),
          minutes: 5,
        },
      ],
    },
    {
      id: "movable-major",
      title: "One shape for every key",
      goal: "Play the major scale as one closed shape with no open strings, two octaves, and move it to other keys.",
      why: "Open position gives you two or three keys. A shape with no open strings gives you all twelve: move the hand and the key changes. This shape starts with the second finger on the root on the low E string, and it is the one most players learn first.",
      howTo: [
        "For A major the second finger is on the low E string at fret 5. The hand covers frets 4 to 7, one finger per fret, and never moves.",
        "The root is under the second finger on the low E string, the fourth finger on the D string, and the second finger on the top string.",
        "To change key, move the whole hand so the second finger is on the new root.",
      ],
      payoff: "One fingering that plays a major scale in any key, and a melody that follows three chords with it.",
      exercises: [
        {
          id: "one-octave",
          title: "The shape, one octave",
          purpose: "Eight notes on the low three strings, up and back, round and round. A different key comes round on each Take.",
          howTo: [
            "Straight eighths, two to a click, 50 BPM up to a pass at 80.",
            "In A: low E string 5 and 7, A string 4, 5 and 7, D string 4, 6 and 7. Fingers 2 and 4, then 1, 2 and 4, then 1, 3 and 4.",
          ],
          coach: "Right notes and even eighths after the take.",
          vary: inKeys(MAJOR_ONE, FROM_A, "major", ["A", "B", "C", "D"]),
          tab: MAJOR_ONE,
          position: 4,
          harmony: { scale: ["A", "major"], cover: true },
          rungs: ladder(50, 110, 10),
          passAt: 80,
          ...named(),
          minutes: 5,
        },
        {
          id: "two-octaves",
          title: "The shape, two octaves",
          purpose: "All six strings, from the root on the low E string to the root on the top string and back.",
          howTo: [
            "Straight eighths, 50 BPM up to a pass at 80.",
            "After the D string in A: G string 4 and 6, B string 5 and 7, top string 4 and 5. The first finger takes fret 4 on four of the six strings; the hand stays where it is.",
          ],
          coach: "Right notes and even eighths after the take.",
          vary: inKeys(MAJOR_BOTH, FROM_A, "major", ["A", "B", "C", "D"]),
          tab: MAJOR_BOTH,
          position: 4,
          harmony: { scale: ["A", "major"], cover: true },
          rungs: ladder(50, 110, 10),
          passAt: 80,
          ...named(),
          minutes: 6,
        },
        {
          id: "in-thirds",
          title: "The shape in thirds",
          purpose: "Up the octave skipping every other note: 1 to 3, 2 to 4, 3 to 5. The scale stops being a staircase and starts being something you can choose notes from.",
          howTo: [
            "Straight eighths, 50 BPM up to a pass at 75.",
            "In A: A then C#, B then D, C# then E, and so on up to the top A. Each pair crosses a string or stays on one; let the shape tell you where.",
          ],
          coach: "Right notes and even eighths after the take. Thirds are where a shape you half know gives itself away.",
          vary: inKeys(MAJOR_THIRDS, FROM_A, "major", ["A", "B", "C", "D"]),
          tab: MAJOR_THIRDS,
          position: 4,
          harmony: { scale: ["A", "major"] },
          rungs: ladder(50, 110, 10),
          passAt: 75,
          ...named(),
          minutes: 6,
        },
        {
          id: "tune-in-a",
          title: "A melody over A, D and E",
          purpose: "A four-bar tune inside the shape over a band. Each bar starts on a note of its chord: A, then D, then G# over E, then E on the way home to A.",
          howTo: [
            "Quarters and eighths, 60 BPM up to a pass at 90.",
            "It stays on the low three strings of the shape. Sing along if you can; the tune is the point, the scale is where it lives.",
          ],
          coach: "Band on. Right notes and time after the take.",
          tab: MAJOR_TUNE,
          position: 4,
          chords: "A | D | E | A",
          jam: ROCK("A"),
          harmony: { scaleOverChords: ["A", "major"] },
          rungs: ladder(60, 120, 10),
          passAt: 90,
          ...named(),
          minutes: 6,
        },
      ],
    },
    {
      id: "relative-minor",
      title: "The relative minor",
      goal: "Play the natural minor scale as a shape, and hear that it is a major scale started from its sixth note.",
      why: "Every major scale has a minor scale hiding in it: the same seven notes, with the sixth note as home. C major from A is A minor. Nothing about the notes changes; what changes is which one sounds like the end of the sentence. That idea, same notes and a new home, is all a mode is.",
      howTo: [
        "The minor shape starts with the first finger on the root on the low E string. For A minor that is fret 5: frets 5, 7 and 8 on the low two strings, 5 and 7 on the D string.",
        "Play C major, then the same notes from A. Listen for how the mood changes when A becomes home.",
        "Compared with a major scale from the same root, the third, sixth and seventh notes are each one fret lower.",
      ],
      payoff: "The same seven notes played twice, once bright and once dark, and a minor melody over a band.",
      exercises: [
        {
          id: "minor-shape",
          title: "The minor shape, one octave",
          purpose: "A natural minor on the low three strings, up and back. A different key comes round on each Take.",
          howTo: [
            "Straight eighths, 50 BPM up to a pass at 80.",
            "In A: low E string 5, 7 and 8; A string 5, 7 and 8; D string 5 and 7. Fingers 1, 3 and 4 on the low two strings, 1 and 3 on the D string.",
          ],
          coach: "Right notes and even eighths after the take.",
          vary: inKeys(MINOR_ONE, FROM_A, "naturalMinor"),
          tab: MINOR_ONE,
          position: 5,
          harmony: { scale: ["A", "naturalMinor"], cover: true },
          rungs: ladder(50, 110, 10),
          passAt: 80,
          ...named(),
          minutes: 5,
        },
        {
          id: "two-homes",
          title: "The same notes, two homes",
          purpose: "C major up and back from the A string's fret 3, then A minor up and back from the low E string's fret 5. Seven notes, played twice, and they do not sound alike.",
          howTo: [
            "Straight eighths, 50 BPM up to a pass at 80.",
            "Bars 1 and 2 are C major at the second fret; bars 3 and 4 are A minor at the fifth. The hand moves up three frets between them, during the long C.",
          ],
          coach: "Right notes and even eighths after the take. Which half sounded finished to you, and on which note.",
          tab: TWO_HOMES,
          position: 2,
          shifts: true,
          harmony: { scale: ["C", "major"], cover: true },
          rungs: ladder(50, 110, 10),
          passAt: 80,
          ...named(),
          minutes: 6,
        },
        {
          id: "minor-tune",
          title: "A melody over Am, Dm and Em",
          purpose: "A four-bar tune in A minor over a band, starting each bar on a note of its chord: A, then D, then E, and E again on the way home to A.",
          howTo: [
            "Quarters and eighths, 60 BPM up to a pass at 90.",
            "All of it sits in the minor shape at fret 5 on the low three strings.",
          ],
          coach: "Band on. Right notes and time after the take.",
          tab: MINOR_TUNE,
          position: 5,
          chords: "Am | Dm | Em | Am",
          jam: ROCK("A minor"),
          harmony: { scaleOverChords: ["A", "naturalMinor"] },
          rungs: ladder(60, 120, 10),
          passAt: 90,
          ...named(),
          minutes: 6,
        },
      ],
    },
    {
      id: "sequences",
      title: "Sequences",
      goal: "Run a scale in threes, in fours and in thirds, up and down, without losing the pattern.",
      why: "Up and down is how you learn where the notes are. Sequences are how you learn to get from any one of them to any other. Three notes up, start one higher, three more: the fingers have to know every neighbour of every note, and that is what makes a scale usable in a solo.",
      howTo: [
        "In threes, each group starts one scale note higher than the last. Say the first note of each group.",
        "Triplets for threes, so each group fills one beat; eighths for fours, so each group fills two.",
        "When the pattern breaks down, stop and find the last group you were sure of. Start again from there.",
      ],
      payoff: "A minor in threes, fours and thirds: the three patterns most scale-based licks are cut from.",
      exercises: [
        {
          id: "threes",
          title: "In threes",
          purpose: "A, B, C; B, C, D; C, D, E: A minor climbing in groups of three, one group to a beat.",
          howTo: [
            "Eighth-note triplets, three to a click, 50 BPM up to a pass at 85.",
            "The minor shape at fret 5, one octave. The first note of each group lands on the click, and each group starts where the last one's second note was.",
          ],
          coach: "Right notes and even triplets after the take.",
          vary: inKeys(THREES, FROM_A, "naturalMinor", ["A", "B", "C", "D"]),
          tab: THREES,
          position: 5,
          loops: false,
          harmony: { scale: ["A", "naturalMinor"], cover: true },
          rungs: ladder(50, 110, 10),
          passAt: 85,
          ...named(),
          minutes: 6,
        },
        {
          id: "fours",
          title: "In fours",
          purpose: "A, B, C, D; B, C, D, E; and on up: groups of four in eighth notes, each group two beats long.",
          howTo: [
            "Straight eighths, 50 BPM up to a pass at 85.",
            "The first note of each group is on beat 1 or beat 3. Lean on it a little so you can hear where each group starts.",
          ],
          coach: "Right notes and even eighths after the take.",
          vary: inKeys(FOURS, FROM_A, "naturalMinor", ["A", "B", "C", "D"]),
          tab: FOURS,
          position: 5,
          loops: false,
          harmony: { scale: ["A", "naturalMinor"], cover: true },
          rungs: ladder(50, 110, 10),
          passAt: 85,
          ...named(),
          minutes: 6,
        },
        {
          id: "thirds",
          title: "In thirds",
          purpose: "A to C, B to D, C to E, up the octave: every other note of the scale, which is how chords are built.",
          howTo: [
            "Straight eighths, 50 BPM up to a pass at 85.",
            "Each pair skips one scale note. Some pairs sit on one string and some cross to the next; the shape under your hand decides.",
          ],
          coach: "Right notes and even eighths after the take.",
          vary: inKeys(THIRDS_UP, FROM_A, "naturalMinor", ["A", "B", "C", "D"]),
          tab: THIRDS_UP,
          position: 5,
          harmony: { scale: ["A", "naturalMinor"] },
          rungs: ladder(50, 110, 10),
          passAt: 85,
          ...named(),
          minutes: 6,
        },
        {
          id: "threes-down",
          title: "In threes, coming down",
          purpose: "The descending pattern from C on the G string: C, B, A; B, A, G; and on down to the low A. Going down is its own skill.",
          howTo: [
            "Eighth-note triplets, 50 BPM up to a pass at 80.",
            "The first finger reaches back to fret 4 on the G string for the B. Each group starts one scale note lower than the last.",
          ],
          coach: "Right notes and even triplets after the take.",
          tab: THREES_DOWN,
          position: 4,
          shifts: true,
          loops: false,
          harmony: { scale: ["A", "naturalMinor"], cover: true },
          rungs: ladder(50, 100, 10),
          passAt: 80,
          ...named(),
          minutes: 6,
        },
      ],
    },
    {
      id: "more-neck",
      title: "Two positions, and three notes per string",
      goal: "Carry C major from one position into the next, and play it three notes per string at the eighth fret.",
      why: "One shape is a box. A scale covers the whole neck, and there are two common ways to get out of the box: shift from one position into the one above it, or use three notes on every string, which climbs the neck by itself. Both are the same seven notes you already know.",
      howTo: [
        "The shift happens on the G string: finish the lower shape on fret 5 with the fourth finger, then play the same fret again with the first finger and carry on up.",
        "Three notes per string at the eighth fret: frets 8, 10 and 12 on the low two strings, 9, 10 and 12 on the next two.",
        "Keep the thumb behind the neck so the hand can open for the wider shape. Nothing here should hurt.",
      ],
      payoff: "C major across two positions without a seam, and a three-notes-per-string run that covers four strings in one bar.",
      difficultyException:
        "The lines move at the same eighth-note rate as the sequences before them but repeat no note, so the metric reads lower. The demand is the shift and the wider three-per-string hand.",
      exercises: [
        {
          id: "two-positions",
          title: "C major, two positions",
          purpose: "Up through the shape at the second fret, across into the shape at the fifth, to the top string and back the same way.",
          howTo: [
            "Straight eighths, 50 BPM up to a pass at 80.",
            "The G string's fret 5 is played twice in a row: once with the fourth finger to end the lower shape, once with the first to start the upper one. That repeat is the shift.",
          ],
          coach: "Right notes and even eighths after the take. The shift is where the time moves.",
          tab: TWO_POSITIONS,
          position: 2,
          shifts: true,
          loops: false,
          harmony: { scale: ["C", "major"], cover: true },
          rungs: ladder(50, 110, 10),
          passAt: 80,
          ...named(),
          minutes: 7,
        },
        {
          id: "three-per-string",
          title: "Three notes per string",
          purpose: "C major from the low E string's fret 8 across four strings, three notes on each, up in one bar and down in the next.",
          howTo: [
            "Eighth-note triplets, three to a click, 50 BPM up to a pass at 80.",
            "One string to a beat. Fingers 1, 2 and 4 on the low two strings (8, 10, 12) and 1, 2 and 4 again on the next two (9, 10, 12), with the hand a fret higher.",
          ],
          coach: "Right notes and even triplets after the take.",
          tab: THREE_NPS,
          position: 8,
          shifts: true,
          loops: false,
          harmony: { scale: ["C", "major"], cover: true },
          rungs: ladder(50, 110, 10),
          passAt: 80,
          ...named(),
          minutes: 6,
        },
        {
          id: "walk-and-shape",
          title: "The formula, then the shape",
          purpose: "A major scale along one string and then the same scale in the movable shape: the same eight notes found two ways.",
          howTo: [
            "Quarter notes along the string, then eighths in the shape, 50 BPM up to a pass at 80.",
            "On the G string from fret 2: 2, 4, 6, 7, 9, 11, 13, 14 and back. It is A major. Then the same scale in the shape at fret 4, from the low E string's fret 5.",
          ],
          coach: "Right notes and steady quarters after the take.",
          tab: `${formula(3, 2)} | ${MAJOR_ONE}`,
          position: 2,
          shifts: true,
          harmony: { scale: ["A", "major"], cover: true },
          rungs: ladder(50, 110, 10),
          passAt: 80,
          ...named(0.8),
          minutes: 5,
        },
      ],
    },
    {
      id: "harmonic-minor",
      title: "Harmonic minor",
      goal: "Play A harmonic minor, and use its raised seventh to pull back to A over an E7 chord.",
      why: "Natural minor has a weak ending: G to A is a whole step, and it drifts home. Raise the G to G# and the pull is strong, because G# is the third of E7, the chord that leads back to A minor. One note changed, and the scale goes from folk song to something darker. It is also practice for the modes: one note, a new colour.",
      howTo: [
        "Take the minor shape and raise the seventh note one fret: on the D string, fret 5 becomes fret 6.",
        "The gap from F to G# is three frets, on two strings: the A string's fret 8 to the D string's fret 6.",
        "Play G# over E7 and A over Am. The first asks a question and the second answers it.",
      ],
      payoff: "A phrase over Am and E7 where one note makes the chord change audible.",
      difficultyException:
        "Slower than the runs before it on purpose: there is one new note to hear, and a chord change to hear it against.",
      exercises: [
        {
          id: "harmonic-shape",
          title: "The shape with a raised seventh",
          purpose: "A harmonic minor, one octave up and back: the minor shape with G# at the D string's fret 6.",
          howTo: [
            "Straight eighths, 50 BPM up to a pass at 80.",
            "Low E string 5, 7, 8; A string 5, 7, 8; D string 6 and 7. The second finger takes fret 6 and the third takes fret 7.",
          ],
          coach: "Right notes and even eighths after the take. G# is the note I am listening for.",
          vary: inKeys(HARMONIC_SHAPE, FROM_A, "harmonicMinor", ["A", "B", "C", "D"]),
          tab: HARMONIC_SHAPE,
          position: 5,
          harmony: { scale: ["A", "harmonicMinor"], cover: true },
          rungs: ladder(50, 110, 10),
          passAt: 80,
          ...named(),
          minutes: 5,
        },
        {
          id: "harmonic-lick",
          title: "G# over E7, A over Am",
          purpose: "Four bars over Am and E7. The Am bars use the plain minor notes and come to rest; the E7 bars lean on G# and want to move.",
          howTo: [
            "Eighths and half notes, 60 BPM up to a pass at 90.",
            "Bars 1 and 3 are over Am. Bar 2 starts on G#, the D string's fret 6; bar 4 starts on E and ends on G#. All of it stays in the shape at fret 5.",
          ],
          coach: "Band on. Right notes and time after the take.",
          tab: HARMONIC_LICK,
          position: 5,
          chords: "Am | E7 | Am | E7",
          jam: ROCK("A minor"),
          harmony: { scaleOverChords: ["A", "harmonicMinor"] },
          rungs: ladder(60, 120, 10),
          passAt: 90,
          ...named(),
          minutes: 6,
        },
        {
          id: "natural-then-harmonic",
          title: "Natural, then harmonic",
          purpose: "The minor shape up and back with G, then up and back with G#. One fret apart, and the second one sounds like a different country.",
          howTo: [
            "Straight eighths, 50 BPM up to a pass at 80.",
            "Bars 1 and 2: D string 5 and 7. Bars 3 and 4: D string 6 and 7. Everything else is the same.",
          ],
          coach: "Right notes and even eighths after the take.",
          tab: `${MINOR_ONE} | ${HARMONIC_SHAPE.slice(3)}`,
          position: 5,
          rungs: ladder(50, 110, 10),
          passAt: 80,
          ...named(),
          minutes: 5,
        },
      ],
    },
    {
      id: "dorian",
      title: "Dorian",
      goal: "Play A Dorian, hear its raised sixth against natural minor, and use it over Am and D.",
      why: "Dorian is the minor scale of rock, funk and a lot of blues: natural minor with the sixth note raised a half step. In A that is F# where the minor scale has F. It sounds brighter, and it is the right scale whenever a minor chord is followed by the major chord a fourth above it, as in Am to D, because F# is the third of D.",
      howTo: [
        "In the minor shape, the sixth note is the A string's fret 8. Dorian moves it up to fret 9, or, easier, to the D string's fret 4 under the first finger.",
        "Play the minor version and then the Dorian version of the same phrase. Only one note moves.",
        "Over the D chord, land on F#. That is the note that proves the scale.",
      ],
      payoff: "A phrase over Am and D that could not have been played with the minor scale.",
      exercises: [
        {
          id: "dorian-shape",
          title: "The Dorian shape",
          purpose: "A Dorian, one octave up and back: A, B, C, D, E, F#, G, A, with F# at the D string's fret 4.",
          howTo: [
            "Straight eighths, 50 BPM up to a pass at 80.",
            "Low E string 5, 7, 8; A string 5 and 7; D string 4, 5 and 7. The first finger reaches back one fret for the F#.",
          ],
          coach: "Right notes and even eighths after the take. F# is the note I am listening for.",
          vary: inKeys(DORIAN_SHAPE, FROM_A, "dorian", ["A", "B", "C", "D"], 5),
          tab: DORIAN_SHAPE,
          position: 5,
          shifts: true,
          harmony: { scale: ["A", "dorian"], cover: true },
          rungs: ladder(50, 110, 10),
          passAt: 80,
          ...named(),
          minutes: 5,
        },
        {
          id: "minor-vs-dorian",
          title: "Minor, then Dorian",
          purpose: "Two phrases, each played with F and then with F#. The first of each pair is natural minor and the second is Dorian.",
          howTo: [
            "Eighths and half notes, 50 BPM up to a pass at 80.",
            "Bars 1 and 3 use the A string's fret 8, F. Bars 2 and 4 use the D string's fret 4, F#, in its place.",
          ],
          coach: "Right notes and time after the take. The difference between the bars is one note; hear it before you move on.",
          tab: MINOR_VS_DORIAN,
          position: 5,
          shifts: true,
          rungs: ladder(50, 110, 10),
          passAt: 80,
          ...named(),
          minutes: 5,
        },
        {
          id: "dorian-lick",
          title: "A Dorian phrase over Am and D",
          purpose: "Four bars over a band going from Am to D and back. The bars over D start on F#, the note that belongs to both the chord and the scale.",
          howTo: [
            "Eighths, quarters and half notes, 60 BPM up to a pass at 90.",
            "Bars 1 and 3 start on A; bars 2 and 4 start on F#, the D string's fret 4. The whole phrase stays between frets 4 and 8.",
          ],
          coach: "Band on. Right notes and time after the take.",
          tab: DORIAN_LICK,
          position: 5,
          shifts: true,
          chords: "Am | D | Am | D",
          jam: ROCK("A minor"),
          harmony: { scaleOverChords: ["A", "dorian"] },
          rungs: ladder(60, 120, 10),
          passAt: 90,
          ...named(),
          minutes: 6,
        },
      ],
    },
    {
      id: "mixolydian",
      title: "Mixolydian",
      goal: "Play A Mixolydian, hear its lowered seventh against the major scale, and use it over A and G.",
      why: "Mixolydian is the major scale of rock and blues: a major scale with the seventh note lowered a half step. In A that is G where the major scale has G#. It is the scale of a dominant seventh chord, and of every song that goes from a major chord to the major chord a whole step below it, as in A to G.",
      howTo: [
        "From A on the low E string's fret 5: A, B, C#, D, E, F#, G, A. The C# is on the A string's fret 4, under the first finger.",
        "Play the phrase with G# (the D string's fret 6), then with G (fret 5). The first is plain major; the second is Mixolydian.",
        "Over the G chord, land on G. Over the A chord, C# tells everyone it is major.",
      ],
      payoff: "A phrase over A and G with the sound of a hundred classic rock songs in it.",
      exercises: [
        {
          id: "mixolydian-shape",
          title: "The Mixolydian shape",
          purpose: "A Mixolydian, one octave up and back: major, with G natural at the D string's fret 5.",
          howTo: [
            "Straight eighths, 50 BPM up to a pass at 85.",
            "Low E string 5 and 7; A string 4, 5 and 7; D string 4, 5 and 7. First finger on the frets at 4, second on 5, fourth on 7.",
          ],
          coach: "Right notes and even eighths after the take. G natural is the note I am listening for.",
          vary: inKeys(MIXO_SHAPE, FROM_A, "mixolydian", ["A", "B", "C", "D"], 4),
          tab: MIXO_SHAPE,
          position: 4,
          harmony: { scale: ["A", "mixolydian"], cover: true },
          rungs: ladder(50, 110, 10),
          passAt: 85,
          ...named(),
          minutes: 5,
        },
        {
          id: "major-vs-mixolydian",
          title: "Major, then Mixolydian",
          purpose: "Two phrases, each played with G# and then with G. The first of each pair is A major and the second is A Mixolydian.",
          howTo: [
            "Eighths and half notes, 50 BPM up to a pass at 85.",
            "Bars 1 and 3 use the D string's fret 6, G#. Bars 2 and 4 use fret 5, G, in its place.",
          ],
          coach: "Right notes and time after the take. One fret, and the phrase goes from hymn to rock.",
          tab: MAJOR_VS_MIXO,
          position: 4,
          rungs: ladder(50, 110, 10),
          passAt: 85,
          ...named(),
          minutes: 5,
        },
        {
          id: "mixolydian-lick",
          title: "A Mixolydian phrase over A and G",
          purpose: "Four bars over a band going from A to G and back. The bars over G start on G; bar 1, over A, leans on C#.",
          howTo: [
            "Eighths, quarters and half notes, 60 BPM up to a pass at 90.",
            "Bar 1 starts on A and bar 3 on E. Bars 2 and 4 start on G, the D string's fret 5, and bar 2 ends on the low G at fret 3.",
          ],
          coach: "Band on. Right notes and time after the take.",
          tab: MIXO_LICK,
          position: 4,
          shifts: true,
          chords: "A | G | A | G",
          jam: ROCK("A"),
          harmony: { scaleOverChords: ["A", "mixolydian"] },
          rungs: ladder(60, 120, 10),
          passAt: 90,
          ...named(),
          minutes: 6,
        },
      ],
    },
    {
      id: "choosing",
      title: "Choosing the scale",
      goal: "Play a written phrase in each mode over its chords, and then choose the scale yourself from the chords you hear.",
      why: "Knowing a scale is half of it. The other half is knowing which one the song is asking for, and the chords tell you: a minor chord and the major chord a fourth up is Dorian; a major chord and the major chord a step down is Mixolydian. In Dorian the changed note is the third of the second chord, F# in D; in Mixolydian it is that chord's root, G.",
      howTo: [
        "Listen for the second chord. Over Am, when D arrives, play F#. Over A, when G arrives, play G.",
        "Keep the hand around frets 4 to 8. The two scales differ by one note there: C in A Dorian, C# in A Mixolydian.",
        "A short phrase that lands on the changed note says more than a long run through the whole scale.",
      ],
      payoff: "Two four-bar solos that sound like they belong to their chords, and one of your own.",
      exercises: [
        {
          id: "dorian-etude",
          title: "Four bars of Dorian",
          purpose: "A written phrase over Am, D, Am, Am: A Dorian from the low string up to the A on the D string, landing on F# when the D chord arrives.",
          howTo: [
            "Eighths, quarters and half notes, 60 BPM up to a pass at 95.",
            "Bar 2 starts and ends on F#. Bar 3 walks down to the low A, and bar 4 climbs back to finish on A.",
          ],
          coach: "Band on. Right notes and time after the take.",
          tab: ETUDE_DORIAN,
          position: 5,
          shifts: true,
          chords: "Am | D | Am | Am",
          jam: ROCK("A minor"),
          harmony: { scaleOverChords: ["A", "dorian"] },
          rungs: ladder(60, 120, 10),
          passAt: 95,
          ...named(),
          minutes: 6,
        },
        {
          id: "mixolydian-etude",
          title: "Four bars of Mixolydian",
          purpose: "A written phrase over A and G: A Mixolydian in the same part of the neck, landing on the low G when the G chord arrives.",
          howTo: [
            "Eighths, quarters and half notes, 60 BPM up to a pass at 95.",
            "The C# at the A string's fret 4 is in bars 1 and 3, over the A chord. Bar 2 ends on the low G at fret 3.",
          ],
          coach: "Band on. Right notes and time after the take.",
          tab: ETUDE_MIXO,
          position: 4,
          shifts: true,
          chords: "A | G | A | A",
          jam: ROCK("A"),
          harmony: { scaleOverChords: ["A", "mixolydian"] },
          rungs: ladder(60, 120, 10),
          passAt: 95,
          ...named(),
          minutes: 6,
        },
        {
          id: "your-mode",
          title: "Your turn: let the chords choose",
          purpose: "Free playing over A and G: A Mixolydian, your notes. The one rule is to be on G when the G chord arrives and on A, C# or E when the A chord does.",
          howTo: [
            "Straight eighths or longer, 60 to 90 BPM.",
            "Start with two notes a bar and the changed note on beat 1. Add notes only when the landing is sure. The written line is an example.",
            NOT_CHECKED_YET,
          ],
          coach: "Not checked yet. Record it and listen to beat 1 of each bar.",
          tab: MODE_EXAMPLE,
          position: 4,
          chords: "A | G | A | A",
          jam: ROCK("A"),
          rungs: ladder(60, 90, 10),
          ...YOUR_TURN,
          selfCheck: [
            "Did you land on G when the G chord arrived?",
            "Could you hear the difference between G and G# without looking?",
          ],
          minutes: 5,
        },
      ],
    },
  ],
  levels: [
    {
      id: "beginner",
      title: "Beginner: the major scale and its minor",
      summary: "The major scale in open position and on one string, one movable shape for every key, and the relative minor.",
      reachLevel: "early-intermediate",
      startHereIf: [
        "You can play quarter and eighth notes with a click at 70 BPM.",
        "You know some chords or the pentatonic box, and no full scale from memory.",
        "You couldn't say which notes are in G major.",
      ],
      steps: ["major-scale", "movable-major", "relative-minor"],
      warmups: [
        {
          id: "scale-walk",
          title: "A walk up one string",
          purpose: "Three notes of a major scale on one string, up and back, a step higher each bar. A different key and string each time.",
          howTo: ["Quarter notes, well under your clean tempo. Say 'whole' or 'half' for each step, and move the hand up a note at each bar line."],
          coach: "This is a warm-up. It tells you how it went, and it decides nothing.",
          vary: {
            values: { key: ["C", "G", "D"], stringSet: ["2", "3", "4"] },
            pooled: ["key", "stringSet"],
            label: (p) => `${p.key} major on string ${p.stringSet}`,
            build: (p) => {
              const bars = oneStringClimb({ root: p.key, scale: "major", string: Number(p.stringSet), from: 1, cell: [0, 1, 2, 1], bars: 4 });
              const walked = bars.split(" | ").map((bar) => `/4 ${bar}`).join(" | ");
              return { tab: walked, position: handAt(walked), shifts: true, harmony: { scale: [p.key, "major"] as [string, string] } };
            },
          },
          grade: "warmup",
          warmup: { start: 0.6, top: 0.8, reference: "major-scale.formula", fallback: 60 },
          rungs: ladder(50, 100, 10),
          minutes: 3,
        },
      ],
    },
    {
      id: "intermediate",
      title: "Intermediate: patterns, positions and one raised note",
      summary: "Sequences through the minor shape, C major across two positions and three notes per string, and harmonic minor over Am and E7.",
      reachLevel: "intermediate",
      startHereIf: [
        "You can play a major and a natural minor scale shape from memory at eighths, 80 BPM.",
        "You can move the major shape to 3 other keys without working it out.",
        "Your scales only go straight up and down, or only live in one position.",
      ],
      steps: ["sequences", "more-neck", "harmonic-minor"],
      warmups: [
        {
          id: "shape-of-the-day",
          title: "A scale in a new key",
          purpose: "One octave of a major or a minor shape, up and back, then the same a hand higher. A different key each time.",
          howTo: ["Straight eighths, well under your clean tempo. Play the shape, move the hand up two frets at the bar line, and play it again."],
          coach: "This is a warm-up. It tells you how it went, and it decides nothing.",
          vary: {
            values: { key: ["A", "B", "C", "D"], shapeOrder: ["major", "minor"] },
            pooled: ["key", "shapeOrder"],
            label: (p) => `${p.key} ${p.shapeOrder}`,
            build: (p) => {
              const major = p.shapeOrder === "major";
              const one = major ? MAJOR_ONE : MINOR_ONE;
              const shift = FROM_A[p.key];
              const first = shiftFrets(one, shift);
              const second = shiftFrets(one, shift + 2);
              const both = `${first} | ${second}`;
              return { tab: both, position: handAt(both), shifts: true, chords: moveChart(major ? "A | A | B | B" : "Am | Am | Bm | Bm", shift) };
            },
          },
          grade: "warmup",
          warmup: { start: 0.6, top: 0.8, reference: "movable-major.one-octave", fallback: 50 },
          rungs: ladder(50, 100, 10),
          minutes: 4,
        },
      ],
    },
    {
      id: "advanced",
      title: "Advanced: the modes over a band",
      summary: "Dorian and Mixolydian, each as one changed note heard against the scale you know, then phrases that follow the chords.",
      reachLevel: "intermediate",
      startHereIf: [
        "You can play A natural minor in threes at triplets, 80 BPM.",
        "You know the major and minor shapes in at least 3 keys.",
        "You've heard the words Dorian and Mixolydian and couldn't say which note makes each one.",
      ],
      steps: ["dorian", "mixolydian", "choosing"],
      warmups: [
        {
          id: "mode-of-the-day",
          title: "One shape, one changed note",
          purpose: "A Dorian or a Mixolydian shape, one octave up and back, then the same a hand higher. A different key each time.",
          howTo: ["Straight eighths, well under your clean tempo. Say the name of the changed note before you start: the raised sixth, or the lowered seventh."],
          coach: "This is a warm-up. It tells you how it went, and it decides nothing.",
          vary: {
            values: { key: ["A", "B", "C", "D"], shapeOrder: ["Dorian", "Mixolydian"] },
            pooled: ["key", "shapeOrder"],
            label: (p) => `${p.key} ${p.shapeOrder}`,
            build: (p) => {
              const shape = p.shapeOrder === "Dorian" ? DORIAN_SHAPE : MIXO_SHAPE;
              const first = shiftFrets(shape, FROM_A[p.key]);
              const second = shiftFrets(shape, FROM_A[p.key] + 2);
              const both = `${first} | ${second}`;
              const chart = p.shapeOrder === "Dorian" ? "Am | Am | Bm | Bm" : "A | A | B | B";
              return { tab: both, position: handAt(both), shifts: true, chords: moveChart(chart, FROM_A[p.key]) };
            },
          },
          grade: "warmup",
          warmup: { start: 0.6, top: 0.8, reference: "dorian.dorian-shape", fallback: 50 },
          rungs: ladder(50, 100, 10),
          minutes: 4,
        },
      ],
    },
  ],
});
