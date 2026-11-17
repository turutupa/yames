// The handful of W3C WebDriver calls the suite uses, over fetch, so it needs
// no npm dependency. `tauri-driver` speaks this and hands it to
// WebKitWebDriver, which drives the app's own webview.
const ELEMENT = "element-6066-11e4-a52e-4a6f6e9c6e2e";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class Driver {
  constructor(base = "http://127.0.0.1:4444") {
    this.base = base;
    this.id = null;
  }

  async call(method, path, body) {
    const res = await fetch(`${this.base}${path}`, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.value?.error) {
      const err = new Error(`${method} ${path}: ${json?.value?.error ?? res.status} ${json?.value?.message ?? ""}`);
      err.webdriver = json?.value;
      throw err;
    }
    return json.value;
  }

  s(path) {
    return `/session/${this.id}${path}`;
  }

  async start(application, args = []) {
    const value = await this.call("POST", "/session", {
      capabilities: {
        alwaysMatch: { "tauri:options": { application, args } },
      },
    });
    this.id = value.sessionId;
    return this;
  }

  async quit() {
    if (!this.id) return;
    try {
      await this.call("DELETE", `/session/${this.id}`);
    } catch {
      /* the app may already be gone */
    }
    this.id = null;
  }

  /** Run a function body in the page. `arguments` holds `args`. */
  exec(script, args = []) {
    return this.call("POST", this.s("/execute/sync"), { script, args });
  }

  execAsync(script, args = []) {
    return this.call("POST", this.s("/execute/async"), { script, args });
  }

  /** Invoke a Tauri command from the page, as the app's own `ipc.ts` would. */
  invoke(cmd, payload = {}) {
    return this.execAsync(
      `const done = arguments[arguments.length - 1];
       window.__TAURI_INTERNALS__.invoke(arguments[0], arguments[1])
         .then((v) => done({ ok: v }), (e) => done({ err: String(e) }));`,
      [cmd, payload],
    ).then((r) => {
      if (r && "err" in r) throw new Error(`${cmd}: ${r.err}`);
      return r?.ok;
    });
  }

  async screenshot() {
    return Buffer.from(await this.call("GET", this.s("/screenshot")), "base64");
  }

  /** The visible text of the page. */
  text() {
    return this.exec("return document.body ? document.body.innerText : ''");
  }

  async waitText(re, timeoutMs = 20000) {
    const t0 = Date.now();
    let last = "";
    while (Date.now() - t0 < timeoutMs) {
      try {
        last = await this.text();
        const m = last.match(re);
        if (m) return m;
      } catch {
        /* page reloading */
      }
      await sleep(200);
    }
    const err = new Error(`timed out waiting for ${re}; the page said:\n${last.slice(0, 2000)}`);
    err.pageText = last;
    throw err;
  }

  /**
   * Click the first visible, enabled button (or role=button / link / radio)
   * whose text or aria-label matches. Done in the page, so React sees a real
   * click event.
   */
  async clickText(re, { timeoutMs = 15000, selector = "button, [role=button], [role=radio], [role=tab], a, label" } = {}) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const hit = await this.exec(
        `const [src, flags, sel] = arguments;
         const re = new RegExp(src, flags);
         const els = [...document.querySelectorAll(sel)];
         const ok = (el) => {
           const r = el.getBoundingClientRect();
           const labels = [el.getAttribute('aria-label') || '', (el.innerText || el.textContent || '').trim()];
           return r.width > 0 && r.height > 0 && !el.disabled && el.getAttribute('aria-disabled') !== 'true' && labels.some((l) => l && re.test(l));
         };
         const el = els.find(ok);
         if (!el) return null;
         el.scrollIntoView({ block: 'center' });
         el.click();
         return (el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 80);`,
        [re.source, re.flags, selector],
      );
      if (hit !== null) return hit;
      await sleep(200);
    }
    throw new Error(`no clickable ${re} within ${timeoutMs} ms; the page said:\n${(await this.text().catch(() => "")).slice(0, 1500)}`);
  }

  /**
   * Click a button matching `buttonRe` inside the smallest element whose text
   * matches `containerRe`: "the Play this of the Four fingers card".
   */
  async clickIn(containerRe, buttonRe, { timeoutMs = 15000 } = {}) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const hit = await this.exec(
        `const [cs, cf, bs, bf] = arguments;
         const cre = new RegExp(cs, cf), bre = new RegExp(bs, bf);
         const buttons = [...document.querySelectorAll('button,[role=button]')].filter((b) => {
           const r = b.getBoundingClientRect();
           return r.width > 0 && !b.disabled && bre.test((b.innerText || b.getAttribute('aria-label') || '').trim());
         });
         let best = null, bestLen = Infinity;
         for (const b of buttons) {
           for (let el = b.parentElement; el; el = el.parentElement) {
             const t = el.innerText || '';
             if (cre.test(t)) {
               if (t.length < bestLen) { best = b; bestLen = t.length; }
               break;
             }
           }
         }
         if (!best) return null;
         best.scrollIntoView({ block: 'center' });
         best.click();
         return (best.innerText || '').trim();`,
        [containerRe.source, containerRe.flags, buttonRe.source, buttonRe.flags],
      );
      if (hit !== null) return hit;
      await sleep(200);
    }
    throw new Error(`no ${buttonRe} inside ${containerRe} within ${timeoutMs} ms`);
  }

  /** Every button's label on the page, for debugging a failed step. */
  buttons() {
    return this.exec(
      `return [...document.querySelectorAll('button,[role=button],[role=radio]')]
         .filter((b) => b.getBoundingClientRect().width > 0)
         .map((b) => ((b.getAttribute('aria-label') || '') + ' | ' + (b.innerText || '').trim()).slice(0, 80) + (b.disabled ? ' (disabled)' : ''));`,
    );
  }
}
