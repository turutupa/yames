#!/usr/bin/env node
/**
 * probe.mjs — M03c's measuring stick.
 *
 * The same method M03a used for `M03-GAPS.md` ("How this was measured"):
 * `shots.html` + `src/shots/mockIpc.ts` driven through a headless Edge over
 * CDP, with `Emulation.setDeviceMetricsOverride({ mobile: true })` and touch
 * emulation on, so `(pointer: coarse)` and `(hover: none)` are what the page
 * actually matches. Below the mock IPC boundary it is the shipping UI.
 *
 *   node plans/tasks/mobile/m03c/probe.mjs phone   --out plans/tasks/mobile/m03c
 *   node plans/tasks/mobile/m03c/probe.mjs desktop --json /tmp/before.json
 *
 * `phone`   — 360 / 390 / 430 shots of every screen this task owns, plus the
 *             no-horizontal-overflow assertion per screen. Vite runs with
 *             YAMES_MOBILE=1, so the screens are the phone build's screens.
 * `desktop` — 1400x900, `mobile: false`, no touch (so `(hover: hover)` and
 *             `(pointer: fine)` match), YAMES_MOBILE unset. Writes a
 *             geometry + colour snapshot of settings, drill and zen. Run it
 *             once before the CSS changes and once after; `diff` is the gate.
 *
 * Two screens cannot be reached from `shots.html` (M03-GAPS says so): the
 * unsaved-changes dialog and the instrument picker. `dialogs.html` in this
 * folder mounts those two against the real stylesheets.
 */

import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

const args = process.argv.slice(2);
const mode = args[0] === "desktop" ? "desktop" : "phone";
let outDir = path.join(ROOT, "plans/tasks/mobile/m03c");
let jsonOut = null;
let only = null;
for (let i = 1; i < args.length; i++) {
  if (args[i] === "--out") outDir = path.resolve(args[++i]);
  else if (args[i] === "--json") jsonOut = path.resolve(args[++i]);
  else if (args[i] === "--only") only = args[++i];
}

const PHONE_WIDTHS = [
  { w: 360, h: 800 },
  { w: 390, h: 844 },
  { w: 430, h: 932 },
];

/* ── In-page helpers, injected before every driver ───────────────────────── */

const HELPERS = `
window.__p = {
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  async until(fn, what, ms = 10000) {
    const t = Date.now();
    for (;;) {
      let v = null;
      try { v = fn(); } catch { v = null; }
      if (v) return v;
      if (Date.now() - t > ms) throw new Error("timed out waiting for " + what);
      await new Promise((r) => setTimeout(r, 50));
    }
  },
  byText(sel, text) {
    return [...document.querySelectorAll(sel)].find(
      (e) => (e.textContent || "").trim().toLowerCase().includes(text.toLowerCase()),
    );
  },
  async click(sel, what) {
    const el = await window.__p.until(() => document.querySelector(sel), what || sel);
    el.click();
    await window.__p.sleep(60);
    return el;
  },
  /**
   * Open Settings, by whichever door this build has.
   *
   * M03c was written against the icon rail; M03b replaced it on mobile with a
   * bottom tab bar, where Settings is a .mobile-tab with a text label rather
   * than a button with an aria-label. Trying both means one probe reads both
   * branches and, after they merge, the merge.
   */
  async openSettings() {
    const el = await window.__p.until(
      () =>
        document.querySelector('button[aria-label="Settings"]') ||
        [...document.querySelectorAll(".mobile-tab")].find(
          (b) => (b.textContent || "").trim().toLowerCase() === "settings",
        ),
      "a way into Settings",
    );
    el.click();
    await window.__p.sleep(60);
    return el;
  },
  async clickText(sel, text) {
    const el = await window.__p.until(() => window.__p.byText(sel, text), sel + ' "' + text + '"');
    el.click();
    await window.__p.sleep(60);
    return el;
  },
  /** Scroll the settings sheet so section \`idx\` sits at the top. */
  async settingsSection(idx) {
    const scroller = await window.__p.until(
      () => document.querySelector('.main-content[data-view="settings"] .view-transition-wrapper')
         || document.querySelector('.main-content .view-transition-wrapper'),
      "the settings scroller",
    );
    const secs = scroller.querySelectorAll("section.settings-section, section.hotkeys-section");
    if (!secs[idx]) throw new Error("no settings section " + idx + " (have " + secs.length + ")");
    scroller.scrollTop = secs[idx].offsetTop - scroller.offsetTop - 8;
    await window.__p.sleep(180);
    return (secs[idx].querySelector("h2") || {}).textContent || String(idx);
  },
};
`;

/**
 * What "does it fit" means, and who broke it when it does not.
 *
 * `documentElement.scrollWidth <= innerWidth` on its own proves nothing here:
 * the app sets `overflow: hidden` on html and body, so a row that runs off the
 * right edge is CLIPPED rather than scrolled and the document stays 360 wide
 * while the control is unreachable. So the real assertion is per element: does
 * any box cross the viewport edge with nothing between it and the root that
 * clips horizontally? Content inside a deliberate horizontal scroller (the
 * climb chart) does not count — it is reachable by scrolling, which is the
 * whole point of a scroller.
 *
 * `root` scopes it to the screen under test. The beat view behind the
 * onboarding overlay is M03b's job, not this task's, and M03-GAPS already
 * records it.
 */
const overflow = (root) => `(() => {
  const vw = document.documentElement.clientWidth;
  const scope = document.querySelector(${JSON.stringify(root ?? "body")}) || document.body;
  // The one exception: a deliberate horizontal scroller — \`overflow-x: auto\`
  // or \`scroll\` with the vertical axis clipped, which is the climb chart's
  // shape and nothing else's. A vertical scroller does NOT count: the browser
  // computes its \`overflow-x\` to \`auto\` as well, and a settings row you can
  // only reach by dragging the page sideways is the bug, not the fix.
  const inHScroller = (el) => {
    for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      const cs = getComputedStyle(p);
      const hx = cs.overflowX === "auto" || cs.overflowX === "scroll";
      const clipY = cs.overflowY === "hidden" || cs.overflowY === "clip";
      if (hx && clipY) {
        const pr = p.getBoundingClientRect();
        if (pr.right <= vw + 0.5 && pr.left >= -0.5) return true;
      }
    }
    return false;
  };
  const bad = [];
  for (const el of [scope, ...scope.querySelectorAll("*")]) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (r.right <= vw + 0.5 && r.left >= -0.5) continue;
    if (inHScroller(el)) continue;
    const cls = el.getAttribute("class");
    bad.push({
      sel: el.tagName.toLowerCase() + (cls ? "." + cls.trim().split(/\\s+/).join(".") : ""),
      left: +r.left.toFixed(1),
      right: +r.right.toFixed(1),
      over: +Math.max(r.right - vw, -r.left).toFixed(1),
    });
  }
  return {
    root: ${JSON.stringify(root ?? "body")},
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    clientWidth: vw,
    fits: document.documentElement.scrollWidth <= window.innerWidth && bad.length === 0,
    offenders: bad.slice(0, 25),
  };
})()`;

/**
 * Geometry + colour of every element under `root`, positions relative to the
 * root's own box so a scroll offset cannot show up as a difference.
 */
const snapshot = (root) => `(() => {
  const r0 = document.querySelector(${JSON.stringify(root)});
  if (!r0) return ["MISSING ROOT ${root}"];
  const base = r0.getBoundingClientRect();
  const out = [];
  const walk = (el, p) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    out.push([
      p, el.tagName, (el.getAttribute("class") || "").trim(),
      (r.x - base.x).toFixed(2), (r.y - base.y).toFixed(2),
      r.width.toFixed(2), r.height.toFixed(2),
      cs.color, cs.backgroundColor, cs.borderTopColor, cs.borderTopWidth,
      cs.fontSize, cs.fontWeight, cs.display, cs.flexDirection, cs.flexWrap,
      cs.gap, cs.padding, cs.margin, cs.opacity, cs.minHeight, cs.maxWidth,
      cs.gridTemplateColumns, cs.textAlign, cs.overflowX,
    ].join("|"));
    for (let i = 0; i < el.children.length; i++) walk(el.children[i], p + "/" + i);
  };
  walk(r0, "");
  return out;
})()`;

/* ── The screens ─────────────────────────────────────────────────────────── */

const D = (s) => `(async () => { ${s} })()`;

/** Phone screens: every one this task owns. */
const PHONE = [
  {
    id: "settings-general",
    root: ".main-content",
    shot: "metronome",
    settle: 500,
    drive: D(`await __p.openSettings();
              await __p.until(() => document.querySelector(".settings-section"), "the settings sheet");
              await __p.sleep(400); await __p.settingsSection(0);`),
  },
  {
    id: "settings-appearance",
    root: ".main-content",
    shot: "metronome",
    settle: 500,
    drive: D(`await __p.openSettings();
              await __p.until(() => document.querySelector(".settings-section"), "the settings sheet");
              await __p.sleep(400); await __p.settingsSection(1);`),
  },
  {
    id: "settings-devices",
    root: ".main-content",
    shot: "metronome",
    settle: 500,
    drive: D(`await __p.openSettings();
              await __p.until(() => document.querySelector(".settings-section"), "the settings sheet");
              await __p.sleep(400); await __p.settingsSection(2);`),
  },
  {
    id: "settings-support",
    root: ".main-content",
    shot: "metronome",
    settle: 500,
    drive: D(`await __p.openSettings();
              await __p.until(() => document.querySelector(".settings-section"), "the settings sheet");
              await __p.sleep(400); await __p.settingsSection(3);`),
  },
  {
    id: "settings-about",
    root: ".main-content",
    shot: "metronome",
    settle: 500,
    drive: D(`await __p.openSettings();
              await __p.until(() => document.querySelector(".settings-section"), "the settings sheet");
              await __p.sleep(400); await __p.settingsSection(4);`),
  },
  {
    id: "settings-language-open",
    root: ".main-content",
    shot: "metronome",
    settle: 500,
    drive: D(`await __p.openSettings();
              await __p.until(() => document.querySelector(".settings-section"), "the settings sheet");
              await __p.sleep(400); await __p.settingsSection(0);
              await __p.click(".lang-select-btn");`),
  },
  // The chart mid-run: six steps up a sixteen-step climb (the `drill` shot).
  { id: "drill", root: ".drill-view", shot: "drill", settle: 1600, drive: D(`await __p.sleep(50);`) },
  {
    // The screen scrolls; the chart is the thing this task changed, so the
    // second shot is of the chart rather than of the plan sentence above it.
    id: "drill-climb",
    root: ".drill-view",
    shot: "drill",
    settle: 1600,
    drive: D(`const w = await __p.until(
                () => document.querySelector(".main-content .view-transition-wrapper"), "the drill scroller");
              await __p.sleep(600);
              w.scrollTop = w.scrollHeight;
              await __p.sleep(400);`),
  },
  { id: "zen", root: ".fullscreen-view", shot: "zen", settle: 2600, drive: D(`await __p.sleep(50);`) },
  {
    id: "onboarding-welcome",
    root: ".onboarding-overlay",
    shot: "metronome",
    settle: 600,
    drive: D(`await __p.openSettings();
              await __p.until(() => document.querySelector(".settings-section"), "the settings sheet");
              await __p.sleep(400);
              await __p.clickText(".setting-row .toggle-btn", "Open");
              await __p.until(() => document.querySelector(".onboarding-overlay"), "the wizard");
              await __p.sleep(300);`),
  },
  {
    id: "onboarding-instrument",
    root: ".onboarding-overlay",
    shot: "metronome",
    settle: 600,
    drive: D(`await __p.openSettings();
              await __p.until(() => document.querySelector(".settings-section"), "the settings sheet");
              await __p.sleep(400);
              await __p.clickText(".setting-row .toggle-btn", "Open");
              await __p.until(() => document.querySelector(".onboarding-overlay"), "the wizard");
              await __p.sleep(300);
              await __p.clickText(".onboarding-btn", "Set me up");
              await __p.until(() => document.querySelector(".instrument-picker-grid"), "W1");
              await __p.sleep(300);`),
  },
  {
    id: "onboarding-sound-look",
    root: ".onboarding-overlay",
    shot: "metronome",
    settle: 600,
    drive: D(`await __p.openSettings();
              await __p.until(() => document.querySelector(".settings-section"), "the settings sheet");
              await __p.sleep(400);
              await __p.clickText(".setting-row .toggle-btn", "Open");
              await __p.until(() => document.querySelector(".onboarding-overlay"), "the wizard");
              await __p.sleep(300);
              await __p.clickText(".onboarding-btn", "Set me up");
              await __p.until(() => document.querySelector(".instrument-picker-grid"), "W1");
              await __p.sleep(200);
              await __p.clickText(".onboarding-btn", "Next");
              await __p.until(() => document.querySelector(".onboarding-sound-look"), "W2");
              await __p.sleep(300);`),
  },
  {
    id: "onboarding-ready",
    root: ".onboarding-overlay",
    shot: "metronome",
    settle: 600,
    drive: D(`await __p.openSettings();
              await __p.until(() => document.querySelector(".settings-section"), "the settings sheet");
              await __p.sleep(400);
              await __p.clickText(".setting-row .toggle-btn", "Open");
              await __p.until(() => document.querySelector(".onboarding-overlay"), "the wizard");
              await __p.sleep(300);
              await __p.clickText(".onboarding-btn", "Set me up");
              await __p.until(() => document.querySelector(".instrument-picker-grid"), "W1");
              await __p.sleep(200);
              await __p.clickText(".onboarding-btn", "Next");
              await __p.until(() => document.querySelector(".onboarding-sound-look"), "W2");
              await __p.sleep(200);
              await __p.clickText(".onboarding-btn", "Next");
              await __p.until(() => document.querySelector(".onboarding-summary"), "W3");
              await __p.sleep(300);`),
  },
  {
    id: "unsaved-dialog",
    root: ".unsaved-overlay",
    page: "plans/tasks/mobile/m03c/dialogs.html?which=unsaved",
    settle: 400,
    drive: D(`await __p.until(() => document.querySelector(".unsaved-card"), "the dialog");`),
  },
  {
    id: "instrument-picker",
    root: ".instrument-picker-overlay",
    page: "plans/tasks/mobile/m03c/dialogs.html?which=instrument",
    settle: 400,
    drive: D(`await __p.until(() => document.querySelector(".instrument-picker-modal"), "the modal");`),
  },
];

/** Desktop parity roots, at 1400x900 with a fine pointer. */
const DESKTOP = [
  {
    id: "settings",
    shot: "metronome",
    root: ".main-content",
    settle: 900,
    drive: D(`await __p.openSettings();
              await __p.until(() => document.querySelector(".settings-section"), "the settings sheet");
              await __p.sleep(600);
              const s = document.querySelector('.main-content[data-view="settings"] .view-transition-wrapper');
              if (s) s.scrollTop = 0;
              await __p.sleep(200);`),
  },
  {
    id: "drill",
    shot: "drill",
    root: ".drill-view",
    settle: 2500,
    // Stopped before the snapshot. The shot is of a running drill, and a
    // running drill pulses its beat dots forever: a capture can land inside
    // the 150ms transition, and whether it does depends on sub-millisecond
    // startup timing rather than on any stylesheet. Stopping the transport
    // takes the only permanently-moving thing in this subtree out of the
    // comparison; the climb, which is what this task changed, is unaffected
    // (its entrance animation has long finished by 2.5s).
    drive: D(`const stop = await __p.until(
                () => [...document.querySelectorAll("button")].find(
                  (b) => /stop/i.test(b.textContent || "")), "the Stop button");
              stop.click();
              await __p.sleep(800);`),
  },
  {
    id: "zen",
    shot: "metronome",
    root: ".fullscreen-view",
    settle: 1200,
    // Stopped, and on the default "focus" visual: a running metronome moves
    // the beat dots' classes between runs and a diff would be all noise.
    drive: D(`await __p.click('[data-tour="zen-widget"]', "the Zen button");
              await __p.until(() => document.querySelector("[data-zen-style]"), "the Zen canvas");
              await __p.sleep(600);`),
  },
  {
    id: "onboarding",
    shot: "metronome",
    root: ".onboarding-overlay",
    settle: 900,
    drive: D(`await __p.openSettings();
              await __p.until(() => document.querySelector(".settings-section"), "the settings sheet");
              await __p.sleep(400);
              await __p.clickText(".setting-row .toggle-btn", "Open");
              await __p.until(() => document.querySelector(".onboarding-overlay"), "the wizard");
              await __p.sleep(500);`),
  },
  {
    id: "unsaved-dialog",
    page: "plans/tasks/mobile/m03c/dialogs.html?which=unsaved",
    root: ".unsaved-card",
    settle: 500,
    drive: D(`await __p.until(() => document.querySelector(".unsaved-card"), "the dialog");`),
  },
  {
    id: "instrument-picker",
    page: "plans/tasks/mobile/m03c/dialogs.html?which=instrument",
    root: ".instrument-picker-modal",
    settle: 500,
    drive: D(`await __p.until(() => document.querySelector(".instrument-picker-modal"), "the modal");`),
  },
];

/* ── Plumbing (a trimmed copy of scripts/take-screenshots.mjs) ───────────── */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findBrowser() {
  const pf = process.env["ProgramFiles"] ?? "C:\\Program Files";
  const pf86 = process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
  const local = process.env["LOCALAPPDATA"] ?? "";
  return [
    path.join(pf86, "Microsoft/Edge/Application/msedge.exe"),
    path.join(pf, "Microsoft/Edge/Application/msedge.exe"),
    path.join(pf, "Google/Chrome/Application/chrome.exe"),
    path.join(local, "Google/Chrome/Application/chrome.exe"),
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/microsoft-edge",
    "/usr/bin/chromium",
  ].find((c) => existsSync(c)) ?? null;
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    });
  }
  static async connect(url, timeoutMs = 20000) {
    const started = Date.now();
    for (;;) {
      try {
        const { webSocketDebuggerUrl } = await (await fetch(`${url}/json/version`)).json();
        const ws = new WebSocket(webSocketDebuggerUrl);
        await new Promise((resolve, reject) => {
          ws.addEventListener("open", resolve, { once: true });
          ws.addEventListener("error", reject, { once: true });
        });
        return new CDP(ws);
      } catch (err) {
        if (Date.now() - started > timeoutMs) throw new Error(`browser never answered: ${err.message}`);
        await sleep(150);
      }
    }
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId && { sessionId }) }));
    });
  }
  close() {
    try { this.ws.close(); } catch { /* already gone */ }
  }
}

async function startVite(port, env) {
  const vite = path.join(ROOT, "node_modules/vite/bin/vite.js");
  if (!existsSync(vite)) throw new Error(`no vite at ${vite}`);
  const proc = spawn(process.execPath, [vite, "--port", String(port), "--strictPort"], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...env },
  });
  let log = "";
  proc.stdout.on("data", (d) => (log += d));
  proc.stderr.on("data", (d) => (log += d));
  const started = Date.now();
  for (;;) {
    try {
      if ((await fetch(`http://localhost:${port}/shots.html`)).ok) return proc;
    } catch { /* not up yet */ }
    if (Date.now() - started > 60000) { proc.kill(); throw new Error(`vite did not start:\n${log}`); }
    if (proc.exitCode !== null) throw new Error(`vite exited (${proc.exitCode}):\n${log}`);
    await sleep(250);
  }
}

async function evaluate(cdp, sessionId, expression, awaitPromise = false) {
  const { result, exceptionDetails } = await cdp.send(
    "Runtime.evaluate",
    { expression, returnByValue: true, awaitPromise },
    sessionId,
  );
  if (exceptionDetails) {
    throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
  }
  return result.value;
}

/* ── Run ─────────────────────────────────────────────────────────────────── */

const browser = findBrowser();
if (!browser) { console.error("no Edge or Chrome found"); process.exit(2); }

const vitePort = await freePort();
const cdpPort = await freePort();
const profile = path.join(tmpdir(), `yames-m03c-${process.pid}`);

let vite, chrome, cdp;
let failed = 0;
const report = {};

try {
  vite = await startVite(vitePort, mode === "phone" ? { YAMES_MOBILE: "1" } : { YAMES_MOBILE: "" });

  chrome = spawn(browser, [
    "--headless=new",
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--disable-extensions",
    "--disable-gpu", "--hide-scrollbars", "--force-color-profile=srgb", "--disable-lcd-text",
    "about:blank",
  ], { stdio: "ignore" });

  cdp = await CDP.connect(`http://127.0.0.1:${cdpPort}`);
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  await cdp.send("Page.enable", {}, sessionId);
  await cdp.send("Runtime.enable", {}, sessionId);

  const screens = (mode === "phone" ? PHONE : DESKTOP).filter((s) => !only || s.id === only);
  const sizes = mode === "phone" ? PHONE_WIDTHS : [{ w: 1400, h: 900 }];

  for (const screen of screens) {
    for (const { w, h } of sizes) {
      const label = mode === "phone" ? `${screen.id}-${w}` : screen.id;
      process.stdout.write(`  ${label} ... `);
      try {
        await cdp.send("Emulation.setDeviceMetricsOverride", {
          width: w, height: h,
          deviceScaleFactor: mode === "phone" ? 2 : 1,
          mobile: mode === "phone",
        }, sessionId);
        await cdp.send("Emulation.setTouchEmulationEnabled", {
          enabled: mode === "phone", maxTouchPoints: mode === "phone" ? 5 : 1,
        }, sessionId);
        await cdp.send("Emulation.setEmitTouchEventsForMouse", {
          enabled: mode === "phone", configuration: "mobile",
        }, sessionId);

        const url = screen.page
          ? `http://localhost:${vitePort}/${screen.page}`
          : `http://localhost:${vitePort}/shots.html?shot=${screen.shot}&theme=mono&window=main`;
        await cdp.send("Page.navigate", { url }, sessionId);

        // shots.html reports when it is safe to photograph; dialogs.html does not.
        if (!screen.page) {
          const started = Date.now();
          for (;;) {
            const [ready, error] = await evaluate(
              cdp, sessionId,
              "[window.__SHOT_READY__ === true, window.__SHOT_ERROR__ ?? null]",
            ) ?? [false, null];
            if (error) throw new Error(error);
            if (ready) break;
            if (Date.now() - started > 30000) throw new Error("the page never reported ready");
            await sleep(100);
          }
        } else {
          await sleep(600);
        }

        await evaluate(cdp, sessionId, HELPERS);
        await evaluate(cdp, sessionId, screen.drive, true);
        await sleep(screen.settle);

        if (mode === "phone") {
          const fit = await evaluate(cdp, sessionId, overflow(screen.root));
          report[label] = fit;
          const { data } = await cdp.send("Page.captureScreenshot", {
            format: "png",
            clip: { x: 0, y: 0, width: w, height: h, scale: 1 },
            captureBeyondViewport: true,
          }, sessionId);
          await mkdir(outDir, { recursive: true });
          await writeFile(path.join(outDir, `${label}.png`), Buffer.from(data, "base64"));
          console.log(
            fit.fits
              ? `fits (${fit.scrollWidth} <= ${fit.innerWidth})`
              : `OVERFLOW ${fit.scrollWidth} > ${fit.innerWidth}: ${fit.offenders.map((o) => o.sel + " +" + o.over).join(", ")}`,
          );
          if (!fit.fits) failed++;
        } else {
          report[label] = await evaluate(cdp, sessionId, snapshot(screen.root));
          console.log(`${report[label].length} elements`);
        }
      } catch (err) {
        failed++;
        report[label] = { error: String(err.message ?? err) };
        console.log(`FAILED: ${err.message ?? err}`);
      }
    }
  }
} finally {
  cdp?.close();
  chrome?.kill();
  vite?.kill();
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}

if (jsonOut) {
  await mkdir(path.dirname(jsonOut), { recursive: true });
  await writeFile(jsonOut, JSON.stringify(report, null, 1));
  console.log(`\nwrote ${jsonOut}`);
}

console.log(failed ? `\n${failed} problem(s)` : "\nall clear");
process.exit(failed ? 1 : 0);
