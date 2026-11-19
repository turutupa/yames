/**
 * Rhythm Foundations, a Mechanics Path. A draft: no teacher or guitarist has
 * reviewed it.
 *
 * The true-beginner Path: every other Path assumes eighths with a click at 80
 * BPM, and this one gets a player there and past it. The notes stay easy on
 * purpose (open strings, E minor pentatonic in open position, a few frets at the
 * fifth), so the rhythm is the only hard thing.
 */
import { definePath } from "../spec";
import type { ExerciseSpec, VariantParams } from "../spec";
import { STANDARD_TUNING } from "../format";
import { pcOfName } from "../theory";
import { handAt, ladder, oneStringClimb, shiftFrets, swing } from "../templates";

const E_PENT = { scale: ["E", "minorPentatonic"] as [string, string] };
const A_PENT = { scale: ["A", "minorPentatonic"] as [string, string] };

/** Strokes follow the count, not the note before: taught in words, so the plan is free. */
const FREE = { pick: "free" } as const satisfies Partial<ExerciseSpec>;

const REST_CHECK = "In the rests, was the guitar silent, with no string left ringing?";
const COUNT_CHECK = "Could you count the beats out loud while you played it?";
const FOOT_CHECK = "Did your foot keep tapping the beat through the off-beat notes?";

/** Semitones from A minor, for the lines at the fifth fret. */
const KEY_SHIFT: Readonly<Record<string, number>> = { A: 0, B: 2, C: 3, D: 5, G: -2 };

function inKeys(tab: string, keys: readonly string[]) {
  return {
    values: { key: keys },
    pooled: ["key"] as const,
    label: (p: VariantParams) => `${p.key} minor`,
    build: (p: VariantParams) => {
      const moved = shiftFrets(tab, KEY_SHIFT[p.key]);
      return { tab: moved, position: handAt(moved), harmony: { scale: [p.key, "minorPentatonic"] as [string, string] } };
    },
  };
}

/** The same open-string riff on another pair of strings: E minor pentatonic sits the same way on each pair below. */
const PAIRS: Readonly<Record<string, [string, string]>> = {
  "low E and A": ["6:3", "5:2"],
  "A and D": ["5:2", "4:2"],
  "D and G": ["4:2", "3:2"],
};

/** A riff written with `L` and `H` for the lower and upper string of a pair: `L0` open, `Lx` and `Hx` their fretted note. */
function onPairs(riff: string) {
  const build = (pair: string) => {
    const [low, high] = PAIRS[pair];
    const [ls, hs] = [low[0], high[0]];
    return riff.replace(/L0/g, `${ls}:0`).replace(/H0/g, `${hs}:0`).replace(/Lx/g, low).replace(/Hx/g, high);
  };
  return {
    base: build("low E and A"),
    vary: {
      values: { stringSet: Object.keys(PAIRS) },
      pooled: ["stringSet"] as const,
      label: (p: VariantParams) => `${p.stringSet} strings`,
      build: (p: VariantParams) => ({ tab: build(p.stringSet), position: 1 }),
    },
  };
}

// --- Beginner ---------------------------------------------------------------

const OPEN_QUARTERS = onPairs(`/4 L0 L0 L0 L0 | H0 H0 H0 H0 | L0 L0 H0 H0 | /2 L0 H0`);
const HALVES = onPairs(`/2 L0 /4 Lx L0 | /2 H0 /4 Hx H0 | /2 L0 /4 Lx H0 | /1 Hx`);
const QUARTER_RIFF = onPairs(`/4 L0 Lx H0 Hx | H0 Hx H0 Lx | L0 Lx H0 Hx | /2 Hx H0`);

const GEAR_ONE = onPairs(`/4 L0 Lx H0 Hx | /8 L0 L0 Lx Lx H0 H0 Hx Hx`);
const EIGHTH_RIFF = onPairs(`/8 L0 L0 Lx L0 H0 H0 Hx H0 | L0 L0 Lx L0 Hx H0 /4 Lx`);
const LONG_SHORT = onPairs(`/4 L0 /8 Lx Lx /4 H0 /8 Hx Hx | /4 H0 /8 Hx Hx /4 Lx /8 L0 L0`);
const FIFTH_TUNE = `/8 3:5 3:7 /4 2:5 /8 2:8 2:5 /4 3:7 | /8 3:5 3:7 2:5 3:7 /2 3:5`;

const QUARTER_RESTS = onPairs(`/4 L0 r L0 r | Lx r Lx r | H0 H0 r H0 | Hx r r r`);
const STOPS = onPairs(`/8 L0 L0 Lx L0 /4 H0 r | /8 L0 L0 Lx L0 /4 Hx r`);
const CALL_ANSWER = onPairs(`/4 L0 /8 Lx L0 /4 Hx r | /8 H0 Hx /4 H0 r r`);
const HALF_REST = onPairs(`/8 L0 Lx H0 Hx /2 r | /8 Hx H0 Lx L0 /2 r`);

// --- Intermediate -----------------------------------------------------------

const OFF_BEATS = onPairs(`/8 L0 Lx r Lx r Lx r Lx | H0 Hx r Hx r Hx r Hx`);
const DOTTED = onPairs(`/4. L0 /8 Lx /4. H0 /8 Hx | /4. H0 /8 Hx /2 Lx`);
const THREE_THREE_TWO = onPairs(`/4. L0 /4. Lx /4 H0 | /4. Hx /4. H0 /4 Lx`);
const SYNC_RIFF = onPairs(`/8 L0 L0 r Lx r H0 Hx r | L0 L0 r Lx r Hx /4 H0`);

const FOUR_AND_ONE = onPairs(`/16 L0 L0 L0 L0 /4 Lx /16 H0 H0 H0 H0 /4 Hx`);
const LONG_SHORT_SHORT = onPairs(`/8 L0 /16 L0 L0 /8 Lx /16 Lx Lx /8 H0 /16 H0 H0 /8 Hx /16 Hx Hx`);
const SHORT_SHORT_LONG = onPairs(`/16 L0 L0 /8 L0 /16 Lx Lx /8 Lx /16 H0 H0 /8 H0 /16 Hx Hx /8 Hx`);
const SIXTEENTH_RIFF = onPairs(`/8 L0 /16 L0 L0 /16 Lx Lx /8 L0 /8 H0 /16 H0 H0 /4 Hx | /16 L0 L0 /8 L0 /8 Lx /16 L0 L0 /8 Hx H0 /4 Lx`);

const TRIPLETS = onPairs(`/8t L0 L0 L0 Lx Lx Lx H0 H0 H0 Hx Hx Hx`);
const TWO_AND_THREE = onPairs(`/8 L0 L0 /8t Lx Lx Lx /8 H0 H0 /8t Hx Hx Hx`);
const SHUFFLE = swing(`/8 5:0 5:0 4:2 4:2 4:4 4:4 4:2 4:2 | 5:0 5:0 4:2 4:2 4:4 4:4 /4 4:2`);
const TRIPLET_TUNE = `/8t 3:5 3:7 2:5 3:7 3:5 4:7 /4 3:5 r | /8t 2:5 2:8 2:5 3:7 3:5 4:7 /2 4:5`;

// --- Advanced ---------------------------------------------------------------

const ONE_E_A = onPairs(`/16 L0 L0 r L0 Lx Lx r Lx H0 H0 r H0 /4 Hx`);
const AFTER_THE_BEAT = onPairs(`/4 L0 /16 r Lx Lx Lx /4 H0 /16 r Hx Hx Hx`);
const FUNK_LINE = `/16 6:5 r r 6:5 r 6:8 6:5 r 5:5 r 5:7 r 4:5 4:7 r r | 6:5 r r 6:5 r 6:8 6:5 r 4:7 r 4:5 r /4 5:7`;
const DOTTED_EIGHTHS = onPairs(`/8. L0 Lx H0 Hx /4 H0 | /8. Hx H0 Lx L0 /4 Lx`);

const GEARS = onPairs(`/8 L0 L0 /8t Lx Lx Lx /16 H0 H0 H0 H0 /4 Hx`);
const PYRAMID = onPairs(`/4 L0 /8 Lx Lx /8t H0 H0 H0 /16 Hx Hx Hx Hx | /16 H0 H0 H0 H0 /8t Hx Hx Hx /8 L0 L0 /4 Lx`);
const THREE_OVER_TWO = onPairs(`/4 L0 Lx /4t H0 Hx H0 | /4t Lx L0 Lx /4 H0 Hx`);
const GEAR_RIFF = `/8 3:5 3:7 /16 2:5 2:8 2:5 3:7 /8t 3:5 3:7 3:5 /4 4:7 | /8t 4:5 4:7 3:5 /16 3:7 3:5 4:7 4:5 /8 5:7 4:5 /4 4:7`;

const BAND_EIGHTHS = `/8 6:0 6:0 r 6:3 r 6:0 5:2 6:3 | 6:3 6:3 r 5:2 r 5:0 5:2 4:0 | 5:0 5:0 r 5:2 r 4:0 4:2 5:2 | 6:0 6:0 r 6:3 5:0 6:3 /4 5:2`;
const BAND_SIXTEENTHS = `/8 6:0 /16 6:0 6:0 /16 r 6:3 6:0 r /8 5:0 /16 5:2 r /8 4:0 4:2 | /8 6:0 /16 6:0 6:0 /16 r 6:3 6:0 r /16 5:2 5:0 r 6:3 /4 5:2`;
const BAND_SHUFFLE = swing(`/8 5:0 5:0 4:2 4:2 4:4 4:4 4:2 4:2 | 5:0 5:0 4:2 4:2 4:4 4:4 4:2 4:2 | 4:0 4:0 3:2 3:2 3:4 3:4 3:2 3:2 | 5:0 5:0 4:2 4:2 4:4 4:4 /4 4:2`);

/**
 * A warm-up figure on one string: `t0`, `t1` (and `t2`) are neighbouring scale notes, and the figure climbs a note a bar.
 * The fingers are printed, because the hand moves every bar: first finger on the lowest note, the others by the gaps.
 */
function climbFigure(p: VariantParams, figure: string, size: 2 | 3) {
  const string = Number(p.stringSet);
  const root = (((pcOfName(p.key) - STANDARD_TUNING[string - 1]) % 12) + 12) % 12;
  // Two notes start on the key's root; three start where the frets are close enough for the wider shape.
  const from = size === 2 ? (root < 2 ? root + 12 : root) : ([root, root + 5, root + 7, root + 12].find((fret) => fret >= 5 && fret <= 11) ?? 5);
  const cell = size === 2 ? [0, 1] : [0, 1, 2];
  const bars = oneStringClimb({ root: p.key, scale: "naturalMinor", string, from, cell, bars: 4 });
  const tab = bars
    .split(" | ")
    .map((bar) => {
      const frets = bar.split(" ").map((token) => Number(token.split(":")[1]));
      const wide = size === 3 && frets[2] - frets[0] === 4;
      const fingers = [1, frets[1] - frets[0] === 1 || wide ? 2 : 3, 4];
      return bar.split(" ").reduce((text, token, i) => text.replace(new RegExp(`t${i}`, "g"), `${token}f${fingers[i]}`), figure);
    })
    .join(" | ");
  return { tab, position: handAt(tab), shifts: true, harmony: { scale: [p.key, "naturalMinor"] as [string, string] } };
}

const WARMUP_KEYS = { key: ["A", "C", "D", "E", "G"], stringSet: ["2", "3", "4"] } as const;

export default definePath({
  id: "rhythm-foundations",
  title: "Rhythm Foundations",
  kind: "mechanics",
  goal: "Play quarters, eighths, triplets and sixteenths, with rests and off-beats, in time with a click and then with a band.",
  level: "beginner",
  assumes:
    "You can hold a pick and play a single note on an open string and at a fret. You don't need to have used a click before. The minutes listed are one pass through the material; expect to come back to each Step for days.",
  prerequisites: { skills: ["One clean note at a time", "Holding a pick"] },
  labelSubdivisions: "mostly",
  paceLadders: true,
  orderRationale:
    "The beat first, then two notes to a beat, then silence, because a rest is harder to place than a note. Off-beats come before sixteenths: they use the same eighth-note count, and a player who can't feel the 'and' will not feel the 'e' or the 'a'. Triplets follow sixteenths so the two ways of dividing a beat can be compared. The Advanced Level mixes them, and the band comes last because a band hides a loose rhythm that a click exposes.",
  gradingLimits:
    "The app times each note you play against where it is written and counts the notes it heard, and after the take it checks the notes were the written ones. It does not grade silence itself: a note played in a rest counts as an extra note, and a string left ringing through a rest is yours to hear. Counting out loud and tapping your foot are taught here and not checked. Your setup adds a small delay between playing and the app hearing it, which matters little at these tempos. None of this has been tried on a real guitar yet.",
  steps: [
    {
      id: "on-the-beat",
      title: "On the beat",
      goal: "Play one note on every click, and hold a note for two clicks or four, without drifting.",
      why: "Everything in music hangs on the beat. Playing exactly with a click feels strange at first: when you are right on it, the click seems to disappear behind your note. That feeling is the thing to learn, and it is easiest to find with one slow note at a time.",
      howTo: [
        "Count '1, 2, 3, 4' out loud with the click before you play, and keep counting while you play.",
        "Every note is a downstroke. Let the pick fall through the string and rest against the next one.",
        "A half note lasts two clicks and a whole note four. Let it ring for its full length and count through it.",
      ],
      payoff: "A four-bar riff on two strings that lands on every click.",
      exercises: [
        {
          id: "open-quarters",
          title: "One note a click",
          purpose: "Open strings only, one note on each click, then two long notes to finish. The fretting hand does nothing, so all of your attention is on the beat.",
          howTo: [
            "Quarter notes: four on the lower string, four on the upper, two and two, then a half note on each.",
            "Listen for the click vanishing under your note. If you hear the click just before or after you, you are late or early.",
          ],
          coach: "I time each note against the click and say how even they were. Counting out loud is yours to keep going.",
          vary: OPEN_QUARTERS.vary,
          tab: OPEN_QUARTERS.base,
          position: 1,
          harmony: E_PENT,
          rungs: ladder(50, 120, 10),
          passAt: 80,
          grade: "timing",
          selfCheck: [COUNT_CHECK],
          minutes: 4,
        },
        {
          id: "halves",
          title: "Long notes and short ones",
          purpose: "A half note, then two quarters, and a whole note to end. Holding a note for exactly two clicks is harder than playing two notes.",
          howTo: [
            "Count '1, 2' through each half note and play the quarters on 3 and 4. The last bar is one note held for all four clicks.",
            "The fretted notes are at fret 3 on the low E string and fret 2 on the A string: third finger and second finger.",
          ],
          coach: "I time when each note starts. How long you let it ring is for your ear and your count.",
          vary: HALVES.vary,
          tab: HALVES.base,
          position: 1,
          harmony: E_PENT,
          rungs: ladder(50, 120, 10),
          passAt: 80,
          grade: "timingNotes",
          selfCheck: ["Did each long note ring until the next note started?"],
          minutes: 4,
        },
        {
          id: "quarter-riff",
          title: "A riff in quarter notes",
          purpose: "E minor pentatonic on two strings, a note on every click for three bars and two half notes to end. Your first riff with a click.",
          howTo: [
            "Open string, fretted note, open string, fretted note. Keep the fretting fingers close to the strings so they are ready.",
            "All downstrokes. If a note is late, it is nearly always the fretting finger arriving late, not the pick.",
          ],
          coach: "After the take I'll say how even it was and whether the notes were the written ones.",
          vary: QUARTER_RIFF.vary,
          tab: QUARTER_RIFF.base,
          position: 1,
          harmony: E_PENT,
          rungs: ladder(50, 130, 10),
          passAt: 90,
          grade: "timingNotes",
          minutes: 5,
        },
      ],
    },
    {
      id: "eighths",
      title: "Two to a beat",
      goal: "Play eighth notes, two to every click, down on the beat and up on the 'and', and change between quarters and eighths without a bump.",
      why: "Eighth notes are where the picking hand starts to swing like a pendulum: down on the beat, up between beats. That motion is the clock for every rhythm after this one. If the up note is early or quiet, the line limps.",
      howTo: [
        "Count '1 and 2 and 3 and 4 and'. Downstroke on the numbers, upstroke on every 'and'.",
        "Make the upstroke as loud as the downstroke. It is usually quieter because the pick catches less string.",
        "When the rhythm goes back to quarter notes, the hand keeps swinging and simply misses the string on the way up.",
      ],
      payoff: "A riff in eighths that drives, and a tune at the fifth fret that mixes long and short notes.",
      exercises: [
        {
          id: "gear-one",
          title: "Quarters, then eighths",
          purpose: "One bar with a note on each click, then the same notes twice as fast. The click does not change; you fit two notes into it.",
          howTo: [
            "Bar 1: four quarter notes, all down. Bar 2: each note twice, down then up.",
            "The first note of bar 2 lands exactly on the click, like every note in bar 1 did.",
          ],
          coach: "I'll say how even each bar was. The join between the bars is usually where the time slips.",
          vary: GEAR_ONE.vary,
          tab: GEAR_ONE.base,
          position: 1,
          harmony: E_PENT,
          rungs: ladder(50, 120, 10),
          passAt: 80,
          grade: "timingNotes",
          minutes: 4,
        },
        {
          id: "eighth-riff",
          title: "A riff in eighths",
          purpose: "Two bars of steady eighths in E minor pentatonic with a long note to end. The pick never stops: down, up, down, up.",
          howTo: [
            "Strictly down on the beat and up on the 'and', even when the string changes.",
            "Tap your foot on the click. The foot goes down with every downstroke.",
          ],
          coach: "After the take I'll say how even it was and whether the notes were the written ones. The direction of each stroke is yours to keep.",
          vary: EIGHTH_RIFF.vary,
          tab: EIGHTH_RIFF.base,
          position: 1,
          harmony: E_PENT,
          rungs: ladder(50, 130, 10),
          passAt: 85,
          grade: "timingNotes",
          minutes: 5,
        },
        {
          id: "long-short-short",
          title: "Long, short-short",
          purpose: "A quarter note and two eighths, over and over: the commonest rhythm in rock. The hand swings in eighths the whole time and skips one upstroke.",
          howTo: [
            "Count '1, 2 and, 3, 4 and'. Down on 1, then down-up on '2 and'.",
            "On the quarter note the hand still comes up; it just passes over the string without touching it.",
          ],
          coach: "I'll say how even it was and check the notes after the take.",
          vary: LONG_SHORT.vary,
          tab: LONG_SHORT.base,
          position: 1,
          harmony: E_PENT,
          rungs: ladder(50, 130, 10),
          passAt: 85,
          grade: "timingNotes",
          minutes: 5,
        },
        {
          id: "fifth-tune",
          title: "A tune at the fifth fret",
          purpose: "The same rhythms on fretted notes: a short A minor melody of eighths and quarters that ends on a long note.",
          howTo: [
            "First finger at fret 5, third finger at fret 7, little finger at fret 8 on the B string.",
            "Count it first without the guitar: '1 and 2, 3 and 4'. Then play what you counted.",
          ],
          coach: "After the take I'll say how even it was and whether the notes were the written ones.",
          vary: inKeys(FIFTH_TUNE, ["A", "B", "C", "D"]),
          tab: FIFTH_TUNE,
          position: 5,
          harmony: A_PENT,
          rungs: ladder(50, 120, 10),
          passAt: 80,
          grade: "timingNotes",
          minutes: 5,
        },
      ],
    },
    {
      id: "rests",
      title: "Silence in time",
      goal: "Stop the strings on the beat and come back in on the beat, so a rest is as exact as a note.",
      why: "A rest is not a pause; it is a note of silence with a start and an end. Most beginners rush through rests because nothing is happening. Riffs get their punch from the stops, and a stop only works if it is in time.",
      howTo: [
        "To stop an open string, lay the side of the picking hand on the strings at the bridge. To stop a fretted note, relax the finger without lifting it off the string.",
        "Keep counting through the rest, out loud, and keep the foot tapping.",
        "The picking hand keeps its swing through a rest and plays the air.",
      ],
      payoff: "A riff that stops dead and comes back in, exactly together with the click.",
      difficultyException:
        "Fewer notes a bar than the Step before, on purpose: placing silence and coming back in on time is the demand, and a note-rate metric does not count it.",
      exercises: [
        {
          id: "quarter-rests",
          title: "Play one, rest one",
          purpose: "A note on a click, silence on the next. The last bar is one note and three beats of nothing, which is longer than it sounds.",
          howTo: [
            "Play on the click, then stop the string exactly on the next click. Count the rests as loudly as the notes.",
            "In bar 4, play on beat 1 and count '2, 3, 4' in silence before the loop starts again.",
          ],
          coach: "I time the notes. A note played in a rest counts as an extra note; a string left ringing is for your ear.",
          ...FREE,
          vary: QUARTER_RESTS.vary,
          tab: QUARTER_RESTS.base,
          position: 1,
          harmony: E_PENT,
          rungs: ladder(50, 120, 10),
          passAt: 80,
          grade: "timingNotes",
          selfCheck: [REST_CHECK],
          minutes: 4,
        },
        {
          id: "stops",
          title: "Run and stop",
          purpose: "Four eighths, a quarter note, and a beat of silence. The stop on beat 4 is what makes it a riff.",
          howTo: [
            "Count '1 and 2 and 3, (4)'. Stop the string on 4 and come back in on the next 1.",
            "Don't speed up into the stop. The four eighths are the same speed as always.",
          ],
          coach: "I'll say how even it was and check the notes after the take. The silence on beat 4 is yours to keep clean.",
          ...FREE,
          vary: STOPS.vary,
          tab: STOPS.base,
          position: 1,
          harmony: E_PENT,
          rungs: ladder(50, 130, 10),
          passAt: 85,
          grade: "timingNotes",
          selfCheck: [REST_CHECK],
          minutes: 5,
        },
        {
          id: "call-answer",
          title: "A question and an answer",
          purpose: "Two short phrases with silence after each, the second with two beats of rest. The rests are where the other player would answer.",
          howTo: [
            "Bar 1: quarter, two eighths, quarter, rest. Bar 2: two eighths, quarter, then two beats of rest.",
            "Hear the phrase echo in your head during the rest. That keeps the count going without thinking about it.",
          ],
          coach: "I'll say how even it was and check the notes after the take.",
          ...FREE,
          vary: CALL_ANSWER.vary,
          tab: CALL_ANSWER.base,
          position: 1,
          harmony: E_PENT,
          rungs: ladder(50, 130, 10),
          passAt: 85,
          grade: "timingNotes",
          selfCheck: [REST_CHECK],
          minutes: 5,
        },
        {
          id: "half-rest",
          title: "Two beats on, two beats off",
          purpose: "Four eighths and then half a bar of silence. Coming back in after two empty beats is the test of whether you are still counting.",
          howTo: [
            "Count '1 and 2 and, 3, 4'. Beats 3 and 4 are silent every bar.",
            "Breathe out in the rest. A tense hand comes back in early.",
          ],
          coach: "The first note after each rest is the one I'd look at: early is the usual mistake.",
          ...FREE,
          vary: HALF_REST.vary,
          tab: HALF_REST.base,
          position: 1,
          harmony: E_PENT,
          rungs: ladder(50, 130, 10),
          passAt: 85,
          grade: "timingNotes",
          selfCheck: [REST_CHECK],
          minutes: 4,
        },
      ],
    },
    {
      id: "off-beats",
      title: "Between the beats",
      goal: "Play notes on the 'and' with nothing on the beat before them, and hold a note across a beat, while the foot keeps the pulse.",
      why: "Syncopation is a note where the beat is not. It is what makes a rhythm lean forward. The trap is that the off-beat note turns into the beat in your head and you flip the rhythm over; the foot and the pendulum of the hand are what stop that.",
      howTo: [
        "The hand never stops swinging in eighths: down on every beat, up on every 'and'. An off-beat note is always an upstroke.",
        "Where the beat itself is silent, the downstroke plays the air and the foot plays the beat.",
        "A dotted quarter note lasts a beat and a half: count '1 and 2' and play the next note on the 'and' of 2.",
      ],
      payoff: "A syncopated riff that pushes against the click and never turns around.",
      exercises: [
        {
          id: "the-and",
          title: "Only the 'and'",
          purpose: "After the first beat, every note is on an 'and': the beats themselves are silent. The foot has to be the beat, because the guitar no longer is.",
          howTo: [
            "Count '1 and, (2) and, (3) and, (4) and'. Play the 'and' with an upstroke and miss the string on the way down.",
            "Tap the foot on every click. The note comes when the foot is in the air.",
          ],
          coach: "I time each note against where it is written. Whether your foot kept the beat is yours to say.",
          ...FREE,
          vary: OFF_BEATS.vary,
          tab: OFF_BEATS.base,
          position: 1,
          harmony: E_PENT,
          rungs: ladder(50, 120, 10),
          passAt: 80,
          grade: "timingNotes",
          selfCheck: [FOOT_CHECK],
          minutes: 5,
        },
        {
          id: "dotted-quarter",
          title: "A beat and a half",
          purpose: "A dotted quarter note and an eighth: long, short, long, short. The short note falls on the 'and' of 2 and of 4.",
          howTo: [
            "Count '1 and 2 AND 3 and 4 AND', playing on 1, on the 'and' of 2, on 3 and on the 'and' of 4.",
            "The long note is a downstroke and the short one an upstroke. Let the long note ring until the short one starts.",
          ],
          coach: "I'll say how even it was and check the notes after the take.",
          ...FREE,
          vary: DOTTED.vary,
          tab: DOTTED.base,
          position: 1,
          harmony: E_PENT,
          rungs: ladder(50, 130, 10),
          passAt: 90,
          grade: "timingNotes",
          minutes: 5,
        },
        {
          id: "three-three-two",
          title: "Three, three, two",
          purpose: "Eight eighths grouped 3 + 3 + 2: three notes a bar, the second one off the beat. It is the rhythm under a great many rock, pop and Latin songs.",
          howTo: [
            "Count the eighths '1 2 3, 1 2 3, 1 2' and play on every '1'. Then count it as '1, the and of 2, 4' against the click.",
            "Down, up, down. The middle note is the off-beat one.",
          ],
          coach: "The second note of each bar is the one that drifts onto the beat. I'll say how even it was.",
          ...FREE,
          vary: THREE_THREE_TWO.vary,
          tab: THREE_THREE_TWO.base,
          position: 1,
          harmony: E_PENT,
          rungs: ladder(60, 140, 10),
          passAt: 100,
          grade: "timingNotes",
          selfCheck: [FOOT_CHECK],
          minutes: 5,
        },
        {
          id: "sync-riff",
          title: "A syncopated riff",
          purpose: "Two bars in E minor pentatonic where beats 2 and 3 are silent and the notes around them fall on the 'and'.",
          howTo: [
            "Count '1 and, (2) and, (3) and 4 and'. The hand swings in eighths throughout and plays only the written ones.",
            "Learn it at the first rung with the count out loud. It will feel wrong until it suddenly feels right.",
          ],
          coach: "After the take I'll say how even it was and whether the notes were the written ones.",
          ...FREE,
          vary: SYNC_RIFF.vary,
          tab: SYNC_RIFF.base,
          position: 1,
          harmony: E_PENT,
          rungs: ladder(50, 130, 10),
          passAt: 90,
          grade: "timingNotes",
          selfCheck: [FOOT_CHECK],
          minutes: 6,
        },
      ],
    },
    {
      id: "sixteenths",
      title: "Four to a beat",
      goal: "Play sixteenth notes and the two figures built from them, long-short-short and short-short-long, evenly with a click.",
      why: "Sixteenths divide the beat in four, and nearly every busy rhythm is a pattern of which of the four you play. The pendulum doubles: the hand now swings four times a beat, and each figure is that swing with one stroke missing.",
      howTo: [
        "Count '1 e and a, 2 e and a'. The hand goes down on the number and the 'and', up on the 'e' and the 'a'.",
        "Long-short-short is '1, and a': down, down-up. Short-short-long is '1 e and': down-up, down.",
        "Keep the strokes small. The wrist moves, not the arm.",
      ],
      payoff: "A riff with the gallop in it, steady at a tempo where it starts to sound like a band.",
      exercises: [
        {
          id: "four-and-one",
          title: "Four fast, one slow",
          purpose: "A beat of sixteenths and then a quarter note to breathe. Four even notes inside one click is the whole skill, in its smallest form.",
          howTo: [
            "Count '1 e and a, 2'. Down, up, down, up, then a downstroke on beat 2.",
            "The four notes fill the beat exactly. If you arrive at beat 2 early, they were rushed.",
          ],
          coach: "The quarter note after each group tells me whether the four before it were rushed. I'll say how even it was.",
          vary: FOUR_AND_ONE.vary,
          tab: FOUR_AND_ONE.base,
          position: 1,
          harmony: E_PENT,
          rungs: ladder(40, 110, 10),
          passAt: 70,
          grade: "timingNotes",
          minutes: 5,
        },
        {
          id: "long-short-short-16",
          title: "The gallop figure",
          purpose: "An eighth and two sixteenths on every beat: '1, and a'. A horse's gallop, and the rhythm of a thousand rock riffs.",
          howTo: [
            "Down, down-up on each beat. The hand swings in sixteenths and misses the string on the 'e'.",
            "Keep the two short notes light and even. The long note on the beat is the strong one.",
          ],
          coach: "I'll say how even it was and check the notes after the take. Which strokes you used is yours to keep.",
          ...FREE,
          vary: LONG_SHORT_SHORT.vary,
          tab: LONG_SHORT_SHORT.base,
          position: 1,
          harmony: E_PENT,
          rungs: ladder(40, 110, 10),
          passAt: 70,
          grade: "timingNotes",
          minutes: 5,
        },
        {
          id: "short-short-long",
          title: "The gallop, turned round",
          purpose: "Two sixteenths and an eighth on every beat: '1 e and'. The same three notes with the short ones first, and it feels completely different.",
          howTo: [
            "Down-up, down on each beat. The hand misses the string on the 'a'.",
            "The first of the two short notes is on the click. Don't let the pair fall early, before the beat.",
          ],
          coach: "I'll say how even it was and check the notes after the take.",
          ...FREE,
          vary: SHORT_SHORT_LONG.vary,
          tab: SHORT_SHORT_LONG.base,
          position: 1,
          harmony: E_PENT,
          rungs: ladder(40, 110, 10),
          passAt: 70,
          grade: "timingNotes",
          minutes: 5,
        },
        {
          id: "sixteenth-riff",
          title: "A riff with both figures",
          purpose: "Two bars that use the gallop, its reverse, plain eighths and a long note, so you have to change figure on the move.",
          howTo: [
            "Clap or count the rhythm before you play it: '1, and a, 2 e and, 3, and a, 4'.",
            "The hand swings in sixteenths from start to finish. Only which strokes touch the string changes.",
          ],
          coach: "This is the Step's test piece. I'll say how even it was and check the notes after the take.",
          ...FREE,
          vary: SIXTEENTH_RIFF.vary,
          tab: SIXTEENTH_RIFF.base,
          position: 1,
          harmony: E_PENT,
          rungs: ladder(40, 110, 10),
          passAt: 75,
          grade: "timingNotes",
          minutes: 6,
        },
      ],
    },
    {
      id: "triplets",
      title: "Three to a beat",
      goal: "Play eighth-note triplets evenly, change between two and three notes to a beat, and play a shuffle.",
      why: "A triplet divides the beat in three, and it is the first rhythm that will not fit the 'down on the beat' rule: with strict down-up strokes, every other beat starts on an upstroke. The shuffle, the rhythm of blues and a lot of rock, is a triplet with its middle note left out.",
      howTo: [
        "Count '1-trip-let, 2-trip-let'. Three even notes a click, with the first one on it.",
        "Keep strict down-up: beat 1 starts down, beat 2 starts up. Give the first note of each beat a small accent so both sound the same.",
        "A shuffle is long-short, long-short: play the first and third notes of each triplet. Count '1 (trip) let, 2 (trip) let'.",
      ],
      payoff: "A boogie shuffle on two strings that rolls along with the click.",
      difficultyException:
        "Three to a beat is fewer notes a second than the sixteenths before it. The new demands are a division that does not line up with the strokes, and the change between two and three, which a note-rate metric does not count.",
      exercises: [
        {
          id: "triplets",
          title: "Three even notes a click",
          purpose: "Each note three times, as a triplet: four beats, twelve notes. Getting three to sound even, and not like two fast and one slow, is the point.",
          howTo: [
            "Say '1-trip-let' along with the click before you play. All three syllables the same length.",
            "Strict down-up. The first note of beats 2 and 4 is an upstroke; lean on it a little.",
          ],
          coach: "I'll say how even the triplets were and check the notes after the take.",
          vary: TRIPLETS.vary,
          tab: TRIPLETS.base,
          position: 1,
          harmony: E_PENT,
          rungs: ladder(50, 120, 10),
          passAt: 80,
          grade: "timingNotes",
          minutes: 5,
        },
        {
          id: "two-and-three",
          title: "Two, then three",
          purpose: "A beat of two eighths, then a beat of three triplets, and again. The click stays where it is and the division changes under it.",
          howTo: [
            "Count '1 and, 2-trip-let, 3 and, 4-trip-let'. The first note of every beat is on the click whichever it is.",
            "The triplet is not faster eighths squeezed in. Slow the hand a little less than you think.",
          ],
          coach: "The first note after each change is where the time moves. I'll say how even it was.",
          ...FREE,
          vary: TWO_AND_THREE.vary,
          tab: TWO_AND_THREE.base,
          position: 1,
          harmony: E_PENT,
          rungs: ladder(50, 120, 10),
          passAt: 80,
          grade: "timingNotes",
          minutes: 5,
        },
        {
          id: "shuffle",
          title: "The shuffle",
          purpose: "A boogie line on the A and D strings in shuffle rhythm: long-short, long-short, the first and last notes of each triplet.",
          howTo: [
            "Open A string twice, then the D string at fret 2 twice, fret 4 twice, fret 2 twice. First finger on fret 2, third finger on fret 4.",
            "Down on the long note, up on the short one. The short note comes late, just before the next beat, and leads into it.",
          ],
          coach: "I time the long and the short notes against the triplet they are written on, so straight eighths will read as early.",
          ...FREE,
          tab: SHUFFLE,
          position: 2,
          harmony: { scale: ["A", "majorPentatonic"] },
          rungs: ladder(60, 130, 10),
          passAt: 90,
          grade: "timingNotes",
          minutes: 5,
        },
        {
          id: "triplet-tune",
          title: "A tune in triplets",
          purpose: "A falling A minor pentatonic phrase in triplets at the fifth fret, with a rest in the first bar and a long note at the end.",
          howTo: [
            "Two beats of triplets, a quarter note, a rest. Then two beats of triplets and a held note.",
            "Six notes in a row cross three strings. Keep the strokes strictly down-up through the crossings.",
          ],
          coach: "After the take I'll say how even it was and whether the notes were the written ones.",
          vary: inKeys(TRIPLET_TUNE, ["A", "B", "C", "D"]),
          tab: TRIPLET_TUNE,
          position: 5,
          harmony: A_PENT,
          rungs: ladder(50, 120, 10),
          passAt: 80,
          grade: "timingNotes",
          minutes: 6,
        },
      ],
    },
    {
      id: "sixteenth-syncopation",
      title: "Sixteenths with holes in them",
      goal: "Play sixteenth-note rhythms with rests on the beat and notes on the 'e' and the 'a', and keep the pulse.",
      why: "Funk, and most modern rhythm playing, is sixteenths with some of them left out. The notes that are missing matter as much as the ones that are there, and the hardest note to place is the one right after a silent beat.",
      howTo: [
        "The hand swings in sixteenths all the time, lightly, and only digs in on the written notes.",
        "Count every '1 e and a' out loud at the first rung, and say the played syllables louder.",
        "Stop each note with the fretting hand or the palm so the rests are really silent. Short notes make the rhythm clear.",
      ],
      payoff: "A two-bar funk line at the fifth fret that sits in the gaps.",
      difficultyException:
        "The rests bring the note count down. The demand is placing single sixteenths around silent beats, which a note-rate metric does not count.",
      exercises: [
        {
          id: "one-e-a",
          title: "One, e, (and), a",
          purpose: "Three of the four sixteenths, with the 'and' left out: a skipping figure on each beat, and a quarter note to finish the bar.",
          howTo: [
            "Count '1 e (and) a'. Down, up, miss, up.",
            "The hole is in the middle of the beat. Don't close it up: the 'a' comes late, just before the next beat.",
          ],
          coach: "I time each note against where it is written, so a closed-up gap shows as early notes.",
          ...FREE,
          vary: ONE_E_A.vary,
          tab: ONE_E_A.base,
          position: 1,
          harmony: E_PENT,
          rungs: ladder(40, 110, 10),
          passAt: 75,
          grade: "timingNotes",
          minutes: 5,
        },
        {
          id: "after-the-beat",
          title: "Silent on the beat",
          purpose: "A quarter note, then a beat that starts with silence and plays its 'e', 'and' and 'a'. Coming in just after the click is the skill.",
          howTo: [
            "Count '1, (2) e and a, 3, (4) e and a'. On beats 2 and 4 the downstroke plays the air and the next upstroke starts the group.",
            "Let the foot hit the floor in the hole. The first note comes straight after it.",
          ],
          coach: "The first note after each silent beat is the one I'd look at. Early means the rest was cut short.",
          ...FREE,
          vary: AFTER_THE_BEAT.vary,
          tab: AFTER_THE_BEAT.base,
          position: 1,
          harmony: E_PENT,
          rungs: ladder(40, 110, 10),
          passAt: 75,
          grade: "timingNotes",
          selfCheck: [FOOT_CHECK],
          minutes: 5,
        },
        {
          id: "dotted-eighths",
          title: "Threes across the beat",
          purpose: "Four notes, each three sixteenths long, then a quarter note. The notes drift off the beat one sixteenth at a time and the quarter brings you home.",
          howTo: [
            "Count sixteenths in threes: '1 2 3, 1 2 3, 1 2 3, 1 2 3, 1 2 3 4'. Then feel it against the foot on the click.",
            "The notes land on 1, the 'a' of 1, the 'and' of 2, and the 'e' of 3. The quarter note is on beat 4.",
          ],
          coach: "Only the first and last notes of the bar are on a beat. I'll say how even the ones between were.",
          ...FREE,
          vary: DOTTED_EIGHTHS.vary,
          tab: DOTTED_EIGHTHS.base,
          position: 1,
          harmony: E_PENT,
          rungs: ladder(50, 120, 10),
          passAt: 85,
          grade: "timingNotes",
          selfCheck: [FOOT_CHECK],
          minutes: 6,
        },
        {
          id: "funk-line",
          title: "A funk line",
          purpose: "Two bars of A minor pentatonic on the low strings at the fifth fret, mostly single sixteenths with space around them.",
          howTo: [
            "Learn it a beat at a time: '1, a', then 'e and' of 2, then '3, and', then '4 e'. Bar 2 is the same until beat 3.",
            "Play every note short. Relax the fretting finger straight after each one so it stops.",
          ],
          coach: "This is the Step's test piece. I'll say how even it was and check the notes after the take.",
          ...FREE,
          vary: inKeys(FUNK_LINE, ["A", "B", "C", "D"]),
          tab: FUNK_LINE,
          position: 5,
          harmony: A_PENT,
          rungs: ladder(50, 110, 10),
          passAt: 80,
          grade: "timingNotes",
          selfCheck: [REST_CHECK],
          minutes: 7,
        },
      ],
    },
    {
      id: "gear-changes",
      title: "Changing gear",
      goal: "Move between eighths, triplets and sixteenths inside one bar without the beat moving.",
      why: "Real lines change subdivision all the time, and the change is where players speed up or slow down. Going from two to three to four notes a beat, and back, with the first note of every beat on the click, is the best single test of time there is.",
      howTo: [
        "The beat is the only thing that stays the same. Tap it with the foot and fit two, three or four notes inside each tap.",
        "Say the counts in a row before you play: '1 and, 2-trip-let, 3 e and a, 4'.",
        "Coming down from sixteenths to triplets is the hard direction. Leave more room than feels right.",
      ],
      payoff: "The rhythm pyramid up and down in one take, and a riff that changes gear three times in two bars.",
      exercises: [
        {
          id: "gears",
          title: "Two, three, four",
          purpose: "One beat each of eighths, triplets and sixteenths, then a quarter note. Each beat has one more note than the last.",
          howTo: [
            "Count '1 and, 2-trip-let, 3 e and a, 4'.",
            "Strict down-up from the first note. The quarter note on beat 4 is your check: it lands on the click or it doesn't.",
          ],
          coach: "The quarter note on beat 4 tells me whether the three beats before it kept time. I'll say how even it was.",
          ...FREE,
          vary: GEARS.vary,
          tab: GEARS.base,
          position: 1,
          harmony: E_PENT,
          rungs: ladder(40, 110, 10),
          passAt: 75,
          grade: "timingNotes",
          minutes: 5,
        },
        {
          id: "pyramid",
          title: "The rhythm pyramid",
          purpose: "One, two, three and four notes to a beat going up, then four, three, two and one coming down. Every division you have learned, in two bars.",
          howTo: [
            "Bar 1: a quarter, two eighths, a triplet, four sixteenths. Bar 2: the same rhythm in reverse.",
            "The two beats of sixteenths meet at the bar line. Keep them the same speed on both sides of it.",
          ],
          coach: "I'll say how even each beat was. The step down from four notes to three is where it usually drags.",
          ...FREE,
          vary: PYRAMID.vary,
          tab: PYRAMID.base,
          position: 1,
          harmony: E_PENT,
          rungs: ladder(40, 110, 10),
          passAt: 75,
          grade: "timingNotes",
          minutes: 6,
        },
        {
          id: "three-over-two",
          title: "Three across two beats",
          purpose: "Two quarter notes, then three notes spread evenly over the next two beats: the quarter-note triplet. Slow, wide and easy to get wrong.",
          howTo: [
            "Count eighth-note triplets, '1-trip-let, 2-trip-let', and play every second syllable: '1, let, trip'.",
            "The three notes are equal. If the last one is short, you fell back onto the beat too soon.",
          ],
          coach: "I time the three notes against the triplet they are written on. I'll say how even they were.",
          ...FREE,
          vary: THREE_OVER_TWO.vary,
          tab: THREE_OVER_TWO.base,
          position: 1,
          harmony: E_PENT,
          rungs: ladder(60, 140, 10),
          passAt: 100,
          grade: "timingNotes",
          selfCheck: [FOOT_CHECK],
          minutes: 6,
        },
        {
          id: "gear-riff",
          title: "A riff that changes gear",
          purpose: "A two-bar A minor pentatonic phrase at the fifth fret: eighths, a beat of sixteenths, a triplet and a landing note, then the gears in another order.",
          howTo: [
            "Bar 1: '1 and, 2 e and a, 3-trip-let, 4'. Bar 2: '1-trip-let, 2 e and a, 3 and, 4'.",
            "Play it as a phrase, with the long notes as the places it is going to.",
          ],
          coach: "This is the Step's test piece. I'll say how even it was and check the notes after the take.",
          ...FREE,
          vary: inKeys(GEAR_RIFF, ["A", "B", "C", "D"]),
          tab: GEAR_RIFF,
          position: 5,
          harmony: A_PENT,
          rungs: ladder(40, 110, 10),
          passAt: 75,
          grade: "timingNotes",
          minutes: 7,
        },
      ],
    },
    {
      id: "with-the-band",
      title: "With the band",
      goal: "Hold a riff in eighths, one in sixteenths and a shuffle against a real rhythm section for four bars.",
      why: "A click tells you exactly where the beat is. A band tells you roughly, and gives you a feel to sit in. Locking a riff to a bass drum and a snare is the reason to practise rhythm at all, and it uses the ear differently from a click.",
      howTo: [
        "Listen to the bass drum and the snare, not to your own guitar. Your riff is one part of the groove.",
        "If you get lost, stop, find beat 1 of the next bar and come back in there.",
        "Use direct input or headphones for a graded take: the band reaching a microphone is something the app has not been tested against.",
      ],
      payoff: "Three riffs that sit inside a band: straight rock, sixteenth-note rock and a shuffle.",
      exercises: [
        {
          id: "band-eighths",
          title: "An eighth-note riff with the band",
          purpose: "Four bars in E minor over a rock groove, with rests on beats 2 and 3 where the snare speaks. The riff follows the chords: E, G, A and back to E.",
          howTo: [
            "Count '1 and, (2) and, (3) and 4 and'. The hand swings in eighths throughout.",
            "Each bar starts on the root of its chord: open low E, G at fret 3, the open A string, and E again.",
          ],
          coach: "Band on. I time your notes against it and check them after the take.",
          ...FREE,
          tab: BAND_EIGHTHS,
          position: 1,
          chords: "Em | G | A5 | Em",
          jam: { groove: "rock8", key: "E minor" },
          harmony: { scaleOverChords: ["E", "minorPentatonic"] },
          rungs: ladder(60, 130, 10),
          passAt: 100,
          grade: "timingNotes",
          minutes: 6,
        },
        {
          id: "band-sixteenths",
          title: "A sixteenth-note riff with the band",
          purpose: "Two bars on an E chord with the gallop on beat 1 and sixteenths with holes in them after it. The drums stay on eighths and you play inside them.",
          howTo: [
            "Bar 1: '1, and a, (2) e and, 3, and, 4 and'. Learn it at the first rung with the count.",
            "Keep every note short and let the band fill the gaps.",
          ],
          coach: "Band on. I'll say how even it was against the band and check the notes after the take.",
          ...FREE,
          tab: BAND_SIXTEENTHS,
          position: 1,
          chords: "Em | Em",
          jam: { groove: "rock8", key: "E minor" },
          harmony: E_PENT,
          rungs: ladder(50, 110, 10),
          passAt: 85,
          grade: "timingNotes",
          minutes: 7,
        },
        {
          id: "band-shuffle",
          title: "A shuffle with the band",
          purpose: "The boogie line over a blues shuffle: two bars on A, one on D, and home to A. The band swings, and your long-short has to swing with it.",
          howTo: [
            "The same shape as before on the A and D strings, then moved across to the D and G strings for the D chord.",
            "Listen to the hi-hat or the ride: it plays the same long-short you do.",
          ],
          coach: "Band on. I time your notes against the shuffle, so straight eighths will read as early.",
          ...FREE,
          tab: BAND_SHUFFLE,
          position: 2,
          chords: "A7 | A7 | D7 | A7",
          jam: { groove: "bluesTexas", key: "A blues", feel: "shuffle" },
          harmony: { scaleOverChords: ["A", "mixolydian"] },
          rungs: ladder(60, 130, 10),
          passAt: 100,
          grade: "timingNotes",
          minutes: 6,
        },
      ],
    },
  ],
  levels: [
    {
      id: "beginner",
      title: "Beginner: on the beat",
      summary: "Quarter notes, eighth notes and rests with a click: one note a beat, two notes a beat, and silence in time.",
      reachLevel: "beginner",
      startHereIf: [
        "You've never practised with a click, or you find it hard to stay with one.",
        "You can play a single note on an open string and at fret 3.",
        "Eighth notes at 80 BPM are not yet steady for a whole bar.",
      ],
      steps: ["on-the-beat", "eighths", "rests"],
      warmups: [
        {
          id: "walk-up",
          title: "A walk up one string",
          purpose: "Long, short-short, long, short-short on two notes of a minor scale, a step higher each bar. A different key and string each time.",
          howTo: ["Start well under your clean tempo. Count '1, 2 and, 3, 4 and'. First finger on the lower note, and move the hand up a note at each bar line."],
          coach: "This is a warm-up. It tells you how it went, and it decides nothing.",
          vary: {
            values: WARMUP_KEYS,
            pooled: ["key", "stringSet"],
            label: (p) => `${p.key} minor on string ${p.stringSet}`,
            build: (p) => climbFigure(p, "/4 t0 /8 t1 t1 /4 t0 /8 t1 t1", 2),
          },
          grade: "warmup",
          warmup: { start: 0.6, top: 0.8, reference: "eighths.eighth-riff", fallback: 60 },
          rungs: ladder(50, 110, 10),
          minutes: 3,
        },
      ],
    },
    {
      id: "intermediate",
      title: "Intermediate: between the beats",
      summary: "Off-beats and dotted notes, the sixteenth-note figures, and triplets with the shuffle.",
      reachLevel: "beginner",
      startHereIf: [
        "You can play steady eighth notes with a click at 85 BPM, down on the beat and up on the 'and'.",
        "You can stop for a beat and come back in on time.",
        "A note on the 'and' with nothing on the beat before it throws you off.",
      ],
      steps: ["off-beats", "sixteenths", "triplets"],
      warmups: [
        {
          id: "gallop-up",
          title: "The gallop up one string",
          purpose: "Long-short-short on three notes of a minor scale and a quarter note to land on, a step higher each bar. A different key and string each time.",
          howTo: ["Start well under your clean tempo. Count '1, and a, 2, and a, 3, and a, 4' and move the hand up a note at each bar line."],
          coach: "This is a warm-up. It tells you how it went, and it decides nothing.",
          ...FREE,
          vary: {
            values: WARMUP_KEYS,
            pooled: ["key", "stringSet"],
            label: (p) => `${p.key} minor on string ${p.stringSet}`,
            build: (p) => climbFigure(p, "/8 t0 /16 t0 t0 /8 t1 /16 t1 t1 /8 t2 /16 t2 t2 /4 t1", 3),
          },
          grade: "warmup",
          warmup: { start: 0.6, top: 0.8, reference: "sixteenths.long-short-short-16", fallback: 50 },
          rungs: ladder(40, 90, 10),
          minutes: 3,
        },
      ],
    },
    {
      id: "advanced",
      title: "Advanced: changing gear",
      summary: "Sixteenths with rests in them, changes between eighths, triplets and sixteenths, and riffs held against a band.",
      reachLevel: "early-intermediate",
      startHereIf: [
        "You can play the gallop figure, an eighth and two sixteenths, evenly at 70 BPM.",
        "You can play eighth-note triplets at 80 BPM and a shuffle.",
        "You speed up or slow down when the rhythm changes from one division to another, or you've never played with a band.",
      ],
      steps: ["sixteenth-syncopation", "gear-changes", "with-the-band"],
      warmups: [
        {
          id: "pyramid-up",
          title: "The pyramid up one string",
          purpose: "A quarter, two eighths, a triplet and four sixteenths on three notes of a minor scale, a step higher each bar. A different key and string each time.",
          howTo: ["Start well under your clean tempo. Count '1, 2 and, 3-trip-let, 4 e and a' and move the hand up a note at each bar line."],
          coach: "This is a warm-up. It tells you how it went, and it decides nothing.",
          ...FREE,
          vary: {
            values: WARMUP_KEYS,
            pooled: ["key", "stringSet"],
            label: (p) => `${p.key} minor on string ${p.stringSet}`,
            build: (p) => climbFigure(p, "/4 t0 /8 t1 t1 /8t t2 t2 t2 /16 t1 t1 t1 t1", 3),
          },
          grade: "warmup",
          warmup: { start: 0.6, top: 0.8, reference: "gear-changes.pyramid", fallback: 50 },
          rungs: ladder(40, 80, 10),
          minutes: 3,
        },
      ],
    },
  ],
});
