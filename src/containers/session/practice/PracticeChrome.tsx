/**
 * The practice screen's frame, as the approved mock lays it out
 * (`.preview/practice-review/designer/mock.html`, owner 2026-11-17: "looks
 * very good"; beta 5 did not look like it):
 *
 *   WARM-UP · NOT GRADED   A melody up one string            [Neck|Runway|Tab]
 *   1:43 left   70 BPM                      • Bar 2 of 4 · let the click carry you.
 *
 * A compact head, so the picture under it gets the height; the big clock and
 * the big tempo of beta 5 are gone while it plays. The tempo has its - and +
 * where it may move (a warm-up before it starts, or paused), so a player can
 * slow down to learn the pattern.
 */
import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";

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
  aside,
  meta,
  status,
  statusTone,
}: {
  kick: ReactNode;
  title: ReactNode;
  /** Top right: the view switch. */
  aside?: ReactNode;
  /** The small row under the title: the clock, the tempo, a Take's numbers. */
  meta: ReactNode;
  /** Right of the meta row: where it is, or what to do. */
  status?: ReactNode;
  /** "live": amber lamp (running); "hold": paused; "quiet": no lamp. */
  statusTone?: "live" | "hold" | "quiet";
}) {
  return (
    <div className="practice-head" data-testid="practice-head">
      <div className="practice-head-row">
        <span className="session-kick practice-kick">{kick}</span>
        <h2 className="practice-title">{title}</h2>
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
