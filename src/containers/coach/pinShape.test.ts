/** "Pin this shape" (leg c5a1): one press, a receipt, Undo to exactly what was there; refused during a Take. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createJam } from "../../jam/jams";
import type { Jam } from "../../jam/types";
import { UNDO_MS } from "./askTools";
import { pinRecord, pressPinShape, pressPinUndo, registerJamPin, resetPinsForTests, type JamPin } from "./pinShape";

afterEach(() => resetPinsForTests());

/** A stage: the jam on it, and the sheet's edit writing into it as `editJam` does. */
function stage(start: JamPin | null, over: { take?: boolean; neck?: "guitar" | "bass" | null; onJam?: boolean } = {}) {
  let jam: Jam = { ...createJam("Slow rock", { key: "Am" }), pinnedShape: start };
  let take = over.take ?? false;
  let onJam = over.onJam ?? true;
  const setPin = vi.fn((pin: JamPin | null) => {
    jam = { ...jam, pinnedShape: pin };
  });
  registerJamPin({
    jamOnScreen: () => (onJam ? jam : null),
    neck: () => (over.neck === undefined ? "guitar" : over.neck),
    takeNow: () => take,
    setPin,
  });
  return {
    setPin,
    pin: () => jam.pinnedShape ?? null,
    takeStarts: () => (take = true),
    takeEnds: () => (take = false),
    leaveJam: () => (onJam = false),
    swapJam: () => (jam = { ...createJam("Other"), pinnedShape: jam.pinnedShape }),
    pinBySheet: (pin: JamPin | null) => (jam = { ...jam, pinnedShape: pin }),
  };
}

const AM7 = { kind: "pinShape" as const, chord: "Am7", shape: 1 };
const AM7_PIN: JamPin = { root: 9, quality: "m7", index: 1 };
const G_PIN: JamPin = { root: 7, quality: "maj", index: 0 };

describe("pressPinShape", () => {
  it("nothing is pinned until the press; the press pins through the sheet's edit, with a receipt", () => {
    const s = stage(null);
    expect(s.setPin).not.toHaveBeenCalled();
    pressPinShape("t1", AM7, 1_000);
    expect(s.setPin).toHaveBeenCalledTimes(1);
    expect(s.pin()).toEqual(AM7_PIN);
    expect(pinRecord("t1")).toMatchObject({ state: "live", until: 1_000 + UNDO_MS, receipt: { key: "jam.pin.done", values: { chord: "Am7", shape: 2 } } });
    // a second press on the same receipt does nothing more
    pressPinShape("t1", AM7, 1_100);
    expect(s.setPin).toHaveBeenCalledTimes(1);
  });

  it("Undo restores the shape pinned before", () => {
    const s = stage(G_PIN);
    pressPinShape("t1", AM7, 1_000);
    pressPinUndo("t1", 2_000);
    expect(s.pin()).toEqual(G_PIN);
    expect(pinRecord("t1")).toMatchObject({ state: "done", note: { key: "jam.pin.restored" } });
  });

  it("Undo restores none when nothing was pinned before", () => {
    const s = stage(null);
    pressPinShape("t1", AM7, 1_000);
    pressPinUndo("t1", 2_000);
    expect(s.pin()).toBeNull();
    expect(pinRecord("t1")).toMatchObject({ state: "done", note: { key: "jam.pin.cleared" } });
  });

  it("Undo leaves a pin changed since alone, and goes after its few seconds", () => {
    const s = stage(G_PIN);
    pressPinShape("t1", AM7, 1_000);
    s.pinBySheet({ root: 0, quality: "maj", index: 2 });
    pressPinUndo("t1", 2_000);
    expect(s.pin()).toEqual({ root: 0, quality: "maj", index: 2 });
    expect(pinRecord("t1")).toMatchObject({ state: "gone", note: { key: "jam.pin.changed" } });

    const t = stage(G_PIN);
    pressPinShape("t2", AM7, 1_000);
    t.swapJam();
    pressPinUndo("t2", 2_000);
    expect(pinRecord("t2")).toMatchObject({ state: "gone" });

    const u = stage(G_PIN);
    pressPinShape("t3", AM7, 1_000);
    pressPinUndo("t3", 1_000 + UNDO_MS);
    expect(u.pin()).toEqual(AM7_PIN);
    expect(pinRecord("t3")).toMatchObject({ state: "live" });
  });

  it("refused during a Take: nothing changes, and it says why", () => {
    const s = stage(G_PIN, { take: true });
    pressPinShape("t1", AM7, 1_000);
    expect(s.setPin).not.toHaveBeenCalled();
    expect(s.pin()).toEqual(G_PIN);
    expect(pinRecord("t1")).toEqual({ state: "refused", note: { key: "coachTools.why.notNow.take", values: {} } });
    // pressable again once the Take is over
    s.takeEnds();
    pressPinShape("t1", AM7, 5_000);
    expect(s.pin()).toEqual(AM7_PIN);
  });

  it("Undo refused during a Take", () => {
    const s = stage(G_PIN);
    pressPinShape("t1", AM7, 1_000);
    s.takeStarts();
    pressPinUndo("t1", 2_000);
    expect(s.pin()).toEqual(AM7_PIN);
    expect(pinRecord("t1")).toMatchObject({ state: "refusedUndo", note: { key: "coachTools.why.notNow.take" } });
  });

  it("refused off the Jam screen, without a neck, for a grip the neck does not have, and with no door", () => {
    const off = stage(null, { onJam: false });
    pressPinShape("a", AM7);
    expect(off.setPin).not.toHaveBeenCalled();
    expect(pinRecord("a")).toMatchObject({ state: "refused", note: { key: "coachTools.why.notNow.here" } });

    const horn = stage(null, { neck: null });
    pressPinShape("b", AM7);
    expect(horn.setPin).not.toHaveBeenCalled();
    expect(pinRecord("b")).toMatchObject({ state: "refused", note: { key: "jam.pin.noNeck" } });

    const far = stage(null);
    pressPinShape("c", { kind: "pinShape", chord: "Am7", shape: 99 });
    expect(far.setPin).not.toHaveBeenCalled();
    expect(pinRecord("c")).toMatchObject({ state: "refused", note: { key: "jam.pin.noShape", values: { chord: "Am7" } } });

    resetPinsForTests();
    pressPinShape("d", AM7);
    expect(pinRecord("d")).toMatchObject({ state: "refused" });
  });
});
