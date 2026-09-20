/**
 * The renderer: every block draws, every button fires once, and an answer
 * that resolved to nothing draws nothing.
 *
 * happy-dom computes no geometry, so nothing here can say whether a block
 * FITS — that is `tests/layout/coach-blocks.spec.ts`, in a real browser.
 * What this can say is that the right thing is on screen, drawn by the
 * components that already existed rather than by a second copy of them.
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CoachBlocks } from "./CoachBlocks";
import { GALLERY_CONTEXT, GALLERY_SCENES, NEWER as GALLERY_NEWER, OLDER as GALLERY_OLDER } from "./gallery";
import { resolveCoachAnswer } from "./resolve";
import { BLOCK_TYPES } from "./spec";
import type { CoachAction } from "./types";
import type { CoachBlockSlots } from "./slots";

function draw(answer: unknown, options: { onAction?: (a: CoachAction) => void; slots?: Partial<CoachBlockSlots> } = {}) {
  const { blocks, dropped } = resolveCoachAnswer(answer, GALLERY_CONTEXT);
  render(<CoachBlocks blocks={blocks} onAction={options.onAction} slots={options.slots} />);
  return { blocks, dropped };
}

describe("every block in the catalogue", () => {
  it("draws, at least once, across the gallery's own scenes", () => {
    for (const scene of GALLERY_SCENES) {
      const { blocks } = resolveCoachAnswer(scene.answer, GALLERY_CONTEXT);
      render(
        <CoachBlocks blocks={blocks} onAction={() => {}} key={scene.name} />,
      );
    }
    const drawn = new Set(
      [...document.querySelectorAll("[data-block]")].map((n) => n.getAttribute("data-block")),
    );
    expect([...drawn].sort()).toEqual([...BLOCK_TYPES].sort());
  });

  /**
   * A gallery scene is written as `unknown`, so the compiler cannot tell it
   * when the catalogue changes underneath it. This can. W14 changed
   * `comeBack` from three named occasions to a number of days and the "All
   * six actions" scene went on saying `when: "tomorrow"` — it silently drew
   * five blocks instead of six, and the only thing that noticed was a
   * Playwright test counting boxes.
   */
  it("keeps every scene but the one about dropping, whole", () => {
    for (const scene of GALLERY_SCENES) {
      const { dropped } = resolveCoachAnswer(scene.answer, GALLERY_CONTEXT);
      if (scene.name === "What gets dropped") {
        expect(dropped.length, scene.name).toBeGreaterThan(0);
        continue;
      }
      expect(dropped.map((d) => `${String(d.type)}: ${d.detail}`), scene.name).toEqual([]);
    }
  });
});

describe("what the blocks are drawn with", () => {
  it("draws a grip with the chord box the cheat sheet uses", () => {
    draw({ blocks: [{ type: "chordShape", chord: "Am7", shape: 0 }] });
    const grip = screen.getByTestId("coach-blocks").querySelector('[data-block="chordShape"]')!;
    expect(within(grip as HTMLElement).getByTestId("chord-diagram")).toBeInTheDocument();
    expect(grip.querySelectorAll('[data-testid="chord-dot"]').length).toBeGreaterThan(0);
  });

  it("draws a neck with the fretboard the cheat sheet uses, lit where the theory says", () => {
    draw({
      blocks: [{ type: "fretboard", show: { of: "scale", root: "A", scale: "minorPentatonic" } }],
    });
    const board = screen.getByTestId("fretboard");
    const lit = new Set(
      [...board.querySelectorAll('[data-testid="fret-dot"]')].map((n) =>
        Number(n.getAttribute("data-pitch-class")),
      ),
    );
    // A C D E G, and nothing else.
    expect([...lit].sort((a, b) => a - b)).toEqual([0, 2, 4, 7, 9]);
  });

  it("draws progress as a line with one dot per go", () => {
    draw({ blocks: [{ type: "progress", score: "wish-you-were-here", fromBar: 17, toBar: 20 }] });
    const chart = screen.getByTestId("coach-progress");
    expect(chart.querySelectorAll("circle")).toHaveLength(4);
  });

  it("says the song and the bars in words a player reads", () => {
    draw({
      blocks: [{ type: "tabExcerpt", score: "wish-you-were-here", fromBar: 17, toBar: 20 }],
    });
    expect(screen.getByText(/Bars 17–20 of Wish You Were Here/)).toBeInTheDocument();
  });

  /**
   * The heading says the numbers on the PAGE. The block named played bars
   * 9–12 — which is what the transport and the excerpt take — and on a song
   * whose first eight bars are played twice, the page calls them 1–4.
   */
  it("says the bars the page calls them, not the ones the app counts", () => {
    const repeated = {
      scores: [
        {
          id: "repeat",
          title: "Round Twice",
          bars: 16,
          printedBars: [1, 2, 3, 4, 5, 6, 7, 8, 1, 2, 3, 4, 5, 6, 7, 8],
        },
      ],
    };
    const { blocks } = resolveCoachAnswer(
      { blocks: [{ type: "tabExcerpt", score: "repeat", fromBar: 9, toBar: 12 }] },
      repeated,
    );
    render(
      <CoachBlocks
        blocks={blocks}
        slots={{
          tabExcerpt: ({ fromBar, toBar }) => <b data-testid="real-tab">{`${fromBar}-${toBar}`}</b>,
        } as Partial<CoachBlockSlots> as CoachBlockSlots}
      />,
    );
    expect(screen.getByText(/Bars 1–4 of Round Twice/)).toBeInTheDocument();
    // And the slot still got the played ones, because that is what it loops.
    expect(screen.getByTestId("real-tab")).toHaveTextContent("9-12");
  });
});

describe("the three drawings still being built", () => {
  const answer = {
    blocks: [
      { type: "tabExcerpt", score: "wish-you-were-here", fromBar: 1, toBar: 4 },
      { type: "take", attempt: GALLERY_NEWER },
      { type: "compare", attempts: [GALLERY_OLDER, GALLERY_NEWER] },
    ],
  };

  it("shows a line saying so, and never invents the drawing", () => {
    draw(answer);
    expect(screen.getAllByText(/coming soon/i)).toHaveLength(3);
  });

  it("never shows a song's id when the song itself is not loaded", () => {
    // A take of a song that is not open has no title to use, and an id is a
    // filename, not something a player reads.
    const { blocks } = resolveCoachAnswer(
      { blocks: [{ type: "take", attempt: "a7" }, { type: "compare", attempts: ["a7", "a8"] }] },
      {
        attempts: [
          { id: "a7", scoreId: "some-file-id" },
          { id: "a8", scoreId: "some-file-id" },
        ],
      },
    );
    render(<CoachBlocks blocks={blocks} />);
    expect(screen.getByText("Your take")).toBeInTheDocument();
    expect(screen.getByText("Two goes, side by side")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("some-file-id");
  });

  it("steps aside the moment a real one is handed in", () => {
    draw(answer, {
      slots: {
        tabExcerpt: ({ fromBar, toBar }) => <b data-testid="real-tab">{`${fromBar}-${toBar}`}</b>,
      },
    });
    expect(screen.getByTestId("real-tab")).toHaveTextContent("1-4");
    // The other two are still the placeholder; the renderer did not change.
    expect(screen.getAllByText(/coming soon/i)).toHaveLength(2);
  });
});

describe("the button", () => {
  it("fires once, with the action the block carried", async () => {
    const onAction = vi.fn();
    draw(
      { blocks: [{ type: "action", action: { kind: "clickSubdivision", subdivision: 2 } }] },
      { onAction },
    );
    await userEvent.click(screen.getByRole("button"));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith({ kind: "clickSubdivision", subdivision: 2 });
  });

  it("fires once per press, not once per block on screen", async () => {
    const onAction = vi.fn();
    draw(
      {
        blocks: [
          { type: "action", action: { kind: "clickSubdivision", subdivision: 2 } },
          { type: "action", action: { kind: "loadPreset", preset: "warmup" } },
        ],
      },
      { onAction },
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(2);
    await userEvent.click(buttons[1]);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith({ kind: "loadPreset", preset: "warmup" });
  });

  it("wears the sentence the locale file gives it, filled in", () => {
    draw(
      {
        blocks: [
          {
            type: "action",
            action: { kind: "loopBars", score: "wish-you-were-here", fromBar: 17, toBar: 20, bpm: 96 },
          },
        ],
      },
      { onAction: () => {} },
    );
    expect(screen.getByRole("button")).toHaveTextContent("Loop bars 17–20 at 96");
  });

  it("is not drawn at all when nothing is listening", () => {
    draw({ blocks: [{ type: "action", action: { kind: "clickSubdivision", subdivision: 2 } }] });
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("an answer that resolved to nothing", () => {
  it("draws nothing — not a frame, not an apology", () => {
    const { blocks, dropped } = draw({
      blocks: [
        { type: "chordShape", chord: "Hm7", shape: 0 },
        { type: "tabExcerpt", score: "a-song-nobody-imported", fromBar: 1, toBar: 4 },
      ],
    });
    expect(blocks).toEqual([]);
    expect(dropped).toHaveLength(2);
    expect(screen.queryByTestId("coach-blocks")).toBeNull();
    expect(document.body.textContent).toBe("");
  });
});
