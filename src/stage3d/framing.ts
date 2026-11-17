/**
 * How the camera looks at the neck for each view: the direction it looks from,
 * its field of view and how big the fret numbers are. Plain numbers, no three.js,
 * so the choice is testable without a GL context; `engine/engine.ts` turns
 * them into a shot.
 */
import type { VisibleView } from "./engineTypes";

export type Framing = {
  /** From the target towards the camera (normalised by the engine). +y is up, +z is the low-E side. */
  dir: [number, number, number];
  fov: number;
  numScale: number;
  pool: number;
};

/** True when a slot is taller than it is wide, the way the engine has always judged it. */
export function isPortrait(rect: { width: number; height: number }): boolean {
  return rect.height > rect.width * 1.08;
}

/**
 * The straight-on neck (the runway's): nearly overhead, a narrow lens so the
 * six strings sit evenly spaced and the frets do not fan, high e on top as in
 * tab. The same in a portrait slot: the runway under it runs left to right, so
 * the neck must too.
 */
export const FLAT_TILT = 0.06;
export const FLAT_FOV = 12;

export function framingFor(view: VisibleView, rect: { width: number; height: number }): Framing {
  const portrait = isPortrait(rect);
  if (view.kind === "whole") {
    return { dir: [0, 1, 0.26], fov: 14, numScale: portrait ? 2.4 : 1.55, pool: portrait ? 0.55 : 1.1 };
  }
  if (view.flat) {
    return { dir: [0, 1, FLAT_TILT], fov: FLAT_FOV, numScale: 0.6, pool: 0.9 };
  }
  return {
    dir: portrait ? [0.95, 1, 0] : [0, 1, 0.34],
    fov: portrait ? 40 : 22,
    numScale: portrait ? 1 : 0.66,
    pool: 0.9,
  };
}
