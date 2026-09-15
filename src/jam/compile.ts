/**
 * A saved jam turned into the table the engine plays.
 *
 * Pure, and deliberately the only place that translation happens: the record
 * is what the user edits and the config is what the audio thread reads, and
 * keeping one function between them means a change to either shape has
 * exactly one place to meet the other.
 *
 * The rule the contract encodes is the caller's, not this function's: whoever
 * sends this config must already have set the engine's subdivision to
 * `ticksPerBeat` and its beat groups to `[beatsPerBar]`. The engine checks the
 * product against its own bar and plays the plain click when they disagree,
 * so a mismatch is audible rather than silently wrong.
 *
 * ## Why the bass makes this take a bar number
 *
 * The drums are one bar that repeats; the bass is not. Over a twelve-bar
 * blues the bass plays A under bar 1 and D under bar 5, so there is no single
 * table that is "the bass line" — there is a bass line PER BAR, and the
 * config carries the one for the bar that is about to be played. The caller
 * re-sends at each bar line (see `useJamSession`), which is why `formBar` is
 * an option here rather than something this function could work out for
 * itself: it is the audio thread that knows what bar it is on, not us.
 */
import { applyFeel } from "./feel";
import { bandMoment, previousBar, sameMoment } from "./arrangement";
import type { BandMoment } from "./arrangement";
import { formBars } from "./forms";
import { grooveById, ruleGroove } from "./grooves";
import { bassLineFor, bassStyleForGroove } from "./bassline";
import { bassChordFrom } from "./bandChord";
import { parseKey } from "./harmony";
import { chordsForJam } from "./progression";
import { keysLineFor } from "./keysline";
import { practiceConfigFrom } from "./practice";
import { applyIntensity } from "./vibesContract";
import type { ShapedGroove } from "./vibesContract";
import { JAM_INTENSITY_GAIN, JAM_LANES, JAM_OPTIONAL_LANES, JAM_PERC_LANES } from "./types";
import type { Key } from "./harmony";
import type {
  Jam,
  JamEngineConfig,
  JamKeysLine,
  JamKeysStyle,
  JamLevel,
  JamMix,
  JamPattern,
  JamPercLane,
  JamBassLine,
} from "./types";

/** A jam with no readable key is read as C major rather than as no key. */
const DEFAULT_KEY: Key = { root: 0, mode: "major" };

export type JamBand = { drums: boolean; bass: boolean; keys?: boolean; perc?: boolean };

/** Drums and nobody else, for a caller that has no lineup to hand. */
const DRUMS_ONLY: JamBand = { drums: true, bass: false, keys: false, perc: false };

export type JamCompileOptions = {
  /**
   * Which bar of the chorus to compile the BASS and the KEYS for, 0-based.
   * Everything else in the config is the same on every bar. Default 0, which
   * is what a jam that has not started yet is about to play.
   */
  formBar?: number;
  /**
   * The voicing the keys player's hand was last on, so the next bar leads
   * away from it rather than jumping back to root position. Absent on the
   * first bar of a take.
   */
  previousVoicing?: number[] | null;
  /**
   * Who is in the band when the record does not say — the lineup for the
   * instrument you play (`lineupFor` in `./lineup`).
   *
   * A jam saved before the band existed has no `band` field, and the answer
   * for it is not "drums only" but the rule the whole mode is built on: the
   * band never plays your instrument (JAM_MODE §3.1). So a guitarist's old
   * jam gains a bass player, which is the feature, and a bass player's does
   * not, which is the point.
   */
  lineup?: JamBand;
  /**
   * Which time round the form this bar is, 1-based, straight off
   * `BeatEvent.chorus`.
   *
   * The arrangement is a plan across choruses — held back on the first, open
   * on the third, a breakdown on the fourth — so the compiler cannot decide
   * what the band plays without it. Default 1, which is what a jam that has
   * not started yet is about to play, and what a `loop` jam means on every bar
   * for ever.
   */
  chorus?: number;
};

/** Who is playing on this jam: the record's own answer, or the lineup's. */
export function jamBand(jam: Jam, lineup?: JamBand): JamBand {
  return jam.band ?? lineup ?? DRUMS_ONLY;
}

/** The key a jam is in, readable or not. */
export function jamKey(jam: Jam): Key {
  return (jam.key ? parseKey(jam.key) : null) ?? DEFAULT_KEY;
}

/**
 * The groove as it is WRITTEN — the one drawn in the editor if there is one,
 * the preset otherwise, with the feel already applied to whichever it is.
 *
 * A custom groove is not a variant of the preset it started from; it replaces
 * it. Feel and intensity still sit on top, because those are how the same
 * groove is played rather than which groove it is.
 *
 * This is the groove's OWN meter, before `jam.meter` gets a say. Nearly every
 * caller wants `jamGroove` below instead; this one exists because the meter
 * control has to be able to say what the groove was written for in order to
 * offer "the groove's own".
 */
export function jamWrittenGroove(jam: Jam): ShapedGroove {
  // A groove you drew is a groove nobody has heard: its quiet snare is a
  // ghost, because the editor has no way to say "cross-stick" and guessing
  // would put a rim click in a bar the player thinks they drew.
  if (jam.customGroove) return applyFeel(jam.customGroove, jam.feel);
  const preset = applyFeel(grooveById(jam.grooveId), jam.feel);
  return {
    beatsPerBar: preset.beatsPerBar,
    ticksPerBeat: preset.ticksPerBeat,
    bar: preset.bar,
    fill: preset.fill,
    snareGhostIsRim: preset.snareGhostIsRim,
  };
}

/** The beat groups a jam runs in: the meter it was given, or the groove's own. */
export function jamBeatGroups(jam: Jam): number[] {
  const chosen = jam.meter?.beatGroups?.filter((n) => Number.isFinite(n) && n > 0);
  if (chosen && chosen.length > 0) return chosen.map((n) => Math.trunc(n));
  return [jamWrittenGroove(jam).beatsPerBar];
}

/**
 * Does the groove fit the meter the jam is set to?
 *
 * Both halves have to agree — a shuffle is four beats of TRIPLETS, and asking
 * for it in four beats of sixteenths is as much a mismatch as asking for it in
 * seven. When this is false the drummer plays the rule instead, and the setup
 * screen says so in those words rather than silently swapping the groove out
 * from under the card that still looks selected.
 */
export function jamGrooveFitsMeter(jam: Jam): boolean {
  if (!jam.meter) return true;
  const written = jamWrittenGroove(jam);
  const beats = jamBeatGroups(jam).reduce((sum, n) => sum + n, 0);
  return beats === written.beatsPerBar && jam.meter.ticksPerBeat === written.ticksPerBeat;
}

/**
 * The groove the jam actually plays.
 *
 * The written one where the meter fits it, and the rule groove where it does
 * not (JAM_MODE §4.1: "odd meters fall back to a rule … so a 7/8 jam still has
 * a drummer"). Not a refusal and not a silent re-bar: the bar the engine gets
 * is the meter you asked for, and the drummer plays something honest in it.
 */
export function jamGroove(jam: Jam): ShapedGroove {
  if (jamGrooveFitsMeter(jam)) return jamWrittenGroove(jam);
  const rule = ruleGroove(jamBeatGroups(jam), jam.meter!.ticksPerBeat);
  return {
    beatsPerBar: rule.beatsPerBar,
    ticksPerBeat: rule.ticksPerBeat,
    bar: rule.bar,
    fill: rule.fill,
  };
}

/**
 * Every lane at zero, the same width as `pattern`.
 *
 * The optional rows — the open hat and the two toms — are dropped rather than
 * zeroed, which is the one place in the compiler where they do not travel: a
 * silent drummer has nothing to open and no tom to hit, and a row of zeros
 * would be state the engine reads past on every bar to learn nothing.
 * Everywhere else the bar and the fill go to the engine exactly as the groove
 * wrote them — those rows included.
 */
function silenced(pattern: JamPattern): JamPattern {
  const out = {} as JamPattern;
  for (const lane of JAM_LANES) {
    out[lane] = new Array<JamLevel>(pattern[lane]?.length ?? 0).fill(0);
  }
  return out;
}

// ---------------------------------------------------------------------------
// The arrangement, applied (fourth pass, plans/tasks/jam-v4/BRIEF.md A1)
// ---------------------------------------------------------------------------
//
// `src/jam/arrangement.ts` decides WHAT the band does on this bar; everything
// under this heading is HOW that decision reaches the table, the bass line and
// the keys line. The split is deliberate: the decision is music and wants to
// be read by a musician, and this is bookkeeping over arrays.
//
// One rule governs the order, and it is the only subtle thing here. The bar is
// shaped first, the intensity runs over the result — because the moment's
// intensity is what this bar is played at — and the crash is forced back on
// LAST. Soft clears the crash lane, which is what Soft means, so a crash put
// on before it would be silently swallowed on exactly the bar a band most
// wants one: the top of the first, held-back chorus.

/** A row of the same length, or all zeros where the pattern has no such row. */
function rowOr(pattern: JamPattern, lane: keyof JamPattern, length: number): JamLevel[] {
  const row = pattern[lane] as JamLevel[] | undefined;
  const out = new Array<JamLevel>(length).fill(0);
  if (!row) return out;
  for (let t = 0; t < row.length && t < length; t += 1) out[t] = row[t];
  return out;
}

/**
 * `bar` up to `from`, `fill` from there on — how a drummer plays a fill that
 * is shorter than a bar.
 *
 * Row by row across both patterns, because the bar and the fill do not carry
 * the same optional rows: a groove with no toms and a fill full of them meet
 * here, and a lane that exists on one side and not the other has to read as
 * silence on the other rather than as a shorter array. A row that ends up
 * silent on both halves is dropped, so a table that never touches a tom still
 * carries no tom row (`silenced` above says why that matters).
 */
function spliceFill(bar: JamPattern, fill: JamPattern, from: number): JamPattern {
  const length = bar.kick.length;
  const out = {} as JamPattern;
  for (const lane of JAM_LANES) {
    const row = rowOr(bar, lane, length);
    const after = rowOr(fill, lane, length);
    for (let t = from; t < length; t += 1) row[t] = after[t];
    out[lane] = row;
  }
  for (const lane of JAM_OPTIONAL_LANES) {
    if (!bar[lane] && !fill[lane]) continue;
    const row = rowOr(bar, lane, length);
    const after = rowOr(fill, lane, length);
    for (let t = from; t < length; t += 1) row[t] = after[t];
    if (row.some((level) => level !== 0)) out[lane] = row;
  }
  // The percussion crosses the seam UNSPLICED, and that is the one asymmetry
  // in this function. A drum fill is the drummer leaving the groove; the
  // percussionist is a second player and they do not leave with them — a
  // shaker that stopped for two beats every time round the form is the exact
  // hole this pass exists to fill. So the bar's rows come through whole, and
  // the fill's (there are none: `fillOver` writes toms, not congas) are
  // ignored.
  for (const lane of JAM_PERC_LANES) {
    const row = bar[lane];
    if (row && row.some((level) => level !== 0)) out[lane] = [...row];
  }
  return out;
}

/**
 * The percussionist's rows off a pattern, or null when they are not playing on
 * it.
 *
 * Only the rows with a stroke in them: an empty row is a lane the engine reads
 * past on every tick of every bar to learn nothing, which is the same reason
 * `silenced` drops the kit's optional rows rather than zeroing them.
 */
function percRowsOf(pattern: JamPattern): Partial<Record<JamPercLane, JamLevel[]>> | null {
  let out: Partial<Record<JamPercLane, JamLevel[]>> | null = null;
  for (const lane of JAM_PERC_LANES) {
    const row = pattern[lane];
    if (!row || !row.some((level) => level !== 0)) continue;
    (out ??= {})[lane] = [...row];
  }
  return out;
}

/**
 * Does this pattern have a percussionist written into it?
 *
 * The band row on the playing screen and the switch in the sheet both ask it:
 * a Percussion row over a thrash groove would be a player with nothing to
 * play, and a jam that has turned percussion ON is a different question,
 * answered by the record (`jam.band.perc`) and not by this.
 */
export function hasPercussion(pattern: JamPattern | null | undefined): boolean {
  if (!pattern) return false;
  return JAM_PERC_LANES.some((lane) => pattern[lane]?.some((level) => level !== 0));
}

/** Every stroke on the pattern's last tick taken to peak — the top of a fill. */
function toppedOff(pattern: JamPattern): JamPattern {
  const out = {} as JamPattern;
  const last = pattern.kick.length - 1;
  for (const lane of JAM_LANES) {
    const row = [...pattern[lane]];
    if (last >= 0 && row[last] !== 0) row[last] = 4;
    out[lane] = row;
  }
  for (const lane of JAM_OPTIONAL_LANES) {
    const row = pattern[lane];
    if (!row) continue;
    const copy = [...row];
    if (last >= 0 && copy[last] !== 0) copy[last] = 4;
    out[lane] = copy;
  }
  return out;
}

/**
 * The bar this moment actually plays: the groove, a beat of fill on the end of
 * it, or the whole fill.
 *
 * `small` is the fill's LAST BEAT only, spliced over the groove — which is
 * what a drummer does at a section seam: they play the bar and turn the last
 * beat into a pickup. `big` is the whole fill with its last tick taken to
 * peak, the gesture that answers a crash on the next downbeat.
 *
 * A groove with no fill written for it — one you drew, before you drew one —
 * plays the bar. Nothing invents a fill here.
 */
function barForMoment(groove: ShapedGroove, moment: BandMoment): JamPattern {
  if (moment.fill === "none" || !groove.fill) return groove.bar;
  if (moment.fill === "big") return toppedOff(groove.fill);
  const from = Math.max(0, (groove.beatsPerBar - 1) * groove.ticksPerBeat);
  return spliceFill(groove.bar, groove.fill, from);
}

/**
 * Tick 0 at accent on the lanes a band hits with, and silence after.
 *
 * The crash is deliberately NOT one of them. A crash is decided in exactly one
 * place — the moment's `crash` — and a second rule putting one on every
 * stop-time bar would be two answers to the same question, audible as a cymbal
 * over a gesture whose whole point is the silence after the hit.
 *
 * The toms and the open hat go with the rest: nobody lands a stop-time figure
 * on a rack tom.
 */
function stopTimeBar(pattern: JamPattern): JamPattern {
  const length = pattern.kick.length;
  const out = {} as JamPattern;
  for (const lane of JAM_LANES) {
    const row = new Array<JamLevel>(length).fill(0);
    if (length > 0 && lane !== "crash") row[0] = 2;
    out[lane] = row;
  }
  return out;
}

/** The kick and the hats, and nobody else — the breakdown's first half. */
function hatsAndKickBar(pattern: JamPattern): JamPattern {
  const length = pattern.kick.length;
  const out = {} as JamPattern;
  out.kick = [...pattern.kick];
  out.hat = [...pattern.hat];
  out.snare = new Array<JamLevel>(length).fill(0);
  out.ride = new Array<JamLevel>(length).fill(0);
  out.crash = new Array<JamLevel>(length).fill(0);
  // The open hat is a hat and stays; the toms are not and go. A breakdown that
  // kept its tom fills would not be a breakdown.
  if (pattern.hatOpen) out.hatOpen = [...pattern.hatOpen];
  return out;
}

/** The drums as this moment has them, before the crash is put back. */
function drumsForMoment(pattern: JamPattern, moment: BandMoment): JamPattern {
  switch (moment.drums) {
    case "full":
      return pattern;
    case "hatsAndKick":
      return hatsAndKickBar(pattern);
    case "stopTime":
      return stopTimeBar(pattern);
    case "off":
      return silenced(pattern);
  }
}

/**
 * The strong beats of a bar, as tick numbers.
 *
 * One and three in four-time and anything longer; one alone in three-time,
 * because a waltz has no three to land on. These are where a bass player puts
 * a half note when they are staying out of the way.
 */
function strongBeatTicks(beatsPerBar: number, ticksPerBeat: number): number[] {
  if (beatsPerBar < 4) return [0];
  return [0, Math.floor(beatsPerBar / 2) * ticksPerBeat];
}

/** The first note the bar sounds, for a downbeat that happens to be a rest. */
function firstPitch(pitches: number[]): number {
  for (const pitch of pitches) if (pitch !== 0) return pitch;
  return 0;
}

/**
 * The bass line as this moment plays it.
 *
 * `sparse` is the one that needed a decision. "Roots and fifths on the strong
 * beats and drop the rest", read literally, is one TICK of bass per half bar —
 * and a one-tick note is a blip, not a bass player: `bassline.ts` writes a
 * note's LENGTH as the same pitch repeated across consecutive ticks, so
 * dropping the repeats shortens every note to nothing. So the note found at
 * each strong beat is HELD to the next one, which is the half-note feel the
 * rule is describing, and what a bass player actually does on the first chorus
 * while everybody works out what the tune is.
 *
 * A stop-time bar and an ending are the same shape for the bass as for the
 * drums: the downbeat, and silence.
 */
function bassForMoment(
  line: JamBassLine | null,
  moment: BandMoment,
  meter: { beatsPerBar: number; ticksPerBeat: number },
): JamBassLine | null {
  if (!line) return null;
  const length = line.pitches.length;
  if (moment.bass === "off") {
    return { ...line, pitches: new Array<number>(length).fill(0) };
  }
  if (moment.drums === "stopTime") {
    const pitches = new Array<number>(length).fill(0);
    if (length > 0) pitches[0] = line.pitches[0] || firstPitch(line.pitches);
    return { ...line, pitches };
  }
  if (moment.bass === "full") return line;
  const strong = strongBeatTicks(meter.beatsPerBar, meter.ticksPerBeat);
  const pitches = new Array<number>(length).fill(0);
  for (let i = 0; i < strong.length; i += 1) {
    const from = strong[i];
    if (from >= length) continue;
    const until = i + 1 < strong.length ? Math.min(strong[i + 1], length) : length;
    const pitch = line.pitches[from] || 0;
    if (pitch === 0) continue;
    for (let t = from; t < until; t += 1) pitches[t] = pitch;
  }
  return { ...line, pitches };
}

/**
 * The keys as this moment comps them.
 *
 * `sparse` is one voicing per bar — the first the bar strikes, left where it
 * was struck. Keeping the first rather than forcing one onto tick 0 is the
 * difference between a quiet keys player and a wrong one: a stabs line answers
 * the snare, and moving its one chord to the downbeat would be comping a
 * rhythm nobody is playing.
 */
function keysForMoment(line: JamKeysLine | null, moment: BandMoment): JamKeysLine | null {
  if (!line) return null;
  const empty = () => line.voicings.map(() => [] as number[]);
  if (moment.keys === "off") return { ...line, voicings: empty() };
  const first = line.voicings.findIndex((v) => v.length > 0);
  if (moment.drums === "stopTime") {
    const voicings = empty();
    if (first >= 0 && voicings.length > 0) voicings[0] = [...line.voicings[first]];
    return { ...line, voicings };
  }
  if (moment.keys === "full") return line;
  const voicings = empty();
  if (first >= 0) voicings[first] = [...line.voicings[first]];
  return { ...line, voicings };
}

/** The crash, forced onto the downbeat at peak — the last word on the table. */
function withCrash(pattern: JamPattern): JamPattern {
  if (pattern.crash.length === 0) return pattern;
  const crash = [...pattern.crash];
  crash[0] = 4;
  return { ...pattern, crash };
}

/**
 * The bass for one bar of the form, or null when there is no bass player.
 *
 * The drums do not know what key they are in and the bass cannot move without
 * knowing, so this is the only part of the config that reads the chords. The
 * chord the NEXT bar plays goes in too: a walking line earns its name by
 * arriving on the next root from a step away, which it cannot do without
 * being told where it is going.
 */
export function jamBassLine(jam: Jam, formBar: number, lineup?: JamBand): JamBassLine | null {
  if (!jamBand(jam, lineup).bass) return null;
  const groove = jamGroove(jam);
  const bars = formBars(jam.form);
  if (bars <= 0) return null;

  const key = jamKey(jam);
  // The changes the jam is actually on: yours where you typed one, the form's
  // everywhere else. The bass follows the progression for the same reason the
  // timeline does — there is one set of changes, and a bass playing the
  // form's while the screen shows yours is the worst bug this mode could have.
  const chords = chordsForJam(jam.form, key, jam.progression);
  const index = ((Math.trunc(formBar) % bars) + bars) % bars;

  return bassLineFor({
    groove: groove.bar,
    feel: jam.feel,
    chords: {
      bar: bassChordFrom(chords[index]),
      next: bassChordFrom(chords[(index + 1) % bars]),
    },
    beatsPerBar: groove.beatsPerBar,
    ticksPerBeat: groove.ticksPerBeat,
    // A custom groove has no id to look a style up by, so it falls back to
    // roots on the kick — which is exactly right for a pattern nobody has
    // heard yet.
    style: bassStyleForGroove(jam.customGroove ? "" : jam.grooveId),
    barIndex: index,
  });
}

/** How the keys comp on this jam. Absent: pads, the quieter of the two. */
export function jamKeysStyle(jam: Jam): JamKeysStyle {
  return jam.keysStyle === "stabs" ? "stabs" : "pads";
}

/**
 * The keys for one bar of the form, or null when nobody is on them.
 *
 * Like the bass, per bar and not per jam: the voicing is of the chord in THIS
 * bar. `previous` is the voicing the last bar struck, so the hand moves from
 * where it was rather than resetting to root position every bar line — the
 * caller (`useJamSession`) remembers it across the sends.
 */
export function jamKeysLine(
  jam: Jam,
  formBar: number,
  lineup?: JamBand,
  previous?: number[] | null,
): JamKeysLine | null {
  if (!jamBand(jam, lineup).keys) return null;
  const bars = formBars(jam.form);
  if (bars <= 0) return null;
  const groove = jamGroove(jam);
  const chords = chordsForJam(jam.form, jamKey(jam), jam.progression);
  const index = ((Math.trunc(formBar) % bars) + bars) % bars;
  const chord = chords[index];
  if (!chord) return null;
  return keysLineFor({
    chord,
    groove: groove.bar,
    style: jamKeysStyle(jam),
    meter: { beatsPerBar: groove.beatsPerBar, ticksPerBeat: groove.ticksPerBeat },
    previous,
    // The lane's volume travels once, in `mix.keys`; the engine multiplies
    // `gain` and `mix.keys`, so sending it here too applied it squared.
    gain: 1,
  });
}

/** Per-lane volume, clamped to what the contract allows. Absent: 1.0 each. */
export function jamMix(jam: Jam): JamMix {
  const clamp = (value: number | undefined) =>
    Math.max(0, Math.min(1.5, Number.isFinite(value) ? (value as number) : 1));
  return {
    drums: clamp(jam.mix?.drums),
    bass: clamp(jam.mix?.bass),
    keys: clamp(jam.mix?.keys),
    // The percussionist's fader. A record saved before there was one has no
    // number here and reads as 1.0, which is the same courtesy every lane
    // above gets and the reason `clamp` takes `undefined` at all.
    perc: clamp(jam.mix?.perc),
  };
}

export function compileJam(jam: Jam, options: JamCompileOptions = {}): JamEngineConfig {
  /**
   * The groove as it will be PLAYED — intensity shaping included.
   *
   * Loud used to be a gain and nothing else, so a drummer told to play loud
   * played the same ghost notes 25% louder (JAM_UX_DECISIONS B5). It is a
   * pattern now: ghosts go, the off-beat hats move to the open-hat row, a
   * crash lands on the section starts, and the reverse for Soft. The gain
   * still travels in `intensity` below, because the two together are what
   * "loud" means.
   *
   * Applied here and not in `jamGroove`, deliberately: the bass line and the
   * meter are worked out from the groove as WRITTEN, and a hat that opened
   * must not move a bass note or re-bar the tune.
   *
   * It takes the bar, because Loud's last rule is a phrase rule: the backbeat
   * peaks at the end of every four bars. That costs nothing — this function is
   * already called once per bar line, because the bass has to be.
   */
  const formBar = options.formBar ?? 0;
  /**
   * What the band is doing on this bar, and what it was doing on the last one.
   *
   * In `loop` the moment is the same on every bar and says nothing the compiler
   * did not already do, so everything below reads exactly as it read before —
   * which is the compatibility promise of this whole pass, made good by one
   * branch rather than by hoping.
   */
  const chorus = Math.max(1, Math.trunc(options.chorus ?? 1));
  const moment = bandMoment(jam, chorus, formBar);
  const arranged = jam.arrangement?.mode === "build" || jam.arrangement?.mode === "song";
  const written = jamGroove(jam);
  const groove = applyIntensity(
    arranged ? { ...written, bar: barForMoment(written, moment) } : written,
    // The arrangement's dynamics in Build and Song; the record's in Loop. They
    // are the same value in Loop, so this line changes nothing there.
    moment.intensity,
    formBar,
  );
  // Muting the drummer is not the same as removing them: the table still has
  // to be the right width, because the engine checks it against the bar it
  // already runs. A silent drummer is every cell at zero.
  const drumsOff = !jamBand(jam, options.lineup).drums;
  const arrangedBar = arranged ? drumsForMoment(groove.bar, moment) : groove.bar;
  const played = drumsOff ? silenced(arrangedBar) : arrangedBar;
  const crashed = arranged && moment.crash && !drumsOff ? withCrash(played) : played;
  /**
   * The percussionist, put back on top of whatever the drummer is doing.
   *
   * Everything above this line reshapes the KIT — `drumsForMoment` rebuilds the
   * table from the five lanes and the kit's three optional rows, so by here the
   * percussion is gone from it — and that is deliberate rather than a leak to
   * patch. A breakdown takes the snare, the ride and the toms off the drummer;
   * it does not take the congas off the percussionist, and the only way for one
   * function to express both is for the percussion to be a layer laid back on
   * after the kit has been shaped (BRIEF: "a percussionist is not a drum kit").
   *
   * The rows come from `groove.bar` — the groove as the intensity plays it,
   * before the arrangement touched the kit — because the percussionist plays
   * their bar whatever the drummer is doing on top of it.
   *
   * Three things have to be true for them to sound, and each is somebody
   * different's answer: the record has hired one (`band.perc`), the drummer is
   * playing at all (a percussion-only band is not a thing this mode offers),
   * and this bar is not one of the two the arrangement silences them on.
   */
  const percHired = jamBand(jam, options.lineup).perc === true;
  const percOn = percHired && !drumsOff && (!arranged || moment.perc === "full");
  const percussion = percOn ? percRowsOf(groove.bar) : null;
  const bar = percussion ? { ...crashed, ...percussion } : crashed;
  /**
   * The engine's own fill machinery, off under an arrangement.
   *
   * In `loop` the engine plays `fill` on the chorus's last bar and every
   * `fillEvery` bars and crashes on the one, and that is exactly what it has
   * always done. Under an arrangement the fills are decided per bar and are
   * already IN the table above, so leaving the engine's rules switched on
   * would play two fills over each other and crash on downbeats the plan said
   * nothing about. One place decides; here it is said once.
   */
  const writtenFill =
    !arranged && jam.fills && groove.fill
      ? drumsOff
        ? silenced(groove.fill)
        : groove.fill
      : null;
  /**
   * The fill the engine lands on the chorus's last bar — with the percussion
   * still under it.
   *
   * A fill is a bar like any other as far as the percussionist is concerned:
   * the drummer goes round the toms and the shaker keeps going, because the
   * shaker is what the fill is played against. Without this the percussion
   * would drop out for one whole bar every time round the form, which is the
   * single most audible thing a layer like this can get wrong.
   *
   * `spliceFill` does the same job for the arranged modes, where a fill is
   * written into the bar rather than sent on its own row.
   */
  const barLineFill =
    writtenFill && percussion ? { ...writtenFill, ...percussion } : writtenFill;
  /**
   * Does the drummer play this jam IN?
   *
   * `intro: "fill"` is ONE gesture in two halves: a pickup on the count-in's
   * last beat, and the crash on bar one that answers it. The crash half is
   * the arrangement's, and it is asked for here rather than re-derived —
   * `bandMoment(jam, 1, 0).crash` is the whole question "does this band come
   * in on the one", intro and the Fills switch and all, and a second rule
   * spelling out the same conditions is a second rule to keep in step.
   *
   * What is left are the three things that decide whether the pickup CAN be
   * played. A count-in of at least a bar, because a pickup cut out of a
   * two-beat count is most of the count. A drummer who is playing at all. And
   * a fill written for this groove, because nothing here invents one
   * (`barForMoment` says the same about the bar).
   */
  const comesInOnTheOne = arranged && bandMoment(jam, 1, 0).crash;
  const pickup =
    comesInOnTheOne && !drumsOff && !!groove.fill && jam.countIn >= groove.beatsPerBar;
  /**
   * The pickup travels on the FILL ROW, and the engine is told what it is for.
   *
   * There is one row on the wire for "what the drummer plays that is not the
   * groove", and under an arrangement it is free — the fills are in the bar.
   * So the pickup rides it and `pickup` says which of the two things it is;
   * the engine spends it on the count-in's last beat and plays no bar-line
   * fill (`jam.rs`, `pickup_beat`). Two rows would mean two ways for the
   * drums to arrive and a second width to keep in step with the first.
   *
   * `toppedOff` because the pickup is the end of the `big` fill: the gesture
   * that answers a crash, with its last stroke at peak.
   */
  const fill = barLineFill ?? (pickup && groove.fill ? toppedOff(groove.fill) : null);
  const meter = { beatsPerBar: groove.beatsPerBar, ticksPerBeat: groove.ticksPerBeat };
  const bassLine = jamBassLine(jam, formBar, options.lineup);
  const keysLine = jamKeysLine(jam, formBar, options.lineup, options.previousVoicing);
  /**
   * Does this bar ask the band for something the last bar was not doing?
   *
   * Only then does the table have to wait for the downbeat. `previousBar`
   * returns null at the very top of a take — the first bar of a tune is a
   * start, not a change — so a load is sent the way a load has always been
   * sent, at once.
   */
  const before = arranged ? previousBar(jam, chorus, formBar) : null;
  const changed =
    !!before && !sameMoment(moment, bandMoment(jam, before.chorus, before.formBar));

  return {
    ticksPerBeat: groove.ticksPerBeat,
    beatsPerBar: groove.beatsPerBar,
    bar,
    // One switch, two cues: the fill on the last bar and the crash that
    // answers it on the next one. They are the same musical gesture, and a
    // crash with no fill in front of it sounds like a mistake.
    fill,
    formBars: formBars(jam.form),
    crashOnOne: !arranged && jam.fills && !drumsOff,
    intensity: JAM_INTENSITY_GAIN[moment.intensity] ?? 1,
    // The bossa, the ballad and the cha-cha are played with the stick across
    // the head. Sent as a flag rather than written into the table, because it
    // is true of the whole groove and not of one tick: every quiet snare in it
    // is the rim, in the bar and in the fill alike. Absent where it is false,
    // the way the voices below are absent — a switch that is only ever off
    // reads better missing than present and empty.
    ...(groove.snareGhostIsRim ? { snareGhostIsRim: true } : {}),
    kit: jam.kit || "studio",
    bass: arranged ? bassForMoment(bassLine, moment, meter) : bassLine,
    practice: jam.practice ? practiceConfigFrom(jam.practice) : null,
    // A fill every four or eight bars as well as at the chorus end. Zero when
    // fills are off at all, rather than a number the engine would have to
    // remember not to act on: `barLineFill` is already null there, and two
    // switches that have to agree is one too many.
    //
    // `barLineFill` and not `fill`: a row carrying a pickup is not a fill the
    // engine lands on bars, and asking it to land one every four would be
    // exactly the second fill `pickup` exists to prevent.
    fillEvery: barLineFill ? Math.max(0, Math.trunc(jam.fillEvery ?? 0)) : 0,
    keys: arranged ? keysForMoment(keysLine, moment) : keysLine,
    mix: jamMix(jam),
    // The sticks are the drummer counting the band in on the rim, which is
    // what a drummer does; the beep is the drill's, and it is what you want
    // when the kit is what you are trying to hear.
    countInSound: jam.countInSound === "sticks" ? "sticks" : "beep",
    // Which recipe the bass and the keys are synthesised from (B9). Absent on
    // the record means the engine's own default, which is what every jam
    // saved before the voices existed wants.
    ...(jam.bassVoice ? { bassVoice: jam.bassVoice } : {}),
    ...(jam.keysVoice ? { keysVoice: jam.keysVoice } : {}),
    // A folder of your own samples (B3). Only the path travels: the NAME is
    // for the dropdown to draw and means nothing to the audio thread, and the
    // engine falls back to the built-in kit named above for any voice the
    // folder does not hold.
    ...(jam.customKit?.dir ? { customKit: { dir: jam.customKit.dir } } : {}),
    // The arrangement's two words to the engine (A1). Both absent under
    // `loop`, and absent rather than false or "now" under the other two,
    // because a switch that is only ever off reads better missing than
    // present and empty — the same courtesy `snareGhostIsRim` gets above.
    ...(changed ? { applyAt: "barLine" as const } : {}),
    // `ending` is set on exactly one bar of a Song and on nothing else, so it
    // is the whole of the question. No second rule to keep in step with it.
    ...(moment.ending ? { endsForm: true } : {}),
    // The pickup: the count-in's last beat, played rather than counted. Sent
    // on every bar the way the rest of the table is, because the table the
    // engine is holding when the count-in runs is whichever one was last
    // loaded — and absent rather than false under `loop`, like the two above.
    ...(pickup ? { pickup: true } : {}),
  };
}

/**
 * The meter a jam runs in — what the UI sets on the engine before sending.
 *
 * `beatGroups` is the meter as the metronome's own editor writes it ([3, 2, 2]
 * for 7/8) and `beatsPerBar` is their sum, which is what the contract's check
 * is against. Both, rather than one derived at each call site: the engine is
 * told the GROUPS, because a 7/8 bar accented 3+2+2 and one accented 2+2+3 are
 * the same seven ticks and very different music, and the jam that asked for
 * one must not get the other.
 */
export function jamMeter(jam: Jam): {
  beatsPerBar: number;
  ticksPerBeat: 1 | 2 | 3 | 4 | 6;
  beatGroups: number[];
} {
  const groove = jamGroove(jam);
  const groups = jamBeatGroups(jam);
  const summed = groups.reduce((sum, n) => sum + n, 0);
  // The groove is the authority on the bar's LENGTH — when the meter did not
  // fit, `jamGroove` already returned the rule groove built for these very
  // groups, so the two agree. When they somehow do not, the table wins,
  // because the table is what the engine checks.
  return {
    beatsPerBar: groove.beatsPerBar,
    ticksPerBeat: groove.ticksPerBeat,
    beatGroups: summed === groove.beatsPerBar ? groups : [groove.beatsPerBar],
  };
}
