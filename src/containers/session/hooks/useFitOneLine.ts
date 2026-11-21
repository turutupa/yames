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

/**
 * A row of controls that must stay one row (the phone footer's Watch, Sound,
 * Slower and Faster). How wide they are depends on the language and on the
 * theme's face, so no breakpoint knows: the row is measured, and given the
 * first of these it fits in. `data-fit` is unset while everything fits as
 * drawn; `tight` is the stylesheet's shorter forms (Watch as its icon);
 * `snug` is those with less padding and smaller words; `wrap` is when even
 * that is too wide, the one case where a second line is right (a long Russian
 * pair in a wide face on a 360 px phone).
 */
export const ROW_FITS = ["tight", "snug", "wrap"] as const;

export function fitRow(row: HTMLElement): void {
  row.removeAttribute("data-fit");
  if (!(row.clientWidth > 0)) return;
  for (const fit of ROW_FITS) {
    if (row.scrollWidth <= row.clientWidth + 0.5) return;
    row.setAttribute("data-fit", fit);
  }
}

/**
 * Re-fits when `label` changes, on resize, and once the web fonts land.
 *
 * Keyed on the row element itself, not on a ref object: a row that is
 * unmounted and mounted again (the footer's row comes and goes with Watch's
 * availability) is a new element under the same ref, and an effect keyed on
 * the ref kept measuring and observing the old one. The new row was then
 * never fitted, and ran 3–5px off a 360px phone once its controls settled
 * (lf1). Pass the element from a callback ref (`useState`'s setter).
 */
export function useFitRow(row: HTMLElement | null, label: string): void {
  useLayoutEffect(() => {
    if (!row || typeof window === "undefined") return;
    let alive = true;
    const fit = () => {
      if (alive && row.isConnected) fitRow(row);
    };
    fit();
    window.addEventListener("resize", fit);
    const fonts = typeof document !== "undefined" ? document.fonts : undefined;
    void fonts?.ready.then(fit);
    fonts?.addEventListener?.("loadingdone", fit);
    // A theme changes the face without a resize or a new font landing: the
    // row's and the controls' own widths say so. A fit that changes nothing
    // ends the loop.
    const sizes = typeof ResizeObserver === "function" ? new ResizeObserver(fit) : null;
    const watchSizes = () => {
      sizes?.disconnect();
      sizes?.observe(row);
      for (const child of Array.from(row.children)) sizes?.observe(child);
    };
    watchSizes();
    // And what the controls say: a label or an icon swapped by a render this
    // hook's caller did not key on is measured as it lands, not a frame
    // later. `data-fit` is the row's own answer and is not listened for.
    const words =
      typeof MutationObserver === "function"
        ? new MutationObserver(() => {
            watchSizes();
            fit();
          })
        : null;
    words?.observe(row, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["aria-pressed", "data-again", "disabled", "hidden"],
    });
    return () => {
      alive = false;
      sizes?.disconnect();
      words?.disconnect();
      window.removeEventListener("resize", fit);
      fonts?.removeEventListener?.("loadingdone", fit);
    };
  }, [row, label]);
}

/**
 * Two answers side by side, each on two lines at most (the ask-first footer
 * on a phone: "Start take, 80 BPM · graded" and "Just play"). Side by side
 * the footer is one button shorter, which on a 360x640 phone is the
 * difference between seeing the picture and not (card #67). Whether the words
 * fit two lines depends on the language and the theme's face, so the pair is
 * measured: `data-fit="small"` (smaller words) when a label needs a third
 * line or a word does not fit its column, and `stack` when it still does:
 * the stylesheet then puts one over the other.
 */
export const PAIR_FITS = ["small", "stack"] as const;

function pairFits(pair: HTMLElement, maxLines: number): boolean {
  for (const child of Array.from(pair.children) as HTMLElement[]) {
    const range = document.createRange();
    range.selectNodeContents(child);
    const tops = new Set<number>();
    for (const rect of Array.from(range.getClientRects())) {
      if (rect.width > 0) tops.add(Math.round(rect.top));
    }
    const cs = getComputedStyle(child);
    const pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    const tooWide = range.getBoundingClientRect().width > child.clientWidth - pad + 0.5;
    if (tops.size > maxLines || tooWide) return false;
  }
  return true;
}

export function fitPair(pair: HTMLElement, maxLines = 2): void {
  pair.removeAttribute("data-fit");
  if (!(pair.clientWidth > 0) || typeof document.createRange !== "function") return;
  for (const fit of PAIR_FITS) {
    if (pairFits(pair, maxLines)) return;
    pair.setAttribute("data-fit", fit);
  }
}

/** Re-fits when `label` changes, on resize, when the pair's width moves, and once the web fonts land. */
export function useFitPair(ref: RefObject<HTMLElement>, label: string, on = true): void {
  useLayoutEffect(() => {
    const pair = ref.current;
    if (!pair || typeof window === "undefined") return;
    if (!on) {
      pair.removeAttribute("data-fit");
      return;
    }
    let alive = true;
    let width = -1;
    const fit = () => {
      if (alive && ref.current) fitPair(ref.current);
    };
    fit();
    window.addEventListener("resize", fit);
    const fonts = typeof document !== "undefined" ? document.fonts : undefined;
    void fonts?.ready.then(fit);
    fonts?.addEventListener?.("loadingdone", fit);
    // A theme changes the face with no resize: the pair's own box says so.
    // Only a new width is a reason (the fit itself changes the height).
    const sizes =
      typeof ResizeObserver === "function"
        ? new ResizeObserver(() => {
            const now = pair.clientWidth;
            if (now === width) return;
            width = now;
            fit();
          })
        : null;
    sizes?.observe(pair);
    return () => {
      alive = false;
      sizes?.disconnect();
      window.removeEventListener("resize", fit);
      fonts?.removeEventListener?.("loadingdone", fit);
    };
  }, [ref, label, on]);
}
