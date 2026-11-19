/**
 * Rhythm Foundations: consolidation Steps (2026-11-19). Drafts, like the Path
 * they belong to.
 *
 * One Step a Level, and nothing new in the count. The Beginner Step takes
 * quarters, eighths and rests off the two low strings; the Intermediate Step
 * joins an off-beat note to a held one, the push; the Advanced Step plays the
 * Path's rhythms on two strings at once, as a two-note power chord, and hands
 * over to First Chords and Strumming and to Metal Rhythm. Every id is new, so
 * nobody's progress moves. Every line is original.
 *
 * The helpers are copies of the Path's own: importing them from
 * `rhythm-foundations.ts` would be a circular import.
 */
import type { ExerciseSpec, StepSpec, VariantParams } from "../spec";
import type { PassBar } from "../format";
import { ladder } from "../templates";

const E_PENT = { scale: ["E", "minorPentatonic"] as [string, string] };

/** Strokes follow the count, not the note before: taught in words, so the plan is free. */
const FREE = { pick: "free" } as const satisfies Partial<ExerciseSpec>;

/** Two strings struck together are one stroke: timed and counted, never pitch-checked (as Metal Rhythm grades them). */
const CHORDS = {
  grade: "timing",
  pass: [
    { metric: "timingEvenness", min: 0.85, overBars: 4 },
    { metric: "notesHeard", min: 0.9, overBars: 4 },
    { metric: "extraNotes", max: 4, overBars: 4 },
  ] as PassBar[],
} as const satisfies Partial<ExerciseSpec>;

const REST_CHECK = "In the rests, was the guitar silent, with no string left ringing?";
const COUNT_CHECK = "Could you count the beats out loud while you played it?";
const FOOT_CHECK = "Did your foot keep tapping the beat through the off-beat notes?";
const RING_CHECK = "Did each pushed note ring through the beat after it, while your foot tapped that beat?";
const BOTH_CHECK = "Did both strings of every chord sound, and no others?";

/** Said on every Exercise whose variants move the riff: the words name the first version's strings. */
const VARIANT_NOTE =
  "The strings and frets here are for the first version. Other Takes play the same rhythm on another set of strings.";

/** E minor pentatonic in open position: the fretted note of each string, lowest string first. */
const PAIRS: Readonly<Record<string, readonly string[]>> = {
  "low E and A": ["6:3", "5:2"],
  "A and D": ["5:2", "4:2"],
  "D and G": ["4:2", "3:2"],
};
const HIGH_PAIRS: Readonly<Record<string, readonly string[]>> = {
  "D and G": ["4:2", "3:2"],
  "G and B": ["3:2", "2:3"],
  "B and top E": ["2:3", "1:3"],
};
/** The pairs whose two fretted notes share a fret: a riff written on one says its frets truly on the other. */
const LEVEL_PAIRS: Readonly<Record<string, readonly string[]>> = {
  "D and G": HIGH_PAIRS["D and G"],
  "B and top E": HIGH_PAIRS["B and top E"],
};
// No "G, B and top E" here: fret 2 of the written riff would be fret 2 on one string and fret 3 on another,
// and a variant's words could not say which fret each note is at.
const THREES: Readonly<Record<string, readonly string[]>> = {
  "D, G and B": ["4:2", "3:2", "2:3"],
  "A, D and G": ["5:2", "4:2", "3:2"],
};

/**
 * A riff written with `L`, `M` and `H` for the lowest, middle and highest
 * string of a set (`L` and `H` for a pair): `L0` open, `Lx` its fretted note.
 * `first` is the set the Exercise's own notes and words are on.
 */
function onSets(riff: string, sets: Readonly<Record<string, readonly string[]>>, first: string) {
  const build = (set: string) => {
    const fretted = sets[set];
    const slots = fretted.length === 2 ? ["L", "H"] : ["L", "M", "H"];
    return slots.reduce(
      (tab, slot, i) => tab.replace(new RegExp(`${slot}0`, "g"), `${fretted[i][0]}:0`).replace(new RegExp(`${slot}x`, "g"), fretted[i]),
      riff,
    );
  };
  return {
    base: build(first),
    vary: {
      values: { stringSet: [first, ...Object.keys(sets).filter((set) => set !== first)] },
      pooled: ["stringSet"] as const,
      label: (p: VariantParams) => `${p.stringSet} strings`,
      build: (p: VariantParams) => ({ tab: build(p.stringSet), position: 1 }),
    },
  };
}

// --- Beginner: the same rhythms on other strings -----------------------------------

const DG_RIFF = onSets(`/4 L0 Lx /8 H0 H0 /4 Hx | /8 H0 Hx H0 L0 /2 Lx`, LEVEL_PAIRS, "D and G");
const GB_RIFF = onSets(`/4 L0 /8 Lx H0 /4 Hx /8 H0 Lx | /8 L0 L0 Lx L0 H0 Hx /4 H0`, HIGH_PAIRS, "G and B");
const DG_STOPS = onSets(`/4 Lx r /8 L0 L0 /4 H0 | /8 Hx H0 /4 Lx r L0`, LEVEL_PAIRS, "D and G");
const THREE_STRINGS = onSets(
  `/4 L0 Lx /8 M0 Mx /4 H0 | /8 Hx H0 Mx M0 /4 Lx r | /4 L0 /8 Lx Lx /4 M0 /8 Mx Mx | /8 H0 Hx /4 H0 /8 Mx M0 /4 Lx`,
  THREES,
  "D, G and B",
);

/** Beginner, last: quarters, eighths and rests leave the two low strings. */
export const OTHER_STRINGS: StepSpec = {
  id: "other-strings",
  title: "The same rhythms on other strings",
  goal: "Play quarters, eighths and rests on the D and G strings and on the G and B strings, and in one riff that crosses three strings, as steadily as on the low strings.",
  why: "Nearly everything so far has been written on the two lowest strings. The rhythms do not belong to those strings: the count, the foot and the swing of the picking hand are the same anywhere on the guitar. What changes is the feel under the pick. The higher strings are thinner and give way more easily, so it is easy to hit them too hard and to rush. Nothing in the rhythm is new here, on purpose.",
  howTo: [
    "The same five notes carry on across the strings. On the D and G strings the fretted note is at fret 2, under the second finger. On the B and top E strings it is at fret 3, under the third finger.",
    "Count out loud before you play, as in the Steps before: '1, 2, 3, 4' for quarter notes and '1 and 2 and' for eighths. Down on the beat, up on the 'and'.",
    "Use a lighter stroke than on the low E string, keep the foot tapping, and count through every rest.",
  ],
  payoff: "A four-bar riff across the D, G and B strings with quarters, eighths and a rest in it, as steady as the riffs on the low strings.",
  exercises: [
    {
      id: "d-and-g",
      title: "Quarters and eighths, higher up",
      purpose: "A two-bar riff on the D and G strings: quarter notes, a pair of eighths, a run of four eighths and a half note to end. The rhythms are the ones you already know; only the strings are new.",
      howTo: [
        "Count '1, 2, 3 and, 4', then '1 and 2 and, 3, 4'. The note on 3 is a half note: let it ring while you say 4.",
        "Bar 1: the open D string, E at fret 2, the open G string twice, A at fret 2. Bar 2: the open G string, A, the open G string, the open D string, then E held.",
        "Down on every beat, up on each 'and'. One finger to a fret, as before: the second finger at fret 2.",
        VARIANT_NOTE,
      ],
      coach: "Timing against the click, and the right notes after the take. Counting out loud is yours to keep going.",
      vary: DG_RIFF.vary,
      tab: DG_RIFF.base,
      position: 1,
      harmony: E_PENT,
      rungs: ladder(50, 130, 10),
      passAt: 85,
      grade: "timingNotes",
      selfCheck: [COUNT_CHECK],
      minutes: 5,
    },
    {
      id: "g-and-b",
      title: "Long and short, higher up",
      purpose: "Long, short-short and a run of eighths on the G and B strings. The fretted note on the G string is at fret 2. On the B string it is at fret 3.",
      howTo: [
        "Count '1, 2 and, 3, 4 and', then '1 and 2 and 3 and, 4'.",
        "Bar 1: the open G string, A at fret 2, the open B string. Then D at fret 3 on the B string, the open B string, and A again. Bar 2: the open G string twice, A, the open G string, the open B string, D, and the open B string on beat 4.",
        "On each quarter note the hand still swings up and passes over the string without touching it. Second finger at fret 2, third finger at fret 3.",
        VARIANT_NOTE,
      ],
      coach: "Timing against the click, and the right notes after the take. Keeping each upstroke as loud as the downstroke before it is yours to hear.",
      vary: GB_RIFF.vary,
      tab: GB_RIFF.base,
      position: 1,
      harmony: E_PENT,
      rungs: ladder(50, 130, 10),
      passAt: 85,
      grade: "timingNotes",
      minutes: 5,
    },
    {
      id: "stops-higher-up",
      title: "Stops, higher up",
      purpose: "Two bars on the D and G strings with one beat of silence in each: beat 2 of the first bar and beat 3 of the second. The rest moves, so it has to be counted.",
      howTo: [
        "Count '1, (2), 3 and, 4', then '1 and, 2, (3), 4'. Say the rests as loudly as the notes.",
        "Bar 1: E at fret 2 on the D string, a rest, the open D string twice, the open G string. Bar 2: A at fret 2 on the G string, the open G string, E, a rest, the open D string.",
        "Both rests come straight after the E, a fretted note. Relax the fretting finger without lifting it off the string, and lay the side of the picking hand on the strings to stop any open string that is still ringing.",
        VARIANT_NOTE,
      ],
      coach: "The notes are timed and checked after the take. A note played in a rest counts as an extra note; a string left ringing is for your ear.",
      ...FREE,
      vary: DG_STOPS.vary,
      tab: DG_STOPS.base,
      position: 1,
      harmony: E_PENT,
      rungs: ladder(50, 130, 10),
      passAt: 85,
      grade: "timingNotes",
      selfCheck: [REST_CHECK],
      minutes: 5,
    },
    {
      id: "three-strings",
      title: "A riff across three strings",
      purpose: "Four bars on the D, G and B strings, each bar with its own rhythm from earlier in the Level: quarters with a pair of eighths, a run that stops, long short-short, and a mix to finish.",
      howTo: [
        "Count each bar before you play it: '1, 2, 3 and, 4', then '1 and 2 and, 3, (4)', then '1, 2 and, 3, 4 and', then '1 and, 2, 3 and, 4'.",
        "Bar 1 climbs: the open D string, E at fret 2, the open G string, A at fret 2, the open B string. Bar 2 starts on the B string, on D at fret 3. Then it comes down: the open B string, A, the open G string, E on beat 3, and a rest on beat 4.",
        "Bar 3 climbs again: the open D string, E at fret 2 twice, the open G string, A at fret 2 twice. Bar 4 comes back down: the open B string, D at fret 3, the open B string. Then A, the open G string, and E on beat 4.",
        "Second finger at fret 2, third finger at fret 3. The hand does not move.",
        VARIANT_NOTE,
      ],
      coach: "This is the Step's test piece. Timing against the click, and the right notes after the take.",
      ...FREE,
      vary: THREE_STRINGS.vary,
      tab: THREE_STRINGS.base,
      position: 1,
      harmony: E_PENT,
      rungs: ladder(50, 130, 10),
      passAt: 85,
      grade: "timingNotes",
      selfCheck: [COUNT_CHECK],
      minutes: 6,
    },
  ],
};

// --- Intermediate: the push -----------------------------------------------------------

// No riff here goes straight from one string's fretted note to the other's: on the pairs where both are
// at fret 2 that would be one finger hopping strings with no time to do it.
// Inside a bar a held note is written at its true length. Across a bar line nothing can be
// tied, so the pushed note is an eighth with the let-ring mark and the next bar opens on a rest.
const PUSH_INSIDE = onSets(`/4 L0 /8 Lx /4. H0 /4 Hx | /4 H0 /8 L0 /4. Lx /4 H0`, PAIRS, "low E and A");
const PUSH_ACROSS = onSets(`/4 L0 Lx H0 /8 Hx H0l | /4 r Hx H0 Lx`, PAIRS, "low E and A");
const TWO_PUSHES = onSets(`/4 L0 /8 Lx Lx /4 H0 /8 H0 Hxl | /4 r /8 H0 /4. Lx /4 H0`, PAIRS, "low E and A");
const PUSH_RIFF = onSets(
  `/8 L0 L0 Lx L0 /4 H0 /8 Hx H0l | /4 r /8 Hx H0 /4 Lx H0 | /8 L0 L0 Lx L0 /4 H0 /8 H0 Lxl | /4 r /8 L0 /4. H0 /4 Hx`,
  PAIRS,
  "low E and A",
);

/** Intermediate, after the off-beats: an off-beat note that is held through the beat after it. */
export const THE_PUSH: StepSpec = {
  id: "the-push",
  title: "The push",
  goal: "Play a note on the 'and' and let it ring through the next beat, inside a bar and across a bar line, the line between two bars, while the foot taps that beat alone.",
  why: "A push is a note that arrives half a beat early. It belongs to the beat after it: the note for beat 1 is played on the 'and' of 4 and held, so nothing is struck on beat 1 at all. It makes a riff lean into the next bar. You have played notes on the 'and', and you have held a note across a beat; a push is both at once. You have played one already: the middle note of three, three, two. The place it goes wrong is the beat that is not played: with no stroke on it the count slips, and the next note comes early.",
  howTo: [
    "A pushed note is on an 'and', so it is an upstroke. On the beat after it the downstroke plays the air, the foot taps, and the note keeps ringing.",
    "Count the held beat in brackets and still say it: '4 and, (1), 2'. Until now a beat in brackets was silent. In this Step it is a beat with no stroke while a note rings, so don't stop the string on it.",
    "This tab cannot join two notes across a bar line. A push into the next bar is written as a note on the 'and' of 4 marked let ring, with a rest on beat 1 after it. Play it as one long note: that rest is the note still ringing, not silence.",
  ],
  payoff: "A four-bar riff that leans into its second and fourth bars, with the foot steady under every push.",
  exercises: [
    {
      id: "push-in-the-bar",
      title: "A push inside the bar",
      purpose: "A note on the 'and' of 2, held through beat 3: the push in its smallest form. Beat 3 is not played; the note before it is still ringing.",
      howTo: [
        "Count '1, 2 AND, (3), 4'. Down on 1 and on 2, up on the 'and' of 2, miss the string on 3, down on 4.",
        "Bar 1: the open low E string, G at fret 3, then the open A string on the 'and' of 2, held through beat 3. B at fret 2 on the A string is on beat 4. Bar 2: the open A string, the open low E string, then G pushed and held through beat 3, and the open A string on beat 4.",
        "Tap the foot on beat 3 while the pushed note rings. In bar 2 the pushed note is a fretted one: keep the finger down on it through the beat.",
        VARIANT_NOTE,
      ],
      coach: "The note on the 'and' of 2 is the one that drifts onto beat 3. Timing against the click, and the right notes after the take.",
      ...FREE,
      vary: PUSH_INSIDE.vary,
      tab: PUSH_INSIDE.base,
      position: 1,
      harmony: E_PENT,
      rungs: ladder(50, 130, 10),
      passAt: 90,
      grade: "timingNotes",
      selfCheck: [RING_CHECK],
      minutes: 5,
    },
    {
      id: "push-over-the-line",
      title: "A push across the bar line",
      purpose: "The note for beat 1 of bar 2 comes half a beat early, on the 'and' of 4, and rings across the bar line. Nothing is played on that beat 1.",
      howTo: [
        "Count '1, 2, 3, 4 AND, (1), 2, 3, 4'. The 'and' of 4 is an upstroke; on the next beat 1 the hand comes down past the string and the foot taps alone.",
        "Bar 1: the open low E string, G at fret 3, the open A string. Then B at fret 2 on the A string on beat 4, and the open A string again on the 'and' of 4. That last note rings through beat 1 of bar 2. Beats 2, 3 and 4 of bar 2 are B, the open A string and G.",
        "The rest written on beat 1 of bar 2 is the pushed note carrying on. Don't stop the string there.",
        VARIANT_NOTE,
      ],
      coach: "The first note after the push, on beat 2, is where the time slips: early is the usual mistake. Each note is timed against the click; which note it was is not checked here. Whether the pushed note rang on is yours to hear.",
      ...FREE,
      vary: PUSH_ACROSS.vary,
      tab: PUSH_ACROSS.base,
      position: 1,
      harmony: E_PENT,
      rungs: ladder(50, 130, 10),
      passAt: 90,
      grade: "timing",
      selfCheck: [RING_CHECK],
      minutes: 5,
    },
    {
      id: "two-pushes",
      title: "Both pushes, one after the other",
      purpose: "A push across the bar line and, straight after it, a push inside the bar. In bar 2 neither beat 1 nor beat 3 is played: each has a note ringing through it.",
      howTo: [
        "Count '1, 2 and, 3, 4 AND, (1), 2 AND, (3), 4'.",
        "Bar 1: the open low E string, G at fret 3 twice, the open A string on beat 3 and again on beat 4. Then B at fret 2 on the A string on the 'and' of 4. Keep the finger down on the B: it rings through beat 1 of bar 2.",
        "Bar 2: the open A string on beat 2, G at fret 3 on the low E string on the 'and' of 2, held through beat 3, and the open A string again on beat 4.",
        "Both pushed notes are upstrokes. The foot taps every beat, and the two beats with no stroke are the ones to listen for.",
        "The rest written on beat 1 after a push is the pushed note still ringing. Don't stop the string there.",
        VARIANT_NOTE,
      ],
      coach: "Each note is timed against the click; which note it was is not checked here. Whether the pushed notes rang on is yours to hear.",
      ...FREE,
      vary: TWO_PUSHES.vary,
      tab: TWO_PUSHES.base,
      position: 1,
      harmony: E_PENT,
      rungs: ladder(50, 130, 10),
      passAt: 85,
      grade: "timing",
      selfCheck: [RING_CHECK, FOOT_CHECK],
      minutes: 6,
    },
    {
      id: "push-riff",
      title: "A riff with pushes",
      purpose: "Four bars on two strings. Bars 1 and 3 run in eighths and end with a push into the next bar; bar 4 answers with a push inside the bar.",
      howTo: [
        "Bars 1 and 3: count '1 and 2 and, 3, 4 AND'. Bar 2: '(1), 2 and, 3, 4'. Bar 4: '(1), 2 AND, (3), 4'.",
        "The push into bar 2 is the open A string. The push into bar 4 is G at fret 3 on the low E string: keep the finger down through beat 1.",
        "In bar 4 the open low E string is on beat 2, the open A string on the 'and' of 2 is held through beat 3, and B at fret 2 on the A string ends the riff on beat 4.",
        "The rest written on beat 1 after a push is the pushed note still ringing. Don't stop the string there.",
        "The hand swings in eighths from start to finish. Learn it at the first rung with the count out loud.",
        VARIANT_NOTE,
      ],
      coach: "This is the Step's test piece. Each note is timed against the click; which note it was is not checked here. Whether the pushed notes rang on is yours to hear.",
      ...FREE,
      vary: PUSH_RIFF.vary,
      tab: PUSH_RIFF.base,
      position: 1,
      harmony: E_PENT,
      rungs: ladder(50, 130, 10),
      passAt: 85,
      grade: "timing",
      selfCheck: [RING_CHECK, FOOT_CHECK],
      minutes: 7,
    },
  ],
};

// --- Advanced: rhythm on two strings at once ------------------------------------------

// A two-note power chord with an open root: the open string and fret 2 of the next string, first finger.
const E5 = "6:0+5:2f1";
const A5 = "5:0+4:2f1";

/** A chord figure written with `C` for one chord, on each pair of strings that has the shape. */
function onChords(figure: string) {
  const ROOTS: Readonly<Record<string, [chord: string, name: string]>> = {
    "low E and A": [E5, "E5"],
    "A and D": [A5, "A5"],
    "D and G": ["4:0+3:2f1", "D5"],
  };
  const bars = figure.split("|").length;
  const build = (set: string) => figure.replace(/C/g, ROOTS[set][0]);
  const chart = (set: string) => Array.from({ length: bars }, () => ROOTS[set][1]).join(" | ");
  return {
    base: build("low E and A"),
    chords: chart("low E and A"),
    vary: {
      values: { stringSet: Object.keys(ROOTS) },
      pooled: ["stringSet"] as const,
      label: (p: VariantParams) => `${p.stringSet} strings`,
      build: (p: VariantParams) => ({ tab: build(p.stringSet), position: 2, chords: chart(p.stringSet) }),
    },
  };
}

const CHORD_EIGHTHS = onChords(`/4 C C C C | /8 C C C C C C /4 C`);
const CHORD_LONG_SHORT = onChords(`/4 C /8 C C /4 C /8 C C | /8 C /16 C C /8 C /16 C C /8 C /16 C C /4 C`);
const CHORD_SYNC = onChords(`/8 C C r C r C C r | /8 C C r C r C /4 C`);

// E for a bar, A for a bar, and round again: `X` is the lower chord, `Y` the one a string higher.
const TWO_CHORD_FIGURE = `/4 X /8 X X r X /4 X | /4 Y /8 Y Y r Y /4 Y | /8 X X r X r X /4 X | /8 Y Y Y Y /2 Y`;
const twoChords = (low: string, high: string) => TWO_CHORD_FIGURE.replace(/X/g, low).replace(/Y/g, high);
const TWO_CHORD_SETS: Readonly<Record<string, { tab: string; chords: string }>> = {
  "low E, A and D": { tab: twoChords(E5, A5), chords: "E5 | A5 | E5 | A5" },
  "A, D and G": { tab: twoChords(A5, "4:0+3:2f1"), chords: "A5 | D5 | A5 | D5" },
};

/** Advanced, before the band: the Path's rhythms with two strings under every stroke. */
export const TWO_STRINGS_AT_ONCE: StepSpec = {
  id: "two-strings-at-once",
  title: "Rhythm on two strings at once",
  goal: "Play eighths, the long, short-short figure and a syncopated bar as a two-note power chord, and change between two chords in time.",
  why: "Until now every stroke has hit one string. A rhythm part is often more than one string at a time, and the smallest step in that direction is two: an open string and the note at fret 2 on the next string, which together make a power chord. The rhythms are ones you can already play. What is new is that the pick travels through two strings on the way down and the same two on the way up, and that both have to stop together in a rest.",
  howTo: [
    "The E power chord is the open low E string and fret 2 of the A string. The A power chord is the open A string and fret 2 of the D string. On other Takes there is a third, the D power chord: the open D string and fret 2 of the G string.",
    "Until now the second finger played fret 2. For these chords use the first: it can lean lightly on the thinner strings beside it to keep them quiet, and it is the finger power chords use later. It hops one string across to change chord.",
    "Aim the pick at the two strings of the chord only.",
    "The hand swings as it always has: down on the beat, up on the 'and'. Each stroke is one short movement through both strings, so they sound as one.",
    "In a rest, stop both strings at once: relax the first finger and lay the side of the picking hand on the strings.",
  ],
  payoff: "A four-bar riff on two power chords. From here, full chords are the First Chords and Strumming Path, and heavier riffs are the Metal Rhythm Path.",
  difficultyException:
    "Fewer strokes a bar than the Step before, on purpose: every stroke is two strings, struck together and stopped together, which a note-rate metric does not count.",
  exercises: [
    {
      id: "two-string-eighths",
      title: "Two strings, down and up",
      purpose: "The E power chord in quarter notes, then in eighths. Bar 1 is all downstrokes, to hear both strings; bar 2 adds the upstroke.",
      howTo: [
        "Bar 1: four quarter notes, all down, counted '1, 2, 3, 4'. Bar 2: six eighths, down-up, and a quarter note on beat 4: '1 and 2 and 3 and, 4'.",
        "Every stroke is the same chord: the open low E string and fret 2 of the A string under the first finger.",
        "Make the upstroke reach both strings. If only the A string sounds on the 'and', the stroke is too short.",
        VARIANT_NOTE,
      ],
      coach: "A chord counts as one stroke: timed and counted, and which notes were in it is not checked. The join between the bars is where the time usually slips.",
      ...FREE,
      vary: CHORD_EIGHTHS.vary,
      tab: CHORD_EIGHTHS.base,
      position: 2,
      chords: CHORD_EIGHTHS.chords,
      ...CHORDS,
      rungs: ladder(60, 130, 10),
      passAt: 90,
      selfCheck: [BOTH_CHECK],
      minutes: 5,
    },
    {
      id: "two-string-long-short",
      title: "Long, short-short, at two speeds",
      purpose: "The E power chord in the long, short-short rhythm: a quarter and two eighths in bar 1, then twice as fast in bar 2, an eighth and two sixteenths, the gallop figure.",
      howTo: [
        "Bar 1: count '1, 2 and, 3, 4 and'. Down on each quarter note, down-up on the two eighths.",
        "Bar 2: count '1, and a, 2, and a, 3, and a, 4'. Down, down-up on each of the first three beats, and one downstroke on beat 4.",
        "Keep the strokes small in bar 2: the pick only has to clear two strings. The click does not change between the bars.",
        VARIANT_NOTE,
      ],
      coach: "A chord counts as one stroke: timed and counted, and which notes were in it is not checked. The first beat of bar 2 is where the time usually slips.",
      ...FREE,
      vary: CHORD_LONG_SHORT.vary,
      tab: CHORD_LONG_SHORT.base,
      position: 2,
      chords: CHORD_LONG_SHORT.chords,
      ...CHORDS,
      rungs: ladder(40, 110, 10),
      passAt: 75,
      selfCheck: [BOTH_CHECK],
      minutes: 6,
    },
    {
      id: "two-string-syncopation",
      title: "A syncopated bar on two strings",
      purpose: "The syncopated rhythm from earlier in the Path as the E power chord: beats 2 and 3 are silent, and the chords around them fall on the 'and'.",
      howTo: [
        "Count '1 and, (2) and, (3) and 4'. In bar 1 the chord on beat 4 is short, with a rest after it; in bar 2 it lasts the whole beat.",
        "Stop both strings on every rest: relax the first finger and lay the side of the picking hand down. The hand keeps swinging in eighths and plays the air.",
        "The chords on the 'and' are upstrokes. Tap the foot on the silent beats.",
        VARIANT_NOTE,
      ],
      coach: "Chords are timed and counted; which notes they were is not checked. A sound in a rest counts as an extra note; strings left humming are for your ear.",
      ...FREE,
      vary: CHORD_SYNC.vary,
      tab: CHORD_SYNC.base,
      position: 2,
      chords: CHORD_SYNC.chords,
      ...CHORDS,
      rungs: ladder(60, 130, 10),
      passAt: 90,
      selfCheck: [REST_CHECK, FOOT_CHECK],
      minutes: 6,
    },
    {
      id: "two-chord-riff",
      title: "A riff on two chords",
      purpose: "Four bars on two power chords, a bar each and round again. Every bar ends on a chord that lasts a beat or more, so the hop comes after a long chord and never in the middle of a run.",
      howTo: [
        "Bars 1 and 2: count '1, 2 and, (3) and, 4'. Bar 3: '1 and, (2) and, (3) and, 4'. Bar 4: '1 and 2 and, 3, 4', the last chord struck on 3 and held through 4.",
        "Bars 1 and 3 are the E power chord: the open low E string and fret 2 of the A string. Bars 2 and 4 are the A power chord: the open A string and fret 2 of the D string.",
        "Hop the first finger across just before beat 1, not earlier: the chord before it should last its full length.",
        VARIANT_NOTE,
      ],
      coach: "This is the Step's test piece. The first chord of each bar, straight after the change, is the one that arrives late. Chords are timed and counted; which notes they were is not checked.",
      ...FREE,
      vary: {
        values: { stringSet: Object.keys(TWO_CHORD_SETS) },
        pooled: ["stringSet"] as const,
        label: (p: VariantParams) => `${p.stringSet} strings`,
        build: (p: VariantParams) => ({ ...TWO_CHORD_SETS[p.stringSet], position: 2 }),
      },
      tab: TWO_CHORD_SETS["low E, A and D"].tab,
      position: 2,
      chords: TWO_CHORD_SETS["low E, A and D"].chords,
      ...CHORDS,
      rungs: ladder(60, 130, 10),
      passAt: 90,
      selfCheck: [BOTH_CHECK, REST_CHECK],
      minutes: 7,
    },
  ],
};
