/**
 * The practice screen's frame, as the approved mock lays it out
 * (`.preview/practice-review/designer/mock.html`, owner 2026-11-17: "looks
 * very good"; beta 5 did not look like it):
 *
 *   WARM-UP · NOT GRADED                                       [Neck|Runway|Tab]
 *   A melody up one string
 *   1:43 left   70 BPM                      • Bar 2 of 4 · let the click carry you.
 *
 * The kicker over the title, on every width (owner, 2026-11-18: "on desktop
 * the title could be split onto 2 lines for better readability"); the phone
 * already read that way. A long title wraps inside its column.
 *
 * A compact head, so the picture under it gets the height; the big clock and
 * the big tempo of beta 5 are gone while it plays. The tempo has its - and +
 * where it may move (a warm-up before it starts, or paused), so a player can
 * slow down to learn the pattern.
 */
import { useTranslation } from "react-i18next";
import { useLayoutEffect, useRef } from "react";
import type { ReactNode, RefObject } from "react";

/** The head row's column gap (session.css `.practice-head-row`). */
const ROW_GAP = 18;
/** Width the kicker and title may take before the switch gives up its words; past it the title wraps. */
const TEXT_ROOM = 420;

/**
 * Keeps Neck · Runway · Tab beside the kicker and title (acceptance pass 3
 * P2-3): where the switch with its words would leave the title too little room
 * (1024 px in Russian, say), the switch drops its words and keeps its icons,
 * rather than wrapping onto a line of its own and taking the neck's height.
 * Measured, not guessed from a breakpoint: what fits depends on the language.
 * A phone lays the switch across its own row and is left alone.
 */
function useTightHead(row: RefObject<HTMLDivElement>) {
  useLayoutEffect(() => {
    const el = row.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    if (el.closest(".is-mobile")) return;
    const natural = (node: HTMLElement | null) => {
      if (!node) return 0;
      const ws = node.style.whiteSpace;
      node.style.whiteSpace = "nowrap";
      const w = node.scrollWidth;
      node.style.whiteSpace = ws;
      return w;
    };
    const measure = () => {
      const sw = el.querySelector<HTMLElement>(".session-viewswitch");
      if (!sw) return;
      // Measured with its words, then set.
      el.removeAttribute("data-tight");
      sw.removeAttribute("data-compact");
      // Stacked, the text needs only its longer line, and a long title may
      // wrap: room for it up to TEXT_ROOM is enough.
      const text = Math.max(
        natural(el.querySelector<HTMLElement>(".practice-kick")),
        natural(el.querySelector<HTMLElement>(".practice-title")),
      );
      const need = Math.min(text, TEXT_ROOM) + sw.scrollWidth + ROW_GAP * 2;
      const tight = need > el.clientWidth;
      el.toggleAttribute("data-tight", tight);
      sw.toggleAttribute("data-compact", tight);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    // A language or a title arriving late changes the words, not the size.
    const mo = new MutationObserver(measure);
    mo.observe(el, { characterData: true, childList: true, subtree: true });
    return () => {
      observer.disconnect();
      mo.disconnect();
    };
  }, [row]);
}

/** "1:43", from milliseconds, rounded up. */
export function clockText(ms: number): string {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function PracticeHead({
  kick,
  title,
  titleAside,
  aside,
  meta,
  status,
  statusTone,
}: {
  kick: ReactNode;
  title: ReactNode;
  /** Beside the title, quiet: the key chooser of a key-moved Exercise (card #93). */
  titleAside?: ReactNode;
  /** Top right: the view switch. */
  aside?: ReactNode;
  /** The small row under the title: the clock, the tempo, a Take's numbers. */
  meta: ReactNode;
  /** Right of the meta row: where it is, or what to do. */
  status?: ReactNode;
  /** "live": amber lamp (running); "hold": paused; "quiet": no lamp. */
  statusTone?: "live" | "hold" | "quiet";
}) {
  const top = useRef<HTMLDivElement>(null);
  useTightHead(top);
  return (
    <div className="practice-head" data-testid="practice-head">
      <div className="practice-head-row" ref={top}>
        <div className="practice-head-text">
          <span className="session-kick practice-kick">{kick}</span>
          {titleAside ? (
            <div className="practice-title-row">
              <h2 className="practice-title">{title}</h2>
              {titleAside}
            </div>
          ) : (
            <h2 className="practice-title">{title}</h2>
          )}
        </div>
        <span className="practice-grow" />
        {aside}
      </div>
      <div className="practice-head-row practice-meta">
        {meta}
        <span className="practice-grow" />
        {status && (
          <span className="practice-status" data-tone={statusTone ?? "live"} role="status" data-testid="practice-status">
            {status}
          </span>
        )}
      </div>
    </div>
  );
}

/** "1:43 left", small, amber. */
export function MetaClock({ ms, held }: { ms: number; held?: boolean }) {
  const { t } = useTranslation();
  return (
    <span
      className="practice-num practice-clock"
      role="timer"
      data-testid="session-countdown"
      data-ready={held ? "" : undefined}
    >
      {clockText(ms)}
      <small>{t("session.practice.left")}</small>
    </span>
  );
}

/** "70 BPM", with - and + when the tempo may move. */
export function MetaTempo({
  bpm,
  onSlower,
  onFaster,
  slowerKey,
  fasterKey,
}: {
  bpm: number;
  onSlower?: () => void;
  onFaster?: () => void;
  slowerKey?: string;
  fasterKey?: string;
}) {
  const { t } = useTranslation();
  const adjustable = !!onSlower && !!onFaster;
  return (
    <span className="practice-tempo" data-adjustable={adjustable ? "" : undefined} data-testid="practice-tempo">
      {adjustable && (
        <button
          className="practice-step"
          onClick={onSlower}
          aria-label={t("session.run.slower")}
          title={slowerKey ? `${t("session.run.slower")} · ${slowerKey}` : t("session.run.slower")}
          data-testid="practice-slower"
        >
          –
        </button>
      )}
      <span className="practice-num" data-testid="session-bpm">
        {bpm}
        <small>{t("session.run.bpm")}</small>
      </span>
      {adjustable && (
        <button
          className="practice-step"
          onClick={onFaster}
          aria-label={t("session.run.faster")}
          title={fasterKey ? `${t("session.run.faster")} · ${fasterKey}` : t("session.run.faster")}
          data-testid="practice-faster"
        >
          +
        </button>
      )}
    </span>
  );
}

/** A key, as the footer shows it. */
export function Key({ k }: { k: string }) {
  if (!k) return null;
  return <kbd className="practice-key">{k}</kbd>;
}
