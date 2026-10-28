#!/usr/bin/env node
// learn.mjs: the user's taste, saved where the rules already live (skill learning-from-user-taste).
// No separate store: each rule is one line in a marked section of a skill or of a job's JOB.md.
//
//   node .agents/skills/learning-from-user-taste/scripts/learn.mjs add --scope every|style:<slug>|job:<jobs/id>
//        --rule "Captions sit higher" [--setting caption-y --value 1400] [--replace "<text of the old line>"] [--date YYYY-MM-DD|none] [--dry-run]
//   ... list [--job jobs/<id>]            every learned line, by scope
//   ... forget --scope <scope> --match "<text>"
//   ... check                              lines parse, values within limits, one line per setting and scope,
//                                          no "(user rule" line left outside a marked section
//   ... effective [--style <slug>] [--job jobs/<id>]   the rules a job follows, in order, and each setting's value
//
// Scopes and files: every -> .agents/skills/video-job/SKILL.md; style:<slug> -> .agents/skills/style-<slug>/SKILL.md;
// job:<dir> -> <dir>/JOB.md. A line: "- <rule> (user rule, <date>; apply: <command flag value>)".
// Settings and hard limits: ../references/limits.md (its JSON block). Exit: 0 ok, 1 problems (check),
// 2 usage, 3 refused (a hard limit), 4 clash (same setting already set in this scope: ask the user, then --replace).
// Skill files are edited in .agents/skills/ and copied with rcg skills sync, which this runs.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..', '..', '..'); // the same from .agents/skills and its .claude/skills copy
const SKILLS = join(ROOT, '.agents', 'skills');
const BEGIN = '<!-- rcg:learned begin -->';
const END = '<!-- rcg:learned end -->';
const LINE = /^- (.*) \(user rule([^()]*)\)\s*$/;
const posix = (p) => p.split(sep).join('/');

function loadLimits() {
  const md = readFileSync(join(HERE, '..', 'references', 'limits.md'), 'utf8');
  return JSON.parse(md.match(/```json\s*([\s\S]*?)```/)[1]);
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const k = a.slice(2);
    const v = argv[i + 1];
    if (v !== undefined && !v.startsWith('--')) { out[k] = v; i++; } else out[k] = true;
  }
  return out;
}

/** { scope, file, label } for a scope string. */
function scopeFile(scope) {
  if (scope === 'every') return { scope, file: join(SKILLS, 'video-job', 'SKILL.md'), label: 'every job (video-job)' };
  if (scope?.startsWith('style:')) {
    const slug = scope.slice(6).replace(/^style-/, '');
    const file = join(SKILLS, `style-${slug}`, 'SKILL.md');
    if (!existsSync(file)) throw new Error(`No style skill style-${slug} (.agents/skills/style-${slug}/SKILL.md)`);
    return { scope: `style:${slug}`, file, label: `style ${slug}` };
  }
  if (scope?.startsWith('job:')) {
    const dir = [resolve(scope.slice(4)), join(ROOT, scope.slice(4))].find((p) => existsSync(join(p, 'JOB.md')));
    if (!dir) throw new Error(`No JOB.md in ${scope.slice(4)}`);
    return { scope: `job:${posix(relative(ROOT, dir))}`, file: join(dir, 'JOB.md'), label: `job ${posix(relative(ROOT, dir))}` };
  }
  throw new Error('--scope is every, style:<slug> or job:<jobs/id>');
}

const SECTION = [BEGIN, '## Learned rules', '',
  "The user's taste, saved with the `learning-from-user-taste` skill. Follow every line. Change them only with",
  '`node .agents/skills/learning-from-user-taste/scripts/learn.mjs` (it checks the hard limits and clashes).',
  'Order: style pack defaults < every job (video-job) < one style < one job (JOB.md). Pitfalls and safe zones still win.', ''];

/** The file's text and its learned lines: { text, lines: [{ raw, rule, date, apply }], has }. */
function readSection(file) {
  const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const a = text.indexOf(BEGIN);
  const b = text.indexOf(END);
  if (a < 0 || b < a) return { text, lines: [], has: false };
  const lines = text.slice(a + BEGIN.length, b).split(/\r?\n/).filter((l) => l.startsWith('- ')).map(parseLine);
  return { text, lines, has: true };
}

function parseLine(raw) {
  const m = raw.match(LINE);
  if (!m) return { raw, bad: true };
  const tail = m[2];
  return { raw, rule: m[1], date: tail.match(/^,\s*(\d{4}-\d{2}-\d{2})/)?.[1] || null, apply: tail.match(/apply:\s*(.+)$/)?.[1].trim() || null };
}

function writeSection(file, lines) {
  let text = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const body = [...SECTION, ...lines, END].join('\n');
  const a = text.indexOf(BEGIN);
  const b = text.indexOf(END);
  text = a >= 0 && b > a ? text.slice(0, a) + body + text.slice(b + END.length) : `${text.replace(/\s*$/, '')}\n\n${body}\n`;
  writeFileSync(file, text, 'utf8');
}

/** The setting an apply string sets, and its value: { name, value } or null. */
function settingOf(apply, limits) {
  if (!apply) return null;
  for (const [name, s] of Object.entries(limits)) {
    if (apply === s.apply) return { name, value: true };
    if (apply.startsWith(`${s.apply} `)) return { name, value: apply.slice(s.apply.length + 1).trim() };
  }
  return null;
}

/** All scopes with a learned section (or every / style skills), in precedence order. */
function allScopes(job) {
  const out = ['every', ...readdirSync(SKILLS).filter((d) => d.startsWith('style-') && existsSync(join(SKILLS, d, 'SKILL.md'))).map((d) => `style:${d.slice(6)}`)];
  if (job) out.push(`job:${job}`);
  return out.map(scopeFile);
}

/** The value a setting has for a scope, looking at that scope and the broader ones. */
function inherited(name, scope, limits) {
  const chain = [scopeFile('every')];
  if (scope.scope.startsWith('style:')) chain.push(scope);
  if (scope.scope.startsWith('job:')) chain.push(scope);
  let v = null;
  for (const s of chain) for (const l of readSection(s.file).lines) { const st = settingOf(l.apply, limits); if (st?.name === name) v = st.value; }
  return v;
}

/** null when the value is allowed, else the reason. */
function refuse(name, value, scope, limits) {
  const s = limits[name];
  if (!s) return `unknown setting ${name} (references/limits.md lists them)`;
  if (s.flag) return null;
  if (s.enum && !s.enum.includes(String(value))) return `${value} is not one of ${s.enum.join(', ')} (${s.why})`;
  if (s.enumFrom) {
    const doc = JSON.parse(readFileSync(join(ROOT, s.enumFrom), 'utf8'));
    const keys = Object.keys(doc.styles || doc);
    if (!keys.includes(String(value))) return `${value} is not a preset in ${s.enumFrom}`;
    return null;
  }
  const v = Number(value);
  if (!Number.isFinite(v)) return `${value} is not a number`;
  if (s.min != null && v < s.min) return `${v} is under ${s.min}: ${s.why}`;
  if (s.max != null && v > s.max) return `${v} is over ${s.max}: ${s.why}`;
  // a caption's height and size limit each other: the text reaches 1.6 x size either side of y
  const band = (y, size, why) => {
    if (y + 1.6 * size > 1536) return `text at y ${y} with size ${size} reaches y ${Math.round(y + 1.6 * size)}, in the bottom no-text zone (from 1536): ${why}`;
    if (y - 1.6 * size < 192) return `text at y ${y} with size ${size} starts at y ${Math.round(y - 1.6 * size)}, above the header line (192): ${why}`;
    return null;
  };
  if (s.bandWith) return band(v, Number(inherited(s.bandWith, scope, limits) ?? s.defaultSize), s.why);
  if (name === 'caption-size') {
    for (const yName of ['caption-y', 'mp-caption-y']) {
      const y = inherited(yName, scope, limits);
      if (y != null) { const r = band(Number(y), v, limits[yName].why); if (r) return r; }
    }
  }
  return null;
}

const STOP = new Set(('a an the and or but so of to in on at it is be are was for with not no never always only every one this that their they its as by from when then than more less too very '
  + 'user rule json lines line data').split(' '));
const words = (s) => new Set(String(s).toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));

/** Learned lines and old "(user rule" lines elsewhere in the project skills that share words with `rule`. */
function related(rule, limits) {
  const mine = words(rule);
  const out = [];
  const files = readdirSync(SKILLS).filter((d) => d !== 'learning-from-user-taste' && existsSync(join(SKILLS, d, 'SKILL.md')) && !isIgnoredSkill(d))
    .flatMap((d) => mdFiles(join(SKILLS, d)));
  for (const f of files) {
    readFileSync(f, 'utf8').split(/\r?\n/).forEach((l, i) => {
      if (!/user rule/i.test(l)) return;
      const shared = [...words(l)].filter((w) => mine.has(w));
      if (shared.length >= 2) out.push(`${posix(relative(ROOT, f))}:${i + 1}: ${l.trim().slice(0, 160)}  [shares: ${shared.join(', ')}]`);
    });
  }
  return out;
}

function mdFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? mdFiles(join(dir, e.name)) : e.name.endsWith('.md') ? [join(dir, e.name)] : []));
}

// HyperFrames' skills (installed per machine, git-ignored) are not the project's: they hold no user rules.
function isIgnoredSkill(d) {
  const r = spawnSync('git', ['-C', ROOT, 'check-ignore', '-q', `.agents/skills/${d}/SKILL.md`], { windowsHide: true });
  return r.status === 0;
}

function sync(file) {
  if (!posix(file).includes('/.agents/skills/')) return;
  const r = spawnSync(process.execPath, [join(ROOT, 'tools', 'rcg.mjs'), 'skills', 'sync'], { cwd: ROOT, encoding: 'utf8' });
  console.log(r.status === 0 ? 'synced     .claude/skills (rcg skills sync)' : `WARNING: rcg skills sync failed: ${r.stderr}`);
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function add(a, limits) {
  if (!a.scope || !a.rule || a.rule === true) { console.error('add needs --scope and --rule'); return 2; }
  const sc = scopeFile(a.scope);
  let apply = null;
  let st = null;
  if (a.setting) {
    const s = limits[a.setting];
    if (!s) { console.error(`Unknown setting ${a.setting}. Settings: ${Object.keys(limits).join(', ')}`); return 2; }
    if (!s.flag && (a.value == null || a.value === true)) { console.error(`--setting ${a.setting} needs --value`); return 2; }
    const why = refuse(a.setting, a.value, sc, limits);
    if (why) { console.log(`REFUSED  ${a.setting} ${a.value}: ${why}`); return 3; }
    apply = s.flag ? s.apply : `${s.apply} ${a.value}`;
    st = a.setting;
  }
  const date = a.date && a.date !== true ? a.date : today(); // --date none: a migrated rule with no known date
  const line = `- ${a.rule.trim().replace(/\s+/g, ' ')} (user rule${date === 'none' ? '' : `, ${date}`}${apply ? `; apply: ${apply}` : ''})`;
  const sec = readSection(sc.file);
  let lines = sec.lines.map((l) => l.raw);
  if (a.replace && a.replace !== true) {
    const i = lines.findIndex((l) => l.includes(a.replace));
    if (i < 0) { console.error(`No learned line in ${sc.label} contains "${a.replace}"`); return 2; }
    console.log(`replaces   ${lines[i]}`);
    lines.splice(i, 1);
  } else if (st) {
    const same = sec.lines.find((l) => settingOf(l.apply, limits)?.name === st);
    if (same) {
      console.log(`CLASH    ${sc.label} already sets ${st}: ${same.raw}`);
      console.log('Ask the user which one wins; to keep the new one, run again with --replace "<text of the old line>".');
      return 4;
    }
  }
  for (const r of related(a.rule, limits)) console.log(`related    ${r}`);
  if (st) {
    for (const o of allScopes().filter((x) => x.scope !== sc.scope)) {
      for (const l of readSection(o.file).lines) if (settingOf(l.apply, limits)?.name === st) console.log(`also set   in ${o.label}: ${l.raw}`);
    }
  }
  lines.push(line);
  if (a['dry-run']) { console.log(`would add  ${line}\n  to ${posix(relative(ROOT, sc.file))}`); return 0; }
  writeSection(sc.file, lines);
  console.log(`added      ${line}\n  to ${posix(relative(ROOT, sc.file))}`);
  sync(sc.file);
  return 0;
}

function list(a) {
  for (const sc of allScopes(a.job && a.job !== true ? a.job : null)) {
    const { lines } = readSection(sc.file);
    if (!lines.length) continue;
    console.log(`${sc.label} (${posix(relative(ROOT, sc.file))})`);
    lines.forEach((l, i) => console.log(`  ${i + 1}. ${l.raw.slice(2)}`));
  }
  return 0;
}

function forget(a) {
  if (!a.scope || !a.match || a.match === true) { console.error('forget needs --scope and --match'); return 2; }
  const sc = scopeFile(a.scope);
  const { lines } = readSection(sc.file);
  const hits = lines.filter((l) => l.raw.includes(a.match));
  if (hits.length !== 1) { console.error(`${hits.length} learned lines in ${sc.label} contain "${a.match}": name one`); return 2; }
  writeSection(sc.file, lines.filter((l) => l !== hits[0]).map((l) => l.raw));
  console.log(`forgot     ${hits[0].raw}`);
  sync(sc.file);
  return 0;
}

function check(a, limits) {
  const problems = [];
  for (const sc of allScopes(a.job && a.job !== true ? a.job : null)) {
    const { lines } = readSection(sc.file);
    const seen = new Map();
    for (const l of lines) {
      if (l.bad) { problems.push(`${sc.label}: not a learned line: ${l.raw}`); continue; }
      const st = settingOf(l.apply, limits);
      if (!st) continue;
      if (seen.has(st.name)) problems.push(`${sc.label}: ${st.name} set twice: "${seen.get(st.name)}" and "${l.raw}"`);
      seen.set(st.name, l.raw);
      const why = refuse(st.name, st.value, sc, limits);
      if (why) problems.push(`${sc.label}: ${l.raw}: ${why}`);
    }
  }
  // every user rule lives in a learned section (one home)
  for (const d of readdirSync(SKILLS).filter((x) => existsSync(join(SKILLS, x, 'SKILL.md')) && x !== 'learning-from-user-taste' && !isIgnoredSkill(x))) {
    for (const f of mdFiles(join(SKILLS, d))) {
      let inside = false;
      readFileSync(f, 'utf8').split(/\r?\n/).forEach((l, i) => {
        if (l.includes(BEGIN)) inside = true;
        if (l.includes(END)) inside = false;
        if (/\buser rule\b/i.test(l) && !inside) problems.push(`${posix(relative(ROOT, f))}:${i + 1}: a user rule outside the learned section: ${l.trim().slice(0, 120)}`);
      });
    }
  }
  for (const p of problems) console.log(`PROBLEM  ${p}`);
  console.log(problems.length ? `${problems.length} problem(s)` : 'learned rules OK');
  return problems.length ? 1 : 0;
}

function effective(a, limits) {
  const chain = [scopeFile('every')];
  if (a.style && a.style !== true) chain.push(scopeFile(`style:${a.style}`));
  if (a.job && a.job !== true) chain.push(scopeFile(`job:${a.job}`));
  const values = {};
  for (const sc of chain) {
    const { lines } = readSection(sc.file);
    console.log(`${sc.label}: ${lines.length} rule(s)`);
    for (const l of lines) {
      console.log(`  ${l.raw.slice(2)}`);
      const st = settingOf(l.apply, limits);
      if (st) values[st.name] = { value: st.value, from: sc.label, apply: l.apply };
    }
  }
  const names = Object.keys(values);
  if (names.length) {
    console.log('settings (the narrowest scope wins):');
    for (const n of names) console.log(`  ${n.padEnd(14)} ${String(values[n].value).padEnd(6)} from ${values[n].from}: ${values[n].apply}`);
  }
  return 0;
}

const a = parseArgs(process.argv.slice(2));
const cmd = a._[0];
try {
  const limits = loadLimits();
  const run = { add, list, forget, check, effective }[cmd];
  if (!run) {
    console.log('Usage: learn.mjs add|list|forget|check|effective ... (see the header of this file)');
    process.exit(cmd ? 2 : 0);
  }
  process.exit(run(a, limits));
} catch (e) {
  console.error(e.message);
  process.exit(2);
}
