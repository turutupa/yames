#!/usr/bin/env node
/**
 * take-screenshots.mjs — the website's and README's pictures, from the real UI.
 *
 * Usage:
 *   node scripts/take-screenshots.mjs                  # everything
 *   node scripts/take-screenshots.mjs --list           # what it would write
 *   node scripts/take-screenshots.mjs --shot metronome # one section
 *   node scripts/take-screenshots.mjs --theme ember    # one theme
 *   node scripts/take-screenshots.mjs --out DIR        # somewhere other than docs/img
 *   node scripts/take-screenshots.mjs --browser PATH   # a specific Chromium
 *
 * ── Why a browser and not the app ────────────────────────────────────────────
 *
 * On Windows Yames runs frameless: `create_overlay_titlebar()` calls
 * `set_decorations(false)` at startup (src-tauri/src/lib.rs, and the note at
 * the top of src/components/TitleBar.tsx), so the titlebar, the window buttons
 * and the 10px corner radius are all drawn by the app's own web content. The
 * window has no native chrome to photograph. And WebView2 *is* Edge — the same
 * Chromium, the same rasteriser. A page rendered here is not a mockup of the
 * app; below the mock IPC boundary it is the app.
 *
 * Capturing the real window was the obvious approach and it does not work on
 * this machine, for a reason worth writing down: the site's cards are 4:3 and
 * its assets are 2800×2100, which is 1400×1050 CSS pixels at 2× — and at 150%
 * Windows scaling a 1400×1050 window occupies 2100×1575 physical pixels, taller
 * than a 2560×1440 panel. You cannot screenshot a window that does not fit on
 * the screen. `Emulation.setDeviceMetricsOverride` has no such limit: the page
 * is rendered off-screen at whatever size and scale factor is asked for.
 *
 * ── What it needs ───────────────────────────────────────────────────────────
 *
 * Node 20+ (for global `fetch` and `WebSocket` — this speaks CDP directly, so
 * there is no Puppeteer to install) and Microsoft Edge or Chrome, which
 * Windows already has. Chromium encodes the WebP itself, so there is no cwebp
 * either. The fonts come from Google, so it needs the network — and the page
 * fails the shot rather than quietly photographing the fallback stack.
 */

import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Matches the existing assets, and `docs/style.css`'s `aspect-ratio: 4 / 3`. */
const DEVICE_SCALE = 2;
/** Chromium's WebP encoder. 85 is what the June conversion used. */
const WEBP_QUALITY = 85;

// ── The shot list ────────────────────────────────────────────────────────────────────────
// Fetched from the page at `?manifest=1`, not parsed out of scenarios.ts. A
// regex over TypeScript read `height: 100vh` out of a *comment* and made a
// shot 100 pixels tall — and the size check passed, because it was checking
// against the same wrong number. The module that owns the list is the one
// that reports it.
let THEMES = [];
let SHOTS = [];

// ── Arguments ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
let outDir = path.join(ROOT, "docs/img");
let onlyShot = null;
let onlyTheme = null;
let listOnly = false;
let browserPath = null;
let keepOpen = false;

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  const next = () => {
    const v = args[++i];
    if (v === undefined) fail(`${a} needs a value`);
    return v;
  };
  if (a === "--list") listOnly = true;
  else if (a === "--shot") onlyShot = next();
  else if (a === "--theme") onlyTheme = next();
  else if (a === "--out") outDir = path.resolve(next());
  else if (a === "--browser") browserPath = next();
  else if (a === "--keep-open") keepOpen = true;
  else fail(`unknown argument: ${a}`);
}

function fail(msg) {
  console.error(`Error: ${msg}`);
  process.exit(2);
}

function buildPlan() {
  const shots = onlyShot ? SHOTS.filter((s) => s.id === onlyShot) : SHOTS;
  if (!shots.length) fail(`no shot called "${onlyShot}" (have: ${SHOTS.map((s) => s.id).join(", ")})`);
  const themes = onlyTheme ? THEMES.filter((t) => t === onlyTheme) : THEMES;
  if (!themes.length) fail(`no theme called "${onlyTheme}" (have: ${THEMES.join(", ")})`);
  return shots.flatMap((shot) =>
    themes.map((theme) => ({
      shot,
      theme,
      file: path.join(outDir, shot.id, `${theme}-${shot.suffix}.webp`),
    })),
  );
}

/** Load shots.html once with no shot, and read the list it publishes. */
async function readManifest(cdp, sessionId, port) {
  await cdp.send(
    "Page.navigate",
    { url: `http://localhost:${port}/shots.html?manifest=1` },
    sessionId,
  );
  const started = Date.now();
  for (;;) {
    const { result } = await cdp.send(
      "Runtime.evaluate",
      { expression: "window.__SHOT_MANIFEST__ ?? null", returnByValue: true },
      sessionId,
    );
    if (result.value) return result.value;
    if (Date.now() - started > 30000) throw new Error("shots.html never published its manifest");
    await sleep(100);
  }
}

// ── Finding a browser ────────────────────────────────────────────────────────

function findBrowser() {
  if (browserPath) return browserPath;
  const pf = process.env["ProgramFiles"] ?? "C:\\Program Files";
  const pf86 = process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
  const local = process.env["LOCALAPPDATA"] ?? "";
  const candidates = [
    // Edge first. WebView2 is Edge, so this is the app's own rasteriser.
    path.join(pf86, "Microsoft/Edge/Application/msedge.exe"),
    path.join(pf, "Microsoft/Edge/Application/msedge.exe"),
    path.join(pf, "Google/Chrome/Application/chrome.exe"),
    path.join(pf86, "Google/Chrome/Application/chrome.exe"),
    path.join(local, "Google/Chrome/Application/chrome.exe"),
    // macOS and Linux, for anyone shooting from there.
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

// ── A very small CDP client ──────────────────────────────────────────────────

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

// ── The dev server ───────────────────────────────────────────────────────────

async function startVite(port) {
  const vite = path.join(ROOT, "node_modules/vite/bin/vite.js");
  if (!existsSync(vite)) throw new Error(`no vite at ${vite} — run npm install`);
  const proc = spawn(process.execPath, [vite, "--port", String(port), "--strictPort"], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
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

// ── Capture ──────────────────────────────────────────────────────────────────

/**
 * Drive one page into one shot and write the file.
 *
 * `Page.captureScreenshot` is given an explicit clip rather than being left to
 * the viewport: `captureBeyondViewport` plus a clip is the combination that
 * renders at the full device scale regardless of the window the headless
 * browser thinks it has.
 */
async function capture(cdp, sessionId, { shot, theme, file }, port) {
  await cdp.send(
    "Emulation.setDeviceMetricsOverride",
    { width: shot.width, height: shot.height, deviceScaleFactor: DEVICE_SCALE, mobile: false },
    sessionId,
  );

  // `window` is App's own routing parameter, not ours (src/App.tsx).
  const url =
    `http://localhost:${port}/shots.html?shot=${shot.id}&theme=${theme}` +
    `&window=${shot.window}`;
  await cdp.send("Page.navigate", { url }, sessionId);

  // The page says when it is ready, and says why if it never will be.
  const started = Date.now();
  for (;;) {
    const { result } = await cdp.send(
      "Runtime.evaluate",
      { expression: "[window.__SHOT_READY__ === true, window.__SHOT_ERROR__ ?? null]", returnByValue: true },
      sessionId,
    );
    const [ready, error] = result.value ?? [false, null];
    if (error) throw new Error(error);
    if (ready) break;
    if (Date.now() - started > 30000) throw new Error("the page never reported ready");
    await sleep(100);
  }

  await sleep(shot.settleMs);

  // scale stays 1: the clip is in CSS pixels and
  // `Emulation.setDeviceMetricsOverride` above is what doubles the output.
  // Setting it here as well multiplies, for a silent 4x.
  let clip = { x: 0, y: 0, width: shot.width, height: shot.height, scale: 1 };
  if (shot.clip) {
    const { result } = await cdp.send(
      "Runtime.evaluate",
      {
        expression: `(() => { const el = document.querySelector(${JSON.stringify(shot.clip)});
          if (!el) return null; const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height }; })()`,
        returnByValue: true,
      },
      sessionId,
    );
    if (!result.value) throw new Error(`nothing matched the clip selector ${shot.clip}`);
    clip = { ...result.value, scale: 1 };
  }

  const { data } = await cdp.send(
    "Page.captureScreenshot",
    { format: "webp", quality: WEBP_QUALITY, clip, captureBeyondViewport: true, optimizeForSpeed: false },
    sessionId,
  );

  const buf = Buffer.from(data, "base64");
  const [w, h] = webpSize(buf);
  const wantW = Math.round(clip.width * DEVICE_SCALE);
  const wantH = Math.round(clip.height * DEVICE_SCALE);
  // The one check between "the encoder returned bytes" and "the picture is of
  // the right thing at the right size".
  if (Math.abs(w - wantW) > 2 || Math.abs(h - wantH) > 2) {
    throw new Error(`came out ${w}x${h}, wanted ${wantW}x${wantH}`);
  }

  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, buf);
  return { bytes: buf.length, w, h };
}

/** Width and height out of a WebP container, for the size check above. */
function webpSize(buf) {
  const tag = buf.toString("ascii", 12, 16);
  if (tag === "VP8X") return [buf.readUIntLE(24, 3) + 1, buf.readUIntLE(27, 3) + 1];
  if (tag === "VP8 ") {
    const i = buf.indexOf(Buffer.from([0x9d, 0x01, 0x2a]), 16);
    return [buf.readUInt16LE(i + 3) & 0x3fff, buf.readUInt16LE(i + 5) & 0x3fff];
  }
  if (tag === "VP8L") {
    const n = buf.readUInt32LE(21);
    return [(n & 0x3fff) + 1, ((n >> 14) & 0x3fff) + 1];
  }
  return [0, 0];
}

// ── Run ──────────────────────────────────────────────────────────────────────

const browser = findBrowser();
if (!browser) {
  console.error("Error: no Edge or Chrome found.");
  console.error("  Pass one with --browser \"C:\\\\path\\\\to\\\\msedge.exe\"");
  process.exit(1);
}

const vitePort = await freePort();
const cdpPort = await freePort();
const profile = path.join(tmpdir(), `yames-shots-${process.pid}`);

let vite;
let chrome;
let cdp;
let failed = 0;
let written = 0;

try {
  vite = await startVite(vitePort);

  chrome = spawn(
    browser,
    [
      "--headless=new",
      `--remote-debugging-port=${cdpPort}`,
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      // Headless has no GPU rasteriser by default and falls back to software,
      // which is fine and deterministic — but say so rather than letting it
      // vary by machine.
      "--disable-gpu",
      "--hide-scrollbars",
      // The themes are the point of these pictures; nothing may tint them.
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

  const manifest = await readManifest(cdp, sessionId, vitePort);
  THEMES = manifest.themes;
  SHOTS = manifest.shots;
  const plan = buildPlan();

  if (listOnly) {
    console.log(`${plan.length} shots at ${DEVICE_SCALE}x:\n`);
    for (const [i, item] of plan.entries()) {
      console.log(
        `[${String(i + 1).padStart(2)}/${plan.length}] ${path.relative(ROOT, item.file)}` +
          `  (${item.shot.width * DEVICE_SCALE}x${item.shot.height * DEVICE_SCALE})`,
      );
    }
  } else {
  console.log(`Browser: ${browser}`);
  console.log(`Dest:    ${path.relative(ROOT, outDir)}/`);
  console.log(`Shots:   ${plan.length} at ${DEVICE_SCALE}x\n`);

  for (const [i, item] of plan.entries()) {
    const label = path.relative(outDir, item.file).replace(/\\/g, "/");
    process.stdout.write(`[${String(i + 1).padStart(2)}/${plan.length}] ${label} ...`);
    try {
      const { bytes, w, h } = await capture(cdp, sessionId, item, vitePort);
      written++;
      console.log(` ✓ ${w}x${h}, ${(bytes / 1024).toFixed(0)} kB`);
    } catch (err) {
      failed++;
      console.log(` ✗ ${err.message}`);
    }
  }
  }
} finally {
  cdp?.close();
  if (!keepOpen) chrome?.kill();
  vite?.kill();
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}

if (listOnly) process.exit(0);

console.log("");
console.log(`  written : ${written}`);
console.log(`  failed  : ${failed}`);
console.log("");
if (!failed) console.log(`Look at them before committing:  ${path.relative(ROOT, outDir)}/`);

process.exit(failed ? 1 : 0);
