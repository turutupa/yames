/**
 * Know the Neck, a Theory Path. A draft: no teacher or guitarist has reviewed
 * it.
 *
 * Where the notes are: the natural notes string by string, octave shapes,
 * thirds, roots and triads, then the five pentatonic boxes joined up and
 * arpeggios through the changes. Every line is written and slow, so the app can
 * check the one thing this Path is about: that the note played was the note
 * meant. Naming the notes out loud is taught and cannot be heard.
 */
import { definePath } from "../spec";
import type { ExerciseSpec } from "../spec";
import { STANDARD_TUNING } from "../format";
import type { PassBar } from "../format";
import { pcOfName, scalePcs } from "../theory";
import { handAt, ladder, moveChart, oneStringClimb, pentatonic, repeat, shiftFrets } from "../templates";

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

const YOUR_TURN = { grade: "selfChecked", example: true } as const;
const NOT_CHECKED_YET =
  "Your turn, and not checked yet: the app can't judge notes you choose, so you tick it off yourself.";

const SAY_CHECK = "Did you say each note's name out loud as you played it?";
const EYES_CHECK = "Could you play it once without looking at the neck?";

/** Said on every Exercise whose variants move the figure: the words name the first version's frets. */
const VARIANT_NOTE =
  "The frets and note names here are for the first version. Other Takes move the same figure to another string or key.";

const C_MAJOR = { scale: ["C", "major"] as [string, string] };
const ROCK = (key: string) => ({ groove: "rock8", key });

const open = (string: number) => STANDARD_TUNING[string - 1];

/** The natural notes on one string from the open string to fret 12, up and back, with the first finger walking. */
function naturals(string: number): string {
  const pcs = new Set(scalePcs("C", "major"));
  const frets: number[] = [];
  for (let fret = 0; fret <= 12; fret += 1) if (pcs.has((open(string) + fret) % 12)) frets.push(fret);
  const tok = (fret: number) => (fret === 0 ? `${string}:0` : `${string}:${fret}f1`);
  const up = frets.map(tok);
  const down = [...frets].reverse().slice(1, -1).map(tok);
  return `/4 ${up.slice(0, 4).join(" ")} | ${up.slice(4).join(" ")} | ${down.slice(0, 4).join(" ")} | ${down.slice(4).join(" ")} /2 ${tok(0)}`;
}

/** An octave shape walked through four natural notes and back: `gap` frets up, two strings over. */
function octaves(low: number, high: number, gap: number, frets: readonly number[], upper: 3 | 4): string {
  const pair = (fret: number) => `${low}:${fret}f1 ${high}:${fret + gap}f${upper}`;
  const [a, b, c, d] = frets;
  return `/4 ${pair(a)} ${pair(b)} | ${pair(c)} ${pair(d)} | ${pair(c)} ${pair(b)} | /2 ${pair(a)}`;
}

/** Root, fourth and fifth on the low two strings: the fourth is the same fret a string higher, the fifth two frets above it. */
function oneFourFive(key: string): { tab: string; position: number } {
  const root = (((pcOfName(key) - open(6)) % 12) + 12) % 12 || 12;
  const [r, iv, v] = [`6:${root}f1`, `5:${root}f1`, `5:${root + 2}f3`];
  return { tab: `/4 ${r} ${r} ${iv} ${iv} | ${v} ${v} ${iv} ${iv} | ${r} ${r} ${iv} ${iv} | ${v} ${v} /2 ${r}`, position: root };
}

// Broken thirds up the G and B strings in a major key: every pair is a scale note and the third above it.
function thirdsOnGB(key: string): string {
  const pcs = scalePcs(key, "major");
  const inScale = new Set(pcs);
  const pairs: string[] = [];
  // From the key's root on the G string (fret 12 where the root is the open string).
  const root = (((pcOfName(key) - open(3)) % 12) + 12) % 12 || 12;
  for (let fret = root; fret <= 22 && pairs.length < 5; fret += 1) {
    const low = open(3) + fret;
    if (!inScale.has(low % 12)) continue;
    // Two scale steps above: a third.
    let high = low;
    for (let step = 0; step < 2; step += 1) {
      high += 1;
      while (!inScale.has(high % 12)) high += 1;
    }
    // The second finger guides on the G string; a major third is the same fret, a minor one a fret back.
    const upper = high - open(2);
    pairs.push(`3:${fret}f2 2:${upper}f${upper === fret ? 3 : 1}`);
  }
  const [a, b, c, d, e] = pairs;
  return `/8 ${a} ${b} ${c} ${d} | ${e} ${d} ${c} ${b} | /2 ${a}`;
}

// The first finger guides on the top string: a minor third is two frets back from the B string's note, a major one a fret back.
const THIRDS_TOP = `/8 2:5f3 1:3f1 2:6f2 1:5f1 2:8f2 1:7f1 2:10f3 1:8f1 | 2:12f3 1:10f1 2:10f3 1:8f1 2:8f2 1:7f1 2:6f2 1:5f1 | /2 2:5f3 1:3f1`;
const THIRDS_TUNE = `/8 ${repeat("3:5f2 2:5f3 3:9f2 2:8f1", 2)} | ${repeat("3:10f2 2:10f3 3:14f2 2:13f1", 2)} | ${repeat("3:12f2 2:12f3 3:16f2 2:15f1", 2)} | 3:9f2 2:8f1 3:5f2 2:5f3 /2 3:5f2`;

const FIFTHS_BAND = `/8 ${repeat("6:5 6:5 5:7 5:7", 2)} | ${repeat("5:5 5:5 4:7 4:7", 2)} | ${repeat("5:7 5:7 4:9 4:9", 2)} | 6:5 6:5 5:7 5:7 /2 6:5`;
const ROOT_OCTAVES = `/4 6:5f1 4:7f3 6:5f1 4:7f3 | 6:1f1 4:3f3 6:1f1 4:3f3 | 5:3f1 3:5f3 5:3f1 3:5f3 | 6:3f1 4:5f3 6:3f1 4:5f3`;

const C_TRIADS = `/8 3:5f2 2:5f3 1:3f1 2:5f3 3:9f2 2:8f1 1:8f1 2:8f1 | 3:12f1 2:13f2 1:12f1 2:13f2 3:9f2 2:8f1 1:8f1 2:8f1`;
const AM_TRIADS = `/8 3:5f1 2:5f1 1:5f1 2:5f1 3:9f2 2:10f3 1:8f1 2:10f3 | 3:14f3 2:13f2 1:12f1 2:13f2 3:9f2 2:10f3 1:8f1 2:10f3`;
const NEAR_TRIADS = `/8 ${repeat("3:5f2 2:5f3 1:3f1 2:5f3", 2)} | ${repeat("3:5f1 2:6f2 1:5f1 2:6f2", 2)} | ${repeat("3:4f2 2:3f1 1:3f1 2:3f1", 2)} | 3:5f2 2:5f3 1:3f1 2:5f3 /2 3:5f2`;

/** The two-string ladder: A minor pentatonic on the G and B strings, box by box, up the neck and back. */
const LADDER = `/8 3:5f1 3:7f3 2:5f1 2:8f4 3:7f1 3:9f3 2:8f2 2:10f4 | 3:9f1 3:12f4 2:10f1 2:13f4 3:12f1 3:14f3 2:13f2 2:15f4 | 2:15f4 2:13f2 3:14f3 3:12f1 2:13f4 2:10f1 3:12f4 3:9f1 | 2:10f4 2:8f2 3:9f3 3:7f1 2:8f4 2:5f1 /4 3:7f3`;
const THREE_OCTAVES = `/8 6:5f1 6:8f4 5:5f1 5:7f3 4:7f1 4:10f4 3:7f1 3:9f3 | 2:10f1 2:13f4 1:10f1 1:12f3 /2 1:17f4`;

const AM_UP = `/8 6:5f1 6:8f4 5:7f3 4:7f3 3:5f1 3:9f2 2:10f3 1:8f1 | 1:12f4 1:8f1 2:10f3 3:9f2 /2 4:7f1`;
// The open C chord, one string at a time, then the C an octave up on the top string.
const C_UP = `/8 5:3f3 4:2f2 3:0 2:1f1 1:0 1:3f3 1:8f4 1:3f3 | 1:0 2:1f1 3:0 4:2f2 /2 5:3f3`;
const CHANGES_ARPS = `/8 4:7 3:5 2:5 1:5 2:5 3:5 4:7 3:5 | 4:7 3:5 2:6 1:5 2:6 3:5 4:7 3:5 | 4:5 3:5 2:5 1:8 2:5 3:5 4:5 3:5 | 4:5 3:7 2:8 1:7 2:8 3:7 4:5 3:7`;

const THIRDS_LINE = `/2 3:5 3:5 | 4:7 4:7 | 2:5 2:5 | 3:4 3:4`;
const ROOT_THIRD_FIFTH = `/4 4:7f3 3:5f1 2:5f1 3:5f1 | 5:8f4 4:7f3 3:5f1 4:7f3 | 3:5f1 2:5f1 2:8f4 2:5f1 | 4:5f2 3:4f1 3:7f4 3:4f1`;
const LANDING_EXAMPLE = `/2 3:5 /8 2:5 3:7 3:5 4:7 | /2 4:7 /8 3:5 3:7 2:5 3:7 | /2 2:5 /8 2:8 2:5 3:7 3:5 | /2 3:4 /8 3:7 3:5 4:7 4:5`;

export default definePath({
  id: "know-the-neck",
  title: "Know the Neck",
  kind: "theory",
  category: "harmony",
  goal: "Find any natural note on any string, see octaves, thirds and triads as shapes, and follow a chord progression in one position by name.",
  level: "beginner",
  assumes:
    "You can fret and pick single notes and play quarter notes with a click at 70 BPM. You don't need to read music or know any scales. The minutes listed are one pass through the material; this is knowledge, and it sticks when you come back to it for a few minutes on many days.",
  prerequisites: { skills: ["Clean single notes", "Quarter notes with a click at 70 BPM"] },
  labelSubdivisions: "mostly",
  paceLadders: true,
  variantText: true,
  orderRationale:
    "The two low strings first, because chords and scales are named from them. Octave shapes next: they turn two known strings into six. Thirds, roots and triads are the smallest pieces of harmony and each is one shape. Only then the five pentatonic boxes, which most players learn first and never connect; here they arrive as places on a neck the player can already name. Arpeggios through the changes and landing on chord tones come last because they use all of it at once.",
  gradingLimits:
    "The app checks that the notes you played were the written ones, after the take, and times them loosely. It cannot hear you say a note's name, and it cannot tell which string you played a pitch on: the same C on two strings sounds alike to it. So the saying and the place are yours to keep honest. The 'your turn' Exercises are not checked at all. None of this has been tried on a real guitar yet.",
  steps: [
    {
      id: "low-strings",
      title: "The low E and A strings",
      goal: "Name and play every natural note on the low E and A strings up to the twelfth fret.",
      why: "Barre chords, power chords and most scale shapes are named from the note under the first finger on one of these two strings. Know these two strings and you can name any chord you already play. The notes follow the alphabet from A to G, with a whole step between each pair except B to C and E to F, which are next-door frets.",
      howTo: [
        "Say each note's name out loud as you play it. Saying it is the practice; playing it is only the check.",
        "Walk up the string with the first finger alone. Two frets between most notes, one fret between B and C and between E and F.",
        "The twelfth fret is the same note as the open string, an octave higher. The dots on the neck at 3, 5, 7, 9 and 12 are your landmarks.",
      ],
      payoff: "You can put a finger on any fret of the two low strings and say what it is.",
      exercises: [
        {
          id: "open-strings",
          title: "The six open strings",
          purpose: "E, A, D, G, B, E, from the lowest string to the highest and back. Their names are the starting point for everything else.",
          howTo: [
            "Quarter notes, one to a click, 50 BPM up to a pass at 80.",
            "Low to high and back down, saying each name. A common way to remember them: Eddie Ate Dynamite, Good Bye Eddie.",
          ],
          coach: "Right notes and steady quarters after the take. The names are yours to say.",
          tab: `/4 6:0 5:0 4:0 3:0 | 2:0 1:0 2:0 3:0 | 4:0 5:0 /2 6:0`,
          position: 1,
          harmony: { scale: ["E", "minorPentatonic"] },
          rungs: ladder(50, 110, 10),
          passAt: 80,
          ...named(0.8),
          selfCheck: [SAY_CHECK],
          minutes: 3,
        },
        {
          id: "low-e-naturals",
          title: "The low E string, by name",
          purpose: "E, F, G, A, B, C, D, E: the natural notes from the open string to the twelfth fret and back.",
          howTo: [
            "Quarter notes, 50 BPM up to a pass at 80.",
            "Open, 1, 3, 5, 7, 8, 10, 12, with the first finger walking. E to F and B to C are one fret; everything else is two.",
          ],
          coach: "Right notes and steady quarters after the take. Say the names; I can't hear them.",
          tab: naturals(6),
          position: 1,
          shifts: true,
          harmony: { ...C_MAJOR, cover: true },
          rungs: ladder(50, 110, 10),
          passAt: 80,
          ...named(0.8),
          selfCheck: [SAY_CHECK],
          minutes: 5,
        },
        {
          id: "a-string-naturals",
          title: "The A string, by name",
          purpose: "A, B, C, D, E, F, G, A: the same walk on the next string, where the one-fret steps fall in different places.",
          howTo: [
            "Quarter notes, 50 BPM up to a pass at 80.",
            "Open, 2, 3, 5, 7, 8, 10, 12. B to C is frets 2 to 3 and E to F is frets 7 to 8.",
          ],
          coach: "Right notes and steady quarters after the take. Say the names; I can't hear them.",
          tab: naturals(5),
          position: 2,
          shifts: true,
          harmony: { ...C_MAJOR, cover: true },
          rungs: ladder(50, 110, 10),
          passAt: 80,
          ...named(0.8),
          selfCheck: [SAY_CHECK],
          minutes: 5,
        },
        {
          id: "two-places",
          title: "The same note in two places",
          purpose: "A, B, C, D and E on the low E string, each followed by the very same note on the A string, five frets lower. This is how the guitar is tuned, and why one note has several homes.",
          howTo: [
            "Quarter notes, 50 BPM up to a pass at 80.",
            "Fret 5 on the low E string, then the open A string: the same A. Then fret 7 and fret 2, fret 8 and fret 3, fret 10 and fret 5, fret 12 and fret 7.",
          ],
          coach: "Each pair should sound like one note played twice. I check the pitch, not which string you found it on.",
          tab: `/4 6:5f1 5:0 6:7f1 5:2f1 | 6:8f1 5:3f1 6:10f1 5:5f1 | /2 6:12f1 5:7f1`,
          position: 5,
          shifts: true,
          harmony: C_MAJOR,
          rungs: ladder(50, 110, 10),
          passAt: 80,
          ...named(0.8),
          selfCheck: ["Did each pair sound like the same note twice?"],
          minutes: 5,
        },
      ],
    },
    {
      id: "octaves",
      title: "Octave shapes",
      goal: "Find the same note an octave higher with one hand shape, from every string.",
      why: "An octave is the same note, higher. On the guitar it is a shape: two strings over and two frets up from the low E or A string, two strings over and three frets up from the D or G string. With it, the two strings you know name the other four.",
      howTo: [
        "From the low E or A string: first finger on the note, third finger two strings over and two frets up.",
        "From the D or G string the shape is one fret wider, because of how the B string is tuned: first finger and little finger, three frets up.",
        "Say the note's name once for the pair. It is one note in two places.",
      ],
      payoff: "Every A on the neck, found in one take without hunting.",
      exercises: [
        {
          id: "octave-e-d",
          title: "Octaves from the low E string",
          purpose: "G, A, B and C on the low E string, each answered by its octave on the D string.",
          howTo: [
            "Quarter notes, 50 BPM up to a pass at 80.",
            "First finger on the low E string, third finger on the D string two frets up: 3 and 5, 5 and 7, 7 and 9, 8 and 10, and back.",
          ],
          coach: "Right notes and steady quarters after the take.",
          tab: octaves(6, 4, 2, [3, 5, 7, 8], 3),
          position: 3,
          shifts: true,
          harmony: C_MAJOR,
          rungs: ladder(50, 110, 10),
          passAt: 80,
          ...named(0.8),
          minutes: 5,
        },
        {
          id: "octave-a-g",
          title: "Octaves from the A string",
          purpose: "C, D, E and F on the A string, each answered by its octave on the G string. The same shape, moved over one string.",
          howTo: [
            "Quarter notes, 50 BPM up to a pass at 80.",
            "First finger on the A string, third finger on the G string two frets up: 3 and 5, 5 and 7, 7 and 9, 8 and 10, and back.",
          ],
          coach: "Right notes and steady quarters after the take.",
          tab: octaves(5, 3, 2, [3, 5, 7, 8], 3),
          position: 3,
          shifts: true,
          harmony: C_MAJOR,
          rungs: ladder(50, 110, 10),
          passAt: 80,
          ...named(0.8),
          minutes: 5,
        },
        {
          id: "octave-d-b",
          title: "Octaves from the D and G strings",
          purpose: "The wider shape, three frets up: from the D string to the B string, and from the G string to the top string.",
          howTo: [
            "Quarter notes, 50 BPM up to a pass at 80.",
            "From the D string: first finger on the D string, little finger on the B string three frets up: 2 and 5, 3 and 6, 5 and 8, 7 and 10, and back. The G string to the top string works the same way.",
          ],
          coach: "Right notes and steady quarters after the take.",
          vary: {
            values: { stringSet: ["D and B strings", "G and top E strings"] },
            pooled: ["stringSet"],
            label: (p) => p.stringSet,
            build: (p) =>
              p.stringSet === "D and B strings"
                ? { tab: octaves(4, 2, 3, [2, 3, 5, 7], 4), position: 2 }
                : { tab: octaves(3, 1, 3, [2, 4, 5, 7], 4), position: 2 },
          },
          tab: octaves(4, 2, 3, [2, 3, 5, 7], 4),
          position: 2,
          shifts: true,
          harmony: C_MAJOR,
          rungs: ladder(50, 110, 10),
          passAt: 80,
          ...named(0.8),
          minutes: 5,
        },
        {
          id: "every-a",
          title: "Every A up to the twelfth fret",
          purpose: "One note, seven places: the low E string's fret 5, its octave on the D string, on up to the top string, then back through the G string and the open A string to the twelfth fret.",
          howTo: [
            "Half notes, two clicks each, 50 BPM up to a pass at 80.",
            "Low E string 5, D string 7, B string 10, top string 5, G string 2, the open A string, then the A string at fret 12. Each one is found from the one before by an octave shape or a same-note pair.",
            VARIANT_NOTE,
          ],
          coach: "Every note here is an A, so I check that each one is. Finding them without hunting is the skill.",
          vary: {
            values: { key: ["A", "G", "C", "D"] },
            pooled: ["key"],
            label: (p) => `Every ${p.key}`,
            build: (p) => {
              const tabs: Record<string, [string, number]> = {
                A: [`/2 6:5f1 4:7f3 | 2:10f1 1:5f1 | 3:2f1 5:0 | /1 5:12f1`, 5],
                G: [`/2 6:3f1 4:5f3 | 2:8f1 1:3f1 | 3:0 5:10f1 | /1 3:12f1`, 3],
                C: [`/2 5:3f1 3:5f3 | 1:8f1 6:8f1 | 4:10f3 2:1f1 | /1 2:13f1`, 3],
                D: [`/2 5:5f1 3:7f3 | 1:10f1 6:10f1 | 4:12f3 2:3f1 | /1 4:0`, 5],
              };
              const [tab, position] = tabs[p.key];
              return { tab, position, harmony: { scale: [p.key, "majorPentatonic"] as [string, string] } };
            },
          },
          tab: `/2 6:5f1 4:7f3 | 2:10f1 1:5f1 | 3:2f1 5:0 | /1 5:12f1`,
          position: 5,
          shifts: true,
          harmony: { scale: ["A", "majorPentatonic"] },
          rungs: ladder(50, 110, 10),
          passAt: 80,
          ...named(0.7),
          selfCheck: [EYES_CHECK],
          minutes: 5,
        },
      ],
    },
    {
      id: "upper-strings",
      title: "The D, G and B strings",
      goal: "Name and play the natural notes on the D, G and B strings, and find one note on all six strings.",
      why: "The octave shape gets you to these strings; walking them by name makes them familiar. The B string is the odd one, tuned a fret lower than the pattern of the others, which is why every shape changes when it crosses onto it.",
      howTo: [
        "The same walk as before, one string at a time, saying each name.",
        "Check any note with an octave shape back to the low E or A string if you are unsure.",
        "The top E string has the same notes as the low E string, two octaves up. You already know it.",
      ],
      payoff: "C on all six strings, one after another, with no hesitation.",
      difficultyException:
        "One string at a time again, so fewer string changes than the octave shapes before it. The demand is three new strings to know by name, which the metric does not count.",
      exercises: [
        {
          id: "d-string-naturals",
          title: "The D string, by name",
          purpose: "D, E, F, G, A, B, C, D on the D string, up and back.",
          howTo: [
            "Quarter notes, 50 BPM up to a pass at 85.",
            "Open, 2, 3, 5, 7, 9, 10, 12. E to F is frets 2 to 3 and B to C is frets 9 to 10.",
          ],
          coach: "Right notes and steady quarters after the take. Say the names; I can't hear them.",
          tab: naturals(4),
          position: 2,
          shifts: true,
          harmony: { ...C_MAJOR, cover: true },
          rungs: ladder(50, 110, 10),
          passAt: 85,
          ...named(0.8),
          selfCheck: [SAY_CHECK],
          minutes: 5,
        },
        {
          id: "g-string-naturals",
          title: "The G string, by name",
          purpose: "G, A, B, C, D, E, F, G on the G string, up and back.",
          howTo: [
            "Quarter notes, 50 BPM up to a pass at 85.",
            "Open, 2, 4, 5, 7, 9, 10, 12. B to C is frets 4 to 5 and E to F is frets 9 to 10.",
          ],
          coach: "Right notes and steady quarters after the take. Say the names; I can't hear them.",
          tab: naturals(3),
          position: 2,
          shifts: true,
          harmony: { ...C_MAJOR, cover: true },
          rungs: ladder(50, 110, 10),
          passAt: 85,
          ...named(0.8),
          selfCheck: [SAY_CHECK],
          minutes: 5,
        },
        {
          id: "b-string-naturals",
          title: "The B string, by name",
          purpose: "B, C, D, E, F, G, A, B on the B string, up and back. It starts with a one-fret step.",
          howTo: [
            "Quarter notes, 50 BPM up to a pass at 85.",
            "Open, 1, 3, 5, 6, 8, 10, 12. B to C is the open string to fret 1 and E to F is frets 5 to 6.",
          ],
          coach: "Right notes and steady quarters after the take. Say the names; I can't hear them.",
          tab: naturals(2),
          position: 1,
          shifts: true,
          harmony: { ...C_MAJOR, cover: true },
          rungs: ladder(50, 110, 10),
          passAt: 85,
          ...named(0.8),
          selfCheck: [SAY_CHECK],
          minutes: 5,
        },
        {
          id: "one-note-six-strings",
          title: "One note on six strings",
          purpose: "The same note name found once on every string, low to high, then home. A different note comes round on each Take.",
          howTo: [
            "Half notes, two clicks each, 50 BPM up to a pass at 80.",
            "For C: low E string 8, A string 3, D string 10, G string 5, B string 1, top string 8, and back to the A string. Look ahead to the next string while the note rings.",
          ],
          coach: "Every note has the same name, so I check that each one does. Two clicks a note is time to find the next.",
          vary: {
            values: { key: ["C", "G", "D", "A", "E", "F"] },
            pooled: ["key"],
            label: (p) => `Every ${p.key}`,
            build: (p) => {
              const pc = pcOfName(p.key);
              const fret = (string: number) => {
                const f = (pc - open(string) + 120) % 12;
                return f === 0 ? `${string}:0` : `${string}:${f}f1`;
              };
              const tab = `/2 ${fret(6)} ${fret(5)} | ${fret(4)} ${fret(3)} | ${fret(2)} ${fret(1)} | /1 ${fret(5)}`;
              return { tab, position: handAt(tab), harmony: { scale: [p.key, "majorPentatonic"] as [string, string] } };
            },
          },
          tab: `/2 6:8f1 5:3f1 | 4:10f1 3:5f1 | 2:1f1 1:8f1 | /1 5:3f1`,
          position: 8,
          shifts: true,
          harmony: { scale: ["C", "majorPentatonic"] },
          rungs: ladder(50, 110, 10),
          passAt: 80,
          ...named(0.7),
          selfCheck: [EYES_CHECK],
          minutes: 6,
        },
      ],
    },
    {
      id: "thirds",
      title: "Thirds",
      goal: "See a major third and a minor third as two small shapes, and play a scale in thirds on two strings.",
      why: "A third is two notes of a scale with one skipped between them: C and E, D and F. Chords are stacked thirds, and whether the bottom one is major (four frets) or minor (three) is what makes a chord happy or sad. On two neighbouring strings each is a shape you can see.",
      howTo: [
        "On the G and B strings a major third is the same fret on both strings, and a minor third is one fret lower on the B string.",
        "On the B and top strings, and every other pair, the top note sits one fret further back: a major third is one fret lower, a minor third two.",
        "Play the lower note, then the upper, and say major or minor for each pair.",
      ],
      payoff: "A scale in thirds up the neck that sounds like two guitars, and a phrase that follows three chords with them.",
      exercises: [
        {
          id: "thirds-g-b",
          title: "Thirds on the G and B strings",
          purpose: "A major scale in broken thirds: a scale note on the G string, then the third above it on the B string, five pairs up and back.",
          howTo: [
            "Straight eighths, two to a click, 50 BPM up to a pass at 80.",
            "In C: frets 5 and 5, 7 and 6, 9 and 8, 10 and 10, 12 and 12. Same fret is major; one fret back on the B string is minor.",
          ],
          coach: "Right notes and even eighths after the take. Major or minor is yours to name.",
          vary: {
            values: { key: ["C", "D", "E", "F", "A"] },
            pooled: ["key"],
            label: (p) => `${p.key} major`,
            build: (p) => {
              const tab = thirdsOnGB(p.key);
              return { tab, position: handAt(tab), shifts: true, harmony: { scale: [p.key, "major"] as [string, string] } };
            },
          },
          tab: thirdsOnGB("C"),
          position: 5,
          shifts: true,
          harmony: C_MAJOR,
          rungs: ladder(50, 110, 10),
          passAt: 80,
          ...named(),
          minutes: 6,
        },
        {
          id: "thirds-top",
          title: "Thirds on the top two strings",
          purpose: "The same scale in thirds on the B and top strings, where the shapes are one fret different: minor is two frets back, major one.",
          howTo: [
            "Straight eighths, 50 BPM up to a pass at 80.",
            "In C: B string 5 with top string 3, then 6 and 5, 8 and 7, 10 and 8, 12 and 10, and back.",
          ],
          coach: "Right notes and even eighths after the take.",
          tab: THIRDS_TOP,
          position: 3,
          shifts: true,
          harmony: C_MAJOR,
          rungs: ladder(50, 110, 10),
          passAt: 80,
          ...named(),
          minutes: 6,
        },
        {
          id: "thirds-tune",
          title: "Thirds through C, F and G",
          purpose: "Two thirds from each chord, played over a band: the root with its third, then the third with the fifth. C, F, G and home to C.",
          howTo: [
            "Straight eighths, 60 BPM up to a pass at 90.",
            "C: frets 5 and 5, then 9 and 8. F: 10 and 10, then 14 and 13. G: 12 and 12, then 16 and 15. Every note is a note of the chord under it.",
          ],
          coach: "Band on. Right notes and time after the take.",
          tab: THIRDS_TUNE,
          position: 5,
          shifts: true,
          chords: "C | F | G | C",
          jam: ROCK("C"),
          harmony: { chordTones: true },
          rungs: ladder(60, 110, 10),
          passAt: 90,
          ...named(),
          minutes: 6,
        },
      ],
    },
    {
      id: "roots",
      title: "Roots, fourths and fifths",
      goal: "Find the roots of a I-IV-V and of a minor progression on the low strings, by shape, and play them under a band.",
      why: "Most songs move between a handful of chords, and their roots sit in a pattern on the two low strings: the fourth is the same fret one string higher, the fifth two frets above that. Seeing that pattern is how players follow a song they have never heard.",
      howTo: [
        "From a root on the low E string: the IV chord's root is the same fret on the A string, and the V chord's root is two frets higher on the A string.",
        "The fifth of any note is also the top of its power chord: one string higher, two frets up.",
        "Say the chord names as you change. In A the three are A, D and E.",
      ],
      payoff: "You play the roots of a three-chord song in any key, and of a minor four-chord song, in time with a band.",
      exercises: [
        {
          id: "one-four-five",
          title: "One, four, five in five keys",
          purpose: "The three roots of a key as one shape on the low two strings. A different key comes round on each Take.",
          howTo: [
            "Quarter notes, 60 BPM up to a pass at 90.",
            "Root twice, fourth twice, fifth twice, fourth twice, and round again. First finger on the root and the fourth, third finger on the fifth.",
          ],
          coach: "Right notes and steady quarters after the take. Name the three chords of the key before you start.",
          vary: {
            values: { key: ["G", "A", "B", "C", "D"] },
            pooled: ["key"],
            label: (p) => `In ${p.key}`,
            build: (p) => ({ ...oneFourFive(p.key), harmony: { scale: [p.key, "major"] as [string, string] } }),
          },
          tab: oneFourFive("G").tab,
          position: 3,
          harmony: { scale: ["G", "major"] },
          rungs: ladder(60, 120, 10),
          passAt: 90,
          ...named(0.8),
          minutes: 5,
        },
        {
          id: "roots-and-fifths",
          title: "Roots and fifths with the band",
          purpose: "A, D and E over a rock band: each chord's root twice and its fifth twice, in eighths. What a bass player does, on your two low strings.",
          howTo: [
            "Straight eighths, 60 BPM up to a pass at 90.",
            "A: low E string 5, A string 7. D: A string 5, D string 7. E: A string 7, D string 9. Then back to A and hold it.",
          ],
          coach: "Band on. Right notes and time after the take.",
          tab: FIFTHS_BAND,
          position: 5,
          shifts: true,
          chords: "A | D | E | A",
          jam: ROCK("A"),
          harmony: { chordTones: true },
          rungs: ladder(60, 130, 10),
          passAt: 90,
          ...named(),
          minutes: 6,
        },
        {
          id: "root-octaves",
          title: "Roots and octaves: Am, F, C, G",
          purpose: "The roots of a minor four-chord song, each with its octave shape, over a band. Three of them are on the low E string, one on the A string, and the shape is the same.",
          howTo: [
            "Quarter notes, 60 BPM up to a pass at 90.",
            "Am: low E string 5 and D string 7. F: fret 1 and fret 3. C: A string 3 and G string 5. G: low E string 3 and D string 5.",
          ],
          coach: "Band on. Right notes and time after the take. The jump to F is the long one.",
          tab: ROOT_OCTAVES,
          position: 5,
          shifts: true,
          chords: "Am | F | C | G",
          jam: ROCK("A minor"),
          harmony: { chordTones: true },
          rungs: ladder(60, 130, 10),
          passAt: 90,
          ...named(),
          minutes: 6,
        },
      ],
    },
    {
      id: "triads",
      title: "Triads on the top strings",
      goal: "Play a major and a minor triad in three places on the top three strings, and move between three chords with the nearest shapes.",
      why: "A triad is a root, a third and a fifth: the whole chord in three notes. On the top three strings there are three shapes for each one, depending on which note is on top, and together they cover the neck. They are the bridge between knowing notes and playing harmony.",
      howTo: [
        "Each shape holds the same three notes in a different order. Say which note is on the top string: the fifth, the root, or the third.",
        "Hold the shape like a small chord and pick the strings one at a time.",
        "Moving between chords, look for the shape nearest to where your hand already is.",
      ],
      payoff: "C, F and G as three small shapes under one hand, over a band.",
      exercises: [
        {
          id: "c-three-places",
          title: "C major in three places",
          purpose: "The C triad's three shapes on the top strings, at frets 3 to 5, 8 to 9 and 12 to 13, each rolled up and back.",
          howTo: [
            "Straight eighths, 50 BPM up to a pass at 80.",
            "G string 5, B string 5, top string 3. Then 9, 8, 8. Then 12, 13, 12. The same three letters every time: C, E and G.",
          ],
          coach: "Right notes and even eighths after the take.",
          tab: C_TRIADS,
          position: 3,
          shifts: true,
          harmony: { arpeggio: "C", cover: true },
          rungs: ladder(50, 110, 10),
          passAt: 80,
          ...named(),
          minutes: 6,
        },
        {
          id: "am-three-places",
          title: "A minor in three places",
          purpose: "The A minor triad's three shapes on the top strings. Compare each with the C shapes: one note is different.",
          howTo: [
            "Straight eighths, 50 BPM up to a pass at 80.",
            "All three strings at fret 5. Then G string 9, B string 10, top string 8. Then 14, 13, 12. The letters are A, C and E.",
          ],
          coach: "Right notes and even eighths after the take.",
          tab: AM_TRIADS,
          position: 5,
          shifts: true,
          harmony: { arpeggio: "Am", cover: true },
          rungs: ladder(50, 110, 10),
          passAt: 80,
          ...named(),
          minutes: 6,
        },
        {
          id: "near-triads",
          title: "C, F and G without moving",
          purpose: "Three chords from shapes that sit next to each other at the bottom of the neck, over a band. The hand barely moves; the harmony changes completely.",
          howTo: [
            "Straight eighths, 60 BPM up to a pass at 90.",
            "C: G string 5, B string 5, top string 3. F: 5, 6, 5. G: 4, 3, 3. Each bar rolls its shape up and back twice.",
          ],
          coach: "Band on. Right notes and time after the take.",
          tab: NEAR_TRIADS,
          position: 3,
          shifts: true,
          chords: "C | F | G | C",
          jam: ROCK("C"),
          harmony: { chordTones: true },
          rungs: ladder(60, 120, 10),
          passAt: 90,
          ...named(),
          minutes: 6,
        },
      ],
    },
    {
      id: "five-boxes",
      title: "The five boxes, joined up",
      goal: "Play all five boxes of A minor pentatonic and move between them along two strings.",
      why: "The pentatonic scale is five notes, and up the neck they make five overlapping shapes. Most players know the first and get stuck in it. The boxes are not five scales: they are one scale, and each box shares a wall with the next. Walking that wall on two strings is how the neck opens up.",
      howTo: [
        "Each box starts on the next note of the scale on the low E string: A at fret 5, C at 8, D at 10, E at 12, G at 15 (or 3).",
        "The top notes of one box are the bottom notes of the next. Look for the frets they share.",
        "Find the A's in each box before you play it. They are your way home.",
      ],
      payoff: "One phrase that climbs three octaves, and a ladder up two strings through four of the boxes.",
      difficultyException:
        "No band and no chord changes here, both of which the metric counts on a Theory Path. The demand is five positions and the shifts between them.",
      exercises: [
        {
          id: "each-box",
          title: "Each box, up and down",
          purpose: "One box of A minor pentatonic, all six strings, up and back. A different box comes round on each Take.",
          howTo: [
            "Straight eighths, 50 BPM up to a pass at 85.",
            "Two notes a string. Before you start, find the two or three A's in the box and say where they are.",
          ],
          coach: "Right notes and even eighths after the take.",
          vary: {
            values: { position: ["box 1", "box 2", "box 3", "box 4", "box 5"] },
            pooled: ["position"],
            label: (p) => `A minor pentatonic, ${p.position}`,
            build: (p) => {
              const tab = `/8 ${pentatonic({ root: "A", box: Number(p.position.slice(-1)), sequence: "updown" })} hold`;
              return { tab, position: handAt(tab), shifts: true };
            },
          },
          tab: `/8 ${pentatonic({ root: "A", box: 1, sequence: "updown" })} hold`,
          position: 5,
          harmony: { scale: ["A", "minorPentatonic"], cover: true },
          rungs: ladder(50, 120, 10),
          passAt: 85,
          ...named(),
          minutes: 6,
        },
        {
          id: "ladder",
          title: "The ladder on two strings",
          purpose: "The G and B strings only, four notes from each box, climbing from box 1 at fret 5 to box 4 at fret 12 and back down. The joins between boxes are all there is.",
          howTo: [
            "Straight eighths, 50 BPM up to a pass at 85.",
            "Each beat pair is one box: G string two notes, B string two notes. The hand moves up to where the last box ended.",
          ],
          coach: "Right notes and even eighths after the take. The shifts are where the time moves.",
          tab: LADDER,
          position: 5,
          shifts: true,
          harmony: { scale: ["A", "minorPentatonic"] },
          rungs: ladder(50, 120, 10),
          passAt: 85,
          ...named(),
          minutes: 6,
        },
        {
          id: "three-octaves",
          title: "One phrase, three octaves",
          purpose: "A, C, D, E on the low strings, the same four notes an octave up, and again an octave above that, ending on the A at fret 17. One idea, carried across the whole neck.",
          howTo: [
            "Straight eighths, 50 BPM up to a pass at 85.",
            "Low E string 5 and 8, A string 5 and 7. Then D string 7 and 10, G string 7 and 9. Then B string 10 and 13, top string 10 and 12, and hold the top string at 17. The same shape three times: first and little finger, then first and third.",
          ],
          coach: "Right notes and even eighths after the take.",
          tab: THREE_OCTAVES,
          position: 5,
          shifts: true,
          loops: false,
          harmony: { scale: ["A", "minorPentatonic"] },
          rungs: ladder(50, 120, 10),
          passAt: 85,
          ...named(),
          minutes: 5,
        },
      ],
    },
    {
      id: "arpeggios",
      title: "Arpeggios up the neck",
      goal: "Play an A minor and a C major arpeggio from the low strings to the top, and four chords as arpeggios in one position.",
      why: "An arpeggio is a chord played one note at a time, and it is the surest way to sound like you know where you are in a song. Up the neck it links the triad shapes you know; in one position it shows that every chord of a song is already under your hand.",
      howTo: [
        "Say the letters as you play: A, C, E for A minor; C, E, G for C major. There are only three, repeating.",
        "Going up the neck, the hand moves once, on the G string: fret 5 with the first finger, then fret 9 with the second.",
        "In one position, keep the fingers down like a chord where you can and pick one string at a time.",
      ],
      payoff: "Four chords spelled out in fifth position over a band, without the hand leaving.",
      difficultyException:
        "The arpeggios up the neck are slower than the box runs before them: every note is a chord tone that has to be found, and two of the lines shift three times.",
      exercises: [
        {
          id: "am-up",
          title: "A minor, low to high",
          purpose: "A, C, E from the low E string's fret 5 to the top string's fret 12 and back to the A in the middle, through two hand positions.",
          howTo: [
            "Straight eighths, 50 BPM up to a pass at 80.",
            "Low E string 5 and 8, A string 7, D string 7, G string 5 and 9, B string 10, top string 8 and 12, then back down to the D string. The hand moves up once, on the G string, from fret 5 to fret 9.",
          ],
          coach: "Right notes and even eighths after the take. Say A, C, E as you go.",
          tab: AM_UP,
          position: 5,
          shifts: true,
          loops: false,
          harmony: { arpeggio: "Am", cover: true },
          rungs: ladder(50, 110, 10),
          passAt: 80,
          ...named(0.7),
          minutes: 6,
        },
        {
          id: "c-up",
          title: "C major, low to high",
          purpose: "C, E, G through the open C chord you already know, one string at a time, up to the C at the top string's fret 8 and back.",
          howTo: [
            "Straight eighths, 50 BPM up to a pass at 80.",
            "Hold an open C chord: A string 3, D string 2, open G, B string 1, open top string. Then the top string at 3 and at 8, and back down. Say which of C, E and G each string is.",
          ],
          coach: "Right notes and even eighths after the take. Say C, E, G as you go.",
          tab: C_UP,
          position: 1,
          shifts: true,
          loops: false,
          harmony: { arpeggio: "C", cover: true },
          rungs: ladder(50, 110, 10),
          passAt: 80,
          ...named(0.7),
          minutes: 6,
        },
        {
          id: "changes-in-position",
          title: "Am, F, C, G in one position",
          purpose: "Four chords as four small arpeggios on the top four strings at the fifth fret, over a band. Between Am and F one note moves.",
          howTo: [
            "Straight eighths, 60 BPM up to a pass at 90.",
            "Each bar goes up its four notes and back. Am: 7, 5, 5, 5. F: 7, 5, 6, 5. C: 5, 5, 5, 8. G: 5, 7, 8, 7, from the D string to the top string.",
            VARIANT_NOTE,
          ],
          coach: "Band on. Right notes and time after the take.",
          vary: {
            values: { key: ["A", "B", "C", "D"] },
            pooled: ["key"],
            label: (p) => `In ${p.key} minor`,
            build: (p) => {
              const shift = { A: 0, B: 2, C: 3, D: 5 }[p.key] ?? 0;
              const tab = shiftFrets(CHANGES_ARPS, shift);
              return { tab, position: handAt(tab), chords: moveChart("Am | F | C | G", shift), jam: ROCK(`${p.key} minor`) };
            },
          },
          tab: CHANGES_ARPS,
          position: 5,
          chords: "Am | F | C | G",
          jam: ROCK("A minor"),
          harmony: { chordTones: true },
          rungs: ladder(60, 120, 10),
          passAt: 90,
          ...named(),
          minutes: 7,
        },
      ],
    },
    {
      id: "the-changes",
      title: "Following the changes",
      goal: "Land on a note of each chord as a progression goes by, in one position, and know which note of the chord it is.",
      why: "This is what the whole Path is for. A solo that follows the chords sounds like music; one that ignores them sounds like a scale. The trick is small: know where the root, third and fifth of each chord are under your hand, and be on one of them when the chord arrives.",
      howTo: [
        "Stay around the fifth fret. Every chord of Am, F, C, G has its three notes within reach of one hand there.",
        "The third is the note that says the most about a chord. Am: C. F: A. C: E. G: B.",
        "Say the chord's name on beat 1 of each bar.",
      ],
      payoff: "A line of your own that lands on a chord tone at every change.",
      exercises: [
        {
          id: "thirds-of-the-chords",
          title: "The third of every chord",
          purpose: "One note a chord, played twice: C over Am, A over F, E over C, B over G. Four notes that outline the whole progression.",
          howTo: [
            "Half notes, two to a bar, 60 BPM up to a pass at 90.",
            "G string 5, D string 7, B string 5, G string 4. Sit a fret low, in fourth position: second finger on the frets at 5, fourth on the D string's 7, first on the B at fret 4.",
          ],
          coach: "Band on. Right notes after the take: each one is the third of its chord.",
          tab: THIRDS_LINE,
          position: 4,
          chords: "Am | F | C | G",
          jam: ROCK("A minor"),
          harmony: { chordTones: true },
          rungs: ladder(60, 120, 10),
          passAt: 90,
          ...named(0.7),
          minutes: 5,
        },
        {
          id: "root-third-fifth",
          title: "Root, third, fifth",
          purpose: "Each chord spelled in quarter notes: root, third, fifth, third. The same progression, with all three notes of every chord.",
          howTo: [
            "Quarter notes, 60 BPM up to a pass at 90.",
            "Am: D string 7, G string 5, B string 5. F: A string 8, D string 7, G string 5. C: G string 5, B string 5 and 8. G: D string 5, G string 4 and 7. Everything stays within a fret of fifth position.",
          ],
          coach: "Band on. Right notes and steady quarters after the take.",
          tab: ROOT_THIRD_FIFTH,
          position: 5,
          shifts: true,
          chords: "Am | F | C | G",
          jam: ROCK("A minor"),
          harmony: { chordTones: true },
          rungs: ladder(60, 120, 10),
          passAt: 90,
          ...named(0.7),
          minutes: 6,
        },
        {
          id: "land-on-a-chord-tone",
          title: "Your turn: land on a chord tone",
          purpose: "Free playing in A minor over Am, F, C, G, with one rule: on beat 1 of every bar you are on a note of that chord.",
          howTo: [
            "Straight eighths or longer, 60 to 90 BPM.",
            "Start with only the thirds from the first Exercise, held long. Then add a few notes between them. The written line is an example.",
            NOT_CHECKED_YET,
          ],
          coach: "Not checked yet. Record it and listen to beat 1 of each bar.",
          tab: LANDING_EXAMPLE,
          position: 4,
          shifts: true,
          chords: "Am | F | C | G",
          jam: ROCK("A minor"),
          rungs: ladder(60, 90, 10),
          ...YOUR_TURN,
          selfCheck: [
            "Did beat 1 of each bar land on the root, third or fifth of its chord?",
            "Could you name the note you landed on?",
          ],
          minutes: 5,
        },
      ],
    },
  ],
  levels: [
    {
      id: "beginner",
      title: "Beginner: the notes by name",
      summary: "The natural notes on every string, and the octave shapes that connect them.",
      reachLevel: "early-intermediate",
      startHereIf: [
        "You can play quarter notes with a click at 70 BPM.",
        "You couldn't say what note is at fret 8 of the low E string without counting up.",
        "You know chord shapes and box shapes, and not the names of the notes in them.",
      ],
      steps: ["low-strings", "octaves", "upper-strings"],
      warmups: [
        {
          id: "walk-a-string",
          title: "A walk up one string",
          purpose: "Three notes of a major scale on one string, up and back, a step higher each bar. A different key and string each time.",
          howTo: ["Quarter notes, well under your clean tempo. Say each note's name, and move the hand up a note at each bar line."],
          coach: "This is a warm-up. It tells you how it went, and it decides nothing.",
          vary: {
            values: { key: ["C", "G", "F"], stringSet: ["6", "5", "4", "3"] },
            pooled: ["key", "stringSet"],
            label: (p) => `${p.key} major on string ${p.stringSet}`,
            build: (p) => {
              const bars = oneStringClimb({ root: p.key, scale: "major", string: Number(p.stringSet), from: 1, cell: [0, 1, 2, 1], bars: 4 });
              const tab = bars.split(" | ").map((bar) => `/4 ${bar}`).join(" | ");
              return { tab, position: handAt(tab), shifts: true, harmony: { scale: [p.key, "major"] as [string, string] } };
            },
          },
          grade: "warmup",
          warmup: { start: 0.6, top: 0.8, reference: "low-strings.low-e-naturals", fallback: 60 },
          rungs: ladder(50, 100, 10),
          minutes: 3,
        },
      ],
    },
    {
      id: "intermediate",
      title: "Intermediate: the shapes of harmony",
      summary: "Thirds on two strings, roots and fifths on the low strings, and triads on the top three.",
      reachLevel: "early-intermediate",
      startHereIf: [
        "You can name any natural note on the low E and A strings within 2 seconds.",
        "You can find a note's octave by shape.",
        "You play chords without knowing which note is the third.",
      ],
      steps: ["thirds", "roots", "triads"],
      warmups: [
        {
          id: "thirds-around",
          title: "Thirds in a new key",
          purpose: "A major scale in broken thirds on the G and B strings, five pairs up and back. A different key each time.",
          howTo: ["Straight eighths, well under your clean tempo. Lower note, then upper; say major or minor for each pair."],
          coach: "This is a warm-up. It tells you how it went, and it decides nothing.",
          vary: {
            values: { key: ["C", "D", "E", "F", "A", "Bb"] },
            pooled: ["key"],
            label: (p) => `${p.key} major`,
            build: (p) => {
              const tab = thirdsOnGB(p.key);
              return { tab, position: handAt(tab), shifts: true, harmony: { scale: [p.key, "major"] as [string, string] } };
            },
          },
          grade: "warmup",
          warmup: { start: 0.6, top: 0.8, reference: "thirds.thirds-g-b", fallback: 50 },
          rungs: ladder(50, 100, 10),
          minutes: 3,
        },
      ],
    },
    {
      id: "advanced",
      title: "Advanced: the whole neck, and the changes",
      summary: "The five pentatonic boxes joined along two strings, arpeggios from the low strings to the top, and landing on chord tones over a band.",
      reachLevel: "intermediate",
      startHereIf: [
        "You can play a C major triad in 3 places on the top three strings.",
        "You can find the roots of a I-IV-V in any key on the low strings.",
        "You know box 1 of the pentatonic scale and get lost above it, or your solos ignore the chords.",
      ],
      steps: ["five-boxes", "arpeggios", "the-changes"],
      warmups: [
        {
          id: "two-boxes-up",
          title: "Up one box, down the next",
          purpose: "A minor pentatonic box going up and the box above it coming down. A different key and pair of boxes each time.",
          howTo: ["Straight eighths, well under your clean tempo. Hold the top note, move the hand up to the next box, and come down."],
          coach: "This is a warm-up. It tells you how it went, and it decides nothing.",
          vary: {
            values: { key: ["A", "G", "C"], position: ["boxes 1 and 2", "boxes 2 and 3", "boxes 3 and 4"] },
            pooled: ["key", "position"],
            label: (p) => `${p.key} minor pentatonic, ${p.position}`,
            build: (p) => {
              const box = Number(p.position[6]);
              const tab = `/8 ${pentatonic({ root: p.key, box, sequence: "up" })} hold | /8 ${pentatonic({ root: p.key, box: box + 1, sequence: "down" })} hold`;
              return { tab, position: handAt(tab), shifts: true, harmony: { scale: [p.key, "minorPentatonic"] as [string, string] } };
            },
          },
          grade: "warmup",
          warmup: { start: 0.6, top: 0.8, reference: "five-boxes.each-box", fallback: 50 },
          rungs: ladder(50, 100, 10),
          minutes: 4,
        },
      ],
    },
  ],
});
