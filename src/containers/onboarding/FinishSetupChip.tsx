/**
 * "Finish setup" chip — the only trace the wizard leaves after the user takes
 * the "Just give me the click" path. Opens the wizard at W1; the × dismisses
 * it, and after two dismissals `useOnboarding` stops showing it at all.
 *
 * Rendered under the header rather than inside it: at the 480 px minimum
 * window the header's tab bar plus six action buttons leave no room for a
 * text pill.
 */
import { useTranslation } from "react-i18next";

export function FinishSetupChip({
  onOpen,
  onDismiss,
}: {
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="finish-setup-chip">
      <button
        type="button"
        className="finish-setup-chip-main"
        onClick={onOpen}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M5 12h14" />
          <path d="M13 6l6 6-6 6" />
        </svg>
        <span>{t("onboarding.chip.label")}</span>
      </button>
      <button
        type="button"
        className="finish-setup-chip-close"
        aria-label={t("onboarding.chip.dismiss")}
        onClick={onDismiss}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <line x1="6" y1="6" x2="18" y2="18" />
          <line x1="18" y1="6" x2="6" y2="18" />
        </svg>
      </button>
    </div>
  );
}
