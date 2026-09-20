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
import { loadScoreSchedule } from "../../../ipc";
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
import { dayOf, listSongDue, songDueNow } from "../../../songs/due";
import { addPortion, newPortionId, removePortion, renamePortion } from "../../../songs/selection";
import type { SavedPortion } from "../../../songs/selection";
import type { SongScore } from "../../../songs/types";
import { forgetMixSetting } from "../../../songs/songEngine";
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
  /**
   * The bars the engine is playing: the selection, or the whole song.
   *
   * Derived and not stored. There is one idea of what is chosen — `selection`
   * — and everything that used to read a range goes on reading one.
   */
  range: BarRange;
  /**
   * The portion the player picked out, or null for the whole song.
   *
   * The centre of the mode (`selection.ts`): dragging on the tab, typing two
   * bar numbers, pressing a section chip and pressing a footswitch all write
   * this and nothing else.
   */
  selection: BarRange | null;
  loop: boolean;
  tempoPercent: number;
  /** The tempo the click should run at: the range's own tempo, scaled. */
  tempo: number;
  /** Portions of this song the player named and kept. */
  portions: SavedPortion[];
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
  /**
   * Choose a portion. Choosing one turns the repeat ON.
   *
   * That is the owner's rule and it is what makes the feature one gesture
   * rather than two: *"being able to select a portion of a song so it plays
   * that portion in repeat"*. `null` clears back to the whole song and stops
   * the repeat, which is what "Whole song" presses.
   */
  setRange: (range: BarRange | null) => void;
  /** Same thing, named for what it is at the call sites that are about it. */
  setSelection: (range: BarRange | null) => void;
  clearSelection: () => void;
  setLoop: (loop: boolean) => void;
  setTempoPercent: (percent: number) => void;
  /** Keep the portion on screen under a name, beside the section chips. */
  savePortion: (name: string) => void;
  renamePortion: (id: string, name: string) => void;
  deletePortion: (id: string) => void;
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
  const [selection, setSelectionState] = useState<BarRange | null>(null);
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

  const loadSong = useCallback(
    (id: string) => {
      const next = songs.find((s) => s.id === id);
      if (!next) return;
      setActiveId(id);
      // Cleared, not carried: the portion this song was left on comes back
      // from the store a moment later (see the effect below), and carrying
      // the last song's bars across in the meantime would loop bars 17–24 of
      // a piece that has nine.
      setSelectionState(null);
      setLoop(false);
      setTempoPercentState(100);
      setWarnings([]);
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
        setSelectionState(null);
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

  /**
   * The engine plays the selection, or the whole song when there is none.
   *
   * The one place the two ideas meet. Everything downstream — the schedule,
   * the transport, the cursor, the review — goes on being handed a range and
   * never learns that "nothing selected" is a state.
   */
  const range = useMemo<BarRange>(
    () => (score ? (selection ? clampRange(score, selection) : wholeSong(score)) : { startBar: 0, endBar: 0 }),
    [score, selection],
  );

  /**
   * Choose a portion — and choosing one starts the repeat.
   *
   * The owner's rule, and the reason this is one gesture: *"being able to
   * select a portion of a song so it plays that portion in repeat is super
   * critical for song learning"*. Nobody drags out eight bars in order to
   * play them once.
   *
   * `null` clears back to the whole song and stops the repeat — the whole
   * song on a loop is a thing you can still ask for with the repeat switch,
   * but it is not what pressing "Whole song" means.
   */
  const setSelection = useCallback(
    (next: BarRange | null) => {
      if (!next) {
        setSelectionState(null);
        setLoop(false);
        return;
      }
      setSelectionState(score ? clampRange(score, next) : next);
      setLoop(true);
    },
    [score],
  );

  const clearSelection = useCallback(() => setSelection(null), [setSelection]);

  /** 50–100 %, the range the brief fixed. A drill is where you climb. */
  const setTempoPercent = useCallback(
    (percent: number) => setTempoPercentState(Math.max(50, Math.min(100, Math.round(percent)))),
    [],
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

  /**
   * Come back to the passage you left off on.
   *
   * The store answers a moment after the song is chosen, and this is the one
   * frame where what it says wins. `restoredFor` makes it once per song and
   * not once per read: without it the effect would fight every later change —
   * you drag out bars 5–8, the setting saves, the setting comes back, and the
   * selection is put back to what it was a second ago.
   */
  const restoredFor = useRef<string | null>(null);
  useEffect(() => {
    const id = song?.id ?? null;
    if (!id || !score) {
      restoredFor.current = null;
      return;
    }
    if (restoredFor.current === id) return;
    // The engine's setting for a song is DEFAULT_MIX_SETTING until its own
    // read lands, so waiting for a non-default selection is not an option —
    // a song genuinely left on the whole song has none. What says the read
    // has happened is the engine reporting a setting for THIS song at all,
    // which it does by way of the effect that loads it.
    restoredFor.current = id;
    const stored = engine.mixSetting;
    if (stored.selection) setSelectionState(clampRange(score, stored.selection));
    setLoop(stored.loop);
    setTempoPercentState(stored.tempoPercent);

    /*
     * And a promise that has fallen due wins over where you left off.
     *
     * `COACH_UX.md` C2: at most a few things, each one tap to start. The tap
     * is the song's own row in the library — the mark beside its name is
     * what the coach promised — so opening it has to arrive at the passage
     * that was promised, repeating, at the speed the promise was made at. It
     * is the same three things `loopBars` sets when the button in the review
     * is pressed, because it is the same offer made a day later.
     *
     * It arrives a moment after the stored setting because the store is a
     * round trip; `restoredFor` is checked again on the way back so a player
     * who has already moved on to another song is not dragged into this
     * one's bars.
     */
    let alive = true;
    void listSongDue()
      .then((items) => {
        if (!alive || restoredFor.current !== id) return;
        const waiting = songDueNow(items, id, dayOf());
        if (!waiting) return;
        setSelectionState(
          clampRange(score, { startBar: waiting.startBar, endBar: waiting.endBar }),
        );
        setLoop(true);
        if (waiting.tempoPercent !== undefined) setTempoPercentState(waiting.tempoPercent);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
    // `engine.mixSetting` is read, not depended on: this runs when the SONG
    // changes, and reads whatever the store has said by then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song?.id, score]);

  /**
   * And write it down again as it changes.
   *
   * Only for the song it belongs to, and only once it has been restored —
   * otherwise the first render of a newly chosen song would save the cleared
   * selection over the one in the file before the read came back.
   */
  const { setStageSetting } = engine;
  useEffect(() => {
    if (!song?.id || restoredFor.current !== song.id) return;
    setStageSetting({ selection, loop, tempoPercent });
  }, [song?.id, selection, loop, tempoPercent, setStageSetting]);

  const portions = engine.mixSetting.portions;

  const savePortion = useCallback(
    (name: string) => {
      const trimmed = name.trim().slice(0, 24);
      if (!trimmed || !selection) return;
      setStageSetting({
        portions: addPortion(portions, {
          id: newPortionId(),
          name: trimmed,
          startBar: selection.startBar,
          endBar: selection.endBar,
          tempoPercent,
        }),
      });
    },
    [portions, selection, tempoPercent, setStageSetting],
  );

  const renamePortionById = useCallback(
    (id: string, name: string) => setStageSetting({ portions: renamePortion(portions, id, name) }),
    [portions, setStageSetting],
  );

  const deletePortion = useCallback(
    (id: string) => setStageSetting({ portions: removePortion(portions, id) }),
    [portions, setStageSetting],
  );

  return {
    ...engine,
    songs,
    song,
    score,
    source,
    range,
    selection,
    loop,
    tempoPercent,
    tempo,
    portions,
    pending,
    warnings,
    error,
    loadSong,
    offerFile,
    chooseTrack,
    cancelImport,
    renameSong,
    deleteSong,
    // One writer under two names. `setRange` is what the coach's actions and
    // the review already call; `setSelection` is what the stage calls, and it
    // is the name that says what it does.
    setRange: setSelection,
    setSelection,
    clearSelection,
    setLoop,
    setTempoPercent,
    savePortion,
    renamePortion: renamePortionById,
    deletePortion,
    dismissError: () => setError(null),
    pushSchedule,
  };
}
