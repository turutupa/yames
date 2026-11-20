import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { brainTierLabelKey } from "../../coach/brainTiers";
import {
  chooseCoachModel,
  pauseCoachModelDownload,
  retryCoachModel,
  startCoachModelDownload,
  useCoachModel,
} from "../../hooks/useCoachModel";
import type { CoachModelRow, CoachModelSnapshot } from "../../hooks/coachLoader";
import type { BrainTier, ModelTier } from "../../types";
import "../../styles/coach-model.css";

/**
 * The model selector (owner, 2026-11-20): at the foot of the right-hand
 * coach panel, a small button naming the choice and its state, opening a
 * menu of Off and the two local models, each with its own truth. A model
 * that is not downloaded shows its size and a Download button in its row.
 *
 * Self-contained: it takes no prop from the panel it sits in, so the Ask
 * dock (leg c2a1) mounts the same component at its own foot. The menu opens
 * upward and stays inside the nearest `[data-coach-model-bounds]` ancestor
 * (the panel), or the window when there is none, and below the panel's
 * `[data-coach-model-ceiling]` (its head) when it marks one.
 *
 * Nothing here downloads, loads or unloads by itself: every one of those
 * is a press, and goes through `hooks/coachLoader.ts`.
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

function percent(fraction: number, lng: string): string {
  return new Intl.NumberFormat(lng, { style: "percent", maximumFractionDigits: 0 }).format(
    Math.min(1, Math.max(0, fraction)),
  );
}

/** Whether the system says this connection is metered. Unknown is no. */
function onMeteredConnection(): boolean {
  const c = (navigator as Navigator & { connection?: { type?: string; saveData?: boolean } }).connection;
  return !!c && (c.type === "cellular" || c.saveData === true);
}

/** One line saying what a row's state is (its download aside). */
export function rowStateText(row: CoachModelRow, t: TFunction, failure: string | null): string {
  // While it downloads, that is its state; the progress line has the number.
  if (row.download?.phase === "running") return t("coachModel.state.downloading");
  switch (row.state) {
    case "notOnThisDevice":
      return t(`coachModel.why.${row.why ?? "phone"}`);
    case "notDownloaded":
      if (row.why === "update") return t("coachModel.state.update");
      if (row.why === "otherOnDisk") return t("coachModel.state.otherOnDisk");
      return t("coachModel.state.notDownloaded");
    case "failed":
      return failure ? t("coachModel.state.failedWhy", { reason: failure }) : t("coachModel.state.failed");
    default:
      return t(`coachModel.state.${row.state}`);
  }
}

/** What the button says about the choice. */
function buttonState(snap: CoachModelSnapshot, t: TFunction, lng: string): string {
  const d = snap.download;
  if (d?.phase === "running") {
    return d.fraction !== null
      ? t("coachModel.short.downloading", { percent: percent(d.fraction, lng) })
      : t("coachModel.short.downloadingNoPercent");
  }
  return t(`coachModel.short.${snap.state}`);
}

function selectable(row: CoachModelRow): boolean {
  return row.state !== "notDownloaded" && row.state !== "notOnThisDevice";
}

export function CoachModelSelector() {
  const { t, i18n } = useTranslation();
  const lng = i18n.language;
  const snap = useCoachModel();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  // A Download pressed on a metered connection: the row asks first.
  const [confirmTier, setConfirmTier] = useState<ModelTier | null>(null);
  const [maxHeight, setMaxHeight] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const choiceName = t(brainTierLabelKey(snap.choice));
  const stateText = buttonState(snap, t, lng);
  const buttonLabel = t("coachModel.button", { choice: choiceName, state: stateText });

  const items = () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>("[data-mi]") ?? []);

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    setConfirmTier(null);
    if (refocus) buttonRef.current?.focus();
  }, []);

  // Upward, inside the panel: as tall as the room above the button allows.
  const measure = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const top = wrap.getBoundingClientRect().top;
    const panel = wrap.closest("[data-coach-model-bounds]");
    // The panel may name a ceiling (its head, where its own controls are):
    // the menu stops under it rather than covering them.
    const ceilingEl = panel?.querySelector("[data-coach-model-ceiling]");
    const ceiling = Math.max(
      ceilingEl?.getBoundingClientRect().bottom ?? panel?.getBoundingClientRect().top ?? 0,
      0,
    );
    setMaxHeight(Math.max(96, top - ceiling - 14));
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open, measure]);

  // Focus follows the active item while the menu is open.
  useEffect(() => {
    if (!open) return;
    const list = items();
    const i = Math.min(active, list.length - 1);
    list[i]?.focus();
  });

  // A press anywhere else closes it, without taking focus anywhere.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return;
      close(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open, close]);

  const openMenu = () => {
    const at = snap.choice === "off" ? 0 : 1 + snap.rows.findIndex((r) => r.tier === snap.choice);
    setActive(Math.max(0, at));
    setOpen(true);
  };

  const pick = (tier: BrainTier) => {
    if (tier !== snap.choice) chooseCoachModel(tier);
    close(true);
  };

  const pickRow = (row: CoachModelRow) => {
    if (!selectable(row)) return;
    if (row.state === "failed" && row.tier === snap.choice) {
      retryCoachModel();
      close(true);
      return;
    }
    pick(row.tier);
  };

  const download = (tier: ModelTier, confirmed: boolean) => {
    if (!confirmed && onMeteredConnection()) {
      setConfirmTier(tier);
      return;
    }
    setConfirmTier(null);
    startCoachModelDownload(tier);
  };

  const onMenuKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const count = items().length;
    const last = count - 1;
    const handled = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    if (e.key === "ArrowDown") {
      handled();
      setActive((i) => (i >= last ? 0 : i + 1));
    } else if (e.key === "ArrowUp") {
      handled();
      setActive((i) => (i <= 0 ? last : i - 1));
    } else if (e.key === "Home") {
      handled();
      setActive(0);
    } else if (e.key === "End") {
      handled();
      setActive(last);
    } else if (e.key === "Enter" || e.key === " ") {
      handled();
      items()[active]?.click();
    } else if (e.key === "Escape") {
      handled();
      close(true);
    } else if (e.key === "Tab") {
      close(false);
    }
  };

  const onButtonKey = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      openMenu();
    } else if (e.key === "Enter" || e.key === " ") {
      // The button's own click; kept from the app's hotkeys (Space plays).
      e.stopPropagation();
    }
  };

  // Every focusable item, in order, takes its index from this counter.
  let n = 0;
  const item = (props: {
    role: "menuitem" | "menuitemradio";
    checked?: boolean;
    disabled?: boolean;
    label?: string;
    className: string;
    onPress: () => void;
    children: ReactNode;
    tier?: string;
  }) => {
    const i = n++;
    return (
      <div
        data-mi=""
        data-tier={props.tier}
        role={props.role}
        aria-checked={props.role === "menuitemradio" ? !!props.checked : undefined}
        aria-disabled={props.disabled || undefined}
        aria-label={props.label}
        tabIndex={i === active ? 0 : -1}
        className={props.className}
        onClick={() => {
          setActive(i);
          if (!props.disabled) props.onPress();
        }}
        onMouseMove={() => {
          if (active !== i) setActive(i);
        }}
      >
        {props.children}
      </div>
    );
  };

  const rowView = (row: CoachModelRow) => {
    const entry = t("coachModel.entry", {
      tier: t(brainTierLabelKey(row.tier)),
      model: row.name,
      size: gb(row.sizeBytes, lng),
    });
    const selected = row.tier === snap.choice;
    const d = row.download;
    const running = d?.phase === "running";
    // A paused or failed download belongs to a row still without its model.
    const showDownload = running || (!!d && row.state === "notDownloaded");
    const text = (
      <span className="coach-model-text">
        <span className="coach-model-title">{entry}</span>
        <span className="coach-model-detail">
          <span className="coach-model-mark" data-state={row.state} aria-hidden="true" />
          {rowStateText(row, t, selected ? snap.failure : null)}
        </span>
        {row.lowMemory && row.state !== "notOnThisDevice" && (
          <span className="coach-model-warn">{t("coachModel.state.lowMemory")}</span>
        )}
      </span>
    );

    if (selectable(row) || row.state === "notOnThisDevice") {
      return (
        <div className="coach-model-row" key={row.tier} data-state={row.state}>
          {item({
            role: "menuitemradio",
            checked: selected,
            disabled: row.state === "notOnThisDevice",
            className: "coach-model-option",
            onPress: () => pickRow(row),
            tier: row.tier,
            children: (
              <>
                <span className="coach-model-check" aria-hidden="true">{selected ? "✓" : ""}</span>
                {text}
              </>
            ),
          })}
          {showDownload && running && downloadLine(row)}
        </div>
      );
    }

    // Not downloaded: the row is text, and its actions are the items.
    const actions: ReactNode[] = [];
    if (confirmTier === row.tier && !running) {
      actions.push(
        item({
          role: "menuitem",
          className: "coach-model-action btn-tonal",
          label: `${t("coachModel.download.anyway")}: ${entry}`,
          onPress: () => download(row.tier, true),
          children: t("coachModel.download.anyway"),
        }),
        item({
          role: "menuitem",
          className: "coach-model-action coach-model-action-quiet",
          onPress: () => setConfirmTier(null),
          children: t("coachModel.download.notNow"),
        }),
      );
    } else if (running) {
      actions.push(
        item({
          role: "menuitem",
          className: "coach-model-action coach-model-action-quiet",
          label: `${t("coachModel.download.pause")}: ${entry}`,
          onPress: () => pauseCoachModelDownload(),
          children: t("coachModel.download.pause"),
        }),
      );
    } else if (row.canDownload) {
      const word =
        d?.phase === "paused"
          ? t("coachModel.download.resume")
          : d?.phase === "failed"
            ? t("coachModel.download.retry")
            : t("coachModel.download.start");
      actions.push(
        item({
          role: "menuitem",
          className: "coach-model-action btn-tonal",
          label: `${word}: ${entry}`,
          onPress: () => download(row.tier, false),
          children: word,
        }),
      );
    }

    return (
      <div className="coach-model-row" key={row.tier} data-state={row.state}>
        <div className="coach-model-option coach-model-option-static">
          <span className="coach-model-check" aria-hidden="true" />
          {actions.length === 0
            ? item({
                // Nothing to press: still reachable, and says why.
                role: "menuitem",
                disabled: true,
                className: "coach-model-static-item",
                tier: row.tier,
                onPress: () => {},
                children: text,
              })
            : <span className="coach-model-text-wrap" data-tier={row.tier}>{text}</span>}
          {actions.length > 0 && <span className="coach-model-actions">{actions}</span>}
        </div>
        {confirmTier === row.tier && !running && (
          <p className="coach-model-note" role="note">
            {t("coachModel.download.meteredWarn", { size: gb(row.sizeBytes, lng) })}
          </p>
        )}
        {showDownload && downloadLine(row)}
      </div>
    );
  };

  /** Progress, the voices step after the weights, a pause, a failure. */
  const downloadLine = (row: CoachModelRow) => {
    const d = row.download;
    if (!d) return null;
    let words: string;
    if (d.phase === "running") {
      words =
        d.stage === "voices"
          ? t("coachModel.download.voices")
          : d.fraction !== null
            ? t("coachModel.download.running", { percent: percent(d.fraction, lng) })
            : t("coachModel.download.runningNoPercent");
    } else if (d.phase === "paused") {
      words =
        d.fraction !== null
          ? t("coachModel.download.paused", { percent: percent(d.fraction, lng) })
          : t("coachModel.download.pausedNoPercent");
    } else {
      words = d.error
        ? t("coachModel.download.failed", { reason: d.error })
        : t("coachModel.download.failedNoReason");
    }
    const indeterminate = d.phase === "running" && (d.fraction === null || d.stage === "voices");
    return (
      <div className="coach-model-progress" data-phase={d.phase}>
        {d.phase !== "failed" && (
          <span
            className="coach-model-bar"
            role="progressbar"
            aria-label={words}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={indeterminate || d.fraction === null ? undefined : Math.round(d.fraction * 100)}
            data-indeterminate={indeterminate || undefined}
          >
            <span
              className="coach-model-bar-fill"
              style={indeterminate ? undefined : { width: `${Math.round((d.fraction ?? 0) * 100)}%` }}
            />
          </span>
        )}
        <span className="coach-model-progress-words" aria-live="polite">{words}</span>
      </div>
    );
  };

  const memoryLine =
    snap.residentBytes !== null
      ? snap.systemMemoryMb
        ? t("coachModel.memory", {
            used: gb(snap.residentBytes, lng),
            total: memoryGb(snap.systemMemoryMb, lng),
          })
        : t("coachModel.memoryUnknown", { used: gb(snap.residentBytes, lng) })
      : null;

  const running = snap.download?.phase === "running";

  return (
    <div className="coach-model" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className="coach-model-button"
        data-state={snap.state}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={buttonLabel}
        title={buttonLabel}
        onClick={() => (open ? close(false) : openMenu())}
        onKeyDown={onButtonKey}
      >
        <span className="coach-model-mark" data-state={running ? "downloading" : snap.state} aria-hidden="true" />
        <span className="coach-model-button-name">{choiceName}</span>
        {/* "Off off" says one thing twice: the word only when it adds one. */}
        {(snap.state !== "off" || running) && (
          <span className="coach-model-button-state" aria-hidden="true">{stateText}</span>
        )}
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          className="coach-model-menu"
          role="menu"
          aria-labelledby={`${menuId}-label`}
          style={maxHeight !== null ? { maxHeight } : { visibility: "hidden" }}
          onKeyDown={onMenuKey}
        >
          <div className="coach-model-head" id={`${menuId}-label`}>
            {t("coachModel.label")}
          </div>
          <div className="coach-model-row" data-state="off">
            {item({
              role: "menuitemradio",
              checked: snap.choice === "off",
              className: "coach-model-option",
              onPress: () => pick("off"),
              tier: "off",
              children: (
                <>
                  <span className="coach-model-check" aria-hidden="true">{snap.choice === "off" ? "✓" : ""}</span>
                  <span className="coach-model-text">
                    <span className="coach-model-title">{t("common.off")}</span>
                    <span className="coach-model-detail">{t("coachModel.offHint")}</span>
                  </span>
                </>
              ),
            })}
          </div>
          {snap.rows.map(rowView)}
          {/* Cloud: `snap.cloud` is a typed place, always null, and draws nothing. */}
          {memoryLine && <div className="coach-model-foot">{memoryLine}</div>}
        </div>
      )}
    </div>
  );
}
