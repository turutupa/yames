# Yames: High-Precision Metronome & AI Practice Coach

## Table of Contents
1.  [Executive TL;DR](#executive-tldr)
2.  [Comprehensive Evolutionary Master Plan (Guitar-First Architecture)](#comprehensive-evolutionary-master-plan-guitar-first-architecture)
3.  [Pillar 1: Local AI Prompt Routing & SQLite RAG Architecture](#pillar-1-local-ai-prompt-routing--sqlite-rag-architecture)
    *   [1. The Intent Classifier (ONNX BERT Router)](#1-the-intent-classifier-onnx-bert-router)
    *   [2. Local Database Schema (SQLite)](#2-local-database-schema-sqlite)
    *   [3. Context Assembly Pipeline](#3-context-assembly-pipeline)
4.  [Pillar 2: Guitar-First Cognitive Skill Acquisition Engine](#pillar-2-guitar-first-cognitive-skill-acquisition-engine)
    *   [1. Guitar-First Physical Focus & Latency Calibration](#1-guitar-first-physical-focus--latency-calibration)
    *   [2. Procedural Exercise Generation (Parametric & Constraint-Based)](#2-procedural-exercise-generation-parametric--constraint-based)
    *   [3. The 80/20 Deliberate Practice Loop & Spaced Repetition](#3-the-8020-deliberate-practice-loop--spaced-repetition)
    *   [4. Advanced Subdivision & Off-Grid Play Matching (Scenario Solutions)](#4-advanced-subdivision--off-grid-play-matching-scenario-solutions)
    *   [5. The Split-Brain Musical Evaluation Pipeline](#5-the-split-brain-musical-evaluation-pipeline-pitch-class-scales-and-sequence-alignment)
    *   [6. The Immediate Feedback Mirror (The Record-Listen Loop)](#6-the-immediate-feedback-mirror-the-record-listen-loop)
    *   [7. Dynamic Practice Routine State Machine (LLM-Planned, React-Executed)](#7-dynamic-practice-routine-state-machine-llm-planned-react-executed)
5.  [Pillar 3: "Super Local" GPU LLM Scaling & Resource Management](#pillar-3-super-local-gpu-llm-scaling--resource-management)
    *   [1. CPU Core Affinity & Real-Time Thread Pinning](#1-cpu-core-affinity--real-time-thread-pinning)
    *   [2. Unlocked Advanced Capabilities](#2-unlocked-advanced-capabilities)
6.  [Pillar 4: Dual-Model Tier UI/UX & Responsive Capability Feedback](#pillar-4-dual-model-tier-uiux--responsive-capability-feedback)
    *   [1. Dual-Model Capabilities Matrix](#1-dual-model-capabilities-matrix)
    *   [2. UI/UX Implementation Specifications](#2-uiux-implementation-specifications)
7.  [Technical Phase & Evolutionary Roadmap](#technical-phase--evolutionary-roadmap)

---

## Executive TL;DR
Yames 2.0 transforms a high-precision, sub-millisecond Rust metronome into an elite, non-intrusive AI Practice Coach using a **Guitar-First split-brain architecture**. By separating real-time digital signal processing (DSP) from local Large Language Model (LLM) text generation, the system provides high-fidelity, cognitive-heavy musical guidance with zero audio thread lag. 

### Core Architectural Pillars:
*   **Pillar 1 (Routing & DB)**: A local **ONNX BERT Router** classifies user prompts in under 15ms, routing simple commands directly to Tauri IPC while querying a local **SQLite Database** to inject historical telemetry only when needed (preventing context bloat).
*   **Pillar 2 (Cognitive DSP)**: A highly specialized guitar-first signal core that handles physical plucking transients, filters body resonance, and dynamically scores complex rhythms. It virtualizes subdivision grids, tracks shifting subdivisions in parallel, and leverages **Tatum-Level Quantization** to analyze expressive melodic phrasing. It includes immediate feedback via a **Record-Listen Loop** and **Automated Latency Calibration**.
*   **Pillar 3 (GPU Scaling)**: Isolates the high-priority Rust audio thread to a dedicated core using **CPU Core Affinity Pinning**, allowing high-parameter local models (7B/14B Qwen/Llama) to run on consumer GPUs (Metal/CUDA) without causing audio stuttering.
*   **Pillar 4 (Dual-Model UX)**: Implements standard (1.5B) and studio (7B+) model tiers, visual VRAM/RAM meters, and a **BPM-synced pulsing metronome loader** to keep players in a deep flow state.

---

---

## Comprehensive Evolutionary Master Plan (Guitar-First Architecture)

This master plan establishes a strategic technical and pedagogical blueprint to transform **Yames** from a high-precision diagnostic metronome into an elite, non-intrusive, and active AI practice coach. 

To ensure absolute precision, low-overhead performance, and deep pedagogical impact, this plan is structured as a **Guitar-First Architecture**. By targeting the physical constraints, frequency profiles, and mechanical drills of the electric and acoustic guitar first, we can perfect our real-time algorithms before modularly scaling Yames to support bass, drums, piano, and other instruments.

---

```
                                 +---------------------------------------+
                                 |          Tauri 2 / React UI           |
                                 +---------------------------------------+
                                    ^               |                 ^
                                    | IPC           | MIDI/Hotkeys    | Render
                                    v               v                 |
+---------------------+  cpal   +-----------------------+             |
| Physical Instrument |-------->|    Rust Audio Core    |             |
| (Guitar Hi-Z / Mic) |         | - cpal Stream         |-------------+
+---------------------+         | - aubio Transient Det | Real-time visual feedback
                                | - Locked Thread Loop  | (Latency Tier 1: <30ms)
                                +-----------------------+
                                    |               |
               Async event dispatch |               | DB Reads/Writes
                                    v               v
                        +----------------------+ +----------------------+
                        |   ONNX BERT Router   | |     SQLite DB        |
                        |  (Inference Thread)  | |  - Telemetry Logs    |
                        |  Latency Tier 2/3    | |  - Speed Ceilings    |
                        +----------------------+ +----------------------+
                                    |
                                    | If RAG/Synthesis requested
                                    v
                        +----------------------+
                        |   Qwen GGUF Engine   |
                        | (GPU/CPU Background) |
                        |  Latency Tier 4      |
                        +----------------------+
```

---

## Pillar 1: Local AI Prompt Routing & SQLite RAG Architecture

### 1. The Intent Classifier (ONNX BERT Router)
To prevent the high latency and resource bloat of calling a generative Large Language Model (LLM) for every interaction, Yames will employ a local **BERT or DistilBERT model** compiled to **ONNX Runtime (ORT)** running on a dedicated background thread in Tauri. 
*   **Latency Target**: <15ms classification window.
*   **Operation**: Every user query is routed through the classifier first to categorize the intent into one of three isolated processing paths:

```
                  +--------------------------------+
                  | User Prompt / MIDI Trigger/ IPC |
                  +--------------------------------+
                                  |
                                  v
                    +---------------------------+
                    | ONNX BERT Router (Tauri)  |
                    +---------------------------+
                      /           |           \
                     /            |            \
       CONVERSATIONAL             |             TRANSACTIONAL
       "How do I swing?"          |             "Speed drill 120"
             /                    |                     \
            v                     v                      v
    +---------------+     +---------------+      +---------------+
    | GGUF Llama.cpp|     |   SQL RAG     |      |   Direct IPC  |
    | (Direct Chat) |     |  \"My history\" |      | (Metronome FX)|
    +---------------+     +---------------+      +---------------+
```

*   **Path A: Conversational Flow**: Standard qualitative chat (e.g., *\"How do I play a triplet subdivision?\"*). The system bypasses database queries and telemetry context, passing only the user's prompt directly to the local Qwen model to minimize context-bloat and system RAM footprint.
*   **Path B: SQL RAG / Historical Flow**: RAG queries (e.g., *\"How has my alternate picking improved this week?\"*). The system intercepts the intent, dynamically constructs a SQL query, retrieves the structured historic data, and packages it into a tightly scoped, token-dense context template for Qwen.
*   **Path C: Transactional Flow**: Commands (e.g., *\"Set the metronome to 115 BPM and start a speed drill\"*). The system **completely bypasses the LLM**. The BERT classifier translates the intent to a structured enum and triggers the Tauri IPC bridge directly (e.g., `notifySettingsChange()`), ensuring instant, zero-latency execution.

### 2. Local Database Schema (SQLite)
To support long-term tracking, Yames will utilize a local, embedded SQLite database. This database stores raw timing logs and aggregates them into high-level progressive profiles.

```sql
-- Represents a single, continuous, active practice segment
CREATE TABLE practice_segments (
    id TEXT PRIMARY KEY,
    start_time INTEGER NOT NULL,            -- Unix epoch (ms)
    end_time INTEGER NOT NULL,              -- Unix epoch (ms)
    instrument TEXT NOT NULL,               -- e.g., 'guitar-electric'
    preset_id TEXT,                         -- NULL if free play
    start_bpm INTEGER NOT NULL,
    end_bpm INTEGER NOT NULL,
    total_onsets INTEGER NOT NULL,
    matched_onsets INTEGER NOT NULL,
    play_mode TEXT NOT NULL                  -- 'structured' or 'noodling'
);

-- Consolidated telemetry statistics per segment
CREATE TABLE segment_telemetry (
    segment_id TEXT PRIMARY KEY,
    timing_variance REAL NOT NULL,          -- Micro-timing variance (sigma^2)
    drift_bias REAL NOT NULL,               -- Systematic rushing/dragging tendency
    subdivision_consistency REAL NOT NULL,  -- Standard deviation across beat slices
    fatigue_decay_slope REAL NOT NULL,      -- Focus degradation trend (Mf)
    FOREIGN KEY(segment_id) REFERENCES practice_segments(id)
);

-- Spaced-repetition card and speed ceilings for exercises
CREATE TABLE exercise_ceilings (
    exercise_key TEXT PRIMARY KEY,          -- e.g., 'alternate-picking-spider'
    instrument TEXT NOT NULL,
    comfortable_bpm INTEGER NOT NULL,        -- Highest BPM where sigma <= 15ms
    peak_bpm INTEGER NOT NULL,               -- Absolute highest BPM reached
    last_practiced INTEGER NOT NULL,         -- Unix epoch (ms)
    next_review_due INTEGER NOT NULL,        -- Spaced-repetition calculated schedule
    ease_factor REAL DEFAULT 2.5
);
```

### 3. Context Assembly Pipeline
To feed Qwen only what is relevant, a lock-free contextual serializer in React (`useSession.ts`) converts the active `useEvaluation` state and the retrieved SQLite rows into clean, token-efficient formats.
*   **Data Minimization**: Instead of passing thousands of raw timing offsets, raw data is pre-aggregated on the Rust backend into the `segment_telemetry` metrics (Variance, Bias, Subdivision Consistency, and Fatigue Slope).
*   **Format**: Serialized as compact, human-readable structural contexts rather than JSON to reduce LLM attention-head overhead on smaller models (e.g., Qwen-2.5-3B).

---

## Pillar 2: Guitar-First Cognitive Skill Acquisition Engine

### 1. Guitar-First Physical Focus & Latency Calibration
*   **Acoustic Signal Processing**: Stringed instruments require physical transient-onset processing that differs from percussive or keyboard triggers. Electric guitars (connected via Hi-Z interface inputs or captured via laptop mics) feature initial, sharp plucking transients followed immediately by a complex physical body resonance trailing by 60–95ms.
*   **Adaptive Refractory Filtering**: To prevent "resonance double-counting" (where the body resonance registers as a second note, skewing the timing scores), the Rust engine's `onset.rs` will utilize an adaptive refractory multiplier of `0.75` (clamped to the instrument physics floor). This ensures that pick-attack transients are isolated cleanly while body decay resonances are systematically ignored.
*   **Low-Pass / High-Pass Conditioning**: The cpal input stream is run through a second-order Butterworth high-pass filter with a cutoff frequency set to **$f_c \approx 80\text{ Hz}$** (matching the fundamental frequency of the guitar's low E string) to filter out room rumbles, foot-tapping vibrations, and low-frequency HVAC noise.
*   **Automated Loopback Latency Calibration**: High-precision evaluation is entirely useless if the system scores a player against uncalibrated hardware delays (which can range from 10ms to over 80ms on standard OS audio drivers). Yames will implement an automated **hands-free calibration wizard**:
    *   The app plays a short, high-transient audio impulse (a 1ms digital click) through the speakers.
    *   The input cpal stream captures this impulse via the microphone.
    *   The system measures the exact delta between the output playback buffer timestamp and the input capture timestamp, determining the system's exact physical loopback latency.
    *   This loopback delay is saved to SQLite and automatically subtracted from all future physical $t_{\text{onset}}$ timestamps, ensuring timing analysis remains accurate down to the millisecond across any hardware interface.

### 2. Procedural Exercise Generation (Parametric & Constraint-Based)
Instead of bloating Yames with a massive, licensed catalog of copyrighted songs (like Yousician), Yames will use a **parametric, music-theory-based generator** written in pure Rust to synthesize physical guitar drills on the fly. 

To ensure drills remain physically playable, highly relevant to a user's skills, and deeply engaging, the generator operates under three strict mathematical and musical constraints:

#### A. Musicalizing the Drills via Scale Maps (The Engagement Secret)
To prevent the physical fatigue and mental boredom of straight chromatic spider walks (playing every fret, which sounds mechanical and robotic), the generator **overlays physical patterns onto musical scale bitmasks**:
*   **The Scale Bitmask**: A scale is represented as a 12-bit integer bitmask (e.g., A-Minor Pentatonic: `100101010010`, where each bit represents a semitone offset from the root).
*   **The Mapping Algorithm**: Instead of generating physical fret coordinates directly (e.g., frets `5-6-7-8`), the generator computes valid scale pitches starting from the active position. It maps the physical finger steps (1-2-3-4 permutations) *only* to the nearest valid scale intervals inside the bitmask.
*   **The Result**: The physical finger-coordination workout remains highly active and randomized, but the notes produced always sound like an organic, expressive musical lick or solo. The player trains raw mechanics while their ears hear real music.

#### B. Interval Permutations to Break Muscle Autopilot
Standard exercises quickly fall victim to cognitive adaptation—where the hand enters "autopilot," neutralizing deliberate practice. The generator constantly shuffles the physical finger vectors:
*   **Finger Order Shuffling**: Permutates standard order `[1, 2, 3, 4]` into active variants like `[1, 3, 2, 4]`, `[4, 2, 3, 1]`, or `[1, 4, 2, 3]`.
*   **Diagonal Positional Shifting**: Generates stepping paths that shift up a fret every time they cross a string (e.g., String 6 Fret 5, String 5 Fret 6, String 4 Fret 7), training multi-dimensional finger independence.

#### C. Constraint-Based Fretboard Mapping (Optimal Position Routing)
Unlike a piano where each note has a single key, a guitar features a "one-to-many" note mapping (a single pitch can live on multiple strings). To prevent the generator from outputting unplayable, extreme finger stretches, the backend uses a deterministic **fret constraint solver**:
1.  **Positional Box Framing**: Every exercise takes a position parameter (e.g., `position: 5` constraints the hand strictly to frets 5 through 8).
2.  **String Eligibility Equations**: The Rust core evaluates which strings can play each target pitch within that 4-fret frame, based on the instrument's open-string tuning pitches.
3.  **Optimal Pathing Routing**: The algorithm calculates the physical delta from the previously played note. It routes the notes to the closest adjacent string to maintain comfortable finger geometry, unless the preset explicitly demands a *string-skipping* or *pentatonic diagonal crossing* drill.

*   **Output**: These generated exercises are translated into raw metronome subdivisions, interactive floating tab notations on the React UI, or MIDI clock directives.

### 3. The 80/20 Deliberate Practice Loop & Spaced Repetition
*   **The Slower You Go, the Faster You Grow**: Implementing a dedicated \"Learning Mode\" that uses a relaxed timing envelope ($\pm 35\text{ms}$ accuracy window) to alleviate the frustration of robotic-precision scoring. 
*   **The 80/20 Stamina Rule**: To prevent physical fatigue and tendon strain, the coach tracks the user's continuous play duration. If the **Fatigue Decay Slope ($M_f$)** indicates timing degradation ($\sigma^2$ rising steadily over 5 minutes of continuous playing), the coach triggers an intervention, encouraging a 1-minute resting baseline before starting a new speed drill.
*   **Spaced-Repetition System (SRS)**: Using a SuperMemo-style algorithm (SM-2) adjusted for physical skills. If a player masters a spider-walk alternate picking drill at 120 BPM with professional stability ($\sigma < 15\text{ms}$), Yames recalculates the next review interval to 3 days later, keeping the player's mechanical technique active in long-term memory.

### 4. Advanced Subdivision & Off-Grid Play Matching (Scenario Solutions)
To ensure the Rust timing engine captures the full complexity of human performance—ranging from shifting rhythms to off-grid syncopations—the core matcher will be rebuilt to support three critical real-world guitar playing scenarios:

#### Scenario A: Playing 16th Notes over a Quarter-Note Metronome Beat (Off-Grid Virtualization)
*   **Current Failure Mode**: If the metronome click is set to Quarter Notes (subdivision = 1), the engine only registers `BeatTick` events on downbeats. The intermediate 16th-note plucks are treated as \"spurious\" onsets, corrupting the user's timing consistency score and triggering inaccurate \"noodling\" warnings.
*   **The Engineering Solution: High-Resolution Virtual Tactus Interpolation**:
    *   The Rust `TimingAnalyzer` will maintain an internal, high-resolution **Virtual grid at 24 ticks-per-beat** (the Least Common Multiple of 1, 2, 3, 4, and 6).
    *   This virtual grid operates continuously in the background, completely decoupled from the audible click track.
    *   When the metronome is running at 100 BPM with audible quarter notes, the analyzer internally registers timing slots for eighths, triplets, 16ths, and sextuplets. Onsets are matched against this virtual high-resolution grid, enabling Yames to score 16th notes with perfect sub-millisecond precision even when the metronome only clicks once per beat.

#### Scenario B: Rapid/Shifting Subdivision Patterns (Multi-Grid Bayesian Hypotheses)
*   **Current Failure Mode**: If a player transitions from a bar of 16th notes to a bar of 8th notes, or throws in triplets over a steady beat, the single rolling-window `RhythmInference` algorithm undergoes lock-collapse. During the \"refit\" latency window, legitimate notes are misclassified as misses or offsets.
*   **The Engineering Solution: Parallel Multi-Hypothesis Rhythmic Tracking**:
    *   Instead of attempting to lock the entire session onto a single static division, the analyzer will compute **parallel Bayesian probability models** across multiple grids simultaneously (Quarters, 8ths, Triplets, 16ths).
    *   For each incoming onset, the system calculates a distance metric across all active candidate grids.
    *   A **local per-beat density classifier** evaluates the clustering of note attacks within a single beat envelope. If onsets cluster near $1/3$ and $2/3$ phase boundaries, that specific beat is dynamically scored against a Triplet grid; if they align to $1/4$ boundaries, it is scored as a 16th grid, entirely removing transition latency.

#### Scenario C: Melodic Phrasing & Dynamic Subdivision Matching (Free-Form Melodic Playing over a Metronome Click)
*   **Current Failure Mode**: When a guitar player transitions from rigid, repetitive drills (like straight 16ths) to actual expressive melodic playing (e.g., practicing a lick or song segment where a single beat contains a dotted-eighth, a sixteenth, and then a quick cluster of sextuplet notes), the timing engine collapses. It expects a single, uniform locked grid and penalizes these varying note-lengths as \"spurious\" onsets, \"misses\", or high timing errors.
*   **The Engineering Solution: Tatum-Level Dynamic Quantization & Phrase Sequence Templates**:
    *   **Tatum-Level Quantization**: Instead of locking the scoring engine onto a single active subdivision (like eighths or sixteenths), the analyzer measures timing drift against the nearest cell of a high-resolution 32nd-note background grid (the \"Tatum\" or temporal atom). Every melodic attack, regardless of its duration or placement, is quantized to the nearest valid cell on this background grid. Drift is calculated as the precise offset from that *local* mathematical coordinate.
    *   **Phrase-Level Rhythmic Templates (Sequence Parsing)**: If a user is practicing a specific guitar lick or musical phrase, they can load it as a \"Rhythmic Template\" (a sequential array of note values, e.g., `[0.5, 0.25, 0.25, 1.0]` representing an eighth, two sixteenths, and a quarter). As the player plucks, the engine steps through the sequence in real-time, matching each physical transient to its corresponding expected node in the phrase template, ignoring intermediate rests.
    *   **Phrase-Wide \"Pocket\" and Micro-Phrasing Telemetry**: Rather than scoring each note on an absolute \"pass/fail\" basis (which ruins the feel of expressive music), the analyzer calculates **Phrase-Level Rubato & Swing Coefficients**. If the player naturally slides slightly behind the beat on note 1 but locks back onto the grid for note 4, the engine recognizes this as stylistic *phrasing* (playing \"laid-back\" in the pocket) and grades the groove consistency over the *entire phrase* rather than penalizing individual micro-deviations.

---

### 5. The Split-Brain Musical Evaluation Pipeline (Pitch-Class, Scales, and Sequence Alignment)
To evolve Yames from a pure timing metronome into a true musical phrase coach, the engine must separate musical feature extraction from natural language synthesis. The backend pipeline is structured as follows:

```
+------------------+     +-----------------------+     +--------------------------+
|  Real-Time Audio |---->|  YIN Pitch Detection  |---->|   Deterministic Parser   |
| (Rust cpal Loop) |     |  (Extracts MIDI F0)   |     | (Fretboard & Scale Map)  |
+------------------+     +-----------------------+     +--------------------------+
                                                                    |
                                                                    v
+------------------+     +-----------------------+     +--------------------------+
| Local LLM Qwen   |<----| Context Assembly Msg  |<----|  Sequence Align Matcher  |
|  (Speech-only)   |     | (Pre-packaged text)   |     | (Identifies misses/skips)|
+------------------+     +-----------------------+     +--------------------------+
```

#### A. Real-Time Note and Pitch Transcription (YIN & Basic-Pitch)
*   **Monophonic Pitch Tracking (YIN)**: For single-note exercises (scales, arpeggios, single-line licks), the Rust cpal thread runs a lightweight **YIN pitch-detection algorithm** [yames-evolution-roadmap-v8.md (Pillar 2, Section 5.A)]. YIN computes a normalized cumulative difference function on the audio buffer to extract the fundamental frequency ($F_0$) in under 5ms with minimal octave-doubling errors [Methodology, Section 17, 202].
*   **Polyphonic Transcription (Basic-Pitch ONNX / ORT)**: For chordal playing or complex multi-voice phrasing, the post-session thread invokes Spotify's **Basic-Pitch** neural network [AGENTS.md (Coaching Pipeline)]. To implement this, Yames will run the model locally using the **`ort`** (ONNX Runtime Rust bindings) crate [Yames Core Optimization and Pitch Detection (Pillar 2, Section 5.A)]. 
    *   *Reference Architectures*: We will utilize the **`w-ensink/basic_pitch`** Rust repository [Yames Core Optimization and Pitch Detection (Pillar 2, Section 5.A)] and the highly-optimized C++20 **`basicpitch.cpp`** library [Yames Core Optimization and Pitch Detection (Pillar 2, Section 5.A)] to guide our multi-head CNN prediction and MIDI note formatting logic [Yames Core Optimization and Pitch Detection (Pillar 2, Section 5.A)].
    *   *Binary Optimization*: Raw ONNX models can be heavy [Yames Core Optimization and Pitch Detection (Pillar 2, Section 5.A)]. Yames will convert the model to the space-saving **`.ort` optimized model format** and use compile-time operator trimming (via `ort-builder` scripts) to drastically prune the Tauri bundle binary footprint [Yames Core Optimization and Pitch Detection (Pillar 2, Section 5.A)].
    *   *Hybrid RTNeural Alternative*: Optionally explore the hybrid architecture of the popular open-source Audio-to-MIDI plugin **`NeuralNote`** [Yames Core Optimization and Pitch Detection (Pillar 2, Section 5.A)]—using the ultra-lightweight **`RTNeural`** library (extended with 2D Convolution) for the CNN spectrogram encoder portion and ONNX Runtime solely for the feature preprocessing layers (Constant-Q Transform and Harmonic Stacking) [Yames Core Optimization and Pitch Detection (Pillar 2, Section 5.A)].
*   **MIDI Mapping**: All captured pitch frequencies are immediately converted to equal-temperament MIDI note numbers (e.g., $196\text{ Hz} \rightarrow \text{G3}$) [yames-evolution-roadmap-v8.md (Pillar 2, Section 5.A)].

#### B. Scale and Mode Parsing (Deterministic Lookups)
*   **Pitch-Class Histograms**: At the end of a practice segment, the system aggregates all played MIDI notes into a unique pitch-class set (e.g., `[G, Bb, C, D, F]`).
*   **Zero-LLM Scale Identification**: The Rust backend runs a deterministic bitmask comparison against a static lookup table of scales. If the played notes align with a minor pentatonic intervals formula, the system immediately identifies it as **G-Minor Pentatonic** without invoking any LLM resource.

#### C. Sequence Alignment & Error Mapping (Sequence Matching)
*   **Target vs. Played Note Vectors**: When practicing a specific preset exercise, the target notes are loaded as a structured vector.
*   **Dynamic Time Warping (DTW) & Sequence Matching**: The system runs a deterministic sequence-alignment algorithm (such as Needleman-Wunsch) to align the user's played note vector against the target vector. 
*   **Automated Error Flagging**: The alignment math identifies precise deviations:
    *   *Omitted Notes*: Notes in the target vector that have no aligned matches (e.g., "Missed string-skip on C4").
    *   *Accidental Notes*: Played notes that do not exist in the target template.
    *   *Phrasing Drift*: Precise millisecond deviation of note starts relative to the localized virtual grid.

#### D. Non-Bloated Context Assembly
*   Once calculated, these pre-chewed musical facts are compiled into a compact, token-efficient XML block:
    ```xml
    <session_telemetry>
        <scale_detected>G-Minor Pentatonic</scale_detected>
        <accuracy_percent>88%</accuracy_percent>
        <missed_jumps>2 string-skips</missed_jumps>
        <timing_variance>12ms dragging bias on off-beats</timing_variance>
    </session_telemetry>
    ```
*   This structured telemetry is dispatched to Qwen. Because the LLM receives clean, summarized facts rather than raw sample coordinates, it can run on the ultra-lightweight Standard 1.5B/3B tier while generating highly accurate, supportive, and musically articulate feedback.



### 6. The Immediate Feedback Mirror (The Record-Listen Loop)
Musicians naturally overestimate their own timing accuracy by up to 15-20% due to "motor-masking"—the physical, sensory act of plucking a string temporarily masks the brain's acoustic focus, making it extremely difficult to hear micro-timing errors in real-time. To bypass this neurological filter, Yames will introduce the **Immediate Feedback Mirror**:
*   **Background Audio Ring-Buffer**: The Rust audio thread will maintain a lightweight, lock-free circular ring-buffer that continuously records the raw input signal from the guitar for the last 10 seconds.
*   **Instant Mixed Playback**: The player can bind a global hotkey or a MIDI footswitch to "Instant Playback". When triggered:
    *   Metronome playback immediately pauses.
    *   The system instantly plays back the raw 10-second recording **superimposed and phase-aligned over the corresponding metronome click track**.
    *   This provides the player with an immediate, objective, and raw acoustic comparison of their exact pocket placement, enabling rapid sensory adjustments before mistakes are internalized into muscle memory.

---

### 7. Dynamic Practice Routine State Machine (LLM-Planned, React-Executed)

To transform Yames into an active, adaptive personal instructor, the platform implements a **decoupled Planner-Executor architecture**. Rather than running expensive generative Large Language Model (LLM) inference continuously during a play session (which risks CPU spikes, audio buffer underruns, and physical click drops), the system splits the labor: the local AI coach acts as a high-level **Routine Planner**, and the React frontend acts as a high-precision, low-overhead **State Machine Executor**.

#### A. The Decoupled Planner-Executor Paradigm
1.  **The Planner (LLM)**: When a player requests a structured session (e.g., *"I have 15 minutes to warm up"*, *"Give me a 10-minute alternate picking endurance drill"*, or *"Design a 20-minute scale and theory routing"*), the local Qwen model processes the query. It analyzes the user's historical ceilings and physical weaknesses in SQLite and constructs a multi-stage structured practicing plan.
2.  **The Executor (React State Machine)**: The LLM calls a single schema-defined tool (`load_timed_routine`) and hands over a structured JSON array of practice instructions. Qwen then returns to a dormant, zero-resource background state. The React frontend assumes complete control, managing the countdown timers, updating the metronome tempos, and swapping out procedural exercises with sub-millisecond transition times.

#### B. The Generic, Highly Extensible Routine Schema
To ensure Yames can generate any style, length, or focus of practicing session (warm-ups, stamina drills, speed ramping, ear training intervals, or theory visualizations), the routine engine uses a highly flexible and parameter-rich JSON representation:

```json
{
  "routine_id": "string",
  "name": "string",
  "description": "string",
  "steps": [
    {
      "step_index": number,
      "name": "string",
      "duration_seconds": number,
      "bpm": number,
      "subdivision": number,
      "coaching_mode": "strict" | "learning",
      "visual_config": {
        "hud_glow_color": "string",        // Peripheral visual cues (e.g., "#00FFFF")
        "metronome_sound": "string"       // "woodblock", "beep", "cowbell"
      },
      "generator_params": {
        "focus_area": "string",           // "linear-spider-walk", "diagonal-pentatonic", "string-skipping"
        "scale": "string",                // "A-Minor-Pentatonic", "G-Dorian", "Chromatic"
        "root": "string",                 // "A", "G", "C"
        "position_box": {
          "min_fret": number,
          "max_fret": number
        },
        "finger_pattern": [number]        // e.g., [1, 3, 2, 4] for permutation variations
      }
    }
  ]
}
```

#### C. Real-Time Seamless Transitions (Zero-Stutter Audio)
During a multi-stage routine, the metronome must transition between tempos (BPMs) and subdivisions without interrupting the player's physical flow or causing audio clicks/jitters.
*   **Active Step Tracking**: The React `useRoutine.ts` state machine tracks the active step index and starts a high-resolution window timer.
*   **Decoupled IPC Tempo Swapping**: When a step timer expires, the frontend dispatches an asynchronous Tauri command (`set_metronome_state`). The Rust `cpal` audio thread instantly updates its inner phase-stepping calculations and subdivision divisor *mid-stream* without resetting the active audio playback buffers. This prevents any audio "stutters" or "lag" when shifting from 90 BPM eighth notes to 110 BPM triplets.
*   **On-the-Fly Tab Synthesis**: Simultaneously, the parametric generator in Rust receives the new `generator_params` and compiles a fresh set of tabs within microseconds. The React tab widget slides out the old exercise and renders the new fretboard positions seamlessly.

#### D. Consolidated Post-Routine Telemetry Packaging
Throughout the entire routine, the Rust `TimingAnalyzer` continues logging raw performance telemetry (variance, bias, missed notes) to SQLite, tagged with the active `routine_id`.
*   At the end of the final step, the metronome fades out, and the React frontend packages a dense, pre-aggregated XML summary of the player's performance across *all* steps.
*   This XML block is injected back into the LLM as grounding context, allowing Qwen to wake up and deliver a comprehensive, highly encouraging, and technically precise post-session summary of their growth.

---

## Pillar 3: \"Super Local\" GPU LLM Scaling & Resource Management

For users with high-end hardware (Nvidia CUDA GPUs or Apple Silicon Unified Memory), Yames can unlock a \"Super Local\" tier. This tier upgrades the default 1.5B Qwen model to a highly articulate 7B or 14B parameter model without sacrificing metronome timing precision.

### 1. CPU Core Affinity & Real-Time Thread Pinning
When running large model inference locally, GPU memory operations and CPU matrix multiplication threads can easily starve standard desktop processes, causing audio glitches and dropouts. To guarantee Yames' sub-millisecond precision, the core architecture will enforce strict thread pinning and prioritization:

```
PHYSICAL CPU CORES
+-----------------------------------------------------------+
| Core 0 | Core 1 | Core 2 | Core 3 | Core 4 | Core 5 | ... |
+--------+--------+--------+--------+--------+--------+-----+
    |        |        \___________________________/
    |        |                      |
    |        |                      v
    |        |            GPU LLM Background Threads
    |        |            (Lower priority scheduling)
    |        |
    |        v
    |     Tauri IPC & React UI Thread
    |
    v
Rust Audio Thread (cpal/rodio)
- Pinned to Core 0
- SCHED_FIFO (Real-Time Priority)
- Lock-Free Ring Buffers
```

*   **Audio Core Isolation**: The cpal-driven audio loop is run on a dedicated high-priority system thread, pinned using core affinity to a dedicated CPU core (Core 0) [yames-evolution-roadmap-v8.md (Pillar 3, Section 1)].
    *   *Thread Priority Promotion*: We will utilize the cross-platform **`audio_thread_priority`** Rust crate [Yames Core Optimization and Pitch Detection (Pillar 3, Section 1)] to reliably promote our audio-feeder loops (cpal/rodio stream threads) to real-time priority (`SCHED_FIFO` with POSIX real-time policies on Linux/macOS [gdt-cpus (Under the Hood), 260], or time-critical priority classes on Windows [gdt-cpus (Under the Hood), 260]), preventing buffer underflows and metronomic click jitter even under high system load [Yames Core Optimization and Pitch Detection (Pillar 3, Section 1)].
    *   *Core Pinning & Hybrid Topologies*: We will leverage **`gdt-cpus`** [Yames Core Optimization and Pitch Detection (Pillar 3, Section 1)] to take command of CPU core topologies [gdt-cpus (Features), 257]. On modern hybrid processors, we will detect and isolate Performance (P-cores) vs. Efficiency (E-cores) vs. Low-Power Efficiency (LP-E cores) [gdt-cpus (Know Your Cores), 261, 262]. The high-priority audio thread is hard-pinned to Performance Core 0 [gdt-cpus (Flex), 258], while generative local LLM worker pools (Ollama/llama.cpp) are constrained to lower scheduling priority [gdt-cpus (Cheat Sheet), 264] on remaining Performance cores (Core 2+) [gdt-cpus (Cheat Sheet), 264] or Efficiency cores [gdt-cpus (Cheat Sheet), 264] to prevent priority inversion [Yames Core Optimization and Pitch Detection (Key Themes)].
    *   *Cache Boundary Protection*: Cooperating audio threads are pinned within the same L3 cache domain (CCD boundary on multi-die Ryzen processors) [gdt-cpus (Flex), 259], protecting the timing loop from the massive latency penalties (up to 4.6x) incurred by crossing L3 fabric boundaries [gdt-cpus (Flex), 259].
*   **GPU Thread Constraining**: LLM inference threads (via llama.cpp/Ollama) are explicitly constrained to lower scheduling priorities, preventing them from stepping on the audio thread's execution slices during active play [yames-evolution-roadmap-v8.md (Pillar 3, Section 1)].

### 2. Unlocked Advanced Capabilities
Deploying a local 7B or 14B Qwen model on an Nvidia GPU or Apple Silicon workstation unlocks revolutionary features:
*   **Interactive Music Theory Tutor**: The coach moves beyond timing feedback to act as an active theory companion. A player can ask, *\"Suggest some scale shapes or modes I can practice over a G-minor backing track,\"* and the coach will output ASCII fretboard maps, modal analyses, and hand-placement recommendations.
*   **Deep Multi-Session Memory (Vector embeddings / Graph Store)**: The coach maintains a persistent, highly contextual vector store of the user's practicing history. It acts with a personalized, long-term memory, recognizing individual growth curves: *\"I noticed your 16th-note alternate picking on the D and G strings is much steadier this week compared to your session three weeks ago at 100 BPM.\"*

---

#### D. Non-Intrusive Micro-Interventions (Peripheral HUD & Click Warping)
To help musicians maintain focus without forcing them to break their eye-alignment or stare at a scrolling screen (which disrupts the flow state and discourages playing by ear), Yames will leverage subtle visual and auditory micro-cues:
*   **Peripheral HUD (Monitor Glow)**: Utilizing Tauri's transparent window overlays, Yames can cast a soft, ambient, colored border glow on the extreme edges of the player's monitor:
    *   *Centered in the Pocket*: The screen borders remain completely transparent (no visual distraction).
    *   *Systemic Rushing (Ahead of Beat)*: The left edge of the monitor emits a soft, pulsing cyan glow.
    *   *Systemic Dragging (Behind Beat)*: The right edge of the monitor emits a soft, pulsing warm orange glow.
    *   *Method*: The glow intensity scales proportionally with the micro-timing variance ($\sigma^2$), warning the player of timing drift purely through their peripheral vision.
*   **Dynamic Click Warping**: When the timing analyzer detects that the player is steadily rushing or dragging (Drift Bias $B \ne 0$), the metronome's click synthesizer (`rodio`) can temporarily and subtly shift the pitch or micro-lag the click's timing. This micro-adjustment acts as an acoustic magnet, subconsciously pulling the player's motor mechanics back into the center of the beat without requiring verbal or text intervention.

---

## Technical Phase & Evolutionary Roadmap

To coordinate this development without disrupting the core metronome’s reliability, Yames will progress through three distinct development cycles:

### Phase 1: Signal Isolation and Database Foundation
*   **Audio Engine Isolation**: Migrate `onset.rs` and `timing.rs` to entirely lock-free processing architectures, decoupling cpal streams from any potential blocking locks or UI-thread operations.
*   **SQLite Integration**: Implement the local SQLite database schema within the Tauri Rust backend, exposing transactional bindings via Tauri IPC commands.
*   **Guitar-Specific Transient Tuning**: Lock the onset detector's filter variables, Butterworth HPF, and adaptive refractory algorithms to the guitar's physical acoustic profile.
*   **Virtual Grid Interpolation**: Integrate the 24-tick-per-beat virtual tactus grid into `TimingAnalyzer` to resolve subdivision discrepancies.
*   **Automated Loopback Latency Calibration**: Develop the speaker-to-mic impulse measurement tool to automatically calculate and subtract driver latency from $t_{\text{onset}}$.

### Phase 2: AI Routing & Parametric Exercise Engine
*   **ONNX BERT Integration**: Integrate `ort` (ONNX Runtime Rust bindings) in the Tauri backend to load and execute a lightweight DistilBERT intent classification model.
*   **Procedural Generator**: Write the parametric music theory algorithms in Rust to procedurally generate chromatic, diagonal, and alternate picking exercise templates.
*   **Multi-Hypothesis Tracking**: Rebuild the `RhythmInference` loop to support localized, Bayesian multi-grid note matching.
*   **Spaced-Repetition System (SRS)**: Implement the SM-2 physical skill-interval calculations in TypeScript, writing daily review queues to SQLite.
*   **Dynamic Practice Routine State Machine**: Implement the `load_timed_routine` command structure and the React state machine for automated, multi-step practice sessions.

### Phase 3: Hardware Scaling, GPU Offloading, & Hands-Free Control
*   **Advanced LLM Compilation**: Build compiling configurations to leverage CUDA/Metal backends, enabling 7B/14B Qwen execution.
*   **Dynamic Phrase Parsing (DPP)**: Implement the Tatum-level quantization and phrase-sequence matching algorithms on the Rust thread to support free-form melodic playing.
*   **Background Ring-Buffer (Record-Listen Loop)**: Implement the continuous 10-second lock-free audio recorder for instant playback mirrors.
*   **Peripheral HUD & Click Warping**: Integrate transparent border visual overlays and rodio micro-shift auditory cues.
*   **MIDI Coaching Triggers**: Integrate MIDI CC/Program Change bindings to trigger voice-coaching summaries on the fly, allowing players to practice, record, review, and adjust metrics without ever looking up from the fretboard.



## Pillar 4: Dual-Model Tier UI/UX & Responsive Capability Feedback

To bridge the gap between low-spec accessibility and high-end workstation performance, Yames will implement a dual-model tier architecture. The UI must intuitively guide the user through these choices, making sure they understand exactly what features are available and what resources are being consumed, without interrupting their practicing flow state.

### 1. Dual-Model Capabilities Matrix

To optimize local execution, features are strictly divided across two engine profiles:

| Capability / Feature | Standard Coach (1.5B–3B quantized) | Studio Coach (7B–14B quantized) |
| :--- | :--- | :--- |
| **System Footprint** | < 2.5 GB System RAM (Fully CPU-safe) | > 8.0 GB System/GPU VRAM (Metal/CUDA) |
| **Metronome Impact** | Zero latency, ultra-lightweight | Decoupled; Core-Affinity isolated |
| **Timing Diagnostics** | Standard Deviation ($\sigma^2$), Drift Bias ($B$), Streaks | Standard Deviation ($\sigma^2$), Drift Bias ($B$), Streaks |
| **Rhythmic Phrasing** | Full virtual-grid and multi-grid matching | Full virtual-grid, multi-grid matching |
| **Speech Generation** | Template rephrasing & concise tips | Rich, non-repetitive conversational synthesis |
| **Music Theory Integration**| None (Locked) | **Active theory tutoring** (chord scales, fretboards) |
| **Cognitive Drills** | Static/Linear Speed Drills | **Procedural, parametric exercise generation** |
| **Memory Retention** | Single-session metrics only | **Persistent Multi-Session Memory (Vector/Graph Store)** |

---

### 2. UI/UX Implementation Specifications

#### A. Interactive Model Tier Selector (Settings Panel)
A prominent, visual panel in Yames' settings overlay allows the player to configure their local coaching engine with clear feedback:
*   **Resource Impact Visualizer**: Render a segmented color bar (Green to Orange/Red) indicating estimated RAM and CPU/GPU impact (e.g., *"Recommended for integrated laptops"* vs. *"Recommended for dedicated workstations with discrete GPUs"*).
*   **DAW/Plugin Warning Card**: Displays a friendly tip reminding users that if they are running intensive amp simulations like *AmpliTube 5* or *Neural DSP Archetype* standalone, they should stick to the **Standard Tier** unless they have dedicated GPU overhead, protecting their audio buffer from clipping or dropouts.
*   **One-Click GGUF Downloader**: A built-in download manager with a visual progress bar indicating bytes received, ETA, and download speed, fully integrated with `useCoachDownload.ts`.

#### B. Contextual Badging & "Studio Required" Promotions
To prevent user frustration when attempting to access advanced features on the Standard tier, Yames will employ a soft-promotion UX paradigm:
*   **Non-Blocking Feature Badging**: Advanced tabs and toggles (such as "Theory Helper", "Fretboard Map", or "Procedural Spider Drill") are not hidden, but are styled with a subtle, translucent lock icon and a "Studio Engine Required" label.
*   **Promotional Explainer Tooltips**: Hovering over or clicking a locked control launches a small, non-intrusive tooltip or slide-out sheet outlining the advanced capability (e.g., *"The Theory Helper requires the Studio Engine to dynamically construct fretboard scales matching your practice profile. Click here to download or enable the 7B model."*). This turns a technical limitation into an encouraging educational up-sell.
*   **Zero-Friction Engine Upgrades**: When a user clicks a locked feature, the tooltip offers a direct, one-click "Download & Enable Studio Engine" action, which automatically kicks off the background GGUF download without taking the user out of their current practice context.

#### C. Active-State Micro-Animations
To preserve the visual focus and rhythm of Yames, especially during mid-session calculation delays:
*   **Pulsing Metronome Loader**: When Qwen is loading or processing a session summary in the background, a circular loader pulses in the sidebar. To keep the musician in the flow state, this loader's pulse rate dynamically syncs with the current metronome BPM, transforming a standard UI wait state into a musical element.

---

*This specification is optimized for musicians and software engineers, ensuring high-fidelity execution and a pristine, eyes-free practicing environment.*
