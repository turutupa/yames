import { useMetronome } from "../hooks/useMetronome";
import { useDrag } from "../hooks/useDrag";
import { useState, useRef, useEffect, useCallback } from "react";
import { setBpm, setSubdivision, togglePlayback, setWidgetMode, setAlwaysOnTop, setAccentColor, setVolume, setSoundType, setTimeSignature, showFloating, onFullscreenChanged, setActiveTab, getActiveTab } from "../ipc";
import type { Subdivision, WidgetMode } from "../types";
import { TrainView } from "./TrainView";
import { TrackView } from "./TrackView";
import { FullscreenView } from "./FullscreenView";
import "../styles/main-window.css";

const SOUND_TYPES = [
  { id: "click", name: "Click", icon: "○" },
  { id: "wood", name: "Wood", icon: "◆" },
  { id: "beep", name: "Beep", icon: "◉" },
  { id: "drum", name: "Drum", icon: "◎" },
];

const TIME_SIGNATURES = [
  { beats: 0, label: "Never" },
  { beats: 1, label: "Always" },
  { beats: 2, label: "2/4" },
  { beats: 3, label: "3/4" },
  { beats: 4, label: "4/4" },
  { beats: 5, label: "5/4" },
  { beats: 6, label: "6/8" },
  { beats: 7, label: "7/8" },
];

const ACCENT_COLORS = [
  { name: "Rose",      hex: "#e94560", beatAccent: "#ff9eb0" },
  { name: "Coral",     hex: "#ff6b6b", beatAccent: "#ffb8b8" },
  { name: "Peach",     hex: "#ff9a76", beatAccent: "#ffd4b8" },
  { name: "Amber",     hex: "#f59e0b", beatAccent: "#fde68a" },
  { name: "Lime",      hex: "#84cc16", beatAccent: "#d9f99d" },
  { name: "Emerald",   hex: "#10b981", beatAccent: "#6ee7b7" },
  { name: "Teal",      hex: "#14b8a6", beatAccent: "#5eead4" },
  { name: "Cyan",      hex: "#06b6d4", beatAccent: "#67e8f9" },
  { name: "Sky",       hex: "#0ea5e9", beatAccent: "#7dd3fc" },
  { name: "Blue",      hex: "#3b82f6", beatAccent: "#93c5fd" },
  { name: "Indigo",    hex: "#6366f1", beatAccent: "#a5b4fc" },
  { name: "Violet",    hex: "#8b5cf6", beatAccent: "#c4b5fd" },
  { name: "Purple",    hex: "#a855f7", beatAccent: "#d8b4fe" },
  { name: "Fuchsia",   hex: "#d946ef", beatAccent: "#f0abfc" },
  { name: "Pink",      hex: "#ec4899", beatAccent: "#f9a8d4" },
  { name: "White",     hex: "#e2e8f0", beatAccent: "#ffffff" },
];

const TEMPO_MARKINGS: [number, string][] = [
  [20,  "Grave"],
  [40,  "Largo"],
  [45,  "Lento"],
  [55,  "Adagio"],
  [66,  "Adagietto"],
  [72,  "Andante"],
  [80,  "Andantino"],
  [84,  "Moderato"],
  [100, "Allegretto"],
  [112, "Allegro"],
  [132, "Vivace"],
  [140, "Presto"],
  [178, "Prestissimo"],
];

function getTempoMarking(bpm: number): string {
  for (let i = TEMPO_MARKINGS.length - 1; i >= 0; i--) {
    if (bpm >= TEMPO_MARKINGS[i][0]) return TEMPO_MARKINGS[i][1];
  }
  return TEMPO_MARKINGS[0][1];
}

const SUBDIVISION_LABELS: Record<Subdivision, string> = {
  1: "♩",
  2: "♫",
  3: "♪³",
  4: "♬",
  5: "♪⁵",
  6: "♬⁶",
};

const SUBDIVISION_NAMES: Record<Subdivision, string> = {
  1: "Quarter",
  2: "Eighth",
  3: "Triplet",
  4: "16th",
  5: "Quintuplet",
  6: "Sextuplet",
};

type HotkeyAction = "play" | "bpm-down" | "bpm-up" | "bpm-down-1" | "bpm-up-1" | "toggle-mode" | "toggle-view" | "fullscreen";

interface HotkeyEntry {
  action: string;
  key: string;
  id: HotkeyAction;
}

const HOTKEYS: HotkeyEntry[] = [
  { id: "play", action: "Play / Stop", key: "⌘⇧Space" },
  { id: "bpm-down", action: "BPM −5", key: "⌘⇧↓" },
  { id: "bpm-up", action: "BPM +5", key: "⌘⇧↑" },
  { id: "bpm-down-1", action: "BPM −1", key: "⌘⇧⌥↓" },
  { id: "bpm-up-1", action: "BPM +1", key: "⌘⇧⌥↑" },
  { id: "toggle-mode", action: "Toggle mode", key: "⌘⇧M" },
  { id: "toggle-view", action: "Settings / Widget", key: "⌘⇧O" },
];

export function MainWindow() {
  useDrag();
  const { state, currentBeat } = useMetronome();
  const [view, setViewRaw] = useState<"beat" | "train" | "track" | "settings">("beat");
  const prevTab = useRef<"beat" | "train" | "track">("beat");
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Persist tab changes and wrap setView
  const setView = useCallback((v: "beat" | "train" | "track" | "settings") => {
    setViewRaw(v);
    if (v !== "settings") {
      setActiveTab(v);
    }
  }, []);

  // Restore last active tab on mount
  useEffect(() => {
    getActiveTab().then((tab) => {
      if (tab === "beat" || tab === "train" || tab === "track") {
        setViewRaw(tab);
        prevTab.current = tab;
      }
    });
  }, []);
  const [subOpen, setSubOpen] = useState(false);
  const [soundOpen, setSoundOpen] = useState(false);
  const [keyBindings, setKeyBindings] = useState<Record<string, string>>(() =>
    Object.fromEntries(HOTKEYS.map((hk) => [hk.id, hk.key]))
  );
  const [footBindings, setFootBindings] = useState<Record<string, string>>({});
  const [bindingFor, setBindingFor] = useState<{ id: string; type: "key" | "foot" } | null>(null);
  const [editingBpm, setEditingBpm] = useState(false);
  const [bpmEditValue, setBpmEditValue] = useState("");
  const bpmInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const soundDropdownRef = useRef<HTMLDivElement>(null);

  const beatsPerMeasure = state.timeSignature >= 2 ? state.timeSignature : 2;
  const activeBeat = currentBeat ? currentBeat.beat % beatsPerMeasure : -1;
  const activeSub = currentBeat ? currentBeat.subdivision : -1;
  const isDownbeat = currentBeat?.isDownbeat ?? false;

  const handleBpmChange = (value: number) => {
    const clamped = Math.max(20, Math.min(300, value));
    setBpm(clamped);
  };

  const startBpmEdit = () => {
    setBpmEditValue(String(state.bpm));
    setEditingBpm(true);
    setTimeout(() => bpmInputRef.current?.select(), 0);
  };

  const commitBpmEdit = () => {
    const val = parseInt(bpmEditValue);
    if (!isNaN(val)) handleBpmChange(val);
    setEditingBpm(false);
  };

  // Close dropdown on outside click
  useEffect(() => {
    if (!subOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setSubOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [subOpen]);

  useEffect(() => {
    if (!soundOpen) return;
    const handler = (e: MouseEvent) => {
      if (soundDropdownRef.current && !soundDropdownRef.current.contains(e.target as Node)) {
        setSoundOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [soundOpen]);

  // Listen for fullscreen changes from Rust (global shortcut)
  useEffect(() => {
    const unlisten = onFullscreenChanged(() => {
      if (view !== "track") setIsFullscreen((prev) => !prev);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [view]);

  const [pendingKeys, setPendingKeys] = useState<string>("");

  // Key/footswitch binding listener
  const handleBinding = useCallback((e: KeyboardEvent) => {
    if (!bindingFor) return;
    e.preventDefault();
    if (e.key === "Escape") {
      setBindingFor(null);
      setPendingKeys("");
      return;
    }
    const parts: string[] = [];
    if (e.metaKey) parts.push("⌘");
    if (e.ctrlKey) parts.push("⌃");
    if (e.altKey) parts.push("⌥");
    if (e.shiftKey) parts.push("⇧");
    if (!["Meta", "Control", "Alt", "Shift"].includes(e.key)) {
      parts.push(e.key.length === 1 ? e.key.toUpperCase() : e.key);
    }
    // Show modifier-only combos as pending
    const combo = parts.join("");
    if (combo) {
      setPendingKeys(combo);
    }
    if (parts.length > 0 && !["Meta", "Control", "Alt", "Shift"].includes(e.key)) {
      if (bindingFor.type === "key") {
        setKeyBindings((prev) => ({ ...prev, [bindingFor.id]: combo }));
      } else {
        setFootBindings((prev) => ({ ...prev, [bindingFor.id]: combo }));
      }
      setBindingFor(null);
      setPendingKeys("");
    }
  }, [bindingFor]);

  const handleResetBinding = useCallback(() => {
    if (!bindingFor) return;
    const defaultKey = HOTKEYS.find((hk) => hk.id === bindingFor.id)?.key || "";
    if (bindingFor.type === "key") {
      setKeyBindings((prev) => ({ ...prev, [bindingFor.id]: defaultKey }));
    } else {
      setFootBindings((prev) => ({ ...prev, [bindingFor.id]: "" }));
    }
    setBindingFor(null);
    setPendingKeys("");
  }, [bindingFor]);

  const handleRemoveBinding = useCallback(() => {
    if (!bindingFor) return;
    if (bindingFor.type === "key") {
      setKeyBindings((prev) => ({ ...prev, [bindingFor.id]: "" }));
    } else {
      setFootBindings((prev) => ({ ...prev, [bindingFor.id]: "" }));
    }
    setBindingFor(null);
    setPendingKeys("");
  }, [bindingFor]);

  useEffect(() => {
    if (!bindingFor) return;
    document.addEventListener("keydown", handleBinding);
    return () => document.removeEventListener("keydown", handleBinding);
  }, [bindingFor, handleBinding]);

  // Spacebar → play/pause on Metronome tab
  useEffect(() => {
    if (view !== "beat") return;
    const handleSpace = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      e.preventDefault();
      togglePlayback();
    };
    document.addEventListener("keydown", handleSpace);
    return () => document.removeEventListener("keydown", handleSpace);
  }, [view]);

  // Resize window based on current view
  const sliderPercent = ((state.bpm - 20) / (300 - 20)) * 100;
  const volumePercent = state.volume * 100;

  // Fullscreen zen mode
  if (isFullscreen) {
    return <FullscreenView state={state} currentBeat={currentBeat} activeTab={view === "train" ? "train" : "beat"} onExit={() => setIsFullscreen(false)} />;
  }

  return (
    <div className="main-window" data-playing={state.isPlaying}>
      <header className="main-header" onDoubleClick={() => { if (view !== "settings" && view !== "track") setIsFullscreen(true); }}>
        <h1>mustik</h1>
        <div className="header-actions">
          <div className="header-volume-wrap">
            <button className="header-btn header-volume-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                {state.volume > 0 && <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>}
                {state.volume > 0.5 && <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>}
              </svg>
            </button>
            <div className="header-volume-popover">
              <input
                type="range"
                className="volume-slider"
                min={0}
                max={100}
                value={volumePercent}
                onChange={(e) => setVolume(parseInt(e.target.value) / 100)}
                style={{ "--volume-pct": `${volumePercent}%` } as React.CSSProperties}
              />
            </div>
          </div>
          {view !== "settings" && view !== "track" && (
            <button className="header-btn" onClick={() => setIsFullscreen(true)} data-tooltip="Zen">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22c4-4 8-7.5 8-12a8 8 0 1 0-16 0c0 4.5 4 8 8 12z"/><path d="M12 2v20"/><path d="M4.5 10c2.5 1 5 1 7.5 0s5-1 7.5 0"/></svg>
            </button>
          )}
          <button
            className={`header-btn ${view === "settings" ? "active" : ""}`}
            onClick={() => {
              if (view === "settings") {
                setView(prevTab.current);
              } else {
                prevTab.current = view as "beat" | "train" | "track";
                setView("settings");
              }
            }}
            data-tooltip={view === "settings" ? "Back" : "Settings"}
          >
            {view === "settings" ? (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="1" y1="1" x2="13" y2="13"/><line x1="13" y1="1" x2="1" y2="13"/></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            )}
          </button>
          <button className="header-btn" onClick={() => showFloating()} data-tooltip="Open widget">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="2"/><rect x="10" y="10" width="10" height="10" rx="1"/></svg>
          </button>
        </div>
      </header>

      {view !== "settings" && (
        <nav className="tab-bar">
          <button className={`tab-btn ${view === "beat" ? "active" : ""}`} onClick={() => setView("beat")}>Metronome</button>
          <button className={`tab-btn ${view === "train" ? "active" : ""}`} onClick={() => setView("train")}>Drill</button>
          <button className={`tab-btn ${view === "track" ? "active" : ""}`} onClick={() => setView("track")}>Tap It!</button>
        </nav>
      )}

      <div className="main-content">
        {view === "beat" ? (
          <>
            <section className="bpm-section">
              <div className="bpm-display">
                <button className="bpm-btn" onClick={() => handleBpmChange(state.bpm - 5)}>−</button>
                {editingBpm ? (
                  <input
                    ref={bpmInputRef}
                    type="text"
                    inputMode="numeric"
                    className="bpm-input"
                    value={bpmEditValue}
                    onChange={(e) => setBpmEditValue(e.target.value.replace(/\D/g, ""))}
                    onBlur={commitBpmEdit}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitBpmEdit();
                      if (e.key === "Escape") setEditingBpm(false);
                    }}
                    autoFocus
                  />
                ) : (
                  <span className="bpm-input bpm-clickable" onClick={startBpmEdit}>{state.bpm}</span>
                )}
                <button className="bpm-btn" onClick={() => handleBpmChange(state.bpm + 5)}>+</button>
              </div>
              <div className="bpm-slider-wrap">
                <input
                  type="range"
                  className="bpm-slider"
                  min={20}
                  max={300}
                  value={state.bpm}
                  onChange={(e) => handleBpmChange(parseInt(e.target.value))}
                  style={{ "--slider-pct": `${sliderPercent}%` } as React.CSSProperties}
                />
                <span className="tempo-marking">{getTempoMarking(state.bpm)}</span>
              </div>
            </section>

            <button
              className={`play-btn full-width ${state.isPlaying ? "playing" : ""}`}
              onClick={() => togglePlayback()}
            >
              {state.isPlaying ? (
                <><svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="2" y="2" width="12" height="12" rx="1.5"/></svg> Stop</>
              ) : (
                <><svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2.5a.5.5 0 0 1 .77-.42l9 5.5a.5.5 0 0 1 0 .84l-9 5.5A.5.5 0 0 1 4 13.5z"/></svg> Play</>
              )}
            </button>

            <section className="control-section">
              <div className="sub-dropdown-wrapper" ref={dropdownRef}>
                <button className="main-sub-btn" onClick={() => setSubOpen(!subOpen)}>
                  <span className="main-sub-icon">{SUBDIVISION_LABELS[state.subdivision]}</span>
                  <span className="main-sub-name">{SUBDIVISION_NAMES[state.subdivision]}</span>
                  <span className="main-sub-arrow">{subOpen ? (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M3 10l5-6 5 6z"/></svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M3 6l5 6 5-6z"/></svg>
                  )}</span>
                </button>
                {subOpen && (
                  <div className="sub-dropdown-menu">
                    {([1, 2, 3, 4, 5, 6] as Subdivision[]).map((sub) => (
                      <button
                        key={sub}
                        className={`sub-dropdown-item ${state.subdivision === sub ? "active" : ""}`}
                        onClick={() => { setSubdivision(sub); setSubOpen(false); }}
                      >
                        <span className="sub-dropdown-icon">{SUBDIVISION_LABELS[sub]}</span>
                        <span>{SUBDIVISION_NAMES[sub]}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="sub-dropdown-wrapper" ref={soundDropdownRef}>
                <button className="main-sub-btn" onClick={() => setSoundOpen(!soundOpen)}>
                  <span className="main-sub-icon">{SOUND_TYPES.find(s => s.id === state.soundType)?.icon ?? "🔔"}</span>
                  <span className="main-sub-name">{SOUND_TYPES.find(s => s.id === state.soundType)?.name ?? "Click"}</span>
                  <span className="main-sub-arrow">{soundOpen ? (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M3 10l5-6 5 6z"/></svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M3 6l5 6 5-6z"/></svg>
                  )}</span>
                </button>
                {soundOpen && (
                  <div className="sub-dropdown-menu">
                    {SOUND_TYPES.map((st) => (
                      <button
                        key={st.id}
                        className={`sub-dropdown-item ${state.soundType === st.id ? "active" : ""}`}
                        onClick={() => { setSoundType(st.id); setSoundOpen(false); }}
                      >
                        <span className="sub-dropdown-icon">{st.icon}</span>
                        <span>{st.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <section className="beat-section">
              <div className="main-beat-dots">
                {Array.from({ length: beatsPerMeasure }, (_, beatIdx) => {
                  const isBeatActive = activeBeat === beatIdx && isDownbeat;
                  const isBeatDownbeat = isBeatActive && beatIdx === 0;
                  const isAccentBeat = state.timeSignature === 1 || (beatIdx === 0 && state.timeSignature >= 2);
                  return (
                    <div key={beatIdx} className="main-dot-group">
                      <div className={`main-dot ${isBeatActive ? "active" : ""} ${isBeatDownbeat ? "downbeat" : ""} ${isAccentBeat && isBeatActive ? "accent" : ""}`} />
                      {state.subdivision > 1 && (
                        <div className="main-sub-dots">
                          {Array.from({ length: state.subdivision - 1 }, (_, subIdx) => (
                            <div
                              key={subIdx}
                              className={`main-sub-dot ${
                                activeBeat === beatIdx && activeSub === subIdx + 1 ? "active" : ""
                              }`}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="time-sig-row">
                {TIME_SIGNATURES.map((ts) => (
                  <button
                    key={ts.beats}
                    className={`time-sig-btn ${state.timeSignature === ts.beats ? "active" : ""}`}
                    onClick={() => setTimeSignature(ts.beats)}
                  >
                    {ts.label}
                  </button>
                ))}
              </div>
            </section>
          </>
        ) : view === "train" ? (
          <TrainView state={state} currentBeat={currentBeat} />
        ) : view === "track" ? (
          <TrackView state={state} currentBeat={currentBeat} />
        ) : (
          <>
            <section className="settings-section">
              <h2>Widget</h2>
              <div className="setting-row">
                <div className="setting-label">
                  <label>Mode</label>
                  <span className="setting-hint">Widget layout on screen</span>
                </div>
                <div className="toggle-group">
                  {(["compact", "comfortable"] as WidgetMode[]).map((mode) => (
                    <button
                      key={mode}
                      className={`toggle-btn ${state.mode === mode ? "active" : ""}`}
                      onClick={() => setWidgetMode(mode)}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
              <div className="setting-row">
                <div className="setting-label">
                  <label>Always on top</label>
                  <span className="setting-hint">Keep widget visible over other apps</span>
                </div>
                <button
                  className={`toggle-btn ${state.alwaysOnTop ? "active" : ""}`}
                  onClick={() => setAlwaysOnTop(!state.alwaysOnTop)}
                >
                  {state.alwaysOnTop ? "On" : "Off"}
                </button>
              </div>
            </section>

            <section className="settings-section">
              <h2>Accent color</h2>
              <div className="accent-grid">
                {ACCENT_COLORS.map((c) => (
                  <button
                    key={c.hex}
                    className={`accent-swatch ${state.accentColor === c.hex ? "active" : ""}`}
                    style={{ "--swatch-color": c.hex } as React.CSSProperties}
                    title={c.name}
                    onClick={() => setAccentColor(c.hex)}
                  />
                ))}
              </div>
            </section>

            <section className="hotkeys-section">
              <h2>Hotkeys</h2>
              <div className="hotkey-table">
                <div className="hotkey-table-header">
                  <span>Action</span>
                  <span>Keyboard</span>
                  <span>Footswitch</span>
                </div>
                {HOTKEYS.map((hk) => (
                  <div key={hk.id} className="hotkey-row">
                    <span className="hotkey-action">{hk.action}</span>
                    <button
                      className={`hotkey-bind-btn ${bindingFor?.id === hk.id && bindingFor.type === "key" ? "listening" : ""}`}
                      onClick={() => {
                        setBindingFor({ id: hk.id, type: "key" });
                        setPendingKeys("");
                      }}
                    >
                      {keyBindings[hk.id] || "—"}
                    </button>
                    <button
                      className={`hotkey-bind-btn ${bindingFor?.id === hk.id && bindingFor.type === "foot" ? "listening" : ""}`}
                      onClick={() => {
                        setBindingFor({ id: hk.id, type: "foot" });
                        setPendingKeys("");
                      }}
                    >
                      {footBindings[hk.id] || "Bind"}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>

      {bindingFor && (
        <div className="keybinding-overlay" onClick={() => { setBindingFor(null); setPendingKeys(""); }}>
          <div className="keybinding-capture" onClick={(e) => e.stopPropagation()}>
            <span className="keybinding-capture-title">
              {HOTKEYS.find((hk) => hk.id === bindingFor.id)?.action} — {bindingFor.type === "key" ? "Keyboard" : "Footswitch"}
            </span>
            <div className="keybinding-capture-display">
              {pendingKeys ? (
                <span className="keybinding-capture-keys">{pendingKeys}</span>
              ) : (
                <span className="keybinding-capture-waiting">Press desired key combination…</span>
              )}
            </div>
            <div className="keybinding-capture-actions">
              <button className="keybinding-btn-reset" onClick={handleResetBinding}>Reset to default</button>
              <button className="keybinding-btn-remove" onClick={handleRemoveBinding}>Remove</button>
            </div>
            <span className="keybinding-capture-hint">Press Escape to cancel</span>
          </div>
        </div>
      )}
    </div>
  );
}
