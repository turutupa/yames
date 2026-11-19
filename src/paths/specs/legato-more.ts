/**
 * Legato: consolidation Steps (2026-11-19). Drafts, like the Path they belong to.
 *
 * The Path meets several ideas once and moves on. These three Steps add nothing
 * new; each takes an idea the Path already taught somewhere else:
 *
 * - three notes per string, in the next two shapes of the same scale and from
 *   one shape into the other;
 * - hammer-ons from nowhere, in the pentatonic box, going up and coming down;
 * - the line over the band, as phrases with long notes and rests in a second key.
 *
 * Every id is new, so nobody's progress moves. Every line is original.
 * The small helpers are copies of the ones in `legato.ts`: importing them from
 * there would be a circular import.
 */
import type { StepSpec, VariantParams } from "../spec";
import type { PassBar } from "../format";
import { handAt, ladder, moveChart, repeat, shiftFrets } from "../templates";

const even = (min: number, overBars = 4): PassBar => ({ metric: "timingEvenness", min, overBars });
const heard = (min: number, overBars = 4): PassBar => ({ metric: "notesHeard", min, overBars });
const extras = (max: number): PassBar => ({ metric: "extraNotes", max, overBars: 4 });
const right = (min: number): PassBar => ({ metric: "noteIdentity", min, overBars: 4 });

/** Faster legato: only the picked notes can be missed. */
const LEGATO = [even(0.8), heard(0.9), extras(3), right(0.85)];
/** Hammers from nowhere are soft like any hammer: an unheard one costs nothing. */
const NOWHERE = [even(0.8), heard(0.85), extras(3), right(0.85)];

const SAME_BAR_CHECK = "Did the legato bar keep the picked bar's rhythm, with no note rushing in early?";
const NOISE_CHECK = "Between takes, stop and listen: are the strings you are not playing silent?";

/** Said on every Exercise whose variants move the figure: the words name the first version's frets. */
const VARIANT_NOTE =
  "The frets and note names here are for the first version. Other Takes move the same figure to another string or key.";

/** Semitones from A minor. */
const KEY_SHIFT: Readonly<Record<string, number>> = { A: 0, B: 2, C: 3, D: 5, E: 7, G: -2 };

/** A legato bar with its hammers and pulls taken off: the picked twin. */
const picked = (bar: string) => bar.replace(/(\d:\d+)[hp]/g, "$1");

/** The same tab in other minor keys. Key doesn't change how hard it is. */
function inKeys(tab: string, keys: readonly string[], scale = "naturalMinor", shifts = false) {
  return {
    values: { key: keys },
    pooled: ["key"] as const,
    label: (p: VariantParams) => `${p.key} minor`,
    build: (p: VariantParams) => {
      const moved = shiftFrets(tab, KEY_SHIFT[p.key]);
      return {
        tab: moved,
        position: handAt(moved),
        ...(shifts ? { shifts: true } : {}),
        harmony: { scale: [p.key, scale] as [string, string] },
      };
    },
  };
}

// --- Intermediate: three notes per string, the next two shapes ---------------------
// A minor. The second shape starts on B (low E string, fret 7), the third on C (fret 8).

// Fingers 1, 2, 4 on the low E and A strings, 1, 3, 4 on the D and G strings.
const SHAPE_TWO_LOW = "6:7f1 6:8hf2 6:10hf4 5:7f1 5:8hf2 5:10hf4 4:7f1 4:9hf3 4:10hf4";
const SHAPE_TWO_UP = `${SHAPE_TWO_LOW} 3:7f1 3:9hf3 3:10hf4`;
const SHAPE_TWO = `/8t ${SHAPE_TWO_UP} | 3:10f4 3:9pf3 3:7pf1 4:10f4 4:9pf3 4:7pf1 5:10f4 5:8pf2 5:7pf1 6:10f4 6:8pf2 6:10hf4`;

// Fingers 1, 2, 4 on every string: the first finger comes in a fret for the D and G strings.
const SHAPE_THREE_DOWN = "3:12f4 3:10pf2 3:9pf1 4:12f4 4:10pf2 4:9pf1 5:12f4 5:10pf2 5:8pf1";
const SHAPE_THREE = `/8t 6:8f1 6:10hf2 6:12hf4 5:8f1 5:10hf2 5:12hf4 4:9f1 4:10hf2 4:12hf4 3:9f1 3:10hf2 3:12hf4 | ${SHAPE_THREE_DOWN} 6:12f4 6:10pf2 6:12hf4`;

// The D and G strings in the second shape, then in the third, and back.
const TWO_SHAPES_SHIFT = `/8t 4:7f1 4:9hf3 4:10hf4 3:7f1 3:9hf3 3:10hf4 4:9f1 4:10hf2 4:12hf4 3:9f1 3:10hf2 3:12hf4 | 3:12f4 3:10pf2 3:9pf1 4:12f4 4:10pf2 4:9pf1 3:10f4 3:9pf3 3:7pf1 4:10f4 4:9pf3 4:10hf4`;

// Up the second shape and onto the third at the G string, down the third: the first finger leads up at beat 4 and steps back at the bottom.
const TWO_SHAPES_ROUND = `/8t ${SHAPE_TWO_LOW} 3:9f1 3:10hf2 3:12hf4 | ${SHAPE_THREE_DOWN} 6:12f4 6:10pf2 6:8pf1`;

/** Intermediate, after `three-per-string`: the same scale in its next two shapes. */
export const THREE_PER_STRING_SHAPES: StepSpec = {
  id: "three-per-string-shapes",
  title: "Three per string, two more shapes",
  goal: "Play A minor three notes per string from its second note and from its third, up with hammer-ons and down with pull-offs, and go from one shape into the other inside a line.",
  why: "The Step before taught one three-per-string shape, the one that starts on the scale's first note: B minor from fret 7. Two frets lower, from fret 5, that shape is A minor. This Step stays in A minor and starts it from its next note along the low E string, B at fret 7, and from the one after that, C at fret 8. Each start gives the fingers a different pattern for the same seven notes. The motion is the one you know: pick, legato, legato on every string. What is added is a second and a third pattern for the hand to remember, and leaving one pattern for the other without stopping.",
  howTo: [
    "Triplets, as in the Step before: each string is one beat, and the pick lands on every beat.",
    "The second shape starts on fret 7 of the low E string. Low E and A strings: frets 7, 8, 10 with fingers 1, 2, 4. D and G strings: frets 7, 9, 10 with fingers 1, 3, 4. Nothing in it is wider than one finger per fret.",
    "The third shape starts on fret 8. Low E and A strings: frets 8, 10, 12 with fingers 1, 2, 4, the stretch between the first and second fingers. D and G strings: frets 9, 10, 12 with the same fingers, the first finger one fret closer.",
    "Where the hand goes from one shape to the other, it moves on a picked note. Don't force a stretch that hurts; let the hand move a little with it.",
  ],
  payoff: "Two more shapes of the scale under the fingers, and a line that climbs out of one of them and comes down the other.",
  exercises: [
    {
      id: "shape-two",
      title: "The second shape, up and back",
      purpose: "A minor from B, its second note: four strings up with hammer-ons and back down with pull-offs, one pick a string. The whole shape fits four frets, one finger each.",
      howTo: [
        "Triplets. Bar 1 climbs: low E and A strings 7, 8, 10, then D and G strings 7, 9, 10. Bar 2 comes down with pull-offs: G and D strings 10, 9, 7, A string 10, 8, 7, then low E string 10, 8 and a hammer-on back to 10.",
        "On the low E and A strings use fingers 1, 2, 4, and on the D and G strings fingers 1, 3, 4. At the top you hammer onto the G string's fret 10 and then pick it again: keep the little finger down across the bar line.",
        VARIANT_NOTE,
      ],
      coach: "A picked note on every beat is what gets timed. The notes are checked after the take.",
      vary: inKeys(SHAPE_TWO, ["A", "G", "B", "C"]),
      tab: SHAPE_TWO,
      position: 7,
      harmony: { scale: ["A", "naturalMinor"], cover: true },
      rungs: ladder(60, 140, 10),
      passAt: 110,
      grade: "timingNotes",
      pass: LEGATO,
      selfCheck: ["Was the third note on each string as loud as the picked one?"],
      minutes: 6,
    },
    {
      id: "shape-three",
      title: "The third shape, up and back",
      purpose: "A minor from C, its third note. The low E and A strings take a stretch, frets 8, 10, 12, and the first finger comes in one fret for the D and G strings.",
      howTo: [
        "Triplets. Bar 1 climbs: low E and A strings 8, 10, 12, then D and G strings 9, 10, 12. Bar 2 comes down with pull-offs: G and D strings 12, 10, 9, A string 12, 10, 8, then low E string 12, 10 and a hammer-on back to 12.",
        "Fingers 1, 2, 4 on every string. The second and little fingers stay over frets 10 and 12 all the way; only the first finger moves, back to fret 8 for the low E and A strings and in to fret 9 for the D and G strings.",
        VARIANT_NOTE,
      ],
      coach: "A picked note on every beat is what gets timed. A pull-off too quiet to hear costs nothing, so its volume is yours to judge.",
      vary: inKeys(SHAPE_THREE, ["A", "B", "C"]),
      tab: SHAPE_THREE,
      position: 8,
      harmony: { scale: ["A", "naturalMinor"], cover: true },
      rungs: ladder(60, 140, 10),
      passAt: 110,
      grade: "timingNotes",
      pass: LEGATO,
      selfCheck: ["On the low E and A strings, was the little finger's hammer-on at the end of the stretch as loud as the note before it?"],
      minutes: 6,
    },
    {
      id: "two-shapes-shift",
      title: "Two strings, two shapes",
      purpose: "The D and G strings in the second shape, then the same two strings in the third shape, and back down. The hand changes shape in the middle of each bar, on a picked note.",
      howTo: [
        "Triplets, a pick on each string. Bar 1: D string 7, 9, 10 and G string 7, 9, 10, then D string 9, 10, 12 and G string 9, 10, 12. Bar 2: G string 12, 10, 9 and D string 12, 10, 9, then G string 10, 9, 7 and D string 10, 9 and a hammer-on back to 10.",
        "Going up, the first finger moves from fret 7 to fret 9 for the picked note on beat 3, and the fingers change from 1, 3, 4 to 1, 2, 4. Coming down, the little finger leads: on beat 3 of bar 2 it takes the G string's fret 10, a picked note, with the hand two frets lower.",
        VARIANT_NOTE,
      ],
      coach: "The shifts are where the time usually moves. Evenness and right notes after the take.",
      vary: inKeys(TWO_SHAPES_SHIFT, ["A", "G", "B", "C"], "naturalMinor", true),
      tab: TWO_SHAPES_SHIFT,
      position: 7,
      shifts: true,
      harmony: { scale: ["A", "naturalMinor"] },
      rungs: ladder(60, 130, 10),
      passAt: 100,
      grade: "timingNotes",
      pass: LEGATO,
      selfCheck: ["Did beat 3 of each bar arrive in time, or did the shift make it late?"],
      minutes: 6,
    },
    {
      id: "two-shapes-round",
      title: "Two shapes in one line",
      purpose: "Up the second shape, onto the third at the G string, and down four strings in the third, one pick a string. The hand changes shape near the top and again at the bottom, both times on a picked note.",
      howTo: [
        "Triplets. Bar 1 climbs the second shape on the low E, A and D strings and the third shape on the G string: the first finger moves from fret 7 to fret 9 for the picked note on beat 4. Bar 2 picks the G string's fret 12 again and comes down the third shape to the low E string's fret 8.",
        "In bar 1 the D string takes fingers 1, 3, 4 and the G string fingers 1, 2, 4. When the line comes round again, the first finger steps back from fret 8 to fret 7 on the low E string.",
        VARIANT_NOTE,
      ],
      coach: "This is the Step's test piece. Evenness and right notes after the take.",
      vary: inKeys(TWO_SHAPES_ROUND, ["A", "B", "C"], "naturalMinor", true),
      tab: TWO_SHAPES_ROUND,
      position: 7,
      shifts: true,
      harmony: { scale: ["A", "naturalMinor"], cover: true },
      rungs: ladder(60, 130, 10),
      passAt: 100,
      grade: "timingNotes",
      pass: LEGATO,
      minutes: 6,
    },
  ],
};

// --- Advanced: hammer-ons from nowhere in the pentatonic box -----------------------

// Printed fingers: the first finger on fret 5, the third on the frets at 7, the little finger on the frets at 8.
const BOX_UP = "6:5f1 6:8hf4 5:5f1 5:7hf3 4:5f1 4:7hf3 3:5f1 3:7hf3 2:5f1 2:8hf4 1:5f1 1:8hf4";
const BOX_DOWN = "1:8f4 1:5pf1 2:8f4 2:5pf1 3:7f3 3:5pf1 4:7f3 4:5pf1 5:7f3 5:5pf1 6:8f4 6:5pf1";
/** One pick: the first finger starts every string after the first from the air. */
const BOX_UP_NOWHERE = "6:5f1 6:8hf4 5:5hf1 5:7hf3 4:5hf1 4:7hf3 3:5hf1 3:7hf3 2:5hf1 2:8hf4 1:5hf1 1:8hf4";
/** One pick: after each pull-off, the upper finger starts the next string from the air. */
const BOX_DOWN_NOWHERE = "1:8f4 1:5pf1 2:8hf4 2:5pf1 3:7hf3 3:5pf1 4:7hf3 4:5pf1 5:7hf3 5:5pf1 6:8hf4 6:5pf1";

const NOWHERE_BOX_TWO = `/16 ${repeat("4:5f1 4:7hf3 3:5hf1 3:7hf3", 4)} | ${repeat("3:7f3 3:5pf1 4:7hf3 4:5pf1", 3)} /4 5:7f3`;
const NOWHERE_BOX_UP = `/16 ${picked(BOX_UP)} hold | ${BOX_UP_NOWHERE} hold`;
const NOWHERE_BOX_DOWN = `/16 ${picked(BOX_DOWN)} hold | ${BOX_DOWN_NOWHERE} hold`;
/** Up six strings from one pick, down six from a second, and a picked A to land on. */
const NOWHERE_BOX_BOTH = `/16 ${BOX_UP_NOWHERE} 1:8f4 1:5pf1 2:8hf4 2:5pf1 | 3:7hf3 3:5pf1 4:7hf3 4:5pf1 5:7hf3 5:5pf1 6:8hf4 6:5pf1 /2 4:7f3`;
/** Four strings down and back in one bar, one pick. */
const NOWHERE_BOX_ROUND =
  "/16 1:8f4 1:5pf1 2:8hf4 2:5pf1 3:7hf3 3:5pf1 4:7hf3 4:5pf1 4:7hf3 3:5hf1 3:7hf3 2:5hf1 2:8hf4 1:5hf1 1:8hf4 1:5pf1";

const BOX_KEYS = ["A", "C", "D", "E"] as const;

/** Advanced, after `from-nowhere`: the same motion two notes a string, up and down. */
export const NOWHERE_BOX: StepSpec = {
  id: "nowhere-box",
  title: "From nowhere in the box",
  goal: "Change string in the pentatonic box without the pick, going up and coming down, until one stroke carries a run across all six strings.",
  why: "In the Step before, a hammer-on from nowhere had two more notes on its string to follow it. The box has two notes a string, so in a run every second note is a hammer-on from nowhere. Coming down is the other half of the skill: after each pull-off, the upper finger of the next string lands from the air, and the first finger has to land behind it at the same moment, ready for the next pull-off.",
  howTo: [
    "Sixteenths: two strings to each beat.",
    "Going up, the first finger hammers the lower note of each new string from the air, and the third or little finger hammers the upper note in the usual way.",
    "Coming down, the upper note of the new string is the one from nowhere, played by the third or little finger. Put the first finger down on the same string at the same moment, so the pull-off has a note to land on.",
    "Mute the strings you are not playing with the side of the picking hand, as in the rolls.",
  ],
  payoff: "The box up six strings and down six strings from one pick stroke each, and a line that falls four strings and climbs back without the pick coming in again.",
  difficultyException:
    "Two notes a string in sixteenths are fewer notes a second than the sextuplets of the Step before, so the metric falls. It does not count that every second note of a run is now a hammer-on from nowhere, where the Step before had one in three.",
  exercises: [
    {
      id: "nowhere-box-two",
      title: "Two strings of the box, one pick a beat",
      purpose: "Four notes on the D and G strings from one pick. Bar 1 goes up and the G string starts with the first finger from nowhere; bar 2 comes down and the D string starts with the third finger from nowhere.",
      howTo: [
        "Sixteenths, a pick on each beat. Bar 1: D string 5, hammer 7, then G string 5 and 7, both hammered, four times. Bar 2: G string 7, pull off to 5, then D string 7 hammered from the air and pulled off to 5, three times, and a picked fret 7 on the A string to land on.",
        "In bar 2 the first finger lands on the D string's fret 5 together with the third finger on 7. If it arrives late, the pull-off has nothing to sound.",
        VARIANT_NOTE,
      ],
      coach: "The picked note on each beat is the anchor. A hammer-on from nowhere too quiet to hear costs nothing, so your ear decides whether it spoke.",
      vary: inKeys(NOWHERE_BOX_TWO, BOX_KEYS, "minorPentatonic"),
      tab: NOWHERE_BOX_TWO,
      position: 5,
      harmony: { scale: ["A", "minorPentatonic"] },
      rungs: ladder(50, 110, 5),
      passAt: 90,
      grade: "timingNotes",
      pass: NOWHERE,
      selfCheck: ["Was the first note on each new string as loud as the picked note of the beat?"],
      minutes: 6,
    },
    {
      id: "nowhere-box-up",
      title: "Up the box on one pick",
      purpose: "All six strings of A minor pentatonic, twelve notes, the last one held. Bar 1 picked; bar 2 picks the low E string's first note and hammers everything else, five strings from nowhere.",
      howTo: [
        "Sixteenths. Bar 1: alternate-pick the box from the low E string to the top and hold the last note. Bar 2: pick fret 5 on the low E string and nothing else.",
        "The first finger hammers fret 5 of each new string from the air; the third finger hammers the frets at 7 and the little finger the frets at 8. As the first finger lands, let the finger on the string before it relax, so that string stops.",
        VARIANT_NOTE,
      ],
      coach: "One picked note is all the timing can hold firmly in bar 2. The rest is yours to hear: twelve notes, all present.",
      vary: inKeys(NOWHERE_BOX_UP, BOX_KEYS, "minorPentatonic"),
      tab: NOWHERE_BOX_UP,
      loops: false,
      position: 5,
      harmony: { scale: ["A", "minorPentatonic"], cover: true },
      rungs: ladder(50, 110, 5),
      passAt: 80,
      grade: "timingNotes",
      pass: NOWHERE,
      selfCheck: ["Were the hammer-ons from nowhere as loud as the picked first note?", SAME_BAR_CHECK],
      minutes: 6,
    },
    {
      id: "nowhere-box-down",
      title: "Down the box on one pick",
      purpose: "The same twelve notes coming down. Bar 1 picked; bar 2 picks the top string's first note, and after every pull-off the next string starts from nowhere.",
      howTo: [
        "Sixteenths. Bar 1 picked. Bar 2: pick fret 8 on the top string and pull off to 5. Then B string 8, G string 7, D string 7, A string 7 and low E string 8, each hammered from the air and pulled off to fret 5.",
        "The little finger lands the frets at 8 and the third finger the frets at 7, with the first finger arriving on fret 5 of the same string at the same moment. Both fingers land together; only the upper one sounds.",
        VARIANT_NOTE,
      ],
      coach: "One picked note is all the timing can hold firmly in bar 2. A pull-off too quiet to hear costs nothing, so its volume is yours to judge.",
      vary: inKeys(NOWHERE_BOX_DOWN, BOX_KEYS, "minorPentatonic"),
      tab: NOWHERE_BOX_DOWN,
      loops: false,
      position: 5,
      harmony: { scale: ["A", "minorPentatonic"], cover: true },
      rungs: ladder(50, 110, 5),
      passAt: 80,
      grade: "timingNotes",
      pass: NOWHERE,
      selfCheck: ["Did each new string start as loud as the picked first note?", SAME_BAR_CHECK],
      minutes: 6,
    },
    {
      id: "nowhere-box-both",
      title: "Up and down the whole box",
      purpose: "No picked bar this time: up the six strings from one pick, straight back down from a second, and a long A to land on. The first finger starts every string on the way up, the third or little finger on the way down.",
      howTo: [
        "Sixteenths. Pick the low E string's fret 5 and hammer all the way up. At the top you hammer onto the top string's fret 8, then pick it again and come down with a pull-off on every string.",
        "The descent starts on beat 4 of bar 1 and crosses the bar line. The last note is a picked fret 7 on the D string, held for two beats.",
        VARIANT_NOTE,
      ],
      coach: "Three picked notes in two bars are all the timing can hold firmly. The rest is yours to hear: every string starting as loud as the one before.",
      vary: inKeys(NOWHERE_BOX_BOTH, BOX_KEYS, "minorPentatonic"),
      tab: NOWHERE_BOX_BOTH,
      position: 5,
      harmony: { scale: ["A", "minorPentatonic"], cover: true },
      rungs: ladder(50, 110, 5),
      passAt: 80,
      grade: "timingNotes",
      pass: NOWHERE,
      selfCheck: ["Coming down, did each new string start as loud as the pull-off before it?"],
      minutes: 6,
    },
    {
      id: "nowhere-box-round",
      title: "Four strings down and back",
      purpose: "Down four strings of the box with pull-offs and back up with hammer-ons, on one pick stroke. Coming down, the upper finger starts each string from nowhere; going back up, the first finger does.",
      howTo: [
        "Sixteenths. Pick the top string's fret 8 and nothing else. Down: top string 8 to 5, B string 8 to 5, G string 7 to 5, D string 7 to 5. Then hammer the D string's 7 again and climb: G string 5, 7, B string 5, 8, top string 5, 8, and a pull-off to 5.",
        "The turn is on the D string: pull off to fret 5, hammer 7 again, and the first finger goes to the G string from the air. The bar ends on the top string's fret 5, so the pick starts the next bar on fret 8.",
        VARIANT_NOTE,
      ],
      coach: "One picked note a bar leaves the timing little to hold. Record a take and listen: that is the real check.",
      vary: inKeys(NOWHERE_BOX_ROUND, BOX_KEYS, "minorPentatonic"),
      tab: NOWHERE_BOX_ROUND,
      position: 5,
      harmony: { scale: ["A", "minorPentatonic"] },
      rungs: ladder(50, 110, 5),
      passAt: 85,
      grade: "timingNotes",
      pass: NOWHERE,
      selfCheck: ["On a recording, can you hear all 16 notes of the bar?", NOISE_CHECK],
      minutes: 7,
    },
  ],
};

// --- Advanced: phrases over the band in a second key -------------------------------
// E minor around fret 7 and fret 12. Every bar starts on a tone of its chord.

/** Over Em, C, G, D: a roll and a long note, an answer, a three-per-string climb, a roll three frets higher. */
const PHRASE_CLIMBS = `/16 1:7f1 1:8hf2 1:10hf4 1:8pf2 /4 1:7pf1 /16 2:8f2 2:10hf4 2:8pf2 2:7pf1 /4 3:9f3 |
  /16 1:8f2 1:7pf1 2:10f4 2:8pf2 /4 3:9f3 /8 r 3:7f1 /4 4:10f4 |
  /8t 3:7f1 3:9hf2 3:11hf4 2:8f1 2:10hf2 2:12hf4 /4 1:10f2 r |
  /16 1:10f1 1:12hf2 1:14hf4 1:12pf2 /8 1:10pf1 2:12f3 /2 2:10pf1`;

/** Over C, D, Em, Em: the same idea at fret 12, down the B string with the shift on a longer note, a three-per-string fall, a roll home. */
const PHRASE_HOME = `/16 1:12f1 1:14hf3 1:15hf4 1:14pf3 /4 1:12pf1 /16 2:13f2 2:15hf4 2:13pf2 2:12pf1 /4 3:12f1 |
  /16 2:15f4 2:13pf2 /8 2:12pf1 /16 2:12f4 2:10pf2 2:8pf1 2:10hf2 /4 3:11f4 r |
  /8t 2:12f4 2:10pf2 2:8pf1 3:11f4 3:9pf2 3:7pf1 /4 4:9f3 r |
  /16 5:7f1 5:9hf3 5:10hf4 5:9pf3 /2. 5:7pf1`;

const CHART_CLIMBS = "Em | C | G | D";
const CHART_HOME = "C | D | Em | Em";

/** Semitones from E minor. */
const PHRASE_KEYS: Readonly<Record<string, number>> = { E: 0, D: -2 };

/** A phrase and its chart in the other key, with the band in that key. */
function phraseIn(tab: string, chart: string) {
  return {
    values: { key: ["E", "D"] },
    pooled: ["key"] as const,
    label: (p: VariantParams) => `${p.key} minor`,
    build: (p: VariantParams) => {
      const moved = shiftFrets(tab, PHRASE_KEYS[p.key]);
      return {
        tab: moved,
        position: handAt(moved),
        shifts: true,
        chords: moveChart(chart, PHRASE_KEYS[p.key]),
        jam: { groove: "rock8", key: `${p.key} minor` },
        harmony: { scaleOverChords: [p.key, "naturalMinor"] as [string, string] },
      };
    },
  };
}

const PHRASE_CHECK = "Did the long notes last their full length, and were the rests silent?";

/** Advanced, the last Step: it takes the band line of `long-lines` to a second key, so it comes after it. */
export const SECOND_KEY: StepSpec = {
  id: "second-key",
  title: "Phrases in a second key",
  goal: "Play written four-bar legato phrases over a band in E minor, with long notes and rests in them, and join two of them into eight bars.",
  why: "The line over the band in the Step before never stops and never leaves fifth position. A solo is made of phrases: a few notes, a long one to land on, a gap. This Step takes the rolls, the three-per-string fragments and the shifts of this Path to a second key and puts air between them. The long notes are where a weak pull-off or a late shift shows.",
  howTo: [
    "Each phrase mixes sixteenths, in rolls from one pick, and triplets, where one pick starts three notes on a string. Count the triplet beats '1-and-a' before you play them.",
    "Hold each long note for its full length and keep the rests silent: stop the string with the fretting finger, or with the side of the picking hand.",
    "Play each phrase dry first. With the band on, listen for the first note of every bar landing on its chord.",
    "The hand changes position during the long notes and rests where it can. Where it moves inside a line, the Exercise says so.",
  ],
  payoff: "Eight bars of legato over a band in a key that is not A minor, with room to breathe in them.",
  difficultyException:
    "Long notes and rests mean far fewer notes a second than the non-stop lines of the Step before, so the metric falls. It does not count a second key, shapes at frets 7 and 12, the changes of position, or keeping count of eight bars over a band.",
  exercises: [
    {
      id: "phrase-climbs",
      title: "A phrase that climbs",
      purpose: "Four bars over E minor, C, G and D: a roll on the top string that lands on a held B, an answer that falls to C, a three-per-string climb in triplets, and a stretched roll from fret 10 that ends on a long A.",
      howTo: [
        "Sixteenths and triplets over the band. Bar 1: top string 7, 8, 10, 8 from one pick and a pull-off to fret 7, held for a beat; then B string 8, 10, 8, 7 from one pick and a picked fret 9 on the G string. Fingers 1, 2, 4 on frets 7, 8, 10 of both strings, and the third finger for the G string's 9.",
        "Bar 2: top string 8 to 7 and B string 10 to 8, each a pick and a pull-off, then the G string's fret 9 held, an eighth rest, the G string's fret 7 and a held fret 10 on the D string.",
        "Bar 3 is triplets: G string 7, 9, 11 with fingers 1, 2, 4, then B string 8, 10, 12 with the same fingers and the hand one fret higher, a held fret 10 on the top string and a rest. In bar 4 the first finger takes that fret 10 for the roll 10, 12, 14, 12 and a pull-off back to 10 on beat 2; then B string 12 on the 'and' and a pull-off to a long fret 10.",
        VARIANT_NOTE,
      ],
      coach: "Band on. The picked notes are timed against it and the notes are checked after the take; the rests are yours to keep.",
      vary: phraseIn(PHRASE_CLIMBS, CHART_CLIMBS),
      tab: PHRASE_CLIMBS,
      position: 7,
      shifts: true,
      chords: CHART_CLIMBS,
      jam: { groove: "rock8", key: "E minor" },
      harmony: { scaleOverChords: ["E", "naturalMinor"] },
      rungs: ladder(55, 115, 5),
      passAt: 85,
      grade: "timingNotes",
      pass: LEGATO,
      selfCheck: [PHRASE_CHECK],
      minutes: 7,
    },
    {
      id: "phrase-home",
      title: "A phrase that comes home",
      purpose: "Four bars over C, D and two bars of E minor. It starts at fret 12 with the first phrase's opening idea, comes down the B string in two steps, falls three notes per string in triplets and ends on a long E.",
      howTo: [
        "Sixteenths and triplets over the band, starting at fret 12. Bar 1: top string 12, 14, 15, 14 from one pick and a pull-off to fret 12, held for a beat; then B string 13, 15, 13, 12 from one pick and a picked fret 12 on the G string. The first finger takes fret 12 on both the B and G strings: lay it flat across the two.",
        "Bar 2 comes down the B string: frets 15, 13 and 12 from one pick, with fret 12 twice as long as the other two, then a roll down from fret 12: frets 12, 10, 8, 10. The shift is on that longer note: the little finger takes fret 12 from the first finger for the next picked note, and the hand is four frets lower. Land on the G string's fret 11 and rest.",
        "Bar 3 is triplets coming down: B string 12, 10, 8, then G string 11, 9, 7 with the hand a fret lower, a held fret 9 on the D string and a rest. Bar 4: a roll on the A string, 7, 9, 10, 9, and a pull-off to a long fret 7.",
        VARIANT_NOTE,
      ],
      coach: "Band on. The picked notes are timed against it and the notes are checked after the take; the rests are yours to keep.",
      vary: phraseIn(PHRASE_HOME, CHART_HOME),
      tab: PHRASE_HOME,
      position: 12,
      shifts: true,
      chords: CHART_HOME,
      jam: { groove: "rock8", key: "E minor" },
      harmony: { scaleOverChords: ["E", "naturalMinor"] },
      rungs: ladder(55, 115, 5),
      passAt: 85,
      grade: "timingNotes",
      pass: LEGATO,
      selfCheck: [PHRASE_CHECK],
      minutes: 7,
    },
    {
      id: "phrases-joined",
      title: "Eight bars over the band",
      purpose: "The two phrases back to back: eight bars over E minor, C, G and D, then C, D and two bars of E minor. Nothing is changed in either phrase.",
      howTo: [
        "Sixteenths and triplets over the band. Bars 1 to 4 are the phrase that climbs; bars 5 to 8 are the phrase that comes home.",
        "The join is the long note at the end of bar 4: the first finger holds fret 10 of the B string, and bar 5 starts with the first finger on the top string's fret 12. Let go of the long note just before the bar line and move: this one may end a little early.",
        "Bar 2 has an eighth rest; the rests in bars 3, 6 and 7 are a full beat each. Count through them, so the bar after each one starts on time.",
        VARIANT_NOTE,
      ],
      coach: "Band on, eight bars. The picked notes are timed against it and the notes are checked after the take.",
      vary: phraseIn(`${PHRASE_CLIMBS} |\n  ${PHRASE_HOME}`, `${CHART_CLIMBS} | ${CHART_HOME}`),
      tab: `${PHRASE_CLIMBS} |\n  ${PHRASE_HOME}`,
      position: 7,
      shifts: true,
      chords: `${CHART_CLIMBS} | ${CHART_HOME}`,
      jam: { groove: "rock8", key: "E minor" },
      harmony: { scaleOverChords: ["E", "naturalMinor"] },
      rungs: ladder(55, 115, 5),
      passAt: 85,
      grade: "timingNotes",
      pass: LEGATO,
      selfCheck: [PHRASE_CHECK, "Did you know which bar you were in all the way through?"],
      minutes: 8,
    },
  ],
};
