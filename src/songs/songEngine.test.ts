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
  startingMix,
  withGain,
  withMute,
  withSolo,
} from "./songEngine";
import { GUIDE_TRACK_MIX } from "./types";
import type { SongBackingTrack } from "./types";

/** A band of three: the part being learned, a bass and a kit. */
const BAND: SongBackingTrack[] = [
  { role: "synth", name: "Guitar", program: 29, guide: true, notes: [], bends: [] },
  { role: "bass", name: "Bass", program: 33, guide: false, notes: [], bends: [] },
  { role: "drums", name: "Drums", program: 0, guide: false, notes: [], bends: [] },
];

beforeEach(() => store.clear());

describe("what the engine is sent", () => {
  it("starts with the click under the band, which is the engine's own number", () => {
    expect(engineMix(DEFAULT_MIX_SETTING, 3)).toEqual({
      click: 0.45,
      tracks: [1, 1, 1],
    });
  });

  it("sends a muted track as nothing while the fader keeps its level", () => {
    const setting = withMute(withGain(DEFAULT_MIX_SETTING, 2, 0.7), 2, true);
    expect(engineMix(setting, 3).tracks[2]).toBe(0);
    // The point of a mute being its own thing: un-muting brings back 0.7 and
    // not full tilt.
    expect(engineMix(withMute(setting, 2, false), 3).tracks[2]).toBe(0.7);
  });

  it("holds a fader inside what the engine will take", () => {
    expect(engineMix(withGain(DEFAULT_MIX_SETTING, 1, 9), 3).tracks[1]).toBe(1.5);
    expect(engineMix(withGain(DEFAULT_MIX_SETTING, 1, -3), 3).tracks[1]).toBe(0);
    expect(engineMix(withGain(DEFAULT_MIX_SETTING, 1, NaN), 3).tracks[1]).toBe(1);
  });

  it("moves one track and leaves the others where they were", () => {
    const setting = withGain(DEFAULT_MIX_SETTING, 2, 0.2);
    expect(engineMix(setting, 3).tracks).toEqual([1, 1, 0.2]);
  });

  it("silences everybody but the soloed tracks, and gives the band back after", () => {
    // A solo is a thing you do for eight bars and undo, so it must not eat
    // the mutes on the way through: the drums stay off when the solo clears.
    const setting = withMute(withSolo(DEFAULT_MIX_SETTING, 1, true), 2, true);
    expect(engineMix(setting, 3).tracks).toEqual([0, 1, 0]);
    const cleared = withSolo(setting, 1, false);
    expect(engineMix(cleared, 3).tracks).toEqual([1, 1, 0]);
  });

  it("hears two soloed tracks together, which is what a mixer does", () => {
    const setting = withSolo(withSolo(DEFAULT_MIX_SETTING, 0, true), 2, true);
    expect(engineMix(setting, 3).tracks).toEqual([1, 0, 1]);
  });

  it("brings the player's own part back a few dB under the rest", () => {
    // The one level the app has an opinion about. A guide you cannot hear is
    // not a guide, and one as loud as the band is one you play along to
    // instead of playing.
    expect(startingMix(BAND)).toEqual([GUIDE_TRACK_MIX, 1, 1]);
    expect(GUIDE_TRACK_MIX).toBeGreaterThan(0);
    expect(GUIDE_TRACK_MIX).toBeLessThan(1);
  });
});

describe("reading back what was stored", () => {
  it("gives the defaults for a song nobody has touched", () => {
    expect(readMixSetting(undefined)).toEqual(DEFAULT_MIX_SETTING);
  });

  it("gives the defaults back rather than a band at NaN", () => {
    const setting = readMixSetting({
      mix: { click: "loud", tracks: [null, 0.8, "x"] },
      muted: "everything",
      countInBars: 40,
    });
    expect(setting.mix).toEqual({ click: 0.45, tracks: [1, 0.8, 1] });
    expect(setting.muted).toEqual([]);
    expect(setting.countInBars).toBe(0);
  });

  it("keeps only lanes that exist", () => {
    expect(readMixSetting({ muted: ["click", "trombone", 2, -1, 99] }).muted).toEqual([
      "click",
      2,
    ]);
    expect(readMixSetting({ soloed: [1, "bass", 4.5] }).soloed).toEqual([1]);
  });

  it("does not put a band stored before the faders were per track on the wrong instrument", () => {
    // Songs mixed before W28 held four named lanes. There is no honest way
    // to say which track "the drums row" was, so the faders come back at the
    // default and only the click — which meant the same thing in both — is
    // kept. A level is five seconds of work; a level on the wrong instrument
    // is a mystery.
    const setting = readMixSetting({ mix: { click: 0.2, drums: 0.3, bass: 0.4, keys: 0.5 } });
    expect(setting.mix).toEqual({ click: 0.2, tracks: [] });
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
    await saveMixSetting("one", withGain(DEFAULT_MIX_SETTING, 0, 0.3));
    await saveMixSetting("two", withGain(DEFAULT_MIX_SETTING, 0, 1.2));

    expect((await loadMixSetting("one")).mix.tracks[0]).toBe(0.3);
    expect((await loadMixSetting("two")).mix.tracks[0]).toBe(1.2);
    // And a song nobody has set is untouched by either.
    expect((await loadMixSetting("three")).mix.tracks).toEqual([]);
  });

  it("does not lose one song's band to another song's write", async () => {
    // Both in flight together: the write chain is what makes this true, and
    // without it the second read-modify-write drops the first entry.
    await Promise.all([
      saveMixSetting("one", withGain(DEFAULT_MIX_SETTING, 1, 0.1)),
      saveMixSetting("two", withGain(DEFAULT_MIX_SETTING, 1, 0.9)),
    ]);
    expect((await loadMixSetting("one")).mix.tracks[1]).toBe(0.1);
    expect((await loadMixSetting("two")).mix.tracks[1]).toBe(0.9);
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
