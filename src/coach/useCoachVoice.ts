/**
 * The window's one hold on the coach's voice and slot (`voice.ts`,
 * `coachSlot.ts`): installs them once, and tells the voice whether it is on
 * whether the engine is playing and whether the Session is the view. Effects on
 * three booleans: nothing here runs
 * per beat.
 */
import { useEffect } from "react";
import { ttsSpeak, ttsStop } from "../ipc";
import { IS_MOBILE } from "../platform";
import type { VoiceMode } from "../types";
import { installCoachSlot } from "./coachSlot";
import { installCoachVoice, setVoiceEnabled, setVoiceInSession, setVoiceSounding } from "./voice";

export function useCoachVoice(voiceMode: VoiceMode, sounding: boolean, inSession: boolean): void {
  useEffect(() => {
    // Read when called, not now: only a voice that is on ever reaches them.
    // No dim: a boundary line is never spoken over sound, and a dim still
    // held when Start cuts one would leave the count-in's first click quiet.
    const offVoice = installCoachVoice({
      speak: (text) => ttsSpeak(text, { dim: false }),
      stop: () => ttsStop(),
    });
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
  useEffect(() => {
    setVoiceInSession(inSession);
  }, [inSession]);
}
