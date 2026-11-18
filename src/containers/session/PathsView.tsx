/**
 * Paths: which goal, where you are in it, and what a Step asks of you.
 *
 * A list, a Path and a Step, kept in this one view because none of them is a place
 * the rest of the app links to yet. Nothing is locked or priced: a Step can be
 * chosen from any point, and a Path the app cannot grade yet says "later".
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import type { Exercise, PathDoc, Step } from "../../paths/format";
import { barLine, tempoRange } from "../../session/coachWords";
import { isRunnable, laterWhyKey } from "../../session/packs";
import { stepPickDirectionMatters } from "../../session/caveats";
import { testOutRetests } from "../../session/planner";
import { PATH_BADGE_KEY, exerciseGradingKey, pathBadge } from "../../session/badges";
import {
  cleanTempoOf,
  currentStepOf,
  isExercisePassed,
  isGradable,
  chosenLevelOf,
  isStepPassed,
  isStepSkipped,
  isSubscribed,
  takesOf,
} from "../../session/progress";
import { SUBSCRIPTION_CAP } from "../../session/rotation";
import { levelsOf } from "../../session/variants";
import type { SessionRun } from "./hooks/useSessionRun";
import { exerciseNeck, useNeck3d, useNeckSlot } from "./hooks/useNeck";
import type { NeckView } from "../../stage3d/api";
import { lineText } from "./lineText";
import { rise } from "./TodayView";
import { InstrumentNote } from "./InstrumentNote";
import { PATHS_LIST, pathsUp } from "../main-window/hooks/usePathsPlace";
import type { PathsAt, PathsPlace } from "../main-window/hooks/usePathsPlace";
import "../../styles/session.css";

const WHOLE: NeckView = { kind: "whole" };

function KindTag({ kind }: { kind: PathDoc["kind"] }) {
  const { t } = useTranslation();
  return (
    <span className="session-tag" data-kind={kind}>
      {t(`session.kind.${kind}`)}
    </span>
  );
}

/** One pip per Step: passed, the one you are on, the rest. */
function StepPips({ session, path }: { session: SessionRun; path: PathDoc }) {
  const current = currentStepOf(session.progress, path);
  return (
    <span className="session-pips" aria-hidden="true">
      {path.steps.map((step) => (
        <i
          key={step.id}
          data-state={
            isStepPassed(session.progress, path.id, step)
              ? "done"
              : step.id === current.id
                ? "on"
                : undefined
          }
        />
      ))}
    </span>
  );
}

/** Subscribed, Coming soon, or nothing (`session/badges.ts`). Never the pack's review status. */
function PathBadgeTag({ session, path }: { session: SessionRun; path: PathDoc }) {
  const { t } = useTranslation();
  const badge = pathBadge(path.id, session.progress);
  if (!badge) return null;
  return (
    <span className="session-tag" data-met={badge === "subscribed" ? "" : undefined} data-badge={badge}>
      {t(PATH_BADGE_KEY[badge])}
    </span>
  );
}

function PathList({
  session,
  onOpen,
  note,
}: {
  session: SessionRun;
  onOpen: (path: PathDoc) => void;
  note?: InstrumentNoteProps;
}) {
  const { t } = useTranslation();
  const { paths, progress } = session;
  const slot = useNeckSlot(WHOLE, [], { sweep: true });
  const neck3d = useNeck3d();
  const group = (kind: PathDoc["kind"], sub: string, i: number) => {
    const mine = paths.filter((p) => p.kind === kind);
    const runnable = mine.filter((p) => isRunnable(p.id));
    const later = mine.filter((p) => !isRunnable(p.id));
    return (
      <div className="session-pathgroup" key={kind}>
        <div className="session-row session-rise" style={rise(i)}>
          <KindTag kind={kind} />
          <span className="session-why">{sub}</span>
        </div>
        {runnable.map((path) => {
          const current = currentStepOf(progress, path);
          return (
            <button
              key={path.id}
              className="session-path-card session-glass session-rise"
              style={rise(i + 1)}
              onClick={() => onOpen(path)}
              data-testid={`path-card-${path.id}`}
            >
              <span className="session-col" style={{ gap: 2 }}>
                <span className="session-row" data-wrap="">
                  <span className="session-h2">{path.title}</span>
                  <PathBadgeTag session={session} path={path} />
                </span>
                <span className="session-why">
                  {t("session.paths.stepCount", { count: path.steps.length })}
                </span>
              </span>
              <span className="session-col" style={{ gap: 0 }}>
                <StepPips session={session} path={path} />
                <span className="session-why">
                  {t("session.paths.stepOf", { n: current.order, of: path.steps.length })}:{" "}
                  {current.title}
                </span>
              </span>
            </button>
          );
        })}
        {later.length > 0 && (
          <div className="session-later session-rise" style={rise(i + 2)}>
            {later.map((path) => (
              <button
                key={path.id}
                onClick={() => onOpen(path)}
                data-testid={`path-card-${path.id}`}
              >
                {path.title}
                <PathBadgeTag session={session} path={path} />
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };
  return (
    <div className="session-page" data-testid="paths" data-neck3d={neck3d}>
      <div className="session-rise">
        <h1 className="session-h1">{t("session.paths.title")}</h1>
        <div className="session-why">{t("session.paths.intro")}</div>
      </div>
      {note && <InstrumentNote {...note} />}
      <div className="session-slot" data-band="" ref={slot} aria-hidden="true" />
      {group("theory", t("session.paths.theorySub"), 1)}
      {group("mechanics", t("session.paths.mechanicsSub"), 4)}
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
  const level = chosenLevelOf(progress, path)?.id;
  const slot = useNeckSlot(WHOLE, [], { sweep: true });
  const neck3d = useNeck3d();
  const runnable = isRunnable(path.id);
  const gradableNow = current.exercises.filter(isGradable);
  const doneNow = gradableNow.filter((e) => isExercisePassed(progress, path.id, e)).length;
  const subscribed = isSubscribed(progress, path.id);
  const started = progress.states.some((s) => s.pathId === path.id);
  const [refused, setRefused] = useState(false);
  return (
    <div className="session-page" data-testid="path-detail" data-neck3d={neck3d}>
      <div className="session-rise">
        <button className="session-link" onClick={onBack}>
          {t("session.paths.back")}
        </button>
        <div className="session-row" data-wrap="" style={{ gap: 9 }}>
          <h1 className="session-h1">{path.title}</h1>
          <KindTag kind={path.kind} />
          {!runnable && <PathBadgeTag session={session} path={path} />}
        </div>
        <div className="session-why">{path.goal}</div>
        {!runnable && <div className="session-why">{t(laterWhyKey(path.id))}</div>}
      </div>
      <div className="session-slot" data-band="" ref={slot} aria-hidden="true" />
      <div className="session-pathgrid">
        <ol className="session-step-list">
          {path.steps.map((step, i) => {
            const passed = isStepPassed(progress, path.id, step);
            const skipped = isStepSkipped(progress, path, step);
            const isCurrent = step.id === current.id && runnable;
            const gradable = step.exercises.filter(isGradable);
            const done = gradable.filter((e) => isExercisePassed(progress, path.id, e)).length;
            return (
              <li key={step.id} className="session-rise" style={rise(i)}>
                <button
                  className="session-step-row"
                  data-current={isCurrent ? "" : undefined}
                  data-passed={passed ? "" : undefined}
                  data-skipped={skipped ? "" : undefined}
                  onClick={() => onOpenStep(step)}
                  data-testid={`step-row-${step.id}`}
                >
                  <span className="session-step-num">{passed ? "✓" : step.order}</span>
                  <span className="session-step-text">
                    <span className="session-step-name">{step.title}</span>
                    {skipped && <small data-testid={`step-skipped-${step.id}`}>{t("session.paths.skipped")}</small>}
                    {(isCurrent || passed) && gradable.length > 0 && (
                      <small>
                        {t("session.paths.exercisesPassed", { done, count: gradable.length })}
                      </small>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <div className="session-col">
          {runnable && (
            <div className="session-glass session-card session-rise">
              <div className="session-kick">{t("session.paths.whereYouAre")}</div>
              <div className="session-h2" style={{ margin: "3px 0" }}>
                {t("session.paths.stepOf", { n: current.order, of: path.steps.length })}
              </div>
              <div className="session-why">
                {current.title}
                {gradableNow.length > 0 &&
                  ` · ${t("session.paths.exercisesPassed", { done: doneNow, count: gradableNow.length })}`}
              </div>
            </div>
          )}
          {runnable && (
            <div
              className="session-glass session-card session-rise session-col"
              style={{ gap: 6 }}
              data-testid="path-subscription"
            >
              <div className="session-subscribe">
                {subscribed && (
                  <span className="session-tag" data-met="">
                    {t("session.paths.subscribed")}
                  </span>
                )}
                <button
                  className="session-secondary"
                  data-testid={subscribed ? "path-unsubscribe" : "path-subscribe"}
                  onClick={() => {
                    if (subscribed) {
                      setRefused(false);
                      actions.unsubscribe(path);
                    } else {
                      setRefused(actions.subscribe(path) === "cap");
                    }
                  }}
                >
                  {t(subscribed ? "session.paths.unsubscribe" : "session.paths.subscribe")}
                </button>
              </div>
              <div className="session-why">
                {t("session.paths.subscribeHow", { cap: SUBSCRIPTION_CAP })}
              </div>
              {!subscribed && started && (
                <div className="session-why">{t("session.paths.unsubscribedNote")}</div>
              )}
              {refused && (
                <div className="session-why session-bad" role="alert" data-testid="path-subscribe-cap">
                  {t("session.paths.subscribeCap", { cap: SUBSCRIPTION_CAP })}
                </div>
              )}
            </div>
          )}
          {levels.length > 0 && (
            <div className="session-glass session-card session-rise">
              <div className="session-kick" id="session-level-label">
                {t("session.paths.level")}
              </div>
              <div
                className="session-seg"
                data-small=""
                role="group"
                aria-labelledby="session-level-label"
                style={{ marginTop: 7 }}
              >
                {levels.map((l) => (
                  <button
                    key={l.id}
                    className={l.id === level ? "on" : ""}
                    aria-pressed={l.id === level}
                    onClick={() => actions.chooseLevel(path, l.id)}
                    data-testid={`level-${l.id}`}
                  >
                    {l.title}
                  </button>
                ))}
              </div>
              {level && runnable && (
                <div className="session-why" style={{ marginTop: 7 }} role="status" data-testid="level-start">
                  {t("session.paths.levelStart", {
                    n: current.order,
                    level: t(`session.paths.levelName.${level}`),
                  })}
                </div>
              )}
            </div>
          )}
          <div className="session-glass session-card session-rise">
            <div className="session-kick">{t("session.paths.limits")}</div>
            <div className="session-why" style={{ marginTop: 3 }}>
              {path.gradingLimits}
            </div>
          </div>
          {runnable && (
            <button
              className="session-big session-rise"
              data-size="small"
              onClick={() => onOpenStep(current)}
              data-testid="path-open-current"
            >
              {t("session.paths.openStep", { n: current.order })}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ExerciseRow({
  session,
  path,
  step,
  exercise,
  current,
  style,
}: {
  session: SessionRun;
  path: PathDoc;
  step: Step;
  exercise: Exercise;
  current: boolean;
  style?: CSSProperties;
}) {
  const { t } = useTranslation();
  const { progress, actions } = session;
  const clean = cleanTempoOf(progress, path.id, exercise.id);
  const passed = isExercisePassed(progress, path.id, exercise);
  const played = takesOf(progress, path.id, exercise.id).length;
  const bar = barLine(exercise, exercise.tempo.passAtBpm);
  const gradable = isGradable(exercise);
  const gradingKey = exerciseGradingKey(exercise, isRunnable(path.id));
  const range = tempoRange(exercise);
  return (
    <div
      className="session-exercise session-glass session-rise"
      style={style}
      data-current={current ? "" : undefined}
      data-testid={`exercise-${exercise.id}`}
    >
      <span
        className="session-tick"
        data-state={passed ? undefined : current ? "current" : "wait"}
        aria-hidden="true"
      >
        {passed ? "✓" : ""}
      </span>
      <div className="session-exercise-text">
        <div className="session-plan-title">
          <span>{exercise.title}</span>
          {passed && <span className="session-tag" data-met="">{t("session.paths.passed")}</span>}
        </div>
        <div className="session-why">{exercise.purpose}</div>
        {range && (
          <div className="session-quiet" data-testid={`tempo-${exercise.id}`}>
            {[
              range.subdivision ? t(`session.subdivision.${range.subdivision}`) : null,
              range.to === null
                ? t("session.paths.tempoFrom", { from: range.from })
                : t("session.paths.tempoRange", { from: range.from, to: range.to }),
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
        )}
        {gradable && bar && <div className="session-quiet">{lineText(t, bar)}</div>}
        {gradingKey && <div className="session-quiet">{t(gradingKey)}</div>}
        {played > 0 && (
          <div className="session-quiet">
            <b>
              {clean === null
                ? t("session.paths.playedNoClean", { count: played })
                : t("session.paths.playedClean", { count: played, bpm: clean })}
            </b>
          </div>
        )}
      </div>
      <div className="session-col" style={{ gap: 6, flex: "none" }}>
        {gradable && isRunnable(path.id) && (
          <button
            className={current ? "session-big" : "session-secondary"}
            data-size={current ? "small" : undefined}
            onClick={() => actions.playExercise(path, step, exercise)}
            data-testid={`play-${exercise.id}`}
          >
            {t("session.paths.playThis")}
          </button>
        )}
        {gradable && isRunnable(path.id) && played > 0 && (
          <button
            className="session-secondary"
            onClick={() => actions.findEdge(path, step, exercise)}
            data-testid={`edge-${exercise.id}`}
          >
            {t("session.edge.start")}
          </button>
        )}
      </div>
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
  const skippedBy = isStepSkipped(progress, path, step) ? chosenLevelOf(progress, path) : null;
  // The Exercise to work on next: the first the app can grade and you have not passed.
  const next =
    step.exercises.find((e) => isGradable(e) && !isExercisePassed(progress, path.id, e)) ??
    step.exercises[0];
  const { view, notes } = exerciseNeck(next?.notes, "aim");
  const slot = useNeckSlot(view, notes);
  const neck3d = useNeck3d();
  return (
    <div
      className="session-page"
      data-testid="step-detail"
      data-neck3d={neck3d}
      data-scrim="split"
    >
      <div className="session-rise">
        <button className="session-link" onClick={onBack}>
          {path.title}
        </button>
        <div className="session-kick">
          {t("session.paths.stepOf", { n: step.order, of: path.steps.length })}
        </div>
        <div className="session-row" data-wrap="" style={{ gap: 9 }}>
          <h1 className="session-h1">{step.title}</h1>
          <KindTag kind={path.kind} />
        </div>
        <div className="session-why">{step.goal}</div>
        {skippedBy && (
          <div className="session-quiet" style={{ marginTop: 6 }} data-testid="step-skipped-note">
            <span className="session-tag">{t("session.paths.skipped")}</span>{" "}
            {t("session.paths.skippedHow", { level: t(`session.paths.levelName.${skippedBy.id}`) })}
          </div>
        )}
      </div>
      <div className="session-split">
        <div className="session-col">
          <div className="session-glass session-card session-rise session-col" style={{ gap: 4 }}>
            <div className="session-kick">{t("session.paths.why")}</div>
            <div className="session-why">{step.why}</div>
            <div className="session-kick" style={{ marginTop: 6 }}>{t("session.paths.howTo")}</div>
            {step.howTo.map((line) => (
              <div className="session-why" key={line}>
                {line}
              </div>
            ))}
            <div className="session-kick" style={{ marginTop: 6 }}>{t("session.paths.payoff")}</div>
            <div className="session-why">{step.payoff}</div>
          </div>
          <div className="session-kick session-rise">{t("session.paths.exercises")}</div>
          {step.exercises.map((exercise, i) => (
            <ExerciseRow
              key={exercise.id}
              session={session}
              path={path}
              step={step}
              exercise={exercise}
              current={exercise.id === next?.id && isGradable(exercise)}
              style={rise(i + 2)}
            />
          ))}
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
          {isRunnable(path.id) && step.exercises.some(isGradable) && (
            <div className="session-glass session-card session-rise session-col" style={{ gap: 6 }}>
              <button
                className="session-secondary"
                onClick={() => actions.testOut(path, step)}
                data-testid="step-test-out"
              >
                {t("session.paths.testOut")}
              </button>
              <div className="session-why" data-testid="step-test-out-how">
                {t(testOutRetests(path, step, progress) ? "session.paths.testOutRetests" : "session.paths.testOutHow")}
              </div>
            </div>
          )}
        </div>
        <div className="session-col">
          <div className="session-slot" ref={slot} aria-hidden="true" style={{ minHeight: 240 }} />
          {stepPickDirectionMatters(step) && (
            <div className="session-why" data-testid="pick-caveat">{t("session.run.honest")}</div>
          )}
        </div>
      </div>
    </div>
  );
}

type InstrumentNoteProps = Parameters<typeof InstrumentNote>[0];

export function PathsView({
  session,
  instrumentNote,
  place: given,
}: {
  session: SessionRun;
  /** Guitar first: the same note Today shows, on the list of Paths only. */
  instrumentNote?: InstrumentNoteProps;
  /**
   * Which Path and Step are open, kept by the window so a Session started from
   * here comes back here (`usePathsPlace`). Without one, the screen keeps its
   * own, as it did before, for the tests and scenes that mount it alone.
   */
  place?: PathsPlace;
}) {
  const own = useOwnPlace();
  const place = given ?? own;
  const { at, move, back } = place;
  const path = session.paths.find((p) => p.id === at.pathId) ?? null;
  const step = path?.steps.find((s) => s.id === at.stepId) ?? null;

  // Escape goes one page up: a Step to its Path, a Path to the list. On the
  // window, after everything else has had its turn: whatever is open over the
  // page (a sheet, a menu, the help) claims the key first.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      // Not from a text field: Escape there is the field's. (Not `hotkeys.ts`'s
      // `isTypingTarget`: the hotkey table stays out of the phone's bundle.)
      const el = e.target as HTMLElement | null;
      if (el?.closest?.("input:not([type=range]):not([type=checkbox]):not([type=radio]), textarea, select, [contenteditable=true]")) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      if (back()) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [back]);

  if (path && step) {
    return (
      <StepDetail
        session={session}
        path={path}
        step={step}
        onBack={() => move({ pathId: path.id, stepId: null })}
      />
    );
  }
  if (path) {
    return (
      <PathDetail
        session={session}
        path={path}
        onBack={() => move(PATHS_LIST)}
        onOpenStep={(s) => move({ pathId: path.id, stepId: s.id })}
      />
    );
  }
  return (
    <PathList
      session={session}
      onOpen={(p) => move({ pathId: p.id, stepId: null })}
      note={instrumentNote}
    />
  );
}

/** A place of the screen's own, for a PathsView mounted without the window. */
function useOwnPlace(): PathsPlace {
  const [at, setAt] = useState<PathsAt>(PATHS_LIST);
  const atRef = useRef(at);
  atRef.current = at;
  const move = useCallback((next: PathsAt) => setAt(next), []);
  const back = useCallback(() => {
    const up = pathsUp(atRef.current);
    if (up) setAt(up);
    return up !== null;
  }, []);
  const reset = useCallback(() => setAt(PATHS_LIST), []);
  return { at, move, back, reset };
}
