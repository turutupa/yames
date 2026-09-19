// The Jam stage. What is worth pinning here is the timeline — it is the
// headline of the whole mode (JAM_MODE §4.2), it is the only thing on the
// screen driven by the engine rather than by the record, and "which bar of
// the twelve am I on" is the question the mode exists to answer.
import { GROOVES, GROOVE_FAMILIES, groovesInFamily } from "../../jam/grooves";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { createRef } from "react";
import { JamView } from "./JamView";
import { STARTER_JAMS } from "../../jam/jams";
import { CHORD_QUALITIES } from "../../jam/diatonic";
import type { Jam } from "../../jam/types";
import type { BeatEvent } from "../../types";

const jamOf = (overrides: Partial<Jam> = {}): Jam => ({
  ...STARTER_JAMS[0],
  ...overrides,
});

function beat(formBar: number, chorus = 1, measureBeat = 0): BeatEvent {
  return {
    beat: formBar * 4 + measureBeat,
    measureBeat,
    subdivision: 0,
    isDownbeat: measureBeat === 0,
    accentLevel: measureBeat === 0 ? 2 : 0,
    isAccent: measureBeat === 0,
    formBar,
    chorus,
    bandState: "full",
  };
}

/**
 * The groove picker: the chip row, the shelves, and the "make your own" card.
 *
 * Some groove names are also meter names — "6/8" is a groove AND a meter
 * preset — so a query for one by text has to say which control it means.
 */
function grooveCards(container: HTMLElement): HTMLElement {
  return container.querySelector(".jam-groove-shelves") as HTMLElement;
}

/**
 * Open the "All" shelf, so every groove is on screen at once.
 *
 * The picker opens on the shelf the loaded jam's groove is on (a hundred and
 * fifteen cards in one grid is a wall), so a test that means "every groove"
 * has to say so.
 */
function allGrooves(container: HTMLElement): HTMLElement {
  const shelves = grooveCards(container);
  fireEvent.click(within(shelves).getByText("All"));
  return shelves;
}

/** Where a groove's card sits with "All" open: shelf by shelf, not file order. */
function shelfIndex(id: string): number {
  const ordered = GROOVE_FAMILIES.flatMap((family) => groovesInFamily(family));
  return ordered.findIndex((g) => g.id === id);
}

/** The screen state the view does not own — inert unless a test drives it. */
function screenState(
  overrides: Partial<React.ComponentProps<typeof JamView>["screen"]> = {},
): React.ComponentProps<typeof JamView>["screen"] {
  return {
    cheatTab: "chords" as const,
    setCheatTab: vi.fn(),
    chordPage: "key" as const,
    setChordPage: vi.fn(),
    chordFlavour: "triads" as const,
    setChordFlavour: vi.fn(),
    onlyInKey: false,
    setOnlyInKey: vi.fn(),
    shapeIndex: 0,
    setShapeIndex: vi.fn(),
    pinnedChord: null,
    setPinnedChord: vi.fn(),
    editorOpen: false,
    setEditorOpen: vi.fn(),
    editorPage: "bar" as const,
    setEditorPage: vi.fn(),
    editingChords: false,
    setEditingChords: vi.fn(),
    editingBar: null,
    setEditingBar: vi.fn(),
    setupOpen: false,
    setSetupOpen: vi.fn(),
    chordsOpen: false,
    setChordsOpen: vi.fn(),
    ...overrides,
  };
}

/** The takes shelf. Empty and available unless a test says otherwise. */
function takesState(
  overrides: Partial<React.ComponentProps<typeof JamView>["takes"]> = {},
): React.ComponentProps<typeof JamView>["takes"] {
  return {
    available: true,
    takes: [],
    recording: false,
    recordedSeconds: 0,
    playingId: null,
    dirBytes: 0,
    play: vi.fn(),
    stopPlayback: vi.fn(),
    remove: vi.fn(),
    requestTakes: vi.fn(),
    introOpen: false,
    confirmIntro: vi.fn(),
    cancelIntro: vi.fn(),
    ...overrides,
  };
}

/** Where the form is being sent. Inert unless a test drives it. */
function positionState(
  overrides: Partial<React.ComponentProps<typeof JamView>["position"]> = {},
): React.ComponentProps<typeof JamView>["position"] {
  return {
    loop: null,
    pendingJump: null,
    currentBar: 0,
    jumpTo: vi.fn(),
    toggleSectionLoop: vi.fn(),
    ...overrides,
  };
}

function setup(
  overrides: Partial<React.ComponentProps<typeof JamView>> = {},
  container?: HTMLElement,
) {
  const props = {
    jam: jamOf(),
    jams: [] as Jam[],
    onEdit: vi.fn(),
    onLoadJam: vi.fn(),
    currentBeat: null as BeatEvent | null,
    isPlaying: false,
    instrument: "electric-guitar",
    lineup: { drums: true, bass: true },
    trainedBpm: null as number | null,
    listening: false,
    takes: takesState(),
    onToggleTakes: vi.fn(),
    onPreviewKit: vi.fn(),
    previewingKit: null as string | null,
    screen: screenState(),
    position: positionState(),
    tapActive: false,
    tapCount: 0,
    tapPulse: false,
    editingBpm: false,
    bpmEditValue: "",
    setBpmEditValue: vi.fn(),
    setEditingBpm: vi.fn(),
    bpmInputRef: createRef<HTMLInputElement>(),
    onTap: vi.fn(),
    onBpmChange: vi.fn(),
    onStartBpmEdit: vi.fn(),
    onCommitBpmEdit: vi.fn(),
    ...overrides,
  };
  // A container, for the tests that need a real `.main-content` around the
  // stage: the docked sheet portals into it, measures it and listens on it
  // (A12), none of which it can do against a container it invented.
  const utils = render(<JamView {...props} />, container ? { container } : undefined);
  return { ...utils, props };
}

/**
 * The same stage with the SETUP SHEET down (JAM_UX_DECISIONS A1).
 *
 * Everything you set once an hour lives on the sheet now, so a test about the
 * groove cards or the form has to open it first — which is also what a person
 * does. `screenState` is threaded through so a test can still override the
 * rest of the screen state.
 */
function sheet(
  overrides: Partial<React.ComponentProps<typeof JamView>> = {},
  screenOverrides: Partial<React.ComponentProps<typeof JamView>["screen"]> = {},
) {
  return setup({ ...overrides, screen: screenState({ setupOpen: true, ...screenOverrides }) });
}

/** The same, with the CHORD SHEET down (A8). */
function chordSheet(
  overrides: Partial<React.ComponentProps<typeof JamView>> = {},
  screenOverrides: Partial<React.ComponentProps<typeof JamView>["screen"]> = {},
) {
  return setup({ ...overrides, screen: screenState({ chordsOpen: true, ...screenOverrides }) });
}

/**
 * The setup sheet, with the settings that used to be folded into "More".
 *
 * They are not folded any more: the meter went to the form, what you read
 * went to the changes, and the takes got a section of their own. The helper
 * survives its own disclosure because every caller of it is a test about one
 * of those three, and what they assert did not change — only where you find
 * the control did.
 */
function sheetWithMore(overrides: Partial<React.ComponentProps<typeof JamView>> = {}) {
  return sheet(overrides);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("JamView — the form timeline", () => {
  it("says which bar of the form the band is on", () => {
    setup({ currentBeat: beat(2), isPlaying: true });
    expect(screen.getByText(/bar 3 of 12/)).toBeInTheDocument();
  });

  it("says which chorus, because a loop with no count is a loop you lose", () => {
    setup({ currentBeat: beat(2, 4), isPlaying: true });
    expect(screen.getByText(/chorus 4/)).toBeInTheDocument();
  });

  it("lights exactly one cell, and lights the one it names", () => {
    const { container } = setup({ currentBeat: beat(2), isPlaying: true });
    const lit = container.querySelectorAll(".jam-timeline-cell[data-current]");
    expect(lit).toHaveLength(1);
    expect(lit[0].textContent).toContain("3");
  });

  it("draws one cell per bar, grouped into the form's sections", () => {
    // Twelve cells in a row are twelve of something; three fours are a blues.
    const { container } = setup();
    expect(container.querySelectorAll(".jam-timeline-cell")).toHaveLength(12);
    const groups = container.querySelectorAll(".jam-timeline-group");
    expect(groups).toHaveLength(3);
    for (const group of groups) {
      expect(within(group as HTMLElement).getAllByText(/^\d+$/)).toHaveLength(4);
    }
  });

  it("marks the last bar of the chorus when fills are on, and not when they are off", () => {
    const { container, rerender, props } = setup();
    const marked = container.querySelectorAll(".jam-timeline-cell[data-fill]");
    expect(marked).toHaveLength(1);
    expect(marked[0].textContent).toContain("12");

    rerender(<JamView {...props} jam={jamOf({ fills: false })} />);
    expect(container.querySelectorAll(".jam-timeline-cell[data-fill]")).toHaveLength(0);
  });

  it("marks bar one at rest rather than nothing at all", () => {
    // You are always about to play bar one. An unlit timeline reads as a
    // picture rather than a readout.
    const { container } = setup({ currentBeat: beat(7, 2), isPlaying: false });
    expect(screen.getByText(/bar 1 of 12/)).toBeInTheDocument();
    expect(container.querySelectorAll(".jam-timeline-progress")).toHaveLength(0);
  });

  it("fills the lit bar as the bar goes by", () => {
    const { container } = setup({ currentBeat: beat(2, 1, 1), isPlaying: true });
    const progress = container.querySelector(".jam-timeline-progress") as HTMLElement;
    // Beat two of four: halfway.
    expect(progress.style.transform).toBe("scaleX(0.5)");
  });

  it("letters an AABA and leaves a blues's sections unnamed", () => {
    const { container, rerender, props } = setup();
    expect(container.querySelectorAll(".jam-timeline-name")).toHaveLength(0);

    rerender(<JamView {...props} jam={jamOf({ form: { kind: "aaba32", bars: 32 } })} />);
    expect(
      [...container.querySelectorAll(".jam-timeline-name")].map((n) => n.textContent),
    ).toEqual(["A", "A", "B", "A"]);
  });

  it("marks every bar that carries a fill, not only the last one", () => {
    const marks = (root: HTMLElement) =>
      [...root.querySelectorAll(".jam-timeline-cell[data-fill] .jam-timeline-number")].map(
        (n) => n.textContent,
      );

    const { container, rerender, props } = setup({
      jam: jamOf({ fills: true, fillEvery: 4 }),
    });
    expect(marks(container)).toEqual(["4", "8", "12"]);

    // Eight into twelve does not go, and the chorus end keeps its fill: it is
    // the one the crash on the next one answers.
    rerender(<JamView {...props} jam={jamOf({ fills: true, fillEvery: 8 })} />);
    expect(marks(container)).toEqual(["8", "12"]);
  });
});

/**
 * Moving through the form.
 *
 * The timeline stopped being a readout and became the control that says "not
 * from the top — from the bridge". What is worth pinning is that it asks for
 * the bar at the next bar line rather than pretending to have moved, and that
 * the practice tools drawn ahead do not shift when a loop is set.
 */
describe("JamView — moving through the form", () => {
  const cells = (container: HTMLElement) =>
    [...container.querySelectorAll(".jam-timeline-cell")] as HTMLButtonElement[];

  it("asks for the bar you click", () => {
    const { container, props } = setup();
    fireEvent.click(cells(container)[6]);
    expect(props.position.jumpTo).toHaveBeenCalledWith(6);
  });

  it("marks the bar it is on the way to without lighting it", () => {
    // Two bright cells would be two answers to "where am I". The one playing
    // stays the lit one; the one asked for gets a mark of its own.
    const { container } = setup({
      currentBeat: beat(1),
      isPlaying: true,
      position: positionState({ pendingJump: 8 }),
    });
    const pending = container.querySelectorAll(".jam-timeline-cell[data-pending]");
    expect(pending).toHaveLength(1);
    expect(pending[0].textContent).toContain("9");
    const lit = container.querySelectorAll(".jam-timeline-cell[data-current]");
    expect(lit).toHaveLength(1);
    expect(lit[0].textContent).toContain("2");
  });

  it("says where the take will start while the transport is stopped", () => {
    setup({
      isPlaying: false,
      position: positionState({ pendingJump: 4, currentBar: 4 }),
    });
    expect(screen.getByText(/starts at bar 5/)).toBeInTheDocument();
  });

  it("starts on the loop's first bar, and says so", () => {
    // Stopped, with the bridge on repeat. The engine restarts at the loop's
    // first bar, so a readout lighting bar one is a readout that is wrong
    // about the one thing this timeline is for.
    const { container } = setup({
      isPlaying: false,
      position: positionState({ loop: { start: 4, end: 7 }, currentBar: 4 }),
    });
    expect(screen.getByText(/starts at bar 5/)).toBeInTheDocument();
    const lit = container.querySelectorAll(".jam-timeline-cell[data-current]");
    expect(lit).toHaveLength(1);
    expect(lit[0].textContent).toContain("5");
  });

  it("keeps the readout to the bar you are on once it is playing", () => {
    // With the band running the pending cell says it, and the sentence has a
    // live bar to report.
    setup({
      currentBeat: beat(1),
      isPlaying: true,
      position: positionState({ pendingJump: 4 }),
    });
    expect(screen.queryByText(/starts at bar/)).not.toBeInTheDocument();
  });

  it("offers a loop on every section and says which bars are looping", () => {
    const { container, props } = setup();
    const loops = container.querySelectorAll(".jam-timeline-loop");
    expect(loops).toHaveLength(3);
    fireEvent.click(loops[1]);
    expect(props.position.toggleSectionLoop).toHaveBeenCalledWith({ start: 4, end: 7 });
  });

  it("marks the looped bars and names them in the header", () => {
    const { container } = setup({ position: positionState({ loop: { start: 4, end: 7 } }) });
    const looped = [...container.querySelectorAll(".jam-timeline-cell[data-looped]")].map(
      (c) => c.querySelector(".jam-timeline-number")?.textContent,
    );
    expect(looped).toEqual(["5", "6", "7", "8"]);
    expect(screen.getByText("looping bars 5–8")).toBeInTheDocument();
    // And exactly one section's button reads as pressed.
    const pressed = [...container.querySelectorAll(".jam-timeline-loop")].filter(
      (b) => b.getAttribute("aria-pressed") === "true",
    );
    expect(pressed).toHaveLength(1);
  });

  it("leaves the drawn-ahead band states where the chorus put them when a loop is set", () => {
    // The practice windows are phase-locked to the CHORUS, and a loop does not
    // start a new chorus. If the timeline ever recomputed them from a
    // loop-relative bar, a looped bridge would silence a different bar every
    // time round and the drop-out you counted into would move.
    const practice = {
      dropOutEvery: 4,
      dropOutBars: 1,
      tradeBars: 0,
      tempoStep: 0,
      tempoEveryChoruses: 0,
    };
    const jam = jamOf({ practice });
    const withoutLoop = setup({ jam, currentBeat: beat(0), isPlaying: true });
    const before = [...withoutLoop.container.querySelectorAll(".jam-timeline-cell")].map((c) =>
      c.getAttribute("data-band"),
    );
    cleanup();

    const withLoop = setup({
      jam,
      currentBeat: beat(0),
      isPlaying: true,
      position: positionState({ loop: { start: 4, end: 7 } }),
    });
    const after = [...withLoop.container.querySelectorAll(".jam-timeline-cell")].map((c) =>
      c.getAttribute("data-band"),
    );
    expect(after).toEqual(before);
    // And the drop-out really is drawn, or the check above is comparing two
    // rows of nothing.
    expect(before.some((state) => state === "silent")).toBe(true);
  });
});

describe("JamView — the controls", () => {
  it("shows the jam's tempo, not the engine's", () => {
    setup({ jam: jamOf({ bpm: 92 }) });
    expect(screen.getByText("92")).toBeInTheDocument();
  });

  it("opens on the shelf the loaded groove is on", () => {
    // A hundred and fifteen cards in one grid is a wall. The picker follows
    // the jam, so the card that is selected is the one you are looking at.
    const { container } = sheet({ jam: jamOf({ grooveId: "bossa" }) });
    const shelves = grooveCards(container);
    const cards = shelves.querySelectorAll(".jam-cards-groove .jam-card");
    // The Latin shelf, plus "Make your own" under it.
    expect(cards).toHaveLength(groovesInFamily("latin").length + 1);
    expect(within(shelves).getByText("Latin")).toHaveAttribute("aria-pressed", "true");
    expect(within(shelves).queryByText("Motown")).toBeNull();
  });

  it("offers every groove, a card for one of your own, and marks the one that is loaded", () => {
    const { container } = sheet({ jam: jamOf({ grooveId: "bossa" }) });
    const cards = allGrooves(container).querySelectorAll(".jam-cards-groove .jam-card");
    // Every preset and "Make your own". The last card is one of the
    // choices rather than a mode to go and find, which is the difference
    // between an editor people use and one they read about in a changelog.
    expect(cards).toHaveLength(GROOVES.length + 1);
    expect(cards[GROOVES.length].textContent).toContain("Make your own");
    const pressed = [...cards].filter((c) => c.getAttribute("aria-pressed") === "true");
    expect(pressed).toHaveLength(1);
    expect(pressed[0].textContent).toContain("Bossa");
  });

  it("marks the last card instead once the groove is yours", () => {
    const { container } = sheet({
      jam: jamOf({
        grooveId: "bossa",
        customGroove: {
          name: "Mine",
          beatsPerBar: 4,
          ticksPerBeat: 2,
          bar: {
            kick: [1, 0, 0, 0, 1, 0, 0, 0],
            snare: [0, 0, 0, 0, 0, 0, 0, 0],
            hat: [0, 0, 0, 0, 0, 0, 0, 0],
            ride: [0, 0, 0, 0, 0, 0, 0, 0],
            crash: [0, 0, 0, 0, 0, 0, 0, 0],
          },
          fill: null,
        },
      }),
    });
    const cards = container.querySelectorAll(".jam-cards-groove .jam-card");
    const pressed = [...cards].filter((c) => c.getAttribute("aria-pressed") === "true");
    expect(pressed).toHaveLength(1);
    expect(pressed[0].textContent).toContain("Mine");
  });

  it("draws each groove's glyph from its own pattern", () => {
    // The picture IS the table, so a groove whose pattern changes cannot end
    // up advertising the old one.
    const { container } = sheet();
    const glyphs = allGrooves(container).querySelectorAll(".jam-cards-groove .jam-glyph");
    // One per preset and not one more. "Make your own" used to draw the
    // loaded groove's pattern so as not to be a blank square, which is
    // exactly why it read as a hundred-and-sixteenth preset — the owner:
    // "the make your own preset button should be different and should not
    // look like another preset". It draws a plus now, and there is a glyph
    // on screen for every groove that exists and for nothing that does not.
    expect(glyphs).toHaveLength(GROOVES.length);
    // Rock eighths is 4 × 2 ticks over three lanes; the bossa is 4 × 4. Found
    // by shelf rather than by index into GROOVES: with "All" open the cards
    // are drawn family block after family block, not in file order.
    expect(glyphs[shelfIndex("rock8")].querySelectorAll("circle")).toHaveLength(8 * 3);
    expect(glyphs[shelfIndex("bossa")].querySelectorAll("circle")).toHaveLength(16 * 3);
  });

  it("carries the count-in over to the new groove's meter", () => {
    // One bar of a waltz is three beats, not four. A count-in in the wrong
    // meter lands you on beat two of the first bar.
    const { container, props } = sheet({ jam: jamOf({ grooveId: "rock8", countIn: 4 }) });
    fireEvent.click(within(allGrooves(container)).getByText("Waltz"));
    expect(props.onEdit).toHaveBeenCalledWith({ grooveId: "waltz", countIn: 3 });
  });

  it("leaves a count-in of none alone when the groove changes", () => {
    const { container, props } = sheet({ jam: jamOf({ grooveId: "rock8", countIn: 0 }) });
    fireEvent.click(within(allGrooves(container)).getByText("Waltz"));
    expect(props.onEdit).toHaveBeenCalledWith({ grooveId: "waltz", countIn: 0 });
  });

  it("keeps two bars at two bars, and drops to one where two will not fit", () => {
    // The setting is bars; beats are only how the engine takes it. Two bars of
    // 4/4 is eight, which is the engine's whole limit — two bars of 6/8 would
    // be twelve, and a count-in past the limit is a wait, not a count-in.
    const rock = sheet({ jam: jamOf({ grooveId: "rock8", countIn: 8 }) });
    fireEvent.click(within(allGrooves(rock.container)).getByText("Waltz"));
    expect(rock.props.onEdit).toHaveBeenCalledWith({ grooveId: "waltz", countIn: 6 });
    cleanup();

    const waltz = sheet({ jam: jamOf({ grooveId: "rock8", countIn: 8 }) });
    // Scoped to the groove cards: "6/8" is also a meter preset now, and the
    // two are different controls that happen to be named the same thing.
    fireEvent.click(within(allGrooves(waltz.container)).getByText("6/8"));
    expect(waltz.props.onEdit).toHaveBeenCalledWith({ grooveId: "sixEight", countIn: 6 });
  });

  it("offers a count-in only in whole bars the engine will actually take", () => {
    // Two bars of 6/8 is twelve beats, past `arm_count_in`'s limit of eight.
    // Offering it and clamping it would put a lie on the button.
    sheet({ jam: jamOf({ grooveId: "sixEight", countIn: 6 }) });
    fireEvent.click(screen.getByRole("button", { name: /Count-in/ }));
    const options = screen.getAllByRole("option");
    // None, and one bar in each of the two sounds. Two bars is not offered
    // at all rather than offered and quietly clamped to something else.
    expect(options.map((o) => o.textContent)).toEqual([
      "None",
      "1 bar · Beep",
      "1 bar · Sticks",
    ]);
  });

  it("merges the count-in's length and its sound into one choice", () => {
    // It used to be two controls a screen apart. Nobody sets one without the
    // other — "one bar of sticks" is a single thing a drummer says out loud.
    const { props } = sheet({ jam: jamOf({ grooveId: "rock8", countIn: 4 }) });
    fireEvent.click(screen.getByRole("button", { name: /Count-in/ }));
    fireEvent.click(screen.getByRole("option", { name: "2 bars · Sticks" }));
    expect(props.onEdit).toHaveBeenCalledWith({ countIn: 8, countInSound: "sticks" });
  });

  it("switches the form and keeps the length the timeline was showing", () => {
    const { props } = sheet();
    fireEvent.click(screen.getByRole("button", { name: /Shape/ }));
    fireEvent.click(screen.getByRole("option", { name: /Your own/ }));
    expect(props.onEdit).toHaveBeenCalledWith(
      expect.objectContaining({ form: { kind: "custom", bars: 12 } }),
    );
  });

  it("shows the bar stepper only on a form of your own", () => {
    const { container, rerender, props } = sheet();
    expect(container.querySelector(".jam-bars")).toBeNull();

    rerender(
      <JamView {...props} jam={jamOf({ form: { kind: "custom", bars: 5 } })} />,
    );
    expect(container.querySelector(".jam-bars")).not.toBeNull();
    fireEvent.click(screen.getByLabelText("More bars"));
    expect(props.onEdit).toHaveBeenCalledWith(
      expect.objectContaining({ form: { kind: "custom", bars: 6 } }),
    );
  });

  it("holds the bar stepper inside 1..64", () => {
    const { rerender, props } = sheet({ jam: jamOf({ form: { kind: "custom", bars: 1 } }) });
    expect(screen.getByLabelText("Fewer bars")).toBeDisabled();

    rerender(<JamView {...props} jam={jamOf({ form: { kind: "custom", bars: 64 } })} />);
    expect(screen.getByLabelText("More bars")).toBeDisabled();
  });

  it("offers the four fill choices and marks the one the record is on", () => {
    // Off, the chorus end, every four bars, every eight. Two fields on the
    // record and one control on the screen: "off, or every eight bars" is one
    // decision, and the switch it replaced could only say two of the four.
    const { container } = sheet();
    const groups = [...container.querySelectorAll(".jam-segmented")];
    const fills = groups.find((g) => g.getAttribute("aria-label") === "Fills")!;
    const options = [...fills.querySelectorAll(".accent-option")];
    expect(options.map((o) => o.textContent)).toEqual([
      "Off",
      "Chorus end",
      "Every 4",
      "Every 8",
    ]);
    // The starter jam has fills on and no `fillEvery`, which is the end only.
    expect(options.filter((o) => o.getAttribute("aria-pressed") === "true")).toHaveLength(1);
    expect(options[1]).toHaveAttribute("aria-pressed", "true");
  });

  it("writes both fields when the fill choice changes", () => {
    const { props, rerender } = sheet();
    fireEvent.click(screen.getByText("Every 4"));
    expect(props.onEdit).toHaveBeenCalledWith({ fills: true, fillEvery: 4 });

    // And off zeroes the count rather than leaving a record that says "no
    // fills, every four bars" — two readers could disagree about that, and one
    // of them is the engine.
    rerender(
      <JamView
        {...props}
        jam={jamOf({ fills: true, fillEvery: 4 })}
        screen={screenState({ setupOpen: true })}
      />,
    );
    fireEvent.click(screen.getByText("Off"));
    expect(props.onEdit).toHaveBeenCalledWith({ fills: false, fillEvery: 0 });
  });

  it("says what a band through speakers does to the score, on the input chip", () => {
    // JAM_MODE §3, principle 5. It used to be printed under the stage
    // forever; it is the input chip's tooltip now (JAM_UX_DECISIONS A7),
    // which is the one place on the playing screen where it is about to
    // matter.
    const { container } = setup();
    expect(container.querySelector(".jam-band-input")).toHaveAttribute(
      "title",
      "Headphones keep the score honest.",
    );
  });

  it("keeps the playing screen to five blocks", () => {
    // A1: the chord, the timeline, the tempo, the band, the practice
    // switches. Nothing else — no groove cards, no key picker, no kit, no
    // takes shelf. Those are the sheet's, and this is the assertion that
    // stops them creeping back one at a time.
    const { container } = setup();
    expect(container.querySelector(".jam-cards-groove")).toBeNull();
    expect(container.querySelector(".jam-keys")).toBeNull();
    expect(container.querySelector(".jam-takes")).toBeNull();
    expect(container.querySelector(".jam-sheet")).toBeNull();
    expect(container.querySelector(".jam-now")).not.toBeNull();
    expect(container.querySelector(".jam-timeline")).not.toBeNull();
    expect(container.querySelector(".jam-band")).not.toBeNull();
    expect(container.querySelector(".jam-practice")).not.toBeNull();
  });
});

/**
 * The chord you are on, and everything the screen says about it. This is the
 * headline of the second pass the way the timeline was the headline of the
 * first, and it is the part a player reads while their hands are busy.
 */
describe("JamView — the changes", () => {
  it("puts the chord you are on above everything else", () => {
    // The starter blues is in A, so bar 1 is A7 and bar 5 is D7. Queried
    // through the NOW block rather than by text: A7 is also in seven cells of
    // the timeline, which is the point of the timeline.
    const { container } = setup({ currentBeat: beat(0), isPlaying: true });
    expect(container.querySelector(".jam-now-name")?.textContent).toBe("A7");
  });

  it("counts to the next chord that actually changes, not to the next bar", () => {
    // Bars 1 to 4 of a twelve-bar blues are all the I chord. "A7 in 1 bar"
    // four times running tells a player nothing; "D7 in 4 bars" is the
    // sentence they hold in their head.
    setup({ currentBeat: beat(0), isPlaying: true });
    expect(screen.getByText("D7 in 4 bars")).toBeInTheDocument();
  });

  it("offers scales that fit the chord, named from their own root", () => {
    setup({ currentBeat: beat(0), isPlaying: true });
    // A blues, so the first answer over the I7 is the mixolydian that spells
    // the chord, and the minor pentatonic you bend against it.
    const scales = screen.getByText(/mixolydian/).textContent ?? "";
    expect(scales).toContain("A mixolydian");
    expect(scales).toContain("A minor pentatonic");
  });

  it("writes the changes into the timeline cells", () => {
    const { container } = setup({ currentBeat: beat(4), isPlaying: true });
    const chords = [...container.querySelectorAll(".jam-timeline-chord")].map(
      (c) => c.textContent,
    );
    expect(chords).toHaveLength(12);
    // I I I I · IV IV I I · V IV I V — the shape of a twelve-bar blues.
    expect(chords.slice(0, 4)).toEqual(["A7", "A7", "A7", "A7"]);
    expect(chords.slice(4, 6)).toEqual(["D7", "D7"]);
    expect(chords[8]).toBe("E7");
  });

  it("leaves the timeline bare when the chords are switched off", () => {
    const { container } = setup({ jam: jamOf({ chords: false }) });
    expect(container.querySelectorAll(".jam-timeline-chord")).toHaveLength(0);
  });

  it("keeps the shapes off the playing screen entirely", () => {
    // A8, in the owner's words: "the fretboard and the chords are amazing,
    // but they shouldn't keep changing." Only two things move on their own
    // here now — the timeline and the chord you are on.
    const { container } = setup({ currentBeat: beat(0), isPlaying: true });
    expect(container.querySelector(".jam-chord-grid")).toBeNull();
    expect(screen.queryByTestId("chord-shapes-row")).toBeNull();
    expect(container.querySelector(".jam-fretboard")).toBeNull();
  });

  it("writes the chart in the key the player reads", () => {
    // A Bb instrument sounds a major second below written pitch, so its part
    // is written two semitones up: the blues in A becomes a blues in B.
    const { container } = setup({
      jam: jamOf({ transposition: "bb" }),
      currentBeat: beat(0),
      isPlaying: true,
    });
    expect(container.querySelector(".jam-now-name")?.textContent).toBe("B7");
  });
});

/**
 * The two sheets, and the one thing either of them leaves behind
 * (plans/JAM_UX_DECISIONS.md A1, A8).
 */
describe("JamView — the sheets", () => {
  it("puts every control in the setup sheet inside a section", () => {
    /*
     * A section is what tells you whose setting you are looking at: a
     * heading, a coloured rail down the left, and a name. A control that is
     * a direct child of the sheet gets none of that — it floats between two
     * sections looking like it belongs to neither, which is what happened
     * to the meter when it came out of "More" and landed one line past the
     * form's closing tag. The owner spotted it twice, the second time
     * asking the question this test now answers: "why doesn't the meter
     * belong to any section?"
     *
     * happy-dom draws nothing, but it nests perfectly well, and being in
     * the wrong parent is a nesting fault rather than a drawing one.
     */
    const { container } = sheet();
    const body = container.querySelector(".jam-sheet-body")!;
    expect(body, "no setup sheet").toBeTruthy();
    const loose = [...body.children]
      .filter((child) => !child.classList.contains("jam-sheet-group"))
      .map((child) => child.className || child.tagName);
    expect(loose, "these sit between the sections, belonging to none").toEqual([]);
  });

  it("draws neither until it is asked", () => {
    const { container } = setup();
    expect(container.querySelector(".jam-sheet")).toBeNull();
  });

  it("puts the setup sheet over the playing screen, dimmed", () => {
    const { container } = sheet();
    const drawn = container.querySelector('.jam-sheet[data-sheet="setup"]');
    expect(drawn).not.toBeNull();
    // Dimmed, because setting up is a thing you do INSTEAD of playing.
    expect(container.querySelector(".jam-sheet-scrim")).not.toBeNull();
  });

  it("names the vibe the jam started from, on the sheet's own head", () => {
    sheet({ jam: jamOf({ vibe: "rock" }) });
    expect(screen.getByText("started from the Rock vibe")).toBeInTheDocument();
  });

  it("closes on Done", () => {
    const setSetupOpen = vi.fn();
    sheet({}, { setSetupOpen });
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(setSetupOpen).toHaveBeenCalledWith(false);
  });

  it("does not dim the screen behind the chord sheet", () => {
    // It is a page you glance at WHILE playing; dimming the timeline would be
    // dimming the reason you opened it.
    const { container } = chordSheet();
    expect(container.querySelector('.jam-sheet[data-sheet="chords"]')).not.toBeNull();
    expect(container.querySelector(".jam-sheet-scrim")).toBeNull();
  });

  it("opens on the chart, thinned to what fits the key", () => {
    const { container } = chordSheet();
    // A chart, not a page of seven cards: every root down the side, every
    // chord type across. "In key" leaves the ones that fit.
    expect(container.querySelector(".jam-chord-table")).not.toBeNull();
    const cards = container.querySelectorAll(".jam-chord-card");
    expect(cards.length).toBeGreaterThan(20);
    expect(cards.length).toBeLessThan(192);
    // And no shapes row until you tap one: nothing here moves unless asked.
    expect(container.querySelector(".jam-chord-shapes")).toBeNull();
  });

  it("expands every way to play a chord when it is tapped", () => {
    const setPinnedChord = vi.fn();
    const { container } = chordSheet({}, { setPinnedChord });
    fireEvent.click(container.querySelectorAll(".jam-chord-card")[0] as HTMLElement);
    expect(setPinnedChord).toHaveBeenCalledWith(
      expect.objectContaining({ quality: expect.any(String) }),
    );
  });

  it("keeps Follow the jam off until it is switched on", () => {
    const { props } = chordSheet();
    const follow = screen.getByRole("switch", { name: /Follow the jam/ });
    expect(follow).toHaveAttribute("aria-checked", "false");
    fireEvent.click(follow);
    expect(props.onEdit).toHaveBeenCalledWith({ shapesFollow: true });
  });

  it("pins a shape onto the record, and unpins it again", () => {
    // A pinned shape is the answer to "the chords shouldn't keep changing":
    // it goes on the record, so it survives a trip to the metronome tab.
    const expanded = { root: 9 as const, quality: "7" as const };
    const { props } = chordSheet({}, { pinnedChord: expanded, shapeIndex: 0 });
    fireEvent.click(screen.getByRole("button", { name: "Pin this one" }));
    const patch = props.onEdit.mock.calls.at(-1)![0];
    expect(patch.pinnedShape).toMatchObject({ root: 9, quality: "7", index: 0 });
  });

  it("pins the grip you are looking at, not any grip of that chord", () => {
    // An A7 has several shapes on a guitar and pinning "the barre at the
    // fifth" is a real thing to want. Comparing only the chord had the button
    // read "Unpin" over a shape that was not the pinned one — and pressing it
    // threw the pin away rather than moving it.
    const expanded = { root: 9 as const, quality: "7" as const };
    const { props } = chordSheet(
      { jam: jamOf({ pinnedShape: { root: 9, quality: "7", index: 0 } }) },
      { pinnedChord: expanded, shapeIndex: 2 },
    );
    expect(screen.getByRole("button", { name: "Pin this one" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pin this one" }));
    expect(props.onEdit.mock.calls.at(-1)![0].pinnedShape).toMatchObject({ index: 2 });
  });

  it("draws the pinned shape in the corner of the playing screen, and only there", () => {
    const { container, props } = setup({
      jam: jamOf({ pinnedShape: { root: 9, quality: "7", index: 0 } }),
    });
    const pinned = container.querySelector(".jam-pinned");
    expect(pinned).not.toBeNull();
    // It does not move: the sheet is shut and nothing on this screen is
    // driving it.
    expect(container.querySelector(".jam-chord-grid")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Unpin" }));
    expect(props.onEdit).toHaveBeenCalledWith({ pinnedShape: null });
  });

  it("draws no pinned shape for a player with no neck", () => {
    const { container } = setup({
      instrument: "other",
      jam: jamOf({ pinnedShape: { root: 9, quality: "7", index: 0 } }),
    });
    expect(container.querySelector(".jam-pinned")).toBeNull();
  });

  it("shows the fretboard as one static box for the key, on its own tab", () => {
    // It used to be at the foot of the chords page behind a switch called
    // "Fretboard", which is where the scales lived and where nobody looked.
    // The tab IS the switch now, which is why there is no switch left.
    const { container } = chordSheet({}, { cheatTab: "scales" });
    expect(container.querySelector(".jam-fretboard")).not.toBeNull();
    expect(screen.queryByRole("switch", { name: /Fretboard/ })).toBeNull();
  });
});

/** The tools that only make sense over a band (JAM_MODE §4.4). */
describe("JamView — the practice tools", () => {
  const practising = {
    dropOutEvery: 8,
    dropOutBars: 2,
    tradeBars: 0,
    tempoStep: 0,
    tempoEveryChoruses: 0,
  };

  it("draws the silence a chorus before it arrives", () => {
    // The point of drawing it ahead: a silence you can see coming is one you
    // can count into. Over twelve bars with a window every 8 for 2, bars 9
    // and 10 are the silent ones.
    const { container } = setup({
      jam: jamOf({ practice: practising }),
      currentBeat: beat(0),
      isPlaying: true,
    });
    const silent = [...container.querySelectorAll(".jam-timeline-cell")]
      .map((c, i) => [i, c.getAttribute("data-band")] as const)
      .filter(([, state]) => state === "silent")
      .map(([i]) => i);
    expect(silent).toEqual([8, 9]);
  });

  it("marks your bars in a trade", () => {
    const { container } = setup({
      jam: jamOf({ practice: { ...practising, dropOutEvery: 0, tradeBars: 4 } }),
      currentBeat: beat(0),
      isPlaying: true,
    });
    const yours = [...container.querySelectorAll(".jam-timeline-cell")]
      .map((c, i) => [i, c.getAttribute("data-band")] as const)
      .filter(([, state]) => state === "hatsOnly")
      .map(([i]) => i);
    // Band plays 0-3, you play 4-7, band plays 8-11.
    expect(yours).toEqual([4, 5, 6, 7]);
  });

  it("turns drop-outs on from the switch and keeps the number it had", () => {
    const { props } = setup({ jam: jamOf({ practice: { ...practising, dropOutEvery: 0 } }) });
    fireEvent.click(screen.getByRole("switch", { name: "Drop-out bars" }));
    expect(props.onEdit).toHaveBeenCalledWith({
      practice: expect.objectContaining({ dropOutEvery: 8, dropOutBars: 2 }),
    });
  });

  it("says the trainer is climbing rather than naming a tempo mark", () => {
    // A tempo the trainer chose is not a tempo you set, so the marking under
    // it says where it came from instead of what it is called.
    setup({ jam: jamOf({ bpm: 92 }), trainedBpm: 104 });
    expect(screen.getByText("104")).toBeInTheDocument();
    expect(screen.getByText("climbing from 92")).toBeInTheDocument();
  });

  it("calls your four when the band drops to hats", () => {
    const { rerender, props } = setup({
      jam: jamOf({ practice: { ...practising, dropOutEvery: 0, tradeBars: 4 } }),
      currentBeat: beat(0),
      isPlaying: true,
    });
    expect(screen.queryByText("Your four")).toBeNull();
    rerender(
      <JamView
        {...props}
        currentBeat={{ ...beat(4), bandState: "hatsOnly" }}
        isPlaying
      />,
    );
    expect(screen.getByText("Your four")).toBeInTheDocument();
  });
});

/** The editor is a drawer under the jam, not a screen you leave it for. */
describe("JamView — the groove editor", () => {
  it("copies the preset into a groove of your own when the drawer opens", () => {
    const { props } = setup({ screen: screenState({ editorOpen: true }) });
    expect(props.onEdit).toHaveBeenCalledWith(
      expect.objectContaining({
        customGroove: expect.objectContaining({ name: "Shuffle", beatsPerBar: 4 }),
      }),
    );
  });

  it("mounts the grid once the jam has a groove of its own", () => {
    setup({
      screen: screenState({ editorOpen: true }),
      jam: jamOf({
        customGroove: {
          name: "Mine",
          beatsPerBar: 4,
          ticksPerBeat: 2,
          bar: {
            kick: [1, 0, 0, 0, 1, 0, 0, 0],
            snare: [0, 0, 0, 0, 0, 0, 0, 0],
            hat: [0, 0, 0, 0, 0, 0, 0, 0],
            ride: [0, 0, 0, 0, 0, 0, 0, 0],
            crash: [0, 0, 0, 0, 0, 0, 0, 0],
          },
          fill: null,
        },
      }),
    });
    expect(screen.getByLabelText("The groove, one bar")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
  });

  it("stays out of the way until it is opened", () => {
    setup();
    expect(screen.queryByLabelText("The groove, one bar")).toBeNull();
  });
});

/**
 * Your own changes. The timeline's cells become chord buttons, and what they
 * write is a progression exactly as long as the form.
 */
describe("JamView — editing the changes", () => {
  const withChords = (overrides: Partial<Jam> = {}) =>
    jamOf({ chords: true, key: "A blues", form: { kind: "blues12", bars: 12 }, ...overrides });

  it("offers the way in only where the timeline is showing chords", () => {
    sheet({ jam: withChords() });
    expect(screen.getByRole("button", { name: "Edit changes" })).toBeInTheDocument();
    cleanup();
    sheet({ jam: jamOf({ chords: false }) });
    expect(screen.queryByRole("button", { name: "Edit changes" })).toBeNull();
  });

  it("offers Paste chords whether or not the timeline is showing any", () => {
    // Pasting a chart is how a jam GETS chords, so hiding the door behind the
    // switch it is meant to turn on would be a door into a locked room.
    sheet({ jam: jamOf({ chords: false }) });
    expect(screen.getByRole("button", { name: "Paste chords" })).toBeInTheDocument();
  });

  it("says what it has understood while you type, and then applies it", () => {
    const { props } = sheet({ jam: withChords() });
    fireEvent.click(screen.getByRole("button", { name: "Paste chords" }));
    const box = screen.getByLabelText("Paste a chord chart");
    fireEvent.change(box, { target: { value: "| Am | F | C | G | D/F# | ?? |" } });
    // Six bars, the key the four diatonic ones are in, and the two symbols it
    // did something lossy with — the slash chord's bass and the unreadable one.
    expect(screen.getByText(/6 bars/)).toBeInTheDocument();
    expect(screen.getByText(/key of Am/)).toBeInTheDocument();
    expect(screen.getByText(/D\/F#, \?\?/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Use these chords" }));
    expect(props.onEdit).toHaveBeenCalledWith(
      expect.objectContaining({
        form: { kind: "custom", bars: 6 },
        key: "Am",
        progression: ["Am", "F", "C", "G", "D", ""],
        chords: true,
      }),
    );
  });

  it("will not apply a chart it found no chords in", () => {
    const { props } = sheet({ jam: withChords() });
    fireEvent.click(screen.getByRole("button", { name: "Paste chords" }));
    fireEvent.change(screen.getByLabelText("Paste a chord chart"), {
      target: { value: "the quick brown fox" },
    });
    expect(screen.getByRole("button", { name: "Use these chords" })).toBeDisabled();
    expect(props.onEdit).not.toHaveBeenCalled();
  });

  it("turns the cells into chord buttons in edit mode", () => {
    const { container } = setup({
      jam: withChords(),
      screen: screenState({ editingChords: true }),
    });
    const cells = container.querySelectorAll(".jam-timeline-cell[data-editable]");
    expect(cells).toHaveLength(12);
    // The label says what a tap will do, so a screen reader is told the truth.
    expect(screen.getByRole("button", { name: "Bar 5" })).toBeInTheDocument();
  });

  it("goes to the bar rather than editing it when the mode is off", () => {
    const position = positionState();
    const { container } = setup({ jam: withChords(), position });
    const cell = container.querySelectorAll(".jam-timeline-cell")[4] as HTMLElement;
    fireEvent.click(cell);
    expect(position.jumpTo).toHaveBeenCalledWith(4);
  });

  it("opens the picker on the bar that was tapped", () => {
    const setEditingBar = vi.fn();
    const { container } = setup({
      jam: withChords(),
      screen: screenState({ editingChords: true, setEditingBar }),
    });
    fireEvent.click(container.querySelectorAll(".jam-timeline-cell")[4] as HTMLElement);
    expect(setEditingBar).toHaveBeenCalledWith(4);
  });

  it("writes the chord onto that bar, and keeps the progression form-length", () => {
    const { props } = setup({
      jam: withChords(),
      screen: screenState({ editingChords: true, editingBar: 4 }),
    });
    // The picker is showing; pick a quality for the bar.
    fireEvent.click(screen.getByRole("button", { name: "m7" }));
    const patch = props.onEdit.mock.calls.at(-1)![0];
    expect(patch.progression).toHaveLength(12);
    expect(patch.progression[4]).toMatch(/m7$/);
    // Every other bar is still the form's.
    expect(patch.progression.filter((name: string) => name)).toHaveLength(1);
  });

  it("clears a bar back to the form rather than deleting it", () => {
    const { props } = setup({
      jam: withChords({ progression: ["Bb", ...Array(11).fill("")] }),
      screen: screenState({ editingChords: true, editingBar: 0 }),
    });
    fireEvent.click(screen.getByRole("button", { name: "As the form" }));
    // The last chord cleared means no progression at all, not twelve blanks.
    expect(props.onEdit).toHaveBeenCalledWith({ progression: undefined });
  });

  it("refits the progression when the form changes under it", () => {
    const { props } = sheet({
      jam: withChords({ progression: ["Bb", "C", ...Array(10).fill("")] }),
    });
    fireEvent.click(screen.getByRole("button", { name: /Shape/ }));
    fireEvent.click(screen.getByRole("option", { name: /8-bar loop/ }));
    const patch = props.onEdit.mock.calls.at(-1)![0];
    expect(patch.form).toEqual({ kind: "loop8", bars: 8 });
    expect(patch.progression).toHaveLength(8);
    // The bars you wrote are still the bars you wrote.
    expect(patch.progression[0]).toBe("Bb");
    expect(patch.progression[1]).toBe("C");
  });

  it("shows the progression's chord on the timeline, not the form's", () => {
    const { container } = setup({ jam: withChords({ progression: ["Bbmaj7", ...Array(11).fill("")] }) });
    const first = container.querySelectorAll(".jam-timeline-cell")[0];
    // Stored "Bbmaj7", drawn "A#maj7": A blues is a sharp key, and how the
    // name was spelled going in is forgotten on purpose — the spelling that
    // comes back out is the key's (`spellingForKey`), never the typist's.
    expect(first.querySelector(".jam-timeline-chord")?.textContent).toBe("A#maj7");
    // And marks it as yours.
    expect(first.hasAttribute("data-own-chord")).toBe(true);
  });
});

/** The meter, the mix, the keys player and the spoken cues. */
describe("JamView — the fourth pass's controls", () => {
  it("runs in the groove's own meter until told otherwise", () => {
    const { container } = sheetWithMore();
    const active = container.querySelectorAll(".jam-meter.active");
    expect(active).toHaveLength(1);
    expect(active[0].textContent).toBe("The groove's");
  });

  it("says which groove does not fit the meter it was given", () => {
    sheet({ jam: jamOf({ grooveId: "shuffle", meter: { beatGroups: [2, 2, 3], ticksPerBeat: 2 } }) });
    expect(screen.getByText(/does not fit/)).toBeInTheDocument();
    // And the band row says what is actually playing.
    expect(screen.getByText(/The rule/)).toBeInTheDocument();
  });

  it("carries the count-in into the new meter, in bars", () => {
    const { props } = sheetWithMore({ jam: jamOf({ grooveId: "rock8", countIn: 8 }) });
    fireEvent.click(screen.getByRole("button", { name: "3/4" }));
    // The resolution comes along unchanged — the starter jam is a shuffle, so
    // it is running in triplets, and picking a meter says nothing about that.
    // Two bars of 4/4 is eight beats; two bars of 3/4 is six.
    expect(props.onEdit).toHaveBeenCalledWith(
      expect.objectContaining({
        meter: { beatGroups: [3], ticksPerBeat: 3 },
        countIn: 6,
      }),
    );
  });

  it("gives every player a volume, and leaves it live for one who is out", () => {
    // It used to be disabled with the player, on the reasoning that turning
    // up somebody not in the band is a control that does nothing. That is
    // wrong twice over: setting a level before you bring a player in is an
    // ordinary thing to do — so the keys do not arrive at full tilt when the
    // switch goes on — and a slider that decides what happens next is not a
    // slider doing nothing.
    const { container } = setup({ jam: jamOf({ band: { drums: true, bass: false, keys: false } }) });
    const sliders = container.querySelectorAll<HTMLInputElement>(".jam-band-volume input");
    expect(sliders).toHaveLength(3);
    expect([...sliders].map((s) => s.disabled)).toEqual([false, false, false]);
  });

  it("writes a volume to the mix without disturbing the others", () => {
    const { container, props } = setup();
    const slider = container.querySelector<HTMLInputElement>(".jam-band-volume input")!;
    fireEvent.change(slider, { target: { value: "0.5" } });
    expect(props.onEdit).toHaveBeenCalledWith({
      mix: { drums: 0.5, bass: 1, keys: 1, perc: 1 },
    });
  });

  it("has a keys row with a comping style, and a bass row with a figure", () => {
    const { container, props } = setup({ jam: jamOf({ band: { drums: true, bass: true, keys: true } }) });
    const lane = (name: string) =>
      [...container.querySelectorAll(".jam-band-lane")].find(
        (l) => l.querySelector(".jam-band-name")?.textContent?.includes(name),
      )!;
    fireEvent.click(lane("Keys").querySelector(".jam-dropdown")!);
    fireEvent.click(screen.getByRole("option", { name: /^Stabs/ }));
    expect(props.onEdit).toHaveBeenCalledWith({ keysStyle: "stabs" });

    fireEvent.click(lane("Bass").querySelector(".jam-dropdown")!);
    fireEvent.click(screen.getByRole("option", { name: /^Walking/ }));
    expect(props.onEdit).toHaveBeenCalledWith({ bassStyle: "walking" });
  });

  it("has a drums row that picks a groove off the shelf it is on", () => {
    // The drummer was the one player whose row you could only read: the bass
    // picks a figure and the keys a comping style while you listen to them,
    // and the drums row named its groove in text. It picks too now, from the
    // shelf its groove is on — the other hundred are a tap away in Set up,
    // which is what the card wall is for.
    const { container, props } = setup({ jam: jamOf({ grooveId: "shuffle" }) });
    const drums = [...container.querySelectorAll(".jam-band-lane")].find(
      (l) => l.querySelector(".jam-band-name")?.textContent?.includes("Drums"),
    )!;
    fireEvent.click(drums.querySelector(".jam-dropdown")!);
    // Every option is a blues groove, because the shuffle is a blues groove.
    const blues = groovesInFamily("blues");
    expect(screen.getAllByRole("option")).toHaveLength(blues.length);

    // The one after the shuffle, whichever the shelf writes next.
    const next = blues[blues.findIndex((g) => g.id === "shuffle") + 1];
    fireEvent.click(screen.getAllByRole("option")[blues.indexOf(next)]);
    expect(props.onEdit).toHaveBeenCalledWith(
      expect.objectContaining({ grooveId: next.id, customGroove: undefined }),
    );
  });

  it("carries the count-in onto a groove in another meter", () => {
    // One bar of a waltz is three beats, not four: the setting is BARS and
    // the engine takes beats, so a picker that only wrote the groove would
    // leave a two-bar count-in a bar and a third long.
    const family = GROOVE_FAMILIES.find((f) =>
      groovesInFamily(f).some((g) => g.beatsPerBar !== groovesInFamily(f)[0].beatsPerBar),
    )!;
    const shelf = groovesInFamily(family);
    const from = shelf[0];
    const to = shelf.find((g) => g.beatsPerBar !== from.beatsPerBar)!;

    const { container, props } = setup({
      jam: jamOf({ grooveId: from.id, countIn: from.beatsPerBar * 2 }),
    });
    const drums = [...container.querySelectorAll(".jam-band-lane")].find(
      (l) => l.querySelector(".jam-band-name")?.textContent?.includes("Drums"),
    )!;
    fireEvent.click(drums.querySelector(".jam-dropdown")!);
    fireEvent.click(screen.getAllByRole("option")[shelf.indexOf(to)]);
    expect(props.onEdit).toHaveBeenCalledWith(
      expect.objectContaining({ grooveId: to.id, countIn: to.beatsPerBar * 2 }),
    );
  });

  it("names what Auto plays, and Auto clears the choice", () => {
    const { container, props } = setup({
      jam: jamOf({ band: { drums: true, bass: true, keys: true }, keysStyle: "pads" }),
    });
    const keys = [...container.querySelectorAll(".jam-band-lane")].find(
      (l) => l.querySelector(".jam-band-name")?.textContent?.includes("Keys"),
    )!;
    fireEvent.click(keys.querySelector(".jam-dropdown")!);
    fireEvent.click(screen.getByRole("option", { name: /^Auto · / }));
    expect(props.onEdit).toHaveBeenCalledWith({ keysStyle: undefined });
  });

  it("shows a Percussion row for a groove that has one, and names what it plays", () => {
    // A bossa's percussionist plays a shaker, and the row says so — the same
    // job the drums row does by naming the groove and the kit.
    const { container } = setup({ jam: jamOf({ grooveId: "bossa" }) });
    const names = [...container.querySelectorAll(".jam-band-name")].map((el) => el.textContent);
    expect(names).toContain("Percussion");
    const row = [...container.querySelectorAll(".jam-band-lane")].find((lane) =>
      lane.querySelector(".jam-band-name")?.textContent?.includes("Percussion"),
    )!;
    expect(row.querySelector(".jam-band-detail")?.textContent).toBe("shaker");
  });

  it("joins two voices into a sentence rather than a list", () => {
    // "guiro and congas", not "guiro, congaHi, congaLo": the two congas are
    // one instrument to a listener, and the row is prose.
    const { container } = setup({ jam: jamOf({ grooveId: "chaCha" }) });
    const row = [...container.querySelectorAll(".jam-band-lane")].find((lane) =>
      lane.querySelector(".jam-band-name")?.textContent?.includes("Percussion"),
    )!;
    expect(row.querySelector(".jam-band-detail")?.textContent).toBe("güiro and congas");
  });

  it("withholds the Percussion row where there is nobody to be", () => {
    // A row over a thrash bar would be a player with nothing to play.
    const { container } = setup({ jam: jamOf({ grooveId: "metalThrash" }) });
    const names = [...container.querySelectorAll(".jam-band-name")].map((el) => el.textContent);
    expect(names).not.toContain("Percussion");
  });

  it("keeps the row where the jam turned percussion on, whatever the groove", () => {
    // The other half: a row that vanished when you changed groove would take
    // a switch you had set away with it.
    const { container } = setup({
      jam: jamOf({
        grooveId: "metalThrash",
        band: { drums: true, bass: false, keys: false, perc: true },
      }),
    });
    const row = [...container.querySelectorAll(".jam-band-lane")].find((lane) =>
      lane.querySelector(".jam-band-name")?.textContent?.includes("Percussion"),
    )!;
    expect(row).toBeTruthy();
    expect(row.querySelector(".jam-band-detail")?.textContent).toBe("nothing in this groove");
  });

  it("keeps the sheet's percussion switch whatever the groove", () => {
    // The sheet is where you decide who is in the band, so the switch is
    // always there — unlike the playing screen's row, which says what the
    // band IS doing and comes and goes with the groove.
    const { container } = sheet({ jam: jamOf({ grooveId: "metalThrash" }) });
    // One section per player (2026-09-16), each with its switch on the
    // heading, named for the player it hires.
    // The four PLAYERS, in order. Takes wears a switch on its heading too —
    // recording is something you turn on and forget, so it sits where the eye
    // already looks for a switch — but it is not somebody you hire, so it is
    // named rather than counted here.
    const switches = [...container.querySelectorAll("section[data-player] .jam-sheet-group-control [role=switch]")];
    const hired = switches
      .map((s) => s.getAttribute("aria-label"))
      .filter((name) => name !== null && !/take/i.test(name));
    expect(hired).toEqual(["Drums", "Bass", "Keys", "Percussion"]);
  });

  it("gives the percussionist a volume in the sheet once they are hired", () => {
    const { container, props } = sheet({
      jam: jamOf({
        grooveId: "bossa",
        band: { drums: true, bass: false, keys: false, perc: true },
      }),
    });
    const player = container.querySelector("section[data-player=perc]")!;
    const slider = player.querySelector<HTMLInputElement>("input[type=range]")!;
    fireEvent.change(slider, { target: { value: "0.6" } });
    expect(props.onEdit).toHaveBeenCalledWith({
      mix: { drums: 1, bass: 1, keys: 1, perc: 0.6 },
    });
  });

  it("hires the percussionist from the row without disturbing the rest of the band", () => {
    const { container, props } = setup({
      jam: jamOf({ grooveId: "bossa", band: { drums: true, bass: true, keys: false } }),
    });
    const row = [...container.querySelectorAll(".jam-band-lane")].find((lane) =>
      lane.querySelector(".jam-band-name")?.textContent?.includes("Percussion"),
    )!;
    fireEvent.click(row.querySelector("button[role='switch']")!);
    expect(props.onEdit).toHaveBeenCalledWith({
      band: { drums: true, bass: true, keys: false, perc: true },
    });
  });

  it("unpins the shape in the corner when the key moves", () => {
    // A pinned grip belongs to the key it was pinned in. Left alone, a G shape
    // sat in the corner of a jam in B flat, drawn as if it were the chord to
    // play — and nothing on the screen would ever move it again.
    const { props } = sheet({ jam: jamOf({ pinnedShape: { root: 9, quality: "7", index: 0 } }) });
    fireEvent.click(screen.getByRole("button", { name: "C" }));
    expect(props.onEdit.mock.calls.at(-1)![0]).toMatchObject({ pinnedShape: null });

    fireEvent.click(screen.getByRole("button", { name: "Minor" }));
    expect(props.onEdit.mock.calls.at(-1)![0]).toMatchObject({ pinnedShape: null });
  });

  it("unpins it when the part you read is transposed", () => {
    // Harder version of the same thing: every chord NAME moves, so the grip
    // keeps its diagram and loses its label.
    const { props } = sheetWithMore({
      instrument: "other",
      jam: jamOf({ pinnedShape: { root: 9, quality: "7", index: 0 } }),
    });
    fireEvent.click(screen.getByRole("button", { name: "B♭" }));
    expect(props.onEdit.mock.calls.at(-1)![0]).toMatchObject({
      transposition: "bb",
      pinnedShape: null,
    });
  });

  it("shows the transposition row only to a player who reads a transposed part", () => {
    // A guitar, a bass and a piano all read concert pitch, so the control is
    // furniture for the three instruments most people who open this app
    // play (A4).
    sheetWithMore({ instrument: "electric-guitar" });
    expect(screen.queryByRole("group", { name: "You read" })).toBeNull();
    cleanup();
    sheetWithMore({ instrument: "other" });
    expect(screen.getByRole("group", { name: "You read" })).toBeInTheDocument();
  });
});

/**
 * The cheat sheet's two pages (JAM_UX_DECISIONS A10).
 *
 * The owner's complaint was that the sheet was incomplete: "the user should
 * be able to see ALL chords for all keys, or filter by the chords the user
 * can play in the key of the current jam." So what is worth pinning here is
 * the ARITHMETIC of the two pages — how many cards, which ones carry the
 * mark, what disappears when the filter goes on — because those are the
 * answers a player is reading off the screen, and a page that quietly showed
 * the wrong ones would still look right.
 *
 * The starter jam is an A blues. Its note set is the nine notes of its five
 * chords, which leaves F, Eb and Bb outside — F is the root the last test
 * uses, and no chord rooted there can fit.
 */
describe("JamView — the cheat sheet", () => {
  const cards = (container: HTMLElement) => container.querySelectorAll(".jam-chord-card");

  it("shows two switches and no more", () => {
    // The whole of the chrome: Chords / Scales and In key / All keys, plus
    // the dot labels. There used to be a third — Triads / 7ths / Colours /
    // Power — which hid nine of the sixteen chord types behind a word. The
    // owner: "having a switch for switching between 7ths, triads etc is a
    // fucking pain in the ass".
    chordSheet();
    for (const gone of ["Triads", "7ths", "Colours", "Power"]) {
      expect(screen.queryByRole("button", { name: gone }), gone).toBeNull();
    }
    for (const kept of ["Chords", "Scales", "In key", "All keys"]) {
      expect(screen.getByRole("button", { name: kept }), kept).toBeInTheDocument();
    }
  });

  it("draws every chord type at once, sevenths and colours included", () => {
    // The flavour switch is gone, so the chart has to be showing what it
    // used to hide: a plain major, a seventh and a suspension in one view.
    const { container } = chordSheet({}, { chordPage: "all" });
    const names = [...cards(container)].map((c) => c.getAttribute("aria-label"));
    for (const chord of ["A", "Am", "A7", "Amaj7", "Am7", "Asus4", "A6", "Adim"]) {
      expect(names, chord).toContain(chord);
    }
  });

  it("never draws a chord twice", () => {
    // One cell per root and quality. The old colours page could list a minor
    // key's v and its borrowed V7, and draw every suspension they share once
    // under each.
    const { container } = chordSheet({}, { chordPage: "all" });
    const names = [...cards(container)].map((c) => c.getAttribute("aria-label"));
    expect(new Set(names).size).toBe(names.length);
  });

  it("stacks every scale of the key on the Scales tab, each with its formula", () => {
    // It was one neck with a row of chips above it, so five of the six a key
    // suggests were invisible until you pressed something. A cheat sheet you
    // have to operate is not a cheat sheet.
    const { container } = chordSheet({}, { cheatTab: "scales" });
    const boards = container.querySelectorAll(".jam-scale-board");
    expect(boards.length).toBeGreaterThan(1);
    for (const board of boards) {
      expect(board.querySelector(".jam-scale-board-name")?.textContent).toBeTruthy();
      expect(board.querySelector("[data-testid='fretboard']")).not.toBeNull();
      // The formula, in degrees, starting on the root.
      const degrees = [...board.querySelectorAll(".jam-scale-degree")].map((d) => d.textContent);
      expect(degrees.length).toBeGreaterThan(4);
      expect(degrees[0]).toBe("1");
    }
  });

  it("shows every scale it knows on All keys, not just the ones that fit", () => {
    const { container: inKey } = chordSheet({}, { cheatTab: "scales" });
    const fitting = inKey.querySelectorAll(".jam-scale-board").length;
    cleanup();
    const { container: all } = chordSheet({}, { cheatTab: "scales", chordPage: "all" });
    expect(all.querySelectorAll(".jam-scale-board").length).toBeGreaterThan(fitting);
  });

  it("lays the whole library out as a table, every root by every chord type", () => {
    // The printed card a guitarist owns: roots down the side, chord types
    // across the top. It was one root at a time with the other eleven on a
    // row of buttons, which is a list you page through rather than a card
    // you scan.
    const { container } = chordSheet({}, { chordPage: "all" });
    const rows = container.querySelectorAll(".jam-chord-table tbody tr");
    expect(rows).toHaveLength(12);

    // Every row is the same length, because a table whose rows differ is not
    // a table — and every cell of every row is filled.
    const widths = new Set([...rows].map((r) => r.querySelectorAll(".jam-chord-cell").length));
    expect(widths.size, "the rows are different lengths").toBe(1);
    expect([...widths][0]).toBe(CHORD_QUALITIES.length);

    // The columns are headed by the chord symbol, the plain major included.
    const heads = [...container.querySelectorAll(".jam-chord-table thead tr:last-child th")].map(
      (th) => th.textContent,
    );
    expect(heads).toContain("maj");
    expect(heads).toContain("m7b5");

    // The roots the key's own chords are built on carry the mark.
    expect(container.querySelectorAll(".jam-chord-table-root .jam-chord-mark").length).toBe(5);
  });

  it("marks the chords that fit the key without hiding the rest of the row", () => {
    const { container } = chordSheet({}, { chordPage: "all" });
    const all = cards(container).length;
    const marked = container.querySelectorAll(".jam-chord-card .jam-chord-mark").length;
    // Some fit and some do not — a chart where everything is marked would be
    // telling the player nothing.
    expect(marked).toBeGreaterThan(0);
    expect(marked).toBeLessThan(all);
  });

  it("never leaves a hole: In key drops whole rows, never cells", () => {
    // The owner, holding a printed chart: "none of the cheat sheets online
    // have gaps like yours". The filter used to hide the individual chords
    // that do not belong to the key, which left a row of Swiss cheese under
    // headings that then meant nothing. It thins the chart to the roots the
    // key is built on instead, and every one of those rows is solid.
    const { container } = chordSheet({}, { chordPage: "key" });
    const rows = [...container.querySelectorAll(".jam-chord-table tbody tr")];

    // Fewer rows than the full twelve, or the filter is doing nothing.
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(12);

    for (const row of rows) {
      const cells = row.querySelectorAll(".jam-chord-cell");
      expect(cells).toHaveLength(CHORD_QUALITIES.length);
      // Every cell of every row carries a chord. No blanks anywhere.
      expect(
        row.querySelectorAll(".jam-chord-card"),
        `${row.querySelector("th")?.textContent} has a hole in it`,
      ).toHaveLength(CHORD_QUALITIES.length);
    }
  });

  it("expands a browsed chord into the same shapes section", () => {
    const setPinnedChord = vi.fn();
    const { container } = chordSheet({}, { chordPage: "all", setPinnedChord });
    // The table starts at C, so its first cell is C major.
    fireEvent.click(cards(container)[0] as HTMLElement);
    // The table's cells feed the shared section, which is what lets a grip
    // found by looking something up be pinned to the playing screen.
    expect(setPinnedChord).toHaveBeenCalledWith(
      expect.objectContaining({ root: 0, quality: "maj" }),
    );
  });
});

/**
 * Everything that appears, arrives (JAM_UX_DECISIONS A11).
 *
 * The owner: "clicking on chords just shows the sidebar but it should
 * smoothly do the entry animation." The tests below are about the STATE
 * machine rather than the pixels — happy-dom runs no animations — because the
 * state machine is where the bugs are: a surface that unmounts before its
 * exit, one that never unmounts at all, and one that leaves a ghost behind
 * when you close and reopen it in the same second.
 */
describe("JamView — the sheet arrives and leaves", () => {
  /** The docked panel, wherever it currently is. */
  const aside = () => document.querySelector(".jam-sheet");

  /** The panel's own animation, ending. */
  const settle = () => {
    const el = aside();
    if (el) fireEvent.animationEnd(el);
  };

  function open(screenOverrides: Partial<React.ComponentProps<typeof JamView>["screen"]> = {}) {
    const rendered = setup({ screen: screenState(screenOverrides) });
    const show = (
      next: Partial<React.ComponentProps<typeof JamView>["screen"]>,
      props: Partial<React.ComponentProps<typeof JamView>> = {},
    ) =>
      rendered.rerender(
        <JamView {...rendered.props} {...props} screen={screenState({ ...screenOverrides, ...next })} />,
      );
    return { ...rendered, show };
  }

  it("slides the chord sheet in, then settles", () => {
    const { show } = open();
    expect(aside()).toBeNull();

    show({ chordsOpen: true });
    expect(aside()).toHaveAttribute("data-state", "entering");
    settle();
    expect(aside()).toHaveAttribute("data-state", "open");
  });

  it("keeps the sheet on the screen until its exit has finished", () => {
    const { show } = open({ chordsOpen: true });
    settle();

    show({ chordsOpen: false });
    // Still there. Before A11 it was already gone by now.
    expect(aside()).toHaveAttribute("data-state", "exiting");
    settle();
    expect(aside()).toBeNull();
  });

  it("is simply there and simply gone with view transitions off", () => {
    const { show } = open();
    show({ chordsOpen: true }, { viewTransitions: "off" });
    expect(aside()).toHaveAttribute("data-state", "open");
    show({ chordsOpen: false }, { viewTransitions: "off" });
    expect(aside()).toBeNull();
  });

  it("switches Set up for Chords without moving the drawer", () => {
    // The owner: "switching between Set up and Chords makes the right drawer
    // do weird flickering." One frame, so the element that was on the screen
    // is the element that stays on it.
    const { show } = open({ setupOpen: true });
    settle();
    const before = aside();
    expect(before).toHaveAttribute("data-sheet", "setup");

    show({ setupOpen: false, chordsOpen: true });
    expect(aside()).toBe(before);
    expect(aside()).toHaveAttribute("data-sheet", "chords");
    // Never in the middle of leaving: the drawer did not go anywhere.
    expect(aside()).toHaveAttribute("data-state", "open");
  });
});

/**
 * The docked drawer's two layouts, and the press that puts it away
 * (JAM_UX_DECISIONS A12).
 *
 * Both need a real `.main-content` to live in — the sheet portals into it,
 * measures it, and listens on it — so these tests build one rather than
 * letting the sheet fall back to rendering in place.
 */
describe("JamView — the drawer beside the stage", () => {
  let host: HTMLElement;

  beforeEach(() => {
    host = document.createElement("div");
    host.className = "main-content";
    document.body.appendChild(host);
  });

  afterEach(() => {
    host.remove();
  });

  /** The content region is this many CSS pixels across. */
  const widen = (px: number) =>
    Object.defineProperty(host, "clientWidth", { value: px, configurable: true });

  function inHost(screenOverrides: Partial<React.ComponentProps<typeof JamView>["screen"]> = {}) {
    return setup({ screen: screenState(screenOverrides) }, host);
  }

  it("puts the setup sheet away when the stage is pressed", () => {
    const setSetupOpen = vi.fn();
    inHost({ setupOpen: true, setSetupOpen });
    fireEvent.pointerDown(document.querySelector(".jam-view") as HTMLElement);
    expect(setSetupOpen).toHaveBeenCalledWith(false);
  });

  it("leaves the chord sheet alone when the stage is pressed", () => {
    // It is a page you keep open WHILE you play. Putting it away because you
    // touched the timeline would be the opposite of what it is for.
    const setChordsOpen = vi.fn();
    inHost({ chordsOpen: true, setChordsOpen });
    fireEvent.pointerDown(document.querySelector(".jam-view") as HTMLElement);
    expect(setChordsOpen).not.toHaveBeenCalled();
  });

  it("ignores a press on the button that opened it", () => {
    // The context bar's buttons toggle from whatever state the sheet is in,
    // so closing on their pointerdown would have their click reopen it.
    const setSetupOpen = vi.fn();
    inHost({ setupOpen: true, setSetupOpen });
    const button = document.createElement("button");
    button.className = "jam-sheet-btn";
    host.appendChild(button);
    fireEvent.pointerDown(button);
    expect(setSetupOpen).not.toHaveBeenCalled();
  });

  it.each([".transport", ".main-header"])(
    "leaves the setup sheet open when %s is pressed — Play is not the stage",
    (cls) => {
      const setSetupOpen = vi.fn();
      inHost({ setupOpen: true, setSetupOpen });
      const bar = document.createElement("div");
      bar.className = cls.slice(1);
      const play = document.createElement("button");
      bar.appendChild(play);
      host.appendChild(bar);
      fireEvent.pointerDown(play);
      expect(setSetupOpen).not.toHaveBeenCalled();
    },
  );

  it("pushes the stage aside at 1400", () => {
    widen(1400);
    inHost({ setupOpen: true });
    expect(host.classList.contains("jam-sheet-wide")).toBe(true);
    expect(document.querySelector(".jam-sheet")).toHaveAttribute("data-layout", "push");
    // Nothing behind the sheet to dim, because the stage is beside it.
    expect(document.querySelector(".jam-sheet-scrim")).toBeNull();
  });

  it("covers the stage at 1399", () => {
    // One pixel under, and 640 for the sheet would leave the timeline too
    // narrow to read as a timeline. So it goes back to being an overlay.
    widen(1399);
    inHost({ setupOpen: true });
    expect(host.classList.contains("jam-sheet-wide")).toBe(false);
    expect(document.querySelector(".jam-sheet")).toHaveAttribute("data-layout", "overlay");
    expect(document.querySelector(".jam-sheet-scrim")).not.toBeNull();
  });

  it("keeps the layout while one of the two sheets is still down", () => {
    widen(1400);
    inHost({ setupOpen: true, chordsOpen: false });
    expect(host.classList.contains("has-jam-sheet")).toBe(true);
    cleanup();
    // Both gone: the stage gets its full width back.
    expect(host.classList.contains("has-jam-sheet")).toBe(false);
    expect(host.classList.contains("jam-sheet-wide")).toBe(false);
  });

  it("does not close on an outside press while it is beside the stage", () => {
    // The whole point of the wide layout is doing both at once, so a drawer
    // that shut every time you touched the timeline would take that back.
    widen(1400);
    const setSetupOpen = vi.fn();
    inHost({ setupOpen: true, setSetupOpen });
    fireEvent.pointerDown(document.querySelector(".jam-view") as HTMLElement);
    expect(setSetupOpen).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// The arrangement (plans/tasks/jam-v4/BRIEF.md A1)
// ---------------------------------------------------------------------------

describe("the arrangement control", () => {
  /** The segmented Loop · Build · Song, which lives in the FORM group. */
  function modes(): HTMLElement {
    return screen.getByRole("group", { name: "Arrangement" });
  }

  it("offers the three modes, and shows a saved jam as the loop it is", () => {
    // A record with no arrangement plays what it always played, and the
    // control has to say so rather than showing a mode the jam is not in.
    sheet({ jam: jamOf({ arrangement: undefined }) });
    const group = modes();
    for (const label of ["Loop", "Build", "Song"]) {
      expect(within(group).getByRole("button", { name: label })).toBeTruthy();
    }
    expect(within(group).getByRole("button", { name: "Loop" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("writes a whole arrangement when you touch one field of it", () => {
    // Half an arrangement on the record reads its missing half as today's
    // default on every load, which is fine right up until the default moves.
    const { props } = sheet({ jam: jamOf({ arrangement: undefined }) });
    fireEvent.click(within(modes()).getByRole("button", { name: "Song" }));
    expect(props.onEdit).toHaveBeenCalledWith({
      arrangement: { mode: "song", choruses: 4, intro: "fill", breakdownEvery: 4 },
    });
  });

  it("offers the chorus count beside Song and nowhere else", () => {
    sheet({ jam: jamOf({ arrangement: { mode: "build" } }) });
    expect(screen.queryByRole("group", { name: "Choruses" })).toBeNull();
    cleanup();
    sheet({ jam: jamOf({ arrangement: { mode: "song", choruses: 6 } }) });
    const stepper = screen.getByRole("group", { name: "Choruses" });
    expect(within(stepper).getByText("6")).toBeTruthy();
    expect(within(stepper).getByRole("button", { name: "More choruses" })).toBeTruthy();
  });

  it("keeps the chorus count inside what a song can be", () => {
    const { props } = sheet({ jam: jamOf({ arrangement: { mode: "song", choruses: 2 } }) });
    const stepper = screen.getByRole("group", { name: "Choruses" });
    expect(
      within(stepper).getByRole("button", { name: "Fewer choruses" }).hasAttribute("disabled"),
    ).toBe(true);
    fireEvent.click(within(stepper).getByRole("button", { name: "More choruses" }));
    expect(props.onEdit).toHaveBeenCalledWith({
      arrangement: { mode: "song", choruses: 3, intro: "fill", breakdownEvery: 4 },
    });
  });

  it("keeps the breakdown behind a disclosure, and out of Loop entirely", () => {
    sheet({ jam: jamOf({ arrangement: { mode: "loop" } }) });
    expect(screen.queryByRole("button", { name: /Breakdown/ })).toBeNull();
    cleanup();

    sheet({ jam: jamOf({ arrangement: { mode: "build" } }) });
    // Closed: the summary says what it is set to, and the control is not
    // drawn. One decision in twenty does not get a row of its own.
    expect(screen.queryByRole("group", { name: "Breakdown" })).toBeNull();
    const toggle = screen.getByRole("button", { name: /Breakdown/ });
    expect(toggle.textContent).toContain("every 4 choruses");
    fireEvent.click(toggle);
    const group = screen.getByRole("group", { name: "Breakdown" });
    for (const label of ["Off", "2", "4", "8"]) {
      expect(within(group).getByRole("button", { name: label })).toBeTruthy();
    }
  });

  it("says what the mode does, in a sentence", () => {
    sheet({ jam: jamOf({ arrangement: { mode: "song", choruses: 5 } }) });
    // The count is in the sentence, because "Song" on its own does not say
    // how long the song is.
    expect(screen.getByText(/Builds for 5 choruses/)).toBeTruthy();
  });
});

describe("the timeline's dynamics marks", () => {
  function marks(container: HTMLElement): HTMLElement[] {
    return [...container.querySelectorAll(".jam-timeline-dynamics")] as HTMLElement[];
  }

  it("draws nothing at all for a jam that loops", () => {
    // Twelve identical marks under twelve bars would be twelve marks saying
    // nothing. A loop has no build to see coming.
    const { container } = setup({ jam: jamOf({ arrangement: { mode: "loop" } }) });
    expect(marks(container)).toHaveLength(0);
  });

  it("draws one mark per bar of the chorus on screen, and none of them moves", () => {
    const jam = jamOf({ form: { kind: "blues12", bars: 12 }, arrangement: { mode: "build" } });
    const { container } = setup({ jam, currentBeat: beat(3, 1), isPlaying: true });
    const row = marks(container);
    expect(row).toHaveLength(12);
    // Chorus one is the held-back one, all the way through.
    expect(row.every((mark) => mark.dataset.level === "soft")).toBe(true);
    // The crash at the top of the chorus, and no other on this time round.
    expect(row.flatMap((mark, bar) => (mark.hasAttribute("data-crash") ? [bar] : []))).toEqual([0]);
  });

  it("hatches the half of a breakdown chorus the band is out of", () => {
    const jam = jamOf({ form: { kind: "blues12", bars: 12 }, arrangement: { mode: "build" } });
    const { container } = setup({ jam, currentBeat: beat(0, 4), isPlaying: true });
    const row = marks(container);
    expect(row.flatMap((mark, bar) => (mark.hasAttribute("data-quiet") ? [bar] : []))).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
    // And the band comes back on bar seven with a crash on it.
    expect(row[6].hasAttribute("data-quiet")).toBe(false);
    expect(row[6].hasAttribute("data-crash")).toBe(true);
  });

  it("marks the last bar of a song as one hit and nothing after", () => {
    const jam = jamOf({
      form: { kind: "blues12", bars: 12 },
      arrangement: { mode: "song", choruses: 2 },
    });
    const { container } = setup({ jam, currentBeat: beat(0, 2), isPlaying: true });
    expect(marks(container)[11].hasAttribute("data-hit")).toBe(true);
  });

  it("says the same thing to a screen reader that it draws for an eye", () => {
    const jam = jamOf({ form: { kind: "blues12", bars: 12 }, arrangement: { mode: "build" } });
    setup({ jam, currentBeat: beat(0, 4), isPlaying: true });
    expect(screen.getByRole("button", { name: /Go to bar 1 —.*breakdown.*crash/ })).toBeTruthy();
  });
});
