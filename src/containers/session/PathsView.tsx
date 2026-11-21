/**
 * Paths: which goal, where you are in it, and what a Step asks of you.
 *
 * A list, a Path and a Step, kept in this one view because none of them is a place
 * the rest of the app links to yet. Nothing is locked or priced: a Step can be
 * chosen from any point, and a Path the app cannot grade yet says "later".
 */
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { MIX } from "../../session/focus";
import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import type { Exercise, Level, PathDoc, Step } from "../../paths/format";
import { barLengthTicks } from "../../paths/format";
import { barLine, tempoRange } from "../../session/coachWords";
import { isRunnable, laterWhyKey } from "../../session/packs";
import { stepHonestLineKey } from "../../session/caveats";
import { testOutRetests } from "../../session/planner";
import { PATH_BADGE_KEY, exerciseGradingKey, pathBadge } from "../../session/badges";
import {
  shownCleanTempoOf,
  currentStepOf,
  isExercisePassed,
  isGradable,
  chosenLevelOf,
  levelEntryStep,
  levelOfStep,
  isStepPassed,
  isStepSkipped,
  isSubscribed,
  passesNeeded,
  takesOf,
} from "../../session/progress";
import { SUBSCRIPTION_CAP } from "../../session/rotation";
import { levelsOf } from "../../session/variants";
import type { SessionRun } from "./hooks/useSessionRun";
import { useNeck3d } from "./hooks/useNeck";
import { lineText } from "./lineText";
import { TabStrip } from "./tabstrip/TabStrip";
import { rise } from "./TodayView";
import { InstrumentNote } from "./InstrumentNote";
import { stepLine } from "../../coach/todayLine";
import { CoachLine } from "../coach/CoachLine";
import { askCoach } from "../coach/askStore";
import { IS_MOBILE } from "../../platform";
import { PATHS_LIST, pathsUp } from "../main-window/hooks/usePathsPlace";
import type { PathsAt, PathsPlace } from "../main-window/hooks/usePathsPlace";
import { BuildsOnLine, StartFirstLine, SubscribeOffer } from "./PathPrerequisites";
import { MyExercisesSection } from "./MyExercisesSection";
import { buildsOnPaths, prerequisitesToOffer } from "../../session/prerequisites";
import { START_HERE_PATH_ID, pathTracks, trackOf } from "../../session/tracks";
import type { TrackId } from "../../session/tracks";
import { PathSuggestion } from "../coach/PathSuggestion";
import "../../styles/session.css";

/*
 * No neck on these pages (UX audit TODAY-9: "a decorative empty neck takes a
 * quarter of every page"). A Step's Exercises carry a small tab of their own
 * instead (PATH-6), and the neck is the practice screen's.
 */

/** A Level's own words, without "Beginner:" in front: the control names the Level. */
export function levelSubtitle(level: Pick<Level, "title">): string {
  const at = level.title.search(/[:：]/);
  const rest = at < 0 ? level.title : level.title.slice(at + 1).trim();
  return rest.charAt(0).toLocaleUpperCase() + rest.slice(1);
}

/** Where a Step's ladders run, over its Exercises: lowest first rung to highest pass. */
export function stepTempoRange(step: Step): { from: number; to: number | null } | null {
  const ranges = step.exercises.map(tempoRange).filter((r) => r !== null);
  if (ranges.length === 0) return null;
  const from = Math.min(...ranges.map((r) => r.from));
  const tops = ranges.map((r) => r.to).filter((v): v is number => v !== null);
  const to = tops.length ? Math.max(...tops) : null;
  return { from, to: to !== null && to > from ? to : null };
}

/** The Path's category as a tag: "Foundations", "Harmony", "Technique", "Styles". */
function TrackTag({ path }: { path: PathDoc }) {
  const { t } = useTranslation();
  return (
    <span className="session-tag" data-kind={path.kind} data-testid="path-track-tag">
      {t(`session.category.${trackOf(path)}`)}
    </span>
  );
}

/** One pip per Step: passed, the one you are on, the rest. */
function StepPips({ session, path }: { session: SessionRun; path: PathDoc }) {
  const current = currentStepOf(session.progress, path);
  // Not started: no pip lit, so the bar agrees with "Not started yet" under it.
  const started = session.progress.states.some((s) => s.pathId === path.id);
  return (
    <span className="session-pips" aria-hidden="true">
      {path.steps.map((step) => (
        <i
          key={step.id}
          data-state={
            isStepPassed(session.progress, path.id, step)
              ? "done"
              : started && step.id === current.id
                ? "on"
                : undefined
          }
        />
      ))}
    </span>
  );
}

/** Subscribed, Coming soon, or nothing (`session/badges.ts`). Never the pack's review status. */
/**
 * "In my daily mix" on a subscribed Path (owner, 2026-11-18): subscribing and
 * being in the everyday plan are separate. Off, Today's mix leaves the Path
 * out; its progress stays and it can still be chosen for a day (`focus.ts`).
 */
export function MixSwitch({ session, path }: { session: SessionRun; path: PathDoc }) {
  const { t } = useTranslation();
  const setInMix = session.setInMix;
  if (typeof setInMix !== "function") return null;
  const on = !(session.offMix ?? []).includes(path.id);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className="session-mixswitch"
      data-on={on ? "" : undefined}
      onClick={(e) => {
        e.stopPropagation();
        setInMix(path.id, !on);
      }}
      data-testid={`path-mix-${path.id}`}
    >
      <span className="session-mixswitch-track" aria-hidden="true">
        <span className="session-mixswitch-thumb" />
      </span>
      <span className="session-mixswitch-label">{t("session.paths.inMix")}</span>
    </button>
  );
}

/**
 * "Practise only this today" on a card. A toggle: once this Path is today's
 * focus the card says so ("Only this today", pressed), and pressing it again
 * goes back to the daily mix without leaving the page. It used to read the
 * same before and after, so nothing on Paths said which Path today was on.
 */
function FocusToday({
  session,
  path,
  onFocusToday,
}: {
  session: SessionRun;
  path: PathDoc;
  onFocusToday: (path: PathDoc) => void;
}) {
  const { t } = useTranslation();
  const on = session.todayFocus === path.id;
  return (
    <button
      type="button"
      className="session-link session-path-focus"
      aria-pressed={on}
      onClick={(e) => {
        e.stopPropagation();
        if (on) session.setTodayFocus(MIX);
        else onFocusToday(path);
      }}
      data-testid={`path-focus-${path.id}`}
    >
      {on && (
        <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
          <path d="M2 6.4 L4.8 9 L10 3.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {t(on ? "session.paths.focusedToday" : "session.paths.focusToday")}
    </button>
  );
}

/** Whether this Path is one Today plans from: subscribed and runnable. */
function isMine(session: SessionRun, path: PathDoc): boolean {
  return (session.myPaths ?? []).some((p) => p.id === path.id);
}

function PathBadgeTag({ session, path }: { session: SessionRun; path: PathDoc }) {
  const { t } = useTranslation();
  const badge = pathBadge(path.id, session.progress);
  if (!badge) return null;
  return (
    <span className="session-tag" data-badge={badge}>
      {t(PATH_BADGE_KEY[badge])}
    </span>
  );
}

/** A track's name and its one line on the Paths screen (`session/tracks.ts`). */
const TRACK_LINE_KEY: Readonly<Record<TrackId, string>> = {
  foundations: "session.paths.tracks.foundationsLine",
  harmony: "session.paths.tracks.harmonyLine",
  technique: "session.paths.mechanicsSub",
  style: "session.paths.theorySub",
};

/** One Path on the list: what it is for, what it builds on, where you are in it. */
function PathCard({
  session,
  path,
  style,
  tour,
  onOpen,
  onOpenStep,
  onFocusToday,
}: {
  session: SessionRun;
  path: PathDoc;
  style?: CSSProperties;
  tour?: boolean;
  onOpen: (path: PathDoc) => void;
  onOpenStep?: (path: PathDoc, step: Step) => void;
  onFocusToday?: (path: PathDoc) => void;
}) {
  const { t } = useTranslation();
  const { progress } = session;
  const current = currentStepOf(progress, path);
  // Real progress, not "Step 1 of N" on every card (UX audit PATH-4).
  const started = progress.states.some((s) => s.pathId === path.id);
  const stepsDone = path.steps.filter((s) => isStepPassed(progress, path.id, s)).length;
  const subscribed = isSubscribed(progress, path.id);
  const startHere = path.id === START_HERE_PATH_ID;
  return (
    // The card opens the Path: a click anywhere on it, or its title, which is
    // the button a keyboard reaches. Continue, on a Path you follow, goes
    // straight to the Step you are on (acceptance P2-9). The "Builds on"
    // names open their own Paths. Buttons side by side, never one inside
    // another.
    <div
      className="session-path-card session-glass session-rise"
      style={style}
      onClick={() => onOpen(path)}
      data-testid={`path-card-${path.id}`}
      data-start-here={startHere ? "" : undefined}
      data-started={started ? "" : undefined}
      // The tour's Paths stop: the page's promise and one goal under it.
      data-tour={tour ? "paths" : undefined}
    >
      <span className="session-col session-path-card-main">
        <span className="session-row" data-wrap="">
          <button type="button" className="session-path-open" data-testid={`path-open-${path.id}`}>
            <span className="session-h2">{path.title}</span>
          </button>
          {startHere && (
            <span className="session-tag" data-start-here="" data-testid="path-start-here">
              {t("session.paths.startHere")}
            </span>
          )}
          <PathBadgeTag session={session} path={path} />
        </span>
        <span className="session-why session-path-goal">{path.goal}</span>
        {/* "11 steps · Builds on: Rhythm Foundations (Beginner)": one quiet line. */}
        <span className="session-quiet session-path-meta">
          {t("session.paths.stepCount", { count: path.steps.length })}
          {buildsOnPaths(session.paths, path).length > 0 && (
            <>
              {" · "}
              <BuildsOnLine session={session} path={path} onOpenPath={onOpen} where="card" />
            </>
          )}
        </span>
      </span>
      <span className="session-col session-path-card-side">
        <StepPips session={session} path={path} />
        <span className="session-why" data-testid={`path-card-progress-${path.id}`}>
          {started ? (
            <>
              <b>{t("session.paths.onStep", { n: current.order, title: current.title })}</b>
              {stepsDone > 0 && <> · {t("session.paths.stepsDone", { done: stepsDone, of: path.steps.length })}</>}
            </>
          ) : (
            t("session.paths.notStarted")
          )}
        </span>
        {started && subscribed && onOpenStep && (
          <button
            className="session-secondary session-path-continue"
            onClick={(e) => {
              e.stopPropagation();
              onOpenStep(path, current);
            }}
            data-testid={`path-continue-${path.id}`}
          >
            {t("session.paths.continue", { n: current.order })}
          </button>
        )}
        {isMine(session, path) && (
          <span className="session-path-today" data-testid={`path-today-${path.id}`}>
            <MixSwitch session={session} path={path} />
            {onFocusToday && (session.myPaths.length > 1 || (session.offMix ?? []).includes(path.id)) && (
              <FocusToday session={session} path={path} onFocusToday={onFocusToday} />
            )}
          </span>
        )}
      </span>
    </div>
  );
}

/**
 * The Paths, by the curriculum map's tracks (plans/paths/NEW_PATHS.md): the
 * start, then Technique, Styles and How harmony works, each with one line. No
 * badge and no lock for a Path whose prerequisites are not reached: its card
 * says what it builds on, and that is all.
 */
function PathList({
  session,
  onOpen,
  onOpenStep,
  onFocusToday,
  note,
}: {
  session: SessionRun;
  onOpen: (path: PathDoc) => void;
  /** "Practise only this today": Today's focus on this Path, then Today. */
  onFocusToday?: (path: PathDoc) => void;
  /** Continue on a card: straight to the Step the player is on. */
  onOpenStep?: (path: PathDoc, step: Step) => void;
  note?: InstrumentNoteProps;
}) {
  const { t } = useTranslation();
  const { paths } = session;
  const neck3d = useNeck3d();
  const tracks = useMemo(() => pathTracks(paths), [paths]);
  return (
    <div className="session-page" data-testid="paths" data-neck3d={neck3d}>
      <div className="session-rise" data-tour="paths">
        <h1 className="session-h1">{t("session.paths.title")}</h1>
        <div className="session-why">{t("session.paths.intro")}</div>
      </div>
      {note && <InstrumentNote {...note} />}
      {tracks.map((track, i) => {
        const runnable = track.paths.filter((p) => isRunnable(p.id));
        const later = track.paths.filter((p) => !isRunnable(p.id));
        return (
          <section
            className="session-pathgroup"
            key={track.id}
            data-track={track.id}
            data-testid={`path-track-${track.id}`}
            aria-labelledby={`path-track-${track.id}-name`}
          >
            <div className="session-pathgroup-head session-rise" style={rise(i + 1)}>
              <h2 className="session-pathgroup-name" id={`path-track-${track.id}-name`}>
                {t(`session.paths.tracks.${track.id}`)}
              </h2>
              <span className="session-why">{t(TRACK_LINE_KEY[track.id])}</span>
            </div>
            <div className="session-pathgroup-cards" data-count={runnable.length}>
              {runnable.map((path, n) => (
                <PathCard
                  key={path.id}
                  session={session}
                  path={path}
                  style={rise(Math.min(i + 1 + n, 12))}
                  tour={i === 0 && n === 0}
                  onOpen={onOpen}
                  onOpenStep={onOpenStep}
                  onFocusToday={onFocusToday}
                />
              ))}
            </div>
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
          </section>
        );
      })}
      <MyExercisesSection session={session} style={rise(Math.min(tracks.length + 1, 12))} />
      {/* The coach's Path suggestion, last on the page (c4b3, DESIGN 6.4). */}
      <PathSuggestion session={session} onOpen={onOpen} />
    </div>
  );
}

/** One Step in a Path's list: where you stand on it, how much is in it, how fast it runs. */
function StepRow({
  session,
  path,
  step,
  current,
  onOpen,
  style,
}: {
  session: SessionRun;
  path: PathDoc;
  step: Step;
  current: boolean;
  onOpen: () => void;
  style?: CSSProperties;
}) {
  const { t } = useTranslation();
  const { progress } = session;
  const passed = isStepPassed(progress, path.id, step);
  const skipped = isStepSkipped(progress, path, step);
  // Followed or played: until then the row is where the Path starts, not where the player is.
  const started = progress.states.some((s) => s.pathId === path.id);
  const gradable = step.exercises.filter(isGradable);
  const done = gradable.filter((e) => isExercisePassed(progress, path.id, e)).length;
  const range = stepTempoRange(step);
  // Done, here, skipped, or ahead: ahead is never locked, only not yet.
  const state = passed ? "done" : current ? "current" : skipped ? "skipped" : "ahead";
  return (
    <li className="session-rise" style={style}>
      <button
        className="session-step-row"
        data-state={state}
        data-current={current ? "" : undefined}
        data-passed={passed ? "" : undefined}
        data-skipped={skipped ? "" : undefined}
        onClick={onOpen}
        data-testid={`step-row-${step.id}`}
      >
        <span className="session-step-num">
          {passed ? "✓" : step.order}
        </span>
        <span className="session-step-text">
          <span className="session-step-name">{step.title}</span>
          <small className="session-step-meta">
            {t("session.paths.exerciseCount", { count: step.exercises.length })}
            {range && (
              <>
                {" · "}
                {range.to === null
                  ? t("session.paths.tempoFrom", { from: range.from })
                  : t("session.paths.tempoRange", { from: range.from, to: range.to })}
              </>
            )}
          </small>
        </span>
        <span className="session-step-state">
          {state === "done" && <span className="session-tag" data-met="">{t("session.paths.stateDone")}</span>}
          {state === "current" && (
            <span className="session-step-here">
              {t(started ? "session.paths.stateHere" : "session.paths.startHere")}
              {started && gradable.length > 0 && (
                <small>{t("session.paths.passedOf", { done, count: gradable.length })}</small>
              )}
            </span>
          )}
          {state === "skipped" && (
            <span className="session-tag" data-testid={`step-skipped-${step.id}`}>
              {t("session.paths.skipped")}
            </span>
          )}
          <span className="session-step-chev" aria-hidden="true">›</span>
        </span>
      </button>
    </li>
  );
}

/**
 * How a row of buttons fits its card (acceptance P1-7: "Advanced" wrapped onto
 * a row of its own in Aurora and in Russian): on one line as it is; on one line
 * with smaller type and padding ("tight"); or, where even that does not fit,
 * stacked, one button a row, never one left alone on a second row. Measured in
 * the one-line layouts every time the card's width changes, so a theme's wider
 * font or a longer word is what decides.
 */
type RowFit = "fits" | "tight" | "stacked";
function useRowFit(card: React.RefObject<HTMLElement | null>, row: React.RefObject<HTMLElement | null>): RowFit {
  const [fit, setFit] = useState<RowFit>("fits");
  useLayoutEffect(() => {
    const box = card.current;
    const el = row.current;
    if (!box || !el || typeof ResizeObserver === "undefined") return;
    const over = () => el.scrollWidth > el.clientWidth + 1;
    const measure = () => {
      const was = el.dataset.fit;
      el.dataset.fit = "fits";
      let next: RowFit = "fits";
      if (over()) {
        el.dataset.fit = "tight";
        next = over() ? "stacked" : "tight";
      }
      if (was === undefined) delete el.dataset.fit;
      else el.dataset.fit = was;
      setFit(next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    void document.fonts?.ready.then(measure);
    return () => observer.disconnect();
  }, [card, row]);
  return fit;
}

/**
 * The Level picker: a segmented control, a default (the first Level, until one
 * is chosen), and under it who the chosen one is for and where it starts
 * (UX audit PATH-2). Choosing one moves the start Step; it says so.
 */
function LevelPicker({ session, path, runnable }: { session: SessionRun; path: PathDoc; runnable: boolean }) {
  const { t } = useTranslation();
  const { progress, actions } = session;
  const [joined, setJoined] = useState(false);
  const [capped, setCapped] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const segRef = useRef<HTMLDivElement>(null);
  const fit = useRowFit(cardRef, segRef);
  const levels = levelsOf(path);
  const chosen = chosenLevelOf(progress, path);
  // No Level chosen plays as the first one: show it as chosen (UX audit TODAY-1).
  const shown = chosen ?? levels[0] ?? null;
  if (!shown) return null;
  const entry = levelEntryStep(progress, path, shown);
  const current = currentStepOf(progress, path);
  // Choosing a Level on a Path you do not follow starts it: say so, and keep
  // to the cap as Subscribe does (acceptance P2-10).
  const following = progress.states.filter((s) => isSubscribed(progress, s.pathId)).length;
  const subscribed = isSubscribed(progress, path.id);
  const choose = (levelId: string) => {
    const fresh = !progress.states.some((s) => s.pathId === path.id);
    if (fresh && runnable && following >= SUBSCRIPTION_CAP) {
      setCapped(true);
      return;
    }
    setCapped(false);
    setJoined(fresh && runnable);
    actions.chooseLevel(path, levelId);
  };
  return (
    <div className="session-glass session-card session-rise session-level" data-testid="path-level" ref={cardRef}>
      <div className="session-kick" id="session-level-label">
        {t("session.paths.level")}
      </div>
      <div
        className="session-seg session-level-seg"
        role="group"
        aria-labelledby="session-level-label"
        ref={segRef}
        data-fit={fit}
      >
        {levels.map((l) => (
          <button
            key={l.id}
            className={l.id === shown.id ? "on" : ""}
            aria-pressed={l.id === shown.id}
            onClick={() => choose(l.id)}
            data-testid={`level-${l.id}`}
          >
            {t(`session.paths.levelName.${l.id}`)}
          </button>
        ))}
      </div>
      <div className="session-level-about">
        <div className="session-level-title">{levelSubtitle(shown)}</div>
        {chosen && runnable ? (
          <div className="session-level-start" role="status" data-testid="level-start">
            {joined && subscribed
              ? t("session.paths.levelSubscribed", { n: current.order })
              : t("session.paths.levelStart", {
                  n: current.order,
                  level: t(`session.paths.levelName.${chosen.id}`),
                })}
          </div>
        ) : (
          <div className="session-quiet" data-testid="level-default">
            {t("session.paths.levelStartsAt", { n: entry.order, title: entry.title })}
          </div>
        )}
      </div>
      {capped && (
        <div className="session-why session-bad" role="alert" data-testid="level-subscribe-cap">
          {t("session.paths.subscribeCap", { cap: SUBSCRIPTION_CAP })}
        </div>
      )}
      {shown.placement.startHereIf.length > 0 && (
        <div className="session-level-who" data-testid="level-start-here-if">
          <div className="session-kick">{t("session.paths.startHereIf")}</div>
          <ul>
            {shown.placement.startHereIf.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** What grading can be trusted with: one plain line, the Path's own account behind "Why?" (PATH-3). */
function LimitsLine({ path }: { path: PathDoc }) {
  const { t } = useTranslation();
  return (
    <details className="session-limits session-rise" data-testid="path-limits">
      <summary>
        <span>{t("session.paths.limitsLine")}</span> <span className="session-limits-why">{t("session.paths.limitsWhy")}</span>
      </summary>
      <div className="session-glass session-card">
        <div className="session-kick">{t("session.paths.limits")}</div>
        <div className="session-why" style={{ marginTop: 4 }}>
          {path.gradingLimits}
        </div>
      </div>
    </details>
  );
}

function PathDetail({
  session,
  path,
  onBack,
  onOpenStep,
  onOpenPath,
}: {
  session: SessionRun;
  path: PathDoc;
  onBack: () => void;
  onOpenStep: (step: Step) => void;
  /** A "Builds on" name or "Start with X first": that Path's page. */
  onOpenPath: (path: PathDoc) => void;
}) {
  const { t } = useTranslation();
  const { progress, actions } = session;
  const current = currentStepOf(progress, path);
  const neck3d = useNeck3d();
  const runnable = isRunnable(path.id);
  const gradableNow = current.exercises.filter(isGradable);
  const doneNow = gradableNow.filter((e) => isExercisePassed(progress, path.id, e)).length;
  const subscribed = isSubscribed(progress, path.id);
  const started = progress.states.some((s) => s.pathId === path.id);
  const [refused, setRefused] = useState(false);
  // What Subscribe offered to add as well (its prerequisites not started).
  const [offer, setOffer] = useState<PathDoc[]>([]);
  return (
    <div className="session-page" data-testid="path-detail" data-neck3d={neck3d}>
      <div className="session-rise">
        <button className="session-back" onClick={onBack} data-testid="paths-back">
          <span aria-hidden="true">‹</span> {t("session.paths.back")}
        </button>
        <div className="session-row" data-wrap="" style={{ gap: 9 }}>
          <h1 className="session-h1">{path.title}</h1>
          <TrackTag path={path} />
          {!runnable && <PathBadgeTag session={session} path={path} />}
        </div>
        <div className="session-why session-lede">{path.goal}</div>
        <BuildsOnLine session={session} path={path} onOpenPath={onOpenPath} where="page" />
        {!runnable && <div className="session-why">{t(laterWhyKey(path.id))}</div>}
      </div>
      <div className="session-pathgrid">
        {/* First in the markup: on a phone, Continue is the first thing under
            the title, not two screens down (UX audit PHONE-3). */}
        <aside className="session-col session-path-side">
          {runnable && (
            <div className="session-glass session-card session-rise session-where" data-testid="path-where">
              {/* A Path not started yet is not somewhere the player "is" (15
                  Paths, 14 of them new to anyone): where it starts, and Start. */}
              <div className="session-kick">{t(started ? "session.paths.whereYouAre" : "session.paths.whereYouStart")}</div>
              <div className="session-where-title">{current.title}</div>
              <div className="session-quiet">
                {t("session.paths.stepOf", { n: current.order, of: path.steps.length })}
                {started &&
                  gradableNow.length > 0 &&
                  ` · ${t("session.paths.exercisesPassed", { done: doneNow, count: gradableNow.length })}`}
              </div>
              <StartFirstLine session={session} path={path} onOpenPath={onOpenPath} />
              <button
                className="session-big"
                data-size="mid"
                onClick={() => onOpenStep(current)}
                data-testid="path-open-current"
              >
                {t(started ? "session.paths.continue" : "session.paths.startStep", { n: current.order })}
              </button>
            </div>
          )}
          {levelsOf(path).length > 0 && <LevelPicker session={session} path={path} runnable={runnable} />}
          {runnable && (
            <div
              className="session-glass session-card session-rise session-col"
              style={{ gap: 6 }}
              data-testid="path-subscription"
            >
              <div className="session-subscribe">
                {subscribed && (
                  <span className="session-tag" data-badge="subscribed">
                    {t("session.paths.subscribed")}
                  </span>
                )}
                <button
                  className="session-secondary"
                  data-testid={subscribed ? "path-unsubscribe" : "path-subscribe"}
                  onClick={() => {
                    if (subscribed) {
                      setRefused(false);
                      setOffer([]);
                      actions.unsubscribe(path);
                    } else {
                      // Read before the subscribe: what it builds on that the
                      // player has not started. Offered, never required.
                      const before = prerequisitesToOffer(progress, session.paths, path).filter((p) => isRunnable(p.id));
                      const capped = actions.subscribe(path) === "cap";
                      setRefused(capped);
                      setOffer(capped ? [] : before);
                    }
                  }}
                >
                  {t(subscribed ? "session.paths.unsubscribe" : "session.paths.subscribe")}
                </button>
              </div>
              <div className="session-quiet">
                {t("session.paths.subscribeHow", { cap: SUBSCRIPTION_CAP })}
              </div>
              {isMine(session, path) && typeof session.setInMix === "function" && (
                <div className="session-col session-path-mix" style={{ gap: 4 }}>
                  <MixSwitch session={session} path={path} />
                  <div className="session-quiet">{t("session.paths.inMixHelp")}</div>
                </div>
              )}
              {!subscribed && started && (
                <div className="session-quiet">{t("session.paths.unsubscribedNote")}</div>
              )}
              {refused && (
                <div className="session-why session-bad" role="alert" data-testid="path-subscribe-cap">
                  {t("session.paths.subscribeCap", { cap: SUBSCRIPTION_CAP })}
                </div>
              )}
              <SubscribeOffer session={session} offer={offer} onClose={() => setOffer([])} />
            </div>
          )}
          <LimitsLine path={path} />
        </aside>
        <ol className="session-step-list" role="list">
          {path.steps.map((step, i) => {
            const level = levelOfStep(path, step.id);
            const firstOfLevel = level !== null && level.stepIds[0] === step.id;
            return (
              <Fragment key={step.id}>
                {firstOfLevel && (
                  <li className="session-level-divider">
                    <span className="session-kick">{t(`session.paths.levelName.${level.id}`)}</span>
                    <span className="session-quiet">{levelSubtitle(level)}</span>
                  </li>
                )}
                <StepRow
                  session={session}
                  path={path}
                  step={step}
                  current={step.id === current.id && runnable}
                  onOpen={() => onOpenStep(step)}
                  style={rise(Math.min(i, 12))}
                />
              </Fragment>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

/** The first bars of an Exercise as tab: what "Play this" will ask, at a glance (PATH-6). */
function TabPreview({ exercise }: { exercise: Exercise }) {
  const { t } = useTranslation();
  const barTicks = barLengthTicks(exercise.meter);
  // One bar: the shape of it at a glance, at a size that leaves the words first.
  const bars = 1;
  const notes = useMemo(
    () =>
      exercise.notes
        .filter((n) => n.tick < bars * barTicks && n.string >= 1 && n.string <= 6)
        .map((n) => ({ string: n.string, fret: n.fret, tick: n.tick, dur: n.dur, tech: n.tech, bend: n.bend })),
    [exercise.notes, bars, barTicks],
  );
  if (notes.length === 0) return null;
  return (
    <div className="session-tabpreview" aria-hidden="true" title={t("session.paths.tabPreview")}>
      <TabStrip
        notes={notes}
        barTicks={barTicks}
        patternBars={bars}
        position={-barTicks}
        playing={false}
        mode="preview"
        maxFretPx={14}
      />
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
  const clean = shownCleanTempoOf(progress, path.id, exercise.id);
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
        <div className="session-why session-exercise-purpose" title={exercise.purpose}>
          {exercise.purpose}
        </div>
        {range && (
          <div className="session-quiet session-exercise-tempo" data-testid={`tempo-${exercise.id}`}>
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
      <TabPreview exercise={exercise} />
      {gradable && isRunnable(path.id) && (
        <div className="session-exercise-actions">
          <button
            className={current ? "session-big" : "session-secondary"}
            data-size={current ? "small" : undefined}
            onClick={() => actions.playExercise(path, step, exercise)}
            data-testid={`play-${exercise.id}`}
          >
            {t("session.paths.playThis")}
          </button>
          {played > 0 && (
            <button
              className="session-secondary"
              onClick={() => actions.findEdge(path, step, exercise)}
              data-testid={`edge-${exercise.id}`}
            >
              {t("session.edge.start")}
            </button>
          )}
        </div>
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
  const skippedBy = isStepSkipped(progress, path, step) ? chosenLevelOf(progress, path) : null;
  // The Exercise to work on next: the first the app can grade and you have not passed.
  const next =
    step.exercises.find((e) => isGradable(e) && !isExercisePassed(progress, path.id, e)) ??
    step.exercises[0];
  const neck3d = useNeck3d();
  const level = levelOfStep(path, step.id);
  const gradable = step.exercises.filter(isGradable);
  const runnable = isRunnable(path.id);
  const honest = stepHonestLineKey(step);
  const grading = session.grading ?? "ask";
  const coachLineOfStep = useMemo(
    () =>
      stepLine({
        progress,
        paths: session.paths,
        pathId: path.id,
        exerciseIds: step.exercises.map((e) => e.id),
        now: Date.now(),
        grading,
      }),
    [progress, session.paths, path.id, step, grading],
  );
  const coachSaid = coachLineOfStep ? t(coachLineOfStep.key, coachLineOfStep.values) : null;
  return (
    <div className="session-page" data-testid="step-detail" data-neck3d={neck3d}>
      <div className="session-rise">
        <button className="session-back" onClick={onBack} data-testid="paths-back">
          <span aria-hidden="true">‹</span> {path.title}
        </button>
        <div className="session-kick">
          {t("session.paths.stepOf", { n: step.order, of: path.steps.length })}
          {level && ` · ${t(`session.paths.levelName.${level.id}`)}`}
        </div>
        <div className="session-row" data-wrap="" style={{ gap: 9 }}>
          <h1 className="session-h1">{step.title}</h1>
          <TrackTag path={path} />
        </div>
        <div className="session-why session-lede">{step.goal}</div>
        {skippedBy && (
          <div className="session-quiet" style={{ marginTop: 6 }} data-testid="step-skipped-note">
            <span className="session-tag">{t("session.paths.skipped")}</span>{" "}
            {t("session.paths.skippedHow", { level: t(`session.paths.levelName.${skippedBy.id}`) })}
          </div>
        )}
        {coachSaid && (
          // Only something measured the page does not show (DESIGN 3.1): where
          // the last Session's Take on this Step slipped. Absent otherwise.
          <div className="session-step-line" data-testid="step-line">
            <CoachLine testId="step-coach-line" onAsk={IS_MOBILE ? undefined : askCoach}>
              {coachSaid}
            </CoachLine>
          </div>
        )}
      </div>
      <div className="session-stepgrid">
        <div className="session-col session-step-main">
          <div className="session-row session-rise" data-wrap="" data-between="">
            <div className="session-kick">{t("session.paths.exercises")}</div>
            {runnable && gradable.length > 0 && (
              <div className="session-quiet">
                {t("session.paths.finishHow", { need: passesNeeded(gradable.length), count: gradable.length })}
              </div>
            )}
          </div>
          {step.exercises.map((exercise, i) => (
            <ExerciseRow
              key={exercise.id}
              session={session}
              path={path}
              step={step}
              exercise={exercise}
              current={exercise.id === next?.id && isGradable(exercise)}
              style={rise(i + 1)}
            />
          ))}
          {/* The reading, behind one click: why the Step, how, what you'll hear. */}
          <details className="session-notes session-glass session-rise" data-testid="step-notes">
            <summary>
              <span className="session-kick">{t("session.paths.techniqueNotes")}</span>
              <span className="session-quiet">{t("session.paths.techniqueNotesHint")}</span>
            </summary>
            <div className="session-notes-body">
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
            </div>
          </details>
        </div>
        <aside className="session-col session-step-side">
          {runnable && (
            <div className="session-glass session-card session-rise session-col" style={{ gap: 8 }}>
              {isCurrent ? (
                <div className="session-why">
                  <b>{t("session.paths.yourStep")}</b>
                </div>
              ) : (
                <button
                  className="session-secondary"
                  onClick={() => actions.chooseStep(path, step)}
                  data-testid="choose-step"
                >
                  {t("session.paths.workOnThis")}
                </button>
              )}
              {gradable.length > 0 && (
                <>
                  <button
                    className="session-secondary"
                    onClick={() => actions.testOut(path, step)}
                    data-testid="step-test-out"
                  >
                    {t("session.paths.testOut")}
                  </button>
                  <div className="session-quiet" data-testid="step-test-out-how">
                    {testOutRetests(path, step, progress)
                      ? t("session.paths.testOutRetests")
                      : t("session.paths.testOutHow", {
                          // The real count, not "about three of four" (UX audit PATH-5).
                          need: passesNeeded(gradable.length),
                          count: gradable.length,
                        })}
                  </div>
                </>
              )}
            </div>
          )}
          {honest && (
            <div className="session-quiet session-rise" data-testid="pick-caveat">
              {t(honest)}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

type InstrumentNoteProps = Parameters<typeof InstrumentNote>[0];

export function PathsView({
  session,
  instrumentNote,
  place: given,
  onFocusToday,
}: {
  session: SessionRun;
  /** "Practise only this today" on a card: the window sets the focus and opens Today. */
  onFocusToday?: (path: PathDoc) => void;
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

  // Back goes one page up: a Step to its Path, a Path to the list (UX audit
  // NAV-4). Escape, Alt+Left and the mouse's back button, as anywhere else on
  // a computer. On the window, after everything else has had its turn:
  // whatever is open over the page (a sheet, a menu, the help) claims the key
  // first.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const isBack = (e.key === "Escape" && !e.altKey) || (e.key === "ArrowLeft" && e.altKey);
      if (!isBack) return;
      // Not from a text field: Escape there is the field's. (Not `hotkeys.ts`'s
      // `isTypingTarget`: the hotkey table stays out of the phone's bundle.)
      const el = e.target as HTMLElement | null;
      if (el?.closest?.("input:not([type=range]):not([type=checkbox]):not([type=radio]), textarea, select, [contenteditable=true]")) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      if (back()) e.preventDefault();
    };
    // The mouse's back button is button 3. Taken on `mouseup`, the event the
    // webview would otherwise turn into a history step.
    const onMouse = (e: MouseEvent) => {
      if (e.button !== 3 || e.defaultPrevented) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      e.preventDefault();
      back();
    };
    const swallow = (e: MouseEvent) => {
      if (e.button === 3) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mouseup", onMouse);
    window.addEventListener("mousedown", swallow);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mouseup", onMouse);
      window.removeEventListener("mousedown", swallow);
    };
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
        // Its own state per Path: a "Builds on" link opens another Path here.
        key={path.id}
        session={session}
        path={path}
        onBack={() => move(PATHS_LIST)}
        onOpenStep={(s) => move({ pathId: path.id, stepId: s.id })}
        onOpenPath={(p) => move({ pathId: p.id, stepId: null })}
      />
    );
  }
  return (
    <PathList
      session={session}
      onOpen={(p) => move({ pathId: p.id, stepId: null })}
      onOpenStep={(p, s) => move({ pathId: p.id, stepId: s.id })}
      onFocusToday={onFocusToday}
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
