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
import { formBars } from "./forms";
import { grooveById, ruleGroove } from "./grooves";
import { bassLineFor, bassStyleForGroove } from "./bassline";
import { bassChordFrom } from "./bandChord";
import { parseKey } from "./harmony";
import { chordsForJam } from "./progression";
import { keysLineFor } from "./keysline";
import { practiceConfigFrom } from "./practice";
import { applyIntensity } from "./vibesContract";
import { JAM_INTENSITY_GAIN, JAM_LANES } from "./types";
import type { Key } from "./harmony";
import type {
  Jam,
  JamEngineConfig,
  JamKeysLine,
  JamKeysStyle,
  JamLevel,
  JamMix,
  JamPattern,
  JamBassLine,
} from "./types";

/** A jam with no readable key is read as C major rather than as no key. */
const DEFAULT_KEY: Key = { root: 0, mode: "major" };

export type JamBand = { drums: boolean; bass: boolean; keys?: boolean };

/** Drums and nobody else, for a caller that has no lineup to hand. */
const DRUMS_ONLY: JamBand = { drums: true, bass: false, keys: false };

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
export function jamWrittenGroove(jam: Jam): {
  beatsPerBar: number;
  ticksPerBeat: 1 | 2 | 3 | 4 | 6;
  bar: JamPattern;
  fill: JamPattern | null;
} {
  if (jam.customGroove) return applyFeel(jam.customGroove, jam.feel);
  const preset = applyFeel(grooveById(jam.grooveId), jam.feel);
  return {
    beatsPerBar: preset.beatsPerBar,
    ticksPerBeat: preset.ticksPerBeat,
    bar: preset.bar,
    fill: preset.fill,
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
export function jamGroove(jam: Jam): {
  beatsPerBar: number;
  ticksPerBeat: 1 | 2 | 3 | 4 | 6;
  bar: JamPattern;
  fill: JamPattern | null;
} {
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
 * The optional `hatOpen` row is dropped rather than zeroed, which is the one
 * place in the compiler where the row does not travel: a silent drummer has
 * nothing to open, and a row of zeros would be state the engine reads past on
 * every bar to learn nothing. Everywhere else the bar and the fill go to the
 * engine exactly as the groove wrote them — untouched, this row included.
 */
function silenced(pattern: JamPattern): JamPattern {
  const out = {} as JamPattern;
  for (const lane of JAM_LANES) {
    out[lane] = new Array<JamLevel>(pattern[lane]?.length ?? 0).fill(0);
  }
  return out;
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
   */
  const groove = applyIntensity(jamGroove(jam), jam.intensity);
  // Muting the drummer is not the same as removing them: the table still has
  // to be the right width, because the engine checks it against the bar it
  // already runs. A silent drummer is every cell at zero.
  const drumsOff = !jamBand(jam, options.lineup).drums;
  const bar = drumsOff ? silenced(groove.bar) : groove.bar;
  const fill = jam.fills && groove.fill ? (drumsOff ? silenced(groove.fill) : groove.fill) : null;

  return {
    ticksPerBeat: groove.ticksPerBeat,
    beatsPerBar: groove.beatsPerBar,
    bar,
    // One switch, two cues: the fill on the last bar and the crash that
    // answers it on the next one. They are the same musical gesture, and a
    // crash with no fill in front of it sounds like a mistake.
    fill,
    formBars: formBars(jam.form),
    crashOnOne: jam.fills && !drumsOff,
    intensity: JAM_INTENSITY_GAIN[jam.intensity] ?? 1,
    kit: jam.kit || "room",
    bass: jamBassLine(jam, options.formBar ?? 0, options.lineup),
    practice: jam.practice ? practiceConfigFrom(jam.practice) : null,
    // A fill every four or eight bars as well as at the chorus end. Zero when
    // fills are off at all, rather than a number the engine would have to
    // remember not to act on: `fill` is already null there, and two switches
    // that have to agree is one too many.
    fillEvery: fill ? Math.max(0, Math.trunc(jam.fillEvery ?? 0)) : 0,
    keys: jamKeysLine(jam, options.formBar ?? 0, options.lineup, options.previousVoicing),
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
