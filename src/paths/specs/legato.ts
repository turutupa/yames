/**
 * Legato, a Mechanics Path. A draft: no teacher or guitarist has reviewed it.
 *
 * Hammer-ons and pull-offs from the first one to a six-string run. Every legato
 * figure comes after its picked twin, so the picked bar sets the rhythm and the
 * volume the legato bar has to match. Shred's two legato Steps start at
 * sextuplets; this Path is the road up to them and past them.
 */
import { definePath } from "../spec";
import type { VariantParams } from "../spec";
import { STANDARD_TUNING } from "../format";
import type { PassBar } from "../format";
import { pcOfName } from "../theory";
import { handAt, ladder, moveChart, oneStringClimb, repeat, shiftFrets, threeNpsCells } from "../templates";
import type { FretCell } from "../templates";

const even = (min: number, overBars = 4): PassBar => ({ metric: "timingEvenness", min, overBars });
const heard = (min: number, overBars = 4): PassBar => ({ metric: "notesHeard", min, overBars });
const extras = (max: number): PassBar => ({ metric: "extraNotes", max, overBars: 4 });
const right = (min: number): PassBar => ({ metric: "noteIdentity", min, overBars: 4 });

/** Slow legato: the picked notes are easy to place, so the bar on them is firm. */
const SLOW = [even(0.85), heard(0.9), extras(3), right(0.85)];
/** No scale declared (finger drills): timing only. */
const SLOW_TIMING = [even(0.85), heard(0.9), extras(3)];
/** Faster legato: only the picked notes can be missed. */
const LEGATO = [even(0.8), heard(0.9), extras(3), right(0.85)];
/** Hammers from nowhere are soft like any hammer: an unheard one costs nothing. */
const NOWHERE = [even(0.8), heard(0.85), extras(3), right(0.85)];

const VOLUME_CHECK = "In the legato bar, was the second note of each pair as loud as the first?";
const SAME_BAR_CHECK = "Did the legato bar keep the picked bar's rhythm, with no note rushing in early?";
const NOISE_CHECK = "Between takes, stop and listen: are the strings you are not playing silent?";
const SAFETY =
  "Stop at any pain in the hand, wrist or forearm. A tired hand is one thing and pain is another; pain ends the set.";

/** Semitones from A minor. */
const KEY_SHIFT: Readonly<Record<string, number>> = { A: 0, B: 2, C: 3, D: 5, E: 7, G: -2 };

/** A legato bar with its hammers and pulls taken off: the picked twin. */
const picked = (bar: string) => bar.replace(/(\d:\d+)[hp]/g, "$1");

/** The picked bar, then the legato bar. */
const twin = (value: string, bar: string) => `${value} ${picked(bar)} | ${bar}`;

/** The same tab in other minor keys. Key doesn't change how hard it is. */
function inKeys(tab: string, keys: readonly string[], scale = "naturalMinor", chart?: string) {
  return {
    values: { key: keys },
    pooled: ["key"] as const,
    label: (p: VariantParams) => `${p.key} minor`,
    build: (p: VariantParams) => {
      const moved = shiftFrets(tab, KEY_SHIFT[p.key]);
      return {
        tab: moved,
        position: handAt(moved),
        ...(chart ? { chords: moveChart(chart, KEY_SHIFT[p.key]) } : {}),
        harmony: { scale: [p.key, scale] as [string, string] },
      };
    },
  };
}

const STRING_OF: Readonly<Record<string, number>> = { "top E": 1, B: 2, G: 3, D: 4, A: 5, "low E": 6 };

/** One figure on other strings: `"G 5-7"` is the G string, frets 5 and 7. */
function onStrings(sets: readonly string[], build: (string: number, frets: number[]) => string) {
  return {
    values: { stringSet: sets },
    pooled: ["stringSet"] as const,
    label: (p: VariantParams) => p.stringSet,
    build: (p: VariantParams) => {
      const [name, frets] = p.stringSet.split(/ (?=\d)/);
      const numbers = frets.split("-").map(Number);
      return { tab: build(STRING_OF[name], numbers), position: Math.min(...numbers) };
    },
  };
}

const cellsTab = (cells: readonly FretCell[], suffix: (c: FretCell, i: number) => string = () => "") =>
  cells.map((c, i) => `${c.string}:${c.fret}${suffix(c, i)}`).join(" ");

/** A minor, three notes per string, from the low E's fret 5. */
const nps = (strings: number) => threeNpsCells({ root: "A", scale: "naturalMinor", string: 6, fret: 5, strings });

// --- Beginner figures -------------------------------------------------------

const hammerPair = (s: number, [lo, hi]: number[]) => twin("/8", repeat(`${s}:${lo} ${s}:${hi}h`, 4));
const pullPair = (s: number, [lo, hi]: number[]) => twin("/8", repeat(`${s}:${hi} ${s}:${lo}p`, 4));
const slowTrill = (s: number, [lo, hi]: number[]) => twin("/8", repeat(`${s}:${lo} ${s}:${hi}h ${s}:${lo}p ${s}:${hi}h`, 2));

const HAMMER_TUNE = `/8 4:5 4:7h 3:5 3:7h 2:5 2:8h 3:5 3:7h | 2:5 2:8h 3:5 3:7h 4:5 4:7h /4 5:7`;
const PULL_TUNE = `/8 1:8 1:5p 2:8 2:5p 3:7 3:5p 4:7 4:5p | 2:8 2:5p 3:7 3:5p 4:7 4:5p /4 5:7`;
const TRIPLET_TUNE = `/8t ${repeat("2:5 2:6h 2:8h 1:5 1:7h 1:8h", 2)} | 1:8 1:7p 1:5p 2:8 2:6p 2:5p /2 3:7`;

// --- Intermediate figures ---------------------------------------------------

const rollUp = (s: number, [a, b, c]: number[]) => twin("/16", repeat(`${s}:${a} ${s}:${b}h ${s}:${c}h ${s}:${b}p`, 4));
const rollDown = (s: number, [a, b, c]: number[]) => twin("/16", repeat(`${s}:${c} ${s}:${b}p ${s}:${a}p ${s}:${b}h`, 4));
const longRoll = (s: number, [a, b, c]: number[]) =>
  twin("/16", repeat(`${s}:${a} ${s}:${b}h ${s}:${c}h ${s}:${b}p ${s}:${a}p ${s}:${b}h ${s}:${c}h ${s}:${b}p`, 2));

const ROLL_MELODY = `/16 ${repeat("2:5 2:6h 2:8h 2:6p", 2)} ${repeat("2:6 2:8h 2:10h 2:8p", 2)} | ${repeat("2:8 2:10h 2:12h 2:10p", 2)} ${repeat("2:6 2:8h 2:10h 2:8p", 2)}`;

const BOX_UP = "6:5 6:8h 5:5 5:7h 4:5 4:7h 3:5 3:7h 2:5 2:8h 1:5 1:8h";
const BOX_DOWN = "1:8 1:5p 2:8 2:5p 3:7 3:5p 4:7 4:5p 5:7 5:5p 6:8 6:5p";
const REPEATING_LICK = `/16 ${repeat("2:8 1:5 1:8 1:5p", 4)} | ${repeat("3:7 2:5 2:8 2:5p", 4)}`;
const BOX_ROUND = `/16 ${BOX_UP} 1:8 1:5p 2:8 2:5p | 3:7 3:5p 4:7 4:5p 5:7 5:5p 6:8 6:5p /2 4:7`;

// Written in B minor at fret 7, where the 7-9-11 stretch is a fret narrower than 5-7-9.
const THREE_UP = "6:7 6:9h 6:10h 5:7 5:9h 5:10h 4:7 4:9h 4:11h 5:7 5:9h 5:10h";
const THREE_DOWN = "4:11 4:9p 4:7p 5:10 5:9p 5:7p 6:10 6:9p 6:7p 5:10 5:9p 5:7p";
const THREE_ROUND = `/8t 6:7 6:9h 6:10h 5:7 5:9h 5:10h 4:7 4:9h 4:11h 3:7 3:9h 3:11h | 3:11 3:9p 3:7p 4:11 4:9p 4:7p 5:10 5:9p 5:7p 6:10 6:9p 6:10h`;

/** The three-per-string figures, written in B minor, in other keys. */
const fromB = (tab: string) => ({
  values: { key: ["B", "C", "D", "E"] },
  pooled: ["key"] as const,
  label: (p: VariantParams) => `${p.key} minor`,
  build: (p: VariantParams) => {
    const moved = shiftFrets(tab, KEY_SHIFT[p.key] - KEY_SHIFT.B);
    return { tab: moved, position: handAt(moved), harmony: { scale: [p.key, "naturalMinor"] as [string, string] } };
  },
});

// --- Advanced figures -------------------------------------------------------

/** Two strings, one pick: the second string's first note is a hammer-on from nowhere. */
const NOWHERE_TWO = `/16t ${repeat("5:5 5:7 5:8 4:5 4:7 4:9", 4)} | ${repeat("5:5 5:7h 5:8h 4:5h 4:7h 4:9h", 4)}`;

/** Twelve notes up four strings: a picked bar, then one pick and hammers, each new string from nowhere. */
function nowhereAscent(): string {
  const cells = nps(4);
  return `/16t ${cellsTab(cells)} hold | ${cellsTab(cells, (_c, i) => (i === 0 ? "" : "h"))} hold`;
}

/** Up four strings and back in one bar, one pick: a turn at the top, and each string coming down starts from nowhere. */
const ONE_PICK_ROUND = `/16t ${cellsTab(nps(4), (_c, i) => (i === 0 ? "" : "h"))} 3:7p 3:9h 3:7p 3:5p 4:9h 4:7p 4:5p 5:8h 5:7p 5:5p 6:8h 6:7p`;

/** All six strings up: eighteen notes and a held one. A pick on each string. */
function sixUp(): string {
  const cells = nps(6);
  return `/16t ${cellsTab(cells)} hold | ${cellsTab(cells, (_c, i) => (i % 3 === 0 ? "" : "h"))} hold`;
}

function sixDown(): string {
  const cells = [...nps(6)].reverse();
  // 10, 8, 7 on the top string is fingers 4, 2, 1, the same in the picked bar as in the legato one.
  const finger = (i: number) => (i < 3 ? ["f4", "f2", "f1"][i] : "");
  return `/16t ${cellsTab(cells, (_c, i) => finger(i))} hold | ${cellsTab(cells, (_c, i) => `${i % 3 === 0 ? "" : "p"}${finger(i)}`)} hold`;
}

/** Up six strings with hammers, down with pulls, a pick on each string, and a held A to finish. */
function sixRound(): string {
  const up = nps(6);
  const down = [...up].reverse();
  return `/16t ${cellsTab(up, (_c, i) => (i % 3 === 0 ? "" : "h"))} ${cellsTab(down.slice(0, 6), (_c, i) => (i % 3 === 0 ? "" : "p"))} | ${cellsTab(down.slice(6), (_c, i) => (i % 3 === 0 ? "" : "p"))} /2 4:7`;
}

const POSITION_RUN = `/16t 2:5 2:6h 2:8h 1:5 1:7h 1:8h 2:8 2:10h 2:12h 1:8 1:10h 1:12h 2:10 2:12h 2:13h 1:10 1:12h 1:13h /4 1:12 | /16t 1:13 1:12p 1:10p 2:13 2:12p 2:10p 1:12 1:10p 1:8p 2:12 2:10p 2:8p 1:8 1:7p 1:5p 2:8 2:6p 2:5p /4 3:7`;

// Odd groupings: five to a beat, and a six-note roll on one pick.
const FIVE = (s: number, [a, b, c]: number[]) => `${s}:${c} ${s}:${b}p ${s}:${a}p ${s}:${b}h ${s}:${c}h`;
const FIVES = `/16q ${repeat(FIVE(1, [5, 7, 8]), 3)} 1:8 1:7p 1:5p 2:8 2:6p | ${repeat(FIVE(2, [5, 6, 8]), 3)} 2:8 2:6p 2:5p 3:7 3:5p`;
const sixRoll = (s: number, [a, b, c]: number[]) => `/16t ${repeat(`${s}:${a} ${s}:${b}h ${s}:${c}h ${s}:${b}p ${s}:${a}p ${s}:${b}h`, 4)}`;
const FIVES_DOWN = `/16q 1:8 1:7p 1:5p 2:8 2:6p 1:7 1:5p 2:8 2:6p 2:5p 1:5 2:8 2:6p 2:5p 3:7 2:8 2:6p 2:5p 3:7 3:5p`;

// The line over the band: one pick a beat, and every bar starts on a tone of its chord.
const ETUDE = `/16
  1:5 1:7h 1:8h 1:7p 2:5 2:6h 2:8h 2:6p 1:5 1:7h 1:8h 1:7p 2:8 2:6p 2:5p 2:6h |
  2:6 2:8h 2:6p 2:5p 3:5 3:7h 3:5p 3:7h 2:6 2:8h 2:6p 2:5p 3:7 3:5p 3:7h 3:5p |
  2:5 2:6h 2:8h 2:6p 1:5 1:7h 1:8h 1:7p 1:8 1:7p 1:5p 1:7h 2:8 2:6p 2:5p 2:6h |
  2:8 2:6p 2:5p 2:6h 3:7 3:5p 3:7h 3:5p 2:5 2:6h 2:8h 2:6p 3:7 3:5p 3:7h 3:5p`;

/** A warm-up cell climbing one string: `marks` are the suffixes of the cell's notes. */
function climb(p: VariantParams, value: string, cell: readonly number[], marks: readonly string[], lowest: number) {
  const string = Number(p.stringSet);
  // Start on the key's root on this string, or on its fourth or fifth where the root sits too low or too high.
  const root = (((pcOfName(p.key) - STANDARD_TUNING[string - 1]) % 12) + 12) % 12;
  const from = [root, root + 5, root + 7, root + 12].find((fret) => fret >= lowest && fret <= lowest + 6) ?? lowest;
  const bars = oneStringClimb({ root: p.key, scale: "naturalMinor", string, from, cell, bars: 4 });
  const tab = bars
    .split(" | ")
    .map((bar) => `${value} ${bar.split(" ").map((t, i) => `${t}${marks[i % marks.length]}`).join(" ")}`)
    .join(" | ");
  return { tab, position: handAt(tab), shifts: true, harmony: { scale: [p.key, "naturalMinor"] as [string, string] } };
}

export default definePath({
  id: "legato",
  title: "Legato",
  kind: "mechanics",
  goal: "Play a smooth A minor line with hammer-ons and pull-offs as loud and as even as picked notes, up and down all six strings.",
  level: "early-intermediate",
  assumes:
    "You can fret single notes cleanly with all four fingers and play eighth notes with a click at 80 BPM. No speed is assumed. The minutes listed are one pass through the material; expect to come back to each Step for days or weeks.",
  prerequisites: { skills: ["Clean single notes with all four fingers", "Eighth notes with a click at 80 BPM"] },
  labelSubdivisions: "mostly",
  paceLadders: true,
  orderRationale:
    "One hammer-on, then one pull-off, then the two joined, all with a picked note on every beat to lean on. Then three fingers on one string, then across strings in the pentatonic box, where every string is one pick and one legato note, then three notes per string. Hammer-ons from nowhere come last because they need the strength the earlier Steps build. Every figure is played picked first, so the ear knows the rhythm before the fretting hand has to make it alone.",
  gradingLimits:
    "The app times the notes it hears and checks them against the written ones after the take. A hammer-on or a pull-off that is too quiet to hear costs nothing, so the picked notes carry most of the grade and a pass does not prove the legato notes were loud. That part is for your ear: the picked bar before each legato bar is the sound to match. A clean or light-crunch tone is the honest setting, because heavy gain and compression make every legato note sound even whether it was or not. None of this has been tried on a real guitar yet.",
  steps: [
    {
      id: "first-hammers",
      title: "Hammer-ons",
      goal: "Pick one note and sound the next by hammering a finger down, as loud as the picked one and exactly in time.",
      why: "A hammer-on is the fretting hand making a note by itself. Until it is as loud as a picked note, legato sounds like a line with holes in it. One pair at a time, slowly, is where the finger learns how hard and how fast it has to land.",
      howTo: [
        "Pick the lower note, then bring the next finger down fast on its fingertip, just behind the fret. Speed makes the note, not pressure: think of tapping a table.",
        "Keep the first finger down while the other one hammers. The hammered note should last its full length.",
        "Each Exercise is a picked bar, then the same notes with hammer-ons. Make the second bar sound like the first.",
      ],
      payoff: "A pentatonic phrase that climbs three strings with half the picking, every note the same size.",
      exercises: [
        {
          id: "pick-then-hammer",
          title: "Picked, then hammered",
          purpose: "Two notes a tone apart, eighths: one bar picked, one bar where the second note of each pair is hammered. The smallest legato there is.",
          howTo: [
            "Eighth notes. Bar 1: pick both notes of each pair. Bar 2: pick the first, hammer the second with the third finger.",
            "The hammered note lands on the 'and', exactly where the picked one did. If it comes early, the finger is falling instead of being placed.",
          ],
          coach: "I time the picked notes most firmly. A hammer-on I can't hear costs nothing, so its volume is yours to judge against bar 1.",
          vary: onStrings(["G 5-7", "D 5-7", "A 5-7", "top E 5-7", "B 6-8"], hammerPair),
          tab: hammerPair(3, [5, 7]),
          position: 5,
          harmony: { scale: ["A", "naturalMinor"] },
          rungs: ladder(50, 120, 10),
          passAt: 90,
          grade: "timingNotes",
          pass: SLOW,
          selfCheck: [VOLUME_CHECK, SAME_BAR_CHECK],
          minutes: 5,
        },
        {
          id: "hammer-each-finger",
          title: "A hammer-on for each finger",
          purpose: "From the first finger to the second, the third and the little finger in turn. The little finger is the weak one, and this is where you find out how weak.",
          howTo: [
            "First finger stays on fret 5 of the B string for the whole Exercise. Pick it, then hammer fret 6, pick, hammer 7, pick, hammer 8, pick, hammer 7.",
            "Give the little finger the same height and speed as the others. If its note is quieter, slow down one rung and make it match.",
          ],
          coach: "Timing is what I have here. Whether the little finger's note was as loud as the rest is for your ear.",
          tab: twin("/8", "2:5 2:6h 2:5 2:7h 2:5 2:8h 2:5 2:7h"),
          position: 5,
          rungs: ladder(50, 120, 10),
          passAt: 90,
          grade: "timing",
          pass: SLOW_TIMING,
          selfCheck: ["Was the little finger's hammer-on as loud as the second finger's?"],
          minutes: 5,
        },
        {
          id: "hammer-tune",
          title: "A phrase in hammer-ons",
          purpose: "The A minor pentatonic box, two notes a string, each pair one pick and one hammer-on. It already sounds like a blues-rock phrase.",
          howTo: [
            "Eighths. Pick the lower note on each string and hammer the upper: D string 5 to 7, G string 5 to 7, B string 5 to 8, and back.",
            "Third finger hammers the frets at 7, little finger the 8 on the B string. The phrase ends on a picked E on the A string.",
          ],
          coach: "After the take I'll say how even it was and whether the notes were the written ones.",
          vary: inKeys(HAMMER_TUNE, ["A", "C", "D", "E"], "minorPentatonic"),
          tab: HAMMER_TUNE,
          position: 5,
          harmony: { scale: ["A", "minorPentatonic"] },
          rungs: ladder(50, 120, 10),
          passAt: 90,
          grade: "timingNotes",
          pass: SLOW,
          minutes: 5,
        },
      ],
    },
    {
      id: "first-pulls",
      title: "Pull-offs",
      goal: "Pick one note and sound the one below it by pulling the finger off, so the string is plucked and not just let go.",
      why: "A pull-off is harder than a hammer-on because the finger has to pluck the string on its way off. Lifting straight up gives a faint note or none. And the lower note has to be fretted before you pull, which means placing two fingers at once.",
      howTo: [
        "Put both fingers down before you pick. Pick the upper note, then pull that finger off slightly sideways, toward the floor, so it plucks the string.",
        "The finger left behind holds its note firmly. If it moves, the pull-off bends the note sharp.",
        "Each Exercise is a picked bar, then the same notes with pull-offs. Make the second bar sound like the first.",
      ],
      payoff: "A falling pentatonic phrase where every second note comes from the fretting hand, and open-string pull-offs that ring like a folk tune.",
      exercises: [
        {
          id: "pick-then-pull",
          title: "Picked, then pulled",
          purpose: "The same two notes as the first hammer-on, top note first: one bar picked, one bar where the lower note is a pull-off.",
          howTo: [
            "Eighth notes. Both fingers down. Bar 1: pick both notes. Bar 2: pick the upper note and pull off to the lower.",
            "The pull is a small flick toward the floor, not a lift. Listen for the lower note starting with a click of its own.",
          ],
          coach: "The picked notes are what I time most firmly. A pull-off I can't hear costs nothing, so compare it with bar 1 by ear.",
          vary: onStrings(["G 5-7", "D 5-7", "A 5-7", "top E 5-7", "B 6-8"], pullPair),
          tab: pullPair(3, [5, 7]),
          position: 5,
          harmony: { scale: ["A", "naturalMinor"] },
          rungs: ladder(50, 120, 10),
          passAt: 90,
          grade: "timingNotes",
          pass: SLOW,
          selfCheck: [VOLUME_CHECK, SAME_BAR_CHECK],
          minutes: 5,
        },
        {
          id: "pull-each-finger",
          title: "A pull-off from each finger",
          purpose: "The little finger, the third and the second each pull off to the first. Each one plucks at a different angle, and each needs its own practice.",
          howTo: [
            "First finger stays on fret 5 of the B string. Pick fret 8 and pull off to 5, then 7 to 5, then 6 to 5, then 7 to 5.",
            "Place the finger that is about to pull during the note before it, so it is already down when you pick.",
          ],
          coach: "Timing is what I have here. Which finger's pull-off was quietest is for your ear.",
          tab: twin("/8", "2:8 2:5p 2:7 2:5p 2:6 2:5p 2:7 2:5p"),
          position: 5,
          rungs: ladder(50, 120, 10),
          passAt: 90,
          grade: "timing",
          pass: SLOW_TIMING,
          selfCheck: ["Did every pull-off sound as a note of its own, or did some only fade in?"],
          minutes: 5,
        },
        {
          id: "pull-to-open",
          title: "Pull-offs to open strings",
          purpose: "E minor pentatonic in open position: each fretted note pulls off to its open string. The open string rings easily, so this is where a pull-off first sounds big.",
          howTo: [
            "Eighths. Top E string 3 to open, B string 3 to open, G string 2 to open, D string 2 to open, then back up from the D string and finish on the open top E.",
            "Second finger on the frets at 2, third finger on the frets at 3. Pull toward the floor without touching the next string down.",
          ],
          coach: "After the take I'll say how even it was and whether the notes were the written ones. Open strings left ringing are yours to quiet.",
          tab: `/8 1:3 1:0p 2:3 2:0p 3:2 3:0p 4:2 4:0p | 4:2 4:0p 3:2 3:0p 2:3 2:0p /4 1:0`,
          position: 1,
          harmony: { scale: ["E", "minorPentatonic"] },
          rungs: ladder(50, 120, 10),
          passAt: 90,
          grade: "timingNotes",
          pass: SLOW,
          selfCheck: [NOISE_CHECK],
          minutes: 5,
        },
        {
          id: "pull-tune",
          title: "A phrase in pull-offs",
          purpose: "Down the A minor pentatonic box, two notes a string, each pair one pick and one pull-off.",
          howTo: [
            "Eighths. Top E string 8 to 5, B string 8 to 5, G string 7 to 5, D string 7 to 5, then from the B string down again to a picked E on the A string.",
            "First finger lies ready on fret 5 of the next string before you get there. The little finger pulls from the 8s, the third finger from the 7s.",
          ],
          coach: "After the take I'll say how even it was and whether the notes were the written ones.",
          vary: inKeys(PULL_TUNE, ["A", "C", "D", "E"], "minorPentatonic"),
          tab: PULL_TUNE,
          position: 5,
          harmony: { scale: ["A", "minorPentatonic"] },
          rungs: ladder(50, 120, 10),
          passAt: 90,
          grade: "timingNotes",
          pass: SLOW,
          minutes: 5,
        },
      ],
    },
    {
      id: "hammer-and-pull",
      title: "Hammer and pull together",
      goal: "Three and four notes from one pick stroke, in eighths and in triplets, with the pick still landing on the beat.",
      why: "Real legato is hammer-ons and pull-offs joined: one stroke starts a string and the fretting hand keeps it going. The new problem is the third note. The string has lost some of its energy by then, so the finger has to put it back.",
      howTo: [
        "After a hammer-on, the same finger pulls off again. Hammer down, then flick off sideways: two different moves from one finger.",
        "In triplets, count '1-and-a, 2-and-a'. The pick plays the 1, the 2, the 3 and the 4, and nothing else.",
        "If the last note of a group is faint, slow down. A faster tempo hides it; it does not fix it.",
      ],
      payoff: "A slow trill that holds its volume, and a triplet line across two strings that sounds like one breath.",
      exercises: [
        {
          id: "slow-trill",
          title: "A slow trill",
          purpose: "Two notes, four eighths, one pick: pick, hammer, pull, hammer. One bar picked first, so you know what even sounds like.",
          howTo: [
            "Eighths. Bar 1: pick lower, upper, lower, upper, twice. Bar 2: pick the lower note on beats 1 and 3 only, then hammer, pull, hammer.",
            "The first finger never leaves its fret. Only the upper finger moves, and it stays close to the string.",
          ],
          coach: "Two picked notes a bar are my anchor in bar 2. The four notes between them are for your ear: all the same size.",
          vary: onStrings(["G 5-7", "B 5-6", "top E 5-7", "D 5-7", "A 5-7"], slowTrill),
          tab: slowTrill(3, [5, 7]),
          position: 5,
          harmony: { scale: ["A", "naturalMinor"] },
          rungs: ladder(60, 140, 10),
          passAt: 100,
          grade: "timingNotes",
          pass: SLOW,
          selfCheck: ["In bar 2, was the fourth note of each group as loud as the first?", SAME_BAR_CHECK],
          minutes: 5,
        },
        {
          id: "triplet-up",
          title: "Three up, one pick",
          purpose: "E, F, G on the B string as a triplet: pick, hammer, hammer. Three fingers in a row, the second hammer-on with the little finger.",
          howTo: [
            "Triplets, three to the click. Bar 1 picked. Bar 2: pick fret 5 on each beat, hammer 6 with the second finger and 8 with the little finger.",
            "Leave the second finger down when the little finger hammers. Lift both together just before the next pick.",
          ],
          coach: "The picked note on each beat is what I time most firmly, and I check the notes after the take.",
          vary: onStrings(["B 5-6-8", "top E 5-7-8", "G 4-5-7", "A 5-7-8"], (s, [a, b, c]) => twin("/8t", repeat(`${s}:${a} ${s}:${b}h ${s}:${c}h`, 4))),
          tab: twin("/8t", repeat("2:5 2:6h 2:8h", 4)),
          position: 5,
          harmony: { scale: ["A", "naturalMinor"] },
          rungs: ladder(50, 110, 10),
          passAt: 80,
          grade: "timingNotes",
          pass: SLOW,
          selfCheck: [SAME_BAR_CHECK],
          minutes: 5,
        },
        {
          id: "triplet-down",
          title: "Three down, one pick",
          purpose: "C, B, A on the top string as a triplet: pick, pull, pull. All three fingers have to be down before the pick moves.",
          howTo: [
            "Triplets. Bar 1 picked. Bar 2: pick fret 8 on each beat, pull off to 7, pull off to 5.",
            "Set fingers 1, 3 and 4 down together, like a small chord on one string, during the last note of the beat before.",
          ],
          coach: "The picked note on each beat is what I time most firmly, and I check the notes after the take.",
          vary: onStrings(["top E 5-7-8", "B 5-6-8", "G 4-5-7", "A 5-7-8"], (s, [a, b, c]) => twin("/8t", repeat(`${s}:${c} ${s}:${b}p ${s}:${a}p`, 4))),
          tab: twin("/8t", repeat("1:8 1:7p 1:5p", 4)),
          position: 5,
          harmony: { scale: ["A", "naturalMinor"] },
          rungs: ladder(50, 110, 10),
          passAt: 80,
          grade: "timingNotes",
          pass: SLOW,
          selfCheck: ["Was the third note of each beat as loud as the first?"],
          minutes: 5,
        },
        {
          id: "triplet-tune",
          title: "Up two strings and down again",
          purpose: "The two triplets joined: up the B and top strings with hammer-ons, down them with pull-offs, and a long note to land on.",
          howTo: [
            "Triplets, one pick a beat. Bar 1: B string 5, 6, 8 then top string 5, 7, 8, twice. Bar 2: top string 8, 7, 5, B string 8, 6, 5, then a held D on the G string.",
            "At the top of bar 1 you hammer onto fret 8, then pick it again to start bar 2. Keep the little finger down across the bar line.",
          ],
          coach: "After the take I'll say how even it was and whether the notes were the written ones.",
          vary: inKeys(TRIPLET_TUNE, ["A", "B", "C", "D", "E"]),
          tab: TRIPLET_TUNE,
          position: 5,
          harmony: { scale: ["A", "naturalMinor"] },
          rungs: ladder(50, 110, 10),
          passAt: 80,
          grade: "timingNotes",
          pass: SLOW,
          minutes: 6,
        },
      ],
    },
    {
      id: "rolls",
      title: "Rolls on one string",
      goal: "Four sixteenths from one pick, round and round on three fingers, without the volume sagging.",
      why: "A roll is the engine of every long legato line: up with two hammer-ons, back with a pull-off, and the pick only marks the beat. At sixteenths the fretting hand has to keep time by itself for three notes out of four, which is the real skill of this Path.",
      howTo: [
        "Sixteenths, counted '1 e and a'. The pick plays the 1 and the fretting hand plays the 'e', the 'and' and the 'a'.",
        "Keep the middle finger of the three down when the top one hammers, so the pull-off has a note to land on.",
        "Mute the strings you are not playing with the side of the picking hand: legato rings the open strings more than picking does.",
      ],
      payoff: "A rolling figure that moves up the B string and sounds like a keyboard line.",
      exercises: [
        {
          id: "roll-up",
          title: "The roll, from the bottom",
          purpose: "A, B, C, B on the top string: pick, hammer, hammer, pull. One bar picked, one bar rolled.",
          howTo: [
            "Sixteenths. Bar 1: alternate-pick frets 5, 7, 8, 7 four times. Bar 2: pick 5 on each beat, hammer 7, hammer 8, pull off to 7.",
            "Fingers 1, 3 and 4. The third finger stays down from its hammer-on until the next pick.",
          ],
          coach: "The picked note on each beat is my anchor. The three notes after it are for your ear to weigh against bar 1.",
          vary: onStrings(["top E 5-7-8", "B 5-6-8", "G 4-5-7", "A 5-7-8"], rollUp),
          tab: rollUp(1, [5, 7, 8]),
          position: 5,
          harmony: { scale: ["A", "naturalMinor"] },
          rungs: ladder(50, 110, 5),
          passAt: 80,
          grade: "timingNotes",
          pass: LEGATO,
          selfCheck: [SAME_BAR_CHECK],
          minutes: 6,
        },
        {
          id: "roll-down",
          title: "The roll, from the top",
          purpose: "C, B, A, B: pick, pull, pull, hammer. The same three notes, started from the little finger.",
          howTo: [
            "Sixteenths. Bar 1 picked. Bar 2: pick fret 8 on each beat, pull off to 7, pull off to 5, hammer 7.",
            "All three fingers go down before each pick. That is the hard part, and it happens during the hammer-on before it.",
          ],
          coach: "The picked note on each beat is my anchor. A pull-off I can't hear costs nothing, so listen for it yourself.",
          vary: onStrings(["top E 5-7-8", "B 5-6-8", "G 4-5-7", "A 5-7-8"], rollDown),
          tab: rollDown(1, [5, 7, 8]),
          position: 5,
          harmony: { scale: ["A", "naturalMinor"] },
          rungs: ladder(50, 110, 5),
          passAt: 80,
          grade: "timingNotes",
          pass: LEGATO,
          selfCheck: [SAME_BAR_CHECK],
          minutes: 6,
        },
        {
          id: "long-roll",
          title: "Eight notes, one pick",
          purpose: "The roll twice round before the pick comes back: two picked notes a bar. The string is nearly silent by the eighth note unless the fingers keep feeding it.",
          howTo: [
            "Sixteenths. Bar 1 picked. Bar 2: pick fret 5 on beats 1 and 3 only; everything else is hammer, hammer, pull, pull, hammer, hammer, pull.",
            "Hammer a little harder on the second time round. The last pull-off of each group is the note that goes missing.",
          ],
          coach: "With two picked notes a bar I have less to time, so the evenness you hear is the better judge here.",
          vary: onStrings(["top E 5-7-8", "B 5-6-8", "G 4-5-7", "A 5-7-8"], longRoll),
          tab: longRoll(1, [5, 7, 8]),
          position: 5,
          harmony: { scale: ["A", "naturalMinor"] },
          rungs: ladder(50, 110, 5),
          passAt: 75,
          grade: "timingNotes",
          pass: LEGATO,
          selfCheck: ["Was the eighth note of each group still clearly a note?"],
          minutes: 6,
        },
        {
          id: "roll-melody",
          title: "A roll that climbs",
          purpose: "The roll moved up the B string through A minor: three positions, two beats each, then back. The shape under the fingers changes with each move.",
          howTo: [
            "Sixteenths, one pick a beat. Frets 5, 6, 8, then 6, 8, 10, then 8, 10, 12, then 6, 8, 10 again, each roll played twice.",
            "The first two shapes use fingers 1, 2, 4 and the third uses 1, 2, 4 with a wider gap at the bottom. Move the hand during the last note of the beat.",
          ],
          coach: "The shifts are where the time usually moves. I'll say how even it was and check the notes after the take.",
          tab: ROLL_MELODY,
          position: 5,
          shifts: true,
          harmony: { scale: ["A", "naturalMinor"] },
          rungs: ladder(50, 100, 5),
          passAt: 75,
          grade: "timingNotes",
          pass: LEGATO,
          minutes: 6,
        },
      ],
    },
    {
      id: "pentatonic-legato",
      title: "Legato across the box",
      goal: "Run the pentatonic box with one pick and one legato note on every string, up with hammer-ons and down with pull-offs.",
      why: "Most rock and blues legato lives in the pentatonic box, two notes a string. The fretting hand now has to change string in time while the pick only touches each string once, so the two hands have to agree on every crossing.",
      howTo: [
        "Going up: pick the lower note of each string and hammer the upper. Going down: pick the upper note and pull off to the lower.",
        "Lay the first finger on the next string a moment before you need it. Coming down, it is the note every pull-off lands on.",
        "Each Exercise is a picked bar, then the same notes legato, unless it says otherwise.",
      ],
      payoff: "The box up and down as one smooth line, and the repeating lick that half of rock guitar is built on.",
      exercises: [
        {
          id: "box-up",
          title: "Up the box with hammer-ons",
          purpose: "All six strings of A minor pentatonic, sixteenths: pick, hammer, next string. Twelve notes and a held one.",
          howTo: [
            "Sixteenths. Bar 1: alternate-pick the box from the low E string to the top and hold the last note. Bar 2: pick only the first note on each string.",
            "Third finger hammers the frets at 7, little finger the frets at 8.",
          ],
          coach: "A pick on every string gives me plenty to time. I check the notes after the take.",
          vary: inKeys(`/16 ${picked(BOX_UP)} hold | ${BOX_UP} hold`, ["A", "C", "D", "E"], "minorPentatonic"),
          tab: `/16 ${picked(BOX_UP)} hold | ${BOX_UP} hold`,
          loops: false,
          position: 5,
          harmony: { scale: ["A", "minorPentatonic"], cover: true },
          rungs: ladder(50, 110, 5),
          passAt: 90,
          grade: "timingNotes",
          pass: LEGATO,
          selfCheck: [VOLUME_CHECK],
          minutes: 6,
        },
        {
          id: "box-down",
          title: "Down the box with pull-offs",
          purpose: "The same twelve notes coming down: pick the upper note of each string and pull off to the first finger.",
          howTo: [
            "Sixteenths. Bar 1 picked, bar 2 with a pull-off on every string.",
            "Both fingers are down on the new string before you pick it. The first finger rolls or hops ahead; it never arrives late.",
          ],
          coach: "A pick on every string gives me plenty to time. I check the notes after the take.",
          vary: inKeys(`/16 ${picked(BOX_DOWN)} hold | ${BOX_DOWN} hold`, ["A", "C", "D", "E"], "minorPentatonic"),
          tab: `/16 ${picked(BOX_DOWN)} hold | ${BOX_DOWN} hold`,
          loops: false,
          position: 5,
          harmony: { scale: ["A", "minorPentatonic"], cover: true },
          rungs: ladder(50, 110, 5),
          passAt: 90,
          grade: "timingNotes",
          pass: LEGATO,
          selfCheck: [VOLUME_CHECK],
          minutes: 6,
        },
        {
          id: "repeating-lick",
          title: "The repeating lick",
          purpose: "Four notes round and round: a picked note on the B string, then the top string picked, picked and pulled off. Then the same lick a string lower.",
          howTo: [
            "Sixteenths. Bar 1: B string 8, top string 5, top string 8, pull off to 5, four times. Bar 2: the same shape on the G and B strings: G string 7, B string 5, B string 8, pull off to 5.",
            "Three picks and one pull-off a beat: down, down, up works for most players, because the pick falls from the B string onto the top string. Find the strokes that repeat without thinking.",
          ],
          coach: "I'll say how even the four notes were and check them after the take. Which strokes you used is yours to choose.",
          tab: REPEATING_LICK,
          position: 5,
          pick: "free",
          harmony: { scale: ["A", "minorPentatonic"] },
          rungs: ladder(50, 110, 5),
          passAt: 95,
          grade: "timingNotes",
          pass: LEGATO,
          minutes: 6,
        },
        {
          id: "box-round",
          title: "Up and down in one line",
          purpose: "No picked bar this time: up the box with hammer-ons, straight back down with pull-offs, and a long A to land on.",
          howTo: [
            "Sixteenths, one pick a string. At the top you hammer onto fret 8 and then pick it again to start down.",
            "The descent starts in bar 1 and crosses the bar line. Count the beats; the crossing is where players lose their place.",
          ],
          coach: "This is the Step's test piece. I'll say how even it was and check the notes after the take.",
          vary: inKeys(BOX_ROUND, ["A", "C", "D", "E"], "minorPentatonic"),
          tab: BOX_ROUND,
          position: 5,
          harmony: { scale: ["A", "minorPentatonic"], cover: true },
          rungs: ladder(50, 110, 5),
          passAt: 90,
          grade: "timingNotes",
          pass: LEGATO,
          minutes: 6,
        },
      ],
    },
    {
      id: "three-per-string",
      title: "Three notes per string",
      goal: "Run a minor scale three notes to a string with one pick a string, in triplets, up and down four strings.",
      why: "Three notes per string is the fingering legato players use for scales, because every string is the same move: pick, legato, legato. It asks for a wider hand than the box: on the D and G strings the shape spans five frets, and the little finger has to hammer at the end of that stretch. So this Step is written in B minor at fret 7, where the frets are closer together than at fret 5.",
      howTo: [
        "Triplets: each string is one beat, and the pick lands on every beat.",
        "On the low E and A strings use fingers 1, 3, 4 (frets 7, 9, 10). On the D and G strings use 1, 2, 4 (frets 7, 9, 11): the stretch goes between the second and little fingers.",
        "Let the thumb sit behind the neck, about under the second finger, so the hand can open. Don't force a stretch that hurts; move the hand a little with it.",
      ],
      payoff: "Two octaves of a scale with a third of the picking, every beat on a new string.",
      exercises: [
        {
          id: "three-up",
          title: "Up three strings with hammer-ons",
          purpose: "B minor from the low E string to the D string, then round again through the A string. One bar picked, one bar with a pick on each string and two hammer-ons.",
          howTo: [
            "Triplets. Low E string 7, 9, 10; A string 7, 9, 10; D string 7, 9, 11; A string again. Bar 2 picks only the first note of each string.",
            "The D string's 11 is the little finger at full stretch. Hammer it from the second finger on 9, not from the first.",
          ],
          coach: "A picked note on every beat is what I time. I check the notes after the take.",
          vary: fromB(twin("/8t", THREE_UP)),
          tab: twin("/8t", THREE_UP),
          position: 7,
          harmony: { scale: ["B", "naturalMinor"] },
          rungs: ladder(60, 140, 10),
          passAt: 110,
          grade: "timingNotes",
          pass: LEGATO,
          selfCheck: [SAME_BAR_CHECK],
          minutes: 6,
        },
        {
          id: "three-down",
          title: "Down three strings with pull-offs",
          purpose: "The same notes coming down: pick the top note of each string and pull off twice.",
          howTo: [
            "Triplets. D string 11, 9, 7; A string 10, 9, 7; low E string 10, 9, 7; A string again. Bar 2 picks only the first note of each string.",
            "Land all three fingers on the new string together. The first pull-off is the easy one; the second is quieter unless you mean it.",
          ],
          coach: "A picked note on every beat is what I time. A pull-off I can't hear costs nothing, so its volume is for your ear.",
          vary: fromB(twin("/8t", THREE_DOWN)),
          tab: twin("/8t", THREE_DOWN),
          position: 7,
          harmony: { scale: ["B", "naturalMinor"] },
          rungs: ladder(60, 140, 10),
          passAt: 110,
          grade: "timingNotes",
          pass: LEGATO,
          selfCheck: [SAME_BAR_CHECK],
          minutes: 6,
        },
        {
          id: "three-round",
          title: "Four strings up, four strings down",
          purpose: "B minor across four strings and back, one pick a string: the scale run that the Advanced Level speeds up.",
          howTo: [
            "Triplets. Bar 1 climbs the low E, A, D and G strings with hammer-ons. Bar 2 comes down with pull-offs and turns on the low E string with a last hammer-on to fret 10.",
            "At the top you hammer onto the G string's 11 and then pick it again. Keep the little finger down across the bar line.",
          ],
          coach: "This is the Step's test piece. I'll say how even it was and check the notes after the take.",
          vary: fromB(THREE_ROUND),
          tab: THREE_ROUND,
          position: 7,
          harmony: { scale: ["B", "naturalMinor"], cover: true },
          rungs: ladder(60, 140, 10),
          passAt: 110,
          grade: "timingNotes",
          pass: LEGATO,
          minutes: 6,
        },
      ],
    },
    {
      id: "from-nowhere",
      title: "Hammer-ons from nowhere",
      goal: "Change string without picking: the first finger hammers onto the new string from the air, loud enough to carry two more notes.",
      why: "Going up a scale, the first note of each new string has no note below it to hammer from. Picking it is the easy answer; hammering it from nowhere is what makes a line fully legato. It is a strength skill, and it is the reason this Step comes after all the others.",
      howTo: [
        "A hammer-on from nowhere is a finger coming down hard and fast on a string that is not sounding. The tab marks it h with no note before it on that string.",
        "Sextuplets: six to the click, two strings to each beat.",
        "Aim the fingertip and land close to the fret. The note has to be as loud as a picked one, because there is no pick to help it.",
      ],
      payoff: "Four strings of A minor from a single pick stroke.",
      exercises: [
        {
          id: "nowhere-two",
          title: "Two strings, one pick",
          purpose: "Six notes on the A and D strings. Bar 1 picked; bar 2 picks the first note of each beat and the D string starts with a hammer-on from nowhere.",
          howTo: [
            "Sextuplets. A string 5, 7, 8 then D string 5, 7, 9, four times. In bar 2 only the A string's fret 5 is picked.",
            "The first finger leaves the A string and hammers the D string's fret 5 in one move. Let the A string stop as it lifts.",
          ],
          coach: "A hammer-on from nowhere is graded like any hammer-on: one too quiet for me to catch costs nothing, so your ear decides whether it spoke.",
          vary: inKeys(NOWHERE_TWO, ["A", "B", "C", "D", "E"]),
          tab: NOWHERE_TWO,
          position: 5,
          harmony: { scale: ["A", "naturalMinor"] },
          rungs: ladder(40, 90, 5),
          passAt: 65,
          grade: "timingNotes",
          pass: NOWHERE,
          selfCheck: ["Was the first note on the D string as loud as the picked note before it?", SAME_BAR_CHECK],
          minutes: 6,
        },
        {
          id: "nowhere-ascent",
          title: "Four strings, one pick",
          purpose: "Twelve notes up four strings and a held E. Bar 1 picked; bar 2 picks the first note and hammers everything else, three strings from nowhere.",
          howTo: [
            "Sextuplets. Low E, A, D and G strings, three notes each, and hold the last note to the bar line.",
            "Fingers 1, 3, 4 on the low two strings and 1, 2, 4 on the D and G. Each new string starts with the first finger from the air.",
          ],
          coach: "One picked note a bar is all I can time firmly in bar 2. The rest is yours to hear: twelve notes, all present.",
          vary: inKeys(nowhereAscent(), ["A", "B", "C", "D", "E"]),
          tab: nowhereAscent(),
          position: 5,
          harmony: { scale: ["A", "naturalMinor"] },
          rungs: ladder(40, 90, 5),
          passAt: 65,
          grade: "timingNotes",
          pass: NOWHERE,
          selfCheck: ["Were the hammer-ons from nowhere as loud as the picked first note?"],
          minutes: 6,
        },
        {
          id: "one-pick-round",
          title: "Up and back on one pick",
          purpose: "Up four strings with hammer-ons, a turn at the top, and down again with pull-offs, each lower string started by the little finger from nowhere. One pick stroke for the whole bar.",
          howTo: [
            "Sextuplets. Pick the low E string's fret 5 and nothing else. At the top, pull off from 9 to 7, hammer back to 9, then pull off down the string.",
            "Coming down, the little finger hammers the first note of each string from the air (D string 9, A string 8, low E string 8), with the other fingers already in place behind it.",
          ],
          coach: "There is one picked note a bar here, so my timing has little to hold. Record a take and listen: that is the real check.",
          vary: inKeys(ONE_PICK_ROUND, ["A", "B", "C", "D", "E"]),
          tab: ONE_PICK_ROUND,
          position: 5,
          harmony: { scale: ["A", "naturalMinor"], cover: true },
          rungs: ladder(40, 90, 5),
          passAt: 60,
          grade: "timingNotes",
          pass: NOWHERE,
          selfCheck: ["On a recording, can you hear all 24 notes of the bar?"],
          minutes: 7,
        },
      ],
    },
    {
      id: "six-string-runs",
      title: "Six-string runs",
      goal: "Run A minor across all six strings in sextuplets, up and down, and move a legato shape along the neck.",
      why: "A run across the whole neck has two shifts in it: the hand moves up a fret at the B string and again at the top string. In legato there is no pick stroke to cover a late shift, so the hand has to move inside the line.",
      howTo: [
        "Three notes per string in sextuplets: two strings to each beat, a pick on each string.",
        "The hand moves up one fret for the B string (6, 8, 10) and one more for the top string (7, 8, 10). Move during the last note of the string before.",
        "Each run is a picked bar first, then the legato bar. Hold the last note to the bar line and let the hand go soft.",
      ],
      payoff: "Two and a half octaves in under two beats of picking, and a line that travels up the neck and home.",
      difficultyException:
        "The pick comes back on every string, so less of each bar is legato and the metric falls. The new demands are two shifts inside the line and six strings without a stop, which it does not count.",
      exercises: [
        {
          id: "six-up",
          title: "Six strings up",
          purpose: "Eighteen notes from the low A to the top D. Bar 1 picked; bar 2 with a pick on each string and two hammer-ons.",
          howTo: [
            "Sextuplets. Low E 5, 7, 8; A 5, 7, 8; D 5, 7, 9; G 5, 7, 9; B 6, 8, 10; top E 7, 8, 10, and hold the last note.",
            "Every string's first note falls on a beat or halfway through one. Let the pick mark those and keep the hammer-ons between them even.",
          ],
          coach: "Six picked notes a bar give me a clear grid. I check the notes after the take.",
          vary: inKeys(sixUp(), ["A", "B", "C", "D"]),
          tab: sixUp(),
          loops: false,
          position: 5,
          shifts: true,
          harmony: { scale: ["A", "naturalMinor"], cover: true },
          rungs: ladder(45, 100, 5),
          passAt: 80,
          grade: "timingNotes",
          pass: LEGATO,
          selfCheck: [SAME_BAR_CHECK],
          minutes: 6,
        },
        {
          id: "six-down",
          title: "Six strings down",
          purpose: "The same eighteen notes from the top, a pick on each string and two pull-offs.",
          howTo: [
            "Sextuplets. Top E 10, 8, 7; B 10, 8, 6; G 9, 7, 5; D 9, 7, 5; A 8, 7, 5; low E 8, 7, 5, and hold the last note.",
            "The hand moves back a fret at the G string. Have all three fingers down on each new string before you pick it.",
          ],
          coach: "Six picked notes a bar give me a clear grid. A pull-off I can't hear costs nothing, so its volume is yours to judge.",
          vary: inKeys(sixDown(), ["A", "B", "C", "D"]),
          tab: sixDown(),
          loops: false,
          position: 7,
          shifts: true,
          harmony: { scale: ["A", "naturalMinor"], cover: true },
          rungs: ladder(45, 100, 5),
          passAt: 80,
          grade: "timingNotes",
          pass: LEGATO,
          selfCheck: [SAME_BAR_CHECK],
          minutes: 6,
        },
        {
          id: "position-run",
          title: "A shape that travels",
          purpose: "One two-string shape on the B and top strings, moved up the neck through three positions with hammer-ons and brought back with pull-offs.",
          howTo: [
            "Sextuplets, a pick on each string. Bar 1: frets 5, 6, 8 and 5, 7, 8, then from fret 8, then from fret 10, and a held note. Bar 2 comes back down the same three positions.",
            "The shift happens between beats, on the picked note. Look at the fret you are going to, not at the one you are leaving.",
          ],
          coach: "The shifts are where notes go missing. I'll say how even it was and check the notes after the take.",
          tab: POSITION_RUN,
          position: 5,
          shifts: true,
          harmony: { scale: ["A", "naturalMinor"] },
          rungs: ladder(40, 90, 5),
          passAt: 70,
          grade: "timingNotes",
          pass: LEGATO,
          minutes: 7,
        },
      ],
    },
    {
      id: "odd-groups",
      title: "Fives and sixes",
      goal: "Play five and six legato notes from one pick stroke, evenly, so the beat stays where it is while the fingers divide it differently.",
      why: "Legato players are known for lines that seem to float over the beat. Most of that is odd groupings: five notes where you expect four, six rolled from a single pick. The fretting hand has to count for itself, because the pick is only there once a beat and the groups no longer match the fingers' habits.",
      howTo: [
        "A quintuplet is five even notes in one beat. Say a five-syllable word on each click, like 'hip-po-pot-a-mus', before you play.",
        "The pick marks the beat and nothing else. Give that note a small accent, and keep the notes after it level.",
        "If five turns into four and a pause, slow down a rung. The gap after the fourth note is the usual fault.",
      ],
      payoff: "A rolling five that sits squarely on the click, and a scale that falls in fives across three strings.",
      exercises: [
        {
          id: "fives",
          title: "Five from one pick",
          purpose: "C, B, A, B, C as a quintuplet, one pick a beat, three times, then a five-note fall onto the B string. Bar 2 is the same figure on the B string, falling onto the G string.",
          howTo: [
            "Quintuplets, five to the click. Pick fret 8, pull off to 7 and 5, hammer 7 and 8. The next pick is the same fret 8 again, on the beat.",
            "The last beat of each bar leaves the pattern: three notes on one string, then two on the string below, with a second pick for the new string.",
          ],
          coach: "The picked note on each beat is my anchor. Whether the five between were even is for a recording and your ear.",
          tab: FIVES,
          position: 5,
          harmony: { scale: ["A", "naturalMinor"] },
          rungs: ladder(40, 100, 5),
          passAt: 70,
          grade: "timingNotes",
          pass: LEGATO,
          selfCheck: ["Were the five notes of each beat even, with no gap before the next pick?"],
          minutes: 7,
        },
        {
          id: "six-roll",
          title: "Six from one pick",
          purpose: "The roll stretched to six notes: up three, back two, up one, and the pick comes round on the beat. A sextuplet from a single stroke.",
          howTo: [
            "Sextuplets, six to the click. Pick fret 5, hammer 7 and 8, pull off to 7 and 5, hammer 7. Then pick 5 again.",
            "Lean a little on the fourth note of each six. It is the halfway point of the beat, and it keeps the six from turning into two uneven threes.",
          ],
          coach: "One picked note a beat is what I time most firmly. The rest is yours to hear: six notes, all present.",
          vary: onStrings(["top E 5-7-8", "B 5-6-8", "G 4-5-7", "A 5-7-8"], sixRoll),
          tab: sixRoll(1, [5, 7, 8]),
          position: 5,
          harmony: { scale: ["A", "naturalMinor"] },
          rungs: ladder(40, 90, 5),
          passAt: 65,
          grade: "timingNotes",
          pass: LEGATO,
          selfCheck: ["Was the sixth note of each beat still clearly a note?"],
          minutes: 6,
        },
        {
          id: "fives-down",
          title: "The scale, falling in fives",
          purpose: "Five notes down A minor from C, then five from B, from A and from G: each beat starts one note lower and spills onto the next string. A pick on every new string.",
          howTo: [
            "Quintuplets. Beat 1: top string 8, 7, 5, then B string 8 and 6. Beat 2 starts on the top string's 7, beat 3 on its 5, beat 4 on the B string's 8.",
            "Every string change is a picked note; everything else is a pull-off. Have the fingers down on the new string before the pick gets there.",
          ],
          coach: "This is the Step's test piece. I'll say how even it was and check the notes after the take.",
          vary: inKeys(FIVES_DOWN, ["A", "B", "C", "D", "E"]),
          tab: FIVES_DOWN,
          position: 5,
          // Nine picked notes a bar, one for each new string: which stroke is the player's choice.
          pick: "free",
          harmony: { scale: ["A", "naturalMinor"] },
          rungs: ladder(40, 90, 5),
          passAt: 60,
          grade: "timingNotes",
          pass: LEGATO,
          minutes: 7,
        },
      ],
    },
    {
      id: "long-lines",
      title: "Long lines",
      goal: "Hold a legato line for four bars over a band, run the whole neck both ways in one take, and keep a roll going for a minute.",
      why: "A lick is two beats; a solo is a minute. Legato tires the fretting hand in a way picking does not, and the first thing to go is volume: the hammer-ons get lazy long before the timing does. This Step is about noticing that and holding the sound.",
      howTo: [
        "Play these below the tempo you could manage for one bar. The test is the last bar, not the first.",
        "Listen for the volume of the hammer-ons dropping. When it does, stop, shake the hand out and start again a rung lower.",
        SAFETY,
      ],
      payoff: "A four-bar legato line that sits on a band, and a run across the neck and back that you can play on demand.",
      exercises: [
        {
          id: "etude",
          title: "Four bars over the band",
          purpose: "A legato line over Am, F, C and G: one pick a beat, the rolls from earlier bent to fit each chord. Every bar starts on a note of its chord.",
          howTo: [
            "Sixteenths, a pick on each beat and three legato notes after it. Play it dry first and hear each bar land on its chord.",
            "It stays in fifth position on the top three strings, so the hand never moves. Only the string under the pick changes.",
          ],
          coach: "With the band on I time your picked notes against it and check the notes after the take. Direct input or headphones make that fair.",
          tab: ETUDE,
          position: 5,
          chords: "Am | F | C | G",
          jam: { groove: "rock8", key: "A minor" },
          harmony: { scaleOverChords: ["A", "naturalMinor"] },
          rungs: ladder(55, 120, 5),
          passAt: 90,
          grade: "timingNotes",
          pass: LEGATO,
          minutes: 7,
        },
        {
          id: "six-round",
          title: "The whole neck, up and back",
          purpose: "Six strings up with hammer-ons and six down with pull-offs in one line, a pick on each string, and a long A to finish.",
          howTo: [
            "Sextuplets. The climb fills three beats and the descent starts on beat 4, so the turn at the top comes just before the bar line.",
            "At the top you hammer onto fret 10 and pick it again to come down. Keep the hand in its upper position until the G string.",
          ],
          coach: "This is the Path's test piece. I'll say how even it was and check the notes after the take.",
          vary: inKeys(sixRound(), ["A", "B", "C", "D"]),
          tab: sixRound(),
          position: 5,
          shifts: true,
          harmony: { scale: ["A", "naturalMinor"], cover: true },
          rungs: ladder(45, 100, 5),
          passAt: 75,
          grade: "timingNotes",
          pass: LEGATO,
          minutes: 7,
        },
        {
          id: "roll-minute",
          title: "One minute of rolls",
          purpose: "The roll from the Intermediate Level, one pick a beat, for sixty seconds without stopping. The hammer-ons have to be as loud in the last bar as in the first.",
          howTo: [
            "Sixteenths: pick, hammer, hammer, pull. Choose a rung about 20% below your clean tempo for the roll; it should feel slow for the first ten seconds.",
            "If the hand starts to burn, that is the set done. Rest and come back to it.",
          ],
          coach: "I check that the time holds to the end of the minute. Whether the volume held is for your ear.",
          vary: onStrings(["top E 5-7-8", "B 5-6-8", "G 4-5-7", "A 5-7-8"], (s, [a, b, c]) => `/16 ${repeat(`${s}:${a} ${s}:${b}h ${s}:${c}h ${s}:${b}p`, 4)}`),
          tab: `/16 ${repeat("1:5 1:7h 1:8h 1:7p", 4)}`,
          position: 5,
          holdSeconds: 60,
          harmony: { scale: ["A", "naturalMinor"] },
          rungs: ladder(50, 100, 5),
          passAt: 80,
          grade: "stamina",
          selfCheck: ["Were the hammer-ons in the last ten seconds as loud as in the first ten?"],
          minutes: 4,
        },
      ],
    },
  ],
  levels: [
    {
      id: "beginner",
      title: "Beginner: one hammer, one pull",
      summary: "Hammer-ons, pull-offs and the two joined, with a picked note on every beat to lean on.",
      reachLevel: "early-intermediate",
      startHereIf: [
        "You can play eighth notes with a click at 80 BPM, picking every note.",
        "You've never practised hammer-ons or pull-offs, or yours come out quieter than your picked notes.",
        "Your little finger can hold a note down cleanly at fret 8.",
      ],
      steps: ["first-hammers", "first-pulls", "hammer-and-pull"],
      warmups: [
        {
          id: "hammer-climb",
          title: "Hammer-ons up one string",
          purpose: "A scale climbing one string in pairs: pick a note, hammer the next, then pick that one and hammer the one above. A different key and string each time.",
          howTo: ["Start well under your clean tempo. First finger picks, the next finger hammers, and the hand moves up one note for each pair."],
          coach: "This is a warm-up. It tells you how it went, and it decides nothing.",
          vary: {
            values: { key: ["A", "C", "D", "E", "G"], stringSet: ["2", "3", "4"] },
            pooled: ["key", "stringSet"],
            label: (p) => `${p.key} minor on string ${p.stringSet}`,
            build: (p) => {
              const built = climb(p, "/8", [0, 1, 1, 2, 2, 3, 3, 4], ["", "h"], 3);
              // Every pair is the first finger and the next one along: the second for a fret, the third for two.
              const tab = built.tab.replace(/(\d):(\d+) \1:(\d+)h/g, (_all, s, lo, hi) => `${s}:${lo}f1 ${s}:${hi}hf${Number(hi) - Number(lo) === 1 ? 2 : 3}`);
              return { ...built, tab };
            },
          },
          grade: "warmup",
          warmup: { start: 0.6, top: 0.8, reference: "first-hammers.pick-then-hammer", fallback: 60 },
          rungs: ladder(50, 110, 10),
          minutes: 3,
        },
        {
          id: "pull-climb",
          title: "Pull-offs up one string",
          purpose: "A scale climbing one string in pull-offs: pick a note and pull off to the one below it, then the same a step higher. A different key and string each time.",
          howTo: ["Start well under your clean tempo. Both fingers down, pick the upper note, pull off to the first finger, and move the hand up one note for each pair."],
          coach: "This is a warm-up. It tells you how it went, and it decides nothing.",
          vary: {
            values: { key: ["A", "C", "D", "E", "G"], stringSet: ["2", "3", "4"] },
            pooled: ["key", "stringSet"],
            label: (p) => `${p.key} minor on string ${p.stringSet}`,
            build: (p) => {
              const built = climb(p, "/8", [1, 0, 2, 1, 3, 2, 4, 3], ["", "p"], 3);
              // Every pair is the first finger below and the next one along above it.
              const tab = built.tab.replace(/(\d):(\d+) \1:(\d+)p/g, (_all, s, hi, lo) => `${s}:${hi}f${Number(hi) - Number(lo) === 1 ? 2 : 3} ${s}:${lo}pf1`);
              return { ...built, tab };
            },
          },
          grade: "warmup",
          warmup: { start: 0.6, top: 0.8, reference: "first-pulls.pick-then-pull", fallback: 60 },
          rungs: ladder(50, 110, 10),
          minutes: 3,
        },
      ],
    },
    {
      id: "intermediate",
      title: "Intermediate: three fingers",
      summary: "Rolls on one string, the pentatonic box with one pick a string, and three notes per string in triplets.",
      reachLevel: "intermediate",
      startHereIf: [
        "Your hammer-ons and pull-offs are as loud as your picked notes at eighths, 90 BPM.",
        "You can play pick, hammer, hammer as a triplet at 80 BPM.",
        "Three or more legato notes in a row get quieter as they go, or lose the beat.",
      ],
      steps: ["rolls", "pentatonic-legato", "three-per-string"],
      warmups: [
        {
          id: "roll-climb",
          title: "A roll up one string",
          purpose: "The roll (pick, hammer, hammer, pull) on three scale notes, climbing a scale step each bar. A different key and string each time.",
          howTo: ["Start well under your clean tempo. One pick a beat. The shape under the fingers changes as it climbs, so look ahead a bar."],
          coach: "This is a warm-up. It tells you how it went, and it decides nothing.",
          vary: {
            values: { key: ["A", "C", "D", "E", "G"], stringSet: ["1", "2", "3"] },
            pooled: ["key", "stringSet"],
            label: (p) => `${p.key} minor on string ${p.stringSet}`,
            build: (p) => climb(p, "/16", [0, 1, 2, 1, 0, 1, 2, 1, 0, 1, 2, 1, 0, 1, 2, 1], ["", "h", "h", "p"], 7),
          },
          grade: "warmup",
          warmup: { start: 0.6, top: 0.8, reference: "rolls.roll-up", fallback: 50 },
          rungs: ladder(40, 90, 5),
          minutes: 3,
        },
        {
          id: "roll-down-climb",
          title: "The roll from the top, up one string",
          purpose: "The roll started from the highest of three scale notes (pick, pull, pull, hammer), climbing a scale step each bar. A different key and string each time.",
          howTo: ["Start well under your clean tempo. One pick a beat, with all three fingers down before it. The shape under the fingers changes as it climbs."],
          coach: "This is a warm-up. It tells you how it went, and it decides nothing.",
          vary: {
            values: { key: ["A", "C", "D", "E", "G"], stringSet: ["1", "2", "3"] },
            pooled: ["key", "stringSet"],
            label: (p) => `${p.key} minor on string ${p.stringSet}`,
            build: (p) => climb(p, "/16", [2, 1, 0, 1, 2, 1, 0, 1, 2, 1, 0, 1, 2, 1, 0, 1], ["", "p", "p", "h"], 7),
          },
          grade: "warmup",
          warmup: { start: 0.6, top: 0.8, reference: "rolls.roll-down", fallback: 50 },
          rungs: ladder(40, 90, 5),
          minutes: 3,
        },
      ],
    },
    {
      id: "advanced",
      title: "Advanced: almost no pick",
      summary: "Hammer-ons from nowhere, six-string runs in sextuplets with shifts, fives and sixes from one pick, and lines held over a band and for a minute.",
      reachLevel: "advanced",
      startHereIf: [
        "You can run a minor scale three notes per string with one pick a string, in triplets at 110 BPM.",
        "Your rolls stay even at sixteenths, 80 BPM, for a whole bar on one pick.",
        "You still pick the first note of every string, or your legato fades over a long line.",
      ],
      steps: ["from-nowhere", "six-string-runs", "odd-groups", "long-lines"],
      warmups: [
        {
          id: "nowhere-round",
          title: "Two strings around the chords",
          purpose: "Six notes on two strings from one pick, moved through the i, iv and v chords of a minor key. A different key each time.",
          howTo: ["Start well under your clean tempo. One pick a beat; the upper string starts with a hammer-on from nowhere. The hand moves after the long note at the end of each bar."],
          coach: "This is a warm-up. It tells you how it went, and it decides nothing.",
          vary: {
            values: { key: ["A", "B", "C", "D", "E", "G"], stringSet: ["low strings", "middle strings"] },
            pooled: ["key", "stringSet"],
            label: (p) => `${p.key} minor, ${p.stringSet}`,
            build: (p) => {
              const low = p.stringSet === "low strings";
              const cell = low ? "6:5 6:7h 6:8h 5:5h 5:7h 5:8h" : "5:5 5:7h 5:8h 4:5h 4:7h 4:8h";
              // The root's fret on the lower string, then the iv and v chords wherever they stay on the neck.
              const root = (((KEY_SHIFT[p.key] + (low ? 5 : 0) - 3) % 12) + 12) % 12 + 3;
              const near = (up: number) => (root + up + 3 <= 15 ? root + up : root + up - 12);
              const bar = `/16t ${repeat(cell, 3)} /4 ${cell.split(" ")[2].replace("h", "f4")}`;
              const tab = [root, near(5), near(7), root].map((fret) => shiftFrets(bar, fret - 5)).join(" | ");
              return { tab, position: handAt(tab), shifts: true, chords: moveChart("Am | Dm | Em | Am", KEY_SHIFT[p.key]) };
            },
          },
          grade: "warmup",
          warmup: { start: 0.6, top: 0.8, reference: "from-nowhere.nowhere-two", fallback: 45 },
          rungs: ladder(40, 70, 5),
          minutes: 4,
        },
        {
          id: "six-roll-climb",
          title: "Six from one pick, up one string",
          purpose: "The six-note roll on three scale notes, one pick a beat, climbing a scale step each bar. A different key and string each time.",
          howTo: ["Start well under your clean tempo. Pick, hammer, hammer, pull, pull, hammer, six to the click. Look a bar ahead: the shape changes as it climbs."],
          coach: "This is a warm-up. It tells you how it went, and it decides nothing.",
          vary: {
            values: { key: ["A", "C", "D", "E", "G"], stringSet: ["1", "2", "3"] },
            pooled: ["key", "stringSet"],
            label: (p) => `${p.key} minor on string ${p.stringSet}`,
            build: (p) => climb(p, "/16t", [0, 1, 2, 1, 0, 1, 0, 1, 2, 1, 0, 1, 0, 1, 2, 1, 0, 1, 0, 1, 2, 1, 0, 1], ["", "h", "h", "p", "p", "h"], 7),
          },
          grade: "warmup",
          warmup: { start: 0.6, top: 0.8, reference: "odd-groups.six-roll", fallback: 45 },
          rungs: ladder(40, 70, 5),
          minutes: 3,
        },
      ],
    },
  ],
});
