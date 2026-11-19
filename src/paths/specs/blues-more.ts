/**
 * Blues and Pentatonics: the consolidation Steps (2026-11-18). A draft, like the
 * rest of the Path: no teacher or guitarist has reviewed it.
 *
 * The owner's note: a Path's length comes from what it teaches, and the blues is
 * a style a player stays in for months. These Steps add no new idea where the
 * Path already has one. They take an idea the player has just met and put it in
 * a new key, a new feel, a new form or a new place on the neck before the next
 * idea arrives. Their ids are new, so nobody's progress moves.
 */
import type { ExerciseSpec, StepSpec, VariantParams } from "../spec";
import type { PassBar } from "../format";
import { handAt, ladder, moveChart, pentatonic, shiftFrets, swing } from "../templates";

const TWELVE = "A7 | A7 | A7 | A7 | D7 | D7 | A7 | A7 | E7 | D7 | A7 | E7";
const QUICK = "A7 | D7 | A7 | A7 | D7 | D7 | A7 | A7 | E7 | D7 | A7 | E7";
const MINOR_TWELVE = "Am7 | Am7 | Am7 | Am7 | Dm7 | Dm7 | Am7 | Am7 | E7 | Dm7 | Am7 | E7";
const VAMP_A = "A7 | A7 | A7 | A7";

const TEXAS = { groove: "bluesTexas", key: "A blues", feel: "shuffle" } as const;
const STRAIGHT = { groove: "rock8", key: "A blues" } as const;
const MINOR = { groove: "slowBlues", key: "A minor", feel: "shuffle" } as const;
const texasIn = (key: string) => ({ groove: "bluesTexas", key: `${key} blues`, feel: "shuffle" as const });

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

/** Double stops: one attack each, timed and counted, never pitch-checked. */
function stopsTimed(): Grading {
  return {
    grade: "attacksOnly",
    alsoGraded: ["timingEvenness"],
    pass: [
      { metric: "notesHeard", min: 0.9, overBars: 4 },
      { metric: "extraNotes", max: 4, overBars: 4 },
      { metric: "timingEvenness", min: EVENNESS.shuffle, overBars: 4 },
    ],
  };
}

const YOUR_TURN = { grade: "selfChecked", example: true } as const;
const NOT_CHECKED_YET =
  "Your turn, and not checked yet: the app can't judge notes you choose, so you tick it off yourself.";

function sh(notes: string): string {
  return notes
    .trim()
    .split(/\s+/)
    .map((note, index) => `${index % 2 === 0 ? "/4t" : "/8t"} ${note}`)
    .join(" ");
}
const walkA = sh("6:5 6:9 5:7 5:9 5:10 5:9 5:7 6:9");
const walkD = sh("5:5 5:9 4:7 4:9 4:10 4:9 4:7 5:9");
const walkE = sh("5:7 5:11 4:9 4:11 4:12 4:11 4:9 5:11");

/** A written line in A, moved to a list of keys by frets. The chart moves with it. */
function movedTo(
  tab: string,
  chart: string,
  shifts: Readonly<Record<string, number>>,
  allowed: readonly string[] = [],
) {
  return {
    values: { key: Object.keys(shifts) },
    pooled: ["key"] as const,
    label: (p: VariantParams) => `In ${p.key}`,
    build: (p: VariantParams) => {
      const shift = shifts[p.key];
      const moved = shiftFrets(tab, shift);
      return {
        tab: moved,
        position: handAt(moved),
        shifts: true,
        chords: moveChart(chart, shift),
        jam: texasIn(p.key),
        harmony: {
          scaleOverChords: [p.key, "minorPentatonic"] as [string, string],
          allowed: allowed.map((n) => moveChart(n, shift).trim()),
        },
      };
    },
  };
}

// The Step 1 lines, written again here so they can be moved.
const BOX_LOOP = `/8 6:5 6:8 5:5 5:7 4:5 4:7 3:5 3:7 | /8 2:5 2:8 1:5 1:8 /2 1:5 | /8 2:8 2:5 3:7 3:5 /4 4:7 4:5 | /8 5:7 5:5 /4 6:8 /2 6:5`;
const A_RIFFS = `/8 6:5 6:8 5:5 6:8 6:5 6:8 5:5 5:7 | /8 4:7 3:5 3:7 3:5 4:7 4:5 5:7 4:5 | /8 1:5 1:8 1:5 2:8 2:5 2:8 1:5 2:8 | /8 2:5 3:7 3:5 3:7 /2 4:7`;
const FIRST_LICK = `/8 1:5 1:8 1:5 2:8 2:5 3:7 3:5 3:7 | /4 4:7 /8 3:5 4:5 /2 4:7`;
const FIRST_CHORUS = [
  "/8 1:5 1:8 1:5 2:8 2:5 3:7 3:5 3:7",
  "/4 4:7 /8 3:5 4:5 /2 4:7",
  "/8 6:5 6:8 5:5 6:8 6:5 6:8 5:5 5:7",
  "/8 4:7 3:5 3:7 3:5 4:7 4:5 5:7 4:5",
  "/8 1:5 1:8 1:5 2:8 2:5 3:7 3:5 3:7",
  "/4 4:7 /8 3:5 4:5 /2 4:7",
  "/8 6:5 6:8 5:5 6:8 6:5 6:8 5:5 5:7",
  "/8 4:7 3:5 3:7 3:5 4:7 4:5 5:7 4:5",
  "/8 2:5 2:8 2:5 3:7 3:5 3:7 3:5 4:7",
  "/8 3:7 3:5 4:7 4:5 4:7 3:5 4:7 4:5",
  "/2 4:7 /8 3:5 4:7 4:5 5:5",
  "/2 5:7 /2 r",
].join(" | ");

// Straight-eighth riffs: the root of each chord, then box 1 around it.
const RIFF_A = "/8 6:5 6:5 6:8 6:5 5:5 6:5 5:7 5:5";
const RIFF_D = "/8 5:5 5:5 5:7 5:5 4:5 5:5 4:7 4:5";
const RIFF_E = "/8 5:7 5:7 4:5 5:7 4:7 5:7 4:5 5:7";
const RIFF_END = "/8 5:7 4:5 4:7 4:5 /2 5:7";
const STRAIGHT_CHORUS = [RIFF_A, RIFF_A, RIFF_A, RIFF_A, RIFF_D, RIFF_D, RIFF_A, RIFF_A, RIFF_E, RIFF_D, RIFF_A, RIFF_END].join(" | ");

// The A7 arpeggio and its lick to the third, as in the chord-tone Step.
const ARP_TO_THIRD = `/8 6:5 5:4 5:7 4:5 4:7 3:6 2:5 2:8 | /8 2:8 2:5 3:7 3:5 /2 3:6`;

// A chorus where every phrase stops on the chord's third: C#, F#, G#.
const LANDING_CHORUS = [
  "/8 4:7 3:5 3:7 3:5 /2 3:6",
  "/2 4:7 /2 r",
  "/8 2:5 2:8 2:5 3:7 /2 3:6",
  "/4 4:7 4:5 /2 4:7",
  "/8 3:5 3:7 2:5 3:7 /2 4:4",
  "/2 5:5 /2 r",
  "/8 4:7 3:5 3:7 3:5 /2 3:6",
  "/2 4:7 /2 r",
  "/8 2:5 3:7 3:4 3:7 /2 4:6",
  "/8 3:5 3:7 3:5 4:7 /2 4:4",
  "/8 2:5 3:7 3:5 3:6 /2 4:7",
  "/2 5:7 /2 r",
].join(" | ");

const QUICK_CHORUS = [
  "/8 2:5 2:8 1:5 2:8 /2 2:5",
  "/8 3:7 3:5 4:7 4:7 /2 4:4",
  "/8 2:5 2:8 1:5 2:8 /2 2:5",
  "/8 2:5 3:7 3:5 3:6 /2 4:7",
  "/8 3:5 3:7 2:5 3:7 /2 3:5",
  "/8 4:4 4:7 3:5 4:7 /2 5:5",
  "/8 4:7 3:5 3:7 3:5 /2 3:6",
  "/2 4:7 /2 r",
  "/8 3:4 3:7 2:5 3:7 /2 4:6",
  "/8 3:5 4:7 4:4 4:7 /2 5:5",
  "/8 4:7 3:5 3:6 2:5 /4 2:8 2:5",
  "/2 5:7 /2 r",
].join(" | ");

const MINOR_ARPS = `/8 6:5 6:8 5:7 4:5 4:7 3:5 2:5 2:8 | /8 1:5 2:8 2:5 3:5 /2 4:7 | /8 5:5 5:8 4:7 3:5 3:7 2:6 1:5 1:8 | /8 2:6 3:7 3:5 3:7 /2 2:6`;
const MINOR_TURN = `/8 2:5 3:7 3:4 3:7 /2 4:6 | /8 3:7 2:6 1:5 3:7 /2 2:6 | /8 2:5 3:5 4:7 3:5 /2 4:7 | /4 5:7 4:6 /2 5:7`;
const MINOR_CHORUS = [
  "/8 1:5 1:8 1:5 2:8 /2 2:5",
  "/2 3:5 /2 r",
  "/8 1:5 1:8 1:5 2:8 /2 2:5",
  "/8 3:5 3:7 3:5 4:7 /2 5:7",
  "/8 2:6 1:5 1:8 1:5 /2 2:6",
  "/2 3:7 /2 r",
  "/8 2:5 2:8 2:5 3:5 /2 4:7",
  "/2 3:5 /2 r",
  "/8 3:4 3:7 2:5 3:7 /2 4:6",
  "/8 2:6 3:7 3:5 3:7 /2 2:6",
  "/8 2:5 3:5 4:7 3:5 /2 4:7",
  "/2 5:7 /2 r",
].join(" | ");

const NECK_LINE = `/8 4:7 3:5 3:7 3:5 3:7s 3:9 /4 2:8 | /8 2:8 2:10 1:8 1:10s 1:12 2:13 /4 1:12 | /8 1:12 1:10 2:13 2:10 /2 3:12 | /8 3:12 3:9 4:12 3:9 /2 2:10`;

// Sixths on the G and top strings: one shape per chord of the blues.
const SIX_A = "3:6f2+1:5f1";
const SIX_D = "3:5f2+1:5f3";
const SIX_E = "3:7f2+1:7f3";
const SIX_9 = "3:9f2+1:9f3";
const sixBar = (stop: string) => `/2 ${stop} ${stop}`;
const SIXTHS_TWELVE = [SIX_A, SIX_A, SIX_A, SIX_A, SIX_D, SIX_D, SIX_A, SIX_A, SIX_E, SIX_D, SIX_A, SIX_E].map(sixBar).join(" | ");

/** Beginner, after box 1: the same lines in other keys. */
export const BOX_KEYS: StepSpec = {
  id: "box-keys",
  title: "The box in other keys",
  goal: "Move box 1 to G, C and E and play the lines you already know there, then a whole chorus in a key that changes.",
  why: "The box is a shape, and a shape can start on any fret. The note under your first finger on the low E string names the key: fret 3 is G, fret 5 is A, fret 8 is C, fret 12 is E. Songs are not all in A, and the first time a band calls a blues in G you want your hand to go to fret 3 without thinking. Nothing here is new to the fingers. What is new is finding home somewhere else.",
  howTo: [
    "Find the root on the low E string with your first finger, and the box is under your hand: the same frets as before, counted from there.",
    "Before you play, find the three roots in the new place, as you found the three A's. They are in the same spots in the shape: low E string under the first finger, D string under the third, high E under the first.",
    "Low on the neck the frets are wider and high up they are narrower. Give yourself a slower tempo for the first take in each new place.",
  ],
  payoff: "The box is no longer a place at the fifth fret. It goes where the key goes.",
  exercises: [
    {
      id: "box-in-g",
      title: "The box in G",
      purpose: "The four-bar box loop from Step 1, two frets lower, over a band in G. Same fingers, same order, a new home.",
      howTo: [
        "Shuffle eighths, 50 BPM up to a pass at 80. First finger on fret 3, third finger on fret 5, fourth on fret 6.",
        "Bar 1 climbs from the low G at fret 3 to C on the G string. Bar 2 goes over the top two strings and holds the high G for two beats. Bar 3 comes down to the G on the D string, fret 5, on beat 3, then F. Bar 4 ends on the low G, held.",
        "Say 'G' on each of the three G's as you pass them.",
      ],
      coach: "The same line as Step 1, two frets down. I check the notes and the shuffle after the take.",
      tab: swing(shiftFrets(BOX_LOOP, -2)),
      position: 3,
      chords: "G7 | G7 | G7 | G7",
      jam: texasIn("G"),
      harmony: { scaleOverChords: ["G", "minorPentatonic"] },
      rungs: ladder(50, 110, 10),
      passAt: 80,
      ...lick("shuffle"),
      minutes: 5,
    },
    {
      id: "riffs-in-c",
      title: "Three C's in the box at the eighth fret",
      purpose: "The riff that starts from each root in turn, moved up to C. Low, middle and high C, each opening a bar.",
      howTo: [
        "Shuffle eighths, 50 BPM up to a pass at 80. First finger on fret 8.",
        "Bar 1 starts on the low C (low E string, fret 8). Bar 2 starts on the middle C (D string, fret 10). Bar 3 starts on the high C (high E string, fret 8). Bar 4 comes down and holds the middle C for two beats.",
        "The frets are closer together here than at the fifth fret. Keep one finger per fret and let the hand feel smaller.",
      ],
      coach: "The first three bars each start on a C, and the last one lands on a C. I check the notes and the shuffle after the take.",
      tab: swing(shiftFrets(A_RIFFS, 3)),
      position: 8,
      chords: "C7 | C7 | C7 | C7",
      jam: texasIn("C"),
      harmony: { scaleOverChords: ["C", "minorPentatonic"] },
      rungs: ladder(50, 100, 10),
      passAt: 80,
      ...lick("shuffle"),
      minutes: 5,
    },
    {
      id: "lick-in-e",
      title: "Your first lick, at the twelfth fret",
      purpose: "The two-bar lick from Step 1 in E, up at the twelfth fret where the double dots are. E is the key guitar players call most often.",
      howTo: [
        "Shuffle eighths, 55 BPM up to a pass at 90. First finger on fret 12, third finger on fret 14, fourth on fret 15.",
        "Bar 1 comes down from the high E at fret 12 on the top string to the G string. Bar 2 lands on the E on the D string, fret 14, and holds it at the end for two beats.",
        "If the body of the guitar is in the way up here, bring your thumb round toward the bottom of the neck.",
      ],
      coach: "The same lick, seven frets up. Notes and the shuffle after the take.",
      tab: swing(shiftFrets(FIRST_LICK, 7)),
      position: 12,
      chords: "E7 | E7",
      jam: texasIn("E"),
      harmony: { scaleOverChords: ["E", "minorPentatonic"] },
      rungs: ladder(55, 110, 10),
      passAt: 90,
      ...lick("shuffle"),
      minutes: 5,
    },
    {
      id: "chorus-in-keys",
      title: "Twelve bars in a new key",
      purpose: "Your first chorus from Step 1, all twelve bars, in G, C or D. The band changes chords in the new key and the same line follows them.",
      howTo: [
        "Shuffle eighths, 50 BPM up to a pass at 80. Look at which key came up, put your first finger on its root on the low E string, and play the chorus you know from there: fret 3 for G, fret 8 for C, fret 10 for D.",
        "The form has not changed: four bars on the first chord, two on the second, two back home, then one bar each of the third chord, the second, home, and the third again.",
      ],
      coach: "Twelve written bars in a key that changes from day to day. Notes and the shuffle after the take.",
      vary: movedTo(swing(FIRST_CHORUS), TWELVE, { G: -2, C: 3, D: 5 }),
      tab: swing(shiftFrets(FIRST_CHORUS, -2)),
      position: 3,
      shifts: true,
      chords: moveChart(TWELVE, -2),
      jam: texasIn("G"),
      harmony: { scaleOverChords: ["G", "minorPentatonic"] },
      rungs: ladder(50, 100, 10),
      passAt: 80,
      ...lick("shuffle", 8),
      minutes: 6,
    },
  ],
};

/** Beginner: the same box over straight eighths. */
export const STRAIGHT_FEEL: StepSpec = {
  id: "straight-feel",
  title: "The same notes, a straight feel",
  goal: "Play box 1 in even eighths over a straight rock band, and a twelve-bar chorus of riffs that follow the chords.",
  why: "Half the blues you know is not a shuffle. Rock and roll, and most blues-rock, play the eighth notes even: one-and-two-and, both halves the same length. The notes are the same five and the form is the same twelve bars. Only the feel changes, and a player who has only shuffled will swing a straight groove without meaning to. Playing the same box both ways is how the hand learns the difference.",
  howTo: [
    "Even eighths: 'one-and-two-and', with the 'and' exactly halfway. No long-short. If it starts to lilt, you are shuffling.",
    "Pick down on the beat and up on the 'and'. The riffs here stay on the low strings; rest the side of the picking hand lightly near the bridge so they stay tight.",
    "Listen to the hi-hat. In a straight groove it plays the same even eighths you do.",
  ],
  payoff: "You can hear whether a band is shuffling or playing straight, and your eighths follow it.",
  exercises: [
    {
      id: "straight-box",
      title: "Box 1, even eighths",
      purpose: "The four-bar box loop you know, with the band playing straight. The notes are those of Step 1: the only thing to change is how long each eighth is.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 90.",
        "Up the box from the low A to D on the G string, over the top and hold the high A, down to the A on the D string, and home to the low A.",
        "Every eighth the same length. Count 'one-and-two-and' out loud for the first take.",
      ],
      coach: "Straight eighths now, so the timing bar is tighter than over the shuffle. Notes and evenness after the take.",
      tab: BOX_LOOP,
      position: 5,
      chords: VAMP_A,
      jam: STRAIGHT,
      harmony: { scaleOverChords: ["A", "minorPentatonic"] },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...lick("straight"),
      minutes: 5,
    },
    {
      id: "straight-lick",
      title: "A straight lick",
      purpose: "A two-bar lick that runs down the box in even eighths and comes home to A. The kind of line a shuffle would smooth over; here every note is on its own.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 90.",
        "Bar 1: A on the top string, then G, E, D, C, and A on the D string, then C and D on the G string. Bar 2: A on the D string for a beat, then G and A, and the A held for two beats.",
      ],
      coach: "Notes and even eighths after the take.",
      tab: `/8 1:5 2:8 2:5 3:7 3:5 4:7 3:5 3:7 | /4 4:7 /8 4:5 4:7 /2 4:7`,
      position: 5,
      chords: "A7 | A7",
      jam: STRAIGHT,
      harmony: { scaleOverChords: ["A", "minorPentatonic"] },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...lick("straight"),
      minutes: 5,
    },
    {
      id: "low-riff",
      title: "A riff on the low strings",
      purpose: "One bar on the two lowest strings, built on the low A, that loops. Blues-rock rhythm guitar is made of riffs like this one.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 90. One bar, round and round.",
        "A, A, C, A on the low E string (frets 5, 5, 8, 5), then D on the A string, the low A again, and E and D on the A string (frets 7 and 5).",
        "Down-up all the way. The two A's at the start are a down and an up on the same note.",
      ],
      coach: "One bar that loops. Notes and even eighths after the take.",
      tab: RIFF_A,
      position: 5,
      chords: "A7",
      jam: STRAIGHT,
      harmony: { scaleOverChords: ["A", "minorPentatonic"] },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...lick("straight"),
      minutes: 4,
    },
    {
      id: "straight-chorus",
      title: "Twelve bars of riffs",
      purpose: "A riff from each chord's root: from A for the A7 bars, from D for the D7 bars, from E for the E7 bar. A whole chorus of rhythm playing, all inside box 1.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 85.",
        "Over A7, the riff you just learned. Over D7 it starts on D (A string, fret 5): D, D, E, D, then G on the D string, D, and A and G on the D string. Over E7 it starts on E (A string, fret 7): E, E, G, E, A, E, G, E.",
        "Bar 12 is the ending: E, G, A, G, and E held for two beats. Then the form comes round again.",
        "Each riff starts on its chord's root. If you lose your place, listen for the bass: it is playing the same roots.",
      ],
      coach: "Twelve bars over the band. I check the notes and the even eighths after the take.",
      tab: STRAIGHT_CHORUS,
      position: 5,
      chords: TWELVE,
      jam: STRAIGHT,
      harmony: { scaleOverChords: ["A", "minorPentatonic"] },
      rungs: ladder(60, 110, 5),
      passAt: 85,
      ...lick("straight", 8),
      minutes: 6,
    },
  ],
};

/** Beginner, last: chord tones in new keys and a chorus that lands. */
export const LANDING_REVIEW: StepSpec = {
  id: "landing-review",
  title: "Landing on the third, in new keys",
  goal: "Play the arpeggio and its lick to the third in G and C, then a twelve-bar chorus whose phrases stop on each chord's third.",
  why: "You have met the two ideas that matter most at this Level: the box moves with the key, and a phrase sounds right when it stops on a note of the chord. This Step puts them together before anything new arrives. The third is the note that says whether a chord is major, so a phrase that stops on it tells the listener which chord the band is on, with no band needed.",
  howTo: [
    "The third of the home chord sits one fret above the minor pentatonic's own third: in A, C# is one fret above C. In every key it is the same move, one fret up on the same string.",
    "The thirds in A: C# over A7 (G string, fret 6), F# over D7 (D string, fret 4), G# over E7 (D string, fret 6). The F# is a fret below the box, so the first finger reaches back for it. So is the B over E7 (G string, fret 4).",
    "Hold each landing note for its full two beats. The rest of the phrase is the way there.",
  ],
  payoff: "A chorus with no band would still tell a listener where the changes are.",
  exercises: [
    {
      id: "g7-third",
      title: "G7, and a lick to B",
      purpose: "The arpeggio and lick you learned over A7, two frets lower. G7 is G, B, D, F, and the lick resolves from B flat to B.",
      howTo: [
        "Shuffle eighths, then a half note, 60 BPM up to a pass at 80.",
        "Bar 1, up: G at fret 3 on the low E, B at fret 2 on the A string, D at 5, F at 3 and G at 5 on the D string, B at 4 on the G string, D at 3 and F at 6 on the B string.",
        "Bar 2: F, D, C, B flat, then B at fret 4 on the G string for two beats.",
      ],
      coach: "The A7 line moved to G. I check each note and the timing after the take.",
      tab: swing(shiftFrets(ARP_TO_THIRD, -2)),
      position: 2,
      shifts: true,
      chords: "G7 | G7",
      jam: texasIn("G"),
      harmony: { scaleOverChords: ["G", "minorPentatonic"], allowed: ["B"] },
      rungs: ladder(60, 100, 10),
      passAt: 80,
      ...lick("shuffle"),
      minutes: 5,
    },
    {
      id: "c7-third",
      title: "C7, and a lick to E",
      purpose: "The same arpeggio and lick at the eighth fret. C7 is C, E, G, B flat, and the lick resolves from E flat to E.",
      howTo: [
        "Shuffle eighths, then a half note, 60 BPM up to a pass at 80.",
        "Bar 1, up: C at fret 8 on the low E, E at fret 7 on the A string, G at 10, B flat at 8 and C at 10 on the D string, E at 9 on the G string, G at 8 and B flat at 11 on the B string.",
        "Bar 2: B flat, G, F, E flat, then E at fret 9 on the G string for two beats.",
      ],
      coach: "The same line in C. I check each note and the timing after the take.",
      tab: swing(shiftFrets(ARP_TO_THIRD, 3)),
      position: 7,
      shifts: true,
      chords: "C7 | C7",
      jam: texasIn("C"),
      harmony: { scaleOverChords: ["C", "minorPentatonic"], allowed: ["E"] },
      rungs: ladder(60, 100, 10),
      passAt: 80,
      ...lick("shuffle"),
      minutes: 5,
    },
    {
      id: "landing-chorus",
      title: "A chorus that lands",
      purpose: "Twelve bars in A where the phrases over A7 stop on C#, the phrases over D7 stop on F#, and the phrase over E7 stops on G#. Short phrases, long landings, and the root in between.",
      howTo: [
        "Shuffle eighths and half notes, 60 BPM up to a pass at 80.",
        "Bars 1 to 4, over A7: a phrase to C# (G string, fret 6), the A held, a second phrase to C#, and a bar that sits on A.",
        "Bars 5 and 6, over D7: a phrase that ends on F# (D string, fret 4, first finger reaching back), then D held on the A string. Bars 7 and 8 are bars 1 and 2 again.",
        "Bar 9, over E7: E, D, B, D and G# (D string, fret 6). Bar 10, over D7, ends on F#. Bar 11 goes from C to C# and home to A. Bar 12 holds E over the E7.",
      ],
      coach: "Twelve written bars. I check the notes and the shuffle after the take; listen for each third as you hold it.",
      tab: swing(LANDING_CHORUS),
      position: 5,
      shifts: true,
      chords: TWELVE,
      jam: TEXAS,
      harmony: { scaleOverChords: ["A", "minorPentatonic"], allowed: ["C#", "F#", "G#", "B"] },
      rungs: ladder(60, 100, 10),
      passAt: 80,
      ...lick("shuffle", 8),
      minutes: 6,
    },
    {
      id: "landing-chorus-keys",
      title: "The same chorus in a new key",
      purpose: "The chorus that lands, in G, C or D. The thirds have new names and sit in the same places in the shape.",
      howTo: [
        "Shuffle eighths and half notes, 60 BPM up to a pass at 80. First finger's home fret is 3 for G, 8 for C, 10 for D.",
        "Play it from the shape, as you know it in A, and listen to each landing note. Name it afterwards: the third of the first chord is B in G, E in C, F# in D.",
      ],
      coach: "The chorus you know in a key that changes from day to day. Notes and the shuffle after the take.",
      vary: movedTo(swing(LANDING_CHORUS), TWELVE, { G: -2, C: 3, D: 5 }, ["C#", "F#", "G#", "B"]),
      tab: swing(shiftFrets(LANDING_CHORUS, -2)),
      position: 2,
      shifts: true,
      chords: moveChart(TWELVE, -2),
      jam: texasIn("G"),
      harmony: { scaleOverChords: ["G", "minorPentatonic"], allowed: ["B", "E", "F#", "A"] },
      rungs: ladder(60, 100, 10),
      passAt: 80,
      ...lick("shuffle", 8),
      minutes: 6,
    },
  ],
};

/** Intermediate, after the twelve-bar: the quick change. */
export const QUICK_CHANGE: StepSpec = {
  id: "quick-change",
  title: "The quick change",
  goal: "Follow the twelve-bar form when it goes to the D7 in bar 2, with roots, a boogie line and a written chorus.",
  why: "Many blues songs do not sit on the first chord for four bars. They go to the second chord in bar 2 and come straight back: the quick change. Nothing else in the form moves. A player who has learned the form by counting gets caught by it every time; a player who listens hears it coming. It is the same twelve bars with one bar different, which makes it a good test of whether you know the form or only its length.",
  howTo: [
    "The form: A7, D7, A7, A7, then D7, D7, A7, A7, then E7, D7, A7, E7. Only bar 2 is new.",
    "Before you play, listen to the band once through and point at bar 2 when the chord moves.",
    "Everything you play here uses notes and shapes you already know: the roots and the boogie line from the last Step, and the thirds from the Beginner Level. What changes is when.",
  ],
  payoff: "When a band goes to the IV chord in bar 2, you are already there.",
  exercises: [
    {
      id: "quick-roots",
      title: "Roots through the quick change",
      purpose: "One whole note a bar on the root of each chord, with the D arriving in bar 2.",
      howTo: [
        "Whole notes, one a bar, 70 BPM up to a pass at 90.",
        "A at fret 5 on the low E, D at fret 5 and E at fret 7 on the A string. Bar 2 is D, and bar 3 is A again.",
      ],
      coach: "Twelve notes, each the right root, each on the bar. Bar 2 is the one to listen for.",
      tab: swing(`/1 6:5 | 5:5 | 6:5 | 6:5 | 5:5 | 5:5 | 6:5 | 6:5 | 5:7 | 5:5 | 6:5 | 5:7`),
      position: 5,
      chords: QUICK,
      jam: TEXAS,
      harmony: { chordTones: true, cover: false },
      rungs: ladder(70, 110, 10),
      passAt: 90,
      ...lick("straight"),
      minutes: 4,
    },
    {
      id: "quick-boogie",
      title: "The boogie line through the quick change",
      purpose: "The walking line you know, with its shape moved to D for bar 2 and back for bar 3. The hand moves to D for one bar and straight back.",
      howTo: [
        "Shuffle eighths, all twelve bars, 70 BPM up to a pass at 90.",
        "Root, third, fifth, sixth, flat seven and back down, on each bar's chord. On D it starts at fret 5 on the A string; on E at fret 7 on the A string.",
        "Look at the next root during the last two notes of each bar.",
      ],
      coach: "A lot of notes and a form with a surprise in bar 2. Notes and time after the take.",
      tab: [walkA, walkD, walkA, walkA, walkD, walkD, walkA, walkA, walkE, walkD, walkA, walkE].join(" | "),
      position: 5,
      shifts: true,
      chords: QUICK,
      jam: TEXAS,
      rungs: ladder(70, 110, 10),
      passAt: 90,
      ...lick("shuffle"),
      minutes: 6,
    },
    {
      id: "quick-chorus",
      title: "A written chorus on the quick change",
      purpose: "Twelve bars of phrases that say the changes: F# over the D7 in bar 2, C# once the A7 is back, G# over the E7.",
      howTo: [
        "Shuffle eighths and half notes, 60 BPM up to a pass at 80.",
        "Bar 1 is a phrase around E on the B string and the A above it, ending on the E. Bar 2, over D7, comes down to A and stops on F# (D string, fret 4). Bar 3 is bar 1 again, and bar 4 goes from C to C# and home to A.",
        "Bars 5 and 6, over D7: a phrase around C, then F#, A, C, A and down to D. Bar 7 lands on C# and bar 8 holds A.",
        "Bar 9, over E7, starts on B and ends on G# (D string, fret 6). Bar 10 ends on D. Bar 11 goes A, C, C#, E, G, E, and bar 12 holds E on the A string, fret 7.",
      ],
      coach: "Twelve written bars. Notes and the shuffle after the take.",
      tab: swing(QUICK_CHORUS),
      position: 5,
      shifts: true,
      chords: QUICK,
      jam: TEXAS,
      harmony: { scaleOverChords: ["A", "minorPentatonic"], allowed: ["C#", "F#", "G#", "B"] },
      rungs: ladder(60, 100, 10),
      passAt: 80,
      ...lick("shuffle", 8),
      minutes: 6,
    },
  ],
};

/** Intermediate, last: the minor blues. */
export const MINOR_BLUES: StepSpec = {
  id: "minor-blues",
  title: "The minor blues",
  goal: "Play the arpeggios of Am7 and Dm7, find the F and the G# that a minor blues needs, and play a written chorus over the minor form.",
  why: "A minor blues has the same twelve bars with minor chords on the first two: Am7 and Dm7, and still E7 for the turn. The good news is that the box fits the first chord perfectly, since Am7 is four of its five notes. The catch is the Dm7: its third is F, and there is no F in the box. Play the box's E over a Dm7 for long and it sounds unsure. One new note, F on the B string, fixes it, and G# over the E7 does the rest.",
  howTo: [
    "Am7 is A, C, E, G: all in box 1. Dm7 is D, F, A, C: F is at fret 6 on the B string, one fret above the box's E, and at fret 8 on the A string. E7 is E, G#, B, D, as before.",
    "Over Dm7, play F where you would have played E. Over Am7, go back to E. It is a one-fret move up on one string, like C to C#. This time the higher note is the minor one.",
    "A minor blues is usually slower and sadder. Leave the long notes long.",
  ],
  payoff: "A slow minor chorus where the F arrives with the Dm7 and the G# with the E7.",
  exercises: [
    {
      id: "am7-dm7",
      title: "Am7 and Dm7, one note at a time",
      purpose: "Each chord as an arpeggio from its root, then a short phrase that ends on one of its notes. Two bars on Am7, two on Dm7.",
      howTo: [
        "Shuffle eighths and half notes, 50 BPM up to a pass at 70.",
        "Bar 1, Am7 up: A and C on the low E (frets 5 and 8), E on the A string (7), G and A on the D string (5 and 7), C on the G string (5), E and G on the B string (5 and 8). Bar 2 comes down from the high A to the A on the D string.",
        "Bar 3, Dm7 up: D and F on the A string (frets 5 and 8), A on the D string (7), C and D on the G string (5 and 7), F on the B string (6), A and C on the top string (5 and 8). Bar 4: F, D, C, D, and F held.",
      ],
      coach: "Two arpeggios and two short phrases. Notes and the shuffle after the take.",
      tab: swing(MINOR_ARPS),
      position: 5,
      loops: false,
      chords: "Am7 | Am7 | Dm7 | Dm7",
      jam: MINOR,
      harmony: { scaleOverChords: ["A", "naturalMinor"] },
      rungs: ladder(50, 90, 10),
      passAt: 70,
      ...lick("slow"),
      minutes: 5,
    },
    {
      id: "the-turn",
      title: "E7, Dm7, Am7, E7",
      purpose: "The last four bars of the minor form, where every chord has its own note: G# over E7, F over Dm7, A over Am7, and G# again.",
      howTo: [
        "Shuffle eighths and half notes, 50 BPM up to a pass at 70.",
        "Bar 1, over E7: E, D, B, D, and G# held (D string, fret 6). Bar 2, over Dm7: D, F, A, D, and F held. Bar 3, over Am7: E, C, A, C, and A held. Bar 4, over E7: E and G# as quarter notes, then E on the A string held.",
      ],
      coach: "Four bars, four chords. Notes and the shuffle after the take.",
      tab: swing(MINOR_TURN),
      position: 4,
      shifts: true,
      chords: "E7 | Dm7 | Am7 | E7",
      jam: MINOR,
      harmony: { scaleOverChords: ["A", "naturalMinor"], allowed: ["G#"] },
      rungs: ladder(50, 90, 10),
      passAt: 70,
      ...lick("slow"),
      minutes: 5,
    },
    {
      id: "minor-chorus",
      title: "A written minor chorus",
      purpose: "All twelve bars of a minor blues: a phrase said twice over Am7, answered with F over Dm7, and brought home through the turn you just learned.",
      howTo: [
        "Shuffle eighths and half notes, 50 BPM up to a pass at 70.",
        "Bars 1 to 4, over Am7: A, C, A, G and E held; then C held; the first phrase again; then C, D, C, A and E on the A string held.",
        "Bars 5 and 6, over Dm7: F, A, C, A and F held, then D held. Bars 7 and 8, back on Am7: E, G, E, C and A held, then C held.",
        "Bars 9 to 12 are close to the turn from the last Exercise: G# over E7, F over Dm7, A over Am7, and E held over the last E7.",
      ],
      coach: "Twelve written bars, slow. Notes and the shuffle after the take.",
      tab: swing(MINOR_CHORUS),
      position: 5,
      shifts: true,
      chords: MINOR_TWELVE,
      jam: MINOR,
      harmony: { scaleOverChords: ["A", "naturalMinor"], allowed: ["G#"] },
      rungs: ladder(50, 90, 10),
      passAt: 70,
      ...lick("slow", 8),
      minutes: 6,
    },
    {
      id: "your-minor-chorus",
      title: "Your turn: F over the Dm7",
      purpose: "Free playing over Am7 and Dm7 with one rule: E while the band is on Am7, F while it is on Dm7.",
      howTo: [
        "Shuffle, 50 to 70 BPM, two bars of Am7 and two of Dm7, four bars that loop.",
        "Play as little as you like. An E held over the Am7 and an F held over the Dm7 is a complete answer. The written line is an example.",
        NOT_CHECKED_YET,
      ],
      coach: "Not checked yet. Record it and listen for the F arriving with the chord.",
      tab: swing(MINOR_ARPS),
      position: 5,
      chords: "Am7 | Am7 | Dm7 | Dm7",
      jam: MINOR,
      rungs: ladder(50, 70, 5),
      ...YOUR_TURN,
      selfCheck: [
        "Did you play F over the Dm7 and E over the Am7, at least once each?",
        "Did your long notes last as long as you meant them to?",
      ],
      minutes: 4,
    },
  ],
};

/** Advanced, after the two boxes: two more, up to the octave. */
export const UP_THE_NECK: StepSpec = {
  id: "up-the-neck",
  title: "Boxes 3 and 4: up to the twelfth fret",
  goal: "Play the next two pentatonic boxes, find the second door between box 2 and box 3, and play one line from the fifth fret to the twelfth.",
  why: "Two boxes gave you one door. Two more take you to the twelfth fret, where the neck starts again an octave up, and after that there is only one shape left to learn. The reason to go there is the sound: the same notes further up the neck sit on thicker strings and sound fuller, and the top of box 3 reaches notes box 1 does not have. Learn each box by where its A's are, as before, and box 3 by the one slide that gets you into it.",
  howTo: [
    "Box 3 sits at frets 9 to 13: A is at fret 12 on the A string and fret 10 on the B string. Box 4 sits at frets 12 to 15: A is at fret 12 on the A string, the same A as in box 3, and at fret 14 on the G string.",
    "The second door is a slide on the top string from D at fret 10 to E at fret 12, with the third finger. It puts your hand in box 3.",
    "Go slowly through each new box and say the A's as you pass them. A shape with no roots in it is only a pattern.",
  ],
  payoff: "One line that climbs from the fifth fret to the twelfth, with no seam.",
  exercises: [
    {
      id: "box-three",
      title: "Box 3, up and down",
      purpose: "The third shape on its own. The same five notes, starting from D at the tenth fret.",
      howTo: [
        "Straight eighths, two to a click, 60 BPM up to a pass at 80.",
        "Up and back. The A's are at fret 12 on the A string and fret 10 on the B string.",
      ],
      coach: "Right notes and even eighths after the take.",
      tab: `/8 ${pentatonic({ root: "A", box: 3, sequence: "updown" })} hold`,
      position: 9,
      harmony: { scale: ["A", "minorPentatonic"], cover: true },
      click: 2,
      rungs: ladder(60, 110, 10),
      passAt: 80,
      ...lick("straight"),
      minutes: 5,
    },
    {
      id: "box-four",
      title: "Box 4, up and down",
      purpose: "The fourth shape, from E at the twelfth fret. Its top half is where a lot of high blues bends live.",
      howTo: [
        "Straight eighths, two to a click, 60 BPM up to a pass at 80.",
        "Up and back. The A's are at fret 12 on the A string and fret 14 on the G string, and the low E string starts on E at fret 12.",
      ],
      coach: "Right notes and even eighths after the take.",
      tab: `/8 ${pentatonic({ root: "A", box: 4, sequence: "updown" })} hold`,
      position: 12,
      harmony: { scale: ["A", "minorPentatonic"], cover: true },
      click: 2,
      rungs: ladder(60, 110, 10),
      passAt: 80,
      ...lick("straight"),
      minutes: 5,
    },
    {
      id: "second-door",
      title: "The second door",
      purpose: "A two-bar lick from box 2 into box 3 through a slide on the top string, coming home to the A at the tenth fret.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 80.",
        "Bar 1: G and A on the B string (frets 8 and 10), C on the top string (8), then D at fret 10 slid up to E at fret 12 with the third finger, C on the B string (13), and E again for a beat. Pick the first note of the slide only.",
        "Bar 2: C and A on the B string (13 and 10), G and E on the G string (12 and 9), and A on the B string, fret 10, held.",
      ],
      coach: "A slid-to note can be too quiet for me, so the bar allows for it. The picked notes are checked.",
      tab: `/8 2:8 2:10 1:8 1:10s 1:12 2:13 /4 1:12 | /8 2:13 2:10 3:12 3:9 /2 2:10`,
      position: 8,
      shifts: true,
      harmony: { scale: ["A", "minorPentatonic"], cover: true },
      click: 2,
      rungs: ladder(60, 100, 5),
      passAt: 80,
      ...lick("straight"),
      minutes: 5,
    },
    {
      id: "fifth-to-twelfth",
      title: "From the fifth fret to the twelfth",
      purpose: "Four bars over the band that go through both doors: box 1, the slide on the G string into box 2, the slide on the top string into box 3, and home on a high A.",
      howTo: [
        "Shuffle eighths, 65 BPM up to a pass at 85. It does not loop: the line ends high.",
        "Bar 1 is the first door: A, C, D, C, then D slid to E on the G string, and G on the B string. Bar 2 is the second door: G, A, C, then D slid to E on the top string, C, and E.",
        "Bar 3 comes down box 3: E, D, C, A, and G held on the G string at fret 12. Bar 4: G, E, D, E, and the A at fret 10 on the B string, held.",
      ],
      coach: "Notes and the shuffle after the take. Get both slides clean and the rest follows.",
      tab: swing(NECK_LINE),
      position: 5,
      shifts: true,
      loops: false,
      chords: VAMP_A,
      jam: TEXAS,
      harmony: { scaleOverChords: ["A", "minorPentatonic"] },
      rungs: ladder(65, 100, 5),
      passAt: 85,
      ...lick("shuffle"),
      minutes: 6,
    },
  ],
};

/** Advanced: sixths, the two-note sound of the blues. */
export const SIXTHS: StepSpec = {
  id: "sixths",
  title: "Sixths",
  goal: "Play two-note sixths on the G and top strings over A7, D7 and E7, through the whole form and at the end of a lick.",
  why: "A sixth is two notes six scale steps apart. On the guitar here that means two notes of the chord with a string between them, and it is the sound of a great many blues intros, fills and endings. One small shape gives you A7; move the lower note down a fret and it is D7; move the whole shape up two frets from there and it is E7. That is the whole form in three shapes that sit within three frets of each other, which makes sixths the easiest way to play the changes with more than one note.",
  howTo: [
    "A7: C# on the G string (fret 6) with A on the top string (fret 5). D7: C on the G string (fret 5) with A on the top string (fret 5). E7: D on the G string (fret 7) with B on the top string (fret 7).",
    "The B string between them must not ring. Either pick the G string and pluck the top string with your middle finger, or let the fretting finger on the G string lean on the B string and strum through all three.",
    "Up the neck, the A7 sixths walk: frets 6 and 5, then 7 and 7, then 9 and 9. The first is slanted, the next two are straight across.",
  ],
  payoff: "The twelve bars played in sixths, and a lick that ends on one.",
  exercises: [
    {
      id: "a7-sixths",
      title: "Three sixths over A7",
      purpose: "The walk up and back: C# with A, D with B, E with C#. Two bars, slow, to get both notes sounding together and the middle string quiet.",
      howTo: [
        "Quarter notes and half notes, 60 BPM up to a pass at 80.",
        "Bar 1: frets 6 and 5, then 7 and 7, then 9 and 9 held. Bar 2 comes back: 9 and 9, 7 and 7, then 6 and 5 held. The G string's fret is given first.",
        "Second finger on the G string and first on the top string for the slanted shape; second and third for the straight ones.",
      ],
      coach: "Two notes at once are one attack to me: I time them and count them, and the pitch is for your ear.",
      tab: `/4 ${SIX_A} ${SIX_E} /2 ${SIX_9} | /4 ${SIX_9} ${SIX_E} /2 ${SIX_A}`,
      position: 5,
      shifts: true,
      pick: "free",
      chords: "A7 | A7",
      jam: TEXAS,
      rungs: ladder(60, 100, 10),
      passAt: 80,
      ...stopsTimed(),
      minutes: 5,
    },
    {
      id: "sixths-twelve",
      title: "Twelve bars in sixths",
      purpose: "One sixth for each chord, two to a bar, through the whole form. The change from A7 to D7 is one note moving one fret.",
      howTo: [
        "Half notes, two a bar, 70 BPM up to a pass at 90.",
        "A7: G string fret 6, top string fret 5. D7: G string fret 5, top string fret 5. E7: frets 7 and 7. The second finger stays on the G string the whole way and slides: down a fret for D7, where the third finger takes the top string, and up two frets from there for E7. Follow the form: four bars of A7, two of D7, two of A7, then E7, D7, A7, E7.",
        "Let each one ring for its two beats and keep the B string quiet.",
      ],
      coach: "Timed and counted, two notes as one attack. Whether both notes rang is for your ear.",
      tab: SIXTHS_TWELVE,
      position: 5,
      pick: "free",
      chords: TWELVE,
      jam: TEXAS,
      rungs: ladder(70, 110, 10),
      passAt: 90,
      ...stopsTimed(),
      minutes: 5,
    },
    {
      id: "lick-to-sixth",
      title: "A lick that ends on a sixth",
      purpose: "Two bars over A7: a short line up through the blue third, answered by the walk down in sixths. Single notes and two-note shapes in one phrase.",
      howTo: [
        "Shuffle eighths, then quarter and half notes, 60 BPM up to a pass at 80.",
        "Bar 1: A on the D string, C and C# on the G string (frets 5 and 6), E on the B string, then the A7 sixth held: G string fret 6 with top string fret 5.",
        "Bar 2: the sixths at 9 and 9, then 7 and 7, then 6 and 5 held.",
      ],
      coach: "Timed and counted. The sixths are one attack each, and the pitch is for your ear.",
      tab: swing(`/8 4:7f3 3:5f1 3:6f2 2:5f1 /2 ${SIX_A} | /4 ${SIX_9} ${SIX_E} /2 ${SIX_A}`),
      position: 5,
      shifts: true,
      pick: "free",
      chords: "A7 | A7",
      jam: TEXAS,
      rungs: ladder(60, 100, 10),
      passAt: 80,
      ...stopsTimed(),
      minutes: 5,
    },
  ],
};
