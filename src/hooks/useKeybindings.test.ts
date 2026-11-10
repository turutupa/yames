/**
 * P6: the keymap. The store's names and merge rule decide whether a player keeps
 * the bindings they made (KEY-03 to KEY-06, KEY-10, KEY-12, section 4.4).
 */
import { describe, expect, it } from "vitest";
import { act, fireEvent, renderHook, waitFor } from "@testing-library/react";
import { HOTKEYS } from "../hotkeys";
import { installSettings } from "../test/parity/store";
import { useKeybindings } from "./useKeybindings";

const DEFAULTS = Object.fromEntries(HOTKEYS.map((h) => [h.id, h.key]));

async function mount(stored: Record<string, unknown> = {}) {
  const store = await installSettings(stored);
  const hook = renderHook(() => useKeybindings());
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return { ...hook, store };
}

/** Open the capture modal on an action and press something. */
function capture(
  result: ReturnType<typeof renderHook<ReturnType<typeof useKeybindings>, unknown>>["result"],
  id: string,
  event: KeyboardEventInit,
  type: "key" | "global" = "key",
) {
  act(() => result.current.setBindingFor({ id, type } as never));
  act(() => {
    fireEvent.keyDown(document, event);
  });
}

describe("restoring", () => {
  it("starts from the defaults for everybody", async () => {
    const { result } = await mount();
    expect(result.current.keyBindings).toEqual(DEFAULTS);
    expect(result.current.footBindings).toEqual({});
  });

  it("offers a global default only for the actions that allow one", async () => {
    const { result } = await mount();
    const allowed = HOTKEYS.filter((h) => h.globalAllowed).map((h) => h.id).sort();
    expect(Object.keys(result.current.globalBindings).sort()).toEqual(allowed);
    expect(allowed).toContain("play");
  });

  it("keeps what a player stored, and gives them any action added since", async () => {
    const { result } = await mount({ keyBindings: { play: "P" } });
    await waitFor(() => expect(result.current.keyBindings.play).toBe("P"));
    expect(result.current.keyBindings["bpm-up"]).toBe(DEFAULTS["bpm-up"]);
  });

  it("does not touch the store until it has read it, or a launch would wipe it", async () => {
    const { store } = await mount({ keyBindings: { play: "P" }, footBindings: { play: "b0" } });
    expect(store.values.get("footBindings")).toEqual({ play: "b0" });
    const saved = store.values.get("keyBindings") as Record<string, string>;
    expect(saved.play).toBe("P");
  });

  it("restores the pedal and the global maps under their own names", async () => {
    const { result } = await mount({
      footBindings: { play: "b0" },
      globalBindings: { play: "⌘⇧P" },
    });
    await waitFor(() => expect(result.current.footBindings).toEqual({ play: "b0" }));
    expect(result.current.globalBindings.play).toBe("⌘⇧P");
  });
});

describe("rebinding a key", () => {
  it("saves the new key under the same action id", async () => {
    const { result, store } = await mount();
    capture(result, "play", { key: "p" });
    await waitFor(() => expect(result.current.keyBindings.play).toBe("P"));
    await waitFor(() =>
      expect((store.values.get("keyBindings") as Record<string, string>).play).toBe("P"),
    );
    expect(result.current.bindingFor).toBeNull();
  });

  it("is cancelled by Escape", async () => {
    const { result } = await mount();
    capture(result, "play", { key: "Escape" });
    expect(result.current.bindingFor).toBeNull();
    expect(result.current.keyBindings.play).toBe(DEFAULTS.play);
  });

  it("asks before taking a key from another action", async () => {
    const { result } = await mount();
    capture(result, "play", { key: "t" });
    expect(result.current.pendingKeyConflict).toMatchObject({
      combo: "T",
      conflictAction: "sig-next",
      targetAction: "play",
    });
    expect(result.current.keyBindings.play).toBe(DEFAULTS.play);
  });

  it("takes it if told to, leaving the other action unbound", async () => {
    const { result } = await mount();
    capture(result, "play", { key: "t" });
    act(() => result.current.acceptKeyConflict());
    expect(result.current.keyBindings.play).toBe("T");
    expect(result.current.keyBindings["sig-next"]).toBe("");
  });

  it("leaves both alone if told not to", async () => {
    const { result } = await mount();
    capture(result, "play", { key: "t" });
    act(() => result.current.rejectKeyConflict());
    expect(result.current.pendingKeyConflict).toBeNull();
    expect(result.current.keyBindings["sig-next"]).toBe(DEFAULTS["sig-next"]);
  });

  it("can be put back to the default, one action at a time", async () => {
    const { result } = await mount({ keyBindings: { play: "P" } });
    await waitFor(() => expect(result.current.keyBindings.play).toBe("P"));
    act(() => result.current.setBindingFor({ id: "play", type: "key" } as never));
    act(() => result.current.handleResetBinding());
    expect(result.current.keyBindings.play).toBe(DEFAULTS.play);
  });

  it("can be taken off an action altogether", async () => {
    const { result } = await mount();
    act(() => result.current.setBindingFor({ id: "play", type: "key" } as never));
    act(() => result.current.handleRemoveBinding());
    expect(result.current.keyBindings.play).toBe("");
  });

  it("rebinds a global the same way, in its own map", async () => {
    const { result } = await mount();
    const was = result.current.keyBindings.play;
    capture(result, "play", { key: "g", ctrlKey: true }, "global");
    await waitFor(() => expect(result.current.globalBindings.play).toContain("G"));
    expect(result.current.keyBindings.play).toBe(was);
  });
});

describe("reset all", () => {
  it("puts every map back, the pedals included", async () => {
    const { result } = await mount({
      keyBindings: { play: "P" },
      footBindings: { play: "b0" },
      globalBindings: { play: "⌘⇧P" },
    });
    await waitFor(() => expect(result.current.keyBindings.play).toBe("P"));
    act(() => result.current.setShowResetConfirm(true));
    act(() => result.current.resetAllBindings());
    expect(result.current.keyBindings).toEqual(DEFAULTS);
    expect(result.current.footBindings).toEqual({});
    expect(result.current.globalBindings.play).toBe(
      HOTKEYS.find((h) => h.id === "play")!.globalKey,
    );
    expect(result.current.showResetConfirm).toBe(false);
  });
});
