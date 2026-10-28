// Text helpers for rcg cut: normalize transcript words, match quotes, align two transcripts.
//
// Two transcribers (or two passes of one) never spell the same sound the same way:
// "fifteen hundred" / "1,500", "gonna" / "going to". Every comparison here folds that
// formatting noise away first. Design ported from ai-video-editor's textnorm.py (MIT,
// docs/PROVENANCE.md); SequenceMatcher follows Python's difflib, without junk heuristics.

const UNITS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19,
};
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SCALES = { hundred: 100, thousand: 1e3, million: 1e6, billion: 1e9 };
const SPOKEN_SAME = {
  wanna: 'want to', gonna: 'going to', gotta: 'got to', kinda: 'kind of', sorta: 'sort of',
  til: 'till', cuz: 'because', yall: 'you all',
};
// One number word on its own folds to a digit only from here up, so "one of the best" stays words.
const BARE_FOLD_MIN = 13;

/** Spoken content only: lower case, hyphens split, "%" spoken, other punctuation dropped. */
export function norm(s) {
  return String(s).toLowerCase().replace(/%/g, ' percent ')
    .replace(/(?<=\d),(?=\d)/g, '') // "1,500" must not split into "1" and "500"
    .replace(/[^\p{L}\p{N}' ]+/gu, ' ')
    .trim();
}

export const nwords = (s) => norm(s).split(/\s+/).filter(Boolean);

/** [[token, sourceIndex]]: number phrases folded to digits, same-sound contractions expanded. */
export function canonSrc(toks) {
  const out = [];
  let i = 0;
  while (i < toks.length) {
    const t = toks[i];
    if (SPOKEN_SAME[t]) {
      for (const x of SPOKEN_SAME[t].split(' ')) out.push([x, i]);
      i++;
      continue;
    }
    if (t in UNITS || t in TENS) {
      let total = 0;
      let cur = 0;
      let j = i;
      for (; j < toks.length; j++) {
        const w = toks[j];
        if (w in UNITS) cur += UNITS[w];
        else if (w in TENS) cur += TENS[w];
        else if (w in SCALES) {
          if (SCALES[w] === 100) cur = (cur || 1) * 100;
          else { total += (cur || 1) * SCALES[w]; cur = 0; }
        } else break;
      }
      const value = total + cur;
      if (j - i === 1 && value < BARE_FOLD_MIN && t in UNITS) { out.push([t, i]); i++; }
      else { out.push([String(value), i]); i = j; }
      continue;
    }
    out.push([t, i]);
    i++;
  }
  return out;
}

export const canon = (toks) => canonSrc(toks).map(([t]) => t);

/** Comparable tokens with times: [[token, start, end]], each timed by the word it came from. */
export function timedWords(words) {
  const toks = [];
  const owner = [];
  for (const w of words) {
    for (const x of nwords(w.text)) { toks.push(x); owner.push(w); }
  }
  return canonSrc(toks).map(([t, i]) => [t, owner[i].start, owner[i].end]);
}

/** Every [first, last] word-index range whose words match `needle` (punctuation and case ignored). */
export function locate(needle, words) {
  const hay = [];
  const owner = [];
  words.forEach((w, i) => { for (const x of nwords(w.text)) { hay.push(x); owner.push(i); } });
  const need = nwords(needle);
  if (!need.length) return [];
  const out = [];
  for (let i = 0; i + need.length <= hay.length; i++) {
    if (need.every((x, k) => hay[i + k] === x)) out.push([owner[i], owner[i + need.length - 1]]);
  }
  return out;
}

/** Python difflib.SequenceMatcher over two arrays (elements compared with ===), no junk handling. */
export class SequenceMatcher {
  constructor(a, b) {
    this.a = a;
    this.b = b;
    this.b2j = new Map();
    b.forEach((x, j) => {
      if (!this.b2j.has(x)) this.b2j.set(x, []);
      this.b2j.get(x).push(j);
    });
    this.blocks = null;
  }

  longest(alo, ahi, blo, bhi) {
    let bi = alo;
    let bj = blo;
    let size = 0;
    let j2len = new Map();
    for (let i = alo; i < ahi; i++) {
      const next = new Map();
      for (const j of this.b2j.get(this.a[i]) || []) {
        if (j < blo) continue;
        if (j >= bhi) break;
        const k = (j2len.get(j - 1) || 0) + 1;
        next.set(j, k);
        if (k > size) { bi = i - k + 1; bj = j - k + 1; size = k; }
      }
      j2len = next;
    }
    return [bi, bj, size];
  }

  matchingBlocks() {
    if (this.blocks) return this.blocks;
    const la = this.a.length;
    const lb = this.b.length;
    const queue = [[0, la, 0, lb]];
    const found = [];
    while (queue.length) {
      const [alo, ahi, blo, bhi] = queue.pop();
      const [i, j, k] = this.longest(alo, ahi, blo, bhi);
      if (!k) continue;
      found.push([i, j, k]);
      if (alo < i && blo < j) queue.push([alo, i, blo, j]);
      if (i + k < ahi && j + k < bhi) queue.push([i + k, ahi, j + k, bhi]);
    }
    found.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    const out = [];
    let [i1, j1, k1] = [0, 0, 0];
    for (const [i2, j2, k2] of found) {
      if (i1 + k1 === i2 && j1 + k1 === j2) k1 += k2;
      else {
        if (k1) out.push([i1, j1, k1]);
        [i1, j1, k1] = [i2, j2, k2];
      }
    }
    if (k1) out.push([i1, j1, k1]);
    out.push([la, lb, 0]);
    this.blocks = out;
    return out;
  }

  /** [[tag, i1, i2, j1, j2]], tag: equal | replace | delete | insert. */
  opcodes() {
    let i = 0;
    let j = 0;
    const out = [];
    for (const [ai, bj, size] of this.matchingBlocks()) {
      const tag = i < ai && j < bj ? 'replace' : i < ai ? 'delete' : j < bj ? 'insert' : null;
      if (tag) out.push([tag, i, ai, j, bj]);
      i = ai + size;
      j = bj + size;
      if (size) out.push(['equal', ai, i, bj, j]);
    }
    return out;
  }

  ratio() {
    const m = this.matchingBlocks().reduce((s, [, , k]) => s + k, 0);
    const n = this.a.length + this.b.length;
    return n ? (2 * m) / n : 1;
  }
}

/**
 * Two transcripts of the same audio, each [[key, start, end]] on one timeline. Inside a replaced
 * run, an `a` item and the `b` items it overlaps in time (within tol s) are the same sound heard
 * differently ("Jev" heard as "Jeff"). Returns { same: [[i, j]], differ: [[i, [j...]]],
 * gone: [i] (only in a), added: [j] (only in b) }.
 */
export function pairByTime(a, b, tol = 0.25) {
  const sm = new SequenceMatcher(a.map((x) => x[0]), b.map((x) => x[0]));
  const same = [];
  const differ = [];
  const gone = [];
  const added = [];
  for (const [tag, i1, i2, j1, j2] of sm.opcodes()) {
    if (tag === 'equal') {
      for (let k = 0; k < i2 - i1; k++) same.push([i1 + k, j1 + k]);
      continue;
    }
    const used = new Set();
    for (let i = i1; i < i2; i++) {
      const js = [];
      if (tag === 'replace') {
        for (let j = j1; j < j2; j++) if (b[j][1] < a[i][2] + tol && a[i][1] < b[j][2] + tol) js.push(j);
      }
      if (js.length) { differ.push([i, js]); js.forEach((j) => used.add(j)); }
      else gone.push(i);
    }
    for (let j = j1; j < j2; j++) if (!used.has(j)) added.push(j);
  }
  return { same, differ, gone, added };
}
