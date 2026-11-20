/**
 * Blues and Pentatonics: two more consolidation Steps (2026-11-19, round 3).
 * A draft, like the rest of the Path: no teacher or guitarist has reviewed it.
 *
 * Neither Step is a new idea. The minor blues, taught in A minor, is taken to D
 * minor at the tenth fret: the same box and the same hand, so the key is the
 * only new thing. (E minor at the nut would change the hand as well, and the
 * Path already has a Step at the nut.) The three-chorus solo, taught in A, is
 * played in E, where the box sits at the nut and again at the twelfth fret, and
 * this time the solo ends high. Their ids are new, so nobody's progress moves.
 *
 * Helpers are copied from `blues-pentatonics.ts`, `blues-more.ts` and
 * `blues-encore.ts`, never imported from the Path file: that would be a
 * circular import.
 */
import type { ExerciseSpec, StepSpec, VariantBuild, VariantParams } from "../spec";
import type { PassBar } from "../format";
import { handAt, ladder, moveChart, shiftFrets, swing } from "../templates";

const TWELVE = "A7 | A7 | A7 | A7 | D7 | D7 | A7 | A7 | E7 | D7 | A7 | E7";
const TWELVE_E = moveChart(TWELVE, -5);
const MINOR_TWELVE_D = "Dm7 | Dm7 | Dm7 | Dm7 | Gm7 | Gm7 | Dm7 | Dm7 | A7 | Gm7 | Dm7 | A7";

const TEXAS_E = { groove: "bluesTexas", key: "E blues", feel: "shuffle" } as const;
const minorIn = (key: string) => ({ groove: "slowBlues", key: `${key} minor`, feel: "shuffle" as const });

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

/** Timed and counted, never pitch-checked: for a line with bends, which would read as wrong notes. */
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
const VARIANT_NOTE =
  "The frets and chord names here are for the first version, in D minor. On other days the same chorus comes in C minor or G minor, lower on the neck.";

// ---------------------------------------------------------------------------
// The minor blues in D minor: box 1 at the tenth fret.
// ---------------------------------------------------------------------------

// Dm7 from the middle D to the top F and back to C, a phrase that ends on A;
// Gm7 from its root on the A string, and the same phrase with B flat for A.
const DM_ARPS = [
  "/8 4:12 3:10 2:10 2:13 1:10 1:13 1:10 2:13",
  "/8 2:10 3:12 3:10 3:12 /2 2:10",
  "/8 5:10 5:13 4:12 3:10 3:12 2:11 1:10 1:13",
  "/8 2:11 3:12 3:10 3:12 /2 2:11",
].join(" | ");

// The turn. A7: down to C# with the hand a fret lower (fingers printed, so the text can name them).
// Gm7: B flat. Dm7: home. A7: the A major chord.
const TURN_A7 = "/8 2:10f2 3:12f4 3:10f2 3:9f1 /2 4:11f3";
const TURN_GM = "/8 2:11 1:10 1:13 1:10 /2 2:11";
const TURN_DM = "/8 2:10 2:13 2:10 3:10 /2 4:12";
const DM_TURN = [TURN_A7, TURN_GM, TURN_DM, "/4 5:12f4 4:11f3 /2 3:9f1"].join(" | ");

// A chorus: the phrase twice over Dm7, again with B flat over Gm7, and home through the turn.
const DM_PHRASE = "/8 4:12 3:10 3:12 2:10 /2 2:13";
const DM_CHORUS = [
  DM_PHRASE,
  "/2 2:10 /2 r",
  DM_PHRASE,
  "/8 2:10 3:12 3:10 3:12 /2 4:12",
  "/8 4:12 3:10 3:12 2:11 /2 1:10",
  "/2 2:11 /2 r",
  "/8 1:10 2:13 2:10 3:12 /2 3:10",
  "/2 4:12 /2 r",
  TURN_A7,
  TURN_GM,
  TURN_DM,
  "/2 5:12 /2 r",
].join(" | ");

// One way a four-bar answer could go: each bar ends on the note its chord asks for.
const DM_EXAMPLE = [
  "/8 3:10 3:12 2:10 2:13 /2 2:10",
  "/8 3:10 3:12 2:11 1:10 /2 2:11",
  "/8 1:10 2:13 2:10 3:12 /2 2:10",
  "/8 3:12 2:10 3:12 3:9 /2 4:11",
].join(" | ");

/**
 * The chorus's words in its other keys, written by hand: one sentence speaks of
 * another Exercise (the turn), which no rewrite of letters and frets can move.
 * `notes` is the box (root, third, fourth, fifth, seventh), `sixth` the note the
 * box lacks over the second chord, `leading` the note the last chord adds.
 */
type MinorKeyWords = {
  notes: readonly [string, string, string, string, string];
  sixth: string;
  leading: string;
  chords: readonly [string, string, string];
  box: number;
  lower: string;
};
const CHORUS_KEY_WORDS: Readonly<Record<string, MinorKeyWords>> = {
  C: { notes: ["C", "E flat", "F", "G", "B flat"], sixth: "A flat", leading: "B", chords: ["Cm7", "Fm7", "G7"], box: 8, lower: "two frets lower" },
  G: { notes: ["G", "B flat", "C", "D", "F"], sixth: "E flat", leading: "F#", chords: ["Gm7", "Cm7", "D7"], box: 3, lower: "seven frets lower" },
};

function chorusWords(key: string): Pick<VariantBuild, "purpose" | "howTo"> {
  const words = CHORUS_KEY_WORDS[key];
  if (!words) return {};
  const [root, third, fourth, fifth, seventh] = words.notes;
  const [one, four, five] = words.chords;
  const { sixth, leading, box, lower } = words;
  return {
    purpose: `All twelve bars of a minor blues in ${key} minor: a phrase said twice over ${one}, said again with ${sixth} over ${four}, and brought home through the turn you just learned, moved to this key.`,
    howTo: (exerciseHowTo) => [
      exerciseHowTo[0],
      `Box 1 in ${key} minor has the first finger on fret ${box}; over ${five} the hand sits a fret lower, at fret ${box - 1}.`,
      `Bars 1 to 4, over ${one}: ${root}, ${third}, ${fourth}, ${fifth} and ${seventh} held, from the D string (fret ${box + 2}) up to the B string (fret ${box + 3}); then ${fifth} held; the first phrase again; then ${fifth}, ${fourth}, ${third}, ${fourth} and ${root} held (D string, fret ${box + 2}).`,
      `Bars 5 and 6, over ${four}: the first phrase with ${sixth} where ${fifth} was (B string, fret ${box + 1}), ending on ${root} held on the top string (fret ${box}); then ${sixth} held. Bars 7 and 8, back on ${one}: ${root}, ${seventh}, ${fifth}, ${fourth} and ${third} held (G string, fret ${box}), then ${root} held.`,
      `Bars 9 to 11 are the first three bars of the turn from the last Exercise, ${lower}: ${leading} held over ${five} (D string, fret ${box + 1}), ${sixth} held over ${four} (B string, fret ${box + 1}), ${root} held over ${one} (D string, fret ${box + 2}). Bar 12: ${fifth} held over the last ${five} (A string, fret ${box + 2}).`,
    ],
  };
}

/** A written line in D minor, moved to other minor keys by frets. The chart and the band move with it. */
function minorKeys(
  tab: string,
  chart: string,
  shifts: Readonly<Record<string, number>>,
  words: (key: string) => Pick<VariantBuild, "purpose" | "howTo"> = () => ({}),
) {
  return {
    values: { key: Object.keys(shifts) },
    pooled: ["key"] as const,
    label: (p: VariantParams) => `In ${p.key} minor`,
    build: (p: VariantParams) => {
      const shift = shifts[p.key];
      const moved = shiftFrets(tab, shift);
      return {
        tab: moved,
        position: handAt(moved),
        shifts: true,
        chords: moveChart(chart, shift),
        jam: minorIn(p.key),
        harmony: {
          scaleOverChords: [p.key, "naturalMinor"] as [string, string],
          allowed: [moveChart("C#", shift).trim()],
        },
        ...words(p.key),
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Three choruses in E: the nut, the twelfth fret, and the way between them.
// ---------------------------------------------------------------------------

// The four notes that open the solo, and open its last chorus: E, G, A, B.
const E_OPENING = "/8 6:0 6:3 /4 5:0 /2 5:2";

// Chorus 1: the three low strings at the nut, and three empty bars.
const E_LOW = [
  E_OPENING,
  "/1 r",
  "/8 6:0 6:3 /4 5:2 /2 4:2",
  "/1 r",
  "/8 5:0 5:2 /4 4:0 /2 4:2",
  "/1 r",
  "/4 4:2 /8 4:0 5:2 /2 6:0",
  "/2 r /4 r /8 5:0 5:1",
  "/2 5:2 /2 r",
  "/4 5:0 /8 4:0 5:2 /2 5:0",
  "/8 4:2 4:0 5:2 6:3 /2 6:0",
  "/2 5:2 /2 r",
].join(" | ");

// Chorus 2: box 1 at the twelfth fret. One phrase, said again, lifted over A7, answered over B7 and A7.
const E_PHRASE = "/8 2:12 2:15 1:12 2:15 /4 2:12 3:14";
const E_PHRASE_END = "/2 4:14 /4 r /8 3:12 3:14";
const E_TWELFTH = [
  E_PHRASE,
  E_PHRASE_END,
  E_PHRASE,
  "/2 2:15 /2 r",
  "/8 1:12 1:15 1:12 2:15 /4 2:12 3:14",
  "/2 3:12 /2 r",
  E_PHRASE,
  E_PHRASE_END,
  "/8 2:12 3:14 2:12 2:15 /2 2:12",
  "/8 3:14 3:12 3:14 2:12 /2 3:14",
  "/8 2:12 3:14 3:12 3:14 /2 4:14",
  "/2 5:14 /2 r",
].join(" | ");

// Chorus 3: the opening again, the same notes an octave up, then the walk up the
// top string (the hand moves on the first finger: fret 5, then fret 10 slid to 12),
// a bend to the root of B7, a bend to the root of A7, and the high E.
// Fingers are printed at the nut (second on fret 2, third on fret 3, as in
// chorus 1) because a hand that may shift would otherwise creep up a fret there.
const E_CLIMB = [
  E_OPENING,
  "/8 4:2f2 3:0 /4 3:2f2 /2 2:0",
  "/8 2:3f3 2:0 3:2f2 3:0 /2 4:2f2",
  "/2 r /4 r /8 4:2f2 3:0",
  "/8 3:2f2 2:0 2:3f3 2:0 /2 3:2f2",
  "/8 1:0 1:3f3 1:0 2:3f3 /2 1:0",
  "/4 1:0 1:3f3 1:5f1 1:7f3",
  "/4 1:10sf1 1:12f1 /8 2:15 2:12 /4 3:14",
  "/2 3:14b2v /4 r /8 2:12 2:15",
  "/4 1:12 /2 1:15b2vf3 /8 1:15f3 1:12",
  "/8 2:15 2:12 3:14 2:12 /2 1:12",
  "/1 r",
].join(" | ");

/** Intermediate, after the minor blues in A minor: the same lesson in D minor. */
export const MINOR_BLUES_IN_D: StepSpec = {
  id: "minor-blues-in-d",
  title: "The minor blues in D minor",
  goal: "Play the minor blues in a second key: Dm7, Gm7 and A7 with box 1 at the tenth fret, the B flat that Gm7 asks for, the C# that A7 asks for, and a written chorus.",
  why: "In A minor you found three things. The box fits the first chord. The second chord wants a note the box does not have. The last chord, the one that turns the form round, wants another. All three are true again in D minor, with new names: the chords are Dm7, Gm7 and A7, the note the box lacks over Gm7 is B flat, and the note that makes A7 pull back to Dm7 is C#. Nothing here is a new idea. The Step is here so that the lesson belongs to the minor blues, and not to the fifth fret.",
  howTo: [
    "The form is the one you know: four bars of Dm7, two of Gm7, two of Dm7, then A7, Gm7, Dm7 and A7.",
    "D minor pentatonic is D, F, G, A, C. Box 1 has the first finger on fret 10: frets 10 and 13 on the two E strings and the B string, frets 10 and 12 on the A, D and G strings.",
    "Dm7 is D, F, A, C: all in the box. Gm7 is G, B flat, D, F: B flat is at fret 11 on the B string, one fret above the box's A, and at fret 13 on the A string. A7 is A, C#, E, G: C# is at fret 11 on the D string, and E is at fret 9 on the G string, one fret below the box.",
    "Over Gm7, play B flat where you would have played A. Over Dm7, go back to A. For a line over A7 that comes down to E and C#, let the hand sit one fret lower, first finger on fret 9, and bring it back to fret 10 afterwards.",
    "The band is slow. Leave the long notes long.",
  ],
  payoff: "A slow minor chorus in a second key, where the B flat arrives with the Gm7 and the C# with the A7.",
  exercises: [
    {
      id: "dm7-gm7",
      title: "Dm7 and Gm7 at the tenth fret",
      purpose: "Each chord as an arpeggio, then one short phrase played twice: with A over Dm7, and with B flat in its place over Gm7. Two bars on each chord.",
      howTo: [
        "Shuffle eighths and half notes, 50 BPM up to a pass at 70.",
        "Bar 1, Dm7: D on the D string (fret 12), F on the G string (fret 10), A and C on the B string (frets 10 and 13), D and F on the top string (frets 10 and 13), then back through D to C. Bar 2: A, G, F, G, and A held (B string, fret 10).",
        "Bar 3, Gm7 up from its root: G and B flat on the A string (frets 10 and 13), D on the D string (fret 12), F and G on the G string (frets 10 and 12), B flat on the B string (fret 11), D and F on the top string (frets 10 and 13). Bar 4 is bar 2 with B flat where A was: B flat, G, F, G, and B flat held (B string, fret 11).",
        "First finger on fret 10, third finger on fret 12, fourth finger on fret 13. The B flat at fret 11 on the B string is the second finger's.",
      ],
      coach: "Two arpeggios, and one phrase in two versions. Notes and the shuffle after the take.",
      tab: swing(DM_ARPS),
      position: 10,
      chords: "Dm7 | Dm7 | Gm7 | Gm7",
      jam: minorIn("D"),
      harmony: { scaleOverChords: ["D", "naturalMinor"] },
      rungs: ladder(50, 90, 10),
      passAt: 70,
      ...lick("slow"),
      minutes: 5,
    },
    {
      id: "d-minor-turn",
      title: "A7, Gm7, Dm7, A7",
      purpose: "The last four bars of the form in D minor, where every chord has its own note: C# over A7, B flat over Gm7, D over Dm7, and the three notes of the A chord to end.",
      howTo: [
        "Shuffle eighths, quarter notes and half notes, 50 BPM up to a pass at 70.",
        "Bar 1, over A7: A (B string, fret 10), then G, F and E down the G string (frets 12, 10 and 9), and C# held (D string, fret 11). Over A7, in this bar and in bar 4, the hand sits a fret lower. With the first finger on fret 9, the second finger takes A and F at fret 10, the fourth finger G at fret 12, the first finger E and the third finger C#.",
        "Bar 2, over Gm7: B flat (B string, fret 11), then D, F, D on the top string (frets 10, 13, 10), and B flat held. Bar 3, over Dm7: A, C, A on the B string (frets 10, 13, 10), F (G string, fret 10), and D held (D string, fret 12).",
        "Bar 4, over A7: A (A string, fret 12) and C# (D string, fret 11) as quarter notes, then E held (G string, fret 9): fourth finger, third finger, first finger. A, C# and E are the A major chord.",
      ],
      coach: "Four bars, three chords. Notes and the shuffle after the take.",
      tab: swing(DM_TURN),
      position: 9,
      shifts: true,
      chords: "A7 | Gm7 | Dm7 | A7",
      jam: minorIn("D"),
      harmony: { scaleOverChords: ["D", "naturalMinor"], allowed: ["C#"] },
      rungs: ladder(50, 90, 10),
      passAt: 70,
      ...lick("slow"),
      minutes: 5,
    },
    {
      id: "d-minor-chorus",
      title: "A written minor chorus in a new key",
      purpose: "All twelve bars of a minor blues in D minor: a phrase said twice over Dm7, said again with B flat over Gm7, and brought home through the turn you just learned.",
      howTo: [
        "Shuffle eighths and half notes, 50 BPM up to a pass at 70.",
        "Bars 1 to 4, over Dm7: D, F, G, A and C held, from the D string (fret 12) up to the B string (fret 13); then A held; the first phrase again; then A, G, F, G and D held (D string, fret 12).",
        "Bars 5 and 6, over Gm7: the first phrase with B flat where A was (B string, fret 11), ending on D held on the top string (fret 10); then B flat held. Bars 7 and 8, back on Dm7: D, C, A, G and F held (G string, fret 10), then D held.",
        "Bars 9 to 11 are the first three bars of the turn from the last Exercise: C# held over A7, B flat held over Gm7, D held over Dm7. Bar 12: A held over the last A7 (A string, fret 12).",
        VARIANT_NOTE,
      ],
      coach: "Twelve written bars, slow, in a key that changes from day to day. Notes and the shuffle after the take.",
      vary: minorKeys(swing(DM_CHORUS), MINOR_TWELVE_D, { D: 0, C: -2, G: -7 }, chorusWords),
      tab: swing(DM_CHORUS),
      position: 10,
      shifts: true,
      chords: MINOR_TWELVE_D,
      jam: minorIn("D"),
      harmony: { scaleOverChords: ["D", "naturalMinor"], allowed: ["C#"] },
      rungs: ladder(50, 90, 10),
      passAt: 70,
      ...lick("slow", 8),
      minutes: 6,
    },
    {
      id: "your-d-minor-turn",
      title: "Your turn: a note for each chord",
      purpose: "Free playing over Dm7, Gm7, Dm7 and A7 with one rule for each chord: A while the band is on Dm7, B flat while it is on Gm7, C# while it is on A7.",
      howTo: [
        "Shuffle, 50 to 70 BPM, four bars that loop: Dm7, Gm7, Dm7, A7.",
        "Play as little as you like. One long note in each bar, the one that bar's chord asks for, is a complete answer. The written line is an example.",
        NOT_CHECKED_YET,
      ],
      coach: "Not checked yet. Record it and listen for each note arriving with its chord.",
      tab: swing(DM_EXAMPLE),
      position: 10,
      shifts: true,
      chords: "Dm7 | Gm7 | Dm7 | A7",
      jam: minorIn("D"),
      rungs: ladder(50, 70, 5),
      ...YOUR_TURN,
      selfCheck: [
        "Did you play B flat over the Gm7 and C# over the A7, at least once each?",
        "Did you go back to A when the band went back to Dm7?",
      ],
      minutes: 4,
    },
  ],
};

/** Advanced, after the three-chorus solo in A: the same idea in E, ending high. */
export const THREE_CHORUSES_IN_E: StepSpec = {
  id: "three-choruses-in-e",
  title: "A three-chorus solo in E",
  goal: "Play three written choruses in E that make one solo: a sparse one at the nut, one in the box at the twelfth fret, and one that climbs from the nut to the twelfth fret and ends high. Then play three of your own.",
  why: "The solo in A started low, built, peaked and came home. This one has the same parts in another key, and it ends at the top. E gives the idea more room than A did, because here the box sits in two places an octave apart: at the nut, where the open strings do the first finger's job, and at the twelfth fret, where the same shape starts again. The first chorus uses the low one, the second the high one, and the third walks from one to the other. Almost everything in it is something you have played: the box at the nut, box 1 at the twelfth fret, a slide up the top string, a bend at the top of the box. The one new thing is the walk up the top string that joins the two.",
  howTo: [
    "The form in E: four bars of E7, two of A7, two of E7, then B7, A7, E7 and B7.",
    "Chorus 1 stays at the nut, on the three low strings, and leaves whole bars empty. Second finger on fret 2, third finger on fret 3, and the first finger for the one B flat at fret 1.",
    "Chorus 2 is in box 1 at the twelfth fret: first finger on fret 12, third finger on fret 14, fourth finger on fret 15. It is the box at the nut, twelve frets higher.",
    "Chorus 3 starts at the nut with the phrase that opened chorus 1, walks up the top string in bars 7 and 8, bends twice in the box at the twelfth fret, and ends on the high E.",
    "At the nut an open string rings until something stops it. Rest the side of the picking hand on a string once you have left it.",
    "Learn the choruses one at a time. When you play all three, let the low chorus also be the quiet one.",
  ],
  payoff: "Thirty-six bars in E that start at the nut, quiet and sparse, and end at the top of the neck.",
  difficultyException:
    "The same tempo and the same kind of lines as the solo in A before it, so the note rate does not rise. The new demand is a second key whose box sits in two places twelve frets apart, open strings to keep quiet, and a climb from one place to the other, which the rate does not count.",
  exercises: [
    {
      id: "e-chorus-low",
      title: "Chorus 1 in E: sparse, at the nut",
      purpose: "Twelve bars on the three low strings at the nut: four short phrases with an empty bar after each of the first three, a step up through B flat to the B7, and a walk down to the open low E.",
      howTo: [
        "Shuffle eighths, quarter notes and half notes, 60 BPM up to a pass at 80.",
        "Bar 1: the open low E and G (fret 3) as a long-short pair, the open A string for a beat, and B held (A string, fret 2). Bar 3 starts with the same pair, then B for a beat, and E held (D string, fret 2). Bars 2, 4 and 6 are empty.",
        "Bar 5, over A7: the open A and B (fret 2) as a pair, the open D string for a beat, and E held (D string, fret 2). Bar 7 comes back down: E for a beat, the open D, then B (A string, fret 2), and the open low E held.",
        "Bar 8 is empty until beat 4, where the open A and B flat (A string, fret 1) lead up to B, held over the B7 in bar 9. Bar 10, over A7: the open A for a beat, the open D, then B (A string, fret 2), and the open A held.",
        "Bar 11 walks down: E (D string, fret 2), the open D, B, G (low E string, fret 3), and the open low E held. Bar 12: B held.",
        "In bars 7, 10 and 11 the open D is followed by B on the A string. Let the finger that frets the B lean on the D string, so the two do not ring together.",
        "Rest where it rests. A note played in an empty bar counts as an extra note. A string left ringing into one is not checked, so stopping the open strings is for your ear.",
      ],
      coach: "Few notes, and open strings that ring if you let them. Notes and the shuffle after the take.",
      tab: swing(E_LOW),
      position: 1,
      chords: TWELVE_E,
      jam: TEXAS_E,
      harmony: { scaleOverChords: ["E", "blues"] },
      rungs: ladder(60, 100, 5),
      passAt: 80,
      ...lick("shuffle", 12),
      minutes: 6,
    },
    {
      id: "e-chorus-twelfth",
      title: "Chorus 2 in E: the box at the twelfth fret",
      purpose: "Twelve bars in box 1 at the twelfth fret, with no empty bars: one phrase said three times over E7, started from the top string over A7, and answered over B7 and A7.",
      howTo: [
        "Shuffle eighths, quarter notes and half notes, 60 BPM up to a pass at 80.",
        "The phrase, in bars 1, 3 and 7: B, D, E, D as shuffle eighths (B string frets 12 and 15, top string fret 12, B string fret 15), then B and A as quarter notes (B string fret 12, G string fret 14). First finger on fret 12, third finger on fret 14, fourth finger on fret 15.",
        "Bar 2 answers with E held (D string, fret 14), and on beat 4 G and A on the G string (frets 12 and 14) lead back into the phrase. Bar 4: D held (B string, fret 15). Bar 8 is bar 2 again, and this time the G and A lead to the B of bar 9.",
        "Bar 5, over A7, starts the phrase from the top string: E, G, E, D, then B and A as before. Bar 6: G held (G string, fret 12).",
        "Bar 9, over B7: B, A, B, D and B held. Bar 10, over A7: A, G, A, B and A held. Bar 11: B, A, G, A and E held (D string, fret 14). Bar 12: B held (A string, fret 14).",
      ],
      coach: "One phrase carries most of this chorus. Notes and the shuffle after the take.",
      tab: swing(E_TWELFTH),
      position: 12,
      chords: TWELVE_E,
      jam: TEXAS_E,
      harmony: { scaleOverChords: ["E", "minorPentatonic"] },
      rungs: ladder(60, 100, 5),
      passAt: 80,
      ...lick("shuffle", 12),
      minutes: 6,
    },
    {
      id: "e-chorus-climb",
      title: "Chorus 3 in E: the climb, and the top",
      purpose: "Twelve bars that begin at the nut with the phrase that opened chorus 1, walk up the top string to the twelfth fret, bend up to B over the B7 and up to A over the A7, and end on the high E.",
      howTo: [
        "Shuffle eighths, quarter notes and half notes, 60 BPM up to a pass at 80.",
        "Bar 1 is bar 1 of chorus 1: the open low E and G, the open A, and B held. Bar 2 is the same four notes an octave higher: E on the D string (fret 2) and the open G as a pair, A for a beat (G string, fret 2), and the open B string held.",
        "Bar 3 comes down: D (B string, fret 3), the open B, A (G string, fret 2), the open G, and E held (D string, fret 2). Bar 4 is empty until beat 4, where E and the open G lead to A in bar 5.",
        "Bar 5, over A7: A (G string, fret 2), the open B, D (B string, fret 3), the open B again, and A held. Bar 6: the open top E, G (fret 3), the open E, D (B string, fret 3), and the open top E held.",
        "Bars 7 and 8 are the climb, in quarter notes on the top string: open, fret 3 (third finger), fret 5 (first finger), fret 7 (third finger), then fret 10 slid up to fret 12 with the first finger. Pick the first note of the slide only. The first finger leads each move: to fret 5, to fret 10, and along the string to fret 12, which puts the hand in the box at the twelfth fret. Bar 8 goes on from that E: D and B on the B string (frets 15 and 12), and A for a beat (G string, fret 14).",
        "Bar 9, over B7: bend that A at fret 14 on the G string up a whole step to B with the third finger and hold it with vibrato for two beats, rest for a beat, then B and D on the B string (frets 12 and 15). Bar 10, over A7: E for a beat (top string, fret 12), then bend G at fret 15 on the top string up a whole step to A and hold it for two beats. The third finger takes this bend too, reaching up a fret from fret 14, with the second finger behind it on the string to help push. That A is the highest note of the solo. On beat 4, G and E lead into bar 11.",
        "Bar 11: D, B, A, B and the high E held (top string, fret 12). Bar 12 is empty: the band plays the last bar alone.",
      ],
      coach: "Timed and counted. With bends in the line the notes are not pitch-checked, so both bends are for your ear.",
      tab: swing(E_CLIMB),
      position: 1,
      shifts: true,
      loops: false,
      chords: TWELVE_E,
      jam: TEXAS_E,
      harmony: { scaleOverChords: ["E", "minorPentatonic"] },
      rungs: ladder(60, 100, 5),
      passAt: 80,
      ...timedOnly("shuffle", 12),
      selfCheck: ["On a recording, does the first bend reach B and the second reach A, and do both stay there?"],
      minutes: 7,
    },
    {
      id: "your-three-choruses-in-e",
      title: "Your turn: three choruses in E, low to high",
      purpose: "Thirty-six bars of your own in E, three times round the form. Start at the nut with few notes, and end at the top of the neck.",
      howTo: [
        "Shuffle, 70 to 85 BPM, three choruses of twelve bars: about two minutes.",
        "The written line is the three choruses of this Step end to end, as an example. Use any of it, or none.",
        "A plan to start from: chorus 1 on the low strings at the nut with empty bars, chorus 2 in the box at the twelfth fret, chorus 3 back at the nut and then up the neck, with your highest note in its last four bars.",
        NOT_CHECKED_YET,
      ],
      coach: "Not checked yet. Record it, and listen for where the highest note falls.",
      tab: swing([E_LOW, E_TWELFTH, E_CLIMB].join(" | ")),
      position: 1,
      shifts: true,
      loops: false,
      chords: [TWELVE_E, TWELVE_E, TWELVE_E].join(" | "),
      jam: TEXAS_E,
      rungs: ladder(70, 85, 5),
      ...YOUR_TURN,
      selfCheck: [
        "Did you get through all 36 bars without losing the form?",
        "Was your first chorus the lowest and the sparsest?",
        "Did your highest note come in the last chorus, and did the solo end high?",
      ],
      minutes: 8,
    },
  ],
};
