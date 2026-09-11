import { useCallback, useRef, useState } from "react";

/**
 * Click the tempo number to type one.
 *
 * The editor holds a string rather than a number so a half-typed "1" is not
 * clamped to 20 while the user is still reaching for the "3", and commits on
 * blur or Enter. A value that does not parse leaves the tempo alone — the
 * engine never sees NaN.
 */
export function useBpmEditing(currentBpm: number, onCommit: (bpm: number) => void) {
  const [editingBpm, setEditingBpm] = useState(false);
  const [bpmEditValue, setBpmEditValue] = useState("");
  const bpmInputRef = useRef<HTMLInputElement>(null);

  const startBpmEdit = useCallback(() => {
    setBpmEditValue(String(currentBpm));
    setEditingBpm(true);
    // Selecting the old value is the input's own `onFocus` (MetronomeView).
    // It was a `setTimeout(…, 0)` here, which had to land after React had
    // committed the input and after `autoFocus` had focused it — an ordering
    // nothing guaranteed.
  }, [currentBpm]);

  const commitBpmEdit = useCallback(() => {
    const value = parseInt(bpmEditValue);
    if (!isNaN(value)) onCommit(value);
    setEditingBpm(false);
  }, [bpmEditValue, onCommit]);

  return {
    editingBpm,
    setEditingBpm,
    bpmEditValue,
    setBpmEditValue,
    bpmInputRef,
    startBpmEdit,
    commitBpmEdit,
  };
}
