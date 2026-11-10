/**
 * The running Session: one screen per state of the runner.
 *
 * No rail and no tools, because hands are on a guitar. There is one big thing to
 * press in every state, and it does what a pedal tap does: both come from
 * `bigAction`, so they cannot disagree.
 */
import { useTranslation } from "react-i18next";
import type { Exercise } from "../../paths/format";
import {
  barLine,
  displayBar,
  displayValue,
  metricKey,
  notCaughtHint,
  reasonLine,
  takeLine,
} from "../../session/coachWords";
import { planSession } from "../../session/planner";
import type { PlanStep } from "../../session/planner";
import {
  currentStep,
  minutesLeft,
  stepRemainingMs,
  tempoNudges,
} from "../../session/runner";
import type { BigAction, RunState, TakeOutcome } from "../../session/runner";
import type { BeatPosition } from "../../songs/position";
import { ExerciseStage } from "./ExerciseStage";
import type { SessionRun } from "./hooks/useSessionRun";
import { lineText } from "./lineText";
import { stepTitle } from "./TodayView";
import "../../styles/session.css";

type T = ReturnType<typeof useTranslation>["t"];

function bigLabel(action: BigAction, t: T): string {
  switch (action.kind) {
    case "startTake":
      return t("session.run.startTake", { bpm: action.bpm });
    case "stopTake":
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

/** Exit, how far along, and how long is left. The mocks' session bar. */
function SessionBar({ run, onExit }: { run: RunState; onExit: () => void }) {
  const { t } = useTranslation();
  const steps = run.plan?.steps ?? [];
  const left = minutesLeft(run);
  return (
    <div className="session-bar">
      <button className="session-exit" onClick={onExit} data-testid="session-exit">
        {t("session.run.exit")}
      </button>
      <div
        className="session-pips"
        role="img"
        aria-label={t("session.run.stepOf", { n: run.stepIndex + 1, of: steps.length })}
      >
        {steps.map((step, i) => (
          <i
            key={step.id}
            data-state={i < run.stepIndex ? "done" : i === run.stepIndex ? "on" : undefined}
          />
        ))}
      </div>
      <span className="session-quiet session-bar-left">
        {left > 0 ? t("session.run.minutesLeft", { minutes: left }) : t("session.run.timeUp")}
      </span>
    </div>
  );
}

/** The latest notes against the grid: a dot per note, late above, early below. */
function TimingStrip({ deviations }: { deviations: readonly number[] }) {
  const { t } = useTranslation();
  const W = 360;
  const H = 64;
  const MID = H / 2;
  const RANGE_MS = 50;
  const y = (ms: number) => MID - (Math.max(-RANGE_MS, Math.min(RANGE_MS, ms)) / RANGE_MS) * (MID - 8);
  const step = (W - 44) / 24;
  return (
    <svg
      className="session-strip"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={t("session.run.stripLabel")}
    >
      <text x="0" y="13" className="session-strip-label">
        {t("session.run.late")}
      </text>
      <text x="0" y={H - 4} className="session-strip-label">
        {t("session.run.early")}
      </text>
      <line x1="36" x2={W} y1={MID} y2={MID} className="session-strip-grid" />
      {deviations.map((ms, i) => (
        <circle key={i} cx={40 + i * step} cy={y(ms)} r="4" className="session-strip-dot" />
      ))}
    </svg>
  );
}

function TempoNudges({
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

/** One line for each thing the pedal does, so nobody has to remember. */
function PedalCard() {
  const { t } = useTranslation();
  return (
    <div className="session-card session-pedal-card">
      <div className="session-kick">{t("session.pedal.title")}</div>
      <dl className="session-legend">
        <dt>{t("session.pedal.tap")}</dt>
        <dd>{t("session.pedal.tapDoes")}</dd>
        <dt>{t("session.pedal.double")}</dt>
        <dd>{t("session.pedal.doubleDoes")}</dd>
        <dt>{t("session.pedal.hold")}</dt>
        <dd>{t("session.pedal.holdDoes")}</dd>
      </dl>
    </div>
  );
}

/** Ready and running are one screen: what to play, and how it is going. */
function TakeScreen({
  session,
  themeId,
  beat,
  isPlaying,
  listening,
  hasSignal,
  onCheckSound,
}: {
  session: SessionRun;
  themeId: string;
  beat: BeatPosition | null;
  isPlaying: boolean;
  listening: boolean;
  hasSignal: boolean;
  onCheckSound: () => void;
}) {
  const { t } = useTranslation();
  const { run, take, exercise, live, lights, big, prepared, engineTrouble, actions } = session;
  const step = currentStep(run);
  if (!exercise || !take || !step) return null;

  const pathTitle = session.paths.find((p) => p.id === take.pathId);
  const stepNumber = pathTitle?.steps.find((s) => s.exercises.some((e) => e.id === exercise.id))?.order;
  const running = run.phase === "playing";
  const bar = barLine(exercise, run.bpm);
  const scored = live.heard + live.missed;
  const inputReady = listening;
  const canStart = prepared && inputReady;

  return (
    <div className="session-body" data-testid="session-take" data-phase={run.phase}>
      <div className="session-head">
        <div className="session-head-text">
          <div className="session-kick">
            {t("session.kind.mechanics")}
            {pathTitle &&
              ` · ${t("session.run.pathStep", { path: pathTitle.title, step: stepNumber ?? 1 })}`}
          </div>
          <h2 className="session-h2">{exercise.title}</h2>
          <div className="session-why">{lineText(t, reasonLine(step.why))}</div>
        </div>
        <div className="session-bpm">
          {run.bpm}
          <small>{t("session.run.bpm")}</small>
        </div>
      </div>

      <ExerciseStage
        take={take}
        tick={running && beat && !beat.songCountIn ? beat.songTick : 0}
        playing={running && isPlaying && !beat?.songCountIn}
        themeId={themeId}
        lights={lights}
      />

      {running ? (
        <div className="session-live" data-testid="session-live">
          <div className="session-stats">
            <div className="session-stat">
              <b>{scored > 0 ? `${Math.round((live.heard / scored) * 100)}%` : "–"}</b>
              <span>{t("session.run.heardSoFar")}</span>
            </div>
            <div className="session-stat">
              <b>
                {live.bars}
                <span className="session-stat-of"> / {take.bars}</span>
              </b>
              <span>{t("session.run.bars")}</span>
            </div>
          </div>
          <TimingStrip deviations={live.deviations} />
        </div>
      ) : (
        <div className="session-brief">
          <div className="session-coach">{exercise.coachLine}</div>
          {exercise.howTo[0] && <div className="session-why">{exercise.howTo[0]}</div>}
          {bar && <div className="session-why">{lineText(t, bar)}</div>}
        </div>
      )}

      <div className="session-grow" />
      {live.countingIn && running && (
        <div className="session-count" role="status">
          {t("session.run.countIn")}
        </div>
      )}
      <div className="session-why">{t("session.run.honest")}</div>

      {!running && !inputReady && (
        <div className="session-card" role="status" data-testid="session-no-input">
          <div className="session-why">{t("session.run.noInput")}</div>
          <button className="session-link" onClick={onCheckSound}>
            {t("session.run.checkSound")}
          </button>
        </div>
      )}
      {engineTrouble && (
        <div className="session-card" role="alert">
          <div className="session-why">{t("session.run.engineTrouble")}</div>
        </div>
      )}

      <div className="session-actions">
        <button
          className="session-big"
          onClick={actions.go}
          disabled={!running && !canStart}
          data-testid="session-big"
        >
          {bigLabel(big, t)}
        </button>
        {!running && <TempoNudges run={run} exercise={exercise} session={session} />}
        {!running && inputReady && (
          <span className="session-signal" data-on={hasSignal ? "" : undefined}>
            <i />
            {t(hasSignal ? "session.run.hearing" : "session.run.waitingForSignal")}
          </span>
        )}
      </div>
    </div>
  );
}

/** The number that moved, against the bar. */
function MovedNumber({ outcome }: { outcome: TakeOutcome }) {
  const { t } = useTranslation();
  const check = outcome.grade.headline;
  if (!check) return null;
  const value = displayValue(check);
  const bar = displayBar(check);
  const metric = metricKey(check.metric);
  const percent = check.metric !== "extraNotes";
  const before =
    outcome.previousValue === null
      ? null
      : displayValue({ metric: check.metric, value: outcome.previousValue });
  const moved = before !== null && before !== value;
  const met = check.met === true;
  return (
    <div className="session-moved" data-testid="session-moved">
      {moved && <span className="session-moved-before">{before} →</span>}
      <span className="session-mega session-moved-value" data-met={met ? "" : undefined}>
        {value}
        {percent ? "%" : ""}
      </span>
      <span className="session-h2">{t(`session.metric.${metric}`)}</span>
      {bar !== null && (
        <span className="session-tag" data-met={met ? "" : undefined}>
          {met
            ? t("session.result.barMet")
            : t(percent ? "session.result.barIs" : "session.result.barIsCount", { bar })}
        </span>
      )}
    </div>
  );
}

function CleanTempoLine({ outcome }: { outcome: TakeOutcome }) {
  const { t } = useTranslation();
  const earned = outcome.grade.cleanBpm;
  if (earned === null) return null;
  if (outcome.cleanBefore !== null && outcome.cleanBefore >= earned) return null;
  return (
    <div className="session-clean" data-testid="session-clean">
      {outcome.cleanBefore === null
        ? t("session.result.cleanFirst", { bpm: earned })
        : t("session.result.cleanMoved", { from: outcome.cleanBefore, bpm: earned })}
    </div>
  );
}

/** A graded Take: passed reads as a result, below the bar as between Takes. */
function ResultScreen({ session }: { session: SessionRun }) {
  const { t } = useTranslation();
  const { run, exercise, big, actions } = session;
  const outcome = run.outcomes[run.outcomes.length - 1];
  if (!outcome) return null;
  const passed = outcome.grade.verdict === "passed";
  const line = takeLine(outcome.grade, outcome.measures, outcome.bpm);
  return (
    <div
      className="session-body"
      data-testid={passed ? "session-result" : "session-between"}
    >
      <div className="session-kick">
        {t("session.result.kick", {
          take: outcome.takeNumber,
          title: outcome.title,
          bpm: outcome.bpm,
          bars: outcome.measures.barsPlayed,
        })}
      </div>
      <MovedNumber outcome={outcome} />
      <CleanTempoLine outcome={outcome} />
      <div className="session-coach">{lineText(t, line)}</div>
      {outcome.grade.unmeasured.length > 0 && (
        <div className="session-why">{t("session.result.unmeasuredNotes")}</div>
      )}
      <div className="session-grow" />
      <button className="session-big" onClick={actions.go} data-testid="session-big">
        {bigLabel(big, t)}
      </button>
      <div className="session-nudges">
        <TempoNudges run={run} exercise={exercise} session={session} />
        {big.kind !== "again" && (
          <button className="session-secondary" onClick={actions.again}>
            {t("session.result.againSame", { bpm: run.bpm })}
          </button>
        )}
        {big.kind === "again" && (
          <button className="session-secondary" onClick={actions.next}>
            {t("session.result.moveOn")}
          </button>
        )}
      </div>
      {passed && (
        <button className="session-choice" onClick={actions.rampFromHere}>
          <b>{t("session.result.rampTitle")}</b>
          <span>{t("session.result.rampBody", { bpm: outcome.bpm })}</span>
        </button>
      )}
      {!passed && <PedalCard />}
    </div>
  );
}

function NoCatchScreen({
  session,
  onCheckSound,
}: {
  session: SessionRun;
  onCheckSound: () => void;
}) {
  const { t } = useTranslation();
  const { run, big, actions } = session;
  const outcome = run.outcomes[run.outcomes.length - 1];
  if (!outcome) return null;
  const { measures } = outcome;
  return (
    <div className="session-body session-center" data-testid="session-no-catch">
      <div className="session-kick">{t("session.noCatch.kick")}</div>
      <h1 className="session-h1">{t("session.noCatch.title")}</h1>
      {measures.expected > 0 && (
        <div className="session-stat">
          <b>{measures.heard}</b>
          <span>{t("session.noCatch.heardOf", { expected: measures.expected })}</span>
        </div>
      )}
      <div className="session-why">
        {t("session.noCatch.noGuess")} {lineText(t, notCaughtHint(measures))}
      </div>
      <button className="session-big" onClick={actions.go} data-testid="session-big">
        {bigLabel(big, t)}
      </button>
      <div className="session-nudges">
        <button className="session-link" onClick={onCheckSound}>
          {t("session.run.checkSound")}
        </button>
        <button className="session-link" onClick={actions.next}>
          {t("session.result.moveOn")}
        </button>
      </div>
    </div>
  );
}

function clock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** A metronome, a jam or a drill: not graded, and it moves on by itself. */
function TimedScreen({
  session,
  themeId,
  bpmNow,
}: {
  session: SessionRun;
  themeId: string;
  bpmNow: number;
}) {
  const { t } = useTranslation();
  const { run, take, big, actions } = session;
  const step = currentStep(run);
  if (!step) return null;
  const kick =
    step.kind === "metronome"
      ? t("session.timed.warmUpKick")
      : step.kind === "jam"
        ? t("session.timed.jamKick")
        : t("session.timed.drillKick");
  const bpm = step.kind === "metronome" ? step.bpm : bpmNow;
  return (
    <div className="session-body" data-testid="session-timed" data-kind={step.kind}>
      <div className="session-head">
        <div className="session-head-text">
          <div className="session-kick">{kick}</div>
          <h2 className="session-h2">{stepTitle(step, t)}</h2>
          <div className="session-why">{lineText(t, reasonLine(step.why))}</div>
        </div>
        {bpm > 0 && (
          <div className="session-bpm">
            {bpm}
            <small>{t("session.run.bpm")}</small>
          </div>
        )}
      </div>
      {step.kind === "metronome" && take && (
        <ExerciseStage take={take} tick={0} playing={false} themeId={themeId} />
      )}
      <div className="session-grow" />
      <div className="session-countdown" role="timer" data-testid="session-countdown">
        {clock(stepRemainingMs(run))}
      </div>
      <div className="session-why">{t("session.timed.movesOn")}</div>
      <button className="session-big" onClick={actions.go} data-testid="session-big">
        {bigLabel(big, t)}
      </button>
    </div>
  );
}

function RecapItem({ step, session }: { step: PlanStep; session: SessionRun }) {
  const { t } = useTranslation();
  const outcomes = session.run.outcomes.filter((o) => o.stepId === step.id);
  if (outcomes.length === 0) return null;
  const first = outcomes[0];
  const last = outcomes[outcomes.length - 1];
  const graded = outcomes.filter((o) => o.grade.headline && o.grade.verdict !== "notCaught");
  const head = graded[graded.length - 1]?.grade.headline ?? null;
  const metric = head ? metricKey(head.metric) : null;
  const value = head ? displayValue(head) : null;
  const percent = head?.metric !== "extraNotes";
  const before =
    graded[0]?.previousValue != null && head
      ? displayValue({ metric: head.metric, value: graded[0].previousValue })
      : null;
  return (
    <div className="session-recap-item">
      <div className="session-recap-text">
        <div className="session-plan-title">{first.title}</div>
        <div className="session-why">
          {t("session.recap.takesAt", { count: outcomes.length, bpm: last.bpm })}
          {last.grade.verdict === "passed" ? ` · ${t("session.result.barMet")}` : ""}
        </div>
      </div>
      {value !== null && metric && (
        <div className="session-recap-number">
          {before !== null && before !== value && <span>{before} → </span>}
          <b>
            {value}
            {percent ? "%" : ""}
          </b>
          <small>{t(`session.metric.${metric}`)}</small>
        </div>
      )}
    </div>
  );
}

function RecapScreen({ session }: { session: SessionRun }) {
  const { t } = useTranslation();
  const { run, actions, big } = session;
  const steps = run.plan?.steps ?? [];
  const passed = new Set(
    run.outcomes.filter((o) => o.grade.passesExercise).map((o) => o.exerciseId),
  ).size;
  const takes = run.outcomes.length;
  const notGraded = run.timedSteps.length > 0;
  const tomorrow = planSession({
    minutes: session.minutes,
    now: Date.now(),
    paths: session.myPaths,
    progress: session.progress,
  });

  return (
    <div className="session-body" data-testid="session-recap">
      <div>
        <div className="session-kick">{t("session.recap.kick")}</div>
        <h1 className="session-h1">
          {passed > 0
            ? t("session.recap.passed", { count: passed })
            : takes > 0
              ? t("session.recap.takes", { count: takes })
              : t("session.recap.none")}
        </h1>
      </div>
      <div className="session-split">
        <div className="session-col">
          <div className="session-kick">{t("session.recap.moved")}</div>
          {steps.map((step) => (
            <RecapItem key={step.id} step={step} session={session} />
          ))}
          {takes === 0 && <div className="session-why">{t("session.recap.noTakes")}</div>}
          {notGraded && <div className="session-why">{t("session.recap.notGraded")}</div>}
        </div>
        <div className="session-col">
          <div className="session-kick">
            {t("session.recap.nextSession", { minutes: tomorrow.minutes })}
          </div>
          {tomorrow.steps
            .filter((s) => s.kind === "exercise")
            .map((step) => (
              <div className="session-plan-item" key={step.id}>
                <div className="session-plan-body">
                  <div className="session-plan-title">{stepTitle(step, t)}</div>
                  <div className="session-why">{lineText(t, reasonLine(step.why))}</div>
                </div>
              </div>
            ))}
        </div>
      </div>
      <div className="session-grow" />
      <button className="session-big" onClick={actions.go} data-testid="session-big">
        {bigLabel(big, t)}
      </button>
    </div>
  );
}

export function SessionView({
  session,
  themeId,
  beat,
  isPlaying,
  listening,
  hasSignal,
  bpmNow,
  onCheckSound,
}: {
  session: SessionRun;
  themeId: string;
  beat: BeatPosition | null;
  isPlaying: boolean;
  listening: boolean;
  hasSignal: boolean;
  /** The tempo the engine is at, for a ramp that moves it. */
  bpmNow: number;
  onCheckSound: () => void;
}) {
  const { t } = useTranslation();
  const { run, actions } = session;
  const last = run.outcomes[run.outcomes.length - 1];

  return (
    <div className="session-page session-run" data-testid="session">
      {run.phase !== "recap" && <SessionBar run={run} onExit={actions.exit} />}
      {(run.phase === "ready" || run.phase === "playing") && (
        <TakeScreen
          session={session}
          themeId={themeId}
          beat={beat}
          isPlaying={isPlaying}
          listening={listening}
          hasSignal={hasSignal}
          onCheckSound={onCheckSound}
        />
      )}
      {run.phase === "listening" && (
        <div className="session-body session-center" role="status" data-testid="session-listening">
          <div className="session-h2">{t("session.run.listeningBack")}</div>
        </div>
      )}
      {run.phase === "result" &&
        (last?.grade.verdict === "notCaught" ? (
          <NoCatchScreen session={session} onCheckSound={onCheckSound} />
        ) : (
          <ResultScreen session={session} />
        ))}
      {run.phase === "timed" && <TimedScreen session={session} themeId={themeId} bpmNow={bpmNow} />}
      {run.phase === "recap" && <RecapScreen session={session} />}
    </div>
  );
}

