import { createHash } from "node:crypto";
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
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  /*
   * Its own server, always.
   *
   * `strictPort` means a clash is an error rather than a quiet move to the
   * next port, which would leave `baseURL` pointing at nothing; and
   * `reuseExistingServer: false` means this suite only ever measures a page
   * served out of this checkout. See the comment on `PORT` for what the
   * alternative cost.
   */
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `${LAYOUT_ORIGIN}/shots.html?manifest=1`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
