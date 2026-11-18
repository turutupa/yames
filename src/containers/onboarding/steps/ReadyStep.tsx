/**
 * W7 — Ready (ONBOARDING_PLAN §3, decision 4).
 *
 * A summary of what the setup produced. Every row is a button back to the
 * step that owns it, so a wrong answer is one click from being fixed — rows
 * for steps O2–O5 haven't built yet show the app's *current* setting rather
 * than a placeholder, and jumping to them is a no-op until they register.
 */
import { useTranslation } from "react-i18next";
import { IS_MOBILE } from "../../../platform";
import { getThemeById } from "../../../themes";
import { useWizardEnv } from "../WizardContext";
import type { StepId } from "../onboardingMachine";
import type { WizardStepProps } from "./types";
import { defaultStart } from "./StartStep";
import { stepTitle } from "../../session/TodayView";
import "../../../styles/onboarding-learning.css";

/** Rows of the first Session W7 shows; Today has the rest. */
const FIRST_SESSION_ROWS = 4;

type SummaryRow = {
  key: string;
  label: string;
  value: string;
  target: StepId;
};

export function ReadyStep(_props: WizardStepProps) {
  const { t } = useTranslation();
  const {
    instrument,
    soundType,
    themeId,
    coachTier,
    inputDeviceName,
    hasFootswitch,
    alwaysOnTop,
    setAlwaysOnTop,
    availableSteps,
    jumpTo,
    finish,
    onRequestTour,
    machineContext,
    learning,
  } = useWizardEnv();

  // Where Today starts: the Path the player follows first, at its Level — what
  // "Where do you start?" wrote, or the default a skipped step leaves.
  const start = defaultStart(learning.paths, learning.progress);
  const startPath = start ? learning.paths.find((p) => p.id === start.pathId) : undefined;
  const plan = learning.plan;
  const planSteps = plan?.steps ?? [];

  const rows: SummaryRow[] = [
    ...(startPath
      ? [
          {
            key: "path",
            label: t("onboarding.ready.rows.path"),
            value: start?.levelId
              ? `${startPath.title} · ${t(`session.paths.levelName.${start.levelId}`)}`
              : startPath.title,
            target: "start" as StepId,
          },
        ]
      : []),
    {
      key: "instrument",
      label: t("onboarding.ready.rows.instrument"),
      value: t(`instrument.${instrument}`),
      target: "instrument",
    },
    {
      key: "sound",
      label: t("onboarding.ready.rows.sound"),
      value: t(`sound.${soundType}`),
      target: "sound-look",
    },
    {
      key: "theme",
      label: t("onboarding.ready.rows.theme"),
      value: getThemeById(themeId).name,
      target: "sound-look",
    },
    // The footswitch and the coach's model are not in a phone build, so a
    // phone's summary does not report them.
    ...(IS_MOBILE
      ? []
      : ([
        {
          key: "control",
          label: t("onboarding.ready.rows.control"),
          value: hasFootswitch
            ? t("onboarding.ready.controlFootswitch")
            : t("onboarding.ready.controlKeyboard"),
          target: "hands-free",
        },
        {
          key: "coach",
          label: t("settings.coach.brain"),
          value:
            coachTier === "off"
              ? t("onboarding.ready.coachTiming")
              : coachTier === "full"
                ? t("settings.coach.brainStudio")
                : t("settings.coach.brainStandard"),
          target: "coach",
        },
        ] as SummaryRow[])),
    {
      key: "input",
      label: t("onboarding.ready.rows.input"),
      // The system default has no name to show, but heard on W5 it is set up.
      value:
        inputDeviceName ||
        (machineContext.inputConfigured
          ? t("settings.inputTest.systemDefault")
          : t("onboarding.ready.inputNone")),
      target: "audio-input",
    },
  ];

  return (
    <div className="onboarding-step">
      <h2 className="onboarding-step-title" id="onboarding-title">
        {t("onboarding.ready.title")}
      </h2>
      <p className="onboarding-step-subtitle">{t("onboarding.ready.subtitle")}</p>

      <ul className="onboarding-summary">
        {rows.map((row) => {
          // A row is only a button when the step it points at exists on this
          // run. Rows for steps O2–O5 have yet to add stay static — a
          // clickable-looking row that does nothing is worse than plain text.
          const reachable = availableSteps.includes(row.target);
          const body = (
            <>
              <span className="onboarding-summary-label">{row.label}</span>
              <span className="onboarding-summary-value">{row.value}</span>
            </>
          );
          return (
            <li key={row.key}>
              {reachable ? (
                <button
                  type="button"
                  className="onboarding-summary-row"
                  onClick={() => jumpTo(row.target)}
                >
                  {body}
                </button>
              ) : (
                <div className="onboarding-summary-row onboarding-summary-static">
                  {body}
                </div>
              )}
            </li>
          );
        })}
        {/* A phone has one fullscreen webview — nothing to stay on top of. */}
        {!IS_MOBILE && (
          <li>
            <div className="onboarding-summary-row onboarding-summary-static onboarding-summary-toggle">
              <span className="onboarding-summary-label">
                {t("onboarding.ready.alwaysOnTop")}
              </span>
              <button
                type="button"
                className={`toggle-btn ${alwaysOnTop ? "active" : ""}`}
                aria-pressed={alwaysOnTop}
                onClick={() => setAlwaysOnTop(!alwaysOnTop)}
              >
                {alwaysOnTop ? t("common.on") : t("common.off")}
              </button>
            </div>
          </li>
        )}
      </ul>

      {/* The first Session, as Today will show it: built from the Path and
          Level above, one press away once the wizard closes. */}
      {planSteps.length > 0 && plan && (
        <section className="onboarding-first-session" data-testid="onboarding-first-session">
          <div className="onboarding-first-session-head">
            <span className="onboarding-first-session-title">{t("session.today.leadFirst")}</span>
            <span className="onboarding-first-session-total">
              {t("session.today.minutes", { minutes: plan.minutes })}
            </span>
          </div>
          <ol>
            {planSteps.slice(0, FIRST_SESSION_ROWS).map((step, i) => (
              <li key={i}>
                <span className="onboarding-first-session-dot" aria-hidden="true">
                  {i + 1}
                </span>
                <span className="onboarding-first-session-name">{stepTitle(step, t)}</span>
                <span className="onboarding-first-session-min">
                  {t("session.today.minutes", { minutes: step.minutes })}
                </span>
              </li>
            ))}
          </ol>
          {planSteps.length > FIRST_SESSION_ROWS && (
            <p className="onboarding-first-session-more">
              {t("onboarding.ready.moreOnToday", { count: planSteps.length - FIRST_SESSION_ROWS })}
            </p>
          )}
        </section>
      )}

      {/* The one thing about a phone that the desktop app never had to warn
          anyone about: the first Play raises a permission prompt the user did
          not ask for, and saying no to it costs them the row in the shade that
          keeps the click alive with the screen off. Said here, before they
          press anything, it is a heads-up; said by the system a second after
          Play, unannounced, it is an interruption in the middle of counting in. */}
      {IS_MOBILE && (
        <p className="onboarding-ready-note">{t("onboarding.ready.notificationNote")}</p>
      )}

      <div className="onboarding-ready-actions">
        <button
          type="button"
          className="onboarding-btn onboarding-btn-primary"
          onClick={finish}
        >
          {t("onboarding.ready.start")}
        </button>
        {/* The tour is written around a desktop layout and its hotkeys, and
            is cut on a phone (plan §1) -- Settings already drops its "Take
            the tour" row. An offer that leads nowhere belongs nowhere. */}
        {!IS_MOBILE && onRequestTour && (
          <button
            type="button"
            className="onboarding-btn onboarding-btn-ghost"
            onClick={onRequestTour}
          >
            {t("onboarding.ready.tour")}
          </button>
        )}
      </div>
    </div>
  );
}
