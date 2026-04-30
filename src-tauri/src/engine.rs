use crate::state::SharedState;
use rodio::{OutputStream, Sink, Source};
use std::io::Cursor;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

// Embedded click sounds — 4 kits
const CLICK_HIGH: &[u8] = include_bytes!("../sounds/click_high.wav");
const CLICK_LOW: &[u8] = include_bytes!("../sounds/click_low.wav");
const WOOD_HIGH: &[u8] = include_bytes!("../sounds/wood_high.wav");
const WOOD_LOW: &[u8] = include_bytes!("../sounds/wood_low.wav");
const BEEP_HIGH: &[u8] = include_bytes!("../sounds/beep_high.wav");
const BEEP_LOW: &[u8] = include_bytes!("../sounds/beep_low.wav");
const DRUM_HIGH: &[u8] = include_bytes!("../sounds/drum_high.wav");
const DRUM_LOW: &[u8] = include_bytes!("../sounds/drum_low.wav");

fn get_sounds(sound_type: &str) -> (&'static [u8], &'static [u8]) {
    match sound_type {
        "wood" => (WOOD_HIGH, WOOD_LOW),
        "beep" => (BEEP_HIGH, BEEP_LOW),
        "drum" => (DRUM_HIGH, DRUM_LOW),
        _ => (CLICK_HIGH, CLICK_LOW),
    }
}

/// Advance the speed ramp by one step. Returns (new_bpm, new_direction, is_done).
fn advance_ramp(
    current_bpm: u16,
    direction: &str,
    start_bpm: u16,
    target_bpm: u16,
    increment: u16,
    decrement: u16,
    mode: &str,
    cyclic: bool,
) -> (u16, String, bool) {
    match mode {
        "zigzag" => {
            // Zigzag alternates every step: +increment, -decrement, +increment, -decrement...
            // Net gain per pair = increment - decrement, so it crawls toward target.
            if direction == "up" {
                let new_bpm = current_bpm.saturating_add(increment).min(300);
                if new_bpm >= target_bpm {
                    (target_bpm, "up".to_string(), true)
                } else {
                    // Next step will go down
                    (new_bpm, "down".to_string(), false)
                }
            } else {
                // Go down by decrement, but never below start_bpm
                let new_bpm = current_bpm.saturating_sub(decrement).max(start_bpm);
                // Next step will go up
                (new_bpm, "up".to_string(), false)
            }
        }
        _ => {
            // Linear: go up in increments
            if direction == "up" {
                let new_bpm = current_bpm.saturating_add(increment).min(300);
                if new_bpm >= target_bpm {
                    if cyclic {
                        // Cyclic: reached target, now come back down
                        (target_bpm, "down".to_string(), false)
                    } else {
                        (target_bpm, "up".to_string(), true)
                    }
                } else {
                    (new_bpm, "up".to_string(), false)
                }
            } else {
                // Cyclic coming back down
                let new_bpm = current_bpm.saturating_sub(increment).max(20);
                if new_bpm <= start_bpm {
                    // Completed one round-trip cycle
                    (start_bpm, "up".to_string(), false)
                } else {
                    (new_bpm, "down".to_string(), false)
                }
            }
        }
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct BeatEvent {
    pub beat: u32,
    pub subdivision: u32,
    #[serde(rename = "isDownbeat")]
    pub is_downbeat: bool,
}

pub struct MetronomeEngine {
    alive: Arc<AtomicBool>,
    playing: Arc<AtomicBool>,
    thread_handle: Option<thread::JoinHandle<()>>,
}

impl MetronomeEngine {
    pub fn new() -> Self {
        Self {
            alive: Arc::new(AtomicBool::new(false)),
            playing: Arc::new(AtomicBool::new(false)),
            thread_handle: None,
        }
    }

    /// Ensure the audio thread is running (opens audio device once).
    fn ensure_thread(&mut self, state: SharedState, app_handle: AppHandle) {
        if self.alive.load(Ordering::SeqCst) {
            return;
        }

        self.alive.store(true, Ordering::SeqCst);
        let alive = self.alive.clone();
        let playing = self.playing.clone();

        let handle = thread::spawn(move || {
            let (_stream, stream_handle) = match OutputStream::try_default() {
                Ok(s) => s,
                Err(e) => {
                    eprintln!("Failed to open audio stream: {}", e);
                    return;
                }
            };

            let sink = Sink::try_new(&stream_handle).unwrap();

            let mut beat_count: u32 = 0;
            let mut sub_count: u32 = 0;
            let mut next_tick = Instant::now();
            let mut measure_beat: u32 = 0; // track beats within current measure for ramp
            let mut pending_ramp_advance = false; // defer bar advance to start of next bar

            while alive.load(Ordering::SeqCst) {
                // If not playing, idle-wait (low CPU) until play or shutdown
                if !playing.load(Ordering::SeqCst) {
                    thread::sleep(Duration::from_millis(10));
                    // Reset timing so first beat is instant when play resumes
                    next_tick = Instant::now();
                    beat_count = 0;
                    sub_count = 0;
                    measure_beat = 0;
                    continue;
                }

                let (bpm, subdivision, volume, sound_type, time_sig, ramp_active, ramp_beats_per_bar) = {
                    let s = state.lock().unwrap();
                    (s.bpm, s.subdivision, s.volume, s.sound_type.clone(), s.time_signature,
                     s.speed_ramp.active, s.speed_ramp.beats_per_bar)
                };

                // When ramp is active: force quarter notes only (no subdivisions)
                let subdivision = if ramp_active { 1 } else { subdivision };

                sink.set_volume(volume);

                let beat_duration_ms = 60_000.0 / bpm as f64;
                let ticks_per_beat = subdivision as f64;
                let tick_duration = Duration::from_secs_f64(beat_duration_ms / ticks_per_beat / 1000.0);

                // Wait until next tick
                let now = Instant::now();
                if next_tick > now {
                    let sleep_until = now + (next_tick - now).saturating_sub(Duration::from_millis(1));
                    while Instant::now() < sleep_until {
                        if !playing.load(Ordering::SeqCst) || !alive.load(Ordering::SeqCst) {
                            continue; // Will be caught by outer loop
                        }
                        let remaining = sleep_until.saturating_duration_since(Instant::now());
                        thread::sleep(remaining.min(Duration::from_millis(5)));
                    }
                    while Instant::now() < next_tick {
                        if !playing.load(Ordering::SeqCst) || !alive.load(Ordering::SeqCst) {
                            break;
                        }
                        std::hint::spin_loop();
                    }
                    // Re-check after waiting
                    if !playing.load(Ordering::SeqCst) {
                        continue;
                    }
                }

                // Play click — three levels:
                //   1. Accent beat (first beat of measure): high sound, full volume
                //   2. Regular beat (downbeat of subdivision group): low sound, normal volume
                //   3. Subdivision tick: low sound, quiet
                let is_downbeat = sub_count == 0;

                // Process pending ramp advance at the START of the new bar's first beat
                if is_downbeat && pending_ramp_advance {
                    pending_ramp_advance = false;
                    let should_advance = {
                        let s = state.lock().unwrap();
                        s.speed_ramp.active && !s.speed_ramp.completed
                    };
                    if should_advance {
                        let mut s = state.lock().unwrap();
                        s.speed_ramp.bars_in_step += 1;
                        if s.speed_ramp.bars_in_step >= s.speed_ramp.bars_per_step {
                            s.speed_ramp.bars_in_step = 0;
                            // Try to advance to next step
                            let (new_bpm, new_dir, done) = advance_ramp(
                                s.speed_ramp.current_bpm,
                                &s.speed_ramp.direction,
                                s.speed_ramp.start_bpm,
                                s.speed_ramp.target_bpm,
                                s.speed_ramp.increment,
                                s.speed_ramp.decrement,
                                &s.speed_ramp.mode,
                                s.speed_ramp.cyclic,
                            );
                            if done && new_bpm == s.speed_ramp.current_bpm {
                                // Already at target, can't advance further — truly done
                                s.speed_ramp.completed = true;
                                s.speed_ramp.active = false;
                                s.is_playing = false;
                                let state_clone = s.clone();
                                let ramp_clone = s.speed_ramp.clone();
                                drop(s);
                                playing.store(false, Ordering::SeqCst);
                                let _ = app_handle.emit("ramp-step", &ramp_clone);
                                let _ = app_handle.emit("state-changed", &state_clone);
                            } else {
                                // Advance to next step (even if done — play the target step first)
                                s.speed_ramp.current_step += 1;
                                s.speed_ramp.current_bpm = new_bpm;
                                s.speed_ramp.direction = new_dir;
                                s.bpm = new_bpm;
                                let ramp_clone = s.speed_ramp.clone();
                                let state_clone = s.clone();
                                drop(s);
                                let _ = app_handle.emit("ramp-step", &ramp_clone);
                                let _ = app_handle.emit("state-changed", &state_clone);
                            }
                        } else {
                            let state_clone = s.clone();
                            drop(s);
                            let _ = app_handle.emit("state-changed", &state_clone);
                        }
                    }
                }

                let use_accent = if ramp_active {
                    // During ramp: accent beat 1 of each beatsPerBar group
                    let bpb = if ramp_beats_per_bar >= 2 { ramp_beats_per_bar as u32 } else { 4 };
                    is_downbeat && (beat_count % bpb) == 0
                } else {
                    match time_sig {
                        0 => false,
                        1 => is_downbeat,
                        _ => {
                            let beats_per_measure = time_sig as u32;
                            is_downbeat && (beat_count % beats_per_measure) == 0
                        }
                    }
                };
                let (high_sound, low_sound) = get_sounds(&sound_type);
                let (sound_data, amp) = if use_accent {
                    (high_sound, 1.0_f32)    // Accent: high sound, full volume
                } else if is_downbeat {
                    (low_sound, 0.75_f32)    // Regular beat: low sound, normal
                } else {
                    (low_sound, 0.35_f32)    // Subdivision tick: low sound, quiet
                };
                let cursor = Cursor::new(sound_data);
                if let Ok(source) = rodio::Decoder::new(cursor) {
                    sink.append(source.amplify(amp));
                }

                let event = BeatEvent {
                    beat: beat_count,
                    subdivision: sub_count,
                    is_downbeat,
                };
                let _ = app_handle.emit("beat", &event);

                sub_count += 1;
                if sub_count >= subdivision as u32 {
                    sub_count = 0;
                    beat_count += 1;

                    // A full beat (including all subdivisions) just completed.
                    // Count measures to know when a bar finishes.
                    measure_beat += 1;
                    let beats_per_measure = {
                        let s = state.lock().unwrap();
                        if s.speed_ramp.active {
                            let bpb = s.speed_ramp.beats_per_bar;
                            if bpb >= 2 { bpb as u32 } else { 4 }
                        } else {
                            let ts = s.time_signature;
                            if ts >= 2 { ts as u32 } else { 4 }
                        }
                    };
                    if measure_beat >= beats_per_measure {
                        measure_beat = 0;
                        // Bar completed — defer the visual advance to the start of the next bar
                        pending_ramp_advance = true;
                    }
                }

                next_tick += tick_duration;
            }
        });

        self.thread_handle = Some(handle);
    }

    pub fn start(&mut self, state: SharedState, app_handle: AppHandle) {
        self.ensure_thread(state, app_handle);
        self.playing.store(true, Ordering::SeqCst);
    }

    pub fn stop(&mut self) {
        self.playing.store(false, Ordering::SeqCst);
    }

    /// Fully stop playback and tear down the audio thread.
    pub fn shutdown(&mut self) {
        self.playing.store(false, Ordering::SeqCst);
        self.alive.store(false, Ordering::SeqCst);
        if let Some(handle) = self.thread_handle.take() {
            let _ = handle.join();
        }
    }

    pub fn is_running(&self) -> bool {
        self.playing.load(Ordering::SeqCst)
    }
}

impl Drop for MetronomeEngine {
    fn drop(&mut self) {
        self.playing.store(false, Ordering::SeqCst);
        self.alive.store(false, Ordering::SeqCst);
        if let Some(handle) = self.thread_handle.take() {
            let _ = handle.join();
        }
    }
}
