//! Parking the Android output stream while the app is away and silent.
//!
//! An open low-latency AAudio stream keeps the audio path awake and the
//! callback rendering silence for as long as it runs. A metronome left on
//! Home with nothing playing has no reason to, so the engine's EVENT LOOP
//! (never the output callback, which is untouched by all of this) pauses the
//! stream while the app is in the background and nothing needs it, and
//! starts it again the moment something does.
//!
//! The decisions are pure functions here so they can be tested on any host;
//! the state they read and the Android plumbing are below them, and only the
//! Android build ever acts on them (`engine.rs`'s event loop,
//! `android_route.rs`).
//!
//! # What "nothing needs it" means
//!
//! Everything the callback can make audible, or depends on it running:
//!
//! * the transport (`playing`): the click, and a song or a jam, both of which
//!   only advance while it is up and lower it when they end;
//! * a take playing back, which sounds with the transport stopped and whose
//!   end is only noticed by the callback running off it;
//! * a take recording, whose clock IS the output callback even with the band
//!   stopped (the callback writes the silence into the ring);
//! * a line of the coach's speech in flight, which also sounds with the
//!   transport stopped and whose end the speaking thread waits for.
//!
//! # Recovery
//!
//! A stream that will not start again is never left for "the next Play" to
//! find: the event loop marks it dead and hands it to `android_route`, which
//! reopens a dead stream whether or not the transport is running (the old
//! rule, "only while playing", left a stopped app with a dead stream and a
//! Play button over silence). The dead flag is per stream, fresh with each
//! spawn like `alive`, so a second report about a stream that has already
//! been replaced finds the new stream's flag down and reopens nothing.

// Only the Android build acts on these; everywhere else they are tests.
#![cfg_attr(not(target_os = "android"), allow(dead_code))]

/// What the event loop knows, once a pass, about who needs the output.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub(crate) struct OutputNeeds {
    pub app_in_background: bool,
    pub transport_playing: bool,
    pub take_playing_back: bool,
    pub take_recording: bool,
    pub speech_in_flight: bool,
}

/// Park only when the app is away AND nothing at all needs the callback.
pub(crate) fn should_park(n: OutputNeeds) -> bool {
    n.app_in_background
        && !n.transport_playing
        && !n.take_playing_back
        && !n.take_recording
        && !n.speech_in_flight
}

/// What the event loop does with the stream this pass.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum ParkStep {
    /// The stream is where it should be.
    Nothing,
    /// Running and nothing needs it: pause.
    Pause,
    /// Paused and something needs it: start.
    Resume,
}

/// `parked`: this loop paused the stream. `dead`: the stream is gone (closed
/// by the system, or refused to start) and is `android_route`'s to replace —
/// nothing is asked of a dead stream, so a refusal is reported once and not
/// every pass.
pub(crate) fn park_step(parked: bool, want_parked: bool, dead: bool) -> ParkStep {
    if dead || parked == want_parked {
        ParkStep::Nothing
    } else if want_parked {
        ParkStep::Pause
    } else {
        ParkStep::Resume
    }
}

/// What follows a `start` on a paused stream.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum ResumeOutcome {
    /// Running again.
    Resumed,
    /// It would not start: mark it dead and ask `android_route` to reopen it.
    Reopen,
    /// It would not start because the system already closed it, and the
    /// error callback that said so already asked for the reopen. Asking
    /// again is the double reopen.
    AlreadyReported,
}

pub(crate) fn resume_outcome(started: bool, closed_by_system: bool) -> ResumeOutcome {
    if started {
        ResumeOutcome::Resumed
    } else if closed_by_system {
        ResumeOutcome::AlreadyReported
    } else {
        ResumeOutcome::Reopen
    }
}

/// `android_route`'s rule for a lost output: reopen when there is an audio
/// thread (`alive`) whose stream is dead, whether or not anything is playing.
/// No thread means the next start opens a fresh one anyway; a stream that is
/// not dead is a report about one that has already been replaced.
pub(crate) fn route_should_reopen(alive: bool, output_dead: bool) -> bool {
    alive && output_dead
}

/// `MetronomeEngine::start`'s rule: a stream that is dead under a live
/// thread is handed to `android_route` again (deduplicated by the dead flag,
/// so this never doubles a reopen already on its way).
pub(crate) fn start_must_report_dead(alive: bool, output_dead: bool) -> bool {
    alive && output_dead
}

#[cfg(target_os = "android")]
mod android {
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Mutex;
    use std::thread::Thread;

    /// The activity is off the screen (`onStop`), as the yames-mobile
    /// plugin's `app_visible` event reports it to the frontend and the
    /// frontend reports it here (`set_app_in_background`).
    static APP_IN_BACKGROUND: AtomicBool = AtomicBool::new(false);

    /// The live event loop, so a resume trigger on any thread can wake it
    /// rather than wait out its 50 ms backstop. Never touched by the output
    /// callback.
    static EVENT_LOOP: Mutex<Option<Thread>> = Mutex::new(None);

    pub(crate) fn set_app_in_background(hidden: bool) {
        APP_IN_BACKGROUND.store(hidden, Ordering::SeqCst);
        wake();
    }

    pub(crate) fn app_in_background() -> bool {
        APP_IN_BACKGROUND.load(Ordering::SeqCst)
    }

    /// From the event loop, once, as it starts.
    pub(crate) fn register_event_loop() {
        let me = std::thread::current();
        match EVENT_LOOP.lock() {
            Ok(mut slot) => *slot = Some(me),
            Err(e) => *e.into_inner() = Some(me),
        }
    }

    /// Something may need the output now: let the loop look.
    pub(crate) fn wake() {
        let t = match EVENT_LOOP.lock() {
            Ok(slot) => slot.clone(),
            Err(e) => e.into_inner().clone(),
        };
        if let Some(t) = t {
            t.unpark();
        }
    }
}

#[cfg(target_os = "android")]
pub(crate) use android::{app_in_background, register_event_loop, set_app_in_background, wake};

#[cfg(test)]
mod tests {
    use super::*;

    fn away() -> OutputNeeds {
        OutputNeeds {
            app_in_background: true,
            ..OutputNeeds::default()
        }
    }

    #[test]
    fn parks_only_when_away_and_silent() {
        assert!(should_park(away()));
        assert!(!should_park(OutputNeeds::default()), "on screen never parks");
    }

    #[test]
    fn anything_that_needs_the_callback_keeps_it_running() {
        let cases = [
            OutputNeeds { transport_playing: true, ..away() },
            OutputNeeds { take_playing_back: true, ..away() },
            OutputNeeds { take_recording: true, ..away() },
            OutputNeeds { speech_in_flight: true, ..away() },
        ];
        for n in cases {
            assert!(!should_park(n), "parked while needed: {n:?}");
        }
    }

    #[test]
    fn steps_follow_the_wish() {
        assert_eq!(park_step(false, true, false), ParkStep::Pause);
        assert_eq!(park_step(true, false, false), ParkStep::Resume);
        assert_eq!(park_step(true, true, false), ParkStep::Nothing);
        assert_eq!(park_step(false, false, false), ParkStep::Nothing);
    }

    #[test]
    fn a_dead_stream_is_asked_nothing() {
        for parked in [false, true] {
            for want in [false, true] {
                assert_eq!(park_step(parked, want, true), ParkStep::Nothing);
            }
        }
    }

    #[test]
    fn a_failed_resume_recovers_exactly_once() {
        assert_eq!(resume_outcome(true, false), ResumeOutcome::Resumed);
        assert_eq!(resume_outcome(false, false), ResumeOutcome::Reopen);
        assert_eq!(
            resume_outcome(false, true),
            ResumeOutcome::AlreadyReported,
            "the error callback already asked for the reopen"
        );
    }

    /// The reviewer's HIGH: a dead stream under a stopped transport must
    /// still be reopened, not left for a Play that finds nothing to do.
    #[test]
    fn a_dead_stream_is_reopened_whether_or_not_anything_plays() {
        assert!(route_should_reopen(true, true));
        assert!(!route_should_reopen(true, false), "a replaced stream is not reopened twice");
        assert!(!route_should_reopen(false, true), "no thread: the next start opens one");
        assert!(start_must_report_dead(true, true));
        assert!(!start_must_report_dead(true, false));
        assert!(!start_must_report_dead(false, true));
    }

    /// End to end over the pure parts: away and stopped, a reroute closes the
    /// paused stream, the app comes back. One reopen, from the error
    /// callback's report; the loop's own failed start adds none.
    #[test]
    fn a_reroute_while_parked_reopens_once() {
        let mut parked = false;
        let mut dead = false;
        let mut reports = 0;
        // Away and stopped: pause.
        assert_eq!(park_step(parked, should_park(away()), dead), ParkStep::Pause);
        parked = true;
        // The system closes the stream: the error callback marks it dead and
        // reports it.
        let closed_by_system = true;
        dead = true;
        reports += 1;
        // Back on screen: the loop asks nothing of a dead stream.
        assert_eq!(park_step(parked, should_park(OutputNeeds::default()), dead), ParkStep::Nothing);
        // Had it raced the error callback and tried anyway, it would not
        // report again.
        if resume_outcome(false, closed_by_system) == ResumeOutcome::Reopen {
            reports += 1;
        }
        assert_eq!(reports, 1);
        assert!(route_should_reopen(true, dead));
    }
}
