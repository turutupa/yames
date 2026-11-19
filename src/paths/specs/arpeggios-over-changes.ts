/**
 * Arpeggios over Changes, a Theory Path. A draft: no teacher or guitarist has reviewed it.
 *
 * The third new Path on the harmony route (`plans/paths/NEW_PATHS.md`, "The
 * curriculum map"). Triads made a chord into shapes; Chords in a Key said which
 * chords go together. This one turns a chord into a line: its notes one after
 * another, from the root, and then from whichever of its notes is nearest. It
 * teaches which notes, slowly. Speed is Sweep Picking's subject, and the last
 * Level here hands the player over to it.
 */
import { definePath } from "../spec";
import type { ExerciseSpec, VariantParams } from "../spec";
import { handAt, ladder, moveChart, shiftFrets } from "../templates";
import { ROCK, named, tokens, top } from "./triadShapes";
import type { Shape } from "./triadShapes";

const YOUR_TURN = { grade: "selfChecked", example: true } as const;
const NOT_CHECKED_YET =
  "Your turn, and not checked yet: the app can't judge notes you choose, so you tick it off yourself.";
const VARIANT_NOTE =
  "The frets and chord names here are for the first version. On other days the same line comes in another key, higher or lower on the neck.";

const TWELVE_EIGHT = (key: string) => ({ groove: "rockTwelveEight", key });

/** `moveChart` has one spelling per root; a chart reads better in its key's own accidentals. */
const SHARP_KEYS = ["D", "E", "B"];
const FLAT_KEYS = ["Db", "Eb", "Bb", "F"];
function chartIn(chart: string, by: number, key: string): string {
  const moved = moveChart(chart, by);
  if (SHARP_KEYS.includes(key)) return moved.replace(/Ab/g, "G#").replace(/Eb/g, "D#").replace(/Gb/g, "F#").replace(/Db/g, "C#");
  if (FLAT_KEYS.includes(key)) return moved.replace(/C#/g, "Db").replace(/F#/g, "Gb").replace(/G#/g, "Ab").replace(/D#/g, "Eb");
  return moved;
}

// ---------------------------------------------------------------------------
// One octave from a root on the D string: root, third, fifth, root, one note a
// string. Major is frets x, x-1, x-2, x-2; minor is x, x-2, x-2, x-2.
// ---------------------------------------------------------------------------

type Four = readonly [string, string, string, string];
const maj = (x: number): Four => [`4:${x}f3`, `3:${x - 1}f2`, `2:${x - 2}f1`, `1:${x - 2}f1`];
const min = (x: number): Four => [`4:${x}f3`, `3:${x - 2}f1`, `2:${x - 2}f1`, `1:${x - 2}f1`];
// With the seventh on top in place of the high root.
const maj7 = (x: number): Four => [`4:${x}f4`, `3:${x - 1}f3`, `2:${x - 2}f2`, `1:${x - 3}f1`];
const min7 = (x: number): Four => [`4:${x}f4`, `3:${x - 2}f2`, `2:${x - 2}f3`, `1:${x - 4}f1`];
const dom7 = (x: number): Four => [`4:${x}f4`, `3:${x - 1}f3`, `2:${x - 2}f2`, `1:${x - 4}f1`];

const up = (a: Four) => `/4 ${a.join(" ")}`;
const down = (a: Four) => `/4 ${[...a].reverse().join(" ")}`;
const upDown = (a: Four) => `/8 ${a[0]} ${a[1]} ${a[2]} ${a[3]} ${a[2]} ${a[1]} ${a[0]} ${a[1]}`;

const C = maj(10);
const AM = min(7);
const F = maj(3);
const G = maj(5);
const CMAJ7 = maj7(10);
const AM7 = min7(7);
const DM7 = min7(12);
const G7 = dom7(5);

const FOUR_CHORDS = [C, AM, F, G].map(upDown).join(" | ");
const JOINED = `/4 4:10 3:9 2:8 1:8 | 1:8 1:5 2:5 3:5 | 3:5 2:6 1:5 1:8 | 1:7 2:8 3:7 3:4`;
const TWO_FIVE_ONE = `/8 4:12 3:10 2:10 1:8 1:10 1:8 2:10 3:10 | 3:7 2:6 2:8 1:7 1:10 1:7 2:8 2:6 | 2:5 2:8 1:7 1:8 1:7 2:8 2:5 3:4 | /1 3:5`;
const SEVENTHS_JOINED = `/8 4:10 3:9 2:8 1:7 1:8 1:7 2:8 3:9 | 3:9 2:8 2:10 1:8 1:12 1:8 2:10 2:8 | 2:10 1:8 1:10 1:8 2:10 3:10 2:10 2:6 | 2:8 1:7 1:10 1:7 2:8 2:6 3:7 3:4`;
const SEVENTHS_CHART = "Cmaj7 | Am7 | Dm7 | G7";
const AM_TWO = `/8 6:5f1 6:8f4 5:7f3 4:7f3 3:5f1 2:5f1 1:5f1 2:5f1 | 3:5f1 4:7f3 5:7f3 6:8f4 /2 6:5f1`;
const C_TWO = `/8 6:8f2 5:7f1 5:10f4 4:10f4 3:9f2 2:8f1 1:8f1 2:8f1 | 3:9f2 4:10f4 5:10f4 5:7f1 /2 6:8f2`;
const TWELVE_CHART = "C | C | C | C | F | F | C | C | G | F | C | G";
const TWELVE = [C, C, C, C, F, F, C, C, G, F, C, G].map(upDown).join(" | ");

// Sweeps: a three-string triad shape, up in one push and back in one pull,
// with the turning note played twice. Triplets.
const sweepBar = (shape: Shape) => {
  const [l, m, h] = tokens(shape);
  return `/8t ${l} ${m} ${h} ${h} ${m} ${l} ${l} ${m} ${h} ${h} ${m} ${l}`;
};
/** A last bar that stops on the top note, so a loop does not start on the note it ended on. */
const sweepEnd = (shape: Shape) => {
  const [l, m, h] = tokens(shape);
  return `/8t ${l} ${m} ${h} ${h} ${m} ${l} ${l} ${m} ${h} /4 ${h}`;
};
const sweeps = (...shapes: Shape[]) => shapes.map(sweepBar).join(" | ");
const C_LOW = top(5, 5, 3);
const C_MID = top(9, 8, 8);
const AM_LOW = top(5, 5, 5);
const AM_MID = top(9, 10, 8);
const F_LOW = top(5, 6, 5);
const F_MID = top(10, 10, 8);
const G_LOW = top(4, 3, 3);
const G_MID = top(7, 8, 7);
const SWEEP_FOUR = sweeps(C_MID, AM_MID, F_MID, G_MID);
const SWEEP_SONG = sweeps(C_LOW, G_LOW, AM_LOW, F_LOW, C_MID, G_MID, AM_MID, F_MID);
const SONG_CHART = "C | G | Am | F | C | G | Am | F";

const ROLL_CHECK = "Did each note stop as the next one started, with no two strings ringing together?";
/** Sweeps are timed and counted, never pitch-checked: the strings ring into each other. */
const SWEPT = {
  pick: "sweep",
  grade: "sweepTiming",
  pass: [
    { metric: "notesHeard", min: 0.9, overBars: 4 },
    { metric: "timingEvenness", min: 0.75, overBars: 4 },
    { metric: "extraNotes", max: 4, overBars: 4 },
  ],
  selfCheck: [ROLL_CHECK],
} as const satisfies Partial<ExerciseSpec>;

/** A line in C moved along the neck to other keys; the chart and the band move with it. */
function inKeys(tab: string, chart: string, shifts: Readonly<Record<string, number>>, jam: (key: string) => { groove: string; key: string } = ROCK) {
  return {
    values: { key: Object.keys(shifts) },
    pooled: ["key"] as const,
    label: (p: VariantParams) => `In ${p.key}`,
    build: (p: VariantParams) => {
      const moved = shiftFrets(tab, shifts[p.key]);
      return {
        tab: moved,
        position: handAt(moved),
        shifts: true,
        chords: chartIn(chart, shifts[p.key], p.key),
        jam: jam(p.key),
        harmony: { chordTones: true as const },
      };
    },
  };
}

export default definePath({
  id: "arpeggios-over-changes",
  title: "Arpeggios over Changes",
  kind: "theory",
  category: "harmony",
  goal: "Play the notes of each chord of a progression as a line, in time, moving to the nearest note of the next chord, and take the first steps into sweeping them.",
  level: "early-intermediate",
  assumes:
    "You can play major and minor triads in three shapes and the four-string shapes from the last Level of Triads, and you know the chords of a key by number: the first Level of Chords in a Key. The twelve-bar form and two, five, one are spelled out where they are used. Eighth notes with a click at 80 BPM. No sweep picking is assumed. The minutes listed are one pass through the material; arpeggios are something players practise for years.",
  prerequisites: {
    paths: [
      { path: "triads", level: "advanced" },
      { path: "chords-in-a-key", level: "beginner" },
    ],
    skills: ["Triads in three shapes on the top strings", "Eighth notes with a click at 80 BPM"],
  },
  labelSubdivisions: "mostly",
  paceLadders: true,
  orderRationale:
    "One chord as a line first, from its root, on one note a string, because that is the smallest change from a triad shape: the same fingers, played in order and let go. Then the same shape on each chord of a progression, starting every bar on the root, since the root is the easiest place to know you are right. Starting from the nearest note comes next and is the real skill: it is what makes arpeggios sound like a melody and not an exercise. Sevenths arrive only then, as one changed note on top of a shape already known. Two octaves follow, then a whole form. Sweeping is last and short on purpose: by then the notes are familiar, so the only new thing is the picking hand, and the Path that teaches it properly is Sweep Picking.",
  gradingLimits:
    "After the take the app checks the single-note lines for right notes, counts them and times them. The note check only works when notes are separate: lift each finger as the next lands, or it reads 'not checked'. The app cannot tell which string a pitch came from. The sweeps in the last Level are timed and counted and never pitch-checked, because swept strings ring together and a correct take could read as wrong; whether each note was clean is for your ear, and the Exercise asks you. The band Exercises have only been tried on computer-made guitar sound, so direct input or headphones are the honest way to play them. Choosing your own notes is 'your turn', self-checked and labelled 'not checked yet'.",
  steps: [
    {
      id: "one-octave",
      title: "A chord as a line",
      goal: "Play C major and A minor as arpeggios: root, third, fifth and the root above, one note on each of four strings, up and back.",
      why: "An arpeggio is a chord played one note at a time, in order. You have been doing something close to it since Triads, rolling shapes. The difference, in this Path, is in the fretting hand: in a rolled chord the fingers stay down and the notes ring together, and here each finger lets go as the next note sounds, so it comes out as a line you could sing. Lines are what solos and melodies are made of, and a line made of a chord's own notes always fits that chord.",
      howTo: [
        "The shape starts from the root on the D string and takes one note on each string up to the top: root, third, fifth, root.",
        "C major: D string 10, G string 9, B string 8, top string 8. A minor: D string 7, then fret 5 on the G, B and top strings.",
        "Where two notes share a fret, lay the first finger flat and roll it from one string to the next so the first note stops as the second starts.",
      ],
      payoff: "C and A minor as lines, one octave each, with every note separate.",
      exercises: [
        {
          id: "c-major",
          title: "C major, one octave",
          purpose: "Root, third, fifth, root: C, E, G and the C above, one note a string, then back down to the low C.",
          howTo: [
            "Quarter notes, 60 BPM up to a pass at 90.",
            "Up: D string 10 (third finger), G string 9 (second), B string 8 and top string 8 (first finger, rolled). Down: B string 8, G string 9, and the D string held for two beats.",
            "Let each note go as you play the next. If two notes ring together it is a chord again.",
          ],
          coach: "Right notes and steady quarters after the take. Notes that ring into each other can read as not checked.",
          tab: `${up(C)} | /4 ${C[2]} ${C[1]} /2 ${C[0]}`,
          position: 8,
          harmony: { arpeggio: "C", cover: true },
          rungs: ladder(60, 120, 10),
          passAt: 90,
          ...named(),
          minutes: 5,
        },
        {
          id: "a-minor",
          title: "A minor, one octave",
          purpose: "The same idea with a minor chord: A, C, E and the A above. The third is one fret lower than it would be in a major shape, and that puts three notes on one fret.",
          howTo: [
            "Quarter notes, 60 BPM up to a pass at 90.",
            "Up: D string 7 (third finger), then fret 5 on the G, B and top strings, all with the first finger rolled across. Down: B string 5, G string 5, and the D string held for two beats.",
          ],
          coach: "Right notes and steady quarters after the take. The roll across fret 5 is the thing to get clean.",
          tab: `${up(AM)} | /4 ${AM[2]} ${AM[1]} /2 ${AM[0]}`,
          position: 5,
          harmony: { arpeggio: "Am", cover: true },
          rungs: ladder(60, 120, 10),
          passAt: 90,
          ...named(),
          minutes: 5,
        },
        {
          id: "major-and-minor",
          title: "C and A minor, in eighths",
          purpose: "Both arpeggios over a band, a bar each, up to the top and back. The hand moves three frets between them.",
          howTo: [
            "Straight eighths, 60 BPM up to a pass at 80. One bar on each chord: C, A minor, C, A minor.",
            "Each bar goes up the four strings, back down to the root on the D string, and adds one more note on the G string. C starts at fret 10 on the D string, A minor at fret 7.",
          ],
          coach: "Band on. Right notes and time after the take.",
          tab: [C, AM, C, AM].map(upDown).join(" | "),
          position: 5,
          shifts: true,
          chords: "C | Am | C | Am",
          jam: ROCK("C"),
          harmony: { chordTones: true },
          rungs: ladder(60, 110, 10),
          passAt: 80,
          ...named(),
          minutes: 6,
        },
      ],
    },
    {
      id: "four-chords",
      title: "An arpeggio for every chord",
      goal: "Find the root of C, A minor, F and G on the D string and play each chord's arpeggio from it, over a band.",
      why: "To play arpeggios over a song you need to know, at every bar line, where the next chord's root is. On one string that is easy to see: C at fret 10, A at fret 7, F at fret 3, G at fret 5. Starting every bar on the root is not how the best lines go, but it is how you make sure you always know which chord you are on, and it is where everyone starts.",
      howTo: [
        "Roots on the D string: C is fret 10, A is fret 7, F is fret 3, G is fret 5.",
        "Major chords (C, F, G) use the shape that goes down a fret on each of the next two strings and then stays: 10, 9, 8, 8. The minor chord (A minor) uses 7, 5, 5, 5.",
        "Let the last note of each bar be short and move the hand in that gap, so the next bar starts on the click.",
      ],
      payoff: "One, six, four, five as four arpeggios, each starting on its root.",
      exercises: [
        {
          id: "roots",
          title: "The four roots on the D string",
          purpose: "Only the roots, two to a bar, so you know where the hand has to be before the notes above arrive.",
          howTo: [
            "Half notes, 60 BPM up to a pass at 90. D string, third finger: fret 10, fret 7, fret 3, fret 5.",
            "Say the chord's name as you land on it: C, A minor, F, G.",
          ],
          coach: "Band on. Eight notes, each the right root, each on time.",
          tab: `/2 4:10f3 4:10f3 | 4:7f3 4:7f3 | 4:3f3 4:3f3 | 4:5f3 4:5f3`,
          position: 8,
          shifts: true,
          chords: "C | Am | F | G",
          jam: ROCK("C"),
          harmony: { chordTones: true, cover: false },
          rungs: ladder(60, 120, 10),
          passAt: 90,
          ...named(),
          minutes: 4,
        },
        {
          id: "up-and-down",
          title: "Up one chord, down the next",
          purpose: "Quarter notes: C going up, A minor coming down, F going up, G coming down. Each bar starts on the string where the last one ended; only the hand moves along it.",
          howTo: [
            "Quarter notes, 60 BPM up to a pass at 90.",
            "C up: D string 10, G string 9, B string 8, top string 8. A minor down: fret 5 on the top, B and G strings, then D string 7. F up: 3, 2, 1, 1. G down: top string 3, B string 3, G string 4, D string 5.",
          ],
          coach: "Band on. Right notes and time after the take.",
          tab: `${up(C)} | ${down(AM)} | ${up(F)} | ${down(G)}`,
          position: 8,
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
          id: "four-arpeggios",
          title: "Four chords in eighths",
          purpose: "Each chord up to the top string and back, one bar each, with the band. The same line four times in four places.",
          howTo: [
            "Straight eighths, 60 BPM up to a pass at 80. One bar on each chord.",
            "C from fret 10 on the D string, A minor from fret 7, F from fret 3, G from fret 5. Each bar ends with one extra note on the G string: use it to look at where the next root is.",
          ],
          coach: "Band on. Right notes and time after the take.",
          tab: FOUR_CHORDS,
          position: 8,
          shifts: true,
          chords: "C | Am | F | G",
          jam: ROCK("C"),
          harmony: { chordTones: true },
          rungs: ladder(60, 110, 10),
          passAt: 80,
          ...named(),
          minutes: 6,
        },
      ],
    },
    {
      id: "nearest-note",
      title: "Start from the nearest note",
      goal: "Play through C, A minor, F and G without going back to the root each time: begin each chord on whichever of its notes is closest to where you are.",
      why: "Jumping to the root at every bar line makes four separate exercises. Real lines do not jump: when the chord changes, they move to the closest note of the new chord, often the very note they were on. C is a note of C major, of A minor and of F, so a line can sit on it through three chords. This is the same idea as choosing the nearest triad shape, applied to one note at a time, and it is the main thing this Path is for.",
      howTo: [
        "Before each change, ask which notes the two chords share. C and A minor share C and E. A minor and F share A and C. F and G share none, so there you move by one fret.",
        "The line here stays between frets 4 and 10 on the top four strings, and inside the four bars it never jumps more than a string.",
        "The last note, B on the G string, is a half step below the C the line starts on, so the ear is led back to the start. The hand has to move from fret 4 up to fret 10 to get there: the only shift in the line.",
      ],
      payoff: "Four chords played as one line, with no jump from one chord to the next.",
      difficultyException:
        "Quarter notes after the eighths of the Step before, and a self-checked Exercise at the end. The new demand is choosing where each chord starts, which the metric cannot count.",
      exercises: [
        {
          id: "shared-note",
          title: "C into A minor on a shared note",
          purpose: "C major up to its top C, then A minor coming down from that same C. The note does not change when the chord does.",
          howTo: [
            "Quarter notes, 60 BPM up to a pass at 90. Two bars that loop.",
            "Bar 1, C: D string 10, G string 9, B string 8, top string 8. Bar 2, A minor: top string 8, top string 5, B string 5, G string 5: C, A, E, C.",
            "The C at the top is played twice, once as the root of C and once as the third of A minor.",
          ],
          coach: "Band on. Right notes and time after the take.",
          tab: `/4 4:10 3:9 2:8 1:8 | 1:8 1:5 2:5 3:5`,
          position: 8,
          shifts: true,
          chords: "C | Am",
          jam: ROCK("C"),
          harmony: { chordTones: true },
          rungs: ladder(60, 120, 10),
          passAt: 90,
          ...named(),
          minutes: 5,
        },
        {
          id: "joined",
          title: "Four chords, one line",
          purpose: "C up, A minor down, F up, G down, each starting on the nearest note of its chord. Four bars with no jump inside them.",
          howTo: [
            "Quarter notes, 60 BPM up to a pass at 90.",
            "Bar 1, C: D string 10, G string 9, B string 8, top string 8. Bar 2, A minor: top string 8 and 5, B string 5, G string 5.",
            "Bar 3, F: G string 5, B string 6, top string 5 and 8: C, F, A, C. Bar 4, G: top string 7, B string 8, G string 7 and 4: B, G, D, B.",
          ],
          coach: "Band on. Right notes and time after the take.",
          tab: JOINED,
          position: 8,
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
          id: "your-line",
          title: "Your turn: no jumps",
          purpose: "C, A minor, F and G with chord notes of your own choosing, one rule: at each change, move to a note of the new chord that is no more than two frets or one string away.",
          howTo: [
            "Quarter notes or any rhythm you like, 60 to 90 BPM, four bars that loop.",
            "Use only the three notes of each chord. C: C, E, G. A minor: A, C, E. F: F, A, C. G: G, B, D. The written line is one answer.",
            NOT_CHECKED_YET,
          ],
          coach: "Not checked yet. Record it and listen for any place where the line leaps.",
          tab: JOINED,
          position: 8,
          shifts: true,
          chords: "C | Am | F | G",
          jam: ROCK("C"),
          rungs: ladder(60, 90, 10),
          ...YOUR_TURN,
          selfCheck: [
            "Was every note one of the three notes of the chord the band was on?",
            "Did you get through every change without a jump?",
          ],
          minutes: 4,
        },
      ],
    },
    {
      id: "sevenths",
      title: "Add the seventh",
      goal: "Play C major seven, A minor seven, D minor seven and G seven as four-note arpeggios, and a line through D minor seven, G seven and C major seven: two, five, one, the second, fifth and first chords of the key.",
      why: "A seventh chord is a triad with one more note, the seventh note counted from its root. In the shape you know, the top note was the root again. Lower it and you get the seventh instead: one fret down for a major seven, two frets down for a minor seven or a plain seven. Four notes give a line more to say, and they are the sound of jazz, soul and a great deal of pop.",
      howTo: [
        "C major seven is C, E, G, B: D string 10, G string 9, B string 8, top string 7.",
        "A minor seven is A, C, E, G: D string 7, G string 5, B string 5, top string 3. D minor seven is the same shape from fret 12.",
        "G seven is G, B, D, F: D string 5, G string 4, B string 3, top string 1. It is the fifth chord of the key: its F wants to fall to E and its B to rise to C, which is what pulls it home.",
        "The minor seven and plain seven shapes reach five frets. Fourth finger on the D string, first finger on the top string, and let the hand lean toward the first finger: do not hold all four notes down.",
      ],
      payoff: "Four seventh chords as lines, and a two, five, one, the progression jazz players practise most.",
      exercises: [
        {
          id: "major-seven-minor-seven",
          title: "C major seven and A minor seven",
          purpose: "The two arpeggios you know with their top note lowered: B on top of C major, G on top of A minor.",
          howTo: [
            "Straight eighths, 60 BPM up to a pass at 80. One bar each: C major seven, A minor seven, and again.",
            "C major seven: D string 10, G string 9, B string 8, top string 7, one finger per fret from the fourth down to the first. A minor seven: D string 7 with the fourth finger, G string 5 with the second, B string 5 with the third, top string 3 with the first.",
          ],
          coach: "Band on. Right notes and time after the take.",
          tab: [CMAJ7, AM7, CMAJ7, AM7].map(upDown).join(" | "),
          position: 7,
          shifts: true,
          chords: "Cmaj7 | Am7 | Cmaj7 | Am7",
          jam: ROCK("C"),
          harmony: { chordTones: true },
          rungs: ladder(60, 110, 10),
          passAt: 80,
          ...named(),
          minutes: 6,
        },
        {
          id: "sevenths-in-the-key",
          title: "One, six, two, five in sevenths",
          purpose: "C major seven, A minor seven, D minor seven and G seven, each going up from its root on the D string.",
          howTo: [
            "Quarter notes, 60 BPM up to a pass at 90. One bar on each chord.",
            "C major seven: 10, 9, 8, 7. A minor seven: 7, 5, 5, 3. D minor seven: 12, 10, 10, 8. G seven: 5, 4, 3, 1. The D string's fret is given first each time.",
          ],
          coach: "Band on. Right notes and time after the take.",
          tab: [CMAJ7, AM7, DM7, G7].map(up).join(" | "),
          position: 7,
          shifts: true,
          chords: SEVENTHS_CHART,
          jam: ROCK("C"),
          harmony: { chordTones: true },
          rungs: ladder(60, 120, 10),
          passAt: 90,
          ...named(),
          minutes: 6,
        },
        {
          id: "two-five-one",
          title: "A two, five, one line",
          purpose: "D minor seven, G seven and two bars of C major seven as one line in eighths, each chord picked up from a note close to where the last one ended.",
          howTo: [
            "Straight eighths, 60 BPM up to a pass at 80. The last bar is one long C.",
            "Bar 1, D minor seven: D string 12, G string 10, B string 10, top string 8, then top string 10 and 8, B string 10, G string 10.",
            "Bar 2, G seven: G string 7, B string 6 and 8, top string 7 and 10, then back: top string 7, B string 8 and 6. Bar 3, C major seven, starts on E, one fret below the F you just played: B string 5 and 8, top string 7 and 8, then top string 7, B string 8 and 5, G string 4. Bar 4: C on the G string, fret 5, held.",
          ],
          coach: "Band on. Right notes and time after the take.",
          tab: TWO_FIVE_ONE,
          position: 5,
          shifts: true,
          chords: "Dm7 | G7 | Cmaj7 | Cmaj7",
          jam: ROCK("C"),
          harmony: { chordTones: true },
          rungs: ladder(60, 110, 10),
          passAt: 80,
          ...named(),
          minutes: 7,
        },
      ],
    },
    {
      id: "two-octaves",
      title: "Two octaves",
      goal: "Play A minor and C major arpeggios across all six strings, two octaves each.",
      why: "One octave fits under the hand; two octaves cross all six strings, and that is the size of arpeggio many solos use. Nothing new is needed to build one: it is root, third, fifth, and then the same three again an octave higher. These two shapes, one minor and one major, both starting from the low E string, are what one family of big sweep shapes is built on.",
      howTo: [
        "A minor from fret 5 on the low E string: A and C on the low E (frets 5 and 8), E on the A string (7), A on the D string (7), then fret 5 on the G, B and top strings.",
        "C major from fret 8 on the low E string: C (8), then E and G on the A string (7 and 10), C on the D string (10), E on the G string (9), G on the B string (8), C on the top string (8).",
        "The top half of each is the one-octave shape you already know.",
        "Fingers. A minor: first and fourth on the low E string, third on the A string and rolled onto the D string, first finger rolled across fret 5. C major: second on the low E, first and fourth on the A string, fourth rolled onto the D string, second on the G string, first across the B and top strings.",
      ],
      payoff: "Two arpeggios that cover six strings.",
      difficultyException:
        "Two of the three Exercises have no band and no chord changes, both of which the metric counts on a Theory Path. The demand is six strings and a shape twice as long.",
      exercises: [
        {
          id: "a-minor-two",
          title: "A minor, two octaves",
          purpose: "A, C, E twice over, from the low E string to the top string, and back down to the low A.",
          howTo: [
            "Straight eighths, 50 BPM up to a pass at 80. Two bars.",
            "Up: low E string 5 and 8, A string 7, D string 7, then fret 5 on the G, B and top strings. Down: B string 5, G string 5, D string 7, A string 7, low E string 8, and fret 5 held.",
          ],
          coach: "Right notes and even eighths after the take.",
          tab: AM_TWO,
          position: 5,
          harmony: { arpeggio: "Am", cover: true },
          rungs: ladder(50, 110, 10),
          passAt: 80,
          ...named(),
          minutes: 6,
        },
        {
          id: "c-major-two",
          title: "C major, two octaves",
          purpose: "C, E, G twice over from fret 8 on the low E string, and back down.",
          howTo: [
            "Straight eighths, 50 BPM up to a pass at 80. Two bars.",
            "Up: low E string 8, A string 7 and 10, D string 10, G string 9, B string 8, top string 8. Down: B string 8, G string 9, D string 10, A string 10 and 7, and the low C held.",
          ],
          coach: "Right notes and even eighths after the take.",
          tab: C_TWO,
          position: 7,
          harmony: { arpeggio: "C", cover: true },
          rungs: ladder(50, 110, 10),
          passAt: 80,
          ...named(),
          minutes: 6,
        },
        {
          id: "both-with-the-band",
          title: "C and A minor across the neck",
          purpose: "Two bars of C major and two of A minor, each a full two-octave arpeggio up and back, with the band.",
          howTo: [
            "Straight eighths, 50 BPM up to a pass at 80.",
            "Bars 1 and 2 are the C major arpeggio from fret 8 on the low E string. Bars 3 and 4 are A minor from fret 5.",
          ],
          coach: "Band on. Right notes and time after the take.",
          tab: `${C_TWO} | ${AM_TWO}`,
          position: 5,
          shifts: true,
          chords: "C | C | Am | Am",
          jam: ROCK("C"),
          harmony: { chordTones: true },
          rungs: ladder(50, 110, 10),
          passAt: 80,
          ...named(),
          minutes: 6,
        },
      ],
    },
    {
      id: "a-whole-form",
      title: "Arpeggios through a whole form",
      goal: "Play arpeggios through all twelve bars of a blues in C, move the four-chord line to other keys, and improvise with chord notes only.",
      why: "Four bars can be memorised as finger movements. Twelve cannot: you have to know which chord is coming. This is the Step where the arpeggio stops being a pattern and becomes a way of following a song, and the twelve-bar blues form, which Chords in a Key teaches in its last Level and which is spelled out below, is the best place to practise that.",
      howTo: [
        "The form: four bars of C, two of F, two of C, then G, F, C, G.",
        "The jumps between C at fret 10 and F at fret 3 are on purpose here: every bar starts from its root so the form is easy to follow. Joining them up is your-turn work at the end of the Step.",
        "Roots on the D string: C at fret 10, F at fret 3, G at fret 5.",
        "In a new key the roots move and the two shapes do not.",
      ],
      payoff: "A twelve-bar chorus made only of chord notes, in time, without getting lost.",
      exercises: [
        {
          id: "twelve-bars",
          title: "Twelve bars of arpeggios",
          purpose: "One arpeggio a bar, up and back, through the twelve-bar form in C.",
          howTo: [
            "Straight eighths, 60 BPM up to a pass at 80.",
            "C from fret 10 on the D string, F from fret 3, G from fret 5. Follow the form: C, C, C, C, F, F, C, C, G, F, C, G.",
          ],
          coach: "Twelve bars with the band. Right notes and time after the take.",
          tab: TWELVE,
          position: 8,
          shifts: true,
          chords: TWELVE_CHART,
          jam: ROCK("C"),
          harmony: { chordTones: true },
          rungs: ladder(60, 110, 10),
          passAt: 80,
          ...named(0.75, 8),
          minutes: 6,
        },
        {
          id: "four-chords-keys",
          title: "Four arpeggios in a new key",
          purpose: "One, six, four, five as arpeggios, moved up the neck: in D the chords are D, B minor, G and A; in E flat they are E flat, C minor, A flat and B flat; in E they are E, C sharp minor, A and B.",
          howTo: [
            "Straight eighths, 60 BPM up to a pass at 80. One bar on each chord.",
            "In D the roots on the D string are fret 12, fret 9, fret 5 and fret 7: everything two frets higher than in C.",
            VARIANT_NOTE,
          ],
          coach: "A key that changes from day to day. Right notes and time after the take.",
          vary: inKeys(FOUR_CHORDS, "C | Am | F | G", { D: 2, Eb: 3, E: 4 }),
          tab: shiftFrets(FOUR_CHORDS, 2),
          position: 10,
          shifts: true,
          chords: "D | Bm | G | A",
          jam: ROCK("D"),
          harmony: { chordTones: true },
          rungs: ladder(60, 110, 10),
          passAt: 80,
          ...named(),
          minutes: 6,
        },
        {
          id: "your-chorus",
          title: "Your turn: a chorus of chord notes",
          purpose: "Twelve bars in C where every note you play belongs to the chord of its bar. Any rhythm, any order, as few notes as you like.",
          howTo: [
            "Quarter notes or any rhythm you like, 60 to 90 BPM, twelve bars that loop.",
            "Over C: C, E, G. Over F: F, A, C. Over G: G, B, D. One note held for a whole bar counts. The written line is an example.",
            NOT_CHECKED_YET,
          ],
          coach: "Not checked yet. Record it and listen for whether you can hear the chords change in your line alone.",
          tab: TWELVE,
          position: 8,
          shifts: true,
          chords: TWELVE_CHART,
          jam: ROCK("C"),
          rungs: ladder(60, 90, 10),
          ...YOUR_TURN,
          selfCheck: [
            "Did you know which chord you were on in every bar?",
            "With the band muted, could a listener hear the changes from your notes?",
          ],
          minutes: 5,
        },
      ],
    },
    {
      id: "joined-sevenths",
      title: "Sevenths, joined up",
      goal: "Play one, six, two, five in seventh chords as a single eighth-note line, move it to other keys, and then make your own.",
      why: "This is the two ideas of the Path together: four-note chords, and the nearest note at every change. A line like this is what a player means by 'playing the changes'. It is written out so you can feel how it moves, and then it is yours to vary.",
      howTo: [
        "Each bar is eight notes of one chord. The first note of each bar is the last note of the bar before, or the note next to it.",
        "The line climbs highest in bar 2, to fret 12 on the top string, and comes down through G seven to B, a half step below the C it starts again on. The hand moves back up to fret 10 for the repeat.",
        "Take it one bar at a time, then two, before you play all four.",
      ],
      payoff: "A four-bar line through four seventh chords that sounds like music and not like a drill.",
      difficultyException:
        "A new Level whose first Step ends on a self-checked Exercise. The written line is the densest in the Path so far, but one hard line and one free one put the Step's median under the twelve-bar Step before it.",
      exercises: [
        {
          id: "the-line",
          title: "One, six, two, five as one line",
          purpose: "C major seven, A minor seven, D minor seven and G seven in eighths, each bar starting on the note the last one ended on or the one beside it.",
          howTo: [
            "Straight eighths, 50 BPM up to a pass at 75.",
            "Bar 1, C major seven: D string 10, G string 9, B string 8, top string 7 and 8 and 7, B string 8, G string 9. Bar 2, A minor seven: G string 9, B string 8 and 10, top string 8 and 12 and 8, B string 10 and 8.",
            "Bar 3, D minor seven: B string 10, top string 8, 10 and 8, B string 10, G string 10, B string 10 and 6. Bar 4, G seven: B string 8, top string 7, 10 and 7, B string 8 and 6, G string 7 and 4.",
          ],
          coach: "Band on. Right notes and time after the take.",
          tab: SEVENTHS_JOINED,
          position: 7,
          shifts: true,
          chords: SEVENTHS_CHART,
          jam: ROCK("C"),
          harmony: { chordTones: true },
          rungs: ladder(50, 100, 5),
          passAt: 75,
          ...named(),
          minutes: 7,
        },
        {
          id: "the-line-keys",
          title: "The same line in a new key",
          purpose: "The four-bar line moved along the neck: two frets up for D, one fret down for B, two frets down for B flat.",
          howTo: [
            "Straight eighths, 50 BPM up to a pass at 75.",
            "In D the line starts at fret 12 on the D string, and its chords are D major seven, B minor seven, E minor seven and A seven.",
            VARIANT_NOTE,
          ],
          coach: "A key that changes from day to day. Right notes and time after the take.",
          vary: inKeys(SEVENTHS_JOINED, SEVENTHS_CHART, { D: 2, B: -1, Bb: -2 }),
          tab: shiftFrets(SEVENTHS_JOINED, 2),
          position: 9,
          shifts: true,
          chords: "Dmaj7 | Bm7 | Em7 | A7",
          jam: ROCK("D"),
          harmony: { chordTones: true },
          rungs: ladder(50, 100, 5),
          passAt: 75,
          ...named(),
          minutes: 7,
        },
        {
          id: "your-changes",
          title: "Your turn: play the changes",
          purpose: "One, six, two, five in sevenths with your own line: four notes to choose from in each bar, and the nearest-note rule at each change.",
          howTo: [
            "Straight eighths or any rhythm you like, 50 to 80 BPM, four bars that loop.",
            "C major seven: C, E, G, B. A minor seven: A, C, E, G. D minor seven: D, F, A, C. G seven: G, B, D, F. The written line is one answer.",
            NOT_CHECKED_YET,
          ],
          coach: "Not checked yet. Record it and listen for the chords in your line.",
          tab: SEVENTHS_JOINED,
          position: 7,
          shifts: true,
          chords: SEVENTHS_CHART,
          jam: ROCK("C"),
          rungs: ladder(50, 80, 10),
          ...YOUR_TURN,
          selfCheck: [
            "Did every note belong to the chord of its bar?",
            "Did you play the seventh of each chord at least once?",
          ],
          minutes: 4,
        },
      ],
    },
    {
      id: "first-sweeps",
      title: "The first sweeps",
      goal: "Play a three-string triad up with one push of the pick and back with one pull, slowly, on A minor and then on four chords.",
      why: "Sweeping is a way of picking an arpeggio: when the notes are on neighbouring strings, the pick does not go down, up, down. It falls through the strings in one slow push, like a strum in slow motion, and comes back in one pull. You know the notes already: they are the triad shapes from Triads. The only new thing is the picking hand, and the only rule is the old one from this Path, that each note lets go as the next one sounds.",
      howTo: [
        "Going up, one downward push through the G, B and top strings: the pick comes to rest against each string before it plays it. Coming back, one upward pull.",
        "The top note is played twice, at the end of the push and the start of the pull, and so is the bottom note. Those are the only places the pick changes direction.",
        "Fretting hand: press each note only while it sounds. A sweep where the fingers stay down is a strum. Where the first finger holds two strings, rock it from one to the other. The side of the picking hand rests lightly on the strings you have just left.",
        "Triplets are three even notes to a click.",
      ],
      payoff: "A triad in one motion of the pick, clean, at a slow tempo.",
      exercises: [
        {
          id: "a-minor-sweep",
          title: "A minor, one push and one pull",
          purpose: "The A minor shape around fret 9, three notes up and three notes back, in triplets. Twice a bar: four sweeps, one to a beat.",
          howTo: [
            "Triplets, 50 BPM up to a pass at 70. Two bars.",
            "G string 9, B string 10, top string 8 with one push; top string 8, B string 10, G string 9 with one pull. E, A, C and back.",
            "Go slowly enough that you could stop on any note.",
          ],
          coach: "Timed and counted. On a sweep the strings ring into each other, so the pitch is for your ear.",
          tab: sweeps(AM_MID, AM_MID),
          position: 8,
          loops: false,
          harmony: { arpeggio: "Am", cover: true },
          rungs: ladder(50, 100, 10),
          passAt: 70,
          ...SWEPT,
          minutes: 5,
        },
        {
          id: "c-and-a-minor-sweep",
          title: "C and A minor",
          purpose: "A bar of C and a bar of A minor around fret 9. Between them only the note on the B string changes.",
          howTo: [
            "Triplets, 50 BPM up to a pass at 70.",
            "C: G string 9, B string 8, top string 8. A minor: G string 9, B string 10, top string 8.",
          ],
          coach: "Timed and counted. The pitch is for your ear.",
          tab: sweeps(C_MID, AM_MID),
          position: 8,
          loops: false,
          chords: "C | Am",
          harmony: { chordTones: true },
          rungs: ladder(50, 100, 10),
          passAt: 70,
          ...SWEPT,
          minutes: 5,
        },
        {
          id: "four-chords-sweep",
          title: "Four chords, swept",
          purpose: "C, A minor, F and G around fret 8, a bar each, with a band playing in triplets.",
          howTo: [
            "Triplets, 50 BPM up to a pass at 70. One bar on each chord.",
            "C is 9, 8, 8. A minor is 9, 10, 8. F is 10, 10, 8. G is 7, 8, 7. The shapes are the nearest ones from Triads.",
          ],
          coach: "Band on. Timed and counted; the pitch is for your ear.",
          tab: SWEEP_FOUR,
          position: 7,
          shifts: true,
          chords: "C | Am | F | G",
          jam: TWELVE_EIGHT("C"),
          harmony: { chordTones: true },
          rungs: ladder(50, 100, 10),
          passAt: 70,
          ...SWEPT,
          minutes: 6,
        },
      ],
    },
    {
      id: "sweeps-in-a-song",
      title: "Sweeps in a song, and where to go next",
      goal: "Sweep an eight-bar progression in two parts of the neck, in other keys, and play the two-octave A minor arpeggio in triplets.",
      why: "This is the end of the route that began with counting a scale on one string. You know what a chord is, where its notes are, which chords belong together, how to move between them, and how to play them as lines. What is left is speed and bigger shapes, and that is a technique with its own Path: Sweep Picking starts exactly here, with the three-string triad you have just swept, and takes it to five and six strings.",
      howTo: [
        "Bars 1 to 4 around fret 5: C is 5, 5, 3. G is 4, 3, 3. A minor is 5, 5, 5. F is 5, 6, 5.",
        "Bars 5 to 8 around fret 8: C is 9, 8, 8. G is 7, 8, 7. A minor is 9, 10, 8. F is 10, 10, 8.",
        "Keep the tempo where every note is separate. Sweep Picking is where it gets faster: it asks for clean hammer-ons and pull-offs and even alternate picking first, and its first Step passes these triads at 100 BPM.",
      ],
      payoff: "An eight-bar song in sweeps, and a clear next Path.",
      exercises: [
        {
          id: "song-sweeps",
          title: "Eight bars, swept",
          purpose: "C, G, A minor, F around fret 5 and then around fret 8, each bar a triad swept up and back.",
          howTo: [
            "Triplets, 50 BPM up to a pass at 70. One bar on each chord.",
            "The shapes are the song from Triads. There are two shifts: after bar 4, and from bar 8 back to the start. Let the last note before each be short. A minor is one finger rolled across three strings, the hardest shape here to keep clean.",
          ],
          coach: "Eight bars with the band. Timed and counted; the pitch is for your ear.",
          tab: SWEEP_SONG,
          position: 3,
          shifts: true,
          chords: SONG_CHART,
          jam: TWELVE_EIGHT("C"),
          harmony: { chordTones: true },
          rungs: ladder(50, 100, 10),
          passAt: 70,
          ...SWEPT,
          pass: [
            { metric: "notesHeard", min: 0.9, overBars: 8 },
            { metric: "timingEvenness", min: 0.75, overBars: 8 },
            { metric: "extraNotes", max: 4, overBars: 4 },
          ],
          minutes: 6,
        },
        {
          id: "song-sweeps-keys",
          title: "The same song in a new key",
          purpose: "The eight bars moved along the neck: in D, in E, or in B flat.",
          howTo: [
            "Triplets, 50 BPM up to a pass at 70. One bar on each chord.",
            "In D everything is two frets higher than in C: the first shape is G string 7, B string 7, top string 5.",
            VARIANT_NOTE,
          ],
          coach: "A key that changes from day to day. Timed and counted; the pitch is for your ear.",
          vary: inKeys(SWEEP_SONG, SONG_CHART, { D: 2, E: 4, Bb: -2 }, TWELVE_EIGHT),
          tab: shiftFrets(SWEEP_SONG, 2),
          position: 5,
          shifts: true,
          chords: "D | A | Bm | G | D | A | Bm | G",
          jam: TWELVE_EIGHT("D"),
          harmony: { chordTones: true },
          rungs: ladder(50, 100, 10),
          passAt: 70,
          ...SWEPT,
          pass: [
            { metric: "notesHeard", min: 0.9, overBars: 8 },
            { metric: "timingEvenness", min: 0.75, overBars: 8 },
            { metric: "extraNotes", max: 4, overBars: 4 },
          ],
          minutes: 6,
        },
        {
          id: "two-octaves-in-triplets",
          title: "Two octaves in triplets",
          purpose: "The two-octave A minor arpeggio, three notes to a beat: up, back down to the low A, and up again to finish on C. From the A string to the top string, going up, the notes fall one to a string, which is where a sweep fits.",
          howTo: [
            "Triplets, 50 BPM up to a pass at 70. Two bars.",
            "Up: low E string 5 and 8, A string 7, D string 7, then fret 5 on the G, B and top strings, and top string 8. Then back down the same notes to the low A, and up once more: low E string 8, A string 7, D string 7, and G string 5 held for two beats.",
            "Pick it any way that keeps it even. If you sweep, let each note go as the next sounds.",
          ],
          coach: "Timed and counted; the pitch is for your ear.",
          tab: `/8t 6:5 6:8 5:7 4:7 3:5 2:5 1:5 1:8 1:5 2:5 3:5 4:7 | 5:7 6:8 6:5 6:8 5:7 4:7 /2 3:5`,
          position: 5,
          harmony: { arpeggio: "Am", cover: true },
          rungs: ladder(50, 100, 10),
          passAt: 70,
          ...SWEPT,
          pick: "free",
          minutes: 6,
        },
      ],
    },
  ],
  levels: [
    {
      id: "beginner",
      title: "Beginner: one chord, one octave",
      summary: "A chord played as a line from its root, an arpeggio for each of four chords, and moving to the nearest note when the chord changes.",
      startHereIf: [
        "You can play C, A minor, F and G as triads with the band at 80 BPM.",
        "You roll chord shapes and have never played a chord's notes as a line.",
        "You can find a chord's root on 1 string.",
      ],
      steps: ["one-octave", "four-chords", "nearest-note"],
      warmups: [
        {
          id: "arpeggios-one-four-five",
          title: "Three arpeggios in a key",
          purpose: "The one-octave major arpeggio on the first, fourth and fifth chords of a key and home. A different key each time.",
          howTo: ["Straight eighths, well under your clean tempo. Find each root on the D string before the bar starts, and let every note go as the next one sounds."],
          coach: "This is a warm-up. It tells you how it went, and it decides nothing.",
          vary: {
            values: { key: ["C", "Db", "D", "Eb", "E", "F"] },
            pooled: ["key"],
            label: (p) => `${p.key} major`,
            build: (p) => {
              const by = ({ C: 0, Db: 1, D: 2, Eb: 3, E: 4, F: 5 } as Record<string, number>)[p.key];
              const tab = [maj(10 + by), maj(3 + by), maj(5 + by), maj(10 + by)].map(upDown).join(" | ");
              return { tab, position: handAt(tab), shifts: true, chords: chartIn("C | F | G | C", by, p.key), harmony: { chordTones: true as const } };
            },
          },
          grade: "warmup",
          warmup: { start: 0.6, top: 0.8, reference: "four-chords.four-arpeggios", fallback: 50 },
          rungs: ladder(50, 100, 10),
          minutes: 3,
        },
      ],
    },
    {
      id: "intermediate",
      title: "Intermediate: sevenths, two octaves, a whole form",
      summary: "Seventh chords as one changed note, a two, five, one line, arpeggios across six strings, and twelve bars of chord notes.",
      startHereIf: [
        "You can play one-octave arpeggios through 4 chords at 80 BPM.",
        "You can move from one chord to the next without jumping back to the root.",
        "You have not yet played a seventh chord as an arpeggio.",
      ],
      steps: ["sevenths", "two-octaves", "a-whole-form"],
      warmups: [
        {
          id: "sevenths-round",
          title: "Four seventh chords, up or down",
          purpose: "One, six, two, five in seventh chords, each between its root on the D string and its seventh on the top string, going up one day and coming down another, in a key that changes.",
          howTo: ["Quarter notes, well under your clean tempo. Say the name of each chord as you start it."],
          coach: "This is a warm-up. It tells you how it went, and it decides nothing.",
          vary: {
            values: { key: ["C", "D", "Eb"], shapeOrder: ["going up", "coming down"] },
            pooled: ["key", "shapeOrder"],
            label: (p) => `${p.key} major, ${p.shapeOrder}`,
            build: (p) => {
              const by = ({ C: 0, D: 2, Eb: 3 } as Record<string, number>)[p.key];
              const way = p.shapeOrder === "going up" ? up : down;
              const tab = [maj7(10 + by), min7(7 + by), min7(12 + by), dom7(5 + by)].map(way).join(" | ");
              return { tab, position: handAt(tab), shifts: true, chords: chartIn(SEVENTHS_CHART, by, p.key), harmony: { chordTones: true as const } };
            },
          },
          grade: "warmup",
          warmup: { start: 0.6, top: 0.8, reference: "sevenths.sevenths-in-the-key", fallback: 60 },
          rungs: ladder(50, 100, 10),
          minutes: 3,
        },
      ],
    },
    {
      id: "advanced",
      title: "Advanced: playing the changes, and the first sweeps",
      summary: "A line through four seventh chords in more than one key, three-string triads swept slowly, an eight-bar song in sweeps, and the hand-off to Sweep Picking.",
      startHereIf: [
        "You can play C major seven, A minor seven, D minor seven and G seven as arpeggios at 80 BPM.",
        "You can follow a 12-bar form with arpeggios without getting lost.",
        "You have never swept, or you sweep fast and can't play the same notes slowly and clean.",
      ],
      steps: ["joined-sevenths", "first-sweeps", "sweeps-in-a-song"],
      warmups: [
        {
          id: "slow-sweeps",
          title: "A slow sweep round three chords",
          purpose: "One triad shape swept up and back on the first, fourth and fifth chords of a key and home, slowly. A different shape and key each time.",
          howTo: ["Triplets, well under your clean tempo. One push up, one pull back, and each note lets go as the next one sounds. The last bar stops on its top note."],
          coach: "This is a warm-up. It tells you how it went, and it decides nothing.",
          vary: {
            values: { key: ["C", "D", "Eb"], shapeOrder: ["root lowest", "third lowest"] },
            pooled: ["key", "shapeOrder"],
            label: (p) => `${p.key} major, ${p.shapeOrder}`,
            build: (p) => {
              const by = ({ C: 0, D: 2, Eb: 3 } as Record<string, number>)[p.key];
              const [shape, moves] = p.shapeOrder === "root lowest" ? [C_LOW, [0, 5, 7, 0]] : [C_MID, [0, -7, -5, 0]];
              const tab = moves.map((m, at) => shiftFrets(at === moves.length - 1 ? sweepEnd(shape) : sweepBar(shape), by + m)).join(" | ");
              return { tab, position: handAt(tab), shifts: true, chords: chartIn("C | F | G | C", by, p.key), harmony: { chordTones: true as const } };
            },
          },
          pick: "sweep",
          grade: "warmup",
          warmup: { start: 0.6, top: 0.8, reference: "first-sweeps.four-chords-sweep", fallback: 50 },
          rungs: ladder(50, 100, 10),
          minutes: 3,
        },
      ],
    },
  ],
});
