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

/**
 * What a marker on the neck means. `now` and `next` are the practice screens'
 * instruction (2026-11-17): the note to play now, solid amber with its fret
 * number, and the one after it, an amber outline.
 */
export type NeckKind = "aim" | "tone" | "tens" | "clash" | "box" | "dim" | "now" | "next";

/** String 1 is high E, 6 is low E (as in the packs). Fret 0 is the open string. */
export type NeckNote = {
  string: 1 | 2 | 3 | 4 | 5 | 6;
  fret: number;
  kind: NeckKind;
  label?: string;
  /**
   * The hand shifts on this note with the finger it shows (the Petrucci climb's
   * little finger moving up to the 9): a short bar under the number, so two
   * neighbouring frets that both read 4 say which one the hand moved for
   * (acceptance 5, P2-4).
   */
  shift?: boolean;
};

export type NeckView =
  | { kind: "whole" } //                           Today, Paths, Progress: the hero angle
  | { kind: "zoom"; from: number; to: number; flat?: boolean; clip?: boolean } // practice: these frets large, plus the overview strip
  //   `flat`: the runway's neck (smaller fret numbers). Every shot is straight-on now (mock A).
  //   `clip`: drawn inside the slot only, never behind the page's text beside it (a result, P1-2).
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
  /** A Take is running: the frame rate is the governor's for as long as it does (rule 1, `takeRate.ts`). */
  setTakeRunning(on: boolean): void;
  /**
   * Where a place on the neck is on screen, in viewport CSS px: the centre of
   * its marker, where the camera is going (not where a flight has got to).
   * Null while nothing is drawn, or for a place the view does not show. The
   * practice screens hang their DOM overlay (the approach ring, "next") on it.
   * `r` is the radius of a resting marker there, in px, so an overlay can be
   * sized to the note it rings.
   */
  project(string: number, fret: number): { x: number; y: number; r: number } | null;
  /**
   * Get the 3D engine ready while nothing is asked of it (a learning screen
   * with no neck on it): the chunk loaded, the context made, the frame-time
   * guard run. Without it the first Start of a launch paid for all of that in
   * the frame the Session opened on (a 115 ms task, measured 2026-11-19).
   * Draws nothing; does nothing once a backend is up.
   */
  prewarm?(): void;
  /** True when WebGL2 is up; false means the SVG fallback is drawing. */
  readonly is3d: boolean;
}

export { NOOP_STAGE, NeckStageContext } from "./context";
export { NeckStageProvider } from "./NeckStageProvider";

/** The stage, or a no-op stage when none is mounted. */
export function useNeck(): NeckStage {
  return useContext(NeckStageContext);
}
