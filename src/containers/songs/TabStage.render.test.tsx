// How often the score is engraved, and the complete list of reasons.
//
// The owner, 2026-09-21: *"when it's playing and i stop it, the whole alpha
// tab flickers as in re-rendering, this is very annoying"*.
//
// Two separate things made that true and each has its own home. The one a
// picture found is in `buildSettings`: alphaTab's lazy loading was emptying
// and re-filling whole systems as the page scrolled back to the top, which
// `tests/layout/songs-long.spec.ts` measures because it is about the DOM of a
// real engraving. The one a picture CANNOT find is this: whether a transport
// press, a seek, a loop, a selection or a library write re-runs the effect
// that builds the api and calls `renderScore`.
//
// So this counts. `AlphaTabApi` is the only thing mocked — the importer, the
// settings and the enums are the shipping ones, because the question is what
// `TabStage` asks alphaTab to do and not what alphaTab does with it.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { importSong } from "../../songs/import";
import { texBytes } from "../../songs/fixtures";
import { TabStage } from "./TabStage";
import type { SongScore } from "../../songs/types";

/** Every `renderScore` this test run has seen, across every api built. */
const engraved: { tracks: number[] }[] = [];
/** Every `AlphaTabApi` built — one per destroy-and-rebuild of the tab. */
let built = 0;

vi.mock("@coderline/alphatab", async (importOriginal) => {
  const real = await importOriginal<typeof import("@coderline/alphatab")>();
  class FakeApi {
    error = { on: () => undefined };
    postRenderFinished = { on: (fn: () => void) => void (this._finished = fn) };
    renderer = { boundsLookup: null };
    tickPosition = 0;
    _finished: (() => void) | null = null;
    constructor() {
      built += 1;
    }
    renderScore(_score: unknown, tracks: number[]) {
      engraved.push({ tracks });
      this._finished?.();
    }
    destroy() {
      /* nothing to take down: nothing was drawn */
    }
  }
  return { ...real, AlphaTabApi: FakeApi };
});

const TEX = `\\title "Four bars"
\\artist "Nobody"
\\tempo 120
.
\\track "Lead"
\\tuning e5 b4 g4 d4 a3 e3
\\section Verse
\\ts 4 4 3.3.8 5.3.8 3.3.8 5.3.8 3.3.8 5.3.8 3.3.8 5.3.8 |
3.3.8 5.3.8 3.3.8 5.3.8 3.3.8 5.3.8 3.3.8 5.3.8 |
7.3.8 8.3.8 7.3.8 8.3.8 7.3.8 8.3.8 7.3.8 8.3.8 |
7.3.8 8.3.8 7.3.8 8.3.8 7.3.8 8.3.8 7.3.8 8.3.8 |`;

const BYTES = texBytes(TEX);
let SCORE: SongScore;

function stage(over: Record<string, unknown> = {}) {
  return (
    <TabStage
      score={SCORE}
      // A FRESH array every time, on purpose: that is what the library hands
      // this component after any write to the song's record, and it must not
      // be a reason to re-engrave anything.
      source={Uint8Array.from(BYTES)}
      tick={0}
      themeId="ember"
      {...over}
    />
  );
}

beforeEach(() => {
  engraved.length = 0;
  built = 0;
  SCORE = importSong(BYTES, "four.alphatex", 0).score;
});

afterEach(() => {
  cleanup();
});

describe("the score is engraved once, and then left alone", () => {
  it("draws it once when the song opens", () => {
    render(stage());
    expect(built).toBe(1);
    expect(engraved).toHaveLength(1);
    expect(engraved[0].tracks).toEqual([0]);
  });

  it("draws nothing again across play, stop, play, a seek and a loop", () => {
    const { rerender } = render(stage());
    expect(engraved).toHaveLength(1);

    // Play: the transport starts and the cursor begins to travel.
    act(() => rerender(stage({ playing: true, tick: 0, pass: 0 })));
    // Three beats of it.
    for (const tick of [960, 1920, 2880]) {
      act(() => rerender(stage({ playing: true, tick, pass: 0 })));
    }
    // Stop — the moment the owner reported on.
    act(() => rerender(stage({ playing: false, tick: 0 })));
    // Play again.
    act(() => rerender(stage({ playing: true, tick: 960, pass: 0 })));
    // A seek: the click on the tab that moves the playhead.
    act(() => rerender(stage({ playing: true, tick: 7680, pass: 0, playhead: 2 })));
    // Round again: a new time through the portion.
    act(() =>
      rerender(stage({ playing: true, tick: 0, pass: 1, selection: { startBar: 0, endBar: 1 } })),
    );
    // And stopped once more, with the verdict up behind it.
    act(() => rerender(stage({ playing: false, tick: 0, selection: { startBar: 0, endBar: 1 } })));

    expect(engraved, "the score was engraved again by the transport").toHaveLength(1);
    expect(built, "the tab was rebuilt by the transport").toBe(1);
  });

  it("draws nothing again when the library hands back the same song", () => {
    const { rerender } = render(stage());
    // A write to the song's record — a progress note, a last-opened stamp, a
    // portion saved — re-creates the record, the decoded bytes and the score
    // object. None of that is a different piece of music.
    const sameAgain: SongScore = { ...SCORE, source: { ...SCORE.source } };
    act(() => rerender(stage({ score: sameAgain })));
    act(() => rerender(stage({ score: { ...sameAgain } })));
    expect(engraved).toHaveLength(1);
    expect(built).toBe(1);
  });

  it("draws nothing again when the portion, the speed or the lights change", () => {
    const { rerender } = render(stage());
    act(() => rerender(stage({ selection: { startBar: 1, endBar: 2 } })));
    act(() => rerender(stage({ tempoPercent: 70 })));
    act(() => rerender(stage({ lights: new Map([[0, "onTime" as const]]) })));
    act(() => rerender(stage({ playhead: 3 })));
    expect(engraved).toHaveLength(1);
  });

  it("draws it again when the theme changes", () => {
    const { rerender } = render(stage());
    act(() => rerender(stage({ themeId: "manuscript" })));
    expect(engraved).toHaveLength(2);
    expect(built).toBe(2);
  });

  it("draws it again when the notation or the zoom changes", () => {
    const { rerender } = render(stage({ view: { notation: false, zoom: 1 } }));
    act(() => rerender(stage({ view: { notation: true, zoom: 1 } })));
    expect(engraved).toHaveLength(2);
    act(() => rerender(stage({ view: { notation: true, zoom: 1.2 } })));
    expect(engraved).toHaveLength(3);
  });

  it("draws it again when a different part of the file is chosen", () => {
    const { rerender } = render(stage());
    // Another track is another score, with an id of its own.
    const other: SongScore = {
      ...SCORE,
      id: `${SCORE.id}-bass`,
      source: { ...SCORE.source, trackIndex: 0, trackName: "Bass" },
    };
    act(() => rerender(stage({ score: other })));
    expect(engraved).toHaveLength(2);
  });
});
