"""N1: the note and onset model, Basic Pitch's front end with a trained head.

Basic Pitch (`nmp.onnx`, Apache-2.0) is cut in two at the harmonic stack:

    audio [B, 43844, 1] --front (CQT, log, harmonic stacking; FROZEN)--> [B, 8, 172, 264]
                        --head (the small convolutions)--> note, onset [B, 172, 88]

The front is the shipped graph's own nodes (run in torch through onnx2torch
for training, copied node for node into the exported file). The head is
native torch:

- `a` (N1a): Basic Pitch's own head, started from its weights, 16.8k weights.
- `b` (N1b): the same, plus a refinement stack that reads the head's note
  and onset logits and its 32 onset features and adds a correction to both
  logits. Its last layer starts at zero, so training starts exactly at Basic
  Pitch.

`export` writes one ONNX file with Basic Pitch's contract (same input, the
same two output names), which `tools/basic-pitch-nnef` turns into the NNEF
archive tract loads.
"""
from __future__ import annotations

import pathlib
import warnings

import numpy as np
import onnx
import torch
import torch.nn as nn
from onnx import numpy_helper

from .bp_torch import BP_ONNX, FRAMES, PITCHES, WINDOW, _patch_pad

CUT = None  # name of the harmonic stack tensor, found once
OUT_NOTE, OUT_ONSET = "StatefulPartitionedCall:1", "StatefulPartitionedCall:2"


def _graph():
    proto = onnx.load(str(BP_ONNX))
    convs = [n for n in proto.graph.node if n.op_type == "Conv" and "cq_t" not in n.name]
    by_shape = {}
    inits = {i.name: numpy_helper.to_array(i) for i in proto.graph.initializer}
    for n in convs:
        w = inits[n.input[1]]
        by_shape[tuple(w.shape)] = (w, inits[n.input[2]], n)
    cut = by_shape[(32, 8, 5, 5)][2].input[0]
    return proto, by_shape, cut


def front_onnx(path: pathlib.Path) -> str:
    """The shipped graph up to the harmonic stack, as its own file."""
    proto, _, cut = _graph()
    onnx.utils.extract_model(str(BP_ONNX), str(path), [proto.graph.input[0].name], [cut], check_model=False)
    return cut


class Front(nn.Module):
    """audio [B, 43844] -> harmonic stack [B, 8, 172, 264]; no gradients."""

    def __init__(self):
        super().__init__()
        from onnx2torch import convert
        import tempfile

        _patch_pad()
        with tempfile.TemporaryDirectory() as d, warnings.catch_warnings():
            warnings.simplefilter("ignore")
            front_onnx(pathlib.Path(d) / "front.onnx")
            self.net = convert(str(pathlib.Path(d) / "front.onnx"))
        for p in self.parameters():
            p.requires_grad_(False)

    @torch.no_grad()
    def forward(self, audio):
        # Traced once per batch size: the converted graph reads shapes back
        # from the GPU at every Reshape, and on a shared GPU each read waits
        # for a time slice (0.45 s a batch against 0.16 s traced).
        key = (audio.shape[0], str(audio.device))
        if not hasattr(self, "_traced"):
            self._traced = {}
        x = audio.unsqueeze(-1)
        if key not in self._traced:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                self._traced[key] = torch.jit.trace(self.net, x, check_trace=False)
        return self._traced[key](x)


class Head(nn.Module):
    def __init__(self, arch: str = "a", width: int = 24):
        super().__init__()
        _, w, _ = _graph()
        self.arch, self.width = arch, width
        self.note_bias, self.onset_bias = 0.0, 0.0

        def conv(shape, **kw):
            c = nn.Conv2d(shape[1], shape[0], shape[2:], **kw)
            c.weight.data = torch.from_numpy(w[shape][0].copy())
            c.bias.data = torch.from_numpy(w[shape][1].copy())
            return c

        self.c1 = conv((8, 8, 3, 39), padding=(1, 19))
        self.contour = conv((1, 8, 5, 5), padding=(2, 2))
        self.c2 = conv((32, 1, 7, 7), stride=(1, 3), padding=(3, 2))
        self.c3 = conv((1, 32, 7, 3), padding=(3, 1))
        self.c4 = conv((32, 8, 5, 5), stride=(1, 3), padding=(2, 1))
        self.c5 = conv((1, 33, 3, 3), padding=(1, 1))
        if arch == "b":
            k = width
            self.r1 = nn.Conv2d(66, k, (3, 5), padding=(1, 2))
            self.r2 = nn.Conv2d(k, k, (3, 3), padding=(1, 12), dilation=(1, 12))  # an octave either side
            self.r3 = nn.Conv2d(k, k, (3, 3), padding=(1, 1))
            self.r4 = nn.Conv2d(k, 2, (1, 1))
            nn.init.zeros_(self.r4.weight)
            nn.init.zeros_(self.r4.bias)

    def logits(self, h):
        n, o = self.logits4(h)
        return n[:, 0], o[:, 0]  # [B, 172, 88]

    def logits4(self, h):
        x = torch.relu(self.c1(h))
        contour = torch.sigmoid(self.contour(x))
        f2 = torch.relu(self.c2(contour))
        note = self.c3(f2)
        f4 = torch.relu(self.c4(h))
        onset = self.c5(torch.cat([torch.sigmoid(note), f4], 1))
        if self.arch == "b":
            r = torch.relu(self.r1(torch.cat([note, onset, f2, f4], 1)))
            r = torch.relu(self.r2(r))
            r = torch.relu(self.r3(r))
            d = self.r4(r)
            note = note + d[:, :1]
            onset = onset + d[:, 1:]
        # calibration, set at export: the verifier's thresholds were tuned on
        # Basic Pitch, a head trained with a weighted loss answers higher
        return note + self.note_bias, onset + self.onset_bias

    def forward(self, h):
        n, o = self.logits(h)
        return torch.sigmoid(n), torch.sigmoid(o)


class _ForExport(nn.Module):
    """One window; ends in a Reshape like the shipped graph (tract keeps a
    Reshape's name through its clean-up, not a Gather's)."""

    def __init__(self, head):
        super().__init__()
        self.head = head

    def forward(self, h):
        n, o = self.head.logits4(h)
        return torch.sigmoid(n).reshape(1, FRAMES, PITCHES), torch.sigmoid(o).reshape(1, FRAMES, PITCHES)


def export(head: Head, path: pathlib.Path, note: str = ""):
    """front (the shipped nodes) + head -> one ONNX with Basic Pitch's contract."""
    import tempfile

    head = head.cpu().eval()
    with tempfile.TemporaryDirectory() as d:
        d = pathlib.Path(d)
        cut = front_onnx(d / "front.onnx")
        front = onnx.load(str(d / "front.onnx"))
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            torch.onnx.export(_ForExport(head), torch.zeros(1, 8, FRAMES, 264), str(d / "head.onnx"), input_names=["stack"], output_names=[OUT_NOTE, OUT_ONSET],
                              opset_version=15, dynamo=False, do_constant_folding=True)
        hp = onnx.load(str(d / "head.onnx"))
        hp.ir_version = front.ir_version
        front_ops = {o.domain: o.version for o in front.opset_import}
        del hp.opset_import[:]
        for dom, ver in front_ops.items():
            hp.opset_import.add(domain=dom, version=ver)
        # plain names: the NNEF archive stores a tensor in a file of its name
        keep = {"stack", OUT_NOTE, OUT_ONSET}
        plain = lambda v: v if v in keep or not v else "n1_" + "".join(c if c.isalnum() else "_" for c in v).strip("_")
        for i, n in enumerate(hp.graph.node):
            n.input[:] = [plain(v) for v in n.input]
            n.output[:] = [plain(v) for v in n.output]
            # tract names an output after the node that makes it
            n.name = n.output[0] if n.output[0] in keep else f"n1_node{i}_{n.op_type}"
        for t in hp.graph.initializer:
            t.name = plain(t.name)
        del hp.graph.value_info[:]
        merged = onnx.compose.merge_models(front, hp, io_map=[(cut, "stack")])
        merged.doc_string = "Basic Pitch (Spotify, Apache-2.0) front end; head trained by Yames tools/ml. " + note
        onnx.checker.check_model(merged)
        onnx.save(merged, str(path))


def load_head(ckpt: pathlib.Path, note_bias: float = 0.0, onset_bias: float = 0.0) -> Head:
    s = torch.load(str(ckpt), map_location="cpu", weights_only=False)
    h = Head(s["arch"], s.get("width", 24))
    h.load_state_dict(s["head"])
    h.note_bias, h.onset_bias = note_bias, onset_bias
    return h


if __name__ == "__main__":
    import sys
    import onnxruntime as ort

    if len(sys.argv) >= 3:  # python -m tools.ml.n1 <ckpt.pt> <out.onnx> [note logit bias] [onset logit bias]
        nb, ob = (float(sys.argv[3]) if len(sys.argv) > 3 else 0.0), (float(sys.argv[4]) if len(sys.argv) > 4 else 0.0)
        h = load_head(pathlib.Path(sys.argv[1]), nb, ob)
        export(h, pathlib.Path(sys.argv[2]), note=f"{pathlib.Path(sys.argv[1]).name}, note bias {nb}, onset bias {ob}")
        ref = ort.InferenceSession(sys.argv[2])
        x = (np.random.RandomState(0).randn(1, WINDOW) * 0.05).astype(np.float32)
        x[0] += 0.3 * np.sin(2 * np.pi * 220 * np.arange(WINDOW) / 22050)
        got = ref.run([OUT_NOTE, OUT_ONSET], {ref.get_inputs()[0].name: x[:, :, None]})
        n, o = h(Front()(torch.from_numpy(x)))
        print("export vs torch: note", float(np.abs(got[0] - n.detach().numpy()).max()), "onset", float(np.abs(got[1] - o.detach().numpy()).max()),
              "weights", sum(p.numel() for p in h.parameters()), "bytes", pathlib.Path(sys.argv[2]).stat().st_size)
        sys.exit(0)
    # self-test: both heads equal the shipped model before training
    f = Front()
    x = (np.random.RandomState(0).randn(2, WINDOW) * 0.05).astype(np.float32)
    x[0] += 0.3 * np.sin(2 * np.pi * 220 * np.arange(WINDOW) / 22050) * np.exp(-2 * np.arange(WINDOW) / 22050)
    s = ort.InferenceSession(str(BP_ONNX))
    ref = [s.run([OUT_NOTE, OUT_ONSET], {s.get_inputs()[0].name: x[b:b + 1, :, None]}) for b in range(2)]
    for arch in "ab":
        h = Head(arch)
        n, o = h(f(torch.from_numpy(x)))
        print(arch, "weights", sum(p.numel() for p in h.parameters()), "vs shipped: note", max(float(np.abs(ref[b][0][0] - n[b].detach().numpy()).max()) for b in range(2)),
              "onset", max(float(np.abs(ref[b][1][0] - o[b].detach().numpy()).max()) for b in range(2)))
        export(h, pathlib.Path(f"/tmp/n1{arch}-init.onnx"))
        s2 = ort.InferenceSession(f"/tmp/n1{arch}-init.onnx")
        got = s2.run([OUT_NOTE, OUT_ONSET], {s2.get_inputs()[0].name: x[:1, :, None]})
        print(arch, "export vs shipped: note", float(np.abs(got[0] - ref[0][0]).max()), "onset", float(np.abs(got[1] - ref[0][1]).max()))
