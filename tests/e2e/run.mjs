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
import { barTicks, exerciseByTitle, takeBars } from "./lib/exercises.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..", "..");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  --scenarios <list>  comma list of: session,relaunch,four-fingers,gpu-info,neck,baseline
                      (default: session,relaunch,four-fingers,gpu-info)
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
const scenarios = new Set(opt("--scenarios", "session,relaunch,four-fingers,gpu-info").split(","));
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
async function playTake(d, exercise, style, label) {
  const m = await d.waitText(/Start take, (\d+) BPM/);
  const bpm = Number(m[1]);
  const take = renderTake({
    bpm,
    notes: exercise.notes,
    barTicks: barTicks(exercise),
    exerciseBars: exercise.bars,
    bars: takeBars(exercise),
    style,
    seed: style === "sloppy" ? 11 : 7,
  });
  // What the scorer said about each note as it went, for the record: a
  // step in these is a stall somewhere in the audio path.
  await d.exec(`window.__e2eOnsets = [];
    window.__e2eOff?.then?.((f) => f());
    window.__e2eOff = window.__TAURI__.event.listen('score-onset', (e) => window.__e2eOnsets.push(e.payload));`);
  const playing = player.playOnCountIn(take);
  // The app's PipeWire threads exist once its streams are open (see Env).
  env.promoteAudioThreads();
  await d.clickText(/^Start take/);
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
  await d.waitText(/Go again|Move on|Next/i, 30000);
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

async function scenarioSession() {
  const d = await launchApp();
  try {
    await shot(d, "today-first-run");
    check("Today opens for a returning player", /Today/.test(await d.text()));
    await d.clickText(/^5$/);
    await d.clickText(/^Start$/);
    const m = await d.waitText(/Start take, (\d+) BPM/, 20000);
    // The first Exercise the plan puts in front of a new player.
    const page = await d.text();
    const title = ["Open A, pick hand alone", "Four fingers, one string"].find((t) => page.includes(t));
    check("a 5-minute Session starts on a graded Exercise", !!title, title ?? page.slice(0, 300));
    if (!title) return;
    const { exercise } = exerciseByTitle(title);
    info.session = { exercise: title, startBpm: Number(m[1]) };
    info.neck_session = await neckKind(d);

    // 1. A good take: passes, and counts toward the clean tempo.
    const good = await playTake(d, exercise, "good", "good take");
    const goodRow = takesOf(exercise.id).at(-1);
    check("good take: the result says the bar was met", /PASS BAR MET/i.test(good.text), firstLines(good.text, /BPM ·/));
    check("good take: a Take row was saved, passed", goodRow?.passed === 1 && goodRow?.caught === 1,
      goodRow ? `evenness ${fmt(goodRow.facts.measures.evenness)}, heard ${goodRow.facts.measures.heard}/${goodRow.facts.measures.expected}, extras ${goodRow.facts.measures.extras}` : "no row");
    check("good take: it counts toward the clean tempo", goodRow?.facts?.measures?.pass?.countsForCleanTempo === true,
      `heldBars ${goodRow?.facts?.measures?.pass?.heldBars}`);
    const clean = cleanTempo(`alternate-picking/${exercise.id}`);
    check("good take: the clean tempo is stored at the Take's tempo", clean === good.bpm, `clean tempo ${clean}, take ${good.bpm} BPM`);
    info.goodTake = goodRow?.facts?.measures;

    // 2. A sloppy take at the next tempo: fails on evenness.
    await d.clickText(/^Go again/);
    const sloppy = await playTake(d, exercise, "sloppy", "sloppy take");
    const sloppyRow = takesOf(exercise.id).at(-1);
    const evenCheck = sloppyRow?.facts?.measures?.pass?.checks?.find((c) => c.metric === "timingEvenness");
    check("sloppy take: the result names the evenness bar", /THE BAR IS 85%/i.test(sloppy.text) && /Evenness was/i.test(sloppy.text),
      firstLines(sloppy.text, /Evenness was/));
    check("sloppy take: saved, caught, not passed, evenness under the bar",
      sloppyRow?.passed === 0 && sloppyRow?.caught === 1 && evenCheck && evenCheck.held === false,
      sloppyRow ? `evenness ${fmt(sloppyRow.facts.measures.evenness)}, heard ${sloppyRow.facts.measures.heard}/${sloppyRow.facts.measures.expected}` : "no row");
    check("sloppy take: the clean tempo did not move", cleanTempo(`alternate-picking/${exercise.id}`) === good.bpm);
    info.sloppyTake = sloppyRow?.facts?.measures;

    // 3. Silence: "didn't catch enough", and it does not count.
    await d.clickText(/^Go again/);
    const silent = await playTake(d, exercise, "silent", "silent take");
    const silentRow = takesOf(exercise.id).at(-1);
    check("silent take: the result says it didn't catch enough", /didn.t catch enough/i.test(silent.text), firstLines(silent.text, /catch/));
    check("silent take: saved as not caught", silentRow?.caught === 0 && silentRow?.passed === 0,
      silentRow ? `noCatchReason ${silentRow.facts.measures.noCatchReason}` : "no row");

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
    const startBpm = info.session?.startBpm;
    check("after a restart, Progress shows the Exercise played", info.session && progress.includes(info.session.exercise.split(",")[0]),
      firstLines(progress, /Open A|Four fingers/));
    check("after a restart, Progress shows its clean tempo", startBpm && new RegExp(`\\b${startBpm}\\b`).test(progress));
  } finally {
    await quitApp(d, "relaunch");
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
      if (i > 0) await d.clickText(/^Go again/);
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
  if (scenarios.has("session")) await scenarioSession();
  if (scenarios.has("relaunch")) await scenarioRelaunch();
  if (scenarios.has("four-fingers")) await scenarioFourFingers();
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
