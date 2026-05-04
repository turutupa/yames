import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { load } from "@tauri-apps/plugin-store";
import type { AppState, BeatEvent, SpeedRamp, Subdivision } from "./types";

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

export async function setVolume(volume: number): Promise<void> {
  return invoke("set_volume", { volume });
}

export async function setSoundType(soundType: string): Promise<void> {
  return invoke("set_sound_type", { soundType });
}

export async function setTimeSignature(timeSignature: number): Promise<void> {
  return invoke("set_time_signature", { timeSignature });
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

// Update checker — compares current version against latest GitHub release
export interface UpdateInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseUrl: string;
}

export async function checkForUpdate(currentVersion: string): Promise<UpdateInfo> {
  const releaseUrl = "https://github.com/turutupa/yames/releases/latest";
  try {
    const res = await fetch("https://api.github.com/repos/turutupa/yames/releases/latest");
    if (!res.ok) return { hasUpdate: false, currentVersion, latestVersion: currentVersion, releaseUrl };
    const data = await res.json();
    const latest = (data.tag_name || "").replace(/^v/, "");
    return {
      hasUpdate: compareSemver(latest, currentVersion) > 0,
      currentVersion,
      latestVersion: latest,
      releaseUrl,
    };
  } catch {
    return { hasUpdate: false, currentVersion, latestVersion: currentVersion, releaseUrl };
  }
}

function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
