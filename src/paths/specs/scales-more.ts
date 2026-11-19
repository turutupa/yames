/**
 * Scales and Modes: consolidation Steps (2026-11-19). Drafts, like the Path
 * they belong to.
 *
 * The Path feeds Triads and Chords in a Key, and what they need from it is
 * keys. Three Steps, one a Level: what a key is (C, G and D by name, one tune
 * in two keys, and the first, fourth and fifth notes as roots under a band);
 * the major scale from a root on the A string, joined to the shape from the
 * low E string; and the two modes in a second key each (E Dorian, D
 * Mixolydian). Every id is new, so nobody's progress moves.
 *
 * Helpers the Path file also has (`inKeys`, the say-it check) are copied, not
 * imported: the Path imports these Steps.
 */
import type { StepSpec, VariantParams } from "../spec";
import { ladder, moveChart, shiftFrets } from "../templates";
import { ROCK, named } from "./triadShapes";

const SAY_CHECK = "Did you say each note's name, or its number in the scale, as you played it?";

/** A major-scale line moved along the neck to other keys. `shifts` is frets from the written line. */
function inKeys(tab: string, shifts: Readonly<Record<string, number>>, at: number) {
  return {
    values: { key: Object.keys(shifts) },
    pooled: ["key"] as const,
    label: (p: VariantParams) => `${p.key} major`,
    build: (p: VariantParams) => ({
      tab: shiftFrets(tab, shifts[p.key]),
      position: at + shifts[p.key],
      harmony: { scale: [p.key, "major"] as [string, string], cover: true },
    }),
  };
}

/** The same frets one string higher: the low four strings are all a fourth apart. */
const oneStringOver = (tab: string) => tab.replace(/(\d):(\d+)/g, (_all, string, fret) => `${Number(string) - 1}:${fret}`);

// --- What a key is --------------------------------------------------------------

// The movable major shape, second finger on the root: C at the low E string's fret 8.
const C_BY_NAME = `/4 6:8 6:10 5:7 5:8 | 5:10 4:7 4:9 4:10 | 4:9 4:7 5:10 5:8 | 5:7 6:10 /2 6:8`;
// One hand at fret 9: G major from the A string, then D major from the low E string.
const G_THEN_D = `/8 5:10 5:12 4:9 4:10 4:12 3:9 3:11 3:12 | 3:11 3:9 4:12 4:10 4:9 5:12 /4 5:10 | /8 6:10 6:12 5:9 5:10 5:12 4:9 4:11 4:12 | 4:11 4:9 5:12 5:10 5:9 6:12 /4 6:10`;
// Notes one, one, two, three; then four, five and one: the roots of the band's three chords.
const ROOTS_IN_C = `/4 6:8 6:8 6:10 5:7 | /4 5:8 5:8 /2 5:8 | /4 5:10 5:10 /2 5:10 | /4 6:8 6:8 /2 6:8`;
const ROOTS: Readonly<Record<string, { tab: string; at: number; by: number }>> = {
  C: { tab: ROOTS_IN_C, at: 7, by: 0 },
  G: { tab: oneStringOver(shiftFrets(ROOTS_IN_C, 2)), at: 9, by: 7 },
  D: { tab: shiftFrets(ROOTS_IN_C, 2), at: 9, by: 2 },
  A: { tab: shiftFrets(ROOTS_IN_C, -3), at: 4, by: 9 },
};
// Four bars in C at fret 7; the same four bars two frets higher are in D.
const TUNE_IN_C = `/4 5:7f1 /8 5:8f2 5:10f4 /4 4:7f1 5:10f4 | /4 4:7f1 /8 4:10f4 4:7f1 /2 5:8f2 | /4 5:10f4 /8 4:7f1 4:9f3 /4 4:7f1 5:10f4 | /8 5:7f1 5:8f2 5:7f1 6:10f4 /2 6:8f2`;
const TUNE_TWO_KEYS = `${TUNE_IN_C} | ${shiftFrets(TUNE_IN_C, 2)}`;

/** Beginner, after the movable shape: the shape has just been moved "to change key", and this says what that is. */
export const WHAT_A_KEY_IS: StepSpec = {
  id: "what-a-key-is",
  title: "What a key is",
  goal: "Play the major shape in C, G and D by name, say which notes each key sharpens, and find the first, fourth and fifth notes of a key under a band.",
  why: "When you moved the shape, you changed key. A key is the seven notes of one major scale together with the note they call home, and it takes its name from that home. C major is the key with no sharps and no flats. Every other key needs some, because the pattern of whole and half steps stays the same wherever it starts: G major has one sharp, F#, and D major has two, F# and C#. The first, fourth and fifth notes of the scale are the ones a band leans on: the three main chords of a key are built on them.",
  howTo: [
    "The shape is the same in every key. With the second finger on the low E string at fret 8 the scale is C major. Two frets higher, at fret 10, it is D major.",
    "The low four strings are tuned the same distance apart, so the same fingers work from the A string. With the second finger on the A string at fret 10 the scale is G major. G major is also at the low E string's fret 3; it is played from the A string here so that it sits under the same hand as D.",
    "Count the scale as you play it, 1 to 8. The fourth note is under the second finger too: the same fret as the root, on the next higher string. The fifth note is two frets above the fourth, under the fourth finger.",
    "A sharp is not a special kind of note. It is where the pattern of steps lands when the scale starts on G or on D.",
    "The Exercise with the band comes round in four keys: C, G, D and A. A major is the same shape with the second finger on the low E string at fret 5, and it has three sharps: F#, C# and G#.",
  ],
  payoff: "Three keys you can name, the three notes a band's chords stand on, and one tune played in two keys.",
  exercises: [
    {
      id: "c-by-name",
      title: "C major by name: no sharps",
      purpose: "The shape with the second finger on C, the low E string's fret 8, slow enough to say every letter. C major is the key with no sharps and no flats.",
      howTo: [
        "Quarter notes, one to a click, 50 BPM up to a pass at 80.",
        "Low E string 8 and 10, A string 7, 8 and 10, D string 7, 9 and 10, and back down. Fingers 2 and 4, then 1, 2 and 4, then 1, 3 and 4.",
        "Say C, D, E, F, G, A, B, C on the way up, and the same letters backwards on the way down.",
      ],
      coach: "Right notes and steady quarters after the take. The names are yours to say.",
      tab: C_BY_NAME,
      position: 7,
      harmony: { scale: ["C", "major"], cover: true },
      rungs: ladder(50, 110, 10),
      passAt: 80,
      ...named(0.8),
      selfCheck: [SAY_CHECK],
      minutes: 4,
    },
    {
      id: "g-and-d",
      title: "G, then D: one sharp, then two",
      purpose: "Two keys under one hand at fret 9. G major, from the A string, has one sharp: F#. D major, from the low E string, keeps that F# and adds C#.",
      howTo: [
        "Straight eighths, two to a click, 50 BPM up to a pass at 80.",
        "Bars 1 and 2 are G major: A string 10 and 12, D string 9, 10 and 12, G string 9, 11 and 12, and back down. The F# is the G string's fret 11.",
        "Bars 3 and 4 are D major: low E string 10 and 12, A string 9, 10 and 12, D string 9, 11 and 12, and back down. The F# is the A string's fret 9 and the C# is the D string's fret 11.",
        "The fingers are the same for both: 2 and 4, then 1, 2 and 4, then 1, 3 and 4. On the D string the two keys differ by one note: G major has C at fret 10 where D major has C# at fret 11.",
        "At each change of key the second finger hops to the next string at the same fret.",
      ],
      coach: "Right notes and even eighths after the take.",
      tab: G_THEN_D,
      position: 9,
      rungs: ladder(50, 110, 10),
      passAt: 80,
      ...named(),
      minutes: 6,
    },
    {
      id: "one-four-five",
      title: "One, four and five under the band",
      purpose: "The first, fourth and fifth notes of the scale, played as single notes while a band plays the three chords built on them. A different key comes round on each Take.",
      howTo: [
        "Quarter notes and half notes, 60 BPM up to a pass at 90.",
        "In C, bar 1 counts up from home: C, C, D, E, the low E string's fret 8 twice, fret 10, then the A string's fret 7. They are notes one, one, two and three.",
        "Bar 2 is note four, F, the A string's fret 8. Bar 3 is note five, G, the A string's fret 10. Bar 4 is C again.",
        "Each time the band changes chord, the note you are on is the note that chord is named after.",
      ],
      coach: "Band on. Right notes and time after the take.",
      vary: {
        values: { key: Object.keys(ROOTS) },
        pooled: ["key"],
        label: (p: VariantParams) => `${p.key} major`,
        build: (p: VariantParams) => ({
          tab: ROOTS[p.key].tab,
          position: ROOTS[p.key].at,
          chords: moveChart("C | F | G | C", ROOTS[p.key].by),
          jam: ROCK(p.key),
          harmony: { scaleOverChords: [p.key, "major"] as [string, string] },
        }),
      },
      tab: ROOTS_IN_C,
      position: 7,
      chords: "C | F | G | C",
      jam: ROCK("C"),
      harmony: { scaleOverChords: ["C", "major"] },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(0.8),
      minutes: 5,
    },
    {
      id: "tune-two-keys",
      title: "One tune, two keys",
      purpose: "A four-bar tune in C, then the same tune in D: every note two frets higher, with the same fingers. The band moves with you, from C, F and G to D, G and A.",
      howTo: [
        "Quarters, eighths and half notes, 60 BPM up to a pass at 90.",
        "Bars 1 to 4 are in C, with the first finger at fret 7. The tune starts on E, the A string's fret 7, and ends on a long C, the low E string's fret 8.",
        "Hold the long C, then move the hand up two frets as it ends. Bars 5 to 8 are the same tune in D, with the first finger at fret 9: it starts on F#, the A string's fret 9, and ends on a long D, the low E string's fret 10. After that D the hand goes back down for the repeat.",
        "In C the tune has no sharps in it. In D it has two, F# and C#: the key puts them there, not the tune.",
        "The G chord is in both halves: built on note five of C, then on note four of D.",
      ],
      coach: "Band on. Right notes and time after the take.",
      tab: TUNE_TWO_KEYS,
      position: 7,
      shifts: true,
      chords: "C | F | G | C | D | G | A | D",
      jam: ROCK("C"),
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(),
      minutes: 7,
    },
  ],
};

// --- A second shape ---------------------------------------------------------------

/** Frets from D for each key the second shape is played in. */
const FROM_D: Readonly<Record<string, number>> = { D: 0, C: -2, E: 2 };

// D major from the A string: second finger on fret 5, the hand a fret higher for the top two strings.
const SHAPE_TWO = `/8 5:5f2 5:7f4 4:4f1 4:5f2 4:7f4 3:4f1 3:6f3 3:7f4 | 2:5f1 2:7f3 2:8f4 1:5f1 1:7f3 1:5f1 2:8f4 2:7f3 | 2:5f1 3:7f4 3:6f3 3:4f1 4:7f4 4:5f2 4:4f1 5:7f4 | 5:5f2 5:4f1 6:7f4 6:5f2 6:7f4 /4. 5:4f1`;
// The same eight notes in two places: from the A string at fret 5, then from the low E string at fret 10.
const TWO_PLACES = `/8 5:5f2 5:7f4 4:4f1 4:5f2 4:7f4 3:4f1 3:6f3 3:7f4 | 3:6f3 3:4f1 4:7f4 4:5f2 4:4f1 5:7f4 /4 5:5f2 | /8 6:10f2 6:12f4 5:9f1 5:10f2 5:12f4 4:9f1 4:11f3 4:12f4 | 4:11f3 4:9f1 5:12f4 5:10f2 5:9f1 6:12f4 /4 6:10f2`;
// Up through the second shape, across on the G string, to the top of the first shape and back.
const JOINED = `/8 5:5f2 5:7f4 4:4f1 4:5f2 4:7f4 3:4f1 3:6f3 3:7f4 | 3:9f1 3:11f3 3:12f4 2:10f2 2:12f4 1:9f1 1:10f2 1:9f1 | 2:12f4 2:10f2 3:12f4 3:11f3 3:9f1 3:7f4 3:6f3 3:4f1 | 4:7f4 4:5f2 4:4f1 5:7f4 /2 5:5f2`;
// Four bars low in the second shape, answered an octave higher in the first.
const TUNE_LOW = `/4 5:5f2 /8 5:7f4 4:4f1 /4 4:7f4 4:4f1 | /4 4:5f2 /8 4:7f4 3:4f1 /2 3:7f4 | /4 3:6f3 /8 3:4f1 4:7f4 /4 4:4f1 5:7f4 | /8 5:5f2 6:7f4 6:5f2 6:7f4 /2 5:5f2`;
const TUNE_HIGH = `/4 4:12f4 /8 3:9f1 3:11f3 /4 2:10f2 3:11f3 | /4 3:12f4 /8 2:10f2 2:12f4 /2 1:10f2 | /4 1:9f1 /8 2:12f4 2:10f2 /4 3:11f3 3:9f1 | /8 4:12f4 4:9f1 5:12f4 4:9f1 /2 4:12f4`;

/** Intermediate, after the two positions: the lower of those positions named, and joined to the first shape. */
export const SECOND_SHAPE: StepSpec = {
  id: "second-shape",
  title: "A second shape, and the two joined",
  goal: "Play the major scale from a root on the A string, join that shape to the one from the low E string, and play a tune that uses both.",
  why: "The Step before this carried C major out of one position into the next. The lower of those positions was the low half of this shape: a major scale with its root on the A string, under the second finger. It gets a name of its own here because, together with the shape from the low E string, it gives every key two places on the neck, five frets apart. Join them and a key is no longer one box.",
  howTo: [
    "In D the second finger is on the A string at fret 5 and the first finger covers fret 4. On the A, D and G strings the fingers are the ones the first shape uses on its low three strings: 2 and 4, then 1, 2 and 4, then 1, 3 and 4.",
    "The B string is tuned one fret lower than the pattern of the other strings, so on the top two strings every note sits a fret higher. Move the hand up one fret to meet them: first finger on fret 5.",
    "The first shape for the same key is five frets higher: in D, second finger on the low E string at fret 10. To join the two, shift on the G string: fourth finger on fret 7, then first finger on fret 9.",
  ],
  payoff: "D major from fret 4 to fret 12 in one line, and a tune that answers itself an octave higher.",
  exercises: [
    {
      id: "a-string-shape",
      title: "The shape from the A string",
      purpose: "The whole second shape: from the root on the A string up to the top string, back down past the root to the low E string, and round again. A different key comes round on each Take.",
      howTo: [
        "Straight eighths, two to a click, 50 BPM up to a pass at 85.",
        "In D: A string 5 and 7, D string 4, 5 and 7, G string 4, 6 and 7. Then the hand moves up one fret: B string 5, 7 and 8 with fingers 1, 3 and 4, top string 5 and 7 with fingers 1 and 3.",
        "On the way down the hand moves back as you return to the G string. Below the root there are three more notes: A string 4, then low E string 7 and 5. The line turns there and climbs back to the A string's fret 4, one note under the root, ready to go round again.",
      ],
      coach: "Right notes and even eighths after the take. The move between the G and B strings is where the time slips.",
      vary: inKeys(SHAPE_TWO, FROM_D, 4),
      tab: SHAPE_TWO,
      position: 4,
      shifts: true,
      harmony: { scale: ["D", "major"], cover: true },
      rungs: ladder(50, 110, 10),
      passAt: 85,
      ...named(),
      minutes: 6,
    },
    {
      id: "one-octave-two-places",
      title: "One octave, two places",
      purpose: "The same eight notes twice: from the A string in the second shape, then from the low E string in the first shape, five frets higher. A different key comes round on each Take.",
      howTo: [
        "Straight eighths, 50 BPM up to a pass at 85.",
        "In D, bars 1 and 2 go up and back from the A string's fret 5, with the first finger at fret 4. Bars 3 and 4 go up and back from the low E string's fret 10, with the first finger at fret 9.",
        "The fingers are the same in both halves, and so are the notes: the low E string's fret 10 is the same D as the A string's fret 5. Hold the last note of each half, then move the hand as it ends: up five frets for bars 3 and 4, and back down for the repeat.",
      ],
      coach: "Right notes and even eighths after the take.",
      vary: inKeys(TWO_PLACES, FROM_D, 4),
      tab: TWO_PLACES,
      position: 4,
      shifts: true,
      harmony: { scale: ["D", "major"], cover: true },
      rungs: ladder(50, 110, 10),
      passAt: 85,
      ...named(),
      minutes: 6,
    },
    {
      id: "shapes-joined",
      title: "The two shapes joined",
      purpose: "Two octaves in one line: up through the second shape, across into the first on the G string, to the root on the top string and back the same way. A different key comes round on each Take.",
      howTo: [
        "Straight eighths, 50 BPM up to a pass at 80.",
        "In D, bar 1 is the second shape from the A string's fret 5 up to the G string's fret 7. Bar 2 starts with the shift: first finger to the G string's fret 9, then 11 and 12, B string 10 and 12, top string 9 and 10.",
        "On the way down the shift is in bar 3: after the G string's fret 9 with the first finger, the fourth finger takes fret 7.",
      ],
      coach: "Right notes and even eighths after the take. The shift is where the time moves.",
      vary: inKeys(JOINED, FROM_D, 4),
      tab: JOINED,
      position: 4,
      shifts: true,
      harmony: { scale: ["D", "major"], cover: true },
      rungs: ladder(50, 110, 10),
      passAt: 80,
      ...named(),
      minutes: 7,
    },
    {
      id: "tune-both-shapes",
      title: "A tune across both shapes",
      purpose: "Eight bars in D over a band. The tune is played low in the second shape, then again an octave higher in the first shape, and each bar starts on a note of its chord.",
      howTo: [
        "Quarters, eighths and half notes, 60 BPM up to a pass at 90.",
        "Bars 1 to 4 sit at fret 4, on the low four strings. Bar 4 dips below the root to the low E string's frets 7 and 5, and ends on a long D, the A string's fret 5.",
        "Hold that long D, then move the hand up to fret 9 as it ends. Bars 5 to 8 are the same tune an octave higher, starting with the fourth finger on the D string's fret 12 and reaching the top string's fret 10 in bar 6. After the last note the hand goes back down to fret 4 for the repeat.",
      ],
      coach: "Band on. Right notes and time after the take.",
      tab: `${TUNE_LOW} | ${TUNE_HIGH}`,
      position: 4,
      shifts: true,
      chords: "D | G | A | D | D | G | A | D",
      jam: ROCK("D"),
      harmony: { scaleOverChords: ["D", "major"] },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(),
      minutes: 7,
    },
  ],
};

// --- The modes in a second key ------------------------------------------------------

// E Dorian from the A string: the first finger reaches back to fret 6 on the G string for C#.
const E_DORIAN_SHAPE = `/8 5:7f1 5:9f3 5:10f4 4:7f1 4:9f3 3:6f1 3:7f2 3:9f4 | 3:7f2 3:6f1 4:9f3 4:7f1 5:10f4 5:9f3 hold`;
const E_DORIAN_PHRASE = `/8 5:7f1 5:10f4 4:7f1 4:9f3 /4 4:7f1 5:10f4 | /8 3:6f1 3:7f2 3:9f4 3:7f2 /2 3:6f1 | /8 4:9f3 4:7f1 5:10f4 5:9f3 /4 5:7f1 5:10f4 | /8 4:7f1 4:9f3 3:6f1 3:7f2 /2 3:9f4`;
// D major from the A string, then the same with C natural: D Mixolydian.
const D_MAJOR_OCTAVE = `/8 5:5 5:7 4:4 4:5 4:7 3:4 3:6 3:7 | 3:6 3:4 4:7 4:5 4:4 5:7 hold`;
const D_MIXO_OCTAVE = `/8 5:5 5:7 4:4 4:5 4:7 3:4 3:5 3:7 | 3:5 3:4 4:7 4:5 4:4 5:7 hold`;
const D_MIXO_PHRASE = `/8 4:4 4:7 3:4 3:7 /4 3:4 4:7 | /8 3:5 3:4 4:7 4:5 /2 5:7 | /8 4:7 3:4 3:7 3:4 /4 4:7 4:4 | /8 3:5 3:7 3:5 4:7 /2 4:5`;

/** Advanced, after Mixolydian and before the choosing: each mode once more, in a key that is not A. */
export const MODES_SECOND_KEY: StepSpec = {
  id: "modes-second-key",
  title: "The modes in a second key",
  goal: "Play E Dorian over Em and A, and D Mixolydian over D and C, each from a root on the A string.",
  why: "So far each mode has had one shape, from the low E string, and its phrases over a band were all in A. A mode is not a set of frets around fret 5: it is a scale with one note changed, and the change is the same in every key. Dorian is natural minor with the sixth note raised, so in E the C becomes C#. Mixolydian is major with the seventh note lowered, so in D the C# becomes C. The chords follow the same rule as before: Em to A is a minor chord and the major chord a fourth above it, and D to C is a major chord and the major chord a whole step below it. Count the sharps and the keys from earlier in the Path come back: E Dorian has F# and C#, the seven notes of D major, and D Mixolydian has only F#, the seven notes of G major.",
  howTo: [
    "Both shapes start from the A string here, with the fingers they had from the low E string in A. E Dorian starts with the first finger on fret 7. D Mixolydian starts with the second finger on fret 5.",
    "In both, the changed note is on the G string. E Dorian's C# is fret 6: the hand moves back one fret so the first finger can take it. D Mixolydian's C is fret 5, one fret below the C# that D major has at fret 6.",
    "Over the A chord, aim for C#: it is the third of A. Over the C chord, start on C.",
  ],
  payoff: "The same two sounds you know from A, from a new string and over new chords: a Dorian phrase over Em and A, and a Mixolydian phrase over D and C.",
  exercises: [
    {
      id: "e-dorian-shape",
      title: "E Dorian from the A string",
      purpose: "E Dorian, one octave up and back: E, F#, G, A, B, C#, D, E. The C# is the G string's fret 6, in place of the C that E natural minor has.",
      howTo: [
        "Straight eighths, two to a click, 50 BPM up to a pass at 80.",
        "A string 7, 9 and 10 with fingers 1, 3 and 4. D string 7 and 9 with fingers 1 and 3. G string 6, 7 and 9 with fingers 1, 2 and 4: the hand moves back one fret for this string and returns for the D string on the way down.",
      ],
      coach: "Right notes and even eighths after the take. C# is the note to listen for.",
      tab: E_DORIAN_SHAPE,
      position: 7,
      shifts: true,
      harmony: { scale: ["E", "dorian"], cover: true },
      rungs: ladder(50, 110, 10),
      passAt: 80,
      ...named(),
      minutes: 5,
    },
    {
      id: "e-dorian-phrase",
      title: "An E Dorian phrase over Em and A",
      purpose: "Four bars over a band going from Em to A and back. Bar 2, over A, starts and ends on C#: the third of the chord, and the note that makes the scale Dorian.",
      howTo: [
        "Eighths, quarters and half notes, 60 BPM up to a pass at 90.",
        "Bars 1 and 3, over Em, stay on the A and D strings and start on E and on B. Bar 2 is on the G string alone: 6, 7, 9, 7 and a long 6.",
        "Bar 4 starts on A, the D string's fret 7, and climbs through C# to a long E, the G string's fret 9.",
      ],
      coach: "Band on. Right notes and time after the take.",
      tab: E_DORIAN_PHRASE,
      position: 7,
      shifts: true,
      chords: "Em | A | Em | A",
      jam: ROCK("E minor"),
      harmony: { scaleOverChords: ["E", "dorian"] },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(),
      minutes: 6,
    },
    {
      id: "d-major-then-mixolydian",
      title: "D major, then D Mixolydian",
      purpose: "The major shape from the A string up and back with C#, then up and back with C. One fret apart, and the second one is D Mixolydian.",
      howTo: [
        "Straight eighths, 50 BPM up to a pass at 85.",
        "A string 5 and 7, D string 4, 5 and 7, G string 4, 6 and 7 in bars 1 and 2. In bars 3 and 4 the G string is 4, 5 and 7. Everything else is the same.",
        "The third finger plays the C# at fret 6 and the second finger plays the C at fret 5.",
      ],
      coach: "Right notes and even eighths after the take. C natural is the note to listen for.",
      tab: `${D_MAJOR_OCTAVE} | ${D_MIXO_OCTAVE.slice(3)}`,
      position: 4,
      rungs: ladder(50, 110, 10),
      passAt: 85,
      ...named(),
      minutes: 5,
    },
    {
      id: "d-mixolydian-phrase",
      title: "A D Mixolydian phrase over D and C",
      purpose: "Four bars over a band going from D to C and back. The bars over C start on C, the G string's fret 5; the bars over D start on F# and on A.",
      howTo: [
        "Eighths, quarters and half notes, 60 BPM up to a pass at 90.",
        "All of it sits at fret 4 on the A, D and G strings. Bar 2 comes down from C to a long E, the A string's fret 7, and bar 4 ends on a long G, the D string's fret 5.",
      ],
      coach: "Band on. Right notes and time after the take.",
      tab: D_MIXO_PHRASE,
      position: 4,
      chords: "D | C | D | C",
      jam: ROCK("D"),
      harmony: { scaleOverChords: ["D", "mixolydian"] },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(),
      minutes: 6,
    },
  ],
};
