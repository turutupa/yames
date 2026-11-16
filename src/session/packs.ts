/**
 * The bundled Path packs, as the app reads them.
 *
 * Plain JSON, generated and checked by `npm run paths` (`plans/PATHS_PIPELINE.md`)
 * and never written by a model. Each pack is a quarter of a megabyte, so each
 * is its own chunk and arrives when something asks for it; a player who only
 * ever opens the Metronome never downloads one.
 */
import { PATH_SCHEMA_VERSION } from "../paths/format";
import type { Exercise, PathDoc, Step } from "../paths/format";

const PACK_FILES = import.meta.glob("../paths/packs/*.json");

/**
 * The Paths a Session can run today.
 *
 * Alternate Picking needs nothing but timing. Blues needs the landing grader
 * and Sweep Picking's rungs are nearly all past the trust limit, so both are
 * listed as "later" rather than offered and then not graded.
 */
export const RUNNABLE_PATH_IDS: readonly string[] = ["alternate-picking"];

/** The Path a player with none yet starts on. */
export const FIRST_PATH_ID = "alternate-picking";

export function isRunnable(pathId: string): boolean {
  return RUNNABLE_PATH_IDS.includes(pathId);
}

/**
 * One pack, checked as far as a reader has to.
 *
 * `validate.ts` is the real gate and runs at authoring time. This only refuses
 * a version it does not know, which is the promise `format.ts` makes, and
 * anything that is not a pack at all.
 */
export function readPack(raw: unknown): PathDoc | null {
  if (typeof raw !== "object" || raw === null) return null;
  const doc = raw as Partial<PathDoc>;
  if (doc.schemaVersion !== PATH_SCHEMA_VERSION) return null;
  if (typeof doc.id !== "string" || !Array.isArray(doc.steps)) return null;
  return doc as PathDoc;
}

/** Every pack in the bundle, in a stable order, the unreadable ones left out. */
export async function loadAllPacks(): Promise<PathDoc[]> {
  const paths = Object.keys(PACK_FILES).sort();
  const docs = await Promise.all(
    paths.map(async (file) => {
      const module = (await PACK_FILES[file]()) as { default?: unknown };
      return readPack(module.default ?? module);
    }),
  );
  return docs.filter((doc): doc is PathDoc => doc !== null);
}

/** Find an Exercise by id, with the Step it belongs to. */
export function findExercise(
  path: PathDoc,
  exerciseId: string,
): { step: Step; exercise: Exercise } | null {
  for (const step of path.steps) {
    const exercise = step.exercises.find((e) => e.id === exerciseId);
    if (exercise) return { step, exercise };
  }
  return null;
}
