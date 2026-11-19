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
import { localizePack, readOverlay } from "../paths/strings";
import type { StringsOverlay } from "../paths/strings";

const PACK_FILES = import.meta.glob("../paths/packs/*.json");

/**
 * The words of each pack in other languages (`src/paths/strings.ts`), one chunk
 * per language and Path, fetched with the pack for the language on screen.
 * English is the pack itself, so `en/` (the translators' source) is not bundled.
 */
const OVERLAY_FILES = import.meta.glob(["../paths/packs/i18n/*/*.json", "!../paths/packs/i18n/en/*.json"]);

/**
 * The Paths a Session can run today.
 *
 * Shred, Alternate Picking and Sweep Picking are graded on timing, notes heard and
 * extra notes, and on right notes where the pitch pass can believe what it
 * heard (`src-tauri/src/score/pass.rs` `notes_status`); every graded Exercise of
 * all three passes as a Session Take when played right (`path_exercises.rs`). On
 * sweeps the notes usually ring into each other, so right notes are mostly
 * "not checked" there, and the result says so.
 *
 * Rhythm Foundations, Legato and Metal Rhythm (`plans/paths/NEW_PATHS.md`) are
 * graded the same way. In Legato an unheard hammer-on or pull-off costs nothing,
 * so its picked notes carry the grade; in Metal Rhythm a two-note power chord is
 * one attack, timed and counted and never pitch-checked.
 *
 * Blues and Classic Rock are Theory Paths taught through written licks,
 * phrases and arpeggios, graded the same way: timing, notes heard, extras and
 * right notes, every graded Exercise passing as a Session Take when played
 * right (`path_exercises.rs`). Their "your turn" Exercises, where the player
 * chooses the notes, are self-checked and not gradable, so the planner skips
 * them and the Path page shows them as not graded yet.
 */
export const RUNNABLE_PATH_IDS: readonly string[] = [
  "shred",
  "alternate-picking",
  "sweep-picking",
  "blues-pentatonics",
  "classic-rock",
  "rhythm-foundations",
  "legato",
  "metal-rhythm",
];

/** Why a Path is not runnable yet, as a `session.paths.*` key. */
const LATER_BECAUSE: Readonly<Record<string, string>> = {};

/** The sentence a "later" Path's page says, naming what it waits for when known. */
export function laterWhyKey(pathId: string): string {
  return LATER_BECAUSE[pathId] ?? "session.paths.laterWhy";
}

/**
 * The Path a player with none yet starts on: Shred, the base Mechanics Path for
 * the first testers (`plans/tasks/mvp/CONTENT.md`). Alternate Picking and Sweep
 * Picking stay as optional deep dives.
 */
export const FIRST_PATH_ID = "shred";

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

/**
 * The overlay for one Path in one language, or null: English, an unknown
 * language, or a file that does not read. Never throws; English is the answer.
 */
export async function loadOverlay(pathId: string, lng: string): Promise<StringsOverlay | null> {
  if (!lng || lng === "en") return null;
  const load = OVERLAY_FILES[`../paths/packs/i18n/${lng}/${pathId}.json`];
  if (!load) return null;
  try {
    const module = (await load()) as { default?: unknown };
    return readOverlay(module.default ?? module);
  } catch {
    return null;
  }
}

/**
 * Every pack in the bundle, in a stable order, the unreadable ones left out,
 * with its words in `lng` where they have been translated and English
 * elsewhere. Ids, notes and grading are the same in every language.
 */
export async function loadAllPacks(lng = "en"): Promise<PathDoc[]> {
  const paths = Object.keys(PACK_FILES).sort();
  const docs = await Promise.all(
    paths.map(async (file) => {
      const module = (await PACK_FILES[file]()) as { default?: unknown };
      const doc = readPack(module.default ?? module);
      if (!doc) return null;
      return localizePack(doc, await loadOverlay(doc.id, lng));
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
  // A Level's warm-ups live on the Level, not on a Step. They belong with the
  // Step of the Exercise they read their tempo from, or the Level's first.
  for (const level of path.levels ?? []) {
    const exercise = level.warmups.find((e) => e.id === exerciseId);
    if (!exercise) continue;
    const reference = exercise.warmup?.referenceExercise;
    const step =
      (reference ? path.steps.find((s) => s.exercises.some((e) => e.id === reference)) : undefined) ??
      path.steps.find((s) => level.stepIds.includes(s.id));
    return step ? { step, exercise } : null;
  }
  return null;
}
