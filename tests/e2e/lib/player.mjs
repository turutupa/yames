// The guitarist: listens to the app's click and plays a take in time with it.
//
// How the take is lined up with the transport (the hard part)
// ------------------------------------------------------------
// The app's Take starts with one bar of count-in. A real player hears those
// clicks and comes in on the next downbeat; so does this:
//
//   1. `parec` records the monitor of the app's output sink (`yames_out`),
//      which carries only the click on a Take (the song has no tracks).
//   2. Once armed, the first four clicks are the count-in. Their spacing is
//      the beat; the downbeat is the fourth plus one beat.
//   3. `pacat` plays into the `guitar` sink, whose monitor is the app's input.
//      It is fed continuously (silence, then the take) on our own clock, so a
//      sample written at index m sounds a fixed time after m / rate.
//   4. That fixed time, plus the capture's own delay, is measured once before
//      the run (`calibrate`: a pulse played into `guitar` and caught on its
//      monitor) and taken off, so the first note goes into the guitar sink
//      when the app's downbeat went into its output sink. What is left between
//      them is the app's own input and output latency, which is what a real
//      rig has and what the scorer's lag estimate is there to remove.
//
// Everything is one pipeline clock (PipeWire's), read by sample counts rather
// than by wall clock wherever possible.
import { spawn } from "node:child_process";

export const RATE = 48000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => Number(process.hrtime.bigint()) / 1e6; // ms

// ---------------------------------------------------------------------------
// The take
// ---------------------------------------------------------------------------

/** A seeded random, so a "sloppy" take is the same sloppy take every run. */
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1_000_000) / 1_000_000;
  };
}

function gauss(rand) {
  const u = Math.max(rand(), 1e-9);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * A plucked string (Karplus-Strong), the same idea as the Rust fixtures'
 * `pluck`: a noise burst through a damped delay line, with a pick click.
 */
export function pluck(midi, seconds = 0.6, gain = 0.5, rand = rng(midi)) {
  const f = 440 * 2 ** ((midi - 69) / 12);
  const n = Math.round(seconds * RATE);
  const out = new Float32Array(n);
  const period = Math.max(2, Math.round(RATE / f));
  const line = new Float32Array(period);
  for (let i = 0; i < period; i++) line[i] = rand() * 2 - 1;
  let idx = 0;
  const damp = 0.996;
  for (let i = 0; i < n; i++) {
    const a = line[idx];
    const b = line[(idx + 1) % period];
    const y = damp * 0.5 * (a + b);
    line[idx] = y;
    idx = (idx + 1) % period;
    // A short release so the next note is a fresh onset, not a smear.
    const env = i < n - 480 ? 1 : (n - i) / 480;
    out[i] = a * gain * env;
  }
  return out;
}

/**
 * A take: `notes` (ticks of 960 per quarter, midi) looped to `bars` bars, as
 * one rendered pluck per note at a position in beats from the first downbeat
 * after the count-in (beat 0). The player places each note against the
 * click it hears, so where a note lands is decided at play time.
 *
 * style: "good"   1.5 ms of human scatter (σ), every note
 *        "sloppy" σ = 35 ms of scatter (clipped at ±70 ms), every note
 *        "silent" nothing
 */
export function renderTake({ bpm, notes, barTicks, exerciseBars, bars, style, seed = 7 }) {
  const msPerTick = 60000 / bpm / 960;
  const beatsPerBar = barTicks / 960;
  const out = { bpm, beats: bars * beatsPerBar, notes: [] };
  if (style === "silent") return out;
  const rand = rng(seed);
  const passTicks = barTicks * exerciseBars;
  const passes = Math.ceil(bars / exerciseBars);
  for (let p = 0; p < passes; p++) {
    for (const note of notes) {
      const tick = note.tick + p * passTicks;
      if (tick >= bars * barTicks) continue;
      let jitterMs = style === "sloppy" ? gauss(rand) * 35 : gauss(rand) * 1.5;
      jitterMs = Math.max(-70, Math.min(70, jitterMs));
      const seconds = Math.min(0.9, ((note.dur ?? 480) * msPerTick) / 1000 + 0.05);
      out.notes.push({
        beat: tick / 960,
        jitterMs,
        samples: pluck(note.midi, seconds, 0.45, rng(seed + tick)),
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// The two streams
// ---------------------------------------------------------------------------

/** Reads a sink's monitor as mono s16; reports chunks with their sample index. */
class Capture {
  constructor(env, device) {
    this.child = spawn(
      "parec",
      [`--device=${device}`, "--raw", "--format=s16le", `--rate=${RATE}`, "--channels=1", "--latency-msec=5"],
      { env: env.env(), stdio: ["ignore", "pipe", "ignore"] },
    );
    this.samples = 0;
    // Our clock at sample 0, from the lower envelope of arrivals: the chunk
    // that arrived soonest after its last sample was taken.
    this.t0 = Infinity;
    this.listeners = new Set();
    let carry = null;
    this.child.stdout.on("data", (buf) => {
      const t = now();
      if (carry) {
        buf = Buffer.concat([carry, buf]);
        carry = null;
      }
      if (buf.length % 2) {
        carry = buf.subarray(buf.length - 1);
        buf = buf.subarray(0, buf.length - 1);
      }
      const n = buf.length / 2;
      const first = this.samples;
      this.samples += n;
      this.t0 = Math.min(this.t0, t - (this.samples / RATE) * 1000);
      const pcm = new Int16Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
      for (const fn of this.listeners) fn(pcm, first);
    });
  }
  timeOf(sampleIndex) {
    return this.t0 + (sampleIndex / RATE) * 1000;
  }
  stop() {
    this.child.kill("SIGTERM");
  }
}

/** Plays mono s16 into a sink, paced on our clock so latency stays constant. */
class Playback {
  constructor(env, device, leadMs = 150) {
    this.child = spawn(
      "pacat",
      [`--device=${device}`, "--raw", "--format=s16le", `--rate=${RATE}`, "--channels=1", "--latency-msec=60", "--playback"],
      { env: env.env(), stdio: ["pipe", "ignore", "ignore"] },
    );
    this.child.stdin.on("error", () => {});
    this.leadMs = leadMs;
    this.t0 = now();
    this.written = 0;
    /** [startIndex, Float32Array] to mix in. */
    this.queue = [];
    this.timer = setInterval(() => this.pump(), 4);
  }
  /** The output index that will be written at our-clock time `t`. */
  indexAt(t) {
    return Math.round(((t - this.t0) / 1000) * RATE);
  }
  schedule(atIndex, samples) {
    this.queue.push([atIndex, samples]);
  }
  pump() {
    const target = this.indexAt(now() + this.leadMs);
    const n = target - this.written;
    if (n <= 0) return;
    const out = new Int16Array(n);
    for (const [start, s] of this.queue) {
      const from = Math.max(this.written, start);
      const to = Math.min(target, start + s.length);
      for (let i = from; i < to; i++) {
        const v = s[i - start];
        out[i - this.written] = Math.max(-32767, Math.min(32767, Math.round(v * 32767)));
      }
    }
    this.queue = this.queue.filter(([start, s]) => start + s.length > target);
    this.written = target;
    this.child.stdin.write(Buffer.from(out.buffer));
  }
  /** Until everything queued has been written. */
  async drain() {
    while (this.queue.length) await sleep(20);
    await sleep(this.leadMs + 50);
  }
  stop() {
    clearInterval(this.timer);
    this.child.stdin.end();
    this.child.kill("SIGTERM");
  }
}

/** Onsets (sample indices) in a stream: a rise past `threshold` after quiet. */
function onsetFinder(threshold, quietSamples, onOnset) {
  let quiet = quietSamples;
  return (pcm, first) => {
    for (let i = 0; i < pcm.length; i++) {
      const a = Math.abs(pcm[i]) / 32768;
      if (a >= threshold) {
        if (quiet >= quietSamples) onOnset(first + i);
        quiet = 0;
      } else {
        quiet++;
      }
    }
  };
}

// ---------------------------------------------------------------------------
// The player
// ---------------------------------------------------------------------------

export class Player {
  constructor(env) {
    this.env = env;
    this.offsetMs = 0;
  }

  /**
   * How long from writing a sample into `guitar` to catching it on
   * `guitar.monitor`, on our clock. Taken off every scheduled note.
   */
  async calibrate() {
    const cap = new Capture(this.env, "guitar.monitor");
    const play = new Playback(this.env, "guitar");
    await sleep(600);
    const hits = [];
    cap.listeners.add(onsetFinder(0.2, RATE / 10, (n) => hits.push(cap.timeOf(n))));
    const sent = [];
    const pulse = new Float32Array(240).fill(0.8);
    for (let k = 0; k < 8; k++) {
      const t = now() + 150;
      play.schedule(play.indexAt(t), pulse);
      sent.push(t);
      await sleep(300);
    }
    await sleep(300);
    cap.stop();
    play.stop();
    // A sink waking from suspend can swallow the first pulse or two; match
    // each pulse heard to the one sent just before it.
    const diffs = [];
    for (const h of hits) {
      const before = sent.filter((t) => t <= h + 5 && h - t < 250);
      if (before.length) diffs.push(h - before[before.length - 1]);
    }
    if (diffs.length < 4) {
      throw new Error(`calibration heard ${diffs.length} of ${sent.length} pulses`);
    }
    diffs.sort((a, b) => a - b);
    this.offsetMs = diffs[Math.floor(diffs.length / 2)];
    this.calibration = { offsetMs: this.offsetMs, spreadMs: diffs[diffs.length - 1] - diffs[0] };
    return this.calibration;
  }

  /**
   * Arm: listen for the count-in, then play `take` in time with the click.
   *
   * Like a player, it follows the click rather than a clock of its own: every
   * click heard places the notes of the beat after it, one beat ahead (the
   * beat is the median of the last few clicks' spacing). The count-in's
   * clicks are -4..-1, the downbeat is beat 0. So if the app's output stalls
   * and its click comes late, the take comes late with it, as it would from
   * someone listening; and the stall shows in the probe's numbers, which is
   * where it belongs, rather than as a sloppy take.
   *
   * Resolves once the take has been played out, with what was heard.
   */
  async playOnCountIn(take, { countInClicks = 4, timeoutMs = 30000 } = {}) {
    const cap = new Capture(this.env, "yames_out.monitor");
    const play = new Playback(this.env, "guitar");
    const clicks = [];
    const lastBeat = Math.ceil(take.beats);
    let finished = false;
    let first = null;
    let watch = null;
    const byBeat = new Map();
    for (const n of take.notes) {
      const k = Math.floor(n.beat + 1e-9);
      if (!byBeat.has(k)) byBeat.set(k, []);
      byBeat.get(k).push(n);
    }
    const done = new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`heard ${clicks.length} clicks in ${timeoutMs} ms, expected a count-in of ${countInClicks}`)),
        timeoutMs,
      );
      cap.listeners.add(
        onsetFinder(0.05, RATE / 20, (n) => {
          const t = cap.timeOf(n);
          clicks.push(t);
          // Beat number of this click: the count-in is -4..-1.
          const beat = clicks.length - 1 - countInClicks;
          if (clicks.length < 2 || finished) return;
          const recent = clicks.slice(-5);
          const gaps = recent.slice(1).map((c, i) => c - recent[i]).sort((x, y) => x - y);
          const beatMs = gaps[Math.floor(gaps.length / 2)];
          const next = beat + 1;
          if (clicks.length >= countInClicks && next <= lastBeat) {
            // We hear the click `capture` late, and a sample we write reaches
            // the guitar sink `playback` after we write it. Calibration
            // measured playback + capture, so writing `offsetMs` before the
            // click we expect puts a note into the guitar sink when that
            // click went into the app's output sink.
            const nextClick = t + beatMs;
            for (const note of byBeat.get(next) ?? []) {
              const at = nextClick + (note.beat - next) * beatMs + note.jitterMs - this.offsetMs;
              play.schedule(play.indexAt(at), note.samples);
            }
            if (next === 0) {
              first = { beatMs, bpm: 60000 / beatMs, aheadMs: nextClick - this.offsetMs - now() };
              // The count-in was heard; from here the clicks are the clock.
              clearTimeout(timer);
            }
          }
          if (next > lastBeat) {
            finished = true;
            clearTimeout(timer);
            resolve();
          }
        }),
      );
      // A take whose last click is its last beat ends on silence: give up
      // waiting for one more click a beat and a half after the last.
      watch = setInterval(() => {
        if (finished || clicks.length < countInClicks + 2) return;
        const gap = now() - clicks[clicks.length - 1];
        const beatMs = (clicks[clicks.length - 1] - clicks[0]) / (clicks.length - 1);
        if (gap > 2.5 * beatMs) {
          finished = true;
          clearTimeout(timer);
          resolve();
        }
      }, 50);
    });
    try {
      await done;
      await play.drain();
    } finally {
      clearInterval(watch);
      cap.stop();
      play.stop();
    }
    return { ...first, clicksHeard: clicks.length };
  }
}
