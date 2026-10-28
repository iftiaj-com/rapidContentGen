// rcg cut apply: the agent's answers (decisions.in.json) over the code's candidates -> spans.json
// (what to remove, quoted from the transcript) + review.md (what the user decides) + hooks.json.
//
// decisions.in.json:
//   { "transcript": "<sha from candidates.json>",
//     "answers": { "c1": "cut", "c2": "keep", "c3": "unsure", "c4": {"answer": "cut", "keep": "first", "note": "..."},
//                  "a2": "keep" },
//     "extra": [ {"text": "wait sorry", "kind": "meta", "after": 14.5, "note": "..."} ] }
//
//   cut                     cut (for a restart: the earlier attempt; the later one stays)
//   cut + keep: "first"     never cut by code: the earlier take is better, so it goes to review.md
//   unsure                  not cut, listed in review.md
//   keep                    not cut
// a-ids (um/uh, alternate hooks) are cut without an answer; "keep" keeps one.
// extra: spans the code did not flag (a verify SURVIVED, a missed restart). Same shape as spans.json.

import { nwords } from './text.mjs';

const RANK = { alt_hook: 5, retake: 4, false_start: 3, meta: 2, filler: 1 };

function answerOf(v) {
  if (v == null) return null;
  if (typeof v === 'string') return { answer: v };
  return v;
}

/** { spans, review, hooks, errors } */
export function applyAnswers(words, cands, input) {
  const answers = input.answers || {};
  const errors = [];
  const cuts = [];
  const review = [];
  for (const c of cands) {
    const a = answerOf(answers[c.id]);
    if (c.auto) {
      if (a?.answer === 'keep') continue;
      cuts.push({ ...c, note: c.kind === 'alt_hook' ? `alternate hook ${c.hook}` : 'hesitation' });
      continue;
    }
    if (!a || !['cut', 'keep', 'unsure'].includes(a.answer)) {
      errors.push(`${c.id} (${c.kind} at ${c.at.toFixed(2)}s): answer cut, keep or unsure`);
      continue;
    }
    if (a.answer === 'keep') continue;
    if (a.answer === 'unsure') { review.push({ ...c, why: a.note || 'unsure' }); continue; }
    if (a.keep === 'first' && c.second) {
      review.push({ ...c, why: `the earlier take reads better${a.note ? `: ${a.note}` : ''}. Not cut: decide which take stays` });
      continue;
    }
    cuts.push({ ...c, note: [c.keeperAt != null ? `keeper at ${c.keeperAt.toFixed(1)}s` : '', a.note || ''].filter(Boolean).join('; ') });
  }
  for (const id of Object.keys(answers)) {
    if (!cands.some((c) => c.id === id)) errors.push(`${id}: no such candidate (candidates.md lists them)`);
  }
  // Merge touching or overlapping cuts (alternate hooks only with each other), then quote them.
  const merged = [];
  for (const c of [...cuts].sort((x, y) => x.cut[0] - y.cut[0])) {
    const [a, b] = c.cut;
    const last = merged[merged.length - 1];
    if (last && a <= last.b + 1 && (last.kind === 'alt_hook') === (c.kind === 'alt_hook')) {
      last.b = Math.max(last.b, b);
      if (RANK[c.kind] > RANK[last.kind]) last.kind = c.kind;
      if (c.note) last.notes.push(c.note);
    } else merged.push({ a, b, kind: c.kind, notes: c.note ? [c.note] : [] });
  }
  const spans = [];
  for (const m of merged) {
    let { a, b } = m;
    while (a < b && !nwords(words[a].text).length) a++;
    while (b > a && !nwords(words[b].text).length) b--;
    if (!nwords(words[a].text).length) continue;
    const sp = {
      text: words.slice(a, b + 1).map((t) => t.text.trim()).join(' '),
      kind: m.kind,
      after: Math.max(0, +(words[a].start - 0.001).toFixed(3)),
    };
    const note = m.notes.join('; ');
    if (note) sp.note = note.slice(0, 160);
    spans.push(sp);
  }
  for (const [i, e] of (input.extra || []).entries()) {
    if (!e || typeof e.text !== 'string' || !e.kind) errors.push(`extra[${i}]: needs "text" and "kind"`);
    else spans.push({ ...e });
  }
  const hooks = cands.filter((c) => c.kind === 'alt_hook').map((c) => ({ hook: c.hook, at: c.at, text: c.text }));
  return { spans, review, hooks, errors };
}

export function reviewMd(review) {
  if (!review.length) return '# Review\n\nNothing for the user to decide. Read paper-edit.md after `rcg cut build`.\n';
  const lines = ['# Review', '', `${review.length} item(s) not cut, for the user to decide. To cut one, answer it`
    + ' `"cut"` in decisions.in.json (or add it to "extra"), then run `rcg cut apply` again.', ''];
  for (const r of review) {
    lines.push(`- **${r.id}** ${r.at.toFixed(2)}s \`${r.kind}\`: ${r.why}`);
    lines.push(`  - "${r.text}"`);
    if (r.second) lines.push(`  - said again at ${r.keeperAt.toFixed(2)}s: "${r.second}"`);
  }
  return lines.join('\n') + '\n';
}
