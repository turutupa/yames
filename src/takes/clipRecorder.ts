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
import { clipLayout, clipOverlayLayout } from "./clip";
import type { ClipLayout, ClipShape } from "./clip";
import type { ClipStrip } from "./clipStrip";
import type { TimingMark } from "../containers/songs/review/marks";

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
  /**
   * The app's own display face, as a CSS font stack (W32).
   *
   * Read off the document with the colours and handed over for the same
   * reason: a canvas knows nothing about the page it is on. It was
   * `system-ui, sans-serif` hard-coded here, which is a DIFFERENT face
   * from the one the app is set in — so a chord on a clip was drawn in a
   * typeface the player had never seen in Yames.
   *
   * `recordClip` waits for it before the first frame (`document.fonts
   * .load`); without that wait the opening second of every clip is drawn
   * in whatever the canvas falls back to and then silently changes.
   */
  face: string;
};

export type ClipFrameState = {
  layout: ClipLayout;
  palette: ClipPalette;
  /** The picture, or null for a take that has none. */
  picture: CanvasImageSource | null;
  /**
   * What scrolls under the picture, and what the caption says.
   *
   * An INTERFACE rather than the score itself (W30): Songs paints the notes
   * of the piece with the verdict on them, a jam paints its bar grid with the
   * chord names, and everything else about a clip — the ground, the picture,
   * the caption's layout, the playhead, the Yames mark, the real-time
   * recording and the chunked save — is the same for both. See
   * `src/takes/clipStrip.ts`.
   */
  strip: ClipStrip;
  windowMs: number;
  nowMs: number;
  /** Whether the verdict is painted on the excerpt at all. */
  marks: boolean;
  /** Whether the Yames mark is on the clip at all. Its own switch. */
  brand: boolean;
  /** What the mark says beside the tile. Not translated: it is an address. */
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
  paintOverPicture(ctx, state);
  paintStrip(ctx, state);
  paintCaption(ctx, state);
  if (state.brand) paintMark(ctx, state);
  ctx.restore();
}

/**
 * The Yames mark: the real one, big enough to read on a phone.
 *
 * The owner asked for this by name, and every part of it is a decision:
 *
 * * **The app's own ember**, not a word in the accent colour — the amber tile
 *   with the Y knocked through it in ink, the same geometry
 *   `components/AppMark.tsx` draws and `docs/favicon.svg` carries. A clip
 *   that goes out with the brand on it has to carry the brand, and the ember
 *   is the thing people will recognise on a second one.
 * * **"yames.app" beside it**, because a logo nobody can type is a logo that
 *   sends nobody anywhere. Not translated: it is an address.
 * * **On a soft backing.** The mark sits over the picture, and the picture is
 *   whatever the room was — a white wall or a dark studio. A translucent
 *   rounded panel means the same mark is legible over both, which a plain
 *   drawing over live video is not.
 * * **Top right.** The excerpt runs the width of the frame along the bottom
 *   and the bar/section/tempo readout is under it on the left. The bottom of
 *   a phone screen is also where the caption, the play bar and a thumb are.
 */
function paintMark(ctx: CanvasRenderingContext2D, state: ClipFrameState): void {
  const { layout, wordmark } = state;
  const type = layout.type.mark;
  const inset = Math.round(type * 0.42);
  const tile = Math.round(type * 1.25);

  ctx.save();

  /*
   * The panel, MEASURED rather than estimated (W32).
   *
   * `clip.ts` sizes `layout.mark` from "roughly 0.52 of the type size per
   * character for a system sans", because it is pure arithmetic with no
   * rendering context to ask. That estimate is fine for a sans and wrong for
   * a serif: under Ivory, whose display face is one, "yames.app" overran the
   * panel and the final "p" was clipped by the right edge of a 720-wide
   * frame. This file HAS a context, so it measures the word and widens the
   * panel to fit, keeping the same right-hand inset the layout chose — the
   * mark stays in the corner it belongs in and is never covered or cut.
   */
  ctx.font = `600 ${type}px ${state.palette.face}`;
  const wordWidth = ctx.measureText(wordmark).width;
  const gap = Math.round(type * 0.4);
  const planned = layout.mark;
  const rightInset = layout.width - (planned.x + planned.width);
  const width = Math.max(planned.width, inset * 2 + tile + gap + Math.ceil(wordWidth));
  const box = {
    x: layout.width - rightInset - width,
    y: planned.y,
    width,
    height: planned.height,
  };

  // The backing. Dark and translucent rather than the theme's own card: the
  // clip may be watched anywhere, and what it has to survive is the picture
  // behind it rather than the app it was made in.
  roundedPath(ctx, box.x, box.y, box.width, box.height, Math.round(box.height * 0.34));
  ctx.fillStyle = "rgba(11, 10, 20, 0.55)";
  ctx.fill();

  // The ember tile: the gradient and the 15/64 corner radius of the real
  // mark, scaled. `AppMark.tsx` is the original and its header explains that
  // the geometry is copied by hand in three places already; this is a fourth,
  // on a canvas, and `clip.test.ts` pins the proportions rather than the
  // pixels.
  const tileX = box.x + inset;
  const tileY = box.y + Math.round((box.height - tile) / 2);
  const gradient = ctx.createLinearGradient(
    tileX + tile * (6 / 64),
    tileY,
    tileX + tile * (58 / 64),
    tileY + tile,
  );
  gradient.addColorStop(0, "#FFC24D");
  gradient.addColorStop(1, "#E8760C");
  roundedPath(ctx, tileX, tileY, tile, tile, tile * (15 / 64));
  ctx.fillStyle = gradient;
  ctx.fill();

  // The Y, knocked through in ink — the fork is the metronome's swing and
  // the stem is the rod, which is why it is two strokes and not a glyph.
  const at = (x: number, y: number) => [tileX + (x / 64) * tile, tileY + (y / 64) * tile] as const;
  ctx.strokeStyle = "#0B0A14";
  ctx.lineWidth = (8 / 64) * tile;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(...at(18, 17));
  ctx.lineTo(...at(32, 37));
  ctx.lineTo(...at(46, 17));
  ctx.moveTo(...at(32, 37));
  ctx.lineTo(...at(32, 48));
  ctx.stroke();

  ctx.fillStyle = "#FFFFFF";
  ctx.font = `600 ${type}px ${state.palette.face}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(wordmark, tileX + tile + gap, box.y + box.height / 2 + 1);

  ctx.restore();
}

/**
 * A rounded rectangle, by hand.
 *
 * `roundRect` is on every webview this app ships on except the oldest
 * WebKitGTK builds, and a clip that threw on one of those would be a clip
 * that could not be made at all rather than one drawn with square corners.
 */
function roundedPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.arcTo(x + width, y, x + width, y + r, r);
  ctx.lineTo(x + width, y + height - r);
  ctx.arcTo(x + width, y + height, x + width - r, y + height, r);
  ctx.lineTo(x + r, y + height);
  ctx.arcTo(x, y + height, x, y + height - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
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
  const { picture, layout, strip, palette, nowMs } = state;
  const box = layout.picture;
  if (!picture) {
    // NO CAMERA, and the renderer may want the room. See
    // `ClipStrip.paintInsteadOfPicture` — a jam's clip without a picture is
    // the chords going by, and they should fill the frame rather than hide in
    // a band along the bottom of it.
    if (strip.paintInsteadOfPicture) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(box.x, box.y, box.width, box.height);
      ctx.clip();
      strip.paintInsteadOfPicture(ctx, { box, layout, palette, nowMs });
      ctx.restore();
    }
    return;
  }

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

/**
 * What the renderer wants ON the picture — the chord, and the next one.
 *
 * After the picture and before the strip, with the picture's own box, so a
 * jam can put the chord you are playing over large in a lower corner of the
 * frame. Songs has nothing to put here and does not implement it.
 *
 * Not folded into `paintInto`: the strip is a band this file clips to and
 * draws a playhead through, and a chord a fifth of the frame high does not
 * live in a band.
 */
function paintOverPicture(ctx: CanvasRenderingContext2D, state: ClipFrameState): void {
  const { layout, palette, strip, nowMs, picture } = state;
  if (!strip.paintOverPicture) return;
  const box = layout.picture;
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.width, box.height);
  ctx.clip();
  strip.paintOverPicture(ctx, {
    box,
    layout,
    palette,
    nowMs,
    hasPicture: picture !== null,
  });
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
  const { layout, palette, strip, nowMs, windowMs, marks, picture } = state;
  const box = layout.strip;

  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.width, box.height);
  ctx.clip();

  // Over a picture the renderer lays its own ground — this file has never
  // seen the room behind it and cannot know how dark it has to be.
  if (!strip.overlay) {
    ctx.fillStyle = palette.line;
    ctx.globalAlpha = 0.35;
    ctx.fillRect(box.x, box.y, box.width, box.height);
    ctx.globalAlpha = 1;
  }

  // WHAT MOVES is the renderer's, and the only part of a clip that differs
  // between a song and a jam. The ground under it, the clip region around it
  // and the playhead over it are this file's, so a second renderer cannot get
  // any of those subtly different. It is given a clean context and may leave
  // it however it likes: `restore` below puts it back.
  ctx.save();
  strip.paintInto(ctx, {
    box,
    layout,
    palette,
    nowMs,
    windowMs,
    marks,
    hasPicture: picture !== null,
  });
  ctx.restore();

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
  const { layout, palette, strip, nowMs, words, picture } = state;
  const box = layout.caption;
  const caption = strip.captionAt(nowMs);
  // OVER A PICTURE the ink is light in every theme, and that is the same
  // rule the Yames mark keeps two functions above: what a clip has to
  // survive is the room it was filmed in, not the app it was made in. A
  // light theme’s ink is dark brown, and dark brown over somebody’s living
  // room is a caption nobody can read. The theme still decides the accent,
  // the grid and everything on a clip with no picture.
  const over = strip.overlay === true && picture !== null;
  const ink = over ? "#FFFFFF" : palette.ink;
  const quiet = over ? "rgba(255, 255, 255, 0.78)" : palette.quiet;

  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const middle = box.y + box.height / 2;

  ctx.fillStyle = ink;
  if (over) {
    ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
    ctx.shadowBlur = Math.round(layout.type.caption * 0.5);
  }
  ctx.font = `600 ${layout.type.caption}px ${palette.face}`;
  const bar = `${words.bar} ${String(caption.printedBar)}`;
  ctx.fillText(bar, box.x, middle);
  const barWidth = ctx.measureText(bar).width;

  ctx.fillStyle = quiet;
  ctx.font = `${layout.type.section}px ${palette.face}`;
  const rest = [caption.section, `${String(caption.bpm)} ${words.bpm}`]
    .filter(Boolean)
    .join("  ·  ");
  ctx.fillText(rest, box.x + barWidth + 16, middle + 1);
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
  /** The Yames mark, on or off. Its own switch (the owner, W25). */
  brand: boolean;
  /** The stretch of the take, in transport milliseconds. */
  span: { startMs: number; endMs: number };
  /** The take's mix, as a media element will load it. */
  mixSrc: string;
  /** The picture, or null for a take without one. */
  videoSrc: string | null;
  startOffsetMs: number;
  videoOffsetMs: number;
  /** What scrolls, and what the caption says. See [`ClipFrameState`]. */
  strip: ClipStrip;
  /** How much of the take is across the strip at once. */
  windowMs: number;
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
    brand,
    span,
    mixSrc,
    videoSrc,
    startOffsetMs,
    videoOffsetMs,
    strip,
    windowMs,
    palette,
    wordmark,
    words,
    mimeType,
    sink,
    onProgress,
  } = options;

  const layout = strip.overlay ? clipOverlayLayout(shape) : clipLayout(shape);
  canvas.width = layout.width;
  canvas.height = layout.height;
  const ctx = canvas.getContext("2d", { alpha: false });

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
        strip,
        windowMs,
        nowMs,
        marks,
        brand,
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
    // The face, before a single frame is painted.
    //
    // A canvas asked to draw in a face it has not loaded draws in the
    // fallback and swaps silently when the face arrives — which in a
    // real-time recording means the opening second of the clip is in the
    // wrong typeface, permanently, in the file. `document.fonts.load`
    // takes a CSS font shorthand, and it has to be asked for every WEIGHT
    // the clip uses or the bold chord is the one that swaps.
    await warmFace(palette.face);
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

/**
 * Load every weight the clip draws in, and never fail because of it.
 *
 * One size is enough per weight: `FontFaceSet.load` resolves a family and
 * a weight, and the size in the shorthand only has to parse. A webview
 * without `document.fonts` (and there are still a few) simply gets the
 * behaviour it had before this existed.
 */
async function warmFace(face: string): Promise<void> {
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (!fonts || typeof fonts.load !== "function") return;
  try {
    await Promise.all([
      fonts.load(`400 32px ${face}`),
      fonts.load(`600 32px ${face}`),
      fonts.load(`700 96px ${face}`),
    ]);
  } catch {
    // A face the browser will not resolve is a face it will fall back
    // from, which is what it would have done anyway.
  }
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
