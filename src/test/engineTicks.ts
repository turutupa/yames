/**
 * Beat events shaped the way `engine.rs` shapes them.
 *
 * WHY THIS EXISTS. `isDownbeat` on a beat event is `sub_count == 0` — "this
 * tick is a whole beat and not a subdivision" — and it is therefore true on
 * EVERY whole beat of the bar. A bar opens on `isDownbeat && measureBeat ===
 * 0`, which is the pair the engine itself tests when it opens one. Five
 * fixtures across the app wrote `isDownbeat: measureBeat === 0` instead,
 * building a stream no engine can emit: `isDownbeat` false on beats two,
 * three and four. A suite full of those cannot tell "a whole beat" from "the
 * top of a bar", which is exactly the confusion that made a setlist step set
 * to eight bars last eight beats, and it would let the same class back in the
 * moment anyone repeated the pattern.
 *
 * So there is one builder, and it enforces the contract:
 *
 *   - `isDownbeat` is `subdivision === 0`, never anything about the bar.
 *   - `accentLevel` comes from `accentPositions` in `utils/meter.ts`, the
 *     mirror of `accent_for` the app's own dots are drawn from — so 7/8
 *     grouped 2+2+3 accents beats 0, 2 and 4, and a group start inside a bar
 *     is a MIDDLE accent and not a bar line.
 *   - `isAccent` is `accentLevel > 0`, as the engine derives it.
 *   - `measureBeat` is bar-local and wraps at the meter's own total, so
 *     "which tick opens a bar" is a fact of the stream rather than something
 *     a test asserts by hand.
 *
 * The model is the driver W26 wrote in `setlist/runtime.test.ts`; this is
 * that driver with the setlist taken out of it.
 */
import { accentPositions, meterTotal } from "../utils/meter";
import type { BeatEvent } from "../types";

/** Everything a caller may pin. Anything left out gets the engine's resting value. */
export type EngineTickSpec = {
  /** The click's own beat counter, which never resets on a meter change. */
  beat?: number;
  /** Bar-local position. Defaults to a 4/4 cycle off `beat`. */
  measureBeat?: number;
  /** Which subdivision of the beat this tick is. 0 is the whole beat. */
  subdivision?: number;
  /** The bar's grouping, which is what decides the accents. */
  beatGroups?: number[];
  formBar?: number;
  chorus?: number;
  bandState?: BeatEvent["bandState"];
  songBar?: number | null;
  songTick?: number;
  songPass?: number;
  songCountIn?: boolean;
};

/**
 * What the engine reports for a tick at `measureBeat` in a bar grouped
 * `beatGroups`: 2 the bar's own opening, 1 a group start inside it, 0 a plain
 * beat — and 0 for every subdivision tick, whatever it sits on.
 */
export function engineAccentLevel(
  beatGroups: number[],
  measureBeat: number,
  subdivision = 0,
): 0 | 1 | 2 {
  if (subdivision !== 0) return 0;
  return accentPositions(beatGroups).get(measureBeat) ?? 0;
}

/** One tick, in the engine's shape. */
export function engineTick(spec: EngineTickSpec = {}): BeatEvent {
  const beat = spec.beat ?? 0;
  const beatGroups = spec.beatGroups ?? [4];
  // `|| 4`: an empty grouping is not a bar, and a modulo by nothing is NaN.
  const measureBeat = spec.measureBeat ?? beat % (meterTotal(beatGroups) || 4);
  const subdivision = spec.subdivision ?? 0;
  const accentLevel = engineAccentLevel(beatGroups, measureBeat, subdivision);
  return {
    beat,
    measureBeat,
    // NOT `measureBeat === 0`. See the note at the top of this file.
    isDownbeat: subdivision === 0,
    subdivision,
    accentLevel,
    isAccent: accentLevel > 0,
    formBar: spec.formBar ?? 0,
    chorus: spec.chorus ?? 1,
    bandState: spec.bandState ?? "full",
    songBar: spec.songBar ?? null,
    songTick: spec.songTick ?? 0,
    songPass: spec.songPass ?? 0,
    songCountIn: spec.songCountIn ?? false,
  };
}

/**
 * Does this tick OPEN a bar?
 *
 * The one question `isDownbeat` does not answer, worked out here the way
 * `useSetlistRunner` and `usePlaybackClock` work it out — and the way
 * `engine.rs` does when it opens one.
 */
export function isBarStart(tick: BeatEvent): boolean {
  return tick.isDownbeat && tick.measureBeat === 0;
}

export type EngineStreamOptions = {
  /** How many WHOLE beats to emit. */
  beats: number;
  beatGroups?: number[];
  /** Ticks per beat. 1 is no subdivision, 4 is sixteenths on a quarter. */
  subdivisions?: number;
  /** Where in the bar the stream starts, for a click joined mid-bar. */
  startAtBeatInBar?: number;
  /** The beat counter's first value. It does not reset when a bar does. */
  startAtBeat?: number;
};

/**
 * A run of ticks, `measureBeat` cycling and wrapping exactly as the engine
 * wraps it. Subdivision ticks are included, because a test that drops them
 * silently is a test that never finds out whether the code under it does.
 */
export function engineStream(options: EngineStreamOptions): BeatEvent[] {
  const beatGroups = options.beatGroups ?? [4];
  const total = meterTotal(beatGroups) || 4;
  const subdivisions = Math.max(1, options.subdivisions ?? 1);
  const ticks: BeatEvent[] = [];
  let measureBeat = (options.startAtBeatInBar ?? 0) % total;
  let beat = options.startAtBeat ?? 0;
  for (let i = 0; i < options.beats; i++) {
    for (let sub = 0; sub < subdivisions; sub++) {
      ticks.push(engineTick({ beat, measureBeat, subdivision: sub, beatGroups }));
    }
    beat += 1;
    measureBeat = (measureBeat + 1) % total;
  }
  return ticks;
}
