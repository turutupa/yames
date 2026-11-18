/**
 * A CSS media query, live, for the rare layout decision CSS cannot make alone:
 * WHERE in the tree something renders, not how it looks.
 *
 * False wherever there is no `matchMedia` (happy-dom without a stub, SSR), so
 * a test that does not ask for a phone gets the desktop tree.
 */
import { useEffect, useState } from "react";

/**
 * A phone held upright: the Session's sticky footer lives under this query
 * (`session.css`, "A phone in portrait"). Keep the two in step.
 */
export const PORTRAIT_PHONE_QUERY = "(orientation: portrait) and (max-width: 480px)";

function read(query: string): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return !!window.matchMedia(query)?.matches;
  } catch {
    return false;
  }
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => read(query));
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    let mql: MediaQueryList | null = null;
    try {
      mql = window.matchMedia(query);
    } catch {
      return;
    }
    if (!mql) return;
    setMatches(mql.matches);
    const on = () => setMatches(mql!.matches);
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", on);
      return () => mql!.removeEventListener("change", on);
    }
    mql.addListener?.(on);
    return () => mql!.removeListener?.(on);
  }, [query]);
  return matches;
}
