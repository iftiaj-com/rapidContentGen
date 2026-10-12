// rcg plan demo: self-check on a scratch job made from the template, no network, no render.
// Block commands run through rcg (so record mode writes plan.json), then: check passes, apply
// rebuilds an identical page, a re-run updates its item in place, a hand edit is caught (drift,
// diff, apply refuses) and kept by the next recorded step, and check fails what it should.

import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT, loadConfig } from '../lib/config.mjs';
import { checkPlan } from './check.mjs';
import { apply, diff } from './plan.mjs';
import { pageSha } from './page.mjs';
import { loadPlan } from './record.mjs';

function check(name, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`);
  return ok;
}

const quiet = (fn) => { const log = console.log; console.log = () => {}; try { return fn(); } finally { console.log = log; } };

export async function demo() {
  const job = join(tmpdir(), `rcg-plan-demo-${process.pid}`);
  const rcg = (...args) => {
    const r = spawnSync(process.execPath, [join(ROOT, 'tools', 'rcg.mjs'), ...args.map(String)], { cwd: ROOT, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`rcg ${args[0]} failed: ${r.stderr.slice(-300)}`);
  };
  const edit = (file, from, to) => { const f = join(job, file); writeFileSync(f, readFileSync(f, 'utf8').replace(from, to)); };
  const has = (res, check, re) => [...res.fails, ...res.warns].some((x) => x.check === check && re.test(x.msg));
  let ok = true;
  rmSync(job, { recursive: true, force: true });
  try {
    cpSync(join(loadConfig().paths.templates, loadConfig().defaults.template), job, { recursive: true });
    mkdirSync(join(job, 'data'), { recursive: true });
    const words = 'So this is a short test of the plan'.split(' ').map((text, i) => ({ text, start: +(0.5 + i * 0.4).toFixed(2), end: +(0.8 + i * 0.4).toFixed(2) }));
    writeFileSync(join(job, 'data', 'words.json'), JSON.stringify({ words }));
    rcg('title', '--job', job, '--text', 'PLAN|CHECK', '--preset', 'slam', '--start', 1, '--duration', 2, '--id', 'title-main', '--insert');
    rcg('captions', '--job', job, '--words', join(job, 'data', 'words.json'), '--style', 'tiktok', '--mode', 'word', '--id', 'cap-vo', '--insert');
    let plan = loadPlan(job);
    ok = check('record mode: two items', plan?.items.length === 2 && plan.items[1].argv.includes('{job}'), plan?.items.map((i) => i.key).join(', ')) && ok;
    let res = checkPlan(job);
    ok = check('check passes', res.ok && !res.warns.length, JSON.stringify([...res.fails, ...res.warns])) && ok;

    const sha = pageSha(job);
    quiet(() => apply(job));
    ok = check('apply rebuilds an identical page', pageSha(job) === sha) && ok;

    rcg('captions', '--job', job, '--words', join(job, 'data', 'words.json'), '--style', 'tiktok', '--mode', '2word', '--id', 'cap-vo', '--insert');
    plan = loadPlan(job);
    ok = check('a re-run updates its item in place', plan.items.length === 2 && plan.items[1].argv.includes('2word')) && ok;

    // a hand edit (as HyperFrames Studio would make): move the title
    edit('index.html', /(id="title-main"[^>]*data-start=")1(")/, '$11.5$2');
    res = checkPlan(job);
    ok = check('drift is reported', has(res, 'drift', /changed since/)) && ok;
    let refused = false;
    try { quiet(() => apply(job)); } catch { refused = true; }
    ok = check('apply refuses over a hand edit', refused) && ok;
    let diffOut = '';
    const log = console.log; console.log = (s) => { diffOut += s; }; diff(job); console.log = log;
    ok = check('diff names the edit', /title-main: data-start 1 -> 1\.5/.test(diffOut), diffOut) && ok;
    rcg('title', '--job', job, '--text', 'SECOND', '--preset', 'stagger-up', '--start', 3, '--duration', 1.5, '--id', 'title-2', '--insert');
    plan = loadPlan(job);
    const sha2 = pageSha(job);
    quiet(() => apply(job));
    ok = check('the next recorded step keeps the hand edit', plan.items.filter((i) => i.inBase).length === 2 && pageSha(job) === sha2
      && /id="title-main"[^>]*data-start="1\.5"/.test(readFileSync(join(job, 'index.html'), 'utf8'))) && ok;

    // what check must fail
    const comp = readFileSync(join(job, 'compositions', 'cap-vo.html'), 'utf8');
    edit('compositions/cap-vo.html', /CENTER_Y = \d+/, 'CENTER_Y = 1500');
    ok = check('FAIL text in the bottom no-text zone', has(checkPlan(job), 'safe', /bottom no-text zone/)) && ok;
    writeFileSync(join(job, 'compositions', 'cap-vo.html'), comp);
    writeFileSync(join(job, 'data', 'words.json'), JSON.stringify({ source: 'assets/cut/take.mp4', cutOf: 'assets/take.mp4', words }));
    ok = check('FAIL captions timed to a cut the page does not play', has(checkPlan(job), 'captions', /rcg cut/)) && ok;
    writeFileSync(join(job, 'data', 'words.json'), JSON.stringify({ words: words.map((w) => ({ ...w, start: w.start + 9, end: w.end + 9 })) }));
    ok = check('FAIL words past the composition', has(checkPlan(job), 'captions', /after the composition/)) && ok;
    edit('index.html', /<div id="title-2"[\s\S]*?<\/div>/, '');
    rmSync(join(job, 'compositions', 'title-2.html'));
    ok = check('FAIL a recorded block missing from the page', has(checkPlan(job), 'host', /title-2/)) && ok;
  } catch (e) {
    ok = check('demo', false, e.message);
  } finally {
    rmSync(job, { recursive: true, force: true });
  }
  console.log(ok ? '\nrcg plan demo: all checks pass' : '\nrcg plan demo: FAILED');
  return ok;
}
