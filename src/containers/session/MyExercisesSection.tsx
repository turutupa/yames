/**
 * The door to "My exercises" on the Paths screen: nothing at all while the
 * stored list is empty, and the list (`MyExercises.tsx`, with the generator and
 * the validator behind it) loaded only once there is one to show. Once shown it
 * stays mounted for the visit, so the Undo of the last one removed is still there.
 */
import { lazy, Suspense, useState } from "react";
import type { CSSProperties } from "react";
import { useMyExercises } from "../../session/myExercises";
import type { SessionRun } from "./hooks/useSessionRun";

const MyExercisesList = lazy(() => import("./MyExercises"));

export function MyExercisesSection({ session, style }: { session: SessionRun; style?: CSSProperties }) {
  const list = useMyExercises();
  const [shown, setShown] = useState(false);
  if (list.length > 0 && !shown) setShown(true);
  if (!shown && list.length === 0) return null;
  return (
    <Suspense fallback={null}>
      <MyExercisesList session={session} style={style} />
    </Suspense>
  );
}
