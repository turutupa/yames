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
 *
 * ## The notes light while you play
 *
 * `SONGS.md` A7, and the third thing this file does. The lights are decided
 * elsewhere — `useLiveNoteLights` turns the engine's per-beat verdicts into a
 * mark per expected onset — and the only reason they live here is that the
 * surface is alphaTab's engraving. A beat is wrapped in a `<g class="b{id}">`
 * and that group is the whole handle we get; `tabGroups.ts` maps an onset
 * onto one and this file paints it.
 *
 * Nothing it does can fight the cursor: the cursor is alphaTab's own
 * absolutely-positioned `div` over the surface, the lights are an attribute on
 * a group and one `<text>` inside it, and they never touch each other. An
 * empty map paints nothing and costs two map lookups.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlphaTabApi,
  FontFileFormat,
  LayoutMode,
  LogLevel,
  Logger,
  NotationElement,
  PlayerMode,
  ScrollMode,
  Settings,
  StaveProfile,
  TabRhythmMode,
  model,
} from "@coderline/alphatab";
// woff2 only. The .woff beside it is another 550 KB in the installer and is
// a fallback for browsers we do not ship to: every webview Tauri uses —
// WebView2, WKWebView, WebKitGTK — has supported woff2 for years.
import bravuraWoff2 from "@coderline/alphatab/font/Bravura.woff2?url";
import { parseSongFile } from "../../songs/import";
import { groupClassByTick, lightTargets, tickByOnset } from "./tabGroups";
import { handleRects, selectionBands } from "./selectionBands";
import type { Rect } from "./selectionBands";
import {
  beginDrag,
  dragRange,
  dragTo,
  playedBarOfPrinted,
  pressIsDrag,
  printedBarOfPlayed,
  printedRunsOfRange,
} from "../../songs/selection";
import type { SelectionDrag, TabPress } from "../../songs/selection";
import { MARK_GLYPH } from "./review/marks";
import type { TimingMark } from "./review/marks";
import { DEFAULT_STAGE_VIEW } from "../../songs/stageView";
import type { StageView } from "../../songs/stageView";
import type { BarRange } from "../../songs/schedule";
import type { ScoreSchedule, SongScore } from "../../songs/types";

export interface TabStageProps {
  score: SongScore;
  /** The file's bytes, kept so the tab is drawn from the source (SONGS A2). */
  source: Uint8Array;
  /** Where the cursor stands, in ticks from the start of the song. */
  tick: number;
  /** Re-render when the theme changes: the colours are settings, not CSS. */
  themeId: string;
  /**
   * The portion chosen, in PLAYED bars, or null for the whole song.
   *
   * Drawn as a band behind the bars it covers, on every system it crosses.
   */
  selection?: BarRange | null;
  /**
   * A portion was dragged out on the tab.
   *
   * Called once, on release — not on every bar the pointer crosses. The
   * engine recompiles the piece and restarts it from the top of the new
   * range when the range changes (`useSongEngine`), so a selection pushed
   * mid-drag would restart the song once per bar the pointer passed over.
   */
  onSelect?: (range: BarRange) => void;
  /**
   * A bar was clicked: go there (W29 item 1).
   *
   * The played bar, not the printed one — the caller thinks in the bars the
   * engine plays, like everything else that crosses this boundary. Called on
   * a plain click and on the arrow keys; never on a drag, which is a portion.
   */
  onSeek?: (playedBar: number) => void;
  /** Esc on the tab: put the portion away and play the whole piece again. */
  onClear?: () => void;
  /**
   * Where the playhead stands, as a played bar, or null for "at the start".
   *
   * Drawn as a thin mark at the head of that bar. While the piece is stopped
   * alphaTab's own cursor is there too and the mark is under it; while it is
   * running the cursor is wherever the engine is, and the mark is the only
   * thing that says where the next press of play will begin.
   */
  playhead?: number | null;
  /**
   * How this player likes to read a tab: notation on or off, and how big
   * (W29 item 3). Changing either re-engraves the piece.
   */
  view?: StageView;
  /** Ctrl/Cmd and the wheel over the music. The head has buttons for it too. */
  onZoom?: (steps: number) => void;
  /**
   * How each expected onset has gone so far, while the pass runs
   * (`SONGS.md` A7). Empty — the default — costs nothing and draws nothing.
   */
  lights?: ReadonlyMap<number, TimingMark>;
  /**
   * The schedule the lights are ids into. Without it an onset id means
   * nothing, so both arrive together or neither is used.
   */
  schedule?: ScoreSchedule | null;
}

/** The SVG namespace, for the one element this file adds to the engraving. */
const SVG_NS = "http://www.w3.org/2000/svg";

/** Our own mark, so a repaint can find every one of them and nothing else. */
const GLYPH_CLASS = "songs-note-light-glyph";

/** Read a CSS custom property off the document, with a fallback. */
function token(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/**
 * The theme's font stack, as family names alphaTab can hand to the browser.
 *
 * This is not tidying. alphaTab builds a CSS font shorthand out of the family
 * and gives it to `document.fonts.check()`, which THROWS on a family name
 * that is not a valid CSS identifier — and the Manuscript theme's stack opens
 * with `Source Serif 4`. Unquoted, that is three tokens and a number, the
 * check raises `Could not resolve '1em Source Serif 4' as a font`, the
 * exception escapes alphaTab's font loader, and the tab never draws at all.
 * One theme in thirteen, silently blank.
 *
 * alphaTab is inconsistent about this, which is what makes it awkward: it
 * quotes a family with a space when it writes the SVG's `font:` shorthand,
 * and does not when it builds the string for `fonts.check`. So the quotes
 * have to come from here, and the cost is that the families which needed them
 * arrive double-quoted in the drawn CSS and match nothing.
 *
 * That is the trade accepted, deliberately: a stack is a list, so the next
 * family down is used instead — Manuscript draws in Georgia rather than
 * Source Serif 4, Ember in Outfit rather than Segoe UI. Every theme's tab is
 * drawn, in a face from that theme's own stack. Not quoting instead leaves
 * Manuscript's tab blank, which is not a typography question.
 *
 * Worth reporting upstream; if alphaTab quotes both paths, the `.map` below
 * is the only line that has to go.
 */
function themeFontFamilies(): string[] {
  const stack = token("--font-family", "system-ui, sans-serif");
  return stack
    .split(",")
    .map((part) => part.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean)
    .map((family) => (/^[A-Za-z][A-Za-z0-9-]*$/.test(family) ? family : `"${family}"`));
}

/**
 * Paint alphaTab in the app's colours.
 *
 * `RenderingResources` is plain settings rather than CSS, so a theme change
 * cannot cascade into the drawn score — it has to be applied and the score
 * re-rendered. The fonts matter as much as the colours: left alone, alphaTab
 * draws in Georgia and Arial, which is wrong in all thirteen themes.
 */
function applyTheme(settings: Settings): void {
  const ink = token("--text-primary", "#e8e8ea");
  const quiet = token("--text-tertiary", "#9a9aa4");
  const faint = token("--text-faint", "#6a6a74");
  const accent = token("--accent", "#e5732a");

  const res = settings.display.resources;
  const colour = (value: string, fallback: string) =>
    model.Color.fromJson(value) ?? model.Color.fromJson(fallback)!;

  res.mainGlyphColor = colour(ink, "#e8e8ea");
  res.secondaryGlyphColor = colour(quiet, "#9a9aa4");
  res.scoreInfoColor = colour(ink, "#e8e8ea");
  res.staffLineColor = colour(faint, "#6a6a74");
  res.barSeparatorColor = colour(faint, "#6a6a74");
  res.barNumberColor = colour(accent, "#e5732a");

  /*
   * Every font on the resources, by walking them rather than by naming them.
   *
   * Naming them missed one: the subtitle line kept coming out in 20px Georgia
   * under all thirteen themes because it is not one of the fields this file
   * knew about. The set alphaTab exposes also differs between versions, so a
   * list written here goes stale silently — a font nobody assigned is not an
   * error, it is just Georgia.
   *
   * Only the families change. The sizes and styles alphaTab chose are part of
   * the engraving, and a music renderer has better reasons for them than we
   * do.
   */
  const families = themeFontFamilies();
  for (const key of Object.keys(res)) {
    const value = (res as unknown as Record<string, unknown>)[key];
    if (value instanceof model.Font) value.families = families;
  }
}

/** One map, shared, so "no lights" allocates nothing on every render. */
const EMPTY_LIGHTS: ReadonlyMap<number, TimingMark> = new Map();

/**
 * Light one beat of the engraving, or put it back the way it was.
 *
 * alphaTab wraps a beat's glyphs in a `<g>` once per STAFF, so a score-and-tab
 * layout has two of them under the same class. Both are coloured — a note lit
 * on the tab and black on the stave above it reads as two different notes —
 * and only the lowest gets the glyph, because the tab is the staff the player
 * is reading and two marks for one attack is noise.
 *
 * `null` removes everything this function added and nothing else: the
 * attribute the stylesheet keys off, and our own `<text>`. alphaTab's inline
 * fills were never touched, so a beat that has been lit and unlit is the beat
 * it was engraved as.
 */
function paintGroup(host: HTMLElement, className: string, mark: TimingMark | null): void {
  const groups = host.getElementsByClassName(className);
  let lowest: Element | null = null;
  let lowestY = -Infinity;
  for (let i = 0; i < groups.length; i++) {
    const group = groups.item(i);
    if (!group) continue;
    for (const stale of [...group.getElementsByClassName(GLYPH_CLASS)]) stale.remove();
    if (mark === null) {
      group.removeAttribute("data-song-light");
      continue;
    }
    group.setAttribute("data-song-light", mark);
    // `getBBox` is only asked of a beat that is being lit for the first time —
    // a handful per beat of the pass — and only to find which staff is which.
    const box = boxOf(group);
    if (box && box.y > lowestY) {
      lowestY = box.y;
      lowest = group;
    }
  }
  if (mark === null || !lowest) return;
  const box = boxOf(lowest);
  if (!box) return;
  const glyph = document.createElementNS(SVG_NS, "text");
  glyph.setAttribute("class", GLYPH_CLASS);
  glyph.setAttribute("x", String(box.x + box.width / 2));
  // Under the fret numbers rather than over them: above the tab staff is where
  // the stave's own note sits, and a mark there would be read as an accent.
  glyph.setAttribute("y", String(box.y + box.height + GLYPH_DROP));
  glyph.setAttribute("text-anchor", "middle");
  glyph.textContent = MARK_GLYPH[mark];
  lowest.appendChild(glyph);
}

/** How far under a beat's own glyphs the mark sits, in the SVG's units. */
const GLYPH_DROP = 11;

/**
 * A group's box, or null.
 *
 * `getBBox` throws on an element in a document fragment or one whose SVG has
 * no layout — which happens the moment alphaTab starts re-rendering underneath
 * us — and a mark that could not be placed is worth less than nothing if it
 * takes the pass down with it.
 */
function boxOf(element: Element): DOMRect | null {
  const graphic = element as SVGGraphicsElement;
  if (typeof graphic.getBBox !== "function") return null;
  try {
    return graphic.getBBox();
  } catch {
    return null;
  }
}

/**
 * The chosen track's printed bars, as the engraving draws them.
 *
 * Staff zero, because that is the staff the importer read the notes off and
 * the one the tab is engraved from; a second staff on the same track is the
 * same music written another way and would give the same beats twice.
 */
function printedBarsOf(atScore: model.Score, trackIndex: number) {
  return atScore.tracks[trackIndex]?.staves[0]?.bars ?? [];
}

/**
 * What the ENGRAVING may say, and what the head says instead (W29 item 3).
 *
 * alphaTab prints the piece's title, subtitle, artist and tuning legend at
 * the top of the page, as a sheet of music does. On a screen that costs about
 * a hundred and twenty pixels of a nine-hundred-pixel window to repeat, in a
 * serif face, three things the stage's own head is already saying in the
 * theme's face — the title, who wrote it and what it is tuned to — plus a
 * numbered list of six strings.
 *
 * So the page is the MUSIC, and the facts live in the head. Everything left
 * on is something the head cannot say: the section names, which belong over
 * the bar they start on, and every effect and marking that is part of the
 * notes.
 */
const HIDDEN_ELEMENTS: NotationElement[] = [
  NotationElement.ScoreTitle,
  NotationElement.ScoreSubTitle,
  NotationElement.ScoreArtist,
  NotationElement.ScoreAlbum,
  NotationElement.ScoreWords,
  NotationElement.ScoreMusic,
  NotationElement.ScoreWordsAndMusic,
  NotationElement.ScoreCopyright,
  NotationElement.GuitarTuning,
];

function buildSettings(view: StageView, fretted: boolean): Settings {
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
  /*
   * alphaTab's own selecting stays off — but a click DOES go there now
   * (2026-09-20, W29).
   *
   * The note this replaces said seek-on-click was off because it would seek a
   * player that is never started. That was true of alphaTab's player and
   * beside the point about ours: the owner, after his first session, *"when i
   * click on the tab its selecting it for loop instead of just going to that
   * place — mimic songsterr click events, they are the common industry"*. So
   * a click moves OUR playhead, which is the engine's, and this file's
   * pointer handling is what does it (see "Going there, and choosing a
   * portion" below).
   *
   * The flag stays false because what alphaTab does on top of that is still
   * wrong for this stage. Looked up rather than remembered, in alphaTab's own
   * source and docs: with `enableUserInteraction` on, a drag selects by BEAT
   * and sets `api.playbackRange` — a second idea of what is chosen, on a
   * player that never runs — and a plain click additionally nulls that range,
   * so clicking anywhere would silently throw the portion away. Our portion
   * snaps to whole bars, has handles, and is the engine's loop.
   *
   * What we keep from alphaTab is its hit testing (`boundsLookup`), which is
   * the same lookup its own events use. Its listeners are `mousedown` /
   * `mousemove` / `mouseup` only — no touch, no pointer — so the overlay's
   * pointer events are also what makes a Windows touchscreen work at all.
   */
  settings.player.enableUserInteraction = false;

  /*
   * ── Tablature first (W29 item 3) ──────────────────────────────────────
   *
   * It was `ScoreTab`: a notation staff AND a tab staff for every system, so
   * a screen held half the bars it could. The owner asked for the room back.
   *
   * `StaveProfile.Tab` is tab only. The rhythm comes back under it with
   * `notation.rhythmMode` — `ShowWithBars` rather than `ShowWithBeams`,
   * because bars connect across a beat the way a reader expects and beams
   * per beat break a run of sixteenths into fours. (`Automatic`, the
   * default, decides by whether notation is hidden, which is right here and
   * is not right in the other mode — so it is said rather than inferred.)
   * **Not `TabMixed`**, whatever its name suggests: what distinguishes that
   * one is hiding rests and time signatures, which is a thing for rendering
   * several tracks at once and would take the meter off a piece that changes
   * it.
   *
   * A part with no strings is not written as tab at all, so it falls back to
   * notation rather than being drawn as an empty six-line staff.
   */
  settings.display.staveProfile = fretted
    ? view.notation
      ? StaveProfile.ScoreTab
      : StaveProfile.Tab
    : StaveProfile.Score;
  settings.notation.rhythmMode = TabRhythmMode.ShowWithBars;
  for (const element of HIDDEN_ELEMENTS) settings.notation.elements.set(element, false);

  /*
   * ── The room a row takes ──────────────────────────────────────────────
   *
   * alphaTab's defaults are a printed page's: 35 px of margin all round, ten
   * above and below every system. On a stage that is already the leftover
   * room, that is two systems' worth of white per screen.
   *
   * `stretchForce` is the one to leave alone. It is the spring constant of
   * the Gourlay spacing the engraving is built on, and turning it down packs
   * more bars into a row by making a sixteenth-note run narrower than a
   * reader can follow — which is exactly what the brief says not to trade
   * away. The room comes from the margins, which cost nothing to read.
   */
  settings.display.scale = view.zoom;
  settings.display.padding = [10, 8];
  settings.display.firstSystemPaddingTop = 2;
  settings.display.systemPaddingTop = 2;
  settings.display.systemPaddingBottom = 4;
  settings.display.lastSystemPaddingBottom = 2;

  settings.display.layoutMode = LayoutMode.Page;
  applyTheme(settings);
  return settings;
}

/**
 * The printed bar a beat is engraved in.
 *
 * Structural, and through the master bar rather than the staff's own index:
 * the two agree for the single-staff tracks this mode imports, and the master
 * bar is the one that means "the fifth bar of the piece" whatever the staff
 * arrangement. Anything unexpected gives null and the press does nothing,
 * which is better than selecting bar zero.
 */
function printedBarOfBeat(beat: unknown): number | null {
  const bar = (beat as { voice?: { bar?: { masterBar?: { index?: unknown }; index?: unknown } } })
    ?.voice?.bar;
  const master = bar?.masterBar?.index;
  if (typeof master === "number" && Number.isFinite(master)) return master;
  return typeof bar?.index === "number" && Number.isFinite(bar.index) ? bar.index : null;
}

export function TabStage({
  score,
  source,
  tick,
  themeId,
  lights,
  schedule,
  selection = null,
  onSelect,
  onSeek,
  onClear,
  playhead = null,
  view = DEFAULT_STAGE_VIEW,
  onZoom,
}: TabStageProps) {
  const { t } = useTranslation();
  const hostRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<AlphaTabApi | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  /**
   * Bumped by every finished render.
   *
   * alphaTab re-lays the score out whenever its box changes width, and the
   * SVG it wrote — the groups this file paints into — is thrown away when it
   * does. So the painter depends on this rather than on `ready` alone: a
   * re-render is a fresh page, and what we thought was lit is gone with it.
   */
  const [rendered, setRendered] = useState(0);
  /** The chosen track's PRINTED bars, kept from the parse the render used. */
  const barsRef = useRef<ReturnType<typeof printedBarsOf>>([]);

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
      barsRef.current = printedBarsOf(parsed.atScore, score.source.trackIndex);
      api = new AlphaTabApi(host, buildSettings(view, score.tuning.length > 0));
      api.error.on(() => setFailed(true));
      api.postRenderFinished.on(() => {
        setReady(true);
        setRendered((n) => n + 1);
      });
      api.renderScore(parsed.atScore, [score.source.trackIndex]);
      apiRef.current = api;
      /*
       * The engraving's bounds, for the screenshot harness and the layout
       * suite.
       *
       * They need to know where bar five is on the page — to drag a selection
       * across it, and to check the band was drawn over the right bars — and
       * there is no other way to find out: alphaTab lays the score out at run
       * time and nothing about the DOM says which rectangle is which bar.
       * Read-only, and nothing in the app ever reads it back.
       */
      (window as unknown as { __SONGS_TAB_API__?: AlphaTabApi }).__SONGS_TAB_API__ = api;
    } catch {
      setFailed(true);
    } finally {
      Logger.logLevel = spoken;
    }

    return () => {
      apiRef.current = null;
      delete (window as unknown as { __SONGS_TAB_API__?: AlphaTabApi }).__SONGS_TAB_API__;
      api?.destroy();
    };
    // `view` is a setting the whole engraving is built from, so a change to
    // it is a fresh `AlphaTabApi` — the same as a theme change. Its two
    // fields rather than the object, which is new on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    source,
    score.source.fileName,
    score.source.trackIndex,
    themeId,
    view.notation,
    view.zoom,
  ]);

  /**
   * Ctrl/Cmd and the wheel makes the music bigger (W29 item 3).
   *
   * On the viewport rather than the overlay, so it works over the margins
   * too, and `passive: false` because the whole point is to take the
   * gesture off the browser's own page zoom — which in a Tauri webview
   * would scale the app's chrome and leave the score exactly as it was.
   * A wheel with no modifier still scrolls the page.
   */
  useEffect(() => {
    const viewport = hostRef.current?.closest<HTMLElement>(".songs-tab-viewport");
    if (!viewport || !onZoom) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      if (e.deltaY === 0) return;
      onZoom(e.deltaY < 0 ? 1 : -1);
    };
    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, [onZoom, ready]);

  // The cursor. One property set per beat event, measured at 0.02 ms — this
  // is the whole of the "driven by the engine" requirement.
  useEffect(() => {
    const api = apiRef.current;
    if (!api || !ready) return;
    api.tickPosition = tick;
  }, [tick, ready]);

  /**
   * Which group each onset is engraved in, worked out once per engraving.
   *
   * `lightTargets` then resolves a lit onset in two map lookups, so a beat's
   * worth of feedback costs three of them and no walk of the score.
   */
  const classByTick = useMemo(
    () => groupClassByTick(score, barsRef.current),
    // `barsRef` is filled by the render effect, so the page this describes is
    // the page `rendered` counts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [score, rendered],
  );
  const ticksByOnset = useMemo(
    () => (schedule ? tickByOnset(score, schedule) : new Map<number, number>()),
    [score, schedule],
  );

  /**
   * The notes light as they are played (`SONGS.md` A7).
   *
   * Painted as a DIFFERENCE rather than from scratch: `lights` grows by the
   * attacks inside one beat and is otherwise the map it was, so a pass over a
   * hundred-note passage costs a handful of DOM writes per beat instead of a
   * hundred. `painted` is what is on the page; anything in it that `lights`
   * no longer names is unpainted, which is what the empty map at the stop
   * does to the whole page in one go.
   *
   * The colour goes on the GROUP and the stylesheet does the rest, so alphaTab
   * keeps its own inline fills and thirteen themes keep theirs. The glyph is
   * one `<text>` of our own in the lowest group of the beat — the tab staff,
   * under the fret number, which is where the review puts the same mark.
   */
  const painted = useRef(new Map<number, TimingMark>());
  const paintedOn = useRef(0);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    // A fresh engraving carries none of our marks, so neither should the
    // record of what is painted — otherwise the first beat after a re-layout
    // would skip every note it thought it had already lit.
    if (paintedOn.current !== rendered) {
      paintedOn.current = rendered;
      painted.current = new Map();
    }
    const wanted = ready ? lightTargets(lights ?? EMPTY_LIGHTS, ticksByOnset, classByTick) : [];
    const seen = new Set<number>();

    for (const target of wanted) {
      seen.add(target.onsetId);
      if (painted.current.get(target.onsetId) === target.mark) continue;
      paintGroup(host, target.className, target.mark);
      painted.current.set(target.onsetId, target.mark);
    }
    for (const onsetId of [...painted.current.keys()]) {
      if (seen.has(onsetId)) continue;
      const tick = ticksByOnset.get(onsetId);
      const className = tick === undefined ? undefined : classByTick.get(tick);
      if (className !== undefined) paintGroup(host, className, null);
      painted.current.delete(onsetId);
    }
  }, [lights, ticksByOnset, classByTick, ready, rendered]);

  /* ── Going there, and choosing a portion ───────────────────────────────
   *
   * **A click goes there. A drag chooses a portion.** That is the whole rule,
   * and it is the one the owner asked for after his first session: *"when i
   * click on the tab its selecting it for loop instead of just going to that
   * place — mimic songsterr click events, they are the common industry"*.
   *
   * Looked up before it was written, in the players people already use
   * (2026-09-20). alphaTab's own default — read off `AlphaTabApiBase`, and
   * its docs say it in one line, "users can select the desired playback range
   * with the mouse and also jump to individual beats by click" — is exactly
   * this shape: mouse down on a beat opens a selection, a drag extends it
   * beat by beat, and on release a multi-beat drag becomes the playback range
   * while a click with no drag in it seeks and throws the range away.
   * Songsterr's help pages and a session on one of their tabs agree about the
   * click: it moves the cursor and does not start playing (their double-click
   * is "play from beat"). Ultimate Guitar's players tap to move the cursor
   * too, and both they and Guitar Pro keep the LOOP behind a button of its
   * own that pre-selects whole bars with handles, which is the part we
   * already had.
   *
   * So the two things this file takes from them are: a plain click seeks, and
   * a portion is whole bars with handles. The one thing it does NOT take is
   * alphaTab's "a click clears the loop": in Songsterr, Ultimate Guitar and
   * Guitar Pro the repeat is a switch, and clearing it by touching the page
   * is how you lose the passage you were working on.
   *
   * Five things this has to get right:
   *
   * **Click or drag, in pixels.** `pressIsDrag` decides, and it counts pixels
   * rather than bars — two bars can be forty pixels apart, so a hand that
   * shook while pressing would otherwise choose a portion.
   *
   * **Modifiers.** alphaTab's `beatMouseDown` hands over a beat and nothing
   * else, so shift-to-extend and which handle was grabbed are read off the
   * real pointer event. Shift-click is ours and not theirs — no tab player
   * binds it — but it is what every text selection in the app does.
   *
   * **Printed, then played.** The page draws each bar once; the engine plays
   * an unrolled list. The pointer speaks printed bars and the selection is
   * kept in played ones, and `selection.ts` owns both crossings.
   *
   * **On release.** A range change makes the engine recompile the piece and
   * start it again from the top, so nothing is pushed until the pointer comes
   * up — otherwise dragging across eight bars would restart the song eight
   * times.
   *
   * **No side effects inside a state updater.** The press is kept in a ref
   * and the drag is mirrored into one, so `onSelect` and `onSeek` are called
   * from the event handler itself. React may call an updater twice.
   */
  const [drag, setDrag] = useState<SelectionDrag | null>(null);
  const dragRef = useRef<SelectionDrag | null>(null);
  const pressRef = useRef<TabPress | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  // Read inside the pointer handlers, which are registered once and must not
  // be torn down and rebuilt every time the selection changes.
  const latest = useRef({ selection, onSelect, onSeek, onClear, score });
  latest.current = { selection, onSelect, onSeek, onClear, score };
  /** Where the arrows start counting from. Read, not depended on. */
  const playheadRef = useRef<number | null>(playhead);
  playheadRef.current = playhead;

  const putDrag = useCallback((next: SelectionDrag | null) => {
    dragRef.current = next;
    setDrag(next);
  }, []);

  /**
   * The played bar under a point on the page.
   *
   * Our own hit test rather than alphaTab's `beatMouseDown`, for one reason
   * that decides it: the handles are drawn on the overlay, and an overlay
   * that can be grabbed is an overlay alphaTab's own listeners never see. One
   * source of pointer truth is simpler than two that have to agree about
   * which one a press belongs to — and `boundsLookup.getBeatAtPos` is the
   * same lookup alphaTab does for its own events, asked directly.
   */
  const barAtPoint = useCallback((clientX: number, clientY: number): number | null => {
    const overlay = overlayRef.current;
    const lookup = apiRef.current?.renderer?.boundsLookup;
    if (!overlay || !lookup) return null;
    const box = overlay.getBoundingClientRect();
    const beat = lookup.getBeatAtPos(clientX - box.left, clientY - box.top);
    const printed = printedBarOfBeat(beat);
    if (printed === null) return null;
    return playedBarOfPrinted(latest.current.score, printed);
  }, []);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay || !ready) return;

    const onDown = (e: PointerEvent) => {
      // Left button only: a right-click is a context menu, and a middle-click
      // is a scroll gesture on every mouse that has one.
      if (e.button !== 0) return;
      const target = e.target as HTMLElement | null;
      const handle =
        (target?.closest("[data-songs-handle]")?.getAttribute("data-songs-handle") as
          | "start"
          | "end"
          | null) ?? null;
      // A handle is grabbed at whichever bar it sits on rather than at the
      // bar under the pointer: the handle straddles a bar line, and half of
      // it is over the bar outside the selection.
      const current = latest.current.selection;
      const bar =
        handle && current
          ? handle === "start"
            ? current.startBar
            : current.endBar
          : barAtPoint(e.clientX, e.clientY);
      if (bar === null) return;
      e.preventDefault();
      // The tab takes the caret, so the arrow keys and Esc reach it without a
      // second gesture. Not on a handle: that is a drag, not a place.
      overlay.focus({ preventScroll: true });
      overlay.setPointerCapture?.(e.pointerId);
      pressRef.current = {
        bar,
        clientX: e.clientX,
        clientY: e.clientY,
        handle,
        shiftKey: e.shiftKey,
      };
      // A handle and a shift-click are about the portion from the first
      // pixel; a plain press is nothing yet, and becomes a drag only if the
      // pointer travels (`pressIsDrag`).
      if (handle || e.shiftKey) {
        putDrag(beginDrag(bar, { shiftKey: e.shiftKey, handle, current }));
      }
    };

    const onMove = (e: PointerEvent) => {
      const press = pressRef.current;
      if (!press) return;
      if (!dragRef.current) {
        if (!pressIsDrag(press, e.clientX, e.clientY)) return;
        putDrag(beginDrag(press.bar, { shiftKey: false, handle: null, current: null }));
      }
      const bar = barAtPoint(e.clientX, e.clientY);
      if (bar === null || !dragRef.current) return;
      putDrag(dragTo(dragRef.current, bar));
    };

    /**
     * On release, and only then.
     *
     * A range change makes the engine recompile the piece and start it again
     * from the top of the new bars (`useSongEngine`), so a selection pushed
     * on every bar the pointer crossed would restart the song once per bar.
     *
     * A press that never became a drag is the click, and the click goes
     * there. It touches the portion not at all — that is what the owner
     * asked for, and what Songsterr, Ultimate Guitar and Guitar Pro all do:
     * the repeat is a switch, not something the page takes off you.
     */
    const onUp = () => {
      const press = pressRef.current;
      const dragging = dragRef.current;
      pressRef.current = null;
      if (dragging) {
        putDrag(null);
        latest.current.onSelect?.(dragRange(dragging));
        return;
      }
      if (press) latest.current.onSeek?.(press.bar);
    };

    overlay.addEventListener("pointerdown", onDown);
    overlay.addEventListener("pointermove", onMove);
    // On the window, because a pointer released off the tab — or off the
    // window — still ends the drag, and one left open would follow the
    // pointer back across the page when it returned.
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      overlay.removeEventListener("pointerdown", onDown);
      overlay.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [ready, rendered, barAtPoint, putDrag]);

  /**
   * The keyboard, on the tab (W29 item 1).
   *
   * Bound to the overlay rather than to the window: Songsterr's own arrows
   * move its cursor and its Esc closes whatever panel is open, and a page
   * that swallowed the arrow keys wherever the caret happened to be would
   * take them off the strip's number fields and off the rail. A click on the
   * tab, or a Tab press, is what puts the caret here.
   *
   * ← / → move a bar and Home goes to the top, which is the brief's list.
   * Guitar Pro spells the last one Ctrl+Home (its plain Home is the head of
   * the current bar) and Songsterr spells it Backspace; neither is a thing a
   * musician would guess, and Home is.
   *
   * Space is NOT here. It is the transport's, everywhere in this app, and
   * `useKeybindings` already has it.
   */
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const { score: current, selection: chosen, onSeek: seek, onClear: clear } = latest.current;
      if (e.key === "Escape") {
        if (!chosen) return;
        e.preventDefault();
        clear?.();
        return;
      }
      if (!seek) return;
      const last = Math.max(0, current.bars.length - 1);
      const from = playheadRef.current ?? 0;
      let next: number | null = null;
      if (e.key === "ArrowLeft") next = Math.max(0, from - 1);
      else if (e.key === "ArrowRight") next = Math.min(last, from + 1);
      else if (e.key === "Home") next = 0;
      if (next === null) return;
      e.preventDefault();
      seek(next);
    },
    [],
  );

  /**
   * The band, and the two handles, in the engraving's own coordinates.
   *
   * Recomputed when the selection changes and when the page is re-engraved —
   * `rendered` — because a re-layout moves every bar. Nothing here listens to
   * scrolling: these are drawn INSIDE the host, so they move with the music
   * rather than against the viewport.
   */
  const shown = drag ? dragRange(drag) : selection;
  const bands = useMemo<Rect[]>(() => {
    const api = apiRef.current;
    const lookup = api?.renderer?.boundsLookup;
    if (!ready || !lookup || !shown) return [];
    const runs = printedRunsOfRange(score, shown);
    return selectionBands(runs, (printedBar) => {
      const bounds = lookup.findMasterBarByIndex(printedBar);
      if (!bounds) return null;
      const box = bounds.visualBounds;
      return { x: box.x, y: box.y, w: box.w, h: box.h };
    });
    // `rendered` is the engraving these coordinates belong to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, rendered, score, shown?.startBar, shown?.endBar, shown === null]);

  const handles = useMemo(() => handleRects(bands), [bands]);

  /**
   * The playhead's own mark, at the head of the bar play will start from.
   *
   * Stopped, alphaTab's cursor is on that bar too and this sits under it —
   * belt and braces, and the mark is a SHAPE, which survives the two
   * lowest-contrast themes and a screenshot. Running, the cursor is wherever
   * the engine is and this is the only thing on the page that says where the
   * next press of play begins: the engine has no seek, so a click made while
   * the band is playing is a promise about the next pass rather than a jump
   * (reported with W29 — `set_song_range` recompiles and restarts).
   */
  const playheadMark = useMemo<Rect | null>(() => {
    const lookup = apiRef.current?.renderer?.boundsLookup;
    if (!ready || !lookup || playhead === null) return null;
    const printed = printedBarOfPlayed(score, playhead);
    if (printed === null) return null;
    const bounds = lookup.findMasterBarByIndex(printed);
    if (!bounds) return null;
    const box = bounds.visualBounds;
    return { x: box.x, y: box.y, w: 2, h: box.h };
    // `rendered` is the engraving these coordinates belong to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, rendered, score, playhead]);

  /** The bars the band covers, said in printed numbers for a screen reader. */
  const spoken = shown
    ? `${String((printedBarOfPlayed(score, shown.startBar) ?? shown.startBar) + 1)}–${String(
        (printedBarOfPlayed(score, shown.endBar) ?? shown.endBar) + 1,
      )}`
    : null;

  /**
   * Keep the cursor in view, and bring the next system in BEFORE it is
   * needed.
   *
   * We scroll our own container rather than letting alphaTab scroll something
   * it does not own (`scrollMode = Off`). Two things about how the cursor is
   * positioned decide the whole of this:
   *
   * **It is moved by a transform, not by `top`.** alphaTab sets
   * `top: 0; left: 0` on the cursor once and then writes a `translate` on
   * every seek, so `offsetTop` is zero for ever. Measured off the page: the
   * cursor at the second system reported `offsetTop` 0 with a transform of
   * `translate(51.5px, 155px)`. The old rule read that zero, decided the
   * cursor was above the scroll position and scrolled back to the top of the
   * piece — so the one case it existed for was the one case it broke.
   * `getBoundingClientRect` is what the box is actually at.
   *
   * **Half a system of lead, and the smallest scroll that buys it.** The
   * cursor's own height is one system, so keeping half of one clear beneath
   * it means the start of the next line is already on screen when the player
   * gets to it rather than arriving under them — and scrolling by exactly
   * what is missing, instead of putting the cursor at a fixed place, leaves
   * the page still whenever it does not need to move. A rule that parks the
   * cursor a third of the way down instead keeps the piece's title clipped
   * off the top from the first beat, for no gain.
   */
  useEffect(() => {
    if (!ready) return;
    const host = hostRef.current;
    const cursor = host?.querySelector<HTMLElement>(".at-cursor-bar");
    const viewport = host?.closest<HTMLElement>(".songs-tab-viewport");
    if (!cursor || !viewport) return;
    const box = cursor.getBoundingClientRect();
    const frame = viewport.getBoundingClientRect();
    if (box.height <= 0) return;
    // The cursor's top in the scroller's own coordinates.
    const top = box.top - frame.top + viewport.scrollTop;
    const lead = Math.min(box.height / 2, viewport.clientHeight / 3);
    const wantedBottom = top + box.height + lead;
    let next: number | null = null;
    if (top < viewport.scrollTop) next = Math.max(0, top - lead);
    else if (wantedBottom > viewport.scrollTop + viewport.clientHeight) {
      next = Math.min(wantedBottom - viewport.clientHeight, top);
    }
    if (next === null || Math.abs(next - viewport.scrollTop) < 1) return;
    viewport.scrollTo({
      top: Math.max(0, next),
      // A page that slides is a page somebody asked not to have slide.
      behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }, [tick, ready]);

  return (
    <div className="songs-tab-viewport" data-selecting={drag ? "" : undefined}>
      {/* The host is alphaTab's, all of it: it writes its own children in
          there and clears them on every re-render, so nothing of ours can
          live inside it. The overlay is a sibling laid exactly over it, which
          puts our boxes in the same coordinate space as the bounds alphaTab
          reports — and being inside the scroller, it moves with the music
          instead of against the viewport. */}
      <div className="songs-tab-stack">
      {/* The band BEHIND the selected bars, in a layer of its own under the
          engraving. It was in the overlay above, which put a tinted rectangle
          over the notes and left nothing between the cursor and the handles.
          The order now is band, then music and the cursor in it, then the
          handles — see `songs.css`. Never the only signal either way: the
          strip says the same thing in words. */}
      <div className="songs-tab-bands" aria-hidden="true">
        {bands.map((band, i) => (
          <div
            className="songs-tab-band"
            key={i}
            style={{ left: band.x, top: band.y, width: band.w, height: band.h }}
          />
        ))}
        {playheadMark && (
          <div
            className="songs-tab-playhead"
            style={{
              left: playheadMark.x,
              top: playheadMark.y,
              width: playheadMark.w,
              height: playheadMark.h,
            }}
          />
        )}
      </div>
      <div className="songs-tab-host" ref={hostRef} data-ready={ready ? "" : undefined} />
      {/* The pointer surface, and the one thing on this screen that takes the
          arrow keys. `tabIndex` rather than a button, because it is a page of
          music: a reader arrives on it, moves a bar at a time and presses Esc
          to put a portion away, and none of that is "activate me". */}
      <div
        className="songs-tab-overlay"
        ref={overlayRef}
        data-ready={ready ? "" : undefined}
        tabIndex={0}
        role="application"
        aria-label={t("songs.stage.tabLabel")}
        onKeyDown={onKeyDown}
      >
        {handles && !drag && (
          <>
            <div
              className="songs-tab-handle"
              data-songs-handle="start"
              style={{
                left: handles.start.x,
                top: handles.start.y,
                width: handles.start.w,
                height: handles.start.h,
              }}
              aria-hidden="true"
            />
            <div
              className="songs-tab-handle"
              data-songs-handle="end"
              style={{
                left: handles.end.x,
                top: handles.end.y,
                width: handles.end.w,
                height: handles.end.h,
              }}
              aria-hidden="true"
            />
          </>
        )}
      </div>
      </div>
      {/* What the band says, for anyone who cannot see it. Polite, so it does
          not interrupt while the pointer is still moving. */}
      <p className="sr-only" role="status" aria-live="polite">
        {spoken ? t("songs.stage.selectedBars", { bars: spoken }) : t("songs.stage.wholeSong")}
      </p>
      {!ready && !failed && <p className="songs-tab-status">{t("songs.tab.drawing")}</p>}
      {failed && <p className="songs-tab-status songs-tab-status-failed">{t("songs.tab.failed")}</p>}
    </div>
  );
}
