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
import { groupClassByTick, lightTargets, tickByOnset } from "./tabGroups";
import { handleRects, selectionBands } from "./selectionBands";
import type { Rect } from "./selectionBands";
import {
  beginDrag,
  dragRange,
  dragTo,
  playedBarOfPrinted,
  printedBarOfPlayed,
  printedRunsOfRange,
} from "../../songs/selection";
import type { SelectionDrag } from "../../songs/selection";
import { MARK_GLYPH } from "./review/marks";
import type { TimingMark } from "./review/marks";
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
  /*
   * alphaTab's own selecting and seek-on-click are off (2026-09-20).
   *
   * Left on, dragging across bars paints alphaTab's playback-range highlight
   * and a click seeks a player that is never started — two selections on one
   * page, one of which does nothing. The `beatMouseDown` / `Move` / `Up`
   * events still fire with it off (they are triggered before the flag is
   * read), which is the whole of what this mode needs from the pointer.
   */
  settings.player.enableUserInteraction = false;
  settings.display.staveProfile = StaveProfile.ScoreTab;
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
      api = new AlphaTabApi(host, buildSettings());
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
  }, [source, score.source.fileName, score.source.trackIndex, themeId]);

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

  /* ── Choosing a portion on the tab ─────────────────────────────────────
   *
   * The owner, 2026-09-20: selecting a portion so it repeats is *"super
   * critical for song learning"*. This is the pointer half of it; the model
   * is `songs/selection.ts` and the arithmetic of where the band goes is
   * `selectionBands.ts`, so what is here is only the wiring.
   *
   * Three things this has to get right:
   *
   * **Modifiers.** alphaTab's `beatMouseDown` hands over a beat and nothing
   * else, so shift-to-extend and which handle was grabbed are read off the
   * real pointer event in a capture-phase listener that runs first.
   *
   * **Printed, then played.** The page draws each bar once; the engine plays
   * an unrolled list. The pointer speaks printed bars and the selection is
   * kept in played ones, and `selection.ts` owns both crossings.
   *
   * **On release.** A range change makes the engine recompile the piece and
   * start it again from the top, so nothing is pushed until the pointer comes
   * up — otherwise dragging across eight bars would restart the song eight
   * times.
   */
  const [drag, setDrag] = useState<SelectionDrag | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  // Read inside the pointer handlers, which are registered once and must not
  // be torn down and rebuilt every time the selection changes.
  const latest = useRef({ selection, onSelect, score });
  latest.current = { selection, onSelect, score };

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
      overlay.setPointerCapture?.(e.pointerId);
      setDrag(beginDrag(bar, { shiftKey: e.shiftKey, handle, current }));
    };

    const onMove = (e: PointerEvent) => {
      setDrag((current) => {
        if (!current) return current;
        const bar = barAtPoint(e.clientX, e.clientY);
        return bar === null ? current : dragTo(current, bar);
      });
    };

    /**
     * On release, and only then.
     *
     * A range change makes the engine recompile the piece and start it again
     * from the top of the new bars (`useSongEngine`), so a selection pushed
     * on every bar the pointer crossed would restart the song once per bar.
     */
    const onUp = () => {
      setDrag((current) => {
        if (current) latest.current.onSelect?.(dragRange(current));
        return null;
      });
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
  }, [ready, rendered, barAtPoint]);

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

  /** The bars the band covers, said in printed numbers for a screen reader. */
  const spoken = shown
    ? `${String((printedBarOfPlayed(score, shown.startBar) ?? shown.startBar) + 1)}–${String(
        (printedBarOfPlayed(score, shown.endBar) ?? shown.endBar) + 1,
      )}`
    : null;

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
    <div className="songs-tab-viewport" data-selecting={drag ? "" : undefined}>
      {/* The host is alphaTab's, all of it: it writes its own children in
          there and clears them on every re-render, so nothing of ours can
          live inside it. The overlay is a sibling laid exactly over it, which
          puts our boxes in the same coordinate space as the bounds alphaTab
          reports — and being inside the scroller, it moves with the music
          instead of against the viewport. */}
      <div className="songs-tab-stack">
      <div className="songs-tab-host" ref={hostRef} data-ready={ready ? "" : undefined} />
      <div className="songs-tab-overlay" ref={overlayRef} data-ready={ready ? "" : undefined}>
        {/* The band behind the selected bars, and a handle at each end.
            Never the only signal — the strip says the same thing in words. */}
        {bands.map((band, i) => (
          <div
            className="songs-tab-band"
            key={i}
            style={{ left: band.x, top: band.y, width: band.w, height: band.h }}
            aria-hidden="true"
          />
        ))}
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
