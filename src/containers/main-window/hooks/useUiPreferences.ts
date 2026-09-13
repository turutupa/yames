import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { listJams, storeLoad, storeSave } from "../../../ipc";

/**
 * Owns the five MainWindow visual / UX preferences that the user can toggle
 * from Settings → Appearance & General:
 *
 *   - `buttonFlash`        — pulse the floating play button on each downbeat
 *   - `activeBorder`       — highlight the active section with a border
 *   - `drillAutoCollapse`  — auto-collapse the drill panel between segments
 *   - `viewTransitions`    — global tab-transition intensity
 *   - `animationStyle`     — preferred CSS animation family for transitions
 *   - `jamCues`            — speak the jam's count, sections and "your four"
 *
 * Each value is loaded from the Tauri store on mount; the *save* side is
 * handled inside the individual `<setting-row>` controls (they call
 * `storeSave` directly when the user changes the value), so this hook stays
 * read-on-mount only — with one exception, `seedJamCues` below, which is a
 * migration and writes exactly once per machine.
 *
 * Load failures are silent — if a key isn't present the React default wins.
 */

export type ViewTransitionLevel = "off" | "subtle" | "smooth" | "expressive";
export type AnimationStyle = "fade" | "scale" | "blur" | "slide" | "reveal";

const ANIMATION_STYLES: readonly AnimationStyle[] = [
  "fade",
  "scale",
  "blur",
  "slide",
  "reveal",
];

const VIEW_TRANSITION_LEVELS: readonly ViewTransitionLevel[] = [
  "off",
  "subtle",
  "smooth",
  "expressive",
];

export interface UiPreferences {
  buttonFlash: boolean;
  setButtonFlash: Dispatch<SetStateAction<boolean>>;
  activeBorder: boolean;
  setActiveBorder: Dispatch<SetStateAction<boolean>>;
  drillAutoCollapse: boolean;
  setDrillAutoCollapse: Dispatch<SetStateAction<boolean>>;
  viewTransitions: ViewTransitionLevel;
  setViewTransitions: Dispatch<SetStateAction<ViewTransitionLevel>>;
  animationStyle: AnimationStyle;
  setAnimationStyle: Dispatch<SetStateAction<AnimationStyle>>;
  /**
   * Spoken cues on the Jam tab (plans/JAM_UX_DECISIONS.md A4).
   *
   * A preference, not a property of a tune. It used to be a switch on every
   * jam's setup, which meant a player who wanted to be told "your four" had
   * to turn it on again for each jam they owned. It lives in
   * Settings -> Coach -> Voice now, with the other things that speak.
   */
  jamCues: boolean;
  setJamCues: Dispatch<SetStateAction<boolean>>;
}

/**
 * The one-time move of spoken cues from the jams to the preference.
 *
 * Cues used to be a switch on every jam's setup sheet; they are one
 * preference now (JAM_UX_DECISIONS A4), and `Jam.cues` is still on the record
 * of every jam that ever set it while nothing reads it any more. Without this
 * the change reads as a feature that was taken away: a player who had the
 * voice counting them in opens the new build to silence, with the switch that
 * used to say so gone from the screen it was on.
 *
 * So the first launch that finds no preference at all asks the jams: if any
 * of them had cues on, the preference starts on. It is written down straight
 * away, which is what makes it a MIGRATION and not a rule — deleting that old
 * jam later must not turn the voice off again, and turning the preference off
 * must stay off.
 *
 * Silent on failure, like every other load here: no jams, or no store, is a
 * preference left at its default.
 */
async function seedJamCues(setJamCues: Dispatch<SetStateAction<boolean>>): Promise<void> {
  try {
    const jams = await listJams();
    const wanted = (jams ?? []).some((jam) => jam.cues);
    if (wanted) setJamCues(true);
    await storeSave("jamCues", wanted);
  } catch {
    /* The default wins. */
  }
}

export function useUiPreferences(): UiPreferences {
  const [buttonFlash, setButtonFlash] = useState(true);
  const [activeBorder, setActiveBorder] = useState(true);
  const [drillAutoCollapse, setDrillAutoCollapse] = useState(true);
  const [viewTransitions, setViewTransitions] =
    useState<ViewTransitionLevel>("smooth");
  const [animationStyle, setAnimationStyle] =
    useState<AnimationStyle>("scale");
  const [jamCues, setJamCues] = useState(false);

  useEffect(() => {
    (async () => {
      const bf = await storeLoad<boolean>("buttonFlash");
      if (bf !== undefined) setButtonFlash(bf);

      const ab = await storeLoad<boolean>("activeBorder");
      if (ab !== undefined) setActiveBorder(ab);

      const dac = await storeLoad<boolean>("drillAutoCollapse");
      if (dac !== undefined) setDrillAutoCollapse(dac);

      const vt = await storeLoad<string | boolean>("viewTransitions");
      if (vt !== undefined) {
        // Backwards compatibility: convert old boolean format
        if (typeof vt === "boolean") {
          setViewTransitions(vt ? "smooth" : "off");
        } else if (
          VIEW_TRANSITION_LEVELS.includes(vt as ViewTransitionLevel)
        ) {
          setViewTransitions(vt as ViewTransitionLevel);
        }
      }

      const jc = await storeLoad<boolean>("jamCues");
      if (jc !== undefined) setJamCues(jc);
      else await seedJamCues(setJamCues);

      const as = await storeLoad<string>("animationStyle");
      if (as && ANIMATION_STYLES.includes(as as AnimationStyle)) {
        setAnimationStyle(as as AnimationStyle);
      }
    })();
  }, []);

  return {
    buttonFlash,
    setButtonFlash,
    activeBorder,
    setActiveBorder,
    drillAutoCollapse,
    setDrillAutoCollapse,
    viewTransitions,
    setViewTransitions,
    animationStyle,
    setAnimationStyle,
    jamCues,
    setJamCues,
  };
}
