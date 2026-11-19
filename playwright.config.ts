import { createHash } from "node:crypto";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * The layout gates (2026-09-17).
 *
 * Everything else in this repo is tested in happy-dom, which computes no
 * geometry: every element there is zero by zero, so "the on/off switch is
 * outside its row" is a bug no unit test can see. The owner reported exactly
 * that, and the same bug was then written a second time one control later —
 * twice in an afternoon, both times caught only by rendering a picture and
 * looking at it. That is the gap this config exists to close.
 *
 * It drives `shots.html`, the harness the screenshots already use: the real
 * UI against a mock IPC, one URL per scene. So these tests need no fixtures
 * of their own — they ask the same page for the same scene and then measure
 * it, which is the one thing the capture script cannot do.
 *
 * Chromium only, and deliberately: this is a Tauri app, its webview is
 * Chromium-family on Windows and WebKit on macOS, and a suite that chased
 * both would spend its budget on differences no user of this app will ever
 * see. The bugs being gated are "does it fit", not "does this engine round
 * sub-pixels the other way".
 */

/**
 * A port belonging to this checkout, and to no other.
 *
 * This used to be 5390 for everybody, with `reuseExistingServer` on outside
 * CI — so a dev server left running by another worktree answered, and
 * Playwright used it. The suite then ran the real tests against a DIFFERENT
 * worker's source: twenty-four tests passing, every `songs` scene reporting
 * "the scene did not build", and the harness listing shot ids that do not
 * exist on this branch. Two people on one laptop is all it takes, and
 * nothing in the output says so.
 *
 * Both halves of the fix are here. The port is derived from the absolute
 * path of the checkout, so two worktrees never ask for the same one and the
 * same worktree always asks for the one it asked for last time; and the
 * server is never reused, so a port that is already answering is a loud
 * failure ("is already used") rather than a quiet substitution. 500 ports
 * above 5390 is far from anything a person runs by hand.
 *
 * `YAMES_LAYOUT_PORT` overrides it, for a run that has to be reachable at a
 * number somebody typed.
 */
const PORT = (() => {
  const asked = Number(process.env.YAMES_LAYOUT_PORT);
  if (Number.isInteger(asked) && asked >= 1024 && asked <= 65_535) return asked;
  const digest = createHash("sha1").update(process.cwd()).digest();
  return 5390 + (digest.readUInt16BE(0) % 500);
})();

export const LAYOUT_ORIGIN = `http://localhost:${PORT}`;

/**
 * The phone build's server: see the second `webServer` entry below. +2000
 * rather than +1000: 6390–6889 holds ports Chromium refuses to load
 * (6566, 6665–6669, 6679, 6697 — ERR_UNSAFE_PORT), and 7390–7889 holds none.
 */
const MOBILE_PORT = PORT + 2000;
export const MOBILE_ORIGIN = `http://localhost:${MOBILE_PORT}`;

/**
 * A dependency cache belonging to this checkout, one per build.
 *
 * Vite's default is `node_modules/.vite`, and worktrees link `node_modules`
 * to the main checkout's, so every worktree's servers wrote one folder. Its
 * key includes the checkout's root, so each suite that started re-bundled
 * the folder under the suites already running: their next lazy import (the
 * 3D neck's engine) was answered "outdated" and the neck fell back to its SVG
 * ("expected 3d, received fallback"), or the page reloaded under a test
 * ("execution context was destroyed"). Two workers on one machine was all it
 * took, and it read as load. The same lesson as the port above: nothing the
 * suite measures may be shared with another checkout.
 *
 * One folder per build as well, so the two servers below, started together
 * on a cold cache, do not write the same files at once.
 */
const viteCache = (build: "desktop" | "phone") => path.join(process.cwd(), ".layout-cache", build);

export default defineConfig({
  testDir: "tests/layout",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: LAYOUT_ORIGIN,
    // A failure here is always "something is in the wrong place", so a picture
    // of the moment it failed is the whole of the debugging.
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        /*
         * W21 — a camera, with no camera and nobody in front of it.
         *
         * Chromium's fake device hands the page a real `MediaStream` of a
         * synthetic picture and the fake UI answers the permission prompt, so
         * the `songs-camera` scene arms the shipping camera code, records with
         * the shipping `MediaRecorder` and plays the result back in the
         * shipping review. Without these two flags that scene cannot run at
         * all on a build machine, and with them it needs no hardware and no
         * person.
         *
         * They affect nothing else: every other scene here opens no camera, and
         * a flag that supplies a device nobody asks for supplies nothing.
         */
        launchOptions: {
          args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
        },
      },
    },
  ],
  /*
   * Its own server, always.
   *
   * `strictPort` means a clash is an error rather than a quiet move to the
   * next port, which would leave `baseURL` pointing at nothing; and
   * `reuseExistingServer: false` means this suite only ever measures a page
   * served out of this checkout. See the comment on `PORT` for what the
   * alternative cost.
   */
  webServer: [
    {
      command: `npx vite --port ${PORT} --strictPort`,
      url: `${LAYOUT_ORIGIN}/shots.html?manifest=1`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { YAMES_VITE_CACHE_DIR: viteCache("desktop") },
    },
    /*
     * The same harness, built for a phone (M09, from the `mobile` branch).
     *
     * `IS_MOBILE` is a build-time constant (src/platform.ts) and the phone's
     * rules are written against the `.main-window.is-mobile` class it writes,
     * not against a width — so a desktop build narrowed to 360px is not the
     * phone and never can be. Its own port (the desktop one plus 2000, so two
     * worktrees still never share one) and its own server, because one Vite
     * process can only be one build. Tests opt in with
     * `test.use({ baseURL: MOBILE_URL })` — see `MOBILE_URL` in
     * tests/layout/fits.ts.
     */
    {
      command: `npx vite --port ${MOBILE_PORT} --strictPort`,
      url: `${MOBILE_ORIGIN}/shots.html?manifest=1`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { YAMES_MOBILE: "1", YAMES_VITE_CACHE_DIR: viteCache("phone") },
    },
  ],
});
