/**
 * The typed recipe lines of one language (leg t2d), read by
 * `recipe.locales.test.ts`. Hand-written: what a player of that language types,
 * and the call each line must be. Never generated from the command tables.
 */
import type { ToolArgs } from "../../tools/types";

export type RecipeCases = {
  /** The locale code, as `commands/<code>.json` is named. */
  language: string;
  /** Lines that reach `make_exercise` with exactly these arguments (at least eight). */
  lines: ReadonlyArray<readonly [string, ToolArgs]>;
  /**
   * Lines that name a scale or chord but no key: they reach `make_exercise` with these
   * arguments and no `root`, and the tool asks which key (`why.make.root`). Optional.
   */
  keyless?: ReadonlyArray<readonly [string, ToolArgs]>;
  /**
   * Near-misses (at least six): a question, a scale only to see, a note name this
   * language writes otherwise, an article read as a note. Never a `make_exercise` call.
   */
  none: readonly string[];
  /** Lines with a never-list word in them: answered `yours`, never a call. Optional. */
  yours?: readonly string[];
};
