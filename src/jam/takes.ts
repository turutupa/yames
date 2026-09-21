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

/**
 * The store key that says the first-run dialog has been read.
 *
 * The APP's, not the jam's and not the song's: what a take is only has to be
 * explained once, and a per-record flag would ask again for every jam in the
 * library — which reads as the app not trusting the answer you already gave.
 * It lives here rather than in either screen's hook because Songs records
 * takes too, and the promise made by that dialog is one promise.
 */
export const TAKES_INTRO_KEY = "jam.takesIntroSeen";

/** `4:07`. The same clock the transport writes, so the two agree on screen. */
export function takeLength(durationSec: number): string {
  const s = Math.max(0, Math.round(durationSec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * The store key holding what a take is made of (`plans/SONGS.md` A12).
 *
 * **The machine's, not the jam's and not the song's**, and that is the
 * decision rather than an implementation detail. "Everything this computer
 * plays" is an answer about how this room is wired — which speaker, which amp
 * simulator, which interface — and none of that changes because you loaded a
 * different tune. A per-jam switch would mean setting it again on every jam
 * in the library, and worse, would mean a jam saved on the desk machine
 * arriving on the laptop asking it to record a speaker that is not there.
 *
 * Absent means `yamesAndInput`, which is what every take before this was.
 */
export const TAKE_SOUND_KEY = "takes.soundSource";

/**
 * Is this a build and a machine where "everything this computer plays" can be
 * offered at all?
 *
 * The answer is the engine's (`check_take_sound`), never a guess from the
 * user agent: a Mac cannot do it, a Linux box can only do it when a monitor
 * source is visible, and an older build has no such command. Anything other
 * than a clear yes means the switch is not shown — a switch that would record
 * silence is worse than no switch.
 */
export function canRecordEverything(check: { can: boolean } | null): boolean {
  return check?.can === true;
}
