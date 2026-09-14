/**
 * The seven hints whose trigger lives in the app shell — `drill-first-open`,
 * `preset-suggest`, `widget-discover`, `midi-plugged` and the three Jam ones.
 *
 * MainWindow already holds every input they need (the active tab, the
 * metronome state, the MIDI hook), so gathering them here keeps MainWindow's
 * diff to one hook call plus one `<HintCard>`. The other two hints live where
 * their trigger does: `coach-ask` in the coach feed, `zen-first` in the Zen
 * overlay.
 *
 * At most one of these can be visible at a time — the runtime's per-session
 * slot guarantees it — so this returns a single hint or null. When several
 * trigger in the same commit the winner is decided by hook order, which is
 * the §5 listing order.
 */
import { useEffect, useRef, useState } from "react";
import { listPresets, storeLoad, storeSave } from "../../../ipc";
import type { Preset } from "../../../types";
import { useFirstTimeHint, useHintSession } from "./useFirstTimeHint";
import {
  recordSetup,
  setupKey,
  shouldHintDrillFirstOpen,
  shouldHintJamArrangement,
  shouldHintMidiPlugged,
  shouldHintWidgetDiscover,
  shouldSuggestPreset,
  type SetupRecord,
  type SetupSignature,
} from "./triggers";
import { HINT_SETUP_HISTORY_KEY, type HintId } from "./types";

/**
 * How long the metronome must run on one setup before it counts as
 * "practised". Without it, dragging the BPM slider would record every value
 * it passes through.
 */
export const SETUP_SETTLE_MS = 2000;

export type ActiveAppHint = {
  id: HintId;
  /** Present only for the hints that offer a button. */
  onAction?: () => void;
  markShown: () => void;
};

export type UseAppHintsArgs = {
  view: string;
  bpm: number;
  subdivision: number;
  beatGroups: number[];
  isPlaying: boolean;
  midiDevices: readonly unknown[];
  midiBindings: readonly unknown[];
  /** Opens the preset save bar (`preset-suggest`). */
  onSavePreset: () => void;
  /** Opens the floating widget (`widget-discover`). */
  onOpenWidget: () => void;
  /** Opens Settings → Hotkeys (`midi-plugged`). */
  onOpenHotkeys: () => void;
  /**
   * The three Jam hints, as the moments they apply (JAM_KILLER A4).
   *
   * `jamLoaded` is a band on the screen, which is when the two doors in the
   * context bar are worth naming. A sheet open while the band PLAYS is when
   * "everything here changes at the next bar" is news — open while stopped it
   * is a sentence about nothing. And `jamChorus` is the band getting on with
   * the tune, which is when it is worth saying that it is doing that on
   * purpose and where the switch is.
   */
  jamLoaded?: boolean;
  jamSetupOpen?: boolean;
  jamChordsOpen?: boolean;
  /** The chorus the form is on, or null while the band is not playing. */
  jamChorus?: number | null;
};

export function useAppHints(args: UseAppHintsArgs): ActiveAppHint | null {
  const { view, isPlaying, midiDevices, midiBindings } = args;
  const { session, widgetOpened } = useHintSession();
  const onMainScreen = view !== "settings";

  const suggestPreset = usePresetSuggestion({
    setup: { bpm: args.bpm, subdivision: args.subdivision, groups: args.beatGroups },
    isPlaying,
    session,
  });

  const drill = useFirstTimeHint("drill-first-open", shouldHintDrillFirstOpen(view));
  const preset = useFirstTimeHint(
    "preset-suggest",
    (view === "beat" || view === "drill") && suggestPreset,
  );
  const widget = useFirstTimeHint(
    "widget-discover",
    onMainScreen && shouldHintWidgetDiscover({ session, widgetOpened }),
  );
  const midi = useFirstTimeHint(
    "midi-plugged",
    onMainScreen &&
      shouldHintMidiPlugged({ devices: midiDevices, bindings: midiBindings }),
  );

  // The three Jam hints. Each fires on the Jam tab at the moment its sentence
  // is true and not before — and the last two need the band to be PLAYING,
  // because both of them are about what happens while it is.
  const onJam = view === "jam" && !!args.jamLoaded;
  const jamPlaying = onJam && isPlaying;
  const jamSheets = useFirstTimeHint("jam-sheets", onJam);
  const jamLive = useFirstTimeHint(
    "jam-live",
    jamPlaying && (!!args.jamSetupOpen || !!args.jamChordsOpen),
  );
  const jamArrangement = useFirstTimeHint(
    "jam-arrangement",
    jamPlaying && shouldHintJamArrangement({ chorus: args.jamChorus ?? null }),
  );

  if (drill.shouldShow) {
    return { id: "drill-first-open", markShown: drill.markShown };
  }
  if (preset.shouldShow) {
    return {
      id: "preset-suggest",
      onAction: args.onSavePreset,
      markShown: preset.markShown,
    };
  }
  if (widget.shouldShow) {
    return {
      id: "widget-discover",
      onAction: args.onOpenWidget,
      markShown: widget.markShown,
    };
  }
  if (midi.shouldShow) {
    return {
      id: "midi-plugged",
      onAction: args.onOpenHotkeys,
      markShown: midi.markShown,
    };
  }
  // Last of the nine, and in this order: whichever of them is about something
  // happening RIGHT NOW wins the session's one slot, because the other two
  // will be just as true the next time the band plays.
  if (jamArrangement.shouldShow) {
    return { id: "jam-arrangement", markShown: jamArrangement.markShown };
  }
  if (jamLive.shouldShow) return { id: "jam-live", markShown: jamLive.markShown };
  if (jamSheets.shouldShow) return { id: "jam-sheets", markShown: jamSheets.markShown };
  return null;
}

/**
 * `preset-suggest`'s input gathering: remember which setups were actually
 * practised (one record per session per setup, written after the metronome
 * has run on them for `SETUP_SETTLE_MS`) and ask the pure predicate whether
 * the current one has earned a preset.
 */
function usePresetSuggestion(args: {
  setup: SetupSignature;
  isPlaying: boolean;
  session: number;
}): boolean {
  const { isPlaying, session } = args;
  const [presets, setPresets] = useState<Preset[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [suggest, setSuggest] = useState(false);
  const historyRef = useRef<SetupRecord[]>([]);
  // The setup object is rebuilt every render; the effect keys off its stable
  // string identity and reads the latest value through this ref.
  const setupRef = useRef(args.setup);
  setupRef.current = args.setup;
  const key = setupKey(args.setup);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      listPresets().catch(() => [] as Preset[]),
      storeLoad<SetupRecord[]>(HINT_SETUP_HISTORY_KEY).catch(() => undefined),
    ]).then(([p, h]) => {
      if (cancelled) return;
      setPresets(Array.isArray(p) ? p : []);
      historyRef.current = Array.isArray(h) ? h : [];
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated || !isPlaying || session <= 0) return;
    const timer = setTimeout(() => {
      const current = setupRef.current;
      const next = recordSetup(historyRef.current, { ...current, session });
      if (next !== historyRef.current) {
        historyRef.current = next;
        void storeSave(HINT_SETUP_HISTORY_KEY, next).catch(() => {});
      }
      setSuggest(
        shouldSuggestPreset({ current, history: historyRef.current, presets }),
      );
    }, SETUP_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [hydrated, isPlaying, key, session, presets]);

  return suggest;
}
