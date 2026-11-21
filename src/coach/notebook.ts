/**
 * What the Notebook (DESIGN 6.7, drawn by leg c4a2) needs, as one plain
 * object: built on demand when the tab opens, from the stored Takes and the
 * coach's stored keys. Never in a render, never per beat, never in a Take.
 */
import type { PathTakeRow } from "../ipc";
import type { PathDoc } from "../paths/format";
import { cardMayShow, type CoachGoal, type CoachStored } from "./store";
import { MIN_TAKES, playedOf, tendencies, windowOf, type NoticedLine } from "./tendencies";

/** DESIGN 6.7 / judgement call 10: the goal is asked once the first Session is seven days old. */
export const GOAL_ASK_AFTER_DAYS = 7;
const DAY_MS = 86_400_000;

export type Notebook = {
  /** "What I've noticed", suppressed lines already left out. */
  noticed: NoticedLine[];
  /** "What you're working toward": the player's words and when they said them, or null. */
  goal: CoachGoal | null;
  /**
   * The goal question may be offered now (as an offer with "Not now", counted
   * in `coach.cards` under `"goal"`): no goal yet, the oldest Take in the
   * window is seven days old or more, and DESIGN 6.6 lets the card show.
   */
  askGoal: boolean;
  /** The Takes read (after the window's rules), and the oldest one's date. */
  takesRead: number;
  firstTakeAt: number | null;
  /**
   * True when fewer than `MIN_TAKES` Takes were played in the window (every
   * Take Progress counts): no line can rest on so few, so "not enough Takes
   * yet" is the honest empty state. Never true beside a noticed line (c4a1b,
   * L1): every line rests on at least `MIN_TAKES` of those Takes.
   */
  tooFewTakes: boolean;
};

export function notebookFrom(
  rows: readonly PathTakeRow[],
  stored: CoachStored,
  now: number,
  paths?: readonly PathDoc[],
): Notebook {
  const window = windowOf(rows);
  const firstTakeAt = window.length ? window[window.length - 1].startedAt : null;
  const noticed = tendencies(rows, now, { paths, suppressed: stored.suppressed });
  const tooFewTakes = noticed.length === 0 && playedOf(rows).length < MIN_TAKES;
  const askGoal =
    stored.goal === null &&
    firstTakeAt !== null &&
    now - firstTakeAt >= GOAL_ASK_AFTER_DAYS * DAY_MS &&
    cardMayShow(stored, "goal", now);
  return {
    noticed,
    goal: stored.goal,
    askGoal,
    takesRead: window.length,
    firstTakeAt,
    tooFewTakes,
  };
}
