/**
 * Beat-grouping helpers — the single source of truth for turning a
 * `beatGroups` array into everything the UI needs from it.
 *
 * Before this module the same four one-liners (sum the groups, find the
 * matching preset, cycle to the next one, derive the accent positions)
 * were re-implemented in MeterPresets, GroupEditor, FloatingWidget,
 * FullscreenView, MainWindow and useActionDispatcher — six copies, three
 * of which had already drifted.
 *
 * Note on *live* accents: while the metronome is playing the UI must use
 * `BeatEvent.isAccent` from the engine, not `accentPositions`. The engine
 * owns the accent decision (it also handles the speed-ramp bar), and
 * re-deriving it here would re-introduce the drift this module exists to
 * remove. `accentPositions` is for the STATIC markers drawn while
 * stopped.
 *
 * FREE mode means "N equal beats, no accent structure" — Rust checks it
 * first in `accent_for`, so every helper here that speaks about accents
 * takes a `freeMode` flag and agrees.
 */
import {
  METER_PRESETS,
  METER_VARIANTS,
  nextFreeBeatCount,
  prevFreeBeatCount,
} from "../constants/metronome";
import type { Preset } from "../types";

/** Total beats in the bar. Mirrors Rust's `sum(beat_groups)`. */
export function meterTotal(groups: number[] | undefined | null): number {
  if (!groups || groups.length === 0) return 0;
  return groups.reduce((a, b) => a + b, 0);
}

/**
 * Stable identity for a grouping, for React dependency arrays and map
 * keys. `beatGroups` arrives as a fresh array on every `state-changed`
 * event, so depending on the array reference re-runs effects on every
 * tick; depending on `meterKey(groups)` re-runs them only on a real
 * meter change.
 */
export function meterKey(groups: number[] | undefined | null): string {
  return (groups ?? []).join(",");
}

/**
 * Bar-local positions that open a group, i.e. the accented beats.
 * `[3, 2, 2]` → `{0, 3, 5}`.
 *
 * Empty in FREE mode: there is no accent structure to draw, matching
 * `accent_for`'s free-mode-first branch in `engine.rs`.
 */
export function accentPositions(
  groups: number[] | undefined | null,
  freeMode = false,
): Set<number> {
  const positions = new Set<number>();
  if (freeMode) return positions;
  let cursor = 0;
  for (const g of groups ?? []) {
    positions.add(cursor);
    cursor += g;
  }
  return positions;
}

/**
 * Index into `METER_PRESETS` of the preset `groups` belongs to, or -1.
 *
 * Variant-aware: `[2, 3]` is a grouping of the 5/4 preset, so it reports
 * 5/4 rather than "no match". The cycle helpers rely on this — without
 * it, cycling from a variant always restarted at 4/4.
 */
export function findMeterPresetIndex(groups: number[] | undefined | null): number {
  const key = meterKey(groups);
  if (!key) return -1;
  return METER_PRESETS.findIndex((preset) => {
    if (meterKey(preset.groups) === key) return true;
    return (METER_VARIANTS[preset.label] ?? []).some((v) => meterKey(v) === key);
  });
}

/** The preset `groups` belongs to (variant-aware), or undefined. */
export function findMeterPreset(
  groups: number[] | undefined | null,
): (typeof METER_PRESETS)[number] | undefined {
  const idx = findMeterPresetIndex(groups);
  return idx === -1 ? undefined : METER_PRESETS[idx];
}

/**
 * Label to show for `groups` — the preset label when it is one of ours
 * (variants included, so `[2, 3]` still reads "5/4"), otherwise the
 * `n/4` fallback for a hand-built grouping.
 */
export function meterLabel(groups: number[] | undefined | null): string {
  return findMeterPreset(groups)?.label ?? `${meterTotal(groups)}/4`;
}

/**
 * The preset groups one step from `groups` in `dir` (+1 / -1).
 *
 * Cycling always lands on a preset's canonical grouping, never on a
 * variant: stepping forward from the 7/8 variant `[2, 3, 2]` goes to
 * 8/8, not back through the other 7/8 groupings.
 */
export function cycleMeterPreset(
  groups: number[] | undefined | null,
  dir: 1 | -1,
): number[] {
  const n = METER_PRESETS.length;
  const current = findMeterPresetIndex(groups);
  // Unknown grouping: land on 4/4 rather than jumping somewhere
  // arbitrary. Looked up by LABEL, not by index: this used to read
  // `METER_PRESETS[0]`, which was 4/4 only by accident of the list
  // being ordered 4/4, 3/4, 2/4, … Sorting the row ascending would
  // have silently moved this landing spot to 2/4.
  if (current === -1) {
    return (METER_PRESETS.find((p) => p.label === "4/4") ?? METER_PRESETS[0]).groups;
  }
  return METER_PRESETS[(current + dir + n) % n].groups;
}

/**
 * One step of the "next / previous meter" affordance — the shared body of
 * the widget's meter button, the Zen meter button, and the sig-next /
 * sig-prev hotkeys in both dispatchers.
 *
 * In FREE mode a step changes the BEAT COUNT (wrapping 16 → 1 and
 * 1 → 16); otherwise it walks the preset list. All five call sites had
 * their own copy of this branch.
 */
export function stepMeter(
  groups: number[] | undefined | null,
  freeMode: boolean,
  dir: 1 | -1,
): number[] {
  if (freeMode) {
    const total = meterTotal(groups);
    return [dir === 1 ? nextFreeBeatCount(total) : prevFreeBeatCount(total)];
  }
  return cycleMeterPreset(groups, dir);
}

/**
 * The grouping a saved preset should load as.
 *
 * Old presets carry only `timeSignature` and no `beatGroups`, and a
 * `timeSignature` of 0 is the retired "Never accent" option. Mapping it
 * to `[0]` produced a value Rust rejects — and the rejected promise then
 * aborted the rest of `handleLoadPreset`, so sound, volume, ramp and
 * view silently never applied. 0 becomes `[4]`, matching the migration
 * (see `presetFreeMode`, which turns the same preset into FREE mode),
 * matching `commands.rs::restore_beat_groups`.
 */
export function presetBeatGroups(preset: Preset): number[] {
  if (preset.beatGroups && preset.beatGroups.length > 0) {
    return preset.beatGroups;
  }
  const ts = preset.timeSignature;
  if (!Number.isFinite(ts) || ts < 1 || ts > 16) return [4];
  return [Math.floor(ts)];
}

/**
 * Whether a saved preset should load in FREE mode.
 *
 * Explicit `freeMode` wins. Otherwise a legacy preset saved under the
 * retired "Never accent" option (`timeSignature: 0`, no `beatGroups`)
 * restores as FREE mode — the modern spelling of "no accents" — rather
 * than becoming a silently accented 4/4. Same rule as the Rust store
 * migration in `commands.rs::restore_beat_groups`.
 */
export function presetFreeMode(preset: Preset): boolean {
  if (typeof preset.freeMode === "boolean") return preset.freeMode;
  const hasGroups = !!preset.beatGroups && preset.beatGroups.length > 0;
  return preset.timeSignature === 0 && !hasGroups;
}
