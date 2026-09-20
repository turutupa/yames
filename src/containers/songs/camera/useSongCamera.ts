/**
 * The camera, on by choice, for one song.
 *
 * `plans/SONGS.md` A9. Everything about it hangs off one rule: **the picture
 * may never cost the take.** The take is the engine's — its own threads, its
 * own clock, sample-exact against the click — and this hook is a webview
 * feature sitting beside it. So every path through here that goes wrong ends
 * in "no picture this pass", never in a throw the take's own hook has to
 * survive.
 *
 * ## The switch turns recording on with it
 *
 * A picture of somebody playing with no sound is not a take, and a second
 * switch that can be on while the first is off is a state the player has to
 * reason about. So turning the camera on turns Record the take on, and turning
 * Record the take off turns the camera off — one promise, one dialog, two
 * things that happen together.
 *
 * ## The camera is open only while it is armed
 *
 * `getUserMedia` is called when the switch goes on and the stream is stopped
 * the moment it goes off, the tab changes, the song changes or the screen
 * unmounts (item 9). That is what makes the little light on the laptop an
 * honest signal: it is on exactly when Yames could see you, and the control
 * says "camera on" in words for the machines whose light is behind a sticker.
 *
 * ## Where the alignment comes from
 *
 * The recording starts with the TRANSPORT, which is before the take does — the
 * count-in is part of the picture — and the engine names the take only when it
 * stops. So:
 *
 *   transport starts → `MediaRecorder` starts, chunks stream to disk
 *   every beat event → one `(arrival, position)` sample for the clock fit
 *   the take stops   → `finishFor(take)` files the picture under its id and
 *                      writes the fitted offset into the take's sidecar
 *
 * The fit and the arithmetic are in `src/songs/camera/offset.ts`, which is
 * pure and tested. The arrival stamp is taken INSIDE the event listener rather
 * than from a prop, because a prop has been through a React commit by the time
 * anything can read a clock, and a constant delay added to every sample is a
 * constant error the fit cannot see.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  onBeat,
  storeLoad,
  storeSave,
  takeVideoAppend,
  takeVideoBegin,
  takeVideoDiscard,
  takeVideoFinish,
} from "../../../ipc";
import { recordVideo } from "../../../songs/camera/recorder";
import type { Recording } from "../../../songs/camera/recorder";
import { cameraConstraints, cameraSupport } from "../../../songs/camera/support";
import type { CameraSupport } from "../../../songs/camera/support";
import { fitTransportClock, sampleFor, videoOffsetMs } from "../../../songs/camera/offset";
import type { ClockSample } from "../../../songs/camera/offset";
import {
  CAMERA_DEVICE_KEY,
  CAMERA_INTRO_KEY,
  MAX_CLOCK_SAMPLES,
} from "../../../songs/camera/keys";
import type { BarRange } from "../../../songs/schedule";
import type { SongScore } from "../../../songs/types";
import type { JamTake } from "../../../jam/types";

/** What went wrong, in words the control can say. */
export type CameraTrouble = "denied" | "noCamera" | "failed" | "lostPicture";

export type SongCameraState = {
  /** What this webview can do at all. `ok: false` hides the switch. */
  support: CameraSupport;
  /** The switch, as this song's record has it. */
  enabled: boolean;
  /** The camera is open and the preview is live. */
  armed: boolean;
  /** A pass is being recorded. */
  recording: boolean;
  /** The live preview, for the little mirror on the stage. */
  stream: MediaStream | null;
  /** Every camera the machine will name, once permission has been given. */
  devices: { deviceId: string; label: string }[];
  deviceId: string | null;
  chooseDevice: (id: string) => void;
  trouble: CameraTrouble | null;
  dismissTrouble: () => void;
  /** Ask for the camera. Shows the promise the first time. */
  request: (next: boolean) => void;
  introOpen: boolean;
  confirmIntro: () => void;
  cancelIntro: () => void;
  /** A frame was painted, from the preview's own frame callback. */
  noteFrame: (atMs: number) => void;
  /** Called by `useSongTakes` when a take begins and when it ends. */
  onTakeStarted: () => void;
  onTakeFinished: (take: JamTake | null) => void;
  /** What the last pass cost, for the report and for spike K3. */
  lastCost: { chunks: number; droppedFrames: number | null; deliveredFrames: number | null } | null;
  /**
   * The picture of the pass that has just finished, for the review.
   *
   * Handed over from HERE rather than read back off the shelf, because the
   * engine names a take and hands its record back while this module is still
   * writing the video — so that record says there is no picture, truthfully,
   * and a review waiting for the directory to be re-read would show the tape
   * a second late or not at all. `undefined` again the moment the next pass
   * starts: a review is about one pass.
   */
  lastVideo: { takeId: string; path: string; offsetMs: number | null } | undefined;
};

export type SongCameraInput = {
  songId: string | null;
  /** The score on the stage — the clock fit needs it to place a beat in time. */
  score: SongScore | null;
  range: BarRange;
  tempoPercent: number;
  /** Which tab is showing. The camera closes when Songs is not the one. */
  view: string;
  isPlaying: boolean;
  /** The switch, off this song's own record. */
  enabled: boolean;
  /** Write it back, and turn Record the take on with it. */
  onSetCamera: (next: boolean) => void;
};

export function useSongCamera({
  songId,
  score,
  range,
  tempoPercent,
  view,
  isPlaying,
  enabled,
  onSetCamera,
}: SongCameraInput): SongCameraState {
  const support = useMemo(() => cameraSupport(), []);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [devices, setDevices] = useState<{ deviceId: string; label: string }[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [trouble, setTrouble] = useState<CameraTrouble | null>(null);
  const [introOpen, setIntroOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [lastCost, setLastCost] = useState<SongCameraState["lastCost"]>(null);
  const [lastVideo, setLastVideo] = useState<SongCameraState["lastVideo"]>(undefined);

  const introSeen = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingRef = useRef<Recording | null>(null);
  /** The beat events of the pass being recorded, for the clock fit. */
  const samples = useRef<ClockSample[]>([]);
  /** The score, range and speed the pass was started against. */
  const against = useRef<{ score: SongScore; range: BarRange; tempoPercent: number } | null>(null);
  /** The recorder's answer, once it has stopped. */
  const result = useRef<Awaited<ReturnType<Recording["stop"]>> | null>(null);

  const armed = support.ok && enabled && view === "songs" && stream !== null;

  // ---- The switch, and the promise in front of it ------------------------

  useEffect(() => {
    let alive = true;
    void storeLoad<boolean>(CAMERA_INTRO_KEY)
      .then((seen) => {
        if (alive) introSeen.current = seen === true;
      })
      .catch(() => {});
    void storeLoad<string>(CAMERA_DEVICE_KEY)
      .then((id) => {
        if (alive && typeof id === "string" && id) setDeviceId(id);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const request = useCallback(
    (next: boolean) => {
      // Off is off, immediately. Nobody needs a dialog to close a camera.
      if (!next) {
        onSetCamera(false);
        return;
      }
      if (introSeen.current) {
        onSetCamera(true);
        return;
      }
      setIntroOpen(true);
    },
    [onSetCamera],
  );

  const confirmIntro = useCallback(() => {
    introSeen.current = true;
    setIntroOpen(false);
    // Remembered before the switch goes on, so a crash in between costs an
    // extra reading of the promise rather than a silent recording.
    void storeSave(CAMERA_INTRO_KEY, true).catch(() => {});
    onSetCamera(true);
  }, [onSetCamera]);

  const cancelIntro = useCallback(() => setIntroOpen(false), []);

  const chooseDevice = useCallback((id: string) => {
    setDeviceId(id);
    void storeSave(CAMERA_DEVICE_KEY, id).catch(() => {});
  }, []);

  const dismissTrouble = useCallback(() => setTrouble(null), []);

  // ---- Opening and closing the camera ------------------------------------

  /**
   * The stream, open exactly while the switch is on and Songs is the tab.
   *
   * The cleanup stops every track rather than dropping the reference: a
   * `MediaStream` nobody holds still keeps the camera — and its light — on
   * until the garbage collector gets round to it, which is not a promise
   * anybody would accept about a camera.
   */
  const wanted = support.ok && enabled && view === "songs" && songId !== null;
  useEffect(() => {
    if (!wanted) {
      const open = streamRef.current;
      streamRef.current = null;
      setStream(null);
      open?.getTracks().forEach((track) => track.stop());
      return;
    }
    let alive = true;
    let opened: MediaStream | null = null;
    void navigator.mediaDevices
      .getUserMedia(cameraConstraints(deviceId))
      .then(async (got) => {
        opened = got;
        if (!alive) {
          got.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = got;
        setStream(got);
        setTrouble(null);
        // Labels only exist once permission has been given, which is why the
        // picker is filled here and not when the screen mounts: before this
        // point every camera on the machine is called "".
        try {
          const found = await navigator.mediaDevices.enumerateDevices();
          if (!alive) return;
          setDevices(
            found
              .filter((d) => d.kind === "videoinput")
              .map((d) => ({ deviceId: d.deviceId, label: d.label })),
          );
        } catch {
          // A webview that will not enumerate still has a camera open; the
          // picker simply does not appear.
        }
      })
      .catch((e: unknown) => {
        if (!alive) return;
        const name = (e as { name?: string })?.name ?? "";
        setTrouble(
          name === "NotAllowedError" || name === "SecurityError"
            ? "denied"
            : name === "NotFoundError" || name === "OverconstrainedError"
              ? "noCamera"
              : "failed",
        );
        // The switch goes back off on its own. A switch that reads "on" over
        // a camera that is not open is the app telling the player something
        // untrue about a camera, which is the one lie this feature may not
        // tell.
        onSetCamera(false);
      });
    return () => {
      alive = false;
      const open = opened ?? streamRef.current;
      if (open) {
        streamRef.current = null;
        open.getTracks().forEach((track) => track.stop());
      }
      setStream(null);
    };
    // `onSetCamera` is stable on the session; re-running this on its identity
    // would close and reopen the camera on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, deviceId]);

  // Whatever is open when this screen goes away, goes away with it.
  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    },
    [],
  );

  // ---- The clock samples -------------------------------------------------

  /**
   * One sample per beat event, stamped inside the listener.
   *
   * Subscribed only while a pass is being recorded, so a screen sitting idle
   * with the camera on costs nothing, and the buffer holds one pass at a time.
   */
  useEffect(() => {
    if (!recording) return;
    const unlisten = onBeat((event) => {
      const held = against.current;
      if (!held) return;
      const sample = sampleFor(
        held.score,
        held.range,
        held.tempoPercent,
        {
          songBar: event.songBar,
          songTick: event.songTick,
          songPass: event.songPass,
          songCountIn: event.songCountIn,
        },
        performance.now(),
      );
      if (!sample) return;
      if (samples.current.length >= MAX_CLOCK_SAMPLES) samples.current.shift();
      samples.current.push(sample);
    });
    return () => {
      void unlisten.then((off) => off()).catch(() => {});
    };
  }, [recording]);

  // ---- Recording ---------------------------------------------------------

  /**
   * Roll with the transport — count-in included.
   *
   * Earlier than the take, deliberately: the count-in is the player getting
   * ready and it belongs on the tape, and starting first means the offset is
   * positive and the picture never has to be invented for the take's opening
   * moments.
   */
  useEffect(() => {
    if (!armed || !isPlaying || recordingRef.current !== null) return;
    if (!support.ok || !score || !songId || !streamRef.current) return;
    const media = streamRef.current;
    const startedMs = Date.now();
    samples.current = [];
    result.current = null;
    setLastVideo(undefined);
    against.current = { score, range, tempoPercent };

    let live: Recording | null = null;
    void takeVideoBegin(songId, support.container, startedMs)
      .then(() => {
        // The transport may have stopped while that crossed. A recording
        // nobody is going to stop is a camera file growing behind a stopped
        // screen, so it is discarded rather than started.
        if (!streamRef.current || streamRef.current !== media) {
          void takeVideoDiscard().catch(() => {});
          return;
        }
        live = recordVideo({
          stream: media,
          mimeType: support.mimeType,
          sink: (seq, bytes) => takeVideoAppend(seq, bytes),
        });
        recordingRef.current = live;
        setRecording(true);
      })
      .catch(() => {
        // The file could not be opened. No picture this pass; the take is
        // already running and is not told.
        setTrouble("failed");
      });
    // The effect's own inputs are the edge; `score`, `range` and
    // `tempoPercent` are read once at the start of the pass on purpose — a
    // range changed mid-pass would refit the clock against a piece the
    // recording is not of.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armed, isPlaying, songId, support.ok]);

  /**
   * Stop the picture when the transport stops, and hold the answer.
   *
   * The take is stopped by `useSongTakes` at the same moment and takes a
   * round trip to come back with its id, so the two rendezvous in
   * `onTakeFinished` below.
   */
  useEffect(() => {
    if (isPlaying && armed) return;
    const live = recordingRef.current;
    if (!live) return;
    recordingRef.current = null;
    setRecording(false);
    void live.stop().then((answer) => {
      result.current = answer;
      setLastCost({
        chunks: answer.chunks,
        droppedFrames: answer.droppedFrames,
        deliveredFrames: answer.deliveredFrames,
      });
      if (answer.error) setTrouble("lostPicture");
      pendingTake.current?.();
      pendingTake.current = null;
    });
  }, [isPlaying, armed]);

  /** What `onTakeFinished` left waiting for the recorder to finish. */
  const pendingTake = useRef<(() => void) | null>(null);

  const onTakeStarted = useCallback(() => {
    // Nothing to do: the recorder started with the transport, which is before
    // this. Kept as a door so `useSongTakes` has one shape to call.
  }, []);

  /**
   * The take has its id. File the picture under it, or throw it away.
   *
   * Never throws and never reports a failure into the take's path: a picture
   * that could not be filed is a review with no picture, which is a review.
   */
  const onTakeFinished = useCallback((take: JamTake | null) => {
    const settle = () => {
      const answer = result.current;
      result.current = null;
      const held = against.current;
      against.current = null;
      if (!answer) return;
      if (!take || answer.chunks === 0 || answer.error) {
        void takeVideoDiscard().catch(() => {});
        return;
      }
      const fit = fitTransportClock(samples.current);
      samples.current = [];
      const offset =
        fit && held
          ? videoOffsetMs({
              fit,
              firstFrameAt: answer.firstFrameAt,
              startOffsetMs: take.position?.startOffsetMs ?? null,
            })
          : null;
      void takeVideoFinish(take.id, offset)
        .then((made) => {
          setLastVideo({ takeId: take.id, path: made.path, offsetMs: offset });
        })
        .catch(() => {
          void takeVideoDiscard().catch(() => {});
        });
    };
    // The recorder may still be flushing its last chunk. Wait for it rather
    // than filing a truncated file under a take's name.
    if (recordingRef.current !== null || result.current === null) {
      pendingTake.current = settle;
      // ...but not forever. A recorder that never calls back would otherwise
      // leave a `pending-` file until the next time the camera is armed.
      const timer = setTimeout(() => {
        if (pendingTake.current === settle) {
          pendingTake.current = null;
          void takeVideoDiscard().catch(() => {});
        }
      }, 5000);
      const wrapped = () => {
        clearTimeout(timer);
        settle();
      };
      pendingTake.current = wrapped;
      return;
    }
    settle();
  }, []);

  const noteFrame = useCallback((atMs: number) => {
    recordingRef.current?.noteFrame(atMs);
  }, []);

  return {
    support,
    enabled,
    armed,
    recording,
    stream,
    devices,
    deviceId,
    chooseDevice,
    trouble,
    dismissTrouble,
    request,
    introOpen,
    confirmIntro,
    cancelIntro,
    noteFrame,
    onTakeStarted,
    onTakeFinished,
    lastCost,
    lastVideo,
  };
}
