/**
 * One line, whatever the theme's face (owner, 2026-11-18).
 *
 * The result's big button ("Go again, up to 90 BPM") is sized for the
 * learning side's condensed face. A theme with a wide one (Aurora's Inter,
 * Obsidian's monospace, Neon's Orbitron until 2026-11-18) broke it over two lines on a 390 px
 * phone, and no single font size suits both: the condensed themes would lose a
 * quarter of their size for nothing. So the button keeps its size where the
 * words fit and steps down just enough where they do not, never below
 * `minScale` of it; past that it wraps, as before, rather than shrink into
 * something a thumb has to squint at (a long Russian label is still whole).
 */
import { useLayoutEffect, type RefObject } from "react";

export function fitOneLine(el: HTMLElement, minScale = 0.7): void {
  el.style.fontSize = "";
  const cs = getComputedStyle(el);
  const base = parseFloat(cs.fontSize);
  const pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
  const room = el.clientWidth - pad;
  if (!(base > 0) || !(room > 0) || typeof document.createRange !== "function") return;
  // The words' own width on one line. Not `scrollWidth`: a button centres its
  // content, so an overflow spills both ways and scrollWidth sees only half.
  const range = document.createRange();
  range.selectNodeContents(el);
  const natural = () => {
    const wrap = el.style.whiteSpace;
    el.style.whiteSpace = "nowrap";
    const width = range.getBoundingClientRect().width;
    el.style.whiteSpace = wrap;
    return width;
  };
  const floor = base * minScale;
  let size = base;
  // Width is not exactly proportional to size (hinting, spacing), so a
  // couple of passes, each a hair under the ratio, settle it.
  for (let pass = 0; pass < 4; pass++) {
    const width = natural();
    if (width <= room) return;
    if (size <= floor) return;
    size = Math.max(floor, Math.floor(((size * room) / width) * 0.985 * 10) / 10);
    el.style.fontSize = `${size}px`;
  }
}

/** Re-fits when `label` changes, on resize, and once the web fonts land. */
export function useFitOneLine(ref: RefObject<HTMLElement>, label: string, minScale = 0.7): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof window === "undefined") return;
    let alive = true;
    const fit = () => {
      if (alive && ref.current) fitOneLine(ref.current, minScale);
    };
    fit();
    window.addEventListener("resize", fit);
    // A theme's face can arrive after the first paint, and after `ready`
    // first resolved: every face that lands is a reason to measure again.
    const fonts = typeof document !== "undefined" ? document.fonts : undefined;
    void fonts?.ready.then(fit);
    fonts?.addEventListener?.("loadingdone", fit);
    return () => {
      alive = false;
      window.removeEventListener("resize", fit);
      fonts?.removeEventListener?.("loadingdone", fit);
    };
  }, [ref, label, minScale]);
}

/**
 * The same idea for a row that must stay whole but is not one string: the
 * result's "78 → 87%" (owner, 2026-11-18: in Neon's Orbitron the "87%" ran
 * off a 390 px phone). Sets `--fit` on `box` to the scale at which `content`
 * fits its width, never below `minScale`; the stylesheet multiplies the sizes
 * by it.
 */
export function fitScale(box: HTMLElement, content: HTMLElement, minScale = 0.6): void {
  box.style.setProperty("--fit", "1");
  const room = box.clientWidth;
  if (!(room > 0)) return;
  let scale = 1;
  // The words' extent, not the box's: a flex item that may shrink reports the
  // width it was given, and its text runs on past it.
  const range = typeof document.createRange === "function" ? document.createRange() : null;
  range?.selectNodeContents(content);
  const left = box.getBoundingClientRect().left;
  for (let pass = 0; pass < 4; pass++) {
    const width = range ? range.getBoundingClientRect().right - left : content.getBoundingClientRect().width;
    if (width <= room) return;
    if (scale <= minScale) return;
    scale = Math.max(minScale, Math.floor(((scale * room) / width) * 0.985 * 1000) / 1000);
    box.style.setProperty("--fit", String(scale));
  }
}

export function useFitScale(
  box: RefObject<HTMLElement>,
  content: RefObject<HTMLElement>,
  label: string,
  minScale = 0.6,
): void {
  useLayoutEffect(() => {
    if (!box.current || !content.current || typeof window === "undefined") return;
    let alive = true;
    const fit = () => {
      if (alive && box.current && content.current) fitScale(box.current, content.current, minScale);
    };
    fit();
    window.addEventListener("resize", fit);
    const fonts = typeof document !== "undefined" ? document.fonts : undefined;
    void fonts?.ready.then(fit);
    fonts?.addEventListener?.("loadingdone", fit);
    return () => {
      alive = false;
      window.removeEventListener("resize", fit);
      fonts?.removeEventListener?.("loadingdone", fit);
    };
  }, [box, content, label, minScale]);
}
