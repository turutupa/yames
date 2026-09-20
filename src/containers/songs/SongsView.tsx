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
 * plays the file's other tracks through the band, so the band's faders, the
 * mutes and the count-in are on the stage beside the range (A13 again).
 *
 * And stopping means the verdict. Nothing the coach has to say appears while
 * the transport runs (`COACH_UX.md` A3); the review comes up underneath the
 * stage when you stop, and goes away again when you start. The three hooks
 * that make that happen are `containers/songs/review/` and are mounted here
 * in four lines — the screen itself knows nothing about findings.
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
import { useSongProgress } from "./review/useSongProgress";
import { useSongTakePitch } from "./review/useSongTakePitch";
import { SongBand, SongCountIn } from "./SongBand";
import { SongRecordControl, SongTakes } from "./SongTakes";
import { useSongTakes } from "./useSongTakes";
import { TakesIntroDialog } from "../jam/TakesIntroDialog";
import { SONG_FILE_EXTENSIONS } from "../../songs/types";
import { buildSchedule, meterAt, sectionRange, wholeSong } from "../../songs/schedule";
import { songPosition } from "../../songs/position";
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

export function SongsView({ session, currentBeat, isPlaying, themeId }: SongsViewProps) {
  const { t } = useTranslation();
  const { score, source, song, range, loop, tempoPercent, tempo } = session;
  const fileRef = useRef<HTMLInputElement>(null);
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
   * It is honest about being a stand-in — one verdict per BEAT, spread across
   * the attacks inside it, because that is the only thing that arrives while a
   * pass runs. On quarters it is exact; on sixteenths it is a smear, and the
   * review that appears the moment you stop replaces it per onset.
   */
  const lights = useLiveNoteLights({
    schedule,
    beatInRange: position?.beatInRange ?? 0,
    isPlaying,
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
  const takes = useSongTakes({
    songId: song?.id ?? null,
    view: "songs",
    isPlaying,
    countingIn: countIn !== null,
    enabled: session.mixSetting.takes,
    onSetTakes: session.setTakes,
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
   * How this passage has gone before (`COACH_UX.md` C3).
   *
   * Read once when a review appears, so the resolver — which is synchronous —
   * has the answer before it asks. A passage with fewer than two readings is
   * not a story and the block goes, which is `resolve.ts`'s own rule.
   */
  const progressFor = useSongProgress(attempt.review);

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

  return (
    <div
      className="songs-view"
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

          <div className="songs-tab-frame">
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
              />
            </Suspense>

            {/* The count, over the page, while somebody counts you in. The
                cursor is not drawn at all until the piece starts — see
                `tick` above — so this is what is on screen instead. */}
            {countIn !== null && (
              <div className="songs-countin-overlay" role="status" aria-live="polite">
                <span className="songs-countin-count">{countIn}</span>
                <span className="songs-countin-caption">{t("songs.countIn.counting")}</span>
              </div>
            )}
          </div>

          {/* The stage controls: what you reach for with the guitar on. */}
          <div className="songs-stage-controls">
            <div className="songs-control songs-control-range">
              <span className="songs-control-label">{t("songs.range")}</span>
              <div className="songs-range-fields">
                <label className="songs-range-field">
                  <span>{t("songs.fromBar")}</span>
                  <input
                    type="number"
                    min={1}
                    max={score.bars.length}
                    value={range.startBar + 1}
                    onChange={(e) =>
                      session.setRange({ ...range, startBar: Number(e.target.value) - 1 })
                    }
                  />
                </label>
                <label className="songs-range-field">
                  <span>{t("songs.toBar")}</span>
                  <input
                    type="number"
                    min={1}
                    max={score.bars.length}
                    value={range.endBar + 1}
                    onChange={(e) =>
                      session.setRange({ ...range, endBar: Number(e.target.value) - 1 })
                    }
                  />
                </label>
                <button
                  type="button"
                  className="songs-btn"
                  onClick={() => session.setRange(wholeSong(score))}
                >
                  {t("songs.wholeSong")}
                </button>
              </div>
              <p className="songs-control-note">{t("songs.barsCount", { count: barsInRange })}</p>
            </div>

            <SongCountIn
              bars={session.mixSetting.countInBars}
              onChange={session.setCountInBars}
            />

            {score.sections.length > 0 && (
              <div className="songs-control songs-control-sections">
                <span className="songs-control-label">{t("songs.sections")}</span>
                <div className="songs-section-chips">
                  {score.sections.map((section, i) => {
                    const chosen =
                      range.startBar === section.startBar && range.endBar === section.endBar;
                    return (
                      <button
                        key={`${section.name}-${i}`}
                        type="button"
                        className="songs-chip"
                        data-active={chosen ? "" : undefined}
                        aria-pressed={chosen}
                        onClick={() => session.setRange(sectionRange(score, section.name))}
                      >
                        {section.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="songs-control songs-control-tempo">
              <span className="songs-control-label">{t("songs.speed")}</span>
              <div className="songs-tempo-chips">
                {TEMPO_STEPS.map((percent) => (
                  <button
                    key={percent}
                    type="button"
                    className="songs-chip"
                    data-active={tempoPercent === percent ? "" : undefined}
                    aria-pressed={tempoPercent === percent}
                    onClick={() => session.setTempoPercent(percent)}
                  >
                    {t("songs.percent", { percent })}
                  </button>
                ))}
              </div>
              <p className="songs-control-note">{t("songs.speedNote", { bpm: tempo })}</p>
            </div>

            <div className="songs-control songs-control-loop">
              <span className="songs-control-label">{t("songs.loop")}</span>
              <button
                type="button"
                className="songs-chip songs-chip-wide"
                data-active={loop ? "" : undefined}
                aria-pressed={loop}
                onClick={() => session.setLoop(!loop)}
              >
                {loop ? t("songs.loopOn") : t("songs.loopOff")}
              </button>
              <p className="songs-control-note">{t("songs.loopNote")}</p>
            </div>

            <SongRecordControl
              available={takes.available}
              enabled={session.mixSetting.takes}
              recording={takes.recording}
              onRequestTakes={takes.requestTakes}
            />

            <SongBand
              setting={session.mixSetting}
              lanes={session.lanes}
              onGain={session.setGain}
              onMute={session.setMute}
            />
          </div>

          {/* The shelf, under the song it belongs to. Drawn even when empty:
              a feature that appears only once you have used it is a feature
              nobody finds, and what it says when empty is what recording is
              FOR. */}
          <SongTakes
            available={takes.available}
            takes={takes.takes}
            recording={takes.recording}
            dirBytes={takes.dirBytes}
            playingId={takes.playingId}
            enabled={session.mixSetting.takes}
            onRequestTakes={takes.requestTakes}
            onPlay={takes.play}
            onStop={takes.stopPlayback}
            onDelete={takes.remove}
          />

          {/* A3: nothing here while the transport runs. The verdict appears
              when you stop, and goes away again when you start. */}
          {attempt.working && <p className="songs-review-working">{t("songs.review.working")}</p>}
          {attempt.tooShort && <p className="songs-review-working">{t("songs.review.tooShort")}</p>}
          {attempt.review && (
            // The same line the screen shows between the stop and the
            // verdict, so a chunk that has not arrived yet looks like a coach
            // still thinking rather than like a panel that failed to open.
            <Suspense fallback={<p className="songs-review-working">{t("songs.review.working")}</p>}>
              <SongReview
                review={attempt.review}
                pitch={pitch}
                onAction={actions.run}
                onDismiss={attempt.dismiss}
                progressFor={progressFor}
              />
            </Suspense>
          )}
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

      {dragging && <div className="songs-drop-hint">{t("songs.dropHere")}</div>}
    </div>
  );
}
