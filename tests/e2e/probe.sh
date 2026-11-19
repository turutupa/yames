#!/usr/bin/env bash
# The click with the neck drawing, measured in the real app, against the
# headless probe in the same PipeWire. One command; re-run it on a quiet
# machine (the numbers are only a gate result when nothing else is running).
#
#   tests/e2e/probe.sh [--no-build] [--take-fps N] [out-dir]
#
# --take-fps N forces the rate a Take is drawn at (the app's own choice on
# WebKitGTK is 30): how a faster Take is held against the same gates.
#
# 1. Xvfb: the headless click-jitter-probe (60 s), then the app with the neck
#    on screen for three Takes (compositing in software; WebGL still reaches
#    the GPU through NVIDIA's EGL on this machine).
# 2. If there is an NVIDIA GPU and passwordless sudo: the same three Takes on
#    an X server on the GPU (WebGL on the GPU).
# The load before and after each part is written beside the numbers.
set -u
here="$(cd "$(dirname "$0")" && pwd)"
build=()
fps=()
if [ "${1:-}" = "--no-build" ]; then build=(--no-build); shift; fi
if [ "${1:-}" = "--take-fps" ]; then fps=(--take-fps "$2"); shift 2; fi
out="${1:-$(mktemp -d /tmp/yames-probe-XXXXXX)}"
mkdir -p "$out"

load() {
  { echo "== $1 $(date -Is)"; uptime; ps -eo pcpu,user:14,comm --sort=-pcpu | head -8; echo; } >> "$out/load.txt"
}

status=0
load "before Xvfb"
node "$here/run.mjs" "${build[@]}" "${fps[@]}" --scenarios gpu-info,baseline,neck --out "$out/xvfb" || status=1
load "after Xvfb"
if command -v nvidia-smi >/dev/null && sudo -n true 2>/dev/null; then
  node "$here/run.mjs" --no-build --gpu "${fps[@]}" --scenarios gpu-info,neck --out "$out/gpu" || status=1
  load "after GPU"
else
  echo "no NVIDIA GPU or no passwordless sudo: GPU part skipped" | tee -a "$out/load.txt"
fi

node - "$out" <<'JS'
const fs = require("fs"), path = require("path");
const out = process.argv[2];
const rows = [];
for (const part of ["xvfb", "gpu"]) {
  const f = path.join(out, part, "results.json");
  if (!fs.existsSync(f)) continue;
  const { info } = JSON.parse(fs.readFileSync(f, "utf8"));
  if (info.baseline) {
    const b = info.baseline;
    rows.push(["headless click-jitter-probe", b.p99_ms, b.missed_beats, `${b.callback_allocs}/${b.callback_frees}`, b.dropped_notifications, "-", info.loadAtStart]);
  }
  const p = info.probe_neck;
  if (p) {
    const f = info.neck?.frames ?? {};
    rows.push([`app, neck ${info.neck?.kind} (${part}), Take fps ${info.takeFpsAsked ?? "auto"}: frames ${f.neckGapMedianMs ?? "?"} ms apart (page ${f.pageFrameMedianMs ?? "?"})`, p.jitter_p99_ms, p.missed_beats, `${p.callback_allocs}/${p.callback_frees}`, p.dropped_notifications,
      JSON.stringify(info.neck?.cpuCoresWhilePlaying ?? {}), info.loadAtStart]);
  }
}
const head = ["run", "p99 jitter ms", "missed beats", "cb allocs/frees", "dropped notif.", "CPU cores while playing", "loadavg at start"];
const lines = [head, ...rows].map((r) => "| " + r.join(" | ") + " |");
lines.splice(1, 0, "|" + head.map(() => "---").join("|") + "|");
const text = lines.join("\n");
fs.writeFileSync(path.join(out, "summary.md"), text + "\n");
console.log("\n" + text + `\n\nload: ${path.join(out, "load.txt")}`);
JS
exit $status
