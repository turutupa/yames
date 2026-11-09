/**
 * The gallery's entry point — `/blocks-gallery.html` on the dev server.
 *
 * Nothing in the app imports this. Vite's production build has a single
 * entry, `index.html`, so neither this file nor the page that loads it is in
 * anything a player installs; the screenshot harness (`src/shots/main.tsx`)
 * is reached the same way and for the same reason.
 *
 * `__GALLERY_READY__` is set once React has committed and the browser has
 * painted twice, so the layout suite measures a settled page rather than a
 * half-drawn one.
 */

import ReactDOM from "react-dom/client";
import i18n from "../../i18n";
import BlocksGallery from "./gallery";
import "./gallery.css";

declare global {
  interface Window {
    __GALLERY_READY__?: boolean;
  }
}

/**
 * `?lng=de` — draw the catalogue in another language, the way
 * `src/shots/main.tsx` does, so the layout suite can ask whether a block
 * whose sentence is a third longer still fits the 380px coach dock. An
 * unknown tag is ignored rather than fatal: this page has no error channel,
 * and the suite's own check is that the page came up at all.
 */
const lng = new URLSearchParams(window.location.search).get("lng");
if (lng && Object.keys(i18n.options.resources ?? {}).includes(lng)) {
  void i18n.changeLanguage(lng);
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<BlocksGallery />);

/**
 * Settled: the faces have landed and the browser has painted twice.
 *
 * With a backstop, because `requestAnimationFrame` does not fire at all in a
 * hidden tab — open the gallery in a background window and the flag would
 * never be set, so anything waiting on it would wait forever rather than
 * measure a page that is, in fact, finished. Two seconds is longer than the
 * page has ever taken and shorter than any patience.
 */
void (async () => {
  const painted = (async () => {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  })();
  await Promise.race([painted, new Promise((resolve) => setTimeout(resolve, 2000))]);
  window.__GALLERY_READY__ = true;
})();
