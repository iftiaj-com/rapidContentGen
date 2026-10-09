// Claims and slots so several agent sessions (Claude Code, Antigravity, ...) can
// work in one workspace at once. Both rest on an exclusive file create ('wx'),
// which is atomic: when two processes race, exactly one wins.
//
//   claimFile(file, info)      one-shot claim (an inbox folder); refuses if taken
//   acquireSlot(name, opts)    one of N machine-wide slots; waits for a free one,
//                              released when the process exits
//   heavySlot(task, job, opts) the shared slot for GPU/RAM-heavy work: rcg render,
//                              fx, matte and track (defaults.heavySlots, 1)
//
// Slot files live in <repo>/.cache/locks/ (git-ignored). A slot whose process is
// gone (crash, killed terminal) is stale and taken over.

import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { basename, join } from 'node:path';
import { ROOT, loadConfig } from './config.mjs';

export const LOCK_DIR = join(ROOT, '.cache', 'locks');

/** Which agent is running this: --agent / RCG_AGENT, else a guess from the environment. */
export function agentName(flag) {
  if (typeof flag === 'string' && flag) return flag;
  if (process.env.RCG_AGENT) return process.env.RCG_AGENT;
  if (process.env.CLAUDECODE) return 'claude-code';
  return process.env.AI_AGENT || 'unknown';
}

export function readClaim(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; }
}

/** Write `info` to `file` only if it does not exist yet. Returns { ok, claim }. */
export function claimFile(file, info) {
  const claim = { ...info, host: hostname(), claimedAt: new Date().toISOString() };
  try {
    writeFileSync(file, JSON.stringify(claim, null, 2) + '\n', { flag: 'wx' });
    return { ok: true, claim };
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    return { ok: false, claim: readClaim(file) };
  }
}

function pidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

/** A slot is stale when its process on this machine is gone, or the file is unreadable. */
function stale(info) {
  if (!info || !info.pid) return true;
  if (info.host && info.host !== hostname()) return false;
  return !pidAlive(info.pid);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Take one of `slots` slots named `name`. Waits (polling) while all are busy, up
 * to `waitMs` (Infinity by default; 0 = do not wait). Returns { ok, release, file }
 * or { ok: false, holders } when it gave up. The slot is freed by release(), on
 * normal exit, and on Ctrl+C.
 */
export async function acquireSlot(name, { slots = 1, waitMs = Infinity, info = {}, onWait = () => {}, pollMs = 3000 } = {}) {
  mkdirSync(LOCK_DIR, { recursive: true });
  const files = Array.from({ length: Math.max(1, slots) }, (_, i) => join(LOCK_DIR, `${name}-${i + 1}.lock`));
  const start = Date.now();
  let told = false;
  for (;;) {
    const holders = [];
    for (const file of files) {
      const res = claimFile(file, { ...info, pid: process.pid });
      if (res.ok) return { ok: true, file, release: holdUntilExit(file) };
      if (stale(res.claim)) {
        try { unlinkSync(file); } catch { /* another waiter removed it first */ }
        const again = claimFile(file, { ...info, pid: process.pid });
        if (again.ok) return { ok: true, file, release: holdUntilExit(file), tookOver: res.claim };
      }
      holders.push(readClaim(file));
    }
    if (Date.now() - start >= waitMs) return { ok: false, holders };
    if (!told) { onWait(holders.filter(Boolean)); told = true; }
    await sleep(pollMs);
  }
}

/**
 * Take the machine-wide slot for heavy work (headless Chrome on the GPU, many
 * frames in RAM), waiting while another session holds it. opts: lockWait /
 * 'lock-wait' (minutes; 0 = do not wait), agent. Returns release(); throws when
 * the wait runs out.
 */
export async function heavySlot(task, jobDir, opts = {}) {
  const wait = opts.lockWait ?? opts['lock-wait'];
  const slot = await acquireSlot('heavy', {
    slots: Number(loadConfig().defaults.heavySlots) || 1,
    waitMs: wait == null || wait === true ? Infinity : Number(wait) * 60000,
    info: { task, job: basename(jobDir), agent: agentName(opts.agent), startedAt: new Date().toISOString() },
    onWait: (h) => console.log(`Waiting for the heavy-work slot (render, fx, matte, track): ${h.map((x) => `${x.task || '?'} ${x.job} (${x.agent}, pid ${x.pid}, since ${x.startedAt})`).join('; ')}`),
  });
  if (!slot.ok) {
    const busy = slot.holders.filter(Boolean).map((x) => `${x.task || '?'} ${x.job}`).join(', ');
    throw new Error(`No free heavy-work slot after ${wait} min. Busy: ${busy}`);
  }
  if (slot.tookOver) console.log(`Took over a stale heavy-work slot from ${slot.tookOver.task || '?'} ${slot.tookOver.job} (pid ${slot.tookOver.pid} is gone).`);
  return slot.release;
}

function holdUntilExit(file) {
  let held = true;
  const release = () => {
    if (!held) return;
    held = false;
    try {
      if (readClaim(file)?.pid === process.pid) unlinkSync(file);
    } catch { /* already gone */ }
  };
  const onSignal = () => { release(); process.exit(130); };
  process.once('exit', release);
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  return release;
}
