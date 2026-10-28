#!/usr/bin/env node
// rcg plan: jobs/<id>/data/plan.json, everything on screen in one checkable file.
//
// Record mode (now): every block command run through rcg (captions, title, camera, pnp, style,
// transition, ...) writes its item into plan.json (tools/plan/record.mjs). The block commands and
// the user's workflow do not change.
//
//   rcg plan check <job>          checks on paper before a render (tools/plan/check.mjs); writes
//                                 data/plan-check.json; exit 1 on a FAIL
//   rcg plan apply <job> [--force] [--dry-run]
//                                 rebuild the page from plan.json: the base page, then every item
//                                 replayed in order. Refuses when the page changed since the last
//                                 recorded step (HyperFrames Studio, a hand edit) unless --force;
//                                 the page before is kept in data/plan/pre-apply/
//   rcg plan diff <job>           what changed in the page since the last recorded step
//   rcg plan show <job>           the items, in order
//   rcg plan demo                 self-check on a scratch job from the template, no network
//
// <job> may also be given as --job. Kinds and their checks: tools/plan/kinds.mjs.

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { isMain, parseArgs } from '../lib/cli.mjs';
import { ROOT } from '../lib/config.mjs';
import { localStamp } from '../lib/lock.mjs';
import { checkPlan } from './check.mjs';
import { pageSha, readPage } from './page.mjs';
import { loadPlan, savePlan, snapshotPage } from './record.mjs';

const posix = (p) => p.split(sep).join('/');

function jobDir(arg) {
  if (!arg || arg === true) throw new Error('Name the job: rcg plan <step> jobs/<id>');
  const job = [resolve(String(arg)), join(ROOT, String(arg))].find((p) => existsSync(join(p, 'index.html')));
  if (!job) throw new Error(`Not a job folder (no index.html): ${arg}`);
  return job;
}

export function check(job) {
  const res = checkPlan(job);
  for (const f of res.fails) console.log(`FAIL  ${f.check.padEnd(9)} ${f.msg}`);
  for (const w of res.warns) console.log(`WARN  ${w.check.padEnd(9)} ${w.msg}`);
  console.log(`${res.items} item(s), ${res.fails.length} fail, ${res.warns.length} warn${res.safeZones ? ` (safe zones: ${res.safeZones})` : ' (no template matches the page size: safe zones not checked)'}`);
  writeFileSync(join(job, 'data', 'plan-check.json'), JSON.stringify({ ...res, checkedAt: localStamp() }, null, 1) + '\n');
  return res.ok;
}

/** The commands apply runs: [{ item, cwd, argv }]. */
function replaySteps(job, plan) {
  return plan.items.filter((item) => !item.inBase).map((item) => {
    const cwd = item.cwd === '.' ? ROOT : isAbsolute(item.cwd) ? item.cwd : join(ROOT, item.cwd);
    const jobArg = posix(relative(cwd, job)) || '.';
    return { item, cwd, argv: [item.command, ...item.argv.map((v) => v.replace(/^\{job\}/, jobArg))] };
  });
}

export function apply(job, a = {}) {
  const plan = loadPlan(job);
  if (!plan?.items?.length) throw new Error('No items in data/plan.json to apply');
  const base = join(job, 'data', 'plan', 'base');
  if (!existsSync(join(base, 'index.html'))) throw new Error('No base page in data/plan/base/');
  const now = pageSha(job);
  if (now !== plan.pageSha && !a.force) {
    throw new Error('The page changed since the last recorded step (rcg plan diff shows what). Apply would replace those changes: '
      + 'record them as block commands, or pass --force (the page is kept in data/plan/pre-apply/).');
  }
  const steps = replaySteps(job, plan);
  if (a['dry-run']) {
    console.log(`restore data/plan/base (${plan.base?.reason || 'base'}, ${plan.base?.at || '?'})`);
    for (const s of steps) console.log(`> node tools/rcg.mjs ${s.argv.map((x) => (/[\s|"]/.test(x) ? JSON.stringify(x) : x)).join(' ')}`);
    return true;
  }
  snapshotPage(job, join(job, 'data', 'plan', 'pre-apply'));
  copyFileSync(join(base, 'index.html'), join(job, 'index.html'));
  const comp = join(job, 'compositions');
  mkdirSync(comp, { recursive: true });
  for (const f of readdirSync(comp).filter((x) => x.endsWith('.html'))) rmSync(join(comp, f));
  for (const f of readdirSync(join(base, 'compositions'))) copyFileSync(join(base, 'compositions', f), join(comp, f));
  for (const s of steps) {
    console.log(`> ${s.argv.join(' ').slice(0, 160)}`);
    const r = spawnSync(process.execPath, [join(ROOT, 'tools', 'rcg.mjs'), ...s.argv], { cwd: s.cwd, stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, RCG_PLAN_REPLAY: '1' } });
    if (r.status !== 0) throw new Error(`${s.item.key} failed (exit ${r.status}); the page before apply is in data/plan/pre-apply/`);
  }
  const after = pageSha(job);
  plan.pageSha = after;
  savePlan(job, plan);
  snapshotPage(job, join(job, 'data', 'plan', 'last'));
  console.log(`applied ${steps.length} item(s) on the base page: ${after === now ? 'the page is identical to before' : 'the page changed (plan.json differs from what the page held)'}`);
  return true;
}

export function diff(job) {
  const last = join(job, 'data', 'plan', 'last');
  if (!existsSync(join(last, 'index.html'))) { console.log('Nothing recorded yet.'); return true; }
  const els = (html) => new Map(readPage(html).elements.filter((e) => e.id).map((e) => [e.id, e.openTag]));
  const was = els(readFileSync(join(last, 'index.html'), 'utf8'));
  const is = els(readFileSync(join(job, 'index.html'), 'utf8'));
  const lines = [];
  for (const [id, tag] of is) if (!was.has(id)) lines.push(`+ #${id} added`); else if (was.get(id) !== tag) lines.push(`~ #${id}: ${attrDiff(was.get(id), tag)}`);
  for (const id of was.keys()) if (!is.has(id)) lines.push(`- #${id} removed`);
  const cw = join(last, 'compositions');
  const ci = join(job, 'compositions');
  const files = new Set([...(existsSync(cw) ? readdirSync(cw) : []), ...(existsSync(ci) ? readdirSync(ci).filter((f) => f.endsWith('.html')) : [])]);
  for (const f of [...files].sort()) {
    const a = existsSync(join(cw, f)) ? readFileSync(join(cw, f), 'utf8') : null;
    const b = existsSync(join(ci, f)) ? readFileSync(join(ci, f), 'utf8') : null;
    if (a !== b) lines.push(`${b == null ? '-' : a == null ? '+' : '~'} compositions/${f}`);
  }
  if (!lines.length && readFileSync(join(last, 'index.html'), 'utf8') !== readFileSync(join(job, 'index.html'), 'utf8')) lines.push('~ index.html changed outside the timed elements (styles, scripts, attributes of untimed wrappers)');
  console.log(lines.length ? lines.join('\n') : 'No change since the last recorded step.');
  return !lines.length;
}

function attrDiff(a, b) {
  const attrs = (t) => Object.fromEntries([...t.matchAll(/\s([\w-]+)(?:="([^"]*)")?/g)].map((m) => [m[1], m[2] ?? '']));
  const x = attrs(a);
  const y = attrs(b);
  return [...new Set([...Object.keys(x), ...Object.keys(y)])].filter((k) => x[k] !== y[k]).map((k) => `${k} ${x[k] ?? '(none)'} -> ${y[k] ?? '(none)'}`).join(', ');
}

export function show(job) {
  const plan = loadPlan(job);
  if (!plan) { console.log('No data/plan.json yet.'); return true; }
  console.log(`${plan.format.width}x${plan.format.height}, ${plan.format.duration}s; base: ${plan.base?.reason || '?'} (${plan.base?.at || '?'})`);
  plan.items.forEach((it, i) => console.log(`${String(i + 1).padStart(3)}. ${it.track.padEnd(8)} ${it.key.padEnd(22)}${it.inBase ? ' (in base)' : ''} rcg ${it.command} ${it.argv.join(' ').slice(0, 110)}`));
  return true;
}

async function main() {
  const a = parseArgs();
  const [step, target] = a._;
  const steps = { check, apply, diff, show };
  if (step === 'demo') {
    const { demo } = await import('./demo.mjs');
    process.exit((await demo()) ? 0 : 1);
  }
  if (!steps[step]) {
    console.log('Usage: rcg plan <check|apply|diff|show> <job> [--force] [--dry-run] | rcg plan demo   (see tools/plan/plan.mjs)');
    process.exit(step ? 2 : 0);
  }
  const ok = steps[step](jobDir(a.job ?? target), a);
  process.exit(ok ? 0 : 1);
}

if (isMain(import.meta.url)) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
