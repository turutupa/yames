import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

/** Settings → Coach's five groups (DESIGN 8; leg c6a), in this order. */
export type CoachGroupId = "answers" | "voice" | "suggestions" | "notebook" | "tools";

/** One group of Settings → Coach: its heading, then its rows. */
export function CoachGroup({ id, children }: { id: CoachGroupId; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="coach-settings-group" data-coach-group={id} role="group" aria-labelledby={`coach-group-${id}`}>
      <h3 className="settings-subhead" id={`coach-group-${id}`}>
        {t(`settings.coach.groups.${id}`)}
      </h3>
      {children}
    </div>
  );
}
