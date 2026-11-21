/**
 * The model's turn in the panel (leg c3b2a): the working line and its Stop,
 * the footer's variant, a proposal labelled as the model's, and the panel
 * unmounting stops the turn in flight.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import i18n from "../../i18n";
import { __resetCoachLoaderForTests } from "../../hooks/coachLoader";
import { AskPanel } from "./AskPanel";
import { __resetAskStoreForTests, appendAskTurn, openAsk } from "./askStore";

const t = i18n.t.bind(i18n);

const turn = vi.hoisted(() => ({ stop: vi.fn(), wanted: false }));
vi.mock("./askModelTurn", () => ({
  stopModelTurn: turn.stop,
  modelTurnWanted: () => turn.wanted,
}));

const snapshot = vi.hoisted(() => ({ state: "ready" as string }));
vi.mock("../../hooks/coachLoader", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../hooks/coachLoader")>();
  let last: { base: unknown; state: string; out: ReturnType<typeof real.getCoachModelSnapshot> } | null = null;
  return {
    ...real,
    getCoachModelSnapshot: () => {
      const base = real.getCoachModelSnapshot();
      if (!last || last.base !== base || last.state !== snapshot.state) last = { base, state: snapshot.state, out: { ...base, state: snapshot.state as typeof base.state } };
      return last.out;
    },
  };
});

beforeEach(() => {
  __resetAskStoreForTests();
  __resetCoachLoaderForTests();
  turn.stop.mockClear();
  turn.wanted = false;
});
afterEach(() => __resetAskStoreForTests());

const panel = () => render(<AskPanel lookingAt={{ text: "Today", key: "today" }} onClose={() => {}} />);

describe("the model's turn in the panel", () => {
  it("the working line says what it is doing, and Stop stops it", () => {
    openAsk();
    appendAskTurn({ id: "u", kind: "user", text: "what should I practise" });
    appendAskTurn({ id: "p", kind: "app", text: t("ask.model.plain") });
    appendAskTurn({ id: "m", kind: "model" });
    panel();
    expect(screen.getByTestId("ask-model-working")).toHaveTextContent(t("ask.model.working"));
    fireEvent.click(screen.getByTestId("ask-model-stop"));
    expect(turn.stop).toHaveBeenCalled();
  });

  it("the panel unmounting stops the turn in flight", () => {
    openAsk();
    const view = panel();
    turn.stop.mockClear();
    view.unmount();
    expect(turn.stop).toHaveBeenCalledTimes(1);
  });

  it("the footer says the model answers in its own words only where it is on", () => {
    openAsk();
    const off = panel();
    expect(document.querySelector(".ask-footer")).toHaveTextContent(t("help.ui.footer.model"));
    off.unmount();
    turn.wanted = true;
    panel();
    expect(document.querySelector(".ask-footer")).toHaveTextContent(t("ask.footer.choice"));
  });

  it("a proposal the model chose is labelled as its reading", () => {
    openAsk();
    appendAskTurn({
      id: "x",
      kind: "tool",
      body: {
        kind: "proposal",
        state: "open",
        via: "model",
        proposal: { tool: "go_to", args: { screen: "progress" }, line: { key: "coachTools.propose.goTo", values: { screen: "progress" } } },
      },
    });
    panel();
    expect(screen.getByTestId("ask-proposal-model")).toHaveTextContent(t("ask.model.reading"));
    expect(screen.getByTestId("ask-proposal-go")).toBeInTheDocument();
  });
});
