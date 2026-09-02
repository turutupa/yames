/**
 * The one-time tour offer for an existing user (O1's `migratedExistingUser`).
 *
 * They already have the app set up, so the wizard would be an insult; a small
 * toast that can be ignored is the whole intervention. Either button records
 * `tour.seenVersion`, so it is genuinely one-time.
 */
import { useTranslation } from "react-i18next";

export type TourOfferToastProps = {
  onAccept: () => void;
  onDismiss: () => void;
  /**
   * False suppresses the entrance animation. `tour.css` covers the OS
   * `prefers-reduced-motion` setting; this covers the app's own
   * `viewTransitions` preference, which CSS cannot see (O8 motion audit).
   */
  animate?: boolean;
};

export function TourOfferToast({
  onAccept,
  onDismiss,
  animate = true,
}: TourOfferToastProps) {
  const { t } = useTranslation();
  return (
    <div
      className={`tour-offer${animate ? "" : " no-motion"}`}
      role="status"
      data-testid="tour-offer"
    >
      <span className="tour-offer-text">{t("onboarding.tour.offer")}</span>
      <button type="button" className="tour-offer-accept" onClick={onAccept}>
        {t("onboarding.tour.offerAccept")}
      </button>
      <button
        type="button"
        className="tour-offer-dismiss"
        onClick={onDismiss}
        aria-label={t("onboarding.tour.offerDismiss")}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        >
          <line x1="6" y1="6" x2="18" y2="18" />
          <line x1="18" y1="6" x2="6" y2="18" />
        </svg>
      </button>
    </div>
  );
}
