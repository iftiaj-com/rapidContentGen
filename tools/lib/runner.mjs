// Shared command runner for planners that turn a plan into rcg steps (the same pattern as
// tools/recipes/recipe.mjs, which keeps its own copy): build argv arrays, print them, and run
// them in order from the repo root, stopping at the first failure.

import { execFileSync } from 'node:child_process';
import { ROOT } from './config.mjs';

/** argv for `node tools/rcg.mjs <args>`. */
export const rcg = (...args) => ['tools/rcg.mjs', ...args.map(String)];

/** A command as one printable line. */
export const show = (c) => `> node ${c.map((x) => (/[\s|"<>]/.test(x) ? JSON.stringify(x) : x)).join(' ')}`;

/** Print every command; run them unless dryRun. Throws (stops) on the first failing step. */
export function runCommands(cmds, { dryRun = false } = {}) {
  for (const c of cmds) {
    console.log(show(c));
    if (!dryRun) execFileSync(process.execPath, c, { cwd: ROOT, stdio: 'inherit' });
  }
}
