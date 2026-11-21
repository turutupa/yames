"""Which scaled-dot-product-attention kernels run on this GPU, and how fast (forward +
backward, Qwen3-0.6B's attention shape: 16 query heads, 8 KV heads, head dim 128)."""
import time

import torch
import torch.nn.functional as F
from torch.nn.attention import SDPBackend, sdpa_kernel

print(torch.__version__, torch.cuda.get_device_name(0), torch.cuda.get_device_capability(0))
print("flash built", torch.backends.cuda.is_flash_attention_available())
B, H, KV, T, D = 8, 16, 8, 1024, 128


def run(backend, gqa, mask):
    q = torch.randn(B, H, T, D, device="cuda", dtype=torch.bfloat16, requires_grad=True)
    kv_h = KV if gqa else H
    k = torch.randn(B, kv_h, T, D, device="cuda", dtype=torch.bfloat16, requires_grad=True)
    v = torch.randn(B, kv_h, T, D, device="cuda", dtype=torch.bfloat16, requires_grad=True)
    m = None
    if mask:
        m = torch.ones(T, T, device="cuda", dtype=torch.bool).tril().expand(B, 1, T, T)
    kw = {"enable_gqa": True} if gqa else {}
    try:
        with sdpa_kernel([backend]):
            for i in range(6):
                if i == 1:
                    torch.cuda.synchronize()
                    torch.cuda.reset_peak_memory_stats()
                    t = time.time()
                o = F.scaled_dot_product_attention(q, k, v, attn_mask=m, is_causal=m is None, **kw)
                o.sum().backward()
            torch.cuda.synchronize()
        dt = (time.time() - t) / 5
        return f"{dt * 1000:7.1f} ms/layer fwd+bwd, peak {torch.cuda.max_memory_allocated() / 2**30:.2f} GiB"
    except Exception as e:  # noqa: BLE001
        return "unavailable: " + str(e).splitlines()[0][:110]


for backend in (SDPBackend.FLASH_ATTENTION, SDPBackend.CUDNN_ATTENTION, SDPBackend.EFFICIENT_ATTENTION, SDPBackend.MATH):
    for gqa in (False, True):
        for mask in (False, True):
            print(f"{backend.name:20s} gqa={gqa!s:5s} mask={mask!s:5s} {run(backend, gqa, mask)}", flush=True)
