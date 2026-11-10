/**
 * Paths: which goal, where you are in it, and what a Step asks of you.
 *
 * A list, a Path and a Step, kept in this one view because none of them is a place
 * the rest of the app links to yet. Nothing is locked or priced: a Step can be
 * chosen from any point, and a Path the app cannot grade yet says "later".
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Exercise, PathDoc, Step } from "../../paths/format";
import { barLine } from "../../session/coachWords";
import { isRunnable } from "../../session/packs";
import {
  cleanTempoOf,
  currentStepOf,
  isExercisePassed,
  isGradable,
  isStepPassed,
  takesOf,
} from "../../session/progress";
import { levelsOf } from "../../session/variants";
import type { SessionRun } from "./hooks/useSessionRun";
import { lineText } from "./lineText";
import "../../styles/session.css";

function DraftNote({ path }: { path: PathDoc }) {
  const { t } = useTranslation();
  if (path.review.status !== "draft") return null;
  return <span className="session-tag" data-quiet="">{t("session.paths.draft")}</span>;
}

function PathList({
  session,
  onOpen,
}: {
  session: SessionRun;
  onOpen: (path: PathDoc) => void;
}) {
  const { t } = useTranslation();
  const { paths, progress } = session;
  const column = (kind: PathDoc["kind"], title: string, sub: string) => (
    <div className="session-col" key={kind}>
      <div>
        <div className="session-h3">{title}</div>
        <div className="session-quiet">{sub}</div>
      </div>
      {paths
        .filter((p) => p.kind === kind)
        .map((path) => {
          const runnable = isRunnable(path.id);
          const started = progress.states.some((s) => s.pathId === path.id);
          return (
            <button
              key={path.id}
              className="session-path-card"
              onClick={() => onOpen(path)}
              data-testid={`path-card-${path.id}`}
            >
              <span className="session-plan-title">
                <span>{path.title}</span>
                {!runnable && (
                  <span className="session-tag" data-quiet="">
                    {t("session.paths.later")}
                  </span>
                )}
              </span>
              <span className="session-why">
                {t("session.paths.stepCount", { count: path.steps.length })}
                {started && ` · ${currentStepOf(progress, path).title}`}
              </span>
              <span className="session-quiet">{path.goal}</span>
            </button>
          );
        })}
    </div>
  );
  return (
    <div className="session-page session-paths" data-testid="paths">
      <div>
        <h2 className="session-h2">{t("session.paths.title")}</h2>
        <div className="session-why">{t("session.paths.intro")}</div>
      </div>
      <div className="session-split">
        {column("theory", t("session.kind.theory"), t("session.paths.theorySub"))}
        {column("mechanics", t("session.kind.mechanics"), t("session.paths.mechanicsSub"))}
      </div>
    </div>
  );
}

function PathDetail({
  session,
  path,
  onBack,
  onOpenStep,
}: {
  session: SessionRun;
  path: PathDoc;
  onBack: () => void;
  onOpenStep: (step: Step) => void;
}) {
  const { t } = useTranslation();
  const { progress, actions } = session;
  const current = currentStepOf(progress, path);
  const levels = levelsOf(path);
  const level = progress.states.find((s) => s.pathId === path.id)?.level;
  return (
    <div className="session-page session-path" data-testid="path-detail">
      <button className="session-link" onClick={onBack}>
        {t("session.paths.back")}
      </button>
      <div>
        <div className="session-plan-title">
          <h2 className="session-h2">{path.title}</h2>
          <span className="session-tag">{t(`session.kind.${path.kind}`)}</span>
          <DraftNote path={path} />
        </div>
        <div className="session-why">{path.goal}</div>
        {!isRunnable(path.id) && (
          <div className="session-why">{t("session.paths.laterWhy")}</div>
        )}
      </div>
      {levels.length > 0 && (
        <div className="session-level">
          <span className="session-quiet">{t("session.paths.level")}</span>
          <div className="session-seg" role="group" aria-label={t("session.paths.level")}>
            {levels.map((l) => (
              <button
                key={l.id}
                className={l.id === level ? "on" : ""}
                aria-pressed={l.id === level}
                onClick={() => actions.chooseLevel(path, l.id)}
              >
                {l.title}
              </button>
            ))}
          </div>
        </div>
      )}
      <ol className="session-step-list">
        {path.steps.map((step) => {
          const passed = isStepPassed(progress, path.id, step);
          const isCurrent = step.id === current.id && isRunnable(path.id);
          const gradable = step.exercises.filter(isGradable);
          const done = gradable.filter((e) => isExercisePassed(progress, path.id, e)).length;
          return (
            <li key={step.id}>
              <button
                className="session-step-row"
                data-current={isCurrent ? "" : undefined}
                data-passed={passed ? "" : undefined}
                onClick={() => onOpenStep(step)}
                data-testid={`step-row-${step.id}`}
              >
                <span className="session-step-num">{passed ? "✓" : step.order}</span>
                <span className="session-step-text">
                  <span className="session-plan-title">{step.title}</span>
                  {(isCurrent || passed) && gradable.length > 0 && (
                    <span className="session-quiet">
                      {t("session.paths.exercisesPassed", { done, count: gradable.length })}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="session-card">
        <div className="session-kick">{t("session.paths.limits")}</div>
        <div className="session-why">{path.gradingLimits}</div>
      </div>
    </div>
  );
}

function ExerciseRow({
  session,
  path,
  step,
  exercise,
}: {
  session: SessionRun;
  path: PathDoc;
  step: Step;
  exercise: Exercise;
}) {
  const { t } = useTranslation();
  const { progress, actions } = session;
  const clean = cleanTempoOf(progress, path.id, exercise.id);
  const passed = isExercisePassed(progress, path.id, exercise);
  const played = takesOf(progress, path.id, exercise.id).length;
  const bar = barLine(exercise, exercise.tempo.passAtBpm);
  const gradable = isGradable(exercise);
  return (
    <div className="session-exercise" data-testid={`exercise-${exercise.id}`}>
      <div className="session-exercise-text">
        <div className="session-plan-title">
          <span>{exercise.title}</span>
          {passed && <span className="session-tag" data-met="">{t("session.paths.passed")}</span>}
        </div>
        <div className="session-why">{exercise.purpose}</div>
        {gradable && bar && <div className="session-quiet">{lineText(t, bar)}</div>}
        {!gradable && <div className="session-quiet">{t("session.paths.notGradedYet")}</div>}
        {played > 0 && (
          <div className="session-quiet">
            {clean === null
              ? t("session.paths.playedNoClean", { count: played })
              : t("session.paths.playedClean", { count: played, bpm: clean })}
          </div>
        )}
      </div>
      {gradable && isRunnable(path.id) && (
        <button
          className="session-secondary"
          onClick={() => actions.playExercise(path, step, exercise)}
          data-testid={`play-${exercise.id}`}
        >
          {t("session.paths.playThis")}
        </button>
      )}
    </div>
  );
}

function StepDetail({
  session,
  path,
  step,
  onBack,
}: {
  session: SessionRun;
  path: PathDoc;
  step: Step;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const { progress, actions } = session;
  const isCurrent = currentStepOf(progress, path).id === step.id;
  return (
    <div className="session-page session-step" data-testid="step-detail">
      <button className="session-link" onClick={onBack}>
        {path.title}
      </button>
      <div>
        <div className="session-kick">
          {t("session.paths.stepOf", { n: step.order, of: path.steps.length })}
        </div>
        <div className="session-plan-title">
          <h2 className="session-h2">{step.title}</h2>
          <span className="session-tag">{t(`session.kind.${path.kind}`)}</span>
        </div>
        <div className="session-why">{step.goal}</div>
      </div>
      <div className="session-split">
        <div className="session-col">
          <div className="session-kick">{t("session.paths.why")}</div>
          <div className="session-why">{step.why}</div>
          <div className="session-kick">{t("session.paths.howTo")}</div>
          {step.howTo.map((line) => (
            <div className="session-why" key={line}>
              {line}
            </div>
          ))}
          <div className="session-kick">{t("session.paths.payoff")}</div>
          <div className="session-why">{step.payoff}</div>
          <div className="session-why">{t("session.run.honest")}</div>
          {isRunnable(path.id) && !isCurrent && (
            <button
              className="session-secondary"
              onClick={() => actions.chooseStep(path, step)}
              data-testid="choose-step"
            >
              {t("session.paths.workOnThis")}
            </button>
          )}
          {isCurrent && isRunnable(path.id) && (
            <div className="session-quiet">{t("session.paths.yourStep")}</div>
          )}
        </div>
        <div className="session-col">
          <div className="session-kick">{t("session.paths.exercises")}</div>
          {step.exercises.map((exercise) => (
            <ExerciseRow
              key={exercise.id}
              session={session}
              path={path}
              step={step}
              exercise={exercise}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function PathsView({ session }: { session: SessionRun }) {
  const [pathId, setPathId] = useState<string | null>(null);
  const [stepId, setStepId] = useState<string | null>(null);
  const path = session.paths.find((p) => p.id === pathId) ?? null;
  const step = path?.steps.find((s) => s.id === stepId) ?? null;

  if (path && step) {
    return <StepDetail session={session} path={path} step={step} onBack={() => setStepId(null)} />;
  }
  if (path) {
    return (
      <PathDetail
        session={session}
        path={path}
        onBack={() => setPathId(null)}
        onOpenStep={(s) => setStepId(s.id)}
      />
    );
  }
  return <PathList session={session} onOpen={(p) => setPathId(p.id)} />;
}
