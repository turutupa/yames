import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { ChainStep, ChainTransition, ChainTrigger } from "../../types";
import { durationLabel } from "./format";

interface TransitionEditorProps {
  step: ChainStep;
  /** True for the gap that ends a pass, which reads differently. (U9.6) */
  isLast: boolean;
  onChange: (patch: { trigger?: ChainTrigger; transition?: ChainTransition }) => void;
  onClose: () => void;
}

/** Bars are counted, so the range is small and whole. */
const BAR_MIN = 1;
const BAR_MAX = 64;
/** Quarter-minute steps: 15s is the shortest gap worth setting, an hour the
 *  longest anyone would sit through without touching the app. */
const SECONDS_STEP = 15;
const SECONDS_MIN = 15;
const SECONDS_MAX = 3600;
const REST_MAX = 8;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * A minus/plus pair around a value. The buttons carry their own names
 * because the value between them is the only other text in the row, and a
 * screen reader reading "minus, 2 min, plus" says nothing about what moves.
 */
function Stepper({
  label,
  value,
  decreaseLabel,
  increaseLabel,
  onDecrease,
  onIncrease,
}: {
  label: string;
  value: string;
  decreaseLabel: string;
  increaseLabel: string;
  onDecrease: () => void;
  onIncrease: () => void;
}) {
  return (
    <div className="chain-stepper">
      <span className="chain-stepper-label">{label}</span>
      <div className="chain-stepper-field">
        <button type="button" aria-label={decreaseLabel} title={decreaseLabel} onClick={onDecrease}>
          −
        </button>
        <span className="chain-stepper-value">{value}</span>
        <button type="button" aria-label={increaseLabel} title={increaseLabel} onClick={onIncrease}>
          +
        </button>
      </div>
    </div>
  );
}

/**
 * The gap editor — the two axes of U9.2, in the order the artboard puts
 * them: *when* to move on, then *how* to arrive.
 *
 * They are separate controls because they answer separate questions, and
 * folding them into one list of presets is exactly what cannot express
 * "after two minutes, with two bars of count-in".
 *
 * The note at the foot is not decoration. Every switch lands on a downbeat
 * (U9.3), which is the one thing about a chain that surprises people — a
 * time-based gap does *not* fire at the second you set, it fires at the
 * next bar line after it.
 */
export function TransitionEditor({ step, isLast, onChange, onClose }: TransitionEditorProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const { trigger, transition } = step;

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const setTrigger = (next: ChainTrigger) => onChange({ trigger: next });
  const setTransition = (next: ChainTransition) => onChange({ transition: next });

  return (
    <div className="chain-transition-editor" ref={ref} role="dialog" aria-label={t("chain.gap.title")}>
      <div className="chain-editor-label">{t("chain.gap.moveOn")}</div>
      <div className="chain-option-row">
        <button
          type="button"
          className={`chain-option${trigger.kind === "manual" ? " on" : ""}`}
          aria-pressed={trigger.kind === "manual"}
          onClick={() => setTrigger({ kind: "manual" })}
        >
          {t("chain.gap.whenISay")}
        </button>
        <button
          type="button"
          className={`chain-option${trigger.kind === "bars" ? " on" : ""}`}
          aria-pressed={trigger.kind === "bars"}
          onClick={() => setTrigger({ kind: "bars", bars: trigger.kind === "bars" ? trigger.bars : 8 })}
        >
          {t("chain.gap.afterBars")}
        </button>
        <button
          type="button"
          className={`chain-option${trigger.kind === "seconds" ? " on" : ""}`}
          aria-pressed={trigger.kind === "seconds"}
          onClick={() =>
            setTrigger({ kind: "seconds", seconds: trigger.kind === "seconds" ? trigger.seconds : 120 })
          }
        >
          {t("chain.gap.afterTime")}
        </button>
      </div>

      {trigger.kind === "bars" && (
        <Stepper
          label={t("chain.gap.after")}
          value={t("chain.trigger.barsShort", { count: trigger.bars })}
          decreaseLabel={t("chain.gap.fewerBars")}
          increaseLabel={t("chain.gap.moreBars")}
          onDecrease={() => setTrigger({ kind: "bars", bars: clamp(trigger.bars - 1, BAR_MIN, BAR_MAX) })}
          onIncrease={() => setTrigger({ kind: "bars", bars: clamp(trigger.bars + 1, BAR_MIN, BAR_MAX) })}
        />
      )}
      {trigger.kind === "seconds" && (
        <Stepper
          label={t("chain.gap.after")}
          value={durationLabel(t, trigger.seconds)}
          decreaseLabel={t("chain.gap.lessTime")}
          increaseLabel={t("chain.gap.moreTime")}
          onDecrease={() =>
            setTrigger({
              kind: "seconds",
              seconds: clamp(trigger.seconds - SECONDS_STEP, SECONDS_MIN, SECONDS_MAX),
            })
          }
          onIncrease={() =>
            setTrigger({
              kind: "seconds",
              seconds: clamp(trigger.seconds + SECONDS_STEP, SECONDS_MIN, SECONDS_MAX),
            })
          }
        />
      )}
      {trigger.kind === "manual" && (
        <p className="chain-editor-note">
          {isLast ? t("chain.gap.manualLastNote") : t("chain.gap.manualNote")}
        </p>
      )}

      <div className="chain-editor-label">{t("chain.gap.getThereBy")}</div>
      <div className="chain-option-row">
        <button
          type="button"
          className={`chain-option${transition.kind === "cut" ? " on" : ""}`}
          aria-pressed={transition.kind === "cut"}
          onClick={() => setTransition({ kind: "cut" })}
        >
          {t("chain.gap.cleanCut")}
        </button>
        <button
          type="button"
          className={`chain-option${transition.kind === "countIn" ? " on" : ""}`}
          aria-pressed={transition.kind === "countIn"}
          onClick={() =>
            setTransition({ kind: "countIn", bars: transition.kind === "countIn" ? transition.bars : 1 })
          }
        >
          {t("chain.gap.countMeIn")}
        </button>
        <button
          type="button"
          className={`chain-option${transition.kind === "rest" ? " on" : ""}`}
          aria-pressed={transition.kind === "rest"}
          onClick={() =>
            setTransition({ kind: "rest", bars: transition.kind === "rest" ? transition.bars : 1 })
          }
        >
          {t("chain.gap.restABar")}
        </button>
      </div>

      {transition.kind === "rest" && (
        <Stepper
          label={t("chain.gap.restFor")}
          value={t("chain.trigger.barsShort", { count: transition.bars })}
          decreaseLabel={t("chain.gap.fewerRestBars")}
          increaseLabel={t("chain.gap.moreRestBars")}
          onDecrease={() => setTransition({ kind: "rest", bars: clamp(transition.bars - 1, 1, REST_MAX) })}
          onIncrease={() => setTransition({ kind: "rest", bars: clamp(transition.bars + 1, 1, REST_MAX) })}
        />
      )}

      {/* The count-in is saved and shown, and it does not play (U9.5). Saying
          so here is the whole reason this note exists: the alternative is a
          control that silently means nothing, which is worse than one that
          admits what it is waiting for. */}
      {transition.kind === "countIn" && (
        <p className="chain-editor-note chain-editor-note-warn">{t("chain.gap.countInNotYet")}</p>
      )}

      <p className="chain-editor-footnote">{t("chain.gap.barFinishes")}</p>
    </div>
  );
}
