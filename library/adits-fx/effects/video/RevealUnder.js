import { BaseEffect } from '../../shared/BaseEffect.js';
import { buildProgramDeferred } from '../../shared/gl-link.js';

/**
 * Reveal Under (WebGL2)                                        // REVEALUNDER
 * ─────────────────────────────────────────────────────────────
 * A two-layer tiled reveal. Layer 1 is the app's main media; Layer 2 is a
 * second source (uploaded video/image, a time-delayed echo of Layer 1, a
 * frozen frame of Layer 1, or a zoomed crop of it). The frame is divided into
 * a tile lattice and each tile independently shows Layer 1 or Layer 2. Both
 * layers are sampled through their own object-cover crop rects, so they stay
 * spatially aligned and the scene reads as continuous across cell boundaries —
 * only the *moment* differs per tile. That alignment is the whole illusion.
 *
 * Self-contained vanilla WebGL2 (no three.js, no WebGPU), structurally cloned
 * from SplitScreen.js: own offscreen canvas, ONE master fragment shader over a
 * fullscreen triangle, composited back with drawImage. `isGPU = false` — a
 * self-managed WebGL2 effect rides the Canvas2D dispatch path.
 *
 * TWO TIERS OF REVEAL STYLE
 *   Tier 1 (stateless, this file's only path today): Random / Sweep /
 *     Sequential / Center-out / Edges-in / Noise / Gesture. Each yields a
 *     per-tile `rank` compared against one monotonic driver `uReveal`, so the
 *     reveal AND its crossfade are closed form — no feedback buffer, nothing
 *     to lose on context loss, nothing to drift during export.
 *   Tier 2 (not built yet): On Motion / Contrast need a per-tile measurement
 *     of the video, which means a small ping-ponged state FBO (the house rule
 *     forbids getImageData). Those two options are absent from the dropdown
 *     until that lands.
 *
 * CLOCK — deliberately NOT SplitScreen's `this._time += 0.016`. That drifts,
 * runs at half speed during a 30fps export, and advances once per
 * drawFrameSingle() call (so dragging a slider while paused would animate the
 * effect). Time comes from media time with a post-process branch, and the
 * driver only advances when the frame stamp actually changed — which also
 * makes the effect safe when GestureEngine's multi-finger mode renders the
 * same singleton effect up to 4× per displayed frame.
 *
 * NOTE: this file embeds GLSL template literals — it is excluded from the prod
 * obfuscator in vite.config.mjs (same as SplitScreen.js).
 */

const VERT_SRC = /* glsl */`#version 300 es
precision highp float;
out vec2 vUv;
void main() {
    // Fullscreen triangle from gl_VertexID — zero buffers needed.
    vec2 pos = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
    vUv = vec2(pos.x, 1.0 - pos.y);   // origin top-left, matches canvas space
    gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG_SRC = /* glsl */`#version 300 es
precision highp float;

in vec2 vUv;
out vec4 outColor;

uniform sampler2D uTexA;
uniform sampler2D uTexB;
uniform vec4  uCropA;        // object-cover sub-rect of A: offset.xy, size.zw (0..1)
uniform vec4  uCropB;        // object-cover sub-rect of B
uniform vec2  uRes;          // output resolution (px)
uniform float uTime;         // effect clock (s), media-time derived

// ── Lattice ──────────────────────────────────────────────────────────────
uniform vec2  uGrid;         // columns, rows
uniform int   uLayout;       // 0 grid 1 brick 2 hex 3 triangle 4 diamond 5 columns 6 rows 7 radial
uniform int   uCellShape;    // 0 fill 1 circle 2 square 3 diamond 4 triangle 5 hexagon 6 star 7 plus
uniform float uCellSize;     // 0..1 inset within the cell
uniform float uGapPx;        // gap between cells (px)
uniform float uLatticeRot;   // radians

// ── Reveal ───────────────────────────────────────────────────────────────
uniform int   uStyle;        // 0 random 1 sweep 2 sequential 3 center 4 edges 5 noise 6 gesture
                             // 7 motion 8 contrast (read from uState)
uniform float uReveal;       // 0..1 driver
uniform float uFadeWidth;    // 0 = hard cut
uniform float uInvertReveal; // 0/1
uniform int   uSweepDir;     // 0 L>R 1 R>L 2 T>B 3 B>T 4 diagonal 5 spiral
uniform vec2  uFocal;        // 0..1 uv — center-out / edges-in focus
uniform float uNoiseScale;
uniform float uNoiseDrift;
uniform vec2  uGestureC;     // 0..1 uv — gesture reveal centre
uniform float uGestureR;     // gesture radius (uv)

// ── Colour ───────────────────────────────────────────────────────────────
uniform int   uColorMode;    // see COLOR_* below
uniform vec3  uCustomColor;
uniform int   uColorTarget;  // 0 revealed 1 base 2 both
uniform float uColorMix;     // 0..1
uniform float uAudioPulse;   // 0..1, feeds the neon mode

// ── Tile motion ──────────────────────────────────────────────────────────
uniform float uPop;          // 0..0.4 — brief scale kick as a tile crosses over
uniform float uOffset;       // 0..0.15 — per-tile parallax of the Layer 2 sample
uniform vec2  uOffsetGest;   // extra offset from the tracked hand
uniform float uHueJitter;    // 0..0.5

// ── Grid ─────────────────────────────────────────────────────────────────
uniform float uGridOn;       // 0/1
uniform vec3  uGridColor;
uniform float uGridWidth;    // px
uniform float uGridOpacity;  // 0..1
uniform int   uGapFill;      // 0 layer1 1 solid 2 transparent
uniform vec3  uGapColor;

// ── Compositing ──────────────────────────────────────────────────────────
uniform int   uBlendMode;    // 0 replace 1 screen 2 multiply 3 difference 4 overlay
uniform float uSwapLayers;   // 0/1 — Layer 2 becomes the base

// ── Tier 2 measurement map (styles 7 motion / 8 contrast) ────────────────
// A coarse screen-space grid written by the state pass: R = smoothed motion
// energy, G = smoothed local contrast. Each cell reads the texel its centre
// falls in, so this works for every layout including rotated hex.
uniform sampler2D uState;
uniform vec2  uGridS;        // measured region grid (cols, rows), <= 64
uniform float uThreshold;    // reveal above this measured level

const float PI = 3.14159265359;

// ── Sampling ─────────────────────────────────────────────────────────────

vec3 sampleCover(sampler2D t, vec4 crop, vec2 uv) {
    return texture(t, crop.xy + clamp(uv, 0.0, 1.0) * crop.zw).rgb;
}

// How Layer 2 combines with the base where a tile shows it through
vec3 blendB(vec3 base, vec3 b) {
    if (uBlendMode == 1) return 1.0 - (1.0 - base) * (1.0 - b);      // screen
    if (uBlendMode == 2) return base * b;                            // multiply
    if (uBlendMode == 3) return abs(base - b);                       // difference
    if (uBlendMode == 4) {                                           // overlay
        return mix(2.0 * base * b,
                   1.0 - 2.0 * (1.0 - base) * (1.0 - b),
                   step(0.5, base));
    }
    return b;                                                        // replace
}

// ── Hashes / noise ───────────────────────────────────────────────────────

float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

vec2 hash22(vec2 p) {
    return vec2(hash21(p), hash21(p + 19.19));
}

float valueNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// ── Colour modes — GLSL ports of BaseEffect.applyColorMode ───────────────

vec3 rgb2hsv(vec3 c) {
    vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
    float d = q.x - min(q.w, q.y);
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
}

vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

vec3 getThermal(float t) {
    t = clamp(t, 0.0, 1.0);
    vec3 c1 = vec3(0.0, 0.0, 0.2), c2 = vec3(0.0, 0.3, 1.0), c3 = vec3(0.8, 0.0, 0.8);
    vec3 c4 = vec3(1.0, 0.1, 0.0), c5 = vec3(1.0, 0.9, 0.2);
    float v = t * 4.0, ph = floor(v), f = v - ph;
    if (ph < 1.0) return mix(c1, c2, f);
    if (ph < 2.0) return mix(c2, c3, f);
    if (ph < 3.0) return mix(c3, c4, f);
    return mix(c4, c5, f);
}

// mode: 0 vibrant, 1 nebula, 2 supernova
vec3 getCosmic(float t, float shift, int mode) {
    float v = fract(t + shift) * 5.0;
    float ph = floor(v);
    float f = smoothstep(0.0, 1.0, v - ph);
    vec3 c0, c1, c2, c3, c4, c5;
    if (mode == 0) {
        c0 = vec3(0.0, 0.0, 0.3); c1 = vec3(0.2, 0.0, 0.8); c2 = vec3(0.9, 0.0, 0.5);
        c3 = vec3(1.0, 0.2, 0.0); c4 = vec3(1.0, 0.9, 0.0); c5 = vec3(0.0, 1.0, 1.0);
    } else if (mode == 1) {
        c0 = vec3(0.0, 0.1, 0.2); c1 = vec3(0.0, 0.5, 0.8); c2 = vec3(0.8, 0.0, 1.0);
        c3 = vec3(1.0, 0.4, 0.8); c4 = vec3(1.0, 0.8, 0.9); c5 = vec3(1.0, 1.0, 1.0);
    } else {
        c0 = vec3(0.1, 0.0, 0.0); c1 = vec3(0.6, 0.0, 0.2); c2 = vec3(1.0, 0.3, 0.0);
        c3 = vec3(1.0, 0.8, 0.0); c4 = vec3(1.0, 1.0, 0.5); c5 = vec3(1.0, 1.0, 1.0);
    }
    if (ph < 1.0) return mix(c0, c1, f);
    if (ph < 2.0) return mix(c1, c2, f);
    if (ph < 3.0) return mix(c2, c3, f);
    if (ph < 4.0) return mix(c3, c4, f);
    return mix(c4, c5, f);
}

// 0 normal, 1 rgb, 2 bw, 3 rainbow, 4 threshold, 5 chrome, 6 neon, 7 thermal,
// 8 cosmic_vibrant, 9 cosmic_nebula, 10 cosmic_supernova, 11 custom,
// 12 negative, 13 xray. 'seed' is the tile hash so per-tile modes stay coherent
// inside a cell instead of dissolving into per-pixel noise.
vec3 applyColorMode(vec3 c, float seed) {
    if (uColorMode == 0) return c;
    float luma = dot(c, vec3(0.299, 0.587, 0.114));
    vec3 o = c;

    if (uColorMode == 1) {                                   // Random RGB — per tile
        int t = int(floor(fract(seed) * 6.0));
        float r = fract(seed * 7.31);
        if      (t == 0) o = vec3(1.0, r, 0.0);
        else if (t == 1) o = vec3(1.0, 0.0, r);
        else if (t == 2) o = vec3(0.0, 1.0, r);
        else if (t == 3) o = vec3(r, 1.0, 0.0);
        else if (t == 4) o = vec3(0.0, r, 1.0);
        else             o = vec3(r, 0.0, 1.0);
    } else if (uColorMode == 2) {                            // B&W
        o = vec3(luma);
    } else if (uColorMode == 3) {                            // Colour Wheel
        vec3 h = rgb2hsv(c);
        o = hsv2rgb(vec3(fract(h.x + uTime * 0.05), 1.0, 1.0));
    } else if (uColorMode == 4) {                            // RGB Threshold
        o = step(vec3(0.5), c);
    } else if (uColorMode == 5) {                            // Chrome
        o = vec3(smoothstep(0.2, 0.8, sin(luma * 15.0 + uTime) * 0.5 + 0.5));
    } else if (uColorMode == 6) {                            // Neon
        float m = clamp(luma + sin(uAudioPulse * 5.0) * 0.5, 0.0, 1.0);
        o = vec3(m, 1.0 - m, 1.0);
    } else if (uColorMode == 7) {                            // Thermal
        o = getThermal(luma);
    } else if (uColorMode >= 8 && uColorMode <= 10) {        // Cosmic ×3
        o = getCosmic(luma, fract(uTime * 0.01), uColorMode - 8);
    } else if (uColorMode == 11) {                           // Custom Colour
        o = uCustomColor;
    } else if (uColorMode == 12) {                           // Negative
        o = 1.0 - c;
    } else if (uColorMode == 13) {                           // X-Ray
        float x = 1.0 - luma;
        o = mix(vec3(0.02, 0.05, 0.12), vec3(0.85, 0.95, 1.0), pow(x, 1.6));
        o += vec3(0.0, 0.08, 0.20) * (1.0 - x);
    }
    return mix(c, o, uColorMix);
}

// ── SDFs (px space, negative inside) ─────────────────────────────────────

float sdBox(vec2 p, vec2 b) {
    vec2 d = abs(p) - b;
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

float sdRhombus(vec2 p, vec2 b) {
    p = abs(p);
    float f = clamp((b.x * (b.x - 2.0 * p.x) - b.y * (b.y - 2.0 * p.y)) /
                    max(dot(b, b), 1e-6), -1.0, 1.0);
    float d = length(p - 0.5 * b * vec2(1.0 - f, 1.0 + f));
    return d * sign(p.x * b.y + p.y * b.x - b.x * b.y);
}

float sdHexagon(vec2 p, float r) {
    const vec3 k = vec3(-0.866025404, 0.5, 0.577350269);
    p = abs(p);
    p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
    p -= vec2(clamp(p.x, -k.z * r, k.z * r), r);
    return length(p) * sign(p.y);
}

float sdEquilateral(vec2 p, float r) {
    const float k = 1.73205081;
    p.x = abs(p.x) - r;
    p.y = p.y + r / k;
    if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) * 0.5;
    p.x -= clamp(p.x, -2.0 * r, 0.0);
    return -length(p) * sign(p.y);
}

float sdStar5(vec2 p, float r) {
    const float rf = 0.45;
    const vec2 k1 = vec2(0.809016994, -0.587785252);
    const vec2 k2 = vec2(-k1.x, k1.y);
    p.x = abs(p.x);
    p -= 2.0 * max(dot(k1, p), 0.0) * k1;
    p -= 2.0 * max(dot(k2, p), 0.0) * k2;
    p.x = abs(p.x);
    p.y -= r;
    vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0.0, 1.0);
    float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
    return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
}

float sdCross(vec2 p, vec2 b) {
    // union of two boxes — an approximate but well-behaved plus sign
    return min(sdBox(p, vec2(b.x, b.y * 0.34)), sdBox(p, vec2(b.x * 0.34, b.y)));
}

vec2 rot2(vec2 p, float a) {
    float s = sin(a), c = cos(a);
    return vec2(p.x * c - p.y * s, p.x * s + p.y * c);
}

// ── Lattice ──────────────────────────────────────────────────────────────
// Everything happens in isotropic SCREEN PIXELS so distances stay true under
// rotation and the grid-line width means what it says.

struct Cell {
    vec2  id;        // tile index (may be negative once rotated)
    vec2  q;         // position within the cell, px, origin at the cell centre
    vec2  halfPx;    // cell half-extent, px  ('half' is a GLSL reserved word)
    vec2  centerUv;  // cell centre in uv
    float native;    // layout-native fill SDF (px, negative inside)
};

Cell buildCell(vec2 uv) {
    Cell cl;
    vec2 P = uv * uRes;
    vec2 C = uRes * 0.5;
    float ang = uLatticeRot + (uLayout == 4 ? PI * 0.25 : 0.0);   // diamond = grid + 45°
    vec2 R = rot2(P - C, -ang) + C;

    vec2 grid = uGrid;
    if (uLayout == 5) grid.y = 1.0;        // columns
    if (uLayout == 6) grid.x = 1.0;        // rows
    vec2 cellPx = uRes / max(grid, vec2(1.0));

    if (uLayout == 7) {                    // radial — rings × sectors
        vec2 d = R - C;
        float maxR = length(uRes) * 0.5;
        float rr = length(d) / maxR;
        float aa = atan(d.y, d.x) / (2.0 * PI) + 0.5;
        vec2 g = vec2(aa * grid.x, rr * grid.y);
        cl.id = floor(g);
        vec2 f = fract(g);
        float ringPx = maxR / max(grid.y, 1.0);
        float arcPx = max(length(d), 1.0) * 2.0 * PI / max(grid.x, 1.0);
        cl.halfPx = vec2(arcPx, ringPx) * 0.5;
        cl.q = (f - 0.5) * cl.halfPx * 2.0;
        float cA = (cl.id.x + 0.5) / grid.x, cR = (cl.id.y + 0.5) / grid.y;
        vec2 cd = vec2(cos((cA - 0.5) * 2.0 * PI), sin((cA - 0.5) * 2.0 * PI)) * cR * maxR;
        cl.centerUv = (rot2(cd, ang) + C) / uRes;
        cl.native = sdBox(cl.q, cl.halfPx);
        return cl;
    }

    if (uLayout == 2) {
        // Hex — two rectangular lattices offset by half a pitch, nearest centre
        // wins. sdHexagon's 'r' is the apothem of a flat-top hexagon, so the
        // pitches that tile it are sqrt(3)*r across and 2*r down.
        float r = cellPx.y * 0.5;
        vec2 hs = vec2(1.7320508 * r, 2.0 * r);
        vec2 off = hs * 0.5;
        vec2 ia = floor(R / hs);
        vec2 ib = floor((R - off) / hs);
        vec2 ca = (ia + 0.5) * hs;
        vec2 cb = (ib + 0.5) * hs + off;
        bool pickA = dot(R - ca, R - ca) < dot(R - cb, R - cb);
        vec2 cen = pickA ? ca : cb;
        cl.id = pickA ? ia : (ib + vec2(0.5, 1000.0));   // keep the two lattices distinct
        cl.q = R - cen;
        cl.halfPx = vec2(r);
        cl.centerUv = (rot2(cen - C, ang) + C) / uRes;
        cl.native = sdHexagon(cl.q, r);
        return cl;
    }

    float shift = 0.0;
    vec2 g = R / cellPx;
    if (uLayout == 1) {                    // brick — odd rows offset half a cell
        float ty = floor(g.y);
        shift = mod(ty, 2.0) * 0.5;
        g.x -= shift;
    }
    cl.id = floor(g);
    vec2 f = fract(g);
    cl.halfPx = cellPx * 0.5;
    cl.q = (f - 0.5) * cellPx;
    vec2 cen = (cl.id + vec2(shift, 0.0) + 0.5) * cellPx;
    cl.centerUv = (rot2(cen - C, ang) + C) / uRes;

    if (uLayout == 3) {                    // triangle — split each cell on the diagonal
        vec2 base = cl.id;                 // the square this triangle belongs to
        float diagScale = 1.0 / max(length(vec2(1.0 / cellPx.x, 1.0 / cellPx.y)), 1e-6);
        float dd = (1.0 - f.x - f.y) * diagScale;
        bool lower = (f.x + f.y) < 1.0;
        // Inner distance to the nearest of the triangle's three edges.
        float dx = lower ? f.x * cellPx.x : (1.0 - f.x) * cellPx.x;
        float dy = lower ? f.y * cellPx.y : (1.0 - f.y) * cellPx.y;
        cl.native = -min(min(dx, dy), lower ? dd : -dd);
        vec2 tc = lower ? vec2(1.0 / 3.0) : vec2(2.0 / 3.0);   // centroid
        vec2 cenT = (base + tc) * cellPx;
        cl.centerUv = (rot2(cenT - C, ang) + C) / uRes;
        cl.id.x = base.x * 2.0 + (lower ? 0.0 : 1.0);          // distinct hash per half
        return cl;
    }

    cl.native = sdBox(cl.q, cl.halfPx);
    return cl;
}

// The reveal window inside a cell, as an SDF in px (negative inside).
float cellShapeSd(Cell cl) {
    vec2 h = cl.halfPx * uCellSize;
    float r = min(h.x, h.y);
    if (uCellShape == 0) return cl.native + (1.0 - uCellSize) * min(cl.halfPx.x, cl.halfPx.y);
    if (uCellShape == 1) return length(cl.q) - r;
    if (uCellShape == 2) return sdBox(cl.q, h);
    if (uCellShape == 3) return sdRhombus(cl.q, h);
    if (uCellShape == 4) return sdEquilateral(cl.q, r);
    if (uCellShape == 5) return sdHexagon(cl.q, r);
    if (uCellShape == 6) return sdStar5(cl.q, r);
    return sdCross(cl.q, h);
}

// ── Reveal rank ──────────────────────────────────────────────────────────
// Every Tier-1 style boils down to one number per tile: the point on the
// 0..1 driver at which this tile crosses over.

// Position-based ranks read the CELL CENTRE in uv, not the tile index: ids run
// outside 0..grid once the lattice is rotated, and the hex/radial layouts do
// not index as a plain rectangular array at all. Only 'random' needs the id,
// because it wants a stable per-tile hash.
float tileRank(Cell cl) {
    vec2 n = clamp(cl.centerUv, 0.0, 1.0);
    if (uStyle == 0) return hash21(cl.id + 0.5);                       // random
    if (uStyle == 1) {                                                 // sweep
        if (uSweepDir == 0) return n.x;
        if (uSweepDir == 1) return 1.0 - n.x;
        if (uSweepDir == 2) return n.y;
        if (uSweepDir == 3) return 1.0 - n.y;
        if (uSweepDir == 4) return clamp((n.x + n.y) * 0.5, 0.0, 1.0);
        return fract(atan(n.y - 0.5, n.x - 0.5) / (2.0 * PI) + 0.5
                     + length(n - 0.5) * 1.2);                         // spiral
    }
    if (uStyle == 2) {                                                 // sequential — raster order
        vec2 g = max(uGrid, vec2(1.0));
        float row = floor(n.y * g.y);
        float col = floor(n.x * g.x);
        return clamp((row * g.x + col + 0.5) / (g.x * g.y), 0.0, 1.0);
    }
    if (uStyle == 3) return clamp(length(n - uFocal) / 0.7071, 0.0, 1.0);        // center-out
    if (uStyle == 4) return 1.0 - clamp(length(n - uFocal) / 0.7071, 0.0, 1.0);  // edges-in
    if (uStyle == 5) return valueNoise(n * uNoiseScale + uTime * uNoiseDrift);   // noise
    // gesture — tiles near the tracked hand reveal first
    return clamp(length(n - uGestureC) / max(uGestureR, 1e-3), 0.0, 1.0);
}

void main() {
    vec2 uv = vUv;
    Cell cl = buildCell(uv);

    float reveal;
    float bump;
    if (uStyle >= 7) {
        // Measured styles — read this cell's region from the state map. The
        // motion channel is already smoothed with the Hold release, so no
        // per-cell easing state is needed here.
        ivec2 si = clamp(ivec2(clamp(cl.centerUv, 0.0, 1.0) * uGridS),
                         ivec2(0), ivec2(uGridS) - ivec2(1));
        vec4 stv = texelFetch(uState, si, 0);
        float m = (uStyle == 7) ? stv.r : stv.g;
        reveal = (uFadeWidth <= 0.0)
            ? step(uThreshold, m)
            : smoothstep(uThreshold, uThreshold + max(uFadeWidth, 0.01), m);
        bump = uPop * 4.0 * reveal * (1.0 - reveal);   // peaks mid-transition
    } else {
        float rank = tileRank(cl);
        reveal = (uFadeWidth <= 0.0)
            ? step(rank, uReveal)
            : smoothstep(rank, rank + uFadeWidth, uReveal);
        // Pop — a brief kick as the tile crosses over. Keyed on the driver's
        // distance to this tile's rank, so it fires for hard cuts too.
        bump = uPop * exp(-pow((uReveal - rank) / 0.09, 2.0));
    }
    if (uInvertReveal > 0.5) reveal = 1.0 - reveal;

    float seed = hash21(cl.id + 0.5);

    // Shape mask. Pop dilates the SDF (a real distance-field operation — dividing
    // it would not move the boundary at all); the gap insets it; the grid line
    // straddles the resulting edge.
    float sd = cellShapeSd(cl) - bump * min(cl.halfPx.x, cl.halfPx.y) + uGapPx * 0.5;
    float aa = max(fwidth(sd), 0.75);
    float seamless = (uCellShape == 0 && uGapPx <= 0.0 && uCellSize >= 0.999) ? 1.0 : 0.0;
    float inside = mix(1.0 - smoothstep(-aa, aa, sd), 1.0, seamless);

    // Layer 2 sampling offset — per-tile parallax plus the gesture nudge.
    vec2 offB = (hash22(cl.id + 3.7) - 0.5) * uOffset + uOffsetGest;

    vec3 a = sampleCover(uTexA, uCropA, uv);
    vec3 b = sampleCover(uTexB, uCropB, uv + offB);
    if (uSwapLayers > 0.5) { vec3 t = a; a = b; b = t; }

    // Colour mode applies to the chosen target only.
    vec3 aC = (uColorTarget == 1 || uColorTarget == 2) ? applyColorMode(a, seed) : a;
    vec3 bC = (uColorTarget == 0 || uColorTarget == 2) ? applyColorMode(b, seed) : b;

    vec3 col = mix(aC, blendB(aC, bC), reveal * inside);

    // Per-tile hue jitter, after the colour mode.
    if (uHueJitter > 0.0) {
        vec3 h = rgb2hsv(col);
        h.x = fract(h.x + (seed - 0.5) * uHueJitter);
        col = hsv2rgb(h);
    }

    // Gap fill — what shows between cells when uGapPx > 0 or the shape insets.
    float alpha = 1.0;
    if (uGapPx > 0.0 || uCellSize < 1.0 || uCellShape != 0) {
        if (uGapFill == 1) {
            col = mix(uGapColor, col, inside);
        } else if (uGapFill == 2) {
            alpha = inside;
        }
        // uGapFill == 0 leaves Layer 1 showing, which 'col' already is.
    }

    // Grid line, straddling the inset cell edge.
    if (uGridOn > 0.5 && uGridWidth > 0.0) {
        float line = 1.0 - smoothstep(uGridWidth * 0.5 - aa, uGridWidth * 0.5 + aa, abs(sd));
        float la = line * uGridOpacity;
        col = mix(col, uGridColor, la);
        alpha = max(alpha, la);
    }

    outColor = vec4(col * alpha, alpha);   // premultiplied — the context is alpha:true
}`;

// ── Tier 2: the tile-state pass ──────────────────────────────────────────
// Renders one texel per measured screen region into a small RGBA8 target,
// ping-ponged so the previous frame's values can be read while the new ones
// are written. Measurement happens in highp and only the result is stored, so
// 8-bit output costs nothing for mean/contrast; motion is pre-amplified to
// fill the byte. Every accumulator carries a 2/255 floor, because
// v += (target-v)*k stalls forever once the increment rounds to zero.
const STATE_FRAG_SRC = /* glsl */`#version 300 es
precision highp float;

in vec2 vUv;
out vec4 outColor;

uniform sampler2D uCur;      // current Layer 1 frame, full res
uniform sampler2D uPrev;     // previous Layer 1 frame, full res
uniform sampler2D uStatePrev;// previous state map
uniform vec4  uCropA;        // object-cover sub-rect of Layer 1
uniform vec2  uGridS;        // measured region grid (cols, rows)
uniform int   uTaps;         // K — the region is sampled K x K
uniform float uDt;           // seconds since the last state pass
uniform float uHoldTau;      // motion release time constant (s)
uniform float uPrevValid;    // 0 for one pass after any discontinuity

const float FLOOR8 = 2.0 / 255.0;   // smallest step RGBA8 can actually store

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

void main() {
    vec2 cell = floor(vUv * uGridS);
    vec2 r0 = cell / uGridS;
    vec2 r1 = (cell + 1.0) / uGridS;

    float K = float(uTaps);
    float sum = 0.0, sum2 = 0.0, diff = 0.0;
    for (int y = 0; y < 8; y++) {
        if (y >= uTaps) break;
        for (int x = 0; x < 8; x++) {
            if (x >= uTaps) break;
            vec2 t = r0 + (vec2(float(x), float(y)) + 0.5) / K * (r1 - r0);
            vec2 uv = uCropA.xy + clamp(t, 0.0, 1.0) * uCropA.zw;
            float lN = luma(texture(uCur, uv).rgb);
            float lP = luma(texture(uPrev, uv).rgb);
            sum += lN;
            sum2 += lN * lN;
            diff += abs(lN - lP);
        }
    }
    float n = max(K * K, 1.0);
    float mean = sum / n;
    // Standard deviation as the contrast proxy, gained into a usable range.
    float contrast = clamp(sqrt(max(sum2 / n - mean * mean, 0.0)) * 3.0, 0.0, 1.0);
    // mean(|now - prev|), NOT |mean(now) - mean(prev)| — the latter cancels
    // when a dark subject crosses a half-dark region and misses real motion.
    float rawMotion = clamp(diff / n * 8.0, 0.0, 1.0);

    vec4 prev = texture(uStatePrev, vUv);
    if (uPrevValid < 0.5) {
        outColor = vec4(0.0, contrast, 0.0, 1.0);
        return;
    }

    // Motion: instant attack, frame-rate-independent release.
    float kM = 1.0 - exp(-uDt / max(uHoldTau, 1e-3));
    float release = max(prev.r * kM, FLOOR8);
    float energy = clamp(max(rawMotion, prev.r - release), 0.0, 1.0);

    // Contrast: symmetric ease so it does not flicker frame to frame.
    float kC = 1.0 - exp(-uDt / 0.12);
    float d = contrast - prev.g;
    float stepC = max(abs(d) * kC, FLOOR8);
    float cOut = clamp(prev.g + clamp(d, -stepC, stepC), 0.0, 1.0);

    outColor = vec4(energy, cOut, rawMotion, 1.0);
}`;

const STATE_UNIFORM_NAMES = [
    'uCur', 'uPrev', 'uStatePrev', 'uCropA', 'uGridS', 'uTaps', 'uDt', 'uHoldTau', 'uPrevValid'
];

// The state map is allocated once at this fixed size and never reallocated, so
// changing the column/row sliders costs nothing and loses no history. The
// lattice sliders are capped below it.
const STATE_SIZE = 64;

const UNIFORM_NAMES = [
    'uTexA', 'uTexB', 'uCropA', 'uCropB', 'uRes', 'uTime',
    'uGrid', 'uLayout', 'uCellShape', 'uCellSize', 'uGapPx', 'uLatticeRot',
    'uStyle', 'uReveal', 'uFadeWidth', 'uInvertReveal', 'uSweepDir', 'uFocal',
    'uNoiseScale', 'uNoiseDrift', 'uGestureC', 'uGestureR',
    'uColorMode', 'uCustomColor', 'uColorTarget', 'uColorMix', 'uAudioPulse',
    'uPop', 'uOffset', 'uOffsetGest', 'uHueJitter',
    'uGridOn', 'uGridColor', 'uGridWidth', 'uGridOpacity', 'uGapFill', 'uGapColor',
    'uBlendMode', 'uSwapLayers',
    'uState', 'uGridS', 'uThreshold'
];

const LAYOUTS = { grid: 0, brick: 1, hex: 2, triangle: 3, diamond: 4, columns: 5, rows: 6, radial: 7 };
const CELL_SHAPES = { fill: 0, circle: 1, square: 2, diamond: 3, triangle: 4, hexagon: 5, star: 6, plus: 7 };
const STYLES = {
    random: 0, sweep: 1, sequential: 2, center: 3, edges: 4, noise: 5, gesture: 6,
    motion: 7, contrast: 8   // Tier 2 — these two read the state map
};
const SWEEP_DIRS = { lr: 0, rl: 1, tb: 2, bt: 3, diagonal: 4, spiral: 5 };
const COLOR_MODES = {
    normal: 0, rgb: 1, bw: 2, rainbow: 3, threshold: 4, chrome: 5, neon: 6, thermal: 7,
    cosmic_vibrant: 8, cosmic_nebula: 9, cosmic_supernova: 10, custom: 11,
    negative: 12, xray: 13
};
const COLOR_TARGETS = { revealed: 0, base: 1, both: 2 };
const BLEND_MODES = { replace: 0, screen: 1, multiply: 2, difference: 3, overlay: 4 };
const GAP_FILLS = { layer1: 0, solid: 1, transparent: 2 };

// Time Echo ring. Full-res snapshots would be ~8 MB each at 1080p, so the ring
// is capped in both slot count and resolution (ReversePhi caps its own ring at
// 3 slots for the same reason).
const ECHO_SLOTS = 16;
const ECHO_MAX_W = 960;
const ECHO_MAX_H = 540;

export class RevealUnder extends BaseEffect {
    constructor() {
        super('Reveal Under (WebGL2)');
        this.isGPU = false;         // self-managed WebGL2 — Canvas2D dispatch path
        this._canvas = null;
        this._gl = null;
        this._program = null;
        this._u = {};
        this._glFailed = false;

        // Layer 1 is double-buffered so the state pass can diff against the
        // previous frame. The index flips ONLY on a successful upload, so a
        // failed decode holds now === prev and reports motion 0, never a spike.
        this._texA = [null, null];
        this._aIdx = 0;
        this._texB = null;
        this._texAReady = false;
        this._lastCropA = null;
        this._lastSrcA = null;
        this._texBReady = false;
        this._lastCropB = null;

        // Layer 2 — uploaded media, owned by the effect
        this._mediaB = null;
        this._mediaBUrl = null;
        this._lastFileB = null;

        // Layer 2 — frozen frame + time echo
        this._freezeTex = null;
        this._freezeCrop = null;
        this._freezeArmed = true;   // capture on the next decodable frame
        this._echo = null;          // { tex[], stamp[], w, h, next }
        this._echoCanvas = null;    // downscale scratch for the echo ring
        this._echoCtx = null;
        this._lastEchoWrite = -1e9;

        // Tier 2 — measurement state map
        this._stateProg = null;
        this._su = {};
        this._stateTex = [null, null];
        this._stateFbo = [null, null];
        this._stateRead = 0;
        this._stateFailed = false;
        this._prevValid = 0;
        this._lastGridKey = null;

        // Clock / drive
        this._lastStamp = null;
        this._time = 0;             // accumulated media time (s)
        this._wasOffline = false;
        this._reveal = 0;           // the 0..1 driver
        this._audioEnv = 0;
        this._beatHot = false;
        this._lastBeat = -1e9;
        this._beatReveal = 0;
        this._gx = 0;               // smoothed gesture offset
        this._gy = 0;

        this.state = {
            source: 'upload',
            echoDelay: 1.5,
            bSpeed: 1,
            bMirrorH: false,
            bMirrorV: false,
            blendMode: 0,
            swapLayers: false,

            layout: 0,
            cellShape: 0,
            cols: 3,
            rows: 3,
            linkAspect: false,
            cellSize: 1,
            gap: 0,
            latticeRot: 0,

            style: 0,
            drive: 'auto',
            threshold: 0.35,
            hold: 0.4,
            amount: 0.5,
            rate: 1,
            cycle: 'build_collapse',
            audioBand: 'bass',
            audioSens: 1,
            beatSnap: false,
            transition: 0,
            sweepDir: 0,
            focalX: 0.5,
            focalY: 0.5,
            noiseScale: 3,
            noiseDrift: 0.3,
            gestureRadius: 0.3,
            invertReveal: false,

            colorMode: 0,
            customColor: '#ff00ff',
            colorTarget: 0,
            colorMix: 1,

            pop: 0,
            offset: 0,
            offsetGesture: false,
            hueJitter: 0,

            gridOn: true,
            gridColor: '#ffffff',
            gridWidth: 1.5,
            gridOpacity: 0.45,
            gapFill: 0,
            gapColor: '#000000'
        };
    }

    // Capture Layer 1 on the next decodable frame (the Freeze Now button).
    armFreeze() {
        this._freezeArmed = true;
    }

    restart() {
        if (this._mediaB?.tagName === 'VIDEO') this._mediaB.pause();
        this._lastStamp = null;
        this._time = 0;
        this._reveal = 0;
        this._beatReveal = 0;
        this._beatHot = false;
        this._lastBeat = -1e9;
        this._freezeArmed = true;
        this._lastEchoWrite = -1e9;
        this._prevValid = 0;
    }

    // ── GL lifecycle ─────────────────────────────────────────────────────

    _ensureGL(w, h) {
        if (this._glFailed) return false;
        if (!this._gl) {
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            // alpha:true + premultiplied so the "Transparent (hide)" gap fill can
            // actually punch through to whatever was drawn beneath the effect.
            const gl = canvas.getContext('webgl2', {
                alpha: true, premultipliedAlpha: true, antialias: false,
                preserveDrawingBuffer: false, powerPreference: 'high-performance'
            });
            if (!gl) { this._glFailed = true; return false; }
            canvas.addEventListener('webglcontextlost', (e) => {
                e.preventDefault();
                this._gl = null;
                this._canvas = null;
                this._program = null;
                this._stateProg = null;
                this._texA = [null, null];
                this._aIdx = 0;
                this._stateTex = [null, null];
                this._stateFbo = [null, null];
                this._stateRead = 0;
                this._prevValid = 0;
                this._lastGridKey = null;
                this._texB = null;
                this._texAReady = false;
                this._lastCropA = null;
                this._texBReady = false;
                this._lastCropB = null;
                this._freezeTex = null;
                this._freezeCrop = null;
                this._freezeArmed = true;
                this._echo = null;
                this._lastEchoWrite = -1e9;
                this._lastStamp = null;
            });
            this._canvas = canvas;
            this._gl = gl;
            this._program = null;
            this._stateProg = null;
            const locate = (prog, names) => {
                const u = {};
                names.forEach(n => { u[n] = gl.getUniformLocation(prog, n); });
                return u;
            };
            // Both programs link off the frame (shared/gl-link.js). Until the
            // composite program is ready the caller draws the plain fallback; a
            // still-linking state program only delays On Motion / Contrast.
            buildProgramDeferred(gl, VERT_SRC, FRAG_SRC, {
                label: 'RevealUnder composite',
                onReady: (prog) => {
                    if (this._gl !== gl) return; // context lost / rebuilt meanwhile
                    this._u = locate(prog, UNIFORM_NAMES);
                    gl.useProgram(prog);
                    gl.uniform1i(this._u.uTexA, 0);
                    gl.uniform1i(this._u.uTexB, 1);
                    gl.uniform1i(this._u.uState, 3);
                    this._program = prog;
                },
                onFail: () => { if (this._gl === gl) this._glFailed = true; },
            });
            this._texA = [this._makeTex(gl), this._makeTex(gl)];
            this._aIdx = 0;
            this._texB = this._makeTex(gl);

            // Tier 2 — the state program and its ping-pong targets. A failure
            // here only disables On Motion / Contrast; everything else runs.
            this._stateFailed = false;
            buildProgramDeferred(gl, VERT_SRC, STATE_FRAG_SRC, {
                label: 'RevealUnder state',
                onReady: (prog) => {
                    if (this._gl !== gl) return;
                    this._su = locate(prog, STATE_UNIFORM_NAMES);
                    gl.useProgram(prog);
                    gl.uniform1i(this._su.uCur, 0);
                    gl.uniform1i(this._su.uPrev, 2);
                    gl.uniform1i(this._su.uStatePrev, 3);
                    if (this._program) gl.useProgram(this._program);
                    this._stateProg = prog;
                },
                onFail: () => { if (this._gl === gl) this._stateFailed = true; },
            });
            {
                // Seed explicitly rather than relying on a null upload reading
                // back as zero.
                const seed = new Uint8Array(STATE_SIZE * STATE_SIZE * 4);
                this._stateTex = [];
                this._stateFbo = [];
                for (let i = 0; i < 2; i++) {
                    const t = gl.createTexture();
                    gl.bindTexture(gl.TEXTURE_2D, t);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, STATE_SIZE, STATE_SIZE, 0,
                                  gl.RGBA, gl.UNSIGNED_BYTE, seed);
                    const fb = gl.createFramebuffer();
                    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
                    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
                    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
                        console.error('RevealUnder: state framebuffer incomplete — On Motion / Contrast disabled');
                        this._stateFailed = true;
                    }
                    this._stateTex.push(t);
                    this._stateFbo.push(fb);
                }
                gl.bindFramebuffer(gl.FRAMEBUFFER, null);
                this._stateRead = 0;
                this._prevValid = 0;
            }
        }
        if (!this._program) return false; // still linking → plain draw this frame
        if (this._canvas.width !== w || this._canvas.height !== h) {
            this._canvas.width = w;
            this._canvas.height = h;
        }
        this._gl.viewport(0, 0, w, h);
        return true;
    }

    _makeTex(gl) {
        const t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return t;
    }

    // ── Media helpers (shared shape with SplitScreen) ────────────────────

    _mediaDims(media) {
        if (!media) return null;
        const w = media.videoWidth || media.naturalWidth || media.width || 0;
        const h = media.videoHeight || media.naturalHeight || media.height || 0;
        return (w > 0 && h > 0) ? { w, h } : null;
    }

    _isUploadable(media) {
        if (!media) return false;
        if (media.tagName === 'VIDEO') return media.videoWidth > 0 && media.readyState >= 2;
        if (media.tagName === 'IMG') return media.complete && media.naturalWidth > 0;
        return (media.width || 0) > 0 && (media.height || 0) > 0;
    }

    _coverCrop(mw, mh, tw, th) {
        const s = Math.max(tw / mw, th / mh);
        const sw = tw / s, sh = th / s;
        return { sx: (mw - sw) / 2, sy: (mh - sh) / 2, sw, sh };
    }

    _normCrop(crop, dims) {
        return [crop.sx / dims.w, crop.sy / dims.h, crop.sw / dims.w, crop.sh / dims.h];
    }

    _hexToRgb(hex) {
        const n = parseInt(String(hex).slice(1), 16) || 0;
        return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    }

    // Layer 2 upload: rebuild the owned element when #ruMediaInput changes.
    // Polled per frame — cheap, and survives the effect's lazy instantiation.
    _syncUpload() {
        const file = document.getElementById('ruMediaInput')?.files?.[0] || null;
        if (file === this._lastFileB) return;
        this._lastFileB = file;
        if (this._mediaB?.tagName === 'VIDEO') {
            this._mediaB.pause();
            this._mediaB.removeAttribute('src');
            this._mediaB.load();
        }
        if (this._mediaBUrl) { URL.revokeObjectURL(this._mediaBUrl); this._mediaBUrl = null; }
        this._mediaB = null;
        this._texBReady = false;
        this._lastCropB = null;
        if (!file) return;
        const url = URL.createObjectURL(file);
        this._mediaBUrl = url;
        const redraw = () => {
            const app = window.app;
            if (app && !app.state.isPlaying) app.drawFrameSingle();
        };
        if (file.type.startsWith('image/')) {
            const img = new Image();
            img.onload = redraw;
            img.src = url;
            this._mediaB = img;
        } else {
            const vid = document.createElement('video');
            // Layer 2 is picture only — it is never routed into the audio graph
            // and must never be audible. Muted before src is assigned, and
            // re-asserted on every handout below.
            vid.muted = true;
            vid.volume = 0;
            vid.loop = true;
            vid.playsInline = true;
            vid.onloadeddata = redraw;
            vid.src = url;
            vid.play().catch(() => { });
            this._mediaB = vid;
        }
    }

    _getUploadMedia() {
        this._syncUpload();
        const m = this._mediaB;
        if (!m || !this._isUploadable(m)) return null;
        if (m.tagName === 'VIDEO') {
            if (!m.muted) { m.muted = true; m.volume = 0; }   // silence is not negotiable
            if (m.paused) m.play().catch(() => { });
        }
        return m;
    }

    // ── Clock ────────────────────────────────────────────────────────────
    // Media time, with the post-process branch — NOT performance.now(), which
    // would run the ramp at the wrong rate during export and animate the effect
    // while a paused slider is being dragged.
    _frameStamp(app) {
        const st = app?.state;
        if (st?.isPostProcessing && st.postProcessCurrentTime !== undefined) {
            return st.postProcessCurrentTime;
        }
        const m = st?.activeMedia;
        if (m && !st.isImageMode && m.tagName === 'VIDEO' && isFinite(m.duration)) {
            return m.currentTime || 0;
        }
        return performance.now() / 1000;   // image mode / webcam
    }

    // ── State from DOM (the DepthIllusion pattern) ───────────────────────

    _readState() {
        const val = (id, def) => {
            const v = parseFloat(document.getElementById(id)?.value);
            return isFinite(v) ? v : def;
        };
        const sel = (id, def) => document.getElementById(id)?.value ?? def;
        const chk = (id) => document.getElementById(id)?.checked === true;
        const s = this.state;

        s.source = sel('ruSource', 'upload');
        s.echoDelay = val('ruEchoDelay', 1.5);
        s.bSpeed = val('ruBSpeed', 1);
        s.bMirrorH = chk('ruBMirrorH');
        s.bMirrorV = chk('ruBMirrorV');
        s.blendMode = BLEND_MODES[sel('ruBlendMode', 'replace')] ?? 0;
        s.swapLayers = chk('ruInvertLayers');

        s.layout = LAYOUTS[sel('ruLayout', 'grid')] ?? 0;
        s.cellShape = CELL_SHAPES[sel('ruCellShape', 'fill')] ?? 0;
        s.cols = Math.max(1, Math.round(val('ruCols', 3)));
        s.rows = Math.max(1, Math.round(val('ruRows', 3)));
        s.linkAspect = chk('ruLinkAspect');
        s.cellSize = val('ruCellSize', 1);
        s.gap = val('ruGap', 0);
        s.latticeRot = val('ruLatticeRot', 0);

        s.style = STYLES[sel('ruRevealStyle', 'random')] ?? 0;
        s.drive = sel('ruDrive', 'auto');
        s.threshold = val('ruThreshold', 0.35);
        s.hold = val('ruHold', 0.4);
        s.amount = val('ruAmount', 0.5);
        s.rate = val('ruRate', 1);
        s.cycle = sel('ruCycle', 'build_collapse');
        s.audioBand = sel('ruAudioBand', 'bass');
        s.audioSens = val('ruAudioSens', 1);
        s.beatSnap = chk('ruBeatSnap');
        s.transition = val('ruTransition', 0);
        s.sweepDir = SWEEP_DIRS[sel('ruSweepDir', 'lr')] ?? 0;
        s.focalX = val('ruFocalX', 0.5);
        s.focalY = val('ruFocalY', 0.5);
        s.noiseScale = val('ruNoiseScale', 3);
        s.noiseDrift = val('ruNoiseDrift', 0.3);
        s.gestureRadius = val('ruGestureRadius', 0.3);
        s.invertReveal = chk('ruInvertReveal');

        s.colorMode = COLOR_MODES[sel('ruColorMode', 'normal')] ?? 0;
        s.customColor = sel('ruCustomColor', '#ff00ff');
        s.colorTarget = COLOR_TARGETS[sel('ruColorTarget', 'revealed')] ?? 0;
        s.colorMix = val('ruColorMix', 1);

        s.pop = val('ruPop', 0);
        s.offset = val('ruOffset', 0);
        s.offsetGesture = chk('ruOffsetGesture');
        s.hueJitter = val('ruHueJitter', 0);

        s.gridOn = document.getElementById('ruGridEnabled')?.checked !== false;
        s.gridColor = sel('ruGridColor', '#ffffff');
        s.gridWidth = val('ruGridWidth', 1.5);
        s.gridOpacity = val('ruGridOpacity', 0.45);
        s.gapFill = GAP_FILLS[sel('ruGapFill', 'layer1')] ?? 0;
        s.gapColor = sel('ruGapColor', '#000000');
    }

    // ── Driver ───────────────────────────────────────────────────────────
    // One 0..1 scalar the shader compares every tile's rank against. Auto ramps
    // it on media time, Audio maps it from a band envelope, Manual reads the
    // slider. Beat Snap quantises whichever of those into steps on detected
    // beats instead of a continuous sweep.
    _advanceDrive(s, audioFeatures, dt, advance) {
        const lvl = audioFeatures
            ? ({
                bass: audioFeatures.bass, mid: audioFeatures.mid,
                treble: audioFeatures.treble, volume: audioFeatures.vol
            }[s.audioBand] || 0)
            : 0;
        // Only the ACCUMULATORS are gated on a new displayed frame — the audio
        // envelope and the beat edge would otherwise step several times for one
        // frame under GestureEngine multi-finger. The returned value is still
        // recomputed every call, so dragging the Manual slider while paused
        // updates the picture immediately.
        if (advance) {
            // Frame-rate-independent EMA: the same time constant at any fps.
            const kEnv = 1 - Math.exp(-dt / 0.2);
            this._audioEnv += (lvl - this._audioEnv) * kEnv;
        }

        let target;
        if (s.drive === 'manual') {
            target = s.amount;
        } else if (s.drive === 'audio') {
            target = Math.min(1, this._audioEnv * s.audioSens);
        } else {
            // Auto — a ramp on media time, shaped by the cycle mode.
            if (s.cycle === 'hold') {
                this._reveal = s.amount;
                return s.amount;
            }
            const period = 1 / Math.max(s.rate, 0.01);
            const phase = (this._time / Math.max(period * 2, 1e-3)) % 1;
            if (s.cycle === 'build') {
                target = (this._time / Math.max(period, 1e-3)) % 1;
            } else if (s.cycle === 'pingpong') {
                target = 1 - Math.abs(phase * 2 - 1);
            } else {   // build_collapse — build fast, collapse fast, brief hold at each end
                target = Math.min(1, Math.max(0, 1 - Math.abs(phase * 2 - 1) * 1.15));
            }
        }

        if (s.beatSnap) {
            // Rising edge against the smoothed envelope, with a cooldown — the
            // same shape SplitScreen._dynamics uses for shape cycling.
            if (advance) {
                const hot = lvl > Math.max(0.25, this._audioEnv * 1.35);
                if (hot && !this._beatHot && this._time - this._lastBeat > 0.12) {
                    this._lastBeat = this._time;
                    this._beatReveal = target;
                }
                this._beatHot = hot;
            }
            this._reveal = this._beatReveal;
        } else {
            this._reveal = target;
        }
        return Math.min(1, Math.max(0, this._reveal));
    }

    // ── Layer 2 sources ──────────────────────────────────────────────────

    // Frozen frame — one held snapshot of Layer 1, captured on demand.
    _captureFreeze(gl, media, cropA) {
        if (!this._freezeTex) this._freezeTex = this._makeTex(gl);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this._freezeTex);
        try {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, media);
            this._freezeCrop = cropA.slice();
            this._freezeArmed = false;
        } catch (_e) { /* stay armed, try again next frame */ }
    }

    // Time echo — a small ring of downscaled snapshots of Layer 1. Full-res
    // slots would be ~8 MB each at 1080p; the ring is capped in both dimensions
    // and slot count so a 3 s echo stays around 33 MB.
    _ensureEcho(gl, tw, th) {
        const scale = Math.min(1, ECHO_MAX_W / tw, ECHO_MAX_H / th);
        const w = Math.max(2, Math.round(tw * scale));
        const h = Math.max(2, Math.round(th * scale));
        if (this._echo && this._echo.w === w && this._echo.h === h) return this._echo;
        this._echo = {
            tex: Array.from({ length: ECHO_SLOTS }, () => this._makeTex(gl)),
            stamp: new Array(ECHO_SLOTS).fill(null),
            w, h, next: 0
        };
        if (!this._echoCanvas) {
            this._echoCanvas = document.createElement('canvas');
            this._echoCtx = this._echoCanvas.getContext('2d');
        }
        this._echoCanvas.width = w;
        this._echoCanvas.height = h;
        this._lastEchoWrite = -1e9;
        return this._echo;
    }

    _writeEcho(gl, media, crop, stamp, tw, th) {
        const ring = this._ensureEcho(gl, tw, th);
        this._echoCtx.clearRect(0, 0, ring.w, ring.h);
        try {
            this._echoCtx.drawImage(media, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, ring.w, ring.h);
        } catch (_e) { return; }
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, ring.tex[ring.next]);
        try {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this._echoCanvas);
            ring.stamp[ring.next] = stamp;
            ring.next = (ring.next + 1) % ECHO_SLOTS;
        } catch (_e) { /* skip this slot */ }
    }

    // The slot closest to (stamp − delay). Returns null until one exists.
    _pickEcho(stamp, delay) {
        const ring = this._echo;
        if (!ring) return null;
        const want = stamp - delay;
        let best = -1, bestD = Infinity;
        for (let i = 0; i < ECHO_SLOTS; i++) {
            if (ring.stamp[i] === null) continue;
            const d = Math.abs(ring.stamp[i] - want);
            if (d < bestD) { bestD = d; best = i; }
        }
        return best < 0 ? null : ring.tex[best];
    }

    // ── Render ───────────────────────────────────────────────────────────

    render(ctx, videoEngine, activeMedia, crop, audioFeatures) {
        const tw = videoEngine.targetW, th = videoEngine.targetH;
        const plainDraw = () => {
            if (activeMedia && crop) {
                try { ctx.drawImage(activeMedia, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, tw, th); } catch (_e) { }
            }
        };
        if (!this._ensureGL(tw, th)) { plainDraw(); return; }

        const gl = this._gl;
        this._readState();
        const s = this.state;
        const app = window.app;
        const st = app?.state;

        // ── Clock + advance gate ─────────────────────────────────────────
        // The effect instance is a singleton and render() can be called more
        // than once per DISPLAYED frame (GestureEngine multi-finger mode runs
        // it per box; drawFrameSingle() fires on every slider input while
        // paused). Advance the driver only when the frame stamp moved;
        // composite unconditionally.
        const offline = !!st?.isPostProcessing;
        const edge = offline && !this._wasOffline;      // export rising edge
        this._wasOffline = offline;
        if (edge) {
            this._time = 0;
            this._reveal = 0;
            this._lastStamp = null;
            this._prevValid = 0;
        }

        const stamp = this._frameStamp(app);
        const raw = (this._lastStamp === null) ? 0 : Math.abs(stamp - this._lastStamp);
        const wallClock = !offline && (st?.isImageMode || !st?.activeMedia);
        let advance = (this._lastStamp === null) || (wallClock ? raw > 0.004 : raw > 1e-6);
        const dt = Math.min(Math.max(raw || 1 / 60, 1 / 240), 0.1);

        // ── Texture A — main media, holding the last good frame ──────────
        const srcKey = activeMedia ? (activeMedia.currentSrc || activeMedia.src || activeMedia) : null;
        if (srcKey !== this._lastSrcA) {
            this._lastSrcA = srcKey;
            this._texAReady = false;
            this._lastCropA = null;
            this._freezeArmed = true;
            this._echo = null;
            this._lastEchoWrite = -1e9;
            this._prevValid = 0;
        }
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        let cropA = null;
        const aLive = this._isUploadable(activeMedia);
        // Upload only on a real new frame — a re-render of the same displayed
        // frame must not consume the previous-frame slot.
        if (aLive && (advance || !this._texAReady)) {
            const dst = this._aIdx ^ 1;
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this._texA[dst]);
            try {
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, activeMedia);
                if (!this._texAReady) this._prevValid = 0;   // nothing valid behind it yet
                this._aIdx = dst;                            // flip only on success
                cropA = this._normCrop(crop, this._mediaDims(activeMedia));
                this._texAReady = true;
                this._lastCropA = cropA;
            } catch (_e) { /* fall through to the held frame */ }
        } else if (this._texAReady) {
            cropA = this._lastCropA;
        }
        if (!cropA) {
            if (!this._texAReady || !this._lastCropA) { plainDraw(); return; }
            cropA = this._lastCropA;
        }

        if (advance) {
            this._time += dt;
            this._lastStamp = stamp;
        }
        const revealDrive = this._advanceDrive(s, audioFeatures, dt, advance);

        // ── Tier 2 state pass ────────────────────────────────────────────
        // Only On Motion and Contrast need a measurement of the video. Every
        // other style is closed form, so the FBOs, the previous-frame texture
        // and this whole pass are skipped.
        const rowsN = s.linkAspect ? Math.max(1, Math.round(s.cols * th / tw)) : s.rows;
        const gridKey = s.cols + 'x' + rowsN;
        if (gridKey !== this._lastGridKey) {
            this._lastGridKey = gridKey;
            this._prevValid = 0;      // the regions moved; last frame's means are stale
        }
        if (raw > 0.25) this._prevValid = 0;   // seek / loop / long stall
        const needsState = !this._stateFailed && this._stateProg
            && (s.style === STYLES.motion || s.style === STYLES.contrast);
        const sCols = Math.min(s.cols, STATE_SIZE);
        const sRows = Math.min(rowsN, STATE_SIZE);
        if (needsState && advance && this._texAReady) {
            // K scales with region size so a coarse lattice does not measure a
            // huge area from a handful of point samples.
            const areaPx = (tw / sCols) * (th / sRows);
            const taps = Math.max(3, Math.min(8, Math.round(Math.sqrt(areaPx) / 10)));
            gl.bindFramebuffer(gl.FRAMEBUFFER, this._stateFbo[1 - this._stateRead]);
            gl.viewport(0, 0, sCols, sRows);
            gl.useProgram(this._stateProg);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this._texA[this._aIdx]);
            gl.activeTexture(gl.TEXTURE2);
            gl.bindTexture(gl.TEXTURE_2D, this._texA[this._aIdx ^ 1]);
            gl.activeTexture(gl.TEXTURE3);
            gl.bindTexture(gl.TEXTURE_2D, this._stateTex[this._stateRead]);
            gl.uniform4fv(this._su.uCropA, cropA);
            gl.uniform2f(this._su.uGridS, sCols, sRows);
            gl.uniform1i(this._su.uTaps, taps);
            gl.uniform1f(this._su.uDt, dt);
            gl.uniform1f(this._su.uHoldTau, Math.max(s.hold, 0.02));
            gl.uniform1f(this._su.uPrevValid, this._prevValid);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            this._stateRead = 1 - this._stateRead;
            this._prevValid = 1;
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.viewport(0, 0, tw, th);
        }

        // Unit 0 must end up on the CURRENT Layer 1 texture — a failed upload
        // above leaves the wrong slot bound.
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this._texA[this._aIdx]);

        // ── Texture B — whichever Layer 2 source is selected ──────────────
        let cropB = null;
        gl.activeTexture(gl.TEXTURE1);

        if (s.source === 'upload') {
            const mediaB = this._getUploadMedia();
            if (mediaB?.tagName === 'VIDEO' && Math.abs(mediaB.playbackRate - s.bSpeed) > 0.001) {
                mediaB.playbackRate = s.bSpeed;
            }
            if (mediaB) {
                gl.bindTexture(gl.TEXTURE_2D, this._texB);
                try {
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, mediaB);
                    const dimsB = this._mediaDims(mediaB);
                    cropB = this._normCrop(this._coverCrop(dimsB.w, dimsB.h, tw, th), dimsB);
                    this._texBReady = true;
                    this._lastCropB = cropB;
                } catch (_e) { /* fall through to the held frame */ }
            }
            // Hold the last good B frame rather than snapping to the zoom
            // fallback — that swap reads as a sub-second flicker on loop seeks.
            if (!cropB && this._texBReady && this._lastCropB) {
                gl.bindTexture(gl.TEXTURE_2D, this._texB);
                cropB = this._lastCropB;
            }
        } else if (s.source === 'freeze') {
            if (this._freezeArmed && aLive) this._captureFreeze(gl, activeMedia, cropA);
            if (this._freezeCrop && this._freezeTex) {
                gl.bindTexture(gl.TEXTURE_2D, this._freezeTex);
                cropB = this._freezeCrop;
            }
        } else if (s.source === 'echo') {
            this._ensureEcho(gl, tw, th);
            const spacing = Math.max(s.echoDelay, 0.05) / ECHO_SLOTS;
            if (advance && aLive && Math.abs(stamp - this._lastEchoWrite) >= spacing) {
                this._writeEcho(gl, activeMedia, crop, stamp, tw, th);
                this._lastEchoWrite = stamp;
            }
            const tex = this._pickEcho(stamp, s.echoDelay);
            if (tex) {
                gl.bindTexture(gl.TEXTURE_2D, tex);
                // The ring already holds the cover-cropped frame, so it maps 1:1.
                cropB = [0, 0, 1, 1];
            }
        }

        // Zoom Crop, and the fallback for every other source before it has a
        // frame: re-bind A through an offset zoom so the two layers differ.
        if (!cropB) {
            gl.bindTexture(gl.TEXTURE_2D, this._texA[this._aIdx]);
            const z = 1.3;
            const w = cropA[2] / z, h = cropA[3] / z;
            cropB = [cropA[0] + (cropA[2] - w) * 0.75, cropA[1] + (cropA[3] - h) * 0.5, w, h];
        }

        // Mirror flips the sampled crop rect — zero shader cost. Copy first so
        // a held _lastCropB is never mutated.
        if (s.bMirrorH || s.bMirrorV) {
            cropB = cropB.slice();
            if (s.bMirrorH) { cropB[0] += cropB[2]; cropB[2] = -cropB[2]; }
            if (s.bMirrorV) { cropB[1] += cropB[3]; cropB[3] = -cropB[3]; }
        }

        // ── Gesture ──────────────────────────────────────────────────────
        let gxUv = 0.5, gyUv = 0.5;
        const needGesture = (s.style === STYLES.gesture) || s.offsetGesture;
        if (needGesture) {
            const track = window._prismTrack;   // published by AnamorphicCamera tracking
            if (track && typeof track.x === 'number') {
                this._gx += (track.x - this._gx) * 0.12;
                this._gy += (track.y - this._gy) * 0.12;
            }
            gxUv = 0.5 + this._gx * 0.5;
            gyUv = 0.5 + this._gy * 0.5;
        } else {
            this._gx = 0;
            this._gy = 0;
        }

        // ── Uniforms ─────────────────────────────────────────────────────
        const rows = rowsN;
        const gridRgb = this._hexToRgb(s.gridColor);
        const gapRgb = this._hexToRgb(s.gapColor);
        const customRgb = this._hexToRgb(s.customColor);
        // Transition is a duration; the shader wants a width in driver units.
        const fadeWidth = s.transition <= 0
            ? 0
            : Math.min(1, s.transition * Math.max(s.rate, 0.01));

        const u = this._u;
        gl.useProgram(this._program);
        gl.uniform4fv(u.uCropA, cropA);
        gl.uniform4fv(u.uCropB, cropB);
        gl.uniform2f(u.uRes, tw, th);
        gl.uniform1f(u.uTime, this._time);

        gl.uniform2f(u.uGrid, s.cols, rows);
        gl.uniform1i(u.uLayout, s.layout);
        gl.uniform1i(u.uCellShape, s.cellShape);
        gl.uniform1f(u.uCellSize, s.cellSize);
        gl.uniform1f(u.uGapPx, s.gap);
        gl.uniform1f(u.uLatticeRot, s.latticeRot * Math.PI / 180);

        gl.uniform1i(u.uStyle, s.style);
        gl.uniform1f(u.uReveal, revealDrive);
        gl.uniform1f(u.uFadeWidth, fadeWidth);
        gl.uniform1f(u.uInvertReveal, s.invertReveal ? 1 : 0);
        gl.uniform1i(u.uSweepDir, s.sweepDir);
        gl.uniform2f(u.uFocal, s.focalX, s.focalY);
        gl.uniform1f(u.uNoiseScale, s.noiseScale);
        gl.uniform1f(u.uNoiseDrift, s.noiseDrift);
        gl.uniform2f(u.uGestureC, gxUv, gyUv);
        gl.uniform1f(u.uGestureR, s.gestureRadius);

        gl.uniform1i(u.uColorMode, s.colorMode);
        gl.uniform3f(u.uCustomColor, customRgb[0], customRgb[1], customRgb[2]);
        gl.uniform1i(u.uColorTarget, s.colorTarget);
        gl.uniform1f(u.uColorMix, s.colorMix);
        gl.uniform1f(u.uAudioPulse, this._audioEnv);

        gl.uniform1f(u.uPop, s.pop);
        gl.uniform1f(u.uOffset, s.offset);
        gl.uniform2f(u.uOffsetGest, s.offsetGesture ? this._gx * 0.05 : 0,
                                    s.offsetGesture ? this._gy * 0.05 : 0);
        gl.uniform1f(u.uHueJitter, s.hueJitter);

        gl.uniform1f(u.uGridOn, s.gridOn ? 1 : 0);
        gl.uniform3f(u.uGridColor, gridRgb[0], gridRgb[1], gridRgb[2]);
        gl.uniform1f(u.uGridWidth, s.gridWidth);
        gl.uniform1f(u.uGridOpacity, s.gridOpacity);
        gl.uniform1i(u.uGapFill, s.gapFill);
        gl.uniform3f(u.uGapColor, gapRgb[0], gapRgb[1], gapRgb[2]);

        gl.uniform1i(u.uBlendMode, s.blendMode);
        gl.uniform1f(u.uSwapLayers, s.swapLayers ? 1 : 0);

        // Tier 2 map. Always bound — sampling an unbound sampler is undefined
        // even on the branch that never reads it.
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, this._stateTex[this._stateRead] || null);
        gl.uniform2f(u.uGridS, sCols, sRows);
        gl.uniform1f(u.uThreshold, s.threshold);

        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        ctx.drawImage(this._canvas, 0, 0, tw, th);
    }
}
