import { useEffect } from "react";
import type { AppState, BeatEvent, Subdivision } from "../types";
import { setBpm, togglePlayback, setSubdivision, setTimeSignature, stopSpeedRamp, startSpeedRamp, startSpeedRampFrom, configureSpeedRamp } from "../ipc";
import "../styles/fullscreen.css";

interface FullscreenViewProps {
  state: AppState;
  currentBeat: BeatEvent | null;
  activeTab: "beat" | "train";
  onExit: () => void;
}

const SUBDIVISION_LABELS: Record<Subdivision, string> = {
  1: "♩", 2: "♫", 3: "♪³", 4: "♬", 5: "♪⁵", 6: "♬⁶",
};

export function FullscreenView({ state, currentBeat, activeTab, onExit }: FullscreenViewProps) {
  const ramp = state.speedRamp;
  // In train mode, use ramp's beatsPerBar; otherwise use timeSignature
  const beatsPerMeasure = activeTab === "train"
    ? (ramp.beatsPerBar >= 2 ? ramp.beatsPerBar : 4)
    : (state.timeSignature >= 2 ? state.timeSignature : 2);
  const activeBeat = currentBeat ? currentBeat.beat % beatsPerMeasure : -1;
  const activeSub = currentBeat ? currentBeat.subdivision : -1;
  const isDownbeat = currentBeat?.isDownbeat ?? false;

  const exitFullscreen = () => onExit();

  // Use document-level listener so Escape works regardless of focus
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") exitFullscreen();
      if (e.key === " ") {
        e.preventDefault();
        if (activeTab === "train") {
          handleRampToggle();
        } else {
          togglePlayback();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onExit, activeTab, ramp.active, ramp.startBpm, ramp.targetBpm, ramp.increment, ramp.decrement, ramp.barsPerStep, ramp.beatsPerBar, ramp.mode, ramp.cyclic]);

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
      <div className="fs-content">
        {/* BPM display */}
        <div className="fs-center">
          {activeTab === "train" && (
            <div className="fs-ramp-info" style={{ visibility: ramp.active ? "visible" : "hidden" }}>
              <span className="fs-ramp-step">Step {ramp.currentStep + 1}</span>
              <span className="fs-ramp-target">→ {ramp.targetBpm}</span>
            </div>
          )}
          <div className="fs-bpm">{state.bpm}</div>
          <div className="fs-bpm-label">BPM</div>
        </div>

        {/* Beat visualization */}
        <div className="fs-beats">
          {Array.from({ length: beatsPerMeasure }, (_, beatIdx) => {
            const isBeatActive = activeBeat === beatIdx && isDownbeat;
            const isAccent = activeTab === "train"
              ? beatIdx === 0
              : (state.timeSignature === 1 || (beatIdx === 0 && state.timeSignature >= 2));
            return (
              <div key={beatIdx} className="fs-beat-group">
                <div className={`fs-beat ${isBeatActive ? "active" : ""} ${isAccent && isBeatActive ? "accent" : ""}`} />
                {activeTab !== "train" && state.subdivision > 1 && (
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

        {/* Ramp grid (train mode) */}
        {activeTab === "train" && (
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
        {activeTab !== "train" && (
          <>
            <button className="fs-ctrl-btn" onClick={() => setBpm(Math.max(20, state.bpm - 5))}>−5</button>
            <button className="fs-ctrl-btn" onClick={() => setBpm(Math.max(20, state.bpm - 1))}>−1</button>
          </>
        )}
        {activeTab !== "train" && (
          <button className="fs-ctrl-btn fs-ctrl-sub" onClick={() => {
            const next = (state.subdivision === 6 ? 1 : state.subdivision + 1) as Subdivision;
            setSubdivision(next);
          }}>
            {SUBDIVISION_LABELS[state.subdivision]}
          </button>
        )}

        {activeTab === "train" ? (
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

        {activeTab !== "train" && (
          <button className="fs-ctrl-btn fs-ctrl-sub" onClick={() => {
            const ts = state.timeSignature;
            const next = ts >= 7 ? 0 : ts + 1;
            setTimeSignature(next);
          }}>
            {state.timeSignature >= 2 ? `${state.timeSignature}/4` : state.timeSignature === 1 ? "All" : "Off"}
          </button>
        )}
        {activeTab !== "train" && (
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
