import { useTranslation } from "react-i18next";

interface FloatingPlayButtonProps {
  view: "beat" | "drill";
  isPlaying: boolean;
  speedRampActive: boolean;
  isPulsing: boolean;
  onTogglePlayback: () => void;
  onStartSpeedRamp: () => void;
  onStopSpeedRamp: () => void;
}

/**
 * The bottom-right "Play / Stop" pill that floats above the main content on
 * the Metronome and Drill tabs. Uses the same icons & label, but switches
 * action depending on which tab is active (drill uses speed-ramp, beat uses
 * togglePlayback). Pulse class flashes briefly on every downbeat when
 * `button-flash` is enabled.
 */
export function FloatingPlayButton({
  view,
  isPlaying,
  speedRampActive,
  isPulsing,
  onTogglePlayback,
  onStartSpeedRamp,
  onStopSpeedRamp,
}: FloatingPlayButtonProps) {
  const { t } = useTranslation();
  const isActive = view === "drill" ? speedRampActive : isPlaying;
  return (
    <button
      className={`floating-play-btn ${
        isPlaying || speedRampActive ? "playing" : ""
      } ${isPulsing ? "pulse" : ""}`}
      onClick={() => {
        if (view === "drill") {
          if (speedRampActive) onStopSpeedRamp();
          else onStartSpeedRamp();
        } else {
          onTogglePlayback();
        }
      }}
    >
      {isActive ? (
        <>
          <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
            <rect x="2" y="2" width="12" height="12" rx="1.5" />
          </svg>{" "}
          {t("common.stop")}
        </>
      ) : (
        <>
          <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4 2.5a.5.5 0 0 1 .77-.42l9 5.5a.5.5 0 0 1 0 .84l-9 5.5A.5.5 0 0 1 4 13.5z" />
          </svg>{" "}
          {t("common.play")}
        </>
      )}
    </button>
  );
}
