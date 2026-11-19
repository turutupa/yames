/**
 * What a Path builds on, on the Paths screen (plans/paths/NEW_PATHS.md, "UI
 * spec for prerequisites"): the "Builds on" line and its links, the "Start
 * with X first, or start anyway" suggestion and when it shows, Subscribe's
 * offer to add what a Path builds on, and the list by track. Guidance only:
 * every test that shows a suggestion also checks that nothing was blocked.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { PathsView } from "./PathsView";
import type { SessionRun } from "./hooks/useSessionRun";
import type { PathDoc } from "../../paths/format";
import { RUNNABLE_PATH_IDS } from "../../session/packs";
import { NO_PROGRESS, isSubscribed } from "../../session/progress";
import type { PlayerProgress } from "../../session/progress";

afterEach(cleanup);

const PACKS = import.meta.glob("../../paths/packs/*.json", { eager: true });
const PATHS = Object.values(PACKS)
  .map((m) => (m as { default: PathDoc }).default)
  .filter((p) => RUNNABLE_PATH_IDS.includes(p.id));
const NOW = 1_800_000_000_000;

/** A session whose subscribe writes a row, as the hook does, so a re-render sees it. */
function fake(progress: PlayerProgress = NO_PROGRESS) {
  let current = progress;
  const actions = {
    subscribe: vi.fn((path: PathDoc) => {
      if (isSubscribed(current, path.id)) return null;
      if (current.states.filter((s) => isSubscribed(current, s.pathId)).length >= 4) return "cap";
      current = { ...current, states: [...current.states, { pathId: path.id, startedAt: NOW, updatedAt: NOW }] };
      return null;
    }),
    unsubscribe: vi.fn(),
    testOut: vi.fn(),
    playExercise: vi.fn(),
    findEdge: vi.fn(),
    chooseStep: vi.fn(),
    chooseLevel: vi.fn(),
  };
  const session = { paths: PATHS, progress, actions, myPaths: [] } as unknown as SessionRun;
  return { session, actions };
}

const open = (id: string) => fireEvent.click(screen.getByTestId(`path-card-${id}`));

describe("Builds on: on the Path's page", () => {
  it("names each prerequisite with its Level's short name, each a link to that Path", () => {
    render(<PathsView session={fake().session} />);
    open("shred");
    const line = screen.getByTestId("builds-on-page-shred");
    expect(line).toHaveTextContent("Builds on: Alternate Picking (Intermediate), Legato (Beginner)");
    fireEvent.click(screen.getByTestId("builds-on-page-shred-legato"));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Legato");
    expect(screen.getByTestId("builds-on-page-legato")).toHaveTextContent("Builds on: Rhythm Foundations (Beginner)");
  });

  it("a Path that builds on nothing has no line", () => {
    render(<PathsView session={fake().session} />);
    open("rhythm-foundations");
    expect(screen.queryByTestId("builds-on-page-rhythm-foundations")).toBeNull();
  });
});

describe("Start with X first, or start anyway", () => {
  it("shows the first unmet prerequisite above Continue, which still starts", () => {
    render(<PathsView session={fake().session} />);
    open("shred");
    const where = screen.getByTestId("path-where");
    const line = within(where).getByTestId("path-start-first");
    expect(line).toHaveTextContent("Start with Alternate Picking first, or start anyway.");
    // Above Start, never instead of it.
    const start = within(where).getByTestId("path-open-current");
    expect(line.compareDocumentPosition(start) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(start);
    expect(screen.getByTestId("step-detail")).toBeInTheDocument();
  });

  it("the name opens that Path", () => {
    render(<PathsView session={fake().session} />);
    open("triads");
    expect(screen.getByTestId("path-start-first")).toHaveTextContent("Start with Know the Neck first");
    fireEvent.click(screen.getByTestId("path-start-first-know-the-neck"));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Know the Neck");
  });

  it("is gone once this Path is started, and when what it builds on is reached", () => {
    const shred: PlayerProgress = { ...NO_PROGRESS, states: [{ pathId: "shred", startedAt: NOW, updatedAt: NOW }] };
    render(<PathsView session={fake(shred).session} />);
    open("shred");
    expect(screen.queryByTestId("path-start-first")).toBeNull();
    cleanup();
    // Rhythm Foundations chosen at Intermediate: through Beginner, Legato has nothing to suggest.
    const rhythm: PlayerProgress = {
      ...NO_PROGRESS,
      states: [{ pathId: "rhythm-foundations", level: "intermediate", startedAt: NOW, updatedAt: NOW }],
    };
    render(<PathsView session={fake(rhythm).session} />);
    open("legato");
    expect(screen.queryByTestId("path-start-first")).toBeNull();
    expect(screen.getByTestId("builds-on-page-legato")).toBeInTheDocument();
  });
});

describe("Subscribe offers what a Path builds on, never forces it", () => {
  it("subscribes, then offers the prerequisites not started; Add subscribes them too", () => {
    const { session, actions } = fake();
    render(<PathsView session={session} />);
    open("shred");
    fireEvent.click(screen.getByTestId("path-subscribe"));
    expect(actions.subscribe).toHaveBeenCalledTimes(1);
    expect(actions.subscribe.mock.calls[0][0].id).toBe("shred");
    const offer = screen.getByTestId("path-offer");
    expect(offer).toHaveTextContent("Alternate Picking and Legato come before this one. Add them to your Paths too?");
    fireEvent.click(screen.getByTestId("path-offer-add"));
    expect(actions.subscribe.mock.calls.map(([p]) => p.id)).toEqual(["shred", "alternate-picking", "legato"]);
    expect(screen.getByTestId("path-offer-result")).toHaveTextContent("Added Alternate Picking and Legato to your Paths.");
  });

  it("Not now closes it, and only the Path itself was subscribed", () => {
    const { session, actions } = fake();
    render(<PathsView session={session} />);
    open("legato");
    fireEvent.click(screen.getByTestId("path-subscribe"));
    expect(screen.getByTestId("path-offer")).toHaveTextContent("Rhythm Foundations comes before this one. Add it to your Paths too?");
    expect(screen.getByTestId("path-offer-add")).toHaveTextContent("Add Rhythm Foundations");
    fireEvent.click(screen.getByTestId("path-offer-no"));
    expect(screen.queryByTestId("path-offer")).toBeNull();
    expect(actions.subscribe.mock.calls.map(([p]) => p.id)).toEqual(["legato"]);
  });

  it("adds only what the cap leaves room for, and says so", () => {
    const two: PlayerProgress = {
      ...NO_PROGRESS,
      states: ["blues-pentatonics", "classic-rock"].map((pathId) => ({ pathId, startedAt: NOW, updatedAt: NOW })),
    };
    // The page reads the progress of before the press, as the hook's does.
    const { session, actions } = fake(two);
    const three = { ...two, states: [...two.states, { pathId: "shred", startedAt: NOW, updatedAt: NOW }] };
    const { rerender } = render(<PathsView session={session} />);
    open("shred");
    fireEvent.click(screen.getByTestId("path-subscribe"));
    rerender(<PathsView session={{ ...session, progress: three } as SessionRun} />);
    fireEvent.click(screen.getByTestId("path-offer-add"));
    expect(actions.subscribe.mock.calls.map(([p]) => p.id)).toEqual(["shred", "alternate-picking"]);
    expect(screen.getByTestId("path-offer-result")).toHaveTextContent("Added Alternate Picking to your Paths.");
    expect(screen.getByTestId("path-offer-cap")).toHaveTextContent("up to 4 Paths");
  });

  it("offers nothing for a Path whose prerequisites are started, or that builds on nothing", () => {
    const rhythm: PlayerProgress = { ...NO_PROGRESS, states: [{ pathId: "rhythm-foundations", startedAt: NOW, updatedAt: NOW }] };
    render(<PathsView session={fake(rhythm).session} />);
    open("legato");
    fireEvent.click(screen.getByTestId("path-subscribe"));
    expect(screen.queryByTestId("path-offer")).toBeNull();
    cleanup();
    render(<PathsView session={fake().session} />);
    open("know-the-neck");
    fireEvent.click(screen.getByTestId("path-subscribe"));
    expect(screen.queryByTestId("path-offer")).toBeNull();
  });
});

describe("the Paths list, by track", () => {
  it("the start, Technique, Styles and How harmony works, each with a line; Start here on Rhythm Foundations", () => {
    render(<PathsView session={fake().session} />);
    const names = [...document.querySelectorAll(".session-pathgroup-name")].map((h) => h.textContent);
    expect(names).toEqual(["Foundations", "Technique", "Styles", "How harmony works"]);
    expect(within(screen.getByTestId("path-track-start")).getByTestId("path-start-here")).toHaveTextContent("Start here");
    expect(screen.getAllByTestId("path-start-here")).toHaveLength(1);
    const harmony = screen.getByTestId("path-track-harmony");
    expect(harmony).toHaveTextContent("No theory needed to start.");
    expect([...harmony.querySelectorAll(".session-path-card")].map((c) => c.getAttribute("data-testid"))).toEqual([
      "path-card-know-the-neck",
      "path-card-scales-and-modes",
      "path-card-triads",
      "path-card-chords-in-a-key",
    ]);
  });

  it("a card says what it builds on; the name opens that Path, not the card's", () => {
    render(<PathsView session={fake().session} />);
    const card = screen.getByTestId("path-card-tapping");
    expect(within(card).getByTestId("builds-on-card-tapping")).toHaveTextContent("Builds on: Legato (Beginner)");
    // No badge, no lock: the card has the same parts as any other.
    expect(card).not.toHaveTextContent(/locked/i);
    fireEvent.click(within(card).getByTestId("builds-on-card-tapping-legato"));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Legato");
  });
});
