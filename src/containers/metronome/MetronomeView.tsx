import { useMemo, type Ref } from "react";
import { useTranslation } from "react-i18next";
import type { AppState, BeatEvent, Subdivision } from "../../types";
// BeatEvent used for evaluation feedback; Subdivision for sub-row cast
import type { useEvaluation } from "../../hooks/useEvaluation";
import { setSubdivision, setBeatGroups } from "../../ipc";
import {
  getTempoMarking,
  getTempoScale,
  MAX_BPM,
  MIN_BPM,
} from "../../constants/metronome";
import { GroupEditor } from "./GroupEditor";
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
 * The main "Metronome" tab content — BPM display, tap button, slider, beat
 * dots with subdivision sub-dots, optional drift meter when audio evaluation
 * is enabled, and the subdivision + time-signature button rows.
 *
 * All beat/state values come from the parent (which owns `useMetronome`).
 * Subdivision and time-signature buttons fire the IPC setters directly —
 * keeping that wiring out of the parent.
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
        <button
          className={`tap-btn ${tapActive ? "active" : ""} ${tapPulse ? "pulse" : ""}`}
          onClick={onTap}
        >
          {t("metronome.tap")}
          {tapActive && tapCount >= 2 && (
            <span className="tap-count">{t("metronome.tapCount", { count: tapCount })}</span>
          )}
        </button>
        <div className="bpm-display view-stagger-item" style={{ animationDelay: '0ms' }}>
          <button
            className="bpm-btn"
            onClick={() => onBpmChange(state.bpm - 5)}
          >
            −
          </button>
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
          <button
            className="bpm-btn"
            onClick={() => onBpmChange(state.bpm + 5)}
          >
            +
          </button>
          {/* The marking belongs with the number it describes. It is also
              highlighted on the ruler below, which is a position, not a
              label — showing the word twice was just noise. */}
          <span className="tempo-marking">{marking}</span>
        </div>
        <div className="bpm-slider-wrap view-stagger-item" style={{ animationDelay: '40ms' }}>
          <input
            type="range"
            className="bpm-slider"
            min={MIN_BPM}
            max={MAX_BPM}
            value={state.bpm}
            onChange={(e) => onBpmChange(parseInt(e.target.value))}
            style={
              {
                "--slider-pct": `${sliderPercent}%`,
              } as React.CSSProperties
            }
          />
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

      <div className="beat-controls-group" data-tour="subdivision">
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
          onBeatCountChange={(next) => {
            // No notifySettingsChange() — useSession watches the meter
            // and fires ONE debounced coach boundary for a burst of
            // stepper clicks.
            setBeatGroups([next]);
          }}
        />

        {/* The live early/late needle. It was pulled from this screen after #40
            made it paint for the first time — it had been rendering at opacity 0
            since it was written, so nobody had ever actually decided it belonged
            here. UI_DECISIONS U2.5 is that decision, taken on purpose: while you
            are playing with the input on, how early or late you are is the most
            useful thing this screen can tell you. */}
        <DriftMeter
          lastFeedback={evaluation.lastFeedback}
          avgDeviation={evaluation.avgDeviation}
          visible={evaluation.enabled && state.isPlaying}
        />

        <div className="sub-row">
          <span className="row-side-label">{t("metronome.subdiv")}</span>
          {([1, 2, 3, 4, 5, 6] as Subdivision[]).map((sub, i) => (
            <button
              key={sub}
              className={`sub-row-btn view-stagger-item ${state.subdivision === sub ? "active" : ""}`}
              style={{ animationDelay: `${100 + i * 25}ms` }}
              onClick={() => setSubdivision(sub)}
            >
              <SubdivisionIcon sub={sub} size={20} />
              {/* The six glyphs are near-identical at a glance and used to need
                  a tooltip to tell apart. Naming them is the fix — UI_DECISIONS
                  U2.2. */}
              <span className="sub-row-label">{t(`subdiv.${sub}`)}</span>
            </button>
          ))}
        </div>
      </div>

      <MeterPresets beatGroups={state.beatGroups} freeMode={state.freeMode} />
    </>
  );
}
