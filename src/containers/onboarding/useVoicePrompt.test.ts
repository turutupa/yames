/**
 * The "Pick a voice" prompt (O4). W4 never asks about the voice; the honest
 * moment is when the download it started actually lands.
 *
 * The event is the real `model-download-complete` travelling through the
 * mocked Tauri transport, and the store is the global plugin-store mock with
 * a Map behind it — the same setup `useFirstTimeHint.test.ts` uses.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { load } from "@tauri-apps/plugin-store";
import { mockListen } from "../../test/mocks";
import { useVoicePrompt } from "./useVoicePrompt";

const values = new Map<string, unknown>();
let store: { get: ReturnType<typeof import("vitest").vi.fn> };

beforeAll(async () => {
  store = (await (load as unknown as (n: string, o: unknown) => Promise<never>)(
    "settings.json",
    {},
  )) as unknown as typeof store;
});

beforeEach(() => {
  values.clear();
  store.get.mockImplementation(async (key: string) => values.get(key));
});

/** Fire the backend's completion event at whatever listeners are registered. */
function complete(payload: Record<string, unknown>) {
  const calls = mockListen.mock.calls.filter(
    ([name]) => name === "model-download-complete",
  );
  act(() => {
    for (const [, cb] of calls) {
      (cb as (e: { payload: unknown }) => void)({ payload });
    }
  });
}

async function mounted() {
  const hook = renderHook(() => useVoicePrompt());
  // Let the `listen()` promise register before anything is emitted.
  await act(async () => {});
  return hook;
}

describe("useVoicePrompt", () => {
  it("stays quiet until a download completes", async () => {
    const { result } = await mounted();
    expect(result.current.visible).toBe(false);
  });

  it("offers the choice when the brain + voices install finishes", async () => {
    const { result } = await mounted();
    complete({ success: true, tier: "standard" });
    await waitFor(() => expect(result.current.visible).toBe(true));
  });

  it("says nothing to someone who already chose a voice", async () => {
    values.set("coachVoiceName", "amy");
    const { result } = await mounted();
    complete({ success: true, tier: "standard" });
    await act(async () => {});
    expect(result.current.visible).toBe(false);
  });

  it("ignores a per-voice repair, which carries no tier", async () => {
    const { result } = await mounted();
    complete({ success: true });
    await act(async () => {});
    expect(result.current.visible).toBe(false);
  });

  it("ignores a failed or cancelled download", async () => {
    const { result } = await mounted();
    complete({ success: false, cancelled: true });
    complete({ success: false, error: "network" });
    await act(async () => {});
    expect(result.current.visible).toBe(false);
  });

  it("goes away on either answer", async () => {
    const { result } = await mounted();
    complete({ success: true, tier: "full" });
    await waitFor(() => expect(result.current.visible).toBe(true));
    act(() => result.current.dismiss());
    expect(result.current.visible).toBe(false);

    complete({ success: true, tier: "full" });
    await waitFor(() => expect(result.current.visible).toBe(true));
    act(() => result.current.accept());
    expect(result.current.visible).toBe(false);
  });
});
