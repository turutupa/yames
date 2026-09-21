/**
 * The band's screen, on a phone (M09).
 *
 * Two things that only exist there, and both of them are doors: the buttons
 * that open Set up and the cheat sheet — which on a desktop live in the
 * context bar and on a 360px screen were drawn off the end of it — and the
 * system Back gesture, which went straight past a full-screen setup drawer to
 * background the app because Jam's sheets are its own docked drawer rather
 * than the mobile `Sheet` primitive that registers itself.
 *
 * Layout is not testable here: happy-dom computes no geometry, so everything
 * about "does it fit" is the shots harness and `tests/layout/jam.spec.ts`.
 * What IS testable is which controls exist and what Back closes first.
 */
import "../../test/mobileFlag"; // MUST be first — see the file.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, fireEvent } from "@testing-library/react";
import { createRef } from "react";
import { IS_MOBILE } from "../../platform";
import { dismissTop, resetBackStack } from "../../mobile/backStack";
import { JamView } from "./JamView";
import { STARTER_JAMS } from "../../jam/jams";
import type { BeatEvent } from "../../types";

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

function setup(overrides: Partial<React.ComponentProps<typeof JamView>> = {}) {
  const props: React.ComponentProps<typeof JamView> = {
    jam: STARTER_JAMS[0],
    jams: [],
    onEdit: vi.fn(),
    onLoadJam: vi.fn(),
    currentBeat: null as BeatEvent | null,
    isPlaying: false,
    instrument: "electric-guitar",
    lineup: { drums: true, bass: true },
    trainedBpm: null,
    listening: false,
    takes: {
      available: false,
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
    },
    onToggleTakes: vi.fn(),
    screen: screenState(),
    position: {
      loop: null,
      pendingJump: null,
      currentBar: 0,
      jumpTo: vi.fn(),
      toggleSectionLoop: vi.fn(),
    },
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
  return { ...render(<JamView {...props} />), props };
}

beforeEach(() => {
  resetBackStack();
});

describe("the jam's screen on a phone", () => {
  it("has the flag on — every assertion below depends on it", () => {
    expect(IS_MOBILE).toBe(true);
  });

  it("carries Set up and the cheat sheet as buttons on the stage", () => {
    const { container } = setup();
    const doors = container.querySelectorAll(".jam-phone-doors .jam-sheet-btn");
    expect(doors.length, "the two doors are not on the stage").toBe(2);
    // The harness and the layout suite both press these by class; the words
    // are the same two the context bar uses on a desktop.
    expect([...doors].map((b) => b.textContent)).toEqual(["Set up", "Cheat sheet"]);
  });

  it("opens Set up, and closes the cheat sheet on the way in", () => {
    const setSetupOpen = vi.fn();
    const setChordsOpen = vi.fn();
    const { container } = setup({
      screen: screenState({ chordsOpen: true, setSetupOpen, setChordsOpen }),
    });

    fireEvent.click(container.querySelectorAll(".jam-phone-doors .jam-sheet-btn")[0]);
    expect(setSetupOpen).toHaveBeenCalledWith(true);
    // They occupy the same screen; two of them at once is no jam left.
    expect(setChordsOpen).toHaveBeenCalledWith(false);
  });
});

describe("what Back closes on the jam tab", () => {
  it("closes the setup drawer rather than backgrounding the app", () => {
    const setSetupOpen = vi.fn();
    setup({ screen: screenState({ setupOpen: true, setSetupOpen }) });

    act(() => {
      expect(dismissTop(), "nothing registered the drawer with Back").toBe(true);
    });
    expect(setSetupOpen).toHaveBeenCalledWith(false);
  });

  it("closes the cheat sheet", () => {
    const setChordsOpen = vi.fn();
    setup({ screen: screenState({ chordsOpen: true, setChordsOpen }) });

    act(() => {
      expect(dismissTop()).toBe(true);
    });
    expect(setChordsOpen).toHaveBeenCalledWith(false);
  });

  it("takes a dropdown before the sheet it was opened over", () => {
    // The order is the whole point: a menu is the innermost thing on the
    // screen, so one Back puts the menu away and leaves the drawer where it
    // was. The band row's groove picker is the one on the stage itself.
    const setSetupOpen = vi.fn();
    const { container } = setup({ screen: screenState({ setupOpen: true, setSetupOpen }) });

    const picker = container.querySelector(".jam-band-extra .jam-dropdown") as HTMLElement;
    expect(picker, "no player picker on the stage").toBeTruthy();
    fireEvent.click(picker);
    expect(document.querySelector(".jam-dropdown-menu"), "the menu did not open").toBeTruthy();

    act(() => {
      expect(dismissTop()).toBe(true);
    });
    expect(document.querySelector(".jam-dropdown-menu"), "the menu stayed open").toBeNull();
    expect(setSetupOpen, "Back closed the drawer under the menu").not.toHaveBeenCalled();

    // And the next one reaches the drawer.
    act(() => {
      expect(dismissTop()).toBe(true);
    });
    expect(setSetupOpen).toHaveBeenCalledWith(false);
  });

  it("has nothing to close with no layer open, so Back is the app's", () => {
    setup();
    expect(dismissTop()).toBe(false);
  });
});
