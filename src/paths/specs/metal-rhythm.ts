/**
 * Metal Rhythm, a Mechanics Path. A draft: no teacher or guitarist has reviewed
 * it.
 *
 * The palm-muted downstroke, the power chord, the gallop and the pedal-tone
 * riff. Strokes are taught in words and the pick plan is free wherever a figure
 * is not strict alternation: a gallop is down, down-up, which an alternating
 * plan cannot print. Two-note power chords are one attack, so they are graded
 * on timing and notes heard and never on pitch.
 */
import { definePath, withCues } from "../spec";
import { METAL_RHYTHM_CUES } from "./metal-rhythm-cues";
import type { ExerciseSpec, VariantParams } from "../spec";
import type { PassBar } from "../format";
import { ladder, repeat } from "../templates";
import { A_STRING_CHUG, GALLOP_CHANGES, TWO_PART_RIFF } from "./metal-rhythm-more";
import { PEDAL_FROM_A, VERSE_AND_CHORUS } from "./metal-rhythm-encore";

const even = (min: number, overBars = 4): PassBar => ({ metric: "timingEvenness", min, overBars });
const heard = (min: number, overBars = 4): PassBar => ({ metric: "notesHeard", min, overBars });
const extras = (max: number): PassBar => ({ metric: "extraNotes", max, overBars: 4 });

/** Power chords: timing, notes heard and extras. Two notes at once are not pitch-checked. */
const CHORDS = { grade: "timing", pass: [even(0.85), heard(0.9), extras(4)] } as const satisfies Partial<ExerciseSpec>;
/** Fast figures: the time is harder to hold. */
const FAST = [even(0.8), heard(0.9), extras(3)];

const FREE = { pick: "free" } as const satisfies Partial<ExerciseSpec>;

const MUTE_CHECK = "Did the muted notes thud with a clear pitch, neither ringing open nor choked dead?";
const DOWN_CHECK = "Were they all downstrokes, to the last bar?";
const TIGHT_CHECK = "On a recording, do the stops sound silent, with nothing ringing through them?";
/** S6, word for word as Rhythm Foundations says it (step `sixteenths`), so its translations are copied. */
const SIXTEENTH_COUNT = "Count '1 e and a, 2 e and a'. The hand goes down on the number and the 'and', up on the 'e' and the 'a'.";
/** S7, word for word as Rhythm Foundations says it (step `triplets`). */
const TRIPLET_COUNT = "Count '1-trip-let, 2-trip-let'. Three even notes a click, with the first one on it.";
const SAFETY =
  "Stop at any pain in the hand, wrist or forearm. A tired forearm is one thing and pain is another; pain ends the set.";

const E_BLUES = { scale: ["E", "blues"] as [string, string] };
const E_MINOR = { scale: ["E", "naturalMinor"] as [string, string] };

// Power chords, root on the low E or A string, first and third fingers.
const E5 = "6:0+5:2f1";
const G5 = "6:3f1+5:5f3";
const A5 = "6:5f1+5:7f3";
const acc = (chord: string) => chord.replace("+", ">+");

/** A riff written on the low E string, also played a string higher: the same frets on the A string. */
function onLowStrings(tab: string, position: number) {
  return {
    values: { stringSet: ["low E string", "A string"] },
    pooled: ["stringSet"] as const,
    label: (p: VariantParams) => p.stringSet,
    build: (p: VariantParams) => {
      const moved = p.stringSet === "A string" ? tab.replace(/\b5:/g, "4:").replace(/\b6:/g, "5:") : tab;
      return { tab: moved, position };
    },
  };
}

// --- Beginner ---------------------------------------------------------------

const OPEN_CHUG = `/8 ${repeat("6:0m", 8)} | ${repeat("6:0m", 6)} 6:3m 6:5m`;
const CHUG_NOTE = `/8 6:0m 6:0m 6:0m 6:3 6:0m 6:0m 6:5 6:3 | 6:0m 6:0m 6:0m 6:3 6:0m 6:6 6:5 6:3`;
const ACCENT_OPEN = `/8 6:0> 6:0m 6:0m 6:0> 6:0m 6:0m 6:0> 6:0m | 6:0> 6:0m 6:0m 6:0> 6:0m 6:0m 6:3> 6:5>`;

const TWO_NOTE_CHORDS = `/4 ${E5} ${E5} ${G5} ${G5} | ${A5} ${A5} ${G5} ${G5}`;
const CHORD_STOPS = `/8 ${E5} ${E5} r ${E5} r ${G5} ${G5} r | ${E5} ${E5} r ${E5} r ${A5} ${G5} r`;
const MOVING_FIFTHS = `/4 ${E5} /8 ${G5} ${A5} r ${E5} ${G5} ${A5} | /4 ${E5} /8 ${G5} ${A5} r ${A5} /4 ${G5}`;

const CHUG_CHORD = `/8 ${acc(E5)} 6:0m 6:0m ${acc(E5)} 6:0m 6:0m ${acc(E5)} 6:0m | ${acc(E5)} 6:0m 6:0m ${acc(E5)} 6:0m 6:0m ${acc(G5)} ${acc(A5)}`;
const CHUG_RIFF = `/8 6:0m 6:0m ${G5} 6:0m 6:0m ${A5} 6:0m 6:0m | 6:0m 6:0m ${G5} 6:0m ${A5} ${G5} /4 ${E5}`;
const STOP_RIFF = `/8 ${E5} 6:0m 6:0m ${G5} r 6:0m ${A5} r | ${E5} 6:0m 6:0m ${G5} r ${A5} ${G5} r`;

// --- Intermediate -----------------------------------------------------------

const gallop = (note: string) => `/8 ${note} /16 ${note} ${note}`;
const reverse = (note: string) => `/16 ${note} ${note} /8 ${note}`;

const GALLOP_ONE = `${repeat(gallop("6:0m"), 4)} | ${repeat(gallop("6:0m"), 2)} ${gallop("6:3m")} ${gallop("6:5m")}`;
const GALLOP_CHORDS = `/8 ${E5} /16 6:0m 6:0m ${repeat(gallop("6:0m"), 3)} | /8 ${G5} /16 6:0m 6:0m ${gallop("6:0m")} /8 ${A5} /16 6:0m 6:0m ${gallop("6:0m")}`;
const GALLOP_RIFF = `${repeat(gallop("6:0m"), 2)} /8 6:3 6:5 ${gallop("6:0m")} | ${repeat(gallop("6:0m"), 2)} /8 6:6 6:5 /4 6:3`;

const REVERSE_ONE = `${repeat(reverse("6:0m"), 4)} | ${repeat(reverse("6:0m"), 2)} ${reverse("6:3m")} ${reverse("6:5m")}`;
const FOUR_TWO = `/16 ${repeat("6:0m", 4)} /8 6:0m 6:0m /16 ${repeat("6:0m", 4)} /8 6:3 6:5 | /16 ${repeat("6:0m", 4)} /8 6:0m 6:0m /16 ${repeat("6:0m", 4)} /8 6:6 6:5`;
const BOTH_GALLOPS = `${gallop("6:0m")} ${reverse("6:0m")} ${gallop("6:0m")} /8 6:3 6:5 | ${gallop("6:0m")} ${reverse("6:0m")} /8 6:6 6:5 /4 6:3`;

const ACCENT_THREES = `/16 6:0> 6:0m 6:0m 6:0> 6:0m 6:0m 6:0> 6:0m 6:0m 6:0> 6:0m 6:0m 6:0> 6:0m 6:0m 6:0m`;
const SIXTEENTH_RIFF = `/16 6:0m 6:0m 6:0m 6:0m 6:3 6:0m 6:0m 6:0m 6:5 6:0m 6:0m 6:0m 6:6 6:0m 6:5 6:0m | 6:0m 6:0m 6:0m 6:0m 6:3 6:0m 6:0m 6:0m 6:5 6:0m 6:6 6:0m 6:5 6:0m 6:3 6:5`;

// --- Advanced ---------------------------------------------------------------

const TRIPLET_CHUG = `/8t ${repeat("6:0> 6:0m 6:0m", 8)}`;
const SEXTUPLET_BURST = `/16t ${repeat("6:0m", 6)} /4 ${E5} /16t ${repeat("6:0m", 6)} /4 ${G5} | /16t ${repeat("6:0m", 6)} /4 ${E5} /16t ${repeat("6:0m", 6)} /4 ${A5}`;
const TREMOLO = `/16 ${repeat("5:7f1", 4)} ${repeat("5:10f4", 4)} ${repeat("5:9f3", 4)} ${repeat("5:7f1", 4)} | ${repeat("5:9f1", 4)} ${repeat("5:10f2", 4)} ${repeat("5:12f4", 4)} ${repeat("5:10f2", 4)}`;

const PEDAL_A = `/16 5:7 6:0m 6:0m 5:9 6:0m 6:0m 5:10 6:0m 6:0m 5:9 6:0m 6:0m 5:7 6:0m 5:9 6:0m | 5:7 6:0m 6:0m 5:9 6:0m 6:0m 5:10 6:0m 6:0m 5:9 6:0m 6:0m 5:10 6:0m 5:9 6:0m`;
const PEDAL_SKIP = `/16 4:9 6:0m 6:0m 4:7 6:0m 6:0m 4:10 6:0m 6:0m 4:9 6:0m 6:0m 4:7 6:0m 4:9 6:0m | 4:10 6:0m 6:0m 4:9 6:0m 6:0m 4:7 6:0m 6:0m 4:9 6:0m 6:0m 4:10 6:0m 4:9 6:0m`;
const PEDAL_BOTH = `/16 5:7 6:0m 6:0m 4:7 6:0m 6:0m 5:9 6:0m 6:0m 4:9 6:0m 6:0m 5:10 6:0m 4:10 6:0m | 4:9 6:0m 6:0m 5:10 6:0m 6:0m 4:7 6:0m 6:0m 5:9 6:0m 6:0m 5:7 6:0m 4:7 6:0m`;

// Sixteenths with rests in them: the stop-start riff of modern metal.
const CHUG_REST = `/16 ${repeat("6:0m 6:0m r", 4)} 6:0m 6:0m 6:0m r | ${repeat("6:0m 6:0m r", 4)} /8 6:3 6:5`;
const STOP_START = `/8 ${E5} r /16 ${repeat("6:0m", 4)} /8 r ${G5} /16 6:0m 6:0m r r | /8 ${E5} r /16 ${repeat("6:0m", 4)} /8 r ${A5} ${G5} r`;
const GALLOP_HOLES = `${gallop("6:0m")} /16 r 6:0m 6:0m r /8 6:3f1 /16 r 6:0m /8 6:5f3 r | ${gallop("6:0m")} /16 r 6:0m 6:0m r /8 6:6f4 /16 r 6:0m /8 6:5f3 6:3f1`;

// Four bars over the band: gallops on E, a climb, then G and A with the chords on their downbeats.
const BAND_RIFF = `${repeat(gallop("6:0m"), 2)} /8 6:3f1 6:5f3 ${gallop("6:0m")} | ${repeat(gallop("6:0m"), 2)} /8 6:5f3 6:6f4 /16 6:5f3 6:0m 6:0m 6:0m | ${repeat(gallop("6:3mf1"), 3)} /8 6:5f3 6:3f1 | ${repeat(gallop("5:0m"), 2)} /8 5:3f1 5:5f3 /4 5:0`;
const DOWN_MINUTE = `/8 ${repeat("6:0m", 6)} 6:3m 6:5m | ${repeat("6:0m", 6)} 6:5m 6:3m`;
const GALLOP_MINUTE = `${repeat(gallop("6:0m"), 3)} ${gallop("6:3m")} | ${repeat(gallop("6:0m"), 3)} ${gallop("6:5m")}`;

/** Warm-up roots: where each key's root sits on the low E string. */
const ROOT_FRET: Readonly<Record<string, number>> = { "F#": 2, G: 3, A: 5, B: 7, C: 8, D: 10 };

/**
 * A warm-up riff on one string: the root and its minor third in one position,
 * the fourth and fifth a hand higher. `cell` turns one fretted note into a beat.
 */
function rootRiff(p: VariantParams, value: string, cell: (note: string) => string) {
  const string = p.stringSet === "low E string" ? 6 : 5;
  const root = ROOT_FRET[p.key];
  const note = (up: number, finger: number) => `${string}:${root + up}mf${finger}`;
  const [r, third, fourth, fifth] = [note(0, 1), note(3, 4), note(5, 1), note(7, 3)];
  const bar = (notes: string[]) => `${value} ${notes.map(cell).join(" ")}`;
  const tab = [bar([r, r, third, r]), bar([fourth, fourth, fifth, fourth]), bar([r, r, third, r]), bar([fourth, fifth, fourth, fourth])].join(" | ");
  // The key is named from the low E string; the same frets on the A string are a fourth higher.
  const key = string === 6 ? p.key : ON_A[p.key];
  return { tab, position: root, shifts: true, harmony: { scale: [key, "minorPentatonic"] as [string, string] } };
}

/** The root that sounds: the same frets on the A string are a fourth higher than the key they are listed under. */
const ON_A: Readonly<Record<string, string>> = { "F#": "B", G: "C", A: "D", B: "E", C: "F", D: "G" };
const warmLabel = (p: VariantParams) => `${p.stringSet === "A string" ? ON_A[p.key] : p.key} on the ${p.stringSet}`;

const WARMUP_VALUES = { key: Object.keys(ROOT_FRET), stringSet: ["low E string", "A string"] } as const;

export default withCues(definePath({
  id: "metal-rhythm",
  title: "Metal Rhythm",
  kind: "mechanics",
  category: "technique",
  goal: "Play a tight palm-muted riff with power chords, gallops and a pedal tone, at tempo with a band and for a full minute.",
  level: "early-intermediate",
  assumes:
    "You can play eighth notes with a click at 80 BPM and fret a note on the low strings cleanly. An electric guitar with some distortion helps, but every Exercise works clean. The minutes listed are one pass through the material; expect to come back to each Step for days or weeks.",
  prerequisites: { paths: [{ path: "rhythm-foundations", level: "beginner" }], skills: ["Eighth notes with a click at 80 BPM", "Clean single notes on the low strings"] },
  labelSubdivisions: "mostly",
  paceLadders: true,
  variantText: true,
  orderRationale:
    "The palm mute and the downstroke first, because every later riff is made of them. Power chords next, then the two together, which is already a riff, and then the same chug and chords from the A string, so later riffs can use both low strings. The gallop and its reverse are the same three notes with one stroke left out, so they come before continuous sixteenths, where no stroke is left out and the hand has to alternate. Chord changes under the gallop close that Level, once the picking hand no longer needs watching. Chugs with silent sixteenths in them open the last Level: they are the gallops, sixteenths and power chords you already have, with holes cut in them, and nothing in them is faster. Triplets and bursts, pedal riffs that leave the low string, pedal riffs from the A string, a riff that joins a pedal part to a gallop part, and the long takes come last because they need the stamina the earlier Steps build. The Path ends on a verse and a chorus played over the band as a sixteen-bar form.",
  gradingLimits:
    "The app times each attack and counts the ones it heard. A two-note power chord is one attack: it is timed and counted, and its pitch is not checked. Palm muting and the direction of each stroke are taught here and cannot be heard apart, so they are yours to keep honest. Heavy distortion and compression blur where a note starts; for a graded take, turn the gain down to a crunch, or use the dry signal if your interface has one. Sixteenths above 150 BPM are close to the fastest the app will grade. None of this has been tried on a real guitar yet.",
  steps: [
    {
      id: "the-chug",
      title: "The chug",
      goal: "Play palm-muted eighth notes on a low string in downstrokes, every one the same weight, and lift the mute for an accent.",
      why: "The palm-muted downstroke is the sound of metal rhythm guitar. It is two skills at once: the picking hand mutes and plays in the same place, and the stroke only ever goes down, so the hand has to come back up between every note without being heard.",
      howTo: [
        "Rest the side of the picking hand on the strings right where they leave the bridge. Too far forward and the note dies; too far back and it rings. Find the spot where it thuds and still has a pitch.",
        "Every note is a downstroke. Play from the wrist, small, and let the hand bounce back up by itself.",
        "For an accent, lift the palm a little so the string rings, and bring it straight back.",
      ],
      payoff: "A two-bar riff on the low E string that thuds evenly and opens up where you choose.",
      exercises: [
        {
          id: "open-chug",
          title: "Eight to the bar",
          purpose: "Palm-muted eighths on an open low string, the low E or the A, all downstrokes, with two fretted notes at the end of the second bar. The sound comes first: get the mute right before you worry about speed.",
          howTo: [
            "Eighth notes, two to the click, all down. The last two notes are frets 3 and 5, muted like the rest.",
            "Listen to each note. They should all be as short and as loud as each other, like a machine.",
          ],
          coach: "I time every stroke and say how even they were. The mute and the direction of the strokes are for you to judge.",
          ...FREE,
          vary: onLowStrings(OPEN_CHUG, 3),
          tab: OPEN_CHUG,
          position: 3,
          rungs: ladder(60, 160, 10),
          passAt: 100,
          grade: "timing",
          selfCheck: [MUTE_CHECK, DOWN_CHECK],
          minutes: 5,
        },
        {
          id: "chug-and-note",
          title: "Muted and ringing",
          purpose: "The chug with fretted notes let out of the mute: G, A and the Bb that makes it sound heavy. The palm has to lift and come back inside an eighth note.",
          howTo: [
            "Mute the open E notes and let the fretted notes ring: lift the palm just enough as you play them.",
            "First finger on fret 3, third on fret 5, little finger on fret 6. All downstrokes.",
          ],
          coach: "After the take I'll say how even it was and whether the notes were the written ones.",
          ...FREE,
          tab: CHUG_NOTE,
          position: 3,
          harmony: E_BLUES,
          rungs: ladder(60, 160, 10),
          passAt: 100,
          grade: "timingNotes",
          selfCheck: [MUTE_CHECK],
          minutes: 5,
        },
        {
          id: "accent-open",
          title: "Accents in threes",
          purpose: "The open E string with the mute lifted on every third eighth: 3 + 3 + 2. The accents make the riff; bar 2 ends on two accented fretted notes.",
          howTo: [
            "Lift the palm for the accented notes and dig in a little more. Mute everything else.",
            "Count '1 2 3, 1 2 3, 1 2'. In bar 2 the last two accents are frets 3 and 5.",
          ],
          coach: "Accents are measured roughly: louder than the notes either side or not. With heavy gain they flatten out, so try this one with less.",
          ...FREE,
          tab: ACCENT_OPEN,
          position: 3,
          rungs: ladder(60, 150, 10),
          passAt: 100,
          grade: "accents",
          minutes: 5,
        },
      ],
    },
    {
      id: "power-chords",
      title: "Power chords",
      goal: "Play two-note power chords on the low strings, move them without a gap, and stop them dead.",
      why: "A power chord is two notes on two neighbouring strings: the root and the note musicians call a fifth above it, two frets up on the next string. The root is the note a chord is named after. A power chord has no major or minor in it, which is why it stays clear under distortion. The shape never changes, so the work is in moving it in time and in silencing it.",
      howTo: [
        "First finger on the root, third finger two frets up on the next string. For E, the low E string is open and the first finger takes fret 2 of the A string.",
        "Let the first finger lie lightly across the higher strings so they can't ring, and hit only the two strings of the chord.",
        "To stop a chord, relax the fretting fingers without lifting them off the strings, and lay the picking hand down at the same time.",
      ],
      payoff: "Three chords, E, G and A, that move in time and stop as one.",
      difficultyException:
        "Chords in quarters, and in eighths with rests between them, after eight chugs to the bar; a two-note chord is one attack, so the rate falls. The demand is both fingers landing as one shape and both strings stopping together, which the metric does not count.",
      exercises: [
        {
          id: "two-note-chords",
          title: "E, G and A",
          purpose: "E, G and A in quarter notes, two strokes on each, and back to G to finish. Slow enough to land both fingers at once and hear both strings.",
          howTo: [
            "E: open low E and fret 2 on the A string. G: fret 3 and fret 5. A: fret 5 and fret 7. Downstrokes through both strings.",
            "Move the hand as one shape. The fingers keep their spacing while the hand slides.",
          ],
          coach: "A chord is one attack to me: I time it and count it, and I don't check its pitch.",
          ...FREE,
          tab: TWO_NOTE_CHORDS,
          position: 2,
          shifts: true,
          chords: "E5 | A5",
          ...CHORDS,
          rungs: ladder(60, 140, 10),
          passAt: 100,
          selfCheck: ["Did both strings of every chord sound, and no others?"],
          minutes: 5,
        },
        {
          id: "chord-stops",
          title: "Chords and stops",
          purpose: "Eighth-note chords with rests between them. The silence has to be as tight as the chord, or the riff turns to mush.",
          howTo: [
            "Count '1 and, (2) and, (3) and 4, (and)'. Stop the strings with both hands on each rest.",
            "All downstrokes. The hand keeps moving in eighths through the rests.",
          ],
          coach: "I time each chord. A sound in a rest counts as an extra note; strings left humming are for your ear.",
          ...FREE,
          tab: CHORD_STOPS,
          position: 2,
          shifts: true,
          chords: "E5 | E5",
          ...CHORDS,
          rungs: ladder(60, 140, 10),
          passAt: 90,
          selfCheck: [TIGHT_CHECK],
          minutes: 5,
        },
        {
          id: "moving-fifths",
          title: "A riff in fifths",
          purpose: "E held for a beat, then G and A as eighths, a rest, and round again: a riff made of nothing but power chords.",
          howTo: [
            "The hand jumps from the open E shape to fret 3. Go early: leave the E chord a hair before the beat is over.",
            "Keep the first and third fingers on their strings as the shape slides between G and A.",
          ],
          coach: "The jump from E to G is where a chord arrives late. I'll say how even it was.",
          ...FREE,
          tab: MOVING_FIFTHS,
          position: 2,
          shifts: true,
          chords: "E5 | E5",
          ...CHORDS,
          rungs: ladder(60, 140, 10),
          passAt: 90,
          minutes: 6,
        },
      ],
    },
    {
      id: "chug-and-chord",
      title: "Chug against chord",
      goal: "Switch between muted single notes and ringing power chords inside one bar, all in downstrokes.",
      why: "This is the riff every heavy band plays: a muted low string chugging, and chords punching out of it. The picking hand has to change from one muted string to two ringing ones and back in an eighth note, and the contrast between the two is the whole effect.",
      howTo: [
        "Muted notes: one string, palm down, small stroke. Chords: palm up, a bigger stroke through two strings.",
        "Keep the fretting hand's shape hovering over the next chord while the open string chugs.",
        "Loud chords, quiet chug. If they sound the same, exaggerate the difference until they don't.",
      ],
      payoff: "A riff that sounds like a record: chug, chug, chord.",
      exercises: [
        {
          id: "chug-chord",
          title: "E chord out of the chug",
          purpose: "The 3 + 3 + 2 accents again, but each accent is now a ringing E power chord and the notes between are muted.",
          howTo: [
            "First finger stays on fret 2 of the A string until the last beat of bar 2. On the accents, lift the palm and strike both strings.",
            "Bar 2 ends with G and A chords on the last two eighths.",
          ],
          coach: "I check that the chords were louder than the chug, roughly, and how even the time was.",
          ...FREE,
          tab: CHUG_CHORD,
          position: 2,
          shifts: true,
          chords: "E5 | E5",
          rungs: ladder(60, 150, 10),
          passAt: 100,
          grade: "accents",
          minutes: 5,
        },
        {
          id: "chug-riff",
          title: "Chords on the move",
          purpose: "Two muted notes, a G chord, two muted notes, an A chord: the chords change while the chug stays on the open string.",
          howTo: [
            "In bar 1 the fretting hand has two muted notes to get to each chord: move during them. In bar 2 the A and G chords come back to back.",
            "The last chord of bar 2 is an E held for a beat. Let it ring.",
          ],
          coach: "I time every attack, chug and chord alike, and say how even they were.",
          ...FREE,
          tab: CHUG_RIFF,
          position: 3,
          shifts: true,
          chords: "E5 | E5",
          ...CHORDS,
          rungs: ladder(60, 150, 10),
          passAt: 100,
          selfCheck: [MUTE_CHECK],
          minutes: 6,
        },
        {
          id: "stop-riff",
          title: "Chug, chord, stop",
          purpose: "The same idea with holes in it: a rest after the G chord and after the A. Three sounds now, muted, ringing and silent.",
          howTo: [
            "Count '1 and 2 and, (3) and 4, (and)'. Kill the chord with both hands on each rest.",
            "Don't let the rest shorten. The attack after it, a chug in bar 1 and the A chord in bar 2, comes on the 'and', not before.",
          ],
          coach: "The note after each rest is the one I'd look at: early is the usual mistake.",
          ...FREE,
          tab: STOP_RIFF,
          position: 2,
          shifts: true,
          chords: "E5 | E5",
          ...CHORDS,
          rungs: ladder(60, 150, 10),
          passAt: 100,
          selfCheck: [TIGHT_CHECK],
          minutes: 6,
        },
      ],
    },
    A_STRING_CHUG,
    {
      id: "gallop",
      title: "The gallop",
      goal: "Play the gallop, an eighth and two sixteenths, evenly on a muted string and against chords.",
      why: "The gallop is the rhythm of classic heavy metal. It is three strokes to a beat, down, down-up, and the trouble is the two short ones: they bunch up against the next beat unless the hand keeps a steady sixteenth-note swing underneath. Rhythm Foundations teaches this figure by itself, more slowly, in its Step Four to a beat.",
      howTo: [
        SIXTEENTH_COUNT,
        "The gallop is that count with the 'e' left out: '1, and a, 2, and a'. Down on the beat, then down-up on the 'and a'.",
        "The hand swings in sixteenths the whole time and misses the string once a beat, on the 'e'.",
        "Stay palm-muted and keep the strokes small. The gallop gets its sound from being tight, not loud.",
      ],
      payoff: "A galloping riff on the low E string that holds its shape as the tempo climbs.",
      exercises: [
        {
          id: "gallop-one",
          title: "The gallop on one string",
          purpose: "Eight gallops on one muted low string, the low E or the A, the last two on frets 3 and 5. Nothing to think about except the three strokes.",
          howTo: [
            "Down, down-up, on every beat. The long note is on the click.",
            "If the two short notes sound like one smeared note, slow down a rung until you can hear both.",
          ],
          coach: "I time all three notes of every beat and say how even they were. The strokes are yours to keep.",
          ...FREE,
          vary: onLowStrings(GALLOP_ONE, 3),
          tab: GALLOP_ONE,
          position: 3,
          rungs: ladder(50, 140, 10),
          passAt: 85,
          grade: "timing",
          pass: FAST,
          selfCheck: [MUTE_CHECK],
          minutes: 5,
        },
        {
          id: "gallop-chords",
          title: "A chord, then the gallop",
          purpose: "A power chord on beat 1 of bar 1, and on beats 1 and 3 of bar 2, with the gallop carrying on underneath on the open string.",
          howTo: [
            "The chord takes the place of the gallop's long note: chord, then the two short muted notes, then a full gallop.",
            "E, then G and A in the second bar. Lift the palm for the chord and drop it straight back.",
          ],
          coach: "I time every attack and say how even they were. A chord's pitch is not something I check.",
          ...FREE,
          tab: GALLOP_CHORDS,
          position: 2,
          shifts: true,
          chords: "E5 | E5",
          ...CHORDS,
          pass: FAST,
          rungs: ladder(50, 140, 10),
          passAt: 100,
          minutes: 6,
        },
        {
          id: "gallop-riff",
          title: "A galloping riff",
          purpose: "Two gallops, two ringing eighth notes that climb, and a gallop to answer; the second bar ends on a long note. E blues on one string.",
          howTo: [
            "The eighth notes on frets 3, 5 and 6 ring, with the palm lifted, and are all downstrokes: first finger on 3, third on 5, little finger on 6.",
            "Keep the sixteenth-note swing going through the eighths, so the next gallop starts in time.",
          ],
          coach: "After the take I'll say how even it was and whether the notes were the written ones.",
          ...FREE,
          tab: GALLOP_RIFF,
          position: 3,
          shifts: true,
          harmony: E_BLUES,
          rungs: ladder(50, 140, 10),
          passAt: 100,
          grade: "timingNotes",
          pass: [...FAST, { metric: "noteIdentity", min: 0.85, overBars: 4 }],
          minutes: 6,
        },
      ],
    },
    {
      id: "reverse-gallop",
      title: "The reverse gallop",
      goal: "Play two sixteenths and an eighth, bursts of four sixteenths, and change between them and the gallop.",
      why: "Turn the gallop round and the short notes come first: down-up, down. It feels like a different rhythm and it trips players who learned the gallop as a reflex. Riffs mix the two, and a burst of four sixteenths between eighths, so each has to be a choice.",
      howTo: [
        "Count '1 e and, 2 e and'. Down-up on the '1 e', down on the 'and'.",
        "The first short note is on the click. Don't let the pair fall early, before the beat.",
        "For four sixteenths and two eighths, count '1 e and a, 2 and': down-up-down-up, down, down.",
      ],
      payoff: "A riff with both gallops in it, played without having to think which is which.",
      exercises: [
        {
          id: "reverse-one",
          title: "Short-short-long",
          purpose: "Eight reverse gallops on one muted low string, the low E or the A, the last two on frets 3 and 5.",
          howTo: [
            "Down-up, down, on every beat. The hand misses the string on the 'a'.",
            "Give the first note of each beat a little weight so you can hear where the beat is.",
          ],
          coach: "I time all three notes of every beat and say how even they were.",
          ...FREE,
          vary: onLowStrings(REVERSE_ONE, 3),
          tab: REVERSE_ONE,
          position: 3,
          rungs: ladder(50, 140, 10),
          passAt: 85,
          grade: "timing",
          pass: FAST,
          minutes: 5,
        },
        {
          id: "four-two",
          title: "Four fast, two slow",
          purpose: "A beat of four muted sixteenths and a beat of two eighths, twice a bar. The eighths at the end of each bar are fretted and ring.",
          howTo: [
            "The sixteenths alternate, down-up-down-up. The eighths are both downstrokes.",
            "The eighths are exactly half the speed of the sixteenths. Players nearly always rush them.",
          ],
          coach: "After the take I'll say how even it was and whether the notes were the written ones.",
          ...FREE,
          tab: FOUR_TWO,
          position: 3,
          shifts: true,
          harmony: E_BLUES,
          rungs: ladder(50, 140, 10),
          passAt: 100,
          grade: "timingNotes",
          pass: [...FAST, { metric: "noteIdentity", min: 0.85, overBars: 4 }],
          minutes: 6,
        },
        {
          id: "both-gallops",
          title: "Both gallops in one riff",
          purpose: "A gallop, a reverse gallop, a gallop, and two ringing eighths; then the answer, ending on a long note.",
          howTo: [
            "Say it first: '1, and a, 2 e and, 3, and a, 4 and'.",
            "The hand swings in sixteenths from start to finish. Only which strokes touch the string changes.",
          ],
          coach: "This is the Step's test piece. I'll say how even it was and check the notes after the take.",
          ...FREE,
          tab: BOTH_GALLOPS,
          position: 3,
          shifts: true,
          harmony: E_BLUES,
          rungs: ladder(50, 140, 10),
          passAt: 100,
          grade: "timingNotes",
          pass: [...FAST, { metric: "noteIdentity", min: 0.85, overBars: 4 }],
          minutes: 6,
        },
      ],
    },
    {
      id: "sixteenth-chug",
      title: "Sixteenths, alternate picked",
      goal: "Play a bar of continuous palm-muted sixteenths with strict down-up strokes, and put accents and fretted notes into it.",
      why: "Past a certain tempo downstrokes run out and the hand has to alternate. The gallops did it for a few notes at a time. A whole bar of muted sixteenths never lets up: the upstroke has to be as heavy as the downstroke, under a palm mute, which is harder than it sounds because the pick meets the string from the other side.",
      howTo: [
        "Strict alternation: down on the beat and the 'and', up on the 'e' and the 'a'. Never two the same way.",
        "Angle the pick a little so it slides through the string in both directions.",
        "Accents are made by lifting the palm, on whichever stroke they fall.",
      ],
      payoff: "A sixteenth-note riff with a melody poking out of the chug.",
      exercises: [
        {
          id: "straight-sixteenths",
          title: "Sixteen to the bar",
          purpose: "Two bars of muted sixteenths on an open low string, the low E or the A, with the mute lifted on the first note of every beat.",
          howTo: [
            "Down-up-down-up, four to the click. Lift the palm slightly on each beat's first note.",
            "Listen to the upstrokes. If they are thinner than the downstrokes, slow down and even them out.",
          ],
          coach: "I check that the first note of each beat was louder, roughly, and how even the sixteenths were.",
          vary: onLowStrings(`/16 ${repeat("6:0> 6:0m 6:0m 6:0m", 4)} | ${repeat("6:0> 6:0m 6:0m 6:0m", 4)}`, 1),
          tab: `/16 ${repeat("6:0> 6:0m 6:0m 6:0m", 4)} | ${repeat("6:0> 6:0m 6:0m 6:0m", 4)}`,
          position: 1,
          rungs: ladder(50, 150, 10),
          passAt: 95,
          grade: "accents",
          minutes: 5,
        },
        {
          id: "accent-threes",
          title: "Threes across the beat",
          purpose: "The same sixteen notes with an accent every three: five accents a bar, and two of them fall on upstrokes.",
          howTo: [
            "Count the sixteenths '1 2 3, 1 2 3, 1 2 3, 1 2 3, 1 2 3 4'. The picking never changes; only the palm does.",
            "Tap your foot on the beat and let the accents pull against it.",
          ],
          coach: "The accents on the upstrokes are the test. The accent readout is rough, so trust your ear too.",
          tab: ACCENT_THREES,
          position: 1,
          rungs: ladder(50, 140, 10),
          passAt: 90,
          grade: "accents",
          minutes: 6,
        },
        {
          id: "sixteenth-riff",
          title: "A melody out of the chug",
          purpose: "Sixteenths on the low E string where some of the notes are fretted and ring: G, A and Bb come up out of the muted pedal.",
          howTo: [
            "First finger on fret 3, third on fret 5, little finger on fret 6. Lift the palm for the fretted notes.",
            "Strict down-up. Nearly every fretted note falls on a downstroke; the very last note of bar 2 is on an upstroke.",
          ],
          coach: "After the take I'll say how even it was and whether the notes were the written ones.",
          tab: SIXTEENTH_RIFF,
          position: 3,
          shifts: true,
          harmony: E_BLUES,
          rungs: ladder(50, 140, 10),
          passAt: 95,
          grade: "timingNotes",
          pass: [...FAST, { metric: "noteIdentity", min: 0.85, overBars: 4 }],
          minutes: 6,
        },
      ],
    },
    GALLOP_CHANGES,
    {
      id: "stop-start",
      title: "Chugs with holes in them",
      goal: "Play sixteenth-note riffs where some of the sixteenths are silent, so the riff starts and stops inside the beat.",
      why: "Modern heavy riffs are as much silence as sound: a burst of chugs, a hole, a chord, another hole. The holes are what make it heavy, and they only work if the strings are completely dead in them and the next note comes in exactly on its sixteenth.",
      howTo: [
        "The picking hand swings in sixteenths the whole time, down-up, and only touches the string on the written notes.",
        "In a rest, the palm presses down a little harder and the fretting hand relaxes on the strings. Nothing rings.",
        "Count '1 e and a' out loud at the first rung and say the played syllables louder.",
      ],
      payoff: "A stop-start riff that sounds like a machine switching on and off.",
      difficultyException:
        "The rests bring the note count down from the gallops through chord changes of the Step before. The demand is dead silence on a sixteenth and coming back in on the next, which a note-rate metric does not count.",
      exercises: [
        {
          id: "chug-rest",
          title: "Two on, one off",
          purpose: "Chug, chug, rest, in sixteenths: a three-sixteenth figure that rolls across the beat, on one muted low string, with two fretted eighths, not muted, to end the second bar.",
          howTo: [
            "Count the sixteenths '1 2 3, 1 2 3' and play on 1 and 2. Four times, then three chugs and a rest to fill the bar. In bar 2 the two eighths take the place of the three chugs and the rest.",
            "The hand keeps swinging down-up, so the figure starts on a downstroke, then an upstroke, in turn.",
          ],
          coach: "I time each chug against where it is written. A sound in a rest counts as an extra note.",
          ...FREE,
          vary: onLowStrings(CHUG_REST, 3),
          tab: CHUG_REST,
          position: 3,
          rungs: ladder(50, 130, 10),
          passAt: 90,
          grade: "timing",
          pass: FAST,
          selfCheck: [TIGHT_CHECK],
          minutes: 6,
        },
        {
          id: "chord-and-burst",
          title: "Chord, hole, burst",
          purpose: "A power chord on the beat, half a beat of silence, four muted sixteenths, another hole, a chord off the beat. Two bars, E, G and A.",
          howTo: [
            "Bar 1: E chord on 1, rest, four chugs on beat 2, rest, G chord on the 'and' of 3, two chugs and half a beat of rest.",
            "Kill each chord with both hands. The chugs after a hole start exactly on the beat, not a hair before.",
          ],
          coach: "I time every attack, chord and chug alike. A chord's pitch is not something I check.",
          ...FREE,
          tab: STOP_START,
          position: 2,
          shifts: true,
          chords: "E5 | E5",
          ...CHORDS,
          pass: FAST,
          rungs: ladder(50, 130, 10),
          passAt: 90,
          selfCheck: [TIGHT_CHECK],
          minutes: 7,
        },
        {
          id: "gallop-holes",
          title: "A gallop with holes",
          purpose: "A gallop, then sixteenths with the first and last one missing, then ringing notes on frets 3, 5 and 6 with a single chug between them. E blues on one string.",
          howTo: [
            "Bar 1: '1, and a, (2) e and, 3, a, 4'. The ringing notes on frets 3 and 5 are eighths; the single chug before beat 4 is on the 'a'.",
            "First finger on fret 3, third on 5, little finger on 6: one finger per fret, and a real stretch this low on the neck.",
          ],
          coach: "This is the Step's test piece. I'll say how even it was and check the notes after the take.",
          ...FREE,
          tab: GALLOP_HOLES,
          position: 3,
          shifts: true,
          harmony: E_BLUES,
          rungs: ladder(50, 130, 10),
          passAt: 90,
          grade: "timingNotes",
          pass: [...FAST, { metric: "noteIdentity", min: 0.85, overBars: 4 }],
          minutes: 7,
        },
      ],
    },
    {
      id: "triplets-and-bursts",
      title: "Triplets, bursts and tremolo",
      goal: "Chug in triplets, fire a six-note burst into a chord, and tremolo-pick a melody on one string.",
      why: "Three more tools of the fast riff. Triplet chugs are the swing of doom and thrash alike. A burst of sextuplets into a chord is a drum fill on the guitar. Tremolo picking turns a slow melody into a wall of sound. All three depend on a relaxed alternating wrist at speed.",
      howTo: [
        TRIPLET_COUNT,
        "Triplets alternate strictly, so every other beat starts on an upstroke. Accent the first note of each beat either way.",
        "A burst is one flick of six strokes, aimed at the note after it. Rest the hand on the chord.",
        "For tremolo, make the stroke as small as you can and let the wrist stay loose. Tension is what stops it.",
      ],
      payoff: "A tremolo-picked melody in E minor, and bursts that land on their chord. The triplet chug comes back in this Level's warm-ups.",
      exercises: [
        {
          id: "triplet-chug",
          title: "The triplet chug",
          purpose: "Two bars of muted triplets on an open low string, the low E or the A, with the first note of each beat let out.",
          howTo: [
            "Count '1-trip-let, 2-trip-let'. Strict down-up, so beats 2 and 4 start on an upstroke.",
            "Make the accent on the upstroke beats as strong as on the downstroke ones.",
          ],
          coach: "I check that the first note of each beat was louder, roughly, and how even the triplets were.",
          vary: onLowStrings(TRIPLET_CHUG, 1),
          tab: TRIPLET_CHUG,
          position: 1,
          rungs: ladder(60, 160, 10),
          passAt: 130,
          grade: "accents",
          minutes: 5,
        },
        {
          id: "sextuplet-burst",
          title: "A burst into a chord",
          purpose: "Six muted notes in one beat, then a power chord held for a beat. E, G, E and A.",
          howTo: [
            "Sextuplets: six to the click, down-up from a downstroke. The chord lands on the next beat with a downstroke.",
            "Let the hand go soft while the chord rings, and set the fretting hand for the next chord.",
          ],
          coach: "I time the six notes and the chord after them. Above the middle rungs, evenness is the number to trust.",
          ...FREE,
          tab: SEXTUPLET_BURST,
          position: 2,
          shifts: true,
          chords: "E5 | E5",
          ...CHORDS,
          pass: FAST,
          rungs: ladder(40, 110, 10),
          passAt: 70,
          selfCheck: ["On a recording, can you hear six separate notes in each burst?"],
          minutes: 6,
        },
        {
          id: "tremolo",
          title: "A tremolo melody",
          purpose: "A slow E minor melody on the A string with every note picked four times: the melody moves once a beat and the pick never stops.",
          howTo: [
            "Sixteenths, strict down-up, no palm mute: let it ring. First finger on fret 7, third on 9, little finger on 10; the hand moves up two frets for bar 2, with the first finger on 9.",
            "Change note exactly on the beat. The fretting hand is slow and the picking hand is fast; don't let one infect the other.",
          ],
          coach: "After the take I'll say how even it was and whether the notes were the written ones.",
          tab: TREMOLO,
          position: 7,
          shifts: true,
          harmony: E_MINOR,
          rungs: ladder(60, 140, 10),
          passAt: 110,
          grade: "timingNotes",
          pass: [...FAST, { metric: "noteIdentity", min: 0.85, overBars: 4 }],
          minutes: 6,
        },
      ],
    },
    {
      id: "pedal-riffs",
      title: "Pedal-tone riffs",
      goal: "Play a melody on the A and D strings against a muted open low E, in sixteenths, without the pedal ringing or the melody choking.",
      why: "A pedal riff is two parts on one guitar: a muted low note that keeps returning and a melody above it. The pick has to leave the low string, cross one or two strings, and come back, in time, and the palm has to mute one string while the other rings.",
      howTo: [
        "Strict alternate picking. The melody notes fall on different strokes as the pattern turns, so don't try to make them all downstrokes.",
        "Keep the palm on the low E string only. Roll the hand slightly so the A and D strings are free.",
        "On a skip to the D string, the pick travels over the A string in a small arc. Don't lift the forearm.",
        "If the crossings between neighbouring strings trip you, Alternate Picking drills them alone in its Step Crossing two strings.",
      ],
      payoff: "A riff where a melody on two strings dances over a chugging low E.",
      exercises: [
        {
          id: "pedal-a",
          title: "Melody on the A string",
          purpose: "E, F# and G on the A string, each followed by two muted open E notes: groups of three sixteenths that roll across the beat, until the last beat, where melody and pedal take turns.",
          howTo: [
            "First finger on fret 7, third on 9, little finger on 10. One melody note, two pedal notes.",
            "The melody notes ring and the open E is muted. Keep the strokes alternating through every crossing.",
          ],
          coach: "After the take I'll say how even it was and whether the notes were the written ones.",
          tab: PEDAL_A,
          position: 7,
          harmony: E_MINOR,
          rungs: ladder(50, 130, 10),
          passAt: 90,
          grade: "timingNotes",
          pass: [...FAST, { metric: "noteIdentity", min: 0.85, overBars: 4 }],
          selfCheck: [MUTE_CHECK],
          minutes: 6,
        },
        {
          id: "pedal-skip",
          title: "Melody on the D string",
          purpose: "The same pattern with the melody a string further away: A, B and C on the D string, and the A string skipped on every crossing.",
          howTo: [
            "The same three fingers on the same frets, one string higher. Rest a spare finger on the A string so it can't ring.",
            "The skip makes the pick's journey longer. Slow down until the pedal notes are as even as before.",
          ],
          coach: "After the take I'll say how even it was and whether the notes were the written ones.",
          tab: PEDAL_SKIP,
          position: 7,
          harmony: E_MINOR,
          rungs: ladder(50, 130, 10),
          passAt: 85,
          grade: "timingNotes",
          pass: [...FAST, { metric: "noteIdentity", min: 0.85, overBars: 4 }],
          minutes: 6,
        },
        {
          id: "pedal-both",
          title: "Melody on both strings",
          purpose: "The melody now jumps between the A and D strings over the same pedal: fourths and thirds in the tune, a crossing and a skip in every beat.",
          howTo: [
            "Bar 1 climbs: the A string note, then the same fret on the D string. Bar 2 comes back down with the D string first: fret 9, then the A string's 10, the D string's 7, the A string's 9, and both 7s to finish.",
            "In bar 1 each pair is one finger: lay it flat across the A and D strings and pick one string at a time.",
          ],
          coach: "This is the Step's test piece. I'll say how even it was and check the notes after the take.",
          tab: PEDAL_BOTH,
          position: 7,
          harmony: E_MINOR,
          rungs: ladder(50, 130, 10),
          passAt: 85,
          grade: "timingNotes",
          pass: [...FAST, { metric: "noteIdentity", min: 0.85, overBars: 4 }],
          minutes: 7,
        },
      ],
    },
    PEDAL_FROM_A,
    TWO_PART_RIFF,
    {
      id: "riffs-at-length",
      title: "The band, and a full minute",
      goal: "Hold a galloping riff over a rock band for four bars, and keep downstrokes and gallops going for sixty seconds.",
      why: "A riff is played for minutes, not bars. Downpicking at speed is a stamina skill, the picking arm tires long before the fingers do, and the first sign is the time drifting late. A band behind you makes the same demand a different way: the riff has to lock to the kick drum.",
      howTo: [
        "For the minute-long takes, start on the first rung. It should feel easy for the first ten seconds. Move up a rung only when a whole minute stays even.",
        "Keep the shoulder down and the grip on the pick light. If the forearm locks, the set is over.",
        SAFETY,
      ],
      payoff: "A four-bar riff that sits on a band, and a minute of downstrokes that ends as tight as it began.",
      difficultyException:
        "Mostly gallops and eighth notes with hardly a string crossing, after an eight-bar riff that crosses strings in sixteenths, so the number falls though the attacks come about as fast. The demand is a band to lock to and sixty seconds without the time drifting, and the metric does not count stamina or listening.",
      exercises: [
        {
          id: "band-riff",
          title: "A riff with the band",
          purpose: "Four bars in E minor over a hard rock groove: gallops on E with a climbing answer, then the gallop moved to G and to A.",
          howTo: [
            "Bars 1 and 2 are on the open low E string, with answers on frets 3, 5 and 6. Bar 3 gallops on fret 3, muted, and bar 4 on the open A string.",
            "Listen to the kick drum. Your long notes land with it.",
          ],
          coach: "Band on. I time your notes against it and check them after the take. Direct input or headphones make that fair.",
          ...FREE,
          tab: BAND_RIFF,
          position: 3,
          shifts: true,
          chords: "E5 | E5 | G5 | A5",
          jam: { groove: "hardRock", key: "E minor" },
          harmony: { scaleOverChords: ["E", "naturalMinor"], allowed: ["Bb"] },
          rungs: ladder(60, 140, 10),
          passAt: 100,
          grade: "timingNotes",
          pass: [...FAST, { metric: "noteIdentity", min: 0.85, overBars: 4 }],
          minutes: 7,
        },
        {
          id: "down-minute",
          title: "A minute of downstrokes",
          purpose: "Muted eighths on one low string, every one a downstroke, for sixty seconds. The classic thrash endurance test, at a tempo you choose.",
          howTo: [
            "Eighth notes, all down, with frets 3 and 5 at the end of each bar to mark it.",
            "When it starts to burn, make the stroke smaller before you slow down. If it still burns, stop.",
          ],
          coach: "I check that the time holds to the end of the minute. Whether every stroke was down is yours to say.",
          ...FREE,
          vary: onLowStrings(DOWN_MINUTE, 3),
          tab: DOWN_MINUTE,
          position: 3,
          holdSeconds: 60,
          rungs: ladder(80, 200, 10),
          passAt: 120,
          grade: "stamina",
          selfCheck: [DOWN_CHECK],
          minutes: 4,
        },
        {
          id: "gallop-minute",
          title: "A minute of gallops",
          purpose: "The gallop on one low string for sixty seconds, with a fretted gallop at the end of each bar.",
          howTo: [
            "Down, down-up, without a break. The two short notes are the first thing to blur when the arm tires.",
            "Breathe, and drop the shoulder at a bar line if it has crept up.",
          ],
          coach: "I check that the time holds to the end of the minute and that the short notes are still there.",
          ...FREE,
          vary: onLowStrings(GALLOP_MINUTE, 3),
          tab: GALLOP_MINUTE,
          position: 3,
          holdSeconds: 60,
          rungs: ladder(60, 150, 10),
          passAt: 85,
          grade: "stamina",
          minutes: 4,
        },
      ],
    },
    VERSE_AND_CHORUS,
  ],
  levels: [
    {
      id: "beginner",
      title: "Beginner: the chug",
      summary: "Palm-muted downstrokes, two-note power chords, the two together in a riff, and the same chug and chords with their roots on the A string.",
      reachLevel: "early-intermediate",
      startHereIf: [
        "You can play eighth notes with a click at 80 BPM.",
        "You've never practised palm muting, or your muted notes come out uneven.",
        "You can't yet change between two power chords in time.",
      ],
      steps: ["the-chug", "power-chords", "chug-and-chord", "a-string-chug"],
      warmups: [
        {
          id: "root-chug",
          title: "A chug on the root",
          purpose: "Muted eighths on one string: the root and its minor third, then the fourth and fifth a hand higher. A different key and string each time.",
          howTo: ["Start well under your clean tempo. All downstrokes, palm-muted. The hand moves up five frets at the bar line and back."],
          coach: "This is a warm-up. It tells you how it went, and it decides nothing.",
          ...FREE,
          vary: {
            values: WARMUP_VALUES,
            pooled: ["key", "stringSet"],
            label: warmLabel,
            build: (p) => rootRiff(p, "/8", (note) => `${note} ${note}`),
          },
          grade: "warmup",
          warmup: { start: 0.6, top: 0.8, reference: "the-chug.chug-and-note", fallback: 70 },
          rungs: ladder(60, 130, 10),
          minutes: 3,
        },
      ],
    },
    {
      id: "intermediate",
      title: "Intermediate: the gallop",
      summary: "The gallop, the reverse gallop, continuous alternate-picked sixteenths with accents, and both gallops under chords that change every bar and then every two beats, ending with a band.",
      reachLevel: "early-intermediate",
      startHereIf: [
        "You can play palm-muted eighths in downstrokes at 100 BPM, even and all the same weight.",
        "You can change between E, G and A power chords in eighth notes, and play the same shape with its root on the A string without the low E string ringing.",
        "Your gallops smear, or you can't switch between a gallop and straight sixteenths.",
      ],
      steps: ["gallop", "reverse-gallop", "sixteenth-chug", "gallop-changes"],
      warmups: [
        {
          id: "root-gallop",
          title: "A gallop on the root",
          purpose: "The gallop on one string: the root and its minor third, then the fourth and fifth a hand higher. A different key and string each time.",
          howTo: ["Start well under your clean tempo. Down, down-up, palm-muted. The hand moves up five frets at the bar line and back."],
          coach: "This is a warm-up. It tells you how it went, and it decides nothing.",
          ...FREE,
          vary: {
            values: WARMUP_VALUES,
            pooled: ["key", "stringSet"],
            label: warmLabel,
            build: (p) => rootRiff(p, "", (note) => gallop(note)),
          },
          grade: "warmup",
          warmup: { start: 0.6, top: 0.8, reference: "gallop.gallop-one", fallback: 60 },
          rungs: ladder(50, 90, 10),
          minutes: 3,
        },
        {
          id: "root-reverse",
          title: "A reverse gallop on the root",
          purpose: "The reverse gallop on one string: the root and its minor third, then the fourth and fifth a hand higher. A different key and string each time.",
          howTo: ["Start well under your clean tempo. Down-up, down, palm-muted, the first short note on the click. The hand moves up five frets at the bar line and back."],
          coach: "This is a warm-up. It tells you how it went, and it decides nothing.",
          ...FREE,
          vary: {
            values: WARMUP_VALUES,
            pooled: ["key", "stringSet"],
            label: warmLabel,
            build: (p) => rootRiff(p, "", (note) => reverse(note)),
          },
          grade: "warmup",
          warmup: { start: 0.6, top: 0.8, reference: "reverse-gallop.reverse-one", fallback: 60 },
          rungs: ladder(50, 90, 10),
          minutes: 3,
        },
      ],
    },
    {
      id: "advanced",
      title: "Advanced: speed and stamina",
      summary: "Stop-start riffs with silent sixteenths, triplet chugs, sextuplet bursts and tremolo picking, pedal-tone riffs across strings, first over the open low E string and then over the open A string, an eight-bar riff in two parts, a riff over a band and a full minute, then a verse and a chorus as a sixteen-bar form with the band.",
      reachLevel: "intermediate",
      startHereIf: [
        "You can play the gallop and the reverse gallop evenly at 100 BPM.",
        "You can alternate-pick muted sixteenths at 95 BPM with an accent on each beat.",
        "You can keep a gallop even through a power chord change every bar at 100 BPM.",
        "Your riffs fall apart when they leave the low string, or your picking arm tires before a song is over.",
      ],
      steps: ["stop-start", "triplets-and-bursts", "pedal-riffs", "pedal-from-a", "two-part-riff", "riffs-at-length", "verse-and-chorus"],
      warmups: [
        {
          id: "root-sixteenths",
          title: "Sixteenths on the root",
          purpose: "Muted sixteenths, alternate picked, a beat or two on each note: the root and its minor third, then the fourth and fifth a hand higher. A different key and string each time.",
          howTo: ["Start well under your clean tempo. Strict down-up, palm-muted. The hand moves up five frets at the bar line and back."],
          coach: "This is a warm-up. It tells you how it went, and it decides nothing.",
          vary: {
            values: WARMUP_VALUES,
            pooled: ["key", "stringSet"],
            label: warmLabel,
            build: (p) => rootRiff(p, "/16", (note) => repeat(note, 4)),
          },
          grade: "warmup",
          warmup: { start: 0.6, top: 0.8, reference: "sixteenth-chug.sixteenth-riff", fallback: 60 },
          rungs: ladder(50, 110, 10),
          minutes: 3,
        },
        {
          id: "root-triplets",
          title: "Triplets on the root",
          purpose: "Three muted notes to a beat, alternate picked: the root and its minor third, then the fourth and fifth a hand higher. A different key and string each time.",
          howTo: ["Start well under your clean tempo. Strict down-up, so every other beat starts on an upstroke; lean on the first note of each beat. The hand moves up five frets at the bar line and back."],
          coach: "This is a warm-up. It tells you how it went, and it decides nothing.",
          vary: {
            values: WARMUP_VALUES,
            pooled: ["key", "stringSet"],
            label: warmLabel,
            build: (p) => rootRiff(p, "/8t", (note) => repeat(note, 3)),
          },
          grade: "warmup",
          warmup: { start: 0.6, top: 0.8, reference: "triplets-and-bursts.triplet-chug", fallback: 70 },
          rungs: ladder(60, 120, 10),
          minutes: 3,
        },
      ],
    },
  ],
}), METAL_RHYTHM_CUES);
