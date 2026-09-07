import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { AppState, BeatEvent } from "../../types";
import { configureSpeedRamp, startSpeedRampFrom, onRampStep } from "../../ipc";
import { SOUND_TYPES } from "../../constants/metronome";
import { DrillPlanLine, type PlanField } from "./DrillPlanLine";
import { DrillClimb } from "./DrillClimb";
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
  // Collapsed by default: the plan line says what the drill is, and the
  // climb below is the thing worth looking at. The form opens when asked
  // for — a phrase in the plan line, or the chevron (UI_DECISIONS U3.1).
  const [configCollapsed, setConfigCollapsed] = useState(true);
  const [openField, setOpenField] = useState<PlanField>(null);
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

  // Ghost elements for smooth exit animations. They were named rows and cols
  // when the plan was drawn as a matrix; a step is a column of the climb now
  // and a repeat is a cell inside it, so they are named for what they are.
  const prevStepsRef = useRef<number[]>([]);
  const prevBarsRef = useRef(barsPerStep);
  const prevBeatsRef = useRef(beatsPerBar);
  const [ghostSteps, setGhostSteps] = useState<number[]>([]);
  const [ghostBars, setGhostBars] = useState(0);
  const [ghostDots, setGhostDots] = useState(0);
  const ghostStepTimer = useRef<ReturnType<typeof setTimeout>>();
  const ghostBarTimer = useRef<ReturnType<typeof setTimeout>>();
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

  // Collapse the config when a run starts. It does NOT re-open on stop: the
  // form used to spring back and push the step grid off the bottom of the
  // window, which is where the grid spent most of its life.
  useEffect(() => {
    if (!autoCollapse || userToggledConfig) return;
    if (ramp.active) setConfigCollapsed(true);
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

  // Detect step/bar shrinks and create ghost elements for exit animation
  useEffect(() => {
    const prev = prevStepsRef.current;
    if (prev.length > steps.length) {
      setGhostSteps(prev.slice(steps.length));
      clearTimeout(ghostStepTimer.current);
      ghostStepTimer.current = setTimeout(() => setGhostSteps([]), 250);
    } else {
      setGhostSteps([]);
    }
    prevStepsRef.current = [...steps];
  }, [steps.length, startBpm, targetBpm, increment, decrement, mode]);

  useEffect(() => {
    const prev = prevBarsRef.current;
    if (prev > barsPerStep) {
      setGhostBars(prev - barsPerStep);
      clearTimeout(ghostBarTimer.current);
      ghostBarTimer.current = setTimeout(() => setGhostBars(0), 200);
    } else {
      setGhostBars(0);
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
  // The live count-in is the engine's now, not the ramp's (U9.5). `ramp.active`
  // still gates the readout because this is the drill's screen and only a
  // drill's count-in belongs on it — a chain's is reported by the transport.
  const liveCountIn = state.countIn;
  const isWarmingUp = ramp.active && liveCountIn.done < liveCountIn.beats;
  const warmupRemaining = liveCountIn.beats - liveCountIn.done;
  // The ramp plays the global click, so the plan can state which one it is.
  const soundName = t(
    `sound.${SOUND_TYPES.find((s) => s.id === state.soundType)?.id ?? "click"}`,
  );
  // Every bar the drill will ask for — the size of the exercise in the unit a
  // player actually counts in, and exactly the number of cells the climb draws.
  const totalBars = steps.length * barsPerStep;
  // The readout only exists while there is something to read. At rest it was a
  // 5rem "80" over four dead circles above the sentence that is supposed to be
  // this screen's subject, and every number in it was already on the page.
  const showLive = ramp.active || ramp.completed;

  return (
    <div className="drill-view" data-highlight={!ramp.active ? highlightMode || undefined : undefined} data-animations={animations ? undefined : "off"} data-active={ramp.active ? "" : undefined}>
      {/* The plan, and the numbers it adds up to, on one line: the sentence at
          the left, the mode and the run's size at the right, as drawn. The
          modes moved off the label row because they belong to the plan rather
          than to the word "THE PLAN".

          `data-hint` anchors the `drill-first-open` hint (O7) — the card is
          rendered by MainWindow, next to the controls the copy talks about. */}
      <div className="drill-stage-head view-stagger-item" style={{ animationDelay: '0ms' }}>
        <div className="drill-stage-plan">
          <span className="stage-label">{t("drill.planLabel")}</span>
          <DrillPlanLine
            startBpm={startBpm}
            targetBpm={targetBpm}
            increment={increment}
            decrement={decrement}
            beatsPerBar={beatsPerBar}
            barsPerStep={barsPerStep}
            mode={mode}
            soundName={soundName}
            openField={openField}
            onOpenField={(field) => {
              setOpenField(field);
              setUserToggledConfig(true);
              setConfigCollapsed(field === null);
            }}
          />
        </div>

        <div className="drill-stage-meta">
          <div className="drill-modes">
            <button
              className={`toggle-btn ${mode === "linear" ? "active" : ""}`}
              onClick={() => { setMode("linear"); saveWith({ mode: "linear" }); }}
            >
              {t("drill.modeLinear")}
            </button>
            <button
              className={`toggle-btn ${mode === "zigzag" ? "active" : ""}`}
              onClick={() => { setMode("zigzag"); saveWith({ mode: "zigzag" }); }}
            >
              {t("drill.modeZigzag")}
            </button>
            {/* Adaptive is the one mode whose behaviour depends on the audio
                input, so it says so on its face (UI_DECISIONS U3.4). */}
            <button
              className={`toggle-btn ${mode === "adaptive" ? "active" : ""}`}
              onClick={() => { setMode("adaptive"); setTargetBpm(300); saveWith({ mode: "adaptive", targetBpm: 300 }); }}
            >
              {t("drill.modeAdaptive")}
              <span className="drill-mode-badge">{t("drill.listensBadge")}</span>
            </button>
          </div>

          <div className="drill-run-stats">
            {t("drill.runStats", {
              steps: steps.length,
              bars: totalBars,
              time: ramp.active
                ? t("drill.timeRemaining", { time: formatTime(liveRemaining) })
                : t("drill.aboutTime", { time: formatTime(totalTimeSeconds) }),
            })}
          </div>
        </div>
      </div>

      <div data-hint="drill-first-open" className={`drill-config view-stagger-item ${configCollapsed ? "collapsed" : ""}`} style={{ animationDelay: '30ms' }}>
        <button
          className="drill-config-toggle"
          onClick={() => {
            setUserToggledConfig(true);
            setOpenField(null);
            setConfigCollapsed(!configCollapsed);
          }}
        >
          <span className="drill-config-summary">{t("drill.allSettings")}</span>
          <svg className={`drill-config-chevron ${configCollapsed ? "" : "open"}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
        <div className="drill-config-body" data-showing={openField ?? undefined}>
          {mode === "adaptive" && (
          <div className="drill-row view-stagger-item" data-field="more" style={{ animationDelay: '55ms' }}>
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
          <div className="drill-row view-stagger-item" data-field="tempo" style={{ animationDelay: '70ms' }} onMouseEnter={() => setHighlightMode("startBpm")} onMouseLeave={() => setHighlightMode(null)}>
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
          <div className="drill-row view-stagger-item" data-field="tempo" style={{ animationDelay: '100ms' }} onMouseEnter={() => setHighlightMode("targetBpm")} onMouseLeave={() => setHighlightMode(null)}>
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
          <div className="drill-row view-stagger-item" data-field="rate" style={{ animationDelay: '130ms' }}>
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
            <div className="drill-row view-stagger-item" data-field="rate" style={{ animationDelay: '160ms' }}>
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
          <div className="drill-row view-stagger-item" data-field="shape" style={{ animationDelay: '190ms' }} onMouseEnter={() => setHighlightMode("beats")} onMouseLeave={() => setHighlightMode(null)}>
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
          <div className="drill-row view-stagger-item" data-field="shape" style={{ animationDelay: '220ms' }} onMouseEnter={() => setHighlightMode("repeats")} onMouseLeave={() => setHighlightMode(null)}>
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
          <div className="drill-row view-stagger-item" data-field="more" style={{ animationDelay: '250ms' }}>
            <label className="drill-label-tip">{t("drill.countdown")}<span className="drill-tip">{t("drill.desc.countdown")}</span></label>
            <button
              className={`toggle-btn ${countIn ? "active" : ""}`}
              onClick={() => { const next = !countIn; setCountIn(next); saveWith({ warmupBeats: next ? 4 : 0 }); }}
            >
              {countIn ? t("common.on") : t("common.off")}
            </button>
          </div>
          {mode !== "adaptive" && (
          <div className="drill-row view-stagger-item" data-field="more" style={{ animationDelay: '280ms' }}>
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

      {/* The live readout, next to the picture it is narrating. Everything
          the old header block carried is here — tempo, the count-in, the
          beat dots and the step/bar position — but only while a run is
          actually producing those numbers. It takes the row the idle hint
          gives up on start, so pressing Start does not shove the climb. */}
      {showLive && (
        <div className="drill-live" data-testid="drill-live">
          {isWarmingUp ? (
            <>
              <span className="drill-warmup-label">{t("drill.startingIn")}</span>
              <span className="drill-current-bpm drill-warmup-number">{warmupRemaining}</span>
            </>
          ) : (
            <>
              <span className="drill-current-bpm">{ramp.active ? ramp.currentBpm : startBpm}</span>
              <span className="drill-current-label">{t("drill.bpmUnit")}</span>
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
          <span className="drill-current-step">
            {ramp.completed
              ? t("drill.finished")
              : t("drill.stepBar", { step: ramp.currentStep + 1, bar: ramp.barsInStep + 1, bars: barsPerStep })}
          </span>
        </div>
      )}

      <DrillClimb
        steps={steps}
        barsPerStep={barsPerStep}
        currentStep={ramp.currentStep}
        barsInStep={ramp.barsInStep}
        active={ramp.active}
        cyclic={cyclic}
        ghostSteps={ghostSteps}
        ghostBars={ghostBars}
        onJump={(stepIdx, bpm, barIdx) => {
          startSpeedRampFrom(stepIdx, bpm, barIdx);
          startTimer(stepIdx, barIdx);
        }}
      />
    </div>
  );
}
