/**
 * Pieces the Take screens share: the neck view's (`SessionView.tsx`) and the
 * runway's (`highway/RunwayTake.tsx`).
 */
import { useTranslation } from "react-i18next";
import type { Exercise } from "../../paths/format";
import { tempoNudges } from "../../session/runner";
import type { BigAction, RunState } from "../../session/runner";
import type { PlanStep } from "../../session/planner";
import type { SessionRun } from "./hooks/useSessionRun";
import { stepTitle } from "./TodayView";

/** One line from the coach, with its lamp. */
export function CoachLine({ children, good }: { children: React.ReactNode; good?: boolean }) {
  return (
    <div className="session-coach session-glass">
      <i className="session-lamp" data-good={good ? "" : undefined} />
      <div>{children}</div>
    </div>
  );
}

type T = ReturnType<typeof useTranslation>["t"];

/** What a timed step is called on its Start button and in its one-line how-to. */
function timedKind(step: PlanStep): "warmUp" | "yourTurn" | "jam" | "finisher" | "drill" {
  if (step.kind === "metronome") return step.why.code === "yourTurn" ? "yourTurn" : "warmUp";
  if (step.kind === "jam") return step.exerciseId ? "finisher" : "jam";
  return "drill";
}

export function timedStartKey(step: PlanStep): string {
  return `session.timed.start.${timedKind(step)}`;
}

/** One line on how a timed step goes, for its ready screen. */
export function timedHowKey(step: PlanStep): string {
  return `session.timed.how.${timedKind(step)}`;
}

export function bigLabel(action: BigAction, t: T): string {
  switch (action.kind) {
    case "playTake":
      return t("session.run.playTake", { bpm: action.bpm });
    case "startTimed":
      return t(timedStartKey(action.step));
    case "endTake":
      return t("session.run.endTake");
    case "again":
      // The same words wherever going again is offered (UX audit SES-4).
      return t(action.up ? "session.run.goAgainUp" : "session.run.goAgain", { bpm: action.bpm });
    case "next":
      return t("session.run.next", {
        title: stepTitle(action.step, t),
      });
    case "finish":
      return t("session.run.finish");
    case "close":
      return t("session.run.done");
    case "none":
      return "";
  }
}

export function TempoNudges({
  run,
  exercise,
  session,
}: {
  run: RunState;
  exercise: Exercise | null;
  session: SessionRun;
}) {
  const { t } = useTranslation();
  const can = tempoNudges(run, exercise);
  // A disabled button says why (UX audit SES-13). The title sits on a wrapper,
  // because a disabled button gets no pointer events to show its own.
  const why = (reason: "locked" | "floor" | "ceiling" | null) =>
    reason === "locked"
      ? t("session.run.tempoLocked")
      : reason === "floor"
        ? t("session.run.slowerFloor")
        : reason === "ceiling"
          ? t("session.run.fasterCeiling")
          : undefined;
  return (
    <div className="session-nudges">
      <span className="session-nudge-wrap" title={why(can.slowerWhy)} data-why={can.slowerWhy ?? undefined}>
        <button
          className="session-secondary"
          disabled={!can.slower}
          aria-describedby={can.slowerWhy ? "session-slower-why" : undefined}
          onClick={session.actions.slower}
        >
          {t("session.run.slower")}
        </button>
      </span>
      <span className="session-nudge-wrap" title={why(can.fasterWhy)} data-why={can.fasterWhy ?? undefined}>
        <button
          className="session-secondary"
          disabled={!can.faster}
          aria-describedby={can.fasterWhy ? "session-faster-why" : undefined}
          onClick={session.actions.faster}
        >
          {t("session.run.faster")}
        </button>
      </span>
      {can.slowerWhy && (
        <span id="session-slower-why" className="sr-only">
          {why(can.slowerWhy)}
        </span>
      )}
      {can.fasterWhy && (
        <span id="session-faster-why" className="sr-only">
          {why(can.fasterWhy)}
        </span>
      )}
    </div>
  );
}
