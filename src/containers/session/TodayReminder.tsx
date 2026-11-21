/**
 * Today's practice-reminder line (leg rem2): one sentence above Today's line,
 * not instead of it, on a reminder day after its time when there is no
 * Session today ("Your reminder: guitar at 18:00."). Rule-made: it shows on a
 * phone as on a computer, and it is not a proactive card (judgement call 25:
 * it does not spend the one-card budget). Nothing here writes anything. Not
 * said while a Session is in progress, between its Takes included (rem2b).
 */
import { memo } from "react";
import { useTranslation } from "react-i18next";
import { reminderLine, reminderTimeText } from "../../coach/reminder";
import { useReminderPractised, useStoredReminder } from "../../coach/useReminder";
import { CoachLine } from "../coach/CoachLine";

export const TodayReminder = memo(function TodayReminder({
  takes,
  sessionBusy = false,
}: {
  /** The Session's Takes (read once, by `useSessionRun`), or null while they load. */
  takes: ReadonlyArray<{ startedAt: number }> | null;
  /** A Session is in progress (between its Takes): nothing is said or read. */
  sessionBusy?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const { reminder } = useStoredReminder();
  const { practised, now, held } = useReminderPractised(reminder, { takes, held: sessionBusy });
  const line = reminder && practised && !held ? reminderLine(reminder, now, practised) : null;
  if (!line) return null;
  return (
    <div className="session-today-reminder">
      <CoachLine testId="today-reminder">
        {t(line.key, { time: reminderTimeText(String(line.values.time), i18n.language) })}
      </CoachLine>
    </div>
  );
});
