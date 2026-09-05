import { useEffect, useRef, type Ref } from "react";
import { useTranslation } from "react-i18next";
import { setSoundType, setVolume } from "../../ipc";
import { SOUND_TYPES } from "../../constants/metronome";
import type { AppState, Preset } from "../../types";
import { PresetSaveBar } from "../../components/presets/PresetSaveBar";
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

export type MainView = "beat" | "drill" | "settings";

interface MainHeaderProps {
  state: AppState;
  view: MainView;
  /** Preset context — the header is also the context bar (UI_DECISIONS U1.4). */
  activePreset: Preset | null;
  presetDirty: boolean;
  updateFeedback: boolean;
  onRenamePreset: (presetId: string) => void;
  onUpdatePreset: () => void;
  onSavePreset: () => void;
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
  /**
   * The `?` button. O6 wires it straight to the spotlight tour; O8 will turn
   * it into the Help menu (tour / run setup again / shortcuts / …), so it is
   * deliberately a plain button with one callback and no menu state of its own.
   * Optional so other mounts of the header keep working without it.
   */
  onOpenHelp?: () => void;
}

/**
 * The context bar along the top of the window.
 *
 * Navigation left here in Phase B: modes, Zen and Settings live in the rail
 * now (UI_DECISIONS U1.1, U1.5). What remains is context — which preset is
 * loaded and whether it is edited — and the output cluster: sound set,
 * volume, widget, share, help.
 *
 * All state lives in the parent; this is presentation and callbacks.
 */
export function MainHeader({
  state,
  view,
  activePreset,
  presetDirty,
  updateFeedback,
  onRenamePreset,
  onUpdatePreset,
  onSavePreset,
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
  onOpenHelp,
}: MainHeaderProps) {
  const { t } = useTranslation();
  const ttsVolumePercent = Math.round(ttsVolume * 100);

  return (
    <header
      className="main-header"
      {...(!IS_MAC && { "data-tauri-drag-region": "" })}
    >
      <div className="header-context">
        {(view === "beat" || view === "drill") && (
          <PresetSaveBar
            activePreset={activePreset}
            presetDirty={presetDirty}
            updateFeedback={updateFeedback}
            onRename={onRenamePreset}
            onUpdate={onUpdatePreset}
            onSave={onSavePreset}
          />
        )}
      </div>
      <div className="header-actions">
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
        {onOpenHelp && view !== "settings" && (
          <button
            className="header-btn"
            onClick={onOpenHelp}
            data-tooltip={t("tooltip.help")}
            aria-label={t("tooltip.help")}
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
              <circle cx="12" cy="12" r="10" />
              <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </button>
        )}
      </div>
    </header>
  );
}
