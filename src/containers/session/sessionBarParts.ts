/**
 * Small behaviours of the Session bar (acceptance 5, P2-5 and P2-8), kept
 * out of SessionView so they are tested on their own.
 */
import { useLayoutEffect } from "react";
import type React from "react";

/**
 * A bar tooltip is for finding where to go; once a block is pressed it has
 * done its job, and it stays hidden until the pointer leaves the button
 * (acceptance 5, P2-5: it hung over the new screen with the old state).
 */
export function hideTipUntilLeft(el: HTMLElement) {
  el.setAttribute("data-tip-off", "");
}
export function showTipAgain(e: Pick<React.MouseEvent<HTMLElement>, "currentTarget">) {
  e.currentTarget.removeAttribute("data-tip-off");
}

/**
 * "‹ Previous" with its word where the bar's first row has room for it, the
 * chevron alone where the word would push Skip onto a row of its own (a
 * phone, in German or Russian): acceptance 5, P2-8. Measured with the word
 * shown, then `data-prev-short` hides it; again whenever the bar changes size
 * (its width with the window, its height when Skip drops a row). When Skip
 * is on a row of its own even so, `data-tight` (card #67).
 */
export function usePreviousWordFits(ref: React.RefObject<HTMLDivElement>, key: string) {
  useLayoutEffect(() => {
    const bar = ref.current;
    if (!bar) return;
    const check = () => {
      bar.removeAttribute("data-prev-short");
      bar.removeAttribute("data-tight");
      const exit = bar.querySelector<HTMLElement>(".session-exit");
      const others = [...bar.querySelectorAll<HTMLElement>(".session-skip-this")];
      if (!exit || others.length === 0) return;
      const dropped = () => {
        const top = exit.getBoundingClientRect().top;
        return others.some((el) => Math.abs(el.getBoundingClientRect().top - top) > 4);
      };
      if (!dropped()) return;
      bar.setAttribute("data-prev-short", "");
      // Still on a row of its own (Russian or German at 360 px, with the
      // input's chip on the first row): the stylesheet's tight form, the
      // clock no wider than its longest word and less air around the words.
      if (dropped()) bar.setAttribute("data-tight", "");
    };
    check();
    // A face that lands after the first paint changes every word's width
    // with no resize (a Cyrillic face arrives late): measured again then.
    const fonts = typeof document !== "undefined" ? document.fonts : undefined;
    void fonts?.ready.then(() => {
      if (ref.current === bar) check();
    });
    fonts?.addEventListener?.("loadingdone", check);
    // Measured again when the bar's width changes, and when its height does.
    // The words can widen after the last check with the window the same
    // width: in Russian the last check ran on the fallback face, the real
    // Cyrillic glyphs swapped in after it (no event this hook saw) and pushed
    // Skip onto a row of its own. Watching the width alone left that standing:
    // the "Skip stays on the bar's first row" layout test failed one run in
    // ten or so. Skip dropping a row makes the bar taller, so it is seen now.
    // A check ends in the state it ended in last time when nothing else moved,
    // so the observer does not chase itself.
    const sizeOf = () => {
      const r = bar.getBoundingClientRect();
      return { width: r.width, height: r.height };
    };
    let size = sizeOf();
    const ro =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            const now = sizeOf();
            if (Math.abs(now.width - size.width) < 1 && Math.abs(now.height - size.height) < 1) return;
            check();
            size = sizeOf();
          });
    ro?.observe(bar);
    return () => {
      ro?.disconnect();
      fonts?.removeEventListener?.("loadingdone", check);
    };
  }, [ref, key]);
}

