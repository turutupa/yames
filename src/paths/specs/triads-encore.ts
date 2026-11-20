/**
 * Triads: the Beginner Level takes its time (2026-11-19). Drafts, like the Path
 * they belong to.
 *
 * The Beginner Level counted one, three, five once, in C, then handed F and G
 * over as shapes, and played the three chords in one order. These two Steps stay
 * there a little longer. The first counts the F and G major scales along the top
 * string, the way the first Step counted C, so the player sees why F is F, A, C
 * and G is G, B, D before their shapes arrive. The second closes the Level: C, F
 * and G with five before four, an eight-bar form in one part of the neck, a
 * twelve-bar form whose last line climbs, and the eight bars in other keys.
 * Every id is new, so nobody's progress moves.
 */
import type { StepSpec, VariantParams } from "../spec";
import { ladder, shiftFrets } from "../templates";
import { ROCK, bars, ending, inKeys, named, slow, top } from "./triadShapes";
import { chordWords } from "./keyText";

const VARIANT_NOTE =
  "The frets and note names here are for the first version. On other days the same line comes in another key, higher or lower on the neck.";

// --- One, three, five in F and in G ---------------------------------------------

// Shape one, the fingering C has at 5, 5, 3.
const F_ROOT = top(10, 10, 8);
const G_ROOT = top(12, 12, 10);

/** A major scale along the top string from this fret, up and back, one finger. */
const scaleOnTop = (from: number) =>
  shiftFrets(
    `/4 1:1f1 1:3f1 1:5f1 1:6f1 | 1:8f1 1:10f1 1:12f1 1:13f1 | 1:12f1 1:10f1 1:8f1 1:6f1 | 1:5f1 1:3f1 /2 1:1f1`,
    from - 1,
  );
/** One, three and five on the top string from this fret; the five is held for the shape to grow under it. */
const pickThree = (from: number) => shiftFrets(`/4 1:1f1 1:5f1 1:8f1 1:5f1 | 1:1f1 1:5f1 /2 1:8f1`, from - 1);

/** Beginner, after the three shapes of C: the count of the first Step, again, for the next two chords. */
export const ONE_THREE_FIVE_AGAIN: StepSpec = {
  id: "one-three-five-again",
  title: "One, three, five in F and in G",
  goal: "Count the F major scale and the G major scale along the top string, pick out the first, third and fifth notes of each, and play each three under one hand.",
  why: "You counted one scale, C, and its first, third and fifth notes made a C chord. F and G are the next two chords you need, and they are made the same way, each from its own scale. Count the F major scale and its one, three and five are F, A and C. Count the G major scale and they are G, B and D. Doing the count again turns those letters into something you worked out, before the next Step gives the two chords their shapes.",
  howTo: [
    "In the first Step, C major on the B string was frets 1, 3, 5, 6, 8, 10, 12 and 13: two frets between most notes, and one fret between three and four and between seven and the top. Every major scale has those same gaps, whatever note it starts on.",
    "F is fret 1 of the top string, so F major on the top string is the same row of frets: 1, 3, 5, 6, 8, 10, 12 and 13. G is fret 3, so G major is that row two frets higher: 3, 5, 7, 8, 10, 12, 14 and 15.",
    "Keeping the gaps changes one letter in each scale. In F the fourth note is one fret above A, and that note is B flat, the note one fret below B. In G the seventh note is one fret below the top G, and that note is F sharp, the note one fret above F.",
    "The fourth note of F is called B flat and not A sharp because a scale uses each letter once and A is already taken. For the same reason the seventh note of G is F sharp and not G flat.",
    "One, three and five are not the fourth note or the seventh, so neither chord has the changed note in it: F is F, A, C and G is G, B, D.",
    "As with C, one is the root and names the chord, three is the third and five is the fifth.",
  ],
  payoff: "You can say why an F chord is F, A and C and a G chord is G, B and D, and you can find each under one hand.",
  difficultyException:
    "Quarter notes on one string, as in the first Step, after a Step of eighth notes across three shapes: the count has to be slow enough to say aloud. The demand is working out which notes of a new scale make its chord, which the metric does not count.",
  exercises: [
    {
      id: "count-f",
      title: "Count the F major scale on the top string",
      purpose: "The F major scale along the top string, up and back, with a number for each note. The frets are the ones C major had on the B string, because F is at fret 1 here as C was there.",
      howTo: [
        "Quarter notes, 60 BPM up to a pass at 90.",
        "Top string, first finger only: frets 1, 3, 5, 6, 8, 10, 12, 13, then back down to fret 1. Say the numbers as you go up: one, two, three, four, five, six, seven, and one again at fret 13.",
        "The letters are F, G, A, B flat, C, D, E and F. Three and four are one fret apart, so four is at fret 6, and that note is B flat. B itself is at fret 7.",
        "One is F at fret 1, three is A at fret 5 and five is C at fret 8.",
      ],
      coach: "The count of the first Step, from a new note. The counting aloud is still yours. Right notes and steady quarter notes after the take.",
      tab: scaleOnTop(1),
      position: 1,
      shifts: true,
      loops: false,
      harmony: { scale: ["F", "major"], cover: true },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(),
      minutes: 4,
    },
    {
      id: "f-under-one-hand",
      title: "One, three and five of F: one string, then one hand",
      purpose: "F, A and C picked out of the scale on the top string, then the same three notes on three strings, where one hand holds them. The shape is shape one, the fingering C has at fret 5, five frets higher: G and B strings at fret 10, top note at fret 8.",
      howTo: [
        "Quarter notes, 60 BPM up to a pass at 90.",
        "Bars 1 and 2, top string, first finger only: frets 1, 5, 8, 5, then 1, 5, and 8 held. That is F, A, C: one, three, five.",
        "Leave the first finger on fret 8. Bars 3 and 4: put the third finger on the G string at fret 10 and the fourth finger on the B string at fret 10. From low to high that is F, A and C, with the C you were already holding on top.",
        "Bars 3 and 4 go low, middle, high, middle, then low, middle, and the high note held. Say 'one, three, five, three'.",
      ],
      coach: "One string, then one hand. The app hears the same three notes in all four bars, so the move to three strings is yours to check. Right notes and steady quarters after the take.",
      tab: `${pickThree(1)} | ${slow(F_ROOT)} | ${ending(F_ROOT)}`,
      position: 1,
      shifts: true,
      loops: false,
      harmony: { arpeggio: "F", cover: true },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(),
      minutes: 5,
    },
    {
      id: "count-g",
      title: "Count the G major scale on the top string",
      purpose: "The G major scale along the top string from fret 3, up and back. It is the row of frets you played for F, two frets higher.",
      howTo: [
        "Quarter notes, 60 BPM up to a pass at 90.",
        "Top string, first finger only: frets 3, 5, 7, 8, 10, 12, 14, 15, then back down to fret 3. Say the numbers as you go up: one to seven, and one again at fret 15.",
        "The letters are G, A, B, C, D, E, F sharp and G. Seven and the top are one fret apart, so seven is at fret 14, and that note is F sharp. F itself is at fret 13.",
        "One is G at fret 3, three is B at fret 7 and five is D at fret 10.",
      ],
      coach: "The same count once more, from G. The counting aloud is still yours. Right notes and steady quarter notes after the take.",
      tab: scaleOnTop(3),
      position: 3,
      shifts: true,
      loops: false,
      harmony: { scale: ["G", "major"], cover: true },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(),
      minutes: 4,
    },
    {
      id: "g-under-one-hand",
      title: "One, three and five of G: one string, then one hand",
      purpose: "G, B and D picked out of the scale on the top string, then on three strings under one hand. It is shape one again: G and B strings at fret 12, top note at fret 10.",
      howTo: [
        "Quarter notes, 60 BPM up to a pass at 90.",
        "Bars 1 and 2, top string, first finger only: frets 3, 7, 10, 7, then 3, 7, and 10 held. That is G, B, D: one, three, five.",
        "Leave the first finger on fret 10. Bars 3 and 4: put the third finger on the G string at fret 12 and the fourth finger on the B string at fret 12. From low to high that is G, B and D.",
        "Bars 3 and 4 go low, middle, high, middle, then low, middle, and the high note held.",
        "The F sharp of the G scale is not in the chord, and the B flat of the F scale was not in F: a chord takes only one, three and five.",
      ],
      coach: "One string, then one hand. The app hears the same three notes in all four bars, so the move to three strings is yours to check. Right notes and steady quarters after the take.",
      tab: `${pickThree(3)} | ${slow(G_ROOT)} | ${ending(G_ROOT)}`,
      position: 3,
      shifts: true,
      loops: false,
      harmony: { arpeggio: "G", cover: true },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(),
      minutes: 5,
    },
  ],
};

// --- Three chords, whole tunes ---------------------------------------------------

// C, F and G around fret 8 and around fret 12, as "One shape, three chords" plays them.
const C_MID = top(9, 8, 8);
const F_MID = top(10, 10, 8);
const G_MID = top(7, 8, 7);
const C_HIGH = top(12, 13, 12);
const F_HIGH = top(14, 13, 13);
const G_HIGH = top(12, 12, 10);

const EIGHT = bars(C_MID, F_MID, G_MID, F_MID, C_MID, G_MID, F_MID, C_MID);
const EIGHT_CHART = "C | F | G | F | C | G | F | C";
const TWELVE = bars(C_MID, C_MID, G_MID, G_MID, F_MID, F_MID, C_MID, C_MID, F_HIGH, G_HIGH, C_HIGH, C_HIGH);
const TWELVE_CHART = "C | C | G | G | F | F | C | C | F | G | C | C";

/**
 * The eight bars in other keys. The key's own lines come from `keyText.ts`, as
 * for every key-moved line; its one sentence listing the eight chords is said
 * here in two lines of four ("E, A, B, A, then E, B, A, E"), from that key's
 * own chart, because the Step counts a tune in lines of four.
 */
function eightInKeys(shifts: Readonly<Record<string, number>>) {
  const moved = inKeys(EIGHT, EIGHT_CHART, shifts);
  return {
    ...moved,
    build: (p: VariantParams) => {
      const built = moved.build(p);
      const names = built.chords.split("|").map((chord) => chordWords(chord));
      const twoLines = names.every((name) => name !== null) && names.length === 8
        ? `The eight bars are ${names.slice(0, 4).join(", ")}, then ${names.slice(4).join(", ")}.`
        : null;
      const made = built.howTo;
      return {
        ...built,
        howTo: (own: readonly string[]) =>
          (typeof made === "function" ? made(own) : made).map((line) => (twoLines !== null && line.startsWith("The eight bars are ") ? twoLines : line)),
      };
    },
  };
}

/** Beginner, last: the three chords in orders the Level has not played, and in longer forms. */
export const THREE_CHORDS_TUNES: StepSpec = {
  id: "three-chords-tunes",
  title: "Three chords, whole tunes",
  goal: "Play C, F and G in new orders, keep an eight-bar form in one part of the neck and a twelve-bar form whose last line is higher up, over a band, and play the eight bars in other keys.",
  why: "So far C, F and G have come in one order: C, F, G and back to C. Tunes use the same three chords in other orders, and for longer than four bars. No shape here is new. What is new is G coming before F, a chord that lasts two bars, and counting eight or twelve bars without losing your place. That is the step from knowing three chords to playing a tune with them.",
  howTo: [
    "Around fret 8, G string first: C is 9, 8, 8. F is 10, 10, 8. G is 7, 8, 7. Around fret 12: C is 12, 13, 12. F is 14, 13, 13. G is 12, 12, 10. These are the shapes of the last Step.",
    "C is the first chord of the key, F the fourth and G the fifth. Saying the numbers shows an order at a glance: C, G, F, C is one, five, four, one.",
    "A form is the order of chords of a whole tune. Count a long form in lines of four bars, and say the chord's name on beat 1 of each bar.",
    "Before each take, say the whole order aloud once.",
  ],
  payoff: "Eight bars and twelve bars of C, F and G over a band without getting lost, and the eight bars in four keys.",
  exercises: [
    {
      id: "five-before-four",
      title: "C, G, F, C: five before four",
      purpose: "The three chords with G second and F third: one, five, four, one. Around fret 12, with the shapes of the last Step in an order they have not had.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord: C, G, F, C.",
        "C: G string 12, B string 13, top string 12. G: 12, 12, 10. F: 14, 13, 13. Then C again.",
        "From G to F every finger moves and the hand goes up the neck: look at fret 13 before the bar line.",
        "Two notes keep their fret across a change while the finger on them changes. The G string stays at fret 12 from C to G, and the B string stays at fret 13 from F to C.",
      ],
      coach: "Band on. Right notes and time after the take.",
      tab: bars(C_HIGH, G_HIGH, F_HIGH, C_HIGH),
      position: 10,
      shifts: true,
      chords: "C | G | F | C",
      jam: ROCK("C"),
      harmony: { chordTones: true },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(),
      minutes: 6,
    },
    {
      id: "eight-bars",
      title: "Eight bars around fret 8",
      purpose: "Two lines of four bars that make one tune: C, F, G, F, then C, G, F, C. The first line goes out to F and G and stops on F, away from C. The second line is the order of the last Exercise, and it ends on C.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord.",
        "The hand stays between frets 7 and 10. C: G string 9, B string 8, top string 8. F: 10, 10, 8. G: 7, 8, 7.",
        "Bars 1 to 4: C, F, G, F. Bars 5 to 8: C, G, F, C.",
        "Between C and F, in either direction, the first finger stays on the top string at fret 8.",
        "From C to G the B string stays at fret 8, but the second finger takes it over from the first. From G to F nothing stays: the first finger goes from fret 7 to fret 8 on the top string and the third and fourth fingers land at fret 10.",
        "Bar 4 is F, not C. Bar 5 starts the second line on C.",
      ],
      coach: "Eight bars with the band. Right notes and time after the take.",
      tab: EIGHT,
      position: 7,
      shifts: true,
      chords: EIGHT_CHART,
      jam: ROCK("C"),
      harmony: { chordTones: true },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(0.75, 8),
      minutes: 6,
    },
    {
      id: "twelve-bars",
      title: "Twelve bars: two bars a chord, then a quick last line",
      purpose: "A longer form in three lines of four bars. The first two lines are C, G, F and C again, two bars each, around fret 8. The last line is F, G and two bars of C around fret 12, so the tune ends higher than it began. It is a tune of its own, not the twelve-bar blues.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 90. Twelve bars.",
        "Bars 1 to 8, around fret 8: C is 9, 8, 8. G is 7, 8, 7. F is 10, 10, 8. Two bars each of C, G, F and C.",
        "Bars 9 to 12, around fret 12: F is 14, 13, 13 for one bar, G is 12, 12, 10 for one bar, and C is 12, 13, 12 for two bars.",
        "Count it in lines of four. Line one is C, C, G, G. Line two is F, F, C, C. Line three is F, G, C, C.",
        "The one big move is into bar 9, from C at 9, 8, 8 up to F at 14, 13, 13. Count the two bars of C so it does not surprise you.",
      ],
      coach: "Twelve bars with the band. Right notes and time after the take.",
      tab: TWELVE,
      position: 7,
      shifts: true,
      chords: TWELVE_CHART,
      jam: ROCK("C"),
      harmony: { chordTones: true },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(0.75, 12),
      minutes: 7,
    },
    {
      id: "eight-bars-keys",
      title: "The eight bars in a new key",
      purpose: "The eight bars moved along the neck: two frets up the chords are D, G and A, four frets up they are E, A and B, and two frets down they are B flat, E flat and F. The same tune with the same hand, in a new key.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord.",
        "In D, on the G, B and top strings: D is 11, 10, 10. G is 12, 12, 10. A is 9, 10, 9.",
        "The eight bars are D, G, A, G, then D, A, G, D.",
        VARIANT_NOTE,
      ],
      coach: "A key that changes from day to day. Right notes and time after the take.",
      vary: eightInKeys({ D: 2, E: 4, Bb: -2 }),
      tab: shiftFrets(EIGHT, 2),
      position: 9,
      shifts: true,
      chords: "D | G | A | G | D | A | G | D",
      jam: ROCK("D"),
      harmony: { chordTones: true },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(0.75, 8),
      minutes: 6,
    },
  ],
};
