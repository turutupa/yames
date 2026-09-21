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
export default defineConfig({
  testDir: "tests/layout",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:5390",
    // A failure here is always "something is in the wrong place", so a picture
    // of the moment it failed is the whole of the debugging.
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  /*
   * Its own port, and its own server.
   *
   * 5173 and 5174 are Vite's defaults and are routinely somebody else's: the
   * first run of this suite reused a server already listening on 5174 and
   * spent thirty seconds waiting for a page belonging to an entirely
   * different app to announce itself ready. `strictPort` means a clash is an
   * error rather than a quiet move to the next port, which would leave
   * `baseURL` pointing at nothing.
   */
  webServer: [
    {
      command: "npx vite --port 5390 --strictPort",
      url: "http://localhost:5390/shots.html?manifest=1",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    /*
     * The same harness, built for a phone (M09).
     *
     * `IS_MOBILE` is a build-time constant (src/platform.ts) and the phone's
     * rules are written against the `.main-window.is-mobile` class it writes,
     * not against a width — so a desktop build narrowed to 360px is not the
     * phone and never can be. The only way to measure the phone in a browser
     * is to serve one, which is what `scripts/mobile-shots.mjs` does for the
     * screenshots and what this does for the assertions.
     *
     * Its own port and its own server, because one Vite process can only be
     * one build. Tests opt in with `test.use({ baseURL: MOBILE_URL })` — see
     * `MOBILE_URL` in tests/layout/fits.ts — so everything else still
     * measures the desktop.
     */
    {
      command: "npx vite --port 5391 --strictPort",
      url: "http://localhost:5391/shots.html?manifest=1",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { YAMES_MOBILE: "1" },
    },
  ],
});
