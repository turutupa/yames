/**
 * The Path page's Subscribe / Unsubscribe (capped, with the reason said) and
 * the Step page's Test out. The decisions are in the hook and `rotation.ts`;
 * this is that the screen offers them and says what came back.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PathsView } from "./PathsView";
import type { SessionRun } from "./hooks/useSessionRun";
import { ALT, NOW } from "../../session/testKit";
import type { PlayerProgress } from "../../session/progress";

afterEach(cleanup);

function fake(progress: PlayerProgress, subscribe: () => "cap" | null = () => null) {
  const actions = {
    subscribe: vi.fn(subscribe),
    unsubscribe: vi.fn(),
    testOut: vi.fn(),
    playExercise: vi.fn(),
    findEdge: vi.fn(),
    chooseStep: vi.fn(),
    chooseLevel: vi.fn(),
  };
  const session = { paths: [ALT], progress, actions } as unknown as SessionRun;
  return { session, actions };
}

const started: PlayerProgress = {
  states: [{ pathId: ALT.id, startedAt: NOW, updatedAt: NOW }],
  takes: [],
  ceilings: [],
};

function openPath() {
  fireEvent.click(screen.getByTestId(`path-card-${ALT.id}`));
}

describe("subscribing on a Path's page", () => {
  it("a Path not started offers Subscribe, and says the cap when it is refused", () => {
    const { session, actions } = fake({ states: [], takes: [], ceilings: [] }, () => "cap");
    render(<PathsView session={session} />);
    openPath();
    fireEvent.click(screen.getByTestId("path-subscribe"));
    expect(actions.subscribe).toHaveBeenCalledWith(ALT);
    expect(screen.getByTestId("path-subscribe-cap")).toHaveTextContent("up to 4 Paths");
  });

  it("a subscribed Path offers Unsubscribe", () => {
    const { session, actions } = fake(started);
    render(<PathsView session={session} />);
    openPath();
    expect(screen.getByTestId("path-subscription")).toHaveTextContent("Subscribed");
    fireEvent.click(screen.getByTestId("path-unsubscribe"));
    expect(actions.unsubscribe).toHaveBeenCalledWith(ALT);
  });

  it("an unsubscribed Path says its history is kept", () => {
    const { session } = fake({ ...started, unsubscribed: [ALT.id] });
    render(<PathsView session={session} />);
    openPath();
    expect(screen.getByTestId("path-subscribe")).toBeInTheDocument();
    expect(screen.getByTestId("path-subscription")).toHaveTextContent("history is kept");
  });
});

describe("Test out on a Step's page", () => {
  it("runs the Step's Exercises at their pass tempos", () => {
    const { session, actions } = fake(started);
    render(<PathsView session={session} />);
    openPath();
    fireEvent.click(screen.getByTestId(`step-row-${ALT.steps[1].id}`));
    fireEvent.click(screen.getByTestId("step-test-out"));
    expect(actions.testOut).toHaveBeenCalledWith(ALT, ALT.steps[1]);
  });
});
