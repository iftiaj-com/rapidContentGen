// Provenance: every file copied or ported from the user's other projects is
// recorded with its source path, the source repo's git HEAD, whether that file
// had uncommitted changes at the time, and sha256 hashes. Source projects are
// only ever READ.
//
// Usage:
//   node tools/lib/provenance.mjs copy   --source <key> --from <path-in-source> --to <path-in-repo> [--note "..."]
//   node tools/lib/provenance.mjs record --source <key> --from <path-in-source> --to <path-in-repo> --kind port|learn [--note "..."]
//   node tools/lib/provenance.mjs check
//   node tools/lib/provenance.mjs render          (rewrites docs/PROVENANCE.md)
//
// <key> is a name under "sources" in config (e.g. flowEditor, tts, aditsShaders).
// --from may be a directory; copy then records every file inside it.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { isMain, parseArgs } from './cli.mjs';
import { loadConfig, readJson, ROOT } from './config.mjs';

const LEDGER = join(ROOT, 'docs', 'provenance.json');
const DOC = join(ROOT, 'docs', 'PROVENANCE.md');

const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const posix = (p) => p.split(sep).join('/');

function sourceRoot(key) {
  const root = loadConfig().sources?.[key];
  if (!root) throw new Error(`Unknown source "${key}". Add it under "sources" in config/workspace.local.json.`);
  if (!existsSync(root)) throw new Error(`Source "${key}" path does not exist: ${root}`);
  return root;
}

function git(root, args) {
  try {
    return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', windowsHide: true }).trim();
  } catch {
    return null;
  }
}

function listFiles(abs) {
  if (statSync(abs).isFile()) return [abs];
  return readdirSync(abs, { withFileTypes: true }).flatMap((d) => listFiles(join(abs, d.name)));
}

function loadLedger() {
  return readJson(LEDGER, { entries: [] });
}

function saveLedger(ledger) {
  mkdirSync(dirname(LEDGER), { recursive: true });
  ledger.entries.sort((a, b) => (a.to < b.to ? -1 : a.to > b.to ? 1 : 0));
  writeFileSync(LEDGER, JSON.stringify(ledger, null, 2) + '\n');
  renderDoc(ledger);
}

function upsert(ledger, entry) {
  const i = ledger.entries.findIndex((e) => e.to === entry.to && e.kind === entry.kind && e.from === entry.from);
  if (i >= 0) ledger.entries[i] = entry; else ledger.entries.push(entry);
}

function baseEntry(key, root, fromAbs, kind, note) {
  const fromRel = posix(relative(root, fromAbs));
  const status = git(root, ['status', '--porcelain', '--', fromRel]);
  return {
    source: key,
    sourceRoot: posix(root),
    from: fromRel,
    kind,
    gitHead: git(root, ['rev-parse', 'HEAD']),
    dirtyAtCopy: Boolean(status),
    sha256Source: existsSync(fromAbs) && statSync(fromAbs).isFile() ? sha256(fromAbs) : null,
    date: new Date().toISOString().slice(0, 10),
    note: note || '',
  };
}

export function copyFromSource(key, from, to, note) {
  const root = sourceRoot(key);
  const srcAbs = join(root, from);
  if (!existsSync(srcAbs)) throw new Error(`Not found in ${key}: ${from}`);
  const ledger = loadLedger();
  const files = listFiles(srcAbs);
  const isDir = statSync(srcAbs).isDirectory();
  for (const f of files) {
    const destAbs = isDir ? join(ROOT, to, relative(srcAbs, f)) : join(ROOT, to);
    mkdirSync(dirname(destAbs), { recursive: true });
    copyFileSync(f, destAbs);
    const entry = baseEntry(key, root, f, 'copy', note);
    entry.to = posix(relative(ROOT, destAbs));
    entry.sha256Dest = sha256(destAbs);
    upsert(ledger, entry);
  }
  saveLedger(ledger);
  return files.length;
}

export function recordPort(key, from, to, kind, note) {
  if (!['port', 'learn'].includes(kind)) throw new Error('--kind must be port or learn');
  const root = sourceRoot(key);
  const srcAbs = join(root, from);
  if (!existsSync(srcAbs)) throw new Error(`Not found in ${key}: ${from}`);
  const ledger = loadLedger();
  const entry = baseEntry(key, root, srcAbs, kind, note);
  entry.to = to ? posix(to) : null;
  upsert(ledger, entry);
  saveLedger(ledger);
}

/** Copied files must still match what was copied; sources may have moved on. */
export function checkLedger() {
  const ledger = loadLedger();
  const problems = [];
  const drift = [];
  for (const e of ledger.entries) {
    if (e.kind === 'copy') {
      const dest = join(ROOT, e.to);
      if (!existsSync(dest)) problems.push(`missing copy: ${e.to}`);
      else if (sha256(dest) !== e.sha256Dest) problems.push(`edited after copy (should be recorded as a port): ${e.to}`);
    }
    const src = join(e.sourceRoot, e.from);
    if (e.sha256Source && existsSync(src) && statSync(src).isFile() && sha256(src) !== e.sha256Source) {
      drift.push(`${e.source}/${e.from} changed since it was copied`);
    }
  }
  return { entries: ledger.entries.length, problems, drift };
}

function renderDoc(ledger) {
  const bySource = {};
  for (const e of ledger.entries) (bySource[e.source] ||= []).push(e);
  const lines = [
    '# Provenance',
    '',
    'Generated by `tools/lib/provenance.mjs` from `docs/provenance.json`. Do not edit by hand.',
    '',
    'Every file that came from another project is listed with the source commit at the time.',
    '"Dirty" means the source file had uncommitted changes when it was copied, so the commit',
    'alone does not reproduce it; the sha256 does.',
    '',
    '- **copy**: copied byte for byte. `check` fails if the copy is edited later.',
    '- **port**: rewritten for this project; the source is the reference.',
    '- **learn**: read for ideas or vocabulary; nothing copied.',
    '',
  ];
  for (const [src, entries] of Object.entries(bySource).sort()) {
    lines.push(`## ${src}`, '', `Source root: \`${entries[0].sourceRoot}\``, '');
    lines.push('| Kind | Source file | In rapidContentGen | Commit | Dirty | Date | Note |');
    lines.push('|---|---|---|---|---|---|---|');
    for (const e of entries) {
      lines.push(`| ${e.kind} | \`${e.from}\` | ${e.to ? `\`${e.to}\`` : '—'} | ${e.gitHead ? e.gitHead.slice(0, 8) : '—'} | ${e.dirtyAtCopy ? 'yes' : 'no'} | ${e.date} | ${e.note || ''} |`);
    }
    lines.push('');
  }
  writeFileSync(DOC, lines.join('\n'));
}

if (isMain(import.meta.url)) {
  const args = parseArgs();
  const cmd = args._[0];
  try {
    if (cmd === 'copy') {
      const n = copyFromSource(args.source, args.from, args.to, args.note);
      console.log(`Copied ${n} file(s) from ${args.source}/${args.from} -> ${args.to}`);
    } else if (cmd === 'record') {
      recordPort(args.source, args.from, args.to, args.kind, args.note);
      console.log(`Recorded ${args.kind}: ${args.source}/${args.from} -> ${args.to || '—'}`);
    } else if (cmd === 'check') {
      const res = checkLedger();
      console.log(`${res.entries} entries`);
      for (const p of res.problems) console.log(`PROBLEM ${p}`);
      for (const d of res.drift) console.log(`drift   ${d}`);
      process.exit(res.problems.length ? 1 : 0);
    } else if (cmd === 'render') {
      renderDoc(loadLedger());
      console.log(`Wrote ${DOC}`);
    } else {
      console.error('Usage: provenance.mjs copy|record|check|render ...');
      process.exit(2);
    }
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
