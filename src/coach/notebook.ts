/**
 * What the Notebook (DESIGN 6.7, drawn by leg c4a2) needs, as one plain
 * object: built on demand when the tab opens, from the stored Takes and the
 * coach's stored keys. Never in a render, never per beat, never in a Take.
 */
import type { PathTakeRow } from "../ipc";
import type { PathDoc } from "../paths/format";
import { cardMayShow, type CoachGoal, type CoachKeyState, type CoachKeyStates, type CoachStored } from "./store";
import { MIN_TAKES, playedOf, tendencies, windowOf, type NoticedLine } from "./tendencies";

/** DESIGN 6.7 / judgement call 10: the goal is asked once the first Session is seven days old. */
export const GOAL_ASK_AFTER_DAYS = 7;
const DAY_MS = 86_400_000;

export type Notebook = {
  /**
   * "What I've noticed", suppressed lines already left out. Empty unless
   * `noticedState` is `"read"`: any line may be one the player left out.
   */
  noticed: NoticedLine[];
  /**
   * `coach.suppressed`'s state (c4a1c, F1), for the screen (c4a2) to word:
   * `"loading"` (not read yet: say nothing, or "a moment"), `"unreadable"`
   * (the list of lines left out could not be read this run, so none is
   * shown), `"read"` (the lines are what they are).
   */
  noticedState: CoachKeyState;
  /** "What you're working toward": the player's words and when they said them, or null. Null unless `goalState` is `"read"`. */
  goal: CoachGoal | null;
  /**
   * `coach.goal`'s state (c4a1c, F1): `"loading"`, `"unreadable"` (a goal may
   * be stored that this run could not read: neither shown nor asked), `"read"`.
   */
  goalState: CoachKeyState;
  /**
   * The goal question may be offered now (as an offer with "Not now", counted
   * in `coach.cards` under `"goal"`): the goal is read and there is none, the
   * oldest Take in the window is seven days old or more, and DESIGN 6.6 lets
   * the card show (which needs `coach.suggestions` and `coach.cards` read).
   */
  askGoal: boolean;
  /** The Takes read (after the window's rules), and the oldest one's date. */
  takesRead: number;
  firstTakeAt: number | null;
  /**
   * True when fewer than `MIN_TAKES` Takes were played in the window (every
   * Take Progress counts): no line can rest on so few, so "not enough Takes
   * yet" is the honest empty state. Never true beside a noticed line (c4a1b,
   * L1): every line rests on at least `MIN_TAKES` of those Takes. Measured on
   * the Takes alone, so it holds whatever `noticedState` is.
   */
  tooFewTakes: boolean;
};

/**
 * `states`: `coachKeyStates()`. The read side fails closed (c4a1c, F1): a key
 * not read yet, or not readable, shows nothing it governs.
 */
export function notebookFrom(
  rows: readonly PathTakeRow[],
  stored: CoachStored,
  states: CoachKeyStates,
  now: number,
  paths?: readonly PathDoc[],
): Notebook {
  const window = windowOf(rows);
  const firstTakeAt = window.length ? window[window.length - 1].startedAt : null;
  const noticedState = states.suppressed;
  const goalState = states.goal;
  const noticed = noticedState === "read" ? tendencies(rows, now, { paths, suppressed: stored.suppressed }) : [];
  const tooFewTakes = playedOf(rows).length < MIN_TAKES;
  const goal = goalState === "read" ? stored.goal : null;
  const askGoal =
    goalState === "read" &&
    goal === null &&
    firstTakeAt !== null &&
    now - firstTakeAt >= GOAL_ASK_AFTER_DAYS * DAY_MS &&
    cardMayShow(stored, "goal", now, states);
  return {
    noticed,
    noticedState,
    goal,
    goalState,
    askGoal,
    takesRead: window.length,
    firstTakeAt,
    tooFewTakes,
  };
}
