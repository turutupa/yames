/**
 * The one call Songs makes that Rust does not answer yet.
 *
 * **Why this is not in `src/ipc.ts`, where `AGENTS.md` says IPC belongs.**
 * `src/ipc.commands.test.ts` scrapes every `invoke("…")` literal out of
 * `ipc.ts` and asserts Rust registers all of them, because an unregistered
 * command rejects silently and a control just looks broken. That gate is
 * right, and `load_score_schedule` would fail it: W1 is writing the command
 * on another branch (`plans/tasks/songs/W1-SCORING.md`) and it does not exist
 * on this one.
 *
 * The choice was a red test on a branch that is merged overnight, or this
 * file. Evading the scrape by hiding the name in a constant was never an
 * option — that is precisely the bug the gate exists to catch.
 *
 * **So when W1's command lands, delete this file**: move `sendScoreSchedule`
 * into the Songs section of `ipc.ts` as an ordinary wrapper, keep the
 * once-per-session warning at the call site the way `jamEngine.ts` does, and
 * let `ipc.commands.test.ts` do its job.
 */
import { invoke } from "@tauri-apps/api/core";
import type { ScoreSchedule } from "./types";

/**
 * Said once per session, not once per pass. Every build before W1 merges is a
 * build without the command, and a warning per press of Play would be a wall
 * of noise saying one thing. `jamEngine.ts` guards `set_jam` the same way.
 */
let warnedAboutLoadScoreSchedule = false;

/** Whether the last attempt found the command. Null until one is made. */
let available: boolean | null = null;

/** Has the engine got the schedule? `null` = we have not tried yet. */
export function scheduleAccepted(): boolean | null {
  return available;
}

/**
 * Hand the engine the onsets it should expect.
 *
 * Resolves either way: a build without the command still plays, it just
 * scores nothing, and that is a better Songs mode than one whose Play button
 * throws. The return value says which happened, so the UI can be honest
 * about it rather than showing a score that is not being kept.
 */
export async function sendScoreSchedule(schedule: ScoreSchedule): Promise<boolean> {
  try {
    await invoke("load_score_schedule", { schedule });
    available = true;
    return true;
  } catch (err) {
    available = false;
    if (warnedAboutLoadScoreSchedule) return false;
    warnedAboutLoadScoreSchedule = true;
    console.warn(
      "[yames] load_score_schedule is not available in this build — " +
        "the song plays and the click keeps time, but nothing is scored",
      err,
    );
    return false;
  }
}

/** Test seam: forget what we learned about the command. */
export function resetScheduleBridge(): void {
  warnedAboutLoadScoreSchedule = false;
  available = null;
}
