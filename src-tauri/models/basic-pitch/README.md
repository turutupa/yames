# Basic Pitch (ICASSP 2022) note model

`nmp.onnx` is the ONNX export shipped inside Spotify's `basic-pitch` Python
package (`basic_pitch/saved_models/icassp_2022/nmp.onnx`), unmodified.

- Source: https://github.com/spotify/basic-pitch
- Licence: Apache-2.0, code and weights (see `LICENSE` beside this file's
  upstream; the notice is reproduced in `NOTICE`).
- Paper: Bittner et al., "A Lightweight Instrument-Agnostic Model for
  Polyphonic Note Transcription and Multipitch Estimation", ICASSP 2022.
- Size: 230,444 bytes. 16,782 parameters. Opset 15.
- SHA-256: `2c3c1d144bfa61ad236e92e169c13535c880469a12a047d4e73451f2c059a0ec`
- Input: `serving_default_input_2:0`, float32 `[n, 43844, 1]`, mono audio at
  22,050 Hz, two seconds less a little.
- Outputs, each `[n, 172, ...]` at 256 samples a frame:
  `StatefulPartitionedCall:1` note (88 pitches from MIDI 21),
  `StatefulPartitionedCall:2` onset (88), `StatefulPartitionedCall:0`
  contour (264, three bins a semitone).

It is compiled into the binary with `include_bytes!` (`src/detect/model.rs`),
so there is no model file to bundle, sign or lose on any platform. Yames uses
it only to CONFIRM or DECLINE notes the Exercise already wrote
(`src/detect/verifier.rs`); it never transcribes on its own.
