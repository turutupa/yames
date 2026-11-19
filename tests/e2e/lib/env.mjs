// The world the real app runs in for the e2e: a temp profile, an X server,
// a private session bus and a private PipeWire with two null sinks.
//
//   yames_out   the app's output (default sink). Its monitor is what the
//               player listens to for the count-in, and what a human would
//               have heard.
//   guitar      the "guitar". The player writes the take into it, and its
//               monitor is the default source, so the app's input is it.
//
// Nothing here touches the owner's profile, audio server or display: every
// path is under one mkdtemp, and every process is ours and killed at the end.
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync, existsSync, chmodSync, createWriteStream, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const APP_ID = "com.yames.metronome";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function makeProfile(root) {
  const dirs = {
    root,
    home: join(root, "home"),
    config: join(root, "config"),
    data: join(root, "data"),
    cache: join(root, "cache"),
    run: join(root, "run"),
    logs: join(root, "logs"),
  };
  for (const d of Object.values(dirs)) mkdirSync(d, { recursive: true });
  chmodSync(dirs.run, 0o700);
  return dirs;
}

/** Where the app keeps its store and its SQLite file, under this profile. */
export function appDataDir(dirs) {
  return join(dirs.data, APP_ID);
}

/**
 * A returning player who finished setup, so the app opens on Today rather
 * than the first-run wizard (M1 owns the wizard; this suite is about the
 * Session). Only the keys `useOnboarding` reads to decide it is not a first
 * run, plus the instrument.
 */
export function seedSettings(dirs, extra = {}) {
  const dir = appDataDir(dirs);
  mkdirSync(dir, { recursive: true });
  const settings = {
    "onboarding.version": 1,
    "onboarding.completedAt": "2026-11-01T00:00:00.000Z",
    "onboarding.chipDismissed": 99,
    instrument: "guitar",
    ...extra,
  };
  writeFileSync(join(dir, "settings.json"), JSON.stringify(settings, null, 2));
}

/**
 * Kill every process of ours whose XDG_RUNTIME_DIR is under `root`: the
 * daemons, the app and its WebKit children. Run at the end, and at the start
 * in case a previous run was killed before it could clean up.
 */
export function reap(root) {
  const mine = process.getuid?.();
  let killed = 0;
  for (const pid of readdirSync("/proc")) {
    if (!/^\d+$/.test(pid) || Number(pid) === process.pid) continue;
    try {
      if (mine !== undefined && readFileSync(`/proc/${pid}/status`, "utf8").match(/^Uid:\s+(\d+)/m)?.[1] !== String(mine)) continue;
      const env = readFileSync(`/proc/${pid}/environ`, "utf8").split("\0");
      const run = env.find((e) => e.startsWith("XDG_RUNTIME_DIR="))?.slice(16);
      if (run && run.startsWith(root)) {
        process.kill(Number(pid), "SIGKILL");
        killed++;
      }
    } catch {
      /* gone, or not ours */
    }
  }
  return killed;
}

/**
 * The session bus activates gvfsd-fuse and the document portal, and both
 * mount a FUSE file system under XDG_RUNTIME_DIR. Killed, they leave the
 * mount behind and the profile cannot be deleted. Unmount what is ours.
 */
export function unmountUnder(root) {
  let mounts = "";
  try {
    mounts = readFileSync("/proc/mounts", "utf8");
  } catch {
    return;
  }
  for (const line of mounts.split("\n")) {
    const point = line.split(" ")[1];
    if (!point || !point.startsWith(root)) continue;
    for (const [cmd, args] of [["fusermount3", ["-u", "-z", point]], ["fusermount", ["-u", "-z", point]]]) {
      if (spawnSync(cmd, args).status === 0) break;
    }
  }
}

/**
 * A lock whose server is gone: Xvfb killed with its run (a crash, a timeout,
 * a worker stopped mid-run) leaves `/tmp/.X<n>-lock` and its socket behind,
 * and fifty of those used up the whole range and stopped every later run
 * ("no free X display", 2026-11-18). Only ours, and only when the pid in the
 * lock is not alive.
 */
function clearStaleDisplay(n) {
  const lock = `/tmp/.X${n}-lock`;
  try {
    const st = statSync(lock);
    if (typeof process.getuid === "function" && st.uid !== process.getuid()) return false;
    const pid = Number(readFileSync(lock, "utf8").trim());
    if (pid > 0) {
      try {
        process.kill(pid, 0);
        return false; // alive
      } catch (e) {
        if (e.code === "EPERM") return false; // alive, someone else's
      }
    }
    rmSync(lock, { force: true });
    rmSync(`/tmp/.X11-unix/X${n}`, { force: true });
    return true;
  } catch {
    return false;
  }
}

/** The first X display number with no server on it. */
export function freeDisplay(from = 90) {
  for (let n = from; n < from + 50; n++) {
    if (existsSync(`/tmp/.X${n}-lock`)) clearStaleDisplay(n);
    if (!existsSync(`/tmp/.X11-unix/X${n}`) && !existsSync(`/tmp/.X${n}-lock`)) return n;
  }
  throw new Error("no free X display");
}

/**
 * An X server on the NVIDIA GPU, with no monitor: what a desktop would give
 * WebKit, without a desktop. Needs passwordless sudo (Xorg on a real GPU runs
 * as root) and the NVIDIA Xorg driver. Returns a stop function.
 */
export async function startNvidiaX(display, dir) {
  const bus = spawnSync("nvidia-smi", ["--query-gpu=pci.bus_id", "--format=csv,noheader"], { encoding: "utf8" }).stdout?.trim().split("\n")[0];
  const m = bus?.match(/^([0-9A-Fa-f]+):([0-9A-Fa-f]+):([0-9A-Fa-f]+)\.(\d+)$/);
  if (!m) throw new Error(`no NVIDIA GPU (nvidia-smi said ${JSON.stringify(bus)})`);
  const [, domain, b, dev, fn] = m.map((x, i) => (i === 0 ? x : parseInt(x, 16)));
  const conf = join(dir, "xorg-nvidia.conf");
  const modules = ["/usr/lib/aarch64-linux-gnu/nvidia/xorg", "/usr/lib/x86_64-linux-gnu/nvidia/xorg", "/usr/lib/xorg/modules"].filter(existsSync);
  writeFileSync(conf, `Section "ServerLayout"
    Identifier "e2e"
    Screen 0 "gpu"
EndSection
Section "Files"
${modules.map((p) => `    ModulePath "${p}"`).join("\n")}
EndSection
Section "ServerFlags"
    Option "AutoAddDevices" "false"
    Option "AutoAddGPU" "false"
EndSection
Section "Device"
    Identifier "nv"
    Driver "nvidia"
    BusID "PCI:${b}@${domain}:${dev}:${fn}"
    Option "AllowEmptyInitialConfiguration" "true"
    Option "ConnectedMonitor" "DFP-0"
EndSection
Section "Screen"
    Identifier "gpu"
    Device "nv"
    DefaultDepth 24
    SubSection "Display"
        Depth 24
        Virtual 1280 1024
    EndSubSection
EndSection
`);
  const log = join(dir, `Xorg.${display}.log`);
  const child = spawn("sudo", ["-n", "Xorg", `:${display}`, "-config", conf, "-logfile", log, "-noreset", "-nolisten", "tcp", "-novtswitch", "-sharevts", "-ac", `vt${display}`], {
    stdio: "ignore",
  });
  const stop = async () => {
    spawnSync("sudo", ["-n", "pkill", "-f", `Xorg :${display} -config ${conf}`]);
    await sleep(300);
  };
  const t0 = Date.now();
  while (Date.now() - t0 < 15000) {
    if (spawnSync("xdpyinfo", [], { env: { ...process.env, DISPLAY: `:${display}` } }).status === 0) return stop;
    if (child.exitCode !== null) break;
    await sleep(200);
  }
  await stop();
  throw new Error(`the NVIDIA X server did not start; see ${log}`);
}

export class Env {
  constructor({ root, display, gpu = false } = {}) {
    this.dirs = makeProfile(root ?? mkdtempSync(join(tmpdir(), "yames-e2e-")));
    reap(this.dirs.root);
    unmountUnder(this.dirs.root);
    this.display = display ?? freeDisplay();
    this.gpu = gpu;
    this.procs = [];
    this.vars = {
      HOME: this.dirs.home,
      XDG_CONFIG_HOME: this.dirs.config,
      XDG_DATA_HOME: this.dirs.data,
      XDG_CACHE_HOME: this.dirs.cache,
      XDG_RUNTIME_DIR: this.dirs.run,
      DISPLAY: `:${this.display}`,
      // PipeWire's ALSA plugin, which is what cpal's "default" opens.
      PIPEWIRE_RUNTIME_DIR: this.dirs.run,
      PULSE_RUNTIME_PATH: join(this.dirs.run, "pulse"),
      NO_AT_BRIDGE: "1",
      // Keep GIO off gvfs (no FUSE mount in the profile) and GTK off portals.
      GIO_USE_VFS: "local",
      GTK_USE_PORTAL: "0",
      LANG: "en_US.UTF-8",
    };
  }

  env(extra = {}) {
    const base = { ...process.env };
    // Never inherit the caller's session: bus, audio and display are ours.
    for (const k of ["DBUS_SESSION_BUS_ADDRESS", "WAYLAND_DISPLAY", "PULSE_SERVER"]) delete base[k];
    return { ...base, ...this.vars, ...extra };
  }

  spawnLogged(name, cmd, args, opts = {}) {
    const log = join(this.dirs.logs, `${name}.log`);
    const child = spawn(cmd, args, {
      env: this.env(opts.env),
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
    });
    const out = createWriteStream(log, { flags: "a" });
    child.stdout.pipe(out);
    child.stderr.pipe(out);
    child.logPath = log;
    this.procs.push({ name, child });
    return child;
  }

  sh(cmd, args) {
    return execFileSync(cmd, args, { env: this.env(), encoding: "utf8" });
  }

  async up() {
    // --- display ---------------------------------------------------------
    if (!this.gpu) {
      this.spawnLogged("xvfb", "Xvfb", [
        `:${this.display}`,
        "-screen", "0", "1280x1024x24",
        "-nolisten", "tcp",
        "+extension", "GLX",
      ]);
    }
    await this.waitFor(() => spawnSync("xdpyinfo", [], { env: this.env() }).status === 0, "the X server");

    // --- session bus (wireplumber and webkit want one) -------------------
    const bus = join(this.dirs.run, "bus");
    this.spawnLogged("dbus", "dbus-daemon", ["--session", "--nofork", `--address=unix:path=${bus}`]);
    await this.waitFor(() => existsSync(bus), "the session bus");
    this.vars.DBUS_SESSION_BUS_ADDRESS = `unix:path=${bus}`;

    // --- audio -----------------------------------------------------------
    // Log level 3 (info) on the two that carry the audio: it is the level at
    // which a node that missed a cycle is named (see `graphTrouble`).
    const logged = { env: { PIPEWIRE_DEBUG: "3" } };
    this.spawnLogged("pipewire", "pipewire", [], logged);
    await this.waitFor(() => existsSync(join(this.dirs.run, "pipewire-0")), "PipeWire");
    this.spawnLogged("wireplumber", "wireplumber", []);
    this.spawnLogged("pipewire-pulse", "pipewire-pulse", [], logged);
    await this.waitFor(() => spawnSync("pactl", ["info"], { env: this.env() }).status === 0, "pipewire-pulse");
    const load = (...a) => this.sh("pactl", ["load-module", ...a]);
    load("module-null-sink", "sink_name=yames_out", "sink_properties=device.description=YamesOut");
    load("module-null-sink", "sink_name=guitar", "sink_properties=device.description=Guitar");
    // wireplumber can take a moment to see the new nodes.
    await this.waitFor(() => /guitar\.monitor/.test(this.sh("pactl", ["list", "short", "sources"])), "the guitar source");
    this.sh("pactl", ["set-default-sink", "yames_out"]);
    this.sh("pactl", ["set-default-source", "guitar.monitor"]);
    this.rtThreads = this.promoteAudioThreads();
    await sleep(300);
    return this;
  }

  /**
   * What rtkit does for PipeWire on a desktop: its data loops run SCHED_FIFO.
   * Our private PipeWire has no rtkit to ask, so on a busy machine its graph
   * stalls and the stall reads as the app's fault. With passwordless sudo
   * this puts every PipeWire data-loop thread of ours (the daemons' and the
   * ALSA plugin's inside the app) at FIFO 88, as rtkit would. The app's own
   * cpal callback thread is left alone: on Linux cpal does not promote it,
   * and the probe should measure what users get.
   */
  promoteAudioThreads() {
    if (spawnSync("sudo", ["-n", "true"]).status !== 0) return 0;
    let promoted = 0;
    for (const pid of readdirSync("/proc")) {
      if (!/^\d+$/.test(pid)) continue;
      try {
        const env = readFileSync(`/proc/${pid}/environ`, "utf8");
        if (!env.includes(`XDG_RUNTIME_DIR=${this.dirs.run}`)) continue;
        for (const tid of readdirSync(`/proc/${pid}/task`)) {
          const comm = readFileSync(`/proc/${pid}/task/${tid}/comm`, "utf8").trim();
          if (!/data-loop/.test(comm)) continue;
          if (spawnSync("sudo", ["-n", "chrt", "-f", "-p", "88", tid]).status === 0) promoted++;
        }
      } catch {
        /* gone */
      }
    }
    return promoted;
  }

  /**
   * What the graph itself says went wrong, counted from the daemons' logs
   * and less what `since` (an earlier answer with no `since`) already held.
   *
   *   "<node> missed wakeups"  cycles the node's thread did not wake for. For
   *                            the capture (`parec`) each one is a quantum of
   *                            audio that never reached the player.
   *   "<node> too slow"        times the node had not finished when the next
   *                            cycle began. PipeWire rate-limits the line, so
   *                            this is a floor.
   *
   * Read together they say whose thread was held up (measured by stopping
   * each process in turn, 2026-11-18): `parec` alone in both lines is
   * pipewire-pulse, and only the capture lost audio; `parec` with the app's
   * node too slow beside it is pipewire itself, and the whole graph skipped
   * those cycles; the app's node too slow alone is the app, which puts
   * silence into its own output and costs the capture nothing. A node's
   * missed wakeups are logged by the process it lives in, so the app's own
   * are not here.
   */
  graphTrouble(since = {}) {
    const total = {};
    const add = (key, n) => (total[key] = (total[key] ?? 0) + n);
    for (const name of ["pipewire", "pipewire-pulse"]) {
      let text = "";
      try {
        text = readFileSync(join(this.dirs.logs, `${name}.log`), "utf8");
      } catch {
        continue;
      }
      for (const m of text.matchAll(/\(([^()]+)-\d+\) client missed (\d+) wakeups/g)) add(`${m[1]} missed wakeups`, Number(m[2]));
      for (const m of text.matchAll(/\(([^()]+)-\d+\) client too slow/g)) add(`${m[1]} too slow`, 1);
    }
    const out = {};
    for (const [key, n] of Object.entries(total)) if (n - (since[key] ?? 0) > 0) out[key] = n - (since[key] ?? 0);
    return out;
  }

  async waitFor(test, what, timeoutMs = 15000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      try {
        if (await test()) return;
      } catch {
        /* not yet */
      }
      await sleep(100);
    }
    throw new Error(`timed out waiting for ${what}`);
  }

  async down() {
    reap(this.dirs.root);
    for (const { child } of this.procs.reverse()) {
      if (child.exitCode === null) child.kill("SIGTERM");
    }
    await sleep(300);
    for (const { child } of this.procs) {
      if (child.exitCode === null) child.kill("SIGKILL");
    }
    this.procs = [];
    unmountUnder(this.dirs.root);
  }
}

