/**
 * The Songs mode's state — the library, the loaded song, and the range.
 *
 * Shaped after `useJamSession`: the container owns the list and the selection,
 * the view is given them, and the store is one `await` away behind
 * `src/songs/library.ts`.
 *
 * Nothing here runs a clock. The cursor's tick comes from the engine's beat
 * events, through `MainWindow`, and this hook only says which bars the engine
 * is meant to be inside.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addSong,
  decodeSource,
  deleteSong as deleteFromList,
  newSongRecord,
  renameSong as renameInList,
  songLibrary,
} from "../../../songs/library";
import type { SongLibrary, SongRecord } from "../../../songs/library";
import { buildSchedule, clampRange, rangeTempo, wholeSong } from "../../../songs/schedule";
import { loadScoreSchedule, markScoreOpened } from "../../../ipc";
/**
 * The importer is loaded when a file arrives, not when the app starts.
 *
 * `songs/import.ts` pulls alphaTab in with it — 0.27 MB gzipped — and the
 * Songs library, the schedule and this hook are all useful without it. Only
 * opening a file and drawing a tab need the renderer, and both are things the
 * player does deliberately. `SongsView` splits the tab itself the same way.
 */
const importerModule = () => import("../../../songs/import");
type Importer = Awaited<ReturnType<typeof importerModule>>;
import type { ParsedSong, SongImportWarning, SongTrackChoice } from "../../../songs/import";
import type { BarRange } from "../../../songs/schedule";
import type { SongScore } from "../../../songs/types";
import { forgetMixSetting, loadMixSetting, rememberPlace } from "../../../songs/songEngine";
import { useSongEngine } from "./useSongEngine";
import type { SongEngine } from "./useSongEngine";

/** A file read and waiting for the player to pick a track (`SONGS.md` A3). */
export type PendingImport = {
  parsed: ParsedSong;
  bytes: Uint8Array;
  tracks: SongTrackChoice[];
};

export interface SongsSession extends SongEngine {
  songs: SongRecord[];
  song: SongRecord | null;
  score: SongScore | null;
  /** The file's bytes, for the renderer. */
  source: Uint8Array | null;
  range: BarRange;
  loop: boolean;
  tempoPercent: number;
  /** The tempo the click should run at: the range's own tempo, scaled. */
  tempo: number;
  pending: PendingImport | null;
  warnings: SongImportWarning[];
  /** A sentence to show the player, or null. */
  error: string | null;
  loadSong: (id: string) => void;
  offerFile: (file: File) => Promise<void>;
  chooseTrack: (trackIndex: number) => Promise<void>;
  cancelImport: () => void;
  renameSong: (id: string, name: string) => void;
  deleteSong: (id: string) => void;
  setRange: (range: BarRange) => void;
  setLoop: (loop: boolean) => void;
  setTempoPercent: (percent: number) => void;
  dismissError: () => void;
  /** Hand the current range to the engine. No-ops until W1's command lands. */
  pushSchedule: () => Promise<boolean>;
}

/**
 * What the hook needs from the window around it.
 *
 * Only the tab, and only because the engine can hold one mode at a time: the
 * song has to be taken off the engine when the player walks to the Metronome,
 * or the click there would go on following a score nobody is looking at. The
 * jam takes the same single field for the same reason.
 */
export type SongsSessionOptions = { view?: string };

export function useSongsSession(
  library: SongLibrary = songLibrary,
  { view = "songs" }: SongsSessionOptions = {},
): SongsSession {
  const [songs, setSongs] = useState<SongRecord[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [range, setRangeState] = useState<BarRange>({ startBar: 0, endBar: 0 });
  const [loop, setLoop] = useState(false);
  const [tempoPercent, setTempoPercentState] = useState(100);
  const [pending, setPending] = useState<PendingImport | null>(null);
  const [warnings, setWarnings] = useState<SongImportWarning[]>([]);
  const [error, setError] = useState<string | null>(null);

  // The store is read once. Every later write goes through `commit`, which
  // keeps the screen and the file in step without a round trip per keystroke.
  const loaded = useRef(false);
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    void library.list().then(setSongs);
  }, [library]);

  const commit = useCallback(
    (next: SongRecord[]) => {
      setSongs(next);
      void library.save(next);
    },
    [library],
  );

  const song = useMemo(() => songs.find((s) => s.id === activeId) ?? null, [songs, activeId]);
  const score = song?.score ?? null;

  // Decoding base64 is not free and the bytes do not change while a song is
  // open, so it happens once per song rather than once per render.
  const source = useMemo(
    () => (song ? decodeSource(song.sourceBase64) : null),
    [song],
  );

  /**
   * Open a song, and put the player back where they left it (W19).
   *
   * The whole song, once through, at full speed is the state a song is
   * opened in for the first time — and then whatever the player left is read
   * back over it. Read rather than waited for: the tab is drawn from the
   * score and does not care, and a screen that sat blank for a store round
   * trip to restore a loop nobody had set would be a worse trade.
   *
   * The PORTION comes out of the same per-song setting but is written by
   * W18, who own the selection on the stage — `songEngine.ts` says so where
   * the field is declared, and `rememberPlace` below deliberately does not
   * touch it. The loop and the speed are this hook's.
   *
   * `markScoreOpened` is what moves the song to the top of the library on
   * the next read (migration four). Fire and forget: a library that comes
   * back in yesterday's order is not worth making anybody wait for, and it
   * is right again the moment the list is read.
   */
  const loadSong = useCallback(
    (id: string) => {
      const next = songs.find((s) => s.id === id);
      if (!next) return;
      setActiveId(id);
      setRangeState(wholeSong(next.score));
      setLoop(false);
      setTempoPercentState(100);
      setWarnings([]);
      void markScoreOpened(id).catch(() => {});
      void loadMixSetting(id)
        .then((place) => {
          // Still the same song: the player may have clicked another row
          // while the store was answering.
          setActiveId((current) => {
            if (current !== id) return current;
            if (place.range) setRangeState(clampRange(next.score, place.range));
            setLoop(place.loop);
            setTempoPercentState(place.tempoPercent);
            return current;
          });
        })
        .catch(() => {});
    },
    [songs],
  );

  /**
   * A file arrived — from the picker or from a drop.
   *
   * Read here rather than in the view because the view should not know that a
   * `File` is how a song gets in; if this ever becomes a Rust command handing
   * over a path, only this function changes.
   */
  const offerFile = useCallback(async (file: File) => {
    setError(null);
    let importer: Importer;
    try {
      importer = await importerModule();
    } catch {
      setError("Yames could not start its music reader. Restart the app and try again.");
      return;
    }
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const parsed = importer.parseSongFile(bytes, file.name);
      setPending({ parsed, bytes, tracks: importer.playableTracks(parsed) });
    } catch (err) {
      setError(
        err instanceof importer.SongImportError
          ? err.message
          : `Yames could not open ${file.name}. Try a Guitar Pro or MusicXML file.`,
      );
    }
  }, []);

  const chooseTrack = useCallback(
    async (trackIndex: number) => {
      if (!pending) return;
      const importer = await importerModule();
      try {
        const result = importer.buildSongScore(pending.parsed, trackIndex, pending.bytes);
        const record = newSongRecord(result.score, pending.bytes);
        const next = addSong(songs, record);
        commit(next);
        setPending(null);
        setActiveId(record.id);
        setRangeState(wholeSong(result.score));
        setLoop(false);
        setTempoPercentState(100);
        setWarnings(result.warnings);
      } catch (err) {
        setError(err instanceof importer.SongImportError ? err.message : String(err));
      }
    },
    [pending, songs, commit],
  );

  const cancelImport = useCallback(() => setPending(null), []);

  const renameSong = useCallback(
    (id: string, name: string) => commit(renameInList(songs, id, name)),
    [songs, commit],
  );

  const deleteSong = useCallback(
    (id: string) => {
      commit(deleteFromList(songs, id));
      // The song's band goes with it. A mix left behind would come back on
      // the day somebody imports the same file again, which is a surprise.
      void forgetMixSetting(id).catch(() => {});
      if (activeId === id) setActiveId(null);
    },
    [songs, commit, activeId],
  );

  const setRange = useCallback(
    (next: BarRange) => setRangeState(score ? clampRange(score, next) : next),
    [score],
  );

  /**
   * Looping, and remembered (W19).
   *
   * Only when a song is open: with none there is nothing to remember it
   * about, and writing an entry keyed on `null` would be a row in
   * `settings.json` for a song that does not exist.
   */
  const setLoopRemembered = useCallback(
    (next: boolean) => {
      setLoop(next);
      if (activeId) void rememberPlace(activeId, { loop: next }).catch(() => {});
    },
    [activeId],
  );

  /** 50–100 %, the range the brief fixed. A drill is where you climb. */
  const setTempoPercent = useCallback(
    (percent: number) => {
      const clamped = Math.max(50, Math.min(100, Math.round(percent)));
      setTempoPercentState(clamped);
      if (activeId) void rememberPlace(activeId, { tempoPercent: clamped }).catch(() => {});
    },
    [activeId],
  );

  const tempo = useMemo(
    () => (score ? rangeTempo(score, range, tempoPercent) : 120),
    [score, range, tempoPercent],
  );

  /**
   * Hand the engine the onsets it should expect.
   *
   * Resolves either way. A rejection means the command is not in this build
   * — which stopped being the normal case when W1 merged, but is still what a
   * downgraded or half-built binary does — and a Songs mode that plays and
   * scores nothing is a better one than a Songs mode whose Play button
   * throws. The boolean is what lets the review be honest about which
   * happened rather than showing a verdict on a pass nobody scored.
   */
  const pushSchedule = useCallback(async () => {
    if (!score) return false;
    try {
      await loadScoreSchedule(buildSchedule(score, range, { loops: loop }));
      return true;
    } catch (err) {
      console.warn("[yames] the engine would not take the song's schedule", err);
      return false;
    }
  }, [score, range, loop]);

  /**
   * The engine's half: the song on the click, the file's band, the faders.
   *
   * Its own hook because it is all effects and no list — this one owns the
   * library and the selection, that one owns what the engine is holding.
   */
  const engine = useSongEngine({ view, score, source, range, loop, tempoPercent });

  return {
    ...engine,
    songs,
    song,
    score,
    source,
    range,
    loop,
    tempoPercent,
    tempo,
    pending,
    warnings,
    error,
    loadSong,
    offerFile,
    chooseTrack,
    cancelImport,
    renameSong,
    deleteSong,
    setRange,
    setLoop: setLoopRemembered,
    setTempoPercent,
    dismissError: () => setError(null),
    pushSchedule,
  };
}
