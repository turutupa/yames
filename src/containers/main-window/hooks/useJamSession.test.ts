// The one thing in the whole mode that fails silently.
//
// The engine checks `ticksPerBeat × beatsPerBar` against its own bar length and
// plays the plain click when they disagree, rather than guessing (see
// `JamEngineConfig`). So a jam sent in the wrong ORDER — the table before the
// meter it belongs to — is not an error anybody sees: the screen says the
// bossa is loaded and the speakers say tick, tick, tick. That order is what
// this file pins.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { nextChorus, useJamSession } from "./useJamSession";
import { STARTER_JAMS } from "../../../jam/jams";
import { compileJam } from "../../../jam/compile";
import { applyVibe } from "../../../jam/vibes";
import { grooveById } from "../../../jam/grooves";
import { NO_PRACTICE } from "../../../containers/jam/PracticeRow";
import type { Jam, JamEngineConfig, JamPositionCommand } from "../../../jam/types";
import type { BeatEvent } from "../../../types";

const calls: Array<[string, unknown]> = [];
/**
 * The store, plus a latch on the READ.
 *
 * `hold` is how a test makes `listJams` take its time, which is the only way
 * to get at what a fast hand does: press "+" before the library has come back
 * from disk. The read answers with what was there WHEN IT WAS ASKED, exactly
 * as a real round trip does — a write that happened in between is not
 * something an in-flight read can know about.
 */
const stored: {
  jams: Jam[] | undefined;
  hold: Promise<void> | null;
  /** The preferences store, where the last jam you had open is written down. */
  keys: Record<string, unknown>;
} = {
  jams: undefined,
  hold: null,
  keys: {},
};

vi.mock("../../../ipc", () => ({
  listJams: async () => {
    const asked = stored.jams;
    if (stored.hold) await stored.hold;
    return asked;
  },
  saveJams: (jams: Jam[]) => {
    calls.push(["saveJams", jams]);
    stored.jams = jams;
    return Promise.resolve();
  },
  setBpm: (bpm: number) => {
    calls.push(["setBpm", bpm]);
    return Promise.resolve();
  },
  setFreeMode: (on: boolean) => {
    calls.push(["setFreeMode", on]);
    return Promise.resolve();
  },
  setBeatGroups: (groups: number[]) => {
    calls.push(["setBeatGroups", groups]);
    return Promise.resolve();
  },
  setSubdivision: (sub: number) => {
    calls.push(["setSubdivision", sub]);
    return Promise.resolve();
  },
  setJam: (config: unknown) => {
    calls.push(["setJam", config]);
    return Promise.resolve();
  },
  setJamPosition: (command: unknown) => {
    calls.push(["setJamPosition", command]);
    return Promise.resolve();
  },
  warmJam: (request: unknown) => {
    calls.push(["warmJam", request]);
  },
  // The kit preview presses play on its own when the band is stopped (B7).
  togglePlayback: () => {
    calls.push(["togglePlayback", null]);
    return Promise.resolve();
  },
  // Jam now starts the band with the jam's own count-in (JAM_KILLER A4).
  armCountIn: (beats: number) => {
    calls.push(["armCountIn", beats]);
    return Promise.resolve();
  },
  // A Song's last bar takes the transport to stopped, not to quiet (A1). The
  // listener is handed back so a test can be the engine and end the tune.
  setPlaying: (playing: boolean) => {
    calls.push(["setPlaying", playing]);
    return Promise.resolve();
  },
  onJamEnded: (callback: () => void) => {
    jamEnded.add(callback);
    return Promise.resolve(() => {
      jamEnded.delete(callback);
    });
  },
  ttsSpeak: () => Promise.resolve(),
  storeLoad: async (key: string) => stored.keys[key],
  storeSave: (key: string, value: unknown) => {
    calls.push(["storeSave", [key, value]]);
    stored.keys[key] = value;
    return Promise.resolve();
  },
}));

/** Everyone listening for the end of a tune, so a test can be the engine. */
const jamEnded = new Set<() => void>();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function names(of: string) {
  return calls.filter(([name]) => name === of).map(([, arg]) => arg);
}

/** The engine calls, in order, ignoring anything that is not one. */
function engineOrder() {
  return calls
    .filter(([name]) => name !== "saveJams" && name !== "storeSave")
    .map(([name]) => name);
}

beforeEach(() => {
  calls.length = 0;
  stored.jams = undefined;
  stored.hold = null;
  stored.keys = {};
});

type Props = {
  v: string;
  playing?: boolean;
  beat?: BeatEvent | null;
  instrument?: string;
  countingIn?: boolean;
  /** The metronome's own meter, which the jam borrows and gives back. */
  meter?: { subdivision: number; beatGroups: number[]; freeMode: boolean };
};

/**
 * The band a guitarist gets, which is what `mount` asks for below.
 *
 * Spelled out so a test can compile the same config the hook does and compare
 * the two: what the engine was handed, against what it should have been.
 */
const LINEUP = { drums: true, bass: true };

/** A tick, with only the two fields the jam cares about set apart. */
function beatAt(formBar: number, chorus = 1, measureBeat = 0): BeatEvent {
  return {
    beat: 0,
    measureBeat,
    subdivision: 0,
    isDownbeat: measureBeat === 0,
    accentLevel: measureBeat === 0 ? 2 : 0,
    isAccent: measureBeat === 0,
    formBar,
    chorus,
    bandState: "full",
  };
}

function mount(view = "jam", extra: Omit<Props, "v"> = {}) {
  return renderHook(
    ({ v, playing, beat, instrument, countingIn, meter }: Props) =>
      useJamSession({
        view: v,
        isPlaying: playing ?? false,
        onJamLoaded: () => {},
        // A guitarist, so the band is drums and bass — the lineup that has
        // something to say about every test below.
        instrument: instrument ?? "electric-guitar",
        currentBeat: beat ?? null,
        countingIn: countingIn ?? false,
        meter,
      }),
    { initialProps: { v: view, ...extra } },
  );
}

describe("warming the library", () => {
  it("decodes each distinct band the saved jams use, once, a moment after they load", async () => {
    const { result, rerender } = mount();
    await waitFor(() => expect(result.current.jams).toHaveLength(STARTER_JAMS.length));
    // Not straight away: the window is still drawing itself.
    expect(names("warmJam")).toHaveLength(0);
    await waitFor(() => expect(names("warmJam")).toHaveLength(1), { timeout: 4000 });

    const request = calls.find(([n]) => n === "warmJam")![1] as { configs: JamEngineConfig[] };
    const bands = request.configs.map((c) =>
      [c.kit, c.customKit?.dir ?? "", c.bass ? c.bassVoice ?? "" : "-", c.keys ? c.keysVoice ?? "" : "-"].join("|"),
    );
    expect(request.configs.length).toBeGreaterThan(0);
    expect(new Set(bands).size).toBe(bands.length);

    // Once per session, whatever re-renders.
    rerender({ v: "metronome" });
    rerender({ v: "jam" });
    await new Promise((r) => setTimeout(r, 2700));
    expect(names("warmJam")).toHaveLength(1);
  }, 10000);
});

describe("seeding", () => {
  it("seeds the six starters the first time, and saves them", async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.jams).toHaveLength(STARTER_JAMS.length));
    expect(result.current.jams.map((j) => j.name)).toEqual(
      STARTER_JAMS.map((j) => j.name),
    );
    expect(names("saveJams")).toHaveLength(1);
  });

  it("keeps a jam made before the library came back from disk", async () => {
    // The read is a round trip and "+" is a click. Press it first and the
    // resolved list used to land on top of the jam you just made — and on a
    // first run the six starters landed on top of it too. A write wins.
    let release!: () => void;
    stored.hold = new Promise<void>((resolve) => {
      release = resolve;
    });

    const { result } = mount();
    expect(result.current.jams).toHaveLength(0);
    act(() => {
      result.current.newJam();
    });
    const made = result.current.jams[0].id;
    expect(result.current.jams).toHaveLength(1);

    release();
    stored.hold = null;
    await new Promise((r) => setTimeout(r, 10));

    expect(result.current.jams.map((j) => j.id)).toEqual([made]);
    expect((stored.jams ?? []).map((j) => j.id)).toEqual([made]);
  });

  it("leaves a library the user emptied empty", async () => {
    // `undefined` means nothing was ever saved; an empty array means they
    // deleted them all. Re-seeding over that would be the app arguing back.
    stored.jams = [];
    const { result } = mount();
    await waitFor(() => expect(result.current.jams).toEqual([]));
    expect(names("saveJams")).toHaveLength(0);
  });
});

describe("what reaches the engine", () => {
  it("sets the meter before the table, every time", async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.jams).toHaveLength(STARTER_JAMS.length));
    calls.length = 0;

    act(() => result.current.loadJam(result.current.jams[2])); // the bossa
    await waitFor(() => expect(names("setJam")).toHaveLength(1));

    const order = engineOrder();
    expect(order.indexOf("setFreeMode")).toBeLessThan(order.indexOf("setBeatGroups"));
    expect(order.indexOf("setBeatGroups")).toBeLessThan(order.indexOf("setSubdivision"));
    expect(order.indexOf("setSubdivision")).toBeLessThan(order.indexOf("setJam"));
  });

  it("sends the meter the compiled table is actually written in", async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.jams).toHaveLength(STARTER_JAMS.length));
    calls.length = 0;

    const waltz = result.current.jams.find((j) => j.grooveId === "waltz")!;
    act(() => result.current.loadJam(waltz));
    await waitFor(() => expect(names("setJam")).toHaveLength(1));

    const groove = grooveById("waltz");
    expect(names("setBeatGroups")).toEqual([[groove.beatsPerBar]]);
    expect(names("setSubdivision")).toEqual([groove.ticksPerBeat]);
    const config = names("setJam")[0] as { beatsPerBar: number; ticksPerBeat: number };
    expect([config.beatsPerBar, config.ticksPerBeat]).toEqual([
      groove.beatsPerBar,
      groove.ticksPerBeat,
    ]);
  });

  it("follows the feel onto the triplet grid", async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.jams).toHaveLength(STARTER_JAMS.length));
    const rock = result.current.jams.find((j) => j.grooveId === "rock8")!;
    act(() => result.current.loadJam(rock));
    await waitFor(() => expect(names("setJam")).toHaveLength(1));
    calls.length = 0;

    act(() => result.current.editJam({ feel: "shuffle" }));
    await waitFor(() => expect(names("setJam")).toHaveLength(1));
    // Straight eighths were two ticks to the beat; a shuffle is three, and the
    // engine has to be told before it is handed the table.
    expect(names("setSubdivision")).toEqual([3]);
  });

  it("does not restack the bar when only the tempo moves", async () => {
    // Re-sending the meter on every nudge of the BPM would rebuild the bar
    // under a player mid-chorus.
    const { result } = mount();
    await waitFor(() => expect(result.current.jams).toHaveLength(STARTER_JAMS.length));
    act(() => result.current.loadJam(result.current.jams[0]));
    await waitFor(() => expect(names("setJam")).toHaveLength(1));
    calls.length = 0;

    act(() => result.current.editJam({ bpm: 108 }));
    await waitFor(() => expect(names("setBpm")).toEqual([108]));
    expect(names("setJam")).toHaveLength(0);
    expect(names("setBeatGroups")).toHaveLength(0);
  });

  it("sends a fill habit the moment it changes", async () => {
    // "Every 4 bars" is its own field on the config. It used to be missing
    // from the key that decides whether to re-send, so the drummer went on
    // filling at the chorus end until some unrelated edit pushed it.
    const { result } = mount();
    await waitFor(() => expect(result.current.jams).toHaveLength(STARTER_JAMS.length));
    const rock = result.current.jams.find((j) => j.grooveId === "rock8")!;
    act(() => result.current.loadJam({ ...rock, fills: true, fillEvery: 0 }));
    await waitFor(() => expect(names("setJam")).toHaveLength(1));
    calls.length = 0;

    act(() => result.current.editJam({ fillEvery: 4 }));
    await waitFor(() => expect(names("setJam")).toHaveLength(1));
    expect((names("setJam")[0] as JamEngineConfig).fillEvery).toBe(4);
  });

  /**
   * Every setting the compiler reads reaches the engine while the band plays.
   *
   * The owner's report was "when user clicks on one setting or another every
   * setting is loaded in realtime instead of having to pause play again", and
   * the cause was a hand-kept list of the fields that re-send: the
   * arrangement and the count-in were read by `compileJam` and missing from
   * it, so switching a playing jam from Loop to Song did nothing until some
   * unrelated edit pushed the table. The list is the other way round now —
   * the fields that are NOT the band — and this is the test that says so: it
   * reads what the compiler actually touches rather than trusting a list.
   */
  it("sends every setting the band is made of, the moment it changes", async () => {
    // One edit per field the compiler reads, each a real change from the
    // starter's value.
    const edits: Array<[keyof Jam, Partial<Jam>]> = [
      ["arrangement", { arrangement: { mode: "song", choruses: 3 } }],
      ["band", { band: { drums: true, bass: false, keys: true } }],
      ["bassBusy", { bassBusy: "busy" }],
      ["bassStyle", { bassStyle: "walking" }],
      ["bassVoice", { bassVoice: "upright" }],
      ["countIn", { countIn: 8 }],
      ["countInSound", { countInSound: "sticks" }],
      ["feel", { feel: "swing" }],
      ["fillEvery", { fillEvery: 4 }],
      ["fills", { fills: false }],
      ["form", { form: { kind: "loop8", bars: 8 } }],
      ["grooveId", { grooveId: "funk" }],
      ["intensity", { intensity: "loud" }],
      ["key", { key: "Eb" }],
      ["keysStyle", { keysStyle: "arpeggio" }],
      ["keysVoice", { keysVoice: "organ" }],
      ["kit", { kit: "club" }],
      ["mix", { mix: { drums: 0.7, bass: 1, keys: 1, perc: 1 } }],
      ["practice", { practice: { ...NO_PRACTICE, dropOutEvery: 8, dropOutBars: 2 } }],
      ["progression", { progression: ["A7", "D7", "A7", "E7", "A7", "D7", "A7", "E7"] }],
      ["changes", { changes: "quickChange" }],
    ];

    const { result } = mount();
    await waitFor(() => expect(result.current.jams).toHaveLength(STARTER_JAMS.length));
    act(() => result.current.loadJam(result.current.jams[0]));
    await waitFor(() => expect(names("setJam")).toHaveLength(1));

    const silent: string[] = [];
    for (const [field, edit] of edits) {
      calls.length = 0;
      act(() => result.current.editJam(edit));
      await waitFor(() => expect(result.current.jam?.[field]).toBeDefined());
      if (names("setJam").length === 0) silent.push(String(field));
    }
    expect(silent, "these settings wait for the next press of Play").toEqual([]);
  });

  it("does not disturb the band over something only the screen reads", async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.jams).toHaveLength(STARTER_JAMS.length));
    act(() => result.current.loadJam(result.current.jams[0]));
    await waitFor(() => expect(names("setJam")).toHaveLength(1));

    for (const edit of [
      { name: "Another name" },
      { pinnedShape: { root: 9, quality: "7", index: 0 } },
      { shapesFollow: true },
      { chords: true },
    ] as Partial<Jam>[]) {
      calls.length = 0;
      act(() => result.current.editJam(edit));
      await waitFor(() => expect(result.current.jam).toBeTruthy());
      expect(names("setJam"), JSON.stringify(edit)).toHaveLength(0);
    }
  });

  it("takes the band away when you leave the tab, and brings it back", async () => {
    const { result, rerender } = mount();
    await waitFor(() => expect(result.current.jams).toHaveLength(STARTER_JAMS.length));
    act(() => result.current.loadJam(result.current.jams[0]));
    await waitFor(() => expect(names("setJam")).toHaveLength(1));
    calls.length = 0;

    rerender({ v: "beat" });
    await waitFor(() => expect(names("setJam")).toEqual([null]));
    calls.length = 0;

    rerender({ v: "jam" });
    await waitFor(() => expect(names("setJam")).toHaveLength(1));
    expect(names("setJam")[0]).not.toBeNull();
  });

  it("sends nothing at all while no jam of this tab's is loaded", async () => {
    // Not even the clear-down. A setlist step can BE a jam and the runner puts
    // it on the engine while this hook holds nothing; a `setJam(null)` from
    // here would take that band away, from a hook that never loaded anything.
    //
    // On the Setlist tab, because the Jam tab is never empty any more
    // (2026-09-17): standing on it IS asking for a jam, and the hook opens
    // one. Everywhere else it holds nothing and says nothing.
    const { result } = mount("setlist");
    await waitFor(() => expect(result.current.jams).toHaveLength(STARTER_JAMS.length));
    expect(names("setBeatGroups")).toHaveLength(0);
    expect(names("setJam")).toHaveLength(0);
  });

  it("leaves a band it did not put there alone when the tab changes", async () => {
    // The setlist runner's jam step, and the player wanders from Setlist to
    // Metronome to check something. This hook has no jam; every tab change
    // used to send `setJam(null)` anyway and the drummer stopped mid-step.
    const { result, rerender } = mount("setlist");
    await waitFor(() => expect(result.current.jams).toHaveLength(STARTER_JAMS.length));
    calls.length = 0;

    rerender({ v: "beat" });
    rerender({ v: "drill" });
    rerender({ v: "settings" });
    await new Promise((r) => setTimeout(r, 10));
    expect(names("setJam")).toHaveLength(0);
  });
});

/**
 * The bass is the one part of the band that is not a loop, so it is the one
 * part that can be late. These pin when it goes out and what is in it.
 */
describe("the bass, one bar ahead", () => {
  async function loadedBlues(extra: Omit<Props, "v"> = {}) {
    const harness = mount("jam", { playing: true, beat: beatAt(0), ...extra });
    await waitFor(() => expect(harness.result.current.jams).toHaveLength(STARTER_JAMS.length));
    const blues = harness.result.current.jams.find((j) => j.form.kind === "blues12")!;
    act(() => harness.result.current.loadJam(blues));
    await waitFor(() => expect(names("setJam").length).toBeGreaterThan(0));
    return harness;
  }

  function lastConfig(): JamEngineConfig {
    const sent = names("setJam").filter((c) => c !== null);
    return sent[sent.length - 1] as JamEngineConfig;
  }

  it("sends a bass line the same width as the drums", async () => {
    await loadedBlues();
    const config = lastConfig();
    expect(config.bass).not.toBeNull();
    expect(config.bass?.pitches).toHaveLength(config.beatsPerBar * config.ticksPerBeat);
  });

  it("posts the NEXT bar's bass on the bar line, not this one's", async () => {
    const { rerender } = await loadedBlues();
    calls.length = 0;

    // Bar 4 of the blues arrives. Bar 5 is the IV chord, and that is the bass
    // this send has to carry — it lands a few milliseconds into bar 4 and is
    // in time for nothing except bar 5.
    rerender({ v: "jam", playing: true, beat: beatAt(3) });
    await waitFor(() => expect(names("setJam").length).toBeGreaterThan(0));
    const onBarFour = lastConfig().bass?.pitches;

    calls.length = 0;
    rerender({ v: "jam", playing: true, beat: beatAt(4) });
    await waitFor(() => expect(names("setJam").length).toBeGreaterThan(0));
    const onBarFive = lastConfig().bass?.pitches;

    expect(onBarFour).not.toEqual(onBarFive);
  });

  it("says nothing on a bar line where the bass does not change", async () => {
    // A one-chord jam under a rock beat plays the same bar for ever, so every
    // downbeat after the first has nothing to tell the engine. A shuffle
    // would not qualify and should not: its boogie figure is two bars long,
    // so its second bar really is different music.
    const { result, rerender } = await loadedBlues();
    act(() =>
      result.current.editJam({
        grooveId: "rock8",
        feel: "straight",
        form: { kind: "one", bars: 4 },
      }),
    );
    await waitFor(() => expect(result.current.jam?.form.kind).toBe("one"));
    rerender({ v: "jam", playing: true, beat: beatAt(0) });
    await waitFor(() => expect(names("setJam").length).toBeGreaterThan(0));

    calls.length = 0;
    rerender({ v: "jam", playing: true, beat: beatAt(1) });
    await new Promise((r) => setTimeout(r, 10));
    expect(names("setJam")).toHaveLength(0);
  });

  it.each([
    [{ bassStyle: "walking" as const }, (c: JamEngineConfig) => c.bass],
    [{ bassBusy: "busy" as const }, (c: JamEngineConfig) => c.bass],
    [{ changes: "quickChange" }, (c: JamEngineConfig) => c.bass],
    [{ keysStyle: "arpeggio" as const, band: { drums: true, bass: true, keys: true } }, (c: JamEngineConfig) => c.keys],
  ])("re-sends the band when %o is edited", async (edit, lineOf) => {
    // The band pass's controls rewrite a line the engine is holding. A
    // control whose change never reached the engine would be a dead switch.
    const { result } = await loadedBlues();
    if ("band" in edit) {
      act(() => result.current.editJam({ band: edit.band }));
      await waitFor(() => expect(result.current.jam?.band?.keys).toBe(true));
    }
    const before = lineOf(lastConfig());
    calls.length = 0;
    act(() => result.current.editJam(edit));
    await waitFor(() => expect(names("setJam").length).toBeGreaterThan(0));
    expect(lineOf(lastConfig())).not.toEqual(before);
  });

  it("never re-sends the meter on a bar line", async () => {
    // The meter restacks the bar. Doing that on every downbeat would rebuild
    // the music under the player four times a chorus.
    const { rerender } = await loadedBlues();
    calls.length = 0;
    for (const bar of [1, 2, 3, 4, 5, 6, 7, 8]) {
      rerender({ v: "jam", playing: true, beat: beatAt(bar) });
    }
    await new Promise((r) => setTimeout(r, 10));
    expect(names("setBeatGroups")).toHaveLength(0);
    expect(names("setSubdivision")).toHaveLength(0);
  });

  it("never re-sends the meter for an edit that is not a meter", async () => {
    // A mix slider fires `onEdit` per step of the drag — about thirty times a
    // second. Every one of them used to push free mode, the beat groups and
    // the subdivision, which is the bar being restacked under a playing band
    // thirty times a second. The table still goes: the gains are in it.
    const { result } = await loadedBlues();
    calls.length = 0;

    for (const bass of [0.9, 0.8, 0.7, 0.6]) {
      act(() => result.current.editJam({ mix: { drums: 1, bass, keys: 1 } }));
      await waitFor(() => expect(result.current.jam?.mix?.bass).toBe(bass));
    }
    await new Promise((r) => setTimeout(r, 10));

    expect(names("setFreeMode")).toHaveLength(0);
    expect(names("setBeatGroups")).toHaveLength(0);
    expect(names("setSubdivision")).toHaveLength(0);
    expect(names("setJam").length).toBeGreaterThan(0);
  });

  it("sends the loop's first bar at the loop's end, not the bar after it", async () => {
    // The engine wraps a loop at the bar line, so the bar after the loop's
    // last one is its FIRST one. Sending `bar + 1` there put the line of the
    // bar after the loop under the loop's own top, on every single pass.
    const { result, rerender } = await loadedBlues();
    act(() => result.current.position.toggleSectionLoop({ start: 4, end: 7 }));
    await waitFor(() => expect(result.current.position.loop).toEqual({ start: 4, end: 7 }));

    for (const bar of [4, 5, 6]) {
      rerender({ v: "jam", playing: true, beat: beatAt(bar) });
      await new Promise((r) => setTimeout(r, 5));
    }
    calls.length = 0;

    // Bar 7 is the loop's last. What plays next is bar 4 — the IV — and not
    // bar 8, which is the V.
    rerender({ v: "jam", playing: true, beat: beatAt(7) });
    await waitFor(() => expect(names("setJam").length).toBeGreaterThan(0));

    const jam = result.current.jam!;
    const wrapped = compileJam(jam, { formBar: 4, lineup: LINEUP });
    const straight = compileJam(jam, { formBar: 8, lineup: LINEUP });
    expect(lastConfig().bass?.pitches).toEqual(wrapped.bass?.pitches);
    expect(wrapped.bass?.pitches).not.toEqual(straight.bass?.pitches);
  });

  it("sends the bar a pending jump is heading for, not the next one along", async () => {
    // A jump is applied at the next bar line, so the next bar is the target.
    // The bar after the one you happen to be on is the one bar it is not.
    const { result, rerender } = await loadedBlues();
    rerender({ v: "jam", playing: true, beat: beatAt(1) });
    await new Promise((r) => setTimeout(r, 5));

    act(() => result.current.position.jumpTo(8));
    await waitFor(() => expect(result.current.position.pendingJump).toBe(8));
    calls.length = 0;

    rerender({ v: "jam", playing: true, beat: beatAt(2) });
    await waitFor(() => expect(names("setJam").length).toBeGreaterThan(0));

    const jam = result.current.jam!;
    const target = compileJam(jam, { formBar: 8, lineup: LINEUP });
    expect(lastConfig().bass?.pitches).toEqual(target.bass?.pitches);
  });

  it("leaves the bass out for a bass player", async () => {
    await loadedBlues({ instrument: "bass" });
    expect(lastConfig().bass).toBeNull();
  });

  it("never overtakes the meter when a jam is switched mid-song", async () => {
    // The load posts the meter and the table from inside an async function,
    // so the meter lands a microtask later. This effect runs on the same
    // commit, synchronously. Left to itself it posts the next bar's table
    // first, the engine checks it against the meter it has not been given
    // yet, refuses it, and the band is gone with nothing on screen to say so.
    const { result } = mount("jam", { playing: true, beat: beatAt(0) });
    await waitFor(() => expect(result.current.jams).toHaveLength(STARTER_JAMS.length));
    const waltz = result.current.jams.find((j) => j.grooveId === "waltz")!;
    act(() => result.current.loadJam(waltz));
    await waitFor(() => expect(names("setJam").length).toBeGreaterThan(0));
    calls.length = 0;

    // A blues, in another meter entirely, onto a click that is already going.
    const blues = result.current.jams.find((j) => j.form.kind === "blues12")!;
    act(() => result.current.loadJam(blues));
    await waitFor(() => expect(names("setJam").length).toBeGreaterThan(0));

    const order = engineOrder();
    expect(order.indexOf("setBeatGroups")).toBeGreaterThanOrEqual(0);
    expect(order.indexOf("setJam")).toBeGreaterThan(order.indexOf("setSubdivision"));
  });

  it("still posts the next bar on the first bar line of a take", async () => {
    // The guard above must cost exactly one send — the one the load is
    // already making. Press play and the very first downbeat still has to
    // hand the engine bar two, or bar two plays bar one's bass.
    const { result, rerender } = mount("jam", { playing: false, beat: null });
    await waitFor(() => expect(result.current.jams).toHaveLength(STARTER_JAMS.length));
    const blues = result.current.jams.find((j) => j.form.kind === "blues12")!;
    act(() => result.current.loadJam(blues));
    await waitFor(() => expect(names("setJam").length).toBeGreaterThan(0));
    calls.length = 0;

    rerender({ v: "jam", playing: true, beat: beatAt(0) });
    await waitFor(() => expect(names("setJam").length).toBeGreaterThan(0));
  });

  it("says nothing while the count-in is still counting", async () => {
    // The count runs on the same tick grid the form does, so its bars look
    // like bars. A two-bar count crosses a bar line, and a table posted
    // inside it is applied at the top of the form — so bar one of the tune
    // plays bar two's bass, every single time you press play.
    const { result, rerender } = mount("jam", {
      playing: true,
      beat: beatAt(0),
      countingIn: true,
    });
    await waitFor(() => expect(result.current.jams).toHaveLength(STARTER_JAMS.length));
    const blues = result.current.jams.find((j) => j.form.kind === "blues12")!;
    act(() => result.current.loadJam(blues));
    await waitFor(() => expect(names("setJam").length).toBeGreaterThan(0));
    calls.length = 0;

    // The second bar of the count.
    rerender({ v: "jam", playing: true, beat: beatAt(1), countingIn: true });
    await new Promise((r) => setTimeout(r, 10));
    expect(names("setJam")).toHaveLength(0);

    // And the top of the form, which is a bar line worth sending ahead of.
    rerender({ v: "jam", playing: true, beat: beatAt(0), countingIn: false });
    await waitFor(() => expect(names("setJam").length).toBeGreaterThan(0));
  });

  it("keeps playing when a beat event arrives with no form bar on it", async () => {
    // An older engine, or a tick that slipped through before the jam was
    // registered. `undefined + 1` is NaN, the chord lookup comes back empty,
    // and the whole hook used to throw inside the effect — which on this tab
    // means a blank screen. Bar one is the honest answer.
    const bare = beatAt(0) as Partial<BeatEvent>;
    delete bare.formBar;
    const { result, rerender } = mount("jam", { playing: true, beat: beatAt(0) });
    await waitFor(() => expect(result.current.jams).toHaveLength(STARTER_JAMS.length));
    const blues = result.current.jams.find((j) => j.form.kind === "blues12")!;
    act(() => result.current.loadJam(blues));
    await waitFor(() => expect(names("setJam").length).toBeGreaterThan(0));
    calls.length = 0;

    expect(() =>
      rerender({ v: "jam", playing: true, beat: bare as BeatEvent }),
    ).not.toThrow();
    await new Promise((r) => setTimeout(r, 10));
    const sent = names("setJam").filter((c) => c !== null) as JamEngineConfig[];
    for (const config of sent) {
      expect(config.bass?.pitches.every((p) => Number.isFinite(p))).toBe(true);
    }
  });
});

/** Drill's ramp wearing a band: up a step every N choruses, on the downbeat. */
describe("the tempo trainer", () => {
  async function trained(step: number, every: number) {
    const harness = mount("jam", { playing: true, beat: beatAt(0, 1) });
    await waitFor(() => expect(harness.result.current.jams).toHaveLength(STARTER_JAMS.length));
    act(() => harness.result.current.loadJam(harness.result.current.jams[0]));
    act(() =>
      harness.result.current.editJam({
        practice: {
          dropOutEvery: 0,
          dropOutBars: 0,
          tradeBars: 0,
          tempoStep: step,
          tempoEveryChoruses: every,
        },
      }),
    );
    await waitFor(() => expect(harness.result.current.jam?.practice).toBeTruthy());
    return harness;
  }

  it("steps the tempo when a chorus ends, and only on the step", async () => {
    const { result, rerender } = await trained(4, 2);
    const start = result.current.jam!.bpm;
    calls.length = 0;

    // Chorus 1 ends, chorus 2 begins: not a step boundary.
    rerender({ v: "jam", playing: true, beat: beatAt(0, 2) });
    await new Promise((r) => setTimeout(r, 10));
    expect(names("setBpm")).toHaveLength(0);

    // Chorus 2 ends: two choruses done, so up four.
    rerender({ v: "jam", playing: true, beat: beatAt(0, 3) });
    await waitFor(() => expect(names("setBpm")).toEqual([start + 4]));
    expect(result.current.trainedBpm).toBe(start + 4);
  });

  it("does not mark the jam dirty for playing it", async () => {
    // The trainer is something the jam is doing to you, not an edit you made.
    const { result, rerender } = await trained(4, 1);
    act(() => result.current.saveActiveJam());
    await waitFor(() => expect(result.current.dirty).toBe(false));
    const saved = result.current.jam!.bpm;

    rerender({ v: "jam", playing: true, beat: beatAt(0, 2) });
    await waitFor(() => expect(result.current.trainedBpm).toBe(saved + 4));
    expect(result.current.dirty).toBe(false);
    expect(result.current.jam?.bpm).toBe(saved);
  });

  it("puts the jam back at its own tempo when you stop", async () => {
    const { result, rerender } = await trained(4, 1);
    const start = result.current.jam!.bpm;
    rerender({ v: "jam", playing: true, beat: beatAt(0, 2) });
    await waitFor(() => expect(result.current.trainedBpm).toBe(start + 4));
    calls.length = 0;

    rerender({ v: "jam", playing: false, beat: beatAt(0, 2) });
    await waitFor(() => expect(names("setBpm")).toEqual([start]));
    expect(result.current.trainedBpm).toBeNull();
  });

  it("does not carry the climb onto the next jam", async () => {
    // Two jams filed at the same tempo is not a coincidence, it is what a
    // library of your own tunes looks like. Watching only the BPM meant
    // loading the second one left the first one's trained tempo in place,
    // and it started at a speed nobody chose.
    const { result, rerender } = await trained(4, 1);
    const start = result.current.jam!.bpm;
    rerender({ v: "jam", playing: true, beat: beatAt(0, 2) });
    await waitFor(() => expect(result.current.trainedBpm).toBe(start + 4));
    calls.length = 0;

    const other = { ...result.current.jams[1], bpm: start };
    act(() => result.current.loadJam(other));
    await waitFor(() => expect(result.current.trainedBpm).toBeNull());
    expect(names("setBpm")).toContainEqual(start);
  });

  it("stays put when the trainer is off", async () => {
    const { result, rerender } = await trained(0, 0);
    calls.length = 0;
    rerender({ v: "jam", playing: true, beat: beatAt(0, 2) });
    await new Promise((r) => setTimeout(r, 10));
    expect(names("setBpm")).toHaveLength(0);
    expect(result.current.trainedBpm).toBeNull();
  });
});

describe("the library", () => {
  it("saves an edit only when you ask it to, and says so meanwhile", async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.jams).toHaveLength(STARTER_JAMS.length));
    act(() => result.current.loadJam(result.current.jams[0]));
    expect(result.current.dirty).toBe(false);

    act(() => result.current.editJam({ bpm: 108 }));
    await waitFor(() => expect(result.current.dirty).toBe(true));
    expect(result.current.jams[0].bpm).not.toBe(108);

    act(() => result.current.saveActiveJam());
    await waitFor(() => expect(result.current.dirty).toBe(false));
    expect(result.current.jams[0].bpm).toBe(108);
  });

  it("throws the edits away on revert", async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.jams).toHaveLength(STARTER_JAMS.length));
    const original = result.current.jams[0].bpm;
    act(() => result.current.loadJam(result.current.jams[0]));
    act(() => result.current.editJam({ bpm: 108 }));
    await waitFor(() => expect(result.current.dirty).toBe(true));

    act(() => result.current.revertJam());
    await waitFor(() => expect(result.current.dirty).toBe(false));
    expect(result.current.jam?.bpm).toBe(original);
  });

  it("makes a new jam from the one that is loaded", async () => {
    // "+" means "another one like this", not "start again".
    const { result } = mount();
    await waitFor(() => expect(result.current.jams).toHaveLength(STARTER_JAMS.length));
    const bossa = result.current.jams[2];
    act(() => result.current.loadJam(bossa));
    act(() => {
      result.current.newJam();
    });
    await waitFor(() => expect(result.current.jams).toHaveLength(STARTER_JAMS.length + 1));
    const created = result.current.jam!;
    expect(created.id).not.toBe(bossa.id);
    expect(created.grooveId).toBe(bossa.grooveId);
    expect(created.form).toEqual(bossa.form);
    expect(created.bpm).toBe(bossa.bpm);
  });

  it("starts a jam made from nothing with the drummer and nobody else", async () => {
    // plans/JAM_UX_DECISIONS.md B1. The first session's complaint was that a
    // guitarist's brand new jam opened with a bass line already under
    // everything, and "drums alone" was one toggle away nobody would find.
    const { result } = mount("jam", { instrument: "electric-guitar" });
    await waitFor(() => expect(result.current.jams).toHaveLength(STARTER_JAMS.length));
    act(() => {
      result.current.newJam();
    });
    await waitFor(() => expect(result.current.jams).toHaveLength(STARTER_JAMS.length + 1));
    expect(result.current.jam!.band).toEqual({ drums: true, bass: false, keys: false });
  });

  it("gives a drummer's new jam a bass player instead", async () => {
    // A drummer with drums alone has nothing to play against, and the band
    // still never plays your instrument.
    const { result } = mount("jam", { instrument: "drums" });
    await waitFor(() => expect(result.current.jams).toHaveLength(STARTER_JAMS.length));
    act(() => {
      result.current.newJam();
    });
    await waitFor(() => expect(result.current.jams).toHaveLength(STARTER_JAMS.length + 1));
    expect(result.current.jam!.band).toEqual({ drums: false, bass: true, keys: false });
  });

  it("opens the setup sheet on a new jam, and Play leaves it open", async () => {
    // A1. A new jam has nothing set, so the sheet is where you are. Play used
    // to close it; the owner shapes the band while it plays, so it stays.
    const { result, rerender } = mount("jam");
    await waitFor(() => expect(result.current.jams).toHaveLength(STARTER_JAMS.length));
    expect(result.current.screen.setupOpen).toBe(false);

    act(() => {
      result.current.newJam();
    });
    await waitFor(() => expect(result.current.screen.setupOpen).toBe(true));

    rerender({ v: "jam", playing: true });
    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.screen.setupOpen).toBe(true);
  });

  it("takes both sheets away with the jam", async () => {
    // A sheet left down would be the first thing the NEXT jam showed,
    // describing the one before it.
    const { result } = mount();
    await waitFor(() => expect(result.current.jams).toHaveLength(STARTER_JAMS.length));
    act(() => result.current.loadJam(result.current.jams[0]));
    act(() => result.current.screen.setChordsOpen(true));
    await waitFor(() => expect(result.current.screen.chordsOpen).toBe(true));

    act(() => result.current.closeJam());
    await waitFor(() => expect(result.current.screen.chordsOpen).toBe(false));
  });

  it("puts a duplicate next to the jam it came from", async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.jams).toHaveLength(STARTER_JAMS.length));
    const source = result.current.jams[1];
    act(() => result.current.duplicateJam(source.id));
    await waitFor(() => expect(result.current.jams).toHaveLength(STARTER_JAMS.length + 1));
    expect(result.current.jams[2].grooveId).toBe(source.grooveId);
    expect(result.current.jams[2].id).not.toBe(source.id);
  });

  it("keeps the order the library is dragged into", async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.jams).toHaveLength(STARTER_JAMS.length));
    const first = result.current.jams[0].id;
    act(() => result.current.reorderJams(0, 3));
    await waitFor(() => expect(result.current.jams[3].id).toBe(first));
    // And the store holds the new order, not the old one.
    expect((stored.jams ?? [])[3].id).toBe(first);
  });

  it("takes a deleted jam off the stage and puts the next one up", async () => {
    // Deleting the jam you are playing used to leave the tab showing a screen
    // with a button on it. The stage is never empty now (2026-09-17), so the
    // jam goes and another one takes its place — and it is one of the ones
    // that are left, not the one that was just thrown away.
    const { result } = mount();
    await waitFor(() => expect(result.current.jams).toHaveLength(STARTER_JAMS.length));
    const doomed = result.current.jams[0];
    act(() => result.current.loadJam(doomed));
    act(() => result.current.deleteJam(doomed.id));
    await waitFor(() => expect(result.current.jams).toHaveLength(STARTER_JAMS.length - 1));
    await waitFor(() => expect(result.current.jam).not.toBeNull());
    expect(result.current.jam!.id).not.toBe(doomed.id);
    expect(result.current.jams.map((j) => j.id)).toContain(result.current.jam!.id);
  });

  it("does not go dirty over a rename", async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.jams).toHaveLength(STARTER_JAMS.length));
    const target = result.current.jams[0];
    act(() => result.current.loadJam(target));
    act(() => result.current.renameJam(target.id, "Tuesday blues"));
    await waitFor(() => expect(result.current.jam?.name).toBe("Tuesday blues"));
    expect(result.current.dirty).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Moving through the form (JAM_MODE §4.2)
// ---------------------------------------------------------------------------

/** Every position command sent, in order. */
function positions() {
  return names("setJamPosition") as JamPositionCommand[];
}

/** A jam on the stage, with the library settled and the call log wiped. */
async function loaded(
  pick: (jams: Jam[]) => Jam = (jams) => jams[0],
  extra: Omit<Props, "v"> = {},
) {
  const harness = mount("jam", extra);
  await waitFor(() => expect(harness.result.current.jams).toHaveLength(STARTER_JAMS.length));
  const jam = pick(harness.result.current.jams);
  act(() => harness.result.current.loadJam(jam));
  await waitFor(() => expect(harness.result.current.jam?.id).toBe(jam.id));
  calls.length = 0;
  return harness;
}

describe("moving through the form", () => {
  it("asks for the bar you clicked, and keeps the loop that was already set", async () => {
    const { result } = await loaded();

    act(() => result.current.position.toggleSectionLoop({ start: 4, end: 7 }));
    act(() => result.current.position.jumpTo(5));

    expect(positions()).toEqual([
      { jumpTo: null, loop: { start: 4, end: 7 } },
      { jumpTo: 5, loop: { start: 4, end: 7 } },
    ]);
    // And the screen says what it asked for, so the click does not look
    // ignored during the bar before the bar line.
    expect(result.current.position.pendingJump).toBe(5);
  });

  it("holds a jump inside the form rather than naming a bar that is not there", async () => {
    const { result } = await loaded(); // the blues: twelve bars
    act(() => result.current.position.jumpTo(99));
    act(() => result.current.position.jumpTo(-4));
    expect(positions().map((c) => c.jumpTo)).toEqual([11, 0]);
  });

  it("clears the pending mark when a beat event lands on the bar", async () => {
    const { result, rerender } = await loaded((jams) => jams[0], { playing: true });

    act(() => result.current.position.jumpTo(8));
    expect(result.current.position.pendingJump).toBe(8);

    // A bar that is not the one asked for leaves the mark alone: the engine
    // applies a jump at the NEXT bar line, so one bar of not-yet is expected.
    rerender({ v: "jam", playing: true, beat: beatAt(3) });
    expect(result.current.position.pendingJump).toBe(8);

    rerender({ v: "jam", playing: true, beat: beatAt(8) });
    await waitFor(() => expect(result.current.position.pendingJump).toBeNull());
  });

  it("turns one loop off by pressing it again, and only ever holds one", async () => {
    const { result } = await loaded();

    act(() => result.current.position.toggleSectionLoop({ start: 0, end: 3 }));
    expect(result.current.position.loop).toEqual({ start: 0, end: 3 });

    // A different section replaces it rather than joining it.
    act(() => result.current.position.toggleSectionLoop({ start: 8, end: 11 }));
    expect(result.current.position.loop).toEqual({ start: 8, end: 11 });

    act(() => result.current.position.toggleSectionLoop({ start: 8, end: 11 }));
    expect(result.current.position.loop).toBeNull();
    expect(positions().map((c) => c.loop)).toEqual([
      { start: 0, end: 3 },
      { start: 8, end: 11 },
      null,
    ]);
  });

  it("names the bar play will start on, loop and all", async () => {
    // Stopped, with the bridge on repeat: the next press of play starts on the
    // loop's first bar, and a readout saying "bar 1" is a readout that is
    // wrong about the one thing this timeline exists to tell you.
    const { result } = await loaded();
    expect(result.current.position.currentBar).toBe(0);

    act(() => result.current.position.toggleSectionLoop({ start: 4, end: 7 }));
    await waitFor(() => expect(result.current.position.currentBar).toBe(4));

    // A jump wins over the loop, which is the engine's own order for a restart.
    act(() => result.current.position.jumpTo(6));
    await waitFor(() => expect(result.current.position.currentBar).toBe(6));
  });

  it("reads the bar off the beat events while the band plays", async () => {
    const { result, rerender } = await loaded((jams) => jams[0], { playing: true });
    act(() => result.current.position.toggleSectionLoop({ start: 4, end: 7 }));
    rerender({ v: "jam", playing: true, beat: beatAt(5) });
    await waitFor(() => expect(result.current.position.currentBar).toBe(5));
  });

  it("clears the loop on the way out of the tab, and tells the engine", async () => {
    const { result, rerender } = await loaded();
    act(() => result.current.position.toggleSectionLoop({ start: 4, end: 7 }));
    calls.length = 0;

    rerender({ v: "beat" });
    await waitFor(() => expect(result.current.position.loop).toBeNull());
    expect(positions()).toEqual([{ jumpTo: null, loop: null }]);
  });

  it("clears the loop when another jam takes the stage", async () => {
    // It was a loop of THAT jam's bridge. Inheriting it is the bug that gets
    // reported as "the new one skips".
    const { result } = await loaded();
    act(() => result.current.position.toggleSectionLoop({ start: 4, end: 7 }));
    act(() => result.current.loadJam(result.current.jams[1]));
    await waitFor(() => expect(result.current.position.loop).toBeNull());
  });

  it("steps sections at the bar line, wrapping round the form", async () => {
    // The swing standard: AABA, four sections of eight.
    const { result } = await loaded((jams) => jams.find((j) => j.form.kind === "aaba32")!, {
      playing: true,
      beat: beatAt(0),
    });

    act(() => result.current.actions.nextSection());
    expect(positions()[0].jumpTo).toBe(8);

    // From bar 0, "previous" wraps to the last section rather than doing
    // nothing: the form is a circle.
    act(() => result.current.actions.prevSection());
    expect(positions()[1].jumpTo).toBe(24);
  });

  it("loops the section the form is in from one press", async () => {
    const { result } = await loaded((jams) => jams[0], { playing: true, beat: beatAt(6) });

    // Bar 6 of a twelve-bar blues is the middle four.
    act(() => result.current.actions.loopSection());
    expect(result.current.position.loop).toEqual({ start: 4, end: 7 });
    expect(positions()[0]).toEqual({ jumpTo: null, loop: { start: 4, end: 7 } });

    act(() => result.current.actions.loopSection());
    expect(result.current.position.loop).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The meter given back
// ---------------------------------------------------------------------------

describe("the metronome's meter", () => {
  const SEVEN_EIGHT = { subdivision: 4, beatGroups: [7], freeMode: false };

  /** A jam pushed from a 7/8 metronome in sixteenths. */
  async function fromSevenEight() {
    const harness = mount("beat", { meter: SEVEN_EIGHT });
    await waitFor(() => expect(harness.result.current.jams).toHaveLength(STARTER_JAMS.length));
    act(() => harness.result.current.loadJam(harness.result.current.jams[0]));
    harness.rerender({ v: "jam", meter: SEVEN_EIGHT });
    await waitFor(() => expect(names("setJam").length).toBeGreaterThan(0));
    return harness;
  }

  it("gives back the meter the jam borrowed when the tab is left", async () => {
    // Enter Jam from a 7/8 metronome in sixteenths; leave; the engine is asked
    // for 7/8 in sixteenths again. Without this a trip through Jam quietly
    // re-signatures the metronome tab, and nothing on screen says so.
    const { rerender } = await fromSevenEight();
    calls.length = 0;

    // The engine is now in the blues's meter, which is what the metronome tab
    // would otherwise be left holding.
    rerender({ v: "beat", meter: { subdivision: 3, beatGroups: [4], freeMode: false } });
    await waitFor(() => expect(names("setBeatGroups")).toHaveLength(1));

    expect(names("setBeatGroups")[0]).toEqual([7]);
    expect(names("setSubdivision")[0]).toBe(4);
    expect(names("setFreeMode")[0]).toBe(false);
    // The band goes before the meter: the engine checks the two against each
    // other, and a meter arriving under a loaded table is one it may refuse.
    const order = engineOrder();
    expect(order.indexOf("setJam")).toBeLessThan(order.indexOf("setBeatGroups"));
  });

  it("remembers the meter the jam found, not the one the jam set", async () => {
    // Switching grooves inside the tab must not overwrite the snapshot with a
    // waltz's three, or leaving hands the metronome the waltz instead of 7/8.
    const { result, rerender } = await fromSevenEight();

    const waltz = result.current.jams.find((j) => j.grooveId === "waltz")!;
    act(() => result.current.loadJam(waltz));
    rerender({ v: "jam", meter: { subdivision: 2, beatGroups: [3], freeMode: false } });
    await waitFor(() => expect(result.current.jam?.grooveId).toBe("waltz"));
    calls.length = 0;

    rerender({ v: "beat", meter: { subdivision: 2, beatGroups: [3], freeMode: false } });
    await waitFor(() => expect(names("setBeatGroups")).toHaveLength(1));
    expect(names("setBeatGroups")[0]).toEqual([7]);
    expect(names("setSubdivision")[0]).toBe(4);
  });

  it("gives it back the moment the jam leaves the stage, tab or no tab", async () => {
    // The snapshot is handed over on the way out and not a render later. The
    // tab then opens another jam on top of it — it is never empty any more
    // (2026-09-17) — so what this pins is the ORDER: the 7/8 goes back first,
    // and whatever borrows it next borrows it from there.
    const { result } = await fromSevenEight();
    calls.length = 0;

    act(() => result.current.closeJam());
    await waitFor(() => expect(names("setBeatGroups").length).toBeGreaterThan(0));
    expect(names("setBeatGroups")[0]).toEqual([7]);
  });

  it("says nothing about the meter when it was never given one", async () => {
    // A caller that does not pass the metronome's meter gets the old
    // behaviour: the band goes away and nothing else is touched.
    const { rerender } = await loaded();
    rerender({ v: "beat" });
    await waitFor(() => expect(names("setJam")).toHaveLength(1));
    expect(names("setBeatGroups")).toHaveLength(0);
    expect(names("setSubdivision")).toHaveLength(0);
  });
});

/**
 * The two-bar kit audition (JAM_UX_DECISIONS B7), from a STOPPED transport.
 *
 * The path nothing covered, and the one that was broken: `isPlaying` is the
 * engine's state event coming back, so on the render right after the preview
 * presses play it is still false. The preview's own clock read that as
 * "somebody pressed stop", cancelled itself, closed the sheet its button
 * lives on — and left the transport running, because the press it had already
 * sent arrived a moment later with nothing left to end it.
 */
describe("the kit preview", () => {
  it("waits for the transport it started instead of cancelling itself", async () => {
    const { result, rerender } = await loaded();
    act(() => result.current.screen.setSetupOpen(true));

    act(() => result.current.startKitPreview("brushes"));
    // Play has been pressed and the engine has not answered yet.
    expect(names("setPlaying")).toEqual([true]);
    expect(result.current.previewKit).toBe("brushes");
    // The sheet the Preview button sits on is still there, and the audition
    // is still on. This is the render that used to end both.
    expect(result.current.screen.setupOpen).toBe(true);

    rerender({ v: "jam", playing: true, beat: beatAt(0) });
    expect(result.current.previewKit).toBe("brushes");
    expect(result.current.screen.setupOpen).toBe(true);
    const config = names("setJam")
      .filter((c) => c !== null)
      .pop() as JamEngineConfig;
    expect(config.kit).toBe("brushes");

    // Two bar lines, and it puts the transport back where it found it.
    rerender({ v: "jam", playing: true, beat: beatAt(1) });
    rerender({ v: "jam", playing: true, beat: beatAt(2) });
    await waitFor(() => expect(result.current.previewKit).toBeNull());
    expect(names("setPlaying")).toEqual([true, false]);
  });

  it("ends when the player stops the transport under it, and stops there", async () => {
    // The other half of the same waiting rule: once the transport has been
    // HEARD, a stop is a stop. Pressing play again on the way out would leave
    // a band playing that the player had just silenced.
    const { result, rerender } = await loaded();
    act(() => result.current.startKitPreview("tight"));
    rerender({ v: "jam", playing: true, beat: beatAt(0) });
    expect(result.current.previewKit).toBe("tight");

    rerender({ v: "jam", playing: false, beat: beatAt(0) });
    await waitFor(() => expect(result.current.previewKit).toBeNull());
    expect(names("setPlaying")).toEqual([true]);
  });

  it("does not start the band when an audition is ended before it is heard", async () => {
    /*
     * The bug behind "I played a jam for 2 or 3 seconds and hit pause... all
     * of a sudden it started playing by itself again."
     *
     * An audition ended by TOGGLING the transport, and a toggle is a wish
     * about what the transport is currently doing rather than an
     * instruction. Tap Preview and tap it again before the engine has
     * answered the first press — the press is still in flight, `isPlaying`
     * is still false — and "end the audition" arrived at a stopped transport
     * and started the band. Nothing was then left to end it.
     */
    const { result } = await loaded();
    act(() => result.current.startKitPreview("brushes"));
    expect(names("setPlaying")).toEqual([true]);

    // Tapped again, still inside the window where the engine has not
    // answered. This is Stop.
    act(() => result.current.startKitPreview("brushes"));

    expect(
      names("setPlaying"),
      "ending the audition asked the band to play",
    ).toEqual([true, false]);
  });

  it("leaves the transport alone when the band was already playing", async () => {
    // Auditioning INTO the take. Nothing presses play, and nothing presses
    // stop: the preview simply ends and the kit goes back.
    const { result, rerender } = await loaded((jams) => jams[0], {
      playing: true,
      beat: beatAt(0),
    });
    act(() => result.current.startKitPreview("electronic"));
    expect(names("setPlaying")).toHaveLength(0);

    rerender({ v: "jam", playing: true, beat: beatAt(1) });
    rerender({ v: "jam", playing: true, beat: beatAt(2) });
    rerender({ v: "jam", playing: true, beat: beatAt(3) });
    await waitFor(() => expect(result.current.previewKit).toBeNull());
    expect(names("setPlaying")).toHaveLength(0);
  });

  it("leaves the setup sheet open on a play that is not a preview", async () => {
    // A1 used to close it here. The owner shapes the band while it plays, and
    // Play closing the sheet took away the thing being changed (2026-09-16).
    const { result, rerender } = await loaded();
    act(() => result.current.screen.setSetupOpen(true));
    rerender({ v: "jam", playing: true });
    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.screen.setupOpen).toBe(true);
  });
});

/**
 * The vibe audition (JAM_KILLER §2 A4).
 *
 * The same two bars the kit audition plays, of a whole band rather than a
 * drum kit — and the same rule underneath it, which is the part worth
 * pinning: the engine is handed the vibe, the RECORD is not touched, and what
 * was playing before comes back. A preview that edited the jam would be a
 * hover that made the jam dirty, and a library you could not trust.
 */
describe("the vibe preview", () => {
  /** What the engine was last told to play — the drums' own identity. */
  function playing(): { grooveId: unknown; kit: unknown } {
    const config = names("setJam")
      .filter((c) => c !== null)
      .pop() as JamEngineConfig & { grooveId?: unknown };
    return { grooveId: config.name ?? null, kit: config.kit };
  }

  it("hands the engine the vibe, leaves the record alone, and puts it all back", async () => {
    const { result, rerender } = await loaded();
    const before = result.current.jam!;
    const beforeKit = before.kit;

    act(() => result.current.previewVibe("funk"));
    // Stopped, so the audition presses play for itself — no count-in, because
    // a count before a two-bar audition is more count than audition.
    expect(names("setPlaying")).toHaveLength(1);
    expect(names("armCountIn")).toHaveLength(0);
    expect(result.current.previewingVibe).toEqual({
      vibeId: "funk",
      variationId: undefined,
      sounding: true,
    });

    rerender({ v: "jam", playing: true, beat: beatAt(0) });
    const funk = applyVibe(before, "funk");
    // The meter goes out before the table, so the table is a few microtasks
    // behind the press that started the audition.
    await waitFor(() => expect(names("setJam").filter((c) => c !== null)).not.toHaveLength(0));
    const sent = names("setJam")
      .filter((c) => c !== null)
      .pop() as JamEngineConfig;
    // The vibe's own drummer and the vibe's own kit, compiled the ordinary
    // way — this is the real engine, not a sample player beside it.
    expect(sent.kit).toBe(funk.kit);
    /*
     * And exactly HOW the vibe plays, over WHAT the jam plays.
     *
     * The audition takes the groove, the kit, the feel, the loudness, the two
     * voices, the band and the meter; it leaves the tempo, the key, the form
     * and the changes alone. That is what makes hovering Rock and then Funk a
     * comparison of two bands rather than of two clips — so both halves are
     * pinned here: the config IS the first compile, and is NOT the second.
     */
    const howItPlays = {
      ...before,
      grooveId: funk.grooveId,
      customGroove: funk.customGroove,
      kit: funk.kit,
      customKit: funk.customKit,
      feel: funk.feel,
      intensity: funk.intensity,
      bassVoice: funk.bassVoice,
      keysVoice: funk.keysVoice,
      band: funk.band,
      fills: funk.fills,
      fillEvery: funk.fillEvery,
      meter: funk.meter,
    };
    const at = { formBar: 0, lineup: LINEUP, previousVoicing: null };
    expect(sent).toEqual(compileJam(howItPlays, at));
    expect(sent).not.toEqual(compileJam(funk, at));

    // The record is exactly what it was. Not a field of it has moved, and the
    // tempo and the key it was auditioned OVER are the jam's own.
    expect(result.current.jam).toBe(before);
    expect(result.current.jam!.kit).toBe(beforeKit);
    expect(names("setBpm")).toHaveLength(0);

    // Two bar lines, and the jam's own band is back with the transport.
    rerender({ v: "jam", playing: true, beat: beatAt(1) });
    rerender({ v: "jam", playing: true, beat: beatAt(2) });
    await waitFor(() => expect(result.current.previewingVibe).toBeNull());
    expect(names("setPlaying")).toHaveLength(2);
    const back = names("setJam")
      .filter((c) => c !== null)
      .pop() as JamEngineConfig;
    expect(back.kit).toBe(beforeKit);
  });

  it("waits for the bar line when the band is already playing", async () => {
    // Hovering a tile mid-take must not change the drummer under the player's
    // hands halfway through a bar. It arms, the bar turns, and it comes in.
    const { result, rerender } = await loaded((jams) => jams[0], {
      playing: true,
      beat: beatAt(0),
    });
    const before = result.current.jam!;
    calls.length = 0;

    act(() => result.current.previewVibe("jazz"));
    expect(result.current.previewingVibe).toEqual({
      vibeId: "jazz",
      variationId: undefined,
      sounding: false,
    });
    // Nothing has been sent, and nothing has been pressed: the bar that is
    // playing is still the jam's own.
    expect(names("setJam")).toHaveLength(0);
    expect(names("setPlaying")).toHaveLength(0);

    rerender({ v: "jam", playing: true, beat: beatAt(1) });
    expect(result.current.previewingVibe?.sounding).toBe(true);
    const jazz = applyVibe(before, "jazz");
    const sent = names("setJam")
      .filter((c) => c !== null)
      .pop() as JamEngineConfig;
    expect(sent.kit).toBe(jazz.kit);

    // Two bars of it, then the jam's own table — and the transport it did not
    // start is the transport it does not stop.
    rerender({ v: "jam", playing: true, beat: beatAt(2) });
    rerender({ v: "jam", playing: true, beat: beatAt(3) });
    await waitFor(() => expect(result.current.previewingVibe).toBeNull());
    expect(names("setPlaying")).toHaveLength(0);
    expect(result.current.jam).toBe(before);
    const back = names("setJam")
      .filter((c) => c !== null)
      .pop() as JamEngineConfig;
    expect(back.kit).toBe(before.kit);
  });

  it("plays the variation when it is asked for one", async () => {
    const { result, rerender } = await loaded();
    const before = result.current.jam!;
    act(() => result.current.previewVibe("rock", "punk"));
    rerender({ v: "jam", playing: true, beat: beatAt(0) });
    expect(result.current.previewingVibe).toMatchObject({
      vibeId: "rock",
      variationId: "punk",
    });
    const punk = applyVibe(before, "rock", "punk");
    await waitFor(() => expect(names("setJam").filter((c) => c !== null)).not.toHaveLength(0));
    const sent = names("setJam")
      .filter((c) => c !== null)
      .pop() as JamEngineConfig;
    expect(sent.kit).toBe(punk.kit);
    expect(result.current.jam).toBe(before);
  });

  it("asking for the tile that is sounding is Stop", async () => {
    const { result, rerender } = await loaded();
    act(() => result.current.previewVibe("funk"));
    rerender({ v: "jam", playing: true, beat: beatAt(0) });
    expect(result.current.previewingVibe?.sounding).toBe(true);

    act(() => result.current.previewVibe("funk"));
    await waitFor(() => expect(result.current.previewingVibe).toBeNull());
    // And the transport it started goes back where it found it.
    expect(names("setPlaying")).toHaveLength(2);
  });

  it("moving off stops it, and one audition at a time", async () => {
    const { result, rerender } = await loaded();
    act(() => result.current.startKitPreview("brushes"));
    rerender({ v: "jam", playing: true, beat: beatAt(0) });
    expect(result.current.previewKit).toBe("brushes");

    // A vibe over a kit: one overlay, so the kit audition is over.
    act(() => result.current.previewVibe("blues"));
    expect(result.current.previewKit).toBeNull();
    expect(result.current.previewingVibe?.vibeId).toBe("blues");

    act(() => result.current.stopPreview());
    expect(result.current.previewingVibe).toBeNull();
    expect(result.current.previewKit).toBeNull();
  });

  it("says nothing to the engine about a vibe it has never heard of", async () => {
    const { result } = await loaded();
    const before = result.current.jam!;
    calls.length = 0;
    act(() => result.current.previewVibe("skiffle"));
    expect(result.current.previewingVibe).toBeNull();
    expect(names("setJam")).toHaveLength(0);
    expect(names("setPlaying")).toHaveLength(0);
    expect(result.current.jam).toBe(before);
  });
});

/**
 * Jam now (JAM_KILLER §2 A4) — one tap, and a band is playing.
 *
 * What has to be true: the vibe follows the instrument, the jam is named for
 * it and saved, the setup sheet stays shut, the band is counted in with the
 * jam's own count-in, and pressing it twice gives you the same jam rather
 * than a library full of "Rock jam".
 */
describe("Jam now", () => {
  it("makes the jam its instrument asks for and counts the band in", async () => {
    const { result } = mount("jam", { instrument: "bass" });
    await waitFor(() => expect(result.current.jams).toHaveLength(STARTER_JAMS.length));
    calls.length = 0;

    act(() => {
      result.current.jamNow();
    });

    // A bass player gets funk (the plan's table), named for the vibe, saved.
    expect(result.current.jam?.vibe).toBe("funk");
    expect(result.current.jams).toHaveLength(STARTER_JAMS.length + 1);
    // Appended, so it is the last row of the library rather than one of the
    // fifty that ship.
    expect(result.current.jams[STARTER_JAMS.length].id).toBe(result.current.jam?.id);
    expect(names("saveJams")).toHaveLength(1);
    // The point is to be playing, not to be setting up.
    expect(result.current.screen.setupOpen).toBe(false);

    await waitFor(() => expect(names("setPlaying")).toHaveLength(1));
    // The band and the player start together, as the transport button does
    // it — and the count is a whole bar, which is the room the table has to
    // reach the engine before bar one. A jam made this way is never counted
    // in for nothing: `createJam` gives it the groove's own bar of count.
    expect(names("armCountIn")).toEqual([result.current.jam!.countIn]);
    expect(result.current.jam!.countIn).toBeGreaterThan(0);
    // And the table did reach the engine, for this jam.
    await waitFor(() => expect(names("setJam").filter((c) => c !== null)).not.toHaveLength(0));
  });

  it("starts the one it already made instead of making another", async () => {
    const { result, rerender } = mount("jam", { instrument: "electric-guitar" });
    await waitFor(() => expect(result.current.jams).toHaveLength(STARTER_JAMS.length));

    act(() => {
      result.current.jamNow();
    });
    const first = result.current.jam!.id;
    await waitFor(() => expect(names("setPlaying")).toHaveLength(1));
    expect(result.current.jams).toHaveLength(STARTER_JAMS.length + 1);

    // Pressed again, with the band already playing it.
    rerender({ v: "jam", playing: true, beat: beatAt(0), instrument: "electric-guitar" });
    act(() => {
      result.current.jamNow();
    });
    expect(result.current.jams).toHaveLength(STARTER_JAMS.length + 1);
    expect(result.current.jam!.id).toBe(first);
    // Already playing: a second press must not stop it.
    expect(names("setPlaying")).toHaveLength(1);
  });

  it("gives a guitarist rock", async () => {
    const { result } = mount("jam", { instrument: "acoustic-guitar" });
    await waitFor(() => expect(result.current.jams).toHaveLength(STARTER_JAMS.length));
    act(() => {
      result.current.jamNow();
    });
    expect(result.current.jam?.vibe).toBe("rock");
  });

  it("gives a piano player jazz", async () => {
    // Its own test rather than a second mount: the store is module state, so
    // a second harness in one test reads the library the first one wrote.
    const { result } = mount("jam", { instrument: "piano" });
    await waitFor(() => expect(result.current.jams).toHaveLength(STARTER_JAMS.length));
    act(() => {
      result.current.jamNow();
    });
    expect(result.current.jam?.vibe).toBe("jazz");
  });
});

// ---------------------------------------------------------------------------
// The arrangement, one bar ahead (plans/tasks/jam-v4/BRIEF.md A1)
// ---------------------------------------------------------------------------

describe("the arrangement, one bar ahead", () => {
  async function arranged(arrangement: Jam["arrangement"], patch: Partial<Jam> = {}) {
    const harness = mount("jam", { playing: true, beat: beatAt(0) });
    await waitFor(() => expect(harness.result.current.jams).toHaveLength(STARTER_JAMS.length));
    const blues = harness.result.current.jams.find((j) => j.form.kind === "blues12")!;
    act(() => harness.result.current.loadJam(blues));
    await waitFor(() => expect(names("setJam").length).toBeGreaterThan(0));
    act(() => harness.result.current.editJam({ arrangement, ...patch }));
    await waitFor(() => expect(harness.result.current.jam?.arrangement).toEqual(arrangement));
    return harness;
  }

  function lastConfig(): JamEngineConfig {
    const sent = names("setJam").filter((c) => c !== null);
    return sent[sent.length - 1] as JamEngineConfig;
  }

  it("counts the next chorus the way the engine does", () => {
    // Rolling over the last bar of the form starts a new one.
    expect(nextChorus(11, 3, 12, null, null)).toBe(4);
    expect(nextChorus(10, 3, 12, null, null)).toBe(3);
    // A loop does not, and neither does a bar you asked to jump to: both are
    // moving inside the tune, not playing it again from the top.
    expect(nextChorus(11, 3, 12, { start: 0, end: 11 }, null)).toBe(3);
    expect(nextChorus(11, 3, 12, null, 0)).toBe(3);
  });

  it("sends the NEXT chorus's plan on the last bar line of a chorus", async () => {
    const { rerender } = await arranged({ mode: "build" });
    calls.length = 0;
    // The last bar of chorus one. What goes out is chorus TWO's bar one: the
    // whole band in after a chorus of holding back, and a crash on the one.
    rerender({ v: "jam", playing: true, beat: beatAt(11, 1) });
    await waitFor(() => expect(names("setJam").length).toBeGreaterThan(0));
    const config = lastConfig();
    expect(config.bar.crash[0]).toBe(4);
    expect(config.applyAt).toBe("barLine");
    // Chorus one holds the bass to two notes a bar; chorus two does not.
    expect(new Set(config.bass!.pitches.filter((p) => p !== 0)).size).toBeGreaterThan(1);
  });

  it("speaks on a bar line where only the arrangement has changed", async () => {
    // A one-chord jam under a rock beat plays the same bass for ever, so the
    // old signature — the two lines and nothing else — was identical on the
    // bar that starts a new chorus, and the send that carries the plan would
    // have been dropped as a duplicate.
    const { rerender, result } = await arranged(
      { mode: "build" },
      { grooveId: "rock8", feel: "straight", form: { kind: "one", bars: 4 } },
    );
    await waitFor(() => expect(result.current.jam?.form.kind).toBe("one"));
    rerender({ v: "jam", playing: true, beat: beatAt(0, 1) });
    await waitFor(() => expect(names("setJam").length).toBeGreaterThan(0));

    // Two bars into the chorus nothing has changed, and nothing is said.
    calls.length = 0;
    rerender({ v: "jam", playing: true, beat: beatAt(1, 1) });
    await new Promise((r) => setTimeout(r, 10));
    expect(names("setJam")).toHaveLength(0);

    // The last bar of the chorus is another matter: the next bar is the top of
    // chorus two, and the band is about to play it differently.
    calls.length = 0;
    rerender({ v: "jam", playing: true, beat: beatAt(3, 1) });
    await waitFor(() => expect(names("setJam").length).toBeGreaterThan(0));
    expect(lastConfig().applyAt).toBe("barLine");
  });

  it("marks the last bar of a song, and no other", async () => {
    const { rerender } = await arranged({ mode: "song", choruses: 2 });
    calls.length = 0;
    // The bar line before the last bar of chorus two: what goes out is the
    // ending itself.
    rerender({ v: "jam", playing: true, beat: beatAt(10, 2) });
    await waitFor(() => expect(names("setJam").length).toBeGreaterThan(0));
    expect(lastConfig().endsForm).toBe(true);

    calls.length = 0;
    rerender({ v: "jam", playing: true, beat: beatAt(10, 1) });
    await waitFor(() => expect(names("setJam").length).toBeGreaterThan(0));
    expect(lastConfig().endsForm).toBeUndefined();
  });

  it("stops the transport when the engine says the tune ended", async () => {
    await arranged({ mode: "song", choruses: 2 });
    calls.length = 0;
    expect(jamEnded.size).toBeGreaterThan(0);
    act(() => {
      for (const listener of [...jamEnded]) listener();
    });
    // Stopped, not toggled: a toggle arriving after the engine has already
    // stopped itself would start the band again, which is the worst possible
    // answer to a feature whose whole point is an ending. And stopped is what
    // finishes the take — `useJamTakes` ends one when `isPlaying` goes false.
    //
    // Every transport call this hook makes says what it wants now, so the
    // assertion is that the only one here is a stop — never a `true` that
    // could land on a band the player had already silenced.
    await waitFor(() => expect(names("setPlaying")).toEqual([false]));
  });

  it("leaves a looping jam saying nothing new at all", async () => {
    const { rerender } = await arranged({ mode: "loop" });
    for (const bar of [4, 8, 11]) {
      rerender({ v: "jam", playing: true, beat: beatAt(bar, 3) });
      await new Promise((r) => setTimeout(r, 10));
    }
    // Every table the engine was handed, on the load and on every bar line:
    // the engine's own fills and crash, and not one word of arrangement.
    for (const sent of names("setJam").filter((c) => c !== null)) {
      const config = sent as JamEngineConfig;
      expect(config.applyAt).toBeUndefined();
      expect(config.endsForm).toBeUndefined();
      expect(config.crashOnOne).toBe(true);
      expect(config.fill).not.toBeNull();
    }
    expect(names("setJam").filter((c) => c !== null).length).toBeGreaterThan(1);
  });
});

/**
 * The Jam tab is never a screen with a button on it (2026-09-17).
 *
 * The owner's report was that the three modes disagreed with each other about
 * what opening one means: Drill showed a whole drill, Jam and Setlist showed
 * an invitation, and none of them remembered anything from yesterday. The
 * rule is that every mode opens with something live in front of you, and the
 * library holds what you chose to save.
 */
describe("the tab always has a jam on it", () => {
  it("opens on the jam you last had open", async () => {
    // The whole of "it remembers where I was". Without it, coming back to the
    // app meant coming back to an invitation, whatever you were playing the
    // night before.
    stored.jams = [...STARTER_JAMS];
    stored.keys.lastJamId = STARTER_JAMS[2].id;
    const { result } = mount();
    await waitFor(() => expect(result.current.jam?.id).toBe(STARTER_JAMS[2].id));
  });

  it("opens on the first in the library when none was ever open", async () => {
    stored.jams = [...STARTER_JAMS];
    const { result } = mount();
    await waitFor(() => expect(result.current.jam?.id).toBe(STARTER_JAMS[0].id));
  });

  it("opens on the first in the library when the remembered one is gone", async () => {
    // A lookup, not a load by id: a jam you deleted last week is not an answer
    // to "what was I playing", and asking the store for it by name would have
    // put nothing on the stage at all.
    stored.jams = [...STARTER_JAMS];
    stored.keys.lastJamId = "jam-that-was-deleted";
    const { result } = mount();
    await waitFor(() => expect(result.current.jam?.id).toBe(STARTER_JAMS[0].id));
  });

  it("opens a jam the library has never heard of when there are none left", async () => {
    /*
     * A player who deleted every jam they had. The stage still has a band on
     * it — that is the rule — but nothing is filed, because a jam made
     * because somebody clicked a tab is not a jam anybody asked to keep.
     * An empty list rather than no list: the six starters are seeded once and
     * stay deleted, which is the app not arguing with the user.
     */
    stored.jams = [];
    const { result } = mount();
    await waitFor(() => expect(result.current.jam).not.toBeNull());
    expect(result.current.jams).toHaveLength(0);
    expect(names("saveJams")).toHaveLength(0);
    // And Save has something to do, which "no changes" would have denied: a
    // jam that has never been written down always has something to write.
    expect(result.current.unsaved).toBe(true);
    expect(result.current.dirty).toBe(false);
  });

  it("files that jam the moment you ask it to, and not before", async () => {
    stored.jams = [];
    const { result } = mount();
    await waitFor(() => expect(result.current.jam).not.toBeNull());

    act(() => result.current.saveActiveJam());
    await waitFor(() => expect(result.current.jams).toHaveLength(1));
    expect(result.current.unsaved).toBe(false);
    expect(stored.jams).toHaveLength(1);
  });

  it("writes down the jam it opened, so tomorrow opens on the same one", async () => {
    stored.jams = [...STARTER_JAMS];
    const { result } = mount();
    await waitFor(() => expect(result.current.jam).not.toBeNull());
    const target = result.current.jams[3];
    act(() => result.current.loadJam(target));
    await waitFor(() => expect(stored.keys.lastJamId).toBe(target.id));
  });

  it("leaves every other tab alone", async () => {
    // Standing on the Metronome tab is not a request for a band. This used to
    // be the only behaviour there was, and it is still the right one
    // everywhere except the tab whose job is jams.
    stored.jams = [...STARTER_JAMS];
    const { result } = mount("beat");
    await waitFor(() => expect(result.current.jams).toHaveLength(STARTER_JAMS.length));
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.jam).toBeNull();
  });
});

describe("a jam the tab made, once you start working on it", () => {
  it("goes dirty like any other, so nothing can throw it away in silence", async () => {
    /*
     * The gate that asks "you have unsaved work, save it?" reads `dirty`, and
     * the first version of this could never be dirty: there was nothing
     * stored to compare against. So an afternoon spent setting a jam up on a
     * library somebody had emptied disappeared without a word the moment
     * anything else was loaded. The baseline is the jam AS CREATED now.
     */
    stored.jams = [];
    const { result } = mount();
    await waitFor(() => expect(result.current.jam).not.toBeNull());
    expect(result.current.dirty).toBe(false);

    act(() => result.current.editJam({ bpm: 133 }));
    await waitFor(() => expect(result.current.dirty).toBe(true));
    // And it is still in no library — the two facts are separate, and both
    // are true at once.
    expect(result.current.unsaved).toBe(true);
  });
});
