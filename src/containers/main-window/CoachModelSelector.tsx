import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { brainTierLabelKey } from "../../coach/brainTiers";
import { chooseCoachModel, retryCoachModel, useCoachModel } from "../../hooks/useCoachModel";
import type { CoachModelRow, CoachModelSnapshot, CoachModelState } from "../../hooks/coachLoader";
import type { BrainTier } from "../../types";

/**
 * The model selector (owner, 2026-11-20): at the right end of the rail's Ask
 * row, a small button naming the choice and its state, opening a listbox of
 * Off and the two local models, each with its own truth. The Ask row keeps
 * opening the panel; this is its own control beside it.
 *
 * It never downloads: a model that is not on disk leads to Settings → Coach,
 * where the download is the player's own press. Where the rail is a strip of
 * icons the selector is not drawn (CSS); Settings carries the same choice.
 */

/** Sizes as people read them: decimal gigabytes, one place. */
function gb(bytes: number, lng: string): string {
  const n = new Intl.NumberFormat(lng, { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  return `${n.format(bytes / 1e9)} GB`;
}

/** The machine's memory, in the round number its owner knows it by. */
function memoryGb(mb: number, lng: string): string {
  return `${new Intl.NumberFormat(lng, { maximumFractionDigits: 0 }).format(mb / 1024)} GB`;
}

/** One line saying what a row's state is. */
export function rowStateText(row: CoachModelRow, t: TFunction): string {
  switch (row.state) {
    case "notOnThisDevice":
      return t(`rail.model.why.${row.why ?? "phone"}`);
    case "notDownloaded":
      return t(row.why === "update" ? "rail.model.state.update" : "rail.model.state.notDownloaded");
    default:
      return t(`rail.model.state.${row.state}`);
  }
}

/** The short word for the button's own state. */
function stateWord(state: CoachModelState, t: TFunction): string {
  return t(`rail.model.short.${state}`);
}

type Option =
  | { kind: "off"; tier: "off" }
  | { kind: "local"; tier: BrainTier; row: CoachModelRow };

function optionsOf(snap: CoachModelSnapshot): Option[] {
  return [
    { kind: "off", tier: "off" },
    ...snap.rows.map((row) => ({ kind: "local" as const, tier: row.tier, row })),
    // Cloud: `snap.cloud` is a typed place, always null, and draws nothing.
  ];
}

function optionDisabled(o: Option): boolean {
  return o.kind === "local" && o.row.state === "notOnThisDevice";
}

export function CoachModelSelector({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { t, i18n } = useTranslation();
  const snap = useCoachModel();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [place, setPlace] = useState<{ left: number; bottom: number; width: number; maxHeight: number } | null>(null);
  const listId = useId();

  const options = optionsOf(snap);
  const chosenIndex = Math.max(0, options.findIndex((o) => o.tier === snap.choice));
  const choiceName = t(brainTierLabelKey(snap.choice));

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  }, []);

  // Opens upward from the button, inside the window at every width the rail
  // has: anchored to the button's top, kept off both window edges.
  const measure = useCallback(() => {
    const b = buttonRef.current?.getBoundingClientRect();
    if (!b) return;
    const margin = 8;
    const width = Math.min(320, window.innerWidth - margin * 2);
    const left = Math.min(Math.max(margin, b.right - width), window.innerWidth - width - margin);
    setPlace({
      left,
      bottom: window.innerHeight - b.top + 6,
      width,
      maxHeight: Math.max(120, b.top - margin * 2),
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open, measure]);

  // Focus follows the active option while the list is open.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelectorAll<HTMLElement>("[role=option]")[active];
    el?.focus();
  }, [open, active, place]);

  // A press anywhere else closes it, without taking focus anywhere.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (listRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      close(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open, close]);

  const activate = (o: Option) => {
    if (optionDisabled(o)) return;
    if (o.kind === "local" && o.row.state === "notDownloaded") {
      close(false);
      onOpenSettings();
      return;
    }
    if (o.kind === "local" && o.row.state === "failed") {
      retryCoachModel();
      close(true);
      return;
    }
    if (o.tier !== snap.choice) chooseCoachModel(o.tier);
    close(true);
  };

  const onListKey = (e: ReactKeyboardEvent<HTMLUListElement>) => {
    const last = options.length - 1;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i >= last ? 0 : i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? last : i - 1));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(last);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      activate(options[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    } else if (e.key === "Tab") {
      close(false);
    }
  };

  const openList = (at: number) => {
    setActive(at);
    setOpen(true);
  };

  const onButtonKey = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      openList(chosenIndex);
    }
  };

  const memoryLine =
    snap.residentBytes !== null
      ? snap.systemMemoryMb
        ? t("rail.model.memory", {
            used: gb(snap.residentBytes, i18n.language),
            total: memoryGb(snap.systemMemoryMb, i18n.language),
          })
        : t("rail.model.memoryUnknown", { used: gb(snap.residentBytes, i18n.language) })
      : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="rail-model"
        data-state={snap.state}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={t("rail.model.button", { choice: choiceName, state: stateWord(snap.state, t) })}
        title={t("rail.model.button", { choice: choiceName, state: stateWord(snap.state, t) })}
        onClick={() => (open ? close(false) : openList(chosenIndex))}
        onKeyDown={onButtonKey}
      >
        <span className="rail-model-name">{choiceName}</span>
        <span className="rail-model-mark" data-state={snap.state} aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <div
            className="rail-model-menu"
            style={
              place
                ? { left: place.left, bottom: place.bottom, width: place.width, maxHeight: place.maxHeight }
                : { visibility: "hidden" }
            }
          >
            <div className="rail-model-head" id={`${listId}-label`}>
              {t("rail.model.label")}
            </div>
            <ul
              ref={listRef}
              id={listId}
              role="listbox"
              aria-labelledby={`${listId}-label`}
              className="rail-model-list"
              onKeyDown={onListKey}
            >
              {options.map((o, i) => {
                const selected = o.tier === snap.choice;
                const disabled = optionDisabled(o);
                const title =
                  o.kind === "off"
                    ? t("common.off")
                    : t("rail.model.entry", {
                        tier: t(brainTierLabelKey(o.tier)),
                        model: o.row.name,
                        size: gb(o.row.sizeBytes, i18n.language),
                      });
                const detail =
                  o.kind === "off"
                    ? t("rail.model.offHint")
                    : o.row.state === "failed" && snap.failure && selected
                      ? `${rowStateText(o.row, t)} (${snap.failure})`
                      : rowStateText(o.row, t);
                return (
                  <li
                    key={o.tier}
                    role="option"
                    tabIndex={i === active ? 0 : -1}
                    aria-selected={selected}
                    aria-disabled={disabled || undefined}
                    data-tier={o.tier}
                    data-state={o.kind === "off" ? "off" : o.row.state}
                    className="rail-model-option"
                    onClick={() => activate(o)}
                    onMouseMove={() => {
                      if (active !== i) setActive(i);
                    }}
                  >
                    <span className="rail-model-check" aria-hidden="true">
                      {selected ? "✓" : ""}
                    </span>
                    <span className="rail-model-text">
                      <span className="rail-model-title">{title}</span>
                      <span className="rail-model-detail">
                        {o.kind === "local" && (
                          <span className="rail-model-mark" data-state={o.row.state} aria-hidden="true" />
                        )}
                        {detail}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
            {memoryLine && <div className="rail-model-foot">{memoryLine}</div>}
          </div>,
          document.body,
        )}
    </>
  );
}
