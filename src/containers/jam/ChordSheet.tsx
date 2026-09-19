import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChordDiagram } from "../../components/chords";
import { Fretboard, BASS_STANDARD_TUNING, GUITAR_STANDARD_TUNING } from "../../components/fretboard";
import { Presence, useLastPresent } from "../../components/Presence";
import { chordsInKey } from "../../jam/diatonic";
import type { DiatonicChord } from "../../jam/diatonic";
import {
  CHORD_FAMILIES,
  CHORD_FLAVOURS,
  basicShape,
  chordsAtFlavour,
  qualitiesInFamily,
  sheetGrid,
} from "../../jam/cheatSheet";
import type { ChordFlavour } from "../../jam/cheatSheet";
import { shapesFor } from "../../jam/chordShapes";
import { chordName, chordSuffix, keyRootName, noteName, spellingForKey } from "../../jam/harmony";
import type { PlacedShape, Instrument } from "../../jam/chordShapes";
import type { Chord, ChordQuality, Key, PitchClass } from "../../jam/harmony";
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
  /** Triads, 7ths, colours or power — the In key page's four readings. */
  flavour: ChordFlavour;
  onFlavour: (flavour: ChordFlavour) => void;
  /** Hide the chords that do not fit the key. Off by default. */
  onlyInKey: boolean;
  onOnlyInKey: (on: boolean) => void;
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
  flavour,
  onFlavour,
  onlyInKey,
  onOnlyInKey,
  tab,
  onTab,
}: ChordSheetProps) {
  const { t } = useTranslation();

  const follows = !!jam.shapesFollow;

  /**
   * Which chord the expanded row is about.
   *
   * The one you tapped; or, with "Follow the jam" on, the one the band is
   * playing. Following is a mode you chose, so it wins over a tap the moment
   * it is on — which is exactly what "follow" means.
   *
   * On the browser page it never wins: you went there to look something up,
   * and a section that jumped back to the jam's chord every bar would make
   * looking anything up impossible. The switch is not even shown there.
   */
  const subject = page === "key" && follows ? (current ?? expanded) : expanded;

  /** The key's own chords at the chosen reading. */
  const inKey = useMemo(
    () => chordsAtFlavour(playedKey.root, playedKey.mode, flavour),
    [playedKey.root, playedKey.mode, flavour],
  );

  /**
   * The colours, gathered under the degree they belong to, in degree order.
   *
   * Two things the flat list hands over that a page must not draw as it
   * stands. A minor key lists both the natural v and the borrowed V7, and a
   * suspension has no third — so Gsus4 arrives twice in A minor, once under
   * each. The chord is shown once, under the first degree that offered it.
   *
   * And the heading is the degree without the colour's own mark: "V" over
   * Gsus4, Gsus2 and G9, not "Vsus4" over three chords only one of which is
   * a sus4.
   */
  const colourGroups = useMemo(() => {
    if (flavour !== "colours") return [];
    const groups: { root: PitchClass; degree: string; chords: DiatonicChord[] }[] = [];
    const seen = new Set<string>();
    for (const chord of inKey) {
      const id = `${chord.root}:${chord.quality}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const last = groups[groups.length - 1];
      if (last && last.root === chord.root) last.chords.push(chord);
      else groups.push({ root: chord.root, degree: stemOf(chord), chords: [chord] });
    }
    return groups.filter((group) => group.chords.length > 0);
  }, [flavour, inKey]);

  /** Which roots the key owns, for the mark down the table's left edge. */
  const keyRoots = useMemo(
    () => new Set(chordsInKey(playedKey.root, playedKey.mode).map((c) => c.root)),
    [playedKey.root, playedKey.mode],
  );

  /**
   * Every grip the table needs, worked out once.
   *
   * The poster is twelve roots by sixteen chord types, and `shapesFor`
   * filters and places the whole library on every call — a hundred and
   * ninety-two of those on each render would be felt. The cache lives as
   * long as the instrument does, which is as long as the answers do.
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
   * The table's columns, taken from the families rather than listed again.
   *
   * The bands across the top and the cells under them are then the same
   * list read twice, and cannot come to disagree about either the order or
   * the count — which is the only way a header band ever lies.
   */
  const columns = useMemo(
    () =>
      CHORD_FAMILIES.map((family) => ({ family, qualities: qualitiesInFamily(family) })),
    [],
  );
  const qualities = useMemo(
    () => columns.flatMap((band) => band.qualities),
    [columns],
  );

  /** The poster itself: a row per root, a column per chord type. */
  const grid = useMemo(
    () => sheetGrid(playedKey, qualities, shapeCache),
    [playedKey, qualities, shapeCache],
  );

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
   * The neck, static.
   *
   * The key's scale and nothing else: not the current chord's, which is what
   * made it "keep changing". The same neck in bar 1 and bar 9.
   *
   * The WHOLE neck, from the nut (2026-09-17). It used to open on the box —
   * the five frets where the minor pentatonic sits — and the owner: "when
   * showing the fretboard we should always show from first fret too, not only
   * where the minor pentatonic 'starts' and ideally up to fret 17". Which is
   * right, and for a reason the box hid: the notes of a key are everywhere on
   * the neck, and a picture that starts at the fifth fret quietly says they
   * are not. Open strings are in the key too, and they were off the left-hand
   * edge of it.
   */
  /**
   * Which of the key's scales the neck is drawing.
   *
   * The first by default — the one a player reaches for — and then whichever
   * you pick, for the rest of the screen session. Kept here rather than on
   * the record: it is a way of looking at the key, not a fact about the jam.
   */
  const [scaleIndex, setScaleIndex] = useState(0);
  /**
   * What is written inside the dots: nothing, the note, or the degree.
   *
   * A switch could only ever answer one of the two questions a player asks of
   * a fretboard, and they are different questions. "Which note is this" is
   * how you learn the neck, and it is the printed chart every guitarist owns.
   * "Which degree is this" is how you MOVE a shape: the same pattern of 1, ♭3
   * and 5 is the same lick in every key, and letters hide that.
   *
   * Nothing by default. The shape of a scale is what you look at first, and
   * sixty labels on it is a busier picture than sixty dots.
   */
  const [dots, setDots] = useState<DotLabel>("none");
  const scale = scales[Math.min(scaleIndex, scales.length - 1)] ?? null;
  const board = scale
    ? { highlight: { pitchClasses: scale.pitchClasses, rootPitchClass: scale.root } }
    : null;

  /**
   * What a note on the neck is: its name, and what it is doing in the scale.
   *
   * The owner: "can we also add on hover the notes on the fretboard it should
   * show some info? something like what note that is and also some info of
   * that note in regards to the scale?" A dot on a fretboard is the one thing
   * on this screen that says WHERE without saying WHAT, and "which one is the
   * flat third" is the question a player is actually asking of it.
   */
  const nameOf = (pc: number) => noteName(pc as PitchClass, spellingForKey(playedKey));
  /** What this note is against the scale's root: "1", "♭3", "5". */
  const degreeOf = scale
    ? (pc: number) => t(`jam.degree.${DEGREES[(pc - scale.root + 12) % 12]}`)
    : undefined;
  const labelDot = dots === "notes" ? nameOf : dots === "degrees" ? degreeOf : undefined;
  const describeNote = scale
    ? (pc: number) => {
        return `${nameOf(pc)} · ${t(`jam.degree.${DEGREES[(pc - scale.root + 12) % 12]}`)}`;
      }
    : undefined;

  /**
   * What a box writes on its dots.
   *
   * The note's name is the same question the neck answers. The DEGREE is
   * not: on the neck it is measured from the scale's root, and in a chord
   * box it can only be measured from the chord's own — the third of a Bm7 is
   * the third of Bm7 whatever key you are in, and that is the whole reason a
   * player looks at it. So this is built per chord rather than once.
   */
  const labelInBox = (chordRoot: PitchClass) =>
    dots === "notes"
      ? nameOf
      : dots === "degrees"
        ? (pc: number) => t(`jam.degree.${DEGREES[(pc - chordRoot + 12) % 12]}`)
        : undefined;

  /** One card. The same card on both pages, which is why Pin works on both. */
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
        className={`jam-chord-card${on ? " active" : ""}`}
        aria-pressed={on}
        aria-label={name}
        onClick={() => {
          onExpand(on ? null : chord);
          onShapeIndex(0);
        }}
      >
        {options.inKeyMark && (
          <span
            className="jam-chord-mark"
            role="img"
            aria-label={t("jam.chords.inKeyMark")}
          />
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
    <div className="jam-scale-names">
      <Segmented
        label={t("jam.fretboard.onTheDots")}
        value={dots}
        options={DOT_LABELS.map((id) => ({
          id,
          label: t(`jam.fretboard.dots${id[0].toUpperCase()}${id.slice(1)}`),
        }))}
        onChange={setDots}
      />
    </div>
  ) : null;

  return (
    <>
      {/* Chords or scales. The tab sits under the header because the title
          says which KEY you are in, and that is true of both halves. */}
      <Segmented
        label={t("jam.cheat.tabs")}
        labelHidden
        value={tab}
        options={CHEAT_TABS.map((id) => ({ id, label: t(`jam.cheat.${id}`) }))}
        onChange={onTab}
      />

      {tab === "chords" ? (
        <>
          {/* Two pages of chords: the key's own, or the whole library. */}
          <Segmented
            label={t("jam.chords.pageLabel")}
            labelHidden
            value={page}
            options={CHORD_PAGES.map((id) => ({ id, label: t(`jam.chords.page${cap(id)}`) }))}
            onChange={onPage}
          />

          {page === "key" ? (
            <>
              <Segmented
                label={t("jam.chords.flavourLabel")}
                labelHidden
                value={flavour}
                options={CHORD_FLAVOURS.map((id) => ({ id, label: t(`jam.chords.${id}`) }))}
                onChange={onFlavour}
              />

              {onTheDots}

              {flavour === "colours" ? (
                <div className="jam-chord-degrees">
                  {colourGroups.map((group) => (
                    <section
                      key={group.root}
                      className="jam-chord-degree motion-arrives"
                      aria-label={group.degree}
                    >
                      <span className="jam-chord-degree-label">{group.degree}</span>
                      <div className="jam-chord-grid">
                        {group.chords.map((chord) =>
                          card(
                            { root: chord.root, quality: chord.quality },
                            `${chord.degree}-${chord.root}`,
                          ),
                        )}
                      </div>
                    </section>
                  ))}
                </div>
              ) : (
                <div className="jam-chord-grid" role="group" aria-label={t("jam.chords.label")}>
                  {inKey.map((chord) =>
                    card(
                      { root: chord.root, quality: chord.quality },
                      `${chord.degree}-${chord.root}`,
                      { degree: chord.degree },
                    ),
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              {onTheDots}

              {/* The poster: twelve roots down, every chord type across, in
                  three bands a player recognises.

                  It used to be one root at a time with the other eleven on a
                  row of buttons above it, which is a list you page through
                  rather than a card you scan — and the owner, who had the
                  printed thing in front of them, said so: "should the
                  cheatsheet organize the chords by triads/7ths/minor/minor6/
                  min7/... that's what i want to build". Everything needed was
                  already here; nothing had ever crossed the two axes.

                  A real table, headers and all, rather than a grid of divs: a
                  reader scanning down the m7 column to the D row is doing
                  exactly what a table is for, and a screen reader announcing
                  "D, m7" gets it for nothing. */}
              <div className="jam-chord-table-wrap">
                <table className="jam-chord-table">
                  <thead>
                    <tr className="jam-chord-table-bands">
                      <td />
                      {columns.map((band) => (
                        <th key={band.family} scope="colgroup" colSpan={band.qualities.length}>
                          <span className="stage-label">
                            {t(`jam.chords.family${cap(band.family)}`)}
                          </span>
                        </th>
                      ))}
                    </tr>
                    <tr>
                      <td />
                      {qualities.map((quality) => (
                        <th key={quality} scope="col">
                          {chordSuffix(quality) || MAJOR_COLUMN}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {grid.map((row) => (
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
                        {row.cells.map((cell) =>
                          /* With the filter on, a chord that is not in the key
                             leaves a gap rather than vanishing from the row.
                             The holes are the point — what is left is the
                             shape of the key — and a table whose rows are
                             different lengths is not a table. */
                          onlyInKey && !cell.fits ? (
                            <td
                              key={cell.chord.quality}
                              className="jam-chord-cell jam-chord-cell-out"
                              aria-hidden="true"
                            />
                          ) : (
                            <td key={cell.chord.quality} className="jam-chord-cell">
                              {cell.shape
                                ? card(cell.chord, `${row.root}-${cell.chord.quality}`, {
                                    inKeyMark: cell.fits,
                                  })
                                : null}
                            </td>
                          ),
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <div className="jam-chord-switches">
            {page === "key" ? (
              <button
                type="button"
                role="switch"
                aria-checked={follows}
                className={`transport-switch jam-switch ${follows ? "on" : ""}`}
                title={t("jam.chords.followHint")}
                onClick={() => onEdit({ shapesFollow: !follows })}
              >
                <span className="transport-switch-track" aria-hidden="true" />
                {t("jam.chords.follow")}
              </button>
            ) : (
              <button
                type="button"
                role="switch"
                aria-checked={onlyInKey}
                className={`transport-switch jam-switch ${onlyInKey ? "on" : ""}`}
                onClick={() => onOnlyInKey(!onlyInKey)}
              >
                <span className="transport-switch-track" aria-hidden="true" />
                {t("jam.chords.onlyInKey")}
              </button>
            )}
          </div>

          {/* Every way to play the one you tapped. It reads as the drill-down
              it is now that the neck has its own tab: sixteen near-identical
              boxes used to run the width of a page that was supposed to be
              about which chords exist, and the owner read them as the answer
              — "most are triad or barre". They are not the answer. They are
              where else you can put your hand. */}
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
                        {/* Where it sits, for the shapes that have somewhere
                            to sit. An open shape is at the nut by definition,
                            and a label reading "open · open" says nothing
                            twice. */}
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
        /* The scales half. Nothing to find it behind any more: the tab is the
           switch the neck used to hide under, and the neck is simply what
           this tab is. */
        <section className="jam-chord-neck">
          {scales.length > 1 && (
            <div className="jam-scale-chips" role="group" aria-label={t("jam.fretboard.scales")}>
              {scales.map((option, index) => {
                const on = index === Math.min(scaleIndex, scales.length - 1);
                return (
                  <button
                    key={`${option.scale}-${option.root}`}
                    type="button"
                    className={`jam-chip${on ? " active" : ""}`}
                    aria-pressed={on}
                    onClick={() => setScaleIndex(index)}
                  >
                    {t(option.labelKey, { defaultValue: option.scale })}
                  </button>
                );
              })}
            </div>
          )}

          {onTheDots}

          {board ? (
            <Fretboard
              tuning={instrument === "bass" ? BASS_STANDARD_TUNING : GUITAR_STANDARD_TUNING}
              startFret={0}
              frets={17}
              highlight={board.highlight}
              describeNote={describeNote}
              nameNote={labelDot}
              size="large"
              className="jam-fretboard"
              ariaLabel={t("jam.fretboard.aria", { chord: keyRootName(playedKey) })}
            />
          ) : (
            <p className="jam-sheet-note">{t("jam.cheat.noScales")}</p>
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

/**
 * A colour chord's degree with the colour's own mark taken off: "Vsus4" → "V".
 *
 * `cheatSheet` builds those labels as the degree's stem plus the quality's
 * suffix, so taking the suffix back off returns the stem exactly — no second
 * table of roman numerals, and no guessing.
 */
function stemOf(chord: DiatonicChord): string {
  const suffix = chordSuffix(chord.quality);
  return suffix && chord.degree.endsWith(suffix)
    ? chord.degree.slice(0, -suffix.length)
    : chord.degree;
}

/** An id to the tail of its locale key: `all` → `All`, `basic` → `Basic`. */
function cap(id: string): string {
  return id.charAt(0).toUpperCase() + id.slice(1);
}

/** "A blues", "D minor", "G major" — the key, in the reader's language. */
function keyLabel(key: Key, t: (k: string, o?: Record<string, unknown>) => string): string {
  return t(`jam.key.${key.mode}Named`, { root: keyRootName(key) });
}
