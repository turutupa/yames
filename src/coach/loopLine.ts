/**
 * The loop step in words (DESIGN 4.2, "Loop a bar"): what its button says,
 * what its screen is called, and the one line after it, from what the loop
 * heard. Pure: the hook counts the rounds, this says them.
 *
 * "Landed" is the plainest measured thing a loop can say: a round in which no
 * note of the bar was missed. It never says why, and with grading off (or
 * nothing heard) it says nothing at all.
 */
import type { Line } from "../session/coachWords";
import type { LoopStep } from "../session/planner";
import type { LoopHeard } from "../session/runner";

/** One round of the loop, as the scorer's live verdicts counted it. */
export type LoopRound = { seen: number; missed: number };

/**
 * What a loop heard: only the rounds heard whole (every onset of the round
 * decided), so a round cut short by the stop is not counted against anyone.
 * Null when not one round was.
 */
export function loopHeardOf(rounds: ReadonlyMap<number, LoopRound>, onsetsPerRound: number): LoopHeard | null {
  if (onsetsPerRound <= 0) return null;
  const whole = [...rounds.entries()]
    .filter(([, r]) => r.seen >= onsetsPerRound)
    .sort((a, b) => a[0] - b[0])
    .map(([, r]) => r.missed === 0);
  if (whole.length === 0) return null;
  let lastRun = 0;
  for (let i = whole.length - 1; i >= 0 && whole[i]; i -= 1) lastRun += 1;
  return { rounds: whole.length, landed: whole.filter(Boolean).length, lastRun };
}

/** The bars a loop names, as the note's keys take them. */
function barsOf(loop: Pick<LoopStep, "fromBar" | "toBar">): { shape: "Bar" | "Bars"; values: Record<string, number> } {
  return loop.fromBar === loop.toBar
    ? { shape: "Bar", values: { bar: loop.fromBar } }
    : { shape: "Bars", values: { from: loop.fromBar, to: loop.toBar } };
}

/** "Loop the first bar", "Loop bar 3", "Loop bars 2 and 3": the button's words follow the bar. */
export function loopButtonLine(loop: Pick<LoopStep, "fromBar" | "toBar">): Line {
  if (loop.fromBar === 1 && loop.toBar === 1) return { key: "session.loop.button.first", values: {} };
  const { shape, values } = barsOf(loop);
  return { key: `session.loop.button.${shape === "Bar" ? "bar" : "bars"}`, values };
}

/** The loop screen's title: which bars, on repeat. */
export function loopTitleLine(loop: Pick<LoopStep, "fromBar" | "toBar">): Line {
  const { shape, values } = barsOf(loop);
  return { key: `session.loop.title.${shape === "Bar" ? "bar" : "bars"}`, values };
}

/** Rounds in a row at the end that make "the last N rounds" worth saying. */
export const LOOP_LAST_RUN = 2;

/**
 * The one line on the ready screen after a loop, or null: nothing when the
 * loop was not graded or heard no whole round.
 */
export function loopLine(heard: LoopHeard | null, loop: Pick<LoopStep, "fromBar" | "toBar">, graded: boolean): Line | null {
  if (!graded || !heard || heard.rounds === 0) return null;
  const { shape, values } = barsOf(loop);
  if (heard.lastRun >= LOOP_LAST_RUN) {
    return { key: `session.loop.after.last${shape}`, values: { ...values, count: heard.lastRun } };
  }
  return { key: `session.loop.after.of${shape}`, values: { ...values, landed: heard.landed, count: heard.rounds } };
}
