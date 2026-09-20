/**
 * Trigger predicates for the six hints — pure functions, no React, no store.
 *
 * Everything a hint needs to decide "now is the moment" is passed in, so each
 * rule can be unit-tested with plain data (`triggers.test.ts`). The hooks in
 * `useAppHints` / the trigger sites only gather the inputs.
 */
import type { Preset } from "../../../types";

// ---------------------------------------------------------------------------
// drill-first-open — first time the user lands on the Drill tab.
// ---------------------------------------------------------------------------

export function shouldHintDrillFirstOpen(view: string): boolean {
  return view === "drill";
}

// ---------------------------------------------------------------------------
// preset-suggest — the same BPM + subdivision + beat groups practised in
// three different sessions, with no preset that already stores it.
// ---------------------------------------------------------------------------

/** The metronome setup a preset would capture. */
export type SetupSignature = {
  bpm: number;
  subdivision: number;
  groups: number[];
};

/** One `SetupSignature`, tagged with the app session it was practised in. */
export type SetupRecord = SetupSignature & { session: number };

/** Sessions the same setup must appear in before the hint offers a preset. */
export const PRESET_SUGGEST_SESSIONS = 3;

/** How many records `hintSetupHistory` keeps (oldest dropped first). */
export const SETUP_HISTORY_LIMIT = 60;

/** Stable identity for a setup — two setups are "the same" iff these match. */
export function setupKey(setup: SetupSignature): string {
  return `${setup.bpm}|${setup.subdivision}|${setup.groups.join(",")}`;
}

/** A preset stores this setup (its meter may be the legacy `timeSignature`). */
export function presetMatchesSetup(preset: Preset, setup: SetupSignature): boolean {
  const groups = preset.beatGroups ?? [preset.timeSignature];
  return setupKey({ bpm: preset.bpm, subdivision: preset.subdivision, groups }) === setupKey(setup);
}

/**
 * Append `record` to the history, keeping one entry per (session, setup) pair
 * and at most `SETUP_HISTORY_LIMIT` entries. Returns the original array
 * unchanged when the pair is already recorded, so callers can skip the write.
 */
export function recordSetup(history: SetupRecord[], record: SetupRecord): SetupRecord[] {
  const key = setupKey(record);
  if (history.some((h) => h.session === record.session && setupKey(h) === key)) {
    return history;
  }
  const next = [...history, record];
  return next.length > SETUP_HISTORY_LIMIT
    ? next.slice(next.length - SETUP_HISTORY_LIMIT)
    : next;
}

/** How many distinct sessions practised `setup`. */
export function sessionsWithSetup(history: SetupRecord[], setup: SetupSignature): number {
  const key = setupKey(setup);
  const sessions = new Set<number>();
  for (const h of history) if (setupKey(h) === key) sessions.add(h.session);
  return sessions.size;
}

export function shouldSuggestPreset(args: {
  current: SetupSignature;
  /** Includes the current session's record — the caller writes it first. */
  history: SetupRecord[];
  presets: Preset[];
}): boolean {
  const { current, history, presets } = args;
  if (presets.some((p) => presetMatchesSetup(p, current))) return false;
  return sessionsWithSetup(history, current) >= PRESET_SUGGEST_SESSIONS;
}

// ---------------------------------------------------------------------------
// coach-ask — the first mini-report the coach feed renders.
// ---------------------------------------------------------------------------

export function shouldHintCoachAsk(messageType: string): boolean {
  return messageType === "mini-report";
}

// ---------------------------------------------------------------------------
// zen-first — the first time Zen (fullscreen) is entered.
// ---------------------------------------------------------------------------

export function shouldHintZenFirst(isZen: boolean): boolean {
  return isZen;
}

// ---------------------------------------------------------------------------
// widget-discover — by the 5th session, still no floating widget.
// ---------------------------------------------------------------------------

/** The session on which the widget starts being suggested. */
export const WIDGET_DISCOVER_SESSION = 5;

export function shouldHintWidgetDiscover(args: {
  session: number;
  widgetOpened: boolean;
}): boolean {
  return args.session >= WIDGET_DISCOVER_SESSION && !args.widgetOpened;
}

// ---------------------------------------------------------------------------
// midi-plugged — a MIDI device is present but nothing is mapped to it.
// ---------------------------------------------------------------------------

export function shouldHintMidiPlugged(args: {
  devices: readonly unknown[];
  bindings: readonly unknown[];
}): boolean {
  return args.devices.length > 0 && args.bindings.length === 0;
}

// ---------------------------------------------------------------------------
// jam-arrangement — the first time the band arranges itself (JAM_KILLER A4).
// ---------------------------------------------------------------------------

/**
 * The chorus on which a `build` arrangement first stops repeating itself.
 *
 * Chorus one is held back and chorus two opens up, so two is the first bar
 * line at which a player hears the band decide something — which is the
 * moment the sentence "the band builds and breaks down on its own" stops
 * being a claim and starts being an explanation.
 */
export const JAM_BUILD_CHORUS = 2;

/**
 * `breakdown` and `ending` are the arrangement telling us itself; the chorus
 * is the fallback that works without it. Both are here rather than only the
 * first because the hint has to fire on a build that has not been given an
 * arrangement engine yet, and has to fire on the RIGHT bar once it has.
 */
export function shouldHintJamArrangement(args: {
  /** The chorus the form is on, or null while the band is not playing. */
  chorus: number | null;
  /** This bar is a breakdown, when the band knows how to say so. */
  breakdown?: boolean;
  /** This bar ends the form. */
  ending?: boolean;
}): boolean {
  if (args.breakdown || args.ending) return true;
  return (args.chorus ?? 0) >= JAM_BUILD_CHORUS;
}
