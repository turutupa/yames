// The band's faders. Two things are pinned here and both are things a
// musician would report as "it forgot": a mute that takes the fader's level
// with it, and a mix that belongs to the wrong song.
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, unknown>();

vi.mock("../ipc", () => ({
  storeLoad: vi.fn(async (key: string) => store.get(key)),
  storeSave: vi.fn(async (key: string, value: unknown) => {
    store.set(key, value);
  }),
}));

import {
  DEFAULT_MIX_SETTING,
  engineMix,
  forgetMixSetting,
  loadMixSetting,
  readMixSetting,
  rememberPlace,
  saveMixSetting,
  withGain,
  withMute,
} from "./songEngine";

beforeEach(() => store.clear());

describe("what the engine is sent", () => {
  it("starts with the click under the band, which is the engine's own number", () => {
    expect(engineMix(DEFAULT_MIX_SETTING)).toEqual({
      click: 0.45,
      drums: 1,
      bass: 1,
      keys: 1,
    });
  });

  it("sends a muted lane as nothing while the fader keeps its level", () => {
    const setting = withMute(withGain(DEFAULT_MIX_SETTING, "drums", 0.7), "drums", true);
    expect(engineMix(setting).drums).toBe(0);
    // The point of a mute being its own thing: un-muting brings back 0.7 and
    // not full tilt.
    expect(engineMix(withMute(setting, "drums", false)).drums).toBe(0.7);
  });

  it("holds a fader inside what the engine will take", () => {
    expect(engineMix(withGain(DEFAULT_MIX_SETTING, "bass", 9)).bass).toBe(1.5);
    expect(engineMix(withGain(DEFAULT_MIX_SETTING, "bass", -3)).bass).toBe(0);
    expect(engineMix(withGain(DEFAULT_MIX_SETTING, "bass", NaN)).bass).toBe(1);
  });

  it("moves one lane and leaves the others where they were", () => {
    const setting = withGain(DEFAULT_MIX_SETTING, "keys", 0.2);
    expect(setting.mix).toEqual({ click: 0.45, drums: 1, bass: 1, keys: 0.2 });
  });
});

describe("reading back what was stored", () => {
  it("gives the defaults for a song nobody has touched", () => {
    expect(readMixSetting(undefined)).toEqual(DEFAULT_MIX_SETTING);
  });

  it("gives the defaults back rather than a band at NaN", () => {
    const setting = readMixSetting({
      mix: { click: "loud", drums: null, bass: 0.8 },
      muted: "everything",
      countInBars: 40,
    });
    expect(setting.mix).toEqual({ click: 0.45, drums: 1, bass: 0.8, keys: 1 });
    expect(setting.muted).toEqual([]);
    expect(setting.countInBars).toBe(0);
  });

  it("keeps only lanes that exist", () => {
    expect(readMixSetting({ muted: ["drums", "trombone"] }).muted).toEqual(["drums"]);
  });

  /**
   * The microphone's switch has one safe default and this is it. `takes` is
   * read off a file a person can edit and an older build wrote, so anything
   * that is not the literal `true` leaves the mic alone.
   */
  it("records only when the file says exactly true", () => {
    expect(readMixSetting(undefined).takes).toBe(false);
    expect(readMixSetting({}).takes).toBe(false);
    for (const value of ["true", "yes", 1, {}, null]) {
      expect(readMixSetting({ takes: value }).takes, JSON.stringify(value)).toBe(false);
    }
    expect(readMixSetting({ takes: true }).takes).toBe(true);
  });
});

describe("where it is kept", () => {
  it("remembers a band per song, not per app", async () => {
    await saveMixSetting("one", withGain(DEFAULT_MIX_SETTING, "drums", 0.3));
    await saveMixSetting("two", withGain(DEFAULT_MIX_SETTING, "drums", 1.2));

    expect((await loadMixSetting("one")).mix.drums).toBe(0.3);
    expect((await loadMixSetting("two")).mix.drums).toBe(1.2);
    // And a song nobody has set is untouched by either.
    expect((await loadMixSetting("three")).mix.drums).toBe(1);
  });

  it("does not lose one song's band to another song's write", async () => {
    // Both in flight together: the write chain is what makes this true, and
    // without it the second read-modify-write drops the first entry.
    await Promise.all([
      saveMixSetting("one", withGain(DEFAULT_MIX_SETTING, "bass", 0.1)),
      saveMixSetting("two", withGain(DEFAULT_MIX_SETTING, "bass", 0.9)),
    ]);
    expect((await loadMixSetting("one")).mix.bass).toBe(0.1);
    expect((await loadMixSetting("two")).mix.bass).toBe(0.9);
  });

  it("forgets a song's band with the song", async () => {
    await saveMixSetting("one", withMute(DEFAULT_MIX_SETTING, "click", true));
    await forgetMixSetting("one");
    expect(await loadMixSetting("one")).toEqual(DEFAULT_MIX_SETTING);
  });

  it("keeps the count-in with the band it belongs to", async () => {
    await saveMixSetting("one", { ...DEFAULT_MIX_SETTING, countInBars: 2 });
    expect((await loadMixSetting("one")).countInBars).toBe(2);
    expect((await loadMixSetting("two")).countInBars).toBe(0);
  });
});

// Where the player left the song — the loop and the speed (W19). The PORTION
// is READ here and WRITTEN by the stage; `songEngine.ts` says so where the
// field is declared, and the last test below is what keeps that true.
describe("where the player left this song", () => {
  it("starts once through, at full speed, on the whole song", () => {
    expect(DEFAULT_MIX_SETTING.loop).toBe(false);
    expect(DEFAULT_MIX_SETTING.tempoPercent).toBe(100);
    expect(DEFAULT_MIX_SETTING.range).toBeUndefined();
  });

  it("puts back the loop and the speed the song was left at", async () => {
    await rememberPlace("one", { loop: true, tempoPercent: 70 });
    const back = await loadMixSetting("one");
    expect(back.loop).toBe(true);
    expect(back.tempoPercent).toBe(70);
    // ...and only for that song.
    expect((await loadMixSetting("two")).loop).toBe(false);
    expect((await loadMixSetting("two")).tempoPercent).toBe(100);
  });

  it("does not take the faders with it", async () => {
    // Two writers, different hooks: the transport owns the loop and the
    // stage owns the band. A whole-object write from either would clobber
    // the other, and this is the half that would go unnoticed.
    await saveMixSetting("one", withGain(DEFAULT_MIX_SETTING, "drums", 0.2));
    await rememberPlace("one", { loop: true });
    const back = await loadMixSetting("one");
    expect(back.mix.drums).toBe(0.2);
    expect(back.loop).toBe(true);
  });

  it("mistrusts a loop and a speed it reads back", () => {
    // Only an explicit `true` loops: a song that starts going round when the
    // player expected one pass is a surprise with a guitar on.
    for (const junk of ["yes", 1, undefined, null]) {
      expect(readMixSetting({ loop: junk }).loop, String(junk)).toBe(false);
    }
    for (const junk of [0, 24, 101, 250, "80", Number.NaN]) {
      expect(readMixSetting({ tempoPercent: junk }).tempoPercent, String(junk)).toBe(100);
    }
    expect(readMixSetting({ tempoPercent: 70 }).tempoPercent).toBe(70);
  });

  it("reads the portion the stage wrote, and refuses a nonsense one", () => {
    expect(readMixSetting({ range: { startBar: 16, endBar: 23 } }).range).toEqual({
      startBar: 16,
      endBar: 23,
    });
    for (const junk of [
      { startBar: 4, endBar: 2 },
      { startBar: -1, endBar: 3 },
      { startBar: 1.5, endBar: 3 },
      { startBar: 0 },
      {},
      "bars 1 to 8",
    ]) {
      expect(readMixSetting({ range: junk }).range, JSON.stringify(junk)).toBeUndefined();
    }
  });

  it("never writes the portion itself — that writer is the stage", async () => {
    // The whole reason the field is read-only here: two writers of one fact
    // is how a player ends up looping bars they did not choose.
    await saveMixSetting("one", { ...DEFAULT_MIX_SETTING, range: { startBar: 4, endBar: 7 } });
    await rememberPlace("one", { loop: true, tempoPercent: 60 });
    expect((await loadMixSetting("one")).range).toEqual({ startBar: 4, endBar: 7 });
  });
});
