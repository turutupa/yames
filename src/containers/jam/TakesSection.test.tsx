/**
 * The shelf, drawn (JAM_MODE §4.4).
 *
 * Three states have to be pictures rather than errors: nothing recorded yet,
 * a build whose engine cannot record, and a take playing back with the band
 * muted underneath it. And one thing has to be hard to do by accident, since
 * there is no undo behind it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TakesSection } from "./TakesSection";
import { TAKES_SIZE_NOTICE_BYTES, TAKE_BYTES_PER_SECOND } from "../../jam/takes";
import type { JamTake } from "../../jam/types";

function take(over: Partial<JamTake> = {}): JamTake {
  return {
    id: "t1",
    jamId: "j1",
    // A fixed instant far enough back that the row says a date rather than
    // "today", which would make the test depend on the hour it runs at.
    createdAt: new Date(2026, 0, 14, 15, 4).getTime(),
    durationSec: 247,
    path: "C:/takes/t1.wav",
    ...over,
  };
}

function draw(over: Partial<React.ComponentProps<typeof TakesSection>> = {}) {
  const props = {
    available: true as boolean | null,
    takes: [take()],
    recording: false,
    playingId: null as string | null,
    onPlay: vi.fn(),
    onStop: vi.fn(),
    onDelete: vi.fn(),
    ...over,
  };
  const utils = render(<TakesSection {...props} />);
  return { ...utils, props };
}

/** The one row on the shelf. */
const row = () => document.querySelector(".jam-take") as HTMLElement;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("the list", () => {
  it("gives each take its length and a play control", () => {
    draw();
    expect(within(row()).getByText("4:07")).toBeTruthy();
    expect(within(row()).getByLabelText("Play this take")).toBeTruthy();
  });

  it("says what recording is for when there is nothing on the shelf", () => {
    // A section that appears only once you have used it is a section nobody
    // finds, so it is drawn empty and says what it would hold.
    draw({ takes: [] });
    expect(screen.getByText(/Nothing recorded yet/i)).toBeTruthy();
  });

  it("says a take is on its way while one is being recorded", () => {
    draw({ takes: [], recording: true });
    expect(screen.getByText(/It lands here when you stop/i)).toBeTruthy();
  });

  it("makes the local-only promise every time, not once", () => {
    draw();
    expect(screen.getByText(/Nothing is uploaded/i)).toBeTruthy();
  });
});

describe("a build that cannot record", () => {
  it("says so, and offers nothing that would not work", () => {
    draw({ available: false, takes: [] });
    expect(screen.getByText(/not available in this version/i)).toBeTruthy();
    expect(screen.queryByText(/Nothing is uploaded/i)).toBeNull();
  });

  it("draws nothing at all while the answer is still on its way", () => {
    // `null` is "we have not asked yet", and a "cannot record" sentence shown
    // for a beat and then taken back is worse than a beat of nothing.
    draw({ available: null, takes: [] });
    expect(screen.queryByText(/not available in this version/i)).toBeNull();
  });
});

describe("playing one back", () => {
  it("asks to play, and to stop the one that is playing", async () => {
    const { props } = draw();
    await userEvent.click(within(row()).getByLabelText("Play this take"));
    expect(props.onPlay).toHaveBeenCalledWith("t1");

    cleanup();
    const second = draw({ playingId: "t1" });
    await userEvent.click(within(row()).getByLabelText("Stop"));
    expect(second.props.onStop).toHaveBeenCalled();
  });

  it("says the band is silent, rather than letting you think it crashed", () => {
    draw({ playingId: "t1" });
    expect(within(row()).getByText("band silent")).toBeTruthy();
  });

  it("holds the other takes still while one plays", () => {
    // The engine has muted the band and is playing a file. Starting a second
    // one underneath it is not something it has been asked to survive.
    draw({ takes: [take({ id: "a" }), take({ id: "b" })], playingId: "a" });
    const rows = document.querySelectorAll(".jam-take");
    const other = within(rows[1] as HTMLElement);
    expect(other.getByLabelText("Play this take").hasAttribute("disabled")).toBe(true);
    expect(other.getByText("Delete").hasAttribute("disabled")).toBe(true);
  });

  it("holds them still while a take is being recorded too", () => {
    draw({ recording: true });
    expect(within(row()).getByLabelText("Play this take").hasAttribute("disabled")).toBe(true);
  });
});

describe("deleting one", () => {
  it("asks first, because there is no undo", async () => {
    const { props } = draw();
    await userEvent.click(within(row()).getByText("Delete"));
    expect(props.onDelete).not.toHaveBeenCalled();
    expect(within(row()).getByText(/There is no undo/i)).toBeTruthy();

    // "Delete" now appears twice — the question and the answer.
    const confirm = within(row()).getByText("Delete", { selector: ".jam-take-confirm-yes" });
    await userEvent.click(confirm);
    expect(props.onDelete).toHaveBeenCalledWith("t1");
  });

  it("lets you back out, and leaves the take alone", async () => {
    const { props } = draw();
    await userEvent.click(within(row()).getByText("Delete"));
    await userEvent.click(within(row()).getByText("Keep"));
    expect(props.onDelete).not.toHaveBeenCalled();
    expect(within(row()).getByText("Delete")).toBeTruthy();
  });
});

describe("the folder size", () => {
  it("is silent until the folder is worth mentioning", () => {
    draw();
    expect(screen.queryByText(/MB on disk/i)).toBeNull();
  });

  it("says it once there is more kept than listened to", () => {
    const seconds = (TAKES_SIZE_NOTICE_BYTES * 2) / TAKE_BYTES_PER_SECOND;
    draw({ takes: [take({ durationSec: seconds })] });
    expect(screen.getByText(/about 200 MB on disk/i)).toBeTruthy();
  });
});
