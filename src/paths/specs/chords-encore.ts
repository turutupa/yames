/**
 * Chords in a Key: the Beginner Level takes its time (2026-11-19). Drafts, like
 * the Path they belong to.
 *
 * The Beginner Level is where the idea of the Path is taught (a chord on every
 * scale note, chords have numbers, two, three and six), and it met each idea
 * once, in C. These three Steps stay there a little longer: one, four and five
 * in more orders and on both sets of strings; lines that stop on five against
 * lines that end on one, so that "home" is heard; then the same numbers written
 * out in F, the key one flat away, before keys start changing from day to day.
 * Nothing here is key-moved: every Exercise is its own notes. Every id is new,
 * so nobody's progress moves.
 */
import type { StepSpec } from "../spec";
import { ladder } from "../templates";
import { ROCK, bars, mid, named, toTop, top } from "./triadShapes";

const YOUR_TURN = { grade: "selfChecked", example: true } as const;
const NOT_CHECKED_YET =
  "Your turn, and not checked yet: the app can't judge notes you choose, so you tick it off yourself.";

// The chords of C major around fret 5 on the top three strings, as the Path names them.
const C_LOW = top(5, 5, 3);
const DM_LOW = top(7, 6, 5);
const F_LOW = top(5, 6, 5);
const G_LOW = top(4, 3, 3);
const AM_LOW = top(5, 5, 5);
// One, four and five on the D, G and B strings, as "Chords have numbers" plays them.
const C_MIDDLE = mid(5, 5, 5);
const F_MIDDLE = mid(7, 5, 6);
const G_MIDDLE = mid(5, 4, 3);
// Four in the key of F: D, F and B flat.
const BB_LOW = top(7, 6, 6);

// --- One, four and five, again ---------------------------------------------------

const HOME_CHART = "C | F | C | G | C | F | G | C";

/** Beginner, after the numbers: the three major chords in more orders, still in C. */
export const ONE_FOUR_FIVE_AGAIN: StepSpec = {
  id: "one-four-five-again",
  title: "One, four and five, again",
  goal: "Play the three major chords of C in two more four-bar orders, keep an eight-bar form whose first half stops on five and whose second half ends on one, and play that form on both sets of strings.",
  why: "One, four and five are three chords, and songs put them in many orders. The eight-bar form you played is one of them. Here are two four-bar orders and one more eight-bar form, all in C, with the shapes you have just used. Staying in one key while the order changes is what turns the numbers from a list into places you know: one is where a line rests, four is a move away from it, and five is the chord that leans back toward one.",
  howTo: [
    "On the top three strings, G string first: C is 5, 5, 3. F is 5, 6, 5. G is 4, 3, 3.",
    "On the D, G and B strings, D string first: C is 5, 5, 5. F is 7, 5, 6. G is 5, 4, 3.",
    "Say the number at each bar line, out loud at first. When the order changes, the numbers are what you follow.",
    "Listen to the last bar of each line. A line that stops on five sounds as if it wants another bar. A line that ends on one sounds finished.",
  ],
  payoff: "One, four and five in C in several orders on the top strings, and an eight-bar form on the middle strings too.",
  exercises: [
    {
      id: "one-four-one-five",
      title: "One, four, one, five",
      purpose: "C, F, C, G on the top three strings, around fret 5. Four comes early and goes straight back to one, and five waits for the last bar.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord.",
        "C is 5, 5, 3. F is 5, 6, 5. C again. G is 4, 3, 3.",
        "From C to G the first finger stays on the top string at fret 3 and lies flat to take the B string too. The second finger takes fret 4 on the G string.",
        "The line stops on five, so it wants to go round again: G in bar 4 leads back to C in bar 1.",
        "Say the numbers: one, four, one, five.",
      ],
      coach: "Band on. Right notes and time after the take.",
      tab: bars(C_LOW, F_LOW, C_LOW, G_LOW),
      position: 3,
      shifts: true,
      chords: "C | F | C | G",
      jam: ROCK("C"),
      harmony: { chordTones: true },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(),
      minutes: 6,
    },
    {
      id: "one-one-four-five",
      title: "One, one, four, five",
      purpose: "Two bars of C, then F, then G. Home lasts two bars and the other chords one bar each, so four and five come one after the other at the end.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 90. Top three strings, around fret 5.",
        "C is 5, 5, 3, for two bars. F is 5, 6, 5. G is 4, 3, 3.",
        "Count the two bars of C: the change to F comes at bar 3, not at bar 2.",
      ],
      coach: "Band on. Right notes and time after the take.",
      tab: bars(C_LOW, C_LOW, F_LOW, G_LOW),
      position: 3,
      shifts: true,
      chords: "C | C | F | G",
      jam: ROCK("C"),
      harmony: { chordTones: true },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(),
      minutes: 6,
    },
    {
      id: "eight-bars-home",
      title: "Eight bars: stop on five, then end on one",
      purpose: "One, four, one, five, then one, four, five, one. The first four bars stop on five and the second four end on one, so the eight bars sound like a question and its answer.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 90. Top three strings, around fret 5.",
        "C is 5, 5, 3. F is 5, 6, 5. G is 4, 3, 3. Follow the form: C, F, C, G, then C, F, G, C.",
        "Bars 5 and 6 are bars 1 and 2 again. Only the last two bars of each half differ: C then G in bars 3 and 4, G then C in bars 7 and 8.",
      ],
      coach: "Eight bars with the band. Right notes and time after the take.",
      tab: bars(C_LOW, F_LOW, C_LOW, G_LOW, C_LOW, F_LOW, G_LOW, C_LOW),
      position: 3,
      shifts: true,
      chords: HOME_CHART,
      jam: ROCK("C"),
      harmony: { chordTones: true },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(0.75, 8),
      minutes: 6,
    },
    {
      id: "eight-bars-home-middle",
      title: "The same eight bars on the middle strings",
      purpose: "The eight bars that end on one, on the D, G and B strings between frets 3 and 7. The chords and the numbers are the same, one set of strings lower.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 90. D, G and B strings, D string first.",
        "C: all three strings at fret 5. F is 7, 5, 6. G is 5, 4, 3. Follow the form: C, F, C, G, then C, F, G, C.",
        "Between C and F the G string stays at fret 5 under the first finger.",
      ],
      coach: "Eight bars with the band. Right notes and time after the take.",
      tab: bars(C_MIDDLE, F_MIDDLE, C_MIDDLE, G_MIDDLE, C_MIDDLE, F_MIDDLE, G_MIDDLE, C_MIDDLE),
      position: 3,
      shifts: true,
      chords: HOME_CHART,
      jam: ROCK("C"),
      harmony: { chordTones: true },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(0.75, 8),
      minutes: 6,
    },
  ],
};

// --- Coming home --------------------------------------------------------------------

/** Beginner, after the minors: lines that stop on five against lines that end on one. */
export const COMING_HOME: StepSpec = {
  id: "coming-home",
  title: "Coming home",
  goal: "Hear the difference between a line that stops on five and a line that ends on one, and play one, six, four, five and one, six, two, five so that each comes home.",
  why: "One is home: the chord on the first note of the scale, and the one a line can rest on. Five leans toward it. Stop a line on five and it sounds unfinished, as if it had asked something. Follow that five with one and it sounds finished. Songs use both: a line that stops on five keeps you listening, and a line that ends on one closes the verse. You now have six chords with numbers, so there are many ways to leave home. What matters is hearing when a line has come back.",
  howTo: [
    "The six chords by number, in C: one is C, two is D minor, three is E minor, four is F, five is G, six is A minor.",
    "The five used here, around fret 5 on the top three strings, G string first: C is 5, 5, 3. D minor is 7, 6, 5. F is 5, 6, 5. G is 4, 3, 3. A minor is 5, 5, 5.",
    "Say the numbers as you play, not the letters.",
    "At the end of every line, ask one thing: does it sound finished, or does it want to go on?",
  ],
  payoff: "You can hear whether a line in C has come home, and you can bring one home yourself.",
  exercises: [
    {
      id: "one-six-four-five",
      title: "One, six, four, five",
      purpose: "C, A minor, F, G: one, its partner six, then four and five. The line stops on five, so it sounds unfinished and wants to start again.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord.",
        "C is 5, 5, 3. A minor is 5, 5, 5. F is 5, 6, 5. G is 4, 3, 3.",
        "From A minor to F the first finger stays across fret 5 and the second finger comes down on the B string at fret 6.",
        "Say the numbers: one, six, four, five.",
      ],
      coach: "Band on. Right notes and time after the take.",
      tab: bars(C_LOW, AM_LOW, F_LOW, G_LOW),
      position: 3,
      shifts: true,
      chords: "C | Am | F | G",
      jam: ROCK("C"),
      harmony: { chordTones: true },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(),
      minutes: 6,
    },
    {
      id: "one-six-four-five-home",
      title: "One, six, four, five, and home",
      purpose: "Eight bars in two lines. One, six, four, five stops on five and asks for more. One, four, five, one answers it and ends at home.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord, eight bars.",
        "Bars 1 to 4: C is 5, 5, 3. A minor is 5, 5, 5. F is 5, 6, 5. G is 4, 3, 3.",
        "Bars 5 to 8: C, F, G, and C again to finish.",
        "Listen to bar 4 and to bar 8. The G in bar 4 hangs, and the C in bar 8 rests.",
      ],
      coach: "Eight bars with the band. Right notes and time after the take.",
      tab: bars(C_LOW, AM_LOW, F_LOW, G_LOW, C_LOW, F_LOW, G_LOW, C_LOW),
      position: 3,
      shifts: true,
      chords: "C | Am | F | G | C | F | G | C",
      jam: ROCK("C"),
      harmony: { chordTones: true },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(0.75, 8),
      minutes: 6,
    },
    {
      id: "one-six-two-five-home",
      title: "One, six, two, five, and home",
      purpose: "The same eight bars with two in place of four. D minor is the partner of F, so the lines sound a little darker and work the same way: one, six, two, five asks, and one, two, five, one answers.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord, eight bars.",
        "Bars 1 to 4: C is 5, 5, 3. A minor is 5, 5, 5. D minor is 7, 6, 5. G is 4, 3, 3.",
        "Bars 5 to 8: C, D minor, G, and C again to finish.",
        "Say the numbers: one, six, two, five, then one, two, five, one.",
      ],
      coach: "Eight bars with the band. Right notes and time after the take.",
      tab: bars(C_LOW, AM_LOW, DM_LOW, G_LOW, C_LOW, DM_LOW, G_LOW, C_LOW),
      position: 3,
      shifts: true,
      chords: "C | Am | Dm | G | C | Dm | G | C",
      jam: ROCK("C"),
      harmony: { chordTones: true },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(0.75, 8),
      minutes: 6,
    },
    {
      id: "your-turn-home",
      title: "Your turn: stop on five, then come home",
      purpose: "Hear it for yourself. Play one, six, four, five and stop on five, and listen to it ask for one. Then play it again and end on one.",
      howTo: [
        "Straight eighths with a quarter note at the end of each bar, or any rhythm you like, 60 to 90 BPM, four bars that loop. Only the click plays here, so nothing fills the silence when you stop.",
        "Play C, A minor, F, G round a few times, with the written shapes or any you like. Then stop at the end of bar 4, let the last note ring and listen while the click goes on. Five is asking for one.",
        "Start again. This time, when the loop comes back to bar 1, play the three notes of C once, let the last one ring and stop. That is the answer.",
        NOT_CHECKED_YET,
      ],
      coach: "Not checked yet. Record it and listen to the two endings.",
      tab: [C_LOW, AM_LOW, F_LOW, G_LOW].map(toTop).join(" | "),
      position: 3,
      shifts: true,
      chords: "C | Am | F | G",
      rungs: ladder(60, 90, 10),
      ...YOUR_TURN,
      selfCheck: [
        "When you stopped on G, did it sound unfinished?",
        "When you ended on C, did it sound like the end?",
      ],
      minutes: 4,
    },
  ],
};

// --- The same numbers in F ----------------------------------------------------------

/** Beginner, last: one new key by hand, before keys change from day to day. */
export const NUMBERS_IN_F: StepSpec = {
  id: "numbers-in-f",
  title: "The key of F, chord by chord",
  goal: "Play one, four, five and one, six, four, five in the key of F, finding each chord by its number, and hear F as home.",
  why: "The key of F is the key of C with one note changed: B becomes B flat. You could reach F the way you reached D, by moving the C shapes up the neck, five frets this time. But F is so close to C that most of its chords are already under your hand around fret 5, under new numbers. F was four and is now one. C was one and is now five. D minor was two and is now six. Of the four chords used here, only B flat, which is four, is not a chord of C, and its shape is the one you use for G, three frets higher. A key this close shows plainly that a number is a job and not a chord: C sounded like home in the last Step, and here it is the chord that leans toward F.",
  howTo: [
    "F major has one flat: B flat. Its one, four and five are F, B flat and C, and its six is D minor.",
    "Around fret 5 on the top three strings, G string first: F is 5, 6, 5. B flat is 7, 6, 6. C is 5, 5, 3. D minor is 7, 6, 5.",
    "B flat is the only chord here that is not in the key of C, and its shape is one you know: the G shape, 4, 3, 3, three frets higher. The first finger lies across the B and top strings at fret 6, and the second finger takes fret 7 on the G string. Its notes are D, F and B flat.",
    "Before each Exercise, say the numbers and the chords together: one is F, four is B flat, five is C, six is D minor.",
  ],
  payoff: "You know one, four, five and six by name in F as well as in C, and you have heard home move from C to F.",
  difficultyException:
    "Half of this Step is four-bar lines and one form holds most of its chords for two bars, after a Step whose eight-bar lines change chord in every bar, so the metric reads a few hundredths lower. The new demand is a new key: every chord is found by its number, and one of them is not a chord of C.",
  exercises: [
    {
      id: "one-four-five-f",
      title: "One, four, five, one in F",
      purpose: "F, B flat, C and back to F, around fret 5. F and C are shapes you played in the key of C under other numbers. B flat is the G shape, three frets higher.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord.",
        "F is 5, 6, 5. B flat is 7, 6, 6. C is 5, 5, 3. F again.",
        "From F to B flat the first finger moves up from fret 5 to fret 6, where it holds the B and top strings, and the second finger takes fret 7 on the G string.",
        "Say the numbers: one, four, five, one.",
      ],
      coach: "Band on. Right notes and time after the take.",
      tab: bars(F_LOW, BB_LOW, C_LOW, F_LOW),
      position: 3,
      shifts: true,
      chords: "F | Bb | C | F",
      jam: ROCK("F"),
      harmony: { chordTones: true },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(),
      minutes: 6,
    },
    {
      id: "eight-bar-form-f",
      title: "The eight-bar form in F",
      purpose: "One, one, four, four, five, four, one, one: the form you played in C, with F as home. Two bars of F, two of B flat, then C, B flat, and two bars of F.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 90. Top three strings, around fret 5.",
        "F is 5, 6, 5. B flat is 7, 6, 6. C is 5, 5, 3. Follow the form: F, F, B flat, B flat, C, B flat, F, F.",
        "Count the bars in twos, as you did in C. Only the C in bar 5 and the B flat in bar 6 last a single bar.",
        "Around bar 5 the whole hand moves three frets and back: the first finger goes from fret 6 down to fret 3 for C, then up to fret 6 again for B flat.",
      ],
      coach: "Eight bars with the band. Right notes and time after the take.",
      tab: bars(F_LOW, F_LOW, BB_LOW, BB_LOW, C_LOW, BB_LOW, F_LOW, F_LOW),
      position: 3,
      shifts: true,
      chords: "F | F | Bb | Bb | C | Bb | F | F",
      jam: ROCK("F"),
      harmony: { chordTones: true },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(0.75, 8),
      minutes: 6,
    },
    {
      id: "one-six-four-five-f",
      title: "One, six, four, five in F",
      purpose: "F, D minor, B flat, C: the line you played in C as C, A minor, F, G, with the same numbers and F as home. It stops on five, which is C here.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord.",
        "F is 5, 6, 5. D minor is 7, 6, 5. B flat is 7, 6, 6. C is 5, 5, 3.",
        "From F to D minor the third finger comes down on the G string at fret 7 and nothing else moves.",
        "From D minor to B flat only the top note changes, fret 5 to fret 6, but every finger changes place: the first finger lies across the B and top strings at fret 6, and the second finger takes the G string at fret 7.",
        "Say the numbers: one, six, four, five.",
      ],
      coach: "Band on. Right notes and time after the take.",
      tab: bars(F_LOW, DM_LOW, BB_LOW, C_LOW),
      position: 3,
      shifts: true,
      chords: "F | Dm | Bb | C",
      jam: ROCK("F"),
      harmony: { chordTones: true },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(),
      minutes: 6,
    },
    {
      id: "home-in-f",
      title: "One, six, four, five in F, and home",
      purpose: "The eight bars that came home to C, with F as home. One, six, four, five stops on C and asks for more. One, four, five, one answers it and ends on F.",
      howTo: [
        "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord, eight bars.",
        "Bars 1 to 4: F is 5, 6, 5. D minor is 7, 6, 5. B flat is 7, 6, 6. C is 5, 5, 3.",
        "Bars 5 to 8: F, B flat, C, and F again to finish.",
        "Listen to bar 4 and to bar 8. C was home in the key of C. Here it is five: it hangs in bar 4, and the F in bar 8 rests.",
      ],
      coach: "Eight bars with the band. Right notes and time after the take.",
      tab: bars(F_LOW, DM_LOW, BB_LOW, C_LOW, F_LOW, BB_LOW, C_LOW, F_LOW),
      position: 3,
      shifts: true,
      chords: "F | Dm | Bb | C | F | Bb | C | F",
      jam: ROCK("F"),
      harmony: { chordTones: true },
      rungs: ladder(60, 120, 10),
      passAt: 90,
      ...named(0.75, 8),
      minutes: 6,
    },
  ],
};
