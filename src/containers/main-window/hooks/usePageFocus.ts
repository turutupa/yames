import { useEffect, useRef } from "react";
import type { RefObject } from "react";

/**
 * Where focus goes when the page changes (UX audit NAV-10).
 *
 * It used to fall back to the page body: a keyboard or screen-reader user who
 * opened Paths, a Path or a Step was left nowhere, and the next Tab started
 * again from the top of the window. Now:
 *
 *   - a new page's `h1` takes focus (as a heading, `tabindex="-1"`, so it is
 *     announced and Tab carries on from there, and it draws no ring);
 *   - in a Session, the big button does instead, whenever a new one arrives:
 *     when the Session starts and on each screen after it, so Enter is the
 *     next thing to do wherever the player is.
 *
 * "New" means a different element, not a re-render: React keeps a heading's
 * node while its text changes, so a Session's clock ticking never moves focus.
 * Nothing is taken from a field being typed in or from an open dialog, and
 * the first page the app opens on is left alone.
 */
export const PAGE_HEADING = "h1";
export const SESSION_BIG = '[data-testid="session-big"]';

function busy(doc: Document): boolean {
  const el = doc.activeElement as HTMLElement | null;
  if (!el || el === doc.body) return false;
  if (el.closest('[role="dialog"], [role="alertdialog"], dialog')) return true;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

export function usePageFocus(root: RefObject<HTMLElement>, view: string): void {
  const viewRef = useRef(view);
  viewRef.current = view;
  useEffect(() => {
    const el = root.current;
    if (!el || typeof MutationObserver === "undefined") return;
    const doc = el.ownerDocument;
    // What is on screen when the app opens is not a change: left alone.
    let heading: Element | null = el.querySelector(PAGE_HEADING);
    let big: Element | null = el.querySelector(SESSION_BIG);
    let frame = 0;
    const check = () => {
      frame = 0;
      const inSession = viewRef.current === "session";
      const nextBig = el.querySelector<HTMLElement>(SESSION_BIG);
      const nextHeading = el.querySelector<HTMLElement>(PAGE_HEADING);
      const bigIsNew = !!nextBig && nextBig !== big;
      const headingIsNew = !!nextHeading && nextHeading !== heading;
      big = nextBig;
      heading = nextHeading;
      if (busy(doc)) return;
      if (inSession && bigIsNew && nextBig) {
        // A Take's button waits, disabled, until the input is ready; it is
        // still "new" when it comes on.
        if (nextBig.hasAttribute("disabled")) big = null;
        else nextBig.focus({ preventScroll: true });
      } else if (!inSession && headingIsNew && nextHeading) {
        if (!nextHeading.hasAttribute("tabindex")) nextHeading.setAttribute("tabindex", "-1");
        nextHeading.focus({ preventScroll: true });
      }
    };
    const observer = new MutationObserver(() => {
      if (!frame) frame = requestAnimationFrame(check);
    });
    observer.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled"] });
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [root]);
}
