/**
 * `useOnboarding` — the three first-run cases from the onboarding README,
 * what gets persisted when a run ends, and the "Finish setup" chip rules.
 *
 * The store is driven through the global `@tauri-apps/plugin-store` mock
 * (src/test/mocks.ts): `load()` always resolves the same object, so replacing
 * its `get`/`set` implementations gives us a real in-memory settings file.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { load } from "@tauri-apps/plugin-store";
import {
  CHIP_DISMISS_LIMIT,
  ONBOARDING_VERSION,
  useOnboarding,
} from "./useOnboarding";

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

async function mount() {
  const view = renderHook(() => useOnboarding());
  await waitFor(() => expect(view.result.current.hydrated || values.size > 0).toBe(true));
  return view;
}

describe("first-run detection", () => {
  it("case 1 — no instrument, no version: opens the full wizard at W0", async () => {
    const { result } = await mount();
    await waitFor(() => expect(result.current.state.status).toBe("welcome"));
    expect(result.current.isOpen).toBe(true);
    expect(result.current.chipVisible).toBe(false);
    expect(result.current.migratedExistingUser).toBe(false);
  });

  it("case 2 — instrument set, no version: no wizard, schema stamped", async () => {
    values.set("instrument", "bass");
    const { result } = await mount();
    await waitFor(() => expect(result.current.migratedExistingUser).toBe(true));
    expect(result.current.isOpen).toBe(false);
    expect(result.current.state.status).toBe("idle");
    expect(values.get("onboarding.version")).toBe(ONBOARDING_VERSION);
    // completedAt too, so the chip never offers itself to an existing user.
    expect(typeof values.get("onboarding.completedAt")).toBe("string");
    expect(result.current.chipVisible).toBe(false);
  });

  it("case 3 — version set: normal launch, no wizard", async () => {
    values.set("instrument", "bass");
    values.set("onboarding.version", ONBOARDING_VERSION);
    values.set("onboarding.completedAt", "2026-01-01T00:00:00.000Z");
    const { result } = await mount();
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.isOpen).toBe(false);
    expect(result.current.state.status).toBe("idle");
    expect(result.current.chipVisible).toBe(false);
    expect(result.current.migratedExistingUser).toBe(false);
  });
});

describe("the Finish setup chip", () => {
  it("appears on a later launch when setup was skipped", async () => {
    values.set("instrument", "electric-guitar");
    values.set("onboarding.version", ONBOARDING_VERSION);
    const { result } = await mount();
    await waitFor(() => expect(result.current.chipVisible).toBe(true));
  });

  it("stays hidden after two dismissals", async () => {
    values.set("instrument", "electric-guitar");
    values.set("onboarding.version", ONBOARDING_VERSION);
    values.set("onboarding.chipDismissed", CHIP_DISMISS_LIMIT);
    const { result } = await mount();
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.chipVisible).toBe(false);
  });

  it("counts a dismissal into the store", async () => {
    values.set("instrument", "electric-guitar");
    values.set("onboarding.version", ONBOARDING_VERSION);
    const { result } = await mount();
    await waitFor(() => expect(result.current.chipVisible).toBe(true));
    act(() => result.current.dismissChip());
    expect(result.current.chipVisible).toBe(false);
    await waitFor(() => expect(values.get("onboarding.chipDismissed")).toBe(1));
  });

  it("opens the wizard at W1 and hides itself", async () => {
    values.set("instrument", "electric-guitar");
    values.set("onboarding.version", ONBOARDING_VERSION);
    const { result } = await mount();
    await waitFor(() => expect(result.current.chipVisible).toBe(true));
    act(() => result.current.openAt("instrument"));
    expect(result.current.state.stepId).toBe("instrument");
    expect(result.current.chipVisible).toBe(false);
  });
});

describe("persistence", () => {
  it('"Just give me the click" stamps the version, the skips, and shows the chip', async () => {
    const { result } = await mount();
    await waitFor(() => expect(result.current.state.status).toBe("welcome"));
    act(() => result.current.dispatch({ type: "SKIP_ALL" }));
    await waitFor(() => expect(values.get("onboarding.version")).toBe(ONBOARDING_VERSION));
    expect(values.get("onboarding.skipped")).toEqual(["instrument", "ready"]);
    expect(values.get("onboarding.completedAt")).toBeUndefined();
    expect(result.current.chipVisible).toBe(true);
  });

  it("reaching W7 stamps completedAt and retires the chip", async () => {
    const { result } = await mount();
    await waitFor(() => expect(result.current.state.status).toBe("welcome"));
    act(() => result.current.dispatch({ type: "START_SETUP" }));
    act(() => result.current.dispatch({ type: "NEXT" }));
    expect(result.current.state.stepId).toBe("ready");
    act(() => result.current.dispatch({ type: "CLOSE" }));
    await waitFor(() =>
      expect(typeof values.get("onboarding.completedAt")).toBe("string"),
    );
    expect(values.get("onboarding.version")).toBe(ONBOARDING_VERSION);
    expect(result.current.chipVisible).toBe(false);
    expect(result.current.isOpen).toBe(false);
  });

  it('"Run setup again" reopens at W0 from a finished run', async () => {
    values.set("instrument", "bass");
    values.set("onboarding.version", ONBOARDING_VERSION);
    values.set("onboarding.completedAt", "2026-01-01T00:00:00.000Z");
    const { result } = await mount();
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    act(() => result.current.open());
    expect(result.current.state.status).toBe("welcome");
    expect(result.current.isOpen).toBe(true);
  });
});
