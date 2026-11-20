/**
 * Funk Lines: two more consolidation Steps for the Beginner Level (2026-11-19).
 * Drafts, like the Path they belong to.
 *
 * Beginner met each idea once: accents on one note, the three one-hole figures,
 * then two lines with a band, in one key. These Steps add nothing new for the
 * hands. The first mixes the figures in one bar, moves the fretting hand under
 * the swing, leaves two strokes out and ends on a two-bar rhythm on one note.
 * The second takes the lines to D minor pentatonic (the same box one string
 * over, still at the fifth fret) and closes the Level with a four-bar line in A
 * minor that is built from the figures by name. Every id is new, so nobody's
 * progress moves. Every line is original.
 */
import type { ExerciseSpec, StepSpec } from "../spec";
import type { PassBar } from "../format";
import { ladder } from "../templates";

// Copied from funk-lines.ts (a Path importing its extra Steps while they import the Path is a circular import).
const even = (min: number, overBars = 4): PassBar => ({ metric: "timingEvenness", min, overBars });
const heard = (min: number, overBars = 4): PassBar => ({ metric: "notesHeard", min, overBars });
const extras = (max: number): PassBar => ({ metric: "extraNotes", max, overBars: 4 });
const right = (min: number): PassBar => ({ metric: "noteIdentity", min, overBars: 4 });

/** Single-note lines with rests: timing, notes heard, right notes. Extras are forgiving, since scratches may be heard. */
const LINE = { grade: "timingNotes", pass: [even(0.8), heard(0.9), extras(6), right(0.85)] } as const satisfies Partial<ExerciseSpec>;
const FREE = { pick: "free" } as const satisfies Partial<ExerciseSpec>;

const SCRATCH_CHECK = "Did the picking hand keep swinging in sixteenths through the rests?";
const SHORT_CHECK = "Were the notes short, with silence between them?";

const A_PENT = { scale: ["A", "minorPentatonic"] as [string, string] };
const D_PENT = { scale: ["D", "minorPentatonic"] as [string, string] };
const FUNK = { groove: "funk", key: "A minor" } as const;
const FUNK_D = { groove: "funk", key: "D minor" } as const;

/** One bar of sixteenths from four beats, each written as four tokens. */
const bar = (...beats: string[]) => `/16 ${beats.join(" ")}`;
const bars = (...all: string[]) => all.join(" | ");

// --- The figures mixed: everything on the D string ----------------------------

const A = "4:7";
const G = "4:5";

/** 'One, and-a' as the Step before writes it: a long note and two short ones. */
const oneAndA = (first: string, second = first, third = second) => `/8 ${first} /16 ${second} ${third}`;

const THREE_IN_A_BAR = bar(oneAndA(A), `${A} ${A} r ${A}`, `r ${A} ${A} ${A}`, oneAndA(G));
const ONE_A = bar(`${A} r r ${A}`, `${A} r r ${A}`, `${A} r r ${A}`, `${G} r r ${G}`);
// The same rhythm as THREE_IN_A_BAR; the 'a' of every beat is G.
const TWO_NOTES = bar(oneAndA(A, A, G), `${A} ${A} r ${G}`, `r ${A} ${A} ${G}`, oneAndA(A, A, G));
const ONE_NOTE_PART = bars(
  bar(oneAndA(A), `${A} ${A} r ${A}`, `${A} r r ${A}`, `r r r r`),
  bar(oneAndA(A), `r ${A} ${A} ${A}`, `${A} r r ${A}`, `${A} r r r`),
);

// --- D minor pentatonic at the fifth fret: the A, D and G strings ---------------

const D_HI = "3:7";
const C = "3:5";
const F = "5:8";
const D_LO = "5:5";

const D_LINE_TOP = bars(
  bar(`${D_HI} ${D_HI} r ${C}`, `r r ${D_HI} r`, `${A} r r ${G}`, `r ${A} r r`),
  `${bar(`${D_HI} ${D_HI} r ${C}`, `r r ${D_HI} r`, `${A} ${G} r ${F}`)} /4 ${D_LO}`,
);
const D_LINE_BOTTOM = bars(
  bar(`${D_LO} r r ${F}`, `${D_LO} r r r`, `r ${G} ${A} r`, `r r ${C} r`),
  `${bar(`${D_LO} r r ${F}`, `${D_LO} r r r`, `r ${G} ${A} ${C}`)} /4 ${D_HI}`,
);

// --- Back in A minor: the box on the low three strings ---------------------------

const E = "5:7";
const D = "5:5";
const LOW_C = "6:8";
const LOW_A = "6:5";

const FIGURES_LINE = bars(
  bar(`${A} r ${A} ${G}`, `r r r r`, `${E} ${E} r ${D}`, `r r r r`),
  bar(`r ${G} ${A} ${G}`, `r r r r`, `${E} r r ${D}`, `${LOW_A} r r r`),
  bar(`${A} r ${A} ${G}`, `r r r r`, `${E} ${E} r ${D}`, `r r r r`),
  `${bar(`r ${LOW_C} ${D} ${E}`, `r r r r`, `${G} r r ${E}`)} /4 ${LOW_A}`,
);

/** Beginner, after the three one-hole figures: the same figures in one bar, on two notes, and as a two-bar rhythm. */
export const HOLES_MIXED: StepSpec = {
  id: "holes-mixed",
  title: "The figures mixed",
  goal: "Play the three one-hole figures in one bar, the mixed bar with the note changing inside each beat, a figure with two strokes left out, and a two-bar rhythm on one note, with the hand's swing unbroken.",
  why: "The Step before kept to one figure for a whole bar. A part changes figure from beat to beat, and the picking hand must not notice: it swings down, up, down, up, and the only thing that changes is which stroke misses the string. Each figure was learned by itself. Here they meet in one bar, then the fretting hand starts to move under the swing, and at the end the figures make a rhythm two bars long.",
  howTo: [
    "The hand swings in sixteenths the whole time: down on the beat and the 'and', up on the 'e' and the 'a'. On a rest the hand passes over the string without touching it. A muted scratch is the sound players put there, but the app may count it as an extra note, so keep the rests empty while you are going for a pass.",
    "The figures keep the names they had in the Step before. 'One, and-a' leaves out the 'e'. 'One-e, a' leaves out the 'and'. 'E-and-a' leaves out the beat itself.",
    "Every note is on the D string: A at fret 7 under the third finger, G at fret 5 under the first. Stop each short note by relaxing the fretting finger.",
  ],
  payoff: "A two-bar rhythm on one note that already sounds like a guitar part.",
  difficultyException:
    "Two of these Exercises leave more strokes out of the bar than the one-hole figures before them, so the note count falls. The demand is changing figure from beat to beat and moving the fretting hand under an unbroken swing, which a note-rate metric does not count.",
  exercises: [
    {
      id: "three-in-a-bar",
      title: "Three figures in a bar",
      purpose: "One bar with a different figure on each of its first three beats: 'One, and-a', then 'One-e, a', then 'E-and-a'. Beat 4 is 'One, and-a' again, on G.",
      howTo: [
        "Count '1, and a, 2 e (and) a, (3) e and a, 4, and a'. The hand misses the string on the 'e' of beat 1, on the 'and' of beat 2, on beat 3 itself and on the 'e' of beat 4.",
        "Beats 1, 2 and 3 are A at fret 7 of the D string. Beat 4 is G at fret 5, as in the Step before, so you can hear where the bar ends.",
        "Beat 3 is the one that trips you up. The upstroke on the 'a' of beat 2 sounds, and the downstroke straight after it, on beat 3, plays the air.",
      ],
      coach: "Twelve notes a bar, each timed against where it is written. The two pitches are checked after the take.",
      ...FREE,
      tab: THREE_IN_A_BAR,
      position: 5,
      harmony: A_PENT,
      rungs: ladder(50, 120, 10),
      passAt: 85,
      ...LINE,
      selfCheck: [SCRATCH_CHECK],
      minutes: 5,
    },
    {
      id: "two-notes",
      title: "The mixed bar with the note moving",
      purpose: "The rhythm of 'Three figures in a bar' with the fretting hand moving: the 'a' of every beat is G, and every other note is A.",
      howTo: [
        "The count is the same: '1, and a, 2 e (and) a, (3) e and a, 4, and a'. Every 'a' is an upstroke, and here every one of them is G at fret 5.",
        "The first finger can stay touching the D string at fret 5 for the whole bar, and presses only for each G. The third finger presses at fret 7 for each A and comes off the string for each G. To stop a note before a hole, relax both fingers: a first finger left pressed turns the end of an A into a G.",
        "The picking hand must not follow the fretting hand. If the swing hesitates where the note changes, go down a rung.",
      ],
      coach: "Twelve notes a bar: eight A and four G. Each one is timed against where it is written, and the pitches are checked after the take.",
      ...FREE,
      tab: TWO_NOTES,
      position: 5,
      harmony: A_PENT,
      rungs: ladder(50, 120, 10),
      passAt: 85,
      ...LINE,
      selfCheck: [SCRATCH_CHECK],
      minutes: 5,
    },
    {
      id: "one-a",
      title: "One, a",
      purpose: "Two strokes left out of every beat, the 'e' and the 'and'. Only the beat and the 'a' sound.",
      howTo: [
        "Count '1 (e and) a'. Down, miss, miss, up: the hand passes over the string twice between the two notes.",
        "The 'a' and the beat after it are neighbours: an upstroke and a downstroke one sixteenth apart, then a gap. Keep the gap its full length.",
        "Three beats on A at fret 7, the last beat on G at fret 5.",
      ],
      coach: "Eight notes a bar. A gap cut short shows as an early 'a': each note is timed against where it is written.",
      ...FREE,
      tab: ONE_A,
      position: 5,
      harmony: A_PENT,
      rungs: ladder(50, 120, 10),
      passAt: 85,
      ...LINE,
      selfCheck: [SCRATCH_CHECK],
      minutes: 5,
    },
    {
      id: "one-note-part",
      title: "A part on one note",
      purpose: "Two bars on the A at fret 7 of the D string, made of all four figures, a silent beat and one single note: a rhythm with a shape of its own, on a single note.",
      howTo: [
        "Bar 1: 'One, and-a' on beat 1, 'One-e, a' on beat 2, 'One, a' on beat 3, and beat 4 is silent.",
        "Bar 2: 'One, and-a' on beat 1, 'E-and-a' on beat 2, 'One, a' on beat 3, and one short note on beat 4.",
        "Count it out loud at the first rung: '1, and a, 2 e (and) a, 3 (e and) a, (4)', then '1, and a, (2) e and a, 3 (e and) a, 4'.",
        "The hand swings through the silent beat as it does through the notes: four strokes that miss the string.",
      ],
      coach: "Seventeen notes in the two bars, all on one pitch. Each one is timed against where it is written.",
      ...FREE,
      tab: ONE_NOTE_PART,
      position: 5,
      harmony: A_PENT,
      rungs: ladder(50, 120, 10),
      passAt: 85,
      ...LINE,
      selfCheck: [SCRATCH_CHECK],
      minutes: 6,
    },
  ],
};

/** Beginner, the last Step: the lines in D minor, and a four-bar line in A minor made of the figures. */
export const LINES_SECOND_KEY: StepSpec = {
  id: "lines-second-key",
  title: "Lines in a second key",
  goal: "Play a two-bar line from the top and one from the bottom in D minor pentatonic over a band, join them, and play a four-bar line in A minor that is made of the hole figures.",
  why: "The box at the fifth fret is a shape, and a shape can sit on other strings. Move it one string over, from the low E, A and D strings to the A, D and G strings, and the same fingers on the same frets play D minor pentatonic where they played A minor. The two lines keep the order of notes they had in A minor, one string over, each with one note fewer in bar 1, and the rhythm is new: the fretting hand makes moves it knows on new strings while the picking hand puts them in new places. The last line comes back to A minor and puts a figure of this Level on beats 1 and 3 of every bar, because a line is those figures with the notes moving.",
  howTo: [
    "D minor pentatonic here is on the A, D and G strings: first finger on the frets at 5, third finger on the 7s, little finger on the A string's fret 8. The hand stays at the fifth fret.",
    "The low D is the A string at fret 5. The high D is the G string at fret 7.",
    "Play every note short except the held one that ends a line, and leave the rests empty. The picking hand swings in sixteenths from the first note to the last.",
    "The band plays Dm7 under the three D minor lines and Am7 under the last line.",
  ],
  payoff: "A four-bar line over the band in a second key, and a line in A minor where beats 1 and 3 of every bar are figures you can name.",
  difficultyException:
    "These lines leave a little more of the bar silent than the two before them, and the last one leaves whole beats empty, so the note count is lower. The demand is finding the box on new strings and placing named figures around a band, which a note-rate metric does not count.",
  exercises: [
    {
      id: "d-line-top",
      title: "From the top, in D minor",
      purpose: "Two bars that start on the high D, the G string's fret 7, and work down to the low D on the A string.",
      howTo: [
        "Both bars start 'One-e, a' on the G string: D on the beat and on the 'e', then C at fret 5 on the 'a'. One more D follows on the 'and' of beat 2.",
        "Bar 1 goes on with 'One, a' on beat 3, A then G on the D string at frets 7 and 5, and a single A on the 'e' of beat 4.",
        "Bar 2 plays 'One-e, a' again on beat 3: A, G, then F at fret 8 of the A string under the little finger. It ends on a held low D.",
      ],
      coach: "Band on. Notes are timed against it and checked after the take. Direct input or headphones make that fair.",
      ...FREE,
      tab: D_LINE_TOP,
      position: 5,
      chords: "Dm7 | Dm7",
      jam: FUNK_D,
      harmony: D_PENT,
      rungs: ladder(50, 110, 10),
      passAt: 80,
      ...LINE,
      selfCheck: [SHORT_CHECK],
      minutes: 6,
    },
    {
      id: "d-line-bottom",
      title: "From the bottom, in D minor",
      purpose: "The answer: two bars that start on the low D and climb to the high D, where the first line began.",
      howTo: [
        "Both bars start 'One, a' on the A string: the low D on beat 1, F at fret 8 on the 'a', then the low D again on beat 2.",
        "Beat 3 starts with silence in both bars. Bar 1 plays G and A on the 'e' and the 'and', then C on the 'and' of beat 4.",
        "Bar 2 plays 'E-and-a' on beat 3, G, A and C, and lands on a held high D on beat 4.",
        "G and A are the D string at frets 5 and 7. C is the G string at fret 5.",
      ],
      coach: "Band on. Notes are timed against it and checked after the take.",
      ...FREE,
      tab: D_LINE_BOTTOM,
      position: 5,
      chords: "Dm7 | Dm7",
      jam: FUNK_D,
      harmony: D_PENT,
      rungs: ladder(50, 110, 10),
      passAt: 80,
      ...LINE,
      selfCheck: [SHORT_CHECK],
      minutes: 6,
    },
    {
      id: "d-both-lines",
      title: "Question and answer in D minor",
      purpose: "The two D minor lines joined: four bars, down from the high D and back up to it.",
      howTo: [
        "Bars 1 and 2 are the line from the top; bars 3 and 4 are the line from the bottom.",
        "The held low D at the end of bar 2 is your breath. Bar 3 starts on the same note.",
        "Bar 4 ends on the high D, the note bar 1 started on.",
      ],
      coach: "This is the test piece for the new key. Notes are timed against the band and checked after the take.",
      ...FREE,
      tab: bars(D_LINE_TOP, D_LINE_BOTTOM),
      position: 5,
      loops: false,
      chords: "Dm7 | Dm7 | Dm7 | Dm7",
      jam: FUNK_D,
      harmony: D_PENT,
      rungs: ladder(50, 110, 10),
      passAt: 80,
      ...LINE,
      minutes: 7,
    },
    {
      id: "figures-line",
      title: "A line made of figures",
      purpose: "Four bars back in A minor, in the box on the low three strings. Every bar has a named figure on beat 1 and another on beat 3, and beat 2 is always silent.",
      howTo: [
        "Bars 1 and 3: 'One, and-a' on beat 1, A, A and G on the D string at frets 7, 7 and 5. Then 'One-e, a' on beat 3, E, E and D on the A string at frets 7, 7 and 5. Beat 4 is silent.",
        "Bar 2: 'E-and-a' on beat 1, G, A and G on the D string. Then 'One, a' on beat 3, E and D on the A string, and one short low A on beat 4, the low E string at fret 5.",
        "Bar 4: 'E-and-a' on beat 1 climbs C, D, E: the low E string at fret 8, then the A string at frets 5 and 7. 'One, a' on beat 3 is G on the D string, then E on the A string, and the bar ends on a held low A.",
        "The notes are short here, so 'One, and-a' is three short notes with a hole after the first. The hand swings through every silent beat.",
      ],
      coach: "Band on, in A minor again. Notes are timed against it and checked after the take.",
      ...FREE,
      tab: FIGURES_LINE,
      position: 5,
      chords: "Am7 | Am7 | Am7 | Am7",
      jam: FUNK,
      harmony: A_PENT,
      rungs: ladder(50, 110, 10),
      passAt: 80,
      ...LINE,
      selfCheck: [SHORT_CHECK],
      minutes: 7,
    },
  ],
};
