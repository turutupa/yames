/**
 * A stand-in Tauri backend, for screenshots only.
 *
 * `shots.html` is not part of the app: `vite build` is given `index.html` as
 * its single input, so nothing in this folder reaches a release. It exists so
 * the screenshots on the website and in the README can be taken from the real
 * UI — the same components, the same stylesheets, the same engine — without a
 * Rust build, an audio device, or the machine's own practice history.
 *
 * It is deliberately a sibling of `devShim.local.ts` rather than a copy of it:
 * that file is gitignored scratch for looking at layout, and it answers
 * whatever its author needed that day. This one is committed, and every answer
 * it gives is a decision about what the pictures show.
 */
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import type { Shot } from "./scenarios";

/**
 * The library in the sidebar.
 *
 * The sidebar is in frame on every window shot, so this is what the world
 * sees. Four presets fill the list without running past the fold, and the
 * names are the exercises a guitarist would actually keep.
 */
const PRESETS = [
  { id: "p1", name: "Warm-up", bpm: 80, subdivision: 1, timeSignature: 4,
    beatGroups: [4], soundType: "wood", volume: 0.7, view: "beat", createdAt: 1 },
  { id: "p2", name: "Gallop 16ths", bpm: 96, subdivision: 4, timeSignature: 4,
    beatGroups: [4], soundType: "drum", volume: 0.7, view: "beat", createdAt: 2 },
  { id: "p3", name: "Alt picking", bpm: 120, subdivision: 2, timeSignature: 4,
    beatGroups: [4], soundType: "drum", volume: 0.7, view: "beat", createdAt: 3 },
  { id: "p4", name: "Odd meter", bpm: 88, subdivision: 2, timeSignature: 7,
    beatGroups: [3, 2, 2], soundType: "click", volume: 0.7, view: "beat", createdAt: 4 },
];

/** The drill tab's library. `view: "drill"` is what puts them on that list. */
const DRILLS = [
  { id: "d1", name: "Slow climb", bpm: 60, subdivision: 1, timeSignature: 4,
    beatGroups: [4], soundType: "click", volume: 0.7, view: "drill", createdAt: 5,
    speedRamp: { startBpm: 60, targetBpm: 135, increment: 5, decrement: 3,
      barsPerStep: 8, beatsPerBar: 4, mode: "linear", cyclic: false, warmupBeats: 4 } },
  { id: "d2", name: "Push and pull", bpm: 90, subdivision: 2, timeSignature: 4,
    beatGroups: [4], soundType: "click", volume: 0.7, view: "drill", createdAt: 6,
    speedRamp: { startBpm: 90, targetBpm: 150, increment: 8, decrement: 4,
      barsPerStep: 6, beatsPerBar: 4, mode: "zigzag", cyclic: true, warmupBeats: 4 } },
];

const SETLISTS = [
  {
    id: "c1", name: "Daily routine", createdAt: 1, repeat: 1, countIn: 0,
    steps: [
      { id: "s1", name: "Loosen up", bpm: 70, subdivision: 1, timeSignature: 4,
        beatGroups: [4], soundType: "wood", volume: 0.7,
        trigger: { kind: "bars", bars: 8 }, transition: { kind: "cut" } },
      { id: "s2", name: "Alt picking", bpm: 96, subdivision: 4, timeSignature: 4,
        beatGroups: [4], soundType: "wood", volume: 0.7,
        trigger: { kind: "seconds", seconds: 120 }, transition: { kind: "countIn", bars: 2 } },
      { id: "s3", name: "Cool down", bpm: 60, subdivision: 1, timeSignature: 4,
        beatGroups: [4], soundType: "wood", volume: 0.7,
        trigger: { kind: "manual" }, transition: { kind: "cut" } },
    ],
  },
];

function baseState(theme: string) {
  return {
    // 120 reads ALLEGRO on the tempo scale; 4/4 with eighths is the setting
    // nobody has to decode.
    bpm: 120,
    isPlaying: false,
    subdivision: 2,
    timeSignature: 4,
    beatGroups: [4],
    accentMode: "groups",
    soundType: "drum",
    volume: 0.7,
    freeMode: false,
    countIn: { beats: 0, done: 0 },
    theme,
    accentColor: "#88ccff",
    mode: "comfortable",
    corner: "bottom-right",
    alwaysOnTop: false,
    widgetAlwaysOnTop: false,
    instrument: "electric-guitar",
    // The drill screen reads its whole form off this, so it is the numbers in
    // the drill shot: a climb from 60 to 135, which is the example the
    // website's drill copy already uses.
    speedRamp: {
      startBpm: 60,
      targetBpm: 135,
      increment: 5,
      decrement: 3,
      barsPerStep: 8,
      beatsPerBar: 4,
      subdivision: 1,
      mode: "linear",
      cyclic: false,
      aggressiveness: "moderate",
      active: false,
      currentStep: 0,
      currentBpm: 60,
      direction: "up",
      barsInStep: 0,
      completed: false,
      warmupBeats: 4,
      warmupCount: 0,
    },
  };
}

/**
 * The store, settled.
 *
 * Everything a first-time user sees is a screen that must never reach a
 * marketing image, and each one has its own flag:
 *
 *   instrument / onboarding.*   the setup wizard, over the whole window
 *   tour.seenVersion            "New here? Take the 30-second tour"
 *   whatsNew.seenVersion        the release-notes modal, over everything
 *   hints.*                     a coach tip, popping in mid-capture
 *
 * All four postdate the last time these screenshots were taken, and all four
 * would have landed on the homepage.
 */
function baseStore(theme: string, tab: string, zenStyle?: string): Map<string, unknown> {
  const hints = [
    "drill-first-open", "preset-suggest", "coach-ask",
    "zen-first", "widget-discover", "midi-plugged",
  ];
  const store = new Map<string, unknown>([
    ["presets", [...PRESETS, ...DRILLS]],
    ["setlists", SETLISTS],
    ["activeTab", tab],
    ["theme", theme],
    ["keybindings", {}],
    ["sessions", []],
    ["instrument", "electric-guitar"],
    ["onboarding.version", 1],
    ["onboarding.completedAt", "2026-01-01T00:00:00.000Z"],
    ["tour.seenVersion", 99],
    // Any string will do: the modal opens only when this differs from the
    // running app's version, and a mocked backend reports no version at all.
    ["whatsNew.seenVersion", "screenshots"],
    ["appSessionCount", 12],
    ["widgetOpened", true],
    ["lastWindow", "main"],
  ]);
  for (const h of hints) store.set(`hints.${h}`, true);
  if (zenStyle) store.set("zenStyle", zenStyle);
  return store;
}

/** Install the mock. Call once, before React mounts. */
export function installShotMock(shot: Shot, theme: string): void {
  const w = window as unknown as Record<string, unknown>;
  if (w.__TAURI_INTERNALS__) return;

  const STATE = baseState(theme) as Record<string, unknown>;
  if (shot.ramp) Object.assign(STATE.speedRamp as object, shot.ramp);
  const store = baseStore(theme, shot.tab ?? "beat", shot.zenStyle);

  mockWindows(shot.window === "floating" ? "floating" : "main");

  const listeners = new Map<string, number[]>();
  let nextListenerId = 1;

  function emit(event: string, payload: unknown) {
    const internals = (window as unknown as {
      __TAURI_INTERNALS__?: { runCallback?: (id: number, p: unknown) => void };
    }).__TAURI_INTERNALS__;
    for (const handler of listeners.get(event) ?? []) {
      internals?.runCallback?.(handler, { event, id: handler, payload });
    }
  }

  // A beat every 60/bpm seconds while playing. Only the Zen shot runs it, and
  // only because Zen is a picture of a metronome that is going.
  let beatTimer: ReturnType<typeof setTimeout> | undefined;
  let beatCount = 0;

  function beatLoop() {
    clearTimeout(beatTimer);
    if (!STATE.isPlaying) return;
    const groups = STATE.beatGroups as number[];
    const total = groups.reduce((a, b) => a + b, 0) || 4;
    const measureBeat = beatCount % total;
    const opens = new Set<number>();
    let cursor = 0;
    for (const g of groups) {
      opens.add(cursor);
      cursor += g;
    }
    emit("beat", {
      beat: beatCount,
      measureBeat,
      subdivision: 0,
      isDownbeat: true,
      isAccent: opens.has(measureBeat),
      beatsPerMeasure: total,
    });
    beatCount += 1;
    beatTimer = setTimeout(beatLoop, 60000 / (STATE.bpm as number));
  }

  function setPlaying(next: boolean) {
    STATE.isPlaying = next;
    beatCount = 0;
    emit("state-changed", STATE);
    if (next) beatLoop();
    else clearTimeout(beatTimer);
  }

  const MAP: Record<string, () => unknown> = {
    get_state: () => STATE,
    list_presets: () => [...PRESETS, ...DRILLS],
    get_active_tab: () => shot.tab ?? "beat",
    app_ready: () => null,
    get_model_status: () => ({ voiceReady: false, downloaded: [], active: null }),
    get_system_memory_mb: () => 32768,
    tts_list_voices: () => [],
    tts_voice_diagnostics: () => [],
    // A bool, not an object — see `get_evaluation_state` in commands.rs. An
    // object here is truthy, and the app drew a live green "Listening" chip
    // over a microphone that was not on.
    get_evaluation_state: () => false,
    list_audio_input_devices: () => [],
    list_audio_output_devices: () => ["Default"],
    list_midi_devices: () => [],
    get_midi_bindings: () => [],
    get_session_history: () => [],
    is_coach_loaded: () => false,
    get_calibration_offset: () => null,
    llm_compiled: () => false,
    get_calibration_cache_entry: () => null,
    list_instruments: () => [],
    get_hint_state: () => ({}),
    get_onboarding_state: () => ({ completed: true }),
    toggle_playback: () => {
      setPlaying(!STATE.isPlaying);
      return null;
    },
    start_metronome: () => {
      setPlaying(true);
      return null;
    },
    stop_metronome: () => {
      setPlaying(false);
      return null;
    },
    arm_count_in: () => null,
  };

  mockIPC(async (cmd, args) => {
    const a = args as Record<string, unknown> | undefined;

    if (cmd.startsWith("plugin:store|")) {
      const op = cmd.split("|")[1];
      // `load`/`get_store` hand back a resource id that every later call is
      // keyed by. Returning null makes the JS wrapper destructure nothing and
      // throw, which looks exactly like "the app cannot read its own store".
      if (op === "load" || op === "get_store") return 1;
      if (op === "get") {
        const v = store.get(String(a?.key));
        return [v ?? null, store.has(String(a?.key))];
      }
      if (op === "has") return store.has(String(a?.key));
      if (op === "entries") return [...store.entries()];
      if (op === "keys") return [...store.keys()];
      if (op === "values") return [...store.values()];
      if (op === "length") return store.size;
      if (op === "set") {
        store.set(String(a?.key), a?.value);
        return null;
      }
      if (op === "delete") return store.delete(String(a?.key));
      if (op === "clear") {
        store.clear();
        return null;
      }
      return null;
    }

    if (cmd === "plugin:event|listen") {
      const event = String(a?.event);
      const handler = Number(a?.handler);
      listeners.set(event, [...(listeners.get(event) ?? []), handler]);
      return nextListenerId++;
    }
    if (cmd === "plugin:event|unlisten") {
      for (const [event, ids] of listeners) {
        listeners.set(event, ids.filter((id) => id !== Number(a?.handler)));
      }
      return null;
    }
    if (cmd.startsWith("plugin:")) return null;

    if (cmd === "set_bpm" && typeof a?.bpm === "number") {
      STATE.bpm = a.bpm;
      emit("state-changed", STATE);
      return null;
    }

    return MAP[cmd]?.() ?? null;
  });

  // Already running for the shots that are of a running app, so the first
  // `get_state` the app makes already says so. Toggling it from the page
  // instead would mount the stopped layout and then change it, and a capture
  // can land between the two.
  if (shot.playing) {
    STATE.isPlaying = true;
    beatLoop();
  }
}
