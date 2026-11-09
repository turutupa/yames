/**
 * Sweep Picking, a Mechanics Path. A draft: no teacher or guitarist has reviewed
 * it. Muting and pick path are the heart of sweeping, and neither can be
 * graded from sound, so they are taught in words and self-checked.
 */
import { definePath } from "../spec";
import type { ExerciseSpec, StepSpec, VariantParams } from "../spec";
import {
  handAt,
  ladder,
  linkFragment,
  linkedSweep,
  moveChart,
  nearFret,
  repeat,
  sweepChain,
  sweepLoop,
  sweepUp,
} from "../templates";

const ROLL_CHECK =
  "Record a take and listen back. Does each note stop as the next one starts, or do they ring together like a strummed chord?";
const NOISE_CHECK = "Between takes, stop and listen: are the strings you are not playing silent?";

const am3 = sweepLoop({ chord: "Am", strings: [3, 2, 1], near: 14 });
const am3Low = sweepLoop({ chord: "Am", strings: [3, 2, 1], near: 5 });
const am3Mid = sweepLoop({ chord: "Am", strings: [3, 2, 1], near: 9 });
const c3 = sweepLoop({ chord: "C", strings: [3, 2, 1], near: 12 });
const cm3 = sweepLoop({ chord: "Cm", strings: [3, 2, 1], near: 12 });
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

const twoPerBar = (cell: string) => repeat(cell, 2);

// A slid-to note the listening misses counts as missed today, so a shape with
// slides at the top keeps a lower notes-heard bar (`honesty.slideBar`).
const SLIDE_BARS = [
  { metric: "noteIdentity", min: 0.8, overBars: 4 },
  { metric: "notesHeard", min: 0.75, overBars: 4 },
  { metric: "timingEvenness", min: 0.75, overBars: 4 },
  { metric: "extraNotes", max: 4, overBars: 4 },
];

function sweepExercise(args: Omit<ExerciseSpec, "pick" | "grade"> & { grade?: ExerciseSpec["grade"] }): ExerciseSpec {
  return {
    pick: "sweep",
    grade: "sweep",
    selfCheck: [ROLL_CHECK],
    ...args,
  };
}

const OLD_STEPS: StepSpec[] = [
    {
      id: "two-strings",
      title: "Two strings, one stroke, and the mute",
      goal: "One continuous push of the pick through two strings, with two separate notes and nothing ringing.",
      why: "A sweep is one motion that plays several notes, which is why it is not alternate picking done faster. The smallest sweep is two strings, and it contains the whole technique: push through the first string, let the pick come to rest on the next, then push on. It also contains the whole problem: if the first note keeps ringing, you get a chord. Learn the mute now, while there are only two notes to keep apart.",
      howTo: [
        "Use a single push from the arm, with the wrist quiet. Think of a slow, heavy push rather than two small picks. The pick comes to rest on the next string between notes.",
        "Fretting hand: as soon as the next note sounds, release the pressure on the last note without leaving the string. That is the left-hand mute, and it does most of the work.",
        "Picking hand: keep the side of your palm on the lower strings, moving across with the sweep, so everything behind the pick stays silent.",
        "Go slowly enough to hear two distinct notes. If you can't, it is too fast or a note is still ringing.",
      ],
      payoff: "A two-string lick you can play at any slow tempo and hear each note clearly, and a short pentatonic phrase that uses it.",
      exercises: [
        sweepExercise({
          id: "down-two",
          title: "Down through two strings",
          purpose: "The motion on its own: down through the B and E strings, then stop.",
          howTo: ["Push through the B string and let the pick rest on the E string, then push through that. Stop for the rest and start again from above the B string."],
          coach: "I can time the two notes and hear whether both were there. Listening for a ring between them is your job.",
          tab: `/8 2:5 1:5 /4 r /8 2:5 1:5 /4 r`,
          position: 5,
          harmony: { arpeggio: "Am", cover: false },
          rungs: ladder(50, 110, 5),
          passAt: 90,
          minutes: 5,
        }),
        sweepExercise({
          id: "up-two",
          title: "Up through two strings",
          purpose: "The same push going the other way. It is usually the weaker direction, and it won't get better unless you work on it alone.",
          howTo: ["From below the E string, push up through the E and B strings. Rest the pick against the next string up after each note."],
          coach: "If this one comes out less even than the downward one, that is common. Give it a few more minutes.",
          tab: `/8 1:5 2:5 /4 r /8 1:5 2:5 /4 r`,
          position: 5,
          harmony: { arpeggio: "Am", cover: false },
          rungs: ladder(50, 110, 5),
          passAt: 90,
          minutes: 5,
        }),
        sweepExercise({
          id: "there-and-back",
          title: "There and back",
          purpose: "Down through two strings, then up through the same two, with no gap. The top note repeats, so each direction is one whole stroke.",
          howTo: ["Two downs, then two ups, then rest. Note the stroke change on the repeated top note: that is the only moment the pick turns round."],
          coach: "Evenness at these rungs tells us the pick is arriving on time. It can't tell which way it was moving.",
          tab: `/8 2:5 1:5 1:5 2:5 /4 r r`,
          position: 5,
          harmony: { arpeggio: "Am", cover: false },
          rungs: ladder(50, 110, 5),
          passAt: 90,
          minutes: 5,
        }),
        sweepExercise({
          id: "rolling-barre",
          title: "Roll one finger across three strings",
          purpose: "Fret 5 on three strings with one finger: the fingertip rolls so only the current note sounds. This is the fretting skill behind every barred sweep shape.",
          howTo: [
            "First finger across G, B and E at fret 5. Going up the strings, roll the fingertip so the finger leaves the last string as the next one sounds. Coming back, roll the other way.",
            "Play it very slowly first with no click, and listen for two notes sounding together.",
          ],
          coach: "Take this slowly. Notes bleeding into each other is what can't be measured yet, so a recording is your best check.",
          tab: `/8 3:5 2:5 2:5 3:5 2:5 1:5 1:5 2:5`,
          position: 5,
          harmony: { arpeggio: "Am", cover: true },
          rungs: ladder(50, 100, 5),
          passAt: 85,
          minutes: 5,
        }),
        sweepExercise({
          id: "pentatonic-lick",
          title: "A two-string lick you can use",
          purpose: "Two-string sweeps with a hammer and a pull, ending on D: the Step's audible payoff, and a phrase that already works in a solo.",
          howTo: [
            "Down through B and E, hammer to fret 8, pull back to 5, then up through the B string at fret 8, pull to 5, and finish on the G string.",
            "Only the marked notes are picked. The hammer and pull give you notes for free.",
          ],
          coach: "A quiet hammer or pull that I can't hear costs nothing, so don't dig in to please me.",
          tab: `/8t 2:5 1:5 1:8h 1:5p 2:8 2:5p /4 3:7 r`,
          position: 5,
          harmony: { scale: ["A", "minorPentatonic"] },
          rungs: ladder(50, 120, 5),
          passAt: 100,
          minutes: 6,
        }),
      ],
    },
    {
      id: "three-strings",
      title: "Three strings, each way",
      goal: "A clean one-way triad on the top three strings, at a tempo where each note can be told apart.",
      why: "Three strings is the first time a sweep sounds like one: three notes of a chord in one gesture. Keep it one-way for now so that all the attention is on the push and the mute, and so that you learn the shape as music rather than as a move.",
      howTo: [
        "Same single push, now through three strings. Keep the pick rest going: the pick lands on each string, then falls through it.",
        "The Am shape at fret 14 uses first finger on the top string, second on the B string, third on the G string. Lift each finger's pressure as soon as the next note sounds.",
        "Rest between sweeps. The rest is also a check: does anything keep ringing?",
      ],
      payoff: "You hear an actual arpeggio come out of one stroke, and you can play Am, F, C and G that way.",
      exercises: [
        sweepExercise({
          id: "down-three",
          title: "Am, downward only",
          purpose: "The one gesture, repeated: one downward push across the Am shape, followed by a rest.",
          howTo: ["Triplets. Three notes, then silence for the same length. Bring the pick back above the G string during the rest, without touching anything."],
          coach: "Three notes, spaced evenly, is what I'm able to check here.",
          tab: `/8t ${repeat(`${sweepUp({ chord: "Am", strings: [3, 2, 1], near: 14 })} r r r`, 2)}`,
          position: 12,
          harmony: { arpeggio: "Am" },
          rungs: ladder(50, 110, 5),
          passAt: 90,
          minutes: 5,
        }),
        sweepExercise({
          id: "up-three",
          title: "Am, upward only",
          purpose: "The upward push. Getting it to match the downward one is worth more than any speed you gain this week.",
          howTo: ["Start from below the top string. Pull up through E, B and G. Keep the same space between notes as you had going down."],
          coach: "Compare this take with the downward one. They should sound like the same player.",
          tab: `/8t ${repeat("1:12 2:13 3:14 r r r", 2)}`,
          position: 12,
          harmony: { arpeggio: "Am" },
          rungs: ladder(50, 110, 5),
          passAt: 85,
          minutes: 5,
        }),
        sweepExercise({
          id: "there-and-back-three",
          title: "Am, there and back",
          purpose: "Up the strings and back, with the top note as the one turn: the shape of a real sweep, slowly.",
          howTo: ["Five notes and a rest. The stroke changes once, right after the top note. Keep that change as small as you can."],
          coach: "When this one is even you're ready for a turnaround.",
          tab: `/8t ${repeat("3:14 2:13 1:12 2:13 3:14 r", 2)}`,
          position: 12,
          harmony: { arpeggio: "Am", cover: true },
          rungs: ladder(50, 110, 5),
          passAt: 85,
          minutes: 5,
        }),
        sweepExercise({
          id: "four-triads",
          title: "Am, F, C, G",
          purpose: "Four triads in four shapes, one sweep each, so the shapes become chords you recognise rather than frets you remember.",
          howTo: ["Two sweeps per chord, one chord per bar. Move the hand during the rest and be there early."],
          coach: "I can check the notes against each chord after the take, as long as they are separate enough to hear.",
          tab: [
            ["Am", 14],
            ["F", 10],
            ["C", 12],
            ["G", 12],
          ]
            .map(([chord, near]) => `/8t ${repeat(`${sweepUp({ chord: chord as string, strings: [3, 2, 1], near: near as number })} r r r`, 2)}`)
            .join(" | "),
          position: 12,
          shifts: true,
          chords: "Am | F | C | G",
          harmony: { chordTones: true, cover: true },
          rungs: ladder(50, 100, 5),
          passAt: 80,
          minutes: 6,
        }),
      ],
    },
    {
      id: "turnaround",
      title: "Changing direction: the turnaround",
      goal: "Turn the sweep round at the top with a hammer and a pull, so it keeps flowing with no extra pick stroke.",
      why: "A sweep that goes one way is a trick. A sweep that goes up and comes back is a line, and the turn is where it usually falls apart: the pick is going down when the music needs it to come back. A hammer and a pull on the top string give the pick time to change direction without a stroke being heard. Learn it now on three strings, where there is little else to get wrong.",
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
          coach: "I'll say whether the notes were C major and how even they were. A quiet hammer does not count against you.",
          tab: `/8t ${twoPerBar(c3)}`,
          position: 12,
          harmony: { arpeggio: "C" },
          rungs: ladder(50, 120, 5),
          passAt: 90,
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
          rungs: ladder(50, 120, 5),
          passAt: 90,
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
          rungs: ladder(50, 120, 5),
          passAt: 85,
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
          rungs: ladder(50, 120, 5),
          passAt: 85,
          selfCheck: [ROLL_CHECK, NOISE_CHECK],
          minutes: 6,
        }),
      ],
    },
    {
      id: "qualities",
      title: "Major, minor, then diminished",
      goal: "Play major, minor and diminished shapes on three strings, and hear exactly which note changes between them.",
      why: "A shape you can name is a shape you can use. Major and minor differ by one fret on one string, and that is the best ear training you can get on a guitar. Diminished comes last because it sounds tense and wants to go somewhere; it is what makes a sweep sound like the fast, dramatic thing you came to this Path for.",
      howTo: [
        "Name the notes out loud as you practise, at least once. The spelled notes on each Exercise are there for that.",
        "Moving between inversions, shift during the last note of the bar, and arrive on the first finger of the new shape.",
        "Diminished seventh shapes repeat every three frets with the same four notes. You only have to learn it once.",
      ],
      payoff: "You can hear a C major become C minor under your own fingers, and an A minor sweep resolving from its diminished neighbour sounds like the real thing.",
      difficultyException:
        "The tempo eases off slightly so the player can hear each quality and manage the shifts between shapes; those are the new demand here.",
      exercises: [
        sweepExercise({
          id: "major-to-minor",
          title: "C major becomes C minor",
          purpose: "One fret, one string, a whole change of colour. E to Eb on the top string is the only move.",
          howTo: ["One bar of each. The note that changes is the third. Hear it before you play it."],
          coach: "The notes against each chord are what I can check here. Listen for the colour yourself.",
          tab: `/8t ${twoPerBar(c3)} | ${twoPerBar(cm3)}`,
          position: 11,
          shifts: true,
          chords: "C | Cm",
          harmony: { chordTones: true, cover: true },
          rungs: ladder(50, 120, 5),
          passAt: 85,
          minutes: 6,
        }),
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
          rungs: ladder(50, 110, 5),
          passAt: 80,
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
          rungs: ladder(50, 110, 5),
          passAt: 80,
          minutes: 6,
        }),
        sweepExercise({
          id: "diminished-triad",
          title: "B diminished",
          purpose: "A diminished triad, B, D, F, in the turn-with-the-pick form. It is the darkest sound on this Path, and it is only three notes.",
          howTo: ["No top note yet: both turns are pick turns. Hear how it wants to fall to C or A minor."],
          coach: "I can check the three notes after the take. Whether it sounds dark and tense is for you to enjoy.",
          tab: `/16 ${repeat("3:16 2:15 1:13 2:15", 4)}`,
          position: 13,
          harmony: { arpeggio: "Bdim", cover: true },
          rungs: ladder(50, 120, 5),
          passAt: 80,
          minutes: 5,
        }),
        sweepExercise({
          id: "diminished-resolves",
          title: "Diminished resolving to Am",
          purpose: "Am to G# diminished 7 and back: the shape moves up three frets with the same notes, then resolves. This is the neoclassical sound in one line.",
          howTo: [
            "G#dim7 at fret 10 and Bdim7 at fret 13 are the same four notes, played from different places. Only the shape's position changes.",
            "Hear the G# pull up to A at the end of the line.",
          ],
          coach: "Well done if this sounds dramatic. That part is not something I measure, only that the notes are right.",
          tab: `/8t ${twoPerBar(am3)} | ${twoPerBar(gsDim)} | ${twoPerBar(bDim7)} | ${twoPerBar(am3)}`,
          position: 12,
          shifts: true,
          chords: "Am | G#dim7 | Bdim7 | Am",
          harmony: { chordTones: true, cover: true },
          rungs: ladder(50, 110, 5),
          passAt: 80,
          minutes: 6,
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
          coach: "Evenness and the right notes on the slow rungs. Above them, it is your own judgement.",
          tab: `/16 ${repeat(c4, 2)}`,
          position: 8,
          harmony: { arpeggio: "C", cover: true },
          rungs: ladder(50, 120, 5),
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
          rungs: ladder(50, 120, 5),
          passAt: 80,
          minutes: 6,
        }),
        sweepExercise({
          id: "g-four",
          title: "G major, the barre roll",
          purpose: "Three strings on fret 12 under one finger. It's a rolling problem more than a picking one, so it's your check on the fretting-hand mute.",
          howTo: ["Roll across fret 12, then drop to fret 10 on the top string with your first finger. You will need to re-think which finger goes where, and that's fine: the sound is what matters."],
          coach: "I can check the notes if they are separate enough. If I can't, that is useful to know too.",
          tab: `/16 ${repeat(g4, 2)}`,
          position: 10,
          harmony: { arpeggio: "G", cover: true },
          rungs: ladder(50, 120, 5),
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
          rungs: ladder(50, 110, 5),
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
          coach: "Up to the graded rungs I can check notes and evenness. Above that the tempo is yours to judge, on a recording.",
          tab: `/8t ${am5}`,
          position: 12,
          harmony: { arpeggio: "Am", cover: true },
          rungs: ladder(50, 160, 10),
          passAt: 100,
          selfCheck: [ROLL_CHECK, NOISE_CHECK],
          minutes: 7,
        }),
        sweepExercise({
          id: "c-five",
          title: "C major from the A string",
          purpose: "Major: G hammered up to C, then E, G, C, E and a three-fret top reach. It is a wider shape at the bottom and easier at the top.",
          howTo: ["The reach from fret 10 to 15 on the A string is your widest. Warm up before pushing on this one."],
          coach: "The same bar as Am. Compare the takes.",
          tab: `/8t ${c5}`,
          position: 10,
          harmony: { arpeggio: "C", cover: true },
          rungs: ladder(50, 160, 10),
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
          rungs: ladder(50, 160, 10),
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
          rungs: ladder(50, 150, 10),
          passAt: 90,
          pass: SLIDE_BARS,
          selfCheck: [ROLL_CHECK, NOISE_CHECK],
          minutes: 6,
        }),
      ],
    },
    {
      id: "moving-shapes",
      title: "Moving shapes",
      goal: "Change five-string shape at the bar line with no gap and no lost notes.",
      why: "You now have shapes, and music asks for them in a hurry. A real progression doesn't wait while you find the next one, so this Step is where the shapes you own become usable: the hand travels in the time of one note, and the sweep picks up as if nothing happened.",
      howTo: [
        "Look at the next shape before you need it. The eye gets there first, then the hand.",
        "Most of these moves happen in the last note of the bar. Let that note go, and be early rather than late.",
        "Practise only the move first: the last two notes of the bar and the first two of the next.",
      ],
      payoff: "A real four-chord progression played entirely in big sweeps.",
      exercises: [
        sweepExercise({
          id: "am-dm",
          title: "Am down to Dm",
          purpose: "A big move of seven frets between two minor shapes. It is an obvious, musical change, and a good test of how far the hand can travel.",
          howTo: ["Am at fret 12, Dm at fret 5. Note the Dm's slide at the top: frets down there are too wide to hammer."],
          coach: "A large shift is where the first note after it goes missing. Check that note after the take.",
          tab: `/8t ${am5} | ${dm5}`,
          position: 12,
          shifts: true,
          chords: "Am | Dm",
          harmony: { chordTones: true, cover: true },
          rungs: ladder(50, 120, 5),
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
          rungs: ladder(50, 130, 5),
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
          rungs: ladder(50, 120, 5),
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
          coach: "A chain of pull-offs may be too quiet for me, and that's fine. It's the picked notes I can check.",
          tab: `/8t 3:14 2:13 1:12 1:17h 1:15p 1:13p 1:12p 2:15 2:13 2:12 3:14 3:12 | /2 3:14v /4 r r`,
          position: 12,
          shifts: true,
          harmony: { scale: ["A", "naturalMinor"], cover: true },
          rungs: ladder(50, 120, 5),
          passAt: 90,
          minutes: 7,
        }),
        sweepExercise({
          id: "lick-to-bend",
          title: "Two strings, a run, and a bend",
          purpose: "Your two-string lick from Step 1, extended with a three-string start and finishing in a whole-tone bend. It ties the whole Path back to where it began.",
          howTo: ["Sweep through G, B and E, then the lick. The last note is D on the G string, bent up to E and held with vibrato. Hear E on the B string first, so you know where the bend has to reach."],
          coach: "I can check the picked notes. How far the bend went is up to your ear: compare it with the E at fret 5 on the B string.",
          tab: `/8t 3:5 2:5 1:5 1:8h 1:5p 2:8 2:5p 3:7 3:5 3:7 3:5 4:7 | /2 3:7b2v /4 r r`,
          position: 5,
          harmony: { scale: ["A", "minorPentatonic"], cover: true },
          rungs: ladder(50, 120, 5),
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
          tab: `/8t ${repeat("3:14 2:13 1:12 1:10p 2:12 3:12", 2)}`,
          position: 10,
          harmony: { scale: ["A", "naturalMinor"] },
          rungs: ladder(50, 150, 10),
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
      title: "Over a chord progression",
      goal: "Play sweeps that follow Am, F, C, G over a band, from three strings up to five, and one chorus you put together yourself.",
      why: "Everything so far has been against a click. A band is different: the bass already plays the root, so your arpeggio can start somewhere else, and the drums will happily cover you if you get lost for a beat. This is where it stops being an exercise and sounds like what you hoped to play.",
      howTo: [
        "Keep the volume honest: if the band is covering your mistakes, turn it down until they show.",
        "Use direct input or headphones for a graded take. A microphone also hears the band, and that hasn't been tested.",
        "Start each version at a rung where you can look up from the guitar. You're playing with people now, even if the people are samples.",
      ],
      payoff: "You play a sweep arpeggio solo over a band, and it follows the chords.",
      exercises: [
        sweepExercise({
          id: "band-three",
          title: "With the band: three strings",
          purpose: "The three-string shapes, one per chord. Short enough to stay clean, and the first time you hear your own sweep sitting on a progression.",
          howTo: ["Two loops a bar. Lock the first note of each bar to the kick and let the rest fall into place."],
          coach: "Band in the room, so direct input if you want these numbers to mean something.",
          tab: `/8t ${twoPerBar(am3)} | ${twoPerBar(f3)} | ${twoPerBar(c3)} | ${twoPerBar(g3)}`,
          position: 12,
          shifts: true,
          chords: "Am | F | C | G",
          jam: { groove: "rockTwelveEight", key: "A minor" },
          harmony: { chordTones: true, cover: true },
          rungs: ladder(60, 120, 5),
          passAt: 90,
          minutes: 7,
        }),
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
  "ii°-V-i-iv": "Bdim7 | E | Am | Dm",
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

const LINK_CHECK =
  "At each change, did the sweep keep going, with no gap and no extra pick stroke before the new shape?";

/** Linked passes, one chord a bar, over a progression in a key. */
function linkedVariant(strings: readonly number[], near: number, rhythm: string, extra = false) {
  return (p: VariantParams) => {
    const { chart, chords } = keyed(p);
    const tab = linkedSweep({ chords, strings, near: nearFor(strings, near, p.key), rhythm, extra });
    return { tab, position: handAt(tab), chords: chart };
  };
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
        coach: "Very slow on purpose. I can check the notes against each chord after the take.",
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
        rungs: ladder(50, 95, 5),
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
        coach: "I can check that the right notes came in time. Whether a link was picked is up to your ear.",
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
        rungs: ladder(50, 160, 10),
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
        coach: "Four links per round. I can check notes and evenness at these tempos.",
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
        rungs: ladder(50, 130, 5),
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
        rungs: ladder(50, 120, 5),
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
    difficultyException:
      "Triplets and a lower tempo keep each note separate on a longer push, so the rate drops. Length and planning the links are the demand here.",
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
        rungs: ladder(50, 95, 5),
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
        rungs: ladder(50, 130, 10),
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
        rungs: ladder(50, 130, 5),
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
    difficultyException:
      "Back to three strings on purpose, so the attention goes to one new harmony: the major V.",
    exercises: [
      sweepExercise({
        id: "the-pull",
        title: "i to V and back",
        purpose: "Only two chords, so all of your attention goes on the half step from G# to A, on three strings.",
        howTo: ["One bar of each, twice round. Slow enough to hear the note that changes."],
        coach: "I can check that the G# is the G#, after the take.",
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
        rungs: ladder(50, 130, 5),
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
        rungs: ladder(50, 130, 5),
        passAt: 90,
        minutes: 7,
      }),
      sweepExercise({
        id: "linked-with-the-v",
        title: "One pass per chord, on four strings",
        purpose: "The same harmony as single passes across four strings, with a link at each end, so that it sounds like a line.",
        howTo: ["Four quarter notes a bar, and a breath before going round. Every chord gets one pass only, so you can't hide a wrong shape."],
        coach: "Slow notes and a big move at each link. The notes are what I check.",
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
        howTo: ["Two loops a chord on three strings; the last bar's Dm leads you round again. B diminished seventh is the same four notes every three frets, so its shape is the easy part."],
        coach: "If it sounds dark and resolved, that's on your ear. I'll report the notes.",
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
        rungs: ladder(50, 130, 5),
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
        rungs: ladder(50, 130, 5),
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
            return { tab, position: handAt(tab), harmony: { arpeggio: p.key, cover: true } };
          },
        },
        rungs: ladder(50, 150, 10),
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
        rungs: ladder(50, 130, 5),
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
        rungs: ladder(50, 120, 5),
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
        id: "i-iv-dim-i",
        title: "i, iv, vii°, i",
        purpose: "Two loops of each shape through the classic cadence, with the diminished seventh in place of the V. It's the same pull with a sharper edge.",
        howTo: ["Triplets. Hear the G# in the third bar rise to the A at the start of the fourth."],
        coach: "I can check the notes after the take. It sounds grand, I hope, but that part is for you to judge.",
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
        rungs: ladder(50, 130, 5),
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
        rungs: ladder(50, 130, 5),
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
        rungs: ladder(50, 120, 5),
        passAt: 85,
        minutes: 7,
      }),
      sweepExercise({
        id: "linked-phrase",
        title: "An original line: up, link, and sing",
        purpose: "A short phrase written for this Path. Am up five strings, a half-step link into E major, and then a held A. Use it as a shape for writing your own.",
        howTo: ["Bar 1 up and back on Am. In bar 2 the shape moves a fret for E major. Land on the held A with some vibrato, and take your time before going round."],
        coach: "The held note is the point, and I can't judge how it sings. I'll report the notes before it.",
        tab: `/8t 5:12 5:15h 4:14 3:14 2:13 1:12 1:17h 1:12p 2:13 3:14 4:14 5:15 | /8t 5:14p 4:14 3:13 2:12 1:12 1:16h 1:12p 2:12 3:13 4:14 5:14 5:14 | /2 1:17v /4 r r`,
        position: 12,
        chords: "Am | E | Am",
        harmony: { chordTones: true },
        rungs: ladder(50, 130, 5),
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
  beginner: ["two-strings", "three-strings", "turnaround"],
  intermediate: [
    "qualities",
    "the-link",
    "link-chains",
    "four-strings",
    "five-strings",
    "long-chains",
    "moving-shapes",
    "minor-progressions",
    "phrases",
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
  goal: "Sweep clean, separated arpeggios from two strings to six, and link them through minor-key progressions so they sound like a solo.",
  level: "intermediate",
  assumes:
    "You can alternate-pick single notes evenly at sixteenths around 80 BPM (Alternate Picking through its Intermediate Level covers this) and you can hammer on and pull off cleanly. You don't need any sweeping yet, and you can start at whichever Level suits you.",
  prerequisites: { skills: ["Even alternate picking at sixteenths, 80 BPM", "Clean hammer-ons and pull-offs"] },
  orderRationale:
    "Three Levels, each open from the start. Beginner is one shape, clean: the mute from the first Exercise, because it separates a sweep from a strummed chord and bad habits here are hard to undo, then the turnaround on three strings where it's cheapest to learn. Intermediate is built around linking, which the owner asked for as the backbone and which I agree with. Qualities come first because a link needs a named chord to go to, and the major V isn't a shape you can skip. The link is taught as its own skill on three strings before any bigger shape, slowly and in isolation, then in chains, and only then with four and five strings, because a long shape makes a bad link worse. Five-string shapes still get their own Step before being linked. The harmonic-minor V comes after chains so it is the one new thing. Advanced adds six strings, wide shifts and neoclassical sequences. Six strings are there because players want them; they add reach and discipline more than music, so they are one Step and not the point of the Level. Two choices here go against the examples I was given. A major ii-V-I has no Step of its own: this Path is minor-key, so the minor ii°-V-i takes its place. And chains change chord once a bar, because Jam's grid is one chord to a bar, where fast playing in this style often changes every two beats. That is a limit of the backing today, not a teaching choice. The progressions are common vocabulary and every line is written for this Path: nothing is transcribed from a song or copied from a course.",
  gradingLimits:
    "Grading stops being trustworthy at about 150 ms between notes: sixteenths at 100 BPM, eighth triplets at 133, sextuplets at 66. Rungs faster than that are self-checked, whatever they look like, and the card says where grading stops. That line is a cautious policy, not a measurement. No test anywhere covers swept notes, whose attacks are softer than picked ones and whose notes can ring on neighbouring strings, and even the graded rungs are provisional until there has been a real-guitar test. Links add a risk of their own: the note after a slide counts as missed if it isn't heard, so bars on sliding shapes are lower. In practice: Beginner is almost all graded. In Intermediate, the sixteenth-note shapes stop at 100 BPM and triplet shapes at 130, and the sextuplet pickup at 65. In Advanced most of what makes the playing hard can't be graded: sextuplet runs stop at 65 BPM, six-string shapes in sixteenths stop at 100. Sound never tells us the two things that matter most here, muting and pick path, and the Exercises say so.",
  steps: [...LEVEL_STEPS.beginner, ...LEVEL_STEPS.intermediate, ...LEVEL_STEPS.advanced].map(stepNamed),
  levels: [
    {
      id: "beginner",
      title: "Beginner: one shape, cleanly",
      summary: "The motion and the mute, on two and three strings, up to a clean turnaround at the top.",
      reachLevel: "intermediate",
      startHereIf: [
        "You can alternate-pick even sixteenths at about 80 BPM.",
        "You can hammer on and pull off cleanly, without picking.",
        "You've never swept, or when you do, the notes ring together like a strummed chord.",
      ],
      steps: LEVEL_STEPS.beginner,
      warmups: [
        sweepExercise({
          id: "triads-around",
          title: "Triads around the neck",
          purpose: "One three-string shape in different places and keys, two loops at each stop, so the first five minutes aren't the same notes as yesterday.",
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
              const tab = sweepChain({ chords: walk.map(() => chord), strings: [3, 2, 1], near: walk[0], nears: walk, perBar: 2, rhythm: "/8t" });
              return { tab, position: handAt(tab), shifts: true, harmony: { arpeggio: chord, cover: true } };
            },
          },
          grade: "warmup",
          warmup: { start: 0.6, top: 0.8, reference: "turnaround.minor-high", fallback: 60 },
          rungs: ladder(50, 110, 5),
          minutes: 4,
        }),
      ],
    },
    {
      id: "intermediate",
      title: "Intermediate: linking arpeggios",
      summary: "The backbone of this Path. Name the shapes, learn the link between two of them, then chain them through minor-key progressions on three, four and five strings.",
      reachLevel: "intermediate",
      startHereIf: [
        "You can loop a three-string minor shape with a hammer and a pull, cleanly, at 90 BPM triplets.",
        "On a recording of that loop, each note stops as the next one starts.",
        "You can name which note makes a triad major or minor, even if it takes a moment.",
        "Shapes are fine and it's getting from one to the next that falls apart.",
      ],
      steps: LEVEL_STEPS.intermediate,
      warmups: [
        sweepExercise({
          id: "progression-of-the-day",
          title: "A progression of the day",
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
          warmup: { start: 0.6, top: 0.85, reference: "link-chains.looped-chain", fallback: 60 },
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
          warmup: { start: 0.6, top: 0.85, reference: "long-chains.chain-five", fallback: 60 },
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
