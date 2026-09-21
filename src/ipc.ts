import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { load } from "@tauri-apps/plugin-store";
import type { AppState, BeatEvent, ComponentScores, InstrumentId, SegmentEndReason, SpeedRamp, Subdivision } from "./types";

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

export async function setWidgetMode(mode: "compact" | "comfortable"): Promise<void> {
  return invoke("set_widget_mode", { mode });
}

export async function setAlwaysOnTop(enabled: boolean): Promise<void> {
  return invoke("set_always_on_top", { enabled });
}

export async function setWidgetAlwaysOnTop(enabled: boolean): Promise<void> {
  return invoke("set_widget_always_on_top", { enabled });
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

export async function showMain(): Promise<void> {
  return invoke("show_main");
}

export async function showFloating(): Promise<void> {
  return invoke("show_floating");
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

/**
 * Emitted by the engine AFTER an adaptive drill step has been applied.
 *
 * T07 — the tempo decision belongs to the engine (`adaptive_thresholds`
 * in `engine.rs`). This payload reports the move that already happened
 * so the coach can comment on it; there is no longer any way to push a
 * decision back into the engine.
 *
 * `currentBpm` is the tempo the evaluated round was played at,
 * `newBpm` the tempo the drill continues at.
 */
export type AdaptiveEvalRequest = {
  currentBpm: number;
  newBpm: number;
  startBpm: number;
  targetBpm: number;
  accuracyPct: number;
  aggressiveness: string;
  currentStep: number;
  decision: "up" | "hold" | "down";
};

export function onAdaptiveEval(callback: (req: AdaptiveEvalRequest) => void) {
  return listen<AdaptiveEvalRequest>("adaptive-eval", (e) => callback(e.payload));
}

export function onRampStep(callback: (ramp: SpeedRamp) => void) {
  return listen<SpeedRamp>("ramp-step", (e) => callback(e.payload));
}

export function onFullscreenChanged(callback: (isFullscreen: boolean) => void) {
  return listen<boolean>("fullscreen-changed", (e) => callback(e.payload));
}

export async function setActiveTab(tab: string): Promise<void> {
  return invoke("set_active_tab", { tab });
}

export async function getActiveTab(): Promise<string> {
  return invoke<string>("get_active_tab");
}

export async function setCalibrationOffset(offset: number): Promise<void> {
  return invoke("set_calibration_offset", { offset });
}

export async function getCalibrationOffset(): Promise<number | null> {
  return invoke<number | null>("get_calibration_offset");
}

// ---------------------------------------------------------------------------
// Per-instrument calibration cache (DSP plan §"Per-instrument calibration
// cache"). The cache is read-mostly on the frontend — Settings renders a
// "Calibrated for this device" hint plus a "Recalibrate" button that drops
// the entry so the next session re-converges from scratch.
// ---------------------------------------------------------------------------

export interface CalibrationCacheEntry {
  offsetMs: number;
  confidence: number;
  lastUpdatedSecs: number;
}

export interface CalibrationCachePair {
  instrumentId: string;
  deviceName: string;
  entry: CalibrationCacheEntry;
}

// Rust serializes with snake_case for nested fields; map at the boundary so
// the rest of the app uses camelCase consistently. Keeping this thin
// adapter layer also lets us evolve the wire format without churning every
// consumer.
type RawEntry = {
  offset_ms: number;
  confidence: number;
  last_updated_secs: number;
};

type RawPair = {
  instrument_id: string;
  device_name: string;
  entry: RawEntry;
};

function adaptEntry(raw: RawEntry): CalibrationCacheEntry {
  return {
    offsetMs: raw.offset_ms,
    confidence: raw.confidence,
    lastUpdatedSecs: raw.last_updated_secs,
  };
}

function adaptPair(raw: RawPair): CalibrationCachePair {
  return {
    instrumentId: raw.instrument_id,
    deviceName: raw.device_name,
    entry: adaptEntry(raw.entry),
  };
}

export async function getCalibrationCacheEntry(
  instrumentId: string,
  deviceName: string | null,
): Promise<CalibrationCacheEntry | null> {
  const raw = await invoke<RawEntry | null>("get_calibration_cache_entry", {
    instrumentId,
    deviceName,
  });
  return raw ? adaptEntry(raw) : null;
}

export async function clearCalibrationCacheEntry(
  instrumentId: string,
  deviceName: string | null,
): Promise<void> {
  return invoke("clear_calibration_cache_entry", {
    instrumentId,
    deviceName,
  });
}

export async function listCalibrationCache(): Promise<CalibrationCachePair[]> {
  const raw = await invoke<RawPair[]>("list_calibration_cache");
  return raw.map(adaptPair);
}

// Update checker — uses Tauri updater plugin for in-app updates
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export interface UpdateInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseUrl: string;
  /**
   * The `notes` body from `latest.json`, when the endpoint had an update to
   * describe. O8's what's-new modal caches this and replays it after the
   * install, because `check()` returns null once you are on the latest build —
   * which is exactly when the notes become worth reading.
   */
  notes?: string;
}

export async function checkForUpdate(currentVersion: string): Promise<UpdateInfo> {
  const releaseUrl = "https://github.com/turutupa/yames/releases/latest";
  try {
    const update = await check();
    if (update) {
      return {
        hasUpdate: true,
        currentVersion,
        latestVersion: update.version,
        releaseUrl,
        notes: update.body,
      };
    }
    return { hasUpdate: false, currentVersion, latestVersion: currentVersion, releaseUrl };
  } catch {
    return { hasUpdate: false, currentVersion, latestVersion: currentVersion, releaseUrl };
  }
}

export async function downloadAndInstallUpdate(): Promise<void> {
  const update = await check();
  // Returning quietly here left the banner spinning on "Updating…" forever:
  // the caller saw a resolved promise and had nothing to report. `check()`
  // answers null when the endpoint cannot be reached as well as when there is
  // genuinely nothing new, and the first of those is a failure.
  if (!update) throw new Error("no update available — could not reach the update server");
  await update.downloadAndInstall();
  await relaunch();
}

// ---------------------------------------------------------------------------
// MIDI
// ---------------------------------------------------------------------------
import type { MidiDeviceInfo, MidiBinding, MidiActivity, MidiMsgType } from "./types";

export async function listMidiDevices(): Promise<MidiDeviceInfo[]> {
  return invoke<MidiDeviceInfo[]>("list_midi_devices");
}

export async function connectMidiDevice(deviceName: string): Promise<void> {
  return invoke("connect_midi_device", { deviceName });
}

export async function disconnectMidiDevice(): Promise<void> {
  return invoke("disconnect_midi_device");
}

export async function setMidiBinding(
  action: string,
  channel: number | null,
  msgType: MidiMsgType,
  number: number,
): Promise<void> {
  return invoke("set_midi_binding", { action, channel, msgType, number });
}

export async function clearMidiBinding(action: string): Promise<void> {
  return invoke("clear_midi_binding", { action });
}

export async function getMidiBindings(): Promise<MidiBinding[]> {
  return invoke<MidiBinding[]>("get_midi_bindings");
}

export function onMidiAction(callback: (action: string) => void) {
  return listen<{ action: string }>("midi-action", (e) => callback(e.payload.action));
}

export function onMidiActivity(callback: (activity: MidiActivity) => void) {
  return listen<MidiActivity>("midi-activity", (e) => callback(e.payload));
}

export function onMidiDevicesChanged(callback: (devices: MidiDeviceInfo[]) => void) {
  return listen<MidiDeviceInfo[]>("midi-devices-changed", (e) => callback(e.payload));
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
// Audio Input / Evaluation
// ---------------------------------------------------------------------------
import type { AudioInputDevice, AudioSpectrum, BeatFeedback, InferredGridChanged, SessionReport } from "./types";

export async function listAudioInputDevices(): Promise<AudioInputDevice[]> {
  return invoke<AudioInputDevice[]>("list_audio_input_devices");
}

export function onAudioInputDevicesChanged(callback: (devices: AudioInputDevice[]) => void) {
  return listen<AudioInputDevice[]>("audio-input-devices-changed", (e) => callback(e.payload));
}

export async function startEvaluation(deviceName?: string, inputChannel?: number, coachMode?: "default" | "pro"): Promise<void> {
  return invoke("start_evaluation", {
    deviceName: deviceName ?? null,
    inputChannel: inputChannel ?? null,
    coachMode: coachMode ?? null,
  });
}

export async function stopEvaluation(): Promise<void> {
  return invoke("stop_evaluation");
}

export async function getEvaluationState(): Promise<boolean> {
  return invoke<boolean>("get_evaluation_state");
}

/**
 * D4 — Signal A: tell the timing analyzer that the user changed
 * settings (BPM, preset, time signature, or instrument). The analyzer
 * closes the open segment with `SegmentEndReason::SettingsChange` so
 * the next run of play scores against a fresh segment. Per the plan,
 * NO `practice-segment-ended` event fires for this — the JS coach
 * speaks the boundary directly via a forced `boundary_signal_a`
 * gatekeeper event.
 *
 * Safe to call when no evaluation is running (the analyzer's flag
 * is cleared on `start_evaluation`).
 */
export async function notifySettingsChange(): Promise<void> {
  return invoke("notify_settings_change");
}

/**
 * Force-close the open practice segment so `getSessionReport()` returns
 * the IC/GA formula score instead of the legacy fallback. The analyzer
 * loop picks this up within 5ms, emits `practice-segment-ended` with
 * `UserStopped`, and calls `push_segment()`.
 *
 * Call this in the falling-edge handler BEFORE `getSessionReport()`.
 * Safe when no session is active (no-op).
 */
export async function closeOpenSegment(): Promise<void> {
  return invoke("close_open_segment");
}

/**
 * Roadmap 2.4 — what the player is about to play.
 *
 * Until a schedule is loaded the analyzer matches against a grid it
 * infers from the playing itself, so a note that never arrives is a
 * rest: nothing knows a note was due. With one loaded, matching runs
 * against the score — a missing note is a miss, a note nobody asked for
 * is an extra, and each verdict comes back on the note's own id so the
 * review can colour the tab from it.
 *
 * `beat` is quarter notes from the start of the played range. `soft`
 * marks an attack that may be too quiet to detect (a hammer-on, a
 * pull-off); absent, it costs nothing. `onsets` must be sorted by
 * `beat` — `src/songs/schedule.ts` is where that is guaranteed.
 */
// The types themselves live in `src/songs/types.ts`, the contract's one home
// on this side of the wire; they are re-exported here because this file is
// where a caller of `loadScoreSchedule` looks for them.
export type {
  ExpectedOnset,
  ScoreSchedule,
  OnsetResult,
  ExtraOnset,
} from "./songs/types";

/**
 * Load a schedule. Takes effect from the next downbeat, so a count-in
 * played before it belongs to nobody and is ignored rather than
 * reported. Safe to call before or during a session.
 *
 * The results arrive on the existing `practice-segment-ended` event
 * rather than a channel of their own — see `PracticeSegmentEndedPayload`.
 */
export async function loadScoreSchedule(schedule: ScoreSchedule): Promise<void> {
  return invoke("load_score_schedule", { schedule });
}

/** Back to free play. Safe to call when nothing is loaded. */
export async function clearScoreSchedule(): Promise<void> {
  return invoke("clear_score_schedule");
}

/**
 * The bands the review colours a note by — the scorer's own.
 *
 * `score.rs` judges a deviation against a window taken over the schedule's
 * smallest gap, at the tempo the pass was actually played: a piece of
 * sixteenths is judged on a sixteenth's tolerance. A review that drew its own
 * boundaries would colour a note green that the same pass had already counted
 * as merely "ok", and the player would be right to believe neither number.
 *
 * `quarterMs` is the length of a quarter note at the tempo the click ran at
 * — 60000 / BPM — not at the score's written tempo.
 */
export type TimingBands = {
  /** The matching window, ms. Past it is a miss. */
  windowMs: number;
  /** Absolute deviation, ms: inside this is dead on. */
  perfect: number;
  /** …inside this is a shade early or late… */
  good: number;
  /** …and inside this is early or late enough to feel. */
  ok: number;
  /** The gap the window was taken over, in quarter notes. */
  smallestGapBeats: number;
};

export async function scoreTimingBands(
  schedule: ScoreSchedule,
  quarterMs: number,
): Promise<TimingBands> {
  return invoke<TimingBands>("score_timing_bands", { schedule, quarterMs });
}

export function onAudioSpectrum(callback: (spectrum: AudioSpectrum) => void) {
  return listen<AudioSpectrum>("audio-spectrum", (e) => callback(e.payload));
}

export function onBeatFeedback(callback: (feedback: BeatFeedback) => void) {
  return listen<BeatFeedback>("beat-feedback", (e) => callback(e.payload));
}

/**
 * Path B — subscribe to rhythm-inference state changes. The Rust
 * matcher's `RhythmInference` decides what divisor (1/2/3/4/6) the
 * user is actually playing and emits an event whenever the locked
 * state or divisor changes. The coach UI uses this to render the
 * subtle "Tracking 16ths" caption (see `useInferredGrid` hook).
 *
 * The Rust side debounces — this callback only fires when the
 * user-visible state actually changes, not on every refit (which runs
 * every 5ms).
 */
export function onInferredGridChanged(callback: (grid: InferredGridChanged) => void) {
  return listen<InferredGridChanged>("inferred-grid-changed", (e) => callback(e.payload));
}

/**
 * D4 Signal B — subscribe to practice-segment-ended events. Fires from the
 * Rust timing analyzer when an active segment closes due to activity-gap OR
 * grid-discontinuity. SettingsChange segments close via Signal A and do NOT
 * emit this event.
 *
 * The JS mini-report logic (useSegmentCoach.ts) drives off the `isPlaying`
 * falling edge and does not consume this event. This listener is for
 * gatekeeper scenarios that must react to the specific end-reason — in
 * particular `"grid-discontinuity"` which signals the player drifted off-grid
 * while still playing.
 */
export type PracticeSegmentEndedPayload = {
  startMs: number;
  endMs: number;
  score: number;
  componentScores: ComponentScores;
  bpm: number;
  instrument: string;
  presetId?: string;
  endReason: SegmentEndReason;
  onsetCount: number;
  beatCount: number;
  totalOnsets: number;
  spuriousOnsets: number;
  onsetEfficiency: number;
  inferredDivisor: number;
  inferredDivisorConfidence: number;
  playMode: "structured" | "noodling";
  /**
   * Roadmap 2.4 — one verdict per expected onset, present only when a
   * `ScoreSchedule` was loaded. Absent in free play, where the fields
   * are left off the wire entirely rather than sent empty. When these
   * are present, `score` and `componentScores` were computed against
   * the schedule rather than against the inferred grid.
   */
  onsetResults?: OnsetResult[];
  extraOnsets?: ExtraOnset[];
  /**
   * How far the accents the score marked actually came out louder than
   * their neighbours, 0–1, when there was enough signal to tell.
   * Reported and not scored while LP C3 is open.
   */
  accentAgreement?: number;
};

/**
 * One expected note's verdict, while the pass is still running
 * (`plans/SONGS.md` A7).
 *
 * The same four facts an `OnsetResult` carries, and deliberately not that
 * type: this is **provisional**. It is decided the moment the note's matching
 * window closes, from what had arrived by then, and the alignment at the end
 * of the attempt can still revise the last bar of it — a note not yet played
 * can change which slot an earlier one belongs in. The review's
 * `onsetResults` are the authority and always were.
 *
 * It arrives only while a `ScoreSchedule` is loaded. Free play emits none at
 * all: the sweep that produces these does not run.
 */
export type LiveOnset = {
  id: number;
  /** Times round the loop, from 0 — the same axis `OnsetResult.pass` is on. */
  pass: number;
  state: OnsetResult["state"];
  /** Negative is early. `null` when there was nothing to measure. */
  deviationMs: number | null;
};

/** Subscribe to the live per-note verdicts. See {@link LiveOnset}. */
export function onScoreOnset(callback: (onset: LiveOnset) => void) {
  return listen<LiveOnset>("score-onset", (e) => callback(e.payload));
}

export function onPracticeSegmentEnded(
  callback: (payload: PracticeSegmentEndedPayload) => void,
) {
  return listen<PracticeSegmentEndedPayload>(
    "practice-segment-ended",
    (e) => callback(e.payload),
  );
}

export async function getSessionReport(): Promise<SessionReport | null> {
  return invoke<SessionReport | null>("get_session_report");
}

/**
 * Session-end report: reads from `all_segments` (never-cleared) so the
 * score reflects every segment even after `clearSession()` wiped the
 * per-exercise window mid-session.
 *
 * Use this in `endSession()` instead of `getSessionReport()`.
 * Mid-session mini-reports must continue using `getSessionReport()` so
 * they show per-exercise (not cumulative) scores.
 */
export async function getFinalSessionReport(): Promise<SessionReport | null> {
  return invoke<SessionReport | null>("get_final_session_report");
}

export async function clearSession(): Promise<void> {
  return invoke("clear_session");
}

// ---------------------------------------------------------------------------
// Session History — the practice store (ROADMAP 1.1)
//
// These four keep the shapes they have always had; underneath, history now
// lives in `practice.db` beside `settings.json` instead of inside it. The
// JSON array is imported once on first launch and then left alone.
//
// A store that will not open (corrupt, or written by a newer Yames) answers
// reads with nothing and refuses writes — it is never deleted.
// ---------------------------------------------------------------------------
import type { SavedSession } from "./types";

export async function saveSession(session: SavedSession): Promise<void> {
  return invoke("save_session", { session });
}

/** The most recent thirty sessions, newest first — the same slice the
 *  history tab has always shown. Use `queryHistory` for the rest. */
export async function getSessionHistory(): Promise<SavedSession[]> {
  return invoke<SavedSession[]>("get_session_history");
}

export async function deleteSession(id: string): Promise<void> {
  return invoke("delete_session", { id });
}

export async function clearAllSessions(): Promise<void> {
  return invoke("clear_all_sessions");
}

/**
 * What `queryHistory` narrows by. Every field is optional; an empty filter
 * is "everything, newest first".
 */
export type HistoryFilter = {
  presetId?: string;
  /** Reserved for the curriculum (ROADMAP 2.2). Nothing writes an exercise
   *  key yet, so filtering by one matches nothing. */
  exerciseKey?: string;
  /** Instrument id, e.g. `"electric-guitar"`. */
  instrument?: string;
  /** Epoch ms, inclusive. */
  since?: number;
  /** Epoch ms, inclusive. */
  until?: number;
  bpmMin?: number;
  bpmMax?: number;
  limit?: number;
};

/**
 * History beyond the last thirty sessions, narrowed. Returns whole
 * `SavedSession`s, so everything in `src/coach/presetAwareness.ts` takes
 * the rows as they come.
 */
export async function queryHistory(
  filter: HistoryFilter = {},
): Promise<SavedSession[]> {
  return invoke<SavedSession[]>("query_history", { filter });
}

// ---------------------------------------------------------------------------
// Songs — the library, and what was played against it
// ---------------------------------------------------------------------------
import type {
  ExtraOnset,
  Finding,
  NoteVerdict,
  OnsetResult,
  ScoreSchedule,
  SongScore,
} from "./songs/types";

/** One row of the song library — what a list shows, without the notes. */
export type ScoreSummary = {
  id: string;
  title: string;
  artist: string;
  sourceFile: string;
  format: string;
  trackIndex: number;
  trackName: string;
  /** Epoch ms. */
  importedAt: number;
  /**
   * What the player calls this song, when they have renamed it. Absent means
   * "the title it came with" — renaming a song in the library never rewrites
   * the title printed on the page.
   */
  name?: string;
  /**
   * When the player last opened it, epoch ms (migration four).
   *
   * Absent for a song nobody has opened since the counting started, which is
   * every song that was in the library before it. The store sorts on
   * `COALESCE(lastOpenedAt, importedAt)`, so a library from before the
   * migration comes back in exactly the order it always did.
   */
  lastOpenedAt?: number;
  /** How many times it has been opened since the counting started. */
  openCount?: number;
};

/**
 * One expected onset's verdict inside an attempt. Mirrors `OnsetResult` in
 * the wave contract (`plans/tasks/songs/BRIEF.md`) field for field.
 */
export type AttemptOnset = {
  /** `ExpectedOnset.id` — an index into the score's schedule. */
  id: number;
  state: "hit" | "miss" | "softAbsent";
  deviationMs: number | null;
  /** Times round the loop, from 0. */
  pass: number;
  /** See `OnsetResult.accentHeard`. Reported, never scored. */
  accentHeard?: boolean;
};

/** An onset the player produced that the score did not ask for. */
export type AttemptExtra = {
  /** Quarter notes from the start of the played range. */
  beat: number;
  pass: number;
};

/** One pass at a range of bars of one song. */
export type Attempt = {
  id: string;
  scoreId: string;
  /** The practice session this attempt belonged to, when there was one. */
  sessionId?: string;
  /** Epoch ms. */
  startedAt: number;
  /** Inclusive, in played-bar indices (`SongScore.bars[].index`). */
  rangeStartBar: number;
  rangeEndBar: number;
  /** Percentage of the score's own tempo it was played at. */
  tempoPercent: number;
  passes: number;
  score: number;
  hits: number;
  misses: number;
  extras: number;
  meanDevMs: number;
  madMs: number;
  /** Recording of the attempt, when the player kept one. */
  takePath?: string;
  /** Empty unless the query asked for onsets. */
  onsets?: AttemptOnset[];
  extraOnsets?: AttemptExtra[];
};

/** A range of played bars, inclusive at both ends. */
export type BarRange = { startBar: number; endBar: number };

export type AttemptQuery = {
  scoreId: string;
  /** Selects attempts that *overlap* the range: a full run-through did
   *  cover bars 17–24, and the coach comparing tonight against it should
   *  see it. */
  barRange?: BarRange;
  /** Per-onset verdicts are the biggest thing in the store — ask for them
   *  when you are about to colour a tab, not to list attempts. */
  includeOnsets?: boolean;
  limit?: number;
};

/** What `saveScore` may say about a song besides its score. */
export type SaveScoreOptions = {
  /** The player's name for it. Omitted says nothing rather than clearing it. */
  name?: string;
  /**
   * The bytes of the file it was read from, base64. `SONGS.md` A2: the tab is
   * engraved from the source, so the bytes outlive the import.
   */
  sourceBase64?: string;
  /** Epoch ms. Omitted means now — pass one only to preserve a date. */
  importedAt?: number;
};

/** Import (or re-import) a song. Resolves with the score's id. */
export async function saveScore(
  score: SongScore,
  opts: SaveScoreOptions = {},
): Promise<string> {
  return invoke<string>("save_score", {
    score,
    name: opts.name ?? null,
    sourceBase64: opts.sourceBase64 ?? null,
    importedAt: opts.importedAt ?? null,
  });
}

/** The library, most recently imported first. */
export async function listScores(): Promise<ScoreSummary[]> {
  return invoke<ScoreSummary[]>("list_scores");
}

export async function getScore(id: string): Promise<SongScore | null> {
  return invoke<SongScore | null>("get_score", { id });
}

/**
 * The bytes of the file a song was read from, base64, or `null`.
 *
 * Its own call because it is the biggest thing on the row and the library
 * list never wants it — only the screen about to draw a tab does.
 */
export async function getScoreSource(id: string): Promise<string | null> {
  return invoke<string | null>("get_score_source", { id });
}

/**
 * The player opened this song: it goes to the top of the library.
 *
 * The time is the store's, not ours — when a song was opened is a fact about
 * this machine rather than a claim the webview gets to make.
 */
export async function markScoreOpened(id: string): Promise<void> {
  return invoke("mark_score_opened", { id });
}

/**
 * Give the player their file back, through a native save dialog.
 *
 * Yames keeps its own copy of every file it imports, so clearing the
 * Downloads folder loses nothing; this is the other half of that promise.
 * Resolves with the path it was written to, or `null` when the player
 * cancelled — which is not a failure and must not put a sentence on screen.
 */
export async function exportScoreSource(id: string): Promise<string | null> {
  return invoke<string | null>("export_score_source", { id });
}

/** Forget a song, and with it every attempt at it. */
export async function deleteScore(id: string): Promise<void> {
  return invoke("delete_score", { id });
}

export async function saveAttempt(attempt: Attempt): Promise<void> {
  return invoke("save_attempt", { attempt });
}

// ---------------------------------------------------------------------------
// Songs on the engine — the piece the click walks, and the band from the file
//
// Songs is its own engine mode beside the metronome, the drill and the jam
// (`plans/tasks/songs/W9-ENGINE-SONG.md`): while a song is loaded the click
// follows the score's tempo map instead of `AppState.bpm`, and starting a jam
// takes the song away. The engine holds only the compiled tables; the imported
// file stays in the UI, exactly as a jam's record does.
// ---------------------------------------------------------------------------

import type { SongBacking, SongMix, SongTransport } from "./songs/types";

/** What a song turned out to be, once the engine had compiled it. */
export type SongLoaded = {
  /** How many bars the range plays. */
  bars: number;
  /** How long one pass lasts, in milliseconds at the chosen speed. */
  passMs: number;
  /** How many backing notes play. */
  playedNotes: number;
  /** And how many named something this band has no voice for. */
  droppedNotes: number;
};

/**
 * Hand the engine a song: where it is in time, and the file's own band.
 *
 * Starting a song stops the others — the band goes, a running speed ramp
 * stops, and a count-in the metronome had armed is spent, because a song
 * carries its own. Rejects with a sentence when the transport describes
 * something the engine cannot play.
 */
export async function loadSong(
  transport: SongTransport,
  backing: SongBacking | null = null,
): Promise<SongLoaded> {
  return invoke<SongLoaded>("load_song", { transport, backing });
}

/** Take the song away and leave the plain click. */
export async function clearSong(): Promise<void> {
  return invoke("clear_song");
}

/**
 * Loop bars 17 to 24 at 70 %, or stop looping, or play the whole piece.
 *
 * It recompiles on the Rust side and starts the range again from the top,
 * which is why the UI does not send one per keystroke of a number field.
 */
export async function setSongRange(
  range: { startBar: number; endBar: number },
  loops: boolean,
  tempoPercent: number,
  countInBars?: number,
): Promise<SongLoaded> {
  return invoke<SongLoaded>("set_song_range", {
    range,
    loops,
    tempoPercent,
    countInBars: countInBars ?? null,
  });
}

/**
 * How loud the click and each of the band's three rows are.
 *
 * Applies on the next buffer and recompiles nothing, so this is safe to send
 * on every step of a fader drag. Out-of-range values are clamped rather than
 * refused — a fader that stops moving is better than a dialog.
 */
export async function setSongMix(mix: SongMix): Promise<void> {
  return invoke("set_song_mix", { mix });
}

/**
 * The engine let go of the song: the audio device changed under it, or a jam
 * started and took the band with it.
 *
 * It carries nothing, because there is nothing to say beyond that it
 * happened — what to do about it is the mode's business, not the engine's.
 */
export function onSongDropped(callback: () => void) {
  return listen<null>("song-dropped", () => callback());
}

// ---------------------------------------------------------------------------
// The coach's judgement, and its ears
//
// Both run off the UI thread (`#[tauri::command(async)]`) and both belong to
// the post-session tier (`AGENTS.md`): the pass is over, the player is
// reading the timing score, and there are seconds to spend.
// ---------------------------------------------------------------------------

/** One attempt at a passage: every pass, as scoring reported it. */
export type AttemptPasses = {
  results: OnsetResult[];
  extras?: ExtraOnset[];
  /** The tempo it was played at, as a share of the score's own tempo. */
  tempoPercent: number;
};

export type AnalyzeAttemptRequest = {
  /** The score to judge against, by id in the library… */
  scoreId?: string;
  /** …or whole, for a passage that is not in the library yet. */
  score?: SongScore;
  /** Always from `src/songs/schedule.ts` — it is what derives one. */
  schedule: ScoreSchedule;
  attempt: AttemptPasses;
  /** Earlier attempts at the same passage, oldest first, given whole. */
  earlier?: AttemptPasses[];
  /**
   * …or asked of the store instead: every earlier attempt overlapping these
   * bars. Needs `scoreId`. It is what makes "improved" and the tempo ceiling
   * possible, and nothing else depends on it.
   */
  earlierBars?: BarRange;
  /** The attempt being judged, when it is already saved — so it is not
   *  compared against itself. */
  excludeAttemptId?: string;
};

/** The coach's verdict, ranked, headline first (`COACH_UX.md` A4). */
export async function analyzeAttempt(
  request: AnalyzeAttemptRequest,
): Promise<Finding[]> {
  return invoke<Finding[]>("analyze_attempt", { request });
}

export type AnalyzeTakePitchRequest = {
  /** The take to listen to, and the jam it was recorded under. Its DRY stem
   *  is what is read — the mix has the band in it. */
  takeId: string;
  jamId: string;
  scoreId?: string;
  score?: SongScore;
  schedule: ScoreSchedule;
  results: OnsetResult[];
  /**
   * Onsets the player produced that the score did not ask for.
   *
   * No verdict is given on them — they are not notes of the score — but they
   * are where the tracker is cut. Nothing in a pitch track tells one note
   * from the next; an onset does, and an extra note left out here gets
   * folded into the written note before it and drags its median off.
   */
  extras?: ExtraOnset[];
  /**
   * The tempo the range was played at — the click's, not the score's.
   *
   * One number, and a song has a map. Kept for everything that really does
   * have one tempo, and as the fallback when `tempoMap` is absent.
   */
  bpm: number;
  /**
   * The click's tempo across the range, stepping where the score steps.
   * `beat` is quarter notes from the range's start; `src/songs/schedule.ts`'s
   * `rangeTempoSteps` is what derives it.
   *
   * Without this a tempo step puts every note after it in the wrong part of
   * the take — at 100 BPM a quarter is 600 ms and at 140 it is 429, so eight
   * bars past a step the window is seconds adrift and the tracker is asked
   * about somebody else's notes.
   */
  tempoMap?: { beat: number; bpm: number }[];
  /**
   * Where the FIRST BEAT of the played range sits inside the dry stem, in ms
   * from the instant that file starts.
   *
   * The one number everything else rests on. `OnsetResult` carries a
   * deviation and not an absolute time, so when a note was played has to be
   * reconstructed as "where it was due, plus how far off it was" — and
   * "where it was due" only means anything against the buffer's own clock.
   * Get this wrong and every note moves by the same amount, which looks like
   * a tracker that cannot segment rather than a clock that is out.
   */
  startOffsetMs?: number;
};

/** Which note was that, for every note of the score in the played range. */
export async function analyzeTakePitch(
  request: AnalyzeTakePitchRequest,
): Promise<NoteVerdict[]> {
  return invoke<NoteVerdict[]>("analyze_take_pitch", { request });
}

/** Attempts at a song, oldest first. */
export async function queryAttempts(query: AttemptQuery): Promise<Attempt[]> {
  return invoke<Attempt[]>("query_attempts", { query });
}

// ---------------------------------------------------------------------------
// The download is caught (W19, `plans/SONGS.md` S0.9)
//
// While Songs is the open mode, Rust lists the Downloads folder and says when
// a Guitar Pro or MusicXML file has finished arriving. It offers; it never
// imports, never moves the file and never opens it — `readOfferedFile` is the
// only call that reads bytes, and it runs after the player has pressed the
// button. No tab site is touched by any of this, by any route.
// ---------------------------------------------------------------------------

import type { DownloadOffer } from "./songs/downloadWatch";

/** Where this machine puts downloads, or null if the OS will not say. */
export async function defaultDownloadsDir(): Promise<string | null> {
  return invoke<string | null>("default_downloads_dir");
}

/**
 * Start watching. `folder` is null for this machine's own Downloads.
 *
 * Resolves with the folder actually being watched, so the setting can show it
 * without having to work out what "the default" means on this OS. Rejects
 * when the folder is not there, which is the case a player who moved a
 * removable drive will hit.
 */
export async function startDownloadWatch(folder: string | null): Promise<string> {
  return invoke<string>("start_download_watch", { dir: folder });
}

/** Stop watching. Idempotent. After this there is no watcher thread at all. */
export async function stopDownloadWatch(): Promise<void> {
  return invoke("stop_download_watch");
}

/** "Not this one", for as long as this watch runs. */
export async function dismissDownloadOffer(fileName: string): Promise<void> {
  return invoke("dismiss_download_offer", { fileName });
}

/** The offered file's bytes, base64 — after the player has said yes. */
export async function readOfferedFile(path: string): Promise<string> {
  return invoke<string>("read_offered_file", { path });
}

/** A file has finished arriving in the watched folder. */
export function onDownloadOffer(callback: (offer: DownloadOffer) => void) {
  return listen<DownloadOffer>("songs-download-offer", (e) => callback(e.payload));
}

// ---------------------------------------------------------------------------
// The file opens with Yames (W19, `plans/SONGS.md` S0.9)
//
// "Open with Yames" on a Guitar Pro or MusicXML file, from a cold start or
// while Yames is already running. The webview never names a path: it asks
// whether the OS handed this process one, and gets the bytes back.
// ---------------------------------------------------------------------------

/** A file the OS asked Yames to open. */
export type OpenedFile = {
  fileName: string;
  /** The bytes, base64 — `decodeSource` turns it back into a file. */
  base64: string;
};

/**
 * The next file the OS asked Yames to open, or null.
 *
 * Null on every launch that was not a double-click, which is nearly all of
 * them. Taking it empties the queue, so a file is only ever opened once.
 */
export async function takePendingOpen(): Promise<OpenedFile | null> {
  return invoke<OpenedFile | null>("take_pending_open");
}

/** Yames was asked to open a file while it was already running. */
export function onOpenFile(callback: () => void) {
  return listen("songs-open-file", () => callback());
}

// ---------------------------------------------------------------------------
// "Come back to this" (COACH_UX A5)
//
// The promise the coach's fourth button makes. It was four keys in
// `settings.json` until migration three gave it a table; `src/songs/due.ts`
// moves what it finds across once and reads from here afterwards.
// ---------------------------------------------------------------------------

/** One passage of one song, and the day to look at it again. */
export type ScoreDue = {
  scoreId: string;
  /** Played-bar indices, inclusive — the numbering the transport takes. */
  rangeStartBar: number;
  rangeEndBar: number;
  /** Days since the Unix epoch, in the player's own local time. */
  dueDay: number;
  /** Why the coach asked, as the finding's own kind. */
  reason?: string;
};

/** Write one down, or move the day of one already made. */
export async function saveDue(due: ScoreDue): Promise<void> {
  return invoke("save_due", { due });
}

/**
 * Every promise on file, the soonest due first.
 *
 * The whole list rather than "what is due today": the day is a question about
 * the player's own calendar, and a store that answered it would answer in UTC.
 */
export async function listDue(): Promise<ScoreDue[]> {
  return invoke<ScoreDue[]>("list_due");
}

/** Forget one — the player played it, or does not want the reminder. */
export async function clearDue(
  scoreId: string,
  startBar: number,
  endBar: number,
): Promise<void> {
  return invoke("clear_due", { scoreId, startBar, endBar });
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
// Diagnostic Session Logs (D1)
//
// Heavier per-session JSON dumps written by the eval pipeline once
// instrumentation is wired in (D2-D4). The shape mirrors `SessionLog`
// in `src-tauri/src/session_log.rs`.
// ---------------------------------------------------------------------------

import type { SessionLog } from "./types";

export async function listSessionLogs(): Promise<string[]> {
  return invoke<string[]>("list_session_logs");
}

export async function getSessionLog(path: string): Promise<SessionLog> {
  return invoke<SessionLog>("get_session_log", { path });
}

export async function exportSessionLogs(): Promise<string> {
  return invoke<string>("export_session_logs");
}

export async function clearSessionLogs(): Promise<void> {
  return invoke("clear_session_logs");
}

// ---------------------------------------------------------------------------
// Audio Input Recording / Playback
// ---------------------------------------------------------------------------

export async function startRecording(): Promise<void> {
  return invoke("start_recording");
}

export async function stopRecording(): Promise<number> {
  return invoke<number>("stop_recording");
}

export async function startPlayback(): Promise<void> {
  return invoke("start_playback");
}

export async function stopPlayback(): Promise<void> {
  return invoke("stop_playback");
}

export async function discardRecording(): Promise<void> {
  return invoke("discard_recording");
}

export async function getWaveform(): Promise<number[]> {
  return invoke<number[]>("get_waveform");
}

export async function setInputGain(gainDb: number): Promise<void> {
  return invoke("set_input_gain", { gainDb });
}

// ---------------------------------------------------------------------------
// Model Management
// ---------------------------------------------------------------------------

export type ModelStatus = {
  brainReady: boolean;
  brainTier: string | null;
  /**
   * Which model family the downloaded brain belongs to. `"qwen3"` is
   * current; `"legacy"` is anything installed before the Qwen3 refresh
   * (Qwen2.5-1.5B / Phi-3.5-mini), detected by the absence of the
   * `models/brain/model.json` marker. `null` when nothing is downloaded.
   */
  brainFamily: string | null;
  brainSizeBytes: number;
  voiceReady: boolean;
  voiceSizeBytes: number;
  /**
   * Tier gates and the migration prompt, decided in Rust
   * (`models::recommendations`) against the RAM the OS actually reports.
   * The frontend consumes the booleans and owns none of the thresholds —
   * the TS copy compared against a literal 16 GiB, which no real 16 GB
   * Windows or Linux machine ever reports.
   */
  studioRecommended: boolean;
  standardRecommended: boolean;
  brainUpdateRecommended: boolean;
};

export type DownloadProgress = {
  component: string;
  downloadedBytes: number;
  totalBytes: number;
  fraction: number;
  done: boolean;
};

export async function getModelStatus(): Promise<ModelStatus> {
  return invoke<ModelStatus>("get_model_status");
}

/**
 * Total physical RAM in MB, or 0 when the platform query failed.
 * Gates the Studio brain tier (ROADMAP §3: offered only at >= 16 GB).
 */
export async function getSystemMemoryMb(): Promise<number> {
  return invoke<number>("get_system_memory_mb");
}

export async function writeModelChunk(
  component: string,
  filename: string,
  data: number[],
): Promise<string> {
  return invoke<string>("write_model_chunk", { component, filename, data });
}

export async function getModelsPath(): Promise<string> {
  return invoke<string>("get_models_path");
}

/**
 * Download a model file from a URL, streaming chunks to the Rust filesystem.
 * Emits DownloadProgress-like callbacks so the UI can show progress.
 */
export async function downloadModelFile(
  url: string,
  component: string,
  filename: string,
  onProgress?: (downloaded: number, total: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(url, { signal });
  } catch (err) {
    if (signal?.aborted) throw new Error("Download cancelled");
    throw new Error("Could not reach server — check your internet connection");
  }
  if (!response.ok) throw new Error(`Server returned ${response.status} ${response.statusText}`);
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  let downloaded = 0;
  const chunks: Uint8Array[] = [];

  while (true) {
    if (signal?.aborted) {
      await reader.cancel();
      throw new Error("Download cancelled");
    }
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    downloaded += value.length;
    onProgress?.(downloaded, contentLength);
  }

  // Combine all chunks and write to disk via Rust
  const full = new Uint8Array(downloaded);
  let offset = 0;
  for (const chunk of chunks) {
    full.set(chunk, offset);
    offset += chunk.length;
  }

  await writeModelChunk(component, filename, Array.from(full));
}

export async function deleteModels(): Promise<void> {
  return invoke("delete_models");
}

// ---------------------------------------------------------------------------
// Coach LLM Inference
// ---------------------------------------------------------------------------

/**
 * Load the brain into memory. Idempotent on the Rust side: the same
 * weights already resident is a no-op, and a load already in flight is
 * not restarted. Prefer `ensureCoachLoaded()` from `hooks/coachLoader`,
 * which also dedupes the in-flight promise on this side.
 */
export async function loadCoachModel(): Promise<boolean> {
  return invoke<boolean>("load_coach_model");
}

/**
 * Drop the resident worker and free its RAM. The model is only meant to
 * be resident while someone is practising, so this is called when the
 * brain tier is switched off and by the idle timer in `coachLoader`.
 */
export async function unloadCoachModel(): Promise<void> {
  return invoke("unload_coach_model");
}

/**
 * What kind of generation this is. Explicit rather than sniffed out of
 * the prompt text: Rust picks the token budget and the template branch
 * from it, and the timeout below comes from the same value.
 */
export type CoachGenKind =
  | "tip"
  | "greeting"
  | "report"
  | "summary"
  | "chat"
  | "drill";

/**
 * Hard timeout per generation kind, in milliseconds.
 *
 * One 3 s cap for everything came from the plan's C4 latency policy,
 * which is written about the *tip* path — "the user never waits for the
 * model". Applied to a session summary or a chat answer it just meant
 * those never arrived on a CPU backend, since a 256-token answer cannot
 * be produced in three seconds there. The budgets now match AGENTS.md's
 * latency tiers: a tip must not delay the next thing the player hears,
 * a report lands while they are already reading their score, and a
 * summary or chat answer is something they are explicitly waiting for.
 *
 * On timeout this rejects with `Error("coach_generate_timeout")` so call
 * sites fall back to their template path (every one has a try/catch or
 * a `.catch()`).
 */
export const COACH_GENERATE_TIMEOUT_MS: Record<CoachGenKind, number> = {
  tip: 3_000,
  drill: 3_000,
  greeting: 3_000,
  report: 8_000,
  summary: 15_000,
  chat: 15_000,
};

export async function coachGenerate(
  kind: CoachGenKind,
  context: string,
): Promise<string> {
  const call = invoke<string>("coach_generate", { kind, context });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      call,
      new Promise<string>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("coach_generate_timeout")),
          COACH_GENERATE_TIMEOUT_MS[kind],
        );
      }),
    ]);
  } finally {
    // Without this the 15 s chat timer keeps the event loop (and, in
    // tests, the fake clock) busy long after the call resolved.
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function isCoachLoaded(): Promise<boolean> {
  return invoke<boolean>("is_coach_loaded");
}

/**
 * What the coach can actually do in this build, right now.
 *
 * Distinct from `ModelStatus`, which only answers "are the weights on
 * disk". A release binary compiled without the `coach-llm` Cargo
 * feature can have 2.4 GB of GGUF downloaded and still be unable to
 * read a byte of it — `llmCompiled` is what tells the two apart.
 */
export type CoachCapabilities = {
  /** Whether the binary was built with the `coach-llm` feature. */
  llmCompiled: boolean;
  /** Whether a real model is loaded in memory right now. */
  modelResident: boolean;
  /** Whether a load is in flight — the UI says "warming up". */
  loading: boolean;
  /**
   * Compile-time llama.cpp backend. llama.cpp still falls back to CPU
   * at runtime when no usable GPU is present, so `"vulkan"` does not
   * guarantee GPU execution.
   */
  backend: "metal" | "vulkan" | "cpu" | "none";
  /**
   * Display name of the resident model, read from GGUF metadata
   * ("Qwen3 4B"), or null when nothing is resident. It used to be the
   * file name the downloader wrote, so the status line read
   * "model.bin on vulkan".
   */
  modelName: string | null;
  /**
   * Why the last load did not produce a resident model (legacy weights,
   * nothing downloaded, no LLM in this build), or null.
   */
  loadError: string | null;
  /** Weights are on disk. Mirrors `ModelStatus.brainReady`. */
  brainDownloaded: boolean;
  /** Tier gates — see `ModelStatus`. */
  studioRecommended: boolean;
  standardRecommended: boolean;
  brainUpdateRecommended: boolean;
  /**
   * Whether live mid-session tips actually reach the model (T04b).
   *
   * Deliberately not derivable from `backend` here: that is the
   * compile-time feature string, so a GPU-less machine running the
   * shipped Vulkan build still reports `"vulkan"`. This is the routing
   * decision itself, taken from measured rephrase latency, so the UI
   * cannot claim something the coach does not do.
   */
  tipsUseModel: boolean;
  /**
   * Measured median rephrase round-trip in ms, or null before the model
   * has been asked for one. Null means "not measured yet", not "fast".
   */
  rephraseP50Ms: number | null;
};

export async function getCoachCapabilities(): Promise<CoachCapabilities> {
  return invoke<CoachCapabilities>("get_coach_capabilities");
}

// ---------------------------------------------------------------------------
// TTS (Text-to-Speech)
// ---------------------------------------------------------------------------

export async function ttsSpeak(text: string): Promise<void> {
  return invoke("tts_speak", { text });
}

/**
 * Subscribe to the "TTS audio is about to play" signal. The Rust side
 * emits this AFTER Piper synthesis finishes but BEFORE the WAV starts
 * playing — i.e. when the spinner-to-text swap should fire so the
 * visible text lands within ~10-30ms of the first audible sample. The
 * payload is empty; the consumer maintains its own pending-speech
 * queue (FIFO) and pops the head on each event.
 */
export function onTtsSpeechStarted(callback: () => void) {
  return listen<null>("tts-speech-started", () => callback());
}

/**
 * Subscribe to the "TTS speech ended" signal — fires once per
 * `tts_speak` invocation in every exit path: natural completion,
 * cancellation via `tts_stop` (or another voice click), AND error.
 * Used by the Settings voice-preview UI to clear the per-voice
 * "speaking" indicator at the exact moment audio stops, instead of a
 * coarse timer that didn't honour interrupts. Pair every increment of
 * a pending-speech counter with a decrement here for a clean tally
 * across rapid voice-button clicks.
 */
export function onTtsSpeechEnded(callback: () => void) {
  return listen<null>("tts-speech-ended", () => callback());
}

export async function ttsSetVoice(voice: string): Promise<void> {
  return invoke("tts_set_voice", { voice });
}

/**
 * Set the coach voice playback volume (0.0..=1.0). Driven by the unified
 * volume slider so the user can dial down the spoken feedback without
 * touching the metronome gain.
 */
export async function ttsSetVolume(volume: number): Promise<void> {
  return invoke("tts_set_volume", { volume });
}

export async function ttsListVoices(): Promise<[string, string][]> {
  return invoke<[string, string][]>("tts_list_voices");
}

/**
 * Interrupt any currently-playing TTS utterance (Piper synthesis, the
 * in-process WAV playback that follows it, or the macOS `say` fallback).
 * The Rust side bumps a generation counter: an in-flight Piper
 * subprocess is killed by PID (`kill -9` / `taskkill /F`), and playback
 * already under way sees the bumped generation on its next 20 ms poll
 * and stops the rodio sink. Safe to call when nothing is playing (the
 * counter still bumps, no kill is issued). Used by the voice preview UI
 * so rapid clicks across voices feel snappy instead of queueing up.
 */
export async function ttsStop(): Promise<void> {
  return invoke("tts_stop");
}

/**
 * Per-voice diagnostic info from the Rust side. Mirrors the
 * `VoiceDiagnostic` struct in `tts.rs` (serde renames the boolean fields
 * to camelCase). `ready` is true only when:
 *   - the Piper engine (`piper` / `piper.exe`) is on disk AND passed the
 *     install-time smoke test
 *   - the voice's .onnx file exists AND is larger than `MIN_ONNX_BYTES`
 *   - the voice's .onnx.json sidecar exists
 *
 * The UI uses these flags to gate the per-voice download button — if
 * any of `engineMissing`, `onnxMissing`, `jsonMissing`, or `corrupted`
 * is true, the voice can't speak and the user needs to click "Repair".
 */
export interface VoiceDiagnostic {
  id: string;
  name: string;
  ready: boolean;
  corrupted: boolean;
  onnxMissing: boolean;
  jsonMissing: boolean;
  engineMissing: boolean;
  onnxBytes: number;
  /**
   * OS-specific remediation sentence, present only when `engineMissing`
   * is true. Windows (antivirus quarantine), Linux (missing
   * `espeak-ng-data`) and macOS (Gatekeeper) fail in different ways, so
   * "engine missing" on its own gave the user nothing to act on. Emitted
   * from Rust in English; skipped entirely when the engine is healthy.
   */
  engineHint?: string;
}

export async function ttsVoiceDiagnostics(): Promise<VoiceDiagnostic[]> {
  return invoke<VoiceDiagnostic[]>("tts_voice_diagnostics");
}

/**
 * Download (or re-download) a single voice's .onnx + .onnx.json. If the
 * Piper engine itself is missing required dylibs, this also re-extracts
 * the Piper tarball before pulling the voice. Emits the standard
 * `model-download-progress` events; on success emits
 * `model-download-complete` WITHOUT a `tier` field so the frontend
 * doesn't clobber the active brain tier.
 */
export async function startVoiceRepair(voiceId: string): Promise<void> {
  return invoke("start_voice_repair", { voiceId });
}

export function onDownloadProgress(callback: (progress: DownloadProgress) => void) {
  return listen<DownloadProgress>("model-download-progress", (e) => callback(e.payload));
}

export function onDownloadComplete(callback: (result: { success: boolean; tier?: string; cancelled?: boolean; error?: string }) => void) {
  return listen<{ success: boolean; tier?: string; cancelled?: boolean; error?: string }>("model-download-complete", (e) => callback(e.payload));
}

export async function startModelDownload(url: string, component: string, filename: string, tier: string): Promise<void> {
  return invoke("start_model_download", { url, component, filename, tier });
}

export async function cancelModelDownload(): Promise<void> {
  return invoke("cancel_model_download");
}

export function onPlaybackFinished(callback: () => void) {
  return listen<void>("playback-finished", () => callback());
}

// ---------------------------------------------------------------------------
// Jam (plans/JAM_MODE.md, plans/tasks/jam/BRIEF.md)
// ---------------------------------------------------------------------------

import type { Jam, JamEngineConfig, JamPositionCommand, JamTake } from "./jam/types";
import type { SongRecord } from "./songs/library";

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

// ---------------------------------------------------------------------------
// Songs (plans/SONGS.md, plans/tasks/songs/W4-SONGS.md)
// ---------------------------------------------------------------------------

/**
 * `songs.json` — where the library used to live, and no longer does.
 *
 * Songs were given a store file of their own rather than `settings.json`,
 * because a song carries the bytes of the file it came from (`SONGS.md` A2)
 * and `settings.json` is rewritten whole every time anyone moves the volume
 * slider. The right home was always W2's SQLite store, and that is where they
 * are now: `src/songs/library.ts` reads and writes `scores` through
 * `saveScore` / `listScores` / `getScore` / `deleteScore`.
 *
 * These three remain for the one-time move, which is the only thing that
 * calls them. The file is left on disk with its songs taken out — not
 * deleted, because a file the user can see disappearing is a worse surprise
 * than an empty one, and because a downgrade to the previous build should
 * find a store it recognises rather than a missing one.
 *
 * `loadScoreSchedule` used to live outside this file, in
 * `src/songs/engineBridge.ts`, because `ipc.commands.test.ts` scrapes every
 * `invoke("…")` here and W1's command did not exist yet. It exists now, so
 * the bridge is gone and the wrapper is up with the rest of the scoring
 * calls, where the gate can see it.
 */
const SONGS_KEY = "songs";

/** Set once the songs in `songs.json` have been folded into the store. */
const SONGS_MOVED_KEY = "movedToPracticeStore";

let _songStore: Awaited<ReturnType<typeof load>> | null = null;
async function getSongStore() {
  if (!_songStore) _songStore = await load("songs.json", { autoSave: true, defaults: {} });
  return _songStore;
}

/** `undefined` when nothing was ever saved. The app ships no songs to seed. */
export async function listSongs(): Promise<SongRecord[] | undefined> {
  const store = await getSongStore();
  const songs = await store.get<SongRecord[]>(SONGS_KEY);
  return Array.isArray(songs) ? songs : undefined;
}

export async function saveSongs(songs: SongRecord[]): Promise<void> {
  const store = await getSongStore();
  await store.set(SONGS_KEY, songs);
}

/**
 * Whether the one-time move has already run. Recorded even when there was
 * nothing to move — "we looked" is the fact worth keeping, the same way
 * `db.rs` records the JSON history import.
 */
export async function songsMovedToStore(): Promise<boolean> {
  const store = await getSongStore();
  return (await store.get<boolean>(SONGS_MOVED_KEY)) === true;
}

export async function markSongsMovedToStore(): Promise<void> {
  const store = await getSongStore();
  await store.set(SONGS_MOVED_KEY, true);
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

// ---------------------------------------------------------------------------
// Takes (plans/JAM_MODE.md §4.4): your playing with the band mixed in, kept
// locally in the app's data directory, opt-in per jam. Nothing leaves the
// machine.
// ---------------------------------------------------------------------------

/** Start recording; the engine mixes the mic and the band into one WAV. */
export async function startTake(jamId: string): Promise<void> {
  return invoke("start_take", { jamId });
}

/** Stop and keep the take, or `null` when nothing was recording. */
export async function stopTake(): Promise<JamTake | null> {
  return invoke("stop_take");
}

export async function listTakes(jamId: string): Promise<JamTake[]> {
  return invoke("list_takes", { jamId });
}

export async function deleteTake(id: string): Promise<void> {
  return invoke("delete_take", { id });
}

/** Play a take through the engine; the band is silent while it plays. */
export async function playTake(id: string): Promise<void> {
  return invoke("play_take", { id });
}

export async function stopTakePlayback(): Promise<void> {
  return invoke("stop_take_playback");
}

export function onTakePlaybackEnded(callback: () => void) {
  return listen<null>("take-playback-ended", () => callback());
}

/**
 * A take ran into the twenty-minute cap and finished itself; the engine has
 * already kept it and written its record. Fires once per capped take.
 */
export function onTakeCapped(callback: () => void) {
  return listen<null>("take-capped", () => callback());
}

/** Bytes the takes directory holds, across every jam. A fact about the disk, not about a take. */
export async function takesDirSize(): Promise<number> {
  return invoke("takes_dir_size");
}

// ---- W21: the camera's recording, streamed to disk beside the take --------
//
// Four calls, in the order a pass uses them (`src-tauri/src/take_video.rs`).
// The picture is the webview's — `MediaRecorder` hands it over a chunk at a
// time — and everything about where it goes, what it may be called and who
// may delete it is Rust's. Nothing here reads a video back: the review plays
// it through the asset protocol, scoped to the takes directory.

/** Open the file. `startedMs` only names it until the take has an id. */
export async function takeVideoBegin(
  jamId: string,
  container: "mp4" | "webm",
  startedMs: number,
): Promise<void> {
  return invoke("take_video_begin", { jamId, container, startedMs });
}

/**
 * Append one chunk. **Raw bytes, never base64.**
 *
 * Tauri v2 carries a `Uint8Array` as the request's BODY rather than as JSON,
 * so a third of a megabyte of video crosses as a third of a megabyte. The
 * same chunk as a JSON array of numbers is four times the size and has to be
 * parsed a number at a time, every second, for as long as somebody plays; as
 * base64 it is a third bigger again and has to be decoded twice. The chunk's
 * number rides in a header because the body is the video and nothing else.
 */
export async function takeVideoAppend(seq: number, bytes: Uint8Array): Promise<number> {
  return invoke("take_video_append", bytes, { headers: { seq: String(seq) } });
}

/** Close it, file it under the take, and record how far it sits from the sound. */
export async function takeVideoFinish(
  takeId: string,
  offsetMs: number | null,
): Promise<{ path: string; bytes: number; offsetMs?: number }> {
  return invoke("take_video_finish", { takeId, offsetMs });
}

/** Throw it away: the pass was abandoned, or the take turned out to be nothing. */
export async function takeVideoDiscard(): Promise<void> {
  return invoke("take_video_discard");
}

/**
 * W25 — one frame of the picture, beside the take, so the shelf can show what
 * a take is a picture of rather than a row of dates.
 *
 * Raw bytes for `takeVideoAppend`'s reason, and the take's id in a header for
 * the same one: the body is the JPEG and nothing else.
 */
export async function takeThumbWrite(takeId: string, bytes: Uint8Array): Promise<string> {
  return invoke("take_thumb_write", bytes, { headers: { take: takeId } });
}

// ---- W25: "Save as a video" — the clip the player sends somebody ----------
//
// The same four-step pipe as the camera's, pointed somewhere else entirely:
// the file is the PLAYER'S, at a path they chose in a native save dialog, and
// the app neither lists it nor reads it back. Nothing is uploaded; there is no
// call here that could.

/**
 * Ask where the clip goes and open the file.
 *
 * Resolves to the path, or `null` when the player cancels the dialog — which
 * is not a failure and must not put a sentence on their screen.
 */
export async function clipSaveBegin(
  suggested: string,
  container: "mp4" | "webm",
): Promise<string | null> {
  return invoke("clip_save_begin", { suggested, container });
}

/** Append one composited chunk. Raw bytes, for `takeVideoAppend`'s reasons. */
export async function clipSaveAppend(seq: number, bytes: Uint8Array): Promise<number> {
  return invoke("clip_save_append", bytes, { headers: { seq: String(seq) } });
}

/** Close it. The path comes back so the screen can say where it went. */
export async function clipSaveFinish(): Promise<{ path: string; bytes: number }> {
  return invoke("clip_save_finish");
}

/** Cancelled, or something went wrong. Nothing is left at the chosen name. */
export async function clipSaveDiscard(): Promise<void> {
  return invoke("clip_save_discard");
}

/**
 * Show a file the player just saved, in their own file manager.
 *
 * The first thing somebody who has made a clip needs is to find it. Nothing
 * is opened, played or sent anywhere: the folder is shown and the app is
 * finished with the file.
 */
export async function revealInFolder(path: string): Promise<void> {
  return invoke("reveal_in_folder", { path });
}

/**
 * Ask the user for a folder of drum samples (a native folder dialog). Resolves
 * to the folder path, or null when they cancel. The folder is read on this
 * machine and never copied or uploaded.
 */
export async function pickKitFolder(): Promise<string | null> {
  return invoke("pick_kit_folder");
}

/** What a kit folder holds: which of the eight voices were found as WAV. */
export async function inspectKitFolder(dir: string): Promise<{ voices: string[]; missing: string[] }> {
  return invoke("inspect_kit_folder", { dir });
}
