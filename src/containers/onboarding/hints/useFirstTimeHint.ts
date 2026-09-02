/**
 * `useFirstTimeHint(id, triggered)` — the whole first-time-hint contract in
 * one hook.
 *
 *   - `shouldShow` is true only when the hint has never been shown, its
 *     trigger is firing, and no other hint has used this app session's slot.
 *   - the hint is persisted the moment it becomes visible, so it fires once
 *     even if the user quits without dismissing it.
 *   - `markShown()` hides the card (the dismiss button and any action button
 *     call it) and is idempotent.
 *
 * `triggered` is the trigger predicate's result — the pure functions in
 * `triggers.ts`. Passing it in (rather than an imperative `fire()`) keeps the
 * call sites declarative and lets React ordering, not effect ordering, decide
 * which hint claims the slot when two fire in the same commit.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  claimHintSlot,
  ensureHintSession,
  persistHintShown,
  releaseHintSlot,
  type HintRuntime,
} from "./hintRuntime";
import type { HintId } from "./types";

export type UseFirstTimeHintResult = {
  /** Render the card while this is true. */
  shouldShow: boolean;
  /** Hide the card and make sure the "shown" flag is persisted. */
  markShown: () => void;
};

export function useFirstTimeHint(
  id: HintId,
  triggered: boolean,
): UseFirstTimeHintResult {
  const [shouldShow, setShouldShow] = useState(false);
  const runtimeRef = useRef<HintRuntime | null>(null);
  // Once the user has dealt with the card, `triggered` going true again in the
  // same session (re-entering the Drill tab, say) must not bring it back.
  const doneRef = useRef(false);

  useEffect(() => {
    if (!triggered || doneRef.current) return;
    let cancelled = false;
    void ensureHintSession().then((rt) => {
      if (cancelled || doneRef.current) return;
      runtimeRef.current = rt;
      if (!claimHintSlot(rt, id)) return;
      setShouldShow(true);
      void persistHintShown(rt, id);
    });
    return () => {
      cancelled = true;
    };
  }, [id, triggered]);

  const markShown = useCallback(() => {
    doneRef.current = true;
    setShouldShow(false);
    const rt = runtimeRef.current;
    if (!rt) return;
    void persistHintShown(rt, id);
    releaseHintSlot(rt, id);
  }, [id]);

  // A hint whose host unmounts (leaving the Drill tab, closing Zen) is done —
  // it was shown, so free the slot object and never re-open the card.
  useEffect(
    () => () => {
      const rt = runtimeRef.current;
      if (rt) releaseHintSlot(rt, id);
    },
    [id],
  );

  return { shouldShow, markShown };
}

/**
 * The app session number and the "widget was ever opened" fact, for the
 * predicates that need them (`widget-discover`). Returns `session: 0` until
 * the store has been read.
 */
export function useHintSession(): { session: number; widgetOpened: boolean } {
  const [value, setValue] = useState({ session: 0, widgetOpened: false });
  useEffect(() => {
    let cancelled = false;
    void ensureHintSession().then((rt) => {
      if (cancelled) return;
      setValue({ session: rt.session, widgetOpened: rt.widgetOpened });
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return value;
}
