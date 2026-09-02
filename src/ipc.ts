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
  if (update) {
    await update.downloadAndInstall();
    await relaunch();
  }
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
};

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
// Session History
// ---------------------------------------------------------------------------
import type { SavedSession } from "./types";

export async function saveSession(session: SavedSession): Promise<void> {
  return invoke("save_session", { session });
}

export async function getSessionHistory(): Promise<SavedSession[]> {
  return invoke<SavedSession[]>("get_session_history");
}

export async function deleteSession(id: string): Promise<void> {
  return invoke("delete_session", { id });
}

export async function clearAllSessions(): Promise<void> {
  return invoke("clear_all_sessions");
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

export async function loadCoachModel(): Promise<boolean> {
  return invoke<boolean>("load_coach_model");
}

/**
 * Hard timeout for every LLM inference call, in milliseconds. Per the
 * plan's C4 latency policy: "LLM call has a hard 3-second timeout.
 * After 3s, ship the filled template directly. The user never waits
 * for the model." The timeout is enforced here at the IPC layer so
 * every caller inherits it without having to reimplement the race.
 *
 * On timeout, this rejects with `Error("coach_generate_timeout")` so
 * call sites can catch and fall back to their template path (every
 * existing call site already has a try/catch or `.catch(() => {})`).
 */
export const COACH_GENERATE_TIMEOUT_MS = 3_000;

export async function coachGenerate(context: string): Promise<string> {
  const call = invoke<string>("coach_generate", { context });
  return await Promise.race([
    call,
    new Promise<string>((_, reject) => {
      setTimeout(
        () => reject(new Error("coach_generate_timeout")),
        COACH_GENERATE_TIMEOUT_MS,
      );
    }),
  ]);
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
  /**
   * Compile-time llama.cpp backend. llama.cpp still falls back to CPU
   * at runtime when no usable GPU is present, so `"vulkan"` does not
   * guarantee GPU execution.
   */
  backend: "metal" | "vulkan" | "cpu" | "none";
  /** File name of the resident model, or null in template mode. */
  modelName: string | null;
  /** Rough RAM estimate while generating (weights × 1.2), 0 if absent. */
  ramEstimateMb: number;
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
 * emits this AFTER Piper synthesis finishes but BEFORE `afplay` is
 * launched — i.e. when the spinner-to-text swap should fire so the
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
 * Interrupt any currently-playing TTS utterance (piper-then-afplay or the
 * macOS `say` fallback). The Rust side bumps a generation counter so any
 * in-flight `speak_standalone` call early-returns as Cancelled and kills
 * the tracked PID with `kill -9`. Safe to call when nothing is playing
 * (the counter still bumps but no kill is issued). Used by the voice
 * preview UI so rapid clicks across voices feel snappy instead of
 * queueing up.
 */
export async function ttsStop(): Promise<void> {
  return invoke("tts_stop");
}

/**
 * Per-voice diagnostic info from the Rust side. Mirrors the
 * `VoiceDiagnostic` struct in `tts.rs` (serde renames the boolean fields
 * to camelCase). `ready` is true only when:
 *   - the Piper binary + its 3 required dylibs are all on disk
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
