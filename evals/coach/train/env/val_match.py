"""The validation pass: the rendered validation records through the eval binary, under each record's grammar.

    python -I val_match.py requests <validation.rendered.jsonl> <requests.jsonl>
    python -I val_match.py score <validation.rendered.jsonl> <outcomes.jsonl> <out.json> [<label>]

`requests` turns each rendered record (`coach-train.mjs render --with-grammar`) back into the
AskRequest the app would send (prefix, context, question, its grammar; deadline 8 s), checking
that the Rust prompt head and tail rebuild the training prompt byte for byte. `score` reads the
binary's outcomes: exact match of the answer (as JSON: the same object), per language and per
expected kind, and what each kind was answered with. Model selection reads this, never the
held-out set.
"""
import json
import statistics
import sys

HEAD_OPEN = "<|im_start|>system\n"
HEAD_CLOSE = "\n\n/no_think<|im_end|>\n<|im_start|>user\n"
TAIL_CLOSE = "<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n"
SYSTEM_END = "and nothing else"


def head(system, prefix):
    p = prefix.strip()
    return f"{HEAD_OPEN}{system}{chr(10) * 2 + p if p else ''}{HEAD_CLOSE}"


def tail(context, question):
    c = context.strip()
    return f"{c + chr(10) * 2 if c else ''}Question: {question.strip()}{TAIL_CLOSE}"


def split_prompt(prompt):
    if not prompt.startswith(HEAD_OPEN) or HEAD_CLOSE not in prompt or not prompt.endswith(TAIL_CLOSE):
        raise ValueError("not the ask prompt's ChatML")
    sys_part, user = prompt[len(HEAD_OPEN):].split(HEAD_CLOSE, 1)
    cut = sys_part.index(SYSTEM_END) + len(SYSTEM_END)
    system, prefix = sys_part[:cut], sys_part[cut:].lstrip("\n")
    user = user[: -len(TAIL_CLOSE)]
    q_at = user.rfind("Question: ")
    context = user[:q_at].rstrip("\n") if q_at > 0 else ""
    question = user[q_at + len("Question: "):]
    if head(system, prefix) + tail(context, question) != prompt:
        raise ValueError("the prompt does not rebuild from its parts")
    return system, prefix, context, question


def lang_of(rid):
    return rid.rsplit("-", 1)[0]


def kind_of(text):
    try:
        o = json.loads(text)
    except (ValueError, TypeError):
        return "unparsed", None
    if not isinstance(o, dict):
        return "unparsed", None
    if "tool" in o:
        return "call", o
    if "card" in o:
        return "card", o
    if "answer" in o:
        return str(o["answer"]), o
    return "unparsed", o


def read_jsonl(path):
    with open(path, encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def cmd_requests(rendered, out):
    rows = read_jsonl(rendered)
    systems = set()
    with open(out, "w", encoding="utf-8") as f:
        for n, r in enumerate(rows, 1):
            if "grammar" not in r:
                raise SystemExit(f"{r['id']}: no grammar (render with --with-grammar)")
            system, prefix, context, question = split_prompt(r["prompt"])
            systems.add(system)
            f.write(json.dumps({"id": r["id"], "generationId": n, "mode": "choice", "prefix": prefix,
                                "context": context, "question": question, "grammar": r["grammar"],
                                "deadlineMs": 8000}, ensure_ascii=False) + "\n")
    if len(systems) != 1:
        raise SystemExit(f"{len(systems)} different system texts")
    print(f"wrote {len(rows)} requests to {out}")


def cmd_score(rendered, outcomes, out, label):
    rows = read_jsonl(rendered)
    got = {o["id"]: o for o in read_jsonl(outcomes)}
    groups = {}
    confusion = {}
    ms = []
    total = {"n": 0, "exact": 0, "same_object": 0, "no_answer": 0}

    def bump(key, field):
        groups.setdefault(key, {"n": 0, "exact": 0, "same_object": 0, "no_answer": 0})[field] += 1

    for r in rows:
        o = got.get(r["id"], {"status": "error", "error": "no outcome"})
        want_kind, want = kind_of(r["answer"])
        text = o.get("text") if o.get("status") == "answered" else None
        got_kind, got_obj = kind_of(text) if text is not None else ("no answer", None)
        if isinstance(o.get("totalMs"), (int, float)):
            ms.append(o["totalMs"])
        keys = ["all", f"lang {lang_of(r['id'])}", f"kind {want_kind}"]
        for k in keys:
            bump(k, "n")
        total["n"] += 1
        if text is None:
            for k in keys:
                bump(k, "no_answer")
            total["no_answer"] += 1
        if text is not None and text.strip() == r["answer"]:
            for k in keys:
                bump(k, "exact")
            total["exact"] += 1
        if got_obj is not None and got_obj == want:
            for k in keys:
                bump(k, "same_object")
            total["same_object"] += 1
        c = confusion.setdefault(want_kind, {})
        c[got_kind] = c.get(got_kind, 0) + 1
    res = {"label": label, "n": total["n"], "exact": total["exact"], "same_object": total["same_object"],
           "exact_match": total["same_object"] / max(1, total["n"]), "no_answer": total["no_answer"],
           "median_ms": statistics.median(ms) if ms else None, "groups": groups, "confusion": confusion}
    with open(out, "w", encoding="utf-8") as f:
        json.dump(res, f, indent=1)
    print(f"{label}: validation exact match {total['same_object']}/{total['n']} "
          f"({100 * res['exact_match']:.1f}%), byte-exact {total['exact']}, no answer {total['no_answer']}")


def main():
    if len(sys.argv) >= 4 and sys.argv[1] == "requests":
        cmd_requests(sys.argv[2], sys.argv[3])
    elif len(sys.argv) == 3 and sys.argv[1] == "em":
        with open(sys.argv[2], encoding="utf-8") as f:
            print(json.load(f)["exact_match"])
    elif len(sys.argv) >= 5 and sys.argv[1] == "score":
        cmd_score(sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5] if len(sys.argv) > 5 else "")
    else:
        raise SystemExit(__doc__)


if __name__ == "__main__":
    main()
