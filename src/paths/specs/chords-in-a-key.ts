/**
 * Chords in a Key, a Theory Path. A draft: no teacher or guitarist has reviewed it.
 *
 * The second new Path on the harmony route (`plans/paths/NEW_PATHS.md`, "The
 * curriculum map"). Triads taught what a chord is. This one answers the next
 * question a player with no theory asks: which chords go together, and why.
 * A key is one scale; build a triad on each of its notes and seven chords come
 * out, always in the same pattern. Everything else here is those seven chords,
 * numbered, in the orders songs use, in several keys.
 *
 * Graded the way Triads is: every chord is played one note at a time.
 */
import { definePath } from "../spec";
import type { VariantParams } from "../spec";
import { handAt, ladder, moveChart, shiftFrets } from "../templates";
import { KEY_OF_G } from "./harmony-more";
import { BORROWED, FOUR_CHORD_SONGS, KEY_OF_A, MINOR_KEY_E, SEVENTHS, SEVENTHS_IN_SONGS, SIXTEEN_BARS } from "./chords-more";
import { chartIn as chartInKey } from "./triadShapes";
import { ROCK, bars, mid, named, toTop, top } from "./triadShapes";
import { keyHowTo } from "./keyText";

const YOUR_TURN = { grade: "selfChecked", example: true } as const;
const NOT_CHECKED_YET =
  "Your turn, and not checked yet: the app can't judge notes you choose, so you tick it off yourself.";
const VARIANT_NOTE =
  "The frets and chord names here are for the first version. On other days the same line comes in another key, higher or lower on the neck.";

// The chords of C major on the top three strings.
const C_LOW = top(5, 5, 3);
const C_MID = top(9, 8, 8);
const DM_LOW = top(7, 6, 5);
const DM_MID = top(10, 10, 10);
const EM_LOW = top(4, 5, 3);
const EM_MID = top(9, 8, 7);
const F_LOW = top(5, 6, 5);
const F_MID = top(10, 10, 8);
const G_LOW = top(4, 3, 3);
const G_MID = top(7, 8, 7);
const AM_LOW = top(5, 5, 5);
const AM_MID = top(9, 10, 8);
const E_MID = top(4, 5, 4);

const FIRST_FOUR = [C_LOW, DM_LOW, EM_MID, F_MID];
// The upper four, root lowest, on the D, G and B strings.
const UPPER_FOUR = [mid(5, 4, 3), mid(7, 5, 5), mid(9, 7, 6), mid(10, 9, 8)];
const ALL_SEVEN = bars(...FIRST_FOUR, ...UPPER_FOUR);
const SEVEN_CHART = "C | Dm | Em | F | G | Am | Bdim | C";

const ONE_SIX_TWO_FIVE = bars(C_LOW, AM_LOW, DM_LOW, G_LOW);
const TWO_FIVE_ONE = bars(DM_LOW, G_MID, C_MID, C_MID);
const ONE_FOUR_FIVE_EIGHT = bars(C_LOW, C_LOW, F_LOW, F_LOW, G_LOW, F_LOW, C_LOW, C_LOW);
const EIGHT_CHART = "C | C | F | F | G | F | C | C";
const TWELVE_CHART = "C | C | C | C | F | F | C | C | G | F | C | G";
const twelve = (c: ReturnType<typeof top>, f: ReturnType<typeof top>, g: ReturnType<typeof top>) =>
  bars(c, c, c, c, f, f, c, c, g, f, c, g);
const TWELVE_LOW = twelve(C_LOW, F_LOW, G_LOW);
const VERSE_CHORUS = bars(AM_LOW, F_LOW, C_LOW, G_LOW, C_MID, G_MID, AM_MID, F_MID);
const VERSE_CHORUS_CHART = "Am | F | C | G | C | G | Am | F";

/** `moveChart` spells by flats; the sharp keys here want G sharp minor and D sharp minor. */
const chartIn = (chart: string, by: number, key: string) =>
  ["E", "B"].includes(key) ? moveChart(chart, by).replace(/Abm/g, "G#m").replace(/Ebm/g, "D#m") : moveChart(chart, by);

/** A line in C moved along the neck to other keys; the chart and the band move with it. */
function inKeys(tab: string, chart: string, shifts: Readonly<Record<string, number>>) {
  return {
    values: { key: Object.keys(shifts) },
    pooled: ["key"] as const,
    label: (p: VariantParams) => `In ${p.key}`,
    build: (p: VariantParams) => {
      const moved = shiftFrets(tab, shifts[p.key]);
      const chords = chartIn(chart, shifts[p.key], p.key);
      return {
        tab: moved,
        position: handAt(moved),
        shifts: true,
        chords,
        jam: ROCK(p.key),
        harmony: { chordTones: true as const },
        // Every key after the first reads its own frets and chords (`keyText.ts`).
        howTo: keyHowTo({ kind: "shapes", key: p.key, tab: moved, chords, shift: shifts[p.key], home: "C" }),
      };
    },
  };
}

export default definePath({
  id: "chords-in-a-key",
  title: "Chords in a Key",
  kind: "theory",
  category: "harmony",
  goal: "Know the seven chords of a major key by number, play the progressions a great many songs are made of with small shapes, and move any of them to another key.",
  level: "early-intermediate",
  assumes:
    "You can play major and minor triads in three shapes on the top strings and change between C, A minor, F and G with the nearest shapes at 90 BPM: the first two Levels of Triads. The shapes on the D, G and B strings are shown as they come. No other theory is assumed. The minutes listed are one pass through the material; the progressions are worth coming back to in every key you play in.",
  prerequisites: {
    paths: [{ path: "triads", level: "intermediate" }],
    skills: ["Major and minor triads on the top strings", "Eighth notes with a click at 80 BPM"],
  },
  labelSubdivisions: "mostly",
  paceLadders: true,
  orderRationale:
    "All seven chords of the key first, built in order from the scale, because the pattern of major and minor is the thing to learn and it is the same in every key. Numbers come next and letters go into the background: a progression is a set of numbers, and a key is where you put them. The three major chords come before the three minor ones because most songs can be played with them alone. Named progressions follow, one at a time. One, four and five move to other keys as soon as they have numbers; the longer progressions move later, once the numbers are familiar, so that changing key is moving a known thing. The minor key is late because it is the same seven chords counted from a different one. Longer forms follow: twelve bars, a verse and a chorus, then sixteen bars with a bridge. Each idea is given a second and a third key before the next arrives (G and A in full, E minor after A minor), because a number only becomes a number once it has stood for several different chords. Chords from outside the key wait until the key itself is secure, and the seventh chords come last: they are the same seven chords with one more note each, and they hand the player on to Arpeggios over Changes.",
  gradingLimits:
    "Every graded Exercise is played one note at a time: after the take, the app checks that you played the written notes, counts them and times them. It cannot tell which string a pitch came from, so a right note in the wrong place passes, and it cannot hear whether you held each shape down like a chord. Strummed chords are not graded anywhere in this Path. It cannot hear you say a chord's number either: that part is yours. The band Exercises have only been tried on computer-made guitar sound, so direct input or headphones are the honest way to play them. Choosing your own chords and shapes is 'your turn', self-checked and labelled 'not checked yet'.",
  steps: [
    {
      id: "seven-chords",
      title: "A chord on every note",
      goal: "Build a triad on each note of the C major scale, play all seven in order, and say which are major and which are minor.",
      why: "A key is a scale, and the chords of a key are what you get by building a triad on each of its notes using only notes of that scale. Do that in C and seven chords come out: C, D minor, E minor, F, G, A minor and one odd one on B. You did not choose which are major and which are minor: the scale did. The pattern is the same in every major key, which is why learning it once is enough.",
      howTo: [
        "The pattern: major, minor, minor, major, major, minor, and the seventh is called diminished. Say it until it is automatic.",
        "Diminished is a minor triad with its fifth lowered one fret too: B minor would be B, D, F sharp, and B diminished is B, D, F. It sounds unsettled, and songs use it rarely. Know it exists and move on.",
        "In the first two Exercises the root is the lowest note of every shape, so you can follow it up the scale. The third uses the nearest shapes, where the root is often not the lowest note.",
        "To build them yourself: start on any note of the scale, skip the next, take the one after, skip, take. C, E, G. D, F, A. E, G, B. And so on.",
      ],
      payoff: "You can name the seven chords of C major and play them in order.",
      exercises: [
        {
          id: "upper-four",
          title: "G, A minor, B diminished, C",
          purpose: "The chords on notes five, six, seven and one of the scale, on the D, G and B strings with the root lowest. In Triads you walked up the first four; these are the rest.",
          howTo: [
            "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord.",
            "These shapes are on the D, G and B strings, which may be new to you: the D string's note is the lowest. G: D string 5, G string 4, B string 3. A minor: 7, 5, 5. B diminished: 9, 7, 6. C: 10, 9, 8. The D string's fret is given first, and its note is the root: G, A, B, C.",
            "The diminished shape is the widest: fourth finger on fret 9, second on 7, first on 6.",
          ],
          coach: "Band on. Right notes and time after the take.",
          tab: bars(...UPPER_FOUR),
          position: 3,
          shifts: true,
          chords: "G | Am | Bdim | C",
          jam: ROCK("C"),
          harmony: { chordTones: true },
          rungs: ladder(60, 120, 10),
          passAt: 90,
          ...named(),
          minutes: 6,
        },
        {
          id: "all-seven",
          title: "All seven, and home",
          purpose: "Eight bars: a chord on every note of the scale, C to C. After F the line drops to the D, G and B strings, so G, A minor and B diminished sound lower than the first four, and the last C is the same three notes as the first, one set of strings lower.",
          howTo: [
            "Straight eighths, 60 BPM up to a pass at 85. One bar on each chord.",
            "Bars 1 to 4, top three strings, G string first: C is 5, 5, 3. D minor is 7, 6, 5. E minor is 9, 8, 7. F is 10, 10, 8.",
            "Bars 5 to 8, D, G and B strings, D string first: G is 5, 4, 3. A minor is 7, 5, 5. B diminished is 9, 7, 6. C is 10, 9, 8.",
            "Say the pattern as you go: major, minor, minor, major, major, minor, diminished, major.",
          ],
          coach: "Eight bars with the band. Right notes and time after the take.",
          tab: ALL_SEVEN,
          position: 3,
          shifts: true,
          chords: SEVEN_CHART,
          jam: ROCK("C"),
          harmony: { chordTones: true },
          rungs: ladder(60, 110, 5),
          passAt: 85,
          ...named(0.75, 8),
          minutes: 7,
        },
        {
          id: "majors-and-minors",
          title: "Three major, three minor",
          purpose: "The three major chords of the key, C, F and G, then the three minor ones, A minor, D minor and E minor, all between frets 3 and 7. Six chords within five frets.",
          howTo: [
            "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord, eight bars.",
            "Bars 1 to 4: C is 5, 5, 3. F is 5, 6, 5. G is 4, 3, 3. C again.",
            "Bars 5 to 8: A minor is 5, 5, 5. D minor is 7, 6, 5. E minor is 4, 5, 3. A minor again.",
          ],
          coach: "Band on. Right notes and time after the take.",
          tab: bars(C_LOW, F_LOW, G_LOW, C_LOW, AM_LOW, DM_LOW, EM_LOW, AM_LOW),
          position: 3,
          shifts: true,
          chords: "C | F | G | C | Am | Dm | Em | Am",
          jam: ROCK("C"),
          harmony: { chordTones: true },
          rungs: ladder(60, 120, 10),
          passAt: 90,
          ...named(0.75, 8),
          minutes: 7,
        },
      ],
    },
    {
      id: "numbers",
      title: "Chords have numbers",
      goal: "Call the chords of a key by number, play the first, fourth and fifth in an eight-bar form, and play the same numbers in other keys.",
      why: "Musicians number the chords of a key from one to seven, the same way you numbered the notes of the scale. C is one, F is four, G is five. The reason is practical: a song is the same song in any key, and its numbers do not change when its letters do. 'One, four, five' is a great many songs. Written down, the numbers are Roman numerals: I, IV, V. Minor chords are usually written small: ii, iii, vi.",
      howTo: [
        "In C: one is C, four is F, five is G. They are the three major chords of the key.",
        "Five wants to go home to one. Play G and then C and listen to it arrive.",
        "In any other key, find one, and four and five are in the same places around it in the shapes you know.",
      ],
      payoff: "You hear 'one, four, five' and your hand knows three shapes, in whatever key is called.",
      difficultyException:
        "Three chords here against seven in the Step before, so fewer changes and a lower rate. The new demand is thinking in numbers and keeping an eight-bar form, which the metric does not count.",
      exercises: [
        {
          id: "one-four-five-middle",
          title: "One, four, five on the middle strings",
          purpose: "C, F and G and back to C on the D, G and B strings, between frets 3 and 7. The same three numbers you played on the top strings in Triads, one set of strings lower.",
          howTo: [
            "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord.",
            "C: all three strings at fret 5. F: D string 7, G string 5, B string 6. G: D string 5, G string 4, B string 3. Then C again.",
            "Say the number at each bar line: one, four, five, one.",
          ],
          coach: "Band on. Right notes and time after the take.",
          tab: bars(mid(5, 5, 5), mid(7, 5, 6), mid(5, 4, 3), mid(5, 5, 5)),
          position: 3,
          shifts: true,
          chords: "C | F | G | C",
          jam: ROCK("C"),
          harmony: { chordTones: true },
          rungs: ladder(60, 120, 10),
          passAt: 90,
          ...named(),
          minutes: 6,
        },
        {
          id: "eight-bar-form",
          title: "One, one, four, four, five, four, one, one",
          purpose: "An eight-bar form made of the three major chords, the kind a simple song sits on. Two bars at home, two on four, then five, four, and two bars home.",
          howTo: [
            "Straight eighths, 60 BPM up to a pass at 90. Top three strings, around fret 5.",
            "C is 5, 5, 3. F is 5, 6, 5. G is 4, 3, 3. Follow the form: C, C, F, F, G, F, C, C.",
            "Count the bars in twos. Only the G in bar 5 and the F in bar 6 last a single bar.",
          ],
          coach: "Eight bars with the band. Right notes and time after the take.",
          tab: ONE_FOUR_FIVE_EIGHT,
          position: 3,
          shifts: true,
          chords: EIGHT_CHART,
          jam: ROCK("C"),
          harmony: { chordTones: true },
          rungs: ladder(60, 120, 10),
          passAt: 90,
          ...named(0.75, 8),
          minutes: 6,
        },
        {
          id: "eight-bar-keys",
          title: "The same numbers in a new key",
          purpose: "The eight-bar form moved along the neck. In D the three chords are D, G and A; in E they are E, A and B; in B flat they are B flat, E flat and F. The numbers are one, four and five every time.",
          howTo: [
            "Straight eighths, 60 BPM up to a pass at 90.",
            "In D everything is two frets higher than in C: D is 7, 7, 5. G is 7, 8, 7. A is 6, 5, 5.",
            VARIANT_NOTE,
          ],
          coach: "A key that changes from day to day. Right notes and time after the take.",
          vary: inKeys(ONE_FOUR_FIVE_EIGHT, EIGHT_CHART, { D: 2, E: 4, Bb: -2 }),
          tab: shiftFrets(ONE_FOUR_FIVE_EIGHT, 2),
          position: 5,
          shifts: true,
          chords: moveChart(EIGHT_CHART, 2),
          jam: ROCK("D"),
          harmony: { chordTones: true },
          rungs: ladder(60, 120, 10),
          passAt: 90,
          ...named(0.75, 8),
          minutes: 6,
        },
      ],
    },
    {
      id: "the-minors",
      title: "Two, three and six",
      goal: "Pair each major chord of the key with the minor chord two scale notes below it, which shares two of its notes, and play one, six, two, five.",
      why: "The three minor chords of the key are not strangers. Each one is a major chord with one note moved: C and A minor share C and E, F and D minor share F and A, G and E minor share G and B. That is why a song can swap one for the other and sound like a darker version of the same song. Six, two and three are the numbers of A minor, D minor and E minor in the key of C.",
      howTo: [
        "C to A minor: G moves up to A, on the top string, fret 3 to fret 5.",
        "F to D minor: C moves up to D, on the G string, fret 5 to fret 7.",
        "G to E minor: D moves up to E, on the B string, fret 3 to fret 5.",
      ],
      payoff: "Six chords that feel like three pairs, and one of the most used four-chord turns in older songs: one, six, two, five.",
      exercises: [
        {
          id: "pairs",
          title: "C and A minor, F and D minor",
          purpose: "Two major chords, each followed by the minor chord two scale notes below it. One note moves in each pair.",
          howTo: [
            "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord.",
            "C is 5, 5, 3 and A minor is 5, 5, 5: only the top string changes. F is 5, 6, 5 and D minor is 7, 6, 5: only the G string changes.",
          ],
          coach: "Band on. Right notes and time after the take.",
          tab: bars(C_LOW, AM_LOW, F_LOW, DM_LOW),
          position: 3,
          shifts: true,
          chords: "C | Am | F | Dm",
          jam: ROCK("C"),
          harmony: { chordTones: true },
          rungs: ladder(60, 120, 10),
          passAt: 90,
          ...named(),
          minutes: 6,
        },
        {
          id: "five-and-three",
          title: "G and E minor",
          purpose: "The third pair, then C and back to G: G, E minor, C, G. Five, three, one, five.",
          howTo: [
            "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord.",
            "G is 4, 3, 3 and E minor is 4, 5, 3: only the B string changes. C is 5, 5, 3, and G again.",
          ],
          coach: "Band on. Right notes and time after the take.",
          tab: bars(G_LOW, EM_LOW, C_LOW, G_LOW),
          position: 3,
          shifts: true,
          chords: "G | Em | C | G",
          jam: ROCK("C"),
          harmony: { chordTones: true },
          rungs: ladder(60, 120, 10),
          passAt: 90,
          ...named(),
          minutes: 6,
        },
        {
          id: "one-six-two-five",
          title: "One, six, two, five",
          purpose: "C, A minor, D minor, G: a turn that goes round and round and always wants to start again, because five leads back to one.",
          howTo: [
            "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord.",
            "C is 5, 5, 3. A minor is 5, 5, 5. D minor is 7, 6, 5. G is 4, 3, 3.",
            "Say the numbers: one, six, two, five.",
          ],
          coach: "Band on. Right notes and time after the take.",
          tab: ONE_SIX_TWO_FIVE,
          position: 3,
          shifts: true,
          chords: "C | Am | Dm | G",
          jam: ROCK("C"),
          harmony: { chordTones: true },
          rungs: ladder(60, 120, 10),
          passAt: 90,
          ...named(),
          minutes: 6,
        },
      ],
    },
    {
      id: "progressions",
      title: "Three progressions worth knowing by name",
      goal: "Play two, five, one; six, four, one, five; and one, three, four, five, each with the nearest shapes.",
      why: "A progression is a short run of chord numbers that turns up in song after song. Learn a handful as numbers and you can follow most songs by ear, because you are listening for a few known shapes instead of every chord from scratch. These three, with the ones you have, cover a very large part of popular music.",
      howTo: [
        "Two, five, one (D minor, G, C) is a very strong way home. Jazz uses it constantly, and pop uses it at the ends of lines.",
        "Six, four, one, five (A minor, F, C, G) is the song from Triads, C, G, A minor, F, which is one, five, six, four, started from its third chord. Starting on the minor chord makes the same four sound darker.",
        "One, three, four, five (C, E minor, F, G) climbs through the scale: its roots are notes one, three, four and five. In these shapes the root is not always the lowest note, so listen for the band's bass rising.",
      ],
      payoff: "Three more progressions you can name when you hear them.",
      difficultyException:
        "The same kind of four-bar line as the Step before: the metric moves a few hundredths with which strings each shape happens to use. The new demand is knowing a progression by its numbers.",
      exercises: [
        {
          id: "two-five-one",
          title: "Two, five, one",
          purpose: "D minor, G, and two bars of C, climbing a little with each chord so the arrival on C is the highest point.",
          howTo: [
            "Straight eighths, 60 BPM up to a pass at 90.",
            "D minor is 7, 6, 5. G is 7, 8, 7. C is 9, 8, 8, for two bars.",
            "Listen for the pull: two leans on five, and five falls into one.",
          ],
          coach: "Band on. Right notes and time after the take.",
          tab: TWO_FIVE_ONE,
          position: 5,
          shifts: true,
          chords: "Dm | G | C | C",
          jam: ROCK("C"),
          harmony: { chordTones: true },
          rungs: ladder(60, 120, 10),
          passAt: 90,
          ...named(),
          minutes: 6,
        },
        {
          id: "six-four-one-five",
          title: "Six, four, one, five",
          purpose: "A minor, F, C, G around fret 5. The same four chords as the song in Triads, starting from the minor one.",
          howTo: [
            "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord.",
            "A minor is 5, 5, 5. F is 5, 6, 5. C is 5, 5, 3. G is 4, 3, 3.",
          ],
          coach: "Band on. Right notes and time after the take.",
          tab: bars(AM_LOW, F_LOW, C_LOW, G_LOW),
          position: 3,
          shifts: true,
          chords: "Am | F | C | G",
          jam: ROCK("C"),
          harmony: { chordTones: true },
          rungs: ladder(60, 120, 10),
          passAt: 90,
          ...named(),
          minutes: 6,
        },
        {
          id: "one-three-four-five",
          title: "One, three, four, five",
          purpose: "C, E minor, F, G around fret 8. From C to E minor one note moves by one fret, which is why three follows one so smoothly.",
          howTo: [
            "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord.",
            "C is 9, 8, 8. E minor is 9, 8, 7. F is 10, 10, 8. G is 7, 8, 7.",
          ],
          coach: "Band on. Right notes and time after the take.",
          tab: bars(C_MID, EM_MID, F_MID, G_MID),
          position: 7,
          shifts: true,
          chords: "C | Em | F | G",
          jam: ROCK("C"),
          harmony: { chordTones: true },
          rungs: ladder(60, 120, 10),
          passAt: 90,
          ...named(),
          minutes: 6,
        },
      ],
    },
    {
      id: "other-keys",
      title: "The same numbers, other keys",
      goal: "Play the seven chords of D major, and move one, six, two, five and two, five, one to keys that change from day to day.",
      why: "This is where the numbers pay for themselves. To play a song in a new key you do not learn new chords: you move the whole picture up or down the neck until one sits on the new key's note, and every number comes with it. The pattern of major and minor comes too, because it belongs to the numbers and not to the letters.",
      howTo: [
        "D is two frets above C, so every chord of D major is two frets above the matching chord of C major: D, E minor, F sharp minor, G, A, B minor, C sharp diminished.",
        "Before you play in a new key, say its one, four and five out loud. To name them, move the C names up by the same number of frets: two frets above C is D, two above F is G, two above G is A.",
        "The shapes and the fingers do not change at all. Only the fret does.",
      ],
      payoff: "A progression is something you can play in any key you are asked for.",
      exercises: [
        {
          id: "seven-in-d",
          title: "The seven chords of D",
          purpose: "The eight bars from the first Step, two frets higher. The pattern is the same: major, minor, minor, major, major, minor, diminished, major.",
          howTo: [
            "Straight eighths, 60 BPM up to a pass at 85. One bar on each chord.",
            "Bars 1 to 4, top three strings: D is 7, 7, 5. E minor is 9, 8, 7. F sharp minor is 11, 10, 9. G is 12, 12, 10.",
            "Bars 5 to 8, D, G and B strings: A is 7, 6, 5. B minor is 9, 7, 7. C sharp diminished is 11, 9, 8. D is 12, 11, 10.",
          ],
          coach: "Eight bars with the band. Right notes and time after the take.",
          tab: shiftFrets(ALL_SEVEN, 2),
          position: 5,
          shifts: true,
          chords: moveChart(SEVEN_CHART, 2),
          jam: ROCK("D"),
          harmony: { chordTones: true },
          rungs: ladder(60, 110, 5),
          passAt: 85,
          ...named(0.75, 8),
          minutes: 7,
        },
        {
          id: "one-six-two-five-keys",
          title: "One, six, two, five in a new key",
          purpose: "The turn you know, moved. In D it is D, B minor, E minor, A; in E it is E, C sharp minor, F sharp minor, B; in B flat it is B flat, G minor, C minor, F.",
          howTo: [
            "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord.",
            "In D: 7, 7, 5, then 7, 7, 7, then 9, 8, 7, then 6, 5, 5.",
            VARIANT_NOTE,
          ],
          coach: "A key that changes from day to day. Right notes and time after the take.",
          vary: inKeys(ONE_SIX_TWO_FIVE, "C | Am | Dm | G", { D: 2, E: 4, Bb: -2 }),
          tab: shiftFrets(ONE_SIX_TWO_FIVE, 2),
          position: 5,
          shifts: true,
          chords: "D | Bm | Em | A",
          jam: ROCK("D"),
          harmony: { chordTones: true },
          rungs: ladder(60, 120, 10),
          passAt: 90,
          ...named(),
          minutes: 6,
        },
        {
          id: "two-five-one-keys",
          title: "Two, five, one in a new key",
          purpose: "The way home, moved. In D it is E minor, A, D; in F it is G minor, C, F; in B flat it is C minor, F, B flat.",
          howTo: [
            "Straight eighths, 60 BPM up to a pass at 90.",
            "In D: E minor is 9, 8, 7. A is 9, 10, 9. D is 11, 10, 10, for two bars.",
            VARIANT_NOTE,
          ],
          coach: "A key that changes from day to day. Right notes and time after the take.",
          vary: inKeys(TWO_FIVE_ONE, "Dm | G | C | C", { D: 2, F: 5, Bb: -2 }),
          tab: shiftFrets(TWO_FIVE_ONE, 2),
          position: 7,
          shifts: true,
          chords: "Em | A | D | D",
          jam: ROCK("D"),
          harmony: { chordTones: true },
          rungs: ladder(60, 120, 10),
          passAt: 90,
          ...named(),
          minutes: 6,
        },
      ],
    },
    KEY_OF_G,
    KEY_OF_A,
    FOUR_CHORD_SONGS,
    {
      id: "minor-key",
      title: "The minor key",
      goal: "Play the main chords of A minor, and hear why its fifth chord is so often made major.",
      why: "A minor uses exactly the same seven notes as C major, and so the same seven chords. What changes is which one feels like home: A minor instead of C. Count from there and A minor is one, D minor is four, E minor is five, and F and G are six and seven, C is three and B diminished is two. The numbers start again from the new home: F was four in C major and is six in A minor, the same chord counted from a different one. A minor is called the relative minor of C major. One thing is new. Minor-key songs very often turn the fifth chord, E minor, into E major, because its G sharp pulls back to A much harder. It is the one note from outside the scale that you will meet all the time.",
      howTo: [
        "A minor key: one is A minor, four is D minor, five is E minor or E major.",
        "Six and seven, F and G, are the two major chords just below home. A minor, F, G, A minor is the sound of a great deal of rock.",
        "E major is E, G sharp, B. E minor is 4, 5, 3 and E major is 4, 5, 4: only the top string changes, G to G sharp, one fret below A.",
      ],
      payoff: "You can play the main chords of a minor key, and you know why its fifth chord is so often major.",
      exercises: [
        {
          id: "minor-one-four-five",
          title: "A minor, D minor, E minor",
          purpose: "One, four and five of the minor key, all minor chords, around fret 5.",
          howTo: [
            "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord, and A minor again to finish.",
            "A minor is 5, 5, 5. D minor is 7, 6, 5. E minor is 4, 5, 3.",
          ],
          coach: "Band on. Right notes and time after the take.",
          tab: bars(AM_LOW, DM_LOW, EM_LOW, AM_LOW),
          position: 3,
          shifts: true,
          chords: "Am | Dm | Em | Am",
          jam: ROCK("A minor"),
          harmony: { chordTones: true },
          rungs: ladder(60, 120, 10),
          passAt: 90,
          ...named(),
          minutes: 6,
        },
        {
          id: "minor-six-seven",
          title: "A minor, F, G",
          purpose: "Home, then the two major chords below it, and home again. One, six, seven, one in the minor key.",
          howTo: [
            "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord.",
            "A minor is 5, 5, 5. F is 5, 6, 5. G is 4, 3, 3. A minor again.",
          ],
          coach: "Band on. Right notes and time after the take.",
          tab: bars(AM_LOW, F_LOW, G_LOW, AM_LOW),
          position: 3,
          shifts: true,
          chords: "Am | F | G | Am",
          jam: ROCK("A minor"),
          harmony: { chordTones: true },
          rungs: ladder(60, 120, 10),
          passAt: 90,
          ...named(),
          minutes: 6,
        },
        {
          id: "down-to-e",
          title: "A minor, G, F, E",
          purpose: "A line that walks down from home to the fifth chord, played as E major. Each shape sits a little lower than the last, and the E major pulls you back to the top.",
          howTo: [
            "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord.",
            "A minor is 9, 10, 8. G is 7, 8, 7. F is 5, 6, 5. E major is 4, 5, 4.",
            "G, F and E are the same shape, two frets and then one fret lower each time. Say the numbers: one, seven, six, five.",
          ],
          coach: "Band on. Right notes and time after the take.",
          tab: bars(AM_MID, G_MID, F_LOW, E_MID),
          position: 4,
          shifts: true,
          chords: "Am | G | F | E",
          jam: ROCK("A minor"),
          harmony: { chordTones: true },
          rungs: ladder(60, 120, 10),
          passAt: 90,
          ...named(),
          minutes: 6,
        },
      ],
    },
    MINOR_KEY_E,
    {
      id: "two-places",
      title: "The same progression in two places",
      goal: "Play one, six, two, five around fret 8 as well as fret 5, both in one eight-bar take, and then with shapes you choose.",
      why: "A progression you can play in only one part of the neck is a fingering. One you can play in two is something you understand. The second place is also useful: a part played low under a verse can move up for the chorus, and the song lifts with no new chords.",
      howTo: [
        "Around fret 8: C is 9, 8, 8. A minor is 9, 10, 8. D minor is 10, 10, 10. G is 7, 8, 7.",
        "The numbers are the same in both places. Say them in each.",
        "Look ahead to fret 9 during the last beat of bar 4.",
      ],
      payoff: "One progression, two parts of the neck, and the choice between them.",
      difficultyException:
        "A new Level that starts by replaying a known progression in a second place, and ends on a self-checked Exercise. The demand is the second place and the choice between the two.",
      exercises: [
        {
          id: "one-six-two-five-high",
          title: "One, six, two, five around fret 8",
          purpose: "The turn you know, one shape higher for every chord. D minor is a first finger laid across fret 10.",
          howTo: [
            "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord.",
            "C is 9, 8, 8. A minor is 9, 10, 8. D minor is 10, 10, 10. G is 7, 8, 7.",
          ],
          coach: "Band on. Right notes and time after the take.",
          tab: bars(C_MID, AM_MID, DM_MID, G_MID),
          position: 7,
          shifts: true,
          chords: "C | Am | Dm | G",
          jam: ROCK("C"),
          harmony: { chordTones: true },
          rungs: ladder(60, 120, 10),
          passAt: 90,
          ...named(),
          minutes: 6,
        },
        {
          id: "low-then-high",
          title: "Low, then high",
          purpose: "Eight bars: the turn around fret 5, then the same turn around fret 8.",
          howTo: [
            "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord.",
            "Bars 1 to 4: 5, 5, 3, then 5, 5, 5, then 7, 6, 5, then 4, 3, 3. Bars 5 to 8: 9, 8, 8, then 9, 10, 8, then 10, 10, 10, then 7, 8, 7.",
          ],
          coach: "Eight bars with the band. Right notes and time after the take.",
          tab: bars(C_LOW, AM_LOW, DM_LOW, G_LOW, C_MID, AM_MID, DM_MID, G_MID),
          position: 3,
          shifts: true,
          chords: "C | Am | Dm | G | C | Am | Dm | G",
          jam: ROCK("C"),
          harmony: { chordTones: true },
          rungs: ladder(60, 120, 10),
          passAt: 90,
          ...named(0.75, 8),
          minutes: 6,
        },
        {
          id: "your-turn",
          title: "Your turn: your own shapes",
          purpose: "One, six, two, five with any shapes you like on any strings, chosen so the top note moves as little as you can make it.",
          howTo: [
            "Straight eighths with a quarter note at the end of each bar, or any rhythm you like, 60 to 90 BPM, four bars that loop.",
            "Say the number of each chord before you play it. The written line is one answer.",
            NOT_CHECKED_YET,
          ],
          coach: "Not checked yet. Record it and listen to the top notes alone.",
          tab: [C_LOW, AM_LOW, DM_LOW, G_LOW].map(toTop).join(" | "),
          position: 3,
          shifts: true,
          chords: "C | Am | Dm | G",
          jam: ROCK("C"),
          rungs: ladder(60, 90, 10),
          ...YOUR_TURN,
          selfCheck: [
            "Could you say the number of each chord before you played it?",
            "Did the top note stay within two frets at every change?",
          ],
          minutes: 4,
        },
      ],
    },
    {
      id: "twelve-bar",
      title: "Twelve bars with three chords",
      goal: "Play a twelve-bar form in C with triads, in two parts of the neck and in other keys.",
      why: "The twelve-bar blues is the best known song form there is, and it uses only one, four and five. Four bars of one, two of four, two of one, then five, four, one and five to turn it round. With triads it is three shapes, and the hard part is no longer the hand: it is knowing where you are in the twelve.",
      howTo: [
        "The form: one, one, one, one. Four, four, one, one. Five, four, one, five.",
        "Count it in three lines of four bars. The first line never moves, the second starts on four, the third starts on five.",
        "The last bar is five on purpose: it sends you back to the top.",
      ],
      payoff: "Twelve bars in any key without losing your place.",
      difficultyException:
        "Only three chords, so fewer kinds of change than the Step before. The demand is holding a twelve-bar form, which the metric does not count.",
      exercises: [
        {
          id: "twelve-low",
          title: "Twelve bars around fret 5",
          purpose: "The whole form with C, F and G as you know them low on the neck.",
          howTo: [
            "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord of the form.",
            "C is 5, 5, 3. F is 5, 6, 5. G is 4, 3, 3. Four bars of C, two of F, two of C, then G, F, C, G.",
          ],
          coach: "Twelve bars with the band. Right notes and time after the take.",
          tab: TWELVE_LOW,
          position: 3,
          shifts: true,
          chords: TWELVE_CHART,
          jam: ROCK("C"),
          harmony: { chordTones: true },
          rungs: ladder(60, 120, 10),
          passAt: 90,
          ...named(0.75, 8),
          minutes: 6,
        },
        {
          id: "twelve-high",
          title: "Twelve bars around fret 8",
          purpose: "The same form one shape higher for every chord.",
          howTo: [
            "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord of the form.",
            "C is 9, 8, 8. F is 10, 10, 8. G is 7, 8, 7.",
          ],
          coach: "Twelve bars with the band. Right notes and time after the take.",
          tab: twelve(C_MID, F_MID, G_MID),
          position: 7,
          shifts: true,
          chords: TWELVE_CHART,
          jam: ROCK("C"),
          harmony: { chordTones: true },
          rungs: ladder(60, 120, 10),
          passAt: 90,
          ...named(0.75, 8),
          minutes: 6,
        },
        {
          id: "twelve-keys",
          title: "Twelve bars in a new key",
          purpose: "The fret-5 version moved along the neck: D, G and A; E, A and B; or B flat, E flat and F.",
          howTo: [
            "Straight eighths, 60 BPM up to a pass at 90.",
            "In D: D is 7, 7, 5. G is 7, 8, 7. A is 6, 5, 5.",
            VARIANT_NOTE,
          ],
          coach: "A key that changes from day to day. Right notes and time after the take.",
          vary: inKeys(TWELVE_LOW, TWELVE_CHART, { D: 2, E: 4, Bb: -2 }),
          tab: shiftFrets(TWELVE_LOW, 2),
          position: 5,
          shifts: true,
          chords: moveChart(TWELVE_CHART, 2),
          jam: ROCK("D"),
          harmony: { chordTones: true },
          rungs: ladder(60, 120, 10),
          passAt: 90,
          ...named(0.75, 8),
          minutes: 6,
        },
      ],
    },
    {
      id: "verse-and-chorus",
      title: "A verse and a chorus",
      goal: "Play a song with two sections that use the same four chords in a different order, move it to a second key, and then make your own.",
      why: "Many songs use the same four chords all the way through and still have a verse and a chorus that feel different. The trick is the order and the place: start the verse on the minor chord, low on the neck, and the chorus on the major one, higher up. Nothing new for the hand here. It is the first time the numbers are being used to build something.",
      howTo: [
        "Verse, around fret 5: six, four, one, five. A minor, F, C, G.",
        "Chorus, around fret 8: one, five, six, four. C, G, A minor, F.",
        "Same four chords. The verse leans on the minor one, the chorus arrives on the major one.",
      ],
      payoff: "A two-section song from four chords, and you can say in numbers what makes the sections different.",
      exercises: [
        {
          id: "verse-chorus",
          title: "Verse low, chorus high",
          purpose: "Eight bars: A minor, F, C, G around fret 5, then C, G, A minor, F around fret 8.",
          howTo: [
            "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord.",
            "Verse: 5, 5, 5, then 5, 6, 5, then 5, 5, 3, then 4, 3, 3. Chorus: 9, 8, 8, then 7, 8, 7, then 9, 10, 8, then 10, 10, 8.",
          ],
          coach: "Eight bars with the band. Right notes and time after the take.",
          tab: VERSE_CHORUS,
          position: 3,
          shifts: true,
          chords: VERSE_CHORUS_CHART,
          jam: ROCK("C"),
          harmony: { chordTones: true },
          rungs: ladder(60, 120, 10),
          passAt: 90,
          ...named(0.75, 8),
          minutes: 6,
        },
        {
          id: "verse-chorus-keys",
          title: "The same song in a new key",
          purpose: "The verse and chorus moved along the neck: in D the four chords are B minor, G, D and A; in E they are C sharp minor, A, E and B; in B flat they are G minor, E flat, B flat and F.",
          howTo: [
            "Straight eighths, 60 BPM up to a pass at 90. One bar on each chord.",
            "In D everything is two frets higher than in C: the verse starts on 7, 7, 7 and the chorus on 11, 10, 10.",
            VARIANT_NOTE,
          ],
          coach: "A key that changes from day to day. Right notes and time after the take.",
          vary: inKeys(VERSE_CHORUS, VERSE_CHORUS_CHART, { D: 2, E: 4, Bb: -2 }),
          tab: shiftFrets(VERSE_CHORUS, 2),
          position: 5,
          shifts: true,
          chords: moveChart(VERSE_CHORUS_CHART, 2),
          jam: ROCK("D"),
          harmony: { chordTones: true },
          rungs: ladder(60, 120, 10),
          passAt: 90,
          ...named(0.75, 8),
          minutes: 6,
        },
        {
          id: "your-song",
          title: "Your turn: write eight bars",
          purpose: "Eight bars of your own from the six major and minor chords of the key: choose an order for the verse and another for the chorus.",
          howTo: [
            "Straight eighths or any rhythm you like, 60 to 90 BPM. The band plays the written chords; play yours over the click alone if they differ.",
            "Write the numbers down first, then find the shapes. Put five in the eighth bar if you want it to come round again.",
            NOT_CHECKED_YET,
          ],
          coach: "Not checked yet. Record it and ask whether the two halves feel different.",
          tab: VERSE_CHORUS,
          position: 3,
          shifts: true,
          chords: VERSE_CHORUS_CHART,
          jam: ROCK("C"),
          rungs: ladder(60, 90, 10),
          ...YOUR_TURN,
          selfCheck: [
            "Could you write your eight bars down as numbers?",
            "Could you play them in a second key?",
          ],
          minutes: 5,
        },
      ],
    },
    SIXTEEN_BARS,
    BORROWED,
    SEVENTHS,
    SEVENTHS_IN_SONGS,
  ],
  levels: [
    {
      id: "beginner",
      title: "Beginner: seven chords from one scale",
      summary: "A triad on every note of the scale, the pattern of major and minor, chords called by number, one, four and five in C and in a second key, and the three minor chords as partners of the major ones.",
      startHereIf: [
        "You can change between C, A minor, F and G with triads at 80 BPM.",
        "You know some chords and could not say which of them belong to 1 key.",
        "You don't yet know what 'one, four, five' means.",
      ],
      steps: ["seven-chords", "numbers", "the-minors"],
      warmups: [
        {
          id: "first-four-keys",
          title: "The first four chords of a key",
          purpose: "Chords one, two, three and four of a major key, root lowest, climbing the G string: major, minor, minor, major. A different key each time.",
          howTo: ["Straight eighths, well under your clean tempo. Say major or minor at each bar line."],
          coach: "This is a warm-up. It tells you how it went, and it decides nothing.",
          vary: {
            values: { key: ["C", "D", "E", "F", "Bb", "B"] },
            pooled: ["key"],
            label: (p) => `${p.key} major`,
            build: (p) => {
              const by = ({ C: 0, D: 2, E: 4, F: 5, Bb: -2, B: -1 } as Record<string, number>)[p.key];
              const tab = shiftFrets(bars(...FIRST_FOUR), by);
              return { tab, position: handAt(tab), shifts: true, chords: chartIn("C | Dm | Em | F", by, p.key), harmony: { chordTones: true as const } };
            },
          },
          grade: "warmup",
          warmup: { start: 0.6, top: 0.8, reference: "seven-chords.upper-four", fallback: 50 },
          rungs: ladder(50, 100, 10),
          minutes: 3,
        },
      ],
    },
    {
      id: "intermediate",
      title: "Intermediate: progressions, keys, and the minor key",
      summary: "Two, five, one and two more named progressions, the seven chords of D, progressions in keys that change, the keys of G and A in full, one, five, six, four in five keys, and the main chords of a minor key in A minor and in E minor.",
      startHereIf: [
        "You can name the 7 chords of C major and say which are minor.",
        "You can play one, six, two, five in C with triads at 90 BPM.",
        "You can't yet move a progression to another key without working out every chord.",
      ],
      steps: ["progressions", "other-keys", "key-of-g", "key-of-a", "four-chord-songs", "minor-key", "minor-key-e"],
      warmups: [
        {
          id: "one-six-two-five-warm",
          title: "One, six, two, five, low then high",
          purpose: "The turn round four chords in a key you did not play yesterday: one and six low, two and five a shape higher.",
          howTo: ["Straight eighths, well under your clean tempo. Two is a first finger laid across one fret. Say the numbers at each bar line."],
          coach: "This is a warm-up. It tells you how it went, and it decides nothing.",
          vary: {
            values: { key: ["C", "D", "E", "F", "Bb", "B"] },
            pooled: ["key"],
            label: (p) => `${p.key} major`,
            build: (p) => {
              const by = ({ C: 0, D: 2, E: 4, F: 5, Bb: -2, B: -1 } as Record<string, number>)[p.key];
              const tab = shiftFrets(bars(C_LOW, AM_LOW, DM_MID, G_MID), by);
              return { tab, position: handAt(tab), shifts: true, chords: chartIn("C | Am | Dm | G", by, p.key), harmony: { chordTones: true as const } };
            },
          },
          grade: "warmup",
          warmup: { start: 0.6, top: 0.8, reference: "the-minors.one-six-two-five", fallback: 50 },
          rungs: ladder(50, 100, 10),
          minutes: 3,
        },
      ],
    },
    {
      id: "advanced",
      title: "Advanced: forms, borrowed chords, and sevenths",
      summary: "One progression in two parts of the neck, the twelve-bar form in more than one key, a verse and a chorus built from four chords, a sixteen-bar form with a bridge, three chords from outside the key, and the seventh chords of the key in the progressions you know.",
      startHereIf: [
        "You can play two, five, one and one, six, two, five in 3 keys.",
        "You know the main chords of a minor key.",
        "You lose your place in forms longer than 4 bars, or you only know each progression in 1 part of the neck.",
      ],
      steps: ["two-places", "twelve-bar", "verse-and-chorus", "sixteen-bars", "borrowed", "sevenths", "sevenths-in-songs"],
      warmups: [
        {
          id: "two-five-one-warm",
          title: "Two, five, one in a new key",
          purpose: "The way home, in a key you did not play yesterday: two and five low, one high and then low.",
          howTo: ["Straight eighths, well under your clean tempo. Listen for five falling into one."],
          coach: "This is a warm-up. It tells you how it went, and it decides nothing.",
          vary: {
            values: { key: ["C", "D", "Eb", "E", "F", "Bb"] },
            pooled: ["key"],
            label: (p) => `${p.key} major`,
            build: (p) => {
              const by = ({ C: 0, D: 2, Eb: 3, E: 4, F: 5, Bb: -2 } as Record<string, number>)[p.key];
              const tab = shiftFrets(bars(DM_LOW, G_LOW, C_MID, C_LOW), by);
              return { tab, position: handAt(tab), shifts: true, chords: chartIn("Dm | G | C | C", by, p.key), harmony: { chordTones: true as const } };
            },
          },
          grade: "warmup",
          warmup: { start: 0.6, top: 0.8, reference: "progressions.two-five-one", fallback: 50 },
          rungs: ladder(50, 100, 10),
          minutes: 3,
        },
        {
          id: "seven-chords-keys",
          title: "The seven chords of a new key",
          purpose: "A chord on every note of a major scale, root lowest, from home round to home: the first four on the top three strings, the last four one set of strings lower, in a key you did not play yesterday.",
          howTo: ["Straight eighths, well under your clean tempo. Say the pattern as you go: major, minor, minor, major, major, minor, diminished, major."],
          coach: "This is a warm-up. It tells you how it went, and it decides nothing.",
          vary: {
            values: { key: ["D", "Eb", "E", "Bb", "B", "Db"] },
            pooled: ["key"],
            label: (p) => `${p.key} major`,
            build: (p) => {
              const by = ({ D: 2, Eb: 3, E: 4, Bb: -2, B: -1, Db: 1 } as Record<string, number>)[p.key];
              const tab = shiftFrets(ALL_SEVEN, by);
              return { tab, position: handAt(tab), shifts: true, chords: chartInKey(SEVEN_CHART, by, p.key), harmony: { chordTones: true as const } };
            },
          },
          grade: "warmup",
          warmup: { start: 0.6, top: 0.8, reference: "seven-chords.all-seven", fallback: 50 },
          rungs: ladder(50, 100, 10),
          minutes: 4,
        },
      ],
    },
  ],
});
