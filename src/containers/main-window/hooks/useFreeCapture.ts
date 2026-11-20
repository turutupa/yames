/**
 * A jam or free play kept by the recording session (card #109): from the
 * moment it plays with the input listening until it stops, in segments,
 * ungraded, with the key and chord reading put in the last one when "Hear
 * what I play" is on. Nothing at all unless a session is on.
 */
import { useEffect, useRef, useState } from "react";
import { beginFreeCapture, captureNow, endFreeCapture, onCapture } from "../../../settings/recordingSession";
import type { TakeContext } from "../../../settings/recordingSession";

export function useFreeCapture({
  active,
  context,
  heard,
}: {
  active: boolean;
  context: TakeContext;
  heard: unknown;
}) {
  const [on, setOn] = useState(captureNow().active);
  useEffect(() => onCapture((s) => setOn(s.active)), []);
  const contextRef = useRef(context);
  contextRef.current = context;
  const heardRef = useRef(heard);
  heardRef.current = heard;
  // A new jam (another id or kind) is a new run.
  const key = `${context.kind}|${String(context.jamId ?? "")}|${String(context.exerciseId ?? "")}`;
  useEffect(() => {
    if (!active || !on) return;
    beginFreeCapture(contextRef.current);
    return () => endFreeCapture(heardRef.current ?? null);
  }, [active, on, key]);
}
