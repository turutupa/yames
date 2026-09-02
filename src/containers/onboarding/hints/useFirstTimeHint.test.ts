/**
 * `useFirstTimeHint` — the two rules that make hints bearable:
 *   1. a hint fires once, ever (`hints.<id>`);
 *   2. at most one hint per app session (`hints.lastShownSession` + the
 *      in-memory slot), with the session counter advancing on app start.
 *
 * The store is the global `@tauri-apps/plugin-store` mock (src/test/mocks.ts)
 * with its `get`/`set` replaced by a Map, exactly as `useOnboarding.test.ts`
 * does — so every assertion below is against a real settings file's contents.
 * "Restarting the app" is `__resetHintRuntimeForTests()` with the Map kept.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { load } from "@tauri-apps/plugin-store";
import { __resetHintRuntimeForTests, resetHints } from "./hintRuntime";
import { useFirstTimeHint, useHintSession } from "./useFirstTimeHint";
import { APP_SESSION_COUNT_KEY, HINT_LAST_SHOWN_SESSION_KEY } from "./types";

const values = new Map<string, unknown>();
let store: {
  get: ReturnType<typeof import("vitest").vi.fn>;
  set: ReturnType<typeof import("vitest").vi.fn>;
};

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

/** Simulate an app restart: the store survives, the in-memory runtime doesn't. */
function restart() {
  __resetHintRuntimeForTests();
}

describe("the session counter", () => {
  it("starts at 1 and advances once per app start", async () => {
    const first = renderHook(() => useHintSession());
    await waitFor(() => expect(first.result.current.session).toBe(1));
    expect(values.get(APP_SESSION_COUNT_KEY)).toBe(1);

    restart();
    const second = renderHook(() => useHintSession());
    await waitFor(() => expect(second.result.current.session).toBe(2));
    expect(values.get(APP_SESSION_COUNT_KEY)).toBe(2);
  });

  it("does not advance for a second hook in the same session", async () => {
    const a = renderHook(() => useHintSession());
    await waitFor(() => expect(a.result.current.session).toBe(1));
    const b = renderHook(() => useHintSession());
    await waitFor(() => expect(b.result.current.session).toBe(1));
    expect(values.get(APP_SESSION_COUNT_KEY)).toBe(1);
  });
});

describe("a hint fires once", () => {
  it("shows when triggered, and persists that it was shown", async () => {
    const { result } = renderHook(() => useFirstTimeHint("zen-first", true));
    await waitFor(() => expect(result.current.shouldShow).toBe(true));
    // Persisted as soon as it is on screen — a hint the user saw before
    // quitting has still been shown.
    await waitFor(() => expect(values.get("hints.zen-first")).toBe(true));
    expect(values.get(HINT_LAST_SHOWN_SESSION_KEY)).toBe(1);
  });

  it("never shows again once the flag is in the store", async () => {
    values.set("hints.zen-first", true);
    const { result } = renderHook(() => useFirstTimeHint("zen-first", true));
    await waitFor(() => expect(values.get(APP_SESSION_COUNT_KEY)).toBe(1));
    expect(result.current.shouldShow).toBe(false);
  });

  it("does not come back when the trigger fires again in the same session", async () => {
    const { result, rerender } = renderHook(
      ({ on }: { on: boolean }) => useFirstTimeHint("drill-first-open", on),
      { initialProps: { on: true } },
    );
    await waitFor(() => expect(result.current.shouldShow).toBe(true));
    act(() => result.current.markShown());
    expect(result.current.shouldShow).toBe(false);

    // Leaving the Drill tab and coming back must not re-open the card.
    rerender({ on: false });
    rerender({ on: true });
    await waitFor(() => expect(values.get("hints.drill-first-open")).toBe(true));
    expect(result.current.shouldShow).toBe(false);
  });

  it("stays quiet until its trigger fires", async () => {
    const { result, rerender } = renderHook(
      ({ on }: { on: boolean }) => useFirstTimeHint("coach-ask", on),
      { initialProps: { on: false } },
    );
    // Nothing hydrates, nothing persists, nothing shows.
    expect(result.current.shouldShow).toBe(false);
    expect(values.get("hints.coach-ask")).toBeUndefined();
    rerender({ on: true });
    await waitFor(() => expect(result.current.shouldShow).toBe(true));
  });
});

describe("one hint per app session", () => {
  it("two triggers in one session show only the first", async () => {
    const view = renderHook(() => ({
      drill: useFirstTimeHint("drill-first-open", true),
      zen: useFirstTimeHint("zen-first", true),
    }));
    await waitFor(() => expect(view.result.current.drill.shouldShow).toBe(true));
    expect(view.result.current.zen.shouldShow).toBe(false);
    expect(values.get("hints.drill-first-open")).toBe(true);
    expect(values.get("hints.zen-first")).toBeUndefined();
  });

  it("the loser shows on the next session", async () => {
    const first = renderHook(() => ({
      drill: useFirstTimeHint("drill-first-open", true),
      zen: useFirstTimeHint("zen-first", true),
    }));
    await waitFor(() => expect(first.result.current.drill.shouldShow).toBe(true));
    expect(first.result.current.zen.shouldShow).toBe(false);

    restart();
    const second = renderHook(() => ({
      drill: useFirstTimeHint("drill-first-open", true),
      zen: useFirstTimeHint("zen-first", true),
    }));
    await waitFor(() => expect(second.result.current.zen.shouldShow).toBe(true));
    // The one already shown never returns.
    expect(second.result.current.drill.shouldShow).toBe(false);
    expect(values.get(HINT_LAST_SHOWN_SESSION_KEY)).toBe(2);
  });

  it("a second hint stays quiet even after the first is dismissed", async () => {
    const view = renderHook(() => ({
      drill: useFirstTimeHint("drill-first-open", true),
      zen: useFirstTimeHint("zen-first", true),
    }));
    await waitFor(() => expect(view.result.current.drill.shouldShow).toBe(true));
    act(() => view.result.current.drill.markShown());
    // The slot is used for this session — dismissing does not hand it over.
    await waitFor(() => expect(values.get("hints.drill-first-open")).toBe(true));
    expect(view.result.current.zen.shouldShow).toBe(false);
    expect(values.get("hints.zen-first")).toBeUndefined();
  });

  it("respects a lastShownSession left behind at or beyond this session", async () => {
    // Defensive path: the counter failed to advance on the previous run.
    values.set(APP_SESSION_COUNT_KEY, 3);
    values.set(HINT_LAST_SHOWN_SESSION_KEY, 9);
    const { result } = renderHook(() => useFirstTimeHint("zen-first", true));
    await waitFor(() => expect(values.get(APP_SESSION_COUNT_KEY)).toBe(4));
    expect(result.current.shouldShow).toBe(false);
  });
});

describe("resetHints", () => {
  it("clears the shown flags and frees the current session's slot", async () => {
    const first = renderHook(() => useFirstTimeHint("zen-first", true));
    await waitFor(() => expect(first.result.current.shouldShow).toBe(true));
    await waitFor(() => expect(values.get("hints.zen-first")).toBe(true));

    await act(async () => {
      await resetHints();
    });
    expect(values.get("hints.zen-first")).toBeNull();
    expect(values.get(HINT_LAST_SHOWN_SESSION_KEY)).toBeNull();

    // A fresh mount in the same session can show a hint again.
    const second = renderHook(() => useFirstTimeHint("zen-first", true));
    await waitFor(() => expect(second.result.current.shouldShow).toBe(true));
  });

  it("leaves the session counter alone", async () => {
    const view = renderHook(() => useHintSession());
    await waitFor(() => expect(view.result.current.session).toBe(1));
    await act(async () => {
      await resetHints();
    });
    expect(values.get(APP_SESSION_COUNT_KEY)).toBe(1);
  });
});
