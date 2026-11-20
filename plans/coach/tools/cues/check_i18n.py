import json, re, sys
# usage: python3 -I check_i18n.py <dir> <path-id> <lng> [<lng> ...]
base = sys.argv[1].rstrip("/") + "/"
pid = sys.argv[2]
todo = json.load(open(base + "todo.json", encoding="utf-8"))[pid]
for lng in sys.argv[3:]:
    try:
        done = json.load(open(base + "done." + lng + ".json", encoding="utf-8"))[pid]
    except Exception as e:
        print("==", lng, "BAD JSON", e)
        continue
    bad = 0
    miss = [k for k in todo if k not in done]
    extra = [k for k in done if k not in todo]
    if miss or extra:
        print("==", lng, "missing", miss, "extra", extra)
        bad += 1
    mx, mk = 0, ""
    for k, en in todo.items():
        v = done.get(k, "")
        if len(v) > mx:
            mx, mk = len(v), k
        if not v.strip():
            print(lng, "EMPTY", k); bad += 1
        if "!" in v or "！" in v:
            print(lng, "BANG", k, v); bad += 1
        if len(v) > 48:
            print(lng, "LONG", len(v), k, v); bad += 1
        for ph in re.findall(r"\{[^}]*\}", en):
            if ph not in v:
                print(lng, "PLACEHOLDER", ph, k, v); bad += 1
        for d in re.findall(r"\d", en):
            if d not in v:
                print(lng, "DIGIT", d, k, "|", en, "|", v); bad += 1
                break
        for q in re.findall(r"'([^']*\d[^']*)'", en):
            digits = re.findall(r"\d", q)
            if not all(x in v for x in digits):
                print(lng, "QUOTED", q, k, v); bad += 1
    print("==", lng, len(done), "keys; longest", mx, mk, "; problems", bad)
