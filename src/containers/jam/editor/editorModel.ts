/**
 * The groove editor's model — everything the editor does to a pattern, with
 * no React in it.
 *
 * The one idea, straight from `src/jam/types.ts`: a groove is a table on the
 * tick grid. Rows are drums, columns are the ticks of one bar
 * (`beatsPerBar × ticksPerBeat`), a cell is how loud. Editing a groove is
 * therefore nothing more interesting than writing a number into a cell, and
 * everything below is a pure function so the component can stay a drawing of
 * this file rather than a second, subtly different copy of it.
 *
 * Every function returns a NEW pattern (or the same object when nothing
 * changed). Nothing here mutates its argument: the preset groove table is a
 * module-level constant elsewhere, and an editor that scribbled on it would
 * quietly rewrite the preset for the rest of the session.
 */

import type {
  JamCustomGroove,
  JamLane,
  JamLevel,
  JamPattern,
} from "../../../jam/types";
import { JAM_LANES } from "../../../jam/types";

/**
 * The subdivisions the engine understands, taken from the contract rather
 * than retyped, so this file cannot drift from `JamEngineConfig`.
 */
export type JamTicksPerBeat = JamCustomGroove["ticksPerBeat"];

/**
 * The lanes you can draw on. Crash is deliberately missing: today the crash
 * is the crash on the one, decided by the form and not by the table (see
 * `crashOnOne` in the contract). It still exists in every `JamPattern` this
 * file builds, all zeros, because the engine's type says it must.
 *
 * The order is the order they are drawn, top to bottom — high and busy at the
 * top, low and sparse below, which is how a drum chart is written.
 */
export type JamEditableLane = Exclude<JamLane, "crash">;

export const EDITABLE_LANES: readonly JamEditableLane[] = [
  "hat",
  "snare",
  "kick",
  "ride",
];

export const LANE_LABELS: Record<JamEditableLane, string> = {
  hat: "Hat",
  snare: "Snare",
  kick: "Kick",
  ride: "Ride",
};

/** How each level is said out loud — in the cell's `aria-label`, and in the legend. */
export const LEVEL_LABELS: Record<JamLevel, string> = {
  0: "off",
  1: "hit",
  2: "accent",
  3: "ghost",
};

/** What a musician calls each subdivision, for the caption over the grid. */
export const SUBDIVISION_NAMES: Record<JamTicksPerBeat, string> = {
  1: "quarters",
  2: "eighths",
  3: "triplets",
  4: "sixteenths",
  6: "sextuplets",
};

/**
 * How the ticks inside one beat are counted aloud. Index 0 is blank because
 * the beat's own number is drawn there instead.
 */
const TICK_LABELS: Record<JamTicksPerBeat, readonly string[]> = {
  1: [""],
  2: ["", "and"],
  3: ["", "trip", "let"],
  4: ["", "e", "and", "a"],
  6: ["", "trip", "let", "and", "trip", "let"],
};

// ---------------------------------------------------------------------------
// Reading a pattern
// ---------------------------------------------------------------------------

/** How many columns a pattern actually has — its longest lane. */
export function columnsOf(pattern: JamPattern): number {
  return JAM_LANES.reduce(
    (widest, lane) => Math.max(widest, pattern[lane]?.length ?? 0),
    0,
  );
}

/** The level in one cell, 0 for anything the pattern does not have. */
export function cellAt(
  pattern: JamPattern,
  lane: JamLane,
  tick: number,
): JamLevel {
  return pattern[lane]?.[tick] ?? 0;
}

/** The sub-tick's name inside its beat: "", "trip", "let" for triplets. */
export function tickLabel(sub: number, ticksPerBeat: JamTicksPerBeat): string {
  return TICK_LABELS[ticksPerBeat][sub] ?? "";
}

/**
 * The middle tick of a triplet, which a shuffle leaves empty. Drawn quieter
 * than its neighbours so the swing reads off the page at a glance — still
 * clickable, because a groove that fills it is a perfectly good groove.
 *
 * True for tick 1 of every triplet, which in sextuplets means ticks 1 and 4.
 */
export function isShuffleTick(
  sub: number,
  ticksPerBeat: JamTicksPerBeat,
): boolean {
  return (ticksPerBeat === 3 || ticksPerBeat === 6) && sub % 3 === 1;
}

/**
 * What a screen reader reads out for one cell:
 * "Snare, beat 2, tick 3: accent". Position and state in every cell, so the
 * grid is navigable without seeing it — the labels do the work that sighted
 * users get from the picture.
 */
export function cellLabel(
  lane: JamEditableLane,
  tick: number,
  ticksPerBeat: JamTicksPerBeat,
  level: JamLevel,
): string {
  const beat = Math.floor(tick / ticksPerBeat) + 1;
  const sub = (tick % ticksPerBeat) + 1;
  return `${LANE_LABELS[lane]}, beat ${beat}, tick ${sub}: ${LEVEL_LABELS[level]}`;
}

/** The line over the grid: "4 beats in triplets · the columns follow the meter". */
export function meterCaption(
  beatsPerBar: number,
  ticksPerBeat: JamTicksPerBeat,
): string {
  return `${beatsPerBar} beats in ${SUBDIVISION_NAMES[ticksPerBeat]} · the columns follow the meter`;
}

// ---------------------------------------------------------------------------
// Changing a pattern
// ---------------------------------------------------------------------------

/**
 * One click on a cell: off → hit → accent → ghost → off. Shift-click walks
 * the same ring the other way, so a mis-click costs one keystroke instead of
 * three.
 */
export function cycleLevel(level: JamLevel, backwards = false): JamLevel {
  return ((level + (backwards ? 3 : 1)) % 4) as JamLevel;
}

/**
 * Write one cell. Returns the pattern unchanged — the same object, so React
 * can skip the render — when the level is already what was asked for, or when
 * the tick is off the end of the bar.
 */
export function setCell(
  pattern: JamPattern,
  lane: JamLane,
  tick: number,
  level: JamLevel,
): JamPattern {
  const row = pattern[lane];
  if (!row || tick < 0 || tick >= row.length) return pattern;
  if (row[tick] === level) return pattern;
  const next = { ...pattern };
  const copy = row.slice();
  copy[tick] = level;
  next[lane] = copy;
  return next;
}

/** A silent bar of the right width, every lane present, every cell off. */
export function emptyPattern(
  beatsPerBar: number,
  ticksPerBeat: JamTicksPerBeat,
): JamPattern {
  const columns = Math.max(0, Math.round(beatsPerBar * ticksPerBeat));
  const pattern = {} as JamPattern;
  for (const lane of JAM_LANES) {
    pattern[lane] = new Array<JamLevel>(columns).fill(0);
  }
  return pattern;
}

/**
 * Force a pattern to the width the meter says it should be, filling in
 * missing lanes and cells and dropping anything past the end.
 *
 * This exists because a `JamCustomGroove` can arrive from the store, written
 * by an older build with a different meter. The editor would otherwise draw a
 * ragged grid, or crash reading a lane that is not there; the engine would
 * refuse the whole config. One pass through here and the table is the shape
 * its own header claims.
 */
export function normalizePattern(
  pattern: JamPattern | null | undefined,
  beatsPerBar: number,
  ticksPerBeat: JamTicksPerBeat,
): JamPattern {
  const next = emptyPattern(beatsPerBar, ticksPerBeat);
  if (!pattern) return next;
  const columns = next.kick.length;
  for (const lane of JAM_LANES) {
    const row = pattern[lane];
    if (!row) continue;
    const shared = Math.min(row.length, columns);
    for (let i = 0; i < shared; i++) next[lane][i] = row[i] ?? 0;
  }
  return next;
}

/**
 * The same groove at a different subdivision (plan §4.1).
 *
 * A hit keeps the moment in the bar it was played at. Tick `i` sits at
 * `(i % from) / from` of the way through its beat; it survives if — and only
 * if — the new grid has a column at exactly that fraction.
 *
 * Finer keeps everything and gains empty columns: 8ths → 16ths moves the
 * "and" from column 1 to column 2 and leaves 1 and 3 empty. Coarser drops the
 * hits that fall between the new columns: 16ths → 8ths keeps the beat and the
 * "and" and loses the "e" and the "a".
 *
 * The rule is positional rather than nearest-column on purpose. Snapping the
 * "and" of an 8ths groove onto the nearest triplet would hand back a groove
 * that plays differently from the one you drew, without saying so; dropping
 * it is at least honest, and the column it left is right there to fill in.
 */
export function resizePattern(
  pattern: JamPattern,
  from: JamTicksPerBeat,
  to: JamTicksPerBeat,
): JamPattern {
  if (from === to) return pattern;
  const beats = Math.max(1, Math.round(columnsOf(pattern) / from));
  const next = emptyPattern(beats, to);
  const columns = next.kick.length;
  for (const lane of JAM_LANES) {
    const row = pattern[lane];
    if (!row) continue;
    for (let i = 0; i < row.length; i++) {
      const level = row[i];
      if (!level) continue;
      const moved = ((i % from) * to) / from;
      if (!Number.isInteger(moved)) continue;
      const target = Math.floor(i / from) * to + moved;
      if (target < columns) next[lane][target] = level;
    }
  }
  return next;
}

/** `resizePattern` for a whole groove: the bar, the fill, and the header. */
export function resizeGroove(
  groove: JamCustomGroove,
  ticksPerBeat: JamTicksPerBeat,
): JamCustomGroove {
  if (groove.ticksPerBeat === ticksPerBeat) return groove;
  return {
    ...groove,
    ticksPerBeat,
    bar: resizePattern(groove.bar, groove.ticksPerBeat, ticksPerBeat),
    fill: groove.fill
      ? resizePattern(groove.fill, groove.ticksPerBeat, ticksPerBeat)
      : null,
  };
}

/**
 * What a preset groove looks like from here. Structural rather than imported
 * so the editor does not have to wait on `src/jam/grooves.ts` landing, and
 * does not care what else a preset carries (its id, the feels it suits).
 */
export type PresetGrooveLike = {
  name: string;
  beatsPerBar: number;
  ticksPerBeat: JamTicksPerBeat;
  bar: JamPattern;
  fill?: JamPattern | null;
};

/**
 * "Start from this one and make it yours" — a deep copy of a preset groove as
 * an editable one. The copy is the whole point: presets are module constants
 * shared by every jam, and the first cell you clicked would otherwise change
 * the preset for all of them.
 */
export function fromGroove(groove: PresetGrooveLike): JamCustomGroove {
  const { beatsPerBar, ticksPerBeat } = groove;
  return {
    name: groove.name,
    beatsPerBar,
    ticksPerBeat,
    bar: normalizePattern(groove.bar, beatsPerBar, ticksPerBeat),
    fill: groove.fill
      ? normalizePattern(groove.fill, beatsPerBar, ticksPerBeat)
      : null,
  };
}
