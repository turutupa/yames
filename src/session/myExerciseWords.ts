/**
 * The words of a custom Exercise: its one line and its chord's symbol. Light on
 * purpose (types only from the generator), so Ask's preview of `make_exercise`
 * can say what it would make without loading the generator into the shell
 * (leg t2c). `myExerciseBuild.ts` re-exports `myExerciseLine` for the list.
 */
import type { TFunction } from "i18next";
import type { CustomSummary } from "../paths/custom";

/** A chord as its symbol: written the same in every language the app speaks. */
const CHORD_SUFFIX: Readonly<Record<string, string>> = {
  maj: "",
  min: "m",
  dim: "dim",
  aug: "+",
  "7": "7",
  maj7: "maj7",
  m7: "m7",
  m7b5: "m7♭5",
  dim7: "dim7",
};

/** "Am7", "C", "F#dim7": the arpeggio's chord as a symbol. */
export function chordSymbolOf(root: string, chord: string): string {
  return `${root}${CHORD_SUFFIX[chord] ?? chord}`;
}

/** The shape alone, in words ("A minor pentatonic, the box at fret 5"). */
export function myExerciseShapeWords(t: TFunction, s: Pick<CustomSummary, "shape" | "root" | "scale" | "chord" | "position"> & { string: number }): string {
  return t(`session.myExercises.shape.${s.shape}`, {
    root: s.root ?? "",
    scale: s.scale ? t(`scale.${s.scale}`) : "",
    chord: s.chord !== null && s.root ? chordSymbolOf(s.root, s.chord) : "",
    position: s.position,
    string: s.string,
  });
}

/** One line: what it is, where it starts and which way it goes, then its length. Never stored. */
export function myExerciseLine(t: TFunction, s: CustomSummary): string {
  const shape = myExerciseShapeWords(t, { ...s, string: s.firstNote.string });
  return t("session.myExercises.line", {
    shape,
    direction: t(`session.myExercises.direction.${s.direction}`),
    bars: t("session.myExercises.bars", { count: s.bars }),
  });
}
