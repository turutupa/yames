/**
 * The little mirror on the stage — and what it does while you play.
 *
 * `W21-CAMERA.md` item 9: it should feel like a studio, not like a webcam
 * test. Three states, and the difference between them is the whole idea:
 *
 * * **Armed and stopped** — a small mirrored picture. You are framing up, so
 *   you look at yourself, and once per install a faint neck-shaped outline
 *   says "get both hands in" (with a flip for a left-handed player, because a
 *   guide drawn the wrong way round is worse than no guide).
 * * **Counting in** — the count over the picture. The player is looking at the
 *   thing that is about to matter, and it is here rather than only over the
 *   tab because this is where their eyes already are.
 * * **Running** — it shrinks to a quiet ring and the elapsed time. The tab is
 *   what you should be reading while you play; a live picture of your own face
 *   beside it is the single most distracting thing this app could draw.
 *
 * Mirrored, always, while recording: a mirror is how a person knows which hand
 * is which. The FILE is not mirrored — `transform` is a property of this
 * element and nothing about it reaches `MediaRecorder` — so the recording is
 * the room as it was, which is what somebody watching it back wants.
 *
 * Draggable between the four corners of the stage, and remembered, because
 * where it is out of the way depends on the song, the window and the player.
 *
 * ## The frame callback, and why it is here
 *
 * `requestVideoFrameCallback` is the only thing in a browser that says when a
 * frame was actually captured, and it exists on a `<video>` element rather
 * than on a stream. So the element showing the preview is also what tells
 * `useSongCamera` the instant the first frame landed, which is one half of the
 * alignment (`src/songs/camera/offset.ts`). A webview without it costs the
 * clock reading beside `MediaRecorder.start()` instead, and the review says as
 * much.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { storeLoad, storeSave } from "../../../ipc";
import { CAMERA_CORNER_KEY, CAMERA_GUIDE_KEY } from "../../../songs/camera/keys";
import type { SongCameraState } from "./useSongCamera";

export type PreviewCorner = "topLeft" | "topRight" | "bottomLeft" | "bottomRight";

const CORNERS: PreviewCorner[] = ["topLeft", "topRight", "bottomLeft", "bottomRight"];

/** `1:04`, the clock the transport writes. */
function elapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function CameraPreview({
  camera,
  countIn,
  recordingSince,
}: {
  camera: SongCameraState;
  /** The count a person would say out loud, or null. */
  countIn: number | null;
  /** `Date.now()` when this pass started recording, or null. */
  recordingSince: number | null;
}) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [corner, setCorner] = useState<PreviewCorner>("bottomRight");
  const [guideSeen, setGuideSeen] = useState(true);
  const [flipped, setFlipped] = useState(false);
  const [since, setSince] = useState(0);

  useEffect(() => {
    let alive = true;
    void storeLoad<string>(CAMERA_CORNER_KEY)
      .then((saved) => {
        if (alive && typeof saved === "string" && CORNERS.includes(saved as PreviewCorner)) {
          setCorner(saved as PreviewCorner);
        }
      })
      .catch(() => {});
    void storeLoad<boolean>(CAMERA_GUIDE_KEY)
      .then((seen) => {
        if (alive) setGuideSeen(seen === true);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  /** The stream, on the element. Set directly: `srcObject` is not an attribute. */
  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;
    element.srcObject = camera.stream;
    if (camera.stream) void element.play().catch(() => {});
    return () => {
      element.srcObject = null;
    };
  }, [camera.stream]);

  /**
   * The first frame's arrival, straight to the hook.
   *
   * `requestVideoFrameCallback` hands over the metadata the browser has about
   * the frame it just painted; `expectedDisplayTime` is on the same clock as
   * `performance.now()` and is the closest thing to "when was this frame".
   * The callback re-arms itself so the first frame of each pass is seen, and
   * it stops when the element goes away.
   */
  const noteFrame = camera.noteFrame;
  useEffect(() => {
    const element = videoRef.current as
      | (HTMLVideoElement & {
          requestVideoFrameCallback?: (
            cb: (now: number, meta: { expectedDisplayTime?: number }) => void,
          ) => number;
          cancelVideoFrameCallback?: (handle: number) => void;
        })
      | null;
    if (!element || typeof element.requestVideoFrameCallback !== "function") return;
    let handle = 0;
    let alive = true;
    const tick = (now: number, meta: { expectedDisplayTime?: number }) => {
      if (!alive) return;
      noteFrame(typeof meta?.expectedDisplayTime === "number" ? meta.expectedDisplayTime : now);
      handle = element.requestVideoFrameCallback!(tick);
    };
    handle = element.requestVideoFrameCallback(tick);
    return () => {
      alive = false;
      element.cancelVideoFrameCallback?.(handle);
    };
  }, [noteFrame, camera.stream]);

  /** The elapsed clock, half a second at a time rather than per frame. */
  useEffect(() => {
    if (recordingSince === null) {
      setSince(0);
      return;
    }
    setSince(Date.now() - recordingSince);
    const id = setInterval(() => setSince(Date.now() - recordingSince), 500);
    return () => clearInterval(id);
  }, [recordingSince]);

  const move = useCallback((next: PreviewCorner) => {
    setCorner(next);
    void storeSave(CAMERA_CORNER_KEY, next).catch(() => {});
  }, []);

  const dismissGuide = useCallback(() => {
    setGuideSeen(true);
    void storeSave(CAMERA_GUIDE_KEY, true).catch(() => {});
  }, []);

  if (!camera.armed) return null;

  const running = recordingSince !== null;
  const showGuide = !guideSeen && !running;

  return (
    <div
      className="songs-camera-preview"
      data-corner={corner}
      data-running={running ? "" : undefined}
      role="group"
      aria-label={t("songs.camera.preview")}
      /*
       * Dropped onto a corner rather than dragged pixel by pixel.
       *
       * The stage is a column that reflows with the window, so a preview
       * remembered at (412, 88) is a preview that is off the bottom of a
       * smaller window and over the tab in a bigger one. Four corners are
       * four places it is always out of the way, and the drag is only how you
       * choose between them.
       */
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/plain", "camera")}
    >
      <video
        ref={videoRef}
        className="songs-camera-video"
        data-flipped={flipped ? "" : undefined}
        muted
        playsInline
        autoPlay
      />

      {running && (
        <div className="songs-camera-running" aria-live="off">
          <span className="songs-camera-ring" aria-hidden="true" />
          <span className="songs-camera-elapsed">{elapsed(since)}</span>
        </div>
      )}

      {countIn !== null && (
        <div className="songs-camera-countin" role="status" aria-live="polite">
          <span className="songs-camera-count">{countIn}</span>
        </div>
      )}

      {showGuide && (
        <div className="songs-camera-guide">
          <svg className="songs-camera-guide-neck" viewBox="0 0 120 90" aria-hidden="true">
            {/* A neck, roughly: the body bottom-left, the neck running up to
                the headstock. Faint, and only a hint at where a guitar sits in
                a frame that has both hands in it. */}
            <path d="M14 78a16 16 0 1 1 22-22l58-40" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M92 14l10-7 4 7-10 7z" fill="none" stroke="currentColor" strokeWidth="2" />
          </svg>
          <p className="songs-camera-guide-body">{t("songs.camera.guideBody")}</p>
          <div className="songs-camera-guide-actions">
            <button type="button" className="songs-link" onClick={() => setFlipped((f) => !f)}>
              {t("songs.camera.guideFlip")}
            </button>
            <button type="button" className="songs-btn" onClick={dismissGuide}>
              {t("songs.camera.guideGot")}
            </button>
          </div>
        </div>
      )}

      {!running && (
        <div className="songs-camera-corners" aria-label={t("songs.camera.move")}>
          {CORNERS.map((c) => (
            <button
              key={c}
              type="button"
              className="songs-camera-corner"
              data-corner={c}
              data-active={c === corner ? "" : undefined}
              aria-label={t(`songs.camera.corner.${c}`)}
              onClick={() => move(c)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
