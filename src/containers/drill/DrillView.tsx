import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { AppState, BeatEvent } from "../../types";
import { configureSpeedRamp, startSpeedRampFrom, onRampStep } from "../../ipc";
import "../../styles/drill-view.css";

interface DrillViewProps {
  state: AppState;
  currentBeat: BeatEvent | null;
  autoCollapse?: boolean;
  animations?: boolean;
}

export function DrillView({ state, currentBeat, autoCollapse = true, animations = true }: DrillViewProps) {
  const { t } = useTranslation();
  const ramp = state.speedRamp;
  const [highlightMode, setHighlightMode] = useState<"beats" | "repeats" | "startBpm" | "targetBpm" | null>(null);
  const [configCollapsed, setConfigCollapsed] = useState(false);
  const [userToggledConfig, setUserToggledConfig] = useState(false);
  const [startBpm, setStartBpm] = useState(ramp.startBpm);
  const [targetBpm, setTargetBpm] = useState(ramp.targetBpm);
  const [increment, setIncrement] = useState(ramp.increment);
  const [decrement, setDecrement] = useState(ramp.decrement);
  const [barsPerStep, setBarsPerStep] = useState(ramp.barsPerStep);
  const [beatsPerBar, setBeatsPerBar] = useState(ramp.beatsPerBar);
  const [mode, setMode] = useState(ramp.mode);
  const [cyclic, setCyclic] = useState(ramp.cyclic);
  const [aggressiveness, setAggressiveness] = useState(ramp.aggressiveness || "moderate");
  const [countIn, setCountIn] = useState(ramp.warmupBeats > 0);

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
      setCountIn(ramp.warmupBeats > 0);
    }
  }, [ramp.startBpm, ramp.targetBpm, ramp.increment, ramp.decrement, ramp.barsPerStep, ramp.beatsPerBar, ramp.mode, ramp.cyclic, ramp.warmupBeats, ramp.active]);

  // Auto-collapse config when playing, auto-expand on stop
  useEffect(() => {
    if (!autoCollapse || userToggledConfig) return;
    setConfigCollapsed(ramp.active);
  }, [ramp.active, userToggledConfig, autoCollapse]);

  // Reset manual override when playback stops so next play auto-collapses again
  useEffect(() => {
    if (!ramp.active) setUserToggledConfig(false);
  }, [ramp.active]);

  // Listen for ramp-step events (for future use / logging)
  useEffect(() => {
    const unlisten = onRampStep(() => {});
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  const saveWith = (overrides: Partial<{ startBpm: number; targetBpm: number; increment: number; decrement: number; barsPerStep: number; beatsPerBar: number; mode: string; cyclic: boolean; warmupBeats: number }>) => {
    configureSpeedRamp({
      startBpm: overrides.startBpm ?? startBpm,
      targetBpm: overrides.targetBpm ?? targetBpm,
      increment: overrides.increment ?? increment,
      decrement: overrides.decrement ?? decrement,
      barsPerStep: overrides.barsPerStep ?? barsPerStep,
      beatsPerBar: overrides.beatsPerBar ?? beatsPerBar,
      mode: overrides.mode ?? mode,
      cyclic: overrides.cyclic ?? cyclic,
      warmupBeats: overrides.warmupBeats ?? (countIn ? 4 : 0),
      aggressiveness: aggressiveness,
    });
  };

  // Spacebar start/stop is handled by MainWindow's unified dispatcher via "play" hotkey

  // Calculate steps for the progress visualization
  const steps: number[] = [];
  {
    let bpm = startBpm;
    let dir: "up" | "down" = "up";
    steps.push(bpm);
    if (mode === "adaptive") {
      // Adaptive: show projected linear path (actual path determined by accuracy)
      while (bpm < targetBpm && steps.length < 200) {
        bpm = Math.min(bpm + increment, targetBpm);
        steps.push(bpm);
        if (bpm >= targetBpm) break;
      }
    } else {
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
    return m > 0
      ? t("common.durationMinSec", { m, s: sec })
      : t("common.durationSec", { s: sec });
  };

  const activeBeat = currentBeat ? currentBeat.beat % beatsPerBar : -1;
  const isDownbeat = currentBeat?.isDownbeat ?? false;
  const isWarmingUp = ramp.active && ramp.warmupCount < ramp.warmupBeats;
  const warmupRemaining = ramp.warmupBeats - ramp.warmupCount;

  return (
    <div className="drill-view" data-highlight={!ramp.active ? highlightMode || undefined : undefined} data-animations={animations ? undefined : "off"} data-active={ramp.active ? "" : undefined}>
      <div className="drill-current view-stagger-item" style={{ animationDelay: '0ms' }}>
        {isWarmingUp ? (
          <>
            <span className="drill-warmup-label">{t("drill.startingIn")}</span>
            <span className="drill-current-bpm drill-warmup-number">{warmupRemaining}</span>
          </>
        ) : (
          <>
            <span className="drill-current-bpm">{ramp.active ? ramp.currentBpm : startBpm}</span>
            <span className="drill-current-label">BPM</span>
          </>
        )}
        {/* Beat dots — hidden during warmup countdown */}
        <div className="drill-beat-dots" style={{ visibility: isWarmingUp ? 'hidden' : 'visible' }}>
          {Array.from({ length: beatsPerBar }, (_, beatIdx) => {
            const isBeatActive = ramp.active && !isWarmingUp && activeBeat === beatIdx && isDownbeat;
            const isAccent = beatIdx === 0;
            return (
              <div
                key={beatIdx}
                className={`drill-dot ${isBeatActive ? "active" : ""} ${isAccent && isBeatActive ? "accent" : ""}`}
              />
            );
          })}
          {ghostDots > 0 && Array.from({ length: ghostDots }, (_, i) => (
            <div key={`ghost-dot-${i}`} className="drill-dot exiting" />
          ))}
        </div>
        <span className="drill-current-step" style={{ visibility: (ramp.active && !isWarmingUp) || ramp.completed ? "visible" : "hidden" }}>
          {ramp.completed
            ? "Done!"
            : ramp.active
              ? t("drill.stepBar", { step: ramp.currentStep + 1, bar: ramp.barsInStep + 1, bars: barsPerStep })
              : "\u00A0"}
        </span>
      </div>

      {/* `data-hint` anchors the `drill-first-open` hint (O7) — the card is
          rendered by MainWindow, next to the controls the copy talks about. */}
      <div data-hint="drill-first-open" className={`drill-config view-stagger-item ${configCollapsed ? "collapsed" : ""}`} style={{ animationDelay: '30ms' }}>
        <button className="drill-config-toggle" onClick={() => { setUserToggledConfig(true); setConfigCollapsed(!configCollapsed); }}>
          <span className="drill-config-summary">
            {startBpm}
            <svg className="drill-config-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="13 6 19 12 13 18"/></svg>
            {targetBpm}
            <span className="drill-config-sep"><svg width="5" height="5" viewBox="0 0 5 5"><circle cx="2.5" cy="2.5" r="2.5" fill="currentColor"/></svg></span>
            <svg className="drill-config-arrow up" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
            {increment}
            {mode === "zigzag" && <>
              <svg className="drill-config-arrow down" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>
              {decrement}
            </>}
            <span className="drill-config-sep"><svg width="5" height="5" viewBox="0 0 5 5"><circle cx="2.5" cy="2.5" r="2.5" fill="currentColor"/></svg></span>
            {t("drill.beatsSummary", { count: beatsPerBar })}
            <span className="drill-config-sep"><svg width="5" height="5" viewBox="0 0 5 5"><circle cx="2.5" cy="2.5" r="2.5" fill="currentColor"/></svg></span>
            {t("drill.repsSummary", { count: barsPerStep })}
          </span>
          <svg className={`drill-config-chevron ${configCollapsed ? "" : "open"}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
        <div className="drill-config-body">
          <div className="drill-row view-stagger-item" style={{ animationDelay: '40ms' }}>
            <label className="drill-label-tip">{t("drill.mode")}<span className="drill-tip">{t("drill.desc.mode")}</span></label>
            <div className="toggle-group">
              <button className={`toggle-btn ${mode === "linear" ? "active" : ""}`} onClick={() => { setMode("linear"); saveWith({ mode: "linear" }); }}>
                {t("drill.modeLinear")}
              </button>
              <button className={`toggle-btn ${mode === "zigzag" ? "active" : ""}`} onClick={() => { setMode("zigzag"); saveWith({ mode: "zigzag" }); }}>
                {t("drill.modeZigzag")}
              </button>
              <button className={`toggle-btn ${mode === "adaptive" ? "active" : ""}`} onClick={() => { setMode("adaptive"); setTargetBpm(300); saveWith({ mode: "adaptive", targetBpm: 300 }); }}>
                {t("drill.modeAdaptive")}
              </button>
            </div>
          </div>
          {mode === "adaptive" && (
          <div className="drill-row view-stagger-item" style={{ animationDelay: '55ms' }}>
            <label className="drill-label-tip">{t("drill.aggr")}<span className="drill-tip">{t("drill.desc.aggressiveness")}</span></label>
            <div className="toggle-group">
              <button className={`toggle-btn ${aggressiveness === "conservative" ? "active" : ""}`} onClick={() => { setAggressiveness("conservative"); saveWith({ mode: "adaptive" }); }}>
                {t("drill.aggrGentle")}
              </button>
              <button className={`toggle-btn ${aggressiveness === "moderate" ? "active" : ""}`} onClick={() => { setAggressiveness("moderate"); saveWith({ mode: "adaptive" }); }}>
                {t("drill.aggrModerate")}
              </button>
              <button className={`toggle-btn ${aggressiveness === "aggressive" ? "active" : ""}`} onClick={() => { setAggressiveness("aggressive"); saveWith({ mode: "adaptive" }); }}>
                {t("drill.aggrPush")}
              </button>
            </div>
          </div>
          )}
          <div className="drill-row view-stagger-item" style={{ animationDelay: '70ms' }} onMouseEnter={() => setHighlightMode("startBpm")} onMouseLeave={() => setHighlightMode(null)}>
            <label className="drill-label-tip">{t("drill.startBpm")}<span className="drill-tip">{t("drill.desc.startBpm")}</span></label>
            <div className="drill-stepper">
              <button className="stepper-btn" onClick={() => { const v = Math.max(20, startBpm - 5); setStartBpm(v); saveWith({ startBpm: v }); }}>−</button>
              <input
                type="number"
                min={20}
                max={300}
                value={startBpm}
                onChange={(e) => setStartBpm(Math.max(20, Math.min(300, +e.target.value)))}
                onBlur={() => { const clamped = Math.max(20, Math.min(300, startBpm)); if (clamped > targetBpm) { setTargetBpm(clamped); saveWith({ startBpm: clamped, targetBpm: clamped }); } else { saveWith({ startBpm: clamped }); } }}
              />
              <button className="stepper-btn" onClick={() => { const v = Math.min(300, startBpm + 5); setStartBpm(v); if (v > targetBpm) { setTargetBpm(v); saveWith({ startBpm: v, targetBpm: v }); } else { saveWith({ startBpm: v }); } }}>+</button>
            </div>
          </div>
          {mode !== "adaptive" && (
          <div className="drill-row view-stagger-item" style={{ animationDelay: '100ms' }} onMouseEnter={() => setHighlightMode("targetBpm")} onMouseLeave={() => setHighlightMode(null)}>
            <label className="drill-label-tip">{t("drill.targetBpm")}<span className="drill-tip">{t("drill.desc.targetBpm")}</span></label>
            <div className="drill-stepper">
              <button className="stepper-btn" onClick={() => { const v = Math.max(startBpm, targetBpm - 5); setTargetBpm(v); saveWith({ targetBpm: v }); }}>−</button>
              <input
                type="number"
                min={startBpm}
                max={300}
                value={targetBpm}
                onChange={(e) => setTargetBpm(Math.max(startBpm, Math.min(300, +e.target.value)))}
                onBlur={() => { const clamped = Math.max(startBpm, Math.min(300, targetBpm)); setTargetBpm(clamped); saveWith({ targetBpm: clamped }); }}
              />
              <button className="stepper-btn" onClick={() => { const v = Math.min(300, targetBpm + 5); setTargetBpm(v); saveWith({ targetBpm: v }); }}>+</button>
            </div>
          </div>
          )}
          {mode !== "adaptive" && (
          <div className="drill-row view-stagger-item" style={{ animationDelay: '130ms' }}>
            <label className="drill-label-tip">{t("drill.speedUp")}<span className="drill-tip">{t("drill.desc.increment")}</span></label>
            <div className="drill-stepper">
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
          )}
          {mode === "zigzag" && (
            <div className="drill-row view-stagger-item" style={{ animationDelay: '160ms' }}>
              <label className="drill-label-tip">{t("drill.slowDown")}<span className="drill-tip">{t("drill.desc.decrement")}</span></label>
              <div className="drill-stepper">
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
          <div className="drill-row view-stagger-item" style={{ animationDelay: '190ms' }} onMouseEnter={() => setHighlightMode("beats")} onMouseLeave={() => setHighlightMode(null)}>
            <label className="drill-label-tip">{t("drill.beats")}<span className="drill-tip">{t("drill.desc.beats")}</span></label>
            <div className="drill-stepper">
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
          <div className="drill-row view-stagger-item" style={{ animationDelay: '220ms' }} onMouseEnter={() => setHighlightMode("repeats")} onMouseLeave={() => setHighlightMode(null)}>
            <label className="drill-label-tip">{t("drill.repeats")}<span className="drill-tip">{t("drill.desc.repeat")}</span></label>
            <div className="drill-stepper">
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
          <div className="drill-row view-stagger-item" style={{ animationDelay: '250ms' }}>
            <label className="drill-label-tip">{t("drill.countdown")}<span className="drill-tip">{t("drill.desc.countdown")}</span></label>
            <button
              className={`toggle-btn ${countIn ? "active" : ""}`}
              onClick={() => { const next = !countIn; setCountIn(next); saveWith({ warmupBeats: next ? 4 : 0 }); }}
            >
              {countIn ? t("common.on") : t("common.off")}
            </button>
          </div>
          {mode !== "adaptive" && (
          <div className="drill-row view-stagger-item" style={{ animationDelay: '280ms' }}>
            <label className="drill-label-tip">{t("drill.cyclic")}<span className="drill-tip">{t("drill.desc.cyclic")}</span></label>
            <button
              className={`toggle-btn ${cyclic ? "active" : ""}`}
              onClick={() => { const next = !cyclic; setCyclic(next); saveWith({ cyclic: next }); }}
            >
              {cyclic ? t("common.on") : t("common.off")}
            </button>
          </div>
          )}

        </div>
      </div>

      {/* Idle empty state (ONBOARDING_PLAN §6): the grid below always has
          rows, so the screen never looks empty — but until the drill runs,
          nothing on it says what the selected mode will do. One line, only
          while idle, so it disappears the moment the ramp starts. */}
      {!ramp.active && (
        <div
          className="drill-idle-hint view-stagger-item"
          style={{ animationDelay: '300ms' }}
          data-testid="drill-idle-hint"
        >
          {t(`emptyStates.drill.${mode === "zigzag" ? "zigzag" : mode === "adaptive" ? "adaptive" : "linear"}`)}
        </div>
      )}

      <div className="drill-summary view-stagger-item" style={{ animationDelay: '310ms' }}>
        {t("drill.summary", {
          beats: beatsPerBar,
          steps: steps.length,
          repeats: barsPerStep,
          time: ramp.active
            ? t("drill.timeRemaining", { time: formatTime(liveRemaining) })
            : formatTime(totalTimeSeconds),
        })}
      </div>

      <div className="drill-grid-wrapper">
        <div className="drill-grid">
          {steps.map((bpm, stepIdx) => {
            const effectiveStep = cyclic && steps.length > 0 ? ramp.currentStep % steps.length : ramp.currentStep;
            const isDone = ramp.active ? (cyclic ? false : stepIdx < ramp.currentStep) : false;
            const isCurrent = stepIdx === effectiveStep && ramp.active;
            const pct = steps.length > 1 ? stepIdx / (steps.length - 1) : 0;
            const rowOpacity = 0.15 + pct * 0.85;
            return (
              <div
                key={stepIdx}
                className="drill-grid-row"
                data-row-idx={stepIdx}
                data-last-row={stepIdx === steps.length - 1 && ghostRows.length === 0 ? "" : undefined}
                // The row stagger (~50ms) gives a clear top-to-bottom
                // cascade — by the time row N starts, row N-1 is already
                // well into its fade. Cells use the SAME base delay plus
                // a tiny per-cell offset for a subtle left-to-right shimmer
                // inside each row without bleeding into the next row's
                // start (cell stagger × column count ≈ row stagger).
                style={{ animationDelay: `${300 + stepIdx * 50}ms` }}
              >
                <span className={`drill-grid-bpm ${isCurrent ? "current" : ""} ${isDone ? "done" : ""}`}>{bpm}</span>
                <div className="drill-grid-cells">
                  {Array.from({ length: barsPerStep }, (_, barIdx) => {
                    const barDone = isDone || (isCurrent && barIdx < ramp.barsInStep);
                    const barActive = isCurrent && barIdx === ramp.barsInStep;
                    return (
                      <div
                        key={barIdx}
                        className={`drill-grid-cell ${barDone ? "done" : ""} ${barActive ? "current" : ""}`}
                        data-first-cell={stepIdx === 0 && barIdx === 0 ? "" : undefined}
                        style={{ cursor: "pointer", opacity: barDone || barActive ? undefined : rowOpacity * 0.3, animationDelay: `${300 + stepIdx * 50 + barIdx * 4}ms` }}
                        onClick={() => { startSpeedRampFrom(stepIdx, bpm, barIdx); startTimer(stepIdx, barIdx); }}
                      />
                    );
                  })}
                  {/* Ghost cols exiting */}
                  {ghostCols > 0 && Array.from({ length: ghostCols }, (_, i) => (
                    <div key={`ghost-col-${i}`} className="drill-grid-cell exiting" style={{ opacity: rowOpacity * 0.3 }} />
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
              <div key={`ghost-row-${i}`} className="drill-grid-row exiting">
                <span className="drill-grid-bpm">{bpm}</span>
                <div className="drill-grid-cells">
                  {Array.from({ length: barsPerStep + ghostCols }, (_, barIdx) => (
                    <div key={barIdx} className="drill-grid-cell exiting" style={{ opacity: rowOpacity * 0.3 }} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div className="drill-grid-legend-bottom">
          <span className="drill-grid-corner"></span>
          <span className="drill-grid-legend-label">{t("drill.repeatsLegend")}</span>
        </div>
      </div>
    </div>
  );
}
