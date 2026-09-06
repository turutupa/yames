import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  duplicateStep,
  removeStep,
  reorderSteps,
  setChainRepeat,
  updateStep,
} from "../../chain";
import { meterLabel } from "../../utils/meter";
import type { Chain, ChainStep, ChainTransition, ChainTrigger } from "../../types";
import { TransitionEditor } from "./TransitionEditor";
import { chainSeconds, durationLabel, repeatLabel, stepConfigLabel, triggerLabel } from "./format";

import type { ChainRemaining } from "./format";

interface ChainTrackProps {
  chain: Chain;
  selectedStepId: string | null;
  onSelectStep: (stepId: string) => void;
  /** Index of the step the runner is on, or -1 when the chain is not running. */
  runningIndex: number;
  remaining: ChainRemaining;
  onChange: (chain: Chain) => void;
  /** Append a step built from whatever the metronome is set to now. */
  onAddStep: () => void;
}

function MoveIcon({ back }: { back?: boolean }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points={back ? "14 6 8 12 14 18" : "10 6 16 12 10 18"} />
    </svg>
  );
}

/**
 * The chain, laid out along the top of the stage: a card per step and a chip
 * in every gap.
 *
 * Horizontal because a chain is a thing you read left to right and because
 * the stage below it has to stay the metronome — the whole point of the
 * artboard is that loading a chain does not swap the app into a second mode
 * with its own controls. The track is a strip; everything under it is the
 * metronome pointed at whichever step is selected.
 *
 * Every step carries a gap, the last one included. The artboard draws no chip
 * after step four, but `ChainStep.trigger` on the last step is what ends the
 * pass — without it a chain could neither repeat nor stop on its own, which
 * U9.6 asks for both of. So the chip is drawn there too.
 */
export function ChainTrack({
  chain,
  selectedStepId,
  onSelectStep,
  runningIndex,
  remaining,
  onChange,
  onAddStep,
}: ChainTrackProps) {
  const { t } = useTranslation();
  const [openGap, setOpenGap] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming) {
      renameRef.current?.focus();
      renameRef.current?.select();
    }
  }, [renaming]);

  // A gap editor left open over a step that has since been removed would
  // float unanchored, so the chain's own shape closes it.
  useEffect(() => {
    if (openGap && !chain.steps.some((s) => s.id === openGap)) setOpenGap(null);
  }, [chain.steps, openGap]);

  const total = chainSeconds(chain);
  const patchGap = (
    stepId: string,
    patch: { trigger?: ChainTrigger; transition?: ChainTransition },
  ) => onChange(updateStep(chain, stepId, patch));

  const commitRename = (stepId: string) => {
    const name = renameValue.trim();
    if (name) onChange(updateStep(chain, stepId, { name }));
    setRenaming(null);
  };

  return (
    <section className="chain-track" aria-label={t("chain.track")}>
      <div className="chain-track-head">
        <span className="chain-track-title">{t("chain.track")}</span>
        <div className="chain-track-meta">
          <span className="chain-track-summary">
            {[
              t("chain.summary.steps", { count: chain.steps.length }),
              total !== null ? t("chain.summary.about", { duration: durationLabel(t, total) }) : null,
              chain.repeat === 0 ? t("chain.summary.forever") : t("chain.summary.ends"),
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
          {/* Repeat is a count, never a switch (U9.6): "three times through"
              and "until I stop" are the same control at different numbers,
              and a checkbox can only ever say the second one. */}
          <div className="chain-repeat">
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
        </div>
      </div>

      <div className="chain-track-strip">
        {chain.steps.map((step, index) => {
          const running = index === runningIndex;
          const selected = step.id === selectedStepId;
          return (
            <div className="chain-track-cell" key={step.id}>
              <div
                className={`chain-step${running ? " running" : ""}${selected ? " selected" : ""}`}
                aria-current={running ? "step" : undefined}
                onClick={() => onSelectStep(step.id)}
              >
                <div className="chain-step-head">
                  <span className="chain-step-index">
                    {running ? t("chain.now", { number: index + 1 }) : index + 1}
                  </span>
                  {running && <span className="chain-step-progress-label">{progressLabel(t, step, remaining)}</span>}
                </div>

                {renaming === step.id ? (
                  <input
                    ref={renameRef}
                    className="chain-step-rename"
                    value={renameValue}
                    maxLength={24}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => commitRename(step.id)}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename(step.id);
                      if (e.key === "Escape") setRenaming(null);
                      e.stopPropagation();
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="chain-step-name"
                    title={selected ? t("chain.renameStep") : t("chain.selectStep")}
                    onClick={(e) => {
                      e.stopPropagation();
                      // One click to point the metronome at it, a second to
                      // rename — the same escalation the context bar's preset
                      // name uses, so the gesture is learned once.
                      if (selected) {
                        setRenameValue(step.name);
                        setRenaming(step.id);
                      } else {
                        onSelectStep(step.id);
                      }
                    }}
                  >
                    {step.name}
                  </button>
                )}

                <div className="chain-step-config">
                  {stepConfigLabel(t, step, step.freeMode ? t("metronome.free") : meterLabel(step.beatGroups))}
                </div>

                {running ? (
                  <div className="chain-step-bar" aria-hidden="true">
                    <div className="chain-step-bar-fill" style={{ width: `${progressPercent(step, remaining)}%` }} />
                  </div>
                ) : (
                  <div className="chain-step-sound">
                    {t(`sound.${step.soundType}`)} · {t("chain.volume", { percent: Math.round(step.volume * 100) })}
                  </div>
                )}

                <div className="chain-step-tools">
                  <button
                    type="button"
                    aria-label={t("chain.moveEarlier")}
                    title={t("chain.moveEarlier")}
                    disabled={index === 0}
                    onClick={(e) => {
                      e.stopPropagation();
                      onChange(reorderSteps(chain, index, index - 1));
                    }}
                  >
                    <MoveIcon back />
                  </button>
                  <button
                    type="button"
                    aria-label={t("chain.moveLater")}
                    title={t("chain.moveLater")}
                    disabled={index === chain.steps.length - 1}
                    onClick={(e) => {
                      e.stopPropagation();
                      onChange(reorderSteps(chain, index, index + 1));
                    }}
                  >
                    <MoveIcon />
                  </button>
                  <button
                    type="button"
                    aria-label={t("chain.duplicateStep")}
                    title={t("chain.duplicateStep")}
                    onClick={(e) => {
                      e.stopPropagation();
                      onChange(duplicateStep(chain, step.id));
                    }}
                  >
                    ⧉
                  </button>
                  <button
                    type="button"
                    className="chain-step-remove"
                    aria-label={t("chain.removeStep")}
                    title={t("chain.removeStep")}
                    onClick={(e) => {
                      e.stopPropagation();
                      onChange(removeStep(chain, step.id));
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className="chain-gap">
                <button
                  type="button"
                  className={`chain-gap-chip${openGap === step.id ? " open" : ""}${
                    step.trigger.kind === "manual" ? " manual" : ""
                  }`}
                  aria-expanded={openGap === step.id}
                  aria-label={t("chain.gap.edit", {
                    number: index + 1,
                    gap: triggerLabel(t, step.trigger),
                  })}
                  onClick={() => setOpenGap((open) => (open === step.id ? null : step.id))}
                >
                  {triggerLabel(t, step.trigger)}
                </button>
                {openGap === step.id && (
                  <TransitionEditor
                    step={step}
                    isLast={index === chain.steps.length - 1}
                    onChange={(patch) => patchGap(step.id, patch)}
                    onClose={() => setOpenGap(null)}
                  />
                )}
              </div>
            </div>
          );
        })}

        <button type="button" className="chain-add-step" aria-label={t("chain.addStep")} title={t("chain.addStep")} onClick={onAddStep}>
          +
        </button>
      </div>

      {chain.steps.length === 0 && (
        <p className="chain-track-empty">{t("chain.emptyHint")}</p>
      )}
    </section>
  );
}

/**
 * The rule between the track and the metronome, and the sentence that says
 * which of the two the controls below belong to.
 *
 * The artboard is emphatic about this line, and it is the one piece of copy
 * that stops the stage being ambiguous: the same BPM readout means "the
 * metronome" with no chain loaded and "step 2" with one.
 */
export function ChainStepHeading({ step, number }: { step: ChainStep | null; number: number }) {
  const { t } = useTranslation();
  if (!step) return null;
  return (
    <div className="chain-step-heading">
      <span className="chain-step-heading-title">
        {t("chain.stepHeading", { number, name: step.name })}
      </span>
      <span className="chain-step-heading-note">{t("chain.editingStep")}</span>
    </div>
  );
}

/** "bar 3 of 8", "1:20 left", or the gap that only the player can close. */
function progressLabel(
  t: (key: string, opts?: Record<string, unknown>) => string,
  step: ChainStep,
  remaining: ChainRemaining,
): string {
  if (!remaining) return "";
  if (remaining.kind === "manual") return t("chain.waitingForYou");
  if (remaining.kind === "seconds") {
    return t("chain.timeLeft", { duration: durationLabel(t, remaining.seconds) });
  }
  if (step.trigger.kind === "bars" && step.trigger.bars > 0) {
    const done = Math.max(0, step.trigger.bars - remaining.bars);
    return t("chain.barOf", { current: Math.min(step.trigger.bars, done + 1), total: step.trigger.bars });
  }
  // Armed, resting, or a gap whose trigger changed under the run: the switch
  // is already committed and there is nothing left to count.
  return t("chain.switching");
}

function progressPercent(step: ChainStep, remaining: ChainRemaining): number {
  if (!remaining || remaining.kind === "manual") return 0;
  if (remaining.kind === "seconds" && step.trigger.kind === "seconds" && step.trigger.seconds > 0) {
    return Math.min(100, Math.max(0, (1 - remaining.seconds / step.trigger.seconds) * 100));
  }
  if (remaining.kind === "bars" && step.trigger.kind === "bars" && step.trigger.bars > 0) {
    return Math.min(100, Math.max(0, (1 - remaining.bars / step.trigger.bars) * 100));
  }
  return 100;
}
