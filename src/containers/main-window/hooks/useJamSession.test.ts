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
import type { Jam } from "../../../jam/types";

const calls: Array<[string, unknown]> = [];
const stored: { jams: Jam[] | undefined } = { jams: undefined };

vi.mock("../../../ipc", () => ({
  listJams: () => Promise.resolve(stored.jams),
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
});

function mount(view = "jam") {
  return renderHook(
    ({ v }: { v: string }) =>
      useJamSession({ view: v, isPlaying: false, onJamLoaded: () => {} }),
    { initialProps: { v: view } },
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
