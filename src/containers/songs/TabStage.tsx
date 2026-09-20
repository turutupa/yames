/**
 * The tab, and the cursor that walks it.
 *
 * Two rules, both from the spike (`plans/tasks/songs/W4-FINDINGS.md`), and
 * both the sort of thing that works either way in a demo and is wrong in the
 * product:
 *
 * 1. **alphaTab's player never runs.** It is set to `EnabledExternalMedia`,
 *    which is the mode built for a clock that belongs to something else — us.
 *    `api.play()` is never called, no `AudioContext` is ever constructed, and
 *    the cursor moves only because `tickPosition` is set from the ENGINE's
 *    beat events. There is no JS timer in this file. Two clocks in one app is
 *    the bug this whole arrangement exists to avoid.
 * 2. **Workers are off and the music font is passed in by hand.** Left to
 *    itself under vite, alphaTab asks for a worker that does not exist and a
 *    font that vite answers with JavaScript, and in both cases rendering
 *    stops without an error anyone sees. W4-FINDINGS §5.
 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlphaTabApi,
  FontFileFormat,
  LayoutMode,
  LogLevel,
  Logger,
  PlayerMode,
  ScrollMode,
  Settings,
  StaveProfile,
  model,
} from "@coderline/alphatab";
// woff2 only. The .woff beside it is another 550 KB in the installer and is
// a fallback for browsers we do not ship to: every webview Tauri uses —
// WebView2, WKWebView, WebKitGTK — has supported woff2 for years.
import bravuraWoff2 from "@coderline/alphatab/font/Bravura.woff2?url";
import { parseSongFile } from "../../songs/import";
import type { SongScore } from "../../songs/types";

export interface TabStageProps {
  score: SongScore;
  /** The file's bytes, kept so the tab is drawn from the source (SONGS A2). */
  source: Uint8Array;
  /** Where the cursor stands, in ticks from the start of the song. */
  tick: number;
  /** Re-render when the theme changes: the colours are settings, not CSS. */
  themeId: string;
}

/** Read a CSS custom property off the document, with a fallback. */
function token(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/**
 * Paint alphaTab in the app's colours.
 *
 * `RenderingResources` is plain settings rather than CSS, so a theme change
 * cannot cascade into the drawn score — it has to be applied and the score
 * re-rendered. The fonts matter as much as the colours: left alone, alphaTab
 * draws its titles in Georgia, which is wrong in all thirteen themes.
 */
function applyTheme(settings: Settings): void {
  const ink = token("--text-primary", "#e8e8ea");
  const quiet = token("--text-tertiary", "#9a9aa4");
  const faint = token("--text-faint", "#6a6a74");
  const accent = token("--accent", "#e5732a");
  const family = token("--font-family", "system-ui, sans-serif");

  const res = settings.display.resources;
  const colour = (value: string, fallback: string) =>
    model.Color.fromJson(value) ?? model.Color.fromJson(fallback)!;

  res.mainGlyphColor = colour(ink, "#e8e8ea");
  res.secondaryGlyphColor = colour(quiet, "#9a9aa4");
  res.scoreInfoColor = colour(ink, "#e8e8ea");
  res.staffLineColor = colour(faint, "#6a6a74");
  res.barSeparatorColor = colour(faint, "#6a6a74");
  res.barNumberColor = colour(accent, "#e5732a");
  res.tablatureFont = new model.Font(family, 13, model.FontStyle.Plain);
  res.effectFont = new model.Font(family, 12, model.FontStyle.Italic);
  res.copyrightFont = new model.Font(family, 12, model.FontStyle.Plain);
  res.titleFont = new model.Font(family, 24, model.FontStyle.Plain);
  res.subTitleFont = new model.Font(family, 16, model.FontStyle.Plain);
  res.wordsFont = new model.Font(family, 13, model.FontStyle.Plain);
  res.barNumberFont = new model.Font(family, 11, model.FontStyle.Plain);
}

function buildSettings(): Settings {
  const settings = new Settings();
  // Never true here. W4-FINDINGS §5: under vite the worker URL 404s and
  // rendering silently never finishes.
  settings.core.useWorkers = false;
  settings.core.smuflFontSources = new Map([[FontFileFormat.Woff2, bravuraWoff2]]);
  settings.core.logLevel = LogLevel.Warning;
  // The engine is the time axis. The player is never started.
  settings.player.playerMode = PlayerMode.EnabledExternalMedia;
  settings.player.enableCursor = true;
  settings.player.enableElementHighlighting = true;
  // We scroll the stage ourselves, against our own container.
  settings.player.scrollMode = ScrollMode.Off;
  settings.display.staveProfile = StaveProfile.ScoreTab;
  settings.display.layoutMode = LayoutMode.Page;
  applyTheme(settings);
  return settings;
}

export function TabStage({ score, source, tick, themeId }: TabStageProps) {
  const { t } = useTranslation();
  const hostRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<AlphaTabApi | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  // Build once per song, per track, per theme. Not per tick — re-rendering a
  // two-hundred-bar score sixty times a second is the freeze this mode would
  // be remembered for.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    setReady(false);
    setFailed(false);

    let api: AlphaTabApi | null = null;
    const spoken = Logger.logLevel;
    try {
      const parsed = parseSongFile(source, score.source.fileName);
      api = new AlphaTabApi(host, buildSettings());
      api.error.on(() => setFailed(true));
      api.postRenderFinished.on(() => setReady(true));
      api.renderScore(parsed.atScore, [score.source.trackIndex]);
      apiRef.current = api;
    } catch {
      setFailed(true);
    } finally {
      Logger.logLevel = spoken;
    }

    return () => {
      apiRef.current = null;
      api?.destroy();
    };
  }, [source, score.source.fileName, score.source.trackIndex, themeId]);

  // The cursor. One property set per beat event, measured at 0.02 ms — this
  // is the whole of the "driven by the engine" requirement.
  useEffect(() => {
    const api = apiRef.current;
    if (!api || !ready) return;
    api.tickPosition = tick;
  }, [tick, ready]);

  // Keep the cursor in view by scrolling our own container, rather than
  // letting alphaTab scroll something it does not own.
  useEffect(() => {
    if (!ready) return;
    const host = hostRef.current;
    const cursor = host?.querySelector<HTMLElement>(".at-cursor-bar");
    if (!host || !cursor) return;
    const viewport = host.parentElement;
    if (!viewport) return;
    const top = cursor.offsetTop;
    const margin = viewport.clientHeight / 3;
    if (top < viewport.scrollTop || top > viewport.scrollTop + viewport.clientHeight - margin) {
      viewport.scrollTo({ top: Math.max(0, top - margin), behavior: "smooth" });
    }
  }, [tick, ready]);

  return (
    <div className="songs-tab-viewport">
      <div className="songs-tab-host" ref={hostRef} data-ready={ready ? "" : undefined} />
      {!ready && !failed && <p className="songs-tab-status">{t("songs.tab.drawing")}</p>}
      {failed && <p className="songs-tab-status songs-tab-status-failed">{t("songs.tab.failed")}</p>}
    </div>
  );
}
