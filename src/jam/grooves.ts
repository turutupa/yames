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
 *
 * ## The fifth pass: the second player
 *
 * Fifty-eight of these bars now carry PERCUSSION rows as well — a shaker, a
 * clave, a tumbao, a tambourine on two and four — and fifty-seven do not. Both
 * halves are decisions, so every groove's comment ends with a `Percussion:`
 * line saying which one it got and why; a test counts them, because a comment
 * is the one thing in this file a type cannot hold in place.
 *
 * Two things worth knowing before reading them. The rows are written against
 * the style's own practice and not derived from the drums — a son's claves say
 * the 3-2 because a son's claves say the 3-2, and a tumbao's open tones land
 * on four and the "and" of four whatever the kick is doing. And they obey the
 * same dynamics rules the kit does: a shaker alternates like a hat, a figure
 * accents where the figure accents, and there is not a percussion row of one
 * level in the file.
 *
 * What is NOT here is a fill. The percussionist keeps playing while the
 * drummer goes round the toms, so the fills carry no percussion at all and
 * `compileJam` carries the bar's rows across them instead. A percussion row on
 * a fill would be two shakers for one bar, every time round the form.
 */
import { JAM_PERC_LANES } from "./types";
import type { JamLevel, JamPattern, JamPercLane } from "./types";

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
  /**
   * Which shelf of the record shop this came off. The picker groups by it and
   * the chip row filters by it, which is the only way a hundred and fifteen
   * cards is a library rather than a wall.
   */
  family: GrooveFamily;
  /**
   * What a player would say about it besides its name: "sixteenths, ghosts,
   * half-time". Not on screen — the cards carry a name and a glyph and have no
   * room for more — and written down anyway, because the moment a groove is
   * being authored is the only moment anybody knows which words are true of
   * it, and a search that has to guess them later will guess wrong.
   */
  tags: readonly GrooveTag[];
};

/**
 * The nine shelves. Not genres — a genre argument has no end — but the nine
 * headings a drummer's own practice book has, which is a different and much
 * shorter list: the ones where the same tag would be a lie about the other
 * eight.
 *
 * "funk" carries soul and hip-hop, "pop" carries dance and electronic,
 * "country" carries folk, "metal" carries punk, and "world" is everything
 * whose bar is not a Western backbeat — which is one shelf here not because
 * those musics are one thing but because nine tiles is the most a chip row
 * can hold before it stops being a row.
 */
export const GROOVE_FAMILIES = [
  "rock",
  "blues",
  "funk",
  "jazz",
  "latin",
  "pop",
  "metal",
  "country",
  "world",
] as const;

export type GrooveFamily = (typeof GROOVE_FAMILIES)[number];

/**
 * The closed vocabulary a groove's `tags` are drawn from.
 *
 * Closed rather than free text, and tested: two grooves that both swing have
 * to say so with the same word or the word is worth nothing.
 */
export const GROOVE_TAGS = [
  // What the bar is made of.
  "quarters",
  "eighths",
  "sixteenths",
  "triplets",
  "sextuplets",
  // How it is counted.
  "shuffle",
  "swing",
  "halfTime",
  "doubleTime",
  "twoFeel",
  "three",
  "six",
  "odd",
  // What the hands are doing.
  "ghosts",
  "crossStick",
  "openHats",
  "ride",
  "bell",
  "brushes",
  // What it does to the room.
  "backbeat",
  "driving",
  "sparse",
  "syncopated",
  "offbeat",
  "fourOnFloor",
  "clave",
] as const;

export type GrooveTag = (typeof GROOVE_TAGS)[number];

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
function kit(
  spec: {
    kick?: string;
    snare?: string;
    hat?: string;
    hatOpen?: string;
    ride?: string;
    crash?: string;
    tomHi?: string;
    tomLo?: string;
    length: number;
  } & Partial<Record<JamPercLane, string>>,
): JamPattern {
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
  // The percussionist's rows, written the same way and only where a groove
  // names one. A groove with no percussion carries none of these, which is
  // most of the hundred and fifteen: see the comment over each one.
  for (const perc of JAM_PERC_LANES) {
    const row = spec[perc];
    if (row) out[perc] = lane(row);
  }
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
  /** Which shelf. Required: a groove nobody filed is a groove nobody finds. */
  family: GrooveFamily;
  /** Two to four words from `GROOVE_TAGS`. Required for the same reason. */
  tags: readonly GrooveTag[];
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
  options: GrooveOptions,
): Groove {
  return {
    id,
    nameKey: `jam.groove.${id}`,
    beatsPerBar,
    ticksPerBeat,
    bar,
    fill: fillFor(beatsPerBar, ticksPerBeat, bar, options.shortFill === true),
    ...(options.rim ? { snareGhostIsRim: true } : {}),
    family: options.family,
    tags: options.tags,
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
     peak across beat four.
     Percussion: none — a plain rock bar has three players in it and none of them
     is a percussionist. */
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
    { family: "rock", tags: ["eighths", "backbeat", "driving"] },
  ),
  /* Rock sixteenths. The kick syncopates against the hat all the way through;
     the snare's ghosts fill the gaps around the backbeat.

     Hats: sixteenths as accent / ghost / hit / ghost — down hard, up light,
     down, up. That one figure is most of the difference between this table and
     the one a drum machine plays.
     Ghosts: on the "e" of two, the "a" of two, the "e" of three and the "a" of
     four — around the backbeats, never on one.
     Fill: two beats of snare sixteenths, then tom, tom, peak.
     Percussion: none — the ghosts are the ornament here; a shaker over them would
     be one hand too many. */
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
    { family: "rock", tags: ["sixteenths", "ghosts", "syncopated"] },
  ),
  /* Half-time. The backbeat moves to three and the bar feels half as fast,
     which is what everybody means by half-time. The hat keeps the eighths so
     the tempo is still findable.

     Hats: eighths, accent on the beat, hit off it.
     Ghosts: the "and" of two and the "and" of four — the two strokes a
     half-time player uses to keep their right hand honest while the backbeat
     waits.
     Fill: one beat, because a bar counted in halves has no room for two.
     Percussion: none — half-time is about the space, and percussion is what fills
     space. */
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
    { family: "rock", tags: ["halfTime", "eighths", "ghosts"], shortFill: true },
  ),
  /* Shuffle. Triplets with the middle one silent — the long-short that is a
     shuffle, and the reason a shuffle needs no engine change (JAM_MODE §4.1).

     Hats: accent on the beat, hit on the skip note. Two levels, one hand.
     Ghosts: on the skip note before each backbeat, which is the Texas shuffle's
     own stutter and the thing "Pride and Joy" is made of.
     Fill: two beats of triplets into tom, tom, peak.
     Percussion: none — a shuffle band is guitar, bass and drums, and the drummer
     is busy. */
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
    { family: "blues", tags: ["shuffle", "triplets", "ghosts"] },
  ),
  /* Waltz. Three. Kick on the one, snare on two and three — the oom-pah-pah
     every waltz is, and the one groove here that is not in four.

     Hats: eighths, accent on the beat, hit off it.
     Ghosts: none — a waltz that whispered between its beats would stop being
     a dance.
     Fill: beats two and three, so the bar still starts where it should.
     Percussion: none — a country waltz is three beats and a brush. */
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
    { family: "country", tags: ["three", "eighths"] },
  ),
  /* Six-eight. Six eighths in two groups of three: the accent on four is the
     second pulse, and the snare answers it. Written one tick to the beat, so
     the click you hear is the six the meter is named after.

     Hats: an accent opening each group of three, hits on the other two.
     Ghosts: none; there is no room between eighths at this resolution.
     Fill: the last two eighths — one snare hit, then the low tom's peak.
     Percussion: none — nothing in a six-eight folk bar wants a jingle over it. */
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
    { family: "country", tags: ["six", "eighths"] },
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
     is quiet, not absent, and Soft is what makes it quiet.
     Percussion: the ganza, sixteenths, accent / ghost / hit / ghost — the
     same hand the hat row is drawing, played by the person whose job it
     actually is. No claves: the 3-2 is already in the drummer's left hand as
     the cross-stick, and a bossa trio does not have two people saying it. */
  groove(
    "bossa",
    4,
    4,
    kit({
      length: 16,
      kick: "X... ..x. x... ..x.",
      snare: "o..o ..o. ..o. o...",
      hat: "Xoxo Xoxo Xoxo Xoxo",
      shaker: "Xoxo Xoxo Xoxo Xoxo",
    }),
    { family: "latin", tags: ["sixteenths", "crossStick", "clave"], rim: true },
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
     does play the snare in a loop.
     Percussion: none — the ride is the percussion, and it has been since 1940. */
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
    { family: "jazz", tags: ["swing", "triplets", "ride"] },
  ),
  /* Funk. The kick never lands where the hat accents it: one, the "a" of one,
     the "a" of two and the "and" of three, so the bar leans forward the whole
     way through.

     Hats: sixteenths, accent / ghost / hit / ghost, accented on every beat so
     the syncopation has something square to pull against.
     Ghosts: six of them, and they are the groove — the two that FOLLOW each
     backbeat are the ones a drum machine leaves out, and they are why
     Superstition sounds like a person.
     Fill: two beats of sixteenths into tom, tom, peak.
     Percussion: a shaker on the sixteenths, the same accent / ghost / hit /
     ghost the hand on the hat is playing. A funk band has one going almost
     without exception, and it is the layer that makes the sixteenths feel
     continuous when the hat stops to let a kick through. */
  groove(
    "funk",
    4,
    4,
    kit({
      length: 16,
      kick: "X..x ...x ..x. ....",
      snare: ".oo. X.oo .oo. X.o.",
      hat: "Xoxo Xoxo Xoxo Xoxo",
      shaker: "Xoxo Xoxo Xoxo Xoxo",
    }),
    { family: "funk", tags: ["sixteenths", "ghosts", "syncopated"] },
  ),
  /* One-drop. Beat one is empty — that is the drop the name is about — and the
     kick and the cross-stick land together on three.

     Hats: off-beats only, and they alternate too: an accent on the "and" of one
     and the "and" of three, a hit on the other two, so the bar floats in halves
     instead of ticking.
     Ghosts: the cross-stick on three, which is a rim click and says so
     (`snareGhostIsRim`). This is the groove whose comment used to apologise for
     having nowhere to put it.
     Fill: two beats, and the bar still opens on nothing, which is the joke.
     Percussion: a shaker on the eighths, accent on the beat and a hit off
     it. It is on almost every Wailers record and it is doing one job — the
     bar drops its one, and something has to still be counting. */
  groove(
    "oneDrop",
    4,
    2,
    kit({
      length: 8,
      kick: ".. .. X. ..",
      snare: ".. .. o. ..",
      hat: ".X .x .X .x",
      shaker: "Xx Xx Xx Xx",
    }),
    { family: "world", tags: ["eighths", "crossStick", "offbeat", "sparse"], rim: true },
  ),
  /* Train beat. Sixteenths on the snare with the accent on every "and" —
     brushes on a snare head is what this is played with, and the accent
     pattern is what makes it a train rather than a roll.

     Hats: none. Both hands are on the snare, which is also why this groove is
     the one exception to the hats rule above.
     Ghosts: none — every stroke here is a sweep, and the quiet ones are hits.
     Fill: two beats, and the toms at the end of it are the only moment the
     hands leave the snare head.
     Percussion: none — the train beat IS the percussion — sixteen strokes a bar
     with brushes on a snare, and a shaker over it would be a second train. */
  groove(
    "train",
    4,
    4,
    kit({
      length: 16,
      kick: "X... .... x... ....",
      snare: "xxXx xxXx xxXx xxXx",
    }),
    { family: "country", tags: ["sixteenths", "brushes", "driving"] },
  ),
  /* Boom bap. Kick on one and the "and" of two, backbeat on two and four.

     Hats: eighths, accent on the beat and a hit off it, with the LAST eighth
     of the bar opened — written in the `hatOpen` row, where the engine can
     actually hear it, instead of as the accent this groove used to use to mean
     it. That open stroke is what pulls the bar over into the next one.
     Ghosts: the "and" of one and the "and" of three, under the backbeats.
     Fill: two beats, and the open hat is silenced across them so the toms are
     not playing over a ringing cymbal.
     Percussion: a shaker on the eighths, looped over the top the way a
     record would have been — accent on the beat, hit off it. It is the
     easiest thing in this file to hear and the easiest to get wrong: flat,
     it is a hi-hat; alternating, it is a person. */
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
      shaker: "Xx Xx Xx Xx",
    }),
    { family: "funk", tags: ["eighths", "ghosts", "openHats"] },
  ),
  /* Four on the floor. A kick on every beat, the backbeat on two and four.

     Hats: the off-beats and none of the downs — the one groove here where the
     hat is never on a beat, which is what makes the off-beats lift. Accented
     on the "and" of one and the "and" of three so the four bars of a phrase
     still have a shape.
     Ghosts: none; the floor is the groove.
     Fill: two beats into the toms, over a kick that has finally stopped.
     Percussion: a shaker on the eighths and nothing else. This is the
     programmed one — the tile that reaches it chooses the electronic kit —
     and a tambourine over a machine bar is a session player in a room that
     has not been built. The shaker is the layer those records do have. */
  groove(
    "fourOnFloor",
    4,
    2,
    kit({
      length: 8,
      kick: "X. x. x. x.",
      snare: ".. X. .. X.",
      hat: ".X .x .X .x",
      shaker: "Xx Xx Xx Xx",
    }),
    { family: "pop", tags: ["fourOnFloor", "offbeat", "driving"] },
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
     Fill: two beats, with the open hats silenced under them.
     Percussion: none — nobody has ever wanted a shaker on a hard rock bar. */
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
    { family: "rock", tags: ["eighths", "openHats", "driving"] },
  ),
  /* Stomp. Half-time — the backbeat is on three and nowhere else — with the
     kick doing the work: one, two, four and the "and" of four.

     Hats: quarters, accented on one and three, because a half-time bar leans
     in halves. Nothing else: the space between the kicks is the groove.
     Ghosts: none. Driver.
     Fill: one beat, like every half-time bar here.
     The crash belongs to the section, so it is `crashOnOne`'s.
     Percussion: none — the whole groove is two strokes and their echo. */
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
    { family: "rock", tags: ["halfTime", "quarters", "driving"], shortFill: true },
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
     under a double-kick roll.
     Percussion: none — there is no room and no reason. */
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
    { family: "metal", tags: ["sixteenths", "driving", "backbeat"] },
  ),
  /* Two-step. The country dance floor: an accented backbeat, quarters on the
     hat, and a kick on one, the "and" of two, three and the "and" of four,
     which is the walking bass line's own rhythm played on the drum. Fast — the
     vibe sets it near 170 — and it is the tempo that makes it a two-step
     rather than a rock beat.

     Hats: quarters, accented on one and three.
     Ghosts: none. Driver.
     Fill: two beats into the toms.
     Percussion: none — two-step is a dance floor and a backbeat. */
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
    { family: "country", tags: ["quarters", "backbeat", "driving"] },
  ),
  /* Samba. The surdo is the kick, and it leans on two and four — that is the
     one thing that makes a samba a samba rather than a fast bossa.

     Hats: the shaker, sixteenths, accent / ghost / hit / ghost.
     Ghosts: the tamborim, answering off the beat on the snare. They are ghosts
     and not cross-sticks: a tamborim is a struck head, so this groove does not
     set the rim flag even though the bossa beside it does.
     Fill: two beats into the toms — a surdo break, which is what a samba fill
     is.
     Percussion: the ganza on the sixteenths and the agogo over it — the low
     bell on the beat, the high one answering on the "and" of two and of
     four. The tamborim is on the snare already and the surdo is the kick, so
     those are the two layers of a bateria this bar is still missing. */
  groove(
    "samba",
    4,
    4,
    kit({
      length: 16,
      kick: "x... X... x... X...",
      snare: "..o. o..o ..o. o..o",
      hat: "Xoxo Xoxo Xoxo Xoxo",
      shaker: "Xoxo Xoxo Xoxo Xoxo",
      cowbell: "X.x. ..X. X.x. ..X.",
    }),
    { family: "latin", tags: ["sixteenths", "ghosts", "clave"] },
  ),
  /* Cha-cha. The name is the figure: four, the "and" of four, one. It is
     written across the bar line — the last two ticks and the first — so the
     loop plays it whole every time round.

     Hats: the cowbell on the quarters, accented on one and three.
     Ghosts: the figure itself, on the snare at ghost level, and it is a
     CROSS-STICK (`snareGhostIsRim`) — Oye Como Va is played on the rim.
     Fill: two beats, which in a cha-cha is the bar's own figure with the toms
     underneath it.
     Percussion: the guiro scrapes down on the beat and up off it, and the
     congas play the tumbao — muted heel and tip through the bar, then the
     two open tones on four and the "and" of four, which is the figure the
     dance steps to. The tumba answers the bombo on the "and" of two. */
  groove(
    "chaCha",
    4,
    2,
    kit({
      length: 8,
      kick: "X. .. x. ..",
      snare: "o. .. .. oo",
      hat: "X. x. X. x.",
      guiro: "Xx Xx Xx Xx",
      congaHi: "o. o. o. XX",
      congaLo: "x. .X .. ..",
    }),
    { family: "latin", tags: ["crossStick", "quarters", "clave"], rim: true },
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
     second-line drummer stops rolling.
     Percussion: a tambourine on two and four with the shake into each one,
     and congas — muted through the bar with the open tones on the backbeats,
     the low drum tracking the kick's syncopation. A second line is a PARADE:
     the whole point is that more than one person is playing. */
  groove(
    "secondLine",
    4,
    4,
    kit({
      length: 16,
      kick: "X..x ..x. x... ..x.",
      snare: ".oo. Xo.o .ooX .oo.",
      hat: "X... x... X... x...",
      tambourine: "...o X... ...o X...",
      congaHi: "o.o. X.o. o.o. X.o.",
      congaLo: "X... ..x. .... ..x.",
    }),
    { family: "funk", tags: ["sixteenths", "ghosts", "syncopated"] },
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
     Fill: one beat — a ballad fill that took two would be a drum solo.
     Percussion: a tambourine on two and four, shake on the "and" before. A
     ballad has one player's worth of percussion and this is the part they
     play; the rest of the bar is deliberately empty and stays that way. */
  groove(
    "ballad",
    4,
    2,
    kit({
      length: 8,
      kick: "X. .. x. ..",
      snare: ".. o. .. o.",
      hat: "Xx Xx Xx Xx",
      tambourine: ".x X. .x X.",
    }),
    { family: "pop", tags: ["eighths", "crossStick", "sparse"], rim: true, shortFill: true },
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
     cymbal, which is every slow blues turnaround ever played.
     Percussion: none — the triplets are the whole bar; anything over them is
     clutter. */
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
    { family: "blues", tags: ["triplets", "ghosts", "sparse"] },
  ),
  /* Jazz waltz. Three, swung: the ride plays one, two, the "let" of two,
     three, the "let" of three, and the foot closes the hat on two and three.

     Hats: the foot, on beats two and three, and nothing else.
     Ride: accent on the one, hits everywhere else — a jazz waltz leans on the
     downbeat because there is no backbeat to lean on instead.
     Ghosts: the kick, feathered, as in the swing ride. The snare is left empty
     for the same reason: comping is a conversation.
     Fill: beats two and three, into the toms.
     Percussion: none — a jazz waltz is three and a cymbal. */
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
    { family: "jazz", tags: ["three", "swing", "ride"] },
  ),
  /* Motown. The snare on all four beats — a hit on one and three, an accent on
     two and four — which is the thing that makes a Motown record feel like it
     is being pushed from behind.

     Hats: eighths, accent on the beat, hit off it; on the records this is a
     tambourine, and it is doubled by the hat.
     Ghosts: none. Every stroke in this groove is meant to be heard.
     Fill: two beats into the toms, over a kick that drops out.
     Percussion: the tambourine, on the eighths, doubling the hat — which is
     what the note above this one has been saying about these records since
     the third pass. Now it is a row instead of a remark. */
  groove(
    "motown",
    4,
    2,
    kit({
      length: 8,
      kick: "X. .. x. ..",
      snare: "x. X. x. X.",
      hat: "Xx Xx Xx Xx",
      tambourine: "Xx Xx Xx Xx",
    }),
    { family: "funk", tags: ["eighths", "backbeat", "driving"] },
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
     gets to a timbale abanico.
     Percussion: the bongosero puts the bongos down and picks up the campana
     for the mambo section — quarters, leaning on one and three. That is a
     SECOND bell, not the one on the ride: a mambo has the timbalero's bell
     and the bongosero's, and they are the two halves of the same wall. The
     congas play the tumbao under both. */
  groove(
    "mambo",
    4,
    4,
    kit({
      length: 16,
      kick: "X... ..x. .... x...",
      hat: "..X. ..x. ..X. ..x.",
      ride: "X... x.x. X... x.x.",
      cowbell: "X... x... X... x...",
      congaHi: "o.o. o.o. o.o. X.X.",
      congaLo: "x... ..X. .... ....",
    }),
    { family: "latin", tags: ["sixteenths", "bell", "clave"] },
  ),
  // =====================================================================
  // The fourth pass: twenty-five grooves to a hundred and fifteen
  // (plans/JAM_KILLER.md §2 A3).
  //
  // Twenty-five is a demo. A hundred and fifteen is the book a drummer
  // actually owns: per family, the variations a working player would name
  // out loud and reach for by name. Every one of them was written on paper
  // against a record — the reference is on the card in
  // plans/JAM_REFERENCES.md and in the two lines above each table — and not
  // one of them was produced by a loop stamping out variants, because a
  // variant nobody played is a row in a list, not a groove.
  //
  // They are APPENDED, family block after family block, for the reason the
  // first twenty were: the footswitch steps this list in order.
  // =====================================================================

  // --- Rock -----------------------------------------------------------

  /* Quarter hats. The hat on the beats only, so the guitar has the whole
     off-beat: the loudest rock beat there is, played with the fewest strokes.
     "Highway to Hell" — AC/DC, 1979.
     Percussion: none — the point of this bar is that there is nothing in it but
     the four. */
  groove(
    "rockQuarters",
    4,
    2,
    kit({
      length: 8,
      kick: "X. .. x. ..",
      snare: ".. X. .. X.",
      hat: "X. x. X. x.",
    }),
    { family: "rock", tags: ["quarters", "backbeat", "driving"] },
  ),
  /* Driving eighths. Rock eighths with the kick pushed into the back half of
     the bar — the "and" of three and the four, leaning the bar forward.
     "Learn to Fly" — Foo Fighters, 1999.
     Percussion: none — a driving eighths bar drives on its own. */
  groove(
    "rockDriving",
    4,
    2,
    kit({
      length: 8,
      kick: "X. .. .x x.",
      snare: ".. X. .. X.",
      hat: "Xx Xx Xx Xx",
    }),
    { family: "rock", tags: ["eighths", "driving", "backbeat"] },
  ),
  /* Rock ride. The same bar with the right hand moved to the cymbal, which is
     what a drummer does the moment the chorus arrives.
     "Won't Get Fooled Again" — The Who, 1971.
     Percussion: none — the ride is already the thing that never stops. */
  groove(
    "rockRide",
    4,
    2,
    kit({
      length: 8,
      kick: "X. .. x. .x",
      snare: ".. X. .. X.",
      ride: "Xx Xx Xx Xx",
    }),
    { family: "rock", tags: ["eighths", "ride", "driving"] },
  ),
  /* Anthem stomp. Two feet and a clap, and nothing on the cymbals at all —
     the one groove here whose power is entirely in what it leaves out.
     "We Will Rock You" — Queen, 1977.
     Percussion: none — the gaps are the anthem. */
  groove(
    "rockAnthem",
    4,
    2,
    kit({
      length: 8,
      kick: "X. x. .. ..",
      snare: ".. .. X. ..",
    }),
    { family: "rock", tags: ["halfTime", "sparse", "backbeat"], shortFill: true },
  ),
  /* Grunge. Eighths with the hat opening under the backbeat, so every two and
     four arrives with a cymbal already ringing.
     "Smells Like Teen Spirit" — Nirvana, 1991.
     Percussion: none — grunge got rid of the percussionist on purpose. */
  groove(
    "rockGrunge",
    4,
    2,
    kit({
      length: 8,
      kick: "X. .x .. x.",
      snare: ".. X. .. X.",
      hat: "Xx X. Xx X.",
      hatOpen: ".. .x .. .x",
    }),
    { family: "rock", tags: ["eighths", "openHats", "driving"] },
  ),
  /* Motorik. Sixteenths that never stop and a snare that lands on the "and" of
     three as well as the backbeat — the bar as a wheel rather than a phrase.
     "Hallogallo" — Neu!, 1972.
     Percussion: a tambourine on two and four with the shake before each —
     one of exactly two rock grooves that gets a percussionist. Motorik is
     repetition as a technique, and a second repeating layer is how the
     records made it hypnotic rather than merely long. */
  groove(
    "rockMotorik",
    4,
    4,
    kit({
      length: 16,
      kick: "X... ..x. x... ....",
      snare: ".... X... ..x. X...",
      hat: "Xoxo Xoxo Xoxo Xoxo",
      tambourine: "...o X... ...o X...",
    }),
    { family: "rock", tags: ["sixteenths", "driving", "backbeat"] },
  ),
  /* Funk rock. The funk bar played with a rock backbeat: the ghosts stay, the
     kick stays crooked, and the snare hits like a rock snare.
     "Can't Stop" — Red Hot Chili Peppers, 2002.
     Percussion: none — the funk here is in the kick and the ghosts, not in the
     room. */
  groove(
    "rockFunkRock",
    4,
    4,
    kit({
      length: 16,
      kick: "X... .x.. ..x. x..x",
      snare: "..o. X... .o.. X.o.",
      hat: "Xoxo Xoxo Xoxo Xoxo",
    }),
    { family: "rock", tags: ["sixteenths", "ghosts", "syncopated"] },
  ),
  /* Twelve-eight rock. Four beats of triplets under a plain backbeat, the ride
     carrying all three of them: the slow-dance bar of every early rock record.
     "Unchained Melody" — The Righteous Brothers, 1965.
     Percussion: none — twelve-eight rock is a ride and a backbeat and no more. */
  groove(
    "rockTwelveEight",
    4,
    3,
    kit({
      length: 12,
      kick: "X.. ... x.. .x.",
      snare: "... X.. ... X..",
      hat: "... x.. ... x..",
      ride: "Xxx Xxx Xxx Xxx",
    }),
    { family: "rock", tags: ["triplets", "ride", "backbeat"] },
  ),
  /* Half-time shuffle. Triplets ghosted all the way through with one backbeat,
     on three: the hardest bar in this file to play and the best to hear.
     "Rosanna" — Toto, 1982.
     Percussion: none — the ghosts already occupy every pulse a shaker would want. */
  groove(
    "rockHalfShuffle",
    4,
    3,
    kit({
      length: 12,
      kick: "X.. ... ..x ...",
      snare: ".oo .oo X.o .oo",
      hat: "X.x X.x X.x X.x",
    }),
    { family: "rock", tags: ["halfTime", "shuffle", "ghosts"], shortFill: true },
  ),
  /* Garage. Half-time, quarters on the hat, and a kick that answers itself on
     the "and" of four — two players' worth of noise from one riff.
     "Seven Nation Army" — The White Stripes, 2003.
     Percussion: none — a garage band is four people and this is the drummer. */
  groove(
    "rockGarage",
    4,
    2,
    kit({
      length: 8,
      kick: "X. .. x. .x",
      snare: ".. .. X. ..",
      hat: "X. x. X. x.",
    }),
    { family: "rock", tags: ["halfTime", "quarters", "sparse"], shortFill: true },
  ),
  /* Boogie rock. The shuffle at rock volume: the long-short on the hat, the
     kick catching the skip note at the end of every other beat.
     "Rockin' All Over the World" — Status Quo, 1977.
     Percussion: none — a boogie is a shuffle with nothing spare. */
  groove(
    "rockBoogie",
    4,
    3,
    kit({
      length: 12,
      kick: "X.. ..x x.. ..x",
      snare: "... X.. ... X..",
      hat: "X.x X.x X.x X.x",
    }),
    { family: "rock", tags: ["shuffle", "triplets", "driving"] },
  ),
  /* Surf. Both hands on the snare running sixteenths with the accent on the
     beat — where the train beat accents the "and", this one accents the count.
     "Wipe Out" — The Surfaris, 1963.
     Percussion: none — surf is a reverb tank, not a percussion section. */
  groove(
    "rockSurf",
    4,
    4,
    kit({
      length: 16,
      kick: "X... .... x... ....",
      snare: "Xxxx Xxxx Xxxx Xxxx",
    }),
    { family: "rock", tags: ["sixteenths", "doubleTime", "driving"] },
  ),
  /* Rock waltz. Three beats, swung, with the backbeat on two: a waltz played
     by a trio that has never been to a ballroom.
     "Manic Depression" — The Jimi Hendrix Experience, 1967.
     Percussion: none — a rock waltz is three beats and a crash. */
  groove(
    "rockWaltz",
    3,
    3,
    kit({
      length: 9,
      kick: "X.. ... ..x",
      snare: "... X.. ...",
      hat: "X.x X.x X.x",
    }),
    { family: "rock", tags: ["three", "shuffle", "driving"] },
  ),

  // --- Blues ----------------------------------------------------------

  /* Texas shuffle. The shuffle with a ghost on every skip note: the stutter
     under the backbeat that a straight shuffle does not have.
     "Pride and Joy" — Stevie Ray Vaughan and Double Trouble, 1983.
     Percussion: none — Texas shuffle is a trio, and a trio has no spare hands. */
  groove(
    "bluesTexas",
    4,
    3,
    kit({
      length: 12,
      kick: "X.. ..x x.. ..x",
      snare: "..o X.o ..o X.o",
      hat: "X.x X.x X.x X.x",
    }),
    { family: "blues", tags: ["shuffle", "triplets", "ghosts"] },
  ),
  /* Chicago shuffle. The shuffle moved to the ride with the hat closing on the
     backbeat under it — a big-band habit that came south with the players.
     "Every Day I Have the Blues" — B.B. King, 1955.
     Percussion: none — a Chicago band puts its second player on harmonica. */
  groove(
    "bluesChicago",
    4,
    3,
    kit({
      length: 12,
      kick: "X.. ... x.. ...",
      snare: "... X.. ... X..",
      hat: "... x.. ... x..",
      ride: "X.x X.x X.x X.x",
    }),
    { family: "blues", tags: ["shuffle", "ride", "twoFeel"] },
  ),
  /* Jump blues. The shuffle at a dance tempo, with the snare answering itself
     on the skip note after each backbeat — the chunk a big band swings on.
     "Caldonia" — Louis Jordan and His Tympany Five, 1945.
     Percussion: none — the jump band has horns where a percussion section would
     go. */
  groove(
    "bluesJump",
    4,
    3,
    kit({
      length: 12,
      kick: "X.. x.. x.. x..",
      snare: "... X.x ... X.x",
      ride: "X.x X.x X.x X.x",
    }),
    { family: "blues", tags: ["shuffle", "ride", "driving"] },
  ),
  /* Blues rhumba. A straight sixteenth bar with the kick on the clave, which
     is what a Chicago band heard on the radio and kept.
     "Hoochie Coochie Man" — Muddy Waters, 1954.
     Percussion: a tambourine on two and four. The only blues groove with a
     percussionist in it, and the reason is in the name: a rhumba is a Cuban
     bar being played by a blues band, and something has to sound Cuban. */
  groove(
    "bluesRhumba",
    4,
    4,
    kit({
      length: 16,
      kick: "X..x ..x. .... ..x.",
      snare: ".... X... .... X...",
      hat: "Xoxo Xoxo Xoxo Xoxo",
      tambourine: "...o X... ...o X...",
    }),
    { family: "blues", tags: ["sixteenths", "clave", "backbeat"] },
  ),
  /* Boogie. The shuffle with the kick riding the skip notes and a snare that
     spills over the bar line into the next one.
     "Boom Boom" — John Lee Hooker, 1962.
     Percussion: none — the boogie is the kick and the skip note and nothing else. */
  groove(
    "bluesBoogie",
    4,
    3,
    kit({
      length: 12,
      kick: "X.. ..x x.. ..x",
      snare: "... X.. ... X.x",
      hat: "X.x X.x X.x X.x",
    }),
    { family: "blues", tags: ["shuffle", "triplets", "driving"] },
  ),
  /* Straight blues. Sixteenths, no triplet anywhere: the bar that arrived when
     the blues met soul, and the one a shuffle player has to be told about.
     "Born Under a Bad Sign" — Albert King, 1967.
     Percussion: none — a straight blues is the backbeat, plainly. */
  groove(
    "bluesStraight",
    4,
    4,
    kit({
      length: 16,
      kick: "X... ..x. .x.. ..x.",
      snare: ".... X... .... X...",
      hat: "Xoxo Xoxo Xoxo Xoxo",
    }),
    { family: "blues", tags: ["sixteenths", "backbeat", "syncopated"] },
  ),
  /* Stop time. Everybody hits the one and then gets out of the way; the hat
     keeps the quarters so the band knows where the next one is.
     "Mannish Boy" — Muddy Waters, 1955.
     Percussion: none — the groove IS the silence between the hits. */
  groove(
    "bluesStopTime",
    4,
    2,
    kit({
      length: 8,
      kick: "X. .. .. ..",
      snare: "X. .. .. ..",
      hat: "X. x. X. x.",
    }),
    { family: "blues", tags: ["sparse", "quarters"] },
  ),
  /* Swamp blues. A half-time shuffle played behind the beat with almost no
     kick in it: the bar sounds like it is being remembered rather than played.
     "I'm a King Bee" — Slim Harpo, 1957.
     Percussion: none — swamp blues is one drummer playing quietly. */
  groove(
    "bluesSwamp",
    4,
    3,
    kit({
      length: 12,
      kick: "X.. ... ... ..x",
      snare: "... ..o X.. ..o",
      hat: "X.x X.x X.x X.x",
    }),
    { family: "blues", tags: ["halfTime", "shuffle", "ghosts"], shortFill: true },
  ),

  // --- Funk and soul --------------------------------------------------

  /* Funky drummer. The most sampled bar ever recorded: ghosts everywhere, the
     backbeats untouched, and one open hat on the "and" of three.
     "Funky Drummer" — James Brown, 1970.
     Percussion: the cabasa on the sixteenths. Not a shaker: the afuche was
     in that band on that day, and its beads against the cylinder are a drier
     sound than a shaker's — which matters when the bar is this crowded. */
  groove(
    "funkFunkyDrummer",
    4,
    4,
    kit({
      length: 16,
      kick: "X..x ...x ..x. ....",
      snare: "..o. X..o .o.o X.o.",
      hat: "Xoxo Xoxo Xo.o Xoxo",
      hatOpen: ".... .... ..x. ....",
      cabasa: "Xoxo Xoxo Xoxo Xoxo",
    }),
    { family: "funk", tags: ["sixteenths", "ghosts", "openHats"] },
  ),
  /* Purdie shuffle. Half-time, triplets, and a ghost on every one of them that
     is not the backbeat — the hardest quiet groove there is.
     "Home at Last" — Steely Dan, 1977.
     Percussion: a shaker on the beat and the skip note, with the middle
     triplet left where the shuffle leaves it. Anything on that middle pulse
     would straighten the bar, and a straightened Purdie shuffle is just a
     half-time groove with too many ghosts. */
  groove(
    "funkPurdie",
    4,
    3,
    kit({
      length: 12,
      kick: "X.. ... ..x ...",
      snare: ".oo .oo X.o .oo",
      hat: "Xxx Xxx Xxx Xxx",
      shaker: "X.x X.x X.x X.x",
    }),
    { family: "funk", tags: ["halfTime", "triplets", "ghosts"], shortFill: true },
  ),
  /* Meters funk. New Orleans sixteenths: the kick leaves the downbeat almost
     immediately and the snare answers it a sixteenth late, every time.
     "Cissy Strut" — The Meters, 1969.
     Percussion: congas, because this is New Orleans and that is the rule.
     Open tones on the "and" of one, on three and on the "and" of four,
     muted everywhere else — the drum answering the snare's late sixteenth
     rather than doubling it. */
  groove(
    "funkMeters",
    4,
    4,
    kit({
      length: 16,
      kick: "X... ...x ..x. x...",
      snare: "..o. X.o. ..o. X..o",
      hat: "Xoxo Xoxo Xoxo Xoxo",
      congaHi: "o.X. o.o. X.o. o.X.",
      congaLo: "X... .... ..x. ....",
    }),
    { family: "funk", tags: ["sixteenths", "ghosts", "syncopated"] },
  ),
  /* Soul backbeat. Eighths, a backbeat you could set a building on, and one
     extra snare on the last eighth pulling the bar over.
     "Respect" — Aretha Franklin, 1967.
     Percussion: a tambourine on two and four, with the shake on the "and"
     before each. On a Muscle Shoals record it is often louder than the
     snare, and this is one of the two grooves in the file where it is
     allowed to be. */
  groove(
    "funkSoul",
    4,
    2,
    kit({
      length: 8,
      kick: "X. .x x. ..",
      snare: ".. X. .. Xx",
      hat: "Xx Xx Xx Xx",
      tambourine: ".x X. .x X.",
    }),
    { family: "funk", tags: ["eighths", "backbeat", "driving"] },
  ),
  /* Stax. Quarters on the hat, the backbeat placed deliberately late, and one
     ghost before three — a whole studio's sound in four strokes.
     "Green Onions" — Booker T. & the M.G.'s, 1962.
     Percussion: a tambourine on the quarters with the hat, accented on one
     and three. Not the backbeat — the backbeat in this groove is placed
     deliberately late, and a tambourine landing with it would either drag
     too or give the trick away. */
  groove(
    "funkStax",
    4,
    2,
    kit({
      length: 8,
      kick: "X. .. x. .x",
      snare: ".. X. .o X.",
      hat: "X. x. X. x.",
      tambourine: "X. x. X. x.",
    }),
    { family: "funk", tags: ["quarters", "backbeat", "ghosts"] },
  ),
  /* Boogaloo. The bar between the shuffle and the funk: straight sixteenths
     with a kick that keeps arriving a sixteenth early.
     "Get Out of My Life, Woman" — Lee Dorsey, 1966.
     Percussion: the bell on the quarters and a full tumbao under it. A
     boogaloo is a mambo band playing a backbeat, and the congas never found
     out — the open tones are still on four and the "and" of four where a
     tumbao puts them. */
  groove(
    "funkBoogaloo",
    4,
    4,
    kit({
      length: 16,
      kick: "X... ..x. .x.. ..x.",
      snare: "..o. X..o ..o. X...",
      hat: "Xoxo Xoxo Xoxo Xoxo",
      cowbell: "X... x... X... x...",
      congaHi: "o.o. o.o. o.o. X.X.",
      congaLo: "x... ..X. .... ....",
    }),
    { family: "funk", tags: ["sixteenths", "ghosts", "syncopated"] },
  ),
  /* Go-go. The pocket beat: two snares side by side across the bar line of
     beat four, which is the swing that makes a go-go band a go-go band.
     "Bustin' Loose" — Chuck Brown & the Soul Searchers, 1978.
     Percussion: the bell and the congas, which in go-go are not a garnish —
     a go-go band is a percussion section with a rhythm section attached.
     The bell carries the pocket and the congas answer it off the beat. */
  groove(
    "funkGoGo",
    4,
    4,
    kit({
      length: 16,
      kick: "X..x ..x. .... .x..",
      snare: "..o. X..o .o.X X.o.",
      hat: "Xoxo Xoxo Xoxo Xoxo",
      cowbell: "X.x. ..X. x.x. ..X.",
      congaHi: "o.X. o.o. o.X. o.o.",
      congaLo: "X... .... x... ....",
    }),
    { family: "funk", tags: ["sixteenths", "ghosts", "syncopated"] },
  ),
  /* New jack swing. Sixteenths with the second of every pair pushed late — the
     swung machine groove, written on a sextuplet grid because that is where it
     actually lands. "My Prerogative" — Bobby Brown, 1988.
     Percussion: a tambourine on two and four with the swung shake in front
     of it. It is the one human thing in a bar that is otherwise a machine
     being asked to swing, which is exactly where these records put one. */
  groove(
    "funkNewJack",
    4,
    6,
    kit({
      length: 24,
      kick: "X..... ....x. ..x... ....x.",
      snare: "...... X....o ..o... X.....",
      hat: "X.ox.o X.ox.o X.ox.o X.ox.o",
      tambourine: ".....o X..... .....o X.....",
    }),
    { family: "funk", tags: ["sextuplets", "shuffle", "ghosts"] },
  ),
  /* Gospel shout. Twelve-eight with the backbeat hit like a tambourine and the
     kick catching the last triplet of three on its way to four.
     "Oh Happy Day" — The Edwin Hawkins Singers, 1969.
     Percussion: the tambourine, on two and four, with the last triplet
     before each as the shake. In a shout it is the congregation's
     instrument and it is never quiet — the accent here is the whole hand. */
  groove(
    "funkGospel",
    4,
    3,
    kit({
      length: 12,
      kick: "X.. ... x.x ...",
      snare: "... X.. ..o X..",
      hat: "Xxx Xxx Xxx Xxx",
      tambourine: "..o X.. ..o X..",
    }),
    { family: "funk", tags: ["triplets", "backbeat", "ghosts"] },
  ),
  /* Slow jam. Half-time soul: one backbeat, a sixteenth hat over it, and two
     ghosts marking where the other backbeat would have been.
     "Let's Get It On" — Marvin Gaye, 1973.
     Percussion: congas, open on the backbeat and muted around it, with the
     low drum on the one and on the "and" of three. A slow jam has time for
     the drum to ring, which is why this one is congas and not a shaker. */
  groove(
    "funkSlowJam",
    4,
    4,
    kit({
      length: 16,
      kick: "X... .... ..x. .x..",
      snare: ".... ..o. X... ..o.",
      hat: "Xoxo Xoxo Xoxo Xoxo",
      congaHi: "o... X.o. o... X.o.",
      congaLo: "X... .... ..x. ....",
    }),
    { family: "funk", tags: ["halfTime", "sixteenths", "ghosts"], shortFill: true },
  ),

  // --- Jazz -----------------------------------------------------------

  /* Brushes. The left hand sweeps the head while the right taps the quarters
     on it, and the ride still swings above both.
     "My Funny Valentine" — Chet Baker, 1954.
     Percussion: none — brushes are already the quietest thing in the room. */
  groove(
    "jazzBrushes",
    4,
    3,
    kit({
      length: 12,
      kick: "o.. o.. o.. o..",
      snare: "X.. x.. X.. x..",
      hat: "... x.. ... x..",
      ride: "x.x X.x x.x X.x",
    }),
    { family: "jazz", tags: ["swing", "brushes", "triplets"] },
  ),
  /* Up-tempo swing. Past about two hundred and forty the ride stops playing
     every skip note and keeps the ones after two and four.
     "Cherokee" — Clifford Brown and Max Roach, 1955.
     Percussion: none — at this tempo one more layer is one too many to hear. */
  groove(
    "jazzUpTempo",
    4,
    3,
    kit({
      length: 12,
      kick: "o.. ... ... ...",
      hat: "... x.. ... x..",
      ride: "X.. x.x X.. x.x",
    }),
    { family: "jazz", tags: ["swing", "ride", "driving"] },
  ),
  /* Two feel. The ride in halves and a bass drum on one and three: what the
     first chorus of a standard is played in before the band goes to four.
     "Take the 'A' Train" — Duke Ellington and His Orchestra, 1941.
     Percussion: none — two feel is about how much is NOT being played. */
  groove(
    "jazzTwoFeel",
    4,
    3,
    kit({
      length: 12,
      kick: "o.. ... o.. ...",
      hat: "... x.. ... x..",
      ride: "X.x ... X.x ...",
    }),
    { family: "jazz", tags: ["swing", "twoFeel", "ride"] },
  ),
  /* Jazz ballad. Brushes on one and three, the ride marking the beats, and
     nothing else at all — a bar mostly made of the room.
     "Blue in Green" — Miles Davis, 1959.
     Percussion: none — a ballad is brushes and the bass. */
  groove(
    "jazzBallad",
    4,
    3,
    kit({
      length: 12,
      kick: "o.. ... ... ...",
      snare: "x.. ... x.. ...",
      hat: "... x.. ... x..",
      ride: "X.. x.. X.. x..",
    }),
    { family: "jazz", tags: ["swing", "brushes", "sparse"], shortFill: true },
  ),
  /* Five. Five beats grouped three and two, swung, with the snare figure
     landing on three and on the last triplet of four.
     "Take Five" — The Dave Brubeck Quartet, 1959.
     Percussion: none — five is hard enough to hold without a second opinion. */
  groove(
    "jazzFive",
    5,
    3,
    kit({
      length: 15,
      kick: "o.. ... ... o.. ...",
      snare: "... ... X.. ..X ...",
      hat: "... x.. ... ... x..",
      ride: "X.x x.x x.x X.x x.x",
    }),
    { family: "jazz", tags: ["odd", "swing", "ride"] },
  ),
  /* Bebop. The ride, the foot on two and four, and the snare dropping comping
     accents where the horn line leaves a hole.
     "Now's the Time" — Charlie Parker, 1945.
     Percussion: none — bebop is four people and no passengers. */
  groove(
    "jazzBebop",
    4,
    3,
    kit({
      length: 12,
      kick: "o.. ..x ... ...",
      snare: "... ..o ... X..",
      hat: "... x.. ... x..",
      ride: "x.x X.x x.x X.x",
    }),
    { family: "jazz", tags: ["swing", "ride", "ghosts"] },
  ),
  /* Big band. The hat chick on two and four played hard enough to lead
     seventeen people, a real bass drum, and a set-up on the last triplet.
     "Corner Pocket" — Count Basie and His Orchestra, 1955.
     Percussion: none — the big band has seventeen people and still no
     percussionist. */
  groove(
    "jazzBigBand",
    4,
    3,
    kit({
      length: 12,
      kick: "X.. ... x.. ...",
      snare: "... ... ... ..X",
      hat: "... X.. ... X..",
      ride: "X.x x.x X.x x.x",
    }),
    { family: "jazz", tags: ["swing", "ride", "twoFeel"] },
  ),
  /* Hard bop. Swing with the backbeat put back in on purpose, and a kick that
     answers the ride instead of hiding under it.
     "Moanin'" — Art Blakey and the Jazz Messengers, 1958.
     Percussion: none — hard bop is the ride and the comping, and that is the
     argument. */
  groove(
    "jazzHardBop",
    4,
    3,
    kit({
      length: 12,
      kick: "X.. ..x ... ..x",
      snare: "... X.. ... X..",
      hat: "... x.. ... x..",
      ride: "x.x X.x x.x X.x",
    }),
    { family: "jazz", tags: ["swing", "ride", "backbeat"] },
  ),
  /* Soul jazz. A shuffled ride over an organ trio's backbeat, with a ghost
     tucked in behind each snare.
     "Back at the Chicken Shack" — Jimmy Smith, 1960.
     Percussion: a shaker on the beat and the skip note. Organ trios played
     to dancers and often had somebody on percussion doing precisely this;
     it is the one jazz groove in the file where a shaker is not an
     intrusion. */
  groove(
    "jazzSoulJazz",
    4,
    3,
    kit({
      length: 12,
      kick: "X.. ... x.. ..x",
      snare: "... X.o ... X.o",
      hat: "... x.. ... x..",
      ride: "X.x X.x X.x X.x",
      shaker: "X.x X.x X.x X.x",
    }),
    { family: "jazz", tags: ["shuffle", "ride", "ghosts"] },
  ),
  /* Trad jazz. A two-beat bar with a press roll running into every backbeat,
     which is what a drummer played before the ride cymbal existed.
     "West End Blues" — Louis Armstrong and His Hot Five, 1928.
     Percussion: none — a trad band is the banjo doing what a shaker would do. */
  groove(
    "jazzTrad",
    4,
    3,
    kit({
      length: 12,
      kick: "X.. ... x.. ...",
      snare: "..x X.. ..x X..",
      hat: "X.. x.. X.. x..",
    }),
    { family: "jazz", tags: ["swing", "twoFeel", "triplets"] },
  ),

  // --- Latin ----------------------------------------------------------

  /* Son. The cross-stick on the son clave with the bass drum playing the
     tumbao underneath — the bar every other Cuban groove is measured against.
     "Chan Chan" — Buena Vista Social Club, 1997.
     Percussion: the whole conjunto. The claves say the son 3-2 out loud —
     the same five strokes the cross-stick is playing, because in a son they
     ARE both playing it. The guiro scrapes down on the beat and up off it.
     And the bongos play the martillo: eight strokes on the macho, hit on the
     beat and muffled off it, with the accent where a martillo's accent
     belongs, on the open low drum on the one. */
  groove(
    "latinSon",
    4,
    4,
    kit({
      length: 16,
      kick: "X... ..x. .... x...",
      snare: "o..o ..o. ..o. o...",
      hat: "X.x. X.x. X.x. X.x.",
      claves: "X..x ..X. ..x. X...",
      guiro: "X.x. X.x. X.x. X.x.",
      bongoHi: "x.o. x.o. x.o. x.o.",
      bongoLo: "X... .... x... ....",
    }),
    { family: "latin", tags: ["crossStick", "clave", "eighths"], rim: true },
  ),
  /* Guaguancó. The rumba clave — the third stroke a sixteenth later than the
     son's — over the same tumbao. One note apart, and a different dance.
     "Ran Kan Kan" — Tito Puente, 1949.
     Percussion: the congas, which in a guaguanco is the band. Muted strokes
     through the bar with the slap landing on the "and" of two and of four,
     and the tumbadora underneath on the one and again on the "and" of four,
     leaning into the bar line. No claves row: the rumba clave is what the
     cross-stick is playing, and the set has no rumba clave to give it — the
     one stroke that separates it from the son's is already there. */
  groove(
    "latinGuaguanco",
    4,
    4,
    kit({
      length: 16,
      kick: "X... .... ..x. x...",
      snare: "o..o ...o ..o. o...",
      hat: "X.x. X.x. X.x. X.x.",
      congaHi: "o.o. o.X. o.o. o.X.",
      congaLo: "X... .... .... ..x.",
    }),
    { family: "latin", tags: ["crossStick", "clave", "sixteenths"], rim: true },
  ),
  /* Cascara. The shell pattern, played on the side of the timbale and written
     here on the ride, with the maracas answering on the off-beats.
     "Manteca" — Dizzy Gillespie, 1947.
     Percussion: the congas' tumbao, in eighths, under the shell pattern. No
     clave row here and it is the meter's fault rather than the music's: a
     son clave needs the sixteenth between the eighths to land its second
     stroke, and this bar does not have one. The cascara on the ride is the
     clave's outline anyway. */
  groove(
    "latinCascara",
    4,
    2,
    kit({
      length: 8,
      kick: "X. .x .. x.",
      hat: ".X .x .X .x",
      ride: "X. xx .x .x",
      congaHi: "o. o. o. XX",
      congaLo: "x. .X .. ..",
    }),
    { family: "latin", tags: ["clave", "eighths", "bell"] },
  ),
  /* Songo. The bar that put a kit drummer inside a Cuban band: the tumbao on
     the kick, the timbale accent on the last sixteenth of two and of four.
     "Sandunguera" — Los Van Van, 1985.
     Percussion: the campana on the eighths, leaning on one and three, and
     the tumbao under it. A songo is the bar where the kit drummer and the
     percussionist finally play the same groove, so the two rows have to
     agree with the timbale accent on the snare rather than argue with it. */
  groove(
    "latinSongo",
    4,
    4,
    kit({
      length: 16,
      kick: "X... ..x. .... ..x.",
      snare: "..o. ...X ..o. ...X",
      hat: "Xoxo Xoxo Xoxo Xoxo",
      cowbell: "X.x. x.x. X.x. x.x.",
      congaHi: "o.o. o.o. o.o. X.X.",
      congaLo: "x... ..X. .... ....",
    }),
    { family: "latin", tags: ["sixteenths", "ghosts", "syncopated"] },
  ),
  /* Merengue. A tambora gallop over a kick on every beat, fast enough that the
     bar is counted in two and danced in one.
     "Ojalá Que Llueva Café" — Juan Luis Guerra, 1989.
     Percussion: the guira — the metal scraper, not the gourd — running
     sixteenths, down hard, up light, down, up. It is the whole percussion
     section of a merengue beside the tambora, and the tambora is the snare. */
  groove(
    "latinMerengue",
    4,
    4,
    kit({
      length: 16,
      kick: "X... x... x... x...",
      snare: "X.xx ..x. X.xx ..x.",
      hat: "X.x. X.x. X.x. X.x.",
      guiro: "Xoxo Xoxo Xoxo Xoxo",
    }),
    { family: "latin", tags: ["sixteenths", "driving", "twoFeel"] },
  ),
  /* Bolero. The cinquillo on the rim — long, short-short, long, short — slow
     enough that every one of the five strokes is a decision.
     "Bésame Mucho" — Trío Los Panchos, 1944.
     Percussion: maracas on the eighths and the martillo on the bongos —
     eight strokes on the macho, hit and muffle alternating, with the open
     low drum on one and three. At this tempo the martillo is the only thing
     moving between the cinquillo's strokes, which is what stops a bolero
     from stopping. */
  groove(
    "latinBolero",
    4,
    2,
    kit({
      length: 8,
      kick: "X. .. x. ..",
      snare: "o. oo .o o.",
      hat: "X. x. X. x.",
      shaker: "Xx Xx Xx Xx",
      bongoHi: "xo xo xo xo",
      bongoLo: "X. .. x. ..",
    }),
    { family: "latin", tags: ["crossStick", "sparse", "eighths"], rim: true, shortFill: true },
  ),
  /* Baião. The zabumba: a deep stroke on one and another on the "and" of two,
     with the triangle keeping the eighths and the rim on the off-beats.
     "Asa Branca" — Luiz Gonzaga, 1947.
     Percussion: the ganza on the sixteenths. The triangle is on the hat and
     the zabumba is the kick, so the shaker is the one layer of a forro trio
     the kit cannot cover. */
  groove(
    "latinBaiao",
    4,
    4,
    kit({
      length: 16,
      kick: "X... ..x. x... ..x.",
      snare: ".... ..o. .... ..o.",
      hat: "X.x. X.x. X.x. X.x.",
      shaker: "Xoxo Xoxo Xoxo Xoxo",
    }),
    { family: "latin", tags: ["crossStick", "syncopated", "sixteenths"], rim: true },
  ),
  /* Partido alto. The surdo leans on two and four like a samba's, and the
     snare plays the pandeiro's answer around it.
     "Taj Mahal" — Jorge Ben, 1972.
     Percussion: the pandeiro, which in a partido alto is not an accessory
     but the lead — sixteenths all the way, with the open tones on the one
     and on the "and" of two, and the muffled strokes between them. The
     tambourine voice is the nearest thing this set has to a jingled head. */
  groove(
    "latinPartidoAlto",
    4,
    4,
    kit({
      length: 16,
      kick: "x... X... x... X...",
      snare: "..o. .o.X ..o. .o.X",
      hat: "Xoxo Xoxo Xoxo Xoxo",
      tambourine: "Xoxo oxXo Xoxo oxXo",
    }),
    { family: "latin", tags: ["sixteenths", "ghosts", "syncopated"] },
  ),
  /* Bossa two-three. The same clave turned round, so the bar opens on the two
     side. A guitarist counting in the wrong half hears it immediately.
     "The Girl from Ipanema" — Stan Getz and João Gilberto, 1964.
     Percussion: the ganza, and this time the claves DO say it — the son 2-3,
     the two side first. A bossa in the wrong half is the mistake this groove
     exists to make audible, and two sticks are louder about it than a rim
     click is. */
  groove(
    "latinBossa23",
    4,
    4,
    kit({
      length: 16,
      kick: "X... ..x. x... ..x.",
      snare: "..o. o... o..o ..o.",
      hat: "Xoxo Xoxo Xoxo Xoxo",
      shaker: "Xoxo Xoxo Xoxo Xoxo",
      claves: "..x. X... X..x ..X.",
    }),
    { family: "latin", tags: ["crossStick", "clave", "sixteenths"], rim: true },
  ),
  /* Afro-Cuban six-eight. The seven-stroke bell across twelve pulses, with the
     conga answering on the second triplet of two and of four.
     "Afro Blue" — Mongo Santamaría, 1959.
     Percussion: the shekere on the beat and the third triplet, and the
     congas' bembe marcha — muted, open, muted, slap across each pair of
     pulses. No claves row: the 6/8 bell is the clave in this music and it is
     already on the ride, and the son clave written on twelve pulses would be
     a different pattern wearing the same name. */
  groove(
    "latinAfro68",
    4,
    3,
    kit({
      length: 12,
      kick: "X.. ... x.. ...",
      snare: "... o.. ... o..",
      hat: "... x.. ... x..",
      ride: "X.x x.x X.x .x.",
      shaker: "X.x X.x X.x X.x",
      congaHi: "o.x o.X o.x o.X",
      congaLo: "X.. ... x.. ...",
    }),
    { family: "latin", tags: ["triplets", "bell", "clave", "ghosts"] },
  ),

  // --- Pop and dance --------------------------------------------------

  /* Disco. Four on the floor, a sixteenth hat, and the hat opening on every
     off-beat — the lift that makes the kick feel like it is rising.
     "Le Freak" — Chic, 1978.
     Percussion: both. Sixteenths on the shaker and the tambourine on two and
     four with the shake in front of it — a disco record is layered until the
     off-beat disappears, and these are the two layers under the open hat
     that do it. */
  groove(
    "popDisco",
    4,
    4,
    kit({
      length: 16,
      kick: "X... x... x... x...",
      snare: ".... X... .... X...",
      hat: "Xo.o Xo.o Xo.o Xo.o",
      hatOpen: "..x. ..x. ..x. ..x.",
      shaker: "Xoxo Xoxo Xoxo Xoxo",
      tambourine: "...o X... ...o X...",
    }),
    { family: "pop", tags: ["fourOnFloor", "openHats", "sixteenths"] },
  ),
  /* House. Disco with the hands taken away: the kick on every beat, a clap on
     two and four, and one hat on each off-beat and nowhere else.
     "Your Love" — Frankie Knuckles, 1987.
     Percussion: the shaker's sixteenths, filling what disco's hat used to.
     House took the hands away and left one hat on each off-beat, so the
     shaker is what the bar is actually counted by. */
  groove(
    "popHouse",
    4,
    4,
    kit({
      length: 16,
      kick: "X... x... x... x...",
      snare: ".... X... .... X...",
      hat: "..X. ..o. ..X. ..o.",
      shaker: "Xoxo Xoxo Xoxo Xoxo",
    }),
    { family: "pop", tags: ["fourOnFloor", "offbeat", "sparse"] },
  ),
  /* Electro. The first drum machine bar that swung: the kick abandons the beat
     entirely after one and the backbeat holds the whole thing together.
     "Planet Rock" — Afrika Bambaataa and the Soulsonic Force, 1982.
     Percussion: the cowbell, which on these records is the 808's and is
     unmistakable — the one and the "and" of two, twice a bar — with a shaker
     under it. Planet Rock is a machine playing a cowbell part; the part is
     still a part. */
  groove(
    "popElectro",
    4,
    4,
    kit({
      length: 16,
      kick: "X... ...x ..x. .x..",
      snare: ".... X... .... X...",
      hat: "Xoxo Xoxo Xoxo Xoxo",
      cowbell: "X... ..x. X... ..x.",
      shaker: "Xoxo Xoxo Xoxo Xoxo",
    }),
    { family: "pop", tags: ["sixteenths", "syncopated", "driving"] },
  ),
  /* Drum and bass. A breakbeat at double the tempo the music is felt at: two
     backbeats, ghosts between them, and almost no kick.
     "Inner City Life" — Goldie, 1995.
     Percussion: a shaker on the sixteenths. At this tempo it reads as one
     continuous sound rather than sixteen strokes, which is exactly what it
     does on the records — the hiss the breakbeat sits inside. */
  groove(
    "popDnb",
    4,
    4,
    kit({
      length: 16,
      kick: "X... .... ..x. ....",
      snare: ".... X..o ..o. X...",
      hat: "Xoxo Xoxo Xoxo Xoxo",
      shaker: "Xoxo Xoxo Xoxo Xoxo",
    }),
    { family: "pop", tags: ["sixteenths", "ghosts", "doubleTime"] },
  ),
  /* Breakbeat. A sampled funk bar played back harder than anyone played it:
     the kick doubled at the top and the snare ghosting into four.
     "Firestarter" — The Prodigy, 1996.
     Percussion: a tambourine on two and four with the shake before each.
     Sampled funk played back harder is still sampled funk, and the
     tambourine is what was in the bar it came out of. */
  groove(
    "popBreakbeat",
    4,
    4,
    kit({
      length: 16,
      kick: "X..x ..x. .... x...",
      snare: "..o. X... ..o. X.o.",
      hat: "X.x. X.x. X.x. X.x.",
      tambourine: "...o X... ...o X...",
    }),
    { family: "pop", tags: ["sixteenths", "ghosts", "driving"] },
  ),
  /* Trap. Half-time, almost no kick, and the hat breaking into a triplet roll
     on four — written on a sextuplet grid because that is what a roll is.
     "Turn Down for What" — DJ Snake and Lil Jon, 2013.
     Percussion: one tambourine, on the half-time backbeat, with the shake
     on the sextuplet before it. Trap is a bar made of space and a hat roll;
     a second running layer would fill in the space that is the music. */
  groove(
    "popTrap",
    4,
    6,
    kit({
      length: 24,
      kick: "X..... ....x. ...... ..x...",
      snare: "...... ...... X..... ......",
      hat: "X..x.. X..x.. X..x.. XxxXxx",
      tambourine: "...... .....o X..... ......",
    }),
    { family: "pop", tags: ["halfTime", "sextuplets", "sparse"], shortFill: true },
  ),
  /* Reggaetón. Dembow: a ghost a sixteenth before each backbeat, so the snare
     arrives as a pair every time. "Gasolina" — Daddy Yankee, 2004.
     Percussion: a cabasa on the sixteenths and a conga answering on the
     "and" of one and of three. Dembow is a Caribbean bar wearing a drum
     machine, and the conga is where that shows. */
  groove(
    "popReggaeton",
    4,
    4,
    kit({
      length: 16,
      kick: "X... .... x... ....",
      snare: "...o X... ...o X...",
      hat: "X.x. X.x. X.x. X.x.",
      cabasa: "Xoxo Xoxo Xoxo Xoxo",
      congaHi: "..X. o... ..X. o...",
    }),
    { family: "pop", tags: ["sixteenths", "syncopated", "ghosts"] },
  ),
  /* Synth-pop. A machine bar: one kick, one backbeat, a sixteenth hat and a
     single open stroke at the end to prove a person chose it.
     "Just Can't Get Enough" — Depeche Mode, 1981.
     Percussion: a shaker on the sixteenths — the one warm thing in a bar
     that is otherwise a machine, which is the same job the single open hat
     at the end of it is doing. */
  groove(
    "popSynthPop",
    4,
    4,
    kit({
      length: 16,
      kick: "X... .... x... ..x.",
      snare: ".... X... .... X...",
      hat: "X.x. X.x. X.x. X...",
      hatOpen: ".... .... .... ..x.",
      shaker: "Xoxo Xoxo Xoxo Xoxo",
    }),
    { family: "pop", tags: ["sixteenths", "openHats", "sparse"] },
  ),
  /* Stadium. Half-time at a walking tempo with a sixteenth hat over it: one
     backbeat, and the rest of the bar left for forty thousand people.
     "Viva la Vida" — Coldplay, 2008.
     Percussion: a tambourine on the half-time backbeat, shake into it. One
     stroke a bar, because the rest of this groove is forty thousand people
     and you do not play over that. */
  groove(
    "popStadium",
    4,
    4,
    kit({
      length: 16,
      kick: "X... ..x. .... .x..",
      snare: ".... .... X... ....",
      hat: "X.x. X.x. X.x. X.x.",
      tambourine: ".... ...o X... ....",
    }),
    { family: "pop", tags: ["halfTime", "sixteenths", "sparse"], shortFill: true },
  ),
  /* UK garage. Two-step: the backbeats kept and everything between them
     swung, on the sextuplet grid where the skip actually lands.
     "Re-Rewind" — Artful Dodger featuring Craig David, 1999.
     Percussion: a tambourine on two and four, swung with everything else —
     the shake lands on the sextuplet before the beat, which is where the
     skip in this bar lives. */
  groove(
    "popUkGarage",
    4,
    6,
    kit({
      length: 24,
      kick: "X..... ...... ....x. ......",
      snare: "...... X..... ...... X.....",
      hat: "X.ox.o X.ox.o X.ox.o X.ox.o",
      tambourine: ".....o X..... .....o X.....",
    }),
    { family: "pop", tags: ["sextuplets", "shuffle", "offbeat"] },
  ),
  /* Pop ballad. A sixteenth hat under a backbeat played with the whole arm,
     and a kick that arrives twice a bar and means it.
     "I Will Always Love You" — Whitney Houston, 1992.
     Percussion: a tambourine on two and four with the shake in front. The
     backbeat in this groove is played with the whole arm, and the tambourine
     is what makes it sound like a room rather than a click. */
  groove(
    "popBallad",
    4,
    4,
    kit({
      length: 16,
      kick: "X... .... x..x ....",
      snare: ".... X... .... X...",
      hat: "Xoxo Xoxo Xoxo Xoxo",
      tambourine: "...o X... ...o X...",
    }),
    { family: "pop", tags: ["sixteenths", "backbeat", "sparse"], shortFill: true },
  ),
  /* Indie disco. Four on the floor under an eighth-note hat, with an extra
     snare on the "and" of three that makes the chorus break into a run.
     "Take Me Out" — Franz Ferdinand, 2004.
     Percussion: a tambourine on two and four. It is the one percussion row
     in the rock end of the library, and it is here because an indie disco
     record without one does not exist. */
  groove(
    "popIndie",
    4,
    2,
    kit({
      length: 8,
      kick: "X. x. x. x.",
      snare: ".. X. .x X.",
      hat: "Xx Xx Xx Xx",
      tambourine: ".x X. .x X.",
    }),
    { family: "pop", tags: ["fourOnFloor", "eighths", "driving"] },
  ),

  // --- Metal and punk -------------------------------------------------

  /* Gallop. Three kicks to a beat — long, short, short — under a plain
     backbeat: the bar a downpicked riff is written on top of.
     "The Trooper" — Iron Maiden, 1983.
     Percussion: none — the gallop is the percussion. */
  groove(
    "metalGallop",
    4,
    4,
    kit({
      length: 16,
      kick: "X.xx x.xx x.xx x.xx",
      snare: ".... X... .... X...",
      hat: "X.x. X.x. X.x. X.x.",
    }),
    { family: "metal", tags: ["sixteenths", "driving", "doubleTime"] },
  ),
  /* Blast beat. Kick and snare alternating sixteenths with the ride on the
     kick's half, and the backbeat still audible inside it.
     "You Suffer" — Napalm Death, 1987.
     Percussion: none — a blast beat is already every subdivision at once. */
  groove(
    "metalBlast",
    4,
    4,
    kit({
      length: 16,
      kick: "X.x. x.x. x.x. x.x.",
      snare: ".x.x Xx.x .x.x Xx.x",
      ride: "X.x. x.x. X.x. x.x.",
    }),
    { family: "metal", tags: ["sixteenths", "driving", "doubleTime"] },
  ),
  /* Thrash. The skank beat: a kick on every count and a snare on every
     off-beat, which at two hundred is felt as one long snare roll.
     "Master of Puppets" — Metallica, 1986.
     Percussion: none. A thrash bar at two hundred is one long snare
     roll; there is nothing for a second pair of hands to be heard over. */
  groove(
    "metalThrash",
    4,
    2,
    kit({
      length: 8,
      kick: "X. x. x. x.",
      snare: ".X .x .X .x",
      hat: "X. x. X. x.",
    }),
    { family: "metal", tags: ["eighths", "driving", "doubleTime"] },
  ),
  /* D-beat. The kick lands a hair after the off-beat and again before four:
     one riff, one bar, forty years of hardcore records.
     "Realities of War" — Discharge, 1980.
     Percussion: none — a d-beat is three chords and a drummer, and that is the
     politics. */
  groove(
    "metalDbeat",
    4,
    2,
    kit({
      length: 8,
      kick: "X. .x x. .x",
      snare: ".. X. .. X.",
      hat: "X. x. X. x.",
    }),
    { family: "metal", tags: ["eighths", "driving", "backbeat"] },
  ),
  /* Breakdown. Half-time groove metal: the snare waits for three while the
     kick works sixteenths around the riff's accents.
     "Walk" — Pantera, 1990.
     Percussion: none — a breakdown is weight, and a shaker weighs nothing. */
  groove(
    "metalBreakdown",
    4,
    4,
    kit({
      length: 16,
      kick: "X..x ..x. .... x..x",
      snare: ".... .... X... ....",
      hat: "X.x. X.x. X.x. X.x.",
    }),
    { family: "metal", tags: ["halfTime", "sixteenths", "driving"], shortFill: true },
  ),
  /* Doom. Twelve-eight taken as slowly as a band can hold it: the ride rolls,
     the snare arrives once, and the bar lasts as long as it likes.
     "Black Sabbath" — Black Sabbath, 1970.
     Percussion: none — doom is slow and empty on purpose. */
  groove(
    "metalDoom",
    4,
    3,
    kit({
      length: 12,
      kick: "X.. ... ... ..x",
      snare: "... ... X.. ...",
      ride: "Xxx Xxx Xxx Xxx",
    }),
    { family: "metal", tags: ["halfTime", "triplets", "sparse"], shortFill: true },
  ),
  /* Djent. Kicks in pairs at the top of every beat against a ride on the
     quarters, so the riff's displacement is audible against something square.
     "Bleed" — Meshuggah, 2008.
     Percussion: none — the grid is the point and a human layer would blur it. */
  groove(
    "metalDjent",
    4,
    4,
    kit({
      length: 16,
      kick: "Xx.. xx.. xx.. xx..",
      snare: ".... X... .... X...",
      ride: "X... x... X... x...",
    }),
    { family: "metal", tags: ["sixteenths", "driving", "syncopated"] },
  ),
  /* Punk eighths. Four on the floor with the hat on the beats, which is the
     whole trick: the kick and the hand land together, every time.
     "Blitzkrieg Bop" — Ramones, 1976.
     Percussion: none — punk removed things. */
  groove(
    "punkEighths",
    4,
    2,
    kit({
      length: 8,
      kick: "X. x. x. x.",
      snare: ".. X. .. X.",
      hat: "X. x. X. x.",
    }),
    { family: "metal", tags: ["eighths", "fourOnFloor", "driving"] },
  ),
  /* Skank. The snare on all four and the hat on all four off-beats: a bar with
     no backbeat because every beat is one.
     "American Jesus" — Bad Religion, 1993.
     Percussion: none — the skank is one stroke repeated as fast as possible. */
  groove(
    "punkSkank",
    4,
    2,
    kit({
      length: 8,
      kick: "X. .. x. ..",
      snare: "X. X. X. X.",
      hat: ".X .x .X .x",
    }),
    { family: "metal", tags: ["eighths", "offbeat", "driving"] },
  ),

  // --- Country and folk -----------------------------------------------

  /* Country shuffle. The blues shuffle with the ghosts taken out and the
     backbeat placed dead centre — a dance floor, not a juke joint.
     "Swinging Doors" — Merle Haggard, 1966.
     Percussion: none — the shuffle carries itself. */
  groove(
    "countryShuffle",
    4,
    3,
    kit({
      length: 12,
      kick: "X.. ... x.. ...",
      snare: "... X.. ... X..",
      hat: "X.x X.x X.x X.x",
    }),
    { family: "country", tags: ["shuffle", "triplets", "backbeat"] },
  ),
  /* Boom-chick. Bass drum, backbeat, and nothing above them: the two-feel a
     bass and a rhythm guitar already play, with a drummer agreeing.
     "Hey Good Lookin'" — Hank Williams, 1951.
     Percussion: none — boom-chick is two sounds by definition, and a third one
     breaks it. */
  groove(
    "countryBoomChick",
    4,
    2,
    kit({
      length: 8,
      kick: "X. .. x. ..",
      snare: ".. X. .. X.",
    }),
    { family: "country", tags: ["twoFeel", "brushes", "sparse"] },
  ),
  /* Bluegrass. Brushes running sixteenths with the accent on the count rather
     than the "and" — a mandolin chop with a drummer's hands.
     "Blue Moon of Kentucky" — Bill Monroe, 1947.
     Percussion: none — a bluegrass band has no drummer at all, let alone two — the
     brushes here are already a compromise. */
  groove(
    "countryBluegrass",
    4,
    4,
    kit({
      length: 16,
      kick: "X... .... x... ....",
      snare: "xxxx Xxxx xxxx Xxxx",
    }),
    { family: "country", tags: ["sixteenths", "brushes", "twoFeel"] },
  ),
  /* Rockabilly. A shuffle with a press stroke leading into every backbeat and
     the kick catching the skip note, under a slapped upright.
     "Blue Suede Shoes" — Carl Perkins, 1956.
     Percussion: none — rockabilly is a slap bass and a snare, and the slap bass is
     the percussion. */
  groove(
    "countryRockabilly",
    4,
    3,
    kit({
      length: 12,
      kick: "X.. ..x x.. ..x",
      snare: "..x X.. ..x X..",
      hat: "X.x X.x X.x X.x",
    }),
    { family: "country", tags: ["shuffle", "twoFeel", "driving"] },
  ),
  /* Country ballad. Twelve-eight with brushes: a sweep on one and three, the
     backbeat swept rather than struck, the ride rolling under both.
     "Crazy" — Patsy Cline, 1961.
     Percussion: none — a country ballad is brushes and space. */
  groove(
    "countryBallad",
    4,
    3,
    kit({
      length: 12,
      kick: "X.. ... x.. ...",
      snare: "x.. X.. x.. X..",
      ride: "Xxx Xxx Xxx Xxx",
    }),
    { family: "country", tags: ["triplets", "brushes", "sparse"], shortFill: true },
  ),
  /* Outlaw. Sixteenths on the hat with the kick doubling on the last sixteenth
     of one and of three — the push that made Nashville sound like Texas.
     "Are You Sure Hank Done It This Way" — Waylon Jennings, 1975.
     Percussion: none — outlaw country took things out of the arrangement rather
     than adding them. */
  groove(
    "countryOutlaw",
    4,
    4,
    kit({
      length: 16,
      kick: "X..x .... x..x ....",
      snare: ".... X... .... X...",
      hat: "Xoxo Xoxo Xoxo Xoxo",
    }),
    { family: "country", tags: ["sixteenths", "driving", "backbeat"] },
  ),

  // --- World ----------------------------------------------------------

  /* Afrobeat. Ghosts and backbeats over a kick that plays only one and the
     "and" of three, with the hat opening on every off-beat.
     "Water No Get Enemy" — Fela Kuti, 1975.
     Percussion: the shekere on the sixteenths and two congas under it —
     muted, hit, open on the backbeat — with the low drum on the one and
     again on the "and" of three, answering the kick. Fela's band had four
     percussionists; these are the two parts you would miss first. */
  groove(
    "worldAfrobeat",
    4,
    4,
    kit({
      length: 16,
      kick: "X... ..x. .... ..x.",
      snare: "..o. X..o ..o. X...",
      hat: "Xo.o Xo.o Xo.o Xo.o",
      hatOpen: "..x. ..x. ..x. ..x.",
      shaker: "Xoxo Xoxo Xoxo Xoxo",
      congaHi: "o.x. X.o. o.x. X.o.",
      congaLo: "X... .... ..x. ....",
    }),
    { family: "world", tags: ["sixteenths", "openHats", "ghosts"] },
  ),
  /* Steppers. Reggae with the kick on all four — the "four on the floor" a
     reggae band means, under a cross-stick that still waits for three.
     "Exodus" — Bob Marley and The Wailers, 1977.
     Percussion: the shaker on the eighths and a tambourine on the off-beats
     with it. The militant style is the one that layers up — four on the
     floor underneath and something rattling on every "and" is the whole
     sound of a steppers record. */
  groove(
    "worldSteppers",
    4,
    2,
    kit({
      length: 8,
      kick: "X. x. x. x.",
      snare: ".. .. o. ..",
      hat: ".X .x .X .x",
      shaker: "Xx Xx Xx Xx",
      tambourine: ".x .X .x .X",
    }),
    { family: "world", tags: ["crossStick", "fourOnFloor", "offbeat"], rim: true },
  ),
  /* Rockers. The militant one: the kick on every beat, a sixteenth hat, and a
     struck snare on three rather than a rim click.
     "Right Time" — The Mighty Diamonds, 1976.
     Percussion: the cabasa, sixteenths, accent / ghost / hit / ghost. A
     rockers bar is already sixteenths on the hat; the cabasa's beads are the
     dry rattle over the top that the hat cannot make. */
  groove(
    "worldRockers",
    4,
    4,
    kit({
      length: 16,
      kick: "X... x... x... x...",
      snare: ".... ..o. X... ..o.",
      hat: "Xoxo Xoxo Xoxo Xoxo",
      cabasa: "Xoxo Xoxo Xoxo Xoxo",
    }),
    { family: "world", tags: ["sixteenths", "fourOnFloor", "halfTime", "ghosts"], shortFill: true },
  ),
  /* Rocksteady. Ska slowed to a walk: the hat accents the off-beat instead of
     the count, and the rim waits for three.
     "Rock Steady" — Alton Ellis, 1966.
     Percussion: a tambourine on two and four, with a light shake on the
     "and" before each one. That shake is the whole reason a tambourine is
     not a second snare: the hand is moving the whole bar and only lands
     twice. */
  groove(
    "worldRocksteady",
    4,
    2,
    kit({
      length: 8,
      kick: "X. .. x. ..",
      snare: ".. .. o. ..",
      hat: "xX xX xX xX",
      tambourine: ".x X. .x X.",
    }),
    { family: "world", tags: ["crossStick", "offbeat", "eighths"], rim: true },
  ),
  /* Ska. Fast, with everything the band plays landing on the off-beat and the
     drums refusing to: kick and backbeat square, hat between them.
     "Guns of Navarone" — The Skatalites, 1965.
     Percussion: maracas leaning on the off-beat, where the guitar's skank
     is. The drums refuse the off-beat in a ska bar, so the shaker is the one
     row in the band that agrees with the horns. */
  groove(
    "worldSka",
    4,
    2,
    kit({
      length: 8,
      kick: "X. .. x. ..",
      snare: ".. X. .. X.",
      hat: ".X .x .X .x",
      shaker: "xX xX xX xX",
    }),
    { family: "world", tags: ["offbeat", "eighths", "driving"] },
  ),
  /* Bhangra. The dhol chaal: a stroke on the last sixteenth of every beat, so
     the bar gallops into each count instead of landing on it.
     "Gur Nalo Ishq Mitha" — Malkit Singh, 1990.
     Percussion: the chimta, standing in on the tambourine voice, playing the
     chaal with the dhol — the beat and the sixteenth that gallops into the
     next one. Jingles on tongs are what that is; a jingled head is the
     nearest this set gets. */
  groove(
    "worldBhangra",
    4,
    4,
    kit({
      length: 16,
      kick: "X..x .... x..x ....",
      snare: "...o X..o ...o X..o",
      hat: "X.x. X.x. X.x. X.x.",
      tambourine: "X..x X..x X..x X..x",
    }),
    { family: "world", tags: ["sixteenths", "driving", "ghosts"] },
  ),
  /* Rumba flamenca. The cajón: a bass tone on one and on the "and" of two,
     slaps on the backbeat, palmas filling the sixteenths between.
     "Bamboléo" — Gipsy Kings, 1987.
     Percussion: a shaker on the sixteenths, under the palmas. The cajon is
     the kit here and the handclaps are the snare's ghosts, so the one thing
     left to add is the steady rattle both of those play against. */
  groove(
    "worldRumbaFlamenca",
    4,
    4,
    kit({
      length: 16,
      kick: "X... ..x. .... ..x.",
      snare: ".... X..o .... X..o",
      hat: "X.x. X.x. X.x. X.x.",
      shaker: "Xoxo Xoxo Xoxo Xoxo",
    }),
    { family: "world", tags: ["sixteenths", "clave", "ghosts"] },
  ),
  /* Tango. The marcato in four with the rim playing three-three-two across it,
     which is the argument the dance is made of.
     "Libertango" — Ástor Piazzolla, 1974.
     Percussion: the claves on the three-three-two, in wood, doubling the
     rim. A tango orquesta has no percussion section at all — the marcato IS
     the percussion — so this is the one honest thing to hand a
     percussionist: the figure the whole dance argues about, said twice. */
  groove(
    "worldTango",
    4,
    2,
    kit({
      length: 8,
      kick: "X. .. x. ..",
      snare: "o. .o .. o.",
      hat: "X. x. X. x.",
      claves: "X..X ..x.",
    }),
    { family: "world", tags: ["crossStick", "syncopated", "quarters"], rim: true },
  ),
  /* Freylekhs. The klezmer bulgar: three-three-two on the bass drum under a
     backbeat that never moves, which is what makes the limp danceable.
     "Der Heyser Bulgar" — Naftule Brandwein, 1923.
     Percussion: a tambourine on the three-three-two, with the poyk. The
     bulgar's limp is in the bass drum; a jingled head over it is what turns
     the limp into a dance rather than a mistake. */
  groove(
    "worldKlezmer",
    4,
    2,
    kit({
      length: 8,
      kick: "X. .x .. x.",
      snare: ".. X. .. X.",
      hat: "Xx Xx Xx Xx",
      tambourine: "X. .x .. X.",
    }),
    { family: "world", tags: ["eighths", "syncopated", "driving"] },
  ),
  /* Cumbia. The guacharaca on the off-beats and a stroke on the last sixteenth
     of every beat, pulling the bar forward one step at a time.
     "Cómo Te Voy a Olvidar" — Los Ángeles Azules, 1996.
     Percussion: the guacharaca, properly this time — long down-scrape on the
     beat, two short ones after it — and the llamador answering on the "and"
     of every beat, open then muted. The hat was standing in for the
     guacharaca and can go back to being a hat. */
  groove(
    "worldCumbia",
    4,
    4,
    kit({
      length: 16,
      kick: "X... .... x... ....",
      snare: "...x X... ...x X...",
      hat: "..X. ..x. ..X. ..x.",
      guiro: "X.xx X.xx X.xx X.xx",
      congaHi: "..X. ..o. ..X. ..o.",
    }),
    { family: "world", tags: ["sixteenths", "offbeat", "driving"] },
  ),
  /* Highlife. The bell carries the bar and the snare only marks two and four:
     a dance band's answer to the clave, played on the rim of a cymbal.
     "All for You" — E.T. Mensah and the Tempos, 1952.
     Percussion: the axatse on the sixteenths and a conga answering the bell
     off the beat. A highlife band is a dance band with a percussion section
     at the back of it, and the gankogui is already on the ride. */
  groove(
    "worldHighlife",
    4,
    4,
    kit({
      length: 16,
      kick: "X... ..x. .... ..x.",
      snare: ".... X... .... X...",
      ride: "X..x ..x. x..x ..x.",
      shaker: "Xoxo Xoxo Xoxo Xoxo",
      congaHi: "..X. o.x. ..X. o.x.",
    }),
    { family: "world", tags: ["bell", "sixteenths", "clave"] },
  ),
  /* Ruchenitsa. Seven counted two-two-three, a village dance rather than a
     record: the kick opens each group and the snare closes the ones with room.
     No reference track — this one is older than recording.
     Percussion: a def on every pulse, accented where each group starts —
     two, two, three. It is the only row in this bar that spells the seven
     out, which at a village tempo is the difference between dancing it and
     counting it. */
  groove(
    "worldBalkan",
    7,
    1,
    kit({
      length: 7,
      kick: "X. x. x..",
      snare: ".X .X ..X",
      hat: "Xx Xx Xxx",
      shaker: "Xx Xx Xxx",
    }),
    { family: "world", tags: ["odd", "eighths", "driving"] },
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

/**
 * The grooves on one shelf, in the order the file writes them.
 *
 * In file order rather than alphabetical, and deliberately: the first card of
 * every family is the one a player who does not know the others should land
 * on — Rock eighths, the shuffle, the bossa — and sorting by name would put
 * "Afrobeat" in front of the reggae a world chip was tapped for.
 */
export function groovesInFamily(family: GrooveFamily): Groove[] {
  return GROOVES.filter((g) => g.family === family);
}

/** Every groove carrying this tag, whatever shelf it is on. */
export function groovesWithTag(tag: GrooveTag): Groove[] {
  return GROOVES.filter((g) => g.tags.includes(tag));
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
    // Filed under "rock" because it has to be filed somewhere and the shelf is
    // never seen: the rule groove is built on demand for a meter nobody wrote
    // a groove for, and it is not in `GROOVES`, so no chip row ever draws it.
    family: "rock",
    tags: ["odd"],
  };
}
