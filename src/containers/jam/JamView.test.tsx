// The Jam stage. What is worth pinning here is the timeline — it is the
// headline of the whole mode (JAM_MODE §4.2), it is the only thing on the
// screen driven by the engine rather than by the record, and "which bar of
// the twelve am I on" is the question the mode exists to answer.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { createRef } from "react";
import { JamView } from "./JamView";
import { STARTER_JAMS } from "../../jam/jams";
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
    isAccent: measureBeat === 0,
    formBar,
    chorus,
    bandState: "full",
  };
}

/**
 * The row of groove cards.
 *
 * Some groove names are also meter names — "6/8" is a groove AND a meter
 * preset — so a query for one by text has to say which control it means.
 */
function grooveCards(container: HTMLElement): HTMLElement {
  return container.querySelector(".jam-cards-groove") as HTMLElement;
}

/** The screen state the view does not own — inert unless a test drives it. */
function screenState(
  overrides: Partial<React.ComponentProps<typeof JamView>["screen"]> = {},
): React.ComponentProps<typeof JamView>["screen"] {
  return {
    fretboardOpen: false,
    toggleFretboard: vi.fn(),
    sevenths: false,
    setSevenths: vi.fn(),
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
    jumpTo: vi.fn(),
    toggleSectionLoop: vi.fn(),
    ...overrides,
  };
}

function setup(overrides: Partial<React.ComponentProps<typeof JamView>> = {}) {
  const props = {
    jam: jamOf(),
    onEdit: vi.fn(),
    currentBeat: null as BeatEvent | null,
    isPlaying: false,
    instrument: "electric-guitar",
    lineup: { drums: true, bass: true },
    trainedBpm: null as number | null,
    listening: false,
    voiceReady: false,
    takes: takesState(),
    onToggleTakes: vi.fn(),
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
  const utils = render(<JamView {...props} />);
  return { ...utils, props };
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
    setup({ isPlaying: false, position: positionState({ pendingJump: 4 }) });
    expect(screen.getByText(/starts at bar 5/)).toBeInTheDocument();
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

  it("offers the thirteen grooves, a card for one of your own, and marks the one that is loaded", () => {
    const { container } = setup({ jam: jamOf({ grooveId: "bossa" }) });
    const cards = container.querySelectorAll(".jam-cards-groove .jam-card");
    // Thirteen presets and "Make your own". The last card is one of the
    // choices rather than a mode to go and find, which is the difference
    // between an editor people use and one they read about in a changelog.
    expect(cards).toHaveLength(14);
    expect(cards[13].textContent).toContain("Make your own");
    const pressed = [...cards].filter((c) => c.getAttribute("aria-pressed") === "true");
    expect(pressed).toHaveLength(1);
    expect(pressed[0].textContent).toContain("Bossa");
  });

  it("marks the ninth card instead once the groove is yours", () => {
    const { container } = setup({
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
    const { container } = setup();
    const glyphs = container.querySelectorAll(".jam-cards-groove .jam-glyph");
    // Fourteen: the thirteen presets, plus the "make your own" card, which
    // draws the groove that is loaded so it is never a blank square.
    expect(glyphs).toHaveLength(14);
    // Rock eighths is 4 × 2 ticks over three lanes; the bossa is 4 × 4.
    expect(glyphs[0].querySelectorAll("circle")).toHaveLength(8 * 3);
    expect(glyphs[6].querySelectorAll("circle")).toHaveLength(16 * 3);
  });

  it("carries the count-in over to the new groove's meter", () => {
    // One bar of a waltz is three beats, not four. A count-in in the wrong
    // meter lands you on beat two of the first bar.
    const { props } = setup({ jam: jamOf({ grooveId: "rock8", countIn: 4 }) });
    fireEvent.click(screen.getByText("Waltz"));
    expect(props.onEdit).toHaveBeenCalledWith({ grooveId: "waltz", countIn: 3 });
  });

  it("leaves a count-in of none alone when the groove changes", () => {
    const { props } = setup({ jam: jamOf({ grooveId: "rock8", countIn: 0 }) });
    fireEvent.click(screen.getByText("Waltz"));
    expect(props.onEdit).toHaveBeenCalledWith({ grooveId: "waltz", countIn: 0 });
  });

  it("keeps two bars at two bars, and drops to one where two will not fit", () => {
    // The setting is bars; beats are only how the engine takes it. Two bars of
    // 4/4 is eight, which is the engine's whole limit — two bars of 6/8 would
    // be twelve, and a count-in past the limit is a wait, not a count-in.
    const rock = setup({ jam: jamOf({ grooveId: "rock8", countIn: 8 }) });
    fireEvent.click(screen.getByText("Waltz"));
    expect(rock.props.onEdit).toHaveBeenCalledWith({ grooveId: "waltz", countIn: 6 });
    cleanup();

    const waltz = setup({ jam: jamOf({ grooveId: "rock8", countIn: 8 }) });
    // Scoped to the groove cards: "6/8" is also a meter preset now, and the
    // two are different controls that happen to be named the same thing.
    fireEvent.click(within(grooveCards(waltz.container)).getByText("6/8"));
    expect(waltz.props.onEdit).toHaveBeenCalledWith({ grooveId: "sixEight", countIn: 6 });
  });

  it("offers a count-in only in whole bars the engine will actually take", () => {
    // Two bars of 6/8 is twelve beats, past `arm_count_in`'s limit of eight.
    // Offering it and clamping it would put a lie on the button.
    const { container } = setup({ jam: jamOf({ grooveId: "sixEight", countIn: 6 }) });
    const groups = [...container.querySelectorAll(".jam-segmented")];
    const countIn = groups.find((g) => g.getAttribute("aria-label") === "Count-in")!;
    expect(countIn.querySelectorAll(".accent-option")).toHaveLength(2);
  });

  it("switches the form and keeps the length the timeline was showing", () => {
    const { props } = setup();
    fireEvent.click(screen.getByText("Your own"));
    expect(props.onEdit).toHaveBeenCalledWith({ form: { kind: "custom", bars: 12 } });
  });

  it("shows the bar stepper only on a form of your own", () => {
    const { container, rerender, props } = setup();
    expect(container.querySelector(".jam-bars")).toBeNull();

    rerender(<JamView {...props} jam={jamOf({ form: { kind: "custom", bars: 5 } })} />);
    expect(container.querySelector(".jam-bars")).not.toBeNull();
    fireEvent.click(screen.getByLabelText("More bars"));
    expect(props.onEdit).toHaveBeenCalledWith({ form: { kind: "custom", bars: 6 } });
  });

  it("holds the bar stepper inside 1..64", () => {
    const { rerender, props } = setup({ jam: jamOf({ form: { kind: "custom", bars: 1 } }) });
    expect(screen.getByLabelText("Fewer bars")).toBeDisabled();

    rerender(<JamView {...props} jam={jamOf({ form: { kind: "custom", bars: 64 } })} />);
    expect(screen.getByLabelText("More bars")).toBeDisabled();
  });

  it("offers the four fill choices and marks the one the record is on", () => {
    // Off, the chorus end, every four bars, every eight. Two fields on the
    // record and one control on the screen: "off, or every eight bars" is one
    // decision, and the switch it replaced could only say two of the four.
    const { container } = setup();
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
    const { props, rerender } = setup();
    fireEvent.click(screen.getByText("Every 4"));
    expect(props.onEdit).toHaveBeenCalledWith({ fills: true, fillEvery: 4 });

    // And off zeroes the count rather than leaving a record that says "no
    // fills, every four bars" — two readers could disagree about that, and one
    // of them is the engine.
    rerender(<JamView {...props} jam={jamOf({ fills: true, fillEvery: 4 })} />);
    fireEvent.click(screen.getByText("Off"));
    expect(props.onEdit).toHaveBeenCalledWith({ fills: false, fillEvery: 0 });
  });

  it("says what a band through speakers does to the score", () => {
    // JAM_MODE §3, principle 5 — the one line on this screen that is there to
    // stop a flattered score from going unexplained.
    setup();
    expect(screen.getByText("Headphones keep the score honest.")).toBeInTheDocument();
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

  it("shows the chords of the key, with the one you are on lit", () => {
    setup({ currentBeat: beat(0), isPlaying: true });
    const strip = screen.getByTestId("key-chords-strip");
    const lit = within(strip)
      .getAllByTestId("key-chord")
      .filter((c) => c.getAttribute("aria-pressed") === "true");
    expect(lit).toHaveLength(1);
    expect(lit[0]).toHaveAttribute("aria-label", "A7");
  });

  it("gives a guitarist the shapes and a horn player only the chords", () => {
    setup({ currentBeat: beat(0), isPlaying: true });
    expect(screen.getByTestId("chord-shapes-row")).toBeInTheDocument();
    cleanup();
    // "other" is the horn, string and voice bucket: no neck, so no grips.
    setup({ instrument: "other", currentBeat: beat(0), isPlaying: true });
    expect(screen.queryByTestId("chord-shapes-row")).toBeNull();
    expect(screen.getByTestId("key-chords-strip")).toBeInTheDocument();
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
    setup({ jam: withChords() });
    expect(screen.getByRole("button", { name: "Edit changes" })).toBeInTheDocument();
    cleanup();
    setup({ jam: jamOf({ chords: false }) });
    expect(screen.queryByRole("button", { name: "Edit changes" })).toBeNull();
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
    const { props } = setup({
      jam: withChords({ progression: ["Bb", "C", ...Array(10).fill("")] }),
    });
    fireEvent.click(screen.getByText("8-bar loop"));
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
    const { container } = setup();
    const active = container.querySelectorAll(".jam-meter.active");
    expect(active).toHaveLength(1);
    expect(active[0].textContent).toBe("The groove's");
  });

  it("says which groove does not fit the meter it was given", () => {
    setup({ jam: jamOf({ grooveId: "shuffle", meter: { beatGroups: [2, 2, 3], ticksPerBeat: 2 } }) });
    expect(screen.getByText(/does not fit/)).toBeInTheDocument();
    // And the band row says what is actually playing.
    expect(screen.getByText(/The rule/)).toBeInTheDocument();
  });

  it("carries the count-in into the new meter, in bars", () => {
    const { props } = setup({ jam: jamOf({ grooveId: "rock8", countIn: 8 }) });
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

  it("gives every player a volume, and disables it for one who is out", () => {
    const { container } = setup({ jam: jamOf({ band: { drums: true, bass: false, keys: false } }) });
    const sliders = container.querySelectorAll<HTMLInputElement>(".jam-band-volume input");
    expect(sliders).toHaveLength(3);
    expect(sliders[0].disabled).toBe(false);
    expect(sliders[1].disabled).toBe(true);
  });

  it("writes a volume to the mix without disturbing the others", () => {
    const { container, props } = setup();
    const slider = container.querySelector<HTMLInputElement>(".jam-band-volume input")!;
    fireEvent.change(slider, { target: { value: "0.5" } });
    expect(props.onEdit).toHaveBeenCalledWith({ mix: { drums: 0.5, bass: 1, keys: 1 } });
  });

  it("has a keys row with a comping style", () => {
    const { props } = setup({ jam: jamOf({ band: { drums: true, bass: true, keys: true } }) });
    fireEvent.click(screen.getByRole("button", { name: "Stabs" }));
    expect(props.onEdit).toHaveBeenCalledWith({ keysStyle: "stabs" });
  });

  it("offers the sticks as well as the beep", () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Sticks" }));
    expect(props.onEdit).toHaveBeenCalledWith({ countInSound: "sticks" });
  });

  it("says where the voice comes from when there is not one", () => {
    setup({ voiceReady: false });
    expect(screen.getByText(/Needs the coach voice/)).toBeInTheDocument();
    cleanup();
    setup({ voiceReady: true });
    expect(screen.queryByText(/Needs the coach voice/)).toBeNull();
  });
});
