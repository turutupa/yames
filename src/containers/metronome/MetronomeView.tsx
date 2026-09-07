import { useMemo, type Ref } from "react";
import { useTranslation } from "react-i18next";
import type { AppState, BeatEvent, Subdivision } from "../../types";
// BeatEvent used for evaluation feedback; Subdivision for sub-row cast
import type { useEvaluation } from "../../hooks/useEvaluation";
import { setSubdivision, setBeatGroups } from "../../ipc";
import {
  getTempoMarking,
  getTempoScale,
  getTempoTicks,
  MAX_BPM,
  MIN_BPM,
} from "../../constants/metronome";
import { GroupEditor } from "./GroupEditor";
import { LastSession } from "./LastSession";
import { BeatStepper } from "./BeatStepper";
import { MeterPresets } from "./MeterPresets";
import { SubdivisionIcon } from "../../components/MetronomeIcons";
import DriftMeter from "../../components/DriftMeter";

type Evaluation = ReturnType<typeof useEvaluation>;

interface MetronomeViewProps {
  state: AppState;
  currentBeat: BeatEvent | null;
  evaluation: Evaluation;
  activeBeat: number;
  activeSub: number;
  isDownbeat: boolean;
  sliderPercent: number;
  tapActive: boolean;
  tapCount: number;
  tapPulse: boolean;
  editingBpm: boolean;
  bpmEditValue: string;
  setBpmEditValue: (v: string) => void;
  setEditingBpm: (v: boolean) => void;
  bpmInputRef: Ref<HTMLInputElement>;
  onTap: () => void;
  onBpmChange: (v: number) => void;
  onStartBpmEdit: () => void;
  onCommitBpmEdit: () => void;
}

/**
 * The main "Metronome" tab content — BPM display, tap button, tempo ruler,
 * the meter and its beat dots, optional drift meter when audio evaluation is
 * enabled, and the subdivision cards.
 *
 * The order is the design's: TEMPO → ruler → METER → dots → SUBDIVISION. The
 * meter sits above the dots because the meter is what the dots *are* —
 * reading "9/8" after counting nine circles is backwards.
 *
 * All beat/state values come from the parent (which owns `useMetronome`).
 * Subdivision and beat-group changes fire the IPC setters directly — keeping
 * that wiring out of the parent.
 */
export function MetronomeView({
  state,
  currentBeat,
  evaluation,
  activeBeat,
  activeSub,
  isDownbeat,
  sliderPercent,
  tapActive,
  tapCount,
  tapPulse,
  editingBpm,
  bpmEditValue,
  setBpmEditValue,
  setEditingBpm,
  bpmInputRef,
  onTap,
  onBpmChange,
  onStartBpmEdit,
  onCommitBpmEdit,
}: MetronomeViewProps) {
  const { t } = useTranslation();
  const marking = getTempoMarking(state.bpm);

  // Per-beat evaluation tint, re-keyed from the engine's sequential beat
  // index to the bar position the dot grid is drawn on. Only the beat
  // currently lit is ever tinted — same as the pre-grouping dot row.
  const dotFeedback = useMemo(() => {
    if (!evaluation.enabled || !currentBeat) return undefined;
    const fb = evaluation.dotFeedback.get(currentBeat.beat);
    return fb ? new Map([[currentBeat.measureBeat, fb]]) : undefined;
  }, [evaluation.enabled, evaluation.dotFeedback, currentBeat]);

  return (
    <>
      {/* `data-tour` ids are the tour's (O6) anchors — see tour/stops.ts. */}
      <section className="bpm-section" data-tour="bpm">
        <div className="tempo-head">
          <div className="tempo-block">
            <span className="stage-label">{t("metronome.tempo")}</span>
            <div className="bpm-display view-stagger-item" style={{ animationDelay: '0ms' }}>
              {editingBpm ? (
                <input
                  ref={bpmInputRef}
                  type="text"
                  inputMode="numeric"
                  className="bpm-input"
                  value={bpmEditValue}
                  onChange={(e) =>
                    setBpmEditValue(e.target.value.replace(/\D/g, ""))
                  }
                  onBlur={onCommitBpmEdit}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onCommitBpmEdit();
                    if (e.key === "Escape") setEditingBpm(false);
                  }}
                  autoFocus
                />
              ) : (
                <span
                  className="bpm-input bpm-clickable"
                  onClick={onStartBpmEdit}
                >
                  {state.bpm}
                </span>
              )}
              {/* The unit and the marking belong with the number they describe.
                  The marking is also highlighted on the ruler below, but that is
                  a position rather than a label. */}
              <div className="tempo-units">
                <span className="tempo-unit">BPM</span>
                <span className="tempo-marking">{marking}</span>
              </div>
              <div className="tempo-controls">
                <button
                  className="bpm-btn"
                  aria-label={t("metronome.tempoDown")}
                  onClick={() => onBpmChange(state.bpm - 5)}
                >
                  −
                </button>
                <button
                  className="bpm-btn"
                  aria-label={t("metronome.tempoUp")}
                  onClick={() => onBpmChange(state.bpm + 5)}
                >
                  +
                </button>
                <button
                  className={`tap-btn ${tapActive ? "active" : ""} ${tapPulse ? "pulse" : ""}`}
                  onClick={onTap}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M8 13V4.5a1.5 1.5 0 0 1 3 0V12" />
                    <path d="M11 11.5V4a1.5 1.5 0 0 1 3 0v8" />
                    <path d="M14 12V6.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-.5a6 6 0 0 1-5.5-4l-1.4-3.2a1.6 1.6 0 0 1 2.7-1.7L8 14" />
                  </svg>
                  {t("metronome.tap")}
                  {tapActive && tapCount >= 2 && (
                    <span className="tap-count">{t("metronome.tapCount", { count: tapCount })}</span>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Right-aligned against the stage's far edge, as drawn. It is a
              rest-state readout: the `MetronomePlaying` artboard gives this
              corner to the bar counter instead, and the docked transport
              already carries that. */}
          <LastSession isPlaying={state.isPlaying} />
        </div>

        <div className="bpm-slider-wrap view-stagger-item" style={{ animationDelay: '40ms' }}>
          {/* Numbers above the ticks, era names below, a caret at the current
              tempo and no fill: a ruler measures, it does not report progress
              towards 300 BPM (UI_DECISIONS U2.1). */}
          <div className="tempo-ticks" aria-hidden="true">
            {getTempoTicks().map(({ bpm, percent }) => (
              <span key={bpm} style={{ left: `${percent}%` }}>
                {bpm}
              </span>
            ))}
          </div>
          <div className="tempo-ruler">
            <input
              type="range"
              className="bpm-slider"
              min={MIN_BPM}
              max={MAX_BPM}
              value={state.bpm}
              onChange={(e) => onBpmChange(parseInt(e.target.value))}
            />
            <span
              className="tempo-caret"
              aria-hidden="true"
              style={{ left: `${sliderPercent}%` }}
            />
          </div>
          <div className="tempo-scale" aria-hidden="true">
            {getTempoScale().map(({ label, percent }) => (
              <span
                key={label}
                className={label === marking ? "current" : undefined}
                style={{ left: `${percent}%` }}
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Without it tempo and meter read as one run-on block. */}
      <div className="stage-divider" aria-hidden="true" />

      <section className="meter-section">
        {/* The meter and the bar's length share a row, and the row is a grid
            with a fixed first column — so the stepper sits at the same x
            whatever the meter is called and however long the grouping reads.
            It used to trail the dots, which slid it sideways on every click
            of the very buttons you were clicking repeatedly. */}
        <div className="meter-row">
          <MeterPresets
            beatGroups={state.beatGroups}
            freeMode={state.freeMode}
            stepper={
              <BeatStepper
                beatGroups={state.beatGroups}
                subdivision={state.subdivision}
                freeMode={state.freeMode}
                onBeatGroupsChange={(next) => setBeatGroups(next)}
              />
            }
          />
        </div>

        <GroupEditor
          beatGroups={state.beatGroups}
          subdivision={state.subdivision}
          isPlaying={state.isPlaying}
          activeBeat={activeBeat}
          activeSub={activeSub}
          isDownbeat={isDownbeat}
          freeMode={state.freeMode}
          isAccentBeat={currentBeat?.isAccent ?? false}
          feedback={dotFeedback}
          onBeatGroupsChange={(next) => {
            // No notifySettingsChange() — useSession watches the meter
            // and fires ONE debounced coach boundary for a burst of
            // stepper clicks.
            setBeatGroups(next);
          }}
        />

        {/* The live early/late needle. It was pulled from this screen after #40
            made it paint for the first time — it had been rendering at opacity 0
            since it was written, so nobody had ever actually decided it belonged
            here. UI_DECISIONS U2.5 is that decision, taken on purpose: while you
            are playing with the input on, how early or late you are is the most
            useful thing this screen can tell you. It sits under the dots
            because that is where the `MetronomePlaying` artboard puts it. */}
        <DriftMeter
          lastFeedback={evaluation.lastFeedback}
          avgDeviation={evaluation.avgDeviation}
          visible={evaluation.enabled && state.isPlaying}
        />
      </section>

      <section className="sub-section" data-tour="subdivision">
        <span className="stage-label">{t("metronome.subdivision")}</span>
        <div className="sub-row">
          {([1, 2, 3, 4, 5, 6] as Subdivision[]).map((sub, i) => (
            <button
              key={sub}
              className={`sub-row-btn view-stagger-item ${state.subdivision === sub ? "active" : ""}`}
              style={{ animationDelay: `${100 + i * 25}ms` }}
              onClick={() => setSubdivision(sub)}
            >
              <SubdivisionIcon sub={sub} size={28} />
              {/* The six glyphs are near-identical at a glance and used to need
                  a tooltip to tell apart. Naming them is the fix — UI_DECISIONS
                  U2.2. */}
              <span className="sub-row-label">{t(`subdiv.${sub}`)}</span>
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
