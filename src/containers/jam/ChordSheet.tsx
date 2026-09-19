import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChordDiagram } from "../../components/chords";
import { Fretboard, BASS_STANDARD_TUNING, GUITAR_STANDARD_TUNING } from "../../components/fretboard";
import { Presence, useLastPresent } from "../../components/Presence";
import { chordsInKey } from "../../jam/diatonic";
import {
  CHORD_FAMILIES,
  basicShape,
  qualitiesInFamily,
  sheetGrid,
} from "../../jam/cheatSheet";
import { shapesFor } from "../../jam/chordShapes";
import { chordName, chordSuffix, keyRootName, noteName, spellingForKey } from "../../jam/harmony";
import type { PlacedShape, Instrument } from "../../jam/chordShapes";
import type { Chord, ChordQuality, Key, PitchClass } from "../../jam/harmony";
import { SCALES, SCALE_IDS, scaleNotes } from "../../jam/scales";
import type { ScaleSuggestion } from "../../jam/scales";

/**
 * A semitone above the scale's root, named the way a player names it.
 *
 * Twelve of them, because a note can be any distance from the root — even the
 * ones no scale here contains, since the neck shows only the scale's own
 * notes and this is what names them.
 */
/** What the fretboard writes inside its dots. */
type DotLabel = "none" | "notes" | "degrees";
const DOT_LABELS: readonly DotLabel[] = ["none", "notes", "degrees"];

const DEGREES = [
  "root",
  "flat2",
  "second",
  "flat3",
  "third",
  "fourth",
  "flat5",
  "fifth",
  "flat6",
  "sixth",
  "flat7",
  "seventh",
] as const;
import type { Jam } from "../../jam/types";
import { Segmented } from "./Segmented";

/** Which of the two pages the CHORDS tab is on (JAM_UX_DECISIONS A10). */
export type ChordPage = "key" | "all";

const CHORD_PAGES: readonly ChordPage[] = ["key", "all"];

/**
 * Which half of the cheat sheet you are reading.
 *
 * The page used to be called Chords and hold both: the chords at the top and
 * the neck at the bottom behind a switch labelled "Fretboard", which is
 * where the scales lived and where nobody found them. The owner: "this whole
 * page i don't think it should be called chords anymore but instead
 * cheatsheet and have 2 tabs or something, one for chords and another one
 * for scales".
 *
 * Two tabs, and note what leaves with the change: the Fretboard switch. A
 * tab does that job already, which is the sign that tabs are the right shape
 * here rather than one more control. The page-and-flavour controls go with
 * the chords too — they were sitting above a sheet that might have been
 * showing you a neck.
 */
export type CheatTab = "chords" | "scales";

const CHEAT_TABS: readonly CheatTab[] = ["chords", "scales"];

/**
 * What the plain major column is headed.
 *
 * Every other column is the quality's own suffix — m, 7, m7b5, sus4 — and a
 * major chord's suffix is nothing at all, which is no use as a heading. Not
 * translated, for the same reason none of the others are: a chord symbol is
 * the same in every language a musician reads.
 */
const MAJOR_COLUMN = "maj";

/**
 * How much of the chart the sticky root column covers.
 *
 * A jump lands the column it was asked for just clear of it, rather than
 * underneath it — which looks exactly like the jump not having worked.
 */
const ROOT_COLUMN_WIDTH = 52;

/** The pinned shape as the record stores it, matched back to a real grip. */
export function pinnedShapeOf(
  jam: Jam,
  instrument: Instrument | null,
): { shape: PlacedShape; chord: Chord } | null {
  const pin = jam.pinnedShape;
  if (!pin || !instrument) return null;
  const shapes = shapesFor(pin.root as Chord["root"], pin.quality as Chord["quality"], {
    instrument,
  });
  const shape = shapes[Math.min(Math.max(pin.index, 0), Math.max(0, shapes.length - 1))];
  if (!shape) return null;
  return { shape, chord: { root: shape.root, quality: shape.quality } };
}

interface ChordSheetProps {
  jam: Jam;
  onEdit: (patch: Partial<Omit<Jam, "id" | "createdAt">>) => void;
  /** The key as the player READS it — already transposed. */
  playedKey: Key;
  /** The chord the jam is on, or null when chords are off. */
  current: Chord | null;
  /**
   * The scales this key suggests, best first. The neck draws one of them and
   * the row above it offers the rest.
   */
  scales: readonly ScaleSuggestion[];
  /** Which neck to draw, or null for a player who has none. */
  instrument: Instrument | null;
  /** The chord whose shapes are expanded, or null. Screen state. */
  expanded: Chord | null;
  onExpand: (chord: Chord | null) => void;
  /** Which of the expanded chord's shapes is selected; `jam-next-shape` steps it. */
  shapeIndex: number;
  onShapeIndex: (index: number) => void;
  /** In key, or the whole library. Screen state. */
  page: ChordPage;
  onPage: (page: ChordPage) => void;
  /** Chords or scales. Screen state, like everything else about the view. */
  tab: CheatTab;
  onTab: (tab: CheatTab) => void;
}

/**
 * What the docked frame's header says while the chord sheet is in it.
 *
 * The header belongs to the frame, and the frame is shared with the setup
 * sheet (A11) — one `<aside>` whose title changes when you switch between the
 * two, rather than one sliding out and another sliding in behind it.
 */
export function cheatSheetTitle(
  playedKey: Key,
  tab: CheatTab,
  page: ChordPage,
  t: (k: string, o?: Record<string, unknown>) => string,
): { title: string; subtitle: string } {
  return {
    title: t("jam.cheat.title", { key: keyLabel(playedKey, t) }),
    subtitle:
      tab === "scales"
        ? t("jam.cheat.scalesLead")
        : page === "all"
          ? t("jam.chords.allLead")
          : t("jam.chords.sheetLead"),
  };
}

/**
 * The chords, as a cheat sheet a player would actually reach for
 * (JAM_UX_DECISIONS A8, then A10).
 *
 * A8 got the shapes off the playing screen and onto a page that holds still:
 * "the fretboard and the chords are amazing, but they shouldn't keep
 * changing." A10 is the owner's next session with it — "only major and 7ths
 * chords? … the user should be able to see ALL chords for all keys, or filter
 * by the chords the user can play in the key of the current jam. Feels
 * incomplete." It was. The sheet showed seven chords and hid the other
 * fourteen chord types the library knows, and the first chord a rock player
 * reaches for did not exist at all.
 *
 * So it is two pages now, and one rule holds both together: **a chord fits the
 * key when every one of its notes is in the key's note set.** In key is the
 * key's own chords at four readings — triads, sevenths, the colours that fit,
 * and every degree as a power chord. All chords is the library: twelve roots,
 * every quality under each, and a switch to hide the ones that do not fit
 * rather than a page that pretends they are not there.
 *
 * Both pages tap through to the same "every way to play it" and the same Pin,
 * so a grip you found by browsing can go to the corner of the playing screen
 * exactly like one you found in the key.
 *
 * Nothing here moves on its own, and changing page or flavour does NOT animate
 * the cards: a cheat sheet that reshuffles under your eyes is the thing A8
 * removed, and putting it back with a nicer curve would still be putting it
 * back.
 */
export function ChordSheet({
  jam,
  onEdit,
  playedKey,
  current,
  scales,
  instrument,
  expanded,
  onExpand,
  shapeIndex,
  onShapeIndex,
  page,
  onPage,
  tab,
  onTab,
}: ChordSheetProps) {
  const { t } = useTranslation();

  const follows = !!jam.shapesFollow;

  /**
   * Which chord the drill-down is about.
   *
   * The one you tapped; or, with "Follow the jam" on, the one the band is
   * playing. Following is a mode you chose, so it wins over a tap the moment
   * it is on — which is exactly what "follow" means.
   */
  const subject = follows ? (current ?? expanded) : expanded;

  /** "In key" thins the sheet to what works here; "All keys" is the lot. */
  const inKeyOnly = page === "key";

  /** Which roots the key owns, for the mark down the chart's left edge. */
  const keyRoots = useMemo(
    () => new Set(chordsInKey(playedKey.root, playedKey.mode).map((c) => c.root)),
    [playedKey.root, playedKey.mode],
  );

  /**
   * Every grip the chart needs, worked out once.
   *
   * Twelve roots by sixteen chord types, and `shapesFor` filters and places
   * the whole library on every call — a hundred and ninety-two of those on
   * each render would be felt. The cache lives as long as the instrument
   * does, which is as long as the answers do.
   */
  const shapeCache = useMemo(() => {
    const seen = new Map<string, readonly PlacedShape[]>();
    return (root: PitchClass, quality: ChordQuality): readonly PlacedShape[] => {
      if (!instrument) return [];
      const at = `${root}:${quality}`;
      let got = seen.get(at);
      if (!got) {
        got = shapesFor(root, quality, { instrument });
        seen.set(at, got);
      }
      return got;
    };
  }, [instrument]);

  /**
   * The chart's columns: every chord type the library knows, in the order
   * the families put them — plain ones, then sevenths, then colours.
   *
   * All sixteen, always. They used to be four-at-a-time behind a Triads /
   * 7ths / Colours / Power switch, which meant a page called "the chords in
   * D" showed seven boxes and hid the rest behind a word.
   */
  const qualities = useMemo(
    () => CHORD_FAMILIES.flatMap((family) => [...qualitiesInFamily(family)]),
    [],
  );

  /** The first column of each family, so a jump knows where to land. */
  const familyStarts = useMemo(
    () =>
      CHORD_FAMILIES.map((family) => ({
        family,
        quality: qualitiesInFamily(family)[0],
      })),
    [],
  );

  /**
   * Take me to the minor chords.
   *
   * Not a filter. The owner was explicit about why: "clicking on minor it
   * focuses the minor chords but doesn't fucking filter... filtering is
   * annoying because it changes the whole page". So this scrolls the chart
   * sideways to that family's first column and leaves everything where it
   * is — the thing you were looking at is still on screen, just not in the
   * middle any more.
   */
  const tableRef = useRef<HTMLDivElement>(null);
  const scalesRef = useRef<HTMLElement>(null);

  /** Take me to the blues scale. Scrolls the sheet, hides nothing. */
  const jumpToScale = (scale: string) => {
    scalesRef.current
      ?.querySelector(`[data-scale="${scale}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const jumpTo = (quality: ChordQuality) => {
    const wrap = tableRef.current;
    const column = wrap?.querySelector<HTMLElement>(`[data-quality="${quality}"]`);
    if (!wrap || !column) return;
    // Measured rather than `scrollIntoView`, which on a box inside a
    // scrolling sheet scrolls the sheet vertically as well and throws the
    // reader somewhere they did not ask to go.
    wrap.scrollTo({
      left: Math.max(0, column.offsetLeft - wrap.offsetLeft - ROOT_COLUMN_WIDTH),
      behavior: "smooth",
    });
  };

  /**
   * The chart itself: a row per root, a column per chord type.
   *
   * "In key" drops ROWS, never cells. It used to hide the individual chords
   * that do not belong to the key, and the owner put the result next to a
   * printed one: "none of the cheat sheets online have gaps like yours".
   * Quite right — a reference with holes in it is a reference you have to
   * interpret, and every row of a real chart is solid. So the key thins the
   * chart to the roots it is built on, each of them complete; the dot on a
   * cell still says which of those chords is strictly in the key.
   */
  const rows = useMemo(() => {
    const all = sheetGrid(playedKey, qualities, shapeCache);
    return inKeyOnly ? all.filter((row) => keyRoots.has(row.root)) : all;
  }, [playedKey, qualities, shapeCache, inKeyOnly, keyRoots]);

  /** What the shapes section is about while it folds away (A11). */
  const shownSubject = useLastPresent(subject);

  const shapes = useMemo(
    () =>
      instrument && shownSubject
        ? shapesFor(shownSubject.root, shownSubject.quality, { instrument })
        : [],
    [instrument, shownSubject],
  );

  const picked = shapes.length
    ? shapes[Math.min(Math.max(shapeIndex, 0), shapes.length - 1)]
    : null;

  const pin = jam.pinnedShape ?? null;
  // The INDEX counts, not only the chord. An A7 has five grips on a guitar
  // and pinning "the barre at the fifth" while the open one is pinned is a
  // real thing to want; without the index the button read "Unpin" over a
  // shape that was not the pinned one, and pressing it threw away the pin
  // you had rather than moving it.
  const isPinned =
    !!pin &&
    !!picked &&
    pin.root === picked.root &&
    pin.quality === picked.quality &&
    pin.index === shapes.indexOf(picked);

  /**
   * What is written inside the dots: nothing, the note, or the degree.
   *
   * A switch could only ever answer one of the two questions a player asks
   * of a fretboard, and they are different questions. "Which note is this"
   * is how you learn the neck. "Which degree is this" is how you MOVE a
   * shape: the same pattern of 1, ♭3 and 5 is the same lick in every key,
   * and letters hide that.
   *
   * Nothing by default. The shape of a scale is what you look at first, and
   * sixty labels on it is a busier picture than sixty dots.
   */
  const [dots, setDots] = useState<DotLabel>("none");

  /**
   * Every scale, drawn, one under the next.
   *
   * "In key" is the handful this key suggests, best first. "All keys" is
   * every scale the app knows, from this key's root — which is the printed
   * card exactly: major pentatonic, minor pentatonic, blues, the major
   * scale, then the modes, each with its own neck.
   *
   * It used to be ONE neck with a row of chips above it, so five of the six
   * a key offers were invisible until you pressed something.
   */
  const boards = useMemo(
    () =>
      inKeyOnly
        ? scales
        : SCALE_IDS.map((id) => ({
            scale: id,
            root: playedKey.root,
            labelKey: SCALES[id].labelKey,
            pitchClasses: scaleNotes(playedKey.root, id),
          })),
    [inKeyOnly, scales, playedKey.root],
  );

  const nameOf = (pc: number) => noteName(pc as PitchClass, spellingForKey(playedKey));

  /** What a note is against a given root: "1", "♭3", "5". */
  const degreeFrom = (root: PitchClass) => (pc: number) =>
    t(`jam.degree.${DEGREES[(pc - root + 12) % 12]}`);

  /** What the neck writes in its dots, for the scale being drawn. */
  const labelOnNeck = (root: PitchClass) =>
    dots === "notes" ? nameOf : dots === "degrees" ? degreeFrom(root) : undefined;

  /**
   * What a note on the neck is: its name, and what it is doing in the scale.
   *
   * A dot on a fretboard is the one thing on this screen that says WHERE
   * without saying WHAT, and "which one is the flat third" is the question a
   * player is actually asking of it.
   */
  const describeFor = (root: PitchClass) => (pc: number) =>
    `${nameOf(pc)} · ${degreeFrom(root)(pc)}`;

  /**
   * What a chord box writes on its dots.
   *
   * The note's name is the same question the neck answers. The DEGREE is
   * not: on the neck it is measured from the scale's root, and in a chord
   * box it can only be measured from the chord's own — the third of a Bm7 is
   * the third of Bm7 whatever key you are in, and that is the whole reason a
   * player looks at it. So this is built per chord rather than once.
   */
  const labelInBox = (chordRoot: PitchClass) =>
    dots === "notes" ? nameOf : dots === "degrees" ? degreeFrom(chordRoot) : undefined;

  /** One cell of the chart: a chord, its grip, and whether it fits the key. */
  const card = (
    chord: Chord,
    key: string,
    options: { degree?: string; inKeyMark?: boolean } = {},
  ) => {
    const shape = instrument ? basicShape(shapeCache(chord.root, chord.quality)) : null;
    const name = chordName(chord, playedKey);
    const on = !!subject && subject.root === chord.root && subject.quality === chord.quality;
    return (
      <button
        key={key}
        type="button"
        className={`jam-chord-card${on ? " active" : ""}${
          options.inKeyMark ? " in-key" : ""
        }`}
        aria-pressed={on}
        aria-label={name}
        onClick={() => {
          onExpand(on ? null : chord);
          onShapeIndex(0);
        }}
      >
        {options.inKeyMark && (
          <span className="jam-chord-mark" role="img" aria-label={t("jam.chords.inKeyMark")} />
        )}
        {shape ? (
          <ChordDiagram
            shape={shape}
            size="sm"
            selected={on}
            label={name}
            nameNote={labelInBox(chord.root)}
          />
        ) : (
          <span className="jam-chord-card-name">{name}</span>
        )}
        {options.degree && <span className="jam-chord-card-degree">{options.degree}</span>}
      </button>
    );
  };

  /** What the dots say, on whichever picture the tab is showing. */
  const onTheDots = instrument ? (
    <Segmented
      label={t("jam.fretboard.onTheDots")}
      value={dots}
      options={DOT_LABELS.map((id) => ({
        id,
        label: t(`jam.fretboard.dots${id[0].toUpperCase()}${id.slice(1)}`),
      }))}
      onChange={setDots}
    />
  ) : null;
  return (
    <>
      {/* Two switches, one row, and that is the whole of the chrome.

          There used to be three stacked down the right-hand edge — Chords /
          Scales, then In key / All chords, then Triads / 7ths / Colours /
          Power — and under them seven cards. The owner, holding a printed
          chart: "all the options that a user should see at the top is the
          switch between chords and scales and in key or all keys (and
          ideally both switches on the same row)... having a switch for
          switching between 7ths, triads etc is a fucking pain in the ass".

          Quite right. A cheat sheet is a thing you look AT. Every control on
          it is one more thing between the player and the answer, and the
          flavour switch was hiding nine of the sixteen chord types behind a
          word most people would not press. It is gone; everything shows. */}
      <div className="jam-cheat-controls">
        <Segmented
          label={t("jam.cheat.tabs")}
          labelHidden
          value={tab}
          options={CHEAT_TABS.map((id) => ({ id, label: t(`jam.cheat.${id}`) }))}
          onChange={onTab}
        />
        <Segmented
          label={t("jam.cheat.scope")}
          labelHidden
          value={page}
          options={CHORD_PAGES.map((id) => ({ id, label: t(`jam.cheat.scope${cap(id)}`) }))}
          onChange={onPage}
        />
        {onTheDots}
      </div>

      {/* Jump, don't filter. A word, and the sheet moves to it — the chart
          sideways to that family of chords, the scales page down to that
          scale. Nothing is hidden and nothing else moves. */}
      <nav className="jam-chord-jump" aria-label={t("jam.cheat.jumpLabel")}>
        <span className="stage-label">{t("jam.cheat.jump")}</span>
        {tab === "chords"
          ? familyStarts.map(({ family, quality }) => (
              <button
                key={family}
                type="button"
                className="jam-chip"
                onClick={() => jumpTo(quality)}
              >
                {t(`jam.cheat.family${cap(family)}`)}
              </button>
            ))
          : boards.map((board) => (
              <button
                key={`${board.scale}-${board.root}`}
                type="button"
                className="jam-chip"
                onClick={() => jumpToScale(board.scale)}
              >
                {t(board.labelKey, { defaultValue: board.scale })}
              </button>
            ))}
      </nav>

      {tab === "chords" ? (
        <>
          {/* The chart: every root down the side, every chord type across.

              This is the poster a guitarist tapes to the wall, and it is one
              picture rather than a page you drive. "In key" thins it to what
              works over this jam; "All keys" is the lot. */}
          <div className="jam-chord-table-wrap" ref={tableRef}>
            <table className="jam-chord-table">
              <thead>
                <tr>
                  <td />
                  {qualities.map((quality) => (
                    <th key={quality} scope="col" data-quality={quality}>
                      {chordSuffix(quality) || MAJOR_COLUMN}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.root}>
                    <th scope="row" className="jam-chord-table-root">
                      {row.name}
                      {keyRoots.has(row.root) && (
                        <span
                          className="jam-chord-mark"
                          role="img"
                          aria-label={t("jam.chords.inKeyMark")}
                        />
                      )}
                    </th>
                    {row.cells.map((cell) => (
                      <td key={cell.chord.quality} className="jam-chord-cell">
                        {cell.shape
                          ? card(cell.chord, `${row.root}-${cell.chord.quality}`, {
                              inKeyMark: cell.fits,
                            })
                          : null}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="jam-chord-switches">
            <button
              type="button"
              role="switch"
              aria-checked={follows}
              className={`transport-switch jam-switch ${follows ? "on" : ""}`}
              data-explain={t("jam.chords.followHint")}
              onClick={() => onEdit({ shapesFollow: !follows })}
            >
              <span className="transport-switch-track" aria-hidden="true" />
              {t("jam.chords.follow")}
            </button>
          </div>

          {/* Every way to play the one you tapped — a drill-down, opened by
              a cell of the chart above and closed by tapping it again. */}
          <Presence open={!!subject && !!instrument && shapes.length > 0}>
            {(_state, ways) =>
              shownSubject && (
                <section
                  className="jam-chord-ways motion-unfold"
                  aria-label={t("jam.chords.everyWay", {
                    chord: chordName(shownSubject, playedKey),
                  })}
                  {...ways}
                >
                  <div className="jam-sheet-group-head">
                    <span className="stage-label">
                      {t("jam.chords.everyWay", { chord: chordName(shownSubject, playedKey) })}
                    </span>
                    <span className="jam-sheet-lead">{t("jam.chords.lowToHigh")}</span>
                    <button
                      type="button"
                      className={`jam-link${isPinned ? " active" : ""}`}
                      aria-pressed={isPinned}
                      onClick={() =>
                        onEdit({
                          pinnedShape: isPinned
                            ? null
                            : picked
                              ? {
                                  root: picked.root,
                                  quality: picked.quality,
                                  index: shapes.indexOf(picked),
                                }
                              : null,
                        })
                      }
                    >
                      {isPinned ? t("jam.chords.unpin") : t("jam.chords.pin")}
                    </button>
                  </div>
                  <div className="jam-chord-shapes">
                    {shapes.map((shape, index) => (
                      <button
                        key={shape.id}
                        type="button"
                        className={`jam-chord-shape${index === shapeIndex ? " active" : ""}`}
                        aria-pressed={index === shapeIndex}
                        onClick={() => onShapeIndex(index)}
                      >
                        <ChordDiagram
                          shape={shape}
                          size="sm"
                          selected={index === shapeIndex}
                          showName={false}
                          nameNote={labelInBox(shape.root)}
                        />
                        <span className="jam-chord-shape-label">
                          {t(`jam.chords.size${sizeKey(shape.size)}`)}
                        </span>
                        {shape.position > 0 && (
                          <span className="jam-chord-shape-fret">
                            {t("jam.chords.fret", { fret: shape.position })}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </section>
              )
            }
          </Presence>
        </>
      ) : (
        /* The scales, every one of them drawn.

           This was one neck with a row of chips above it, so five of the six
           scales a key offers were a click away and invisible until you
           clicked. The printed card stacks them — a title bar, the formula,
           and the whole neck — and you read down it. So does this. */
        <section className="jam-scale-sheet" ref={scalesRef}>
          {boards.length === 0 ? (
            <p className="jam-sheet-note">{t("jam.cheat.noScales")}</p>
          ) : (
            boards.map((board) => (
              <section
                key={`${board.scale}-${board.root}`}
                className="jam-scale-board"
                data-scale={board.scale}
              >
                <header className="jam-scale-board-head">
                  <h3 className="jam-scale-board-name">
                    {t(board.labelKey, { defaultValue: board.scale })}
                  </h3>
                  <span className="jam-scale-board-count">
                    {t("jam.cheat.noteCount", { count: board.pitchClasses.length })}
                  </span>
                  {/* The formula, in the degrees the card prints: 1 ♭3 4 5 ♭7.
                      It is what makes two scales comparable at a glance — the
                      blues scale is the minor pentatonic with a ♭5 in it, and
                      the picture alone never says so. */}
                  <span className="jam-scale-board-formula">
                    {board.pitchClasses.map((pc) => (
                      <span key={pc} className="jam-scale-degree">
                        {t(`jam.degree.${DEGREES[(pc - board.root + 12) % 12]}`)}
                      </span>
                    ))}
                  </span>
                </header>
                <Fretboard
                  tuning={instrument === "bass" ? BASS_STANDARD_TUNING : GUITAR_STANDARD_TUNING}
                  startFret={0}
                  frets={17}
                  highlight={{ pitchClasses: board.pitchClasses, rootPitchClass: board.root }}
                  describeNote={describeFor(board.root)}
                  nameNote={labelOnNeck(board.root)}
                  size="sheet"
                  className="jam-fretboard"
                  ariaLabel={t("jam.fretboard.aria", { chord: keyRootName(playedKey) })}
                />
              </section>
            ))
          )}
        </section>
      )}
    </>
  );
}

/** `ShapeSize` to the suffix of its locale key. */
function sizeKey(size: PlacedShape["size"]): string {
  return size.charAt(0).toUpperCase() + size.slice(1);
}

/** An id to the tail of its locale key: `all` → `All`, `basic` → `Basic`. */
function cap(id: string): string {
  return id.charAt(0).toUpperCase() + id.slice(1);
}

/** "A blues", "D minor", "G major" — the key, in the reader's language. */
function keyLabel(key: Key, t: (k: string, o?: Record<string, unknown>) => string): string {
  return t(`jam.key.${key.mode}Named`, { root: keyRootName(key) });
}
