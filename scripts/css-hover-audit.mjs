#!/usr/bin/env node
/**
 * css-hover-audit — find :hover styling that would stick on a touch screen.
 *
 * On a touch device there is no pointer to move away, so a tapped element
 * keeps its :hover state until the next tap lands somewhere else. Every rule
 * whose selector uses :hover must therefore live inside an
 * `@media (hover: hover)` block, which phones never match.
 *
 * Usage:
 *   node scripts/css-hover-audit.mjs              # audit src/styles
 *   node scripts/css-hover-audit.mjs path ...     # audit files or directories
 *   node scripts/css-hover-audit.mjs --json       # machine-readable output
 *
 * Exit code 0 when every :hover rule is wrapped, 1 when any is not, 2 on a
 * usage or parse error.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DEFAULT_TARGET = join(REPO_ROOT, 'src', 'styles');

/** A media condition that proves the block only applies to hovering devices. */
const HOVER_CAPABLE = /(^|[^\w-])hover\s*:\s*hover(?![\w-])/;

/* ------------------------------------------------------------------ parsing */

/**
 * Walk a stylesheet and hand back every style rule with its selector, the
 * 1-based line its selector starts on, and the stack of at-rule preludes it
 * sits inside.
 *
 * This is a deliberately small scanner rather than a full CSS parser: it only
 * has to find `prelude {` boundaries, so it tracks strings, comments and
 * brackets and ignores everything else. The stylesheets under src/styles use
 * no CSS nesting, so a block whose prelude does not start with `@` is a style
 * rule and its children are declarations.
 */
function parseRules(css) {
  const rules = [];
  const stack = [];
  let prelude = '';
  let preludeStart = -1;
  let line = 1;
  let i = 0;

  const lineOf = (offset) => {
    let n = 1;
    for (let k = 0; k < offset; k += 1) if (css[k] === '\n') n += 1;
    return n;
  };

  while (i < css.length) {
    const c = css[i];

    // Comments.
    if (c === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      const stop = end === -1 ? css.length : end + 2;
      for (let k = i; k < stop; k += 1) if (css[k] === '\n') line += 1;
      i = stop;
      continue;
    }

    // Strings: copied through verbatim so a `{` inside content: "" is inert.
    if (c === '"' || c === "'") {
      const quote = c;
      let k = i + 1;
      while (k < css.length) {
        if (css[k] === '\\') {
          k += 2;
          continue;
        }
        if (css[k] === quote) break;
        if (css[k] === '\n') line += 1;
        k += 1;
      }
      prelude += css.slice(i, k + 1);
      i = k + 1;
      continue;
    }

    if (c === '{') {
      const text = prelude.trim();
      const isAtRule = text.startsWith('@');
      const start = preludeStart === -1 ? i : preludeStart;
      stack.push({ atRule: isAtRule ? text : null });
      if (!isAtRule && text) {
        rules.push({
          selector: text,
          line: lineOf(start),
          ancestors: stack
            .slice(0, -1)
            .map((frame) => frame.atRule)
            .filter(Boolean),
        });
      }
      prelude = '';
      preludeStart = -1;
      i += 1;
      continue;
    }

    if (c === '}') {
      stack.pop();
      prelude = '';
      preludeStart = -1;
      i += 1;
      continue;
    }

    // `@import ...;` and declarations end a prelude without opening a block.
    if (c === ';') {
      prelude = '';
      preludeStart = -1;
      i += 1;
      continue;
    }

    if (c === '\n') line += 1;
    if (prelude.trim() === '' && !/\s/.test(c)) preludeStart = i;
    prelude += c;
    i += 1;
  }

  return rules;
}

/** Selectors in a comma-separated list, respecting brackets and quotes. */
export function splitSelectorList(selector) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (let i = 0; i < selector.length; i += 1) {
    const c = selector[i];
    if (c === '"' || c === "'") {
      const quote = c;
      let k = i + 1;
      while (k < selector.length && selector[k] !== quote) {
        if (selector[k] === '\\') k += 1;
        k += 1;
      }
      current += selector.slice(i, k + 1);
      i = k;
      continue;
    }
    if (c === '(' || c === '[') depth += 1;
    else if (c === ')' || c === ']') depth -= 1;
    if (c === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += c;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

/** True when this single selector depends on the pointer hovering. */
export function usesHover(selector) {
  // The pseudo-class itself, not `.is-hover`, `[data-hover]` or `:hoverish`.
  return /:hover(?![\w-])/.test(selector);
}

/** True when one of the enclosing at-rules limits the block to hover devices. */
function isHoverGuarded(ancestors) {
  return ancestors.some(
    (at) => /^@media\b/i.test(at) && HOVER_CAPABLE.test(at),
  );
}

/* ------------------------------------------------------------------- driver */

function collectCssFiles(target) {
  const stats = statSync(target);
  if (stats.isFile()) return target.endsWith('.css') ? [target] : [];
  const out = [];
  for (const entry of readdirSync(target, { withFileTypes: true })) {
    const full = join(target, entry.name);
    if (entry.isDirectory()) out.push(...collectCssFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.css')) out.push(full);
  }
  return out.sort();
}

export function auditFile(file) {
  const css = readFileSync(file, 'utf8');
  const findings = [];
  for (const rule of parseRules(css)) {
    const hoverSelectors = splitSelectorList(rule.selector).filter(usesHover);
    if (hoverSelectors.length === 0) continue;
    if (isHoverGuarded(rule.ancestors)) continue;
    findings.push({
      file,
      line: rule.line,
      selector: rule.selector.replace(/\s+/g, ' '),
      hoverSelectors,
    });
  }
  return findings;
}

function main(argv) {
  const json = argv.includes('--json');
  const targets = argv.filter((a) => !a.startsWith('--'));
  const roots = targets.length ? targets.map((t) => resolve(t)) : [DEFAULT_TARGET];

  const files = [];
  for (const root of roots) {
    try {
      files.push(...collectCssFiles(root));
    } catch (err) {
      process.stderr.write(`css-hover-audit: cannot read ${root}: ${err.message}\n`);
      return 2;
    }
  }

  const findings = files.flatMap(auditFile);

  if (json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          filesScanned: files.length,
          unwrapped: findings.length,
          findings: findings.map((f) => ({
            ...f,
            file: relative(REPO_ROOT, f.file).split(sep).join('/'),
          })),
        },
        null,
        2,
      )}\n`,
    );
    return findings.length ? 1 : 0;
  }

  for (const f of findings) {
    const rel = relative(REPO_ROOT, f.file).split(sep).join('/');
    process.stdout.write(`${rel}:${f.line}  ${f.selector}\n`);
  }

  const byFile = new Map();
  for (const f of findings) byFile.set(f.file, (byFile.get(f.file) ?? 0) + 1);
  if (findings.length) {
    process.stdout.write('\nUnwrapped :hover rules by file\n');
    for (const [file, count] of [...byFile].sort((a, b) => b[1] - a[1])) {
      const rel = relative(REPO_ROOT, file).split(sep).join('/');
      process.stdout.write(`  ${String(count).padStart(4)}  ${rel}\n`);
    }
  }

  process.stdout.write(
    `\n${files.length} stylesheet(s) scanned, ${findings.length} rule(s) using :hover outside @media (hover: hover).\n`,
  );
  if (findings.length) {
    process.stdout.write(
      'Hover styling sticks after a tap on a touch screen. Wrap each rule in\n' +
        '@media (hover: hover), or split the :hover half out of a mixed selector list.\n',
    );
  }
  return findings.length ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  process.exit(main(process.argv.slice(2)));
}
