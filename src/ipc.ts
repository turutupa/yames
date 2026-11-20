import { Channel, invoke } from "@tauri-apps/api/core";
import { currentFacts, feedbackUrl } from "./feedback/feedbackUrl";
import { listen } from "@tauri-apps/api/event";
import { IS_MOBILE } from "./platform";
import { openUrlNative, requestMicrophone } from "./mobile/native";
import { load } from "@tauri-apps/plugin-store";
import { soundStarting } from "./soundGate";
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
  // The desktop `open_url` command spawns `open` / `start` / `xdg-open`, and
  // there is no process to spawn on a phone, so a phone routes links through
  // the yames-mobile plugin's `Intent.ACTION_VIEW` (M04, from the `mobile`
  // branch). `IS_MOBILE` is a build-time constant, so this branch is not in a
  // desktop bundle at all.
  if (IS_MOBILE) return openUrlNative(url);
  return invoke("open_url", { url });
}

/**
 * "Send feedback": opens a prefilled GitHub issue in the system browser, with
 * the version and OS filled in (`src/feedback/feedbackUrl.ts`). The player
 * submits it there, or doesn't; nothing is sent from the app.
 */
export async function openFeedback(version: string, language?: string): Promise<void> {
  return openUrl(feedbackUrl(currentFacts(version, language)));
}

/**
 * "Export my practice data": the JSON `src/session/exportData.ts` built, written
 * where the player chooses in a native save dialog. Resolves with the path, or
 * null when they cancel. Nothing is sent anywhere; they attach the file to a
 * feedback issue themselves, or don't.
 */
export async function exportPracticeData(suggested: string, json: string): Promise<string | null> {
  return invoke<string | null>("export_practice_data", { suggested, json });
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
  // The coach's voice stops before anything sounds (src/soundGate.ts).
  soundStarting();
  return invoke("toggle_playback");
}

export async function setPlaying(playing: boolean): Promise<void> {
  if (playing) soundStarting();
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

/**
 * Set the bar's beat grouping.
 *
 * `atBarLine` is the setlist's, and nothing else's: a step switch is posted
 * ON a bar line, and the engine then gives the new meter to the bar that line
 * opened rather than restacking its grid one tick later. Without it the seam
 * between two steps in different meters was a one-beat bar — two accents a
 * beat apart — and the step arriving lost a bar of real playing.
 *
 * Every other caller leaves it out. A meter changed by hand while the click
 * runs restarts the bar under your fingers, which is what somebody dragging
 * 4/4 to 3/4 on the meter screen is asking for.
 */
export async function setBeatGroups(groups: number[], atBarLine = false): Promise<void> {
  // Sent only when it is true. Rust reads it as an `Option<bool>`, so a
  // caller that has never heard of bar lines sends the payload it always
  // sent and gets the behaviour it always got.
  return invoke("set_beat_groups", atBarLine ? { groups, atBarLine } : { groups });
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
// Android test builds: the in-app update to the newest beta APK
// ---------------------------------------------------------------------------
//
// The yames-mobile plugin does the work (`BetaUpdate.kt`): it reads the feed
// natively (GitHub's asset host sends no CORS headers), downloads the APK into
// the cache and opens the system installer. It refuses on any build whose
// manifest does not declare REQUEST_INSTALL_PACKAGES, which only the beta
// build's does. Callers are behind `IS_BETA && IS_MOBILE`.

/** `android-beta.json`, as the plugin read it, and what is installed. */
export interface AndroidBetaProbe {
  installedVersionCode: number;
  installedVersionName: string;
  /** Android already lets Yames install packages. */
  canInstall: boolean;
  /** A verified APK for some version is already in the cache. */
  downloaded: boolean;
  version: string;
  versionCode: number;
  url: string;
  sha256: string;
  size: number;
  notes: string;
}

export interface AndroidBetaProgress {
  received: number;
  /** Bytes, or -1/0 when unknown. */
  total: number;
}

export async function androidBetaProbe(url: string): Promise<AndroidBetaProbe> {
  return invoke<AndroidBetaProbe>("plugin:yames-mobile|beta_update_probe", {
    payload: { url },
  });
}

export async function androidBetaDownload(
  feed: Pick<AndroidBetaProbe, "url" | "sha256" | "size" | "versionCode">,
  onProgress: (p: AndroidBetaProgress) => void,
): Promise<void> {
  const channel = new Channel<AndroidBetaProgress>();
  channel.onmessage = onProgress;
  await invoke("plugin:yames-mobile|beta_update_download", {
    payload: {
      url: feed.url,
      sha256: feed.sha256,
      size: feed.size,
      versionCode: feed.versionCode,
    },
    onProgress: channel,
  });
}

/**
 * Open the system installer on the downloaded APK. `needsPermission` means
 * Android's "Install unknown apps" page for Yames was opened instead; the
 * user allows it, comes back, and installs again.
 */
export async function androidBetaInstall(): Promise<{ started: boolean; needsPermission: boolean }> {
  return invoke("plugin:yames-mobile|beta_update_install");
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

/**
 * The phone's activity went off the screen or came back. On Android the
 * engine parks its output stream while the app is away and nothing needs it.
 */
export async function setAppInBackground(hidden: boolean): Promise<void> {
  return invoke("set_app_in_background", { hidden });
}

/**
 * Send both device lists again (`audio-devices-changed`,
 * `audio-input-devices-changed`). A phone has no device poll: its native side
 * asks for this when a USB interface, a jack adapter or headphones come or go.
 */
export async function refreshAudioDevices(): Promise<void> {
  return invoke("refresh_audio_devices");
}

/**
 * A phone's audio route changed and a stream was closed under it
 * (`android_route.rs`): `output` has already been reopened by the engine;
 * `input` is for the frontend to restart (see `src/mobile/inputRoute.ts`).
 */
export function onAudioRouteChanged(callback: (kind: "input" | "output") => void) {
  return listen<{ kind: "input" | "output" }>("audio-route-changed", (e) => callback(e.payload.kind));
}

export function onAudioInputDevicesChanged(callback: (devices: AudioInputDevice[]) => void) {
  return listen<AudioInputDevice[]>("audio-input-devices-changed", (e) => callback(e.payload));
}

/** What `startEvaluation` rejects with on a phone whose microphone is refused. */
export const MIC_PERMISSION_DENIED =
  "Yames is not allowed to use the microphone. Allow it in Android's settings: Apps, Yames, Permissions, Microphone.";

/**
 * What `startEvaluation` rejects with when the microphone dialog was never
 * answered (it was dismissed by the system, or hidden behind another window).
 */
export const MIC_PERMISSION_UNANSWERED =
  "The microphone permission was not answered, so Yames is not listening. Try again, or allow it in Android's settings: Apps, Yames, Permissions, Microphone.";

/**
 * How long the microphone dialog may stay unanswered. Every start and stop of
 * the input waits its turn behind this one (`useEvaluation`'s `serial`), so a
 * dialog that never answers must not hold an Exit or a Session's end forever.
 */
export const MIC_PERMISSION_TIMEOUT_MS = 60_000;

/** The permission, or `"unanswered"` once `MIC_PERMISSION_TIMEOUT_MS` has passed. */
function askForMicrophone(): Promise<boolean | "unanswered"> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"unanswered">((resolve) => {
    timer = setTimeout(() => resolve("unanswered"), MIC_PERMISSION_TIMEOUT_MS);
  });
  return Promise.race([requestMicrophone(), timeout]).finally(() => clearTimeout(timer));
}

export async function startEvaluation(deviceName?: string, inputChannel?: number, coachMode?: "default" | "pro"): Promise<void> {
  // A phone asks for the microphone at the moment the input is first opened
  // — the first-run input step, a Session, or Settings' test — and every one
  // of those comes through here. A USB interface or a jack adapter is the
  // same permission on Android. Build-time constant: not in a desktop bundle.
  if (IS_MOBILE) {
    const allowed = await askForMicrophone();
    // Treated as refused: the input stays off and the caller's screen says why.
    if (allowed === "unanswered") throw new Error(MIC_PERMISSION_UNANSWERED);
    if (!allowed) throw new Error(MIC_PERMISSION_DENIED);
  }
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
 * Listen first (card #28): the Session is playing a demo of the Exercise
 * through the speakers (`true`, `lengthMs` long with its count-in), or has
 * stopped (`false`). While it plays, what the input HEARS (a microphone or an
 * interface) is not the player: the engine drops those onsets before the
 * timing analyzer (no segment, beat feedback, coach tip or practice stat
 * counts the demo, and no `onset-detected` reaches the page), closing the
 * open segment first. MIDI is never gated: a keyboard cannot hear speakers.
 *
 * Off, heard onsets count again half a second later, once the demo's last
 * note has rung out (`tail`, the default), or at once with `tail: false` (a
 * demo stopped to start something the player plays straight away). The
 * engine bounds the gate by `lengthMs` plus that tail, and by three minutes
 * whatever is said, and lifts it when the input stops: a page that reloads
 * mid-demo cannot leave the input deaf.
 */
export async function setListenDemo(on: boolean, options: { lengthMs?: number; tail?: boolean } = {}): Promise<void> {
  return invoke("set_listen_demo", {
    on,
    lengthMs: options.lengthMs !== undefined ? Math.max(0, Math.round(options.lengthMs)) : null,
    tail: options.tail ?? null,
  });
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
export async function loadScoreSchedule(
  schedule: ScoreSchedule,
  passBars?: readonly ScorerPassBar[],
  notes?: readonly ScorerNotePitch[],
  details?: readonly ScorerNoteDetail[],
): Promise<void> {
  // Songs loads a schedule with no bars to judge against; a Session sends its
  // Exercise's, and the scorer's grade then carries `pass` (score/pass.rs).
  // With the written pitches too, a `noteIdentity` bar is checked from the
  // Take's own audio after it (`score/notes.rs`).
  if (!passBars) return invoke("load_score_schedule", { schedule });
  // `details` (length, bend, technique of each note) is for the note verifier
  // (`score/verify.rs`), which confirms the written notes one by one after
  // the Take; it is only worth sending with the pitches.
  if (!notes || notes.length === 0) return invoke("load_score_schedule", { schedule, passBars });
  return invoke(
    "load_score_schedule",
    details && details.length > 0 ? { schedule, passBars, notes, details } : { schedule, passBars, notes },
  );
}

/**
 * What else the scorer may know of a written note (`score/verify.rs`
 * `NoteDetail`). `string` is 1 for the high E; `tech` are `PathTechnique`
 * names; `bend` is in semitones.
 */
export type ScorerNoteDetail = {
  id: number;
  durBeats: number;
  bend?: number;
  /** `release` or `prebend` (`score/curves.rs` `BendShape`); absent: up and held. */
  bendShape?: "release" | "prebend";
  string?: number;
  tech?: string[];
};

/** How a written note is produced, as the verifier tallies it. */
export type VerifierNoteKind =
  | "chordTone"
  | "hammer"
  | "pull"
  | "tap"
  | "slideTo"
  | "bend"
  | "harmonic"
  | "palmMute"
  | "picked";

/** One technique's line of the verifier's account (`score/verify.rs`). */
export type VerifierKindTally = {
  kind: VerifierNoteKind;
  /** Notes of this kind the Take reached. */
  due: number;
  sounded: number;
  notSounded: number;
  wrong: number;
  /** "Couldn't tell": never a miss, never part of a pass. */
  unsure: number;
};

/**
 * The note verifier's account of a Take, on the late grade only: which
 * written notes the note model confirmed. Information, except that
 * `pass.notes.source === "verifier"` says the right-notes count used it.
 */
export type VerifierReport = {
  status: "ran" | "noModel" | "noAudio" | "failed";
  kinds?: VerifierKindTally[];
  notes?: {
    result: number;
    onsetId: number;
    pass: number;
    noteId: number;
    kind: VerifierNoteKind;
    heard: "yes" | "no" | "wrong" | "unsure";
    how: "pick" | "soft" | "none";
    heardMidi?: number;
    deviationMs?: number;
    strength: number;
  }[];
  lagMs: number;
  modelMs: number;
  ruleMs: number;
  audioS: number;
};

/** Bends and vibrato of a Take read from the pitch track (`score/curves.rs` `CurveReport`). */
export type CurveReport = {
  bends: { due: number; onPitch: number; flat: number; sharp: number; unsure: number };
  vibrato: { due: number; present: number; absent: number; unsure: number };
  notes: {
    result: number;
    noteId: number;
    bendWritten: number;
    shape: "up" | "release" | "prebend";
    vibratoWritten: boolean;
    frames: number;
    startCents?: number;
    peakCents?: number;
    holdCents?: number;
    endCents?: number;
    vibratoCents?: number;
    vibratoHz?: number;
    bend?: "onPitch" | "flat" | "sharp" | "unsure";
    released?: boolean;
    vibrato?: "present" | "absent" | "unsure";
  }[];
  ms: number;
};

/**
 * "Keep my last Takes for troubleshooting": with it on, each graded Take's
 * input audio and what was expected of it are written under the app's data
 * folder (the last 20), for `detect-bench replay`
 * (`plans/detection/MEASURE.md`). Off by default; nothing is sent anywhere.
 * Resolves to the folder when on.
 */
export async function setTakeDiagnostics(enabled: boolean): Promise<string | null> {
  return invoke<string | null>("set_take_diagnostics", { enabled });
}

/**
 * Recording session mode (card #109, `src-tauri/src/capture.rs`): with a
 * session on, every Take's raw input audio and what it was are kept under the
 * app's data folder (`capture/<date-time>/`), for `npm run corpus:ingest` on
 * the DGX. Off by default; nothing is sent anywhere.
 */
export type CaptureStatus = {
  active: boolean;
  session: string | null;
  dir: string | null;
  takes: number;
  bytes: number;
  warnBytes: number;
  capBytes: number;
  warn: boolean;
  stopped: boolean;
};

/** Start a session (plays the start sync chirp). `meta` goes into session.json. */
export async function captureStart(meta: unknown, capGb: number | null): Promise<{ status: CaptureStatus; chirp: unknown }> {
  return invoke("capture_start", { meta, capGb });
}

/** End the session (plays the end sync chirp). Resolves to its folder. */
export async function captureEnd(): Promise<string | null> {
  return invoke<string | null>("capture_end");
}

export async function captureStatus(): Promise<CaptureStatus> {
  return invoke<CaptureStatus>("capture_status");
}

/** What the next Take is (Path, Step, Exercise, variant, mode); `null` between Takes. */
export async function captureSetContext(context: Record<string, unknown> | null): Promise<void> {
  return invoke("capture_set_context", { context });
}

/** "That one felt off": flags the current or last Take. */
export async function captureMark(): Promise<unknown> {
  return invoke("capture_mark");
}

/** A jam or free play starts / ends: kept in segments, ungraded. */
export async function captureFreeBegin(context: Record<string, unknown>): Promise<void> {
  return invoke("capture_free_begin", { context });
}

export async function captureFreeEnd(heard: unknown): Promise<void> {
  return invoke("capture_free_end", { heard: heard ?? null });
}

/** Show the session's folder (the one on, else the last). */
export async function captureReveal(): Promise<string> {
  return invoke<string>("capture_reveal");
}

/** Zip the session (the one on, else the last). Resolves to the zip's path. */
export async function captureZip(): Promise<string> {
  return invoke<string>("capture_zip");
}

/**
 * "Send my test sessions to my computer" (card #123, test builds only,
 * `src-tauri/src/capture_outbox.rs`, `src/capture/inbox.ts`): the files side.
 * The upload is `fetch` from the webview.
 */
export type CaptureSessionEntry = {
  id: string;
  startedWallMs: number | null;
  endedWallMs: number | null;
  active: boolean;
};

/** The recording sessions on this device, oldest first. */
export async function captureSessions(): Promise<CaptureSessionEntry[]> {
  return invoke<CaptureSessionEntry[]>("capture_sessions");
}

export type CaptureOutboxZip = { id: string; size: number; shared: string | null; sharedError: string | null };

/** Zip session `id` for sending (once); `shared` also copies it to Documents/Yames/capture on Android. */
export async function captureOutboxPrepare(id: string, shared: boolean): Promise<CaptureOutboxZip> {
  return invoke<CaptureOutboxZip>("capture_outbox_prepare", { id, shared });
}

/** Up to `len` bytes of that zip from `offset`, raw. */
export async function captureOutboxChunk(id: string, offset: number, len: number): Promise<ArrayBuffer> {
  return invoke<ArrayBuffer>("capture_outbox_chunk", { id, offset, len });
}

/** The computer has it: drop the zip kept for sending. */
export async function captureOutboxClear(id: string): Promise<void> {
  return invoke("capture_outbox_clear", { id });
}

/** The written pitch of one note a schedule names (`pitch.rs` `ScoreNote`). */
export type ScorerNotePitch = { id: number; midi: number };

/** Back to free play. Safe to call when nothing is loaded. */
export async function clearScoreSchedule(): Promise<void> {
  return invoke("clear_score_schedule");
}

// ── Free play: the key and the chord heard (detection M7) ─────────────────

/** `harmony::Key`: pitch class of the tonic, concert pitch. */
export type HeardKey = { tonic: number; mode: "major" | "minor" | "blues" };
export type HeardKeyState = "listening" | "unsure" | "settled" | "chart";
export type HeardQuality = "maj" | "min" | "dom7" | "maj7" | "min7";
export type HeardChord = {
  root: number;
  /** Null for a chart's chord, whose `label` names it. */
  quality: HeardQuality | null;
  label: string | null;
  fromChart: boolean;
};
/** `harmony::Reading`. `notes` (inside and outside counts) is for tools: not shown. */
export type HeardReading = {
  keyState: HeardKeyState;
  key: { key: HeardKey; scale: string; confidence: number; relativeToo: boolean } | null;
  chord: HeardChord | null;
  settledAtS: number | null;
  heardS: number;
};
/** `harmony::worker::Live`: a reading and the chord a page may show. */
export type HeardLive = HeardReading & { shownChord: HeardChord | null };
/** `harmony::worker::Summary`: what a stretch of free play came to. */
export type HeardSummary = {
  reading: HeardReading;
  chords: { root: number; quality: HeardQuality | null; beats: number }[];
  chordBeats: number;
  beats: number;
};
/** `harmony::Chart`, in concert pitch. */
export type HeardChart = {
  key: HeardKey | null;
  bars: { root: number; tones: number[]; label: string }[][];
  beatsPerBar: number;
};

/**
 * Start reading the key and chords from the input that is listening. The
 * worker's id, for `harmonyStop`; null when the input is not listening or the
 * build has no note model: nothing was started.
 *
 * `clearStale`: free play is beginning (not a retry after the worker ended
 * by itself), so a schedule some screen left loaded is cleared.
 */
export async function harmonyStart(chart: HeardChart | null, bpm: number, clearStale: boolean): Promise<number | null> {
  return invoke<number | null>("harmony_start", { chart, bpm, clearStale });
}

/** Bar `bar` of the jam's form starts now. */
export async function harmonyMarkBar(bar: number, bpm: number): Promise<void> {
  return invoke("harmony_mark_bar", { bar, bpm });
}

/** The jam's tempo changed. With no chart there are no bar marks to carry it. */
export async function harmonySetTempo(bpm: number): Promise<void> {
  return invoke("harmony_set_tempo", { bpm });
}

/**
 * Stop worker `id`. What it heard, or null when it is no longer the one
 * running (it was replaced, or ended with the input).
 */
export async function harmonyStop(id: number): Promise<HeardSummary | null> {
  return invoke<HeardSummary | null>("harmony_stop", { id });
}

/** A new reading, or null: the worker ended, or the input was stopped. */
export function onHarmonyReading(callback: (live: HeardLive | null) => void) {
  return listen<HeardLive | null>("harmony-reading", (e) => callback(e.payload));
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
  /**
   * What a Take on a known schedule came to (`score.rs` `TakeGrade`, W1 of the
   * revamp wave). Absent in free play, and from a build without it.
   */
  takeGrade?: ScorerTakeGrade;
};

/** Why the scorer would not grade a Take (`score.rs` `NoCatchReason`). */
export type NoCatchReason = "nothingHeard" | "tooFewHeard" | "tooManyExtras" | "lowConfidence";

/** One played bar of a Take, counted from 0 in played order. */
export type ScorerBarMetrics = {
  bar: number;
  due: number;
  heard: number;
  missed: number;
  extra: number;
  /** 0 to 1. Null under three heard. */
  evenness: number | null;
  evennessSigmaMs: number | null;
};

/**
 * The scorer's facts about one Take (`score.rs` `TakeGrade`). A stable shape:
 * fields are only ever added. `score` and `evenness` are null when the verdict
 * is "didntCatchEnough", so nothing can show a number by accident. Named apart
 * from `session/grade.ts`'s `TakeGrade`, which is the pass bar's verdict.
 */
export type ScorerTakeGrade = {
  verdict: "graded" | "didntCatchEnough";
  noCatchReason?: NoCatchReason;
  score: number | null;
  evenness: number | null;
  evennessSigmaMs: number | null;
  due: number;
  heard: number;
  missed: number;
  extra: number;
  notReached: number;
  heardRatio: number;
  confidence: number | null;
  calibration: {
    offsetMs: number;
    source: "none" | "cached" | "take";
    leanMs?: number;
  };
  bars: ScorerBarMetrics[];
  /** The tempo the Take was graded at. */
  bpm: number;
  /** Judged against the pass bars the schedule was loaded with; absent without them. */
  pass?: ScorerPassResult;
  /**
   * The pitch pass over this Take's audio is still running: `noteIdentity` is
   * not assessed in `pass` yet, and `getTakeGradeWithNotes` brings the grade
   * with it in.
   */
  notesPending?: boolean;
  /**
   * Which pitch pass this grade belongs to: the one coming, on a grade with
   * `notesPending`; the one that made it, on the grade with right notes.
   */
  notesSerial?: number;
  /** The note verifier's account of the Take, on the late grade (`VerifierReport`). */
  verifier?: VerifierReport;
  /** Bends and vibrato read as curves (`score/curves.rs`), on the late grade. Information only. */
  curves?: CurveReport;
};

/** Whether right notes could be measured on a Take (`score/pass.rs` `NotesStatus`). */
export type ScorerNotesStatus =
  | "measured"
  | "notRun"
  | "tooFast"
  | "tooFew"
  | "notesRing"
  | "octaveUnsure";

/** The pitch pass over a Take's finished bars (`score/pass.rs` `NotesCheck`). */
export type ScorerNotesCheck = {
  /**
   * Who gave the verdicts: absent for the pitch tracker alone, `"verifier"`
   * when the note verifier's were merged in (`score/verify.rs`).
   */
  source?: "pitchPass" | "verifier";
  status: ScorerNotesStatus;
  right: number;
  wrong: number;
  octave: number;
  /** Heard, but no pitch came out of it. */
  unpitched: number;
};

/** One entry of an Exercise's `passBars`, as `src/paths/format.ts` writes it. */
export type ScorerPassBar = {
  metric: string;
  min?: number;
  max?: number;
  overBars: number;
};

/** One pass bar, in the window that explains the verdict (`score/pass.rs` `BarCheck`). */
export type ScorerBarCheck = ScorerPassBar & {
  /** Null: the window had nothing to measure it on, which does not hold. */
  measured: number | null;
  held: boolean;
};

/** What `score/pass.rs` `evaluate` says about one Take. */
export type ScorerPassResult = {
  verdict: "passed" | "failed" | "didntCatchEnough" | "tooShort";
  windowBars: number;
  finishedBars: number;
  heldBars: number;
  heldFromBar?: number;
  countsForCleanTempo: boolean;
  windowFromBar?: number;
  checks: ScorerBarCheck[];
  /** Metrics the bars named that this Take could not measure; not in the verdict. */
  notAssessed: string[];
  /** What the pitch pass made of the notes, when a bar names `noteIdentity`. */
  notes?: ScorerNotesCheck;
};

/**
 * The grade of the Take just closed, for one nothing was heard on: no segment
 * opened, so `practice-segment-ended` never carried one. Call
 * `closeOpenSegment` first and this before the schedule is cleared. Null when
 * no schedule was loaded, or from a build without the command.
 */
export async function getTakeGrade(): Promise<ScorerTakeGrade | null> {
  return invoke<ScorerTakeGrade | null>("get_take_grade");
}

/**
 * The grade of the Take just closed with right notes in it, once the pitch pass
 * over its audio is done. Ask after a grade said `notesPending`. Waits up to
 * `timeoutMs` (the scorer caps it at 8 s); null when it was not done by then,
 * and the timing grade stands with `noteIdentity` not assessed.
 */
export async function getTakeGradeWithNotes(timeoutMs: number): Promise<ScorerTakeGrade | null> {
  return invoke<ScorerTakeGrade | null>("get_take_grade_with_notes", { timeoutMs });
}

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
// lives in `practice.db` beside `settings.json` instead of inside it. Each
// launch imports whatever the JSON array holds that the store has not seen,
// and leaves the array itself alone.
//
// A store that will not open (corrupt, or written by a newer Yames) answers
// reads with nothing — it is never deleted — and a finished session is then
// kept in `settings.json` the way v1.2.1 kept it rather than lost.
// ---------------------------------------------------------------------------
import type { SavedSession } from "./types";

/** Where a saved session went: the practice store, or — when the store could
 *  not take it — `settings.json`, the way older builds kept history. */
export type SaveSessionOutcome = "stored" | "keptInSettings";

export async function saveSession(session: SavedSession): Promise<SaveSessionOutcome> {
  return invoke<SaveSessionOutcome>("save_session", { session });
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

import type { SongBacking, SongMixGains, SongTransport } from "./songs/types";

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
  startTick?: number,
): Promise<SongLoaded> {
  return invoke<SongLoaded>("set_song_range", {
    range,
    loops,
    tempoPercent,
    countInBars: countInBars ?? null,
    // The playhead (W37 item 1). `null` leaves the engine's where it is, the
    // same as the count-in beside it.
    startTick: startTick === undefined ? null : Math.max(0, Math.round(startTick)),
  });
}

/**
 * How loud the click is, and each track of the file.
 *
 * Applies on the next buffer and recompiles nothing, so this is safe to send
 * on every step of a fader drag. Out-of-range values are clamped rather than
 * refused — a fader that stops moving is better than a dialog. A fader on a
 * track the synthesiser plays is heard about a tenth of a second later, which
 * is how long the audio already rendered ahead of the playhead takes to
 * drain (`src-tauri/src/synth.rs`).
 */
export async function setSongMix(mix: SongMixGains): Promise<void> {
  return invoke("set_song_mix", { mix });
}

/**
 * Go to a place in the song that is playing, without stopping it.
 *
 * `set_song_range` recompiles the piece and starts it again, which is right
 * for a new range and wrong for a click on bar 34 of the one that is
 * sounding: it would end the pass, and ending a pass ends the attempt and
 * raises the review (`COACH_UX.md` A3). This moves a cursor inside the table
 * the engine already has. The click does not miss a beat, the take goes on
 * recording, and the band is cut over a few milliseconds rather than left
 * ringing from somewhere the player no longer is.
 *
 * `tick` is the SONG's own tick — the one unit the playhead is kept in
 * everywhere above this (W37 item 1), so the mark on the page, the place the
 * next press of Play begins and what this moves are the same number.
 */
export async function seekSong(tick: number): Promise<void> {
  return invoke("seek_song", { tick: Math.max(0, Math.round(tick)) });
}

/**
 * Play a song's other instruments out of a `.sf2` of the player's own.
 *
 * Desktop only; the phone build has no Songs. An empty path goes back to the
 * set the app ships. It takes effect on the next song, because a sound set is
 * decoded when a piece is compiled — and a set that will not open falls back
 * to the shipped one rather than leaving the song silent.
 */
export async function setSongSoundFont(path: string | null): Promise<void> {
  return invoke("set_song_sound_font", { path });
}

/** The native file dialog for one, filtered to `.sf2`. Null if they cancel. */
export async function pickSoundFont(): Promise<string | null> {
  return invoke("pick_sound_font");
}

/** Where the player's own sound set is remembered, if they chose one. */
export const SONG_SOUND_FONT_KEY = "songSoundFont";

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

// --- learning paths ---------------------------------------------------------

/** Which Path a player is on, and where (`db.rs` `PathState`). */
export type PathStateRow = {
  pathId: string;
  /** The Level they chose. Absent until a pack has Levels. */
  level?: string;
  /** The Step they are on. Absent means the Path's first. */
  currentStepId?: string;
  startedAt: number;
  updatedAt: number;
};

/** One graded go at an Exercise (`db.rs` `PathTake`). */
export type PathTakeRow = {
  id: string;
  pathId: string;
  stepId: string;
  exerciseId: string;
  startedAt: number;
  bpm: number;
  /** Bars the player got through. */
  bars: number;
  /** False is "I didn't catch enough": no grade, and it counts for nothing. */
  caught: boolean;
  passed: boolean;
  /** Which notes these were, when the Exercise has variants. */
  variantSeed?: number;
  /** What was measured. See `src/session/takeMeasures.ts`. */
  facts: unknown;
};

/** A clean tempo (`db.rs` `ExerciseCeiling`). */
export type ExerciseCeilingRow = {
  /** `<path id>/<exercise id>`. */
  exerciseKey: string;
  cleanBpm: number;
  lastPracticed: number;
};

export async function savePathState(state: PathStateRow): Promise<void> {
  return invoke("save_path_state", { state });
}

export async function listPathStates(): Promise<PathStateRow[]> {
  return invoke<PathStateRow[]>("list_path_states");
}

/** Keep a Take, and its clean tempo if it earned one, in one transaction. */
export async function savePathTake(take: PathTakeRow, cleanBpm: number | null): Promise<void> {
  return invoke("save_path_take", { take, cleanBpm });
}

export async function listPathTakes(limit: number): Promise<PathTakeRow[]> {
  return invoke<PathTakeRow[]>("list_path_takes", { limit });
}

export async function listExerciseCeilings(): Promise<ExerciseCeilingRow[]> {
  return invoke<ExerciseCeilingRow[]>("list_exercise_ceilings");
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
  /**
   * Each local tier on its own (leg ms2): both can be on disk side by side,
   * in `models/brain/<tier>/`. One entry per tier. Absent from an older
   * backend, where the single-brain fields above are the whole truth
   * (`coach/brainDisk.ts` reads either).
   */
  tiers?: TierStatus[];
  /** Bytes free on the models' volume; null when the platform cannot say. */
  freeBytes?: number | null;
};

/** One tier's brain on disk (`ModelStatus.tiers`). */
export type TierStatus = {
  tier: string;
  onDisk: boolean;
  sizeBytes: number;
  family: string | null;
  updateRecommended: boolean;
  /** A paused download of this tier, kept to resume from; 0 when none. */
  partialBytes: number;
  /** What the pinned file weighs. */
  downloadBytes: number | null;
  /** A SHA-256 is pinned for it and checked before it is adopted. */
  checksumPinned: boolean;
  /**
   * Bytes of this tier left in the old single place and not in use: an older
   * copy of the model that the tier's own copy shadows, and a paused
   * download that could not be moved. Settings shows it with its own Remove.
   * Absent from an older backend.
   */
  olderCopyBytes?: number;
};

export type DownloadProgress = {
  component: string;
  downloadedBytes: number;
  totalBytes: number;
  fraction: number;
  done: boolean;
  /**
   * "transfer" while bytes arrive, "checking" while the brain's checksum is
   * computed (the bytes then count what has been hashed).
   */
  stage?: "transfer" | "checking";
  /** The download it belongs to (`startModelDownload`'s answer). */
  generation?: number;
};

/** The `model-download-complete` payload. */
export type DownloadComplete = {
  success: boolean;
  /**
   * The download it belongs to. Downloads are numbered in the order they
   * start; an event from an earlier one than the download the UI started
   * is stale (a stopped thread's late word) and is ignored.
   */
  generation?: number;
  tier?: string;
  /** Paused or cancelled by the player. */
  cancelled?: boolean;
  /** Cancelled, and the partial file was removed. */
  discarded?: boolean;
  /** "space": not enough room; "checksum": the file did not match its pinned hash. */
  code?: "space" | "checksum";
  needBytes?: number;
  freeBytes?: number;
  error?: string;
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

/**
 * "Remove models": everything, voices included. With a `tier`, that tier's
 * brain only (Settings → Coach, per tier); the other tier and the voices
 * stay, and Rust unloads the model only when it may be the one deleted.
 */
/**
 * Remove models: all of them (no tier), one tier's, or, with `olderCopy`,
 * only the older copy of that tier left in the old place (the copy in use
 * stays).
 */
export async function deleteModels(tier?: string, opts?: { olderCopy?: boolean }): Promise<void> {
  if (!tier) return invoke("delete_models");
  return opts?.olderCopy ? invoke("delete_models", { tier, olderCopy: true }) : invoke("delete_models", { tier });
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
export async function loadCoachModel(tier?: string): Promise<boolean> {
  // The tier's own file: both tiers may be on disk side by side.
  return tier ? invoke<boolean>("load_coach_model", { tier }) : invoke<boolean>("load_coach_model");
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

/**
 * The Ask kind (DESIGN 9.4): one model call a turn, with the static prefix
 * (system text and the tool list), the context (at most 450 tokens), the
 * question and, for a choice, the GBNF grammar the registry generates. Rust
 * keeps the prefix decoded between turns. A malformed grammar rejects with
 * a message starting "grammar:"; no model is `noModel`, not an error.
 *
 * Only `answered` is an answer to act on. `truncated` is text the budget
 * or the whitespace guard cut off (under a grammar, at most the start of a
 * sentence of it: never parse it as a tool call); `deadEnd` is a valid
 * grammar the model could not continue under; `timedOut` is the turn's
 * deadline, distinct from the player's `cancelled`. In all of those the
 * rule-made answer stands.
 */
export type CoachAskMode = "choice" | "prose";

export interface CoachAskRequest {
  /** From `newGenerationId()`: what `cancelGeneration` takes. */
  generationId: number;
  mode: CoachAskMode;
  prefix: string;
  context: string;
  question: string;
  grammar?: string | null;
  /** The turn's budget in Rust, queue and generation together.
   *  `COACH_ASK_TIMEOUT_MS` when absent. */
  deadlineMs?: number;
}

interface CoachAskTimings {
  prefixCached: boolean;
  promptMs: number;
  totalMs: number;
}

export type CoachAskOutcome =
  | ({
      /** The model ended the answer itself, inside the budget. */
      status: "answered";
      text: string;
    } & CoachAskTimings)
  | ({
      /** Cut off: not a complete answer. */
      status: "truncated";
      text: string;
      by: "budget" | "whitespace";
    } & CoachAskTimings)
  | { status: "deadEnd"; why: string }
  | { status: "cancelled" }
  | { status: "timedOut" }
  | { status: "noModel" };

/** DESIGN 5.5: a turn fits 8 s or the rule-made answer stands. Rust holds
 *  the turn to it (`deadlineMs`); the wrapper's own timer is a backstop
 *  `COACH_ASK_BACKSTOP_MS` later, for a Rust side that never answers. */
export const COACH_ASK_TIMEOUT_MS = 8_000;
export const COACH_ASK_BACKSTOP_MS = 1_000;
/** Rust's own cap on a turn (`ASK_MAX_DEADLINE_MS`). A larger `deadlineMs`
 *  is clamped to it here, before it is sent and before the backstop is
 *  set: past 2^31 - 1 ms `setTimeout` fires at once. */
export const COACH_ASK_MAX_DEADLINE_MS = 60_000;

// Unique for the life of the Rust process, across webview reloads too: a
// cancel Rust holds for an id it has not seen yet must not meet a new turn.
let nextGenerationId = Date.now() * 1_000;

export function newGenerationId(): number {
  nextGenerationId += 1;
  return nextGenerationId;
}

/** Stop an Ask turn, queued or running. True when Rust found it. */
export async function cancelGeneration(generationId: number): Promise<boolean> {
  return invoke<boolean>("cancel_generation", { generationId });
}

/** One Ask turn. Rust ends it at its deadline with `timedOut`; if Rust has
 *  not answered a backstop later, the turn is cancelled there and this
 *  rejects with `Error("coach_ask_timeout")`. */
export async function coachAsk(request: CoachAskRequest): Promise<CoachAskOutcome> {
  const asked = request.deadlineMs ?? COACH_ASK_TIMEOUT_MS;
  const deadlineMs = Number.isFinite(asked)
    ? Math.min(Math.max(0, Math.floor(asked)), COACH_ASK_MAX_DEADLINE_MS)
    : COACH_ASK_MAX_DEADLINE_MS;
  const call = invoke<CoachAskOutcome>("coach_ask", {
    request: { ...request, grammar: request.grammar ?? null, deadlineMs },
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      call,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          void cancelGeneration(request.generationId).catch(() => false);
          reject(new Error("coach_ask_timeout"));
        }, deadlineMs + COACH_ASK_BACKSTOP_MS);
      }),
    ]);
  } finally {
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

export function onDownloadComplete(callback: (result: DownloadComplete) => void) {
  return listen<DownloadComplete>("model-download-complete", (e) => callback(e.payload));
}

/**
 * Start (or resume) a brain download. Rust takes only the pinned URL of the
 * tier asked for, and answers with the download's number, which every one
 * of its events carries (`generation`).
 */
export async function startModelDownload(url: string, component: string, filename: string, tier: string): Promise<number | undefined> {
  return invoke<number | undefined>("start_model_download", { url, component, filename, tier });
}

/**
 * Stop the model download. Plain, it is a pause: Rust keeps the bytes and
 * the next start resumes. With `discard`, a cancel: the partial file of
 * `tier` / `url` is removed too (a paused one included).
 */
export async function cancelModelDownload(opts?: { discard: boolean; tier: string; url: string }): Promise<void> {
  return opts ? invoke("cancel_model_download", opts) : invoke("cancel_model_download");
}

export function onPlaybackFinished(callback: () => void) {
  return listen<void>("playback-finished", () => callback());
}

// ---------------------------------------------------------------------------
// Jam (plans/JAM_MODE.md, plans/tasks/jam/BRIEF.md)
// ---------------------------------------------------------------------------

import type { Jam, JamEngineConfig, JamPositionCommand, JamTake, TakeSound } from "./jam/types";
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

/**
 * Start recording.
 *
 * With no `sound`, or with `"yamesAndInput"`, the engine mixes your input and
 * the band into one WAV, exactly as takes have always worked. With
 * `"everything"` it instead records what comes out of the speaker Yames is
 * playing through — your amp simulator and anything else that is making a
 * sound, in stereo, with no microphone and no dry stem
 * (`plans/SONGS.md` A12, `src-tauri/src/loopback.rs`).
 *
 * **The speakers are listened to only between this call and `stopTake`.** A
 * failure to open that capture refuses the take rather than quietly recording
 * the other thing under the same name.
 */
export async function startTake(jamId: string, sound?: TakeSound): Promise<void> {
  return invoke("start_take", { jamId, sound: sound ?? null });
}

/** What `checkTakeSound` found. */
export interface TakeSoundCheck {
  /** Can this machine record what it plays at all? */
  can: boolean;
  /** The speaker it listened to, as the operating system names it. */
  device?: string;
  sampleRate?: number;
  channels?: number;
  /** The loudest thing it heard, 0 to 1. Zero means silence. */
  peak: number;
  /** Why it could not, in words that can go straight on screen. */
  trouble?: string;
}

/**
 * Can this machine record what it plays — and, with `listen`, how loud is it.
 *
 * The only thing in Yames that opens that capture outside a take, and it
 * comes in two sizes. Without `listen` it opens the speaker, reads the format
 * it would hand over and closes again, taking no audio at all: that is what
 * the screen asks at start-up to decide whether to draw the switch, and it is
 * asking the machine rather than guessing from the operating system's name.
 * With `listen` it stays open for a fifth of a second and reports the loudest
 * thing it heard — the musician pressing "check the sound", so they see the
 * level BEFORE a take rather than finding silence after one. On Windows the
 * mute and the volume slider sit before the tap, so a muted machine records
 * nothing at all and this is the only warning of it there can be.
 *
 * Neither writes anything anywhere.
 */
export async function checkTakeSound(listen = false): Promise<TakeSoundCheck> {
  return invoke("check_take_sound", { listen });
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

/**
 * Play a take through the engine; the band is silent while it plays.
 *
 * Resolves to the playback's generation, the number `take-playback-ended`
 * will carry when THIS playback runs off its end (see `takes/playbackGate`).
 */
export async function playTake(id: string): Promise<number> {
  return invoke("play_take", { id });
}

export async function stopTakePlayback(): Promise<void> {
  return invoke("stop_take_playback");
}

/**
 * A take ran off its end. The payload names the playback (the engine's
 * generation counter, the number `playTake` resolved to), so a listener can
 * tell an ending from a take it has just started; the engine already drops
 * endings of anything but the take in its slot, and `takes/playbackGate`
 * drops one that was already on its way.
 */
export function onTakePlaybackEnded(callback: (generation?: number) => void) {
  return listen<{ generation: number } | null>("take-playback-ended", (e) =>
    callback(e.payload?.generation),
  );
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

/**
 * The in-app click probe's report (`app_probe.rs`): the four numbers the
 * audio-safety gate reads, for a build started with `YAMES_CALLBACK_PROBE=1`.
 * An error otherwise. Diagnostics only; `tests/e2e` reads it.
 */
export async function callbackProbeReport(): Promise<unknown> {
  return invoke<unknown>("callback_probe_report");
}
