/* ============================================================
   yames.app
   Palette tokens mirror src/themes.ts. The landing palette is
   LANDING_THEME below, overridable with ?theme=<id> for testing.
   ============================================================ */
(() => {
  "use strict";

  /** Which palette the page lands on. "obsidian" = warm, "aurora" = cool. */
  const LANDING_THEME = "obsidian";

  /** Which Zen visual the band opens on. Must be one of ZEN_STYLES. */
  const LANDING_ZEN = "warp";

  /** id + display name + the two swatch colours (bg, accent) from src/themes.ts */
  const THEMES = [
    { id: "mono", name: "Mono", bg: "#121212", accent: "#d4d4d4" },
    { id: "obsidian", name: "Obsidian", bg: "#0a0a0a", accent: "#f59e0b" },
    { id: "velvet", name: "Velvet", bg: "#110b1e", accent: "#8b5cf6" },
    { id: "neon", name: "Neon", bg: "#0c0c18", accent: "#06b6d4" },
    { id: "aurora", name: "Aurora", bg: "#0a0020", accent: "#00d4ff" },
    { id: "ivory", name: "Ivory", bg: "#faf8f2", accent: "#b8860b" },
    { id: "arctic", name: "Arctic", bg: "#f0f4f8", accent: "#0369a1" },
    { id: "sand", name: "Sand", bg: "#f5f0e8", accent: "#92400e" },
    { id: "lavender", name: "Lavender", bg: "#f5f0ff", accent: "#7c3aed" },
    { id: "prism", name: "Prism", bg: "#ffe0f0", accent: "#ff3d8a" },
  ];

  // Same seven the app ships (src/containers/zen/ZenEffects.tsx).
  const ZEN_STYLES = [
    "cosmos",
    "gravity",
    "rain",
    "warp",
    "radar",
    "pulse",
    "focus",
  ];

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  const store = {
    get(key, fallback) {
      try {
        return localStorage.getItem(key) ?? fallback;
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, value);
      } catch {
        /* private mode — the page works without it */
      }
    },
  };

  /* ── Theme engine ─────────────────────────────────────── */

  const params = new URLSearchParams(location.search);
  const requested = params.get("theme");
  const valid = (id) => THEMES.some((t) => t.id === id);

  let currentTheme = valid(requested)
    ? requested
    : valid(store.get("yames-theme"))
      ? store.get("yames-theme")
      : LANDING_THEME;

  const themeIndex = (id) => THEMES.findIndex((t) => t.id === id);

  function applyTheme(id, { persist = true } = {}) {
    if (!valid(id)) return;
    currentTheme = id;
    document.documentElement.dataset.theme = id;
    if (persist) store.set("yames-theme", id);

    const meta = $('meta[name="theme-color"]');
    const theme = THEMES[themeIndex(id)];
    if (meta && theme) meta.setAttribute("content", theme.bg);

    // The coach screenshot follows the picker too, otherwise the page
    // shows one theme while claiming another.
    const coachShot = $("#coach-shot");
    if (coachShot) coachShot.src = `img/metronome/${id}-metronome.webp`;

    updateFan();
    updatePicker();
    zen.recolour();
  }

  /* ── Theme fan (slot-machine roll) ────────────────────── */

  const track = $("#fan-track");

  /* The row is rendered three times over. With ten themes and the
     selected one centred, a selection near either end would otherwise
     run out of cards and leave the row stopping in mid-screen — which
     reads as the strip being cut off. Only the middle copy is real to
     assistive tech and to the tab order. */
  const COPIES = 3;
  const PRIMARY = 1;

  function makeCard(theme, primary) {
    const li = document.createElement("li");
    li.className = "fan__card";
    li.dataset.theme = theme.id;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "fan__btn";
    btn.setAttribute("aria-label", `Preview the ${theme.name} theme`);

    const img = document.createElement("img");
    img.src = `img/metronome/${theme.id}-metronome.webp`;
    img.alt = primary ? `Yames in the ${theme.name} theme` : "";
    img.width = 1400;
    img.height = 1050;
    img.decoding = "async";
    // The landing theme's card is the LCP image; the rest can wait.
    const isLanding = primary && theme.id === currentTheme;
    img.loading = isLanding ? "eager" : "lazy";
    if (isLanding) img.fetchPriority = "high";

    btn.append(img);
    btn.addEventListener("click", () => applyTheme(theme.id));
    li.append(btn);

    if (!primary) {
      // The copies exist to fill the eye, not to be read out or tabbed to.
      li.setAttribute("aria-hidden", "true");
      btn.tabIndex = -1;
    }
    return li;
  }

  function buildFan() {
    track.innerHTML = "";
    for (let copy = 0; copy < COPIES; copy++) {
      for (const theme of THEMES) {
        track.append(makeCard(theme, copy === PRIMARY));
      }
    }
  }

  function updateFan() {
    const cards = $$(".fan__card", track);
    if (!cards.length) return;
    // Centre on the middle copy, so there is always a full row either side.
    const active = PRIMARY * THEMES.length + themeIndex(currentTheme);

    // Fixed steps rather than a formula, so the outermost visible card is
    // all but transparent and the row dissolves at the screen edge
    // whatever the viewport width.
    const FADE = [1, 0.85, 0.5, 0.22, 0.06];

    cards.forEach((card, i) => {
      const distance = Math.abs(i - active);
      card.style.setProperty(
        "--fade",
        String(distance < FADE.length ? FADE[distance] : 0),
      );
      card.classList.toggle("is-active", i === active);
      card.classList.toggle("is-near", distance === 1);

      const btn = card.querySelector(".fan__btn");
      if (!btn || card.getAttribute("aria-hidden") === "true") return;
      btn.setAttribute("aria-pressed", i === active ? "true" : "false");
      // Cards past the fold should not be tab stops.
      btn.tabIndex = distance <= 1 ? 0 : -1;
    });

    rollTo(active);
  }

  /** Translate the track so the active card sits dead centre. */
  function rollTo(index) {
    const cards = $$(".fan__card", track);
    const card = cards[index];
    if (!card) return;
    const viewport = track.parentElement;
    const offset =
      card.offsetLeft + card.offsetWidth / 2 - viewport.clientWidth / 2;
    track.style.transform = `translate3d(${-offset}px, 0, 0)`;
  }

  /* ── Theme picker ─────────────────────────────────────── */

  const picker = $("#picker");

  function buildPicker() {
    picker.innerHTML = "";
    THEMES.forEach((theme) => {
      const btn = document.createElement("button");
      btn.className = "swatch";
      btn.type = "button";
      btn.dataset.theme = theme.id;
      btn.setAttribute("role", "radio");
      btn.setAttribute("aria-label", `${theme.name} theme`);
      btn.dataset.name = theme.name;
      btn.style.background = `linear-gradient(135deg, ${theme.bg} 50%, ${theme.accent} 50%)`;
      btn.addEventListener("click", () => applyTheme(theme.id));
      picker.append(btn);
    });
  }

  function updatePicker() {
    const caption = $("#picker-name");
    if (caption) {
      caption.textContent = THEMES[themeIndex(currentTheme)]?.name ?? "";
    }

    $$(".swatch", picker).forEach((btn) => {
      const on = btn.dataset.theme === currentTheme;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-checked", on ? "true" : "false");
      btn.tabIndex = on ? 0 : -1;
    });
  }

  // Arrow keys move through the picker, as a radiogroup should.
  picker.addEventListener("keydown", (e) => {
    const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
    const next = (themeIndex(currentTheme) + step + THEMES.length) % THEMES.length;
    applyTheme(THEMES[next].id);
    $(`.swatch[data-theme="${THEMES[next].id}"]`, picker)?.focus();
  });

  /* ── Download / platform ──────────────────────────────── */

  const FALLBACK = "https://github.com/turutupa/yames/releases/latest";

  const ASSET_PATTERNS = {
    "macos-silicon": /aarch64\.dmg$/,
    "macos-intel": /x64\.dmg$/,
    windows: /x64-setup\.exe$/,
    linux: /amd64\.deb$/,
  };

  const OS_LABELS = {
    "macos-silicon": "macOS",
    "macos-intel": "macOS",
    windows: "Windows",
    linux: "Linux",
  };

  const CLI_COMMANDS = {
    "macos-silicon": "brew install --cask turutupa/tap/yames",
    "macos-intel": "brew install --cask turutupa/tap/yames",
    windows: "winget install turutupa.yames",
    linux: "sudo snap install yames",
  };

  const CLI_LABELS = {
    "macos-silicon": "or install via Homebrew:",
    "macos-intel": "or install via Homebrew:",
    windows: "or install via winget:",
    linux: "or install via Snap:",
  };

  const COMING_SOON = { linux: true };

  const ua = navigator.userAgent.toLowerCase();
  let detectedOS = "macos-silicon";
  if (ua.includes("win")) detectedOS = "windows";
  else if (ua.includes("linux") && !ua.includes("android")) detectedOS = "linux";

  const assetURLs = {};
  const downloadBtns = [$("#download-btn"), $("#download-btn-2")].filter(
    Boolean,
  );

  function setOS(os) {
    detectedOS = os;
    $$(".platform-pill").forEach((pill) =>
      pill.classList.toggle("active", pill.dataset.os === os),
    );

    const label = $("#os-name");
    if (label) label.textContent = OS_LABELS[os] || "macOS";
    downloadBtns.forEach((btn) => {
      btn.href = assetURLs[os] || FALLBACK;
    });

    const cmd = $("#cli-cmd");
    const cmdLabel = $(".brew-label");
    if (cmd) {
      cmd.textContent = CLI_COMMANDS[os] || CLI_COMMANDS["macos-silicon"];
      cmd.classList.toggle("disabled", Boolean(COMING_SOON[os]));
    }
    if (cmdLabel) {
      const text = CLI_LABELS[os] || CLI_LABELS["macos-silicon"];
      cmdLabel.innerHTML = COMING_SOON[os]
        ? `${text} <span class="soon-badge">soon</span>`
        : text;
    }
  }

  $$(".platform-pill").forEach((pill) =>
    pill.addEventListener("click", () => setOS(pill.dataset.os)),
  );

  setOS(detectedOS);

  fetch("https://api.github.com/repos/turutupa/yames/releases/latest")
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
    .then((data) => {
      if (Array.isArray(data.assets)) {
        for (const [os, pattern] of Object.entries(ASSET_PATTERNS)) {
          const asset = data.assets.find((a) => pattern.test(a.name));
          if (asset) assetURLs[os] = asset.browser_download_url;
        }
        setOS(detectedOS);
      }
      if (data.tag_name) {
        const n = $("#version-number");
        if (n) n.textContent = data.tag_name.replace(/^v/, "");
      }
    })
    .catch(() => {
      /* the buttons already point at the releases page */
    });

  // Copy the install one-liner
  const cmdEl = $("#cli-cmd");
  if (cmdEl) {
    const copy = () => {
      if (cmdEl.classList.contains("disabled")) return;
      navigator.clipboard
        ?.writeText(cmdEl.textContent.trim())
        .then(() => {
          cmdEl.classList.add("copied");
          setTimeout(() => cmdEl.classList.remove("copied"), 1500);
        })
        .catch(() => {});
    };
    cmdEl.addEventListener("click", copy);
    cmdEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        copy();
      }
    });
  }

  /* ── Price, in the reader's currency ──────────────────── */

  // Zero is zero in every currency; this only picks the symbol so the
  // figure doesn't read as foreign. Unknown locale falls back to "$".
  const CURRENCY_BY_REGION = {
    GB: "£", IE: "€", DE: "€", FR: "€", ES: "€", IT: "€", PT: "€", NL: "€",
    BE: "€", AT: "€", FI: "€", GR: "€", SK: "€", SI: "€", EE: "€", LV: "€",
    LT: "€", LU: "€", CY: "€", MT: "€", HR: "€", JP: "¥", CN: "¥", KR: "₩",
    IN: "₹", BR: "R$", MX: "$", AR: "$", CL: "$", CO: "$", RU: "₽", TR: "₺",
    PL: "zł", CZ: "Kč", SE: "kr", NO: "kr", DK: "kr", IS: "kr", CH: "CHF",
    ZA: "R", NG: "₦", IL: "₪", TH: "฿", VN: "₫", PH: "₱", ID: "Rp",
    AU: "$", NZ: "$", CA: "$", US: "$",
  };

  function currencySymbol() {
    try {
      const locale = new Intl.Locale(navigator.language);
      const region = locale.maximize().region;
      return CURRENCY_BY_REGION[region] || "$";
    } catch {
      return "$";
    }
  }

  const priceFigure = $("#price-figure");
  if (priceFigure) {
    const symbol = currencySymbol();
    // Symbol leads for $-style currencies, trails for the rest.
    priceFigure.textContent =
      symbol === "$" || symbol === "£" || symbol === "¥" || symbol === "₹"
        ? `${symbol}0`
        : `0 ${symbol}`;
  }


  /* ── Changelog ────────────────────────────────────────── */

  const RELEASES_URL = "https://api.github.com/repos/turutupa/yames/releases";
  const INITIAL_SHOW = 5;

  const overlay = $("#changelog-overlay");
  const changelogBody = $("#changelog-body");
  let changelogLoaded = false;
  let lastFocused = null;

  // Timeline rail state
  let tlObserver = null;
  let tlVisible = new Set();
  let tlActive = 0;
  let tlRafPending = false;

  function escHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  /** Naive inline markdown — enough for GitHub release notes. */
  function formatBody(text) {
    const inline = (raw) =>
      escHtml(raw)
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>")
        .replace(/~~(.+?)~~/g, "<del>$1</del>")
        .replace(/`(.+?)`/g, "<code>$1</code>");

    let html = "";
    let inList = false;
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      // The version header is already rendered above the notes.
      if (/^#{1,3}\s/.test(trimmed)) continue;
      // Space after the marker is required, so **bold** doesn't match.
      if (/^[-*] /.test(trimmed)) {
        if (!inList) {
          html += "<ul>";
          inList = true;
        }
        html += "<li>" + inline(trimmed.replace(/^[-*] /, "")) + "</li>";
      } else {
        if (inList) {
          html += "</ul>";
          inList = false;
        }
        html += "<p>" + inline(trimmed) + "</p>";
      }
    }
    if (inList) html += "</ul>";
    return html;
  }

  function applyTicks() {
    $$(".tl-tick").forEach((tick, i) => {
      tick.classList.toggle("tl-active", i === tlActive);
      tick.classList.toggle("tl-visible", i !== tlActive && tlVisible.has(i));
    });
  }

  function buildTimeline(releases) {
    const rail = $("#changelog-timeline");
    rail.innerHTML = releases
      .map((rel, i) => {
        const hidden = i >= INITIAL_SHOW ? " tl-hidden" : "";
        // Tick width tracks how much actually changed in that release.
        const bullets = (rel.body || "")
          .split("\n")
          .filter((l) => /^\s*[-*]/.test(l)).length;
        const tw = Math.max(6, Math.min(20, 6 + bullets * 2));
        return `<div class="tl-tick${hidden}" data-index="${i}" style="--tw:${tw}px"><div class="tl-tooltip">${escHtml(rel.tag_name)}</div></div>`;
      })
      .join("");

    rail.querySelectorAll(".tl-tick").forEach((tick) => {
      tick.addEventListener("click", () => {
        const idx = Number(tick.dataset.index);
        tlActive = idx;
        $$(".changelog-release", changelogBody)[idx]?.scrollIntoView({
          behavior: reduceMotion ? "auto" : "smooth",
          block: "start",
        });
        applyTicks();
      });
    });

    observeReleases();
    applyTicks();
  }

  function observeReleases() {
    if (tlObserver) tlObserver.disconnect();
    tlVisible = new Set();
    // IntersectionObserver rather than scroll listeners — no layout reads.
    tlObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const idx = Number(entry.target.dataset.tlIndex);
          if (entry.isIntersecting) tlVisible.add(idx);
          else tlVisible.delete(idx);
        }
        if (tlVisible.size) tlActive = Math.min(...tlVisible);
        if (!tlRafPending) {
          tlRafPending = true;
          requestAnimationFrame(() => {
            tlRafPending = false;
            applyTicks();
          });
        }
      },
      { root: $(".changelog-content"), threshold: 0.1 },
    );

    $$(".changelog-release", changelogBody).forEach((el, i) => {
      el.dataset.tlIndex = i;
      if (!el.classList.contains("changelog-hidden")) tlObserver.observe(el);
    });
  }

  function showAllReleases(btn) {
    $$(".changelog-hidden").forEach((el) =>
      el.classList.remove("changelog-hidden"),
    );
    $$(".tl-hidden").forEach((el) => el.classList.remove("tl-hidden"));
    btn.remove();
    observeReleases();
    applyTicks();
  }

  async function loadChangelog() {
    try {
      const res = await fetch(RELEASES_URL + "?per_page=30");
      if (!res.ok) throw new Error(String(res.status));
      const releases = await res.json();
      if (!Array.isArray(releases) || !releases.length) {
        changelogBody.innerHTML =
          '<div class="changelog-empty">No releases found.</div>';
        return;
      }

      const version = $("#version-number");
      if (version) version.textContent = releases[0].tag_name.replace(/^v/, "");

      let html = releases
        .map((rel, i) => {
          const date = rel.published_at
            ? new Date(rel.published_at).toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
              })
            : "";
          const hasNotes =
            rel.body && rel.body !== "Download Yames for your platform below.";
          const notes = hasNotes
            ? formatBody(rel.body)
            : '<span class="changelog-no-notes">Release artifacts only.</span>';
          return `<div class="changelog-release${i >= INITIAL_SHOW ? " changelog-hidden" : ""}">
              <div class="changelog-release-header">
                <span class="changelog-version">${escHtml(rel.tag_name)}</span>
                <span class="changelog-date">${escHtml(date)}</span>
              </div>
              <div class="changelog-notes">${notes}</div>
            </div>`;
        })
        .join("");

      if (releases.length > INITIAL_SHOW) {
        html += `<button class="changelog-load-more" type="button">Show ${releases.length - INITIAL_SHOW} older releases</button>`;
      }

      changelogBody.innerHTML = html;
      $(".changelog-load-more", changelogBody)?.addEventListener(
        "click",
        (e) => showAllReleases(e.currentTarget),
      );
      changelogLoaded = true;
      // Built synchronously: the rail only needs the DOM, not layout, and
      // rAF never fires if the changelog is opened in a background tab.
      buildTimeline(releases);
    } catch {
      changelogBody.innerHTML = `<div class="changelog-empty">Couldn&rsquo;t load releases.
        <a href="https://github.com/turutupa/yames/releases" target="_blank" rel="noopener">View on GitHub &rarr;</a></div>`;
    }
  }

  function openChangelog() {
    lastFocused = document.activeElement;
    overlay.classList.add("is-open");
    document.body.style.overflow = "hidden";
    $("#changelog-close")?.focus();
    if (!changelogLoaded) loadChangelog();
  }

  function closeChangelog() {
    overlay.classList.remove("is-open");
    document.body.style.overflow = "";
    lastFocused?.focus();
  }

  $("#version-badge")?.addEventListener("click", openChangelog);
  $("#changelog-close")?.addEventListener("click", closeChangelog);
  overlay?.addEventListener("click", (e) => {
    if (e.target === overlay) closeChangelog();
  });
  document.addEventListener("keydown", (e) => {
    if (!overlay.classList.contains("is-open")) return;

    if (e.key === "Escape") {
      closeChangelog();
      return;
    }

    // Keep focus inside the dialog while it is open.
    if (e.key === "Tab") {
      const focusable = $$(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        overlay,
      ).filter((el) => el.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  /* ── Reveals, parallax, sticky nav ────────────────────── */

  $$(".reveal").forEach((el) => {
    const delay = el.dataset.revealDelay;
    if (delay) el.style.setProperty("--reveal-delay", delay);
  });

  if (reduceMotion) {
    $$(".reveal").forEach((el) => el.classList.add("is-in"));
  } else {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            observer.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.08 },
    );
    $$(".reveal").forEach((el) => observer.observe(el));
  }

  const parallaxEls = $$("[data-parallax]");
  let ticking = false;

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const y = window.scrollY;
      if (!reduceMotion) {
        for (const el of parallaxEls) {
          const rate = parseFloat(el.dataset.parallax) || 0;
          el.style.transform = `translate3d(0, ${(y * rate).toFixed(2)}px, 0)`;
        }
      }
      ticking = false;
    });
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", () => {
    rollTo(PRIMARY * THEMES.length + themeIndex(currentTheme));
    zen.resize();
  });

  /* ── Zen ──────────────────────────────────────────────────
     The six canvas effects are ported from the app itself
     (src/containers/zen/effects/*) so the site shows what Zen
     mode actually looks like. Constants and per-frame maths are
     kept as they are there; the only substitutions are the
     canvas's own box instead of the window, --a1 instead of
     --accent, and a synthetic 120 BPM beat in place of the real
     metronome. "focus" draws nothing, exactly as in the app.
     ────────────────────────────────────────────────────────── */

  const zen = (() => {
    const canvas = $("#zen-canvas");
    const ctx = canvas?.getContext("2d");

    const BPM = 120;
    const BEAT_MS = 60000 / BPM;
    const BEATS_PER_BAR = 4;

    let w = 0;
    let h = 0;
    let rafId = null;
    let running = false;
    let style = store.get("yames-zen-style", LANDING_ZEN);
    if (!ZEN_STYLES.includes(style)) style = LANDING_ZEN;

    let accent = { r: 0, g: 212, b: 255 };
    let hues = [190, 220, 160];
    let fadeRgb = "0,0,0";

    // Synthetic transport, standing in for the app's BeatEvent stream.
    let beatIndex = -1;
    let lastBeatAt = 0;

    // Per-effect state
    let cosmosParticles = [];
    let gravityDots = [];
    let rainDrops = [];
    let radarDots = [];
    let pulseRingList = [];
    let warpAngle = 0;
    let radarAngle = 0;
    let gravityPulse = 0;
    let pulseTick = 0;
    const mouse = { x: -300, y: -300 };

    function readAccent() {
      const value = getComputedStyle(document.documentElement)
        .getPropertyValue("--a1")
        .trim()
        .replace("#", "");
      if (value.length < 6) return;
      const r = parseInt(value.slice(0, 2), 16);
      const g = parseInt(value.slice(2, 4), 16);
      const b = parseInt(value.slice(4, 6), 16);
      accent = { r, g, b };

      // Cosmos tints particles in three hues around the accent.
      const rn = r / 255;
      const gn = g / 255;
      const bn = b / 255;
      const max = Math.max(rn, gn, bn);
      const min = Math.min(rn, gn, bn);
      let hue = 0;
      if (max !== min) {
        const d = max - min;
        if (max === rn) hue = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
        else if (max === gn) hue = ((bn - rn) / d + 2) * 60;
        else hue = ((rn - gn) / d + 4) * 60;
      }
      hue = Math.round(hue);
      hues = [hue, (hue + 30) % 360, (hue + 330) % 360];

      // Rain trails fade toward the page background, not always black,
      // so the effect works on the five light themes too.
      fadeRgb =
        getComputedStyle(document.documentElement)
          .getPropertyValue("--fade-rgb")
          .trim() || "0,0,0";
    }

    /* The app draws these fullscreen on a plain dark window. Here they
       compete with a scrim and the copy on top, so every effect's alpha
       is scaled by GAIN. This is the one deliberate departure from the
       app's values — the geometry and motion are untouched. */
    const GAIN = 2.2;
    const av = (a) => Math.min(1, a * GAIN);

    const rgba = (a) => `rgba(${accent.r}, ${accent.g}, ${accent.b}, ${av(a)})`;

    /* ── seeding ── */

    function seedCosmos() {
      // Same density-per-px² rule the app uses, so the field looks the
      // same whether it is a section or a fullscreen window.
      const density = 65 / (window.innerWidth * window.innerHeight);
      const target = Math.max(40, Math.round(w * h * density));
      cosmosParticles = Array.from({ length: target }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
        size: Math.random() * 4 + 1.5,
        opacity: Math.random() * 0.45 + 0.1,
        hue: hues[Math.floor(Math.random() * hues.length)],
        ripple: 0,
        depth: Math.random(),
      }));
    }

    function seedGravity() {
      const cx = w / 2;
      const cy = h / 2;
      const maxR = Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy));
      gravityDots = Array.from({ length: 100 }, () => ({
        angle: Math.random() * Math.PI * 2,
        r: 30 + Math.random() * maxR,
        speed: (0.0018 + Math.random() * 0.005) * (Math.random() < 0.5 ? 1 : -1),
        size: 1 + Math.random() * 2.5,
        alpha: 0.2 + Math.random() * 0.5,
      }));
    }

    function seedRain() {
      rainDrops = Array.from({ length: 80 }, () => {
        const depth = Math.random();
        const ds = 0.3 + depth * 0.7;
        return {
          x: Math.random() * w,
          y: Math.random() * h,
          speed: (3 + depth * 7) * ds,
          length: (12 + depth * 25) * ds,
          opacity: 0.1 + depth * 0.35,
          depth,
        };
      });
    }

    function seedRadar() {
      radarDots = Array.from({ length: 50 }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        a: 0,
      }));
    }

    function seedPulse() {
      const cx = w / 2;
      const cy = h / 2;
      const maxR = Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy));
      pulseRingList = Array.from({ length: 5 }, (_, i) => ({
        r: (i / 5) * maxR * 0.75,
        a0: 0.85,
        lineWidth: 1.5,
      }));
    }

    function seedAll() {
      seedCosmos();
      seedGravity();
      seedRain();
      seedRadar();
      seedPulse();
    }

    /* ── effects ── */

    function cosmos() {
      for (const p of cosmosParticles) {
        const depthScale = 0.25 + p.depth * 0.75;
        p.x += p.vx * depthScale;
        p.y += p.vy * depthScale;
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10;
        if (p.y > h + 10) p.y = -10;
        p.vx += (Math.random() - 0.5) * 0.008;
        p.vy += (Math.random() - 0.5) * 0.008;
        p.vx = Math.max(-0.35, Math.min(0.35, p.vx));
        p.vy = Math.max(-0.35, Math.min(0.35, p.vy));

        const dx = p.x - mouse.x;
        const dy = p.y - mouse.y;
        const dist = Math.hypot(dx, dy);
        const boost = dist < 160 ? (1 - dist / 160) * 0.5 * depthScale : 0;
        const alpha = Math.min(1, p.opacity * depthScale + boost);

        const beatPulse = p.ripple > 0.02 ? p.ripple : 0;
        const light = 65 + beatPulse * 10;
        const alpha2 = Math.min(1, alpha + beatPulse * 0.15);
        const drawSize = p.size * depthScale + boost * 2;

        ctx.beginPath();
        ctx.arc(p.x, p.y, drawSize, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 80%, ${light}%, ${av(alpha2)})`;
        ctx.fill();

        if (alpha2 > 0.25) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, drawSize * 3 + boost * 3, 0, Math.PI * 2);
          ctx.fillStyle = `hsla(${p.hue}, 80%, ${light}%, ${av(alpha2 * 0.12)})`;
          ctx.fill();
        }

        if (p.ripple > 0.02) {
          const rippleRadius = drawSize + 12 * depthScale * (1 - p.ripple);
          ctx.beginPath();
          ctx.arc(p.x, p.y, rippleRadius, 0, Math.PI * 2);
          ctx.strokeStyle = `hsla(${p.hue}, 80%, 65%, ${av(p.ripple * 0.3 * depthScale)})`;
          ctx.lineWidth = 0.7 * depthScale;
          ctx.stroke();
          p.ripple *= 0.91;
        }
      }

      // Connection lines between nearby particles
      const ps = cosmosParticles;
      const maxDist = 150;
      for (let i = 0; i < ps.length; i++) {
        for (let j = i + 1; j < ps.length; j++) {
          const dx = ps[i].x - ps[j].x;
          const dy = ps[i].y - ps[j].y;
          const dist = Math.hypot(dx, dy);
          if (dist < maxDist) {
            const avgHue = (ps[i].hue + ps[j].hue) / 2;
            const depthFactor =
              Math.min(ps[i].depth + 0.3, 1) * Math.min(ps[j].depth + 0.3, 1);
            const a = 0.15 * (1 - dist / maxDist) * depthFactor;
            ctx.beginPath();
            ctx.moveTo(ps[i].x, ps[i].y);
            ctx.lineTo(ps[j].x, ps[j].y);
            ctx.strokeStyle = `hsla(${avgHue}, 80%, 65%, ${av(a)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }
    }

    function gravity() {
      const cx = w / 2;
      const cy = h / 2;
      gravityPulse *= 0.92;
      const speedMult = 1; // live BPM is fixed at 120 here

      for (const d of gravityDots) {
        d.angle += d.speed * speedMult;
        const px = cx + Math.cos(d.angle) * d.r;
        const py = cy + Math.sin(d.angle) * d.r;
        ctx.beginPath();
        ctx.arc(px, py, d.size * (1 + gravityPulse * 0.6), 0, Math.PI * 2);
        ctx.fillStyle = rgba(Math.min(1, d.alpha + gravityPulse * 0.3));
        ctx.fill();
      }
    }

    const RAIN_ANGLE = Math.sin(0.04);

    function rain() {
      // Trails: fade the previous frame toward the page background.
      ctx.fillStyle = `rgba(${fadeRgb}, 0.18)`;
      ctx.fillRect(0, 0, w, h);

      const { r, g, b } = accent;
      const rr = Math.min(255, r + (255 - r) * 0.3);
      const gg = Math.min(255, g + (255 - g) * 0.3);
      const bb = Math.min(255, b + (255 - b) * 0.3);

      for (const d of rainDrops) {
        d.y += d.speed;
        if (d.y > h * (0.55 + d.depth * 0.4)) {
          d.y = -d.length;
          d.x = Math.random() * w;
        }
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x + RAIN_ANGLE * d.length, d.y - d.length);
        ctx.strokeStyle = `rgba(${rr}, ${gg}, ${bb}, ${av(d.opacity)})`;
        ctx.lineWidth = 0.5 + d.depth * 1.2;
        ctx.stroke();
      }
    }

    function warp() {
      const cx = w / 2;
      const cy = h / 2;
      warpAngle += 0.005;
      const maxR = Math.hypot(cx, cy) + 60;
      const { r, g, b } = accent;

      for (let rad = 50; rad < maxR; rad += 55) {
        const tilt = warpAngle + (rad / maxR) * Math.PI * 0.5;
        ctx.beginPath();
        for (let i = 0; i <= 4; i++) {
          const a = (i / 4) * Math.PI * 2 + tilt;
          const x = cx + Math.cos(a) * rad;
          const y = cy + Math.sin(a) * rad;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${av(0.05 + 0.18 * (1 - rad / maxR))})`;
        ctx.lineWidth = 1.3;
        ctx.stroke();
      }
    }

    function radar() {
      const cx = w / 2;
      const cy = h / 2;
      const maxR = Math.hypot(cx, cy);
      const { r, g, b } = accent;

      radarAngle += 0.018;

      // Grid — concentric rings plus radial spokes
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${av(0.08)})`;
      ctx.lineWidth = 0.6;
      for (let ring = 1; ring <= 4; ring++) {
        ctx.beginPath();
        ctx.arc(cx, cy, maxR * (ring / 4), 0, Math.PI * 2);
        ctx.stroke();
      }
      for (let s = 0; s < 12; s++) {
        const ang = (s / 12) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(ang) * maxR, cy + Math.sin(ang) * maxR);
        ctx.stroke();
      }

      // Wake behind the scan line
      const wakeArc = Math.PI * 0.6;
      const wFrac = wakeArc / (Math.PI * 2);
      if (typeof ctx.createConicGradient === "function") {
        const grad = ctx.createConicGradient(radarAngle - wakeArc, cx, cy);
        grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0)`);
        grad.addColorStop(wFrac, `rgba(${r}, ${g}, ${b}, ${av(0.13)})`);
        grad.addColorStop(Math.min(wFrac + 0.01, 1), `rgba(${r}, ${g}, ${b}, 0)`);
        grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, maxR, radarAngle - wakeArc, radarAngle);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
      } else {
        for (let t = 0; t < 120; t++) {
          const frac = t / 120;
          const a0 = radarAngle - wakeArc + frac * wakeArc;
          const a1 = radarAngle - wakeArc + ((frac + 1 / 120) * wakeArc);
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.arc(cx, cy, maxR, a0, a1);
          ctx.closePath();
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${av(0.12 * Math.pow(frac, 1.3))})`;
          ctx.fill();
        }
      }

      // Scan line
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(radarAngle) * maxR, cy + Math.sin(radarAngle) * maxR);
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${av(0.55)})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Scatter dots light as the sweep passes, then fade
      for (const d of radarDots) {
        const diff =
          (((radarAngle - Math.atan2(d.y - cy, d.x - cx)) % (Math.PI * 2)) +
            Math.PI * 2) %
          (Math.PI * 2);
        if (diff < 0.12) d.a = 0.85;
        d.a *= 0.985;
        if (d.a > 0.02) {
          ctx.beginPath();
          ctx.arc(d.x, d.y, 2.5, 0, Math.PI * 2);
          ctx.fillStyle = rgba(d.a);
          ctx.fill();
        }
      }
    }

    function pulse() {
      const cx = w / 2;
      const cy = h / 2;
      const maxR = Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy));

      pulseTick++;
      if (pulseTick % 55 === 0) {
        pulseRingList.push({ r: 0, a0: 0.85, lineWidth: 1.5 });
      }

      for (let i = pulseRingList.length - 1; i >= 0; i--) {
        const ring = pulseRingList[i];
        ring.r += 3.0;
        if (ring.r >= maxR) {
          pulseRingList.splice(i, 1);
          continue;
        }
        ctx.beginPath();
        ctx.arc(cx, cy, ring.r, 0, Math.PI * 2);
        ctx.strokeStyle = rgba(ring.a0 * Math.pow(1 - ring.r / maxR, 1.5));
        ctx.lineWidth = ring.lineWidth;
        ctx.stroke();
      }
    }

    /** In the app, "focus" renders no overlay at all. */
    function focus() {}

    const RENDERERS = { cosmos, gravity, rain, warp, radar, pulse, focus };

    /** Fire the per-effect beat reactions the app drives from BeatEvent. */
    function onBeat(isDownbeat) {
      if (isDownbeat) {
        for (const p of cosmosParticles) {
          p.ripple = 0.3 + Math.random() * 0.25;
        }
      }
      gravityPulse = isDownbeat ? 1.0 : 0.6;
      pulseRingList.push({
        r: 0,
        a0: isDownbeat ? 1.0 : 0.85,
        lineWidth: isDownbeat ? 4 : 3,
      });
    }

    function resize() {
      if (!canvas || !ctx) return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = rect.width;
      h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      // Draw in CSS pixels so the ported maths is unchanged.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seedAll();
    }

    function frame(now) {
      if (!running) return;

      if (now - lastBeatAt >= BEAT_MS) {
        lastBeatAt = now;
        beatIndex++;
        onBeat(beatIndex % BEATS_PER_BAR === 0);
      }

      // Rain composites its own fade, so it must not be cleared.
      if (style !== "rain") ctx.clearRect(0, 0, w, h);
      (RENDERERS[style] || RENDERERS[LANDING_ZEN])();

      rafId = requestAnimationFrame(frame);
    }

    function play() {
      if (running || !ctx || reduceMotion) return;
      running = true;
      lastBeatAt = performance.now();
      rafId = requestAnimationFrame(frame);
    }

    function stop() {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
    }

    /** One still frame, for reduced-motion. */
    function still() {
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);
      (RENDERERS[style] || RENDERERS[LANDING_ZEN])();
    }

    function setStyle(next) {
      if (!ZEN_STYLES.includes(next)) return;
      style = next;
      store.set("yames-zen-style", next);
      $$(".zen-style").forEach((btn) => {
        const on = btn.dataset.style === next;
        btn.classList.toggle("is-active", on);
        btn.setAttribute("aria-pressed", on ? "true" : "false");
      });
      canvas.classList.toggle("is-blend", next === "cosmos");
      if (ctx) ctx.clearRect(0, 0, w, h);
      seedAll();
      if (reduceMotion) still();
    }

    function buildControls() {
      const wrap = $("#zen-styles");
      if (!wrap) return;
      ZEN_STYLES.forEach((name) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "zen-style";
        btn.dataset.style = name;
        btn.textContent = name;
        btn.setAttribute("aria-pressed", "false");
        btn.addEventListener("click", () => setStyle(name));
        wrap.append(btn);
      });
    }

    function init() {
      if (!canvas || !ctx) return;
      buildControls();
      readAccent();
      resize();
      setStyle(style);

      if (reduceMotion) {
        still();
        return;
      }

      canvas.addEventListener("mousemove", (e) => {
        const rect = canvas.getBoundingClientRect();
        mouse.x = e.clientX - rect.left;
        mouse.y = e.clientY - rect.top;
      });
      canvas.addEventListener("mouseleave", () => {
        mouse.x = -300;
        mouse.y = -300;
      });

      // Only run while the section is on screen.
      new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting) play();
          else stop();
        },
        { threshold: 0.05 },
      ).observe(canvas);

      document.addEventListener("visibilitychange", () => {
        if (document.hidden) stop();
        else play();
      });
    }

    return {
      init,
      resize,
      recolour() {
        readAccent();
        seedCosmos();
        if (reduceMotion) still();
      },
    };
  })();
  /* ── Go ───────────────────────────────────────────────── */

  buildFan();
  buildPicker();
  applyTheme(currentTheme, { persist: false });
  zen.init();
  onScroll();

  // The fan measures itself, so re-roll once images have their real size.
  window.addEventListener("load", () =>
    rollTo(PRIMARY * THEMES.length + themeIndex(currentTheme)),
  );
})();
