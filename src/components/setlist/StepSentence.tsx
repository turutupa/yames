import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  DrillConfigPopover,
  DrillPopoverChoices,
  DrillPopoverRow,
  DrillNumberField,
} from "../../containers/drill/DrillConfigPopover";
import { SubdivisionIcon } from "../MetronomeIcons";
import { METER_PRESETS, SOUND_TYPES } from "../../constants/metronome";
import { meterLabel, meterTotal } from "../../utils/meter";
import { triggerLabel, transitionLabel } from "./format";
import { TransitionEditor } from "./TransitionEditor";
import type { SetlistStep, SetlistTransition, SetlistTrigger, Subdivision } from "../../types";

/**
 * One step of a setlist, written out as a sentence you can reach into.
 *
 * This is the Drill page's idiom, deliberately and to the pixel: the same
 * `.drill-plan-*` classes, the same 2.6rem loud line over a 0.95rem quiet
 * one, the same 2px dotted rule that says "this phrase is a control". Two
 * screens that ask the same kind of question — a configuration with a start
 * and an end — should not ask it in two different languages, and the drill
 * got there first.
 *
 * It replaces the step CARD, which had to carry name, config, sound and four
 * tool buttons because it was the only place any of them could be edited.
 * Once the sentence owns editing, a closed row needs a name and a number.
 *
 * The popovers are the drill's too, imported rather than reimplemented. That
 * import points from `components/` into `containers/drill/` and is the wrong
 * way round for the folder names; one popover with one set of clamping and
 * placement rules is worth more than the tidier address, and the alternative
 * — moving the file — would rename the CSS out from under a screen that has
 * already shipped.
 */

/** Same list the drill offers. Six is what the engine's meter can hold. */
const SUBDIVISIONS = [1, 2, 3, 4, 5, 6] as const;

/** Which phrase, if any, has its window open. */
type Field = "tempo" | "meter" | "sub" | "gap" | "name" | "sound" | "volume" | null;

interface StepSentenceProps {
  step: SetlistStep;
  /** 1-based, for the kicker above the sentence. */
  number: number;
  total: number;
  isLast: boolean;
  /** The whole step, patched. The paragraph owns the setlist. */
  onChange: (patch: Partial<Omit<SetlistStep, "id">>) => void;
  /** Smaller type in the player, where the number is the loud thing instead. */
  quiet?: boolean;
}

export function StepSentence({
  step,
  number,
  total,
  isLast,
  onChange,
  quiet,
}: StepSentenceProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<Field>(null);
  const anchors = useRef<Record<string, HTMLElement | null>>({});
  const [nameDraft, setNameDraft] = useState(step.name);

  const close = () => setOpen(null);
  const anchor = (key: string) => (el: HTMLElement | null) => {
    anchors.current[key] = el;
  };
  const toggle = (key: Exclude<Field, null>) => () =>
    setOpen((current) => (current === key ? null : key));

  const meter = step.freeMode ? t("metronome.free") : meterLabel(step.beatGroups);
  const beats = meterTotal(step.beatGroups);

  /** The window's quiet footer: what one pass of this step comes to. */
  const note = t("setlist.said.stepNote", { number, total });

  const gapPatch = (patch: { trigger?: SetlistTrigger; transition?: SetlistTransition }) =>
    onChange(patch);

  return (
    <div className={`drill-plan-block setlist-sentence${quiet ? " setlist-sentence-quiet" : ""}`}>
      <div className="drill-plan">
        <button
          type="button"
          ref={anchor("tempo")}
          className={`drill-plan-token${open === "tempo" ? " open" : ""}`}
          aria-expanded={open === "tempo"}
          onClick={toggle("tempo")}
        >
          <span className="drill-plan-value">{step.bpm}</span>
          <span className="drill-plan-unit">{t("drill.bpmUnit")}</span>
        </button>

        <span className="drill-plan-sep" aria-hidden="true" />

        <button
          type="button"
          ref={anchor("meter")}
          className={`drill-plan-token${open === "meter" ? " open" : ""}`}
          aria-expanded={open === "meter"}
          aria-label={t("metronome.meter")}
          onClick={toggle("meter")}
        >
          <span className="drill-plan-value">{meter}</span>
        </button>

        <span className="drill-plan-sep" aria-hidden="true" />

        <button
          type="button"
          ref={anchor("sub")}
          className={`drill-plan-token${open === "sub" ? " open" : ""}`}
          aria-expanded={open === "sub"}
          aria-label={t("metronome.subdivision")}
          onClick={toggle("sub")}
        >
          <span className="drill-plan-value">{t(`subdiv.${step.subdivision}`).toLowerCase()}</span>
        </button>
      </div>

      {/* The line the cards never had room for, and the one a setlist is
          actually for: how long this step lasts and how the next one arrives.
          Both phrases open the same window, because "ends after two minutes"
          and "then counts you in" are two halves of one decision. */}
      <div className="drill-plan setlist-plan-timing">
        <span className="setlist-plan-glue">
          {step.trigger.kind === "manual" ? t("setlist.said.runs") : t("setlist.said.for")}
        </span>
        <button
          type="button"
          ref={anchor("gap")}
          className={`drill-plan-token${open === "gap" ? " open" : ""}`}
          aria-expanded={open === "gap"}
          aria-label={t("setlist.gap.title")}
          onClick={toggle("gap")}
        >
          <span className="drill-plan-value setlist-plan-mid">{triggerLabel(t, step.trigger)}</span>
        </button>
        <span className="setlist-plan-glue">
          {isLast ? t("setlist.said.andThen") : t("setlist.said.then")}
        </span>
        <button
          type="button"
          className={`drill-plan-token${open === "gap" ? " open" : ""}`}
          aria-expanded={open === "gap"}
          onClick={toggle("gap")}
        >
          <span className="drill-plan-value setlist-plan-mid">
            {isLast ? t("setlist.said.theSetlistEnds") : transitionLabel(t, step.transition)}
          </span>
        </button>
      </div>

      <div className="drill-plan-detail setlist-plan-detail">
        <button
          type="button"
          ref={anchor("name")}
          className={`drill-plan-detail-token${open === "name" ? " open" : ""}`}
          aria-expanded={open === "name"}
          onClick={() => {
            setNameDraft(step.name);
            toggle("name")();
          }}
        >
          {`“${step.name}”`}
        </button>
        <span className="drill-plan-detail-sep" aria-hidden="true">·</span>
        <button
          type="button"
          ref={anchor("sound")}
          className={`drill-plan-detail-token${open === "sound" ? " open" : ""}`}
          aria-expanded={open === "sound"}
          onClick={toggle("sound")}
        >
          {t(`sound.${step.soundType}`).toLowerCase()}
        </button>
        <span className="drill-plan-detail-sep" aria-hidden="true">·</span>
        <button
          type="button"
          ref={anchor("volume")}
          className={`drill-plan-detail-token${open === "volume" ? " open" : ""}`}
          aria-expanded={open === "volume"}
          onClick={toggle("volume")}
        >
          {t("setlist.said.volume", { percent: Math.round(step.volume * 100) })}
        </button>
      </div>

      {open === "tempo" && (
        <DrillConfigPopover
          anchor={anchors.current.tempo ?? null}
          onClose={close}
          clears=".setlist-sentence"
          label={t("metronome.tempo")}
          note={note}
        >
          <DrillPopoverRow label={t("metronome.tempo")}>
            <DrillNumberField
              value={step.bpm}
              min={20}
              max={300}
              unit={t("drill.bpmUnit")}
              label={t("metronome.tempo")}
              onCommit={(bpm) => onChange({ bpm })}
            />
          </DrillPopoverRow>
        </DrillConfigPopover>
      )}

      {open === "meter" && (
        <DrillConfigPopover
          anchor={anchors.current.meter ?? null}
          onClose={close}
          clears=".setlist-sentence"
          label={t("metronome.meter")}
          note={note}
        >
          <DrillPopoverChoices label={t("metronome.meter")}>
            {METER_PRESETS.map((preset) => (
              <button
                key={preset.label}
                className={`drill-choice ${
                  !step.freeMode && meterLabel(step.beatGroups) === preset.label ? "active" : ""
                }`}
                aria-pressed={!step.freeMode && meterLabel(step.beatGroups) === preset.label}
                onClick={() => onChange({ beatGroups: [...preset.groups], freeMode: false })}
              >
                <span className="drill-choice-label">{preset.label}</span>
              </button>
            ))}
          </DrillPopoverChoices>
          {/* Any bar length, for the meters the nine presets do not name. A
              number set here is ONE group, so the accent falls on beat one and
              nowhere else — the groupings above are how you get the others. */}
          <DrillPopoverRow label={t("drill.beats")} tip={t("setlist.said.beatsTip")}>
            <DrillNumberField
              value={beats || 4}
              min={1}
              max={12}
              label={t("drill.beats")}
              onCommit={(n) => onChange({ beatGroups: [n], freeMode: false })}
            />
          </DrillPopoverRow>
        </DrillConfigPopover>
      )}

      {open === "sub" && (
        <DrillConfigPopover
          anchor={anchors.current.sub ?? null}
          onClose={close}
          clears=".setlist-sentence"
          label={t("metronome.subdivision")}
          note={note}
        >
          <DrillPopoverChoices label={t("metronome.subdivision")}>
            {SUBDIVISIONS.map((sub) => (
              <button
                key={sub}
                className={`drill-choice ${step.subdivision === sub ? "active" : ""}`}
                aria-pressed={step.subdivision === sub}
                onClick={() => onChange({ subdivision: sub })}
              >
                <SubdivisionIcon sub={sub as Subdivision} size={22} />
                <span className="drill-choice-label">{t(`subdiv.${sub}`)}</span>
              </button>
            ))}
          </DrillPopoverChoices>
        </DrillConfigPopover>
      )}

      {/* The click, and here it is the STEP's, not the app's. A setlist that
          could not change its sound between steps would be a setlist that
          cannot tell a warm-up from a burst. */}
      {open === "sound" && (
        <DrillConfigPopover
          anchor={anchors.current.sound ?? null}
          onClose={close}
          clears=".setlist-sentence"
          label={t("metronome.soundLabel")}
          note={note}
        >
          <DrillPopoverChoices label={t("metronome.soundLabel")}>
            {SOUND_TYPES.map((snd) => (
              <button
                key={snd.id}
                className={`drill-choice ${step.soundType === snd.id ? "active" : ""}`}
                aria-pressed={step.soundType === snd.id}
                onClick={() => onChange({ soundType: snd.id })}
              >
                <span className="drill-choice-glyph" aria-hidden="true">{snd.icon}</span>
                <span className="drill-choice-label">{t(`sound.${snd.id}`)}</span>
              </button>
            ))}
          </DrillPopoverChoices>
        </DrillConfigPopover>
      )}

      {open === "volume" && (
        <DrillConfigPopover
          anchor={anchors.current.volume ?? null}
          onClose={close}
          clears=".setlist-sentence"
          label={t("setlist.said.volumeLabel")}
          note={note}
        >
          <DrillPopoverRow label={t("setlist.said.volumeLabel")}>
            <input
              className="setlist-volume-range"
              type="range"
              min={0}
              max={100}
              value={Math.round(step.volume * 100)}
              aria-label={t("setlist.said.volumeLabel")}
              onChange={(e) => onChange({ volume: Number(e.target.value) / 100 })}
            />
          </DrillPopoverRow>
        </DrillConfigPopover>
      )}

      {open === "name" && (
        <DrillConfigPopover
          anchor={anchors.current.name ?? null}
          onClose={close}
          clears=".setlist-sentence"
          label={t("setlist.renameStep")}
        >
          <DrillPopoverRow label={t("setlist.renameStep")}>
            <input
              className="setlist-name-input"
              value={nameDraft}
              maxLength={24}
              autoFocus
              aria-label={t("setlist.renameStep")}
              onFocus={(e) => e.target.select()}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={() => {
                const name = nameDraft.trim();
                if (name) onChange({ name });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const name = nameDraft.trim();
                  if (name) onChange({ name });
                  close();
                }
                if (e.key === "Escape") close();
              }}
            />
          </DrillPopoverRow>
        </DrillConfigPopover>
      )}

      {open === "gap" && (
        <TransitionEditor
          step={step}
          isLast={isLast}
          anchor={anchors.current.gap ?? null}
          onChange={gapPatch}
          onClose={close}
        />
      )}
    </div>
  );
}
