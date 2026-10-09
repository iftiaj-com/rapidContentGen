// Inbox folders and who has claimed them. `rcg new-job` claims an inbox/<folder>/
// it takes media from (inbox/<folder>/.rcg-claim.json), so two agent sessions
// never start the same folder. When the job is finished, `done` renames the
// folder to <folder>-Complete: agents skip complete folders, and new-job refuses
// them, so finished work can stay in the inbox next to new folders.
// Renaming is safe: new-job copied the media into the job's assets/.
//
// Usage:
//   node tools/jobs/inbox.mjs list [--all]                 free and claimed folders (--all: also complete ones)
//   node tools/jobs/inbox.mjs done <folder> | --job jobs/<id>   mark finished: rename to <folder>-Complete
//   node tools/jobs/inbox.mjs release <folder>             remove a claim (the folder is free again)

import { existsSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { isMain, parseArgs } from '../lib/cli.mjs';
import { loadConfig } from '../lib/config.mjs';
import { localStamp, readClaim } from '../lib/lock.mjs';

export const CLAIM_FILE = '.rcg-claim.json';
export const COMPLETE_SUFFIX = '-Complete';

export const isComplete = (folder) => basename(folder).toLowerCase().endsWith(COMPLETE_SUFFIX.toLowerCase());

const inboxDir = () => loadConfig().paths.inbox;

export function listInbox({ all = false } = {}) {
  const inbox = inboxDir();
  if (!existsSync(inbox)) return [];
  return readdirSync(inbox)
    .filter((f) => statSync(join(inbox, f)).isDirectory())
    .map((f) => {
      const claimPath = join(inbox, f, CLAIM_FILE);
      return {
        folder: f,
        complete: isComplete(f),
        hasPrompt: existsSync(join(inbox, f, 'prompt.md')),
        claim: existsSync(claimPath) ? readClaim(claimPath) || {} : null,
      };
    })
    .filter((r) => all || !r.complete);
}

/** Inbox folders (not yet complete) claimed by job `jobId`. */
export function foldersOfJob(jobId) {
  return listInbox().filter((r) => r.claim?.job === jobId).map((r) => r.folder);
}

/** Rename inbox/<folder> to inbox/<folder>-Complete (-2, -3 ... if taken). Returns the new name. */
export function completeInbox(folder) {
  const inbox = inboxDir();
  const name = basename(folder);
  const from = join(inbox, name);
  if (!existsSync(from)) throw new Error(`No inbox folder ${name}`);
  if (isComplete(name)) throw new Error(`inbox/${name} is already complete`);
  let to = join(inbox, `${name}${COMPLETE_SUFFIX}`);
  for (let n = 2; existsSync(to); n++) to = join(inbox, `${name}${COMPLETE_SUFFIX}-${n}`);
  try {
    renameSync(from, to);
  } catch (e) {
    if (e.code === 'EPERM' || e.code === 'EBUSY' || e.code === 'EACCES') {
      throw new Error(`Could not rename inbox/${name}: a file in it is open (a player, Explorer preview or editor). Close it and run done again.`);
    }
    throw e;
  }
  const claimPath = join(to, CLAIM_FILE);
  const claim = existsSync(claimPath) ? readClaim(claimPath) || {} : {};
  writeFileSync(claimPath, JSON.stringify({ ...claim, completedAt: localStamp() }, null, 2) + '\n');
  return basename(to);
}

export function releaseInbox(folder) {
  const file = join(inboxDir(), basename(folder), CLAIM_FILE);
  if (!existsSync(file)) return false;
  rmSync(file);
  return true;
}

if (isMain(import.meta.url)) {
  const a = parseArgs();
  const cmd = a._[0] || 'list';
  try {
    if (cmd === 'list') {
      const rows = listInbox({ all: Boolean(a.all) });
      if (!rows.length) console.log(a.all ? 'inbox/ has no job folders.' : 'inbox/ has no open job folders (--all also lists complete ones).');
      for (const r of rows) {
        const state = r.complete ? `complete${r.claim?.job ? ` (job ${r.claim.job})` : ''}`
          : r.claim ? `claimed by ${r.claim.job || '?'} (${r.claim.agent || '?'}, ${r.claim.claimedAt || '?'})` : 'free';
        console.log(`${r.folder.padEnd(32)} ${state}${r.hasPrompt || r.complete ? '' : '  [no prompt.md]'}`);
      }
    } else if (cmd === 'done') {
      const folders = typeof a.job === 'string' ? foldersOfJob(basename(a.job)) : a._.slice(1);
      if (!folders.length) {
        console.log(typeof a.job === 'string' ? `No open inbox folder is claimed by ${basename(a.job)} (nothing to mark).` : 'Usage: inbox.mjs done <folder> | --job jobs/<id>');
        process.exit(typeof a.job === 'string' ? 0 : 2);
      }
      for (const f of folders) console.log(`inbox/${basename(f)} -> inbox/${completeInbox(f)}`);
    } else if (cmd === 'release' && a._[1]) {
      console.log(releaseInbox(a._[1]) ? `Released inbox/${basename(a._[1])}.` : `inbox/${basename(a._[1])} was not claimed.`);
    } else {
      console.error('Usage: node tools/jobs/inbox.mjs list [--all] | done <folder> | done --job jobs/<id> | release <folder>');
      process.exit(2);
    }
  } catch (e) {
    console.error(`inbox: ${e.message}`);
    process.exit(1);
  }
}
