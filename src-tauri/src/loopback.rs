//! Everything this computer plays — the second thing a take can be made of.
//!
//! The owner, 2026-09-21: *"the video recorder, specially for jam, should
//! record everything as it comes out from the pc ideally, cause im using
//! guitar effects and distortion and stuff with plugins to play on top of the
//! drums and keys and bass and it sounds really cool."*
//!
//! A take as `take.rs` has always made one is **Yames and your input**: the
//! band the output callback rendered, with the microphone mixed under it. His
//! guitar does not go through the microphone — it goes into an interface, out
//! of an amp simulator running in ANOTHER program, and into the same speakers
//! Yames is playing to. The operating system does that mix, and until now
//! nothing in Yames could hear it.
//!
//! This module opens the other end of that: the render endpoint's own stream,
//! read back. What arrives is exactly the sum the speakers got — his guitar,
//! Yames' band, the click, and anything else that happened to be playing.
//!
//! ## Which device, and why
//!
//! **The one Yames is playing through**, which is [`EngineOutput::name`] —
//! the device chosen in settings, or the system default when settings says
//! default (which is the usual case, and then the two are the same device).
//!
//! The alternative would be "always the system default", on the reasoning
//! that his plugin host plays there. It is the wrong choice, and the reason
//! is what the recording has to contain: the band. A loopback of a device
//! Yames is NOT playing to has his guitar in it and no band at all, which is
//! not a take of anything. A loopback of the device Yames IS playing to has
//! the band for certain, and has his guitar whenever he can hear the two
//! together — which is the only situation in which he would ask for this.
//! When the two devices differ he is listening to two different speakers and
//! there is no single stream that is "what the room sounded like"; the screen
//! says which device the recording listens to, by name, so the case is
//! visible rather than silently wrong.
//!
//! ## It already contains the band
//!
//! Which is why [`take.rs`] does not also mix its own band and microphone
//! into a take recorded this way. Doing so would put the same band in twice,
//! a few milliseconds apart — a comb filter, not a thicker sound. In this
//! mode the loopback IS the take, and there is no dry stem to be had (the
//! player is not on a channel of their own in it), so the review says pitch
//! checking wants the other source.
//!
//! ## The level is the machine's, and that is why there is a check
//!
//! Measured here, 2026-09-21, on a Realtek endpoint: with the speakers MUTED
//! and the master volume at zero, a full-scale tone rendered into that
//! endpoint comes back through the loopback as **exact zeroes** — not a quiet
//! copy, nothing at all. So on this hardware the mute and the volume slider
//! sit BEFORE the tap, and a take of everything this computer plays is as
//! loud as Windows was set to play it.
//!
//! Nothing here corrects for that, deliberately — a recording quietly
//! normalised behind somebody's back is a recording they cannot trust. What
//! it buys instead is `commands::check_take_sound`: two hundred milliseconds
//! of listening and a number, so a musician sees the level BEFORE the take
//! rather than finding four minutes of silence after it.
//!
//! ## Nothing new on the output callback
//!
//! This is its own input stream on its own callback thread, owned by cpal,
//! pushing interleaved samples into a preallocated [`TakeRing`] exactly as
//! the microphone's callback does. The output callback is not touched, does
//! not know this exists, and pays nothing for it. Rate conversion, the
//! down-mix from however many channels the device mix format has, and the
//! write to disk all happen on the take's writer thread.
//!
//! ## What each platform can actually do
//!
//! * **Windows** — WASAPI loopback, and cpal reaches it without a second
//!   crate: `Device::build_input_stream` on a device whose data flow is
//!   `eRender` adds `AUDCLNT_STREAMFLAGS_LOOPBACK` itself
//!   (`cpal-0.15.3/src/host/wasapi/device.rs`, and the note at the top of
//!   `host/wasapi/mod.rs`). Verified on this machine — see
//!   `src-tauri/tests/loopback_hears_the_output.rs`.
//!
//!   Two things about that code that are easy to get wrong and are worth
//!   writing down, because both were checked rather than assumed:
//!
//!   1. **The format comes from `default_output_config`, not
//!      `default_input_config`.** cpal's WASAPI device answers the input
//!      queries only when its data flow is `eCapture`; on a render device
//!      `default_input_config()` returns `StreamTypeNotSupported` and
//!      `supported_input_configs()` is empty. [`pick_device`] asks the
//!      output side, which is the mix format a loopback capture is offered
//!      and the only one it will accept.
//!   2. **A loopback endpoint that nothing is playing to delivers nothing
//!      at all** — not silence. The callback simply is not called (Microsoft's
//!      own loopback note, and PortAudio issue 935 on the driver-to-driver
//!      variation). The usual remedy is to keep a render stream of silence
//!      open on the endpoint so the audio engine keeps running; **Yames is
//!      already that stream.** Its output stream is open for the whole of a
//!      take — that is what `out_sr` being non-zero means — and it is open on
//!      *this* endpoint, because this listens to the device Yames plays
//!      through. So the gap cannot open under a take. It is a third reason
//!      for the choice of device, and a reason the writer treats a quiet
//!      moment as audio that has not arrived yet rather than as a stall.
//! * **Linux** — PulseAudio and PipeWire both publish a `.monitor` source
//!   for every sink, and cpal's ALSA host lists whatever `snd_device_name_hint`
//!   offers it. That is the catch: a monitor is not an ALSA PCM of its own, so
//!   it appears only where the machine has an `.asoundrc` naming it with a
//!   `hint` block. [`pick_device`] looks for such a source and, when there is
//!   none, refuses in words. **Nobody here has a Linux machine to run it on**,
//!   so it is compiled and it fails safe — never a fallback to a real
//!   microphone, which would record the room and call it "everything this
//!   computer plays".
//! * **macOS** — absent. There is no loopback device in Core Audio without a
//!   third-party virtual driver. The two Apple APIs that can do it are
//!   ScreenCaptureKit audio capture (13+, behind the screen-recording
//!   permission, awkward for audio alone) and Core Audio process taps
//!   (14.4+, behind `NSAudioCaptureUsageDescription`). cpal grew the second
//!   of those in 0.17 — a device literally named `default-output` — and Yames
//!   is on 0.15.3, so reaching it is a cpal major upgrade under the engine's
//!   own output stream and a macOS 14.6 floor, which is not a thing to do
//!   overnight and not a thing to ship untested. Shipping a path that
//!   silently records nothing is worse than not offering it, so the option is
//!   not offered on a Mac and the screen says why in one sentence.

use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;

use crate::take::TakeRing;

/// How much audio the loopback ring holds, in seconds.
///
/// The same four seconds the take's own rings hold, for the same reason: the
/// writer wakes every twenty-five milliseconds, so this is two orders of
/// magnitude of slack against a disk stall or a scheduler hiccup.
const RING_SECS: usize = 4;

/// What was opened, so the screen can name it and the writer can convert it.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoopbackFormat {
    /// The device this listens to, as the operating system names it.
    pub device: String,
    /// The device's mix rate. Whatever it is; the writer resamples.
    pub sample_rate: u32,
    /// How many channels the mix format has — two on almost every machine,
    /// six on one wired for surround. The writer folds them to stereo.
    pub channels: u16,
}

/// A running capture of everything the computer plays.
///
/// Holds no `cpal::Stream`: the stream is built on, and dropped by, a thread
/// of this struct's own, because a cpal stream is not `Send` on every host
/// and this value lives in the take session behind a mutex. The same shape
/// `AudioInput` uses, for the same reason.
pub struct LoopbackCapture {
    alive: Arc<AtomicBool>,
    thread: Option<std::thread::JoinHandle<()>>,
    ring: Arc<TakeRing>,
    format: LoopbackFormat,
    /// The loudest sample of the most recent buffer, as `f32` bits.
    ///
    /// `fetch_max` on the bit pattern is a correct maximum here and not a
    /// trick: the value stored is always an absolute value, and IEEE-754
    /// positive floats order exactly as their bit patterns do when read as
    /// unsigned integers. One relaxed read-modify-write per buffer.
    peak: Arc<AtomicU32>,
}

impl LoopbackCapture {
    /// The ring the writer thread drains. Interleaved, `channels` at a time.
    pub fn ring(&self) -> Arc<TakeRing> {
        self.ring.clone()
    }

    pub fn format(&self) -> &LoopbackFormat {
        &self.format
    }

    /// The loudest sample since the last time anyone asked, and reset.
    ///
    /// A meter reads this a few times a second. Resetting on read is what
    /// makes it a peak meter rather than a high-water mark that never comes
    /// back down after one loud moment.
    pub fn take_peak(&self) -> f32 {
        f32::from_bits(self.peak.swap(0, Ordering::Relaxed))
    }

    /// Samples the callback had to throw away because the writer was not
    /// keeping up. Zero on any machine that is not on fire, and one of the
    /// numbers the audio-safety gate reads.
    pub fn dropped(&self) -> usize {
        self.ring.dropped()
    }

    /// Stop capturing and close the stream. Called by `Drop` too, so a take
    /// that ends any way at all gives the endpoint back.
    pub fn stop(&mut self) {
        self.alive.store(false, Ordering::Release);
        if let Some(handle) = self.thread.take() {
            let _ = handle.join();
        }
    }
}

impl Drop for LoopbackCapture {
    fn drop(&mut self) {
        self.stop();
    }
}

/// Is this a machine that can record what it plays at all?
///
/// Asked by the UI before it offers the choice, so that a Mac is told the
/// truth once rather than shown a switch that would record silence.
pub fn supported() -> bool {
    cfg!(any(target_os = "windows", target_os = "linux"))
}

/// Open the capture.
///
/// `device_name` is the output device Yames is playing through — `None` for
/// the system default. Returns an error, never a silent failure: a take that
/// was asked to record the room and records nothing is the one outcome this
/// may not produce.
pub fn open(device_name: Option<&str>) -> Result<LoopbackCapture, String> {
    #[cfg(any(target_os = "windows", target_os = "linux"))]
    {
        open_impl(device_name)
    }
    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        let _ = device_name;
        Err(unsupported_here().to_string())
    }
}

/// The one honest sentence a platform that cannot do this gets. Kept next to
/// the reason so the two cannot drift apart.
pub fn unsupported_here() -> &'static str {
    "this Mac cannot hand an app what its speakers are playing without a \
     sound driver from somebody else, so a take here records Yames and your \
     input"
}

#[cfg(any(target_os = "windows", target_os = "linux"))]
fn open_impl(device_name: Option<&str>) -> Result<LoopbackCapture, String> {
    use cpal::traits::{DeviceTrait, StreamTrait};

    // The stream is built on the thread that will own it, and the format it
    // settled on comes back here before `open` returns — so a caller that
    // gets an `Ok` has a stream that is genuinely running, and one that gets
    // an `Err` has the real reason rather than "it did not work".
    let (tx, rx) = std::sync::mpsc::channel::<Result<(LoopbackFormat, Arc<TakeRing>), String>>();
    let alive = Arc::new(AtomicBool::new(true));
    let peak = Arc::new(AtomicU32::new(0));
    let alive_for_thread = alive.clone();
    let peak_for_thread = peak.clone();
    let wanted = device_name.map(str::to_owned);

    let thread = std::thread::Builder::new()
        .name("yames-loopback".into())
        .spawn(move || {
            let host = cpal::default_host();
            let found = match pick_device(&host, wanted.as_deref()) {
                Ok(d) => d,
                Err(e) => {
                    let _ = tx.send(Err(e));
                    return;
                }
            };
            let (device, name, config) = found;
            let format = LoopbackFormat {
                device: name,
                sample_rate: config.sample_rate().0,
                channels: config.channels(),
            };
            // Interleaved, so the ring is sized in samples and not frames.
            let ring = Arc::new(TakeRing::new(
                format.sample_rate as usize * format.channels.max(1) as usize * RING_SECS,
            ));
            let ring_for_callback = ring.clone();
            let peak_in_callback = peak_for_thread.clone();
            let stream_config: cpal::StreamConfig = config.config();
            let sample_format = config.sample_format();

            // THE CALLBACK. Nothing here allocates, locks or blocks: a push
            // into a full ring drops and counts, which is the only thing a
            // thread that cannot wait is allowed to do. The peak is one
            // relaxed read-modify-write for the whole buffer.
            macro_rules! build {
                ($t:ty) => {
                    device.build_input_stream(
                        &stream_config,
                        move |data: &[$t], _: &cpal::InputCallbackInfo| {
                            let mut hi = 0f32;
                            for s in data {
                                let v = <f32 as cpal::Sample>::from_sample(*s);
                                let a = v.abs();
                                if a > hi {
                                    hi = a;
                                }
                            }
                            peak_in_callback.fetch_max(hi.to_bits(), Ordering::Relaxed);
                            push_converted(&ring_for_callback, data);
                        },
                        |e| eprintln!("[loopback] stream error: {e}"),
                        None,
                    )
                };
            }
            let stream = match sample_format {
                cpal::SampleFormat::F32 => build!(f32),
                cpal::SampleFormat::I16 => build!(i16),
                cpal::SampleFormat::U16 => build!(u16),
                other => {
                    let _ = tx.send(Err(format!(
                        "this speaker hands over {other} audio, which Yames cannot read yet"
                    )));
                    return;
                }
            };
            let stream = match stream {
                Ok(s) => s,
                Err(e) => {
                    let _ = tx.send(Err(format!(
                        "could not listen to what {} is playing: {e}",
                        format.device
                    )));
                    return;
                }
            };
            if let Err(e) = stream.play() {
                let _ = tx.send(Err(format!("could not start listening: {e}")));
                return;
            }
            if tx.send(Ok((format, ring))).is_err() {
                return;
            }
            // The stream lives exactly as long as this thread does, and this
            // thread is asleep the whole time: cpal's own callback thread is
            // where the work happens.
            while alive_for_thread.load(Ordering::Acquire) {
                std::thread::sleep(std::time::Duration::from_millis(20));
            }
            drop(stream);
        })
        .map_err(|e| format!("could not start listening to this computer: {e}"))?;

    match rx.recv() {
        Ok(Ok((format, ring))) => Ok(LoopbackCapture {
            alive,
            thread: Some(thread),
            ring,
            format,
            peak,
        }),
        Ok(Err(e)) => {
            alive.store(false, Ordering::Release);
            let _ = thread.join();
            Err(e)
        }
        Err(_) => {
            alive.store(false, Ordering::Release);
            let _ = thread.join();
            Err("listening to this computer stopped before it started".into())
        }
    }
}

/// Convert one callback buffer into the ring without allocating.
///
/// `cpal::Sample` gives the conversion; the loop is written out rather than
/// collected into a `Vec` because a collect on an audio callback is a
/// `malloc` per buffer, which is the thing this whole file is arranged to
/// avoid. `f32` takes the fast path and pushes the slice straight in.
#[cfg(any(target_os = "windows", target_os = "linux"))]
fn push_converted<T: cpal::Sample>(ring: &TakeRing, data: &[T])
where
    f32: cpal::FromSample<T>,
{
    // 256 samples of stack, refilled: a fixed buffer rather than one push
    // per sample, so the ring's acquire/release pair is paid a handful of
    // times per callback instead of once per sample.
    const CHUNK: usize = 256;
    let mut scratch = [0f32; CHUNK];
    for block in data.chunks(CHUNK) {
        for (i, s) in block.iter().enumerate() {
            scratch[i] = <f32 as cpal::Sample>::from_sample(*s);
        }
        ring.push(&scratch[..block.len()]);
    }
}

/// Find the endpoint to listen to, and the format it will hand over.
#[cfg(target_os = "windows")]
fn pick_device(
    host: &cpal::Host,
    wanted: Option<&str>,
) -> Result<(cpal::Device, String, cpal::SupportedStreamConfig), String> {
    use cpal::traits::{DeviceTrait, HostTrait};
    // An OUTPUT device opened as an input. cpal's WASAPI host turns that into
    // a loopback capture on its own — see the module header.
    let device = match wanted {
        Some(name) => host
            .output_devices()
            .ok()
            .and_then(|mut devs| devs.find(|d| d.name().ok().as_deref() == Some(name)))
            .or_else(|| host.default_output_device()),
        None => host.default_output_device(),
    }
    .ok_or("this computer has no speaker Yames can listen to")?;
    let name = device.name().unwrap_or_else(|_| "this speaker".into());
    // The device's own mix format, which is the only format a loopback
    // capture is offered: asking for anything else is how you get
    // `StreamConfigNotSupported`.
    let config = device
        .default_output_config()
        .map_err(|e| format!("{name} would not say what it is playing: {e}"))?;
    Ok((device, name, config))
}

/// The same, for PulseAudio / PipeWire's monitor sources.
///
/// **Compiled, never run here.** Every sink a PulseAudio or PipeWire server
/// owns has a companion source named after it with `.monitor` on the end, and
/// that source is the sink's own output read back. When the ALSA bridge
/// publishes it, cpal lists it among the input devices and it opens like any
/// other microphone. When it does not, this refuses and says so — it never
/// falls back to a real microphone, which would record the room through the
/// laptop's own mic and call it "everything this computer plays".
#[cfg(target_os = "linux")]
fn pick_device(
    host: &cpal::Host,
    wanted: Option<&str>,
) -> Result<(cpal::Device, String, cpal::SupportedStreamConfig), String> {
    use cpal::traits::{DeviceTrait, HostTrait};
    let devices: Vec<cpal::Device> = host
        .input_devices()
        .map_err(|e| format!("could not look at this computer's sound devices: {e}"))?
        .collect();
    let named = |d: &cpal::Device| d.name().unwrap_or_default();
    // The monitor of the sink Yames plays to, when its name is in the
    // monitor's — that is how both servers name them.
    let device = wanted
        .and_then(|w| {
            devices.iter().find(|d| {
                let n = named(d);
                n.contains(".monitor") && n.contains(w)
            })
        })
        .or_else(|| devices.iter().find(|d| named(d).contains(".monitor")))
        .cloned()
        .ok_or(
            "this computer is not offering Yames a way to hear what it is playing; that \
             needs a monitor of your speakers that ALSA can see",
        )?;
    let name = named(&device);
    let config = device
        .default_input_config()
        .map_err(|e| format!("{name} would not say what it is playing: {e}"))?;
    Ok((device, name, config))
}

// ---------------------------------------------------------------------------
// Folding a device's mix format down to a stereo take
// ---------------------------------------------------------------------------

/// Fold one interleaved frame of `channels` down to a stereo pair.
///
/// Pure, and on the writer thread, so the rule lives here where it can be
/// tested without a sound card.
///
/// * **One channel** goes to both sides. A mono endpoint played mono; a take
///   of it that was silent on the right would be a bug nobody could hear
///   until they put headphones on.
/// * **Two** pass through.
/// * **More** are WAVEFORMATEXTENSIBLE order — front left, front right,
///   centre, low frequency, then the surrounds in pairs. The centre goes to
///   both sides at -3 dB and each surround pair to its own side at -3 dB,
///   which is the fold every consumer decoder does. The **LFE is dropped**,
///   deliberately: it is a band nothing in a practice recording wants doubled
///   into both sides, and every published fold-down either drops it or takes
///   it 10 dB down, which on a guitar take is the same thing.
///
/// Not clamped here. The sum can exceed one on a mix that was already at the
/// ceiling, and the clamp belongs at the one place the sample becomes sixteen
/// bits — clamping twice is the same answer and clamping here would hide from
/// the meter that it happened.
pub fn fold_to_stereo(frame: &[f32], channels: usize) -> (f32, f32) {
    const M3DB: f32 = 0.707_106_77;
    match channels {
        0 => (0.0, 0.0),
        1 => {
            let v = frame.first().copied().unwrap_or(0.0);
            (v, v)
        }
        2 => (
            frame.first().copied().unwrap_or(0.0),
            frame.get(1).copied().unwrap_or(0.0),
        ),
        _ => {
            let at = |i: usize| frame.get(i).copied().unwrap_or(0.0);
            let mut l = at(0);
            let mut r = at(1);
            // Channel 2 is the centre, 3 the LFE, when there are that many.
            if channels >= 3 {
                let c = at(2) * M3DB;
                l += c;
                r += c;
            }
            // Everything past the LFE is a surround pair: even to the left,
            // odd to the right, so a 7.1 endpoint folds as sensibly as a 5.1.
            let mut i = 4;
            while i < channels {
                l += at(i) * M3DB;
                if i + 1 < channels {
                    r += at(i + 1) * M3DB;
                }
                i += 2;
            }
            (l, r)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_mono_endpoint_lands_on_both_sides() {
        assert_eq!(fold_to_stereo(&[0.5], 1), (0.5, 0.5));
    }

    #[test]
    fn a_stereo_endpoint_passes_through_untouched() {
        assert_eq!(fold_to_stereo(&[0.25, -0.75], 2), (0.25, -0.75));
    }

    #[test]
    fn five_point_one_folds_the_centre_to_both_and_drops_the_lfe() {
        // FL FR C LFE SL SR
        let (l, r) = fold_to_stereo(&[1.0, 0.0, 1.0, 9.0, 1.0, 0.0], 6);
        // Left: FL + C·-3dB + SL·-3dB. Right: FR + C·-3dB + SR·-3dB.
        assert!((l - (1.0 + 0.707_106_77 + 0.707_106_77)).abs() < 1e-6, "{l}");
        assert!((r - 0.707_106_77).abs() < 1e-6, "{r}");
        // The LFE was 9.0 and appears nowhere: had it been folded in, both
        // sides would be past ten.
        assert!(l < 3.0 && r < 3.0);
    }

    #[test]
    fn seven_point_one_folds_both_surround_pairs() {
        // FL FR C LFE SL SR RL RR — the two rear channels must not be
        // dropped on the floor just because 5.1 is the common case.
        let (l, r) = fold_to_stereo(&[0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 1.0, 0.0], 8);
        assert!((l - 2.0 * 0.707_106_77).abs() < 1e-6, "{l}");
        assert!(r.abs() < 1e-6, "{r}");
    }

    #[test]
    fn a_short_frame_is_silence_rather_than_a_panic() {
        assert_eq!(fold_to_stereo(&[], 2), (0.0, 0.0));
        assert_eq!(fold_to_stereo(&[0.5], 6), (0.5, 0.0));
    }

    /// How much of a tone is at `freq` in `samples`, by Goertzel.
    ///
    /// One bin of a DFT, computed in one pass with three multiplies a sample.
    /// The answer is a magnitude in the same units as the signal, so the test
    /// below compares the bin it is looking for against a bin nothing was
    /// played into rather than against an absolute number — a comparison that
    /// survives whatever the machine's volume happened to be.
    #[cfg(any(target_os = "windows", target_os = "linux"))]
    fn bin_magnitude(samples: &[f32], sample_rate: u32, freq: f64) -> f64 {
        if samples.is_empty() {
            return 0.0;
        }
        let w = std::f64::consts::TAU * freq / sample_rate as f64;
        let coeff = 2.0 * w.cos();
        let (mut s1, mut s2) = (0.0f64, 0.0f64);
        for &x in samples {
            let s0 = x as f64 + coeff * s1 - s2;
            s2 = s1;
            s1 = s0;
        }
        (s1 * s1 + s2 * s2 - coeff * s1 * s2).sqrt() / samples.len() as f64
    }

    /// Play `amplitude` at `hz` through the default speaker for `secs` while
    /// the capture listens, and hand back what it heard, one side of it.
    ///
    /// Shared by the two tests below because they differ in exactly one
    /// number: the amplitude. At zero it makes no sound at all — literal
    /// zeroes into the render buffer — which is the whole trick that lets the
    /// first of them run on a sleeping machine.
    #[cfg(any(target_os = "windows", target_os = "linux"))]
    fn play_and_listen(amplitude: f32, hz: f64, secs: f64) -> (Vec<f32>, u32, usize) {
        use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};

        let host = cpal::default_host();
        let device = host
            .default_output_device()
            .expect("a speaker to play through");
        let config = device.default_output_config().expect("its mix format");
        let sr = config.sample_rate().0;
        let channels = config.channels() as usize;

        // The capture goes up FIRST, so nothing is missed.
        let mut capture = open(None).expect("the capture opens");
        let heard_sr = capture.format().sample_rate;
        let heard_ch = capture.format().channels as usize;
        eprintln!(
            "listening to {} at {heard_sr} Hz / {heard_ch} ch; rendering {hz} Hz at \
             {amplitude} through {} at {sr} Hz / {channels} ch / {:?}",
            capture.format().device,
            device.name().unwrap_or_default(),
            config.sample_format()
        );

        let mut phase = 0f64;
        let step = std::f64::consts::TAU * hz / sr as f64;
        let stream = device
            .build_output_stream(
                &config.config(),
                move |data: &mut [f32], _: &cpal::OutputCallbackInfo| {
                    for frame in data.chunks_mut(channels) {
                        let v = (phase.sin() as f32) * amplitude;
                        phase += step;
                        for s in frame.iter_mut() {
                            *s = v;
                        }
                    }
                },
                |e| eprintln!("[test] output error: {e}"),
                None,
            )
            .expect("the render stream opens");
        stream.play().expect("it starts");
        std::thread::sleep(std::time::Duration::from_secs_f64(secs));
        drop(stream);

        let mut raw = Vec::new();
        capture.ring().drain_into(&mut raw);
        let dropped = capture.dropped();
        capture.stop();
        let side: Vec<f32> = raw.iter().step_by(heard_ch.max(1)).copied().collect();
        (side, heard_sr, dropped)
    }

    /// **The capture runs against a real speaker, and keeps up with it.**
    ///
    /// Makes no sound: the render stream it opens writes zeroes. What it
    /// proves is everything except the samples' content — that cpal opens the
    /// output endpoint as an input, that the WASAPI loopback flag goes on,
    /// that buffers arrive at the device's own rate for as long as something
    /// is rendering, and that the ring keeps up with them without dropping.
    ///
    /// It needs a real sound card, so it is behind an environment variable
    /// and CI never sets it:
    ///
    /// ```sh
    /// YAMES_TEST_LOOPBACK=1 node scripts/rust-test.mjs --lib \
    ///   --no-default-features -- the_capture_keeps_up --nocapture
    /// ```
    ///
    /// The silent render stream is not only a trick for a quiet room. It is
    /// the thing that makes the capture deliver at all: a loopback endpoint
    /// with nothing playing into it hands over nothing rather than silence,
    /// and in the app it is Yames' own output stream that fills that role.
    /// This test is therefore the app's arrangement in miniature.
    #[cfg(any(target_os = "windows", target_os = "linux"))]
    #[test]
    fn the_capture_keeps_up_with_a_real_speaker() {
        const SECS: f64 = 1.0;
        if std::env::var("YAMES_TEST_LOOPBACK").is_err() {
            eprintln!("skipping: set YAMES_TEST_LOOPBACK=1 to run this against a real speaker");
            return;
        }
        let (side, sr, dropped) = play_and_listen(0.0, 997.0, SECS);
        eprintln!("heard {} frames at {sr} Hz, {dropped} dropped", side.len());
        assert_eq!(dropped, 0, "the ring could not keep up with the endpoint");
        let want = (sr as f64 * SECS) as usize;
        assert!(
            side.len() > want * 3 / 4,
            "a second of rendering should leave about {want} frames in the ring, got {}",
            side.len()
        );
    }

    /// **The proof that what it records is what the computer played.**
    ///
    /// This one makes a sound, so it is behind its own environment variable
    /// and CI never sets it:
    ///
    /// ```sh
    /// YAMES_TEST_LOOPBACK_SOUND=1 node scripts/rust-test.mjs --lib \
    ///   --no-default-features -- the_capture_hears_a_tone --nocapture
    /// ```
    ///
    /// **The tone is a whisper on purpose** — [`TONE_AMPLITUDE`] is about
    /// seventy decibels under full scale, inaudible at any listening volume —
    /// and it lasts one second. Neither is a compromise: one bin of a DFT
    /// over a second of audio has enough processing gain that a tone this
    /// quiet stands far above the neighbouring bin, and a louder or longer
    /// one would prove nothing more.
    ///
    /// **It cannot run on a machine whose speakers are muted**, and on this
    /// Realtek endpoint that is not a technicality: the master volume and the
    /// mute are applied BEFORE the loopback tap, so a muted machine captures
    /// exact zeroes however loud the tone is. That is worth knowing beyond
    /// the test — it is why the app has a "listen for a moment and show the
    /// level" check rather than trusting that a take will have something in
    /// it, and the failure message below says so.
    #[cfg(any(target_os = "windows", target_os = "linux"))]
    #[test]
    fn the_capture_hears_a_tone_this_computer_played() {
        /// Full scale is 1.0, so this is about -70 dBFS.
        const TONE_AMPLITUDE: f32 = 0.0003;
        const TONE_SECS: f64 = 1.0;
        /// The standard audio test tone: close to a kilohertz and a prime, so
        /// it never lands exactly on a bin boundary of anything.
        const TONE_HZ: f64 = 997.0;
        /// A frequency nothing played into, to measure the bin against.
        const QUIET_HZ: f64 = 3_313.0;

        if std::env::var("YAMES_TEST_LOOPBACK_SOUND").is_err() {
            eprintln!(
                "skipping: set YAMES_TEST_LOOPBACK_SOUND=1 to let this play a \
                 {TONE_SECS}s tone at about -70 dBFS through the speakers"
            );
            return;
        }
        // `YAMES_TEST_LOOPBACK_LEVEL` raises the tone, and exists for exactly
        // one situation: a machine whose speakers are MUTED, where a digital
        // signal of any size reaches the mixer and no sound reaches the room.
        // That is the only way to tell "the tap is after the mute" apart from
        // "the tone was too quiet" without unmuting somebody's speakers.
        // Never set it on a machine that can make a noise.
        let amplitude = std::env::var("YAMES_TEST_LOOPBACK_LEVEL")
            .ok()
            .and_then(|v| v.parse::<f32>().ok())
            .unwrap_or(TONE_AMPLITUDE);
        let (side, sr, dropped) = play_and_listen(amplitude, TONE_HZ, TONE_SECS);
        let peak = side.iter().fold(0f32, |a, b| a.max(b.abs()));
        let tone = bin_magnitude(&side, sr, TONE_HZ);
        let quiet = bin_magnitude(&side, sr, QUIET_HZ);
        eprintln!(
            "heard {} frames, peak {peak:.6}, {TONE_HZ} Hz bin {tone:.3e}, \
             {QUIET_HZ} Hz bin {quiet:.3e}, ratio {:.1}x",
            side.len(),
            tone / quiet.max(1e-12)
        );
        assert_eq!(dropped, 0, "the ring could not keep up with the endpoint");
        assert!(
            peak > 0.0,
            "the capture heard exact silence for a whole second. On Windows the \
             endpoint's MUTE and master volume are applied before the loopback tap, \
             so this is what a muted or zeroed speaker looks like — check those \
             before suspecting the capture"
        );
        assert!(
            tone > quiet * 10.0,
            "the tone that was played is not in what was captured: {TONE_HZ} Hz bin \
             {tone:.3e} against {quiet:.3e} at a frequency nothing played"
        );
    }

    #[test]
    fn a_mac_says_why_rather_than_offering_a_switch_that_records_nothing() {
        if cfg!(target_os = "macos") {
            assert!(!supported());
            assert!(open(None).is_err());
        } else {
            assert!(supported());
        }
    }
}
