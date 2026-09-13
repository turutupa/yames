/**
 * The thirteen grooves the drummer knows, written as tables on the tick grid.
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
 * Levels are the four a drummer plays: 0 silent, 1 a hit, 2 an accent, 3 a
 * ghost. Ghosts are what make a funk sixteenth-note groove sound played rather
 * than programmed, so they are written in rather than left for the intensity
 * control to invent.
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
};

/** An all-silent lane of the right length — every pattern starts from these. */
function silent(length: number): JamLevel[] {
  return new Array<JamLevel>(length).fill(0);
}

/**
 * A lane written as a string, one character per tick.
 *
 * `X` accent, `x` hit, `o` ghost, `.` silence. Spaces and `|` are ignored, so
 * a bar can be written with its beats separated and read like a drum chart —
 * which is the only way a sixteen-column table stays checkable by eye.
 */
function lane(spec: string): JamLevel[] {
  const out: JamLevel[] = [];
  for (const ch of spec) {
    if (ch === " " || ch === "|") continue;
    out.push(ch === "X" ? 2 : ch === "x" ? 1 : ch === "o" ? 3 : 0);
  }
  return out;
}

/** A whole kit from four lane strings; anything omitted is silent. */
function kit(spec: {
  kick?: string;
  snare?: string;
  hat?: string;
  ride?: string;
  crash?: string;
  length: number;
}): JamPattern {
  const { length } = spec;
  const of = (s?: string) => (s ? lane(s) : silent(length));
  return {
    kick: of(spec.kick),
    snare: of(spec.snare),
    hat: of(spec.hat),
    ride: of(spec.ride),
    crash: of(spec.crash),
  };
}

/**
 * The snare figure a fill puts over the last two beats, by resolution.
 *
 * One accent per beat with the subdivision filled in between it — the plainest
 * fill a drummer plays and the one that reads as "here comes the top" rather
 * than as a solo. The crash that answers it lands on the next bar's one, which
 * is the engine's job (`crashOnOne`), not this table's.
 */
const FILL_FIGURE: Record<GrooveTicks, string> = {
  1: "Xx",
  2: "Xx Xx",
  3: "Xxx Xxx",
  4: "Xxxx Xxxx",
  6: "Xxxxxx Xxxxxx",
};

/**
 * A fill built from the groove it interrupts.
 *
 * The first part of the bar is the groove, unchanged: a fill that threw the
 * whole bar away would stop the time dead in the two beats before the one.
 * The last two beats are the snare figure, with everything else out of the
 * way so it is heard as a fill rather than as the groove with extra snare on
 * top. A bar shorter than two beats keeps the groove and takes the figure on
 * its last beat.
 */
function fillFor(beatsPerBar: number, ticksPerBeat: GrooveTicks, bar: JamPattern): JamPattern {
  const length = beatsPerBar * ticksPerBeat;
  const figureBeats = Math.min(2, beatsPerBar);
  const from = (beatsPerBar - figureBeats) * ticksPerBeat;
  const figure = lane(FILL_FIGURE[ticksPerBeat]).slice(0, figureBeats * ticksPerBeat);
  const out: JamPattern = {
    kick: [...bar.kick],
    snare: [...bar.snare],
    hat: [...bar.hat],
    ride: [...bar.ride],
    crash: [...bar.crash],
  };
  for (let i = from; i < length; i++) {
    out.kick[i] = 0;
    out.hat[i] = 0;
    out.ride[i] = 0;
    out.crash[i] = 0;
    out.snare[i] = figure[i - from] ?? 0;
  }
  return out;
}

function groove(
  id: string,
  beatsPerBar: number,
  ticksPerBeat: GrooveTicks,
  bar: JamPattern,
): Groove {
  return {
    id,
    nameKey: `jam.groove.${id}`,
    beatsPerBar,
    ticksPerBeat,
    bar,
    fill: fillFor(beatsPerBar, ticksPerBeat, bar),
  };
}

/**
 * The thirteen, in the order the picker draws them: the four you reach for
 * first, then the three that carry their own meter, then the jazz one, then
 * the five that came later — the ones you go looking for by name rather than
 * land on by accident.
 *
 * Appended rather than interleaved, and deliberately: the footswitch steps
 * this list in order (`stepGroove` in `useJamSession`), so re-sorting it would
 * move every groove out from under the stomp that used to reach it.
 */
export const GROOVES: readonly Groove[] = [
  /* Kick on one and three, backbeat on two and four, eighths on the hat with
     the beat accented. The first groove anybody would name. */
  groove(
    "rock8",
    4,
    2,
    kit({
      length: 8,
      kick: "X. .. x. ..",
      snare: ".. x. .. x.",
      hat: "Xx xx xx xx",
    }),
  ),
  /* Sixteenths on the hat and a kick that syncopates against them, with the
     snare's ghosts filling the gaps. The ghosts are the groove: without them
     this is the same pattern a drum machine plays. */
  groove(
    "rock16",
    4,
    4,
    kit({
      length: 16,
      kick: "X..x ..x. ...x .x..",
      snare: "..o. x..o .o.. x.o.",
      hat: "Xxxx Xxxx Xxxx Xxxx",
    }),
  ),
  /* The backbeat moves to three and the bar feels half as fast, which is what
     everybody means by half-time. The hat keeps the eighths so the tempo is
     still findable. */
  groove(
    "halfTime",
    4,
    2,
    kit({
      length: 8,
      kick: "X. .. .. x.",
      snare: ".. .. x. ..",
      hat: "Xx xx xx xx",
    }),
  ),
  /* Triplets with the middle one silent — the long-short that is a shuffle,
     and the reason a shuffle needs no engine change (JAM_MODE §4.1). */
  groove(
    "shuffle",
    4,
    3,
    kit({
      length: 12,
      kick: "X.. ... x.. ..x",
      snare: "... x.. ... x..",
      hat: "X.x x.x x.x x.x",
    }),
  ),
  /* Three. Kick on the one, snare on two and three — the oom-pah-pah every
     waltz is, and the one groove here that is not in four. */
  groove(
    "waltz",
    3,
    2,
    kit({
      length: 6,
      kick: "X. .. ..",
      snare: ".. x. x.",
      hat: "Xx xx xx",
    }),
  ),
  /* Six eighths in two groups of three: the accent on four is the second
     pulse, and the snare answers it. Written one tick to the beat, so the
     click you hear is the six the meter is named after. */
  groove(
    "sixEight",
    6,
    1,
    kit({
      length: 6,
      kick: "X.. x..",
      snare: "... x..",
      hat: "Xxx Xxx",
    }),
  ),
  /* The bossa: a rim click on the 3-2 clave, eighths on the hat, and a bass
     drum that walks under both. Sixteenths, because the clave lands between
     the eighths and cannot be written without them. */
  groove(
    "bossa",
    4,
    4,
    kit({
      length: 16,
      kick: "X... ..x. x... ..x.",
      snare: "x..x ..x. ..x. x...",
      hat: "X.x. x.x. x.x. x.x.",
    }),
  ),
  /* Spang-a-lang on the ride, the hat closing on two and four with the foot,
     and a feathered kick under all of it — ghosts, because a swing bass drum
     is felt rather than heard. The snare is left empty: comping is the
     drummer's conversation with you, and a loop cannot have one. */
  groove(
    "swingRide",
    4,
    3,
    kit({
      length: 12,
      kick: "o.. o.. o.. o..",
      hat: "... x.. ... x..",
      ride: "X.x x.x x.x x.x",
    }),
  ),
  /* Funk. The kick never lands where the hat accents it: one, the "a" of one,
     the "a" of two and the "and" of three, so the bar leans forward the whole
     way through. The snare's ghosts are the groove — the two that follow the
     backbeat are the ones a drum machine leaves out — and the hat accents one
     and three so the syncopation has something square to pull against. */
  groove(
    "funk",
    4,
    4,
    kit({
      length: 16,
      kick: "X..x ...x ..x. ....",
      snare: ".oo. X.oo .oo. X.o.",
      hat: "Xxxx xxxx Xxxx xxxx",
    }),
  ),
  /* Reggae one-drop. Beat one is empty — that is the drop the name is about —
     and the kick and the side stick land together on three. Hats on the
     off-beats and nothing on the down, so the bar floats instead of marching.

     The side stick is written on the snare lane at ghost level: the contract's
     five lanes are kick, snare, hat, ride and crash (`JamLane`), so there is
     no rim lane to put it on, and a ghost is the quiet snare the kits have. */
  groove(
    "oneDrop",
    4,
    2,
    kit({
      length: 8,
      kick: ".. .. X. ..",
      snare: ".. .. o. ..",
      hat: ".x .x .x .x",
    }),
  ),
  /* Train beat. Sixteenths on the snare with the accent on every "and" —
     brushes on a snare head is what this is played with, and the accent
     pattern is what makes it a train rather than a roll. Kick on one and
     three underneath, and nothing on the hat: both hands are on the snare. */
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
  /* Boom bap. Kick on one and the "and" of two, snare on two and four, and
     eighths on the hat with the last one accented — the open hat that pulls
     the bar over into the next one. It is drawn as an accent rather than an
     open hat because the contract's lanes have no open-hat row; the kits have
     the voice, and the lane set is the engine's to grow. */
  groove(
    "boomBap",
    4,
    2,
    kit({
      length: 8,
      kick: "X. .x .. ..",
      snare: ".. x. .. x.",
      hat: "Xx xx xx xX",
    }),
  ),
  /* Four on the floor. A kick on every beat, the backbeat on two and four,
     and the hat only on the off-beats — the one groove here where the hat is
     never on a downbeat, which is what makes the off-beats lift. */
  groove(
    "fourOnFloor",
    4,
    2,
    kit({
      length: 8,
      kick: "X. x. x. x.",
      snare: ".. x. .. x.",
      hat: ".x .x .x .x",
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
 * How far apart two eighths are at this resolution.
 *
 * Sixteenths give two ticks to an eighth, eighths give one, and a triplet beat
 * gives the shuffle's long-short — which is what an eighth IS in a triplet
 * feel, and the reason this rounds rather than refusing. A beat with one tick
 * has no eighths to play, so the figure lands on the beat.
 */
function eighthStep(ticksPerBeat: GrooveTicks): number {
  return ticksPerBeat >= 2 ? Math.round(ticksPerBeat / 2) : 1;
}

/**
 * A drummer for a meter nobody wrote a groove for (JAM_MODE §4.1).
 *
 * Thirteen grooves is thirteen grooves, and none of them is in 7/8. The
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
 * The fill is snare eighths over the LAST GROUP, with the other lanes out of
 * the way — the same shape `fillFor` gives the written grooves, measured in
 * the bar's own last group rather than in two beats, because two beats of a
 * 3+2+2 bar is a group and a half and would start the fill mid-group.
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
    // The backbeat, as late in the group as there is room for one.
    if (group >= 2) bar.snare[(beat + group - 1) * ticksPerBeat] = 1;
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
  const fillFrom = (beatsPerBar - lastGroup) * ticksPerBeat;
  const fill: JamPattern = {
    kick: [...bar.kick],
    snare: [...bar.snare],
    hat: [...bar.hat],
    ride: [...bar.ride],
    crash: [...bar.crash],
  };
  const step = eighthStep(ticksPerBeat);
  for (let tick = fillFrom; tick < length; tick++) {
    fill.kick[tick] = 0;
    fill.hat[tick] = 0;
    fill.ride[tick] = 0;
    fill.crash[tick] = 0;
    const into = tick - fillFrom;
    // An accent on each beat of the group with the eighths filled in between,
    // which is the plainest fill there is and the one that reads as "here
    // comes the top" rather than as a solo.
    fill.snare[tick] =
      into % ticksPerBeat === 0 ? 2 : into % step === 0 ? 1 : 0;
  }

  return {
    id: RULE_GROOVE_ID,
    nameKey: `jam.groove.${RULE_GROOVE_ID}`,
    beatsPerBar,
    ticksPerBeat,
    bar,
    fill,
  };
}
