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
