/**
 * The window's one hold on the coach's voice and slot (`voice.ts`,
 * `coachSlot.ts`): installs them once, and tells the voice whether it is on
 * and whether the engine is playing. Effects on two booleans: nothing here runs
 * per beat.
 */
import { useEffect } from "react";
import { ttsSpeak, ttsStop } from "../ipc";
import { IS_MOBILE } from "../platform";
import type { VoiceMode } from "../types";
import { installCoachSlot } from "./coachSlot";
import { installCoachVoice, setVoiceEnabled, setVoiceSounding } from "./voice";

export function useCoachVoice(voiceMode: VoiceMode, sounding: boolean): void {
  useEffect(() => {
    // Read when called, not now: only a voice that is on ever reaches them.
    const offVoice = installCoachVoice({ speak: (text) => ttsSpeak(text), stop: () => ttsStop() });
    const offSlot = installCoachSlot();
    return () => {
      offSlot();
      offVoice();
    };
  }, []);
  // No voice on a phone: the speech engine is the desktop's.
  const on = voiceMode === "voice" && !IS_MOBILE;
  useEffect(() => {
    setVoiceEnabled(on);
  }, [on]);
  useEffect(() => {
    setVoiceSounding(sounding);
  }, [sounding]);
}
