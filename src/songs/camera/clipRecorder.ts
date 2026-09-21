/**
 * Making the clip: one canvas, one audio graph, one `MediaRecorder`.
 *
 * `W21-CAMERA.md` addendum 12. `clip.ts` is the arithmetic of the picture and
 * is pure; this is the half that touches a rendering context, a media element
 * and a clock, and it holds no idea of its own about where anything goes.
 *
 * ## Why there is no encoder in this repository
 *
 * `plans/SONGS.md` A10 left joining the picture to the sound as "a later step
 * … needs an encoder whose licence has to be checked against GPL-3 before it
 * is promised". This is that step, and the answer is that there is no encoder
 * to license: the webview already has one, the one it recorded the picture
 * with, and `MediaRecorder` over `canvas.captureStream()` is how you reach
 * it. No dependency, no licence question, and the clip is written in real
 * time — a forty-second take takes forty seconds, which is why there is a
 * progress ring and a cancel.
 *
 * ## The canvas must stay origin-clean, and this is why it does
 *
 * `canvas.captureStream()` throws `SecurityError` on a canvas that has had a
 * cross-origin image drawn into it, and in the shipping app the take and its
 * picture come from Tauri's asset protocol, which is a DIFFERENT origin from
 * the window (`http://asset.localhost` against `http://tauri.localhost` on
 * Windows). What makes it legal is that the asset protocol answers with
 * `Access-Control-Allow-Origin: <window origin>` on every response —
 * `tauri/src/protocol/asset.rs` sets it on the success path and on all four
 * failure paths — so the elements below ask for CORS with
 * `crossOrigin = "anonymous"`, get it, and count as clean. Take that line off
 * either element and the clip stops being possible at all, silently, in the
 * real app and not in the harness (whose sources are same-origin blobs).
 *
 * ## The sound is the take's MIX, and it is not a second recording
 *
 * A `MediaElementAudioSourceNode` over the take's own WAV, into a
 * `MediaStreamAudioDestinationNode` for the recorder and into the speakers so
 * the player hears what is being made. **The microphone is never opened** —
 * the same promise the camera keeps, kept here by there being no code that
 * could.
 */
import { createChunkPipe } from "./chunks";
import type { ChunkSink } from "./chunks";
import { captionAt, clipLayout, clipWindowMs, visibleBars, visibleTicks } from "./clip";
import type { ClipLayout, ClipShape } from "./clip";
import type { Tape } from "./tape";
import type { BarRange } from "../schedule";
import type { SongScore } from "../types";
import type { TimingMark } from "../../containers/songs/review/marks";

/** How often the canvas is sampled. 30 is what the camera records at. */
export const CLIP_FPS = 30;

/** How often a chunk is handed over and written. The camera's number. */
const CLIP_CHUNK_MS = 1000;

/** How far the picture may drift from the sound before it is pulled back. */
const DRIFT_MS = 90;

/**
 * Every colour the clip is painted in, already resolved.
 *
 * Custom properties mean nothing to a canvas, so the caller reads them off
 * the document once and hands them over — which also means the clip comes out
 * in the theme the player is looking at, rather than in a palette this file
 * invented.
 */
export type ClipPalette = {
  ground: string;
  ink: string;
  quiet: string;
  line: string;
  accent: string;
  /** One per timing mark, in the order `marks.ts` names them. */
  marks: Record<TimingMark, string>;
};

export type ClipFrameState = {
  layout: ClipLayout;
  palette: ClipPalette;
  /** The picture, or null for a take that has none. */
  picture: CanvasImageSource | null;
  tape: Tape;
  score: SongScore;
  range: BarRange;
  tempoPercent: number;
  windowMs: number;
  nowMs: number;
  /** Whether the verdict is painted on the excerpt at all. */
  marks: boolean;
  /** What the small mark in the corner says. */
  wordmark: string;
  /** "Bar" and the tempo unit, translated by the caller. */
  words: { bar: string; bpm: string };
};

/**
 * One frame of the clip.
 *
 * Exported and called once per animation frame rather than kept private, so
 * the same function draws the still preview the screen shows before anybody
 * presses anything — a player should see what they are about to make.
 */
export function paintClipFrame(ctx: CanvasRenderingContext2D, state: ClipFrameState): void {
  const { layout, palette } = state;

  ctx.save();
  ctx.fillStyle = palette.ground;
  ctx.fillRect(0, 0, layout.width, layout.height);

  paintPicture(ctx, state);
  paintStrip(ctx, state);
  paintCaption(ctx, state);
  ctx.restore();
}

/**
 * The picture, filling its box without stretching anybody.
 *
 * `cover` rather than `contain`: a clip with black bars down both sides is a
 * clip that looks like a mistake, and a webcam's 4:3 cropped to 16:9 loses
 * ceiling and floor, which is not where the hands are. With no picture the
 * box is left as the ground — a player without a camera still gets a clip,
 * which is the point of item 2 saying so.
 */
function paintPicture(ctx: CanvasRenderingContext2D, state: ClipFrameState): void {
  const { picture, layout } = state;
  const box = layout.picture;
  if (!picture) return;

  const source = sourceSize(picture);
  if (!source) return;
  const scale = Math.max(box.width / source.width, box.height / source.height);
  const width = source.width * scale;
  const height = source.height * scale;
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.width, box.height);
  ctx.clip();
  ctx.drawImage(
    picture,
    box.x + (box.width - width) / 2,
    box.y + (box.height - height) / 2,
    width,
    height,
  );
  ctx.restore();
}

/** How big the thing being drawn is, whichever kind of source it is. */
function sourceSize(source: CanvasImageSource): { width: number; height: number } | null {
  const video = source as HTMLVideoElement;
  if (typeof video.videoWidth === "number" && video.videoWidth > 0) {
    return { width: video.videoWidth, height: video.videoHeight };
  }
  const image = source as HTMLImageElement;
  if (typeof image.width === "number" && image.width > 0) {
    return { width: image.width, height: image.height };
  }
  return null;
}

/**
 * The scrolling excerpt: the notes you were asked for, where they fell.
 *
 * The playhead is fixed at the middle and the music moves past it, which is
 * the way every tab that scrolls works and the only arrangement in which the
 * eye has somewhere to rest. The marks are the review's own — the same
 * colours and the same glyphs, because a clip is a picture of the review and
 * not a second opinion — and turning them off leaves the notes in the
 * theme's plain ink, for a player who wants to show the playing rather than
 * the marking.
 */
function paintStrip(ctx: CanvasRenderingContext2D, state: ClipFrameState): void {
  const { layout, palette, tape, nowMs, windowMs, marks } = state;
  const box = layout.strip;

  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.width, box.height);
  ctx.clip();

  ctx.fillStyle = palette.line;
  ctx.globalAlpha = 0.35;
  ctx.fillRect(box.x, box.y, box.width, box.height);
  ctx.globalAlpha = 1;

  // Bar lines, and the section names that open on them.
  ctx.strokeStyle = palette.quiet;
  ctx.lineWidth = 1;
  ctx.font = `600 ${layout.type.section}px system-ui, sans-serif`;
  ctx.textBaseline = "top";
  for (const bar of visibleBars(tape, nowMs, windowMs)) {
    const x = box.x + bar.at * box.width;
    ctx.beginPath();
    ctx.moveTo(x, box.y);
    ctx.lineTo(x, box.y + box.height);
    ctx.stroke();
    if (bar.section) {
      ctx.fillStyle = palette.quiet;
      ctx.fillText(bar.section, x + 6, box.y + 4);
    }
  }

  // The notes.
  const midline = box.y + box.height * 0.62;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${Math.round(box.height * 0.42)}px system-ui, sans-serif`;
  for (const { tick, at } of visibleTicks(tape, nowMs, windowMs)) {
    const x = box.x + at * box.width;
    ctx.fillStyle = marks ? state.palette.marks[tick.mark] : palette.ink;
    ctx.beginPath();
    ctx.arc(x, midline, Math.max(3, box.height * 0.08), 0, Math.PI * 2);
    ctx.fill();
  }

  // The playhead, last so nothing is drawn over it.
  const head = box.x + box.width / 2;
  ctx.strokeStyle = palette.accent;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(head, box.y);
  ctx.lineTo(head, box.y + box.height);
  ctx.stroke();

  ctx.restore();
}

/** Bar, section, tempo — and the mark that is the whole point of the clip. */
function paintCaption(ctx: CanvasRenderingContext2D, state: ClipFrameState): void {
  const { layout, palette, tape, score, range, tempoPercent, nowMs, words, wordmark } = state;
  const box = layout.caption;
  const caption = captionAt(tape, score, range, tempoPercent, nowMs);

  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const middle = box.y + box.height / 2;

  ctx.fillStyle = palette.ink;
  ctx.font = `600 ${layout.type.caption}px system-ui, sans-serif`;
  const bar = `${words.bar} ${String(caption.printedBar)}`;
  ctx.fillText(bar, box.x, middle);
  const barWidth = ctx.measureText(bar).width;

  ctx.fillStyle = palette.quiet;
  ctx.font = `${layout.type.section}px system-ui, sans-serif`;
  const rest = [caption.section, `${String(caption.bpm)} ${words.bpm}`]
    .filter(Boolean)
    .join("  ·  ");
  ctx.fillText(rest, box.x + barWidth + 16, middle + 1);

  // The mark. Small, quiet and always there: every clip anybody shares says
  // where it was made, which is the whole of the growth loop D4 is about.
  ctx.textAlign = "right";
  ctx.fillStyle = palette.accent;
  ctx.font = `600 ${layout.type.mark}px system-ui, sans-serif`;
  ctx.fillText(wordmark, layout.mark.x + layout.mark.width, middle);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

export type ClipResult = {
  /** Chunks that reached the sink. */
  chunks: number;
  /** What ended it early, if anything did. */
  error: unknown;
  /** The player pressed cancel. */
  cancelled: boolean;
};

export type ClipRun = {
  /** Settles when the recorder has stopped and everything queued is written. */
  done: Promise<ClipResult>;
  /** Stop now and report `cancelled`. Safe to call twice. */
  cancel: () => void;
  /** 0 to 1, read by the ring. */
  readonly progress: number;
};

export type RecordClipOptions = {
  canvas: HTMLCanvasElement;
  shape: ClipShape;
  marks: boolean;
  /** The stretch of the take, in transport milliseconds. */
  span: { startMs: number; endMs: number };
  /** The take's mix, as a media element will load it. */
  mixSrc: string;
  /** The picture, or null for a take without one. */
  videoSrc: string | null;
  startOffsetMs: number;
  videoOffsetMs: number;
  tape: Tape;
  score: SongScore;
  range: BarRange;
  tempoPercent: number;
  palette: ClipPalette;
  wordmark: string;
  words: { bar: string; bpm: string };
  mimeType: string;
  /** Where each chunk goes — the same pipe the camera writes down. */
  sink: ChunkSink;
  onProgress?: (fraction: number) => void;
};

/**
 * A media element pointed at one of the take's files, asking for CORS.
 *
 * See the header: `crossOrigin` is what keeps the canvas origin-clean, and
 * without it `captureStream()` refuses in the shipping app while working
 * perfectly in every test.
 */
function mediaElement<T extends HTMLMediaElement>(element: T, src: string): T {
  element.crossOrigin = "anonymous";
  element.preload = "auto";
  element.src = src;
  return element;
}

/**
 * Make the clip. Resolves when the file has been written, or says why not.
 *
 * Real time, because the picture is a real picture being played: the canvas
 * is painted from the video element as it plays and the recorder samples the
 * canvas. There is no faster mode available to a webview, and pretending
 * otherwise would mean an encoder and a licence (see the header).
 */
export function recordClip(options: RecordClipOptions): ClipRun {
  const {
    canvas,
    shape,
    marks,
    span,
    mixSrc,
    videoSrc,
    startOffsetMs,
    videoOffsetMs,
    tape,
    score,
    range,
    tempoPercent,
    palette,
    wordmark,
    words,
    mimeType,
    sink,
    onProgress,
  } = options;

  const layout = clipLayout(shape);
  canvas.width = layout.width;
  canvas.height = layout.height;
  const ctx = canvas.getContext("2d", { alpha: false });

  const windowMs = clipWindowMs(score, range, tempoPercent);
  const audio = mediaElement(document.createElement("audio"), mixSrc);
  const video = videoSrc ? mediaElement(document.createElement("video"), videoSrc) : null;
  if (video) {
    video.muted = true;
    video.playsInline = true;
  }

  const pipe = createChunkPipe(sink);
  let progress = 0;
  let cancelled = false;
  let failure: unknown = null;
  let frame = 0;
  let settled: ((r: ClipResult) => void) | null = null;
  let finishedOnce = false;

  const audioAt = (ms: number) => Math.max(0, (ms + startOffsetMs) / 1000);
  const videoAt = (ms: number) => Math.max(0, (ms + startOffsetMs + videoOffsetMs) / 1000);

  let context: AudioContext | null = null;
  let recorder: MediaRecorder | null = null;
  let stream: MediaStream | null = null;

  const tearDown = () => {
    cancelAnimationFrame(frame);
    audio.pause();
    video?.pause();
    // Every track stopped rather than dropped: a canvas capture nobody holds
    // goes on sampling until the collector gets to it, on a machine that has
    // just been asked to encode video for forty seconds.
    stream?.getTracks().forEach((track) => track.stop());
    void context?.close().catch(() => {});
    audio.removeAttribute("src");
    video?.removeAttribute("src");
  };

  const finish = () => {
    if (finishedOnce) return;
    finishedOnce = true;
    tearDown();
    void pipe.drain().then(() => {
      settled?.({ chunks: pipe.written, error: failure ?? pipe.error, cancelled });
    });
  };

  const done = new Promise<ClipResult>((resolve) => {
    settled = resolve;
  });

  const stopRecorder = () => {
    cancelAnimationFrame(frame);
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
        return;
      } catch (e) {
        failure = failure ?? e;
      }
    }
    finish();
  };

  const tick = () => {
    frame = requestAnimationFrame(tick);
    const nowMs = audio.currentTime * 1000 - startOffsetMs;

    if (ctx) {
      paintClipFrame(ctx, {
        layout,
        palette,
        picture: video && video.readyState >= 2 ? video : null,
        tape,
        score,
        range,
        tempoPercent,
        windowMs,
        nowMs,
        marks,
        wordmark,
        words,
      });
    }

    const length = Math.max(1, span.endMs - span.startMs);
    progress = Math.min(1, Math.max(0, (nowMs - span.startMs) / length));
    onProgress?.(progress);

    if (video && video.readyState >= 1) {
      const wanted = videoAt(nowMs);
      if (Math.abs(video.currentTime - wanted) * 1000 > DRIFT_MS) video.currentTime = wanted;
    }

    if (nowMs >= span.endMs) {
      progress = 1;
      onProgress?.(1);
      stopRecorder();
    }
  };

  /** Everything that has to have happened before a single frame is recorded. */
  const ready = (async () => {
    await whenReady(audio);
    if (video) await whenReady(video);
    audio.currentTime = audioAt(span.startMs);
    if (video) video.currentTime = videoAt(span.startMs);

    // The sound, into the recorder AND into the speakers. Hearing the clip
    // being made is how a player knows it has sound in it — a silent progress
    // ring for forty seconds and then a file is not something anybody would
    // trust twice.
    const Ctx = (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext;
    if (!Ctx) throw new Error("this webview has no audio graph");
    context = new Ctx();
    const destination = context.createMediaStreamDestination();
    const source = context.createMediaElementSource(audio);
    source.connect(destination);
    source.connect(context.destination);

    const painted = canvas.captureStream(CLIP_FPS);
    stream = new MediaStream([
      ...painted.getVideoTracks(),
      ...destination.stream.getAudioTracks(),
    ]);

    recorder = new MediaRecorder(stream, {
      mimeType,
      // 720p at a bitrate that survives being re-encoded by whatever the
      // player posts it to, without making a forty-second clip a file nobody
      // can send.
      videoBitsPerSecond: 4_000_000,
      audioBitsPerSecond: 128_000,
    });
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) pipe.push(event.data);
    };
    recorder.onerror = (event) => {
      failure = failure ?? event;
      stopRecorder();
    };
    recorder.onstop = finish;

    recorder.start(CLIP_CHUNK_MS);
    await audio.play();
    await video?.play();
    frame = requestAnimationFrame(tick);
  })();

  void ready.catch((e: unknown) => {
    failure = failure ?? e;
    finish();
  });

  return {
    done,
    cancel() {
      if (finishedOnce) return;
      cancelled = true;
      stopRecorder();
    },
    get progress() {
      return progress;
    },
  };
}

/** Wait for a media element to know how long it is and where its frames are. */
function whenReady(element: HTMLMediaElement): Promise<void> {
  if (element.readyState >= 2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const ok = () => {
      element.removeEventListener("error", bad);
      resolve();
    };
    const bad = () => {
      element.removeEventListener("loadeddata", ok);
      reject(new Error("that take could not be opened"));
    };
    element.addEventListener("loadeddata", ok, { once: true });
    element.addEventListener("error", bad, { once: true });
    element.load();
  });
}
