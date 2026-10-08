// rcg assets: the approved free asset sources, one tool, every file credited.
//
// Approved by the user on 2026-10-08 (licences read that day, see
// .claude/skills/skill-info-graphics/references/assets.md):
//   phosphor   icons, MIT. The only source kept in the repo: library/icons/phosphor/,
//              one SVG at a time, with LICENSE and manifest.json (url + sha256).
//   unsplash   photos and illustrations, Unsplash License. Search with the Unsplash
//              connector; fetch here by photo id (the public download link, no key).
//   pixabay    photos and stock video, Pixabay Content License. Needs a free API key in
//              config/workspace.local.json { "keys": { "pixabay": "..." } }; searches are
//              cached 24 h under .cache/assets/ as the API terms ask.
//   polyhaven  textures, HDRIs, 3D models, CC0. Credit Poly Haven (their API asks it).
//   met        The Met Open Access, CC0, public-domain objects only (isPublicDomain).
//   pexels     no API (key issuance paused): download on pexels.com by hand, drop the
//              file in the job, then `credit` records it.
// Everything except icons lands in the job's git-ignored assets/ and in data/credits.json.
// Ask the user before each download (workspace rule); --dry-run resolves without saving.
//
// Usage:
//   node tools/media/assets.mjs icon find <words>
//   node tools/media/assets.mjs icon add <name> [--weight bold|fill|regular|duotone|light|thin]
//   node tools/media/assets.mjs search pixabay --q "<words>" [--type photo|video] [--per 10] [--orientation vertical]
//   node tools/media/assets.mjs search polyhaven --q <category|tag> [--type textures|hdris|models] [--per 10]
//   node tools/media/assets.mjs search met --q "<words>" [--per 10]
//   node tools/media/assets.mjs fetch <unsplash|pixabay|polyhaven|met> --job <dir> --id <id>
//        [--type photo|video|textures|hdris|models] [--res 2k] [--map Diffuse] [--width 2160]
//        [--author "Name" --page <url>] [--name <file stem>] [--max-mb 80] [--dry-run]
//   node tools/media/assets.mjs credit --job <dir> --file assets/... --source pexels --author "Name" --page <url>
//   node tools/media/assets.mjs credits --job <dir>          (a Markdown credits section for report.md)

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { isMain, parseArgs } from '../lib/cli.mjs';
import { loadConfig, readJson, ROOT } from '../lib/config.mjs';

const UA = 'rapidContentGen/0.1 (local video editing tool)';
const PHOSPHOR = { version: '2.1.1', cdn: 'https://cdn.jsdelivr.net/npm/@phosphor-icons/core@2.1.1', list: 'https://data.jsdelivr.com/v1/packages/npm/@phosphor-icons/core@2.1.1?structure=flat' };
const WEIGHTS = ['thin', 'light', 'regular', 'bold', 'fill', 'duotone'];
const ICON_DIR = join(ROOT, 'library', 'icons', 'phosphor');
const CACHE = join(ROOT, '.cache', 'assets');
const LICENCES = {
  phosphor: 'MIT (Phosphor Icons)',
  unsplash: 'Unsplash License (free, no attribution required; no resale without significant modification)',
  pixabay: 'Pixabay Content License (free, no attribution required; no standalone resale)',
  polyhaven: 'CC0 (Poly Haven; credit Poly Haven as their API asks)',
  met: 'CC0 (The Metropolitan Museum of Art Open Access, public domain)',
  pexels: 'Pexels License (free, no attribution required; no endorsement, no unaltered resale)',
  user: "the user's own",
};

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, ...headers } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} from ${url.replace(/key=[^&]+/, 'key=***')}`);
  return res.json();
}

async function getBytes(url, maxMb) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} from ${url}`);
  const len = Number(res.headers.get('content-length') || 0);
  if (maxMb && len > maxMb * 1e6) throw new Error(`file is ${(len / 1e6).toFixed(1)} MB, over --max-mb ${maxMb}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (maxMb && buf.length > maxMb * 1e6) throw new Error(`file is ${(buf.length / 1e6).toFixed(1)} MB, over --max-mb ${maxMb}`);
  return { buf, type: res.headers.get('content-type') || '' };
}

/** Size and type without the body (for --dry-run). */
async function headInfo(url) {
  const res = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': UA }, redirect: 'follow' });
  return { ok: res.ok, mb: +(Number(res.headers.get('content-length') || 0) / 1e6).toFixed(1), type: res.headers.get('content-type') || '' };
}

// ── Icons (Phosphor, kept in the repo) ──────────────────────────────────────

const iconFile = (name, weight) => (weight === 'regular' ? `${name}.svg` : `${name}-${weight}.svg`);

export async function findIcons(words) {
  const listFile = join(CACHE, `phosphor-${PHOSPHOR.version}.json`);
  let names;
  if (existsSync(listFile)) names = readJson(listFile);
  else {
    const j = await getJson(PHOSPHOR.list);
    names = j.files.map((f) => f.name).filter((n) => n.startsWith('/assets/regular/')).map((n) => n.slice(16, -4));
    mkdirSync(CACHE, { recursive: true });
    writeFileSync(listFile, JSON.stringify(names));
  }
  const terms = String(words).toLowerCase().split(/\s+/).filter(Boolean);
  return names.filter((n) => terms.every((t) => n.includes(t)));
}

export async function addIcon(name, weight = 'bold') {
  if (!WEIGHTS.includes(weight)) throw new Error(`--weight must be one of ${WEIGHTS.join(', ')}`);
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`icon name must be lowercase words joined by "-" (got "${name}")`);
  const rel = `${weight}/${iconFile(name, weight)}`;
  const dest = join(ICON_DIR, rel);
  const manifestFile = join(ICON_DIR, 'manifest.json');
  const manifest = readJson(manifestFile, { $comment: 'Phosphor Icons, copied one file at a time by rcg assets icon add. Licence: LICENSE (MIT).', package: '@phosphor-icons/core', version: PHOSPHOR.version, files: {} });
  if (existsSync(dest) && manifest.files[rel]) return { rel, path: dest, added: false };
  if (!existsSync(join(ICON_DIR, 'LICENSE'))) {
    const lic = await getBytes(`${PHOSPHOR.cdn}/LICENSE`, 1);
    mkdirSync(ICON_DIR, { recursive: true });
    writeFileSync(join(ICON_DIR, 'LICENSE'), lic.buf);
  }
  const url = `${PHOSPHOR.cdn}/assets/${rel}`;
  const { buf } = await getBytes(url, 1).catch((e) => { throw new Error(`no Phosphor icon "${name}" in weight ${weight} (${e.message}). Try: rcg assets icon find ${name}`); });
  if (!/^<svg[\s>]/.test(buf.toString('utf8').trim())) throw new Error(`${url} is not an SVG`);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, buf);
  manifest.files[rel] = { url, sha256: sha256(buf), added: new Date().toISOString().slice(0, 10) };
  manifest.files = Object.fromEntries(Object.entries(manifest.files).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
  return { rel, path: dest, added: true };
}

// ── Search ──────────────────────────────────────────────────────────────────

function pixabayKey() {
  const key = loadConfig().keys?.pixabay;
  if (!key || key === 'your-key') throw new Error('No Pixabay key. Log in at pixabay.com, copy the key from pixabay.com/api/docs/, and put it in config/workspace.local.json as { "keys": { "pixabay": "<key>" } }.');
  return key;
}

/** Pixabay asks for 24 h caching of requests; the cache file name never contains the key. */
async function pixabay(params) {
  const isVideo = params.type === 'video';
  const qs = new URLSearchParams(Object.entries({ ...params.query, safesearch: 'true' }).filter(([, v]) => v != null && v !== ''));
  const id = sha256(Buffer.from(`${isVideo}?${qs}`)).slice(0, 16);
  const file = join(CACHE, 'pixabay', `${id}.json`);
  if (existsSync(file)) {
    const c = readJson(file);
    if (Date.now() - c.at < 24 * 3600e3) return c.data;
  }
  const data = await getJson(`https://pixabay.com/api/${isVideo ? 'videos/' : ''}?key=${encodeURIComponent(pixabayKey())}&${qs}`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ at: Date.now(), data }));
  return data;
}

export async function search(source, o) {
  const per = Number(o.per || 10);
  if (source === 'pixabay') {
    const type = o.type === 'video' ? 'video' : 'photo';
    const data = await pixabay({ type, query: { q: o.q, per_page: Math.max(3, Math.min(200, per)), orientation: o.orientation, ...(type === 'photo' ? { image_type: 'photo' } : {}) } });
    return data.hits.map((h) => type === 'video'
      ? { id: h.id, size: `${h.videos.large?.width || h.videos.medium.width}x${h.videos.large?.height || h.videos.medium.height}`, seconds: h.duration, by: h.user, tags: h.tags, page: h.pageURL }
      : { id: h.id, size: `${h.imageWidth}x${h.imageHeight}`, by: h.user, tags: h.tags, page: h.pageURL });
  }
  if (source === 'polyhaven') {
    const t = o.type || 'textures';
    const all = await getJson(`https://api.polyhaven.com/assets?t=${encodeURIComponent(t)}`);
    const q = String(o.q || '').toLowerCase();
    return Object.entries(all)
      .filter(([id, a]) => !q || id.includes(q) || a.name.toLowerCase().includes(q) || a.categories.includes(q) || (a.tags || []).includes(q))
      .slice(0, per)
      .map(([id, a]) => ({ id, name: a.name, by: Object.keys(a.authors || {}).join(', '), max: a.max_resolution ? a.max_resolution.join('x') : '', page: `https://polyhaven.com/a/${id}` }));
  }
  if (source === 'met') {
    const s = await getJson(`https://collectionapi.metmuseum.org/public/collection/v1.1/search?q=${encodeURIComponent(o.q)}&hasImages=true&limit=${Math.min(100, per * 4)}`);
    const out = [];
    for (const id of s.objectIDs || []) {
      if (out.length >= per) break;
      const m = await getJson(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`);
      if (m.isPublicDomain && m.primaryImage) out.push({ id, title: m.title, by: m.artistDisplayName || m.culture || '', date: m.objectDate, page: m.objectURL });
    }
    return out;
  }
  throw new Error('search sources: pixabay, polyhaven, met (Unsplash search runs through its connector)');
}

// ── Fetch into a job, with a credit ─────────────────────────────────────────

function creditsFile(jobDir) { return join(jobDir, 'data', 'credits.json'); }

export function addCredit(jobDir, entry) {
  const file = creditsFile(jobDir);
  const list = readJson(file, []).filter((e) => e.file !== entry.file);
  list.push({ ...entry, licence: entry.licence || LICENCES[entry.source] || 'unknown', recorded: new Date().toISOString().slice(0, 10) });
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(list, null, 2)}\n`);
  return entry;
}

/** Where the bytes come from and who to credit, per source. */
async function resolveSource(source, o) {
  const id = String(o.id || '');
  if (!id) throw new Error('fetch: --id is required');
  if (source === 'unsplash') {
    // The public download link counts the download for the photographer, then redirects to the file.
    const res = await fetch(`https://unsplash.com/photos/${encodeURIComponent(id)}/download?force=true`, { headers: { 'User-Agent': UA }, redirect: 'manual' });
    const loc = res.headers.get('location');
    if (!loc) throw new Error(`Unsplash photo "${id}" did not resolve (status ${res.status})`);
    const url = new URL(loc);
    url.searchParams.set('w', String(o.width || 2160));
    return { url: url.toString(), ext: '.jpg', kind: 'img', credit: { author: o.author || '', page: o.page || `https://unsplash.com/photos/${id}` } };
  }
  if (source === 'pixabay') {
    const type = o.type === 'video' ? 'video' : 'photo';
    const data = await pixabay({ type, query: { id } });
    const h = data.hits?.[0];
    if (!h) throw new Error(`Pixabay ${type} ${id} not found`);
    if (type === 'video') {
      const v = h.videos.large?.url ? h.videos.large : h.videos.medium;
      return { url: v.url, ext: '.mp4', kind: 'video', credit: { author: h.user, page: h.pageURL, note: `${v.width}x${v.height}, ${h.duration} s` } };
    }
    return { url: h.largeImageURL, ext: extname(new URL(h.largeImageURL).pathname) || '.jpg', kind: 'img', credit: { author: h.user, page: h.pageURL } };
  }
  if (source === 'polyhaven') {
    const t = o.type || 'textures';
    const info = await getJson(`https://api.polyhaven.com/info/${encodeURIComponent(id)}`);
    const files = await getJson(`https://api.polyhaven.com/files/${encodeURIComponent(id)}`);
    const res = o.res || '2k';
    let f;
    if (t === 'hdris') f = files.hdri?.[res]?.hdr;
    else if (t === 'models') f = files.gltf?.[res]?.gltf;
    else f = files[o.map || 'Diffuse']?.[res]?.jpg;
    if (!f) throw new Error(`Poly Haven ${id}: no ${t === 'textures' ? `${o.map || 'Diffuse'} ` : ''}${res} file (maps: ${Object.keys(files).join(', ')})`);
    if (t === 'models') throw new Error('Poly Haven models are glTF with separate textures; fetch them by hand for now (not wired into rcg three).');
    return { url: f.url, ext: extname(new URL(f.url).pathname), kind: 'tex', md5: f.md5, credit: { author: Object.keys(info.authors || {}).join(', '), page: `https://polyhaven.com/a/${id}`, note: info.name } };
  }
  if (source === 'met') {
    const m = await getJson(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${encodeURIComponent(id)}`);
    if (!m.isPublicDomain) throw new Error(`Met object ${id} is not marked public domain; it cannot be used.`);
    if (!m.primaryImage) throw new Error(`Met object ${id} has no Open Access image.`);
    return { url: m.primaryImage, ext: extname(new URL(m.primaryImage).pathname) || '.jpg', kind: 'img', credit: { author: m.artistDisplayName || m.culture || '', page: m.objectURL, note: `${m.title}${m.objectDate ? `, ${m.objectDate}` : ''}${m.creditLine ? ` (${m.creditLine})` : ''}` } };
  }
  throw new Error('fetch sources: unsplash, pixabay, polyhaven, met (pexels: download by hand, then `credit`)');
}

export async function fetchAsset(source, o) {
  const jobDir = resolve(o.job || '');
  if (!o.job || !existsSync(join(jobDir, 'index.html'))) throw new Error('fetch: --job <dir> must be a job folder');
  const r = await resolveSource(source, o);
  const stem = slug(o.name || `${source}-${o.id}`);
  const rel = `assets/${r.kind}/${stem}${r.ext}`;
  if (o['dry-run']) {
    const h = await headInfo(r.url);
    return { dryRun: true, file: rel, url: r.url, ...h, credit: r.credit };
  }
  const { buf } = await getBytes(r.url, Number(o['max-mb'] || 80));
  if (r.md5 && createHash('md5').update(buf).digest('hex') !== r.md5) throw new Error(`${source} ${o.id}: md5 does not match the API's`);
  const dest = join(jobDir, rel);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, buf);
  addCredit(jobDir, { file: rel, source, id: String(o.id), url: r.url.replace(/key=[^&]+/, ''), sha256: sha256(buf), ...r.credit });
  return { file: rel, mb: +(buf.length / 1e6).toFixed(1), credit: r.credit };
}

export function creditsMarkdown(jobDir) {
  const list = readJson(creditsFile(resolve(jobDir)), []);
  if (!list.length) return '## Credits\n\nNo collected assets.\n';
  const rows = list.map((e) => `| \`${e.file}\` | ${e.source} | ${e.author || ''} | ${e.note || ''} | ${e.page ? `<${e.page}>` : ''} | ${e.licence} |`);
  return ['## Credits', '', '| File | Source | Author | Note | Page | Licence |', '|---|---|---|---|---|---|', ...rows, ''].join('\n');
}

if (isMain(import.meta.url)) {
  const a = parseArgs();
  const [cmd, sub, ...rest] = a._;
  try {
    if (cmd === 'icon' && sub === 'find') {
      const hits = await findIcons(rest.join(' '));
      console.log(hits.length ? hits.slice(0, 60).join('  ') : 'No icon names match.');
      if (hits.length > 60) console.log(`(${hits.length} matches, first 60 shown)`);
    } else if (cmd === 'icon' && sub === 'add') {
      if (!rest[0]) throw new Error('Usage: assets.mjs icon add <name> [--weight bold]');
      for (const name of rest) {
        const r = await addIcon(name, a.weight || 'bold');
        console.log(`${r.added ? 'added' : 'already in the library'}: library/icons/phosphor/${r.rel}`);
      }
    } else if (cmd === 'search') {
      if (!a.q && sub !== 'polyhaven') throw new Error('search: --q is required');
      const hits = await search(sub, a);
      for (const h of hits) console.log(Object.values(h).join('  |  '));
      console.log(`${hits.length} result(s). Fetch one (after the user says yes): rcg assets fetch ${sub} --job <dir> --id <id>`);
    } else if (cmd === 'fetch') {
      const r = await fetchAsset(sub, a);
      if (r.dryRun) console.log(`DRY RUN: would save ${r.file} (${r.mb} MB, ${r.type}) from ${r.url}\ncredit: ${JSON.stringify(r.credit)}`);
      else console.log(`saved ${r.file} (${r.mb} MB); credit recorded in data/credits.json: ${JSON.stringify(r.credit)}`);
    } else if (cmd === 'credit') {
      if (!a.job || !a.file || !a.source) throw new Error('Usage: assets.mjs credit --job <dir> --file assets/... --source pexels|user|... --author "..." --page <url>');
      const jobDir = resolve(a.job);
      if (!existsSync(join(jobDir, a.file))) throw new Error(`${a.file} not found in the job`);
      addCredit(jobDir, { file: a.file.replace(/\\/g, '/'), source: a.source, author: a.author || '', page: a.page || '', note: a.note || '', licence: a.licence || undefined });
      console.log(`credit recorded for ${a.file} in ${relative(ROOT, creditsFile(jobDir))}`);
    } else if (cmd === 'credits') {
      if (!a.job) throw new Error('Usage: assets.mjs credits --job <dir>');
      console.log(creditsMarkdown(a.job));
    } else {
      throw new Error('Usage: assets.mjs icon find|add | search <pixabay|polyhaven|met> | fetch <unsplash|pixabay|polyhaven|met> | credit | credits (see the file header)');
    }
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exit(1);
  }
}
