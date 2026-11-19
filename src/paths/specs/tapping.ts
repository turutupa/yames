/**
 * Tapping, a Mechanics Path. A draft: no teacher or guitarist has reviewed it.
 *
 * From the first tap and pull-off to sextuplets over a band. A tap is a loud
 * attack with no pick stroke, so the taps carry the timing and are what the app
 * hears most firmly; the pull-offs and hammer-ons between them cost nothing if
 * they are too quiet to catch. Everything is graded on timing, never on pitch.
 */
import { definePath } from "../spec";
import type { ExerciseSpec, VariantParams } from "../spec";
import type { PassBar } from "../format";
import { ladder, repeat, shiftFrets } from "../templates";

const even = (min: number, overBars = 4): PassBar => ({ metric: "timingEvenness", min, overBars });
const heard = (min: number, overBars = 4): PassBar => ({ metric: "notesHeard", min, overBars });
const extras = (max: number): PassBar => ({ metric: "extraNotes", max, overBars: 4 });

/** Taps are timed and counted; legato notes between them cost nothing if unheard. */
const TAPS = { grade: "timing", pass: [even(0.8), heard(0.9), extras(3)] } as const satisfies Partial<ExerciseSpec>;
/** Slow first taps: a tighter bar. */
const SLOW_TAPS = { grade: "timing", pass: [even(0.85), heard(0.9), extras(3)] } as const satisfies Partial<ExerciseSpec>;

const LOUD_CHECK = "Was the pulled-off note as loud as the tapped one?";
const NOISE_CHECK = "Between takes, stop and listen: are the strings you are not playing silent?";
const SAFETY =
  "Stop at any pain in either hand, wrist or forearm. A tired hand is one thing and pain is another; pain ends the set.";

/** Said on every Exercise whose variants move the figure: the words name the first version's frets. */
const VARIANT_NOTE =
  "The frets and note names here are for the first version. Other Takes move the same figure to another string or key.";

const STRING_OF: Readonly<Record<string, number>> = { "top E": 1, B: 2, G: 3 };

/** One figure on other strings: `"top E: 12-5-8"` is the tap, then the two fretted notes. */
function onStrings(sets: readonly string[], build: (string: number, frets: number[]) => string) {
  return {
    values: { stringSet: sets },
    pooled: ["stringSet"] as const,
    label: (p: VariantParams) => p.stringSet,
    build: (p: VariantParams) => {
      const [name, frets] = p.stringSet.split(": ");
      const numbers = frets.split("-").map(Number);
      return { tab: build(STRING_OF[name], numbers), position: Math.min(...numbers) };
    },
  };
}

const THREE_SETS = ["top E: 12-5-8", "B: 12-5-8", "G: 12-5-7"] as const;

/** tap, pull to the first finger, hammer the upper finger. */
// Fingers are printed: the first finger below, and the little finger three frets up (the third finger for two).
const cell = (s: number, [t, a, b]: number[]) => `${s}:${t}t ${s}:${a}pf1 ${s}:${b}hf${b - a >= 3 ? 4 : 3}`;
/** The same with a pull back to the first finger: four notes. */
const four = (s: number, [t, a, b]: number[]) => `${cell(s, [t, a, b])} ${s}:${a}pf1`;

const tapPull = (s: number, [t, a]: number[]) => `/8 ${repeat(`${s}:${t}t ${s}:${a}p`, 4)}`;
const triplets = (s: number, f: number[]) => `/8t ${repeat(cell(s, f), 4)}`;
const fourEighths = (s: number, f: number[]) => `/8 ${repeat(four(s, f), 2)}`;
const fourSixteenths = (s: number, f: number[]) => `/16 ${repeat(four(s, f), 4)}`;
const doubleTap = (s: number, [t, a, b]: number[]) => `/16 ${repeat(`${s}:${t}t ${s}:${a}p ${s}:${t}t ${s}:${b}p`, 4)}`;
const sextuplets = (s: number, f: number[]) => `/16t ${repeat(cell(s, f), 8)}`;
const rollDown = (s: number, [t, a, b]: number[]) => `/16 ${repeat(`${s}:${t}t ${s}:${b}p ${s}:${a}p ${s}:${b}h`, 4)}`;

/** One tapped note a beat over the same two fretted notes on the top string. */
const melody = (value: string, taps: readonly number[], lo = 5, hi = 8, per = 1) =>
  `${value} ${taps.map((t) => repeat(cell(1, [t, lo, hi]), per)).join(" ")}`;

const TAP_MELODY = melody("/8t", [12, 13, 15, 13]);
const TAP_SCALE = `${melody("/8t", [10, 12, 13, 15])} | ${melody("/8t", [17, 15, 13, 12]).slice(4)}`;
const TAP_STOP = `/8t ${repeat(cell(1, [12, 5, 8]), 2)} /4 1:12t r | /8t ${repeat(cell(1, [13, 5, 8]), 2)} /4 1:13t r`;

const AM = [12, 5, 8];
const F = [13, 5, 8];
const G = [15, 7, 10];
const E = [12, 4, 7];
const bars = (value: string, chords: readonly number[][], group: (s: number, f: number[]) => string, per: number) =>
  chords.map((f) => `${value} ${repeat(group(1, f), per)}`).join(" | ");

const AM_TO_F = bars("/8t", [AM, F], cell, 4);
const AM_F_E = bars("/8t", [AM, F, E, AM], cell, 4);
const ANDALUSIAN = bars("/8t", [AM, G, F, E], cell, 4);
const SIXTEENTH_CHANGES = bars("/16", [AM, F, G, AM], four, 4);

const TWO_STRINGS = `/8t ${repeat(`${cell(1, [12, 5, 8])} ${cell(2, [12, 5, 8])}`, 2)}`;
const THREE_STRINGS = `/8t ${cell(1, [12, 5, 8])} ${cell(2, [12, 5, 8])} ${cell(3, [12, 5, 7])} ${cell(2, [12, 5, 8])}`;
const TWO_STRINGS_16 = `/16 ${repeat(`${four(1, [12, 5, 8])} ${four(2, [12, 5, 8])}`, 2)}`;

/** A tap on top of three scale notes: tap, pull, pull, pull, hammer, hammer. */
const scaleTap = (s: number, [t, a, b, c]: number[]) => `${s}:${t}t ${s}:${c}p ${s}:${b}p ${s}:${a}p ${s}:${b}h ${s}:${c}h`;
const SCALE_TAP = `/16t ${repeat(scaleTap(1, [12, 5, 7, 8]), 4)}`;
const SCALE_TAP_MOVES = `/16t ${[12, 13, 15, 13].map((t) => scaleTap(1, [t, 5, 7, 8])).join(" ")}`;
const SCALE_TWO_STRINGS = `/16t ${repeat(`${scaleTap(1, [12, 5, 7, 8])} ${scaleTap(2, [12, 5, 6, 8])}`, 2)}`;

const FAST_MELODY = melody("/16t", [12, 13, 15, 13], 5, 8, 2);
const FAST_CHANGES = bars("/16t", [AM, F, G, AM], cell, 8);
const TWO_TAPS = `/16t ${repeat("1:12t 1:5p 1:8h 1:15t 1:8p 1:5p", 4)}`;
const SKIP_TAPS = `/16t ${repeat(`${cell(1, [12, 5, 8])} ${cell(3, [12, 5, 7])}`, 4)}`;

const ETUDE_A = ANDALUSIAN;
const ETUDE_B = [
  melody("/8t", [12, 15, 17, 15]),
  melody("/8t", [15, 17, 19, 17], 7, 10),
  melody("/8t", [13, 15, 17, 15]),
  melody("/8t", [12, 16, 19, 16], 4, 7),
].join(" | ");

/** Warm-up chords on the top string: the minor arpeggio's fifth tapped, then its octave. */
const WARM_SHIFT: Readonly<Record<string, number>> = { Gm: -2, Am: 0, Bbm: 1, Bm: 2, Cm: 3, Dm: 5 };
function warm(p: VariantParams, value: string, group: (s: number, f: number[]) => string, per: number) {
  const shift = WARM_SHIFT[p.key];
  const tab = shiftFrets(`${value} ${repeat(group(1, [12, 5, 8]), per)} | ${value} ${repeat(group(1, [17, 5, 8]), per)}`, shift);
  return { tab, position: 5 + shift, harmony: { arpeggio: p.key, cover: true } };
}
const WARM_KEYS = { key: Object.keys(WARM_SHIFT) } as const;

export default definePath({
  id: "tapping",
  title: "Tapping",
  kind: "mechanics",
  goal: "Tap an arpeggio in triplets, sixteenths and sextuplets, move it through chord changes, and hold a tapped line over a band.",
  level: "intermediate",
  assumes:
    "You can play a hammer-on and a pull-off that sound as loud as a picked note (the Beginner Level of Legato covers this), and triplets with a click at 70 BPM. An electric guitar with a little gain makes tapping easier, but every Exercise works clean. The minutes listed are one pass through the material.",
  prerequisites: { skills: ["Hammer-ons and pull-offs", "Triplets with a click at 70 BPM"] },
  labelSubdivisions: "mostly",
  paceLadders: true,
  orderRationale:
    "One tap and one pull-off first, then the three-note cell every tapping lick is built on. Moving the tap comes before moving the fretting hand, because the tapping finger is the easier of the two to aim. Sixteenths and two strings follow, then a scale under the tap, which needs the legato strength the earlier Steps build. Sextuplets and two tapped notes come last, and the band after that.",
  gradingLimits:
    "The app times the notes it hears and counts them. A tap is a loud attack and is expected to be heard; a pull-off or a hammer-on that is too quiet to catch costs nothing. So the taps carry the grade, and a pass does not prove the notes between them were even or loud: that is for your ear and a recording. Pitch is not checked on tapped lines. Heavy gain makes every note sound present whether it was or not; a light crunch is the honest setting. None of this has been tried on a real guitar yet.",
  steps: [
    {
      id: "first-taps",
      title: "The first tap",
      goal: "Tap a note with the picking hand, pull off to a fretted note, and hammer a third, in time.",
      why: "A tap is a hammer-on made by the other hand. It reaches notes the fretting hand cannot, which is how a three-note arpeggio that would need a seven-fret stretch fits on one string. The tap itself is easy; what makes it sound like music is the pull-off that follows it, and the rhythm.",
      howTo: [
        "Tap with the middle finger of the picking hand, with the pick still held between thumb and first finger. Rest the thumb or the heel of the hand on the edge of the neck to steady it.",
        "Tap straight down, just behind the fret, hard enough to sound the note. Then pull off toward the floor so the finger plucks the string as it leaves. The tab marks a tap T.",
        "The fretting hand's first finger is already down on its note before you tap, and its tip touches the string beside it to keep that quiet. The heel of the tapping hand rests on the lower strings.",
      ],
      payoff: "The three-note tapped arpeggio everybody recognises, slow and even.",
      exercises: [
        {
          id: "tap-and-pull",
          title: "Tap and pull off",
          purpose: "Two notes: tap fret 12 and pull off to the first finger at fret 5. The smallest tapping there is, and the pull-off is the half that needs work.",
          howTo: [
            "Eighth notes. The tap lands on the click and the pulled-off note on the 'and'.",
            "Keep the first finger pressed at fret 5 the whole time. Make the second note as loud as the first.",
            VARIANT_NOTE,
          ],
          coach: "The taps carry the timing. A pull-off I can't hear costs nothing, so its volume is yours to judge.",
          vary: onStrings(["top E: 12-5", "B: 12-5", "G: 12-5"], tapPull),
          tab: tapPull(1, [12, 5]),
          position: 5,
          harmony: { scale: ["A", "naturalMinor"] },
          rungs: ladder(50, 120, 10),
          passAt: 90,
          ...SLOW_TAPS,
          selfCheck: [LOUD_CHECK],
          minutes: 5,
        },
        {
          id: "tap-pull-hammer",
          title: "Tap, pull, hammer",
          purpose: "The cell: tap fret 12, pull off to 5, hammer on at 8. E, A, C: an A minor chord, one note at a time, in triplets.",
          howTo: [
            "Triplets, three to the click, with the tap on the click.",
            "First finger at fret 5, little finger hammers fret 8. As the little finger lands, the tapping finger is already on its way back down.",
            VARIANT_NOTE,
          ],
          coach: "One tap a beat is what I time most firmly. The two notes after it are for your ear: all three the same size.",
          vary: onStrings(THREE_SETS, triplets),
          tab: triplets(1, AM),
          position: 5,
          harmony: { scale: ["A", "naturalMinor"] },
          rungs: ladder(50, 120, 10),
          passAt: 85,
          ...SLOW_TAPS,
          selfCheck: [LOUD_CHECK],
          minutes: 6,
        },
        {
          id: "four-notes",
          title: "Four notes from one tap",
          purpose: "Tap, pull, hammer, pull: the cell with one more pull-off, in eighth notes. Four notes from every tap, and the string has to keep ringing to the last.",
          howTo: [
            "Eighth notes: tap 12, pull off to 5, hammer 8, pull off to 5. The tap is on beats 1 and 3.",
            "The last pull-off is the quiet one. Flick the little finger off toward the floor, don't just lift it.",
            VARIANT_NOTE,
          ],
          coach: "Two taps a bar are my anchor. The six notes between them are yours to keep even.",
          vary: onStrings(THREE_SETS, fourEighths),
          tab: fourEighths(1, AM),
          position: 5,
          harmony: { scale: ["A", "naturalMinor"] },
          rungs: ladder(50, 130, 10),
          passAt: 95,
          ...SLOW_TAPS,
          selfCheck: ["Was the fourth note of each group still clearly a note?"],
          minutes: 5,
        },
      ],
    },
    {
      id: "moving-the-tap",
      title: "Moving the tap",
      goal: "Change the tapped note from beat to beat while the fretting hand stays where it is.",
      why: "The fretting hand holds a chord's lower notes and the tap plays a melody on top of them. Aiming the tap at a new fret in time is the skill: it has one beat to get there, and the eyes have to be a fret ahead of the finger.",
      howTo: [
        "Look at the fret you are going to, not the one you are on.",
        "Move the tapping hand as a whole, with the thumb sliding along the edge of the neck. Don't reach with the finger alone.",
        "The fretting hand does not move in this Step: first finger at fret 5, little finger at fret 8.",
      ],
      payoff: "A melody in taps over a held chord, up the string and back.",
      exercises: [
        {
          id: "tap-melody",
          title: "A tune in the taps",
          purpose: "The cell with the tap moving: E, F, G, F, one a beat. The lower two notes never change, so the melody is all in the taps.",
          howTo: [
            "Triplets. Tap 12, then 13, then 15, then 13, each followed by the pull-off to 5 and the hammer-on at 8.",
            "Move the tap while the little finger hammers. It has two notes' worth of time to arrive.",
          ],
          coach: "The taps carry the timing, and I hear whether each one arrived.",
          tab: TAP_MELODY,
          position: 5,
          harmony: { scale: ["A", "naturalMinor"] },
          rungs: ladder(50, 120, 10),
          passAt: 85,
          ...TAPS,
          minutes: 6,
        },
        {
          id: "tap-scale",
          title: "A scale in the taps",
          purpose: "The tap walks up A minor from D at fret 10 to A at fret 17 and back down to E at fret 12, a note a beat, over the same two fretted notes.",
          howTo: [
            "Triplets, two bars. Taps at 10, 12, 13, 15, then 17, 15, 13, 12.",
            "The steps are not all the same size: two frets, one, two, two. Know the scale on the string before you tap it.",
          ],
          coach: "Eight taps in two bars. I time each one; where it landed is for your ear.",
          tab: TAP_SCALE,
          position: 5,
          harmony: { scale: ["A", "naturalMinor"] },
          rungs: ladder(50, 110, 10),
          passAt: 80,
          ...TAPS,
          minutes: 6,
        },
        {
          id: "tap-and-stop",
          title: "Tap, stop, start again",
          purpose: "Two cells, a single tapped note held for a beat, and a beat of silence. Starting a tapped phrase cleanly from silence is harder than keeping one going.",
          howTo: [
            "Triplets for two beats, then one tapped quarter note, then a rest. Bar 2 is the same with the tap at fret 13.",
            "In the rest, lay the tapping hand's palm on the strings. The next tap comes from just above the string, not from a distance.",
          ],
          coach: "The first tap after each rest is the one I'd look at. Early is the usual mistake.",
          tab: TAP_STOP,
          position: 5,
          harmony: { scale: ["A", "naturalMinor"] },
          rungs: ladder(50, 120, 10),
          passAt: 85,
          ...TAPS,
          selfCheck: [NOISE_CHECK],
          minutes: 5,
        },
      ],
    },
    {
      id: "changing-the-chord",
      title: "Changing the chord",
      goal: "Take the tapped cell through Am, F, G and E, moving the tap or the fretting hand at the bar line.",
      why: "Tapping became famous for this: three-note arpeggios that follow a chord progression faster than anyone could pick them. Each chord is the same motion with one or both hands moved, and the move has to happen inside the last note of the bar.",
      howTo: [
        "Am is tap 12 over frets 5 and 8. F is tap 13 over the same two frets: only the tap moves.",
        "For G the fretting hand moves up to frets 7 and 10 and the tap to 15. For E it drops to frets 4 and 7 with the tap back at 12.",
        "Move during the last hammer-on of the bar. Both hands arrive together on the next click.",
      ],
      payoff: "Am, G, F, E in tapped triplets over a band: the Spanish-sounding run every tapper plays.",
      exercises: [
        {
          id: "am-to-f",
          title: "Am to F",
          purpose: "One bar of each. The tap moves one fret, from E to F, and the chord changes under your fingers without the fretting hand doing anything.",
          howTo: [
            "Triplets, four cells a bar. Tap 12 for the Am bar, 13 for the F bar.",
            "Listen to how one moved note turns a sad chord into a brighter one.",
          ],
          coach: "The taps carry the timing. The change at the bar line is where it slips.",
          tab: AM_TO_F,
          position: 5,
          chords: "Am | F",
          harmony: { chordTones: true, cover: true },
          rungs: ladder(50, 120, 10),
          passAt: 90,
          ...TAPS,
          minutes: 5,
        },
        {
          id: "am-f-e",
          title: "Am, F, E, Am",
          purpose: "Four bars. For the E chord the fretting hand drops a fret, to 4 and 7, and the tap comes back to 12: E, G# and B.",
          howTo: [
            "Triplets. Am: 12 over 5 and 8. F: 13 over 5 and 8. E: 12 over 4 and 7. Then Am again.",
            "The fretting hand moves once down and once back. Keep the first finger and little finger the same distance apart as they slide.",
          ],
          coach: "The taps carry the timing. Listen for the first cell of each new bar.",
          tab: AM_F_E,
          position: 5,
          shifts: true,
          chords: "Am | F | E | Am",
          harmony: { chordTones: true, cover: true },
          rungs: ladder(50, 120, 10),
          passAt: 90,
          ...TAPS,
          minutes: 6,
        },
        {
          id: "andalusian",
          title: "Am, G, F, E with the band",
          purpose: "The descending progression over a band with a triplet feel: every bar moves one or both hands. G is tap 15 over frets 7 and 10.",
          howTo: [
            "Triplets, one chord a bar: Am, G, F, E, and round again.",
            "The move from Am up to G is the big one: both hands go up. Look at fret 7 before you leave.",
          ],
          coach: "Band on. The taps carry the timing; direct input or headphones is the honest way to take this.",
          tab: ANDALUSIAN,
          position: 5,
          shifts: true,
          chords: "Am | G | F | E",
          jam: { groove: "rockTwelveEight", key: "A minor" },
          harmony: { chordTones: true, cover: true },
          rungs: ladder(50, 120, 10),
          passAt: 90,
          ...TAPS,
          minutes: 7,
        },
      ],
    },
    {
      id: "sixteenths",
      title: "Sixteenths",
      goal: "Play four-note tapped figures in sixteenths, including two taps to a beat.",
      why: "Four notes to a beat changes the feel from rolling to driving, and it puts a pull-off where the tap used to come back in. The fretting hand now has to keep time for three notes out of four, the way it does in a legato roll.",
      howTo: [
        "Count '1 e and a'. The tap is the '1', and the fretting hand plays the rest.",
        "For two taps a beat, the tapping hand keeps a steady eighth-note pulse: tap, lift, tap, lift.",
        "Keep the first finger down throughout. It is the note the last pull-off of every beat lands on.",
      ],
      payoff: "A sixteenth-note tapped loop that follows the chords.",
      exercises: [
        {
          id: "four-note-loop",
          title: "The four-note loop",
          purpose: "Tap, pull, hammer, pull, four times a bar. The eighth-note figure from the first Step, twice as fast.",
          howTo: [
            "Sixteenths, with the tap on every beat: 12, 5, 8, 5.",
            "If the 'a' of each beat goes missing, the last pull-off is too gentle. Flick it.",
            VARIANT_NOTE,
          ],
          coach: "One tap a beat is what I time. The three notes after it are for your ear.",
          vary: onStrings(THREE_SETS, fourSixteenths),
          tab: fourSixteenths(1, AM),
          position: 5,
          harmony: { scale: ["A", "naturalMinor"] },
          rungs: ladder(50, 120, 10),
          passAt: 85,
          ...TAPS,
          selfCheck: [LOUD_CHECK],
          minutes: 6,
        },
        {
          id: "double-tap",
          title: "Two taps to a beat",
          purpose: "Tap, pull off to 5, tap again, pull off to 8. The tapped note rings out twice a beat, like a bell over the chord.",
          howTo: [
            "Sixteenths: 12, 5, 12, 8. The first finger stays down throughout; the little finger lifts while the first tap sounds, so that pull-off lands on 5.",
            "While the second tap sounds, the little finger goes back down on fret 8, so the second pull-off stops there.",
            VARIANT_NOTE,
          ],
          coach: "Two taps a beat give me a firm grid. I time them and count them.",
          vary: onStrings(THREE_SETS, doubleTap),
          tab: doubleTap(1, AM),
          position: 5,
          harmony: { scale: ["A", "naturalMinor"] },
          rungs: ladder(50, 120, 10),
          passAt: 85,
          ...TAPS,
          minutes: 6,
        },
        {
          id: "sixteenth-changes",
          title: "The loop through the chords",
          purpose: "The four-note loop over Am, F, G and back to Am, a bar each.",
          howTo: [
            "Sixteenths, four loops a bar. Am: 12 over 5 and 8. F: 13. G: 15 over 7 and 10. Then Am.",
            "The last note of every bar is a pull-off to the first finger. Move both hands from there.",
          ],
          coach: "The taps carry the timing. The first tap of each bar tells me whether the move was on time.",
          tab: SIXTEENTH_CHANGES,
          position: 5,
          shifts: true,
          chords: "Am | F | G | Am",
          harmony: { chordTones: true, cover: true },
          rungs: ladder(50, 110, 10),
          passAt: 80,
          ...TAPS,
          minutes: 7,
        },
      ],
    },
    {
      id: "two-strings",
      title: "Across the strings",
      goal: "Carry the tapped cell from one string to the next without a gap or a ringing string behind it.",
      why: "On one string a tapped line can only go so far. Crossing strings doubles its range, and brings the real problem of tapping with it: the string you just left is still ringing. Both hands share the muting, and it has to happen in the time of one note.",
      howTo: [
        "Each string starts with a tap, so there is always a clear attack to change string on.",
        "As the tap leaves a string, the heel of the tapping hand touches the strings below it and the fretting hand's first finger touches the ones above.",
        "Keep the fretting hand's shape ready over the next string before you get there.",
      ],
      payoff: "A tapped figure that rolls across three strings and back.",
      difficultyException:
        "The triplet figures here are slower than the sixteenths before them. The demand is the string change and the muting, which the metric counts only as a crossing.",
      exercises: [
        {
          id: "two-string-triplets",
          title: "Top string, B string",
          purpose: "The cell on the top string, then the same frets on the B string, back and forth. E, A, C then B, E, G.",
          howTo: [
            "Triplets, a tap on every beat, alternating strings.",
            "Both hands move across together. The first finger rolls from one string to the other without lifting far.",
          ],
          coach: "The taps carry the timing. Strings left ringing count as extra notes if I hear them.",
          tab: TWO_STRINGS,
          position: 5,
          harmony: { scale: ["A", "naturalMinor"] },
          rungs: ladder(50, 120, 10),
          passAt: 85,
          ...TAPS,
          selfCheck: [NOISE_CHECK],
          minutes: 6,
        },
        {
          id: "three-strings",
          title: "Three strings and back",
          purpose: "Top string, B string, G string, B string: one cell on each. On the G string the hammer-on is at fret 7.",
          howTo: [
            "Triplets, one string to a beat.",
            "The G string's cell is 12, 5, 7: the third finger hammers, not the little finger.",
          ],
          coach: "The taps carry the timing. Listen back for the string you just left.",
          tab: THREE_STRINGS,
          position: 5,
          harmony: { scale: ["A", "naturalMinor"] },
          rungs: ladder(50, 110, 10),
          passAt: 80,
          ...TAPS,
          selfCheck: [NOISE_CHECK],
          minutes: 6,
        },
        {
          id: "two-strings-sixteenths",
          title: "The loop on two strings",
          purpose: "The four-note loop on the top string, then on the B string, in sixteenths.",
          howTo: [
            "Sixteenths, one loop a beat, changing string every beat.",
            "Each loop ends on a pull-off to the first finger, which is the moment to move.",
          ],
          coach: "One tap a beat, on alternating strings, is what I time.",
          tab: TWO_STRINGS_16,
          position: 5,
          harmony: { scale: ["A", "naturalMinor"] },
          rungs: ladder(50, 110, 10),
          passAt: 80,
          ...TAPS,
          minutes: 6,
        },
      ],
    },
    {
      id: "scale-under-the-tap",
      title: "A scale under the tap",
      goal: "Play six notes from one tap: the tap, three pull-offs down a scale shape, and two hammer-ons back up.",
      why: "With three fretted notes under the tap, a tapped line stops being an arpeggio and becomes a scale run. It needs real legato strength: after the tap come five notes from the fretting hand alone, and the last hammer-on has to be loud enough to hand back to the tap.",
      howTo: [
        "Sextuplets: six to the click, with the tap on the click.",
        "Fingers 1, 3 and 4 on frets 5, 7 and 8. All three are down when you tap, so each pull-off has a note to land on.",
        "If the last two notes fade, practise the fretting hand alone: pull, pull, hammer, hammer.",
      ],
      payoff: "A fast scale figure with a high note on every beat that sounds much harder than it is.",
      exercises: [
        {
          id: "scale-tap",
          title: "Six notes from one tap",
          purpose: "Tap 12, pull off to 8, 7 and 5, hammer 7 and 8. E, C, B, A, B, C: six to the beat.",
          howTo: [
            "Sextuplets. One tap a beat; the fretting hand plays the other five notes.",
            "Lean a little on the fourth note, the A at fret 5. It is the middle of the beat and keeps the six even.",
            VARIANT_NOTE,
          ],
          coach: "One tap a beat is my anchor. On a recording, count the notes between the taps: there should be five.",
          vary: {
            values: { stringSet: ["top E: 12 over 5-7-8", "B: 12 over 5-6-8"] },
            pooled: ["stringSet"],
            label: (p) => p.stringSet,
            build: (p) =>
              p.stringSet.startsWith("top")
                ? { tab: SCALE_TAP, position: 5 }
                : { tab: `/16t ${repeat(scaleTap(2, [12, 5, 6, 8]), 4)}`, position: 5 },
          },
          tab: SCALE_TAP,
          position: 5,
          harmony: { scale: ["A", "naturalMinor"] },
          rungs: ladder(40, 90, 5),
          passAt: 60,
          ...TAPS,
          selfCheck: ["On a recording, can you hear all six notes of each beat?"],
          minutes: 7,
        },
        {
          id: "scale-tap-moves",
          title: "The tap moves over the scale",
          purpose: "The six-note figure with the tap at 12, 13, 15 and 13, a beat each.",
          howTo: [
            "Sextuplets. The fretting hand repeats the same five notes; only the tap changes.",
            "The tap has five notes to get to its next fret. Move early and wait above the string.",
          ],
          coach: "The taps carry the timing. Where each one landed is for your ear.",
          tab: SCALE_TAP_MOVES,
          position: 5,
          harmony: { scale: ["A", "naturalMinor"] },
          rungs: ladder(40, 90, 5),
          passAt: 60,
          ...TAPS,
          minutes: 7,
        },
        {
          id: "scale-two-strings",
          title: "The figure on two strings",
          purpose: "Six notes on the top string, six on the B string, where the middle finger takes fret 6 in place of the third finger's 7.",
          howTo: [
            "Sextuplets, changing string every beat. Top string: 12 over 5, 7, 8. B string: 12 over 5, 6, 8.",
            "Mute the string you leave with the first finger as it crosses.",
          ],
          coach: "One tap a beat, on alternating strings, is what I time.",
          tab: SCALE_TWO_STRINGS,
          position: 5,
          harmony: { scale: ["A", "naturalMinor"] },
          rungs: ladder(40, 85, 5),
          passAt: 55,
          ...TAPS,
          selfCheck: [NOISE_CHECK],
          minutes: 7,
        },
      ],
    },
    {
      id: "sextuplet-taps",
      title: "Sextuplets",
      goal: "Play the three-note cell twice a beat, hold it, and move it through chords at that speed.",
      why: "This is the tempo tapping is known for: two cells to every click, a stream of notes with the tap as its pulse. Nothing is new except the speed, and at speed the only things that matter are a small tapping motion and a relaxed fretting hand.",
      howTo: [
        "Six to the click, a tap on the click and another halfway through the beat.",
        "The tapping finger stays within a centimetre of the string. Big motions are what make it late.",
        "Start two rungs under the tempo you could play for one bar. This is about holding it.",
      ],
      payoff: "The sound of tapping at full speed, through Am, F and G.",
      exercises: [
        {
          id: "fast-cell",
          title: "The cell, twice a beat",
          purpose: "Tap, pull, hammer in sextuplets: eight cells a bar on one string.",
          howTo: [
            "Sextuplets. Feel the first tap of each beat a little stronger than the second.",
            "If the hand tightens, drop a rung. Speed comes from the motion getting smaller.",
            VARIANT_NOTE,
          ],
          coach: "Two taps a beat give me a firm grid. Above the middle rungs, evenness is the number to trust.",
          vary: onStrings(THREE_SETS, sextuplets),
          tab: sextuplets(1, AM),
          position: 5,
          harmony: { scale: ["A", "naturalMinor"] },
          rungs: ladder(40, 100, 5),
          passAt: 70,
          ...TAPS,
          selfCheck: [LOUD_CHECK],
          minutes: 6,
        },
        {
          id: "fast-melody",
          title: "A tune in fast taps",
          purpose: "Two cells on each tapped note: E, F, G, F, a beat each, in sextuplets.",
          howTo: [
            "Sextuplets. The tap moves once a beat, on the click.",
            "Move the tap during the last hammer-on of the beat. There is less time than there was in triplets.",
          ],
          coach: "The taps carry the timing. The first tap after each move is the one that goes late.",
          tab: FAST_MELODY,
          position: 5,
          harmony: { scale: ["A", "naturalMinor"] },
          rungs: ladder(40, 100, 5),
          passAt: 70,
          ...TAPS,
          minutes: 6,
        },
        {
          id: "fast-changes",
          title: "Am, F and G in sextuplets",
          purpose: "Am, F, G, Am, eight cells a bar. The same moves as before with a sixth of a beat to make them in.",
          howTo: [
            "Sextuplets, one chord a bar.",
            "Both hands leave for the G chord together, on the last note of the F bar.",
          ],
          coach: "The taps carry the timing. Record it: at this speed your ear in the moment is not a fair judge.",
          tab: FAST_CHANGES,
          position: 5,
          shifts: true,
          chords: "Am | F | G | Am",
          harmony: { chordTones: true, cover: true },
          rungs: ladder(40, 90, 5),
          passAt: 65,
          ...TAPS,
          minutes: 7,
        },
      ],
    },
    {
      id: "two-taps-and-skips",
      title: "Two tapped notes, and string skips",
      goal: "Tap two different notes in one figure, skip a string between cells, and roll the cell from the top down.",
      why: "Three more shapes that turn the basic cell into phrases: a second tapped note makes a four-note chord out of one string, a skipped string makes a wide arpeggio, and starting the cell with the pull-off to the upper finger turns the pattern around.",
      howTo: [
        "For two taps, the tapping hand rocks between frets 12 and 15: one tap from the middle finger at each, or the middle and ring fingers.",
        "On a string skip, the tapping hand jumps over a string. Keep the heel of the hand on the string in between.",
        "Tap, pull to the upper finger, pull to the first finger, hammer the upper finger: the cell from the top down.",
      ],
      payoff: "A six-note figure with two tapped notes that spells an A minor seventh chord.",
      exercises: [
        {
          id: "two-taps",
          title: "Two tapped notes",
          purpose: "Tap 12, pull to 5, hammer 8, tap 15, pull to 8, pull to 5. E, A, C, G, C, A: six notes, two of them tapped.",
          howTo: [
            "Sextuplets. The first tap is on the click and the second halfway through the beat.",
            "After the tap at 15, both fretting fingers are still down: pull to the little finger, then to the first.",
          ],
          coach: "Two taps a beat, at two frets, are what I time.",
          tab: TWO_TAPS,
          position: 5,
          harmony: { scale: ["A", "naturalMinor"] },
          rungs: ladder(40, 90, 5),
          passAt: 70,
          ...TAPS,
          minutes: 7,
        },
        {
          id: "skip-taps",
          title: "Skipping a string",
          purpose: "The cell on the top string, then on the G string, skipping the B string: E, A, C, then G, C, D.",
          howTo: [
            "Sextuplets, changing string every half beat.",
            "Rest a spare fretting finger on the B string so it can't ring when both hands jump over it.",
          ],
          coach: "The taps carry the timing. A ringing B string will show up as extra notes.",
          tab: SKIP_TAPS,
          position: 5,
          harmony: { scale: ["A", "naturalMinor"] },
          rungs: ladder(40, 90, 5),
          passAt: 65,
          ...TAPS,
          selfCheck: [NOISE_CHECK],
          minutes: 7,
        },
        {
          id: "roll-down",
          title: "The cell from the top down",
          purpose: "Tap 12, pull off to 8, pull off to 5, hammer 8, in sixteenths. The same three notes as the four-note loop, with the little finger's note played twice.",
          howTo: [
            "Sixteenths, a tap on every beat: 12, 8, 5, 8.",
            "Both fretting fingers are down when you tap. The first pull-off lands on the little finger.",
            VARIANT_NOTE,
          ],
          coach: "One tap a beat is what I time. The three notes after it are for your ear.",
          vary: onStrings(THREE_SETS, rollDown),
          tab: rollDown(1, AM),
          position: 5,
          harmony: { scale: ["A", "naturalMinor"] },
          rungs: ladder(50, 130, 10),
          passAt: 100,
          ...TAPS,
          minutes: 6,
        },
      ],
    },
    {
      id: "over-the-band",
      title: "A tapped solo, and a full minute",
      goal: "Play two four-bar tapped lines over a band, the chords and then a melody over them, and keep the cell going for sixty seconds.",
      why: "A tapping lick is two beats; a tapped solo section is bars long, with the chords moving under it. This Step joins the pieces: the progression, then a melody in the taps over the same chords. And a minute of the plain cell shows whether the motion is relaxed enough to last.",
      howTo: [
        "Learn the chords first, then the melody over the same chords.",
        "For the minute, choose a rung about 20% below your clean tempo. It should feel slow for the first ten seconds.",
        SAFETY,
      ],
      payoff: "Four bars of chords and four of melody in taps over a band: the two halves of a solo section.",
      difficultyException:
        "Triplets again, slower than the sextuplets before: eight bars with a chord change every bar, and a full minute, are the demand, and a note-rate metric does not count length.",
      exercises: [
        {
          id: "etude-chords",
          title: "Four bars: the chords",
          purpose: "Am, G, F, E in tapped triplets with the band, the tap on the fifth or the root of each chord.",
          howTo: [
            "Triplets, four cells a bar.",
            "This is the progression from the Beginner Level. Play it until the moves need no thought.",
          ],
          coach: "Band on. The taps carry the timing.",
          tab: ETUDE_A,
          position: 5,
          shifts: true,
          chords: "Am | G | F | E",
          jam: { groove: "rockTwelveEight", key: "A minor" },
          harmony: { chordTones: true, cover: true },
          rungs: ladder(60, 130, 10),
          passAt: 100,
          ...TAPS,
          minutes: 6,
        },
        {
          id: "etude-melody",
          title: "Four bars: a melody in the taps",
          purpose: "The same four chords with the tap moving every beat, so the taps play a tune over each chord: E, G, A, G over Am, and on down.",
          howTo: [
            "Triplets, one tapped note a beat. Am: taps at 12, 15, 17, 15. G: 15, 17, 19, 17 over frets 7 and 10. F: 13, 15, 17, 15. E: 12, 16, 19, 16 over frets 4 and 7.",
            "The first tap of every bar is a note of its chord. The others are the scale around it.",
          ],
          coach: "Band on. Sixteen taps in four bars; I time each one.",
          tab: ETUDE_B,
          position: 5,
          shifts: true,
          chords: "Am | G | F | E",
          jam: { groove: "rockTwelveEight", key: "A minor" },
          harmony: { scaleOverChords: ["A", "naturalMinor"], allowed: ["G#"] },
          rungs: ladder(60, 120, 10),
          passAt: 90,
          ...TAPS,
          minutes: 7,
        },
        {
          id: "tap-minute",
          title: "One minute of the cell",
          purpose: "Tap, pull, hammer in triplets for sixty seconds without stopping. The pull-offs have to be as loud in the last bar as in the first.",
          howTo: [
            "Triplets, one tap a beat. Breathe, and let both shoulders drop.",
            "If the tapping finger or the forearm starts to burn, that is the set done.",
            VARIANT_NOTE,
          ],
          coach: "I check that the time holds to the end of the minute. Whether the volume held is for your ear.",
          vary: onStrings(THREE_SETS, triplets),
          tab: triplets(1, AM),
          position: 5,
          holdSeconds: 60,
          harmony: { scale: ["A", "naturalMinor"] },
          rungs: ladder(60, 120, 10),
          passAt: 90,
          grade: "stamina",
          selfCheck: ["Were the pull-offs in the last ten seconds as loud as in the first ten?"],
          minutes: 4,
        },
      ],
    },
  ],
  levels: [
    {
      id: "beginner",
      title: "Beginner: one tap, one chord at a time",
      summary: "The tap and the pull-off, the three-note cell, a melody in the taps, and the cell through four chords.",
      reachLevel: "early-intermediate",
      startHereIf: [
        "You can hammer on and pull off between frets 5 and 8 so both notes sound.",
        "You can play triplets with a click at 70 BPM.",
        "You've never tapped, or your taps sound and the notes after them don't.",
      ],
      steps: ["first-taps", "moving-the-tap", "changing-the-chord"],
      warmups: [
        {
          id: "cell-around",
          title: "The cell, on a new chord",
          purpose: "The tapped cell on a minor chord, a bar with the fifth tapped and a bar with the octave. A different chord each time.",
          howTo: ["Start well under your clean tempo. Triplets, one tap a beat. The tap moves up five frets at the bar line; the fretting hand stays."],
          coach: "This is a warm-up. It tells you how it went, and it decides nothing.",
          vary: {
            values: WARM_KEYS,
            pooled: ["key"],
            label: (p) => p.key,
            build: (p) => warm(p, "/8t", cell, 4),
          },
          grade: "warmup",
          warmup: { start: 0.6, top: 0.8, reference: "first-taps.tap-pull-hammer", fallback: 60 },
          rungs: ladder(50, 110, 10),
          minutes: 3,
        },
      ],
    },
    {
      id: "intermediate",
      title: "Intermediate: sixteenths, strings and scales",
      summary: "Four-note loops and two taps a beat, the cell across three strings, and a scale shape under the tap.",
      reachLevel: "intermediate",
      startHereIf: [
        "You can play tap, pull, hammer in triplets at 85 BPM with all three notes the same size.",
        "You can move the cell through Am, F and E without stopping.",
        "Your tapping only works on one string, or only in triplets.",
      ],
      steps: ["sixteenths", "two-strings", "scale-under-the-tap"],
      warmups: [
        {
          id: "loop-around",
          title: "The four-note loop, on a new chord",
          purpose: "Tap, pull, hammer, pull in sixteenths on a minor chord, a bar with the fifth tapped and a bar with the octave. A different chord each time.",
          howTo: ["Start well under your clean tempo. One tap a beat. The tap moves up five frets at the bar line; the fretting hand stays."],
          coach: "This is a warm-up. It tells you how it went, and it decides nothing.",
          vary: {
            values: WARM_KEYS,
            pooled: ["key"],
            label: (p) => p.key,
            build: (p) => warm(p, "/16", four, 4),
          },
          grade: "warmup",
          warmup: { start: 0.6, top: 0.8, reference: "sixteenths.four-note-loop", fallback: 50 },
          rungs: ladder(40, 100, 10),
          minutes: 3,
        },
      ],
    },
    {
      id: "advanced",
      title: "Advanced: speed, two taps and a band",
      summary: "The cell in sextuplets, two tapped notes and string skips, then four-bar tapped lines over a band and a full minute.",
      reachLevel: "intermediate",
      startHereIf: [
        "You can play the four-note loop in sixteenths at 85 BPM.",
        "You can play six notes from one tap at 60 BPM and hear all six.",
        "You can tap a lick, and not yet 4 bars of one over chords.",
      ],
      steps: ["sextuplet-taps", "two-taps-and-skips", "over-the-band"],
      warmups: [
        {
          id: "fast-around",
          title: "The cell twice a beat, on a new chord",
          purpose: "Tap, pull, hammer in sextuplets on a minor chord, a bar with the fifth tapped and a bar with the octave. A different chord each time.",
          howTo: ["Start well under your clean tempo. Two taps a beat. The tap moves up five frets at the bar line; the fretting hand stays."],
          coach: "This is a warm-up. It tells you how it went, and it decides nothing.",
          vary: {
            values: WARM_KEYS,
            pooled: ["key"],
            label: (p) => p.key,
            build: (p) => warm(p, "/16t", cell, 8),
          },
          grade: "warmup",
          warmup: { start: 0.6, top: 0.8, reference: "sextuplet-taps.fast-cell", fallback: 45 },
          rungs: ladder(40, 80, 5),
          minutes: 3,
        },
      ],
    },
  ],
});
