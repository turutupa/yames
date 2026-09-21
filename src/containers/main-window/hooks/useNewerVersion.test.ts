/**
 * When the app is allowed to ask, and what it does with the answer.
 *
 * Every rule here is about staying out of the way: once a day, on opening,
 * never while the click is running, and once you have waved a version away it
 * never mentions that one again.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { ASKED_AT_KEY, ASK_EVERY_MS, HIDDEN_KEY, LATEST_KEY } from "../../../mobile/newerVersion";
import { NEVER_NEWER, useNewerVersion } from "./useNewerVersion";

const store = new Map<string, unknown>();
const storeSave = vi.fn(async (key: string, value: unknown) => {
  store.set(key, value);
});
const openUrl = vi.fn(async () => {});
const askForNewest = vi.fn(async () => "1.3.0" as string | null);

vi.mock("../../../ipc", () => ({
  storeLoad: async (key: string) => store.get(key),
  storeSave: (...args: [string, unknown]) => storeSave(...args),
  openUrl: (...args: [string]) => openUrl(...args),
}));

vi.mock("../../../mobile/newerVersion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../mobile/newerVersion")>();
  return { ...actual, askForNewest: () => askForNewest() };
});

beforeEach(() => {
  store.clear();
  vi.clearAllMocks();
  askForNewest.mockResolvedValue("1.3.0");
});

const mount = (appVersion = "1.2.1", isPlaying = false) =>
  renderHook(
    (props: { appVersion: string; isPlaying: boolean }) => useNewerVersion(props),
    { initialProps: { appVersion, isPlaying } },
  );

describe("asking once a day, on opening", () => {
  it("asks on the first open and offers what came back", async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.newest).toBe("1.3.0"));
    expect(askForNewest).toHaveBeenCalledTimes(1);
    expect(store.get(LATEST_KEY)).toBe("1.3.0");
    expect(typeof store.get(ASKED_AT_KEY)).toBe("number");
  });

  it("does not ask again the same day, and still says what it found", async () => {
    store.set(ASKED_AT_KEY, Date.now() - 1000);
    store.set(LATEST_KEY, "1.3.0");
    const { result } = mount();
    await waitFor(() => expect(result.current.newest).toBe("1.3.0"));
    expect(askForNewest).not.toHaveBeenCalled();
  });

  it("asks again a day later", async () => {
    store.set(ASKED_AT_KEY, Date.now() - ASK_EVERY_MS - 1);
    store.set(LATEST_KEY, "1.2.9");
    askForNewest.mockResolvedValue("1.4.0");
    const { result } = mount();
    await waitFor(() => expect(result.current.newest).toBe("1.4.0"));
    expect(askForNewest).toHaveBeenCalledTimes(1);
  });

  it("does not use up the day when the ask failed", async () => {
    askForNewest.mockResolvedValue(null);
    const { result, unmount } = mount();
    await waitFor(() => expect(askForNewest).toHaveBeenCalledTimes(1));
    expect(result.current.newest).toBe("");
    expect(store.has(ASKED_AT_KEY)).toBe(false);
    unmount();
    // Opened again later the same day: it tries once more rather than
    // waiting until tomorrow because it happened to be on a train.
    askForNewest.mockResolvedValue("1.3.0");
    const second = mount();
    await waitFor(() => expect(second.result.current.newest).toBe("1.3.0"));
  });

  it("says nothing while the version is still unknown", async () => {
    const { result, rerender } = mount("0.0.0");
    await act(async () => {});
    expect(askForNewest).not.toHaveBeenCalled();
    rerender({ appVersion: "1.2.1", isPlaying: false });
    await waitFor(() => expect(result.current.newest).toBe("1.3.0"));
  });

  it("says nothing when the newest release is the one running", async () => {
    askForNewest.mockResolvedValue("1.2.1");
    const { result } = mount("1.2.1");
    await waitFor(() => expect(askForNewest).toHaveBeenCalled());
    expect(result.current.newest).toBe("");
  });
});

describe("never while the click is running", () => {
  it("waits for the stop rather than asking mid-practice", async () => {
    const { result, rerender } = mount("1.2.1", true);
    await act(async () => {});
    expect(askForNewest).not.toHaveBeenCalled();
    expect(result.current.newest).toBe("");

    rerender({ appVersion: "1.2.1", isPlaying: false });
    await waitFor(() => expect(result.current.newest).toBe("1.3.0"));
    expect(askForNewest).toHaveBeenCalledTimes(1);
  });

  it("asks once per open however many times it re-renders", async () => {
    const { rerender } = mount();
    await waitFor(() => expect(askForNewest).toHaveBeenCalledTimes(1));
    for (const isPlaying of [true, false, true, false]) {
      rerender({ appVersion: "1.2.1", isPlaying });
      await act(async () => {});
    }
    expect(askForNewest).toHaveBeenCalledTimes(1);
  });
});

describe("waving one away", () => {
  it("silences that version and remembers it", async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.newest).toBe("1.3.0"));
    act(() => result.current.hide());
    expect(result.current.newest).toBe("");
    await waitFor(() => expect(store.get(HIDDEN_KEY)).toBe("1.3.0"));
  });

  it("stays quiet about it the next time the app opens", async () => {
    store.set(HIDDEN_KEY, "1.3.0");
    const { result } = mount();
    await waitFor(() => expect(askForNewest).toHaveBeenCalled());
    expect(result.current.newest).toBe("");
  });

  it("but not about the one after it", async () => {
    store.set(HIDDEN_KEY, "1.3.0");
    askForNewest.mockResolvedValue("1.4.0");
    const { result } = mount();
    await waitFor(() => expect(result.current.newest).toBe("1.4.0"));
  });
});

describe("getting it", () => {
  it("hands the download page to the phone's own browser", async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.newest).toBe("1.3.0"));
    act(() => result.current.getIt());
    expect(openUrl).toHaveBeenCalledWith("https://yames.app/#download");
  });
});

describe("the build that never asks", () => {
  it("reports nothing and does nothing, from a frozen object", () => {
    expect(NEVER_NEWER.newest).toBe("");
    expect(Object.isFrozen(NEVER_NEWER)).toBe(true);
    expect(() => {
      NEVER_NEWER.getIt();
      NEVER_NEWER.hide();
    }).not.toThrow();
  });
});
