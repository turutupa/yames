import { useEffect, useRef } from "react";

/**
 * The width below which the rail cannot show its library and leave a usable
 * stage. Must match the `max-width` of the narrow-rail block in `shell.css`:
 * below it the rail is a strip of icons, and an open library floats out over
 * the stage instead of sitting beside it.
 */
export const LIBRARY_MIN_WIDTH = 620;

/**
 * Close the library when the window is too narrow to hold it, and give it back
 * when there is room again.
 *
 * Without this the library's open state is decided once, at startup, and the
 * window's width is never consulted. Since it defaults to open, a narrow
 * window opened the rail to its full 252px *over* the stage and left it there
 * — the whole screen behind a preset list nobody asked for.
 *
 * The user's own choice is remembered across the transition: collapsing at
 * 619px and expanding again at 620px restores whatever they had, rather than
 * forcing it open. A deliberate close at a wide size survives a trip through
 * a narrow one.
 *
 * The width is read from `innerWidth` rather than asked of `matchMedia`.
 * `matchMedia` is the natural fit and is used for the change notification, but
 * environments that stub it answer every query `false` — which this hook would
 * read as "too narrow" and collapse a perfectly wide window. Deciding from a
 * number that is either right or absent, and treating absent as "leave it
 * alone", fails safe in the direction that keeps the UI intact.
 */
export function useLibraryFit(
  libraryOpen: boolean,
  setLibraryOpen: (open: boolean) => void,
) {
  // What the user wanted at a width that could honour it.
  const preference = useRef(libraryOpen);
  const constrained = useRef(false);

  // Track the preference only while the window is wide enough for the open
  // state to mean anything.
  useEffect(() => {
    if (!constrained.current) preference.current = libraryOpen;
  }, [libraryOpen]);

  useEffect(() => {
    if (typeof window.innerWidth !== "number" || window.innerWidth <= 0) return;

    const apply = () => {
      const fits = window.innerWidth >= LIBRARY_MIN_WIDTH;
      if (!fits) {
        if (!constrained.current) {
          constrained.current = true;
          setLibraryOpen(false);
        }
      } else if (constrained.current) {
        constrained.current = false;
        setLibraryOpen(preference.current);
      }
    };

    apply();

    // matchMedia fires only on the crossing, which is all this needs; resize
    // is the fallback where it is unavailable.
    const mq = window.matchMedia?.(`(min-width: ${LIBRARY_MIN_WIDTH}px)`);
    if (mq?.addEventListener) {
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, [setLibraryOpen]);
}
