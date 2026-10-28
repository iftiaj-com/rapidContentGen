// plan.json record mode: tools/rcg.mjs calls beginRecord() around every block command, so each
// step that edits a job's page also writes its item into jobs/<id>/data/plan.json. Nothing changes
// for the user or the block commands.
//
//   - An item is the command and its exact argv (the job path written as {job}), keyed by
//     kinds.mjs: running the same block again updates the item in place.
//   - The page before the first recorded step is saved as the base (data/plan/base/: index.html
//     and compositions/*.html). When the page changed outside recorded steps (HyperFrames Studio,
//     a hand edit, a tool run without rcg), the page as it is becomes the new base, and the items
//     already in it are marked inBase.
//   - plan apply restores the base and replays the items not in it (RCG_PLAN_REPLAY=1: not
//     recorded again). The result is the page as the last recorded step left it.
// Recording never fails a command: a problem here is printed as a warning.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { parseArgs } from '../lib/cli.mjs';
import { ROOT } from '../lib/config.mjs';
import { localStamp } from '../lib/lock.mjs';
import { kindOf, trackOf } from './kinds.mjs';
import { pageSha, readPage } from './page.mjs';

const posix = (p) => p.split(sep).join('/');
export const planFile = (job) => join(job, 'data', 'plan.json');

export function loadPlan(job) {
  const f = planFile(job);
  if (!existsSync(f)) return null;
  return JSON.parse(readFileSync(f, 'utf8').replace(/^﻿/, ''));
}

export function savePlan(job, plan) {
  const f = planFile(job);
  mkdirSync(join(job, 'data'), { recursive: true });
  writeFileSync(`${f}.tmp`, JSON.stringify(plan, null, 1) + '\n', 'utf8');
  renameSync(`${f}.tmp`, f);
}

/** Copy index.html and compositions/*.html of `job` into `dir` (replacing what was there). */
export function snapshotPage(job, dir) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, 'compositions'), { recursive: true });
  if (existsSync(join(job, 'index.html'))) copyFileSync(join(job, 'index.html'), join(dir, 'index.html'));
  const comp = join(job, 'compositions');
  if (existsSync(comp)) for (const f of readdirSync(comp).filter((x) => x.endsWith('.html'))) copyFileSync(join(comp, f), join(dir, 'compositions', f));
}

/** {id: openTag} for the page's timed elements, and {file: sha} for its compositions. */
function pageState(job) {
  const html = existsSync(join(job, 'index.html')) ? readFileSync(join(job, 'index.html'), 'utf8') : '';
  const tags = Object.fromEntries(readPage(html).elements.filter((e) => e.id).map((e) => [e.id, e.openTag]));
  const comps = {};
  const dir = join(job, 'compositions');
  if (existsSync(dir)) for (const f of readdirSync(dir).filter((x) => x.endsWith('.html'))) comps[f] = createHash('sha1').update(readFileSync(join(dir, f))).digest('hex');
  return { tags, comps, sha: pageSha(job) };
}

/** argv with the job path written as {job}, so the plan replays on a copy of the job too. */
function tokenize(argv, jobArg, job) {
  const forms = [...new Set([jobArg, posix(jobArg), job, posix(job)])].filter(Boolean).sort((x, y) => y.length - x.length);
  return argv.map((v) => {
    for (const f of forms) {
      if (v === f) return '{job}';
      if (v.startsWith(`${f}/`) || v.startsWith(`${f}\\`)) return `{job}/${posix(v.slice(f.length + 1))}`;
    }
    return v;
  });
}

function emptyPlan(job) {
  const html = existsSync(join(job, 'index.html')) ? readFileSync(join(job, 'index.html'), 'utf8') : '';
  const { root } = readPage(html);
  return { version: 1, format: { width: root.width, height: root.height, duration: root.duration }, base: null, pageSha: null, items: [] };
}

/**
 * Called before a command runs. Returns null when the run is not a recorded block step, else
 * { finish(code) } to call when it has exited.
 */
export function beginRecord(command, argv) {
  if (process.env.RCG_PLAN_REPLAY === '1') return null;
  try {
    const a = parseArgs(argv);
    const kind = kindOf(command, a);
    if (!kind) return null;
    const job = resolve(String(a.job));
    if (!existsSync(join(job, 'index.html'))) return null;
    const before = pageState(job);
    const plan0 = loadPlan(job) || emptyPlan(job);
    if (plan0.pageSha !== before.sha) {
      // First recorded step, or the page changed outside recorded steps: the page as it is becomes
      // the base. Items already recorded are in it (marked inBase): plan check still reads them,
      // plan apply does not replay them, so an outside edit to their output is never undone.
      snapshotPage(job, join(job, 'data', 'plan', 'base'));
      plan0.base = { sha: before.sha, at: localStamp(), reason: plan0.pageSha ? 'the page changed outside recorded steps' : 'first recorded step' };
      for (const it of plan0.items) it.inBase = true;
      plan0.pageSha = before.sha;
      savePlan(job, plan0);
    }
    return {
      finish(code) {
        if (code !== 0) return;
        try {
          const after = pageState(job);
          const plan = loadPlan(job) || plan0;
          const removed = kind.removes?.(a);
          if (removed != null && removed !== true) {
            plan.items = plan.items.filter((it) => it.key !== String(removed));
          } else {
            const hosts = [
              ...Object.keys(after.tags).filter((id) => after.tags[id] !== before.tags[id]),
              ...Object.keys(after.comps).filter((f) => after.comps[f] !== before.comps[f]).map((f) => f.replace(/\.html$/, '')),
            ];
            const tokens = tokenize(argv, String(a.job), job);
            const key = String(kind.key(parseArgs(tokens))); // from the {job} form: no machine path in a key
            const cwd = relative(ROOT, process.cwd());
            const item = {
              key, command, track: trackOf(kind, a), argv: tokens,
              cwd: !cwd ? '.' : cwd.startsWith('..') || isAbsolute(cwd) ? posix(process.cwd()) : posix(cwd),
              hosts: [...new Set(hosts)].filter((h) => after.tags[h] || after.comps[`${h}.html`]), recordedAt: localStamp(),
            };
            const i = plan.items.findIndex((it) => it.key === key);
            if (i < 0) plan.items.push(item);
            else plan.items[i] = { ...item, hosts: item.hosts.length ? item.hosts : plan.items[i].hosts };
          }
          const { root } = readPage(readFileSync(join(job, 'index.html'), 'utf8'));
          plan.format = { width: root.width, height: root.height, duration: root.duration };
          plan.pageSha = after.sha;
          savePlan(job, plan);
          snapshotPage(job, join(job, 'data', 'plan', 'last'));
        } catch (e) {
          console.error(`plan.json: not recorded (${e.message})`);
        }
      },
    };
  } catch (e) {
    console.error(`plan.json: not recorded (${e.message})`);
    return null;
  }
}
