/**
 * The coach's three keys, as the action dispatcher calls them (`coachKeys.ts`).
 * Stable for the life of the window: they read the latest Session from a ref,
 * so the dispatcher, and the window's keydown listener behind it, are not
 * rebuilt on every beat.
 */
import { useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { showCoachAnswer } from "../../../coach/coachSlot";
import { acceptSuggestion, explainLastText, whatNextText } from "../coachKeys";
import type { SessionRun } from "./useSessionRun";

export type CoachKeys = {
  explainLast: () => void;
  whatNext: () => void;
  acceptSuggestion: () => void;
};

export function useCoachKeys(session: SessionRun): CoachKeys {
  const { t } = useTranslation();
  const latest = useRef({ session, t });
  latest.current = { session, t };
  const explainLast = useCallback(() => {
    const { session: now, t: tr } = latest.current;
    const line = explainLastText(tr, now);
    if (line) showCoachAnswer(line);
  }, []);
  const whatNext = useCallback(() => {
    const { session: now, t: tr } = latest.current;
    const line = whatNextText(tr, now);
    if (line) showCoachAnswer(line);
  }, []);
  const accept = useCallback(() => {
    acceptSuggestion(latest.current.session);
  }, []);
  return useMemo(() => ({ explainLast, whatNext, acceptSuggestion: accept }), [explainLast, whatNext, accept]);
}
