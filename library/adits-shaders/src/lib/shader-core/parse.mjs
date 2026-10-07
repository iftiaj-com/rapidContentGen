// Light GLSL scanning shared by the validator.
//
// The guide prescribes "a brace-matching scan that records for headers and
// function-call sites"; a full GLSL parser is deliberately not required. These
// helpers do that scan properly, with paren depth respected, so constructs that
// a single regex misses (a parenthesised for-init, an unbraced nested loop, a
// while loop) cannot slip past the loop rules.

/** Strip comments, preserving newlines and total length so indices stay valid. */
export function stripComments(src) {
  let out = '';
  let i = 0;
  while (i < src.length) {
    if (src[i] === '/' && src[i + 1] === '/') {
      const nl = src.indexOf('\n', i);
      const end = nl === -1 ? src.length : nl;
      out += ' '.repeat(end - i);
      i = end;
    } else if (src[i] === '/' && src[i + 1] === '*') {
      const close = src.indexOf('*/', i + 2);
      const end = close === -1 ? src.length : close + 2;
      out += src.slice(i, end).replace(/[^\n]/g, ' ');
      i = end;
    } else {
      out += src[i];
      i++;
    }
  }
  return out;
}

/** Index of the ')' matching the '(' at openIdx, or -1. */
export function matchParen(src, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Index of the '}' matching the '{' at openIdx, or -1. */
export function matchBrace(src, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Split on a separator that sits at paren depth 0. */
export function splitTopLevel(text, sep) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of text) {
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    if (ch === sep && depth === 0) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

const nextNonSpace = (src, from) => {
  let j = from;
  while (j < src.length && /\s/.test(src[j])) j++;
  return j;
};

/**
 * Span of the statement starting at index `start` (must be non-whitespace).
 * Handles blocks, nested control statements, and plain statements, so an
 * unbraced loop body that is itself a loop is measured in full.
 */
export function statementSpan(src, start) {
  const j = nextNonSpace(src, start);
  if (j >= src.length) return { start: j, end: src.length - 1 };

  if (src[j] === '{') {
    const end = matchBrace(src, j);
    return { start: j, end: end === -1 ? src.length - 1 : end };
  }

  const head = /^(for|while|if|do)\b/.exec(src.slice(j, j + 6));
  if (head) {
    if (head[1] === 'do') {
      const inner = statementSpan(src, j + 2);
      const w = src.indexOf('while', inner.end);
      if (w === -1) return { start: j, end: inner.end };
      const open = src.indexOf('(', w);
      const close = open === -1 ? -1 : matchParen(src, open);
      const semi = close === -1 ? -1 : src.indexOf(';', close);
      return { start: j, end: semi === -1 ? (close === -1 ? inner.end : close) : semi };
    }
    const open = src.indexOf('(', j);
    if (open === -1) return { start: j, end: src.length - 1 };
    const close = matchParen(src, open);
    if (close === -1) return { start: j, end: src.length - 1 };
    const inner = statementSpan(src, close + 1);
    return { start: j, end: inner.end };
  }

  // Plain statement: to the first ';' at paren depth 0.
  let depth = 0;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '(') depth++;
    else if (src[k] === ')') depth--;
    else if (src[k] === ';' && depth === 0) return { start: j, end: k };
  }
  return { start: j, end: src.length - 1 };
}

/**
 * Compile-time numeric constants: `#define NAME 64`, `#define NAME (64)`, and
 * `const int NAME = 64;`. All three are genuine compile-time bounds, so a loop
 * using one must not be rejected as uniform-bounded.
 */
export function collectConstants(body) {
  const consts = new Map();
  const defineRe = /^[ \t]*#define[ \t]+([A-Za-z_]\w*)[ \t]+\(?\s*([+-]?(?:[0-9]+\.?[0-9]*|\.[0-9]+))\s*\)?[ \t]*$/gm;
  let m;
  while ((m = defineRe.exec(body)) !== null) consts.set(m[1], parseFloat(m[2]));

  const constRe = /\bconst\s+(?:(?:highp|mediump|lowp)\s+)?(?:int|float)\s+([A-Za-z_]\w*)\s*=\s*\(?\s*([+-]?(?:[0-9]+\.?[0-9]*|\.[0-9]+))\s*\)?\s*;/g;
  while ((m = constRe.exec(body)) !== null) consts.set(m[1], parseFloat(m[2]));
  return consts;
}

/** Resolve a token to a compile-time number, or null when it is not one. */
function resolveNumber(token, consts) {
  const t = token.trim().replace(/^\(\s*|\s*\)$/g, '');
  if (/^[+-]?(?:[0-9]+\.?[0-9]*|\.[0-9]+)$/.test(t)) return parseFloat(t);
  if (consts.has(t)) return consts.get(t);
  const cast = /^(?:int|float)\s*\(\s*([+-]?(?:[0-9]+\.?[0-9]*|\.[0-9]+))\s*\)$/.exec(t);
  if (cast) return parseFloat(cast[1]);
  return null;
}

/**
 * Iteration count of a for-loop from its three clauses, honouring the
 * increment step. Returns null when any part is not a compile-time constant,
 * which is what rule 15 rejects.
 */
export function countForIterations(clauses, consts) {
  const init = clauses[0] ?? '';
  const cond = clauses[1] ?? '';
  const incr = clauses[2] ?? '';

  const cm = /^\s*([^<>=!]+?)\s*(<=|>=|<|>)\s*(.+?)\s*$/.exec(cond);
  if (!cm) return null;
  const lhs = cm[1].trim();
  const op = cm[2];
  const rhs = cm[3].trim();

  let varName = null;
  let bound = null;
  let ascending = true;
  const rhsNum = resolveNumber(rhs, consts);
  const lhsNum = resolveNumber(lhs, consts);
  if (rhsNum !== null && /^[A-Za-z_]\w*$/.test(lhs)) {
    varName = lhs;
    bound = rhsNum;
    ascending = op === '<' || op === '<=';
  } else if (lhsNum !== null && /^[A-Za-z_]\w*$/.test(rhs)) {
    varName = rhs;
    bound = lhsNum;
    ascending = op === '>' || op === '>=';
  } else {
    return null;
  }

  let start = 0;
  const im = new RegExp(`\\b${varName}\\s*=\\s*([^,;]+)`).exec(init);
  if (im) {
    const v = resolveNumber(im[1], consts);
    if (v === null) return null;
    start = v;
  }

  let step = 1;
  if (new RegExp(`(\\+\\+|--)\\s*${varName}\\b|\\b${varName}\\s*(\\+\\+|--)`).test(incr)) {
    step = 1;
  } else {
    const sm = new RegExp(`\\b${varName}\\s*([+\\-*/])=\\s*([^,;]+)`).exec(incr);
    if (sm) {
      if (sm[1] !== '+' && sm[1] !== '-') return null; // multiplicative: not linear
      const v = resolveNumber(sm[2], consts);
      if (v === null) return null;
      step = Math.abs(v);
    } else {
      const am = new RegExp(`\\b${varName}\\s*=\\s*${varName}\\s*([+\\-])\\s*([^,;]+)`).exec(incr);
      if (!am) return null;
      const v = resolveNumber(am[2], consts);
      if (v === null) return null;
      step = Math.abs(v);
    }
  }
  if (!(step > 0)) return null;

  // A loop whose variable moves away from its bound never terminates cleanly;
  // treat it as uncountable rather than guessing.
  const span = ascending ? bound - start : start - bound;
  if (span <= 0) return 0;
  const raw = span / step;
  const n = op === '<=' || op === '>=' ? Math.floor(raw) + 1 : Math.ceil(raw);
  return Math.max(0, n);
}

/**
 * Every loop in the body, with its iteration count (null when not a
 * compile-time constant), body span, and nesting parents.
 *
 * @returns {{kind:'for'|'while'|'do', index:number, headerRaw:string,
 *            count:number|null, bodyStart:number, bodyEnd:number,
 *            parents:object[]}[]}
 */
export function parseLoops(body, consts) {
  const loops = [];
  const re = /\b(for|while|do)\b/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    const kind = m[1];
    const index = m.index;

    if (kind === 'do') {
      const span = statementSpan(body, index);
      const inner = statementSpan(body, index + 2);
      loops.push({
        kind, index, headerRaw: 'do', count: null,
        bodyStart: inner.start, bodyEnd: inner.end, parents: [],
      });
      re.lastIndex = Math.max(index + 2, span.end);
      continue;
    }

    const open = body.indexOf('(', index);
    if (open === -1) break;
    // Guard against a bare identifier match with no header following.
    if (/[^\s]/.test(body.slice(index + kind.length, open))) continue;
    const close = matchParen(body, open);
    if (close === -1) break;
    const header = body.slice(open + 1, close);
    const span = statementSpan(body, close + 1);

    let count = null;
    if (kind === 'for') {
      const clauses = splitTopLevel(header, ';');
      if (clauses.length >= 2) count = countForIterations(clauses, consts);
    }
    loops.push({
      kind, index, headerRaw: header.trim(), count,
      bodyStart: span.start, bodyEnd: span.end, parents: [],
    });
    // Resume after the header so keywords inside it are not rematched; the
    // body is still scanned, which is how nested loops are found.
    re.lastIndex = close + 1;
  }

  for (const loop of loops) {
    loop.parents = loops.filter(
      (p) => p !== loop && loop.index >= p.bodyStart && loop.index <= p.bodyEnd
    );
  }
  return loops;
}

/** Names of functions plausibly acting as a distance function: T f(vec3 ...). */
export function findDistanceCandidates(body) {
  const names = new Set();
  const re = /\b(?:float|vec2|vec3|vec4)\s+([A-Za-z_]\w*)\s*\(\s*(?:(?:in|const)\s+)*(?:(?:highp|mediump|lowp)\s+)?vec3\b/g;
  let m;
  while ((m = re.exec(body)) !== null) names.add(m[1]);
  return names;
}

/** Function bodies by name, for the normal-tap count. */
export function findFunctionBodies(body) {
  const fns = [];
  const re = /\b(?:float|vec2|vec3|vec4|void|int|bool|mat2|mat3|mat4)\s+([A-Za-z_]\w*)\s*\(/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    const open = body.indexOf('(', m.index);
    const close = matchParen(body, open);
    if (close === -1) continue;
    const brace = nextNonSpace(body, close + 1);
    if (body[brace] !== '{') continue; // a declaration, not a definition
    const end = matchBrace(body, brace);
    if (end === -1) continue;
    fns.push({ name: m[1], start: brace, end });
    re.lastIndex = end;
  }
  return fns;
}

const CLASSIC_DISTANCE_NAMES = /^(map|scene|sdf|de|dist|distfn|world|sd[A-Z_]?\w*)$/i;

/**
 * Whether a loop marches rays: it calls a vec3-taking function, and either the
 * callee carries a classic distance-function name or the loop advances a
 * variable that appears in the call's arguments. The second test keeps a plain
 * `float hash(vec3)` helper from making every long loop look like a raymarch.
 */
export function loopIsRaymarch(loopBody, candidates) {
  const advanced = new Set();
  const advRe = /\b([A-Za-z_]\w*)\s*(?:\+=|=\s*[A-Za-z_]\w*\s*\+)/g;
  let a;
  while ((a = advRe.exec(loopBody)) !== null) advanced.add(a[1]);

  for (const fn of candidates) {
    const callRe = new RegExp(`\\b${fn}\\s*\\(`, 'g');
    let c;
    while ((c = callRe.exec(loopBody)) !== null) {
      if (CLASSIC_DISTANCE_NAMES.test(fn)) return true;
      const open = loopBody.indexOf('(', c.index);
      const close = matchParen(loopBody, open);
      if (close === -1) continue;
      const args = loopBody.slice(open + 1, close);
      for (const v of advanced) {
        if (new RegExp(`\\b${v}\\b`).test(args)) return true;
      }
    }
  }
  return false;
}
