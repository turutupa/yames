/**
 * Triads: the second round of consolidation Steps (2026-11-19). Drafts, like
 * the Path they belong to.
 *
 * Triads is meant to be long (`plans/paths/NEW_PATHS.md`, "How long each Path
 * is"). These Steps finish the middle strings (F and G, D minor and E minor,
 * the four chords in other keys), add the third set of strings (A, D and G),
 * join the three sets, and end on a second, longer song. Every id is new, so
 * nobody's progress moves.
 */
import type { StepSpec } from "../spec";
import { ladder, shiftFrets } from "../templates";
import { ROCK, bars, fingered, inKeys, low, mid, named, top } from "./triadShapes";

const YOUR_TURN = { grade: "selfChecked", example: true } as const;
const NOT_CHECKED_YET =
  "Your turn, and not checked yet: the app can't judge notes you choose, so you tick it off yourself.";
const VARIANT_NOTE =
  "The frets and note names here are for the first version. On other days the same line comes in another key, higher or lower on the neck.";

// --- The middle strings, finished ---------------------------------------------

const THREE_CHORDS_MIDDLE = bars(mid(10, 9, 8), mid(10, 10, 10), mid(9, 7, 8), mid(10, 9, 8));

/** Intermediate, after the middle strings: the other two major chords there. */
export const F_AND_G_MIDDLE: StepSpec = {
  id: "f-and-g-middle",
  title: "F and G on the middle strings",
  goal: "Play the three shapes of F major and of G major on the D, G and B strings, and play C, F and G there without leaving one part of the neck, in C and in other keys.",
  why: "On the top strings you learned the shapes on C and then gave them to F and G. The middle strings get the same treatment, for the same reason: a shape you have played on one chord is a fingering, and a shape you have played on three is something you know. These three shapes are the major shapes of this set of strings, and they come in the same repeating order up the neck as before: root lowest, third lowest, fifth lowest, and round again, with each chord coming into that order at a different shape.",
  howTo: [
    "F is F, A, C. On the D, G and B strings, D string first: 3, 2, 1 is shape one. 7, 5, 6 is shape two. The first finger across fret 10 is shape three.",
    "G is G, B, D: the same three shapes two frets higher. 5, 4, 3, then 9, 7, 8, then the first finger across fret 12.",
    "Shape three is one finger laid flat, which makes it the easiest to move and the easiest to let buzz. Press with the bony edge of the finger, close to the fret.",
  ],
  payoff: "C, F and G in three places each on a second set of strings, and one, four and five there in four keys.",
  exercises: [
    {
      id: "f-middle",
      title: "F major on the middle strings",
      purpose: "The three shapes of F on the D, G and B strings, up the neck and back: near the nut, around fret 6, and at fret 10.",
      howTo: [
        "Straight eighths, 50 BPM up to a pass at 80. One bar on each shape.",
        "Bar 1: D string 3, G string 2, B string 1. Bar 2: D string 7, G string 5, B string 6. Bar 3: the first finger across fret 10 on all three strings. Bar 4: 7, 5, 6 again.",
        "The letters are F, A and C every time.",
      ],
      coach: "Right notes and even eighths after the take.",
      tab: bars(mid(3, 2, 1), mid(7, 5, 6), mid(10, 10, 10), mid(7, 5, 6)),
      position: 1,
      shifts: true,
      harmony: { arpeggio: "F", cover: true },
      rungs: ladder(50, 110, 10),
      passAt: 80,
      ...named(),
      minutes: 5,
    },
    {
      id: "g-middle",
      title: "G major on the middle strings",
      purpose: "The same three shapes two frets higher: around fret 4, around fret 8, and at fret 12.",
      howTo: [
        "Straight eighths, 50 BPM up to a pass at 80. One bar on each shape.",
        "Bar 1: D string 5, G string 4, B string 3. Bar 2: D string 9, G string 7, B string 8. Bar 3: the first finger across fret 12. Bar 4: 9, 7, 8 again.",
        "The letters are G, B and D every time.",
      ],
      coach: "Right notes and even eighths after the take.",
      tab: bars(mid(5, 4, 3), mid(9, 7, 8), mid(12, 12, 12), mid(9, 7, 8)),
      position: 3,
      shifts: true,
      harmony: { arpeggio: "G", cover: true },
      rungs: ladder(50, 110, 10),
      passAt: 80,
      ...named(),
      minutes: 5,
    },
    {
      id: "three-chords-middle",
      title: "C, F and G around fret 9",
      purpose: "The three chords on the middle strings between frets 7 and 10, each from a different shape: C with its root lowest, F as one finger across fret 10, G with its third lowest.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord: C, F, G, C.",
        "C: D string 10, G string 9, B string 8. F: all three strings at fret 10. G: D string 9, G string 7, B string 8.",
        "From C to F the note on the D string does not change: it is C, and both chords have it. The first finger takes it over as it lies down across fret 10.",
      ],
      coach: "Band on. Right notes and time after the take.",
      tab: THREE_CHORDS_MIDDLE,
      position: 8,
      shifts: true,
      chords: "C | F | G | C",
      jam: ROCK("C"),
      harmony: { chordTones: true },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(),
      minutes: 6,
    },
    {
      id: "three-chords-middle-keys",
      title: "The same three chords in a new key",
      purpose: "The fret-9 shapes moved along the neck: two frets down they are B flat, E flat and F, three frets down they are A, D and E, and two frets up they are D, G and A. One, four and five of a new key on the middle strings.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord.",
        "In B flat: D string 8, G string 7, B string 6; then all three strings at fret 8; then 7, 5, 6. Everything from the key of C, two frets lower.",
        VARIANT_NOTE,
      ],
      coach: "A key that changes from day to day. Right notes and time after the take.",
      vary: inKeys(THREE_CHORDS_MIDDLE, "C | F | G | C", { Bb: -2, A: -3, D: 2 }),
      tab: shiftFrets(THREE_CHORDS_MIDDLE, -2),
      position: 6,
      shifts: true,
      chords: "Bb | Eb | F | Bb",
      jam: ROCK("Bb"),
      harmony: { chordTones: true },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(),
      minutes: 6,
    },
  ],
};

const AM_MIDDLE = mid(7, 5, 5);
/** D minor held so the third finger can stay on the D string after A minor. */
const DM_MIDDLE = fingered(mid(7, 7, 6), [3, 4, 2]);
const FOUR_CHORDS_MIDDLE = bars(mid(5, 5, 5), mid(7, 5, 5), mid(7, 5, 6), mid(5, 4, 3));

/** Intermediate, after F and G on the middle strings: the minor chords there. */
export const MINORS_MIDDLE: StepSpec = {
  id: "minors-middle",
  title: "D minor and E minor on the middle strings",
  goal: "Play the three shapes of D minor and of E minor on the D, G and B strings, the three minor chords of the key in one place, and the four chords there in other keys.",
  why: "A minor gave you the three minor shapes of the middle strings. D minor and E minor finish the key: after this Step every major and minor chord of C major has three places on the top strings and three on the middle ones. That is thirty-six shapes from twelve fingerings, and it is the stock a rhythm part is made from.",
  howTo: [
    "D minor is D, F, A. On the D, G and B strings, D string first: 3, 2, 3, then 7, 7, 6, then 12, 10, 10.",
    "E minor is E, G, B: the same three shapes two frets higher. 5, 4, 5, then 9, 9, 8, then 14, 12, 12.",
    "The shape with the root lowest is the one with two strings under the first finger. For D minor and E minor it is the last of the three, at 12, 10, 10 and 14, 12, 12. A minor has the same shape at 7, 5, 5.",
  ],
  payoff: "All six chords of the key in three places on the middle strings, and the four chords there in any key.",
  exercises: [
    {
      id: "d-minor-middle",
      title: "D minor on the middle strings",
      purpose: "The three shapes of D minor on the D, G and B strings, up the neck and back: around fret 3, around fret 7, and around fret 11.",
      howTo: [
        "Straight eighths, 50 BPM up to a pass at 80. One bar on each shape.",
        "Bar 1: D string 3, G string 2, B string 3. Bar 2: D string 7, G string 7, B string 6. Bar 3: D string 12, G string 10, B string 10. Bar 4: 7, 7, 6 again.",
        "The letters are D, F and A every time.",
      ],
      coach: "Right notes and even eighths after the take.",
      tab: bars(mid(3, 2, 3), mid(7, 7, 6), mid(12, 10, 10), mid(7, 7, 6)),
      position: 2,
      shifts: true,
      harmony: { arpeggio: "Dm", cover: true },
      rungs: ladder(50, 110, 10),
      passAt: 80,
      ...named(),
      minutes: 5,
    },
    {
      id: "e-minor-middle",
      title: "E minor on the middle strings",
      purpose: "The same three shapes two frets higher: around fret 5, around fret 9, and around fret 13.",
      howTo: [
        "Straight eighths, 50 BPM up to a pass at 80. One bar on each shape.",
        "Bar 1: D string 5, G string 4, B string 5. Bar 2: D string 9, G string 9, B string 8. Bar 3: D string 14, G string 12, B string 12. Bar 4: 9, 9, 8 again.",
        "The letters are E, G and B every time.",
      ],
      coach: "Right notes and even eighths after the take.",
      tab: bars(mid(5, 4, 5), mid(9, 9, 8), mid(14, 12, 12), mid(9, 9, 8)),
      position: 4,
      shifts: true,
      harmony: { arpeggio: "Em", cover: true },
      rungs: ladder(50, 110, 10),
      passAt: 80,
      ...named(),
      minutes: 5,
    },
    {
      id: "three-minors-middle",
      title: "A minor, D minor, E minor on the middle strings",
      purpose: "The three minor chords of the key between frets 4 and 7 on the D, G and B strings, with the band, and home to A minor.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord.",
        "A minor: D string 7, G string 5, B string 5. D minor: D string 7, G string 7, B string 6. E minor: D string 5, G string 4, B string 5. A minor again.",
        "From A minor to D minor the third finger stays on the D string at fret 7. Lift the first finger and add the fourth finger on the G string and the second on the B string.",
      ],
      coach: "Band on. Right notes and time after the take.",
      tab: bars(AM_MIDDLE, DM_MIDDLE, mid(5, 4, 5), AM_MIDDLE),
      position: 5,
      shifts: true,
      chords: "Am | Dm | Em | Am",
      jam: ROCK("A minor"),
      harmony: { chordTones: true },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(),
      minutes: 6,
    },
    {
      id: "four-chords-middle-keys",
      title: "The four chords on the middle strings, in a new key",
      purpose: "C, A minor, F and G on the middle strings, moved along the neck: two frets higher they are D, B minor, G and A; four frets higher they are E, C sharp minor, A and B; two frets lower they are B flat, G minor, E flat and F.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord.",
        "In D: all three strings at fret 7; then D string 9, G string 7, B string 7; then 9, 7, 8; then 7, 6, 5.",
        VARIANT_NOTE,
      ],
      coach: "A key that changes from day to day. Right notes and time after the take.",
      vary: inKeys(FOUR_CHORDS_MIDDLE, "C | Am | F | G", { D: 2, E: 4, Bb: -2 }),
      tab: shiftFrets(FOUR_CHORDS_MIDDLE, 2),
      position: 5,
      shifts: true,
      chords: "D | Bm | G | A",
      jam: ROCK("D"),
      harmony: { chordTones: true },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(),
      minutes: 6,
    },
  ],
};

// --- The A, D and G strings ----------------------------------------------------

const C_LOWSET = low(7, 5, 5);
/** A minor with the third finger flat across two strings, so it can stay on the D string for F. */
const AM_LOWSET_FLAT = fingered(low(7, 7, 5), [3, 3, 1]);
const F_LOWSET = low(8, 7, 5);
const FOUR_CHORDS_LOWSET = bars(C_LOWSET, AM_LOWSET_FLAT, F_LOWSET, low(5, 5, 4));

/** Advanced, after the two sets are joined: the third set of strings. */
export const LOW_SET: StepSpec = {
  id: "low-set",
  title: "The A, D and G strings",
  goal: "Play C major and A minor in three shapes on the A, D and G strings, and the four chords there.",
  why: "One more set of strings, one lower again. Down here a triad is thick and dark: it is the sound of a rhythm guitar under a singer, and of the low end of every barre chord. These three strings are tuned the same distance apart, with no B string to bend the pattern, so the shapes are new once more. They are also the last new shapes: the low E, A and D strings are tuned the same distance apart and take the same fingerings, so after this set there is no triad shape on the guitar you have not played.",
  howTo: [
    "C on the A, D and G strings, A string first: 7, 5, 5 is E, G, C, which is shape two. 10, 10, 9 is G, C, E, shape three. 15, 14, 12 is C, E, G, shape one.",
    "Shape one also sits at the nut with an open string: A string 3, D string 2, open G string. It is the bottom of the open C chord.",
    "A minor: 3, 2, 2 is C, E, A. 7, 7, 5 is E, A, C. 12, 10, 9 is A, C, E, with the root lowest.",
    "Rest the side of the picking hand on the low E string so it stays quiet under these shapes.",
  ],
  payoff: "The same triads on a third set of strings, so a chord can be played low, in the middle or high.",
  exercises: [
    {
      id: "c-low-set",
      title: "C major on the A, D and G strings",
      purpose: "The three shapes of C on the A, D and G strings, up the neck and back: around fret 6, around fret 10, and around fret 13.",
      howTo: [
        "Straight eighths, 50 BPM up to a pass at 80. One bar on each shape.",
        "Bar 1: A string 7, D string 5, G string 5. Bar 2: A string 10, D string 10, G string 9. Bar 3: A string 15, D string 14, G string 12. Bar 4: 10, 10, 9 again.",
        "The letters are C, E and G every time. In bar 1 the lowest note is E, in bar 2 it is G, and in bar 3 it is C.",
      ],
      coach: "Right notes and even eighths after the take.",
      tab: bars(C_LOWSET, low(10, 10, 9), low(15, 14, 12), low(10, 10, 9)),
      position: 5,
      shifts: true,
      harmony: { arpeggio: "C", cover: true },
      rungs: ladder(50, 110, 10),
      passAt: 80,
      ...named(),
      minutes: 6,
    },
    {
      id: "a-minor-low-set",
      title: "A minor on the A, D and G strings",
      purpose: "The three shapes of A minor on the same strings: around fret 2, around fret 6, and around fret 10, and back.",
      howTo: [
        "Straight eighths, 50 BPM up to a pass at 80. One bar on each shape.",
        "Bar 1: A string 3, D string 2, G string 2. Bar 2: A string 7, D string 7, G string 5. Bar 3: A string 12, D string 10, G string 9. Bar 4: 7, 7, 5 again.",
        "The letters are A, C and E every time. Bar 1 is the bottom of the open C chord with one note changed: the open G has become an A at fret 2.",
      ],
      coach: "Right notes and even eighths after the take.",
      tab: bars(low(3, 2, 2), low(7, 7, 5), low(12, 10, 9), low(7, 7, 5)),
      position: 2,
      shifts: true,
      harmony: { arpeggio: "Am", cover: true },
      rungs: ladder(50, 110, 10),
      passAt: 80,
      ...named(),
      minutes: 6,
    },
    {
      id: "four-chords-low-set",
      title: "C, A minor, F, G on the A, D and G strings",
      purpose: "The four chords between frets 4 and 8 on the low set, with the band. From C to A minor one note moves, and from A minor to F one note moves.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord.",
        "C: A string 7, D string 5, G string 5. A minor: 7, 7, 5. F: 8, 7, 5. G: 5, 5, 4.",
        "Hold A minor with the third finger laid flat across fret 7 on the A and D strings. For F it stays on the D string, and the fourth finger takes fret 8 on the A string.",
      ],
      coach: "Band on. Right notes and time after the take.",
      tab: FOUR_CHORDS_LOWSET,
      position: 5,
      shifts: true,
      chords: "C | Am | F | G",
      jam: ROCK("C"),
      harmony: { chordTones: true },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(),
      minutes: 6,
    },
  ],
};

/** Advanced, after the low set: the same set on other chords and keys, and all three sets in one place. */
export const THREE_SETS: StepSpec = {
  id: "three-sets",
  title: "Three chords down low, and three sets in one place",
  goal: "Play C, F and G on the A, D and G strings, move the four chords there to other keys, and play one C chord on all three sets of strings without moving the hand.",
  why: "A new set of strings is only yours once it has carried more than one chord and more than one key. And there is something to see now that you have all three sets: in any one part of the neck, the same chord sits on each of them, one above the other. Lay the three over one another and you have five strings of a barre chord; add the low E string and it is the whole chord. You have been playing pieces of it all along.",
  howTo: [
    "On the A, D and G strings, F with its root lowest is 8, 7, 5, and G is the same shape two frets up: 10, 9, 7.",
    "Around fret 8, C is 10, 10, 9 on the A, D and G strings, 10, 9, 8 on the D, G and B strings, and 9, 8, 8 on the top three.",
    "Lay those three over one another, sharing strings, and you have the C barre chord at fret 8 with only the low E string still to add: 8, 10, 10, 9, 8, 8.",
  ],
  payoff: "One chord on three sets of strings under one hand, and the low set in any key.",
  exercises: [
    {
      id: "one-four-five-low-set",
      title: "C, F and G on the A, D and G strings",
      purpose: "One, four and five on the low set between frets 5 and 10. F and G are one shape, two frets apart.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord: C, F, G, C.",
        "C: A string 7, D string 5, G string 5. F: 8, 7, 5. G: 10, 9, 7. Keep the fingers in their shape as the hand slides from F to G.",
      ],
      coach: "Band on. Right notes and time after the take.",
      tab: bars(C_LOWSET, F_LOWSET, low(10, 9, 7), C_LOWSET),
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
    {
      id: "four-chords-low-set-keys",
      title: "The four chords down low, in a new key",
      purpose: "C, A minor, F and G on the A, D and G strings, moved along the neck: two frets higher they are D, B minor, G and A; four frets higher they are E, C sharp minor, A and B; two frets lower they are B flat, G minor, E flat and F.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord.",
        "In D: A string 9, D string 7, G string 7; then 9, 9, 7; then 10, 9, 7; then 7, 7, 6.",
        VARIANT_NOTE,
      ],
      coach: "A key that changes from day to day. Right notes and time after the take.",
      vary: inKeys(FOUR_CHORDS_LOWSET, "C | Am | F | G", { D: 2, E: 4, Bb: -2 }),
      tab: shiftFrets(FOUR_CHORDS_LOWSET, 2),
      position: 6,
      shifts: true,
      chords: "D | Bm | G | A",
      jam: ROCK("D"),
      harmony: { chordTones: true },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(),
      minutes: 6,
    },
    {
      id: "three-sets-one-place",
      title: "One C chord on three sets of strings",
      purpose: "C around fret 8 on the A, D and G strings, then on the D, G and B strings, then on the top three, and back to the middle. The hand does not travel: each bar moves one string across.",
      howTo: [
        "Straight eighths, 50 BPM up to a pass at 80. One bar on each set.",
        "Bar 1: A string 10, D string 10, G string 9. Bar 2: D string 10, G string 9, B string 8. Bar 3: G string 9, B string 8, top string 8. Bar 4: the middle set again.",
        "Two of the three notes are shared each time you cross over. Going across, the lowest note is dropped and a new one is added on top. Coming back, it is the other way round.",
      ],
      coach: "Right notes and even eighths after the take.",
      tab: bars(low(10, 10, 9), mid(10, 9, 8), top(9, 8, 8), mid(10, 9, 8)),
      position: 8,
      shifts: true,
      harmony: { arpeggio: "C", cover: true },
      rungs: ladder(50, 110, 10),
      passAt: 80,
      ...named(),
      minutes: 5,
    },
  ],
};

// --- A second song ---------------------------------------------------------------

/** E minor held so the two fingers of G stay down and one finger is added. */
const EM_AFTER_G = fingered(mid(5, 4, 5), [3, 2, 4]);
const VERSE = [mid(5, 4, 3), EM_AFTER_G, mid(5, 5, 5), mid(7, 7, 7)];
const CHORUS = [top(5, 5, 3), top(7, 7, 5), top(7, 8, 7), top(9, 8, 7), top(9, 8, 8), top(11, 10, 10), top(12, 12, 10), top(12, 12, 10)];
const VERSE_CHART = "G | Em | C | D";
const CHORUS_CHART = "C | D | G | Em | C | D | G | G";
const SONG_TWO = bars(...VERSE, ...VERSE, ...CHORUS);
const SONG_TWO_CHART = `${VERSE_CHART} | ${VERSE_CHART} | ${CHORUS_CHART}`;

/** Advanced, last: a longer song, in a new key, on two sets of strings. */
export const SECOND_SONG: StepSpec = {
  id: "second-song",
  title: "A second song: verse low, chorus high",
  goal: "Play a sixteen-bar song in G with the verse on the middle strings and the chorus climbing the top strings, move it to other keys, and then play your own part.",
  why: "The first song was eight bars on one set of strings. A real part is longer and changes colour between sections: warm and low under a verse, bright and high for a chorus. This song is in G, with a verse of G, E minor, C and D, and a chorus that starts on C and climbs. Nothing in it is new. What is new is sixteen bars without losing your place, and using the set of strings as a choice.",
  howTo: [
    "The verse, on the D, G and B strings, D string first: G is 5, 4, 3. E minor is 5, 4, 5. C is all three strings at fret 5. D is all three at fret 7.",
    "The chorus, on the top three strings, G string first: C is 5, 5, 3. D is 7, 7, 5. G is 7, 8, 7. E minor is 9, 8, 7. Then C is 9, 8, 8, D is 11, 10, 10 and G is 12, 12, 10.",
    "In the chorus the top note climbs a step at a time, G, A, B, B, C, D, and stays on D to the end: that is why it lifts.",
  ],
  payoff: "Sixteen bars of rhythm guitar that sound like two guitar parts, in any of four keys.",
  difficultyException:
    "The same note rate as the first song, with one chord change fewer in the verse and a self-checked Exercise at the end, so the median sits a little under it. The demand is length: sixteen bars and two sets of strings in one take.",
  exercises: [
    {
      id: "verse",
      title: "The verse on the middle strings",
      purpose: "G, E minor, C and D, twice: eight bars between frets 3 and 7 on the D, G and B strings. Between G and E minor one note moves, and between E minor and C one note moves.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord, and the four bars twice.",
        "G: D string 5, G string 4, B string 3. E minor: 5, 4, 5. C: the first finger across fret 5. D: the first finger across fret 7.",
        "From G to E minor keep the third and second fingers down on the D and G strings. Lift the first finger and put the fourth on the B string at fret 5.",
      ],
      coach: "Eight bars with the band. Right notes and time after the take.",
      tab: bars(...VERSE, ...VERSE),
      position: 3,
      shifts: true,
      chords: `${VERSE_CHART} | ${VERSE_CHART}`,
      jam: ROCK("G"),
      harmony: { chordTones: true },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(0.75, 8),
      minutes: 6,
    },
    {
      id: "chorus",
      title: "The chorus up the top strings",
      purpose: "C, D, G, E minor, then C, D and two bars of G: eight bars that climb from fret 3 to fret 12 on the top three strings, with no chord played in the same place twice until the last two bars.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord.",
        "Bars 1 to 4, G string first: C is 5, 5, 3. D is 7, 7, 5. G is 7, 8, 7. E minor is 9, 8, 7.",
        "Bars 5 to 8: C is 9, 8, 8. D is 11, 10, 10. G is 12, 12, 10, for two bars.",
        "The hand moves up a little at nearly every bar line. Look at the fret you are going to before you leave.",
      ],
      coach: "Eight bars with the band. Right notes and time after the take.",
      tab: bars(...CHORUS),
      position: 3,
      shifts: true,
      chords: CHORUS_CHART,
      jam: ROCK("G"),
      harmony: { chordTones: true },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(0.75, 8),
      minutes: 6,
    },
    {
      id: "whole-song",
      title: "The whole song",
      purpose: "Sixteen bars over the band: the verse twice on the middle strings, then the chorus up the top strings.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 85. One bar on each chord.",
        "Bars 1 to 8: G, E minor, C, D, twice, on the D, G and B strings. Bars 9 to 16: C, D, G, E minor, C, D, G, G on the top three strings.",
        "The one big move is into bar 9: from the first finger across fret 7 on the middle strings to C at 5, 5, 3 on the top strings. Count the bars of the verse so the chorus does not surprise you.",
      ],
      coach: "Sixteen bars with the band. Right notes and time after the take.",
      tab: SONG_TWO,
      position: 3,
      shifts: true,
      chords: SONG_TWO_CHART,
      jam: ROCK("G"),
      harmony: { chordTones: true },
      rungs: ladder(60, 110, 5),
      passAt: 85,
      ...named(0.75, 8),
      minutes: 8,
    },
    {
      id: "whole-song-keys",
      title: "The whole song in a new key",
      purpose: "The sixteen bars moved along the neck: two frets up the chords are A, F sharp minor, D and E; two frets down they are F, D minor, B flat and C; three frets up they are B flat, G minor, E flat and F.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 85. One bar on each chord.",
        "In A, everything is two frets higher than in G: the verse starts on D string 7, G string 6, B string 5, and the chorus starts on G string 7, B string 7, top string 5.",
        VARIANT_NOTE,
      ],
      coach: "A key that changes from day to day. Right notes and time after the take.",
      vary: inKeys(SONG_TWO, SONG_TWO_CHART, { A: 2, F: -2, Bb: 3 }, ROCK, { home: "G", parts: ["the verse", "the verse", "the chorus", "the chorus"] }),
      tab: shiftFrets(SONG_TWO, 2),
      position: 5,
      shifts: true,
      chords: "A | F#m | D | E | A | F#m | D | E | D | E | A | F#m | D | E | A | A",
      jam: ROCK("A"),
      harmony: { chordTones: true },
      rungs: ladder(60, 110, 5),
      passAt: 85,
      ...named(0.75, 8),
      minutes: 8,
    },
    {
      id: "your-second-song",
      title: "Your turn: two parts of your own",
      purpose: "The same sixteen bars with shapes, strings and rhythm of your choosing. Give the verse one sound and the chorus another: a different set of strings, a different part of the neck, or a different rhythm.",
      howTo: [
        "Straight time, any rhythm you like, 60 to 90 BPM, sixteen bars that loop.",
        "Use any shapes you know on any of the three sets of strings. Decide before you start what will change when the chorus arrives. The written line is an example.",
        NOT_CHECKED_YET,
      ],
      coach: "Not checked yet. Record it and listen for the moment the chorus starts.",
      tab: SONG_TWO,
      position: 3,
      shifts: true,
      chords: SONG_TWO_CHART,
      jam: ROCK("G"),
      rungs: ladder(60, 90, 10),
      ...YOUR_TURN,
      selfCheck: [
        "Did you play the band's chord in every bar, all sixteen bars?",
        "Could a listener hear where the chorus starts?",
      ],
      minutes: 5,
    },
  ],
};
