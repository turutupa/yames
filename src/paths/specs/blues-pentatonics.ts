/**
 * Blues and Pentatonics, a Theory Path. A draft: no teacher or guitarist has
 * reviewed it. Mechanics teaches how hands play; this is what you choose to
 * play.
 *
 * Rewritten 2026-11-16 (`plans/tasks/mvp/CONTENT.md`): theory is taught through
 * written licks, phrases and arpeggios, graded on what the app measures today:
 * timing, notes heard, extra notes and right notes. Every written line carries a
 * timing bar, swing-tolerant where it swings. Choosing your own notes, landing on
 * chord tones and bending to pitch are a small "your turn" minority, self-checked
 * and marked "not checked yet", because the graders for them do not exist.
 */
import { definePath } from "../spec";
import type { ExerciseSpec, VariantParams } from "../spec";
import type { PassBar } from "../format";
import { handAt, ladder, moveChart, pentatonic, shiftFrets, swing } from "../templates";

const TWELVE = "A7 | A7 | A7 | A7 | D7 | D7 | A7 | A7 | E7 | D7 | A7 | E7";
const VAMP_A = "A7 | A7 | A7 | A7";

const TEXAS = { groove: "bluesTexas", key: "A blues", feel: "shuffle" } as const;
const SLOW = { groove: "slowBlues", key: "A blues", feel: "shuffle" } as const;

// ---------------------------------------------------------------------------
// Grading. Bars live in profiles.ts; these add the timing bar every written
// line carries. Evenness is a spread around the player's own median, so a
// constant lean behind the beat costs nothing; what a lower bar forgives is a
// swing that is lighter or heavier than the written triplet.
// ---------------------------------------------------------------------------

type Grading = Pick<ExerciseSpec, "grade" | "alsoGraded" | "pass">;

/** How tight the timing bar is: tighter on the easy Steps, looser where it swings. */
const EVENNESS = { early: 0.8, straight: 0.75, shuffle: 0.6, slow: 0.5 } as const;

function lick(feel: keyof typeof EVENNESS, overBars = 4): Grading {
  const bars: PassBar[] = [
    { metric: "noteIdentity", min: 0.9, overBars },
    { metric: "notesHeard", min: 0.9, overBars },
    { metric: "extraNotes", max: 4, overBars: 4 },
    { metric: "timingEvenness", min: EVENNESS[feel], overBars },
  ];
  return { grade: "written", alsoGraded: ["timingEvenness"], pass: bars };
}

/** Bends: timed and heard, never pitch-checked. A bent note reads as a wrong one. */
function bendsTimed(): Grading {
  return {
    grade: "attacksOnly",
    alsoGraded: ["timingEvenness"],
    pass: [
      { metric: "notesHeard", min: 0.9, overBars: 4 },
      { metric: "extraNotes", max: 4, overBars: 4 },
      { metric: "timingEvenness", min: EVENNESS.shuffle, overBars: 4 },
    ],
  };
}

/** "Your turn": the player chooses. Nothing here is measured yet, and it says so. */
const YOUR_TURN = { grade: "selfChecked", example: true } as const;

/** Shuffle eighths: a long note and a short one, on the triplet grid. */
function sh(notes: string): string {
  return notes
    .trim()
    .split(/\s+/)
    .map((note, index) => `${index % 2 === 0 ? "/4t" : "/8t"} ${note}`)
    .join(" ");
}

// A boogie line per chord, all chord tones and the sixth.
const walkA = sh("6:5 6:9 5:7 5:9 5:10 5:9 5:7 6:9");
const walkD = sh("5:5 5:9 4:7 4:9 4:10 4:9 4:7 5:9");
const walkE = sh("5:7 5:11 4:9 4:11 4:12 4:11 4:9 5:11");

// A slow chorus, written. Its two bends are unison bends: the bent G string
// sounds with the fretted B string, so they are double stops, which the right
// notes check leaves alone, and every single note around them is checked.
const SLOW_CHORUS = `
  /2 1:5v /4 r /8t 1:8 1:5 2:8 |
  /2 2:5v /4 3:7b2+2:5 /8t 3:5 3:7 3:5 |
  /2 4:7v /2 r |
  /2 r /4 r /8t 3:5 3:6h 2:5 |
  /2 3:7v /4 2:8b2+1:5 /8t 2:8 2:5 3:7 |
  /2 3:5v /2 r |
  /2 2:5v /4 3:7b2+2:5 /8t 3:5 3:7 3:5 |
  /2 4:7v /4 r /8t 4:7 3:5 3:7 |
  /2 2:5v /4 3:7b2+2:5 /8t 3:7 3:5 4:7 |
  /2 4:7v /4 3:7 /8t 3:5 3:7 3:5 |
  /4 3:9 3:8 3:7 3:6 |
  /2 2:5 4:6`;

const SPARSE_CHORUS = `
  /2 1:5v /4 r /8t 1:8 1:5 2:8 |
  /2 2:5v /4 r /8t 3:7 3:5 4:7 |
  /1 r |
  /2 r /4 r /8t 4:7 3:5 3:7 |
  /2 3:7v /4 r /8t 1:8 1:5 2:8 |
  /2 3:5v /4 r /8t 2:8 2:5 3:7 |
  /1 r |
  /2 r /4 r /8t 3:5 3:6h 2:5 |
  /2 2:5v /4 r /8t 3:7 3:5 4:7 |
  /2 3:7v /4 r /8t 3:5 3:7 3:5 |
  /2 4:7v /4 r /8t 4:5 4:7 3:5 |
  /2 4:6 /2 r`;

const CALL_A = `/8 1:5 2:8 /4 2:5 3:7 3:5 | /4 4:7 /4 r /2 r`;
const REST_BARS = `/1 r | /1 r`;

// Four written answers to that one call: the root, the fifth, the flat seven,
// and the high blue third. Same length as the call, each a different ending.
const ANSWERS = [
  `/8 2:5 3:7 /4 3:5 4:7 4:5 | /2 4:7 /2 r`,
  `/8 1:8 1:5 /4 2:8 1:5 2:8 | /2 2:5 /2 r`,
  `/4 3:7 /8 3:5 4:7 /4 3:5 r | /2 4:5 /2 r`,
  `/8 3:5 3:7 /4 2:5 2:8 1:5 | /2 1:8 /2 r`,
];

const THE_QUESTION = `/8 1:5 2:8 /4 2:5 3:7 /4 2:8 | /2 2:8v /2 r`;
const THE_ANSWER = `/8 1:5 2:8 /4 2:5 3:7 /8 3:5 3:7 | /2 4:7v /2 r`;

// A whole written chorus in box 1: say it, say it again over D7, answer it.
const WRITTEN_CHORUS = [
  "/8 1:5 1:8 1:5 2:8 /4 2:5 3:7",
  "/2 4:7 /2 r",
  "/8 1:5 1:8 1:5 2:8 /4 2:5 3:7",
  "/4 3:6 2:5 /2 4:7",
  "/8 1:5 1:8 1:5 2:8 /4 2:5 3:7",
  "/2 3:7 /2 r",
  "/8 2:5 3:7 3:5 3:7 /4 3:5 4:7",
  "/2 6:5 /2 r",
  "/8 2:5 2:8 2:5 3:7 /4 2:5 r",
  "/8 3:7 3:5 4:7 3:5 /4 3:7 r",
  "/8 4:7 3:5 4:7 4:5 /2 4:7",
  "/2 5:7 /2 r",
].join(" | ");

const KEY_SHIFT: Readonly<Record<string, number>> = { A: 0, B: 2, C: 3, D: 5, E: -5, G: -2 };

/** The same written line, moved to other keys. The harmony moves with it. */
function inKeys(tab: string, chart: string | undefined, scale: string | undefined, keys: readonly string[], allowed: string[] = []) {
  return {
    values: { key: keys },
    pooled: ["key"] as const,
    label: (p: VariantParams) => `In ${p.key}`,
    build: (p: VariantParams) => {
      const shift = KEY_SHIFT[p.key];
      const moved = shiftFrets(tab, shift);
      const movedAllowed = allowed.map((n) => moveChart(n, shift).trim());
      return {
        tab: moved,
        position: handAt(moved),
        shifts: true,
        ...(chart
          ? {
              chords: moveChart(chart, shift),
              jam: { groove: "bluesTexas", key: `${p.key} blues`, feel: "shuffle" as const },
            }
          : {}),
        ...(scale
          ? {
              harmony: chart
                ? { scaleOverChords: [p.key, scale] as [string, string], allowed: movedAllowed }
                : { scale: [p.key, scale] as [string, string], cover: true },
            }
          : {}),
      };
    },
  };
}

const NOT_CHECKED_YET =
  "Your turn, and not checked yet: the app can't judge notes you choose, so you tick it off yourself.";

export default definePath({
  id: "blues-pentatonics",
  title: "Blues and Pentatonics",
  kind: "theory",
  goal: "Solo over a twelve-bar blues in A, knowing where the changes are and landing on notes that belong to them.",
  level: "early-intermediate",
  assumes:
    "You know the open chords and can fret and pick single notes, and you can play eighth notes with a click at 70 BPM. Nothing about scales or blues is assumed. The early Exercises are all in A, on purpose, so that theory is the only new thing; later ones move to other keys.",
  prerequisites: { skills: ["Clean single notes", "Eighth notes with a click at 70 BPM"] },
  orderRationale:
    "Theory arrives as written lines you can be graded on, and choosing your own notes comes after, as a short 'your turn' at the end of a Step. Chord tones arrive in Step 2 as arpeggios of A7, D7 and E7 in box 1, each followed by a lick that ends on the chord's third, before the blue notes: knowing where the chord is matters more than knowing an extra note. Call and response is Step 3 because written answers to one call teach phrase length and endings with almost no theory. The blues scale and bends come after the player can find the chord tones, so neither becomes a thing to sit on. A second box comes late on purpose: more notes before good choices makes for faster bad solos. Guide tones are Step 9 because they are the most abstract idea here and easiest once the form is in the ear. Slow blues comes last as it hides nothing.",
  gradingLimits:
    "Graded Exercises are written lines: the app checks timing evenness, notes heard and extra notes, and right notes after the take where the notes are single, far enough apart and not ringing into each other; elsewhere right notes read 'not checked'. Timing over the shuffle band is judged against the written triplet with a looser bar, so a lighter or heavier swing is not marked down, and a constant lean behind the beat costs nothing at all. The right-note check has only been tried on computer-made guitar sound with no band in the mix, so direct input or headphones are the honest way to play anything with a band; with a microphone and speakers it is untested. A bent note would read as a wrong one, so bends are timed and never pitch-checked: the unison bends are double stops, which the note check leaves alone. Landing on chord tones, staying in the scale, keeping rests and choosing your own notes are not measured today: those Exercises are 'your turn', self-checked and labelled 'not checked yet'. Nothing here grades feel.",
  steps: [
    {
      id: "box-one",
      title: "Pentatonic box 1",
      goal: "Play the A minor pentatonic box from memory, find its three A's, and make a first lick out of it.",
      why: "These five notes are most of the blues and rock you've ever heard. Learning one box well, and knowing which note is the root, gets you playing over a band today. Without the roots, the box is a pattern: with them, it's a map you can navigate.",
      howTo: [
        "First finger stays on fret 5, one finger per fret. The notes are A, C, D, E, G, and every string uses two of them.",
        "Say the note names as you go up, at least the A's: fret 5 on the low E, fret 7 on the D string, fret 5 on the high E.",
        "Let a note ring until the next one starts, and damp strings you aren't using with the side of your picking hand.",
      ],
      payoff: "You can play a two-bar lick over an A7 shuffle and it sounds like blues straight away.",
      exercises: [
        {
          id: "box-eighths",
          title: "Box 1, up and down",
          purpose: "Put the shape in the hand, with every note where it's meant to be and every note on the click.",
          howTo: [
            "Straight eighth notes, two to a click, 60 BPM up to a pass at 80.",
            "All six strings up from the low A at fret 5 and back down, first finger on fret 5, third or fourth finger on the upper note. Say the A's out loud.",
          ],
          coach: "Right notes and even eighths are what this asks. Tempo isn't the point yet.",
          tab: `/8 ${pentatonic({ root: "A", box: 1, sequence: "updown" })} hold`,
          position: 5,
          harmony: { scale: ["A", "minorPentatonic"], cover: true },
          click: 2,
          rungs: ladder(60, 110, 10),
          passAt: 80,
          ...lick("early"),
          minutes: 5,
        },
        {
          id: "three-as",
          title: "Find the three A's",
          purpose: "The root is home. Every phrase you make will be judged by your ear against it, so you must be able to find it without looking.",
          howTo: [
            "Half notes, two to a bar, 60 BPM up to a pass at 80.",
            "Low E fret 5, D string fret 7, high E fret 5, then back to the D string. Let each one ring for its two beats, and listen to how the same note changes across octaves.",
          ],
          coach: "Four right notes, each on its beat, is all this asks.",
          tab: `/2 6:5 4:7 | 1:5 4:7`,
          position: 5,
          harmony: { scale: ["A", "minorPentatonic"] },
          rungs: ladder(60, 100, 10),
          passAt: 80,
          ...lick("early"),
          minutes: 3,
        },
        {
          id: "first-phrase",
          title: "A first phrase",
          purpose: "Five notes and a rest, with a beginning and an end. Hearing yourself play a phrase rather than a scale is the payoff of this Step.",
          howTo: [
            "Straight eighths then quarters, 60 BPM up to a pass at 80.",
            "A and G as eighths, then E, D and C as quarters, then the low A on the D string. Leave the silence in the second bar alone: it is part of the phrase.",
          ],
          coach: "Short and written: right notes and steady time. The rest is your ear's job.",
          tab: CALL_A,
          position: 5,
          harmony: { scale: ["A", "minorPentatonic"] },
          click: 2,
          rungs: ladder(60, 100, 10),
          passAt: 80,
          ...lick("early"),
          minutes: 4,
        },
        {
          id: "first-lick",
          title: "Your first lick over A7",
          purpose: "A written two-bar lick over the shuffle band: down the box from the top A, then home to the A on the D string. The first time the box sounds like a record.",
          howTo: [
            "Shuffle eighths, long-short on the band's triplet, 70 BPM up to a pass at 90.",
            "Bar 1: A, C, A, G, E, D, C, D, from the high E string down to the G string. Bar 2: A on the D string, C, G, and the A again, held for two beats.",
            "Swing it the way the drummer does. If the long-short feels odd, say 'tri-pl-et' and play on the 'tri' and the 'et'.",
          ],
          coach: "Written notes, so I can check them after the take, and the timing against a shuffle that allows for your own swing.",
          tab: swing(`/8 1:5 1:8 1:5 2:8 2:5 3:7 3:5 3:7 | /4 4:7 /8 3:5 4:5 /2 4:7`),
          position: 5,
          chords: "A7 | A7",
          jam: TEXAS,
          harmony: { scaleOverChords: ["A", "minorPentatonic"] },
          rungs: ladder(70, 110, 10),
          passAt: 90,
          ...lick("shuffle"),
          minutes: 5,
        },
      ],
    },
    {
      id: "landing",
      title: "Chord tones: A7, D7 and E7",
      goal: "Play the arpeggio of each chord of the blues in box 1, and a lick that ends on each chord's third.",
      why: "This is the single biggest step from playing scales to playing changes. A wrong-sounding note is mostly a note that stopped in the wrong place. An arpeggio is the chord one note at a time, so after playing it you know where the chord lives in the box, and a lick that ends on the third says the chord's name out loud.",
      howTo: [
        "A7 is A, C#, E, G. D7 is D, F#, A, C. E7 is E, G#, B, D. The third is the second note of each: C#, F# and G#.",
        "Box 1 has no C#, F# or G#: they sit a fret below or beside its notes. That is why the arpeggios move the hand a little, and why they sound so different from the box.",
        "Aim for the last note first, then get there. Decide on it a beat early.",
      ],
      payoff: "The same box suddenly follows the chords, and you can hear the third land.",
      exercises: [
        {
          id: "root-on-one",
          title: "A on every downbeat",
          purpose: "Written phrases that land on A at every bar line. The feel of arriving, before it becomes a choice.",
          howTo: [
            "Shuffle eighths, 70 BPM up to a pass at 90.",
            "Two beats of A on the D string, then four shuffle eighths that walk away and come back. Land on the next bar line as if it were the point of the whole bar, because it is.",
          ],
          coach: "Written notes, and every one of them lands back on A. I check the notes and the shuffle.",
          tab: swing(`/2 4:7 /8 3:5 3:7 3:5 3:7 | /2 4:7 /8 4:5 3:5 3:7 3:5 | /2 4:7 /8 3:7 2:5 2:8 2:5 | /2 4:7 /8 3:5 3:7 3:5 4:5`),
          position: 5,
          chords: VAMP_A,
          jam: TEXAS,
          harmony: { scaleOverChords: ["A", "minorPentatonic"] },
          rungs: ladder(70, 110, 10),
          passAt: 90,
          ...lick("shuffle"),
          minutes: 5,
        },
        {
          id: "a7-arpeggio",
          title: "The A7 arpeggio, and a lick to C#",
          purpose: "A7 one note at a time from the low root, then a lick that comes down the box and resolves from C to C#: the blue third to the chord's own third.",
          howTo: [
            "Shuffle eighths, then a half note, 60 BPM up to a pass at 80.",
            "Bar 1, up: A at fret 5 on the low E (second finger), C# at fret 4 on the A string (first finger), E at 7, G at 5 and A at 7 on the D string, C# at 6 on the G string, E at 5 and G at 8 on the B string. Let the hand move up a fret after the C# on the G string, so the fourth finger reaches fret 8 without a stretch.",
            "Bar 2: G, E, D, C, then C# at fret 6 on the G string for two beats. That half step from C to C# is the sound of the blues resolving.",
          ],
          coach: "A written arpeggio and lick: I check each note and the timing after the take.",
          tab: swing(`/8 6:5 5:4 5:7 4:5 4:7 3:6 2:5 2:8 | /8 2:8 2:5 3:7 3:5 /2 3:6`),
          position: 4,
          shifts: true,
          chords: "A7 | A7",
          jam: TEXAS,
          harmony: { scaleOverChords: ["A", "minorPentatonic"], allowed: ["C#"] },
          rungs: ladder(60, 100, 10),
          passAt: 80,
          ...lick("shuffle"),
          minutes: 5,
        },
        {
          id: "d7-arpeggio",
          title: "The D7 arpeggio, and a lick to F#",
          purpose: "D7 from its root on the A string, then a lick that steps down from G to F#, D7's third. Over the IV chord, that one note is what makes the change audible.",
          howTo: [
            "Shuffle eighths, then a half note, 60 BPM up to a pass at 80.",
            "Bar 1, up: D at fret 5 on the A string, F# at 4 and A at 7 on the D string, C at 5 and D at 7 on the G string, F# at 7 on the B string, A at 5 and C at 8 on the high E. First finger starts on fret 4 for the F#, and the hand moves up a fret for the top two strings.",
            "Bar 2: A, C, A on the high E, G at fret 8 on the B string, then down a fret to F# and hold it.",
          ],
          coach: "Written notes again, checked after the take, with the timing against the shuffle.",
          tab: swing(`/8 5:5 4:4 4:7 3:5 3:7 2:7 1:5 1:8 | /8 1:5 1:8 1:5 2:8 /2 2:7`),
          position: 4,
          shifts: true,
          chords: "D7 | D7",
          jam: TEXAS,
          harmony: { scaleOverChords: ["D", "mixolydian"] },
          rungs: ladder(60, 100, 10),
          passAt: 80,
          ...lick("shuffle"),
          minutes: 5,
        },
        {
          id: "e7-arpeggio",
          title: "The E7 arpeggio, and a lick to G#",
          purpose: "E7 from its root at fret 7 on the A string, a step up the neck, then a lick that ends on G#, the third that pulls the form back home to A.",
          howTo: [
            "Shuffle eighths, then a half note, 60 BPM up to a pass at 80.",
            "Bar 1, up: E at fret 7 on the A string, G# at 6 and B at 9 on the D string, D at 7 and E at 9 on the G string, G# at 9 on the B string, B at 7 and D at 10 on the high E. First finger on fret 6, then up a fret for the top two strings.",
            "Bar 2: B, D, B on the high E, A at 10 on the B string, then down a fret to G# and hold it. It's the D7 lick moved up a tone.",
          ],
          coach: "Written notes, checked after the take, and the timing against the band's shuffle.",
          tab: swing(`/8 5:7 4:6 4:9 3:7 3:9 2:9 1:7 1:10 | /8 1:7 1:10 1:7 2:10 /2 2:9`),
          position: 6,
          shifts: true,
          chords: "E7 | E7",
          jam: TEXAS,
          harmony: { scaleOverChords: ["E", "mixolydian"] },
          rungs: ladder(60, 100, 10),
          passAt: 80,
          ...lick("shuffle"),
          minutes: 5,
        },
        {
          id: "land-any-tone",
          title: "Your turn: land on a chord tone",
          purpose: "Your choice now. Over A7, D7, E7 and A7, make a little phrase in each bar that lands on beat 1 of the next on one of that chord's notes. Anything goes in between.",
          howTo: [
            "Shuffle, 70 to 90 BPM, four bars that loop.",
            "Land on A, C#, E or G over A7; D, F#, A or C over D7; E, G#, B or D over E7. The written line is one way it could go, not a target.",
            NOT_CHECKED_YET,
          ],
          coach: "Not checked yet: landings are yours to judge for now. Record it and listen to beat 1 of each bar.",
          tab: swing(`/2 4:7 /8 3:5 3:7 3:5 3:7 | /2 3:7 /8 3:5 4:7 3:5 3:7 | /2 2:5 /8 3:7 3:5 3:7 2:5 | /2 4:7 /8 3:5 4:7 4:5 3:5`),
          position: 5,
          chords: "A7 | D7 | E7 | A7",
          jam: TEXAS,
          rungs: ladder(70, 90, 5),
          ...YOUR_TURN,
          selfCheck: [
            "On beat 1 of every bar, was your note one of that chord's four?",
            "Did you decide on the landing note before you got there?",
          ],
          minutes: 4,
        },
      ],
    },
    {
      id: "call-response",
      title: "Call and response",
      goal: "Hear a phrase, answer it, and leave space: the conversation that blues is built on.",
      why: "Blues is a conversation, and most beginners only ever talk. Answering a phrase teaches you to phrase in lengths a listener can follow, and it forces you to stop playing. It does more for how you sound, per minute, than any scale you can learn.",
      howTo: [
        "Listen to the whole call before you play. Don't start your answer until it has finished.",
        "Keep your answer about as long as the call. Two bars of question deserves two bars of answer.",
        "Silence is a note. A bar with nothing in it is a decision, and a good one.",
      ],
      payoff: "You can trade two-bar phrases with the app and it sounds like a conversation.",
      difficultyException:
        "The note rate falls because half of these bars are silence; listening and leaving space is the new demand, which is not a rate.",
      exercises: [
        {
          id: "echo",
          title: "Echo",
          purpose: "The app plays a two-bar phrase; you play it back, note for note. Exercising the ear is what this is for.",
          howTo: [
            "Straight eighths and quarters, 60 BPM up to a pass at 80. Bars 1 and 2 are the call, bars 3 and 4 are yours.",
            "Try not to look at the tab. Sing the phrase back before you play it, once, if you can.",
          ],
          coach: "After the take I can say if the echo had the right notes and steady time. It's fine to take a few tries.",
          tab: `${REST_BARS} | ${CALL_A}`,
          guide: `${CALL_A} | ${REST_BARS}`,
          position: 5,
          chords: VAMP_A,
          harmony: { scale: ["A", "minorPentatonic"] },
          click: 2,
          rungs: ladder(60, 100, 10),
          passAt: 80,
          ...lick("straight"),
          feedbackNote: "The app has to play the call: the synth voice can do that, and the Exercise format carries it as a guide part, but nothing wires that up yet, so the call is in the tab for now.",
          minutes: 5,
        },
        {
          id: "four-answers",
          title: "One call, four answers",
          purpose: "The same call four times, and four written answers to it. Each ends somewhere else: on the root, the fifth, the flat seven and the high blue third. Hear what an ending does.",
          howTo: [
            "Straight eighths and quarters, 60 BPM up to a pass at 80. Sixteen bars: call, answer, call, answer.",
            "Answer 1 ends on A (finished). Answer 2 ends on E (open). Answer 3 ends on G (it wants to go on). Answer 4 climbs to the high C (it hangs in the air).",
            "Let each last note ring through its two beats, then stop.",
          ],
          coach: "Four written answers: I check the notes and the time after the take. Which ending you like best is yours.",
          tab: ANSWERS.map((answer) => `${REST_BARS} | ${answer}`).join(" | "),
          guide: ANSWERS.map(() => `${CALL_A} | ${REST_BARS}`).join(" | "),
          position: 5,
          chords: [VAMP_A, VAMP_A, VAMP_A, VAMP_A].join(" | "),
          harmony: { scale: ["A", "minorPentatonic"] },
          click: 2,
          rungs: ladder(60, 100, 10),
          passAt: 80,
          ...lick("straight"),
          feedbackNote: "The calls are a guide part the app does not play yet, so they are in the tab for now.",
          minutes: 6,
        },
        {
          id: "two-on-two-off",
          title: "Two bars on, two bars off",
          purpose: "Over the band, a written phrase for two bars, then two bars of nothing, then another phrase. Most players find the stopping much harder than the playing.",
          howTo: [
            "Shuffle eighths, 70 BPM up to a pass at 90. Eight bars: phrase, rest, phrase, rest.",
            "Count the two silent bars out loud if you have to. Your hands come off the strings, and the band plays on.",
          ],
          coach: "Written phrases, checked for notes and time. A note in the empty bars shows up as an extra note, so leave them empty.",
          tab: swing(`${CALL_A} | ${REST_BARS} | /8 2:5 3:7 /4 3:5 4:7 /8 3:5 3:7 | /2 4:7 /2 r | ${REST_BARS}`),
          position: 5,
          chords: `${VAMP_A} | ${VAMP_A}`,
          jam: TEXAS,
          harmony: { scaleOverChords: ["A", "minorPentatonic"] },
          rungs: ladder(70, 110, 10),
          passAt: 90,
          ...lick("shuffle"),
          minutes: 5,
        },
        {
          id: "free-trade",
          title: "Free trade",
          purpose: "The app calls, you answer however you like. This is the one that sounds most like playing blues with someone. Ungraded, because a good answer isn't something the app can judge.",
          howTo: [
            "Straight time, 60 to 80 BPM. The call is bars 1 and 2, your answer bars 3 and 4.",
            "Answer with whatever comes. Try once with very few notes and once with a lot, and hear which you like better.",
          ],
          coach: "No marks on this one. Enjoy it, and listen back if you recorded.",
          tab: `${REST_BARS} | /8 2:5 3:7 /4 3:5 4:7 3:5 | /4 4:7 /4 r /2 r`,
          guide: `${CALL_A} | ${REST_BARS}`,
          position: 5,
          chords: VAMP_A,
          rungs: ladder(60, 80, 10),
          grade: "practiceOnly",
          minutes: 4,
        },
      ],
    },
    {
      id: "blues-scale",
      title: "The blues scale and the blue notes",
      goal: "Add the flat five as a note to pass through, and hear the third move from C to C#.",
      why: "Two notes turn a scale into the blues. The flat five, Eb in A, sounds wrong on its own and wonderful on its way somewhere else. The blue third, C rubbing against the chord's C#, is the tension the whole style runs on. You've been playing the C already; now you'll hear what it's doing.",
      howTo: [
        "The A blues scale is A, C, D, Eb, E, G. Eb lives at fret 6 on the A string and fret 8 on the G string in this box.",
        "Don't park on the Eb. Walk through it on your way to D or E.",
        "To resolve the blue third, hammer from C to C# with your first and second fingers on the G string.",
      ],
      payoff: "One extra note, and suddenly the lick sounds like the blues rather than a rock scale.",
      exercises: [
        {
          id: "scale",
          title: "A blues scale, box 1",
          purpose: "The box with its one new note, so you can find the Eb without thinking.",
          howTo: [
            "Straight eighths, two to a click, 60 BPM up to a pass at 80.",
            "Up and down. The Eb gives the A string three frets in a row and the G string three as well: first, second and third fingers on the A string, first, third and fourth on the G.",
          ],
          coach: "Right notes and even eighths after the take, the same as before.",
          vary: inKeys(`/8 ${pentatonic({ root: "A", box: 1, scale: "blues", sequence: "updown" })} hold`, undefined, "blues", ["A", "C", "D", "E", "G"]),
          tab: `/8 ${pentatonic({ root: "A", box: 1, scale: "blues", sequence: "updown" })} hold`,
          position: 5,
          harmony: { scale: ["A", "blues"], cover: true },
          click: 2,
          rungs: ladder(60, 110, 10),
          passAt: 80,
          ...lick("straight"),
          minutes: 5,
        },
        {
          id: "passing",
          title: "Passing, not parking",
          purpose: "A lick with the flat five exactly where it belongs: on the way from D to E, and back from E to D.",
          howTo: [
            "Straight eighths, 60 BPM up to a pass at 80.",
            "Bar 1: D, Eb on the G string, E and G on the B string, back to E, then Eb, D and C on the G string. Bar 2: A on the D string, C, A, then the G held for two beats. The Eb never lands.",
          ],
          coach: "The Eb goes by quickly. I check the notes and the time after the take; how it sounds is what you're listening for.",
          tab: `/8 3:7 3:8 2:5 2:8 2:5 3:8 3:7 3:5 | /4 4:7 /8 3:5 4:7 /2 4:5`,
          position: 5,
          harmony: { scale: ["A", "blues"], cover: true },
          click: 2,
          rungs: ladder(60, 110, 10),
          passAt: 80,
          ...lick("straight"),
          minutes: 5,
        },
        {
          id: "blue-third",
          title: "From C to C#",
          purpose: "The sound of the blues in one small move: from minor to major third, landing on the chord's real third.",
          howTo: [
            "Shuffle eighths, 70 BPM up to a pass at 90.",
            "Pick C at fret 5 on the G string and hammer on to fret 6. C# belongs to A7, so this is the chord's own third, then E and A on top.",
          ],
          coach: "A quiet hammer won't count against you, and you can pick it if you prefer. Notes and time are checked after the take.",
          tab: swing(`/4 4:7 /8 3:5 3:6h /4 2:5 /8 1:5 2:5 | /4 4:7 /8 3:5 3:6h /2 2:5`),
          position: 5,
          chords: "A7 | A7",
          jam: TEXAS,
          harmony: { scaleOverChords: ["A", "blues"], allowed: ["C#"] },
          rungs: ladder(70, 110, 10),
          passAt: 90,
          ...lick("shuffle"),
          minutes: 5,
        },
        {
          id: "one-blue-note",
          title: "Your turn: one blue note a phrase",
          purpose: "Free playing with a rule: a single flat five or blue third per phrase, and a chord tone on beat 1. It stops the new notes from taking over.",
          howTo: [
            "Shuffle, 70 to 90 BPM, four bars over A7, A7, D7, A7.",
            "The written line is one way it could go. Use one Eb or one C-to-C# per phrase, and no more.",
            NOT_CHECKED_YET,
          ],
          coach: "Not checked yet. The rule about blue notes is on your honour, and so are the landings.",
          tab: swing(`/2 4:7 /8 3:7 3:8 2:5 2:8 | /2 2:5 /8 3:7 3:5 3:7 2:5 | /2 3:7 /8 3:8 2:5 3:7 3:5 | /2 4:7 /8 3:5 3:6h 2:5 3:7`),
          position: 5,
          chords: "A7 | A7 | D7 | A7",
          jam: TEXAS,
          rungs: ladder(70, 90, 5),
          ...YOUR_TURN,
          selfCheck: [
            "Did each phrase use one blue note, and pass through it rather than stop on it?",
            "Did beat 1 of each bar land on a note of the chord?",
          ],
          minutes: 4,
        },
      ],
    },
    {
      id: "twelve-bar",
      title: "Following the 12-bar",
      goal: "Know where you are in the form without counting bars, and hear the turnaround coming.",
      why: "Losing your place is the number one bedroom problem. The form is twelve bars: four of A7, two of D7, two of A7, then E7, D7, A7, E7. Once it's in your ear you stop counting and start anticipating, and that's when solos start to have a shape. Playing the bass line is the fastest way there: you can't get lost when you're the one playing it.",
      howTo: [
        "Count the form as 4 + 4 + 4, as the Jam timeline does. Each four is a sentence.",
        "Listen for the bar 9 change to E7. It's the moment the form really moves.",
        "Bars 11 and 12 are the turnaround: they exist only to bring you back to the top.",
      ],
      payoff: "You hear the changes coming, and you can play a whole written chorus that brings the form home.",
      exercises: [
        {
          id: "roots",
          title: "One root per bar, all twelve",
          purpose: "As simple as it gets: a whole note on the root of each bar's chord, all the way through the form.",
          howTo: [
            "Whole notes, one a bar, 70 BPM up to a pass at 90.",
            "A at fret 5 on the low E, D at 5 and E at 7 on the A string. Hear each move before you play it. Don't count: listen for the band's change.",
          ],
          coach: "Twelve notes, each the right root, each on the bar. If you got lost, the band will tell you first.",
          tab: swing(`/1 6:5 | 6:5 | 6:5 | 6:5 | 5:5 | 5:5 | 6:5 | 6:5 | 5:7 | 5:5 | 6:5 | 5:7`),
          position: 5,
          chords: TWELVE,
          jam: TEXAS,
          harmony: { chordTones: true, cover: false },
          rungs: ladder(70, 110, 10),
          passAt: 90,
          ...lick("straight"),
          minutes: 4,
        },
        {
          id: "walking",
          title: "The boogie line",
          purpose: "A walking shuffle line through the whole form, so you're playing the changes rather than following them. It is the same shape moved to three roots.",
          howTo: [
            "Shuffle eighths, all twelve bars, 70 BPM up to a pass at 90.",
            "Root, third, fifth, sixth, flat seven, and back down: on A it's frets 5 and 9 on the low E, then 7, 9 and 10 on the A string. It's a stretch from fret 5 to 9, so let the hand move with the chord.",
          ],
          coach: "A lot of notes and the whole form. I report notes and time after the take; getting all the way through is the win.",
          vary: inKeys([walkA, walkA, walkA, walkA, walkD, walkD, walkA, walkA, walkE, walkD, walkA, walkE].join(" | "), TWELVE, undefined, ["A", "C", "E", "G"]),
          tab: swing([
            walkA, walkA, walkA, walkA, walkD, walkD, walkA, walkA, walkE, walkD, walkA, walkE,
          ].join(" | ")),
          position: 5,
          shifts: true,
          chords: TWELVE,
          jam: TEXAS,
          rungs: ladder(70, 110, 10),
          passAt: 90,
          ...lick("shuffle"),
          minutes: 6,
        },
        {
          id: "the-turnaround",
          title: "A turnaround",
          purpose: "Bars 11 and 12: a descending line over the A7, ending on the E7 that sends you back to the top. Every chorus you play will need one.",
          howTo: [
            "Shuffle eighths, 70 BPM up to a pass at 90.",
            "The G on the B string, fret 8, comes back after every note while E, Eb, D and C# step down under it on the G string. Then E on the B string, a rest, and G# and E below: you're home.",
          ],
          coach: "Two bars, and I check the notes and the shuffle after the take. Play it until you can do it without thinking.",
          tab: swing(`${sh("3:9 2:8 3:8 2:8 3:7 2:8 3:6 2:8")} | /4 2:5 /4 r /4 4:6 5:7`),
          position: 6,
          shifts: true,
          chords: "A7 | E7",
          jam: TEXAS,
          harmony: { scaleOverChords: ["A", "blues"], allowed: ["C#", "G#"] },
          rungs: ladder(70, 110, 10),
          passAt: 90,
          ...lick("shuffle"),
          minutes: 5,
        },
        {
          id: "written-chorus",
          title: "A written chorus, all twelve bars",
          purpose: "A whole chorus in box 1, written: a phrase, the same phrase over D7, and an answer over E7 and D7, with a low A to end the first half. Proof that the form and the box fit together.",
          howTo: [
            "Shuffle eighths, twelve bars, 70 BPM up to a pass at 85.",
            "Bars 1, 3 and 5 are the same phrase: A, C, A, G, E, D from the top string. Bar 4 resolves to C#, E and A. Bar 8 drops to the low A on the E string. Bars 9 to 11 answer, and bar 12 rests on E for the turnaround.",
            "Rest where it rests. The phrase over D7 in bar 5 is the same notes as bar 1: hear the band change under it.",
          ],
          coach: "The whole form, written. I check notes and time over all twelve bars after the take.",
          tab: swing(WRITTEN_CHORUS),
          position: 5,
          chords: TWELVE,
          jam: TEXAS,
          harmony: { scaleOverChords: ["A", "minorPentatonic"], allowed: ["C#"] },
          rungs: ladder(70, 100, 5),
          passAt: 85,
          ...lick("shuffle", 12),
          minutes: 6,
        },
        {
          id: "follow-the-form",
          title: "Your turn: a chorus that follows the changes",
          purpose: "A whole free chorus. You choose everything; aim for a chord tone on beat 1 at each of the six changes.",
          howTo: [
            "Shuffle, twelve bars, 70 to 90 BPM.",
            "Know the next chord before you get to it. If you lose the form, wait and rejoin at bar 5 or bar 9. The written line is an example.",
            NOT_CHECKED_YET,
          ],
          coach: "Not checked yet. Record it, and listen to the six changes.",
          vary: inKeys(swing(`/2 4:7 /8 3:5 3:7 3:5 3:7 | /2 2:5 /2 r | /2 2:8 /8 2:5 3:7 3:5 3:7 | /2 4:7 /2 r | /2 3:7 /8 3:5 4:7 3:5 3:7 | /2 3:5 /2 r | /2 4:7 /8 3:5 3:7 2:5 3:7 | /2 2:5 /2 r | /2 2:5 /8 3:7 3:5 3:7 2:5 | /2 3:7 /8 3:5 3:7 3:5 4:7 | /2 4:7 /8 3:5 4:7 4:5 3:5 | /2 2:5 /2 r`), TWELVE, undefined, ["A", "C", "E", "G"]),
          tab: swing(`/2 4:7 /8 3:5 3:7 3:5 3:7 | /2 2:5 /2 r | /2 2:8 /8 2:5 3:7 3:5 3:7 | /2 4:7 /2 r | /2 3:7 /8 3:5 4:7 3:5 3:7 | /2 3:5 /2 r | /2 4:7 /8 3:5 3:7 2:5 3:7 | /2 2:5 /2 r | /2 2:5 /8 3:7 3:5 3:7 2:5 | /2 3:7 /8 3:5 3:7 3:5 4:7 | /2 4:7 /8 3:5 4:7 4:5 3:5 | /2 2:5 /2 r`),
          position: 5,
          chords: TWELVE,
          jam: TEXAS,
          rungs: ladder(70, 90, 5),
          ...YOUR_TURN,
          selfCheck: [
            "Did you get to bar 12 without losing the form?",
            "At each change, did you land on a note of the new chord?",
          ],
          minutes: 5,
        },
      ],
    },
    {
      id: "bends",
      title: "Bends that land",
      goal: "Bend a note up to an exact pitch, on time, and come back down from it.",
      why: "A bend is the guitar's voice, and it's only expressive when it arrives. A bend that stops short sounds like a mistake in a way a wrong note often doesn't. The way to learn it is simple, and it's old: play the note you want, then bend up to it and compare.",
      howTo: [
        "Bend with three fingers on the string, ring finger on the note. Push from the wrist, as if turning a door handle, rather than from the fingers alone.",
        "Play the target first. Then bend until there's no wobble left between what you hear and what you remember.",
        "The app times your bends and doesn't measure how far they go, so your ear judges the pitch on every one of these. Keep your strings fresh: old strings make this much harder.",
      ],
      payoff: "A bent note that sits on the band's chord tone and arrives on the beat.",
      exercises: [
        {
          id: "reference",
          title: "Target first, then bend",
          purpose: "Play the note, then bend up to it from a whole tone below: E, then D bent to E; A, then G bent to A; D, then C bent to D.",
          howTo: [
            "Half notes, 50 to 80 BPM: two beats on the target, two beats on the bend.",
            "Hold the top of the bend without moving it. Use your ear and nothing else.",
          ],
          coach: "I can't measure how far a bend goes, so your ear decides this one. Compare it to the note you just played.",
          tab: `/2 3:9 3:7b2 | /2 2:10 2:8b2 | /2 1:10 1:8b2 | /2 3:9 3:7b2`,
          position: 7,
          harmony: { scale: ["A", "minorPentatonic"] },
          rungs: ladder(50, 80, 5),
          grade: "selfChecked",
          selfCheck: [
            "Does the top of the bend match the note you played just before, with no wobble between them?",
            "Could you hold the top of the bend for the full two beats?",
          ],
          minutes: 5,
        },
        {
          id: "half-step",
          title: "The half-step bend to C#",
          purpose: "From C up to the chord's own third. It's a small, exact bend and it's the classic blues sound, moving from the blue third to the major third over A7.",
          howTo: [
            "Half notes over the shuffle, 60 to 90 BPM.",
            "Fret 9 on the top string is your C#: play that first. Then fret 8 bent a half step. A half step feels like almost nothing, which is why it often overshoots.",
          ],
          coach: "Half-step bends tend to go sharp, and it takes your ear to catch it.",
          tab: swing(`/2 1:9 1:8b1 | /2 1:9 1:8b1v`),
          position: 7,
          chords: "A7 | A7",
          jam: TEXAS,
          rungs: ladder(60, 90, 5),
          grade: "selfChecked",
          selfCheck: ["Did the bend reach the C# you played first, and stop there rather than going past it?"],
          minutes: 4,
        },
        {
          id: "bends-on-time",
          title: "Bends on the beat",
          purpose: "A bend needs to arrive on time too, and that part the app can help with: it times when each bend was picked and whether it was heard.",
          howTo: [
            "Quarter notes, one bend on each beat of the first bar, 60 BPM up to a pass at 75.",
            "G string fret 7 bent to E, B string fret 8 bent to A, twice, then the last bend held with vibrato. Start the bend as you pick and reach the top quickly. Your ear still decides if it landed.",
          ],
          coach: "I time the bends and count them heard. How far they travelled, you judge.",
          tab: `/4 3:7b2 2:8b2 3:7b2 2:8b2 | /2 3:7b2v /2 r`,
          position: 7,
          harmony: { scale: ["A", "minorPentatonic"] },
          rungs: ladder(60, 90, 5),
          passAt: 75,
          ...bendsTimed(),
          selfCheck: ["Did each bend reach its note, on your ear?"],
          minutes: 5,
        },
        {
          id: "bend-and-release",
          title: "Bend, release, and pick it again",
          purpose: "The unison bend: bend D on the G string up to the E you're holding on the B string, let it back down, and pick the D you released to. The released D and the notes after it are written, so they're checked.",
          howTo: [
            "Shuffle eighths, 60 BPM up to a pass at 80.",
            "Ring finger on fret 7 of the G string, first finger on fret 5 of the B string. Pick both, bend the G string until the two E's stop beating against each other, then let it down as you pick D again, then C, and A on the D string.",
            "Bar 1 ends on G and A; bar 2 ends on a long A.",
          ],
          coach: "The bend is two strings at once, which I don't pitch-check; the single notes after it I do. The bend's pitch is your ear's call.",
          tab: swing(`/4 3:7b2+2:5 /8 3:7 3:5 /4 4:7 /8 4:5 4:7 | /4 3:7b2+2:5 /8 3:7 3:5 /2 4:7`),
          position: 5,
          chords: "A7 | A7",
          jam: TEXAS,
          harmony: { scaleOverChords: ["A", "minorPentatonic"] },
          rungs: ladder(60, 100, 5),
          passAt: 80,
          ...lick("shuffle"),
          selfCheck: ["At the top of each bend, did the two E's sound as one note, with no beating?"],
          minutes: 5,
        },
        {
          id: "bends-over-changes",
          title: "Bends that land on the chord",
          purpose: "A bent note on each change, and each one lands on a tone of that chord: E over A7, A over D7, E over E7 and C# over A7.",
          howTo: [
            "Shuffle eighths around a half-note bend, 60 BPM up to a pass at 75.",
            "Hear the target. The bend in bar 4 is the half step, and the others are whole steps. Each fill stays in the box.",
          ],
          coach: "I time every note here and count them heard. The bends' pitch is not measured, so this is one to record and listen back to.",
          tab: swing(`/2 3:7b2v /8 3:5 3:7 3:5 4:7 | /2 2:8b2v /8 2:5 3:7 3:5 3:7 | /2 3:7b2v /8 3:5 4:7 3:5 3:7 | /2 1:8b1v /8 1:5 2:8 2:5 3:5`),
          position: 5,
          chords: "A7 | D7 | E7 | A7",
          jam: TEXAS,
          harmony: { scaleOverChords: ["A", "minorPentatonic"], allowed: ["C#"] },
          rungs: ladder(60, 90, 5),
          passAt: 75,
          ...bendsTimed(),
          selfCheck: [
            "On a recording, does each bend sit in tune with the band's chord?",
            "Did you reach the top of each bend before beat 2?",
          ],
          minutes: 5,
        },
      ],
    },
    {
      id: "question-answer",
      title: "Question and answer phrases",
      goal: "Play phrases that ask and phrases that resolve, and build a twelve-bar chorus from them.",
      why: "A phrase that ends on the root sounds finished. A phrase that ends anywhere else sounds like a question. Knowing that gives you the shape of almost every blues vocal ever sung: say it, say it again, then answer it. It's the point where you stop stringing licks together and start saying something.",
      howTo: [
        "A question often ends on G or C, and an answer ends on A. Start both the same way and only change the ending: the listener hears the relationship.",
        "Blues lyric form is A, A, B: the same line twice, then the reply. Use that form on the guitar.",
        "Over D7, the same line sounds different, which is why repeating it doesn't get boring.",
      ],
      payoff: "A twelve-bar chorus that has a beginning, a middle and an end, and uses very few notes.",
      difficultyException:
        "Long notes and rests lower the rate on purpose: fewer notes, chosen more carefully, is what this Step teaches, and the rate can't count choosing.",
      exercises: [
        {
          id: "written-pair",
          title: "A question and its answer",
          purpose: "The same start twice, and two different endings. Hear what one note does: G asks and A answers.",
          howTo: [
            "Shuffle eighths and quarters, 70 BPM up to a pass at 85.",
            "Bars 1 and 2 are the question, ending on G at fret 8 of the B string. Bars 3 and 4 are the answer, ending on A on the D string. Let each ending note ring with a little vibrato.",
          ],
          coach: "Written notes, checked after the take with the timing. Whether it sounds like a question is your ear's call.",
          tab: swing(`${THE_QUESTION} | ${THE_ANSWER}`),
          position: 5,
          chords: VAMP_A,
          jam: TEXAS,
          harmony: { scaleOverChords: ["A", "minorPentatonic"] },
          rungs: ladder(70, 100, 5),
          passAt: 85,
          ...lick("shuffle"),
          minutes: 5,
        },
        {
          id: "aab",
          title: "A, A, B over twelve bars",
          purpose: "The same line over A7 and over D7, then an answer over E7 and D7. A blues chorus, written out, with six or seven notes to a phrase.",
          howTo: [
            "Shuffle eighths and quarters, twelve bars, 70 BPM up to a pass at 85.",
            "Bars 1 and 5 start the same, and the band changes under you. That change is the magic. Bars 9 and 10 are the reply. Rest everywhere it says.",
          ],
          coach: "A lot of silence in this one. I check the notes and their time; a note in a rest shows up as an extra one.",
          tab: swing(`/8 1:5 2:8 /4 2:5 3:7 /8 3:5 4:7 | /2 4:7v /2 r | /1 r | /2 r /4 r /8 3:5 3:7 | /8 1:5 2:8 /4 2:5 3:7 /8 3:5 4:7 | /2 4:7v /2 r | /1 r | /2 r /4 r /8 3:5 3:7 | /8 2:5 3:7 /4 3:5 4:7 /8 3:5 3:7 | /2 3:7 /8 3:5 4:7 /4 3:5 | /2 4:7v /2 r | /1 r`),
          position: 5,
          chords: TWELVE,
          jam: TEXAS,
          harmony: { scaleOverChords: ["A", "minorPentatonic"] },
          rungs: ladder(70, 100, 5),
          passAt: 85,
          ...lick("shuffle", 12),
          minutes: 6,
        },
        {
          id: "write-the-answer",
          title: "Your turn: you write the answer",
          purpose: "The app asks. You answer with anything you like, ending on A at the start of bar 4.",
          howTo: [
            "Straight time, 70 to 85 BPM. The question is bars 1 and 2.",
            "Listen to the question, make up your answer, and make sure it finishes on an A. Try the fret 7 A on the D string first. The written answer is an example.",
            NOT_CHECKED_YET,
          ],
          coach: "Not checked yet: the answer is yours, and so is judging it.",
          tab: `${REST_BARS} | ${THE_ANSWER}`,
          guide: `${THE_QUESTION} | ${REST_BARS}`,
          position: 5,
          chords: VAMP_A,
          rungs: ladder(70, 85, 5),
          ...YOUR_TURN,
          selfCheck: [
            "Did your answer end on an A, on beat 1 of bar 4?",
            "Was it about as long as the question?",
          ],
          minutes: 4,
        },
        {
          id: "free-aab",
          title: "Your own A, A, B",
          purpose: "A whole chorus of your own in that form, which nothing grades. Say something, repeat it and answer it.",
          howTo: [
            "Shuffle, twelve bars, 70 to 85 BPM.",
            "Make up the A phrase on the spot and repeat it over D7. Don't plan the B. Record it, and be kind to yourself about what comes out.",
          ],
          coach: "No marks on this one. If you want a view, listen back to it tomorrow.",
          tab: swing(`/8 1:5 2:8 /4 2:5 3:7 /8 3:5 4:7 | /2 4:7v /2 r | /1 r | /1 r | /8 1:5 2:8 /4 2:5 3:7 /8 3:5 4:7 | /2 4:7v /2 r | /1 r | /1 r | /8 2:5 3:7 /4 3:5 4:7 /8 3:5 3:7 | /2 3:7 /8 3:5 4:7 /4 3:5 | /2 4:7v /2 r | /1 r`),
          position: 5,
          chords: TWELVE,
          jam: TEXAS,
          rungs: ladder(70, 85, 5),
          grade: "practiceOnly",
          minutes: 5,
        },
      ],
    },
    {
      id: "two-boxes",
      title: "Connecting box 1 and box 2",
      goal: "Move between the first two pentatonic boxes through shared notes, without the seam showing.",
      why: "One box keeps you in a cage. The way out isn't to learn all five at once: it's to find one door. Box 2 uses the same five notes, a little higher, and the G string gives you a slide from one box into the other. That's enough to change how your solos sound, because a higher note on the same scale is a whole new emotion in the phrase.",
      howTo: [
        "Box 2 starts at fret 7 or 8: on the G string it is frets 7 and 9, on the B string frets 8 and 10.",
        "The door is a slide on the G string from D at fret 7 up to E at fret 9. Slide with your third finger and you land in position in box 2.",
        "Box 1 and box 2 are the same notes. A on the D string, fret 7, is the same in both, and you've already found it.",
      ],
      payoff: "Your lick climbs out of the box, reaches a new high note, and comes home again.",
      exercises: [
        {
          id: "box-two",
          title: "Box 2, up and down",
          purpose: "The new shape on its own: the same notes in a new layout.",
          howTo: [
            "Straight eighths, two to a click, 60 BPM up to a pass at 80.",
            "Up and back. Say the A's again: fret 7 on the D string and fret 10 on the B string.",
          ],
          coach: "Same bar as box 1: right notes and even eighths after the take.",
          tab: `/8 ${pentatonic({ root: "A", box: 2, sequence: "updown" })} hold`,
          position: 7,
          harmony: { scale: ["A", "minorPentatonic"], cover: true },
          click: 2,
          rungs: ladder(60, 110, 10),
          passAt: 80,
          ...lick("straight"),
          minutes: 5,
        },
        {
          id: "the-door",
          title: "The door: slide up, come home",
          purpose: "One lick, from box 1 into box 2 and back. Sliding D to E on the G string and A to G on the B string are the two doors.",
          howTo: [
            "Straight eighths, 60 BPM up to a pass at 80.",
            "Slide on the G string from 7 to 9 to reach E. Top note A at fret 10 on the B string, then slide back to G at 8. Pick each slide's first note only.",
          ],
          coach: "A slid-to note can be too quiet for me, so the bar allows for it. Trust your ear there; the picked notes are checked.",
          tab: `/8 4:7 3:5 3:7s 3:9 /4 2:8 /8 2:10s 2:8 | /4 3:9 /8 3:7 3:5 /2 4:7`,
          position: 5,
          shifts: true,
          harmony: { scale: ["A", "minorPentatonic"], cover: true },
          click: 2,
          rungs: ladder(60, 100, 5),
          passAt: 80,
          ...lick("straight"),
          minutes: 5,
        },
        {
          id: "there-and-back",
          title: "Four bars, both boxes",
          purpose: "A longer phrase that uses box 2 for its high point and box 1 for its landing. The shape of the line goes up and comes home, which is what makes it sound like a solo.",
          howTo: [
            "Shuffle eighths, 70 BPM up to a pass at 85.",
            "Bars 1 and 2 climb through the slide on the G string, bar 3 sits high on the B and E strings, and bar 4 comes home to the A on the D string. Take the slide slowly at first.",
          ],
          coach: "Notes and the shuffle after the take. Get the slide clean, and the rest usually follows.",
          tab: swing(`/8 4:7 3:5 3:7 3:5 3:7s 3:9 /4 2:8 | /8 2:8 2:10 2:8 3:9 /2 2:8 | /8 2:10 1:8 1:10 1:8 /2 2:10 | /8 3:9 3:7 3:5 3:7 /2 4:7`),
          position: 5,
          shifts: true,
          chords: VAMP_A,
          jam: TEXAS,
          harmony: { scaleOverChords: ["A", "minorPentatonic"] },
          rungs: ladder(70, 100, 5),
          passAt: 85,
          ...lick("shuffle"),
          minutes: 6,
        },
        {
          id: "land-in-either",
          title: "Your turn: land in either box",
          purpose: "Free playing across both boxes: more room to move, the same aim of a chord tone on beat 1.",
          howTo: [
            "Shuffle, 70 to 90 BPM, A7, E7, D7, A7.",
            "E on the G string, fret 9, is a good new landing over A7 and E7 alike. The written line is an example.",
            NOT_CHECKED_YET,
          ],
          coach: "Not checked yet. Record it and listen to beat 1 of each bar.",
          tab: swing(`/2 4:7 /8 3:5 3:7 3:7 3:9 | /2 3:9 /8 2:8 2:10 2:8 3:9 | /2 3:7 /8 3:9 2:8 3:9 3:7 | /2 4:7 /8 3:5 3:7 3:5 3:7`),
          position: 5,
          shifts: true,
          chords: "A7 | E7 | D7 | A7",
          jam: TEXAS,
          rungs: ladder(70, 90, 5),
          ...YOUR_TURN,
          selfCheck: [
            "Did you use box 2 for at least one phrase, and come home through the slide?",
            "Did beat 1 of each bar land on a note of the chord?",
          ],
          minutes: 4,
        },
      ],
    },
    {
      id: "guide-tones",
      title: "Guide tones through the changes",
      goal: "Hear and play the thirds and sevenths that make each chord what it is, and move between them by half steps.",
      why: "If you only play two notes per chord, these are the two. The third and seventh of a dominant chord tell the ear exactly what's happening, and from one chord to the next they barely move: G falls a half step to F#, C# falls to C. Play that, and the changes appear in a single line with no band at all. It's the moment theory turns into something you can hear.",
      howTo: [
        "A7's guide tones are C# and G. D7's are F# and C. E7's are G# and D.",
        "G to F# (A7 to D7) and C# to C (A7 to D7) are half steps. E7's G# is the odd one out: go up a tone from F# on the B string.",
        "Sing the line. If you can sing it, you can play over the changes.",
      ],
      payoff: "A single slow line that spells the whole twelve-bar form without any other notes.",
      difficultyException:
        "One or two notes a bar, so the rate falls right down. Hearing the harmony is the demand here, and it is the most abstract idea on the Path.",
      exercises: [
        {
          id: "sevenths-line",
          title: "The seventh-and-third line, on the B string",
          purpose: "One note per bar, all on one string: G over A7, F# over D7, G# over E7. These are the sounds that make the changes obvious.",
          howTo: [
            "Whole notes, one a bar, 60 BPM up to a pass at 80.",
            "Frets 8, 7 and 9 on the B string, in the order the chart asks. Let the band's chord move under you and hear the note fit.",
          ],
          coach: "Twelve notes, each the right one for its chord and on its bar line.",
          tab: swing(`/1 2:8 | 2:8 | 2:8 | 2:8 | 2:7 | 2:7 | 2:8 | 2:8 | 2:9 | 2:7 | 2:8 | 2:9`),
          position: 7,
          chords: TWELVE,
          jam: TEXAS,
          harmony: { chordTones: true },
          rungs: ladder(60, 100, 10),
          passAt: 80,
          ...lick("straight"),
          minutes: 4,
        },
        {
          id: "thirds-line",
          title: "The other line",
          purpose: "C# over A7, C over D7, G# over E7: the other guide tone for each chord, a lower line that moves by half steps too.",
          howTo: [
            "Whole notes, one a bar, 60 BPM up to a pass at 80.",
            "Frets 6 and 5 on the G string and fret 6 on the D string. Compare it with the last line: the same form, a different colour.",
          ],
          coach: "The same check, on a new line. Once both are easy, the next Exercise joins them.",
          tab: swing(`/1 3:6 | 3:6 | 3:6 | 3:6 | 3:5 | 3:5 | 3:6 | 3:6 | 4:6 | 3:5 | 3:6 | 4:6`),
          position: 5,
          chords: TWELVE,
          jam: TEXAS,
          harmony: { chordTones: true },
          rungs: ladder(60, 100, 10),
          passAt: 80,
          ...lick("straight"),
          minutes: 4,
        },
        {
          id: "both-tones",
          title: "Both guide tones, every chord",
          purpose: "Two half notes per bar through the form: third, then seventh. The chord's identity comes through with nothing else played.",
          howTo: [
            "Half notes, two a bar, 60 BPM up to a pass at 80.",
            "Stay in fifth position. Fingers fall on the G and B strings and barely have to move at each change, which is the whole point. Over E7 they move down a string: G# on the D string, D on the G.",
          ],
          coach: "It's slow, but every note counts. I check each one and its time after the take.",
          vary: inKeys(`/2 3:6 2:8 | 3:6 2:8 | 3:6 2:8 | 3:6 2:8 | 3:5 2:7 | 3:5 2:7 | 3:6 2:8 | 3:6 2:8 | 4:6 3:7 | 3:5 2:7 | 3:6 2:8 | 4:6 3:7`, TWELVE, undefined, ["A", "C", "E", "G"]),
          tab: swing(`/2 3:6 2:8 | 3:6 2:8 | 3:6 2:8 | 3:6 2:8 | 3:5 2:7 | 3:5 2:7 | 3:6 2:8 | 3:6 2:8 | 4:6 3:7 | 3:5 2:7 | 3:6 2:8 | 4:6 3:7`),
          position: 5,
          chords: TWELVE,
          jam: TEXAS,
          harmony: { chordTones: true },
          rungs: ladder(60, 100, 10),
          passAt: 80,
          ...lick("straight"),
          minutes: 5,
        },
        {
          id: "with-fills",
          title: "Guide tones with a pentatonic fill",
          purpose: "Land on a guide tone on beat 1, then fill with the box. It's the sound of a player who is really hearing the changes.",
          howTo: [
            "A half note, then shuffle eighths, 60 BPM up to a pass at 80.",
            "C# over A7, C over D7, G over A7, G# over E7, each followed by four notes of box 1. Note how the C# and G# stand out against the band's chord, because that's what they're for.",
          ],
          coach: "Written notes on this one, checked with their timing after the take.",
          tab: swing(`/2 3:6 /8 2:5 1:5 2:5 3:7 | /2 3:5 /8 3:7 2:5 3:7 3:5 | /2 2:8 /8 2:5 3:7 3:5 4:7 | /2 4:6 /8 2:5 3:7 3:5 3:7`),
          position: 5,
          chords: "A7 | D7 | A7 | E7",
          jam: TEXAS,
          harmony: { scaleOverChords: ["A", "minorPentatonic"], allowed: ["C#", "G#"] },
          rungs: ladder(60, 100, 5),
          passAt: 80,
          ...lick("shuffle"),
          minutes: 5,
        },
        {
          id: "free-guide-tones",
          title: "Your turn: guide tones, all twelve bars",
          purpose: "A free chorus again, now aiming only for thirds and sevenths at each change. It's the hardest landing in the Path, and the most rewarding.",
          howTo: [
            "Shuffle, twelve bars, 60 to 80 BPM.",
            "Six changes in twelve bars. Pick a guide tone for each ahead of time, and everything else is free. The written line is an example.",
            NOT_CHECKED_YET,
          ],
          coach: "Not checked yet. Record it and listen for the third or seventh at each change.",
          tab: swing(`/2 3:6 /8 2:5 1:5 2:5 3:7 | /2 2:5 /2 r | /2 2:8 /8 2:5 3:7 3:5 3:7 | /2 4:7 /2 r | /2 3:5 /8 3:7 2:5 3:7 3:5 | /2 3:5 /2 r | /2 2:8 /8 2:5 3:7 3:5 3:7 | /2 2:5 /2 r | /2 4:6 /8 4:7 3:5 3:7 2:5 | /2 2:7 /8 3:5 3:7 2:5 3:7 | /2 3:6 /8 2:5 3:7 3:5 4:7 | /2 3:7 /2 r`),
          position: 5,
          chords: TWELVE,
          jam: TEXAS,
          rungs: ladder(60, 80, 5),
          ...YOUR_TURN,
          selfCheck: [
            "At each of the six changes, was your note the chord's third or seventh?",
            "Could you sing the guide-tone line afterwards?",
          ],
          minutes: 5,
        },
      ],
    },
    {
      id: "slow-blues",
      title: "Slow blues",
      goal: "Play a full written chorus at a slow tempo, where every note you play is on display.",
      why: "At 60 BPM there's nowhere to hide and nothing to run to. Everything in this Path is a tool for this moment: chord tones to land on, bends that arrive, questions and answers, and rests. Slow blues is the hardest thing on the Path, and it isn't because of the notes.",
      howTo: [
        "Feel the triplets under the beat: each beat has three pulses, and the drummer plays them on the hat.",
        "Play less than you think. Let a held note ring through a chord change if it still fits, and hear how it changes.",
        "Use vibrato only once a note has landed, not to find it.",
      ],
      payoff: "Twelve slow bars that sound like a blues player, with the space to prove it.",
      exercises: [
        {
          id: "written-chorus",
          title: "A written slow chorus",
          purpose: "A full twelve bars, written, with unison bends and blue notes in place, to show how little it takes. Learn it, and take it apart.",
          howTo: [
            "Slow 12/8 feel: half notes and triplet eighths, 50 BPM up to a pass at 58.",
            "Rest where it rests, and hold notes for their full length. The bends are unison bends: G string fret 7 up to the B string's E, and B string fret 8 up to the high E string's A.",
            "Bars 11 and 12 are a chromatic turnaround on the G string, frets 9 down to 6, then E and G#.",
          ],
          coach: "Slow and written: I check the single notes and their time after the take, with a timing bar that leaves room to lay back. The bends and vibrato are your ear's.",
          tab: SLOW_CHORUS,
          position: 5,
          shifts: true,
          chords: TWELVE,
          jam: SLOW,
          harmony: { scaleOverChords: ["A", "blues"], allowed: ["C#", "G#"] },
          rungs: ladder(50, 72, 4),
          passAt: 58,
          ...lick("slow", 12),
          selfCheck: [
            "On a recording, do the bends reach their notes?",
            "Do the rests feel deliberate?",
          ],
          minutes: 7,
        },
        {
          id: "play-less",
          title: "Play less",
          purpose: "A written chorus with most of its space empty: a phrase, a breath, a bar of nothing. Rests count here, as a way of saying they matter.",
          howTo: [
            "Slow 12/8 feel, 50 BPM up to a pass at 58.",
            "Each phrase is a long note, a rest, and three triplet notes that lead into the next bar. Bars 3 and 7 are empty: listen to the band there, since it's worth hearing.",
          ],
          coach: "Written notes, checked with their time. A note in an empty bar shows up as an extra note, so let the band have it.",
          tab: SPARSE_CHORUS,
          position: 5,
          shifts: true,
          chords: TWELVE,
          jam: SLOW,
          harmony: { scaleOverChords: ["A", "blues"], allowed: ["C#", "G#"] },
          rungs: ladder(50, 72, 4),
          passAt: 58,
          ...lick("slow", 12),
          minutes: 6,
        },
        {
          id: "landings-chorus",
          title: "Your turn: your slow chorus",
          purpose: "Your notes, the same form. Land on a chord tone at each change and leave a gap after it. The written chorus is an example of one way it might go.",
          howTo: [
            "Slow 12/8 feel, 50 to 60 BPM.",
            "At this tempo you have plenty of time to choose. Fewer notes, and longer ones.",
            NOT_CHECKED_YET,
          ],
          coach: "Not checked yet. Record it; I'd rather you heard fewer notes.",
          tab: SLOW_CHORUS,
          position: 5,
          shifts: true,
          chords: TWELVE,
          jam: SLOW,
          rungs: ladder(50, 60, 5),
          ...YOUR_TURN,
          selfCheck: [
            "At each change, did you land on a note of the new chord?",
            "Did you leave at least one bar empty?",
          ],
          minutes: 6,
        },
        {
          id: "free-chorus",
          title: "A free chorus, nobody's counting",
          purpose: "Play a slow chorus of your own, the way you'd play it for a friend. There's nothing to pass, and the app says so. It's the point of the whole Path.",
          howTo: ["Slow 12/8 feel, any tempo from 50 to 60.", "Record it if you'd like to hear it. Otherwise, close your eyes."],
          coach: "No marks and no report. This one is for you.",
          tab: SLOW_CHORUS,
          position: 5,
          shifts: true,
          chords: TWELVE,
          jam: SLOW,
          rungs: ladder(50, 60, 5),
          grade: "practiceOnly",
          minutes: 6,
        },
      ],
    },
  ],
  levels: [
    {
      id: "beginner",
      title: "Beginner: one box, and the chord tones",
      summary: "One pentatonic box, the arpeggios of A7, D7 and E7, and phrases that answer. All in A, so the theory is the only new thing.",
      startHereIf: [
        "You can play eighth notes with a click at 70 BPM.",
        "You don't yet know box 1 from memory, or you know it and can't make it sound like a phrase.",
        "You couldn't name the notes of A7 yet.",
      ],
      steps: ["box-one", "landing", "call-response"],
      warmups: [
        {
          id: "box-around",
          title: "A lick around the chords",
          purpose: "A short shuffle lick in box 1, moved to follow i, IV, V and back. A new key and a new lick each time, so your hands wake up and your ears do too.",
          howTo: ["Shuffle eighths, well under your clean tempo. Shift at the bar line and let the chord tell you where you are."],
          coach: "This is a warm-up. It tells you how it went, and it decides nothing.",
          vary: {
            values: { key: ["A", "C", "D", "E", "G"], shapeOrder: ["falling lick", "climbing lick"] },
            pooled: ["key", "shapeOrder"],
            label: (p) => `In ${p.key}, ${p.shapeOrder}`,
            build: (p) => {
              const lickTab = sh(p.shapeOrder === "falling lick" ? "1:5 2:8 2:5 3:7 3:5 3:7 2:5 3:7" : "4:7 3:5 3:7 2:5 2:8 2:5 3:7 3:5");
              const shift = KEY_SHIFT[p.key];
              const tab = [0, 5, 7, 0].map((up) => shiftFrets(lickTab, shift + up)).join(" | ");
              return { tab, position: handAt(tab), shifts: true, chords: moveChart("A7 | D7 | E7 | A7", shift) };
            },
          },
          grade: "warmup",
          warmup: { start: 0.65, top: 0.85, reference: "landing.root-on-one", fallback: 70 },
          rungs: ladder(60, 90, 5),
          minutes: 3,
        },
      ],
    },
    {
      id: "intermediate",
      title: "Intermediate: the form and the voice",
      summary: "The blues scale, all twelve bars with a written chorus, bends that land on time, and phrases that ask and answer.",
      startHereIf: [
        "You can play box 1 from memory, up and down, at 80 BPM eighths.",
        "You can play the A7, D7 and E7 arpeggios in box 1 at 80 BPM.",
        "You get lost in the twelve-bar form, or your solos run together with no shape to them.",
      ],
      steps: ["blues-scale", "twelve-bar", "bends", "question-answer"],
      warmups: [
        {
          id: "boogie-keys",
          title: "A boogie line in a new key",
          purpose: "A walking shuffle line round I, IV, V and back, in a key you didn't play yesterday. It's a warm-up and ear training at once.",
          howTo: ["Shuffle eighths, well under your clean tempo. Root, third, fifth, sixth, flat seven and back. Let the hand move."],
          coach: "This is a warm-up. It tells you how it went, and it decides nothing.",
          vary: {
            values: { key: ["A", "C", "E", "G"], progression: ["I IV V I", "I V IV I"] },
            pooled: ["key", "progression"],
            label: (p) => `In ${p.key}, ${p.progression}`,
            build: (p) => {
              const shift = KEY_SHIFT[p.key];
              const forward = p.progression === "I IV V I";
              const line = forward ? [walkA, walkD, walkE, walkA] : [walkA, walkE, walkD, walkA];
              const chart = forward ? "A7 | D7 | E7 | A7" : "A7 | E7 | D7 | A7";
              const tab = line.map((bar) => shiftFrets(bar, shift)).join(" | ");
              return { tab, position: handAt(tab), shifts: true, chords: moveChart(chart, shift) };
            },
          },
          grade: "warmup",
          warmup: { start: 0.65, top: 0.85, reference: "twelve-bar.walking", fallback: 70 },
          rungs: ladder(60, 95, 5),
          minutes: 4,
        },
      ],
    },
    {
      id: "advanced",
      title: "Advanced: more neck, more harmony, less noise",
      summary: "A second box, guide tones through the changes, and slow blues with nothing to hide behind.",
      startHereIf: [
        "You can follow all 12 bars without losing your place.",
        "You can bend a whole tone up to pitch by ear, and hold it there.",
        "Your phrases work, and you're stuck in one box playing the same notes over every chord.",
      ],
      steps: ["two-boxes", "guide-tones", "slow-blues"],
      warmups: [
        {
          id: "two-boxes-keys",
          title: "Through both boxes",
          purpose: "A four-bar line from box 1 into box 2 and home again, in a different key each time. The slide on the G string is what gets warmed up.",
          howTo: ["Shuffle eighths, well under your clean tempo. Take the slide slowly and let the line rise and come home."],
          coach: "This is a warm-up. It tells you how it went, and it decides nothing.",
          vary: inKeys(
            swing(`/8 4:7 3:5 3:7 3:5 3:7s 3:9 /4 2:8 | /8 2:8 2:10 2:8 3:9 /2 2:8 | /8 2:10 1:8 1:10 1:8 /2 2:10 | /8 3:9 3:7 3:5 3:7 /2 4:7`),
            VAMP_A,
            "minorPentatonic",
            ["A", "B", "C", "D", "E", "G"],
          ),
          grade: "warmup",
          warmup: { start: 0.65, top: 0.85, reference: "two-boxes.there-and-back", fallback: 70 },
          rungs: ladder(60, 90, 5),
          minutes: 4,
        },
      ],
    },
  ],
});
