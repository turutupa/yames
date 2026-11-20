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

## `nmp.nnef.tar`: the same network, for tract

What the shipped builds run (`detect-tract`, `plans/detection/RUNTIME.md`).
Made from `nmp.onnx` by `tools/basic-pitch-nnef` (`npm run detect:nnef`),
which then reads it back and checks it against the ONNX file on tract (max
abs difference 0 when it was made). Inside tract: the input fixed to
`[1, 43844, 1]`, only the note and onset outputs kept (in that order; the
contour head is never read), typed and decluttered. Same weights, nothing
retrained or re-quantised. Uses tract's `tract_core` NNEF extension, so the
tool and the app pin the same tract version (0.23.10); after a tract
upgrade, re-run the tool and `npm run detect:parity`.

- Size: 263,168 bytes (uncompressed tar).
- SHA-256: `f23f7f7ed0083ecea103904da61356d62bdc1d883b067b55a28f1ef00f2b438e`
  (the bytes change from run to run, tar mtimes and tract's numbering of some
  intermediate names; the graph does not).
- Licence: as `nmp.onnx` (Apache-2.0, `NOTICE`).
