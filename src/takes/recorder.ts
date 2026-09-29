/**
 * `MediaRecorder`, wrapped so a camera failure costs the picture and never
 * the take.
 *
 * The rule from `W21-CAMERA.md` item 2, stated once here because every branch
 * in this file is an expression of it: the take is the engine's, recorded on
 * its own threads, and nothing the webview's camera does may reach it. So
 * every path out of this module ends in "the recording stopped and said why",
 * and none of them throws into the caller that is also stopping a take.
 *
 * What it adds over the browser's object:
 *
 * * **The first frame's time**, which is the whole of the alignment
 *   (`offset.ts`). `MediaRecorder` will not tell you; the preview element's
 *   `requestVideoFrameCallback` will, so the owner of the preview calls
 *   `noteFrame` and the first one at or after `start()` wins. With no such
 *   callback the clock reading taken beside `start()` stands, and the note in
 *   `firstFrameSource` says which it was, so the review can be honest.
 * * **Chunks going straight to disk** through `chunks.ts`.
 * * **A count of what the encoder could not keep up with**, off the track's
 *   own statistics, because "is the camera costing the click anything" is a
 *   question spike K3 has to answer with numbers.
 */
import { createChunkPipe } from "./chunks";
import type { ChunkSink } from "./chunks";
import { CHUNK_MS } from "./support";

/** Where the first frame's timestamp came from, so nothing overstates it. */
export type FrameClockSource = "frameCallback" | "recorderStart";

export type RecordingResult = {
  /** `performance.now()` for the first frame of the recording. */
  firstFrameAt: number;
  firstFrameSource: FrameClockSource;
  /** Chunks that reached the disk. */
  chunks: number;
  /** What ended it early, if anything did. */
  error: unknown;
  /** Frames the camera produced but the encoder dropped, when it will say. */
  droppedFrames: number | null;
  /** Frames the camera delivered over the recording, when it will say. */
  deliveredFrames: number | null;
};

export type Recording = {
  /** Called by the preview when a frame is painted. The first one wins. */
  noteFrame: (atMs: number) => void;
  /** Stop, flush everything queued, and report. Never throws. */
  stop: () => Promise<RecordingResult>;
  /** Is it still running? */
  readonly live: boolean;
};

/** Just enough of `MediaRecorder` to be swapped for a fake in a test. */
export type RecorderLike = {
  start: (timesliceMs?: number) => void;
  stop: () => void;
  ondataavailable: ((event: { data: Blob }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onstop: (() => void) | null;
  readonly state?: string;
};

export type RecordVideoOptions = {
  /** Already-opened camera stream. Video only — see `cameraConstraints`. */
  stream: MediaStream;
  mimeType: string;
  /** Where each chunk goes. */
  sink: ChunkSink;
  /** Built here so tests can hand in a fake without touching globals. */
  makeRecorder?: (stream: MediaStream, mimeType: string) => RecorderLike;
  now?: () => number;
  timesliceMs?: number;
};

function defaultRecorder(stream: MediaStream, mimeType: string): RecorderLike {
  const Ctor = (window as unknown as { MediaRecorder: new (s: MediaStream, o: object) => RecorderLike })
    .MediaRecorder;
  return new Ctor(stream, {
    mimeType,
    // Enough for 720p30 to look like the player rather than like a fax of
    // them, and small enough that twenty minutes is a few hundred megabytes
    // rather than a few gigabytes.
    videoBitsPerSecond: 2_500_000,
  });
}

/**
 * How many frames the camera made and how many the encoder could not take.
 *
 * `MediaStreamTrack.getSettings` does not carry these and `getStats` is on the
 * peer connection, not the track — what IS available in Chromium is the
 * track's own frame counters. Neither WebKit exposes them, so the answer is
 * `null` rather than zero: "the encoder dropped nothing" and "nobody is
 * counting" are different facts and only one of them is worth reporting.
 */
function frameCounts(stream: MediaStream): { delivered: number | null; dropped: number | null } {
  const track = stream.getVideoTracks()[0] as
    | (MediaStreamTrack & { stats?: { deliveredFrames?: number; discardedFrames?: number; totalFrames?: number } })
    | undefined;
  const stats = track?.stats;
  if (!stats) return { delivered: null, dropped: null };
  const delivered = typeof stats.deliveredFrames === "number" ? stats.deliveredFrames : null;
  const discarded = typeof stats.discardedFrames === "number" ? stats.discardedFrames : null;
  return { delivered, dropped: discarded };
}

/**
 * Start recording. Throws only if the recorder could not be built at all —
 * which the caller treats as "no picture this pass" and nothing more.
 */
export function recordVideo(options: RecordVideoOptions): Recording {
  const {
    stream,
    mimeType,
    sink,
    makeRecorder = defaultRecorder,
    now = () => performance.now(),
    timesliceMs = CHUNK_MS,
  } = options;

  const pipe = createChunkPipe(sink);
  const recorder = makeRecorder(stream, mimeType);
  const before = frameCounts(stream);

  let firstFrameAt: number | null = null;
  let firstFrameSource: FrameClockSource = "recorderStart";
  let live = true;
  let failure: unknown = null;
  let stopped: ((r: RecordingResult) => void) | null = null;
  let stoppedOnce = false;

  recorder.ondataavailable = (event) => {
    if (event?.data && event.data.size > 0) pipe.push(event.data);
  };
  recorder.onerror = (event) => {
    // The camera went away mid-take — unplugged, taken by another app, a
    // driver that gave up. The picture is lost and the take is untouched.
    failure = event ?? new Error("the camera stopped");
    try {
      recorder.stop();
    } catch {
      // Already stopping. `onstop` still settles the promise below.
    }
  };

  const finish = () => {
    if (stoppedOnce) return;
    stoppedOnce = true;
    live = false;
    void pipe.drain().then(() => {
      const after = frameCounts(stream);
      const delivered =
        after.delivered !== null && before.delivered !== null
          ? after.delivered - before.delivered
          : after.delivered;
      const dropped =
        after.dropped !== null && before.dropped !== null
          ? after.dropped - before.dropped
          : after.dropped;
      stopped?.({
        firstFrameAt: firstFrameAt ?? startedAt,
        firstFrameSource,
        chunks: pipe.written,
        error: failure ?? pipe.error,
        droppedFrames: dropped,
        deliveredFrames: delivered,
      });
    });
  };
  recorder.onstop = finish;

  // The reading beside `start()` is the fallback, taken BEFORE the call so it
  // can only ever be early — an early estimate makes the picture slightly
  // ahead of the sound, which the nudge moves back; a late one would need the
  // nudge to go the other way and nobody would know which.
  const startedAt = now();
  recorder.start(timesliceMs);

  return {
    noteFrame(atMs: number) {
      if (firstFrameAt !== null || !Number.isFinite(atMs)) return;
      if (atMs < startedAt) return;
      firstFrameAt = atMs;
      firstFrameSource = "frameCallback";
    },
    stop() {
      return new Promise<RecordingResult>((resolve) => {
        stopped = resolve;
        if (stoppedOnce) {
          // Already finished — an error stopped it before the caller did.
          stoppedOnce = false;
          finish();
          return;
        }
        try {
          recorder.stop();
        } catch (e) {
          failure = failure ?? e;
          finish();
        }
      });
    },
    get live() {
      return live;
    },
  };
}
