// The capture clock (`node --test tests/e2e/lib/`): what the virtual guitarist
// believes the time of a sample it heard is, when the capture loses audio.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CaptureClock, RATE } from "./player.mjs";

/**
 * A capture of `seconds` of audio in 5 ms chunks, delivered `latencyMs` after
 * the last sample was taken plus up to `jitterMs` more, losing `loseEvery`-th
 * chunk from `lossFrom` seconds on. Returns the clock and, for a click every
 * `beatMs`, the time the clock gives it (null for a click in a lost chunk).
 */
function capture({ seconds = 30, beatMs = 923, latencyMs = 3, jitterMs = 4, lossFrom = Infinity, loseEvery = 10, stallAt = null, stallMs = 0 }) {
  const clock = new CaptureClock();
  const chunk = (RATE * 5) / 1000;
  let samples = 0;
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const heard = [];
  let nextClick = 0;
  let k = 0;
  for (let at = 0; at < seconds * 1000; at += 5, k++) {
    const lost = at >= lossFrom * 1000 && k % loseEvery === 0;
    // The click whose sample is in this chunk.
    const end = at + 5;
    while (nextClick * beatMs < end) {
      const clickAt = nextClick * beatMs;
      heard.push(lost ? null : { trueMs: clickAt, index: samples + Math.round(((clickAt - at) / 1000) * RATE) });
      nextClick++;
    }
    if (lost) continue;
    samples += chunk;
    let arrival = end + latencyMs + rand() * jitterMs;
    if (stallAt !== null && end >= stallAt * 1000 && end < stallAt * 1000 + stallMs) arrival = stallAt * 1000 + stallMs;
    clock.track(arrival, samples);
    for (const h of heard) if (h && h.ms === undefined) h.ms = clock.timeOf(h.index);
  }
  return { clock, heard: heard.filter(Boolean) };
}

const errors = (heard, latencyMs = 3) => heard.map((h) => h.ms - latencyMs - h.trueMs);

test("with nothing lost, every click is timed to within the arrival jitter", () => {
  const { clock, heard } = capture({});
  for (const e of errors(heard)) assert.ok(Math.abs(e) < 5, `off by ${e} ms`);
  assert.ok(Math.abs(clock.lostMs) < 5);
});

test("a capture that loses one chunk in ten does not run fast", () => {
  // 2026-11-18: the engine clicking every 923 ms, the old clock (a minimum
  // over the whole capture) hearing 780-870 ms and 1.4 s fast after 28 s.
  const { clock, heard } = capture({ lossFrom: 12, loseEvery: 10 });
  const late = heard.filter((h) => h.trueMs > 14000);
  for (const e of errors(late)) assert.ok(Math.abs(e) < 75, `off by ${e} ms`);
  // Each beat as heard, per beat of the click (a click in a lost chunk is not heard at all).
  const beats = late.slice(1).map((h, i) => (h.ms - late[i].ms) / Math.round((h.trueMs - late[i].trueMs) / 923));
  for (const g of beats) assert.ok(Math.abs(g - 923) < 30, `a beat of ${g} ms`);
  assert.ok(clock.lostMs > 1000, `lost ${clock.lostMs} ms`);
});

test("a stall shorter than the window delays the audio without moving the clock", () => {
  const { clock, heard } = capture({ stallAt: 10, stallMs: 400 });
  for (const e of errors(heard)) assert.ok(Math.abs(e) < 5, `off by ${e} ms`);
  assert.ok(Math.abs(clock.lostMs) < 5);
});
