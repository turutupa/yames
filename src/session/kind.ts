/**
 * Mechanics or Theory, from one place: the Path's own `kind`; and the Path's
 * category, which is what the screens call it.
 *
 * An Exercise has no kind of its own, so it is its Path's. Today's plan, the
 * Take screen, the recap and the Path pages all ask here, so one Exercise can't
 * read MECHANICS on one screen and THEORY on the next (QA 2026-11-17 #9).
 */
import { categoryOf } from "../paths/curriculum";
import type { PathCategory, PathDoc, PathKind } from "../paths/format";

export function kindOfPath(paths: readonly Pick<PathDoc, "id" | "kind">[], pathId: string | undefined | null): PathKind {
  if (!pathId) return "mechanics";
  return paths.find((p) => p.id === pathId)?.kind ?? "mechanics";
}

/**
 * What a Take's Path is about, for words: its category (Foundations, Harmony,
 * Technique, Styles), the same one the Paths screen groups it under. The kind
 * above still picks the colour and the theory screens; it is not a name the
 * player sees (card #78: Triads read STYLES, First Chords TECHNIQUE).
 */
export function categoryOfPath(
  paths: readonly Pick<PathDoc, "id" | "kind" | "category">[],
  pathId: string | undefined | null,
): PathCategory {
  const path = pathId ? paths.find((p) => p.id === pathId) : undefined;
  return path ? categoryOf(path) : "technique";
}

/** The short label key for a Take's kicker: `session.category.harmony` and so on. */
export function categoryTagKey(
  paths: readonly Pick<PathDoc, "id" | "kind" | "category">[],
  pathId: string | undefined | null,
): string {
  return `session.category.${categoryOfPath(paths, pathId)}`;
}
