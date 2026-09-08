import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { ChainStep, ChainTransition, ChainTrigger } from "../../types";
import { durationLabel } from "./format";

interface TransitionEditorProps {
  step: ChainStep;
  /** True for the gap that ends a pass, which reads differently. (U9.6) */
  isLast: boolean;
  /**
   * The chip this panel belongs to. It is rendered in a portal — see the
   * placement effect — so it can no longer find its anchor by walking up the
   * DOM, and an outside-click check has to know the chip is not "outside".
   */
  anchor: HTMLElement | null;
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
export function TransitionEditor({ step, isLast, anchor, onChange, onClose }: TransitionEditorProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const { trigger, transition } = step;

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target)) return;
      // The chip toggles on its own click; treating it as "outside" would
      // close and immediately reopen. It is no longer an ancestor of this
      // panel, so it has to be named.
      if (anchor?.contains(target)) return;
      onClose();
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

  /**
   * Keep the panel on the screen.
   *
   * It is anchored to its own gap, and the last gap sits at the right-hand end
   * of the track — at 1440 wide the fourth step's editor opened 13px past the
   * edge of the window, with the track's own horizontal scroll unable to reach
   * it. Found by opening all four in the running app; no test would have,
   * because nothing about it is wrong until it is laid out.
   *
   * Measured rather than guessed at with `:nth-last-child`: how much room is
   * left depends on the window, the step count and how far the track has been
   * scrolled, and only one of those is known to CSS.
   */
  /**
   * ...and it is rendered into the body rather than beside its chip, because
   * the track would otherwise cut it off.
   *
   * `.chain-track-strip` asks for `overflow-x: auto; overflow-y: visible`, and
   * CSS does not grant that pair — when either axis is `auto`, `visible`
   * computes to `auto` on the other. So the strip clipped this panel
   * vertically: 175px of the "when I say" editor was cut at 1280x680, which is
   * what the owner reported as "a popover that is cut by the content below".
   * The stylesheet asked for `visible`; the browser answered `auto`.
   *
   * Re-measured on resize AND on scroll with a capturing listener, because the
   * strip scrolls sideways under the panel and that scroll does not bubble.
   */
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !anchor) return;
    const place = () => {
      const a = anchor.getBoundingClientRect();
      const margin = 12;
      const width = el.offsetWidth;
      const height = el.offsetHeight;
      // Hangs off its chip, nudged back inside if either edge would leave the
      // window — the same rule the CSS `--editor-shift` used to express, now
      // able to move on both axes.
      let left = a.left - 52;
      if (left + width > window.innerWidth - margin) {
        left = window.innerWidth - margin - width;
      }
      if (left < margin) left = margin;
      let top = a.bottom + 10;
      if (top + height > window.innerHeight - margin) {
        const above = a.top - 10 - height;
        top =
          above >= margin
            ? above
            : Math.max(margin, window.innerHeight - margin - height);
      }
      setPos({ left: Math.round(left), top: Math.round(top) });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor]);

  const setTrigger = (next: ChainTrigger) => onChange({ trigger: next });
  const setTransition = (next: ChainTransition) => onChange({ transition: next });

  return createPortal(
    <div
      className="chain-transition-editor"
      ref={ref}
      role="dialog"
      aria-label={t("chain.gap.title")}
      style={
        pos
          ? { left: pos.left, top: pos.top }
          : // Laid out so `offsetWidth`/`offsetHeight` are real, painted
            // nowhere. `opacity`, not `visibility` — a hidden element cannot
            // take focus, which has bitten this codebase once already.
            { left: 0, top: 0, opacity: 0, pointerEvents: "none" }
      }
    >
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

      {/* It plays now. The note this replaced said it did not — U9.5 has been
          done, the engine's count-in is no longer the drill's, and a chain can
          arm one between steps. Kept as a plain explanation rather than a
          warning because there is nothing left to warn about. */}
      {transition.kind === "countIn" && (
        <p className="chain-editor-note">{t("chain.gap.countInPlays")}</p>
      )}

      <p className="chain-editor-footnote">{t("chain.gap.barFinishes")}</p>
    </div>,
    document.body,
  );
}
