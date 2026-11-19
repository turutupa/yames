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

/**
 * What the Take's Start says and does with the input in mind (owner, beta 6:
 * "I hit start take but nothing happens"). Never a dead button: with the input
 * off it offers to turn it on and start, and while that happens it says so.
 */
export function startButton(
  session: SessionRun,
  listening: boolean,
  t: T,
): { label: string; busy: boolean; needsInput: boolean } {
  const { run, big, inputStart } = session;
  const graded = !run.ungraded;
  // The tour's look at a ready screen (card #50) is the calm one: no input
  // was asked for, so none is missing.
  const needsInput = big.kind === "playTake" && graded && !listening && !session.preview;
  if (!needsInput) return { label: bigLabel(big, t), busy: false, needsInput: false };
  if (inputStart.status === "starting") return { label: t("session.input.starting"), busy: true, needsInput };
  return { label: t("session.input.turnOnAndStart"), busy: false, needsInput };
}

/** The Take's own state: whether pressing Start would start it now. */
export function takeCanStart(session: SessionRun, _listening: boolean): boolean {
  // Off and graded, Start turns the input on first; while it comes on, a press
  // is kept and the Take starts once it is on. Pressable either way, never
  // dead: only a Take still loading holds it. A listen demo playing (card
  // #28) is not loading: Start stops it, and the Take starts once it is back.
  return session.prepared || session.listen?.active === true;
}

/**
 * Under a Take's ready screen: what the input is doing, in words, and the
 * ways out when it will not come on (owner, beta 6). Graded with the input
 * off, "Play without grading" is always offered; refused, the screen says what
 * went wrong and offers "Check my sound" and "Choose input".
 */
export function ReadyInput({
  session,
  listening,
  hasSignal,
  onTestInput,
  onChooseInput,
  compact = false,
}: {
  session: SessionRun;
  listening: boolean;
  hasSignal: boolean;
  onTestInput: () => void;
  onChooseInput: () => void;
  /** In a phone's sticky footer: the same words and ways out, tighter. */
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const { run, inputStart, actions } = session;
  if (run.phase !== "ready") return null;
  // The tour's look (card #50): nothing about the input, which it never asked for.
  if (session.preview) return null;
  const place = compact ? "footer" : undefined;
  // Listen first (card #28): while the demo plays, the input is not listening
  // for the player (the engine ignores it), so the line says what is going on.
  if (session.listen?.active) {
    return (
      <div className="session-input-note" role="status" data-place={place} data-testid="session-listen-note">
        <span className="session-input-dot" data-state="demo" aria-hidden="true" />
        <span>{t("session.practice.demoPlaying")}</span>
      </div>
    );
  }
  if (run.ungraded) {
    return (
      <div className="session-input-note" role="status" data-place={place} data-testid="session-ungraded-note">
        <span className="session-input-dot" data-state="ungraded" aria-hidden="true" />
        <span>{t(run.ungraded === "gradingOff" ? "session.ungraded.readyOff" : "session.ungraded.ready")}</span>
      </div>
    );
  }
  if (listening) {
    const device = inputStart.device;
    return (
      <div className="session-input-note" role="status" data-place={place} data-testid="session-input-on">
        <span className="session-input-dot" data-state={hasSignal ? "on" : "quiet"} aria-hidden="true" />
        <span>
          {inputStart.fellBack
            ? t("session.input.fellBack", { device: device ?? t("session.input.defaultDevice") })
            : device
              ? t("session.input.listeningTo", { device })
              : t(hasSignal ? "session.run.hearing" : "session.run.waitingForSignal")}
        </span>
      </div>
    );
  }
  if (inputStart.status === "failed") {
    return (
      <div className="session-glass session-card session-input-failed" role="alert" data-place={place} data-testid="session-input-failed">
        <div className="session-why session-bad">{t(`session.input.failed.${inputStart.failure ?? "other"}`)}</div>
        <div className="session-input-actions">
          <button className="session-secondary" onClick={onTestInput} data-testid="session-check-sound">
            {t("session.run.checkSound")}
          </button>
          <button className="session-secondary" onClick={onChooseInput} data-testid="session-choose-input">
            {t("session.input.chooseInput")}
          </button>
          <button className="session-link" onClick={actions.playUngraded} data-testid="session-play-ungraded">
            {t("session.input.playUngraded")}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="session-input-note" role="status" data-place={place} data-testid="session-no-input">
      <span className="session-input-dot" data-state="off" aria-hidden="true" />
      <span>
        {inputStart.status === "starting" ? t("session.input.startingLong") : t("session.run.noInput")}
      </span>
      <button className="session-link" onClick={actions.playUngraded} data-testid="session-play-ungraded">
        {t("session.input.playUngraded")}
      </button>
    </div>
  );
}
