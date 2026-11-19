/**
 * Blues and Pentatonics: the second round of consolidation Steps (2026-11-19).
 * A draft, like the rest of the Path: no teacher or guitarist has reviewed it.
 *
 * Five Steps that finish the list in `plans/paths/NEW_PATHS.md` ("Blues and
 * Pentatonics, extended"): the form in E at the nut with its turnarounds, a
 * faster shuffle, box 5 and a line into box 4, a solo over three choruses, and
 * the slow blues in a second key. Nothing here is a new idea. Each Step takes
 * something the Path has taught to another key, position, tempo or length.
 * Their ids are new, so nobody's progress moves.
 *
 * Helpers are copied from `blues-pentatonics.ts` and `blues-more.ts`, never
 * imported from the Path file: that would be a circular import.
 */
import type { ExerciseSpec, StepSpec } from "../spec";
import type { PassBar } from "../format";
import { ladder, moveChart, pentatonic, shiftFrets, swing } from "../templates";

const TWELVE = "A7 | A7 | A7 | A7 | D7 | D7 | A7 | A7 | E7 | D7 | A7 | E7";
const VAMP_A = "A7 | A7 | A7 | A7";
const TWELVE_E = moveChart(TWELVE, -5);
const TWELVE_C = moveChart(TWELVE, 3);

const TEXAS = { groove: "bluesTexas", key: "A blues", feel: "shuffle" } as const;
const TEXAS_E = { groove: "bluesTexas", key: "E blues", feel: "shuffle" } as const;
const SLOW_C = { groove: "slowBlues", key: "C blues", feel: "shuffle" } as const;

type Grading = Pick<ExerciseSpec, "grade" | "alsoGraded" | "pass">;
const EVENNESS = { straight: 0.75, shuffle: 0.6, slow: 0.5 } as const;

function lick(feel: keyof typeof EVENNESS, overBars = 4): Grading {
  const bars: PassBar[] = [
    { metric: "noteIdentity", min: 0.9, overBars },
    { metric: "notesHeard", min: 0.9, overBars },
    { metric: "extraNotes", max: 4, overBars: 4 },
    { metric: "timingEvenness", min: EVENNESS[feel], overBars },
  ];
  return { grade: "written", alsoGraded: ["timingEvenness"], pass: bars };
}

/**
 * Timed and counted, never pitch-checked: for bends, which would read as wrong
 * notes, and for lines where an open string rings under the others by design.
 */
function timedOnly(feel: keyof typeof EVENNESS, overBars = 4): Grading {
  return {
    grade: "attacksOnly",
    alsoGraded: ["timingEvenness"],
    pass: [
      { metric: "notesHeard", min: 0.9, overBars },
      { metric: "extraNotes", max: 4, overBars: 4 },
      { metric: "timingEvenness", min: EVENNESS[feel], overBars },
    ],
  };
}

const YOUR_TURN = { grade: "selfChecked", example: true } as const;
const NOT_CHECKED_YET =
  "Your turn, and not checked yet: the app can't judge notes you choose, so you tick it off yourself.";

function sh(notes: string): string {
  return notes
    .trim()
    .split(/\s+/)
    .map((note, index) => `${index % 2 === 0 ? "/4t" : "/8t"} ${note}`)
    .join(" ");
}

// ---------------------------------------------------------------------------
// The blues in E, at the nut.
// ---------------------------------------------------------------------------

// The Step 1 box loop. Five frets down, the first finger's notes are open strings.
const BOX_LOOP = `/8 6:5 6:8 5:5 5:7 4:5 4:7 3:5 3:7 | /8 2:5 2:8 1:5 1:8 /2 1:5 | /8 2:8 2:5 3:7 3:5 /4 4:7 4:5 | /8 5:7 5:5 /4 6:8 /2 6:5`;

// One riff per chord. E7 and A7: root, root, blue third to the third, fifth, flat seven, fifth, third.
// E7 and A7 are one shape on two string pairs. B7 has no open root: its riff is the open B7
// chord shape, with the open D for the blue third and the open B on top.
const NUT_E = "/8 6:0 6:0 6:3f3 6:4f4 5:2f2 4:0 5:2f2 6:4f4";
const NUT_A = "/8 5:0 5:0 5:3f3 5:4f4 4:2f2 3:0 4:2f2 5:4f4";
const NUT_B = "/8 5:2f2 5:2f2 4:0 4:1f1 3:2f3 2:0 3:2f3 4:1f1";

// Two turnarounds. Down the B string against the open high E; up the low strings
// through the blue note. Both end on B7 the same way.
const TURN_TOP = "/8 2:3f3 1:0 2:2f2 1:0 2:1f1 1:0 2:0 1:0";
const TURN_LOW = "/8 6:0 6:0 6:4f4 6:4f4 5:0 5:0 5:1f1 5:1f1";
const TURN_END = "/4 5:2f2 r 4:1f1 5:2f2";

const NUT_CHORUS = [NUT_E, NUT_E, NUT_E, NUT_E, NUT_A, NUT_A, NUT_E, NUT_E, NUT_B, NUT_A, TURN_LOW, TURN_END].join(" | ");

// ---------------------------------------------------------------------------
// A faster shuffle: lines the Path has already taught.
// ---------------------------------------------------------------------------

const walkA = sh("6:5 6:9 5:7 5:9 5:10 5:9 5:7 6:9");
const walkD = sh("5:5 5:9 4:7 4:9 4:10 4:9 4:7 5:9");
const walkE = sh("5:7 5:11 4:9 4:11 4:12 4:11 4:9 5:11");
const BOOGIE = [walkA, walkA, walkA, walkA, walkD, walkD, walkA, walkA, walkE, walkD, walkA, walkE].join(" | ");

// The Beginner Level's straight-eighth riffs, here shuffled.
const RIFF_A = "/8 6:5 6:5 6:8 6:5 5:5 6:5 5:7 5:5";
const RIFF_D = "/8 5:5 5:5 5:7 5:5 4:5 5:5 4:7 4:5";
const RIFF_E = "/8 5:7 5:7 4:5 5:7 4:7 5:7 4:5 5:7";
const RIFF_END = "/8 5:7 4:5 4:7 4:5 /2 5:7";
const RIFF_CHORUS = [RIFF_A, RIFF_A, RIFF_A, RIFF_A, RIFF_D, RIFF_D, RIFF_A, RIFF_A, RIFF_E, RIFF_D, RIFF_A, RIFF_END].join(" | ");

// The first four bars of the chorus that lands: two phrases to C#, with A between.
const LICK_TO_THIRD = `/8 4:7 3:5 3:7 3:5 /2 3:6 | /2 4:7 /2 r | /8 2:5 2:8 2:5 3:7 /2 3:6 | /4 4:7 4:5 /2 4:7`;

// ---------------------------------------------------------------------------
// Box 5, and the way into box 4.
// ---------------------------------------------------------------------------

// The template puts box 5 at frets 14 to 17; an octave down it sits under box 1.
// Its usual fingers are printed: first on fret 2, second on fret 3, fourth on fret 5.
const BOX_FIVE_FINGER: Readonly<Record<string, number>> = { "2": 1, "3": 2, "5": 4 };
const BOX_FIVE = shiftFrets(pentatonic({ root: "A", box: 5, sequence: "updown" }), -12).replace(
  /(\d):(\d+)/g,
  (place, _string, fret) => `${place}f${BOX_FIVE_FINGER[fret]}`,
);
const LOW_DOOR_UP = "/8 6:3f2 6:5f4 5:3f2 5:5f4 4:2f1 4:5f4 3:2sf1 3:5f1";
const LOW_DOOR = `${LOW_DOOR_UP} | /8 3:7f3 2:5f1 3:7f3 3:5f1 /2 4:7f3`;
const HIGH_DOOR = `/8 2:5 2:8 1:5 1:8 1:10sf1 1:12f1 /4 1:15 | /8 2:15 2:13 3:14 3:12 /2 3:14`;
const WHOLE_NECK = [
  LOW_DOOR_UP,
  "/8 2:5 2:8 1:5 1:8 1:10sf1 1:12f1 /4 1:15",
  "/8 1:12 2:15 2:13 3:14 /2 3:12",
  "/8 4:14 3:12 3:14 2:13 /2 3:14",
].join(" | ");

// ---------------------------------------------------------------------------
// Three choruses that make one solo.
// ---------------------------------------------------------------------------

// Chorus 1: the three low strings of box 1, and three empty bars.
const CHORUS_LOW = [
  "/4 6:5 /8 6:8 5:5 /2 5:7",
  "/1 r",
  "/4 6:5 /8 6:8 5:5 /2 4:5",
  "/1 r",
  "/4 6:5 /8 6:8 5:7 /2 5:5",
  "/1 r",
  "/4 5:7 /8 5:5 6:8 /2 6:5",
  "/2 r /4 r /8 6:8 5:5",
  "/2 5:7 /4 r /8 4:5 5:7",
  "/2 5:5 /2 r",
  "/8 6:5 6:8 5:5 6:8 /2 6:5",
  "/2 5:7 /2 r",
].join(" | ");

// Chorus 2: through the door into box 2. A busy call ends on C; a slower answer ends on A.
// The hand sits with the first finger on fret 8 of the top two strings and the third on fret 10.
const CALL = "/8 2:10f3 2:8f1 2:10f3 2:8f1 /2 1:8f1";
const ANSWER = "/4 3:9f2 2:8f1 /2 2:10f3";
const CHORUS_ANSWERS = [
  "/8 4:7 3:5 3:7s 3:9 /2 2:8",
  ANSWER,
  CALL,
  ANSWER,
  CALL,
  "/4 2:10f3 2:8f1 /2 3:7f1",
  CALL,
  ANSWER,
  "/8 3:9 2:8 3:9 3:7 /2 3:9",
  "/8 3:7 3:9 2:8 3:9 /2 3:7",
  "/8 2:10f3 1:8f1 2:10f3 2:8f1 /2 4:7f1",
  "/2 3:9 /2 r",
].join(" | ");

// Chorus 3: the second door, up box 4 to a bend at fret 15, and home to the low A.
const CHORUS_PEAK = [
  "/8 2:8 2:10 1:8 1:10s 1:12 2:13 /4 1:12",
  "/8 1:12 1:10 2:13 1:10 /2 2:10",
  "/8 3:12 3:14 2:13 2:15 /2 1:12",
  "/8 3:14 2:13 2:15 1:12 /2 1:15f3",
  "/2 1:15b2v /4 r /8 1:15 1:12",
  "/8 2:15 2:13 3:14 2:13 /2 2:15",
  "/2 1:15b2v /4 r /8 1:12 2:15",
  "/8 3:14 2:13 3:14 3:12 /2 4:14",
  "/8 3:9 2:8 2:10 2:8 /2 3:9",
  "/8 3:7 3:5 4:7 3:5 /2 4:7",
  "/8 4:5 4:7 3:5 4:7 /2 6:5",
  "/1 r",
].join(" | ");

// ---------------------------------------------------------------------------
// Slow blues in C.
// ---------------------------------------------------------------------------

// The written slow chorus of the Path, as it is in A. Its bends are unison bends:
// double stops, which the right notes check leaves alone.
const SLOW_CHORUS = `
  /2 1:5v /4 r /8t 1:8 1:5 2:8 |
  /2 2:5v /4 3:7b2+2:5 /8t 3:5 3:7 3:5 |
  /2 4:7v /2 r |
  /2 r /4 r /8t 3:5 3:6h 2:5 |
  /2 3:7v /4 2:8b2+1:5 /8t 2:8 2:5 3:7 |
  /2 3:5v /2 r |
  /2 2:5v /4 3:7b2+2:5 /8t 3:5 3:7 3:5 |
  /2 4:7v /4 r /8t 4:7 3:5 3:7 |
  /2 2:5v /4 3:7b2+2:5 /8t 3:7 3:5 4:7 |
  /2 4:7v /4 3:7 /8t 3:5 3:7 3:5 |
  /4 3:9 3:8 3:7 3:6 |
  /2 2:5 4:6`;

// A second slow chorus, written in A and moved: a one-string bend to a note of
// each chord, a rest after it, and three triplet notes that lead on.
const LONG_BENDS = `
  /2 3:7b2v /4 r /8t 3:5 3:7 2:5 |
  /2 2:8b2v /2 r |
  /1 r |
  /2 r /4 r /8t 2:5 3:7 3:5 |
  /2 1:8b2v /4 r /8t 1:5 2:8 2:5 |
  /2 3:7v /2 r |
  /2 3:7b2v /4 r /8t 3:5 3:7 3:5 |
  /2 4:7v /4 r /8t 4:7 3:5 3:7 |
  /2 3:7b2v /4 r /8t 3:7 3:5 4:7 |
  /2 2:8b2v /4 r /8t 2:5 2:8 1:5 |
  /2 1:8b1v /4 r /8t 3:7f3 3:5f1 4:7f3 |
  /2 4:6f2 /2 r`;

/** Intermediate, after the form, the quick change and bends: the form in E, in open position. */
export const OPEN_E_BLUES: StepSpec = {
  id: "open-e-blues",
  title: "The blues in E, down at the nut",
  goal: "Play the box, a riff for each chord and two turnarounds in E with open strings, then all twelve bars of the form in E.",
  why: "E is the key where the guitar's lowest string is the home note. Nothing about the form changes: it is the same twelve bars, with E7, A7 and B7 where A7, D7 and E7 were. What changes is the hand. Down at the nut the open strings do the first finger's job, so the box you know becomes open strings and frets 2 and 3. The Step also gives you two more turnarounds. A turnaround is the last two bars of the form, E7 then B7 here, and it is there for one thing: to bring the band and the listener back to bar 1.",
  howTo: [
    "The form: four bars of E7, two of A7, two of E7, then B7, A7, E7, B7.",
    "E minor pentatonic is E, G, A, B, D. In open position every string is played open and then fretted: fret 3 on the two E strings and the B string, fret 2 on the A, D and G strings. Second finger on fret 2, third finger on fret 3.",
    "The blue note of the key is B flat, at fret 1 on the A string. The second turnaround passes through it on the way up to B.",
    "An open string rings until something stops it. Once you have left a string, let the side of the picking hand or a spare finger rest on it, or the low notes run into each other.",
  ],
  payoff: "Twelve bars in E that sound like rhythm guitar: a riff under each chord, and a turnaround that brings the form back to the top.",
  exercises: [
    {
      id: "nut-box",
      title: "The box at the nut",
      purpose: "The four-bar box loop from Step 1, over a band in E, where the open strings take the first finger's place. The same order of strings and the same rhythm, in a new home.",
      howTo: [
        "Shuffle eighths, 50 BPM up to a pass at 80. Each string is played open, then fretted: second finger on fret 2, third finger on fret 3.",
        "Bar 1 climbs from the open low E to A at fret 2 on the G string. Bar 2 goes over the top two strings and holds the open high E for two beats. Bar 3 comes down to the E on the D string, fret 2, on beat 3, then the open D. Bar 4 ends on the open low E, held.",
        "Say 'E' on each of the three E's as you pass them: the open low E string, fret 2 on the D string, the open high E string.",
      ],
      coach: "The line you know from Step 1, moved to the nut. Notes and the shuffle after the take.",
      tab: swing(shiftFrets(BOX_LOOP, -5)),
      position: 1,
      chords: "E7 | E7 | E7 | E7",
      jam: TEXAS_E,
      harmony: { scaleOverChords: ["E", "minorPentatonic"] },
      rungs: ladder(50, 110, 10),
      passAt: 80,
      ...lick("shuffle"),
      minutes: 5,
    },
    {
      id: "nut-riffs",
      title: "One riff, three chords",
      purpose: "A one-bar riff on each chord's root: the root twice, then the blue third pushed up to the chord's own third, on up the chord, flat seven included, and back down to the third. E7, A7, E7, B7, four bars that loop.",
      howTo: [
        "Shuffle eighths, 50 BPM up to a pass at 80.",
        "Over E7: the open low E twice, G and G# on the same string (frets 3 and 4), B on the A string (fret 2), the open D string, B again, and G#. Over A7 it is the same shape one string higher: the open A twice, C and C# (frets 3 and 4), E on the D string (fret 2), the open G string, E, and C#. Third finger on fret 3, fourth on fret 4, second on fret 2.",
        "The low B has no open string, so the B7 riff stays inside the open B7 chord shape: B twice on the A string (fret 2), the open D string and then D# (fret 1), A on the G string (fret 2), the open B string, A again, and D#. First finger on fret 1, second finger on the A string and third finger on the G string, both at fret 2.",
      ],
      coach: "Four bars and three chords, with the band changing under you. Notes and the shuffle after the take.",
      tab: swing([NUT_E, NUT_A, NUT_E, NUT_B].join(" | ")),
      position: 1,
      shifts: true,
      chords: "E7 | A7 | E7 | B7",
      jam: TEXAS_E,
      harmony: { scaleOverChords: ["E", "blues"], allowed: ["G#", "C", "C#", "D#"] },
      rungs: ladder(50, 100, 10),
      passAt: 80,
      ...lick("shuffle"),
      minutes: 6,
    },
    {
      id: "nut-turnarounds",
      title: "Two turnarounds in E",
      purpose: "The last two bars of the form, two ways. The first steps down the B string against the open high E. The second climbs the low strings. Both arrive on B7 with the same three notes.",
      howTo: [
        "Shuffle eighths, then quarter notes, 50 BPM up to a pass at 80. Four bars: the first turnaround, then the second.",
        "Bars 1 and 2: D, C#, C and B step down the B string (frets 3, 2, 1 and open), and the open high E answers each one. Then B on the A string (fret 2), a beat of rest, D# on the D string (fret 1), and B again.",
        "Bars 3 and 4: on the low strings, each note twice: the open E, G# (fret 4), the open A, and B flat (A string, fret 1). Then the same ending: B, a rest, D# and B.",
        "Let the high E ring through bar 1. That ringing string is the sound of the first turnaround. The band plays E7 and B7 in turn, so each turnaround is heard doing its job.",
      ],
      coach: "Timed and counted. The open E rings over the line on purpose, so right notes are not checked here: the pitch is for your ear.",
      tab: swing([TURN_TOP, TURN_END, TURN_LOW, TURN_END].join(" | ")),
      position: 1,
      shifts: true,
      chords: "E7 | B7 | E7 | B7",
      jam: TEXAS_E,
      harmony: { scaleOverChords: ["E", "blues"], allowed: ["G#", "C", "C#", "D#"] },
      rungs: ladder(50, 100, 10),
      passAt: 80,
      ...timedOnly("shuffle"),
      minutes: 6,
    },
    {
      id: "nut-chorus",
      title: "Twelve bars in E",
      purpose: "The whole form at the nut: the riff under each chord for ten bars, then the climbing turnaround in bars 11 and 12.",
      howTo: [
        "Shuffle eighths and quarter notes, twelve bars, 50 BPM up to a pass at 80.",
        "Four bars of the E7 riff, two of the A7 riff, two of the E7 riff, then one bar of the B7 riff and one of the A7 riff.",
        "Bar 11 is the climb on the low strings: E, G#, A and B flat, each twice. Bar 12 is B, a rest, D# and B, and the form comes round again.",
        "Every riff starts on its chord's root, twice. If you lose your place, wait for the bass to play the next root and come back in there.",
      ],
      coach: "Twelve bars over the band. Notes and the shuffle after the take.",
      tab: swing(NUT_CHORUS),
      position: 1,
      shifts: true,
      chords: TWELVE_E,
      jam: TEXAS_E,
      harmony: { scaleOverChords: ["E", "blues"], allowed: ["G#", "C", "C#", "D#"] },
      rungs: ladder(50, 100, 10),
      passAt: 80,
      ...lick("shuffle", 8),
      minutes: 7,
    },
  ],
};

/** Intermediate: the lines of the form at a quicker tempo. */
export const FAST_SHUFFLE: StepSpec = {
  id: "fast-shuffle",
  title: "A faster shuffle",
  goal: "Play the boogie line, a chorus of riffs and a lick to the third over a quicker shuffle, with a lighter hand.",
  why: "Not every blues sits at a medium tempo. The jump feel is the same shuffle played quicker, and it asks for nothing new from the fretting hand: every line here is one you have played. What changes is the picking hand and the ear. A stroke that was fine at 80 BPM is too big at 110, and as the tempo climbs players let the long-short of the shuffle even out a little. Meeting a quick tempo on notes you already know means the tempo is the only new thing.",
  howTo: [
    "Pick lighter and smaller. The pick should only just clear the string: a wide stroke that worked at 80 BPM arrives late at 110.",
    "Keep the fretting fingers close to the strings and press only as hard as the note needs.",
    "The band keeps its triplet at every tempo, so stay with the hi-hat. The timing bar is the looser shuffle one: an eighth that has evened out a little is not marked down.",
    "Start each ladder where it starts. The slow rungs are where the small stroke is learned.",
  ],
  payoff: "The twelve bars you know at 110 BPM, with a hand that is doing less.",
  exercises: [
    {
      id: "jump-boogie",
      title: "The boogie line, quicker",
      purpose: "The walking line from the twelve-bar Step, all twelve bars, at a tempo where the hand has to stay small. The notes are the ones you know.",
      howTo: [
        "Shuffle eighths, all twelve bars, 80 BPM up to a pass at 110.",
        "Root, third, fifth, sixth, flat seven and back down, on each bar's chord: from fret 5 on the low E string for A7, fret 5 on the A string for D7, fret 7 on the A string for E7.",
        "Let the hand move with each chord, as before, and look at the next root during the last two notes of the bar.",
      ],
      coach: "A line you know, with the band at a new tempo. Notes and the shuffle after the take.",
      tab: BOOGIE,
      position: 5,
      shifts: true,
      chords: TWELVE,
      jam: TEXAS,
      rungs: ladder(80, 130, 10),
      passAt: 110,
      ...lick("shuffle"),
      minutes: 6,
    },
    {
      id: "jump-riffs",
      title: "A chorus of riffs, shuffled",
      purpose: "The twelve bars of riffs from the Beginner Level, which were played over a straight band. Here the same notes shuffle, and quicker: a riff from each chord's root, all inside box 1.",
      howTo: [
        "Shuffle eighths, twelve bars, 80 BPM up to a pass at 110.",
        "Over A7: A, A, C, A on the low E string (frets 5, 5, 8, 5), then D on the A string, the low A again, and E and D on the A string (frets 7 and 5). Over D7 the riff starts on D (A string, fret 5): D, D, E, D, then G on the D string, D, and A and G on the D string. Over E7 it starts on E (A string, fret 7): E, E, G, E, A, E, G, E.",
        "Bar 12 is the ending: E, G, A, G, and E held for two beats.",
        "Rest the side of the picking hand lightly near the bridge so the low strings stay short and tight.",
      ],
      coach: "Twelve bars of riffs at speed. Notes and the shuffle after the take.",
      tab: swing(RIFF_CHORUS),
      position: 5,
      chords: TWELVE,
      jam: TEXAS,
      harmony: { scaleOverChords: ["A", "minorPentatonic"] },
      rungs: ladder(80, 130, 10),
      passAt: 110,
      ...lick("shuffle", 8),
      minutes: 6,
    },
    {
      id: "jump-lick",
      title: "A lick to the third, at speed",
      purpose: "Four bars over A7 from the chorus that lands: two short phrases that stop on C#, with A between them. At this tempo the stop matters as much as the run.",
      howTo: [
        "Shuffle eighths, quarter notes and half notes, 80 BPM up to a pass at 110.",
        "Bar 1: A on the D string, then C, D, C on the G string and C# held (G string, fret 6). Bar 2: A held, then two beats of rest. Bar 3: E, G, E on the B string, D on the G string, and C# held again. Bar 4: A and G on the D string as quarter notes, then A held.",
        "Hold each C# for its full two beats. At a quick tempo it is tempting to leave early.",
      ],
      coach: "Short phrases and long landings over a quick band. Notes and the shuffle after the take.",
      tab: swing(LICK_TO_THIRD),
      position: 5,
      chords: VAMP_A,
      jam: TEXAS,
      harmony: { scaleOverChords: ["A", "minorPentatonic"], allowed: ["C#"] },
      rungs: ladder(80, 130, 10),
      passAt: 110,
      ...lick("shuffle"),
      minutes: 5,
    },
  ],
};

/** Advanced, after boxes 3 and 4: the last shape, and a line into box 4. */
export const BOX_FIVE_STEP: StepSpec = {
  id: "box-five",
  title: "Box 5, and the way into box 4",
  goal: "Play the last pentatonic box, below box 1, join it to box 1 with a slide, and reach box 4 from box 1 along the top string.",
  why: "There are five shapes and you have four. The last one sits below box 1, at frets 2 to 5, and it is easy to place because its top is box 1's bottom: every note it has at fret 5 is a note you already play. It gives a solo somewhere lower to start from. The Step also closes a gap higher up. You can play box 4, but no line of yours has gone into it yet. A slide you already know, made with a different finger, takes you there.",
  howTo: [
    "Box 5 sits at frets 2 to 5: frets 3 and 5 on the two E strings, the A string and the B string, frets 2 and 5 on the D and G strings. First finger on fret 2, second on fret 3, fourth on fret 5.",
    "The A's are at fret 5 on the low E string, fret 2 on the G string and fret 5 on the high E string. The two at fret 5 are the outer A's of box 1.",
    "The door below is a slide on the G string from A at fret 2 up to C at fret 5, with the first finger. It puts your hand in box 1.",
    "The way into box 4 is the slide you know from D to E on the top string, frets 10 to 12. Make it with the first finger, not the third, and the hand arrives in box 4.",
  ],
  payoff: "All five boxes, and one line that runs from the second fret to the fifteenth.",
  exercises: [
    {
      id: "fifth-shape",
      title: "Box 5, up and down",
      purpose: "The fifth shape on its own, from G at the third fret. The same five notes, and with them you have all five boxes.",
      howTo: [
        "Straight eighths, two to a click, 60 BPM up to a pass at 80.",
        "Up and back. Say the A's as you pass them: fret 5 on the low E string, fret 2 on the G string, fret 5 on the high E string.",
      ],
      coach: "Right notes and even eighths after the take.",
      tab: `/8 ${BOX_FIVE} hold`,
      position: 2,
      shifts: true,
      harmony: { scale: ["A", "minorPentatonic"], cover: true },
      click: 2,
      rungs: ladder(60, 110, 10),
      passAt: 80,
      ...lick("straight"),
      minutes: 5,
    },
    {
      id: "low-door",
      title: "The door below",
      purpose: "A two-bar lick that climbs box 5, slides into box 1 on the G string and comes home to the A on the D string.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 80.",
        "Bar 1: G and A on the low E string (frets 3 and 5), C and D on the A string (3 and 5), E and G on the D string (2 and 5), then A at fret 2 on the G string slid up to C at fret 5 with the first finger. Pick the first note of the slide only.",
        "Bar 2 is in box 1: D on the G string (fret 7), E on the B string (5), D and C on the G string (7 and 5), and A on the D string, fret 7, held.",
      ],
      coach: "A slid-to note can come out too quiet to be heard, so the bar allows for it. The picked notes are checked.",
      tab: LOW_DOOR,
      position: 2,
      shifts: true,
      harmony: { scale: ["A", "minorPentatonic"], cover: true },
      click: 2,
      rungs: ladder(60, 100, 5),
      passAt: 80,
      ...lick("straight"),
      minutes: 5,
    },
    {
      id: "high-door",
      title: "Into box 4",
      purpose: "A two-bar lick that leaves box 1 along the top string, slides from D to E with the first finger and finishes inside box 4, on the A at the fourteenth fret.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 80.",
        "Bar 1: E and G on the B string (frets 5 and 8), A and C on the top string (5 and 8), then move the first finger up to D at fret 10 and slide it to E at fret 12, and play G at fret 15 for a beat. Pick the first note of the slide only.",
        "Bar 2 is in box 4: D and C on the B string (frets 15 and 13), A and G on the G string (14 and 12), and the A at fret 14 held.",
      ],
      coach: "A slid-to note can come out too quiet to be heard, so the bar allows for it. The picked notes are checked.",
      tab: HIGH_DOOR,
      position: 5,
      shifts: true,
      harmony: { scale: ["A", "minorPentatonic"], cover: true },
      click: 2,
      rungs: ladder(60, 100, 5),
      passAt: 80,
      ...lick("straight"),
      minutes: 5,
    },
    {
      id: "second-to-fifteenth",
      title: "From the second fret to the fifteenth",
      purpose: "Four bars over the band that go through both doors of this Step: box 5, the slide on the G string into box 1, the slide on the top string into box 4, and home on a high A.",
      howTo: [
        "Shuffle eighths, 65 BPM up to a pass at 85. It does not loop: the line ends high.",
        "Bar 1 is the first bar of the door below: G and A on the low E string, C and D on the A string, E and G on the D string, then A slid to C on the G string. Bar 2 is the way up: E, G, A, C, then D slid to E on the top string, and G at fret 15 for a beat.",
        "Bar 3 comes down box 4: E, D, C, A, and G held on the G string at fret 12. Bar 4: E on the D string (fret 14), G, A, C, and the A at fret 14 on the G string, held.",
      ],
      coach: "Notes and the shuffle after the take. Both slides are made with the first finger.",
      tab: swing(WHOLE_NECK),
      position: 2,
      shifts: true,
      loops: false,
      chords: VAMP_A,
      jam: TEXAS,
      harmony: { scaleOverChords: ["A", "minorPentatonic"] },
      rungs: ladder(65, 100, 5),
      passAt: 85,
      ...lick("shuffle"),
      minutes: 6,
    },
  ],
};

/** Advanced, before the slow blues: three choruses that make one solo. */
export const THREE_CHORUSES: StepSpec = {
  id: "three-choruses",
  title: "A three-chorus solo",
  goal: "Play three written choruses that make one solo: a sparse one down low, one that moves up a box and answers itself, and one that peaks high and comes home. Then play three of your own.",
  why: "One chorus is a statement. A solo is often several, and what makes it a solo is that the choruses are not alike: it starts with room to grow, it builds, it reaches a highest point, and it comes back. Everything it needs is already in your hands: the low end of box 1, the door into box 2, a call and its answer, the slide up to the twelfth fret, a bend at the top. This Step puts them in an order. The three choruses are three Exercises, so each can be learned and checked on its own, and the last Exercise runs all thirty-six bars together.",
  howTo: [
    "Chorus 1 stays on the three low strings of box 1 and leaves whole bars empty. Start with less than you think you need.",
    "Chorus 2 goes through the slide on the G string into box 2 and stays there. A busy phrase asks and a slower one answers.",
    "Chorus 3 starts in box 2, takes the slide on the top string up to the twelfth fret, climbs box 4 to a bend at fret 15, and comes down through box 2 and box 1 to the low A the solo started on.",
    "Learn them one at a time. When you play all three, let the low chorus also be the quiet one and the high chorus the loud one.",
  ],
  payoff: "Thirty-six bars that start low, build, peak and come home: a solo with a shape.",
  exercises: [
    {
      id: "chorus-low",
      title: "Chorus 1: sparse and low",
      purpose: "Twelve bars on the three low strings of box 1: four short phrases with an empty bar after each of the first three, and an ending that lands on the low A in bar 11 and holds E over the last bar.",
      howTo: [
        "Shuffle eighths, quarter notes and half notes, 60 BPM up to a pass at 80.",
        "Bar 1: the low A for a beat, C and D, and E held (A string, fret 7). Bar 3 starts the same way and ends on G (D string, fret 5). Bars 2, 4 and 6 are empty.",
        "Bar 5, over D7: A for a beat, C and E, and D held (A string, fret 5). Bar 7 comes back down: E for a beat, D and C, and the low A held.",
        "Bar 8 is empty until beat 4, where C and D lead to E held over the E7 in bar 9. In bar 9, G and E on beat 4 lead to D, held in bar 10. Bar 11: A, C, D, C and the low A held. Bar 12: E held.",
        "Rest where it rests, and listen to the band in the empty bars. A note played there counts as an extra note.",
      ],
      coach: "Few notes, so each one is on show. Notes and the shuffle after the take.",
      tab: swing(CHORUS_LOW),
      position: 5,
      chords: TWELVE,
      jam: TEXAS,
      harmony: { scaleOverChords: ["A", "minorPentatonic"] },
      rungs: ladder(60, 100, 5),
      passAt: 80,
      ...lick("shuffle", 12),
      minutes: 6,
    },
    {
      id: "chorus-answers",
      title: "Chorus 2: up a box, call and answer",
      purpose: "Twelve bars that slide into box 2 in bar 1 and stay there. A busy call ends on C. A slower answer ends on A, or on D when the band is on D7.",
      howTo: [
        "Shuffle eighths, quarter notes and half notes, 60 BPM up to a pass at 80.",
        "Bar 1 is the door: A on the D string, C, then D slid to E on the G string (frets 7 to 9), and G held on the B string (fret 8). Bar 2 answers: E and G as quarter notes, and A held (B string, fret 10).",
        "The call, in bars 3, 5 and 7: A, G, A, G on the B string (frets 10 and 8) and C held on the top string (fret 8). The answer in bars 4 and 8 is bar 2 again. In bar 6, over D7, it is A, G, and D held (G string, fret 7).",
        "Bar 9, over E7: E, G, E, D and E held (G string, fret 9). Bar 10, over D7: D, E, G, E and D held. Bar 11: A, C, A, G and the A on the D string, fret 7, held. Bar 12: E held.",
      ],
      coach: "The slid-to E can come out quiet, and the bar allows for it. Notes and the shuffle after the take.",
      tab: swing(CHORUS_ANSWERS),
      position: 5,
      shifts: true,
      chords: TWELVE,
      jam: TEXAS,
      harmony: { scaleOverChords: ["A", "minorPentatonic"] },
      rungs: ladder(60, 100, 5),
      passAt: 80,
      ...lick("shuffle", 12),
      minutes: 6,
    },
    {
      id: "chorus-peak",
      title: "Chorus 3: the peak, and home",
      purpose: "Twelve bars that climb from box 2 to box 4, bend the G at fret 15 up to A twice, and come back down to the low A the solo began on.",
      howTo: [
        "Shuffle eighths, quarter notes and half notes, 60 BPM up to a pass at 80.",
        "Bar 1 is the slide you know: G and A on the B string (frets 8 and 10), C on the top string, D slid to E (frets 10 to 12) with the third finger, C on the B string (fret 13), and E. Bar 2: E, D, C, D, and A held (B string, fret 10).",
        "Bars 3 and 4 climb box 4: G and A on the G string (frets 12 and 14), C and D on the B string (13 and 15), and E held; then A, C, D, E, and G held at fret 15 on the top string. Take that G with the third finger, letting the hand move up a fret, so it is ready to bend.",
        "Bar 5, over D7: bend that G up a whole step to A and hold it with vibrato for two beats, rest for a beat, then G and E. Bar 6: D, C, A, C, and D held. Bar 7 is the same bend and rest, then E and D. Bar 8 comes down: A, C, A, G, and E held (D string, fret 14).",
        "Bar 9 drops to box 2: E, G, A, G, and E held (G string, fret 9). Bar 10 is box 1: D, C, A, C, and A held. Bar 11: G, A, C, A, and the low A held. Bar 12 is empty: the solo is over, and the band plays the last bar alone.",
      ],
      coach: "Timed and counted. With bends in the line the notes are not pitch-checked, so both bends are for your ear.",
      tab: swing(CHORUS_PEAK),
      position: 8,
      shifts: true,
      chords: TWELVE,
      jam: TEXAS,
      harmony: { scaleOverChords: ["A", "minorPentatonic"] },
      rungs: ladder(60, 100, 5),
      passAt: 80,
      ...timedOnly("shuffle", 12),
      selfCheck: ["On a recording, do both bends reach A and stay there?"],
      minutes: 7,
    },
    {
      id: "your-three-choruses",
      title: "Your turn: three choruses with a shape",
      purpose: "Thirty-six bars of your own, three times round the form. Decide before you start where it is low and sparse, where it builds, and where the highest note comes.",
      howTo: [
        "Shuffle, 70 to 85 BPM, three choruses of twelve bars: about two minutes.",
        "The written line is the three choruses of this Step end to end, as an example. Use any of it, or none.",
        "A plan to start from: chorus 1 in the low half of box 1 with empty bars, chorus 2 in box 2 with a phrase and its answer, chorus 3 up at the twelfth fret, coming home in its last four bars.",
        NOT_CHECKED_YET,
      ],
      coach: "Not checked yet. Record it, and listen for where the highest note falls.",
      tab: swing([CHORUS_LOW, CHORUS_ANSWERS, CHORUS_PEAK].join(" | ")),
      position: 5,
      shifts: true,
      chords: [TWELVE, TWELVE, TWELVE].join(" | "),
      jam: TEXAS,
      rungs: ladder(70, 85, 5),
      ...YOUR_TURN,
      selfCheck: [
        "Did you get through all 36 bars without losing the form?",
        "Was your first chorus the sparsest and your last the highest?",
        "Did the solo come home to an A at the end?",
      ],
      minutes: 8,
    },
  ],
};

/** Advanced, last: the slow blues in a second key. */
export const SLOW_IN_C: StepSpec = {
  id: "slow-blues-in-c",
  title: "Slow blues in C",
  goal: "Play the slow twelve bars in C at the eighth fret: the chorus you know, a chorus of long bends, and one of your own.",
  why: "You have played one slow blues, in A. The same form in C puts the box at the eighth fret, where the frets are closer together, and gives the three chords new names: C7, F7 and G7. Nothing else is new, and that is the point. The long notes, the bends and the empty bars have to work without the comfort of the key you learned them in.",
  howTo: [
    "Box 1 in C has its first finger on fret 8. The C's are at fret 8 on the low E string, fret 10 on the D string and fret 8 on the high E string.",
    "The form is the same: four bars of C7, two of F7, two of C7, then G7, F7, C7, G7.",
    "The thirds sit one fret above a note of the box, as before: E over C7 (G string, fret 9) and B over G7 (D string, fret 9).",
    "The app times a bend and does not measure how far it goes. In a new key the ear has to find each target again, so play the note you are bending to before a take.",
  ],
  payoff: "A slow chorus in a key you did not learn it in, with bends that still arrive.",
  difficultyException:
    "The same slow tempo and the same kind of lines as the Step before, so the note rate does not rise. The new demand is finding the form, the landings and the bends in a second key, which the rate does not count.",
  exercises: [
    {
      id: "c-chorus",
      title: "The slow chorus, in C",
      purpose: "The written slow chorus from the last Step, three frets higher. The same phrases, unison bends and rests, over C7, F7 and G7.",
      howTo: [
        "Slow 12/8 feel: half notes, quarter notes and triplet eighths, 50 BPM up to a pass at 58.",
        "Rest where it rests, and hold notes for their full length. The unison bends are G string fret 10 up to the B string's G at fret 8, and B string fret 11 up to the high E string's C at fret 8.",
        "Bars 11 and 12 are the chromatic turnaround on the G string, frets 12 down to 9, then G on the B string (fret 8) and B on the D string (fret 9).",
      ],
      coach: "Slow and written, over the band in C. The single notes and their time are checked after the take; the bends and vibrato are your ear's.",
      tab: shiftFrets(SLOW_CHORUS, 3),
      position: 8,
      shifts: true,
      chords: TWELVE_C,
      jam: SLOW_C,
      harmony: { scaleOverChords: ["C", "blues"], allowed: ["E", "B"] },
      rungs: ladder(50, 72, 4),
      passAt: 58,
      ...lick("slow", 12),
      selfCheck: ["On a recording, do the bends reach their notes?", "Do the rests feel deliberate?"],
      minutes: 7,
    },
    {
      id: "c-long-bends",
      title: "Long bends, and room",
      purpose: "A second slow chorus in C, made of one-string bends that land on a note of each chord, each with a rest after it. Seven bends, three long plain notes and an empty bar.",
      howTo: [
        "Slow 12/8 feel: half notes and triplet eighths, 50 BPM up to a pass at 58.",
        "The whole-step bends: F up to G on the G string (fret 10), B flat up to C on the B string (fret 11), and E flat up to F on the top string (fret 11). The half-step bend in bar 11 is E flat up to E on the top string, the third of C7.",
        "Bars 1 and 2 bend to G and then to C. Bar 3 is empty, and bar 4 has only the three notes that lead into the F7. Over F7, bar 5 bends to F and bar 6 holds F on the G string (fret 10).",
        "Bar 7 bends to G and bar 8 holds C (D string, fret 10). Bar 9 bends to G over the G7 and bar 10 bends to C over the F7. Bar 11 is the half-step bend to E, and bar 12 holds B (D string, fret 9) over the G7.",
        "Bend with the ring finger, the fingers behind it pushing too, and reach the top before beat 2. In the rests, listen to the band.",
      ],
      coach: "Timed and counted. How far each bend travels is not measured, so record it and listen.",
      tab: shiftFrets(LONG_BENDS, 3),
      position: 8,
      shifts: true,
      chords: TWELVE_C,
      jam: SLOW_C,
      harmony: { scaleOverChords: ["C", "blues"], allowed: ["E", "B"] },
      rungs: ladder(50, 72, 4),
      passAt: 58,
      ...timedOnly("slow", 12),
      selfCheck: ["On a recording, does each bend reach its note and stay there?", "Did you leave bar 3 empty?"],
      minutes: 7,
    },
    {
      id: "your-c-chorus",
      title: "Your turn: a slow chorus in C",
      purpose: "Your notes over the slow form in C. Land on a note of the chord at each change, bend up to at least one of them, and leave a bar empty. The written chorus is an example.",
      howTo: [
        "Slow 12/8 feel, 50 to 60 BPM.",
        "Targets inside the box at the eighth fret: C, G or B flat over C7; F, C or E flat over F7; G or F over G7. The thirds, E over C7 and B over G7, sit one fret above a note of the box. F7's third, A, is on the D string at fret 7, a fret below the box: the first finger reaches back for it.",
        NOT_CHECKED_YET,
      ],
      coach: "Not checked yet. Record it, and listen to the note you are holding as each chord arrives.",
      tab: shiftFrets(SLOW_CHORUS, 3),
      position: 8,
      shifts: true,
      chords: TWELVE_C,
      jam: SLOW_C,
      rungs: ladder(50, 60, 5),
      ...YOUR_TURN,
      selfCheck: [
        "At each change, did you land on a note of the new chord?",
        "On a recording, does at least one bend reach its note?",
        "Did you leave at least one bar empty?",
      ],
      minutes: 6,
    },
  ],
};
