/**
 * Funk Lines, a Mechanics Path. A draft: no teacher or guitarist has reviewed
 * it.
 *
 * Sixteenth-note rhythm guitar as single-note lines, two-note stabs and
 * octaves: the parts of funk playing the app can hear. The muted "scratch"
 * strokes between the notes are taught in words and written as rests, because
 * a muted stroke and a rest look the same to an onset detector that is asked
 * to ignore them, and the app cannot tell a muted string from a quiet one.
 */
import { definePath } from "../spec";
import type { ExerciseSpec } from "../spec";
import type { PassBar } from "../format";
import { ladder, repeat } from "../templates";
import { DISPLACED_SHAPES, LONG_FORM, SECOND_PAIR } from "./funk-lines-more";
import { HOLES_MIXED, LINES_SECOND_KEY } from "./funk-lines-encore";

const even = (min: number, overBars = 4): PassBar => ({ metric: "timingEvenness", min, overBars });
const heard = (min: number, overBars = 4): PassBar => ({ metric: "notesHeard", min, overBars });
const extras = (max: number): PassBar => ({ metric: "extraNotes", max, overBars: 4 });
const right = (min: number): PassBar => ({ metric: "noteIdentity", min, overBars: 4 });

/** Single-note lines with rests: timing, notes heard, right notes. Extras are forgiving, since scratches may be heard. */
const LINE = { grade: "timingNotes", pass: [even(0.8), heard(0.9), extras(6), right(0.85)] } as const satisfies Partial<ExerciseSpec>;
/** Two notes at once are one attack: timed and counted, never pitch-checked. */
const STABS = { grade: "timing", pass: [even(0.8), heard(0.9), extras(6)] } as const satisfies Partial<ExerciseSpec>;
const FREE = { pick: "free" } as const satisfies Partial<ExerciseSpec>;

const SCRATCH_CHECK = "Did the picking hand keep swinging in sixteenths through the rests?";
const SHORT_CHECK = "Were the notes short, with silence between them?";
const SAFETY =
  "Stop at any pain in the hand, wrist or forearm. A tired forearm is one thing and pain is another; pain ends the set.";

const A_PENT = { scale: ["A", "minorPentatonic"] as [string, string] };
const A_DORIAN = { scale: ["A", "dorian"] as [string, string] };
const FUNK = { groove: "funk", key: "A minor" } as const;

// Shared strings of the curriculum (coherence audit, S5, S10, S12): word for word the same in
// every Path, so each is translated once and copied.
const BAND_IS = "The band is a drummer and a bassist in place of the click.";
const IF_LOST = "If you get lost, stop, find beat 1 of the next bar and come back in there.";
const HAMMER_IS =
  "A hammer-on is a note the fretting hand sounds alone: pick the lower note, then bring a finger down hard and fast on the higher fret of the same string.";
const ROOT_IS = "The root is the note a chord is named after.";

/** One bar of sixteenths from four beats, each written as four tokens. */
const bar = (...beats: string[]) => `/16 ${beats.join(" ")}`;
const bars = (...all: string[]) => all.join(" | ");

// The note everything starts on: A on the D string, fret 7.
const A = "4:7";
const G = "4:5";

// Two-note stabs on the G and B strings, and octaves with the string between them muted.
const CE = "3:5+2:5"; // C and E: the top of Am7, and of D9
const DF = "3:7f3+2:7f4"; // D and F#: D9
const OCT_A = "6:5f1+4:7f3";
const OCT_C = "6:8f1+4:10f3";
const OCT_D = "5:5f1+3:7f3";
const OCT_E = "5:7f1+3:9f3";

// --- Beginner ---------------------------------------------------------------

const ON_THE_BEAT = bar(...Array(4).fill(`${A}> ${A} ${A} ${A}`));
const ON_THE_AND = bar(...Array(4).fill(`${A} ${A} ${A}> ${A}`));
const BACKBEAT = bar(`${A} ${A} ${A} ${A}`, `${A}> ${A} ${A} ${A}`, `${A} ${A} ${A} ${A}`, `${A}> ${A} ${A} ${A}`);

const NO_E = `${repeat(`/8 ${A} /16 ${A} ${A}`, 3)} /8 ${G} /16 ${G} ${G}`;
const NO_AND = bar(`${A} ${A} r ${A}`, `${A} ${A} r ${A}`, `${A} ${A} r ${A}`, `${G} ${G} r ${G}`);
const NO_ONE = bar(`${A} ${A} ${A} ${A}`, `r ${A} ${A} ${A}`, `r ${A} ${A} ${A}`, `r ${G} ${G} ${G}`);

const LINE_ONE = bars(
  bar(`${A} r ${A} ${G}`, `r ${A} r r`, `5:7 r 5:5 5:7`, `r r ${G} r`),
  `${bar(`${A} r ${A} ${G}`, `r ${A} r r`, `5:7 5:5 r 6:8`)} /4 6:5`,
);
const LINE_TWO = bars(
  bar(`6:5 r r 6:8`, `r 6:5 r 5:5`, `r 5:7 r r`, `${G} r ${A} r`),
  `${bar(`6:5 r r 6:8`, `r 6:5 r 5:5`)} /8 5:7 ${G} /4 ${A}`,
);

// --- Intermediate -----------------------------------------------------------

const STAB_BACKBEAT = `/4 6:5 /8 ${CE} r /4 6:5 /8 ${CE} r`;
const STAB_OFFBEAT = `/8 6:5 ${CE} r ${CE} r ${CE} r ${CE}`;
const STAB_SIXTEENTHS = bar(`6:5 r ${CE} r`, `r ${CE} r ${CE}`, `r r ${CE} r`, `${CE} r ${CE} r`);

const CALL_AND_STAB = bar(`6:5 r 6:8 6:5`, `r r ${CE} r`, `5:5 r 5:7 r`, `r r ${CE} r`);
const AM_TO_D = bars(`/8 6:5 ${CE} r ${CE} /4 r /8 r ${CE}`, `/8 5:5 ${DF} r ${DF} /4 r /8 r ${DF}`);
const VAMP = bars(
  bar(`6:5 r 6:8 6:5`, `r r ${CE} r`, `5:5 r 5:7 r`, `r r ${CE} r`),
  bar(`5:5 r 5:7 5:5`, `r r ${DF} r`, `4:4 r 4:5 r`, `r r ${DF} r`),
);

const OCTAVE_EIGHTHS = bars(`/8 ${OCT_A} ${OCT_A} r ${OCT_A} r ${OCT_C} ${OCT_C} r`, `/8 ${OCT_A} ${OCT_A} r ${OCT_A} r ${OCT_C} /4 ${OCT_A}`);
const OCTAVE_SIXTEENTHS = bar(`${OCT_A} r ${OCT_A} ${OCT_A}`, `r ${OCT_A} r r`, `${OCT_A} r ${OCT_A} ${OCT_A}`, `r ${OCT_A} r r`);
const OCTAVE_LINE = bars(
  bar(`${OCT_A} r ${OCT_A} ${OCT_A}`, `r ${OCT_A} r r`, `${OCT_A} r ${OCT_A} ${OCT_A}`, `r ${OCT_A} r r`),
  bar(`${OCT_D} r ${OCT_D} ${OCT_D}`, `r ${OCT_D} r r`, `${OCT_E} r ${OCT_E} ${OCT_E}`, `r ${OCT_E} r r`),
);

// --- Advanced ---------------------------------------------------------------

const THREES = `/16 ${repeat(`${A} ${G} r`, 5)} ${G}`;
const OFF_THE_E = bar(`6:5 ${A} r ${A}`, `${G} r ${A} r`, `r ${A} r ${A}`, `${G} r ${A} r`);
const LONG_PHRASE = bars(
  bar(`${A} r ${A} ${G}`, `r ${A} ${G} r`, `5:7 r r 5:5`, `r 5:7 r ${G}`),
  `${bar(`${A} r r ${A}`, `${G} r 5:7 r`, `5:5 5:7 r 6:8`)} /4 6:5`,
);

const THE_SIXTH = bars(
  bar(`${A} r ${A} ${G}`, `r ${A} r r`, `5:7 r 5:5 5:7`, `r r ${G} r`),
  bar(`5:5 r 5:5 5:7`, `r 4:4 r r`, `${G} r 4:4 5:7`, `r r 5:5 r`),
);
const HAMMERED = bar(`${G} ${A}h r ${A}`, `r ${G} ${A}h r`, `5:5 5:7h r 5:7`, `r 5:5 5:7h r`);
const TWO_CHORD_LINE = bars(
  bar(`${A} r ${A} ${G}`, `r ${A} r r`, `5:7 r 5:5 5:7`, `r r ${G} r`),
  bar(`5:5 r 5:5 5:7`, `r 4:4 r r`, `${G} r 4:4 5:7`, `r r 5:5 r`),
  bar(`${A} r ${A} ${G}`, `r ${A} r r`, `${G} ${A}h r ${A}`, `r r ${G} r`),
  `${bar(`5:5 r 5:5 5:7`, `r 4:4 r r`, `${G} 4:4 r 5:7`)} /4 5:5`,
);

const GROOVE = bars(
  bar(`6:5 r 6:8 6:5`, `r r ${CE} r`, `5:5 r 5:7 r`, `r r ${CE} r`),
  bar(`5:5 r 5:7 5:5`, `r r ${DF} r`, `4:4 r 4:5 r`, `r r ${DF} r`),
  bar(`${OCT_A} r ${OCT_A} ${OCT_A}`, `r ${OCT_A} r r`, `${OCT_A} r ${OCT_A} ${OCT_A}`, `r ${OCT_A} r r`),
  bar(`${OCT_D} r ${OCT_D} ${OCT_D}`, `r ${OCT_D} r r`, `5:5 r 5:7 r`, `4:4 r 4:5 r`),
);
const POCKET = bar(`${A} r ${A} ${G}`, `r ${A} r r`, `5:7 r 5:5 5:7`, `r r ${G} r`);

/** Warm-ups: one figure on a single fretted note, moved up the D string through the scale. */
const WARM_FRETS: Readonly<Record<string, readonly number[]>> = {
  "A minor": [7, 9, 10, 12],
  "E minor": [2, 4, 5, 7],
  "B minor": [4, 5, 7, 9],
  "D minor": [3, 5, 7, 8],
  "G minor": [5, 7, 8, 10],
  "C minor": [5, 6, 8, 10],
};
function warm(key: string, figure: (note: string) => string) {
  const tab = WARM_FRETS[key].map((fret) => figure(`4:${fret}f1`)).join(" | ");
  return { tab, position: WARM_FRETS[key][0], shifts: true, harmony: { scale: [key.split(" ")[0], "naturalMinor"] as [string, string] } };
}
const WARM_KEYS = { key: Object.keys(WARM_FRETS) } as const;

export default definePath({
  id: "funk-lines",
  title: "Funk Lines",
  kind: "mechanics",
  category: "technique",
  goal: "Play sixteenth-note funk rhythm as single-note lines, two-note stabs and octaves, locked to a band, with the picking hand never stopping.",
  level: "early-intermediate",
  assumes:
    "You can play sixteenth notes with a click at 70 BPM and stop a note cleanly (Rhythm Foundations covers both: stopping a note in 'Silence in time', sixteenths in its Intermediate Level). A clean tone is the right one here. The minutes listed are one pass through the material; a groove is something you come back to for weeks.",
  prerequisites: { paths: [{ path: "rhythm-foundations", level: "intermediate" }], skills: ["Sixteenth notes with a click at 70 BPM", "Stopping a note cleanly"] },
  labelSubdivisions: "mostly",
  paceLadders: true,
  variantText: true,
  orderRationale:
    "The constant sixteenth-note swing of the picking hand first, with accents, because every funk part is that swing with some strokes left out. Then leaving strokes out, one figure at a time, then whole lines over a band. Stabs come after lines because two strings are harder to hit short than one, and the vamp then moves to a second pair of chords while it is fresh. Octaves follow: the same idea across three strings with one of them muted. Displaced patterns come next, on single notes and then on stabs and octaves, then the Dorian sixth, and then long grooves: four bars, a minute, and last an eight-bar form with a change of part.",
  gradingLimits:
    "The app times the notes it hears against where they are written, counts them, and checks single notes for pitch after the take. Two-note stabs and octaves are one attack each: timed and counted, never pitch-checked. The muted scratch strokes that funk players put between the notes are written as rests here. If the app hears one it counts as an extra note, so the bar on extras is loose, and how good your scratches sound is for your ear. Whether your notes were short enough is not measured either. None of this has been tried on a real guitar yet.",
  steps: [
    {
      id: "the-engine",
      title: "The engine",
      goal: "Keep the picking hand swinging in even sixteenths on one note, and put an accent where you choose.",
      why: "Funk rhythm guitar is a hand that never stops: down, up, down, up, four times a beat, for the whole song. The part you hear is which of those strokes are allowed to sound. Before any are left out, the swing itself has to be even, and you have to be able to lean on any one of the four.",
      howTo: [
        "Sixteenths, counted '1 e and a'. Down on the number and the 'and', up on the 'e' and the 'a'. The motion comes from a loose wrist, as if shaking water off the hand.",
        "Hold the pick lightly and let only its tip touch the string. A deep stroke is a slow stroke.",
        "An accent is one stroke played a little harder. The others stay quiet, so the accent has something to stand out from.",
      ],
      payoff: "One note that already grooves, because the accents fall on the backbeat.",
      exercises: [
        {
          id: "on-the-beat",
          title: "Accent the beat",
          purpose: "Sixteen sixteenths on one note, the A at the D string's fret 7, with the first of every four accented.",
          howTo: [
            "Strict down-up. The accent is on the downstroke that starts each beat.",
            "Keep the three notes after each accent clearly quieter. That contrast is the groove.",
          ],
          coach: "I check that the accented notes were louder, roughly, and how even the sixteenths were.",
          tab: ON_THE_BEAT,
          position: 5,
          rungs: ladder(50, 120, 10),
          passAt: 80,
          grade: "accents",
          minutes: 5,
        },
        {
          id: "on-the-and",
          title: "Accent the 'and'",
          purpose: "The same sixteen notes with the accent moved to the 'and' of every beat: still a downstroke, now halfway through the beat.",
          howTo: [
            "Count '1 e AND a'. Tap your foot on the beat and play the accent between the taps.",
            "If the accent pulls the foot with it, slow down a rung. The foot stays on the beat.",
          ],
          coach: "The accent readout is rough: louder than the notes beside it or not. Trust your ear too.",
          tab: ON_THE_AND,
          position: 5,
          rungs: ladder(50, 120, 10),
          passAt: 80,
          grade: "accents",
          minutes: 5,
        },
        {
          id: "backbeat",
          title: "Accent two and four",
          purpose: "Only two accents a bar, on beats 2 and 4, the backbeat, where the snare drum is. Everything else stays quiet and even.",
          howTo: [
            "Count the bar and lean on the first note of beat 2 and of beat 4.",
            "Fourteen quiet notes and two loud ones. The quiet ones are the hard part.",
          ],
          coach: "Two accents a bar is what I look for, on 2 and on 4.",
          tab: BACKBEAT,
          position: 5,
          rungs: ladder(50, 120, 10),
          passAt: 80,
          grade: "accents",
          minutes: 5,
        },
      ],
    },
    {
      id: "holes",
      title: "Leaving strokes out",
      goal: "Play three sixteenth-note figures, each with one stroke missing, while the hand keeps its full swing.",
      why: "Take one stroke out of four and you have a figure. Take a different one out and you have another. The hand does exactly what it did before; on the missing stroke it passes over the string without touching it, or brushes muted strings for a scratch. Stopping the hand is what makes funk parts drag.",
      howTo: [
        "The hand swings in sixteenths the whole time. On a rest it misses the string, or plays a muted scratch: relax the fretting finger so the string is dead, and let the pick brush it.",
        "Stop each note by relaxing the fretting finger without lifting it off the string. Short notes make the rhythm clear.",
        "The last beat of each bar moves down two frets, from A to G, so you can hear where the bar ends.",
        "If you come from Rhythm Foundations: 'One, and-a' is its gallop, from 'Four to a beat'. The other two figures are in its Advanced Step 'Sixteenths with holes in them'. What is new here is the funk way of playing them: short notes, and a hand that swings through every hole.",
      ],
      payoff: "Three one-bar grooves on two notes that are already funk.",
      difficultyException:
        "Fewer notes a bar than the Step before, on purpose: the demand is keeping the swing through a missing stroke, which a note-rate metric does not count.",
      exercises: [
        {
          id: "no-e",
          title: "One, and-a",
          purpose: "A long note and two short ones on every beat: the 'e' is left out.",
          howTo: [
            "Count '1, and a'. Down, then down-up: the hand misses the string on the 'e'.",
            "Three beats on A at fret 7, the last beat on G at fret 5.",
          ],
          coach: "I time each note against where it is written, and check the two pitches after the take.",
          ...FREE,
          tab: NO_E,
          position: 5,
          harmony: A_PENT,
          rungs: ladder(50, 120, 10),
          passAt: 85,
          ...LINE,
          selfCheck: [SCRATCH_CHECK],
          minutes: 5,
        },
        {
          id: "no-and",
          title: "One-e, a",
          purpose: "Two notes, a hole, and one more: the 'and' is left out of every beat.",
          howTo: [
            "Count '1 e (and) a'. Down, up, miss, up.",
            "Don't close the hole. The 'a' comes late, just before the next beat.",
          ],
          coach: "A closed-up gap shows as early notes. I'll say how even it was.",
          ...FREE,
          tab: NO_AND,
          position: 5,
          harmony: A_PENT,
          rungs: ladder(50, 120, 10),
          passAt: 85,
          ...LINE,
          selfCheck: [SCRATCH_CHECK],
          minutes: 5,
        },
        {
          id: "no-one",
          title: "E-and-a",
          purpose: "After a full first beat, every beat starts with silence and plays its other three sixteenths.",
          howTo: [
            "Count '1 e and a, (2) e and a, (3) e and a, (4) e and a'. On beats 2, 3 and 4 the downstroke on the beat plays the air.",
            "Let the foot land in the hole. The first note comes straight after it, on an upstroke.",
          ],
          coach: "The first note after each silent beat is the one I'd look at: early means the hole was cut short.",
          ...FREE,
          tab: NO_ONE,
          position: 5,
          harmony: A_PENT,
          rungs: ladder(50, 120, 10),
          passAt: 85,
          ...LINE,
          selfCheck: [SCRATCH_CHECK],
          minutes: 5,
        },
      ],
    },
    HOLES_MIXED,
    {
      id: "first-lines",
      title: "Lines with the band",
      goal: "Play two-bar single-note funk lines in A minor pentatonic over a band, with short notes and real silence between them.",
      why: "A funk line is a handful of short notes placed around the drums. Most of the bar is silence, or scratches, and the notes that are there have to sit exactly in the gaps the kick and the snare leave. With a band behind you the test is simple: does it make you want to move.",
      howTo: [
        "Learn each line at the first rung with the count out loud, one beat at a time. Some beats are one of the figures you know, with the notes moving. The others are one note, or two.",
        "Everything is in the pentatonic box at the fifth fret, on the low three strings: first finger on the frets at 5, third finger on the 7s, little finger on the low E string's 8.",
        BAND_IS,
        "Play every note short. Listen to the hi-hat: it plays the same sixteenths your hand is swinging.",
        IF_LOST,
        ROOT_IS,
        "The chord is Am7 for the whole Step, so its root is A. You don't play the chord: every line starts or ends on that A.",
      ],
      payoff: "A four-bar single-note groove over a funk band.",
      difficultyException:
        "A funk line is mostly silence, so its note count is lower than the one-hole figures before it. Placing single notes around the drums is the demand, and a note-rate metric does not count it.",
      exercises: [
        {
          id: "line-one",
          title: "A line from the top",
          purpose: "Two bars that start on the A at the D string's fret 7 and work down to the low A, mostly one note at a time with space around it.",
          howTo: [
            "Bar 1 starts '1, and a' on the D string, then a single note on the 'e' of 2. Bar 2 starts the same way and ends on a held low A.",
            "The hand swings in sixteenths from the first note to the last.",
          ],
          coach: "Band on. I time your notes against it and check them after the take. Direct input or headphones make that fair.",
          ...FREE,
          tab: LINE_ONE,
          position: 5,
          chords: "Am7 | Am7",
          jam: FUNK,
          harmony: A_PENT,
          rungs: ladder(50, 110, 10),
          passAt: 80,
          ...LINE,
          selfCheck: [SHORT_CHECK],
          minutes: 6,
        },
        {
          id: "line-two",
          title: "A line from the bottom",
          purpose: "The answer: two bars that start on the low A and climb to the A on the D string, where the first line began.",
          howTo: [
            "Both bars start with the low A on beat 1 and the C at fret 8 on the 'a'. Bar 2 ends with two eighth notes and a held A.",
            "The low E string rings easily. Stop it with the fretting finger as soon as each note has spoken.",
          ],
          coach: "Band on. I time your notes against it and check them after the take.",
          ...FREE,
          tab: LINE_TWO,
          position: 5,
          chords: "Am7 | Am7",
          jam: FUNK,
          harmony: A_PENT,
          rungs: ladder(50, 110, 10),
          passAt: 80,
          ...LINE,
          selfCheck: [SHORT_CHECK],
          minutes: 6,
        },
        {
          id: "both-lines",
          title: "Question and answer",
          purpose: "The two lines joined: four bars, down from the top and back up from the bottom.",
          howTo: [
            "Bars 1 and 2 are the first line; bars 3 and 4 are the second.",
            "The held A at the end of bar 2 is your breath. Bar 3 starts on the same note.",
          ],
          coach: "This is the Step's test piece. I'll say how even it was and check the notes after the take.",
          ...FREE,
          tab: bars(LINE_ONE, LINE_TWO),
          position: 5,
          loops: false,
          chords: "Am7 | Am7 | Am7 | Am7",
          jam: FUNK,
          harmony: A_PENT,
          rungs: ladder(50, 110, 10),
          passAt: 80,
          ...LINE,
          minutes: 7,
        },
      ],
    },
    LINES_SECOND_KEY,
    {
      id: "stabs",
      title: "Two-note stabs",
      goal: "Hit two strings at once, short, on the backbeat, on the off-beats and on single sixteenths.",
      why: "Funk players rarely strum a whole chord. They take the top two or three notes of it and stab them, short and bright. Two notes at once need a stroke that crosses two strings and stops, and a fretting hand that kills both together.",
      howTo: [
        "The stab is C and E: the G and B strings at fret 5, under the first finger laid flat. A chord is a set of notes. C and E are in Am7 and in D9, the two chords of the next Step, which is why one shape works over both.",
        "Strike both strings with one small stroke and stop them at once by relaxing the finger.",
        "The low A on beat 1 is the first finger's tip on the low E string at fret 5: the same finger, moved across.",
      ],
      payoff: "A bass note and stabs that sound like a rhythm section by themselves.",
      difficultyException:
        "A new Level opens with fewer attacks in a bar than the lines before it: a bass note and stabs on the backbeat, then on the off-beats. A two-note stab is one attack. The demand is a stroke that crosses two strings and stops, with both notes cut off together, which the metric does not count.",
      exercises: [
        {
          id: "stab-backbeat",
          title: "Stabs on two and four",
          purpose: "The low A on beats 1 and 3, a short stab on beats 2 and 4. The simplest funk part there is.",
          howTo: [
            "Quarter notes on 1 and 3; the stab is an eighth note on 2 and on 4, with silence after it.",
            "Make the stab half as long as the bass note. It sits where you put the accents in 'Accent two and four'.",
          ],
          coach: "A stab is one attack to me: I time it and count it, and I don't check its pitch.",
          ...FREE,
          tab: STAB_BACKBEAT,
          position: 5,
          chords: "Am7",
          ...STABS,
          rungs: ladder(50, 120, 10),
          passAt: 85,
          selfCheck: [SHORT_CHECK],
          minutes: 5,
        },
        {
          id: "stab-offbeat",
          title: "Stabs on the 'and'",
          purpose: "The low A on beat 1, then a stab on the 'and' of every beat.",
          howTo: [
            "Count '1 and, (2) and, (3) and, (4) and'. With the hand swinging in sixteenths, every stab is a downstroke, halfway through the beat.",
            "The foot taps every beat. After beat 1 the guitar plays only between the taps.",
          ],
          coach: "I time each stab against where it is written. Whether your foot kept the beat is yours to say.",
          ...FREE,
          tab: STAB_OFFBEAT,
          position: 5,
          chords: "Am7",
          ...STABS,
          rungs: ladder(50, 120, 10),
          passAt: 85,
          selfCheck: [SHORT_CHECK],
          minutes: 5,
        },
        {
          id: "stab-sixteenths",
          title: "Stabs on single sixteenths",
          purpose: "The low A on beat 1, then stabs scattered across the bar on single sixteenths, some on the 'and', some on the 'e' and the 'a', and one on beat 4.",
          howTo: [
            "Learn it a beat at a time with the count. The hand swings in sixteenths and catches the two strings only where a stab is written.",
            "Stabs on the 'e' and the 'a' are upstrokes. Let them be as loud as the downstroke ones.",
          ],
          coach: "Six stabs and a bass note in the bar. I time each one.",
          ...FREE,
          tab: STAB_SIXTEENTHS,
          position: 5,
          chords: "Am7",
          ...STABS,
          rungs: ladder(50, 110, 10),
          passAt: 80,
          selfCheck: [SCRATCH_CHECK],
          minutes: 6,
        },
      ],
    },
    {
      id: "line-and-stab",
      title: "Line and stab",
      goal: "Play a bass-register line and answer it with stabs inside one bar, and move the part from Am7 to D9.",
      why: "The classic funk guitar part is two players in one: a low line that talks to the bass, and stabs that talk to the snare. Putting them in one bar means the picking hand jumps from the low strings to the high ones between sixteenths, without the swing changing.",
      howTo: [
        "Low notes on the fingertips, with the little finger for the C at fret 8; stabs with the first finger laid flat across the G and B strings.",
        "For D9 the stab moves up two frets, to fret 7: third and little fingers on the G and B strings. The bass note is D, the A string at fret 5.",
        "Keep the swing small. The pick only travels as far as the next string it needs.",
      ],
      payoff: "A two-chord vamp, Am7 to D9, with a line and stabs in every bar.",
      exercises: [
        {
          id: "call-and-stab",
          title: "A line, a stab",
          purpose: "One bar on Am7: three low notes, a stab, two more low notes, a stab.",
          howTo: [
            "Beat 1 is low A, a hole, C and A on the low E string. The stabs fall on the 'and' of beat 2 and of beat 4.",
            "Stop the low string before each stab so the two don't ring together.",
          ],
          coach: "I time every attack, low notes and stabs alike. Pitch is not checked when stabs are in the line.",
          ...FREE,
          tab: CALL_AND_STAB,
          position: 5,
          chords: "Am7",
          ...STABS,
          rungs: ladder(50, 110, 10),
          passAt: 80,
          selfCheck: [SHORT_CHECK],
          minutes: 6,
        },
        {
          id: "am-to-d",
          title: "Am7 to D9",
          purpose: "A bar of each chord in eighth notes: the root, which is the note the chord is named after, then stabs. For D9 the root is D on the A string and the stab is D and F# at fret 7.",
          howTo: [
            "Both bars have the same rhythm: the root on 1, stabs on the 'and' of 1, the 'and' of 2 and the 'and' of 4.",
            "The hand does not move. Use the long rest in the middle of each bar to get the third and little fingers ready over fret 7, or the first finger back over fret 5.",
          ],
          coach: "I time every attack and say how even they were. The change of chord is where it slips.",
          ...FREE,
          tab: AM_TO_D,
          position: 5,
          chords: "Am7 | D9",
          ...STABS,
          rungs: ladder(50, 120, 10),
          passAt: 90,
          minutes: 6,
        },
        {
          id: "vamp",
          title: "The vamp with the band",
          purpose: "Two bars over a funk band: the line and stabs on Am7, then the same shape of part on D9, with F# in the line.",
          howTo: [
            "Bar 2 starts on D, the A string at fret 5, and its stabs are at fret 7. The first finger reaches back to fret 4 on the D string for the F#.",
            "Listen to the snare on 2 and 4. Your stabs come just after it.",
          ],
          coach: "Band on. I time every attack against it.",
          ...FREE,
          tab: VAMP,
          position: 5,
          shifts: true,
          chords: "Am7 | D9",
          jam: FUNK,
          ...STABS,
          rungs: ladder(50, 110, 10),
          passAt: 80,
          minutes: 7,
        },
      ],
    },
    SECOND_PAIR,
    {
      id: "octaves",
      title: "Octaves",
      goal: "Play a note and its octave together as one short attack, and move octave shapes in a sixteenth-note rhythm.",
      why: "An octave is the fattest single-note sound a guitar has, and disco and funk are full of it. The shape is two fingers with a string between them, and that middle string has to be dead: the first finger leans on it, so the pick can strike straight through all three.",
      howTo: [
        "First finger on the low note, third finger two strings over and two frets up. Let the first finger lean back to touch the string in between.",
        "Strike through all three strings with one stroke. Only two of them sound.",
        "Stop the octave by relaxing both fingers together.",
      ],
      payoff: "A disco octave part that moves through three notes over a band.",
      difficultyException:
        "An octave is one attack, and these figures have rests in them, so the rate sits just under the line-and-stab bars before it. The demand is the shape: two fingers with a dead string between them, struck through all three strings and stopped together, which the metric does not count.",
      exercises: [
        {
          id: "octave-eighths",
          title: "Octaves in eighths",
          purpose: "A in octaves, low E string 5 with D string 7, and C in octaves three frets higher, in an eighth-note rhythm with rests.",
          howTo: [
            "The shape slides up three frets for the C and back. Keep the fingers' spacing as it moves.",
            "Bar 2 ends on a held A.",
          ],
          coach: "An octave is one attack to me: I time it and count it.",
          ...FREE,
          tab: OCTAVE_EIGHTHS,
          position: 5,
          shifts: true,
          chords: "Am7 | Am7",
          ...STABS,
          rungs: ladder(50, 130, 10),
          passAt: 95,
          selfCheck: ["Was the string between the two fingers silent?"],
          minutes: 5,
        },
        {
          id: "octave-sixteenths",
          title: "Octaves in sixteenths",
          purpose: "One octave, A, in the sixteenth-note figure of the first funk line: '1, and a', then the 'e' of the next beat, twice a bar.",
          howTo: [
            "The hand swings in sixteenths across three strings now. Keep the stroke as small as the shape allows.",
            "Squeeze for the note, relax for the rest. The fretting hand makes the rhythm as much as the pick does.",
          ],
          coach: "Eight attacks a bar. I time each one.",
          ...FREE,
          tab: OCTAVE_SIXTEENTHS,
          position: 5,
          chords: "Am7",
          ...STABS,
          rungs: ladder(50, 120, 10),
          passAt: 85,
          selfCheck: [SCRATCH_CHECK],
          minutes: 6,
        },
        {
          id: "octave-line",
          title: "Octaves with the band",
          purpose: "The same figure through three octaves over a band: a bar of A, then half a bar of D and half a bar of E, a string higher.",
          howTo: [
            "D and E are on the A and G strings: frets 5 and 7 for D, 7 and 9 for E. The shape is the same.",
            "Move during the two sixteenths of rest at the end of each half bar.",
          ],
          coach: "Band on. I time every attack against it.",
          ...FREE,
          tab: OCTAVE_LINE,
          position: 5,
          shifts: true,
          chords: "Am7 | Am7",
          jam: FUNK,
          ...STABS,
          rungs: ladder(50, 110, 10),
          passAt: 80,
          minutes: 7,
        },
      ],
    },
    {
      id: "displaced",
      title: "Across the beat",
      goal: "Play figures that are three sixteenths long, and lines whose notes fall on the 'e' and the 'a', without losing the pulse.",
      why: "A three-sixteenth figure in a bar of four slides against the beat: it starts on the beat, then just before the next one, then halfway through one, then just after one. That rub is the sound of a lot of funk and Afrobeat guitar. The hand keeps its swing, the foot keeps the beat, and the figure moves between them.",
      howTo: [
        "Tap the foot on every beat and do not let it follow the figure.",
        "Count the sixteenths in threes at the first rung: '1 2 3, 1 2 3'. Then feel it against the foot.",
        "The hand's strokes are unchanged: down, up, down, up. The figure starts on a downstroke one time and an upstroke the next.",
      ],
      payoff: "A two-note figure that rolls across the bar line of your foot and lands back on beat 1.",
      exercises: [
        {
          id: "threes",
          title: "Two notes and a hole",
          purpose: "A, G, rest, five times, and one more G to fill the bar: a three-sixteenth figure in a bar of sixteen.",
          howTo: [
            "The figure starts on beat 1, then on the 'a' of 1, the 'and' of 2, the 'e' of 3 and on beat 4.",
            "The first figure and the last start on a beat. Everything between slides.",
          ],
          coach: "I time each note against where it is written, and check the two pitches after the take.",
          ...FREE,
          tab: THREES,
          position: 5,
          harmony: A_PENT,
          rungs: ladder(50, 110, 10),
          passAt: 80,
          ...LINE,
          selfCheck: ["Did your foot stay on the beat while the figure moved?"],
          minutes: 6,
        },
        {
          id: "off-the-e",
          title: "Starting on the 'e'",
          purpose: "A low A on beat 1, then pairs of notes on the 'e' and the 'a', answered by pairs on the next beat and its 'and': upstrokes and downstrokes in turn.",
          howTo: [
            "Count '1 e (and) a, 2 (e) and (a), (3) e (and) a, 4 (e) and (a)'. Beat 3 is the only beat that starts with silence.",
            "Upstroke notes are usually quieter. Make them match the downstroke that starts the bar.",
          ],
          coach: "Four of these notes are on the 'e' and the 'a'. I'll say how even they were.",
          ...FREE,
          tab: OFF_THE_E,
          position: 5,
          harmony: A_PENT,
          rungs: ladder(50, 110, 10),
          passAt: 80,
          ...LINE,
          selfCheck: [SCRATCH_CHECK],
          minutes: 6,
        },
        {
          id: "long-phrase",
          title: "A two-bar phrase",
          purpose: "A longer line in the pentatonic box whose rhythm keeps changing from beat to beat, ending on a held low A.",
          howTo: [
            "Count bar 1 '1 (e) and a, (2) e and (a), 3 (e and) a, (4) e (and) a' and bar 2 '1 (e and) a, 2 (e) and (a), 3 e (and) a, 4'. Take it at the first rung until you can sing it.",
            "The held A at the end is the only long note. Everything before it is short.",
          ],
          coach: "This is the Step's test piece. I'll say how even it was and check the notes after the take.",
          ...FREE,
          tab: LONG_PHRASE,
          position: 5,
          harmony: A_PENT,
          rungs: ladder(50, 110, 10),
          passAt: 80,
          ...LINE,
          minutes: 7,
        },
      ],
    },
    DISPLACED_SHAPES,
    {
      id: "the-sixth",
      title: "The Dorian sixth, and hammer-ons",
      goal: "Use F#, the note that turns a minor pentatonic line into a funk line, and hammer into notes inside a sixteenth-note rhythm.",
      why: "Funk in a minor key nearly always adds one note to the minor pentatonic: in the key of A it is F#. You have played it already, in the D9 bar of the vamp, and its twin G#, the note that does the same job in B minor, in the E9 bar. F# is one of the notes of D9, so playing it when that chord arrives makes the line and the harmony agree. The pentatonic with this note added is most of a scale called Dorian, where F# is the sixth note. The Scales and Modes Path teaches that scale whole. A hammer-on into a note is the other small thing that makes a line sound spoken.",
      howTo: [
        "F# is the D string at fret 4, one fret below the G. The first finger reaches back for it.",
        "Aim F# at the bars where the chord is D9.",
        HAMMER_IS,
        "Here the third finger comes down two frets higher, and the two notes are two even sixteenths from one stroke. The hand still swings, and misses the string for the hammered note. Legato teaches the hammer-on if it is new.",
      ],
      payoff: "A four-bar line over Am7 and D9 that could not be played with the pentatonic alone.",
      exercises: [
        {
          id: "sixth",
          title: "A line with F#",
          purpose: "Two bars: the first funk line, which fits Am7, then an answer around D, E, F# and G that fits D9.",
          howTo: [
            "Bar 2 starts on D, the A string at fret 5. Its F# is the D string at fret 4.",
            "The hand shifts back one fret for bar 2, or the first finger stretches. Either works at these tempos.",
          ],
          coach: "I time the notes and check them after the take. F# is the one I'm listening for.",
          ...FREE,
          tab: THE_SIXTH,
          position: 5,
          shifts: true,
          harmony: A_DORIAN,
          rungs: ladder(50, 110, 10),
          passAt: 85,
          ...LINE,
          minutes: 6,
        },
        {
          id: "hammered",
          title: "Hammer into the note",
          purpose: "G hammered to A on the D string, and D hammered to E on the A string, placed on different sixteenths of the bar.",
          howTo: [
            "Pick fret 5 and hammer fret 7 with the third finger, as two even sixteenths.",
            "After some of the hammer-ons the upper note is picked again. That one is a separate stroke.",
          ],
          coach: "A hammer-on I can't hear costs nothing, so the picked notes carry the timing. Its volume is for your ear.",
          ...FREE,
          tab: HAMMERED,
          position: 5,
          harmony: A_PENT,
          rungs: ladder(50, 110, 10),
          passAt: 85,
          ...LINE,
          minutes: 6,
        },
        {
          id: "two-chord-line",
          title: "Four bars over Am7 and D9",
          purpose: "A line that follows the chords: pentatonic over the Am7 bars, F# in the D9 bars, with a hammer-on in bar 3 and a held D to end.",
          howTo: [
            "Bars 1 and 3 are over Am7 and start on A. Bars 2 and 4 are over D9 and start on D.",
            "Bar 3 starts like bar 1. On beat 3 it stays on the D string: G hammered to A, then A picked again on the 'a'.",
          ],
          coach: "Band on. I time your notes against it and check them after the take.",
          ...FREE,
          tab: TWO_CHORD_LINE,
          position: 5,
          shifts: true,
          chords: "Am7 | D9 | Am7 | D9",
          jam: FUNK,
          harmony: { scaleOverChords: ["A", "dorian"] },
          rungs: ladder(50, 110, 10),
          passAt: 85,
          ...LINE,
          minutes: 7,
        },
      ],
    },
    {
      id: "the-pocket",
      title: "The pocket",
      goal: "Hold a four-bar groove of lines, stabs and octaves over a band, and keep a one-bar line in the pocket for a full minute.",
      why: "A funk guitarist plays the same bar for five minutes and it has to feel better at the end than at the start. That is what 'the pocket' means: nothing rushes, nothing drags, every note is the same length it was last time. Long takes are the only way to practise it.",
      howTo: [
        "For the minute, choose a rung where the line feels easy. The work is in keeping it identical.",
        "Listen to the band more than to yourself. If the groove feels good, your time is good.",
        SAFETY,
      ],
      payoff: "A four-bar funk guitar part with everything in it, and a line you can sit on for as long as the band plays.",
      difficultyException:
        "Nothing new for the hands: lines, stabs and octaves from the earlier Steps, two of them one bar long, so the number falls back to theirs. The demand is length: four bars of everything in a row, and one bar kept identical for a minute, which the metric does not count.",
      exercises: [
        {
          id: "groove",
          title: "Four bars of everything",
          purpose: "A bar of line and stabs on Am7, a bar on D9, a bar of A in octaves, and a bar that starts in D octaves and walks up in single notes: D, E, F#, G.",
          howTo: [
            "Bars 1 and 2 are the vamp from 'Line and stab'. The Am7 stab is the first finger flat on the G and B strings at fret 5. The D9 stab is the third and little fingers at fret 7, and the first finger reaches back to fret 4 for the F#. Bar 3 is the octave figure from 'Octaves'. Bar 4 is half octaves, half single notes.",
            "The changes of register are the hard part. Look at the string you are going to.",
          ],
          coach: "Band on. I time every attack against it. Pitch is not checked when stabs and octaves are in the line.",
          ...FREE,
          tab: GROOVE,
          position: 5,
          shifts: true,
          chords: "Am7 | D9 | Am7 | D9",
          jam: FUNK,
          ...STABS,
          rungs: ladder(50, 110, 10),
          passAt: 80,
          minutes: 8,
        },
        {
          id: "pocket-minute",
          title: "One bar for a minute",
          purpose: "The first bar of the first funk line, round and round over the band for sixty seconds.",
          howTo: [
            "Play it exactly the same every time: the same short notes, the same holes.",
            "If your mind wanders, listen to the hi-hat and lock the hand's swing to it again.",
          ],
          coach: "I check that the time holds to the end of the minute. Whether every bar felt the same is for your ear.",
          ...FREE,
          tab: POCKET,
          position: 5,
          holdSeconds: 60,
          chords: "Am7",
          jam: FUNK,
          harmony: A_PENT,
          rungs: ladder(50, 110, 10),
          passAt: 80,
          grade: "stamina",
          selfCheck: ["Did the last ten seconds feel as relaxed as the first ten?"],
          minutes: 4,
        },
        {
          id: "stab-minute",
          title: "Stabs for a minute",
          purpose: "The off-beat stab part, a bass note and a stab on every 'and', for sixty seconds.",
          howTo: [
            "Keep every stab the same length. They get longer when the hand tires.",
            "Breathe, and let the shoulder drop.",
          ],
          coach: "I check that the time holds to the end of the minute.",
          ...FREE,
          tab: STAB_OFFBEAT,
          position: 5,
          holdSeconds: 60,
          chords: "Am7",
          rungs: ladder(50, 120, 10),
          passAt: 85,
          grade: "stamina",
          selfCheck: [SHORT_CHECK],
          minutes: 4,
        },
      ],
    },
    LONG_FORM,
  ],
  levels: [
    {
      id: "beginner",
      title: "Beginner: the hand that never stops",
      summary: "Even sixteenths with accents, the one-hole figures alone and then mixed in one bar, a two-bar rhythm on one note, and lines over a band in A minor and in D minor, the last one built from the figures.",
      reachLevel: "early-intermediate",
      startHereIf: [
        "You can play sixteenth notes with a click at 70 BPM.",
        "Your picking hand stops when the rhythm has a rest in it.",
        "You know the pentatonic box at the fifth fret, or can learn its notes on four strings.",
      ],
      steps: ["the-engine", "holes", "holes-mixed", "first-lines", "lines-second-key"],
      warmups: [
        {
          id: "swing-up",
          title: "The swing up one string",
          purpose: "One, and-a on a single note of a minor scale, a note higher each bar on the D string. A different key each time.",
          howTo: ["Start well under your clean tempo. Down, down-up on every beat, first finger only, and move it up a note at each bar line."],
          coach: "This is a warm-up. It tells you how it went, and it decides nothing.",
          ...FREE,
          vary: {
            values: WARM_KEYS,
            pooled: ["key"],
            label: (p) => p.key,
            build: (p) => warm(p.key, (n) => repeat(`/8 ${n} /16 ${n} ${n}`, 4)),
          },
          grade: "warmup",
          warmup: { start: 0.6, top: 0.8, reference: "holes.no-e", fallback: 60 },
          rungs: ladder(50, 90, 10),
          minutes: 3,
        },
      ],
    },
    {
      id: "intermediate",
      title: "Intermediate: stabs and octaves",
      summary: "Two-note stabs on and off the beat, a line and stabs in one bar over Am7 and D9, a new line on the same shapes over Bm7 and E9, and octaves.",
      reachLevel: "early-intermediate",
      startHereIf: [
        "You can play '1 e (and) a' and '(1) e and a' figures at 85 BPM with the hand swinging through the rests.",
        "You can play a two-bar single-note line over a band and keep the notes short.",
        "Hitting two strings at once comes out late, or rings on.",
      ],
      steps: ["stabs", "line-and-stab", "second-pair", "octaves"],
      warmups: [
        {
          id: "hole-up",
          title: "The hole up one string",
          purpose: "One-e, a on a single note of a minor scale, a note higher each bar on the D string. A different key each time.",
          howTo: ["Start well under your clean tempo. Down, up, miss, up on every beat, first finger only, and move it up a note at each bar line."],
          coach: "This is a warm-up. It tells you how it went, and it decides nothing.",
          ...FREE,
          vary: {
            values: WARM_KEYS,
            pooled: ["key"],
            label: (p) => p.key,
            build: (p) => warm(p.key, (n) => `/16 ${repeat(`${n} ${n} r ${n}`, 4)}`),
          },
          grade: "warmup",
          warmup: { start: 0.6, top: 0.8, reference: "holes.no-and", fallback: 60 },
          rungs: ladder(50, 90, 10),
          minutes: 3,
        },
      ],
    },
    {
      id: "advanced",
      title: "Advanced: across the beat, and the pocket",
      summary: "Three-sixteenth figures and lines that start off the beat, as single notes and then as stabs and octaves, the Dorian sixth and hammer-ons, then a four-bar groove, a full minute, and an eight-bar form with a change of part.",
      reachLevel: "intermediate",
      startHereIf: [
        "You can play a line and stabs in one bar at 80 BPM with a band.",
        "You can play octaves in a sixteenth-note rhythm with the middle string silent.",
        "Your parts work for 2 bars and drift over a whole song.",
      ],
      steps: ["displaced", "displaced-shapes", "the-sixth", "the-pocket", "long-form"],
      warmups: [
        {
          id: "threes-up",
          title: "Threes up one string",
          purpose: "Two notes and a hole, five times a bar and one more note to fill it, on a single note of a minor scale, a note higher each bar on the D string. A different key each time.",
          howTo: ["Start well under your clean tempo. Foot on the beat while the figure slides across it; first finger only, and move it up a note at each bar line."],
          coach: "This is a warm-up. It tells you how it went, and it decides nothing.",
          ...FREE,
          vary: {
            values: WARM_KEYS,
            pooled: ["key"],
            label: (p) => p.key,
            build: (p) => warm(p.key, (n) => `/16 ${repeat(`${n} ${n} r`, 5)} ${n}`),
          },
          grade: "warmup",
          warmup: { start: 0.6, top: 0.8, reference: "displaced.threes", fallback: 60 },
          rungs: ladder(50, 90, 10),
          minutes: 3,
        },
      ],
    },
  ],
});
