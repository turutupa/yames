import type React from "react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";

export interface DrillClimbProps {
  /** One BPM per tempo step, in the order the ramp will play them. */
  steps: number[];
  /** Bars held at each step — one cell each. */
  barsPerStep: number;
  /** `speedRamp.currentStep` — may exceed `steps.length` when cyclic. */
  currentStep: number;
  /** `speedRamp.barsInStep` — how far into the current step we are. */
  barsInStep: number;
  active: boolean;
  cyclic: boolean;
  /** Steps that have just been removed, kept one beat longer to animate out. */
  ghostSteps?: number[];
  /** Bars that have just been removed, same idea, one per column. */
  ghostBars?: number;
  onJump: (stepIdx: number, bpm: number, barIdx: number) => void;
}

/**
 * The climb (UI_DECISIONS U3.2).
 *
 * One column per tempo step, one cell per bar, each column standing at its own
 * tempo's height — so the picture's shape *is* the exercise's shape. A linear
 * ramp draws a staircase; a zigzag draws a zigzag; a cyclic drill draws the
 * round trip. The grid this replaced drew all four of those as the same dense
 * rectangle, which is why the owner read it as a mesh rather than a plan.
 *
 * Height comes from the tempo, not from the index: `rise()` maps each step's
 * BPM onto the available rise. That is the one line that makes a zigzag look
 * like a zigzag.
 *
 * What is deliberately missing: the last-run underlay (U3.3) and the note
 * beside the chart ("you got five bars into 110 before the timing came
 * apart"). Both need per-run history the app does not record yet — a saved
 * session carries a timestamp, a tempo and a score, and nothing that says
 * which drill it was or how far up the ramp it got — and a chart that invents
 * its own history is worse than one that admits it has none. So the legend's
 * filled swatch is the run you are playing now, not the one you played last.
 *
 * Rendered as its own component because Zen mounts the same object (U6.3) and
 * two implementations of one picture have already drifted apart once.
 */
export function DrillClimb({
  steps,
  barsPerStep,
  currentStep,
  barsInStep,
  active,
  cyclic,
  ghostSteps = [],
  ghostBars = 0,
  onJump,
}: DrillClimbProps) {
  const { t } = useTranslation();
  const currentColRef = useRef<HTMLDivElement>(null);

  // Ghosts are still on screen, so they get a vote on the range — otherwise
  // the whole staircase re-scales for the 250ms they take to leave.
  const spread = [...steps, ...ghostSteps];
  const lowest = spread.length ? Math.min(...spread) : 0;
  const highest = spread.length ? Math.max(...spread) : 0;
  const rise = (bpm: number) =>
    highest === lowest ? 0 : (bpm - lowest) / (highest - lowest);
  // `--climb-step-rise` is this column's share of the total rise, 0 at the
  // slowest tempo and 1 at the fastest. The stylesheet turns it into pixels,
  // so how tall the staircase is can change with the window without this
  // component knowing anything about the window.
  const columnStyle = (bpm: number, delay?: number) =>
    ({
      "--climb-step-rise": rise(bpm).toFixed(4),
      ...(delay === undefined ? {} : { animationDelay: `${delay}ms` }),
    }) as React.CSSProperties;

  // A cyclic ramp keeps counting past the last step and comes back down the
  // same columns, so the index has to wrap to find the column being played.
  const effectiveStep =
    cyclic && steps.length > 0 ? currentStep % steps.length : currentStep;

  return (
    <div className="drill-climb">
      <div className="drill-climb-head">
        <span className="drill-climb-title">{t("drill.climbTitle")}</span>
        {/* Swatches rather than a sentence, because the cells now carry two
            meanings and a caption cannot say which is which. The sentence it
            replaced still explains the picture's construction, so it stays as
            the legend's tooltip rather than being deleted. */}
        <span className="drill-climb-legend" title={t("drill.climbLegend")}>
          <span className="drill-climb-key">
            <span className="drill-climb-swatch done" aria-hidden="true" />
            {t("drill.climbLegendDone")}
          </span>
          <span className="drill-climb-key">
            <span className="drill-climb-swatch plan" aria-hidden="true" />
            {t("drill.climbLegendPlan")}
          </span>
        </span>
      </div>
      <div className="drill-climb-scroll">
        <div className="drill-climb-track">
          {steps.map((bpm, stepIdx) => {
            const isDone = active && !cyclic ? stepIdx < currentStep : false;
            const isCurrent = stepIdx === effectiveStep && active;
            const base = 140 + stepIdx * 24;
            return (
              <div
                key={stepIdx}
                ref={isCurrent ? currentColRef : undefined}
                className="drill-climb-col"
                data-row-idx={stepIdx}
                data-last-row={
                  stepIdx === steps.length - 1 && ghostSteps.length === 0
                    ? ""
                    : undefined
                }
                data-current={isCurrent ? "" : undefined}
                style={columnStyle(bpm, base)}
              >
                {/* The playhead. It rises out of the column to the full height
                    of the track, so on a staircase you read it against the
                    steps still to climb rather than only the one it stands
                    on. */}
                {isCurrent && (
                  <span
                    className="drill-climb-playhead"
                    style={
                      {
                        // The middle of the bar being played, as a fraction of
                        // the column. Cells share the column's width, so there
                        // is no fixed cell size to count in.
                        "--climb-playhead-pct":
                          ((barsInStep + 0.5) / Math.max(1, barsPerStep)) * 100,
                      } as React.CSSProperties
                    }
                    aria-hidden="true"
                  />
                )}
                <div className="drill-climb-cells">
                  {Array.from({ length: barsPerStep }, (_, barIdx) => {
                    const barDone = isDone || (isCurrent && barIdx < barsInStep);
                    const barActive = isCurrent && barIdx === barsInStep;
                    return (
                      <div
                        key={barIdx}
                        className={`drill-grid-cell drill-climb-cell ${barDone ? "done" : ""} ${barActive ? "current" : ""}`}
                        data-first-cell={
                          stepIdx === 0 && barIdx === 0 ? "" : undefined
                        }
                        style={{ animationDelay: `${base + barIdx * 6}ms` }}
                        onClick={() => onJump(stepIdx, bpm, barIdx)}
                      />
                    );
                  })}
                  {ghostBars > 0 &&
                    Array.from({ length: ghostBars }, (_, i) => (
                      <div
                        key={`ghost-bar-${i}`}
                        className="drill-grid-cell drill-climb-cell exiting"
                      />
                    ))}
                </div>
                <span
                  className={`drill-grid-bpm drill-climb-bpm ${isCurrent ? "current" : ""} ${isDone ? "done" : ""}`}
                >
                  {bpm}
                </span>
              </div>
            );
          })}
          {ghostSteps.map((bpm, i) => (
            <div
              key={`ghost-step-${i}`}
              className="drill-climb-col exiting"
              style={columnStyle(bpm)}
            >
              <div className="drill-climb-cells">
                {Array.from({ length: barsPerStep + ghostBars }, (_, barIdx) => (
                  <div
                    key={barIdx}
                    className="drill-grid-cell drill-climb-cell exiting"
                  />
                ))}
              </div>
              <span className="drill-grid-bpm drill-climb-bpm">{bpm}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
