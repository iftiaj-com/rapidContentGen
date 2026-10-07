#!/usr/bin/env node
// Adits Shader Object validator CLI.
//
//   node scripts/validate.mjs shaders/my-shader.glsl        validate one file
//   node scripts/validate.mjs                               validate every shader in shaders/
//   node scripts/validate.mjs --json shaders/my.glsl        machine-readable output
//
// Exit code 0 means every checked file passed with no errors (warnings allowed).
// Exit code 1 means at least one hard-rule failure. Agents must not publish a
// shader that exits 1. Authority for every rule: shader-guide.md.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateShader } from '../src/lib/shader-core/validate.mjs';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');
const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const fileArgs = args.filter((a) => !a.startsWith('--'));

const SHADER_EXTS = ['.glsl', '.fs', '.frag'];

let targets = fileArgs;
if (targets.length === 0) {
  const dir = join(root, 'shaders');
  try {
    targets = readdirSync(dir)
      .filter((f) => SHADER_EXTS.includes(extname(f)))
      .map((f) => join(dir, f));
  } catch {
    console.error(`validate: cannot read the corpus directory ${dir}`);
    process.exit(1);
  }
  if (targets.length === 0) {
    console.log(`validate: no shader files in ${dir}`);
    process.exit(0);
  }
}

const results = [];
let failed = false;

for (const target of targets) {
  const path = resolve(target);
  let source;
  try {
    statSync(path);
    source = readFileSync(path, 'utf8');
  } catch {
    results.push({
      file: target,
      ok: false,
      profile: 'rejected',
      description: '',
      cost: null,
      errors: [{ rule: 'io', severity: 'error', message: `cannot read ${target}` }],
      warnings: [],
    });
    failed = true;
    continue;
  }
  const r = validateShader(source);
  results.push({
    file: target,
    ok: r.ok,
    profile: r.profile,
    description: r.normalized ? r.normalized.description : '',
    cost: r.normalized ? r.normalized.cost : null,
    errors: r.errors,
    warnings: r.warnings,
  });
  if (!r.ok) failed = true;
}

if (jsonMode) {
  console.log(JSON.stringify({ ok: !failed, results }, null, 2));
} else {
  for (const r of results) {
    const flag = r.ok ? (r.profile === 'adits' ? 'PASS (Adits profile)' : 'PASS (generic fallback)') : 'FAIL';
    console.log(`\n${r.file}: ${flag}`);
    for (const e of r.errors) console.log(`  error   [${e.rule}] ${e.message}`);
    for (const w of r.warnings) console.log(`  warning [${w.rule}] ${w.message}`);
    if (r.ok && r.errors.length === 0 && r.warnings.length === 0) {
      console.log('  clean: no errors, no warnings');
    }
  }
  const passCount = results.filter((r) => r.ok).length;
  console.log(`\n${passCount}/${results.length} shader(s) passed.`);
  if (failed) console.log('Fix every error above before publishing; warnings deserve a look too.');
}

process.exit(failed ? 1 : 0);
