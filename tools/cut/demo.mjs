// rcg cut demo: self-check with no network and no Whisper. Unit checks on the text and diff helpers,
// then the whole cut on a synthetic 30 fps clip whose "words" are tone bursts with a known
// transcript: a false start, an "um", a long pause. propose -> apply -> build -> render -> look.

import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from '../lib/ffmpeg.mjs';
import { findCandidates } from './candidates.mjs';
import { apply, build, propose, render } from './cut.mjs';
import { jobContext, readJson, sha256File, writeJson } from './job.mjs';
import { SequenceMatcher, canon, locate, nwords, pairByTime } from './text.mjs';
import { compare, doubled } from './verify.mjs';
import { countFrames } from './render.mjs';

// [text, start, end]: "so the thing about" is abandoned and said again; "um" is a hard filler; 1.5 s pause before "save".
const WORDS = [
  ['So', 0.5, 0.7], ['the', 0.75, 0.9], ['thing', 0.95, 1.2], ['about,', 1.25, 1.5],
  ['so', 2.1, 2.3], ['the', 2.35, 2.5], ['thing', 2.55, 2.8], ['about', 2.85, 3.1], ['money', 3.15, 3.5], ['is', 3.55, 3.7], ['simple.', 3.75, 4.2],
  ['Um,', 4.6, 4.9], ['save', 6.4, 6.7], ['first.', 6.75, 7.2],
];
const DUR = 8;

function check(name, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`);
  return ok;
}

function units() {
  const r = [];
  r.push(check('difflib ratio', Math.abs(new SequenceMatcher([...'abcd'], [...'bcde']).ratio() - 0.75) < 1e-9));
  const ops = new SequenceMatcher('a b c d'.split(' '), 'a x c d e'.split(' ')).opcodes().map((o) => o[0]).join(',');
  r.push(check('difflib opcodes', ops === 'equal,replace,equal,insert', ops));
  r.push(check('number folding', canon(nwords('fifteen hundred people, one of them')).join(' ') === '1500 people one of them'));
  const w = WORDS.map(([text, start, end]) => ({ text, start, end }));
  r.push(check('locate repeats', JSON.stringify(locate('the thing about', w)) === '[[1,3],[5,7]]'));
  const p = pairByTime([['jev', 1, 1.2], ['is', 1.3, 1.4]], [['jeff', 1.02, 1.2], ['is', 1.3, 1.4]]);
  r.push(check('pair by time', p.differ.length === 1 && p.same.length === 1 && !p.gone.length));
  const act = 'so now now one thing very very um um and the the'.split(' ').map((t, i) => [t, i * 0.3, i * 0.3 + 0.25]);
  r.push(check('doubled words', JSON.stringify(doubled(act).map(([j, n]) => [act[j][0], n])) === '[["now",1],["very",1],["the",1]]'));
  const cands = findCandidates(w);
  const fs = cands.find((c) => c.kind === 'false_start' && c.text === 'So the thing about,');
  r.push(check('restart found', Boolean(fs), cands.map((c) => `${c.id} ${c.kind} "${c.text}"`).join('; ')));
  r.push(check('um cut without asking', cands.some((c) => c.auto && c.text === 'Um,')));
  // a two-clause line said twice: ONE restart, from the first take to the second (not one per clause)
  const two = "So, I'm doing something. I'm working on something. So, I'm doing something. I'm working on something. And then".split(' ')
    .map((text, i) => ({ text, start: i * 0.4 + (i >= 9 ? 1 : 0), end: i * 0.4 + 0.3 + (i >= 9 ? 1 : 0) }));
  const re = findCandidates(two).filter((c) => c.second);
  r.push(check('two-clause retake is one cut', re.length === 1 && re[0].text === "I'm doing something. I'm working on something. So,", re.map((c) => `"${c.text}"`).join('; ')));
  // verify: a kept word lost at a join and a removed word surviving are both caught; a word the
  // second pass missed far from every join is not a cut error
  const kept = [{ start: 2.0, end: 3.3 }, { start: 3.55, end: 4.4 }]; // joins at 0, 1.3 and 2.15 s in the cut
  const fitted = w.slice(0, 11);
  const said = [['so', 0.0, 0.08], ['so', 0.1, 0.3], ['the', 0.35, 0.5], ['thing', 0.55, 0.8], ['about', 0.85, 1.1], ['is', 1.3, 1.45], ['simple', 1.5, 1.95]];
  const heard = said.map(([text, start, end]) => ({ text, start, end }));
  const v = compare({ fitted, keptSpans: kept, modelCuts: [{ start: 0.5, end: 1.5 }], heard });
  r.push(check('verify finds MISSING at a join', v.result.missing.length === 1 && v.result.missing[0].word === 'money', JSON.stringify(v.result.missing)));
  r.push(check('verify finds SURVIVED', v.result.survived.length === 1, v.result.survived.map((s) => s.context).join('; ')));
  const v2 = compare({ fitted, keptSpans: kept, modelCuts: [{ start: 0.5, end: 1.5 }], heard: heard.filter((x, i) => i > 0 && x.text !== 'thing').concat([{ text: 'money', start: 1.15, end: 1.3 }]).sort((x, y) => x.start - y.start) });
  r.push(check('verify: unheard far from joins is not an error', v2.ok && v2.result.notHeardFarFromJoins.some((m) => m.word === 'thing'), JSON.stringify(v2.result.notHeardFarFromJoins)));
  return r.every(Boolean);
}

export async function demo() {
  console.log('rcg cut demo\n');
  let ok = units();
  const job = join(tmpdir(), `rcg-cut-demo-${process.pid}`);
  rmSync(job, { recursive: true, force: true });
  mkdirSync(join(job, 'assets'), { recursive: true });
  mkdirSync(join(job, 'data', 'cut'), { recursive: true });
  try {
    const take = join(job, 'assets', 'take.mp4');
    const on = WORDS.map(([, a, b]) => `between(t,${a},${b})`).join('+');
    await run('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `testsrc2=s=320x240:r=30:d=${DUR}`,
      '-f', 'lavfi', '-i', `aevalsrc='0.4*sin(2*PI*220*t)*(${on})+0.0005*sin(2*PI*50*t)':s=48000:d=${DUR}`,
      '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', take]);
    writeJson(join(job, 'data', 'intake.json'), [{ kind: 'video', asset: 'assets/take.mp4' }]);
    const ctx = jobContext(job);
    writeJson(ctx.file('words.raw.json'), {
      version: 1, source: 'assets/take.mp4', sourceSha256: await sha256File(take), model: 'demo', settings: 'demo',
      words: WORDS.map(([text, start, end]) => ({ text, start, end })),
    });
    console.log('\n--- propose');
    propose(ctx, {});
    const din = readJson(ctx.file('decisions.in.json'));
    const cj = readJson(ctx.file('candidates.json'));
    for (const id of Object.keys(din.answers)) {
      const c = cj.candidates.find((x) => x.id === id);
      din.answers[id] = c.second ? 'cut' : 'keep'; // the restart is cut, everything else kept
    }
    writeJson(ctx.file('decisions.in.json'), din);
    console.log('\n--- apply');
    apply(ctx);
    const spans = readJson(ctx.file('spans.json'));
    ok = check('spans: the false start and the um', spans.length === 2 && spans.some((s) => s.kind === 'false_start') && spans.some((s) => s.kind === 'filler'), JSON.stringify(spans)) && ok;
    console.log('\n--- build');
    const plan = await build(ctx, {});
    const dec = readJson(ctx.file('decisions.json'));
    const words = readJson(join(job, 'data', 'words.json')).words.map((x) => x.text).join(' ');
    ok = check('kept words', words === 'so the thing about money is simple. save first.', words) && ok;
    ok = check('pause tightened', plan.final < 5.2 && plan.final > 3, `${plan.final.toFixed(2)}s of ${DUR}s`) && ok;
    console.log('\n--- render');
    await render(ctx, { 'lock-wait': 5 });
    const want = dec.frames.reduce((s, [a, b]) => s + b - a, 0);
    const got = await countFrames(join(job, dec.output));
    ok = check('frames in == frames out', got === want, `${got} of ${want}`) && ok;
  } catch (e) {
    ok = check('pipeline', false, e.message);
  } finally {
    rmSync(job, { recursive: true, force: true });
  }
  console.log(ok ? '\nrcg cut demo: all checks pass' : '\nrcg cut demo: FAILED');
  return ok;
}
