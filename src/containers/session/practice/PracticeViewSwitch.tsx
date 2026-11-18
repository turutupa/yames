/**
 * Neck · Runway · Tab: what the practice screen shows, one picture at a time.
 *
 * On every practice screen, top right, with an icon and a word for each
 * (owner, 2026-11-17: "there's no visible layout switch"). In a warm-up or a
 * timed block it stays live while the click runs, and V goes round it; in a
 * graded Take it locks once the Take starts, so each Take has one view.
 * Whatever is chosen is kept as the default for the next screen.
 */
import { useTranslation } from "react-i18next";
import { PRACTICE_VIEWS } from "../highway/runwayModel";
import type { PracticeView } from "../highway/runwayModel";

const ICONS: Record<PracticeView, JSX.Element> = {
  neck: (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="1" y="4" width="14" height="8" rx="1" />
      <path d="M5 4v8M9 4v8M13 4v8" />
    </svg>
  ),
  runway: (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M3 2v12M1 5h14M1 11h14" />
      <circle cx="9" cy="5" r="1.6" fill="currentColor" />
      <circle cx="13" cy="11" r="1.6" fill="currentColor" />
    </svg>
  ),
  tab: (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M1 4h14M1 8h14M1 12h14" />
    </svg>
  ),
};

export function PracticeViewSwitch({
  view,
  onChange,
  locked,
  keyLabel,
}: {
  view: PracticeView;
  onChange: (next: PracticeView) => void;
  /** A graded Take is running: the view it started with is the view it keeps. */
  locked: boolean;
  /** The key that goes round the views (V unless remapped), for the tooltip. */
  keyLabel?: string;
}) {
  const { t } = useTranslation();
  return (
    <div
      className="session-viewswitch"
      role="radiogroup"
      aria-label={t("session.view.label")}
      title={locked ? t("session.view.between") : keyLabel ? t("session.view.keyHint", { key: keyLabel }) : undefined}
      aria-disabled={locked || undefined}
      data-locked={locked ? "" : undefined}
      data-testid="practice-view"
    >
      {/* Locked while a Take runs, and it looks it: a padlock, a dashed
          edge, every option quiet (QA 2026-11-17 #20). */}
      {locked && (
        <svg className="session-viewswitch-lock" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor" />
          <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      )}
      {PRACTICE_VIEWS.map((v) => (
        <button
          key={v}
          role="radio"
          aria-checked={view === v}
          data-on={view === v ? "" : undefined}
          disabled={locked}
          onClick={() => onChange(v)}
          title={locked ? undefined : t(`session.view.${v}`)}
          data-testid={`practice-view-${v}`}
        >
          {ICONS[v]}
          <span>{t(`session.view.${v}`)}</span>
        </button>
      ))}
    </div>
  );
}
