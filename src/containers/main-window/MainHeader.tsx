import { useEffect, useRef, useState, type Ref } from "react";
import { useTranslation } from "react-i18next";
import { setSoundType, setVolume } from "../../ipc";
import { SOUND_TYPES } from "../../constants/metronome";
import type { AppState, Setlist, Preset } from "../../types";
import type { Jam } from "../../jam/types";
import { PresetSaveBar } from "../../components/presets/PresetSaveBar";
import { SetlistSaveBar } from "../../components/setlist/SetlistSaveBar";
import { JamSaveBar } from "../../components/jam/JamSaveBar";
import { IS_MAC } from "../../hotkeys";

/**
 * A volume, as one of the context bar's chips: label, then a bar you drag.
 *
 * This replaces a hover popover holding two tall faders. The owner's
 * objection was the obvious one — the chip already DREW a level bar, so it
 * showed you the value and made you hover to change it, which is the worst of
 * both. Now the bar is the control.
 *
 * `input[type=range]`, deliberately, where the popover's faders were hand-made
 * divs. The note they carried said range inputs were avoided for "WebKit
 * performance issues with writing-mode" — that is a VERTICAL range problem,
 * and these are horizontal, so it does not apply. What the real input buys is
 * everything the hand-made one had to leave out: arrow keys, Home/End,
 * `aria-valuenow`, and a disabled state the platform understands. `isTypingTarget`
 * already classes a range as non-typing, so hotkeys keep working while one has
 * focus (that was a real bug once, with the tempo ruler).
 */
function VolumeChip({
  icon,
  label,
  name,
  value,
  onChange,
  disabled = false,
  disabledHint,
}: {
  icon: React.ReactNode;
  /** The short word on the chip — shed first when the window narrows. */
  label: string;
  /** The full name, for assistive tech and the tooltip. */
  name: string;
  value: number; // 0–100
  /** Receives 0–1, matching `setVolume` and `setTtsVolume`. */
  onChange: (v: number) => void;
  disabled?: boolean;
  /** Why it is disabled. Shown instead of the reading. */
  disabledHint?: string;
}) {
  return (
    <div
      className={`context-chip context-chip-volume${disabled ? " context-chip-volume-off" : ""}`}
      // The reading lives in the tooltip because the bar has no room for a
      // number, and a bar with no number is unreadable at a glance below
      // about a quarter full.
      data-tooltip={disabled ? disabledHint : `${name} · ${value}%`}
    >
      {icon}
      <span className="context-chip-label">{label}</span>
      <input
        type="range"
        className="context-chip-range"
        min={0}
        max={100}
        step={1}
        value={value}
        disabled={disabled}
        aria-label={name}
        onChange={(e) => onChange(Number(e.currentTarget.value) / 100)}
        // Drives the track's fill, so the painted level and the value can
        // never disagree.
        style={{ "--level": `${value}%` } as React.CSSProperties}
      />
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

/* Speech, not a microphone: the input chip two along already uses a mic, and
   two mics in one row would read as two halves of the same setting. */
function VoiceIcon() {
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
      <path d="M4 9v6" />
      <path d="M8 5v14" />
      <path d="M12 8v8" />
      <path d="M16 4v16" />
      <path d="M20 10v4" />
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

/**
 * `setlist` is a MODE, not a corner of the metronome.
 *
 * It lived inside `beat` first, on the argument that a setlist is the same
 * metronome pointed at a routine. What settled it the other way is what the
 * rail already means by a mode — a stage of its own, a transport verb of its
 * own, and a library of its own — and a setlist had all three while pretending
 * to be a fourth kind of thing on somebody else's tab.
 *
 * Configuring one is also the DRILL's flow rather than the metronome's: you
 * write a plan out as sentences and press Start, and it runs itself and
 * changes tempo as it goes. The metronome is knobs and a click.
 */
export type MainView = "beat" | "drill" | "setlist" | "jam" | "settings";

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
  /** A loaded setlist takes the context bar's left half (U9.4). */
  activeSetlist: Setlist | null;
  setlistDirty: boolean;
  setlistSaveFeedback: boolean;
  onSaveSetlist: () => void;
  onRevertSetlist: () => void;
  onRenameSetlist: () => void;
  /** A loaded jam takes the same half of the bar, on its own tab. */
  activeJam?: Jam | null;
  jamDirty?: boolean;
  jamSaveFeedback?: boolean;
  onSaveJam?: () => void;
  onRevertJam?: () => void;
  onRenameJam?: () => void;
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
  activeSetlist,
  setlistDirty,
  setlistSaveFeedback,
  onSaveSetlist,
  onRevertSetlist,
  onRenameSetlist,
  activeJam = null,
  jamDirty = false,
  jamSaveFeedback = false,
  onSaveJam,
  onRevertJam,
  onRenameJam,
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
        {/* Each tab's own object. The setlist tab answers "what am I looking
            at" with a setlist; the metronome and drill tabs answer with a
            preset. This used to read `view === "beat" && activeSetlist`,
            because a setlist was something you opened ON the metronome tab —
            and when setlists became a mode the bar stopped rendering at all,
            which left no way to save a setlist except the modal that catches
            you on the way out. */}
        {view === "jam" && activeJam ? (
          <JamSaveBar
            jam={activeJam}
            dirty={jamDirty}
            saveFeedback={jamSaveFeedback}
            onRename={() => onRenameJam?.()}
            onSave={() => onSaveJam?.()}
            onRevert={() => onRevertJam?.()}
          />
        ) : view === "setlist" && activeSetlist ? (
          <SetlistSaveBar
            setlist={activeSetlist}
            dirty={setlistDirty}
            saveFeedback={setlistSaveFeedback}
            onRename={onRenameSetlist}
            onSave={onSaveSetlist}
            onRevert={onRevertSetlist}
          />
        ) : (
          (view === "beat" || view === "drill") && (
            <PresetSaveBar
              activePreset={activePreset}
              presetDirty={presetDirty}
              updateFeedback={updateFeedback}
              onRename={onRenamePreset}
              onUpdate={onUpdatePreset}
              onSave={onSavePreset}
              onRevert={onRevertPreset}
            />
          )
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

        {/* Both volumes, on the bar. They were one chip and a hover popover;
            the owner's case for bringing the voice out was that dropping into
            Settings to balance the coach against the click is a trip you make
            mid-practice. The voice chip is always rendered so the feature is
            discoverable, and disabled with a reason until brain and voice are
            ready — the same rule the popover's fader followed. */}
        <VolumeChip
          icon={<SpeakerIcon />}
          label={t("volume.short")}
          name={t("volume.metronome")}
          value={volumePercent}
          onChange={setVolume}
        />
        <VolumeChip
          icon={<VoiceIcon />}
          label={t("volume.voice")}
          name={t("volume.voice")}
          value={ttsVolumePercent}
          onChange={setTtsVolume}
          disabled={!voiceEnabled}
          disabledHint={t("tooltip.enableVoice")}
        />

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
