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
  addSongPart,
  decodeSource,
  deleteSong as deleteFromList,
  newSongRecord,
  renameSong as renameInList,
  songLibrary,
} from "../../../songs/library";
import type { SongLibrary, SongRecord } from "../../../songs/library";
// W35 — the sidebar lists FILES. Each part of a file keeps its own record;
// this is the module that knows which records are the same piece of music.
import { groupByFile, migrateSongNames } from "../../../songs/songFiles";
import type { LibrarySong } from "../../../songs/songFiles";
import {
  NO_PLAYHEAD,
  barOfTick,
  clampTick,
  giveUpWaiting,
  goTo as goToTick,
  onReport as playheadOnReport,
  pauseAt as playheadPauseAt,
  playheadTick as playheadTickOf,
  rangeStartTick,
  tickOfBar,
  toStart as playheadToStart,
  BELIEVE_MS,
} from "../../../songs/playhead";
import type { PlayheadState } from "../../../songs/playhead";
import type { BeatPosition } from "../../../songs/position";
import { buildSchedule, clampRange, rangeTempo, wholeSong } from "../../../songs/schedule";
import { loadScoreSchedule, markScoreOpened, seekSong } from "../../../ipc";
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
import {
  addPortion,
  clampSelection,
  clickClearsPortion,
  newPortionId,
  removePortion,
  renamePortion,
} from "../../../songs/selection";
import type { SavedPortion } from "../../../songs/selection";
import type { SongScore } from "../../../songs/types";
import { forgetMixSetting } from "../../../songs/songEngine";
// W19 — the shelf Yames ships with. The pieces and the importer are both
// loaded lazily inside it; this module is a few dozen lines.
import { markStarterSeeded, seedStarterShelf } from "../../../songs/starter/shelf";
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
  /**
   * The library as the sidebar lists it: one entry per FILE (W35).
   *
   * `songs` is still every record — the stage, the takes and the coach all
   * work in parts — and this is the same list grouped. The owner: *"on the
   * left side it's for songs, and then when in a song, in the stage area i
   * should be able to select the instrument"*.
   */
  songFiles: LibrarySong[];
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
   * The bars the PORTION covers — the selection, or the whole song.
   *
   * `range` is what plays and is where the playhead has put it; this is what
   * the player chose. The two are the same until somebody clicks a bar, and
   * the strip's fields, the band on the tab and everything that says "what am
   * I working on" read this one (W29).
   */
  portion: BarRange;
  /**
   * WHERE YOU ARE IN THE SONG, in the song's own ticks (W37 item 1).
   *
   * The one playhead. The cursor is drawn here, the next press of Play begins
   * here, the count-in counts into this bar, and a stop leaves it where the
   * music stopped. `songs/playhead.ts` is the whole of the rule.
   */
  playheadTick: number;
  /** The same place as a played bar, for the mark drawn on the page. */
  playFrom: number;
  /** Go to a bar. Clamped into what is playing; the portion is left alone. */
  seekTo: (playedBar: number) => void;
  /** Go to a tick. What `seekTo` is made of, for anything finer than a bar. */
  seekToTick: (tick: number) => void;
  /**
   * Back to the first bar of what is being played — the portion's, or the
   * song's (W37 item 1). The button beside Play and the Home key.
   */
  backToStart: () => void;
  /**
   * The transport stopped, and a stop is a PAUSE: leave the playhead where
   * the music stopped. `tick` is where the line was; null leaves it alone.
   */
  pauseAt: (tick: number | null) => void;
  /**
   * The playhead the ENGINE has been told, in ticks.
   *
   * The same place, held still while the transport runs: a start the engine
   * is told is a recompile, and recompiling under a running pass would end
   * the attempt and raise the review. While it runs a click is a `seek_song`
   * instead, and this catches up on the stop.
   */
  engineStartTick: number;
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
  /**
   * Every track in the open song's file, for the header's instrument menu
   * (W29 item 2). Empty until the file has been read back, and for a song
   * whose bytes were never stored.
   */
  tracks: SongTrackChoice[];
  /**
   * Read a different track of the same file.
   *
   * A song's id is a hash of the bytes AND the track (`songId`), so each
   * track is its own row in the store with its own attempts, its own takes
   * and its own promises — which is exactly what "takes and history belong to
   * the track they were played on" asks for, and why there is no migration
   * here. This switches to that row, making it if it is new, and carries the
   * portion, the playhead and the speed across.
   */
  switchTrack: (trackIndex: number) => Promise<void>;
  pending: PendingImport | null;
  warnings: SongImportWarning[];
  /** A sentence to show the player, or null. */
  error: string | null;
  loadSong: (id: string) => void;
  offerFile: (file: File) => Promise<void>;
  chooseTrack: (trackIndex: number) => Promise<void>;
  cancelImport: () => void;
  /**
   * Rename and delete act on the SONG, so both take a FILE's key.
   *
   * A rename that touched one part would come back under its old name the
   * next time the player opened the other, and a delete that took one part
   * would leave the file behind under a row that no longer showed it.
   */
  renameSong: (fileKey: string, name: string) => void;
  deleteSong: (fileKey: string) => void;
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
export type SongsSessionOptions = {
  view?: string;
  /**
   * Is the transport running?
   *
   * A click on the tab means the same thing either side of it since W37 — it
   * moves the one playhead — but HOW the engine is told differs. Stopped, the
   * playhead is compiled into the piece, which the debounced rebuild does.
   * Playing, it is a `seek_song`: a recompile there would end the pass, and
   * ending a pass ends the attempt and raises the review (`COACH_UX.md` A3),
   * so the click would throw away the take the player was in the middle of.
   */
  isPlaying?: boolean;
  /**
   * What the engine last said about where it is (W37 item 1).
   *
   * The session owns the playhead, so the engine's reports have to reach it
   * rather than only the screen — otherwise "where we are" would be two
   * things again the moment the transport started.
   */
  beat?: BeatPosition | null;
};

export function useSongsSession(
  library: SongLibrary = songLibrary,
  { view = "songs", isPlaying = false, beat = null }: SongsSessionOptions = {},
): SongsSession {
  const [songs, setSongs] = useState<SongRecord[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selection, setSelectionState] = useState<BarRange | null>(null);
  const [loop, setLoop] = useState(false);
  const [tempoPercent, setTempoPercentState] = useState(100);
  /** The one playhead, in the song's own ticks (W37 item 1). */
  const [playhead, setPlayhead] = useState<PlayheadState>(NO_PLAYHEAD);
  const [pending, setPending] = useState<PendingImport | null>(null);
  const [warnings, setWarnings] = useState<SongImportWarning[]>([]);
  const [error, setError] = useState<string | null>(null);

  // The store is read once. Every later write goes through `commit`, which
  // keeps the screen and the file in step without a round trip per keystroke.
  const loaded = useRef(false);
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    void library.list().then(async (stored) => {
      /*
       * W35 — the part comes back out of the names W29 wrote it into.
       *
       * Here rather than in `library.ts` because it is a change of mind about
       * what a row is CALLED rather than about how one is stored, and because
       * this is the one place that reads the library at startup. It is a shape
       * test on each name, so it is idempotent; `migrateSongNames` returns the
       * same array when there is nothing to do, and only then is there
       * nothing to write.
       */
      const list = migrateSongNames(stored);
      setSongs(list);
      if (list !== stored) await library.save(list);
      /**
       * The shelf Yames ships with (W19, `SONGS.md` S0.9), on the first
       * launch and never again.
       *
       * After the list rather than instead of it: the screen shows whatever
       * is already there immediately, and the seven pieces arrive a moment
       * later on the one launch that needs them. The flag is written only
       * once the store has taken them, so a crash halfway means the next
       * launch tries again rather than a library that is permanently short.
       *
       * Deleting one is remembered, because the flag is a fact about this
       * installation and not about what the library currently holds.
       */
      const shelf = await seedStarterShelf();
      if (shelf.length === 0) return;
      const seeded = [...shelf].reverse().reduce((acc, record) => addSong(acc, record), list);
      setSongs(seeded);
      await library.save(seeded);
      await markStarterSeeded(shelf);
    });
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

  /** The library the sidebar draws: one entry per file (W35). */
  const songFiles = useMemo(() => groupByFile(songs), [songs]);

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
      setPlayhead(NO_PLAYHEAD);
      // Cleared, not carried: the portion this song was left on comes back
      // from the store a moment later (see the effect below), and carrying
      // the last song's bars across in the meantime would loop bars 17–24 of
      // a piece that has nine.
      setSelectionState(null);
      setLoop(false);
      setTempoPercentState(100);
      setWarnings([]);
      // W19 — the library is "what have I been playing" (migration four).
      // Fire and forget: a list that comes back in yesterday's order is not
      // worth making anybody wait for, and it is right the next time it is
      // read. The portion, the loop and the speed come back in the effect
      // below, which is the stage's, not this line's.
      void markScoreOpened(id).catch(() => {});
      /*
       * And the same fact, on the copy the screen reasons with (W35).
       *
       * The row the player pressed opens the part of the file that was open
       * last, and that answer comes from `openedAt`. Without this line it
       * would be right only after a restart: the store has the new time and
       * the list in memory still has yesterday's, so switching part and
       * coming back to the row would open the part you just left.
       *
       * Not through `commit`: the store is already being told by the line
       * above, and it is the store's own clock that counts.
       */
      setSongs((prev) =>
        prev.map((s) => (s.id === id ? { ...s, openedAt: Date.now() } : s)),
      );
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
        setPlayhead(NO_PLAYHEAD);
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

  /**
   * The tracks of the open file, read back once per song (W29 item 2).
   *
   * The header's menu has to list every part in the file, and a `SongScore`
   * knows only about the one that was chosen. The bytes are already in
   * memory, so this is a parse and no I/O — and it is the parse, not the
   * menu, that is the expensive half, which is why it happens here and once
   * rather than in the component every time somebody opens the list.
   */
  const [tracks, setTracks] = useState<SongTrackChoice[]>([]);
  useEffect(() => {
    if (!score || !source || source.length === 0) {
      setTracks([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const importer = await importerModule();
        const parsed = importer.parseSongFile(source, score.source.fileName);
        if (!cancelled) setTracks(parsed.tracks);
      } catch {
        // A file we cannot re-read is a song with one track as far as the
        // menu is concerned. It is already imported and it still plays.
        if (!cancelled) setTracks([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [score, source]);

  /** Rename the SONG: every part's record takes the new name (W35). */
  const renameSong = useCallback(
    (fileKey: string, name: string) => {
      const file = songFiles.find((f) => f.key === fileKey);
      if (!file) return;
      commit(renameInList(songs, file.parts.map((p) => p.id), name));
    },
    [songs, songFiles, commit],
  );

  /**
   * Delete the SONG — every part of it, and Yames's copy of the file.
   *
   * The one destructive thing the library can do, and the sidebar asks first
   * (`DeleteSongDialog`): every part's record goes, and with it every attempt
   * and every take filed against it. The file's bytes are a column on those
   * rows, so removing them all is what removes the copy.
   */
  const deleteSong = useCallback(
    (fileKey: string) => {
      const file = songFiles.find((f) => f.key === fileKey);
      if (!file) return;
      const ids = file.parts.map((p) => p.id);
      commit(deleteFromList(songs, ids));
      // The song's band goes with it. A mix left behind would come back on
      // the day somebody imports the same file again, which is a surprise.
      for (const id of ids) void forgetMixSetting(id).catch(() => {});
      if (activeId && ids.includes(activeId)) setActiveId(null);
    },
    [songs, songFiles, commit, activeId],
  );

  /**
   * The bars the player chose: the selection, or the whole song.
   *
   * The one place the two ideas meet. Everything downstream — the schedule,
   * the transport, the cursor, the review — goes on being handed a range and
   * never learns that "nothing selected" is a state.
   */
  const portion = useMemo<BarRange>(
    () => (score ? (selection ? clampRange(score, selection) : wholeSong(score)) : { startBar: 0, endBar: 0 }),
    [score, selection],
  );

  /**
   * WHAT THE ENGINE IS GIVEN: the portion, always (W37 item 1).
   *
   * It used to be the portion with the playhead folded into its first bar,
   * because the engine could only begin a pass at the top of whatever range
   * it was handed — so "click here, press play, start here" had to be spelt
   * as a different range, and a range change is a recompile. That is a good
   * half of why there were five ideas of "where we are" on one screen: the
   * range moved under the cursor, a loop lost its own first bar, and a click
   * while the piece ran had to be something else again because a recompile
   * would have ended the pass.
   *
   * The engine takes a start INSIDE the compiled table now
   * (`SongTransport.startTick`, `song.rs`), so the range is the bars being
   * practised and the playhead is where inside them play begins. A pass is
   * still the whole portion, which is what makes "pause inside a loop
   * continues inside it, and the next time round is whole" true.
   */
  const range = portion;

  /**
   * THE ONE PLAYHEAD (W37 item 1), in the song's own ticks.
   *
   * `songs/playhead.ts` is the rule and this is the only place it is asked:
   * a click the engine has not confirmed wins, then the engine while it is
   * running, then where the player last left it, then the first bar of what
   * is playing. Clamped into the portion — a playhead outside the bars that
   * are going to play is a cursor pointing at music nobody is about to hear.
   */
  const playheadTick = useMemo(
    () =>
      score
        ? playheadTickOf(score, portion, playhead, {
            playing: isPlaying,
            report: beat && !beat.songCountIn ? beat.songTick : null,
          })
        : 0,
    [score, portion, playhead, isPlaying, beat],
  );

  /** The same place as a played bar — the mark the tab draws. */
  const playFrom = useMemo(
    () => (score ? barOfTick(score, portion, playheadTick) : 0),
    [score, portion, playheadTick],
  );

  /**
   * A report arrived: stop believing the click once the engine agrees with it.
   *
   * `playheadOnReport` hands the same object back when nothing changed, so
   * this costs a render only on the report that actually settles a click.
   */
  useEffect(() => {
    if (!score || !isPlaying || !beat || beat.songCountIn) return;
    setPlayhead((current) => playheadOnReport(score, current, beat.songTick));
  }, [score, isPlaying, beat]);

  /**
   * And a backstop. If no report ever agrees — an engine that refused the
   * seek, a piece that ended — the click stops being believed after a second
   * and a half and the engine is the truth again.
   */
  useEffect(() => {
    if (playhead.pending === null) return;
    const timer = window.setTimeout(() => setPlayhead(giveUpWaiting), BELIEVE_MS);
    return () => window.clearTimeout(timer);
  }, [playhead.pending]);

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
      // A new portion starts at its own first bar: the playhead was a place
      // inside the LAST one, and carrying it across would begin a freshly
      // chosen passage somewhere in the middle of itself (W29).
      setPlayhead(playheadToStart());
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
   * GO THERE (W37 item 1) — a click on the tab, an arrow key, a chip.
   *
   * One gesture with one meaning on both sides of the transport, which is the
   * whole of the owner's complaint: *"as if there are 2 states for the
   * current location, one when playing and another one when paused"*. It
   * writes the ONE playhead, and the playhead is believed at once (W36's
   * rule, now the only rule) so the line and the page go there in the same
   * frame. What differs either side of the transport is only how the ENGINE
   * is told: stopped, the playhead is compiled into the piece by the
   * debounced rebuild in `useSongEngine`; playing, it is a `seek_song`,
   * because a recompile would end the pass, and ending a pass ends the
   * attempt and raises the review (`COACH_UX.md` A3) — the click would throw
   * away the take the player was in the middle of.
   *
   * It also puts the portion away when the bar is OUTSIDE it (W34 item 4).
   * W29 kept the portion on every click, on the evidence of Songsterr,
   * Ultimate Guitar and Guitar Pro, where the repeat is a switch and touching
   * the page never takes it off you. The owner played with that and decided
   * the other way: *"if i single click a different part of the song it should
   * go to that part but the selected area doesn't get unselected, it's like
   * it doesn't exit loop mode"*. His word wins; `selection.ts`'s
   * `clickClearsPortion` is the rule.
   *
   * Below `pushSchedule` rather than beside its neighbours, because it calls
   * it: a dependency array naming a `const` declared later is a reference
   * into the temporal dead zone, which is a crash on the first render rather
   * than a lint.
   */
  const seekToTick = useCallback(
    (tick: number) => {
      if (!score) return;
      const whole = wholeSong(score);
      const at = clampTick(score, whole, tick);
      const bar = barOfTick(score, whole, at);
      // Somewhere else in the song: the portion and the repeat go with you.
      // Written here rather than through `setSelection`, which also sends the
      // playhead back to the top — that one is about CHOOSING a portion and
      // this is about leaving one, and the playhead is the point of it.
      if (clickClearsPortion(selection, bar)) {
        setSelectionState(null);
        setLoop(false);
      }
      setPlayhead(goToTick(at));
      if (!isPlaying) return;
      // The engine moves its own cursor and the piece carries on.
      void seekSong(at).catch(() => {});
      // And the scorer starts again from here. An attempt that was seeked
      // scores what was actually played AFTER the seek: the onsets that were
      // jumped over never happened, and a note nobody was in a position to
      // play must not be marked as one they missed.
      void pushSchedule();
    },
    [score, isPlaying, pushSchedule, selection],
  );

  /** The same thing, said in bars, which is what the tab reports. */
  const seekTo = useCallback(
    (playedBar: number, tickInBar = 0) => {
      if (!score) return;
      const bar = clampSelection(score, { startBar: playedBar, endBar: playedBar }).startBar;
      // Into the bar by the note that was clicked, never past it: a stray
      // offset from another bar's length would land in the next one.
      const length = score.bars[bar]?.lengthTicks ?? 0;
      const into = Math.max(0, Math.min(tickInBar, Math.max(0, length - 1)));
      seekToTick(tickOfBar(score, wholeSong(score), bar) + into);
    },
    [score, seekToTick],
  );

  /**
   * BACK TO THE START (W37 item 1) — the button beside Play, and Home.
   *
   * Since a stop became a pause, something visible has to rewind, and this is
   * it. The first bar of what is being PLAYED: with a portion chosen that is
   * the portion's own first bar, because the portion is the thing being
   * practised and going back to bar one of a five-minute song is not what the
   * gesture means while you are working on bars 41 to 48.
   */
  const backToStart = useCallback(() => {
    if (!score) return;
    setPlayhead(playheadToStart());
    if (!isPlaying) return;
    void seekSong(rangeStartTick(score, portion)).catch(() => {});
    void pushSchedule();
  }, [score, portion, isPlaying, pushSchedule]);

  /**
   * The transport stopped, and **a stop is a pause** (W37 item 1).
   *
   * The line stays where it stopped and the next press of Play continues from
   * that exact place. `tick` is where the cursor actually was — the engine's
   * last report carried forward through the tempo map to the instant of the
   * stop — so the line does not step back to the last click tick as it
   * settles.
   */
  const pauseAt = useCallback((tick: number | null) => {
    setPlayhead((current) => playheadPauseAt(current, tick));
  }, []);

  const clearSelection = useCallback(() => setSelection(null), [setSelection]);

  /**
   * THE PLAYHEAD THE ENGINE HAS BEEN TOLD.
   *
   * Held still while the transport runs. A start the engine is told is part
   * of the compiled piece, so letting it follow the playhead live would
   * recompile the song on every beat — and a recompile ends the pass. While
   * it runs the engine is moved by `seek_song`; this catches up on the stop,
   * which is the same moment the pause writes where the music stopped.
   */
  const [engineStartTick, setEngineStartTick] = useState(0);
  useEffect(() => {
    if (isPlaying) return;
    setEngineStartTick(playheadTick);
  }, [isPlaying, playheadTick]);

  /**
   * The engine's half: the song on the click, the file's band, the faders.
   *
   * Its own hook because it is all effects and no list — this one owns the
   * library and the selection, that one owns what the engine is holding.
   */
  const engine = useSongEngine({
    view,
    score,
    source,
    range,
    loop,
    tempoPercent,
    isPlaying,
    startTick: engineStartTick,
  });

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

  /**
   * Read a different part of the same file (W29 item 2).
   *
   * The owner, after his first session: *"there's no dropdown for selecting
   * the instrument if a file has multiple instruments"*. The track was chosen
   * once at import and was invisible and final after that.
   *
   * ## Each track is its own song, and always was
   *
   * `songId` hashes the bytes AND the track index, so the guitar part and the
   * bass part of one file are two rows in the store — two scores, and
   * `attempts.score_id` points at one of them. Which means the history, the
   * takes, "then and now" and the coach's promises were already kept apart by
   * track and there is nothing to migrate: switching here opens the other
   * row, and every attempt anybody ever made stays with the part it was
   * played on.
   *
   * The library shows one row for the FILE either way (W35), so the record
   * takes the song's own name and the sidebar does not move, rename or
   * reorder anything when the part changes.
   *
   * ## What crosses over
   *
   * The bars you were working on, the playhead and the speed — you are
   * looking at the same passage of the same piece, and arriving at bar 1 of
   * the bass part because that is where the bass part was left a fortnight
   * ago is not what "show me the bass" meant. `restoredFor` is stamped with
   * the new id first, so the effect that restores a song's stored portion
   * sees this song as already restored and leaves those three alone; the
   * effect that writes them down then saves them under the new id, which is
   * what "remembers the choice per song" comes to.
   */
  const switchTrack = useCallback(
    async (trackIndex: number) => {
      if (!song || !score || !source || source.length === 0) return;
      if (trackIndex === score.source.trackIndex) return;
      setError(null);
      const importer = await importerModule();
      try {
        const parsed = importer.parseSongFile(source, score.source.fileName);
        const result = importer.buildSongScore(parsed, trackIndex, source);
        const existing = songs.find((s) => s.id === result.score.id);
        // The new part is the same SONG and is named after it (W35). It used
        // to be filed as `<song> · <part>`, because two rows under one name
        // would have been worse than two rows under two; with one row per
        // file there is nothing to tell apart, and the part is a fact of the
        // record rather than of its name.
        const record =
          existing ??
          {
            ...newSongRecord(result.score, source),
            name: song.name,
            addedAt: song.addedAt,
          };
        // Choosing a part is opening it: the row goes back to this one next
        // time (W35), the same way `loadSong` marks the record it opened.
        //
        // `addSongPart` rather than `addSong`, and that is the whole of "the
        // sidebar does not move": a new record at the top of the list would
        // carry its file's row to the top with it, and this is a menu on the
        // stage about the song you are already looking at.
        commit(addSongPart(songs, { ...record, openedAt: Date.now() }, song.id));
        restoredFor.current = record.id;
        setActiveId(record.id);
        setWarnings(result.warnings);
        void markScoreOpened(record.id).catch(() => {});
      } catch (err) {
        setError(err instanceof importer.SongImportError ? err.message : String(err));
      }
    },
    [song, score, source, songs, commit],
  );

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
    songFiles,
    song,
    score,
    source,
    range,
    portion,
    playheadTick,
    playFrom,
    seekToTick,
    backToStart,
    pauseAt,
    engineStartTick,
    seekTo,
    selection,
    loop,
    tempoPercent,
    tempo,
    portions,
    tracks,
    switchTrack,
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
