/**
 * The input level meter, extracted from `AudioInputTestModal` (O5) so the
 * onboarding wizard's W5 shows the *same* meter the tester does rather than a
 * second implementation that drifts from it.
 *
 * The component is purely presentational: it takes an already-smoothed RMS and
 * draws the dB readout, the fill and the -60…0 scale. Smoothing is a hook
 * (`useSmoothedRms`) rather than internal state because both call sites need
 * the smoothed value for something else as well — the modal samples it for the
 * live recording waveform, W5 gates "Next" on it.
 *
 * Mark-up and class names are unchanged from the modal, so the tester keeps
 * its exact look and the wizard inherits it for free (`audio-input-test.css`
 * is imported here, so the component works wherever it is mounted).
 */
import { useRef } from "react";
import "../styles/audio-input-test.css";

/**
 * EMA weight for the displayed level. Lower = smoother; 0.3 is what the tester
 * has always used and what the numbers on screen were tuned against.
 */
export const RMS_SMOOTHING_ALPHA = 0.3;

/**
 * Above this raw RMS there is a signal rather than room tone. Same constant
 * the tester's "Signal detected" dot and `useEvaluation().hasSignal` use — a
 * meter that says "signal" at a different point from the rest of the app would
 * be its own bug report.
 */
export const SIGNAL_FLOOR_RMS = 0.01;

/** Bottom of the meter's scale, in dBFS. Everything quieter reads as -∞. */
export const METER_FLOOR_DB = -60;

/**
 * RMS → dBFS, clamped to the meter's scale. Anything below the floor is
 * reported as the floor: an empty room is not "-97 dB", it is "no signal".
 */
export function rmsToDb(rms: number): number {
  const db = rms > 0.0001 ? 20 * Math.log10(rms) : METER_FLOOR_DB;
  return Math.max(METER_FLOOR_DB, Math.min(0, db));
}

/** Clamped dBFS → 0..100 fill percentage. */
export function dbToPercent(db: number): number {
  return ((Math.max(METER_FLOOR_DB, Math.min(0, db)) - METER_FLOOR_DB) / -METER_FLOOR_DB) * 100;
}

/**
 * Exponential moving average of the raw RMS coming off `audio-spectrum`.
 *
 * Deliberately computed during render, exactly as the modal did it: the
 * spectrum event rate *is* the render rate here, so one EMA step per render is
 * one step per event, and a `useEffect` would only add a frame of lag to a
 * number whose whole job is to look immediate.
 */
export function useSmoothedRms(rawRms: number, alpha: number = RMS_SMOOTHING_ALPHA): number {
  const ref = useRef(0);
  ref.current = ref.current * (1 - alpha) + rawRms * alpha;
  return ref.current;
}

export type InputLevelMeterProps = {
  /** Smoothed RMS (see `useSmoothedRms`), 0..1. */
  rms: number;
  /** Localised caption on the left of the readout, e.g. "Level". */
  label: string;
  /** Extra class on the section wrapper. */
  className?: string;
};

export function InputLevelMeter({ rms, label, className }: InputLevelMeterProps) {
  const db = rmsToDb(rms);
  const levelPct = dbToPercent(db);

  return (
    <div
      className={`input-test-meter-section${className ? ` ${className}` : ""}`}
      data-testid="input-level-meter"
    >
      <div className="input-test-meter-label">
        <span>{label}</span>
        <span className="input-test-db" data-testid="input-level-db">
          {db > METER_FLOOR_DB + 1 ? `${Math.round(db)} dB` : "-∞ dB"}
        </span>
      </div>
      <div className="input-test-meter-track">
        <div
          className={`input-test-meter-fill ${
            levelPct > 90 ? "clipping" : levelPct > 70 ? "hot" : ""
          }`}
          style={{ width: `${levelPct}%` }}
          data-testid="input-level-fill"
        />
        <div className="input-test-meter-ticks">
          <span>-60</span>
          <span>-40</span>
          <span>-20</span>
          <span>0 dB</span>
        </div>
      </div>
    </div>
  );
}
