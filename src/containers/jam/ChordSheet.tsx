import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ChordDiagram } from "../../components/chords";
import { Fretboard, BASS_STANDARD_TUNING, GUITAR_STANDARD_TUNING } from "../../components/fretboard";
import { Presence, useLastPresent } from "../../components/Presence";
import { chordsInKey } from "../../jam/diatonic";
import type { DiatonicChord } from "../../jam/diatonic";
import {
  CHORD_FAMILIES,
  CHORD_FLAVOURS,
  chordsAtFlavour,
  fitsKey,
  qualitiesInFamily,
  rootNames,
} from "../../jam/cheatSheet";
import type { ChordFamily, ChordFlavour } from "../../jam/cheatSheet";
import { shapesFor } from "../../jam/chordShapes";
import { chordName, chordSuffix, keyRootName } from "../../jam/harmony";
import type { PlacedShape, Instrument } from "../../jam/chordShapes";
import type { Chord, Key, PitchClass } from "../../jam/harmony";
import type { ScaleSuggestion } from "../../jam/scales";
import type { Jam } from "../../jam/types";
import { Segmented } from "./Segmented";

/** Which of the two pages the sheet is on (JAM_UX_DECISIONS A10). */
export type ChordPage = "key" | "all";

const CHORD_PAGES: readonly ChordPage[] = ["key", "all"];

/**
 * The one shape a page like this should draw for a chord.
 *
 * "The open one or the first barre" (JAM_UX_DECISIONS A8). Not simply the
 * first shape the library returns: the lowest thing on the neck for a minor
 * seventh is often a three-string triad, which is a fine grip and a terrible
 * introduction. A page you glance at should show the chord the way you would
 * teach it.
 */
export function basicShape(shapes: PlacedShape[]): PlacedShape | null {
  return (
    shapes.find((s) => s.size === "open") ??
    shapes.find((s) => s.size === "barre") ??
    shapes[0] ??
    null
  );
}

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
  /** The scale to draw on the neck for this key. */
  scale: ScaleSuggestion | null;
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
  /** Which root the browser is showing, or null for the key's own. */
  root: PitchClass | null;
  onRoot: (root: PitchClass) => void;
  /** Hide the chords that do not fit the key. Off by default. */
  onlyInKey: boolean;
  onOnlyInKey: (on: boolean) => void;
  fretboardOpen: boolean;
  onFretboard: (open: boolean) => void;
}

/**
 * What the docked frame's header says while the chord sheet is in it.
 *
 * The header belongs to the frame, and the frame is shared with the setup
 * sheet (A11) — one `<aside>` whose title changes when you switch between the
 * two, rather than one sliding out and another sliding in behind it.
 */
export function chordSheetTitle(
  playedKey: Key,
  page: ChordPage,
  t: (k: string, o?: Record<string, unknown>) => string,
): { title: string; subtitle: string } {
  return {
    title: t("jam.chords.inKey", { key: keyLabel(playedKey, t) }),
    subtitle: page === "all" ? t("jam.chords.allLead") : t("jam.chords.sheetLead"),
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
  scale,
  instrument,
  expanded,
  onExpand,
  shapeIndex,
  onShapeIndex,
  page,
  onPage,
  flavour,
  onFlavour,
  root,
  onRoot,
  onlyInKey,
  onOnlyInKey,
  fretboardOpen,
  onFretboard,
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

  /** The root the browser is on: the one you picked, else the key's own. */
  const browseRoot = root ?? playedKey.root;

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

  /** The twelve roots as this key spells them, and which of them it owns. */
  const roots = useMemo(() => rootNames(playedKey), [playedKey]);
  const keyRoots = useMemo(
    () => new Set(chordsInKey(playedKey.root, playedKey.mode).map((c) => c.root)),
    [playedKey.root, playedKey.mode],
  );

  /** The browser's three drawers for the chosen root, hidden ones dropped. */
  const families = useMemo(() => {
    const out: { family: ChordFamily; chords: { chord: Chord; fits: boolean }[] }[] = [];
    for (const family of CHORD_FAMILIES) {
      const chords = qualitiesInFamily(family)
        .map((quality) => {
          const chord: Chord = { root: browseRoot, quality };
          return { chord, fits: fitsKey(chord, playedKey.root, playedKey.mode) };
        })
        // A group whose every card is hidden loses its heading too: a label
        // over nothing is a promise the page does not keep.
        .filter((entry) => !onlyInKey || entry.fits);
      if (chords.length) out.push({ family, chords });
    }
    return out;
  }, [browseRoot, playedKey.root, playedKey.mode, onlyInKey]);

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
  const board = scale
    ? { highlight: { pitchClasses: scale.pitchClasses, rootPitchClass: scale.root } }
    : null;

  /** One card. The same card on both pages, which is why Pin works on both. */
  const card = (
    chord: Chord,
    key: string,
    options: { degree?: string; inKeyMark?: boolean } = {},
  ) => {
    const shape = instrument ? basicShape(shapesFor(chord.root, chord.quality, { instrument })) : null;
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
          <ChordDiagram shape={shape} size="sm" selected={on} label={name} />
        ) : (
          <span className="jam-chord-card-name">{name}</span>
        )}
        {options.degree && <span className="jam-chord-card-degree">{options.degree}</span>}
      </button>
    );
  };

  return (
    <>
      {/* Two pages, one sheet. The control sits under the header rather than
          in the header because the title says which KEY you are in, and that
          is true of both pages. */}
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
                card({ root: chord.root, quality: chord.quality }, `${chord.degree}-${chord.root}`, {
                  degree: chord.degree,
                }),
              )}
            </div>
          )}
        </>
      ) : (
        <>
          {/* Twelve roots, spelled the way this key spells them, from C up.
              A keyboard you can point at rather than a row you have to read. */}
          <div className="jam-chord-roots" role="group" aria-label={t("jam.chords.rootLabel")}>
            {roots.map(({ pc, name }) => (
              <button
                key={pc}
                type="button"
                className={`jam-key${pc === browseRoot ? " active" : ""}`}
                aria-pressed={pc === browseRoot}
                onClick={() => onRoot(pc)}
              >
                {name}
                {keyRoots.has(pc) && (
                  <span
                    className="jam-chord-mark"
                    role="img"
                    aria-label={t("jam.chords.inKeyMark")}
                  />
                )}
              </button>
            ))}
          </div>

          {families.length === 0 ? (
            /* A root outside the key with the filter on. One quiet line, and
               not an empty page pretending the chords are gone. */
            <p className="jam-sheet-note">
              {t("jam.chords.nothingFits", {
                root: roots[browseRoot]?.name ?? "",
                key: keyLabel(playedKey, t),
              })}
            </p>
          ) : (
            families.map(({ family, chords }) => (
              <section key={family} className="jam-chord-family">
                <span className="stage-label">{t(`jam.chords.family${cap(family)}`)}</span>
                <div className="jam-chord-grid">
                  {chords.map(({ chord, fits }) =>
                    card(chord, `${family}-${chord.quality}`, { inKeyMark: fits }),
                  )}
                </div>
              </section>
            ))
          )}
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

      {/* Every way to play it — the same section for both pages, so a grip
          found in the browser pins to the playing screen exactly like one
          found in the key. It unfolds in place rather than appearing (A11). */}
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
                          ? { root: picked.root, quality: picked.quality, index: shapes.indexOf(picked) }
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
                    />
                    <span className="jam-chord-shape-label">
                      {t(`jam.chords.size${sizeKey(shape.size)}`)}
                    </span>
                    {/* Where it sits, for the shapes that have somewhere to sit.
                        An open shape is at the nut by definition, and a label
                        reading "open · open" says nothing twice. */}
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

      {instrument && (
        <section className="jam-chord-neck">
          <div className="jam-sheet-group-head">
            <button
              type="button"
              role="switch"
              aria-checked={fretboardOpen}
              className={`transport-switch jam-switch ${fretboardOpen ? "on" : ""}`}
              onClick={() => onFretboard(!fretboardOpen)}
            >
              <span className="transport-switch-track" aria-hidden="true" />
              {t("jam.fretboard.label")}
            </button>
            {fretboardOpen && scale && (
              <span className="jam-sheet-lead">
                {t("jam.fretboard.wholeNeck", {
                  scale: t(scale.labelKey, { defaultValue: scale.scale }),
                })}
              </span>
            )}
          </div>
          {fretboardOpen && board && (
            <Fretboard
              tuning={instrument === "bass" ? BASS_STANDARD_TUNING : GUITAR_STANDARD_TUNING}
              startFret={0}
              frets={17}
              highlight={board.highlight}
              size="large"
              className="jam-fretboard"
              ariaLabel={t("jam.fretboard.aria", { chord: keyRootName(playedKey) })}
            />
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
