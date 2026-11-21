"""Proves the venv's torch sees the GPU: prints versions, the device and a timed matmul."""
import sys
import time

import torch

print("python", sys.version.split()[0])
print("torch", torch.__version__, "cuda", torch.version.cuda)
print("cuda available", torch.cuda.is_available())
if not torch.cuda.is_available():
    sys.exit(1)
dev = torch.device("cuda")
print("device", torch.cuda.get_device_name(0), "capability", torch.cuda.get_device_capability(0))
free, total = torch.cuda.mem_get_info()
print(f"memory free {free / 2**30:.1f} GiB of {total / 2**30:.1f} GiB")
a = torch.randn(4096, 4096, device=dev, dtype=torch.bfloat16)
b = torch.randn(4096, 4096, device=dev, dtype=torch.bfloat16)
c = a @ b
torch.cuda.synchronize()
t = time.time()
for _ in range(20):
    c = a @ b
torch.cuda.synchronize()
dt = (time.time() - t) / 20
print(f"bf16 4096^3 matmul {dt * 1000:.2f} ms ({2 * 4096**3 / dt / 1e12:.1f} TFLOP/s)")
ref = (a.float().cpu() @ b.float().cpu())
err = (c.float().cpu() - ref).abs().max().item() / ref.abs().max().item()
print(f"relative max error vs CPU fp32 {err:.2e}")
for name in ("transformers", "peft", "datasets", "accelerate", "safetensors", "sentencepiece", "google.protobuf"):
    try:
        mod = __import__(name, fromlist=["__version__"])
        print(name, getattr(mod, "__version__", "?"))
    except Exception as e:  # noqa: BLE001
        print(name, "IMPORT FAILED", e)
try:
    import bitsandbytes  # noqa: F401
    print("bitsandbytes", bitsandbytes.__version__)
except Exception as e:  # noqa: BLE001
    print("bitsandbytes not importable:", type(e).__name__)
