/**
 * The preferences the main window loads on mount — and the one of them that
 * had to be moved out of the jams to get here.
 *
 * Spoken cues used to be a switch on every jam's setup sheet. They are one
 * preference now (JAM_UX_DECISIONS A4), which is right, but it defaults to
 * off and nothing reads `Jam.cues` any more: a player who had the voice
 * counting them in would open the new build to silence, with the switch that
 * used to say so gone from the screen it was on. The first launch asks the
 * jams instead.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useUiPreferences } from "./useUiPreferences";
import type { Jam } from "../../../jam/types";

const store: {
  values: Record<string, unknown>;
  saved: Array<[string, unknown]>;
  jams: Jam[] | undefined;
  jamsFail: boolean;
} = { values: {}, saved: [], jams: undefined, jamsFail: false };

vi.mock("../../../ipc", () => ({
  storeLoad: async (key: string) => store.values[key],
  storeSave: async (key: string, value: unknown) => {
    store.saved.push([key, value]);
    store.values[key] = value;
  },
  listJams: async () => {
    if (store.jamsFail) throw new Error("no store");
    return store.jams;
  },
}));

const jamWith = (cues: boolean | undefined): Jam =>
  ({ id: "j", name: "one", cues } as unknown as Jam);

beforeEach(() => {
  store.values = {};
  store.saved = [];
  store.jams = undefined;
  store.jamsFail = false;
});

describe("the spoken-cues migration", () => {
  it("starts the preference on for a player whose jams had cues", async () => {
    store.jams = [jamWith(false), jamWith(true)];
    const { result } = renderHook(() => useUiPreferences());
    await waitFor(() => expect(result.current.jamCues).toBe(true));
    // Written down, so it is a migration and not a rule: deleting that jam
    // later must not take the voice away again.
    expect(store.saved).toContainEqual(["jamCues", true]);
  });

  it("leaves it off for a player whose jams never had them", async () => {
    store.jams = [jamWith(undefined), jamWith(false)];
    const { result } = renderHook(() => useUiPreferences());
    await waitFor(() => expect(store.saved).toContainEqual(["jamCues", false]));
    expect(result.current.jamCues).toBe(false);
  });

  it("never argues with a preference that has been set", async () => {
    // Off ON PURPOSE, with a jam that still carries the old switch. The
    // migration must not run a second time and turn it back on.
    store.values.jamCues = false;
    store.jams = [jamWith(true)];
    const { result } = renderHook(() => useUiPreferences());
    await waitFor(() => expect(result.current.buttonFlash).toBe(true));
    expect(result.current.jamCues).toBe(false);
    expect(store.saved).toHaveLength(0);
  });

  it("keeps the stored preference when it is on", async () => {
    store.values.jamCues = true;
    const { result } = renderHook(() => useUiPreferences());
    await waitFor(() => expect(result.current.jamCues).toBe(true));
    expect(store.saved).toHaveLength(0);
  });

  it("leaves the default alone when the jams cannot be read", async () => {
    store.jamsFail = true;
    const { result } = renderHook(() => useUiPreferences());
    await waitFor(() => expect(result.current.buttonFlash).toBe(true));
    expect(result.current.jamCues).toBe(false);
    expect(store.saved).toHaveLength(0);
  });
});
