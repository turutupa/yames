/**
 * What Today hands its practice-reminder line (rem2c): the Session's Takes only
 * once a read of them answered (a failed read, or the `[]` a press builds
 * before the first read lands, is not "no Takes"), and the instrument only when
 * the player chose it.
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionRun } from "./hooks/useSessionRun";

const seen = vi.hoisted(() => ({ props: [] as Array<Record<string, unknown>> }));

vi.mock("./TodayReminder", () => ({
  TodayReminder: (props: Record<string, unknown>) => {
    seen.props.push(props);
    return null;
  },
}));

import { TodayView } from "./TodayView";

const TAKES = [{ startedAt: 1 }];

function session(takesKnown: boolean | undefined): SessionRun {
  return {
    plan: { mood: "first", steps: [], daysAway: null },
    minutes: 10,
    setMinutes: vi.fn(),
    paths: [],
    myPaths: [],
    // Not NO_PROGRESS: what a press builds before the first read lands, or a failed read.
    progress: { states: [], takes: TAKES, ceilings: [], unsubscribed: [] },
    takesKnown,
    actions: { startToday: vi.fn(), startTodayAt: vi.fn() },
  } as unknown as SessionRun;
}

function last() {
  return seen.props[seen.props.length - 1];
}

beforeEach(() => {
  seen.props.length = 0;
});
afterEach(cleanup);

describe("Today's reminder props (rem2c)", () => {
  it("hands the Takes only when their read answered", () => {
    render(<TodayView session={session(false)} onOpenTools={vi.fn()} onOpenPaths={vi.fn()} />);
    expect(last().takes).toBeNull();
    cleanup();
    render(<TodayView session={session(undefined)} onOpenTools={vi.fn()} onOpenPaths={vi.fn()} />);
    expect(last().takes).toBeNull();
    cleanup();
    render(<TodayView session={session(true)} onOpenTools={vi.fn()} onOpenPaths={vi.fn()} />);
    expect(last().takes).toBe(TAKES);
  });

  it("names the instrument only when the player chose it", () => {
    render(
      <TodayView session={session(true)} onOpenTools={vi.fn()} onOpenPaths={vi.fn()} instrument="bass" instrumentChosen />,
    );
    expect(last().instrument).toBe("bass");
    cleanup();
    // The electric-guitar fallback before a choice is not the player's instrument.
    render(<TodayView session={session(true)} onOpenTools={vi.fn()} onOpenPaths={vi.fn()} instrument="electric-guitar" />);
    expect(last().instrument).toBeUndefined();
  });
});
