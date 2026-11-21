# B2: Qwen3-1.7B LoRA r 32 (alpha 64), 2 epochs, measured merged.
V="$HOME/scratch/yames-c3d"
KIND=lora
BASE="$V/weights/Qwen3-1.7B"
TRAIN_ARGS="--epochs 2 --batch-size 8 --max-len 2048 --lora-r 32 --lora-alpha 64 --lr 2e-4 --grad-checkpointing --save-every 100 --log-every 10"
QUANTS="Q8_0 Q4_K_M"
HELDOUT=yes
