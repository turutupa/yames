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
import { createContext, createElement, useContext, type ReactNode } from "react";

export type NeckKind = "aim" | "tone" | "tens" | "clash" | "box" | "dim";

/** String 1 is high E, 6 is low E (as in the packs). Fret 0 is the open string. */
export type NeckNote = { string: 1 | 2 | 3 | 4 | 5 | 6; fret: number; kind: NeckKind; label?: string };

export type NeckView =
  | { kind: "whole" } //                           Today, Paths, Progress: the hero angle
  | { kind: "zoom"; from: number; to: number } //  practice: these frets large, plus the overview strip
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

/** The stage when no provider is mounted: every call is accepted and does nothing. */
export const NOOP_STAGE: NeckStage = Object.freeze({
  setView() {},
  setNotes() {},
  pluck() {},
  sweep() {},
  setTakeRunning() {},
  is3d: false,
});

/** Internal: the provider puts its stage here. Screens use `useNeck`. */
export const NeckStageContext = createContext<NeckStage>(NOOP_STAGE);

/** The stage, or a no-op stage when none is mounted. */
export function useNeck(): NeckStage {
  return useContext(NeckStageContext);
}

/**
 * Mount once, around the learning screens (or the whole app). Renders a fixed,
 * full-window canvas behind its children; nothing is drawn, and three.js is not
 * loaded, until a screen asks for a view other than `hidden`.
 */
export function NeckStageProvider(props: { children: ReactNode }): JSX.Element {
  return createElement(NeckStageContext.Provider, { value: NOOP_STAGE }, props.children);
}
