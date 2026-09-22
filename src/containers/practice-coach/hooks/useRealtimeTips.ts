import { useRef, useCallback } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { BeatFeedback, FeedMessage, SavedSession } from "../../../types";
import { appendCoachUtterance, type Narrative } from "../../../coach/narrative";
import {
  BPM_BAND_WIDTH,
  bpmBandLowFor,
  detectRecurringIssues,
  detectStaminaPattern,
  summarizePreset,
  type StaminaPattern,
} from "../../../coach/presetAwareness";
import {
  pickTemplate,
  type ShuffleState,
  type Vocabulary,
} from "../../../coach/templates";
import { TEMPLATE_CATALOG } from "../../../coach/templateCatalog";
import { PRESET_CEILING_MAX_SESSIONS } from "../../../coach/gatekeeper";
import { coachDebug } from "../../../coach/debug";

export function useRealtimeTips(params: {
  shuffleStateRef: MutableRefObject<ShuffleState>;
  vocabRef: MutableRefObject<Vocabulary>;
  narrativeRef: MutableRefObject<Narrative | null>;
  speakAndRevealRef: MutableRefObject<(id: string, text: string, urgency?: "urgent" | "normal") => void>;
  setMessages: Dispatch<SetStateAction<FeedMessage[]>>;
  playBpmRef: MutableRefObject<number>;
  realtimeWindowRef: MutableRefObject<BeatFeedback[]>;
}) {
  const {
    shuffleStateRef,
    vocabRef,
    narrativeRef,
    speakAndRevealRef,
    setMessages,
    playBpmRef,
    realtimeWindowRef,
  } = params;

  // ── Stamina tip state ─────────────────────────────────────────────
  // `staminaPatternRef` holds the detectStaminaPattern() result loaded
  // during startSession. `staminaTipFiredRef` gates the once-per-session
  // rule — the tip is suppressed after the first fire.
  const staminaPatternRef = useRef<StaminaPattern | null>(null);
  const staminaTipFiredRef = useRef<boolean>(false);

  // ── Pace coaching tip state ───────────────────────────────────────
  // `paceCoachingRef` holds the BPM ceiling info loaded during
  // startSession (null when no ceiling with ≥ 4 sessions exists).
  // `paceCoachingFiredRef` enforces the once-per-session rule.
  const paceCoachingRef = useRef<{
    ceilingBpmLow: number;
    suggestedBpm: number;
    attemptCount: number;
  } | null>(null);
  const paceCoachingFiredRef = useRef<boolean>(false);

  // ── Grid-lost tip state ───────────────────────────────────────────
  // `gridLostFiredRef` gates the once-per-collapse rule. Resets when
  // the grid recovers (majority of the recent window climbs back above
  // the recovery threshold) so a second collapse in the same session
  // still surfaces a tip.
  // `gridEstablishedRef` ensures we only fire grid_lost if the player
  // previously had good grid correlation — you can't "lose" what you
  // never had (prevents false positives when notes are played before
  // the metronome starts, or right at session start).
  const gridLostFiredRef = useRef<boolean>(false);
  const gridEstablishedRef = useRef<boolean>(false);

  /**
   * Seed tip data from session history at the start of each session.
   * Resets all once-per-session / once-per-collapse gates.
   *
   * `history` is THIS preset's history, as deep as the store has it —
   * `queryHistory({ presetId })`, not the thirty-session slice
   * `getSessionHistory` returns. Both gates below count sessions at the
   * preset (five for stamina, four in one BPM band for the pace line) and
   * a slice shared with every other exercise in the app almost never
   * carries enough of any one of them to reach either number. Rows for
   * other presets are still filtered out here, so passing the wide slice
   * is wrong rather than merely wasteful.
   */
  const seed = useCallback((
    presetId: string | null | undefined,
    presetName: string | undefined,
    history: SavedSession[] | undefined,
  ) => {
    // Stamina pattern seed
    staminaTipFiredRef.current = false;
    staminaPatternRef.current = (presetId && history)
      ? detectStaminaPattern(history, presetId)
      : null;

    // Pace coaching seed. The four-attempt floor is the same line the
    // gatekeeper's `preset_ceiling_hit` stops at — up to three attempts
    // the coach only observes the ceiling, from the fourth it suggests
    // dropping a band. Exactly one of the two fires for a given band,
    // so the player never hears both. See `PRESET_CEILING_MAX_SESSIONS`.
    paceCoachingFiredRef.current = false;
    paceCoachingRef.current = (() => {
      if (!presetId || !history) return null;
      const summary = summarizePreset(presetId, presetName, history);
      const { bpmCeiling } = detectRecurringIssues(summary);
      if (!bpmCeiling || bpmCeiling.sessions <= PRESET_CEILING_MAX_SESSIONS) return null;
      return {
        ceilingBpmLow: bpmCeiling.bpmLow,
        suggestedBpm: Math.max(bpmCeiling.bpmLow - BPM_BAND_WIDTH, 40),
        attemptCount: bpmCeiling.sessions,
      };
    })();

    // Grid-lost gate reset
    gridLostFiredRef.current = false;
    gridEstablishedRef.current = false;
  }, []);

  /**
   * Evaluate and fire real-time per-beat tips when the gatekeeper
   * returned no event. Call this from the beat-feedback effect inside
   * the `if (!event) {}` branch, then `return`.
   */
  const checkNoEventTips = useCallback((opts: {
    now: number;
    startedAt: number | null;
    coachVerbosity: "less" | "default" | "more";
    voiceMode: string;
  }) => {
    const { now, startedAt, coachVerbosity, voiceMode } = opts;

    // ── Stamina tip (lower priority than realtime tips) ──────────────
    // Fire at most once per session, only when a stamina pattern
    // was detected and coachVerbosity is not "less". We wait until
    // the session has been running for at least half the pattern's
    // staminaMinutes so the tip doesn't land in the first seconds.
    const staminaPattern = staminaPatternRef.current;
    if (
      staminaPattern &&
      !staminaTipFiredRef.current &&
      coachVerbosity !== "less" &&
      startedAt != null &&
      (now - startedAt) >= (staminaPattern.staminaMinutes * 30_000)
    ) {
      const staminaTemplate = pickTemplate(TEMPLATE_CATALOG, shuffleStateRef.current, {
        vocab: vocabRef.current,
        scenario: "stamina",
        severity: "neutral",
        context: { staminaMinutes: staminaPattern.staminaMinutes },
      });
      if (staminaTemplate) {
        staminaTipFiredRef.current = true;
        coachDebug("stamina.fire", { staminaMinutes: staminaPattern.staminaMinutes });
        const tipId = crypto.randomUUID();
        const staminaMsg: FeedMessage = {
          id: tipId,
          type: "coach-tip",
          timestamp: now,
          content: staminaTemplate,
          // Spinner-until-audio only when voice is on.
          pending: voiceMode === "voice",
        };
        setMessages((prev) => [...prev, staminaMsg]);
        if (narrativeRef.current) {
          narrativeRef.current = appendCoachUtterance(narrativeRef.current, staminaTemplate);
        }
        // speakAndRevealRef handles voiceMode check internally —
        // non-voice calls reveal the message immediately.
        speakAndRevealRef.current(tipId, staminaTemplate, "normal");
      }
    }

    // ── Pace coaching tip ─────────────────────────────────────────────
    // Fire once per session when the user is playing at a BPM band
    // they've already attempted ≥ 4 times without sticking (ceiling).
    // Gated by coachVerbosity !== "less" (same as stamina).
    const paceCoaching = paceCoachingRef.current;
    if (
      paceCoaching &&
      !paceCoachingFiredRef.current &&
      coachVerbosity !== "less" &&
      bpmBandLowFor(playBpmRef.current) === paceCoaching.ceilingBpmLow
    ) {
      const paceTemplate = pickTemplate(TEMPLATE_CATALOG, shuffleStateRef.current, {
        vocab: vocabRef.current,
        scenario: "pace_coaching",
        severity: "neutral",
        context: {
          bpm: playBpmRef.current,
          suggestedBpm: paceCoaching.suggestedBpm,
          attemptCount: paceCoaching.attemptCount,
        },
      });
      if (paceTemplate) {
        paceCoachingFiredRef.current = true;
        coachDebug("pace_coaching.fire", { bpm: playBpmRef.current, ...paceCoaching });
        const tipId = crypto.randomUUID();
        const paceMsg: FeedMessage = {
          id: tipId,
          type: "coach-tip",
          timestamp: now,
          content: paceTemplate,
          pending: voiceMode === "voice",
        };
        setMessages((prev) => [...prev, paceMsg]);
        if (narrativeRef.current) {
          narrativeRef.current = appendCoachUtterance(narrativeRef.current, paceTemplate);
        }
        speakAndRevealRef.current(tipId, paceTemplate, "normal");
      }
    }

    // ── Grid-lost tip ─────────────────────────────────────────────────
    // Check the last 6 beats for grid-correlation collapse
    // (4 of 6 below 0.3). Fires once per collapse; re-arms when
    // the grid recovers (3 of 6 rise above 0.5 again).
    // Respects coachVerbosity — silent in "less" mode.
    //
    // Miss-count guard: subdivision playing (16ths, triplets) generates
    // between-beat onsets that the per-beat gridCorrelation treats as
    // off-grid, causing false positives even when the player is locked in.
    // We only fire when both correlation AND accuracy are low — i.e., the
    // player is also missing beats, not just playing subdivisions.
    if (coachVerbosity !== "less") {
      const recentWindow = realtimeWindowRef.current;
      if (recentWindow.length >= 6) {
        const recent6 = recentWindow.slice(-6);
        const lowCount = recent6.filter((b) => b.gridCorrelation < 0.3).length;
        const highCount = recent6.filter((b) => b.gridCorrelation > 0.5).length;
        const missOrSkipCount = recent6.filter(
          (b) => b.classification === "miss" || b.classification === "skipped",
        ).length;
        // Mark grid as established once a healthy majority appears.
        // Only after establishment can we detect a loss.
        if (highCount >= 3) {
          gridEstablishedRef.current = true;
        }
        if (gridLostFiredRef.current && highCount >= 3) {
          // Grid has recovered — re-arm so a second collapse still tips.
          gridLostFiredRef.current = false;
        } else if (!gridLostFiredRef.current && gridEstablishedRef.current && lowCount >= 4 && missOrSkipCount >= 3) {
          const gridTemplate = pickTemplate(TEMPLATE_CATALOG, shuffleStateRef.current, {
            vocab: vocabRef.current,
            scenario: "grid_lost",
            severity: "neutral",
            context: {},
          });
          if (gridTemplate) {
            gridLostFiredRef.current = true;
            coachDebug("grid_lost.fire", { lowCount, missOrSkipCount, recentCorr: recent6.map((b) => +b.gridCorrelation.toFixed(2)) });
            const tipId = crypto.randomUUID();
            const gridMsg: FeedMessage = {
              id: tipId,
              type: "coach-tip",
              timestamp: now,
              content: gridTemplate,
              pending: voiceMode === "voice",
            };
            setMessages((prev) => [...prev, gridMsg]);
            if (narrativeRef.current) {
              narrativeRef.current = appendCoachUtterance(narrativeRef.current, gridTemplate);
            }
            speakAndRevealRef.current(tipId, gridTemplate, "normal");
          }
        }
      }
    }
  }, [shuffleStateRef, vocabRef, narrativeRef, speakAndRevealRef, setMessages, playBpmRef, realtimeWindowRef]);

  return { seed, checkNoEventTips };
}
