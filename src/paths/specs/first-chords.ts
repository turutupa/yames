/**
 * First Chords and Strumming, a Mechanics Path. A draft: no teacher or
 * guitarist has reviewed it, and nothing in it has met a real guitar.
 *
 * The other true-beginner Path (`plans/paths/NEW_PATHS.md`, "First chords and
 * strumming"): open chords, the changes between them, and strumming, up to a
 * first whole song. It is built on what the grader can judge today:
 *
 * - A strum is written as the chord's notes on one tick, and notes sharing a
 *   tick are ONE expected onset (`src/songs/schedule.ts`). So a strum is
 *   timed and counted exactly as a two-note power chord is in Metal Rhythm,
 *   and the detector's refractory window (40 to 50 ms at the least, wider at
 *   slow tempos) is what keeps one stroke across six strings from reading as
 *   six. Graded on timing, strums heard and extras. Never on pitch. The
 *   difficulty metric counts it the same way (`../difficulty.ts`): a strum
 *   is one onset, so four strums a bar read what four notes a bar read.
 * - Whether every string of a chord rings is checked where it can be: the
 *   chord picked one string at a time, slowly, as written single notes.
 * - Stroke direction, muting and tone are taught in words and listed as not
 *   graded. Choosing a pattern, and playing along with a song, are "your
 *   turn": self-checked.
 */
import { definePath } from "../spec";
import type { ExerciseSpec, VariantParams } from "../spec";
import type { PassBar } from "../format";
import { ladder } from "../templates";
import { SEVENTHS_BLUES, SIXTEENTH_STRUMS, STRUMS_BETWEEN_BEATS } from "./first-chords-more";

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
const YOUR_TURN = { pick: "free", grade: "selfChecked", example: true } as const satisfies Partial<ExerciseSpec>;

const STRUM_COACH = "A strum is one attack: timed and counted. Whether every string rang is for your ear.";
const BAND_COACH = "Band on. Each strum is timed and counted. Whether every string rang is for your ear.";
const STRINGS_COACH = "Right notes and steady quarter notes after the take. A dead string shows up as a missing note.";
const NOT_CHECKED_YET =
  "Your turn, and not checked yet: the app can't judge what you choose to play, so you tick it off yourself.";
const SWING_CHECK = "Did the strumming hand keep swinging down and up through the strokes you left out?";
const CHANGE_CHECK = "Did every change arrive on the beat, even when a finger was late?";

const ROCK = (key: string) => ({ groove: "rock8", key });

// ---------------------------------------------------------------------------
// Open chords, low string first, with the fingers a teacher would give a
// beginner. E minor is held with the second and third fingers so that A minor
// and E major are one small move away; G is held with the second, third and
// fourth so that C and E minor are.
// ---------------------------------------------------------------------------

const CHORDS = {
  Em: ["6:0", "5:2f2", "4:2f3", "3:0", "2:0", "1:0"],
  Am: ["5:0", "4:2f2", "3:2f3", "2:1f1", "1:0"],
  C: ["5:3f3", "4:2f2", "3:0", "2:1f1", "1:0"],
  G: ["6:3f3", "5:2f2", "4:0", "3:0", "2:0", "1:3f4"],
  D: ["4:0", "3:2f1", "2:3f3", "1:2f2"],
  A: ["5:0", "4:2f1", "3:2f2", "2:2f3", "1:0"],
  E: ["6:0", "5:2f2", "4:2f3", "3:1f1", "2:0", "1:0"],
  Dm: ["4:0", "3:2f2", "2:3f3", "1:1f1"],
  Fmaj7: ["4:3f3", "3:2f2", "2:1f1", "1:0"],
  F: ["4:3f3", "3:2f2", "2:1f1", "1:1f1"],
} as const;
type Chord = keyof typeof CHORDS;

/** A downstroke: every string of the chord. */
const dn = (chord: Chord) => CHORDS[chord].join("+");
/** An upstroke: only the three thinnest strings. */
const up = (chord: Chord) => CHORDS[chord].slice(-3).join("+");
const accented = (strum: string) => strum.split("+").map((part) => `${part}>`).join("+");

/** One bar of a strumming figure on a chord. `D` a downstroke, `U` an upstroke, `A` an accented downstroke. */
const figure = (pattern: string) => (chord: Chord) =>
  pattern.replace(/\bD\b/g, dn(chord)).replace(/\bU\b/g, up(chord)).replace(/\bA\b/g, accented(dn(chord)));
const song = (bar: (chord: Chord) => string, chords: readonly Chord[]) => chords.map(bar).join(" | ");

const ONCE = figure("/1 D");
const TWICE = figure("/2 D D");
const FOUR = figure("/4 D D D D");
const EIGHTHS = figure("/8 D U D U D U D U");
const DOWN_DOWN_UP = figure("/4 D /8 D U /4 D /8 D U");
/** Down, down-up, up-down-up: the down on beat 3 misses the strings. */
const PATTERN = figure("/4 D /8 D U r U D U");
/** Down, down-up, up, down: the pattern without its last upstroke (Step `strums-between-beats`). */
const SHORT_PATTERN = figure("/4 D /8 D U r U /4 D");
const ACCENTS = figure("/8 D U A U D U A U");
const STOP = figure("/4 D /8 D U /4 r /8 D U");

/** The chord one string at a time: up through its strings and back, ending one string above the lowest. */
function strings(chord: Chord): string {
  const n = CHORDS[chord];
  if (n.length === 6) return `/4 ${n[0]} ${n[1]} ${n[2]} ${n[3]} | ${n[4]} ${n[5]} ${n[4]} ${n[3]} | ${n[2]} ${n[1]} ${n[0]} ${n[1]}`;
  if (n.length === 5) return `/4 ${n[0]} ${n[1]} ${n[2]} ${n[3]} | ${n[4]} ${n[3]} ${n[2]} ${n[1]}`;
  return `/4 ${n[0]} ${n[1]} ${n[2]} ${n[3]} | ${n[2]} ${n[1]} ${n[0]} ${n[1]}`;
}

/** Root on beats 1 and 3, the top three strings on 2 and 4. */
const bassStrum = (chord: Chord) => `/4 ${CHORDS[chord][0]} ${up(chord)} ${CHORDS[chord][0]} ${up(chord)}`;

const VERSE: readonly Chord[] = ["G", "Em", "C", "D"];
const CHORUS: readonly Chord[] = ["C", "G", "D", "Em", "C", "G", "D", "D"];
const VERSE_TAB = song(DOWN_DOWN_UP, [...VERSE, ...VERSE]);
const CHORUS_TAB = song(PATTERN, CHORUS);
const VERSE_CHART = "G | Em | C | D | G | Em | C | D";
const CHORUS_CHART = "C | G | D | Em | C | G | D | D";

// ---------------------------------------------------------------------------
// Warm-ups. Open chords sit under one hand, and a warm-up has to move, so
// these walk a scale along one string (the fingers that will press the chords)
// and, in the last Level, slide the small two-string barre that F needs.
// ---------------------------------------------------------------------------

const OPEN_STRINGS: Readonly<Record<string, { string: number; root: string }>> = {
  "low E": { string: 6, root: "E" },
  A: { string: 5, root: "A" },
  D: { string: 4, root: "D" },
  G: { string: 3, root: "G" },
  B: { string: 2, root: "B" },
  "top E": { string: 1, root: "E" },
};
/** A scale along one string from its open note: the same frets on every string. */
function stringWalk(frets: readonly number[], scale: string, tabOf: (at: (step: number) => string) => string) {
  return {
    values: { stringSet: Object.keys(OPEN_STRINGS) },
    pooled: ["stringSet"] as const,
    label: (p: VariantParams) => `${OPEN_STRINGS[p.stringSet].root} ${scale === "major" ? "major" : "minor"} on the ${p.stringSet} string`,
    build: (p: VariantParams) => {
      const { string, root } = OPEN_STRINGS[p.stringSet];
      const at = (step: number) => (frets[step] === 0 ? `${string}:0` : `${string}:${frets[step]}f1`);
      return { tab: tabOf(at), position: 1, shifts: true, harmony: { scale: [root, scale] as [string, string] } };
    },
  };
}
const MINOR_FRETS = [0, 2, 3, 5, 7, 8, 10, 12];
const MAJOR_FRETS = [0, 2, 4, 5, 7, 9, 11, 12];

/** Two strings under one flat finger, moved along the neck on frets where both notes are in C major. */
const BARRE_PAIRS: Readonly<Record<string, { strings: [number, number]; frets: readonly number[] }>> = {
  "B and top E": { strings: [2, 1], frets: [1, 3, 5, 8, 10, 12] },
  "D and G": { strings: [4, 3], frets: [2, 5, 7, 9, 10, 12] },
  "A and D": { strings: [5, 4], frets: [2, 3, 5, 7, 10, 12] },
  "low E and A": { strings: [6, 5], frets: [3, 5, 7, 8, 10, 12] },
};

export default definePath({
  id: "first-chords",
  title: "First Chords and Strumming",
  kind: "mechanics",
  category: "foundations",
  goal: "Play thirteen chords that ring, change between them in time, strum them down and up with a pattern, play a twelve-bar blues, and play a whole song of sixteen bars.",
  level: "beginner",
  assumes:
    "You have a guitar that is in tune, you can hold a pick, and you can press one string down and make it sound. Nothing else: no chords, no reading, no theory. The minutes listed are one pass through the material. Chord changes take weeks of short daily practice to become automatic, and that is normal.",
  prerequisites: {
    paths: [],
    skills: ["A guitar in tune", "Pressing one string so that it rings"],
  },
  paceLadders: true,
  orderRationale:
    "One chord before two, and two before three: the first Step is only E minor, which uses two fingers and all six strings, so the player can attend to making it ring and to the click. Each new chord arrives with the easiest change into it (E minor to A minor, where two fingers move as a pair; A minor to C, where one finger moves), and is first checked one string at a time, the one place the app can hear whether a chord is clean. Strums go from one a bar to four a bar before any upstroke, because time to change is what a beginner lacks. G and D come in the second Level with the hardest changes, then the upstroke, then patterns as the same swing with strokes left out, so that a pattern is never a new movement. Strums between the beats closes that Level straight after patterns, because a rest and an off-beat upstroke are the same swing with more strokes left out, and its shorter pattern shows the player how to buy a whole beat for a change before the chords multiply. The last Level adds A, E and D minor, takes F in three small steps instead of as a wall, and brings dynamics before the song, because a song strummed at one volume is the beginner's sound. The seventh chords follow A and E directly: A7 and E7 are those chords with one finger lifted and D7 is D with one note changed, the twelve-bar blues is the A, D, E form of that Step grown from eight bars to twelve, and both come before F so that the first long form is played on easy shapes. Sixteenth strums come after the dynamics and just before the song, as the last new thing the strumming hand learns and at slow tempos; the song then goes back to eighths, so that its sixteen bars ask for nothing new. Chord theory is left to Triads and Chords in a Key on purpose: this Path is hands.",
  gradingLimits:
    "The app times each strum against where it is written and counts the strums it heard. To the app a strum is one attack, however many strings it crosses: it cannot tell which strings rang, whether one buzzed, or whether it was the right chord. That is what the string checks are for. There you pick the chord one string at a time, and each note is checked. Upstrokes are quieter than downstrokes and one may be missed, so the bar on strums heard is forgiving. The direction of each stroke, muting, and how hard you hit are taught here and are yours to keep honest; accents are read roughly, louder or not. None of this has been tried on a real guitar yet: a slow, spread-out strum may be heard as two attacks, and then a take reads worse than you played. Direct input or headphones are the honest way to play the band Exercises. Choosing your own pattern and playing along with a song are 'your turn', self-checked and labelled 'not checked yet'.",
  steps: [
    // ----------------------------------------------------------------- Beginner
    {
      id: "e-minor",
      title: "Your first chord: E minor",
      goal: "Hold an E minor chord so that all six strings ring, and strum it in time: once a bar, then on every beat.",
      why: "A chord is several notes sounding together, held by one shape of the hand. E minor is the place to start: two fingers, side by side on the same fret, and all six strings are played, so there is nothing to avoid. Two things have to be true before a chord is a chord. Every string rings, and the strum lands on the beat. This Step takes them one at a time: first the strings, slowly, where the app can hear each one, and then the strum, where it listens to your timing.",
      howTo: [
        "The words this Path uses. The strings, from thickest to thinnest: low E, A, D, G, B and the top string. Fret 1 is the first space next to the nut, at the head end of the neck. Fingers are numbered from the index finger: first, second, third, and the little finger is the fourth.",
        "A click is the tick of the metronome. Each tick is a beat, four beats make a bar, and BPM is how many beats go by in a minute. A whole note lasts a whole bar, a half note two beats, a quarter note one beat. The pass tempo is the speed at which an Exercise counts as done.",
        "One play through an Exercise is a Take. Each Exercise has a ladder of tempos called rungs: between Takes, Slower and Faster move one rung along it, and the pass tempo is the rung at which the Exercise counts as done. Some Exercises change key or string from Take to Take.",
        "E minor: second finger on the A string at fret 2, third finger on the D string at fret 2. The other four strings are open.",
        "Press with the fingertips, just behind the fret, and keep the fingers arched so they do not lean on the string below. The thumb rests behind the neck, about level with the second finger.",
        "Strum downward from the low E string through all six in one relaxed swing of the forearm and wrist, as if brushing crumbs off the strings. That is a downstroke. Hold the pick loosely.",
        "A string that buzzes or stays dead nearly always has a finger too far from the fret, or a finger next door touching it.",
      ],
      payoff: "A chord that rings on all six strings, strummed in time with a click.",
      exercises: [
        {
          id: "em-strings",
          title: "Check every string",
          purpose: "The E minor chord one string at a time, from the low E string to the top string and back, while you hold the shape down. A note that is dead here is dead in the strum too.",
          howTo: [
            "Quarter notes, 40 BPM up to a pass at 70.",
            "On the tab each line is a string: the top line is the top string and the bottom line is the low E string. Each number is the fret to press. 0 is an open string, one played with no finger on it.",
            "Hold the chord down the whole time. Pick the low E string, then A, D, G, B and the top string, and come back: B, G, D, A, low E, and A once more to finish the bar.",
            "The fretted notes are on the A string and the D string, both at fret 2. Everything else is open.",
          ],
          coach: STRINGS_COACH,
          tab: strings("Em"),
          position: 1,
          chordShape: "Em",
          harmony: { arpeggio: "Em", cover: true },
          rungs: ladder(40, 100, 10),
          passAt: 70,
          ...STRINGS,
          minutes: 4,
        },
        {
          id: "em-once",
          title: "One strum a bar",
          purpose: "Strum all six strings on beat 1 and let the chord ring for four beats. Count '1, 2, 3, 4' out loud and strum only on 1.",
          howTo: [
            "Whole notes, 40 BPM up to a pass at 70. One downstroke on beat 1 of each bar.",
            "While the chord rings, look at your fingers: still arched, still just behind the fret.",
            "Let the hand fall through the strings. The strum should take no longer than saying 'one'.",
          ],
          coach: STRUM_COACH,
          tab: song(ONCE, ["Em", "Em", "Em", "Em"]),
          position: 1,
          chordShape: "Em",
          chords: "Em | Em | Em | Em",
          harmony: { chordTones: true },
          rungs: ladder(40, 100, 10),
          passAt: 70,
          ...STRUM,
          minutes: 4,
        },
        {
          id: "em-four",
          title: "Four strums a bar",
          purpose: "Four even downstrokes to the bar, each one on a click. This is the pulse every strumming pattern is built on.",
          howTo: [
            "Quarter notes, 40 BPM up to a pass at 70. Down on every beat.",
            "The hand comes back up between strums without touching the strings. Keep that return the same size every time.",
            "If the chord stops ringing after a few strums, a finger has relaxed. Press again without stopping the hand.",
          ],
          coach: STRUM_COACH,
          tab: song(FOUR, ["Em", "Em", "Em", "Em"]),
          position: 1,
          chordShape: "Em",
          chords: "Em | Em | Em | Em",
          harmony: { chordTones: true },
          rungs: ladder(40, 100, 10),
          passAt: 70,
          ...STRUM,
          minutes: 5,
        },
      ],
    },
    {
      id: "a-minor",
      title: "A minor, and your first change",
      goal: "Hold A minor so that five strings ring, and change between E minor and A minor without losing the beat.",
      why: "One chord is a sound. Two chords are music. Almost all the difficulty of rhythm guitar at the start is the change: getting every finger to the next chord before the next strum. E minor to A minor is the kindest change there is, because the second and third fingers keep their shape and move across one string together, and the first finger joins them. The rule for every change you will ever make starts here: the strumming hand does not wait. It plays on the beat, and the other hand learns to be there.",
      howTo: [
        "A minor: first finger on the B string at fret 1, second finger on the D string at fret 2, third finger on the G string at fret 2. The A string and the top string are open. The low E string is not played: start the strum from the A string.",
        "From E minor, the second and third fingers move together one string toward the floor, which means to the next thinner string: from the A and D strings to the D and G strings. The first finger lands on the B string.",
        "Start moving a little before the bar line. A chord cut short is better than a strum that comes late.",
      ],
      payoff: "Two chords, and a change that arrives on the beat.",
      difficultyException:
        "Two of the four Exercises are one strum and two strums a bar, so that the change has three beats and then one beat to happen in, before the Step reaches the four strums a bar the Step before ended on. The strum rate is lower on purpose. The demand is the change: every finger on the next chord before the next strum, which the metric does not count.",
      exercises: [
        {
          id: "am-strings",
          title: "Check every string of A minor",
          purpose: "A minor one string at a time, from the A string to the top string and back, with the shape held down.",
          howTo: [
            "Quarter notes, 40 BPM up to a pass at 70.",
            "Pick the A string, then D, G, B and the top string, and come back: B, G, D.",
            "The open top string is the one that goes dead most often: the first finger leans on it. Arch that finger more.",
          ],
          coach: STRINGS_COACH,
          tab: strings("Am"),
          position: 1,
          chordShape: "Am",
          harmony: { arpeggio: "Am", cover: true },
          rungs: ladder(40, 100, 10),
          passAt: 70,
          ...STRINGS,
          minutes: 4,
        },
        {
          id: "em-am-once",
          title: "One strum a bar, two chords",
          purpose: "E minor, A minor, E minor, A minor: one strum on beat 1 of each bar, and three beats of ringing chord in which to get ready.",
          howTo: [
            "Whole notes, 40 BPM up to a pass at 70.",
            "Strum on 1, let the chord ring on 2 and 3, and move the fingers on 4 so they land with the next strum.",
            "E minor is strummed from the low E string. A minor is strummed from the A string.",
          ],
          coach: STRUM_COACH,
          tab: song(ONCE, ["Em", "Am", "Em", "Am"]),
          position: 1,
          chords: "Em | Am | Em | Am",
          harmony: { chordTones: true },
          rungs: ladder(40, 100, 10),
          passAt: 70,
          ...STRUM,
          selfCheck: [CHANGE_CHECK],
          minutes: 5,
        },
        {
          id: "em-am-twice",
          title: "Two strums a bar",
          purpose: "The same two chords with a strum on beats 1 and 3. Now there is one beat to change in, not three.",
          howTo: [
            "Half notes, 40 BPM up to a pass at 70. Down on 1 and on 3.",
            "Move on beat 4. If a finger is late, strum anyway and let it catch up.",
          ],
          coach: STRUM_COACH,
          tab: song(TWICE, ["Em", "Am", "Em", "Am"]),
          position: 1,
          chords: "Em | Am | Em | Am",
          harmony: { chordTones: true },
          rungs: ladder(40, 100, 10),
          passAt: 70,
          ...STRUM,
          selfCheck: [CHANGE_CHECK],
          minutes: 5,
        },
        {
          id: "em-am-four",
          title: "Four strums a bar, with the band",
          purpose: "E minor and A minor, four downstrokes each, over a band. The change has to happen between the fourth strum of one bar and the first of the next.",
          howTo: [
            "Quarter notes, 40 BPM up to a pass at 70. Down on every beat.",
            "The band is a drummer and a bassist in place of the click.",
            "Start moving the fingers on the fourth strum, so that they land with the next one. It does not matter if that last strum is a little short.",
            "Keep the strumming hand going whatever the other hand is doing. The band will not wait, and you should not either.",
            "If you get lost, stop, find beat 1 of the next bar and come back in there.",
          ],
          coach: BAND_COACH,
          tab: song(FOUR, ["Em", "Am", "Em", "Am"]),
          position: 1,
          chords: "Em | Am | Em | Am",
          jam: ROCK("E minor"),
          harmony: { chordTones: true },
          rungs: ladder(40, 100, 10),
          passAt: 70,
          ...STRUM,
          selfCheck: [CHANGE_CHECK],
          minutes: 6,
        },
      ],
    },
    {
      id: "c-major",
      title: "C major: one finger moves",
      goal: "Hold a C chord, change between A minor and C by moving one finger, and play an eight-bar tune with E minor, A minor and C.",
      why: "C is the first chord that asks the hand to stretch: the third finger reaches to the third fret of the A string. It comes now because it is one finger away from A minor. The first and second fingers do not move at all. Changes like that, where some fingers stay down as anchors, are worth looking for in every pair of chords you meet. And three chords are enough for a first whole tune.",
      howTo: [
        "A chord named by a letter alone is a major chord, so C is short for C major. Minor chords always have the word minor in the name, as in E minor and A minor. C: first finger on the B string at fret 1, second finger on the D string at fret 2, third finger on the A string at fret 3. The G string and the top string are open. The low E string is not played.",
        "From A minor, only the third finger moves: from the G string at fret 2 to the A string at fret 3. Keep the first and second fingers pressed while it travels.",
        "The open G string sits between two fretted strings. If it is dead, the second or the first finger is leaning on it.",
      ],
      payoff: "Three chords, a change with anchors, and eight bars that sound like a song. The Beginner Level of Rhythm Foundations goes well alongside the next Level of this Path. It is single notes with a click, which several other Paths build on.",
      exercises: [
        {
          id: "c-strings",
          title: "Check every string of C",
          purpose: "C one string at a time, from the A string to the top string and back, with the shape held down.",
          howTo: [
            "Quarter notes, 40 BPM up to a pass at 70.",
            "Pick the A string, then D, G, B and the top string, and come back: B, G, D.",
            "Listen for the two open strings, G and top E. They are the ones a leaning finger kills.",
          ],
          coach: STRINGS_COACH,
          tab: strings("C"),
          position: 1,
          chordShape: "C",
          harmony: { arpeggio: "C", cover: true },
          rungs: ladder(40, 100, 10),
          passAt: 70,
          ...STRINGS,
          minutes: 4,
        },
        {
          id: "am-c",
          title: "A minor and C",
          purpose: "A minor, C, A minor, C, four downstrokes each, over the band. One finger goes back and forth and two stay where they are.",
          howTo: [
            "Quarter notes, 40 BPM up to a pass at 70. Down on every beat.",
            "Both chords are strummed from the A string. Watch only the third finger: G string fret 2 for A minor, A string fret 3 for C.",
          ],
          coach: BAND_COACH,
          tab: song(FOUR, ["Am", "C", "Am", "C"]),
          position: 1,
          chords: "Am | C | Am | C",
          jam: ROCK("A minor"),
          harmony: { chordTones: true },
          rungs: ladder(40, 100, 10),
          passAt: 70,
          ...STRUM,
          selfCheck: [CHANGE_CHECK],
          minutes: 5,
        },
        {
          id: "three-chords",
          title: "E minor, A minor, C",
          purpose: "E minor, A minor, C, and back through A minor: all three chords, each reached by the easy change.",
          howTo: [
            "Quarter notes, 40 BPM up to a pass at 70. Down on every beat, one bar on each chord.",
            "E minor to A minor: two fingers move one string toward the floor and the first finger lands. A minor to C: the third finger moves. C to A minor: it moves back.",
            "From A minor back to E minor at the repeat, the first finger lifts and the other two move back up one string.",
          ],
          coach: BAND_COACH,
          tab: song(FOUR, ["Em", "Am", "C", "Am"]),
          position: 1,
          chords: "Em | Am | C | Am",
          jam: ROCK("A minor"),
          harmony: { chordTones: true },
          rungs: ladder(40, 100, 10),
          passAt: 70,
          ...STRUM,
          selfCheck: [CHANGE_CHECK],
          minutes: 6,
        },
        {
          id: "first-tune",
          title: "A first tune: eight bars",
          purpose: "Two bars each of E minor, A minor, C and A minor over the band. Eight bars is a real section of a song, and two bars on a chord gives you time to breathe.",
          howTo: [
            "Quarter notes, 40 BPM up to a pass at 70. Down on every beat.",
            "Count the bars as well as the beats: '1, 2, 3, 4, 2, 2, 3, 4', and change after the second bar of each chord.",
            "Hum a note over it. If you can hum while you strum, the strumming hand is running by itself.",
          ],
          coach: "Eight bars with the band. Each strum is timed and counted.",
          tab: song(FOUR, ["Em", "Em", "Am", "Am", "C", "C", "Am", "Am"]),
          position: 1,
          chords: "Em | Em | Am | Am | C | C | Am | Am",
          jam: ROCK("A minor"),
          harmony: { chordTones: true },
          rungs: ladder(40, 100, 10),
          passAt: 70,
          ...STRUM_LONG,
          selfCheck: [CHANGE_CHECK],
          minutes: 6,
        },
      ],
    },
    // ------------------------------------------------------------- Intermediate
    {
      id: "g-major",
      title: "G major",
      goal: "Hold a G chord, and change between G and E minor and between G and C.",
      why: "G is the home chord of a huge number of guitar songs, and it is a big shape: three fingers spread over all six strings. The fingering taught here uses the second, third and fourth fingers. It feels strange for a few weeks, and it pays for itself, because both of the changes you need most become short. To E minor, one finger stays. To C, two fingers move across one string as a pair, the same kind of move you learned from E minor to A minor.",
      howTo: [
        "G: second finger on the A string at fret 2, third finger on the low E string at fret 3, fourth finger on the top string at fret 3. The D, G and B strings are open. Strum all six. The first finger does nothing.",
        "To E minor: the second finger stays on the A string. The third finger moves from the low E string to the D string at fret 2, and the fourth finger lifts.",
        "To C: the second and third fingers move together one string toward the floor, to the D string at fret 2 and the A string at fret 3. The fourth finger lifts and the first lands on the B string at fret 1.",
        "Many players hold G with the first three fingers. Learn this way first: its changes are shorter, and the little finger gets strong.",
      ],
      payoff: "The most-used chord on the guitar, with short changes to two chords you know.",
      exercises: [
        {
          id: "g-strings",
          title: "Check every string of G",
          purpose: "G one string at a time, from the low E string to the top string and back, with the shape held down.",
          howTo: [
            "Quarter notes, 50 BPM up to a pass at 80.",
            "Pick the low E string, then A, D, G, B and the top string, and come back: B, G, D, A, low E, and A once more to finish the bar.",
            "The fretted notes are the low E string at fret 3, the A string at fret 2 and the top string at fret 3. The three strings in the middle are open. Keep the fourth finger up on its tip so that it does not touch the open B string.",
          ],
          coach: STRINGS_COACH,
          tab: strings("G"),
          position: 1,
          chordShape: "G",
          harmony: { arpeggio: "G", cover: true },
          rungs: ladder(50, 110, 10),
          passAt: 80,
          ...STRINGS,
          minutes: 4,
        },
        {
          id: "g-em",
          title: "G and E minor",
          purpose: "G, E minor, G, E minor, four downstrokes each, over the band. The second finger never leaves the A string.",
          howTo: [
            "Quarter notes, 50 BPM up to a pass at 80. Down on every beat.",
            "Keep the second finger pressed on the A string at fret 2 through the whole Exercise. The third finger goes between the low E string at fret 3 and the D string at fret 2.",
          ],
          coach: BAND_COACH,
          tab: song(FOUR, ["G", "Em", "G", "Em"]),
          position: 1,
          chords: "G | Em | G | Em",
          jam: ROCK("G"),
          harmony: { chordTones: true },
          rungs: ladder(50, 110, 10),
          passAt: 80,
          ...STRUM,
          selfCheck: [CHANGE_CHECK],
          minutes: 5,
        },
        {
          id: "g-c",
          title: "G and C, two strums a bar",
          purpose: "The change guitar songs use most, with time to make it: a strum on beats 1 and 3, and beat 4 to move.",
          howTo: [
            "Half notes, 50 BPM up to a pass at 80. Down on 1 and on 3.",
            "From G to C the second and third fingers move as a pair, one string toward the floor, and the first finger lands. From C to G they move back up and the fourth finger lands on the top string.",
            "G is strummed from the low E string, C from the A string.",
          ],
          coach: STRUM_COACH,
          tab: song(TWICE, ["G", "C", "G", "C"]),
          position: 1,
          chords: "G | C | G | C",
          harmony: { chordTones: true },
          rungs: ladder(50, 110, 10),
          passAt: 80,
          ...STRUM,
          selfCheck: [CHANGE_CHECK],
          minutes: 6,
        },
        {
          id: "g-em-c",
          title: "G, E minor, C",
          purpose: "G, E minor and two bars of C, four downstrokes a bar, over the band. G to E minor and C back to G are the changes you have just practised. E minor to C is new, and the two bars of C give you room after it.",
          howTo: [
            "Quarter notes, 50 BPM up to a pass at 80. Down on every beat.",
            "G to E minor: the second finger stays. E minor to C: the second and third fingers swap strings, and the first finger lands. Take that one slowly at first.",
          ],
          coach: BAND_COACH,
          tab: song(FOUR, ["G", "Em", "C", "C"]),
          position: 1,
          chords: "G | Em | C | C",
          jam: ROCK("G"),
          harmony: { chordTones: true },
          rungs: ladder(50, 110, 10),
          passAt: 80,
          ...STRUM,
          selfCheck: [CHANGE_CHECK],
          minutes: 6,
        },
      ],
    },
    {
      id: "d-major",
      title: "D major, and three chords for a thousand songs",
      goal: "Hold a D chord, change to it from G and from C, and play G, C and D in the two orders songs use most.",
      why: "D is a small triangle on the top three strings, and it finishes a set. G, C and D belong together, and an enormous number of songs use those three chords and nothing else. D has no finger in common with G or C, so its changes are the first where the whole hand lets go and lands again. The way to learn those is the same every time: aim one finger, and let the others fall around it.",
      howTo: [
        "D: first finger on the G string at fret 2, third finger on the B string at fret 3, second finger on the top string at fret 2. The D string is open. Play only the top four strings: start the strum from the D string.",
        "For every change into D, aim the third finger at the B string, fret 3. The first and second fingers fall into place on either side of it.",
        "Missing the two low strings takes practice. If the pick catches one now and then, keep going: the aim comes with time.",
      ],
      payoff: "G, C and D: three chords that are enough for a great many songs.",
      exercises: [
        {
          id: "d-strings",
          title: "Check every string of D",
          purpose: "D one string at a time: the open D string, then the G, B and top strings, and back.",
          howTo: [
            "Quarter notes, 50 BPM up to a pass at 80.",
            "Pick the D string, then G, B and the top string, and come back: B, G, D, and G once more to finish the bar.",
            "The top string is the one that goes dead: the third finger, on the B string, leans on it. Stand that finger up on its tip.",
          ],
          coach: STRINGS_COACH,
          tab: strings("D"),
          position: 1,
          chordShape: "D",
          harmony: { arpeggio: "D", cover: true },
          rungs: ladder(50, 110, 10),
          passAt: 80,
          ...STRINGS,
          minutes: 4,
        },
        {
          id: "g-d",
          title: "G and D",
          purpose: "G, D, G, D, four downstrokes each, over the band. Every finger moves at each change.",
          howTo: [
            "Quarter notes, 50 BPM up to a pass at 80. Down on every beat.",
            "G is strummed across all six strings and D across four. Shorten the stroke for D so the pick starts at the D string.",
            "Lift all the fingers together, and land the third finger first with the others right behind it. Fingers that arrive slowly, one at a time, make a chord that arrives one string at a time.",
          ],
          coach: BAND_COACH,
          tab: song(FOUR, ["G", "D", "G", "D"]),
          position: 1,
          chords: "G | D | G | D",
          jam: ROCK("G"),
          harmony: { chordTones: true },
          rungs: ladder(50, 110, 10),
          passAt: 80,
          ...STRUM,
          selfCheck: [CHANGE_CHECK],
          minutes: 6,
        },
        {
          id: "g-c-d",
          title: "G, C, D and home",
          purpose: "G, C, D and G again, a bar each, over the band. Leaving home, going further, and coming back: the shape of countless songs.",
          howTo: [
            "Quarter notes, 50 BPM up to a pass at 80. Down on every beat.",
            "G from the low E string, C from the A string, D from the D string: each chord starts one string thinner than the last.",
          ],
          coach: BAND_COACH,
          tab: song(FOUR, ["G", "C", "D", "G"]),
          position: 1,
          chords: "G | C | D | G",
          jam: ROCK("G"),
          harmony: { chordTones: true },
          rungs: ladder(50, 110, 10),
          passAt: 80,
          ...STRUM,
          selfCheck: [CHANGE_CHECK],
          minutes: 6,
        },
        {
          id: "d-c-g",
          title: "D, C, G",
          purpose: "The same three chords walking down: D, C, and two bars of G. A rock progression you will know when you hear it.",
          howTo: [
            "Quarter notes, 50 BPM up to a pass at 80. Down on every beat.",
            "D to C: the first finger moves from the G string to the B string at fret 1, and the other two cross to the D and A strings. C to G is the pair of fingers moving back up.",
          ],
          coach: BAND_COACH,
          tab: song(FOUR, ["D", "C", "G", "G"]),
          position: 1,
          chords: "D | C | G | G",
          jam: ROCK("G"),
          harmony: { chordTones: true },
          rungs: ladder(50, 110, 10),
          passAt: 80,
          ...STRUM,
          selfCheck: [CHANGE_CHECK],
          minutes: 6,
        },
      ],
    },
    {
      id: "down-up",
      title: "Down and up: eighth notes",
      goal: "Strum eighth notes with a downstroke on every beat and an upstroke on every 'and', on one chord and through a change.",
      why: "So far every strum has gone down, and the hand has come back up each time without touching the strings. Let the pick catch the strings on the way up and you have eighth notes: twice as many strums for no extra movement. This swing is the engine of strumming. The hand goes down on every beat and up on every 'and', like a pendulum, and it never stops. Everything after this Step is that swing with some of the strokes left out.",
      howTo: [
        "Count '1 and 2 and 3 and 4 and'. Down on the numbers, up on the 'ands'.",
        "The upstroke is lighter and catches only the thinnest three or four strings. Do not try to reach all six on the way up.",
        "Keep the wrist loose and the swing the same size down and up. Hold the pick just firmly enough that it does not turn.",
      ],
      payoff: "Even eighth-note strumming that keeps going through a chord change.",
      exercises: [
        {
          id: "eighths-em",
          title: "E minor, down and up",
          purpose: "Four bars of eighth notes on E minor: down, up, down, up, with nothing else to think about.",
          howTo: [
            "Straight eighths, 50 BPM up to a pass at 80. Down on each beat, up on each 'and'.",
            "Downstrokes cross all six strings. Upstrokes catch the top three.",
            "Listen for the ups being as evenly spaced as the downs. A late upstroke makes the rhythm limp.",
          ],
          coach: STRUM_COACH,
          tab: song(EIGHTHS, ["Em", "Em", "Em", "Em"]),
          position: 1,
          chordShape: "Em",
          chords: "Em | Em | Em | Em",
          harmony: { chordTones: true },
          rungs: ladder(50, 110, 10),
          passAt: 80,
          ...STRUM,
          minutes: 5,
        },
        {
          id: "down-down-up",
          title: "Down, down-up",
          purpose: "A long strum and two short ones, twice a bar, on E minor and A minor. The first strumming rhythm that is not all one length.",
          howTo: [
            "Quarter notes and eighths, 50 BPM up to a pass at 80. Count '1, 2 and, 3, 4 and': down, down-up, down, down-up.",
            "After the long strum on 1 the hand still comes up on the 'and'. It just misses the strings.",
            "Two bars of E minor, two of A minor.",
          ],
          coach: STRUM_COACH,
          tab: song(DOWN_DOWN_UP, ["Em", "Em", "Am", "Am"]),
          position: 1,
          chords: "Em | Em | Am | Am",
          harmony: { chordTones: true },
          rungs: ladder(50, 110, 10),
          passAt: 80,
          ...STRUM,
          selfCheck: [SWING_CHECK],
          minutes: 5,
        },
        {
          id: "eighths-change",
          title: "Eighths through four chords",
          purpose: "G, E minor, C and D in steady eighth notes over the band. The strumming hand keeps its swing while the other hand changes chord.",
          howTo: [
            "Straight eighths, 50 BPM up to a pass at 75. Down on each beat, up on each 'and'.",
            "The last upstroke of each bar is when the fingers move. It is fine if that stroke sounds thin or catches open strings: keep the hand swinging.",
            "If the changes fall apart, go back a rung. The swing matters more than the tempo.",
          ],
          coach: BAND_COACH,
          tab: song(EIGHTHS, ["G", "Em", "C", "D"]),
          position: 1,
          chords: "G | Em | C | D",
          jam: ROCK("G"),
          harmony: { chordTones: true },
          rungs: ladder(50, 110, 5),
          passAt: 75,
          ...STRUM,
          selfCheck: [CHANGE_CHECK],
          minutes: 6,
        },
      ],
    },
    {
      id: "patterns",
      title: "Leave strokes out: strumming patterns",
      goal: "Play the pattern down, down-up, up-down-up on one chord and through four, and make a pattern of your own.",
      why: "A strumming pattern is not a new movement. It is the down-up swing with some strokes missing: the hand still goes down and up, and on the missing ones the pick passes the strings without touching them. That is why good strummers never look as if they are counting. The hand counts for them. The pattern in this Step is one of the most used there is, and once you have it, any other pattern is a matter of choosing different strokes to leave out.",
      howTo: [
        "The pattern: down on 1, down on 2, up on the 'and' of 2, up on the 'and' of 3, down on 4, up on the 'and' of 4. Say 'down, down-up, up-down-up'.",
        "On beat 3 the hand goes down as always. It misses the strings.",
        "The app hears only the strokes that sound, and times them. It cannot see your hand, so keeping the swing going is yours to check.",
      ],
      payoff: "The strumming pattern of a thousand songs, and the idea behind every other one.",
      difficultyException:
        "Fewer strums in a bar than the steady eighths of the Step before, and a self-checked Exercise at the end, so the strum rate falls. The demand is keeping the swing through a silent downstroke, which the metric does not count.",
      exercises: [
        {
          id: "pattern-em",
          title: "The pattern on one chord",
          purpose: "Down, down-up, up-down-up on E minor, four bars. Six strums in a bar of eight strokes: the 'and' of 1 and beat 3 are the ones that miss.",
          howTo: [
            "Quarter notes and eighths, 50 BPM up to a pass at 80. Count '1, 2 and, (3) and, 4 and'.",
            "Say the strokes out loud as you play: 'down, down-up, up-down-up'.",
            "Start slower than you think you need to. The silent downstroke on 3 is what goes wrong.",
          ],
          coach: STRUM_COACH,
          tab: song(PATTERN, ["Em", "Em", "Em", "Em"]),
          position: 1,
          chordShape: "Em",
          chords: "Em | Em | Em | Em",
          harmony: { chordTones: true },
          rungs: ladder(50, 110, 10),
          passAt: 80,
          ...STRUM,
          selfCheck: [SWING_CHECK],
          minutes: 6,
        },
        {
          id: "pattern-g-em",
          title: "The pattern on G and E minor",
          purpose: "The same pattern with one easy change: two bars of G, two of E minor.",
          howTo: [
            "Quarter notes and eighths, 50 BPM up to a pass at 80. Down, down-up, up-down-up in every bar.",
            "The second finger stays on the A string through the change, as before.",
          ],
          coach: STRUM_COACH,
          tab: song(PATTERN, ["G", "G", "Em", "Em"]),
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
          id: "pattern-song",
          title: "The pattern through G, D, E minor, C",
          purpose: "Four chords, one bar each, with the pattern, over the band. This progression with this strum is a very large number of songs.",
          howTo: [
            "Quarter notes and eighths, 50 BPM up to a pass at 75. Down, down-up, up-down-up in every bar.",
            "Let go of the chord as you play the last upstroke of the bar, so the fingers travel during it and land on beat 1.",
            "G is strummed from the low E string, D from the D string, E minor from the low E string, C from the A string.",
          ],
          coach: BAND_COACH,
          tab: song(PATTERN, ["G", "D", "Em", "C"]),
          position: 1,
          chords: "G | D | Em | C",
          jam: ROCK("G"),
          harmony: { chordTones: true },
          rungs: ladder(50, 110, 5),
          passAt: 75,
          ...STRUM,
          selfCheck: [SWING_CHECK, CHANGE_CHECK],
          minutes: 7,
        },
        {
          id: "your-pattern",
          title: "Your turn: a pattern of your own",
          purpose: "G, D, E minor and C with a pattern you make by leaving out different strokes of the down-up swing.",
          howTo: [
            "Straight eighths as the swing, any strokes left out, 50 to 80 BPM, four bars that loop.",
            "Keep the downstroke on beat 1. Try leaving out the down on 2, or both strokes of beat 4. Use the same pattern in every bar. The written line is the pattern you know.",
            NOT_CHECKED_YET,
          ],
          coach: "Not checked yet. Record it and listen for whether every bar has the same shape.",
          tab: song(PATTERN, ["G", "D", "Em", "C"]),
          position: 1,
          chords: "G | D | Em | C",
          jam: ROCK("G"),
          rungs: ladder(50, 80, 10),
          ...YOUR_TURN,
          selfCheck: [SWING_CHECK, "Could you say your pattern out loud in downs and ups?"],
          minutes: 4,
        },
      ],
    },
    STRUMS_BETWEEN_BEATS,
    // ----------------------------------------------------------------- Advanced
    {
      id: "a-and-e",
      title: "A and E, and a second set of three chords",
      goal: "Hold A and E, change between A and D with a finger that slides, and play an eight-bar form with A, D and E.",
      why: "A, D and E belong together the way G, C and D do: three chords a great many songs are made of, and the usual chords of a blues. You have D. E is E minor with one finger added, so it costs almost nothing. A is three fingers in a row on one fret, which is easy to find and tight to fit. With these you have seven chords and two full sets of three.",
      howTo: [
        "A: first, second and third fingers in a row at fret 2, on the D, G and B strings. Play from the open A string. The open top string has to ring, so keep the third finger standing up.",
        "E: E minor with the first finger added on the G string at fret 1. All six strings.",
        "A to D: the third finger stays on the B string and slides up one fret, from 2 to 3. The first finger moves to the G string and the second to the top string, both at fret 2.",
        "A to E: all three fingers move. Aim the first finger at the G string, fret 1, and put the second and third on the A and D strings at fret 2.",
        "D to E: the first finger stays on the G string and slides back one fret, from 2 to 1. The other two fingers go to the A and D strings.",
      ],
      payoff: "Seven chords, and two sets of three that each carry a great many songs.",
      exercises: [
        {
          id: "a-strings",
          title: "Check every string of A",
          purpose: "A one string at a time, from the open A string to the top string and back, with three fingers side by side at fret 2.",
          howTo: [
            "Quarter notes, 55 BPM up to a pass at 90.",
            "Pick the A string, then D, G, B and the top string, and come back: B, G, D.",
            "Three fingers share one fret, so they cannot all sit right behind it. Push the third finger closest and let the first sit a little back.",
          ],
          coach: STRINGS_COACH,
          tab: strings("A"),
          position: 1,
          chordShape: "A",
          harmony: { arpeggio: "A", cover: true },
          rungs: ladder(50, 120, 10),
          passAt: 90,
          ...STRINGS,
          minutes: 4,
        },
        {
          id: "em-to-e",
          title: "E minor becomes E",
          purpose: "E minor, E, E minor, E, four downstrokes each. One finger goes down and comes up, and the chord changes from dark to bright.",
          howTo: [
            "Quarter notes, 55 BPM up to a pass at 90. Down on every beat.",
            "Hold E minor with the second and third fingers. For E, put the first finger on the G string at fret 1 and leave the other two where they are.",
          ],
          coach: STRUM_COACH,
          tab: song(FOUR, ["Em", "E", "Em", "E"]),
          position: 1,
          chords: "Em | E | Em | E",
          harmony: { chordTones: true },
          rungs: ladder(50, 120, 10),
          passAt: 90,
          ...STRUM,
          minutes: 5,
        },
        {
          id: "a-d",
          title: "A and D",
          purpose: "A, D, A, D with the long strum and two short ones, over the band. The third finger slides along the B string and leads the change.",
          howTo: [
            "Quarter notes and eighths, 50 BPM up to a pass at 85. Down, down-up, down, down-up.",
            "Keep the third finger touching the B string as it slides between fret 2 and fret 3. The other two fingers follow it.",
            "A is strummed from the A string, D from the D string.",
          ],
          coach: BAND_COACH,
          tab: song(DOWN_DOWN_UP, ["A", "D", "A", "D"]),
          position: 1,
          chords: "A | D | A | D",
          jam: ROCK("A"),
          harmony: { chordTones: true },
          rungs: ladder(50, 120, 10),
          passAt: 85,
          ...STRUM,
          selfCheck: [CHANGE_CHECK],
          minutes: 6,
        },
        {
          id: "a-d-e",
          title: "A, D and E: eight bars",
          purpose: "An eight-bar form over the band: two bars of A, two of D, one of E, one of D, and two of A. Down, down-up, down, down-up throughout.",
          howTo: [
            "Quarter notes and eighths, 50 BPM up to a pass at 85.",
            "Follow the form, the order of the chords: A, A, D, D, E, D, A, A. Count the bars.",
            "D to E and E to D are the long changes. The first finger leads them, sliding along the G string: fret 1 for E, fret 2 for D.",
          ],
          coach: "Eight bars with the band. Each strum is timed and counted.",
          tab: song(DOWN_DOWN_UP, ["A", "A", "D", "D", "E", "D", "A", "A"]),
          position: 1,
          chords: "A | A | D | D | E | D | A | A",
          jam: ROCK("A"),
          harmony: { chordTones: true },
          rungs: ladder(50, 110, 5),
          passAt: 85,
          ...STRUM_LONG,
          selfCheck: [CHANGE_CHECK],
          minutes: 7,
        },
      ],
    },
    SEVENTHS_BLUES,
    {
      id: "small-f",
      title: "D minor, and the way to F",
      goal: "Hold D minor, F major seven and the small F, change between A minor and D minor, and play A minor, F, C, G with the shorter pattern.",
      why: "F is where many beginners stop, because it is the first chord in which one finger holds two strings. Take it in three steps instead. D minor first, which is D with one note changed. Then F major seven, a soft and easy chord that is one move from C. Then lay the first finger flat across the top two strings and F major seven becomes F. This is the small F, on four strings. The full barre chord across six strings can wait: the small one is enough for the songs in this Path and for most others.",
      howTo: [
        "D minor: first finger on the top string at fret 1, second finger on the G string at fret 2, third finger on the B string at fret 3. The D string is open. Top four strings only.",
        "F major seven: third finger on the D string at fret 3, second finger on the G string at fret 2, first finger on the B string at fret 1, top string open. From C, the second and third fingers move one string toward the floor and the first finger stays.",
        "The small F: the same, with the first finger laid flat so that it holds both the B string and the top string at fret 1. Roll it slightly onto its bony edge, and bring the elbow in toward your side.",
        "Play both F chords from the D string. The two low strings stay quiet.",
      ],
      payoff: "Thirteen chords, the F that stops most beginners, and one of the great four-chord progressions.",
      difficultyException:
        "The last Exercise uses the shorter pattern, five strums a bar with a quarter note on beat 4, so that the fingers have a whole beat to reach F. The strum rate is lower on purpose. The demand is the small F, one finger holding two strings, and the changes into and out of it, which the metric does not count.",
      exercises: [
        {
          id: "dm-strings",
          title: "Check every string of D minor",
          purpose: "D minor one string at a time: the open D string, then the G, B and top strings, and back.",
          howTo: [
            "Quarter notes, 55 BPM up to a pass at 90.",
            "Pick the D string, then G, B and the top string, and come back: B, G, D, and G once more to finish the bar.",
            "Compare it with D: only the top string has changed, from fret 2 to fret 1, and the fingers have changed round to reach it.",
          ],
          coach: STRINGS_COACH,
          tab: strings("Dm"),
          position: 1,
          chordShape: "Dm",
          harmony: { arpeggio: "Dm", cover: true },
          rungs: ladder(50, 120, 10),
          passAt: 90,
          ...STRINGS,
          minutes: 4,
        },
        {
          id: "am-dm",
          title: "A minor and D minor",
          purpose: "A minor, D minor, A minor, D minor, four downstrokes each, over the band. All three fingers move one string thinner, and the third finger goes up a fret as well.",
          howTo: [
            "Quarter notes, 55 BPM up to a pass at 90. Down on every beat.",
            "A minor is strummed from the A string, D minor from the D string.",
            "From A minor to D minor: the first finger moves from the B string to the top string at fret 1, the second from the D string to the G string at fret 2, and the third from the G string at fret 2 to the B string at fret 3.",
          ],
          coach: BAND_COACH,
          tab: song(FOUR, ["Am", "Dm", "Am", "Dm"]),
          position: 1,
          chords: "Am | Dm | Am | Dm",
          jam: ROCK("A minor"),
          harmony: { chordTones: true },
          rungs: ladder(50, 120, 10),
          passAt: 90,
          ...STRUM,
          selfCheck: [CHANGE_CHECK],
          minutes: 5,
        },
        {
          id: "c-fmaj7",
          title: "C and F major seven",
          purpose: "C, F major seven, C, F major seven, four downstrokes each, over the band. The first finger never moves, and the other two cross one string as a pair.",
          howTo: [
            "Quarter notes, 55 BPM up to a pass at 90. Down on every beat.",
            "C is strummed from the A string, F major seven from the D string.",
            "Keep the first finger pressed on the B string at fret 1 the whole way through.",
          ],
          coach: BAND_COACH,
          tab: song(FOUR, ["C", "Fmaj7", "C", "Fmaj7"]),
          position: 1,
          chords: "C | Fmaj7 | C | Fmaj7",
          jam: ROCK("C"),
          harmony: { chordTones: true },
          rungs: ladder(50, 120, 10),
          passAt: 90,
          ...STRUM,
          selfCheck: [CHANGE_CHECK],
          minutes: 5,
        },
        {
          id: "f-strings",
          title: "The small F, one string at a time",
          purpose: "F on four strings, picked singly, so the app and you can hear whether the first finger is holding both of its strings.",
          howTo: [
            "Quarter notes, 55 BPM up to a pass at 90.",
            "Pick the D string at fret 3, the G string at fret 2, the B string at fret 1 and the top string at fret 1, and come back: B, G, D, G.",
            "The top string is the test. If it is dead, flatten the first finger a little more or move it closer to the fret. Do not squeeze harder.",
          ],
          coach: STRINGS_COACH,
          tab: strings("F"),
          position: 1,
          chordShape: "F",
          harmony: { arpeggio: "F", cover: true },
          rungs: ladder(50, 120, 10),
          passAt: 90,
          ...STRINGS,
          minutes: 5,
        },
        {
          id: "am-f-c-g",
          title: "A minor, F, C, G",
          purpose: "Four chords, one bar each, with the shorter pattern, over the band: one of the most-used progressions there is, and the reason to learn F.",
          howTo: [
            "Quarter notes and eighths, 50 BPM up to a pass at 80. Down, down-up, up, down in every bar: the shorter pattern, so beat 4 is a long downstroke and the fingers have that whole beat to change.",
            "A minor to F: the first finger stays on the B string and lies flat, and the second and third fingers swap strings, with the third going up to fret 3. F to C: the first finger stands up again and the other two move one string thicker.",
            "If F will not ring yet, play F major seven in its place, with the top string open. Come back to the small F later.",
          ],
          coach: BAND_COACH,
          tab: song(SHORT_PATTERN, ["Am", "F", "C", "G"]),
          position: 1,
          chords: "Am | F | C | G",
          jam: ROCK("A minor"),
          harmony: { chordTones: true },
          rungs: ladder(50, 110, 5),
          passAt: 80,
          ...STRUM,
          selfCheck: [SWING_CHECK, CHANGE_CHECK],
          minutes: 7,
        },
      ],
    },
    {
      id: "light-and-shade",
      title: "Accents, stops and bass notes",
      goal: "Strum with beats 2 and 4 louder, stop the strings for a beat in the middle of a bar, and play a bass note followed by a strum.",
      why: "Strumming every stroke at one volume is how a beginner sounds. Three small things change that. An accent: land a little harder on beats 2 and 4, where a drummer hits the snare, and the part starts to move. A stop: silence the strings for a beat, and the next strum sounds stronger for it. A bass note: pick the lowest string of the chord alone and answer it with a strum, and one guitar sounds like two instruments. None of these is a new movement. They are choices about how hard, how long and how many strings.",
      howTo: [
        "An accent is a bigger, faster stroke across all the strings. The strokes around it are smaller and lighter, so the difference can be heard.",
        "To stop the strings, lay the side of the strumming hand across all of them, on the beat. The fretting fingers can ease their pressure at the same moment without leaving the strings.",
        "For a bass note, pick only the lowest string of the chord: the low E string for G and E minor, the A string for C and A minor, the D string for D and F. In these chords that lowest note is the root. The root is the note a chord is named after.",
      ],
      payoff: "Strumming that has loud and soft, sound and silence, low and high.",
      exercises: [
        {
          id: "accents",
          title: "Louder on two and four",
          purpose: "Steady eighths on G and E minor with the downstrokes on beats 2 and 4 accented. The other six strokes in the bar stay light.",
          howTo: [
            "Straight eighths, 50 BPM up to a pass at 85. Count '1 and TWO and 3 and FOUR and'.",
            "Two bars of G, two of E minor.",
            "Make the light strokes lighter before you make the loud ones louder.",
          ],
          coach: "Timed and counted, and the accents are read roughly: louder than the strokes beside them or not.",
          tab: song(ACCENTS, ["G", "G", "Em", "Em"]),
          position: 1,
          chords: "G | G | Em | Em",
          harmony: { chordTones: true },
          rungs: ladder(50, 110, 5),
          passAt: 85,
          pick: "free",
          grade: "accents",
          pass: [even(0.75), heard(0.85), extras(6), { metric: "accentPlacement", min: 0.6, overBars: 4 }],
          minutes: 6,
        },
        {
          id: "stop",
          title: "A beat of silence",
          purpose: "Down, down-up, a beat of silence, down-up, through G, C, D and G over the band. The stop is on beat 3 of every bar.",
          howTo: [
            "Quarter notes and eighths with a quarter rest, 50 BPM up to a pass at 85. Count '1, 2 and, (3), 4 and'.",
            "On beat 3 the side of the strumming hand lands on the strings and stops them. Lift it again for the downstroke on 4.",
            "A stop that still hums is a hand that landed too lightly, or missed a string. Lay the whole side of the hand across all six.",
          ],
          coach: BAND_COACH,
          tab: song(STOP, ["G", "C", "D", "G"]),
          position: 1,
          chords: "G | C | D | G",
          jam: ROCK("G"),
          harmony: { chordTones: true },
          rungs: ladder(50, 110, 5),
          passAt: 85,
          ...STRUM,
          selfCheck: ["On beat 3, was the guitar silent, with no string left ringing?"],
          minutes: 6,
        },
        {
          id: "bass-strum",
          title: "Bass note, then strum",
          purpose: "On beats 1 and 3 the lowest string of the chord alone, and on beats 2 and 4 a light strum of the top three strings, through A minor, F, C and G.",
          howTo: [
            "Quarter notes, 55 BPM up to a pass at 90. Bass, strum, bass, strum.",
            "The bass notes: the open A string for A minor, D string fret 3 for F, A string fret 3 for C, low E string fret 3 for G. The strum is a short downstroke on the G, B and top strings.",
            "Hold the whole chord down throughout, even though you play only part of it at a time.",
          ],
          coach: "Band on. Each bass note and each strum is timed and counted.",
          tab: song(bassStrum, ["Am", "F", "C", "G"]),
          position: 1,
          chords: "Am | F | C | G",
          jam: ROCK("A minor"),
          harmony: { chordTones: true },
          rungs: ladder(50, 120, 10),
          passAt: 90,
          ...STRUM,
          minutes: 6,
        },
      ],
    },
    SIXTEENTH_STRUMS,
    {
      id: "a-whole-song",
      title: "A whole song",
      goal: "Play a sixteen-bar song in G with one strum for the verse and another for the chorus, and then play along with a song you know.",
      why: "A song is sections, and a rhythm guitarist's job is to make the sections feel different. Here the verse is G, E minor, C and D, twice, with the gentler strum: down, down-up, down, down-up. The chorus starts on C and uses the full pattern, so it lifts. There is nothing in it you have not played. What is new is sixteen bars in a row, a change of strum in the middle, and knowing where you are without looking at the page.",
      howTo: [
        "Verse, bars 1 to 8: G, E minor, C, D, twice. Down, down-up, down, down-up.",
        "Chorus, bars 9 to 16: C, G, D, E minor, then C, G and two bars of D. Down, down-up, up-down-up.",
        "The two bars of D at the end lead back to the G that starts the verse again.",
      ],
      difficultyException:
        "Eighth-note strums after a Step of sixteenths, so the strum rate falls. The demand is sixteen bars in a row with a change of strum in the middle, which the metric does not count.",
      payoff: "A whole song, start to finish, in time with a band. From here, Rhythm Foundations trains your sense of time on single notes with a click, and Triads explains what your chords are made of.",
      exercises: [
        {
          id: "verse",
          title: "The verse",
          purpose: "G, E minor, C, D, twice, with the long strum and two short ones. Eight bars over the band.",
          howTo: [
            "Quarter notes and eighths, 50 BPM up to a pass at 85. Down, down-up, down, down-up in every bar.",
            "G to E minor keeps the second finger down. E minor to C, C to D and D back to G are whole-hand changes: let go as you play the last upstroke, and land on beat 1.",
          ],
          coach: "Eight bars with the band. Each strum is timed and counted.",
          tab: VERSE_TAB,
          position: 1,
          chords: VERSE_CHART,
          jam: ROCK("G"),
          harmony: { chordTones: true },
          rungs: ladder(50, 110, 5),
          passAt: 85,
          ...STRUM_LONG,
          selfCheck: [CHANGE_CHECK],
          minutes: 7,
        },
        {
          id: "chorus",
          title: "The chorus",
          purpose: "C, G, D, E minor, then C, G and two bars of D, with the full pattern. Eight bars over the band.",
          howTo: [
            "Quarter notes and eighths, 50 BPM up to a pass at 85. Down, down-up, up-down-up in every bar.",
            "The chorus starts on C, not on G. Have the C shape ready before bar 1.",
            "In the last two bars the chord stays on D. Keep the pattern going and count them both.",
          ],
          coach: "Eight bars with the band. Each strum is timed and counted.",
          tab: CHORUS_TAB,
          position: 1,
          chords: CHORUS_CHART,
          jam: ROCK("G"),
          harmony: { chordTones: true },
          rungs: ladder(50, 110, 5),
          passAt: 85,
          ...STRUM_LONG,
          selfCheck: [SWING_CHECK, CHANGE_CHECK],
          minutes: 7,
        },
        {
          id: "the-song",
          title: "Verse and chorus",
          purpose: "All sixteen bars over the band: the verse with its gentler strum, then the chorus with the full pattern.",
          howTo: [
            "Quarter notes and eighths, 50 BPM up to a pass at 80.",
            "Bars 1 to 8: G, E minor, C, D, twice, down, down-up, down, down-up. Bars 9 to 16: C, G, D, E minor, C, G, D, D, down, down-up, up-down-up.",
            "The change of strum at bar 9 is the moment to think about. Say 'chorus' to yourself in bar 8.",
            "When the sixteen bars are steady, play the chorus with beats 2 and 4 a little louder, as you did in the Step Accents, stops and bass notes. Keep the verse light so the chorus has somewhere to go.",
          ],
          coach: "Sixteen bars with the band. Each strum is timed and counted.",
          tab: `${VERSE_TAB} | ${CHORUS_TAB}`,
          position: 1,
          chords: `${VERSE_CHART} | ${CHORUS_CHART}`,
          jam: ROCK("G"),
          harmony: { chordTones: true },
          rungs: ladder(50, 100, 5),
          passAt: 80,
          ...STRUM_LONG,
          selfCheck: [SWING_CHECK, CHANGE_CHECK],
          minutes: 8,
        },
        {
          id: "your-song",
          title: "Your turn: a song you know",
          purpose: "Find the chords of a song you like that uses chords from this Path, and strum along with it or sing over it. The written line is the song from this Step, as a stand-in.",
          howTo: [
            "Straight time, any pattern you like, 55 to 80 BPM for the written song, or the tempo of the song you choose.",
            "Start with four downstrokes a bar. When the changes are on time, try the pattern. If a chord in your song is not one of your thirteen, look for an easier version of the song that uses G, C and D, or A, D and E.",
            NOT_CHECKED_YET,
          ],
          coach: "Not checked yet. Play it for someone, or record it and listen to the whole thing.",
          tab: `${VERSE_TAB} | ${CHORUS_TAB}`,
          position: 1,
          chords: `${VERSE_CHART} | ${CHORUS_CHART}`,
          jam: ROCK("G"),
          rungs: ladder(55, 80, 5),
          ...YOUR_TURN,
          selfCheck: [
            "Did you get from the start of the song to the end without stopping?",
            "Did the strumming hand keep going through every chord change?",
          ],
          minutes: 6,
        },
      ],
    },
  ],
  levels: [
    {
      id: "beginner",
      title: "Beginner: three chords and a steady hand",
      summary: "E minor, A minor and C, each checked one string at a time, the changes between them with time to move, four even downstrokes to the bar, and a first eight-bar tune.",
      startHereIf: [
        "You have never played a chord, or you know 1 or 2 and they buzz.",
        "You can hold a pick and make one fretted note ring.",
        "You have never played along with a steady beat.",
      ],
      steps: ["e-minor", "a-minor", "c-major"],
      warmups: [
        {
          id: "string-walk",
          title: "A walk up one string",
          purpose: "Eight notes along one string, from the open string up to fret 12 and back, with one finger: the minor scale that starts on that string. It wakes up the fingertip and shows how much pressure a note needs. A different string each time.",
          howTo: ["Quarter notes, well under your clean tempo. First finger only: open, then frets 2, 3, 5, 7, 8, 10 and 12, fret 12 again, and back down to fret 2. Press just behind each fret, and only as hard as the note needs."],
          coach: "This is a warm-up. It tells you how it went, and it decides nothing.",
          pick: "free",
          vary: stringWalk(MINOR_FRETS, "naturalMinor", (at) => `/4 ${at(0)} ${at(1)} ${at(2)} ${at(3)} | ${at(4)} ${at(5)} ${at(6)} ${at(7)} | ${at(7)} ${at(6)} ${at(5)} ${at(4)} | ${at(3)} ${at(2)} /2 ${at(1)}`),
          grade: "warmup",
          warmup: { start: 0.6, top: 0.8, reference: "e-minor.em-strings", fallback: 50 },
          rungs: ladder(40, 90, 10),
          minutes: 3,
        },
      ],
    },
    {
      id: "intermediate",
      title: "Intermediate: five chords and the upstroke",
      summary: "G and D, and with them the three chords behind a thousand songs, eighth-note strumming with a hand that never stops, strumming patterns made by leaving strokes out, and strums placed between the beats: a rest, the off-beat upstroke, and a pattern that leaves room for the change.",
      startHereIf: [
        "You can change between E minor, A minor and C with 4 strums a bar at 70 BPM.",
        "You only strum downward.",
        "You know a few chords, and your strumming stumbles or speeds up at the change.",
      ],
      steps: ["g-major", "d-major", "down-up", "patterns", "strums-between-beats"],
      warmups: [
        {
          id: "major-walk",
          title: "A brighter walk up one string",
          purpose: "Eight notes along one string in eighths, from the open string up to fret 12 and back, with one finger: the major scale that starts on that string. A different string each time.",
          howTo: ["Straight eighths, well under your clean tempo. First finger only: open, then frets 2, 4, 5, 7, 9, 11 and 12, fret 12 again, and back down to fret 2. Let the finger glide along the string between notes without pressing."],
          coach: "This is a warm-up. It tells you how it went, and it decides nothing.",
          pick: "free",
          vary: stringWalk(MAJOR_FRETS, "major", (at) => `/8 ${at(0)} ${at(1)} ${at(2)} ${at(3)} ${at(4)} ${at(5)} ${at(6)} ${at(7)} | ${at(7)} ${at(6)} ${at(5)} ${at(4)} ${at(3)} ${at(2)} /4 ${at(1)}`),
          grade: "warmup",
          warmup: { start: 0.6, top: 0.8, reference: "down-up.eighths-em", fallback: 50 },
          rungs: ladder(40, 90, 10),
          minutes: 3,
        },
      ],
    },
    {
      id: "advanced",
      title: "Advanced: thirteen chords, and a whole song",
      summary: "A, E and D minor, three seventh chords and a twelve-bar blues in A, the small F reached in three steps, accents, stops and bass notes, sixteenth-note strumming, and a sixteen-bar song with a verse and a chorus. After it, Rhythm Foundations trains your sense of time on single notes with a click, and Triads explains what the chords are made of.",
      startHereIf: [
        "You can strum down, down-up, up-down-up through G, D, E minor and C at 75 BPM.",
        "You know 5 or 6 open chords and avoid songs with an F in them.",
        "Your strumming is steady, and every bar sounds the same.",
      ],
      steps: ["a-and-e", "sevenths-blues", "small-f", "light-and-shade", "sixteenth-strums", "a-whole-song"],
      warmups: [
        {
          id: "small-barre",
          title: "One finger, two strings, up the neck",
          purpose: "The first finger laid flat across two neighbouring strings and moved along the neck, both strings picked together: the grip F needs, made stronger a little at a time. A different pair of strings or direction each time.",
          howTo: ["Quarter notes, well under your clean tempo. One flat first finger holds both strings at each fret. Release the pressure as you move and press again when you arrive. Stop if the hand aches: this is strength work, and it builds slowly."],
          coach: "This is a warm-up. It tells you how it went, and it decides nothing.",
          pick: "free",
          vary: {
            values: { stringSet: Object.keys(BARRE_PAIRS), shapeOrder: ["going up", "coming down"] },
            pooled: ["stringSet", "shapeOrder"],
            label: (p) => `${p.stringSet} strings, ${p.shapeOrder}`,
            build: (p) => {
              const { strings: [low, high], frets } = BARRE_PAIRS[p.stringSet];
              const order = p.shapeOrder === "going up" ? [...frets] : [...frets].reverse();
              const at = (i: number) => `${low}:${order[i]}f1+${high}:${order[i]}f1`;
              const tab = `/4 ${at(0)} ${at(1)} ${at(2)} ${at(3)} | ${at(4)} ${at(5)} ${at(4)} ${at(3)} | ${at(2)} ${at(1)} ${at(0)} ${at(1)}`;
              return { tab, position: order[0], shifts: true, harmony: { scale: ["C", "major"] as [string, string] } };
            },
          },
          grade: "warmup",
          warmup: { start: 0.6, top: 0.8, reference: "a-and-e.a-strings", fallback: 50 },
          rungs: ladder(40, 90, 10),
          minutes: 3,
        },
      ],
    },
  ],
});
