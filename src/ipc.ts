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

/**
 * Move everything the app plays — the click, the band, take playback, the
 * coach's voice — to another pair of the device's outputs. `pair` is
 * 0-based: 0 is "Outputs 1-2", 1 is "Outputs 3-4".
 *
 * Resolves with the pair actually in effect. Remembered against the device
 * it was chosen for, so switching back to the interface brings its outputs
 * back with it.
 */
export async function setAudioOutputPair(pair: number): Promise<number> {
  return invoke<number>("set_audio_output_pair", { pair });
}

export function onAudioDevicesChanged(callback: (devices: AudioOutputDevice[]) => void) {
  return listen<AudioOutputDevice[]>("audio-devices-changed", (e) => callback(e.payload));
}

/**
 * The chosen device turned out to have fewer outputs than it advertised,
 * so the app is playing on the pair named in the payload (which is 0 —
 * outputs 1-2 — in every case the backend can produce today). The screen
 * moves the picker back and says why.
 */
export function onAudioOutputPairFallback(callback: (pair: number) => void) {
  return listen<number>("audio-output-pair-fallback", (e) => callback(e.payload));
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

// ---------------------------------------------------------------------------
// Jam (plans/JAM_MODE.md, plans/tasks/jam/BRIEF.md)
// ---------------------------------------------------------------------------

import type { Jam, JamEngineConfig, JamPositionCommand } from "./jam/types";

/**
 * Jams live beside presets and setlists in the same `settings.json` store,
 * under their own key. Read-modify-write like setlists: a jam has no
 * engine-side reader, the engine only ever sees the compiled table.
 */
const JAMS_KEY = "jams";

/**
 * `undefined` when nothing was ever saved under the key, so the caller can
 * seed the starter jams exactly once. An empty array means the user deleted
 * them all, and they stay deleted.
 */
export async function listJams(): Promise<Jam[] | undefined> {
  const jams = await storeLoad<Jam[]>(JAMS_KEY);
  return Array.isArray(jams) ? jams : undefined;
}

/** The whole list, in order. The UI owns ordering, the store keeps it. */
export async function saveJams(jams: Jam[]): Promise<void> {
  await storeSave(JAMS_KEY, jams);
}

/**
 * Hand the engine a compiled jam, or `null` to take it away and play the
 * plain click again. The UI sets the subdivision and the beat groups FIRST;
 * the engine checks the product against its bar and plays the click if they
 * disagree.
 */
export async function setJam(config: JamEngineConfig | null): Promise<void> {
  return jamQueue.table(config);
}

/**
 * Move the form: jump to a bar, or loop a range of bars. The engine applies
 * it at the next bar line, so the change lands where a musician expects it.
 *
 * Through the same queue as `setJam`, so a jump sent after a new form is
 * checked against that form and not the one it replaces.
 */
export async function setJamPosition(command: JamPositionCommand): Promise<void> {
  return jamQueue.position(command);
}

/** What to decode ahead of time. See `warmJam`. */
export type JamWarmRequest = {
  /** Jams the screen expects to open, compiled. */
  configs?: JamEngineConfig[];
  /** Every kit the app ships — the kit picker is open. */
  kits?: boolean;
  /** Every recorded bass — the bass dropdown is about to open. */
  bassVoices?: boolean;
  /** Every recorded keys voice — the keys dropdown is about to open. */
  keysVoices?: boolean;
};

/**
 * Decode sounds before anybody asks for them, so choosing a jam, a kit or a
 * voice plays at once instead of after a load.
 *
 * Fire and forget. It installs nothing, so it does not wait in `jamQueue`,
 * and a failure only means the load happens later, when the sound is really
 * asked for — which is where an error is worth showing. The same request
 * twice is cheap: everything lands in a cache and the second pass finds it.
 */
export function warmJam(request: JamWarmRequest): void {
  void invoke("warm_jam", {
    configs: request.configs ?? [],
    kits: !!request.kits,
    bassVoices: !!request.bassVoices,
    keysVoices: !!request.keysVoices,
  }).catch(() => {});
}

/**
 * Let the decoded band go, and say whether it went.
 *
 * The other end of `warmJam`, and a phone's alone: a band that has been
 * decoded costs tens of megabytes for as long as anything holds it, and on a
 * phone that is what decides whether the app survives being put down (M10).
 * The loaded table goes first and the two caches after it, all on a blocking
 * thread — never the audio thread, and never while the band is playing,
 * which the engine refuses under its own lock.
 *
 * `false` means it refused, which today means the band was playing. Every
 * caller is behind `IS_MOBILE`; on a desktop the command answers `false` and
 * changes nothing.
 */
export async function releaseJamSounds(): Promise<boolean> {
  return invoke<boolean>("release_jam_sounds");
}

/**
 * ONE LINE FOR EVERY JAM COMMAND, IN THE ORDER THEY WERE SENT.
 *
 * `set_jam` runs off the main thread now (it decodes recorded kits and
 * voices, and on the main thread that was the beachball), so the engine no
 * longer gets its order for free. This is where the order comes from: each
 * command waits for the one before it to finish.
 *
 * And a run of `setJam`s that are all still waiting collapses to the NEWEST.
 * Every send is a whole band, so the older ones are already out of date —
 * the bar-ahead sends pile up exactly this way behind a cold kit decode, and
 * building each of them in turn would only make the band later. Every caller
 * still gets its promise settled, with the result of the send that replaced
 * it. A position command is never collapsed and never jumped over: it lands
 * after the table sent before it and before the table sent after it.
 */
/**
 * IS THE BAND STILL LOADING?
 *
 * True while a `setJam` has been on its way for longer than
 * `JAM_LOADING_AFTER_MS`, false once the queue is empty. The delay is so a
 * send that finds its sounds already decoded — almost all of them — never
 * flashes a spinner; only a real load shows one. Read it with
 * `useJamLoading`. Nothing is disabled while it is true: a player who picked
 * the wrong kit can pick another straight away, and the queue plays the last.
 */
export const JAM_LOADING_AFTER_MS = 150;
let jamLoading = false;
const jamLoadingWatchers = new Set<() => void>();

export function subscribeJamLoading(listener: () => void): () => void {
  jamLoadingWatchers.add(listener);
  return () => {
    jamLoadingWatchers.delete(listener);
  };
}

export function isJamLoading(): boolean {
  return jamLoading;
}

function setJamLoading(next: boolean): void {
  if (jamLoading === next) return;
  jamLoading = next;
  for (const watcher of [...jamLoadingWatchers]) watcher();
}

type JamJob =
  | { kind: "table"; config: JamEngineConfig | null; waiters: Waiter[] }
  | { kind: "position"; command: JamPositionCommand; waiters: Waiter[] };
type Waiter = { resolve: () => void; reject: (err: unknown) => void };

export const jamQueue = (() => {
  const pending: JamJob[] = [];
  let running = false;

  async function drain(): Promise<void> {
    if (running) return;
    running = true;
    let slow: ReturnType<typeof setTimeout> | null = null;
    try {
      while (pending.length > 0) {
        const job = pending.shift()!;
        if (job.kind === "table" && job.config && slow === null) {
          slow = setTimeout(() => setJamLoading(true), JAM_LOADING_AFTER_MS);
        }
        try {
          if (job.kind === "table") await invoke("set_jam", { config: job.config });
          else await invoke("set_jam_position", { command: job.command });
          for (const w of job.waiters) w.resolve();
        } catch (err) {
          for (const w of job.waiters) w.reject(err);
        }
      }
    } finally {
      running = false;
      if (slow !== null) clearTimeout(slow);
      setJamLoading(false);
    }
  }

  function enqueue(job: JamJob): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const last = pending[pending.length - 1];
      if (job.kind === "table" && last && last.kind === "table") {
        // Superseded before it was sent: the newer band replaces it.
        last.config = job.config;
        last.waiters.push({ resolve, reject });
      } else {
        job.waiters.push({ resolve, reject });
        pending.push(job);
      }
      void drain();
    });
  }

  return {
    table: (config: JamEngineConfig | null) =>
      enqueue({ kind: "table", config, waiters: [] }),
    position: (command: JamPositionCommand) =>
      enqueue({ kind: "position", command, waiters: [] }),
  };
})();

/**
 * The tune finished itself.
 *
 * A `song` arrangement marks its last bar `endsForm` (plans/tasks/jam-v4/BRIEF.md
 * A1); the engine plays that bar out, stops, and says so here. No payload: the
 * only thing the UI needs to know is that it happened, and which jam it was is
 * the one it has open.
 *
 * A build whose engine never emits it is not a broken build — it is a build
 * where a song simply goes round again, which is what every build did before
 * the arrangement existed.
 */
export function onJamEnded(callback: () => void) {
  return listen<null>("jam-ended", () => callback());
}

