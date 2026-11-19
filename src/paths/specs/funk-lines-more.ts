/**
 * Funk Lines: consolidation Steps (2026-11-19). Drafts, like the Path they
 * belong to.
 *
 * The Path lives on one pair of chords, Am7 and D9, and meets stabs, octaves
 * and displacement once each. These Steps add nothing new for the hands. They
 * take the two stab shapes and the low line to a second pair of chords (Bm7 and
 * E9: the same shapes two frets higher), put the three-sixteenth figure and the
 * line from the 'e' onto stabs and octaves, and end on a longer form: eight
 * bars with a change of part in the middle. Every id is new, so nobody's
 * progress moves. Every line is original.
 */
import type { ExerciseSpec, StepSpec, VariantParams } from "../spec";
import type { PassBar } from "../format";
import { ladder, moveChart, repeat, shiftFrets } from "../templates";

// Copied from funk-lines.ts (a Path importing its extra Steps while they import the Path is a circular import).
const even = (min: number, overBars = 4): PassBar => ({ metric: "timingEvenness", min, overBars });
const heard = (min: number, overBars = 4): PassBar => ({ metric: "notesHeard", min, overBars });
const extras = (max: number): PassBar => ({ metric: "extraNotes", max, overBars: 4 });

/** Two notes at once are one attack: timed and counted, never pitch-checked. Extras are forgiving, since scratches may be heard. */
const STABS = { grade: "timing", pass: [even(0.8), heard(0.9), extras(6)] } as const satisfies Partial<ExerciseSpec>;
const FREE = { pick: "free" } as const satisfies Partial<ExerciseSpec>;

const SCRATCH_CHECK = "Did the picking hand keep swinging in sixteenths through the rests?";
const SHORT_CHECK = "Were the stabs short, with silence after each one?";
const DEAD_STRING_CHECK = "Was the string between the two fingers silent?";
const FOOT_CHECK = "Did your foot stay on the beat while the figure moved?";
const SAFETY =
  "Stop at any pain in the hand, wrist or forearm. A tired forearm is one thing and pain is another; pain ends the set.";

/** Said on every Exercise whose variants move the part: the words name the first version's frets. */
const VARIANT_NOTE =
  "The frets, note names and chords here are for the first version, in B minor. Other Takes move the same part to another key.";

const FUNK = { groove: "funk", key: "A minor" } as const;
const FUNK_B = { groove: "funk", key: "B minor" } as const;

/** One bar of sixteenths from four beats, each written as four tokens. */
const bar = (...beats: string[]) => `/16 ${beats.join(" ")}`;
const bars = (...all: string[]) => all.join(" | ");

// --- The home key, for the displaced figures ----------------------------------

const A = "4:7";
const G = "4:5";
const CE = "3:5+2:5"; // C and E: the top of Am7
const OCT_A = "6:5f1+4:7f3";

// --- B minor at fret 7: the Path's two shapes, two frets higher ---------------

const LOW_B = "6:7f1";
const LOW_E = "5:7f1";
const DF = "3:7f1+2:7f1"; // D and F#: the top of Bm7, and of E9
const EG = "3:9f3+2:9f4"; // E and G#: E9
const OCT_B = "6:7f1+4:9f3";
const OCT_E = "5:7f1+3:9f3";

/** Semitones from B minor. Every key keeps the part off the open strings and at or below fret 13, where any guitar can reach it. */
const KEY_SHIFT: Readonly<Record<string, number>> = { "B minor": 0, "G minor": -4, "D minor": 3, "C minor": 1 };

/** A part written in B minor at fret 7, moved by frets to other keys. The chart and the band move with it. */
function inKeys(tab: string, chart: string) {
  return {
    values: { key: Object.keys(KEY_SHIFT) },
    pooled: ["key"] as const,
    label: (p: VariantParams) => p.key,
    build: (p: VariantParams) => {
      const by = KEY_SHIFT[p.key];
      return {
        tab: shiftFrets(tab, by),
        position: 7 + by,
        shifts: true,
        chords: moveChart(chart, by),
        jam: { groove: "funk", key: p.key },
      };
    },
  };
}

// --- Intermediate: a second pair of chords -----------------------------------

const BM_STABS = bars(
  `/4 ${LOW_B} /8 ${DF} r /4 ${LOW_B} /8 ${DF} r`,
  `/4 ${LOW_E} /8 ${EG} r /4 ${LOW_E} /8 ${EG} r`,
  `/8 ${LOW_B} ${DF} r ${DF} r ${DF} r ${DF}`,
  `/8 ${LOW_E} ${EG} r ${EG} r ${EG} r ${EG}`,
);
// The hand at fret 7: first finger on the 7s, third on the A string's 9, little finger on the low E string's 10.
const BM_BAR = bar(`6:7f1 r 6:7f1 6:10f4`, `r r ${DF} r`, `5:7f1 r 5:9f3 5:7f1`, `r r ${DF} r`);
// The hand stays at fret 7: the first finger plays the root, and reaches back one fret for the G#.
const E9_BAR = bar(`5:7f1 r 5:7f1 5:9f3`, `r r ${EG} r`, `4:6f1 r 4:7f2 4:6f1`, `r r ${EG} r`);
const BM_VAMP = bars(BM_BAR, E9_BAR);

// --- Advanced: displacement on stabs and octaves -----------------------------

const STAB_THREES = `/16 ${repeat(`${CE} ${CE} r`, 5)} ${CE}`;
const OCTAVE_OFF_THE_E = bar(`${OCT_A} ${OCT_A} r ${OCT_A}`, `${OCT_A} r ${OCT_A} r`, `r ${OCT_A} r ${OCT_A}`, `${OCT_A} r ${OCT_A} r`);
const SLIDE_AND_STAB = bars(
  bar(`${A} ${G} r ${A}`, `${G} r ${A} ${G}`, `r ${A} ${G} r`, `${CE} ${CE} r r`),
  `${bar(`6:5 ${A} r ${A}`, `${G} r r r`, `r ${CE} r ${CE}`)} /4 6:5`,
);

// --- Advanced: the long form --------------------------------------------------

/** The Path's sixteenth-note octave figure: '1, and a', then the 'e' of the next beat, twice a bar. */
const octaveBar = (o: string) => bar(`${o} r ${o} ${o}`, `r ${o} r r`, `${o} r ${o} ${o}`, `r ${o} r r`);
const WALK_DOWN = bar(`${OCT_E} r ${OCT_E} ${OCT_E}`, `r ${OCT_E} r r`, `5:9f3 r 5:7f1 r`, `6:10f4 r 6:9f3 r`);
const BM_OCTAVES = bars(octaveBar(OCT_B), octaveBar(OCT_E), octaveBar(OCT_B), WALK_DOWN);
const THE_CHANGE = bars(E9_BAR, octaveBar(OCT_B));
const EIGHT_BARS = bars(BM_VAMP, BM_VAMP, BM_OCTAVES);

/** Intermediate, after the line and stab: the vamp's two shapes on a second pair of chords. */
export const SECOND_PAIR: StepSpec = {
  id: "second-pair",
  title: "The same shapes on Bm7 and E9",
  goal: "Play stabs, and a line with stabs, over Bm7 and E9: the two stab shapes of the vamp, two frets higher. Then hold the two-bar vamp with the band, in B minor and in other keys.",
  why: "The stab and the line are shapes, and shapes move. Two frets up the neck, Am7 and D9 become Bm7 and E9: the first finger's flat stab, the stab two frets above it for the second chord, and the same box of low notes, with one note a fret below it for the second chord. The line here is a new one, so the hand has to find its notes in the new place and cannot lean on what it memorised at fret 5.",
  howTo: [
    "Everything is two frets higher than on Am7 and D9. The low B is the low E string at fret 7. The Bm7 stab is D and F#: the G and B strings at fret 7, under the first finger laid flat.",
    "For E9 the stab moves up two frets, to fret 9: third and little fingers on the G and B strings, E and G#. The bass note is E, the A string at fret 7.",
    "The picking hand does what it has done all along: it swings in sixteenths, down on the beat and the 'and', up on the 'e' and the 'a', and passes over the strings on every rest.",
  ],
  payoff: "The vamp in a second key, B minor, with a line and stabs in every bar, over the band.",
  exercises: [
    {
      id: "bm-stabs",
      title: "Stabs on Bm7 and E9",
      purpose: "Four bars: the root on beats 1 and 3 with a stab on beats 2 and 4, a bar of Bm7 and a bar of E9, then the root on beat 1 with a stab on the 'and' of every beat, a bar of each chord again.",
      howTo: [
        "Bars 1 and 2: quarter notes on beats 1 and 3, and the stab is an eighth note on 2 and on 4. Bars 3 and 4: the root on beat 1, then a stab on the 'and' of every beat. Count '1 and, (2) and, (3) and, (4) and'.",
        "Bars 1 and 3 are Bm7: the low B at fret 7 of the low E string, and the stab at fret 7. Bars 2 and 4 are E9: E at fret 7 of the A string, and the stab at fret 9.",
        "The first finger plays both roots. With the hand swinging in sixteenths, every attack here is a downstroke.",
      ],
      coach: "A stab is one attack: timed and counted, never pitch-checked. The change of chord is where the time slips.",
      ...FREE,
      tab: BM_STABS,
      position: 7,
      chords: "Bm7 | E9 | Bm7 | E9",
      ...STABS,
      rungs: ladder(50, 120, 10),
      passAt: 85,
      selfCheck: [SHORT_CHECK],
      minutes: 6,
    },
    {
      id: "bm-line-stab",
      title: "A line and a stab on Bm7",
      purpose: "One bar on Bm7: three low notes, a stab, three more low notes, a stab.",
      howTo: [
        "Beats 1 and 3 have the same rhythm: the beat, the 'and' and the 'a'. Beat 1 is B, B and D on the low E string, frets 7, 7 and 10. Beat 3 is E, F# and E on the A string, frets 7, 9 and 7. The stabs fall on the 'and' of beat 2 and of beat 4.",
        "First finger on fret 7, little finger for the D at fret 10, third finger for the F# at fret 9.",
        "Stop the low string before each stab so the two don't ring together.",
      ],
      coach: "Every attack is timed, low notes and stabs alike. Pitch is not checked when stabs are in the line.",
      ...FREE,
      tab: BM_BAR,
      position: 7,
      chords: "Bm7",
      ...STABS,
      rungs: ladder(50, 110, 10),
      passAt: 80,
      selfCheck: [SHORT_CHECK],
      minutes: 6,
    },
    {
      id: "e9-line-stab",
      title: "A line and a stab on E9",
      purpose: "The same shape of bar on E9: E, E and F# on the A string, a stab, then G#, A and G# on the D string, a stab. G# is the third of E9, and the line leans on it.",
      howTo: [
        "The rhythm is the Bm7 bar's: the beat, the 'and' and the 'a' on beats 1 and 3, a stab on the 'and' of beat 2 and of beat 4.",
        "The hand stays at fret 7. On the A string the first finger plays E at fret 7 and the third finger F# at fret 9. For the D string the first finger reaches back one fret: G# at fret 6, then the second finger plays A at fret 7.",
        "The stab is E and G# at fret 9 of the G and B strings, third and little fingers.",
      ],
      coach: "Every attack is timed, low notes and stabs alike. Pitch is not checked when stabs are in the line.",
      ...FREE,
      tab: E9_BAR,
      position: 7,
      // The reach back to fret 6 is past what a still hand is allowed, as in the Path's own D9 bar.
      shifts: true,
      chords: "E9",
      ...STABS,
      rungs: ladder(50, 110, 10),
      passAt: 80,
      selfCheck: [SHORT_CHECK],
      minutes: 6,
    },
    {
      id: "bm-vamp",
      title: "The second vamp with the band",
      purpose: "Two bars over a funk band: the line and stabs on Bm7, then the line and stabs on the ninth chord.",
      howTo: [
        "Bar 1 is the bar for the minor seventh chord and bar 2 is the bar for the ninth chord: the two line and stab bars of this Step, one after the other.",
        "The hand does not move between the bars. In bar 2 the first finger reaches back to fret 6 on the D string, in the sixteenth of rest after the stab on the 'and' of beat 2, and comes back to fret 7 for bar 1.",
        "Listen to the snare on beats 2 and 4. Your stabs come just after it.",
        VARIANT_NOTE,
      ],
      coach: "Band on. Every attack is timed against it.",
      ...FREE,
      vary: inKeys(BM_VAMP, "Bm7 | E9"),
      tab: BM_VAMP,
      position: 7,
      shifts: true,
      chords: "Bm7 | E9",
      jam: FUNK_B,
      ...STABS,
      rungs: ladder(50, 110, 10),
      passAt: 80,
      minutes: 7,
    },
  ],
};

/** Advanced, after the displaced figures: the same placements on stabs and octaves. */
export const DISPLACED_SHAPES: StepSpec = {
  id: "displaced-shapes",
  title: "Stabs and octaves across the beat",
  goal: "Play the three-sixteenth figure as stabs, play octaves on the 'e' and the 'a', and join a line that moves across the beat to stabs in one two-bar phrase.",
  why: "Moving a figure against the beat was learned on single notes. A stab crosses two strings and an octave crosses three, so the stroke is bigger, and an upstroke through two or three strings is the one that comes out thin or late. The fretting hand has nothing new here: the Am7 stab and the A octave, both with the first finger at fret 5. All of the attention can go to where the stroke lands.",
  howTo: [
    "Foot on every beat, as before. The hand swings in sixteenths: down on the beat and the 'and', up on the 'e' and the 'a'.",
    "An upstroke meets the strings in the other order: the B string first for a stab, the D string first for an octave. Make it as loud and as short as a downstroke.",
    "The fretting hand makes the holes: squeeze for the attack, relax for the rest, with the fingers still touching the strings.",
  ],
  payoff: "A two-bar phrase over the band where a line that moves across the beat and stabs sit against a steady foot.",
  exercises: [
    {
      id: "stab-threes",
      title: "Two stabs and a hole",
      purpose: "Stab, stab, rest, five times, and one more stab to fill the bar: the three-sixteenth figure, now on two strings.",
      howTo: [
        "The figure starts on beat 1, then on the 'a' of 1, the 'and' of 2, the 'e' of 3 and on beat 4, as it did with single notes.",
        "The stab is C and E, the G and B strings at fret 5 under the first finger. It never moves: relax the finger for each hole.",
        "The two stabs of a figure are down-up one time and up-down the next. Keep the two the same size.",
      ],
      coach: "Eleven stabs in the bar, each one timed against where it is written. A stab is one attack, never pitch-checked.",
      ...FREE,
      tab: STAB_THREES,
      position: 5,
      chords: "Am7",
      ...STABS,
      rungs: ladder(50, 110, 10),
      passAt: 80,
      selfCheck: [FOOT_CHECK],
      minutes: 6,
    },
    {
      id: "octave-off-the-e",
      title: "Octaves on the 'e' and the 'a'",
      purpose: "The A octave on beat 1, then pairs of octaves on the 'e' and the 'a', answered by pairs on the next beat and its 'and': the rhythm of the line that started on the 'e', played with the octave shape.",
      howTo: [
        "Count '1 e (and) a, 2 (e) and (a), (3) e (and) a, 4 (e) and (a)'. Beat 3 is the only beat that starts with silence.",
        "The octave is A: first finger on the low E string at fret 5, third finger on the D string at fret 7, the A string dead under the first finger. The shape does not move.",
        "The octaves on the 'e' and the 'a' are upstrokes through three strings. Keep the stroke as small as the shape allows.",
      ],
      coach: "Nine attacks a bar, four of them on the 'e' and the 'a'. An octave is one attack: timed and counted.",
      ...FREE,
      tab: OCTAVE_OFF_THE_E,
      position: 5,
      chords: "Am7",
      ...STABS,
      rungs: ladder(50, 110, 10),
      passAt: 80,
      selfCheck: [DEAD_STRING_CHECK, SCRATCH_CHECK],
      minutes: 6,
    },
    {
      id: "slide-and-stab",
      title: "A line across the beat, with stabs",
      purpose: "Two bars over a funk band. The two-note figure moves across the beat all through bar 1 and is answered by the same figure as stabs. Bar 2 starts on the low A, puts two notes on the 'e' and the 'a', and ends with two upstroke stabs and a held low A.",
      howTo: [
        "Bar 1: A, G, rest, four times, starting on beat 1, the 'a' of 1, the 'and' of 2 and the 'e' of 3. Then two stabs, on beat 4 and its 'e', where the fifth figure would start.",
        "Bar 2: the low A on beat 1, the A on the D string on the 'e' and the 'a', G on beat 2, then silence until the stabs on the 'e' and the 'a' of beat 3. The held low A lands on beat 4.",
        "Everything is at fret 5 and fret 7. The first finger lies flat across all six strings at fret 5 and stays there: it holds the stabs, the G and the low A, so only the pick has to travel. The third finger plays the A at fret 7 of the D string.",
        "After the upstroke stab on the 'a' of beat 3 in bar 2, let the hand carry on up past the low E string, so that the downstroke on beat 4 starts above it. This is the widest the swing gets.",
      ],
      coach: "Band on. This is the Step's test piece: every attack is timed against the band. Pitch is not checked when stabs are in the line.",
      ...FREE,
      tab: SLIDE_AND_STAB,
      position: 5,
      chords: "Am7 | Am7",
      jam: FUNK,
      ...STABS,
      rungs: ladder(50, 110, 10),
      passAt: 80,
      selfCheck: [FOOT_CHECK],
      minutes: 7,
    },
  ],
};

/** Advanced, the last Step: eight bars in the second key with a change of part in the middle. */
export const LONG_FORM: StepSpec = {
  id: "long-form",
  title: "Eight bars and a change",
  goal: "Hold an eight-bar groove over a band, in B minor and in other keys, four bars of line and stabs and four bars of octaves, and keep its first bar in the pocket for a full minute.",
  why: "Songs are built from parts that last four or eight bars, and the guitar changes part when the song does. The change is where a groove comes apart: the last bar of one part rushes because the mind is already on the next. Eight bars with one change in the middle, in the key you moved the vamp to, is that problem at its smallest.",
  howTo: [
    "Bars 1 to 4 are the Bm7 and E9 vamp, twice. Bars 5 to 8 are octaves: B for the Bm7 bars, E for the E9 bars, with four single notes at the end of bar 8 that walk back down to bar 1.",
    "The vamp is the one from 'The same shapes on Bm7 and E9'. The Bm7 bar, first finger at fret 7: B, B and D on the low E string, E, F# and E on the A string, stabs at fret 7. The E9 bar: E, E and F# on the A string, G#, A and G# on the D string with the first finger reaching back to fret 6, stabs at fret 9.",
    "Count the bars as well as the beats. Knowing you are in bar 4 is what makes the change arrive on time.",
    "For the minute, choose a rung where the bar feels easy. The work is in keeping it identical.",
    SAFETY,
  ],
  payoff: "An eight-bar funk part in a second key with a change of part in the middle, and one bar of it held for a minute.",
  exercises: [
    {
      id: "bm-octaves",
      title: "Octaves over Bm7 and E9",
      purpose: "Four bars of octaves over the band: B for the Bm7 bars and E for the E9 bars, in the sixteenth-note octave figure. The last bar plays the figure once, then four single notes that walk down toward the B.",
      howTo: [
        "The B octave is the low E string at fret 7 with the D string at fret 9. The E octave is the A string at fret 7 with the G string at fret 9: the same shape one string over, with the first finger still at fret 7.",
        "Bars 1 to 3 are '1, and a', then the 'e' of 2, and the same again from beat 3. Change octave during the two sixteenths of rest that end each of them.",
        "Bar 4 plays the figure once, then F#, E, D and C#, short, on beat 3, its 'and', beat 4 and its 'and': the A string at frets 9 and 7, then the low E string at frets 10 and 9. Third finger, first finger, little finger, third finger.",
        "After the C# there is one sixteenth of rest before the B octave of bar 1: the third finger hops from the low E string to the D string, same fret.",
      ],
      coach: "Band on. An octave is one attack: every one is timed against the band and counted, and so are the four single notes. Pitch is not checked when octaves are in the line.",
      ...FREE,
      tab: BM_OCTAVES,
      position: 7,
      chords: "Bm7 | E9 | Bm7 | E9",
      jam: FUNK_B,
      ...STABS,
      rungs: ladder(50, 110, 10),
      passAt: 80,
      selfCheck: [DEAD_STRING_CHECK],
      minutes: 7,
    },
    {
      id: "the-change",
      title: "The change of part",
      purpose: "The join in the middle of the form, alone: the E9 bar of line and stabs, then a bar of B octaves.",
      howTo: [
        "Bar 1 is the E9 bar of the vamp. Its last stab is on the 'and' of beat 4, at fret 9.",
        "Bar 2 starts with the B octave on beat 1: first finger on the low E string at fret 7, third finger on the D string at fret 9. In the sixteenth of rest before it, the first finger comes back from fret 6 to fret 7 of the low E string, and the third finger crosses from the G string to the D string at the same fret.",
        "Look at the low E string during the last stab. The pick has further to travel than the fingers do.",
        "When the loop comes round, the octave bar leads back into the E9 bar. That join is not in the form; the one to listen to is bar 1 into bar 2.",
      ],
      coach: "Every attack is timed. The first octave of bar 2 is the one to watch: late means the change took too long.",
      ...FREE,
      tab: THE_CHANGE,
      position: 7,
      shifts: true,
      chords: "E9 | Bm7",
      ...STABS,
      rungs: ladder(50, 110, 10),
      passAt: 80,
      minutes: 6,
    },
    {
      id: "eight-bars",
      title: "Eight bars with the band",
      purpose: "The whole form: four bars of line and stabs, then four bars of octaves over the same two chords, ending on the walk down that brings bar 1 round again.",
      howTo: [
        "Bars 1 to 4 are the vamp twice. Bars 5 to 8 are the octave bars, with four single notes that walk down in the second half of bar 8.",
        "The octaves are B, E, B, then half a bar of E, and the walk down is F#, E, D, C#.",
        "The change comes after the stab on the 'and' of beat 4 in bar 4: the next attack is the first octave, on beat 1 of bar 5.",
        "Count the bars. The band will not tell you which half you are in: it plays the same two chords, one to a bar, all eight bars through.",
        VARIANT_NOTE,
      ],
      coach: "Band on. Every attack is timed against it. Pitch is not checked when stabs and octaves are in the line.",
      ...FREE,
      vary: inKeys(EIGHT_BARS, "Bm7 | E9 | Bm7 | E9 | Bm7 | E9 | Bm7 | E9"),
      tab: EIGHT_BARS,
      position: 7,
      shifts: true,
      chords: "Bm7 | E9 | Bm7 | E9 | Bm7 | E9 | Bm7 | E9",
      jam: FUNK_B,
      ...STABS,
      // The best four bars in a row could be the vamp twice, without the change in them: the pass reads all eight.
      pass: [even(0.8, 8), heard(0.9, 8), extras(6)],
      rungs: ladder(50, 110, 10),
      passAt: 80,
      minutes: 9,
    },
    {
      id: "bm-pocket-minute",
      title: "The first bar for a minute",
      purpose: "Bar 1 of the form, the line and stabs on Bm7, round and round over the band for sixty seconds.",
      howTo: [
        "Play it exactly the same every time: the same short notes, the same holes, the stabs the same length.",
        "The stabs are what change first when the hand tires: they get longer, or the one on the 'and' of beat 4 comes early. Listen to the snare just before each.",
        "Breathe, and let the shoulder drop.",
      ],
      coach: "The time has to hold to the end of the minute. Whether every bar felt the same is for your ear.",
      ...FREE,
      tab: BM_BAR,
      position: 7,
      holdSeconds: 60,
      chords: "Bm7",
      jam: FUNK_B,
      rungs: ladder(50, 110, 10),
      passAt: 80,
      grade: "stamina",
      selfCheck: ["Did the last ten seconds feel as relaxed as the first ten?", SHORT_CHECK],
      minutes: 4,
    },
  ],
};
