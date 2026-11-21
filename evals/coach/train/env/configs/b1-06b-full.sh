# B1: Qwen3-0.6B, every weight trained (fp32 master weights, bf16 autocast), 2 epochs.
# Rows are 959-1,551 tokens (median 1,410): --max-len 2048 drops none.
V="$HOME/scratch/yames-c3d"
KIND=full
BASE="$V/weights/Qwen3-0.6B"
TRAIN_ARGS="--full-finetune --epochs 2 --batch-size 8 --max-len 2048 --lr 1e-5 --grad-checkpointing --save-every 100 --log-every 10"
QUANTS="Q8_0 Q4_K_M"
HELDOUT=yes
