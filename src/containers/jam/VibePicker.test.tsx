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
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { Vibe } from "../../jam/vibesContract";
import { applyVibe } from "../../jam/vibesContract";
import { STARTER_JAMS } from "../../jam/jams";
import type { Jam } from "../../jam/types";
import { VibePicker } from "./VibePicker";

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

function draw(overrides: { jam?: Jam; jams?: Jam[] } = {}) {
  const props = {
    jam: overrides.jam ?? jamOf(),
    jams: overrides.jams ?? [],
    onApply: vi.fn(),
    onLoadOwn: vi.fn(),
  };
  return { ...render(<VibePicker {...props} />), props };
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
    expect(props.onApply).toHaveBeenCalledWith(applyVibe(ROCK));
    // The thirty-second rule made real: the drummer, the kit, the voices, the
    // tempo and the key, all from one press.
    const patch = props.onApply.mock.calls[0][0];
    expect(patch).toMatchObject({ grooveId: "rock8", kit: "tight", bpm: 120, key: "E" });
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
    expect(patch).toMatchObject({ variation: "punk", grooveId: "rock16", kit: "raw", bpm: 180 });
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
