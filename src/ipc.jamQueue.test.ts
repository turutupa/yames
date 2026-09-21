/**
 * The jam command queue (`jamQueue` in ipc.ts).
 *
 * `set_jam` left the main thread on 2026-09-16 because decoding recorded kits
 * and voices there beachballed the window. The main thread had been what kept
 * the sends in order, so this is now what does, and what these lock in:
 *
 * - one command at a time, in the order sent;
 * - a run of waiting `setJam`s collapses to the newest, and every caller's
 *   promise still settles;
 * - a position command is never collapsed or overtaken;
 * - one failure does not stall the line.
 */
import { describe, it, expect } from "vitest";
import { mockInvoke } from "./test/mocks";
import { JAM_LOADING_AFTER_MS, isJamLoading, setJam, setJamPosition } from "./ipc";
import type { JamEngineConfig, JamPositionCommand } from "./types";

const cfg = (n: number) => ({ n }) as unknown as JamEngineConfig;
const pos = (bar: number) => ({ jump: bar }) as unknown as JamPositionCommand;

/** Make each invoke wait until the test lets it go. */
function gated() {
  const calls: Array<{ cmd: string; args: unknown; release: (err?: unknown) => void }> = [];
  mockInvoke.mockImplementation(
    (cmd: string, args?: Record<string, unknown>) =>
      new Promise<undefined>((resolve, reject) => {
        calls.push({
          cmd,
          args,
          release: (err?: unknown) => (err ? reject(err) : resolve(undefined)),
        });
      }),
  );
  return calls;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("jamQueue", () => {
  it("sends one at a time, and collapses waiting tables to the newest", async () => {
    const calls = gated();
    const done: string[] = [];
    const a = setJam(cfg(1)).then(() => done.push("a"));
    const b = setJam(cfg(2)).then(() => done.push("b"));
    const c = setJam(cfg(3)).then(() => done.push("c"));
    await flush();
    // Only the first is in flight; the other two are waiting.
    expect(calls).toHaveLength(1);
    expect(calls[0].args).toEqual({ config: cfg(1) });

    calls[0].release();
    await flush();
    // 2 was superseded by 3 before it was ever sent.
    expect(calls).toHaveLength(2);
    expect(calls[1].args).toEqual({ config: cfg(3) });

    calls[1].release();
    await Promise.all([a, b, c]);
    expect(done).toEqual(["a", "b", "c"]);
    expect(calls).toHaveLength(2);
  });

  it("never collapses across a position command", async () => {
    const calls = gated();
    const all = [setJam(cfg(1)), setJam(cfg(2)), setJamPosition(pos(5)), setJam(cfg(3)), setJam(null)];
    for (let i = 0; i < 4; i++) {
      await flush();
      calls[calls.length - 1].release();
    }
    await Promise.all(all);
    expect(calls.map((c) => [c.cmd, c.args])).toEqual([
      ["set_jam", { config: cfg(1) }],
      ["set_jam", { config: cfg(2) }],
      ["set_jam_position", { command: pos(5) }],
      // A stop sent after a band wins over it: `null` is the newest.
      ["set_jam", { config: null }],
    ]);
  });

  it("rejects the callers of a failed send and keeps going", async () => {
    const calls = gated();
    const a = setJam(cfg(1));
    const b = setJam(cfg(2));
    await flush();
    calls[0].release(new Error("no such kit"));
    await expect(a).rejects.toThrow("no such kit");
    await flush();
    expect(calls).toHaveLength(2);
    calls[1].release();
    await expect(b).resolves.toBeUndefined();
  });

  it("says the band is loading only when a send is slow, and stops when the line is empty", async () => {
    const calls = gated();
    const a = setJam(cfg(1));
    await flush();
    // A send that finishes inside the grace period never shows anything.
    expect(isJamLoading()).toBe(false);
    calls[0].release();
    await a;
    await new Promise((r) => setTimeout(r, JAM_LOADING_AFTER_MS + 30));
    expect(isJamLoading()).toBe(false);

    // A slow one does, and it goes away when the queue is done.
    const b = setJam(cfg(2));
    const c = setJam(cfg(3));
    await new Promise((r) => setTimeout(r, JAM_LOADING_AFTER_MS + 30));
    expect(isJamLoading()).toBe(true);
    calls[1].release();
    await flush();
    expect(isJamLoading()).toBe(true);
    calls[2].release();
    await Promise.all([b, c]);
    expect(isJamLoading()).toBe(false);
  });

  it("never shows loading for taking the band away", async () => {
    const calls = gated();
    const off = setJam(null);
    await new Promise((r) => setTimeout(r, JAM_LOADING_AFTER_MS + 30));
    expect(isJamLoading()).toBe(false);
    calls[0].release();
    await off;
  });
});
