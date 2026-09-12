//! The Android output stream, opened straight at `oboe`.
//!
//! # Why this module exists
//!
//! Everywhere else Yames opens its output through cpal. On Android cpal's
//! backend *is* Oboe, so the obvious move is to let it. M00 measured what that
//! actually gives (`plans/tasks/mobile/M00-FINDINGS.md`, "cpal / Oboe
//! performance mode") and found two defects, both properties of cpal 0.15.3's
//! source rather than of any device:
//!
//! * **It never asks for the low-latency path.** `cpal-0.15.3/src/host/oboe/
//!   mod.rs` builds the stream with direction and format only — no
//!   `set_performance_mode`, no `set_sharing_mode`, no `set_usage`. Oboe's
//!   default is `PerformanceMode::None`, and the audio server confirmed it on
//!   the device: `flags=0x0`, neither `FAST` nor `RAW`.
//! * **It opens at 44 100 Hz on a 48 000 Hz device.** cpal picks the rate with
//!   `cmp_default_heuristics`, which explicitly prefers any range containing
//!   44 100 (`cpal-0.15.3/src/lib.rs:730`), and the Android backend never asks
//!   the device its native rate — it brute-forces a fixed candidate list. So
//!   every click is resampled, and a stream that needs resampling cannot have
//!   AAudio's fast path even if the performance mode were asked for.
//!
//! Neither hurts *tempo* — M00 counted exactly 120 ticks in 60 s — but both
//! hurt *how late the click is*, which is the thing a player feels.
//!
//! # What this module does differently
//!
//! It asks for what a metronome wants and nothing else: the device's own
//! sample rate, `PerformanceMode::LowLatency`, `SharingMode::Exclusive` with a
//! fall back to `Shared`, and `Usage::Media` so the click follows the media
//! volume slider (which is what M00 confirmed users get today, and the right
//! slider for this).
//!
//! # What it deliberately does *not* do
//!
//! It does not touch the click. The engine's callback body — the voice mixer,
//! the sample counter, the beat notifications, the probe hook — is one closure
//! in `engine.rs`, built once and handed to whichever stream this platform
//! opens. This module is stream *construction*; nothing here runs per beat and
//! nothing here allocates, locks or blocks once the stream is up.

use oboe::{
    AudioOutputCallback, AudioOutputStreamSafe, AudioStream, AudioStreamAsync, AudioStreamBase,
    AudioStreamBuilder, AudioStreamSafe, ContentType, DataCallbackResult, Output,
    PerformanceMode, SharingMode, Stereo, Usage,
};

/// What the device told us when we asked it to open a low-latency stream.
///
/// Read from a throwaway stream before the sound bank is decoded, because
/// `SoundBank::new` needs the rate and the callback has to be handed over at
/// build time — there is no point at which the engine could learn the rate
/// from the live stream and still decode at it without allocating on the
/// audio thread.
pub(crate) struct OutputFormat {
    pub sample_rate: u32,
    pub channels: usize,
    pub frames_per_burst: i32,
    /// Whether `SharingMode::Exclusive` was actually *granted* — read back
    /// from the stream rather than inferred from the open succeeding. AAudio
    /// does not refuse a sharing or performance mode it cannot give; it opens
    /// the stream anyway and downgrades, so the stream itself is the only
    /// honest source.
    pub exclusive: bool,
}

/// The engine's render closure, wearing the trait Oboe wants.
///
/// `FrameType = (f32, Stereo)` makes Oboe hand us `&mut [(f32, f32)]`. The
/// engine renders into a flat interleaved `&mut [f32]`, which is the same
/// bytes: `(f32, f32)` is two 4-byte floats with no padding (size 8, align 4),
/// and the engine writes the *same* sample to every channel of a frame, so
/// even the field order is immaterial. Reinterpreting is therefore a cast and
/// not a conversion — no copy, no per-frame branch, nothing added to the
/// audio thread.
pub(crate) struct RenderCallback<F> {
    render: F,
}

impl<F> AudioOutputCallback for RenderCallback<F>
where
    F: FnMut(&mut [f32]) + Send + 'static,
{
    type FrameType = (f32, Stereo);

    fn on_audio_ready(
        &mut self,
        _stream: &mut dyn AudioOutputStreamSafe,
        frames: &mut [(f32, f32)],
    ) -> DataCallbackResult {
        // SAFETY: see the type's doc comment — `[(f32, f32)]` and `[f32]` of
        // twice the length are the same allocation, same alignment, no padding.
        let interleaved =
            unsafe { std::slice::from_raw_parts_mut(frames.as_mut_ptr().cast::<f32>(), frames.len() * 2) };
        (self.render)(interleaved);
        DataCallbackResult::Continue
    }

    fn on_error_after_close(
        &mut self,
        _stream: &mut dyn AudioOutputStreamSafe,
        error: oboe::Error,
    ) {
        // Routing (headphones in or out) disconnects an exclusive stream. The
        // engine's own restart path owns recovery; this is here so the reason
        // is in logcat rather than nowhere.
        eprintln!("[yames][android] output stream closed by the system: {error:?}");
    }
}

/// A live Oboe output stream, with only the two verbs `engine.rs` needs.
///
/// Kept as a wrapper so the engine's audio thread never has to import Oboe's
/// traits — the cpal path and this one read the same on that side.
pub(crate) struct OutputStream<F>
where
    F: FnMut(&mut [f32]) + Send + 'static,
{
    stream: AudioStreamAsync<Output, RenderCallback<F>>,
}

impl<F> OutputStream<F>
where
    F: FnMut(&mut [f32]) + Send + 'static,
{
    pub fn play(&mut self) -> Result<(), String> {
        self.stream
            .start()
            .map_err(|e| format!("could not start the audio output stream: {e:?}"))
    }
}

/// Build a stream builder with every setting a metronome wants.
///
/// Factored out because the format probe and the real open must ask for the
/// *same* thing — a probe that asked for something easier would report a rate
/// the real stream never gets.
fn configured(
    sharing: SharingMode,
) -> AudioStreamBuilder<Output, oboe::Unspecified, oboe::Unspecified> {
    AudioStreamBuilder::default()
        .set_output()
        .set_performance_mode(PerformanceMode::LowLatency)
        .set_sharing_mode(sharing)
        // The click belongs on the media slider, not the alarm or
        // notification one. M00 confirmed `usage=USAGE_MEDIA` is what users
        // get today, so this is continuity rather than a change.
        .set_usage(Usage::Media)
        .set_content_type(ContentType::Music)
}

/// Open a throwaway stream to learn the device's rate and burst size, then
/// close it.
///
/// Asking costs one stream open. The alternative — `AudioManager`'s
/// `PROPERTY_OUTPUT_SAMPLE_RATE` through Oboe's `DefaultStreamValues` — is a
/// no-op on API 26 and up (`oboe-0.6.1/src/java_interface/stream_defaults.rs`
/// returns early above SDK 26 because "not necessary"), so on every device
/// Yames targets it would answer with a compiled-in default rather than the
/// truth.
pub(crate) fn probe_output_format() -> Result<OutputFormat, String> {
    let mut last_err = String::new();
    for (sharing, exclusive) in [(SharingMode::Exclusive, true), (SharingMode::Shared, false)] {
        match configured(sharing).set_format::<f32>().set_stereo().open_stream() {
            Ok(mut stream) => {
                let fmt = OutputFormat {
                    sample_rate: stream.get_sample_rate().max(0) as u32,
                    channels: 2,
                    frames_per_burst: stream.get_frames_per_burst(),
                    exclusive: exclusive
                        && matches!(stream.get_sharing_mode(), SharingMode::Exclusive),
                };
                let _ = stream.close();
                if fmt.sample_rate == 0 {
                    return Err("the audio device reported no sample rate".to_string());
                }
                return Ok(fmt);
            }
            Err(e) => last_err = format!("{e:?}"),
        }
    }
    Err(format!("no audio output device found: {last_err}"))
}

/// Open the real stream, with the engine's render closure inside it.
///
/// `fmt` must be what `probe_output_format` returned: the rate is set
/// explicitly so the stream cannot come up at a rate the sound bank was not
/// decoded at.
pub(crate) fn open_output_stream<F>(fmt: &OutputFormat, render: F) -> Result<OutputStream<F>, String>
where
    F: FnMut(&mut [f32]) + Send + 'static,
{
    let sharing = if fmt.exclusive {
        SharingMode::Exclusive
    } else {
        SharingMode::Shared
    };

    let mut stream = configured(sharing)
        .set_format::<f32>()
        .set_stereo()
        .set_sample_rate(fmt.sample_rate as i32)
        .set_callback(RenderCallback { render })
        .open_stream()
        .map_err(|e| format!("could not open the audio output stream: {e:?}"))?;

    let opened_rate = stream.get_sample_rate();
    if opened_rate != fmt.sample_rate as i32 {
        // Every click in the bank was decoded at `fmt.sample_rate`; playing it
        // out of a stream running at another rate is a detuned, wrong-tempo
        // metronome. Refuse rather than ship that.
        let _ = stream.close();
        return Err(format!(
            "the audio device opened at {opened_rate} Hz after reporting {} Hz",
            fmt.sample_rate
        ));
    }

    // Oboe's own guidance for the low-latency path: size the buffer at two
    // bursts. Below that the callback cannot miss a single deadline without
    // glitching; above it, latency the player feels. Failure is not fatal —
    // the stream keeps whatever the system gave it.
    let burst = stream.get_frames_per_burst();
    if burst > 0 {
        let _ = stream.set_buffer_size_in_frames(burst * 2);
    }

    // Asked *and* granted, because they differ and only the second is real.
    // AAudio does not refuse a mode it cannot give — it opens the stream and
    // downgrades — so a device that will not hand over the fast path says so
    // here and nowhere else.
    eprintln!(
        "[yames][android] oboe output: {} Hz, 2 ch, f32, api {:?}; asked \
         LowLatency/{:?}, got {:?}/{:?}; burst {} frames, buffer {} frames",
        opened_rate,
        stream.get_audio_api(),
        sharing,
        stream.get_performance_mode(),
        stream.get_sharing_mode(),
        burst,
        stream.get_buffer_size_in_frames(),
    );

    Ok(OutputStream { stream })
}
