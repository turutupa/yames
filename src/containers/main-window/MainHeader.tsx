import { useEffect, useRef, type Ref } from "react";
import { useTranslation } from "react-i18next";
import { setSoundType, setVolume, showFloating } from "../../ipc";
import { markWidgetOpened } from "../onboarding/hints/hintRuntime";
import { SOUND_TYPES } from "../../constants/metronome";
import type { AppState } from "../../types";
import { IS_MAC } from "../../hotkeys";

/** Custom vertical fader — replaces <input type="range"> to avoid WebKit
 *  performance issues with writing-mode on range inputs. Uses pointer capture
 *  for reliable drag tracking even when cursor leaves the element. */
function VolumeFader({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number; // 0–100
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef<HTMLSpanElement>(null);
  const dragging = useRef(false);
  const cachedRect = useRef<DOMRect | null>(null);
  const pendingY = useRef<number | null>(null);
  const rafId = useRef<number>(0);

  useEffect(() => {
    if (fillRef.current) fillRef.current.style.height = `${value}%`;
    if (valueRef.current) valueRef.current.textContent = String(value);
  }, [value]);

  function calcValue(clientY: number): number {
    const rect = cachedRect.current!;
    const ratio = 1 - Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    return Math.round(ratio * 100);
  }

  function updateDisplay(v: number) {
    if (fillRef.current) fillRef.current.style.height = `${v}%`;
    if (valueRef.current) valueRef.current.textContent = String(v);
  }

  return (
    <div className={`volume-fader${disabled ? " volume-fader-disabled" : ""}`}>
      <span ref={valueRef} className="volume-fader-value">{value}</span>
      <div
        ref={trackRef}
        className="volume-fader-track"
        style={{ cursor: disabled ? "not-allowed" : "grab", touchAction: "none" }}
        onPointerDown={(e) => {
          if (disabled) return;
          e.preventDefault();
          dragging.current = true;
          cachedRect.current = trackRef.current!.getBoundingClientRect();
          (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
          e.currentTarget.style.cursor = "grabbing";
          updateDisplay(calcValue(e.clientY));
        }}
        onPointerMove={(e) => {
          if (!dragging.current) return;
          // Coalesce rapid pointer events — only repaint once per animation frame
          pendingY.current = e.clientY;
          if (!rafId.current) {
            rafId.current = requestAnimationFrame(() => {
              rafId.current = 0;
              if (pendingY.current !== null) updateDisplay(calcValue(pendingY.current));
            });
          }
        }}
        onPointerUp={(e) => {
          if (!dragging.current) return;
          dragging.current = false;
          cancelAnimationFrame(rafId.current);
          rafId.current = 0;
          e.currentTarget.style.cursor = "grab";
          const v = calcValue(e.clientY);
          updateDisplay(v);
          onChange(v / 100);
        }}
      >
        <div ref={fillRef} className="volume-fader-fill" style={{ height: `${value}%` }} />
      </div>
      <span className="volume-fader-label">{label}</span>
    </div>
  );
}

export type MainView = "beat" | "drill" | "track" | "settings";

interface MainHeaderProps {
  state: AppState;
  view: MainView;
  setView: (v: MainView) => void;
  prevTab: { current: "beat" | "drill" | "track" };
  setIsFullscreen: (v: boolean) => void;
  soundOpen: boolean;
  setSoundOpen: (v: boolean | ((p: boolean) => boolean)) => void;
  soundDropdownRef: Ref<HTMLDivElement>;
  shareRef: Ref<HTMLDivElement>;
  shareBtnRef: Ref<HTMLButtonElement>;
  shareOpen: boolean;
  setShareOpen: (v: boolean | ((p: boolean) => boolean)) => void;
  shareTooltip: boolean;
  volumePercent: number;
  /** TTS playback gain, 0..1 — kept in the same popover as the metronome
   *  slider so the user can balance the two in one place. */
  ttsVolume: number;
  setTtsVolume: (v: number) => void;
  /** When true, the voice slider is interactive. The component is always
   *  rendered (even when the coach is off) so the feature is discoverable;
   *  it just disables the control until brain + voice are ready. */
  voiceEnabled: boolean;
}

/**
 * Top-of-window header — tab bar (Metronome / Drill / Pocket Check),
 * plus the right-side action cluster (zen, sound dropdown, volume,
 * widget, share, settings toggle). Settings toggle swaps to a back/X
 * icon when already on the settings view and remembers the last "real"
 * tab via `prevTab` so closing settings returns to where the user was.
 *
 * All state lives in the parent — this is just presentation + callbacks.
 */
export function MainHeader({
  state,
  view,
  setView,
  prevTab,
  setIsFullscreen,
  soundOpen,
  setSoundOpen,
  soundDropdownRef,
  shareRef,
  shareBtnRef,
  shareOpen,
  setShareOpen,
  shareTooltip,
  volumePercent,
  ttsVolume,
  setTtsVolume,
  voiceEnabled,
}: MainHeaderProps) {
  const { t } = useTranslation();
  const ttsVolumePercent = Math.round(ttsVolume * 100);

  return (
    <header
      className="main-header"
      {...(!IS_MAC && { "data-tauri-drag-region": "" })}
    >
      {view !== "settings" && (
        <nav className="tab-bar">
          <button
            className={`tab-btn ${view === "beat" ? "active" : ""}`}
            onClick={() => setView("beat")}
            aria-label={t("nav.metronome")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
            <span className="tab-label">{t("nav.metronome")}</span>
          </button>
          <button
            className={`tab-btn ${view === "drill" ? "active" : ""}`}
            onClick={() => setView("drill")}
            aria-label={t("nav.drill")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            <span className="tab-label">{t("nav.drill")}</span>
          </button>
          <button
            className={`tab-btn ${view === "track" ? "active" : ""}`}
            onClick={() => setView("track")}
            aria-label={t("nav.pocketCheck")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="22" />
              <line x1="8" y1="22" x2="16" y2="22" />
            </svg>
            <span className="tab-label">{t("nav.pocketCheck")}</span>
          </button>
        </nav>
      )}
      <div className="header-actions">
        {view !== "settings" && view !== "track" && (
          <button
            className="header-btn"
            onClick={() => setIsFullscreen(true)}
            data-tooltip={t("tooltip.zen")}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 22c4-4 8-7.5 8-12a8 8 0 1 0-16 0c0 4.5 4 8 8 12z" />
              <path d="M12 2v20" />
              <path d="M4.5 10c2.5 1 5 1 7.5 0s5-1 7.5 0" />
            </svg>
          </button>
        )}
        {view !== "track" && (
          <div className="header-sound-wrap" ref={soundDropdownRef}>
            <button
              className="header-btn"
              onClick={() => setSoundOpen(!soundOpen)}
              data-tooltip={t(`sound.${SOUND_TYPES.find((s) => s.id === state.soundType)?.id ?? "click"}`)}
            >
              <span className="header-sound-icon">{SOUND_TYPES.find((s) => s.id === state.soundType)?.icon ?? "○"}</span>
            </button>
            {soundOpen && (
              <div className="header-sound-menu">
                {SOUND_TYPES.map((st) => (
                  <button
                    key={st.id}
                    className={`sub-dropdown-item ${state.soundType === st.id ? "active" : ""}`}
                    onClick={() => {
                      setSoundType(st.id);
                      setSoundOpen(false);
                    }}
                  >
                    <span className="sub-dropdown-icon">{st.icon}</span>
                    <span>{t(`sound.${st.id}`)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="header-volume-wrap">
          <button className="header-btn header-volume-btn">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              {state.volume > 0 && <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />}
              {state.volume > 0.5 && (
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              )}
            </svg>
          </button>
          <div className="header-volume-popover">
            <VolumeFader
              label={t("volume.metronome")}
              value={volumePercent}
              onChange={(v) => setVolume(v)}
            />
            <div
              data-tooltip={
                voiceEnabled
                  ? undefined
                  : t("tooltip.enableVoice")
              }
            >
              <VolumeFader
                label={t("volume.voice")}
                value={ttsVolumePercent}
                onChange={(v) => setTtsVolume(v)}
                disabled={!voiceEnabled}
              />
            </div>
          </div>
        </div>
        <button
          className="header-btn"
          data-hint="widget-discover"
          onClick={() => {
            // The `widget-discover` hint stops offering itself once the user
            // has found the widget on their own.
            void markWidgetOpened();
            showFloating();
          }}
          data-tooltip={t("tooltip.openWidget")}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="2" y="2" width="20" height="20" rx="2" />
            <rect x="10" y="10" width="10" height="10" rx="1" />
          </svg>
        </button>
        <div className="header-share-wrap" ref={shareRef}>
          <button
            ref={shareBtnRef}
            className="header-btn"
            onClick={() => setShareOpen(!shareOpen)}
            data-tooltip={
              shareTooltip ? t("tooltip.copied") : !shareOpen ? t("tooltip.share") : undefined
            }
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
          </button>
        </div>
        <button
          className={`header-btn ${view === "settings" ? "active" : ""}`}
          data-hint="midi-plugged"
          onClick={() => {
            if (view === "settings") {
              setView(prevTab.current);
            } else {
              prevTab.current = view as "beat" | "drill" | "track";
              setView("settings");
            }
          }}
          data-tooltip={view === "settings" ? t("tooltip.back") : t("tooltip.settings")}
        >
          {view === "settings" ? (
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          ) : (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          )}
        </button>
      </div>
    </header>
  );
}
