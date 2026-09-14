/**
 * The vibe picker: eight tiles, and the variations of whichever one is picked
 * (plans/JAM_UX_DECISIONS.md A2, A9).
 *
 * The vibe DATA belongs to another module and is not written yet, so this
 * file supplies two of its own. That is the right thing to test against
 * anyway: what the picker has to get right is the wiring — the tile applies
 * the bundle, the picked tile shows its variations, a variation applies over
 * the vibe, and "one of yours" loads a jam rather than patching this one.
 */
import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import { act, render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { Vibe } from "../../jam/vibesContract";
import { applyVibe } from "../../jam/vibesContract";
import { STARTER_JAMS } from "../../jam/jams";
import type { Jam } from "../../jam/types";
import { VibePicker } from "./VibePicker";
import type { VibePreviewMark } from "./VibePicker";

// The picker reads `VIBES` from the contract module; the stub is empty until
// the data lands, so the two below are handed in through the same door the
// real ones will come through. `vi.hoisted` because the mock factory is
// hoisted above every const in this file, and a getter is what lets it read a
// list filled in afterwards.
const stub = vi.hoisted(() => ({ vibes: [] as unknown[] }));
vi.mock("../../jam/vibesContract", async () => {
  const actual = await vi.importActual<typeof import("../../jam/vibesContract")>(
    "../../jam/vibesContract",
  );
  return {
    ...actual,
    get VIBES() {
      return stub.vibes;
    },
  };
});

const ROCK: Vibe = {
  id: "rock",
  grooveId: "rock8",
  kit: "tight",
  feel: "straight",
  intensity: "normal",
  bassVoice: "picked",
  keysVoice: "organ",
  band: { drums: true, bass: false, keys: false },
  fills: true,
  fillEvery: 0,
  bpm: 120,
  key: "E",
  variations: [
    { id: "classic", grooveId: "rock8", kit: "tight", feel: "straight", intensity: "normal", bpm: 120 },
    { id: "punk", grooveId: "rock16", kit: "raw", feel: "straight", intensity: "loud", bpm: 180 },
  ],
};

const BLUES: Vibe = {
  ...ROCK,
  id: "blues",
  grooveId: "shuffle",
  kit: "room",
  feel: "shuffle",
  bpm: 92,
  key: "A blues",
  variations: [],
};

stub.vibes = [ROCK, BLUES];

const jamOf = (overrides: Partial<Jam> = {}): Jam => ({ ...STARTER_JAMS[0], ...overrides });

function draw(
  overrides: { jam?: Jam; jams?: Jam[]; previewing?: VibePreviewMark | null } = {},
) {
  const props = {
    jam: overrides.jam ?? jamOf(),
    jams: overrides.jams ?? [],
    onApply: vi.fn(),
    onLoadOwn: vi.fn(),
    onPreview: vi.fn(),
    onStopPreview: vi.fn(),
    previewing: overrides.previewing ?? null,
  };
  return { ...render(<VibePicker {...props} />), props };
}

/** A mouse crossing a tile, as the DOM reports it. */
function hover(el: HTMLElement) {
  fireEvent.pointerEnter(el, { pointerType: "mouse" });
}

function unhover(el: HTMLElement) {
  fireEvent.pointerLeave(el, { pointerType: "mouse" });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("the vibe tiles", () => {
  it("draws one tile per vibe, with what it promises under the name", () => {
    draw();
    expect(screen.getByRole("button", { name: /Rock/ })).toBeInTheDocument();
    // "Rock 8ths · Tight · 120" — the groove, the kit and the tempo, so the
    // tile is a promise rather than a word.
    expect(screen.getByText(/Rock 8ths · Tight · 120/)).toBeInTheDocument();
  });

  it("applies the whole bundle on one tap", () => {
    const { props } = draw();
    fireEvent.click(screen.getByRole("button", { name: /Rock/ }));
    // The patch is worked out FOR this jam — the tile clears its meter
    // override, carries its count-in and refits its changes — so the
    // expectation is the same call with the same jam.
    expect(props.onApply).toHaveBeenCalledWith(applyVibe(props.jam, ROCK));
    // The thirty-second rule made real: the drummer, the kit, the voices, the
    // tempo and the key, all from one press.
    const patch = props.onApply.mock.calls[0][0];
    expect(patch).toMatchObject({ vibe: "rock", grooveId: "rock8", bpm: 120 });
  });

  it("marks the vibe the jam started from", () => {
    draw({ jam: jamOf({ vibe: "blues" }) });
    const pressed = screen
      .getAllByRole("button")
      .filter((b) => b.getAttribute("aria-pressed") === "true");
    expect(pressed).toHaveLength(1);
    expect(pressed[0].textContent).toContain("Blues");
  });
});

describe("the variations of the picked vibe", () => {
  it("stays out of the way until a vibe is picked", () => {
    draw();
    expect(screen.queryByText(/which one/)).toBeNull();
  });

  it("shows them once the vibe is on the record", () => {
    draw({ jam: jamOf({ vibe: "rock" }) });
    expect(screen.getByText("Rock, which one")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Classic" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Punk" })).toBeInTheDocument();
  });

  it("applies the variation over the vibe", () => {
    const { props } = draw({ jam: jamOf({ vibe: "rock" }) });
    fireEvent.click(screen.getByRole("button", { name: "Punk" }));
    const patch = props.onApply.mock.calls[0][0];
    // The variation's own bundle, over the vibe's, worked out for this jam —
    // which is `applyVibe`'s job and is pinned in `vibesContract.test.ts`.
    // What the picker has to get right is that it asked for THIS variation.
    expect(patch.variation).toBe("punk");
    expect(patch).toEqual(applyVibe(props.jam, ROCK, "punk"));
  });

  it("shows nothing for a vibe with one way of playing it", () => {
    draw({ jam: jamOf({ vibe: "blues" }) });
    expect(screen.queryByText(/which one/)).toBeNull();
  });
});

describe("one of yours", () => {
  it("lists your saved jams of this vibe, and nothing else", () => {
    draw({
      jam: jamOf({ id: "open", vibe: "rock" }),
      jams: [
        { ...jamOf(), id: "a", name: "Garage in E", vibe: "rock" },
        { ...jamOf(), id: "b", name: "Slow one", vibe: "blues" },
        { ...jamOf(), id: "open", name: "This one", vibe: "rock" },
      ],
    });
    expect(screen.getByRole("button", { name: "Garage in E" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Slow one" })).toBeNull();
    // Not the jam you already have open: loading it would be a no-op that
    // looks like a bug.
    expect(screen.queryByRole("button", { name: "This one" })).toBeNull();
  });

  it("loads the jam rather than patching the one on the stage", () => {
    const own = { ...jamOf(), id: "a", name: "Garage in E", vibe: "rock" };
    const { props } = draw({ jam: jamOf({ id: "open", vibe: "rock" }), jams: [own] });
    fireEvent.click(screen.getByRole("button", { name: "Garage in E" }));
    expect(props.onLoadOwn).toHaveBeenCalledWith(own);
    expect(props.onApply).not.toHaveBeenCalled();
  });

  it("says so when you have not saved one yet", () => {
    draw({ jam: jamOf({ vibe: "rock" }) });
    expect(screen.getByText("none saved yet")).toBeInTheDocument();
  });
});

/**
 * Every tile plays (JAM_KILLER §2 A4).
 *
 * What the picker has to get right is the GESTURE, not the sound: the band is
 * the hook's business and is tested there. Here — a rest rather than a
 * crossing, Space that auditions instead of choosing, a tile that says it is
 * sounding, and a variation chip that asks for itself rather than for its
 * vibe.
 */
describe("the tiles that play", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const rock = () => screen.getByRole("button", { name: /Rock/ });

  it("waits for the mouse to rest before it starts a band", () => {
    const { props } = draw();
    hover(rock());
    // A hand crossing the grid to reach Jazz passes over three tiles it does
    // not mean. Nothing has been asked for yet.
    expect(props.onPreview).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(400));
    expect(props.onPreview).toHaveBeenCalledWith("rock", undefined);
  });

  it("asks for nothing at all when the mouse moves straight on", () => {
    const { props } = draw();
    const tile = rock();
    hover(tile);
    act(() => void vi.advanceTimersByTime(120));
    unhover(tile);
    act(() => void vi.advanceTimersByTime(1000));
    expect(props.onPreview).not.toHaveBeenCalled();
    // Moving off is still a stop: a band left playing because the pointer
    // left before the timer did would be the worst of both.
    expect(props.onStopPreview).toHaveBeenCalled();
  });

  it("stops when the mouse leaves", () => {
    const { props } = draw();
    const tile = rock();
    hover(tile);
    act(() => void vi.advanceTimersByTime(400));
    unhover(tile);
    expect(props.onStopPreview).toHaveBeenCalled();
  });

  it("holds, rather than hovers, on a screen with no hover", () => {
    const { props } = draw();
    const tile = rock();
    fireEvent.pointerDown(tile, { pointerType: "touch" });
    act(() => void vi.advanceTimersByTime(300));
    // A tap is not a hold: at 300ms this is still somebody choosing the tile.
    expect(props.onPreview).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(300));
    expect(props.onPreview).toHaveBeenCalledWith("rock", undefined);
    fireEvent.pointerUp(tile, { pointerType: "touch" });
    expect(props.onStopPreview).toHaveBeenCalled();
  });

  it("auditions on Space and chooses on click, never the other way round", () => {
    const { props } = draw();
    const tile = rock();
    fireEvent.keyDown(tile, { key: " " });
    expect(props.onPreview).toHaveBeenCalledWith("rock", undefined);
    // Space must not also be the keystroke that picks the vibe.
    expect(props.onApply).not.toHaveBeenCalled();

    fireEvent.click(tile);
    expect(props.onApply).toHaveBeenCalled();
  });

  it("marks the tile the band is on, and only that one", () => {
    const { container } = draw({ previewing: { vibeId: "rock", sounding: true } });
    const marks = container.querySelectorAll(".jam-vibe-playing");
    expect(marks).toHaveLength(1);
    expect(rock()).toHaveClass("jam-vibe-previewing");
    // Sounding, so the mark is moving rather than waiting.
    expect(marks[0].hasAttribute("data-armed")).toBe(false);
  });

  it("says 'coming' rather than 'playing' while it waits for the bar line", () => {
    const { container } = draw({ previewing: { vibeId: "rock", sounding: false } });
    expect(container.querySelector(".jam-vibe-playing")).toHaveAttribute("data-armed");
  });

  it("asks for the variation, not for its vibe, and marks the chip", () => {
    const { container, props } = draw({
      jam: jamOf({ vibe: "rock" }),
      previewing: { vibeId: "rock", variationId: "punk", sounding: true },
    });
    // The tile above is NOT the thing playing: the chip is.
    expect(rock()).not.toHaveClass("jam-vibe-previewing");
    expect(screen.getByRole("button", { name: /Punk/ })).toHaveClass("jam-vibe-previewing");
    expect(container.querySelectorAll(".jam-vibe-playing")).toHaveLength(1);

    fireEvent.keyDown(screen.getByRole("button", { name: /Punk/ }), { key: " " });
    expect(props.onPreview).toHaveBeenCalledWith("rock", "punk");
  });

  it("is tiles and nothing else on a build that cannot play them", () => {
    const props = {
      jam: jamOf(),
      jams: [],
      onApply: vi.fn(),
      onLoadOwn: vi.fn(),
    };
    const { container } = render(<VibePicker {...props} />);
    hover(screen.getByRole("button", { name: /Rock/ }));
    act(() => void vi.advanceTimersByTime(1000));
    expect(container.querySelector(".jam-vibe-playing")).toBeNull();
    // And choosing one still works, which is the thing that must never break.
    fireEvent.click(screen.getByRole("button", { name: /Rock/ }));
    expect(props.onApply).toHaveBeenCalled();
  });
});
