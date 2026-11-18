import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { MainView } from "../MainHeader";

/**
 * Where the player is inside Paths: the list, a Path, or a Step of it.
 *
 * Kept here, above the Paths screen, rather than in it (QA 2026-11-17). The
 * screen unmounts whenever another view takes the window, and a Session is
 * another view: a player who pressed Play this on a Step and then Exit came
 * back to the list, or before that to Today. Now the place, and how far down
 * each page was scrolled, outlive the screen for as long as the player is in
 * Paths or in something opened FROM it (a Session, Settings).
 *
 * The rules:
 *
 * - Deeper (list -> Path -> Step) starts the new page at the top.
 * - Back (Escape, the page's back link) comes back to where that page was.
 * - Leaving and coming back, by any door (a Session, Settings, Today and the
 *   rail), keeps the place and the scroll (UX audit NAV-3: Paths -> Today ->
 *   Paths used to land on the list).
 * - The rail's (or the tab bar's, or the hotkey's) Paths, pressed on Paths,
 *   goes one page up: `back`. Pressed again it is the list.
 */
export type PathsAt = { pathId: string | null; stepId: string | null };

export const PATHS_LIST: PathsAt = { pathId: null, stepId: null };

export function placeKey(at: PathsAt): string {
  if (at.pathId && at.stepId) return `step:${at.pathId}/${at.stepId}`;
  if (at.pathId) return `path:${at.pathId}`;
  return "list";
}

function depth(at: PathsAt): number {
  return at.stepId ? 2 : at.pathId ? 1 : 0;
}

/** One page up: Step -> its Path -> the list. The list has nowhere up. */
export function pathsUp(at: PathsAt): PathsAt | null {
  if (at.stepId) return { pathId: at.pathId, stepId: null };
  if (at.pathId) return PATHS_LIST;
  return null;
}

export type PathsPlace = {
  at: PathsAt;
  /** Open a Path or a Step, or go back to one. */
  move: (next: PathsAt) => void;
  /** One page up. False on the list, where there is nothing to go back to. */
  back: () => boolean;
  /** The list, at the top, with every remembered scroll forgotten. */
  reset: () => void;
};

export function usePathsPlace(
  view: MainView,
  contentRef: RefObject<HTMLElement>,
): PathsPlace {
  const [at, setAt] = useState<PathsAt>(PATHS_LIST);
  const atRef = useRef(at);
  atRef.current = at;
  /** How far down each page was, by `placeKey`. */
  const scrolls = useRef(new Map<string, number>());
  /** A scroll to put back once the page it belongs to is on screen. */
  const pending = useRef<number | null>(null);
  const lastView = useRef(view);

  // The scroll is written down AS it happens, not on the way out. By the time
  // anything hears that the view changed, the Paths page has already been
  // swapped for a shorter one and the browser has clamped the number.
  useEffect(() => {
    if (view !== "paths") return;
    const el = contentRef.current;
    if (!el) return;
    const onScroll = () => {
      // Not while a scroll is being put back, and not once the view has moved
      // on: the clamp that follows the swap fires one last scroll event.
      if (pending.current !== null || lastView.current !== "paths") return;
      scrolls.current.set(placeKey(atRef.current), el.scrollTop);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [view, contentRef]);

  const move = useCallback(
    (next: PathsAt) => {
      const nowKey = placeKey(atRef.current);
      const el = contentRef.current;
      if (el) scrolls.current.set(nowKey, el.scrollTop);
      const nextKey = placeKey(next);
      if (nextKey === nowKey) return;
      if (depth(next) > depth(atRef.current)) scrolls.current.delete(nextKey);
      pending.current = scrolls.current.get(nextKey) ?? 0;
      atRef.current = next;
      setAt(next);
    },
    [contentRef],
  );

  const back = useCallback(() => {
    const up = pathsUp(atRef.current);
    if (!up) return false;
    move(up);
    return true;
  }, [move]);

  const reset = useCallback(() => {
    scrolls.current.clear();
    pending.current = 0;
    atRef.current = PATHS_LIST;
    setAt(PATHS_LIST);
  }, []);

  // Coming back: the page is put back where it was scrolled.
  useLayoutEffect(() => {
    const from = lastView.current;
    lastView.current = view;
    if (from === view) return;
    if (view === "paths") {
      pending.current = scrolls.current.get(placeKey(atRef.current)) ?? 0;
    }
  }, [view]);

  // Put the scroll back once the page is drawn. Twice: once now, and once on
  // the next frame, because the neck slot and the fonts can still be growing
  // the page in the frame it mounts in.
  useLayoutEffect(() => {
    if (view !== "paths" || pending.current === null) return;
    const target = pending.current;
    const el = contentRef.current;
    if (!el) return;
    el.scrollTop = target;
    const frame = requestAnimationFrame(() => {
      el.scrollTop = target;
      pending.current = null;
    });
    return () => cancelAnimationFrame(frame);
  });

  return { at, move, back, reset };
}
