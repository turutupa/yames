/**
 * Today's practice-reminder line (leg rem2): one sentence above Today's line,
 * not instead of it, on a reminder day after its time when there is no
 * Session today ("Your reminder: guitar at 18:00."). Rule-made: it shows on a
 * phone as on a computer, and it is not a proactive card (judgement call 25:
 * it does not spend the one-card budget). Nothing here writes anything.
 */
import { memo } from "react";
import { useTranslation } from "react-i18next";
import { reminderLine, reminderTimeText } from "../../coach/reminder";
import { useReminderPractised, useStoredReminder } from "../../coach/useReminder";
import { CoachLine } from "../coach/CoachLine";

export const TodayReminder = memo(function TodayReminder() {
  const { t, i18n } = useTranslation();
  const { reminder } = useStoredReminder();
  const { practised, now } = useReminderPractised(reminder);
  const line = reminder && practised ? reminderLine(reminder, now, practised) : null;
  if (!line) return null;
  return (
    <div className="session-today-reminder">
      <CoachLine testId="today-reminder">
        {t(line.key, { time: reminderTimeText(String(line.values.time), i18n.language) })}
      </CoachLine>
    </div>
  );
});
