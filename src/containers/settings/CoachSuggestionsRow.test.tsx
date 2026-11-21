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
  failSaveOf: "",
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
      if (store.failSave || store.failSaveOf === key) throw new Error("unwritable");
      store.saves.push([key, value]);
      store.disk.set(key, value);
    }),
  };
});

import i18n from "../../i18n";
import { cardMayShow, coachKeyStates, coachStored, loadCoachStored, resetCoachStored } from "../../coach/store";
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
  store.failSaveOf = "";
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

  // c4b2b (review M2): "Hidden until you ask" names this press as the way back.
  it("On asks for the cards hidden twice again; Only when I ask does not touch them", async () => {
    const at = Date.now() - 86_400_000;
    store.disk.set("coach.cards", { weekly: { dismissed: 2, lastDismissed: at }, plateau: { dismissed: 1, lastDismissed: at } });
    render(<CoachSuggestionsRow />);
    await loaded();
    fireEvent.click(screen.getByTestId("coach-suggestions-asked"));
    expect(store.saves.map(([k]) => k)).toEqual(["coach.suggestions"]);
    await act(async () => {
      fireEvent.click(screen.getByTestId("coach-suggestions-on"));
    });
    const cards = store.saves.find(([k]) => k === "coach.cards")?.[1] as Record<string, { dismissed: number; lastDismissed: number | null }>;
    // Owner, 2026-11-21: On lifts "until you ask" only, from now; the Hide's
    // seven days stand, and a card hidden once is left exactly as it was.
    expect(cards.weekly).toEqual({ dismissed: 0, lastDismissed: at });
    expect(cards.plateau).toEqual({ dismissed: 1, lastDismissed: at });
    expect(store.saves.filter(([k]) => k === "coach.cards")).toHaveLength(1);
  });

  // Owner, 2026-11-21: pressing On does not lift an earlier Hide's seven days.
  it("On leaves a card hidden once within its seven days hidden, and writes no coach.cards for it", async () => {
    const at = Date.now() - 86_400_000;
    store.disk.set("coach.cards", { weekly: { dismissed: 1, lastDismissed: at } });
    render(<CoachSuggestionsRow />);
    await loaded();
    await act(async () => {
      fireEvent.click(screen.getByTestId("coach-suggestions-on"));
    });
    expect(store.saves).toEqual([["coach.suggestions", "on"]]);
    expect(cardMayShow(coachStored(), "weekly", Date.now(), coachKeyStates())).toBe(false);
  });

  it("On after a second Hide: the card stays quiet for that Hide's seven days, then may come back", async () => {
    const at = Date.now() - 86_400_000;
    store.disk.set("coach.cards", { weekly: { dismissed: 2, lastDismissed: at } });
    render(<CoachSuggestionsRow />);
    await loaded();
    await act(async () => {
      fireEvent.click(screen.getByTestId("coach-suggestions-on"));
    });
    expect(cardMayShow(coachStored(), "weekly", Date.now(), coachKeyStates())).toBe(false);
    expect(cardMayShow(coachStored(), "weekly", at + 7 * 86_400_000, coachKeyStates())).toBe(true);
  });

  // c4b2b's re-read, LOW 4: the cards' half of On is followed too.
  it("On says the hidden cards stay hidden when coach.cards could not be read, though coach.suggestions saved", async () => {
    store.fail.add("coach.cards");
    render(<CoachSuggestionsRow />);
    await loaded();
    await act(async () => {
      fireEvent.click(screen.getByTestId("coach-suggestions-on"));
    });
    expect(store.saves).toEqual([["coach.suggestions", "on"]]);
    expect(screen.getByTestId("coach-suggestions-cards-not-read")).toHaveTextContent(t("companion.cardsNotRead"));
    expect(screen.queryByTestId("coach-suggestions-not-saved")).toBeNull();
  });

  it("On says it did not land when the cards' save fails, though coach.suggestions saved", async () => {
    const at = Date.now() - 86_400_000;
    store.disk.set("coach.cards", { weekly: { dismissed: 2, lastDismissed: at } });
    render(<CoachSuggestionsRow />);
    await loaded();
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      store.failSaveOf = "coach.cards";
      await act(async () => {
        fireEvent.click(screen.getByTestId("coach-suggestions-on"));
      });
      expect(await screen.findByTestId("coach-suggestions-not-saved")).toHaveTextContent(t("notebook.ui.notSaved"));
    } finally {
      quiet.mockRestore();
    }
  });

  it("On with no card hidden writes coach.suggestions alone and says nothing more", async () => {
    render(<CoachSuggestionsRow />);
    await loaded();
    await act(async () => {
      fireEvent.click(screen.getByTestId("coach-suggestions-on"));
    });
    expect(store.saves).toEqual([["coach.suggestions", "on"]]);
    expect(screen.queryByTestId("coach-suggestions-not-saved")).toBeNull();
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
