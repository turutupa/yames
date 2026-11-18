/**
 * Today's Swap (owner, 2026-11-18): a row's own button and the small menu it
 * opens. Three ways to swap, a preview of the replacement before anything
 * changes, and "Show another" to page through what each way offers. The
 * replacement keeps the row's minutes (`session/swap.ts`).
 *
 * The menu is fixed to the window rather than the row, so the plan's own
 * scrolling panel cannot clip it, and it is kept inside the window at any
 * width. Escape and a press outside close it; focus comes back to the button.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import type { PathDoc } from "../../paths/format";
import type { PlanStep } from "../../session/planner";
import { SWAP_CHOICES, harderTempoNote } from "../../session/swap";
import type { SwapChoice, SwapOptions } from "../../session/swap";
import { lineText } from "./lineText";
import { bpmLine, pathTitleOf, shortReason } from "./todayPlan";

/** Two arrows passing each other. */
export function SwapIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M7 4 3 8l4 4M3 8h13a4 4 0 0 1 4 4M17 20l4-4-4-4M21 16H8a4 4 0 0 1-4-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The row's Swap button: its own press, never the row's. */
export function SwapButton({
  title,
  open,
  onOpen,
  testId,
}: {
  title: string;
  open: boolean;
  onOpen: (anchor: HTMLElement) => void;
  testId?: string;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className="session-swap-btn"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label={t("session.today.swap.buttonLabel", { title })}
      title={t("session.today.swap.tooltip")}
      data-testid={testId}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(e.currentTarget);
      }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <SwapIcon />
      <span className="session-swap-btn-word" aria-hidden="true">
        {t("session.today.swap.button")}
      </span>
    </button>
  );
}

type View = { kind: "choices" } | { kind: "preview"; choice: SwapChoice; at: number };

const MARGIN = 8;

/** Where the menu goes: under the button, right edges lined up, inside the window. */
function place(anchor: DOMRect, menu: { width: number; height: number }, view: { width: number; height: number }) {
  const left = Math.min(Math.max(MARGIN, anchor.right - menu.width), view.width - menu.width - MARGIN);
  const below = anchor.bottom + 6;
  const above = anchor.top - 6 - menu.height;
  const top =
    below + menu.height <= view.height - MARGIN
      ? below
      : above >= MARGIN
        ? above
        : Math.max(MARGIN, view.height - menu.height - MARGIN);
  return { left: Math.max(MARGIN, left), top };
}

export function SwapMenu({
  step,
  anchor,
  paths,
  optionsFor,
  onConfirm,
  onUndo,
  onClose,
}: {
  step: PlanStep;
  anchor: HTMLElement;
  /** Every Path, for the replacement's Path name. */
  paths: readonly PathDoc[];
  optionsFor: (choice: SwapChoice) => SwapOptions;
  onConfirm: (replacement: PlanStep) => void;
  /** Present on a row already swapped: put the planner's choice back. */
  onUndo?: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ kind: "choices" });
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const options = useMemo(
    () => Object.fromEntries(SWAP_CHOICES.map((c) => [c, optionsFor(c)])) as Record<SwapChoice, SwapOptions>,
    [optionsFor],
  );
  const warm = step.kind === "metronome";
  const swappedFrom = "swappedFrom" in step ? step.swappedFrom : undefined;

  const measure = useCallback(() => {
    const el = menuRef.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    setPos(
      place(anchor.getBoundingClientRect(), { width: box.width, height: box.height }, {
        width: window.innerWidth,
        height: window.innerHeight,
      }),
    );
  }, [anchor]);

  useLayoutEffect(measure, [measure, view]);
  useEffect(() => {
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [measure]);

  const close = useCallback(() => {
    onClose();
    anchor.focus();
  }, [onClose, anchor]);

  // A press anywhere else closes it; the button's own press toggles it.
  useEffect(() => {
    const down = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target || menuRef.current?.contains(target)) return;
      if (anchor.contains(target)) return;
      onClose();
    };
    document.addEventListener("pointerdown", down, true);
    return () => document.removeEventListener("pointerdown", down, true);
  }, [anchor, onClose]);

  // Focus the first thing to press, each time the view changes, once the menu
  // is placed: until then it is `visibility: hidden`, and a hidden button
  // refuses focus, which left it on Swap with the arrows and Tab going nowhere
  // (acceptance 4, P2-1).
  const placed = pos !== null;
  useEffect(() => {
    if (!placed) return;
    const first = menuRef.current?.querySelector<HTMLElement>("[data-autofocus]:not(:disabled)")
      ?? menuRef.current?.querySelector<HTMLElement>("button:not(:disabled)");
    first?.focus();
  }, [view, placed]);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === "Tab") {
      // Kept inside the menu while it is open.
      const items = [...(menuRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled)") ?? [])];
      if (items.length === 0) return;
      const at = items.indexOf(document.activeElement as HTMLElement);
      const next = e.shiftKey ? (at <= 0 ? items.length - 1 : at - 1) : at === items.length - 1 ? 0 : at + 1;
      e.preventDefault();
      items[next].focus();
      return;
    }
    if (view.kind === "choices" && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      const items = [...(menuRef.current?.querySelectorAll<HTMLElement>(".session-swap-choice:not(:disabled)") ?? [])];
      if (items.length === 0) return;
      const at = items.indexOf(document.activeElement as HTMLElement);
      const next = e.key === "ArrowDown" ? (at + 1) % items.length : (at - 1 + items.length) % items.length;
      e.preventDefault();
      items[next].focus();
    }
  };

  const choiceLabel = (c: SwapChoice) => t(`session.today.swap.choice.${c}`);
  const hint = (c: SwapChoice) => t(`session.today.swap.hint.${warm ? `${c}WarmUp` : c}`);

  let body;
  if (view.kind === "preview") {
    const list = options[view.choice].candidates;
    const candidate = list[view.at % list.length];
    const bpm = bpmLine(candidate);
    const pathTitle = pathTitleOf(candidate, paths);
    // Harder is never quietly slower: a tempo under the block's says why.
    const tempoNote = view.choice === "harder" ? harderTempoNote(step, candidate, paths) : null;
    body = (
      <div className="session-swap-preview" data-testid="swap-preview">
        <div className="session-swap-head">
          <span className="session-kick">{choiceLabel(view.choice)}</span>
          {/* Always, "1 of 1" too: every choice reads the same way (acceptance 4). */}
          <span className="session-swap-count" data-testid="swap-count">
            {t("session.today.swap.count", { n: (view.at % list.length) + 1, count: list.length })}
          </span>
        </div>
        <div className="session-swap-name" data-testid="swap-preview-title">
          {candidate.title}
        </div>
        <div className="session-swap-meta">
          {pathTitle && <span>{pathTitle}</span>}
          {bpm && <span>{lineText(t, bpm)}</span>}
          <span>{t("session.today.minutes", { minutes: candidate.minutes })}</span>
        </div>
        <p className="session-why session-swap-why">{lineText(t, shortReason(candidate))}</p>
        {tempoNote && (
          <p className="session-why session-swap-tempo" data-testid="swap-tempo-note">
            {t(`session.today.swap.tempo.${tempoNote.key}`, tempoNote.values)}
          </p>
        )}
        <div className="session-swap-actions">
          <button
            type="button"
            className="session-pri session-swap-confirm"
            data-autofocus=""
            data-testid="swap-confirm"
            onClick={() => {
              onConfirm(candidate);
              close();
            }}
          >
            {t("session.today.swap.confirm")}
          </button>
          {list.length > 1 && (
            <button
              type="button"
              className="session-secondary session-swap-another"
              data-testid="swap-another"
              onClick={() => setView({ ...view, at: (view.at + 1) % list.length })}
            >
              {t("session.today.swap.another")}
            </button>
          )}
          <button
            type="button"
            className="session-link session-swap-cancel"
            data-testid="swap-cancel"
            onClick={close}
          >
            {t("session.today.swap.cancel")}
          </button>
        </div>
      </div>
    );
  } else {
    body = (
      <>
        <div className="session-swap-head">
          <span className="session-kick">{t("session.today.swap.heading")}</span>
          <button
            type="button"
            className="session-swap-close"
            aria-label={t("session.today.swap.close")}
            data-testid="swap-close"
            onClick={close}
          >
            ×
          </button>
        </div>
        <div className="session-swap-choices" role="group" aria-label={t("session.today.swap.heading")}>
          {SWAP_CHOICES.map((c) => {
            const none = options[c].none;
            return (
              <button
                key={c}
                type="button"
                className="session-swap-choice"
                data-choice={c}
                data-autofocus=""
                data-testid={`swap-${c}`}
                disabled={none !== null}
                aria-describedby={`swap-hint-${c}`}
                onClick={() => setView({ kind: "preview", choice: c, at: 0 })}
              >
                <span className="session-swap-choice-word">{choiceLabel(c)}</span>
                <span className="session-swap-choice-hint" id={`swap-hint-${c}`}>
                  {none ? t(`session.today.swap.none.${none}`) : hint(c)}
                </span>
              </button>
            );
          })}
        </div>
        {onUndo && swappedFrom && (
          <button
            type="button"
            className="session-link session-swap-undo"
            data-testid="swap-undo"
            onClick={() => {
              onUndo();
              close();
            }}
          >
            {t("session.today.swap.undo", { title: swappedFrom })}
          </button>
        )}
      </>
    );
  }

  return (
    <div
      ref={menuRef}
      className="session-swap-menu"
      role="dialog"
      aria-label={t("session.today.swap.dialogLabel", { title: step.title })}
      data-testid="swap-menu"
      data-view={view.kind}
      style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: "hidden" }}
      onKeyDown={onKeyDown}
      onClick={(e) => e.stopPropagation()}
    >
      {body}
    </div>
  );
}
