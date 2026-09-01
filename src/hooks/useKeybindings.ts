import { useCallback, useEffect, useRef, useState } from "react";
import { storeLoad, storeSave } from "../ipc";
import { HOTKEYS, eventToCombo } from "../hotkeys";
import type {
  BindingTarget,
  PendingKeyConflict,
} from "../containers/settings/KeybindingModals";

type Bindings = Record<string, string>;

/**
 * Owns all keybinding state for MainWindow: per-action keyboard combos
 * (local + global) and gamepad/footswitch bindings, plus the capture-modal
 * state (which binding is being edited, pending keys, pending conflicts).
 *
 * Side effects:
 *  - Restores bindings from the persistent store on mount, merging in any
 *    new default hotkeys that were added in this version.
 *  - Persists each binding map back to the store on every change (but only
 *    after the initial restore completes, so we don't wipe stored values).
 *  - Registers a `keydown` listener while a binding is being captured.
 *
 * Returned shape mirrors what MainWindow used to manage inline.
 */
export function useKeybindings() {
  const [keyBindings, setKeyBindings] = useState<Bindings>(() =>
    Object.fromEntries(HOTKEYS.map((hk) => [hk.id, hk.key])),
  );
  const [footBindings, setFootBindings] = useState<Bindings>({});
  const [globalBindings, setGlobalBindings] = useState<Bindings>(() =>
    Object.fromEntries(
      HOTKEYS.filter((hk) => hk.globalAllowed).map((hk) => [
        hk.id,
        hk.globalKey || hk.key,
      ]),
    ),
  );

  const [bindingFor, setBindingFor] = useState<BindingTarget | null>(null);
  const [pendingKeys, setPendingKeys] = useState<string>("");
  const [pendingKeyConflict, setPendingKeyConflict] =
    useState<PendingKeyConflict | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const bindingsLoaded = useRef(false);

  // Persist whenever bindings change — but only after initial restore.
  useEffect(() => {
    if (bindingsLoaded.current) storeSave("keyBindings", keyBindings);
  }, [keyBindings]);
  useEffect(() => {
    if (bindingsLoaded.current) storeSave("globalBindings", globalBindings);
  }, [globalBindings]);
  useEffect(() => {
    if (bindingsLoaded.current) storeSave("footBindings", footBindings);
  }, [footBindings]);

  // Restore bindings from store on mount, merging with defaults.
  useEffect(() => {
    const defaults = Object.fromEntries(HOTKEYS.map((hk) => [hk.id, hk.key]));
    const globalDefaults = Object.fromEntries(
      HOTKEYS.filter((hk) => hk.globalAllowed).map((hk) => [
        hk.id,
        hk.globalKey || hk.key,
      ]),
    );
    (async () => {
      const kb = await storeLoad<Bindings>("keyBindings");
      if (kb && typeof kb === "object") setKeyBindings({ ...defaults, ...kb });
      const gb = await storeLoad<Bindings>("globalBindings");
      if (gb && typeof gb === "object")
        setGlobalBindings({ ...globalDefaults, ...gb });
      const fb = await storeLoad<Bindings>("footBindings");
      if (fb && typeof fb === "object") setFootBindings(fb);
      bindingsLoaded.current = true;
    })();
  }, []);

  const resetAllBindings = useCallback(() => {
    setKeyBindings(Object.fromEntries(HOTKEYS.map((hk) => [hk.id, hk.key])));
    setGlobalBindings(
      Object.fromEntries(
        HOTKEYS.filter((hk) => hk.globalAllowed).map((hk) => [
          hk.id,
          hk.globalKey || hk.key,
        ]),
      ),
    );
    setFootBindings({});
    setShowResetConfirm(false);
  }, []);

  const handleBinding = useCallback(
    (e: KeyboardEvent) => {
      if (!bindingFor) return;
      e.preventDefault();
      if (e.key === "Escape") {
        setBindingFor(null);
        setPendingKeys("");
        return;
      }
      const combo = eventToCombo(e);
      if (combo) {
        setPendingKeys(combo);
      }
      if (combo && !["Meta", "Control", "Alt", "Shift"].includes(e.key)) {
        const source = bindingFor.type === "key" ? keyBindings : globalBindings;
        const conflictEntry = Object.entries(source).find(
          ([action, bound]) => bound === combo && action !== bindingFor.id,
        );
        if (conflictEntry) {
          setPendingKeyConflict({
            combo,
            conflictAction: conflictEntry[0],
            targetAction: bindingFor.id,
            type: bindingFor.type,
          });
          return; // wait for confirmation
        }
        if (bindingFor.type === "key") {
          setKeyBindings((prev) => ({ ...prev, [bindingFor.id]: combo }));
        } else if (bindingFor.type === "global") {
          setGlobalBindings((prev) => ({ ...prev, [bindingFor.id]: combo }));
        }
        setBindingFor(null);
        setPendingKeys("");
      }
    },
    [bindingFor, keyBindings, globalBindings],
  );

  const handleResetBinding = useCallback(() => {
    if (!bindingFor) return;
    const hk = HOTKEYS.find((h) => h.id === bindingFor.id);
    if (bindingFor.type === "key") {
      setKeyBindings((prev) => ({ ...prev, [bindingFor.id]: hk?.key || "" }));
    } else if (bindingFor.type === "global") {
      setGlobalBindings((prev) => ({
        ...prev,
        [bindingFor.id]: hk?.globalKey || hk?.key || "",
      }));
    }
    setBindingFor(null);
    setPendingKeys("");
  }, [bindingFor]);

  const handleRemoveBinding = useCallback(() => {
    if (!bindingFor) return;
    if (bindingFor.type === "key") {
      setKeyBindings((prev) => ({ ...prev, [bindingFor.id]: "" }));
    } else if (bindingFor.type === "global") {
      setGlobalBindings((prev) => ({ ...prev, [bindingFor.id]: "" }));
    }
    setBindingFor(null);
    setPendingKeys("");
  }, [bindingFor]);

  const acceptKeyConflict = useCallback(() => {
    if (!pendingKeyConflict) return;
    const { combo, conflictAction, targetAction, type } = pendingKeyConflict;
    if (type === "key") {
      setKeyBindings((prev) => ({
        ...prev,
        [conflictAction]: "",
        [targetAction]: combo,
      }));
    } else {
      setGlobalBindings((prev) => ({
        ...prev,
        [conflictAction]: "",
        [targetAction]: combo,
      }));
    }
    setPendingKeyConflict(null);
    setBindingFor(null);
    setPendingKeys("");
  }, [pendingKeyConflict]);

  const rejectKeyConflict = useCallback(() => {
    setPendingKeyConflict(null);
    setPendingKeys("");
  }, []);

  // Register the keydown listener while a binding is being captured.
  useEffect(() => {
    if (!bindingFor || pendingKeyConflict) return;
    document.addEventListener("keydown", handleBinding);
    return () => document.removeEventListener("keydown", handleBinding);
  }, [bindingFor, handleBinding, pendingKeyConflict]);

  return {
    keyBindings,
    setKeyBindings,
    footBindings,
    setFootBindings,
    globalBindings,
    setGlobalBindings,
    bindingFor,
    setBindingFor,
    pendingKeys,
    setPendingKeys,
    pendingKeyConflict,
    setPendingKeyConflict,
    showResetConfirm,
    setShowResetConfirm,
    resetAllBindings,
    handleResetBinding,
    handleRemoveBinding,
    acceptKeyConflict,
    rejectKeyConflict,
  };
}

export type UseKeybindingsReturn = ReturnType<typeof useKeybindings>;
