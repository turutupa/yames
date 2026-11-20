/**
 * Alternate Picking: consolidation Steps for the Beginner Level (2026-11-19).
 * Drafts, like the Path they belong to.
 *
 * Beginner was three Steps (even eighths, even sixteenths, accents) and then
 * Intermediate crossed strings. These three Steps give a beginner time between
 * those ideas, and add nothing for the hand except what each one names:
 *
 * - `other-strings`, after `even-eighths`: the same eighths on the D, A and B
 *   strings, a tune each, and one line that changes string only at a bar line,
 *   after a note a full beat long;
 * - `mixed-rhythms`, after `even-sixteenths`: an eighth and two sixteenths on
 *   one beat, both ways round, with the hand keeping its sixteenth motion;
 * - `one-string-tunes`, after `accents`: eight-bar tunes in E minor that use
 *   eighths, sixteenths and accents together, one of them over a band.
 *
 * Every id is new, so nobody's progress moves. Every line is original.
 *
 * The second and third Steps are `pick: "free"`: a long note followed by two
 * short ones is down, down-up, which an alternating plan refuses to print
 * (`pick.alternate`), as in Metal Rhythm's gallops. The strokes are taught in
 * words, by the one rule the Path already has (down on the beat and the "and",
 * up on the "e" and the "a"), and nothing promises they are checked.
 */
import type { StepSpec } from "../spec";
import { ladder, repeat } from "../templates";

/** An eighth and two sixteenths on one beat, all one note. */
const longShortShort = (note: string) => `/8 ${note} /16 ${note} ${note}`;
/** Two sixteenths and an eighth on one beat, all one note. */
const shortShortLong = (note: string) => `/16 ${note} ${note} /8 ${note}`;

/** An accented melody note on the beat, two quiet open Es after it. */
const accentFirst = (note: string) => `/8 ${note}> /16 1:0 1:0`;
/** Two quiet open Es, then the accented melody note on the "and". */
const accentLast = (note: string) => `/16 1:0 1:0 /8 ${note}>`;

const MELODY_BAR = "/8 1:0 /16 1:5 1:7 /8 1:8 /16 1:7 1:5 /16 1:7 1:8 /8 1:7 /8 1:5 1:0";

// Eight bars in E minor on the B string: the open B, E at 5, F# at 7, G at 8.
// Every bar starts on a note of Em | C | G | D | Em | C | D | Em, so the same
// notes go over the band.
const TUNE_OPENING =
  "/8 2:5 /16 2:5 2:7 /8 2:8 /16 2:7 2:5 /8 2:7 2:8 /4 2:5 | /16 2:8 2:7 /8 2:5 /16 2:7 2:5 /8 2:0 /8 2:5 2:7 /4 2:8";
const E_MINOR_TUNE = `${TUNE_OPENING} |
  /8 2:8 /16 2:8 2:7 /8 2:5 /16 2:7 2:8 /8 2:7 2:5 /4 2:8 |
  /16 2:7 2:5 /8 2:7 /16 2:8 2:7 /8 2:5 /8 2:0 2:5 /4 2:7 |
  ${TUNE_OPENING} |
  /8 2:7 /16 2:8 2:7 /8 2:5 /16 2:0 2:5 /8 2:7 2:8 /4 2:7 |
  /16 2:8 2:7 2:5 2:7 /8 2:8 2:7 /2 2:5`;
const E_MINOR_CHART = "Em | C | G | D | Em | C | D | Em";

// The accent tune's melody, on the high E string over its open string.
const [B, C, D] = ["1:7", "1:8", "1:10"];

/** The strokes are taught in words and never graded: said where a coach line leans on them. */
const STROKES_NOT_CHECKED = "Which stroke plays which note cannot be heard, so that rule is yours to keep.";

export const OTHER_STRINGS: StepSpec = {
  id: "other-strings",
  title: "Every string, one at a time",
  goal: "The same even eighths on the D, A and B strings, each with a tune of its own.",
  why: "Each string answers the pick differently. The D and A strings are wound and thicker, so the pick meets more of them; the B string is thin and gives way. All three have a neighbour on each side, so a stroke that swings wide hits the wrong string. The first Step played its tunes on the high E, the G and the low E, and only a finger walk on the A string; these are the strings in between. Finding each one by feel now, at a tempo you already hold, leaves only the pick's move to learn when lines start to cross strings.",
  howTo: [
    "Nothing changes in the strokes: down on the beat, up on the 'and'. Even eighths on one string has the grip and the motion; go back to it if either feels unsure.",
    "Before each Exercise, rest the pick on the string it uses and look away from the picking hand. Let the hand learn where that string is.",
    "On the wound strings let less of the pick's tip go past the string. A deep stroke catches on the winding and comes out late.",
    "Keep the stroke small enough that the strings on either side stay silent.",
  ],
  payoff: "Three short tunes on three different strings, and a line that visits three strings in four bars, all at the tempo of your first eighths.",
  difficultyException:
    "The same rate as the Step before, on purpose, and the tunes end their phrases on long notes. What is new is the string under the pick, which the note-rate metric cannot count.",
  exercises: [
    {
      id: "d-string-tune",
      title: "A tune on the D string",
      purpose: "The D string is wound and sits in the middle of the set, so it feels heavier under the pick and is easy to miss. A slow tune on four notes keeps the fretting hand simple while the pick learns the string.",
      howTo: [
        "Eighth notes on the D string, 60 BPM up to a pass at 100. Down on the beat, up on the 'and'.",
        "The notes are the open D, A at fret 7, B at fret 9 and C at fret 10. First finger on fret 7, third on fret 9, fourth on fret 10, and the hand stays where it is.",
        "Bars 1 and 3 are the same: the open D, then A, B, C, B, A, B, C. Bar 2 answers B, A, B, C and holds B for two beats. Bar 4 answers C, B, A, B and holds A for two beats.",
        "Each long note is a downstroke. Count its two beats, and start the next bar with a downstroke too.",
      ],
      coach: "Even eighths and the written notes are checked after the take. The direction of each stroke is yours to keep: it cannot be heard.",
      tab: `/8 4:0 4:7 4:9 4:10 4:9 4:7 4:9 4:10 | 4:9 4:7 4:9 4:10 /2 4:9 | /8 4:0 4:7 4:9 4:10 4:9 4:7 4:9 4:10 | 4:10 4:9 4:7 4:9 /2 4:7`,
      position: 7,
      harmony: { scale: ["A", "naturalMinor"] },
      rungs: ladder(60, 120, 10),
      passAt: 100,
      grade: "timingNotes",
      minutes: 5,
    },
    {
      id: "a-string-tune",
      title: "A tune on the A string",
      purpose: "The A string is thicker again, and the low E beside it is the string a wide stroke hits. The tune sits on frets 5 to 8 and keeps dropping to the open A, so the pick has to stay on its string while the fretting hand comes and goes.",
      howTo: [
        "Eighth notes on the A string, 60 BPM up to a pass at 100.",
        "The notes are the open A, D at fret 5, E at fret 7 and F at fret 8. First finger on fret 5, third on fret 7, fourth on fret 8.",
        "Bar 1 is the open A, then E, F, E, D, E, F, E. Bar 2 is D, E, D, the open A, and a D held for two beats. Bar 3 is F, E, D, E, F, E, D and the open A. Bar 4 is D, F, E, D and the open A held for two beats.",
        "Rest the side of the picking hand on the bridge, over the low E, so that string stays quiet.",
      ],
      coach: "Even eighths and the written notes are checked after the take. A stroke that lands on the low E can count as an extra note. A low E ringing under the tune is not checked: listen for it.",
      tab: `/8 5:0 5:7 5:8 5:7 5:5 5:7 5:8 5:7 | 5:5 5:7 5:5 5:0 /2 5:5 | /8 5:8 5:7 5:5 5:7 5:8 5:7 5:5 5:0 | 5:5 5:8 5:7 5:5 /2 5:0`,
      position: 5,
      harmony: { scale: ["A", "naturalMinor"] },
      rungs: ladder(60, 120, 10),
      passAt: 100,
      grade: "timingNotes",
      minutes: 5,
    },
    {
      id: "b-string-tune",
      title: "A tune on the B string",
      purpose: "The B string is thin, with a string close on each side of it. This tune goes between the open string and frets 5 to 8, so the pick has to stay on one thin string while the fretting hand comes and goes.",
      howTo: [
        "Eighth notes on the B string, 60 BPM up to a pass at 100.",
        "The notes are the open B, E at fret 5, F at fret 6 and G at fret 8. First finger on fret 5, second on fret 6, fourth on fret 8.",
        "Bar 1 is the open B, then E, F, E, the open B again, then E, G, F. Bar 2 is E, F, G, F and a G held for two beats. Bar 3 walks down in pairs and back up: G, G, F, F, E, E, F, G. Bar 4 is G, F, E, the open B, and an E held for two beats.",
        "Keep the first finger just above fret 5 while the open B sounds, so it lands on time.",
      ],
      coach: "Even eighths and the written notes are checked after the take. The open Bs are where the time tends to move.",
      tab: `/8 2:0 2:5 2:6 2:5 2:0 2:5 2:8 2:6 | 2:5 2:6 2:8 2:6 /2 2:8 | /8 2:8 2:8 2:6 2:6 2:5 2:5 2:6 2:8 | 2:8 2:6 2:5 2:0 /2 2:5`,
      position: 5,
      harmony: { scale: ["A", "naturalMinor"] },
      rungs: ladder(60, 120, 10),
      passAt: 100,
      grade: "timingNotes",
      minutes: 5,
    },
    {
      id: "string-per-bar",
      title: "A new string at each bar line",
      purpose: "One string for a whole bar, then another. Every bar ends on a note a full beat long, and the pick moves to the new string while it rings. This is not string crossing yet: in a crossing the pick changes string between two quick notes, and that is the work of the Intermediate Level.",
      howTo: [
        "Six eighth notes and a quarter note in every bar, 60 BPM up to a pass at 100.",
        "Bar 1 is on the A string: A, B, C, B, A, B, then C for a full beat (frets 0, 2, 3, 2, 0, 2, 3). Bar 2 is the same frets on the D string: D, E, F, E, D, E, F. Bar 3 is on the G string, where the top note is at fret 4: G, A, B, A, G, A, B. Bar 4 goes back to the D string: F, E, D, E, F, D, then E for a full beat (frets 3, 2, 0, 2, 3, 0, 2).",
        "First finger on fret 2, second on fret 3, and the third on fret 4 for the B on the G string. The fretting hand never moves along the neck.",
        "While the quarter note rings, move the pick to the next string and rest it there. The first note of every bar is a downstroke.",
        "As the next bar starts, relax the finger on the long note without leaving the string, so it stops and two strings do not ring together.",
      ],
      coach: "Even time and the written notes are checked after the take. The move between strings has a whole beat: use all of it.",
      tab: `/8 5:0 5:2 5:3 5:2 5:0 5:2 /4 5:3 | /8 4:0 4:2 4:3 4:2 4:0 4:2 /4 4:3 | /8 3:0 3:2 3:4 3:2 3:0 3:2 /4 3:4 | /8 4:3 4:2 4:0 4:2 4:3 4:0 /4 4:2`,
      position: 2,
      harmony: { scale: ["A", "naturalMinor"] },
      rungs: ladder(60, 120, 10),
      passAt: 100,
      grade: "timingNotes",
      minutes: 5,
    },
  ],
};

export const MIXED_RHYTHMS: StepSpec = {
  id: "mixed-rhythms",
  title: "Eighths and sixteenths in one bar",
  goal: "Play a long note and two short ones on one beat, either way round, with the hand moving the same way throughout.",
  why: "Real lines are rarely all one note length. When an eighth and two sixteenths share a beat, the picking hand does not stop for the long note: it keeps its sixteenth motion, and one stroke passes over the string without touching it. Every downstroke stays on a beat or an 'and', where it already was, so the hand itself keeps the time.",
  howTo: [
    "Count '1 e and a' as in Even sixteenths on one string. The hand goes down on 1 and 'and', up on 'e' and 'a', whether or not there is a note there.",
    "A stroke with no note is the same stroke, a little further from the string. Do not stop the hand and start it again.",
    "So every note on a beat or on an 'and' is a downstroke, and every note on an 'e' or an 'a' is an upstroke.",
    "The tab shows no stroke marks in this Step, because some strokes have no note. The rule gives you every one.",
    "To learn a rhythm, lay the fretting hand across the strings so they only click, pick the rhythm alone, then add the notes.",
  ],
  payoff: "A long-short-short rhythm, its mirror image, and a melody that changes note length from beat to beat while the hand keeps doing one thing.",
  difficultyException:
    "Fewer notes to the beat than the Step before, on purpose. The work is the stroke that misses the string, and the note-rate metric counts only notes.",
  exercises: [
    {
      id: "long-short-short",
      title: "Long, short, short",
      purpose: "An eighth and two sixteenths on every beat. The hand makes four strokes a beat, and the second one, an upstroke, misses the string on purpose.",
      howTo: [
        "An eighth then two sixteenths on every beat, on the G string, 50 BPM up to a pass at 80. Count '1, and a, 2, and a'.",
        "The strokes you hear are down, down, up: down on the beat, a silent up, down on the 'and', up on the 'a'.",
        "Bar 1 is A at fret 2 on every beat, with the first finger. Bar 2 changes note on each beat: B at fret 4 with the third finger, A at fret 2, B at fret 4, then the open G.",
      ],
      coach: `Timing is what is checked, and the usual fault is rushing the two short notes. ${STROKES_NOT_CHECKED}`,
      tab: `${repeat(longShortShort("3:2"), 4)} | ${longShortShort("3:4")} ${longShortShort("3:2")} ${longShortShort("3:4")} ${longShortShort("3:0")}`,
      position: 2,
      pick: "free",
      harmony: { scale: ["A", "naturalMinor"] },
      rungs: ladder(50, 100, 5),
      passAt: 80,
      grade: "timing",
      minutes: 5,
    },
    {
      id: "short-short-long",
      title: "Short, short, long",
      purpose: "The mirror image: two sixteenths, then an eighth. Now the stroke that misses is the last upstroke of the beat, just before the next beat's downstroke.",
      howTo: [
        "Two sixteenths then an eighth on every beat, on the G string, 50 BPM up to a pass at 80. Count '1 e and, 2 e and'.",
        "The strokes you hear are down, up, down: down on the beat, up on the 'e', down on the 'and', then a silent up.",
        "Bar 1 is B at fret 4 on every beat, with the third finger. Bar 2 changes note on each beat: the open G, A at fret 2 with the first finger, B at fret 4, then A at fret 2.",
      ],
      coach: `Timing is what is checked. The eighth at the end of each beat is the one to wait for: the next beat tends to arrive early. ${STROKES_NOT_CHECKED}`,
      tab: `${repeat(shortShortLong("3:4"), 4)} | ${shortShortLong("3:0")} ${shortShortLong("3:2")} ${shortShortLong("3:4")} ${shortShortLong("3:2")}`,
      position: 2,
      pick: "free",
      harmony: { scale: ["A", "naturalMinor"] },
      rungs: ladder(50, 100, 5),
      passAt: 80,
      grade: "timing",
      minutes: 5,
    },
    {
      id: "both-cells",
      title: "Both in one bar",
      purpose: "The two rhythms take turns inside one bar. Where they meet, four sixteenths run together and then two eighths do, so the hand has to hit, miss and hit again without a pause.",
      howTo: [
        "Beats 1 and 3 are an eighth and two sixteenths; beats 2 and 4 are two sixteenths and an eighth. On the G string, 50 BPM up to a pass at 80. Count '1, and a, 2 e and, 3, and a, 4 e and'.",
        "It comes out as four sixteenths in a row, then two eighths in a row. The two eighths are both downstrokes, because the hand passes over the string between them.",
        "Bar 1 is B at fret 4 throughout, with the third finger. Bar 2 changes note on each beat: A at fret 2 with the first finger, B at fret 4, A at fret 2, then the open G.",
      ],
      coach: "Timing is what is checked. If the two eighths come out down, up, the hand has stopped its sixteenth motion: go down a rung and count out loud.",
      tab: `${repeat(`${longShortShort("3:4")} ${shortShortLong("3:4")}`, 2)} | ${longShortShort("3:2")} ${shortShortLong("3:4")} ${longShortShort("3:2")} ${shortShortLong("3:0")}`,
      position: 2,
      pick: "free",
      harmony: { scale: ["A", "naturalMinor"] },
      rungs: ladder(50, 100, 5),
      passAt: 80,
      grade: "timing",
      minutes: 5,
    },
    {
      id: "mixed-melody",
      title: "A melody in both rhythms",
      purpose: "A melody on the top string whose note lengths change from beat to beat. The fretting hand now moves inside each rhythm, and the picking hand still does its one thing.",
      howTo: [
        "Eighths and sixteenths, with a quarter note to end bars 2 and 4, on the high E string, 50 BPM up to a pass at 80.",
        "The notes are the open E, A at fret 5, B at fret 7 and C at fret 8, with the first, third and fourth fingers: the frets the open-E tune of the first Step starts on.",
        "Bars 1 and 3 are the same. Long, short, short twice: E, A, B, then C, B, A. Short, short, long: B, C, B. Then two eighths, A and the open E.",
        "Bar 2 is long, short, short twice (C, B, A, then B, A, B), short, short, long (C, B, A) and B for a full beat. Bar 4 is long, short, short (C, B, A), short, short, long (B, C, B), two eighths (A, B) and A for a full beat.",
        "Every note on a beat or an 'and' is a downstroke, the two eighths in a row included.",
      ],
      coach: "Right notes and time after the take. Stroke direction is not checked: keep the hand swinging in sixteenths and the strokes fall where they should.",
      tab: `${MELODY_BAR} | /8 1:8 /16 1:7 1:5 /8 1:7 /16 1:5 1:7 /16 1:8 1:7 /8 1:5 /4 1:7 | ${MELODY_BAR} | /8 1:8 /16 1:7 1:5 /16 1:7 1:8 /8 1:7 /8 1:5 1:7 /4 1:5`,
      position: 5,
      pick: "free",
      harmony: { scale: ["A", "naturalMinor"] },
      rungs: ladder(50, 100, 5),
      passAt: 80,
      grade: "timingNotes",
      minutes: 6,
    },
  ],
};

export const ONE_STRING_TUNES: StepSpec = {
  id: "one-string-tunes",
  title: "Tunes on one string",
  goal: "Play two eight-bar tunes in E minor, one in eighths and sixteenths and one with accents, and play the first with a band.",
  why: "Until now each idea had Exercises to itself: even eighths, even sixteenths, the two in one bar, accents. Music uses them together and goes on for longer than four bars. Eight bars on one string is long enough to lose your place in and short enough to hold in your head, and it is the last thing to settle before the pick has to change strings.",
  howTo: [
    "The tunes are in E minor. On the B string they use the open string and frets 5, 7 and 8; on the high E string, the open string and frets 7, 8 and 10.",
    "The hand keeps the sixteenth motion of Eighths and sixteenths in one bar all the way through: every note on a beat or an 'and' is a downstroke. No strokes are printed here either.",
    "Learn a tune two bars at a time before you play all eight. If you lose your place, come in again at the next bar line.",
    "For the Exercise with a band, use headphones or plug the guitar straight in for a graded take: the band reaching a microphone is something the app has not been tested against.",
  ],
  payoff: "Two tunes you can play from start to finish, one of them with a band behind you.",
  difficultyException:
    "The tunes mix long and short notes, so they have fewer notes a second than the Step before. What is new is eight bars in a row and three ideas held together, which the note-rate metric cannot count.",
  exercises: [
    {
      id: "e-minor-tune",
      title: "Eight bars in E minor",
      purpose: "Eight bars in E minor on the B string, with every rhythm of the last Steps in it. It is long enough that you have to know where you are, and that is the new thing.",
      howTo: [
        "Eighths and sixteenths with a long note to end each bar, on the B string, 50 BPM up to a pass at 80.",
        "The notes are the open B, E at fret 5, F# at fret 7 and G at fret 8. First finger on fret 5, third on fret 7, fourth on fret 8, and the hand stays there. The new note is F#: fret 7 with the third finger, where A tune on the B string had F at fret 6 with the second.",
        "Bars 1, 3, 5 and 7 share one rhythm: long, short, short twice, two eighths, then a note for a full beat. Bars 2, 4 and 6 turn the first two beats round: short, short, long twice, two eighths, a full beat.",
        "Bars 5 and 6 repeat bars 1 and 2. Bar 8 is the ending: four sixteenths, G, F#, E, F#, then two eighths, G and F#, and E for two beats.",
        "The bars start on E, G, G, F#, then E, G, F#, G. The open B comes once in each of bars 2, 4, 6 and 7.",
        "Every note on a beat or an 'and' is a downstroke.",
      ],
      coach: "Right notes and time after the take, over all eight bars. If one bar keeps slipping, practise that bar alone at a slower rung and come back.",
      tab: E_MINOR_TUNE,
      position: 5,
      pick: "free",
      harmony: { scale: ["E", "naturalMinor"] },
      rungs: ladder(50, 100, 5),
      passAt: 80,
      grade: "timingNotes",
      minutes: 6,
    },
    {
      id: "accent-tune",
      title: "Accents on the beat, then on the 'and'",
      purpose: "One melody, played twice. The first time each melody note is on the beat, long and accented. The second time it is the long note at the end of the beat, so the accent lands on the 'and'. Between the melody notes the open E stays quiet.",
      howTo: [
        "Eighths and sixteenths with accents, on the high E string, 50 BPM up to a pass at 75.",
        "The melody is on frets 7, 8 and 10: B, C and D, with the first, second and fourth fingers. Every other note is the open E.",
        "Bars 1 to 4: an accented melody note, then two quiet open Es, on every beat. The melody is B, D, C, B, then D, C, B, C, then D, B, C, D, then C, D and a B held for two beats.",
        "Bars 5 to 8: the same melody with each beat turned round: two quiet open Es, then the accented note on the 'and'. The last B falls on beat 3 of bar 8 and is held for two beats.",
        "Every accent is a downstroke. Play the open Es lightly: the contrast is what makes the accent, as in Accents where you want them.",
      ],
      coach: "Timing, and whether the accented notes were louder than the rest, after the take. The accent check is rough: louder or not louder is all it can tell. The notes themselves are not checked here.",
      tab: `${accentFirst(B)} ${accentFirst(D)} ${accentFirst(C)} ${accentFirst(B)} |
        ${accentFirst(D)} ${accentFirst(C)} ${accentFirst(B)} ${accentFirst(C)} |
        ${accentFirst(D)} ${accentFirst(B)} ${accentFirst(C)} ${accentFirst(D)} |
        ${accentFirst(C)} ${accentFirst(D)} /2 ${B}> |
        ${accentLast(B)} ${accentLast(D)} ${accentLast(C)} ${accentLast(B)} |
        ${accentLast(D)} ${accentLast(C)} ${accentLast(B)} ${accentLast(C)} |
        ${accentLast(D)} ${accentLast(B)} ${accentLast(C)} ${accentLast(D)} |
        ${accentLast(C)} ${accentLast(D)} /2 ${B}>`,
      position: 7,
      pick: "free",
      harmony: { scale: ["E", "naturalMinor"] },
      rungs: ladder(50, 95, 5),
      passAt: 75,
      grade: "accents",
      minutes: 6,
    },
    {
      id: "tune-with-band",
      title: "Eight bars in E minor, with a band",
      purpose: "Eight bars in E minor again, note for note, with drums and bass under it. You know the notes, so the band is the only new thing: there is more to listen to than a click, and the tune has to keep its place inside it.",
      howTo: [
        "The eight bars of Eight bars in E minor, unchanged: eighths and sixteenths on the B string, 50 BPM up to a pass at 80.",
        "The bass follows one chord a bar: E minor, C, G, D, then E minor, C, D and E minor. The first note and the long last note of every bar are notes of that bar's chord, so each bar should sound like arriving and staying.",
        "Listen to the snare drum, not to your own fingers. If you get lost, wait for the next bar line and come in there.",
        "Use headphones or plug the guitar straight in for a graded take: the band reaching a microphone is something the app has not been tested against.",
      ],
      coach: "Band on. Right notes and time after the take; staying with the band for all eight bars is the whole job.",
      tab: E_MINOR_TUNE,
      position: 5,
      pick: "free",
      chords: E_MINOR_CHART,
      jam: { groove: "rock8", key: "E minor" },
      harmony: { scaleOverChords: ["E", "naturalMinor"] },
      rungs: ladder(50, 100, 5),
      passAt: 80,
      grade: "timingNotes",
      minutes: 6,
    },
  ],
};
