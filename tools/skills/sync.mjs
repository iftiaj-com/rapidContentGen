// Project skills live in .agents/skills/ (read by Antigravity, and by Codex).
// Claude Code only reads .claude/skills/, so that folder is a copy, rebuilt here.
// Edit skills in .agents/skills/ only; then run `rcg skills sync`.
//
// A project skill is a folder in .agents/skills/ with a SKILL.md that git does not
// ignore. HyperFrames' own skills (installed per machine, see .gitignore) are left out.
//
// Usage:
//   node tools/skills/sync.mjs [sync]        copy every project skill into .claude/skills/
//   node tools/skills/sync.mjs check         report differences; exit 1 if any
//   node tools/skills/sync.mjs sync --prune  also delete .claude/skills/ folders that are not project skills

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, lstatSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { isMain, parseArgs } from '../lib/cli.mjs';
import { ROOT } from '../lib/config.mjs';

export const SOURCE = join(ROOT, '.agents', 'skills');
export const MIRROR = join(ROOT, '.claude', 'skills');

function ignored(names) {
  if (!names.length) return new Set();
  const paths = names.map((n) => `.agents/skills/${n}/SKILL.md`);
  try {
    const out = execFileSync('git', ['-C', ROOT, 'check-ignore', '--no-index', '--stdin'],
      { input: paths.join('\n') + '\n', encoding: 'utf8', windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
    return new Set(out.split('\n').filter(Boolean).map((p) => p.split('/')[2]));
  } catch (err) {
    return new Set(String(err.stdout || '').split('\n').filter(Boolean).map((p) => p.split('/')[2]));
  }
}

/** Names of the project's own skills, in .agents/skills/. */
export function projectSkills() {
  if (!existsSync(SOURCE)) return [];
  const dirs = readdirSync(SOURCE).filter((n) => existsSync(join(SOURCE, n, 'SKILL.md')));
  const skip = ignored(dirs);
  return dirs.filter((n) => !skip.has(n)).sort();
}

function files(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = join(dir, d.name);
    return d.isDirectory() ? files(p) : [p];
  });
}

const hash = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');

/** Differences between .agents/skills/ and its copy in .claude/skills/. */
export function checkSkills() {
  const skills = projectSkills();
  const problems = [];
  for (const name of skills) {
    const src = join(SOURCE, name);
    const dst = join(MIRROR, name);
    if (!existsSync(dst)) { problems.push(`${name}: missing in .claude/skills`); continue; }
    const a = new Map(files(src).map((f) => [relative(src, f).split(sep).join('/'), f]));
    const b = new Map(files(dst).map((f) => [relative(dst, f).split(sep).join('/'), f]));
    for (const [rel, f] of a) {
      if (!b.has(rel)) problems.push(`${name}/${rel}: missing in .claude/skills`);
      else if (hash(f) !== hash(b.get(rel))) problems.push(`${name}/${rel}: differs`);
    }
    for (const rel of b.keys()) if (!a.has(rel)) problems.push(`${name}/${rel}: only in .claude/skills`);
  }
  // Links in .claude/skills/ are made by `npx skills add` (HyperFrames' skills, which live in
  // .agents/skills/ too); they are that tool's to manage, so they are never reported or pruned.
  const extra = existsSync(MIRROR)
    ? readdirSync(MIRROR).filter((n) => !lstatSync(join(MIRROR, n)).isSymbolicLink()
      && statSync(join(MIRROR, n)).isDirectory() && !skills.includes(n))
    : [];
  return { skills, problems, extra };
}

export function syncSkills({ prune = false } = {}) {
  const skills = projectSkills();
  for (const name of skills) {
    const dst = join(MIRROR, name);
    // A link here would point back into .agents/skills: deleting "recursively" through it
    // could remove the source. Unlink it instead.
    if (existsSync(dst) && lstatSync(dst).isSymbolicLink()) rmSync(dst, { force: true });
    else rmSync(dst, { recursive: true, force: true });
    cpSync(join(SOURCE, name), join(MIRROR, name), { recursive: true });
  }
  const { extra } = checkSkills();
  if (prune) for (const n of extra) rmSync(join(MIRROR, n), { recursive: true, force: true });
  return { skills, extra: prune ? [] : extra, pruned: prune ? extra : [] };
}

if (isMain(import.meta.url)) {
  const a = parseArgs();
  const cmd = a._[0] || 'sync';
  if (cmd === 'sync') {
    const r = syncSkills({ prune: Boolean(a.prune) });
    console.log(`Copied ${r.skills.length} skill(s) to .claude/skills: ${r.skills.join(', ')}`);
    for (const n of r.pruned) console.log(`  removed .claude/skills/${n} (not a project skill)`);
    for (const n of r.extra) console.log(`  note: .claude/skills/${n} is not in .agents/skills (left as is; --prune removes it)`);
  } else if (cmd === 'check') {
    const r = checkSkills();
    for (const p of r.problems) console.log(`DIFF  ${p}`);
    for (const n of r.extra) console.log(`NOTE  .claude/skills/${n} is not in .agents/skills`);
    console.log(r.problems.length ? `${r.problems.length} difference(s): run node tools/rcg.mjs skills sync` : `${r.skills.length} skill(s) in sync`);
    process.exit(r.problems.length ? 1 : 0);
  } else {
    console.error('Usage: node tools/skills/sync.mjs [sync [--prune] | check]');
    process.exit(2);
  }
}
