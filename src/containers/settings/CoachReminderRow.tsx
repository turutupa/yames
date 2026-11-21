/**
 * Settings → Coach: "Practice reminder" (leg rem2; OWNER-UPDATES 2026-11-20:
 * in the app only). Off / On, and when On a time and the seven weekdays in the
 * locale's order. Today mentions it after that time on those days if there is
 * no Session yet; there is no notification, nothing runs in the background.
 *
 * Off by default, and only a press here changes it: nothing in the app asks
 * the player to turn it on, and nothing turns it off. The first On fills
 * 18:00 and all seven days (judgement call 22); Off keeps the time and days.
 * The controls wait while the key is being read (turning it on keeps what is
 * stored); when it could not be read the row says so, and a press saves it.
 * While Today has stopped mentioning it (three reminder days passed with no
 * Session, judgement call 23) the row says so: the setting stays On.
 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { reminderQuiet } from "../../coach/reminder";
import { coachPressSettled, REMINDER_OFF, saveReminder, type ReminderChoice } from "../../coach/store";
import { useReminderPractised, useStoredReminder } from "../../coach/useReminder";
import { weekStartOf } from "../../session/totals";

export function CoachReminderRow() {
  const { t, i18n } = useTranslation();
  const { reminder, state } = useStoredReminder();
  const { practised, now } = useReminderPractised(reminder);
  const quiet = reminder !== null && practised !== null && reminderQuiet(reminder, now, practised);

  // A press whose save did not land says so; the next press that lands clears it.
  const [notSaved, setNotSaved] = useState(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const loading = state === "loading";
  // Unreadable: shown as off; a press saves a whole value over it.
  const shown = reminder ?? REMINDER_OFF;
  const choose = (choice: ReminderChoice) => {
    if (!saveReminder(choice, Date.now())) return;
    void coachPressSettled("reminder").then((end) => {
      if (mounted.current) setNotSaved(end === "notSaved");
    });
  };
  const current: ReminderChoice = { on: shown.on, time: shown.time, days: shown.days };

  const start = weekStartOf(i18n.language);
  const order = Array.from({ length: 7 }, (_, i) => (start + i) % 7);
  // 4 January 2026 was a Sunday: day d of the week is the (4 + d)th.
  const dayName = (d: number, weekday: "short" | "long") =>
    new Intl.DateTimeFormat(i18n.language, { weekday }).format(new Date(2026, 0, 4 + d));
  const toggleDay = (d: number) =>
    choose({ ...current, days: shown.days.includes(d) ? shown.days.filter((x) => x !== d) : [...shown.days, d] });

  return (
    <div className="setting-row coach-reminder-row" data-testid="coach-reminder-row">
      <div className="setting-label">
        <label>{t("notebook.reminder.label")}</label>
        <span className="setting-hint">{t("notebook.reminder.hint")}</span>
        {quiet && (
          <span className="setting-hint" style={{ marginTop: 4 }} data-testid="coach-reminder-quiet">
            {t("notebook.reminder.quiet")}
          </span>
        )}
        {state === "unreadable" && (
          <span className="setting-hint" style={{ marginTop: 4 }} data-testid="coach-reminder-unreadable">
            {t("notebook.reminder.unreadable")}
          </span>
        )}
        {notSaved && (
          <span className="setting-hint" style={{ marginTop: 4 }} role="status" data-testid="coach-reminder-not-saved">
            {t("notebook.ui.notSaved")}
          </span>
        )}
      </div>
      <div className="coach-reminder-controls">
        <div className="toggle-group">
          {([false, true] as const).map((on) => (
            <button
              key={String(on)}
              type="button"
              className={`toggle-btn ${reminder !== null && shown.on === on ? "active" : ""}`}
              aria-pressed={reminder !== null && shown.on === on}
              disabled={loading}
              data-testid={`coach-reminder-${on ? "on" : "off"}`}
              onClick={() => choose({ ...current, on })}
            >
              {t(on ? "notebook.reminder.on" : "notebook.reminder.off")}
            </button>
          ))}
        </div>
        {reminder?.on && (
          <>
            <label className="coach-reminder-time">
              <span>{t("notebook.reminder.time")}</span>
              <input
                type="time"
                value={shown.time}
                data-testid="coach-reminder-time"
                onChange={(e) => choose({ ...current, time: e.target.value })}
              />
            </label>
            <div className="toggle-group coach-reminder-days" role="group" aria-label={t("notebook.reminder.days")}>
              {order.map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`toggle-btn ${shown.days.includes(d) ? "active" : ""}`}
                  aria-pressed={shown.days.includes(d)}
                  aria-label={dayName(d, "long")}
                  data-testid={`coach-reminder-day-${d}`}
                  onClick={() => toggleDay(d)}
                >
                  {dayName(d, "short")}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
