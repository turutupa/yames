# The trial (TOOLS 3.6): the 0.6B LoRA for a few hundred steps through every stage but the held-out one.
V="$HOME/scratch/yames-c3d"
KIND=lora
BASE="$V/weights/Qwen3-0.6B"
TRAIN_ARGS="--steps 300 --batch-size 8 --max-len 2048 --lora-r 16 --lora-alpha 32 --lr 2e-4 --save-every 100 --log-every 10"
QUANTS="Q8_0 Q4_K_M"
HELDOUT=no
