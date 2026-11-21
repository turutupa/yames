/**
 * The coach's slot in a Session, for what the coach's keys say (DESIGN 5.1,
 * last row): `ask-explain-last`, `ask-what-next`. No panel: the answer is one
 * line where the coach's note already is, spoken if Voice is on.
 *
 * Two things live here, both module state read without React:
 *
 * - **the answer on screen**: one line, until the screen it was asked on goes
 *   (any Session boundary on the bus clears it). `useCoachAnswer` reads it;
 *   only the line re-renders, and only when it changes.
 * - **the last finding the result note drew** (`noteFinding`): the sentence
 *   `ask-explain-last` repeats. Kept as drawn, so the key says exactly what the
 *   note said, and keyed by the Take's outcome so a finding is never read out
 *   for another Take.
 */
import { useSyncExternalStore } from "react";
import type { TakeOutcome } from "../session/runner";
import { subscribe as subscribeBus, type Delivered } from "./bus";
import { sayNow } from "./voice";

export type NotedFinding = {
  outcome: TakeOutcome;
  /** The result note's headline: the finding. */
  text: string;
  /** The note's one quiet line under it (P2's "leave it", P1's "once more", history), when there was one. */
  history: string | null;
};

let finding: NotedFinding | null = null;
let answer: string | null = null;
const listeners = new Set<() => void>();

function changed(): void {
  for (const listener of listeners) listener();
}

/** The result note drew this finding for this Take. */
export function noteFinding(outcome: TakeOutcome, text: string, history: string | null): void {
  if (finding && finding.outcome === outcome && finding.text === text && finding.history === history) return;
  finding = { outcome, text, history };
}

/** What the result note said about this Take, or null when it said nothing (not caught, ungraded, never drawn). */
export function findingFor(outcome: TakeOutcome | null | undefined): NotedFinding | null {
  if (!outcome || !finding) return null;
  if (finding.outcome === outcome) return finding;
  return outcome.takeId && finding.outcome.takeId === outcome.takeId ? finding : null;
}

/** Put one line in the coach's slot, and say it if Voice is on and nothing sounds. */
export function showCoachAnswer(text: string): void {
  if (answer !== text) {
    answer = text;
    changed();
  }
  sayNow(text);
}

export function clearCoachAnswer(): void {
  if (answer === null) return;
  answer = null;
  changed();
}

export function getCoachAnswer(): string | null {
  return answer;
}

function subscribeAnswer(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The line in the coach's slot, or null. */
export function useCoachAnswer(): string | null {
  return useSyncExternalStore(subscribeAnswer, getCoachAnswer, getCoachAnswer);
}

function heard(event: Delivered): void {
  switch (event.type) {
    case "stepReady":
    case "takeStarted":
    case "takeResult":
    case "timedEnded":
    case "sessionRecap":
      clearCoachAnswer();
      return;
    default:
      return;
  }
}

/** The answer belongs to the screen it was asked on: any Session boundary clears it. Returns the uninstall. */
export function installCoachSlot(): () => void {
  return subscribeBus(heard);
}

/** Forget everything. Tests only. */
export function resetCoachSlot(): void {
  finding = null;
  answer = null;
  changed();
}
