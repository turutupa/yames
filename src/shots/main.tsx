/**
 * The screenshot page.
 *
 * `shots.html?shot=drill&theme=ember` mounts the real app against a mock
 * backend, drives it into the state the shot wants, and then sets
 * `window.__SHOT_READY__` so the capture script knows it may photograph.
 *
 * This is not a mockup. Every pixel below the mock IPC boundary is the
 * shipping UI — same components, same stylesheets, same engine, since WebView2
 * and Edge are the same Chromium. On Windows the app runs frameless
 * (`set_decorations(false)` at startup; see TitleBar.tsx), so the titlebar and
 * the window buttons in these pictures are the app's own, not a browser's.
 */
import ReactDOM from "react-dom/client";
import App from "../App";
import "../i18n";
import "../styles/global.css";
import "../styles/session-narrative.css";
import { installShotMock } from "./mockIpc";
import { shotById, SHOTS, SHOT_THEMES } from "./scenarios";

declare global {
  interface Window {
    __SHOT_READY__?: boolean;
    __SHOT_ERROR__?: string;
    /** The shot list, for the capture script. See `?manifest=1` below. */
    __SHOT_MANIFEST__?: { themes: readonly string[]; shots: readonly unknown[] };
  }
}

const params = new URLSearchParams(window.location.search);

/**
 * `?manifest=1` — hand the shot list to the capture script and mount nothing.
 *
 * The script used to read scenarios.ts with a regex, which is how a comment
 * mentioning `height: 100vh` silently became a shot 100 pixels tall. This file
 * is the one that already imports the list; letting it say what the list is
 * removes the second reader, and with it the chance of the two disagreeing.
 */
window.__SHOT_MANIFEST__ = { themes: SHOT_THEMES, shots: SHOTS };
if (params.get("manifest")) {
  window.__SHOT_READY__ = true;
}

const shot = params.get("manifest") ? undefined : shotById(params.get("shot") ?? "metronome");
const theme = params.get("theme") ?? "ember";

if (!params.get("manifest") && !shot) {
  window.__SHOT_ERROR__ = `unknown shot "${params.get("shot")}" (have: ${SHOTS.map((s) => s.id).join(", ")})`;
  throw new Error(window.__SHOT_ERROR__);
}

if (shot) installShotMock(shot, theme);

/** Wait for `check` to hold, or give up and say what never happened. */
function until(what: string, check: () => boolean, timeoutMs = 15000): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if (check()) return resolve();
      if (Date.now() - started > timeoutMs) return reject(new Error(`timed out waiting for ${what}`));
      requestAnimationFrame(tick);
    };
    tick();
  });
}

/**
 * The faces shots.html pulls from Google. A theme naming one of these as its
 * first choice must actually get it.
 *
 * Anything else in a theme's stack is a system font — 'Avenir Next', 'SF Mono'
 * — which is absent on Windows on purpose and falls back by design. Only a
 * *web* font going missing means the network failed and the picture is wrong.
 */
const WEB_FONTS = new Set([
  "Archivo", "Comfortaa", "Inter", "Nunito", "Outfit",
  "Orbitron", "Quicksand", "Rajdhani", "Source Serif 4",
]);

function assertThemeFontLoaded() {
  const stack = getComputedStyle(document.documentElement)
    .getPropertyValue("--font-family")
    .trim();
  const first = stack.split(",")[0].trim().replace(/^['"]|['"]$/g, "");
  if (!WEB_FONTS.has(first)) return;
  if (!document.fonts.check(`16px "${first}"`)) {
    throw new Error(
      `the theme's font "${first}" did not load — the shot would be of the fallback stack`,
    );
  }
}

async function drive() {
  // The app is mounted once its own root element exists. For the widget that
  // is the pill; for the main window it is the frame the rail sits in.
  const root = shot!.window === "floating" ? ".floating-widget" : ".main-window";
  await until(root, () => !!document.querySelector(root));

  if (shot!.zen) {
    // The rail's Zen button, by the anchor the tour already puts on it.
    await until("the Zen button", () => !!document.querySelector('[data-tour="zen-widget"]'));
    (document.querySelector('[data-tour="zen-widget"]') as HTMLButtonElement).click();
    await until("the Zen canvas", () => !!document.querySelector("[data-zen-style]"));
  }

  // Web fonts decide the metrics of every label in the picture, and a capture
  // taken before they land is a screenshot of the fallback stack.
  await document.fonts.ready;
  assertThemeFontLoaded();

  // Two frames after the last mutation: one for React to commit, one for the
  // compositor to paint it.
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  window.__SHOT_READY__ = true;
}

if (shot) {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    // No StrictMode: its double-invoked effects make the transport fire twice,
    // and a screenshot wants one pass through the app's startup, not two.
    <App />,
  );

  drive().catch((err) => {
    window.__SHOT_ERROR__ = String(err?.message ?? err);
  });
}
