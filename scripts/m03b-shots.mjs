#!/usr/bin/env node
/**
 * m03b-shots.mjs — the phone screens for M03b, and the desktop parity probe.
 *
 * Same machinery as `scripts/take-screenshots.mjs` (a tiny CDP client, the
 * repo's own `shots.html` + `src/shots/mockIpc.ts` harness, headless Edge or
 * Chrome), and the same reasoning: below the mock IPC boundary this IS the
 * app, not a mockup. What it adds is what M03a's survey needed and this task
 * needs again —
 *
 *   • a phone viewport with `Emulation.setDeviceMetricsOverride({mobile:true})`
 *     and touch emulation, so `(pointer: coarse)` / `(hover: none)` are what
 *     the page actually sees;
 *   • a `YAMES_MOBILE=1` dev server, so the pictures are of the phone build —
 *     no titlebar, no rail, no coach;
 *   • a script that drives the app by clicking (tab bar, library, meter chip)
 *     rather than by adding entries to `src/shots/scenarios.ts`, whose list
 *     the website's own capture reads;
 *   • the overflow assertion the acceptance gate asks for, per screen:
 *     `document.documentElement.scrollWidth <= innerWidth`;
 *   • `--parity`, which photographs nothing and instead records the box and
 *     the painted colours of every element on the desktop metronome and
 *     setlist screens at 1400x900 with `(hover: hover)` / `(pointer: fine)`.
 *     Run it before a change and after it; `--parity-compare` diffs the two.
 *     That is how "desktop is pixel-identical" is checked without a desktop
 *     build.
 *
 * Usage:
 *   node scripts/m03b-shots.mjs                        # the phone shots
 *   node scripts/m03b-shots.mjs --out DIR              # somewhere else
 *   node scripts/m03b-shots.mjs --parity FILE.json     # record desktop geometry
 *   node scripts/m03b-shots.mjs --parity-compare A B   # diff two recordings
 *   node scripts/m03b-shots.mjs --desktop              # parity run, non-mobile build
 */

import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Matches m03a/, so before and after can be laid side by side. */
const DEVICE_SCALE = 2;
const WIDTHS = [360, 390, 430];
const HEIGHTS = { 360: 800, 390: 844, 430: 932 };

// ── Arguments ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
let outDir = path.join(ROOT, "plans/tasks/mobile/m03b");
let parityOut = null;
let parityCompare = null;
let browserPath = null;
let onlyScreen = null;

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  const next = () => {
    const v = args[++i];
    if (v === undefined) fail(`${a} needs a value`);
    return v;
  };
  if (a === "--out") outDir = path.resolve(next());
  else if (a === "--parity") parityOut = path.resolve(next());
  else if (a === "--parity-compare") parityCompare = [path.resolve(next()), path.resolve(next())];
  else if (a === "--browser") browserPath = next();
  else if (a === "--screen") onlyScreen = next();
  else fail(`unknown argument: ${a}`);
}

function fail(msg) {
  console.error(`Error: ${msg}`);
  process.exit(2);
}

// ── The phone screens, and how to reach each one ─────────────────────────────
//
// `shot` is the harness scenario that decides the mocked state; `steps` are
// clicks on top of it. Selectors are the app's own, so a step that stops
// matching is a step whose UI changed — which is exactly when a screenshot
// gate should fail rather than quietly photograph the wrong screen.

const SCREENS = [
  { id: "beat", shot: "metronome", steps: [] },
  {
    id: "tab-drill",
    shot: "metronome",
    steps: [{ click: '.mobile-tab[data-tab="drill"]' }],
  },
  {
    id: "tab-setlist",
    shot: "metronome",
    steps: [{ click: '.mobile-tab[data-tab="setlist"]' }],
  },
  {
    id: "tab-settings",
    shot: "metronome",
    steps: [{ click: '.mobile-tab[data-tab="settings"]' }],
  },
  {
    id: "library-presets",
    shot: "metronome",
    steps: [{ click: ".mobile-tab-library" }, { wait: ".sheet--library" }],
  },
  {
    id: "library-setlists",
    shot: "metronome",
    steps: [
      { click: '.mobile-tab[data-tab="setlist"]' },
      { click: ".mobile-tab-library" },
      { wait: ".sheet--library" },
    ],
  },
  {
    id: "meter-sheet",
    shot: "metronome",
    steps: [{ click: ".meter-chip" }, { wait: ".sheet--meter" }],
  },
];

// ── Finding a browser ────────────────────────────────────────────────────────

function findBrowser() {
  if (browserPath) return browserPath;
  const pf = process.env["ProgramFiles"] ?? "C:\\Program Files";
  const pf86 = process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
  const local = process.env["LOCALAPPDATA"] ?? "";
  const candidates = [
    path.join(pf86, "Microsoft/Edge/Application/msedge.exe"),
    path.join(pf, "Microsoft/Edge/Application/msedge.exe"),
    path.join(pf, "Google/Chrome/Application/chrome.exe"),
    path.join(pf86, "Google/Chrome/Application/chrome.exe"),
    path.join(local, "Google/Chrome/Application/chrome.exe"),
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/microsoft-edge",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ];
  return candidates.find((c) => existsSync(c)) ?? null;
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

// ── A very small CDP client (lifted from take-screenshots.mjs) ───────────────

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
        if (msg.error) reject(new Error(`${msg.error.message} (${JSON.stringify(msg.error.data ?? null)})`));
        else resolve(msg.result);
      }
    });
  }

  static async connect(url, timeoutMs = 20000) {
    const started = Date.now();
    for (;;) {
      try {
        const res = await fetch(`${url}/json/version`);
        const { webSocketDebuggerUrl } = await res.json();
        const ws = new WebSocket(webSocketDebuggerUrl);
        await new Promise((resolve, reject) => {
          ws.addEventListener("open", resolve, { once: true });
          ws.addEventListener("error", reject, { once: true });
        });
        return new CDP(ws);
      } catch (err) {
        if (Date.now() - started > timeoutMs) throw new Error(`browser never answered on ${url}: ${err.message}`);
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
    try {
      this.ws.close();
    } catch {
      /* already gone */
    }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function evaluate(cdp, sessionId, expression) {
  const { result, exceptionDetails } = await cdp.send(
    "Runtime.evaluate",
    { expression, returnByValue: true, awaitPromise: true },
    sessionId,
  );
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
  return result.value;
}

// ── The dev server ───────────────────────────────────────────────────────────

async function startVite(port, mobile) {
  const vite = path.join(ROOT, "node_modules/vite/bin/vite.js");
  if (!existsSync(vite)) throw new Error(`no vite at ${vite} — run npm install`);
  const proc = spawn(process.execPath, [vite, "--port", String(port), "--strictPort"], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    // The whole point of the phone run: `IS_MOBILE` is a build-time constant
    // (src/platform.ts), so the only way to photograph the phone build is to
    // serve one.
    env: { ...process.env, ...(mobile ? { YAMES_MOBILE: "1" } : {}) },
  });
  let log = "";
  proc.stdout.on("data", (d) => (log += d));
  proc.stderr.on("data", (d) => (log += d));

  const started = Date.now();
  for (;;) {
    try {
      const res = await fetch(`http://localhost:${port}/shots.html`);
      if (res.ok) return proc;
    } catch {
      /* not up yet */
    }
    if (Date.now() - started > 60000) {
      proc.kill();
      throw new Error(`vite did not start on ${port}:\n${log}`);
    }
    if (proc.exitCode !== null) throw new Error(`vite exited (${proc.exitCode}):\n${log}`);
    await sleep(250);
  }
}

// ── Driving ──────────────────────────────────────────────────────────────────

async function waitForReady(cdp, sessionId) {
  const started = Date.now();
  for (;;) {
    const [ready, error] = (await evaluate(
      cdp,
      sessionId,
      "[window.__SHOT_READY__ === true, window.__SHOT_ERROR__ ?? null]",
    )) ?? [false, null];
    if (error) throw new Error(error);
    if (ready) return;
    if (Date.now() - started > 30000) throw new Error("the page never reported ready");
    await sleep(100);
  }
}

async function waitFor(cdp, sessionId, selector, timeoutMs = 8000) {
  const started = Date.now();
  for (;;) {
    if (await evaluate(cdp, sessionId, `!!document.querySelector(${JSON.stringify(selector)})`)) return;
    if (Date.now() - started > timeoutMs) throw new Error(`never saw ${selector}`);
    await sleep(80);
  }
}

/**
 * Click through the real event sequence rather than calling `.click()`.
 *
 * A tap is pointerdown → mousedown → pointerup → mouseup → click, and the
 * sheet and the pickers all listen on the earlier ones (the outside-click
 * dismissal is a `mousedown` handler). `el.click()` fires only the last, which
 * would leave a picker open that a real tap would have closed — and photograph
 * a state the app cannot be in.
 */
async function clickSelector(cdp, sessionId, selector) {
  await waitFor(cdp, sessionId, selector);
  const box = await evaluate(
    cdp,
    sessionId,
    `(() => { const el = document.querySelector(${JSON.stringify(selector)});
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`,
  );
  for (const type of ["mousePressed", "mouseReleased"]) {
    await cdp.send(
      "Input.dispatchMouseEvent",
      { type, x: box.x, y: box.y, button: "left", clickCount: 1, buttons: type === "mousePressed" ? 1 : 0 },
      sessionId,
    );
    await sleep(30);
  }
  await sleep(220);
}

/** The gate's own assertion, asked of the page. */
async function overflowReport(cdp, sessionId) {
  return await evaluate(
    cdp,
    sessionId,
    `(() => {
      const doc = document.documentElement;
      const over = [];
      for (const el of document.querySelectorAll("body *")) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        if (getComputedStyle(el).visibility === "hidden") continue;
        if (r.right > window.innerWidth + 0.5 || r.left < -0.5) {
          over.push({
            sel: el.tagName.toLowerCase() + (el.className && typeof el.className === "string"
              ? "." + el.className.trim().split(/\\s+/).slice(0, 2).join(".")
              : ""),
            left: Math.round(r.left), right: Math.round(r.right),
          });
        }
      }
      return {
        scrollWidth: doc.scrollWidth,
        innerWidth: window.innerWidth,
        coarse: matchMedia("(pointer: coarse)").matches,
        noHover: matchMedia("(hover: none)").matches,
        over: over.slice(0, 12),
        overCount: over.length,
      };
    })()`,
  );
}

// ── The desktop parity probe ─────────────────────────────────────────────────
//
// Geometry and paint for every element on the screen, keyed by a stable path.
// Two runs of this are comparable; a diff of zero entries is what "desktop is
// pixel-identical" means here.

const PROBE = `(() => {
  const out = [];
  const walk = (el, pathStr) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    out.push([
      pathStr,
      Math.round(r.x * 100) / 100, Math.round(r.y * 100) / 100,
      Math.round(r.width * 100) / 100, Math.round(r.height * 100) / 100,
      cs.color, cs.backgroundColor, cs.borderTopColor, cs.borderTopWidth,
      cs.fontSize, cs.fontWeight, cs.opacity, cs.display, cs.visibility,
    ].join("|"));
    let i = 0;
    for (const child of el.children) {
      const tag = child.tagName.toLowerCase();
      const cls = typeof child.className === "string" && child.className.trim()
        ? "." + child.className.trim().split(/\\s+/).join(".")
        : "";
      walk(child, pathStr + ">" + tag + cls + ":" + i++);
    }
  };
  walk(document.body, "body");
  return out;
})()`;

async function parityRun(cdp, sessionId, port) {
  const screens = [
    { id: "metronome", shot: "metronome", steps: [] },
    {
      id: "setlist",
      shot: "metronome",
      // The rail's own mode button — the desktop navigation this task must
      // leave untouched.
      steps: [{ click: '.rail-mode[aria-label="Setlist"]' }],
    },
  ];
  const record = {};
  for (const screen of screens) {
    await cdp.send(
      "Emulation.setDeviceMetricsOverride",
      { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false },
      sessionId,
    );
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: false }, sessionId);
    await cdp.send(
      "Page.navigate",
      { url: `http://localhost:${port}/shots.html?shot=${screen.shot}&theme=ember&window=main` },
      sessionId,
    );
    await waitForReady(cdp, sessionId);
    const media = await evaluate(
      cdp,
      sessionId,
      `[matchMedia("(hover: hover)").matches, matchMedia("(pointer: fine)").matches]`,
    );
    if (!media[0] || !media[1]) throw new Error(`${screen.id}: wanted (hover: hover) and (pointer: fine), got ${media}`);
    for (const step of screen.steps) await clickSelector(cdp, sessionId, step.click);
    await sleep(500);
    record[screen.id] = await evaluate(cdp, sessionId, PROBE);
    console.log(`  ${screen.id}: ${record[screen.id].length} elements`);
  }
  return record;
}

function compareParity(a, b) {
  let diffs = 0;
  for (const screen of Object.keys(a)) {
    const left = a[screen] ?? [];
    const right = b[screen] ?? [];
    const byPath = new Map(left.map((row) => [row.split("|")[0], row]));
    const seen = new Set();
    for (const row of right) {
      const key = row.split("|")[0];
      seen.add(key);
      const before = byPath.get(key);
      if (before === undefined) {
        console.log(`  + ${screen} ${key}`);
        diffs++;
      } else if (before !== row) {
        console.log(`  ~ ${screen} ${key}`);
        console.log(`      before ${before.slice(key.length + 1)}`);
        console.log(`      after  ${row.slice(key.length + 1)}`);
        diffs++;
      }
    }
    for (const key of byPath.keys()) {
      if (!seen.has(key)) {
        console.log(`  - ${screen} ${key}`);
        diffs++;
      }
    }
  }
  return diffs;
}

// ── Run ──────────────────────────────────────────────────────────────────────

if (parityCompare) {
  const [a, b] = await Promise.all(parityCompare.map(async (f) => JSON.parse(await readFile(f, "utf8"))));
  const diffs = compareParity(a, b);
  console.log("");
  console.log(`  differences: ${diffs}`);
  process.exit(diffs ? 1 : 0);
}

const browser = findBrowser();
if (!browser) {
  console.error('Error: no Edge or Chrome found. Pass one with --browser "C:\\\\path\\\\to\\\\msedge.exe"');
  process.exit(1);
}

const vitePort = await freePort();
const cdpPort = await freePort();
const profile = path.join(tmpdir(), `yames-m03b-${process.pid}`);

let vite;
let chrome;
let cdp;
let failed = 0;
let written = 0;

try {
  // The parity probe wants the DESKTOP build; the shots want the phone one.
  vite = await startVite(vitePort, !parityOut);

  chrome = spawn(
    browser,
    [
      "--headless=new",
      `--remote-debugging-port=${cdpPort}`,
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--disable-gpu",
      "--hide-scrollbars",
      "--force-color-profile=srgb",
      "--disable-lcd-text",
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  cdp = await CDP.connect(`http://127.0.0.1:${cdpPort}`);
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  await cdp.send("Page.enable", {}, sessionId);
  await cdp.send("Runtime.enable", {}, sessionId);

  if (parityOut) {
    console.log(`Desktop parity probe at 1400x900, (hover: hover) / (pointer: fine)`);
    const record = await parityRun(cdp, sessionId, vitePort);
    await mkdir(path.dirname(parityOut), { recursive: true });
    await writeFile(parityOut, JSON.stringify(record));
    console.log(`\n  written: ${path.relative(ROOT, parityOut)}`);
  } else {
    console.log(`Browser: ${browser}`);
    console.log(`Dest:    ${path.relative(ROOT, outDir)}/`);
    console.log(`Build:   YAMES_MOBILE=1\n`);

    const screens = onlyScreen ? SCREENS.filter((s) => s.id === onlyScreen) : SCREENS;
    if (!screens.length) fail(`no screen called "${onlyScreen}"`);

    for (const width of WIDTHS) {
      const height = HEIGHTS[width];
      for (const screen of screens) {
        const file = path.join(outDir, `${screen.id}-${width}.png`);
        process.stdout.write(`[${width}] ${screen.id} ...`);
        try {
          await cdp.send(
            "Emulation.setDeviceMetricsOverride",
            { width, height, deviceScaleFactor: DEVICE_SCALE, mobile: true },
            sessionId,
          );
          await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 }, sessionId);
          await cdp.send(
            "Emulation.setEmitTouchEventsForMouse",
            { enabled: true, configuration: "mobile" },
            sessionId,
          );
          await cdp.send(
            "Page.navigate",
            { url: `http://localhost:${vitePort}/shots.html?shot=${screen.shot}&theme=ember&window=main` },
            sessionId,
          );
          await waitForReady(cdp, sessionId);
          for (const step of screen.steps) {
            if (step.click) await clickSelector(cdp, sessionId, step.click);
            if (step.wait) await waitFor(cdp, sessionId, step.wait);
          }
          await sleep(450);

          const report = await overflowReport(cdp, sessionId);
          if (!report.coarse || !report.noHover) {
            throw new Error(`touch emulation off: coarse=${report.coarse} noHover=${report.noHover}`);
          }

          const { data } = await cdp.send(
            "Page.captureScreenshot",
            {
              format: "png",
              clip: { x: 0, y: 0, width, height, scale: 1 },
              captureBeyondViewport: true,
              optimizeForSpeed: false,
            },
            sessionId,
          );
          await mkdir(path.dirname(file), { recursive: true });
          await writeFile(file, Buffer.from(data, "base64"));
          written++;

          const ok = report.scrollWidth <= report.innerWidth;
          if (!ok) failed++;
          console.log(
            ` ${ok ? "✓" : "✗"} scrollWidth ${report.scrollWidth} / innerWidth ${report.innerWidth}` +
              (report.overCount ? `, ${report.overCount} element(s) past an edge` : ""),
          );
          if (report.overCount) {
            for (const o of report.over) console.log(`        ${o.sel}  [${o.left} … ${o.right}]`);
          }
        } catch (err) {
          failed++;
          console.log(` ✗ ${err.message}`);
        }
      }
    }
  }
} finally {
  cdp?.close();
  chrome?.kill();
  vite?.kill();
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}

if (!parityOut) {
  console.log("");
  console.log(`  written : ${written}`);
  console.log(`  failed  : ${failed}`);
}
process.exit(failed ? 1 : 0);
