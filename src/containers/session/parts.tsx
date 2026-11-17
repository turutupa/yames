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
      return t("session.run.goAgain", { bpm: action.bpm });
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
  return (
    <div className="session-nudges">
      <button
        className="session-secondary"
        disabled={!can.slower}
        onClick={session.actions.slower}
      >
        {t("session.run.slower")}
      </button>
      <button
        className="session-secondary"
        disabled={!can.faster}
        onClick={session.actions.faster}
      >
        {t("session.run.faster")}
      </button>
    </div>
  );
}
