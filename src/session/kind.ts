/**
 * Mechanics or Theory, from one place: the Path's own `kind`.
 *
 * An Exercise has no kind of its own, so it is its Path's. Today's plan, the
 * Take screen, the recap and the Path pages all ask here, so one Exercise can't
 * read MECHANICS on one screen and THEORY on the next (QA 2026-11-17 #9).
 */
import type { PathDoc, PathKind } from "../paths/format";

export function kindOfPath(paths: readonly Pick<PathDoc, "id" | "kind">[], pathId: string | undefined | null): PathKind {
  if (!pathId) return "mechanics";
  return paths.find((p) => p.id === pathId)?.kind ?? "mechanics";
}

/** The tag key for a plain Exercise step: `session.kind.mechanics` or `.theory`. */
export function kindTagKey(paths: readonly Pick<PathDoc, "id" | "kind">[], pathId: string | undefined | null): string {
  return `session.kind.${kindOfPath(paths, pathId)}`;
}
