/**
 * `useAppHints` off the tools: a Session and the learning side take no hint,
 * and a card already up is put away rather than spent (owner, 2026-11-17: the
 * Drill's "Set start, target and step" turned up over a Session's warm-up).
 *
 * The store is the global `@tauri-apps/plugin-store` mock with a Map behind
 * it, as in `useFirstTimeHint.test.ts`.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { load } from "@tauri-apps/plugin-store";
import { __resetHintRuntimeForTests } from "./hintRuntime";
import { useAppHints, type UseAppHintsArgs } from "./useAppHints";

const values = new Map<string, unknown>();
let store: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> };

beforeAll(async () => {
  store = (await (load as unknown as (n: string, o: unknown) => Promise<never>)(
    "settings.json",
    {},
  )) as unknown as typeof store;
});

beforeEach(() => {
  values.clear();
  __resetHintRuntimeForTests();
  store.get.mockImplementation(async (key: string) => values.get(key));
  store.set.mockImplementation(async (key: string, value: unknown) => {
    values.set(key, value);
  });
});

function args(view: string): UseAppHintsArgs {
  return {
    view,
    bpm: 120,
    subdivision: 1,
    beatGroups: [4],
    isPlaying: false,
    midiDevices: [],
    midiBindings: [],
    onSavePreset: () => {},
    onOpenWidget: () => {},
    onOpenHotkeys: () => {},
  };
}

describe("useAppHints in a Session", () => {
  it("puts the Drill's hint away while a Session is up, and brings it back on the Drill", async () => {
    const hook = renderHook((props: { view: string }) => useAppHints(args(props.view)), {
      initialProps: { view: "drill" },
    });
    await waitFor(() => expect(hook.result.current?.id).toBe("drill-first-open"));
    hook.rerender({ view: "session" });
    expect(hook.result.current).toBeNull();
    hook.rerender({ view: "today" });
    expect(hook.result.current).toBeNull();
    hook.rerender({ view: "drill" });
    expect(hook.result.current?.id).toBe("drill-first-open");
  });

  it("raises no hint at all on the learning side or in a Session", async () => {
    for (const view of ["session", "today", "paths", "progress", "tools"]) {
      __resetHintRuntimeForTests();
      const hook = renderHook(() => useAppHints(args(view)));
      // Long enough for the store read and any slot claim to have happened.
      await new Promise((r) => setTimeout(r, 30));
      expect(hook.result.current, view).toBeNull();
      hook.unmount();
    }
  });
});
