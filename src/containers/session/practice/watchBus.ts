/**
 * The Watch preview's key (the coordinator, 2026-11-18): the Session's hotkey
 * reaches the neck that is on screen through here, and the neck shows the
 * key's label on its button. A key press does nothing when no neck is
 * listening: the preview is the neck's own business and never the Session's,
 * so it can never start the input or a Take.
 */
type Listener = () => void;

const toggles = new Set<Listener>();
const labels = new Set<Listener>();
let keyLabel = "";

/** The hotkey: watch the order, or stop watching it. */
export function toggleWatch(): void {
  for (const listener of toggles) listener();
}

/** The neck on screen listens while it is mounted. Returns the unsubscribe. */
export function onToggleWatch(listener: Listener): () => void {
  toggles.add(listener);
  return () => toggles.delete(listener);
}

/** The key's label, as the player has it bound (`platformKey` applied). */
export function setWatchKeyLabel(label: string): void {
  if (label === keyLabel) return;
  keyLabel = label;
  for (const listener of labels) listener();
}

export function subscribeWatchKeyLabel(listener: Listener): () => void {
  labels.add(listener);
  return () => labels.delete(listener);
}

export function watchKeyLabel(): string {
  return keyLabel;
}
