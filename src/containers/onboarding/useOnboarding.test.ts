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
import { setInvokeResponse } from "../../test/mocks";
import { ONBOARDING_STEPS } from "./steps";
import {
  CHIP_DISMISS_LIMIT,
  ONBOARDING_VERSION,
  hasPriorUse,
  useOnboarding,
} from "./useOnboarding";

/**
 * Derived from the registry rather than spelled out, so registering a step
 * (O2–O5) doesn't rewrite these expectations. Mirrors the machine: W0 is never
 * "skipped", and a gated step that is off for this context never enters the
 * flow either.
 */
const SKIPPABLE_STEP_IDS = ONBOARDING_STEPS.filter((s) =>
  s.isEnabled ? s.isEnabled({ skipped: [], visited: [] }) : true,
)
  .map((s) => s.id)
  .filter((id) => id !== "welcome");

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

describe("hasPriorUse", () => {
  it("treats an absent or default instrument as no evidence at all", () => {
    // `"other"` is `Instrument::default()` on the Rust side — "no choice
    // made". Before O1b it read as an existing user and ate the wizard.
    expect(hasPriorUse(undefined, 0, 0)).toBe(false);
    expect(hasPriorUse("other", 0, 0)).toBe(false);
  });

  it("counts a chosen instrument, a saved session, or a saved preset", () => {
    expect(hasPriorUse("bass", 0, 0)).toBe(true);
    expect(hasPriorUse(undefined, 1, 0)).toBe(true);
    expect(hasPriorUse(undefined, 0, 1)).toBe(true);
    // Even the default instrument is prior use once real data exists.
    expect(hasPriorUse("other", 3, 0)).toBe(true);
    expect(hasPriorUse("other", 0, 2)).toBe(true);
  });
});

describe("first-run detection", () => {
  it("case 1 — nothing at all: opens the full wizard at W0", async () => {
    const { result } = await mount();
    await waitFor(() => expect(result.current.state.status).toBe("welcome"));
    expect(result.current.isOpen).toBe(true);
    expect(result.current.firstRun).toBe(true);
    expect(result.current.chipVisible).toBe(false);
    expect(result.current.migratedExistingUser).toBe(false);
  });

  it('case 1 — a Rust-written default instrument ("other") is still a first run', async () => {
    // O1b regression: `persist_state` used to stamp `instrument: "other"` into
    // an empty store from any settings command, and detection then skipped the
    // wizard forever. Old stores can still carry that value.
    values.set("instrument", "other");
    const { result } = await mount();
    await waitFor(() => expect(result.current.state.status).toBe("welcome"));
    expect(result.current.isOpen).toBe(true);
    expect(result.current.firstRun).toBe(true);
    expect(result.current.migratedExistingUser).toBe(false);
    expect(values.get("onboarding.version")).toBeUndefined();
  });

  it("case 2 — instrument set, no version: no wizard, schema stamped", async () => {
    values.set("instrument", "bass");
    const { result } = await mount();
    await waitFor(() => expect(result.current.migratedExistingUser).toBe(true));
    expect(result.current.isOpen).toBe(false);
    expect(result.current.state.status).toBe("idle");
    expect(result.current.firstRun).toBe(false);
    expect(values.get("onboarding.version")).toBe(ONBOARDING_VERSION);
    // completedAt too, so the chip never offers itself to an existing user.
    expect(typeof values.get("onboarding.completedAt")).toBe("string");
    expect(result.current.chipVisible).toBe(false);
  });

  it("case 2 — a saved session alone marks an existing user", async () => {
    // No instrument key at all (the store Rust now leaves alone), but the
    // user has practised: they are not meeting Yames for the first time.
    setInvokeResponse("get_session_history", () => [{ id: "s1" }]);
    const { result } = await mount();
    await waitFor(() => expect(result.current.migratedExistingUser).toBe(true));
    expect(result.current.isOpen).toBe(false);
    expect(result.current.firstRun).toBe(false);
    expect(values.get("onboarding.version")).toBe(ONBOARDING_VERSION);
  });

  it("case 2 — a saved preset alone marks an existing user", async () => {
    setInvokeResponse("list_presets", () => [{ id: "p1", name: "Warmup" }]);
    const { result } = await mount();
    await waitFor(() => expect(result.current.migratedExistingUser).toBe(true));
    expect(result.current.isOpen).toBe(false);
    expect(result.current.firstRun).toBe(false);
    expect(values.get("onboarding.version")).toBe(ONBOARDING_VERSION);
  });

  it("a backend that cannot answer does not fake prior use", async () => {
    setInvokeResponse("get_session_history", () => {
      throw new Error("backend down");
    });
    setInvokeResponse("list_presets", () => {
      throw new Error("backend down");
    });
    const { result } = await mount();
    await waitFor(() => expect(result.current.state.status).toBe("welcome"));
    expect(result.current.firstRun).toBe(true);
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
    expect(values.get("onboarding.skipped")).toEqual(SKIPPABLE_STEP_IDS);
    expect(values.get("onboarding.completedAt")).toBeUndefined();
    expect(result.current.chipVisible).toBe(true);
  });

  it("reaching W7 stamps completedAt and retires the chip", async () => {
    const { result } = await mount();
    await waitFor(() => expect(result.current.state.status).toBe("welcome"));
    act(() => result.current.dispatch({ type: "START_SETUP" }));
    // Walk the registry rather than assuming its length.
    for (let i = 0; i < ONBOARDING_STEPS.length && result.current.state.stepId !== "ready"; i++) {
      act(() => result.current.dispatch({ type: "NEXT" }));
    }
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
