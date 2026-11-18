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

describe("badges on the Paths list (QA 2026-11-17 #13)", () => {
  it("never shows the pack's Draft status; a subscribed Path says Subscribed", () => {
    const { session } = fake(started);
    render(<PathsView session={session} />);
    const card = screen.getByTestId(`path-card-${ALT.id}`);
    expect(ALT.review.status).toBe("draft");
    expect(card).not.toHaveTextContent(/draft/i);
    expect(card).toHaveTextContent("Subscribed");
  });

  it("an unsubscribed runnable Path has no badge", () => {
    const { session } = fake({ states: [], takes: [], ceilings: [] });
    render(<PathsView session={session} />);
    expect(screen.getByTestId(`path-card-${ALT.id}`).querySelector("[data-badge]")).toBeNull();
  });
});

describe("Exercise cards show their tempo (QA 2026-11-17 #14)", () => {
  it("start→pass BPM on each card", () => {
    const { session } = fake(started);
    render(<PathsView session={session} />);
    openPath();
    fireEvent.click(screen.getByTestId(`step-row-${ALT.steps[0].id}`));
    const ex = ALT.steps[0].exercises.find((e) => e.tempo.passAtBpm !== null && e.tempo.passAtBpm !== e.tempo.rungs[0].bpm)!;
    expect(screen.getByTestId(`tempo-${ex.id}`)).toHaveTextContent(`${ex.tempo.rungs[0].bpm}→${ex.tempo.passAtBpm} BPM`);
  });
});

describe("a Path whose pack names its subdivisions", () => {
  it("reads e.g. '16ths · 60→110 BPM'", () => {
    const pack = import.meta.glob("../../paths/packs/shred.json", { eager: true });
    const SHRED = (Object.values(pack)[0] as { default: unknown }).default as typeof ALT;
    const session = { paths: [SHRED], progress: { states: [], takes: [], ceilings: [] }, actions: {} } as unknown as SessionRun;
    render(<PathsView session={session} />);
    fireEvent.click(screen.getByTestId(`path-card-${SHRED.id}`));
    fireEvent.click(screen.getByTestId(`step-row-${SHRED.steps[0].id}`));
    const ex = SHRED.steps[0].exercises[0];
    expect(screen.getByTestId(`tempo-${ex.id}`)).toHaveTextContent(
      `16ths · ${ex.tempo.rungs[0].bpm}→${ex.tempo.passAtBpm} BPM`,
    );
  });
});

describe("the Paths list and the Level (acceptance P2-9, P2-10)", () => {
  it("a card says what the Path is for, and Continue on a followed Path goes to its Step", () => {
    const { session } = fake(started);
    render(<PathsView session={session} />);
    expect(screen.getByTestId(`path-card-${ALT.id}`)).toHaveTextContent(ALT.goal);
    fireEvent.click(screen.getByTestId(`path-continue-${ALT.id}`));
    expect(screen.getByTestId("step-detail")).toBeInTheDocument();
  });

  it("no Continue on a Path not started", () => {
    const { session } = fake({ states: [], takes: [], ceilings: [] });
    render(<PathsView session={session} />);
    expect(screen.queryByTestId(`path-continue-${ALT.id}`)).toBeNull();
  });

  it("picking a Level on a Path you don't follow says it subscribed you", () => {
    const none: PlayerProgress = { states: [], takes: [], ceilings: [] };
    const { session, actions } = fake(none);
    const { rerender } = render(<PathsView session={session} />);
    openPath();
    fireEvent.click(screen.getByTestId("level-intermediate"));
    expect(actions.chooseLevel).toHaveBeenCalledWith(ALT, "intermediate");
    // The hook writes the row; the page re-renders with it.
    const after = { ...session, progress: { ...none, states: [{ pathId: ALT.id, level: "intermediate", startedAt: NOW, updatedAt: NOW }] } };
    rerender(<PathsView session={after as SessionRun} />);
    expect(screen.getByTestId("level-start")).toHaveTextContent(/^Subscribed · starting at Step \d+$/);
  });

  it("picking a Level at the cap is refused, and says why", () => {
    const four: PlayerProgress = {
      states: ["a", "b", "c", "d"].map((pathId) => ({ pathId, startedAt: NOW, updatedAt: NOW })),
      takes: [],
      ceilings: [],
    };
    const { session, actions } = fake(four);
    render(<PathsView session={session} />);
    openPath();
    fireEvent.click(screen.getByTestId("level-intermediate"));
    expect(actions.chooseLevel).not.toHaveBeenCalled();
    expect(screen.getByTestId("level-subscribe-cap")).toBeInTheDocument();
  });
});
