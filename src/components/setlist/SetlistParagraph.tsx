import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  duplicateStep,
  removeStep,
  reorderSteps,
  setSetlistCountIn,
  setSetlistRepeat,
} from "../../setlist";
import { meterLabel } from "../../utils/meter";
import { setlistSeconds, durationLabel, repeatLabel, stepSaidQuietly, stepSaidTiming } from "./format";
import { StepSentence } from "./StepSentence";
import type { Setlist, SetlistStep } from "../../types";

/**
 * The setlist, written out as a paragraph: every step one line, the step you
 * clicked opened in place into its own sentence.
 *
 * This is the editor half of setlist mode. It replaced a horizontal strip of
 * 168x136 cards which cost 309px of the stage before the metronome under it
 * even started drawing — at 1440x900 the metronome then had 364px of the
 * 523px it needs, and the overflow was invisible because the stage hides its
 * scrollbar. A closed row here is 36px, so ten steps and the open one come to
 * 593px of the 672px this stage has: the same 672px the metronome gets with
 * no setlist loaded, because nothing sits above either.
 *
 * The other half is `SetlistPlayer`, and the two never appear together. One
 * screen was trying to hold two afternoons: building a setlist is desk work,
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

interface SetlistParagraphProps {
  setlist: Setlist;
  selectedStepId: string | null;
  onSelectStep: (stepId: string) => void;
  /** Index the runner is on, or -1. A setlist can run while you edit it. */
  runningIndex: number;
  onChange: (setlist: Setlist) => void;
  /**
   * One step's configuration, changed from its sentence. Separate from
   * `onChange` because it has to reach the engine as well as the setlist —
   * see `patchStep` in `useSetlistSession`.
   */
  onPatchStep: (stepId: string, patch: Partial<Omit<SetlistStep, "id">>) => void;
  /** A new step, built from the one above it. */
  onAddStep: () => void;
  /** Back to the player, when you opened this while the setlist was running. */
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

export function SetlistParagraph({
  setlist,
  selectedStepId,
  onSelectStep,
  runningIndex,
  onChange,
  onPatchStep,
  onAddStep,
  onBackToPlaying,
}: SetlistParagraphProps) {
  const { t } = useTranslation();
  const listRef = useRef<HTMLDivElement>(null);
  const openRef = useRef<HTMLDivElement>(null);

  const total = setlistSeconds(setlist);

  // A step opened near the bottom of a long setlist would open below the fold.
  // Only when the SELECTION changes — not on every edit, or typing a tempo
  // would drag the page around under the window you typed it in.
  useEffect(() => {
    openRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedStepId]);

  return (
    <section className="setlist-paragraph" aria-label={t("setlist.track")}>
      <div className="setlist-paragraph-head">
        <span className="setlist-paragraph-title">{t("setlist.track")}</span>
        <span className="setlist-paragraph-summary">
          {[
            t("setlist.summary.steps", { count: setlist.steps.length }),
            total !== null ? t("setlist.summary.about", { duration: durationLabel(t, total) }) : null,
            setlist.repeat === 0 ? t("setlist.summary.forever") : t("setlist.summary.ends"),
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
        <span className="setlist-paragraph-spacer" />
        {runningIndex >= 0 && onBackToPlaying && (
          <button type="button" className="setlist-back-to-playing" onClick={onBackToPlaying}>
            {t("setlist.player.backToPlaying")}
          </button>
        )}
        {/* Beats counted out before step one, at step one's tempo. A count
            of beats and not a switch, for the reason the repeat below is: the
            useful question is how many, and "off" is simply none of them. */}
        <span className="setlist-repeat-label">{t("setlist.countIn.label")}</span>
        <div className="setlist-stepper-field">
          <button
            type="button"
            aria-label={t("setlist.countIn.fewer")}
            title={t("setlist.countIn.fewer")}
            onClick={() => onChange(setSetlistCountIn(setlist, (setlist.countIn ?? 0) - 1))}
          >
            −
          </button>
          <span className="setlist-stepper-value">
            {setlist.countIn
              ? t("setlist.countIn.beats", { count: setlist.countIn })
              : t("setlist.countIn.off")}
          </span>
          <button
            type="button"
            aria-label={t("setlist.countIn.more")}
            title={t("setlist.countIn.more")}
            onClick={() => onChange(setSetlistCountIn(setlist, (setlist.countIn ?? 0) + 1))}
          >
            +
          </button>
        </div>

        {/* Repeat is a count, never a switch (U9.6): "three times through" and
            "until I stop" are one control at different numbers. */}
        <span className="setlist-repeat-label">{t("setlist.repeat.label")}</span>
        <div className="setlist-stepper-field">
          <button
            type="button"
            aria-label={t("setlist.repeat.fewer")}
            title={t("setlist.repeat.fewer")}
            onClick={() => onChange(setSetlistRepeat(setlist, Math.max(0, setlist.repeat - 1)))}
          >
            −
          </button>
          <span className="setlist-stepper-value">{repeatLabel(t, setlist.repeat)}</span>
          <button
            type="button"
            aria-label={t("setlist.repeat.more")}
            title={t("setlist.repeat.more")}
            onClick={() => onChange(setSetlistRepeat(setlist, setlist.repeat + 1))}
          >
            +
          </button>
        </div>
      </div>

      <div className="setlist-paragraph-list" ref={listRef}>
        {setlist.steps.map((step, index) => {
          const open = step.id === selectedStepId;
          const running = index === runningIndex;
          const isLast = index === setlist.steps.length - 1;
          const meter = step.freeMode ? t("metronome.free") : meterLabel(step.beatGroups);

          if (open) {
            return (
              <div
                className={`setlist-open-step${running ? " running" : ""}`}
                key={step.id}
                ref={openRef}
              >
                <span className="setlist-open-no">
                  {running ? t("setlist.nowShort") : index + 1}
                </span>
                <StepSentence
                  step={step}
                  number={index + 1}
                  total={setlist.steps.length}
                  isLast={isLast}
                  onChange={(next) => onPatchStep(step.id, next)}
                />
                {/* The four tools, on the open step only. On every card they
                    were 31px of reserved height apiece for buttons that were
                    invisible until hover; here they cost the nine closed rows
                    nothing at all. */}
                <div className="setlist-open-tools">
                  <button
                    type="button"
                    aria-label={t("setlist.moveEarlier")}
                    title={t("setlist.moveEarlier")}
                    disabled={index === 0}
                    onClick={() => onChange(reorderSteps(setlist, index, index - 1))}
                  >
                    <ToolIcon kind="up" />
                  </button>
                  <button
                    type="button"
                    aria-label={t("setlist.moveLater")}
                    title={t("setlist.moveLater")}
                    disabled={isLast}
                    onClick={() => onChange(reorderSteps(setlist, index, index + 1))}
                  >
                    <ToolIcon kind="down" />
                  </button>
                  <button
                    type="button"
                    aria-label={t("setlist.duplicateStep")}
                    title={t("setlist.duplicateStep")}
                    onClick={() => onChange(duplicateStep(setlist, step.id))}
                  >
                    <ToolIcon kind="copy" />
                  </button>
                  <button
                    type="button"
                    className="setlist-open-remove"
                    aria-label={t("setlist.removeStep")}
                    title={t("setlist.removeStep")}
                    onClick={() => onChange(removeStep(setlist, step.id))}
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
              className={`setlist-row${running ? " running" : ""}`}
              key={step.id}
              aria-current={running ? "step" : undefined}
              title={t("setlist.selectStep")}
              onClick={() => onSelectStep(step.id)}
            >
              <span className="setlist-row-no">{running ? t("setlist.nowShort") : index + 1}</span>
              <span className="setlist-row-name">{step.name}</span>
              <span className="setlist-row-said">{stepSaidQuietly(t, step, meter)}</span>
              <span className="setlist-row-timing">{stepSaidTiming(t, step, isLast)}</span>
            </button>
          );
        })}

        {setlist.steps.length === 0 && (
          <p className="setlist-paragraph-empty">{t("setlist.emptyLead")}</p>
        )}

        <div className="setlist-paragraph-foot">
          <button type="button" className="setlist-add-row" onClick={onAddStep}>
            {t("setlist.addStepPlain")}
          </button>
          <span className="setlist-paragraph-orlibrary">{t("setlist.orFromLibrary")}</span>
        </div>
      </div>
    </section>
  );
}
