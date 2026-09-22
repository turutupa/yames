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
import {
  DEFAULT_SONG_MIX,
  DEFAULT_TRACK_MIX,
  GUIDE_TRACK_MIX,
  SONG_MIX_MAX,
  SONG_MIX_MIN,
} from "./types";
import { MAX_SAVED_PORTIONS } from "./selection";
import type { SavedPortion } from "./selection";
import type { SongBackingTrack, SongDrums, SongMix, SongMixGains } from "./types";

/**
 * A fader on the stage: the click, or one track of the file by its index.
 *
 * A number rather than a role since W28, because the band is the file's and
 * a file has two guitars far more often than it has one of anything. The
 * click keeps its name because it is the one row that is not in the file.
 */
export type SongLane = "click" | number;

/** How many faders a song can have: `song.rs`'s own ceiling, which is MIDI's. */
export const MAX_SONG_TRACKS = 16;

/** A song's band, as the player left it. */
export type SongMixSetting = {
  mix: SongMix;
  /** The lanes that are off. A mute is not a fader at zero — see below. */
  muted: SongLane[];
  /**
   * The tracks that are soloed. Empty is "everybody plays".
   *
   * Separate from the mutes, and it has to be: a solo is a thing you do for
   * eight bars and undo, and a player who solos the bass to hear a line and
   * then clears it must get back the band they had, mutes included. Written
   * as track indices only — soloing the click is not a gesture anybody makes.
   */
  soloed: number[];
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
   * W21 — record the PICTURE of this song as well (`plans/SONGS.md` A9).
   *
   * Beside `takes` and never instead of it: a picture with no sound is not a
   * take, so the camera can only be on for a song that is being recorded, and
   * `SongsView` turns one on with the other. Per song for the same reason the
   * rest of this record is per song — whether you want to be filmed is a
   * decision about the piece you are about to play, not about the app.
   */
  camera: boolean;
  /**
   * The portion of this song the player was last working on, and how
   * (2026-09-20).
   *
   * Beside the band rather than on the song record, because it is the same
   * kind of fact: not what the song IS — the record owns that — but how this
   * player has it set up. Somebody who left off looping bars 17–24 at 70 %
   * comes back to bars 17–24 at 70 %, which is the whole of what "practising
   * a passage" means across two sittings.
   *
   * `null` is the honest empty value and means the whole song. Absent is what
   * every song stored before this existed says, and reads back as null.
   */
  selection: { startBar: number; endBar: number } | null;
  loop: boolean;
  /** 50–100. The speed this song is being worked at. */
  tempoPercent: number;
  /** Portions the player named and kept, oldest first. */
  portions: SavedPortion[];
  /**
   * Has this player said anything about the click for this song? (W34 item 7)
   *
   * The owner: *"is the drums playing by default? i've played tabs with no
   * drums and it still plays them"*. His click's sound is set to Drum — the
   * chip in the header says so — so over a song with a band of its own, a
   * click ticking through every bar is a drummer playing along. `clickOn`
   * below turns it OFF by default when the file has parts that sound, which
   * is what every tab player does: the song keeps the time.
   *
   * This is the flag that keeps that a DEFAULT rather than a decision. False
   * — which is what every song stored before this says — means "nobody has
   * touched it, use the default"; the switch on the strip sets it, and from
   * then on the song keeps what the player chose whatever the default
   * becomes.
   */
  clickChosen: boolean;
  /**
   * Whose kit plays the file's drum track (W37 item 3).
   *
   * Per song, beside the drums' own fader in "More", because the answer
   * depends on the transcription and the only way to decide is to flip it
   * while the song plays. `"kit"` is the default and is Yames' recorded one.
   */
  drums: SongDrums;
};

export const DEFAULT_MIX_SETTING: SongMixSetting = {
  mix: DEFAULT_SONG_MIX,
  muted: [],
  soloed: [],
  countInBars: 0,
  takes: false,
  camera: false,
  selection: null,
  loop: false,
  tempoPercent: 100,
  portions: [],
  clickChosen: false,
  drums: "kit",
};

/**
 * Is the click sounding through this song? (W34 item 7)
 *
 * One line, three cases, and the order matters:
 *
 * 1. **The player turned it off** — it is off, whatever the song holds.
 * 2. **The player has said something about it** — `clickChosen`, so it is on
 *    unless case 1 caught it. A decision outlives a default.
 * 3. **Nobody has said anything** — it is off when the song has any sounding
 *    part and on when it has none. A file with a band keeps its own time; a
 *    bare tab has nothing to keep it, so the click does.
 *
 * Deliberately NOT written into `muted`: a default that has been written down
 * is a default that can never be changed again, and `startingMix`'s own
 * comment two screens down says the same thing about the faders.
 */
export function clickOn(setting: SongMixSetting, hasSoundingPart: boolean): boolean {
  if (setting.muted.includes("click")) return false;
  if (setting.clickChosen) return true;
  return !hasSoundingPart;
}

function clampGain(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(SONG_MIX_MAX, Math.max(SONG_MIX_MIN, value));
}

/**
 * The numbers the engine is sent: the click, and one per track.
 *
 * A muted lane goes to zero and its fader keeps whatever it was set to, which
 * is why the mute is a separate thing rather than a fader at the bottom: you
 * mute the drums to hear yourself over one passage and un-mute them back to
 * the level you had, not back to full. A solo does the same to everybody
 * else, and undoing it gives the same band back for the same reason.
 *
 * `trackCount` is how many rows the file has: the array is sent that long so
 * the engine's fixed sixteen are filled from the front, and a track the
 * player has never touched arrives at the level the arrangement was written
 * at rather than at nothing.
 */
export function engineMix(setting: SongMixSetting, trackCount: number): SongMixGains {
  const off = new Set(setting.muted);
  const solo = setting.soloed.filter((n) => n >= 0 && n < trackCount);
  const tracks: number[] = [];
  for (let n = 0; n < Math.min(trackCount, MAX_SONG_TRACKS); n += 1) {
    const silenced = off.has(n) || (solo.length > 0 && !solo.includes(n));
    tracks.push(silenced ? 0 : clampGain(gainOf(setting, n)));
  }
  return {
    click: clickOn(setting, trackCount > 0) ? clampGain(setting.mix.click) : 0,
    // The count-in always counts, at whatever level the click's own fader is
    // set to (W34 item 7). A count-in you cannot hear is not one, and this is
    // the one thing the click being off must not take with it.
    countIn: clampGain(setting.mix.click),
    tracks,
  };
}

/** One fader's value, or the default for a track nobody has touched. */
export function gainOf(setting: SongMixSetting, lane: SongLane): number {
  if (lane === "click") return setting.mix.click;
  const value = setting.mix.tracks[lane];
  return typeof value === "number" && Number.isFinite(value) ? value : DEFAULT_TRACK_MIX;
}

/** Set one fader, leaving the others, the mutes and the solos alone. */
export function withGain(
  setting: SongMixSetting,
  lane: SongLane,
  value: number,
): SongMixSetting {
  if (lane === "click") {
    // Moving the click's fader is saying something about the click, so the
    // song stops taking the default from here on (W34 item 7).
    return { ...setting, clickChosen: true, mix: { ...setting.mix, click: clampGain(value) } };
  }
  const tracks = [...setting.mix.tracks];
  while (tracks.length <= lane) tracks.push(DEFAULT_TRACK_MIX);
  tracks[lane] = clampGain(value);
  return { ...setting, mix: { ...setting.mix, tracks } };
}

/** Turn one lane off, or back on. */
export function withMute(
  setting: SongMixSetting,
  lane: SongLane,
  muted: boolean,
): SongMixSetting {
  const without = setting.muted.filter((id) => id !== lane);
  const next = { ...setting, muted: muted ? [...without, lane] : without };
  // ...and so is the switch. From here the song keeps what the player chose.
  return lane === "click" ? { ...next, clickChosen: true } : next;
}

/** Solo one track, or take it out of the solo. */
export function withSolo(
  setting: SongMixSetting,
  track: number,
  soloed: boolean,
): SongMixSetting {
  const without = setting.soloed.filter((id) => id !== track);
  return { ...setting, soloed: soloed ? [...without, track] : without };
}

/**
 * The faders a file arrives with.
 *
 * Everything at the level the arrangement was written at, and the player's
 * own part a few dB under it — which is what a guide is, and the one place
 * in Songs where the app has an opinion about a level. Called once, when a
 * song is opened and nothing was stored for it.
 */
export function startingMix(tracks: SongBackingTrack[]): number[] {
  return tracks.map((t) => (t.guide ? GUIDE_TRACK_MIX : DEFAULT_TRACK_MIX));
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
      // A band stored before W28 was four named lanes; there is no honest way
      // to map "the drums row" onto "the file's third track", so the faders
      // come back at the default and only the click — which meant the same
      // thing in both — is kept. A level is a thing you set in five seconds;
      // a level silently applied to the wrong instrument is not.
      tracks: Array.isArray(mix.tracks)
        ? mix.tracks.slice(0, MAX_SONG_TRACKS).map((v) => gain(v, DEFAULT_TRACK_MIX))
        : [],
    },
    muted: Array.isArray(raw.muted)
      ? raw.muted.filter(
          (lane): lane is SongLane =>
            lane === "click" ||
            (typeof lane === "number" && Number.isInteger(lane) && lane >= 0 && lane < MAX_SONG_TRACKS),
        )
      : [],
    soloed: Array.isArray(raw.soloed)
      ? raw.soloed.filter(
          (n): n is number =>
            typeof n === "number" && Number.isInteger(n) && n >= 0 && n < MAX_SONG_TRACKS,
        )
      : [],
    countInBars:
      typeof raw.countInBars === "number" && raw.countInBars >= 0 && raw.countInBars <= 2
        ? Math.round(raw.countInBars)
        : 0,
    // Only an explicit `true` records. Anything else a hand-edited file or an
    // older build can hold — missing, `"yes"`, `1` — leaves the microphone
    // alone, which is the only default a switch like this may have.
    takes: raw.takes === true,
    // W21 — and the same rule, for the same reason. Only an explicit `true`
    // opens a camera; a hand-edited file holding `"yes"` does not.
    camera: raw.camera === true,
    selection: readSelection(raw.selection),
    loop: raw.loop === true,
    tempoPercent:
      typeof raw.tempoPercent === "number" && Number.isFinite(raw.tempoPercent)
        ? Math.min(100, Math.max(50, Math.round(raw.tempoPercent)))
        : 100,
    portions: readPortions(raw.portions),
    // Only an explicit `true` counts as a decision, which is what makes every
    // song stored before W34 take the new default (item 7).
    clickChosen: raw.clickChosen === true,
    // Anything a hand-edited file or an older build can hold falls to the
    // recorded kit, which is what every song played before this existed.
    drums: raw.drums === "file" ? "file" : "kit",
  };
}

/**
 * A stored selection, or null.
 *
 * Not clamped to the song here: this file has no score, and a selection that
 * points past the end of a song whose file was replaced is held inside it by
 * `clampSelection` at the moment it is used. What it must not do is come back
 * as `{ startBar: NaN }`, which is a loop the engine would never leave.
 */
function readSelection(stored: unknown): { startBar: number; endBar: number } | null {
  const raw = stored as { startBar?: unknown; endBar?: unknown } | null | undefined;
  if (!raw || typeof raw !== "object") return null;
  const bar = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
  const start = bar(raw.startBar);
  const end = bar(raw.endBar);
  if (start === null || end === null) return null;
  return { startBar: Math.min(start, end), endBar: Math.max(start, end) };
}

/** The named portions, dropping any row that is not one. */
function readPortions(stored: unknown): SavedPortion[] {
  if (!Array.isArray(stored)) return [];
  const out: SavedPortion[] = [];
  for (const row of stored) {
    if (!row || typeof row !== "object") continue;
    const { id, name } = row as { id?: unknown; name?: unknown };
    const range = readSelection(row);
    if (typeof id !== "string" || typeof name !== "string" || !name.trim() || !range) continue;
    const percent = (row as { tempoPercent?: unknown }).tempoPercent;
    out.push({
      id,
      name: name.trim().slice(0, 24),
      startBar: range.startBar,
      endBar: range.endBar,
      tempoPercent:
        typeof percent === "number" && Number.isFinite(percent)
          ? Math.min(100, Math.max(50, Math.round(percent)))
          : 100,
    });
    if (out.length >= MAX_SAVED_PORTIONS) break;
  }
  return out;
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
