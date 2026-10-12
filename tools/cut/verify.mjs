// rcg cut verify: the cut transcribed again, diffed against the words the cut meant to keep.
// Design ported from ai-video-editor's verify_cut.py (MIT, docs/PROVENANCE.md).
//
//   MISSING            a kept word is not heard: an edge landed too tight. Raise --pad or narrow the
//                      span that ate it, build and render again.
//   SURVIVED           a removed word is still heard (a fragment counts: "open" left from "opening"):
//                      an edge landed too loose. Each gives the span to add to decisions.in.json
//                      "extra", unless that span would also cut kept words (then a label is off).
//   HEARD DIFFERENTLY  the same moment spelled another way by the second pass ("Jev" -> "Jeff").
//   DOUBLED            the same word or pair twice in a row ("now, now"). Natural ones stay.
// Fillers that come and go between passes are transcriber variance, listed apart.

import { isKept, retime, toSource } from './build.mjs';
import { HARD_FILLERS } from './candidates.mjs';
import { canon, nwords, pairByTime, timedWords } from './text.mjs';

const JOIN_REACH_S = 0.25; // a kept word this close to a join can have been clipped by it

const coveredBy = (w, cuts) => cuts.some((c) => c.start <= w.start && w.end <= c.end);

/** The spans.json entry for the source words heard between a and b, { kept } when it would cut kept words, or null. */
function spanToAdd(words, a, b, modelCuts) {
  const ws = words.filter((w) => { const m = (w.start + w.end) / 2; return a - 0.1 <= m && m <= b + 0.1; });
  if (!ws.length) return null;
  const kept = modelCuts ? ws.filter((w) => !coveredBy(w, modelCuts)).map((w) => w.text.trim()) : [];
  if (kept.length) return { kept: kept.join(' ') };
  return { text: ws.map((w) => w.text.trim()).join(' '), kind: 'retake', after: +Math.max(0, ws[0].start - 0.05).toFixed(2) };
}

/** [[j, n]]: act[j..j+n) said again right after, n = 1 or 2, fillers ignored. */
export function doubled(act) {
  const t = act.map(([x]) => x);
  const out = [];
  for (let j = 0; j < t.length; j++) {
    for (const n of [2, 1]) {
      const a = t.slice(j, j + n);
      const b = t.slice(j + n, j + 2 * n);
      if (b.length === n && a.every((x, k) => x === b[k]) && !HARD_FILLERS.has(t[j])
        && !out.some(([k, m]) => j < k + m && k < j + n)) { out.push([j, n]); break; }
    }
  }
  return out;
}

/** Compare. fitted: the source words as build placed them; heard: the cut's transcript words. Returns { ok, lines, result }. */
export function compare({ fitted, keptSpans, modelCuts, heard }) {
  const exp = timedWords(retime(fitted, keptSpans));
  const expected = exp.map(([t]) => t);
  const removed = new Set(canon(fitted.filter((w) => !isKept(w, keptSpans)).flatMap((w) => nwords(w.text))));
  const act = timedWords(heard);
  const actual = act.map(([t]) => t);
  const { same, differ, gone, added } = pairByTime(exp, act);
  const fragment = (tok) => removed.has(tok) || [...removed].some((r) => tok.length >= 2 && r.length >= 2 && (r.startsWith(tok) || tok.startsWith(r)));
  const isFiller = (t) => HARD_FILLERS.has(t);
  // A cut changes the audio only at its joins. A kept word the second pass did not hear, far from
  // every join, is transcriber variance (base mishears unclear speech differently each pass), not a
  // cut error. (Not in the ai-video-editor design: on a real take it buried the one real error.)
  const joins = [0];
  for (const s of keptSpans) joins.push(joins[joins.length - 1] + s.end - s.start);
  const nearJoin = (i) => joins.some((t) => exp[i][1] - JOIN_REACH_S <= t && t <= exp[i][2] + JOIN_REACH_S);
  const notHeard = gone.filter((i) => !isFiller(expected[i]));
  const missing = notHeard.filter(nearJoin);
  const farFromJoins = notHeard.filter((i) => !nearJoin(i));
  const extra = added.map((j) => actual[j]);
  const fillerNoise = gone.filter((i) => isFiller(expected[i])).length + extra.filter(isFiller).length;
  const runs = [];
  for (const j of [...added].sort((x, y) => x - y)) {
    if (runs.length && runs[runs.length - 1][1] === j) runs[runs.length - 1][1] = j + 1;
    else runs.push([j, j + 1]);
  }
  const survived = [];
  for (const [j1, j2] of runs) {
    if (!actual.slice(j1, j2).some((t) => !isFiller(t) && fragment(t))) continue;
    const a = act[j1][1];
    const b = act[j2 - 1][2];
    const sa = toSource(a, keptSpans);
    const sb = toSource(b, keptSpans);
    survived.push({ heard: actual.slice(j1, j2).join(' '), context: `${actual.slice(Math.max(0, j1 - 4), j1).join(' ')} [${actual.slice(j1, j2).join(' ')}] ${actual.slice(j2, j2 + 4).join(' ')}`, cut: [a, b], source: [sa, sb], add: spanToAdd(fitted, sa, sb, modelCuts) });
  }
  const heardDiff = {};
  for (const [i, js] of differ) { const k = `${expected[i]} -> ${js.map((j) => actual[j]).join(' ')}`; heardDiff[k] = (heardDiff[k] || 0) + 1; }
  const dbl = doubled(act).map(([j, n]) => ({
    at: act[j][1], words: actual.slice(j, j + n).join(' '),
    context: `${actual.slice(Math.max(0, j - 3), j).join(' ')} [${actual.slice(j, j + n).join(' ')}] ${actual.slice(j + n, j + 2 * n + 3).join(' ')}`,
    add: spanToAdd(fitted, toSource(act[j][1], keptSpans), toSource(act[j + n - 1][2], keptSpans)),
  }));
  const other = extra.filter((t) => !isFiller(t) && !fragment(t));
  const match = same.length / Math.max(1, expected.length);

  const lines = [`expected ${expected.length} words, heard ${actual.length}, match ${(match * 100).toFixed(1)}%`];
  if (missing.length) {
    lines.push('', `MISSING (${missing.length}), kept words next to a join that the render does not play. Fix: raise --pad, narrow the span, or raise --gap-quiet-db (a pause cut ate soft speech):`);
    for (const i of missing.slice(0, 30)) lines.push(`  "${expected[i]}" at ${exp[i][1].toFixed(2)}s in the cut  ... ${expected.slice(Math.max(0, i - 4), i + 5).join(' ')} ...`);
  }
  if (farFromJoins.length) {
    lines.push('', `NOT HEARD, far from any join (${farFromJoins.length}): the second pass misheard these, the cut cannot have removed them: ${farFromJoins.slice(0, 20).map((i) => expected[i]).join(', ')}`);
  }
  if (survived.length) {
    lines.push('', `SURVIVED (${survived.length}), heard where nothing was expected [in brackets]. A real survivor is a repeat or a stumble; clean speech here means the first transcript misheard it:`);
    for (const s of survived) {
      lines.push(`  ... ${s.context} ...`, `    cut ${s.cut[0].toFixed(2)}-${s.cut[1].toFixed(2)}s = source ${s.source[0].toFixed(2)}-${s.source[1].toFixed(2)}s`);
      if (s.add?.kept) lines.push(`    no span: it would also cut kept words (${s.add.kept.slice(0, 60)}). A word label is off, not a repeat.`);
      else if (s.add) lines.push(`    if it is a real repeat, add to decisions.in.json "extra": ${JSON.stringify(s.add)}`);
    }
  }
  if (Object.keys(heardDiff).length) {
    lines.push('', `HEARD DIFFERENTLY (${differ.length}), the same moment spelled another way by the second pass (not a cut error):`);
    lines.push(`  ${Object.entries(heardDiff).map(([k, n]) => (n > 1 ? `${k} x${n}` : k)).join(', ')}`);
  }
  if (dbl.length) {
    lines.push('', `DOUBLED (${dbl.length}), the same words twice in a row. Keep natural ones ("very, very"); for a stumble add the span:`);
    for (const d of dbl) {
      lines.push(`  ${d.at.toFixed(2)}s  ... ${d.context} ...`);
      if (d.add && !d.add.kept) lines.push(`    span: ${JSON.stringify({ ...d.add, kind: 'false_start' })}`);
    }
  }
  if (other.length) lines.push('', `note: ${other.length} other word(s) differ (transcriber variance): ${other.slice(0, 15).join(' ')}`);
  if (fillerNoise) lines.push(`note: fillers that differ between passes: ${fillerNoise}`);
  const ok = !missing.length && !survived.length;
  lines.push('', ok ? 'OK: the render matches the intended cut.' : 'One fix round (spans or --pad, build, render, verify), then show the user what is left.');
  return {
    ok, lines,
    result: { ok, expected: expected.length, heard: actual.length, match: +match.toFixed(4), missing: missing.map((i) => ({ word: expected[i], at: exp[i][1] })), notHeardFarFromJoins: farFromJoins.map((i) => ({ word: expected[i], at: exp[i][1] })), survived, heardDifferently: heardDiff, doubled: dbl, otherDifferences: other, fillerNoise },
  };
}
