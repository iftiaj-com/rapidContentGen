// Small CLI helpers shared by the tools.

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** True when the module at `metaUrl` is the script node was started with. */
export function isMain(metaUrl) {
  return Boolean(process.argv[1]) && metaUrl === pathToFileURL(resolve(process.argv[1])).href;
}

/**
 * Minimal argv parser: positional args plus --flag / --key value / --key=value.
 * Repeated keys collect into arrays.
 */
export function parseArgs(argv = process.argv.slice(2)) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const eq = a.indexOf('=');
    let key;
    let val;
    if (eq > 0) { key = a.slice(2, eq); val = a.slice(eq + 1); }
    else {
      key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) { val = next; i++; } else val = true;
    }
    if (key in out) out[key] = [].concat(out[key], val);
    else out[key] = val;
  }
  return out;
}

/** Parse "0.5,1.2,3" into numbers. */
export const numList = (s) => String(s).split(',').map((x) => Number(x.trim())).filter((x) => Number.isFinite(x));
