// The point an anamorphic effect follows (Adits: the webcam hand or face, `_track`), offline.
// Two sources, both resolved to one entry per harness frame (pre-roll included), in the OUTPUT
// frame's normalized coordinates (0..1, after the cover crop rcg fx applies to the source):
//   * an rcg track file (tools/track/track.mjs): the subject's palm, face box centre or eye
//     centre in the footage itself, plus the hand openness and a depth (lean) estimate;
//   * a keyframed point: "x,y" (fixed) or "t:x,y[,open];t:x,y[,open]" with t in seconds of the
//     output clip, linear between keys, held before the first and after the last.
// Entry: { x, y, z, open, has }. `open` uses AnamorphicCamera._measureHandOpenness' scale
// (0 fist .. 1 palm), converted from the GestureEngine value rcg track stores; null = no hand.

import { readFileSync } from 'node:fs';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Cover-crop mapping from source-normalized to output-normalized coordinates. */
function coverMap(srcW, srcH, W, H) {
  const s = Math.max(W / srcW, H / srcH);
  const fx = W / (srcW * s);
  const fy = H / (srcH * s);
  return { x: (u) => (u - (1 - fx) / 2) / fx, y: (v) => (v - (1 - fy) / 2) / fy, heightScale: (srcH * s) / H };
}

export function trackPoints({ file, anchor = 'hand', hand = null, srcStart, fps, frames, W, H }) {
  const t = JSON.parse(readFileSync(file, 'utf8'));
  const map = coverMap(t.width, t.height, W, H);
  let sides = [];
  if (anchor === 'hand') {
    const hs = (t.hands || []).filter((h) => !hand || h.side.toLowerCase() === String(hand).toLowerCase());
    if (!hs.length) throw new Error(`No ${hand ? `${hand} ` : ''}hand in ${file}`);
    // The side present most often leads; the other fills its gaps.
    sides = hs.map((h) => ({ h, n: h.present.filter(Boolean).length })).sort((a, b) => b.n - a.n).map((s) => s.h);
  } else if (!t.face) throw new Error(`No face track in ${file}`);
  const out = [];
  for (let i = 0; i < frames; i++) {
    const k = Math.round((srcStart + i / fps - (t.start || 0)) * t.fps);
    let p = { x: 0.5, y: 0.5, z: 0, open: null, has: false };
    if (k >= 0 && k < t.times.length) {
      if (anchor === 'hand') {
        const h = sides.find((s) => s.present[k]);
        if (h) {
          // Adits: z = (hand size - 0.18) / 0.18; openness (avg tip distance / palm size - 1.15) / 0.85.
          // rcg track's open is GestureEngine's (avg / size - 0.9), so avg = open + 0.9.
          const size = h.size[k] * map.heightScale;
          p = { x: map.x(h.x[k]), y: map.y(h.y[k]), z: clamp((size - 0.18) / 0.18, -1, 1), open: clamp((h.open[k] + 0.9 - 1.15) / 0.85, 0, 1), has: true };
        }
      } else if (t.face.present[k]) {
        const f = t.face;
        const size = f.size[k] * map.heightScale;
        const [u, v] = anchor === 'eyes' ? [f.ex[k], f.ey[k]] : [f.cx[k], f.cy[k]];
        p = { x: map.x(u), y: map.y(v), z: clamp((size - 0.13) / 0.10, -1, 1), open: null, has: true };
      }
    }
    out.push(p);
  }
  return { points: out, src: t.src };
}

export function pathPoints(spec, { fps, frames, preroll = 0 }) {
  const keys = String(spec).split(';').map((s) => s.trim()).filter(Boolean).map((s) => {
    const [tPart, rest] = s.includes(':') ? s.split(':') : ['0', s];
    const [x, y, open] = rest.split(',').map(Number);
    if (![Number(tPart), x, y].every(Number.isFinite)) throw new Error(`--point: cannot read "${s}" (want t:x,y[,open])`);
    return { t: Number(tPart), x, y, open: Number.isFinite(open) ? open : 1 };
  }).sort((a, b) => a.t - b.t);
  if (!keys.length) throw new Error('--point is empty');
  const at = (t) => {
    if (t <= keys[0].t) return keys[0];
    const j = keys.findIndex((k) => k.t >= t);
    if (j < 0) return keys[keys.length - 1];
    const a = keys[j - 1]; const b = keys[j];
    const u = (t - a.t) / ((b.t - a.t) || 1);
    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, open: a.open + (b.open - a.open) * u };
  };
  return Array.from({ length: frames }, (_, i) => {
    const k = at(i / fps - preroll);
    return { x: k.x, y: k.y, z: 0, open: clamp(k.open, 0, 1), has: true };
  });
}
