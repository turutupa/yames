import { useEffect, useState, useRef } from "react";
import type { AppState, BeatEvent, Subdivision } from "../types";
import { setBpm, togglePlayback, setSubdivision, setTimeSignature, stopSpeedRamp, startSpeedRamp, startSpeedRampFrom, configureSpeedRamp, storeSave, storeLoad } from "../ipc";
import { ZenEffects, type ZenStyle } from "./ZenEffects";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "../styles/fullscreen.css";

interface FullscreenViewProps {
  state: AppState;
  currentBeat: BeatEvent | null;
  activeTab: "beat" | "drill";
  onExit: () => void;
}

const SUBDIVISION_LABELS: Record<Subdivision, string> = {
  1: "♩", 2: "♫", 3: "♪³", 4: "♬", 5: "♪⁵", 6: "♬⁶",
};

function zenStyleIcon(s: ZenStyle) {
  switch (s) {
    case "focus": return <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="5"/></svg>;
    case "pulse": return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/></svg>;
    case "gravity": return <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="8" r="3"/><line x1="12" y1="18" x2="12" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>;
    case "sweep": return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><line x1="12" y1="12" x2="12" y2="5"/></svg>;
    case "cosmos": return <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="6" cy="8" r="1.5"/><circle cx="18" cy="6" r="1"/><circle cx="12" cy="16" r="1.5"/><circle cx="4" cy="18" r="1"/><circle cx="19" cy="15" r="1.2"/></svg>;
    case "warp": return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12,2 22,12 12,22 2,12"/></svg>;
    case "rain": return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v6M8 4v4M16 5v3M6 8v3M18 7v3"/><ellipse cx="12" cy="20" rx="3" ry="1"/></svg>;
  }
}

export function FullscreenView({ state, currentBeat, activeTab, onExit }: FullscreenViewProps) {
  const ramp = state.speedRamp;
  // In drill mode, use ramp's beatsPerBar; otherwise use timeSignature
  const beatsPerMeasure = activeTab === "drill"
    ? (ramp.beatsPerBar >= 2 ? ramp.beatsPerBar : 4)
    : (state.timeSignature >= 2 ? state.timeSignature : 2);
  const activeBeat = currentBeat ? currentBeat.beat % beatsPerMeasure : -1;
  const activeSub = currentBeat ? currentBeat.subdivision : -1;
  const isDownbeat = currentBeat?.isDownbeat ?? false;

  const exitFullscreen = () => onExit();

  const [zenStyle, setZenStyle] = useState<ZenStyle>("focus");
  const [themeOpen, setThemeOpen] = useState(false);
  const themePickerRef = useRef<HTMLDivElement>(null);

  // Restore zen style from store on mount
  useEffect(() => {
    storeLoad<string>("zenStyle").then((s) => { if (s) setZenStyle(s as ZenStyle); });
  }, []);

  const handleZenStyle = (s: ZenStyle) => {
    setZenStyle(s);
    storeSave("zenStyle", s);
    setThemeOpen(false);
  };
  const toggleFullscreen = async () => {
    const win = getCurrentWindow();
    const isFull = await win.isFullscreen();
    await win.setFullscreen(!isFull);
    // When exiting OS fullscreen, wait for animation then restore always-on-top and focus
    if (isFull) {
      await new Promise(r => setTimeout(r, 500));
      await win.setAlwaysOnTop(state.alwaysOnTop);
      await win.setFocus();
      // Force webview keyboard focus via hidden-input trick
      for (let i = 0; i < 4; i++) {
        if (document.hasFocus()) break;
        await new Promise(r => setTimeout(r, 200));
      }
      const tmp = document.createElement("input");
      tmp.style.position = "fixed";
      tmp.style.opacity = "0";
      tmp.style.pointerEvents = "none";
      document.body.appendChild(tmp);
      tmp.focus();
      tmp.remove();
    }
  };

  // Close theme picker when clicking outside
  useEffect(() => {
    if (!themeOpen) return;
    const handler = (e: MouseEvent) => {
      if (themePickerRef.current && !themePickerRef.current.contains(e.target as Node)) {
        setThemeOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [themeOpen]);

  // Keyboard shortcuts are handled by MainWindow's unified dispatcher.
  // Only Escape is hardcoded here to ensure zen exit always works.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); exitFullscreen(); }
    };
    document.addEventListener("keydown", handler, true); // capture phase
    return () => document.removeEventListener("keydown", handler, true);
  }, [onExit]);

  const handleRampToggle = () => {
    if (ramp.active) {
      stopSpeedRamp();
    } else {
      configureSpeedRamp({
        startBpm: ramp.startBpm,
        targetBpm: ramp.targetBpm,
        increment: ramp.increment,
        decrement: ramp.decrement,
        barsPerStep: ramp.barsPerStep,
        beatsPerBar: ramp.beatsPerBar,
        mode: ramp.mode,
        cyclic: ramp.cyclic,
      });
      setTimeout(() => startSpeedRamp(), 50);
    }
  };

  return (
    <div
      className="fullscreen-view"
      data-playing={state.isPlaying}
      onDoubleClick={exitFullscreen}
    >
      <ZenEffects style={zenStyle} currentBeat={currentBeat} isPlaying={state.isPlaying} activeTab={activeTab} beatsPerMeasure={beatsPerMeasure} />

      {/* Top-right controls: theme picker + fullscreen */}
      <div className="zen-top-controls" onDoubleClick={(e) => e.stopPropagation()} ref={themePickerRef}>
        {/* Theme picker */}
        <div className={`zen-theme-picker ${themeOpen ? "open" : ""}`}>
          <button
            className="zen-top-btn zen-theme-trigger"
            onClick={() => setThemeOpen(!themeOpen)}
            data-tooltip={!themeOpen ? zenStyle.charAt(0).toUpperCase() + zenStyle.slice(1) : undefined}
          >
            {zenStyleIcon(zenStyle)}
          </button>
          <div className="zen-theme-dropdown">
            {(["focus", "pulse", "gravity", "sweep", "cosmos", "warp", "rain"] as ZenStyle[]).map((s) => (
              <button
                key={s}
                className={`zen-theme-option ${zenStyle === s ? "active" : ""}`}
                onClick={() => handleZenStyle(s)}
                data-tooltip={s.charAt(0).toUpperCase() + s.slice(1)}
              >
                {zenStyleIcon(s)}
              </button>
            ))}
          </div>
        </div>
        {/* Fullscreen toggle */}
        <button className="zen-top-btn" onClick={toggleFullscreen} data-tooltip="Fullscreen">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
            <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
          </svg>
        </button>
      </div>

      <div className="fs-content">
        {/* BPM display */}
        <div className="fs-center">
          {activeTab === "drill" && (
            <div className="fs-ramp-info" style={{ visibility: ramp.active ? "visible" : "hidden" }}>
              <span className="fs-ramp-step">Step {ramp.currentStep + 1}</span>
              <span className="fs-ramp-target">→ {ramp.targetBpm}</span>
            </div>
          )}
          <div className="fs-bpm">{activeTab === "drill" ? (ramp.active ? ramp.currentBpm : ramp.startBpm) : state.bpm}</div>
          <div className="fs-bpm-label">BPM</div>
        </div>

        {/* Beat visualization */}
        <div className="fs-beats">
          {Array.from({ length: beatsPerMeasure }, (_, beatIdx) => {
            const isBeatActive = activeBeat === beatIdx && isDownbeat;
            const isAccent = activeTab === "drill"
              ? beatIdx === 0
              : (state.timeSignature === 1 || (beatIdx === 0 && state.timeSignature >= 2));
            return (
              <div key={beatIdx} className="fs-beat-group">
                <div className={`fs-beat ${isBeatActive ? "active" : ""} ${isAccent && isBeatActive ? "accent" : ""}`} />
                {activeTab !== "drill" && state.subdivision > 1 && (
                  <div className="fs-sub-dots">
                    {Array.from({ length: state.subdivision - 1 }, (_, subIdx) => (
                      <span
                        key={subIdx}
                        className={`fs-sub-dot ${activeBeat === beatIdx && activeSub === subIdx + 1 ? "active" : ""}`}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Ramp grid (drill mode) */}
        {activeTab === "drill" && (
          <div className="fs-ramp-progress" onDoubleClick={(e) => e.stopPropagation()}>
            {(() => {
              // Compute steps from ramp config
              const steps: number[] = [];
              let bpm = ramp.startBpm;
              let dir: "up" | "down" = "up";
              steps.push(bpm);
              for (let i = 0; i < 200; i++) {
                if (ramp.mode === "zigzag") {
                  if (dir === "up") {
                    bpm = Math.min(bpm + ramp.increment, ramp.targetBpm);
                    if (bpm >= ramp.targetBpm) { steps.push(bpm); break; }
                    dir = "down";
                  } else {
                    bpm = Math.max(bpm - ramp.decrement, ramp.startBpm);
                    dir = "up";
                  }
                } else {
                  if (dir === "up") {
                    bpm = Math.min(bpm + ramp.increment, ramp.targetBpm);
                    if (bpm >= ramp.targetBpm) {
                      steps.push(bpm);
                      if (ramp.cyclic) { dir = "down"; continue; } else { break; }
                    }
                  } else {
                    bpm = Math.max(bpm - ramp.increment, ramp.startBpm);
                    if (bpm <= ramp.startBpm) { steps.push(bpm); break; }
                  }
                }
                steps.push(bpm);
              }
              return (
                <div className="fs-ramp-grid">
                  {steps.map((stepBpm, stepIdx) => {
                    const isDone = stepIdx < ramp.currentStep;
                    const isCurrent = stepIdx === ramp.currentStep && ramp.active;
                    const pct = steps.length > 1 ? stepIdx / (steps.length - 1) : 0;
                    const rowOpacity = 0.15 + pct * 0.85;
                    return (
                      <div key={stepIdx} className="fs-ramp-grid-row">
                        {Array.from({ length: ramp.barsPerStep }, (_, barIdx) => {
                          const barDone = isDone || (isCurrent && barIdx < ramp.barsInStep);
                          const barActive = isCurrent && barIdx === ramp.barsInStep;
                          return (
                            <div
                              key={barIdx}
                              className={`fs-ramp-grid-cell ${barDone ? "done" : ""} ${barActive ? "current" : ""}`}
                              style={{ cursor: "pointer", opacity: barDone || barActive ? undefined : rowOpacity * 0.3 }}
                              onClick={() => startSpeedRampFrom(stepIdx, stepBpm, barIdx)}
                            />
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Subtle controls */}
      <div className="fs-controls" onDoubleClick={(e) => e.stopPropagation()}>
        {activeTab !== "drill" && (
          <>
            <button className="fs-ctrl-btn" onClick={() => setBpm(Math.max(20, state.bpm - 5))}>−5</button>
            <button className="fs-ctrl-btn" onClick={() => setBpm(Math.max(20, state.bpm - 1))}>−1</button>
          </>
        )}
        {activeTab !== "drill" && (
          <button className="fs-ctrl-btn fs-ctrl-sub" onClick={() => {
            const next = (state.subdivision === 6 ? 1 : state.subdivision + 1) as Subdivision;
            setSubdivision(next);
          }}>
            {SUBDIVISION_LABELS[state.subdivision]}
          </button>
        )}

        {activeTab === "drill" ? (
          <button className={`fs-play-btn ${ramp.active ? "playing" : ""}`} onClick={handleRampToggle}>
            {ramp.active
              ? <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor"><rect x="2" y="2" width="14" height="14" rx="2"/></svg>
              : <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path d="M4 2.5v15l13-7.5z"/></svg>
            }
          </button>
        ) : (
          <button className={`fs-play-btn ${state.isPlaying ? "playing" : ""}`} onClick={() => togglePlayback()}>
            {state.isPlaying
              ? <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor"><rect x="2" y="2" width="14" height="14" rx="2"/></svg>
              : <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path d="M4 2.5v15l13-7.5z"/></svg>
            }
          </button>
        )}

        {activeTab !== "drill" && (
          <button className="fs-ctrl-btn fs-ctrl-sub" onClick={() => {
            const ts = state.timeSignature;
            const next = ts >= 7 ? 0 : ts + 1;
            setTimeSignature(next);
          }}>
            {state.timeSignature >= 2 ? `${state.timeSignature}/4` : state.timeSignature === 1 ? "All" : "Off"}
          </button>
        )}
        {activeTab !== "drill" && (
          <>
            <button className="fs-ctrl-btn" onClick={() => setBpm(Math.min(300, state.bpm + 1))}>+1</button>
            <button className="fs-ctrl-btn" onClick={() => setBpm(Math.min(300, state.bpm + 5))}>+5</button>
          </>
        )}
      </div>

      {/* Exit hint */}
      <div className="fs-exit-hint">
        Double-click or press Esc to exit
      </div>
    </div>
  );
}
