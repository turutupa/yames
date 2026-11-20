/**
 * Metal Rhythm: two more consolidation Steps for the Advanced Level
 * (2026-11-19). Drafts, like the Path they belong to.
 *
 * Advanced was five Steps of three Exercises. Pedal-tone riffs stood on the
 * open low E string alone, and the band was met for one four-bar riff. These
 * Steps add nothing new for either hand: the pedal riff is taken to the open A
 * string, in A minor, and then the pedal itself changes string; and a verse
 * riff and a chorus riff are played as a sixteen-bar form with the band. Every
 * id is new, so nobody's progress moves. Every line is original.
 *
 * Strokes are taught in words where a figure is not strict alternation
 * (`pick: "free"`), and a power chord is one attack: timed and counted, never
 * pitch-checked.
 */
import type { ExerciseSpec, StepSpec } from "../spec";
import type { PassBar } from "../format";
import { ladder, repeat } from "../templates";

// Copied from metal-rhythm.ts (a Path importing its extra Steps cannot be imported by them).
const even = (min: number, overBars = 4): PassBar => ({ metric: "timingEvenness", min, overBars });
const heard = (min: number, overBars = 4): PassBar => ({ metric: "notesHeard", min, overBars });
const extras = (max: number): PassBar => ({ metric: "extraNotes", max, overBars: 4 });

/** Power chords: timing, notes heard and extras. Two notes at once are not pitch-checked. */
const CHORDS = { grade: "timing", pass: [even(0.85), heard(0.9), extras(4)] } as const satisfies Partial<ExerciseSpec>;
/** Fast figures: the time is harder to hold. */
const FAST = [even(0.8), heard(0.9), extras(3)];
/** Single notes: the same, and right notes after the take. */
const FAST_NOTES: PassBar[] = [...FAST, { metric: "noteIdentity", min: 0.85, overBars: 4 }];

const FREE = { pick: "free" } as const satisfies Partial<ExerciseSpec>;

const MUTE_CHECK = "Did the muted notes thud with a clear pitch, neither ringing open nor choked dead?";
const LOW_E_CHECK = "Did the low E string stay silent from the first bar to the last?";

const A_MINOR = { scale: ["A", "naturalMinor"] as [string, string] };
const E_MINOR = { scale: ["E", "naturalMinor"] as [string, string] };

// Power chords, first and third fingers (as the Path spells them): roots on the low E string, then on the A string.
const E5 = "6:0+5:2f1";
const G5 = "6:3f1+5:5f3";
const C5_ON_A = "5:3f1+4:5f3";
const D5_ON_A = "5:5f1+4:7f3";

const gallop = (note: string) => `/8 ${note} /16 ${note} ${note}`;

// --- Advanced: pedal riffs from the A string ----------------------------------

const PA = "5:0m";
const PE = "6:0m";
// The melody, at fret 7 with one finger to a fret. Fingers printed, so the tab shows what the how-to names.
const onA = { 7: "5:7f1", 10: "5:10f4" } as const;
const onD = { 7: "4:7f1", 9: "4:9f3", 10: "4:10f4" } as const;
const onG = { 7: "3:7f1", 9: "3:9f3", 10: "3:10f4" } as const;

/** One bar of a pedal riff: six melody notes over a pedal, in groups of three, three, three, three, two and two sixteenths. */
function pedalBar(pedal: string, melody: readonly [string, string, string, string, string, string]) {
  const [a, b, c, d, e, f] = melody;
  return `${[a, b, c, d].map((note) => `${note} ${pedal} ${pedal}`).join(" ")} ${e} ${pedal} ${f} ${pedal}`;
}

// A, B and C on the D string.
const A_PEDAL_D = `/16 ${pedalBar(PA, [onD[7], onD[10], onD[9], onD[7], onD[9], onD[10]])} | ${pedalBar(PA, [onD[9], onD[7], onD[9], onD[10], onD[9], onD[7]])}`;
// D, E and F on the G string, the D string skipped.
const A_PEDAL_G = `/16 ${pedalBar(PA, [onG[9], onG[10], onG[9], onG[7], onG[9], onG[10]])} | ${pedalBar(PA, [onG[9], onG[7], onG[9], onG[10], onG[9], onG[7]])}`;
// Up A minor from A to F across both strings, and back down.
const A_PEDAL_BOTH = `/16 ${pedalBar(PA, [onD[7], onD[9], onD[10], onG[7], onG[9], onG[7]])} | ${pedalBar(PA, [onG[10], onG[9], onG[7], onD[10], onD[9], onD[7]])}`;
// Two bars over the open A string, two over the open low E string with the melody a string lower.
const PEDAL_A_TO_E = [
  `/16 ${pedalBar(PA, [onD[7], onD[9], onD[10], onD[9], onG[7], onD[10]])}`,
  pedalBar(PA, [onG[9], onG[7], onD[10], onD[9], onD[7], onD[9]]),
  pedalBar(PE, [onA[7], onA[10], onD[7], onA[10], onD[9], onD[7]]),
  pedalBar(PE, [onD[10], onD[9], onD[7], onA[10], onA[7], onA[10]]),
].join(" | ");

/** Advanced, right after the pedal riffs on the low E string: the same riffs standing on the open A string. */
export const PEDAL_FROM_A: StepSpec = {
  id: "pedal-from-a",
  title: "Pedal riffs from the A string",
  goal: "Play a melody on the D and G strings against a muted open A string, in sixteenths, and change the pedal from the open A string to the open low E string on a bar line.",
  why: "Every pedal riff so far has stood on the open low E string. The open A string can be the low note just as well, and the whole figure moves one string higher with it: the same three fingers on the same frets, the same groups of three sixteenths. The melody notes are now A, B and C on the D string and D, E and F on the G string, and with A as the low note the riff is in A minor. For the picking hand, the palm has to mute the A string and leave the D and G strings free, and the low E string lies next to the pick without being played. In the last riff the pedal itself changes string and the melody goes with it, down to E and G on the A string.",
  howTo: [
    "Strict alternate picking, as in the pedal riffs on the low E string. In the groups of three the melody notes fall on a downstroke and an upstroke in turn, so do not try to make them all downstrokes.",
    "Lay the side of the picking hand on the A string where it leaves the bridge. It rests on the low E string too, and that keeps the low E string quiet. Roll the hand a little so the D and G strings are free to ring.",
    "The fretting hand stays at fret 7 for the whole Step: first finger on fret 7, third on fret 9, little finger on fret 10, on whichever string the melody is on.",
    "On a skip to the G string, the pick travels over the D string in a small arc. Do not lift the forearm.",
  ],
  payoff: "A four-bar riff in A minor whose low note drops from the open A string to the open low E string and comes back.",
  exercises: [
    {
      id: "a-pedal-d",
      title: "Pedal on the A, melody on the D string",
      purpose: "A, B and C on the D string, each followed by two muted open A notes: the groups of three sixteenths from the low E string, one string higher, until the last beat of each bar, where melody and pedal take turns.",
      howTo: [
        "Sixteenth notes, strict down-up. One melody note and two pedal notes, four times; then one of each, twice, to fill the bar.",
        "First finger on fret 7, third on fret 9, little finger on fret 10, all on the D string. Bar 1 is frets 7, 10, 9, 7, then 9 and 10. Bar 2 is frets 9, 7, 9, 10, then 9 and 7. Keep the fingers arched so no fingertip touches the A string.",
        "The melody rings and the open A string is muted. The low E string is not played: the palm rests on it and keeps it quiet.",
      ],
      coach: "After the take the evenness is reported and the notes are checked against the written ones. The mute, the strokes and a quiet low E string are yours to judge.",
      tab: A_PEDAL_D,
      position: 7,
      harmony: A_MINOR,
      rungs: ladder(50, 130, 10),
      passAt: 90,
      grade: "timingNotes",
      pass: FAST_NOTES,
      selfCheck: [MUTE_CHECK, LOW_E_CHECK],
      minutes: 6,
    },
    {
      id: "a-pedal-g",
      title: "Melody on the G string",
      purpose: "The same groups with the melody a string further away: D, E and F on the G string, and the D string skipped on every crossing.",
      howTo: [
        "Sixteenth notes, strict down-up. The same three fingers on the same frets, one string higher. Bar 1 is frets 9, 10, 9, 7, then 9 and 10. Bar 2 is frets 9, 7, 9, 10, then 9 and 7.",
        "The skip makes the pick's journey longer. Slow down until the pedal notes are as even as they were with the melody on the D string.",
        "Let the tip of the fretting finger lean against the D string, so that string cannot ring if the pick catches it.",
      ],
      coach: "After the take the evenness is reported and the notes are checked against the written ones. The mute, the strokes and a quiet D string are yours to judge.",
      tab: A_PEDAL_G,
      position: 7,
      harmony: A_MINOR,
      rungs: ladder(50, 130, 10),
      passAt: 85,
      grade: "timingNotes",
      pass: FAST_NOTES,
      selfCheck: [MUTE_CHECK],
      minutes: 6,
    },
    {
      id: "a-pedal-both",
      title: "Up and down A minor, over the A",
      purpose: "The melody now walks up through A minor across both strings and back, over the same pedal: A, B, C, D and E, a step back to D, then F at the top and every note back down to A.",
      howTo: [
        "Sixteenth notes, strict down-up, in the same groups: three, three, three, three, two and two.",
        "Bar 1 climbs: frets 7, 9 and 10 on the D string, then frets 7 and 9 on the G string, and fret 7 again. Bar 2 comes down from the top: frets 10, 9 and 7 on the G string, then frets 10, 9 and 7 on the D string.",
        "From the D string the pedal is the next string. From the G string the pick skips the D string on the way to the pedal and on the way back. Keep the pedal notes even through both.",
      ],
      coach: "After the take the evenness is reported and the notes are checked against the written ones. The mute and the strokes are yours to judge.",
      tab: A_PEDAL_BOTH,
      position: 7,
      harmony: A_MINOR,
      rungs: ladder(50, 130, 10),
      passAt: 85,
      grade: "timingNotes",
      pass: FAST_NOTES,
      selfCheck: [MUTE_CHECK, LOW_E_CHECK],
      minutes: 6,
    },
    {
      id: "pedal-a-to-e",
      title: "The pedal changes string",
      purpose: "Four bars in A minor. Bars 1 and 2 stand on the muted open A string, with the melody on the D and G strings. On the bar line into bar 3 the pedal drops to the muted open low E string, and the melody drops with it, to the A and D strings.",
      howTo: [
        "Sixteenth notes, strict down-up, the same groups in every bar: three, three, three, three, two and two.",
        "Bar 1: frets 7, 9, 10 and 9 on the D string, fret 7 on the G string, fret 10 on the D string. Bar 2: frets 9 and 7 on the G string, then frets 10, 9, 7 and 9 on the D string.",
        "Bar 3, over the open low E string: frets 7 and 10 on the A string, fret 7 on the D string, fret 10 on the A string, then frets 9 and 7 on the D string. Bar 4: frets 10, 9 and 7 on the D string, then frets 10, 7 and 10 on the A string.",
        "The fretting hand never moves: first finger on fret 7, third on fret 9, little finger on fret 10.",
        "At the change the palm rolls back. In bars 3 and 4 it mutes the low E string only, because the A string now carries melody and has to ring. Going back to bar 1 it covers the A string again. From the D string the pick now skips the A string: let the tip of the fretting finger lean against it, as it did against the D string.",
      ],
      coach: "This is the Step's test piece. After the take the evenness is reported and the notes are checked against the written ones. The mute and the strokes are yours to judge.",
      tab: PEDAL_A_TO_E,
      position: 7,
      harmony: A_MINOR,
      rungs: ladder(50, 130, 10),
      passAt: 85,
      grade: "timingNotes",
      pass: FAST_NOTES,
      selfCheck: [MUTE_CHECK, "Did the change of pedal arrive on the bar line both ways, into bar 3 and back to bar 1?"],
      minutes: 7,
    },
  ],
};

// --- Advanced: a verse and a chorus, with the band ------------------------------

const G = gallop(PE);
// The verse: gallops on the muted open low E string, a two-note answer on the A string, and a run down to end it.
const VERSE = [
  `${G} ${G} /8 5:2f1 5:3f2 ${G}`,
  `${G} ${G} /8 5:5f4 5:3f2 ${G}`,
  `${G} ${G} /8 5:2f1 5:3f2 ${G}`,
  `${G} /8 5:5f4 5:3f2 5:2f1 6:3f2 ${G}`,
].join(" | ");
// The chorus: a chord held for two beats, one for a beat, and two eighth notes, the same in every bar.
const chorusBar = (chord: string) => `/2 ${chord} /4 ${chord} /8 ${chord} ${chord}`;
const CHORUS = [E5, C5_ON_A, G5, D5_ON_A].map(chorusBar).join(" | ");

const VERSE_CHART = "E5 | E5 | E5 | E5";
const CHORUS_CHART = "E5 | C5 | G5 | D5";
const BAND = { groove: "hardRock", key: "E minor" } as const;

const FORM_CHECK = "Did the chorus chords ring and the verse stay muted, every time round?";

/** Advanced, the last Step of the Path: two riffs as a song form, with the band. */
export const VERSE_AND_CHORUS: StepSpec = {
  id: "verse-and-chorus",
  title: "A verse and a chorus, with the band",
  goal: "Play a four-bar verse riff and a four-bar chorus riff, each alone, then verse, verse, chorus, chorus as sixteen bars with a band, keeping the tempo through every change of part.",
  why: "A song is longer than a riff, and it changes feel as it goes. The verse riff here is tight: muted, low and busy, and it stays on one chord. The chorus opens up: power chords that ring, a new chord in every bar, and a rhythm with far fewer notes in it. No technique here is new: the gallop, eighth notes let out of the mute that answer it, and power chords. Only the verse's fingering is: the hand sits one fret lower than in the earlier single-note riffs, first finger on fret 2. The work is keeping your place in sixteen bars, and the change: on one bar line the palm comes off the strings and the strokes get bigger, and on another they go back to small and muted, at the same tempo.",
  howTo: [
    "Learn each part by itself first, with the click. The verse is the gallop on the muted open low E string with short answers on the A string. The chorus is four power chords, one to a bar: E, C, G and D.",
    "The verse is down, down-up, with the palm on the low E string. The chorus is all downstrokes, palm off the strings, each stroke carried through two strings.",
    "Into the chorus, lift the palm and let the first chord ring for its full two beats. The tempo has not changed, only how much you play: count through the long chord and do not rush it.",
    "Back into the verse, bring the palm down before the first note, so the gallop starts muted.",
    "With the band, the chord stays E5 through the whole verse and the first bar of the chorus, then C5, G5 and D5, a bar each. Nothing in the chords tells you the chorus has come, so count the bars in fours.",
  ],
  payoff: "Sixteen bars of rhythm guitar with a band: two verses, two choruses, and the change of feel on the bar line.",
  difficultyException:
    "The chorus is four attacks to a bar and the verse is a gallop at the tempo the Step before held for a minute, so the note rate falls. The demand is sixteen bars in one take and a change of feel on a bar line, from muted gallops to ringing chords and back, which a note-rate metric does not count.",
  exercises: [
    {
      id: "verse-riff",
      title: "The verse riff",
      purpose: "Four bars in E minor: gallops on the muted open low E string, with a two-note answer on the A string in each of the first three bars and a four-note run down in the last.",
      howTo: [
        "Bars 1 to 3: two gallops, two eighth notes on the A string, and one more gallop. Count '1, and a, 2, and a, 3 and, 4, and a'. Down, down-up for each gallop and two downstrokes for the answer.",
        "The answers are frets 2 and 3 in bars 1 and 3, B and C, and frets 5 and 3 in bar 2, D and C. First finger on fret 2, second on fret 3, little finger on fret 5. Lift the palm so they ring. The first finger stays over fret 2 of the A string throughout: it is already in place for the E chord of the chorus.",
        "Bar 4: one gallop, then four eighth notes running down, frets 5, 3 and 2 on the A string and fret 3 on the low E string under the second finger, and one gallop to end the bar.",
      ],
      coach: "Every note is timed, and after the take the notes are checked against the written ones. The mute and the strokes are yours to judge.",
      ...FREE,
      tab: VERSE,
      position: 2,
      harmony: E_MINOR,
      rungs: ladder(60, 130, 10),
      passAt: 100,
      grade: "timingNotes",
      pass: FAST_NOTES,
      selfCheck: [MUTE_CHECK],
      minutes: 6,
    },
    {
      id: "chorus-riff",
      title: "The chorus riff",
      purpose: "Four bars, a power chord to each: E, C, G and D. Every bar has the same rhythm, a chord held for two beats, a chord for one beat and two eighth notes, and every chord rings.",
      howTo: [
        "Count '1, 2, 3, 4 and' and play on 1, on 3, on 4 and on its 'and'. All downstrokes, palm off the strings, through two strings only.",
        "E is the open low E string and fret 2 of the A string. C is fret 3 of the A string and fret 5 of the D string. G is the same two frets one string lower: fret 3 of the low E string and fret 5 of the A string. D is fret 5 of the A string and fret 7 of the D string.",
        "First finger on the lower string and third finger two frets up on the next string, for C, G and D. E needs the first finger alone.",
        "The fretting hand moves on the last eighth note of the bar. Let that chord be short and land the next one on the click.",
        "For C and D, begin the stroke on the A string, so the low E string stays quiet.",
      ],
      coach: "A chord is one attack: it is timed and counted, and its pitch is not checked. Whether both strings rang, and no others, is yours to judge.",
      ...FREE,
      tab: CHORUS,
      position: 2,
      shifts: true,
      chords: CHORUS_CHART,
      ...CHORDS,
      rungs: ladder(60, 130, 10),
      passAt: 100,
      selfCheck: ["Did both strings of every chord ring, and no others, with only the last chord of each bar cut short for the move?"],
      minutes: 5,
    },
    {
      id: "verse-into-chorus",
      title: "Verse into chorus, with the band",
      purpose: "One verse and one chorus, eight bars over a hard rock groove in E minor, and round again. The feel changes twice in every pass: into the chorus at bar 5 and back into the verse at bar 1.",
      howTo: [
        "Bars 1 to 4 are the verse riff: muted gallops, down, down-up. Bars 5 to 8 are the chorus: E, C, G and D, all downstrokes, ringing.",
        "Into bar 5: bar 4 ends on a gallop on the open low E string. Lift the palm after its last note and strike the E chord with the band, first finger on fret 2 of the A string.",
        "Back to bar 1: bar 8 ends on two D chords, at frets 5 and 7. The verse starts with two gallops on the open string, and that is when the hand comes back down to fret 2. Bring the palm down first.",
        "The band holds E under the whole verse and stays on it for the first bar of the chorus, then changes with you to C, G and D, a bar each. The chorus does not arrive with a new chord: you make it arrive by opening up.",
      ],
      coach: "Band on. Every attack is timed against it, in both parts, and the evenness is reported. No pitch is checked in this one, neither the chords nor the verse notes; the mute and the strokes are yours to judge. Direct input or headphones make the timing fair.",
      ...FREE,
      tab: `${VERSE} | ${CHORUS}`,
      position: 2,
      shifts: true,
      chords: `${VERSE_CHART} | ${CHORUS_CHART}`,
      jam: BAND,
      ...CHORDS,
      pass: [even(0.8, 8), heard(0.9, 8), extras(3)],
      rungs: ladder(60, 130, 10),
      passAt: 100,
      selfCheck: [MUTE_CHECK, "Did the change of part arrive on time both ways, into bar 5 and back to bar 1?"],
      minutes: 7,
    },
    {
      id: "song-form",
      title: "Verse, verse, chorus, chorus",
      purpose: "The whole form with the band: the verse twice, then the chorus twice, sixteen bars at one tempo. Nothing in it is new. Knowing where you are in sixteen bars is the lesson.",
      howTo: [
        "Bars 1 to 8 are the verse riff played twice. Bars 9 to 16 are the chorus played twice: E, C, G and D, then E, C, G and D again.",
        "Count the fours as they go by: verse one, verse two, chorus one, chorus two. The run down marks the last bar of each verse. After the first run the verse starts again; after the second, at bar 9, the chorus starts.",
        "At bar 9, lift the palm and let the E chord ring for its two beats. Between the two choruses, from D back to E, the hand drops from fret 5 to fret 2 on the last eighth note of bar 12.",
        "After bar 16 the form starts again from the verse. Bring the palm down before the first gallop.",
      ],
      coach: "Band on. Sixteen bars are timed without a break, every attack in both parts, and the evenness is reported. No pitch is checked in this one, neither the chords nor the verse notes; the mute and the strokes are yours to judge. Direct input or headphones make the timing fair.",
      ...FREE,
      tab: `${repeat(`${VERSE} |`, 2)} ${CHORUS} | ${CHORUS}`,
      position: 2,
      shifts: true,
      chords: `${VERSE_CHART} | ${VERSE_CHART} | ${CHORUS_CHART} | ${CHORUS_CHART}`,
      jam: BAND,
      ...CHORDS,
      pass: [even(0.8, 8), heard(0.9, 8), extras(3)],
      rungs: ladder(60, 130, 10),
      passAt: 100,
      selfCheck: [MUTE_CHECK, "Did both changes arrive on time, into the chorus at bar 9 and back into the verse at bar 1?", FORM_CHECK],
      minutes: 8,
    },
  ],
};
