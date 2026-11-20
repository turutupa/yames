/**
 * Know the Neck: three more consolidation Steps (2026-11-19). Drafts, like the
 * Path they belong to.
 *
 * The Path met roots, fourths and fifths once, and its Advanced Level met each
 * idea once, in one key: the five boxes in A minor, following the changes over
 * Am, F, C, G. These Steps take the same three ideas somewhere else and add
 * nothing new: the roots of two progressions in G and in D, the five boxes in E
 * minor from the nut to fret 12, and the landing idea over G, E minor, C and D.
 * Every id is new, so nobody's progress moves.
 */
import type { ExerciseSpec, StepSpec, VariantBuild } from "../spec";
import type { PassBar } from "../format";
import { handAt, ladder, pentatonic, repeat, shiftFrets } from "../templates";

// Copied from know-the-neck.ts, never imported from it: that file imports this one.
type Grading = Pick<ExerciseSpec, "grade" | "alsoGraded" | "pass">;

/** Written single-note lines: right notes first, then notes heard, extras and a loose timing bar. */
function named(evenness = 0.75, overBars = 4): Grading {
  const bars: PassBar[] = [
    { metric: "noteIdentity", min: 0.9, overBars },
    { metric: "notesHeard", min: 0.9, overBars },
    { metric: "extraNotes", max: 4, overBars: 4 },
    { metric: "timingEvenness", min: evenness, overBars },
  ];
  return { grade: "written", alsoGraded: ["timingEvenness"], pass: bars };
}

const YOUR_TURN = { grade: "selfChecked", example: true } as const;
const NOT_CHECKED_YET =
  "Your turn, and not checked yet: the app can't judge notes you choose, so you tick it off yourself.";

const ROCK = (key: string) => ({ groove: "rock8", key });

// --- Intermediate, after `roots`: the same roots in G and in D ---------------

// One, four, five, four: a root on the low E string, and a root on the A string.
const G_ROOTS = `/4 ${repeat("6:3f1", 4)} | ${repeat("5:3f1", 4)} | ${repeat("5:5f3", 4)} | ${repeat("5:3f1", 4)}`;
const D_ROOTS = `/4 ${repeat("5:5f3", 4)} | ${repeat("6:3f1", 4)} | ${repeat("6:5f3", 4)} | ${repeat("6:3f1", 4)}`;
// One, six, four, five: the six is three frets below the one on its own string.
const G_ROOTS_SIX = `/8 ${repeat("6:3f1", 8)} | ${repeat("6:0", 8)} | ${repeat("5:3f1", 8)} | ${repeat("5:5f3", 8)}`;
const D_ROOTS_SIX = `/8 ${repeat("5:5f3", 8)} | ${repeat("5:2f1", 8)} | ${repeat("6:3f1", 8)} | ${repeat("6:5f3", 8)}`;

/**
 * Intermediate, straight after `roots`: that Step found one, four and five from
 * a root on the low E string in five keys with a click, and played the roots of
 * a band's chords in A and in A minor. Here both happen at once, in two keys
 * the Path has not put under a band, and D puts the root on the A string.
 */
export const ROOTS_OTHER_KEYS: StepSpec = {
  id: "roots-other-keys",
  title: "Roots in G and in D",
  goal: "Find the roots of one, four, five and of one, six, four, five in G and in D on the low E and A strings, by shape, and play them under a band.",
  why: "The shape from the last Step starts from a root on the low E string. A root on the A string turns it over: the five is at the same fret on the low E string, and the four is two frets below that. With both ways round, the roots of a song in G or in D are three or four places within a few frets of each other, and you can name each one as the band reaches it.",
  howTo: [
    "From a root on the low E string, the four chord's root is at the same fret on the A string, and the five chord's root is two frets higher on the A string. In G: the low E string at fret 3, then the A string at 3 and at 5.",
    "From a root on the A string, the five chord's root is at the same fret on the low E string, and the four chord's root is two frets lower on the low E string. In D: the A string at fret 5, then the low E string at 5 and at 3.",
    "The six chord is the minor chord on the sixth note of the key: E minor in G, B minor in D. Its root is three frets below the one chord's root, on the same string: the open low E string in G, the A string at fret 2 in D.",
    "Say each root's name as its chord arrives. A minor chord's root is named like any other: E for E minor, B for B minor.",
  ],
  payoff: "You follow one, four, five and one, six, four, five in G and in D with a band, from a root on either of the two low strings.",
  difficultyException:
    "Roots only, each one repeated through its bar, with none of the fifths and octaves that made the string changes and hand moves of the Step before. The demand is a root on the A string, a progression of four chords and naming each root under a band, which the metric does not count.",
  exercises: [
    {
      id: "g-one-four-five",
      title: "One, four, five in G, with the band",
      purpose: "G, C and D over a rock band, roots only, four to a bar. The shape from a root on the low E string, with the chords changing over it.",
      howTo: [
        "Quarter notes, 60 BPM up to a pass at 90.",
        "G: low E string 3. C: A string 3. D: A string 5. Then C again, and the loop comes back to G.",
        "First finger at fret 3 on both strings, third finger at fret 5.",
        "Say the chord's name on beat 1 of each bar.",
      ],
      coach: "Band on. Right notes and steady quarters after the take.",
      tab: G_ROOTS,
      position: 3,
      chords: "G | C | D | C",
      jam: ROCK("G"),
      harmony: { chordTones: true },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(0.8),
      minutes: 5,
    },
    {
      id: "d-one-four-five",
      title: "One, four, five in D, with the band",
      purpose: "D, G and A over a rock band, roots only, four to a bar. The root is on the A string now, so the four and the five are on the low E string.",
      howTo: [
        "Quarter notes, 60 BPM up to a pass at 90.",
        "D: A string 5. G: low E string 3. A: low E string 5. Then G again, and the loop comes back to D.",
        "Third finger at fret 5 on both strings, first finger at fret 3.",
        "Say the chord's name on beat 1 of each bar.",
      ],
      coach: "Band on. Right notes and steady quarters after the take.",
      tab: D_ROOTS,
      position: 3,
      chords: "D | G | A | G",
      jam: ROCK("D"),
      harmony: { chordTones: true },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(0.8),
      minutes: 5,
    },
    {
      id: "g-one-six-four-five",
      title: "One, six, four, five in G",
      purpose: "G, E minor, C and D over a rock band, each root as eight even eighths. The six chord's root is the open low E string, three frets below G.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 90.",
        "G: low E string 3. E minor: the open low E string. C: A string 3. D: A string 5. Eight notes on each.",
        "First finger at fret 3, third finger at fret 5. Lift the first finger for the open string and leave the hand where it is.",
        "Say the chord's name on beat 1 of each bar.",
      ],
      coach: "Band on. Right notes and even eighths after the take.",
      tab: G_ROOTS_SIX,
      position: 3,
      chords: "G | Em | C | D",
      jam: ROCK("G"),
      harmony: { chordTones: true },
      rungs: ladder(60, 130, 10),
      passAt: 90,
      ...named(),
      minutes: 6,
    },
    {
      id: "d-one-six-four-five",
      title: "One, six, four, five in D",
      purpose: "D, B minor, G and A over a rock band, each root as eight even eighths. No open string this time: the six chord's root is the A string at fret 2, three frets below D.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 90.",
        "D: A string 5. B minor: A string 2. G: low E string 3. A: low E string 5. Eight notes on each.",
        "Third finger at fret 5 on both strings, first finger at fret 3. For B minor the first finger moves back to fret 2 and the hand goes with it, then comes up again for G.",
        "Say the chord's name on beat 1 of each bar.",
      ],
      coach: "Band on. Right notes and even eighths after the take.",
      tab: D_ROOTS_SIX,
      position: 3,
      shifts: true,
      chords: "D | Bm | G | A",
      jam: ROCK("D"),
      harmony: { chordTones: true },
      rungs: ladder(60, 130, 10),
      passAt: 90,
      ...named(),
      minutes: 6,
    },
  ],
};

// --- Advanced, after `five-boxes`: the five boxes in E minor -----------------

const E_MINOR_PENTATONIC = { scale: ["E", "minorPentatonic"] as [string, string] };

const eBox = (box: number) => `/8 ${pentatonic({ root: "E", box, sequence: "updown" })} hold`;

type BoxText = Pick<VariantBuild, "purpose" | "howTo">;

const OTHER_BOXES = "Other Takes play the other four boxes.";

/** Boxes 2 to 5 in their own words: the tempo line is the Exercise's, and each box is named by its E's. */
const E_BOX_TEXT: Record<string, BoxText> = {
  "box 2": {
    purpose: "Box 2 of E minor pentatonic, all six strings, up and back. It starts on G, at fret 3 of the low E string, and it has two E's.",
    howTo: (base) => [
      base[0],
      "Low E string 3 and 5, A string 2 and 5, D string 2 and 5, G string 2 and 4, B string 3 and 5, top string 3 and 5.",
      "The E's are the D string at fret 2 and the B string at fret 5. Find them and say where they are before you start.",
      OTHER_BOXES,
    ],
  },
  "box 3": {
    purpose: "Box 3 of E minor pentatonic, all six strings, up and back. It starts on A, at fret 5 of the low E string, and it has two E's.",
    howTo: (base) => [
      base[0],
      "Low E string 5 and 7, A string 5 and 7, D string 5 and 7, G string 4 and 7, B string 5 and 8, top string 5 and 7.",
      "The E's are the A string at fret 7 and the B string at fret 5. Find them and say where they are before you start.",
      OTHER_BOXES,
    ],
  },
  "box 4": {
    purpose: "Box 4 of E minor pentatonic, all six strings, up and back. It starts on B, at fret 7 of the low E string, and it has two E's.",
    howTo: (base) => [
      base[0],
      "Low E string 7 and 10, A string 7 and 10, D string 7 and 9, G string 7 and 9, B string 8 and 10, top string 7 and 10.",
      "The E's are the A string at fret 7 and the G string at fret 9. Find them and say where they are before you start.",
      OTHER_BOXES,
    ],
  },
  "box 5": {
    purpose: "Box 5 of E minor pentatonic, all six strings, up and back. It starts on D, at fret 10 of the low E string, and it has three E's.",
    howTo: (base) => [
      base[0],
      "Low E string 10 and 12, A string 10 and 12, D string 9 and 12, G string 9 and 12, B string 10 and 12, top string 10 and 12.",
      "The E's are the low E string at fret 12, the G string at fret 9 and the top string at fret 12. The six notes at fret 12 are the open strings an octave up: box 1 begins again there.",
      OTHER_BOXES,
    ],
  },
};

const E_BOX_ONE_UP = pentatonic({ root: "E", box: 1, sequence: "up" });
// Box 1 with the open strings, then the same twelve notes at fret 12.
const E_BOX_ONE_TWICE = `/8 ${E_BOX_ONE_UP} hold | /8 ${shiftFrets(E_BOX_ONE_UP, 12)} hold`;

/** The two-string ladder in E minor: the G and B strings from box 1 at the nut to box 5, and back down through boxes 4, 3 and 2. */
const E_LADDER = `/8 3:0 3:2f1 2:0 2:3f2 3:2f1 3:4f3 2:3f2 2:5f4 | 3:4f1 3:7f4 2:5f1 2:8f4 3:7f1 3:9f3 2:8f2 2:10f4 | 3:9f1 3:12f4 2:10f2 2:12f4 2:10f4 2:8f2 3:9f3 3:7f1 | 2:8f4 2:5f1 3:7f4 3:4f1 2:5f4 2:3f2 3:4f3 3:2f1`;
const E_THREE_OCTAVES = `/8 6:0 6:3f2 5:0 5:2f1 4:2f1 4:5f4 3:2f1 3:4f3 | 2:5f1 2:8f4 1:5f1 1:7f3 /2 1:12f4`;

/**
 * Advanced, straight after `five-boxes`. Box 1 is at the nut and not at fret
 * 12: the five boxes then climb in order from the open strings to fret 12 and
 * fit a neck of any length, and box 1 comes round again where box 5 ends, which
 * the last Exercise plays.
 */
export const BOXES_SECOND_KEY: StepSpec = {
  id: "boxes-second-key",
  title: "The boxes in a second key",
  goal: "Play the five boxes of E minor pentatonic from the nut to fret 12, name each box by where its E's are, and move between the boxes along two strings.",
  why: "Five boxes learned in one key are five shapes at five frets. Learned in a second key they become one pattern you can set down anywhere. E minor pentatonic is the A minor boxes five frets lower, so box 1 lands on the open strings and box 5 ends at fret 12, where box 1 begins again. The E's are what tell you which box you are in.",
  howTo: [
    "Each box starts on the next note of the scale on the low E string: E on the open string, G at fret 3, A at 5, B at 7, D at 10, and E again at 12.",
    "The top notes of one box are the bottom notes of the next, as they were in A minor.",
    "Find the E's in each box before you play it. Each box has two or three.",
  ],
  payoff: "The five boxes in two keys, and a climb on two strings from the open strings to fret 12.",
  difficultyException:
    "The same shapes as the Step before at the same tempo. Two of the four lines have long held notes, so there are fewer notes a second. The demand is finding the boxes and their roots at new frets, which the metric does not count.",
  exercises: [
    {
      id: "e-minor-each-box",
      title: "Each box in E minor",
      purpose: "One box of E minor pentatonic, all six strings, up and back. This is box 1, at the nut: the open strings are its lower notes, and it has three E's. A different box comes round on each Take.",
      howTo: [
        "Straight eighths, 50 BPM up to a pass at 85.",
        "Going up, every string is played open and then fretted: fret 3 on the low E string, fret 2 on the A, D and G strings, fret 3 on the B and top strings. Coming back it is the fretted note first, and the line ends on the low E string at fret 3. First finger for fret 2, second finger for fret 3: the hand is then where box 2 starts.",
        "The E's are the open low E string, the D string at fret 2 and the open top string. Find them and say where they are before you start.",
      ],
      coach: "Right notes and even eighths after the take.",
      vary: {
        values: { position: ["box 1", "box 2", "box 3", "box 4", "box 5"] },
        pooled: ["position"],
        label: (p) => `E minor pentatonic, ${p.position}`,
        build: (p) => {
          const tab = eBox(Number(p.position.slice(-1)));
          return { tab, position: handAt(tab), shifts: true, ...E_BOX_TEXT[p.position] };
        },
      },
      tab: eBox(1),
      position: 2,
      harmony: { ...E_MINOR_PENTATONIC, cover: true },
      rungs: ladder(50, 120, 10),
      passAt: 85,
      ...named(),
      minutes: 6,
    },
    {
      id: "e-minor-ladder",
      title: "The ladder in E minor",
      purpose: "The G and B strings only, four notes from each box, climbing from box 1 at the nut to box 5, which tops out at fret 12, and back down through boxes 4, 3 and 2. The joins between boxes are all there is.",
      howTo: [
        "Straight eighths, 50 BPM up to a pass at 85.",
        "Each half bar is one box. Going up it is two notes on the G string, then two on the B string. Coming down the B string is first. Box 1 is the open G string and fret 2, then the open B string and fret 3.",
        "Going up, each box starts on the higher G string note of the box before: fret 2, then 4, 7 and 9. Boxes 1 and 2 sit under one hand, with the first finger at fret 2. After that the hand moves up for each box.",
        "Two of the joins are E's: the B string at fret 5, where boxes 2 and 3 meet, and the G string at fret 9, where boxes 4 and 5 meet.",
      ],
      coach: "Right notes and even eighths after the take. The shifts are where the time moves.",
      tab: E_LADDER,
      position: 2,
      shifts: true,
      harmony: E_MINOR_PENTATONIC,
      rungs: ladder(50, 120, 10),
      passAt: 85,
      ...named(),
      minutes: 6,
    },
    {
      id: "e-minor-three-octaves",
      title: "One phrase, three octaves, from the nut",
      purpose: "E, G, A, B on the low strings, the same four notes an octave up, and again an octave above that, ending on the E at fret 12 of the top string. The phrase you played in A minor, started on the open low E string.",
      howTo: [
        "Straight eighths, 50 BPM up to a pass at 85.",
        "The open low E string and fret 3, the open A string and fret 2. Then D string 2 and 5, G string 2 and 4. Then B string 5 and 8, top string 5 and 7, and hold the top string at 12.",
        "The first octave leans on the open strings: second finger for fret 3, first finger for fret 2. The first finger then plays fret 2 on the A string and fret 2 on the D string in a row: flatten it onto the D string without lifting it. The other two octaves are one shape: first and little finger, then first and third.",
        "Each octave starts on an E: the open low E string, the D string at fret 2, the B string at fret 5.",
      ],
      coach: "Right notes and even eighths after the take.",
      tab: E_THREE_OCTAVES,
      position: 2,
      shifts: true,
      loops: false,
      harmony: E_MINOR_PENTATONIC,
      rungs: ladder(50, 120, 10),
      passAt: 85,
      ...named(),
      minutes: 5,
    },
    {
      id: "e-minor-box-one-twice",
      title: "Box 1 at the nut and at fret 12",
      purpose: "Box 1 of E minor pentatonic going up with the open strings, then the same twelve notes going up an octave higher at fret 12. One shape in two places: at fret 12 the first finger does what the nut did.",
      howTo: [
        "Straight eighths, 50 BPM up to a pass at 85.",
        "At the nut: each string open, then fret 3 on the low E string, fret 2 on the A, D and G strings, fret 3 on the B and top strings. Let the top string at fret 3 ring for two clicks, then let go and move the hand up to fret 12 before the next bar.",
        "At fret 12: each string at fret 12, then fret 15 on the low E string, fret 14 on the A, D and G strings, fret 15 on the B and top strings. Hold the last note.",
        "First finger for fret 12, third finger for fret 14, little finger for fret 15: the fingers of box 1 in A minor.",
        "The E's are in the same places in the shape both times: the low E string, the D string and the top string. Open, fret 2 and open at the nut. Frets 12, 14 and 12 higher up.",
      ],
      coach: "Right notes and even eighths after the take. The long note and the short rest after it are there for the move to fret 12.",
      tab: E_BOX_ONE_TWICE,
      position: 2,
      shifts: true,
      loops: false,
      harmony: E_MINOR_PENTATONIC,
      rungs: ladder(50, 120, 10),
      passAt: 85,
      ...named(),
      minutes: 6,
    },
  ],
};

// --- Advanced, after `the-changes`: the landing idea in G --------------------

const G_CHANGES = "G | Em | C | D";

// Three lines, one string each: the smallest moves through G, E minor, C and D.
const G_THREE_LINES = `/2 4:5f4 4:5f4 | 4:5f4 4:5f4 | 4:5f4 4:5f4 | 4:4f3 4:4f3 | 3:4f3 3:4f3 | 3:4f3 3:4f3 | 3:5f4 3:5f4 | 3:2f1 3:2f1 | 2:3f2 2:3f2 | 2:5f4 2:5f4 | 2:5f4 2:5f4 | 2:3f2 2:3f2`;
const G_ROOT_THIRD_FIFTH = `/4 4:5f4 3:4f3 2:3f2 3:4f3 | 4:2f1 4:5f4 3:4f3 4:5f4 | 5:3f2 4:2f1 4:5f4 4:2f1 | 5:5f4 4:4f3 3:2f1 4:4f3`;
// The three lines stacked, with the top string doubling the D string: up the four strings and back.
const G_ARPS = `/8 4:5f3 3:4f2 2:3f1 1:3f1 2:3f1 3:4f2 4:5f3 3:4f2 | 4:5f3 3:4f2 2:5f4 1:3f1 2:5f4 3:4f2 4:5f3 3:4f2 | 4:5f3 3:5f3 2:5f4 1:3f1 2:5f4 3:5f3 4:5f3 3:5f3 | 4:4f3 3:2f1 2:3f2 1:2f1 2:3f2 3:2f1 4:4f3 3:2f1`;
const G_LANDING_EXAMPLE = `/2 3:4 /8 2:3 3:4 3:2 4:5 | /2 4:5 /8 3:2 3:4 2:3 3:4 | /2 2:5 /8 2:3 3:5 3:4 3:2 | /2 4:4 /8 4:5 3:2 2:3 3:2`;

/**
 * Advanced, the last Step: `the-changes` taught landing on a chord tone over
 * Am, F, C, G, and `arpeggios` spelled those chords in one position. This is
 * both again over one, six, four, five in G, in second position.
 */
export const CHANGES_IN_G: StepSpec = {
  id: "changes-in-g",
  title: "Following the changes in G",
  goal: "Land on a note of each chord over G, E minor, C and D in one position, say whether it is the root, the third or the fifth, and spell each chord as an arpeggio.",
  why: "Following the changes over one progression can be a line you memorised. Over a second one, in another key, every landing has to be found again, and that is when it becomes something you can do. These four chords share notes: one note can be the root of one chord, the third of the next and the fifth of the one after. Hearing its job change while the finger stays put is the lesson here.",
  howTo: [
    "Everything here sits between frets 2 and 5. Every chord of G, E minor, C, D has its three notes there. Three of the four Exercises stay in second position: first finger at fret 2, little finger at fret 5. The arpeggios are held as chord shapes instead, so the same notes get other fingers there.",
    "The chords spelled: G is G, B, D. E minor is E, G, B. C is C, E, G. D is D, F sharp, A.",
    "On beat 1 of each bar, say the chord's name and which of its notes you are on: root, third or fifth.",
  ],
  payoff: "You can land on a note of G, E minor, C or D, say what it is in the chord, and play a line of your own over the four.",
  exercises: [
    {
      id: "g-three-lines",
      title: "One string, three jobs",
      purpose: "Three lines through G, E minor, C and D, each on one string, one note a chord, played twice. The notes hardly move while the chords change, so the same note is a root in one bar and a third or a fifth in the next.",
      howTo: [
        "Half notes, two to a bar, 60 BPM up to a pass at 90.",
        "D string, bars 1 to 4: fret 5 for three bars, then fret 4. G is the root of G, the third of E minor and the fifth of C. F sharp is the third of D.",
        "G string, bars 5 to 8: frets 4, 4, 5, 2. B is the third of G and the fifth of E minor. C is the root of C. A is the fifth of D.",
        "B string, bars 9 to 12: frets 3, 5, 5, 3. D is the fifth of G. E is the root of E minor and the third of C. D is the root of D.",
        "One finger to a fret, with the first finger at fret 2: second finger for fret 3, third for fret 4, little finger for fret 5.",
      ],
      coach: "Band on. Right notes after the take. Say root, third or fifth as each chord arrives.",
      tab: G_THREE_LINES,
      position: 2,
      chords: repeat(G_CHANGES, 3, " | "),
      jam: ROCK("G"),
      harmony: { chordTones: true },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(0.7),
      selfCheck: ["Did you say root, third or fifth as each chord arrived?"],
      minutes: 6,
    },
    {
      id: "g-root-third-fifth",
      title: "Root, third, fifth in G",
      purpose: "Each chord spelled in quarter notes: root, third, fifth, third. G, E minor, C and D, with all three notes of every chord, and the hand in second position throughout.",
      howTo: [
        "Quarter notes, 60 BPM up to a pass at 90.",
        "G: D string 5, G string 4, B string 3. E minor: D string 2 and 5, G string 4. C: A string 3, D string 2 and 5. D: A string 5, D string 4, G string 2. Each bar ends by going back to its third.",
        "One finger to a fret, with the first finger at fret 2 and the little finger at fret 5. The hand does not move.",
      ],
      coach: "Band on. Right notes and steady quarters after the take.",
      tab: G_ROOT_THIRD_FIFTH,
      position: 2,
      chords: G_CHANGES,
      jam: ROCK("G"),
      harmony: { chordTones: true },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(0.7),
      minutes: 6,
    },
    {
      id: "g-arpeggios",
      title: "G, Em, C, D as arpeggios",
      purpose: "Four chords as four small arpeggios on the top four strings, between frets 2 and 5, over a band. From G to E minor one note changes, and from E minor to C one note changes.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 90.",
        "Each bar goes up its four notes, back down to the D string, and plays the G string once more. G: 5, 4, 3, 3. E minor: 5, 4, 5, 3. C: 5, 5, 5, 3. D: 4, 2, 3, 2, from the D string to the top string.",
        "G: third finger, second finger, and the first finger flat across the B and top strings at fret 3. For E minor add the little finger on the B string at fret 5.",
        "For C lift the second finger and lay the third finger flat so it takes the G string at fret 5 as well. The little finger and the first finger stay. It is the C shape at frets 3 to 5 from Triads with the D string added, fingered another way here so that those two fingers can stay.",
        "For D the hand moves down one fret: the third finger slides to fret 4 on the D string, the first finger lies flat across the G, B and top strings at fret 2, and the second finger takes the B string at fret 3. For G again the hand moves back up one fret.",
      ],
      coach: "Band on. Right notes and time after the take.",
      tab: G_ARPS,
      position: 3,
      shifts: true,
      chords: G_CHANGES,
      jam: ROCK("G"),
      harmony: { chordTones: true },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(),
      minutes: 7,
    },
    {
      id: "g-land-on-a-chord-tone",
      title: "Your turn: land on a chord tone in G",
      purpose: "Free playing in G over G, E minor, C and D, with one rule: on beat 1 of every bar you are on a note of that chord, and you know which one.",
      howTo: [
        "Straight eighths or longer, 60 to 90 BPM.",
        "Start with one of the three one-string lines from the first Exercise, held long. Then add a few notes of the G major scale between the landings. The written line is an example: it lands on the third of each chord.",
        NOT_CHECKED_YET,
      ],
      coach: "Not checked yet. Record it and listen to beat 1 of each bar.",
      tab: G_LANDING_EXAMPLE,
      position: 2,
      chords: G_CHANGES,
      jam: ROCK("G"),
      rungs: ladder(60, 90, 10),
      ...YOUR_TURN,
      selfCheck: [
        "Did beat 1 of each bar land on the root, third or fifth of its chord?",
        "Could you say which of the three it was?",
      ],
      minutes: 5,
    },
  ],
};
