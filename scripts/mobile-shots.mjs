#!/usr/bin/env node
/**
 * mobile-shots.mjs — the one phone-screenshot tool for the mobile port.
 *
 * M03b and M03c each wrote their own driver against `shots.html` +
 * `src/shots/mockIpc.ts`; this folds the two into a single script so the
 * release task has one thing to run. Same method both of them used: below
 * the mock IPC boundary this IS the app — same components, same stylesheets, same engine
 * (WebView2 and Edge are the same Chromium) — driven in a headless Edge/Chrome
 * over CDP with `Emulation.setDeviceMetricsOverride({ mobile: true })` and
 * touch emulation on, so `(pointer: coarse)` / `(hover: none)` are what the
 * page actually matches.
 *
 * Usage
 * -----
 *   node scripts/mobile-shots.mjs                     # every screen, 360/390/430
 *   node scripts/mobile-shots.mjs --widths 390,430     # a subset of widths
 *   node scripts/mobile-shots.mjs --only beat,drill     # a subset of screens
 *   node scripts/mobile-shots.mjs --only beat --locale vi   # one screen, one locale
 *   node scripts/mobile-shots.mjs --out D:\some\dir    # PNGs go here instead
 *                                                       # of the OS temp dir
 *   node scripts/mobile-shots.mjs --parity before.json # desktop geometry snapshot
 *   node scripts/mobile-shots.mjs --parity after.json  # ... again, after a change
 *   node scripts/mobile-shots.mjs --parity-compare before.json after.json
 *   node scripts/mobile-shots.mjs --browser "C:\path\to\msedge.exe"
 *
 * PNGs are written to `--out`, which defaults to a folder under the OS temp
 * directory — never inside the repo — so a bare run never leaves anything for
 * `git status` to notice.
 *
 * What it covers
 * --------------
 * The union of M03b's and M03c's screen lists, plus setlist editing and the
 * "each tab selected" sweep M03e's brief asked for by name: beat, the meter
 * sheet, the library sheet in presets and setlist mode, its search field, the
 * setlist tab both empty and with a setlist open (the editor), the drill with
 * its climb chart mid-run (six steps up a sixteen-step ramp), every settings
 * section (General/Appearance/Devices/Support/About — Coach/Widget/Hotkeys
 * don't ship on a phone, M02), the language dropdown open, zen, the three-step
 * phone onboarding (welcome / sound & look / ready — the instrument step was
 * cut from mobile onboarding by M03d), the unsaved-changes dialog and the
 * instrument-picker modal (both unreachable from the mocked backend — see
 * `--dialogs` note below), and one shot per bottom-tab destination.
 *
 * `--dialogs`: the unsaved-changes dialog and the instrument-picker modal
 * can't be reached from `shots.html` — the mock backend's setters are no-ops,
 * so nothing can ever be made dirty, and the harness's store always has an
 * instrument set (M03-GAPS). `src/shots/dialogs.html` + `dialogs.tsx` mount
 * those two components directly against the app's real stylesheets and i18n
 * instead. They are not part of the app: `vite build` takes `index.html` as
 * its only input, and nothing under `src/` imports them.
 *
 * `--locale <code>` drives the language switch through the real UI — Settings
 * → General → the language dropdown — exactly the way M03d's throwaway CDP
 * driver verified the bottom-tab labels fit in `vi` / `pt-BR` / `de` / `ja`.
 * It only affects screens driven through `shots.html`: the two `--dialogs`
 * screens mount outside the app shell and always render in English, and a
 * couple of driving steps elsewhere (opening the onboarding wizard, mostly)
 * match English button text, so a non-English run of those specific screens
 * may fail to find its way in — the core promise (any single screen, any
 * locale) holds.
 *
 * `--parity` / `--parity-compare`: geometry + paint of every element on a set
 * of desktop screens (1400×900, `(hover: hover)`, `(pointer: fine)`, no
 * `YAMES_MOBILE`), so "the phone work didn't touch desktop" is checkable
 * without a Tauri build. Record once before a change and once after, diff the
 * two — a clean diff is zero entries. Two things move on their own and are
 * NOT a regression if they're all a diff shows:
 *
 *   - `.voice-wave__bar` in the coach settings section — a permanently
 *     running animation; its bar heights differ by ~0.01px between any two
 *     runs, changed or not.
 *   - `.drill-dot` — which one carries the `active` class at the exact
 *     instant the transport stops, a race with no bearing on layout.
 *
 * The CDP hang workaround
 * ------------------------
 * Clicks are dispatched as a real pointer/mouse event sequence *inside the
 * page* (`pointerdown` → `mousedown` → `pointerup` → `mouseup` → `click`)
 * rather than through CDP's `Input.dispatchMouseEvent`, which never answered
 * once `Emulation.setEmitTouchEventsForMouse` was on and hung the very first
 * click of a run indefinitely (M03b). Every CDP request also carries a 20s
 * deadline (`CDP.send`) so a browser that stops answering fails the screen
 * instead of the whole run.
 *
 * The overflow assertions
 * ------------------------
 * `documentElement.scrollWidth <= innerWidth` alone proves very little: the
 * app sets `overflow: hidden` on `html`/`body`, so a control pushed off the
 * right edge is CLIPPED rather than scrolled and the document stays exactly
 * as wide as the viewport while the control is unreachable (M03c). So the
 * real horizontal check is per element — does any box cross the viewport edge
 * with nothing between it and the root that clips horizontally — with one
 * exception: a box inside a deliberate horizontal scroller (`overflow-x:
 * auto|scroll` with the vertical axis clipped — the climb chart's shape and
 * nothing else's) is reachable by scrolling, which is the point of a
 * scroller.
 *
 * That is still not the whole of "does it fit": the stage is a flex column
 * inside a region that hides its own overflow, and on an 800px-tall phone the
 * beat view can be taller than the room between the header and the transport
 * without a single element crossing a side edge (M03b). So a second check
 * asks whether `.main-content > .view-transition-wrapper` is taller than its
 * own box AND cannot scroll (`overflow-y` is neither `auto` nor `scroll`) —
 * that combination is a bug; a stage that scrolls is just a phone.
 */

import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * A port nobody else is on, chosen fresh for this run (M09).
 *
 * It was the fixed 1436, and `startVite` decides the server is up by fetching
 * `/shots.html` — so a second copy of this script, in a second worktree, found
 * the first one's server already answering on 1436 and photographed ITS build.
 * Its own Vite died instantly on `--strictPort` and nothing said so; the
 * pictures came out of somebody else's checkout, looking exactly like pictures
 * of this one. Two agents on one machine is the normal case here.
 *
 * A free port fixes it at the root: the only thing that can answer is the
 * server this run started. (Never 1420 either, which is what `tauri dev`
 * uses — and a random high port is never that.)
 */
const VITE_PORT = await freePort();

const DEVICE_SCALE = 2;
const DEFAULT_WIDTHS = [360, 390, 430];
const HEIGHT_BY_WIDTH = { 360: 800, 390: 844, 430: 932 };
const heightFor = (w) => HEIGHT_BY_WIDTH[w] ?? Math.round((w * 800) / 360);

// ── Arguments ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
let outDir = null;
let widths = DEFAULT_WIDTHS;
let onlyIds = null;
let locale = null;
let parityOut = null;
let parityCompare = null;
let browserPath = null;

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  const next = () => {
    const v = args[++i];
    if (v === undefined) fail(`${a} needs a value`);
    return v;
  };
  if (a === "--out") outDir = path.resolve(next());
  else if (a === "--widths") widths = next().split(",").map((s) => Number(s.trim()));
  else if (a === "--only") onlyIds = new Set(next().split(",").map((s) => s.trim()));
  else if (a === "--locale") locale = next();
  else if (a === "--parity") parityOut = path.resolve(next());
  else if (a === "--parity-compare") parityCompare = [path.resolve(next()), path.resolve(next())];
  else if (a === "--browser") browserPath = next();
  else fail(`unknown argument: ${a}`);
}

if (!outDir) outDir = path.join(tmpdir(), "yames-mobile-shots");

function fail(msg) {
  console.error(`Error: ${msg}`);
  process.exit(2);
}

// ── The screens, and how to reach each one ──────────────────────────────────
//
// `shot` picks the mocked state `shots.html?shot=` mounts (scenarios.ts);
// `steps` are clicks/waits on top of it, run in the order given. Selectors
// are the app's own — a step that stops matching means the UI moved, which
// is exactly when this should fail loudly rather than photograph the wrong
// screen.

const tap = (sel) => ({ click: sel });
const wait = (sel) => ({ wait: sel });
const waitGone = (sel) => ({ waitGone: sel });
const clickText = (sel, text) => ({ clickText: sel, text });
const settle = (ms) => ({ sleep: ms });
/**
 * Scroll one settings section to the top of the sheet, BY NAME.
 *
 * It used to be an index into the rendered sections, and the day the Devices
 * section started returning null on a phone (M08 — a dropdown that changes
 * nothing there) every number after it pointed at the wrong screen and
 * `settings-about` failed outright with "no settings section 4 (have 4)".
 * A selector cannot drift: each section carries its own id or class, and a
 * section that does not ship on a phone is simply not asked for.
 */
const settingsSection = (selector) => ({ settingsSection: selector });

/** Settings is a mobile tab; opening it also works from the desktop rail
 *  (`button[aria-label="Settings"]`), which is all the parity probe needs. */
const OPEN_SETTINGS = [
  { openSettings: true },
  wait(".settings-section"),
  settle(400),
];

const SCREENS = [
  { id: "beat", shot: "metronome" },

  // ── each bottom tab, selected ──────────────────────────────────────────
  { id: "tab-drill", shot: "metronome", steps: [tap('.mobile-tab[data-tab="drill"]')] },
  { id: "tab-setlist", shot: "metronome", steps: [tap('.mobile-tab[data-tab="setlist"]')] },
  { id: "tab-settings", shot: "metronome", steps: [tap('.mobile-tab[data-tab="settings"]'), wait(".settings-section")] },
  { id: "tab-jam", shot: "metronome", steps: [tap('.mobile-tab[data-tab="jam"]')] },

  // ── the band (M08) ───────────────────────────────────────────
  //
  // Jam ships on a phone from M08 on, and it was drawn for a 1400px
  // window. These three are the shots M09 works from: the playing screen,
  // the band's own rows further down it, and the drawer you set the whole
  // thing up in. Same scenarios the desktop store shots use, so the two
  // can be put side by side.
  { id: "jam", shot: "jam", settleMs: 600 },
  { id: "jam-band", shot: "jam-band", settleMs: 600 },
  { id: "jam-setup", shot: "jam-setup", settleMs: 600 },

  // ── the cheat sheet (M09) ────────────────────────────────────────────
  //
  // The one part of the mode M08 never photographed: "they are reached from
  // the context bar, which is where this document stops". Three screens,
  // because the sheet is three different shapes — a page of grips for the
  // key, the stacked necks behind the Scales tab, and the root × quality
  // chart, which is the widest thing the app draws anywhere.
  //
  // Driven through the English labels on the sheet's own controls, so these
  // three are the screens the harness header warns about under `--locale`.
  { id: "jam-cheat", shot: "jam-chords", settleMs: 600 },
  { id: "jam-cheat-scales", shot: "jam-chords-colours", settleMs: 600 },
  { id: "jam-cheat-chart", shot: "jam-chords-all", settleMs: 600 },

  // ── the library sheet ───────────────────────────────────────────────────
  { id: "library-presets", shot: "metronome", steps: [tap(".mobile-tab-library"), wait(".sheet--library")] },
  {
    id: "library-setlists",
    shot: "metronome",
    steps: [tap('.mobile-tab[data-tab="setlist"]'), tap(".mobile-tab-library"), wait(".sheet--library")],
  },
  {
    id: "library-search",
    shot: "metronome",
    steps: [
      tap(".mobile-tab-library"),
      wait(".sheet--library"),
      tap(".preset-sidebar-search-btn"),
      wait(".preset-search-field"),
    ],
  },

  // ── setlists: empty, and with one open (the editor) ────────────────────
  { id: "setlist-empty", shot: "metronome", steps: [tap('.mobile-tab[data-tab="setlist"]')] },
  {
    // Opening a setlist from the library IS the editor — `SetlistParagraph`,
    // not `SetlistPlayer` (that one only mounts once the setlist is actually
    // running; see MainWindow.tsx's `view === "setlist"` branch). Loading a
    // setlist does not close the sheet on its own (unlike a few other
    // pickers) — the sheet's own toggle does.
    id: "setlist-editor",
    shot: "metronome",
    steps: [
      tap('.mobile-tab[data-tab="setlist"]'),
      tap(".mobile-tab-library"),
      wait(".sheet--library"),
      tap(".preset-sidebar-item.setlist-item"),
      wait(".setlist-paragraph"),
      tap(".mobile-tab-library"),
      waitGone(".sheet--library"),
    ],
  },

  // ── the meter sheet ──────────────────────────────────────────────────────
  { id: "meter-sheet", shot: "metronome", steps: [tap(".meter-chip"), wait(".sheet--meter")] },

  // ── the drill, mid-climb: six steps up a sixteen-step ramp (scenarios.ts) ─
  { id: "drill", shot: "drill", root: ".drill-view", settleMs: 1600 },
  {
    // The screen scrolls; this is a shot of the chart itself rather than the
    // plan sentence above it.
    id: "drill-climb",
    shot: "drill",
    root: ".drill-view",
    settleMs: 1600,
    steps: [
      { scrollStageToBottom: true },
      settle(400),
    ],
  },

  // ── every settings section that ships on a phone ────────────────────────
  //
  // Devices is not one of them: its only control was an output picker that
  // does nothing on Android (the system routes Oboe), so the section returns
  // null there (M08). It had a scene here until M09, and that scene was what
  // pushed every section after it one place along.
  { id: "settings-general", shot: "metronome", root: ".main-content", steps: [...OPEN_SETTINGS, settingsSection("#settings-general")] },
  { id: "settings-appearance", shot: "metronome", root: ".main-content", steps: [...OPEN_SETTINGS, settingsSection("#settings-appearance")] },
  { id: "settings-support", shot: "metronome", root: ".main-content", steps: [...OPEN_SETTINGS, settingsSection(".support-card")] },
  { id: "settings-about", shot: "metronome", root: ".main-content", steps: [...OPEN_SETTINGS, settingsSection(".about-section:not(.support-card)")] },
  {
    id: "settings-language-open",
    shot: "metronome",
    root: ".main-content",
    steps: [...OPEN_SETTINGS, settingsSection("#settings-general"), tap(".lang-select-btn"), wait(".lang-options")],
  },

  // ── zen ──────────────────────────────────────────────────────────────────
  { id: "zen", shot: "zen", root: ".fullscreen-view", settleMs: 2600 },

  // ── onboarding: three steps on a phone (M03d cut the instrument step) ───
  {
    id: "onboarding-welcome",
    shot: "metronome",
    root: ".onboarding-overlay",
    steps: [...OPEN_SETTINGS, clickText(".setting-row .toggle-btn", "Open"), wait(".onboarding-overlay"), settle(300)],
  },
  {
    id: "onboarding-sound-look",
    shot: "metronome",
    root: ".onboarding-overlay",
    steps: [
      ...OPEN_SETTINGS,
      clickText(".setting-row .toggle-btn", "Open"),
      wait(".onboarding-overlay"),
      settle(300),
      clickText(".onboarding-btn", "Set me up"),
      wait(".onboarding-sound-look"),
      settle(300),
    ],
  },
  {
    id: "onboarding-ready",
    shot: "metronome",
    root: ".onboarding-overlay",
    steps: [
      ...OPEN_SETTINGS,
      clickText(".setting-row .toggle-btn", "Open"),
      wait(".onboarding-overlay"),
      settle(300),
      clickText(".onboarding-btn", "Set me up"),
      wait(".onboarding-sound-look"),
      settle(200),
      clickText(".onboarding-btn", "Next"),
      wait(".onboarding-summary"),
      settle(300),
    ],
  },
];

/**
 * The two screens `shots.html` can't reach — see the header comment. Served
 * from `src/shots/dialogs.html`, not from `shots.html`, so they carry no
 * `shot=` scenario and no `--locale` (they mount outside the app shell).
 */
const DIALOG_SCREENS = [
  { id: "unsaved-dialog", page: "src/shots/dialogs.html?which=unsaved", root: ".unsaved-card" },
  { id: "instrument-picker", page: "src/shots/dialogs.html?which=instrument", root: ".instrument-picker-modal" },
];

/** Desktop parity roots, at 1400×900 with a fine pointer, `YAMES_MOBILE` unset. */
const PARITY_SCREENS = [
  { id: "settings", shot: "metronome", root: ".main-content", steps: [...OPEN_SETTINGS, settle(400)] },
  {
    id: "setlist",
    shot: "metronome",
    root: ".main-content",
    // The rail's own mode button — the desktop navigation this task must not
    // touch.
    steps: [{ click: '.rail-mode[aria-label="Setlist"]' }, settle(400)],
  },
  {
    id: "drill",
    shot: "drill",
    root: ".drill-view",
    settleMs: 2500,
    // Stopped before the snapshot: a running drill pulses its beat dots
    // forever, and whether a capture lands inside a 150ms transition depends
    // on sub-millisecond startup timing, not on any stylesheet. The climb
    // chart's own entrance animation has long finished by 2.5s regardless.
    steps: [{ clickButtonText: "stop" }, settle(800)],
  },
  {
    id: "zen",
    shot: "metronome",
    root: ".fullscreen-view",
    settleMs: 1200,
    // Stopped, on the default "focus" visual — a running metronome moves the
    // beat dots' classes between any two runs and a diff would be all noise.
    steps: [{ zenButton: true }, wait("[data-zen-style]"), settle(600)],
  },
  {
    id: "onboarding",
    shot: "metronome",
    root: ".onboarding-overlay",
    steps: [...OPEN_SETTINGS, clickText(".setting-row .toggle-btn", "Open"), wait(".onboarding-overlay"), settle(500)],
  },
  { id: "unsaved-dialog", page: "src/shots/dialogs.html?which=unsaved", root: ".unsaved-card" },
  { id: "instrument-picker", page: "src/shots/dialogs.html?which=instrument", root: ".instrument-picker-modal" },
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

  // Every request carries a deadline: a browser that stops answering (the
  // CDP hang M03b hit with Input.dispatchMouseEvent under touch emulation)
  // fails the one screen in flight instead of hanging the whole run.
  send(method, params = {}, sessionId, timeoutMs = 20000) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} did not answer in ${timeoutMs}ms`));
      }, timeoutMs);
      const settleFn = (fn) => (v) => {
        clearTimeout(timer);
        fn(v);
      };
      this.pending.set(id, { resolve: settleFn(resolve), reject: settleFn(reject) });
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

async function evaluate(cdp, sessionId, expression, awaitPromise = true) {
  const { result, exceptionDetails } = await cdp.send(
    "Runtime.evaluate",
    { expression, returnByValue: true, awaitPromise },
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
    // `IS_MOBILE` is a build-time constant (src/platform.ts) — the only way
    // to photograph the phone build is to serve one.
    env: { ...process.env, ...(mobile ? { YAMES_MOBILE: "1" } : { YAMES_MOBILE: "" }) },
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

async function waitForShotReady(cdp, sessionId) {
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

async function waitUntilGone(cdp, sessionId, selector, timeoutMs = 8000) {
  const started = Date.now();
  for (;;) {
    if (!(await evaluate(cdp, sessionId, `!!document.querySelector(${JSON.stringify(selector)})`))) return;
    if (Date.now() - started > timeoutMs) throw new Error(`${selector} never went away`);
    await sleep(80);
  }
}

/**
 * Click through the real event sequence rather than calling `.click()`.
 *
 * A tap is pointerdown → mousedown → pointerup → mouseup → click, and the
 * sheets and pickers all listen on the earlier ones (the outside-click
 * dismissal is a `mousedown` handler). `el.click()` fires only the last,
 * which would leave a picker open that a real tap would have closed.
 *
 * Dispatched inside the page rather than through CDP's Input domain: with
 * `Emulation.setEmitTouchEventsForMouse` on, `Input.dispatchMouseEvent` never
 * answered here — the first click of a run hung indefinitely (M03b). The
 * synthesised sequence is what the listeners actually read, and it cannot
 * wedge on a CDP round trip.
 */
async function clickSelector(cdp, sessionId, selector) {
  await waitFor(cdp, sessionId, selector);
  const ok = await evaluate(
    cdp,
    sessionId,
    `(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const at = { clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, bubbles: true, cancelable: true };
      const pointer = { ...at, pointerId: 1, pointerType: "touch", isPrimary: true };
      el.dispatchEvent(new PointerEvent("pointerdown", pointer));
      el.dispatchEvent(new MouseEvent("mousedown", { ...at, button: 0, buttons: 1 }));
      el.dispatchEvent(new PointerEvent("pointerup", pointer));
      el.dispatchEvent(new MouseEvent("mouseup", { ...at, button: 0, buttons: 0 }));
      el.dispatchEvent(new MouseEvent("click", { ...at, button: 0, buttons: 0 }));
      return true;
    })()`,
  );
  if (!ok) throw new Error(`nothing to click at ${selector}`);
  await sleep(260);
}

/** Click the first element matching `selector` whose text includes `text`
 *  (case-insensitive) — for buttons the app gives no stable class of their
 *  own ("Open", "Set me up", "Next"). */
async function clickByText(cdp, sessionId, selector, text) {
  const found = await evaluate(
    cdp,
    sessionId,
    `(() => {
      const needle = ${JSON.stringify(text.toLowerCase())};
      const el = [...document.querySelectorAll(${JSON.stringify(selector)})]
        .find((e) => (e.textContent || "").trim().toLowerCase().includes(needle));
      if (!el) return false;
      el.scrollIntoView({ block: "center" });
      const r = el.getBoundingClientRect();
      const at = { clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, bubbles: true, cancelable: true };
      const pointer = { ...at, pointerId: 1, pointerType: "touch", isPrimary: true };
      el.dispatchEvent(new PointerEvent("pointerdown", pointer));
      el.dispatchEvent(new MouseEvent("mousedown", { ...at, button: 0, buttons: 1 }));
      el.dispatchEvent(new PointerEvent("pointerup", pointer));
      el.dispatchEvent(new MouseEvent("mouseup", { ...at, button: 0, buttons: 0 }));
      el.dispatchEvent(new MouseEvent("click", { ...at, button: 0, buttons: 0 }));
      return true;
    })()`,
  );
  if (!found) throw new Error(`no "${text}" in ${selector}`);
  await sleep(260);
}

/** Scroll the settings sheet so the section matching `selector` sits at the
 *  top. By name rather than by position — see `settingsSection` above. */
async function scrollToSettingsSection(cdp, sessionId, selector) {
  const title = await evaluate(
    cdp,
    sessionId,
    `(() => {
      const scroller =
        document.querySelector('.main-content[data-view="settings"] .view-transition-wrapper') ||
        document.querySelector(".main-content .view-transition-wrapper");
      if (!scroller) throw new Error("no settings scroller");
      const sec = scroller.querySelector(${JSON.stringify(selector)});
      if (!sec) {
        const have = [...scroller.querySelectorAll("section.settings-section, section.hotkeys-section")]
          .map((s) => (s.id || s.className));
        throw new Error("no settings section matching ${selector} — on screen: " + have.join(", "));
      }
      scroller.scrollTop = sec.offsetTop - scroller.offsetTop - 8;
      return (sec.querySelector("h2") || {}).textContent || ${JSON.stringify(selector)};
    })()`,
  );
  await sleep(200);
  return title;
}

/** Open Settings by whichever door this build has — the mobile tab bar's
 *  text-labelled tab, or the desktop rail's `aria-label`led button. */
async function openSettings(cdp, sessionId) {
  const ok = await evaluate(
    cdp,
    sessionId,
    `(() => {
      const el =
        document.querySelector('.mobile-tab[data-tab="settings"]') ||
        document.querySelector('button[aria-label="Settings"]');
      if (!el) return false;
      el.click();
      return true;
    })()`,
  );
  if (!ok) throw new Error("no way into Settings");
  await sleep(200);
}

/** Enter Zen from whichever control this build has — the rail's own button
 *  (by the tour anchor it carries) or the mobile tab bar's Zen tab. */
async function clickZen(cdp, sessionId) {
  await clickSelector(cdp, sessionId, '[data-tour="zen-widget"], .mobile-tab-zen');
}

async function clickButtonByText(cdp, sessionId, text) {
  await clickByText(cdp, sessionId, "button", text);
}

/** Scroll the drill's own scroller to the bottom, where the climb chart is. */
async function scrollStageToBottom(cdp, sessionId) {
  await evaluate(
    cdp,
    sessionId,
    `(() => {
      const w = document.querySelector(".main-content .view-transition-wrapper");
      if (w) w.scrollTop = w.scrollHeight;
      return true;
    })()`,
  );
}

async function runStep(cdp, sessionId, step) {
  if (step.click) return clickSelector(cdp, sessionId, step.click);
  if (step.wait) return waitFor(cdp, sessionId, step.wait);
  if (step.waitGone) return waitUntilGone(cdp, sessionId, step.waitGone);
  if (step.clickText) return clickByText(cdp, sessionId, step.clickText, step.text);
  if (step.clickButtonText) return clickButtonByText(cdp, sessionId, step.clickButtonText);
  if (typeof step.sleep === "number") return sleep(step.sleep);
  if (typeof step.settingsSection === "string") return void (await scrollToSettingsSection(cdp, sessionId, step.settingsSection));
  if (step.openSettings) return openSettings(cdp, sessionId);
  if (step.zenButton) return clickZen(cdp, sessionId);
  if (step.scrollStageToBottom) return scrollStageToBottom(cdp, sessionId);
  throw new Error(`unrecognised step: ${JSON.stringify(step)}`);
}

/**
 * Switch the whole page's language through Settings → General → the language
 * dropdown, the same door M03d's throwaway driver used to prove the bottom
 * tab labels fit in `vi` / `pt-BR` / `de` / `ja`. The dropdown lists each
 * language by its own native name (`_name` in `src/locales/<code>/
 * common.json`), not by its code, so that's read off disk and matched by
 * text rather than guessed.
 */
async function setLocale(cdp, sessionId, code) {
  const localeFile = path.join(ROOT, "src/locales", code, "common.json");
  if (!existsSync(localeFile)) fail(`no locale "${code}" (no src/locales/${code}/common.json)`);
  const { _name } = JSON.parse(await readFile(localeFile, "utf8"));
  await openSettings(cdp, sessionId);
  await waitFor(cdp, sessionId, ".settings-section");
  await sleep(300);
  await clickSelector(cdp, sessionId, ".lang-select-btn");
  await waitFor(cdp, sessionId, ".lang-options");
  await clickByText(cdp, sessionId, ".lang-option", _name);
  await sleep(200);
  // Back to wherever the screen's own steps expect to start from.
  await openSettings(cdp, sessionId);
  await sleep(150);
}

/** The gate's own assertions: horizontal overflow (per element, scoped to
 *  `root`, with the climb-chart's horizontal scroller excepted) and the
 *  vertical "stage taller than its box and cannot scroll" check (M03b). */
async function overflowReport(cdp, sessionId, root) {
  return await evaluate(
    cdp,
    sessionId,
    `(() => {
      const vw = document.documentElement.clientWidth;
      const scope = document.querySelector(${JSON.stringify(root ?? "body")}) || document.body;

      // The one exception: a deliberate horizontal scroller (the climb
      // chart's shape and nothing else's). A vertical scroller's computed
      // overflow-x is "auto" too, so it must ALSO have its vertical axis
      // clipped to count — a settings row only reachable by dragging the
      // page sideways is the bug, not the fix.
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

      // A stage taller than the room it has, that cannot scroll to reach the
      // rest of itself — not a horizontal question, but still "cut off".
      const stage = document.querySelector(".main-content > .view-transition-wrapper");
      const stageInfo = stage
        ? { client: stage.clientHeight, scroll: stage.scrollHeight, overflowY: getComputedStyle(stage).overflowY }
        : null;
      const stageClipped =
        !!stageInfo && stageInfo.scroll > stageInfo.client + 1 &&
        stageInfo.overflowY !== "auto" && stageInfo.overflowY !== "scroll";

      return {
        root: ${JSON.stringify(root ?? "body")},
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        clientWidth: vw,
        coarse: matchMedia("(pointer: coarse)").matches,
        noHover: matchMedia("(hover: none)").matches,
        offenders: bad.slice(0, 20),
        offenderCount: bad.length,
        stage: stageInfo,
        stageClipped,
        fits: bad.length === 0 && !stageClipped,
      };
    })()`,
  );
}

// ── The desktop parity probe ─────────────────────────────────────────────────
//
// Geometry and paint for every element on the screen, keyed by a stable path
// relative to `root`'s own box (so a scroll offset can't show up as a diff).

const PARITY_PROBE = (root) => `(() => {
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

function compareParity(a, b) {
  let diffs = 0;
  for (const screen of new Set([...Object.keys(a), ...Object.keys(b)])) {
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

async function runParity(cdp, sessionId, port) {
  const record = {};
  for (const screen of PARITY_SCREENS) {
    await cdp.send(
      "Emulation.setDeviceMetricsOverride",
      { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false },
      sessionId,
    );
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: false }, sessionId);
    const url = screen.page
      ? `http://localhost:${port}/${screen.page}`
      : `http://localhost:${port}/shots.html?shot=${screen.shot}&theme=mono&window=main`;
    await cdp.send("Page.navigate", { url: "about:blank" }, sessionId);
    await cdp.send("Page.navigate", { url }, sessionId);

    if (screen.page) {
      await sleep(600);
    } else {
      await waitForShotReady(cdp, sessionId);
      const media = await evaluate(
        cdp,
        sessionId,
        `[matchMedia("(hover: hover)").matches, matchMedia("(pointer: fine)").matches]`,
      );
      if (!media[0] || !media[1]) throw new Error(`${screen.id}: wanted (hover: hover)+(pointer: fine), got ${media}`);
    }

    process.stdout.write(`  ${screen.id} ... `);
    try {
      for (const step of screen.steps ?? []) await runStep(cdp, sessionId, step);
      await sleep(screen.settleMs ?? 500);
      record[screen.id] = await evaluate(cdp, sessionId, PARITY_PROBE(screen.root));
      console.log(`${record[screen.id].length} elements`);
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
      record[screen.id] = { error: String(err.message ?? err) };
    }
  }
  return record;
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

const cdpPort = await freePort();
const profile = path.join(tmpdir(), `yames-mobile-shots-${process.pid}`);

let vite;
let chrome;
let cdp;
let failed = 0;
let written = 0;

try {
  // The parity probe wants the DESKTOP build; the phone shots want the
  // mobile one — never both from the same server.
  vite = await startVite(VITE_PORT, !parityOut);

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
    console.log(`Desktop parity probe at 1400x900, (hover: hover) / (pointer: fine)\n`);
    const record = await runParity(cdp, sessionId, VITE_PORT);
    await mkdir(path.dirname(parityOut), { recursive: true });
    await writeFile(parityOut, JSON.stringify(record));
    console.log(`\n  written: ${parityOut}`);
  } else {
    const screens = [...SCREENS, ...DIALOG_SCREENS].filter((s) => !onlyIds || onlyIds.has(s.id));
    if (!screens.length) fail(`no screen matched --only ${[...(onlyIds ?? [])].join(",")}`);

    console.log(`Browser: ${browser}`);
    console.log(`Dest:    ${outDir}`);
    console.log(`Build:   YAMES_MOBILE=1 on :${VITE_PORT}`);
    if (locale) console.log(`Locale:  ${locale}`);
    console.log("");

    for (const width of widths) {
      const height = heightFor(width);
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

          const url = screen.page
            ? `http://localhost:${VITE_PORT}/${screen.page}`
            : `http://localhost:${VITE_PORT}/shots.html?shot=${screen.shot}&theme=ember&window=main`;
          await cdp.send("Page.navigate", { url: "about:blank" }, sessionId);
          await cdp.send("Page.navigate", { url }, sessionId);

          if (screen.page) {
            for (const step of screen.steps ?? []) await runStep(cdp, sessionId, step);
            await sleep(400);
          } else {
            await waitForShotReady(cdp, sessionId);
            if (locale) await setLocale(cdp, sessionId, locale);
            for (const step of screen.steps ?? []) await runStep(cdp, sessionId, step);
          }
          await sleep(screen.settleMs ?? 450);

          const report = await overflowReport(cdp, sessionId, screen.root);
          if (!screen.page && (!report.coarse || !report.noHover)) {
            throw new Error(`touch emulation off: coarse=${report.coarse} noHover=${report.noHover}`);
          }

          const { data } = await cdp.send(
            "Page.captureScreenshot",
            { format: "png", clip: { x: 0, y: 0, width, height, scale: 1 }, captureBeyondViewport: true, optimizeForSpeed: false },
            sessionId,
          );
          await mkdir(path.dirname(file), { recursive: true });
          await writeFile(file, Buffer.from(data, "base64"));
          written++;

          if (!report.fits) failed++;
          console.log(
            ` ${report.fits ? "\u2713" : "\u2717"} scrollWidth ${report.scrollWidth} / innerWidth ${report.innerWidth}` +
              (report.stage
                ? `, stage ${report.stage.scroll}/${report.stage.client} ${report.stage.overflowY}` +
                  (report.stageClipped ? " CLIPPED" : report.stage.scroll > report.stage.client + 1 ? " (scrolls)" : "")
                : "") +
              (report.offenderCount ? `, ${report.offenderCount} element(s) past an edge` : ""),
          );
          if (report.offenderCount) {
            for (const o of report.offenders) console.log(`        ${o.sel}  [${o.left} … ${o.right}] +${o.over}`);
          }
        } catch (err) {
          failed++;
          console.log(` \u2717 ${err.message}`);
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
