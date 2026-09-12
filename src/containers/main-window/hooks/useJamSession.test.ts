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
import { useJamSession } from "./useJamSession";
import { STARTER_JAMS } from "../../../jam/jams";
import { grooveById } from "../../../jam/grooves";
import type { Jam, JamEngineConfig } from "../../../jam/types";
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
const stored: { jams: Jam[] | undefined; hold: Promise<void> | null } = {
  jams: undefined,
  hold: null,
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
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function names(of: string) {
  return calls.filter(([name]) => name === of).map(([, arg]) => arg);
}

/** The engine calls, in order, ignoring anything that is not one. */
function engineOrder() {
  return calls
    .filter(([name]) => name !== "saveJams")
    .map(([name]) => name);
}

beforeEach(() => {
  calls.length = 0;
  stored.jams = undefined;
  stored.hold = null;
});

type Props = {
  v: string;
  playing?: boolean;
  beat?: BeatEvent | null;
  instrument?: string;
  countingIn?: boolean;
};

/** A tick, with only the two fields the jam cares about set apart. */
function beatAt(formBar: number, chorus = 1, measureBeat = 0): BeatEvent {
  return {
    beat: 0,
    measureBeat,
    subdivision: 0,
    isDownbeat: measureBeat === 0,
    isAccent: measureBeat === 0,
    formBar,
    chorus,
    bandState: "full",
  };
}

function mount(view = "jam", extra: Omit<Props, "v"> = {}) {
  return renderHook(
    ({ v, playing, beat, instrument, countingIn }: Props) =>
      useJamSession({
        view: v,
        isPlaying: playing ?? false,
        onJamLoaded: () => {},
        // A guitarist, so the band is drums and bass — the lineup that has
        // something to say about every test below.
        instrument: instrument ?? "electric-guitar",
        currentBeat: beat ?? null,
        countingIn: countingIn ?? false,
      }),
    { initialProps: { v: view, ...extra } },
  );
}

describe("seeding", () => {
  it("seeds the six starters the first time, and saves them", async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.jams).toHaveLength(6));
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
    await waitFor(() => expect(result.current.jams).toHaveLength(6));
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
    await waitFor(() => expect(result.current.jams).toHaveLength(6));
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
    await waitFor(() => expect(result.current.jams).toHaveLength(6));
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
    await waitFor(() => expect(result.current.jams).toHaveLength(6));
    act(() => result.current.loadJam(result.current.jams[0]));
    await waitFor(() => expect(names("setJam")).toHaveLength(1));
    calls.length = 0;

    act(() => result.current.editJam({ bpm: 108 }));
    await waitFor(() => expect(names("setBpm")).toEqual([108]));
    expect(names("setJam")).toHaveLength(0);
    expect(names("setBeatGroups")).toHaveLength(0);
  });

  it("takes the band away when you leave the tab, and brings it back", async () => {
    const { result, rerender } = mount();
    await waitFor(() => expect(result.current.jams).toHaveLength(6));
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

  it("sends nothing but the clear-down while the jam tab is empty", async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.jams).toHaveLength(6));
    expect(names("setBeatGroups")).toHaveLength(0);
    expect(names("setJam")).toEqual([null]);
  });
});

/**
 * The bass is the one part of the band that is not a loop, so it is the one
 * part that can be late. These pin when it goes out and what is in it.
 */
describe("the bass, one bar ahead", () => {
  async function loadedBlues(extra: Omit<Props, "v"> = {}) {
    const harness = mount("jam", { playing: true, beat: beatAt(0), ...extra });
    await waitFor(() => expect(harness.result.current.jams).toHaveLength(6));
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
    await waitFor(() => expect(result.current.jams).toHaveLength(6));
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
    await waitFor(() => expect(result.current.jams).toHaveLength(6));
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
    await waitFor(() => expect(result.current.jams).toHaveLength(6));
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
    await waitFor(() => expect(result.current.jams).toHaveLength(6));
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
    await waitFor(() => expect(harness.result.current.jams).toHaveLength(6));
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
    await waitFor(() => expect(result.current.jams).toHaveLength(6));
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
    await waitFor(() => expect(result.current.jams).toHaveLength(6));
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
    await waitFor(() => expect(result.current.jams).toHaveLength(6));
    const bossa = result.current.jams[2];
    act(() => result.current.loadJam(bossa));
    act(() => {
      result.current.newJam();
    });
    await waitFor(() => expect(result.current.jams).toHaveLength(7));
    const created = result.current.jam!;
    expect(created.id).not.toBe(bossa.id);
    expect(created.grooveId).toBe(bossa.grooveId);
    expect(created.form).toEqual(bossa.form);
    expect(created.bpm).toBe(bossa.bpm);
  });

  it("puts a duplicate next to the jam it came from", async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.jams).toHaveLength(6));
    const source = result.current.jams[1];
    act(() => result.current.duplicateJam(source.id));
    await waitFor(() => expect(result.current.jams).toHaveLength(7));
    expect(result.current.jams[2].grooveId).toBe(source.grooveId);
    expect(result.current.jams[2].id).not.toBe(source.id);
  });

  it("keeps the order the library is dragged into", async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.jams).toHaveLength(6));
    const first = result.current.jams[0].id;
    act(() => result.current.reorderJams(0, 3));
    await waitFor(() => expect(result.current.jams[3].id).toBe(first));
    // And the store holds the new order, not the old one.
    expect((stored.jams ?? [])[3].id).toBe(first);
  });

  it("closes a jam it deletes, and leaves the others alone", async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.jams).toHaveLength(6));
    const doomed = result.current.jams[0];
    act(() => result.current.loadJam(doomed));
    act(() => result.current.deleteJam(doomed.id));
    await waitFor(() => expect(result.current.jams).toHaveLength(5));
    expect(result.current.jam).toBeNull();
  });

  it("does not go dirty over a rename", async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.jams).toHaveLength(6));
    const target = result.current.jams[0];
    act(() => result.current.loadJam(target));
    act(() => result.current.renameJam(target.id, "Tuesday blues"));
    await waitFor(() => expect(result.current.jam?.name).toBe("Tuesday blues"));
    expect(result.current.dirty).toBe(false);
  });
});
