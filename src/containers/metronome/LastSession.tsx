import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getSessionHistory } from "../../ipc";
import { rescoreReport } from "../../coach/reportStats";
import { getDayGroup } from "../practice-coach/coachCardHelpers";
import type { SavedSession } from "../../types";

/**
 * "Yesterday · 24 min · score 78", at the top right of the metronome stage
 * (UI_DECISIONS U2.6, drawn on the `Main` artboard).
 *
 * What the stored session can actually produce, and what it cannot:
 *
 *   date   — `timestamp` is the moment the session STARTED, always present.
 *            Rendered through the coach's own day-grouping so "Yesterday"
 *            here and "Yesterday" in the history list mean the same thing.
 *   score  — `report.score`, re-derived through `rescoreReport` for the same
 *            reason the coach and the evaluation panel do it: sessions saved
 *            before the segment-aware fix would otherwise show a number this
 *            screen disagrees with elsewhere in the app.
 *   length — NOT stored. `SavedSession` records when a session began and
 *            nothing about when it ended. It is recoverable only from
 *            `segments`, which carry `startTime`/`endTime` — and those are
 *            absent on short warmups and on anything saved before the segment
 *            pipeline. When they are missing the term is simply left out
 *            rather than estimated from beats ÷ BPM, which would be a guess
 *            printed as a fact.
 *
 * So the line has two or three terms depending on what was recorded, and
 * nothing at all renders until there is a session to describe.
 */

/** Milliseconds of practice, or `undefined` when the session did not record it. */
export function sessionDurationMs(session: SavedSession): number | undefined {
  const segments = session.segments;
  if (!segments || segments.length === 0) return undefined;
  const start = segments[0].startTime;
  const end = segments[segments.length - 1].endTime;
  if (start === undefined || end === undefined || end <= start) return undefined;
  return end - start;
}

/** The most recently started session, or `undefined` when there are none. */
export function mostRecentSession(
  sessions: SavedSession[],
): SavedSession | undefined {
  // `save_session` prepends, so this is almost always `[0]` — but reading the
  // timestamps costs nothing and does not depend on the store's ordering.
  return sessions.reduce<SavedSession | undefined>(
    (best, s) => (best && best.timestamp >= s.timestamp ? best : s),
    undefined,
  );
}

interface LastSessionProps {
  /**
   * Sessions are written when playback stops, so the parent hands the play
   * state down and the panel re-reads on the edge back to stopped rather than
   * polling. Nothing else in the app writes history while this screen is up.
   */
  isPlaying: boolean;
}

export function LastSession({ isPlaying }: LastSessionProps) {
  const { t, i18n } = useTranslation();
  const [session, setSession] = useState<SavedSession | undefined>();

  useEffect(() => {
    if (isPlaying) return;
    let cancelled = false;
    getSessionHistory()
      .then((history) => {
        if (!cancelled) setSession(mostRecentSession(history));
      })
      // A missing store is a first run, not an error worth a message on the
      // stage: the block just does not appear.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isPlaying]);

  if (!session) return null;

  const durationMs = sessionDurationMs(session);
  const parts = [getDayGroup(session.timestamp, t, i18n.language)];
  if (durationMs !== undefined) {
    // A 40-second burst is "1 min", not "0 min" — the floor is the point of
    // showing it at all.
    parts.push(
      t("metronome.lastSessionMinutes", {
        count: Math.max(1, Math.round(durationMs / 60000)),
      }),
    );
  }
  parts.push(
    t("metronome.lastSessionScore", {
      score: Math.round(rescoreReport(session.report).score),
    }),
  );

  return (
    <div className="last-session">
      <span className="stage-label">{t("metronome.lastSession")}</span>
      <span className="last-session-line">{parts.join(" · ")}</span>
    </div>
  );
}
