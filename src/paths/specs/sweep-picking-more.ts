/**
 * Sweep Picking: consolidation Steps for the Advanced Level (2026-11-19).
 * Drafts, like the Path they belong to.
 *
 * Advanced met six strings, wide shifts and the neoclassical moves once each
 * and ended on band loops and a free solo. These two Steps give the Level
 * time and a composed piece, and add no new shape:
 *
 * - `six-string-changes`, after `six-strings`: the minor and the major
 *   six-string shape through chord changes, with the rest the Step before
 *   uses to reset the hand, and a six-string shape joined to a five-string
 *   and a three-string one;
 * - `advanced-etude`, before `over-a-heavy-band`: eight bars in E minor,
 *   written for this Path, learned as two halves, then joined, then with a
 *   band, as `over-the-progression` does for Intermediate.
 *
 * Every id is new, so nobody's progress moves. Every line is original.
 *
 * The helpers are copies of the Path file's (`sweepExercise` and the check
 * questions): importing them from it would be a circular import.
 */
import type { ExerciseSpec, StepSpec } from "../spec";
import { ladder, moveChart, repeat, shiftFrets } from "../templates";

const ROLL_CHECK =
  "Record a take and listen back. Does each note stop as the next one starts, or do they ring together like a strummed chord?";
const NOISE_CHECK = "Between takes, stop and listen: are the strings you are not playing silent?";

function sweepExercise(args: Omit<ExerciseSpec, "pick" | "grade"> & { grade?: ExerciseSpec["grade"] }): ExerciseSpec {
  return {
    pick: "sweep",
    // Timing only, as everywhere on this Path: swept strings ring into each
    // other, and a pitch read there can fail a take that was played right.
    grade: "sweepTiming",
    selfCheck: [ROLL_CHECK],
    ...args,
  };
}

// ---------------------------------------------------------------------------
// The two six-string shapes of `six-strings`, written once and moved by fret.
// ---------------------------------------------------------------------------

/**
 * The minor shape from the index on the low E (A minor at fret 5), with its
 * hammers: fourteen notes. Fingered as `minor-six` is: an index barre, the
 * ring finger rolling across the A and D strings, the little finger on both
 * hammers. The fingers are printed because the rules, reading on into the
 * next bar's shape, give the last note to the index and the top hammer to the
 * ring finger in a long line.
 */
const MINOR_SIX =
  "6:5f1 6:8f4h 5:7f3 4:7f3 3:5f1 2:5f1 1:5f1 1:8f4h 1:5f1p 2:5f1 3:5f1 4:7f3 5:7f3 6:8f4";
/** The same shape with no hammer on the low E: twelve notes, a bar of triplets. */
const MINOR_SIX_TWELVE = "6:5f1 5:7f3 4:7f3 3:5f1 2:5f1 1:5f1 1:8f4h 1:5f1p 2:5f1 3:5f1 4:7f3 5:7f3";
/**
 * The major shape from the little finger on the low E (G major at fret 15):
 * twelve notes. Six frets wide, so the hand moves inside it, and the fingers
 * are printed so that it is fingered the same both ways: little finger, ring
 * finger, the index rolling across the D and G strings, the middle finger on
 * the B string and the index two frets lower on the top string. The rules
 * alone roll the middle finger across three strings on the way back and leave
 * the little finger to hop from the A string to the low E.
 */
const MAJOR_SIX_TWELVE =
  "6:15f4 5:14f3 4:12f1 3:12f1 2:12f2 1:10f1 1:15f4h 1:10f1p 2:12f2 3:12f1 4:12f1 5:14f3";
/** The major shape brought back to its root: thirteen notes. */
const MAJOR_SIX = `${MAJOR_SIX_TWELVE} 6:15f4`;

/** A bar of sixteenths: the minor shape `up` frets above A minor, and a two-note rest. */
const minorBar = (up: number) => `/16 ${shiftFrets(MINOR_SIX, up)} r r`;
/** A bar of sixteenths: the major shape `up` frets above G, and three sixteenths of rest. */
const majorBar = (up: number) => `/16 ${shiftFrets(MAJOR_SIX, up)} r r r`;

// E minor into G, its relative major, around fret 12.
const PAIR = `${minorBar(7)} | ${majorBar(0)}`;
// C minor, Ab, F minor, G: one, six, four, five in C minor. A fret lower it is B minor, nothing above fret 15.
const FOUR_CHORDS = `${minorBar(3)} | ${majorBar(1)} | ${minorBar(8)} | ${majorBar(0)}`;
// A minor on six strings, F on five, A minor again, E major on three.
const BIG_SMALL = [
  `/8t ${MINOR_SIX_TWELVE}`,
  `/8t 5:8f4 4:7f3 3:5f1 2:6f2 1:5f1 1:8f4h 1:5f1p 2:6f2 3:5f1 4:7f3 r r`,
  `/8t ${MINOR_SIX_TWELVE}`,
  `/8t 3:4f1 2:5f2 1:4f1 1:7f4h 1:4f1p 2:5f2 3:4f1 2:5f2 1:4f1 r r r`,
].join(" | ");

// ---------------------------------------------------------------------------
// The Advanced etude: eight bars in E minor, all triplets, written for this Path.
// Every finger is printed, so the piece is fingered the same in its halves, joined
// and with the band (the rules read on into the next bar, and chose differently
// for the same bar in a four-bar and an eight-bar line).
// ---------------------------------------------------------------------------

const ETUDE_ONE = [
  // E minor on six strings.
  `/8t ${shiftFrets(MINOR_SIX_TWELVE, 7)}`,
  // C on five strings, a fret above the note the bar before ended on.
  `/8t 5:15f4 4:14f3 3:12f1 2:13f2 1:12f1 1:15f4h 1:12f1p 2:13f2 3:12f1 4:14f3 r r`,
  // G on six strings.
  `/8t ${MAJOR_SIX_TWELVE}`,
  // D# diminished 7 on three strings, then the same shape three frets higher. Fingered 4 3 1 4, as the
  // rules finger it in `neoclassical`: the ring finger has just played the note before each loop (the A
  // string at 14, then the B string at 13), and ring, middle, index would also put the middle finger on
  // the last note of this bar and the first of bar 5.
  `/8t 3:14f4 2:13f3 1:11f1 1:14f4h 1:11f1p 2:13f3 3:17f4 2:16f3 1:14f1 1:17f4h 1:14f1p 2:16f3`,
].join(" | ");
const ETUDE_TWO = [
  // E minor high on the neck: the diminished shape resolves into it.
  `/8t ${repeat("3:16f2 2:17f3 1:15f1 1:19f4h 1:15f1p 2:17f3", 2)}`,
  // A minor, three frets lower.
  `/8t ${repeat("3:14f3 2:13f2 1:12f1 1:17f4h 1:12f1p 2:13f2", 2)}`,
  // B major: a loop, then on across the D string to its root on the A string, and a beat of silence.
  `/8t 3:11f1 2:12f2 1:11f1 1:14f4h 1:11f1p 2:12f2 3:11f1 4:13f3 5:14f4 r r r`,
  // E minor up all six strings, to a held E.
  `/8t 6:12f1 6:15f4h 5:14f3 4:14f3 3:12f1 2:12f1 /2 1:12f1v`,
].join(" | ");
const ETUDE_ONE_CHORDS = "Em | C | G | D#dim7";
const ETUDE_TWO_CHORDS = "Em | Am | B | Em";
// The joined piece is judged over all eight bars, so the join of the halves is always in the timed
// stretch. The extra-notes ceiling is the profile's rate: 3 in four bars is 6 in eight.
const EIGHT_BARS = [
  { metric: "timingEvenness", min: 0.8, overBars: 8 },
  { metric: "notesHeard", min: 0.85, overBars: 8 },
  { metric: "extraNotes", max: 6, overBars: 8 },
];
const HELD_CHECK = "Did the held E in the last bar ring for its full two beats?";

export const SIX_STRING_CHANGES: StepSpec = {
  id: "six-string-changes",
  title: "Six strings through the changes",
  goal: "Change chord with the six-string shapes: a minor shape into its major, four chords in a minor key, and a six-string shape joined to a five-string and a three-string one.",
  why: "The last Step gave you two six-string shapes, each looped on one chord, and single passes linked through a progression. Looping a whole shape on each chord of a progression is harder: a shape this wide is slow to leave, with six strings to quiet and a new place to find before the next bar. This Step adds no new shape. It takes the minor and the major shape through changes, slowly, so the move between them gets the practice the shapes have already had.",
  howTo: [
    "Each bar is one chord. In the sixteenth-note lines every bar ends with a rest: stop every string in it, then move the hand.",
    "The pass tempos are slow on purpose. These shapes are wide, and the change has to be clean before it is fast.",
    "The minor shape: index and little finger on the low E, the ring finger rolling across the A and D strings, the index rolling across the G, B and top strings, and the little finger for the top hammer.",
    "The major shape is fingered the same both ways: little finger on the low E, ring finger on the A string, the index rolling across the D and G strings, the middle finger on the B string, and the index again two frets lower on the top string.",
    "Grading is timing only, as on the rest of the Path: how even the notes are, whether each one arrived, and whether extra notes rang. The fast rungs are not graded at all: there it is your ear and a recording.",
  ],
  payoff: "Six-string arpeggios that follow a chord progression, and a line where a big shape hands over to a small one without a stop.",
  difficultyException:
    "The two six-string shapes of the Step before, with a five-string and a three-string shape in the last Exercise, at the same or slower pass tempos and with a rest in most bars, so the note rate is lower. The demand is the change between shapes, which the rate does not count.",
  exercises: [
    sweepExercise({
      id: "minor-into-major",
      title: "Minor, then its relative major",
      purpose: "The minor shape and the major shape from the last Step, one bar each, as one line. G major is the relative major of E minor: the major chord three frets above it. They share two of their three notes, G and B, so the two shapes sit around the same frets and only the change is new.",
      howTo: [
        "Sixteenths. Bar 1 is E minor, from fret 12 on the low E string: fourteen notes and two sixteenths of rest, with a hammer on the low E string and on the top string.",
        "Bar 2 is G major: thirteen notes and three sixteenths of rest. It starts at fret 15 on the low E string, the note the E minor bar stopped on, and it comes back to that note.",
        "In the G major bar the top string is played at fret 10 and hammered to fret 15. The index moves down two frets for it, and two frets back up for the G and D strings on the return.",
        "Use each rest to stop all six strings before the next bar starts.",
      ],
      coach: "Timing only: how even the notes are, whether each one arrived, and whether an extra one rang. The silence in the rests is yours to check.",
      vary: {
        values: { key: ["E", "F#"] },
        pooled: ["key"],
        label: (p) => `${p.key} minor and its relative major`,
        build: (p) => {
          const up = p.key === "E" ? 0 : 2;
          return { tab: shiftFrets(PAIR, up), position: 12 + up, shifts: true, chords: moveChart("Em | G", up) };
        },
      },
      harmony: { chordTones: true, cover: true },
      rungs: ladder(60, 120, 5),
      passAt: 80,
      selfCheck: [ROLL_CHECK, NOISE_CHECK],
      minutes: 7,
    }),
    sweepExercise({
      id: "four-chords-six",
      title: "Four chords on six strings",
      purpose: "A four-chord progression in C minor with a whole six-string shape on each chord: C minor, Ab, F minor and G. The last chord is the major five chord you met in the Step \"Minor keys and the major five chord\": the one that pulls the line back to the first.",
      howTo: [
        "Sixteenths, one chord a bar. The two minor bars are fourteen notes and two sixteenths of rest. The two major bars are thirteen notes and three sixteenths of rest.",
        "C minor starts on the low E at fret 8. Ab starts on the low E at fret 16, with the little finger. That is the longest move in the line and the rest before it is the short one, so leave the first chord early rather than land late.",
        "F minor starts on the low E at fret 13 and hammers to fret 16, the note the Ab bar ended on, so the hand is already there.",
        "For G the little finger moves down one fret, to fret 15 on the low E. After that last bar the hand drops back to fret 8.",
      ],
      coach: "Four wide shapes in a row is a lot of string to keep quiet. The notes are timed and counted; the ringing between bars is for your ear.",
      vary: {
        values: { key: ["C", "B"] },
        pooled: ["key"],
        label: (p) => `${p.key} minor`,
        build: (p) => {
          const up = p.key === "C" ? 0 : -1;
          return { tab: shiftFrets(FOUR_CHORDS, up), position: 8 + up, shifts: true, chords: moveChart("Cm | Ab | Fm | G", up) };
        },
      },
      harmony: { chordTones: true, cover: true },
      rungs: ladder(60, 120, 5),
      passAt: 75,
      selfCheck: [ROLL_CHECK, NOISE_CHECK],
      minutes: 8,
    }),
    sweepExercise({
      id: "big-meets-small",
      title: "A big shape into a small one",
      purpose: "The six-string A minor shape handing over to F major on five strings, and then to E major on three. The big shape and the small one meet with no rest between them.",
      howTo: [
        "Triplets. A minor is the six-string shape from fret 5 with no hammer on the low E: twelve notes, up to the hammer on the top string and back to the A string.",
        "Bar 2 is F major on five strings. It starts on the A string at fret 8, one fret above the note the A minor bar ended on, and it ends with a two-note rest. The pick turns on the A string: up for the last note of the A minor bar, down for the first note of the F major bar.",
        "Bar 4 is E major on three strings, from fret 4 on the G string: one loop, then the three strings once more, and a beat of rest. It stops on G# at fret 4 on the top string, the note that pulls back to A.",
        "The pick skips the D string going from A minor into E major, and the hand moves down one fret as it does.",
      ],
      coach: "Every note is a triplet. If a take comes back uneven, look first at the two joins with no rest, bar 1 into 2 and bar 3 into 4. Timing and notes heard are what is reported.",
      vary: {
        values: { key: ["A", "B", "D"] },
        pooled: ["key"],
        label: (p) => `${p.key} minor`,
        build: (p) => {
          const up = { A: 0, B: 2, D: 5 }[p.key] ?? 0;
          return { tab: shiftFrets(BIG_SMALL, up), position: 5 + up, shifts: true, chords: moveChart("Am | F | Am | E", up) };
        },
      },
      harmony: { chordTones: true, cover: true },
      rungs: ladder(60, 140, 5),
      passAt: 90,
      selfCheck: [ROLL_CHECK, NOISE_CHECK],
      minutes: 8,
    }),
  ],
};

export const ADVANCED_ETUDE: StepSpec = {
  id: "advanced-etude",
  title: "The Advanced etude",
  goal: "Play an eight-bar piece in E minor that puts the Level's moves together: six-string shapes, a diminished shape climbing the neck, a shift between positions and the major five chord pulling home, in two halves and then with a band.",
  why: "The Level has given you its moves one at a time: six strings, shifts, the diminished shape, the major five chord. A piece asks for them in a row with no time to set up, and that is a different skill from playing each one well. So it comes in halves: four bars until they hold, the next four, then the join, then the band.",
  howTo: [
    "The piece is eight bars of triplets in E minor: E minor, C, G and D# diminished 7, then E minor, A minor, B and E minor.",
    "Parts one and two are against a click. Bring each to its pass tempo before joining them.",
    "With the band, use direct input or headphones for a graded take: a microphone hears the band as well, and that has not been tested.",
    "Grading is timing only: how even the notes are, whether each one arrived, and whether extra notes rang. Nothing here checks which notes you played or how clean the mute is, so record a take and listen.",
  ],
  payoff: "An eight-bar sweep solo over a band, with six-string shapes, a diminished climb and a major five chord in it, played from start to finish.",
  difficultyException:
    "A composed piece with rests and a held last note: the note rate is lower than the sequences before it. Playing eight bars of big and small shapes in a row, in time and then with a band, is the demand, and the rate does not count it.",
  exercises: [
    sweepExercise({
      id: "part-one",
      title: "The etude, part one",
      purpose: "The first four bars of the etude: E minor on six strings, C on five, G on six, then a diminished shape that climbs three frets and leaves the line waiting for an answer.",
      howTo: [
        "Triplets. Bar 1 is the six-string E minor shape from fret 12 with no hammer on the low E: twelve notes.",
        "Bar 2 is C major on five strings, from fret 15 on the A string, one fret above the note bar 1 ended on. It ends with a two-note rest.",
        "Bar 3 is the six-string G major shape, from the little finger at fret 15 on the low E, up to the top-string hammer and back to the A string: twelve notes, no rest.",
        "Bar 4 is D# diminished 7 on three strings: one loop from fret 14 on the G string, then the same shape three frets higher, from fret 17. Little finger on the G string, ring on the B string, index on the top string, and the little finger again for the hammer. The pick skips the D string to get there from bar 3, and the index drops from fret 12 to fret 11.",
        "When it loops, the diminished bar pulls back to the E minor of bar 1. That jump back to the low E is not in the piece, so do not let it hold you at a rung.",
      ],
      coach: "Big shapes and small ones in one line. The notes are timed and counted; whether the changes sound like one line is for you and a recording.",
      tab: ETUDE_ONE,
      position: 12,
      shifts: true,
      chords: ETUDE_ONE_CHORDS,
      harmony: { chordTones: true, cover: true },
      rungs: ladder(60, 130, 5),
      passAt: 90,
      selfCheck: [ROLL_CHECK, NOISE_CHECK],
      minutes: 7,
    }),
    sweepExercise({
      id: "part-two",
      title: "The etude, part two",
      purpose: "The last four bars of the etude, bars 5 to 8, as the answer: E minor high on the neck, A minor below it, B major pulling home, and one sweep up all six strings to a held E.",
      howTo: [
        "Triplets. Bar 1 here, bar 5 of the piece, is E minor on three strings, two loops: fret 16 on the G string, 17 on the B string, 15 on the top string, and a hammer to fret 19.",
        "Bar 2 is A minor, two loops: fret 14 on the G string, 13 on the B string, 12 on the top string, and a hammer to fret 17. The index moves down three frets to get there.",
        "Bar 3 is B major: one loop from fret 11 on the G string, then the upstroke carries on through the G string again, the D string at fret 13 and the A string at fret 14. A beat of rest follows. B major has a D# in it, at fret 11 on the top string, one fret below the E that the last bar holds: that half step is the pull home.",
        "Bar 4 is the six-string E minor shape with its hammer on the low E, swept once from fret 12 to the top string. The E there, at fret 12, is held for two beats with vibrato.",
      ],
      coach: "The beat of silence in bar 3 here (bar 7 of the piece) is part of the music: stop the strings in it. Timing and notes heard are reported, and the held E is yours to judge.",
      tab: ETUDE_TWO,
      position: 15,
      shifts: true,
      chords: ETUDE_TWO_CHORDS,
      harmony: { chordTones: true, cover: true },
      rungs: ladder(60, 130, 5),
      passAt: 90,
      selfCheck: [ROLL_CHECK, HELD_CHECK],
      minutes: 7,
    }),
    sweepExercise({
      id: "both-parts",
      title: "The etude, both parts",
      purpose: "All eight bars against a click. The only new thing is the join: the diminished shape in bar 4 ends at fret 16 on the B string, and bar 5 starts at fret 16 on the G string.",
      howTo: [
        "Triplets, eight bars: part one, then part two with no gap.",
        "Play bars 4 and 5 alone a few times first. The hand moves up one fret between them: the index goes from fret 14 to fret 15 on the top string. The last note of bar 4 is D# at fret 16 on the B string, and E is one fret above it in bar 5: that half step is the pull.",
        "The piece ends on a held E on the top string and goes round to the low E of bar 1, both at fret 12.",
      ],
      coach: "If a bar goes wrong, leave it and catch the next bar line. Timing and missed notes are what is reported.",
      tab: `${ETUDE_ONE} | ${ETUDE_TWO}`,
      position: 12,
      shifts: true,
      chords: `${ETUDE_ONE_CHORDS} | ${ETUDE_TWO_CHORDS}`,
      harmony: { chordTones: true, cover: true },
      rungs: ladder(60, 130, 5),
      passAt: 85,
      pass: EIGHT_BARS,
      selfCheck: [ROLL_CHECK, HELD_CHECK],
      minutes: 8,
    }),
    sweepExercise({
      id: "with-the-band",
      title: "The Advanced etude",
      purpose: "The whole etude over a triplet-feel band in E minor. Eight bars written for this Path, with the Level's moves in them: six-string shapes, a diminished climb, a shift down the neck and the major five chord pulling home.",
      howTo: [
        "Triplets over the band, the same eight bars. Start at a rung where you can look up from the guitar.",
        "Lock the first note of each bar to the band. If a shape is late, drop it and catch the next bar line.",
        "Use direct input or headphones for a graded take. Whatever the numbers say, record a take with the band turned down and listen.",
      ],
      coach: "Graded on timing, on direct input or headphones. Notes heard and extra notes are counted; whether it sounds like a solo is for you and a recording.",
      tab: `${ETUDE_ONE} | ${ETUDE_TWO}`,
      position: 12,
      shifts: true,
      chords: `${ETUDE_ONE_CHORDS} | ${ETUDE_TWO_CHORDS}`,
      jam: { groove: "rockTwelveEight", key: "E minor" },
      harmony: { chordTones: true, cover: true },
      rungs: ladder(60, 130, 5),
      passAt: 85,
      pass: EIGHT_BARS,
      selfCheck: [ROLL_CHECK, HELD_CHECK],
      minutes: 8,
    }),
  ],
};
