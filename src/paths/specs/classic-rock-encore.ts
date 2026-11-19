/**
 * Classic Rock: a third round of consolidation Steps (2026-11-19, second wave).
 * Drafts, like the Path they belong to.
 *
 * Two things were still on this Path's list (`plans/paths/NEW_PATHS.md`,
 * "Classic Rock, extended"). The sextuplet "sixes" lick of `box-extension` was
 * the one box lick `box-at-twelve` left in A: here it goes to E at the twelfth
 * fret, slowly in triplets, at speed, turned round at the bottom, and at the end
 * of a four-bar phrase. And `embellishment` decorated E and A, the one and four
 * of E: here the same moves go to A and D, the one and four of A, each in its
 * own open shape. Every id is new, so nobody's progress moves. Every line is
 * original.
 */
import type { ExerciseSpec, StepSpec, VariantParams } from "../spec";
import type { PassBar } from "../format";
import { ladder, shiftFrets } from "../templates";

type Grading = Pick<ExerciseSpec, "grade" | "alsoGraded" | "pass">;

/** Written single-note lines: right notes, notes heard, extras, timing. */
function lick(evenness: number, overBars = 4): Grading {
  const bars: PassBar[] = [
    { metric: "noteIdentity", min: 0.9, overBars },
    { metric: "notesHeard", min: 0.9, overBars },
    { metric: "extraNotes", max: 4, overBars: 4 },
    { metric: "timingEvenness", min: evenness, overBars },
  ];
  return { grade: "written", alsoGraded: ["timingEvenness"], pass: bars };
}
/** Ringing chord notes and two notes at once: timed and counted, never pitch-checked. */
const TIMED: Grading = {
  grade: "timing",
  pass: [
    { metric: "timingEvenness", min: 0.75, overBars: 4 },
    { metric: "notesHeard", min: 0.9, overBars: 4 },
    { metric: "extraNotes", max: 4, overBars: 4 },
  ],
};

const ROCK = (key: string) => ({ groove: "rock8", key });
const TWELVE_EIGHT = (key: string) => ({ groove: "rockTwelveEight", key });
const BALLAD_A = { groove: "ballad", key: "A" };

/** Said on every Exercise whose variants move the line: the words name the first version's frets. */
const VARIANT_NOTE =
  "The frets and note names here are for the first version. On other days the same line comes in another key, lower on the neck.";

// --- The sixes at the twelfth fret ---------------------------------------------------

// Box 1 as `box-extension` writes it, in A at fret 5; every line below is moved from there.
const DOWN_BOX = ["1:8", "1:5", "2:8", "2:5", "3:7", "3:5", "4:7", "4:5", "5:7", "5:5", "6:8", "6:5"];
const UP_BOX = [...DOWN_BOX].reverse();
const sixDown = (start: number) => DOWN_BOX.slice(start, start + 6).join(" ");
const sixUp = (start: number) => UP_BOX.slice(start, start + 6).join(" ");

// `sixes-down` of `box-extension`, as written there.
const SIXES = `/16t ${sixDown(0)} ${sixDown(1)} ${sixDown(2)} ${sixDown(3)} | /16t ${sixDown(4)} ${sixDown(5)} /2 6:5`;
// The same six groups at half the speed: two to a bar, and the low root for a whole bar.
const SIXES_SLOW = `/8t ${sixDown(0)} ${sixDown(1)} | /8t ${sixDown(2)} ${sixDown(3)} | /8t ${sixDown(4)} ${sixDown(5)} | /1 6:5`;
// The last group of the lick, then the sequence turned round: five groups up, and the high root held.
const SIXES_TURN = `/16t ${sixDown(5)} ${sixUp(0)} ${sixUp(1)} ${sixUp(2)} | /16t ${sixUp(3)} ${sixUp(4)} /2 1:5`;
// Two bars of slow notes that climb to the root on the top string and rest on the fifth; then the lick.
const SIXES_PHRASE = `/8 3:7 2:5 /4 2:8 /8 2:5 2:8 /4 1:5 | /4 2:8 /8 1:5 2:8 /2 2:5 | ${SIXES}`;

/** From A at fret 5 to the first finger's fret in each key. */
const SIXES_KEYS: Readonly<Record<string, number>> = { E: 7, D: 5, C: 3 };
const TO_E = SIXES_KEYS.E;

/** What a text needs to know of box 1 in one key: the first finger's fret and the five note names. */
type BoxWords = { fret: number; root: string; third: string; fourth: string; fifth: string; seventh: string };
const BOX_WORDS: Readonly<Record<string, BoxWords>> = {
  E: { fret: 12, root: "E", third: "G", fourth: "A", fifth: "B", seventh: "D" },
  D: { fret: 10, root: "D", third: "F", fourth: "G", fifth: "A", seventh: "C" },
  C: { fret: 8, root: "C", third: "Eb", fourth: "F", fifth: "G", seventh: "Bb" },
};
type KeyText = { purpose: string; lines: string[] };

/**
 * A box lick written in A, played in E and, on other days, in the keys just below it.
 * `words` writes a key's own purpose and how-to lines (the tempo line stays the Exercise's);
 * without it the variants' text is the Exercise's, said again for their notes.
 */
function sixesIn(tab: string, words?: (key: string) => KeyText) {
  return {
    values: { key: Object.keys(SIXES_KEYS) },
    pooled: ["key"] as const,
    label: (p: VariantParams) => `In ${p.key}`,
    build: (p: VariantParams) => ({
      tab: shiftFrets(tab, SIXES_KEYS[p.key]),
      position: 5 + SIXES_KEYS[p.key],
      chords: `${p.key}5 | ${p.key}5`,
      jam: ROCK(`${p.key} minor`),
      harmony: { scale: [p.key, "minorPentatonic"] as [string, string] },
      ...(words
        ? { purpose: words(p.key).purpose, howTo: (base: readonly string[]) => [base[0], ...words(p.key).lines] }
        : {}),
    }),
  };
}

/**
 * The turn's words in one key, made from the box's frets and names. In D the line passes notes
 * that have the name of the string they are on (D at fret 12 on the D string), which the
 * rewriting of an Exercise's sentences refuses, so every key's text is written here.
 */
function turnWords(key: string): KeyText {
  const { fret, root, third, fourth, fifth, seventh } = BOX_WORDS[key];
  const [mid, high] = [fret + 2, fret + 3];
  return {
    purpose: `The bottom of the lick, and what can come after it. Where the lick stopped, on ${root} at fret ${fret} on the low E string, this line turns round: six notes up the box from that ${root}, then six from one note higher, five groups in all, to a held ${root} at fret ${fret} on the high E string.`,
    lines: [
      `Bar 1 opens with the last group of the lick, from ${third} at fret ${fret} on the G string down to ${third} at fret ${high} on the low E string. Then three groups go up: from ${root} at fret ${fret} on the low E string to ${root} at fret ${mid} on the D string, from ${third} at fret ${high} on the low E string to ${third} at fret ${fret} on the G string, and from ${fourth} at fret ${fret} on the A string to ${fourth} at fret ${mid} on the G string.`,
      `Bar 2: from ${fifth} at fret ${mid} on the A string up to ${fifth} at fret ${fret} on the B string, from ${seventh} at fret ${fret} on the D string up to ${seventh} at fret ${high} on the B string, then ${root} at fret ${fret} on the high E string, held for two beats.`,
      `Inside a group, every move to a higher string lands on the first finger at fret ${fret}. Lay it there while the third or fourth finger is still playing the string below.`,
      `Between the climbing groups the line drops back two strings. Three times the finger that has just played has to play again there: the first finger at fret ${fret} twice, and the third finger at fret ${mid} once, over the bar line.`,
      "The climb is new. Stay at the slowest rung until the first finger finds each string without looking, then move up.",
    ],
  };
}

/** Beginner, after the box licks at the twelfth fret: the fourth lick, the sextuplet one. */
export const SIXES_AT_TWELVE: StepSpec = {
  id: "sixes-at-twelve",
  title: "Sixes at the twelfth fret",
  goal: "Play the six-note sequence down box 1 of E minor pentatonic at fret 12 in sextuplets, turn it round at the bottom and climb back up, and end a four-bar phrase in E minor with it.",
  why: "The last Step moved three of the four box licks up to E and left one behind: the sixes, the fastest of them. This Step brings it up. The sequence is the one you know, six notes down the box and then six more from one note lower, on the same strings with the same fingers, seven frets higher. Then two things are made of it. Turned round at the low E, the same sequence climbs. And placed after two bars of slow notes, it does the job a fast lick does in a solo: it answers.",
  howTo: [
    "Box 1 in E, first finger on fret 12. The low E, B and high E strings are frets 12 and 15; the A, D and G strings are frets 12 and 14. First finger for every fret 12, third finger for fret 14, fourth finger for fret 15.",
    "A group is six notes in a row down the box, and it ends on the note it started on, an octave lower. The next group starts one note lower than the last one started. Six groups take the line from G at fret 15 on the high E string down to the low E string.",
    "Learn it in eighth-note triplets first, where a group lasts two clicks, then in sextuplets, where a group lasts one. Either way the first note of every group lands on a click.",
    "Where one group ends and the next begins, the same finger often has the same fret two strings away. Do not lift and hop: lay the finger flat across those strings beforehand and roll onto the new one, letting the old string go quiet.",
    "The sextuplet lick and the turn come back on other days in D, first finger at fret 10, and in C, at fret 8: the same shape and fingers, every fret two or four lower.",
  ],
  payoff: "The sixes down the box in A and in E, the turn that takes them back up, and a phrase that uses them the way a solo does: slow notes, then the run.",
  exercises: [
    {
      id: "sixes-in-triplets",
      title: "The sixes in triplets",
      purpose: "The sequence from 'Sixes down the box', moved to E at fret 12 and played with half as many notes to a click: eighth-note triplets, so every note has room at the slow rungs. Six notes down the box from G, six from the E below it, and so on down to E at fret 12 on the low E string.",
      howTo: [
        "Eighth-note triplets, three to a click, 60 BPM up to a pass at 100.",
        "Each group of six lasts two clicks. Bar 1: G at fret 15 and E at fret 12 on the high E string, D at fret 15 and B at fret 12 on the B string, A at fret 14 and G at fret 12 on the G string. Then the six that start from E at fret 12 on the high E string and end on E at fret 14 on the D string.",
        "Bar 2: the group that starts on D at fret 15 on the B string, then the one that starts on B at fret 12 on the B string. Bar 3: the group that starts on A at fret 14 on the G string, then the one that starts on G at fret 12 on the G string and ends on G at fret 15 on the low E string. Bar 4: E at fret 12 on the low E string, held for the whole bar.",
        "Pick down, up, down, up without a break, so that every group starts on a downstroke.",
      ],
      coach: "Right notes, notes heard and even triplets after the take.",
      tab: shiftFrets(SIXES_SLOW, TO_E),
      position: 12,
      loops: false,
      chords: "E5 | E5 | E5 | E5",
      jam: TWELVE_EIGHT("E minor"),
      harmony: { scale: ["E", "minorPentatonic"] },
      rungs: ladder(60, 120, 10),
      passAt: 100,
      ...lick(0.8),
      minutes: 5,
    },
    {
      id: "sixes-in-e",
      title: "The sixes in sextuplets",
      purpose: "The sequence with six notes to a click, the way 'Sixes down the box' runs. Four groups fill bar 1, two more start bar 2, and E at fret 12 on the low E string is held.",
      howTo: [
        "Sixteenth-note sextuplets, six to a click, 50 BPM up to a pass at 60.",
        "Bar 1: the groups that start on G at fret 15 and on E at fret 12 on the high E string, then on D at fret 15 and on B at fret 12 on the B string. Bar 2: the groups that start on A at fret 14 and on G at fret 12 on the G string, then E at fret 12 on the low E string, held for two beats.",
        "The pattern is the one from 'The sixes in triplets', on the same strings with the same fingers, with six notes to a click instead of three. At the first rung the notes go by at the same speed as the triplets at 100.",
        "The first note of each group falls on the click. If the groups blur into one long run, go back to the triplets for a minute and come back.",
        VARIANT_NOTE,
      ],
      coach: "Fast single notes: right notes, notes heard and evenness after the take.",
      vary: sixesIn(SIXES),
      tab: shiftFrets(SIXES, TO_E),
      position: 12,
      loops: false,
      chords: "E5 | E5",
      jam: ROCK("E minor"),
      harmony: { scale: ["E", "minorPentatonic"] },
      rungs: ladder(50, 90, 5),
      passAt: 60,
      ...lick(0.75),
      minutes: 5,
    },
    {
      id: "sixes-turn",
      title: "The turn back up",
      purpose: turnWords("E").purpose,
      howTo: [
        "Sixteenth-note sextuplets, six to a click, 40 BPM up to a pass at 60.",
        ...turnWords("E").lines,
        VARIANT_NOTE,
      ],
      coach: "Fast single notes: right notes, notes heard and evenness after the take.",
      vary: sixesIn(SIXES_TURN, turnWords),
      tab: shiftFrets(SIXES_TURN, TO_E),
      position: 12,
      loops: false,
      chords: "E5 | E5",
      jam: ROCK("E minor"),
      harmony: { scale: ["E", "minorPentatonic"] },
      rungs: ladder(40, 90, 5),
      passAt: 60,
      ...lick(0.75),
      minutes: 5,
    },
    {
      id: "sixes-phrase",
      title: "A phrase that ends with the sixes",
      purpose: "Four bars in E minor. Two bars of slow notes climb to E on the high E string and come to rest on B; then the sixes answer, all the way down to E at fret 12 on the low E string. The slow notes are what make the run stand out.",
      howTo: [
        "Straight eighths and quarter notes, then sextuplets, 50 BPM up to a pass at 60.",
        "Bar 1: A at fret 14 on the G string and B at fret 12 on the B string as eighth notes, D at fret 15 on the B string for a beat, B and D again as eighth notes, and E at fret 12 on the high E string for a beat. Bar 2: D for a beat, E and D as eighth notes, then B at fret 12 on the B string held for two beats.",
        "Bars 3 and 4 are the lick in sextuplets, here in E at fret 12: four groups, then two groups and E at fret 12 on the low E string held for two beats. While the B is held, get the fourth finger over fret 15 on the high E string, where the lick starts.",
        "Count the eighth notes in twos and the sextuplets in sixes against the same click. The click does not change; only the number of notes inside it does.",
      ],
      coach: "Band on. Right notes, notes heard and time after the take.",
      tab: shiftFrets(SIXES_PHRASE, TO_E),
      position: 12,
      chords: "E5 | E5 | E5 | E5",
      jam: ROCK("E minor"),
      harmony: { scale: ["E", "minorPentatonic"] },
      rungs: ladder(50, 90, 5),
      passAt: 60,
      ...lick(0.75),
      minutes: 6,
    },
  ],
};

// --- Chord embellishment in A --------------------------------------------------------

// The open A chord's own fingers: index on the D string, middle on the G, ring on the B.
// The ring finger lifts for the open B and hammers back to C#, the chord's third.
const A_HAMMER_1 = "/8 5:0 3:2f2 2:0 2:2hf3 1:0 2:2f3 3:2f2 2:2f3";
const A_HAMMER_2 = "/8 5:0 4:2f1 3:2f2 2:0 2:2hf3 1:0 /4 2:2f3";
// The open D chord's own fingers: index on the G string, ring on the B, middle on the top string.
// The middle finger lifts for the open top string and hammers back to F#, the chord's third.
const D_HAMMER_1 = "/8 4:0 3:2f1 1:0 1:2hf2 2:3f3 1:2f2 3:2f1 1:2f2";
const D_HAMMER_2 = "/8 4:0 3:2f1 2:3f3 1:0 1:2hf2 2:3f3 /4 1:2f2";
// Root and third together, and the upper string moving: the fourth (little finger), the third, the open string, the third.
const A_FOURTH = "/4 5:0 /8 3:2f2+2:2f3 3:2f2+2:3f4 /4 3:2f2+2:2f3 /8 3:2f2+2:0 3:2f2+2:2f3";
const D_FOURTH = "/4 4:0 /8 2:3f3+1:2f2 2:3f3+1:3f4 /4 2:3f3+1:2f2 /8 2:3f3+1:0 2:3f3+1:2f2";
// The D bar as far as the fourth, then the root and third held.
const D_FOURTH_END = "/4 4:0 /8 2:3f3+1:2f2 2:3f3+1:3f4 /2 2:3f3+1:2f2";
const A_MIXOLYDIAN = { scaleOverChords: ["A", "mixolydian"] as [string, string] };

/** Intermediate, after the embellishment of E and A: the same moves on the open A and D shapes. */
export const EMBELLISHMENT_IN_A: StepSpec = {
  id: "embellishment-in-a",
  title: "Chord embellishment in A",
  goal: "Decorate an open A and an open D chord: the hammer-on to the third you used on E, a new move that adds the fourth above the third and takes it away, and a four-bar part made of both.",
  why: "In the last Step the chords were E and A, the one and the four of E, and the hand stayed in the chord while single fingers moved. Here the key is A, where the one and the four are A and D. Each is an open shape of its own, with its third on a different string: the B string in A, the high E string in D. The first move is the one you know: the open string under the third is hammered up to it. The second is new: the little finger adds the note one fret above the third, the fourth, and lifts off again. Making the moves inside two more shapes is how the idea stops belonging to one chord.",
  howTo: [
    "A: first, second and third fingers in a row at fret 2, on the D, G and B strings, over the open A string. D: first finger on the G string at fret 2, third finger on the B string at fret 3, second finger on the high E string at fret 2, over the open D string.",
    "The third of A is C# on the B string at fret 2, under the third finger. The third of D is F# on the high E string at fret 2, under the second finger. Lift that finger, pick the open string, and hammer the finger back down: B to C# in A, E to F# in D.",
    "The fourth is one fret above the third on the same string: fret 3, played with the little finger while the finger behind it stays down. Let every note ring into the next, and keep the time steady underneath.",
  ],
  payoff: "An A and a D that move inside, and a four-bar rhythm part made of nothing else.",
  exercises: [
    {
      id: "open-a",
      title: "Hammer to the third, open A",
      purpose: "Inside the open A chord: the open A string, A on the G string, the open B string hammered to C#, and the open high E string above it. The move you made on the G string in E, one string higher and one fret wider: open B up to fret 2, a whole step, where E had the half step from the open G to fret 1.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 80.",
        "Bar 1: the open A string, A at fret 2 on the G string, the open B string, hammer to C# at fret 2, the open high E string, then C#, A and C# again. Bar 2: the open A string, E at fret 2 on the D string, A on the G string, the open B string, hammer to C#, the open high E string, and C# held for a beat.",
        "Hold the whole A chord. Only the third finger moves: it lifts off the B string for the open B and hammers back down at fret 2.",
      ],
      coach: "Notes ring into each other here: timed and counted, not checked for pitch.",
      tab: `${A_HAMMER_1} | ${A_HAMMER_2}`,
      // An open A chord shape, not one finger per fret: the Hand line says so.
      chordShape: "A",
      position: 1,
      chords: "A | A",
      jam: BALLAD_A,
      harmony: A_MIXOLYDIAN,
      rungs: ladder(60, 100, 5),
      passAt: 80,
      ...TIMED,
      minutes: 5,
    },
    {
      id: "open-d",
      title: "Hammer to the third, open D",
      purpose: "The same move inside the open D chord, on the high E string: the open string hammered to F# at fret 2. The third is the top note of this chord, so the hammer sits on top, where it is easy to hear.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 80.",
        "Bar 1: the open D string, A at fret 2 on the G string, the open high E string, hammer to F# at fret 2, D at fret 3 on the B string, then F#, A and F# again. Bar 2: the open D string, A on the G string, D on the B string, the open high E string, hammer to F#, D on the B string, and F# held for a beat.",
        "Hold the whole D chord. Only the second finger moves: it lifts off the high E string for the open E and hammers back down at fret 2. Keep the third finger, on the B string, standing on its tip so it does not touch the high E string.",
      ],
      coach: "Notes ring into each other here: timed and counted, not checked for pitch.",
      tab: `${D_HAMMER_1} | ${D_HAMMER_2}`,
      // An open D chord shape, not one finger per fret: the Hand line says so.
      chordShape: "D",
      position: 1,
      chords: "D | D",
      jam: BALLAD_A,
      harmony: A_MIXOLYDIAN,
      rungs: ladder(60, 100, 5),
      passAt: 80,
      ...TIMED,
      minutes: 5,
    },
    {
      id: "fourth-and-back",
      title: "The fourth, added and lifted",
      purpose: "Two strings at a time, the root and the third of each chord, while the higher of the two moves: up one fret to the fourth and back, down to the open string and back. A bar of A, then a bar of D.",
      howTo: [
        "Quarter notes and straight eighths, 60 BPM up to a pass at 80.",
        "Bar 1, A: the open A string for a beat, then the G and B strings together. The G string stays at fret 2. The B string plays fret 2, fret 3, fret 2 held for a beat, the open string, and fret 2.",
        "Bar 2, D: the open D string for a beat, then the B and high E strings together. The B string stays at fret 3. The high E string plays fret 2, fret 3, fret 2 held for a beat, the open string, and fret 2.",
        "Fret 3 is the little finger, put down in front of the finger that holds the third, which stays where it is. For the open string, lift the finger that holds the third and leave the rest of the chord down.",
        "From A to D the third finger does not leave the B string: it moves from fret 2 to fret 3 with the pressure let off, and the other two fingers move to the G string and the high E string.",
      ],
      coach: "Two notes at once are one attack: timed and counted, not checked for pitch.",
      tab: `${A_FOURTH} | ${D_FOURTH}`,
      // Open A and open D chord shapes, not one finger per fret.
      chordShape: "A",
      position: 1,
      chords: "A | D",
      jam: BALLAD_A,
      harmony: A_MIXOLYDIAN,
      rungs: ladder(60, 100, 5),
      passAt: 80,
      ...TIMED,
      minutes: 5,
    },
    {
      id: "a-and-d-part",
      title: "A and D: a four-bar part",
      purpose: "Both moves over both chords: the hammer to the third on A and on D, then the fourth added and lifted on A and on D. A rhythm part made of two chords and the moves inside them. It ends on D, which leans back towards A, so the part wants to go round again.",
      howTo: [
        "Straight eighths and quarter notes, 60 BPM up to a pass at 80.",
        "Bar 1 is bar 1 of 'Hammer to the third, open A'. Bar 2 is bar 1 of 'Hammer to the third, open D'. Bar 3 is the A bar of 'The fourth, added and lifted'. Bar 4 is its D bar as far as fret 3 on the high E string, then fret 2 again, held with the B string for two beats.",
        "The chord changes at every bar line: A, D, A, D. Every bar starts on its open bass string, the A string or the D string, and the fretting hand changes shape while that string sounds.",
        "Change with the third finger first: it stays on the B string and moves between fret 2 and fret 3 with the pressure let off.",
      ],
      coach: "Ringing notes and double stops: timed and counted, not checked for pitch.",
      tab: `${A_HAMMER_1} | ${D_HAMMER_1} | ${A_FOURTH} | ${D_FOURTH_END}`,
      // Open A and open D chord shapes, not one finger per fret.
      chordShape: "A",
      position: 1,
      chords: "A | D | A | D",
      jam: BALLAD_A,
      harmony: A_MIXOLYDIAN,
      rungs: ladder(60, 100, 5),
      passAt: 80,
      ...TIMED,
      minutes: 6,
    },
  ],
};
