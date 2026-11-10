/**
 * The script inside a review page: a Web Audio play-along and the marks a
 * reviewer leaves. No dependencies and no network, so a page is one file that
 * opens anywhere. The sound is a Karplus-Strong pluck, for checking the notes; it
 * is not the app's audio and says nothing about how the app will sound.
 */
export const REVIEW_CLIENT = `
(function () {
  var DATA = JSON.parse(document.getElementById("exercise-data").textContent);
  var PATH_ID = document.body.getAttribute("data-path");
  var ctx = null;
  var buffers = {};
  var current = null;

  function audio() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function pluckBuffer(midi) {
    if (buffers[midi]) return buffers[midi];
    var c = audio();
    var rate = c.sampleRate;
    var length = Math.floor(rate * 2.4);
    var buffer = c.createBuffer(1, length, rate);
    var out = buffer.getChannelData(0);
    var freq = 440 * Math.pow(2, (midi - 69) / 12);
    var period = Math.max(2, Math.round(rate / freq));
    var line = new Float32Array(period);
    var seed = midi * 7919 + 13;
    function random() {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    }
    for (var i = 0; i < period; i += 1) line[i] = random() * 2 - 1;
    var decay = 0.9965 - Math.max(0, midi - 40) * 0.00002;
    var at = 0;
    var previous = 0;
    for (var n = 0; n < length; n += 1) {
      var value = line[at];
      out[n] = value;
      line[at] = decay * 0.5 * (value + previous);
      previous = value;
      at = (at + 1) % period;
    }
    buffers[midi] = buffer;
    return buffer;
  }

  function playNote(event, when, secondsPerBeat, master, cursorOn) {
    var c = audio();
    var source = c.createBufferSource();
    source.buffer = pluckBuffer(event.midi);
    var gain = c.createGain();
    var level = (event.level || 0.55) * (event.accent ? 1.5 : 1);
    var length = event.dur * secondsPerBeat;
    gain.gain.setValueAtTime(level, when);
    var stop = event.mute ? Math.min(length, 0.14) : Math.max(length * 1.02, 0.09);
    if (event.ring) stop = 1.6;
    gain.gain.setValueAtTime(level, when + Math.max(0.01, stop - 0.04));
    gain.gain.linearRampToValueAtTime(0.0001, when + stop);
    var tail = gain;
    if (event.mute) {
      var filter = c.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 900;
      gain.connect(filter);
      tail = filter;
    }
    source.connect(gain);
    tail.connect(master);
    if (event.bend) {
      source.detune.setValueAtTime(0, when);
      source.detune.linearRampToValueAtTime(event.bend * 100, when + Math.min(0.16, length * 0.5));
    }
    if (event.vibrato) {
      var lfo = c.createOscillator();
      var depth = c.createGain();
      lfo.frequency.value = 5.5;
      depth.gain.value = 22;
      lfo.connect(depth);
      depth.connect(source.detune);
      lfo.start(when + 0.08);
      lfo.stop(when + stop);
    }
    source.start(when);
    source.stop(when + stop + 0.02);
    if (cursorOn) cursorOn(when);
  }

  function click(when, strong, master) {
    var c = audio();
    var osc = c.createOscillator();
    var gain = c.createGain();
    osc.frequency.value = strong ? 1700 : 1100;
    gain.gain.setValueAtTime(strong ? 0.28 : 0.15, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.04);
    osc.connect(gain);
    gain.connect(master);
    osc.start(when);
    osc.stop(when + 0.05);
  }

  function stop() {
    if (!current) return;
    clearInterval(current.timer);
    if (current.raf) cancelAnimationFrame(current.raf);
    try { current.master.disconnect(); } catch (e) {}
    current.card.classList.remove("playing");
    current.card.querySelector("[data-act=play]").textContent = "Play";
    current.card.querySelectorAll(".n.on").forEach(function (n) { n.classList.remove("on"); });
    current = null;
  }

  function start(card) {
    var id = card.getAttribute("data-ex");
    var select = card.querySelector("[data-variant]");
    var d = DATA[id].variants[select ? Number(select.value) : 0];
    var c = audio();
    var selected = card.querySelector(".rung.sel");
    var bpm = Number(selected.getAttribute("data-bpm"));
    var spb = 60 / bpm;
    var useClick = card.querySelector("[data-opt=click]").checked;
    var useChords = card.querySelector("[data-opt=chords]");
    useChords = useChords ? useChords.checked : false;
    var loop = card.querySelector("[data-opt=loop]").checked;
    var master = c.createGain();
    master.gain.value = 0.8;
    master.connect(c.destination);
    var beatsPerBar = d.beatsPerBar;
    var total = d.bars * beatsPerBar;
    var countIn = beatsPerBar;
    var t0 = c.currentTime + 0.08;
    var state = { pass: 0, nextBeat: 0, nextNote: 0, nextGuide: 0, nextChord: 0 };
    var cursor = [];
    function schedule() {
      var now = c.currentTime;
      var horizon = now + 0.25;
      // Clicks, with the count-in as negative beats.
      while (true) {
        var beatIndex = state.nextBeat;
        var when = t0 + beatIndex * spb;
        if (when > horizon) break;
        var withinBar = beatIndex % beatsPerBar;
        if (beatIndex < countIn || useClick) click(when, withinBar === 0, master);
        state.nextBeat += 1;
        if (!loop && beatIndex >= countIn + total) { break; }
      }
      var passStart = function (pass) { return t0 + (countIn + pass * total) * spb; };
      var passes = loop ? Infinity : 1;
      while (state.pass < passes) {
        var base = passStart(state.pass);
        var progressed = false;
        var drain = function (list, key, level) {
          while (state[key] < list.length) {
            var ev = list[state[key]];
            var at = base + ev.t * spb;
            if (at > horizon) return;
            playNote(Object.assign({}, ev, level ? { level: level } : {}), at, spb, master, null);
            if (ev.i !== undefined) cursor.push({ at: at, i: ev.i, end: at + ev.dur * spb });
            state[key] += 1;
            progressed = true;
          }
        };
        drain(d.events, "nextNote");
        drain(d.guide, "nextGuide", 0.42);
        if (useChords) {
          drain(d.chords, "nextChord", 0.13);
        } else {
          state.nextChord = d.chords.length;
        }
        var doneNotes = state.nextNote >= d.events.length && state.nextGuide >= d.guide.length && state.nextChord >= d.chords.length;
        if (!doneNotes) break;
        if (base + total * spb > horizon + 0.25) break;
        state.pass += 1;
        state.nextNote = 0;
        state.nextGuide = 0;
        state.nextChord = 0;
        if (!progressed && state.pass > 400) break;
      }
      if (!loop && state.pass >= 1 && now > passStart(1) + 0.2) stop();
    }
    var nodes = {};
    card.querySelectorAll(".n").forEach(function (n) { nodes[n.getAttribute("data-i")] = n; });
    function paint() {
      if (!current) return;
      var now = c.currentTime;
      cursor = cursor.filter(function (item) {
        var node = nodes[item.i];
        if (node) node.classList.toggle("on", now >= item.at && now < item.end);
        if (node && now >= item.end) node.classList.remove("on");
        return now < item.end + 0.05;
      });
      current.raf = requestAnimationFrame(paint);
    }
    current = { card: card, master: master, timer: setInterval(schedule, 40), raf: 0 };
    schedule();
    card.classList.add("playing");
    card.querySelector("[data-act=play]").textContent = "Stop";
    current.raf = requestAnimationFrame(paint);
  }

  // Variants arrive as inert templates; only the one being read is in the page.
  function showVariant(card, index) {
    var slot = card.querySelector(".variant-slot");
    if (!card.firstBody) card.firstBody = slot.innerHTML;
    var template = card.querySelector("template[data-v='" + index + "']");
    slot.innerHTML = template ? template.innerHTML : card.firstBody;
    var select = card.querySelector("[data-variant]");
    select.value = String(index);
  }
  function flipTo(card, index) {
    var playing = current && current.card === card;
    stop();
    showVariant(card, index);
    if (playing) start(card);
  }
  document.addEventListener("change", function (event) {
    if (event.target.matches && event.target.matches("[data-variant]")) {
      flipTo(event.target.closest("[data-ex]"), Number(event.target.value));
    }
  });

  document.addEventListener("click", function (event) {
    var flip = event.target.closest("[data-flip]");
    if (flip) {
      var flipCard = flip.closest("[data-ex]");
      var options = flipCard.querySelector("[data-variant]");
      var count = options.options.length;
      flipTo(flipCard, (Number(options.value) + Number(flip.getAttribute("data-flip")) + count) % count);
      return;
    }
    var button = event.target.closest("[data-act]");
    if (button) {
      var card = button.closest("[data-ex]");
      var wasThis = current && current.card === card;
      stop();
      if (!wasThis) start(card);
      return;
    }
    var rung = event.target.closest(".rung");
    if (rung) {
      var parent = rung.closest("[data-ex]");
      parent.querySelectorAll(".rung").forEach(function (r) { r.classList.remove("sel"); });
      rung.classList.add("sel");
      if (current && current.card === parent) { stop(); start(parent); }
    }
  });

  // Marks: kept in this browser, and exportable.
  var KEY = "yames-path-review:" + PATH_ID;
  function loadMarks() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }
  function saveMarks(marks) {
    try { localStorage.setItem(KEY, JSON.stringify(marks)); } catch (e) {}
    var done = document.querySelectorAll("[data-mark-row]");
    var count = 0;
    done.forEach(function (row) {
      var id = row.getAttribute("data-mark-row");
      if (marks[id] && Object.keys(marks[id]).length > 0) count += 1;
    });
    var counter = document.getElementById("mark-count");
    if (counter) counter.textContent = count + " of " + done.length + " marked";
  }
  var marks = loadMarks();
  document.querySelectorAll("[data-mark]").forEach(function (input) {
    var id = input.getAttribute("data-mark");
    var field = input.getAttribute("data-field");
    var value = marks[id] ? marks[id][field] : undefined;
    if (value !== undefined) {
      if (input.type === "checkbox") input.checked = value;
      else input.value = value;
    }
    input.addEventListener("input", function () {
      marks[id] = marks[id] || {};
      marks[id][field] = input.type === "checkbox" ? input.checked : input.value;
      saveMarks(marks);
    });
  });
  saveMarks(marks);
  var exportButton = document.getElementById("export-marks");
  if (exportButton) {
    exportButton.addEventListener("click", function () {
      var blob = new Blob([JSON.stringify({ path: PATH_ID, marks: marks }, null, 2)], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = PATH_ID + "-review-marks.json";
      a.click();
    });
  }
})();
`;
