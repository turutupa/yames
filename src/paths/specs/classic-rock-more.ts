/**
 * Classic Rock: consolidation Steps (2026-11-19). Drafts, like the Path they
 * belong to.
 *
 * Classic Rock is a style, and a style is something a player lives in
 * (`plans/paths/NEW_PATHS.md`, "How long each Path is"). These Steps add
 * nothing new. They take what the Path taught in one place and give it to
 * another: the three kinds of riff move from A to E, down at the nut where
 * rock riffs live, and the minor pentatonic grows from box 1 and its two-string
 * extension into the whole of box 2. Every id is new, so nobody's progress
 * moves. Every line is original.
 */
import type { ExerciseSpec, StepSpec } from "../spec";
import type { PassBar } from "../format";
import { ladder, pentatonic, shiftFrets } from "../templates";

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
/** Two notes at once: timed and counted, never pitch-checked. */
const TIMED: Grading = {
  grade: "timing",
  pass: [
    { metric: "timingEvenness", min: 0.8, overBars: 4 },
    { metric: "notesHeard", min: 0.9, overBars: 4 },
    { metric: "extraNotes", max: 4, overBars: 4 },
  ],
};
const YOUR_TURN = { grade: "selfChecked", example: true } as const;
const NOT_CHECKED_YET =
  "Your turn, and not checked yet: the app can't judge notes you choose, so you tick it off yourself.";

const ROCK = (key: string) => ({ groove: "rock8", key });
const HARD = (key: string) => ({ groove: "hardRock", key });

// --- Riffs in E -------------------------------------------------------------------

// The root line of Step 1, five frets lower: three of its notes become open strings.
const ROOT_RIFF = "/8 6:5m 6:5m 6:8 6:5m 5:5 6:5m 6:8 6:7 | /8 6:5m 6:5m 5:7 5:5 /4 6:8 6:7";
const E_ROOT_RIFF = shiftFrets(ROOT_RIFF, -5);
// The fourths of Step 1, one pair of strings lower: the same frets, now in E.
const E_FOURTHS_RIFF = "/8 5:7+4:7 5:7+4:7 r 5:5+4:5 /4 5:7+4:7 5:10+4:10 | /8 5:10+4:10 5:9+4:9 5:7+4:7 r /2 5:5+4:5";
// The pedal riff of Step 1, one string lower: the open low E under a line on the A string.
const E_PEDAL_RIFF = "/8 6:0m 6:0m 5:2 6:0m 6:0m 5:5 6:0m 5:4 | /8 6:0m 6:0m 5:2 6:0m 5:5 5:4 5:2 5:0";

/** Beginner, after the riffs in A: the same three riffs in the guitar's lowest key. */
export const RIFFS_IN_E: StepSpec = {
  id: "riffs-in-e",
  title: "The same riffs in E",
  goal: "Play the root line, the fourths and the pedal riff in E: the root line at the nut with open strings, the other two on the same frets one string lower.",
  why: "E is the lowest note the guitar has, and a great many rock riffs are in E for that reason: the open low string is the root, and it is free. You learned three kinds of riff in A. Each of them moves to E in its own way. The root line drops five frets and half of its notes turn into open strings. The fourths and the pedal riff keep their frets and move one string lower. Working that out once teaches you how to move any riff you learn.",
  howTo: [
    "The root line: every note five frets lower than in A. Fret 5 becomes the open string, fret 8 becomes fret 3, fret 7 becomes fret 2.",
    "Open strings ring on after you leave them. Rest the side of the picking hand on the low strings near the bridge for the muted notes, and lift it for the others.",
    "The fourths and the pedal riff: the same frets as in A, on the next string down. The A and D strings in place of the D and G, the low E and A in place of the A and D.",
  ],
  payoff: "Three riffs in two keys, and the way to move a riff: by frets, or by strings.",
  exercises: [
    {
      id: "e-root-riff",
      title: "The root line in E",
      purpose: "The root line from Step 1, five frets lower: E, G, A and the F sharp below G, on the two low strings at the nut. Open strings do half the work.",
      howTo: [
        "Straight eighths, 80 BPM up to a pass at 110, over a rock beat.",
        "Bar 1: the open low E twice (muted), G at fret 3, open E, the open A string, open E, G, F sharp at fret 2. Bar 2: open E twice, B at fret 2 on the A string, open A, then G and F sharp as quarter notes.",
        "Second finger on fret 2, third finger on fret 3. The hand doesn't move.",
      ],
      coach: "Right notes, notes heard and time after the take.",
      tab: E_ROOT_RIFF,
      position: 1,
      chords: "E5 | E5",
      jam: ROCK("E minor"),
      harmony: { scale: ["E", "naturalMinor"] },
      rungs: ladder(80, 130, 10),
      passAt: 110,
      ...lick(0.8),
      minutes: 5,
    },
    {
      id: "e-fourths-riff",
      title: "The fourths, one pair of strings lower",
      purpose: "The fourths riff from Step 1 on the A and D strings. The frets are the same and the key is now E: each shape sounds a fourth lower.",
      howTo: [
        "Straight eighths with rests, 80 BPM up to a pass at 110.",
        "Every shape is the same fret on the A and D strings. Bar 1: fret 7 twice, a rest, fret 5, then fret 7 and fret 10 as quarters. Bar 2: frets 10, 9 and 7, a rest, and fret 5 held.",
        "Lay one finger flat across both strings for each shape: the third finger at fret 7 and the first at fret 5. For frets 10 and 9, move the hand up and use the second finger and the first.",
      ],
      coach: "Two notes at once are one attack: timed and counted, not checked for pitch.",
      pick: "free",
      tab: E_FOURTHS_RIFF,
      position: 5,
      shifts: true,
      chords: "E5 | E5",
      jam: HARD("E minor"),
      harmony: { scale: ["E", "naturalMinor"] },
      rungs: ladder(80, 130, 10),
      passAt: 110,
      ...TIMED,
      minutes: 5,
    },
    {
      id: "e-pedal-riff",
      title: "An open E pedal",
      purpose: "The open low E string keeps coming back while a line moves above it on the A string: B, D, C sharp, A. The pedal riff from Step 1, one string lower.",
      howTo: [
        "Straight eighths, 80 BPM up to a pass at 110.",
        "Bar 1: open E twice (muted), B at fret 2 on the A string, open E twice, D at fret 5, open E, C sharp at fret 4. Bar 2: open E twice, B, open E, then D, C sharp, B and the open A string.",
        "Keep the low E muted and short, and let the notes on the A string ring a little longer. The difference is the riff.",
      ],
      coach: "Right notes, notes heard and time after the take.",
      tab: E_PEDAL_RIFF,
      position: 2,
      shifts: true,
      chords: "E5 | E5",
      jam: ROCK("E"),
      harmony: { scale: ["E", "dorian"] },
      rungs: ladder(80, 130, 10),
      passAt: 110,
      ...lick(0.8),
      minutes: 5,
    },
  ],
};

// --- Box 2 --------------------------------------------------------------------------

const BOX_TWO = `/8 ${pentatonic({ root: "A", box: 2, sequence: "updown" })} hold`;
const TWO_BOXES_LINE =
  "/8 6:5 6:8 5:5 5:7 4:5 4:7 3:5 3:7 | /8 3:9 2:8 2:10 1:8 1:10 1:8 2:10 2:8 | /8 3:9 3:7 4:10 4:7 5:10 5:7 6:10 6:8 | /4 6:5 5:7 /2 4:7";
const BOX_TWO_LICK = "/8 2:10 1:8 1:10 1:8 2:10 2:8 3:9 2:8 | /8 2:10 2:8 3:9 3:7 /4 4:10 4:7";

/** Intermediate, first: the whole of the next box, which the extension was the top of. */
export const BOX_TWO_STEP: StepSpec = {
  id: "box-two",
  title: "The next box up",
  goal: "Play box 2 of A minor pentatonic across all six strings, and a line that climbs through box 1 into box 2 and comes home.",
  why: "The extension at frets 8 and 10 was two strings of something bigger. The same five notes carry on up the neck in a second shape, box 2, which starts where box 1 ends. Nothing about the scale changes: A, C, D, E, G. What changes is which notes fall under which fingers, and that is why a lick played in box 2 does not sound like one played in box 1. Solos that go somewhere are made by moving between the two.",
  howTo: [
    "Box 2, first finger at fret 7: low E string 8 and 10, A string 7 and 10, D string 7 and 10, G string 7 and 9, B string 8 and 10, top string 8 and 10.",
    "Every higher note of box 1 is the lower note of box 2 on the same string. Frets 8, 7, 7, 7, 8, 8 belong to both.",
    "The A's in box 2 are on the D string at fret 7 and the B string at fret 10. Find them first: they are home.",
  ],
  payoff: "Twice as much neck for the same five notes, and a way from one box to the other.",
  exercises: [
    {
      id: "box-two-shape",
      title: "Box 2, up and down",
      purpose: "The second pentatonic box from the low E string to the top string and back, so its shape is in the hand before any lick uses it.",
      howTo: [
        "Straight eighths, two to a click, 60 BPM up to a pass at 90.",
        "First finger on fret 7, second on 8, third on 9, fourth on 10. Two notes on every string: 8 and 10, 7 and 10, 7 and 10, 7 and 9, 8 and 10, 8 and 10.",
        "Say 'A' each time you play one: D string fret 7, B string fret 10.",
      ],
      coach: "Right notes and even eighths after the take.",
      tab: BOX_TWO,
      position: 7,
      harmony: { scale: ["A", "minorPentatonic"], cover: true },
      click: 2,
      rungs: ladder(60, 110, 10),
      passAt: 90,
      ...lick(0.8),
      minutes: 5,
    },
    {
      id: "two-boxes-line",
      title: "Through box 1 into box 2",
      purpose: "Four bars: up box 1 from the low A, across into box 2 on the G string, over the top and down box 2 to the low C, and home to A.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 90.",
        "Bar 1, box 1 going up: low E string 5 and 8, A string 5 and 7, D string 5 and 7, G string 5 and 7. Bar 2, into box 2: G string 9, B string 8 and 10, top string 8 and 10, and back: top string 8, B string 10 and 8.",
        "Bar 3, box 2 coming down: G string 9 and 7, D string 10 and 7, A string 10 and 7, low E string 10 and 8. Bar 4: A on the low E string at fret 5, E on the A string at fret 7, and A on the D string at fret 7, held.",
        "The hand moves up two frets between bars 1 and 2, on the G string, and back down between bars 3 and 4, on the low E string.",
      ],
      coach: "Band on. Right notes and time after the take.",
      tab: TWO_BOXES_LINE,
      position: 5,
      shifts: true,
      chords: "A5 | A5 | A5 | A5",
      jam: ROCK("A minor"),
      harmony: { scale: ["A", "minorPentatonic"] },
      rungs: ladder(60, 110, 10),
      passAt: 90,
      ...lick(0.75),
      minutes: 6,
    },
    {
      id: "box-two-lick",
      title: "A lick that lives in box 2",
      purpose: "Two bars on the top strings of box 2, turning round the high A at fret 10 of the B string and walking down to the A on the D string.",
      howTo: [
        "Straight eighths, 70 BPM up to a pass at 100.",
        "Bar 1: A on the B string at fret 10, C and D on the top string (8 and 10), back to C, then A and G on the B string (10 and 8), E on the G string at fret 9, and G again. Bar 2: A and G on the B string, E and D on the G string (9 and 7), then C and A on the D string (10 and 7) as quarter notes.",
        "First finger on fret 7 throughout: frets 7, 8, 9 and 10 lie under the four fingers.",
      ],
      coach: "Band on. Right notes and time after the take.",
      tab: BOX_TWO_LICK,
      position: 7,
      chords: "A5 | A5",
      jam: ROCK("A minor"),
      harmony: { scale: ["A", "minorPentatonic"] },
      rungs: ladder(70, 120, 10),
      passAt: 100,
      ...lick(0.8),
      minutes: 5,
    },
    {
      id: "your-two-boxes",
      title: "Your turn: start in one box, end in the other",
      purpose: "Over four bars of A5, a phrase of your own that begins in box 1 and finishes in box 2, or the other way round.",
      howTo: [
        "Straight eighths or any rhythm you like, 60 to 90 BPM, four bars that loop.",
        "Cross over on any string, at the fret the two boxes share: the G string at fret 7 and the B string at fret 8 are the easiest. End on an A. The written line is one way to do it.",
        NOT_CHECKED_YET,
      ],
      coach: "Not checked yet. Record it and listen for the moment you change box.",
      tab: TWO_BOXES_LINE,
      position: 5,
      shifts: true,
      chords: "A5 | A5 | A5 | A5",
      jam: ROCK("A minor"),
      rungs: ladder(60, 90, 10),
      ...YOUR_TURN,
      selfCheck: [
        "Did you play in both boxes inside the four bars?",
        "Did your phrase end on an A?",
      ],
      minutes: 4,
    },
  ],
};
