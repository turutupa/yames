import type { MutableRefObject } from "react";
import { useTranslation } from "react-i18next";

/** Which group of settings the plan line is asking the config to show. */
export type PlanField = "tempo" | "rate" | "shape" | "more" | null;

/** Every token's element, so the settings window can hang off the right one. */
export type PlanAnchors = MutableRefObject<
  Partial<Record<Exclude<PlanField, null>, HTMLButtonElement | null>>
>;

interface DrillPlanLineProps {
  startBpm: number;
  targetBpm: number;
  increment: number;
  decrement: number;
  beatsPerBar: number;
  barsPerStep: number;
  mode: string;
  /** Translated name of the click the drill will play, e.g. "Wood". */
  soundName: string;
  openField: PlanField;
  onOpenField: (field: PlanField) => void;
  anchors: PlanAnchors;
}

/**
 * The drill as a sentence you edit.
 *
 * A drill is "80 to 120, five at a time, every twelve bars", and reading that
 * took eight stepper rows and a scan; now it takes one line (UI_DECISIONS
 * U3.1). Clicking a phrase opens a settings window under it holding just the
 * fields behind that phrase — so the form arrives where you asked for it and
 * nowhere else. The rows this replaced lived in an "All settings" disclosure
 * that stood between the player and the exercise; it is gone, and every token
 * here is now the only way to reach what it covers.
 *
 * Two lines, as drawn: the loud one is the shape of the climb, the quiet one
 * underneath is what a single bar will sound like. Splitting them is what lets
 * the first line stay short enough to read at display size.
 *
 * The values live in DrillView, which owns the clamping. This component only
 * says what is set, and which part the user reached for.
 */
export function DrillPlanLine({
  startBpm,
  targetBpm,
  increment,
  decrement,
  beatsPerBar,
  barsPerStep,
  mode,
  soundName,
  openField,
  onOpenField,
  anchors,
}: DrillPlanLineProps) {
  const { t } = useTranslation();
  const toggle = (field: Exclude<PlanField, null>) =>
    onOpenField(openField === field ? null : field);
  const anchor =
    (field: Exclude<PlanField, null>) => (el: HTMLButtonElement | null) => {
      anchors.current[field] = el;
    };

  return (
    <div className="drill-plan-block">
      <div className="drill-plan">
        <button
          type="button"
          ref={anchor("tempo")}
          className={`drill-plan-token ${openField === "tempo" ? "open" : ""}`}
          onClick={() => toggle("tempo")}
          aria-expanded={openField === "tempo"}
        >
          <span className="drill-plan-value">{startBpm}</span>
          <svg
            className="drill-plan-arrow"
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="13 6 19 12 13 18" />
          </svg>
          <span className="drill-plan-value">{targetBpm}</span>
        </button>

        <span className="drill-plan-sep" aria-hidden="true" />

        <button
          type="button"
          ref={anchor("rate")}
          className={`drill-plan-token ${openField === "rate" ? "open" : ""}`}
          onClick={() => toggle("rate")}
          aria-expanded={openField === "rate"}
        >
          <span className="drill-plan-value">
            +{increment}
            {mode === "zigzag" && <span className="drill-plan-down"> −{decrement}</span>}
          </span>
          <span className="drill-plan-unit">{t("drill.bpmUnit")}</span>
        </button>

        <span className="drill-plan-sep" aria-hidden="true" />

        <button
          type="button"
          ref={anchor("shape")}
          className={`drill-plan-token ${openField === "shape" ? "open" : ""}`}
          onClick={() => toggle("shape")}
          aria-expanded={openField === "shape"}
        >
          <span className="drill-plan-value">
            {t("drill.everyBars", { count: barsPerStep })}
          </span>
        </button>
      </div>

      <div className="drill-plan-detail">
        <button
          type="button"
          className={`drill-plan-detail-token ${openField === "shape" ? "open" : ""}`}
          onClick={() => toggle("shape")}
          aria-expanded={openField === "shape"}
        >
          {t("drill.beatsSummary", { count: beatsPerBar })}
        </button>
        <span className="drill-plan-detail-sep" aria-hidden="true">
          ·
        </span>
        {/* Not editable, and deliberately so: the engine pins the subdivision
            to 1 for the whole of a ramp (engine.rs, `cached.subdivision`), so
            a drill is quarter notes whatever the metronome screen is set to.
            Saying it here is the only place that fact is ever stated. */}
        <span className="drill-plan-detail-fact">{t("drill.quarterNotes")}</span>
        <span className="drill-plan-detail-sep" aria-hidden="true">
          ·
        </span>
        {/* The click, on the other hand, is live global state — it is changed
            from the header chip that is already on this screen, so repeating
            the control here would be a second switch for one setting. */}
        <span className="drill-plan-detail-fact">
          {t("drill.soundPhrase", { sound: soundName })}
        </span>
        <span className="drill-plan-detail-sep" aria-hidden="true">
          ·
        </span>
        {/* The count-in, the round trip, and how hard Adaptive pushes. They
            have no phrase in the sentence above because they do not change its
            shape — but they are settings, and every setting opens the same
            window now, so they get a token of their own rather than the
            disclosure they used to live in. */}
        <button
          type="button"
          ref={anchor("more")}
          className={`drill-plan-detail-token ${openField === "more" ? "open" : ""}`}
          onClick={() => toggle("more")}
          aria-expanded={openField === "more"}
        >
          {t("drill.runOptions")}
        </button>
      </div>
    </div>
  );
}
