/**
 * The toast half of `useVoicePrompt` (O4): the coach's voices just finished
 * downloading, so offer the one choice W4 left open. Same pill as the tour
 * offer — a suggestion that can be ignored, never a modal.
 */
import { useTranslation } from "react-i18next";

export type CoachVoiceToastProps = {
  onAccept: () => void;
  onDismiss: () => void;
};

export function CoachVoiceToast({ onAccept, onDismiss }: CoachVoiceToastProps) {
  const { t } = useTranslation();
  return (
    <div className="coach-voice-offer" role="status" data-testid="coach-voice-offer">
      <span className="coach-voice-offer-text">
        {t("onboarding.coach.voiceReady")}
      </span>
      <button type="button" className="coach-voice-offer-accept" onClick={onAccept}>
        {t("onboarding.coach.voicePick")}
      </button>
      <button
        type="button"
        className="coach-voice-offer-dismiss"
        onClick={onDismiss}
        aria-label={t("onboarding.coach.voiceDismiss")}
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
