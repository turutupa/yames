import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { storeLoad } from "../../ipc";
import { IS_MOBILE } from "../../platform";
import { PLAN_MINUTES, type PlanMinutes } from "../../session/planner";
import {
  PRACTICE_VIEWS,
  isPracticeView,
  type PracticeView,
} from "../session/highway/runwayModel";
import {
  GRADING_CHOICES,
  GRADING_KEY,
  LEGACY_GRADE_KEY,
  readGradingChoice,
  type GradingChoice,
} from "../../session/grading";

/** The store keys `useSessionRun` reads; the setters it hands us write them. */
const MINUTES_KEY = "session.minutes";
const PRACTICE_VIEW_KEY = "practiceView";

export interface PracticeSettings {
  minutes: PlanMinutes;
  setMinutes: (next: PlanMinutes) => void;
  practiceView: PracticeView;
  setPracticeView: (next: PracticeView) => void;
  /** "Grade my playing": on, off or ask (owner, 2026-11-18). Optional: older callers leave it out. */
  grading?: GradingChoice;
  setGrading?: (next: GradingChoice) => void;
}

/**
 * Practice (UX audit SET-1, card #30): the learning side's own defaults.
 *
 * Only what is wired to real behaviour is here. The Session's length and the
 * view it opens on are both kept by `useSessionRun`, which takes them from the
 * store the first time the learning side opens and writes them back through
 * the setters passed in here, so Today, the Session and this panel cannot
 * disagree. Before the learning side has opened, the hook still holds its
 * defaults, so the panel shows what the store says until then.
 *
 * Left out on purpose, because nothing reads them yet: the count-in (a
 * constant, `TAKE_COUNT_IN_BARS`, that the runway and the grader both depend
 * on), the click under a Take, switching the warm-up off, and a Level, which
 * belongs to a Path rather than to the player.
 */
export function PracticeSettingsSection({ practice }: { practice: PracticeSettings }) {
  const { t } = useTranslation();
  const [stored, setStored] = useState<{ minutes?: PlanMinutes; view?: PracticeView; grading?: GradingChoice }>({});

  useEffect(() => {
    let live = true;
    void Promise.all([
      storeLoad<number>(MINUTES_KEY).catch(() => undefined),
      storeLoad<string>(PRACTICE_VIEW_KEY).catch(() => undefined),
      storeLoad<unknown>(GRADING_KEY).catch(() => undefined),
      storeLoad<unknown>(LEGACY_GRADE_KEY).catch(() => undefined),
    ]).then(([m, v, g, legacy]) => {
      if (!live) return;
      setStored({
        minutes: PLAN_MINUTES.includes(m as PlanMinutes) ? (m as PlanMinutes) : undefined,
        view: isPracticeView(v) ? v : undefined,
        // Nothing stored at all: what the hook holds (it reads the same keys).
        grading: g === undefined && legacy === undefined ? undefined : readGradingChoice(g, legacy),
      });
    });
    return () => {
      live = false;
    };
  }, []);

  const minutes = stored.minutes ?? practice.minutes;
  const view = stored.view ?? practice.practiceView;
  const grading = stored.grading ?? practice.grading ?? "ask";

  return (
    <section className="settings-section" id="settings-practice">
      <h2>{t("settings.practice.title")}</h2>
      <div className="setting-row">
        <div className="setting-label">
          <label>{t("settings.practice.minutes")}</label>
          <span className="setting-hint">{t("settings.practice.minutesHint")}</span>
        </div>
        <div className="toggle-group" role="group" aria-label={t("settings.practice.minutes")}>
          {PLAN_MINUTES.map((m) => (
            <button
              key={m}
              className={`toggle-btn ${minutes === m ? "active" : ""}`}
              aria-pressed={minutes === m}
              onClick={() => {
                setStored((s) => ({ ...s, minutes: m }));
                practice.setMinutes(m);
              }}
            >
              {t("session.today.minutes", { minutes: m })}
            </button>
          ))}
        </div>
      </div>
      <div className="setting-row">
        <div className="setting-label">
          <label>{t("settings.practice.view")}</label>
          <span className="setting-hint">
            {t("settings.practice.viewHint")}
            {/* The key only where there is a keyboard to press it on. */}
            {!IS_MOBILE && <> {t("session.view.keyHint", { key: "V" })}</>}
          </span>
        </div>
        <div className="toggle-group" role="group" aria-label={t("settings.practice.view")}>
          {PRACTICE_VIEWS.map((v) => (
            <button
              key={v}
              className={`toggle-btn ${view === v ? "active" : ""}`}
              aria-pressed={view === v}
              onClick={() => {
                setStored((s) => ({ ...s, view: v }));
                practice.setPracticeView(v);
              }}
            >
              {t(`session.view.${v}`)}
            </button>
          ))}
        </div>
      </div>
      {/* A choice, not a switch (owner, 2026-11-18): playing ungraded is a
          way to practise of its own, so each answer says what it means. */}
      {practice.setGrading && (
        <div className="setting-row setting-row-block">
          <div className="setting-label">
            <label id="settings-grading-label">{t("settings.practice.grade")}</label>
            <span className="setting-hint">{t("settings.practice.gradeHint")}</span>
          </div>
          <div
            className="setting-choices"
            role="radiogroup"
            aria-labelledby="settings-grading-label"
            data-testid="settings-grading"
          >
            {GRADING_CHOICES.map((choice) => (
              <button
                key={choice}
                type="button"
                role="radio"
                aria-checked={grading === choice}
                className={`setting-choice${grading === choice ? " active" : ""}`}
                data-testid={`settings-grading-${choice}`}
                onClick={() => {
                  setStored((s) => ({ ...s, grading: choice }));
                  practice.setGrading?.(choice);
                }}
              >
                <b>{t(`settings.practice.grading.${choice}`)}</b>
                <span>{t(`settings.practice.grading.${choice}Hint`)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
