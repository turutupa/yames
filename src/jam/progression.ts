/**
 * The changes, when they are yours rather than the form's.
 *
 * A form knows a progression — a twelve-bar blues in A is A7 A7 A7 A7 D7 D7 …
 * and `chordsForForm` in `./harmony` writes it out. That is the right answer
 * for the six starters and the wrong one for the tune you actually want to
 * play over, so a jam may carry a `progression`: one chord name per bar,
 * exactly as long as the form.
 *
 * ## The length rule
 *
 * `Jam.progression` is **exactly `formBars(jam.form)` entries long, always**.
 * Change the form and it is refitted here rather than left to disagree:
 *
 * - **Longer form** — the new bars are appended as `""`, which means *as the
 *   form*. Grow a twelve-bar blues into a sixteen-bar form and your twelve
 *   bars stay put while bars 13 to 16 come from the form's own progression.
 *   The alternative — repeating your changes round to fill the space — would
 *   invent four bars of music you never typed.
 * - **Shorter form** — the tail is dropped. The bars that are left are the
 *   ones you wrote for them, in order, which is the only truncation that does
 *   not move a chord to a bar it was not written for.
 * - **An entry that is `""` or unreadable** is *as the form*: that bar takes
 *   the form's own chord. So clearing a cell is writing `""`, not deleting an
 *   entry, and the array never grows a hole.
 * - **All bars `""`** is the same as no progression at all, and is written
 *   back as `undefined` so a jam that was edited and then cleared saves as
 *   small a record as one that never was.
 *
 * The names are stored in CONCERT pitch and read through `parseChordName`, so
 * how they were spelled going in ("A#m7" or "Bbm7") is forgotten and the
 * spelling that comes back out is the key's (`spellingForKey`). A transposing
 * player's Bb part is a display of the same concert changes, never a second
 * set of them.
 */
import { barsForForm, chordsForForm, parseChordName } from "./harmony";
import type { Chord, FormBar, Key, RomanBar } from "./harmony";
import type { Jam, JamForm } from "./types";
import { formBars } from "./forms";
import { resolveChanges } from "./changes";
import { grooveById } from "./grooves";

/** What a cell holds when it means "whatever the form plays here". */
export const AS_THE_FORM = "";

/**
 * `progression` made exactly `bars` long — see the length rule above.
 *
 * Returns a new array every time rather than the input when it already fits,
 * because the callers write it straight onto a record and a shared array is
 * how two jams end up editing one progression.
 */
export function fitProgression(
  progression: readonly string[] | undefined | null,
  bars: number,
): string[] {
  const length = Math.max(0, Math.trunc(bars));
  const out: string[] = [];
  for (let i = 0; i < length; i++) out.push(progression?.[i] ?? AS_THE_FORM);
  return out;
}

/** True when every bar says "as the form" — the same thing as no progression. */
export function isEmptyProgression(progression: readonly string[] | undefined | null): boolean {
  return !progression || progression.every((name) => !name.trim());
}

/**
 * The progression to write back after an edit, or `undefined` for "none".
 *
 * One place decides whether a record keeps the field, so a jam whose last
 * chord was just cleared stops carrying an array of empty strings.
 */
export function progressionEdit(
  progression: readonly string[] | undefined | null,
  bars: number,
): string[] | undefined {
  const fitted = fitProgression(progression, bars);
  return isEmptyProgression(fitted) ? undefined : fitted;
}

/** One bar of a progression changed, everything else left alone. */
export function withChordAt(
  progression: readonly string[] | undefined | null,
  bars: number,
  bar: number,
  name: string,
): string[] {
  const fitted = fitProgression(progression, bars);
  if (bar < 0 || bar >= fitted.length) return fitted;
  fitted[bar] = name;
  return fitted;
}

/**
 * The chords of one chorus, in concert pitch: yours where you wrote one, the
 * form's everywhere else.
 *
 * This is what `chordsForForm` was, plus the override — every reader of the
 * changes (the timeline, the NOW block, the strip, the shapes row, the bass)
 * goes through here instead, which is what makes "the progression replaces
 * `chordsForForm` when present" true in one place rather than in six.
 */
export function chordsForJam(
  form: JamForm,
  key: Key,
  progression?: readonly string[] | null,
  changes?: readonly RomanBar[] | null,
): Chord[] {
  const bars = formBars(form);
  const base = chordsForForm(form.kind, bars, key, changes);
  if (!progression || progression.length === 0) return base;
  return base.map((chord, index) => parseChordName(progression[index] ?? "") ?? chord);
}

/**
 * The chorus bar by bar, each bar with the one or two chords it plays.
 *
 * What the bass and the keys read, because a bar of rhythm changes or of the
 * jazz blues moves in its middle and a player follows it. A typed chord
 * replaces the WHOLE bar — you wrote one chord for it.
 */
export function formBarsForJam(
  form: JamForm,
  key: Key,
  progression?: readonly string[] | null,
  changes?: readonly RomanBar[] | null,
): FormBar[] {
  const base = barsForForm(form.kind, formBars(form), key, changes);
  if (!progression || progression.length === 0) return base;
  return base.map((bar, index) => {
    const typed = parseChordName(progression[index] ?? "");
    return typed ? { chords: [typed] } : bar;
  });
}

/** The same, straight off a record. */
export function jamChords(jam: Jam, key: Key): Chord[] {
  return chordsForJam(jam.form, key, jam.progression, jamChangesBars(jam, key));
}

/**
 * The named progression a jam plays in this key, as roman bars — its own
 * choice where it fits, the style's otherwise (`resolveChanges`).
 */
export function jamChangesBars(jam: Jam, key: Key): readonly RomanBar[] | null {
  const family = jam.customGroove ? null : (grooveById(jam.grooveId)?.family ?? null);
  return resolveChanges(jam.changes, jam.form.kind, key.mode, family)?.bars ?? null;
}
