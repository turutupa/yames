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

// ===================================================================================
// A second round (2026-11-19, afternoon): four more consolidation Steps. The box-1
// licks at the twelfth fret in E, the double stops over a one, four, five in E,
// chord tones over A, D and E, and a twelve-bar solo in E that travels from the
// twelfth fret to the nut and up into box 2. Every id is new.
// ===================================================================================

const TWELVE_EIGHT = (key: string) => ({ groove: "rockTwelveEight", key });

// --- The box at the twelfth fret -------------------------------------------------------

// The three licks of `box-extension`, copied as written there and moved seven frets up.
const PAGE_DESCENT =
  "/16 1:5 2:8 2:5 3:7 1:5 2:8 2:5 3:7 2:8 2:5 3:7 3:5 2:8 2:5 3:7 3:5 | /16 3:7 3:5 4:7 4:5 3:7 3:5 4:7 4:5 /4 5:7 4:7";
const TRIPLET_REPEAT = "/8t 1:5 2:8 2:5 1:5 2:8 2:5 1:5 2:8 2:5 1:5 2:8 2:5 | /8t 1:8 1:5 2:8 1:8 1:5 2:8 /2 1:5";
const EXTENSION_LICK = "/8 3:7 2:8 2:10 1:8 1:10 1:8 2:10 2:8 | /8 1:10 1:8 2:10 2:8 3:7 3:5 /4 4:7";
const TO_E = 7;

/** Beginner, after the box and its extension: the same licks in E, where the frets are narrow. */
export const BOX_AT_TWELVE: StepSpec = {
  id: "box-at-twelve",
  title: "The box at the twelfth fret: licks in E",
  goal: "Play the descending sixteenth run, the three-note repeat and the extension lick in E minor pentatonic, with box 1 at fret 12 and its extension at frets 15 and 17.",
  why: "These are three of the licks you already know, seven frets higher. Box 1 of A minor pentatonic at fret 5 is box 1 of E minor pentatonic at fret 12, and nothing in the fingering changes: the same fingers on the same strings in the same order. Two things do change. The frets up here are narrow, so the fingers land in less room than they are used to. And the band is in E minor, the key of the root line you play at the nut, so these licks and that riff belong to the same song. A lick you can play in two places is a lick you can use.",
  howTo: [
    "Box 1 in E: first finger on fret 12, and the notes are E, G, A, B and D. Every fret is the one you played in A plus 7: 5 becomes 12, 7 becomes 14, 8 becomes 15.",
    "The extension is frets 15 and 17 on the B and high E strings: D, E, G and A. In A it was frets 8 and 10.",
    "The frets are closer together here. Keep the fingers curled and close to the strings, and start at the slowest rung while the hand learns the smaller spacing.",
  ],
  payoff: "Three licks you can play in A and in E, and a box you can find at fret 5 and at fret 12.",
  difficultyException:
    "The licks of the Step before in a new place, without its sextuplet run, so the note rate is a little lower. The narrow frets at 12 are the demand.",
  exercises: [
    {
      id: "twelve-descent",
      title: "The sixteenth run at fret 12",
      purpose: "The run you already know from 'A descending sixteenth run', moved to E. These are the same notes that Exercise gives you when it comes round in E, so nothing here is new: it is repeated so the box at fret 12 starts with something your fingers know. Four-note groups down the top of the box: E, D, B, A, then D, B, A, G, then down a string.",
      howTo: [
        "Straight sixteenths, four to a click, 60 BPM up to a pass at 80.",
        "Bar 1: E at 12 on the high E, D at 15 and B at 12 on the B, A at 14 on the G, twice; then D, B, A, G twice. Bar 2: A, G on the G string, E, D on the D string, twice, then B on the A string and E on the D string to finish.",
        "The same fingers as in A: first finger for every note at fret 12, whichever string it is on, third finger on fret 14, fourth on fret 15.",
      ],
      coach: "Right notes, notes heard and even sixteenths after the take.",
      tab: shiftFrets(PAGE_DESCENT, TO_E),
      position: 12,
      chords: "E5 | E5",
      jam: ROCK("E minor"),
      harmony: { scale: ["E", "minorPentatonic"] },
      rungs: ladder(60, 110, 10),
      passAt: 80,
      ...lick(0.8),
      minutes: 5,
    },
    {
      id: "twelve-triplets",
      title: "The three-note repeat at fret 12",
      purpose: "E, D and B as triplets, over and over: the three-note repeat you learned in A, now in E. Then G, E, D, and home to E.",
      howTo: [
        "Eighth-note triplets, three to a click, 60 BPM up to a pass at 90.",
        "E at 12 on the high E and B at 12 on the B under one first finger, rolled from one string to the other, and D at 15 on the B with your fourth. Four times. Bar 2: G at 15, E at 12 on the high E, D at 15 on the B, twice, then the E held.",
      ],
      coach: "Written triplets: right notes, notes heard and timing after the take.",
      tab: shiftFrets(TRIPLET_REPEAT, TO_E),
      position: 12,
      chords: "E5 | E5",
      jam: TWELVE_EIGHT("E minor"),
      harmony: { scale: ["E", "minorPentatonic"] },
      rungs: ladder(60, 110, 10),
      passAt: 90,
      ...lick(0.8),
      minutes: 5,
    },
    {
      id: "twelve-extension",
      title: "Up to the extension at frets 15 and 17",
      purpose: "The lick from 'Up to the extension and back', in E. It leaves the box upwards on the top two strings, frets 15 and 17, and comes back home to E.",
      howTo: [
        "Straight eighths, 70 BPM up to a pass at 100.",
        "Bar 1: A on the G string at fret 14, then D and E on the B string (frets 15 and 17), G and A on the high E (15 and 17), and back down G, E, D. Bar 2: A and G on the high E, E and D on the B, then A and G on the G string (14 and 12) back in the box, and E at fret 14 on the D string.",
        "First finger on fret 14 for the extension: frets 14, 15 and 17 lie under the first, second and fourth fingers. Move back to fret 12 for the last three notes of bar 2.",
      ],
      coach: "Right notes, notes heard and time after the take.",
      tab: shiftFrets(EXTENSION_LICK, TO_E),
      position: 14,
      shifts: true,
      chords: "E5 | E5",
      jam: ROCK("E minor"),
      harmony: { scale: ["E", "minorPentatonic"] },
      rungs: ladder(70, 120, 10),
      passAt: 100,
      ...lick(0.8),
      minutes: 5,
    },
  ],
};

// --- Double stops over E, A and B ------------------------------------------------------

// Over E: the barre on the top two strings, one stab three frets up (third finger flat), then the G string walking under the B.
const STOPS_E_1 =
  "/8 2:12f1+1:12f1 2:12f1+1:12f1 2:12f1+1:12f1 2:12f1+1:12f1 2:12f1+1:12f1 2:12f1+1:12f1 2:15f3+1:15f3 2:12f1+1:12f1";
const STOPS_E_2 = "/8 3:13f2+2:12f1 3:14f3+2:12f1 3:13f2+2:12f1 3:12f1+2:12f1 /2 3:13f2+2:12f1";
// Over A: one fret on the G and B strings, and the same shape two frets lower leaning into it.
const STOPS_A_1 =
  "/8 3:14f3+2:14f3 3:14f3+2:14f3 3:14f3+2:14f3 3:14f3+2:14f3 3:14f3+2:14f3 3:14f3+2:14f3 3:12f1+2:12f1 3:14f3+2:14f3";
const STOPS_A_2 = "/8 3:14f3+2:14f3 3:12f1+2:12f1 3:14f3+2:14f3 3:12f1+2:12f1 /2 3:14f3+2:14f3";
// Over B: the A figure, two frets higher.
const STOPS_B_1 = shiftFrets(STOPS_A_1, 2);
const STOPS_B_2 = shiftFrets(STOPS_A_2, 2);
const STOPS_CHORUS = [
  STOPS_E_1, STOPS_E_2, STOPS_E_1, STOPS_E_2,
  STOPS_A_1, STOPS_A_2, STOPS_E_1, STOPS_E_2,
  STOPS_B_1, STOPS_A_1, STOPS_E_1, STOPS_E_2,
].join(" | ");
const TWELVE_BAR_E7 = "E7 | E7 | E7 | E7 | A7 | A7 | E7 | E7 | B7 | A7 | E7 | E7";
const STOPS_HARMONY = { scaleOverChords: ["E", "minorPentatonic"] as [string, string], allowed: ["G#", "C#", "D#"] };

/** Intermediate, after the double stops in A: the same shapes in E, over the one, the four and the five. */
export const DOUBLE_STOPS_IN_E: StepSpec = {
  id: "double-stops-in-e",
  title: "Double stops over E, A and B",
  goal: "Play rock and roll double stops in E over the one, four and five chords: a two-bar figure for each chord, then a twelve-bar chorus made of them.",
  why: "The double stops you learned were in A, and most of them sat over one chord. A twelve-bar rock and roll chorus has three: the one, the four and the five, which in E are E, A and B. Each chord has a double stop that belongs to it, and at the twelfth fret the three sit within a few frets of each other. Play the figures in the order of a twelve-bar chorus and you have a whole guitar part that follows the band, not a lick.",
  howTo: [
    "Over E: first finger across the B and high E strings at fret 12, the shape you played at fret 5 in A. The G string adds frets 12, 13 and 14 under it.",
    "Over A: the G and B strings at fret 14, which are A and C#. Over B: the same shape two frets higher, at fret 16, which is B and D#.",
    "Mute the lower strings with the heel of the picking hand and hit only the two strings you want. Keep every double stop short and punchy except the held ones.",
  ],
  payoff: "Twelve bars of double stops that follow E, A and B: a rock and roll chorus.",
  difficultyException:
    "The same eighth-note double stops as the Step before, without its single-note runs, whose string crossings the metric counts, so the number sits a little lower. The demand is a figure for each of three chords around the twelfth fret, and twelve bars of them in the order of the form.",
  exercises: [
    {
      id: "stops-on-e",
      title: "Over E: the barre at fret 12",
      purpose: "Two bars over E7. Bar 1 drives the double stop at fret 12 on the B and high E strings and jumps once to fret 15; bar 2 walks the G string under the B string and holds.",
      howTo: [
        "Straight eighths, 80 BPM up to a pass at 120, over a rock beat.",
        "Bar 1: fret 12 on the B and high E strings six times, fret 15 on the same two strings once, and fret 12 again. Bar 2: keep the B string at 12 and move the G string 13, 14, 13, 12, then 13 held.",
        "First finger flat across the strings at fret 12, and second and third fingers for frets 13 and 14 on the G string. Play the fret 15 double stop with your third finger flat across the top two strings, or with your little finger if that holds both strings cleaner, then come straight back to the first finger at fret 12.",
      ],
      coach: "Two notes at once are one attack: timed and counted, not checked for pitch.",
      pick: "free",
      tab: `${STOPS_E_1} | ${STOPS_E_2}`,
      position: 12,
      chords: "E7 | E7",
      jam: ROCK("E"),
      harmony: STOPS_HARMONY,
      rungs: ladder(80, 140, 10),
      passAt: 120,
      ...TIMED,
      minutes: 5,
    },
    {
      id: "stops-on-a",
      title: "Over A: fret 14 on the G and B strings",
      purpose: "Two bars over A7. The double stop is A and C#, the root and third of the chord, and the same shape two frets lower leans into it.",
      howTo: [
        "Straight eighths, 80 BPM up to a pass at 120.",
        "The G and B strings at the same fret, all the way. Bar 1: fret 14 six times, fret 12 once, fret 14 again. Bar 2: 14, 12, 14, 12, then 14 held.",
        "Third finger flat across both strings at 14, first finger flat across them at 12. The first finger is where the E barre was: the hand has not moved.",
      ],
      coach: "Two notes at once are one attack: timed and counted, not checked for pitch.",
      pick: "free",
      tab: `${STOPS_A_1} | ${STOPS_A_2}`,
      position: 12,
      chords: "A7 | A7",
      jam: ROCK("E"),
      harmony: STOPS_HARMONY,
      rungs: ladder(80, 140, 10),
      passAt: 120,
      ...TIMED,
      minutes: 5,
    },
    {
      id: "stops-on-b",
      title: "Over B: the same shape at fret 16",
      purpose: "Two bars over B7: the A figure moved up two frets. The double stop is B and D#, and the one that leans into it is the A double stop you just played.",
      howTo: [
        "Straight eighths, 80 BPM up to a pass at 120.",
        "The G and B strings at the same fret, all the way. Bar 1: fret 16 six times, fret 14 once, fret 16 again. Bar 2: 16, 14, 16, 14, then 16 held.",
        "Move the whole hand up two frets: third finger flat at 16, first finger flat at 14.",
      ],
      coach: "Two notes at once are one attack: timed and counted, not checked for pitch.",
      pick: "free",
      tab: `${STOPS_B_1} | ${STOPS_B_2}`,
      position: 14,
      chords: "B7 | B7",
      jam: ROCK("E"),
      harmony: STOPS_HARMONY,
      rungs: ladder(80, 140, 10),
      passAt: 120,
      ...TIMED,
      minutes: 5,
    },
    {
      id: "stops-chorus",
      title: "A twelve-bar chorus in E",
      purpose: "The three figures in the order of a twelve-bar chorus: four bars of E, two of A, two of E, one of B, one of A, and two of E to finish.",
      howTo: [
        "Straight eighths, 80 BPM up to a pass at 110, over a rock beat.",
        "Bars 1 to 4: the E figure twice. Bars 5 and 6: the A figure. Bars 7 and 8: the E figure. Bar 9 is the first bar of the B figure, and bar 10 is the first bar of the A figure. Bars 11 and 12: the E figure, ending on its held double stop, G# and B, the third and fifth of the chord.",
        "The whole hand moves only for bar 9, up two frets, and comes back for bar 10. In every other bar it stays where the first finger sits at fret 12.",
      ],
      coach: "Twelve bars of double stops: timed and counted, not checked for pitch.",
      pick: "free",
      tab: STOPS_CHORUS,
      position: 12,
      shifts: true,
      chords: TWELVE_BAR_E7,
      jam: ROCK("E"),
      harmony: STOPS_HARMONY,
      rungs: ladder(80, 130, 10),
      passAt: 110,
      ...TIMED,
      minutes: 6,
    },
  ],
};

// --- Chord tones over A, D and E -------------------------------------------------------

// The A triad, the D triad, and the D shape two frets higher for E. Then home to A.
const ARPEGGIOS_ADE =
  "/8 4:7f3 3:6f2 2:5f1 1:5f1 2:5f1 3:6f2 4:7f3 3:6f2 | /8 4:4f1 4:7f3 3:7f3 2:7f3 1:5f1 2:7f3 3:7f3 4:7f3 | /8 4:6f1 4:9f3 3:9f3 2:9f3 1:7f1 2:9f3 3:9f3 4:9f3 | /8 3:6f2 2:5f1 1:5f1 2:5f1 /2 4:7f3";
// A lick over each chord that ends on its root, all four under one hand at fret 4.
const ROOTS_ADE =
  "/8 2:5 3:6 3:4 4:6 /2 4:7 | /8 1:5 2:7 2:5 3:6 /2 3:7 | /8 1:4 2:5 3:4 4:6 /2 5:7 | /8 3:6 2:5 2:7 1:4 /2 1:5";
const ADE = "A | D | E | A";

/** Intermediate, after chord tones over A, G and D: the same work over one, four and five. */
export const CHORD_TONES_ADE: StepSpec = {
  id: "chord-tones-ade",
  title: "Chord tones over A, D and E",
  goal: "Play the triads of A, D and E one note at a time, licks that end on each chord's root, and the three thirds as one slow line, over a one, four, five progression.",
  why: "You followed A, G and D: one, flat seven, four. The twelve-bar chorus you played in double stops uses one, four and five: in E that was E, A and B, and in A those chords are A, D and E. Two of the triads are ones you know. The new one is E, and its third, G#, is in neither A mixolydian nor the minor box: it is the note one fret below A, and it is what makes the five chord pull back home. The scale that holds all three triads is A major. Following these chords is the skill you already have, with one new note to hear.",
  howTo: [
    "A is A, C#, E. D is D, F#, A. E is E, G#, B. The thirds are C#, F# and G#.",
    "A major, A B C# D E F# G#, holds every note of all three chords. Licks in this Step use it.",
    "End each lick on the root of the chord in that bar, and listen for it meeting the bass.",
  ],
  payoff: "A four-bar line that follows A, D, E and A, with the right third under every chord.",
  exercises: [
    {
      id: "ade-arpeggios",
      title: "The A, D and E triads",
      purpose: "Each chord's three notes, up and down the top four strings, one bar each, then home to A. The E triad is the D shape two frets higher.",
      howTo: [
        "Straight eighths, 70 BPM up to a pass at 100.",
        "Bar 1, A: frets 7, 6, 5, 5 from the D string up to the high E, back down to the D string, and C# on the G string again. Bar 2, D: F# at 4 and A at 7 on the D string, D at 7 on the G, F# at 7 on the B, A at 5 on the high E, and back down to A on the D string. Bar 3, E: the same shape two frets higher, G# at 6 and B at 9 on the D string, E at 9 on the G, G# at 9 on the B, B at 7 on the high E, and back down to B on the D string. Bar 4: C#, E, A, E, and A on the D string held.",
        "D and E are one shape: lay the third finger flat across the D, G and B strings, at fret 7 for D and fret 9 for E, and use the first finger for the two notes outside it. The first of those is three frets below the barre and the other is two, so let the hand move up a fret as the barre goes down.",
      ],
      coach: "Every note here is a chord tone: right notes and time after the take.",
      tab: ARPEGGIOS_ADE,
      position: 5,
      shifts: true,
      chords: ADE,
      jam: ROCK("A"),
      harmony: { chordTones: true },
      rungs: ladder(70, 120, 10),
      passAt: 100,
      ...lick(0.75),
      minutes: 5,
    },
    {
      id: "ade-roots",
      title: "A lick to each root, over A, D and E",
      purpose: "Four short licks, one a chord, each ending on that chord's root: A, D, E and A. All four sit under one hand at fret 4.",
      howTo: [
        "Straight eighths, then a half note, 70 BPM up to a pass at 100.",
        "A: E, C#, B, G#, then A on the D string at fret 7. D: A, F#, E, C#, then D on the G string at fret 7. E: G#, E, B, G#, then E on the A string at fret 7. A: C#, E, F#, G#, then A on the high E string at fret 5.",
        "First finger on fret 4 and one finger to a fret: frets 4, 5, 6 and 7. The hand doesn't move.",
        "In bars 1, 2 and 4 the last eighth note is one fret below the root it leads to, on the same string.",
      ],
      coach: "Written notes over the changes: right notes and time after the take.",
      tab: ROOTS_ADE,
      position: 4,
      chords: ADE,
      jam: ROCK("A"),
      harmony: { scaleOverChords: ["A", "major"] },
      rungs: ladder(70, 120, 10),
      passAt: 100,
      ...lick(0.75),
      minutes: 5,
    },
    {
      id: "ade-thirds",
      title: "The thirds: C#, F#, G#",
      purpose: "One note a bar, the third of each chord: C# over A, F# over D, G# over E, and C# again. When the chord goes from D up to E, the third goes up two frets with it.",
      howTo: [
        "Whole notes, one a bar, 60 BPM up to a pass at 80.",
        "C# at 6 on the G string, F# at 7 on the B string, G# at 9 on the B string, C# again. Listen for each one making its chord major.",
        "First finger on fret 6, second on fret 7, fourth on fret 9.",
      ],
      coach: "Four notes, each the third of its chord: right notes and time after the take.",
      tab: "/1 3:6 | 2:7 | 2:9 | 3:6",
      position: 6,
      chords: ADE,
      jam: ROCK("A"),
      harmony: { chordTones: true },
      rungs: ladder(60, 100, 10),
      passAt: 80,
      ...lick(0.75),
      minutes: 3,
    },
    {
      id: "ade-your-turn",
      title: "Your turn: land on each root, over A, D and E",
      purpose: "Over A, D, E, A, make up a lick in each bar that finishes on that chord's root, or on its third once you can hear it coming.",
      howTo: [
        "Straight eighths, 70 to 100 BPM.",
        "Use A major. Over E, try landing on G#, the third of the chord: it is the one note of A major that A mixolydian doesn't have. The written licks are an example of how it could go.",
        NOT_CHECKED_YET,
      ],
      coach: "Not checked yet. Record it and listen to the end of each bar.",
      tab: ROOTS_ADE,
      position: 4,
      chords: ADE,
      jam: ROCK("A"),
      rungs: ladder(70, 100, 10),
      ...YOUR_TURN,
      selfCheck: [
        "Did each bar end on its chord's root or third?",
        "Could you hear the E bar pulling back to A?",
      ],
      minutes: 4,
    },
  ],
};

// --- A second solo: twelve bars in E ---------------------------------------------------

// Third finger on the B string, first and little finger on the top string: the hand
// shape of the repeating lick in `climax`, with the first finger at fret 15.
const E_REPEAT_CELL = "2:17f3 1:15f1 1:17f4 1:15p";
// Every fretted note carries its finger: the line crosses three hand positions, and
// the rule-made fingering changed a finger in bar 1 when bar 7 was joined to it.
const E_SOLO_BARS = [
  // Box 1 at fret 12: up, and back down.
  "/8 4:14f3 3:12f1 3:14f3 2:12f1 /4 2:15f4 1:12f1",
  "/8 1:12f1 2:15f4 2:12f1 3:14f3 /4 3:12f1 4:14f3",
  // The answer at the nut: the root line of `riffs-in-e`, ending on the open string.
  "/8 6:0m 6:0m 6:3f3 6:0m 5:0 6:0m 6:3f3 6:2f2",
  "/8 6:0m 6:0m 5:2f2 5:0 6:3f3 6:2f2 /4 6:0",
  // Over A5, back at fret 12: two groups of the sixteenth run, and a rest on A.
  "/16 1:12f1 2:15f4 2:12f1 3:14f3 2:15f4 2:12f1 3:14f3 3:12f1 /4 3:14f3 /8 2:12f1 2:15f4",
  "/4 1:12f1 /8 2:15f4 2:12f1 /2 3:14f3v",
  // The opening again, and on up into box 2: the first finger slides from 12 to 14 on the G string.
  "/8 4:14f3 3:12f1 3:14f1 3:16f3 2:15f1 2:17f3 1:17f4 1:15f1",
  "/4 2:17f3 /8 1:15f1 1:17f4 /2 1:15f1v",
  // Over B5: down box 2 and back.
  "/8 3:16f3 3:14f1 4:17f4 4:14f1 /4 3:14f1 3:16f3",
  // The peak: the repeating lick, six times, then two of its notes slowed down, and the third held.
  `/16 ${E_REPEAT_CELL} ${E_REPEAT_CELL} ${E_REPEAT_CELL} ${E_REPEAT_CELL}`,
  `/16 ${E_REPEAT_CELL} ${E_REPEAT_CELL} /4 1:17f4 1:15f1`,
  "/1 2:17f3v",
];
const E_SOLO_CHORDS = "E5 | E5 | E5 | E5 | A5 | A5 | E5 | E5 | B5 | A5 | E5 | E5".split(" | ");
const eSolo = (from: number, to: number) => E_SOLO_BARS.slice(from, to).join(" | ");
const eSoloChords = (from: number, to: number) => E_SOLO_CHORDS.slice(from, to).join(" | ");
const E_SOLO_HARMONY = { scaleOverChords: ["E", "minorPentatonic"] as [string, string], allowed: ["F#"] };

/** Advanced, before the sixteen-bar solo: a shorter one in E that travels the neck. */
export const SOLO_IN_E: StepSpec = {
  id: "solo-in-e",
  title: "A second solo: twelve bars in E",
  goal: "Play a twelve-bar written solo in E minor with the band, from the open strings to the seventeenth fret, then play twelve bars of your own.",
  why: "A solo goes somewhere, and this one goes a long way. It opens in box 1 at the twelfth fret, answers itself with the open-string riff at the nut, climbs back through box 1 into box 2, peaks on a repeating lick and stops on one held note. Every part of it is something you have played in another Step, or close to it. What is new is getting from one part to the next in time, while the band keeps going.",
  howTo: [
    "Learn it in halves, then join them. Bars 1 to 6 are over E5 and A5. Bars 7 to 12 start back on E5, pass through B5 and A5, and end on E5.",
    "Three places for the hand: first finger at fret 12 for box 1, the nut for the riff in bars 3 and 4, and box 2 from the middle of bar 7, where the first finger sits at fret 14 on the D and G strings and at fret 15 on the top two.",
    "The two long moves are made on open strings. The riff starts with two open low E's and ends on one: travel while they sound.",
  ],
  payoff: "Twelve bars that start in the box at the twelfth fret, go down to the nut and finish at the seventeenth fret, played with a band.",
  difficultyException:
    "The Step before is fast licks alone. This solo has long notes, a riff and twelve bars to hold together, so its note rate is lower; moving between three places on the neck in time is the demand.",
  exercises: [
    {
      id: "e-solo-a",
      title: "The solo, bars 1 to 6",
      purpose: "The first half: a phrase up and down box 1 at fret 12, the open-string riff as its answer, then sixteenths over A5 that come to rest on A.",
      howTo: [
        "Straight eighths and sixteenths, 60 BPM up to a pass at 85.",
        "Bar 1 climbs E, G, A, B, D, E in box 1. Bar 2 comes back down: E, D, B, A, G, E. Bars 3 and 4 are the root line from 'The same riffs in E' at the nut, with a new ending on the open low E. Bar 5 is back at fret 12: two four-note groups of the sixteenth run, then A, B, D. Bar 6: E, D, B, and A on the G string at fret 14, held.",
        "Bar 3 starts with two open notes, so the hand can leave fret 14 and be at the nut in time for the G at fret 3. Go back up during the open E that ends bar 4.",
        "At the nut: third finger on fret 3, second finger on fret 2, as in 'The root line in E'. Mute the open low E's with the side of the picking hand as you did there, all but the last one, which rings for a full beat.",
      ],
      coach: "Written notes: right notes, notes heard and time over the six bars, after the take.",
      tab: eSolo(0, 6),
      position: 12,
      shifts: true,
      chords: eSoloChords(0, 6),
      jam: ROCK("E minor"),
      harmony: E_SOLO_HARMONY,
      rungs: ladder(60, 100, 5),
      passAt: 85,
      ...lick(0.75, 6),
      minutes: 6,
    },
    {
      id: "e-solo-b",
      title: "The solo, bars 7 to 12",
      purpose: "The second half: the opening again, and this time it keeps climbing into box 2; a dip down box 2 over B5; the repeating lick over A5 and E5; and an E at fret 17, on the B string, held to the end.",
      howTo: [
        "Straight eighths and sixteenths, 60 BPM up to a pass at 85.",
        "Bar 7: E, G, A as in bar 1, then B at fret 16 on the G string and on up box 2 to the top string: D, E, A, and back to G. Bar 8: E, G, A, and G held. Bar 9: B, A, G, E down box 2, then A and B as quarter notes. Bars 10 and 11: the four-note lick, E, G, A and a pull-off back to G, six times, then A and G as quarter notes. Bar 12: E on the B string at fret 17 for the whole bar.",
        "In bar 7 the first finger plays G at fret 12 and then A at fret 14, where bar 1 used the third finger: that move of two frets puts the hand in box 2. From there on, whenever the line is on the D and G strings, the first finger is at fret 14.",
        "On the top two strings the first finger sits at 15, with the third finger on the B string at 17 and the little finger on the top string at 17: the same three fingers as the repeating lick in 'Building to a peak', with the first finger two frets below the other two where there it was three.",
      ],
      coach: "The picked notes are checked for pitch and time. A pull-off counts only if it is heard.",
      tab: eSolo(6, 12),
      position: 12,
      shifts: true,
      chords: eSoloChords(6, 12),
      jam: ROCK("E minor"),
      harmony: E_SOLO_HARMONY,
      rungs: ladder(60, 100, 5),
      passAt: 85,
      ...lick(0.75, 6),
      minutes: 6,
    },
    {
      id: "e-solo",
      title: "The whole solo in E, with the band",
      purpose: "All twelve bars, start to finish, with the band: the twelfth fret, the nut, box 2, the peak and the held note.",
      howTo: [
        "Straight eighths and sixteenths, 60 BPM up to a pass at 85.",
        "Join the halves without a gap: bar 6 holds A on the G string at fret 14, and bar 7 starts on E at the same fret, one string lower. The held notes in bars 6, 8 and 12 carry vibrato. Bar 12 is one long note: breathe, and go round again.",
      ],
      coach: "All twelve bars are checked for right notes, notes heard and time after the take.",
      tab: eSolo(0, 12),
      position: 12,
      shifts: true,
      chords: eSoloChords(0, 12),
      jam: ROCK("E minor"),
      harmony: E_SOLO_HARMONY,
      rungs: ladder(60, 100, 5),
      passAt: 85,
      ...lick(0.75, 12),
      minutes: 7,
    },
    {
      id: "your-e-solo",
      title: "Your turn: your own twelve bars in E",
      purpose: "The same twelve bars of chords, and a solo of your own. Use box 1 at fret 12, box 2 above it, the open strings, or all three.",
      howTo: [
        "Straight time, 60 to 90 BPM, twelve bars that loop.",
        "Give it a shape: say something, answer it somewhere else on the neck, build through bars 9 and 10, and end on one long note. The written solo is an example.",
        NOT_CHECKED_YET,
      ],
      coach: "Not checked yet. Record it, and listen for where it moves.",
      tab: eSolo(0, 12),
      position: 12,
      shifts: true,
      chords: eSoloChords(0, 12),
      jam: ROCK("E minor"),
      rungs: ladder(60, 90, 10),
      ...YOUR_TURN,
      selfCheck: [
        "Did your solo use more than one place on the neck?",
        "Did it end on a note you held?",
      ],
      minutes: 6,
    },
  ],
};
