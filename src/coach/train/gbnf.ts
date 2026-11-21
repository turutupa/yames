/**
 * A GBNF grammar as a JavaScript RegExp (leg c3d1): enough of llama.cpp's
 * grammar language to say whether a text is one the choice grammar
 * (`grammar.ts`) accepts, so a test can hold every training completion to the
 * grammar the app's worker samples under.
 *
 * Supported: `name ::= body` lines, string literals with `\"`, `\\`, `\xNN`
 * escapes, character classes (ranges, `^`, the same escapes), groups,
 * alternation, rule references, and the postfixes `?`, `*`, `+`, `{m}`,
 * `{m,n}`, `{m,}`. Rules may not refer to themselves (the choice grammar is
 * bounded and never does): a recursive grammar throws.
 */

type Tok =
  | { t: "lit"; s: string }
  | { t: "cls"; s: string }
  | { t: "ref"; s: string }
  | { t: "op"; s: "(" | ")" | "|" }
  | { t: "post"; s: string };

const REGEX_SYNTAX = /[\\^$.*+?()[\]{}|/]/g;

function unescapeAt(src: string, i: number): { ch: string; next: number } {
  const c = src[i + 1];
  if (c === "x") return { ch: String.fromCharCode(parseInt(src.slice(i + 2, i + 4), 16)), next: i + 4 };
  if (c === "n") return { ch: "\n", next: i + 2 };
  if (c === "t") return { ch: "\t", next: i + 2 };
  if (c === "r") return { ch: "\r", next: i + 2 };
  return { ch: c, next: i + 2 };
}

/** One character as it may stand inside a RegExp character class (u flag). */
function classChar(ch: string): string {
  const code = ch.codePointAt(0) ?? 0;
  if (code < 0x20 || code === 0x7f) return `\\x${code.toString(16).padStart(2, "0")}`;
  return /[\\\]^[-]/.test(ch) ? `\\${ch}` : ch;
}

function tokenize(body: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < body.length) {
    const c = body[i];
    if (c === " " || c === "\t") {
      i++;
    } else if (c === '"') {
      let s = "";
      i++;
      while (i < body.length && body[i] !== '"') {
        if (body[i] === "\\") {
          const u = unescapeAt(body, i);
          s += u.ch;
          i = u.next;
        } else s += body[i++];
      }
      i++;
      out.push({ t: "lit", s });
    } else if (c === "[") {
      let s = "[";
      i++;
      if (body[i] === "^") {
        s += "^";
        i++;
      }
      while (i < body.length && body[i] !== "]") {
        if (body[i] === "\\") {
          const u = unescapeAt(body, i);
          s += classChar(u.ch);
          i = u.next;
        } else if (body[i] === "-") {
          s += "-";
          i++;
        } else s += classChar(body[i++]);
      }
      i++;
      out.push({ t: "cls", s: `${s}]` });
    } else if (c === "(" || c === ")" || c === "|") {
      out.push({ t: "op", s: c });
      i++;
    } else if (c === "?" || c === "*" || c === "+") {
      out.push({ t: "post", s: c });
      i++;
    } else if (c === "{") {
      const end = body.indexOf("}", i);
      out.push({ t: "post", s: body.slice(i, end + 1).replace(/\s+/g, "") });
      i = end + 1;
    } else if (/[a-zA-Z0-9-]/.test(c)) {
      let s = "";
      while (i < body.length && /[a-zA-Z0-9-]/.test(body[i])) s += body[i++];
      out.push({ t: "ref", s });
    } else {
      throw new Error(`gbnf: unexpected "${c}" in ${body.slice(0, 40)}`);
    }
  }
  return out;
}

/** The grammar's rules by name (continuation lines joined). */
export function parseGbnf(text: string): Map<string, string> {
  const rules = new Map<string, string>();
  let current: string | null = null;
  for (const raw of text.split("\n")) {
    const line = raw.replace(/^\s+|\s+$/g, "");
    if (line === "" || line.startsWith("#")) continue;
    const m = line.match(/^([a-zA-Z0-9-]+)\s*::=\s*(.*)$/);
    if (m) {
      current = m[1];
      rules.set(current, m[2]);
    } else if (current) {
      rules.set(current, `${rules.get(current)} ${line}`);
    }
  }
  return rules;
}

/** The grammar as one anchored RegExp (`root` matches the whole text). */
export function gbnfToRegExp(text: string): RegExp {
  const rules = parseGbnf(text);
  const done = new Map<string, string>();
  const busy = new Set<string>();
  const compile = (name: string): string => {
    const hit = done.get(name);
    if (hit !== undefined) return hit;
    if (busy.has(name)) throw new Error(`gbnf: rule ${name} is recursive`);
    const body = rules.get(name);
    if (body === undefined) throw new Error(`gbnf: no rule ${name}`);
    busy.add(name);
    const toks = tokenize(body);
    let pos = 0;
    const seq = (): string => {
      const alts: string[] = [];
      let cur = "";
      while (pos < toks.length) {
        const tok = toks[pos];
        if (tok.t === "op" && tok.s === ")") break;
        pos++;
        if (tok.t === "op" && tok.s === "|") {
          alts.push(cur);
          cur = "";
          continue;
        }
        let atom: string;
        if (tok.t === "lit") atom = `(?:${tok.s.replace(REGEX_SYNTAX, "\\$&")})`;
        else if (tok.t === "cls") atom = tok.s;
        else if (tok.t === "ref") atom = `(?:${compile(tok.s)})`;
        else if (tok.t === "op" && tok.s === "(") {
          atom = `(?:${seq()})`;
          pos++; // the ")"
        } else throw new Error(`gbnf: misplaced ${tok.s} in rule ${name}`);
        while (pos < toks.length && toks[pos].t === "post") atom = `(?:${atom})${toks[pos++].s}`;
        cur += atom;
      }
      alts.push(cur);
      return alts.join("|");
    };
    const out = seq();
    busy.delete(name);
    done.set(name, out);
    return out;
  };
  return new RegExp(`^(?:${compile("root")})$`, "u");
}

/** Whether the grammar accepts `text` whole. */
export function gbnfAccepts(grammar: string | RegExp, text: string): boolean {
  const re = typeof grammar === "string" ? gbnfToRegExp(grammar) : grammar;
  return re.test(text);
}
