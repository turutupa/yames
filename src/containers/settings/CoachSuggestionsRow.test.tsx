/**
 * Settings → Coach's Suggestions row (leg c4a2): what is stored shows as
 * chosen, a press writes `coach.suggestions` and nothing else, nothing is
 * written by showing the row, and a value that could not be read says so.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

const store = vi.hoisted(() => ({
  disk: new Map<string, unknown>(),
  saves: [] as Array<[string, unknown]>,
  fail: new Set<string>(),
  failSave: false,
}));

vi.mock("../../ipc", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../ipc")>();
  return {
    ...real,
    storeLoad: vi.fn(async (key: string) => {
      if (store.fail.has(key)) throw new Error("unreadable");
      return store.disk.get(key);
    }),
    storeSave: vi.fn(async (key: string, value: unknown) => {
      if (store.failSave) throw new Error("unwritable");
      store.saves.push([key, value]);
      store.disk.set(key, value);
    }),
  };
});

import i18n from "../../i18n";
import { loadCoachStored, resetCoachStored } from "../../coach/store";
import { CoachSuggestionsRow } from "./CoachSuggestionsRow";

const t = i18n.t.bind(i18n);

async function loaded() {
  await act(async () => {
    await loadCoachStored();
  });
}

beforeEach(() => {
  store.disk.clear();
  store.saves.length = 0;
  store.fail.clear();
  store.failSave = false;
  resetCoachStored();
});

describe("Suggestions: On / Only when I ask", () => {
  it("shows what is stored, and writes nothing by being shown", async () => {
    store.disk.set("coach.suggestions", "asked");
    render(<CoachSuggestionsRow />);
    await loaded();
    expect(screen.getByTestId("coach-suggestions-asked")).toHaveClass("active");
    expect(screen.getByTestId("coach-suggestions-asked")).toHaveTextContent(t("notebook.suggestions.asked"));
    expect(screen.getByTestId("coach-suggestions-on")).not.toHaveClass("active");
    expect(store.saves).toEqual([]);
  });

  it("nothing stored reads as On", async () => {
    render(<CoachSuggestionsRow />);
    await loaded();
    expect(screen.getByTestId("coach-suggestions-on")).toHaveClass("active");
  });

  it("a press writes coach.suggestions, once", async () => {
    render(<CoachSuggestionsRow />);
    await loaded();
    fireEvent.click(screen.getByTestId("coach-suggestions-asked"));
    expect(store.saves).toEqual([["coach.suggestions", "asked"]]);
    expect(screen.getByTestId("coach-suggestions-asked")).toHaveClass("active");
  });

  // c4a2b, L2: no silent failed save.
  it("a press whose save does not land says so; the next one that lands clears it", async () => {
    render(<CoachSuggestionsRow />);
    await loaded();
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      store.failSave = true;
      await act(async () => {
        fireEvent.click(screen.getByTestId("coach-suggestions-asked"));
      });
      expect(await screen.findByTestId("coach-suggestions-not-saved")).toHaveTextContent(t("notebook.ui.notSaved"));
      store.failSave = false;
      await act(async () => {
        fireEvent.click(screen.getByTestId("coach-suggestions-on"));
      });
      await waitFor(() => expect(screen.queryByTestId("coach-suggestions-not-saved")).toBeNull());
    } finally {
      quiet.mockRestore();
    }
  });

  it("a value that could not be read: neither is chosen, it says so, and a press saves the choice", async () => {
    store.fail.add("coach.suggestions");
    render(<CoachSuggestionsRow />);
    await loaded();
    expect(screen.getByTestId("coach-suggestions-unreadable")).toHaveTextContent(t("notebook.suggestions.unreadable"));
    expect(screen.getByTestId("coach-suggestions-on")).not.toHaveClass("active");
    expect(screen.getByTestId("coach-suggestions-asked")).not.toHaveClass("active");
    fireEvent.click(screen.getByTestId("coach-suggestions-on"));
    expect(store.saves).toEqual([["coach.suggestions", "on"]]);
    expect(screen.getByTestId("coach-suggestions-on")).toHaveClass("active");
  });
});
