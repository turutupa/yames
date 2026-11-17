/**
 * Today: the front door. The Session is already built, every line says why it is
 * there, and one press starts it. Choosing minutes rebuilds it.
 */
import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { PLAN_MINUTES } from "../../session/planner";
import type { PlanStep } from "../../session/planner";
import { leftOffLine, reasonLine } from "../../session/coachWords";
import { currentStepOf, factsOf } from "../../session/progress";
import { FIRST_PATH_ID } from "../../session/packs";
import { kindOfPath } from "../../session/kind";
import type { PathDoc } from "../../paths/format";
import type { SessionRun } from "./hooks/useSessionRun";
import { lineText } from "./lineText";
import { InstrumentNote } from "./InstrumentNote";
import { useNeckSlot, useNeck3d } from "./hooks/useNeck";
import { useNeck } from "../../stage3d/api";
import type { NeckView } from "../../stage3d/api";
import "../../styles/session.css";

const WHOLE: NeckView = { kind: "whole" };

/** The staggered entrance the mocks give each block. */
export function rise(i: number): CSSProperties {
  return { "--i": i } as CSSProperties;
}

/** The roles that have a tag of their own; the rest read as their Path's kind. */
const ROLE_TAG: Partial<Record<string, string>> = {
  review: "session.kind.review",
  placement: "session.kind.placement",
  benchmark: "session.kind.benchmark",
  test: "session.kind.test",
};

export function StepTag({ step, paths }: { step: PlanStep; paths: readonly PathDoc[] }) {
  const { t } = useTranslation();
  if (step.kind === "exercise") {
    const own = ROLE_TAG[step.role];
    const kind = kindOfPath(paths, step.pathId);
    return (
      <span className="session-tag" data-kind={kind} data-role={step.role}>
        {t(own ?? `session.kind.${kind}`)}
      </span>
    );
  }
  if (step.kind === "jam") {
    return (
      <span className="session-tag">
        {t(step.exerciseId ? "session.kind.finisher" : "session.kind.jam")}
      </span>
    );
  }
  if (step.kind === "metronome" && step.why.code === "yourTurn") {
    return <span className="session-tag">{t("session.kind.yourTurn")}</span>;
  }
  return <span className="session-tag">{t("session.kind.warmUp")}</span>;
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

export function TodayView({
  session,
  onOpenLastTool,
  onOpenTools,
  onOpenPaths,
  listening = false,
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
  /** The input is on and listening: grading needs nothing more, so Today does not ask for it. */
  listening?: boolean;
  /** "Open on my last tool": the setting, and going there now. */
  onOpenLastTool: () => void;
  onOpenTools: () => void;
  /** To the Paths list: the way on when no Path is subscribed (QA 2026-11-17 #7). */
  onOpenPaths: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { plan, minutes, setMinutes, myPaths, progress, actions } = session;
  // The whole neck, swept warm on arrival and again when the minutes change.
  const slot = useNeckSlot(WHOLE, [], { sweep: true });
  const neck = useNeck();
  const neck3d = useNeck3d();

  const weekday = new Intl.DateTimeFormat(i18n.language, { weekday: "long" }).format(new Date());
  const lead =
    plan.mood === "first"
      ? t("session.today.leadFirst")
      : plan.mood === "back"
        ? t("session.today.leadBack", { days: plan.daysAway ?? 0 })
        : weekday;

  // Subscribed to nothing: Today has no plan to build, so its one big action
  // is choosing a Path rather than a Start that cannot start.
  // Only once the Paths have loaded: before then nothing is subscribed either.
  const noPaths = session.paths.length > 0 && myPaths.length === 0;
  const last = progress.takes[0];
  const leftOff = last ? leftOffLine(factsOf(last), last.bpm) : null;

  return (
    <div className="session-page" data-testid="today" data-neck3d={neck3d}>
      <div className="session-today">
        <div className="session-slot" ref={slot} aria-hidden="true" />
        <div className="session-today-hero">
          {instrument && (
            <InstrumentNote
              instrument={instrument}
              onOpenTools={onOpenToolsList ?? onOpenTools}
              onChangeInstrument={onChangeInstrument ?? (() => {})}
            />
          )}
          <div>
            <div className="session-kick session-rise">{lead}</div>
            <h1 className="session-mega session-rise" style={rise(1)}>
              {t("session.today.title")}
            </h1>
            {!noPaths && (
              <div className="session-today-minutes session-rise" style={rise(2)}>
                {t("session.today.minutes", { minutes })}
              </div>
            )}
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
              className="session-big session-rise"
              style={rise(3)}
              onClick={actions.startToday}
              disabled={plan.steps.length === 0}
              data-testid="today-start"
            >
              {t("session.today.start")}
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
                onClick={() => {
                  setMinutes(m);
                  neck.sweep();
                }}
              >
                {m}
              </button>
            ))}
          </div>
          </>
          )}
          {plan.mood !== "first" && myPaths.length > 0 && (
            <div className="session-quiet">
              {t("session.today.running", {
                paths: myPaths
                  .map((p) => `${p.title}, ${currentStepOf(progress, p).title}`)
                  .join(" · "),
              })}
            </div>
          )}
        </div>

        <div className="session-today-plan">
          {plan.steps.length > 0 && (
            <div className="session-kick session-rise" style={rise(4)}>
              {t("session.today.whatsIn")}
            </div>
          )}
          {plan.mood === "back" && last && (
            <div className="session-glass session-card session-rise" data-testid="today-left-off">
              <div className="session-kick">{t("session.today.leftOff")}</div>
              <div className="session-why">
                <b>
                  {leftOff && lineText(t, leftOff)}
                </b>
              </div>
            </div>
          )}
          <ol className="session-plan-list">
            {plan.steps.map((step, i) => {
              const why = reasonLine(step.why);
              return (
                <li
                  className="session-plan-item session-glass session-rise"
                  style={rise(i + 4)}
                  key={step.id}
                >
                  <div className="session-plan-mins">
                    {step.minutes}
                    <small>{t("session.today.min")}</small>
                  </div>
                  <div className="session-plan-body">
                    <div className="session-plan-title">
                      <span>{stepTitle(step, t)}</span>
                      <StepTag step={step} paths={session.paths} />
                    </div>
                    <ContextLine step={step} />
                    <div className="session-why">{lineText(t, why)}</div>
                  </div>
                </li>
              );
            })}
          </ol>
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
          {plan.steps.length === 0 && (
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
          {plan.mood === "first" && (
            <div className="session-footnote">
              {!listening && <span>{t("session.today.needsInput")}</span>}
              {myPaths.some((p) => p.id === FIRST_PATH_ID) && (
                <>
                  <span>{t("session.today.toolsOffer")}</span>
                  <button className="session-link" onClick={onOpenTools}>
                    {t("session.today.toolsOfferOpen")}
                  </button>
                  <button className="session-link" onClick={onOpenLastTool}>
                    {t("session.today.toolsOfferAlways")}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
