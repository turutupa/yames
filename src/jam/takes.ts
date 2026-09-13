/**
 * Takes — the arithmetic of a shelf of recordings (JAM_MODE §4.4).
 *
 * Pure, like everything else in this folder: no store, no engine, no React.
 * What a take IS lives in `./types` (`JamTake`), and the calls that make one
 * live at the foot of `src/ipc.ts`. This is only what the screen has to work
 * out before it can draw the list.
 */
import type { JamTake } from "./types";

/**
 * Newest first, and a copy — never the array the caller handed in.
 *
 * Newest first because the take you want is almost always the one you just
 * played: you record, you stop, you listen back. A list that grew downwards
 * would put the interesting end of it under the fold within an afternoon.
 */
export function sortTakes(takes: readonly JamTake[]): JamTake[] {
  return [...takes].sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * When the size is worth saying out loud.
 *
 * The figure itself is a READING, not arithmetic: `takesDirSize()` asks the
 * engine what the folder holds, across every jam, because that is the fact a
 * disk filling up is actually about — one jam's shelf can be small while the
 * library's is not.
 *
 * 100 MB is roughly a quarter of an hour of playing. Below it the folder is
 * not a problem and a number would only be clutter on a screen meant to be
 * read while holding a guitar; above it you are keeping more than you are
 * listening to, and the app should say so rather than let a disk fill
 * quietly.
 */
export const TAKES_SIZE_NOTICE_BYTES = 100 * 1024 * 1024;

/** "112 MB". Whole megabytes: a tenth of one is not a fact anybody acts on. */
export function megabytes(bytes: number): number {
  return Math.round(bytes / (1024 * 1024));
}

/** `4:07`. The same clock the transport writes, so the two agree on screen. */
export function takeLength(durationSec: number): string {
  const s = Math.max(0, Math.round(durationSec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
