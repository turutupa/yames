import type React from "react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { ClimbUnderlay } from "./lastRun";

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
  /**
   * How far the last comparable run got, matched to THIS plan's columns
   * by tempo (U3.3). Null or absent draws nothing at all — no swatch, no
   * note, no empty underlay — because there is no history to draw.
   * `lastRun.ts` decides what "comparable" means and why.
   */
  lastRun?: ClimbUnderlay | null;
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
 * The last run is drawn under tonight's plan (U3.3): a band along the foot of
 * every bar the last comparable run played, a wall line where it stopped, and
 * one sentence saying so. It arrived once a run recorded which tempos it
 * actually played and for how many bars — see `DrillRun` in
 * `src-tauri/src/session.rs`, and `lastRun.ts` for how a past run is matched
 * to a plan that has changed since. When nothing matches, nothing is drawn:
 * no swatch, no note, no empty underlay. A chart that invents its own history
 * is worse than one that admits it has none, and an empty underlay would read
 * as "you got nowhere" rather than "there is no record".
 *
 * The artboard's note said "...before the timing came apart". That half is
 * not built, because nothing records WHY a run ended — a stopped run is a
 * phone call as often as it is a wall. The sentence says how far you got and
 * when, which is what the data supports.
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
  lastRun = null,
  onJump,
}: DrillClimbProps) {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
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

  // "today" / "yesterday" / "N days ago". Three keys rather than one plural
  // string: i18next plurals would make English's plural categories the key
  // set every one of the fifteen locales has to carry, and
  // `i18n.locales.test.ts` requires exactly the same keys everywhere.
  const whenLastRun = (days: number) =>
    days <= 0
      ? t("drill.lastRunToday")
      : days === 1
        ? t("drill.lastRunYesterday")
        : t("drill.lastRunDaysAgo", { days });

  // A step is always the same width, so a long plan runs off the edge — and
  // the way you read it is by moving through it. While a run is going the
  // playing column is kept in the middle of the view, so the picture travels
  // with the player instead of being dragged.
  useEffect(() => {
    const scroller = scrollRef.current;
    const column = currentColRef.current;
    if (!active || !scroller || !column) return;
    const target =
      column.offsetLeft + column.offsetWidth / 2 - scroller.clientWidth / 2;
    const max = scroller.scrollWidth - scroller.clientWidth;
    scroller.scrollLeft = Math.max(0, Math.min(target, max));
  }, [active, effectiveStep, barsPerStep, steps.length]);

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
      <div className="drill-climb-scroll" ref={scrollRef}>
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
                    style={{ "--climb-playhead-bar": barsInStep } as React.CSSProperties}
                    aria-hidden="true"
                  />
                )}
                <div className="drill-climb-cells">
                  {Array.from({ length: barsPerStep }, (_, barIdx) => {
                    const barDone = isDone || (isCurrent && barIdx < barsInStep);
                    const barActive = isCurrent && barIdx === barsInStep;
                    return (
                      // A button, not a div. Clicking a bar has always jumped
                      // the run to it — but a div with an onClick says so to
                      // nobody: no tooltip on hover, nothing for a screen
                      // reader, no way in from the keyboard. The owner asked
                      // for behaviour that was already there, which is what an
                      // affordance with no announcement looks like.
                      //
                      // Only the first bar of each column takes a tab stop.
                      // The step is the unit worth navigating to; putting all
                      // hundred-odd bars in the tab order would bury the
                      // transport behind them.
                      <button
                        key={barIdx}
                        type="button"
                        tabIndex={barIdx === 0 ? 0 : -1}
                        title={t("drill.jumpTo", { bpm, bar: barIdx + 1 })}
                        aria-label={t("drill.jumpTo", { bpm, bar: barIdx + 1 })}
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
      {/* The artboard put this beside the chart. Here it goes under it: the
          track is a scroller that can be several screens wide, and a note
          parked inside it scrolls out of the picture it is describing.

          It says where you got and when. It does not say why you stopped —
          nothing records that, and "before the timing came apart" is a
          diagnosis a stop button cannot make. */}
      {/* Always rendered, empty when there is nothing to say. A drill that
          has been run carries this line and one that has not does not, so
          mounting it conditionally moved the whole page every time you
          switched between them — the owner: "if I click on a preset that has
          that message and another one that doesn't, everything moves".

          The row reserves one line in the stylesheet. `aria-hidden` while it
          is empty so a screen reader is not handed a blank paragraph. */}
      <p
        className="drill-climb-lastrun"
        data-empty={lastRun ? undefined : ""}
        aria-hidden={lastRun ? undefined : true}
      >
        {lastRun
          ? lastRun.completed
            ? t("drill.lastRunCleared", {
                bpm: lastRun.furthestBpm,
                when: whenLastRun(lastRun.daysAgo),
              })
            : t("drill.lastRunWall", {
                bars: lastRun.furthestBars,
                bpm: lastRun.furthestBpm,
                when: whenLastRun(lastRun.daysAgo),
              })
          : null}
      </p>
    </div>
  );
}
