/**
 * Recording the pass — Jam's take control, over a song.
 *
 * `useJamTakes` is the original and this follows it deliberately rather than
 * improving on it: the same opt-in, the same first-run dialog, the same three
 * states the section draws, the same shelf under the stage. A take is a take,
 * and a player who has learned what one is in Jam has learned it here.
 *
 * ## The song's id is the shelf's key, and nothing in Rust changed
 *
 * `start_take`, `list_takes`, `delete_take`, `play_take` and
 * `analyze_take_pitch` all take the id as an OPAQUE string. `take.rs` turns it
 * into a directory with `safe_dir_name`, which is the character rule plus an
 * FNV fingerprint of the raw id — nothing in the path depends on the id being
 * a jam's, nothing validates it against the jam library, and a song id is
 * sixteen hex characters, which survives the character rule unchanged. So a
 * song's takes sit in `takes/<songId>-<fingerprint>/`, beside the jams' and
 * never inside one, and the smallest change that works turned out to be no
 * change at all.
 *
 * ## `startOffsetMs`, and exactly how well it is known
 *
 * `analyze_take_pitch` needs to know where the FIRST BEAT of the played range
 * sits inside the recording, measured from the instant that file starts, and
 * W5's warning is that getting it wrong moves every note by the same amount.
 *
 * The take is started in response to the first beat of the piece — Jam's rule,
 * so the count-in is not in the file — which means the file begins slightly
 * AFTER that beat, and the offset is therefore negative and small. It is
 * measured rather than assumed: `performance.now()` when the effect decides to
 * record, `performance.now()` again when `start_take` comes back, and the
 * difference is how much of the opening the file missed.
 *
 * What that figure does NOT include, said plainly because somebody will
 * measure this one day: the beat event had already crossed the IPC boundary
 * before the first reading, and the writer's clock starts on the first chunk
 * of band the output callback renders after the ring is handed over, which is
 * up to one callback after the second reading. So the true offset is a little
 * more negative than the one reported — single-digit to low-tens of
 * milliseconds, against notes hundreds of milliseconds long. That is the size
 * of error this can have. The failure W13 fixed was seconds.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  deleteTake,
  listTakes,
  onTakeCapped,
  onTakePlaybackEnded,
  playTake,
  startTake,
  stopTake,
  stopTakePlayback,
  storeLoad,
  storeSave,
  takesDirSize,
} from "../../ipc";
import { sortTakes, TAKES_INTRO_KEY } from "../../jam/takes";
import type { JamTake } from "../../jam/types";
import type { SongTake } from "./review";

export type SongTakesState = {
  /** `null` before the first answer, `false` on a build that cannot record. */
  available: boolean | null;
  takes: JamTake[];
  recording: boolean;
  recordedSeconds: number;
  playingId: string | null;
  dirBytes: number;
  /**
   * The recording of the pass that has just finished, for the review's ear.
   *
   * `undefined` until one exists, and again the moment the next pass starts:
   * a review is about one pass, and handing it the take before it would have
   * the coach name notes from a different go.
   */
  lastTake: SongTake | undefined;
  play: (id: string) => void;
  stopPlayback: () => void;
  remove: (id: string) => void;
  requestTakes: (next: boolean) => void;
  introOpen: boolean;
  confirmIntro: () => void;
  cancelIntro: () => void;
};

export type SongTakesInput = {
  /** The song on the stage, or null. A take belongs to a song, never to the app. */
  songId: string | null;
  /** Which tab is showing — nothing records while Songs is not the one. */
  view: string;
  isPlaying: boolean;
  /** The click is counting in. The take starts when this goes false. */
  countingIn: boolean;
  /** The switch, off this song's own record. */
  enabled: boolean;
  /** Write it back. The record owns the switch, this hook only acts on it. */
  onSetTakes: (next: boolean) => void;
};

export function useSongTakes({
  songId,
  view,
  isPlaying,
  countingIn,
  enabled,
  onSetTakes,
}: SongTakesInput): SongTakesState {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [takes, setTakes] = useState<JamTake[]>([]);
  const [recording, setRecording] = useState(false);
  const [recordedSeconds, setRecordedSeconds] = useState(0);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [dirBytes, setDirBytes] = useState(0);
  const [introOpen, setIntroOpen] = useState(false);
  const [lastTake, setLastTake] = useState<SongTake | undefined>(undefined);

  const introSeen = useRef(false);
  const recordingRef = useRef(false);
  /**
   * The song the take now recording belongs to.
   *
   * The engine files a take under the id it was STARTED with, so loading
   * another song mid-take would otherwise put the finished recording on the
   * new song's shelf — a run at one piece filed under another, which is a
   * thing you only find out about when you play it back a week later.
   */
  const recordingSongRef = useRef<string | null>(null);
  /** Where the range's first beat sits inside the file. See the header. */
  const offsetRef = useRef(0);
  const startedAt = useRef<number | null>(null);
  const songIdRef = useRef<string | null>(null);
  songIdRef.current = songId;

  const refreshSize = useCallback(async () => {
    try {
      const bytes = await takesDirSize();
      setDirBytes(Number.isFinite(bytes) ? bytes : 0);
    } catch {
      setDirBytes(0);
    }
  }, []);

  /**
   * The shelf, and the availability probe, deliberately the same call: a build
   * that can list takes can record them, and asking twice would leave a window
   * in which the screen believed two different things.
   */
  const refresh = useCallback(
    async (id: string) => {
      try {
        const list = await listTakes(id);
        setTakes(sortTakes(Array.isArray(list) ? list : []));
        setAvailable(true);
      } catch {
        setTakes([]);
        setAvailable(false);
        setDirBytes(0);
        return;
      }
      await refreshSize();
    },
    [refreshSize],
  );

  useEffect(() => {
    if (!songId) {
      setTakes([]);
      return;
    }
    void refresh(songId);
  }, [songId, refresh]);

  /** Has the dialog been read before? The APP's answer, not this song's. */
  useEffect(() => {
    let alive = true;
    void storeLoad<boolean>(TAKES_INTRO_KEY)
      .then((seen) => {
        if (alive) introSeen.current = seen === true;
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const unlisten = onTakePlaybackEnded(() => setPlayingId(null));
    return () => {
      void unlisten.then((off) => off()).catch(() => {});
    };
  }, []);

  /** The twenty-minute cap: the engine has finished and kept it on its own. */
  useEffect(() => {
    const unlisten = onTakeCapped(() => {
      recordingRef.current = false;
      recordingSongRef.current = null;
      startedAt.current = null;
      setRecording(false);
      setRecordedSeconds(0);
      const id = songIdRef.current;
      if (id) void refresh(id);
    });
    return () => {
      void unlisten.then((off) => off()).catch(() => {});
    };
  }, [refresh]);

  /**
   * Record from the first bar after the count-in until the pass ends.
   *
   * `enabled` is read here rather than when play is pressed, so turning the
   * switch on mid-pass does not start half a take. A take ends when its song
   * leaves the engine, and there are three ways for that: the transport stops,
   * the switch goes off, or another song — or another tab — takes the stage.
   */
  const armed = view === "songs" && enabled && available !== false;
  useEffect(() => {
    if (armed && isPlaying && !countingIn && !recordingRef.current) {
      const id = songId;
      if (!id) return;
      // The first reading, before anything is asked of the engine. Every
      // millisecond between here and the take being live is opening the file
      // has missed, and that is exactly what `startOffsetMs` is.
      const atFirstBeat = performance.now();
      recordingRef.current = true;
      recordingSongRef.current = id;
      startedAt.current = Date.now();
      offsetRef.current = 0;
      setRecording(true);
      setRecordedSeconds(0);
      // A new pass, so the take of the last one stops being the take of
      // "this" one before the review has a chance to ask.
      setLastTake(undefined);
      void startTake(id)
        .then(() => {
          offsetRef.current = atFirstBeat - performance.now();
        })
        .catch(() => {
          // The engine said no. No mark on the transport, no phantom take, and
          // the section says this build cannot record — which is the truth.
          recordingRef.current = false;
          recordingSongRef.current = null;
          startedAt.current = null;
          setRecording(false);
          setAvailable(false);
        });
      return;
    }

    if (recordingRef.current && (!isPlaying || !armed || recordingSongRef.current !== songId)) {
      const wasFor = recordingSongRef.current;
      const offset = offsetRef.current;
      recordingRef.current = false;
      recordingSongRef.current = null;
      startedAt.current = null;
      setRecording(false);
      setRecordedSeconds(0);
      void stopTake()
        .then((take) => {
          // `null` is the engine saying nothing was recording, which is not a
          // failure and not a take.
          if (!take) return;
          void refreshSize();
          // The take the engine handed back, not a re-read of the shelf: that
          // is a round trip the engine has no obligation to have finished
          // writing into, and one that landed first would drop the take you
          // just played off the top of the list.
          if (take.jamId !== songIdRef.current) return;
          setTakes((prev) => sortTakes([take, ...prev]));
          if (wasFor) setLastTake({ takeId: take.id, jamId: wasFor, startOffsetMs: offset });
        })
        .catch(() => {});
    }
  }, [armed, isPlaying, countingIn, songId, refreshSize]);

  /** The elapsed time on the transport's mark. Half-second, not per frame. */
  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => {
      if (startedAt.current === null) return;
      setRecordedSeconds((Date.now() - startedAt.current) / 1000);
    }, 500);
    return () => clearInterval(id);
  }, [recording]);

  const play = useCallback((id: string) => {
    setPlayingId(id);
    void playTake(id).catch(() => {
      setPlayingId(null);
      setAvailable(false);
    });
  }, []);

  const stopPlayback = useCallback(() => {
    setPlayingId(null);
    void stopTakePlayback().catch(() => {});
  }, []);

  const remove = useCallback(
    (id: string) => {
      setTakes((prev) => prev.filter((take) => take.id !== id));
      // The review must not go on naming notes out of a file that is gone.
      setLastTake((current) => (current?.takeId === id ? undefined : current));
      if (playingId === id) {
        setPlayingId(null);
        void stopTakePlayback().catch(() => {});
      }
      void deleteTake(id)
        .catch(() => {})
        .finally(() => {
          if (songId) void refresh(songId);
        });
    },
    [playingId, songId, refresh],
  );

  const requestTakes = useCallback(
    (next: boolean) => {
      // Off is off, immediately. Nobody needs a dialog to stop recording.
      if (!next) {
        onSetTakes(false);
        return;
      }
      if (introSeen.current) {
        onSetTakes(true);
        return;
      }
      setIntroOpen(true);
    },
    [onSetTakes],
  );

  const confirmIntro = useCallback(() => {
    introSeen.current = true;
    setIntroOpen(false);
    // Remembered before the switch goes on, so a crash in between costs an
    // extra reading of the dialog rather than a silent recording.
    void storeSave(TAKES_INTRO_KEY, true).catch(() => {});
    onSetTakes(true);
  }, [onSetTakes]);

  const cancelIntro = useCallback(() => setIntroOpen(false), []);

  return {
    available,
    takes,
    recording,
    recordedSeconds,
    playingId,
    dirBytes,
    lastTake,
    play,
    stopPlayback,
    remove,
    requestTakes,
    introOpen,
    confirmIntro,
    cancelIntro,
  };
}
