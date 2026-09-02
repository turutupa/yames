/**
 * The what's-new promise, in two halves:
 *
 *   - `decideWhatsNew` — the pure rule table (a first run is silent, an
 *     upgrade shows, a version already seen never shows again);
 *   - `useWhatsNew` — the same rules against a real in-memory settings store,
 *     including the one that actually matters: **exactly once per version**,
 *     across remounts and across dismissals.
 *
 * The store is driven through the global `@tauri-apps/plugin-store` mock
 * (src/test/mocks.ts) the same way `useOnboarding.test.ts` does it.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { load } from "@tauri-apps/plugin-store";
import { useWhatsNew } from "./useWhatsNew";
import {
  WHATS_NEW_NOTES_KEY,
  WHATS_NEW_SEEN_KEY,
  decideWhatsNew,
  notesForVersion,
} from "./whatsNew";

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
  store.get.mockImplementation(async (key: string) => values.get(key));
  store.set.mockImplementation(async (key: string, value: unknown) => {
    values.set(key, value);
  });
});

function mount(appVersion: string, firstRun = false) {
  return renderHook(
    (props: { appVersion: string; firstRun: boolean }) =>
      useWhatsNew({ ...props, ready: true }),
    { initialProps: { appVersion, firstRun } },
  );
}

describe("decideWhatsNew", () => {
  it("skips while the version is still the placeholder", () => {
    expect(
      decideWhatsNew({ appVersion: "0.0.0", seenVersion: undefined, firstRun: false }),
    ).toBe("skip");
    expect(
      decideWhatsNew({ appVersion: "", seenVersion: undefined, firstRun: false }),
    ).toBe("skip");
  });

  it("skips a version whose notes were already shown", () => {
    expect(
      decideWhatsNew({ appVersion: "1.2.0", seenVersion: "1.2.0", firstRun: false }),
    ).toBe("skip");
  });

  it("records silently on a genuine first run", () => {
    expect(
      decideWhatsNew({ appVersion: "1.2.0", seenVersion: undefined, firstRun: true }),
    ).toBe("record");
  });

  it("shows for an existing user upgrading into this build", () => {
    // No seenVersion at all — the key did not exist before O8.
    expect(
      decideWhatsNew({ appVersion: "1.2.0", seenVersion: undefined, firstRun: false }),
    ).toBe("show");
  });

  it("shows when the seen version is an older one", () => {
    expect(
      decideWhatsNew({ appVersion: "1.3.0", seenVersion: "1.2.0", firstRun: false }),
    ).toBe("show");
  });
});

describe("notesForVersion", () => {
  it("returns the body when the cache matches the running version", () => {
    expect(notesForVersion({ version: "1.2.0", notes: "- fixed" }, "1.2.0")).toBe("- fixed");
  });

  it("returns null when the cache is for another version", () => {
    expect(notesForVersion({ version: "1.3.0", notes: "- fixed" }, "1.2.0")).toBeNull();
  });

  it("treats a blank body as no body", () => {
    expect(notesForVersion({ version: "1.2.0", notes: "   \n " }, "1.2.0")).toBeNull();
    expect(notesForVersion(undefined, "1.2.0")).toBeNull();
  });
});

describe("useWhatsNew", () => {
  it("shows once for an upgrading user and stamps the version", async () => {
    const { result } = mount("1.3.0");
    await waitFor(() => expect(result.current.isOpen).toBe(true));
    expect(values.get(WHATS_NEW_SEEN_KEY)).toBe("1.3.0");
  });

  it("shows exactly once per version — a remount stays quiet", async () => {
    const first = mount("1.3.0");
    await waitFor(() => expect(first.result.current.isOpen).toBe(true));
    act(() => first.result.current.dismiss());
    expect(first.result.current.isOpen).toBe(false);
    first.unmount();

    // Same version, fresh mount: the store already says it was seen.
    const second = mount("1.3.0");
    await waitFor(() => expect(second.result.current.hydrated).toBe(true));
    expect(second.result.current.isOpen).toBe(false);
  });

  it("shows again on the next version bump", async () => {
    values.set(WHATS_NEW_SEEN_KEY, "1.3.0");
    const { result } = mount("1.4.0");
    await waitFor(() => expect(result.current.isOpen).toBe(true));
    expect(values.get(WHATS_NEW_SEEN_KEY)).toBe("1.4.0");
  });

  it("stays quiet on a first run but records the version", async () => {
    const { result } = mount("1.3.0", true);
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.isOpen).toBe(false);
    expect(values.get(WHATS_NEW_SEEN_KEY)).toBe("1.3.0");
  });

  it("serves the cached release body for the running version", async () => {
    values.set(WHATS_NEW_NOTES_KEY, { version: "1.3.0", notes: "- Beat groups\n- Fixes" });
    const { result } = mount("1.3.0");
    await waitFor(() => expect(result.current.isOpen).toBe(true));
    expect(result.current.notes).toBe("- Beat groups\n- Fixes");
  });

  it("ignores a cached body left over from a different version", async () => {
    values.set(WHATS_NEW_NOTES_KEY, { version: "1.9.0", notes: "- not this one" });
    const { result } = mount("1.3.0");
    await waitFor(() => expect(result.current.isOpen).toBe(true));
    expect(result.current.notes).toBeNull();
  });

  it("does nothing until the version is known", async () => {
    const view = mount("0.0.0");
    await waitFor(() => expect(view.result.current.isOpen).toBe(false));
    expect(values.has(WHATS_NEW_SEEN_KEY)).toBe(false);

    // Tauri answers → the decision runs.
    view.rerender({ appVersion: "1.3.0", firstRun: false });
    await waitFor(() => expect(view.result.current.isOpen).toBe(true));
  });

  it("waits for `ready` before deciding", async () => {
    const view = renderHook(
      ({ ready }: { ready: boolean }) =>
        useWhatsNew({ appVersion: "1.3.0", firstRun: false, ready }),
      { initialProps: { ready: false } },
    );
    await waitFor(() => expect(view.result.current.isOpen).toBe(false));
    expect(values.has(WHATS_NEW_SEEN_KEY)).toBe(false);

    view.rerender({ ready: true });
    await waitFor(() => expect(view.result.current.isOpen).toBe(true));
  });
});
