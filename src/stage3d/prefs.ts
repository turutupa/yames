/**
 * The player's say over the 3D neck, and what the stage learned on its own.
 *
 * - `stage.neck3d`: "auto" (the 3D neck where the machine can draw it) or
 *   "off" (always the flat SVG neck). Settings > Appearance.
 * - `stage.forceFlat`: set by the frame-time guard (`speed.ts`) when this
 *   machine drew the neck too slowly for a GPU. Kept across restarts, so the
 *   probe runs once, not every launch; Settings offers to try again.
 *
 * Both live in the settings store. The stage waits for them (`ready`) before
 * it picks a backend, so a flat machine never shows a 3D frame first.
 */
import { useSyncExternalStore } from "react";
import { storeLoad, storeSave } from "../ipc";

export type Neck3dMode = "auto" | "off";
export type StagePrefs = { readonly neck3d: Neck3dMode; readonly forceFlat: boolean };

export const NECK3D_KEY = "stage.neck3d";
export const FORCE_FLAT_KEY = "stage.forceFlat";

let prefs: StagePrefs = { neck3d: "auto", forceFlat: false };
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function set(patch: Partial<StagePrefs>) {
  prefs = { ...prefs, ...patch };
  listeners.forEach((fn) => fn());
}

/** Load once from the store; resolves (never rejects) when the prefs are known. */
export function stagePrefsReady(): Promise<void> {
  if (!loading) {
    loading = Promise.all([storeLoad<string>(NECK3D_KEY), storeLoad<boolean>(FORCE_FLAT_KEY)])
      .then(([mode, flat]) => set({ neck3d: mode === "off" ? "off" : "auto", forceFlat: flat === true }))
      .catch(() => {
        /* no store (a browser, a test): the defaults */
      });
  }
  return loading;
}

export function getStagePrefs(): StagePrefs {
  return prefs;
}

export function subscribeStagePrefs(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** True when the stage must draw the flat neck: the player said so, or this machine is too slow. */
export function wantsFlat(p: StagePrefs = prefs): boolean {
  return p.neck3d === "off" || p.forceFlat;
}

export function setNeck3d(mode: Neck3dMode): void {
  set({ neck3d: mode });
  void storeSave(NECK3D_KEY, mode).catch(() => {});
}

/** The guard found a software renderer (true), or the player asked to try 3D again (false). */
export function setForceFlat(on: boolean): void {
  set({ forceFlat: on });
  void storeSave(FORCE_FLAT_KEY, on).catch(() => {});
}

export function useStagePrefs(): StagePrefs {
  return useSyncExternalStore(subscribeStagePrefs, getStagePrefs);
}

/** For tests: back to the defaults, not loaded. */
export function resetStagePrefsForTest(p: Partial<StagePrefs> = {}): void {
  prefs = { neck3d: "auto", forceFlat: false, ...p };
  loading = null;
  listeners.clear();
}
