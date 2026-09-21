/**
 * "Save as a video" — a take you can send to somebody.
 *
 * `W21-CAMERA.md` addendum 12 and `plans/ECHORA.md` D4. The picture, the
 * scrolling coloured excerpt, the bar / section / tempo and a small Yames
 * mark, composited onto a canvas while the take plays back, recorded to one
 * ordinary file, saved wherever the player says. **Nothing is uploaded**: the
 * player gets a file and decides where it goes, which is the whole of the
 * sharing story and the reason there is no account anywhere near it.
 *
 * ## What this file is, and what it is not
 *
 * It is the screen: a button, four choices, a ring and a cancel. Every frame
 * of the picture is `clipRecorder.ts`'s and every measurement in it is
 * `clip.ts`'s; the bytes go down `ipc.ts`'s pipe to `take_video.rs`. This
 * file decides nothing about what a clip looks like.
 *
 * ## Real time, said out loud
 *
 * A forty-second clip takes forty seconds, because the webview's own encoder
 * is the only encoder there is (`clipRecorder.ts`'s header says why, and it
 * is the answer to the licence question `plans/SONGS.md` A10 left open). So
 * the ring is not decoration: it is the player being told how long this is
 * and given a way out of it. The take plays aloud while it runs, so they can
 * hear that the clip has sound in it.
 *
 * ## A take with no picture still makes a clip
 *
 * Which is every take until somebody turns the camera on. The excerpt, the
 * caption and the mark over a plain ground: a player without a camera gets
 * something to share, and item 2 is explicit that they must.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  clipSaveAppend,
  clipSaveBegin,
  clipSaveDiscard,
  clipSaveFinish,
  openUrl,
  revealInFolder,
  storeLoad,
  storeSave,
} from "../ipc";
import { CLIP_BRAND_KEY } from "./keys";
import { placesFor, SHARE_PLACES } from "./share";
import { clipSeconds } from "./clip";
import type { ClipShape } from "./clip";
import type { ClipStrip } from "./clipStrip";
import { recordClip } from "./clipRecorder";
import type { ClipPalette, ClipRun } from "./clipRecorder";
import { clipSupport } from "./support";
import { takeLength } from "../jam/takes";
import { mediaSrc } from "./src";
import { MARK_TOKEN } from "../containers/songs/review/marks";
import type { TimingMark } from "../containers/songs/review/marks";
import "../styles/songs-take-video.css";

/** Where the clip is in its life. */
type Stage =
  | { kind: "idle" }
  | { kind: "saving"; progress: number }
  | { kind: "saved"; path: string; container: "mp4" | "webm" }
  | { kind: "failed" };

export type SaveAsVideoProps = {
  /**
   * What scrolls across the middle, and what the caption says (W30).
   *
   * The one thing that differs between a clip of a song and a clip of a jam.
   * Everything else on this screen — the shape, the Yames mark, the ring, the
   * cancel, the save dialog, the share row — is the same question either way,
   * which is why there is one screen rather than two. See
   * `src/takes/clipStrip.ts`.
   */
  strip: ClipStrip;
  /** How much of the take is across the strip at once. */
  windowMs: number;
  /**
   * The stretch of the take to make a clip of, for each answer to "which
   * bars". A function rather than two spans because only the caller knows
   * what "the chosen bars" means — a selection in Songs' review, and nothing
   * at all in a jam.
   */
  spanFor: (wholeTake: boolean) => { startMs: number; endMs: number };
  /**
   * Is there a chosen portion to offer, or only the whole take? When false
   * the question is not asked at all: a row of one choice is not a choice.
   */
  canChooseBars?: boolean;
  /**
   * Is there a verdict that could be painted on the strip? False for a jam,
   * which has no notes to be right or wrong about, and the switch is then
   * left out rather than shown doing nothing.
   */
  canShowMarks?: boolean;
  /** The take's mix, and its picture when it has one. */
  mixSrc: string;
  videoSrc: string | null;
  startOffsetMs: number;
  videoOffsetMs: number;
  /** The name to suggest in the save dialog. */
  title: string;
  /** Stop the review's own player: two transports is two things out of step. */
  onBeforeSave?: () => void;
};

/**
 * The theme's own colours, read once and handed to the canvas.
 *
 * A canvas knows nothing about custom properties, so they are resolved off
 * the document at the moment the clip starts — which means the clip comes out
 * in the theme the player is looking at rather than in a palette this file
 * invented. `getPropertyValue` on a variable the theme does not define
 * returns "", so every one has a plain fallback behind it.
 */
function readPalette(): ClipPalette {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string, fallback: string) =>
    style.getPropertyValue(name).trim() || fallback;
  const mark = (value: string, fallback: string) =>
    token(value.replace(/^var\(|\)$/g, ""), fallback);

  const marks = {} as Record<TimingMark, string>;
  const fallbacks: Record<TimingMark, string> = {
    onTime: "#3fb950",
    slightlyEarly: "#7ec86b",
    early: "#d0a13a",
    slightlyLate: "#7ec86b",
    late: "#d0a13a",
    missed: "#e05252",
    notAssessed: "#8a8a8a",
  };
  for (const key of Object.keys(fallbacks) as TimingMark[]) {
    marks[key] = mark(MARK_TOKEN[key], fallbacks[key]);
  }

  return {
    ground: token("--bg-card", "#111111"),
    ink: token("--text-primary", "#f2f2f2"),
    quiet: token("--text-tertiary", "#9a9a9a"),
    line: token("--border", "#2a2a2a"),
    accent: token("--accent", "#ff7a1a"),
    marks,
    // The face the app is actually set in (W32), read off the body rather
    // than guessed: the canvas was drawing in `system-ui`, which on this
    // machine is a different typeface from the one on screen. The fallback is
    // `global.css`'s own stack, spelled out, for a webview that will not
    // report a computed family.
    face:
      getComputedStyle(document.body).fontFamily ||
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  };
}

/** The ring, drawn rather than animated: one arc, redrawn as it goes. */
function ProgressRing({ fraction }: { fraction: number }) {
  const size = 26;
  const r = 10;
  const circumference = 2 * Math.PI * r;
  return (
    <svg
      className="songs-clip-ring"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden="true"
    >
      <circle className="songs-clip-ring-track" cx={size / 2} cy={size / 2} r={r} />
      <circle
        className="songs-clip-ring-arc"
        cx={size / 2}
        cy={size / 2}
        r={r}
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - Math.min(1, Math.max(0, fraction)))}
      />
    </svg>
  );
}

export function SaveAsVideo({
  strip,
  windowMs,
  spanFor,
  canChooseBars = true,
  canShowMarks = true,
  mixSrc,
  videoSrc,
  startOffsetMs,
  videoOffsetMs,
  title,
  onBeforeSave,
}: SaveAsVideoProps) {
  const { t } = useTranslation();
  const support = useMemo(() => clipSupport(), []);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runRef = useRef<ClipRun | null>(null);

  const [open, setOpen] = useState(false);
  const [shape, setShape] = useState<ClipShape>("wide");
  const [marks, setMarks] = useState(true);
  /**
   * The Yames mark, on by default and remembered (the owner, W25).
   *
   * Its own switch rather than a part of "show the marks": they answer
   * different questions. One is whether a player wants their mistakes painted
   * on something they are about to post; this is whether the clip says where
   * it was made.
   */
  const [brand, setBrand] = useState(true);
  useEffect(() => {
    let alive = true;
    void storeLoad<boolean>(CLIP_BRAND_KEY)
      .then((saved) => {
        if (alive && saved === false) setBrand(false);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const chooseBrand = useCallback((next: boolean) => {
    setBrand(next);
    void storeSave(CLIP_BRAND_KEY, next).catch(() => {});
  }, []);
  /**
   * The chosen bars, or the whole attempt. Defaults to the selection — or to
   * the whole take where there is nothing else on offer.
   */
  const [wholeTake, setWholeTake] = useState(!canChooseBars);
  const [stage, setStage] = useState<Stage>({ kind: "idle" });

  const span = useMemo(() => spanFor(wholeTake), [spanFor, wholeTake]);
  /**
   * How long it will take, as a length rather than a count.
   *
   * "0:42" and not "42 seconds", and that is a translation decision as much
   * as a design one: a number governing a noun drags the whole sentence into
   * the `_few`/`_many` matrix in Polish and Russian, and the camera's forty-
   * seven strings were written to stay out of it. The take shelf already
   * says a length this way, from the same helper.
   */
  const length = takeLength(clipSeconds(span));

  // A clip that is still being written when the review goes away is a file
  // growing behind a screen nobody is looking at.
  useEffect(
    () => () => {
      runRef.current?.cancel();
      runRef.current = null;
    },
    [],
  );

  const save = useCallback(async () => {
    if (!support.ok || !canvasRef.current || runRef.current) return;
    onBeforeSave?.();

    let opened = false;
    try {
      const where = await clipSaveBegin(title, support.container);
      // Cancelled at the dialog. Not a failure, and not a sentence.
      if (where === null) return;
      opened = true;
      setStage({ kind: "saving", progress: 0 });

      const run = recordClip({
        canvas: canvasRef.current,
        shape,
        marks,
        brand,
        span,
        // Through `mediaSrc` for the reason the review's own player is:
        // a path on this machine is not something a media element can load,
        // and a value that is already a URL (the harness's blobs) passes
        // through untouched.
        mixSrc: mediaSrc(mixSrc),
        videoSrc: videoSrc === null ? null : mediaSrc(videoSrc),
        startOffsetMs,
        videoOffsetMs,
        strip,
        windowMs,
        palette: readPalette(),
        // Not translated and not a key: it is an address, and an address is
        // the same in every language.
        wordmark: "yames.app",
        words: { bar: t("songs.clip.bar"), bpm: t("songs.clip.bpmUnit") },
        mimeType: support.mimeType,
        sink: (seq, bytes) => clipSaveAppend(seq, bytes),
        onProgress: (fraction) => setStage({ kind: "saving", progress: fraction }),
      });
      runRef.current = run;

      const result = await run.done;
      runRef.current = null;
      if (result.cancelled || result.error || result.chunks === 0) {
        await clipSaveDiscard().catch(() => {});
        setStage(result.cancelled ? { kind: "idle" } : { kind: "failed" });
        return;
      }
      const saved = await clipSaveFinish();
      setStage({ kind: "saved", path: saved.path, container: support.container });
    } catch {
      runRef.current = null;
      // Whatever went wrong, nothing is left at the name the player chose.
      if (opened) await clipSaveDiscard().catch(() => {});
      setStage({ kind: "failed" });
    }
  }, [
    support,
    onBeforeSave,
    title,
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
    t,
  ]);

  // A webview with no recorder at all says so where the button would be,
  // rather than offering one that throws when it is pressed.
  if (!support.ok) {
    return <p className="songs-clip-absent">{t("songs.clip.unavailable")}</p>;
  }

  const saving = stage.kind === "saving";

  return (
    <section className="songs-clip" data-testid="songs-clip">
      {/* Off-screen but REAL: the recorder samples this canvas, so it has to
          be in the document and painted. Sized by `clipRecorder`. */}
      <canvas ref={canvasRef} className="songs-clip-canvas" aria-hidden="true" />

      <div className="songs-clip-row">
        <button
          type="button"
          className="songs-btn songs-clip-open"
          aria-expanded={open}
          disabled={saving}
          onClick={() => setOpen((was) => !was)}
        >
          {t("songs.clip.save")}
        </button>

        {saving && (
          <>
            <ProgressRing fraction={stage.progress} />
            <span className="songs-clip-progress" role="status">
              {t("songs.clip.making", { percent: Math.round(stage.progress * 100) })}
            </span>
            <button
              type="button"
              className="songs-btn songs-clip-cancel"
              onClick={() => runRef.current?.cancel()}
            >
              {t("songs.clip.cancel")}
            </button>
          </>
        )}
      </div>

      {open && !saving && (
        <div className="songs-clip-options">
          {/* Each question carries its own small caption, the way the stage's
              strip does. Without them the six chips read as one row of six
              choices rather than as "which bars", "which way up" and a
              switch — the layout suite can measure that they fit and cannot
              see that they say nothing. */}
          {/* Only where there is something to choose BETWEEN. A jam's clip is
              the take, and a row holding one chip is a question with one
              answer. */}
          {canChooseBars && (
            <>
              <span className="songs-strip-label">{t("songs.clip.whichBars")}</span>
              <div
                className="songs-clip-choice"
                role="group"
                aria-label={t("songs.clip.whichBars")}
              >
                <button
                  type="button"
                  className="songs-chip"
                  data-active={wholeTake ? undefined : ""}
                  aria-pressed={!wholeTake}
                  onClick={() => setWholeTake(false)}
                >
                  {t("songs.clip.chosenBars")}
                </button>
                <button
                  type="button"
                  className="songs-chip"
                  data-active={wholeTake ? "" : undefined}
                  aria-pressed={wholeTake}
                  onClick={() => setWholeTake(true)}
                >
                  {t("songs.clip.wholeTake")}
                </button>
              </div>
            </>
          )}

          <span className="songs-strip-label">{t("songs.clip.shape")}</span>
          <div className="songs-clip-choice" role="group" aria-label={t("songs.clip.shape")}>
            {(["wide", "tall"] as const).map((which) => (
              <button
                key={which}
                type="button"
                className="songs-chip"
                data-active={shape === which ? "" : undefined}
                aria-pressed={shape === which}
                onClick={() => setShape(which)}
              >
                {t(`songs.clip.${which}`)}
                {/* Which places want this shape — a few words, beside the
                    choice they belong to. Names of sites, not translated. */}
                <span className="songs-clip-places">{placesFor(which)}</span>
              </button>
            ))}
          </div>

          {/* A jam has no notes to be right or wrong about, so there is no
              verdict to paint and no switch for it. */}
          {canShowMarks && (
            <button
              type="button"
              className="songs-chip"
              data-active={marks ? "" : undefined}
              aria-pressed={marks}
              onClick={() => setMarks((was) => !was)}
            >
              {t("songs.clip.withMarks")}
            </button>
          )}

          <button
            type="button"
            className="songs-chip"
            data-active={brand ? "" : undefined}
            aria-pressed={brand}
            title={t("songs.clip.brandNote")}
            onClick={() => chooseBrand(!brand)}
          >
            {t("songs.clip.brand")}
          </button>

          <button
            type="button"
            className="songs-btn songs-btn-primary songs-clip-go"
            onClick={() => void save()}
          >
            {t("songs.clip.go")}
          </button>

          {/* How long this will take, because it takes exactly that long. */}
          <p className="songs-clip-note">
            {t("songs.clip.realTime", { length })}{" "}
            {support.container === "mp4" ? t("songs.clip.isMp4") : t("songs.clip.isWebm")}
          </p>
        </div>
      )}

      {/*
       * It is saved, and now the player wants to put it somewhere.
       *
       * The folder first, because the first thing anybody needs is to find
       * the file — then four links that open each site's own upload page in
       * their own browser. **The app uploads nothing and calls no API**: it
       * opens a tab, and the player drags in the file they just saved. That
       * is the difference between a feature that needs somebody's password
       * and one that cannot fail in a way that loses their clip.
       */}
      {stage.kind === "saved" && (
        <div className="songs-clip-done" role="status">
          <p className="songs-clip-note">{t("songs.clip.saved", { where: stage.path })}</p>
          <div className="songs-clip-share">
            <button
              type="button"
              className="songs-chip"
              onClick={() => void revealInFolder(stage.path).catch(() => {})}
            >
              {t("songs.clip.showInFolder")}
            </button>
            <span className="songs-clip-share-lead">{t("songs.clip.postItTo")}</span>
            {SHARE_PLACES.map((place) => (
              <button
                key={place.name}
                type="button"
                className="songs-chip songs-clip-place"
                onClick={() => void openUrl(place.url).catch(() => {})}
              >
                {place.name}
              </button>
            ))}
          </div>
          {/* MP4 is what they all take, so a WebM is worth one sentence HERE
              — where the player is about to try to post it — rather than
              only up in the choices where they were not thinking about it. */}
          <p className="songs-clip-note">
            {stage.container === "mp4" ? t("songs.clip.dragItIn") : t("songs.clip.webmWarning")}
          </p>
        </div>
      )}
      {stage.kind === "failed" && (
        <p className="songs-clip-note songs-clip-failed" role="status">
          {t("songs.clip.failed")}
        </p>
      )}
    </section>
  );
}

export default SaveAsVideo;
