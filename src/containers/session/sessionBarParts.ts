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
 * shown, then `data-prev-short` hides it; again on every resize. When Skip
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
    let width = bar.getBoundingClientRect().width;
    const ro =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            const now = bar.getBoundingClientRect().width;
            if (Math.abs(now - width) < 1) return;
            width = now;
            check();
          });
    ro?.observe(bar);
    return () => {
      ro?.disconnect();
      fonts?.removeEventListener?.("loadingdone", check);
    };
  }, [ref, key]);
}

