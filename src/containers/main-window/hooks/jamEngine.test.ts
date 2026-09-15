/**
 * The refusal the engine can give a jam, as something a screen can read.
 *
 * `setJam` rejecting used to be a `console.warn`, said once per session. That
 * is the right amount of noise for "this build has no such command" and the
 * wrong amount for the one failure a musician can cause on purpose: a folder
 * of their own samples the engine will not load (JAM_UX_DECISIONS B3). The
 * band goes on playing the built-in kit, the picker still says the folder is
 * chosen, and nothing on the screen disagrees. So the refusal is state.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { clearJamSendRefusal, jamSendRefusal, sendJam, subscribeJamSend } from "./jamEngine";
import type { Jam, JamEngineConfig } from "../../../jam";

const engine = vi.hoisted(() => ({ fail: false }));

vi.mock("../../../ipc", () => ({
  setJam: async () => {
    if (engine.fail) throw new Error("set_jam refused");
  },
  setBeatGroups: async () => {},
  setFreeMode: async () => {},
  setSubdivision: async () => {},
}));

const JAM = { id: "j", name: "one" } as unknown as Jam;
const configWith = (customKit: { dir: string } | null): JamEngineConfig =>
  ({ kit: "raw", customKit } as unknown as JamEngineConfig);

beforeEach(() => {
  engine.fail = false;
  clearJamSendRefusal();
  // The once-per-session console line is still there and still right; it is
  // just not what this file is reading.
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("a refused send", () => {
  it("stands, and says whether a folder of your own was on it", async () => {
    engine.fail = true;
    await sendJam(JAM, configWith({ dir: "C:/samples/mine" }));
    expect(jamSendRefusal()).toMatchObject({ customKit: true });
  });

  it("is not blamed on a folder when there was none", async () => {
    engine.fail = true;
    await sendJam(JAM, configWith(null));
    expect(jamSendRefusal()).toMatchObject({ customKit: false });
  });

  it("clears itself the moment a send lands", async () => {
    engine.fail = true;
    await sendJam(JAM, configWith({ dir: "C:/samples/mine" }));
    engine.fail = false;
    await sendJam(JAM, configWith(null));
    expect(jamSendRefusal()).toBeNull();
  });

  it("wakes the screens watching it, both ways", async () => {
    const woken = vi.fn();
    const stop = subscribeJamSend(woken);
    engine.fail = true;
    await sendJam(JAM, configWith({ dir: "C:/samples/mine" }));
    expect(woken).toHaveBeenCalledTimes(1);

    engine.fail = false;
    await sendJam(JAM, configWith(null));
    expect(woken).toHaveBeenCalledTimes(2);

    stop();
    engine.fail = true;
    await sendJam(JAM, configWith(null));
    expect(woken).toHaveBeenCalledTimes(2);
  });

  it("says nothing new while nothing changes", async () => {
    // A send a second lands, and a jam re-pushed on every edit. A watcher
    // woken on every one of those would re-render the sheet for nothing.
    const woken = vi.fn();
    const stop = subscribeJamSend(woken);
    await sendJam(JAM, configWith(null));
    await sendJam(JAM, configWith(null));
    expect(woken).not.toHaveBeenCalled();
    stop();
  });
});
