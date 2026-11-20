/**
 * The bus, read from a component (DESIGN 9.2): the last event of one kind,
 * through `useSyncExternalStore`. Re-renders only when that kind is published
 * again, never for the others, and never for a beat.
 */
import { useSyncExternalStore } from "react";
import { lastEvent, subscribe, type CoachEventOf, type CoachEventType, type Delivered } from "./bus";

export function useCoachEvent<K extends CoachEventType>(type: K): Delivered<CoachEventOf<K>> | null {
  return useSyncExternalStore(
    subscribe,
    () => lastEvent(type),
    () => null,
  );
}
