"""Does bitsandbytes' 4-bit (NF4) path work on this GPU? A Linear4bit forward + backward
through a LoRA-style trainable side branch, compared with the bf16 result."""
import torch

import bitsandbytes as bnb

print("bitsandbytes", bnb.__version__, "torch", torch.__version__, torch.cuda.get_device_name(0),
      torch.cuda.get_device_capability(0))
torch.manual_seed(0)
lin = torch.nn.Linear(2048, 2048, bias=False, dtype=torch.bfloat16)
q = bnb.nn.Linear4bit(2048, 2048, bias=False, compute_dtype=torch.bfloat16, quant_type="nf4")
q.weight = bnb.nn.Params4bit(lin.weight.data.clone(), requires_grad=False, quant_type="nf4")
q = q.cuda()
lin = lin.cuda()
a = torch.nn.Parameter(torch.zeros(2048, 16, device="cuda", dtype=torch.bfloat16).normal_(std=0.01))
x = torch.randn(8, 2048, device="cuda", dtype=torch.bfloat16)
y = q(x) + x @ a @ a.T
y.float().pow(2).mean().backward()
ref = lin(x)
err = (q(x) - ref).float().abs().mean().item() / ref.float().abs().mean().item()
print(f"nf4 vs bf16 mean relative error {err:.3f}; grad norm {a.grad.norm().item():.4f}")
print("BNB 4-bit OK")
