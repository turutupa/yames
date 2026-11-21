/**
 * The coach's three keys (DESIGN 5.1, last row; ROADMAP 3.5): `ask-explain-last`,
 * `ask-what-next`, `accept-suggestion`. Unbound by default; a key or a MIDI
 * button reaches them through the action dispatcher. No panel opens: an answer
 * is one line in the coach's slot (`coach/coachSlot.ts`), spoken if Voice is on.
 *
 * They answer on an Exercise's ready screen and on a result, and nowhere else:
 * during a count-in, a Take, its listening, a loop, a warm-up or a jam they do
 * nothing at all (DESIGN 3.4: nothing during a Take), and the timed blocks and
 * the recap have no slot for a line.
 *
 * Nothing here words anything new about the playing. The finding is the one
 * the result note drew; the reason is the planner's (`step.why`) or the rule
 * the big button followed, in the sentences the Session already says.
 */
import { findingFor } from "../../coach/coachSlot";
import { soundIsStarting } from "../../coach/voice";
import { reasonLine } from "../../session/coachWords";
import { currentStep } from "../../session/runner";
import type { BigAction, RunState, TakeOutcome } from "../../session/runner";
import { bigLabel } from "./parts";
import { lastTakeLead, noteText } from "./SessionCoach";
import type { SessionRun } from "./hooks/useSessionRun";

type T = Parameters<typeof bigLabel>[1];

/**
 * Where the coach's keys answer: a ready screen of an Exercise, or a result.
 * Not between a Start and the engine reporting sound: the phase is still
 * `ready` then, and the count-in is about to begin (`soundIsStarting`).
 */
export function coachKeysAnswer(run: Pick<RunState, "phase">): boolean {
  if (soundIsStarting()) return false;
  return run.phase === "ready" || run.phase === "result";
}

function lastOf(run: Pick<RunState, "outcomes">): TakeOutcome | null {
  return run.outcomes[run.outcomes.length - 1] ?? null;
}

/**
 * `ask-explain-last`: the last Take's finding, as the result note said it.
 * Null where the key does nothing.
 */
export function explainLastText(t: T, session: Pick<SessionRun, "run">): string | null {
  const { run } = session;
  if (!coachKeysAnswer(run)) return null;
  const last = lastOf(run);
  if (!last) return t("session.keys.noTakeYet");
  const noted = findingFor(last);
  if (noted) return noted.text;
  // Played without grading: nothing was measured, and nothing is claimed.
  if (last.ungraded !== undefined) return t("session.keys.ungradedLast");
  return lastTakeLead(t, last) ?? t("session.keys.lastBelow", { bpm: last.bpm });
}

/** Why the big button does what it does, in a sentence the Session already has; null when there is none to add. */
function whyOf(t: T, run: RunState, big: BigAction): string | null {
  const last = lastOf(run);
  switch (big.kind) {
    case "playTake": {
      const step = currentStep(run);
      if (!step) return null;
      const mine = run.outcomes.filter((o) => o.stepId === step.id);
      const before = mine[mine.length - 1];
      // The planner's reason holds for the step's first Take; after one, the
      // tempo is where that Take left it, and that Take is the reason.
      return before ? lastTakeLead(t, before) : noteText(t, reasonLine(step.why));
    }
    case "again":
      if (big.onceMore) return t("session.note.repeat.onceMore", { bpm: big.bpm, up: big.onceMore.up });
      if (!last || last.ungraded !== undefined) return null;
      if (big.up) return t("session.why.climb", { bpm: last.bpm, next: big.bpm });
      if (last.grade.verdict === "notCaught") return t("session.why.notCaught", { bpm: last.bpm });
      if (last.grade.verdict === "belowBar") return t("session.why.belowBar.plain", { bpm: last.bpm });
      return null;
    case "next":
      // P2: the note's own line says why it moves on.
      if (big.leaveIt) return findingFor(last)?.history ?? null;
      return noteText(t, reasonLine(big.step.why));
    case "finish":
      return big.leaveIt ? (findingFor(last)?.history ?? null) : null;
    default:
      return null;
  }
}

/**
 * `ask-what-next`: what the big button will do, in its own words, and why.
 * Null where the key does nothing.
 */
export function whatNextText(t: T, session: Pick<SessionRun, "run" | "big">): string | null {
  const { run, big } = session;
  if (!coachKeysAnswer(run)) return null;
  const action = bigLabel(big, t);
  if (!action) return null;
  const why = whyOf(t, run, big);
  return why ? t("session.keys.whatNext", { action, why }) : t("session.keys.whatNextAlone", { action });
}

/** One coach suggestion on screen, and the press it stands for. */
export type OnScreenSuggestion = { id: "upTo" | "loop" | "eyes"; press: () => void };

/**
 * The suggestions the coach's rules put on the screen now, as the screens draw
 * them: "Up to N" (P1), "Loop bar 3", "This one is for your eyes". The big
 * button is not one (it has its own key), nor are the tempo nudges.
 */
export function suggestionsOnScreen(
  session: Pick<SessionRun, "run" | "big" | "loop" | "eyes" | "actions">,
): OnScreenSuggestion[] {
  const { run, big, loop, eyes, actions } = session;
  const looped: OnScreenSuggestion[] = loop ? [{ id: "loop", press: actions.startLoop }] : [];
  if (run.phase === "ready") return looped;
  if (run.phase !== "result") return [];
  const last = lastOf(run);
  if (!last) return [];
  // The ungraded result offers the loop alone; a Take not caught, nothing.
  if (last.ungraded !== undefined) return looped;
  if (last.grade.verdict === "notCaught") return [];
  const out: OnScreenSuggestion[] = [];
  if (big.kind === "again" && big.onceMore) out.push({ id: "upTo", press: actions.upTo });
  out.push(...looped);
  if (eyes) out.push({ id: "eyes", press: actions.eyesTake });
  return out;
}

/** `accept-suggestion`: press the suggestion on screen when there is exactly one. Whether it pressed. */
export function acceptSuggestion(
  session: Pick<SessionRun, "run" | "big" | "loop" | "eyes" | "actions">,
): boolean {
  // A loop pressed between Start and the engine's report would stop the count-in.
  if (!coachKeysAnswer(session.run)) return false;
  const on = suggestionsOnScreen(session);
  if (on.length !== 1) return false;
  on[0].press();
  return true;
}
