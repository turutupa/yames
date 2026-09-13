import { useCallback, useEffect, useRef, useState } from "react";
import {
  deleteTake,
  listTakes,
  onTakePlaybackEnded,
  onTakeCapped,
  playTake,
  startTake,
  stopTake,
  stopTakePlayback,
  storeLoad,
  storeSave,
  takesDirSize,
} from "../../../ipc";
import { sortTakes } from "../../../jam";
import type { Jam, JamTake } from "../../../jam";

/**
 * The takes of the jam on the stage: what is on the shelf, what is being
 * recorded, and what is playing back (JAM_MODE §4.4).
 *
 * Three rules shape the whole of it.
 *
 * **Local, and said so.** A take is your playing with the band mixed in,
 * written to a WAV in the app's own data directory. Nothing is uploaded and
 * nothing is analysed. That is the promise the first-run dialog makes, and
 * this hook is where it has to stay true: the only calls it makes are the
 * seven at the foot of `src/ipc.ts`, and none of them leaves the machine.
 *
 * **Opt in, per jam.** `Jam.takes` is the switch and it lives on the record,
 * so a jam you record is a jam you decided to record, and the one next to it
 * in the library is not. Absent means off, which is what every jam saved
 * before this existed says.
 *
 * **The engine may not have it.** These seven commands are the newest thing
 * in the app, and a build without them rejects every one. That is not an
 * error state to recover from — it is a state the screen has to be able to
 * DRAW, so the first `listTakes` doubles as the question "does this build
 * record?" and its answer is what the section renders from. Everything else
 * on the jam screen goes on working either way.
 */

/** What the screen knows about recording, all in one place. */
export type JamTakesState = {
  /**
   * `null` while the first `listTakes` is still out, `false` on a build whose
   * engine rejects it, `true` once a list has come back.
   *
   * Three states rather than two because "we have not asked yet" and "the
   * answer is no" want different pictures: a spinner's worth of nothing, and
   * a sentence saying this build cannot record.
   */
  available: boolean | null;
  takes: JamTake[];
  /** True from the first beat after the count-in until the transport stops. */
  recording: boolean;
  /** Seconds of the take so far, for the mark on the transport. */
  recordedSeconds: number;
  /** The take playing back, or null. The band is silent while one plays. */
  playingId: string | null;
  /**
   * Bytes the takes folder holds, across every jam — 0 until the engine says.
   *
   * The whole folder and not this jam's shelf, because a disk filling up is a
   * fact about the disk: the jam in front of you can have two takes on it
   * while the library has ninety.
   */
  dirBytes: number;
  play: (id: string) => void;
  stopPlayback: () => void;
  remove: (id: string) => void;
  /**
   * Turn recording on or off for the loaded jam.
   *
   * Not a plain edit: the FIRST time it is turned on it opens the dialog
   * instead and waits, because a microphone that starts writing files is the
   * one thing in this app a person is entitled to be told about first.
   * Turning it off never asks.
   */
  requestTakes: (next: boolean) => void;
  /** The first-time dialog is up. */
  introOpen: boolean;
  /** "Start recording" — the switch goes on and the dialog never returns. */
  confirmIntro: () => void;
  /** "Not now" — nothing changes, and it will ask again next time. */
  cancelIntro: () => void;
};

interface UseJamTakesArgs {
  /** The jam on the stage, or null. Takes belong to a jam, never to the app. */
  jam: Jam | null;
  /** Which tab is showing — nothing records while Jam is not the one. */
  view: string;
  isPlaying: boolean;
  /**
   * True while the engine is counting the band in.
   *
   * The take starts when this goes false, not when the transport starts: a
   * count-in is four beeps and a stick click, and a recording that opens with
   * them is a recording you have to skip the start of every time you listen
   * back. §4.4's "record the take" is the take, not the preamble.
   */
  countingIn: boolean;
  /** Write `Jam.takes` on the loaded jam. The record owns the switch. */
  onSetTakes: (next: boolean) => void;
}

/**
 * The store key that says the dialog has been read.
 *
 * The APP's, not the jam's: what a take is only has to be explained once, and
 * a per-jam flag would ask again for every jam in the library — which reads
 * as the app not trusting the answer you already gave.
 */
const TAKES_INTRO_KEY = "jam.takesIntroSeen";

export function useJamTakes({
  jam,
  view,
  isPlaying,
  countingIn,
  onSetTakes,
}: UseJamTakesArgs): JamTakesState {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [takes, setTakes] = useState<JamTake[]>([]);
  const [recording, setRecording] = useState(false);
  const [recordedSeconds, setRecordedSeconds] = useState(0);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [dirBytes, setDirBytes] = useState(0);
  const [introOpen, setIntroOpen] = useState(false);
  /**
   * Whether the dialog has been read, as far as we know.
   *
   * A ref rather than state: nothing on screen depends on it, only the branch
   * `requestTakes` takes, and a re-render every time the store answers would
   * be a re-render for nothing. `false` until the store says otherwise, which
   * means the worst a failed read can do is ask once more.
   */
  const introSeen = useRef(false);

  /** So `stop` can tell "we started one" from "the transport merely stopped". */
  const recordingRef = useRef(false);
  const startedAt = useRef<number | null>(null);
  const jamId = jam?.id ?? null;
  /** The loaded jam's id for listeners that outlive a render. */
  const jamIdRef = useRef<string | null>(null);
  jamIdRef.current = jamId;

  /**
   * The shelf, re-read.
   *
   * Also the availability probe, and deliberately the same call: a build that
   * can list takes can record them, and asking twice would leave a window in
   * which the screen believed two different things.
   */
  /**
   * What the folder holds, across every jam.
   *
   * Its own call and its own failure: a size that could not be read is a
   * sentence the screen leaves out, not a shelf it refuses to draw. Re-read
   * whenever the folder changes — a take kept, a take deleted — because it is
   * the only number here that is about the disk rather than about this jam.
   */
  const refreshSize = useCallback(async () => {
    try {
      const bytes = await takesDirSize();
      setDirBytes(Number.isFinite(bytes) ? bytes : 0);
    } catch {
      setDirBytes(0);
    }
  }, []);

  const refresh = useCallback(
    async (id: string) => {
      try {
        const list = await listTakes(id);
        setTakes(sortTakes(Array.isArray(list) ? list : []));
        setAvailable(true);
      } catch {
        // Not an error to report. This build does not record, the section
        // says so, and everything else on the screen is unaffected.
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
    if (!jamId) {
      setTakes([]);
      return;
    }
    void refresh(jamId);
  }, [jamId, refresh]);

  /** Has the dialog been read before? Asked once, at the top of the session. */
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

  /**
   * A take that is playing has ended by itself.
   *
   * The listener is up for the life of the window rather than only while
   * something plays: a take that finishes between the `playTake` and a
   * subscription taken after it would leave the controls disabled for ever,
   * and the engine is under no obligation to wait for us.
   */
  useEffect(() => {
    const unlisten = onTakePlaybackEnded(() => setPlayingId(null));
    return () => {
      void unlisten.then((off) => off()).catch(() => {});
    };
  }, []);

  /**
   * A take ran into the twenty-minute cap. The engine has finished and kept
   * it on its own, so the mark comes off the transport and the shelf is
   * re-read rather than left waiting for a stop that already happened.
   */
  useEffect(() => {
    const unlisten = onTakeCapped(() => {
      recordingRef.current = false;
      startedAt.current = null;
      setRecording(false);
      setRecordedSeconds(0);
      const id = jamIdRef.current;
      if (id) void refresh(id);
    });
    return () => {
      void unlisten.then((off) => off()).catch(() => {});
    };
  }, [refresh]);

  /**
   * Start on the first bar after the count-in; stop with the transport.
   *
   * `jam?.takes` is read here rather than at the moment play is pressed, so
   * turning the switch on mid-tune does NOT start recording half a take —
   * the hands-free key says "record the next one", and this is what makes
   * that true.
   */
  const armed = view === "jam" && !!jam?.takes && available !== false;
  useEffect(() => {
    if (armed && isPlaying && !countingIn && !recordingRef.current) {
      const id = jamId;
      if (!id) return;
      recordingRef.current = true;
      startedAt.current = Date.now();
      setRecording(true);
      setRecordedSeconds(0);
      void startTake(id).catch(() => {
        // The engine said no. No mark on the transport, no phantom take, and
        // the section switches to saying this build cannot record — which is
        // the truth, and better than a red dot over nothing.
        recordingRef.current = false;
        startedAt.current = null;
        setRecording(false);
        setAvailable(false);
      });
      return;
    }

    if (recordingRef.current && (!isPlaying || !armed)) {
      recordingRef.current = false;
      startedAt.current = null;
      setRecording(false);
      setRecordedSeconds(0);
      void stopTake()
        .then((take) => {
          // `null` is the engine saying nothing was recording, which is not a
          // failure and not a take.
          if (!take) return;
          // The take the engine just handed back, not a re-read of the shelf:
          // `listTakes` is a round trip the engine has no obligation to have
          // finished writing into, and a re-read that lands first would drop
          // the take you just played off the top of the list.
          setTakes((prev) => sortTakes([take, ...prev]));
          // The folder DID just grow, though, and that is a different fact.
          void refreshSize();
        })
        .catch(() => {});
    }
  }, [armed, isPlaying, countingIn, jamId, refreshSize]);

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
    // Optimistic, and on purpose: the engine mutes the band and starts the
    // file, and the controls have to go quiet with it rather than a round
    // trip later. A rejection puts them straight back.
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
      // Off the shelf first. The file is gone either way once the engine has
      // been asked, and a row that lingers while the disk empties is a row
      // people click twice.
      setTakes((prev) => prev.filter((take) => take.id !== id));
      if (playingId === id) setPlayingId(null);
      void deleteTake(id)
        // Either way the folder is a different size than the screen thinks,
        // and on a failure the row has to come back too.
        .catch(() => {})
        .finally(() => {
          if (jamId) void refresh(jamId);
        });
    },
    [playingId, jamId, refresh],
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
    play,
    stopPlayback,
    remove,
    requestTakes,
    introOpen,
    confirmIntro,
    cancelIntro,
  };
}
