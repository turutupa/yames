import { useTranslation } from "react-i18next";

interface TransportProps {
  view: "beat" | "drill";
  isPlaying: boolean;
  speedRampActive: boolean;
  isPulsing: boolean;
  /** 1-based bar count since playback started. */
  bar: number;
  elapsedSeconds: number;
  /** Audio input is on and the coach is listening to it. */
  listening: boolean;
  hasSignal: boolean;
  playShortcut?: string;
  onTogglePlayback: () => void;
  onStartSpeedRamp: () => void;
  onStopSpeedRamp: () => void;
}

function clock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * The docked transport (UI_DECISIONS U1.2) — the same bar on every screen,
 * along the bottom of the content region.
 *
 * It replaces the play button that floated over the content, which on the
 * Drill tab covered the bottom rows of the step grid. Docking it also gives
 * the bar count and elapsed time somewhere permanent to live: both were only
 * ever visible inside a screen that chose to draw them.
 *
 * Play means different things per mode — the drill starts a ramp, the
 * metronome starts the click — and that difference stays here rather than
 * leaking into either screen.
 */
export function Transport({
  view,
  isPlaying,
  speedRampActive,
  isPulsing,
  bar,
  elapsedSeconds,
  listening,
  hasSignal,
  playShortcut,
  onTogglePlayback,
  onStartSpeedRamp,
  onStopSpeedRamp,
}: TransportProps) {
  const { t } = useTranslation();
  const running = view === "drill" ? speedRampActive : isPlaying;
  const anyRunning = isPlaying || speedRampActive;

  return (
    <div className="transport" data-running={anyRunning ? "" : undefined}>
      <button
        className={`transport-play ${anyRunning ? "playing" : ""} ${isPulsing ? "pulse" : ""}`}
        onClick={() => {
          if (view === "drill") {
            if (speedRampActive) onStopSpeedRamp();
            else onStartSpeedRamp();
          } else {
            onTogglePlayback();
          }
        }}
      >
        {running ? (
          <>
            <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
              <rect x="2" y="2" width="12" height="12" rx="1.5" />
            </svg>
            {t("common.stop")}
          </>
        ) : (
          <>
            <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4 2.5a.5.5 0 0 1 .77-.42l9 5.5a.5.5 0 0 1 0 .84l-9 5.5A.5.5 0 0 1 4 13.5z" />
            </svg>
            {t("common.play")}
          </>
        )}
      </button>

      {playShortcut && <kbd className="transport-key">{playShortcut}</kbd>}

      <div className="transport-readouts">
        <div className="transport-readout">
          <span className="transport-value">{anyRunning ? bar : "—"}</span>
          <span className="transport-label">{t("transport.bar")}</span>
        </div>
        <div className="transport-readout">
          <span className="transport-value">{clock(elapsedSeconds)}</span>
          <span className="transport-label">{t("transport.elapsed")}</span>
        </div>
      </div>

      <div className="transport-spacer" />

      <div className={`transport-input ${listening ? "listening" : ""}`}>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5.5 12a6.5 6.5 0 0 0 13 0" />
          <line x1="12" y1="18.5" x2="12" y2="21" />
        </svg>
        <span>{listening ? t("transport.listening") : t("transport.inputOff")}</span>
        {listening && (
          <span className={`transport-signal ${hasSignal ? "on" : ""}`} aria-hidden="true" />
        )}
      </div>
    </div>
  );
}
