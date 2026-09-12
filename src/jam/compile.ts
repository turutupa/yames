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
import { grooveById } from "./grooves";
import { bassLineFor, bassStyleForGroove } from "./bassline";
import { bassChordFrom } from "./bandChord";
import { chordsForForm, parseKey } from "./harmony";
import { practiceConfigFrom } from "./practice";
import { JAM_INTENSITY_GAIN, JAM_LANES } from "./types";
import type { Key } from "./harmony";
import type {
  Jam,
  JamEngineConfig,
  JamLevel,
  JamPattern,
  JamBassLine,
} from "./types";

/** A jam with no readable key is read as C major rather than as no key. */
const DEFAULT_KEY: Key = { root: 0, mode: "major" };

export type JamBand = { drums: boolean; bass: boolean };

/** Drums and nobody else, for a caller that has no lineup to hand. */
const DRUMS_ONLY: JamBand = { drums: true, bass: false };

export type JamCompileOptions = {
  /**
   * Which bar of the chorus to compile the BASS for, 0-based. Everything else
   * in the config is the same on every bar. Default 0, which is what a jam
   * that has not started yet is about to play.
   */
  formBar?: number;
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
 * The groove a jam plays — the one drawn in the editor if there is one, the
 * preset otherwise, with the feel already applied to whichever it is.
 *
 * A custom groove is not a variant of the preset it started from; it replaces
 * it. Feel and intensity still sit on top, because those are how the same
 * groove is played rather than which groove it is.
 */
export function jamGroove(jam: Jam): {
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

/** Every lane at zero, the same width as `pattern`. */
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
  const chords = chordsForForm(jam.form.kind, bars, key);
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

export function compileJam(jam: Jam, options: JamCompileOptions = {}): JamEngineConfig {
  const groove = jamGroove(jam);
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
  };
}

/** The meter a jam runs in — what the UI sets on the engine before sending. */
export function jamMeter(jam: Jam): { beatsPerBar: number; ticksPerBeat: 1 | 2 | 3 | 4 | 6 } {
  const groove = jamGroove(jam);
  return { beatsPerBar: groove.beatsPerBar, ticksPerBeat: groove.ticksPerBeat };
}
