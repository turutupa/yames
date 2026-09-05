import { useTranslation } from "react-i18next";

/** Which group of settings the plan line is asking the config to show. */
export type PlanField = "tempo" | "rate" | "shape" | null;

interface DrillPlanLineProps {
  startBpm: number;
  targetBpm: number;
  increment: number;
  decrement: number;
  beatsPerBar: number;
  barsPerStep: number;
  mode: string;
  openField: PlanField;
  onOpenField: (field: PlanField) => void;
}

/**
 * The drill as a sentence you edit.
 *
 * The eight stepper rows are still there — nothing is hidden — but they stop
 * being the screen. A drill is "80 to 120, five at a time, twelve bars each",
 * and reading that took eight rows and a scan; now it takes one line
 * (UI_DECISIONS U3.1). Clicking a phrase opens just the settings behind it,
 * so the form arrives contextually instead of standing between the player and
 * the exercise.
 *
 * The values live in DrillView, which owns the clamping — start may not pass
 * target, and the two are coupled. This component only says what is set and
 * which part the user reached for.
 */
export function DrillPlanLine({
  startBpm,
  targetBpm,
  increment,
  decrement,
  beatsPerBar,
  barsPerStep,
  mode,
  openField,
  onOpenField,
}: DrillPlanLineProps) {
  const { t } = useTranslation();
  const toggle = (field: Exclude<PlanField, null>) =>
    onOpenField(openField === field ? null : field);

  return (
    <div className="drill-plan">
      <button
        type="button"
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
        className={`drill-plan-token ${openField === "rate" ? "open" : ""}`}
        onClick={() => toggle("rate")}
        aria-expanded={openField === "rate"}
      >
        <span className="drill-plan-value">
          +{increment}
          {mode === "zigzag" && <span className="drill-plan-down"> −{decrement}</span>}
        </span>
        <span className="drill-plan-unit">{t("drill.speedUp")}</span>
      </button>

      <span className="drill-plan-sep" aria-hidden="true" />

      <button
        type="button"
        className={`drill-plan-token ${openField === "shape" ? "open" : ""}`}
        onClick={() => toggle("shape")}
        aria-expanded={openField === "shape"}
      >
        <span className="drill-plan-value">{t("drill.repsSummary", { count: barsPerStep })}</span>
        <span className="drill-plan-unit">
          {t("drill.beatsSummary", { count: beatsPerBar })}
        </span>
      </button>
    </div>
  );
}
