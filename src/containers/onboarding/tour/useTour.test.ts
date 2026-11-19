/**
 * Tour lifecycle: stop navigation, the tab switch/restore around the drill
 * stop, `tour.seenVersion` persistence, and the one-time offer for a migrated
 * existing user.
 *
 * Same store strategy as `useOnboarding.test.ts` — the global
 * `@tauri-apps/plugin-store` mock is given a real in-memory map.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { load } from "@tauri-apps/plugin-store";
import { LEARN_STOPS, TOUR_SEEN_KEY, TOUR_STOPS, TOUR_VERSION, type TourView } from "./stops";
import { useTour } from "./useTour";

const values = new Map<string, unknown>();
let store: {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
};

beforeAll(async () => {
  store = (await (load as unknown as (n: string, o: unknown) => Promise<never>)(
    "settings.json",
    {},
  )) as unknown as typeof store;
});

beforeEach(() => {
  values.clear();
  store.get.mockImplementation(async (key: string) => values.get(key));
  store.set.mockImplementation(async (key: string, value: unknown) => {
    values.set(key, value);
  });
});

/**
 * Mount the hook with a live `view` — the hook drives `setView`, and the next
 * render has to see the result or the tab-sync effect is untestable.
 */
async function mount(initialView: TourView | "settings" = "beat", offerWhen = false) {
  const setView = vi.fn();
  let view: TourView | "settings" = initialView;
  setView.mockImplementation((v: TourView) => {
    view = v;
  });
  const hook = renderHook(() => useTour({ view, setView, offerWhen }));
  await waitFor(() => expect(hook.result.current.hydrated).toBe(true));
  return {
    ...hook,
    setView,
    get view() {
      return view;
    },
    // Re-render so the hook sees the tab `setView` just applied.
    sync: () => hook.rerender(),
  };
}

describe("navigation", () => {
  it("starts closed", async () => {
    const { result } = await mount();
    expect(result.current.isOpen).toBe(false);
    expect(result.current.index).toBe(-1);
    expect(result.current.kind).toBe("learn");
    expect(result.current.total).toBe(LEARN_STOPS.length);
  });

  it("opens at the first stop and walks forward", async () => {
    const { result } = await mount();
    act(() => result.current.open(undefined, "tools"));
    expect(result.current.isOpen).toBe(true);
    expect(result.current.index).toBe(0);
    expect(result.current.stop?.id).toBe("bpm");
    act(() => result.current.next());
    expect(result.current.stop?.id).toBe("subdivision");
  });

  it("walks back but never past the first stop", async () => {
    const { result } = await mount();
    act(() => result.current.open(undefined, "tools"));
    act(() => result.current.next());
    act(() => result.current.prev());
    expect(result.current.index).toBe(0);
    act(() => result.current.prev());
    expect(result.current.index).toBe(0);
    expect(result.current.isOpen).toBe(true);
  });

  it("Next on the last stop finishes the tour", async () => {
    const { result } = await mount();
    act(() => result.current.open(undefined, "tools"));
    for (let i = 0; i < TOUR_STOPS.length - 1; i++) act(() => result.current.next());
    expect(result.current.index).toBe(TOUR_STOPS.length - 1);
    act(() => result.current.next());
    expect(result.current.isOpen).toBe(false);
  });
});

describe("tab switch and restore", () => {
  it("switches to the drill tab for the drill stop", async () => {
    const view = await mount("beat");
    act(() => view.result.current.open(undefined, "tools"));
    expect(view.setView).not.toHaveBeenCalled();
    // Stops 1–3 live on the metronome tab; stop 4 is the drill tab.
    act(() => view.result.current.next());
    act(() => view.result.current.next());
    act(() => view.result.current.next());
    expect(view.result.current.stop?.id).toBe("drill-tab");
    expect(view.setView).toHaveBeenCalledWith("drill");
  });

  it("comes back to the metronome tab for the stops after it", async () => {
    const view = await mount("beat");
    act(() => view.result.current.open(undefined, "tools"));
    for (let i = 0; i < 3; i++) act(() => view.result.current.next());
    view.sync();
    expect(view.view).toBe("drill");
    act(() => view.result.current.next());
    view.sync();
    expect(view.view).toBe("beat");
  });

  it("restores the tab the user came from when the tour ends", async () => {
    const view = await mount("drill");
    act(() => view.result.current.open(undefined, "tools"));
    view.sync();
    expect(view.view).toBe("beat"); // stop 1 needs the metronome tab
    act(() => view.result.current.close());
    view.sync();
    expect(view.view).toBe("drill");
  });

  it("restores the tab after finishing on the last stop too", async () => {
    const view = await mount("drill");
    act(() => view.result.current.open(undefined, "tools"));
    for (let i = 0; i < TOUR_STOPS.length; i++) act(() => view.result.current.next());
    view.sync();
    expect(view.result.current.isOpen).toBe(false);
    expect(view.view).toBe("drill");
  });

  it("never restores to settings — a tour has no home there", async () => {
    const view = await mount("settings");
    act(() => view.result.current.open(undefined, "tools"));
    act(() => view.result.current.close());
    view.sync();
    expect(view.view).toBe("beat");
  });

  it("the learning tour goes back to Today when opened from settings", async () => {
    const view = await mount("settings");
    act(() => view.result.current.open());
    act(() => view.result.current.close());
    view.sync();
    expect(view.view).toBe("today");
  });

  it("honours an explicit restore target (Settings → Take the tour)", async () => {
    const view = await mount("settings");
    act(() => view.result.current.open("drill", "tools"));
    act(() => view.result.current.close());
    view.sync();
    expect(view.view).toBe("drill");
  });
});

describe("tour.seenVersion", () => {
  it("is undefined until the tour has ever run", async () => {
    const { result } = await mount();
    expect(result.current.seenVersion).toBeUndefined();
    expect(values.get(TOUR_SEEN_KEY)).toBeUndefined();
  });

  it("is written when the tour is finished", async () => {
    const { result } = await mount();
    act(() => result.current.open());
    for (let i = 0; i < LEARN_STOPS.length; i++) act(() => result.current.next());
    await waitFor(() => expect(values.get(TOUR_SEEN_KEY)).toBe(TOUR_VERSION));
    expect(result.current.seenVersion).toBe(TOUR_VERSION);
  });

  it("is written when the tour is dismissed part-way", async () => {
    const { result } = await mount();
    act(() => result.current.open());
    act(() => result.current.next());
    act(() => result.current.close());
    await waitFor(() => expect(values.get(TOUR_SEEN_KEY)).toBe(TOUR_VERSION));
  });

  it("is not written by the tools' tour, which says nothing about the learning side", async () => {
    const { result } = await mount();
    act(() => result.current.open(undefined, "tools"));
    act(() => result.current.close());
    await new Promise((r) => setTimeout(r, 10));
    expect(values.get(TOUR_SEEN_KEY)).toBeUndefined();
  });

  it("is read back on mount", async () => {
    values.set(TOUR_SEEN_KEY, TOUR_VERSION);
    const { result } = await mount();
    expect(result.current.seenVersion).toBe(TOUR_VERSION);
  });
});

describe("the existing-user offer", () => {
  it("does not appear for a user who is not being migrated", async () => {
    const { result } = await mount("beat", false);
    expect(result.current.offerVisible).toBe(false);
  });

  it("appears once for a migrated existing user", async () => {
    const { result } = await mount("beat", true);
    await waitFor(() => expect(result.current.offerVisible).toBe(true));
  });

  it("appears once for a player who saw only version 1 (the tools)", async () => {
    values.set(TOUR_SEEN_KEY, 1);
    const { result } = await mount("today", true);
    await waitFor(() => expect(result.current.offerVisible).toBe(true));
  });

  it("does not appear for a store written by a newer build", async () => {
    values.set(TOUR_SEEN_KEY, TOUR_VERSION + 1);
    const { result } = await mount("today", true);
    await new Promise((r) => setTimeout(r, 10));
    expect(result.current.offerVisible).toBe(false);
  });

  it("accepting it starts the learning tour on Today", async () => {
    const view = await mount("beat", true);
    await waitFor(() => expect(view.result.current.offerVisible).toBe(true));
    act(() => view.result.current.acceptOffer());
    expect(view.result.current.kind).toBe("learn");
    expect(view.result.current.stop?.id).toBe(LEARN_STOPS[0].id);
    expect(view.setView).toHaveBeenCalledWith("today");
  });

  it("does not appear when the tour has already been seen", async () => {
    values.set(TOUR_SEEN_KEY, TOUR_VERSION);
    const { result } = await mount("beat", true);
    expect(result.current.offerVisible).toBe(false);
  });

  it("accepting it starts the tour and hides the offer", async () => {
    const { result } = await mount("beat", true);
    await waitFor(() => expect(result.current.offerVisible).toBe(true));
    act(() => result.current.acceptOffer());
    expect(result.current.isOpen).toBe(true);
    expect(result.current.offerVisible).toBe(false);
  });

  it("declining it counts as seen, so it never comes back", async () => {
    const { result } = await mount("beat", true);
    await waitFor(() => expect(result.current.offerVisible).toBe(true));
    act(() => result.current.dismissOffer());
    expect(result.current.offerVisible).toBe(false);
    await waitFor(() => expect(values.get(TOUR_SEEN_KEY)).toBe(TOUR_VERSION));
  });
});

describe("the learning tour (card #50)", () => {
  it("has 5 to 8 stops and visits Today, Paths, a Session and Progress in that order", () => {
    expect(LEARN_STOPS.length).toBeGreaterThanOrEqual(5);
    expect(LEARN_STOPS.length).toBeLessThanOrEqual(8);
    const order = LEARN_STOPS.map((s) => s.view).filter((v, i, a) => a[i - 1] !== v);
    expect(order).toEqual(["today", "paths", "session", "progress"]);
  });

  it("walks the screens and puts the player back where they started", async () => {
    const view = await mount("jam" as TourView);
    act(() => view.result.current.open());
    const seen: string[] = [];
    for (let i = 0; i < LEARN_STOPS.length; i++) {
      view.sync();
      seen.push(view.view);
      act(() => view.result.current.next());
    }
    view.sync();
    expect(new Set(seen)).toEqual(new Set(["today", "paths", "session", "progress"]));
    expect(view.result.current.isOpen).toBe(false);
    expect(view.view).toBe("jam");
  });

  it("takes a shorter list from the shell (no plan, no Session stops)", async () => {
    const setView = vi.fn();
    const noSession = LEARN_STOPS.filter((s) => s.view !== "session");
    const { result } = renderHook(() => useTour({ tours: { learn: noSession }, view: "today", setView }));
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    act(() => result.current.open());
    expect(result.current.total).toBe(noSession.length);
  });
});
