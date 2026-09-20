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
