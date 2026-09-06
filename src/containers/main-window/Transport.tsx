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
  /** Drill only — the tempo the ramp begins at, and its two run switches. */
  startBpm: number;
  countIn: boolean;
  loop: boolean;
  onToggleCountIn: () => void;
  onToggleLoop: () => void;
  onTogglePlayback: () => void;
  onStartSpeedRamp: () => void;
  onStopSpeedRamp: () => void;
}

function clock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function CoachIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12a8 8 0 1 0-3.1 6.3L21 19z" />
      <line x1="9" y1="10" x2="9" y2="14" />
      <line x1="12.5" y1="8.5" x2="12.5" y2="15.5" />
      <line x1="16" y1="11" x2="16" y2="13" />
    </svg>
  );
}

function MicIcon() {
  return (
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
  );
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
 * leaking into either screen. The drill's version of the bar also carries the
 * two switches you decide immediately before pressing Start, count-in and
 * loop; they are the drill's own settings, handed down as props, not state
 * this component keeps.
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
  startBpm,
  countIn,
  loop,
  onToggleCountIn,
  onToggleLoop,
  onTogglePlayback,
  onStartSpeedRamp,
  onStopSpeedRamp,
}: TransportProps) {
  const { t } = useTranslation();
  const running = view === "drill" ? speedRampActive : isPlaying;
  const anyRunning = isPlaying || speedRampActive;

  return (
    <div
      className="transport"
      // The drill's bar carries two switches the metronome's does not, so the
      // two shed differently once the window is narrow. The CSS needs to know
      // which one it is looking at, and the readouts come before the drill
      // block — there is no previous-sibling selector to ask with.
      data-view={view}
      data-running={anyRunning ? "" : undefined}
    >
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
            {/* A drill is not played, it is run. The metronome's button starts
                a sound; this one starts an exercise that lasts four minutes
                and changes tempo on its own. */}
            {view === "drill" ? t("transport.start") : t("common.play")}
          </>
        )}
      </button>

      {playShortcut && <kbd className="transport-key">{playShortcut}</kbd>}

      <div className="transport-readouts">
        <div className="transport-readout">
          {/* At rest this said "—". You are always about to play bar one, and
              a dash is a value the counter never actually holds. */}
          <span className="transport-value">{anyRunning ? bar : 1}</span>
          <span className="transport-label">{t("transport.bar")}</span>
        </div>
        <div className="transport-readout">
          <span className="transport-value">{clock(elapsedSeconds)}</span>
          <span className="transport-label">{t("transport.elapsed")}</span>
        </div>
      </div>

      {view === "drill" && (
        <div className="transport-drill">
          <div className="transport-readout">
            <span className="transport-value">{startBpm}</span>
            <span className="transport-label">{t("transport.startsAt")}</span>
          </div>
          {/* Both switches write the drill's `speedRamp`, which is also where
              the settings form reads them from — one setting, two places to
              reach it, no second copy of the state. */}
          <button
            type="button"
            role="switch"
            aria-checked={countIn}
            className={`transport-switch ${countIn ? "on" : ""}`}
            onClick={onToggleCountIn}
          >
            <span className="transport-switch-track" aria-hidden="true" />
            {t("drill.countdown")}
          </button>
          <button
            type="button"
            role="switch"
            aria-checked={loop}
            className={`transport-switch ${loop ? "on" : ""}`}
            onClick={onToggleLoop}
          >
            <span className="transport-switch-track" aria-hidden="true" />
            {t("drill.cyclic")}
          </button>
        </div>
      )}

      <div className="transport-spacer" />

      {/* The right end of the bar, in three states.
       *
       * Once the coach is actually listening it is a live readout — the label
       * plus a signal lamp, which is the one place in the app that shows
       * whether sound is arriving. The context bar's input chip does not.
       *
       * Before that there is nothing live to report, so the mockup's sentence
       * takes the slot and explains what the coach is about to do. It is an
       * explanation, not a control; nothing here ever turned the input on.
       *
       * Except that below 920px the context bar sheds its input chip — on the
       * explicit grounds that the transport reports the same state — so the
       * compact readout has to come back at that width instead. The sentence
       * has no room there anyway. */}
      {listening ? (
        <div className="transport-input listening">
          <MicIcon />
          <span>{t("transport.listening")}</span>
          <span className={`transport-signal ${hasSignal ? "on" : ""}`} aria-hidden="true" />
        </div>
      ) : (
        <>
          <div className="transport-note">
            <CoachIcon />
            <span>
              {view === "drill" ? t("transport.coachQuiet") : t("transport.coachOnPlay")}
            </span>
          </div>
          <div className="transport-input transport-input-narrow">
            <MicIcon />
            <span>{t("transport.inputOff")}</span>
          </div>
        </>
      )}
    </div>
  );
}
