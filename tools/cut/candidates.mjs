// Cut candidates found in code: every place a raw take may need a cut. Code only flags; the agent
// decides each one (rcg cut apply). Design ported from ai-video-editor's retakes.py (MIT,
// docs/PROVENANCE.md). Its constants are a starting point, not values tuned on rcg takes.
//
//   restart, same opening  a clause that opens like an earlier one within WINDOW_S: the earlier
//                          one was abandoned (false_start when short and quick, else retake)
//   restart, repeated run  the same 2+ words said again within 30 words, not a list ("X and X")
//   fragment               a phrase of 8 words or fewer that does not end a sentence
//   meta                   "wait", "sorry", "let me start again" ...
//   soft filler            "you know", "I mean", a "like" set off as a hesitation
//   hard filler            um, uh, erm ...: cut without asking unless fillers are kept
//   alt_hook               takes of the opening line recorded after the body: cut, listed in hooks.json

import { SequenceMatcher, nwords } from './text.mjs';

export const PHRASE_GAP_S = 0.5; // a silence this long ends a phrase
const WINDOW_S = 40; // a restart this far back is still a retake
const NEAR_WORDS = 8; // a 2-word repeat counts only this close
const ALT_HOOK_MAX_WORDS = 30; // a later take longer than this is a second take of the video, not a hook
export const HARD_FILLERS = new Set(['um', 'uh', 'umm', 'uhh', 'erm', 'er', 'hmm', 'mm', 'ah', 'eh']);
const SOFT_FILLERS = ['you know', 'i mean', 'like'];
const STOP = new Set(('a an the and or but so of to in on at it is i you we that this for with be was are my me if '
  + "it's it'll i'm they he she do not there then just").split(' '));
const META = /(?<=^| )(wait|sorry|hold on|shoot|oops|start (?:again|over)|one more time|let me (?:start|do (?:that|this|it)|try|say (?:that|it))(?: (?:again|over))?|take two|again)(?= |$)/g;
const LIKE_BEFORE = new Set(['and', 'so', 'but', 'or', 'um', 'uh', 'was', 'were']);
const ENDS = /[.?!]$/;

const say = (w, a, b) => w.slice(a, b + 1).map((t) => t.text.trim()).join(' ');

/** [[first, last]] word ranges, split at silences and sentence ends. */
export function phrases(w) {
  const out = [];
  let a = 0;
  for (let i = 1; i <= w.length; i++) {
    if (i === w.length || w[i].start - w[i - 1].end >= PHRASE_GAP_S || ENDS.test(w[i - 1].text.trim())) {
      out.push([a, i - 1]);
      a = i;
    }
  }
  return w.length ? out : [];
}

const isHardFiller = (t) => { const ws = nwords(t); return ws.length > 0 && ws.every((x) => HARD_FILLERS.has(x)); };

/** Phrases split again after , ; : - and after um/uh. */
function clauses(w) {
  const out = [];
  for (const [a, b] of phrases(w)) {
    let start = a;
    for (let i = a; i < b; i++) {
      const t = w[i].text.trim();
      if (/[,;:-]$/.test(t) || isHardFiller(t)) { out.push([start, i]); start = i + 1; }
    }
    out.push([start, b]);
  }
  return out;
}

const opening = (w, a, b, n = 6) => w.slice(a, b + 1).flatMap((t) => nwords(t.text)).filter((x) => !HARD_FILLERS.has(x)).slice(0, n);

const sameMemo = new Map();
/** Same word, allowing a transcriber's spelling drift on names (jev / jv). */
function same(x, y) {
  if (x === y) return true;
  if (x.length < 3 || y.length < 2) return false;
  const key = `${x}\u0000${y}`;
  if (!sameMemo.has(key)) sameMemo.set(key, new SequenceMatcher([...x], [...y]).ratio() >= 0.75);
  return sameMemo.get(key);
}

/** Do two clauses open the same way? Fuzzy on spelling. */
function similarOpenings(x, y) {
  const n = Math.min(x.length, y.length);
  if (n < 2) return false;
  const xa = x.slice(0, n);
  const ya = y.slice(0, n).map((v) => x.find((w) => same(w, v)) ?? v);
  const hit = new SequenceMatcher(xa, ya).matchingBlocks().flatMap(([i, , k]) => xa.slice(i, i + k));
  return hit.length >= 2 && hit.length / n >= 0.6 && (hit.length >= 3 || hit.some((w) => !STOP.has(w)));
}

/** [[i, j]]: the attempt from word i is abandoned and started again at word j. */
function restarts(w) {
  const out = [];
  const cl = clauses(w);
  for (let bi = 1; bi < cl.length; bi++) {
    const b0 = cl[bi][0];
    const ob = opening(w, ...cl[bi]);
    for (let ai = bi - 1; ai >= 0; ai--) {
      const a0 = cl[ai][0];
      if (w[b0].start - w[a0].start > WINDOW_S) break;
      if (similarOpenings(opening(w, ...cl[ai]), ob)) { out.push([a0, b0]); break; }
    }
  }
  // A line of two clauses said twice ("A1 B1. A2 B2.") gives a restart per clause. The second one
  // (B1 to B2) would also cut the keeper's A2, and B1 is already inside the first restart's cut.
  // (Not in the ai-video-editor design; found on a spliced test take.)
  const tails = out.filter(([i2, j2]) => out.some(([i1, j1]) => i1 < i2 && i2 < j1 && j1 < j2));
  for (const t of tails) out.splice(out.indexOf(t), 1);
  const taken = (x) => out.some(([i, j]) => i <= x && x < j);
  // Words said twice in a row inside a clause: cut the first run up to the repeat.
  const seq = w.flatMap((t, i) => nwords(t.text).filter((x) => !HARD_FILLERS.has(x)).map((x) => [x, i]));
  let n = 0;
  while (n < seq.length) {
    let best = null;
    for (let m = n - 1; m > Math.max(-1, n - 30); m--) {
      let k = 0;
      while (n + k < seq.length && m + k < n && seq[m + k][0] === seq[n + k][0]) k++;
      const content = seq.slice(n, n + k).some(([x]) => !STOP.has(x));
      // "a lot of tokens and a lot of money": a second item in the same shape, a list, not a retry
      const rest = seq.slice(m + k, n).map(([x]) => x);
      let c = -1;
      rest.forEach((x, idx) => { if (x === 'and' || x === 'or') c = idx; });
      const listed = c >= 0 && rest.slice(0, c).some((x) => !STOP.has(x)) && rest.slice(c).every((x) => STOP.has(x));
      if (k >= (n - m <= NEAR_WORDS ? 2 : 3) && (content || k >= 4) && !listed) { best = [m, k]; break; }
    }
    const i = best ? seq[best[0]][1] : null;
    const j = best ? seq[n][1] : null;
    if (best && i < j && !taken(i) && !taken(j - 1)) { out.push([i, j]); n += best[1]; }
    else n++;
  }
  return out.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
}

/** Takes of the opening line recorded after the body: [[a, b]] word ranges running to the next take or the end. */
function altHooks(w) {
  const phr = phrases(w);
  if (!phr.length) return [];
  const first = opening(w, ...phr[0]);
  const t0 = w[phr[0][0]].start;
  const hits = [];
  for (const [a, b] of clauses(w)) {
    if (w[a].start - t0 <= WINDOW_S) continue;
    if (similarOpenings(first, opening(w, a, b))) hits.push(a);
    // Whisper can hang a take's first word on the phrase before it
    else if (a > 0 && !/[.?!,;:]$/.test(w[a - 1].text.trim()) && similarOpenings(first, opening(w, a - 1, b))) hits.push(a - 1);
  }
  const takes = [];
  let e = w.length;
  for (const a of [...hits].reverse()) {
    if (w.slice(a, e).reduce((s, t) => s + nwords(t.text).length, 0) > ALT_HOOK_MAX_WORDS) break;
    takes.unshift([a, e - 1]);
    e = a;
  }
  return takes;
}

/** Is "like" at word i a hesitation? Set off by a pause or comma, after "and/so/was...", or opening a clause. */
function looseLike(w, i) {
  const prev = i ? w[i - 1] : null;
  const nxt = w[i + 1];
  if (!prev || /[.?!,]$/.test(prev.text.trim()) || /,$/.test(w[i].text.trim())) return true;
  if (w[i].start - prev.end >= 0.3 || (nxt && nxt.start - w[i].end >= 0.3)) return true;
  return nwords(prev.text).some((x) => LIKE_BEFORE.has(x));
}

/**
 * Every candidate, sorted by position. Each: { id, kind, cut: [a, b] (word indexes), at, text,
 * auto (cut without asking), second / keeperAt / gap (restarts), next (fragments), context }.
 */
export function findCandidates(w, { keepFillers = false } = {}) {
  const phr = phrases(w);
  const endOf = new Map();
  for (const [a, b] of phr) for (let i = a; i <= b; i++) endOf.set(i, b);
  const alts = altHooks(w);
  const tail = alts.length ? alts[0][0] : w.length; // nothing in the alternate hooks is judged: all of it is cut
  const cands = [];
  const ctx = (a, b) => say(w, Math.max(0, a - 12), Math.min(w.length - 1, b + 12));
  const add = (kind, a, b, extra = {}) => {
    if (kind !== 'alt_hook') b = Math.min(b, tail - 1);
    cands.push({ kind, cut: [a, b], at: w[a].start, text: say(w, a, b), ...extra });
  };

  for (const [i, j] of restarts(w)) {
    if (j >= tail) continue;
    const gap = +(w[j].start - w[j - 1].end).toFixed(2);
    add(j - i <= 4 && gap < 1 ? 'false_start' : 'retake', i, j - 1,
      { second: say(w, j, Math.min(endOf.get(j), j + 25)), keeperAt: w[j].start, gap });
  }
  const restarted = new Set(cands.map((c) => c.cut[0]));
  phr.forEach(([a, b], pi) => {
    const n = w.slice(a, b + 1).reduce((s, t) => s + nwords(t.text).length, 0);
    if (restarted.has(a) || pi + 1 >= phr.length || n > 8 || a >= tail || ENDS.test(w[b].text.trim())) return;
    const [na, nb] = phr[pi + 1];
    add('false_start', a, b, { fragment: true, next: say(w, na, Math.min(nb, na + 20)) });
  });

  const seq = w.flatMap((t, i) => nwords(t.text).map((x) => [x, i]));
  const flat = seq.map(([x]) => x).join(' ');
  const rxs = [[META, 'meta'], ...SOFT_FILLERS.map((f) => [new RegExp(`(?<=^| )${f}(?= |$)`, 'g'), 'filler'])];
  for (const [rx, kind] of rxs) {
    for (const m of flat.matchAll(rx)) {
      const w0 = (flat.slice(0, m.index).match(/ /g) || []).length;
      const w1 = w0 + (m[0].match(/ /g) || []).length;
      const a = seq[w0][1];
      const b = seq[w1][1];
      if (a >= tail) continue;
      if (kind === 'filler' && (keepFillers || (m[0] === 'like' && !looseLike(w, a)))) continue;
      add(kind, a, b, { context: ctx(a, b) });
    }
  }
  alts.forEach(([a, b], k) => add('alt_hook', a, b, { auto: true, hook: k + 1 }));
  for (let i = 0; i < tail; i++) {
    if (!keepFillers && isHardFiller(w[i].text)) add('filler', i, i, { auto: true });
  }
  cands.sort((x, y) => x.cut[0] - y.cut[0] || x.cut[1] - y.cut[1]);
  let asked = 0;
  let auto = 0;
  for (const c of cands) c.id = c.auto ? `a${++auto}` : `c${++asked}`;
  return cands;
}

/** transcript.txt: one line per phrase, "[start-end] words", "(+N.Ns)" for a pause of a second or more. */
export function textView(w, name = '') {
  const lines = [`# ${name} ${w.length} words. [start-end] seconds, then the words. (+N.Ns) = the pause before a phrase. `
    + 'Quote words from here; use "after": <a start time> when a phrase repeats.'];
  let prev = null;
  for (const [a, b] of phrases(w)) {
    const gap = prev == null ? 0 : w[a].start - prev;
    const words = w.slice(a, b + 1).map((t) => (t.gapBeforeS ? `[${t.gapBeforeS.toFixed(1)}s of sound before the first word, not transcribed] ` : '')
      + t.text.trim()
      + (t.unheardS ? ` [${t.unheardS.toFixed(1)}s of speech not transcribed]` : '')
      + (t.gapAfterS ? ` [${t.gapAfterS.toFixed(1)}s of sound after this word, not transcribed]` : '')).join(' ');
    lines.push(`${gap >= 1 ? `(+${gap.toFixed(1)}s) ` : ''}[${w[a].start.toFixed(2)}-${w[b].end.toFixed(2)}] ${words}`);
    prev = w[b].end;
  }
  return lines.join('\n') + '\n';
}

/** candidates.md: every place to decide, numbered, with what the agent answers in decisions.in.json. */
export function candidatesMd(cands, name = '') {
  const asked = cands.filter((c) => !c.auto);
  const lines = [`# Cut candidates: ${name}`, '',
    `${asked.length} place(s) to decide. Code only flags them. Answer each in \`data/cut/decisions.in.json\``,
    '(`"c1": "cut" | "keep" | "unsure"`; for a retake or false start that was said again, `"cut"` removes the',
    'EARLIER attempt and keeps the later one; when the earlier one is better, answer',
    '`{"answer": "cut", "keep": "first"}` and it goes to review.md for the user). Check each against',
    '`transcript.txt`. When in doubt, keep: a wrong cut loses a line, a missed one is caught by verify.', ''];
  for (const c of asked) {
    lines.push(`## ${c.id} \`${c.kind}\` at ${c.at.toFixed(2)}s`);
    lines.push(`- cut: "${c.text}"`);
    if (c.second) lines.push(`- said again at ${c.keeperAt.toFixed(2)}s (pause ${c.gap.toFixed(2)}s): "${c.second}"`);
    if (c.next) lines.push(`- unfinished? next phrase: "${c.next}"`);
    if (c.context) lines.push(`- context: "${c.context}"`);
    lines.push('');
  }
  const fill = cands.filter((c) => c.auto && c.kind === 'filler');
  const hooks = cands.filter((c) => c.kind === 'alt_hook');
  lines.push('## Cut without asking', '');
  lines.push(fill.length ? `- ${fill.length} um/uh filler(s): ${fill.map((c) => `${c.id} "${c.text}" ${c.at.toFixed(2)}s`).join(', ')}` : '- no um/uh fillers');
  for (const c of hooks) lines.push(`- ${c.id} alternate hook ${c.hook} at ${c.at.toFixed(2)}s (a take of the opening after the body): "${c.text}"`);
  lines.push('', 'Answer `"keep"` to an a-id to keep it.');
  return lines.join('\n') + '\n';
}
