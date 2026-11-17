#!/usr/bin/env node
// The real app, end to end, on Linux with no screen and no guitar.
// See tests/e2e/README.md for what it covers and how to run it.
import { spawnSync } from "node:child_process";
import { accessSync, constants, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { Env, appDataDir, freeDisplay, seedSettings, startNvidiaX } from "./lib/env.mjs";
import { Driver } from "./lib/webdriver.mjs";
import { Player, renderTake } from "./lib/player.mjs";
import {
  FIRST_PATH,
  SECOND_PATH,
  barTicks,
  exerciseByTitle,
  exerciseOnScreen,
  loadPath,
  placementExercise,
  takeBars,
} from "./lib/exercises.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..", "..");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** The Paths the suite plays: the one a new player starts on, and a second. */
const PATHS = [loadPath(FIRST_PATH), loadPath(SECOND_PATH)];

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const opt = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
if (flag("--help")) {
  console.log(`usage: node tests/e2e/run.mjs [options]
  --no-build          use the binary already built (default: build it first)
  --app <path>        the app binary (default: $CARGO_TARGET_DIR or src-tauri/target, release/yames)
  --scenarios <list>  comma list of: placement,session,relaunch,two-paths,four-fingers,
                      blues-band,gpu-info,neck,baseline,restart,wrong-notes
                      (default: placement,session,relaunch,two-paths,four-fingers,gpu-info)
  --bleed <dB>        blues-band: also feed the app's output back into its input at this
                      level (e.g. -20), as speakers into a microphone would
  --neck-takes <n>    Takes the neck scenario plays back to back (default 3)
  --baseline-seconds <n>  length of the headless probe run (default 60)
  --out <dir>         where results, screenshots and the probe reports go
                      (default: a new temp dir, printed at the end)
  --gpu               start an X server on the NVIDIA GPU (sudo) instead of
                      Xvfb, so WebKit draws the neck on the GPU (see README)
  --gpu-display <:n>  run on an existing X server instead of starting one
  --app-env K=V       an extra variable for the app (repeatable), e.g.
                      WEBKIT_DMABUF_RENDERER_FORCE_SHM=1 for WebGL on the
                      NVIDIA X server (see README)
  --keep              leave the profile and logs behind`);
  process.exit(0);
}
const scenarios = new Set(opt("--scenarios", "placement,session,relaunch,two-paths,four-fingers,gpu-info").split(","));
const targetDir = process.env.CARGO_TARGET_DIR || join(repo, "src-tauri", "target");
const app = resolve(opt("--app", join(targetDir, "release", "yames")));
const out = resolve(opt("--out", mkdtempSync(join(tmpdir(), "yames-e2e-out-"))));
mkdirSync(out, { recursive: true });
let gpuDisplay = opt("--gpu-display", null);
let stopX = null;
if (flag("--gpu") && !gpuDisplay) {
  const n = freeDisplay(50);
  stopX = await startNvidiaX(n, mkdtempSync(join(tmpdir(), "yames-e2e-xorg-")));
  gpuDisplay = `:${n}`;
}
// WebKit's DMABuf renderer asks the KMS node for dumb buffers, which only the
// X server (DRM master) may make; shared-memory buffers for the compositor,
// with WebGL still on the GPU, is what works on the NVIDIA X server.
const gpuEnv = gpuDisplay ? { WEBKIT_DMABUF_RENDERER_FORCE_SHM: "1" } : {};
const appEnv = Object.assign({}, gpuEnv, Object.fromEntries(
  argv.flatMap((a, i) => (a === "--app-env" && argv[i + 1] ? [argv[i + 1].split(/=(.*)/s).slice(0, 2)] : [])),
));

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  return !!ok;
}
const info = {};

// ---------------------------------------------------------------------------
// Preflight and build
// ---------------------------------------------------------------------------

const TOOLS = ["Xvfb", "xdpyinfo", "dbus-daemon", "pipewire", "wireplumber", "pipewire-pulse", "pactl", "parec", "pacat", "WebKitWebDriver"];
const tauriDriver = process.env.TAURI_DRIVER || join(process.env.HOME, ".cargo", "bin", "tauri-driver");
const missing = TOOLS.filter((t) => spawnSync("sh", ["-c", `command -v ${t}`]).status !== 0);
if (!existsSync(tauriDriver)) missing.push("tauri-driver (cargo install tauri-driver --locked)");
if (missing.length) {
  console.error(`missing: ${missing.join(", ")}\nsee tests/e2e/README.md for the apt line`);
  process.exit(2);
}

if (!flag("--no-build")) {
  console.log("building the app (no LLM, release, with the probe's allocation count)...");
  const r = spawnSync(
    process.execPath,
    [join(repo, "scripts", "tauri.mjs"), "build", "--no-bundle", "--features", "callback-probe-alloc"],
    {
      cwd: repo,
      stdio: "inherit",
      // aubio-sys's C needs these with the compilers on Ubuntu 24.04.
      env: { CFLAGS: "-std=gnu11 -Wno-implicit-function-declaration", ...process.env, YAMES_DEV_NO_LLM: "1" },
    },
  );
  if (r.status !== 0) {
    console.error("build failed");
    process.exit(2);
  }
  if (scenarios.has("baseline")) {
    const p = spawnSync("cargo", ["build", "--release", "--manifest-path", join(repo, "src-tauri", "Cargo.toml"), "--bin", "click-jitter-probe"], {
      cwd: repo,
      stdio: "inherit",
      env: { CFLAGS: "-std=gnu11 -Wno-implicit-function-declaration", ...process.env },
    });
    if (p.status !== 0) {
      console.error("probe build failed");
      process.exit(2);
    }
  }
}
if (!existsSync(app)) {
  console.error(`no app at ${app} (build it, or pass --app)`);
  process.exit(2);
}

// ---------------------------------------------------------------------------
// The world
// ---------------------------------------------------------------------------

const env = new Env({ display: gpuDisplay ? Number(gpuDisplay.replace(":", "")) : undefined, gpu: !!gpuDisplay });
console.log(`profile: ${env.dirs.root}`);
const probeOut = (n) => join(out, `callback-probe-${n}.json`);
let launch = 0;
let driverProc = null;

/**
 * WebKit renders on the GPU only if it can open the DRM render node, which
 * belongs to the `render` group. When we cannot and passwordless sudo is
 * there, start tauri-driver (and so the app) as ourselves plus that group,
 * which is what a desktop session's seat ACL gives a logged-in user.
 */
function driverCommand(vars) {
  const node = "/dev/dri/renderD128";
  let readable = true;
  try {
    accessSync(node, constants.R_OK | constants.W_OK);
  } catch {
    readable = !existsSync(node);
  }
  const group = spawnSync("getent", ["group", "render"], { encoding: "utf8" }).stdout?.split(":")[2];
  if (readable || !group || spawnSync("sudo", ["-n", "true"]).status !== 0) {
    return { cmd: tauriDriver, args: ["--port", "4444"], render: readable };
  }
  const full = env.env(vars);
  return {
    cmd: "sudo",
    args: [
      "-n", "setpriv", `--reuid=${process.getuid()}`, `--regid=${process.getgid()}`,
      `--groups=${group},${process.getgid()}`, "--inh-caps=-all",
      "env", "-i", ...Object.entries(full).map(([k, v]) => `${k}=${v}`),
      tauriDriver, "--port", "4444",
    ],
    render: true,
  };
}

async function startDriver() {
  if (driverProc && driverProc.exitCode === null) return;
  // The in-app click probe, armed for every launch, its report per launch.
  const vars = { ...appEnv, YAMES_CALLBACK_PROBE: "1", YAMES_CALLBACK_PROBE_OUT: probeOut(launch) };
  const { cmd, args, render } = driverCommand(vars);
  info.renderNode = render;
  driverProc = env.spawnLogged("tauri-driver", cmd, args, { env: vars });
  await env.waitFor(async () => {
    const r = await fetch("http://127.0.0.1:4444/status").catch(() => null);
    return !!r;
  }, "tauri-driver");
}

async function launchApp() {
  launch += 1;
  // A fresh driver per launch, so each launch writes its own probe report.
  if (driverProc) {
    driverProc.kill("SIGTERM");
    await sleep(500);
  }
  driverProc = null;
  await startDriver();
  const d = await new Driver().start(app);
  await d.waitText(/Today/, 30000);
  // "What's new" is offered on every new version; it is not what this tests.
  await d.clickText(/^Got it$/, { timeoutMs: 3000 }).catch(() => {});
  return d;
}

/** Quit as a player does (the window's Close), so the probe report is written. */
async function quitApp(d, label) {
  const path = probeOut(launch);
  try {
    await d.clickText(/^Close$/, { timeoutMs: 5000 });
  } catch (e) {
    console.warn(`could not press Close: ${e.message}`);
  }
  await env.waitFor(() => existsSync(path), "the probe report", 10000).catch(() => {});
  await d.quit();
  if (existsSync(path)) {
    const report = JSON.parse(readFileSync(path, "utf8"));
    info[`probe_${label}`] = report;
    return report;
  }
  return null;
}

async function shot(d, name) {
  try {
    writeFileSync(join(out, `${name}.png`), await d.screenshot());
  } catch {
    /* a screenshot is a nicety */
  }
}

function db() {
  return new DatabaseSync(join(appDataDir(env.dirs), "practice.db"), { readOnly: true });
}
function takesOf(exerciseId) {
  const conn = db();
  try {
    return conn
      .prepare("SELECT * FROM path_takes WHERE exercise_id = ? ORDER BY started_at")
      .all(exerciseId)
      .map((r) => ({ ...r, facts: JSON.parse(r.facts_json) }));
  } finally {
    conn.close();
  }
}
function cleanTempo(exerciseKey) {
  const conn = db();
  try {
    return conn.prepare("SELECT comfortable_bpm FROM exercise_ceilings WHERE exercise_key = ?").get(exerciseKey)
      ?.comfortable_bpm ?? null;
  } finally {
    conn.close();
  }
}

/** What the neck on the screen is drawn with: a WebGL2 canvas (3D) or not. */
function neckKind(d) {
  return d.exec(`
    const gl = [...document.querySelectorAll('canvas')].some((c) => {
      const r = c.getBoundingClientRect();
      if (r.width < 200) return false;
      try { return !!c.getContext('webgl2'); } catch { return false; }
    });
    return gl ? '3d-webgl2' : 'svg-or-none';`);
}

// ---------------------------------------------------------------------------
// One Take
// ---------------------------------------------------------------------------

const player = new Player(env);

/**
 * Arm the player, press Start take, play `style`, and wait for the result.
 * Returns the result screen's text, and whether the Take ended by itself.
 */
async function playTake(d, exercise, style, label, { band = false } = {}) {
  const m = await d.waitText(/Start take, (\d+) BPM/);
  const bpm = Number(m[1]);
  const take = renderTake({
    bpm,
    notes: exercise.notes,
    barTicks: barTicks(exercise),
    exerciseBars: exercise.bars,
    bars: takeBars(exercise),
    style,
    seed: style === "sloppy" || style === "sloppier" || style === "fluffed" ? 11 : 7,
  });
  // What the scorer said about each note as it went, for the record: a
  // step in these is a stall somewhere in the audio path.
  await d.exec(`window.__e2eOnsets = [];
    window.__e2eOff?.then?.((f) => f());
    window.__e2eOff = window.__TAURI__.event.listen('score-onset', (e) => window.__e2eOnsets.push(e.payload));`);
  const playing = band ? player.playOverBand(take) : player.playOnCountIn(take);
  playing.catch(() => {}); // awaited below; a Take that never started must not crash the run
  // The app's PipeWire threads exist once its streams are open (see Env).
  env.promoteAudioThreads();
  try {
    await d.clickText(/^Start take/, { timeoutMs: 20000 });
  } catch (e) {
    const why = await d.exec(`const b = document.querySelector('[data-testid="session-big"]');
      return { phase: document.querySelector('[data-testid="session-take"]')?.dataset.phase ?? null, big: b?.innerText,
        disabled: b?.disabled, noInput: !!document.querySelector('[data-testid="session-no-input"]'),
        alert: document.querySelector('[role="alert"]')?.innerText ?? null }`).catch(() => null);
    await shot(d, `no-start-${label}`);
    throw new Error(`${e.message}; the Take screen: ${JSON.stringify(why)}`);
  }
  const heard = await playing;
  // Played out, the engine stops the Take on its last bar line by itself.
  // `take` holds 1.5 s of tail after the last bar, so the end has passed.
  let endedItself = false;
  for (let i = 0; i < 12; i++) {
    const st = await d.invoke("get_state");
    if (!st.isPlaying) {
      endedItself = true;
      break;
    }
    await sleep(500);
  }
  check(`${label}: the Take ends by itself at its last bar`, endedItself,
    endedItself ? "" : "still playing 6 s after the last bar; pressing End take (see README, known bugs)");
  if (!endedItself) await d.clickText(/^End take$/).catch(() => {});
  try {
    await d.waitText(/Go again|Move on|Next|Again, \d+ BPM|See how it went/i, 30000);
  } catch (e) {
    await shot(d, `stuck-${label}`);
    throw e;
  }
  await sleep(800);
  const text = await d.text();
  await shot(d, `result-${label}`);
  const onsets = await d.exec("return window.__e2eOnsets || []");
  info.liveOnsets ??= {};
  info.liveOnsets[label] = onsets.map((o) => (o.state === "hit" ? o.deviationMs : o.state));
  return { bpm, text, heard, endedItself };
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

/** Today's minutes, then Start: the Session's first screen. */
async function startSession(d, minutes) {
  await d.clickText(new RegExp(`^${minutes}$`));
  await d.clickText(/^Start$/);
}

/** Which Exercise the Session is on, read off its screen. */
async function exerciseHere(d) {
  const page = await d.text();
  const heading = await d
    .exec(`return document.querySelector('[data-testid="session-take"] h2')?.textContent ?? null`)
    .catch(() => null);
  const pathTitle = PATHS.map((p) => p.title).find((t) => new RegExp(`${t}, step`, "i").test(page));
  return { page, hit: exerciseOnScreen({ heading, page, pathTitle }, PATHS) };
}

/** The Takes saved since `t0`, oldest first. */
function takesSince(t0) {
  const conn = db();
  try {
    return conn
      .prepare("SELECT * FROM path_takes WHERE started_at >= ? ORDER BY started_at")
      .all(t0)
      .map((r) => ({ ...r, facts: JSON.parse(r.facts_json) }));
  } finally {
    conn.close();
  }
}
function anyTakes() {
  if (!existsSync(join(appDataDir(env.dirs), "practice.db"))) return false;
  const conn = db();
  try {
    return (conn.prepare("SELECT COUNT(*) AS n FROM path_takes").get()?.n ?? 0) > 0;
  } catch {
    return false;
  } finally {
    conn.close();
  }
}

/**
 * The first Session on a fresh profile. No Path is started yet, so the planner
 * puts the player on the first Path (Shred) and the Session is placement: one
 * easy Take at the first Exercise's first rung, then one at its pass tempo.
 * One good easy Take here; the pass-tempo Take is offered and not played, so
 * the Sessions after this one still start on the first Step.
 */
async function scenarioPlacement() {
  const d = await launchApp();
  const first = placementExercise(PATHS[0]);
  const firstRung = first.exercise.tempo.rungs[0].bpm;
  const passAt = first.exercise.tempo.passAtBpm;
  try {
    const today = await d.text();
    await shot(d, "today-first-run");
    check("Today opens for a returning player", /Today/.test(today));
    check("a fresh profile's Today plans a first Session", /YOUR FIRST SESSION/i.test(today), firstLines(today, /SESSION/i));
    await startSession(d, 5);
    const m = await d.waitText(/Start take, (\d+) BPM/, 20000);
    const { page, hit } = await exerciseHere(d);
    check(`the first Session is placement on ${first.path.title}'s first Exercise`,
      hit?.path.id === first.path.id && hit?.exercise.id === first.exercise.id && /New here\?/i.test(page),
      hit ? `${hit.path.id}/${hit.exercise.id}; ${firstLines(page, /New here|Placement/i)}` : page.slice(0, 300));
    check("placement starts at the first rung", Number(m[1]) === firstRung, `${m[1]} BPM, first rung ${firstRung}`);
    info.placement = { exercise: first.exercise.title, pathId: first.path.id, startBpm: Number(m[1]) };
    if (!hit) return;
    const t0 = Date.now() - 1000;
    const good = await playTake(d, hit.exercise, "good", "placement easy take");
    const row = takesSince(t0).at(-1);
    check("placement: the easy Take passes and is saved on the first Path",
      /PASS BAR MET/i.test(good.text) && row?.passed === 1 && row?.path_id === first.path.id,
      row ? `${row.path_id}/${row.exercise_id} at ${row.bpm}, evenness ${fmt(row.facts.measures.evenness)}` : "no row");
    check("placement: the next Take offered is at the pass tempo",
      new RegExp(`Go again, ${passAt} BPM`, "i").test(good.text), firstLines(good.text, /Go again|Next|Move on/i));
    info.placementTake = row?.facts?.measures;
    await d.clickText(/^Exit$/);
    await d.waitText(/How long have you got/, 15000);
  } finally {
    const report = await quitApp(d, "placement");
    if (report) printProbe("placement (3D neck on screen)", report);
  }
}

/**
 * The second Session: the first Path is started, so it is an ordinary focus
 * block on its first Exercise. A good Take, a sloppy one, a silent one.
 */
async function scenarioSession() {
  // Run alone on a fresh profile, the first Session would be placement.
  if (!anyTakes()) await scenarioPlacement();
  const d = await launchApp();
  try {
    await startSession(d, 5);
    const m = await d.waitText(/Start take, (\d+) BPM/, 20000);
    const { page, hit } = await exerciseHere(d);
    check("a returning 5-minute Session starts on a graded Exercise, not placement",
      !!hit && hit.exercise.grading === "graded" && !/New here\?/i.test(page),
      hit ? `${hit.path.id}/${hit.exercise.id} at ${m[1]} BPM` : page.slice(0, 300));
    if (!hit) return;
    const { exercise, path } = hit;
    const ceilingKey = `${path.id}/${exercise.id}`;
    info.session = { exercise: exercise.title, pathId: path.id, startBpm: Number(m[1]) };
    info.neck_session = await neckKind(d);

    // 1. A good take: passes, and counts toward the clean tempo.
    const good = await playTake(d, exercise, "good", "good take");
    const goodRow = takesOf(exercise.id).at(-1);
    check("good take: the result says the bar was met", /PASS BAR MET/i.test(good.text), firstLines(good.text, /BPM ·/));
    check("good take: a Take row was saved, passed", goodRow?.passed === 1 && goodRow?.caught === 1,
      goodRow ? `evenness ${fmt(goodRow.facts.measures.evenness)}, heard ${goodRow.facts.measures.heard}/${goodRow.facts.measures.expected}, extras ${goodRow.facts.measures.extras}` : "no row");
    check("good take: it counts toward the clean tempo", goodRow?.facts?.measures?.pass?.countsForCleanTempo === true,
      `heldBars ${goodRow?.facts?.measures?.pass?.heldBars}`);
    const clean = cleanTempo(ceilingKey);
    check("good take: the clean tempo is stored at the Take's tempo", clean === good.bpm, `clean tempo ${clean}, take ${good.bpm} BPM`);
    info.session.cleanBpm = clean;
    info.goodTake = goodRow?.facts?.measures;

    // 2. A sloppy take at the next tempo: fails on evenness.
    await d.clickText(/^(Go again|Again,)/);
    const sloppy = await playTake(d, exercise, "sloppy", "sloppy take");
    const sloppyRow = takesOf(exercise.id).at(-1);
    const evenCheck = sloppyRow?.facts?.measures?.pass?.checks?.find((c) => c.metric === "timingEvenness");
    const evenBar = exercise.passBars.find((b) => b.metric === "timingEvenness")?.min;
    check("sloppy take: the result names the evenness bar",
      new RegExp(`THE BAR IS ${Math.round((evenBar ?? 0) * 100)}%`, "i").test(sloppy.text) && /Evenness was/i.test(sloppy.text),
      firstLines(sloppy.text, /Evenness was|THE BAR IS/i));
    check("sloppy take: saved, caught, not passed, evenness under the bar",
      sloppyRow?.passed === 0 && sloppyRow?.caught === 1 && evenCheck && evenCheck.held === false,
      sloppyRow ? `evenness ${fmt(sloppyRow.facts.measures.evenness)}, heard ${sloppyRow.facts.measures.heard}/${sloppyRow.facts.measures.expected}` : "no row");
    check("sloppy take: the clean tempo did not move", cleanTempo(ceilingKey) === good.bpm);
    info.sloppyTake = sloppyRow?.facts?.measures;

    // 3. Silence: "didn't catch enough", and it does not count.
    await d.clickText(/^(Go again|Again,)/);
    const silent = await playTake(d, exercise, "silent", "silent take");
    const silentRow = takesOf(exercise.id).at(-1);
    check("silent take: the result says it didn't catch enough", /didn.t catch enough/i.test(silent.text), firstLines(silent.text, /catch/));
    check("silent take: saved as not caught", silentRow?.caught === 0 && silentRow?.passed === 0,
      silentRow ? `noCatchReason ${silentRow.facts.measures.noCatchReason}` : "no row");

    // 4. The first bar fluffed (80 ms of scatter), the rest clean, at the tempo
    //    the sloppy take failed: the Take's two bars of slack (owner,
    //    2026-11-17) leave the bad bar behind, and the clean bars in a row
    //    after it pass and earn the clean tempo.
    await d.clickText(/^(Go again|Again,)/);
    const fluffed = await playTake(d, exercise, "fluffed", "fluffed first bar");
    const fluffedRow = takesOf(exercise.id).at(-1);
    const fluffedPass = fluffedRow?.facts?.measures?.pass;
    const firstBar = fluffedRow?.facts?.measures?.barEvenness?.[0];
    check("fluffed first bar: the Take is the new length", fluffedPass?.finishedBars === takeBars(exercise),
      `finished ${fluffedPass?.finishedBars} of ${takeBars(exercise)} bars`);
    check("fluffed first bar: the result says the bar was met", /PASS BAR MET/i.test(fluffed.text) && fluffedRow?.passed === 1,
      firstLines(fluffed.text, /BPM ·/));
    check("fluffed first bar: it counts toward the clean tempo, from the bars after it",
      fluffedPass?.countsForCleanTempo === true && fluffedPass.heldBars >= 8 && (fluffedPass.heldFromBar ?? 0) >= 1,
      `heldBars ${fluffedPass?.heldBars} from bar ${fluffedPass?.heldFromBar}, first bar's evenness ${fmt(firstBar)}`);
    check("fluffed first bar: the clean tempo moved up to its tempo",
      cleanTempo(ceilingKey) === fluffed.bpm && fluffed.bpm > good.bpm, `clean tempo ${cleanTempo(ceilingKey)}, take ${fluffed.bpm} BPM`);
    info.fluffedTake = fluffedRow?.facts?.measures;
    // What Progress must show after a restart: the clean tempo as it now stands.
    info.session.cleanBpm = cleanTempo(ceilingKey);

    await d.clickText(/^Exit$/);
    await d.waitText(/How long have you got/, 15000);
  } finally {
    const report = await quitApp(d, "session");
    if (report) printProbe("session (3D neck on screen)", report);
  }
}

async function scenarioRelaunch() {
  const d = await launchApp();
  try {
    const today = await d.text();
    await shot(d, "today-after-relaunch");
    info.todayAfterRelaunch = firstLines(today, /WHAT'S IN IT/i, 8);
    check("after a restart, Today no longer plans a first Session", !/YOUR FIRST SESSION/i.test(today), firstLines(today, /SESSION/i));
    await d.clickText(/^Progress$/);
    await sleep(1500);
    const progress = await d.text();
    await shot(d, "progress-after-relaunch");
    info.progressAfterRelaunch = progress.slice(progress.indexOf("Progress\n"), progress.indexOf("Progress\n") + 600);
    const played = info.session ?? info.placement;
    const clean = info.session?.cleanBpm ?? info.placement?.startBpm;
    const name = played?.exercise.split(",")[0];
    check("after a restart, Progress shows the Exercise played", !!name && progress.includes(name),
      name ? firstLines(progress, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))) : "no Exercise was played");
    check("after a restart, Progress shows its clean tempo", !!clean && new RegExp(`\\b${clean}\\b`).test(progress), `${clean}`);
  } finally {
    await quitApp(d, "relaunch");
  }
}

/**
 * A second Path: subscribe to Alternate Picking from its page, then a
 * 20-minute Session. The plan holds blocks from both Paths (the new one's as
 * placement), and the Session is walked through, one good Take on each
 * Exercise it reaches, until both Paths have a Take saved in it.
 */
async function scenarioTwoPaths() {
  if (!anyTakes()) await scenarioPlacement();
  const [firstPath, secondPath] = PATHS;
  const d = await launchApp();
  try {
    await d.clickText(/^Paths$/);
    await d.clickText(new RegExp(`^${secondPath.title}`));
    await d.clickText(/^Subscribe$/);
    await sleep(500);
    await shot(d, "path-subscribed");
    await d.waitText(/Subscribed/i, 5000);
    check(`${secondPath.title}: subscribed from its page`, true);
    await d.clickText(/^Today$/);
    await d.waitText(/How long have you got/, 15000);
    await d.clickText(/^20$/);
    await sleep(800);
    const today = await d.text();
    await shot(d, "today-two-paths");
    const plan = today.slice(today.search(/What's in it/i));
    const inPlan = (path) => path.steps.some((s) => s.exercises.some((e) => plan.includes(e.title)));
    check("20 minutes: Today runs both Paths", new RegExp(firstPath.title, "i").test(today) && new RegExp(secondPath.title, "i").test(today),
      firstLines(today, /Running/i));
    check("20 minutes: the plan has a block from each Path", inPlan(firstPath) && inPlan(secondPath), firstLines(plan, /What's in it/i, 12));
    check(`20 minutes: ${secondPath.title}, new, comes in as placement`, /Placement/i.test(plan) && /New here\?/i.test(plan));

    const t0 = Date.now() - 1000;
    await d.clickText(/^Start$/);
    const played = new Set();
    for (let step = 0; step < 12 && played.size < 2; step++) {
      // A Take to play, or a timed step (the warm-up) to move past.
      const m = await d.waitText(/Start take, (\d+) BPM|Next: |See how it went/, 20000);
      if (/See how it went/.test(m[0])) break;
      if (m[0].startsWith("Next: ")) {
        await d.clickText(/^Next: /);
        continue;
      }
      const { hit } = await exerciseHere(d);
      if (!hit) {
        check("two Paths: every Exercise screen is one the suite knows", false, (await d.text()).slice(0, 300));
        break;
      }
      await playTake(d, hit.exercise, "good", `two paths: ${hit.path.id}/${hit.exercise.id}`);
      played.add(hit.path.id);
      // On: the next step, past "Go again" (placement's pass tempo, a climb).
      await d.clickText(/^Next: |^Move on$|^See how it went$/i);
    }
    const rows = takesSince(t0);
    const paths = [...new Set(rows.map((r) => r.path_id))];
    info.twoPaths = rows.map((r) => ({ path: r.path_id, exercise: r.exercise_id, bpm: r.bpm, passed: r.passed }));
    check("20 minutes: the Session saved Takes on both Paths", paths.includes(firstPath.id) && paths.includes(secondPath.id),
      JSON.stringify(info.twoPaths));
    // Advisory: this is the run's fourth launch and its longest stretch of
    // audio, and on this rig a good take late in a run picks up 20-30 ms steps
    // from the virtual sound card (see the live onsets in results.json). Whether
    // a good take passes is `session`'s check; this one is about the plan.
    const allPassed = rows.length > 0 && rows.every((r) => r.passed === 1);
    console.log(`${allPassed ? "PASS" : "WARN"}  20 minutes: every good Take passed (advisory)  (${JSON.stringify(info.twoPaths)})`);
    results.push({ name: "20 minutes: every good Take passed (advisory)", ok: true, advisory: !allPassed, detail: JSON.stringify(info.twoPaths) });
    await d.clickText(/^Exit$/).catch(() => d.clickText(/^Done$/));
  } finally {
    const report = await quitApp(d, "two-paths");
    if (report) printProbe("two Paths (3D neck on screen)", report);
  }
}

async function scenarioFourFingers() {
  const d = await launchApp();
  const title = "Four fingers, one string";
  const target = 80;
  try {
    const { exercise } = exerciseByTitle(title);
    await d.clickText(/^Paths$/);
    await d.clickText(/^Alternate Picking/);
    await d.clickText(/Even eighths on one string/);
    await d.clickIn(/Four fingers, one string/, /^Play this$/);
    let m = await d.waitText(/Start take, (\d+) BPM/, 20000);
    for (let i = 0; i < 10 && Number(m[1]) < target; i++) {
      await d.clickText(/^Faster$/);
      await sleep(400);
      m = await d.waitText(/Start take, (\d+) BPM/);
    }
    check(`${title}: the Take is set to ${target} BPM`, Number(m[1]) === target, `${m[1]} BPM`);
    info.neck_fourFingers = await neckKind(d);
    const good = await playTake(d, exercise, "good", "four fingers at 80");
    const row = takesOf(exercise.id).at(-1);
    check(`${title} at ${target}: passes`, /PASS BAR MET/i.test(good.text) && row?.passed === 1,
      row ? `evenness ${fmt(row.facts.measures.evenness)}, heard ${row.facts.measures.heard}/${row.facts.measures.expected}, extras ${row.facts.measures.extras}` : "no row");
    const clean = cleanTempo(`alternate-picking/${exercise.id}`);
    check(`${title} at ${target}: clean tempo ${target} stored`, clean === target, `clean tempo ${clean}`);
    info.fourFingers = row?.facts?.measures;
    await d.clickText(/^Exit$/);
  } finally {
    const report = await quitApp(d, "four-fingers");
    if (report) printProbe("four fingers (3D neck on screen)", report);
  }
}

/**
 * A jam-backed Take: Blues and Pentatonics, "A on every downbeat", a Texas
 * shuffle with drums and bass under it (src/session/takeBand.ts). The click
 * stops after the count-in, so the player keeps time with the band. Graded on
 * notes heard, extras, evenness and note identity, with the band not graded.
 */
async function scenarioBluesBand() {
  const bleed = opt("--bleed", null);
  let loopback = null;
  if (bleed !== null) {
    // Speakers into a microphone: the app's output, back into its input.
    const r = spawnSync("pactl", ["load-module", "module-loopback", "source=yames_out.monitor", "sink=guitar", "latency_msec=5"], {
      env: env.env(),
      encoding: "utf8",
    });
    loopback = r.stdout.trim();
    const pct = Math.round(100 * 10 ** (Number(bleed) / 20));
    // The loopback's own sink input carries the level.
    const inputs = spawnSync("pactl", ["list", "short", "sink-inputs"], { env: env.env(), encoding: "utf8" }).stdout;
    for (const line of inputs.split("\n")) {
      const [id, , module] = line.split("\t");
      if (module === loopback) spawnSync("pactl", ["set-sink-input-volume", id, `${pct}%`], { env: env.env() });
    }
    info.bluesBandBleed = { dB: Number(bleed), percent: pct, module: loopback };
  }
  let d = await launchApp();
  const title = "A on every downbeat";
  const path = loadPath("blues-pentatonics");
  const key = `blues-pentatonics/${"landing.root-on-one"}`;
  try {
    const { exercise } = exerciseByTitle(title, path);
    await d.clickText(/^Paths$/);
    await d.clickText(/^Blues and Pentatonics/);
    await d.clickText(/Chord tones: A7, D7 and E7/);
    await d.clickIn(/A on every downbeat/, /^Play this$/);
    await d.waitText(/Start take, (\d+) BPM/, 20000);
    const banded = await d.exec(`return document.querySelector('[data-testid="session-band"] input')?.value ?? null`);
    check(`${title}: the Take shows its band`, banded !== null);
    // The virtual sound card is not an interface the app knows, so it is a
    // microphone to the app, and a graded Take on a microphone starts with the
    // band off (src/session/takeBand.ts bandVolumeFor). The player has
    // headphones on, and turns it up.
    check(`${title}: on a microphone the band starts off`, banded === "0", `slider at ${banded}`);
    await setBand(d, "0.8");
    info.bluesBand = { takes: [] };
    const row = () => takesOf(exercise.id).at(-1);
    const summary = (r) =>
      r ? `passed ${r.passed}, evenness ${fmt(r.facts.measures.evenness)}, heard ${r.facts.measures.heard}/${r.facts.measures.expected}, extras ${r.facts.measures.extras}, notes ${fmt(r.facts.measures.noteIdentity)}` : "no row";
    const tag = bleed !== null ? ` (bleed ${bleed} dB)` : "";

    const good = await playTake(d, exercise, "good", `blues good${tag}`, { band: true });
    const goodRow = row();
    info.bluesBand.takes.push({ style: "good", bpm: good.bpm, heard: good.heard, measures: goodRow?.facts?.measures });
    check(`${title}${tag}: a good take over the band passes`, /PASS BAR MET/i.test(good.text) && goodRow?.passed === 1, summary(goodRow));
    check(`${title}${tag}: the player kept time with the band (beats it heard from the drums)`, (good.heard?.beatsHeardFromTheBand ?? 0) >= 16,
      `${good.heard?.beatsHeardFromTheBand} of ${takeBars(exercise) * 4}`);
    check(`${title}${tag}: clean tempo stored`, cleanTempo(key) === good.bpm, `clean tempo ${cleanTempo(key)}`);

    await d.clickText(/^(Go again|Again,)/);
    const sloppy = await playTake(d, exercise, "sloppy", `blues sloppy${tag}`, { band: true });
    const sloppyRow = row();
    info.bluesBand.takes.push({ style: "sloppy", bpm: sloppy.bpm, measures: sloppyRow?.facts?.measures });
    // Recorded, not checked: 35 ms of scatter is inside this Exercise's own
    // evenness bar (0.6) at 70 BPM, band or no band (the control below).
    console.log(`      sloppy (35 ms) over the band: ${summary(sloppyRow)}`);

    await d.clickText(/^(Go again|Again,)/);
    const sloppier = await playTake(d, exercise, "sloppier", `blues sloppier${tag}`, { band: true });
    const sloppierRow = row();
    info.bluesBand.takes.push({ style: "sloppier", bpm: sloppier.bpm, measures: sloppierRow?.facts?.measures });
    check(`${title}${tag}: a sloppy (80 ms) take over the band does not pass`, sloppierRow?.passed === 0 && !/PASS BAR MET/i.test(sloppier.text), summary(sloppierRow));

    await d.clickText(/^(Go again|Again,)/);
    const wrong = await playTake(d, exercise, "wrong", `blues wrong notes${tag}`, { band: true });
    const wrongRow = row();
    info.bluesBand.takes.push({ style: "wrong", bpm: wrong.bpm, measures: wrongRow?.facts?.measures });
    check(`${title}${tag}: wrong notes over the band do not pass`, wrongRow?.passed === 0 && !/PASS BAR MET/i.test(wrong.text), summary(wrongRow));

    // The control: the same Takes with the band turned all the way down (the
    // click comes back), so a difference above is the band's and not the take's.
    // A fresh Session: "Play this" is a five-minute one, and seven Takes outrun
    // it. In a fresh app: a Session started again after Exit in the same run
    // could not hear the input (see the report of 2026-11-16, B1).
    await d.clickText(/^Exit$/);
    const first = await quitApp(d, "blues-band");
    if (first) printProbe("blues over the band", first);
    d = await launchApp();
    await d.clickText(/^Paths$/);
    await d.clickText(/^Blues and Pentatonics/);
    await d.clickText(/Chord tones: A7, D7 and E7/);
    await d.clickIn(/A on every downbeat/, /^Play this$/);
    // At the tempo of the Takes above, so the two sets compare.
    let m = await d.waitText(/Start take, (\d+) BPM/, 20000);
    for (let i = 0; i < 10 && Number(m[1]) > good.bpm; i++) {
      await d.clickText(/^Slower$/);
      await sleep(400);
      m = await d.waitText(/Start take, (\d+) BPM/);
    }
    await setBand(d, "0");

    for (const [i, style] of ["good", "sloppy", "sloppier"].entries()) {
      if (i > 0) await d.clickText(/^(Go again|Again,)/);
      const r = await playTake(d, exercise, style, `blues ${style}, band at 0${tag}`, { band: true });
      const rr = row();
      info.bluesBand.takes.push({ style, band: 0, bpm: r.bpm, measures: rr?.facts?.measures });
      console.log(`      control, band at 0, ${style}: ${summary(rr)}`);
    }
    await d.clickText(/^Exit$/);
  } finally {
    const report = await quitApp(d, "blues-band-control");
    if (report) printProbe("blues, band at 0 (the control)", report);
    if (loopback) spawnSync("pactl", ["unload-module", loopback], { env: env.env() });
  }
}

/** A good take on whatever the Take screen holds: it must be heard and pass. */
async function goodTakeHeard(d, label) {
  await d.waitText(/Start take, (\d+) BPM/, 20000);
  // The input starts once the last Session's end has finished (stop, report,
  // save): a few seconds on a busy machine. How long, for the record; a
  // minute is "never".
  const t0 = Date.now();
  const deaf = () => d.exec(`return !!document.querySelector('[data-testid="session-no-input"]')`);
  const noInput = await deaf();
  while ((await deaf()) && Date.now() - t0 < 60000) await sleep(250);
  const waitedS = ((Date.now() - t0) / 1000).toFixed(1);
  if (await deaf()) {
    const state = await d.invoke("get_evaluation_state").catch((e) => `error ${e.message}`);
    check(`${label}: the input came on`, false, `still "can't hear" after ${waitedS} s; get_evaluation_state ${state}`);
    await shot(d, `deaf-${label}`);
    return;
  }
  const exercise = (await exerciseHere(d)).hit?.exercise ?? null;
  if (!exercise) {
    check(`${label}: a shipped Exercise on the Take screen`, false, (await d.text()).slice(0, 300));
    return;
  }
  const r = await playTake(d, exercise, "good", label);
  const row = takesOf(exercise.id).at(-1);
  check(`${label}: the Take was heard and passes`, /PASS BAR MET/i.test(r.text) && row?.passed === 1,
    `${exercise.title} at ${r.bpm}${noInput ? `, input on after ${waitedS} s` : ""}; ` +
      (row ? `heard ${row.facts.measures.heard}/${row.facts.measures.expected}, passed ${row.passed}` : "no row"));
}

/**
 * B1 (2026-11-16): a Session started again in the same run could not hear the
 * guitar. Ending the coach session (Exit) stops the input; a start that came
 * before that stop had finished did nothing, and the stop then landed after
 * it. Every door out and back in, each followed by a good take that must pass.
 */
async function scenarioRestart() {
  const d = await launchApp();
  const backToToday = async () => d.waitText(/How long have you got/, 15000);
  try {
    // 1. Today, Start, Exit at once, Start at once.
    await d.clickText(/^5$/);
    await d.clickText(/^Start$/);
    await d.waitText(/Start take, (\d+) BPM/, 20000);
    await d.clickText(/^Exit$/);
    await backToToday();
    await d.clickText(/^Start$/);
    await goodTakeHeard(d, "restart: Start, Exit, Start");
    await d.clickText(/^Exit$/);
    await backToToday();

    // 2. Exit, then a Step's "Play this".
    await d.clickText(/^Paths$/);
    await d.clickText(/^Alternate Picking/);
    await d.clickText(/Even eighths on one string/);
    await d.clickIn(/Four fingers, one string/, /^Play this$/);
    await goodTakeHeard(d, "restart: Exit, then Play this");

    // 3. Leave by a tab hotkey (Metronome) mid-Session, come back by Today's.
    const key = (k, code) => d.exec(`document.dispatchEvent(new KeyboardEvent('keydown',
      { key: arguments[0], code: arguments[1], ctrlKey: true, bubbles: true, cancelable: true }))`, [k, code]);
    await key("1", "Digit1");
    await sleep(1500);
    check("restart: the Metronome hotkey leaves the Session", !/Start take|End take/.test(await d.text()));
    await key("0", "Digit0");
    await backToToday();
    await d.clickText(/^Start$/);
    await goodTakeHeard(d, "restart: a tab hotkey out and back");

    // 4. Settings mid-Session (it keeps the Session) and back: still heard.
    await d.clickText(/^(Go again|Again,)/);
    await d.waitText(/Start take, (\d+) BPM/, 20000);
    await key(",", "Comma");
    await sleep(1500);
    await key(",", "Comma");
    await goodTakeHeard(d, "restart: Settings open and closed mid-Session");

    // 5. The Session screen has no rail: Tools is reached after Exit. Open a
    // tool, play nothing, come back to Today and start again.
    await d.clickText(/^Exit$/);
    await backToToday();
    await d.clickText(/^Tools$/);
    await sleep(800);
    await d.clickText(/^Metronome$/).catch(() => {});
    await sleep(1500);
    check("restart: Tools opens from Today", !/Start take|End take/.test(await d.text()));
    await key("0", "Digit0");
    await backToToday();
    await d.clickText(/^Start$/);
    await goodTakeHeard(d, "restart: Tools out and back");
    await d.clickText(/^Exit$/);
  } finally {
    await quitApp(d, "restart");
  }
}

/**
 * B2 (2026-11-16): a wrong-notes Take passed because the right-notes pass came
 * back `notRun` (the second close of a Take threw away the pass the first had
 * started). On a clean, direct signal with no band, right notes must be
 * measured on every Take, and a wrong-notes one must fail on them.
 */
async function scenarioWrongNotes() {
  const d = await launchApp();
  const title = "A minor up one string";
  try {
    const { exercise } = exerciseByTitle(title);
    await d.clickText(/^Paths$/);
    await d.clickText(/^Alternate Picking/);
    await d.clickText(/Even eighths on one string/);
    await d.clickIn(/A minor up one string/, /^Play this$/);
    info.wrongNotes = [];
    const summary = (r) => r
      ? `passed ${r.passed}, notes ${fmt(r.facts.measures.noteIdentity)} (${r.facts.measures.pass?.notes?.status}), heard ${r.facts.measures.heard}/${r.facts.measures.expected}`
      : "no row";
    for (const [i, style] of ["good", "wrong", "wrong", "wrong"].entries()) {
      if (i > 0) await d.clickText(/^(Go again|Again,)/);
      const r = await playTake(d, exercise, style, `${title}, ${style} ${i}`);
      const row = takesOf(exercise.id).at(-1);
      const m = row?.facts?.measures;
      info.wrongNotes.push({ style, bpm: r.bpm, measures: m });
      check(`${title}, ${style} take ${i}: right notes were measured`,
        m?.pass?.notes?.status === "measured" && typeof m?.noteIdentity === "number", summary(row));
      if (style === "good") {
        check(`${title}, good take: passes`, row?.passed === 1 && /PASS BAR MET/i.test(r.text), summary(row));
      } else {
        check(`${title}, wrong notes ${i}: does not pass, on right notes`,
          row?.passed === 0 && !/PASS BAR MET/i.test(r.text) && m?.noteIdentity !== null && m.noteIdentity < 0.9, summary(row));
      }
    }
    await d.clickText(/^Exit$/);
  } finally {
    await quitApp(d, "wrong-notes");
  }
}

/** Move the Take screen's band slider, as a hand on it would. */
async function setBand(d, value) {
  await d.exec(`const el = document.querySelector('[data-testid="session-band"] input');
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(el, arguments[0]); el.dispatchEvent(new Event('input', { bubbles: true }));`, [value]);
  await sleep(300);
}

/** What WebKit itself says about its rendering, from webkit://gpu. */
async function scenarioGpuInfo() {
  const d = await launchApp();
  try {
    // WebKitGTK masks WEBGL_debug_renderer_info ("Apple GPU"), so the page's
    // own view of the renderer is recorded but cannot be trusted.
    info.webglAsThePageSeesIt = await d.exec(`
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return null;
      const x = gl.getExtension('WEBGL_debug_renderer_info');
      return { version: gl.getParameter(gl.VERSION), renderer: x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) };`);
    await d.call("POST", d.s("/url"), { url: "webkit://gpu" });
    await sleep(2000);
    const html = await d.exec("return document.documentElement.outerHTML");
    const m = html.match(/JSON\.stringify\((\{.*?\}), null, 4\)/s);
    info.webkitGpu = m ? JSON.parse(m[1])["Hardware Acceleration Information"] : null;
    info.glLibraries = glLibraries();
    console.log(`webkit://gpu: ${JSON.stringify(info.webkitGpu)}`);
    console.log(`the page's WebGL2 renderer string: ${JSON.stringify(info.webglAsThePageSeesIt)}`);
  } finally {
    await d.quit();
  }
}

/** The GL implementations mapped into the app's processes (ours only). */
function glLibraries() {
  const seen = {};
  for (const { pid, comm } of ourProcesses()) {
    try {
      const maps = readFileSync(`/proc/${pid}/maps`, "utf8");
      const libs = [...new Set(maps.match(/lib(gallium|nvidia-eglcore|nvidia-glcore|EGL_nvidia|EGL_mesa|GLX_nvidia|GLX_mesa)[^\s/]*/g) ?? [])];
      if (libs.length) seen[comm] = libs;
    } catch {
      /* gone */
    }
  }
  return seen;
}

function ourProcesses() {
  const out = [];
  for (const pid of readdirSync("/proc")) {
    if (!/^\d+$/.test(pid)) continue;
    try {
      if (!readFileSync(`/proc/${pid}/environ`, "utf8").includes(`XDG_RUNTIME_DIR=${env.dirs.run}`)) continue;
      out.push({ pid, comm: readFileSync(`/proc/${pid}/comm`, "utf8").trim() });
    } catch {
      /* gone */
    }
  }
  return out;
}

/** CPU seconds used so far by each of our processes, by name. */
function cpuByName() {
  const tick = 100; // USER_HZ
  const out = {};
  for (const { pid, comm } of ourProcesses()) {
    try {
      const f = readFileSync(`/proc/${pid}/stat`, "utf8").split(") ")[1].split(" ");
      out[comm] = (out[comm] ?? 0) + (Number(f[11]) + Number(f[12])) / tick;
    } catch {
      /* gone */
    }
  }
  return out;
}

/**
 * The click with the neck drawing: Four fingers at 80 BPM, several Takes back
 * to back, the in-app probe armed. Records which neck was drawn, what the
 * webview cost in CPU while it played, and the probe's four numbers.
 */
async function scenarioNeck() {
  const takes = Number(opt("--neck-takes", "3"));
  const d = await launchApp();
  try {
    const { exercise } = exerciseByTitle("Four fingers, one string");
    await d.clickText(/^Paths$/);
    await d.clickText(/^Alternate Picking/);
    await d.clickText(/Even eighths on one string/);
    await d.clickIn(/Four fingers, one string/, /^Play this$/);
    await d.waitText(/Start take, (\d+) BPM/, 20000);
    info.neck = { kind: await neckKind(d), takes: [] };
    const before = cpuByName();
    const t0 = Date.now();
    for (let i = 0; i < takes; i++) {
      if (i > 0) await d.clickText(/^(Go again|Again,)/);
      const r = await playTake(d, exercise, "good", `neck take ${i + 1}`);
      info.neck.takes.push({ bpm: r.bpm, passed: /PASS BAR MET/i.test(r.text) });
    }
    const wall = (Date.now() - t0) / 1000;
    const after = cpuByName();
    info.neck.cpuCoresWhilePlaying = Object.fromEntries(
      Object.keys(after).map((k) => [k, Number(((after[k] - (before[k] ?? 0)) / wall).toFixed(2))]).filter(([, v]) => v > 0.01),
    );
    info.neck.glLibraries = glLibraries();
    // Which of our processes the NVIDIA driver has a graphics context for.
    const smi = spawnSync("nvidia-smi", ["--query-compute-apps=pid,process_name", "--format=csv,noheader"], { encoding: "utf8" });
    const pids = new Set(ourProcesses().map((p) => p.pid));
    const gfx = spawnSync("nvidia-smi", [], { encoding: "utf8" }).stdout ?? "";
    info.neck.onTheGpu = gfx.split("\n").filter((l) => [...pids].some((p) => new RegExp(`\\b${p}\\b`).test(l))).map((l) => l.trim());
    void smi;
    console.log(`neck: ${info.neck.kind}; CPU cores while playing: ${JSON.stringify(info.neck.cpuCoresWhilePlaying)}`);
    console.log(`neck: processes of ours nvidia-smi lists: ${JSON.stringify(info.neck.onTheGpu)}`);
    check("neck: every Take passed while the neck drew", info.neck.takes.every((t) => t.passed), JSON.stringify(info.neck.takes));
    await d.clickText(/^Exit$/);
  } finally {
    const report = await quitApp(d, "neck");
    if (report) {
      printProbe(`with the neck (${info.neck?.kind})`, report);
      gate("in-app, neck drawing", report);
    }
  }
}

/** The headless probe, in the same audio world, for comparison. */
async function scenarioBaseline() {
  const seconds = opt("--baseline-seconds", "60");
  const bin = join(targetDir, "release", "click-jitter-probe");
  if (!existsSync(bin)) {
    check("headless baseline ran", false, `no ${bin}; build it with cargo build --release --bin click-jitter-probe`);
    return;
  }
  env.promoteAudioThreads();
  const r = spawnSync(bin, ["--no-llm", "--json", "--seconds", seconds], { env: env.env(), encoding: "utf8" });
  const line = (r.stdout ?? "").split("\n").find((l) => l.startsWith("JSON "));
  if (!line) {
    check("headless baseline ran", false, (r.stderr ?? "").slice(-400));
    return;
  }
  const j = JSON.parse(line.slice(5));
  info.baseline = j;
  writeFileSync(join(out, "baseline.txt"), r.stdout);
  console.log(
    `probe headless baseline: p99 jitter ${j.p99_ms} ms (max ${j.max_ms}), missed beats ${j.missed_beats}, ` +
      `callback allocs/frees ${j.callback_allocs}/${j.callback_frees}, dropped notifications ${j.dropped_notifications}; ` +
      `${j.callbacks} callbacks, ${j.frames} frames at ${j.sample_rate} Hz`,
  );
  gate("headless baseline", { jitter_p99_ms: j.p99_ms, missed_beats: j.missed_beats, callback_allocs: j.callback_allocs, callback_frees: j.callback_frees, dropped_notifications: j.dropped_notifications });
}

/** The audio-safety gate's four numbers, as checks. p99 is advisory (AGENTS.md). */
function gate(label, r) {
  check(`${label}: missed beats = 0`, r.missed_beats === 0, `${r.missed_beats}`);
  check(`${label}: callback allocations and frees = 0`, r.callback_allocs === 0 && r.callback_frees === 0, `${r.callback_allocs}/${r.callback_frees}`);
  check(`${label}: dropped notifications = 0`, r.dropped_notifications === 0, `${r.dropped_notifications}`);
  const ok = r.jitter_p99_ms < 1;
  console.log(`${ok ? "PASS" : "WARN"}  ${label}: p99 callback jitter < 1 ms (advisory)  (${r.jitter_p99_ms} ms)`);
  results.push({ name: `${label}: p99 callback jitter < 1 ms (advisory)`, ok: true, advisory: !ok, detail: `${r.jitter_p99_ms} ms` });
}

// ---------------------------------------------------------------------------

function fmt(x) {
  return typeof x === "number" ? x.toFixed(3) : String(x);
}
function firstLines(text, re, n = 3) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const i = lines.findIndex((l) => re.test(l));
  return i < 0 ? "" : lines.slice(i, i + n).join(" / ");
}
function printProbe(label, r) {
  console.log(
    `probe ${label}: p99 jitter ${r.jitter_p99_ms} ms (max ${r.jitter_max_ms}), missed beats ${r.missed_beats}, ` +
      `callback allocs/frees ${r.callback_allocs}/${r.callback_frees}, dropped notifications ${r.dropped_notifications}; ` +
      `${r.callbacks} callbacks in ${r.runs} runs, ${r.buffer_ms} ms buffers at ${r.sample_rate} Hz`,
  );
}

let exitCode = 0;
try {
  await env.up();
  seedSettings(env.dirs);
  info.rtThreads = env.rtThreads;
  if (!env.rtThreads) console.warn("PipeWire is not real-time (no passwordless sudo): a busy machine will glitch the audio");
  info.calibration = await player.calibrate();
  console.log(`player calibrated: ${fmt(info.calibration.offsetMs)} ms write-to-capture`);
  info.loadAtStart = readFileSync("/proc/loadavg", "utf8").trim();
  const load1 = Number(info.loadAtStart.split(" ")[0]);
  const cores = (await import("node:os")).availableParallelism();
  if (load1 > cores / 2) {
    console.warn(
      `WARNING: load average ${load1} on ${cores} cores. The app's audio threads run at normal priority on ` +
        "Linux, and on a machine this busy its input and output stall: takes come out garbled and the probe's " +
        "numbers describe the machine, not the app. Re-run on a quieter machine before believing a failure.",
    );
  }
  info.appEnv = appEnv;
  if (scenarios.has("gpu-info")) await scenarioGpuInfo();
  if (scenarios.has("placement")) await scenarioPlacement();
  if (scenarios.has("session")) await scenarioSession();
  if (scenarios.has("relaunch")) await scenarioRelaunch();
  if (scenarios.has("two-paths")) await scenarioTwoPaths();
  if (scenarios.has("four-fingers")) await scenarioFourFingers();
  if (scenarios.has("blues-band")) await scenarioBluesBand();
  if (scenarios.has("restart")) await scenarioRestart();
  if (scenarios.has("wrong-notes")) await scenarioWrongNotes();
  if (scenarios.has("neck")) await scenarioNeck();
  if (scenarios.has("baseline")) await scenarioBaseline();
  info.loadAtEnd = readFileSync("/proc/loadavg", "utf8").trim();
} catch (e) {
  check("the run finished", false, e.message.split("\n").slice(0, 6).join(" | "));
  exitCode = 1;
} finally {
  if (driverProc) driverProc.kill("SIGTERM");
  await env.down().catch(() => {});
  if (stopX) await stopX();
  if (!flag("--keep")) rmSync(env.dirs.root, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
writeFileSync(join(out, "results.json"), JSON.stringify({ results, info }, null, 2));
console.log(`load average at start ${info.loadAtStart?.split(" ").slice(0, 3).join(" ")}, at end ${info.loadAtEnd?.split(" ").slice(0, 3).join(" ")}`);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed. Results, screenshots and probe reports: ${out}`);
process.exit(failed.length || exitCode ? 1 : 0);
