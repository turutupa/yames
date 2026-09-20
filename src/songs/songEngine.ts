/**
 * What Songs keeps about the band, and where it is kept.
 *
 * Two things live here and neither of them is React. The first is the shape
 * of a song's mix — four faders and a mute each — and the arithmetic that
 * turns it into the four numbers the engine takes. The second is where that
 * mix is remembered, which is **per song**: the balance between a click, a
 * drum kit and a bass is a fact about the piece you are practising and about
 * the room you are in, and a player who turned the drums down on one song
 * because the recording is loud should not find every other song quiet.
 *
 * It is in `settings.json` under one key rather than in the practice store
 * beside the score, for a plain reason: the store's `scores` row is a
 * `SongScore` and `src-tauri/src/score.rs` is the contract for what one is.
 * A mix is not part of the score, it is part of how you are playing it today.
 * The whole map is a few dozen bytes per song.
 */
import { storeLoad, storeSave } from "../ipc";
import { DEFAULT_SONG_MIX, SONG_MIX_MAX, SONG_MIX_MIN } from "./types";
import type { SongMix, SongRole } from "./types";

/** A fader on the stage: the band's three rows, and the click over them. */
export type SongLane = "click" | SongRole;

export const SONG_LANES: SongLane[] = ["click", "drums", "bass", "keys"];

/** A song's band, as the player left it. */
export type SongMixSetting = {
  mix: SongMix;
  /** The lanes that are off. A mute is not a fader at zero — see below. */
  muted: SongLane[];
  /** 0, 1 or 2 bars before the first pass. */
  countInBars: number;
  /**
   * Record a take of this song. Off unless the player turned it on, and per
   * song for the same reason the mix is: `Jam.takes` lives on the jam record,
   * so a song you record is a song you decided to record and the one next to
   * it in the library is not. Absent means off, which is what every song
   * stored before this existed says.
   */
  takes: boolean;
};

export const DEFAULT_MIX_SETTING: SongMixSetting = {
  mix: DEFAULT_SONG_MIX,
  muted: [],
  countInBars: 0,
  takes: false,
};

function clampGain(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(SONG_MIX_MAX, Math.max(SONG_MIX_MIN, value));
}

/**
 * The four numbers the engine is sent.
 *
 * A muted lane goes to zero and its fader keeps whatever it was set to, which
 * is why the mute is a separate thing rather than a fader at the bottom: you
 * mute the drums to hear yourself over one passage and un-mute them back to
 * the level you had, not back to full.
 */
export function engineMix(setting: SongMixSetting): SongMix {
  const off = new Set(setting.muted);
  const lane = (id: SongLane, value: number) => (off.has(id) ? 0 : clampGain(value));
  return {
    click: lane("click", setting.mix.click),
    drums: lane("drums", setting.mix.drums),
    bass: lane("bass", setting.mix.bass),
    keys: lane("keys", setting.mix.keys),
  };
}

/** Set one fader, leaving the others and the mutes alone. */
export function withGain(
  setting: SongMixSetting,
  lane: SongLane,
  value: number,
): SongMixSetting {
  return { ...setting, mix: { ...setting.mix, [lane]: clampGain(value) } };
}

/** Turn one lane off, or back on. */
export function withMute(
  setting: SongMixSetting,
  lane: SongLane,
  muted: boolean,
): SongMixSetting {
  const without = setting.muted.filter((id) => id !== lane);
  return { ...setting, muted: muted ? [...without, lane] : without };
}

// --- where it is kept ------------------------------------------------------

const SONG_MIX_KEY = "songMixes";

type StoredMixes = Record<string, SongMixSetting>;

/**
 * Read back what was stored, mistrusting all of it.
 *
 * `settings.json` is a file a user can open and a file an older build wrote,
 * so every field is checked rather than assumed: a hand-edited gain of `"1"`
 * or a missing `muted` must give the defaults back, not a band at `NaN`.
 */
export function readMixSetting(stored: unknown): SongMixSetting {
  const raw = (stored ?? {}) as Partial<SongMixSetting>;
  const mix = (raw.mix ?? {}) as Partial<SongMix>;
  const gain = (value: unknown, fallback: number) =>
    typeof value === "number" && Number.isFinite(value) ? clampGain(value) : fallback;
  return {
    mix: {
      click: gain(mix.click, DEFAULT_SONG_MIX.click),
      drums: gain(mix.drums, DEFAULT_SONG_MIX.drums),
      bass: gain(mix.bass, DEFAULT_SONG_MIX.bass),
      keys: gain(mix.keys, DEFAULT_SONG_MIX.keys),
    },
    muted: Array.isArray(raw.muted)
      ? SONG_LANES.filter((lane) => raw.muted!.includes(lane))
      : [],
    countInBars:
      typeof raw.countInBars === "number" && raw.countInBars >= 0 && raw.countInBars <= 2
        ? Math.round(raw.countInBars)
        : 0,
    // Only an explicit `true` records. Anything else a hand-edited file or an
    // older build can hold — missing, `"yes"`, `1` — leaves the microphone
    // alone, which is the only default a switch like this may have.
    takes: raw.takes === true,
  };
}

/** What this song's band was left at, or the defaults. */
export async function loadMixSetting(songId: string): Promise<SongMixSetting> {
  const all = await storeLoad<StoredMixes>(SONG_MIX_KEY);
  return readMixSetting(all?.[songId]);
}

/**
 * Remember it, read-modify-write, the way setlists and jams are written.
 *
 * Serialised through one chain: a fader drag fires per step, and two writes
 * in flight together would both have read the map before either wrote, so
 * the second would drop the first song's entry.
 */
let writing: Promise<unknown> = Promise.resolve();

export function saveMixSetting(songId: string, setting: SongMixSetting): Promise<void> {
  const apply = async () => {
    const all = (await storeLoad<StoredMixes>(SONG_MIX_KEY)) ?? {};
    await storeSave(SONG_MIX_KEY, { ...all, [songId]: setting });
  };
  const next = writing.then(apply, apply);
  writing = next;
  return next;
}

/** Forget a song's band, when the song itself is forgotten. */
export function forgetMixSetting(songId: string): Promise<void> {
  const apply = async () => {
    const all = (await storeLoad<StoredMixes>(SONG_MIX_KEY)) ?? {};
    if (!(songId in all)) return;
    const { [songId]: _gone, ...rest } = all;
    await storeSave(SONG_MIX_KEY, rest);
  };
  const next = writing.then(apply, apply);
  writing = next;
  return next;
}
