"""Writes the smoke test's synthetic data: 200 {prompt, completion} records of the c3d1 shape.

The prompt is the chat-formatted turn (system: a tool list; user: a request) exactly as
Qwen3's template renders it with thinking off; the completion is one JSON tool call.
Every completion's args end with "src":"c3d", a marker no base model can guess, so
the adapter's effect is visible in a grammar-constrained answer.

Also writes, beside the JSONL: system.txt (the system prompt for llama-cli -sysf),
grammar.gbnf (the GBNF every answer must match) and probes.txt (held-out requests).

usage: python -I make_synthetic.py <tokenizer dir> <out dir>
"""
import json
import os
import random
import sys

TOOLS = {
    "set_tempo": "set the metronome tempo in BPM (args: bpm)",
    "start_metronome": "start the click (no args)",
    "stop_metronome": "stop the click (no args)",
    "open_screen": "open a screen (args: name = today | paths | progress | settings)",
    "start_drill": "start a speed drill on an exercise (args: exercise)",
    "set_volume": "set the click volume 0-100 (args: level)",
    "next_exercise": "go to the next exercise (no args)",
    "show_report": "show the last session's report (no args)",
}

SYSTEM = ("You are the Ask panel of a guitar practice app. Answer with exactly one JSON tool call "
          "and nothing else. Tools:\n" + "\n".join(f"- {k}: {v}" for k, v in TOOLS.items()))

GRAMMAR = r'''root ::= "{\"tool\":\"" tool "\",\"args\":{" ( pair ( "," pair )* )? "}}"
tool ::= "set_tempo" | "start_metronome" | "stop_metronome" | "open_screen" | "start_drill" | "set_volume" | "next_exercise" | "show_report"
pair ::= "\"" [a-z_]{1,16} "\":" value
value ::= "\"" [a-zA-Z0-9 _-]{0,24} "\"" | [0-9]{1,4}
'''

EXERCISES = ["spider walk", "alternate picking", "string skipping", "legato runs", "chord changes",
             "pentatonic box 1", "sweep arpeggios", "palm muting"]
SCREENS = ["today", "paths", "progress", "settings"]


def requests(rng):
    """(user text, tool, args) triples; args without the marker."""
    bpm = rng.choice(range(50, 221, 5))
    vol = rng.choice(range(10, 101, 10))
    ex = rng.choice(EXERCISES)
    sc = rng.choice(SCREENS)
    pool = [
        (rng.choice(["set the tempo to {b}", "metronome at {b} please", "{b} bpm", "can you make it {b}",
                     "change tempo to {b} beats per minute", "go to {b}"]).format(b=bpm), "set_tempo", {"bpm": bpm}),
        (rng.choice(["start the click", "start", "play the metronome", "count me in", "go"]), "start_metronome", {}),
        (rng.choice(["stop", "stop the click", "silence please", "pause the metronome", "enough"]), "stop_metronome", {}),
        (rng.choice(["open {s}", "show me {s}", "take me to {s}", "go to the {s} screen"]).format(s=sc), "open_screen", {"name": sc}),
        (rng.choice(["drill {e}", "speed drill on {e}", "let's ramp up {e}", "start a drill for {e}"]).format(e=ex), "start_drill", {"exercise": ex}),
        (rng.choice(["volume {v}", "set the click volume to {v}", "make the click {v} percent"]).format(v=vol), "set_volume", {"level": vol}),
        (rng.choice(["next", "next exercise", "skip this one", "move on"]), "next_exercise", {}),
        (rng.choice(["how did I do", "show the report", "last session report", "what were my results"]), "show_report", {}),
    ]
    return rng.choice(pool)


def completion(tool, args):
    a = dict(args)
    a["src"] = "c3d"
    return json.dumps({"tool": tool, "args": a}, separators=(",", ":"))


def main():
    tok_dir, out = sys.argv[1], sys.argv[2]
    from transformers import AutoTokenizer

    tok = AutoTokenizer.from_pretrained(tok_dir)
    os.makedirs(out, exist_ok=True)
    rng = random.Random(7)

    def prompt(user):
        return tok.apply_chat_template([{"role": "system", "content": SYSTEM}, {"role": "user", "content": user}],
                                       tokenize=False, add_generation_prompt=True, enable_thinking=False)

    with open(os.path.join(out, "train.jsonl"), "w", encoding="utf-8") as f:
        for _ in range(200):
            user, tool, args = requests(rng)
            f.write(json.dumps({"prompt": prompt(user), "completion": completion(tool, args)}, ensure_ascii=False) + "\n")
    with open(os.path.join(out, "system.txt"), "w", encoding="utf-8") as f:
        f.write(SYSTEM)
    with open(os.path.join(out, "grammar.gbnf"), "w", encoding="utf-8") as f:
        f.write(GRAMMAR)
    with open(os.path.join(out, "probes.txt"), "w", encoding="utf-8") as f:
        f.write("put the metronome on 133\nplease begin a drill for the tremolo exercise\n")
    print("wrote", out)
    print("example prompt:\n" + prompt("put the metronome on 133"))


if __name__ == "__main__":
    main()
