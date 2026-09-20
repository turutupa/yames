import { useEffect, useState } from "react";

/**
 * Is the stage narrower than `breakpoint`?
 *
 * The stage's own width, measured, not the window's — the rail and the coach
 * dock both take from it, so a 1500px window can leave this column at 700px
 * and a media query would be answering about the wrong box. It is the same
 * question `songs.css`'s `@container stage (…)` rules ask, and it is asked
 * here for the one thing a container query cannot do: MOVE an element.
 *
 * The band's faders collapse into a popover on a narrow stage, and a popover
 * is portalled to the body — a different parent, not a different style. CSS
 * cannot reparent, and rendering the lanes twice and hiding one would put two
 * sets of faders and two sets of mutes in the accessibility tree for three
 * players. So the width is read, once per resize, and the lanes are rendered
 * in one place or the other.
 *
 * `ResizeObserver` on the stage rather than a `resize` listener on the window,
 * for the same reason the stylesheet uses a container query: opening the coach
 * dock narrows this column without the window changing size at all.
 */
export function useStageIsNarrow(
  ref: { current: HTMLElement | null },
  breakpoint: number,
): boolean {
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const read = () => setNarrow(node.getBoundingClientRect().width <= breakpoint);
    read();
    const observer = new ResizeObserver(read);
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, breakpoint]);

  return narrow;
}
