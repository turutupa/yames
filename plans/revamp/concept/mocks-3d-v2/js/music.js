// Same music as the concept mocks.
export const OPEN = [64, 59, 55, 50, 45, 40];
export const NOTE = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
const ROOT = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
const QUAL = { '': [0, 4, 7], 7: [0, 4, 7, 10], m: [0, 3, 7], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], dim: [0, 3, 6], sus4: [0, 5, 7], 9: [0, 4, 10, 2], 6: [0, 4, 7, 9] };
export const pc = (s, f) => (OPEN[s - 1] + f) % 12;
export function parseChord(name) {
  const m = /^([A-G](?:#|b)?)(.*)$/.exec(name.trim());
  if (!m || !(m[1] in ROOT)) return null;
  const q = QUAL[m[2]];
  if (!q) return null;
  const r = ROOT[m[1]];
  return { name: name.trim(), r, t: q.map(i => (r + i) % 12) };
}
export const parseChords = str => str.split(/[\s,|]+/).filter(Boolean).map(parseChord).filter(Boolean);
const BOX = [[1, 5], [1, 8], [2, 5], [2, 8], [3, 5], [3, 7], [4, 5], [4, 7], [5, 5], [5, 7], [6, 5], [6, 8]];
const inBox = (s, f) => BOX.some(b => b[0] === s && b[1] === f);
// aim = this chord's tones (amber). Other box notes stay neutral.
export function chordNotes(name, lo = 4, hi = 9, kind = 'aim', box = true) {
  const ch = parseChord(name), o = [];
  if (!ch) return o;
  for (let s = 1; s <= 6; s++) for (let f = lo; f <= hi; f++) {
    if (ch.t.includes(pc(s, f))) o.push({ s, f, kind, t: NOTE[pc(s, f)] });
    else if (box && inBox(s, f)) o.push({ s, f, kind: 'box', t: NOTE[pc(s, f)] });
  }
  return o;
}
export const noteName = (s, f) => NOTE[pc(s, f)];
// Where a chord sits on the neck: the camera glides here on the change.
export const WINDOW = { A7: [4, 9], D7: [5, 10], E7: [6, 11], G7: [2, 7] };
export function windowFor(name) { if (WINDOW[name]) return WINDOW[name]; const c = parseChord(name); if (!c) return [4, 9]; const lo = ((c.r - 4 + 12) % 12) || 12; const l = lo > 9 ? lo - 7 : Math.max(1, lo); return [l, l + 5]; }
// A landing note for a chord within its window, on a given string preference.
export function findTone(name, pcWanted, [lo, hi]) {
  for (const s of [1, 2, 3, 4, 5, 6]) for (let f = lo; f <= hi; f++) if (pc(s, f) === pcWanted) return { s, f };
  return { s: 2, f: lo + 2 };
}
export const FIND = (s, f) => ({ s, f, t: noteName(s, f) });

// Plan data, verbatim from the concept mocks.
export const PLAN = {
  first: { 5: [['t', 'Pentatonic box 1', 3, 'Because the placement test found you know part of this box.'], ['m', 'Even eighths on one string', 2, 'Because your eighths stayed even up to 78 BPM.']],
    10: [['t', 'Pentatonic box 1', 5, 'Because the placement test found you know part of this box.'], ['m', 'Even eighths on one string', 3, 'Because your eighths stayed even up to 78 BPM.'], ['j', 'Jam over a blues', 2, 'So your first session ends on just playing.']],
    15: [['t', 'Pentatonic box 1', 6, 'Because the placement test found you know part of this box.'], ['m', 'Even eighths on one string', 5, 'Because your eighths stayed even up to 78 BPM.'], ['j', 'Jam over a blues', 4, 'So your first session ends on just playing.']],
    20: [['t', 'Pentatonic box 1', 8, 'Because the placement test found you know part of this box.'], ['m', 'Even eighths on one string', 7, 'Because your eighths stayed even up to 78 BPM.'], ['j', 'Jam over a blues', 5, 'So your first session ends on just playing.']] },
  back: { 5: [['t', 'Landing on chord tones, at 60', 3, 'You passed this tempo before the 12-day break.'], ['m', 'Even sixteenths, at 68', 2, 'Lower than your 80, to get the feel back.']],
    10: [['t', 'Landing on chord tones, at 60', 5, 'You passed this tempo before the 12-day break.'], ['m', 'Even sixteenths, at 68', 3, 'Lower than your 80, to get the feel back.'], ['j', 'Jam over a blues', 2, 'To end on just playing.']],
    15: [['m', 'Even eighths, at 80', 3, 'An easy warm-up, because of the break.'], ['t', 'Landing on chord tones, at 60', 6, 'You passed this tempo before the 12-day break.'], ['m', 'Even sixteenths, at 68', 4, 'Lower than your 80, to get the feel back.'], ['j', 'Jam over a blues', 2, 'To end on just playing.']],
    20: [['m', 'Even eighths, at 80', 4, 'An easy warm-up, because of the break.'], ['t', 'Landing on chord tones, at 60', 8, 'You passed this tempo before the 12-day break.'], ['m', 'Even sixteenths, at 68', 5, 'Lower than your 80, to get the feel back.'], ['j', 'Jam over a blues', 3, 'To end on just playing.']] },
  ret: { 5: [['t', 'Landing on chord tones', 3, 'Because you missed D7 yesterday.'], ['m', 'Even sixteenths', 2, 'Because evenness was 78% at 80 BPM. The bar is 85%.']],
    10: [['t', 'Landing on chord tones', 5, 'Because you missed D7 yesterday.'], ['m', 'Even sixteenths', 3, 'Because evenness was 78% at 80 BPM. The bar is 85%.'], ['j', 'Jam over a blues', 2, 'To end on just playing.']],
    15: [['t', 'Landing on chord tones', 5, 'Because you missed D7 yesterday.'], ['m', 'Even sixteenths', 4, 'Because evenness was 78% at 80 BPM. The bar is 85%.'], ['t', 'Call and response', 4, 'New for you: the next step on the Blues path.'], ['j', 'Jam over a blues', 2, 'To end on just playing.']],
    20: [['t', 'Landing on chord tones', 6, 'Because you missed D7 yesterday.'], ['m', 'Even sixteenths', 5, 'Because evenness was 78% at 80 BPM. The bar is 85%.'], ['t', 'Call and response', 4, 'New for you: the next step on the Blues path.'], ['r', 'Ramp up: Find my edge', 3, 'To check your clean tempo. Last week it was 88 BPM.'], ['j', 'Jam over a blues', 2, 'To end on just playing.']] },
};
export const BLUES = [['Pentatonic box 1', 'Passed. 80% of notes in the box at 85 BPM', 'done'], ['Landing on chord tones', 'Exercise 2 of 4. Best 6 of 8 at 75 BPM', 'cur'], ['Call and response', '', ''], ['Blues scale and blue notes', '', ''], ['Following the 12-bar', '', ''], ['Bends that land', '', ''], ['Question and answer phrases', '', ''], ['Connecting box 1 and box 2', '', ''], ['Guide tones through the changes', '', ''], ['Slow blues', '', '']];
export const ALT = [['Even eighths on one string', 'Passed. Clean tempo 104 BPM', 'done'], ['Even sixteenths', 'Exercise 3 of 4. Best 78% even at 80 BPM', 'cur'], ['Accents where you want them', '', ''], ['Crossing two strings', '', ''], ['Three notes per string', '', ''], ['Speed bursts', '', ''], ['Pentatonic patterns', '', ''], ['Cross-string runs', '', ''], ['Stamina minute', '', ''], ['Clean run over the band', '', '']];
// Ten Steps, ten real inlays: 3 to 24, double at 12 and 24.
export const STEP_FRETS = [3, 5, 7, 9, 12, 15, 17, 19, 21, 24];
export const TAB_FRETS = [5, 5, 5, 5, 7, 7, 7, 7, 8, 8, 8, 8, 7, 7, 7, 7];
export const TIMING_SEQ = [2, -3, 1, 4, -2, 14, 3, -1, 5, -4, -26, 2, 1, -2, 3, -1];
export const timingClass = v => { const a = Math.abs(v); return a < 8 ? 'tone' : a < 20 ? 'tens' : 'clash'; };
