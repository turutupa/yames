/**
 * Triads and Chords in a Key: consolidation Steps (2026-11-19). Drafts, like the
 * Paths they belong to.
 *
 * Both Paths were written short and are meant to be long (`plans/paths/
 * NEW_PATHS.md`, "How long each Path is"). These Steps add little that is new.
 * They take a shape or an idea the player has met on one chord or in one key
 * and give it to the others, the way Blues was extended. Their ids are new, so
 * nobody's progress moves.
 */
import type { StepSpec } from "../spec";
import { ladder } from "../templates";
import { ROCK, bars, mid, named, top } from "./triadShapes";

// --- Triads -----------------------------------------------------------------

/** Beginner, after the three shapes of C: the same for F and G. */
export const F_AND_G: StepSpec = {
  id: "f-and-g",
  title: "F and G in three places",
  goal: "Play the three shapes of F major and of G major on the top strings, and play C, F and G by moving shape three.",
  why: "You learned the three shapes on one chord. They are not C shapes: they are major shapes, and every major chord has the same three, in the same order up the neck, starting from a different fret. Doing it again for F and for G is what turns three fingerings into something you know. These are also the two chords you will need next.",
  howTo: [
    "F is F, A, C. Shape three is nearest the nut: frets 5, 6, 5. Then shape one at 10, 10, 8, then shape two at 14, 13, 13.",
    "G is G, B, D. Shape two comes first: 4, 3, 3. Then shape three at 7, 8, 7, then shape one at 12, 12, 10.",
    "Shape one always has the root lowest, shape two the third, shape three the fifth. Which shape comes first on the neck depends on the chord.",
  ],
  payoff: "Three major chords, each in three places: nine shapes from three fingerings.",
  exercises: [
    {
      id: "f-three-places",
      title: "F major in three places",
      purpose: "The three shapes of F up the neck and back: around fret 5, around fret 9, around fret 13.",
      howTo: [
        "Straight eighths, 50 BPM up to a pass at 80. One bar on each shape.",
        "Bar 1: G string 5, B string 6, top string 5. Bar 2: 10, 10, 8. Bar 3: 14, 13, 13. Bar 4: 10, 10, 8 again.",
        "The letters are F, A and C every time.",
      ],
      coach: "Right notes and even eighths after the take.",
      tab: bars(top(5, 6, 5), top(10, 10, 8), top(14, 13, 13), top(10, 10, 8)),
      position: 5,
      shifts: true,
      harmony: { arpeggio: "F", cover: true },
      rungs: ladder(50, 110, 10),
      passAt: 80,
      ...named(),
      minutes: 5,
    },
    {
      id: "g-three-places",
      title: "G major in three places",
      purpose: "The three shapes of G up the neck and back: around fret 3, around fret 7, around fret 11.",
      howTo: [
        "Straight eighths, 50 BPM up to a pass at 80. One bar on each shape.",
        "Bar 1: G string 4, B string 3, top string 3. Bar 2: 7, 8, 7. Bar 3: 12, 12, 10. Bar 4: 7, 8, 7 again.",
        "The letters are G, B and D every time.",
      ],
      coach: "Right notes and even eighths after the take.",
      tab: bars(top(4, 3, 3), top(7, 8, 7), top(12, 12, 10), top(7, 8, 7)),
      position: 3,
      shifts: true,
      harmony: { arpeggio: "G", cover: true },
      rungs: ladder(50, 110, 10),
      passAt: 80,
      ...named(),
      minutes: 5,
    },
    {
      id: "shape-three-moves",
      title: "C, F and G with shape three",
      purpose: "One fingering, shape three, on three chords: C at fret 12, F at fret 5, G at fret 7, and back to C. The first finger lies across two strings and the second sits a fret above it.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord: C, F, G, C.",
        "C: G string 12, B string 13, top string 12. F: 5, 6, 5. G: 7, 8, 7. Keep the fingers in their shape as the hand slides.",
      ],
      coach: "Band on. Right notes and time after the take.",
      tab: bars(top(12, 13, 12), top(5, 6, 5), top(7, 8, 7), top(12, 13, 12)),
      position: 5,
      shifts: true,
      chords: "C | F | G | C",
      jam: ROCK("C"),
      harmony: { chordTones: true },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(),
      minutes: 6,
    },
  ],
};

/** Intermediate, after minor: the other two minor chords of the key. */
export const MORE_MINORS: StepSpec = {
  id: "more-minors",
  title: "D minor and E minor in three places",
  goal: "Play the three shapes of D minor and of E minor on the top strings, and the three minor chords of the key in one place.",
  why: "A minor showed you the three minor shapes. D minor and E minor are the other two minor chords in the key of C, and they use the same three shapes from other frets. With these you have all six of the key's major and minor chords in three places each, which is everything the next Path needs.",
  howTo: [
    "D minor is D, F, A. Its shapes: 2, 3, 1 near the nut, then 7, 6, 5, then the first finger across fret 10.",
    "E minor is E, G, B: the same three shapes two frets higher. 4, 5, 3, then 9, 8, 7, then the first finger across fret 12.",
    "Compare each with the major chord on the same root if you know it: the third is one fret lower.",
  ],
  payoff: "All three minor chords of the key, each in three places.",
  difficultyException:
    "Two of the three Exercises have no band and stay on one chord, which the metric counts as easier than the band Exercise that ends the Step before. The demand is six shapes found from new frets.",
  exercises: [
    {
      id: "d-minor-three",
      title: "D minor in three places",
      purpose: "The three shapes of D minor up the neck and back: near the nut, around fret 6, and at fret 10.",
      howTo: [
        "Straight eighths, 50 BPM up to a pass at 80. One bar on each shape.",
        "Bar 1: G string 2, B string 3, top string 1. Bar 2: 7, 6, 5. Bar 3: the first finger across fret 10 on all three strings. Bar 4: 7, 6, 5 again.",
      ],
      coach: "Right notes and even eighths after the take.",
      tab: bars(top(2, 3, 1), top(7, 6, 5), top(10, 10, 10), top(7, 6, 5)),
      position: 1,
      shifts: true,
      harmony: { arpeggio: "Dm", cover: true },
      rungs: ladder(50, 110, 10),
      passAt: 80,
      ...named(),
      minutes: 5,
    },
    {
      id: "e-minor-three",
      title: "E minor in three places",
      purpose: "The same three shapes two frets higher: around fret 4, around fret 8, and at fret 12.",
      howTo: [
        "Straight eighths, 50 BPM up to a pass at 80. One bar on each shape.",
        "Bar 1: G string 4, B string 5, top string 3. Bar 2: 9, 8, 7. Bar 3: the first finger across fret 12. Bar 4: 9, 8, 7 again.",
      ],
      coach: "Right notes and even eighths after the take.",
      tab: bars(top(4, 5, 3), top(9, 8, 7), top(12, 12, 12), top(9, 8, 7)),
      position: 3,
      shifts: true,
      harmony: { arpeggio: "Em", cover: true },
      rungs: ladder(50, 110, 10),
      passAt: 80,
      ...named(),
      minutes: 5,
    },
    {
      id: "three-minors",
      title: "A minor, D minor, E minor in one place",
      purpose: "The three minor chords of the key between frets 3 and 7, with the band, and home to A minor.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord.",
        "A minor: the first finger across fret 5. D minor: G string 7, B string 6, top string 5. E minor: G string 4, B string 5, top string 3. A minor again.",
      ],
      coach: "Band on. Right notes and time after the take.",
      tab: bars(top(5, 5, 5), top(7, 6, 5), top(4, 5, 3), top(5, 5, 5)),
      position: 3,
      shifts: true,
      chords: "Am | Dm | Em | Am",
      jam: ROCK("A minor"),
      harmony: { chordTones: true },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(),
      minutes: 6,
    },
  ],
};

/** Advanced, after the two sets: the third kind of triad. */
export const DIMINISHED: StepSpec = {
  id: "diminished",
  title: "The third kind: diminished",
  goal: "Turn a minor triad into a diminished one by lowering its fifth, play B diminished in three shapes, and use it to lead home to C.",
  why: "There are three kinds of triad in a major key and you know two. The third is diminished: a minor triad whose fifth is lowered one fret as well. It sounds tense and unfinished on its own, and that is its use: it leans hard toward the chord a fret above its root. In the key of C the only one is B diminished, and it leads to C. You will meet it by name in the next Path.",
  howTo: [
    "B minor would be B, D, F sharp. Lower the F sharp one fret to F and it is B diminished: B, D, F.",
    "Its three shapes on the top strings: 4, 3, 1, then 7, 6, 7, then 10, 12, 10.",
    "It shares two notes, B and D, with G major. Songs often use it in G's place just before C.",
  ],
  payoff: "All three kinds of triad a key contains, and the sound of a chord that wants to resolve.",
  exercises: [
    {
      id: "minor-to-diminished",
      title: "B minor to B diminished",
      purpose: "A minor shape, then the same shape with its top note one fret lower, back and forth. One note makes minor into diminished, as one note made major into minor.",
      howTo: [
        "Straight eighths, 50 BPM up to a pass at 80. One bar each: B minor, B diminished, and again.",
        "B minor: G string 4, B string 3, top string 2. B diminished: G string 4, B string 3, top string 1. Only the top string moves, and the hand has to open a little to reach it.",
      ],
      coach: "Right notes and even eighths after the take. Listen to what the one fret does.",
      tab: bars(top(4, 3, 2), top(4, 3, 1), top(4, 3, 2), top(4, 3, 1)),
      position: 2,
      shifts: true,
      chords: "Bm | Bdim | Bm | Bdim",
      harmony: { chordTones: true },
      rungs: ladder(50, 110, 10),
      passAt: 80,
      ...named(),
      minutes: 5,
    },
    {
      id: "b-diminished-three",
      title: "B diminished in three places",
      purpose: "The three shapes of B diminished up the neck and back: around fret 3, around fret 7 and around fret 11.",
      howTo: [
        "Straight eighths, 50 BPM up to a pass at 80. One bar on each shape.",
        "Bar 1: G string 4, B string 3, top string 1. Bar 2: 7, 6, 7. Bar 3: 10, 12, 10. Bar 4: 7, 6, 7 again.",
        "The letters are B, D and F every time.",
      ],
      coach: "Right notes and even eighths after the take.",
      tab: bars(top(4, 3, 1), top(7, 6, 7), top(10, 12, 10), top(7, 6, 7)),
      position: 2,
      shifts: true,
      harmony: { arpeggio: "Bdim", cover: true },
      rungs: ladder(50, 110, 10),
      passAt: 80,
      ...named(),
      minutes: 5,
    },
    {
      id: "leading-home",
      title: "G, B diminished, C",
      purpose: "G, then B diminished in almost the same shape, then two bars of C. Hear the diminished chord lean into C.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 90.",
        "G: G string 4, B string 3, top string 3. B diminished: 4, 3, 1: only the top string moves. C: 5, 5, 3, for two bars.",
      ],
      coach: "Band on. Right notes and time after the take.",
      tab: bars(top(4, 3, 3), top(4, 3, 1), top(5, 5, 3), top(5, 5, 3)),
      position: 1,
      shifts: true,
      chords: "G | Bdim | C | C",
      jam: ROCK("C"),
      harmony: { chordTones: true },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(),
      minutes: 6,
    },
  ],
};

// --- Chords in a Key ----------------------------------------------------------

/** Intermediate, after the other keys: one new key, in full. */
export const KEY_OF_G: StepSpec = {
  id: "key-of-g",
  title: "The key of G, in full",
  goal: "Play the seven chords of G major, its one, four and five in an eight-bar form, and its one, six, two, five.",
  why: "So far a new key has been the key of C moved up the neck. G is worth learning in its own right: it is the key guitar songs are most often in, and its chords fall low on the neck where the shapes are different from C's. Going through everything again in one new key, the seven chords, the three majors, the turn through the minors, is what makes the numbers independent of any one place.",
  howTo: [
    "G major has one sharp: F sharp. Its seven chords are G, A minor, B minor, C, D, E minor and F sharp diminished.",
    "One, four and five are G, C and D. Six, two and three are E minor, A minor and B minor.",
    "Around fret 3: G is 4, 3, 3. C is 5, 5, 3. D is 2, 3, 2. E minor is 4, 5, 3. A minor is 5, 5, 5.",
  ],
  payoff: "A second key you know as well as the first.",
  exercises: [
    {
      id: "seven-in-g",
      title: "The seven chords of G",
      purpose: "Eight bars: a chord on every note of the G major scale, root lowest. The first four are on the D, G and B strings and the last four on the top three.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 85. One bar on each chord.",
        "Bars 1 to 4, D, G and B strings, D string first: G is 5, 4, 3. A minor is 7, 5, 5. B minor is 9, 7, 7. C is 10, 9, 8.",
        "Bars 5 to 8, top three strings, G string first: D is 7, 7, 5. E minor is 9, 8, 7. F sharp diminished is 11, 10, 8. G is 12, 12, 10.",
        "Say the pattern: major, minor, minor, major, major, minor, diminished, major.",
      ],
      coach: "Eight bars with the band. Right notes and time after the take.",
      tab: bars(mid(5, 4, 3), mid(7, 5, 5), mid(9, 7, 7), mid(10, 9, 8), top(7, 7, 5), top(9, 8, 7), top(11, 10, 8), top(12, 12, 10)),
      position: 3,
      shifts: true,
      chords: "G | Am | Bm | C | D | Em | F#dim | G",
      jam: ROCK("G"),
      harmony: { chordTones: true },
      rungs: ladder(60, 110, 5),
      passAt: 85,
      ...named(0.75, 8),
      minutes: 7,
    },
    {
      id: "one-four-five-g",
      title: "One, four, five in G",
      purpose: "The eight-bar form with G, C and D, low on the neck: one, one, four, four, five, four, one, one.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 90.",
        "G is 4, 3, 3. C is 5, 5, 3. D is 2, 3, 2. Follow the form: G, G, C, C, D, C, G, G.",
      ],
      coach: "Eight bars with the band. Right notes and time after the take.",
      tab: bars(top(4, 3, 3), top(4, 3, 3), top(5, 5, 3), top(5, 5, 3), top(2, 3, 2), top(5, 5, 3), top(4, 3, 3), top(4, 3, 3)),
      position: 2,
      shifts: true,
      chords: "G | G | C | C | D | C | G | G",
      jam: ROCK("G"),
      harmony: { chordTones: true },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(0.75, 8),
      minutes: 6,
    },
    {
      id: "one-six-two-five-g",
      title: "One, six, two, five in G",
      purpose: "G, E minor, A minor, D around fret 3. Between G and E minor only one note moves.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord.",
        "G is 4, 3, 3. E minor is 4, 5, 3. A minor is 5, 5, 5. D is 2, 3, 2.",
        "Say the numbers: one, six, two, five.",
      ],
      coach: "Band on. Right notes and time after the take.",
      tab: bars(top(4, 3, 3), top(4, 5, 3), top(5, 5, 5), top(2, 3, 2)),
      position: 2,
      shifts: true,
      chords: "G | Em | Am | D",
      jam: ROCK("G"),
      harmony: { chordTones: true },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(),
      minutes: 6,
    },
  ],
};
