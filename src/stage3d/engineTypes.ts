/**
 * What the lazy three.js chunk (`engine/engine.ts`) hands back. Types only:
 * importing this file does not load three.js.
 */
import type { NeckKind, NeckNote, NeckView } from "./api";
import type { QualityStep } from "./quality";

export type SlotRect = { left: number; top: number; width: number; height: number };
export type VisibleView = Exclude<NeckView, { kind: "hidden" }>;

export interface StageEngine {
  readonly tier: number;
  /** Frame `view` into `rect` (viewport CSS px). `instant` cuts; otherwise the camera flies. */
  setView(view: VisibleView, rect: SlotRect, instant: boolean): void;
  /** The slot moved or changed size: re-solve the framing without a flight. */
  refit(rect: SlotRect): void;
  setNotes(notes: NeckNote[], fade: number): void;
  pluck(string: number, fret: number, kind: NeckKind): void;
  sweep(): void;
  /** The window changed size. */
  resize(width: number, height: number): void;
  /** Advance by `dt` seconds and draw. True while something is still moving. */
  frame(dt: number): boolean;
  lowerQuality(step: QualityStep, dprScale: number): boolean;
  dispose(): void;
}

export type EngineOptions = {
  canvas: HTMLCanvasElement;
  reduced: boolean;
  forcedTier: number | null;
  onLost: () => void;
  onRestored: () => void;
};

export type EngineModule = { createEngine: (o: EngineOptions) => Promise<StageEngine> };
