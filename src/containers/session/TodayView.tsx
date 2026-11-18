/**
 * Today: the front door. The Session is already built, every line says why it is
 * there, and one press starts it. Choosing minutes rebuilds it.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { PLAN_MINUTES } from "../../session/planner";
import type { PlanStep } from "../../session/planner";
import { leftOffLine, reasonLine } from "../../session/coachWords";
import { factsOf } from "../../session/progress";
import { FIRST_PATH_ID } from "../../session/packs";
import type { PathDoc } from "../../paths/format";
import type { SessionRun } from "./hooks/useSessionRun";
import { lineText } from "./lineText";
import { bpmLine, pathTitleOf, roleKey, roleOf, rowKind, shortContext, shortReason, ticksOf } from "./todayPlan";
import { InstrumentNote } from "./InstrumentNote";
import { useNeck3d } from "./hooks/useNeck";
import "../../styles/session.css";

/** The staggered entrance the mocks give each block. */
export function rise(i: number): CSSProperties {
  return { "--i": i } as CSSProperties;
}

/**
 * The step's role in plain words ("Find your level", "Review"). The Path's kind
 * is the colour only (`data-kind`), never the text: the tag used to take its
 * colour from the kind and its words from the role, so MECHANICS and PLACEMENT
 * stood in one place meaning two things (panel review, 2026-11-17).
 */
export function StepTag({ step, paths }: { step: PlanStep; paths: readonly PathDoc[] }) {
  const { t } = useTranslation();
  return (
    <span className="session-tag session-role" data-kind={rowKind(step, paths)} data-role={roleOf(step)}>
      {t(roleKey(step))}
    </span>
  );
}

/** Whose turn it is, above why this tempo. Only an Exercise step has one. */
export function ContextLine({ step }: { step: PlanStep | null }) {
  const { t } = useTranslation();
  if (!step || step.kind !== "exercise" || !step.context) return null;
  return (
    <div className="session-why session-context" data-code={step.context.code}>
      <b>{lineText(t, reasonLine(step.context))}</b>
    </div>
  );
}

/** A jam step has no title of its own; a warm-up names its Exercise. */
export function stepTitle(step: PlanStep, t: (key: string) => string): string {
  if (step.kind === "jam") return step.title ? `${t("session.step.jam")} · ${step.title}` : t("session.step.jam");
  if (step.kind === "drill") return t("session.step.drill");
  if (step.kind === "exercise" && step.role === "edge") return `${t("session.edge.kick")} · ${step.title}`;
  return step.title;
}

/**
 * The plan's last row in sight or not: "More below" shows while it is not, so
 * a list longer than its panel or the window says so (1024x700, 1280x560 with
 * twenty minutes). The observer's root is the viewport, which also counts the
 * list's own scroll clipping.
 */
function useEndInView(): [(el: HTMLElement | null) => void, boolean] {
  const [inView, setInView] = useState(true);
  const observer = useRef<IntersectionObserver | null>(null);
  const ref = useCallback((el: HTMLElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!el || typeof IntersectionObserver === "undefined") return;
    observer.current = new IntersectionObserver(([entry]) => setInView(entry.intersectionRatio > 0.9), {
      threshold: [0, 0.9, 1],
    });
    observer.current.observe(el);
  }, []);
  useEffect(() => () => observer.current?.disconnect(), []);
  return [ref, inView];
}

/** One row of the plan: dot, name, role and Path, reason, then minutes and tempo. */
function PlanRow({
  step,
  index,
  earlier,
  paths,
  showPath,
  rowRef,
}: {
  step: PlanStep;
  index: number;
  earlier: readonly PlanStep[];
  paths: readonly PathDoc[];
  /** Name the Path on the meta line: only when more than one is active (UX audit TODAY-6). */
  showPath: boolean;
  rowRef?: (el: HTMLElement | null) => void;
}) {
  const { t } = useTranslation();
  const pathTitle = showPath ? pathTitleOf(step, paths) : null;
  const bpm = bpmLine(step);
  const context = step.kind === "exercise" && step.context ? shortContext(step.context) : null;
  return (
    <li
      ref={rowRef}
      className="session-plan-item session-plan-swap"
      style={rise(index)}
      data-kind={rowKind(step, paths)}
      data-role={roleOf(step)}
      data-first={index === 0 ? "" : undefined}
    >
      <span className="session-plan-dot" aria-hidden="true">
        {index + 1}
      </span>
      <div className="session-plan-body">
        <div className="session-plan-title">{stepTitle(step, t)}</div>
        <div className="session-plan-meta">
          <span className="session-plan-role">{t(roleKey(step))}</span>
          {pathTitle && <span className="session-plan-path"> · {pathTitle}</span>}
        </div>
        <div className="session-why session-plan-why">
          {context && (
            <>
              <b className="session-context" data-code={step.kind === "exercise" ? step.context?.code : undefined}>
                {lineText(t, context)}
              </b>{" "}
            </>
          )}
          {lineText(t, shortReason(step, earlier))}
        </div>
      </div>
      <div className="session-plan-side">
        <div className="session-plan-mins">
          {step.minutes}
          <small>{t("session.today.min")}</small>
        </div>
        {bpm && <div className="session-plan-bpm">{lineText(t, bpm)}</div>}
      </div>
    </li>
  );
}

/** The plan's minutes as one bar: a stretch per step, coloured by its kind. */
function TimeBar({ steps, paths, total }: { steps: readonly PlanStep[]; paths: readonly PathDoc[]; total: number }) {
  const { t } = useTranslation();
  const ticks = ticksOf(total);
  return (
    <div className="session-timebar" aria-hidden="true">
      <div className="session-timebar-bar">
        {steps.map((step) => (
          <span key={step.id} data-kind={rowKind(step, paths)} style={{ flexGrow: step.minutes }} />
        ))}
      </div>
      <div className="session-timebar-ticks">
        {ticks.map((m, i) => (
          <span key={m} style={{ left: `${(m / total) * 100}%` }} data-end={i === ticks.length - 1 ? "" : undefined}>
            {i === ticks.length - 1 ? t("session.today.minutes", { minutes: m }) : m}
          </span>
        ))}
      </div>
    </div>
  );
}

export function TodayView({
  session,
  onOpenTools,
  onOpenPaths,
  instrument,
  onOpenToolsList,
  onChangeInstrument,
}: {
  session: SessionRun;
  /**
   * The player's instrument. Anything but a guitar gets a calm note at the top
   * (guitar first, 2026-11-17); nothing is blocked. Absent in scenes and tests
   * that predate it, which then read as a guitar.
   */
  instrument?: string;
  /** To the Tools list, from that note. */
  onOpenToolsList?: () => void;
  /** To the instrument setting, from that note. */
  onChangeInstrument?: () => void;
  /** "Open Tools": the Tools list. Opening on the last tool is a setting (Settings › General). */
  onOpenTools: () => void;
  /** To the Paths list: the way on when no Path is subscribed (QA 2026-11-17 #7). */
  onOpenPaths: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { plan, minutes, setMinutes, myPaths, progress, actions } = session;
  // No neck here: an empty one pushed the plan below the fold (UX audit
  // TODAY-9). The input's state is the header's chip (TODAY-10).
  const neck3d = useNeck3d();
  const [endRef, endInView] = useEndInView();

  const weekday = new Intl.DateTimeFormat(i18n.language, { weekday: "long" }).format(new Date());
  const lead =
    plan.mood === "first"
      ? t("session.today.leadFirstOutcome")
      : plan.mood === "back"
        ? t("session.today.leadBack", { days: plan.daysAway ?? 0 })
        : weekday;

  // Subscribed to nothing: Today has no plan to build, so its one big action
  // is choosing a Path rather than a Start that cannot start.
  // Only once the Paths have loaded: before then nothing is subscribed either.
  const noPaths = session.paths.length > 0 && myPaths.length === 0;
  const last = progress.takes[0];
  const leftOff = last ? leftOffLine(factsOf(last), last.bpm) : null;
  const steps = plan.steps;
  const planned = steps.reduce((sum, s) => sum + s.minutes, 0);
  // A Path's name on each row only says something when there are two or more.
  const showPath = myPaths.length > 1;

  return (
    <div className="session-page session-today-page" data-testid="today" data-neck3d={neck3d}>
      <div className="session-today" data-steps={steps.length}>
        <div className="session-today-hero">
          {instrument && (
            <InstrumentNote
              instrument={instrument}
              onOpenTools={onOpenToolsList ?? onOpenTools}
              onChangeInstrument={onChangeInstrument ?? (() => {})}
            />
          )}
          <div className="session-today-head">
            <div className="session-kick session-rise">{lead}</div>
            <div className="session-today-headline">
              <h1 className="session-mega session-rise" style={rise(1)}>
                {t("session.today.title")}
              </h1>
              {!noPaths && (
                <div className="session-today-minutes session-rise" style={rise(2)}>
                  {t("session.today.minutes", { minutes })}
                </div>
              )}
            </div>
          </div>
          {noPaths ? (
            <button
              className="session-big session-rise"
              style={rise(3)}
              onClick={onOpenPaths}
              data-testid="today-choose-path"
            >
              {t("session.today.choosePath")}
            </button>
          ) : (
            <button
              className="session-big session-today-start session-rise"
              style={rise(3)}
              onClick={actions.startToday}
              disabled={steps.length === 0}
              data-testid="today-start"
            >
              <span className="session-today-start-word">{t("session.today.start")}</span>
              {steps[0] && <small className="session-today-start-next">{stepTitle(steps[0], t)}</small>}
            </button>
          )}
          {!noPaths && (
            <>
              <div className="session-today-seg-label" id="session-minutes-label">
                {t("session.today.howLong")}
              </div>
              <div className="session-seg" role="group" aria-labelledby="session-minutes-label">
                {PLAN_MINUTES.map((m) => (
                  <button
                    key={m}
                    className={m === minutes ? "on" : ""}
                    aria-pressed={m === minutes}
                    onClick={() => setMinutes(m)}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="session-today-plan">
          {plan.mood === "back" && last && (
            <div className="session-glass session-card session-rise" data-testid="today-left-off">
              <div className="session-kick">{t("session.today.leftOff")}</div>
              <div className="session-why">
                <b>{leftOff && lineText(t, leftOff)}</b>
              </div>
            </div>
          )}
          {steps.length > 0 && (
            <div className="session-plan-head session-rise" style={rise(4)}>
              <div className="session-kick">{t("session.today.whatsIn")}</div>
              <div className="session-plan-total">
                {t("session.today.parts", { count: steps.length, minutes: planned })}
              </div>
            </div>
          )}
          {steps.length > 0 && <TimeBar steps={steps} paths={session.paths} total={planned} />}
          {steps.length > 0 && (
            // Keyed on the minutes: a new plan comes in as one, rows settling
            // in turn, rather than swapping under the pointer (TODAY-11).
            <ol className="session-plan-list" role="list" key={minutes} data-testid="today-plan">
              {steps.map((step, i) => (
                <PlanRow
                  key={step.id}
                  step={step}
                  index={i}
                  earlier={steps.slice(0, i)}
                  paths={session.paths}
                  showPath={showPath}
                  rowRef={i === steps.length - 1 ? endRef : undefined}
                />
              ))}
            </ol>
          )}
          {steps.length > 0 && !endInView && (
            <div className="session-plan-more" aria-hidden="true" data-testid="today-more">
              {t("session.today.moreBelow")}
            </div>
          )}
          {(plan.skipped ?? []).length > 0 && (
            <div className="session-footnote session-skipped" data-testid="today-skipped">
              <span className="session-kick">{t("session.today.resting")}</span>
              {(plan.skipped ?? []).map((skip) => (
                <span key={skip.pathId} className="session-why">
                  {lineText(t, reasonLine(skip.why))}
                </span>
              ))}
            </div>
          )}
          {steps.length === 0 && (
            <div className="session-glass session-card session-col" data-testid="today-nothing" style={{ gap: 6 }}>
              <div className="session-why">
                {t(noPaths ? "session.today.noPaths" : "session.today.nothing")}
              </div>
              {!noPaths && (
                <button className="session-link" onClick={onOpenPaths}>
                  {t("session.today.choosePath")}
                </button>
              )}
            </div>
          )}
          {plan.mood === "first" && myPaths.some((p) => p.id === FIRST_PATH_ID) && (
            <p className="session-footnote session-today-tools">
              {t("session.today.toolsAsk")}{" "}
              <button className="session-link" onClick={onOpenTools}>
                {t("session.today.openTools")}
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
