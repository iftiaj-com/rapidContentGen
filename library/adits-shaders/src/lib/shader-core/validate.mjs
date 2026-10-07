// Adits Shader Object validator.
// Implements the mechanical rules of shader-guide.md Appendix B (rules 1 to 25),
// plus the profile checks from sections 3 to 7. Severity "error" blocks a load;
// severity "warning" is surfaced to whoever drives the generator.
//
// Rules 15 to 18 use the light brace-matching scan the guide prescribes; it
// lives in parse.mjs. This file is plain ESM shared by the site and by
// scripts/validate.mjs.

import {
  extractHeader,
  isCalendarDate,
  MIN_SHADER_DATE,
  normalizeMeta,
  RESERVED_UNIFORMS,
  SUPPORTED_INPUT_TYPES,
  REJECTED_INPUT_TYPES,
  BIND_SOURCES,
} from './header.mjs';
import {
  stripComments,
  matchParen,
  splitTopLevel,
  collectConstants,
  parseLoops,
  findDistanceCandidates,
  findFunctionBodies,
  loopIsRaymarch,
} from './parse.mjs';

export { stripComments };

const MAX_FILE_BYTES = 262144;

/** Appendix A: the header object accepts exactly these keys. */
const HEADER_KEYS = new Set([
  'ADITS', 'DESCRIPTION', 'CREDIT', 'DATE', 'CATEGORIES', 'ALPHA',
  'BACKGROUND', 'COST', 'ASPECT', 'LOOP', 'INPUTS',
]);

/** Appendix A: an input object accepts exactly these keys. */
const INPUT_KEYS = new Set([
  'NAME', 'TYPE', 'DEFAULT', 'MIN', 'MAX', 'LABEL', 'LABELS', 'BIND', 'BIND_DEPTH',
]);

/**
 * @typedef {{ rule: string, severity: 'error'|'warning', message: string }} Finding
 * @typedef {{
 *   ok: boolean,
 *   profile: 'adits'|'generic'|'rejected',
 *   errors: Finding[],
 *   warnings: Finding[],
 *   meta: object|null,
 *   normalized: object|null,
 *   body: string|null,
 * }} ValidationResult
 */

/**
 * Locate the gl_FragColor write and the expression it uses for alpha.
 * @returns {{ writeIndex: number, alphaExpr: string|null }|null}
 */
function findFragColorWrite(clean) {
  const m = /\bgl_FragColor\s*=\s*vec4\s*\(/.exec(clean);
  if (!m) return null;
  const open = clean.indexOf('(', m.index);
  const close = matchParen(clean, open);
  if (close === -1) return { writeIndex: m.index, alphaExpr: null };
  const args = splitTopLevel(clean.slice(open + 1, close), ',').map((s) => s.trim());
  // vec4(r, g, b, a) or vec4(vec3, a); anything else is not judged here.
  const alphaExpr = args.length === 4 || args.length === 2 ? args[args.length - 1] : null;
  return { writeIndex: m.index, alphaExpr };
}

/**
 * Validate one shader object source file.
 * @param {string} source
 * @returns {ValidationResult}
 */
export function validateShader(source) {
  /** @type {Finding[]} */
  const errors = [];
  /** @type {Finding[]} */
  const warnings = [];
  const err = (rule, message) => errors.push({ rule, severity: 'error', message });
  const warn = (rule, message) => warnings.push({ rule, severity: 'warning', message });

  // Rule 25: file size.
  const bytes = new TextEncoder().encode(source).length;
  if (bytes >= MAX_FILE_BYTES) err('25-file-size', 'Shader: file too large');

  // Section 2: UTF-8, no byte-order mark.
  if (source.charCodeAt(0) === 0xfeff) {
    err('2-bom', 'Shader: file must be UTF-8 without a byte-order mark');
  }

  // Rules 1 and 2: header present, first, and parses.
  const extracted = extractHeader(source);
  if (!extracted.ok) {
    const rule = extracted.error.includes('valid JSON') ? '2-json' : '1-header';
    err(rule, extracted.error);
    return { ok: false, profile: 'rejected', errors, warnings, meta: null, normalized: null, body: null };
  }
  const { meta, body } = extracted;
  const normalized = normalizeMeta(meta);
  const clean = stripComments(body);

  // ---- Rule 3: header validates (Appendix A) ----
  for (const key of Object.keys(meta)) {
    if (!HEADER_KEYS.has(key)) {
      err('3-header', `Shader: unknown header key "${key}" (the header schema allows no extra properties)`);
    }
  }
  if (meta.ADITS !== undefined && meta.ADITS !== 1) {
    err('3-header', 'Shader: ADITS must be 1');
  }
  if (normalized.isAditsProfile) {
    if (typeof meta.DESCRIPTION !== 'string' || meta.DESCRIPTION.length === 0) {
      err('3-header', 'Shader: DESCRIPTION must be a non-empty string');
    }
    if (typeof meta.DESCRIPTION === 'string' && meta.DESCRIPTION.length > 500) {
      err('3-header', 'Shader: DESCRIPTION is over 500 characters');
    }
  } else {
    warn('3-profile', 'Shader loads on the generic fallback path: add "ADITS": 1 for labelled controls, audio binding, and correct alpha');
  }
  if (meta.CREDIT !== undefined && (typeof meta.CREDIT !== 'string' || meta.CREDIT.length > 200)) {
    err('3-header', 'Shader: CREDIT must be a string of at most 200 characters');
  }
  // Rules 3b and 3c: the authoring date (guide section 3).
  if (meta.DATE === undefined) {
    if (normalized.isAditsProfile) {
      warn('3-date', 'Shader: no DATE in the header, so the gallery has to date it by its first commit. Add "DATE": "YYYY-MM-DD"');
    }
  } else if (!isCalendarDate(meta.DATE)) {
    err('3-date', 'Shader: DATE must be a YYYY-MM-DD calendar date');
  } else {
    // One day of slack, so an author a timezone ahead of the checker is fine.
    const maxDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    if (meta.DATE < MIN_SHADER_DATE || meta.DATE > maxDate) {
      err('3-date', `Shader: DATE "${meta.DATE}" is out of range (${MIN_SHADER_DATE} to ${maxDate})`);
    }
  }
  if (meta.ALPHA !== undefined && !['premultiplied', 'straight', 'opaque'].includes(meta.ALPHA)) {
    err('3-header', `Shader: ALPHA "${meta.ALPHA}" is not one of premultiplied, straight, opaque`);
  }
  if (meta.BACKGROUND !== undefined && !['none', 'filled'].includes(meta.BACKGROUND)) {
    err('3-header', `Shader: BACKGROUND "${meta.BACKGROUND}" is not one of none, filled`);
  }
  if (meta.COST !== undefined && !['low', 'medium', 'high'].includes(meta.COST)) {
    err('3-header', `Shader: COST "${meta.COST}" is not one of low, medium, high`);
  }
  if (meta.ASPECT !== undefined && !['square', 'free'].includes(meta.ASPECT)) {
    err('3-header', `Shader: ASPECT "${meta.ASPECT}" is not one of square, free`);
  }
  if (meta.LOOP !== undefined && (typeof meta.LOOP !== 'number' || !(meta.LOOP > 0) || meta.LOOP > 600)) {
    err('3-header', 'Shader: LOOP must be a number of seconds between 0 (exclusive) and 600');
  }
  if (meta.CATEGORIES !== undefined) {
    if (!Array.isArray(meta.CATEGORIES) || meta.CATEGORIES.length > 8) {
      err('3-header', 'Shader: CATEGORIES must be an array of at most 8 strings');
    } else if (meta.CATEGORIES.some((c) => typeof c !== 'string')) {
      err('3-header', 'Shader: every CATEGORIES entry must be a string');
    }
  }

  // ---- INPUTS (rules 3 to 6, plus section 4) ----
  if (meta.INPUTS !== undefined && !Array.isArray(meta.INPUTS)) {
    err('3-inputs', 'Shader: INPUTS must be an array');
  }
  const rawInputs = Array.isArray(meta.INPUTS) ? meta.INPUTS : [];
  for (const entry of rawInputs) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      err('3-inputs', 'Shader: every INPUTS entry must be an object');
    }
  }
  if (rawInputs.length > 12) err('3-inputs', 'Shader: more than 12 INPUTS declared');

  const inputs = normalized.inputs;
  const seenNames = new Set();
  let numericSlots = 0;
  let boolSlots = 0;
  let colorSlots = 0;

  for (const input of inputs) {
    const name = input.NAME;
    const label = typeof name === 'string' ? name : '(unnamed)';

    for (const key of Object.keys(input)) {
      if (!INPUT_KEYS.has(key)) {
        err('3-input-key', `Shader: input "${label}" has unknown key "${key}" (a typo here silently drops the setting)`);
      }
    }

    if (typeof name !== 'string' || !/^[A-Za-z_]\w*$/.test(name) || name.length > 40) {
      err('3-input-name', `Shader: input "${label}" is not a valid GLSL identifier`);
      continue;
    }
    if (name.startsWith('gl_')) {
      err('3-input-name', `Shader: input "${name}" must not start with gl_`);
    }
    if (name.startsWith('ADITS_')) {
      err('3-input-name', `Shader: input "${name}" is a reserved name (ADITS_ prefix)`);
    }
    if (RESERVED_UNIFORMS.includes(name)) {
      err('3-input-name', `Shader: input "${name}" is a reserved name`);
    }
    if (seenNames.has(name)) {
      err('3-input-name', `Shader: input "${name}" is declared more than once`);
    }
    seenNames.add(name);

    if (input.LABEL !== undefined && (typeof input.LABEL !== 'string' || input.LABEL.length > 40)) {
      err('3-input-key', `Shader: input "${name}" LABEL must be a string of at most 40 characters`);
    }
    if (input.LABELS !== undefined && (!Array.isArray(input.LABELS) || input.LABELS.some((l) => typeof l !== 'string'))) {
      err('3-input-key', `Shader: input "${name}" LABELS must be an array of strings`);
    }

    if (input.TYPE === undefined) {
      err('3-input-type', `Shader: input "${name}" has no TYPE`);
      continue;
    }
    if (REJECTED_INPUT_TYPES.includes(input.TYPE)) {
      err('3-input-type', `Shader: input "${name}" has unsupported TYPE "${input.TYPE}" (image, audio and audioFFT are rejected in version 1)`);
      continue;
    }
    if (!SUPPORTED_INPUT_TYPES.includes(input.TYPE)) {
      err('3-input-type', `Shader: input "${name}" has unsupported TYPE "${input.TYPE}"`);
      continue;
    }

    // Slot budget accounting (rule 5).
    if (input.TYPE === 'float' || input.TYPE === 'long') numericSlots += 1;
    if (input.TYPE === 'point2D') numericSlots += 2;
    if (input.TYPE === 'bool') boolSlots += 1;
    if (input.TYPE === 'color') colorSlots += 1;

    // DEFAULT is required except for event, whose section 4 row says "omit".
    if (input.TYPE !== 'event' && input.DEFAULT === undefined) {
      err('3-input-default', `Shader: input "${name}" has no DEFAULT`);
      continue;
    }

    if (input.TYPE === 'float' || input.TYPE === 'long') {
      if (typeof input.MIN !== 'number' || typeof input.MAX !== 'number') {
        err('4-bounds', `Shader: input "${name}" needs MIN and MAX`);
      } else {
        if (input.MIN >= input.MAX) {
          err('4-bounds', `Shader: input "${name}" has MIN >= MAX`);
        }
        if (typeof input.DEFAULT !== 'number') {
          err('4-bounds', `Shader: input "${name}" DEFAULT must be a number`);
        } else if (input.DEFAULT < input.MIN || input.DEFAULT > input.MAX) {
          err('4-bounds', `Shader: input "${name}" DEFAULT is outside MIN..MAX`);
        }
      }
      if (input.TYPE === 'long' && typeof input.DEFAULT === 'number' && !Number.isInteger(input.DEFAULT)) {
        err('4-bounds', `Shader: input "${name}" is a long, so DEFAULT must be an integer`);
      }
    }
    if (input.TYPE === 'bool' && typeof input.DEFAULT !== 'boolean') {
      err('3-input-default', `Shader: input "${name}" DEFAULT must be true or false`);
    }
    if (input.TYPE === 'color') {
      const d = input.DEFAULT;
      if (!Array.isArray(d) || d.length !== 4 || d.some((v) => typeof v !== 'number' || v < 0 || v > 1)) {
        err('3-input-default', `Shader: input "${name}" DEFAULT must be [r, g, b, a] with each channel 0..1`);
      }
    }
    if (input.TYPE === 'point2D') {
      const d = input.DEFAULT;
      if (!Array.isArray(d) || d.length !== 2 || d.some((v) => typeof v !== 'number')) {
        err('3-input-default', `Shader: input "${name}" DEFAULT must be [x, y]`);
      }
    }

    // BIND rules (section 6).
    if (input.BIND !== undefined) {
      if (!BIND_SOURCES.includes(input.BIND)) {
        err('6-bind', `Shader: unknown BIND source "${input.BIND}"`);
      }
      if (input.TYPE !== 'float' && input.TYPE !== 'long') {
        warn('6-bind', `Shader: BIND on input "${name}" is ignored (only float and long inputs are driven)`);
      }
      // Rule 24: the bind must be able to move the value.
      const depth = typeof input.BIND_DEPTH === 'number' ? input.BIND_DEPTH : 1;
      if (input.BIND !== 'none' && typeof input.DEFAULT === 'number') {
        if (depth > 0 && input.DEFAULT === input.MAX) {
          warn('24-silence', `Shader: bound input "${name}" has DEFAULT pinned at MAX with a positive BIND_DEPTH, so the bind can never move it`);
        }
        if (depth < 0 && input.DEFAULT === input.MIN) {
          warn('24-silence', `Shader: bound input "${name}" has DEFAULT pinned at MIN with a negative BIND_DEPTH, so the bind can never move it`);
        }
        if (depth >= 0 && input.DEFAULT === input.MIN) {
          warn('24-silence', `Shader: bound input "${name}" has DEFAULT pinned at MIN; at silence it sits at the bottom of its range, so make sure the object still looks finished there`);
        }
      }
    }
    if (input.BIND_DEPTH !== undefined && (typeof input.BIND_DEPTH !== 'number' || input.BIND_DEPTH < -1 || input.BIND_DEPTH > 1)) {
      err('6-bind', `Shader: input "${name}" BIND_DEPTH must be between -1.0 and 1.0`);
    }

    // Rule 6: no duplicate uniform declaration in the body.
    const dupRe = new RegExp(`\\buniform\\b[^;]*\\b${name}\\b`);
    if (dupRe.test(clean)) {
      err('6-duplicate', `Shader: input "${name}" is already declared in the body`);
    }
  }

  // Rule 5: slot budget (warning).
  if (numericSlots > 6) warn('5-slots', `Shader: ${numericSlots} numeric input slots (point2D counts as two); the budget is 6`);
  if (boolSlots > 2) warn('5-slots', `Shader: ${boolSlots} boolean inputs; the budget is 2`);
  if (colorSlots > 2) warn('5-slots', `Shader: ${colorSlots} colour inputs; the budget is 2`);

  // ---- Body rules ----

  // The body must not declare any reserved uniform itself (section 7).
  for (const reserved of RESERVED_UNIFORMS) {
    const re = new RegExp(`\\buniform\\b[^;]*\\b${reserved}\\b`);
    if (re.test(clean)) {
      err('7-reserved', `Shader: "${reserved}" is a reserved uniform that Adits injects; do not declare it`);
    }
  }
  const aditsPrefixed = /\buniform\b[^;]*\b(ADITS_\w+)\b/.exec(clean);
  if (aditsPrefixed) {
    err('7-reserved', `Shader: "${aditsPrefixed[1]}" uses the reserved ADITS_ prefix`);
  }

  // Rule 7: no #version.
  if (/^\s*#version/m.test(clean)) err('7-version', 'Shader: #version is not allowed');

  // Rule 8: precision outside an #ifdef GL_ES guard (warning).
  {
    const lines = clean.split('\n');
    /** @type {boolean[]} */
    const stack = []; // one frame per open conditional; true when it is a GL_ES guard
    for (const line of lines) {
      const open = /^\s*#(ifdef|ifndef|if)\b(.*)$/.exec(line);
      if (open) {
        const isGlEs = open[1] === 'ifdef'
          ? /^\s*GL_ES\b/.test(open[2])
          : open[1] === 'if' && /defined\s*\(?\s*GL_ES\s*\)?/.test(open[2]);
        stack.push(isGlEs);
        continue;
      }
      if (/^\s*#endif\b/.test(line)) {
        stack.pop();
        continue;
      }
      if (/^\s*precision\s/.test(line) && !stack.some(Boolean)) {
        warn('8-precision', 'Shader: precision declaration found; Adits injects precision highp float, so remove it (a guarded #ifdef GL_ES form is tolerated but pointless)');
        break;
      }
    }
  }

  // Rule 9: no GLSL 3.00 qualifiers as global declarations.
  if (/\b(in|out|flat|centroid)\s+(?:(?:highp|mediump|lowp)\s+)?\w+\s+\w+\s*;/.test(clean)) {
    err('9-qualifiers', 'Shader: in/out/flat/centroid global qualifiers are GLSL 3.00 and not allowed');
  }

  // Rule 10: no samplers.
  if (/\bsampler(2D|Cube|3D)\b/.test(clean)) {
    err('10-sampler', 'Shader: samplers are not supported in this version');
  }

  // Rule 11: no derivatives.
  if (/\b(dFdx|dFdy|fwidth)\s*\(/.test(clean)) {
    err('11-derivatives', 'Shader: derivative functions are not supported');
  }

  // Rule 12: exactly one main.
  const mains = clean.match(/\bvoid\s+main\s*\(/g) || [];
  if (mains.length === 0) err('12-main', 'Shader: no main() found');
  if (mains.length > 1) err('12-main', 'Shader: more than one main() found');

  // Rules 13 and 14: gl_FragColor written, never read.
  if (!/\bgl_FragColor\s*(\.[xyzwrgba]+)?\s*=(?!=)/.test(clean)) {
    err('13-fragcolor', 'Shader: gl_FragColor is never written');
  }
  {
    const re = /\bgl_FragColor\b/g;
    let m;
    while ((m = re.exec(clean)) !== null) {
      const rest = clean.slice(m.index + 'gl_FragColor'.length);
      // Allowed: optional swizzle, then a plain = (not == and not compound assignment).
      if (!/^\s*(\.[xyzwrgba]+)?\s*=(?!=)/.test(rest)) {
        err('14-fragcolor-read', 'Shader: gl_FragColor is read, which is not allowed');
        break;
      }
    }
  }

  // Rules 15 to 18: loops.
  const consts = collectConstants(clean);
  const loops = parseLoops(clean, consts);
  for (const loop of loops) {
    if (loop.kind !== 'for') {
      err('15-loop-bound', `Shader: ${loop.kind} loops are not allowed; use a for loop with a compile-time constant bound`);
      continue;
    }
    if (loop.count === null) {
      err('15-loop-bound', `Shader: loop bound must be a constant (offending header: for(${loop.headerRaw}))`);
    }
  }
  // Rule 16: product of each nest chain.
  let worstProduct = 0;
  for (const loop of loops) {
    if (loop.count === null) continue;
    let product = loop.count;
    for (const p of loop.parents) {
      if (p.count !== null) product *= p.count;
    }
    worstProduct = Math.max(worstProduct, product);
  }
  if (worstProduct > 200) {
    err('16-loop-budget', `Shader: loop budget exceeded (${Math.round(worstProduct)} iterations; the ceiling is 200)`);
  }

  // Rule 17: raymarch step cap.
  const distanceCandidates = findDistanceCandidates(clean);
  let largestMarch = 0;
  for (const loop of loops) {
    if (loop.count === null) continue;
    const loopBody = clean.slice(loop.bodyStart, loop.bodyEnd + 1);
    if (loopIsRaymarch(loopBody, distanceCandidates)) {
      largestMarch = Math.max(largestMarch, loop.count);
    }
  }
  if (largestMarch > 96) {
    err('17-march-steps', `Shader: raymarch loop of ${largestMarch} steps exceeds the hard ceiling of 96`);
  } else if (largestMarch > 64) {
    warn('17-march-steps', `Shader: raymarch loop of ${largestMarch} steps is over the 64-step budget (96 is the hard ceiling)`);
  }

  // Rule 18: normal tap count (warning).
  {
    for (const fn of findFunctionBodies(clean)) {
      if (!/normal/i.test(fn.name)) continue;
      const fnBody = clean.slice(fn.start, fn.end + 1);
      let taps = 0;
      for (const dfn of distanceCandidates) {
        taps += (fnBody.match(new RegExp(`\\b${dfn}\\s*\\(`, 'g')) || []).length;
      }
      if (taps > 4) {
        warn('18-normal-taps', `Shader: ${fn.name}() calls the distance function ${taps} times; use the 4-tap tetrahedral form`);
      }
    }
  }

  // Rule 19: canonical preamble (warning).
  if (!/gl_FragCoord\.xy\s*-\s*0?\.5\s*\*\s*RENDERSIZE/.test(clean)) {
    warn('19-preamble', 'Shader: the canonical centred, aspect-correct preamble was not found; coordinates should come from (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y');
  }

  // Rule 20: no hard-coded resolution (warning).
  {
    const m20 = /gl_FragCoord\.[xyzw]+\s*\/\s*(?:vec2\s*\(\s*)?(\d{3,})/.exec(clean);
    if (m20 && parseInt(m20[1], 10) >= 256) {
      warn('20-hardcoded-res', `Shader: gl_FragCoord divided by a literal ${m20[1]}; use RENDERSIZE, which changes at runtime`);
    }
  }

  const write = findFragColorWrite(clean);

  // Rule 21: premultiplied output (warning). Judged against the alpha
  // expression the shader actually writes, whatever it is named.
  if (normalized.alpha === 'premultiplied' && normalized.background === 'none' && write) {
    const alphaExpr = write.alphaExpr;
    if (alphaExpr && /^[A-Za-z_]\w*$/.test(alphaExpr)) {
      const before = clean.slice(0, write.writeIndex);
      const premultiplied =
        new RegExp(`\\*=\\s*${alphaExpr}\\b`).test(before) ||
        new RegExp(`=\\s*[^;]*\\*\\s*${alphaExpr}\\b`).test(before) ||
        new RegExp(`\\b${alphaExpr}\\s*\\*\\s*\\w`).test(before);
      if (!premultiplied) {
        warn('21-premultiply', `Shader: the colour is never multiplied by "${alphaExpr}" before the gl_FragColor write; the profile expects premultiplied alpha`);
      }
    }
    // A non-identifier alpha expression (an inline clamp, say) is not judged:
    // the check would be guesswork either way.
  }

  // Rule 21b: unlocalised alpha accumulation (warning).
  {
    const re = /\b(alpha|a|cov|coverage)\s*\+=\s*([^;]+);/g;
    let m21;
    while ((m21 = re.exec(clean)) !== null) {
      const rhs = m21[2];
      const spatial = /\b(smoothstep|length|distance|dot|exp|min|max|clamp|mix|step)\s*\(/.test(rhs)
        || /\b(d|dist|r|rad|mask|fall|falloff|cov|coverage|body|core|glow|spark|ring|shape|sdf|field)\w*\b/i.test(rhs);
      if (!spatial) {
        warn('21b-alpha-accum', `Shader: "${m21[1]} += ${rhs.trim()}" has no spatial term, so it raises coverage across the whole frame (the full-frame veil failure)`);
      }
    }
  }

  // Rule 22: not opaque when BACKGROUND is none. Covers vec4(col, 1.0),
  // vec4(r, g, b, 1.0) and the single-argument vec4(1.0).
  if (normalized.background === 'none') {
    const opaque =
      /gl_FragColor\s*=\s*vec4\s*\([^;]*,\s*1(\.0*)?\s*\)\s*;/.test(clean) ||
      /gl_FragColor\s*=\s*vec4\s*\(\s*1(\.0*)?\s*\)\s*;/.test(clean);
    if (opaque) {
      err('22-opaque', 'Shader: hard-coded opaque write (alpha 1.0) with BACKGROUND "none"; derive alpha from coverage instead');
    }
  }

  // Rule 23: LOOP consistency (warning).
  if (normalized.loop !== null) {
    const loopLiteral = String(normalized.loop);
    let suspect = null;
    for (const line of clean.split('\n')) {
      if (!/\bTIME\b/.test(line)) continue;
      if (/\bTIMEDELTA\b/.test(line) && !/\bTIME\b(?!DELTA)/.test(line)) continue;
      const wrapped = /\b(fract|mod)\s*\(/.test(line)
        || line.includes(loopLiteral)
        || /\bPERIOD\b|\bLOOP\b|\bph\b|\bphase\b/i.test(line);
      if (!wrapped) { suspect = line.trim(); break; }
    }
    if (suspect) {
      warn('23-loop', `Shader: LOOP is declared but TIME is used outside a fract/mod/period wrap on: "${suspect}". Unwrapped TIME will not loop seamlessly`);
    }
  }

  const ok = errors.length === 0;
  const profile = !ok ? 'rejected' : normalized.isAditsProfile ? 'adits' : 'generic';
  return { ok, profile, errors, warnings, meta, normalized, body };
}
