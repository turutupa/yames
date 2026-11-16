/**
 * Today: the front door. The Session is already built, every line says why it is
 * there, and one press starts it. Choosing minutes rebuilds it.
 */
import { useTranslation } from "react-i18next";
import { PLAN_MINUTES } from "../../session/planner";
import type { PlanStep } from "../../session/planner";
import { reasonLine } from "../../session/coachWords";
import { currentStepOf, factsOf } from "../../session/progress";
import { FIRST_PATH_ID } from "../../session/packs";
import type { SessionRun } from "./hooks/useSessionRun";
import { lineText } from "./lineText";
import "../../styles/session.css";

function StepTag({ step }: { step: PlanStep }) {
  const { t } = useTranslation();
  if (step.kind === "exercise") return <span className="session-tag">{t("session.kind.mechanics")}</span>;
  if (step.kind === "jam") return <span className="session-tag" data-quiet="">{t("session.kind.jam")}</span>;
  return <span className="session-tag" data-quiet="">{t("session.kind.warmUp")}</span>;
}

/** A jam step has no title of its own; a warm-up names its Exercise. */
export function stepTitle(step: PlanStep, t: (key: string) => string): string {
  if (step.kind === "jam") return t("session.step.jam");
  if (step.kind === "drill") return t("session.step.drill");
  if (step.kind === "exercise" && step.role === "edge") return `${t("session.edge.kick")} · ${step.title}`;
  return step.title;
}

export function TodayView({
  session,
  onOpenLastTool,
  onOpenTools,
}: {
  session: SessionRun;
  /** "Open on my last tool": the setting, and going there now. */
  onOpenLastTool: () => void;
  onOpenTools: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { plan, minutes, setMinutes, myPaths, progress, actions } = session;

  const weekday = new Intl.DateTimeFormat(i18n.language, { weekday: "long" }).format(new Date());
  const lead =
    plan.mood === "first"
      ? t("session.today.leadFirst")
      : plan.mood === "back"
        ? t("session.today.leadBack", { days: plan.daysAway ?? 0 })
        : weekday;

  const last = progress.takes[0];
  const lastFacts = last ? factsOf(last) : null;
  const lastPercent =
    lastFacts && typeof lastFacts.headlineValue === "number" && lastFacts.headlineMetric !== "extraNotes"
      ? Math.round(lastFacts.headlineValue * 100)
      : null;

  return (
    <div className="session-page session-today" data-testid="today">
      <div className="session-today-hero">
        <div className="session-kick">{lead}</div>
        <h1 className="session-mega">{t("session.today.title")}</h1>
        <div className="session-today-minutes">{t("session.today.minutes", { minutes })}</div>
        <button
          className="session-big"
          onClick={actions.startToday}
          disabled={plan.steps.length === 0}
          data-testid="today-start"
        >
          {t("session.today.start")}
        </button>
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
        {plan.mood === "back" && last && (
          <div className="session-card" data-testid="today-left-off">
            <div className="session-kick">{t("session.today.leftOff")}</div>
            <div className="session-why">
              {lastPercent === null
                ? t("session.today.leftOffPlain", { bpm: last.bpm })
                : t("session.today.leftOffValue", { bpm: last.bpm, value: lastPercent })}
            </div>
          </div>
        )}
        <div className="session-kick">{t("session.today.whatsIn")}</div>
        <ol className="session-plan-list">
          {plan.steps.map((step) => {
            const why = reasonLine(step.why);
            return (
              <li className="session-plan-item" key={step.id}>
                <div className="session-plan-mins">
                  {step.minutes}
                  <small>{t("session.today.min")}</small>
                </div>
                <div className="session-plan-body">
                  <div className="session-plan-title">
                    <span>{stepTitle(step, t)}</span>
                    <StepTag step={step} />
                  </div>
                  <div className="session-why">{lineText(t, why)}</div>
                </div>
              </li>
            );
          })}
        </ol>
        {plan.steps.length === 0 && (
          <div className="session-why">{t("session.today.nothing")}</div>
        )}
        {plan.mood === "first" && (
          <div className="session-footnote">
            <span>{t("session.today.needsInput")}</span>{" "}
            {myPaths.some((p) => p.id === FIRST_PATH_ID) && (
              <>
                <span>{t("session.today.toolsOffer")}</span>{" "}
                <button className="session-link" onClick={onOpenTools}>
                  {t("session.today.toolsOfferOpen")}
                </button>{" "}
                <button className="session-link" onClick={onOpenLastTool}>
                  {t("session.today.toolsOfferAlways")}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
