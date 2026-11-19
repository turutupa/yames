/**
 * Sweep Picking, a Mechanics Path. A draft: no teacher or guitarist has reviewed
 * it. Muting and pick path are the heart of sweeping, and neither can be
 * graded from sound, so they are taught in words and self-checked.
 */
import { definePath } from "../spec";
import type { ExerciseSpec, StepSpec, VariantParams } from "../spec";
import {
  arpeggioCells,
  handAt,
  ladder,
  linkFragment,
  linkedSweep,
  moveChart,
  nearFret,
  repeat,
  sweepChain,
  sweepLoop,
  sweepDown,
  sweepUp,
} from "../templates";

const ROLL_CHECK =
  "Record a take and listen back. Does each note stop as the next one starts, or do they ring together like a strummed chord?";
const LINK_CHECK =
  "At each change, did the sweep keep going, with no gap and no extra pick stroke before the new shape?";
const NOISE_CHECK = "Between takes, stop and listen: are the strings you are not playing silent?";

const am3 = sweepLoop({ chord: "Am", strings: [3, 2, 1], near: 14 });
const am3Low = sweepLoop({ chord: "Am", strings: [3, 2, 1], near: 5 });
const am3Mid = sweepLoop({ chord: "Am", strings: [3, 2, 1], near: 9 });
const c3 = sweepLoop({ chord: "C", strings: [3, 2, 1], near: 12 });
const c3Low = sweepLoop({ chord: "C", strings: [3, 2, 1], near: 9 });
const c3High = sweepLoop({ chord: "C", strings: [3, 2, 1], near: 17 });
// F's top reach is five frets at fret 8, wider than a hammer: `reach.ts` caught it.
const f3 = sweepLoop({ chord: "F", strings: [3, 2, 1], near: 10, slideTop: true });
const g3 = sweepLoop({ chord: "G", strings: [3, 2, 1], near: 12 });
const gsDim = sweepLoop({ chord: "G#dim7", strings: [3, 2, 1], near: 13 });
const bDim7 = sweepLoop({ chord: "Bdim7", strings: [3, 2, 1], near: 16 });

const c4 = sweepLoop({ chord: "C", strings: [4, 3, 2, 1], near: 10 });
const am4 = sweepLoop({ chord: "Am", strings: [4, 3, 2, 1], near: 14 });
const g4 = sweepLoop({ chord: "G", strings: [4, 3, 2, 1], near: 12 });
const f4 = sweepLoop({ chord: "F", strings: [4, 3, 2, 1], near: 10, slideTop: true });
const dm4 = sweepLoop({ chord: "Dm", strings: [4, 3, 2, 1], near: 12 });

const am5 = sweepLoop({ chord: "Am", strings: [5, 4, 3, 2, 1], near: 12, doubleLow: true });
const c5 = sweepLoop({ chord: "C", strings: [5, 4, 3, 2, 1], near: 10, doubleLow: true });
const g5 = sweepLoop({ chord: "G", strings: [5, 4, 3, 2, 1], near: 10 });
const f5 = sweepLoop({ chord: "F", strings: [5, 4, 3, 2, 1], near: 8 });
const em5 = sweepLoop({ chord: "Em", strings: [5, 4, 3, 2, 1], near: 7, doubleLow: true, slideTop: true });
const dm5 = sweepLoop({ chord: "Dm", strings: [5, 4, 3, 2, 1], near: 5, doubleLow: true, slideTop: true });

// ---------------------------------------------------------------------------
// Keys and progressions. Generic harmony, all of it: none of this is anyone's song.
// ---------------------------------------------------------------------------

/** Semitones from A minor, for the keys these shapes sit well in. */
const KEY_SHIFT: Readonly<Record<string, number>> = { A: 0, C: 3, D: 5, E: -5, G: -2 };
/** Where a three-string minor shape sits well in each key: the top reach fits a hammer. */
const NEAR_THREE: Readonly<Record<string, number>> = { A: 14, C: 17, D: 10, E: 12, G: 15 };
const nearFor = (strings: readonly number[], near: number, key: string) =>
  strings.length === 3 ? NEAR_THREE[key] : nearFret(near, KEY_SHIFT[key]);
const MINOR_KEYS = ["A", "E", "D", "G", "C"] as const;

/** Written in A minor; `moveChart` takes them anywhere. */
const PROGRESSIONS: Readonly<Record<string, string>> = {
  "i-VI-III-VII": "Am | F | C | G",
  "i-VII-VI-VII": "Am | G | F | G",
  "i-VII-VI-V": "Am | G | F | E",
  "i-iv-V-i": "Am | Dm | E | Am",
  "i-VI-iv-V": "Am | F | Dm | E",
  "i-V-VI-V": "Am | E | F | E",
  "ii°-V-i-iv": "Bdim | E | Am | Dm",
};
const MINOR_LOOP = ["i-VI-III-VII", "i-VII-VI-VII"] as const;
const WITH_THE_V = ["i-iv-V-i", "i-VI-iv-V", "i-V-VI-V"] as const;

type KeyedBuild = { key: string; progression: string };
const keyed = (p: VariantParams): KeyedBuild & { shift: number; chart: string; chords: string[] } => {
  const shift = KEY_SHIFT[p.key] ?? 0;
  const chart = moveChart(PROGRESSIONS[p.progression], shift);
  return { key: p.key, progression: p.progression, shift, chart, chords: chart.split("|").map((c) => c.trim()) };
};
const labelKeyed = (p: VariantParams) => `${p.key} minor, ${p.progression}`;


// The three-string A minor shape at fret 12: A, C, E on the G, B and top strings.
const AM_HIGH = { chord: "Am", strings: [3, 2, 1], near: 14 } as const;

/** Step 1's chord pairs: [chord, where its G-string note sits]. `rest` ends on a silent beat, for the mute. */
const ROLL_PAIRS: readonly { label: string; shapes: [string, number][]; rest?: boolean }[] = [
  { label: "Am to C", shapes: [["Am", 14], ["C", 12]] },
  { label: "Am to Dm", shapes: [["Am", 9], ["Dm", 7]] },
  { label: "G to Em", shapes: [["G", 12], ["Em", 9]] },
  { label: "C to Cm", shapes: [["C", 12], ["Cm", 12]], rest: true },
];

/** Up the shape, back down, up, back: four sweeps, twelve triplets, a bar. */
const rock = (shape: { chord: string; strings: readonly number[]; near: number }) => {
  const up = sweepUp(shape);
  const down = sweepDown(shape);
  return `${up} ${down} ${up} ${down}`;
};

/** A bar of rocking per chord, each shape the nearest one to the last. */
function rockChain(chords: readonly string[], near: number): string {
  let at = near;
  return chords
    .map((chord) => {
      const shape = { chord, strings: [3, 2, 1], near: at };
      at = arpeggioCells(shape).up[0].fret;
      return `/8t ${rock(shape)}`;
    })
    .join(" | ");
}

// Slow, short triads: evenness is held a little higher than on the long shapes.
const TRIAD_BARS = [
  { metric: "notesHeard", min: 0.9, overBars: 4 },
  { metric: "timingEvenness", min: 0.8, overBars: 4 },
  { metric: "extraNotes", max: 3, overBars: 4 },
];

// The E-shape: five strings from the chord's fifth on the A string, a pick turn at the bottom.
const amE = sweepLoop({ chord: "Am", strings: [5, 4, 3, 2, 1], near: 7 });
const cE = sweepLoop({ chord: "C", strings: [5, 4, 3, 2, 1], near: 10 });
const dmE = sweepLoop({ chord: "Dm", strings: [5, 4, 3, 2, 1], near: 12 });
// Tapped tops: the A-shape with the octave tapped, and the E-shape with a hammer and a tap.
const A_TAP = "5:12 5:15h 4:14 3:14 2:13 1:12 1:17t 1:12p 2:13 3:14 4:14 5:15";
const E_TAP = "5:7 4:7 3:5 2:5 1:5 1:8h 1:12t 1:8p 1:5p 2:5 3:5 4:7";

/** The Intermediate etude: eight bars, all triplets, everything in the Level. */
const ETUDE = [
  `/8t ${am5}`,
  `/8t ${sweepLoop({ chord: "F", strings: [5, 4, 3, 2, 1], near: 12, doubleLow: true })}`,
  `/8t ${cE} r r`,
  `/8t ${g5} r r`,
  sweepChain({ chords: ["Dm", "E"], strings: [3, 2, 1], near: 10, nears: [10, 13], perBar: 2, rhythm: "/8t" }),
  `/8t ${A_TAP}`,
  `/8t 5:12 5:15h 4:14 3:14 2:13 1:12 /2 1:17hv`,
].join(" | ");

const twoPerBar = (cell: string) => repeat(cell, 2);

// A slid-to note the listening misses counts as missed today, so a shape with
// slides at the top keeps a lower notes-heard bar (`honesty.slideBar`).
const SLIDE_BARS = [
  { metric: "notesHeard", min: 0.75, overBars: 4 },
  { metric: "timingEvenness", min: 0.75, overBars: 4 },
  { metric: "extraNotes", max: 4, overBars: 4 },
];

function sweepExercise(args: Omit<ExerciseSpec, "pick" | "grade"> & { grade?: ExerciseSpec["grade"] }): ExerciseSpec {
  return {
    pick: "sweep",
    // Timing only: on a sweep the strings ring into each other, and a pitch
    // read there can fail a take that was played right (audio_fixtures, 2026-11-17).
    grade: "sweepTiming",
    selfCheck: [ROLL_CHECK],
    ...args,
  };
}

const OLD_STEPS: StepSpec[] = [
    {
      id: "triads",
      title: "Three-string triads, up and down",
      goal: "Sweep a minor and a major triad on the top three strings, up and back down, in even triplets, with each note separate.",
      why: "This is the sweep everyone recognises: three notes of a chord in one push, A, C, E going up and E, C, A coming back. Three strings is the size every bigger shape is made of, and it's short enough to keep clean from the first day. Triplets put one sweep on every click, so the rhythm tells you where each stroke starts. You learn major and minor together because they differ by one note, and hearing that note is what turns a shape into a chord you can use.",
      howTo: [
        "One push per click. Going up the strings, the pick falls through the G, B and E strings in one downward motion and comes to rest on each string before it plays it. Coming back, the same in reverse: one upward pull through E, B and G. The last Exercise turns the pick at both ends with no repeated note, in sixteenths.",
        "The top note is played twice, once at the end of the push and once at the start of the pull. That repeated note is the only place the pick changes direction.",
        "Fretting hand: lift each finger's pressure as soon as the next note sounds, without leaving the string. Picking hand: the side of the palm rests lightly on the strings you have just left. Those two together are the mute.",
        "The A minor shape at fret 12: little finger on the G string at 14, middle finger on the B string at 13, index on the top string at 12. For C major only the G string changes, to fret 12.",
      ],
      payoff: "A minor and C major arpeggios that sound like chords being spelled out, and a four-chord progression played as sweeps, in your first session.",
      exercises: [
        sweepExercise({
          id: "triad-rolls",
          title: "Triad rolls: two chords",
          purpose: "Continuous triplet rolls on a pair of chords, a bar each: up the strings, back down, up, back. Each pair changes one or two notes, so you hear minor and major under your own fingers, and a different pair comes round on each Take.",
          howTo: [
            "Up, back, up, back in each bar: four sweeps, twelve notes, one sweep to a click. The top note is played twice, once at the end of the push and once at the start of the pull: that is where the pick turns.",
            "Move only the fingers whose notes change at the bar line. Say the chord name as you arrive: if you hear the change before you name it, your ears are doing their job.",
            "In the C to C minor pair the last beat is silent: stop the strings and bring the pick back above the G string without touching anything. Anything still ringing in that beat is a mute to fix.",
          ],
          coach: "I grade timing and notes heard. Right notes aren't graded on a sweep, because the strings ring into each other, so name each chord yourself.",
          vary: {
            values: { progression: ROLL_PAIRS.map((r) => r.label) },
            pooled: ["progression"],
            label: (p) => p.progression,
            build: (p) => {
              const pair = ROLL_PAIRS.find((r) => r.label === p.progression)!;
              const [a, b] = pair.shapes.map(([chord, near]) => ({ chord, strings: [3, 2, 1], near }));
              const second = pair.rest ? `${sweepUp(b)} ${sweepDown(b)} ${sweepUp(b)} /4 r` : rock(b);
              const tab = `/8t ${rock(a)} | /8t ${second}`;
              return { tab, position: handAt(tab), shifts: true, chords: `${a.chord} | ${b.chord}` };
            },
          },
          harmony: { chordTones: true, cover: true },
          rungs: ladder(60, 120, 10),
          passAt: 100,
          pass: TRIAD_BARS,
          selfCheck: [ROLL_CHECK, "In a silent beat, were all six strings quiet?"],
          minutes: 6,
        }),
        sweepExercise({
          id: "four-chords-rock",
          title: "Am, F, C, G, rocking",
          purpose: "A real four-chord progression played as sweeps, one bar per chord. Each shape is the one nearest the last, so the hand moves a fret or two at most, and it changes key from Take to Take.",
          howTo: [
            "Up, back, up, back on every chord. Move the fingers during the last note of the bar, and arrive on the first note of the next shape on the click.",
            "Before you start, play the four chords once as ordinary strums so your ear knows where the music is going.",
          ],
          coach: "A chord change is where notes go missing. If one does, I'll count it, and the bar line is where to look.",
          vary: {
            values: { key: MINOR_KEYS },
            pooled: ["key"],
            label: (p) => `${p.key} minor, i-VI-III-VII`,
            build: (p) => {
              const { chart, chords } = keyed({ key: p.key, progression: "i-VI-III-VII" });
              const tab = rockChain(chords, NEAR_THREE[p.key]);
              return { tab, position: handAt(tab), shifts: true, chords: chart };
            },
          },
          harmony: { chordTones: true, cover: true },
          rungs: ladder(60, 120, 10),
          passAt: 100,
          pass: TRIAD_BARS,
          minutes: 6,
        }),
        sweepExercise({
          id: "picked-turn",
          title: "A turn with no hammer",
          purpose: "Four notes with both ends turned by the pick alone, because you won't always have a hammer. It is the hard version: the pick really does change direction, twice.",
          howTo: ["Sixteenths. Stay small. After the bottom note, the next note is a downstroke, and after the top note, the next is an upstroke. Feel them as one elastic motion."],
          coach: "This one gets fast quickly, and above the graded rungs it is yours to judge.",
          tab: `/16 ${repeat("3:14 2:13 1:12 2:13", 4)}`,
          position: 12,
          harmony: { arpeggio: "Am", cover: true },
          rungs: ladder(60, 120, 5),
          passAt: 85,
          selfCheck: [ROLL_CHECK, NOISE_CHECK],
          minutes: 6,
        }),
      ],
    },
    {
      id: "turnaround",
      title: "The turn at the top: hammer and pull-off",
      goal: "Turn the sweep round at the top with a hammer and a pull, so it loops with no repeated note and no extra pick stroke.",
      why: "In the last Step the pick turned round on a repeated note, or by itself. Real sweep lines don't repeat the top note: they add one more chord tone on the top string with a hammer, pull back off it, and sweep down. The hammer and the pull give the pick a moment with nothing to do, which is exactly when it changes direction, so the turn can't be heard. This loop is the sound of a sweep in a solo, and three strings is the cheapest place to learn it.",
      howTo: [
        "After the top string's push, the next note is a hammer-on, so the pick has nothing to do. Use that moment to turn it round.",
        "The pull-off back is the last note before the upward push begins. Keep the pull clean: pull slightly sideways, off the string, and do not just lift.",
        "Start with C major: its reach on the top string is three frets. The minor shapes reach five, and they come next.",
      ],
      payoff: "A triad that loops without a seam, with the turn inaudible, at a tempo you can sing along with.",
      exercises: [
        sweepExercise({
          id: "major-loop",
          title: "C major, the short reach",
          purpose: "The whole loop with the shortest top-string reach. G, C, E, then hammer to G and back.",
          howTo: ["Triplets. The first note of the loop after the first pass is an upstroke: the sweep comes back through it and turns, so you are never starting over."],
          coach: "I time each note and count the ones that arrived. A quiet hammer or pull costs nothing, so don't dig in to please me.",
          tab: `/8t ${twoPerBar(c3)}`,
          position: 12,
          harmony: { arpeggio: "C" },
          rungs: ladder(60, 130, 5),
          passAt: 100,
          minutes: 6,
        }),
        sweepExercise({
          id: "minor-mid",
          title: "Am at fret 8",
          purpose: "A minor shape with a four-fret reach. The same loop, and your little finger starts earning its keep.",
          howTo: ["First finger on fret 8 of the top string, second on fret 9 of the G, third on fret 10 of the B, little finger hammering at fret 12. One finger per note: no rolling on this shape."],
          coach: "Same bar as the last one. If it slips, the stretch is the place to look.",
          tab: `/8t ${twoPerBar(am3Mid)}`,
          position: 8,
          harmony: { arpeggio: "Am" },
          rungs: ladder(60, 130, 5),
          passAt: 100,
          minutes: 6,
        }),
        sweepExercise({
          id: "minor-high",
          title: "Am at fret 12, the long reach",
          purpose: "The classic shape, A, C, E and a five-fret hammer to A. Up here the frets are close enough that a five-fret reach is comfortable.",
          howTo: ["First finger on fret 12, little finger on 17. If the reach is too much for now, slide up to it instead: the sound is what counts."],
          coach: "A clean turn on this shape is a real milestone. Check it on a recording too.",
          tab: `/8t ${twoPerBar(am3)}`,
          position: 12,
          harmony: { arpeggio: "Am" },
          rungs: ladder(60, 130, 5),
          passAt: 95,
          minutes: 6,
        }),
      ],
    },
    {
      id: "qualities",
      title: "Triads up the neck",
      goal: "Play the same minor and major triad in three places up the neck, with the shifts landing on time.",
      why: "A shape you know in one place is a shape you can only use in one place. Every triad has three shapes on the top three strings, one per inversion, and between them they cover the neck, so whatever chord comes next, one of its shapes is under your hand. Learning them as loops that climb and come back is also your first real position-shift drill.",
      howTo: [
        "Name the notes out loud as you practise, at least once. The spelled notes on each Exercise are there for that.",
        "Moving between inversions, shift during the last note of the bar, and arrive on the first finger of the new shape.",
      ],
      payoff: "A minor, C major and D minor in three places each, so the next chord always has a shape near your hand.",
      exercises: [
        sweepExercise({
          id: "minor-inversions",
          title: "Am in three places",
          purpose: "The same three notes in three shapes up the neck, so you can reach for Am wherever your hand happens to be.",
          howTo: ["Low shape is a one-finger barre roll at fret 5, the middle at fret 8 and the high at fret 12. Be ready on the new shape before the bar line."],
          coach: "A shift is where notes go missing. If they do, look at the bar lines first.",
          tab: `/8t ${twoPerBar(am3Low)} | ${twoPerBar(am3Mid)} | ${twoPerBar(am3)} | ${twoPerBar(am3Mid)}`,
          position: 5,
          shifts: true,
          harmony: { arpeggio: "Am", cover: true },
          rungs: ladder(60, 120, 5),
          passAt: 90,
          minutes: 6,
        }),
        sweepExercise({
          id: "major-inversions",
          title: "C in three places",
          purpose: "The major version, for the same reason. These three are what you'll move around when the chord changes.",
          howTo: ["Fret 8 shape, fret 12 shape, then the high shape from fret 15. Each one has a different lowest note: E, then G, then C."],
          coach: "When this is as even as the minor one, the qualities are yours.",
          tab: `/8t ${twoPerBar(c3Low)} | ${twoPerBar(c3)} | ${twoPerBar(c3High)} | ${twoPerBar(c3)}`,
          position: 8,
          shifts: true,
          harmony: { arpeggio: "C", cover: true },
          rungs: ladder(60, 120, 5),
          passAt: 90,
          minutes: 6,
        }),
        sweepExercise({
          id: "dm-inversions",
          title: "Dm in three places",
          purpose: "D minor's three shapes, low to high and back: the fret-7 shape, the barre roll at fret 10, and the shape at 14 with the stretch on top. The same three notes, D, F and A, wherever your hand is.",
          howTo: ["Two loops a shape. The barre at fret 10 is a one-finger roll, as in Am at fret 5. Where the top note is too far to hammer, slide to it and back."],
          coach: "A shift is where notes go missing. If one does, I'll count it, and the bar line is where to look.",
          tab: sweepChain({ chords: ["Dm", "Dm", "Dm", "Dm"], strings: [3, 2, 1], near: 7, nears: [7, 10, 14, 10], perBar: 2, rhythm: "/8t" }),
          position: 5,
          shifts: true,
          harmony: { arpeggio: "Dm", cover: true },
          rungs: ladder(60, 120, 5),
          passAt: 90,
          pass: SLIDE_BARS,
          minutes: 6,
        }),
      ],
    },
    {
      id: "first-solo",
      title: "Your first sweep solo, with the band",
      goal: "Play looped three-string triads through two progressions over a band, and a four-bar sweep solo that ends on a held note.",
      why: "Everything so far has been against a click. A band changes how it feels: the bass plays the roots, the drums carry the beat, and your arpeggios suddenly sound like a guitar solo instead of an exercise. Three strings is enough for that, and it's short enough that you can listen to the band while you play. The four-bar solo at the end is the Beginner Level's finish line.",
      howTo: [
        "Use direct input or headphones for a graded take. A microphone also hears the band, and that hasn't been tested.",
        "Lock the first note of each bar to the kick drum and let the rest of the bar fall into place.",
        "Turn the band down until your mistakes show. A loud band covers a ringing string.",
      ],
      payoff: "You play a sweep solo over a band that follows the chords and ends on a note that sings.",
      exercises: [
        sweepExercise({
          id: "band-three",
          title: "Am, F, C, G with the band",
          purpose: "The looped shapes, one chord a bar, over a rock band in twelve-eight. It's the first time you hear your own sweep sitting on a progression.",
          howTo: ["Two loops a bar. The shapes are all near fret 12, and F slides to its top note because the reach is too wide to hammer."],
          coach: "Band in the room, so use direct input if you want these numbers to mean something.",
          tab: `/8t ${twoPerBar(am3)} | ${twoPerBar(f3)} | ${twoPerBar(c3)} | ${twoPerBar(g3)}`,
          position: 12,
          shifts: true,
          chords: "Am | F | C | G",
          jam: { groove: "rockTwelveEight", key: "A minor" },
          harmony: { chordTones: true, cover: true },
          rungs: ladder(60, 130, 5),
          passAt: 95,
          pass: SLIDE_BARS,
          minutes: 7,
        }),
        sweepExercise({
          id: "minor-cadence",
          title: "Am, Dm, E, Am with the band",
          purpose: "The progression that makes a minor key sound dramatic: E major's G# pulls up to A at the end of every round. The shapes move by a fret or two.",
          howTo: [
            "Two loops a bar. Every shape is the nearest one to the last, so the hand hardly moves.",
            "In the E bar, find the G# on the G string at fret 13. That's the note that pulls back to A.",
          ],
          coach: "I report timing and notes heard. The pull from G# back to A is for your ear, and it's the reason this progression exists.",
          tab: sweepChain({ chords: ["Am", "Dm", "E", "Am"], strings: [3, 2, 1], near: 14, perBar: 2, rhythm: "/8t" }),
          position: 12,
          shifts: true,
          chords: "Am | Dm | E | Am",
          jam: { groove: "rockTwelveEight", key: "A minor" },
          harmony: { chordTones: true, cover: true },
          rungs: ladder(60, 130, 5),
          passAt: 95,
          pass: SLIDE_BARS,
          minutes: 7,
        }),
        sweepExercise({
          id: "first-etude",
          title: "A four-bar sweep solo",
          purpose: "Three bars of looped triads through Am, Dm and E, then a sweep up to a held high A with vibrato. Written for this Path, and the Beginner Level's finish line.",
          howTo: [
            "Bars 1 to 3: two loops of each shape. Bar 4: one sweep up the A minor shape, a hammer to fret 17 on the top string, and hold it for three beats with some vibrato.",
            "The held note is the point. Give it its full length before you go round again.",
          ],
          coach: "I report the timing of the sweeps and whether the held note arrived. How it sings is up to you.",
          tab: `${sweepChain({ chords: ["Am", "Dm", "E"], strings: [3, 2, 1], near: 14, perBar: 2, rhythm: "/8t" })} | /8t ${sweepUp(AM_HIGH)} /2. 1:17hv`,
          position: 12,
          shifts: true,
          chords: "Am | Dm | E | Am",
          jam: { groove: "rockTwelveEight", key: "A minor" },
          harmony: { chordTones: true, cover: true },
          rungs: ladder(60, 130, 5),
          passAt: 95,
          pass: SLIDE_BARS,
          selfCheck: [ROLL_CHECK, "Did the held A ring for its full three beats?"],
          minutes: 7,
        }),
      ],
    },
    {
      id: "four-strings",
      title: "Four strings",
      goal: "Add the D string without losing the separation you built on three.",
      why: "Four strings is enough for a full-sounding chord and short enough to keep clean. A longer push means more time for an earlier note to keep ringing, so it is the first real test of your muting. It's also the first place the pick travels far enough that the arm has to carry it, not the wrist.",
      howTo: [
        "Let the forearm carry the pick across. The wrist stays still.",
        "The palm mute now has to travel with the pick, and the fretting hand keeps releasing each note in turn.",
        "The bottom note is played once: you arrive on it with the upward push and leave it with a downstroke on the next string. Keep that change small.",
      ],
      payoff: "A sweep that sounds like a real chord being spelled out, at a tempo you can sing, in four shapes.",
      exercises: [
        sweepExercise({
          id: "c-four",
          title: "C major on four strings",
          purpose: "The first four-string shape, with a short top reach and fingers that fall naturally.",
          howTo: ["Sixteenths, two loops a bar. From the second pass on, fret 10 on the D string is an upstroke that turns straight into a downstroke."],
          coach: "Evenness and notes heard on the slow rungs. Above them, it is your own judgement.",
          tab: `/16 ${repeat(c4, 2)}`,
          position: 8,
          harmony: { arpeggio: "C", cover: true },
          rungs: ladder(60, 120, 5),
          passAt: 80,
          selfCheck: [ROLL_CHECK, NOISE_CHECK],
          minutes: 6,
        }),
        sweepExercise({
          id: "am-four",
          title: "Am on four strings",
          purpose: "The Am shape with the D string underneath: the classic rock sweep, with the five-fret reach at the top.",
          howTo: ["Two fingers line up on fret 14, D and G strings, and you will have to roll between them. Keep that roll clean, as a stuck finger rings on."],
          coach: "This shape tends to ring on the G and D strings. A recording shows it better than I can.",
          tab: `/16 ${repeat(am4, 2)}`,
          position: 12,
          harmony: { arpeggio: "Am", cover: true },
          rungs: ladder(60, 120, 5),
          passAt: 80,
          minutes: 6,
        }),
        sweepExercise({
          id: "g-four",
          title: "G major, the barre roll",
          purpose: "Three strings on fret 12 under one finger. It's a rolling problem more than a picking one, so it's your check on the fretting-hand mute.",
          howTo: ["Roll across fret 12, then drop to fret 10 on the top string with your first finger. You will need to re-think which finger goes where, and that's fine: the sound is what matters."],
          coach: "If a stuck finger lets two notes ring together, I may not catch it. A recording will.",
          tab: `/16 ${repeat(g4, 2)}`,
          position: 10,
          harmony: { arpeggio: "G", cover: true },
          rungs: ladder(60, 120, 5),
          passAt: 75,
          minutes: 6,
        }),
        sweepExercise({
          id: "changes-four",
          title: "Am, F, C, G on four strings",
          purpose: "One bar each, and the shapes must arrive on time. This is the test of whether four-string shapes are yours.",
          howTo: ["Sixteenths. The hand moves in the last note of each bar. All the shapes are within a few frets of each other, so the moves are short."],
          coach: "When this one is even you are in good shape for five strings.",
          tab: `/16 ${repeat(am4, 2)} | ${repeat(f4, 2)} | ${repeat(c4, 2)} | ${repeat(g4, 2)}`,
          position: 12,
          shifts: true,
          chords: "Am | F | C | G",
          harmony: { chordTones: true, cover: true },
          rungs: ladder(60, 110, 5),
          passAt: 70,
          minutes: 6,
        }),
      ],
    },
    {
      id: "five-strings",
      title: "Five strings: the root positions",
      goal: "Own the two common five-string shapes with the root on the A string, in minor and major.",
      why: "Five strings is the big sweep, the sound people mean when they say the word. There are few shapes to learn: minor from the A string, major from the A string, and the two moved around. Everything else on the fretboard is one of those at a different fret, which is why you learn only these.",
      howTo: [
        "Minor: root on the A string, a hammer to the third on that same string, then one note a string up to the top. Major: a chord tone below the root, hammer to the root, then one note a string.",
        "Mute everything. With five strings moving there is more to keep silent than there are fingers: palm on the low strings, fretting fingers across the high ones.",
        "Keep this below your speed limit. A clean five-string sweep at a modest tempo sounds better than a fast smear.",
      ],
      payoff: "The sound you came for: a five-string arpeggio up the neck and back, with every note separate.",
      difficultyException:
        "Triplets replace sixteenths so that every note stays separate over a push that is a string longer. Length of the sweep is the demand, and the rate does not count it.",
      exercises: [
        sweepExercise({
          id: "am-five",
          title: "A minor, the classic",
          purpose: "A, C, E, A, C, E, A on five strings, with the turn at each end. The most-used shape on this Path.",
          howTo: ["Triplets, one loop a bar. Hammer at the bottom, hammer and pull at the top. The last note on the A string is an upstroke that pulls off into the first note of the next loop."],
          coach: "Up to the graded rungs I report evenness and notes heard. Above that the tempo is yours to judge, on a recording.",
          tab: `/8t ${am5}`,
          position: 12,
          harmony: { arpeggio: "Am", cover: true },
          rungs: ladder(60, 160, 10),
          passAt: 100,
          selfCheck: [ROLL_CHECK, NOISE_CHECK],
          minutes: 7,
        }),
        sweepExercise({
          id: "c-five",
          title: "C major from the A string",
          purpose: "Major: G slid up to C, then E, G, C, E and a three-fret top reach. It is a wider shape at the bottom and easier at the top.",
          howTo: ["The slide from fret 10 to 15 on the A string is your widest move: the little finger slides, and the hand lands with the index at fret 12. Warm up before pushing on this one."],
          coach: "The same bar as Am. Compare the takes.",
          tab: `/8t ${c5}`,
          // The little finger starts the slide at 10, so the index starts at 7 and the hand moves to 12.
          position: 7,
          shifts: true,
          harmony: { arpeggio: "C", cover: true },
          // The loop jumps the hand back five frets to the slide: past 150 there is no time for it (reach.ts).
          rungs: ladder(60, 150, 10),
          passAt: 90,
          selfCheck: [ROLL_CHECK, NOISE_CHECK],
          minutes: 7,
        }),
        sweepExercise({
          id: "g-five",
          title: "G major, root in the shape's lowest note",
          purpose: "G, B, D, G, B and a three-fret reach to D on top. Ten notes and a rest, a good place to breathe and hear the arpeggio.",
          howTo: ["Ten triplets, then a rest for two. There is no bottom hammer here, so you turn with the pick. Use the rest to reset."],
          coach: "A rest at the end of each loop makes these notes easier to tell apart too.",
          tab: `/8t ${g5} r r`,
          position: 7,
          harmony: { arpeggio: "G", cover: true },
          rungs: ladder(60, 160, 10),
          passAt: 90,
          selfCheck: [ROLL_CHECK, NOISE_CHECK],
          minutes: 6,
        }),
        sweepExercise({
          id: "em-five",
          title: "E minor, lower down the neck",
          purpose: "The Am shape down at fret 7, where the top reach becomes a slide. Lower frets are wider, and you should know what to do when the hammer no longer reaches.",
          howTo: ["Slide up from fret 7 to 12 on the top string, and slide back. A slide is a good choice wherever the frets are too wide for a clean hammer."],
          coach: "A slid-to note can be too quiet for me to catch, and the bar on this one allows for that. Judge the slide by ear.",
          tab: `/8t ${em5}`,
          position: 7,
          shifts: true,
          harmony: { arpeggio: "Em", cover: true },
          rungs: ladder(60, 150, 10),
          passAt: 90,
          pass: SLIDE_BARS,
          selfCheck: [ROLL_CHECK, NOISE_CHECK],
          minutes: 6,
        }),
      ],
    },
    {
      id: "five-e-shape",
      title: "Five strings: the E-shape, and a tap at the top",
      goal: "Sweep the E-shape arpeggios that start on the fifth, and add a tapped note above the top of a five-string shape.",
      why: "The A-shape puts the root on the A string. The E-shape is the barre chord you already know from the low E string, swept from the A string up, so it starts on the chord's fifth. Between the two shapes you have a minor and a major arpeggio in every part of the neck, often in the same place, which is what lets a progression stay under one hand. The tap is the other half of the classic sound: one more note above the shape, played by the picking hand, so the arpeggio reaches higher than the fretting hand can stretch.",
      howTo: [
        "E-shape: the first note is on the A string, then one note a string up to the top, and a hammer to the top note. There's no second note on the A string, so the bottom turn is a pick turn, and the rest after each loop gives you time for it and a moment to check the mute.",
        "Tap with the middle finger of the picking hand, holding the pick tucked against the palm. Tap firmly on the fret, then pull off slightly downward so the fretted note under it sounds.",
        "While you tap, the fretting hand keeps holding the note you pull off to. The tap is a loud attack and it counts as a note that must be heard.",
      ],
      payoff: "Two five-string shapes per chord, and a tapped A minor sweep that reaches up to fret 20.",
      difficultyException:
        "Level with Five strings to the hundredth: that Step rates a shade higher only since the C shape's slide was counted as the shift it is (fingering audit, 2026-11-18).",
      exercises: [
        sweepExercise({
          id: "am-e-shape",
          title: "A minor, the E-shape at fret 5",
          purpose: "E, A, C, E, A and a hammer to C on top: the A minor barre chord at fret 5, swept from the A string. Ten notes and a two-note rest.",
          howTo: ["Index finger across fret 5 for the top three strings, ring finger on the A string at 7, little finger on the D string at 7; then the little finger hammers fret 8 on the top string. Roll the index finger so only one of its notes sounds at a time."],
          coach: "Up to the graded rungs I report evenness and notes heard. The rest at the bottom is where you listen for a ringing string.",
          tab: `/8t ${amE} r r`,
          position: 5,
          harmony: { arpeggio: "Am", cover: true },
          rungs: ladder(60, 150, 10),
          passAt: 100,
          selfCheck: [ROLL_CHECK, NOISE_CHECK],
          minutes: 6,
        }),
        sweepExercise({
          id: "c-e-shape",
          title: "C major, the E-shape at fret 8",
          purpose: "G, C, E, G, C and a hammer to E: the C major barre chord at fret 8, swept the same way. Hear how much brighter it is than the minor one.",
          howTo: ["Index finger across fret 8, the G string at 9 with the middle finger, the D and A strings at 10. The top hammer is four frets, from 8 to 12."],
          coach: "Same bar as the minor E-shape. Compare the two takes: they should sound like the same player.",
          tab: `/8t ${cE} r r`,
          position: 8,
          harmony: { arpeggio: "C", cover: true },
          rungs: ladder(60, 150, 10),
          passAt: 100,
          selfCheck: [ROLL_CHECK, NOISE_CHECK],
          minutes: 6,
        }),
        sweepExercise({
          id: "tap-octave",
          title: "A minor with a tap on top",
          purpose: "The A-shape from fret 12, with the top A tapped at fret 17 instead of hammered. The fretting hand stays small and the picking hand reaches the high note.",
          howTo: ["Sweep up to fret 12 on the top string, tap 17, pull off back to 12, and sweep down. Twelve triplets: the tap lands on the third click."],
          coach: "The tap counts as a note that has to be heard, so tap firmly. The pull-off after it costs nothing if I miss it.",
          tab: `/8t ${A_TAP}`,
          position: 12,
          harmony: { arpeggio: "Am", cover: true },
          rungs: ladder(60, 130, 5),
          passAt: 95,
          selfCheck: [ROLL_CHECK, "Was the pulled-off note after the tap as loud as the swept notes?"],
          minutes: 6,
        }),
        sweepExercise({
          id: "e-shape-tap",
          title: "The E-shape, hammer and tap",
          purpose: "A minor at fret 5, with a hammer to C and a tap on the E above it: twelve notes, one shape, and the arpeggio climbs past the fretting hand's reach.",
          howTo: ["Sweep up to fret 5 on the top string, hammer to 8, tap 12, pull off to 8 and then 5, and sweep back down. Keep the little finger down on fret 8 while you tap."],
          coach: "The tap carries the top of every loop. A pull-off I can't hear costs nothing.",
          tab: `/8t ${E_TAP}`,
          position: 5,
          harmony: { arpeggio: "Am", cover: true },
          rungs: ladder(60, 130, 5),
          passAt: 95,
          selfCheck: [ROLL_CHECK, "Was the pulled-off note after the tap as loud as the swept notes?"],
          minutes: 6,
        }),
        sweepExercise({
          id: "a-and-e",
          title: "Two shapes, one place: Am and Dm",
          purpose: "A minor in its A-shape at fret 12, then D minor in its E-shape at fret 10. Two chords, and the hand moves two frets: this is why you learn both shapes.",
          howTo: ["Bar 1 is the A minor loop you know. Bar 2 drops the index finger to fret 10 for D minor, with a three-fret hammer on top, and the rest at the end of the bar is your time to get back."],
          coach: "A chord change is where notes go missing. If one does, I'll count it, and the bar line is where to look.",
          tab: `/8t ${am5} | /8t ${dmE} r r`,
          position: 12,
          shifts: true,
          chords: "Am | Dm",
          harmony: { chordTones: true, cover: true },
          rungs: ladder(60, 150, 10),
          passAt: 100,
          selfCheck: [ROLL_CHECK],
          minutes: 6,
        }),
      ],
    },
    {
      id: "moving-shapes",
      title: "Inversions and position shifts",
      goal: "Change five-string shape and position at the bar line with no gap and no lost notes.",
      why: "You now have shapes, and music asks for them in a hurry. A real progression doesn't wait while you find the next one, so this Step is where the shapes you own become usable: the hand travels in the time of one note, and the sweep picks up as if nothing happened.",
      howTo: [
        "Look at the next shape before you need it. The eye gets there first, then the hand.",
        "Most of these moves happen in the last note of the bar. Let that note go, and be early rather than late.",
        "Practise only the move first: the last two notes of the bar and the first two of the next.",
      ],
      payoff: "A real four-chord progression played entirely in big sweeps.",
      exercises: [
        sweepExercise({
          id: "am-two-shapes",
          title: "A minor in two places",
          purpose: "The same chord in its E-shape at fret 5 and its A-shape at fret 12: a seven-fret shift at the bar line, and the arpeggio jumps an octave's worth of neck without changing chord.",
          howTo: ["Bar 1 is the E-shape loop and a two-note rest: use the rest to throw the hand up to fret 12. Bar 2 is the A-shape loop, and its last note leads back down."],
          coach: "A shift is where the first note after it goes missing. If it does, I'll count it as missed.",
          tab: `/8t ${amE} r r | /8t ${am5}`,
          position: 5,
          shifts: true,
          harmony: { arpeggio: "Am", cover: true },
          rungs: ladder(60, 130, 10),
          passAt: 100,
          selfCheck: [ROLL_CHECK],
          minutes: 6,
        }),
        sweepExercise({
          id: "am-dm",
          title: "Am down to Dm",
          purpose: "A big move of seven frets between two minor shapes. It is an obvious, musical change, and a good test of how far the hand can travel.",
          howTo: ["Am at fret 12, Dm at fret 5. Note the Dm's slide at the top: frets down there are too wide to hammer."],
          coach: "A large shift is where the first note after it goes missing. If it does, I'll count it as missed.",
          tab: `/8t ${am5} | ${dm5}`,
          position: 12,
          shifts: true,
          chords: "Am | Dm",
          harmony: { chordTones: true, cover: true },
          rungs: ladder(60, 120, 5),
          passAt: 90,
          pass: SLIDE_BARS,
          selfCheck: [ROLL_CHECK],
          minutes: 6,
        }),
        sweepExercise({
          id: "am-f-c-g",
          title: "Am, F, C, G",
          purpose: "The same progression as the last Step, on five strings, so you hear how much bigger the same chords sound.",
          howTo: ["F and G have ten notes and a rest of two. Use the rest to move. Am and C have twelve notes, so those moves come in the last note of the bar."],
          coach: "Slower and clean beats fast and rough. This one is worth repeating at a rung that stays even.",
          tab: `/8t ${am5} | ${f5} r r | ${c5} | ${g5} r r`,
          position: 12,
          shifts: true,
          chords: "Am | F | C | G",
          harmony: { chordTones: true, cover: true },
          rungs: ladder(60, 130, 5),
          passAt: 80,
          selfCheck: [ROLL_CHECK],
          minutes: 7,
        }),
        sweepExercise({
          id: "turn-in-the-middle",
          title: "Dm, G, C, Am on four strings",
          purpose: "Dm, G, C is the circle of fifths, played in shorter shapes. It uses less travel, and it comes round like a tune, so your ear can follow if your hands get lost.",
          howTo: ["Sixteenths, two loops a chord. Sing the top note of each shape if you can. They make a melody."],
          coach: "At these speeds the app grades only the slow rungs. Your ear has to decide about the fast ones.",
          tab: `/16 ${repeat(dm4, 2)} | ${repeat(g4, 2)} | ${repeat(c4, 2)} | ${repeat(am4, 2)}`,
          position: 10,
          shifts: true,
          chords: "Dm | G | C | Am",
          harmony: { chordTones: true, cover: true },
          rungs: ladder(60, 120, 5),
          passAt: 75,
          selfCheck: [ROLL_CHECK],
          minutes: 7,
        }),
      ],
    },
    {
      id: "phrases",
      title: "Sweeps inside phrases",
      goal: "Use a sweep as part of a line that goes somewhere, starting and ending in a scale or on a held note.",
      why: "Nobody wants to hear ten bars of arpeggio. What makes a sweep sound exciting is what comes either side of it: a line that arrives by sweep, then sings; a run that shoots up to a held bend. This Step turns the shapes into something you could actually play in a solo.",
      howTo: [
        "The held note after a sweep matters more than the sweep. Give it time and a little vibrato.",
        "Change technique cleanly. When a sweep ends, you go straight back to normal picking, with no moment of confusion in the hand.",
        "Use these as starting points. Write your own ending as soon as you can play the written one.",
      ],
      payoff: "Four phrases you can actually use in a solo, each one ending in a note that sings.",
      difficultyException:
        "Held notes pull the average rate well down. The new demand is changing technique mid-phrase and making it musical, which the metric does not count.",
      exercises: [
        sweepExercise({
          id: "sweep-then-scale",
          title: "Sweep up, scale down",
          purpose: "Up the Am shape, then run back down the scale with pull-offs. It is the most natural sweep phrase there is, and it ends on a held A with vibrato.",
          howTo: ["Hammer to 17, then three pull-offs on the top string (each pull sounds the next note), then pick the run down the B and G strings."],
          coach: "A chain of pull-offs may be too quiet for me, and that's fine. It's the picked notes I time and count.",
          tab: `/8t 3:14 2:13 1:12 1:17h 1:15p 1:13p 1:12p 2:15 2:13 2:12 3:14 3:12 | /2 3:14v /4 r r`,
          position: 12,
          shifts: true,
          harmony: { scale: ["A", "naturalMinor"], cover: true },
          rungs: ladder(60, 120, 5),
          passAt: 90,
          minutes: 7,
        }),
        sweepExercise({
          id: "lick-to-bend",
          title: "Two strings, a run, and a bend",
          purpose: "A three-string sweep into a two-string lick with a hammer and two pulls, finishing in a whole-tone bend: the minor pentatonic box with sweeps in it.",
          howTo: ["Sweep through G, B and E, then the lick. The last note is D on the G string, bent up to E and held with vibrato. Hear E on the B string first, so you know where the bend has to reach."],
          coach: "I time the picked notes. How far the bend went is up to your ear: compare it with the E at fret 5 on the B string.",
          tab: `/8t 3:5 2:5 1:5 1:8h 1:5p 2:8 2:5p 3:7 3:5 3:7 3:5 4:7 | /2 3:7b2v /4 r r`,
          position: 5,
          harmony: { scale: ["A", "minorPentatonic"], cover: true },
          rungs: ladder(60, 120, 5),
          passAt: 85,
          selfCheck: [ROLL_CHECK, "Did the bend reach the same pitch as the E on the B string, fret 5?"],
          minutes: 7,
        }),
        sweepExercise({
          id: "triad-pair",
          title: "Am up, G down",
          purpose: "Two triads in one gesture: Am up the strings, G back down. Together they give a modern, open sound, and you only have to know one small shape each.",
          howTo: ["Three up, pull off to fret 10, two more upstrokes down the strings. Loop it. It works over A minor or over a G chord, and hearing that is worth a minute."],
          coach: "Short and repeatable: this is a good one for the top of the ladder, which you'll judge by ear.",
          // Little, ring, middle, then the pull to the index at 10: the G comes back down on the ring finger.
          tab: `/8t ${repeat("3:14f4 2:13f3 1:12f2 1:10pf1 2:12f3 3:12f3", 2)}`,
          position: 10,
          harmony: { scale: ["A", "naturalMinor"] },
          rungs: ladder(60, 150, 10),
          passAt: 110,
          selfCheck: [ROLL_CHECK],
          minutes: 6,
        }),
        sweepExercise({
          id: "pickup-sweep",
          title: "A fast sweep as a pickup",
          purpose: "A long, held note, then one beat of fast sweep into the next bar. It is the sound of a sweep used sparingly, and it's where this Path's grading stops being trustworthy, even at these low tempos.",
          howTo: ["Sextuplets in the fourth beat only. Aim for the next downbeat. If the sextuplet is not perfect, the landing will still save the phrase."],
          coach: "Sextuplets are fast enough that I can only grade the slowest rungs, and even those are unproven. Trust your own ear above them.",
          tab: `/2 1:12v /4 r /16t 4:14 3:14 2:13 1:12 1:17h 1:12p | /2 2:13v /4 r /16t 4:14 3:14 2:13 1:12 2:13 3:14`,
          position: 12,
          harmony: { arpeggio: "Am", cover: true },
          rungs: ladder(40, 80, 5),
          passAt: 60,
          selfCheck: [ROLL_CHECK, "Did the phrase land on the downbeat, whatever happened in the sextuplet?"],
          minutes: 6,
        }),
      ],
    },
    {
      id: "over-the-progression",
      title: "The Intermediate etude, with the band",
      goal: "Play four- and five-string sweeps that follow Am, F, C, G over a band, an eight-bar etude that uses the whole Level, and one chorus you put together yourself.",
      why: "Everything so far has been against a click. A band is different: the bass already plays the root, so your arpeggio can start somewhere else, and the drums will happily cover you if you get lost for a beat. This is where it stops being an exercise and sounds like what you hoped to play.",
      howTo: [
        "Keep the volume honest: if the band is covering your mistakes, turn it down until they show.",
        "Use direct input or headphones for a graded take. A microphone also hears the band, and that hasn't been tested.",
        "Start each version at a rung where you can look up from the guitar. You're playing with people now, even if the people are samples.",
      ],
      payoff: "You play a sweep arpeggio solo over a band, and it follows the chords.",
      difficultyException:
        "One loop a bar and a band underneath: the note rate is lower than the chains before it. Playing a whole eight-bar etude in time with a band is the demand here, and the rate does not count it.",
      exercises: [
        sweepExercise({
          id: "band-four",
          title: "With the band: four strings",
          purpose: "The same progression at sixteenths on four strings. Here the graded rungs end while the tempo is still comfortable, so the top of the ladder is on your ear.",
          howTo: ["Two loops a bar, at a tempo the band can really sit in. Up to about 100 BPM the app can help. Above that, record and listen."],
          coach: "I can help on the slow rungs. Above them, a recording will tell you more than I can.",
          tab: `/16 ${repeat(am4, 2)} | ${repeat(f4, 2)} | ${repeat(c4, 2)} | ${repeat(g4, 2)}`,
          position: 12,
          shifts: true,
          chords: "Am | F | C | G",
          jam: { groove: "rock8", key: "A minor" },
          harmony: { chordTones: true, cover: true },
          rungs: ladder(60, 120, 5),
          passAt: 75,
          selfCheck: [ROLL_CHECK],
          minutes: 7,
        }),
        sweepExercise({
          id: "band-five",
          title: "With the band: five strings",
          purpose: "The big shapes through the whole progression. Keep it at a tempo where every note is separate: at this length, a smear is obvious.",
          howTo: ["One loop a bar, with Am and C at twelve notes, and F and G at ten and a rest. Use the rests to move."],
          coach: "On the rungs I grade, this is the hardest thing on the Path. Above them it is yours alone, and it is meant to be.",
          tab: `/8t ${am5} | ${f5} r r | ${c5} | ${g5} r r`,
          position: 12,
          shifts: true,
          chords: "Am | F | C | G",
          jam: { groove: "rockTwelveEight", key: "A minor" },
          harmony: { chordTones: true, cover: true },
          rungs: ladder(60, 130, 5),
          passAt: 85,
          selfCheck: [ROLL_CHECK],
          minutes: 8,
        }),
        sweepExercise({
          id: "etude",
          title: "The Intermediate etude",
          purpose: "Eight bars written for this Path, using everything in the Level: A-shapes and E-shapes through Am, F, C and G, three-string loops through Dm and E, a tapped A minor, and a sweep up to a held high A.",
          howTo: [
            "Bars 1 and 2: A minor and F in A-shapes around fret 12. Bars 3 and 4: C in its E-shape at fret 8, then G from fret 10 on the A string, the shape from the five-string Step, each with a two-note rest to move in. Bars 5 and 6 drop to three strings, two loops a chord. Bar 7 is the tapped A minor shape. Bar 8 sweeps up and holds the A at fret 17 for two beats, with vibrato.",
            "Learn it in two-bar pieces first, slowly, then join them up. The moves into bars 3, 5 and 7 are the ones to practise alone.",
          ],
          coach: "Graded on the slower rungs, on direct input. I report timing and notes heard; whether it sounds like a solo is for you and a recording.",
          tab: ETUDE,
          position: 12,
          shifts: true,
          chords: "Am | F | C | G | Dm | E | Am | Am",
          jam: { groove: "rockTwelveEight", key: "A minor" },
          harmony: { chordTones: true, cover: true },
          rungs: ladder(60, 130, 5),
          passAt: 90,
          pass: SLIDE_BARS,
          selfCheck: [ROLL_CHECK, LINK_CHECK, "Did the held A in the last bar ring for its full two beats?"],
          minutes: 8,
        }),
        sweepExercise({
          id: "your-chorus",
          title: "Your own eight bars",
          purpose: "A written example chorus that mixes three-string shapes, five-string shapes and a phrase ending. Learn it, then replace any bar with your own. Nothing here is graded, on purpose.",
          howTo: ["Record it. Listen for the moments where it sounds like music and the moments it sounds like an exercise. Change the second kind."],
          coach: "No score on this one. It's your chorus, so you decide when it's done.",
          tab: `/8t ${am5} | ${f5} r r | ${twoPerBar(c3)} | ${twoPerBar(g3)} | ${am5} | ${f5} r r | ${c5} | /2 3:12v /4 r r`,
          position: 12,
          shifts: true,
          chords: "Am | F | C | G | Am | F | C | G",
          jam: { groove: "rockTwelveEight", key: "A minor" },
          harmony: { chordTones: true, cover: true },
          rungs: ladder(60, 120, 5),
          grade: "selfChecked",
          selfCheck: [ROLL_CHECK, "Did the shape changes land with the band?", "Would you be happy for another guitarist to hear this?"],
          minutes: 8,
        }),
      ],
    },
];


/** Linked passes, one chord a bar, over a progression in a key. */
function linkedVariant(strings: readonly number[], near: number, rhythm: string, extra = false) {
  return (p: VariantParams) => {
    const { chart, chords } = keyed(p);
    const raw = linkedSweep({ chords, strings, near: nearFor(strings, near, p.key), rhythm, extra });
    const tab = strings.length === 6 ? sixStringMinorFingers(raw) : raw;
    // The six-string shape starts with the little finger on the low E: the index is three frets below it.
    const position = strings.length === 6 ? Number(/6:(\d+)/.exec(tab)![1]) - 3 : handAt(tab);
    return { tab, position, chords: chart };
  };
}

/**
 * The minor shape from the low E (A minor: 17, 15, 14, 14, 13, 12) is wider than
 * a hand, so it is written with its shift (fingering audit 2): little, middle,
 * then the index rolling across the D and G strings at 14, and the hand moves
 * down three frets so ring and middle take the B and top strings. The middle
 * finger on the top note leaves the index free for the pull or hammer into the
 * next chord. Bar 1 is always this shape.
 */
function sixStringMinorFingers(tab: string): string {
  const bars = tab.split("|");
  let k = 0;
  const fingers = [4, 2, 1, 1, 3, 2];
  bars[0] = bars[0].replace(/\d:\d+\S*/g, (note) => note.replace(/^(\d:\d+)/, `$1f${fingers[k++]}`));
  if (k !== 6) throw new Error(`the six-string minor shape has ${k} notes, not 6`);
  return bars.join("|");
}

/** Voice-led loops, one chord a bar, over a progression in a key. */
function chainVariant(
  strings: readonly number[],
  near: number,
  rhythm: string,
  perBar: number,
  doubleLow = false,
) {
  return (p: VariantParams) => {
    const { chart, chords } = keyed(p);
    const tab = sweepChain({ chords, strings, near: nearFor(strings, near, p.key), perBar, doubleLow, rhythm });
    return { tab, position: handAt(tab), chords: chart };
  };
}

const JUMP_SHIFT: Readonly<Record<string, number>> = { A: 0, G: -2, F: -4, Bb: 1 };
const JUMP_KEYS = ["A", "G", "F", "Bb"] as const;

const NEW_STEPS: StepSpec[] = [
  {
    id: "the-link",
    title: "The link: two shapes",
    goal: "Get from one arpeggio into the next with no gap and no extra pick stroke, slowly enough to hear the join.",
    why: "Linked arpeggios are what make a sweep sound like a solo and not an exercise, and the link is a separate skill from either shape. Almost everyone practises the shapes and hopes the join comes along. It doesn't: the join is where the pick stops, the hand arrives late and a note gets lost. So here it gets practised alone, as slowly as you like, with nothing else to think about.",
    howTo: [
      "A link is one small move of the fretting hand. On the top or bottom string, step from the last note of the old shape to the nearest note of the new one with a hammer, a pull or a slide. The pick does nothing at that moment.",
      "Choose the nearest note of the new chord, not the root. Good links barely move the hand, which is why the shapes here may look unfamiliar.",
      "Look ahead. Know the note you are stepping to before you play the note you are stepping from.",
      "Keep muting through the change: the last note of the old shape stops as the new one sounds.",
    ],
    payoff: "You hear one line carry on across a chord change, and a chord change that happens under your fingers instead of between two shapes.",
    difficultyException:
      "Deliberately the slowest thing in this Level: half notes, then one pass a bar. A link is a new skill and the note rate has no way to count it.",
    exercises: [
      sweepExercise({
        id: "link-alone",
        title: "Just the link",
        purpose: "Four notes in half notes: the last two of one shape, the first two of the next. There is nothing to do but hear the chord change on one small move.",
        howTo: [
          "Bar 1 is the end of the old shape, bar 2 the start of the new one. The first note of bar 2 is not picked: hammer, pull or slide to it, and only then cross to the next string.",
          "Say the chord names. If you can't tell which chord you're on, slow down until you can.",
        ],
        coach: "Very slow on purpose. Say each chord's name as you land on it: that's the check that matters here.",
        vary: {
          values: { progression: ["Am to F", "Am to G", "Am to E", "Am to Dm", "F to G", "Dm to E"], key: MINOR_KEYS },
          pooled: ["progression", "key"],
          label: (p) => `${p.key} minor: ${p.progression}, moved`,
          build: (p) => {
            const [a, b] = p.progression.split(" to ");
            const shift = KEY_SHIFT[p.key];
            const from = moveChart(a, shift).trim();
            const to = moveChart(b, shift).trim();
            const tab = linkFragment({ chords: [from, to], strings: [3, 2, 1], near: a === "Am" ? NEAR_THREE[p.key] : nearFret(10, shift) });
            return { tab, position: handAt(tab), shifts: true, chords: `${from} | ${to}` };
          },
        },
        chain: { maxJointFrets: 5 },
        harmony: { chordTones: true },
        rungs: ladder(60, 95, 5),
        passAt: 80,
        minutes: 5,
      }),
      sweepExercise({
        id: "two-shapes",
        title: "Up one chord, down the next",
        purpose: "The whole gesture in two bars: one chord up the strings, the link at the top, the next chord back down, and a link at the bottom to go round again.",
        howTo: [
          "Triplets that take a whole bar for three notes. The pick pushes up through three strings, waits, then pushes down through the next shape.",
          "Every note on an outer string after the first is legato. If you hear a pick attack at a link, that's the thing to fix.",
        ],
        coach: "I report whether each note came in time. Whether a link was picked is up to your ear.",
        vary: {
          values: { progression: ["Am to G", "Am to E", "F to G", "Dm to E"], key: MINOR_KEYS },
          pooled: ["progression", "key"],
          label: (p) => `${p.key} minor: ${p.progression}, moved`,
          build: (p) => {
            const [a, b] = p.progression.split(" to ");
            const shift = KEY_SHIFT[p.key];
            const chords = [moveChart(a, shift).trim(), moveChart(b, shift).trim()];
            const tab = linkedSweep({ chords, strings: [3, 2, 1], near: a === "Am" ? NEAR_THREE[p.key] : nearFret(10, shift), rhythm: "/2t" });
            return { tab, position: handAt(tab), shifts: true, chords: chords.join(" | ") };
          },
        },
        chain: { maxJointFrets: 5 },
        harmony: { chordTones: true },
        rungs: ladder(60, 160, 10),
        passAt: 120,
        minutes: 6,
      }),
      sweepExercise({
        id: "round-the-loop",
        title: "The other link: round the bottom",
        purpose: "Loop one shape, and at the bottom of the loop carry on into the next shape. It's the link you will use most, because the shape has already gone up and come back.",
        howTo: ["One loop to a bar, slowly. The upward push that finishes one shape carries straight on into the first note of the next: don't stop it, and don't restart it."],
        coach: "Listen for a gap at the bar line. It's the one thing here that a recording shows at once.",
        vary: {
          values: { progression: ["Am F", "Am G", "Am E", "Am Dm"], key: MINOR_KEYS },
          pooled: ["progression", "key"],
          label: (p) => `${p.key} minor: ${p.progression.replace(" ", " to ")}, moved`,
          build: (p) => {
            const shift = KEY_SHIFT[p.key];
            const chords = p.progression.split(" ").map((c) => moveChart(c, shift).trim());
            const tab = sweepChain({ chords, strings: [3, 2, 1], near: NEAR_THREE[p.key], rhythm: "/4t" });
            return { tab, position: handAt(tab), shifts: true, chords: chords.join(" | ") };
          },
        },
        chain: { maxJointFrets: 5 },
        harmony: { chordTones: true },
        rungs: ladder(60, 140, 10),
        passAt: 110,
        minutes: 6,
      }),
    ],
  },
  {
    id: "link-chains",
    title: "Chains of links",
    goal: "Link four chords in a row on three strings, without stopping, in any minor key.",
    why: "Once two shapes link, the question becomes how long you can keep it going. A four-chord chain is the unit of real playing, and the minor-key loops here are the most common things you will be asked to sweep over. The moves are small, so the hard part is keeping your place: you should know which chord is next without counting.",
    howTo: [
      "Learn the chords by ear first. Play the progression's roots, once through, on the low strings.",
      "Each chord's shape starts as near as it can to the last one. Don't reach for the shape you know best: reach for the nearest one.",
      "If a link trips you, go back to two shapes and repeat that one link. Don't push through it.",
    ],
    payoff: "A four-chord minor progression comes out of one unbroken sweep, in whichever key you land on today.",
    exercises: [
      sweepExercise({
        id: "one-pass-each",
        title: "One pass per chord",
        purpose: "Up, link, down, link, through four chords. It's the cleanest way to hear a chain: every chord change is a single small step.",
        howTo: ["Three notes a bar. Sing the progression's top notes if you can: they make a tune."],
        coach: "Four links per round. I report evenness and notes heard at these tempos.",
        vary: {
          values: { progression: [...MINOR_LOOP, "i-VII-VI-V"], key: MINOR_KEYS },
          pooled: ["progression", "key"],
          label: labelKeyed,
          build: (p) => ({ ...linkedVariant([3, 2, 1], 14, "/2t")(p), shifts: true }),
        },
        chain: { maxJointFrets: 5 },
        harmony: { chordTones: true },
        rungs: ladder(60, 180, 10),
        passAt: 140,
        minutes: 6,
      }),
      sweepExercise({
        id: "looped-chain",
        title: "Two loops per chord",
        purpose: "Each shape twice, then on to the next, so you get a second try at every shape before it changes.",
        howTo: ["Triplets. The hand stays almost still: look how little the frets change from bar to bar."],
        coach: "This should feel like one long gesture. If it comes out in four separate pieces, slow down a rung.",
        vary: {
          values: { progression: [...MINOR_LOOP], key: MINOR_KEYS },
          pooled: ["progression", "key"],
          label: labelKeyed,
          build: (p) => ({ ...chainVariant([3, 2, 1], 14, "/8t", 2)(p), shifts: true }),
        },
        chain: { maxJointFrets: 5 },
        harmony: { chordTones: true },
        rungs: ladder(60, 130, 5),
        passAt: 90,
        minutes: 7,
      }),
      sweepExercise({
        id: "start-anywhere",
        title: "Start somewhere else",
        purpose: "The same chain starting from each of Am's three shapes, so a chain isn't tied to one place on the neck.",
        howTo: ["Fret 5, fret 8 and fret 12 starts. The low one rolls a barre across three strings and the frets are wider, so it is its own Exercise as far as progress is concerned."],
        coach: "The low start usually sounds different and feels harder. I keep its tempo separately.",
        vary: {
          values: { position: ["fret 12", "fret 8", "fret 5"], progression: [...MINOR_LOOP] },
          pooled: ["progression"],
          notPooled: { position: "Lower frets are wider and the low shape is a barre roll, so its clean tempo isn't the high shape's." },
          label: (p) => `${p.progression} from ${p.position}`,
          build: (p) => {
            const near = p.position === "fret 12" ? 14 : p.position === "fret 8" ? 9 : 5;
            const chart = PROGRESSIONS[p.progression];
            const tab = sweepChain({ chords: chart.split("|").map((c) => c.trim()), strings: [3, 2, 1], near, perBar: 2, rhythm: "/8t" });
            return { tab, position: handAt(tab), shifts: true, chords: chart };
          },
        },
        chain: { maxJointFrets: 5 },
        harmony: { chordTones: true },
        rungs: ladder(60, 120, 5),
        passAt: 85,
        minutes: 7,
      }),
    ],
  },
  {
    id: "long-chains",
    title: "Four and five strings, linked",
    goal: "Chain the big shapes, and mix short and long shapes in one line.",
    why: "The bigger the shape, the further the hand has to come back at the end of it, so links on five strings need more planning than links on three. It also pays best: this is the sound of a fast minor-key lead break. Mixing lengths matters too, because a line of one length sounds like a pattern, and a three-string shape in the middle of big ones gives you somewhere to breathe.",
    howTo: [
      "Plan the link from the bottom of each shape: the last note on the A string walks to the first note of the next shape.",
      "With five strings there's a lot to keep silent, and the mute has to travel across every change as well.",
      "Mixed lengths: keep the beat the same when the shape gets shorter. The short shape fills the bar with two loops.",
    ],
    payoff: "A long chain over a whole progression, big enough to sound like a solo.",
    exercises: [
      sweepExercise({
        id: "chain-four",
        title: "Four strings, in a chain",
        purpose: "Two loops of each four-string shape, voice-led. The band-sized sound with short moves.",
        howTo: ["Sixteenths. The shift back to the first shape is the fastest move here."],
        coach: "Graded at every rung here. Even so, a recording tells you things I can't.",
        vary: {
          values: { progression: [...MINOR_LOOP], key: MINOR_KEYS },
          pooled: ["progression", "key"],
          label: labelKeyed,
          build: (p) => ({ ...chainVariant([4, 3, 2, 1], 14, "/16", 2)(p), shifts: true }),
        },
        chain: { maxJointFrets: 5 },
        harmony: { chordTones: true },
        rungs: ladder(60, 95, 5),
        passAt: 75,
        minutes: 7,
      }),
      sweepExercise({
        id: "chain-five",
        title: "Five strings, in a chain",
        purpose: "One big loop to a chord, through four chords. The shapes sit together, so most links are a fret or two.",
        howTo: ["Triplets. Watch the first note of each bar: it hardly moves, even though the chord does."],
        coach: "This is the big one. Keep it where every note is separate.",
        vary: {
          values: { progression: [...MINOR_LOOP], key: MINOR_KEYS },
          pooled: ["progression", "key"],
          label: labelKeyed,
          build: (p) => ({ ...chainVariant([5, 4, 3, 2, 1], 12, "/8t", 1, true)(p), shifts: true }),
        },
        chain: { maxJointFrets: 6 },
        harmony: { chordTones: true },
        rungs: ladder(60, 130, 10),
        passAt: 90,
        pass: SLIDE_BARS,
        selfCheck: [LINK_CHECK, ROLL_CHECK],
        minutes: 8,
      }),
      sweepExercise({
        id: "mixed-lengths",
        title: "Short and long in one line",
        purpose: "Three-string and five-string shapes in turn over one progression. It stops sounding like a pattern as soon as the lengths change.",
        howTo: ["The three-string bars have two loops and the five-string bars have one. Each has twelve notes, so the beat doesn't change."],
        coach: "Same note rate in every bar, so an uneven take here points at one of the changes.",
        vary: {
          values: { shapeOrder: ["short first", "long first"], key: ["A", "C", "E", "G"] },
          pooled: ["shapeOrder", "key"],
          label: (p) => `${p.key} minor, ${p.shapeOrder}`,
          build: (p) => {
            const shift = KEY_SHIFT[p.key];
            const chart = moveChart(PROGRESSIONS["i-VI-III-VII"], shift);
            const chords = chart.split("|").map((c) => c.trim());
            const shortFirst = p.shapeOrder === "short first";
            const spots = (shortFirst ? [14, 8, 12, 10] : [12, 10, 10, 12]).map((fret) => fret + shift);
            const tab = chords
              .map((chord, index) => {
                const short = (index % 2 === 0) === shortFirst;
                return short
                  ? sweepChain({ chords: [chord], strings: [3, 2, 1], near: spots[index], perBar: 2, rhythm: "/8t" })
                  : sweepChain({ chords: [chord], strings: [5, 4, 3, 2, 1], near: spots[index], doubleLow: true, rhythm: "/8t" });
              })
              .join(" | ");
            return { tab, position: handAt(tab), shifts: true, chords: chart };
          },
        },
        harmony: { chordTones: true },
        rungs: ladder(60, 130, 5),
        passAt: 85,
        pass: SLIDE_BARS,
        selfCheck: [LINK_CHECK],
        minutes: 8,
      }),
    ],
  },
  {
    id: "minor-progressions",
    title: "Minor keys and the V chord",
    goal: "Link through the harmonic-minor movement: the major V chord pulling back to i.",
    why: "A natural-minor loop goes round forever and never needs to resolve. The major V chord is what changes that: its G# sits a half step under A and pulls back to it, and that pull is the dark, dramatic sound of metal and neoclassical playing. These progressions are shared vocabulary, and the thing to learn is the half-step move: it is the link you will come to love.",
    howTo: [
      "E major in A minor contains G#, a note A minor doesn't have. Find it in the shape. It is where the sound comes from.",
      "Aim for the G# to A step at the resolution, and hear it before you play it.",
      "Bdim to E to Am is the minor two-five-one. It is the same pull with one more chord of warning.",
    ],
    payoff: "You hear a chord pull back to the minor at the end of a sweep, and a progression sounds like it's going somewhere.",
    exercises: [
      sweepExercise({
        id: "the-pull",
        title: "i to V and back",
        purpose: "Only two chords, so all of your attention goes on the half step from G# to A, on three strings.",
        howTo: ["One bar of each, twice round. Slow enough to hear the note that changes."],
        coach: "Listen for the G# rising to A. I report the timing; the half step is for your ear.",
        vary: {
          values: { key: MINOR_KEYS },
          pooled: ["key"],
          label: (p) => `${p.key} minor`,
          build: (p) => {
            const shift = KEY_SHIFT[p.key];
            const chart = moveChart("Am | E | Am | E", shift);
            const tab = sweepChain({ chords: chart.split("|").map((c) => c.trim()), strings: [3, 2, 1], near: NEAR_THREE[p.key], perBar: 2, rhythm: "/8t" });
            return { tab, position: handAt(tab), shifts: true, chords: chart };
          },
        },
        chain: { maxJointFrets: 5 },
        harmony: { chordTones: true },
        rungs: ladder(60, 130, 5),
        passAt: 90,
        minutes: 6,
      }),
      sweepExercise({
        id: "with-the-v-three",
        title: "Three progressions with a V",
        purpose: "i-iv-V-i, i-VI-iv-V and i-V-VI-V, on three strings, in any key. These are the loops this style lives on.",
        howTo: ["Two loops a chord. The bar with the V is the one to listen to."],
        coach: "Same bar as before. The major chord in a minor key is the new thing.",
        vary: {
          values: { progression: [...WITH_THE_V], key: MINOR_KEYS },
          pooled: ["progression", "key"],
          label: labelKeyed,
          build: (p) => ({ ...chainVariant([3, 2, 1], 14, "/8t", 2)(p), shifts: true }),
        },
        chain: { maxJointFrets: 5 },
        harmony: { chordTones: true },
        rungs: ladder(60, 130, 5),
        passAt: 90,
        minutes: 7,
      }),
      sweepExercise({
        id: "linked-with-the-v",
        title: "One pass per chord, on four strings",
        purpose: "The same harmony as single passes across four strings, with a link at each end, so that it sounds like a line.",
        howTo: ["Four quarter notes a bar, and a breath before going round. Every chord gets one pass only, so you can't hide a wrong shape."],
        coach: "Slow notes and a big move at each link. Every note has to arrive on time, and that's what I report.",
        vary: {
          values: { progression: [...WITH_THE_V], key: MINOR_KEYS },
          pooled: ["progression", "key"],
          label: labelKeyed,
          build: (p) => ({ ...linkedVariant([4, 3, 2, 1], 14, "/4")(p), shifts: true }),
        },
        loops: false,
        chain: { maxJointFrets: 5 },
        harmony: { chordTones: true },
        rungs: ladder(60, 180, 10),
        passAt: 140,
        minutes: 6,
      }),
      sweepExercise({
        id: "minor-two-five-one",
        title: "ii°, V, i",
        purpose: "The minor two-five-one, with the diminished ii giving a chord of warning before the V. It's a move you can drop in at the end of any minor progression.",
        howTo: ["Two loops a chord on three strings; the last bar's Dm leads you round again. B diminished is B, D and F: the B minor shape with its top note a fret lower."],
        coach: "If it sounds dark and resolved, that's on your ear. I'll report the timing.",
        vary: {
          values: { key: ["A", "E", "D"] },
          pooled: ["key"],
          label: (p) => `${p.key} minor`,
          build: (p) => {
            const shift = KEY_SHIFT[p.key];
            const chart = moveChart(PROGRESSIONS["ii°-V-i-iv"], shift);
            const tab = sweepChain({ chords: chart.split("|").map((c) => c.trim()), strings: [3, 2, 1], near: NEAR_THREE[p.key] + 2, perBar: 2, rhythm: "/8t" });
            return { tab, position: handAt(tab), shifts: true, chords: chart };
          },
        },
        chain: { maxJointFrets: 5 },
        harmony: { chordTones: true },
        rungs: ladder(60, 130, 5),
        passAt: 85,
        minutes: 6,
      }),
    ],
  },
  {
    id: "six-strings",
    title: "Six strings",
    goal: "Own a clean six-string sweep from the low E, minor and major, and link passes across all six.",
    why: "Six strings is the longest push you can make, and it is a real physical challenge, since the arm travels the whole width of the neck and every string behind the pick has to stay quiet. It adds less new music than the step from three to five did. Come to it for the sound and for the discipline: a clean six-string sweep shows up any weakness in your muting at once.",
    howTo: [
      "The arm does this. The wrist stays quiet, and the forearm carries the pick from the low E to the high E in one long push.",
      "Muting is the whole game: palm on what's behind the pick, the fretting fingers rolling off what's in front of it. Low strings ring loudest, so check them first.",
      "Grading on these is limited: only the slowest rungs are graded, and even those have never been tried on a real guitar.",
    ],
    payoff: "A sweep from the lowest note on the guitar to near the highest, with every note separate.",
    exercises: [
      sweepExercise({
        id: "minor-six",
        title: "Minor, from the low E",
        purpose: "The six-string minor shape, the five-string one with one more string under it. A rest at the end of each loop lets you listen for ringing.",
        howTo: ["Fourteen sixteenths and a rest. Hammer on the low E and on the top string. Up to 100 BPM it can be graded, and above that it's your own ear."],
        coach: "Graded only to 100 BPM. Trust a recording above that: long sweeps are where I'm least sure of myself.",
        vary: {
          values: { key: ["A", "B", "C", "D", "E"] },
          pooled: ["key"],
          label: (p) => `${p.key} minor`,
          build: (p) => {
            const near: Record<string, number> = { A: 5, B: 7, C: 8, D: 10, E: 12 };
            const tab = `/16 ${sweepLoop({ chord: `${p.key}m`, strings: [6, 5, 4, 3, 2, 1], near: near[p.key], doubleLow: true })} r r`;
            return { tab, position: handAt(tab), harmony: { arpeggio: `${p.key}m`, cover: true } };
          },
        },
        rungs: ladder(60, 130, 5),
        passAt: 80,
        selfCheck: [ROLL_CHECK, NOISE_CHECK],
        minutes: 7,
      }),
      sweepExercise({
        id: "major-six",
        title: "Major, from the low E",
        purpose: "The major shape, higher up the neck, where the top-string reach fits under the hand. These are wide shapes, and they're why this comes after five strings.",
        howTo: ["Twelve triplets: there's no hammer at the bottom on this shape, so the low note gets a pick turn."],
        coach: "Graded up to about 130 BPM on these triplets, and I'd still trust a recording.",
        vary: {
          values: { key: ["F", "G", "A"] },
          pooled: ["key"],
          label: (p) => `${p.key} major`,
          build: (p) => {
            const near: Record<string, number> = { F: 13, G: 15, A: 17 };
            const tab = `/8t ${sweepLoop({ chord: p.key, strings: [6, 5, 4, 3, 2, 1], near: near[p.key] })}`;
            // Six frets wide: the index starts on the D, G and B strings' fret and moves down for the top string.
            return { tab, position: handAt(tab) + 2, shifts: true, harmony: { arpeggio: p.key, cover: true } };
          },
        },
        rungs: ladder(60, 150, 10),
        passAt: 90,
        selfCheck: [ROLL_CHECK, NOISE_CHECK],
        minutes: 7,
      }),
      sweepExercise({
        id: "six-string-links",
        title: "Six-string passes, linked",
        purpose: "One chord up all six strings, a link on the top string, the next chord back down. It's the widest link there is.",
        howTo: ["Six notes a bar, starting up near fret 17. Every pass is the whole width of the neck."],
        coach: "Slower note rate than it looks, so this is gradable for longer. It's a good place to check your muting by ear.",
        vary: {
          values: { progression: ["i-VII-VI-VII", "i-VI-III-VII", "i-iv-V-i"], key: ["A", "G", "E"] },
          pooled: ["progression", "key"],
          label: labelKeyed,
          build: (p) => ({ ...linkedVariant([6, 5, 4, 3, 2, 1], 17, "/4t")(p), shifts: true }),
        },
        chain: { maxJointFrets: 5 },
        harmony: { chordTones: true },
        rungs: ladder(60, 180, 10),
        passAt: 120,
        selfCheck: [LINK_CHECK, ROLL_CHECK],
        minutes: 8,
      }),
    ],
  },
  {
    id: "fast-shifts",
    title: "Wide shapes and fast shifts",
    goal: "Jump between shapes far apart on the neck, and play sweeps fast enough that grading no longer applies.",
    why: "Everything until now has moved a fret or two. Sometimes a line needs an octave jump, and that's a throw of the whole arm that has to land exactly. This is also where speed comes in, so it's where the app can't help much: you'll be working by recording and by ear, as players always have.",
    howTo: [
      "Look at the landing spot before you leave. The hand follows the eye.",
      "A shift is one fast movement and then stillness. Land early and let the note come to you.",
      "Fast rungs are self-checked. Record yourself and slow the recording down: nothing is more honest than that.",
    ],
    payoff: "A line that jumps the neck, and a burst of sweep at a speed you couldn't have played a month ago.",
    difficultyException:
      "Its shapes are the three-string triads already known; the demand is the jump between them, which the score counts as one shift. Six strings rates higher since the major six-string shape was fingered honestly: six frets wide, its hand moves inside the shape (fingering audit, 2026-11-18).",
    exercises: [
      sweepExercise({
        id: "octave-jump",
        title: "The octave jump",
        purpose: "The same triad an octave apart, with twelve frets to cover in the time of one note. This trains a throw of the arm that lands.",
        howTo: ["Two loops, then jump. The first note after the jump is what tells you if you got there."],
        coach: "A note missing after the jump is the thing to listen for. I can usually hear whether that note arrived.",
        vary: {
          values: { key: JUMP_KEYS },
          pooled: ["key"],
          label: (p) => `${p.key} minor`,
          build: (p) => {
            const shift = JUMP_SHIFT[p.key];
            const chord = moveChart("Am", shift).trim();
            const low = 5 + shift;
            const lowLoop = sweepLoop({ chord, strings: [3, 2, 1], near: low, slideTop: low < 5 });
            const highLoop = sweepLoop({ chord, strings: [3, 2, 1], near: low + 12 });
            const tab = `/8t ${repeat(lowLoop, 2)} | ${repeat(highLoop, 2)}`;
            return { tab, position: handAt(tab), shifts: true, harmony: { arpeggio: chord, cover: true } };
          },
        },
        rungs: ladder(60, 130, 5),
        passAt: 85,
        selfCheck: [ROLL_CHECK],
        minutes: 6,
      }),
      sweepExercise({
        id: "inversion-runs",
        title: "Up the neck through the inversions",
        purpose: "A sextuplet run on one chord, moving to the next shape every beat, climbing the neck. Each beat is a real shift at speed. Almost all of this ladder is above what can be graded.",
        howTo: ["Sextuplets: three up, three down, four shapes a bar. Start slowly with one beat of each, and only then join them up."],
        coach: "Sextuplets are graded only to about 65 BPM. Above that, this one is yours to judge, on a recording.",
        vary: {
          values: { key: JUMP_KEYS },
          pooled: ["key"],
          label: (p) => `${p.key} minor`,
          build: (p) => {
            const shift = JUMP_SHIFT[p.key];
            const chord = moveChart("Am", shift).trim();
            const base = 5 + shift;
            const shapes = [0, 4, 9, 12].map((up) => sweepLoop({ chord, strings: [3, 2, 1], near: base + up, slideTop: base + up < 7 }));
            const tab = `/16t ${shapes.join(" ")}`;
            return { tab, position: handAt(tab), shifts: true, harmony: { arpeggio: chord, cover: true } };
          },
        },
        loops: false,
        rungs: ladder(40, 90, 5),
        passAt: 60,
        selfCheck: [ROLL_CHECK, "On a slowed-down recording, can you still count six notes in every beat?"],
        minutes: 6,
      }),
      sweepExercise({
        id: "big-shape-jumps",
        title: "Five strings, two positions",
        purpose: "A five-string loop on one chord, then the same chord on four strings at twice the note rate. The change of rate and shape at the bar line is the point.",
        howTo: ["Triplets, then sixteenths on the next bar. The rhythm changes as the shape changes, so the last note of the first shape has to let go early."],
        coach: "If notes go missing at the jump, go back a rung. I can only report that they went missing, not why.",
        vary: {
          values: { key: ["A", "G", "F"] },
          pooled: ["key"],
          label: (p) => `${p.key} minor`,
          build: (p) => {
            const shift = JUMP_SHIFT[p.key];
            const chord = moveChart("Am", shift).trim();
            const first = sweepChain({ chords: [chord], strings: [5, 4, 3, 2, 1], near: 12 + shift, doubleLow: true, rhythm: "/8t" });
            const second = sweepChain({ chords: [chord], strings: [4, 3, 2, 1], near: 2 + shift + 12, perBar: 2, rhythm: "/16" });
            const tab = `${first} | ${second}`;
            return { tab, position: handAt(tab), shifts: true, harmony: { arpeggio: chord, cover: true } };
          },
        },
        rungs: ladder(60, 120, 5),
        passAt: 70,
        pass: SLIDE_BARS,
        selfCheck: [ROLL_CHECK],
        minutes: 6,
      }),
    ],
  },
  {
    id: "neoclassical",
    title: "Neoclassical sequences",
    goal: "Play the moves that give this style its sound: diminished shapes climbing in minor thirds, and triads walking up the harmonic minor scale.",
    why: "Baroque-flavoured metal comes from a few harmonic ideas played very fast: the major V, the diminished seventh on its leading tone, and triads walked in sequence. You've met the first two. A sequence adds the sense of a long line unfolding, and a diminished chord that moves three frets at a time is the most fun you can have with one shape.",
    howTo: [
      "A diminished seventh is the same four notes every three frets. So G#dim7, Bdim7, Ddim7 and Fdim7 are one sound in four places.",
      "In a sequence, hear each bar as the next step of one melody. The top notes usually tell the tale.",
      "These are original lines in a shared style, and meant as starting points: write your own as soon as you can.",
    ],
    payoff: "The unmistakable sound of a neoclassical run, in lines you can change and call your own.",
    exercises: [
      sweepExercise({
        id: "diminished-resolves",
        title: "Diminished resolving to Am",
        purpose: "Am to G# diminished 7 and back: the shape moves up three frets with the same notes, then resolves. This is the neoclassical sound in one line.",
        howTo: [
          "G#dim7 at fret 10 and Bdim7 at fret 13 are the same four notes, played from different places. Only the shape's position changes.",
          "Hear the G# pull up to A at the end of the line.",
        ],
        coach: "Well done if this sounds dramatic. I report timing and notes heard; the sound is yours to judge.",
        tab: `/8t ${twoPerBar(am3)} | ${twoPerBar(gsDim)} | ${twoPerBar(bDim7)} | ${twoPerBar(am3)}`,
        position: 12,
        shifts: true,
        chords: "Am | G#dim7 | Bdim7 | Am",
        harmony: { chordTones: true, cover: true },
        rungs: ladder(60, 120, 5),
        passAt: 90,
        minutes: 6,
      }),
      sweepExercise({
        id: "i-iv-dim-i",
        title: "i, iv, vii°, i",
        purpose: "Two loops of each shape through the classic cadence, with the diminished seventh in place of the V. It's the same pull with a sharper edge.",
        howTo: ["Triplets. Hear the G# in the third bar rise to the A at the start of the fourth."],
        coach: "I report timing and notes heard. It sounds grand, I hope, but that part is for you to judge.",
        vary: {
          values: { key: MINOR_KEYS },
          pooled: ["key"],
          label: (p) => `${p.key} minor`,
          build: (p) => {
            const shift = KEY_SHIFT[p.key];
            const chart = moveChart("Am | Dm | G#dim7 | Am", shift);
            const tab = sweepChain({ chords: chart.split("|").map((c) => c.trim()), strings: [3, 2, 1], near: NEAR_THREE[p.key], perBar: 2, rhythm: "/8t" });
            return { tab, position: handAt(tab), shifts: true, chords: chart };
          },
        },
        chain: { maxJointFrets: 5 },
        harmony: { chordTones: true },
        rungs: ladder(60, 130, 5),
        passAt: 95,
        minutes: 6,
      }),
      sweepExercise({
        id: "diminished-ladder",
        title: "The diminished ladder",
        purpose: "One shape climbing three frets at a time: same notes, a new place each bar. This is the easiest big sound on the neck.",
        howTo: ["Two loops of the shape, then up three frets. Nothing else changes. Every bar is the same chord, just somewhere new."],
        coach: "This one is easy to play fast and hard to play evenly. I'll tell you about the even part.",
        vary: {
          values: { key: ["G#", "A", "Bb", "B", "C"] },
          pooled: ["key"],
          label: (p) => `${p.key} diminished seventh`,
          build: (p) => {
            const near: Record<string, number> = { "G#": 7, A: 8, Bb: 9, B: 10, C: 11 };
            const start = near[p.key];
            const root = `${p.key}dim7`;
            const bars = [0, 3, 6, 9].map((up) => `/8t ${repeat(sweepLoop({ chord: root, strings: [3, 2, 1], near: start + up }), 2)}`);
            const tab = bars.join(" | ");
            return { tab, position: handAt(tab), shifts: true, harmony: { arpeggio: root, cover: true } };
          },
        },
        rungs: ladder(60, 130, 5),
        passAt: 95,
        minutes: 5,
      }),
      sweepExercise({
        id: "walking-triads",
        title: "Triads up the harmonic minor",
        purpose: "The chords of the harmonic minor, walking up the neck a step at a time. It's a sequence: a long line that unfolds, and it finishes high on the V. It leaves out the third degree, whose augmented chord doesn't suit this style.",
        howTo: ["One chord a bar, and each shape sits higher than the last. Note the two chords the harmonic minor changes: E major and G# diminished. This one runs once through and stops."],
        coach: "Eight bars is long. If you get lost, the chord names on the tab are the way back in.",
        vary: {
          values: { key: ["A", "G", "Bb"] },
          pooled: ["key"],
          label: (p) => `${p.key} harmonic minor`,
          build: (p) => {
            const shift = JUMP_SHIFT[p.key];
            const chart = moveChart("Am | Bdim7 | Dm | E | F | G#dim7 | Am | E", shift);
            const tab = sweepChain({
              chords: chart.split("|").map((c) => c.trim()),
              strings: [3, 2, 1],
              near: 5 + shift,
              nears: [5, 7, 10, 12, 14, 16, 17, 16].map((fret) => fret + shift),
              perBar: 2,
              rhythm: "/8t",
            });
            return { tab, position: handAt(tab), shifts: true, chords: chart };
          },
        },
        loops: false,
        chain: { maxJointFrets: 6 },
        harmony: { chordTones: true },
        rungs: ladder(60, 120, 5),
        passAt: 85,
        minutes: 7,
      }),
      sweepExercise({
        id: "linked-phrase",
        title: "An original line: up, link, and sing",
        purpose: "A short phrase written for this Path. Am up five strings, a half-step link into E major, and then a held A. Use it as a shape for writing your own.",
        howTo: ["Bar 1 up and back on Am. In bar 2 the shape moves a fret for E major. Land on the held A with some vibrato, and take your time before going round."],
        coach: "The held note is the point, and I can't judge how it sings. I'll report the timing before it.",
        tab: `/8t 5:12 5:15h 4:14 3:14 2:13 1:12 1:17h 1:12p 2:13 3:14 4:14 5:15 | /8t 5:14p 4:14 3:13 2:12 1:12 1:16h 1:12p 2:12 3:13 4:14 5:14 5:14 | /2 1:17v /4 r r`,
        position: 12,
        chords: "Am | E | Am",
        harmony: { chordTones: true },
        rungs: ladder(60, 130, 5),
        passAt: 85,
        minutes: 6,
      }),
    ],
  },
  {
    id: "over-a-heavy-band",
    title: "A heavy band, a long line",
    goal: "Play linked five- and six-string sweeps over a band in a minor key, and make your own chorus from them.",
    why: "It's the point of the whole Level. A loud band sits on the low strings and leaves the top of the neck to you, so a long sweep cuts through. It also hides your mistakes, which is why a recording matters even more here than before.",
    howTo: [
      "Turn the band down until your mistakes show.",
      "Use direct input or headphones for any graded take: a microphone hears the band as well, and that hasn't been tested.",
      "Grading covers the slower rungs only. Above them you're on your own, with your ears and a recording.",
    ],
    payoff: "You play a long, linked, minor-key arpeggio line over a band.",
    difficultyException:
      "One pass a bar and big shapes: the tempo may be high, but the note rate is low. Playing them over a loud band is the new demand.",
    exercises: [
      sweepExercise({
        id: "band-big-chain",
        title: "Five-string chain with the band",
        purpose: "One big loop per chord, over a triplet-feel band, with the V chord in the mix.",
        howTo: ["Lock the first note of each bar to the kick. Let the band carry you round."],
        coach: "Graded on slower rungs, and on direct input only. The fast ones are for your ear.",
        vary: {
          values: { progression: [...WITH_THE_V, "i-VI-III-VII"], key: ["A", "E", "D"] },
          pooled: ["progression", "key"],
          label: labelKeyed,
          build: (p) => ({
            ...chainVariant([5, 4, 3, 2, 1], 12, "/8t", 1, true)(p),
            shifts: true,
            jam: { groove: "rockTwelveEight", key: `${p.key} minor` },
          }),
        },
        chain: { maxJointFrets: 7 },
        harmony: { chordTones: true },
        rungs: ladder(60, 150, 10),
        passAt: 90,
        pass: SLIDE_BARS,
        selfCheck: [LINK_CHECK, ROLL_CHECK],
        minutes: 8,
      }),
      sweepExercise({
        id: "band-six-links",
        title: "Six-string passes with the band",
        purpose: "Whole-neck passes, one to a chord, at a tempo where a heavy band really moves. Slow notes in a fast song.",
        howTo: ["Six notes to a bar at a fast tempo. The band plays straight, so your triplets sit across it: that's what makes it feel wide."],
        coach: "On a loud band this is one to record and listen back to, however the numbers look.",
        vary: {
          values: { progression: ["i-VII-VI-VII", "i-VI-III-VII"], key: ["A", "G", "E"] },
          pooled: ["progression", "key"],
          label: labelKeyed,
          build: (p) => ({
            ...linkedVariant([6, 5, 4, 3, 2, 1], 17, "/4t")(p),
            shifts: true,
            jam: { groove: "hardRock", key: `${p.key} minor` },
          }),
        },
        chain: { maxJointFrets: 5 },
        harmony: { chordTones: true },
        rungs: ladder(70, 180, 10),
        passAt: 120,
        selfCheck: [LINK_CHECK],
        minutes: 7,
      }),
      sweepExercise({
        id: "your-solo",
        title: "Your own solo",
        purpose: "Sixteen bars built from whichever links you like, and nothing here grades them. The written line is one original example: replace it bar by bar.",
        howTo: ["Record it, listen and keep what sounds like music. Change the rest."],
        coach: "No marks on this one. It's yours.",
        tab: `${sweepChain({ chords: ["Am", "F", "C", "G"], strings: [5, 4, 3, 2, 1], near: 12, doubleLow: true, rhythm: "/8t" })} | ${sweepChain({ chords: ["Am", "Dm", "E", "Am"], strings: [3, 2, 1], near: 14, perBar: 2, rhythm: "/8t" })}`,
        position: 12,
        shifts: true,
        chords: "Am | F | C | G | Am | Dm | E | Am",
        jam: { groove: "rockTwelveEight", key: "A minor" },
        harmony: { chordTones: true },
        rungs: ladder(60, 130, 5),
        grade: "selfChecked",
        selfCheck: [LINK_CHECK, ROLL_CHECK, "Would you play this take for another guitarist?"],
        minutes: 8,
      }),
    ],
  },
];

const ALL_STEPS: readonly StepSpec[] = [...OLD_STEPS, ...NEW_STEPS];
const LEVEL_STEPS = {
  beginner: ["triads", "turnaround", "phrases", "qualities", "first-solo"],
  intermediate: [
    "four-strings",
    "five-strings",
    "five-e-shape",
    "moving-shapes",
    "the-link",
    "link-chains",
    "long-chains",
    "minor-progressions",
    "over-the-progression",
  ],
  advanced: ["six-strings", "fast-shifts", "neoclassical", "over-a-heavy-band"],
};
const stepNamed = (id: string): StepSpec => {
  const found = ALL_STEPS.find((s) => s.id === id);
  if (!found) throw new Error(`no Step ${id}`);
  return found;
};

/** A warm-up variant: a chain of shapes through a progression in a key. */
const WARMUP_WORDS = {
  coach: "This is a warm-up. It tells you how it went, and it decides nothing.",
  how: "Start well under your clean tempo. Nothing here should feel hard, and it plays different notes each day.",
};

export default definePath({
  id: "sweep-picking",
  title: "Sweep Picking",
  kind: "mechanics",
  goal: "Sweep clean, separated arpeggios from three-string triads to six-string shapes, and link them through minor-key progressions so they sound like a solo.",
  level: "intermediate",
  assumes:
    "You can alternate-pick single notes evenly at sixteenths around 80 BPM (Alternate Picking through its Intermediate Level covers this) and you can hammer on and pull off cleanly. You don't need any sweeping yet, and you can start at whichever Level suits you.",
  prerequisites: { skills: ["Even alternate picking at sixteenths, 80 BPM", "Clean hammer-ons and pull-offs"] },
  labelSubdivisions: "mostly",
  paceLadders: true,
  orderRationale:
    "Three Levels, each open from the start, rebuilt on 2026-11-17 after the owner played the old Step 1 (two notes, mostly rests, at 50 BPM) and called it a beginner exercise nobody should have to sit through. Beginner now starts on a real sweep: a three-string A minor triad up and down in triplets, with one beat of rest only where it teaches the muting reset. It is the standard first drill in most sweep courses (one push per click, the top note repeated where the pick turns), and it already sounds like an arpeggio. Major and minor come together in the first Step because they differ by one note and hearing that note is the point. Then the turn at the top with a hammer and a pull, which is what removes the repeated note; then the three inversions and diminished; and the Level ends with a four-bar solo over a band. Intermediate skips everything under four strings: four-string shapes, then the five-string A-shape, then the E-shape with a hammer or a tap at the top, then inversions and position shifts with those shapes, and only then linking, which the owner asked for as the backbone, on three strings first because a long shape makes a bad link worse. It ends on an eight-bar etude over a band. Advanced adds six strings, wide shifts and neoclassical sequences. The comparison was against common practice (Gambale's economy and sweep method, Becker- and Malmsteen-style arpeggio studies, Troy Grady's work on pick paths): triads before long shapes, the turnaround as its own skill, the tap as an extension of the five-string shape. Chains change chord once a bar because Jam's grid is one chord to a bar. The progressions are common vocabulary and every line is written for this Path: nothing is transcribed from a song or copied from a course.",
  gradingLimits:
    "Grading stops being trustworthy at about 150 ms between notes: sixteenths at 100 BPM, eighth triplets at 133, sextuplets at 66. Rungs faster than that are self-checked, whatever they look like, and the card says where grading stops. That line is a cautious policy, not a measurement. What a sweep is graded on is timing: how even the notes are, whether each one arrived, and whether extra notes crept in. Right notes are not graded anywhere on this Path: swept notes ring into each other, and a pitch read on ringing strings can fail a take that was played right, so nothing here promises them. The tests behind these numbers used synthetic tones, and no real guitar has been through them yet. The note after a slide counts as missed if it isn't heard, so bars on sliding shapes are lower; a tap counts as a note that must be heard, and a hammer or pull that isn't heard costs nothing. In practice: Beginner is graded at every rung. In Intermediate the sixteenth-note shapes stop at 100 BPM, triplet shapes at 130, and the sextuplet pickup at 65. In Advanced most of what makes the playing hard can't be graded. Sound never tells us the two things that matter most here, muting and pick path, and the Exercises say so.",
  steps: [...LEVEL_STEPS.beginner, ...LEVEL_STEPS.intermediate, ...LEVEL_STEPS.advanced].map(stepNamed),
  levels: [
    {
      id: "beginner",
      title: "Beginner: three-string triads",
      summary: "Minor and major triads swept up and down from the first Exercise, then the turn at the top with a hammer and a pull, shapes up the neck, and a first sweep solo over a band.",
      reachLevel: "intermediate",
      startHereIf: [
        "You can play eighth-note triplets in time with a click at about 80 BPM.",
        "You can hammer on and pull off cleanly, without picking.",
        "You've never swept, or when you sweep three strings at 90 BPM triplets the notes ring together like a strummed chord.",
      ],
      steps: LEVEL_STEPS.beginner,
      warmups: [
        sweepExercise({
          id: "triads-around",
          title: "Triads around the neck",
          purpose: "One three-string triad rocked up and down in different places and keys, a bar at each stop, so the first five minutes aren't the same notes as yesterday.",
          howTo: [WARMUP_WORDS.how, "Move the hand at each bar line, and keep the mute going while it moves."],
          coach: WARMUP_WORDS.coach,
          vary: {
            values: { key: MINOR_KEYS, shapeOrder: ["up the neck", "down the neck"] },
            pooled: ["key", "shapeOrder"],
            label: (p) => `${p.key} minor, ${p.shapeOrder}`,
            build: (p) => {
              const shift = KEY_SHIFT[p.key];
              const chord = moveChart("Am", shift).trim();
              const spots = [5, 9, 14, 9].map((near) => nearFret(near, shift));
              const walk = p.shapeOrder === "up the neck" ? spots : [...spots].reverse();
              const tab = walk.map((near) => `/8t ${rock({ chord, strings: [3, 2, 1], near })}`).join(" | ");
              return { tab, position: handAt(tab), shifts: true, harmony: { arpeggio: chord, cover: true } };
            },
          },
          grade: "warmup",
          warmup: { start: 0.6, top: 0.8, reference: "triads.triad-rolls", fallback: 60 },
          rungs: ladder(50, 110, 5),
          minutes: 4,
        }),
      ],
    },
    {
      id: "intermediate",
      title: "Intermediate: four and five strings, then linking",
      summary: "No two-string basics: start on four- and five-string arpeggios, the A-shape and the E-shape with a hammer or a tap at the top, then move them around the neck, link them through minor-key progressions, and finish with an eight-bar etude over a band.",
      reachLevel: "intermediate",
      startHereIf: [
        "You can loop a three-string minor triad with a hammer and a pull, cleanly, at 100 BPM triplets.",
        "On a recording of that loop, each note stops as the next one starts.",
        "You can name which note makes a triad major or minor, even if it takes a moment.",
        "Three strings feel easy, and four or five strings come out as a smear.",
      ],
      steps: LEVEL_STEPS.intermediate,
      warmups: [
        sweepExercise({
          id: "progression-of-the-day",
          title: "Four chords, linked",
          purpose: "A four-chord chain through a different minor progression and key each time. It's linked sweeps, gently, and it never repeats tomorrow what it did today.",
          howTo: [WARMUP_WORDS.how, "Keep your place by the sound of the chords, not by counting."],
          coach: WARMUP_WORDS.coach,
          vary: {
            values: { progression: [...MINOR_LOOP, ...WITH_THE_V], key: MINOR_KEYS },
            pooled: ["progression", "key"],
            label: labelKeyed,
            build: (p) => ({ ...chainVariant([3, 2, 1], 14, "/8t", 2)(p), shifts: true }),
          },
          harmony: { chordTones: true },
          grade: "warmup",
          warmup: { start: 0.6, top: 0.85, reference: "link-chains.looped-chain", fallback: 55 },
          rungs: ladder(50, 110, 5),
          minutes: 5,
        }),
      ],
    },
    {
      id: "advanced",
      title: "Advanced: the whole neck, at speed",
      summary: "Six strings, wide shifts and neoclassical sequences. Grading runs out early here: most of what makes this hard can only be judged by ear and on a recording.",
      reachLevel: "advanced",
      startHereIf: [
        "You can chain four five-string shapes through a minor progression without stopping, at 90 BPM triplets.",
        "A recording of that take is free of ringing strings.",
        "You already reach for the nearest shape at a chord change, rather than the one you know best.",
      ],
      steps: LEVEL_STEPS.advanced,
      warmups: [
        sweepExercise({
          id: "big-round",
          title: "A big round",
          purpose: "A five-string chain through a progression in a key you didn't play yesterday. It's a long warm-up for a long sweep, and the mute wakes up with it.",
          howTo: [WARMUP_WORDS.how, "Keep it where every note is separate, however easy it feels."],
          coach: WARMUP_WORDS.coach,
          vary: {
            values: { progression: [...MINOR_LOOP], key: MINOR_KEYS },
            pooled: ["progression", "key"],
            label: labelKeyed,
            build: (p) => ({ ...chainVariant([5, 4, 3, 2, 1], 12, "/8t", 1, true)(p), shifts: true }),
          },
          harmony: { chordTones: true },
          grade: "warmup",
          warmup: { start: 0.6, top: 0.85, reference: "long-chains.chain-five", fallback: 55 },
          pass: [
            { metric: "timingEvenness", min: 0.7, overBars: 4 },
            { metric: "notesHeard", min: 0.7, overBars: 4 },
          ],
          rungs: ladder(50, 110, 5),
          minutes: 5,
        }),
      ],
    },
  ],
});
