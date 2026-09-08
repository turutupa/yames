import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

interface DrillConfigPopoverProps {
  /** The token this window hangs from. Position is measured off it. */
  anchor: HTMLElement | null;
  /** Called for Escape, an outside click, or a click on the anchor itself. */
  onClose: () => void;
  /** Accessible name — usually the id of the anchor's label. */
  label: string;
  /** The quiet line under the divider, as drawn. */
  note?: string;
  /**
   * Selector for the block the window must clear, hung off the anchor. The
   * drill's plan is the default; a chain step's sentence passes its own.
   * Falling back to the anchor itself is what a token outside any block gets.
   */
  clears?: string;
  children: ReactNode;
}

/** Gap between the token's bottom edge and the window's top edge. */
const OFFSET = 10;
/** Keep the window this far inside the stage's edges. */
const MARGIN = 8;

/**
 * The drill's settings window (Drill.dc.html, the card at 236/116).
 *
 * Every drill setting opens in one of these now. What it replaces was a
 * disclosure called "All settings" holding eight label/stepper rows — a form
 * that stood between the player and the exercise whether or not anything in
 * it was being changed, and which dimmed the rows you had not asked for
 * rather than not drawing them. The window arrives where you clicked, holds
 * only the two or three fields that phrase covers, and leaves when you are
 * done with it.
 *
 * Positioned by measurement rather than by a CSS anchor: `anchor-name` is not
 * in WKWebView yet, and the alternative — a fixed-position portal — has to be
 * re-measured on every scroll of the stage. Offsets against the plan block
 * move with it for free.
 *
 * It closes on Escape, on a click outside it, and on a second click of its own
 * token. It does NOT close when the values inside it change: a player setting
 * a target tempo usually wants the climb to redraw under a window that stays
 * put, which is the whole argument for the note at the bottom.
 */
export function DrillConfigPopover({
  anchor,
  onClose,
  label,
  note,
  clears = ".drill-plan-block",
  children,
}: DrillConfigPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // Before paint, so the window never appears at 0,0 and jumps.
  useLayoutEffect(() => {
    const card = ref.current;
    if (!anchor || !card) return;
    const place = () => {
      const container = card.offsetParent as HTMLElement | null;
      if (!container) {
        // No positioned ancestor to measure against. Place it at the parent's
        // origin rather than leaving it unplaced — an unplaced window stays
        // hidden, and "hidden forever" is a worse failure than "in the wrong
        // corner". jsdom reports this for every element, so it is also what
        // the tests see.
        setPos({ left: 0, top: 0 });
        return;
      }
      // Rects rather than `offsetLeft`, so the clamp below can be expressed
      // against the VIEWPORT — which is what the window can actually fall off
      // — while the style stays relative to the positioned parent.
      const parent = container.getBoundingClientRect();
      const a = anchor.getBoundingClientRect();
      // The window clears the whole plan, not just the token that opened it.
      // Hanging it off the token's own bottom edge put it over the second line
      // of the sentence, and the tokens down there — the beat count, the run
      // options — became unclickable for as long as any window was open.
      const clearsRect = (anchor.closest(clears) ?? anchor).getBoundingClientRect();
      const width = card.offsetWidth;
      let screenLeft = a.left;
      // Right edge first, then left: on a narrow window the right clamp can
      // push it past the left margin, and the left edge is the one that must
      // win or the first control is unreachable.
      if (screenLeft + width > window.innerWidth - MARGIN) {
        screenLeft = window.innerWidth - MARGIN - width;
      }
      if (screenLeft < MARGIN) screenLeft = MARGIN;
      setPos({
        left: screenLeft - parent.left,
        top: clearsRect.bottom - parent.top + OFFSET,
      });
    };
    place();
    // The plan line reflows when a value inside the window changes the text
    // in a token — "+5 BPM" becoming "+15 BPM" moves every token after it.
    const observer = new ResizeObserver(place);
    observer.observe(anchor);
    if (card.offsetParent) observer.observe(card.offsetParent as HTMLElement);
    window.addEventListener("resize", place);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
    };
  }, [anchor]);

  // Opening a window puts the cursor in its first number, with the value
  // selected — so setting a tempo is click, type, done. Without it every
  // change costs two clicks and a drag: one to open the window, one to reach
  // into the field, and a selection by hand before the digits will replace
  // anything.
  //
  // Only a number. The windows made of choice cards (the subdivision, the
  // click) have nothing to type into, and stealing focus onto one of their
  // buttons would arm Enter to re-press it.
  //
  // `preventScroll` because the window can open below the fold on a short
  // screen, and focus would otherwise jump the stage out from under the hand
  // that just clicked.
  useEffect(() => {
    const field = ref.current?.querySelector("input");
    if (!field) return;
    field.focus({ preventScroll: true });
    field.select();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Stopped here so the app's Escape — which leaves Zen, closes the
      // sidebar — does not also fire on the same press.
      e.stopPropagation();
      onClose();
      anchor?.focus();
    };
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target)) return;
      // The anchor closes it through its own onClick, which toggles. Handling
      // it here as well would close and immediately reopen.
      if (anchor?.contains(target)) return;
      onClose();
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [anchor, onClose]);

  return (
    <div
      ref={ref}
      className="drill-popover"
      role="dialog"
      aria-label={label}
      style={
        pos
          ? { left: pos.left, top: pos.top }
          : // Measured but not yet placed: laid out so `offsetWidth` is real,
            // painted nowhere.
            //
            // `opacity: 0` and NOT `visibility: hidden`, which is what this
            // was and which quietly broke the autofocus below. `focus()` is a
            // no-op on anything inside `visibility: hidden`, and React flushes
            // the pending passive effects — including that focus — when the
            // layout effect's `setPos` schedules its re-render, so the focus
            // call landed on the still-hidden card and was refused. Opacity
            // does not block focus, and it does not affect layout either, so
            // the measurement is unchanged.
            //
            // jsdom does not model focusability, so no test that renders this
            // can catch it. The test below asserts the style directly.
            { left: 0, top: 0, opacity: 0, pointerEvents: "none" }
      }
    >
      <div className="drill-popover-rows">{children}</div>
      {note && (
        <>
          <div className="drill-popover-rule" aria-hidden="true" />
          <p className="drill-popover-note">{note}</p>
        </>
      )}
    </div>
  );
}

interface DrillPopoverRowProps {
  label: string;
  /**
   * What the setting means, on hover of the label — the same explanations the
   * old settings rows carried, kept because they are the only place the app
   * says what a decrement is for.
   */
  tip?: string;
  /**
   * Which part of the climb this row draws. Hovering the row dims everything
   * else in the picture, so you can see what you are about to change before
   * you change it — also behaviour the old settings rows had.
   */
  onHover?: (hovering: boolean) => void;
  children: ReactNode;
}

/** One `label ⟷ control` line inside the window. */
export function DrillPopoverRow({ label, tip, onHover, children }: DrillPopoverRowProps) {
  return (
    <div
      className="drill-popover-row"
      onMouseEnter={onHover && (() => onHover(true))}
      onMouseLeave={onHover && (() => onHover(false))}
    >
      <span className={`drill-popover-label${tip ? " drill-label-tip" : ""}`}>
        {/* The name in its own element, so it is still findable by its exact
            text with an explanation nested beside it. */}
        <span className="drill-popover-label-text">{label}</span>
        {tip && <span className="drill-tip">{tip}</span>}
      </span>
      {children}
    </div>
  );
}

interface DrillPopoverChoicesProps {
  label: string;
  tip?: string;
  children: ReactNode;
}

/**
 * A row whose control is a set of options rather than a value — the six
 * subdivisions, the four clicks.
 *
 * Stacked instead of `label ⟷ control`, because six cards will not sit beside
 * a label in a 322px card and shrinking them to fit is how the metronome's
 * subdivision glyphs became indistinguishable in the first place (U2.2).
 */
export function DrillPopoverChoices({ label, tip, children }: DrillPopoverChoicesProps) {
  return (
    <div className="drill-popover-row drill-popover-row-stacked">
      <span className={`drill-popover-label${tip ? " drill-label-tip" : ""}`}>
        <span className="drill-popover-label-text">{label}</span>
        {tip && <span className="drill-tip">{tip}</span>}
      </span>
      <div className="drill-popover-choices">{children}</div>
    </div>
  );
}

interface DrillNumberFieldProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  /** Rendered after the number, inside the pill — "bars", "BPM". */
  unit?: string;
  label: string;
  onCommit: (value: number) => void;
}

/**
 * The bordered `− value +` pill the artboard draws, with the number still a
 * real input so it can be typed into.
 *
 * The clamping is deliberately on commit and not on every keystroke. It used
 * to be on `onChange`, and the owner hit what that does: with a target of 300
 * and a floor of the start tempo, selecting the "300" and typing "1" clamped
 * to the floor before "2" and "0" arrived, so 120 was unreachable from the
 * keyboard. A half-typed number is not a value yet — it becomes one on blur or
 * Enter, and that is where the range is enforced.
 */
export function DrillNumberField({
  value,
  min,
  max,
  step = 1,
  unit,
  label,
  onCommit,
}: DrillNumberFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? String(value);

  const commit = (raw: string) => {
    setDraft(null);
    const parsed = Number(raw);
    // An empty or unparseable box reverts rather than committing a zero.
    if (raw.trim() === "" || !Number.isFinite(parsed)) return;
    onCommit(Math.max(min, Math.min(max, Math.round(parsed))));
  };

  const nudge = (dir: 1 | -1) => {
    setDraft(null);
    onCommit(Math.max(min, Math.min(max, value + dir * step)));
  };

  return (
    <div className="drill-field">
      <button
        type="button"
        className="drill-field-btn"
        onClick={() => nudge(-1)}
        aria-label={`${label} −${step}`}
        disabled={value <= min}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
      <span className="drill-field-value">
        <input
          type="number"
          value={shown}
          min={min}
          max={max}
          aria-label={label}
          // Focusing selects what is there, so the first digit REPLACES the
          // value rather than landing beside it. Without it, changing 5 to 10
          // means clicking in, selecting or clearing by hand, and then typing
          // — three moves for a two-character edit.
          onFocus={(e) => e.target.select()}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit((e.target as HTMLInputElement).value);
            }
          }}
        />
        {unit && <span className="drill-field-unit">{unit}</span>}
      </span>
      <button
        type="button"
        className="drill-field-btn"
        onClick={() => nudge(1)}
        aria-label={`${label} +${step}`}
        disabled={value >= max}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
    </div>
  );
}
