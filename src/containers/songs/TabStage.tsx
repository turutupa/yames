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
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import { cursorTickAt, leadFromFrame, onReport } from "../../songs/cursor";
import type { CursorMotion } from "../../songs/cursor";
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
import { playedBarAtTick } from "../../songs/position";
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
  /**
   * Where the cursor stands, in ticks from the start of the song.
   *
   * The ENGINE's last word, not a per-frame position: it changes once per
   * click tick while the transport runs, and the gliding between two of them
   * is this file's own (`songs/cursor.ts`, W34 item 1).
   */
  tick: number;
  /**
   * The transport is running, so the cursor travels between reports.
   *
   * Stopped, `tick` is simply written where it is told and nothing animates —
   * a page nobody is playing has no motion to interpolate.
   */
  playing?: boolean;
  /** Which time round the range `tick` was reported on. A change is a seam. */
  pass?: number;
  /** The speed the engine is playing at, 50–100. Half speed, half the rate. */
  tempoPercent?: number;
  /** The last tick of the bars being played; the cursor waits there. */
  endTick?: number;
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
  /*
   * The strings and the bar lines a step quieter than the faintest text
   * (2026-09-21, the owner: "the lines ... very slightly more subtle than the
   * notes, so the notes and numbers are easier to read"). `--text-faint` is
   * the theme's dimmest INK, chosen to still be read as words; a line that
   * runs through every fret number does not need to be read, it needs to be
   * seen behind them. Sixty per cent of that ink over the page keeps the
   * theme's hue and gives the numbers the contrast.
   */
  const dim = colour(faint, "#6a6a74");
  const line = new model.Color(dim.r, dim.g, dim.b, Math.round(dim.a * 0.6));
  res.staffLineColor = line;
  res.barSeparatorColor = line;
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
   * ## And the walk missed fifteen more, until W36 item 5
   *
   * The owner: *"I love that you change the font of the numbers to match the
   * theme… can we also do that with other fonts like 'TAB' or the number for
   * the bpm … it says 161 but in that weird font"*.
   *
   * He had spotted exactly where the walk stopped. `Object.keys` returns OWN
   * properties, and in alphaTab 1.8 only four fonts are still own fields of
   * `RenderingResources` — the tablature numbers among them, which is why the
   * numbers were the part that looked right. Every other face moved into
   * `elementFonts`, a `Map<NotationElement, Font>` filled in the constructor:
   * the tempo marker, the section names, the bar numbers, the fingerings, the
   * chord names, the tuning legend, "P.M." and the rest. A Map is not a
   * `Font`, so the walk stepped straight over it and fifteen faces stayed
   * Georgia and Arial.
   *
   * So the walk goes one level into any Map it finds, rather than naming
   * `elementFonts`: the same reason the walk exists at all is the reason it
   * should not know that name either.
   *
   * What this cannot reach is the music font. "TAB" at the head of the staff
   * is `MusicFontSymbol.SixStringTabClef` — a Bravura glyph, the tab staff's
   * clef, drawn the way a G clef is — and the quarter note in "♩ = 96" is
   * another. They are notation, not text, and they stay alphaTab's.
   *
   * Only the families change. The sizes and styles alphaTab chose are part of
   * the engraving, and a music renderer has better reasons for them than we
   * do.
   */
  const families = themeFontFamilies();
  for (const key of Object.keys(res)) {
    const value = (res as unknown as Record<string, unknown>)[key];
    if (value instanceof model.Font) value.families = families;
    else if (value instanceof Map) {
      // Per-instance clones — `RenderingResources`'s constructor copies each
      // default with `withSize` — so writing to them cannot reach back into
      // the statics every other score would then be drawn from.
      for (const entry of (value as Map<unknown, unknown>).values()) {
        if (entry instanceof model.Font) entry.families = families;
      }
    }
  }
}

/**
 * The theme's faces, in the browser, before a note is engraved (W36 item 5).
 *
 * alphaTab measures every piece of text it draws and lays the page out from
 * the answer. Asked to measure in a face the browser has not loaded, it
 * measures the FALLBACK — and then the face arrives, the glyphs swap, and the
 * spacing is the spacing of a font that is no longer on the page. Nine of the
 * thirteen themes name a Google font (`index.html` fetches them all in one
 * stylesheet), so this is the ordinary case rather than an edge one.
 *
 * `document.fonts.load` takes a CSS font shorthand and has to be asked for
 * every WEIGHT and STYLE that will be drawn, or the italic effect text is the
 * one that swaps.
 *
 * `null` means "there is nothing to wait for" — no `document.fonts` (happy-dom
 * has none, and there are still a webview or two that do not), or a stack this
 * file cannot make a shorthand out of. It is a separate answer from a promise
 * that resolves immediately, because the caller can act on it in the same
 * commit: a wait that costs a render is a blank frame nobody asked for.
 */
function warmFaces(families: string[]): Promise<unknown> | null {
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  const first = families[0];
  if (!fonts || typeof fonts.load !== "function" || !first) return null;
  try {
    return Promise.all([
      fonts.load(`400 14px ${first}`),
      fonts.load(`700 14px ${first}`),
      fonts.load(`italic 400 12px ${first}`),
      // A family the browser will not resolve is a family it would have
      // fallen back from anyway; the stack's next face is what gets drawn.
    ]).catch(() => undefined);
  } catch {
    return null;
  }
}

/** Themes whose faces this document has already been made to fetch. */
const warmedThemes = new Set<string>();

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
  /*
   * ── The whole song is drawn, all of it, all the time (W34 items 5 and 2) ──
   *
   * alphaTab's `enableLazyLoading` defaults to ON and its own documentation
   * says what is wrong with it here: *"AlphaTab tries to detect which elements
   * are visible on the screen, and only appends those elements to the DOM …
   * but is not working for all layouts and use cases."* Ours is one of the
   * use cases it does not work for, and it is the cause of two separate
   * things the owner reported on 2026-09-21.
   *
   * What it does, measured on a 120-bar fixture at 2000x1124: the engraving
   * is twenty-three systems, and SEVEN of them have any content in the DOM.
   * The other sixteen are empty `div`s of the right height. Scroll to the
   * bottom and it is the other way round — the fourteen at the top are
   * emptied and nine at the bottom are filled in.
   *
   * - *"I imported a tab and it feels like it's not rendering the entire
   *   song, just a section of it"*. It was not rendering the entire song. It
   *   was rendering the section in front of you and throwing the rest away,
   *   and putting it back a frame after you scrolled to it.
   * - *"When it's playing and I stop it, the whole alpha tab flickers as in
   *   re-rendering"*. Stopping puts the cursor back at the top of the range,
   *   which scrolls the page back — and every system the scroll passes is
   *   emptied and re-filled on the way. Nothing was re-rendered; the DOM was
   *   being taken apart and put back, which looks identical.
   *
   * Off, the whole engraving stays in the DOM: nothing blanks, nothing
   * flickers, and bar 100 is drawn before anybody scrolls to it — which is
   * also what the note lights, `boundsLookup` and the selection bands need,
   * since none of them can paint into a system that is not there.
   *
   * The cost it saves is real and is not ours to save: it is for a page with
   * several scores on it in the browser's own scroll. This is ONE score in a
   * box we own, and a hundred and twenty bars is under fifteen hundred
   * elements.
   */
  settings.core.enableLazyLoading = false;
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
  /*
   * ── Room for what is written ABOVE the first bar (W34 item 6) ─────────
   *
   * The owner, 2026-09-21: *"the first row's tempo mark is drawn on top of
   * the section name and the cursor"*. Measured on the fixture at 2000px
   * before this: `♩ = 96` occupied y 167–183 and `Verse` y 183–199 — two
   * boxes touching to the pixel, with the bar number's own row starting one
   * pixel later and the beat cursor drawn straight through all three.
   *
   * Two numbers, and each fixes a different half:
   *
   * `effectBandPaddingBottom` is the space BETWEEN two effect bands, and
   * alphaTab's 2 is a printed page's. The tempo mark is a band, the section
   * name is the band under it, and alphaTab paints the tempo's own text on
   * the band's bottom baseline — so at 2 the quarter-note glyph hangs into
   * the name of the section it is announcing.
   *
   * `firstSystemPaddingTop` was 2, which put the tempo mark against the top
   * edge of the frame with the cursor's wash beginning in the same pixel.
   * The room is bought back below: `systemPaddingTop` and the two bottoms
   * stay tight, so this costs the page eight pixels ONCE rather than eight
   * per system.
   */
  settings.display.effectBandPaddingBottom = 6;
  settings.display.firstSystemPaddingTop = 10;
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
  playing = false,
  pass = 0,
  tempoPercent = 100,
  endTick = Number.POSITIVE_INFINITY,
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

  /**
   * The file, read when the score is engraved and never depended on (W34
   * item 2).
   *
   * `source` is a `Uint8Array` decoded from the library record. It is
   * memoised per record — so any write that replaces that record hands this
   * component a DIFFERENT array holding the same bytes, and an effect that
   * depends on the array destroys the api, re-parses the file and re-engraves
   * the whole score. Every one of those is invisible in a code review and
   * unmistakable on screen.
   *
   * What actually decides the engraving is the SCORE: `score.id` is a hash of
   * the file's bytes and the chosen track (`songs/library.ts`), so it changes
   * when and only when there is a different piece of music to draw. That is
   * what the effect below is keyed on, and the bytes are read through here.
   */
  const fileRef = useRef({ source, fileName: score.source.fileName, track: score.source.trackIndex });
  fileRef.current = { source, fileName: score.source.fileName, track: score.source.trackIndex };

  /*
   * ── When the score is drawn, and the whole list of reasons ──────────────
   *
   * The file, the part, the notation mode, the zoom, the theme, and the WIDTH
   * (which is alphaTab's own `ResizeObserver`, not this effect). Nothing else
   * — not the transport, not the selection, not a beat event, not the
   * verdict, and not a library record being written.
   *
   * The owner: *"when it's playing and i stop it, the whole alpha tab
   * flickers as in re-rendering, this is very annoying"*. What he was seeing
   * was alphaTab's lazy loading emptying and re-filling systems as the page
   * scrolled back to the top — see `buildSettings` — and this effect is the
   * other half of the same promise: `TabStage.render.test.tsx` counts the
   * engravings across play, stop, play, a seek and a loop and finds ONE.
   */
  /**
   * The theme's faces are fetched before the first engrave (W36 item 5).
   *
   * `warmTheme` is which theme's faces are known to be in the browser, and
   * the render effect below will not draw until it is this one — otherwise
   * alphaTab measures in the fallback and lays the whole page out to
   * somebody else's widths. A theme that has already been warmed once is
   * answered in the same commit, so switching back and forth does not blank
   * the page; `useLayoutEffect` is what makes that "same commit" rather than
   * "one painted frame later".
   */
  const [warmTheme, setWarmTheme] = useState<string | null>(null);
  useLayoutEffect(() => {
    const warming = warmedThemes.has(themeId) ? null : warmFaces(themeFontFamilies());
    if (!warming) {
      warmedThemes.add(themeId);
      setWarmTheme(themeId);
      return;
    }
    let alive = true;
    void warming.then(() => {
      warmedThemes.add(themeId);
      if (alive) setWarmTheme(themeId);
    });
    return () => {
      alive = false;
    };
  }, [themeId]);

  useEffect(() => {
    const host = hostRef.current;
    // Nothing is engraved in a face the browser has not got yet — see
    // `warmFaces`. Not a `setFailed`: it is a wait, and the "drawing…" line
    // is already what is on screen.
    if (!host || warmTheme !== themeId) return;
    setReady(false);
    setFailed(false);

    let api: AlphaTabApi | null = null;
    const spoken = Logger.logLevel;
    const file = fileRef.current;
    try {
      const parsed = parseSongFile(file.source, file.fileName);
      barsRef.current = printedBarsOf(parsed.atScore, file.track);
      api = new AlphaTabApi(host, buildSettings(view, score.tuning.length > 0));
      api.error.on(() => setFailed(true));
      api.postRenderFinished.on(() => {
        setReady(true);
        setRendered((n) => n + 1);
      });
      api.renderScore(parsed.atScore, [file.track]);
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
    // `score.id` and NOT `source`, `fileName` or `trackIndex`: it is a hash
    // of the bytes and the track, so it says "a different piece of music to
    // draw" and nothing else does — an identical file decoded into a new
    // array does not change it, and that is the whole point. `view` is a
    // setting the engraving is built from, so a change to it is a fresh
    // `AlphaTabApi`, the same as a theme change; its two fields rather than
    // the object, which is new on every render. `warmTheme` is the gate on
    // this theme's own faces having arrived (W36 item 5), not a fifth reason
    // to re-engrave: it changes once per theme and never again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [score.id, themeId, warmTheme, view.notation, view.zoom]);

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

  /**
   * ── The cursor, and how it gets from one report to the next (W34 item 1) ──
   *
   * The owner: *"there's a sweep picking section that it's not following note
   * per note in a smooth movement, it's doing blocks at a time"*. It was one
   * property set per beat event — seven hundred milliseconds apart at 84 BPM
   * — so a run of sixteenths passed entirely between two writes and the line
   * crossed the whole run in one step.
   *
   * The engine is still the only clock. What changed is that the report is
   * now an ANCHOR rather than the whole answer: `songs/cursor.ts` advances
   * the tick through the score's tempo map on `requestAnimationFrame`, and
   * every report re-anchors it, so the line glides at the screen's own rate
   * and cannot drift past one report's worth of error.
   *
   * Two things about alphaTab that decide the shape of this:
   *
   * **Writing `tickPosition` is cheap here, and only here.** The player is
   * `EnabledExternalMedia` and is never started, so the sequencer's seek is
   * arithmetic — `_mainSilentProcess` does nothing while nothing is playing —
   * and no audio, no MIDI and no highlighting pass is on this path. Sixty
   * writes a second is sixty transform updates.
   *
   * **A seek re-places the cursor at a FRACTION of a beat.** alphaTab skips
   * the work when the tick is still inside the same engraved beat — except on
   * a seek, which every `tickPosition` write is, and which places the line at
   * `onNotesX + width * (tick - beatStart) / beatLength`. That is why this
   * works at all: the line moves WITHIN a note, not only from note to note.
   *
   * Nothing here re-renders React. The cursor is alphaTab's own `div`; a
   * state update per frame would put the whole stage through React sixty
   * times a second, which is the opposite of what item 2 asks for.
   */
  /* ── A click is believed at once, and it is believed in ONE place now
   *    (W36 item 1, kept; W37 item 1, moved) ─────────────────────────────
   *
   * The owner, after W36's fix landed: *"when clicking on alphatab to go to a
   * certain place, i think it's mostly flaky WHEN THE TABS ARE PLAYING"*.
   * The engine is the clock and a click is a message to it: its answer comes
   * back one click tick later — seven hundred milliseconds at 84 BPM — and
   * for that whole interval a cursor that waited went on walking where the
   * music used to be and then teleported. So the click is the position, at
   * once, and the engine's reports are ignored until one of them agrees.
   *
   * That rule is unchanged. What changed is WHERE it lives. This file used to
   * keep its own copy of the answer (`localSeek`), which was one of the five
   * ideas of "where we are" the owner counted in his fourth session. The
   * session owns the playhead now — `songs/playhead.ts` holds the same
   * believe-until-the-engine-agrees window, the same one-and-a-half-second
   * backstop, and hands the answer down as `tick`. This component draws what
   * it is given and keeps no position of its own.
   */
  const shownTick = tick;

  const motionRef = useRef<CursorMotion | null>(null);
  /** The frame interval, smoothed — the lead is two of them. */
  const frameMsRef = useRef(0);
  useEffect(() => {
    const api = apiRef.current;
    if (!api || !ready) return;
    if (!playing) {
      // Stopped is a place, not a journey: the playhead, or the top of the
      // range, written once.
      motionRef.current = null;
      api.tickPosition = shownTick;
      return;
    }

    motionRef.current = onReport(
      score,
      motionRef.current,
      { tick: shownTick, pass, atMs: performance.now() },
      tempoPercent,
    );

    let frame = 0;
    let previous = 0;
    const step = (now: number) => {
      frame = requestAnimationFrame(step);
      if (previous > 0) {
        const delta = now - previous;
        // A running mean over about half a second, so one long frame does not
        // move the lead and a change of monitor does within the bar.
        frameMsRef.current =
          frameMsRef.current > 0 ? frameMsRef.current * 0.9 + delta * 0.1 : delta;
      }
      previous = now;
      const motion = motionRef.current;
      if (!motion) return;
      const next = cursorTickAt(score, motion, now, {
        percent: tempoPercent,
        endTick,
        leadMs: leadFromFrame(frameMsRef.current),
      });
      motionRef.current = next.motion;
      api.tickPosition = next.tick;
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
    // `shownTick` and not `tick`: a click is believed before the engine
    // answers (see above), and re-anchoring on it is what makes the line
    // start travelling from the bar that was clicked instead of from the bar
    // the song was in half a second ago. `onReport` sees a tick the tempo map
    // does not lead to and snaps, which is exactly right for a seek.
  }, [shownTick, pass, playing, tempoPercent, endTick, score, ready]);

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
   * a portion is whole bars with handles.
   *
   * **And since 2026-09-21 it takes a third, because the owner asked for it
   * after his second session** (W34 item 4): *"if i single click a different
   * part of the song it should go to that part but the selected area doesn't
   * get unselected, it's like it doesn't exit loop mode"*. W29's note here
   * said the opposite, on the evidence of those three players, where the
   * repeat is a switch that touching the page never takes off you. He has
   * played with both and his word wins over theirs. A click OUTSIDE the
   * portion goes there and puts the portion and the repeat away; a click
   * INSIDE it moves your place and keeps it, because you are still working on
   * that passage. `selection.ts`'s `clickClearsPortion` is the rule, and
   * `useSongsSession`'s `seekTo` is where it is applied — this file just
   * reports a bar.
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

  /**
   * Go to a played bar.
   *
   * One line now (W37 item 1). It used to do two things — write this file's
   * own idea of the position so the line moved at once, and tell the session
   * — because the session's answer arrived up to a click tick late. The
   * session's answer IS the click now, in the same commit, so there is one
   * writer and one reader and nothing to keep in step. The pointer and the
   * arrow keys both come through here.
   */
  const goTo = useCallback((playedBar: number) => {
    latest.current.onSeek?.(playedBar);
  }, []);
  const goToRef = useRef(goTo);
  goToRef.current = goTo;
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
     * there — and whether the portion survives it depends on where it landed
     * (W34 item 4, the header above). That decision is not made here: this
     * reports the bar, and `useSongsSession` owns both the portion and the
     * playhead and is where one line can say what happens to both.
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
      if (press) goToRef.current(press.bar);
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
      const go = goToRef.current;
      if (e.key === "Escape") {
        if (!chosen) return;
        e.preventDefault();
        clear?.();
        return;
      }
      if (!seek) return;
      /*
       * The arrows and Home stay INSIDE the portion when there is one.
       *
       * They always have in effect — the playhead is clamped into the portion
       * downstream — but since W34 item 4 a bar outside the portion is what
       * puts the portion away, and stepping off the end of a four-bar loop is
       * not "I have gone somewhere else". A click is; these are not.
       */
      const floor = chosen ? Math.min(chosen.startBar, chosen.endBar) : 0;
      const last = chosen
        ? Math.max(chosen.startBar, chosen.endBar)
        : Math.max(0, current.bars.length - 1);
      const from = playheadRef.current ?? floor;
      let next: number | null = null;
      if (e.key === "ArrowLeft") next = Math.max(floor, from - 1);
      else if (e.key === "ArrowRight") next = Math.min(last, from + 1);
      else if (e.key === "Home") next = floor;
      if (next === null) return;
      e.preventDefault();
      // Through `goTo`, like a click: an arrow that moved the playhead
      // without the line following it for half a second is the same
      // complaint in a different gesture.
      go(next);
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
   * Keep the place in view, and bring the next system in BEFORE it is needed.
   *
   * We scroll our own container rather than letting alphaTab scroll something
   * it does not own (`scrollMode = Off`).
   *
   * ## It is worked out from the ENGRAVING, never measured off the cursor
   * (W36 item 1)
   *
   * The owner, 2026-09-21: *"when i click on a part of the tab that is not on
   * the first row … it's scrolling to the wrong location"*. Measured on the
   * 120-bar fixture at 2000x1124: with the page at bar 60 and bar 60 clicked,
   * the seek was right — the playhead mark landed on bar 60 — and the page
   * scrolled to **zero**. Clicking bar 118 next scrolled it to bar 60. Every
   * click landed on the bar clicked BEFORE it.
   *
   * The reason is alphaTab's, and it is not a units or a zoom problem (its
   * `BoundsLookup.finish(scale)` multiplies every rectangle by
   * `display.scale`, so bounds are final CSS pixels at any zoom). It is that
   * **alphaTab moves its cursor two animation frames after the tick is
   * written.** `api.tickPosition = …` raises `playerPositionChanged`, whose
   * handler is `uiFacade.beginInvoke` — a `requestAnimationFrame` — and the
   * work it schedules ends in a SECOND `beginInvoke` before
   * `_internalCursorUpdateBeat` finally calls `placeBarCursor`. A React effect
   * runs in the same commit as the write, so a rule that measured
   * `.at-cursor-bar` was always reading the previous position. While the
   * transport runs the reports are continuous and two frames of lag is
   * invisible; a seek is a jump, and a jump read one position late is a jump
   * to the wrong place. Changing the zoom made it worse rather than caused it:
   * a re-engrave builds a fresh `AlphaTabApi` whose cursor has not been placed
   * at all, so the first scroll after one went to the top of the piece.
   *
   * So the bar is looked up instead: `placeBarCursor` sets the cursor to
   * `masterBarBounds.visualBounds` and nothing else, which is exactly the
   * rectangle `boundsLookup.findMasterBarByIndex` hands back — synchronously,
   * off the engraving the page is currently showing. Same rectangle, no lag,
   * and it is the same lookup the playhead mark and the selection bands
   * already draw from, so the three can never disagree.
   *
   * **Half a system of lead while it is PLAYING, and none when it is not.**
   * Playing, keeping half a system clear beneath the cursor means the start of
   * the next line is on screen before the player reaches it. Stopped, the
   * owner's sentence is that the page must not move at all if the bar was
   * already visible — so a click brings the bar into view and does nothing
   * more. Either way it is the smallest scroll that does the job, rather than
   * parking the bar at a fixed place, which would keep the first system
   * clipped off the top from the first beat for no gain.
   */
  useEffect(() => {
    if (!ready) return;
    const host = hostRef.current;
    const viewport = host?.closest<HTMLElement>(".songs-tab-viewport");
    const lookup = apiRef.current?.renderer?.boundsLookup;
    if (!host || !viewport || !lookup) return;
    const printed = printedBarOfPlayed(score, playedBarAtTick(score, shownTick));
    if (printed === null) return;
    const bounds = lookup.findMasterBarByIndex(printed);
    if (!bounds) return;
    const box = bounds.visualBounds;
    if (box.h <= 0) return;
    // The engraving's coordinates are the host's; the host's own offset inside
    // the scroller is what turns them into the scroller's.
    const offset =
      host.getBoundingClientRect().top - viewport.getBoundingClientRect().top + viewport.scrollTop;
    const top = offset + box.y;
    const lead = playing ? Math.min(box.h / 2, viewport.clientHeight / 3) : 0;
    const wantedBottom = top + box.h + lead;
    let next: number | null = null;
    if (top - lead < viewport.scrollTop) next = Math.max(0, top - lead);
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
    // `rendered` is the engraving these rectangles belong to: a re-engrave at
    // another zoom moves every bar, and the place has to be found again on the
    // new page rather than kept from the old one. `shownTick` rather than
    // `tick`, so a click takes the page with it at once and a report that
    // predates the click cannot drag it back (W36 item 1).
  }, [shownTick, ready, rendered, playing, score]);

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
