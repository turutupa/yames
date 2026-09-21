/**
 * The camera, on by choice, for one song or one jam.
 *
 * `plans/SONGS.md` A9 and A10, and A9's "Songs only" ended by the owner's
 * word in W30. Everything about it hangs off one rule: **the picture may
 * never cost the take.** The take is the engine's — its own threads, its own
 * clock, sample-exact against the click — and this hook is a webview feature
 * sitting beside it. So every path through here that goes wrong ends in "no
 * picture this pass", never in a throw the take's own hook has to survive.
 *
 * ## What it does NOT know
 *
 * Which mode it is serving. It was `useSongCamera` and knew about scores,
 * ranges and tempo percentages; now the one thing that differed — how to
 * turn a beat event into "how far into the music are we" — comes in as a
 * CLOCK the caller opens at the start of each pass (`TakeClock` below).
 * Songs builds one from the score; a jam builds one from its tempo, its
 * meter and the bar of the form the engine is on (`jamClock.ts`). Everything
 * else here was already about a camera and a file.
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
 * The fit and the arithmetic are in `src/takes/offset.ts`, which is
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
  takeThumbWrite,
  takeVideoAppend,
  takeVideoBegin,
  takeVideoDiscard,
  takeVideoFinish,
} from "../ipc";
import { recordVideo } from "./recorder";
import type { Recording } from "./recorder";
import { cameraConstraints, cameraSupport } from "./support";
import type { CameraSupport } from "./support";
import { fitTransportClock, videoOffsetFrom } from "./offset";
import type { ClockSample } from "./offset";
import {
  CAMERA_DEVICE_KEY,
  CAMERA_INTRO_KEY,
  MAX_CLOCK_SAMPLES,
} from "./keys";
import type { BeatEvent } from "../types";
import type { JamTake } from "../jam/types";

/** What went wrong, in words the control can say. */
export type CameraTrouble = "denied" | "noCamera" | "failed" | "lostPicture";

/**
 * How this pass's music is measured — the one thing the two modes differ on.
 *
 * Opened at the instant a pass starts and held for the whole of it, so a song
 * whose range or speed is changed mid-pass is still lined up against the
 * piece the recording is actually of. Null means "nothing to fit against this
 * pass", which is not a failure: the picture is recorded anyway and the
 * review starts it level with the sound.
 */
export type TakeClock = {
  /**
   * One beat event into one sample, or null where it is not one.
   *
   * May hold state of its own between calls — a jam's sampler uses that to
   * drop the extra ticks a subdivided click sends (`jamClock.ts`) — which is
   * why it is made per pass rather than kept.
   */
  sample: (beat: BeatEvent, arrivalMs: number) => ClockSample | null;
  /**
   * Where the finished take's FIRST SAMPLE sits on that same clock, in
   * milliseconds, or null when the take has no position to say.
   */
  startMs: (take: JamTake) => number | null;
};

export type TakeCameraState = {
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
  /**
   * W25 — the preview's element, so one frame of it can become a thumbnail.
   *
   * Handed over rather than reached for, exactly as `noteFrame` is and for
   * the same reason: the live picture is on a `<video>` that the preview owns
   * and this hook never renders. Null when the preview goes.
   */
  holdPreview: (element: HTMLVideoElement | null) => void;
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

export type TakeCameraInput = {
  /**
   * The song or the jam the pending picture is filed under until the take is
   * named. Null — nothing loaded — and the camera does not open.
   */
  ownerId: string | null;
  /**
   * This screen is the one showing. The camera closes when it is not, which
   * is what makes the laptop's little light an honest signal.
   */
  active: boolean;
  isPlaying: boolean;
  /** The switch, off the song's or the jam's own record. */
  enabled: boolean;
  /** Write it back, and turn Record the take on with it. */
  onSetCamera: (next: boolean) => void;
  /** See [`TakeClock`]. Called once, at the start of each pass. */
  openClock: () => TakeClock | null;
};

export function useTakeCamera({
  ownerId,
  active,
  isPlaying,
  enabled,
  onSetCamera,
  openClock,
}: TakeCameraInput): TakeCameraState {
  const support = useMemo(() => cameraSupport(), []);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [devices, setDevices] = useState<{ deviceId: string; label: string }[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [trouble, setTrouble] = useState<CameraTrouble | null>(null);
  const [introOpen, setIntroOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [lastCost, setLastCost] = useState<TakeCameraState["lastCost"]>(null);
  const [lastVideo, setLastVideo] = useState<TakeCameraState["lastVideo"]>(undefined);

  const introSeen = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingRef = useRef<Recording | null>(null);
  /** The beat events of the pass being recorded, for the clock fit. */
  const samples = useRef<ClockSample[]>([]);
  /** The clock this pass was opened against. See [`TakeClock`]. */
  const against = useRef<TakeClock | null>(null);
  /** The recorder's answer, once it has stopped. */
  const result = useRef<Awaited<ReturnType<Recording["stop"]>> | null>(null);
  /**
   * The live `openClock`, without re-arming the effect that starts a pass.
   *
   * A caller builds this from the jam or the song it is holding, so its
   * identity changes whenever that does — and an effect keyed on it would
   * restart the recording in the middle of a take.
   */
  const openClockRef = useRef(openClock);
  openClockRef.current = openClock;

  const armed = support.ok && enabled && active && stream !== null;

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
  const wanted = support.ok && enabled && active && ownerId !== null;
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
      const sample = held.sample(event, performance.now());
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
    if (!support.ok || !ownerId || !streamRef.current) return;
    const media = streamRef.current;
    const startedMs = Date.now();
    samples.current = [];
    result.current = null;
    setLastVideo(undefined);
    against.current = openClockRef.current();

    let live: Recording | null = null;
    void takeVideoBegin(ownerId, support.container, startedMs)
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
    // The effect's own inputs are the edge; the CLOCK is opened once at the
    // start of the pass on purpose — a range or a tempo changed mid-pass
    // would refit against a piece the recording is not of.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armed, isPlaying, ownerId, support.ok]);

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

  /**
   * W25 — the preview's element, and the frame taken off it.
   *
   * The thumbnail is grabbed at the FIRST DOWNBEAT, which is exactly when the
   * take begins: the count-in is over, the player's hands are on the
   * instrument, and a frame from a second earlier is a picture of somebody
   * waiting. It is drawn from the live preview rather than decoded out of the
   * recording afterwards — the recording is still being written at that
   * moment, and decoding a video to get one frame out of it is a second
   * decoder for a picture the screen already has.
   *
   * Not mirrored: `CameraPreview` mirrors with a CSS `transform`, which is a
   * property of that element and reaches neither the file nor this canvas, so
   * the thumbnail is the room as it was — the same as the recording.
   */
  const preview = useRef<HTMLVideoElement | null>(null);
  const holdPreview = useCallback((element: HTMLVideoElement | null) => {
    preview.current = element;
  }, []);

  /** The frame, waiting for the take to be named. */
  const thumb = useRef<Uint8Array | null>(null);

  const grabThumb = useCallback(() => {
    const video = preview.current;
    if (!video || video.readyState < 2 || video.videoWidth === 0) return;
    // 320 across, which is the widest the takes shelf can be
    // (`useMenuPlacement` caps it), so the shelf never scales one up.
    const width = 320;
    const height = Math.max(1, Math.round((video.videoHeight / video.videoWidth) * width));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    try {
      ctx.drawImage(video, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) return;
          void blob
            .arrayBuffer()
            .then((buffer) => {
              thumb.current = new Uint8Array(buffer);
            })
            .catch(() => {});
        },
        "image/jpeg",
        0.72,
      );
    } catch {
      // A camera that stopped between the check and the draw. A take with no
      // thumbnail is a take, and the shelf draws a plain tile for it.
    }
  }, []);

  const onTakeStarted = useCallback(() => {
    // The recorder started with the TRANSPORT, which is before this — so
    // there is nothing to start here. What this moment IS is the first
    // downbeat, which is the frame worth keeping.
    thumb.current = null;
    grabThumb();
  }, [grabThumb]);

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
          ? videoOffsetFrom({
              fit,
              firstFrameAt: answer.firstFrameAt,
              // The clock that measured the beat events is the one that has
              // to place the take's first sample, or the two ends of the
              // subtraction are on different rulers.
              takeStartMs: held.startMs(take),
            })
          : null;
      void takeVideoFinish(take.id, offset)
        .then((made) => {
          setLastVideo({ takeId: take.id, path: made.path, offsetMs: offset });
          // W25 — and the frame from the first downbeat, beside it. AFTER
          // the picture is filed, not before: a thumbnail of a take whose
          // recording then failed to land would be a row on the shelf
          // offering a picture that is not there.
          const frame = thumb.current;
          thumb.current = null;
          if (frame) void takeThumbWrite(take.id, frame).catch(() => {});
        })
        .catch(() => {
          thumb.current = null;
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
    holdPreview,
    onTakeStarted,
    onTakeFinished,
    lastCost,
    lastVideo,
  };
}
