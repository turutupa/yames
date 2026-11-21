//! Real-time scheduling for the cpal callback threads, on Windows.
//!
//! **What was wrong.** cpal 0.15.3's WASAPI backend means to raise every
//! stream thread to `THREAD_PRIORITY_TIME_CRITICAL`
//! (`host/wasapi/stream.rs::boost_current_thread_priority`), but it passes
//! `GetCurrentThreadId()` where `SetThreadPriority` wants a thread HANDLE.
//! The call fails and the error is thrown away with `let _ =`. Measured on
//! the RTX (Windows ARM, 2026-11-20): the output callback thread sat at
//! base priority 6 in a BelowNormal process, i.e. plain
//! `THREAD_PRIORITY_NORMAL`, level with the event loop and every worker and
//! one step above the LLM's threads. Nothing registered it with MMCSS
//! either. Raising it from outside took p99 callback jitter under LLM load
//! from 5 of 10 passing to 5 of 5. See `plans/engine/win-mmcss.md`.
//!
//! **What this does.** A [`CallbackPriority`] lives inside the stream's data
//! closure. On the closure's first call — the first moment code runs on
//! cpal's stream thread, since cpal has no thread-start hook — it registers
//! that thread with MMCSS as `"Pro Audio"` and raises it within the task to
//! `AVRT_PRIORITY_HIGH`. If MMCSS refuses (service stopped, task missing from
//! the registry) it falls back to what cpal meant to do, `TIME_CRITICAL`,
//! through the pseudo-handle `GetCurrentThread()`. If that fails too the
//! stream plays on exactly as it did before; promotion never fails a stream.
//!
//! **Lifetime and revert.** cpal moves the data closure into its stream
//! thread and drops it there when the stream is dropped (the thread's run
//! function returns, then the closure goes). So `Drop` here runs on the
//! promoted thread at stream teardown, and reverts what was done: the MMCSS
//! registration with `AvRevertMmThreadCharacteristics`, or the fallback's
//! priority back to the level it had. A drop on any other thread — a
//! closure whose stream never built, so never ran — has nothing to revert,
//! and the thread id is checked so it cannot revert someone else.
//!
//! **Nothing on the callback allocates on the Rust side.** The
//! first-callback path is three Win32 calls with a stack `u32` and a
//! `'static` UTF-16 name, plus atomic stores; every later callback is one
//! `bool` test. The engine calls it inside the click-jitter probe's
//! allocation span, so the probe's counting allocator checks that claim
//! instead of taking it on trust. `avrt.dll` is a load-time import
//! (windows-sys links it), so there is no `LoadLibrary` on the audio thread.
//! [`CallbackPriority::new`] — called on the thread that BUILDS the stream —
//! makes the process's first MMCSS registration there and reverts it, which
//! keeps the process-first MMCSS call off the audio thread. Each stream's own
//! registration still costs one syscall in its first buffer: MMCSS reads the
//! task's registry key and may touch the process heap, as cpal 0.17,
//! PortAudio and JUCE all accept. The onset analyzer's thread is already
//! MMCSS `"Audio"` (`audio_thread_priority`, `onset.rs`); the mic callback at
//! `"Pro Audio"` now outranks its consumer, which is the right order.
//! Nothing here logs from the callback: outcomes are counted in atomics, and
//! [`report_once`] prints them from a thread that may print (the engine's
//! event loop).
//!
//! **Other platforms: no change.** Everywhere but Windows the type is empty
//! and both calls compile to nothing. CoreAudio already runs its IO thread at
//! real-time priority; Android goes through Oboe, which asks for its own; and
//! on Linux the ALSA thread was never promoted, nothing measured it, and a
//! SCHED_RR thread there is gated by rlimits and rtkit — a behaviour change
//! that would need its own measurement first.

use std::sync::atomic::{AtomicU32, Ordering};

/// Callback threads registered with MMCSS "Pro Audio" since launch.
static MMCSS: AtomicU32 = AtomicU32::new(0);
/// Callback threads MMCSS refused that took the `TIME_CRITICAL` fallback.
static FALLBACK: AtomicU32 = AtomicU32::new(0);
/// Callback threads left where cpal put them (both attempts failed).
static FAILED: AtomicU32 = AtomicU32::new(0);
/// The last Win32 error MMCSS answered with, for the log line.
static LAST_ERROR: AtomicU32 = AtomicU32::new(0);
/// Which of the three outcomes [`report_once`] has already printed, as bits.
static REPORTED: AtomicU32 = AtomicU32::new(0);

/// How the callback threads opened so far were scheduled:
/// `(mmcss, fallback, failed)`. Read by the jitter probe so a run says which
/// path it measured, and by the Windows test. `Acquire`, pairing with the
/// `Release` increments, so a reader that sees a fallback or a failure also
/// sees the `LAST_ERROR` stored before it.
pub fn counts() -> (u32, u32, u32) {
    (
        MMCSS.load(Ordering::Acquire),
        FALLBACK.load(Ordering::Acquire),
        FAILED.load(Ordering::Acquire),
    )
}

/// Print each outcome the first time it is seen, once per process.
///
/// Call it from a thread that may print — never the callback. Three loads
/// and one `fetch_or` when there is nothing new, so it can sit in a loop.
/// The `fetch_or` claims the new bits in one RMW, so two event loops alive
/// at once (a timed-out reopen) cannot both print the same outcome.
pub fn report_once() {
    let (mmcss, fallback, failed) = counts();
    let seen = (mmcss > 0) as u32 | ((fallback > 0) as u32) << 1 | ((failed > 0) as u32) << 2;
    if seen == 0 {
        return;
    }
    let new = seen & !REPORTED.fetch_or(seen, Ordering::Relaxed);
    if new == 0 {
        return;
    }
    // Last writer wins across streams; it is only for the log line.
    let err = LAST_ERROR.load(Ordering::Relaxed);
    if new & 1 != 0 {
        eprintln!("[yames] audio callback thread registered with MMCSS \"Pro Audio\"");
    }
    if new & 2 != 0 {
        eprintln!(
            "[yames] MMCSS refused the audio callback thread (error {err}); \
             it runs at TIME_CRITICAL instead"
        );
    }
    if new & 4 != 0 {
        eprintln!(
            "[yames] could not raise the audio callback thread (MMCSS error {err}, \
             and SetThreadPriority failed); it runs at normal priority"
        );
    }
}

/// `YAMES_NO_CALLBACK_PRIORITY=1` leaves the callback threads where cpal
/// puts them, as before this module existed: the A/B switch the RTX
/// measurement used on one binary, and an escape hatch if a driver ever
/// misbehaves with an MMCSS thread. Read once, on a stream-building thread.
#[cfg(windows)]
fn disabled() -> bool {
    static OFF: std::sync::OnceLock<bool> = std::sync::OnceLock::new();
    *OFF.get_or_init(|| {
        let off = std::env::var_os("YAMES_NO_CALLBACK_PRIORITY").is_some_and(|v| v != "0");
        if off {
            eprintln!("[yames] YAMES_NO_CALLBACK_PRIORITY set: audio callback threads not raised");
        }
        off
    })
}

/// The promotion a stream's data closure carries. Build it on the thread
/// that builds the stream, move it into the closure, call
/// [`on_callback`](Self::on_callback) first thing in every call.
pub struct CallbackPriority {
    #[cfg(windows)]
    inner: win::Inner,
}

impl CallbackPriority {
    /// Not on the audio thread: this is where the one-off warm-up happens.
    pub fn new() -> Self {
        #[cfg(windows)]
        {
            let off = disabled();
            if !off {
                win::warm_up();
            }
            Self {
                // Disabled = "already tried": the callback never promotes.
                inner: win::Inner {
                    tried: off,
                    ..Default::default()
                },
            }
        }
        #[cfg(not(windows))]
        Self {}
    }

    /// First thing in the data callback. Promotes the calling thread on the
    /// first call; every later call is one branch.
    #[inline(always)]
    pub fn on_callback(&mut self) {
        #[cfg(windows)]
        if !self.inner.tried {
            self.inner.promote(&win::PRO_AUDIO);
        }
    }
}

impl Default for CallbackPriority {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(windows)]
impl Drop for CallbackPriority {
    fn drop(&mut self) {
        self.inner.revert();
    }
}

#[cfg(windows)]
mod win {
    use super::{FAILED, FALLBACK, LAST_ERROR, MMCSS};
    use std::sync::atomic::Ordering;
    use windows_sys::Win32::Foundation::{GetLastError, HANDLE};
    use windows_sys::Win32::System::Threading::{
        AvRevertMmThreadCharacteristics, AvSetMmThreadCharacteristicsW, AvSetMmThreadPriority,
        GetCurrentThread, GetCurrentThreadId, GetThreadPriority, SetThreadPriority,
        AVRT_PRIORITY_HIGH, THREAD_PRIORITY_TIME_CRITICAL,
    };

    /// `GetThreadPriority`'s failure value (`THREAD_PRIORITY_ERROR_RETURN`,
    /// which windows-sys files under a feature this crate does not enable).
    const PRIORITY_ERROR: i32 = 0x7FFF_FFFF;

    /// `"Pro Audio"`, NUL-terminated UTF-16, built at compile time so the
    /// callback never encodes a string.
    pub(super) static PRO_AUDIO: [u16; 10] = utf16z(b"Pro Audio");

    const fn utf16z<const N: usize>(ascii: &[u8]) -> [u16; N] {
        let mut out = [0u16; N];
        let mut i = 0;
        while i < ascii.len() {
            out[i] = ascii[i] as u16;
            i += 1;
        }
        out
    }

    #[derive(Default, Clone, Copy, PartialEq, Debug)]
    pub(super) enum Held {
        #[default]
        Nothing,
        /// The MMCSS task handle, as an integer so the closure stays `Send`.
        Mmcss(usize),
        /// The fallback, with the relative priority to put back.
        TimeCritical(i32),
    }

    #[derive(Default)]
    pub(super) struct Inner {
        pub(super) tried: bool,
        pub(super) held: Held,
        pub(super) thread: u32,
    }

    /// The process's first MMCSS registration, made and reverted on a
    /// thread that is allowed to wait. The avrt crate saw concurrent first
    /// calls fail with `ERROR_PATH_NOT_FOUND` while the service started; this
    /// also keeps that start-up out of the first buffer.
    pub(super) fn warm_up() {
        static ONCE: std::sync::Once = std::sync::Once::new();
        ONCE.call_once(|| {
            let mut index = 0u32;
            // SAFETY: a NUL-terminated static name and a stack out-param;
            // the handle is reverted on this same thread straight away.
            unsafe {
                let h = AvSetMmThreadCharacteristicsW(PRO_AUDIO.as_ptr(), &mut index);
                if !h.is_null() {
                    AvRevertMmThreadCharacteristics(h);
                }
            }
        });
    }

    impl Inner {
        /// On the audio thread, once. No allocation, no lock, no I/O on the
        /// Rust side. `task` is a NUL-terminated UTF-16 MMCSS task name:
        /// always [`PRO_AUDIO`] in the app; the tests pass one the registry
        /// lacks to drive the `TIME_CRITICAL` fallback.
        #[cold]
        #[inline(never)]
        pub(super) fn promote(&mut self, task: &'static [u16]) {
            debug_assert_eq!(task.last(), Some(&0), "task name is NUL-terminated");
            self.tried = true;
            // SAFETY: plain Win32 scheduling calls on the calling thread;
            // `GetCurrentThread` is a pseudo-handle that needs no close.
            unsafe {
                self.thread = GetCurrentThreadId();
                let mut index = 0u32;
                let h: HANDLE = AvSetMmThreadCharacteristicsW(task.as_ptr(), &mut index);
                if !h.is_null() {
                    // Within the task; a refusal still leaves the thread in
                    // the Pro Audio class, so it is not worth a fallback.
                    AvSetMmThreadPriority(h, AVRT_PRIORITY_HIGH);
                    self.held = Held::Mmcss(h as usize);
                    MMCSS.fetch_add(1, Ordering::Release);
                    return;
                }
                LAST_ERROR.store(GetLastError(), Ordering::Relaxed);
                let me = GetCurrentThread();
                let before = GetThreadPriority(me);
                if SetThreadPriority(me, THREAD_PRIORITY_TIME_CRITICAL) != 0 {
                    let restore = if before == PRIORITY_ERROR {
                        0
                    } else {
                        before
                    };
                    self.held = Held::TimeCritical(restore);
                    FALLBACK.fetch_add(1, Ordering::Release);
                } else {
                    FAILED.fetch_add(1, Ordering::Release);
                }
            }
        }

        /// From `Drop`. Only on the thread that was promoted.
        pub(super) fn revert(&mut self) {
            let held = std::mem::take(&mut self.held);
            if held == Held::Nothing {
                return;
            }
            // SAFETY: as in `promote`; the handle came from this thread's
            // own `AvSetMmThreadCharacteristicsW` and is reverted once.
            unsafe {
                if GetCurrentThreadId() != self.thread {
                    // Not the promoted thread: nothing of ours to undo here,
                    // and the registration ends with its thread anyway.
                    return;
                }
                match held {
                    Held::Mmcss(h) => {
                        AvRevertMmThreadCharacteristics(h as HANDLE);
                    }
                    Held::TimeCritical(p) => {
                        SetThreadPriority(GetCurrentThread(), p);
                    }
                    Held::Nothing => {}
                }
            }
        }
    }

    /// A task name no registry has, NUL-terminated: MMCSS refuses it, which
    /// is how the tests reach the fallback on a machine where MMCSS works.
    #[cfg(test)]
    pub(super) static NO_SUCH_TASK: [u16; 19] = utf16z(b"Yames No Such Task");

    #[cfg(test)]
    pub(super) fn current_priority() -> i32 {
        // SAFETY: a read of the calling thread's priority.
        unsafe { GetThreadPriority(GetCurrentThread()) }
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicI32, AtomicU8};
    use std::sync::Arc;
    use std::time::{Duration, Instant};

    /// `YAMES_NO_CALLBACK_PRIORITY` (the A/B switch) turns promotion off for
    /// the whole process, so in a shell that exported it these tests would
    /// read as regressions. Skip instead, and say so.
    fn skip_if_disabled() -> bool {
        let off = disabled();
        if off {
            eprintln!("YAMES_NO_CALLBACK_PRIORITY set; callback-priority test skipped");
        }
        off
    }

    /// The promotion on a plain thread: it takes, it raises the thread, and
    /// dropping it puts the thread back where it was.
    #[test]
    fn promotes_on_first_call_and_reverts_on_drop() {
        if skip_if_disabled() {
            return;
        }
        std::thread::spawn(|| {
            let before = win::current_priority();
            let mut p = CallbackPriority::new();
            p.on_callback();
            assert!(p.inner.tried);
            match p.inner.held {
                win::Held::Mmcss(_) => {}
                win::Held::TimeCritical(_) => {
                    assert_eq!(win::current_priority(), 15, "fallback is TIME_CRITICAL");
                }
                win::Held::Nothing => panic!("neither MMCSS nor SetThreadPriority took"),
            }
            assert!(win::current_priority() > before, "the thread was raised");
            p.on_callback(); // a second call is a no-op
            drop(p);
            assert_eq!(win::current_priority(), before, "reverted on drop");
        })
        .join()
        .unwrap();
    }

    /// The fallback, which no machine with working MMCSS would otherwise
    /// run: a task name the registry lacks makes MMCSS refuse, the thread
    /// goes to TIME_CRITICAL through the pseudo-handle, and dropping puts it
    /// back exactly where it was.
    #[test]
    fn unknown_task_takes_time_critical_fallback_and_reverts() {
        if skip_if_disabled() {
            return;
        }
        std::thread::spawn(|| {
            let before = win::current_priority();
            assert_ne!(before, 15, "a fresh thread is not already TIME_CRITICAL");
            let fallback_before = counts().1;
            let mut p = CallbackPriority::new();
            p.inner.promote(&win::NO_SUCH_TASK);
            assert!(p.inner.tried);
            assert_eq!(
                p.inner.held,
                win::Held::TimeCritical(before),
                "MMCSS refused the unknown task and the fallback took"
            );
            assert_eq!(win::current_priority(), 15, "fallback is TIME_CRITICAL");
            assert_ne!(LAST_ERROR.load(Ordering::Acquire), 0, "MMCSS's error was kept");
            assert!(counts().1 > fallback_before, "the fallback was counted");
            p.on_callback(); // already tried: no second promotion
            assert_eq!(p.inner.held, win::Held::TimeCritical(before));
            drop(p);
            assert_eq!(win::current_priority(), before, "reverted on drop");
        })
        .join()
        .unwrap();
    }

    /// The real thing: a cpal output stream on the default device, and the
    /// priority its callback thread reports after its first callback. Skips
    /// (passes) on a machine with no output device, e.g. a headless runner.
    #[test]
    fn cpal_output_callback_thread_is_raised() {
        if skip_if_disabled() {
            return;
        }
        use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
        let host = cpal::default_host();
        let Some(device) = host.default_output_device() else {
            eprintln!("no output device; skipped");
            return;
        };
        let Ok(config) = device.default_output_config() else {
            eprintln!("no output config; skipped");
            return;
        };
        // i32::MIN = not called yet.
        let seen = Arc::new(AtomicI32::new(i32::MIN));
        let how = Arc::new(AtomicU8::new(0));
        let (seen_cb, how_cb) = (seen.clone(), how.clone());
        let mut prio = CallbackPriority::new();
        let stream = device
            .build_output_stream(
                &config.config(),
                move |data: &mut [f32], _: &cpal::OutputCallbackInfo| {
                    prio.on_callback();
                    if seen_cb.load(Ordering::Relaxed) == i32::MIN {
                        how_cb.store(
                            match prio.inner.held {
                                win::Held::Nothing => 0,
                                win::Held::Mmcss(_) => 1,
                                win::Held::TimeCritical(_) => 2,
                            },
                            Ordering::Relaxed,
                        );
                        seen_cb.store(win::current_priority(), Ordering::Relaxed);
                    }
                    data.fill(0.0);
                },
                |_| {},
                None,
            )
            .expect("the output stream builds");
        stream.play().expect("it starts");
        let t0 = Instant::now();
        while seen.load(Ordering::Relaxed) == i32::MIN && t0.elapsed() < Duration::from_secs(3) {
            std::thread::yield_now();
        }
        drop(stream);
        let p = seen.load(Ordering::Relaxed);
        assert_ne!(p, i32::MIN, "the callback never ran");
        assert_ne!(how.load(Ordering::Relaxed), 0, "callback thread not promoted");
        // cpal's own boost is a no-op (thread id passed as a handle), so
        // anything at or above TIME_CRITICAL is ours.
        assert!(p >= 15, "callback thread priority {p}, want >= TIME_CRITICAL");
    }
}
