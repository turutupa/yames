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

/// The park check's reads, once a pass (card #14, item 4).
///
/// Every one is an atomic load: the take's and the speech's slot flags are
/// mirrors kept under their locks by the command and speaking threads, so
/// this never waits on either while the app is away and the loop runs it
/// on every pass. A take whose end has already been reported does not
/// count: it keeps its slot until the screen stops it, and the screen may be
/// asleep. That acknowledgement lives on the handoff, so it survives a
/// reopen that replaces this loop.
pub(crate) fn read_needs(
    app_in_background: bool,
    transport_playing: bool,
    take: &crate::take::TakeHandoff,
    speech: &crate::speech_out::SpeechHandoff,
) -> OutputNeeds {
    OutputNeeds {
        app_in_background,
        transport_playing,
        take_playing_back: take.is_playing_unfinished(),
        take_recording: take.is_recording(),
        speech_in_flight: speech.in_flight(),
    }
}

/// How long the event loop waits between attempts to start a paused stream
/// that refused (card #14, item 2). A refusal is often transient — the
/// audio server busy with another client for a moment — and the price of
/// giving up at once was a full reopen, which used to drop the loaded
/// song, the jam's kit and the coach's line. Bounded and short: 85 ms in
/// all, on the event loop and never on the audio thread, while a stream
/// that is not running hands the loop no beats to wait on it.
pub(crate) const RESUME_RETRY_DELAYS_MS: [u64; 3] = [10, 25, 50];

/// Start a paused stream, retrying a refusal [`RESUME_RETRY_DELAYS_MS`]
/// apart. `stop_trying` is asked before each retry: the system closed the
/// stream (its error callback has already asked for the reopen) or the
/// engine is shutting down, and either way there is nothing to retry. Only
/// when every attempt failed is the stream given to `android_route`.
pub(crate) fn resume_with_retries<E: std::fmt::Display>(
    mut play: impl FnMut() -> Result<(), E>,
    stop_trying: impl Fn() -> bool,
    mut wait: impl FnMut(std::time::Duration),
) -> ResumeOutcome {
    let mut last = play();
    for ms in RESUME_RETRY_DELAYS_MS {
        match last {
            Ok(()) => return ResumeOutcome::Resumed,
            Err(ref e) => eprintln!("[yames][android] the output would not start: {e}"),
        }
        if stop_trying() {
            return resume_outcome(false, true);
        }
        wait(std::time::Duration::from_millis(ms));
        last = play();
    }
    if let Err(ref e) = last {
        eprintln!("[yames][android] the output would not start after retries: {e}");
    }
    resume_outcome(last.is_ok(), stop_trying())
}

/// What `android_route` has been asked to do, from any thread: two flags,
/// set with one store each from an error callback or the event loop and
/// consumed by the route thread.
///
/// Two and not one (card #14, item 3): a stream the SYSTEM closed is a
/// route change, which the frontend hears about as `audio-route-changed`;
/// a stream that merely would not start again (a failed resume, or `start`
/// finding it dead) is not, and re-announcing a route change for it sent
/// the screen to re-read devices that had not moved.
pub(crate) struct RouteRequests {
    route_lost: std::sync::atomic::AtomicBool,
    dead: std::sync::atomic::AtomicBool,
}

/// One pass of the route thread over [`RouteRequests`].
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub(crate) struct RouteRequest {
    /// The system closed the stream: the route moved.
    pub route_changed: bool,
    /// The stream is dead and wants reopening; the route did not move.
    pub reopen: bool,
}

impl RouteRequests {
    pub(crate) const fn new() -> Self {
        Self {
            route_lost: std::sync::atomic::AtomicBool::new(false),
            dead: std::sync::atomic::AtomicBool::new(false),
        }
    }

    /// The output's error callback: the system closed the stream.
    pub(crate) fn note_route_lost(&self) {
        self.route_lost.store(true, std::sync::atomic::Ordering::Release);
    }

    /// The event loop or `start`: the stream is dead, the route is not news.
    pub(crate) fn note_dead(&self) {
        self.dead.store(true, std::sync::atomic::Ordering::Release);
    }

    /// The route thread: what has been asked since the last pass.
    pub(crate) fn take(&self) -> RouteRequest {
        use std::sync::atomic::Ordering;
        RouteRequest {
            route_changed: self.route_lost.swap(false, Ordering::AcqRel),
            reopen: self.dead.swap(false, Ordering::AcqRel),
        }
    }
}

/// How `android_route` reopens a dead stream.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Reopen {
    /// The route moved: the device-switch path (`set_device`), which drops
    /// what was decoded for the old route's rate.
    NewRoute,
    /// The route did not move: `MetronomeEngine::reopen_output`, which keeps
    /// the song, the kit and the coach's line when the rate has not moved.
    SameRoute,
}

/// What the route thread does with one pass's requests.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct RoutePlan {
    pub reopen: Option<Reopen>,
    /// `audio-route-changed { kind: "output" }`: only for a route that moved.
    pub emit_route_changed: bool,
}

/// `needs_reopen` is [`route_should_reopen`]'s answer for the engine now.
pub(crate) fn route_plan(req: RouteRequest, needs_reopen: bool) -> RoutePlan {
    let reopen = if !needs_reopen {
        None
    } else if req.route_changed {
        Some(Reopen::NewRoute)
    } else if req.reopen {
        Some(Reopen::SameRoute)
    } else {
        None
    };
    RoutePlan {
        reopen,
        emit_route_changed: req.route_changed,
    }
}

/// `reopen_output`'s rule: drop what was decoded for the old stream only
/// when both rates are known and differ.
///
/// A probe that failed (twice — `reopen_output` asks again once) is not a
/// rate that moved, and dropping the song for it was the price of a
/// transient refusal (review of card #14, item 3). With no probe there is
/// no format to hand the stream either, so its own setup probes, and a
/// device that refuses that too does not open: nothing stale gets played.
pub(crate) fn reopen_keeps_loaded(old_rate: Option<u32>, new_rate: Option<u32>) -> bool {
    match (old_rate, new_rate) {
        (Some(a), Some(b)) => a == b,
        _ => true,
    }
}

/// The setup's check for a reopen that kept material decoded at `expected`
/// without a probed format to open at (re-review of card #14, item B): a
/// stream at any other rate would play it detuned. No expectation, no check.
pub(crate) fn setup_rate_matches(expected: Option<u32>, actual: u32) -> bool {
    expected.map_or(true, |e| e == actual)
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

    use crate::speech_out::{SpeechClip, SpeechHandoff};
    use crate::take::{TakeHandoff, TakePlayback, TakeRing};
    use std::cell::Cell;
    use std::sync::Arc;
    use std::time::Duration;

    /// Card #14, item 4: the away loop's reads must answer while the
    /// command thread and the speaking thread hold every slot lock.
    #[test]
    fn the_away_loop_reads_need_no_lock() {
        let take = Arc::new(TakeHandoff::new());
        let speech = Arc::new(SpeechHandoff::new());
        take.set_play(Some(TakePlayback { pcm: Arc::new(vec![0.0; 4]), sample_rate: 48_000 }));
        take.set_record(Some(Arc::new(TakeRing::new(1024))));
        speech.set_clip(Some(SpeechClip { pcm: Arc::new(vec![0.0; 4]) }));
        let held = (take.hold_slots_for_test(), speech.hold_slot_for_test());
        let (t, s) = (take.clone(), speech.clone());
        let (tx, rx) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            let _ = tx.send(read_needs(true, false, &t, &s));
        });
        let needs = rx
            .recv_timeout(Duration::from_secs(2))
            .expect("the park check blocked on a slot lock");
        drop(held);
        assert!(needs.take_playing_back && needs.take_recording && needs.speech_in_flight);
        assert!(!should_park(needs));

        // A playback whose end has been reported no longer holds the stream.
        take.note_ended(take.play_generation());
        assert!(take.take_ended().is_some());
        let needs = read_needs(true, false, &take, &speech);
        assert!(!needs.take_playing_back);
        take.set_record(None);
        speech.set_clip(None);
        assert!(should_park(read_needs(true, false, &take, &speech)));
    }

    /// Card #14, item 2: a refusal that clears is retried, not reopened.
    #[test]
    fn a_transient_refusal_is_retried_and_never_reopened() {
        let attempts = Cell::new(0);
        let mut waited = Vec::new();
        let outcome = resume_with_retries(
            || {
                attempts.set(attempts.get() + 1);
                if attempts.get() < 3 { Err("busy") } else { Ok(()) }
            },
            || false,
            |d| waited.push(d),
        );
        assert_eq!(outcome, ResumeOutcome::Resumed);
        assert_eq!(attempts.get(), 3);
        assert_eq!(waited, vec![Duration::from_millis(10), Duration::from_millis(25)]);
    }

    #[test]
    fn a_stream_that_never_starts_is_reopened_after_a_bounded_wait() {
        let attempts = Cell::new(0);
        let mut total = Duration::ZERO;
        let outcome = resume_with_retries(
            || {
                attempts.set(attempts.get() + 1);
                Err::<(), _>("refused")
            },
            || false,
            |d| total += d,
        );
        assert_eq!(outcome, ResumeOutcome::Reopen);
        assert_eq!(attempts.get(), 1 + RESUME_RETRY_DELAYS_MS.len());
        assert!(total <= Duration::from_millis(100), "the event loop waited {total:?}");
    }

    #[test]
    fn a_stream_the_system_closed_is_not_retried_or_reported_again() {
        let attempts = Cell::new(0);
        let outcome = resume_with_retries(
            || {
                attempts.set(attempts.get() + 1);
                Err::<(), _>("closed")
            },
            || true,
            |_| panic!("waited on a stream the system closed"),
        );
        assert_eq!(outcome, ResumeOutcome::AlreadyReported);
        assert_eq!(attempts.get(), 1);
    }

    /// Card #14, item 3: only a route that moved is announced.
    #[test]
    fn a_dead_stream_report_reopens_without_announcing_a_route_change() {
        let requests = RouteRequests::new();
        requests.note_dead();
        let req = requests.take();
        assert_eq!(req, RouteRequest { route_changed: false, reopen: true });
        assert_eq!(
            route_plan(req, true),
            RoutePlan { reopen: Some(Reopen::SameRoute), emit_route_changed: false }
        );
        // `start` re-reporting a stream that has already been replaced:
        // nothing to reopen and nothing to announce.
        requests.note_dead();
        assert_eq!(
            route_plan(requests.take(), false),
            RoutePlan { reopen: None, emit_route_changed: false }
        );
        // Consumed: the next pass sees nothing.
        assert_eq!(requests.take(), RouteRequest::default());
    }

    #[test]
    fn a_route_the_system_moved_is_announced_once_and_takes_the_device_path() {
        let requests = RouteRequests::new();
        requests.note_route_lost();
        requests.note_dead(); // the loop's failed start racing the callback
        let req = requests.take();
        assert_eq!(
            route_plan(req, true),
            RoutePlan { reopen: Some(Reopen::NewRoute), emit_route_changed: true }
        );
        assert_eq!(
            route_plan(requests.take(), false),
            RoutePlan { reopen: None, emit_route_changed: false },
            "a second pass announced the route again"
        );
    }

    #[test]
    fn loaded_material_survives_a_reopen_only_at_the_same_rate() {
        assert!(reopen_keeps_loaded(Some(48_000), Some(48_000)));
        assert!(!reopen_keeps_loaded(Some(48_000), Some(44_100)));
        // Unknown is not "moved": a failed probe keeps the song.
        assert!(reopen_keeps_loaded(None, Some(48_000)));
        assert!(reopen_keeps_loaded(Some(48_000), None));
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
