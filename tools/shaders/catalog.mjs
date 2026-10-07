// Shader catalog: one searchable JSON for the agent to pick a shader by look or
// mood, built from each AditsShaders file's own header with the copied parser
// (library/adits-shaders/src/lib/shader-core/header.mjs).
//
// Usage:
//   node tools/shaders/catalog.mjs                 rebuild library/shaders-catalog.json
//   node tools/shaders/catalog.mjs --find "nebula gold"   list best matches

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isMain, parseArgs } from '../lib/cli.mjs';
import { readJson, ROOT } from '../lib/config.mjs';
import { TECHNIQUE_NOTES } from '../blocks/shader.mjs';

const DIR = join(ROOT, 'library', 'adits-shaders', 'shaders');
const OUT = join(ROOT, 'library', 'shaders-catalog.json');

export async function buildCatalog() {
  const { extractHeader, normalizeMeta } = await import(`file:///${join(ROOT, 'library', 'adits-shaders', 'src', 'lib', 'shader-core', 'header.mjs').replace(/\\/g, '/')}`);
  const items = [];
  for (const f of readdirSync(DIR).filter((x) => /\.(glsl|fs|frag)$/.test(x)).sort()) {
    const src = readFileSync(join(DIR, f), 'utf8');
    const h = extractHeader(src);
    if (!h.ok) { items.push({ slug: f.replace(/\.\w+$/, ''), error: 'header did not parse' }); continue; }
    const meta = normalizeMeta(h.meta);
    const raw = h.meta;
    const binds = [...new Set(meta.inputs.map((i) => i.BIND).filter((b) => b && b !== 'none'))];
    items.push({
      slug: f.replace(/\.\w+$/, ''),
      description: raw.DESCRIPTION || '',
      categories: raw.CATEGORIES || [],
      alpha: meta.alpha || null,
      loop: raw.LOOP ?? null,
      inputs: meta.inputs.length,
      audioBinds: binds,
      credit: raw.CREDIT || '',
      techniqueNote: TECHNIQUE_NOTES.has(f.replace(/\.\w+$/, '')) || undefined,
    });
  }
  writeFileSync(OUT, JSON.stringify({ generated: new Date().toISOString().slice(0, 10), count: items.length, shaders: items }, null, 2) + '\n');
  return items;
}

export function findShaders(query, limit = 10) {
  const cat = readJson(OUT);
  const terms = String(query).toLowerCase().split(/\s+/).filter(Boolean);
  return cat.shaders
    .map((s) => {
      const hay = `${s.slug} ${s.description} ${(s.categories || []).join(' ')}`.toLowerCase();
      const score = terms.reduce((n, t) => n + (hay.includes(t) ? (s.slug.includes(t) ? 3 : 1) : 0), 0);
      return { ...s, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

if (isMain(import.meta.url)) {
  const a = parseArgs();
  if (typeof a.find === 'string') {
    for (const s of findShaders(a.find, Number(a.limit || 10))) {
      console.log(`${s.slug.padEnd(34)} [${s.audioBinds.join(',')}] ${s.techniqueNote ? '(technique note) ' : ''}${s.description.slice(0, 110)}`);
    }
  } else {
    const items = await buildCatalog();
    console.log(`Wrote ${OUT}: ${items.length} shaders, ${items.filter((s) => s.error).length} header errors, ${items.filter((s) => s.techniqueNote).length} with technique notes`);
  }
}
