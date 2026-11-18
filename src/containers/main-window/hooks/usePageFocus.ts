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
 *   - a tool (Metronome, Setlist, Drill, Jam, Songs) has no heading: its
 *     Play does, once it draws (acceptance P2-8);
 *   - when the focused element is removed under it (the wizard closing, the
 *     card that opened a tool, a hint dismissing itself), the page's primary
 *     control does, so focus never falls to the body (P2-8).
 *
 * "New" means a different element, not a re-render: React keeps a heading's
 * node while its text changes, so a Session's clock ticking never moves focus.
 * Nothing is taken from a field being typed in or from an open dialog, and
 * the first page the app opens on is left alone.
 */
export const PAGE_HEADING = "h1";
export const SESSION_BIG = '[data-testid="session-big"]';

/**
 * A page's primary control, where it has one (acceptance P2-8, 2026-11-18):
 * Today's Start, a tool's Play. `data-page-primary` names one explicitly.
 */
export const PAGE_PRIMARY = '[data-page-primary], .session-today-start, .transport-play';

/** The tools: a page with no heading, whose first thing is Play. */
const TOOL_VIEWS = new Set(["beat", "setlist", "drill", "jam", "songs"]);

/** A view change waits this long for its page to draw before giving up. */
const PENDING_MS = 1500;

function tryFocus(target: HTMLElement | null | undefined): boolean {
  if (!target || target.hasAttribute("disabled")) return false;
  const doc = target.ownerDocument;
  target.focus({ preventScroll: true });
  return doc.activeElement === target;
}

function focusHeading(heading: HTMLElement | null): boolean {
  if (!heading) return false;
  if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
  return tryFocus(heading);
}

/**
 * Put focus on the page's primary control: the Session's big button, Today's
 * Start, a tool's Play; else its heading. Used by the skip link, and when the
 * element that had focus is taken away under it (the wizard closing, a tool
 * card that opened its tool, a hint that dismissed itself), so focus never
 * falls to the page body.
 */
export function focusPagePrimary(root: HTMLElement | null, view: string): boolean {
  if (!root) return false;
  if (view === "session") {
    if (tryFocus(root.querySelector<HTMLElement>(SESSION_BIG))) return true;
  }
  for (const el of root.querySelectorAll<HTMLElement>(PAGE_PRIMARY)) {
    if (tryFocus(el)) return true;
  }
  if (focusHeading(root.querySelector<HTMLElement>(PAGE_HEADING))) return true;
  return focusHeading(root.querySelector<HTMLElement>("h2"));
}

/** A modal draws its own focus; nothing here reaches behind it. */
function modalOpen(doc: Document): boolean {
  return !!doc.querySelector('[role="dialog"][aria-modal="true"], [role="alertdialog"], dialog[open]');
}

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
  // A tool was opened and its Play has not drawn yet (P2-8): focus it when
  // it does. Expires, so a Play that comes much later takes nothing.
  const pendingUntil = useRef(0);
  const kick = useRef<() => void>(() => {});
  const firstView = useRef(true);
  useEffect(() => {
    if (firstView.current) {
      firstView.current = false;
      return;
    }
    pendingUntil.current = TOOL_VIEWS.has(view) ? Date.now() + PENDING_MS : 0;
    kick.current();
  }, [view]);
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
        pendingUntil.current = 0;
        focusHeading(nextHeading);
      } else if (!inSession && pendingUntil.current > 0) {
        if (Date.now() > pendingUntil.current) pendingUntil.current = 0;
        else {
          const play = el.querySelector<HTMLElement>(PAGE_PRIMARY);
          if (tryFocus(play)) pendingUntil.current = 0;
        }
      }
    };
    kick.current = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };
    const observer = new MutationObserver(() => {
      if (!frame) frame = requestAnimationFrame(check);
    });
    observer.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled"] });

    // Focus taken away (P2-8). The element that had focus is removed — the
    // wizard's last button, the tool card that opened its tool, a hint's
    // "Got it" — and the browser drops focus to the body, where the next Tab
    // starts again from the window's title bar. Put it on the page instead.
    let lastFocused: HTMLElement | null = null;
    let lostFrame = 0;
    const onFocusIn = (e: FocusEvent) => {
      lastFocused = e.target instanceof HTMLElement ? e.target : null;
    };
    const recover = () => {
      lostFrame = 0;
      if (!lastFocused || lastFocused.isConnected) return;
      const active = doc.activeElement;
      if (active && active !== doc.body) {
        lastFocused = null;
        return;
      }
      if (modalOpen(doc)) return; // tried again when the modal goes
      lastFocused = null;
      focusPagePrimary(el, viewRef.current);
    };
    const lost = new MutationObserver(() => {
      if (lastFocused && !lastFocused.isConnected && !lostFrame) lostFrame = requestAnimationFrame(recover);
    });
    if (doc.body) lost.observe(doc.body, { childList: true, subtree: true });
    doc.addEventListener("focusin", onFocusIn);
    return () => {
      observer.disconnect();
      lost.disconnect();
      doc.removeEventListener("focusin", onFocusIn);
      kick.current = () => {};
      if (frame) cancelAnimationFrame(frame);
      if (lostFrame) cancelAnimationFrame(lostFrame);
    };
  }, [root]);
}
