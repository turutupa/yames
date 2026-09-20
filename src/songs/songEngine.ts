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
  /**
   * Whether the range was left looping (W19).
   *
   * Here rather than in a key of its own because it is the same kind of fact
   * as the mix — something the player decided about THIS piece today — and
   * because opening a song should put back everything about it at once
   * rather than in three round trips.
   */
  loop: boolean;
  /** The speed it was left at, as a percentage of what is written. */
  tempoPercent: number;
  /**
   * The bars the player had selected, when a build has written any.
   *
   * **This module does not write this field.** The portion is W18's, who own
   * the selection on the stage; `rememberPlace` below deliberately leaves it
   * alone so there is one writer and one meaning. Read here, and only here,
   * so that opening a song puts the player back where they were. Absent is
   * the ordinary state and means "the whole song", which is what
   * `useSongsSession` already does.
   */
  range?: { startBar: number; endBar: number };
};

export const DEFAULT_MIX_SETTING: SongMixSetting = {
  mix: DEFAULT_SONG_MIX,
  muted: [],
  countInBars: 0,
  takes: false,
  loop: false,
  tempoPercent: 100,
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
    // Only an explicit `true` loops: a song that starts going round and
    // round when the player pressed play expecting one pass is a surprise
    // with a guitar in your hands.
    loop: raw.loop === true,
    tempoPercent:
      typeof raw.tempoPercent === "number" &&
      raw.tempoPercent >= 25 &&
      raw.tempoPercent <= 100
        ? Math.round(raw.tempoPercent)
        : 100,
    // Read, never written here — see the field's comment. Both bars have to
    // be whole numbers the right way round, or this is a file somebody
    // edited by hand and the whole song is the honest answer.
    ...(raw.range &&
    Number.isInteger(raw.range.startBar) &&
    Number.isInteger(raw.range.endBar) &&
    raw.range.startBar >= 0 &&
    raw.range.endBar >= raw.range.startBar
      ? { range: { startBar: raw.range.startBar, endBar: raw.range.endBar } }
      : {}),
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

/**
 * Remember the loop and the speed, without touching anything else (W19).
 *
 * A patch rather than a whole setting, and that is the point: the caller is
 * `useSongsSession`, which owns the transport but not the faders, and a
 * write of the whole object from there would clobber a fader the player
 * moved a moment earlier. It also never writes `range`, which is W18's —
 * read-modify-write through the same chain as everything else, so the two
 * writers cannot lose each other's work.
 */
export function rememberPlace(
  songId: string,
  place: { loop?: boolean; tempoPercent?: number },
): Promise<void> {
  const apply = async () => {
    const all = (await storeLoad<StoredMixes>(SONG_MIX_KEY)) ?? {};
    const current = readMixSetting(all[songId]);
    await storeSave(SONG_MIX_KEY, { ...all, [songId]: { ...current, ...place } });
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
