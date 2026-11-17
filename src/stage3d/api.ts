/**
 * The neck stage: the contract between the stage (`src/stage3d/**`) and the
 * learning screens that use it (plans/tasks/revamp-3d/BRIEF.md).
 *
 * One fretboard sits behind every learning screen. A screen marks a DOM slot,
 * calls `setView` with it, and the camera frames the neck into that slot;
 * everything the player reads stays HTML over the canvas. Without WebGL2 the
 * stage draws the SVG `Fretboard` into the same slot instead, so a screen never
 * has to know which one it got (it can read `is3d` if it wants to).
 *
 * three.js is not imported from here or from anything this file imports at
 * load: the provider `import()`s it the first time a view other than `hidden`
 * is asked for.
 */
import { useContext } from "react";
import { NeckStageContext } from "./context";

export type NeckKind = "aim" | "tone" | "tens" | "clash" | "box" | "dim";

/** String 1 is high E, 6 is low E (as in the packs). Fret 0 is the open string. */
export type NeckNote = { string: 1 | 2 | 3 | 4 | 5 | 6; fret: number; kind: NeckKind; label?: string };

export type NeckView =
  | { kind: "whole" } //                           Today, Paths, Progress: the hero angle
  | { kind: "zoom"; from: number; to: number; flat?: boolean } // practice: these frets large, plus the overview strip
  //   `flat`: straight-on (the runway's neck): almost no tilt, strings evenly spaced, high e on top,
  //   the same framing in a portrait slot. Without it, the hero three-quarter angle.
  | { kind: "hidden" }; //                         tools, settings: no canvas work at all

export interface NeckStage {
  /** Frame the neck into `slot` (a DOM element the screen renders); null = full stage. */
  setView(view: NeckView, slot: HTMLElement | null, opts?: { instant?: boolean }): void;
  /** Replace the markers on the neck. `fade` is in seconds (default 0.25; 0 = at once). */
  setNotes(notes: NeckNote[], opts?: { fade?: number }): void;
  /** A heard note: the string vibrates and the spot flashes in its colour. */
  pluck(string: number, fret: number, kind: NeckKind): void;
  /** The warm sweep along the frets, for arrivals and results. */
  sweep(): void;
  /** A Take is running: cap the frame rate (rule 1). */
  setTakeRunning(on: boolean): void;
  /** True when WebGL2 is up; false means the SVG fallback is drawing. */
  readonly is3d: boolean;
}

export { NOOP_STAGE, NeckStageContext } from "./context";
export { NeckStageProvider } from "./NeckStageProvider";

/** The stage, or a no-op stage when none is mounted. */
export function useNeck(): NeckStage {
  return useContext(NeckStageContext);
}
