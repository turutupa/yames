/**
 * How you like to READ a tab — not how you like one song (W29 item 3).
 *
 * Two things, and both belong to the player rather than to the piece:
 *
 * **Tab, or tab and notes.** The stage drew standard notation AND tablature
 * for every system, so a screen held half the bars it could. The owner:
 * *"figure out how to use as much space as possible on the stage area with
 * tabs, right now a lot of space is under used"*. Tab with the rhythm under
 * it is how the tab players people use draw it, and it is what somebody with
 * a guitar in their hands is reading; the notation staff is there for the
 * people who want it, one press away.
 *
 * **How big.** Ctrl/Cmd and the wheel, or the two buttons in the head. A
 * player with a piece of sixteenths on a laptop wants it bigger; the same
 * player on a monitor wants four systems on the screen.
 *
 * Per player and not per song, deliberately. "I read tab" and "I need it
 * bigger" are facts about a person's eyes and habits, and having to say them
 * again on every piece they import is the kind of memory nobody thanks an app
 * for. The song remembers what you were WORKING on (`songEngine.ts`'s mix
 * setting); this remembers how you look at it.
 */
import { storeLoad, storeSave } from "../ipc";

export type StageView = {
  /** Draw the standard notation staff above the tab as well. */
  notation: boolean;
  /** How big the engraving is drawn, as alphaTab's `display.scale`. */
  zoom: number;
};

/**
 * Tab, no notation, at the size the engraver meant.
 *
 * Tablature-first is the default because this is a mode for playing a piece
 * off a page with an instrument in your hands, and because it is what every
 * tab player a guitarist has ever used opens with.
 */
export const DEFAULT_STAGE_VIEW: StageView = { notation: false, zoom: 1 };

/**
 * How small and how big, and the step between.
 *
 * 0.7 is where a sixteenth-note run stops being readable on a 1440 px stage
 * — below that the beams merge — and 1.6 is where two bars fill a row and
 * the page stops being a page. Ten per cent a press is small enough that
 * nobody overshoots and large enough to be worth pressing.
 */
export const ZOOM_MIN = 0.7;
export const ZOOM_MAX = 1.6;
export const ZOOM_STEP = 0.1;

/** Hold a zoom inside the range, at one decimal place. */
export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return DEFAULT_STAGE_VIEW.zoom;
  return Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom)) * 100) / 100;
}

/** A step in or out, from whatever it is at now. */
export function zoomBy(view: StageView, steps: number): StageView {
  const next = clampZoom(view.zoom + steps * ZOOM_STEP);
  return next === view.zoom ? view : { ...view, zoom: next };
}

/** Whatever is in the store, read as a `StageView` and never as a throw. */
export function readStageView(stored: unknown): StageView {
  if (!stored || typeof stored !== "object") return DEFAULT_STAGE_VIEW;
  const { notation, zoom } = stored as { notation?: unknown; zoom?: unknown };
  return {
    notation: notation === true,
    zoom: typeof zoom === "number" ? clampZoom(zoom) : DEFAULT_STAGE_VIEW.zoom,
  };
}

/** Where it is kept. One key, one object; it is two fields, not two rows. */
const STAGE_VIEW_KEY = "songsStageView";

export async function loadStageView(): Promise<StageView> {
  return readStageView(await storeLoad<unknown>(STAGE_VIEW_KEY));
}

/**
 * Write it down. Serialised, like every other read-modify-write in this mode:
 * Ctrl-wheel fires per notch, and two writes in flight would race.
 */
let writing: Promise<unknown> = Promise.resolve();

export function saveStageView(view: StageView): Promise<void> {
  const apply = () => storeSave(STAGE_VIEW_KEY, view);
  const next = writing.then(apply, apply);
  writing = next;
  return next;
}
