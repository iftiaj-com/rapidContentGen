// Adits Shader Object header parsing.
// Plain ESM so both the site (via Vite) and scripts/validate.mjs (via Node) share one implementation.
// Authority: shader-guide.md sections 2 through 5.

/** Reserved uniform names Adits always injects (guide section 5). */
export const RESERVED_UNIFORMS = [
  'TIME', 'TIMEDELTA', 'FRAMEINDEX', 'RENDERSIZE', 'PASSINDEX',
  'AUDIO_BASS', 'AUDIO_MID', 'AUDIO_TREBLE', 'AUDIO_VOL',
  'AUDIO_LEVEL', 'AUDIO_BEAT', 'AUDIO_KICK', 'AUDIO_SNARE',
  'AUDIO_HAT', 'AUDIO_BANDS',
  'CAM_DIR', 'CAM_UP',
  'TRACK', 'TRACK_ON', 'HAND_OPEN',
  'MEDIA', 'MEDIA_SIZE',
];

/** Input types accepted by version 1 of the profile. */
export const SUPPORTED_INPUT_TYPES = ['float', 'bool', 'long', 'color', 'point2D', 'event'];

/** Input types named by ISF but rejected in version 1. */
export const REJECTED_INPUT_TYPES = ['image', 'audio', 'audioFFT'];

/** Valid BIND sources (guide section 6). */
export const BIND_SOURCES = [
  'bass', 'mid', 'treble', 'vol', 'level', 'beat', 'kick', 'snare', 'hat',
  'gesture.x', 'gesture.y', 'gesture.z', 'gesture.open', 'none',
];

/** Earliest DATE the profile accepts (guide section 3). */
export const MIN_SHADER_DATE = '2020-01-01';

/**
 * True when `value` is a plain YYYY-MM-DD string naming a real calendar day.
 * The round-trip is what rejects "2026-02-31", which the pattern alone accepts.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** COST to default render resolution (guide section 3). */
export const COST_RESOLUTION = { low: 1024, medium: 768, high: 512 };

/**
 * Split a shader file into its JSON header and GLSL body.
 * The header must be the first non-whitespace content: a block comment
 * opening with "/*{" and closing with "}" followed by the comment terminator.
 *
 * @param {string} source
 * @returns {{ ok: true, meta: object, body: string, headerRaw: string } |
 *           { ok: false, error: string }}
 */
export function extractHeader(source) {
  if (typeof source !== 'string' || source.length === 0) {
    return { ok: false, error: 'Shader: no header block found' };
  }
  // Strip a UTF-8 BOM for parsing purposes; the validator flags it separately.
  const text = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  const m = /^\s*\/\*\s*\{/.exec(text);
  if (!m) {
    return { ok: false, error: 'Shader: no header block found' };
  }
  const end = text.indexOf('}*/', m.index);
  if (end === -1) {
    return { ok: false, error: 'Shader: no header block found' };
  }
  const openBrace = text.indexOf('{', m.index);
  const jsonText = text.slice(openBrace, end + 1);
  let meta;
  try {
    meta = JSON.parse(jsonText);
  } catch (e) {
    return { ok: false, error: 'Shader: header is not valid JSON' };
  }
  if (meta === null || typeof meta !== 'object' || Array.isArray(meta)) {
    return { ok: false, error: 'Shader: header is not valid JSON' };
  }
  return {
    ok: true,
    meta,
    body: text.slice(end + 3),
    headerRaw: text.slice(m.index, end + 3),
  };
}

/**
 * Normalize a parsed header into a predictable shape with defaults applied.
 * Performs no validation; the validator reports problems.
 *
 * @param {object} meta
 * @returns {{
 *   isAditsProfile: boolean,
 *   description: string,
 *   credit: string,
 *   date: string,
 *   categories: string[],
 *   alpha: 'premultiplied'|'straight'|'opaque',
 *   background: 'none'|'filled',
 *   cost: 'low'|'medium'|'high',
 *   aspect: 'square'|'free',
 *   loop: number|null,
 *   inputs: object[],
 * }}
 */
export function normalizeMeta(meta) {
  return {
    isAditsProfile: meta.ADITS === 1,
    description: typeof meta.DESCRIPTION === 'string' ? meta.DESCRIPTION : '',
    credit: typeof meta.CREDIT === 'string' ? meta.CREDIT : '',
    date: isCalendarDate(meta.DATE) ? meta.DATE : '',
    categories: Array.isArray(meta.CATEGORIES) ? meta.CATEGORIES.filter((c) => typeof c === 'string') : [],
    alpha: ['premultiplied', 'straight', 'opaque'].includes(meta.ALPHA) ? meta.ALPHA : 'premultiplied',
    background: ['none', 'filled'].includes(meta.BACKGROUND) ? meta.BACKGROUND : 'none',
    cost: ['low', 'medium', 'high'].includes(meta.COST) ? meta.COST : 'medium',
    aspect: ['square', 'free'].includes(meta.ASPECT) ? meta.ASPECT : 'square',
    loop: typeof meta.LOOP === 'number' && meta.LOOP > 0 ? meta.LOOP : null,
    inputs: Array.isArray(meta.INPUTS) ? meta.INPUTS.filter((i) => i && typeof i === 'object') : [],
  };
}

/**
 * The GLSL uniform type for a declared input type.
 * @param {string} type
 * @returns {string|null}
 */
export function glslTypeFor(type) {
  switch (type) {
    case 'float': return 'float';
    case 'bool': return 'bool';
    case 'event': return 'bool';
    case 'long': return 'int';
    case 'color': return 'vec4';
    case 'point2D': return 'vec2';
    default: return null;
  }
}
