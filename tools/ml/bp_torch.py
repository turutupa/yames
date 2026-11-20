"""Basic Pitch as a trainable PyTorch module, and back to ONNX.

The shipped ONNX file (`src-tauri/models/basic-pitch/nmp.onnx`, Apache-2.0)
is converted node for node with onnx2torch, so the front end (the CQT, the
harmonic stacking) is exactly the one the app runs. Training changes weights
only. `save_onnx` writes the trained weights back into a copy of the ORIGINAL
graph: same nodes, same names, same shapes, so whatever loads Basic Pitch
(ONNX Runtime, tract) loads the result.
"""
from __future__ import annotations

import pathlib

import numpy as np
import onnx
import torch
import torch.nn.functional as F
from onnx import numpy_helper

REPO = pathlib.Path(__file__).resolve().parents[2]
BP_ONNX = REPO / "src-tauri/models/basic-pitch/nmp.onnx"
WINDOW = 43_844
FRAMES = 172
PITCHES = 88
HOP = 256
RATE = 22_050
MIDI_LOW = 21


def _patch_pad():
    """onnx2torch refuses reflect padding on the shapes this graph uses."""
    from onnx2torch.node_converters import pad as P

    def forward(self, x, pads, constant_value=0.0):
        pads = [int(v) for v in pads.tolist()]
        n = len(pads) // 2
        for ax in range(n):
            b, e = pads[ax], pads[ax + n]
            if b == 0 and e == 0:
                continue
            size = x.shape[ax]
            if self.mode == "reflect":
                # no Python lists of sample indices: they cost more than the whole network
                parts = ([x.narrow(ax, 1, b).flip(ax)] if b else []) + [x] + ([x.narrow(ax, size - 1 - e, e).flip(ax)] if e else [])
                x = torch.cat(parts, dim=ax)
            elif self.mode == "constant":
                shape_b = list(x.shape); shape_b[ax] = b
                shape_e = list(x.shape); shape_e[ax] = e
                v = float(constant_value or 0.0)
                x = torch.cat([x.new_full(shape_b, v), x, x.new_full(shape_e, v)], dim=ax)
            else:
                raise NotImplementedError(self.mode)
        return x

    P.OnnxPadDynamic.forward = forward


class BasicPitch(torch.nn.Module):
    """`forward(audio[B, 43844]) -> (note[B,172,88], onset[B,172,88])`, 0..1."""

    def __init__(self, onnx_path: pathlib.Path = BP_ONNX):
        super().__init__()
        import warnings
        from onnx2torch import convert

        _patch_pad()
        self.onnx_path = pathlib.Path(onnx_path)
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            self.net = convert(str(onnx_path))
        proto = onnx.load(str(onnx_path))
        self.out_names = [o.name for o in proto.graph.output]
        self.i_onset = self.out_names.index("StatefulPartitionedCall:2") if "StatefulPartitionedCall:2" in self.out_names else self.out_names.index("onset")
        self.i_note = self.out_names.index("StatefulPartitionedCall:1") if "StatefulPartitionedCall:1" in self.out_names else self.out_names.index("note")
        # which initializer each parameter came from: onnx2torch names a
        # module after its node, and a Conv's inputs are (x, weight, bias)
        inits = {i.name: numpy_helper.to_array(i) for i in proto.graph.initializer}
        nodes = {n.name: n for n in proto.graph.node}
        self.param_init = {}
        for name, p in self.net.named_parameters():
            mod, _, kind = name.rpartition(".")
            node = nodes[mod]
            init = node.input[1 if kind == "weight" else 2]
            assert inits[init].size == p.numel(), (name, init)
            assert np.array_equal(inits[init].reshape(-1), p.detach().numpy().reshape(-1)), name
            self.param_init[name] = init
        # the front end (CQT kernels, its low-pass, normalisation) stays fixed
        for name, p in self.net.named_parameters():
            if self.is_front_end(name, p):
                p.requires_grad_(False)

    def is_front_end(self, name: str, p: torch.nn.Parameter) -> bool:
        return "cq_t" in name or "cq_t" in self.param_init[name] or p.shape[-1] == 256

    def head_parameters(self):
        return [p for _, p in self.net.named_parameters() if p.requires_grad]

    def forward(self, audio: torch.Tensor):
        import warnings
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            out = self.net(audio.unsqueeze(-1))
        return out[self.i_note], out[self.i_onset]

    def save_onnx(self, path: pathlib.Path):
        proto = onnx.load(str(self.onnx_path))
        new = {self.param_init[n]: p.detach().cpu().numpy() for n, p in self.net.named_parameters()}
        for init in proto.graph.initializer:
            if init.name in new:
                a = new[init.name].astype(numpy_helper.to_array(init).dtype).reshape(tuple(init.dims))
                init.CopyFrom(numpy_helper.from_array(a, init.name))
        proto.doc_string = "Basic Pitch (Spotify, Apache-2.0) graph; weights fine-tuned by Yames tools/ml"
        onnx.save(proto, str(path))


if __name__ == "__main__":
    import onnxruntime as ort

    m = BasicPitch()
    rs = np.random.RandomState(0)
    x = rs.randn(3, WINDOW).astype(np.float32) * 0.05
    t = np.arange(WINDOW) / RATE
    x[0] += 0.3 * np.sin(2 * np.pi * 220 * t) * np.exp(-2 * t)
    s = ort.InferenceSession(str(BP_ONNX))
    names = [o.name for o in s.get_outputs()]
    note, onset = m(torch.from_numpy(x))
    for b in range(3):
        ref = s.run(None, {s.get_inputs()[0].name: x[b:b + 1, :, None]})
        print(b, "note diff", np.abs(ref[names.index("StatefulPartitionedCall:1")][0] - note[b].detach().numpy()).max(),
              "onset diff", np.abs(ref[names.index("StatefulPartitionedCall:2")][0] - onset[b].detach().numpy()).max(), "max", float(note[b].max()))
    print("trainable", sum(p.numel() for p in m.head_parameters()))
    m.save_onnx("/tmp/bp_roundtrip.onnx")
    s2 = ort.InferenceSession("/tmp/bp_roundtrip.onnx")
    a = s.run(None, {s.get_inputs()[0].name: x[:1, :, None]}); b = s2.run(None, {s2.get_inputs()[0].name: x[:1, :, None]})
    print("roundtrip max diff", max(np.abs(u - v).max() for u, v in zip(a, b)))
    if torch.cuda.is_available():
        mc = m.cuda(); xc = torch.from_numpy(np.repeat(x, 22, 0)[:64]).cuda()
        import time; t0 = time.time(); n2, o2 = mc(xc); loss = n2.mean() + o2.mean(); loss.backward(); torch.cuda.synchronize()
        print("cuda batch 64 fwd+bwd s", time.time() - t0, torch.cuda.max_memory_allocated() / 1e9, "GB")
