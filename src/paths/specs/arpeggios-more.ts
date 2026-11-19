/**
 * Arpeggios over Changes: consolidation Steps (2026-11-19). Drafts, like the
 * Path they belong to.
 *
 * The first version was about five weeks of an intended eight
 * (`plans/paths/NEW_PATHS.md`, "How long each Path is"). These Steps give the
 * two-octave shapes to more chords, take the seventh arpeggios across the
 * neck, play two, five, one in a minor key, and sweep the two triad shapes the
 * song at the end needs before it asks for them. Speed stays out of it: that
 * is Sweep Picking's subject. Every id is new, so nobody's progress moves.
 */
import type { ExerciseSpec, StepSpec } from "../spec";
import { ladder, shiftFrets } from "../templates";
import { ROCK, inKeys, named, tokens, top } from "./triadShapes";
import type { Shape } from "./triadShapes";

const YOUR_TURN = { grade: "selfChecked", example: true } as const;
const NOT_CHECKED_YET =
  "Your turn, and not checked yet: the app can't judge notes you choose, so you tick it off yourself.";
const VARIANT_NOTE =
  "The frets and chord names here are for the first version. On other days the same line comes in another key, higher or lower on the neck.";

const TWELVE_EIGHT = (key: string) => ({ groove: "rockTwelveEight", key });

// --- Two octaves, on other chords ------------------------------------------------
// The two shapes of the Step before, moved: minor from fret 5 on the low E
// string, major from fret 8.

const AM_TWO = `/8 6:5f1 6:8f4 5:7f3 4:7f3 3:5f1 2:5f1 1:5f1 2:5f1 | 3:5f1 4:7f3 5:7f3 6:8f4 /2 6:5f1`;
const C_TWO = `/8 6:8f2 5:7f1 5:10f4 4:10f4 3:9f2 2:8f1 1:8f1 2:8f1 | 3:9f2 4:10f4 5:10f4 5:7f1 /2 6:8f2`;
const G_TWO = shiftFrets(C_TWO, -5);
const D_TWO = shiftFrets(C_TWO, 2);
const DM_TWO = shiftFrets(AM_TWO, 5);
const EM_TWO = shiftFrets(AM_TWO, 7);

/** Intermediate, after the two-octave shapes: the same shapes on other chords. */
export const TWO_OCTAVES_MORE: StepSpec = {
  id: "two-octaves-more",
  title: "Two octaves on other chords",
  goal: "Move the two-octave major shape to G and D and the minor shape to D minor and E minor, and play one, four and five of a key across all six strings.",
  why: "You learned one major shape on C and one minor shape on A minor. They are not C and A minor shapes: put the first note on another fret of the low E string and you have another chord, exactly as with barre chords. Moving them is what makes them useful, because a song has more than one chord and each one needs its arpeggio where the hand can reach it.",
  howTo: [
    "The major shape starts with the second finger on the root, on the low E string. C is at fret 8, so G is at fret 3 and D is at fret 10.",
    "The minor shape starts with the first finger on the root. A minor is at fret 5, so D minor is at fret 10 and E minor at fret 12.",
    "Say the root before you move. The hand goes where the root is, and the rest of the shape comes with it.",
  ],
  payoff: "A two-octave arpeggio for any major or minor chord, from one shape each.",
  exercises: [
    {
      id: "g-major-two",
      title: "G major, two octaves",
      purpose: "G, B, D twice over from fret 3 on the low E string, and back down. The C major shape, five frets lower.",
      howTo: [
        "Straight eighths, 50 BPM up to a pass at 80. Two bars.",
        "Up: low E string 3, A string 2 and 5, D string 5, G string 4, B string 3, top string 3. Down: B string 3, G string 4, D string 5, A string 5 and 2, and the low G held.",
        "The frets are wider down here than at fret 8. Let the hand move a little instead of straining to hold every finger over its fret.",
      ],
      coach: "Right notes and even eighths after the take.",
      tab: G_TWO,
      position: 2,
      shifts: true,
      harmony: { arpeggio: "G", cover: true },
      rungs: ladder(50, 110, 10),
      passAt: 80,
      ...named(),
      minutes: 5,
    },
    {
      id: "d-minor-two",
      title: "D minor, two octaves",
      purpose: "D, F, A twice over from fret 10 on the low E string, and back down to the low D. The A minor shape, five frets higher.",
      howTo: [
        "Straight eighths, 50 BPM up to a pass at 80. Two bars.",
        "Up: low E string 10 and 13, A string 12, D string 12, then fret 10 on the G, B and top strings. Down: B string 10, G string 10, D string 12, A string 12, low E string 13, and fret 10 held.",
      ],
      coach: "Right notes and even eighths after the take.",
      tab: DM_TWO,
      position: 10,
      harmony: { arpeggio: "Dm", cover: true },
      rungs: ladder(50, 110, 10),
      passAt: 80,
      ...named(),
      minutes: 5,
    },
    {
      id: "one-four-five-across",
      title: "G, C and D across the neck",
      purpose: "One, four and five of the key of G, two bars each and two more of G: the same two-octave shape from fret 3, fret 8, fret 10 and fret 3 again, with the band.",
      howTo: [
        "Straight eighths, 50 BPM up to a pass at 80. Eight bars.",
        "Bars 1 and 2: G from fret 3 on the low E string. Bars 3 and 4: C from fret 8. Bars 5 and 6: D from fret 10. Bars 7 and 8: G from fret 3.",
        "Each arpeggio ends on a held root. Use that note's length to move the hand to the next root.",
      ],
      coach: "Eight bars with the band. Right notes and time after the take.",
      tab: `${G_TWO} | ${C_TWO} | ${D_TWO} | ${G_TWO}`,
      position: 2,
      shifts: true,
      loops: false,
      chords: "G | G | C | C | D | D | G | G",
      jam: ROCK("G"),
      harmony: { chordTones: true },
      rungs: ladder(50, 110, 10),
      passAt: 80,
      ...named(0.75, 8),
      minutes: 7,
    },
    {
      id: "minor-across",
      title: "A minor, D minor and E minor across the neck",
      purpose: "One, four and five of the key of A minor, two bars each and two more of A minor: the minor shape from fret 5, fret 10, fret 12 and fret 5 again.",
      howTo: [
        "Straight eighths, 50 BPM up to a pass at 80. Eight bars.",
        "Bars 1 and 2: A minor from fret 5 on the low E string. Bars 3 and 4: D minor from fret 10. Bars 5 and 6: E minor from fret 12. Bars 7 and 8: A minor from fret 5.",
      ],
      coach: "Eight bars with the band. Right notes and time after the take.",
      tab: `${AM_TWO} | ${DM_TWO} | ${EM_TWO} | ${AM_TWO}`,
      position: 5,
      shifts: true,
      loops: false,
      chords: "Am | Am | Dm | Dm | Em | Em | Am | Am",
      jam: ROCK("A minor"),
      harmony: { chordTones: true },
      rungs: ladder(50, 110, 10),
      passAt: 80,
      ...named(0.75, 8),
      minutes: 7,
    },
  ],
};

// --- Sevenths across the neck ------------------------------------------------------

const AM7_TWO = `/8 6:5f1 6:8f4 5:7f3 4:5f1 4:7f3 3:5f1 2:5f1 2:8f4 | 1:5f1 2:8f4 2:5f1 3:5f1 /2 4:7f3`;
const CMAJ7_TWO = `/8 6:8f2 5:7f1 5:10f4 4:9f3 4:10f4 3:9f3 2:8f2 1:7f1 | 1:8f2 1:7f1 2:8f2 3:9f3 /2 4:10f4`;
const G7_TWO = `/8 6:3f2 5:2f1 5:5f4 4:3f2 4:5f4 3:4f3 2:3f2 1:1f1 | 1:3f3 1:1f1 2:3f2 3:4f3 /2 4:5f4`;
const TWO_FIVE_ONE_ACROSS = `/8 5:5f1 5:8f4 4:7f3 3:5f1 3:7f3 2:6f2 1:5f1 1:8f4 | 1:7f3 2:8f4 2:6f2 3:7f3 3:4f2 4:5f3 4:3f1 5:5f3 | 5:7f1 5:10f4 4:9f3 4:10f4 3:9f3 2:8f2 1:7f1 2:8f2 | /1 1:8f2`;

/** Intermediate, after the two-octave triads: the same with the seventh. */
export const SEVENTHS_ACROSS: StepSpec = {
  id: "sevenths-across",
  title: "Sevenths across the neck",
  goal: "Play A minor seven, C major seven and G seven across all six strings, and a two, five, one line that uses the whole width of the neck.",
  why: "The one-octave seventh arpeggios sit on four strings. Add the seventh to the two-octave shapes and you have them across all six, which is how they are used in a solo: a line can start low and arrive high, or the other way, and stay inside the chord the whole time. One of them you half know already. A minor seven is A, C, E and G, and those are four of the five notes of the A minor pentatonic box.",
  howTo: [
    "A minor seven from fret 5 on the low E string: the pentatonic box at fret 5 with one note, D, left out. Two notes on the low E, D and B strings, one on the A and G strings, and the A at fret 5 on the top string.",
    "C major seven from fret 8: the C major two-octave shape with a B added just under each C after the first, on the D string at fret 9 and the top string at fret 7.",
    "G seven from fret 3: the G major shape with an F added just under each G after the first, on the D string at fret 3 and the top string at fret 1.",
  ],
  payoff: "Three kinds of seventh chord across six strings, and a line that crosses the neck in both directions.",
  difficultyException:
    "Three of the four Exercises are one chord with no band and no shift, which the metric reads as easier than the eight-bar band Exercises that end the Step before. The demand is a fourth chord note in a six-string shape.",
  exercises: [
    {
      id: "a-minor-seven-two",
      title: "A minor seven, two octaves",
      purpose: "A, C, E, G twice over, from the low E string to the top string, and back down to the A on the D string. It is the pentatonic box you know, with the D left out.",
      howTo: [
        "Straight eighths, 50 BPM up to a pass at 80. Two bars.",
        "Up: low E string 5 and 8, A string 7, D string 5 and 7, G string 5, B string 5 and 8, top string 5. Down: B string 8 and 5, G string 5, and the A on the D string, fret 7, held.",
      ],
      coach: "Right notes and even eighths after the take.",
      tab: AM7_TWO,
      position: 5,
      harmony: { arpeggio: "Am7", cover: true },
      rungs: ladder(50, 110, 10),
      passAt: 80,
      ...named(),
      minutes: 5,
    },
    {
      id: "c-major-seven-two",
      title: "C major seven, two octaves",
      purpose: "C, E, G, B twice over from fret 8 on the low E string, up to the high C and back down to the C on the D string.",
      howTo: [
        "Straight eighths, 50 BPM up to a pass at 80. Two bars.",
        "Up: low E string 8, A string 7 and 10, D string 9 and 10, G string 9, B string 8, top string 7 and 8. Down: top string 7, B string 8, G string 9, and the C on the D string, fret 10, held.",
        "The hand stays with its first finger at fret 7 throughout: one finger for each fret from 7 to 10.",
      ],
      coach: "Right notes and even eighths after the take.",
      tab: CMAJ7_TWO,
      position: 7,
      harmony: { arpeggio: "Cmaj7", cover: true },
      rungs: ladder(50, 110, 10),
      passAt: 80,
      ...named(),
      minutes: 5,
    },
    {
      id: "g-seven-two",
      title: "G seven, two octaves",
      purpose: "G, B, D, F twice over from fret 3 on the low E string, up to the high G and back down to the G on the D string.",
      howTo: [
        "Straight eighths, 50 BPM up to a pass at 80. Two bars.",
        "Up: low E string 3, A string 2 and 5, D string 3 and 5, G string 4, B string 3, top string 1 and 3. Down: top string 1, B string 3, G string 4, and the G on the D string, fret 5, held.",
        "The first finger reaches back to fret 1 for the F on the top string.",
      ],
      coach: "Right notes and even eighths after the take.",
      tab: G7_TWO,
      position: 2,
      shifts: true,
      harmony: { arpeggio: "G7", cover: true },
      rungs: ladder(50, 110, 10),
      passAt: 80,
      ...named(),
      minutes: 5,
    },
    {
      id: "two-five-one-across",
      title: "Two, five, one across the neck",
      purpose: "D minor seven going up from the A string, G seven coming down from the top string, C major seven going up again, and a long C. Each chord starts one step from where the last one ended.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 80. The last bar is one long C.",
        "Bar 1, D minor seven, up: A string 5 and 8, D string 7, G string 5 and 7, B string 6, top string 5 and 8.",
        "Bar 2, G seven, down: top string 7, B string 8 and 6, G string 7 and 4, D string 5 and 3, A string 5.",
        "Bar 3, C major seven, up: the hand moves up to A string 7 and 10, D string 9 and 10, G string 9, B string 8, top string 7, and B string 8 once more. Bar 4: C on the top string, fret 8, held.",
      ],
      coach: "Band on. Right notes and time after the take.",
      tab: TWO_FIVE_ONE_ACROSS,
      position: 5,
      shifts: true,
      chords: "Dm7 | G7 | Cmaj7 | Cmaj7",
      jam: ROCK("C"),
      harmony: { chordTones: true },
      rungs: ladder(60, 110, 10),
      passAt: 80,
      ...named(),
      minutes: 7,
    },
  ],
};

// --- Two, five, one in a minor key ----------------------------------------------------

const BM7B5_BAR = `/8 4:9f4 3:7f3 2:6f2 1:5f1 2:6f2 3:7f3 4:9f4 3:7f3`;
const E7_BAR = `/8 5:7f2 4:6f1 4:9f4 3:7f2 4:9f4 4:6f1 5:7f2 4:6f1`;
const MINOR_LINE = `/8 1:7f3 1:5f1 2:6f2 3:7f3 4:9f4 3:7f3 2:6f2 1:5f1 | 1:4f2 2:5f3 2:3f1 3:4f2 4:6f4 3:4f2 2:3f1 2:5f3 | 2:5f1 3:5f1 4:7f3 4:5f1 5:7f3 4:5f1 4:7f3 3:5f1 | /1 4:7f3`;
const MINOR_CHART = "Bm7b5 | E7 | Am7 | Am7";

/** Advanced, after the joined sevenths: the same idea in a minor key. */
export const MINOR_TWO_FIVE_ONE: StepSpec = {
  id: "minor-two-five-one",
  title: "Two, five, one in a minor key",
  goal: "Play B half-diminished and E seven as arpeggios, join them into a two, five, one line that lands on A minor, and move the line to other minor keys.",
  why: "Two, five, one is the way home in a minor key as well, and it sounds darker. In A minor the two chord is built on B, and it comes out half-diminished: B, D, F, A. The five chord is E, turned from minor into a seven chord so that it pulls: E, G sharp, B, D. The G sharp is the one note here from outside the scale, and it sits a fret below A, the note it wants to reach. Playing these arpeggios is the quickest way to hear a minor key's pull.",
  howTo: [
    "B half-diminished, written Bm7b5: D string 9, G string 7, B string 6, top string 5. It is B, D, F and A.",
    "E seven: A string 7, D string 6 and 9, G string 7. It is E, G sharp, B and D.",
    "The D on the G string, fret 7, is in both chords. The F of the first chord falls one fret to E, and the A falls one fret to G sharp.",
  ],
  payoff: "The way home in a minor key, as a line, in four keys.",
  difficultyException:
    "Three chords in four bars and a held last note, against four chords and no rest in the Step before, so the metric reads it as easier. The demand is two new kinds of arpeggio and a note from outside the scale.",
  exercises: [
    {
      id: "two-and-five",
      title: "B half-diminished and E seven",
      purpose: "The two new arpeggios side by side, a bar each, twice. Both go up through four notes and back.",
      howTo: [
        "Straight eighths, 50 BPM up to a pass at 80. One bar on each chord.",
        "B half-diminished: D string 9 with the fourth finger, G string 7 with the third, B string 6 with the second, top string 5 with the first, then back down and up one more.",
        "E seven: A string 7 with the second finger, D string 6 with the first and 9 with the fourth, G string 7 with the second, then back down and up one more.",
      ],
      coach: "Band on. Right notes and time after the take.",
      tab: `${BM7B5_BAR} | ${E7_BAR} | ${BM7B5_BAR} | ${E7_BAR}`,
      position: 6,
      shifts: true,
      chords: "Bm7b5 | E7 | Bm7b5 | E7",
      jam: ROCK("A minor"),
      harmony: { chordTones: true },
      rungs: ladder(50, 110, 10),
      passAt: 80,
      ...named(),
      minutes: 6,
    },
    {
      id: "minor-line",
      title: "A minor two, five, one line",
      purpose: "B half-diminished, E seven and two bars of A minor seven as one line in eighths. At the first change the line falls one fret, A to G sharp. At the second the note stays: E belongs to both chords.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 80. The last bar is one long A.",
        "Bar 1, B half-diminished: top string 7 and 5, B string 6, G string 7, D string 9, then back up: G string 7, B string 6, top string 5.",
        "Bar 2, E seven: top string 4, B string 5 and 3, G string 4, D string 6, then back up: G string 4, B string 3 and 5.",
        "Bar 3, A minor seven: B string 5, G string 5, D string 7 and 5, A string 7, then D string 5 and 7, G string 5. Bar 4: A on the D string, fret 7, held.",
        "The hand sits at fret 5, drops to fret 3 for the E seven bar, and comes back. The E on the B string is played twice across the bar line: the third finger plays it, then the first finger takes it as the hand returns.",
      ],
      coach: "Band on. Right notes and time after the take.",
      tab: MINOR_LINE,
      position: 5,
      shifts: true,
      chords: MINOR_CHART,
      jam: ROCK("A minor"),
      harmony: { chordTones: true },
      rungs: ladder(60, 110, 10),
      passAt: 80,
      ...named(),
      minutes: 7,
    },
    {
      id: "minor-line-keys",
      title: "The minor line in a new key",
      purpose: "The four-bar line moved along the neck: five frets up it is in D minor, seven frets up in E minor, two frets down in G minor.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 80. The last bar is one long note.",
        "In D minor the chords are E half-diminished, A seven and D minor seven, and the line starts on the top string at fret 12. Everything is five frets higher than in A minor.",
        VARIANT_NOTE,
      ],
      coach: "A key that changes from day to day. Right notes and time after the take.",
      vary: inKeys(MINOR_LINE, MINOR_CHART, { "D minor": 5, "E minor": 7, "G minor": -2 }, ROCK, { kind: "line", home: "A minor" }),
      tab: shiftFrets(MINOR_LINE, 5),
      position: 10,
      shifts: true,
      chords: "Em7b5 | A7 | Dm7 | Dm7",
      jam: ROCK("D minor"),
      harmony: { chordTones: true },
      rungs: ladder(60, 110, 10),
      passAt: 80,
      ...named(),
      minutes: 7,
    },
    {
      id: "your-minor-line",
      title: "Your turn: the way home in A minor",
      purpose: "B half-diminished, E seven and A minor seven with your own line: four notes to choose from in each bar, and at each change a move of one fret or none.",
      howTo: [
        "Straight eighths or any rhythm you like, 50 to 80 BPM, four bars that loop.",
        "B half-diminished: B, D, F, A. E seven: E, G sharp, B, D. A minor seven: A, C, E, G. Try to play the G sharp just before A minor arrives. The written line is one answer.",
        NOT_CHECKED_YET,
      ],
      coach: "Not checked yet. Record it and listen for the G sharp leading to A.",
      tab: MINOR_LINE,
      position: 5,
      shifts: true,
      chords: MINOR_CHART,
      jam: ROCK("A minor"),
      rungs: ladder(50, 80, 10),
      ...YOUR_TURN,
      selfCheck: [
        "Did every note belong to the chord of its bar?",
        "Did you play G sharp in the E seven bar and land on a note of A minor after it?",
      ],
      minutes: 4,
    },
  ],
};

// --- Two more shapes to sweep ----------------------------------------------------------

const sweepBar = (shape: Shape) => {
  const [l, m, h] = tokens(shape);
  return `/8t ${l} ${m} ${h} ${h} ${m} ${l} ${l} ${m} ${h} ${h} ${m} ${l}`;
};
/** A last bar that stops on the top note, so a loop does not start on the note it ended on. */
const sweepEnd = (shape: Shape) => {
  const [l, m, h] = tokens(shape);
  return `/8t ${l} ${m} ${h} ${h} ${m} ${l} ${l} ${m} ${h} /4 ${h}`;
};
const sweeps = (...shapes: Shape[]) => shapes.map(sweepBar).join(" | ");
const ROLL_CHECK = "Did each note stop as the next one started, with no two strings ringing together?";
/** Sweeps are timed and counted, never pitch-checked: the strings ring into each other. */
const SWEPT = {
  pick: "sweep",
  grade: "sweepTiming",
  pass: [
    { metric: "notesHeard", min: 0.9, overBars: 4 },
    { metric: "timingEvenness", min: 0.75, overBars: 4 },
    { metric: "extraNotes", max: 4, overBars: 4 },
  ],
  selfCheck: [ROLL_CHECK],
} as const satisfies Partial<ExerciseSpec>;

const AM_BARRE = top(5, 5, 5);

/** Advanced, after the first sweeps: the two fingerings the song needs and the first sweeps did not use. */
export const MORE_SWEEPS: StepSpec = {
  id: "more-sweeps",
  title: "Two more shapes to sweep",
  goal: "Sweep a triad held by one finger across three strings, sweep the minor shape that has its root lowest, and sweep C, G, A minor and F around fret 5.",
  why: "The first sweeps used shapes where every note has a finger of its own, or nearly. Two more fingerings turn up as soon as you sweep a real progression. One is the triad that is a single finger laid across three strings: there the finger has to roll, pressing one string at a time, or the sweep is just a chord. The other is the minor shape with its root lowest, three fingers on three frets, which is the shape the Sweep Picking Path begins with. The first is in the song in the next Step, and the second is where Sweep Picking will start you, so both get a Step of their own first.",
  howTo: [
    "A minor at fret 5 is the first finger across the G, B and top strings. To sweep it, press with the part of the finger under the string being played and let the rest go slack: the part nearest the hand for the G string, then the middle, then the tip for the top string. The finger rocks; it does not lift.",
    "D minor with its root lowest: G string 7 with the third finger, B string 6 with the second, top string 5 with the first. Each finger lifts a little as the next string sounds.",
    "The picking hand does what it did before: one push up through the strings, one pull back, the top and bottom notes played twice.",
  ],
  payoff: "The triad fingerings of the song's first four bars, and the shape Sweep Picking starts from, swept slowly and clean.",
  exercises: [
    {
      id: "barre-sweep",
      title: "One finger, three strings",
      purpose: "A minor at fret 5 under one finger, three notes up and three back, in triplets. The roll of the first finger is the whole Exercise.",
      howTo: [
        "Triplets, 50 BPM up to a pass at 70. Two bars.",
        "The first finger lies across fret 5. G string, B string, top string with one push; top string, B string, G string with one pull. C, E, A and back.",
        "Rock the finger so only the string you are picking is pressed. If you hear a chord, slow down.",
      ],
      coach: "Timed and counted. On a sweep the strings ring into each other, so the pitch is for your ear.",
      tab: sweeps(AM_BARRE, AM_BARRE),
      position: 5,
      loops: false,
      harmony: { arpeggio: "Am", cover: true },
      rungs: ladder(50, 100, 10),
      passAt: 70,
      ...SWEPT,
      minutes: 5,
    },
    {
      id: "root-lowest-sweep",
      title: "D minor and E minor, root lowest",
      purpose: "The minor shape with a finger on each string and each a fret apart, on D minor and then two frets higher on E minor. This is the shape Sweep Picking starts from.",
      howTo: [
        "Triplets, 50 BPM up to a pass at 70. One bar on each chord.",
        "D minor: G string 7, B string 6, top string 5. E minor: G string 9, B string 8, top string 7. Third, second and first fingers both times.",
        "Keep the fingers in their shape as the hand moves up two frets at the bar line.",
      ],
      coach: "Timed and counted. The pitch is for your ear.",
      tab: sweeps(top(7, 6, 5), top(9, 8, 7)),
      position: 5,
      shifts: true,
      chords: "Dm | Em",
      harmony: { chordTones: true },
      rungs: ladder(50, 100, 10),
      passAt: 70,
      ...SWEPT,
      minutes: 5,
    },
    {
      id: "low-four-sweep",
      title: "C, G, A minor, F around fret 5, swept",
      purpose: "Four chords and four different fingerings between frets 3 and 6, a bar each, with a band playing in triplets. These are the first four bars of the song in the next Step.",
      howTo: [
        "Triplets, 50 BPM up to a pass at 70. One bar on each chord.",
        "C is 5, 5, 3. G is 4, 3, 3. A minor is the first finger across fret 5. F is 5, 6, 5.",
        "In G the first finger holds two strings, and in A minor three: roll it each time. In F it holds the G and top strings, with the second finger on the B string between them. The last bar stops on the top note of F and holds it for a beat.",
      ],
      coach: "Band on. Timed and counted; the pitch is for your ear.",
      tab: `${sweeps(top(5, 5, 3), top(4, 3, 3), AM_BARRE)} | ${sweepEnd(top(5, 6, 5))}`,
      position: 3,
      shifts: true,
      chords: "C | G | Am | F",
      jam: TWELVE_EIGHT("C"),
      harmony: { chordTones: true },
      rungs: ladder(50, 100, 10),
      passAt: 70,
      ...SWEPT,
      minutes: 6,
    },
  ],
};
