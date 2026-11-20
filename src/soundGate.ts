/**
 * "Sound is about to start": called by `ipc.ts` the moment anything asks the
 * engine to play (`setPlaying(true)`, `togglePlayback`), before the request
 * leaves for Rust.
 *
 * The coach's voice listens here so that a Start pressed while it is talking
 * cuts it before the count-in's first click, not after the engine reports it
 * is playing (DESIGN section 8, Voice: "Start stops it"). A module of its own,
 * with no imports, so a test that mocks `ipc.ts` whole still has it.
 *
 * Listeners run synchronously and must be cheap: one of them sits in front of
 * every Start in the app. One that throws is logged and the others still run;
 * the caller never sees it.
 */
type Listener = () => void;

const listeners = new Set<Listener>();

/** Hear every "sound is about to start". Returns the unsubscribe. */
export function onSoundStarting(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Something is about to sound. `ipc.ts` calls this; nothing else should. */
export function soundStarting(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch (err) {
      console.warn("[yames] a sound-starting listener failed", err);
    }
  }
}
