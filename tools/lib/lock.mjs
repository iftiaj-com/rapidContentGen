// Claims and slots so several agent sessions (Claude Code, Antigravity, ...) can
// work in one workspace at once. Both rest on an exclusive file create ('wx'),
// which is atomic: when two processes race, exactly one wins.
//
//   claimFile(file, info)      one-shot claim (an inbox folder); refuses if taken
//   acquireSlot(name, opts)    one of N machine-wide slots; waits for a free one,
//                              released when the process exits
//   heavySlot(task, job, opts) the shared slot for GPU/RAM-heavy work: rcg render,
//                              fx, matte, track, layers and hf render/snapshot
//                              (defaults.heavySlots, 1); warns when free RAM is
//                              under defaults.minFreeMemGb
//
// Slot files live in <repo>/.cache/locks/ (git-ignored). A slot whose process is
// gone (crash, killed terminal), or that is older than MAX_AGE (a reused pid, a
// lock from another machine on a synced drive), is stale and taken over.

import { mkdirSync, readFileSync, rmdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { freemem, hostname } from 'node:os';
import { basename, join, relative } from 'node:path';
import { ROOT, loadConfig } from './config.mjs';

export const LOCK_DIR = join(ROOT, '.cache', 'locks');

/** Local system time as "YYYY-MM-DD HH:MM:SS +HH:MM" (the offset keeps it exact). */
export function localStamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  const sign = off < 0 ? '-' : '+';
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())} ${sign}${p(Math.floor(Math.abs(off) / 60))}:${p(Math.abs(off) % 60)}`;
}

/** Milliseconds since the epoch for a localStamp() value; older ISO/UTC values still parse. NaN when unreadable. */
export function parseStamp(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2}) ([+-])(\d{2}):(\d{2})$/.exec(String(s || ''));
  if (!m) return Date.parse(s || '');
  const [, Y, M, D, h, mi, se, sign, oh, om] = m;
  const offMin = (sign === '-' ? -1 : 1) * (Number(oh) * 60 + Number(om));
  return Date.UTC(Number(Y), Number(M) - 1, Number(D), Number(h), Number(mi), Number(se)) - offMin * 60000;
}
const MAX_AGE_MS = 6 * 60 * 60 * 1000;
const GATE_AGE_MS = 60 * 1000;

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
  const claim = { ...info, host: hostname(), claimedAt: localStamp() };
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

/** A slot is stale when its file is unreadable, too old, or its process on this machine is gone. */
function stale(info) {
  if (!info || !info.pid) return true;
  const age = Date.now() - parseStamp(info.claimedAt);
  if (Number.isFinite(age) && age > MAX_AGE_MS) return true;
  if (info.host && info.host !== hostname()) return false;
  return !pidAlive(info.pid);
}

/**
 * Replace a stale slot file with our claim. A directory `<file>.takeover` is the
 * gate: mkdir is atomic, so one waiter at a time re-checks the slot and replaces
 * it, and a waiter that saw the old file stale can never delete the fresh claim
 * another waiter made a moment earlier. A gate left by a dead process is
 * removed after GATE_AGE_MS. Returns the replaced claim, or null when not taken.
 */
function takeOver(file, info) {
  const gate = `${file}.takeover`;
  try {
    mkdirSync(gate);
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    try { if (Date.now() - statSync(gate).mtimeMs > GATE_AGE_MS) rmdirSync(gate); } catch { /* gone already */ }
    return null;
  }
  try {
    const current = readClaim(file);
    if (!stale(current)) return null;
    try { unlinkSync(file); } catch { /* already gone */ }
    return claimFile(file, info).ok ? (current || {}) : null;
  } finally {
    try { rmdirSync(gate); } catch { /* removed by the age check */ }
  }
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
  const mine = { ...info, pid: process.pid };
  const start = Date.now();
  let told = false;
  for (;;) {
    const holders = [];
    for (const file of files) {
      const res = claimFile(file, mine);
      if (res.ok) return { ok: true, file, release: holdUntilExit(file) };
      if (stale(res.claim)) {
        const replaced = takeOver(file, mine);
        if (replaced) return { ok: true, file, release: holdUntilExit(file), tookOver: replaced };
      }
      holders.push({ ...(readClaim(file) || {}), file });
    }
    if (Date.now() - start >= waitMs) return { ok: false, holders };
    if (!told) { onWait(holders); told = true; }
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
  const describe = (x) => `${x.task || '?'} ${x.job || '?'} (${x.agent || '?'}, pid ${x.pid || '?'}, since ${x.startedAt || x.claimedAt || '?'})`;
  const { defaults } = loadConfig();
  const slot = await acquireSlot('heavy', {
    slots: Number(defaults.heavySlots) || 1,
    waitMs: wait == null || wait === true ? Infinity : Number(wait) * 60000,
    info: { task, job: basename(jobDir), agent: agentName(opts.agent), startedAt: localStamp() },
    onWait: (h) => console.log(`Waiting for the heavy-work slot (render, fx, matte, track, layers): ${h.map(describe).join('; ')}. `
      + `If that is not a live rcg run, delete ${h.map((x) => relative(ROOT, x.file)).join(', ')}.`),
  });
  if (!slot.ok) {
    throw new Error(`No free heavy-work slot after ${wait} min. Busy: ${slot.holders.map(describe).join('; ')}`);
  }
  if (slot.tookOver) console.log(`Took over a stale heavy-work slot from ${describe(slot.tookOver)}.`);
  // Other programs' memory use is outside the slot's reach: renders have failed
  // with under 2.5 GB free (lessons 17), so say so before the work starts.
  const minGb = Number(defaults.minFreeMemGb ?? 2.5);
  const freeGb = freemem() / 2 ** 30;
  if (minGb > 0 && freeGb < minGb) {
    console.log(`WARNING: ${freeGb.toFixed(1)} GB of RAM free, under the ${minGb} GB that ${task} needs to run reliably. If it fails, close other programs and run it again.`);
  }
  return slot.release;
}

function holdUntilExit(file) {
  let held = true;
  const release = () => {
    if (!held) return;
    held = false;
    process.off('exit', release);
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
    try {
      if (readClaim(file)?.pid === process.pid) unlinkSync(file);
    } catch { /* already gone */ }
  };
  const onSignal = () => { release(); process.exit(130); };
  process.on('exit', release);
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
  return release;
}
