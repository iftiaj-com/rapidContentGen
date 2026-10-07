// Node-side view of the corpus. One reader, two consumers.
//
// The build scripts call this directly. The browser gets the same records
// through scripts/vite-plugin-shader-manifest.mjs, which calls this at build
// time and emits the result as a virtual module, so src/lib/corpus.ts no
// longer parses or validates anything of its own. That used to be a second
// loader running import.meta.glob with `eager: true`, which meant every
// visitor downloaded all 150 shader sources and re-ran the whole validator on
// the main thread before React could paint. Dropping a file into shaders/ is
// still the only step needed to publish it.

import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractHeader, normalizeMeta } from '../../src/lib/shader-core/header.mjs';
import { validateShader } from '../../src/lib/shader-core/validate.mjs';
import { titleFromSlug } from '../../src/lib/shader-core/seo.mjs';

export const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '..', '..', '..');
export const SHADER_DIR = join(REPO_ROOT, 'shaders');
export const SHADER_EXTS = ['.glsl', '.fs', '.frag'];

/** The shape src/types.ts calls ShaderMeta, for a file with no usable header. */
const FALLBACK_META = {
  isAditsProfile: false,
  description: '',
  credit: '',
  date: '',
  categories: [],
  alpha: 'premultiplied',
  background: 'none',
  cost: 'medium',
  aspect: 'square',
  loop: null,
  inputs: [],
};

/**
 * Every shader in shaders/, sorted by id, with its header normalized and its
 * validator findings attached.
 *
 * `renderable` is the rule the gallery and the build scripts share: rule 22,
 * the hard-coded opaque write, is the one hard error the host rescues on its
 * own with a luma key, so it must not disqualify a shader from being shown or
 * offered. Any other error means the shader will not run, so the gallery hides
 * its preview and nothing offers an "Open in Adits" link for it.
 *
 * The two boolean uniform probes are computed here because they are the only
 * thing the gallery needed the GLSL body for. Precomputing them is what lets
 * the body stay out of the bundle and be fetched on demand instead. They are
 * kept as two fields rather than one because the card badge and the detail
 * page have always asked slightly different questions: `\bTRACK\b` does not
 * match TRACK_ON, so a shader that reads only TRACK_ON counts for the detail
 * page's note and not for the card's chip. Preserved rather than unified, so
 * no card silently gains or loses a badge.
 *
 * Files whose header will not parse are skipped unless `includeUnparsable` is
 * set. The gallery sets it: such a shader still gets a card, marked rejected,
 * which is how a reader learns it exists at all. The SEO scripts leave it off,
 * because an entry with no description cannot be given a page.
 *
 * @param {{ includeUnparsable?: boolean }} [options]
 */
export function readCorpus({ includeUnparsable = false } = {}) {
  const entries = [];
  for (const filename of readdirSync(SHADER_DIR).sort()) {
    if (!SHADER_EXTS.includes(extname(filename))) continue;
    const path = join(SHADER_DIR, filename);
    const source = readFileSync(path, 'utf8');
    const id = filename.replace(/\.(glsl|fs|frag)$/i, '');
    const title = titleFromSlug(id);
    const extracted = extractHeader(source);
    const validation = validateShader(source);

    if (!extracted.ok) {
      if (!includeUnparsable) {
        console.warn(`  ! unparsable header, skipped: ${filename}`);
        continue;
      }
      entries.push({
        id, filename, path, title,
        headerOk: false,
        meta: FALLBACK_META,
        validation,
        renderable: false,
        autoLumaKey: false,
        hasAudio: false,
        hasGesture: false,
        usesGestureUniforms: false,
        bytes: Buffer.byteLength(source, 'utf8'),
      });
      continue;
    }

    const meta = normalizeMeta(extracted.meta);
    const body = extracted.body;
    const boundTo = (test) => meta.inputs.some((i) => i.BIND && i.BIND !== 'none' && test(i.BIND));
    entries.push({
      id, filename, path, title,
      headerOk: true,
      meta,
      validation,
      renderable: validation.errors.every((e) => e.rule === '22-opaque'),
      autoLumaKey: validation.errors.some((e) => e.rule === '22-opaque'),
      hasAudio: boundTo((b) => !b.startsWith('gesture')) || /\bAUDIO_/.test(body),
      hasGesture: boundTo((b) => b.startsWith('gesture')) || /\b(TRACK|HAND_OPEN)\b/.test(body),
      usesGestureUniforms:
        boundTo((b) => b.startsWith('gesture')) || /\b(TRACK|TRACK_ON|HAND_OPEN)\b/.test(body),
      bytes: Buffer.byteLength(source, 'utf8'),
    });
  }
  return entries.sort((a, b) => a.id.localeCompare(b.id));
}
