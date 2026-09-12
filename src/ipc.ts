/**
 * The IPC both platforms have.
 *
 * Anything that only a desktop build can answer — coach, evaluation, voice,
 * MIDI, window and widget control, the updater — lives in `ipc.desktop.ts`
 * instead, and is imported only from modules the mobile bundle never reaches.
 * Nothing is re-exported across that line: an import from here is a promise
 * that the command exists on a phone.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { load } from "@tauri-apps/plugin-store";
import type { AppState, BeatEvent, InstrumentId, SpeedRamp, Subdivision } from "./types";
import { IS_MOBILE } from "./platform";
import { openUrlNative } from "./mobile/native";

// Shared store instance (lazy singleton)
let _store: Awaited<ReturnType<typeof load>> | null = null;
async function getStore() {
  if (!_store) _store = await load("settings.json", { autoSave: true, defaults: {} });
  return _store;
}

export async function storeSave(key: string, value: unknown): Promise<void> {
  const store = await getStore();
  await store.set(key, value);
}

export async function storeLoad<T>(key: string): Promise<T | undefined> {
  const store = await getStore();
  return store.get<T>(key);
}

export async function openUrl(url: string): Promise<void> {
  // The desktop `open_url` command spawns `open` / `start` / `xdg-open`, and
  // there is no process to spawn on a phone — M01 left its mobile arm a no-op
  // and the About and support links went nowhere. Routing them through the
  // yames-mobile plugin's `Intent.ACTION_VIEW` is a smaller diff than adding
  // a second opener plugin, and it folds away on desktop: `IS_MOBILE` is a
  // build-time constant, so this branch is not in a desktop bundle at all.
  if (IS_MOBILE) return openUrlNative(url);
  return invoke("open_url", { url });
}

export async function getState(): Promise<AppState> {
  return invoke<AppState>("get_state");
}

export async function setBpm(bpm: number): Promise<void> {
  return invoke("set_bpm", { bpm });
}

export async function setSubdivision(subdivision: Subdivision): Promise<void> {
  return invoke("set_subdivision", { subdivision });
}

export async function togglePlayback(): Promise<void> {
  return invoke("toggle_playback");
}

export async function setPlaying(playing: boolean): Promise<void> {
  return invoke("set_playing", { playing });
}

export async function setTheme(theme: string): Promise<void> {
  return invoke("set_theme", { theme });
}

/**
 * Update the player's instrument. The Rust backend swaps to the matching
 * `InstrumentProfile` (D0): refractory floor, cluster window, onset cap,
 * activity silence threshold, and coach vocabulary all update. Effective
 * for the *next* DSP segment — current detection state is not rewound
 * mid-segment.
 */
export async function setInstrument(instrument: InstrumentId): Promise<void> {
  return invoke("set_instrument", { instrument });
}

export async function setVolume(volume: number): Promise<void> {
  return invoke("set_volume", { volume });
}

export async function setSoundType(soundType: string): Promise<void> {
  return invoke("set_sound_type", { soundType });
}

export async function setBeatGroups(groups: number[]): Promise<void> {
  return invoke("set_beat_groups", { groups });
}

export async function setFreeMode(enabled: boolean): Promise<void> {
  return invoke("set_free_mode", { enabled });
}

export function onBeat(callback: (event: BeatEvent) => void) {
  return listen<BeatEvent>("beat", (e) => callback(e.payload));
}

export function onStateChange(callback: (state: AppState) => void) {
  return listen<AppState>("state-changed", (e) => callback(e.payload));
}

export async function configureSpeedRamp(config: {
  startBpm: number;
  targetBpm: number;
  increment: number;
  decrement: number;
  barsPerStep: number;
  beatsPerBar: number;
  mode: string;
  cyclic: boolean;
  warmupBeats?: number;
  aggressiveness?: string;
  /**
   * Ticks per beat for the drill. Optional and passed through as null when
   * absent, so a caller with no opinion — a setlist step, MainWindow restoring
   * a preset — leaves the setting where the user put it rather than silently
   * resetting the drill to quarter notes.
   */
  subdivision?: number;
}): Promise<void> {
  return invoke("configure_speed_ramp", {
    startBpm: config.startBpm,
    targetBpm: config.targetBpm,
    increment: config.increment,
    decrement: config.decrement,
    barsPerStep: config.barsPerStep,
    beatsPerBar: config.beatsPerBar,
    mode: config.mode,
    cyclic: config.cyclic,
    warmupBeats: config.warmupBeats ?? 4,
    aggressiveness: config.aggressiveness ?? null,
    subdivision: config.subdivision ?? null,
  });
}

export async function startSpeedRamp(): Promise<void> {
  return invoke("start_speed_ramp");
}

export async function startSpeedRampFrom(step: number, bpm: number, bar: number = 0): Promise<void> {
  return invoke("start_speed_ramp_from", { step, bpm, bar });
}

export async function stopSpeedRamp(): Promise<void> {
  return invoke("stop_speed_ramp");
}

export function onRampStep(callback: (ramp: SpeedRamp) => void) {
  return listen<SpeedRamp>("ramp-step", (e) => callback(e.payload));
}

export async function setActiveTab(tab: string): Promise<void> {
  return invoke("set_active_tab", { tab });
}

export async function getActiveTab(): Promise<string> {
  return invoke<string>("get_active_tab");
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------
import type { Preset } from "./types";

export async function listPresets(): Promise<Preset[]> {
  return invoke<Preset[]>("list_presets");
}

export async function savePreset(preset: Preset): Promise<void> {
  return invoke("save_preset", { preset });
}

export async function deletePreset(id: string): Promise<void> {
  return invoke("delete_preset", { id });
}

export async function reorderPresets(ids: string[]): Promise<void> {
  return invoke("reorder_presets", { ids });
}

// ---------------------------------------------------------------------------
// Preset setlists (U9)
// ---------------------------------------------------------------------------
import type { Setlist } from "./types";

/**
 * Setlists live beside presets: same `settings.json` store, own `setlists` key.
 *
 * `commands.rs` keeps presets under `presets` there and Rust owns the
 * read-modify-write; a setlist has no engine-side reader, so the same four
 * operations are done here through the store plugin instead of adding
 * commands Rust would never call itself. The array *is* the order — same
 * contract as `reorder_presets` — so the UI can drag setlists around without
 * a sort key.
 */
const SETLISTS_KEY = "setlists";

/**
 * What setlists were saved under while they were called chains.
 *
 * The rename went all the way down, and the key is part of "all the way
 * down" — but a key is also where somebody's work lives, so the old one is
 * read once and carried over rather than abandoned. It is left in place
 * afterwards: it costs a few hundred bytes in `settings.json` and it is the
 * difference between an older build finding a routine and finding nothing.
 */
const LEGACY_CHAINS_KEY = "chains";

/**
 * Arm a count-in of `beats` beats before whatever starts next.
 *
 * The drill arms one from its own setting when a ramp starts; this is how a
 * setlist asks for the same thing between steps (U9.2). 0 disarms. The engine
 * caps it at 8.
 */
/** Which beats carry the accent. See `AccentMode` in the engine. */
export async function setAccentMode(mode: "groups" | "all" | "none"): Promise<void> {
  return invoke("set_accent_mode", { mode });
}

export async function armCountIn(beats: number): Promise<void> {
  return invoke("arm_count_in", { beats: Math.max(0, Math.min(8, Math.round(beats))) });
}

export async function listSetlists(): Promise<Setlist[]> {
  const setlists = await storeLoad<Setlist[]>(SETLISTS_KEY);
  if (Array.isArray(setlists)) return setlists;

  // Nothing under the new key. Anyone who used this before the rename has
  // their routines under the old one, so bring them across — once, because
  // the write above makes the branch unreachable next time.
  const legacy = await storeLoad<Setlist[]>(LEGACY_CHAINS_KEY);
  if (!Array.isArray(legacy) || legacy.length === 0) return [];
  await storeSave(SETLISTS_KEY, legacy);
  return legacy;
}

/** Upsert by id, keeping the existing position. New setlists go last. */
export async function saveSetlist(setlist: Setlist): Promise<void> {
  const setlists = await listSetlists();
  const at = setlists.findIndex((c) => c.id === setlist.id);
  if (at >= 0) setlists[at] = setlist;
  else setlists.push(setlist);
  await storeSave(SETLISTS_KEY, setlists);
}

export async function deleteSetlist(id: string): Promise<void> {
  const setlists = await listSetlists();
  await storeSave(
    SETLISTS_KEY,
    setlists.filter((c) => c.id !== id),
  );
}

/**
 * Ids not in `ids` keep their relative order at the end, so a reorder issued
 * against a stale list cannot silently drop a setlist saved in another window.
 */
export async function reorderSetlists(ids: string[]): Promise<void> {
  const setlists = await listSetlists();
  const byId = new Map(setlists.map((c) => [c.id, c]));
  const ordered: Setlist[] = [];
  for (const id of ids) {
    const setlist = byId.get(id);
    if (setlist) {
      ordered.push(setlist);
      byId.delete(id);
    }
  }
  for (const setlist of setlists) if (byId.has(setlist.id)) ordered.push(setlist);
  await storeSave(SETLISTS_KEY, ordered);
}

// ---------------------------------------------------------------------------
// Audio Output Device
// ---------------------------------------------------------------------------
import type { AudioOutputDevice } from "./types";

export async function listAudioOutputDevices(): Promise<AudioOutputDevice[]> {
  return invoke<AudioOutputDevice[]>("list_audio_output_devices");
}

export async function setAudioOutputDevice(deviceName: string | null): Promise<void> {
  return invoke("set_audio_output_device", { deviceName });
}

export function onAudioDevicesChanged(callback: (devices: AudioOutputDevice[]) => void) {
  return listen<AudioOutputDevice[]>("audio-devices-changed", (e) => callback(e.payload));
}

/**
 * The audio thread could not open or start the output stream, so the
 * metronome is silent and the transport has already been reset. The payload
 * is the backend's own reason string — raw, untranslated and meant for a bug
 * report; `classifyAudioError` turns it into something a musician can act on.
 */
export function onAudioError(callback: (reason: string) => void) {
  return listen<string>("audio-error", (e) => callback(e.payload));
}

// ---------------------------------------------------------------------------
// Drill runs (UI_DECISIONS U3.3)
//
// Their own store, not a field on SavedSession: a saved session needs a
// SessionReport, which needs the mic, and most drills are played without it.
// See `DrillRun` in `src-tauri/src/session.rs`.
// ---------------------------------------------------------------------------

import type { DrillRun } from "./types";

export async function saveDrillRun(run: DrillRun): Promise<void> {
  return invoke("save_drill_run", { run });
}

/** Newest first, the same order `getSessionHistory` returns. */
export async function getDrillRuns(): Promise<DrillRun[]> {
  return invoke<DrillRun[]>("get_drill_runs");
}

