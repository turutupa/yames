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
import { TOUR_SEEN_KEY, TOUR_STOPS, TOUR_VERSION, type TourView } from "./stops";
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
    expect(result.current.total).toBe(6);
  });

  it("opens at the first stop and walks forward", async () => {
    const { result } = await mount();
    act(() => result.current.open());
    expect(result.current.isOpen).toBe(true);
    expect(result.current.index).toBe(0);
    expect(result.current.stop?.id).toBe("bpm");
    act(() => result.current.next());
    expect(result.current.stop?.id).toBe("subdivision");
  });

  it("walks back but never past the first stop", async () => {
    const { result } = await mount();
    act(() => result.current.open());
    act(() => result.current.next());
    act(() => result.current.prev());
    expect(result.current.index).toBe(0);
    act(() => result.current.prev());
    expect(result.current.index).toBe(0);
    expect(result.current.isOpen).toBe(true);
  });

  it("Next on the last stop finishes the tour", async () => {
    const { result } = await mount();
    act(() => result.current.open());
    for (let i = 0; i < TOUR_STOPS.length - 1; i++) act(() => result.current.next());
    expect(result.current.index).toBe(TOUR_STOPS.length - 1);
    act(() => result.current.next());
    expect(result.current.isOpen).toBe(false);
  });
});

describe("tab switch and restore", () => {
  it("switches to the drill tab for the drill stop", async () => {
    const view = await mount("beat");
    act(() => view.result.current.open());
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
    act(() => view.result.current.open());
    for (let i = 0; i < 3; i++) act(() => view.result.current.next());
    view.sync();
    expect(view.view).toBe("drill");
    act(() => view.result.current.next());
    view.sync();
    expect(view.view).toBe("beat");
  });

  it("restores the tab the user came from when the tour ends", async () => {
    const view = await mount("track");
    act(() => view.result.current.open());
    view.sync();
    expect(view.view).toBe("beat"); // stop 1 needs the metronome tab
    act(() => view.result.current.close());
    view.sync();
    expect(view.view).toBe("track");
  });

  it("restores the tab after finishing on the last stop too", async () => {
    const view = await mount("track");
    act(() => view.result.current.open());
    for (let i = 0; i < TOUR_STOPS.length; i++) act(() => view.result.current.next());
    view.sync();
    expect(view.result.current.isOpen).toBe(false);
    expect(view.view).toBe("track");
  });

  it("never restores to settings — a tour has no home there", async () => {
    const view = await mount("settings");
    act(() => view.result.current.open());
    act(() => view.result.current.close());
    view.sync();
    expect(view.view).toBe("beat");
  });

  it("honours an explicit restore target (Settings → Take the tour)", async () => {
    const view = await mount("settings");
    act(() => view.result.current.open("drill"));
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
    for (let i = 0; i < TOUR_STOPS.length; i++) act(() => result.current.next());
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
