/**
 * Classic Rock, a Theory Path. A draft: no teacher or guitarist has reviewed it.
 *
 * Written 2026-11-16 from the outline in `plans/tasks/mvp/CONTENT.md`. Theory
 * is taught through written riffs, licks and arpeggios in the style of the
 * players everyone learns from, graded on what the app measures today: timing,
 * notes heard, extra notes and right notes. Every line here is original: the
 * shapes and moves are the shared vocabulary of the style, and none of the
 * notes are a song's. Choosing your own notes is a short "your turn" at the end
 * of some Steps, self-checked and labelled "not checked yet".
 */
import { definePath } from "../spec";
import type { ExerciseSpec, VariantParams } from "../spec";
import type { PassBar } from "../format";
import { handAt, ladder, moveChart, pentatonic, shiftFrets } from "../templates";

// ---------------------------------------------------------------------------
// Grading. Every written line carries a timing bar. Tighter on the early
// Steps, where the lines are short and the tempo modest; looser on the slow
// melody, where a player lays back on purpose (a constant lean costs nothing,
// the bar forgives a spread).
// ---------------------------------------------------------------------------

type Grading = Pick<ExerciseSpec, "grade" | "alsoGraded" | "pass">;

const EVENNESS = { early: 0.8, straight: 0.75, slow: 0.6 } as const;

/** Written single-note lines: right notes, notes heard, extras, timing. */
function lick(feel: keyof typeof EVENNESS, overBars = 4): Grading {
  const bars: PassBar[] = [
    { metric: "noteIdentity", min: 0.9, overBars },
    { metric: "notesHeard", min: 0.9, overBars },
    { metric: "extraNotes", max: 4, overBars: 4 },
    { metric: "timingEvenness", min: EVENNESS[feel], overBars },
  ];
  return { grade: "written", alsoGraded: ["timingEvenness"], pass: bars };
}

/**
 * Double stops, ringing open strings, chord embellishment: timed and counted,
 * and not pitch-checked, because two notes at once can't be told apart by a
 * single-note pitch tracker. Single notes among them are left to `lick`.
 */
function timedOnly(feel: keyof typeof EVENNESS): Grading {
  return {
    grade: "timing",
    pass: [
      { metric: "timingEvenness", min: EVENNESS[feel], overBars: 4 },
      { metric: "notesHeard", min: 0.9, overBars: 4 },
      { metric: "extraNotes", max: 4, overBars: 4 },
    ],
  };
}

/** Bends: timed and heard, never pitch-checked. A bent note reads as a wrong one. */
function bendsTimed(): Grading {
  return {
    grade: "attacksOnly",
    alsoGraded: ["timingEvenness"],
    pass: [
      { metric: "notesHeard", min: 0.9, overBars: 4 },
      { metric: "extraNotes", max: 4, overBars: 4 },
      { metric: "timingEvenness", min: EVENNESS.slow, overBars: 4 },
    ],
  };
}

const YOUR_TURN = { grade: "selfChecked", example: true } as const;
const NOT_CHECKED_YET =
  "Your turn, and not checked yet: the app can't judge notes you choose, so you tick it off yourself.";

const ROCK = (key: string) => ({ groove: "rock8", key });
const HARD = (key: string) => ({ groove: "hardRock", key });
const BALLAD = { groove: "ballad", key: "E minor" };

const KEY_SHIFT: Readonly<Record<string, number>> = { A: 0, B: 2, C: 3, D: 5, E: 7, G: -2 };

/** A written line moved to other keys, the chords and the scale moving with it. */
function inKeys(args: {
  tab: string;
  keys: readonly string[];
  chords?: string;
  scale?: string;
  over?: "scale" | "scaleOverChords" | "chordTones";
  allowed?: string[];
  jam?: (key: string) => { groove: string; key: string };
}) {
  const { tab, keys, chords, scale, over = "scale", allowed = [], jam } = args;
  return {
    values: { key: keys },
    pooled: ["key"] as const,
    label: (p: VariantParams) => `In ${p.key}`,
    build: (p: VariantParams) => {
      const shift = KEY_SHIFT[p.key];
      const moved = shiftFrets(tab, shift);
      const harmony =
        over === "chordTones"
          ? { chordTones: true as const }
          : over === "scaleOverChords"
            ? {
                scaleOverChords: [p.key, scale!] as [string, string],
                allowed: allowed.map((n) => moveChart(n, shift).trim()),
              }
            : { scale: [p.key, scale!] as [string, string] };
      return {
        tab: moved,
        position: handAt(moved),
        shifts: true,
        ...(chords ? { chords: moveChart(chords, shift) } : {}),
        ...(jam ? { jam: jam(p.key) } : {}),
        harmony,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// The lines.
// ---------------------------------------------------------------------------

// A single-note root line under power chords: A, C, D on the two low strings.
const ROOT_RIFF = "/8 6:5m 6:5m 6:8 6:5m 5:5 6:5m 6:8 6:7 | /8 6:5m 6:5m 5:7 5:5 /4 6:8 6:7";
// Parallel fourths on the D and G strings.
const FOURTHS_RIFF = "/8 4:7+3:7 4:7+3:7 r 4:5+3:5 /4 4:7+3:7 4:10+3:10 | /8 4:10+3:10 4:9+3:9 4:7+3:7 r /2 4:5+3:5";
// An open A pedal under a moving line on the D string.
const PEDAL_RIFF = "/8 5:0m 5:0m 4:2 5:0m 5:0m 4:5 5:0m 4:4 | /8 5:0m 5:0m 4:2 5:0m 4:5 4:4 4:2 4:0";

// Box 1, descending, for the six-note sequence.
const DOWN_BOX = ["1:8", "1:5", "2:8", "2:5", "3:7", "3:5", "4:7", "4:5", "5:7", "5:5", "6:8", "6:5"];
const sixFrom = (start: number) => DOWN_BOX.slice(start, start + 6).join(" ");

const PAGE_DESCENT =
  "/16 1:5 2:8 2:5 3:7 1:5 2:8 2:5 3:7 2:8 2:5 3:7 3:5 2:8 2:5 3:7 3:5 | /16 3:7 3:5 4:7 4:5 3:7 3:5 4:7 4:5 /4 5:7 4:7";

/** The triplet pull-off loop on a pair of strings, then the note below it. */
const PULL_CELLS: Readonly<Record<string, { cell: string; home: string }>> = {
  "1-2": { cell: "1:8 1:5p 2:8", home: "2:5" },
  "2-3": { cell: "2:8 2:5p 3:7", home: "3:5" },
  "3-4": { cell: "3:7 3:5p 4:7", home: "4:5" },
};
const pullLoop = (pair: string) => {
  const { cell, home } = PULL_CELLS[pair];
  return `/8t ${[cell, cell, cell, cell].join(" ")} | /8t ${cell} ${cell} /2 ${home}`;
};

// The A, G and D triads one at a time, then back to A.
const ARPEGGIOS_AGD = "/8 4:7 3:6 2:5 1:5 2:5 3:6 4:7 3:6 | /8 4:5 3:4 2:3 1:3 2:3 3:4 4:5 3:4 | /8 4:4 4:7 3:7 2:7 1:5 2:7 3:7 4:7 | /8 3:6 2:5 1:5 2:5 /2 4:7";
// A lick over each chord that ends on its root.
const ROOTS_AGD = "/8 2:5 3:7 3:6 3:4 /2 4:7 | /8 3:7 3:4 4:7 3:4 /2 4:5 | /8 2:7 1:5 2:7 2:5 /2 3:7 | /8 3:6 2:5 3:7 3:6 /2 4:7";

// The sixteen-bar etude: riff-like, Page sixteenths, a double stop, the
// Clapton repeat, and a low ending on the V.
const ETUDE_BARS = [
  "/4 4:7 /8 3:5 3:7 /4 2:5 /8 2:8 1:5",
  "/2 2:5+1:5 /8 2:8 2:5 3:7 3:5",
  "/4 3:7 /8 3:5 4:7 /4 4:5 r",
  "/8 5:5 5:7 4:5 5:7 /2 4:7",
  "/16 1:5 2:8 2:5 3:7 1:5 2:8 2:5 3:7 /4 2:5 /8 3:7 3:5",
  "/2 4:7 /16 3:7 3:5 4:7 4:5 3:7 3:5 4:7 4:5",
  "/2 4:5 /8 4:7 3:5 3:7 3:5",
  "/4 3:7 /8 2:5 2:8 /2 1:5",
  "/4 1:8 /8 1:5 2:8 /4 1:8 /8 1:5 2:8",
  "/4 2:8 /8 2:5 3:7 /4 2:8 /8 2:5 3:7",
  "/8t 1:5 2:8 2:5 1:5 2:8 2:5 1:5 2:8 2:5 1:5 2:8 2:5",
  "/4 2:5+1:5 2:5+1:5 /8 2:8 2:5 3:7 3:5",
  "/2 3:5 /8 3:7 3:5 4:7 3:5",
  "/2 4:5 /8 4:7 3:5 4:7 4:5",
  "/8 5:7 5:5 6:8 6:5 6:8 5:5 /4 5:7",
  "/2 5:7 /2 r",
];
const ETUDE_CHORDS = "A5 | A5 | G5 | D5 | A5 | A5 | G5 | D5 | F5 | G5 | A5 | A5 | F5 | G5 | E5 | E5".split(" | ");
const etude = (from: number, to: number) => ETUDE_BARS.slice(from, to).join(" | ");
const etudeChords = (from: number, to: number) => ETUDE_CHORDS.slice(from, to).join(" | ");

const RIFF_CALL = "/8 6:5m 6:5m 6:8 6:5m 5:5 6:5m 6:8 6:7 | /8 6:5m 6:5m 5:7 5:5 /4 6:8 6:7";
const LICK_CALL = "/8 1:5 1:8 1:5 2:8 /4 2:5 r | /8 3:7 3:5 4:7 4:5 /2 4:7";
const REST_BARS = "/1 r | /1 r";

/** Sixteen groups of three as sixteenths: three bars, a group starting on a new sixteenth each beat. */
const THREE_OVER_FOUR = (() => {
  const notes = Array.from({ length: 16 }, () => ["1:8>", "1:5p", "2:8"]).flat();
  const bars = [0, 16, 32].map((at) => notes.slice(at, at + 16).join(" "));
  return `/16 ${bars.join(" | ")} | /4 1:5 r /2 r`;
})();

export default definePath({
  id: "classic-rock",
  title: "Classic Rock",
  kind: "theory",
  goal: "Play riffs, licks and a written solo in the classic rock style over a band, and know why each note fits the chord under it.",
  level: "early-intermediate",
  assumes:
    "You can play power chords and single notes cleanly, and eighth notes with a click at 80 BPM. Knowing the A minor pentatonic box helps and isn't required: Step 2 goes through it. Most of the Path is in A, so that theory is the only new thing; licks a player repeats for weeks move to other keys and positions.",
  prerequisites: { skills: ["Power chords", "Clean single notes", "Eighth notes with a click at 80 BPM"] },
  labelSubdivisions: "mostly",
  orderRationale:
    "Riffs come first because they are what a rock player plays most, and they put time in the hands before any theory. The minor pentatonic box and its extension come next, with the licks the style is built on; the major pentatonic follows at once, because hearing minor against major over the same chord is the theory that separates rock from blues. Repeating licks come after the box, since they are box notes played as loops. Double stops and chord embellishment move from one note to two and into the chord, then chord tones over A, G and D (I, flat VII, IV) show why the same box works over those changes. The slow melody needs control more than speed, so it comes late; call and response with a band uses everything before it, and the sixteen-bar etude puts it all in one solo.",
  gradingLimits:
    "Graded Exercises are written lines. The app checks timing evenness, notes heard and extra notes on every one, and right notes after the take on single notes that are far enough apart and don't ring into each other; elsewhere right notes read 'not checked'. Double stops, the chord embellishments and riffs with open strings ringing are timed and counted, and not pitch-checked, because a single-note tracker can't tell two notes apart. A bent note would read as a wrong one, so bends are timed and never pitch-checked, and their pitch is a self-check. The right-note check has only been tried on computer-made guitar sound with no band in the mix, so direct input or headphones are the honest way to play anything with a band, and with a microphone and speakers it is untested. Choosing your own notes, landing on chord tones and phrasing are not measured today: those Exercises are 'your turn', self-checked and labelled 'not checked yet'. Nothing here grades feel or tone.",
  steps: [
    {
      id: "riffs",
      title: "Riffs in eighths",
      goal: "Play three kinds of rock riff in time with a band: a single-note root line, parallel fourths, and an open-string pedal.",
      why: "Riffs are most of what a rock guitarist plays, and they are where time lives. A riff played a little ahead or behind is what makes a band sound tight or loose. These three shapes, a root line, two-note fourths and a pedal under a moving line, are the building blocks of a thousand rock songs.",
      howTo: [
        "Palm-mute the low notes marked with an m: rest the side of your picking hand on the strings just in front of the bridge, so they thud rather than ring.",
        "Downstrokes on every eighth sound heavier; alternate if the tempo gets away from you. Either way, lock to the drummer's hi-hat.",
        "Fourths are two strings at once with one finger flattened across them, or two fingers side by side on the same fret.",
      ],
      payoff: "You can play a riff with the band and it sounds like a record, tight on the hi-hat.",
      exercises: [
        {
          id: "root-riff",
          title: "A root line under power chords",
          purpose: "A single-note riff on the two low strings that walks the roots a power chord would play: A, C, D and the B below C. The riff a band locks to.",
          howTo: [
            "Straight eighths, 80 BPM up to a pass at 110, over a rock beat.",
            "Bar 1: A at fret 5 on the low E twice (muted), C at 8, A, D at fret 5 on the A string, A, C, B at 7. Bar 2: A, A, E and D on the A string, then C and B as quarter notes.",
            "First finger on fret 5, third on 7, fourth on 8. The hand doesn't move.",
          ],
          coach: "Written notes on single strings: I check right notes, notes heard and the time after the take.",
          vary: inKeys({ tab: ROOT_RIFF, keys: ["A", "G", "C", "D"], chords: "A5 | A5", scale: "naturalMinor", jam: (k) => ROCK(`${k} minor`) }),
          tab: ROOT_RIFF,
          position: 5,
          chords: "A5 | A5",
          jam: ROCK("A minor"),
          harmony: { scale: ["A", "naturalMinor"] },
          rungs: ladder(80, 130, 10),
          passAt: 110,
          ...lick("early"),
          minutes: 5,
        },
        {
          id: "fourths-riff",
          title: "Fourths on the D and G strings",
          purpose: "Two notes at once, a fourth apart, moving together: the heavy, open sound of a lot of seventies riffs. Original notes in A, the same fingering on every chord.",
          howTo: [
            "Straight eighths with rests, 80 BPM up to a pass at 110.",
            "Every shape is the same fret on the D and G strings. Bar 1: fret 7 twice, a rest, fret 5, then fret 7 and fret 10 as quarters. Bar 2: frets 10, 9 and 7, a rest, and fret 5 held.",
            "Flatten your third finger across both strings, or use your third and fourth fingers side by side. Mute the other strings with the side of the fretting finger.",
          ],
          coach: "Two notes at a time, so I don't check pitch here: I time each one and count them heard.",
          tab: FOURTHS_RIFF,
          position: 5,
          shifts: true,
          chords: "A5 | A5",
          jam: HARD("A minor"),
          harmony: { scale: ["A", "naturalMinor"] },
          rungs: ladder(80, 130, 10),
          passAt: 110,
          ...timedOnly("early"),
          minutes: 5,
        },
        {
          id: "pedal-riff",
          title: "An open A pedal",
          purpose: "The open A string keeps coming back while a line moves above it on the D string: E, G, F#, D. One hand plays both the bass and the tune.",
          howTo: [
            "Straight eighths, 80 BPM up to a pass at 110.",
            "Palm-mute the open A. Fret the D string notes with first finger on fret 2, third on 4, fourth on 5, and lift the mute a little for them so they speak.",
          ],
          coach: "Written notes, one at a time: right notes, notes heard and time, after the take.",
          tab: PEDAL_RIFF,
          position: 2,
          shifts: true,
          chords: "A5 | A5",
          jam: ROCK("A"),
          harmony: { scale: ["A", "dorian"] },
          rungs: ladder(80, 130, 10),
          passAt: 110,
          ...lick("early"),
          minutes: 5,
        },
      ],
    },
    {
      id: "box-extension",
      title: "The box and its extension",
      goal: "Play the licks rock is built on in box 1 of A minor pentatonic, and reach up to the extension at frets 8 and 10.",
      why: "Nearly every classic rock solo starts in this box. The licks here are its common phrases: a descending sixteenth run, a three-note repeat on the top strings, a six-note sequence that runs down the box, and the extension, the two frets above the box on the top strings where so many solos find their high notes.",
      howTo: [
        "Box 1 in A: first finger on fret 5, the notes A, C, D, E, G. The extension is frets 8 and 10 on the B and high E strings: G, A, C and D.",
        "Play everything at the slowest rung until the notes are automatic, then let the tempo come.",
        "Keep the picking small. Speed in these licks comes from a quiet hand.",
      ],
      payoff: "You have four licks you can drop into any A minor rock song, and a way up the neck.",
      exercises: [
        {
          id: "page-descent",
          title: "A descending sixteenth run",
          purpose: "Four-note groups down the top of the box: A, G, E, D, then G, E, D, C, then down a string. The fast, flowing descent of a lot of seventies solos.",
          howTo: [
            "Straight sixteenths, four to a click, 60 BPM up to a pass at 90.",
            "Bar 1: A at 5 on the high E, G at 8 and E at 5 on the B, D at 7 on the G, twice; then G, E, D, C twice. Bar 2: D, C on the G string, A, G on the D string, twice, then E on the A string and A to finish.",
          ],
          coach: "Right notes, notes heard and even sixteenths after the take.",
          vary: inKeys({ tab: PAGE_DESCENT, keys: ["A", "E", "G", "D"], chords: "A5 | A5", scale: "minorPentatonic", jam: (k) => ROCK(`${k} minor`) }),
          tab: PAGE_DESCENT,
          position: 5,
          chords: "A5 | A5",
          jam: ROCK("A minor"),
          harmony: { scale: ["A", "minorPentatonic"] },
          rungs: ladder(60, 110, 10),
          passAt: 90,
          ...lick("early"),
          minutes: 5,
        },
        {
          id: "clapton-repeat",
          title: "The three-note repeat on the top strings",
          purpose: "A, G and E as triplets, over and over: the repeat a lot of sixties players built solos on. Then C, A, G, and home to A.",
          howTo: [
            "Eighth-note triplets, three to a click, 60 BPM up to a pass at 90.",
            "A at 5 on the high E and E at 5 on the B under one first finger, rolled from one string to the other, and G at 8 on the B with your fourth. Four times. Bar 2: C at 8, A at 5 on the high E, G at 8 on the B, twice, then the A held.",
          ],
          coach: "Written triplets: right notes, notes heard and timing after the take.",
          tab: "/8t 1:5 2:8 2:5 1:5 2:8 2:5 1:5 2:8 2:5 1:5 2:8 2:5 | /8t 1:8 1:5 2:8 1:8 1:5 2:8 /2 1:5",
          position: 5,
          chords: "A5 | A5",
          jam: { groove: "rockTwelveEight", key: "A minor" },
          harmony: { scale: ["A", "minorPentatonic"] },
          rungs: ladder(60, 110, 10),
          passAt: 90,
          ...lick("early"),
          minutes: 5,
        },
        {
          id: "sixes-down",
          title: "Sixes down the box",
          purpose: "Six notes down the box, then start one note lower and play six more. A sequence that sounds faster than it is, the way hard rock players of the eighties loved to run it.",
          howTo: [
            "Sixteenth-note sextuplets, six to a click, 50 BPM up to a pass at 70.",
            "Group 1 starts at C, fret 8 on the high E: C, A, G, E, D, C. Group 2 starts one box note lower, on A. Four groups in bar 1, two in bar 2, then the low A held.",
            "Say 'one-two-three-four-five-six' on every beat; the first note of each group falls on the click.",
          ],
          coach: "Fast notes, still single: I check right notes, notes heard and evenness after the take.",
          tab: `/16t ${sixFrom(0)} ${sixFrom(1)} ${sixFrom(2)} ${sixFrom(3)} | /16t ${sixFrom(4)} ${sixFrom(5)} /2 6:5`,
          position: 5,
          loops: false,
          chords: "A5 | A5",
          jam: ROCK("A minor"),
          harmony: { scale: ["A", "minorPentatonic"] },
          rungs: ladder(50, 90, 5),
          passAt: 70,
          ...lick("straight"),
          minutes: 5,
        },
        {
          id: "extension-lick",
          title: "Up to the extension and back",
          purpose: "A lick that leaves the box upwards on the top two strings, frets 8 and 10, and comes back home to A. The extension is where a solo goes when it wants to lift.",
          howTo: [
            "Straight eighths, 70 BPM up to a pass at 100.",
            "Bar 1: D on the G string, then G and A on the B string (frets 8 and 10), C and D on the high E (8 and 10), and back down C, A, G. Bar 2: D and C on the high E, A and G on the B, then D and C on the G string back in the box, and A at fret 7 on the D string.",
            "First finger on fret 7 for the extension: frets 7, 8 and 10 lie under the first, second and fourth fingers. Move back to fret 5 for the last three notes of bar 2.",
          ],
          coach: "Written notes: I check them, and the time, after the take.",
          tab: "/8 3:7 2:8 2:10 1:8 1:10 1:8 2:10 2:8 | /8 1:10 1:8 2:10 2:8 3:7 3:5 /4 4:7",
          position: 7,
          shifts: true,
          chords: "A5 | A5",
          jam: ROCK("A minor"),
          harmony: { scale: ["A", "minorPentatonic"] },
          rungs: ladder(70, 120, 10),
          passAt: 100,
          ...lick("early"),
          minutes: 5,
        },
      ],
    },
    {
      id: "major-pentatonic",
      title: "Major pentatonic, and minor against major",
      goal: "Play A major pentatonic in two places on the neck, and hear the difference between minor and major lines over the same chord.",
      why: "Minor pentatonic is the tough sound of rock; major pentatonic is the sweet, country-tinged sound of Southern rock and a lot of sixties pop. Over a power chord, which has no third, both work, and the choice between them is the choice of mood. Hearing that choice is the theory.",
      howTo: [
        "A major pentatonic is A, B, C#, E, F#. Its box is the minor box moved down three frets: first finger on fret 2, or on fret 14 an octave up.",
        "The two notes that change are C to C# and G to F#. Everything else in the phrase can stay where it was.",
        "Over A major, use major. Over A5 you choose.",
      ],
      payoff: "You can play the same phrase in minor and in major over one chord, and hear the mood flip.",
      difficultyException:
        "The lines are slower than the sixteenth runs before them: a new sound to hear and choose between is the demand, which a rate can't count.",
      exercises: [
        {
          id: "major-box",
          title: "A major pentatonic box",
          purpose: "The major box up and down, so its notes are in the hand: at fret 2, and the same shape at fret 14.",
          howTo: [
            "Straight eighths, two to a click, 60 BPM up to a pass at 90.",
            "First finger on fret 2 (or 14), fourth finger on 5 (or 17). At fret 2 the A's are on the low E at 5, the G string at 2 and the high E at 5; at 14 they are twelve frets higher.",
          ],
          coach: "Right notes and even eighths after the take.",
          vary: {
            values: { position: ["2", "14"] },
            notPooled: { position: "Frets near the nut are a wider stretch than up at 14, so each position keeps its own clean tempo." },
            label: (p) => `At fret ${p.position}`,
            build: (p) => {
              const tab = shiftFrets(`/8 ${pentatonic({ root: "F#", box: 1, sequence: "updown" })} hold`, Number(p.position) - 2);
              return { tab, position: Number(p.position), shifts: true, harmony: { scale: ["A", "majorPentatonic"], cover: true } };
            },
          },
          position: 2,
          harmony: { scale: ["A", "majorPentatonic"], cover: true },
          click: 2,
          rungs: ladder(60, 110, 10),
          passAt: 90,
          ...lick("early"),
          minutes: 5,
        },
        {
          id: "southern-lick",
          title: "A Southern-rock major lick",
          purpose: "A sweet, rolling major pentatonic line high on the neck at fret 14, the sound of twin-guitar Southern rock. It ends on A.",
          howTo: [
            "Straight eighths, 70 BPM up to a pass at 90.",
            "Bar 1, down from A at fret 17 on the high E: A, F#, E, C#, B, C#, B, A. Bar 2: F# and A on the D and G strings, F#, E, then A on the G string held for two beats.",
            "First finger on 14, third on 16, fourth on 17.",
          ],
          coach: "Written notes in the major box: I check them and their time after the take.",
          tab: "/8 1:17 1:14 2:17 2:14 3:16 2:14 3:16 3:14 | /8 4:16 3:14 4:16 4:14 /2 3:14",
          position: 14,
          chords: "A | A",
          jam: ROCK("A"),
          harmony: { scale: ["A", "majorPentatonic"] },
          rungs: ladder(70, 110, 10),
          passAt: 90,
          ...lick("early"),
          minutes: 5,
        },
        {
          id: "minor-vs-major",
          title: "The same phrase, minor then major",
          purpose: "Two bars in the minor box, then the same rhythm and shape with the major notes over the same A5. E, G, A, C becomes E, F#, A, B, and the C on the way home becomes C#.",
          howTo: [
            "Straight eighths and quarters, 70 BPM up to a pass at 90.",
            "Bars 1 and 2, minor, first finger on fret 5: E, G, A, C, A, G, E, then E, D, C, D and A. Bars 3 and 4, major, first finger on fret 4: E, F#, A, B, A, F#, E, then E, D, C#, B and A.",
            "Listen to bar 4 against bar 2. One fret changes the mood.",
          ],
          coach: "Written notes in both boxes, checked after the take with their timing.",
          tab: "/8 2:5 2:8 1:5 1:8 1:5 2:8 /4 2:5 | /8 2:5 3:7 3:5 3:7 /2 4:7 | /8 2:5 2:7 1:5 1:7 1:5 2:7 /4 2:5 | /8 2:5 3:7 3:6 3:4 /2 4:7",
          position: 5,
          shifts: true,
          chords: "A5 | A5 | A5 | A5",
          jam: ROCK("A"),
          harmony: { scaleOverChords: ["A", "minorPentatonic"], allowed: ["F#", "B", "C#"] },
          rungs: ladder(70, 110, 10),
          passAt: 90,
          ...lick("early"),
          minutes: 5,
        },
        {
          id: "your-mood",
          title: "Your turn: minor or major",
          purpose: "Over four bars of A5, play a phrase in the minor box, then answer it in the major box. Choose the mood bar by bar.",
          howTo: [
            "Straight eighths, 70 to 90 BPM.",
            "Start from the last Exercise and change one note at a time. The written line is an example.",
            NOT_CHECKED_YET,
          ],
          coach: "Not checked yet. Record it and listen for the moment the mood changes.",
          tab: "/8 2:5 2:8 1:5 1:8 1:5 2:8 /4 2:5 | /8 2:5 3:7 3:5 3:7 /2 4:7 | /8 2:5 2:7 1:5 1:7 1:5 2:7 /4 2:5 | /8 2:5 3:7 3:6 3:4 /2 4:7",
          position: 5,
          shifts: true,
          chords: "A5 | A5 | A5 | A5",
          jam: ROCK("A"),
          rungs: ladder(70, 90, 10),
          ...YOUR_TURN,
          selfCheck: [
            "Did your minor bars use C and G, and your major bars C# and F#?",
            "Could you hear which bars were which on a recording?",
          ],
          minutes: 4,
        },
      ],
    },
    {
      id: "repeating-licks",
      title: "Repeating licks",
      goal: "Play the looping pull-off licks and open-string repeats of classic hard rock, in time, for as long as the band keeps going.",
      why: "A short lick repeated in time builds tension like nothing else: the crowd hears it coming round again and again. Hard rock players of the seventies built whole solo climaxes this way. The lick is easy; keeping it even, and getting out of it cleanly, is the work.",
      howTo: [
        "Pick the first note of each group, pull off for the second, and pick the third. The pull-off is a small flick down off the string, not a lift.",
        "Keep the fretting fingers for the next note already on the string before you pull.",
        "A pulled-off note is quiet by nature. Make it heard, but don't push the picked notes to match.",
      ],
      payoff: "You can loop a lick for four bars and land out of it on the beat, the way a solo builds to its peak.",
      exercises: [
        {
          id: "pulloff-loop",
          title: "The triplet pull-off loop",
          purpose: "Pick, pull off, pick, in triplets: C, A, G on the top strings, round and round, then out to E. Then the same loop a string pair lower.",
          howTo: [
            "Eighth-note triplets, three to a click, 80 BPM up to a pass at 110.",
            "On the top pair: pick C at fret 8 on the high E with your fourth finger, pull off to A at fret 5 under your first, pick G at fret 8 on the B with your third. The lower pairs are the same move: fret 8 to 5 on the B and 7 on the G, or 7 to 5 on the G and 7 on the D.",
          ],
          coach: "The picked notes are checked for pitch and time. A pulled-off note that is too quiet for me doesn't count against you.",
          vary: {
            values: { stringSet: ["1-2", "2-3", "3-4"] },
            pooled: ["stringSet"],
            label: (p) => `Strings ${p.stringSet}`,
            build: (p) => ({ tab: pullLoop(p.stringSet), position: 5 }),
          },
          tab: pullLoop("1-2"),
          position: 5,
          chords: "A5 | A5",
          jam: { groove: "rockTwelveEight", key: "A minor" },
          harmony: { scale: ["A", "minorPentatonic"] },
          rungs: ladder(80, 140, 10),
          passAt: 110,
          ...lick("straight"),
          minutes: 5,
        },
        {
          id: "three-over-four",
          title: "The loop in sixteenths: three against four",
          purpose: "The same three notes, now as sixteenths: a group of three in a bar of four, so the group starts in a new place on every beat. The lick rolls across the bar line, which is the whole trick.",
          howTo: [
            "Straight sixteenths, four to a click, 60 BPM up to a pass at 80.",
            "C, A (pull-off), G, over and over: sixteen groups across three bars, then A held in bar 4. The first note of each group is accented: lean on it so you can hear where the group starts.",
          ],
          coach: "The picked notes are checked for pitch and time; the pull-offs count only if I hear them.",
          tab: THREE_OVER_FOUR,
          position: 5,
          chords: "A5 | A5 | A5 | A5",
          jam: ROCK("A minor"),
          harmony: { scale: ["A", "minorPentatonic"] },
          rungs: ladder(60, 100, 5),
          passAt: 80,
          ...lick("straight"),
          minutes: 5,
        },
        {
          id: "open-string-repeat",
          title: "An open-string repeat on the top strings",
          purpose: "Fretted notes on the B string against the open high E, as sixteenths: the restless, high-voltage sound of Australian hard rock, in E minor. Original notes.",
          howTo: [
            "Straight sixteenths, four to a click, 60 BPM up to a pass at 90.",
            "Every other note is the open high E. Bar 1, the fretted notes on the B string: G, F#, G, F# (frets 8 and 7), then E, F#, E, F# (frets 5 and 7). Bar 2 climbs G, A, B (frets 8, 10, 12), comes back down, and ends on E at fret 5.",
            "Pick evenly; the open string should be as loud as the fretted one.",
          ],
          coach: "The open string can ring under the next note, and when it does, I say right notes weren't checked. Notes heard and time always are.",
          tab: "/16 2:8 1:0 2:7 1:0 2:8 1:0 2:7 1:0 2:5 1:0 2:7 1:0 2:5 1:0 2:7 1:0 | /16 2:8 1:0 2:10 1:0 2:12 1:0 2:10 1:0 2:8 1:0 2:7 1:0 /4 2:5",
          position: 5,
          shifts: true,
          chords: "E5 | E5",
          jam: HARD("E minor"),
          harmony: { scale: ["E", "naturalMinor"] },
          rungs: ladder(60, 110, 10),
          passAt: 90,
          ...lick("straight"),
          minutes: 5,
        },
      ],
    },
    {
      id: "double-stops",
      title: "Double stops and rock and roll",
      goal: "Play two-note double stops on the top strings in the fifties rock and roll style, mixed with single-note runs.",
      why: "Two notes at once are louder, brighter and more urgent than one: rock and roll guitar is built on them. The shapes are small, a fret or two on the top strings, and the trick is rhythm: the double stop is a drum hit as much as a melody.",
      howTo: [
        "Barre the B and high E strings with your first finger at fret 5 for the E and A double stop. Your third finger reaches fret 7 or 8 on the G string.",
        "Mute the lower strings with the heel of the picking hand, and hit only the two strings you want.",
        "Play the double stops short and punchy, and let the single notes sing.",
      ],
      payoff: "Two bars of double stops into a single-note run: the sound of rock and roll lead guitar.",
      exercises: [
        {
          id: "stops-and-run",
          title: "Double stops into a run",
          purpose: "Bar 1 hammers the E and A double stop like a drummer; bar 2 walks C#, D, C#, C on the G string under the E; bars 3 and 4 run down the box to A.",
          howTo: [
            "Straight eighths, 80 BPM up to a pass at 120, over a rock beat.",
            "Bar 1: frets 5 on the B and high E, eight times. Bar 2: keep the B string at 5 and move the G string 6, 7, 6, 5, then 6 held. Bar 3: A, G, E, D, C, A, C, A down the box. Bar 4: G, E, G, and A held.",
          ],
          coach: "The double stops are timed and counted, not pitch-checked; the single notes in bars 3 and 4 are checked as well.",
          tab: "/8 2:5+1:5 2:5+1:5 2:5+1:5 2:5+1:5 2:5+1:5 2:5+1:5 2:5+1:5 2:5+1:5 | /8 3:6+2:5 3:7+2:5 3:6+2:5 3:5+2:5 /2 3:6+2:5 | /8 1:5 2:8 2:5 3:7 3:5 4:7 3:5 4:7 | /4 4:5 /8 5:7 4:5 /2 4:7",
          position: 5,
          chords: "A7 | A7 | A7 | A7",
          jam: ROCK("A"),
          harmony: { scaleOverChords: ["A", "minorPentatonic"], allowed: ["C#"] },
          rungs: ladder(80, 140, 10),
          passAt: 120,
          ...lick("straight"),
          minutes: 5,
        },
        {
          id: "stops-and-single",
          title: "Stops and a single note",
          purpose: "Double stops, then single notes to answer them: the call and response inside two bars.",
          howTo: [
            "Straight eighths, 80 BPM up to a pass at 120.",
            "Bar 1: the E and A double stop four times, the G and C double stop at fret 8, the E and A again, then D at 7 on the G string. Bar 2: E, D, C, A as single notes, and G held, which pulls back to the top.",
          ],
          coach: "Double stops are timed and counted; the single notes are pitch-checked too.",
          tab: "/8 2:5+1:5 2:5+1:5 2:5+1:5 2:5+1:5 2:8+1:8 2:5+1:5 /4 3:7 | /8 2:5 3:7 3:5 4:7 /2 4:5",
          position: 5,
          chords: "A7 | A7",
          jam: ROCK("A"),
          harmony: { scaleOverChords: ["A", "minorPentatonic"] },
          rungs: ladder(80, 140, 10),
          passAt: 120,
          ...lick("straight"),
          minutes: 5,
        },
        {
          id: "thirds-over-changes",
          title: "Double stops over A and D",
          purpose: "A double stop that is the top of each chord: C# and E over A, D and F# over D. Then a short run to the next. The double stop says the chord's name.",
          howTo: [
            "Straight eighths, 80 BPM up to a pass at 120.",
            "Bar 1: frets 6 on the G and 5 on the B three times, a rest, then A, C, C#, A as single notes. Bar 2: fret 7 on the G and B three times, a rest, then A, C, D, A.",
          ],
          coach: "The double stops are timed and counted; the single notes are pitch-checked as well.",
          tab: "/8 3:6+2:5 3:6+2:5 3:6+2:5 r 4:7 3:5 3:6 4:7 | /8 3:7+2:7 3:7+2:7 3:7+2:7 r 4:7 3:5 3:7 4:7",
          position: 5,
          chords: "A | D",
          jam: ROCK("A"),
          harmony: { scaleOverChords: ["A", "minorPentatonic"], allowed: ["C#", "F#"] },
          rungs: ladder(80, 140, 10),
          passAt: 120,
          ...lick("straight"),
          minutes: 5,
        },
      ],
    },
    {
      id: "embellishment",
      title: "Chord embellishment",
      goal: "Decorate an E and an A chord with hammered thirds and fills between the chord tones, the sixties rhythm-guitar style that sits between rhythm and lead.",
      why: "The most melodic rock rhythm guitar never just strums: it hammers onto the chord's third, slides a double stop into the chord, and fills between the beats. It turns a chord into a little tune, and it is a lesson in where the chord tones live.",
      howTo: [
        "Hold the shape of the chord and lift single fingers to decorate it. Your hand stays in the chord.",
        "The hammer-on goes to the third: G to G# over E, B to C# over A. That half step or whole step is the sound.",
        "Let notes ring into each other, and keep the time steady underneath.",
      ],
      payoff: "An E and an A that sing, with a fill between them, instead of two strummed chords.",
      difficultyException:
        "Slow and ringing on purpose: holding a chord shape while single fingers move inside it is the demand, not the rate.",
      exercises: [
        {
          id: "open-e",
          title: "Hammer to the third, open E",
          purpose: "Inside the open E chord: low E, the B on the A string, open G hammered to G#, and a fill on the top strings. The third arriving by hammer-on is the sound of the style.",
          howTo: [
            "Straight eighths, 60 BPM up to a pass at 80.",
            "Bar 1: low E, E at fret 2 on the D string, open G, hammer to fret 1, open B, G#, E, G#. Bar 2: B at fret 2 on the A string, E on the D string, open D, hammer to E, G#, open B, and G# held.",
          ],
          coach: "Notes ring into each other here, so I time them and count them heard, and don't pitch-check them.",
          tab: "/8 6:0 4:2 3:0 3:1h 2:0 3:1 4:2 3:1 | /8 5:2 4:2 4:0 4:2h 3:1 2:0 /4 3:1",
          position: 1,
          chords: "E | E",
          jam: { groove: "ballad", key: "E" },
          harmony: { scaleOverChords: ["E", "mixolydian"], allowed: ["G"] },
          rungs: ladder(60, 100, 5),
          passAt: 80,
          ...timedOnly("straight"),
          minutes: 5,
        },
        {
          id: "hammered-thirds",
          title: "Hammered thirds at the seventh fret",
          purpose: "A double stop on the G and B strings at fret 7, hammered up two frets to the E and G# of the E chord: two notes hammered at once, the classic decoration.",
          howTo: [
            "Straight eighths, 60 BPM up to a pass at 80.",
            "Bar 1: E on the A string, the 7th-fret double stop on G and B, hammer both to fret 9, then G# alone, B at 7 on the high E, G# and E. Bar 2: B at 9 on the D string, the same double stop and hammer, the 9th-fret double stop again, and E on the A string held.",
            "Barre fret 7 with your first finger, and hammer frets 9 with your third finger flattened.",
          ],
          coach: "Two notes at once, so I time them and count them heard; I don't pitch-check double stops.",
          tab: "/8 5:7 3:7+2:7 3:9h+2:9h 2:9 /4 1:7 /8 2:9 3:9 | /8 4:9 3:7+2:7 3:9h+2:9h 3:9+2:9 /2 5:7",
          position: 7,
          chords: "E | E",
          jam: { groove: "ballad", key: "E" },
          harmony: { scaleOverChords: ["E", "mixolydian"], allowed: ["G"] },
          rungs: ladder(60, 100, 5),
          passAt: 80,
          ...timedOnly("straight"),
          minutes: 5,
        },
        {
          id: "e-to-a",
          title: "E to A, embellished",
          purpose: "The open E move, then the same move on an A chord at fret 5: B hammered to C# on the G string. Two chords, one idea.",
          howTo: [
            "Straight eighths, 60 BPM up to a pass at 80.",
            "Bar 1 is the open E move from the first Exercise. Bar 2 moves it to A: A at 5 on the low E, A at 7 on the D string, B at 4 on the G hammered to C# at 6, E at 5 on the B, C#, A, C#. Bar 3 is the E move again. Bar 4: low E, E on the D string, G#, open B, and the open high E held.",
          ],
          coach: "Ringing notes again: timing and notes heard, not pitch.",
          tab: "/8 6:0 4:2 3:0 3:1h 2:0 3:1 4:2 3:1 | /8 6:5 4:7 3:4 3:6h 2:5 3:6 4:7 3:6 | /8 6:0 4:2 3:0 3:1h 2:0 3:1 4:2 3:1 | /8 6:0 4:2 3:1 2:0 /2 1:0",
          position: 1,
          shifts: true,
          chords: "E | A | E | E",
          jam: { groove: "ballad", key: "E" },
          harmony: { scaleOverChords: ["E", "mixolydian"], allowed: ["G"] },
          rungs: ladder(60, 100, 5),
          passAt: 80,
          ...timedOnly("straight"),
          minutes: 5,
        },
      ],
    },
    {
      id: "chord-tones",
      title: "Chord tones over A, G and D",
      goal: "Play the triads of A, G and D one note at a time, and licks that end on each chord's root, over the I, flat VII, IV progression of classic rock.",
      why: "A, G, D is the most common chord change in classic rock: I, flat VII, IV. The box works over it, and this is why: A, G and D are the roots, and the box holds all three. Knowing the triad under each bar lets a solo follow the changes instead of drifting over them.",
      howTo: [
        "A is A, C#, E. G is G, B, D. D is D, F#, A. The notes that change are the thirds: C#, B and F#.",
        "A mixolydian, A B C# D E F# G, holds every note of all three chords. Licks in this Step use it.",
        "Aim for the root at the end of each lick, and hear it match the bass.",
      ],
      payoff: "A four-bar line that follows A, G, D and A, and sounds like it knows where the band is.",
      difficultyException:
        "The rate eases so the ear can follow a chord change every bar, which is the new demand here.",
      exercises: [
        {
          id: "arpeggios",
          title: "The A, G and D triads",
          purpose: "Each chord's three notes, up and down the top four strings, one bar each, then home to A.",
          howTo: [
            "Straight eighths, 70 BPM up to a pass at 100.",
            "A: frets 7, 6, 5, 5 from the D string up and back. G: the same shape two frets lower, 5, 4, 3, 3. D: F# at 4 and A at 7 on the D string, D at 7 on the G, F# at 7 on the B, A at 5 on the high E, and back. Then A.",
          ],
          coach: "Every note here is a chord tone, and I check each one and its time after the take.",
          vary: inKeys({ tab: ARPEGGIOS_AGD, keys: ["A", "C", "D", "G"], chords: "A | G | D | A", over: "chordTones", jam: (k) => ROCK(k) }),
          tab: ARPEGGIOS_AGD,
          position: 3,
          shifts: true,
          chords: "A | G | D | A",
          jam: ROCK("A"),
          harmony: { chordTones: true },
          rungs: ladder(70, 120, 10),
          passAt: 100,
          ...lick("straight"),
          minutes: 5,
        },
        {
          id: "to-the-root",
          title: "A lick to each root",
          purpose: "Four short licks, one a chord, each ending on that chord's root: A, G, D and A. The line follows the bass without playing it.",
          howTo: [
            "Straight eighths, then a half note, 70 BPM up to a pass at 100.",
            "A: E, D, C#, B, then A on the D string. G: D, B, A, B, then G at 5 on the D string. D: F#, A, F#, E, then D at 7 on the G. A: C#, E, D, C#, then A.",
          ],
          coach: "Written notes over the changes: right notes and time, after the take.",
          vary: inKeys({ tab: ROOTS_AGD, keys: ["A", "C", "D", "G"], chords: "A | G | D | A", scale: "mixolydian", over: "scaleOverChords", jam: (k) => ROCK(k) }),
          tab: ROOTS_AGD,
          position: 4,
          shifts: true,
          chords: "A | G | D | A",
          jam: ROCK("A"),
          harmony: { scaleOverChords: ["A", "mixolydian"] },
          rungs: ladder(70, 120, 10),
          passAt: 100,
          ...lick("straight"),
          minutes: 5,
        },
        {
          id: "thirds-line",
          title: "The thirds: C#, B, F#",
          purpose: "One note a bar, the third of each chord: C# over A, B over G, F# over D. The notes that tell major chords apart, in a single slow line.",
          howTo: [
            "Whole notes, one a bar, 60 BPM up to a pass at 80.",
            "C# at 6 on the G string, B at 4 on the G string, F# at 7 on the B string, C# again. Hear each one turn the chord major.",
          ],
          coach: "Four notes, each the third of its chord: I check them and their time.",
          tab: "/1 3:6 | 3:4 | 2:7 | 3:6",
          position: 4,
          chords: "A | G | D | A",
          jam: ROCK("A"),
          harmony: { chordTones: true },
          rungs: ladder(60, 100, 10),
          passAt: 80,
          ...lick("straight"),
          minutes: 3,
        },
        {
          id: "land-on-roots",
          title: "Your turn: land on each root",
          purpose: "Over A, G, D, A, make up a lick in each bar that finishes on that chord's root, or on its third if you're feeling brave.",
          howTo: [
            "Straight eighths, 70 to 100 BPM.",
            "Use A mixolydian. The written licks are an example of how it could go.",
            NOT_CHECKED_YET,
          ],
          coach: "Not checked yet. Record it and listen to the end of each bar.",
          tab: ROOTS_AGD,
          position: 4,
          shifts: true,
          chords: "A | G | D | A",
          jam: ROCK("A"),
          rungs: ladder(70, 100, 10),
          ...YOUR_TURN,
          selfCheck: [
            "Did each bar end on its chord's root or third?",
            "Did the line still sound like one solo, not four licks?",
          ],
          minutes: 4,
        },
      ],
    },
    {
      id: "melody",
      title: "Phrasing a slow melody",
      goal: "Play a slow, long-note melody over a ballad, in the style of the great melodic soloists, with every note placed and held.",
      why: "The most memorable rock solos are melodies you can sing, with few notes, each one held, bent and shaken. Playing slowly is harder than playing fast: every note is exposed, and the gaps are as loud as the notes. This Step is about choosing to play less.",
      howTo: [
        "Hold every long note for its full value. Count it.",
        "Add vibrato only once the note has sounded steady for a moment, and keep it even: the same width and speed on every note.",
        "A bend is a vocal slide: it should arrive at its pitch and stay there. Your ear judges it; the app doesn't measure bends.",
      ],
      payoff: "Four bars that someone could hum after hearing them once.",
      difficultyException:
        "Long notes at a slow tempo bring the rate right down. Control of every held note is the demand, which a rate can't count.",
      exercises: [
        {
          id: "long-notes",
          title: "A melody of long notes",
          purpose: "Four bars over Em, C, G and D: a long B, then E over C, G over G, and a whole bar of D. Each long note is a chord tone of its bar.",
          howTo: [
            "Dotted half notes, half notes and eighths, 56 BPM up to a pass at 64, over a slow ballad beat.",
            "Box 1 of E minor at fret 12. Bar 1: B at 12 on the B string for three beats, then D and E. Bar 2: E at 12 on the high E for two beats, D, B. Bar 3: G at 12 on the G string, then B and D. Bar 4: D at 15 on the B string, held for the whole bar.",
            "Vibrato on each long note, after it has sounded steady.",
          ],
          coach: "Written notes: I check each one and its time, with a timing bar that leaves room to lay back. Your vibrato is your ear's.",
          tab: "/2. 2:12v /8 2:15 1:12 | /2 1:12v /4 2:15 2:12 | /2. 3:12v /8 2:12 2:15 | /1 2:15v",
          position: 12,
          chords: "Em | C | G | D",
          jam: BALLAD,
          harmony: { scaleOverChords: ["E", "minorPentatonic"] },
          rungs: ladder(56, 76, 4),
          passAt: 64,
          ...lick("slow"),
          selfCheck: ["Did every vibrato have the same width and speed?", "Did each long note last its full length?"],
          minutes: 5,
        },
        {
          id: "bent-melody",
          title: "The melody with bends",
          purpose: "The same kind of melody, now with whole-step bends that sing: A bent up to B over Em, and again over G and D. The bends are what make it a voice.",
          howTo: [
            "Half notes and quarters, 56 BPM up to a pass at 64.",
            "Bar 1: A at 14 on the G string bent up a whole step to B, with vibrato, then B and D on the B string. Bar 2: E at 12 on the high E for three beats, then C on the B string. Bar 3: G, then A bent to B, then B. Bar 4: D, then A bent to B with vibrato.",
            "Play the target B at 12 on the B string first, then bend to match it.",
          ],
          coach: "I time the bends and count them heard. How far they travel, and the vibrato, are on your ear.",
          tab: "/2 3:14b2v /4 2:12 2:15 | /2. 1:12v /4 2:13 | /2 3:12v /4 3:14b2 2:12 | /2 2:15v /2 3:14b2v",
          position: 12,
          chords: "Em | C | G | D",
          jam: BALLAD,
          harmony: { scaleOverChords: ["E", "minorPentatonic"], allowed: ["C"] },
          rungs: ladder(56, 76, 4),
          passAt: 64,
          ...bendsTimed(),
          selfCheck: [
            "Did each bend reach the B you played first, and stay there?",
            "Was the vibrato on the bent notes as even as on the fretted ones?",
          ],
          minutes: 5,
        },
        {
          id: "one-note",
          title: "Your turn: one note, five ways",
          purpose: "One note, B at fret 12 on the B string, played five ways in a row: plain, with slow vibrato, with fast vibrato, bent up to from A, and slid into from a fret below. Choose the one that sings.",
          howTo: [
            "Whole notes, one way per bar, 56 to 64 BPM.",
            "Listen to each one against the band's Em. The written line is the plain version.",
            NOT_CHECKED_YET,
          ],
          coach: "Not checked yet: vibrato and bends are yours to judge. Record it and listen back.",
          tab: "/1 2:12 | 2:12v | 2:12v | 3:14b2 | 2:12",
          position: 12,
          chords: "Em | Em | Em | Em | Em",
          jam: BALLAD,
          rungs: ladder(56, 64, 4),
          ...YOUR_TURN,
          selfCheck: [
            "Could you hear a difference between the slow and the fast vibrato?",
            "Which of the five would you put in a solo?",
          ],
          minutes: 4,
        },
      ],
    },
    {
      id: "call-response",
      title: "Call and response with the band",
      goal: "Answer a riff or a lick with a written reply, in time with a rock groove.",
      why: "Rock solos talk to the riff: the riff states something and the guitar answers it, or one lick asks and the next replies. Answering in time, with the right length and the right ending, is what makes a solo sound like part of the song and not something laid on top of it.",
      howTo: [
        "Hear the whole call, then answer. Your answer is the same length as the call: two bars.",
        "Start your answer on the beat after the call ends, not before.",
        "End the answer somewhere different from the call: that's what makes it a reply.",
      ],
      payoff: "Four bars that sound like a guitarist answering the band.",
      difficultyException:
        "Half the bars are the call, which the app plays, so the rate halves. Listening and answering in time is the demand.",
      exercises: [
        {
          id: "answer-the-lick",
          title: "Answer the lick",
          purpose: "The app plays a two-bar lick; you answer with a written one that starts lower and ends on the low A. Twice, with two different answers.",
          howTo: [
            "Straight eighths and sixteenths, 60 BPM up to a pass at 85. Bars 1 and 2, and 5 and 6, are the call.",
            "Answer 1 (bars 3 and 4): D, C, D, A, C, then G, A, D, E and the low A. Answer 2 (bars 7 and 8): G, E, D, C twice as sixteenths, then D and A, then G and A.",
          ],
          coach: "Written answers: I check their notes and time after the take.",
          tab: `${REST_BARS} | /8 3:7 3:5 3:7 4:7 /4 3:5 r | /8 4:5 4:7 5:5 5:7 /2 6:5 | ${REST_BARS} | /16 2:8 2:5 3:7 3:5 2:8 2:5 3:7 3:5 /4 3:7 4:7 | /2 4:5 /2 4:7`,
          guide: `${LICK_CALL} | ${REST_BARS} | ${LICK_CALL} | ${REST_BARS}`,
          position: 5,
          chords: "A5 | A5 | A5 | A5 | A5 | A5 | A5 | A5",
          jam: ROCK("A minor"),
          harmony: { scale: ["A", "minorPentatonic"] },
          rungs: ladder(60, 100, 5),
          passAt: 85,
          ...lick("straight"),
          feedbackNote: "The call is a guide part the app does not play yet, so it is in the tab for now.",
          minutes: 5,
        },
        {
          id: "answer-in-major",
          title: "Answer in the major",
          purpose: "The call is minor; your answer is the same shape in the major box. Over an A chord, the answer brightens the question.",
          howTo: [
            "Straight eighths and quarters, 60 BPM up to a pass at 85. Bars 1 and 2 are the call.",
            "Your answer, first finger on fret 4: E, F#, A, B, A held; then F#, E, and C# at 6 on the G string, held.",
          ],
          coach: "A written answer: I check its notes and time.",
          tab: `${REST_BARS} | /8 2:5 2:7 1:5 1:7 /2 1:5 | /4 2:7 2:5 /2 3:6`,
          guide: `/8 2:5 2:8 1:5 1:8 /2 1:5 | /4 2:8 2:5 /2 3:7 | ${REST_BARS}`,
          position: 4,
          chords: "A | A | A | A",
          jam: ROCK("A"),
          harmony: { scale: ["A", "majorPentatonic"] },
          rungs: ladder(60, 100, 5),
          passAt: 85,
          ...lick("straight"),
          feedbackNote: "The call is a guide part the app does not play yet, so it is in the tab for now.",
          minutes: 5,
        },
        {
          id: "answer-the-riff",
          title: "Answer the riff",
          purpose: "The app plays the root riff from Step 1; you answer it high on the neck with a written lick. Low and heavy, then high and singing.",
          howTo: [
            "Sixteenths, eighths and a half note, 60 BPM up to a pass at 85. Bars 1 and 2 are the riff.",
            "Bar 3: A, G, E, D on the top strings twice as sixteenths, then E held. Bar 4: D, C, A, G, and A held.",
          ],
          coach: "A written answer: right notes and time after the take.",
          tab: `${REST_BARS} | /16 1:5 2:8 2:5 3:7 1:5 2:8 2:5 3:7 /2 2:5 | /8 3:7 3:5 4:7 4:5 /2 4:7`,
          guide: `${RIFF_CALL} | ${REST_BARS}`,
          position: 5,
          chords: "A5 | A5 | A5 | A5",
          jam: ROCK("A minor"),
          harmony: { scale: ["A", "minorPentatonic"] },
          rungs: ladder(60, 100, 5),
          passAt: 85,
          ...lick("straight"),
          feedbackNote: "The riff is a guide part the app does not play yet, so it is in the tab for now.",
          minutes: 5,
        },
        {
          id: "free-answers",
          title: "Free answers",
          purpose: "The app calls, you answer however you like, and nothing is graded. Trade with the band until it feels like a conversation.",
          howTo: ["Straight time, 60 to 90 BPM. Answer every call with two bars of your own.", "Try a short answer, then a long one, then a riff."],
          coach: "No marks on this one. Record it if you want to hear it back.",
          tab: `${REST_BARS} | /8 3:7 3:5 3:7 4:7 /4 3:5 r | /8 4:5 4:7 5:5 5:7 /2 6:5`,
          guide: `${LICK_CALL} | ${REST_BARS}`,
          position: 5,
          chords: "A5 | A5 | A5 | A5",
          jam: ROCK("A minor"),
          rungs: ladder(60, 90, 10),
          grade: "practiceOnly",
          minutes: 4,
        },
      ],
    },
    {
      id: "solo-etude",
      title: "A sixteen-bar solo",
      goal: "Play a sixteen-bar written solo with the band, from the first note to the last, then play one of your own.",
      why: "Everything in this Path, in one solo: a riff-like opening, a sixteenth-note run, double stops, the three-note repeat, and a low ending on the V chord that sends the band back to the top. Learning a whole solo teaches shape: where it starts, where it builds, where it breathes.",
      howTo: [
        "Learn it in halves, then join them. Bars 1 to 8 are over A5, G5 and D5; bars 9 to 16 climb through F5 and G5 to the peak, and come down over E5.",
        "Keep your hand in box 1 the whole way: first finger on fret 5.",
        "Count the rests in bars 3 and 16. The band fills them.",
      ],
      payoff: "A whole solo, played with a band, that you could play at a jam tomorrow.",
      exercises: [
        {
          id: "etude-a",
          title: "The solo, bars 1 to 8",
          purpose: "The first half: a rising opening, a double stop, a riff-like answer over G5 and D5, then sixteenths and the way home.",
          howTo: [
            "Straight eighths and sixteenths, 60 BPM up to a pass at 85.",
            "Bar 1 climbs A, C, D, E, G, A. Bar 2 holds the E and A double stop, then G, E, D, C. Bars 3 and 4 answer low. Bars 5 and 6 are the sixteenth runs from Step 2. Bars 7 and 8 come home to the high A.",
          ],
          coach: "Written notes: right notes, notes heard and time over all eight bars, after the take.",
          tab: etude(0, 8),
          position: 5,
          chords: etudeChords(0, 8),
          jam: ROCK("A minor"),
          harmony: { scaleOverChords: ["A", "minorPentatonic"] },
          rungs: ladder(60, 100, 5),
          passAt: 85,
          ...lick("straight", 8),
          minutes: 6,
        },
        {
          id: "etude-b",
          title: "The solo, bars 9 to 16",
          purpose: "The second half: C and G repeated over F5 and G5, the three-note triplet repeat at the peak, double stops, and the low run down to E.",
          howTo: [
            "Straight eighths, triplets and a double stop, 60 BPM up to a pass at 85.",
            "Bars 9 and 10: C, A, G twice, then G, E, D twice. Bar 11: the triplet repeat A, G, E. Bar 12: two double stops, then G, E, D, C. Bars 13 to 15 come down the box to the low strings, and bar 16 holds E.",
          ],
          coach: "Written notes: right notes, notes heard and time over all eight bars.",
          tab: etude(8, 16),
          position: 5,
          chords: etudeChords(8, 16),
          jam: ROCK("A minor"),
          harmony: { scaleOverChords: ["A", "minorPentatonic"] },
          rungs: ladder(60, 100, 5),
          passAt: 85,
          ...lick("straight", 8),
          minutes: 6,
        },
        {
          id: "etude",
          title: "The whole solo, with the band",
          purpose: "All sixteen bars, start to finish, with the band. The finale of the Path.",
          howTo: [
            "Straight eighths, sixteenths and triplets, 60 BPM up to a pass at 85.",
            "Join the halves without a gap: bar 8's high A leads straight into bar 9's C. Breathe in bar 16 and go round again.",
          ],
          coach: "All sixteen bars are checked for right notes, notes heard and time after the take. Getting through the whole thing is the win.",
          tab: etude(0, 16),
          position: 5,
          chords: etudeChords(0, 16),
          jam: ROCK("A minor"),
          harmony: { scaleOverChords: ["A", "minorPentatonic"] },
          rungs: ladder(60, 100, 5),
          passAt: 85,
          ...lick("straight", 16),
          minutes: 7,
        },
        {
          id: "your-solo",
          title: "Your turn: your own sixteen bars",
          purpose: "The same sixteen bars of chords, and a solo of your own. Borrow from the etude, from any Step, or from nowhere.",
          howTo: [
            "Straight time, 60 to 90 BPM, sixteen bars that loop.",
            "Give it a shape: start low and simple, build to the F5 and G5 in bars 9 and 10, and come down over E5. The written solo is an example.",
            NOT_CHECKED_YET,
          ],
          coach: "Not checked yet. Record it, and listen for where it builds.",
          tab: etude(0, 16),
          position: 5,
          chords: etudeChords(0, 16),
          jam: ROCK("A minor"),
          rungs: ladder(60, 90, 10),
          ...YOUR_TURN,
          selfCheck: [
            "Did your solo have a beginning, a peak and an ending?",
            "Did you stay with the band through all sixteen bars?",
          ],
          minutes: 6,
        },
      ],
    },
  ],
  levels: [
    {
      id: "beginner",
      title: "Beginner: riffs, the box and its major twin",
      summary: "Riffs in time with a band, the minor pentatonic box and its classic licks, and the major pentatonic.",
      startHereIf: [
        "You can play power chords and single notes cleanly at 80 BPM eighths.",
        "You don't yet know a rock lick you could play over a band.",
        "You couldn't say which notes change between minor and major pentatonic.",
      ],
      steps: ["riffs", "box-extension", "major-pentatonic"],
      warmups: [
        {
          id: "riff-around",
          title: "The root riff round the chords",
          purpose: "One bar of the root riff on A, D, E and A, in a new key each time: a warm-up that is already rock.",
          howTo: ["Straight eighths, well under your clean tempo. Move the hand at each bar line and keep the palm mute."],
          coach: "This is a warm-up. It tells you how it went, and it decides nothing.",
          vary: {
            values: { key: ["A", "B", "C", "D", "E", "G"] },
            pooled: ["key"],
            label: (p) => `In ${p.key}`,
            build: (p) => {
              const bar = "/8 6:5m 6:5m 6:8 6:5m 5:5 6:5m 6:8 6:7";
              const shift = KEY_SHIFT[p.key];
              const tab = [0, 5, 7, 0].map((up) => shiftFrets(bar, shift + up)).join(" | ");
              return { tab, position: handAt(tab), shifts: true, chords: moveChart("A5 | D5 | E5 | A5", shift) };
            },
          },
          grade: "warmup",
          warmup: { start: 0.65, top: 0.85, reference: "riffs.root-riff", fallback: 80 },
          rungs: ladder(70, 110, 10),
          minutes: 3,
        },
      ],
    },
    {
      id: "intermediate",
      title: "Intermediate: loops, double stops and the changes",
      summary: "Repeating licks, rock and roll double stops, chord embellishment, and chord tones over A, G and D.",
      startHereIf: [
        "You can play box 1 of A minor pentatonic from memory at 90 BPM eighths.",
        "You can play a sixteenth-note lick in the box at 80 BPM.",
        "Your solos stay in one box and don't follow the chords.",
      ],
      steps: ["repeating-licks", "double-stops", "embellishment", "chord-tones"],
      warmups: [
        {
          id: "loop-around",
          title: "The pull-off loop round the chords",
          purpose: "The triplet pull-off loop, moved to follow A, D, E and A, in a new key each time.",
          howTo: ["Eighth-note triplets, well under your clean tempo. Pick, pull, pick, and move at each bar line."],
          coach: "This is a warm-up. It tells you how it went, and it decides nothing.",
          vary: {
            values: { key: ["A", "B", "C", "D", "E", "G"] },
            pooled: ["key"],
            label: (p) => `In ${p.key}`,
            build: (p) => {
              const bar = "/8t 2:8 2:5p 3:7 2:8 2:5p 3:7 2:8 2:5p 3:7 2:8 2:5p 3:7";
              const shift = KEY_SHIFT[p.key];
              const tab = [0, 5, 7, 0].map((up) => shiftFrets(bar, shift + up)).join(" | ");
              return { tab, position: handAt(tab), shifts: true, chords: moveChart("A5 | D5 | E5 | A5", shift) };
            },
          },
          grade: "warmup",
          warmup: { start: 0.65, top: 0.85, reference: "repeating-licks.pulloff-loop", fallback: 80 },
          rungs: ladder(70, 100, 10),
          minutes: 3,
        },
      ],
    },
    {
      id: "advanced",
      title: "Advanced: melody, conversation and a whole solo",
      summary: "A slow melody with bends and vibrato, call and response with the band, and a sixteen-bar written solo.",
      startHereIf: [
        "You can play chord tones over A, G and D at 100 BPM eighths.",
        "You can bend a whole step to pitch by ear and hold it.",
        "Your licks are fine, and your solos don't yet have a shape from start to end.",
      ],
      steps: ["melody", "call-response", "solo-etude"],
      warmups: [
        {
          id: "run-around",
          title: "The sixteenth run round the chords",
          purpose: "Two beats of the descending sixteenth run, moved to follow A, D, E and A, in a new key each time.",
          howTo: ["Straight sixteenths, well under your clean tempo. Move at each bar line."],
          coach: "This is a warm-up. It tells you how it went, and it decides nothing.",
          vary: {
            values: { key: ["A", "B", "C", "D", "E", "G"] },
            pooled: ["key"],
            label: (p) => `In ${p.key}`,
            build: (p) => {
              const bar = "/16 1:5 2:8 2:5 3:7 1:5 2:8 2:5 3:7 /2 2:5";
              const shift = KEY_SHIFT[p.key];
              const tab = [0, 5, 7, 0].map((up) => shiftFrets(bar, shift + up)).join(" | ");
              return { tab, position: handAt(tab), shifts: true, chords: moveChart("A5 | D5 | E5 | A5", shift) };
            },
          },
          grade: "warmup",
          warmup: { start: 0.65, top: 0.85, reference: "solo-etude.etude-a", fallback: 70 },
          rungs: ladder(60, 90, 10),
          minutes: 3,
        },
      ],
    },
  ],
});
