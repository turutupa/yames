import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { BETA_PROMPTED_AT_KEY } from "./feed";
import { useBetaPrompt } from "./useBetaPrompt";

const store = new Map<string, unknown>();
vi.mock("../ipc", () => ({
  storeLoad: async (key: string) => store.get(key),
  storeSave: async (key: string, value: unknown) => {
    store.set(key, value);
  },
}));

beforeEach(() => store.clear());

const mount = (available: boolean, isPlaying = false) =>
  renderHook((p: { available: boolean; isPlaying: boolean }) => useBetaPrompt(p), {
    initialProps: { available, isPlaying },
  });

describe("useBetaPrompt", () => {
  it("prompts once when an update is there, and remembers the day", async () => {
    const { result } = mount(true);
    await waitFor(() => expect(result.current.show).toBe(true));
    expect(typeof store.get(BETA_PROMPTED_AT_KEY)).toBe("number");
    act(() => result.current.dismiss());
    expect(result.current.show).toBe(false);
  });

  it("stays quiet the same day", async () => {
    store.set(BETA_PROMPTED_AT_KEY, Date.now() - 1000);
    const { result } = mount(true);
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.show).toBe(false);
  });

  it("waits for the click to stop, and hides when it starts", async () => {
    const { result, rerender } = mount(true, true);
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.show).toBe(false);
    rerender({ available: true, isPlaying: false });
    await waitFor(() => expect(result.current.show).toBe(true));
    rerender({ available: true, isPlaying: true });
    expect(result.current.show).toBe(false);
  });

  it("says nothing with nothing to offer", async () => {
    const { result } = mount(false);
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.show).toBe(false);
  });
});
