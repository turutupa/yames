//! Practice Coach — LLM inference engine.
//!
//! When built with the `coach-llm` feature, loads a GGUF model from disk and
//! runs text generation for coaching comments, mini-reports, session summaries,
//! and chat Q&A. Without the feature, generates template-based responses.

use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};

static VARIANT_COUNTER: AtomicU32 = AtomicU32::new(0);

/// Thread-safe handle to the coach engine.
pub type SharedCoachEngine = Arc<Mutex<CoachEngine>>;

pub fn create_shared_engine() -> SharedCoachEngine {
    Arc::new(Mutex::new(CoachEngine::new()))
}

// ---------------------------------------------------------------------------
// Template-based engine (always available)
// ---------------------------------------------------------------------------

pub struct CoachEngine {
    /// Handle to the long-lived inference thread (ROADMAP §3). The model,
    /// its `LlamaContext` and the llama.cpp backend all live *on* that
    /// thread; this side only owns a job channel. That is what lets the
    /// context be hoisted and reused across calls — `LlamaContext` is not
    /// `Send`, but `SharedCoachEngine` is Tauri managed state and must be.
    #[cfg(feature = "coach-llm")]
    llm: Option<llm::LlmWorker>,
    /// True only when a real GGUF model is held in memory (on the worker
    /// thread). This used to be a plain `loaded` flag that `load_model`
    /// also set on the template path, so the UI reported "brain loaded"
    /// after the user downloaded weights that were never read. The flag
    /// now means exactly one thing: an LLM worker is resident.
    model_resident: bool,
    /// File name of the resident model, captured at load. `None` in
    /// template mode.
    model_name: Option<String>,
}

impl CoachEngine {
    pub fn new() -> Self {
        CoachEngine {
            #[cfg(feature = "coach-llm")]
            llm: None,
            model_resident: false,
            model_name: None,
        }
    }

    /// True when the engine answers from the phrase banks below rather
    /// than from a resident LLM. An explicit, first-class state — not
    /// something the caller infers from a failed load.
    pub fn template_mode(&self) -> bool {
        !self.model_resident
    }

    /// True only when a real model is resident and `generate` will
    /// actually run inference.
    pub fn is_loaded(&self) -> bool {
        !self.template_mode()
    }

    /// File name of the resident model, or `None` in template mode.
    pub fn model_name(&self) -> Option<&str> {
        self.model_name.as_deref()
    }
}

/// Whether this binary was compiled with the LLM backend at all.
///
/// A `false` here is not a user error and not a missing download — the
/// build simply cannot run a model, and the UI must say so rather than
/// inviting the user to fetch gigabytes of weights it will never read.
pub fn llm_compiled() -> bool {
    cfg!(feature = "coach-llm")
}

/// Which llama.cpp backend this build was compiled against.
///
/// `"none"` when the LLM isn't compiled in at all. Note that this is a
/// *compile-time* answer: llama.cpp falls back to CPU at runtime when
/// no usable GPU or driver is present, so a `"vulkan"` build may still
/// be executing on the CPU.
pub fn backend_name() -> &'static str {
    #[cfg(feature = "coach-llm")]
    {
        llm::BACKEND
    }
    #[cfg(not(feature = "coach-llm"))]
    {
        "none"
    }
}

/// System prompt that constrains the coach's behavior.
/// Only referenced when the `coach-llm` feature is enabled (the
/// inner `llm` module reaches for `super::SYSTEM_PROMPT` when building
/// the prompt).  Tagged `dead_code`-allowed on the no-LLM path so the
/// default-features build stays warning-clean.
#[cfg_attr(not(feature = "coach-llm"), allow(dead_code))]
pub const SYSTEM_PROMPT: &str = r#"You are a practice coach for a metronome app. You help musicians improve their timing and rhythm.

Rules:
- Keep responses concise (1-3 sentences max)
- Only discuss timing, rhythm, practice, and the session data you're given
- Be encouraging but honest about areas to improve
- Never make up data — only reference metrics provided to you
- Use natural, conversational language like a supportive instructor
- When commenting on timing: "early" means ahead of the beat, "late" means behind
- Reference specific beats or patterns when the data supports it"#;

/// Load the GGUF model from the brain directory.
///
/// Returns `true` only when a real model is now resident. The template
/// engine needs no loading at all — it is the fallback `generate` takes
/// whenever no model is held — so the no-feature path returns `false`.
/// It used to return `true` here to "activate template mode", which
/// made `is_coach_loaded` report a brain that did not exist and led the
/// frontend to route rephrases, chat and adaptive-drill decisions at an
/// LLM that was never compiled in.
pub fn load_model(engine: &mut CoachEngine, model_path: &std::path::Path) -> Result<bool, String> {
    if !model_path.exists() {
        return Ok(false);
    }

    #[cfg(feature = "coach-llm")]
    {
        // Tear the previous worker down FIRST and wait for it to exit.
        // `LlamaBackend::init()` is a process-wide one-shot (it flips a
        // static `AtomicBool` and only `Drop` clears it), so spawning the
        // replacement before the incumbent thread has dropped its backend
        // fails the second load with `BackendAlreadyInitialized`. The
        // `Drop` impl on `LlmWorker` closes the job channel and joins.
        drop(engine.llm.take());
        engine.model_resident = false;
        engine.model_name = None;

        let llm = llm::LlmWorker::spawn(model_path)?;
        engine.llm = Some(llm);
        engine.model_resident = true;
        engine.model_name = model_path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned());
        return Ok(true);
    }

    #[cfg(not(feature = "coach-llm"))]
    {
        // No LLM in this build: the weights on disk cannot be read, so
        // stay in template mode and say so.
        let _ = model_path;
        engine.model_resident = false;
        engine.model_name = None;
        Ok(false)
    }
}

/// Generate a coaching comment from structured DSP data.
///
/// On the `coach-llm` path `engine.model` is the actual LLM handle.
/// On the default (no-LLM) path the engine carries no state but the
/// parameter is kept symmetric so callers don't have to feature-gate
/// the call site — the underscore prefix silences the unused-var
/// warning in that build.
#[cfg_attr(not(feature = "coach-llm"), allow(unused_variables))]
pub fn generate(engine: &CoachEngine, context: &str) -> Result<String, String> {
    #[cfg(feature = "coach-llm")]
    if let Some(ref worker) = engine.llm {
        return worker.generate(context, token_budget(context));
    }

    // Template-based fallback
    generate_template(context)
}

/// Per-call generation cap (ROADMAP §0.3 / T04).
///
/// A rephrase is a one-or-two-sentence paraphrase of a template the JS
/// side already rendered — 64 tokens is comfortably more than it can
/// legitimately need, and capping it is what keeps the rephrase path
/// inside the mid-session tip budget (AGENTS.md latency tiers) when the
/// model decides to be chatty. Chat answers, mini-reports and session
/// summaries get the full 256.
///
/// The classification mirrors `generate_template`'s markers so the LLM
/// and template paths agree on what kind of request they are looking at;
/// both are driven by prompt text the JS layer owns (`useSession.ts`,
/// `useSegmentCoach.ts`).
#[cfg_attr(not(feature = "coach-llm"), allow(dead_code))]
pub const REPHRASE_MAX_TOKENS: usize = 64;
#[cfg_attr(not(feature = "coach-llm"), allow(dead_code))]
pub const CHAT_MAX_TOKENS: usize = 256;

#[cfg_attr(not(feature = "coach-llm"), allow(dead_code))]
fn token_budget(context: &str) -> usize {
    let is_rephrase = context.contains("Rephrase this practice-coach");
    if is_rephrase {
        REPHRASE_MAX_TOKENS
    } else {
        CHAT_MAX_TOKENS
    }
}

/// Remove Qwen3 reasoning blocks from generated text.
///
/// We already ask for a non-thinking turn twice over (a `/no_think`
/// directive in the system message and an empty `<think></think>` block
/// prefilled into the assistant turn — see `llm::build_prompt`), but a
/// quantised 4B model under a temperature of 0.7 can still open one, and
/// a legacy or third-party GGUF may ignore the directive entirely. The
/// user must never see reasoning text, so strip it defensively:
///
///  * every complete `<think>…</think>` pair is removed;
///  * an unterminated `<think>` swallows the rest of the output (the
///    model ran out of budget mid-thought — there is no answer after it);
///  * a stray leading `</think>` (the prefill's closing tag echoed back)
///    drops everything up to and including it.
///
/// Returns the trimmed remainder, which may be empty — callers on the JS
/// side already treat an empty rephrase as "use the template".
#[cfg_attr(not(feature = "coach-llm"), allow(dead_code))]
fn strip_think(raw: &str) -> String {
    const OPEN: &str = "<think>";
    const CLOSE: &str = "</think>";

    let mut out = String::with_capacity(raw.len());
    let mut rest = raw;
    while let Some(open) = rest.find(OPEN) {
        out.push_str(&rest[..open]);
        let after = &rest[open + OPEN.len()..];
        match after.find(CLOSE) {
            Some(close) => rest = &after[close + CLOSE.len()..],
            // Unterminated block: everything from `<think>` onwards is
            // reasoning that never reached a conclusion. Drop it.
            None => {
                rest = "";
                break;
            }
        }
    }
    out.push_str(rest);

    // A bare closing tag can only be the echo of the prefilled block, so
    // whatever precedes it is reasoning too.
    if let Some(pos) = out.rfind(CLOSE) {
        out = out[pos + CLOSE.len()..].to_string();
    }
    out.trim().to_string()
}

/// Extract the trimmed value after a key prefix from the context string.
/// Searches all lines for the first one containing `key`, then returns
/// everything after the key text, left-trimmed of whitespace.
fn extract_str<'a>(context: &'a str, key: &str) -> Option<&'a str> {
    context
        .lines()
        .find(|l| l.trim_start().starts_with(key))
        .map(|l| l[l.find(key).unwrap() + key.len()..].trim())
}

/// Template-based generation — parses the structured context and produces a response.
fn generate_template(context: &str) -> Result<String, String> {
    // Parse key metrics from the context string
    let accuracy = extract_metric(context, "Accuracy:").unwrap_or(0.0);
    // `SignedDev:` is a dedicated parseable line added by the JS context
    // builder (miniReport.ts). The old "avg" key tried to extract from the
    // human-readable "Timing spread: avg ±8.1ms" line — but "±8.1ms" has a
    // ± prefix and "ms" suffix that defeat `parse::<f64>()`, so deviation
    // always resolved to 0.0 and the template always reported "right in the
    // pocket" regardless of actual timing. `SignedDev:` is plain digits only.
    let deviation = extract_metric(context, "SignedDev:")
        .unwrap_or_else(|| extract_metric(context, "avg").unwrap_or(0.0));
    // Hit completeness — what fraction of expected subdivision positions had
    // a matched onset. Low values (< 0.50) explain why a well-timed player
    // can still score in the 40s: they're playing phrases, not every slot.
    // Falls back to 1.0 (assume full coverage) if the field isn't present.
    let hit_completeness = extract_metric(context, "HitCompleteness:").unwrap_or(1.0);
    let streak = extract_int(context, "Longest clean streak:").unwrap_or(0);
    // The mini-report card shows a `ScoreRing` with the composite
    // four-component score adjacent to the coach text. Surfacing the
    // accuracy percent (`hits / (hits + miss)`) as the headline number
    // in the template caused user-visible confusion in v0.9 — the
    // circle would read "65" while the text said "Rough patch at 50%"
    // and the two metrics looked contradictory. We now lead with the
    // score so the text and the badge agree; accuracy still appears
    // but as a secondary detail.
    let score = extract_int(context, "Score:").unwrap_or(0);

    let is_summary = context.contains("ended their practice session");
    let is_chat = context.contains("User asks:");
    // The JS side sends greetings as a `"Rephrase this practice-coach
    // greeting..."` prompt with the rendered template embedded under
    // `Original: "..."`. Match on that stable phrase so we recognise
    // greetings regardless of whether the player has a preset, history,
    // or is on the cold path.
    let is_greeting = context.contains("practice-coach greeting");
    // Real-time tips also arrive as a `"Rephrase this practice-coach
    // observation..."` prompt with the gatekeeper-filled template
    // under `Original: "..."`. Without this branch the rephrase falls
    // through to `format_mini_report` — and since the rephrase prompt
    // carries neither `Score:` nor `Accuracy:` fields, both extracts
    // return 0 and the coach-tip lands as a hard-coded "Score 0 —
    // right in the pocket. Ease the tempo down…" no matter what the
    // gatekeeper actually said. We treat the template-fallback path
    // for rephrases the same way as greetings: return the Original
    // verbatim (the JS template is fully shippable without LLM help).
    let is_rephrase_observation = context.contains("Rephrase this practice-coach observation");

    if is_chat {
        // Extract the question
        let question = context
            .lines()
            .find(|l| l.starts_with("User asks:"))
            .map(|l| l.trim_start_matches("User asks:").trim())
            .unwrap_or("");

        return Ok(format_chat_response(question, accuracy, deviation));
    }

    if is_greeting {
        return Ok(format_greeting(context));
    }

    if is_rephrase_observation {
        return Ok(format_rephrase_observation(context));
    }

    if is_summary {
        return Ok(format_session_summary(accuracy, deviation, streak));
    }

    // Mini-report
    let timing_pattern = extract_str(context, "TimingPattern:").unwrap_or("solid");
    let coach_mode = extract_str(context, "CoachMode:").unwrap_or("default");

    // Detect noodling: the JS side embeds a free-play hint rather than a key.
    let is_noodling = context.contains("free-playing/noodling");

    let comment = if is_noodling {
        pick(NOODLING).to_string()
    } else {
        format_mini_report(
            score,
            hit_completeness,
            timing_pattern,
            coach_mode,
            accuracy,
            streak,
        )
    };
    Ok(comment)
}

/// Template-fallback for the real-time rephrase prompt.
///
/// The JS-side gatekeeper has already filled a scenario-specific
/// template (e.g. "{recentAccuracyPct}% — your kick is drifting.
/// Lock the right foot to the click before the snare.") and embedded
/// it under `Original: "..."`. Without an LLM we can't actually
/// paraphrase, but the template is fully self-sufficient — return it
/// verbatim so the coach voices the gatekeeper's intent rather than a
/// generic mini-report placeholder.
///
/// Falls back to a short defensive opener if the Original block is
/// missing (shouldn't happen — `buildRephrasePrompt` always emits one).
fn format_rephrase_observation(context: &str) -> String {
    if let Some(original) = extract_original_quote(context) {
        return original;
    }
    "Keep going — locked in on the click.".to_string()
}

/// Render a fallback greeting when the LLM rephrase isn't available.
///
/// The JS side already produced a context-aware, history-aware greeting
/// (preset name, last score, target, downtrend handling, etc.) and
/// embeds it in the rephrase prompt as `Original: "..."`. Without an
/// LLM we can't actually rephrase, but the JS template is fully shippable
/// on its own — return it verbatim so the user sees the same warm,
/// specific message they'd get from the LLM.
///
/// If we can't find an `Original: "..."` block we fall through to a
/// short, friendly default rather than the prior "Free practice — play
/// when you're ready..." which felt too cold.
fn format_greeting(context: &str) -> String {
    if let Some(original) = extract_original_quote(context) {
        return original;
    }
    // No Original block — emit a warm, generic opener. This branch
    // shouldn't normally fire (the JS rephrase prompt always includes
    // Original) but is defensive against future prompt-format drift.
    "Hey — ready when you are. Hit play and I'll start picking up your timing.".to_string()
}

/// Extract the text inside the first `Original: "..."` block of the
/// rephrase prompt. Returns None if the marker isn't present.
fn extract_original_quote(context: &str) -> Option<String> {
    let start = context.find("Original: \"")?;
    let rest = &context[start + "Original: \"".len()..];
    let end = rest.find('"')?;
    Some(rest[..end].to_string())
}

// ---------------------------------------------------------------------------
// Phrase banks — 5 variants per scenario, picked via VARIANT_COUNTER.
// Language rules: no IC/GA/HC/onset/grid-alignment/mean-deviation/interval-consistency.
// Default mode: no millisecond numbers. Pro mode: can say "about 15ms early", etc.
// ---------------------------------------------------------------------------

const GREAT_DEFAULT: &[&str] = &[
    "Really locked in — your timing is right there.",
    "Solid feel, keep riding that groove.",
    "Your timing is sitting right where it should be.",
    "Clean rhythm — that's the pocket.",
    "Locked in tight — great work.",
];
const GREAT_PRO: &[&str] = &[
    "Tight beat placement and even note spacing — clean all-round.",
    "Beat placement solid, spacing consistent — push the tempo when you're ready.",
    "All timing components clean — good session.",
    "Note spacing and placement both dialled in.",
    "Timing is locked — consider bumping the tempo.",
];

const GOOD_STEADY_DEFAULT: &[&str] = &[
    "Nice and steady — good consistent tempo.",
    "Keeping it together — solid timing through the segment.",
    "Tempo is holding well.",
    "Good rhythm feel — consistent pulse.",
    "Steady timing — you're building a solid foundation.",
];
const GOOD_STEADY_PRO: &[&str] = &[
    "Solid beat placement, spacing mostly consistent — push the tempo or sharpen the attack.",
    "Good consistency — a few positions drift but the center holds.",
    "Timing center is on, spacing is reliable.",
    "Placement and spacing solid — room to push harder.",
    "Consistent feel — timing foundation is there.",
];

const RUSHING_DEFAULT: &[&str] = &[
    "You're leaning into the beat a little — try letting it come to you.",
    "Arriving a touch early — sit back and let the pulse breathe.",
    "The tempo is pushing forward — ease off the attack slightly.",
    "You're ahead of the beat — try staying back with it.",
    "A bit of a rush happening — slow your attack, not your tempo.",
];
const RUSHING_PRO: &[&str] = &[
    "Consistently landing early — directional early bias in the attack timing.",
    "Note attacks are arriving before the beat — ease the attack forward slightly.",
    "Early attack pattern — your notes are preceding the beat.",
    "Consistent early bias — the attack is rushing the pulse.",
    "Timing is shifted early — let the beat land first, then hit.",
];

const DRAGGING_DEFAULT: &[&str] = &[
    "Settling a bit behind the beat — try staying a little more forward.",
    "The tempo is dragging back — keep your attack crisp.",
    "You're lagging slightly — push the attack forward.",
    "Behind the beat — try keeping the energy moving forward.",
    "A bit of drag happening — sharpen the attack.",
];
const DRAGGING_PRO: &[&str] = &[
    "Consistently landing late — directional late bias in the attack timing.",
    "Note attacks are landing after the beat — sharpen the attack slightly.",
    "Late attack pattern — notes are trailing the beat.",
    "Consistent late bias — the attack is dragging the pulse.",
    "Timing is shifted late — push the attack to meet the beat.",
];

const OSCILLATING_DEFAULT: &[&str] = &[
    "The tempo is moving around — speeding up and slowing down.",
    "Note spacing is uneven — try keeping the gaps between notes equal.",
    "The pulse is wandering a bit — focus on steady spacing between notes.",
    "Rushing then dragging — try locking into one steady feel.",
    "Tempo consistency needs work — focus on equal note spacing.",
];
const OSCILLATING_PRO: &[&str] = &[
    "High timing variance despite a near-neutral average — the timing is genuinely unstable.",
    "Not a directional bias — the timing is alternating early and late.",
    "Tempo instability detected: spacing between notes is inconsistent.",
    "Rushing-dragging pattern — not a fixed offset, true variance in the timing.",
    "Timing variance is high — focus on keeping note spacing consistent.",
];

const LOW_SCORE_SOLID_DEFAULT: &[&str] = &[
    "Your timing center is good — focus on hitting more of the beats.",
    "Timing is in the right place, but you're missing some positions — fill those gaps.",
    "Good timing feel, but the rhythm needs more coverage — play more of the beats.",
    "The pulse is there but the rhythm is thin — try hitting more positions.",
    "Your timing is centered well — now work on density.",
];
const LOW_SCORE_SOLID_PRO: &[&str] = &[
    "Timing center and spacing are clean but beat coverage is low.",
    "Good placement accuracy but too many beat positions are empty.",
    "Note spacing is consistent but density is low — hit more of the beat positions.",
    "Timing fundamentals are there, coverage is the gap.",
    "Placement is accurate — focus on filling out more beat positions.",
];

const LOW_COVERAGE: &[&str] = &[
    "I'm only hearing some of your playing — check your input level or play a touch louder.",
    "Signal is coming in low — try playing with a bit more attack.",
    "Low detection rate — you may need to turn up your input gain.",
    "Only picking up part of your playing — check the input level in settings.",
    "Weak signal coming in — play louder or check your input gain.",
];

const NOODLING: &[&str] = &[
    "Good free feel — let the ideas flow.",
    "Nice exploration — when you're ready, bring it back to the pulse.",
    "Creative space — use it well.",
    "Good free play — follow the feel.",
    "Let it breathe — come back to the beat when you're ready.",
];

/// Pick the next phrase from a bank, rotating via the global counter.
fn pick<'a>(bank: &[&'a str]) -> &'a str {
    bank[VARIANT_COUNTER.fetch_add(1, Ordering::Relaxed) as usize % bank.len()]
}

/// Score-first mini-report using mode-aware phrase banks.
///
/// Scenario cascade (in priority order):
///   accuracy < 60  → low_coverage (signal quality)
///   oscillating    → oscillating
///   rushing        → rushing
///   dragging       → dragging
///   score >= 85    → great
///   score >= 65    → good_steady
///   else           → low_score_solid_timing
fn format_mini_report(
    score: u32,
    hit_completeness: f64,
    timing_pattern: &str,
    coach_mode: &str,
    accuracy: f64,
    streak: u32,
) -> String {
    let _ = hit_completeness; // retained in signature for future use
    let _ = streak; // retained in signature for future use
    let is_pro = coach_mode == "pro";

    let phrase = if accuracy < 60.0 {
        pick(LOW_COVERAGE)
    } else if timing_pattern == "oscillating" {
        pick(if is_pro {
            OSCILLATING_PRO
        } else {
            OSCILLATING_DEFAULT
        })
    } else if timing_pattern == "rushing" {
        pick(if is_pro { RUSHING_PRO } else { RUSHING_DEFAULT })
    } else if timing_pattern == "dragging" {
        pick(if is_pro {
            DRAGGING_PRO
        } else {
            DRAGGING_DEFAULT
        })
    } else if score >= 85 {
        pick(if is_pro { GREAT_PRO } else { GREAT_DEFAULT })
    } else if score >= 65 {
        pick(if is_pro {
            GOOD_STEADY_PRO
        } else {
            GOOD_STEADY_DEFAULT
        })
    } else {
        // solid timing, low score → coverage issue
        pick(if is_pro {
            LOW_SCORE_SOLID_PRO
        } else {
            LOW_SCORE_SOLID_DEFAULT
        })
    };

    phrase.to_string()
}

fn format_session_summary(accuracy: f64, deviation: f64, streak: u32) -> String {
    let tendency = if deviation.abs() < 3.0 {
        "centered timing"
    } else if deviation < 0.0 {
        "a slight rush"
    } else {
        "a slight drag"
    };

    // v0.10: the low-accuracy branch used to open with "Tough
    // session…" which read as a verdict. This is a practice tool, not
    // an exam — and a low accuracy reading is often a detection-
    // sensitivity issue (under-counted onsets), not a "tough session."
    // Reframed all three branches to lead with what's worth carrying
    // forward instead of what fell short. The accuracy ladder still
    // dispatches on the same thresholds so the wording tracks reality.
    if accuracy >= 85.0 {
        format!(
            "Locked in — {accuracy:.0}% accuracy with {tendency}. \
             Best streak was {streak} beats. Try nudging the tempo up next time."
        )
    } else if accuracy >= 60.0 {
        format!(
            "Good session — {accuracy:.0}% accuracy with {tendency}. \
             Pick one passage that felt off and run it a few more times."
        )
    } else {
        format!(
            "Plenty to build on — {tendency} with a {streak}-beat best streak. \
             Try dropping the tempo a touch and locking in a clean bar."
        )
    }
}

fn format_chat_response(question: &str, accuracy: f64, deviation: f64) -> String {
    let q = question.to_lowercase();
    if q.contains("timing") || q.contains("how was") || q.contains("how did") {
        let timing = if deviation.abs() < 5.0 {
            "Your timing was solid — pretty centered on the beat."
        } else if deviation < 0.0 {
            "You were pushing slightly ahead of the beat on average."
        } else {
            "You were sitting slightly behind the beat on average."
        };
        format!("{timing} Overall accuracy was {accuracy:.0}%.")
    } else if q.contains("focus") || q.contains("improve") || q.contains("work on") {
        if deviation.abs() > 10.0 {
            "Focus on locking in with the click — your timing is drifting. Try a slower tempo and nail the pocket.".to_string()
        } else if accuracy < 80.0 {
            "Work on clean hits at this tempo before pushing faster. Accuracy first, speed second."
                .to_string()
        } else {
            "You're in good shape. Try pushing the tempo up 5 BPM and see if you can maintain this accuracy.".to_string()
        }
    } else {
        format!("Your session shows {accuracy:.0}% accuracy with an average deviation of {deviation:.1}ms. Keep at it!")
    }
}

fn extract_metric(text: &str, prefix: &str) -> Option<f64> {
    text.lines().find(|l| l.contains(prefix)).and_then(|l| {
        l.split_whitespace()
            .find_map(|w| w.trim_end_matches('%').parse::<f64>().ok())
    })
}

fn extract_int(text: &str, prefix: &str) -> Option<u32> {
    text.lines().find(|l| l.contains(prefix)).and_then(|l| {
        let after = l.split(prefix).nth(1)?;
        after.split_whitespace().next()?.parse::<u32>().ok()
    })
}

// NOTE: `format_mini_report_context`, `format_session_summary_context`,
// and `format_chat_context` used to live here as Rust-side formatters
// for the LLM prompt. The JS layer now owns prompt assembly in
// `src/hooks/useSession.ts` (`formatMiniReportContext`,
// `formatSessionContext`, the chat literal in `sendChat`) — keeping
// the formatting on the side that also owns gatekeeper context and
// narrative state means there is exactly one source of truth for
// "what goes into the LLM." Removed during the Step-4 house-cleaning
// pass after they sat dead since the Phase-5 refactor.

// ---------------------------------------------------------------------------
// LLM backend (only compiled with coach-llm feature)
// ---------------------------------------------------------------------------

#[cfg(feature = "coach-llm")]
mod llm {
    use std::path::{Path, PathBuf};
    use std::sync::mpsc::{channel, sync_channel, Receiver, Sender, SyncSender};

    use llama_cpp_2::context::params::LlamaContextParams;
    use llama_cpp_2::context::LlamaContext;
    use llama_cpp_2::llama_backend::LlamaBackend;
    use llama_cpp_2::llama_batch::LlamaBatch;
    use llama_cpp_2::model::params::LlamaModelParams;
    use llama_cpp_2::model::LlamaModel;
    use llama_cpp_2::sampling::LlamaSampler;

    /// ROADMAP §0.3: `n_ctx` 4096. Qwen3 trains at 32k but the coach's
    /// longest prompt (a session summary with narrative + history) is a
    /// few hundred tokens; 4096 leaves generous headroom while keeping
    /// the KV buffer — allocated once now, not per call — small.
    const CONTEXT_SIZE: u32 = 4096;

    /// Which llama.cpp backend this binary was compiled against. Reported in
    /// the load log so a bug report can say whether the GPU path was even
    /// available. (`coach-llm` alone is a CPU-only build.)
    pub const BACKEND: &str = if cfg!(feature = "coach-llm-metal") {
        "metal"
    } else if cfg!(feature = "coach-llm-vulkan") {
        "vulkan"
    } else {
        "cpu"
    };

    /// True when this build has a GPU backend linked in.
    const HAS_GPU_BACKEND: bool =
        cfg!(feature = "coach-llm-metal") || cfg!(feature = "coach-llm-vulkan");

    /// Layers to offload when a GPU backend is compiled in. `with_n_gpu_layers`
    /// takes a `u32` and saturates into `i32`, so `u32::MAX` lands on
    /// `i32::MAX` — llama.cpp's idiom for "all layers".
    const ALL_GPU_LAYERS: u32 = u32::MAX;

    /// How many layers to try to offload on this build, honouring the
    /// `YAMES_LLM_GPU_LAYERS` override.
    ///
    /// The override exists for two callers that must be able to force CPU
    /// inference on a GPU build: the audio-safety jitter probe (ROADMAP §0.5
    /// runs generation "CPU-only forced") and anyone debugging a driver.
    /// Setting it to `0` disables offload entirely.
    fn requested_gpu_layers() -> u32 {
        match std::env::var("YAMES_LLM_GPU_LAYERS") {
            Ok(raw) => raw.trim().parse::<u32>().unwrap_or_else(|_| {
                eprintln!("[coach] YAMES_LLM_GPU_LAYERS={raw:?} is not a number — ignoring");
                if HAS_GPU_BACKEND {
                    ALL_GPU_LAYERS
                } else {
                    0
                }
            }),
            // No GPU backend linked in means there is nothing to offload to;
            // asking for layers would only produce a confusing warning.
            Err(_) if !HAS_GPU_BACKEND => 0,
            Err(_) => ALL_GPU_LAYERS,
        }
    }

    /// Inference thread count (ROADMAP §3: `max(1, physical_cores - 2)`).
    ///
    /// `available_parallelism` reports *logical* CPUs and there is no portable
    /// physical-core source in std, so halve it as an SMT proxy — the rule's
    /// intent is to leave headroom for the audio callback and the UI, and
    /// over-reserving is the safe direction to err in.
    fn inference_threads() -> i32 {
        let logical = std::thread::available_parallelism()
            .map(std::num::NonZeroUsize::get)
            .unwrap_or(4);
        let physical = (logical / 2).max(1);
        physical.saturating_sub(2).max(1).min(i32::MAX as usize) as i32
    }

    fn load_model_file(
        backend: &LlamaBackend,
        path: &std::path::Path,
        n_gpu_layers: u32,
    ) -> Result<LlamaModel, String> {
        let params = LlamaModelParams::default().with_n_gpu_layers(n_gpu_layers);
        LlamaModel::load_from_file(backend, path, &params)
            .map_err(|e| format!("Failed to load model: {e}"))
    }

    /// Build the Qwen3 chat prompt.
    ///
    /// Hand-built ChatML rather than `LlamaModel::apply_chat_template`
    /// on purpose. llama.cpp's `llama_chat_apply_template` (which is what
    /// that method calls) is **not** a Jinja engine: it sniffs the GGUF's
    /// template string for known markers and, seeing `<|im_start|>`,
    /// renders generic ChatML. Every bit of Qwen3's template that we
    /// actually care about — the `enable_thinking` switch and the empty
    /// `<think>` block it emits when thinking is off — is silently
    /// dropped. Building the string ourselves is both cheaper and the
    /// only way to get the non-thinking turn.
    ///
    /// Thinking is disabled two ways, because either alone has been seen
    /// to leak on a Q4 quant:
    ///   1. `/no_think` in the system message — the documented Qwen3
    ///      soft switch;
    ///   2. an empty `<think></think>` block prefilled into the assistant
    ///      turn, which is exactly what the official template emits for
    ///      `enable_thinking=false`, so the model continues with content
    ///      instead of opening a reasoning block.
    /// `super::strip_think` cleans up anything that still gets through.
    ///
    /// The old prompt was Phi-3 style (`<|system|>` … `<|assistant|>`).
    /// Qwen3 has no such tokens, so they tokenised as literal text and
    /// showed up in the model's output as template artifacts.
    fn build_prompt(context: &str) -> String {
        format!(
            "<|im_start|>system\n{system}\n\n/no_think<|im_end|>\n\
             <|im_start|>user\n{context}<|im_end|>\n\
             <|im_start|>assistant\n<think>\n\n</think>\n\n",
            system = super::SYSTEM_PROMPT,
        )
    }

    // -----------------------------------------------------------------
    // Inference thread
    // -----------------------------------------------------------------

    /// A generation request. The reply carries the cleaned text and how
    /// many tokens were actually sampled — the count is what makes an
    /// honest tokens/second figure possible in `latency_bench`.
    struct Job {
        context: String,
        max_tokens: usize,
        reply: SyncSender<Result<(String, usize), String>>,
    }

    /// Handle to the coach's single, long-lived inference thread.
    ///
    /// ROADMAP §3 wants generation to run *below normal* priority so a
    /// multi-second CPU inference can never preempt the audio path. T01
    /// did that per call, on whichever tokio `spawn_blocking` worker
    /// picked the job up, and restored the priority afterwards. That is
    /// wrong on Linux: an unprivileged thread cannot lower its nice value
    /// and then raise it again (`setpriority` back down is EPERM), so the
    /// restore silently failed and every tokio blocking thread that ever
    /// ran a generation stayed demoted for the life of the process —
    /// including the ones that later ran TTS synthesis and device
    /// enumeration.
    ///
    /// One dedicated thread, demoted exactly once at spawn and never
    /// restored, removes the whole problem: nothing else runs on it, so
    /// there is nothing to restore. It also serialises generations
    /// (llama.cpp contexts are single-writer anyway) and — the reason
    /// this task exists — lets the `LlamaContext` and its KV buffer be
    /// created once and reused, instead of being rebuilt per call.
    pub struct LlmWorker {
        /// `Option` only so `Drop` can close the channel before joining.
        jobs: Option<Sender<Job>>,
        handle: Option<std::thread::JoinHandle<()>>,
    }

    impl LlmWorker {
        /// Spawn the thread and block until the model has finished
        /// loading (or failed). Callers already treat `load_model` as a
        /// slow, fallible operation.
        pub fn spawn(path: &Path) -> Result<Self, String> {
            let (job_tx, job_rx) = channel::<Job>();
            let (ready_tx, ready_rx) = sync_channel::<Result<(), String>>(1);
            let owned = path.to_path_buf();

            let handle = std::thread::Builder::new()
                .name("yames-coach-llm".to_string())
                .spawn(move || run(owned, ready_tx, job_rx))
                .map_err(|e| format!("Failed to spawn inference thread: {e}"))?;

            match ready_rx.recv() {
                Ok(Ok(())) => Ok(LlmWorker {
                    jobs: Some(job_tx),
                    handle: Some(handle),
                }),
                Ok(Err(e)) => {
                    let _ = handle.join();
                    Err(e)
                }
                Err(_) => {
                    let _ = handle.join();
                    Err("inference thread exited before reporting load status".to_string())
                }
            }
        }

        pub fn generate(&self, context: &str, max_tokens: usize) -> Result<String, String> {
            self.generate_measured(context, max_tokens)
                .map(|(text, _tokens)| text)
        }

        /// As `generate`, but also reports the sampled token count.
        pub fn generate_measured(
            &self,
            context: &str,
            max_tokens: usize,
        ) -> Result<(String, usize), String> {
            let (reply_tx, reply_rx) = sync_channel::<Result<(String, usize), String>>(1);
            let jobs = self
                .jobs
                .as_ref()
                .ok_or_else(|| "inference thread is shutting down".to_string())?;
            jobs.send(Job {
                context: context.to_string(),
                max_tokens,
                reply: reply_tx,
            })
            .map_err(|_| "inference thread is gone".to_string())?;
            reply_rx
                .recv()
                .map_err(|_| "inference thread died mid-generation".to_string())?
        }
    }

    impl Drop for LlmWorker {
        fn drop(&mut self) {
            // Closing the job channel is what ends the worker's loop, and
            // joining is what guarantees its `LlamaBackend` has been
            // dropped — `LlamaBackend::init()` is a process-wide one-shot,
            // so a replacement worker cannot start until this one is
            // fully gone (see `super::load_model`).
            drop(self.jobs.take());
            if let Some(handle) = self.handle.take() {
                let _ = handle.join();
            }
        }
    }

    /// Thread body: own the backend, the model, the context and the
    /// batch; serve jobs until the channel closes.
    fn run(path: PathBuf, ready: SyncSender<Result<(), String>>, jobs: Receiver<Job>) {
        // Lowered once, never restored — see `LlmWorker`.
        lower_current_thread_priority();

        let backend = match LlamaBackend::init() {
            Ok(b) => b,
            Err(e) => {
                let _ = ready.send(Err(format!("Failed to init llama backend: {e}")));
                return;
            }
        };

        let requested = requested_gpu_layers();
        let n_threads = inference_threads();
        eprintln!(
            "[coach] loading model (backend={BACKEND}, n_gpu_layers={requested}, n_threads={n_threads})"
        );

        // GPU first, always. A Vulkan/Metal build on a machine with no
        // usable device normally still loads — llama.cpp reports zero
        // offloadable devices and keeps every layer on the CPU — but a
        // broken driver can fail the load outright, so retry on the CPU
        // rather than leaving the user with a dead brain.
        let model = match load_model_file(&backend, &path, requested) {
            Ok(model) => model,
            Err(gpu_err) if requested != 0 => {
                eprintln!("[coach] GPU load failed ({gpu_err}) — retrying with n_gpu_layers = 0");
                match load_model_file(&backend, &path, 0) {
                    Ok(model) => model,
                    Err(e) => {
                        let _ = ready.send(Err(e));
                        return;
                    }
                }
            }
            Err(e) => {
                let _ = ready.send(Err(e));
                return;
            }
        };

        // The context — and the KV buffer behind it — is created ONCE
        // here and reused for every job. T01 measured Vulkan coming out
        // slower than CPU on a 0.6B model precisely because `generate`
        // rebuilt this per call, re-allocating a multi-hundred-MiB KV
        // buffer on the GPU each time. `n_batch` is raised to the full
        // context so a long prompt decodes in a single pass (the default
        // is 2048, below our `n_ctx`).
        let ctx_params = LlamaContextParams::default()
            .with_n_ctx(std::num::NonZero::new(CONTEXT_SIZE))
            .with_n_batch(CONTEXT_SIZE)
            .with_n_threads(n_threads)
            .with_n_threads_batch(n_threads);
        let mut ctx = match model.new_context(&backend, ctx_params) {
            Ok(c) => c,
            Err(e) => {
                let _ = ready.send(Err(format!("Context creation failed: {e}")));
                return;
            }
        };
        let mut batch = LlamaBatch::new(CONTEXT_SIZE as usize, 1);

        if ready.send(Ok(())).is_err() {
            // Nobody is waiting for us any more (the caller gave up);
            // tear down rather than sitting on a loaded model.
            return;
        }

        while let Ok(job) = jobs.recv() {
            let out = infer(&model, &mut ctx, &mut batch, &job.context, job.max_tokens);
            let _ = job.reply.send(out);
        }
    }

    /// One generation against the resident context.
    fn infer(
        model: &LlamaModel,
        ctx: &mut LlamaContext<'_>,
        batch: &mut LlamaBatch,
        context: &str,
        max_tokens: usize,
    ) -> Result<(String, usize), String> {
        // Every call starts from an empty KV cache. The coach's prompts
        // do not share a prefix (each one embeds fresh session data), so
        // there is nothing to reuse — and leaving the previous
        // conversation resident would both poison the output and run the
        // window out of room after a handful of calls.
        //
        // `clear_kv_cache_seq(seq 0, whole range)` rather than
        // `clear_kv_cache()`: the latter is `llama_memory_clear(mem, true)`,
        // which also zeroes the KV *data* buffer — 576 MiB for Qwen3-4B at
        // n_ctx 4096, and on a Vulkan build that is a device-memory wipe
        // on every single generation. Dropping the cells is all we need;
        // stale bytes behind unreferenced cells are never read.
        //
        // A full-sequence removal "always succeeds" per the crate docs, so
        // the bool is not actionable; the error case is an out-of-range
        // sequence id, which `Some(0)` cannot be.
        if let Err(e) = ctx.clear_kv_cache_seq(Some(0), None, None) {
            return Err(format!("KV cache reset failed: {e}"));
        }

        let prompt = build_prompt(context);
        let tokens = model
            .str_to_token(&prompt, llama_cpp_2::model::AddBos::Always)
            .map_err(|e| format!("Tokenization failed: {e}"))?;

        if tokens.len() + max_tokens >= CONTEXT_SIZE as usize {
            return Err("Prompt too long for context window".into());
        }

        batch.clear();
        for (i, &token) in tokens.iter().enumerate() {
            let is_last = i == tokens.len() - 1;
            batch
                .add(token, i as i32, &[0], is_last)
                .map_err(|e| format!("Batch add failed: {e}"))?;
        }

        ctx.decode(batch)
            .map_err(|e| format!("Decode failed: {e}"))?;

        let mut output_tokens = Vec::new();
        // ROADMAP §0.3 keeps temp 0.7 / top-p 0.9. The sampler is rebuilt
        // per call so its RNG restarts from the same seed and identical
        // input yields identical output — the property the coach's
        // snapshot-style debugging depends on.
        let mut sampler = LlamaSampler::chain_simple([
            LlamaSampler::temp(0.7),
            LlamaSampler::top_p(0.9, 1),
            LlamaSampler::dist(42),
        ]);

        for _ in 0..max_tokens {
            let logits_id = batch.n_tokens() - 1;
            let token = sampler.sample(ctx, logits_id);

            if model.is_eog_token(token) {
                break;
            }

            output_tokens.push(token);

            batch.clear();
            batch
                .add(
                    token,
                    tokens.len() as i32 + output_tokens.len() as i32 - 1,
                    &[0],
                    true,
                )
                .map_err(|e| format!("Batch add failed: {e}"))?;

            ctx.decode(batch)
                .map_err(|e| format!("Decode failed: {e}"))?;
        }

        // Was `token_to_str(t, token::LlamaTokenAttr::all())` per token,
        // which does not compile against llama-cpp-2 0.1.146 — there is no
        // `LlamaTokenAttr`, and the second argument is a `model::Special`.
        // (The old call was never exercised: `coach-llm` could only build
        // on macOS, and nothing shipped with it enabled.)
        //
        // `token_to_piece` rather than the deprecated `tokens_to_str`:
        // the latter hardcodes an 8-byte piece buffer and does not retry,
        // so any longer piece fails the whole generation with
        // "Insufficient Buffer Space" — observed on a 128-token run.
        // One decoder across the whole output also means a UTF-8 sequence
        // split across two tokens survives instead of becoming replacement
        // characters. `false` = do not render control tokens as text.
        let mut decoder = encoding_rs::UTF_8.new_decoder();
        let mut result = String::new();
        for token in &output_tokens {
            let piece = model
                .token_to_piece(*token, &mut decoder, false, None)
                .map_err(|e| format!("Token decode failed: {e}"))?;
            result.push_str(&piece);
        }

        let cleaned = super::strip_think(&result);
        if cleaned.is_empty() && !result.trim().is_empty() {
            eprintln!(
                "[coach] generation was entirely reasoning ({} chars) — returning empty so the caller falls back to its template",
                result.trim().len(),
            );
        }
        Ok((cleaned, output_tokens.len()))
    }

    // -----------------------------------------------------------------
    // Thread priority (lowered once, at spawn — never restored)
    // -----------------------------------------------------------------

    #[cfg(windows)]
    fn lower_current_thread_priority() {
        use windows_sys::Win32::System::Threading::{
            GetCurrentThread, SetThreadPriority, THREAD_PRIORITY_BELOW_NORMAL,
        };
        // SAFETY: `GetCurrentThread` returns a pseudo-handle that needs no
        // close, and `SetThreadPriority` only mutates this thread's
        // scheduling class.
        let ok =
            unsafe { SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_BELOW_NORMAL) } != 0;
        if !ok {
            eprintln!("[coach] could not lower inference thread priority");
        }
    }

    #[cfg(unix)]
    fn lower_current_thread_priority() {
        // On macOS `PRIO_DARWIN_THREAD` scopes `setpriority` to the calling
        // thread. On Linux `PRIO_PROCESS` with `who == 0` is already
        // per-thread (a documented Linux divergence from POSIX), which is
        // exactly what we want here — a process-wide nice bump would also
        // slow the audio threads.
        #[cfg(target_os = "macos")]
        let which = libc::PRIO_DARWIN_THREAD;
        #[cfg(not(target_os = "macos"))]
        let which = libc::PRIO_PROCESS;

        // SAFETY: plain libc scheduling calls scoped to the current thread.
        // `getpriority` overloads -1 as both "nice -1" and "error"; the only
        // consequence of guessing wrong is nicing from the wrong base, so
        // treat it as 0.
        let previous = match unsafe { libc::getpriority(which, 0) } {
            -1 => 0,
            n => n,
        };
        if unsafe { libc::setpriority(which, 0, previous.saturating_add(5)) } != 0 {
            eprintln!("[coach] could not lower inference thread priority");
        }
    }

    #[cfg(not(any(windows, unix)))]
    fn lower_current_thread_priority() {}
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_engine_is_in_template_mode() {
        let engine = CoachEngine::new();
        assert!(engine.template_mode());
        assert!(!engine.is_loaded());
        assert_eq!(engine.model_name(), None);
    }

    #[test]
    fn load_model_returns_false_for_a_missing_file() {
        let mut engine = CoachEngine::new();
        let missing = std::path::Path::new("this-path-does-not-exist-model.bin");
        assert_eq!(load_model(&mut engine, missing), Ok(false));
        assert!(engine.template_mode());
    }

    /// The regression this whole change exists for: without the
    /// `coach-llm` feature, a model file that IS on disk must still
    /// report "not loaded", because nothing can read it.
    #[cfg(not(feature = "coach-llm"))]
    #[test]
    fn load_model_without_the_feature_reports_not_loaded() {
        let dir = std::env::temp_dir().join("yames-coach-load-test");
        std::fs::create_dir_all(&dir).expect("create temp dir");
        let path = dir.join("model.bin");
        std::fs::write(&path, b"not a real gguf").expect("write stub model");

        let mut engine = CoachEngine::new();
        assert_eq!(load_model(&mut engine, &path), Ok(false));
        assert!(engine.template_mode());
        assert!(!engine.is_loaded());
        assert_eq!(engine.model_name(), None);

        let _ = std::fs::remove_file(&path);
    }

    #[cfg(not(feature = "coach-llm"))]
    #[test]
    fn backend_and_compiled_flags_report_the_template_build() {
        assert!(!llm_compiled());
        assert_eq!(backend_name(), "none");
    }

    #[cfg(feature = "coach-llm")]
    #[test]
    fn backend_and_compiled_flags_report_an_llm_build() {
        assert!(llm_compiled());
        assert_ne!(backend_name(), "none");
    }

    /// Template generation is available regardless of `model_resident` —
    /// the frontend still routes chat through `coach_generate` in
    /// template mode and must get a real answer back.
    #[test]
    fn generate_falls_back_to_templates_with_no_resident_model() {
        let engine = CoachEngine::new();
        let out = generate(&engine, "User asks: how was my timing?\nAccuracy: 90%\n")
            .expect("template generation");
        assert!(!out.trim().is_empty());
    }
}

// ---------------------------------------------------------------------------
// LLM smoke test (coach-llm builds only)
// ---------------------------------------------------------------------------

/// End-to-end check that a real GGUF loads and produces tokens on this
/// build's backend. Skipped unless `YAMES_TEST_GGUF` points at a model file,
/// because the repo ships no weights and CI must stay able to run
/// `cargo test --features coach-llm --lib` without a multi-hundred-MB
/// download when it only wants the compile checked.
///
///   YAMES_TEST_GGUF=/path/to/tiny.gguf \
///     cargo test --manifest-path src-tauri/Cargo.toml --features coach-llm --lib
///
/// Set `YAMES_LLM_GPU_LAYERS=0` alongside it to force the CPU path on a
/// GPU build.
#[cfg(all(test, feature = "coach-llm"))]
mod llm_tests {
    use super::llm::LlmWorker;

    /// `LlamaBackend::init()` is a process-wide one-shot (only `Drop`
    /// clears the flag), so two tests each spawning a worker cannot
    /// overlap — the second would fail with `BackendAlreadyInitialized`.
    /// Serialise here rather than relying on `--test-threads=1`, which no
    /// CI invocation is going to remember to pass.
    static BACKEND_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

    #[test]
    fn loads_gguf_and_generates_tokens() {
        let _guard = BACKEND_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let Ok(raw) = std::env::var("YAMES_TEST_GGUF") else {
            eprintln!("YAMES_TEST_GGUF unset — skipping LLM generation test");
            return;
        };
        let path = std::path::PathBuf::from(&raw);
        assert!(path.exists(), "YAMES_TEST_GGUF does not exist: {raw}");

        // 8 tokens is the contract; `YAMES_TEST_GGUF_TOKENS` raises it only so
        // a throughput measurement has enough samples to mean anything.
        let max_tokens = std::env::var("YAMES_TEST_GGUF_TOKENS")
            .ok()
            .and_then(|v| v.trim().parse::<usize>().ok())
            .unwrap_or(8);

        let worker = LlmWorker::spawn(&path).expect("model load failed");

        let started = std::time::Instant::now();
        let out = worker
            .generate("Accuracy: 82\nSignedDev: -4.1\nSay hello.", max_tokens)
            .expect("generation failed");
        let elapsed = started.elapsed();

        eprintln!(
            "[llm test] backend={} max_tokens={max_tokens} elapsed={:.2}s output={out:?}",
            super::llm::BACKEND,
            elapsed.as_secs_f64(),
        );
        assert!(
            !out.trim().is_empty(),
            "model produced no text (backend={})",
            super::llm::BACKEND
        );
        // The whole point of T04's prompt work: a Qwen3 model must not
        // leak reasoning into the coach feed.
        assert!(
            !out.contains("<think>") && !out.contains("</think>"),
            "output still contains a reasoning block: {out:?}"
        );
    }

    /// The context is hoisted into the worker and reused, so the second
    /// call must not be poisoned by the first one's KV cache — and the
    /// worker must survive being driven repeatedly.
    #[test]
    fn reuses_the_context_across_calls() {
        let _guard = BACKEND_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let Ok(raw) = std::env::var("YAMES_TEST_GGUF") else {
            eprintln!("YAMES_TEST_GGUF unset — skipping context-reuse test");
            return;
        };
        let worker = LlmWorker::spawn(std::path::Path::new(&raw)).expect("model load failed");
        for i in 0..3 {
            let out = worker
                .generate("Accuracy: 91\nSignedDev: 2.0\nSay hello.", 8)
                .unwrap_or_else(|e| panic!("generation {i} failed: {e}"));
            assert!(!out.contains("<think>"), "call {i} leaked reasoning: {out:?}");
        }
    }

    /// ROADMAP §0.3's latency gate, as a runnable measurement rather than
    /// a number someone typed into a PR once.
    ///
    ///   YAMES_TEST_GGUF=/path/to/Qwen3-4B-Q4_K_M.gguf YAMES_LLM_BENCH=1 \
    ///     cargo test --manifest-path src-tauri/Cargo.toml \
    ///       --features coach-llm-vulkan --lib latency_bench -- --nocapture
    ///
    /// Opt-in because it costs minutes and needs multi-gigabyte weights.
    /// It asserts nothing: the gate is a judgement about the machine it
    /// ran on (a 4-core CPU-only laptop and an M1 have different budgets),
    /// so it prints and lets the reader decide.
    #[test]
    fn latency_bench() {
        if std::env::var("YAMES_LLM_BENCH").is_err() {
            eprintln!("YAMES_LLM_BENCH unset — skipping latency bench");
            return;
        }
        let _guard = BACKEND_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let raw = std::env::var("YAMES_TEST_GGUF").expect("YAMES_LLM_BENCH needs YAMES_TEST_GGUF");
        let worker = LlmWorker::spawn(std::path::Path::new(&raw)).expect("model load failed");

        // The two shapes that matter, in the wording the JS layer actually
        // sends (`useSession.ts`) so `token_budget` classifies them the
        // same way it will in production.
        let rephrase = "Rephrase this practice-coach observation for a player of guitar. \
             Preserve every number; keep it to one sentence.\n\n\
             Original: \"82% — your kick is drifting. Lock the right foot to the click.\"";
        let chat = "Current session data:\nScore: 74\nAccuracy: 88\nSignedDev: -6.2\n\
             Longest clean streak: 19\nInstrument: guitar\n\n\
             User asks: how was my timing?\nAnswer concisely based only on the data above.";

        for (label, prompt, budget, runs) in [
            ("rephrase", rephrase, super::REPHRASE_MAX_TOKENS, 10),
            ("chat", chat, super::CHAT_MAX_TOKENS, 5),
        ] {
            // One warm-up outside the sample: the first call after load
            // pays for cold weights (mmap page-in) and, on a GPU build,
            // shader pipeline creation. Users pay it once per launch; it
            // would otherwise dominate a 5-sample p95.
            let _ = worker.generate(prompt, budget);

            let mut times = Vec::with_capacity(runs);
            let mut tokens = 0usize;
            for _ in 0..runs {
                let started = std::time::Instant::now();
                let (out, n) = worker
                    .generate_measured(prompt, budget)
                    .expect("generation failed");
                times.push(started.elapsed().as_secs_f64());
                tokens += n;
                assert!(!out.contains("<think>"), "reasoning leaked: {out:?}");
            }
            let total: f64 = times.iter().sum();
            times.sort_by(f64::total_cmp);
            let p50 = times[times.len() / 2];
            // Nearest-rank p95 — with 5 or 10 samples this is the slowest
            // one, which is the honest answer at these sample counts.
            let p95 = times[((times.len() as f64 * 0.95).ceil() as usize - 1).min(times.len() - 1)];
            eprintln!(
                "[bench] backend={} kind={label} budget={budget} runs={runs} \
                 p50={p50:.3}s p95={p95:.3}s mean={:.3}s \
                 tok_per_s={:.1} tokens_per_call={}",
                super::llm::BACKEND,
                total / times.len() as f64,
                tokens as f64 / total,
                tokens / runs,
            );
        }
    }
}

// ---------------------------------------------------------------------------
// Prompt-hygiene tests (run on every build, LLM feature or not)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod prompt_tests {
    use super::{strip_think, token_budget, CHAT_MAX_TOKENS, REPHRASE_MAX_TOKENS};

    #[test]
    fn strips_a_complete_reasoning_block() {
        assert_eq!(
            strip_think("<think>\nthe user is dragging\n</think>\n\nYou're a touch behind."),
            "You're a touch behind."
        );
    }

    #[test]
    fn strips_the_empty_prefilled_block() {
        assert_eq!(strip_think("<think>\n\n</think>\n\nNice and steady."), "Nice and steady.");
    }

    #[test]
    fn strips_a_bare_closing_tag_echoed_from_the_prefill() {
        assert_eq!(strip_think("</think>\n\nLocked in."), "Locked in.");
    }

    #[test]
    fn drops_an_unterminated_block_entirely() {
        // Ran out of token budget mid-thought — there is no answer after
        // it, and shipping half a monologue would be worse than nothing.
        assert_eq!(strip_think("Sure. <think>let me consider the last 8 bars"), "Sure.");
    }

    #[test]
    fn leaves_clean_output_alone() {
        assert_eq!(strip_think("  Really locked in — keep going.  "), "Really locked in — keep going.");
    }

    #[test]
    fn rephrase_prompts_get_the_short_budget() {
        assert_eq!(
            token_budget("Rephrase this practice-coach observation...\nOriginal: \"Nice.\""),
            REPHRASE_MAX_TOKENS
        );
        assert_eq!(
            token_budget("Rephrase this practice-coach greeting for a player of guitar."),
            REPHRASE_MAX_TOKENS
        );
    }

    #[test]
    fn chat_and_reports_get_the_full_budget() {
        assert_eq!(token_budget("User asks: how was my timing?"), CHAT_MAX_TOKENS);
        assert_eq!(token_budget("Score: 72\nAccuracy: 88"), CHAT_MAX_TOKENS);
    }
}
