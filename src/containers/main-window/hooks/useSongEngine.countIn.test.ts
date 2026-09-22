// The count-in a SONG gets is the switch in the transport, and nothing else
// (W37 item 2).
//
// The owner, 2026-09-21: *"count in is happening for songs whether it's
// enabled or not"* — with the switch off in his screenshot.
//
// Three things in this app are called a count-in and only one of them can
// count a song in:
//
//  - `AppState::count_in` — the CLICK's, armed by `arm_count_in` and seeded
//    from the drill's `warmup_beats`. It cannot reach a song: the warm-up is
//    inside the click's arm of the engine's frame loop and a loaded song
//    takes the other arm, and `load_song` and `set_song_range` both disarm it
//    anyway. `song::tests` holds the engine to that.
//  - `SongMix::count_in` — a GAIN, not a count. It is how loud the count is
//    when there is one (W34 item 7).
//  - `SongTransport.countInBars` — the one that counts, compiled into the
//    piece. The transport's switch is the only thing in the app that writes
//    it (`countIn.ts`, `MainWindow`), and these say the engine is never told
//    anything else.
//
// What this pins is the traffic: every command the engine is sent while a
// song is open carries the count-in the switch is showing, on the first load,
// after a toggle, after a song change, and after the engine drops the piece.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

/** Every song command the hook sent, in order. */
type Sent =
  | { cmd: "load"; countInBars: number; startTick: number }
  | { cmd: "range"; countInBars: number | undefined; startTick: number | undefined }
  | { cmd: "clear" };

const sent: Sent[] = [];
let dropped: (() => void) | null = null;

vi.mock("../../../ipc", () => ({
  SONG_SOUND_FONT_KEY: "songSoundFont",
  storeLoad: () => Promise.resolve(null),
  setSongSoundFont: () => Promise.resolve(),
  setSongMix: () => Promise.resolve(),
  clearSong: () => {
    sent.push({ cmd: "clear" });
    return Promise.resolve();
  },
  loadSong: (transport: { countInBars: number; startTick: number }) => {
    sent.push({ cmd: "load", countInBars: transport.countInBars, startTick: transport.startTick });
    return Promise.resolve({ bars: 8, passMs: 1000, playedNotes: 0, droppedNotes: 0 });
  },
  setSongRange: (
    _range: unknown,
    _loops: boolean,
    _tempoPercent: number,
    countInBars?: number,
    startTick?: number,
  ) => {
    sent.push({ cmd: "range", countInBars, startTick });
    return Promise.resolve({ bars: 8, passMs: 1000, playedNotes: 0, droppedNotes: 0 });
  },
  onSongDropped: (fn: () => void) => {
    dropped = fn;
    return Promise.resolve(() => {
      dropped = null;
    });
  },
}));

/** What the store holds, per song. Written by the hook, read by the hook. */
const stored = new Map<string, { countInBars: number }>();
vi.mock("../../../songs/songEngine", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../songs/songEngine")>();
  return {
    ...real,
    loadMixSetting: (id: string) =>
      Promise.resolve({ ...real.DEFAULT_MIX_SETTING, ...(stored.get(id) ?? {}) }),
    saveMixSetting: (id: string, setting: { countInBars: number }) => {
      stored.set(id, { countInBars: setting.countInBars });
      return Promise.resolve();
    },
  };
});

import { useSongEngine } from "./useSongEngine";
import { importSong } from "../../../songs/import";
import { texBytes, GUITAR_AND_BASS, SECTIONS } from "../../../songs/fixtures";
import { wholeSong } from "../../../songs/schedule";

const first = importSong(texBytes(GUITAR_AND_BASS), "a.alphatex", 0).score;
const second = importSong(texBytes(SECTIONS), "b.alphatex", 0).score;

function open(score = first, source = texBytes(GUITAR_AND_BASS)) {
  return renderHook(
    (props: {
      score: typeof first;
      source: Uint8Array;
      isPlaying?: boolean;
      endBar?: number;
    }) =>
      useSongEngine({
        view: "songs",
        score: props.score,
        source: props.source,
        range: { ...wholeSong(props.score), ...(props.endBar === undefined ? {} : { endBar: props.endBar }) },
        loop: false,
        tempoPercent: 100,
        isPlaying: props.isPlaying ?? false,
        startTick: 0,
      }),
    { initialProps: { score, source } as {
      score: typeof first;
      source: Uint8Array;
      isPlaying?: boolean;
      endBar?: number;
    } },
  );
}

/** How long the bar fields' keystrokes are given before a rebuild. */
const DEBOUNCE_MS = 250;

/** Every count-in the engine has been told, in order. */
const toldCountIns = () =>
  sent
    .filter((s): s is Exclude<Sent, { cmd: "clear" }> => s.cmd !== "clear")
    .map((s) => s.countInBars);

beforeEach(() => {
  sent.length = 0;
  stored.clear();
  dropped = null;
  vi.useRealTimers();
});

describe("the count-in a song is played with", () => {
  it("is none until somebody turns the switch on", async () => {
    const { result } = open();
    await waitFor(() => expect(sent.some((s) => s.cmd === "load")).toBe(true), { timeout: 4000 });
    expect(toldCountIns()).toEqual([0]);
    expect(result.current.mixSetting.countInBars).toBe(0);
  });

  it("follows the switch the moment it is turned on and off again", async () => {
    const { result } = open();
    await waitFor(() => expect(sent.some((s) => s.cmd === "load")).toBe(true), { timeout: 4000 });

    act(() => result.current.setCountInBars(1));
    await waitFor(() => expect(toldCountIns()).toEqual([0, 1]), { timeout: 4000 });

    act(() => result.current.setCountInBars(0));
    await waitFor(() => expect(toldCountIns()).toEqual([0, 1, 0]), { timeout: 4000 });
    // ...and the last word the engine had is the switch's, not a memory of it.
    expect(toldCountIns().at(-1)).toBe(0);
  });

  it("is the SONG'S own when another song is opened", async () => {
    stored.set(first.id, { countInBars: 1 });
    const view = open();
    await waitFor(() => expect(result(view).mixSetting.countInBars).toBe(1), { timeout: 4000 });
    await waitFor(() => expect(toldCountIns().at(-1)).toBe(1), { timeout: 4000 });

    // A song that has never been counted in must not inherit the last one's.
    // This is the shape the owner's report has: a switch showing one thing
    // and the engine playing another.
    view.rerender({ score: second, source: texBytes(SECTIONS) });
    await waitFor(() => expect(result(view).mixSetting.countInBars).toBe(0), { timeout: 4000 });
    await waitFor(() => expect(toldCountIns().at(-1)).toBe(0), { timeout: 4000 });
  });

  /**
   * THE HOLE THE OWNER FELL DOWN.
   *
   * A range or a speed waits a quarter of a second before the piece is
   * rebuilt, because the bar fields are number inputs and fire per keystroke.
   * The count-in was behind that same timer — so turning the switch off and
   * pressing Play inside those 250 ms played the piece the engine was still
   * holding, count-in and all, and then the rebuild landed underneath and
   * started the song again. Both halves of "count in is happening whether
   * it's enabled or not".
   *
   * A switch is not a keystroke. It goes at once.
   */
  it("reaches the engine before somebody could press play", async () => {
    const { result } = open();
    await waitFor(() => expect(sent.some((s) => s.cmd === "load")).toBe(true), { timeout: 4000 });
    act(() => result.current.setCountInBars(1));
    await waitFor(() => expect(toldCountIns().at(-1)).toBe(1), { timeout: 4000 });

    const at = Date.now();
    act(() => result.current.setCountInBars(0));
    await waitFor(() => expect(toldCountIns().at(-1)).toBe(0), { timeout: 4000 });
    expect(
      Date.now() - at,
      "turning the count-in off waited for the bar fields' debounce",
    ).toBeLessThan(DEBOUNCE_MS);
  });

  /**
   * And a rebuild is a RESTART, so neither of the two things that only decide
   * how the next pass begins is sent while the transport runs.
   */
  it("is not sent to the engine mid-pass, because a rebuild restarts the song", async () => {
    const view = open();
    await waitFor(() => expect(sent.some((s) => s.cmd === "load")).toBe(true), { timeout: 4000 });
    view.rerender({ score: first, source: texBytes(GUITAR_AND_BASS), isPlaying: true });

    const before = sent.length;
    act(() => result(view).setCountInBars(1));
    await new Promise((r) => setTimeout(r, DEBOUNCE_MS * 3));
    expect(sent.length, "a count-in change restarted the song mid-pass").toBe(before);
    // The switch still shows what the player pressed.
    expect(result(view).mixSetting.countInBars).toBe(1);

    // And it lands on the stop, in time for the next press of Play.
    view.rerender({ score: first, source: texBytes(GUITAR_AND_BASS), isPlaying: false });
    await waitFor(() => expect(toldCountIns().at(-1)).toBe(1), { timeout: 4000 });
  });

  it("is said again, unchanged, when the engine drops the song", async () => {
    const { result } = open();
    await waitFor(() => expect(sent.some((s) => s.cmd === "load")).toBe(true), { timeout: 4000 });
    act(() => result.current.setCountInBars(1));
    await waitFor(() => expect(toldCountIns().at(-1)).toBe(1), { timeout: 4000 });
    act(() => result.current.setCountInBars(0));
    await waitFor(() => expect(toldCountIns().at(-1)).toBe(0), { timeout: 4000 });

    // A device change: the engine lets go and the hook loads the piece again.
    // The count-in it is loaded with has to be the switch's, or a song that
    // was counted in once would be counted in for ever.
    const before = sent.length;
    act(() => dropped?.());
    await waitFor(() => expect(sent.length).toBeGreaterThan(before), { timeout: 6000 });
    expect(toldCountIns().at(-1)).toBe(0);
  });
});

/** `renderHook`'s result, narrowed, so the lines above read as sentences. */
function result(view: ReturnType<typeof open>) {
  return view.result.current;
}
