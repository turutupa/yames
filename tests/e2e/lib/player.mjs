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
 *        "sloppier" σ = 80 ms (clipped at ±160 ms)
 *        "wrong"  timed like "good", every other note a semitone sharp
 *        "fluffed" the first bar alternately 60 ms early and late, the rest like "good":
 *                 the slack a Take has (owner, 2026-11-17) leaves it behind
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
  let fluffIndex = 0;
  for (let p = 0; p < passes; p++) {
    for (const note of notes) {
      const tick = note.tick + p * passTicks;
      if (tick >= bars * barTicks) continue;
      const rough = style === "sloppier" || (style === "fluffed" && tick < barTicks);
      const spread = style === "sloppy" ? 35 : rough ? 80 : 1.5;
      const clip = rough ? 160 : 70;
      let jitterMs = gauss(rand) * spread;
      // "fluffed": the first bar must FAIL, every run. Random scatter of 80 ms
      // came out 0.91 even once (a 75 BPM grid, a lucky draw), so the bar
      // "held" and the check that the clean bars come after it failed. Notes
      // alternately 60 ms early and late are uneven by construction.
      if (style === "fluffed" && tick < barTicks) {
        // By note count, not tick: on an eighth-note grid a tick rule shifts
        // every note the same way, and a uniform shift is corrected as lag.
        jitterMs = (fluffIndex++ % 2 === 0 ? -60 : 60) + gauss(rand) * 5;
      }
      // "wrong": in time, and every other note a semitone sharp.
      const midi = style === "wrong" && out.notes.length % 2 === 1 ? note.midi + 1 : note.midi;
      jitterMs = Math.max(-clip, Math.min(clip, jitterMs));
      const seconds = Math.min(0.9, ((note.dur ?? 480) * msPerTick) / 1000 + 0.05);
      out.notes.push({
        beat: tick / 960,
        jitterMs,
        samples: pluck(midi, seconds, 0.45, rng(seed + tick)),
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// The two streams
// ---------------------------------------------------------------------------

/**
 * Reads a sink's monitor as mono s16; reports chunks with their sample index.
 *
 * THE CLOCK. A sample's time on our clock is `t0 + index / RATE`, and `t0` is
 * the lower envelope of `arrival - samples so far`: the chunk that arrived
 * soonest after its last sample was taken. Late arrivals (a busy event loop)
 * only push that difference up, so its minimum is the true one.
 *
 * But not over the whole capture. On a loaded machine the capture LOSES
 * samples (the reader falls behind and the sound server drops what it could
 * not hand over), and every loss moves the true difference up for good. A
 * minimum over the whole capture then sits below it, every click after the
 * loss is timed early by everything lost so far, and the clock runs fast:
 * measured on the 2026-11-18 failures, the engine clicking every 923 ms and
 * this hearing 780-870 ms, 1.4 s fast after 28 s. The player followed that
 * clock, played early, heard what looked like 2.5 beats of silence while the
 * click went on, and stopped with the Take half played ("the Take never ends
 * by itself", two-paths and four-fingers).
 *
 * So the envelope is taken over the last `CLOCK_WINDOW_MS` of arrivals, and only
 * ever moves up: a loss is real and permanent, and a stall shorter than the
 * window (data late, not lost) cannot raise it. `lostMs` is how far it moved.
 */
const CLOCK_WINDOW_MS = 500;
export class CaptureClock {
  constructor(windowMs = CLOCK_WINDOW_MS) {
    this.windowMs = windowMs;
    this.t0 = Infinity;
    /** The envelope as it first settled, before any loss. */
    this.firstT0 = Infinity;
    this.startedAt = null;
    /** [arrival, offset] of recent chunks, offsets increasing (a min-deque). */
    this.recent = [];
  }
  /** A chunk arrived at `t` (our clock, ms), and `samples` have arrived in all. */
  track(t, samples) {
    const offset = t - (samples / RATE) * 1000;
    this.startedAt ??= t;
    while (this.recent.length && this.recent[this.recent.length - 1][1] >= offset) this.recent.pop();
    this.recent.push([t, offset]);
    while (this.recent[0][0] < t - this.windowMs) this.recent.shift();
    if (t - this.startedAt < this.windowMs) {
      // The first window: the plain minimum, as it always was.
      this.t0 = Math.min(this.t0, offset);
      this.firstT0 = this.t0;
    } else {
      this.t0 = Math.max(this.t0, this.recent[0][1]);
    }
  }
  timeOf(sampleIndex) {
    return this.t0 + (sampleIndex / RATE) * 1000;
  }
  /** How much the capture has lost so far, in ms of audio. */
  get lostMs() {
    return Number.isFinite(this.t0) && Number.isFinite(this.firstT0) ? this.t0 - this.firstT0 : 0;
  }
}

class Capture {
  constructor(env, device) {
    this.child = spawn(
      "parec",
      [`--device=${device}`, "--raw", "--format=s16le", `--rate=${RATE}`, "--channels=1", "--latency-msec=5"],
      { env: env.env(), stdio: ["ignore", "pipe", "ignore"] },
    );
    this.samples = 0;
    this.clock = new CaptureClock();
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
      this.clock.track(t, this.samples);
      const pcm = new Int16Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
      for (const fn of this.listeners) fn(pcm, first);
    });
  }
  timeOf(sampleIndex) {
    return this.clock.timeOf(sampleIndex);
  }
  get lostMs() {
    return this.clock.lostMs;
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
    let endedBy = null;
    let first = null;
    let watch = null;
    /** The latest click: its beat and when it was heard. */
    let last = null;
    /** Each click's distance from the one before, per beat between them. */
    const beatGaps = [];
    let beatMs = 0;
    /** The last beat whose notes are placed, and how many of those in a row were placed without a click. */
    let placed = -Infinity;
    let extrapolated = 0;
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
      // Where the notes of beat `beat` go, one beat after a click at `t`.
      const place = (beat, at) => {
        placed = beat;
        for (const note of byBeat.get(beat) ?? []) {
          // We hear the click `capture` late, and a sample we write reaches
          // the guitar sink `playback` after we write it. Calibration
          // measured playback + capture, so writing `offsetMs` before the
          // click we expect puts a note into the guitar sink when that
          // click went into the app's output sink.
          const when = at + (note.beat - beat) * beatMs + note.jitterMs - this.offsetMs;
          play.schedule(play.indexAt(when), note.samples);
        }
      };
      const finish = (why) => {
        finished = true;
        endedBy = why;
        clearTimeout(timer);
        resolve();
      };
      cap.listeners.add(
        onsetFinder(0.05, RATE / 20, (n) => {
          if (finished) return;
          const t = cap.timeOf(n);
          // Which beat this click is. The count-in by count (-4..-1); after
          // it, by TIME from the click before, so a click the capture lost
          // is a beat skipped rather than every later beat shifted by one.
          let beat;
          if (clicks.length < countInClicks) {
            beat = clicks.length - countInClicks;
          } else {
            const steps = Math.round((t - last.t) / beatMs);
            if (steps < 1) return; // not a click: nothing sounds between them
            beat = last.beat + steps;
          }
          clicks.push(t);
          const prev = last;
          last = { beat, t };
          extrapolated = 0;
          if (prev) {
            beatGaps.push((t - prev.t) / (beat - prev.beat));
            const recent = beatGaps.slice(-4).sort((x, y) => x - y);
            beatMs = recent[Math.floor(recent.length / 2)];
          }
          if (clicks.length < 2) return;
          const next = beat + 1;
          if (clicks.length >= countInClicks && next <= lastBeat && next > placed) {
            place(next, t + beatMs);
            if (next === 0) {
              first = { beatMs, bpm: 60000 / beatMs, aheadMs: t + beatMs - this.offsetMs - now() };
              // The count-in was heard; from here the clicks are the clock.
              clearTimeout(timer);
            }
          }
          if (next > lastBeat) finish("last beat");
        }),
      );
      watch = setInterval(() => {
        if (finished || clicks.length < countInClicks + 2) return;
        const gap = now() - last.t;
        // A click the capture lost: its beat's click is 30% of a beat
        // overdue, so the beat after it is placed from the tempo, as a
        // player carries on through a click they did not hear. Twice at
        // most; after that the click has stopped and so do we.
        const due = last.t + (placed - last.beat) * beatMs;
        if (placed < lastBeat && extrapolated < 2 && now() > due + 0.3 * beatMs) {
          extrapolated += 1;
          place(placed + 1, due + beatMs);
          return;
        }
        // A take whose last click is its last beat ends on silence: give up
        // waiting for one more click a beat and a half after the last.
        if (gap > (placed >= lastBeat ? 2.5 : 3.5) * beatMs) {
          finish(`silence (${Math.round(gap)} ms since the last click)`);
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
    // What the clock was, for a Take that went wrong: when each click was
    // heard (ms after the first) and why the player stopped.
    const at0 = clicks[0] ?? 0;
    return {
      ...first,
      clicksHeard: clicks.length,
      expectedClicks: countInClicks + lastBeat,
      endedBy,
      clicksMs: clicks.map((c) => Math.round(c - at0)),
      captureLostMs: Math.round(cap.lostMs),
    };
  }

  /**
   * Arm over a BAND: a jam-backed Take, where the click is off after the
   * count-in and the drummer keeps the time (`src/session/takeBand.ts`).
   *
   * The count-in is still the click alone, so the beat and the downbeat come
   * from it as in `playOnCountIn`. After that the output is a band, and a
   * threshold-after-quiet finder hears nothing once the bass sustains, so the
   * clock is the count-in's beat, nudged by any sharp rise in the output that
   * lands within 15% of a beat of where the next beat is due (a kick, a hat, a
   * snare: the band is placed off the same map as the click, to the sample).
   * A beat with no such rise is taken where it was due.
   */
  async playOverBand(take, { countInClicks = 4, timeoutMs = 30000 } = {}) {
    const cap = new Capture(this.env, "yames_out.monitor");
    const play = new Playback(this.env, "guitar");
    const lastBeat = Math.ceil(take.beats);
    const byBeat = new Map();
    for (const n of take.notes) {
      const k = Math.floor(n.beat + 1e-9);
      if (!byBeat.has(k)) byBeat.set(k, []);
      byBeat.get(k).push(n);
    }
    const clicks = [];
    let beatMs = 0;
    let beatAt = null; // our-clock time of the latest beat placed
    let beat = -1; // its number; the count-in's last click is -1
    let first = null;
    let nudged = 0;
    let finished = false;
    let watch = null;
    const placeNext = () => {
      const next = beat + 1;
      for (const note of byBeat.get(next) ?? []) {
        const at = beatAt + beatMs + (note.beat - next) * beatMs + note.jitterMs - this.offsetMs;
        play.schedule(play.indexAt(at), note.samples);
      }
    };
    const done = new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`heard ${clicks.length} count-in clicks in ${timeoutMs} ms`)),
        timeoutMs,
      );
      // The count-in: clicks after quiet, as `playOnCountIn` hears them.
      const countIn = onsetFinder(0.05, RATE / 20, (n) => {
        if (clicks.length >= countInClicks) return;
        clicks.push(cap.timeOf(n));
        if (clicks.length < countInClicks) return;
        const gaps = clicks.slice(1).map((c, i) => c - clicks[i]).sort((x, y) => x - y);
        beatMs = gaps[Math.floor(gaps.length / 2)];
        beatAt = clicks[clicks.length - 1];
        beat = -1;
        clearTimeout(timer);
        placeNext();
        first = { beatMs, bpm: 60000 / beatMs, aheadMs: beatAt + beatMs - this.offsetMs - now() };
      });
      // After it: sharp rises (1 ms peaks against the 20 ms before them).
      const block = RATE / 1000;
      const history = [];
      let peak = 0;
      let fill = 0;
      let refractory = 0;
      const rises = (pcm, firstIndex) => {
        for (let i = 0; i < pcm.length; i++) {
          peak = Math.max(peak, Math.abs(pcm[i]) / 32768);
          if (++fill < block) continue;
          const before = history.reduce((m, v) => Math.max(m, v), 0);
          history.push(peak);
          if (history.length > 20) history.shift();
          if (refractory > 0) refractory--;
          else if (beatAt !== null && peak > 0.03 && peak > 2.5 * before) {
            refractory = 60;
            const t = cap.timeOf(firstIndex + i);
            const due = beatAt + beatMs;
            if (Math.abs(t - due) < 0.15 * beatMs && beat + 1 <= lastBeat && !finished) {
              beat += 1;
              beatAt = t;
              nudged += 1;
              if (beat + 1 <= lastBeat) placeNext();
            }
          }
          peak = 0;
          fill = 0;
        }
      };
      cap.listeners.add((pcm, firstIndex) => {
        countIn(pcm, firstIndex);
        rises(pcm, firstIndex);
      });
      // A beat that nothing marked is taken where it was due.
      watch = setInterval(() => {
        if (beatAt === null || finished) return;
        while (now() > beatAt + beatMs * 1.2) {
          beat += 1;
          beatAt += beatMs;
          if (beat + 1 <= lastBeat) placeNext();
          else break;
        }
        if (beat >= lastBeat) {
          finished = true;
          resolve();
        }
      }, 10);
    });
    try {
      await done;
      await play.drain();
    } finally {
      clearInterval(watch);
      cap.stop();
      play.stop();
    }
    return { ...first, clicksHeard: clicks.length, beatsHeardFromTheBand: nudged };
  }
}
