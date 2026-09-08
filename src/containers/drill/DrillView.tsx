import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { AppState, BeatEvent } from "../../types";
import { startSpeedRampFrom, onRampStep, setSoundType } from "../../ipc";
import { useDrillPlan } from "./useDrillPlan";
import { SOUND_TYPES } from "../../constants/metronome";
import { SubdivisionIcon } from "../../components/MetronomeIcons";
import type { Subdivision } from "../../types";
import { DrillPlanLine, type PlanField, type PlanAnchors } from "./DrillPlanLine";
import {
  DrillConfigPopover,
  DrillPopoverRow,
  DrillPopoverChoices,
  DrillNumberField,
} from "./DrillConfigPopover";
import { DrillClimb } from "./DrillClimb";
import { useDrillRuns } from "./useDrillRuns";
import "../../styles/drill-view.css";

/** Ticks per beat a drill can play — the same six the metronome offers. */
const SUBDIVISIONS = [1, 2, 3, 4, 5, 6] as const;

/** The three ramp shapes, each with the sentence its tooltip shows. */
const MODES = [
  { id: "linear", labelKey: "drill.modeLinear" },
  { id: "zigzag", labelKey: "drill.modeZigzag" },
  { id: "adaptive", labelKey: "drill.modeAdaptive" },
] as const;

/** How hard Adaptive pushes. Only reachable while Adaptive is selected. */
const AGGRESSIVENESS = [
  { id: "conservative", labelKey: "drill.aggrGentle" },
  { id: "moderate", labelKey: "drill.aggrModerate" },
  { id: "aggressive", labelKey: "drill.aggrPush" },
] as const;

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
  // Which settings window is open, and the token it hangs from. Nothing is
  // open at rest: the plan line says what the drill is and the climb below is
  // the thing worth looking at (UI_DECISIONS U3.1).
  const [openField, setOpenField] = useState<PlanField>(null);
  const anchors: PlanAnchors = useRef({});
  // The plan, and the one way to change it. Destructured so every place that
  // READS a setting reads it by name, exactly as it did when these were
  // eleven separate pieces of state.
  const { plan, edit } = useDrillPlan(ramp);
  const {
    startBpm,
    targetBpm,
    increment,
    decrement,
    barsPerStep,
    beatsPerBar,
    subdivision,
    mode,
    cyclic,
    aggressiveness,
  } = plan;
  const countIn = plan.warmupBeats > 0;

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

  // A settings window does not survive the start of a run. It is a floating
  // card over the climb, and the climb is the thing you watch while playing.
  useEffect(() => {
    if (autoCollapse && ramp.active) setOpenField(null);
  }, [ramp.active, autoCollapse]);

  // Listen for ramp-step events (for future use / logging)
  useEffect(() => {
    const unlisten = onRampStep(() => {});
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  const closeField = useCallback(() => setOpenField(null), []);

  // Spacebar start/stop is handled by MainWindow's unified dispatcher via "play" hotkey

  // The tempos the climb will draw, in the order the ramp will play them.
  // This mirrors `advance_ramp` in engine.rs and has to keep mirroring it: it
  // is the picture of a plan the engine is going to execute, and the two
  // disagreeing means the staircase is a lie.
  //
  // Like `advance_ramp`, it thinks in OUT (toward the target) and BACK
  // (toward the start) rather than up and down, so a target below the start
  // is a descending drill rather than an impossible one.
  const descending = targetBpm < startBpm;
  const towardTarget = (bpm: number, by: number) =>
    descending
      ? Math.max(bpm - by, targetBpm)
      : Math.min(bpm + by, targetBpm);
  const towardStart = (bpm: number, by: number) =>
    descending
      ? Math.min(bpm + by, startBpm)
      : Math.max(bpm - by, startBpm);
  const atTarget = (bpm: number) => (descending ? bpm <= targetBpm : bpm >= targetBpm);
  const atStart = (bpm: number) => (descending ? bpm >= startBpm : bpm <= startBpm);

  const steps: number[] = [];
  {
    let bpm = startBpm;
    let goingOut = true;
    steps.push(bpm);
    // A plan whose start IS its target is one step, not two. It used to draw
    // the same tempo twice, because the first move landed on the target and
    // was pushed as if it had gone somewhere.
    if (!atTarget(bpm)) {
      if (mode === "adaptive") {
        // Adaptive climbs until the playing falls apart, so the picture is a
        // projection: the linear path it would take if nothing went wrong.
        while (!atTarget(bpm) && steps.length < 200) {
          bpm = towardTarget(bpm, increment);
          steps.push(bpm);
        }
      } else {
        for (let i = 0; i < 200; i++) {
          if (mode === "zigzag") {
            // Two forward, one back — and "forward" is whichever way the plan
            // is pointing.
            if (goingOut) {
              bpm = towardTarget(bpm, increment);
              if (atTarget(bpm)) { steps.push(bpm); break; }
              goingOut = false;
            } else {
              bpm = towardStart(bpm, decrement);
              goingOut = true;
            }
          } else if (goingOut) {
            bpm = towardTarget(bpm, increment);
            if (atTarget(bpm)) {
              steps.push(bpm);
              if (cyclic) { goingOut = false; continue; }
              break;
            }
          } else {
            // Cyclic: the round trip home.
            bpm = towardStart(bpm, increment);
            if (atStart(bpm)) { steps.push(bpm); break; }
          }
          steps.push(bpm);
        }
      }
    }
  }

  // The last run, drawn under tonight's plan (U3.3). This has to sit below
  // `steps`, because what the underlay is matched against is the ladder the
  // climb is about to draw — by tempo, never by column index. The same hook
  // records tonight's run when it ends, so the two halves of U3.3 cannot
  // drift apart in the way the two climbs once did.
  const { underlay: lastRun, markJump } = useDrillRuns(ramp, plan, steps);

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
  // Defended rather than assumed. Rust fills this by serde default on the way
  // out, but a hot-reloaded frontend can render against a binary that predates
  // the field — and reading `.done` off nothing takes the whole screen down
  // with it, which is what a blank drill page turned out to be.
  const liveCountIn = state.countIn ?? { beats: 0, done: 0 };
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
  // What the plan adds up to. It heads the stage, and it is also the line
  // under each settings window's divider — change a value and the size of the
  // exercise answers where you are already looking.
  const planSummary = t("drill.runStats", {
    steps: steps.length,
    bars: totalBars,
    time: ramp.active
      ? t("drill.timeRemaining", { time: formatTime(liveRemaining) })
      : t("drill.aboutTime", { time: formatTime(totalTimeSeconds) }),
  });

  return (
    <div className="drill-view" data-highlight={!ramp.active ? highlightMode || undefined : undefined} data-animations={animations ? undefined : "off"} data-active={ramp.active ? "" : undefined}>
      {/* The plan, and the numbers it adds up to, on one line: the sentence at
          the left, the mode and the run's size at the right, as drawn.

          `data-hint` anchors the `drill-first-open` hint (O7) — the card is
          rendered by MainWindow, next to the controls the copy talks about. */}
      <div className="drill-stage-head view-stagger-item" style={{ animationDelay: '0ms' }}>
        <div className="drill-stage-plan" data-hint="drill-first-open">
          <span className="stage-label">{t("drill.planLabel")}</span>
          <DrillPlanLine
            startBpm={startBpm}
            targetBpm={targetBpm}
            increment={increment}
            decrement={decrement}
            beatsPerBar={beatsPerBar}
            barsPerStep={barsPerStep}
            mode={mode}
            subdivision={subdivision}
            soundName={soundName}
            openField={openField}
            onOpenField={setOpenField}
            anchors={anchors}
          />

          {/* The settings, where they were asked for. One window per phrase,
              holding only the fields that phrase covers — the eight-row "All
              settings" disclosure this replaced is gone, along with the
              dimming that hid the rows you had not clicked. */}
          {openField === "tempo" && (
            <DrillConfigPopover
              anchor={anchors.current.tempo ?? null}
              onClose={closeField}
              // Every window is named for the PHRASE that opens it, never
              // for a field inside it. Naming one "Start BPM" gave a dialog
              // the same accessible name as one of its own controls, which is
              // ambiguous to a screen reader and to anything else that goes
              // looking by name.
              label={t("metronome.tempo")}
              note={planSummary}
            >
              <DrillPopoverRow label={t("drill.startBpm")} tip={t("drill.desc.startBpm")} onHover={(on) => setHighlightMode(on ? "startBpm" : null)}>
                <DrillNumberField
                  value={startBpm}
                  min={20}
                  max={300}
                  step={5}
                  label={t("drill.startBpm")}
                  onCommit={(v) => edit({ startBpm: v })}
                />
              </DrillPopoverRow>
              {mode !== "adaptive" && (
                <DrillPopoverRow label={t("drill.targetBpm")} tip={t("drill.desc.targetBpm")} onHover={(on) => setHighlightMode(on ? "targetBpm" : null)}>
                  {/* Floor of 20, not of the start tempo. A target below the
                      start is a descending drill — "play it at 120 and work
                      down to 80 until it is clean" — and the old floor made
                      that plan impossible to type. */}
                  <DrillNumberField
                    value={targetBpm}
                    min={20}
                    max={300}
                    step={5}
                    label={t("drill.targetBpm")}
                    onCommit={(v) => edit({ targetBpm: v })}
                  />
                </DrillPopoverRow>
              )}
            </DrillConfigPopover>
          )}

          {openField === "rate" && (
            <DrillConfigPopover
              anchor={anchors.current.rate ?? null}
              onClose={closeField}
              label={`+${increment} ${t("drill.bpmUnit")}`}
              note={planSummary}
            >
              <DrillPopoverRow label={t("drill.speedUp")} tip={t("drill.desc.increment")}>
                <DrillNumberField
                  value={increment}
                  min={1}
                  max={50}
                  label={t("drill.speedUp")}
                  onCommit={(v) => edit({ increment: v })}
                />
              </DrillPopoverRow>
              {mode === "zigzag" && (
                <DrillPopoverRow label={t("drill.slowDown")} tip={t("drill.desc.decrement")}>
                  <DrillNumberField
                    value={decrement}
                    min={1}
                    max={50}
                    label={t("drill.slowDown")}
                    onCommit={(v) => edit({ decrement: v })}
                  />
                </DrillPopoverRow>
              )}
            </DrillConfigPopover>
          )}

          {/* One window per phrase, and these two are separate phrases: the
              bar count is on the loud line because it shapes the climb, the
              beat count is on the quiet line because it shapes a bar. They
              shared a window at first and the owner found what that does —
              clicking "6 beats per bar" opened a card belonging to "every 12
              bars", four inches away from the words that were clicked. */}
          {openField === "repeats" && (
            <DrillConfigPopover
              anchor={anchors.current.repeats ?? null}
              onClose={closeField}
              label={t("drill.everyBars", { count: barsPerStep })}
              note={planSummary}
            >
              <DrillPopoverRow label={t("drill.repeats")} tip={t("drill.desc.repeat")} onHover={(on) => setHighlightMode(on ? "repeats" : null)}>
                <DrillNumberField
                  value={barsPerStep}
                  min={1}
                  max={32}
                  unit={t("drill.barsUnit")}
                  label={t("drill.repeats")}
                  onCommit={(v) => edit({ barsPerStep: v })}
                />
              </DrillPopoverRow>
            </DrillConfigPopover>
          )}

          {openField === "beats" && (
            <DrillConfigPopover
              anchor={anchors.current.beats ?? null}
              onClose={closeField}
              label={t("drill.beatsSummary", { count: beatsPerBar })}
              note={planSummary}
            >
              <DrillPopoverRow label={t("drill.beats")} tip={t("drill.desc.beats")} onHover={(on) => setHighlightMode(on ? "beats" : null)}>
                <DrillNumberField
                  value={beatsPerBar}
                  min={1}
                  max={12}
                  label={t("drill.beats")}
                  onCommit={(v) => edit({ beatsPerBar: v })}
                />
              </DrillPopoverRow>
            </DrillConfigPopover>
          )}

          {/* The subdivision, which a drill could not have until now: the
              engine pinned every ramp to quarter notes, so the one exercise
              where a player most wants a subdivided pulse was the one place
              they could not ask for one. */}
          {openField === "sub" && (
            <DrillConfigPopover
              anchor={anchors.current.sub ?? null}
              onClose={closeField}
              label={t("metronome.subdivision")}
              note={planSummary}
            >
              <DrillPopoverChoices label={t("metronome.subdivision")}>
                {SUBDIVISIONS.map((sub) => (
                  <button
                    key={sub}
                    className={`drill-choice ${subdivision === sub ? "active" : ""}`}
                    aria-pressed={subdivision === sub}
                    onClick={() => edit({ subdivision: sub })}
                  >
                    <SubdivisionIcon sub={sub as Subdivision} size={22} />
                    <span className="drill-choice-label">{t(`subdiv.${sub}`)}</span>
                  </button>
                ))}
              </DrillPopoverChoices>
            </DrillConfigPopover>
          )}

          {/* The click. This is global state, the same setting the header chip
              changes — deliberately, because a drill playing a different sound
              from the metronome would be a second click to keep in sync. */}
          {openField === "sound" && (
            <DrillConfigPopover
              anchor={anchors.current.sound ?? null}
              onClose={closeField}
              label={t("metronome.soundLabel")}
            >
              <DrillPopoverChoices label={t("metronome.soundLabel")}>
                {SOUND_TYPES.map((snd) => (
                  <button
                    key={snd.id}
                    className={`drill-choice ${state.soundType === snd.id ? "active" : ""}`}
                    aria-pressed={state.soundType === snd.id}
                    onClick={() => {
                      void setSoundType(snd.id).catch((err) => {
                        console.error("[yames] set_sound_type failed", err);
                      });
                    }}
                  >
                    <span className="drill-choice-glyph" aria-hidden="true">{snd.icon}</span>
                    <span className="drill-choice-label">{t(`sound.${snd.id}`)}</span>
                  </button>
                ))}
              </DrillPopoverChoices>
            </DrillConfigPopover>
          )}

          {openField === "more" && (
            <DrillConfigPopover
              anchor={anchors.current.more ?? null}
              onClose={closeField}
              label={t("drill.runOptions")}
            >
              <DrillPopoverRow label={t("drill.countdown")} tip={t("drill.desc.countdown")}>
                <button
                  className={`toggle-btn ${countIn ? "active" : ""}`}
                  aria-pressed={countIn}
                  onClick={() => edit({ warmupBeats: countIn ? 0 : 4 })}
                >
                  {countIn ? t("common.on") : t("common.off")}
                </button>
              </DrillPopoverRow>
              {mode !== "adaptive" && (
                <DrillPopoverRow label={t("drill.cyclic")} tip={t("drill.desc.cyclic")}>
                  <button
                    className={`toggle-btn ${cyclic ? "active" : ""}`}
                    aria-pressed={cyclic}
                    onClick={() => edit({ cyclic: !cyclic })}
                  >
                    {cyclic ? t("common.on") : t("common.off")}
                  </button>
                </DrillPopoverRow>
              )}
              {mode === "adaptive" && (
                <DrillPopoverRow label={t("drill.aggr")} tip={t("drill.desc.aggressiveness")}>
                  <div className="toggle-group">
                    {AGGRESSIVENESS.map((a) => (
                      <button
                        key={a.id}
                        className={`toggle-btn ${aggressiveness === a.id ? "active" : ""}`}
                        aria-pressed={aggressiveness === a.id}
                        onClick={() => edit({ aggressiveness: a.id, mode: "adaptive" })}
                      >
                        {t(a.labelKey)}
                      </button>
                    ))}
                  </div>
                </DrillPopoverRow>
              )}
            </DrillConfigPopover>
          )}
        </div>

        <div className="drill-stage-meta">
          {/* What each mode does is on the button that does it. It used to be
              a line of prose under the plan, on screen the whole time the ramp
              was stopped, explaining a choice that had already been made. */}
          <div className="drill-modes" role="group" aria-label={t("drill.mode")}>
            {MODES.map((m) => (
              <span key={m.id} className="drill-mode-wrap">
                <button
                  className={`toggle-btn ${mode === m.id ? "active" : ""}`}
                  aria-pressed={mode === m.id}
                  aria-describedby={`drill-mode-tip-${m.id}`}
                  onClick={() =>
                    // Adaptive has no target of its own — it climbs until the
                    // playing falls apart — so the ceiling goes to the top.
                    edit(
                      m.id === "adaptive"
                        ? { mode: m.id, targetBpm: 300 }
                        : { mode: m.id },
                    )
                  }
                >
                  {t(m.labelKey)}
                  {m.id === "adaptive" && (
                    <span className="drill-mode-badge">{t("drill.listensBadge")}</span>
                  )}
                </button>
                <span
                  className="drill-mode-tip"
                  id={`drill-mode-tip-${m.id}`}
                  role="tooltip"
                  data-testid={`drill-mode-tip-${m.id}`}
                >
                  {t(`emptyStates.drill.${m.id}`)}
                </span>
              </span>
            ))}
          </div>

          <div className="drill-run-stats">{planSummary}</div>
        </div>
      </div>

      {/* The live readout, next to the picture it is narrating: the tempo, the
          count-in, the beat dots and the step/bar position.

          Every part of it is ALWAYS here. Only the values change. Three goes
          at this row taught the rule the hard way — it was unmounted at rest
          and shoved the climb down the screen on Start; then hidden at rest,
          which shoved nothing but made the whole row flash in and out; and the
          dots blinked out again during the count-in on top of that. The owner:
          "they appear and disappear too much... the dots should NEVER
          disappear."

          So nothing here is conditional on the run. The tempo reads an em dash
          when no tempo is being played — a dash asserts nothing, where the
          "80" this used to show was a tempo nothing was sounding — and the
          dots are drawn unlit rather than removed, including through the
          count-in, where they are exactly the thing you are counting towards.

          The `visibility: hidden` this replaced also had a bug worth naming:
          `visibility` INHERITS, and a child that sets `visible` overrides a
          hidden parent. The dots carried an inline `visibility: visible` for
          the count-in case, so when the row was hidden they were the one thing
          that stayed on screen. */}
      <div className="drill-live" data-testid="drill-live">
        {isWarmingUp ? (
          <>
            <span className="drill-warmup-label">{t("drill.startingIn")}</span>
            <span className="drill-current-bpm drill-warmup-number">{warmupRemaining}</span>
          </>
        ) : (
          <>
            <span className="drill-current-bpm" data-idle={showLive ? undefined : ""}>
              {showLive ? ramp.currentBpm : "—"}
            </span>
            <span className="drill-current-label">{t("drill.bpmUnit")}</span>
          </>
        )}
        <div className="drill-beat-dots">
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

      <DrillClimb
        steps={steps}
        barsPerStep={barsPerStep}
        currentStep={ramp.currentStep}
        barsInStep={ramp.barsInStep}
        active={ramp.active}
        cyclic={cyclic}
        ghostSteps={ghostSteps}
        ghostBars={ghostBars}
        lastRun={lastRun}
        onJump={(stepIdx, bpm, barIdx) => {
          // Before the jump, not after: the run is about to skip bars it did
          // not play, and the recorder must not credit them (U3.3).
          markJump();
          startSpeedRampFrom(stepIdx, bpm, barIdx);
          startTimer(stepIdx, barIdx);
        }}
      />
    </div>
  );
}
