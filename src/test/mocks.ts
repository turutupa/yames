/**
 * Global vitest mocks for Tauri APIs.
 *
 * NOTE on strategy: vi.mock("../ipc", ...) does NOT hoist correctly under
 * bun+vitest (factory never gets called). Instead we mock the underlying
 * Tauri primitives (@tauri-apps/api/core invoke, @tauri-apps/api/event listen,
 * plugin-store, etc.) so the REAL src/ipc.ts functions run end-to-end through
 * mocked transports. Tests that need to spy on a specific ipc.* call should
 * use vi.spyOn(ipc, "fnName") at the test site.
 */
import { vi } from "vitest";
import type { AppState } from "../types";

// Default app state for tests. Override in individual tests via setInvokeResponse.
export const DEFAULT_TEST_STATE: AppState = {
  bpm: 120,
  isPlaying: false,
  subdivision: 1,
  mode: "comfortable",
  corner: "bottom-right",
  alwaysOnTop: false,
  widgetAlwaysOnTop: false,
  accentColor: "#88ccff",
  theme: "default",
  volume: 0.7,
  soundType: "click",
  timeSignature: 4,
  beatGroups: [4],
  speedRamp: {
    startBpm: 80,
    targetBpm: 160,
    increment: 5,
    decrement: 3,
    barsPerStep: 2,
    beatsPerBar: 4,
    mode: "linear",
    cyclic: false,
    aggressiveness: "moderate",
    active: false,
    currentStep: 0,
    currentBpm: 80,
    direction: "up",
    barsInStep: 0,
    completed: false,
    warmupBeats: 4,
    warmupCount: 0,
  },
  instrument: "other",
};

// ---------------------------------------------------------------------------
// Invoke command → response map. Tauri's `invoke(cmd, args)` is routed here
// based on cmd name. Tests override via setInvokeResponse(cmd, value).
// ---------------------------------------------------------------------------

type InvokeFn = (args?: Record<string, unknown>) => unknown | Promise<unknown>;

const DEFAULT_INVOKE_MAP: Record<string, InvokeFn> = {
  // App state
  get_state: () => DEFAULT_TEST_STATE,
  set_bpm: () => undefined,
  set_subdivision: () => undefined,
  toggle_playback: () => undefined,
  set_playing: () => undefined,
  set_widget_mode: () => undefined,
  set_always_on_top: () => undefined,
  set_widget_always_on_top: () => undefined,
  set_theme: () => undefined,
  set_volume: () => undefined,
  set_sound_type: () => undefined,
  set_time_signature: () => undefined,
  show_main: () => undefined,
  show_floating: () => undefined,
  open_url: () => undefined,

  // Tabs / calibration
  set_active_tab: () => undefined,
  get_active_tab: () => "beat",
  set_calibration_offset: () => undefined,
  get_calibration_offset: () => null,

  // Speed ramp
  configure_speed_ramp: () => undefined,
  start_speed_ramp: () => undefined,
  start_speed_ramp_from: () => undefined,
  stop_speed_ramp: () => undefined,
  set_adaptive_decision: () => undefined,

  // MIDI
  list_midi_devices: () => [],
  connect_midi_device: () => undefined,
  disconnect_midi_device: () => undefined,
  set_midi_binding: () => undefined,
  clear_midi_binding: () => undefined,
  get_midi_bindings: () => [],

  // Presets
  list_presets: () => [],
  save_preset: () => undefined,
  delete_preset: () => undefined,
  reorder_presets: () => undefined,

  // Audio output
  list_audio_output_devices: () => [],
  set_audio_output_device: () => undefined,

  // Audio input / evaluation
  list_audio_input_devices: () => [],
  start_evaluation: () => undefined,
  stop_evaluation: () => undefined,
  get_evaluation_state: () => false,
  get_session_report: () => null,
  clear_session: () => undefined,

  // Session history
  save_session: () => undefined,
  get_session_history: () => [],
  delete_session: () => undefined,
  clear_all_sessions: () => undefined,

  // Diagnostic session logs (D1)
  list_session_logs: () => [],
  get_session_log: () => null,
  export_session_logs: () => "",
  clear_session_logs: () => undefined,

  // Recording
  start_recording: () => undefined,
  stop_recording: () => 0,
  start_playback: () => undefined,
  stop_playback: () => undefined,
  discard_recording: () => undefined,
  get_waveform: () => [],
  set_input_gain: () => undefined,

  // Models
  get_model_status: () => ({
    brainReady: false,
    brainTier: null,
    brainSizeBytes: 0,
    voiceReady: false,
    voiceSizeBytes: 0,
  }),
  write_model_chunk: () => "",
  get_models_path: () => "",
  delete_models: () => undefined,
  start_model_download: () => undefined,
  cancel_model_download: () => undefined,

  // Coach LLM
  load_coach_model: () => false,
  coach_generate: () => "",
  is_coach_loaded: () => false,

  // TTS
  tts_speak: () => undefined,
  tts_set_voice: () => undefined,
  tts_list_voices: () => [],
};

const invokeMap = new Map<string, InvokeFn>();
function resetInvokeMap() {
  invokeMap.clear();
  for (const [cmd, fn] of Object.entries(DEFAULT_INVOKE_MAP)) invokeMap.set(cmd, fn);
}
resetInvokeMap();

/** Override the response for a single invoke command in the current test. */
export function setInvokeResponse(command: string, value: unknown | InvokeFn): void {
  if (typeof value === "function") {
    invokeMap.set(command, value as InvokeFn);
  } else {
    invokeMap.set(command, () => value);
  }
}

/** Reset all invoke command responses to defaults. Called automatically in afterEach. */
export function resetTauriMocks(): void {
  resetInvokeMap();
  mockInvoke.mockClear();
  mockListen.mockClear();
}

// The spy that every invoke() call routes through. Tests can assert on it.
export const mockInvoke = vi.fn(async (command: string, args?: Record<string, unknown>) => {
  const handler = invokeMap.get(command);
  if (!handler) {
    // Unknown command — return undefined silently to keep tests from crashing
    return undefined;
  }
  return handler(args);
});

// listen() returns Promise<UnlistenFn>. UnlistenFn = () => void.
// Tests can grab specific listeners via mockListen.mock.calls.
export const mockListen = vi.fn(async (_event: string, _cb: unknown) => {
  return () => {};
});

// ---------------------------------------------------------------------------
// Tauri API mocks — these DO get hoisted correctly because they're for
// node_modules paths (not project-relative paths). Verified empirically.
// ---------------------------------------------------------------------------

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: Record<string, unknown>) => mockInvoke(cmd, args),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: (event: string, cb: unknown) => mockListen(event, cb),
}));

// LogicalSize / PhysicalPosition are real classes in @tauri-apps/api/window
// — stub with simple value-classes so callers like
// `new LogicalSize(w, h)` continue to work.
class LogicalSizeStub {
  constructor(
    public width: number,
    public height: number,
  ) {}
  type = "Logical" as const;
}
class PhysicalPositionStub {
  constructor(
    public x: number,
    public y: number,
  ) {}
  type = "Physical" as const;
}

vi.mock("@tauri-apps/api/window", () => ({
  LogicalSize: LogicalSizeStub,
  PhysicalPosition: PhysicalPositionStub,
  getCurrentWindow: () => ({
    setFullscreen: vi.fn().mockResolvedValue(undefined),
    setAlwaysOnTop: vi.fn().mockResolvedValue(undefined),
    setSize: vi.fn().mockResolvedValue(undefined),
    setPosition: vi.fn().mockResolvedValue(undefined),
    outerPosition: vi.fn().mockResolvedValue(new PhysicalPositionStub(0, 0)),
    outerSize: vi.fn().mockResolvedValue(new LogicalSizeStub(300, 200)),
    innerSize: vi.fn().mockResolvedValue(new LogicalSizeStub(300, 200)),
    scaleFactor: vi.fn().mockResolvedValue(1),
    show: vi.fn().mockResolvedValue(undefined),
    hide: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    minimize: vi.fn().mockResolvedValue(undefined),
    toggleMaximize: vi.fn().mockResolvedValue(undefined),
    isMaximized: vi.fn().mockResolvedValue(false),
    onFocusChanged: vi.fn().mockResolvedValue(() => {}),
    onResized: vi.fn().mockResolvedValue(() => {}),
    onMoved: vi.fn().mockResolvedValue(() => {}),
    isFullscreen: vi.fn().mockResolvedValue(false),
    label: "main",
  }),
}));

vi.mock("@tauri-apps/api/app", () => ({
  getVersion: vi.fn().mockResolvedValue("0.9.0"),
}));

vi.mock("@tauri-apps/plugin-store", () => ({
  load: vi.fn().mockResolvedValue({
    get: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue(undefined),
    save: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: vi.fn().mockResolvedValue(null),
}));

vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@tauri-apps/plugin-global-shortcut", () => ({
  register: vi.fn().mockResolvedValue(undefined),
  unregister: vi.fn().mockResolvedValue(undefined),
  unregisterAll: vi.fn().mockResolvedValue(undefined),
  isRegistered: vi.fn().mockResolvedValue(false),
}));
