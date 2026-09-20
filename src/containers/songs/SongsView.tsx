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
 * What this wave does NOT do, so nobody looks for it: the engine clicks at
 * one tempo for the whole pass. The tempo map and the file's other tracks
 * played through the band are the next wave's (`SONGS.md` §C, T-E), and the
 * review with its verdict comes after W1 and W2.
 */
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { TrackPicker, tuningLabel } from "./TrackPicker";
import { SONG_FILE_EXTENSIONS } from "../../songs/types";
import { meterAt, rangeTicks, sectionRange, wholeSong } from "../../songs/schedule";
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

/** The tempo percentages worth a button. 50–100, the brief's range. */
const TEMPO_STEPS = [50, 60, 70, 80, 90, 100];

export function SongsView({ session, currentBeat, isPlaying, themeId }: SongsViewProps) {
  const { t } = useTranslation();
  const { score, source, song, range, loop, tempoPercent, tempo } = session;
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  /**
   * Where the cursor stands, in ticks.
   *
   * The ONLY input is the engine's beat count. No timer, no animation frame,
   * no interpolation: a beat arrives, the cursor moves. `beat` counts from
   * the moment the engine started, so a loop wraps with a modulo rather than
   * by anyone keeping a position.
   */
  const tick = useMemo(() => {
    if (!score) return 0;
    const { start, end } = rangeTicks(score, range);
    if (currentBeat === null || !isPlaying) return start;
    const beatTicks = score.ticksPerQuarter;
    const spanBeats = (end - start) / beatTicks;
    // `beat` counts quarter notes since the engine started. A loop wraps with
    // a modulo rather than by anybody keeping a position of their own.
    const elapsed = currentBeat.beat;
    const played = loop && spanBeats > 0 ? elapsed % spanBeats : Math.min(elapsed, spanBeats);
    return start + played * beatTicks;
  }, [score, range, currentBeat, isPlaying, loop]);

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

          <Suspense
            fallback={
              <div className="songs-tab-viewport">
                <p className="songs-tab-status">{t("songs.tab.drawing")}</p>
              </div>
            }
          >
            <TabStage score={score} source={source} tick={tick} themeId={themeId} />
          </Suspense>

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

      {dragging && <div className="songs-drop-hint">{t("songs.dropHere")}</div>}
    </div>
  );
}
