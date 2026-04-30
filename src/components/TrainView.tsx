import { useState, useEffect, useRef } from "react";
import type { AppState, BeatEvent } from "../types";
import { configureSpeedRamp, startSpeedRamp, startSpeedRampFrom, stopSpeedRamp, onRampStep } from "../ipc";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import "../styles/train-view.css";

const TRAIN_DESCRIPTIONS: Record<string, string> = {
  startBpm: "The tempo you begin practicing at. Start slow and build up.",
  targetBpm: "The goal tempo you're working toward.",
  increment: "BPM added each up-step. Bigger number = faster ramp.",
  decrement: "BPM subtracted each down-step (zigzag only). Smaller than increment to crawl forward.",
  beats: "Clicks per cell. Beat 1 is always accented so you can hear the pattern.",
  repeat: "How many cells per column — the number of times you repeat at each tempo before moving on.",
  mode: "Linear goes straight up. Zigzag alternates: +increment, −decrement, netting forward.",
  cyclic: "Goes up to target then back down to start in the same increments (round-trip).",
};

interface TrainViewProps {
  state: AppState;
  currentBeat: BeatEvent | null;
}

export function TrainView({ state, currentBeat }: TrainViewProps) {
  const ramp = state.speedRamp;
  const [highlightMode, setHighlightMode] = useState<"beats" | "repeats" | "startBpm" | "targetBpm" | null>(null);
  const [startBpm, setStartBpm] = useState(ramp.startBpm);
  const [targetBpm, setTargetBpm] = useState(ramp.targetBpm);
  const [increment, setIncrement] = useState(ramp.increment);
  const [decrement, setDecrement] = useState(ramp.decrement);
  const [barsPerStep, setBarsPerStep] = useState(ramp.barsPerStep);
  const [beatsPerBar, setBeatsPerBar] = useState(ramp.beatsPerBar);
  const [mode, setMode] = useState(ramp.mode);
  const [cyclic, setCyclic] = useState(ramp.cyclic);

  // Ghost elements for smooth exit animations
  const prevStepsRef = useRef<number[]>([]);
  const prevBarsRef = useRef(barsPerStep);
  const prevBeatsRef = useRef(beatsPerBar);
  const [ghostRows, setGhostRows] = useState<number[]>([]);
  const [ghostCols, setGhostCols] = useState(0);
  const [ghostDots, setGhostDots] = useState(0);
  const ghostRowTimer = useRef<ReturnType<typeof setTimeout>>();
  const ghostColTimer = useRef<ReturnType<typeof setTimeout>>();
  const ghostDotTimer = useRef<ReturnType<typeof setTimeout>>();

  // Sync local form with state when it changes from backend
  useEffect(() => {
    if (!ramp.active) {
      setStartBpm(ramp.startBpm);
      setTargetBpm(ramp.targetBpm);
      setIncrement(ramp.increment);
      setDecrement(ramp.decrement);
      setBarsPerStep(ramp.barsPerStep);
      setBeatsPerBar(ramp.beatsPerBar);
      setMode(ramp.mode);
      setCyclic(ramp.cyclic);
    }
  }, [ramp.startBpm, ramp.targetBpm, ramp.increment, ramp.decrement, ramp.barsPerStep, ramp.beatsPerBar, ramp.mode, ramp.cyclic, ramp.active]);

  // Listen for ramp-step events (for future use / logging)
  useEffect(() => {
    const unlisten = onRampStep(() => {});
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  const saveWith = (overrides: Partial<{ startBpm: number; targetBpm: number; increment: number; decrement: number; barsPerStep: number; beatsPerBar: number; mode: string; cyclic: boolean }>) => {
    configureSpeedRamp({
      startBpm: overrides.startBpm ?? startBpm,
      targetBpm: overrides.targetBpm ?? targetBpm,
      increment: overrides.increment ?? increment,
      decrement: overrides.decrement ?? decrement,
      barsPerStep: overrides.barsPerStep ?? barsPerStep,
      beatsPerBar: overrides.beatsPerBar ?? beatsPerBar,
      mode: overrides.mode ?? mode,
      cyclic: overrides.cyclic ?? cyclic,
    });
  };

  const handleStart = () => {
    saveWith({});
    setTimeout(() => startSpeedRamp(), 50);
  };

  const handleStop = () => {
    stopSpeedRamp();
  };

  // Spacebar → start/stop
  useEffect(() => {
    const handleSpace = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      e.preventDefault();
      if (ramp.active) {
        stopSpeedRamp();
      } else {
        saveWith({});
        setTimeout(() => startSpeedRamp(), 50);
      }
    };
    document.addEventListener("keydown", handleSpace);
    return () => document.removeEventListener("keydown", handleSpace);
  }, [ramp.active, startBpm, targetBpm, increment, decrement, barsPerStep, beatsPerBar, mode, cyclic]);

  // Calculate steps for the progress visualization
  const steps: number[] = [];
  {
    let bpm = startBpm;
    let dir: "up" | "down" = "up";
    steps.push(bpm);
    for (let i = 0; i < 200; i++) {
      if (mode === "zigzag") {
        // Zigzag: alternate +increment / -decrement each step
        if (dir === "up") {
          bpm = Math.min(bpm + increment, targetBpm);
          if (bpm >= targetBpm) { steps.push(bpm); break; }
          dir = "down"; // next step goes down
        } else {
          bpm = Math.max(bpm - decrement, startBpm);
          dir = "up"; // next step goes up
        }
      } else {
        // Linear (or cyclic linear)
        if (dir === "up") {
          bpm = Math.min(bpm + increment, targetBpm);
          if (bpm >= targetBpm) {
            steps.push(bpm);
            if (cyclic) { dir = "down"; continue; } else { break; }
          }
        } else {
          // Cyclic: coming back down
          bpm = Math.max(bpm - increment, startBpm);
          if (bpm <= startBpm) { steps.push(bpm); break; }
        }
      }
      steps.push(bpm);
    }
  }

  // Detect row/col shrinks and create ghost elements for exit animation
  useEffect(() => {
    const prev = prevStepsRef.current;
    if (prev.length > steps.length) {
      setGhostRows(prev.slice(steps.length));
      clearTimeout(ghostRowTimer.current);
      ghostRowTimer.current = setTimeout(() => setGhostRows([]), 250);
    } else {
      setGhostRows([]);
    }
    prevStepsRef.current = [...steps];
  }, [steps.length, startBpm, targetBpm, increment, decrement, mode]);

  useEffect(() => {
    const prev = prevBarsRef.current;
    if (prev > barsPerStep) {
      setGhostCols(prev - barsPerStep);
      clearTimeout(ghostColTimer.current);
      ghostColTimer.current = setTimeout(() => setGhostCols(0), 200);
    } else {
      setGhostCols(0);
    }
    prevBarsRef.current = barsPerStep;
  }, [barsPerStep]);

  useEffect(() => {
    const prev = prevBeatsRef.current;
    if (prev > beatsPerBar) {
      setGhostDots(prev - beatsPerBar);
      clearTimeout(ghostDotTimer.current);
      ghostDotTimer.current = setTimeout(() => setGhostDots(0), 250);
    } else {
      setGhostDots(0);
    }
    prevBeatsRef.current = beatsPerBar;
  }, [beatsPerBar]);

  // Auto-resize window to fit grid content
  const prevSize = useRef<{ width: number; height: number } | null>(null);

  // Save original size on mount, restore on unmount
  useEffect(() => {
    const win = getCurrentWindow();
    win.innerSize().then((size) => {
      const scale = window.devicePixelRatio || 1;
      prevSize.current = {
        width: Math.round(size.width / scale),
        height: Math.round(size.height / scale),
      };
    });
    return () => {
      if (prevSize.current) {
        const { width, height } = prevSize.current;
        getCurrentWindow().setSize(new LogicalSize(width, height));
      }
    };
  }, []);

  // Resize when grid dimensions change
  const prevGridKey = useRef("");
  useEffect(() => {
    const gridKey = `${steps.length}-${barsPerStep}`;
    if (gridKey === prevGridKey.current) return;
    prevGridKey.current = gridKey;

    const cellSize = 28;
    const gap = 4;
    const bpmLabelWidth = 40;
    // Grid natural width: bpm label + cells (cols = barsPerStep) + gaps
    const gridNaturalWidth = bpmLabelWidth + barsPerStep * (cellSize + gap) - gap;
    // Window needs: grid + body padding (~24px each side) + some breathing room
    const neededWidth = gridNaturalWidth + 80;
    const minWidth = Math.max(480, neededWidth);

    // Fixed height estimate: header(60) + tabs(50) + bpm area(130) + grid rows + config(~350) + button(70) + margins(80)
    const gridHeight = steps.length * (cellSize + gap) - gap + 28; /* legend row */
    const neededHeight = 60 + 50 + 130 + gridHeight + 350 + 70 + 80;
    const minHeight = Math.max(820, neededHeight);

    const win = getCurrentWindow();
    win.innerSize().then((size) => {
      const scale = window.devicePixelRatio || 1;
      const curW = Math.round(size.width / scale);
      const curH = Math.round(size.height / scale);
      const newW = Math.max(curW, minWidth);
      const newH = Math.max(curH, minHeight);
      if (newW !== curW || newH !== curH) {
        win.setSize(new LogicalSize(newW, newH));
      }
    });
  }, [steps.length, barsPerStep]);

  // Calculate total time for the ramp using the ramp's own beats_per_bar
  const totalTimeSeconds = (() => {
    let total = 0;
    for (let i = 0; i < steps.length; i++) {
      const bpm = steps[i];
      const secondsPerBeat = 60 / bpm;
      total += secondsPerBeat * beatsPerBar * barsPerStep;
    }
    return total;
  })();

  // Calculate remaining time from a given step and bar
  const remainingTimeFrom = (fromStep: number, fromBar: number = 0) => {
    let total = 0;
    for (let i = fromStep; i < steps.length; i++) {
      const bpm = steps[i];
      const secondsPerBeat = 60 / bpm;
      const bars = i === fromStep ? barsPerStep - fromBar : barsPerStep;
      total += secondsPerBeat * beatsPerBar * bars;
    }
    return total;
  };

  // Simple countdown: compute total once at start, tick down every second
  const [liveRemaining, setLiveRemaining] = useState(0);
  const startTime = useRef(0);
  const totalAtStart = useRef(0);
  const startTimer = (fromStep: number, fromBar: number) => {
    totalAtStart.current = remainingTimeFrom(fromStep, fromBar);
    startTime.current = Date.now() / 1000;
    setLiveRemaining(totalAtStart.current);
  };
  useEffect(() => {
    if (ramp.active) {
      // Only set initial anchor when ramp first becomes active (Start button)
      if (startTime.current === 0) {
        startTimer(ramp.currentStep, ramp.barsInStep);
      }
      const interval = setInterval(() => {
        const elapsed = Date.now() / 1000 - startTime.current;
        const r = totalAtStart.current - elapsed;
        setLiveRemaining(r > 0 ? r : 0);
      }, 1000);
      return () => clearInterval(interval);
    } else {
      setLiveRemaining(0);
      startTime.current = 0;
    }
  }, [ramp.active]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  };

  const activeBeat = currentBeat ? currentBeat.beat % beatsPerBar : -1;
  const isDownbeat = currentBeat?.isDownbeat ?? false;

  return (
    <div className="train-view" data-highlight={!ramp.active ? highlightMode || undefined : undefined}>
      <div className="train-current">
        <span className="train-current-bpm">{ramp.active ? ramp.currentBpm : state.bpm}</span>
        <span className="train-current-label">BPM</span>
        {/* Beat dots */}
        <div className="train-beat-dots">
          {Array.from({ length: beatsPerBar }, (_, beatIdx) => {
            const isBeatActive = ramp.active && activeBeat === beatIdx && isDownbeat;
            const isAccent = beatIdx === 0;
            return (
              <div
                key={beatIdx}
                className={`train-dot ${isBeatActive ? "active" : ""} ${isAccent && isBeatActive ? "accent" : ""}`}
              />
            );
          })}
          {ghostDots > 0 && Array.from({ length: ghostDots }, (_, i) => (
            <div key={`ghost-dot-${i}`} className="train-dot exiting" />
          ))}
        </div>
        <span className="train-current-step" style={{ visibility: ramp.active || ramp.completed ? "visible" : "hidden" }}>
          {ramp.completed
            ? "Done!"
            : ramp.active
              ? `Step ${ramp.currentStep + 1} · Bar ${ramp.barsInStep + 1}/${barsPerStep}`
              : "\u00A0"}
        </span>
      </div>

      <div className="train-summary">
        {beatsPerBar} beats · {steps.length} steps · {barsPerStep} repeats · {ramp.active ? `${formatTime(liveRemaining)} remaining` : formatTime(totalTimeSeconds)}
      </div>

      <div className="train-grid-wrapper">
        <div className="train-grid">
          {steps.map((bpm, stepIdx) => {
            const effectiveStep = cyclic && steps.length > 0 ? ramp.currentStep % steps.length : ramp.currentStep;
            const isDone = cyclic ? false : stepIdx < ramp.currentStep;
            const isCurrent = stepIdx === effectiveStep && ramp.active;
            const pct = steps.length > 1 ? stepIdx / (steps.length - 1) : 0;
            const rowOpacity = 0.15 + pct * 0.85;
            return (
              <div key={stepIdx} className="train-grid-row" data-row-idx={stepIdx} data-last-row={stepIdx === steps.length - 1 && ghostRows.length === 0 ? "" : undefined}>
                <span className={`train-grid-bpm ${isCurrent ? "current" : ""} ${isDone ? "done" : ""}`}>{bpm}</span>
                <div className="train-grid-cells">
                  {Array.from({ length: barsPerStep }, (_, barIdx) => {
                    const barDone = isDone || (isCurrent && barIdx < ramp.barsInStep);
                    const barActive = isCurrent && barIdx === ramp.barsInStep;
                    return (
                      <div
                        key={barIdx}
                        className={`train-grid-cell ${barDone ? "done" : ""} ${barActive ? "current" : ""}`}
                        data-first-cell={stepIdx === 0 && barIdx === 0 ? "" : undefined}
                        style={{ cursor: "pointer", opacity: barDone || barActive ? undefined : rowOpacity * 0.3 }}
                        onClick={() => { startSpeedRampFrom(stepIdx, bpm, barIdx); startTimer(stepIdx, barIdx); }}
                      />
                    );
                  })}
                  {/* Ghost cols exiting */}
                  {ghostCols > 0 && Array.from({ length: ghostCols }, (_, i) => (
                    <div key={`ghost-col-${i}`} className="train-grid-cell exiting" style={{ opacity: rowOpacity * 0.3 }} />
                  ))}
                </div>
              </div>
            );
          })}
          {/* Ghost rows exiting */}
          {ghostRows.map((bpm, i) => {
            const ghostIdx = steps.length + i;
            const pct = steps.length > 1 ? ghostIdx / (steps.length + ghostRows.length - 1) : 1;
            const rowOpacity = 0.15 + pct * 0.85;
            return (
              <div key={`ghost-row-${i}`} className="train-grid-row exiting">
                <span className="train-grid-bpm">{bpm}</span>
                <div className="train-grid-cells">
                  {Array.from({ length: barsPerStep + ghostCols }, (_, barIdx) => (
                    <div key={barIdx} className="train-grid-cell exiting" style={{ opacity: rowOpacity * 0.3 }} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div className="train-grid-legend-bottom">
          <span className="train-grid-corner"></span>
          <span className="train-grid-legend-label">Repeats →</span>
        </div>
      </div>

      <div className="train-config">
          <div className="train-row" onMouseEnter={() => setHighlightMode("startBpm")} onMouseLeave={() => setHighlightMode(null)}>
            <label className="train-label-tip">Start BPM<span className="train-tip">{TRAIN_DESCRIPTIONS.startBpm}</span></label>
            <div className="train-stepper">
              <button className="stepper-btn" onClick={() => { const v = Math.max(20, startBpm - 5); setStartBpm(v); saveWith({ startBpm: v }); }}>−</button>
              <input
                type="number"
                min={20}
                max={300}
                value={startBpm}
                onChange={(e) => setStartBpm(Math.max(20, Math.min(300, +e.target.value)))}
                onBlur={() => saveWith({ startBpm })}
              />
              <button className="stepper-btn" onClick={() => { const v = Math.min(300, startBpm + 5); setStartBpm(v); saveWith({ startBpm: v }); }}>+</button>
            </div>
          </div>
          <div className="train-row" onMouseEnter={() => setHighlightMode("targetBpm")} onMouseLeave={() => setHighlightMode(null)}>
            <label className="train-label-tip">Target BPM<span className="train-tip">{TRAIN_DESCRIPTIONS.targetBpm}</span></label>
            <div className="train-stepper">
              <button className="stepper-btn" onClick={() => { const v = Math.max(20, targetBpm - 5); setTargetBpm(v); saveWith({ targetBpm: v }); }}>−</button>
              <input
                type="number"
                min={20}
                max={300}
                value={targetBpm}
                onChange={(e) => setTargetBpm(Math.max(20, Math.min(300, +e.target.value)))}
                onBlur={() => saveWith({ targetBpm })}
              />
              <button className="stepper-btn" onClick={() => { const v = Math.min(300, targetBpm + 5); setTargetBpm(v); saveWith({ targetBpm: v }); }}>+</button>
            </div>
          </div>
          <div className="train-row">
            <label className="train-label-tip">Speed Up<span className="train-tip">{TRAIN_DESCRIPTIONS.increment}</span></label>
            <div className="train-stepper">
              <button className="stepper-btn" onClick={() => { const v = Math.max(1, increment - 1); setIncrement(v); saveWith({ increment: v }); }}>−</button>
              <input
                type="number"
                min={1}
                max={50}
                value={increment}
                onChange={(e) => setIncrement(Math.max(1, Math.min(50, +e.target.value)))}
                onBlur={() => saveWith({ increment })}
              />
              <button className="stepper-btn" onClick={() => { const v = Math.min(50, increment + 1); setIncrement(v); saveWith({ increment: v }); }}>+</button>
            </div>
          </div>
          {mode === "zigzag" && (
            <div className="train-row">
              <label className="train-label-tip">Slow Down<span className="train-tip">{TRAIN_DESCRIPTIONS.decrement}</span></label>
              <div className="train-stepper">
                <button className="stepper-btn" onClick={() => { const v = Math.max(1, decrement - 1); setDecrement(v); saveWith({ decrement: v }); }}>−</button>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={decrement}
                  onChange={(e) => setDecrement(Math.max(1, Math.min(50, +e.target.value)))}
                  onBlur={() => saveWith({ decrement })}
                />
                <button className="stepper-btn" onClick={() => { const v = Math.min(50, decrement + 1); setDecrement(v); saveWith({ decrement: v }); }}>+</button>
              </div>
            </div>
          )}
          <div className="train-row" onMouseEnter={() => setHighlightMode("beats")} onMouseLeave={() => setHighlightMode(null)}>
            <label className="train-label-tip">Beats<span className="train-tip">{TRAIN_DESCRIPTIONS.beats}</span></label>
            <div className="train-stepper">
              <button className="stepper-btn" onClick={() => { const v = Math.max(1, beatsPerBar - 1); setBeatsPerBar(v); saveWith({ beatsPerBar: v }); }}>−</button>
              <input
                type="number"
                min={1}
                max={12}
                value={beatsPerBar}
                onChange={(e) => setBeatsPerBar(Math.max(1, Math.min(12, +e.target.value)))}
                onBlur={() => saveWith({ beatsPerBar })}
              />
              <button className="stepper-btn" onClick={() => { const v = Math.min(12, beatsPerBar + 1); setBeatsPerBar(v); saveWith({ beatsPerBar: v }); }}>+</button>
            </div>
          </div>
          <div className="train-row" onMouseEnter={() => setHighlightMode("repeats")} onMouseLeave={() => setHighlightMode(null)}>
            <label className="train-label-tip">Repeats<span className="train-tip">{TRAIN_DESCRIPTIONS.repeat}</span></label>
            <div className="train-stepper">
              <button className="stepper-btn" onClick={() => { const v = Math.max(1, barsPerStep - 1); setBarsPerStep(v); saveWith({ barsPerStep: v }); }}>−</button>
              <input
                type="number"
                min={1}
                max={32}
                value={barsPerStep}
                onChange={(e) => setBarsPerStep(Math.max(1, Math.min(32, +e.target.value)))}
                onBlur={() => saveWith({ barsPerStep })}
              />
              <button className="stepper-btn" onClick={() => { const v = Math.min(32, barsPerStep + 1); setBarsPerStep(v); saveWith({ barsPerStep: v }); }}>+</button>
            </div>
          </div>
          <div className="train-row">
            <label className="train-label-tip">Mode<span className="train-tip">{TRAIN_DESCRIPTIONS.mode}</span></label>
            <div className="toggle-group">
              <button className={`toggle-btn ${mode === "linear" ? "active" : ""}`} onClick={() => { setMode("linear"); saveWith({ mode: "linear" }); }}>
                Linear
              </button>
              <button className={`toggle-btn ${mode === "zigzag" ? "active" : ""}`} onClick={() => { setMode("zigzag"); saveWith({ mode: "zigzag" }); }}>
                Zigzag
              </button>
            </div>
          </div>
          <div className="train-row">
            <label className="train-label-tip">Cyclic<span className="train-tip">{TRAIN_DESCRIPTIONS.cyclic}</span></label>
            <button
              className={`toggle-btn ${cyclic ? "active" : ""}`}
              onClick={() => { const next = !cyclic; setCyclic(next); saveWith({ cyclic: next }); }}
            >
              {cyclic ? "On" : "Off"}
            </button>
          </div>

        </div>

      <button
        className={`play-btn full-width ${ramp.active ? "playing" : ""}`}
        onClick={ramp.active ? handleStop : handleStart}
      >
        {ramp.active ? (
          <><svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="2" y="2" width="12" height="12" rx="1.5"/></svg> Stop</>
        ) : (
          <><svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2.5a.5.5 0 0 1 .77-.42l9 5.5a.5.5 0 0 1 0 .84l-9 5.5A.5.5 0 0 1 4 13.5z"/></svg> Play</>
        )}
      </button>
    </div>
  );
}
