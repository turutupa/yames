/**
 * Songs — a file you own, on the stage, with the click keeping time.
 *
 * The layout follows the rule the owner set for Jam (`JAM_UX_DECISIONS` A13):
 * **the stage holds what you are DOING, setup holds what the song IS.** So
 * the bar range, the section, the loop and the tempo percentage sit on the
 * stage, within reach with a guitar on — and picking the track, which happens
 * once before you count in, is a sheet (`TrackPicker`).
 *
 * The tab is never hidden behind a toggle (U1.1's sibling rule): it is the
 * main content, and everything else makes room for it.
 *
 * Play now means the song: the engine follows the score's own tempo map and
 * plays the file's other tracks through the band, so the band's faders and the
 * mutes are on the stage beside the range (A13 again).
 *
 * And stopping means the verdict. Nothing the coach has to say appears while
 * the transport runs (`COACH_UX.md` A3); the review comes up when you stop and
 * goes away again when you start. The three hooks that make that happen are
 * `containers/songs/review/` and are mounted here in four lines — the screen
 * itself knows nothing about findings.
 *
 * ## The stage is one screen (2026-09-20, W18)
 *
 * It was a column inside a scroller, and the column was longer than the
 * window. Measured at 1400×900: the band's faders started at 928 px and the
 * review at 1075 px, both under the fold — so the controls A13 puts on the
 * stage could not be reached while playing, and a player who stopped saw
 * nothing happen at all. A hundred and seven green layout tests missed it,
 * because not one of them asked whether a thing was VISIBLE.
 *
 * So the shape is fixed now, and it is three parts that share the height:
 *
 * 1. **The head** — what the song IS. Read-only, so it never grows.
 * 2. **The frame** — flexible, and the only thing that takes the slack. The
 *    tab lives in it and scrolls inside it (the cursor walks down the page
 *    anyway), and the verdict takes its place there when you stop.
 * 3. **The strip** — one compact row of what you reach for with the guitar
 *    on: the bars, the sections, the speed, the repeat, recording, the band.
 *
 * Nothing outside the frame scrolls. The three blocks that used to sit below
 * the controls have gone somewhere they do not cost the stage its height: the
 * takes shelf is a popover off its own switch, the verdict is in the frame,
 * and the count-in is the transport's switch — one count-in, not two
 * (`main-window/countIn.ts`).
 */
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { TrackPicker, tuningLabel } from "./TrackPicker";
/*
 * The review's hooks, from their own modules rather than through
 * `./review`.
 *
 * The barrel re-exports `SongReview` and `ReviewTab`, so importing anything
 * through it pulls the whole review — and with it `CoachBlocks`, the
 * catalogue, the resolver and the theory tables — into the main bundle. The
 * hooks are a few hundred lines and run on every pass; the drawing is sixty
 * kilobytes and is only ever seen after you stop. See `SongReview` below.
 */
import { useLiveNoteLights } from "./review/useLiveNoteLights";
import { useSongActions } from "./review/useSongActions";
import { useSongAttempt } from "./review/useSongAttempt";
import { useSongCompare } from "./review/useSongCompare";
import { useSongProgress } from "./review/useSongProgress";
import { useSongTakePitch } from "./review/useSongTakePitch";
import { SongBand } from "./SongBand";
// W19 — the download is caught (`plans/SONGS.md` S0.9). Its own component,
// its own hook and its own stylesheet; mounted in two lines below.
import { DownloadOffer } from "./DownloadOffer";
import { FindATab } from "./FindATab";
import { useDownloadWatch } from "./useDownloadWatch";
import { SongPortionChip, SongPortionSave } from "./SongPortions";
import { SongRecordControl } from "./SongTakes";
import { useSongTakes } from "./useSongTakes";
import { TakesIntroDialog } from "../jam/TakesIntroDialog";
/* W21 — the camera. The hook and the two small stage pieces are eager, like
   the take's are, because they run while a pass is happening. The video player
   is not imported here at all: it lives inside the review's own lazy chunk, so
   a player who never turns the camera on never downloads it. */
import { useSongCamera } from "./camera/useSongCamera";
import { SongCameraControl } from "./camera/SongCameraControl";
import { CameraPreview } from "./camera/CameraPreview";
import { CameraIntroDialog } from "./camera/CameraIntroDialog";
import "../../styles/songs-camera.css";
import { SONG_FILE_EXTENSIONS } from "../../songs/types";
import { buildSchedule, meterAt, sectionRange } from "../../songs/schedule";
import { portionRange } from "../../songs/selection";
import { printedBarNumber, songPosition } from "../../songs/position";
import type { SongsSession } from "../main-window/hooks/useSongsSession";
import type { BeatEvent } from "../../types";
import "../../styles/songs.css";

export interface SongsViewProps {
  session: SongsSession;
  /** The engine's beat event, or null before the first one arrives. */
  currentBeat: BeatEvent | null;
  isPlaying: boolean;
  themeId: string;
}

/**
 * The tab, and alphaTab with it, in a chunk of their own.
 *
 * The only lazy import in the app, and it earns it: alphaTab is 0.27 MB
 * gzipped and the music font is another 0.3 MB, which every player would
 * otherwise download whether or not they ever open Songs. v1.2.1 was a
 * release specifically about making the download smaller (`05284291`), and
 * putting six hundred kilobytes back into the main bundle for a mode you opt
 * into would undo a good part of it.
 *
 * The rest of Songs — the library, the importer, the schedule — is ordinary
 * and stays in the main bundle; it is the renderer that is heavy.
 */
const TabStage = lazy(() =>
  import("./TabStage").then((m) => ({ default: m.TabStage })),
);

/**
 * The verdict, in a chunk of its own — behind the same boundary as the tab.
 *
 * It is the coach's whole vocabulary: `CoachBlocks`, the catalogue, the
 * resolver and its shape checker, the chord and scale tables the fretboard
 * blocks draw from, the excerpt renderer and a stylesheet. Sixty-odd
 * kilobytes gzipped, in a bundle every player downloads, for a screen only
 * Songs players ever see — and only after they have stopped playing, which
 * is the least hurried moment in the app.
 *
 * The hooks above stay eager because they run during a pass. This is the
 * drawing, and there is a whole pass's worth of time to fetch it in.
 */
const SongReview = lazy(() =>
  import("./review/SongReview").then((m) => ({ default: m.SongReview })),
);

/** The tempo percentages worth a button. 50–100, the brief's range. */
const TEMPO_STEPS = [50, 60, 70, 80, 90, 100];

/** The four English ordinals have their own keys; everything else is `other`. */
const ORDINAL_KEYS = ["one", "two", "few"];

/** One run of bars, as a value two chips can be compared on. */
const rangeKey = (startBar: number, endBar: number) => `${String(startBar)}:${String(endBar)}`;

/**
 * "3rd time round" — which key says it in this language.
 *
 * English is the only one of the fifteen whose ordinal changes with the
 * number, and it changes on the last digit: 1st, 2nd, 3rd, 4th, and 21st
 * again. `Intl.PluralRules` knows that rule for every language and is the
 * only thing that does, so it picks the key.
 *
 * They are nested keys rather than i18next plural suffixes on purpose. A
 * suffix is an underscore, and i18next resolves those against a language's
 * CARDINAL categories — so `timeRound_two` in English would be a form
 * nothing ever asks for, which is precisely what the plural gate fails a
 * file for. A language whose ordinal rules name a category English has no
 * key for falls to `other`, which is what that language wants anyway: its
 * ordinal is written the same way whatever the number.
 */
function timeRoundKey(language: string, n: number): string {
  let rule = "other";
  try {
    rule = new Intl.PluralRules(language, { type: "ordinal" }).select(n);
  } catch {
    // An unknown tag is not worth a blank label.
  }
  return `songs.stage.timeRound.${ORDINAL_KEYS.includes(rule) ? rule : "other"}`;
}

export function SongsView({ session, currentBeat, isPlaying, themeId }: SongsViewProps) {
  const { t, i18n } = useTranslation();
  const { score, source, song, range, loop, tempoPercent, tempo } = session;
  const fileRef = useRef<HTMLInputElement>(null);
  /** The stage itself, so the band can fold when this column gets narrow. */
  const stageRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  /**
   * Where the player is — the cursor's tick and the beat of the range the
   * lights are hung on, from the one function that answers it.
   *
   * The ONLY input is what the engine sent: `songTick`, `songBar`, `songPass`.
   * No timer, no animation frame, no interpolation. **Never `BeatEvent.beat`**
   * — that counts the CLICK's beats, so in 7/8 it counts eighths and a
   * position taken from it is twice as far into the piece as the music is.
   * `src/songs/position.ts` is where that lesson lives, and this screen and
   * the review both read through it.
   */
  const position = useMemo(
    () => (score ? songPosition(score, range, currentBeat, { playing: isPlaying }) : null),
    [score, range, currentBeat, isPlaying],
  );
  const tick = position?.tick ?? 0;

  /**
   * The count, while one is being counted in.
   *
   * `measureBeat` is 0-based and a count is not, and the engine sends the
   * count-in's ticks in the range's own meter — so this is the number a
   * person would say out loud. Subdivision ticks carry the same
   * `measureBeat`, so the number holds between beats instead of blinking.
   */
  const countIn =
    isPlaying && currentBeat?.songCountIn ? currentBeat.measureBeat + 1 : null;

  /**
   * The schedule the pass is against, for the notes that light as it runs.
   *
   * The same one `useSongAttempt` captures when play is pressed and
   * `useSongsSession` pushes to the engine — built from the same three inputs
   * by the same pure function, so there is no third idea of what was asked
   * for. Rebuilt only when the score, the range or the loop changes.
   */
  const schedule = useMemo(
    () => (score ? buildSchedule(score, range, { loops: loop }) : null),
    [score, range, loop],
  );

  /**
   * The notes light as they are played (`SONGS.md` A7).
   *
   * W12 built and tested this and could not mount it: the surface is
   * alphaTab's engraving, and nothing mapped an onset onto a note element.
   * `TabStage` does that now, so the hook's map goes straight to it.
   *
   * With a schedule loaded the analyzer says which NOTE was hit, as it
   * happens (`score-onset`), so a bar of sixteenths lights four notes on four
   * verdicts. The per-beat smear it used to draw is still there underneath as
   * the fallback for a pass with no material behind it; the hook says which
   * wins and why. Either way the review that appears the moment you stop is
   * the authority.
   */
  const lights = useLiveNoteLights({
    schedule,
    beatInRange: position?.beatInRange ?? 0,
    isPlaying,
    bpm: tempo,
  });

  /**
   * The attempt, and the verdict at the end of it (`COACH_UX.md` A3–A5).
   *
   * Mounted here and nowhere else: the review is about the pass this screen
   * just ran, and the two things it needs that nothing else has are the
   * transport's edge and the range that was pushed to the engine.
   */
  const attempt = useSongAttempt({
    score,
    scoreId: song?.id ?? null,
    range,
    loop,
    tempoPercent,
    bpm: tempo,
    isPlaying,
  });

  /**
   * Recording the pass, and the shelf it lands on.
   *
   * Jam's take control over a song, keyed by the song's id — `take.rs` takes
   * that id as an opaque string and needed no change to accept one
   * (`useSongTakes.ts` says why). Opt-in per song, the same first-run dialog,
   * the same list, play and delete.
   */
  /**
   * W21 — the camera, and the picture it puts beside the take.
   *
   * Declared before the take's hook because the take's hook calls into it:
   * the engine only NAMES a take when it stops, and the picture has to be
   * filed under that name. Everything the camera can fail at fails as "no
   * picture this pass" — `useSongCamera`'s header says why that is the only
   * outcome it is allowed to have.
   */
  const camera = useSongCamera({
    songId: song?.id ?? null,
    score,
    range,
    tempoPercent,
    view: "songs",
    isPlaying,
    enabled: session.mixSetting.camera === true,
    onSetCamera: (next) => {
      session.setCamera(next);
      // A picture with no sound is not a take. The camera turns Record the
      // take on with it, so there is one promise and one decision rather
      // than two switches whose combinations a player has to reason about.
      if (next && !session.mixSetting.takes) session.setTakes(true);
    },
  });

  const takes = useSongTakes({
    songId: song?.id ?? null,
    view: "songs",
    isPlaying,
    countingIn: countIn !== null,
    enabled: session.mixSetting.takes,
    onSetTakes: (next) => {
      session.setTakes(next);
      // ...and the other way round: no take means nothing for a picture to
      // hang on, so the camera closes with it.
      if (!next && session.mixSetting.camera) session.setCamera(false);
    },
    // W21 — the camera's two doors.
    onTakeStarted: camera.onTakeStarted,
    onTakeFinished: camera.onTakeFinished,
  });

  /**
   * What the ear said about the notes, when there is a recording to ask.
   *
   * `undefined` until a pass has been recorded, which is the honest state and
   * the one `SONGS.md` S0.5 allows: the review then says nothing about which
   * notes were played, only about when they landed.
   */
  const pitch = useSongTakePitch(attempt.review, takes.lastTake);

  /**
   * W21 — when this pass started recording, for the ring on the preview.
   *
   * Read off the take's own elapsed count rather than kept here, and only
   * recomputed when recording starts or stops: the preview is unmounted and
   * remounted as the camera opens and closes, and a clock that restarted at
   * zero when that happened would lie about how long you had been playing.
   */
  const recordingSince = useMemo(
    () => (takes.recording ? Date.now() - takes.recordedSeconds * 1000 : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [takes.recording],
  );

  /**
   * W21 — the picture the review plays, when the pass it is about was filmed.
   *
   * The path comes from the camera rather than from the shelf: the engine
   * names a take and hands its record back while the webview is still writing
   * the video, so that record truthfully says there is no picture and only a
   * later read of the directory would know otherwise (`take.rs`,
   * `list_takes`). `undefined` — no camera, no picture, or a picture that
   * failed — is the normal case, and the review is then exactly what it was
   * before the camera existed (`SONGS.md` A9).
   */
  const reviewVideo = useMemo(() => {
    const id = takes.lastTake?.takeId;
    if (!id) return undefined;
    const take = takes.takes.find((row) => row.id === id);
    if (!take) return undefined;
    // W25 — the picture is now optional rather than the whole reason for
    // this object. A take with none still reaches the review, where the
    // watching half is not drawn (A9) and "Save as a video" is.
    const made = camera.lastVideo;
    const picture = made && made.takeId === id ? made : null;
    return {
      takeId: take.id,
      path: take.path,
      videoPath: picture?.path ?? null,
      ...(picture?.offsetMs === undefined || picture.offsetMs === null
        ? {}
        : { videoOffsetMs: picture.offsetMs }),
      ...(take.position?.startOffsetMs === undefined
        ? {}
        : { startOffsetMs: take.position.startOffsetMs }),
      deviceId: camera.deviceId,
    };
  }, [camera.lastVideo, camera.deviceId, takes.lastTake, takes.takes]);

  /**
   * How this passage has gone before (`COACH_UX.md` C3).
   *
   * Read once when a review appears, so the resolver — which is synchronous —
   * has the answer before it asks. A passage with fewer than two readings is
   * not a story and the block goes, which is `resolve.ts`'s own rule.
   */
  const progressFor = useSongProgress(attempt.review);

  /**
   * W25 — an older recording of these bars, to hold this one against
   * (addendum 11, `plans/ECHORA.md` A2, `COACH_UX.md` C3).
   *
   * `undefined` until a player has come back to a passage with the recorder
   * on twice, which is the honest state and the common one. The coach offers
   * "see the difference" only when there is a pair AND it has just said the
   * passage improved.
   */
  const compare = useSongCompare(attempt.review, song?.id ?? null, reviewVideo);

  /** Whether the verdict is the thing in the frame rather than the tab. */
  const reviewShowing = attempt.review !== null;

  /**
   * Put the verdict away and give the caret back to Play.
   *
   * The review took focus when it opened, so something has to take it back or
   * a keyboard player is left on a heading that no longer exists. Play is
   * where they were before the pass and where they are going next, and the
   * transport is shell furniture this screen does not own — hence the query
   * rather than a ref threaded through four components for one line.
   *
   * Pressing play dismisses it too, and that path is `useSongAttempt`'s: it
   * clears the review on the transport's rising edge, wherever the press came
   * from — the button, the space bar or a footswitch.
   */
  const dismissReview = useCallback(() => {
    attempt.dismiss();
    document.querySelector<HTMLElement>(".transport-play")?.focus();
  }, [attempt.dismiss]);

  const actions = useSongActions({
    scoreId: song?.id ?? null,
    setRange: session.setRange,
    setLoop: session.setLoop,
    setTempoPercent: session.setTempoPercent,
    review: attempt.review,
  });

  // The engine gets the schedule when what it describes changes — not on every
  // render, and never while a pass is running underneath it.
  useEffect(() => {
    if (!score || isPlaying) return;
    void session.pushSchedule();
    // `pushSchedule` is rebuilt whenever the range or the loop changes, which
    // is exactly when the engine needs telling.
  }, [score, isPlaying, session.pushSchedule]); // eslint-disable-line react-hooks/exhaustive-deps

  const onFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (file) void session.offerFile(file);
    },
    [session],
  );

  /**
   * A download that has just finished, offered rather than opened (S0.9).
   *
   * The caught file goes through `offerFile` — the same door the picker and
   * the drop target use — so the track picker still opens and the player
   * still chooses their part. Nothing is automatic.
   *
   * The strip is what the offer must not move. It cannot: `.songs-view` is a
   * fixed-height column whose ONE flexible child is the frame, so a banner
   * beside it takes its height from the tab and the strip stays exactly
   * where it was. The layout suite asks that question directly.
   */
  const onCaughtFile = useCallback((file: File) => void session.offerFile(file), [session]);
  const downloads = useDownloadWatch({ view: "songs", onFile: onCaughtFile });

  /**
   * The library's "+" opens this screen's file input.
   *
   * One input, on the view, reached by an event rather than copied into the
   * rail — two file inputs with the same `accept` list is two places for that
   * list to go stale, and the rail cannot own one because it is not on screen
   * when the library is collapsed.
   */
  useEffect(() => {
    const open = () => fileRef.current?.click();
    window.addEventListener("yames:songs-import", open);
    return () => window.removeEventListener("yames:songs-import", open);
  }, []);

  /**
   * W25 — the footswitch reaching the two switches, and their promises.
   *
   * `useActionDispatcher` cannot call `takes.requestTakes` or `camera.request`
   * directly: they belong to hooks mounted on this screen, and the window has
   * no handle on them. It raises an event instead, exactly as the library's
   * "+" does to reach the file input above — and it goes through the REQUEST
   * doors rather than the settings behind them, so a first press still shows
   * the promise about what is recorded and where it is kept.
   */
  useEffect(() => {
    const take = () => takes.requestTakes(!session.mixSetting.takes);
    const film = () => camera.request(!session.mixSetting.camera);
    window.addEventListener("yames:songs-take", take);
    window.addEventListener("yames:songs-camera", film);
    return () => {
      window.removeEventListener("yames:songs-take", take);
      window.removeEventListener("yames:songs-camera", film);
    };
  }, [takes.requestTakes, camera.request, session.mixSetting.takes, session.mixSetting.camera]);

  /**
   * Drop a file on the window.
   *
   * Plain DOM drag events, not Tauri's. `tauri.conf.json` sets
   * `dragDropEnabled: false` on every window so the webview keeps its own
   * drag-and-drop (the library's row reordering depends on it, and
   * `src/tauriConfig.dragDrop.test.ts` pins it) — which leaves `dataTransfer`
   * carrying the real file, bytes and all. Nothing here needs Rust.
   */
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      onFiles(e.dataTransfer?.files ?? null);
    },
    [onFiles],
  );

  const meter = score ? meterAt(score, range.startBar) : null;
  const barsInRange = range.endBar - range.startBar + 1;

  /** The bar runs the player has already given a name of their own. */
  const named = useMemo(
    () => new Set(session.portions.map((p) => rangeKey(p.startBar, p.endBar))),
    [session.portions],
  );

  return (
    <div
      className="songs-view"
      ref={stageRef}
      /* W25 — while the verdict is up, the strip stands down and the review
         has the stage. At 480×780 the strip is 256 px of a 552 px column, so
         the review got 181 px and the picture, the tape and everything the
         coach pointed at were a scroll away. Nothing on the strip is reached
         while reading a verdict — the fix is a button in the head, and play
         is on the transport — and it comes straight back when the review
         does. See `songs.css`. */
      data-review={reviewShowing ? "" : undefined}
      data-dragging={dragging ? "" : undefined}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <input
        ref={fileRef}
        type="file"
        className="songs-file-input"
        accept={SONG_FILE_EXTENSIONS.join(",")}
        onChange={(e) => {
          onFiles(e.target.files);
          // Cleared so choosing the same file twice still fires a change.
          e.target.value = "";
        }}
      />

      <DownloadOffer watch={downloads} />

      {session.error && (
        <div className="songs-alert" role="alert">
          <span>{session.error}</span>
          <button type="button" className="songs-btn" onClick={session.dismissError}>
            {t("songs.dismiss")}
          </button>
        </div>
      )}

      {/* The engine's own trouble, which is not an import failure and must
          not look like one: the song is in the library and readable, and
          what went wrong is the sound. `detail` is the engine's line, in
          English, under the sentence rather than instead of it. */}
      {session.engineError && (
        <div className="songs-alert" role="alert">
          <span>
            {session.engineError.kind === "busy"
              ? t("songs.engine.busy")
              : t("songs.engine.cannotPlay")}
            {session.engineError.kind === "load" && session.engineError.detail ? (
              <span className="songs-alert-detail">{session.engineError.detail}</span>
            ) : null}
          </span>
          <button type="button" className="songs-btn" onClick={session.dismissEngineError}>
            {t("songs.dismiss")}
          </button>
        </div>
      )}

      {!score || !source ? (
        <div className="songs-empty">
          <h2 className="songs-empty-title">{t("songs.empty.title")}</h2>
          <p className="songs-empty-body">{t("songs.empty.body")}</p>
          <button
            type="button"
            className="songs-btn songs-btn-primary"
            onClick={() => fileRef.current?.click()}
          >
            {t("songs.import")}
          </button>
          <p className="songs-empty-note">{t("songs.empty.private")}</p>
          {/* W19 — the half of the promise that makes clearing your
              downloads safe. Said here because this is the screen somebody
              is standing on when they wonder. */}
          <p className="songs-keeps-copy">{t("songs.keepsCopy")}</p>
          {/* W19 — haven't got the file yet? Yames opens your own browser on
              an ordinary web search. It names no tab site and fetches
              nothing; `songs/findTab.ts` is where that is a test. */}
          <FindATab />
        </div>
      ) : (
        <>
          <header className="songs-head">
            <div className="songs-head-titles">
              <h2 className="songs-title">{song?.name ?? score.title}</h2>
              <p className="songs-sub">
                {[score.artist, score.source.trackName].filter(Boolean).join(" · ")}
              </p>
            </div>
            <dl className="songs-facts">
              <div className="songs-fact">
                <dt>{t("songs.tuning")}</dt>
                <dd>{tuningLabel(score.tuning)}</dd>
              </div>
              {score.capo > 0 && (
                <div className="songs-fact">
                  <dt>{t("songs.capoLabel")}</dt>
                  <dd>{t("songs.capo", { fret: score.capo })}</dd>
                </div>
              )}
              {meter && (
                <div className="songs-fact">
                  <dt>{t("songs.meter")}</dt>
                  <dd>
                    {meter.numerator}/{meter.denominator}
                  </dd>
                </div>
              )}
              <div className="songs-fact">
                <dt>{t("songs.tempo")}</dt>
                <dd>{t("songs.bpm", { bpm: tempo })}</dd>
              </div>
            </dl>
          </header>

          {session.warnings.length > 0 && (
            <ul className="songs-warnings">
              {session.warnings.map((w, i) => (
                <li key={i}>
                  {w.kind === "tempoFlattened"
                    ? t("songs.warn.tempoFlattened", { count: w.bars })
                    : t("songs.warn.barOverfilled", { bar: w.printedBar + 1 })}
                </li>
              ))}
            </ul>
          )}

          {/* What the engine could not bring, said once and quietly. Neither
              of these is a failure: a file written for a band this one does
              not have still plays, and a player who imported an orchestral
              arrangement deserves to know where the strings went rather than
              to wonder whether the import worked. */}
          {(session.leftOut.length > 0 || (session.loaded?.droppedNotes ?? 0) > 0) && (
            <ul className="songs-warnings songs-warnings-quiet">
              {session.leftOut.length > 0 && (
                <li>
                  {t("songs.band.leftOut", {
                    count: session.leftOut.length,
                    tracks: session.leftOut.join(", "),
                  })}
                </li>
              )}
              {(session.loaded?.droppedNotes ?? 0) > 0 && (
                <li>{t("songs.band.droppedNotes", { count: session.loaded!.droppedNotes })}</li>
              )}
            </ul>
          )}

          {/* The frame: the tab, and the verdict in its place when you stop.
              It is the one thing on this screen that flexes, and the one
              thing that scrolls. */}
          <div className="songs-stage-frame">
            {/* The tab stays MOUNTED behind the verdict, hidden rather than
                unmounted. alphaTab engraves a whole score to the width of this
                box and throws the SVG away when the box changes — taking it
                down at every stop would re-engrave the piece twice a minute.
                `visibility` keeps the box and its width exactly as they were,
                and takes the tab out of the reading order and the tab order
                while the verdict is the thing being read. */}
            <div className="songs-tab-pane" data-behind={reviewShowing ? "" : undefined}>
              <Suspense
                fallback={
                  <div className="songs-tab-viewport">
                    <p className="songs-tab-status">{t("songs.tab.drawing")}</p>
                  </div>
                }
              >
                <TabStage
                  score={score}
                  source={source}
                  tick={tick}
                  themeId={themeId}
                  lights={lights}
                  schedule={schedule}
                  selection={session.selection}
                  onSelect={session.setSelection}
                />
              </Suspense>
            </div>

            {/* Which time round you are, while a portion repeats.
                A loop with no counter is a loop you lose your place in —
                "have I played this four times or seven?" — and the number is
                already on every beat event the engine sends. Only while
                something is actually going round: on the first time through
                it would be furniture. */}
            {isPlaying && loop && (position?.pass ?? 0) > 0 && (
              <p className="songs-stage-pass" role="status" aria-live="polite">
                {t(timeRoundKey(i18n.language, (position?.pass ?? 0) + 1), {
                  n: (position?.pass ?? 0) + 1,
                })}
              </p>
            )}

            {/* The count, over the page, while somebody counts you in. The
                cursor is not drawn at all until the piece starts — see
                `tick` above — so this is what is on screen instead. */}
            {countIn !== null && (
              <div className="songs-countin-overlay" role="status" aria-live="polite">
                <span className="songs-countin-count">{countIn}</span>
                <span className="songs-countin-caption">{t("songs.countIn.counting")}</span>
              </div>
            )}

            {/* W21 — the little mirror, in a corner of the frame rather than
                in the strip: it is over the tab, so it costs the strip no
                height and the one screen stays one screen. It draws nothing
                at all unless the camera is actually open. */}
            <CameraPreview
              camera={camera}
              countIn={countIn}
              recordingSince={camera.recording ? recordingSince : null}
            />

            {/* A3: nothing here while the transport runs. The verdict appears
                when you stop, in the frame the player was already looking at
                (A4), and goes away again when you start. */}
            {attempt.working && (
              <p className="songs-review-working" role="status">
                {t("songs.review.working")}
              </p>
            )}
            {/* Not over the tab: a false start is worth a line, not the
                screen. It sits along the bottom of the frame and goes on the
                next press of play. */}
            {attempt.tooShort && (
              <p className="songs-stage-notice" role="status">
                {t("songs.review.tooShort")}
              </p>
            )}
            {attempt.review && (
              // The same line the screen shows between the stop and the
              // verdict, so a chunk that has not arrived yet looks like a coach
              // still thinking rather than like a panel that failed to open.
              <Suspense
                fallback={
                  <p className="songs-review-working" role="status">
                    {t("songs.review.working")}
                  </p>
                }
              >
                {/* W21 — `video` only when the pass this review is about was
                    filmed. Absent is the normal case and the review is then
                    exactly what it was before the camera existed. */}
                <SongReview
                  review={attempt.review}
                  pitch={pitch}
                  onAction={actions.run}
                  onDismiss={dismissReview}
                  progressFor={progressFor}
                  video={reviewVideo}
                  compare={compare}
                />
              </Suspense>
            )}
          </div>

          {/* The strip: what you reach for with the guitar on, one row of it,
              all of it on screen while the transport runs (A13). */}
          <div className="songs-strip">
            {/* The portion, and everything about it, in one group — because it
                is one thing. The owner: selecting a portion so it repeats is
                "super critical for song learning", so it is the first thing on
                the strip and the tab's own band says the same thing in
                pictures that this says in words. */}
            <div className="songs-strip-group songs-strip-portion">
              <span className="songs-strip-label">{t("songs.range")}</span>
              <label className="songs-range-field">
                <span className="sr-only">{t("songs.fromBar")}</span>
                <input
                  type="number"
                  min={1}
                  max={score.bars.length}
                  aria-label={t("songs.fromBar")}
                  value={printedBarNumber(score, range.startBar)}
                  onChange={(e) =>
                    session.setSelection({ ...range, startBar: Number(e.target.value) - 1 })
                  }
                />
              </label>
              <span className="songs-range-dash" aria-hidden="true">
                –
              </span>
              <label className="songs-range-field">
                <span className="sr-only">{t("songs.toBar")}</span>
                <input
                  type="number"
                  min={1}
                  max={score.bars.length}
                  aria-label={t("songs.toBar")}
                  value={printedBarNumber(score, range.endBar)}
                  onChange={(e) =>
                    session.setSelection({ ...range, endBar: Number(e.target.value) - 1 })
                  }
                />
              </label>

              {/* What is chosen, said. A band drawn on the tab is the picture
                  and this is the sentence; neither is ever the only signal,
                  and this one is what a screen reader and a low-contrast
                  theme have. "· looping" is the state, not a second control:
                  the switch beside it is the control. */}
              <span className="songs-strip-note songs-portion-says">
                {session.selection
                  ? t("songs.stage.portionSays", {
                      count: barsInRange,
                      state: loop ? t("songs.stage.looping") : t("songs.stage.once"),
                    })
                  : t("songs.stage.wholeSong")}
              </span>

              <button
                type="button"
                className="songs-chip songs-loop-chip"
                data-active={loop ? "" : undefined}
                aria-pressed={loop}
                title={t("songs.loopNote")}
                onClick={() => session.setLoop(!loop)}
              >
                {/* One word, and the pressed state says which it is. It used
                    to read "Round and round" or "Once through" depending, so
                    the label changed under the finger that pressed it and
                    neither half said what the button DOES. The sentence
                    beside it is still where the state is spelled out. */}
                {t("songs.loop")}
              </button>

              {/* Clears the portion rather than selecting every bar: they play
                  the same music and they are not the same state — one is "I
                  am working on this", the other is "I am playing the piece". */}
              <button
                type="button"
                className="songs-chip"
                disabled={!session.selection}
                onClick={session.clearSelection}
              >
                {t("songs.wholeSong")}
              </button>

              <SongPortionSave
                canSave={session.selection !== null}
                onSave={session.savePortion}
              />
            </div>

            {(score.sections.length > 0 || session.portions.length > 0) && (
              <div className="songs-strip-group songs-strip-sections">
                <span className="songs-strip-label">{t("songs.sections")}</span>
                <div className="songs-section-chips">
                  {score.sections.map((section, i) => {
                    const chosen =
                      range.startBar === section.startBar &&
                      range.endBar === section.endBar &&
                      // One chip lights for one set of bars. A player who
                      // saved the chorus under a name of their own has two
                      // chips over exactly those bars, and both used to come
                      // on together — which says the range is two things.
                      // The name they chose wins: it is the more particular
                      // of the two, and it carries its own speed. The
                      // section stays on the row, unlit, because it is still
                      // a way in and it is what the file called the passage.
                      !named.has(rangeKey(section.startBar, section.endBar));
                    return (
                      <button
                        key={`${section.name}-${i}`}
                        type="button"
                        className="songs-chip"
                        data-active={chosen ? "" : undefined}
                        aria-pressed={chosen}
                        onClick={() => session.setSelection(sectionRange(score, section.name))}
                      >
                        {section.name}
                      </button>
                    );
                  })}
                  {/* The portions the player named, beside the sections the
                      file came with — because by the third week the passage
                      you call "that run in the bridge" is more use than the
                      section heading the engraver wrote. */}
                  {session.portions.map((portion) => (
                    <SongPortionChip
                      key={portion.id}
                      portion={portion}
                      chosen={
                        range.startBar === portion.startBar && range.endBar === portion.endBar
                      }
                      onChoose={() => {
                        session.setSelection(portionRange(score, portion));
                        session.setTempoPercent(portion.tempoPercent);
                      }}
                      onRename={(name) => session.renamePortion(portion.id, name)}
                      onDelete={() => session.deletePortion(portion.id)}
                    />
                  ))}
                </div>
              </div>
            )}

            <div className="songs-strip-group songs-strip-tempo">
              <span className="songs-strip-label">{t("songs.speed")}</span>
              <div className="songs-tempo-chips">
                {TEMPO_STEPS.map((percent) => (
                  <button
                    key={percent}
                    type="button"
                    className="songs-chip"
                    data-active={tempoPercent === percent ? "" : undefined}
                    aria-pressed={tempoPercent === percent}
                    /* The tempo the click will actually run at, which used to
                       be a sentence under the chips. A number nobody has to
                       read to use the control belongs in the tooltip. */
                    title={t("songs.speedNote", { bpm: Math.round((tempo * percent) / tempoPercent) })}
                    onClick={() => session.setTempoPercent(percent)}
                  >
                    {t("songs.percent", { percent })}
                  </button>
                ))}
              </div>
            </div>

            <SongRecordControl
              /* W21 — the camera's chip, inside the record switch's own group:
                 one decision about this pass, in two parts. A group of its own
                 cost the strip a row and the tab its height at 480px, which
                 `songs.spec.ts` measures. */
              camera={
                <SongCameraControl camera={camera} disabled={takes.available === false} />
              }
              available={takes.available}
              takes={takes.takes}
              /* W25 — what each take was a go at, and the score to print its
                 bars the way the page does. */
              details={takes.details}
              score={score}
              recording={takes.recording}
              dirBytes={takes.dirBytes}
              playingId={takes.playingId}
              enabled={session.mixSetting.takes}
              onRequestTakes={takes.requestTakes}
              onPlay={takes.play}
              onStop={takes.stopPlayback}
              onDelete={takes.remove}
            />

            <SongBand
              setting={session.mixSetting}
              lanes={session.lanes}
              onGain={session.setGain}
              onMute={session.setMute}
              stageRef={stageRef}
            />
          </div>
        </>
      )}

      {session.pending && (
        <TrackPicker
          title={session.pending.parsed.title}
          fileName={session.pending.parsed.fileName}
          tracks={session.pending.tracks}
          onChoose={(index) => void session.chooseTrack(index)}
          onCancel={session.cancelImport}
        />
      )}

      {/* A microphone that starts writing files is the one thing in this app a
          person is entitled to be told about first, so the switch does not
          simply flip. Jam's dialog, not a second one: the promise is one
          promise, it is made in one set of words, and having read it once is
          having read it. */}
      {takes.introOpen && (
        <TakesIntroDialog onConfirm={takes.confirmIntro} onCancel={takes.cancelIntro} />
      )}

      {/* W21 — and the camera's own. A different promise from the take's: one
          is a WAV of you and the band, the other is a picture of your hands,
          your face and your room. Each is made in its own words. */}
      {camera.introOpen && (
        <CameraIntroDialog onConfirm={camera.confirmIntro} onCancel={camera.cancelIntro} />
      )}

      {dragging && <div className="songs-drop-hint">{t("songs.dropHere")}</div>}
    </div>
  );
}
