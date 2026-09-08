import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  duplicateStep,
  removeStep,
  reorderSteps,
  setChainRepeat,
  updateStep,
} from "../../chain";
import { meterLabel } from "../../utils/meter";
import { chainSeconds, durationLabel, repeatLabel, stepSaidQuietly, stepSaidTiming } from "./format";
import { StepSentence } from "./StepSentence";
import type { Chain, ChainStep } from "../../types";

/**
 * The chain, written out as a paragraph: every step one line, the step you
 * clicked opened in place into its own sentence.
 *
 * This is the editor half of chain mode. It replaced a horizontal strip of
 * 168x136 cards which cost 309px of the stage before the metronome under it
 * even started drawing — at 1440x900 the metronome then had 364px of the
 * 523px it needs, and the overflow was invisible because the stage hides its
 * scrollbar. A closed row here is 36px, so ten steps and the open one come to
 * 593px of the 672px this stage has: the same 672px the metronome gets with
 * no chain loaded, because nothing sits above either.
 *
 * The other half is `ChainPlayer`, and the two never appear together. One
 * screen was trying to hold two afternoons: building a chain is desk work,
 * rare, wanting every control; playing one is done a metre back with a guitar
 * in your hands, wanting a tempo you can read from there. Start swaps the
 * room.
 *
 * The open block moves as you click down the list. That is not the fault this
 * screen has been bitten by three times — those were things moving WITHOUT a
 * click, while your eye was elsewhere. This movement is yours, your eye is
 * already where you clicked, and the row you clicked stays exactly where it
 * was while the sentence opens beneath it. It is an accordion.
 */

interface ChainParagraphProps {
  chain: Chain;
  selectedStepId: string | null;
  onSelectStep: (stepId: string) => void;
  /** Index the runner is on, or -1. A chain can run while you edit it. */
  runningIndex: number;
  onChange: (chain: Chain) => void;
  /** A new step, built from the one above it. */
  onAddStep: () => void;
  /** Back to the player, when you opened this while the chain was running. */
  onBackToPlaying?: () => void;
}

function ToolIcon({ kind }: { kind: "up" | "down" | "copy" | "remove" }) {
  const common = {
    width: 13,
    height: 13,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2.4,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (kind === "up") return <svg {...common}><polyline points="6 14 12 8 18 14" /></svg>;
  if (kind === "down") return <svg {...common}><polyline points="6 10 12 16 18 10" /></svg>;
  if (kind === "copy")
    return (
      <svg {...common}>
        <rect x="9" y="9" width="11" height="11" rx="2" />
        <path d="M5 15V5a2 2 0 0 1 2-2h10" />
      </svg>
    );
  return <svg {...common}><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></svg>;
}

export function ChainParagraph({
  chain,
  selectedStepId,
  onSelectStep,
  runningIndex,
  onChange,
  onAddStep,
  onBackToPlaying,
}: ChainParagraphProps) {
  const { t } = useTranslation();
  const listRef = useRef<HTMLDivElement>(null);
  const openRef = useRef<HTMLDivElement>(null);

  const total = chainSeconds(chain);
  const patch = (stepId: string, next: Partial<Omit<ChainStep, "id">>) =>
    onChange(updateStep(chain, stepId, next));

  // A step opened near the bottom of a long chain would open below the fold.
  // Only when the SELECTION changes — not on every edit, or typing a tempo
  // would drag the page around under the window you typed it in.
  useEffect(() => {
    openRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedStepId]);

  return (
    <section className="chain-paragraph" aria-label={t("chain.track")}>
      <div className="chain-paragraph-head">
        <span className="chain-paragraph-title">{t("chain.track")}</span>
        <span className="chain-paragraph-summary">
          {[
            t("chain.summary.steps", { count: chain.steps.length }),
            total !== null ? t("chain.summary.about", { duration: durationLabel(t, total) }) : null,
            chain.repeat === 0 ? t("chain.summary.forever") : t("chain.summary.ends"),
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
        <span className="chain-paragraph-spacer" />
        {runningIndex >= 0 && onBackToPlaying && (
          <button type="button" className="chain-back-to-playing" onClick={onBackToPlaying}>
            {t("chain.player.backToPlaying")}
          </button>
        )}
        {/* Repeat is a count, never a switch (U9.6): "three times through" and
            "until I stop" are one control at different numbers. */}
        <span className="chain-repeat-label">{t("chain.repeat.label")}</span>
        <div className="chain-stepper-field">
          <button
            type="button"
            aria-label={t("chain.repeat.fewer")}
            title={t("chain.repeat.fewer")}
            onClick={() => onChange(setChainRepeat(chain, Math.max(0, chain.repeat - 1)))}
          >
            −
          </button>
          <span className="chain-stepper-value">{repeatLabel(t, chain.repeat)}</span>
          <button
            type="button"
            aria-label={t("chain.repeat.more")}
            title={t("chain.repeat.more")}
            onClick={() => onChange(setChainRepeat(chain, chain.repeat + 1))}
          >
            +
          </button>
        </div>
      </div>

      <div className="chain-paragraph-list" ref={listRef}>
        {chain.steps.map((step, index) => {
          const open = step.id === selectedStepId;
          const running = index === runningIndex;
          const isLast = index === chain.steps.length - 1;
          const meter = step.freeMode ? t("metronome.free") : meterLabel(step.beatGroups);

          if (open) {
            return (
              <div
                className={`chain-open-step${running ? " running" : ""}`}
                key={step.id}
                ref={openRef}
              >
                <span className="chain-open-no">
                  {running ? t("chain.nowShort") : index + 1}
                </span>
                <StepSentence
                  step={step}
                  number={index + 1}
                  total={chain.steps.length}
                  isLast={isLast}
                  onChange={(next) => patch(step.id, next)}
                />
                {/* The four tools, on the open step only. On every card they
                    were 31px of reserved height apiece for buttons that were
                    invisible until hover; here they cost the nine closed rows
                    nothing at all. */}
                <div className="chain-open-tools">
                  <button
                    type="button"
                    aria-label={t("chain.moveEarlier")}
                    title={t("chain.moveEarlier")}
                    disabled={index === 0}
                    onClick={() => onChange(reorderSteps(chain, index, index - 1))}
                  >
                    <ToolIcon kind="up" />
                  </button>
                  <button
                    type="button"
                    aria-label={t("chain.moveLater")}
                    title={t("chain.moveLater")}
                    disabled={isLast}
                    onClick={() => onChange(reorderSteps(chain, index, index + 1))}
                  >
                    <ToolIcon kind="down" />
                  </button>
                  <button
                    type="button"
                    aria-label={t("chain.duplicateStep")}
                    title={t("chain.duplicateStep")}
                    onClick={() => onChange(duplicateStep(chain, step.id))}
                  >
                    <ToolIcon kind="copy" />
                  </button>
                  <button
                    type="button"
                    className="chain-open-remove"
                    aria-label={t("chain.removeStep")}
                    title={t("chain.removeStep")}
                    onClick={() => onChange(removeStep(chain, step.id))}
                  >
                    <ToolIcon kind="remove" />
                  </button>
                </div>
              </div>
            );
          }

          return (
            <button
              type="button"
              className={`chain-row${running ? " running" : ""}`}
              key={step.id}
              aria-current={running ? "step" : undefined}
              title={t("chain.selectStep")}
              onClick={() => onSelectStep(step.id)}
            >
              <span className="chain-row-no">{running ? t("chain.nowShort") : index + 1}</span>
              <span className="chain-row-name">{step.name}</span>
              <span className="chain-row-said">{stepSaidQuietly(t, step, meter)}</span>
              <span className="chain-row-timing">{stepSaidTiming(t, step, isLast)}</span>
            </button>
          );
        })}

        {chain.steps.length === 0 && (
          <p className="chain-paragraph-empty">{t("chain.emptyLead")}</p>
        )}

        <div className="chain-paragraph-foot">
          <button type="button" className="chain-add-row" onClick={onAddStep}>
            {t("chain.addStepPlain")}
          </button>
          <span className="chain-paragraph-orlibrary">{t("chain.orFromLibrary")}</span>
        </div>
      </div>
    </section>
  );
}
