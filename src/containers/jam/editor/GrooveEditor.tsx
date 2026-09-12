import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import type { JamCustomGroove } from "../../../jam/types";
import {
  EDITABLE_LANES,
  LANE_LABELS,
  LEVEL_LABELS,
  cellLabel,
  cycleLevel,
  emptyPattern,
  isShuffleTick,
  meterCaption,
  normalizePattern,
  setCell,
  tickLabel,
} from "./editorModel";
import "../../../styles/jam-editor.css";

export type GrooveEditorPage = "bar" | "fill";

export interface GrooveEditorProps {
  value: JamCustomGroove;
  onChange: (next: JamCustomGroove) => void;
  /** The tick being played right now, or null when stopped; lights a column. */
  playingTick: number | null;
  /** Bar or fill being edited. */
  page: GrooveEditorPage;
  onPageChange: (page: GrooveEditorPage) => void;
  onDone: () => void;
  onReset: () => void;
}

const LEVEL_CLASS = ["off", "hit", "accent", "ghost"] as const;

/**
 * The groove editor (plan §4.1) — the drawer where a jam's drummer stops
 * being one of eight presets and becomes yours.
 *
 * The picture is the data. Four lanes down, one column per tick across,
 * grouped into beats with the beat's number over the first column of each
 * group, exactly the table `JamEngineConfig.bar` is. There is no translation
 * step between what you draw and what the drummer plays, which is the only
 * reason a grid like this is worth having: you can hear the change before you
 * finish reading the row.
 *
 * This component draws the editor and nothing around it. Where it docks, how
 * it opens, and what "Done" closes are the jam screen's business — it is
 * mounted inside that drawer, and holds no opinion about it.
 *
 * Three things that are easy to get wrong and are deliberate here:
 *
 * - **Every cell is a real button.** 44px tall, with an `aria-label` that
 *   says where it is and what it does ("Snare, beat 2, tick 3: accent"), and
 *   arrow keys walking a roving tabindex between them. A drum grid drawn out
 *   of divs is a picture of an instrument that only a mouse can play.
 * - **Space and Enter are handled here, not left to the browser.** The
 *   handler calls `preventDefault`, so the synthetic click a button would
 *   otherwise fire never happens and a cell cannot cycle twice from one
 *   press. Shift is read off the same event, so shift-space walks backwards
 *   the way shift-click does.
 * - **The colours are all theme tokens.** Not one hex code below or in
 *   `jam-editor.css`, so the editor follows all thirteen themes rather than
 *   being a dark-blue rectangle inside a light one.
 */
export function GrooveEditor({
  value,
  onChange,
  playingTick,
  page,
  onPageChange,
  onDone,
  onReset,
}: GrooveEditorProps) {
  const { beatsPerBar, ticksPerBeat } = value;
  const beats = Math.max(1, Math.round(beatsPerBar));
  const columns = beats * ticksPerBeat;

  /**
   * The table on screen. A groove with no fill yet still shows a full, empty
   * fill page: the first cell you click is what creates it, rather than the
   * page being unreachable until some other control has made one.
   */
  const pattern = useMemo(() => {
    const source =
      page === "fill" ? (value.fill ?? emptyPattern(beats, ticksPerBeat)) : value.bar;
    return normalizePattern(source, beats, ticksPerBeat);
  }, [page, value.fill, value.bar, beats, ticksPerBeat]);

  // Roving tabindex: one cell in the grid is tabbable, the arrows move which.
  const [focus, setFocus] = useState({ lane: 0, tick: 0 });
  const gridRef = useRef<HTMLDivElement>(null);
  // Set only by a key press, so clicking never yanks focus or scroll around.
  const takeFocus = useRef(false);

  // A narrower meter (or a coarser subdivision) can strand the focus past the
  // end of the row; pull it back in rather than leaving nothing tabbable.
  useEffect(() => {
    setFocus((at) => {
      const lane = Math.min(at.lane, EDITABLE_LANES.length - 1);
      const tick = Math.min(at.tick, columns - 1);
      return lane === at.lane && tick === at.tick ? at : { lane, tick };
    });
  }, [columns]);

  useEffect(() => {
    if (!takeFocus.current) return;
    takeFocus.current = false;
    gridRef.current
      ?.querySelector<HTMLButtonElement>(
        `[data-lane="${focus.lane}"][data-tick="${focus.tick}"]`,
      )
      ?.focus();
  }, [focus]);

  const cycle = useCallback(
    (laneIndex: number, tick: number, backwards: boolean) => {
      const lane = EDITABLE_LANES[laneIndex];
      if (!lane) return;
      const next = setCell(
        pattern,
        lane,
        tick,
        cycleLevel(pattern[lane][tick] ?? 0, backwards),
      );
      if (next === pattern) return;
      onChange(page === "fill" ? { ...value, fill: next } : { ...value, bar: next });
    },
    [pattern, page, value, onChange],
  );

  const onGridKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      let { lane, tick } = focus;
      switch (event.key) {
        case "ArrowLeft":
          tick = Math.max(0, tick - 1);
          break;
        case "ArrowRight":
          tick = Math.min(columns - 1, tick + 1);
          break;
        case "ArrowUp":
          lane = Math.max(0, lane - 1);
          break;
        case "ArrowDown":
          lane = Math.min(EDITABLE_LANES.length - 1, lane + 1);
          break;
        case "Home":
          tick = 0;
          break;
        case "End":
          tick = columns - 1;
          break;
        case " ":
        case "Spacebar":
        case "Enter":
          event.preventDefault();
          cycle(focus.lane, focus.tick, event.shiftKey);
          return;
        default:
          return;
      }
      event.preventDefault();
      takeFocus.current = true;
      setFocus({ lane, tick });
    },
    [focus, columns, cycle],
  );

  // ---- the name, edited in place ------------------------------------------
  //
  // `contentEditable` owns its own text: React must not re-render it from
  // state on every keystroke or the caret jumps to the front of the word. So
  // the DOM is written only when the name arrives changed from outside, and
  // the edit is handed back on blur.
  const nameRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = nameRef.current;
    if (el && el.textContent !== value.name) el.textContent = value.name;
  }, [value.name]);

  const commitName = useCallback(() => {
    const el = nameRef.current;
    if (!el) return;
    const typed = (el.textContent ?? "").trim();
    if (!typed) {
      // A groove with no name is a groove you cannot find again.
      el.textContent = value.name;
      return;
    }
    if (typed !== value.name) onChange({ ...value, name: typed });
    else el.textContent = typed;
  }, [value, onChange]);

  const onNameKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLSpanElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        nameRef.current?.blur();
      } else if (event.key === "Escape") {
        event.preventDefault();
        if (nameRef.current) nameRef.current.textContent = value.name;
        nameRef.current?.blur();
      }
    },
    [value.name],
  );

  return (
    <div className="jam-editor">
      <div className="jam-editor__head">
        <span
          ref={nameRef}
          className="jam-editor__name"
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-label="Groove name"
          spellCheck={false}
          tabIndex={0}
          onBlur={commitName}
          onKeyDown={onNameKeyDown}
        />
        <span className="jam-editor__pill">Yours</span>
        <span className="jam-editor__caption">
          {meterCaption(beats, ticksPerBeat)}
        </span>
        <span className="jam-editor__spacer" />
        <div
          className="jam-editor__pages"
          role="group"
          aria-label="Edit the bar or the fill"
        >
          <button
            type="button"
            className="jam-editor__page"
            aria-pressed={page === "bar"}
            onClick={() => onPageChange("bar")}
          >
            Bar
          </button>
          <button
            type="button"
            className="jam-editor__page"
            aria-pressed={page === "fill"}
            onClick={() => onPageChange("fill")}
          >
            Fill
          </button>
        </div>
        <button type="button" className="jam-editor__text-btn" onClick={onReset}>
          Reset
        </button>
        <button
          type="button"
          className="jam-editor__text-btn jam-editor__text-btn--done"
          onClick={onDone}
        >
          Done
        </button>
      </div>

      <div
        className="jam-editor__grid"
        ref={gridRef}
        onKeyDown={onGridKeyDown}
        role="group"
        aria-label={
          page === "fill" ? "The fill, one bar" : "The groove, one bar"
        }
      >
        <div className="jam-editor__row jam-editor__row--beats" aria-hidden="true">
          <span className="jam-editor__lane-name" />
          {Array.from({ length: beats }, (_, beat) => (
            <div className="jam-editor__group" key={beat}>
              {Array.from({ length: ticksPerBeat }, (_, sub) => (
                <span
                  key={sub}
                  className={
                    sub === 0 ? "jam-editor__beat-num" : "jam-editor__tick-label"
                  }
                >
                  {sub === 0 ? beat + 1 : tickLabel(sub, ticksPerBeat)}
                </span>
              ))}
            </div>
          ))}
        </div>

        {EDITABLE_LANES.map((lane, laneIndex) => (
          <div className="jam-editor__row" key={lane}>
            <span className="jam-editor__lane-name">{LANE_LABELS[lane]}</span>
            {Array.from({ length: beats }, (_, beat) => (
              <div className="jam-editor__group" key={beat}>
                {Array.from({ length: ticksPerBeat }, (_, sub) => {
                  const tick = beat * ticksPerBeat + sub;
                  const level = pattern[lane][tick] ?? 0;
                  const classes = [
                    "jam-editor__cell",
                    `jam-editor__cell--${LEVEL_CLASS[level]}`,
                  ];
                  if (isShuffleTick(sub, ticksPerBeat)) {
                    classes.push("jam-editor__cell--quiet");
                  }
                  if (playingTick === tick) {
                    classes.push("jam-editor__cell--playing");
                  }
                  return (
                    <button
                      key={sub}
                      type="button"
                      className={classes.join(" ")}
                      data-lane={laneIndex}
                      data-tick={tick}
                      data-level={level}
                      tabIndex={
                        focus.lane === laneIndex && focus.tick === tick ? 0 : -1
                      }
                      aria-label={cellLabel(lane, tick, ticksPerBeat, level)}
                      onClick={(event) => {
                        setFocus({ lane: laneIndex, tick });
                        cycle(laneIndex, tick, event.shiftKey);
                      }}
                    >
                      {level > 0 ? <span className="jam-editor__dot" /> : null}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="jam-editor__legend">
        {([0, 1, 2, 3] as const).map((level) => (
          <span className="jam-editor__legend-item" key={level}>
            <span
              className={`jam-editor__cell jam-editor__cell--${LEVEL_CLASS[level]} jam-editor__swatch`}
              aria-hidden="true"
            >
              {level > 0 ? <span className="jam-editor__dot" /> : null}
            </span>
            <span className="jam-editor__legend-text">{LEVEL_LABELS[level]}</span>
          </span>
        ))}
        <span className="jam-editor__spacer" />
        <span className="jam-editor__legend-hint">Click a cell to cycle</span>
      </div>
    </div>
  );
}
