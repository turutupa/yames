import { useEffect, useRef, useState, type Ref } from "react";
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

/* ─── Chip icons ──────────────────────────────────────────────────────────
 * Small, stroke-based and sized to sit beside 12.5px text. They carry no
 * meaning on their own — every chip is labelled — so they are aria-hidden. */

function SpeakerIcon() {
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
      aria-hidden="true"
    >
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
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
      aria-hidden="true"
    >
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 12a6.5 6.5 0 0 0 13 0" />
      <line x1="12" y1="18.5" x2="12" y2="21" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

function ShareGlyph() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}

function HelpGlyph() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
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
  /** Reload the active preset's stored values, throwing away the edits. */
  onRevertPreset?: () => void;
  soundOpen: boolean;
  setSoundOpen: (v: boolean | ((p: boolean) => boolean)) => void;
  soundDropdownRef: Ref<HTMLDivElement>;
  /** The overflow button doubles as the share popover's anchor — see the
   *  note at the foot of the component. */
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
  /** Audio input is on. Status only — what turns it on lives elsewhere. */
  listening?: boolean;
  /**
   * The `?` button. O6 wires it straight to the spotlight tour; O8 will turn
   * it into the Help menu (tour / run setup again / shortcuts / …), so it is
   * deliberately a plain button with one callback and no menu state of its own.
   * Optional so other mounts of the header keep working without it.
   */
  onOpenHelp?: () => void;
}

/**
 * The context bar — the second of the shell's four fixed frames, between the
 * rail and the stage it sits above.
 *
 * Navigation left here in Phase B: modes, Zen and Settings live in the rail
 * now (UI_DECISIONS U1.1, U1.5). What remains is context on the left — which
 * preset is loaded, whether it is edited, and what to do about that — and the
 * output chips on the right: sound set, volume, audio input, and an overflow
 * holding share and help.
 *
 * The chips are labelled (U1.4). Seven identical circles told you nothing
 * about what was behind them; a chip that says "Wood" does. The labels are
 * the first thing shed when the window narrows, then the input chip — which
 * is a readout the transport also carries — and the preset context last.
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
  onRevertPreset,
  soundOpen,
  setSoundOpen,
  soundDropdownRef,
  shareBtnRef,
  shareOpen,
  setShareOpen,
  shareTooltip,
  volumePercent,
  ttsVolume,
  setTtsVolume,
  voiceEnabled,
  listening = false,
  onOpenHelp,
}: MainHeaderProps) {
  const { t } = useTranslation();
  const ttsVolumePercent = Math.round(ttsVolume * 100);
  const soundName = t(`sound.${SOUND_TYPES.find((s) => s.id === state.soundType)?.id ?? "click"}`);

  // The overflow's own open state. Share keeps living in the parent because
  // the popover is rendered there, at the window level; the menu that offers
  // it does not need to.
  const [moreOpen, setMoreOpen] = useState(false);
  const moreWrapRef = useRef<HTMLDivElement>(null);
  const helpAvailable = !!onOpenHelp && view !== "settings";

  useEffect(() => {
    if (!moreOpen) return;
    const onDown = (e: MouseEvent) => {
      if (moreWrapRef.current?.contains(e.target as Node)) return;
      setMoreOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoreOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [moreOpen]);

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
            onRevert={onRevertPreset}
          />
        )}
      </div>
      <div className="header-actions">
        <div className="header-sound-wrap" ref={soundDropdownRef}>
          <button
            className={`context-chip${soundOpen ? " context-chip-open" : ""}`}
            onClick={() => setSoundOpen(!soundOpen)}
            aria-haspopup="menu"
            aria-expanded={soundOpen}
            aria-label={soundName}
            data-tooltip={soundOpen ? undefined : soundName}
          >
            <SpeakerIcon />
            <span className="context-chip-label">{soundName}</span>
          </button>
          {soundOpen && (
            <div className="header-sound-menu" role="menu">
              {SOUND_TYPES.map((st) => (
                <button
                  key={st.id}
                  role="menuitem"
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
          {/* The chip is the popover's handle, not a control of its own: the
              two faders inside it are what change anything. It stays a button
              so it is reachable from the keyboard, which opens the popover
              through :focus-within. */}
          <button
            className="context-chip context-chip-volume"
            aria-label={t("volume.metronome")}
          >
            <span className="context-chip-label">{t("volume.short")}</span>
            <span className="context-chip-level" aria-hidden="true">
              <span
                className="context-chip-level-fill"
                style={{ width: `${volumePercent}%` }}
              />
            </span>
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

        {/* A readout, not a switch — nothing in the bar turns the input on,
            so the chip does not pretend to. */}
        <div
          className={`context-chip context-chip-static context-chip-input${listening ? " listening" : ""}`}
          role="status"
        >
          <MicIcon />
          <span className="context-chip-label">
            {listening ? t("transport.listening") : t("transport.inputOff")}
          </span>
        </div>

        <div className="header-more-wrap" ref={moreWrapRef}>
          <button
            ref={shareBtnRef}
            className={`context-chip context-chip-icon${moreOpen ? " context-chip-open" : ""}`}
            onClick={() => {
              // Opening the menu closes the share popover it launched, so the
              // two never overlap on the same anchor.
              setShareOpen(false);
              setMoreOpen((o) => !o);
            }}
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            aria-label={t("tooltip.more")}
            data-tooltip={
              shareTooltip
                ? t("tooltip.copied")
                : !shareOpen && !moreOpen
                  ? t("tooltip.more")
                  : undefined
            }
          >
            <MoreIcon />
          </button>
          {moreOpen && (
            <div className="header-more-menu" role="menu">
              <button
                role="menuitem"
                className="sub-dropdown-item"
                onClick={() => {
                  setMoreOpen(false);
                  setShareOpen(true);
                }}
              >
                <ShareGlyph />
                <span>{t("tooltip.share")}</span>
              </button>
              {helpAvailable && (
                <button
                  role="menuitem"
                  className="sub-dropdown-item"
                  onClick={() => {
                    setMoreOpen(false);
                    onOpenHelp?.();
                  }}
                >
                  <HelpGlyph />
                  <span>{t("tooltip.help")}</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      {/* The share popover anchors to the overflow button (see MainWindow),
          which is why that button — not a share button of its own — carries
          `shareBtnRef`. */}
    </header>
  );
}
