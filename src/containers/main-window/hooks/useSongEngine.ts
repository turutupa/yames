/**
 * Play means the song.
 *
 * Until this existed, pressing Play on a song started the ordinary metronome
 * at one tempo for the whole pass — which is only the truth for a piece in one
 * meter that never speeds up. The engine has had a song mode since
 * `plans/tasks/songs/W9-ENGINE-SONG.md`; this is the traffic that uses it.
 *
 * Three rules shape everything below, and each one is a thing that went wrong
 * somewhere else in this app first:
 *
 * - **One mode at a time.** Loading a song takes the band away on the Rust
 *   side, so this must take the song away when the player leaves Songs — or
 *   the Metronome tab would go on following a score nobody is looking at. The
 *   jam does the same in `useJamSession`, and for the same reason.
 * - **A range change is a recompile, so it is debounced.** The bar fields are
 *   number inputs and fire per keystroke; typing "24" into the end bar would
 *   otherwise compile the piece twice, once for bar 2.
 * - **The fader is not the range.** A mix crosses to the audio callback behind
 *   a generation counter and costs nothing, so it is sent as it moves, live,
 *   which is what `JAM_UX_DECISIONS.md` A13 means by putting it on the stage.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  SONG_SOUND_FONT_KEY,
  clearSong,
  loadSong,
  onSongDropped,
  setSongMix,
  setSongRange,
  setSongSoundFont,
  storeLoad,
} from "../../../ipc";
import type { SongLoaded } from "../../../ipc";
import {
  DEFAULT_MIX_SETTING,
  engineMix,
  loadMixSetting,
  saveMixSetting,
  startingMix,
  withGain,
  withMute,
  withSolo,
} from "../../../songs/songEngine";
import type { SongLane, SongMixSetting } from "../../../songs/songEngine";
import type { BarRange } from "../../../songs/schedule";
import { MAX_COUNT_IN_BARS } from "../../../songs/types";
import type { SongBackingTrack, SongScore } from "../../../songs/types";

/**
 * The importer, loaded when a song is opened rather than when the app starts.
 *
 * Same reason `useSongsSession` and `SongsView` both do it: `songs/import.ts`
 * pulls alphaTab in with it, and a player who never opens Songs should never
 * download it. By the time this runs the tab is being drawn, so the chunk is
 * already on its way.
 */
const importerModule = () => import("../../../songs/import");

/** How long the range fields may be typed in before the piece is rebuilt. */
const REBUILD_DEBOUNCE_MS = 250;

/**
 * How soon a second `song-dropped` counts as the same trouble.
 *
 * The event says nothing about why it fired, because on the engine's side
 * there is nothing more to say. Two causes reach it: the audio device
 * changed, which a reload fixes, and a jam started, which a reload would
 * fight. Reloading once and refusing to reload again inside this window is
 * how the first is handled without the second becoming a loop.
 */
const RELOAD_GUARD_MS = 4000;

/** The band a file turned out to have, and what it could not bring. */
type Band = { tracks: SongBackingTrack[]; leftOut: string[] };

export interface SongEngine {
  /** The faders, the mutes and the count-in, as this song was left. */
  mixSetting: SongMixSetting;
  setGain: (lane: SongLane, value: number) => void;
  setMute: (lane: SongLane, muted: boolean) => void;
  /** Hear one track on its own, or stop. Tracks only; the click is not soloed. */
  setSolo: (track: number, soloed: boolean) => void;
  setCountInBars: (bars: number) => void;
  /** Turn recording on or off for the loaded song. Remembered per song. */
  setTakes: (takes: boolean) => void;
  /** W21 — and the camera, the same way. Opens nothing; it is a switch. */
  setCamera: (camera: boolean) => void;
  /** Write the portion, the repeat, the speed or the saved portions. */
  setStageSetting: (
    patch: Partial<Pick<SongMixSetting, "selection" | "loop" | "tempoPercent" | "portions">>,
  ) => void;
  /**
   * Every track of the file, in the file's own order, with its name, its
   * role and whether it is the part being learned. The band strip draws one
   * fader per entry, and `mixSetting.mix.tracks[n]` is that entry's level.
   */
  tracks: SongBackingTrack[];
  /** Tracks in the file this band has nobody to play, by name. */
  leftOut: string[];
  /** What the engine made of the song, or null before it has been told. */
  loaded: SongLoaded | null;
  /** What the engine had to say, or null. Separate from an import failure. */
  engineError: SongEngineTrouble | null;
  dismissEngineError: () => void;
}

/**
 * What went wrong with the sound, in the two shapes it comes in.
 *
 * A kind rather than a sentence, so the words live in the locales where the
 * rest of the mode's words live. `detail` is the engine's own line when it
 * refused a piece — English, from Rust, and shown under the sentence rather
 * than instead of it.
 */
export type SongEngineTrouble =
  /** The engine would not take the song. */
  | { kind: "load"; detail?: string }
  /** It let go of it twice over, so something else has the sound. */
  | { kind: "busy" };

export type SongEngineInput = {
  /** The tab the window is on. Songs holds the engine; nothing else does. */
  view: string;
  score: SongScore | null;
  /** The file's bytes, for the band. Null while a song has none stored. */
  source: Uint8Array | null;
  range: BarRange;
  loop: boolean;
  tempoPercent: number;
};

export function useSongEngine({
  view,
  score,
  source,
  range,
  loop,
  tempoPercent,
}: SongEngineInput): SongEngine {
  const [mixSetting, setMixSetting] = useState<SongMixSetting>(DEFAULT_MIX_SETTING);
  const [band, setBand] = useState<Band | null>(null);
  const [loaded, setLoaded] = useState<SongLoaded | null>(null);
  const [engineError, setEngineError] = useState<SongEngineTrouble | null>(null);
  /** Bumped by `song-dropped` so the send effect runs again. */
  const [reloads, setReloads] = useState(0);

  const songId = score?.id ?? null;
  const onSongs = view === "songs";

  // --- the band from the file ---------------------------------------------
  //
  // Parsed once per song, not once per range: the other tracks of a file do
  // not change when you decide to loop bars 17 to 24, and re-reading a
  // megabyte of Guitar Pro to find that out would be a parse per keystroke.
  useEffect(() => {
    if (!score || !source || source.length === 0) {
      setBand(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const importer = await importerModule();
        const parsed = importer.parseSongFile(source, score.source.fileName);
        const built = importer.buildBacking(parsed, score.source.trackIndex);
        if (!cancelled) setBand({ tracks: built.backing.tracks, leftOut: built.leftOut });
      } catch {
        // A file we cannot re-read is a song with no band, not a song that
        // will not play: the score is already imported and the click still
        // keeps time. Nothing is said, because there is nothing the player
        // could do about it that they have not already done.
        if (!cancelled) setBand({ tracks: [], leftOut: [] });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [score, source]);

  // --- what this song's band was left at ----------------------------------
  useEffect(() => {
    if (!songId) {
      setMixSetting(DEFAULT_MIX_SETTING);
      return;
    }
    let cancelled = false;
    void loadMixSetting(songId).then((setting) => {
      if (!cancelled) setMixSetting(setting);
    });
    return () => {
      cancelled = true;
    };
  }, [songId]);

  /**
   * The sound set the player chose, told to the engine once.
   *
   * Here rather than in Settings alone, because Settings is a screen most
   * players open once: the engine is a fresh process every launch and has to
   * be told again. It is a path and a string comparison — the decode happens
   * when a piece is compiled, and only when the path has actually changed.
   */
  useEffect(() => {
    void storeLoad<string>(SONG_SOUND_FONT_KEY)
      .then((path) => setSongSoundFont(typeof path === "string" && path ? path : null))
      .catch(() => {});
  }, []);

  /**
   * The faders a song that has never been mixed arrives with.
   *
   * Written when the band is known and nothing was stored for it, because
   * the one level the app has an opinion about — the player's own part, a few
   * dB under the rest — cannot be known before the file has been read. It is
   * not saved: a fader nobody has touched is a default, and a default that
   * has been written down is a default that can never be changed again.
   */
  useEffect(() => {
    if (!band || band.tracks.length === 0) return;
    setMixSetting((current) =>
      current.mix.tracks.length > 0
        ? current
        : { ...current, mix: { ...current.mix, tracks: startingMix(band.tracks) } },
    );
  }, [band]);

  /**
   * What the engine is holding: which song, and at which settings.
   *
   * A ref and not state, because it is written from inside the effect that
   * reads it — keeping it in state would re-run the effect that set it.
   */
  const heldRef = useRef<{ songId: string; key: string } | null>(null);
  const reloadedAtRef = useRef(0);
  const onSongsRef = useRef(onSongs);
  onSongsRef.current = onSongs;

  const settingsKey = JSON.stringify([
    range.startBar,
    range.endBar,
    loop,
    tempoPercent,
    mixSetting.countInBars,
  ]);

  useEffect(() => {
    if (!onSongs || !score || band === null) {
      // Leaving the mode, or closing the song. The engine goes back to the
      // plain click, and `clear_song` is synchronous on the Rust side because
      // dropping the table is a `free()` that belongs on the command thread.
      if (heldRef.current) {
        heldRef.current = null;
        setLoaded(null);
        void clearSong().catch(() => {});
      }
      return;
    }

    const held = heldRef.current;
    if (held && held.songId === score.id && held.key === settingsKey) return;

    const timer = setTimeout(() => {
      void (async () => {
        try {
          const importer = await importerModule();
          const sameSong = heldRef.current?.songId === score.id;
          heldRef.current = { songId: score.id, key: settingsKey };
          const options = {
            loops: loop,
            tempoPercent,
            countInBars: mixSetting.countInBars,
          };
          const transport = importer.buildTransport(score, range, options);
          // A range or a speed change on a song the engine already holds is
          // a rebuild of the same piece, and `set_song_range` is that without
          // the backing crossing the wire again.
          const result = sameSong
            ? await setSongRange(
                transport.range,
                transport.loops,
                transport.tempoPercent,
                transport.countInBars,
              )
            : await loadSong(transport, band.tracks.length > 0 ? { tracks: band.tracks } : null);
          setLoaded(result ?? null);
          setEngineError(null);
          // The mix is not part of the table, so it has to be said again
          // whenever a new one arrives.
          void setSongMix(engineMix(mixSetting, band.tracks.length)).catch(() => {});
        } catch (err) {
          heldRef.current = null;
          setLoaded(null);
          const detail =
            typeof err === "string" ? err : err instanceof Error ? err.message : undefined;
          setEngineError({ kind: "load", ...(detail ? { detail } : {}) });
        }
      })();
    }, REBUILD_DEBOUNCE_MS);

    return () => clearTimeout(timer);
    // `settingsKey` is every field of the send, in one string; listing them
    // again would be two spellings of one dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSongs, score, band, settingsKey, reloads]);

  /** On the way out of the window entirely, the engine still lets go. */
  useEffect(() => {
    return () => {
      if (heldRef.current) {
        heldRef.current = null;
        void clearSong().catch(() => {});
      }
    };
  }, []);

  // --- the mix, live ------------------------------------------------------
  //
  // Sent as it moves. Four floats cross to the audio callback behind their
  // own generation counter and recompile nothing, so a hand on a fader costs
  // the engine nothing and a musician hears the change on the next buffer.
  const trackCount = band?.tracks.length ?? 0;
  const gains = useMemo(() => engineMix(mixSetting, trackCount), [mixSetting, trackCount]);
  useEffect(() => {
    if (!heldRef.current) return;
    void setSongMix(gains).catch(() => {});
  }, [gains]);

  // --- the engine let go --------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    const unlisten = onSongDropped(() => {
      if (cancelled) return;
      // Whatever the cause, the engine is not holding it any more.
      heldRef.current = null;
      setLoaded(null);
      if (!onSongsRef.current) return;
      const since = Date.now() - reloadedAtRef.current;
      if (since < RELOAD_GUARD_MS) {
        // Twice in four seconds is not a device settling down. Something
        // else has the engine, and loading again would be a tug of war.
        setEngineError({ kind: "busy" });
        return;
      }
      reloadedAtRef.current = Date.now();
      setReloads((n) => n + 1);
    });
    return () => {
      cancelled = true;
      void unlisten.then((un) => un());
    };
  }, []);

  // --- what the stage shows -----------------------------------------------
  // THE FILE'S OWN ORDER, and not a playing order (W28). It was drums, bass,
  // keys, because those were the only three rows a song could have. A file's
  // tracks are laid out by whoever wrote it and the tab is drawn in that
  // order, so a strip that sorted them would be a strip whose second fader is
  // not the tab's second staff.
  const tracks = useMemo(() => band?.tracks ?? [], [band]);

  const setGain = useCallback(
    (lane: SongLane, value: number) =>
      setMixSetting((current) => {
        const next = withGain(current, lane, value);
        if (songId) void saveMixSetting(songId, next).catch(() => {});
        return next;
      }),
    [songId],
  );

  const setMute = useCallback(
    (lane: SongLane, muted: boolean) =>
      setMixSetting((current) => {
        const next = withMute(current, lane, muted);
        if (songId) void saveMixSetting(songId, next).catch(() => {});
        return next;
      }),
    [songId],
  );

  /**
   * Hear one track on its own.
   *
   * Additive: soloing a second track hears both, which is what a solo button
   * on a mixer does and what somebody checking a two-guitar harmony wants.
   * It never touches the mutes, so clearing a solo gives back the band the
   * player had rather than the band the app assumed.
   */
  const setSolo = useCallback(
    (track: number, soloed: boolean) =>
      setMixSetting((current) => {
        const next = withSolo(current, track, soloed);
        if (songId) void saveMixSetting(songId, next).catch(() => {});
        return next;
      }),
    [songId],
  );

  const setCountInBars = useCallback(
    (bars: number) =>
      setMixSetting((current) => {
        const next = {
          ...current,
          countInBars: Math.min(MAX_COUNT_IN_BARS, Math.max(0, Math.round(bars))),
        };
        if (songId) void saveMixSetting(songId, next).catch(() => {});
        return next;
      }),
    [songId],
  );

  /**
   * Record takes of this song, or stop.
   *
   * Stored beside the band because it is the same kind of fact — something
   * the player decided about this piece — and because a second store key for
   * one boolean is a second thing to keep in step. The microphone is never
   * opened by this: it is a switch, and `useSongTakes` is what acts on it.
   */
  const setTakes = useCallback(
    (takes: boolean) =>
      setMixSetting((current) => {
        const next = { ...current, takes };
        if (songId) void saveMixSetting(songId, next).catch(() => {});
        return next;
      }),
    [songId],
  );

  /**
   * W21 — record the picture of this song as well.
   *
   * `setTakes`'s twin, stored in the same record for the same reasons, and
   * exactly as inert: no camera is opened by this. It is a switch, and
   * `useSongCamera` is what acts on it.
   */
  const setCamera = useCallback(
    (camera: boolean) =>
      setMixSetting((current) => {
        const next = { ...current, camera };
        if (songId) void saveMixSetting(songId, next).catch(() => {});
        return next;
      }),
    [songId],
  );

  /**
   * Write down how the player has this song set up: the portion, the repeat,
   * the speed, and the portions they have named.
   *
   * One writer for the four rather than four, because they move together —
   * choosing a saved portion sets a selection, a loop and a tempo in one
   * gesture, and three separate writes would be three saves and two moments
   * where the file on disk says something nobody chose.
   */
  const setStageSetting = useCallback(
    (patch: Partial<Pick<SongMixSetting, "selection" | "loop" | "tempoPercent" | "portions">>) =>
      setMixSetting((current) => {
        const next = { ...current, ...patch };
        if (songId) void saveMixSetting(songId, next).catch(() => {});
        return next;
      }),
    [songId],
  );

  return {
    mixSetting,
    setGain,
    setMute,
    setSolo,
    setCountInBars,
    setTakes,
    setCamera,
    setStageSetting,
    tracks,
    leftOut: band?.leftOut ?? [],
    loaded,
    engineError,
    dismissEngineError: useCallback(() => setEngineError(null), []),
  };
}
