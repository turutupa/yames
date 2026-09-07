import type { MutableRefObject } from "react";
import { useTranslation } from "react-i18next";

/** Which settings the plan line is asking the config window to show. */
export type PlanField =
  | "tempo"
  | "rate"
  | "repeats"
  | "beats"
  | "sub"
  | "sound"
  | "more"
  | null;

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
  /** Ticks per beat the drill will play. */
  subdivision: number;
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
  subdivision,
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
          ref={anchor("repeats")}
          className={`drill-plan-token ${openField === "repeats" ? "open" : ""}`}
          onClick={() => toggle("repeats")}
          aria-expanded={openField === "repeats"}
        >
          <span className="drill-plan-value">
            {t("drill.everyBars", { count: barsPerStep })}
          </span>
        </button>
      </div>

      {/* Every phrase down here opens something too. Two of them used to be
          plain text — the subdivision because the engine pinned a drill to
          quarter notes, and the click because it is changed from the header
          chip. Both were the only unclickable words in a line of clickable
          ones, which reads as a bug rather than as a rule. */}
      <div className="drill-plan-detail">
        <button
          type="button"
          ref={anchor("beats")}
          className={`drill-plan-detail-token ${openField === "beats" ? "open" : ""}`}
          onClick={() => toggle("beats")}
          aria-expanded={openField === "beats"}
        >
          {t("drill.beatsSummary", { count: beatsPerBar })}
        </button>
        <span className="drill-plan-detail-sep" aria-hidden="true">
          ·
        </span>
        {/* Bare `subdiv.N`, not "N notes": every locale's names already read
            as note values ("Viertel", "Noire", "Negra"), so a "notes" suffix
            would be wrong in most of them. Same labels the metronome uses. */}
        <button
          type="button"
          ref={anchor("sub")}
          className={`drill-plan-detail-token ${openField === "sub" ? "open" : ""}`}
          onClick={() => toggle("sub")}
          aria-expanded={openField === "sub"}
        >
          {t(`subdiv.${subdivision}`)}
        </button>
        <span className="drill-plan-detail-sep" aria-hidden="true">
          ·
        </span>
        {/* The click is global state — the same setting the header chip
            changes. Two doors to one switch is better than a word that looks
            like the others and does nothing. */}
        <button
          type="button"
          ref={anchor("sound")}
          className={`drill-plan-detail-token ${openField === "sound" ? "open" : ""}`}
          onClick={() => toggle("sound")}
          aria-expanded={openField === "sound"}
        >
          {t("drill.soundPhrase", { sound: soundName })}
        </button>
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
