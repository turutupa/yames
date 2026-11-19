/**
 * First Chords and Strumming: consolidation Steps (2026-11-19). Drafts, like
 * the Path they belong to: no teacher has reviewed them and nothing here has
 * met a real guitar.
 *
 * Three Steps that add little that is new. Each takes an idea the Path already
 * taught somewhere else:
 *
 * - `strums-between-beats` (Intermediate, after `patterns`): the down-up swing
 *   with strokes left out, taken to a rest, to the off-beat upstroke, and to a
 *   pattern that ends early so the change has time.
 * - `sevenths-blues` (Advanced, after `a-and-e`): A, D and E with one note
 *   changed, and the A, D, E form grown to twelve bars.
 * - `sixteenth-strums` (Advanced, after `light-and-shade`): the same swing at
 *   twice the speed, at slow tempos.
 *
 * Grading is the Path's: a strum is the chord's notes on one tick, one attack,
 * timed and counted and never pitch-checked; an upstroke is written as the
 * three thinnest strings; stroke direction is a self-check question. Every id
 * is new, so nobody's progress moves. The helpers are copies of the ones in
 * `first-chords.ts` (importing them from there would be a circular import).
 */
import type { ExerciseSpec, StepSpec } from "../spec";
import type { PassBar } from "../format";
import { ladder } from "../templates";

const even = (min: number, overBars = 4): PassBar => ({ metric: "timingEvenness", min, overBars });
const heard = (min: number, overBars = 4): PassBar => ({ metric: "notesHeard", min, overBars });
const extras = (max: number): PassBar => ({ metric: "extraNotes", max, overBars: 4 });

/** A strum is one attack: timed and counted, never pitch-checked. Upstrokes are quiet, so "heard" is forgiving. */
const STRUM = { pick: "free", grade: "timing", pass: [even(0.75), heard(0.85), extras(6)] } as const satisfies Partial<ExerciseSpec>;
const STRUM_LONG = { pick: "free", grade: "timing", pass: [even(0.75, 8), heard(0.85, 8), extras(6)] } as const satisfies Partial<ExerciseSpec>;
/** A chord picked one string at a time: right notes, counted, timed. */
const STRINGS = {
  pick: "free",
  grade: "written",
  alsoGraded: ["timingEvenness"],
  pass: [
    { metric: "noteIdentity", min: 0.9, overBars: 4 },
    { metric: "notesHeard", min: 0.9, overBars: 4 },
    { metric: "extraNotes", max: 4, overBars: 4 },
    { metric: "timingEvenness", min: 0.7, overBars: 4 },
  ],
} as const satisfies Partial<ExerciseSpec>;

const STRUM_COACH = "A strum is one attack: timed and counted. Whether every string rang is for your ear.";
const BAND_COACH = "Band on. Each strum is timed and counted. Whether every string rang is for your ear.";
const STRINGS_COACH = "Right notes and steady quarter notes after the take. A dead string shows up as a missing note.";
const TWELVE_COACH = "Twelve bars with the band. Each strum is timed and counted.";
const SWING_CHECK = "Did the strumming hand keep swinging down and up through the strokes you left out?";
const CHANGE_CHECK = "Did every change arrive on the beat, even when a finger was late?";
const FOOT_CHECK = "Did your foot keep tapping the beat under the upstrokes?";
const LOOSE_CHECK = "Did the strumming hand and forearm stay loose to the end of the take?";

const ROCK = (key: string) => ({ groove: "rock8", key });

// ---------------------------------------------------------------------------
// The chords these Steps use, low string first, with the Path's fingers. The
// seventh chords keep the fingers of the chord they come from where they can:
// A7 is the Path's A (fingers 1, 2, 3) with the second finger lifted, E7 is E
// with the third finger lifted. D7 has one NOTE different from D and every
// finger different, and the text says so.
// ---------------------------------------------------------------------------

const CHORDS = {
  Em: ["6:0", "5:2f2", "4:2f3", "3:0", "2:0", "1:0"],
  C: ["5:3f3", "4:2f2", "3:0", "2:1f1", "1:0"],
  G: ["6:3f3", "5:2f2", "4:0", "3:0", "2:0", "1:3f4"],
  D: ["4:0", "3:2f1", "2:3f3", "1:2f2"],
  A7: ["5:0", "4:2f1", "3:0", "2:2f3", "1:0"],
  D7: ["4:0", "3:2f2", "2:1f1", "1:2f3"],
  E7: ["6:0", "5:2f2", "4:0", "3:1f1", "2:0", "1:0"],
} as const;
type Chord = keyof typeof CHORDS;

/** A downstroke: every string of the chord. */
const dn = (chord: Chord) => CHORDS[chord].join("+");
/** An upstroke: only the three thinnest strings. */
const up = (chord: Chord) => CHORDS[chord].slice(-3).join("+");

/** One bar of a strumming figure on a chord. `D` a downstroke, `U` an upstroke. */
const figure = (pattern: string) => (chord: Chord) => pattern.replace(/\bD\b/g, dn(chord)).replace(/\bU\b/g, up(chord));
const song = (bar: (chord: Chord) => string, chords: readonly Chord[]) => chords.map(bar).join(" | ");

const FOUR = figure("/4 D D D D");
const DOWN_DOWN_UP = figure("/4 D /8 D U /4 D /8 D U");
/** Down on 1, 2 and 4: the downstroke on beat 3 misses the strings. */
const REST_ON_THREE = figure("/4 D D r D");
/** Upstrokes on the 'ands' only. The first bar of a loop starts on a downstroke so the take has a beat 1. */
const ANDS_FIRST = figure("/8 D U r U r U r U");
const ANDS = figure("/8 r U r U r U r U");
/** Down, down-up, up, down: the Path's pattern without its last upstroke. */
const SHORT_PATTERN = figure("/4 D /8 D U r U /4 D");
const SIXTEENTHS = figure("/16 D U D U D U D U D U D U D U D U");
/** '1, and a' on beats 1 to 3, a long downstroke on 4. */
const SIXTEENTH_PATTERN = figure("/8 D /16 D U /8 D /16 D U /8 D /16 D U /4 D");

/** The chord one string at a time: up through its strings and back, ending one string above the lowest. */
function strings(chord: Chord): string {
  const n = CHORDS[chord];
  if (n.length === 6) return `/4 ${n[0]} ${n[1]} ${n[2]} ${n[3]} | ${n[4]} ${n[5]} ${n[4]} ${n[3]} | ${n[2]} ${n[1]} ${n[0]} ${n[1]}`;
  if (n.length === 5) return `/4 ${n[0]} ${n[1]} ${n[2]} ${n[3]} | ${n[4]} ${n[3]} ${n[2]} ${n[1]}`;
  return `/4 ${n[0]} ${n[1]} ${n[2]} ${n[3]} | ${n[2]} ${n[1]} ${n[0]} ${n[1]}`;
}

const TWELVE: readonly Chord[] = ["A7", "A7", "A7", "A7", "D7", "D7", "A7", "A7", "E7", "D7", "A7", "E7"];
const TWELVE_CHART = TWELVE.join(" | ");

// ---------------------------------------------------------------------------
// Intermediate, after `patterns`.
// ---------------------------------------------------------------------------

export const STRUMS_BETWEEN_BEATS: StepSpec = {
  id: "strums-between-beats",
  title: "Strums between the beats",
  goal: "Leave a beat without a strum in the middle of a bar, strum only on the 'ands', and play a pattern that stops early so the next chord has time to arrive.",
  why: "The last Step made a pattern by leaving strokes out of the down-up swing. This Step leaves out more of them, in harder places. A rest is a beat with no strum on it. An off-beat strum is an upstroke on an 'and' with no downstroke on the beat before it. Both are easy to rush, because the hand wants to fill the gap. And leaving out the last upstroke of a bar gives the fingers on the neck a whole beat, from the strum on 4 to the strum on 1 of the next bar, in which to change chord. In all three the strumming hand does what it did before: down on every beat, up on every 'and', touching the strings only where a strum is written.",
  howTo: [
    "A rest is a place in the bar where nothing is strummed: a beat, or part of a beat. A quarter rest lasts one beat. Count it out loud like any other beat, and let the hand make its downstroke in the air.",
    "In this Step the chord you strummed before a rest rings on through it. Stopping the strings dead is a later Step.",
    "An off-beat is the 'and' between two beats. To strum only there, the hand still comes down on the number, passing the strings without touching them, and catches the three thinnest strings on the way up.",
    "Tap your foot on every beat. When a strum comes on an 'and', the foot is in the air.",
    "The app hears only the strokes that sound, and times them. Whether the hand kept swinging through the silent ones is yours to check.",
  ],
  payoff: "Strumming with gaps in it that stays in time, and a pattern that leaves room for the change.",
  difficultyException:
    "Rests and off-beats take strums out of the bar, so the strum rate falls below the pattern of the Step before. The demand is an upstroke with no downstroke before it and a swing kept through silent beats, which the metric does not count.",
  exercises: [
    {
      id: "rest-beat",
      title: "A beat with no strum",
      purpose: "Down on beats 1, 2 and 4, and a quarter rest on beat 3, on G and E minor. Three strums in a bar of four beats.",
      howTo: [
        "Quarter notes with a quarter rest, 50 BPM up to a pass at 80. Count '1, 2, (3), 4', and say the 3 as loudly as the others.",
        "On beat 3 the hand goes down as always and misses the strings. The chord from beat 2 rings on.",
        "Two bars of G, two of E minor. The second finger stays on the A string through the change.",
      ],
      coach: STRUM_COACH,
      tab: song(REST_ON_THREE, ["G", "G", "Em", "Em"]),
      position: 1,
      chords: "G | G | Em | Em",
      harmony: { chordTones: true },
      rungs: ladder(50, 110, 10),
      passAt: 80,
      ...STRUM,
      selfCheck: [SWING_CHECK],
      minutes: 5,
    },
    {
      id: "only-ands",
      title: "Only the 'ands'",
      purpose: "E minor with the strums on the 'ands': an upstroke between the beats, and nothing on the beats themselves. The one exception is a downstroke on beat 1 of the first bar, which sets you off.",
      howTo: [
        "Off-beat eighths, 50 BPM up to a pass at 75. Count '1 and, (2) and, (3) and, (4) and'. From the second bar on, beat 1 is silent too.",
        "Every 'and' is an upstroke across the three thinnest strings. On each silent beat the hand goes down past the strings without touching them.",
        "Tap the foot on the click. If the upstrokes start to land with the foot, the rhythm has turned over: stop, count a bar out loud, and come back in.",
      ],
      coach: STRUM_COACH,
      tab: `${ANDS_FIRST("Em")} | ${song(ANDS, ["Em", "Em", "Em"])}`,
      position: 1,
      chordShape: "Em",
      chords: "Em | Em | Em | Em",
      harmony: { chordTones: true },
      rungs: ladder(50, 105, 5),
      passAt: 75,
      ...STRUM,
      selfCheck: [SWING_CHECK, FOOT_CHECK],
      minutes: 6,
    },
    {
      id: "short-pattern",
      title: "Down, down-up, up, down",
      purpose: "The pattern you know with its last upstroke left out: down on 1, down-up on 2, up on the 'and' of 3, and one long downstroke on 4. Two bars of G, two of C.",
      howTo: [
        "Quarter notes and eighths, 50 BPM up to a pass at 80. Count '1, 2 and, (3) and, 4'.",
        "Five strums a bar. Beat 4 is a quarter note, so nothing is played on the 'and' of 4: the hand comes up without touching the strings.",
        "Use that silent upstroke to move. From G to C the second and third fingers go one string toward the floor (to the next thinner string) as a pair, the fourth finger lifts, and the first lands on the B string at fret 1.",
      ],
      coach: STRUM_COACH,
      tab: song(SHORT_PATTERN, ["G", "G", "C", "C"]),
      position: 1,
      chords: "G | G | C | C",
      harmony: { chordTones: true },
      rungs: ladder(50, 110, 10),
      passAt: 80,
      ...STRUM,
      selfCheck: [SWING_CHECK, CHANGE_CHECK],
      minutes: 6,
    },
    {
      id: "short-pattern-song",
      title: "Room to change: C, G, D, E minor",
      purpose: "Four chords, one bar each, over the band, with the shorter pattern. Every bar ends on a long downstroke on beat 4, and the fingers have the whole of that beat to reach the next chord.",
      howTo: [
        "Quarter notes and eighths, 50 BPM up to a pass at 75. Down, down-up, up, down in every bar.",
        "C to G: the second and third fingers move one string thicker as a pair, the first finger lifts, and the fourth lands on the top string at fret 3. G to D and D to E minor are whole-hand changes. For D, aim the third finger at the B string, fret 3.",
        "From E minor back to C at the repeat is a whole-hand change too: the second and third fingers swap strings and the first finger lands on the B string at fret 1.",
        "C is strummed from the A string, G from the low E string, D from the D string, E minor from the low E string.",
      ],
      coach: BAND_COACH,
      tab: song(SHORT_PATTERN, ["C", "G", "D", "Em"]),
      position: 1,
      chords: "C | G | D | Em",
      jam: ROCK("G"),
      harmony: { chordTones: true },
      rungs: ladder(50, 110, 5),
      passAt: 75,
      ...STRUM,
      selfCheck: [SWING_CHECK, CHANGE_CHECK],
      minutes: 7,
    },
  ],
};

// ---------------------------------------------------------------------------
// Advanced, after `a-and-e`.
// ---------------------------------------------------------------------------

export const SEVENTHS_BLUES: StepSpec = {
  id: "sevenths-blues",
  title: "Seventh chords and a twelve-bar blues in A",
  goal: "Hold A7, D7 and E7, change between them, and strum a twelve-bar blues in A: first four strums a bar, then down, down-up.",
  why: "A seventh chord is a chord you know with one note changed, which makes it sound unfinished and bluesy. It is written with a 7 after the letter and said 'A seven'. You have A, D and E, and each has a seventh chord close by: A7 and E7 are made by lifting one finger, and D7 by changing one note on the B string. With the three of them you can play a twelve-bar blues. That is a form: twelve bars, three chords in a set order, played round and round. A great many blues and rock and roll songs are built on it, so learning where its changes fall is worth the counting.",
  howTo: [
    "A7: hold A and lift the second finger. The first finger stays on the D string and the third on the B string, both at fret 2, and the G string between them is now open. Play from the open A string, as for A.",
    "E7: hold E and lift the third finger. The second finger stays on the A string at fret 2 and the first on the G string at fret 1, and the D string between them is now open. Strum all six strings.",
    "D7: one note of D changes, on the B string, from fret 3 to fret 1, and every finger moves to reach it. First finger on the B string at fret 1, second finger on the G string at fret 2, third finger on the top string at fret 2. Coming from D, the first finger goes from the G string to the B string, the second from the top string to the G string, and the third from the B string to the top string. The D string is open. Play only the top four strings, as for D.",
    "No finger stays down between these three chords, so every change is a whole-hand change. Let the first finger lead: the D string at fret 2 for A7, the B string at fret 1 for D7, the G string at fret 1 for E7.",
    "The form, one chord to a bar: four bars of A7, two of D7, two of A7, then E7, D7, A7 and E7. The E7 in bar 12 leads back to the A7 that starts the form again.",
  ],
  payoff: "Three seventh chords, and a twelve-bar blues you can play round and round with a band.",
  difficultyException:
    "Two of the five Exercises are four strums a bar, after an eight-bar form in down, down-up, so the strum rate falls a little. The demand is three new shapes with no finger in common, and a twelve-bar form kept in the head.",
  exercises: [
    {
      id: "a7-strings",
      title: "Check every string of A7",
      purpose: "A7 one string at a time, from the open A string to the top string and back, with the first and third fingers held down at fret 2.",
      howTo: [
        "Quarter notes, 55 BPM up to a pass at 90.",
        "Pick the A string, then D, G, B and the top string, and come back: B, G, D.",
        "The open G string is the note that turns A into A7, and it sits between two fingers. If it is dead, one of them is touching it: stand both up on their tips.",
      ],
      coach: STRINGS_COACH,
      tab: strings("A7"),
      position: 1,
      chordShape: "A7",
      harmony: { arpeggio: "A7", cover: true },
      rungs: ladder(50, 120, 10),
      passAt: 90,
      ...STRINGS,
      minutes: 4,
    },
    {
      id: "d7-strings",
      title: "Check every string of D7",
      purpose: "D7 one string at a time: the open D string, then the G, B and top strings, and back.",
      howTo: [
        "Quarter notes, 55 BPM up to a pass at 90.",
        "Pick the D string, then G, B and the top string, and come back: B, G, D, and G once more to finish the bar.",
        "Compare it with D: only the B string has changed, from fret 3 to fret 1. The fretted notes are the G string at fret 2, the B string at fret 1 and the top string at fret 2.",
        "The three fingers sit close together. If the B string is dead, a finger next to it is touching it: stand the second and third fingers up on their tips.",
      ],
      coach: STRINGS_COACH,
      tab: strings("D7"),
      position: 1,
      chordShape: "D7",
      harmony: { arpeggio: "D7", cover: true },
      rungs: ladder(50, 120, 10),
      passAt: 90,
      ...STRINGS,
      minutes: 4,
    },
    {
      id: "three-sevenths",
      title: "A7, D7, A7, E7",
      purpose: "Four downstrokes on each chord, over the band: A7 to D7 and back, then A7 to E7 and round to A7 again. That is every change of the twelve bars but one.",
      howTo: [
        "Quarter notes, 55 BPM up to a pass at 90. Down on every beat.",
        "A7 to D7: the third finger moves from the B string to the top string, staying at fret 2. The first finger goes to the B string at fret 1 and the second lands on the G string at fret 2.",
        "A7 to E7: the first finger goes from the D string at fret 2 to the G string at fret 1, the second finger lands on the A string at fret 2, and the third finger lifts.",
        "A7 is strummed from the A string, D7 from the D string, E7 from the low E string.",
      ],
      coach: BAND_COACH,
      tab: song(FOUR, ["A7", "D7", "A7", "E7"]),
      position: 1,
      chords: "A7 | D7 | A7 | E7",
      jam: ROCK("A"),
      harmony: { chordTones: true },
      rungs: ladder(50, 120, 10),
      passAt: 90,
      ...STRUM,
      selfCheck: [CHANGE_CHECK],
      minutes: 6,
    },
    {
      id: "blues-four",
      title: "Twelve-bar blues, four strums a bar",
      purpose: "The whole form in A over the band, with a downstroke on every beat: four bars of A7, two of D7, two of A7, then E7, D7, A7, E7.",
      howTo: [
        "Quarter notes, 50 BPM up to a pass at 85. Down on every beat.",
        "Count the bars as well as the beats. The four bars of A7 at the start are where players lose their place: '1, 2, 3, 4, 2, 2, 3, 4, 3, 2, 3, 4, 4, 2, 3, 4'.",
        "In bars 9 to 12 the chord changes every bar. E7 to D7 is the new change: the first finger moves one string thinner along fret 1, from the G string to the B string, the second finger goes from the A string to the G string at fret 2, and the third lands on the top string at fret 2.",
        "After the E7 in bar 12 the form starts again on A7.",
      ],
      coach: TWELVE_COACH,
      tab: song(FOUR, TWELVE),
      position: 1,
      chords: TWELVE_CHART,
      jam: ROCK("A"),
      harmony: { chordTones: true },
      rungs: ladder(50, 110, 5),
      passAt: 85,
      ...STRUM_LONG,
      selfCheck: [CHANGE_CHECK],
      minutes: 7,
    },
    {
      id: "blues-down-down-up",
      title: "Twelve-bar blues with down, down-up",
      purpose: "The same twelve bars with a long strum and two short ones, twice a bar: down, down-up, down, down-up, over the band.",
      howTo: [
        "Quarter notes and eighths, 50 BPM up to a pass at 80. Count '1, 2 and, 3, 4 and'.",
        "The form again: A7 for four bars, D7 for two, A7 for two, then E7, D7, A7, E7.",
        "Let go of the chord as you play the last upstroke of the bar, so that the fingers land on beat 1. That upstroke may catch open strings, and that is fine.",
        "Keep the two short strums of each pair the same length. The band plays its eighths evenly, and so do you.",
      ],
      coach: TWELVE_COACH,
      tab: song(DOWN_DOWN_UP, TWELVE),
      position: 1,
      chords: TWELVE_CHART,
      jam: ROCK("A"),
      harmony: { chordTones: true },
      rungs: ladder(50, 105, 5),
      passAt: 80,
      ...STRUM_LONG,
      selfCheck: [CHANGE_CHECK],
      minutes: 8,
    },
  ],
};

// ---------------------------------------------------------------------------
// Advanced, after `light-and-shade`.
// ---------------------------------------------------------------------------

export const SIXTEENTH_STRUMS: StepSpec = {
  id: "sixteenth-strums",
  title: "Sixteenth strums",
  goal: "Strum sixteenth notes, four strokes to a beat, on one chord, then leave strokes out to make a pattern and take it through G, D, E minor and C with the band.",
  why: "A sixteenth note is half as long as an eighth note: four of them fit in one beat. To strum them the hand does what it has done all along, down and up like a pendulum, at twice the speed: two full swings to every beat. Nothing else changes. Upstrokes still catch only the thin strings, and a pattern is still the swing with strokes left out. What is new is how fast the hand moves, which is why the tempos here are slow, and a count with two new syllables in it.",
  howTo: [
    "Count '1 e and a, 2 e and a, 3 e and a, 4 e and a': four even syllables to a beat. The hand goes down on the number and on the 'and', and up on the 'e' and on the 'a'.",
    "That is a change from eighth-note strumming, where the 'and' was an upstroke. In sixteenths the 'and' is a downstroke.",
    "Make the swing smaller, from a loose wrist. Hold the pick lightly and let it give a little as it crosses the strings.",
    "The pattern in this Step: down on the number, nothing on the 'e', down on the 'and', up on the 'a'. Say '1, and a'. On the 'e' the hand comes up past the strings without touching them.",
    "If the forearm tightens, stop, shake the hand out, and go back to a slower tempo.",
  ],
  payoff: "A sixteenth-note strum that stays even at a slow tempo, and a sixteenth pattern through four chords with a band.",
  exercises: [
    {
      id: "sixteenths-em",
      title: "E minor, four strokes to a beat",
      purpose: "Four bars of steady sixteenths on E minor: sixteen strokes in every bar, down, up, down, up, with nothing left out.",
      howTo: [
        "Sixteenth notes, 40 BPM up to a pass at 60. Count '1 e and a' on every beat.",
        "Downstrokes cross all six strings. Upstrokes catch the top three.",
        "Listen for four evenly spaced strokes inside each click. The usual fault is to hurry through 'e and a' and then wait for the next beat.",
      ],
      coach: STRUM_COACH,
      tab: song(SIXTEENTHS, ["Em", "Em", "Em", "Em"]),
      position: 1,
      chordShape: "Em",
      chords: "Em | Em | Em | Em",
      harmony: { chordTones: true },
      rungs: ladder(40, 70, 5),
      passAt: 60,
      ...STRUM,
      selfCheck: [LOOSE_CHECK],
      minutes: 6,
    },
    {
      id: "sixteenth-pattern",
      title: "Down, down-up on beats 1, 2 and 3",
      purpose: "E minor with the 'e' left out: down on the number, then down-up on the 'and' and the 'a'. Three beats of that, and one long downstroke on beat 4.",
      howTo: [
        "An eighth note and two sixteenths on beats 1, 2 and 3, and a quarter note on beat 4. 40 BPM up to a pass at 65. Count '1, and a, 2, and a, 3, and a, 4'.",
        "The hand swings in sixteenths the whole time. On each 'e' it comes up without touching the strings, and after the strum on 4 it keeps swinging in the air until the next bar.",
        "Ten strums a bar: seven downstrokes and three upstrokes.",
      ],
      coach: STRUM_COACH,
      tab: song(SIXTEENTH_PATTERN, ["Em", "Em", "Em", "Em"]),
      position: 1,
      chordShape: "Em",
      chords: "Em | Em | Em | Em",
      harmony: { chordTones: true },
      rungs: ladder(40, 75, 5),
      passAt: 65,
      ...STRUM,
      selfCheck: [SWING_CHECK],
      minutes: 6,
    },
    {
      id: "sixteenth-pattern-g-em",
      title: "The sixteenth pattern on G and E minor",
      purpose: "The same pattern with one easy change: two bars of G, two of E minor.",
      howTo: [
        "Eighths and sixteenths, 40 BPM up to a pass at 65. Count '1, and a, 2, and a, 3, and a, 4' in every bar.",
        "Beat 4 is one long downstroke, and the rest of that beat is the time to change. The second finger stays on the A string through the change.",
      ],
      coach: STRUM_COACH,
      tab: song(SIXTEENTH_PATTERN, ["G", "G", "Em", "Em"]),
      position: 1,
      chords: "G | G | Em | Em",
      harmony: { chordTones: true },
      rungs: ladder(40, 75, 5),
      passAt: 65,
      ...STRUM,
      selfCheck: [SWING_CHECK, CHANGE_CHECK],
      minutes: 5,
    },
    {
      id: "sixteenth-pattern-song",
      title: "The sixteenth pattern through G, D, E minor, C",
      purpose: "Four chords, one bar each, over the band, with the sixteenth pattern. The progression you played with the eighth-note pattern, with a busier strumming hand.",
      howTo: [
        "Eighths and sixteenths, 40 BPM up to a pass at 60. Down, down-up on beats 1, 2 and 3, and one long downstroke on beat 4.",
        "Move the fingers after the strum on beat 4 and land them on beat 1. The strumming hand keeps swinging while they travel.",
        "G is strummed from the low E string, D from the D string, E minor from the low E string, C from the A string.",
      ],
      coach: BAND_COACH,
      tab: song(SIXTEENTH_PATTERN, ["G", "D", "Em", "C"]),
      position: 1,
      chords: "G | D | Em | C",
      jam: ROCK("G"),
      harmony: { chordTones: true },
      rungs: ladder(40, 70, 5),
      passAt: 60,
      ...STRUM,
      selfCheck: [SWING_CHECK, CHANGE_CHECK],
      minutes: 7,
    },
  ],
};
