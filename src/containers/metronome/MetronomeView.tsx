import type { Ref } from "react";
import { useTranslation } from "react-i18next";
import type { AppState, BeatEvent, Subdivision } from "../../types";
// BeatEvent used for evaluation feedback; Subdivision for sub-row cast
import type { useEvaluation } from "../../hooks/useEvaluation";
import { setSubdivision, setBeatGroups, notifySettingsChange } from "../../ipc";
import {
  getTempoMarking,
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
  beatsPerMeasure: number;
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
  currentBeat: _currentBeat,
  evaluation,
  beatsPerMeasure: _beatsPerMeasure,
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
  return (
    <>
      <section className="bpm-section">
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
        </div>
        <div className="bpm-slider-wrap view-stagger-item" style={{ animationDelay: '40ms' }}>
          <input
            type="range"
            className="bpm-slider"
            min={20}
            max={300}
            value={state.bpm}
            onChange={(e) => onBpmChange(parseInt(e.target.value))}
            style={
              {
                "--slider-pct": `${sliderPercent}%`,
              } as React.CSSProperties
            }
          />
          <span className="tempo-marking">
            {getTempoMarking(state.bpm)}
          </span>
        </div>
      </section>

      <div className="beat-controls-group">
        <GroupEditor
          beatGroups={state.beatGroups}
          subdivision={state.subdivision}
          isPlaying={state.isPlaying}
          activeBeat={activeBeat}
          activeSub={activeSub}
          isDownbeat={isDownbeat}
          freeMode={state.freeMode}
          onBeatCountChange={async (next) => {
            await setBeatGroups([next]);
            await notifySettingsChange();
          }}
        />

        {evaluation.enabled && state.isPlaying && (
          <DriftMeter
            lastFeedback={evaluation.lastFeedback}
            avgDeviation={evaluation.avgDeviation}
            visible={evaluation.enabled && state.isPlaying}
          />
        )}

        <div className="sub-row">
          <span className="row-side-label">{t("metronome.subdiv")}</span>
          {([1, 2, 3, 4, 5, 6] as Subdivision[]).map((sub, i) => (
            <button
              key={sub}
              className={`sub-row-btn view-stagger-item ${state.subdivision === sub ? "active" : ""}`}
              style={{ animationDelay: `${100 + i * 25}ms` }}
              onClick={() => setSubdivision(sub)}
              data-tooltip={t(`subdiv.${sub}`)}
            >
              <SubdivisionIcon sub={sub} size={18} />
            </button>
          ))}
        </div>
      </div>

      <MeterPresets beatGroups={state.beatGroups} freeMode={state.freeMode} />
    </>
  );
}
