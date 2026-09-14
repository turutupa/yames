/**
 * The twenty-five grooves the drummer knows, written as tables on the tick
 * grid.
 *
 * A groove is one bar wide. Columns are the ticks of that bar — beats per bar
 * times ticks per beat, tick 0 first — and rows are the drums. Nothing here
 * knows about time: the engine reads the column belonging to the tick it was
 * going to play anyway (plans/JAM_MODE.md §3, principle 3).
 *
 * Each groove declares the meter it is WRITTEN for, because that is what a
 * groove is: a bossa is sixteenths in four, a waltz is three. The UI hands the
 * engine that meter before it hands over the table, and the engine refuses the
 * table if the two disagree rather than guessing (see `JamEngineConfig`).
 *
 * ## The third pass: a drummer, not a drum machine
 *
 * The owner's verdict on the second pass was that the band is underwhelming,
 * and `plans/JAM_SOUND.md` §2.9 names this file as one of the reasons: "even
 * with a perfect kit, a hat row of identical accents is not a drummer". So
 * every table below was rewritten by ear against its card in
 * `plans/JAM_REFERENCES.md`, to five rules:
 *
 * 1. **The hats alternate.** Eighths: accent on the beat, hit off it.
 *    Sixteenths: accent, ghost, hit, ghost — the hand coming down hard, up
 *    light, down, up. Shuffle and swing: accent on the beat, hit on the skip
 *    note. A row of one level is the single loudest tell that nobody played
 *    this, and there is not one left in the file.
 * 2. **Ghosts live between the backbeats**, never on one, and only in the
 *    styles that have them — funk, sixteenth rock, half-time, shuffle, slow
 *    blues, second line, boom bap. They are the groove in those styles and
 *    they are an affectation in the others.
 * 3. **The backbeat is an accent**, and in the bar that ends the chorus the
 *    last backbeat still standing is a PEAK: the drummer leaning into two or
 *    four to announce the fill that is about to happen.
 * 4. **A fill goes to the toms.** The last beat of every fill ramps hit →
 *    accent → peak and walks snare → high tom → low tom, and the crash that
 *    answers it lands on the next bar's one, which is the engine's job
 *    (`crashOnOne`) and not this table's. A fill that stays on the snare is a
 *    drum roll; a fill that ends where it started is not a fill at all.
 * 5. **The kick has dynamics too.** The downbeat is an accent, the "and"s are
 *    hits, and a double-kick roll alternates accent and hit so sixteen of them
 *    a bar stay countable.
 *
 * Levels are the five a drummer plays: 0 silent, 1 a hit, 2 an accent, 3 a
 * ghost, 4 a peak. On a recorded kit each of those picks a different SAMPLE,
 * not the same sample at a different volume, which is what makes writing them
 * down worth the trouble.
 *
 * ## Two rows that are not a level
 *
 * **The open hat is a row.** The convention that came before it — an accent on
 * the closed-hat lane MEANS the hat opening — was a convention the engine
 * never knew: one lane, one voice, so what an accent actually produced was a
 * louder closed hat. The two grooves that were written under that convention,
 * hard rock and boom bap, now write their open strokes in `hatOpen` where the
 * engine can hear them, and `applyIntensity`'s Loud writes the same row.
 *
 * **The cross-stick is a flag.** A bossa, a ballad, a cha-cha and a one-drop
 * are played with the stick laid across the head and the tip on the rim, which
 * is a different sound from a ghost note and not a quieter one. There is no
 * rim LANE — the contract's five are kick, snare, hat, ride and crash — so
 * those four grooves write their figure on the snare at ghost level and set
 * `snareGhostIsRim`, and the engine plays its rim voice for every level-3
 * stroke on their snare lane.
 */
import type { JamLevel, JamPattern } from "./types";

/** The resolutions a groove may be written at — `JamEngineConfig.ticksPerBeat`. */
export type GrooveTicks = 1 | 2 | 3 | 4 | 6;

export type Groove = {
  id: string;
  /** i18n key under `jam.groove.*`. Groove names are translated. */
  nameKey: string;
  /** The meter the groove is written for. */
  beatsPerBar: number;
  ticksPerBeat: GrooveTicks;
  /** The groove itself, one bar. */
  bar: JamPattern;
  /** Played instead of `bar` on the last bar of a chorus when fills are on. */
  fill: JamPattern;
  /**
   * Every quiet snare in this groove is a cross-stick, not a ghost note. Set
   * on the four grooves that are played that way; absent everywhere else.
   */
  snareGhostIsRim?: boolean;
};

/** An all-silent lane of the right length — every pattern starts from these. */
function silent(length: number): JamLevel[] {
  return new Array<JamLevel>(length).fill(0);
}

/**
 * A lane written as a string, one character per tick.
 *
 * `O` peak, `X` accent, `x` hit, `o` ghost, `.` silence. Spaces and `|` are
 * ignored, so a bar can be written with its beats separated and read like a
 * drum chart — which is the only way a sixteen-column table stays checkable by
 * eye.
 */
function lane(spec: string): JamLevel[] {
  const out: JamLevel[] = [];
  for (const ch of spec) {
    if (ch === " " || ch === "|") continue;
    out.push(ch === "O" ? 4 : ch === "X" ? 2 : ch === "x" ? 1 : ch === "o" ? 3 : 0);
  }
  return out;
}

/**
 * A whole kit from lane strings; anything omitted is silent.
 *
 * The three optional rows are the exception: `hatOpen`, `tomHi` and `tomLo`
 * are written only where a groove names them, because a row of zeros is a
 * drum the engine reads past on every tick of every bar to learn nothing.
 */
function kit(spec: {
  kick?: string;
  snare?: string;
  hat?: string;
  hatOpen?: string;
  ride?: string;
  crash?: string;
  tomHi?: string;
  tomLo?: string;
  length: number;
}): JamPattern {
  const { length } = spec;
  const of = (s?: string) => (s ? lane(s) : silent(length));
  const out: JamPattern = {
    kick: of(spec.kick),
    snare: of(spec.snare),
    hat: of(spec.hat),
    ride: of(spec.ride),
    crash: of(spec.crash),
  };
  if (spec.hatOpen) out.hatOpen = lane(spec.hatOpen);
  if (spec.tomHi) out.tomHi = lane(spec.tomHi);
  if (spec.tomLo) out.tomLo = lane(spec.tomLo);
  return out;
}

/**
 * How many ticks of a beat the high tom takes on its way down to the low one.
 *
 * The last tick of the fill is always the low tom at a peak. What is left of
 * the beat is split: about half of it to the high tom, the rest to the snare
 * that led in. One tick to a beat has no room for a walk, so the peak is the
 * whole of it.
 */
function tomHiTicks(ticksPerBeat: GrooveTicks): number {
  return ticksPerBeat >= 2 ? Math.max(1, Math.floor((ticksPerBeat - 1) / 2)) : 0;
}

/**
 * The fill, built from the bar it interrupts.
 *
 * The first part of the bar is the groove, unchanged, with one edit: the last
 * backbeat still standing goes up to a peak. That is the drummer leaning into
 * two (or three, in a half-time bar) to say the fill is coming, and it is the
 * only thing the front of a fill bar needs.
 *
 * From `from` onward everything else gets out of the way and the snare runs
 * the subdivision as hits — the run-up. The LAST beat is the fill: snare hits,
 * then the high tom at an accent, then the low tom at a peak on the final
 * tick. Hit, accent, peak; snare, high, low; and the crash the engine puts on
 * the next bar's one is the fourth stroke of that gesture.
 *
 * The open-hat row travels and is silenced across the fill like everything
 * else, so an open hat cannot ring on underneath the toms.
 */
function fillOver(
  bar: JamPattern,
  length: number,
  from: number,
  ticksPerBeat: GrooveTicks,
): JamPattern {
  const lastBeat = length - ticksPerBeat;
  const out: JamPattern = {
    kick: [...bar.kick],
    snare: [...bar.snare],
    hat: [...bar.hat],
    ride: [...bar.ride],
    crash: [...bar.crash],
  };
  if (bar.hatOpen) out.hatOpen = [...bar.hatOpen];
  const tomHi = silent(length);
  const tomLo = silent(length);

  // The last backbeat before the fill, leaned on. Searched backwards from the
  // fill's edge so that a groove with two backbeats raises the second one.
  for (let i = from - 1; i >= 0; i -= 1) {
    if (out.snare[i] === 2) {
      out.snare[i] = 4;
      break;
    }
  }

  const highTom = tomHiTicks(ticksPerBeat);
  for (let i = from; i < length; i += 1) {
    out.kick[i] = 0;
    out.hat[i] = 0;
    out.ride[i] = 0;
    out.crash[i] = 0;
    if (out.hatOpen) out.hatOpen[i] = 0;
    out.snare[i] = 0;
    if (i < lastBeat) {
      out.snare[i] = 1;
      continue;
    }
    const into = i - lastBeat;
    if (into === ticksPerBeat - 1) tomLo[i] = 4;
    else if (into >= ticksPerBeat - 1 - highTom) tomHi[i] = 2;
    else out.snare[i] = 1;
  }

  out.tomHi = tomHi;
  out.tomLo = tomLo;
  return out;
}

/**
 * Where a groove's fill starts.
 *
 * Two beats for most of them, and ONE for the half-time grooves and the
 * ballads: a bar that is already counted in halves has no room for a two-beat
 * fill without the fill becoming the bar. A bar shorter than two beats keeps
 * the groove and takes the figure on its last beat.
 */
function fillFor(
  beatsPerBar: number,
  ticksPerBeat: GrooveTicks,
  bar: JamPattern,
  shortFill: boolean,
): JamPattern {
  const length = beatsPerBar * ticksPerBeat;
  const figureBeats = shortFill ? 1 : Math.min(2, beatsPerBar);
  return fillOver(bar, length, (beatsPerBar - figureBeats) * ticksPerBeat, ticksPerBeat);
}

type GrooveOptions = {
  /** The quiet snare is the rim, not a ghost. */
  rim?: boolean;
  /** One beat of fill rather than two — the half-time grooves and ballads. */
  shortFill?: boolean;
};

function groove(
  id: string,
  beatsPerBar: number,
  ticksPerBeat: GrooveTicks,
  bar: JamPattern,
  options: GrooveOptions = {},
): Groove {
  return {
    id,
    nameKey: `jam.groove.${id}`,
    beatsPerBar,
    ticksPerBeat,
    bar,
    fill: fillFor(beatsPerBar, ticksPerBeat, bar, options.shortFill === true),
    ...(options.rim ? { snareGhostIsRim: true } : {}),
  };
}

/**
 * The twenty-five, in the order the picker draws them: the four you reach for
 * first, then the three that carry their own meter, then the jazz one, then
 * the five that came later — the ones you go looking for by name rather than
 * land on by accident — then the seven the vibes brought, and last the five
 * the third pass added to stop three tiles lying about what they play.
 *
 * Appended rather than interleaved, and deliberately: the footswitch steps
 * this list in order (`stepGroove` in `useJamSession`), so re-sorting it would
 * move every groove out from under the stomp that used to reach it.
 */
export const GROOVES: readonly Groove[] = [
  /* Rock eighths. Kick accented on the one and a hit on three; the backbeat
     accented on two and four and nothing else on the snare, because this beat
     is about how plain it is.

     Hats: straight eighths, accent on every beat and a hit on every "and" —
     the down-up of a stick that never leaves the hat.
     Ghosts: none. Sweet Child and Learn to Fly have none either.
     Fill: two beats — four snare hits, then the high tom and the low tom's
     peak across beat four. */
  groove(
    "rock8",
    4,
    2,
    kit({
      length: 8,
      kick: "X. .. x. ..",
      snare: ".. X. .. X.",
      hat: "Xx Xx Xx Xx",
    }),
  ),
  /* Rock sixteenths. The kick syncopates against the hat all the way through;
     the snare's ghosts fill the gaps around the backbeat.

     Hats: sixteenths as accent / ghost / hit / ghost — down hard, up light,
     down, up. That one figure is most of the difference between this table and
     the one a drum machine plays.
     Ghosts: on the "e" of two, the "a" of two, the "e" of three and the "a" of
     four — around the backbeats, never on one.
     Fill: two beats of snare sixteenths, then tom, tom, peak. */
  groove(
    "rock16",
    4,
    4,
    kit({
      length: 16,
      kick: "X..x ..x. ...x .x..",
      snare: "..o. X..o .o.. X.o.",
      hat: "Xoxo Xoxo Xoxo Xoxo",
    }),
  ),
  /* Half-time. The backbeat moves to three and the bar feels half as fast,
     which is what everybody means by half-time. The hat keeps the eighths so
     the tempo is still findable.

     Hats: eighths, accent on the beat, hit off it.
     Ghosts: the "and" of two and the "and" of four — the two strokes a
     half-time player uses to keep their right hand honest while the backbeat
     waits.
     Fill: one beat, because a bar counted in halves has no room for two. */
  groove(
    "halfTime",
    4,
    2,
    kit({
      length: 8,
      kick: "X. .. .. x.",
      snare: ".. .o X. .o",
      hat: "Xx Xx Xx Xx",
    }),
    { shortFill: true },
  ),
  /* Shuffle. Triplets with the middle one silent — the long-short that is a
     shuffle, and the reason a shuffle needs no engine change (JAM_MODE §4.1).

     Hats: accent on the beat, hit on the skip note. Two levels, one hand.
     Ghosts: on the skip note before each backbeat, which is the Texas shuffle's
     own stutter and the thing "Pride and Joy" is made of.
     Fill: two beats of triplets into tom, tom, peak. */
  groove(
    "shuffle",
    4,
    3,
    kit({
      length: 12,
      kick: "X.. ... x.. ..x",
      snare: "..o X.. ..o X..",
      hat: "X.x X.x X.x X.x",
    }),
  ),
  /* Waltz. Three. Kick on the one, snare on two and three — the oom-pah-pah
     every waltz is, and the one groove here that is not in four.

     Hats: eighths, accent on the beat, hit off it.
     Ghosts: none — a waltz that whispered between its beats would stop being
     a dance.
     Fill: beats two and three, so the bar still starts where it should. */
  groove(
    "waltz",
    3,
    2,
    kit({
      length: 6,
      kick: "X. .. ..",
      snare: ".. X. X.",
      hat: "Xx Xx Xx",
    }),
  ),
  /* Six-eight. Six eighths in two groups of three: the accent on four is the
     second pulse, and the snare answers it. Written one tick to the beat, so
     the click you hear is the six the meter is named after.

     Hats: an accent opening each group of three, hits on the other two.
     Ghosts: none; there is no room between eighths at this resolution.
     Fill: the last two eighths — one snare hit, then the low tom's peak. */
  groove(
    "sixEight",
    6,
    1,
    kit({
      length: 6,
      kick: "X.. x..",
      snare: "... X..",
      hat: "Xxx Xxx",
    }),
  ),
  /* Bossa. The cross-stick on the 3-2 clave, a shaker's sixteenths above it,
     and a bass drum that walks under both. Sixteenths, because the clave lands
     between the eighths and cannot be written without them.

     Hats: continuous sixteenths, accent / ghost / hit / ghost — the shaker the
     Latin card asks for, and the reason this no longer reads as an eighth-note
     rock hat with a Brazilian snare on it.
     Ghosts: the whole snare lane is at ghost level, and every one of them is a
     CROSS-STICK — `snareGhostIsRim` is what tells the engine so.
     Fill: two beats, and it moves to the toms like every other; a bossa fill
     is quiet, not absent, and Soft is what makes it quiet. */
  groove(
    "bossa",
    4,
    4,
    kit({
      length: 16,
      kick: "X... ..x. x... ..x.",
      snare: "o..o ..o. ..o. o...",
      hat: "Xoxo Xoxo Xoxo Xoxo",
    }),
    { rim: true },
  ),
  /* Swing ride. Spang-a-lang, the hat closing on two and four with the foot,
     and a feathered kick under all of it.

     Hats: the foot, on two and four, and nothing else — both hands are
     elsewhere.
     Ride: accented on two and four, hit on one and three and on every skip
     note. That lean is what swing IS; an evenly accented ride is a shuffle
     played on a cymbal.
     Ghosts: the kick, all four of them. A swing bass drum is felt rather than
     heard, which is the one place in this file where a ghost is not a quiet
     stroke between loud ones but the whole part.
     The snare is left empty: comping is the drummer's conversation with you,
     and a loop cannot have one.
     Fill: two beats of triplets into the toms — the one moment a swing drummer
     does play the snare in a loop. */
  groove(
    "swingRide",
    4,
    3,
    kit({
      length: 12,
      kick: "o.. o.. o.. o..",
      hat: "... x.. ... x..",
      ride: "x.x X.x x.x X.x",
    }),
  ),
  /* Funk. The kick never lands where the hat accents it: one, the "a" of one,
     the "a" of two and the "and" of three, so the bar leans forward the whole
     way through.

     Hats: sixteenths, accent / ghost / hit / ghost, accented on every beat so
     the syncopation has something square to pull against.
     Ghosts: six of them, and they are the groove — the two that FOLLOW each
     backbeat are the ones a drum machine leaves out, and they are why
     Superstition sounds like a person.
     Fill: two beats of sixteenths into tom, tom, peak. */
  groove(
    "funk",
    4,
    4,
    kit({
      length: 16,
      kick: "X..x ...x ..x. ....",
      snare: ".oo. X.oo .oo. X.o.",
      hat: "Xoxo Xoxo Xoxo Xoxo",
    }),
  ),
  /* One-drop. Beat one is empty — that is the drop the name is about — and the
     kick and the cross-stick land together on three.

     Hats: off-beats only, and they alternate too: an accent on the "and" of one
     and the "and" of three, a hit on the other two, so the bar floats in halves
     instead of ticking.
     Ghosts: the cross-stick on three, which is a rim click and says so
     (`snareGhostIsRim`). This is the groove whose comment used to apologise for
     having nowhere to put it.
     Fill: two beats, and the bar still opens on nothing, which is the joke. */
  groove(
    "oneDrop",
    4,
    2,
    kit({
      length: 8,
      kick: ".. .. X. ..",
      snare: ".. .. o. ..",
      hat: ".X .x .X .x",
    }),
    { rim: true },
  ),
  /* Train beat. Sixteenths on the snare with the accent on every "and" —
     brushes on a snare head is what this is played with, and the accent
     pattern is what makes it a train rather than a roll.

     Hats: none. Both hands are on the snare, which is also why this groove is
     the one exception to the hats rule above.
     Ghosts: none — every stroke here is a sweep, and the quiet ones are hits.
     Fill: two beats, and the toms at the end of it are the only moment the
     hands leave the snare head. */
  groove(
    "train",
    4,
    4,
    kit({
      length: 16,
      kick: "X... .... x... ....",
      snare: "xxXx xxXx xxXx xxXx",
    }),
  ),
  /* Boom bap. Kick on one and the "and" of two, backbeat on two and four.

     Hats: eighths, accent on the beat and a hit off it, with the LAST eighth
     of the bar opened — written in the `hatOpen` row, where the engine can
     actually hear it, instead of as the accent this groove used to use to mean
     it. That open stroke is what pulls the bar over into the next one.
     Ghosts: the "and" of one and the "and" of three, under the backbeats.
     Fill: two beats, and the open hat is silenced across them so the toms are
     not playing over a ringing cymbal. */
  groove(
    "boomBap",
    4,
    2,
    kit({
      length: 8,
      kick: "X. .x .. ..",
      snare: ".o X. .o X.",
      hat: "Xx Xx Xx X.",
      hatOpen: ".. .. .. .x",
    }),
  ),
  /* Four on the floor. A kick on every beat, the backbeat on two and four.

     Hats: the off-beats and none of the downs — the one groove here where the
     hat is never on a beat, which is what makes the off-beats lift. Accented
     on the "and" of one and the "and" of three so the four bars of a phrase
     still have a shape.
     Ghosts: none; the floor is the groove.
     Fill: two beats into the toms, over a kick that has finally stopped. */
  groove(
    "fourOnFloor",
    4,
    2,
    kit({
      length: 8,
      kick: "X. x. x. x.",
      snare: ".. X. .. X.",
      hat: ".X .x .X .x",
    }),
  ),

  // ---------------------------------------------------------------------
  // The seven the vibes brought (plans/JAM_UX_DECISIONS.md B4, A9).
  //
  // The first four are the ones that DRIVE, and what they have in common is
  // what they leave out: no ghost notes anywhere. The owner's verdict on the
  // first pass was that the band sounds smooth; a ghost note is the quietest
  // thing on the kit, and four grooves' worth of them under a rock tempo is
  // most of why. The last three are the ones the Latin and Funk vibes need
  // by name — a "Samba" tile that plays a fast bossa is the same lie the
  // first pass told with its groove names.
  // ---------------------------------------------------------------------

  /* Hard rock. Straight eighths with the hat OPEN on every off-beat — written
     in the `hatOpen` row now, which is the difference between Back in Black
     and a closed hat hit harder — a kick that pushes the bar over on the "and"
     of four, and a crash on the one.

     Hats: the closed hat accented on every beat, the open hat on every "and".
     The alternation is between the two ROWS rather than between two levels,
     which is exactly how it is played.
     Ghosts: none. This is one of the four drivers.
     Crash: in the bar rather than left to `crashOnOne`, because `crashOnOne` is
     once a chorus and this is the groove where the cymbal is part of the beat.
     At accent, not peak: every bar is often enough without it also being the
     loudest thing in the room.
     Fill: two beats, with the open hats silenced under them. */
  groove(
    "hardRock",
    4,
    2,
    kit({
      length: 8,
      kick: "X. .. x. .x",
      snare: ".. X. .. X.",
      hat: "X. X. X. X.",
      hatOpen: ".x .x .x .x",
      crash: "X. .. .. ..",
    }),
  ),
  /* Stomp. Half-time — the backbeat is on three and nowhere else — with the
     kick doing the work: one, two, four and the "and" of four.

     Hats: quarters, accented on one and three, because a half-time bar leans
     in halves. Nothing else: the space between the kicks is the groove.
     Ghosts: none. Driver.
     Fill: one beat, like every half-time bar here.
     The crash belongs to the section, so it is `crashOnOne`'s. */
  groove(
    "stomp",
    4,
    2,
    kit({
      length: 8,
      kick: "X. x. .. xx",
      snare: ".. .. X. ..",
      hat: "X. x. X. x.",
    }),
    { shortFill: true },
  ),
  /* Double kick. Sixteenths on the kick, unbroken, under a backbeat that stays
     exactly where a backbeat goes — two and four, accented, so the bar is
     still countable at two hundred.

     Kick: accent, hit, accent, hit all the way down. Sixteen identical kicks
     is a machine; alternating them is a pair of feet.
     Hats: eighths above, accented on every beat.
     Ghosts: none. Driver.
     Fill: two beats, and the kick stops dead under it, which at this tempo is
     the most dramatic thing in the bar.

     The bass under this one is `rock`, which puts a root on every kick. That
     is sixteen roots a bar, which reads as one held note under the voice rule
     (`applyBassVoice` in `./bassline`) — which is what a bass player does
     under a double-kick roll. */
  groove(
    "doubleKick",
    4,
    4,
    kit({
      length: 16,
      kick: "XxXx XxXx XxXx XxXx",
      snare: ".... X... .... X...",
      hat: "X.x. X.x. X.x. X.x.",
    }),
  ),
  /* Two-step. The country dance floor: an accented backbeat, quarters on the
     hat, and a kick on one, the "and" of two, three and the "and" of four,
     which is the walking bass line's own rhythm played on the drum. Fast — the
     vibe sets it near 170 — and it is the tempo that makes it a two-step
     rather than a rock beat.

     Hats: quarters, accented on one and three.
     Ghosts: none. Driver.
     Fill: two beats into the toms. */
  groove(
    "twoStep",
    4,
    2,
    kit({
      length: 8,
      kick: "X. .x x. .x",
      snare: ".. X. .. X.",
      hat: "X. x. X. x.",
    }),
  ),
  /* Samba. The surdo is the kick, and it leans on two and four — that is the
     one thing that makes a samba a samba rather than a fast bossa.

     Hats: the shaker, sixteenths, accent / ghost / hit / ghost.
     Ghosts: the tamborim, answering off the beat on the snare. They are ghosts
     and not cross-sticks: a tamborim is a struck head, so this groove does not
     set the rim flag even though the bossa beside it does.
     Fill: two beats into the toms — a surdo break, which is what a samba fill
     is. */
  groove(
    "samba",
    4,
    4,
    kit({
      length: 16,
      kick: "x... X... x... X...",
      snare: "..o. o..o ..o. o..o",
      hat: "Xoxo Xoxo Xoxo Xoxo",
    }),
  ),
  /* Cha-cha. The name is the figure: four, the "and" of four, one. It is
     written across the bar line — the last two ticks and the first — so the
     loop plays it whole every time round.

     Hats: the cowbell on the quarters, accented on one and three.
     Ghosts: the figure itself, on the snare at ghost level, and it is a
     CROSS-STICK (`snareGhostIsRim`) — Oye Como Va is played on the rim.
     Fill: two beats, which in a cha-cha is the bar's own figure with the toms
     underneath it. */
  groove(
    "chaCha",
    4,
    2,
    kit({
      length: 8,
      kick: "X. .. x. ..",
      snare: "o. .. .. oo",
      hat: "X. x. X. x.",
    }),
    { rim: true },
  ),
  /* Second line. The New Orleans street beat: a bass drum that syncopates all
     the way through the bar and a snare that rolls in ghosts with two accents
     — the backbeat on two, and the "a" of three, which is the push that makes
     the bar walk instead of march.

     Hats: quarters, accented on one and three, quietly, because both hands are
     busy.
     Ghosts: seven of them. Beat four is left EMPTY: the push on the "a" of
     three has just happened, and a ghost on the backbeat would take the push
     away — which is also the rule this pass applies everywhere.
     Fill: two beats of sixteenths into the toms, which is the one place a
     second-line drummer stops rolling. */
  groove(
    "secondLine",
    4,
    4,
    kit({
      length: 16,
      kick: "X..x ..x. x... ..x.",
      snare: ".oo. Xo.o .ooX .oo.",
      hat: "X... x... X... x...",
    }),
  ),

  // ---------------------------------------------------------------------
  // The five the third pass added.
  //
  // Three tiles were lying. "Ballad" played a half-time rock beat, "Slow"
  // played the same shuffle at sixty-two, and the jazz and Latin families had
  // holes a player would go looking for by name. Naming a groove after a
  // style and then playing something else is the thing `grooves.ts` already
  // refused to do for Samba; these five finish the job.
  // ---------------------------------------------------------------------

  /* Ballad. Slow eighths, the kick on one and three, and the backbeat played
     with the stick laid across the head.

     Hats: eighths, accent on the beat, hit off it — quiet in absolute terms
     because a ballad is played at Soft, loud in relative terms because the
     alternation is what keeps eight identical strokes from being a clock.
     Ghosts: two of them, on two and four, and they are CROSS-STICKS
     (`snareGhostIsRim`). That is the whole sound of a ballad drummer: no
     backbeat, a click.
     Fill: one beat — a ballad fill that took two would be a drum solo. */
  groove(
    "ballad",
    4,
    2,
    kit({
      length: 8,
      kick: "X. .. x. ..",
      snare: ".. o. .. o.",
      hat: "Xx Xx Xx Xx",
    }),
    { rim: true, shortFill: true },
  ),
  /* Slow blues. Twelve-eight: four beats of triplets, all three played, at the
     tempo The Thrill Is Gone is called at.

     Hats: every triplet, accented on the beat and hit on the other two. That
     rolling triplet underneath everything is the groove — take it down to the
     long-short of a shuffle and it becomes a fast blues at a slow tempo.
     Ghosts: the third triplet of beats one and three, leading into each
     backbeat. A slow blues has time for them, which is why it gets them and
     the fast shuffle beside it only gets two.
     Fill: two beats of triplets into the toms — six strokes and then the
     cymbal, which is every slow blues turnaround ever played. */
  groove(
    "slowBlues",
    4,
    3,
    kit({
      length: 12,
      kick: "X.. ... x.. ...",
      snare: "..o X.. ..o X..",
      hat: "Xxx Xxx Xxx Xxx",
    }),
  ),
  /* Jazz waltz. Three, swung: the ride plays one, two, the "let" of two,
     three, the "let" of three, and the foot closes the hat on two and three.

     Hats: the foot, on beats two and three, and nothing else.
     Ride: accent on the one, hits everywhere else — a jazz waltz leans on the
     downbeat because there is no backbeat to lean on instead.
     Ghosts: the kick, feathered, as in the swing ride. The snare is left empty
     for the same reason: comping is a conversation.
     Fill: beats two and three, into the toms. */
  groove(
    "jazzWaltz",
    3,
    3,
    kit({
      length: 9,
      kick: "o.. ... ...",
      hat: "... x.. x..",
      ride: "X.. x.x x.x",
    }),
  ),
  /* Motown. The snare on all four beats — a hit on one and three, an accent on
     two and four — which is the thing that makes a Motown record feel like it
     is being pushed from behind.

     Hats: eighths, accent on the beat, hit off it; on the records this is a
     tambourine, and it is doubled by the hat.
     Ghosts: none. Every stroke in this groove is meant to be heard.
     Fill: two beats into the toms, over a kick that drops out. */
  groove(
    "motown",
    4,
    2,
    kit({
      length: 8,
      kick: "X. .. x. ..",
      snare: "x. X. x. X.",
      hat: "Xx Xx Xx Xx",
    }),
  ),
  /* Mambo. The bell on the ride, the tumbao on the kick, and the shaker on the
     "and" of every beat.

     Hats: the off-beats, accented on the "and" of one and three — the shaker
     answering the bell rather than doubling it.
     Ride: the mambo bell — one, two, the "and" of two, three, four, the "and"
     of four — accented on one and three, which is where the bell player's
     wrist turns over.
     Ghosts: none, and no snare at all: in a mambo the snare's job belongs to
     the timbales and the congas, and an invented backbeat would be the same
     lie as a samba played as a bossa.
     Fill: two beats, and it goes to the toms, which is as close as this kit
     gets to a timbale abanico. */
  groove(
    "mambo",
    4,
    4,
    kit({
      length: 16,
      kick: "X... ..x. .... x...",
      hat: "..X. ..x. ..X. ..x.",
      ride: "X... x.x. X... x.x.",
    }),
  ),
];

export const DEFAULT_GROOVE_ID = "rock8";

/** The groove with this id, or the default — a saved jam may name one that went. */
export function grooveById(id: string): Groove {
  return GROOVES.find((g) => g.id === id) ?? GROOVES[0];
}

/** How many ticks one bar of this groove has. */
export function grooveTickCount(g: Pick<Groove, "beatsPerBar" | "ticksPerBeat">): number {
  return g.beatsPerBar * g.ticksPerBeat;
}

/** The id the rule groove answers to, so a card can say which one is playing. */
export const RULE_GROOVE_ID = "rule";

/**
 * A drummer for a meter nobody wrote a groove for (JAM_MODE §4.1).
 *
 * Twenty-five grooves is twenty-five grooves, and none of them is in 7/8. The
 * alternative to a rule is a jam in seven with no drummer in it, so: **kick on
 * the first beat of each group, snare on the last beat of every group of two
 * or more, hats on every tick.** That is not a groove anyone would name, and
 * it is exactly what a drummer sight-reading an odd bar plays — the groups are
 * the bar's own accents, and putting the kick on them is what makes 3+2+2
 * audible as 3+2+2 rather than as seven of something.
 *
 * A group of ONE gets a kick and no snare: a backbeat inside a single beat
 * would land on the same tick as the kick and read as a flam rather than as
 * time.
 *
 * The fill is the LAST GROUP rather than the last two beats — two beats of a
 * 3+2+2 bar is a group and a half and would start the fill mid-group — and
 * from there it is the same shape every written groove gets: the run-up on the
 * snare, then the high tom and the low tom's peak across the final beat.
 *
 * `beatGroups` is the metronome's own meter array ([3, 2, 2] for 7/8), so a
 * jam and the metronome tab mean the same thing by "the meter".
 */
export function ruleGroove(beatGroups: number[], ticksPerBeat: GrooveTicks): Groove {
  // Dropped, not clamped: a group of 0 in a saved meter is junk, and turning
  // it into a group of 1 would silently lengthen the bar rather than ignore
  // the entry that made no sense.
  const groups = beatGroups
    .map((n) => Math.trunc(n))
    .filter((n) => Number.isFinite(n) && n > 0);
  const safe = groups.length > 0 ? groups : [4];
  const beatsPerBar = safe.reduce((sum, n) => sum + n, 0);
  const length = beatsPerBar * ticksPerBeat;

  const bar: JamPattern = {
    kick: silent(length),
    snare: silent(length),
    hat: silent(length),
    ride: silent(length),
    crash: silent(length),
  };

  let beat = 0;
  for (const group of safe) {
    // The group's first beat is where the bar leans, so it takes the kick and
    // the accent — this is the tick the engine would accent anyway.
    bar.kick[beat * ticksPerBeat] = 2;
    // The backbeat, as late in the group as there is room for one, and an
    // accent like every other backbeat in this file.
    if (group >= 2) bar.snare[(beat + group - 1) * ticksPerBeat] = 2;
    beat += group;
  }
  // The subdivision, accented where a group opens, so the hats spell the
  // grouping out even when the kick is buried under the band.
  let cursor = 0;
  for (const group of safe) {
    for (let i = 0; i < group * ticksPerBeat; i++) {
      const tick = cursor + i;
      bar.hat[tick] = i === 0 ? 2 : 1;
    }
    cursor += group * ticksPerBeat;
  }

  const lastGroup = safe[safe.length - 1];
  const fill = fillOver(bar, length, (beatsPerBar - lastGroup) * ticksPerBeat, ticksPerBeat);

  return {
    id: RULE_GROOVE_ID,
    nameKey: `jam.groove.${RULE_GROOVE_ID}`,
    beatsPerBar,
    ticksPerBeat,
    bar,
    fill,
  };
}
