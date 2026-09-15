import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  duplicateStep,
  duplicateSteps,
  moveSteps,
  removeStep,
  removeSteps,
  reorderSteps,
  setSetlistCountIn,
  setSetlistRepeat,
} from "../../setlist";
import { setlistSeconds, durationLabel, repeatLabel } from "./format";
import { StepSentence } from "./StepSentence";
import { JamGlyph } from "../jam/JamGlyph";
import type { Jam } from "../../jam";
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
  /**
   * The block, BESIDE the selection rather than instead of it.
   *
   * `selectedStepId` keeps every job it has — the engine mirror, the index a
   * run starts on, following the runner. This is only ever read for the
   * operations that take several steps at once: a drag, a duplicate, a
   * remove. A set of one is the ordinary case and reads exactly as it did
   * before.
   */
  selectedStepIds?: Set<string>;
  /** Shift-click, or Shift+↑/↓: the range from the anchor to this step. */
  onExtendSelection?: (stepId: string) => void;
  /** Ctrl-click (⌘ on a Mac): this step in or out of the block, on its own. */
  onToggleSelection?: (stepId: string) => void;
  /** Back to one step — Escape, and after an operation eats the block. */
  onCollapseSelection?: () => void;
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
  /**
   * The jam library, so a step that points at one can be drawn as the jam it
   * is and offered as something to add (JAM_MODE §8.5).
   *
   * The whole list rather than a lookup, because the add menu needs to show
   * it and the sentences need to search it, and one array read twice is
   * cheaper to reason about than two ways in.
   */
  jams?: Jam[];
  /** A jam, added to this setlist as a step. Absent: the affordance is not shown. */
  onAddJamStep?: (jam: Jam) => void;
  /** Back to the player, when you opened this while the setlist was running. */
  onBackToPlaying?: () => void;
}

/**
 * The six dots you grab a step by.
 *
 * The handle is what is `draggable`, not the row. A selected row opens into a
 * sentence full of inputs, and a drag that begins inside a text field must
 * never carry the step off with it — which is what dragging the whole row
 * would mean the moment the pointer started on a name or a tempo.
 */
function GripIcon() {
  return (
    <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" aria-hidden="true">
      {[4, 8, 12].map((y) => (
        <g key={y}>
          <circle cx="3" cy={y} r="1.2" />
          <circle cx="7" cy={y} r="1.2" />
        </g>
      ))}
    </svg>
  );
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
  selectedStepIds,
  onExtendSelection,
  onToggleSelection,
  onCollapseSelection,
  runningIndex,
  onChange,
  onPatchStep,
  onAddStep,
  jams,
  onAddJamStep,
  onBackToPlaying,
}: SetlistParagraphProps) {
  const { t } = useTranslation();
  const listRef = useRef<HTMLDivElement>(null);
  const openRef = useRef<HTMLDivElement>(null);
  /** The jam picker at the foot of the list, open or shut. */
  const [pickingJam, setPickingJam] = useState(false);
  const jamPickerRef = useRef<HTMLDivElement>(null);
  /** The steps a drag is carrying, or null when nothing is being dragged. */
  const [dragIds, setDragIds] = useState<string[] | null>(null);
  /** Where the line is drawn: which row, and which of its two edges. */
  const [dropAt, setDropAt] = useState<{ id: string; edge: "before" | "after" } | null>(null);

  /**
   * No reordering while the setlist plays.
   *
   * The runner addresses steps by INDEX, so a row moving under it changes
   * what plays next — you would drag step six out of the way and hear step
   * seven arrive early. The up and down buttons keep working because they
   * are the same one-position move the runner already survives, and because
   * they are the only path a touch screen has: HTML5 drag does not exist
   * there.
   */
  const locked = runningIndex >= 0;

  /** The set, in list order, or null when this row is on its own in it. */
  const blockFor = (stepId: string): string[] | null => {
    if (!selectedStepIds || selectedStepIds.size < 2 || !selectedStepIds.has(stepId)) return null;
    return setlist.steps.filter((s) => selectedStepIds.has(s.id)).map((s) => s.id);
  };

  /**
   * Where a drop on this row lands, counted on the list with the dragged
   * steps already lifted out — which is what `moveSteps` takes.
   *
   * -1 when the row under the pointer is part of the block itself: that drop
   * has no meaning and does nothing.
   */
  const landingIndex = (ids: string[], rowId: string, edge: "before" | "after"): number => {
    const rest = setlist.steps.filter((s) => !ids.includes(s.id));
    const at = rest.findIndex((s) => s.id === rowId);
    if (at < 0) return -1;
    return edge === "before" ? at : at + 1;
  };

  const startDrag = (e: React.DragEvent, step: SetlistStep) => {
    const block = blockFor(step.id);
    // A row outside the block is a block of one, and grabbing it makes it the
    // step you are working with — the same thing clicking it does.
    if (!block) onSelectStep(step.id);
    const ids = block ?? [step.id];
    setDragIds(ids);
    e.dataTransfer.effectAllowed = "move";
    // Firefox refuses to start a drag with nothing on the transfer.
    e.dataTransfer.setData("text/plain", ids.join(","));
  };

  const endDrag = () => {
    setDragIds(null);
    setDropAt(null);
  };

  const dragOverRow = (e: React.DragEvent, step: SetlistStep) => {
    if (!dragIds) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragIds.includes(step.id)) {
      setDropAt(null);
      return;
    }
    // A line between rows, not a highlighted row: "after this one" and
    // "instead of this one" are different answers, and a filled row only
    // says the second.
    const box = e.currentTarget.getBoundingClientRect();
    const edge = e.clientY < box.top + box.height / 2 ? "before" : "after";
    setDropAt({ id: step.id, edge });
  };

  const dropOnRow = (e: React.DragEvent, step: SetlistStep) => {
    if (!dragIds) return;
    e.preventDefault();
    const edge = dropAt?.id === step.id ? dropAt.edge : "after";
    const to = landingIndex(dragIds, step.id, edge);
    // The mutator clamps; the component only says where the line was.
    if (to >= 0) onChange(moveSteps(setlist, dragIds, to));
    endDrag();
  };

  /**
   * Alt+↑/↓ — the whole block, one position along.
   *
   * Measured on the list with the block lifted out, so "one position" is one
   * of the rows that are staying put rather than one of the rows moving with
   * you.
   */
  const nudgeBlock = (ids: string[], by: -1 | 1) => {
    const rest = setlist.steps.filter((s) => !ids.includes(s.id));
    const first = setlist.steps.findIndex((s) => s.id === ids[0]);
    const at = rest.filter((s) => setlist.steps.indexOf(s) < first).length;
    onChange(moveSteps(setlist, ids, at + by));
  };

  /** The row at `index`, so Shift+↑/↓ can take the focus with it. */
  const focusRow = (index: number) => {
    const rows = listRef.current?.querySelectorAll<HTMLElement>(".setlist-step");
    rows?.[index]?.focus();
  };

  const jamFor = (step: SetlistStep) =>
    step.jamId ? (jams?.find((j) => j.id === step.jamId) ?? null) : null;

  useEffect(() => {
    if (!pickingJam) return;
    const onDown = (e: MouseEvent) => {
      if (jamPickerRef.current?.contains(e.target as Node)) return;
      setPickingJam(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Claimed, so the window's own Escape door stands aside: one press used
      // to shut this picker and close the whole setlist behind it.
      e.preventDefault();
      setPickingJam(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [pickingJam]);

  /**
   * Escape gives the block back before it gives the setlist back.
   *
   * The window closes the loaded setlist on Escape. With several steps
   * marked, the first press means "never mind about those" — so it is
   * claimed here, exactly as the jam picker below claims it, and a second
   * press walks through the door as usual. With one step marked there is
   * nothing to give back and nothing is claimed.
   */
  const blockSize = selectedStepIds?.size ?? 0;
  useEffect(() => {
    if (blockSize < 2 || !onCollapseSelection) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onCollapseSelection();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [blockSize, onCollapseSelection]);

  const total = setlistSeconds(setlist);

  // Keep the selected step on screen — it is the one Start will begin on,
  // so it has to be visible when the selection moves without a click (Start,
  // a run advancing, a step being removed). Only on SELECTION changes: on
  // every edit it would drag the page around under the window you are
  // typing in.
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
          <span className="setlist-stepper-value is-countin">
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
          <span className="setlist-stepper-value is-repeat">{repeatLabel(t, setlist.repeat)}</span>
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
          const selected = step.id === selectedStepId;
          const running = index === runningIndex;
          const isLast = index === setlist.steps.length - 1;
          const block = blockFor(step.id);
          const inBlock = block !== null;
          const dragging = dragIds?.includes(step.id) ?? false;
          const drop = dropAt?.id === step.id ? dropAt.edge : undefined;

          return (
            <div
              className={`setlist-step${selected ? " selected" : ""}${running ? " running" : ""}${
                inBlock ? " multi" : ""
              }`}
              key={step.id}
              ref={selected ? openRef : undefined}
              data-dragging={dragging ? "" : undefined}
              data-drop={drop}
              onDragOver={(e) => dragOverRow(e, step)}
              onDrop={(e) => dropOnRow(e, step)}
              /*
               * `role` and `tabIndex` are load-bearing, not decoration.
               *
               * `useDrag` decides on mousedown whether the pointer is on a
               * control or on window furniture, and a bare `div` with an
               * `onClick` looks like furniture — so on WINDOWS it called
               * `startDragging()`, the OS took the mouse, and the click never
               * arrived. macOS was fine because `startDragging()` rejects on
               * a focused undecorated window and the manual fallback lets the
               * click through. The owner found it exactly that way: "clicking
               * on a step is not focusing it for me (I'm on Windows) — does
               * work on Mac."
               *
               * This is the second time this project has paid for a clickable
               * `div`; the first was the setlist rows in the library. Being
               * focusable is the honest definition of "the user aims at this",
               * and it makes the step keyboard-reachable at the same time.
               */
              role="button"
              tabIndex={0}
              aria-current={selected ? "true" : undefined}
              onClick={(e) => {
                /*
                 * Shift and Ctrl mark a block; a plain click is what it
                 * always was. Only when the pointer is on the row itself and
                 * not on a phrase inside it — shift-clicking "eighth" is a
                 * request to change the subdivision, and the modifier is
                 * noise on the way to it.
                 */
                const onControl = !!(e.target as HTMLElement).closest?.(
                  "button, input, select, textarea",
                );
                if (!onControl && e.shiftKey) {
                  onExtendSelection?.(step.id);
                  return;
                }
                if (!onControl && (e.ctrlKey || e.metaKey)) {
                  onToggleSelection?.(step.id);
                  return;
                }
                if (!selected) onSelectStep(step.id);
              }}
              onKeyDown={(e) => {
                // Not when the key belongs to a phrase inside the step.
                if (e.target !== e.currentTarget) return;
                const up = e.key === "ArrowUp";
                const down = e.key === "ArrowDown";
                if (up || down) {
                  /*
                   * ↑ and ↓ are the global tempo hotkeys, dispatched from a
                   * listener on `document`. React's own listener sits on the
                   * root inside it, so stopping propagation here is what
                   * keeps a step row from nudging the BPM while you are
                   * marking one.
                   */
                  if (e.shiftKey) {
                    const next = index + (down ? 1 : -1);
                    if (next < 0 || next >= setlist.steps.length) return;
                    e.preventDefault();
                    e.stopPropagation();
                    onExtendSelection?.(setlist.steps[next].id);
                    focusRow(next);
                    return;
                  }
                  if (e.altKey && !locked) {
                    e.preventDefault();
                    e.stopPropagation();
                    nudgeBlock(block ?? [step.id], down ? 1 : -1);
                    return;
                  }
                  return;
                }
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                if (!selected) onSelectStep(step.id);
              }}
            >
              {/* The handle, in the same hover-reveal family as the tools on
                  the right: drawn on every row at `opacity: 0` so a row can
                  never change height by gaining one. */}
              <span
                className={`setlist-step-grip${locked ? " is-locked" : ""}`}
                draggable={!locked}
                aria-hidden="true"
                title={locked ? t("setlist.stopToReorder") : t("setlist.reorderHint")}
                onDragStart={(e) => startDrag(e, step)}
                onDragEnd={endDrag}
                onClick={(e) => e.stopPropagation()}
              >
                <GripIcon />
              </span>
              <span className="setlist-step-no">
                {running ? t("setlist.nowShort") : index + 1}
              </span>
              <StepSentence
                step={step}
                number={index + 1}
                total={setlist.steps.length}
                isLast={isLast}
                folded
                jam={jamFor(step)}
                onChange={(next) => onPatchStep(step.id, next)}
              />
              {/* On the step you are working with, and on hover. They are
                  drawn on every step at `opacity: 0` so the row cannot
                  change height when they appear — the same reservation the
                  drill's last-run note needed, learned the same way. */}
              <div className="setlist-step-tools">
                <button
                  type="button"
                  aria-label={t("setlist.moveEarlier")}
                  title={t("setlist.moveEarlier")}
                  disabled={index === 0}
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange(reorderSteps(setlist, index, index - 1));
                  }}
                >
                  <ToolIcon kind="up" />
                </button>
                <button
                  type="button"
                  aria-label={t("setlist.moveLater")}
                  title={t("setlist.moveLater")}
                  disabled={isLast}
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange(reorderSteps(setlist, index, index + 1));
                  }}
                >
                  <ToolIcon kind="down" />
                </button>
                {/* On the block when there is one, and the label says how
                    many — a button that quietly took five steps off would be
                    the worst possible surprise on this screen. */}
                <button
                  type="button"
                  aria-label={
                    block
                      ? t("setlist.duplicateSteps", { count: block.length })
                      : t("setlist.duplicateStep")
                  }
                  title={
                    block
                      ? t("setlist.duplicateSteps", { count: block.length })
                      : t("setlist.duplicateStep")
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange(
                      block ? duplicateSteps(setlist, block) : duplicateStep(setlist, step.id),
                    );
                  }}
                >
                  <ToolIcon kind="copy" />
                </button>
                <button
                  type="button"
                  className="setlist-step-remove"
                  aria-label={
                    block ? t("setlist.removeSteps", { count: block.length }) : t("setlist.removeStep")
                  }
                  title={
                    block ? t("setlist.removeSteps", { count: block.length }) : t("setlist.removeStep")
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    if (block) {
                      onChange(removeSteps(setlist, block));
                      // The block is gone; the marks that pointed at it must
                      // go with it, or the next duplicate acts on ghosts.
                      onCollapseSelection?.();
                    } else {
                      onChange(removeStep(setlist, step.id));
                    }
                  }}
                >
                  <ToolIcon kind="remove" />
                </button>
              </div>
            </div>
          );
        })}

        {setlist.steps.length === 0 && (
          <p className="setlist-paragraph-empty">{t("setlist.emptyLead")}</p>
        )}

        <div className="setlist-paragraph-foot">
          <button type="button" className="setlist-add-row" onClick={onAddStep}>
            {t("setlist.addStepPlain")}
          </button>
          {/* A jam as a step, BESIDE the plain one rather than inside a menu on
              it (JAM_MODE §8.5). The two are the two kinds of thing a setlist
              can hold, and hiding one of them behind the other would make the
              band a variation on a click instead of the other thing you can
              put in a routine. Absent when the library is empty: an "add a
              jam" button that opens on nothing teaches the wrong lesson. */}
          {onAddJamStep && !!jams?.length && (
            <div className="setlist-add-jam-wrap" ref={jamPickerRef}>
              <button
                type="button"
                className={`setlist-add-row setlist-add-jam${pickingJam ? " open" : ""}`}
                aria-haspopup="menu"
                aria-expanded={pickingJam}
                onClick={() => setPickingJam((open) => !open)}
              >
                <JamGlyph />
                {t("setlist.jam.addStep")}
              </button>
              {pickingJam && (
                <div className="setlist-jam-menu" role="menu">
                  {jams.map((jam) => (
                    <button
                      key={jam.id}
                      role="menuitem"
                      type="button"
                      className="sub-dropdown-item"
                      onClick={() => {
                        setPickingJam(false);
                        onAddJamStep(jam);
                      }}
                    >
                      <JamGlyph />
                      <span>{jam.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
