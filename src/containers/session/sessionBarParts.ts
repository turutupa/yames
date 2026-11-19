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
 * shown, then `data-prev-short` hides it; again on every resize.
 */
export function usePreviousWordFits(ref: React.RefObject<HTMLDivElement>, key: string) {
  useLayoutEffect(() => {
    const bar = ref.current;
    if (!bar) return;
    const check = () => {
      bar.removeAttribute("data-prev-short");
      const exit = bar.querySelector<HTMLElement>(".session-exit");
      const others = [...bar.querySelectorAll<HTMLElement>(".session-skip-this")];
      if (!exit || others.length === 0) return;
      const top = exit.getBoundingClientRect().top;
      if (others.some((el) => Math.abs(el.getBoundingClientRect().top - top) > 4)) bar.setAttribute("data-prev-short", "");
    };
    check();
    if (typeof ResizeObserver === "undefined") return;
    let width = bar.getBoundingClientRect().width;
    const ro = new ResizeObserver(() => {
      const now = bar.getBoundingClientRect().width;
      if (Math.abs(now - width) < 1) return;
      width = now;
      check();
    });
    ro.observe(bar);
    return () => ro.disconnect();
  }, [ref, key]);
}

