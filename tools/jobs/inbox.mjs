// Inbox folders and who has claimed them. `rcg new-job` claims an inbox/<folder>/
// it takes media from (inbox/<folder>/.rcg-claim.json), so two agent sessions
// never start the same folder. This lists folders and frees a claim.
//
// Usage:
//   node tools/jobs/inbox.mjs list            free and claimed folders (default)
//   node tools/jobs/inbox.mjs release <folder>

import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { isMain, parseArgs } from '../lib/cli.mjs';
import { loadConfig } from '../lib/config.mjs';
import { readClaim } from '../lib/lock.mjs';
import { CLAIM_FILE } from './new-job.mjs';

export function listInbox() {
  const inbox = loadConfig().paths.inbox;
  if (!existsSync(inbox)) return [];
  return readdirSync(inbox)
    .filter((f) => statSync(join(inbox, f)).isDirectory())
    .map((f) => {
      const claimPath = join(inbox, f, CLAIM_FILE);
      return { folder: f, hasPrompt: existsSync(join(inbox, f, 'prompt.md')), claim: existsSync(claimPath) ? readClaim(claimPath) || {} : null };
    });
}

export function releaseInbox(folder) {
  const file = join(loadConfig().paths.inbox, basename(folder), CLAIM_FILE);
  if (!existsSync(file)) return false;
  rmSync(file);
  return true;
}

if (isMain(import.meta.url)) {
  const a = parseArgs();
  const cmd = a._[0] || 'list';
  if (cmd === 'list') {
    const rows = listInbox();
    if (!rows.length) console.log('inbox/ has no job folders.');
    for (const r of rows) {
      const state = r.claim ? `claimed by ${r.claim.job || '?'} (${r.claim.agent || '?'}, ${r.claim.claimedAt || '?'})` : 'free';
      console.log(`${r.folder.padEnd(32)} ${state}${r.hasPrompt ? '' : '  [no prompt.md]'}`);
    }
  } else if (cmd === 'release' && a._[1]) {
    console.log(releaseInbox(a._[1]) ? `Released inbox/${basename(a._[1])}.` : `inbox/${basename(a._[1])} was not claimed.`);
  } else {
    console.error('Usage: node tools/jobs/inbox.mjs list | release <folder>');
    process.exit(2);
  }
}
