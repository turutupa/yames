import { useMemo, type Ref } from "react";
import { useTranslation } from "react-i18next";
import { getTempoMarking } from "../../constants/metronome";
import { GROOVES, grooveById } from "../../jam/grooves";
import { applyFeel } from "../../jam/feel";
import { JAM_FORM_KINDS, clampFormBars, formBars } from "../../jam/forms";
import { JAM_MAX_COUNT_IN, JAM_MAX_FORM_BARS } from "../../jam/types";
import type { Jam, JamFeel, JamFormKind, JamIntensity } from "../../jam/types";
import type { BeatEvent } from "../../types";
import { GrooveGlyph } from "./GrooveGlyph";
import { FormTimeline } from "./FormTimeline";
import "../../styles/jam.css";

const FEELS: JamFeel[] = ["straight", "shuffle", "swing"];
const INTENSITIES: JamIntensity[] = ["soft", "normal", "loud"];

interface JamViewProps {
  jam: Jam;
  /** Every edit lands on the working copy, which recompiles and re-sends. */
  onEdit: (patch: Partial<Omit<Jam, "id" | "createdAt">>) => void;
  currentBeat: BeatEvent | null;
  isPlaying: boolean;
  /** The metronome's tempo controls, shared rather than built again. */
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
 * A segmented control, in the stage's existing vocabulary.
 *
 * The same three-in-a-trough shape as the metronome's accent control, which is
 * what the setup board draws for feel and intensity too — so it is that
 * component's stylesheet rather than a second one that looks nearly like it.
 */
function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: T; label: string; disabled?: boolean }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="accent-control jam-segmented" role="group" aria-label={label}>
      <span className="stage-label accent-label">{label}</span>
      <div className="accent-options">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            className={`accent-option${value === option.id ? " active" : ""}`}
            aria-pressed={value === option.id}
            disabled={option.disabled}
            onClick={() => onChange(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The Jam stage: what the band plays, and where you are in it.
 *
 * Top to bottom it is the order you decide things in — tempo, then how it
 * feels, then who plays what, then the shape — and the timeline underneath is
 * the only part that is a readout rather than a control. That ordering is the
 * setup board's; the timeline is the playing board's, and today's screen is
 * the two of them with the chord block and the band lanes left for Jam 2.
 *
 * Every control writes to the jam record and nothing writes to the engine
 * directly: `useJamSession` owns the traffic, because the meter and the table
 * have to leave together and in order (see its note).
 */
export function JamView({
  jam,
  onEdit,
  currentBeat,
  isPlaying,
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
}: JamViewProps) {
  const { t } = useTranslation();
  const marking = getTempoMarking(jam.bpm);

  /** The meter the jam actually runs in, feel included. */
  const meter = useMemo(() => applyFeel(grooveById(jam.grooveId), jam.feel), [
    jam.grooveId,
    jam.feel,
  ]);

  /**
   * Count-in, in bars of the jam's own meter.
   *
   * Beats are what the engine takes and bars are what a player counts, so the
   * options are bars and the values are beats. Two bars of 6/8 is twelve
   * beats, which is past `arm_count_in`'s limit of eight — so that option is
   * not offered there rather than offered and quietly clamped to something
   * that is not two bars.
   */
  const countInOptions = useMemo(() => {
    const options = [{ id: "0", label: t("jam.countIn.none") }];
    for (const bars of [1, 2]) {
      const beats = bars * meter.beatsPerBar;
      if (beats > JAM_MAX_COUNT_IN) continue;
      options.push({ id: String(beats), label: t("jam.countIn.bars", { count: bars }) });
    }
    return options;
  }, [t, meter.beatsPerBar]);

  const bars = formBars(jam.form);
  const chorus = currentBeat?.chorus ?? 1;
  const formBar = currentBeat?.formBar ?? 0;

  return (
    <div className="jam-view">
      <section className="bpm-section jam-head">
        <div className="tempo-block">
          <span className="stage-label">{t("metronome.tempo")}</span>
          <div className="bpm-display">
            {editingBpm ? (
              <input
                ref={bpmInputRef}
                type="text"
                inputMode="numeric"
                className="bpm-input"
                value={bpmEditValue}
                onChange={(e) => setBpmEditValue(e.target.value.replace(/\D/g, ""))}
                onFocus={(e) => e.currentTarget.select()}
                onBlur={onCommitBpmEdit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onCommitBpmEdit();
                  if (e.key === "Escape") setEditingBpm(false);
                }}
                autoFocus
              />
            ) : (
              /* `role` and `tabIndex` are load-bearing: the window-drag
                 handler asks whether a mousedown landed on a control, and a
                 bare span with an onClick answers no. See MetronomeView. */
              <span
                className="bpm-input bpm-clickable"
                role="button"
                tabIndex={0}
                onClick={onStartBpmEdit}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onStartBpmEdit();
                  }
                }}
              >
                {jam.bpm}
              </span>
            )}
            <div className="tempo-units">
              <span className="tempo-unit">BPM</span>
              <span className="tempo-marking">{marking}</span>
            </div>
            <div className="tempo-controls">
              <button
                className="bpm-btn"
                aria-label={t("metronome.tempoDown")}
                onClick={() => onBpmChange(jam.bpm - 5)}
              >
                −
              </button>
              <button
                className="bpm-btn"
                aria-label={t("metronome.tempoUp")}
                onClick={() => onBpmChange(jam.bpm + 5)}
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

        <div className="jam-head-controls">
          <Segmented
            label={t("jam.feel.label")}
            value={jam.feel}
            options={FEELS.map((id) => ({ id, label: t(`jam.feel.${id}`) }))}
            onChange={(feel) => onEdit({ feel })}
          />
          <Segmented
            label={t("jam.intensity.label")}
            value={jam.intensity}
            options={INTENSITIES.map((id) => ({ id, label: t(`jam.intensity.${id}`) }))}
            onChange={(intensity) => onEdit({ intensity })}
          />
        </div>
      </section>

      <div className="stage-divider" aria-hidden="true" />

      <section className="jam-section">
        <span className="stage-label">{t("jam.groove.label")}</span>
        <div className="jam-cards jam-cards-groove">
          {GROOVES.map((groove) => (
            <button
              key={groove.id}
              type="button"
              className={`sub-row-btn jam-card${jam.grooveId === groove.id ? " active" : ""}`}
              aria-pressed={jam.grooveId === groove.id}
              onClick={() =>
                onEdit({
                  grooveId: groove.id,
                  // A groove carries its own meter, so the count-in has to
                  // follow it: one bar of a waltz is three beats, not four,
                  // and a count-in in the wrong meter lands you on beat two.
                  countIn: jam.countIn > 0 ? Math.min(groove.beatsPerBar, JAM_MAX_COUNT_IN) : 0,
                })
              }
            >
              <GrooveGlyph groove={groove} />
              <span className="sub-row-label">{t(`jam.groove.${groove.id}`)}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="stage-divider" aria-hidden="true" />

      <section className="jam-section">
        <span className="stage-label">{t("jam.form.label")}</span>
        <div className="jam-cards jam-cards-form">
          {JAM_FORM_KINDS.map((kind: JamFormKind) => (
            <button
              key={kind}
              type="button"
              className={`sub-row-btn jam-card jam-card-form${jam.form.kind === kind ? " active" : ""}`}
              aria-pressed={jam.form.kind === kind}
              onClick={() =>
                onEdit({
                  form: {
                    kind,
                    // Switching to "your own" starts from the length you were
                    // already looking at, so the timeline does not jump.
                    bars: kind === "custom" ? bars : formBars({ kind, bars }),
                  },
                })
              }
            >
              <span className="jam-card-title">{t(`jam.form.${kind}`)}</span>
              <span className="jam-card-hint">{t(`jam.form.${kind}Hint`)}</span>
            </button>
          ))}
        </div>

        <div className="jam-form-row">
          {jam.form.kind === "custom" && (
            <div className="jam-bars">
              <span className="stage-label">{t("jam.form.barsLabel")}</span>
              <div className="beat-stepper" role="group" aria-label={t("jam.form.barsLabel")}>
                <button
                  className="beat-stepper-btn"
                  aria-label={t("jam.form.fewerBars")}
                  disabled={bars <= 1}
                  onClick={() => onEdit({ form: { kind: "custom", bars: clampFormBars(bars - 1) } })}
                >
                  −
                </button>
                <span className="beat-stepper-value">{bars}</span>
                <button
                  className="beat-stepper-btn"
                  aria-label={t("jam.form.moreBars")}
                  disabled={bars >= JAM_MAX_FORM_BARS}
                  onClick={() => onEdit({ form: { kind: "custom", bars: clampFormBars(bars + 1) } })}
                >
                  +
                </button>
              </div>
            </div>
          )}

          <Segmented
            label={t("jam.countIn.label")}
            value={String(jam.countIn)}
            options={countInOptions}
            onChange={(beats) => onEdit({ countIn: Number(beats) })}
          />

          <button
            type="button"
            role="switch"
            aria-checked={jam.fills}
            className={`transport-switch jam-switch ${jam.fills ? "on" : ""}`}
            title={t("jam.fills.hint")}
            onClick={() => onEdit({ fills: !jam.fills })}
          >
            <span className="transport-switch-track" aria-hidden="true" />
            {t("jam.fills.label")}
          </button>
        </div>
      </section>

      <div className="stage-divider" aria-hidden="true" />

      <FormTimeline
        form={jam.form}
        fills={jam.fills}
        formBar={formBar}
        chorus={chorus}
        beat={currentBeat?.measureBeat ?? 0}
        beatsPerBar={meter.beatsPerBar}
        isPlaying={isPlaying}
      />

      {/* JAM_MODE §3, principle 5. A band is louder than a click, and through
          speakers its hits land on the grid and the mic scores them as your
          notes. The screen says so rather than letting a flattered score go
          unexplained. */}
      <p className="jam-honest">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
          <rect x="2.5" y="13.5" width="4.5" height="7" rx="2" />
          <rect x="17" y="13.5" width="4.5" height="7" rx="2" />
        </svg>
        {t("jam.headphones")}
      </p>
    </div>
  );
}
