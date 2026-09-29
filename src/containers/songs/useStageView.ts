/**
 * How this player likes to read a tab, held for the screen (W29 item 3).
 *
 * The model and the store are `songs/stageView.ts`; this is the four lines
 * that put it in React. It is read once when Songs opens and written as it
 * changes — a per-player setting, not a per-song one, so nothing here is
 * keyed by a song and nothing is reset when you open another piece.
 */
import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_STAGE_VIEW,
  loadStageView,
  saveStageView,
  zoomBy,
} from "../../songs/stageView";
import type { StageView } from "../../songs/stageView";

export type StageViewControl = {
  view: StageView;
  /** Tab, or tab and the notation staff above it. */
  setNotation: (notation: boolean) => void;
  /** A step bigger or smaller. Stops at the ends. */
  zoom: (steps: number) => void;
};

export function useStageView(): StageViewControl {
  const [view, setView] = useState<StageView>(DEFAULT_STAGE_VIEW);

  useEffect(() => {
    let cancelled = false;
    void loadStageView().then((stored) => {
      if (!cancelled) setView(stored);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setNotation = useCallback(
    (notation: boolean) =>
      setView((current) => {
        if (current.notation === notation) return current;
        const next = { ...current, notation };
        void saveStageView(next).catch(() => {});
        return next;
      }),
    [],
  );

  const zoom = useCallback(
    (steps: number) =>
      setView((current) => {
        const next = zoomBy(current, steps);
        // Unchanged at the end of the range: nothing to write, nothing to
        // re-engrave. `zoomBy` returns the same object so this is an identity
        // check rather than a comparison of two floats.
        if (next === current) return current;
        void saveStageView(next).catch(() => {});
        return next;
      }),
    [],
  );

  return { view, setNotation, zoom };
}
