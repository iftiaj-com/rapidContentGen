/**
 * LumNetworkFX.js — "Lum Network", Video Jockey FX #2. // VJ
 * ─────────────────────────────────────────────────────────────────────────────
 * Builds generative STRUCTURE out of whatever is bright in the frame. Where
 * ScanFX sweeps a lit band THROUGH depth, this reads luminance as a field and
 * draws machine-vision / light-installation geometry over it. The two are
 * complementary and share all the same plumbing (VJPass, VJModulator's six
 * control sources, the beat clock, the depth pipeline).
 *
 * ── Two rendering families ───────────────────────────────────────────────────
 * CELL styles (0,1,2,4,5) lay a jittered grid over the frame; each cell owns one
 * node whose position is a stable hash of the cell id. ONE luminance tap at that
 * node answers two questions at once:
 *
 *   energy = smoothstep(threshold, threshold+ε, luma)   → is this node alive?
 *   depth  = graded luma                                → where in Z does it sit?
 *
 * Links run from the pixel's own cell node to its 8 neighbours, so every link is
 * rasterized by both cells it touches — the standard constellation trick, and
 * the reason a 3x3 neighbourhood costs 9 texture taps rather than 81.
 *
 * FIELD styles (3,6,7) skip the cell loop entirely and work on iso-contours of a
 * block-quantized luminance field. Quantizing the field BEFORE contouring is
 * what produces orthogonal staircase geometry instead of organic curves: a
 * piecewise-constant field can only change value at a block boundary, so its
 * iso-lines are forced to run along block edges. Drawing several iso-levels at
 * once gives parallel bundles that hug the subject's silhouette — the PCB
 * bus-routing read, obtained analytically with no routing algorithm.
 *
 * ── Growth wave ──────────────────────────────────────────────────────────────
 * `progress` sweeps through depth. Geometry lights hard as the wave crosses it
 * and settles to a held level once the wave has passed, so the frame reads as
 * ASSEMBLING rather than blinking on. Every style is gated by it.
 *
 *   wave = 1 - smoothstep(0, bandWidth, abs(depth - progress))
 *   held = smoothstep(-bandWidth, bandWidth*0.6, progress - depth)
 *
 * ── Eight topologies (`style`) ───────────────────────────────────────────────
 *   0 Constellation  node dots + straight links to neighbours
 *   1 Light Stalks   ground-rooted stems with ring tips and side rays
 *   2 Bloom Nodes    radial bursts of rays with a lit dot at every tip
 *   3 Circuit        multi-lane Manhattan bundles following iso-luminance
 *   4 Detection HUD  hollow bounding boxes + numeric labels + links
 *   5 Mesh Weave     dense triangulated lattice + solid silhouette contour
 *   6 Thermal Blocks quantized cells on a spectrum ramp + accent boundary
 *   7 Dash Contour   broken silhouette outline + sparse directional glyphs
 *
 * Styles 4/5/7 render NUMBERS and CONTOURS, which need two things Adits had no
 * precedent for:
 *
 *   Digits — a 3x5 bitmap font packed as 15-bit masks (one int per glyph) and
 *            unpacked with integer bit ops. Deliberately unfiltered: crisp
 *            single-pixel type is the HUD aesthetic, and glyph size is pinned to
 *            gPxq so one font pixel stays ~2 screen pixels at ANY output res.
 *   Contour — analytic distance to the threshold iso-line via screen-space
 *            derivatives, `d_px = f / length(vec2(dFdx(f), dFdy(f)))`, giving an
 *            exactly N-pixel-wide outline regardless of how steep the gradient
 *            is. Far cheaper and cleaner than marching or thresholding a blur.
 *
 * ── Three deliberate departures from the reference plan ──────────────────────
 * NO FRAME FEEDBACK for trails. VJPass renders to the default framebuffer with
 * `preserveDrawingBuffer: false`; real feedback needs a ping-pong FBO plus a
 * second full-frame upload every frame, and it would render *differently* during
 * Adits' offline post-process pass, which re-renders frames out of realtime.
 *
 * NO RECOMPUTED NORMALS / virtual stage lights. That is a mesh-pipeline idea;
 * there is no geometry here, and a screen-space fake costs more than it returns.
 *
 * NO AIRBORNE MOTES. A procedural mote layer was built and cut: sized in cell
 * units, each capsule spanned several cells, so at any usable density they tiled
 * into continuous streaks that blanketed the frame instead of reading as
 * discrete specks. If motes are ever wanted back, they need to be sized in
 * PIXELS against a screen-space grid, not in the network's cell space.
 *
 * Depth policy is inherited unchanged: luminance is the only always-on path, and
 * the uploaded map / MediaPipe subject layer stay opt-in and free while off.
 *
 * NOTE: this file embeds a GLSL template literal — it is excluded from the prod
 * obfuscator in vite.config.mjs (same as ScanFX.js / VJPass.js).
 */

import { SHAKE_UNIFORM_NAMES, SHAKE_UNIFORMS, SHAKE_FUNCTIONS, setShakeUniforms } from './vj-shake.js';

const FRAG_SRC = /* glsl */`#version 300 es
precision highp float;

in vec2 vUv;
out vec4 outColor;

uniform sampler2D uTex;        // unit 0 — the already-composited frame
uniform sampler2D uDepthTex;   // unit 1 — uploaded depth map (opt-in)
uniform sampler2D uMatteTex;   // unit 2 — MediaPipe subject matte (opt-in)

uniform vec2  uRes;
uniform float uAspect;

// ── Driven channels (VJModulator) ────────────────────────────────────────────
uniform float uProgress;       // growth wave position through depth
uniform float uBand;           // growth wave half-width, in depth units
uniform float uIntensity;      // gain before the screen blend
uniform float uDensity;        // grid resolution
uniform float uDim;            // base-image dim

// ── Static params (UI) ───────────────────────────────────────────────────────
uniform float uThreshold;      // luminance gate — the silhouette level
uniform float uLinkRange;      // links: reach · bus: lane gap · blocks: n/a
uniform float uNodeSize;       // glyph scale + stroke width
uniform float uGlow;           // halo + bloom off bright source areas
uniform float uParallax;       // depth-scaled UV displacement
uniform int   uStyle;          // 0..7, see header
uniform int   uLabel;          // 0 off, 1 tag(2), 2 id(5), 3 float(d.dddd)
uniform vec3  uTint;           // primary color
uniform vec3  uAccent;         // labels / accent lanes / contours / boundaries
uniform vec2  uPointer;        // -1..1

// ── Depth ────────────────────────────────────────────────────────────────────
uniform int   uDepthMode;      // 0 luminance, 1 uploaded map
uniform float uDepthSoften;    // luminance blur radius (px)
uniform float uDepthContrast;
uniform float uDepthInvert;    // 0/1
uniform float uUseMatte;       // 0/1
uniform float uSubject;
${SHAKE_UNIFORMS}
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
${SHAKE_FUNCTIONS}

/* Cell-space constants, resolved once in main(). Cell space is
   uv * vec2(aspect, 1) * N, so cells are SQUARE — which makes gPxq isotropic
   and lets every stroke width be expressed in pixels regardless of output res. */
float gN;      // cells across the aspect-corrected frame
float gPxq;    // cell-space units per screen pixel
float gLineW;  // stroke half-width, cell units
float gNodeR;  // node radius, cell units

float luma(vec2 uv) { return dot(texture(uTex, uv).rgb, LUMA); }

float hash21(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
}

float sdSeg(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / max(1e-6, dot(ba, ba)), 0.0, 1.0);
    return length(pa - ba * h);
}

/** Signed distance to an axis-aligned box of half-extent b, centred on origin. */
float sdBox(vec2 p, vec2 b) {
    vec2 d = abs(p) - b;
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

/** Antialiased stroke in CELL units — one pixel of feather either side. */
float stroke(float d, float halfW) {
    return 1.0 - smoothstep(halfW - gPxq, halfW + gPxq, d);
}

/** Antialiased stroke in PIXEL units, for the field styles. */
float strokePx(float dpx, float halfW) {
    return 1.0 - smoothstep(halfW - 1.0, halfW + 1.0, abs(dpx));
}

// ── 3x5 bitmap digits ────────────────────────────────────────────────────────
// Rows packed MSB-first: r0<<12 | r1<<9 | r2<<6 | r3<<3 | r4, leftmost pixel of
// each row in that row's high bit. 15 bits per glyph, one int, no texture.
int digitMask(int d) {
    if (d <= 0) return 31599;   // 0
    if (d == 1) return 11415;
    if (d == 2) return 29671;
    if (d == 3) return 29647;
    if (d == 4) return 23497;
    if (d == 5) return 31183;
    if (d == 6) return 31215;
    if (d == 7) return 29257;
    if (d == 8) return 31727;
    return 31695;               // 9
}

/** p is glyph-local, 0..1 across the 3x5 grid. Unfiltered on purpose. */
float digitPx(vec2 p, int d) {
    if (p.x < 0.0 || p.x >= 1.0 || p.y < 0.0 || p.y >= 1.0) return 0.0;
    int col = int(p.x * 3.0);
    int row = int(p.y * 5.0);
    int bit = (4 - row) * 3 + (2 - col);
    return float((digitMask(d) >> bit) & 1);
}

/** Render "count" digits of "value" from "org" (top-left) at glyph size "sz".
 *  dotAfter >= 0 inserts a decimal point after that glyph index. */
float numberAt(vec2 q, vec2 org, vec2 sz, int value, int count, int dotAfter) {
    float acc = 0.0;
    float x = 0.0;
    int div = 1;
    for (int k = 1; k < 8; k++) { if (k < count) div *= 10; }
    for (int k = 0; k < 8; k++) {
        if (k >= count) break;
        int d = (value / div) - (value / (div * 10)) * 10;
        acc = max(acc, digitPx((q - org - vec2(x, 0.0)) / sz, d));
        x += sz.x * 1.35;
        div = max(1, div / 10);
        if (k == dotAfter) {
            vec2 dp = (q - org - vec2(x, sz.y * 0.8)) / (sz / vec2(3.0, 5.0));
            if (dp.x >= 0.0 && dp.x < 1.0 && dp.y >= 0.0 && dp.y < 1.0) acc = 1.0;
            x += sz.x * 0.62;
        }
    }
    return acc;
}

// ── Depth ────────────────────────────────────────────────────────────────────

float grade(float d, vec2 uv) {
    d = clamp((d - 0.5) * uDepthContrast + 0.5, 0.0, 1.0);
    d = mix(d, 1.0 - d, uDepthInvert);
    if (uUseMatte > 0.5) {
        float m = texture(uMatteTex, uv).a;
        d = mix(d, 1.0, m * uSubject);
    }
    return d;
}

/** Softened plate depth — 9 taps, used ONCE per pixel for the base parallax. */
float plateDepth(vec2 uv) {
    float d;
    if (uDepthMode == 1) {
        d = texture(uDepthTex, uv).r;
    } else {
        vec2 r = vec2(uDepthSoften) / uRes;
        float s = luma(uv);
        s += luma(uv + vec2( r.x, 0.0));
        s += luma(uv + vec2(-r.x, 0.0));
        s += luma(uv + vec2( 0.0,  r.y));
        s += luma(uv + vec2( 0.0, -r.y));
        s += luma(uv + r);
        s += luma(uv - r);
        s += luma(uv + vec2( r.x, -r.y));
        s += luma(uv + vec2(-r.x,  r.y));
        d = s / 9.0;
    }
    return grade(d, uv);
}

/** Single-tap probe for a node: .x = raw luminance, .y = graded depth.
 *  Deliberately NOT the 9-tap version — 9 nodes x 9 taps would be 81 taps. */
vec2 probe(vec2 uv) {
    float l = luma(uv);
    float d = (uDepthMode == 1) ? texture(uDepthTex, uv).r : l;
    return vec2(l, grade(d, uv));
}

/** 5-tap softened luminance — the field the contour styles trace. Blurring
 *  first is what stops video noise from shredding the outline. */
float softLuma(vec2 uv) {
    vec2 r = vec2(uDepthSoften + 1.0) / uRes;
    float s = luma(uv) * 2.0;
    s += luma(uv + vec2(r.x, 0.0));
    s += luma(uv - vec2(r.x, 0.0));
    s += luma(uv + vec2(0.0, r.y));
    s += luma(uv - vec2(0.0, r.y));
    return s / 6.0;
}

/** Mean luminance of one quantized block — 4 taps inside it. The quantization
 *  is the whole point: a piecewise-constant field has axis-aligned iso-lines. */
float blockLuma(vec2 bc, float bn) {
    vec2 inv = 1.0 / (bn * vec2(uAspect, 1.0));
    float s  = luma((bc + vec2(0.3, 0.3)) * inv);
    s += luma((bc + vec2(0.7, 0.3)) * inv);
    s += luma((bc + vec2(0.3, 0.7)) * inv);
    s += luma((bc + vec2(0.7, 0.7)) * inv);
    return s * 0.25;
}

/** Growth response: a hard pulse as the wave crosses, settling to a held level
 *  behind it so the structure stays assembled. */
float lit(float d) {
    float b = max(0.008, uBand);
    float wave = 1.0 - smoothstep(0.0, b, abs(d - uProgress));
    float held = smoothstep(-b, b * 0.6, uProgress - d);
    return held * 0.5 + wave;
}

/** Blue → cyan → green → yellow → red, for Thermal Blocks. */
vec3 ramp(float t) {
    t = clamp(t, 0.0, 1.0);
    return clamp(vec3(
        smoothstep(0.45, 0.85, t),
        smoothstep(0.15, 0.55, t) - smoothstep(0.70, 1.0, t) * 0.9,
        1.0 - smoothstep(0.05, 0.45, t)
    ), 0.0, 1.0);
}

vec2 cellToUv(vec2 c) { return c / (gN * vec2(uAspect, 1.0)); }
vec2 nodeOf(vec2 c)   { return c + 0.5 + (hash22(c) - 0.5) * 0.62; }

/** Node glyph — dot, hollow ring, or square pad depending on topology. */
float nodeGlyph(vec2 q, vec2 n) {
    float d = length(q - n);
    if (uStyle == 1) return stroke(abs(d - gNodeR), gLineW);   // hollow ring tip
    return stroke(d, gNodeR);
}

// ═══ FIELD STYLE 3 — Circuit ═════════════════════════════════════════════════
// Ten iso-levels of the block-quantized field at once. Each level can only turn
// at a block boundary, so every trace is an orthogonal staircase, and levels
// that differ slightly run parallel — a routed-looking bundle that hugs the
// silhouette, with zero routing logic.
//
// LANE SPACING IS GRADIENT-NORMALIZED, and that is the whole trick. Spacing the
// levels by a fixed LUMINANCE step works on a soft ramp and fails completely on
// a hard silhouette (a figure against black): every level lands on the same
// block boundary and the bundle collapses into one fat line. Converting a
// spacing expressed in BLOCKS into a luminance step via the local gradient —
// step = |grad| * spacing — keeps lanes a constant DISTANCE apart no matter how
// abrupt the edge is, which is what makes a real bundle appear on real footage.
//
// Lane colour is two-tone by construction: accent lanes are hash-picked (~1 in
// 4, irregular like the reference rather than every Nth), and the rest ride the
// tint at hash-varied brightness, which is where the white/grey mix comes from.
vec3 busPass(vec2 uv) {
    float bn  = mix(40.0, 150.0, uDensity);
    vec2  bq  = uv * vec2(uAspect, 1.0) * bn;
    vec2  bc  = floor(bq);
    vec2  f   = bq - bc;
    float bpx = uRes.y / bn;

    float lC = blockLuma(bc, bn);
    float lL = blockLuma(bc + vec2(-1.0,  0.0), bn);
    float lR = blockLuma(bc + vec2( 1.0,  0.0), bn);
    float lU = blockLuma(bc + vec2( 0.0, -1.0), bn);
    float lD = blockLuma(bc + vec2( 0.0,  1.0), bn);

    // Luminance change per block, from the samples already in hand.
    vec2  grd = vec2(lR - lL, lD - lU) * 0.5;
    float gm  = max(2e-4, length(grd));
    // Clamped so a near-flat region can't spread lanes across the whole tonal
    // range, and a razor edge can't fuse them.
    float gap = clamp(gm * mix(0.7, 3.2, uLinkRange), 0.0015, 0.12);

    float hw = mix(0.5, 3.0, uNodeSize);

    float lane = 0.0, acc = 0.0;
    for (int k = 0; k < 10; k++) {
        float fk = float(k);
        float lv = uThreshold + (fk - 4.5) * gap;
        bool  c  = lC >= lv;
        float s  = 0.0;
        // A boundary is drawn from BOTH sides, each covering its own half —
        // together they form one stroke centred on the block edge.
        if (c != (lL >= lv)) s = max(s, strokePx(f.x * bpx, hw));
        if (c != (lR >= lv)) s = max(s, strokePx((1.0 - f.x) * bpx, hw));
        if (c != (lU >= lv)) s = max(s, strokePx(f.y * bpx, hw));
        if (c != (lD >= lv)) s = max(s, strokePx((1.0 - f.y) * bpx, hw));

        if (hash21(vec2(fk, 3.0)) > 0.74) acc = max(acc, s);
        else lane = max(lane, s * mix(0.30, 1.0, hash21(vec2(fk, 9.0))));
    }
    return uTint * lane + uAccent * acc * 1.25;
}

// ═══ FIELD STYLE 6 — Thermal Blocks ══════════════════════════════════════════
vec3 blockPass(vec2 uv) {
    float bn  = mix(18.0, 74.0, uDensity);
    vec2  bq  = uv * vec2(uAspect, 1.0) * bn;
    vec2  bc  = floor(bq);
    vec2  f   = bq - bc;

    float lC = blockLuma(bc, bn);
    if (lC < uThreshold) return vec3(0.0);

    float lL = blockLuma(bc + vec2(-1.0,  0.0), bn);
    float lR = blockLuma(bc + vec2( 1.0,  0.0), bn);
    float lU = blockLuma(bc + vec2( 0.0, -1.0), bn);
    float lD = blockLuma(bc + vec2( 0.0,  1.0), bn);

    float inset = mix(0.05, 0.26, uNodeSize);
    vec2  p = f - 0.5;
    float box = sdBox(p, vec2(0.5 - inset));
    float fill = 1.0 - smoothstep(-0.02, 0.02, box);

    bool edge = (lL < uThreshold) || (lR < uThreshold)
             || (lU < uThreshold) || (lD < uThreshold);

    if (edge) {
        // Silhouette blocks read as hollow accent squares.
        return uAccent * (1.0 - smoothstep(0.02, 0.05, abs(box))) * 1.2;
    }

    float t = clamp((lC - uThreshold) / max(0.05, 1.0 - uThreshold), 0.0, 1.0);
    // Hash-selected blocks get an X punched OUT of the fill — the screen blend
    // can only add, so the mark has to be a hole rather than dark ink.
    float x = 0.0;
    if (hash21(bc + 3.7) < 0.22) {
        float a = min(abs(p.x - p.y), abs(p.x + p.y));
        x = 1.0 - smoothstep(0.03, 0.055, a);
    }
    return ramp(t) * fill * (1.0 - x);
}

// ═══ FIELD STYLE 7 — Dash Contour ════════════════════════════════════════════
vec3 tracePass(vec2 uv) {
    float sig = softLuma(uv) - uThreshold;
    // Analytic pixel distance to the iso-line: exact width at any gradient.
    float dpx = sig / max(1e-5, length(vec2(dFdx(sig), dFdy(sig))));
    float line = strokePx(dpx, mix(0.5, 2.0, uNodeSize));

    // Irregular per-cell gating breaks the outline into dashes in EVERY
    // direction; a stripe field would vanish on contours parallel to it.
    float dn = mix(70.0, 300.0, uLinkRange);
    float dash = step(0.42, hash21(floor(uv * vec2(uAspect, 1.0) * dn)));

    vec3 col = uAccent * line * dash * 1.25;

    // Sparse directional glyphs inside the silhouette.
    vec2 gq = uv * vec2(uAspect, 1.0) * gN;
    vec2 gc = floor(gq);
    vec2 h  = hash22(gc + 7.13);
    // Sampled OUTSIDE the branch — an implicit-LOD fetch in divergent flow is
    // undefined behaviour even when, as here, the texture has no mip chain.
    float cellLum = luma(cellToUv(gc + 0.5));
    if (h.x < 0.34 && cellLum > uThreshold) {
        float a = h.y * 6.2831853;
        vec2 dir = vec2(cos(a), sin(a));
        vec2 per = vec2(-dir.y, dir.x);
        vec2 c = gc + 0.5;
        float len = 0.26;
        float g = stroke(sdSeg(gq, c, c + (dir + per) * 0.7 * len), gLineW * 0.9);
        g = max(g, stroke(sdSeg(gq, c, c + (dir - per) * 0.7 * len), gLineW * 0.9));
        col += uTint * g * 0.8;
    }
    return col;
}

void main() {
    gN     = mix(9.0, 44.0, uDensity);
    gPxq   = (uAspect * gN) / max(1.0, uRes.x);
    gNodeR = mix(0.030, 0.150, uNodeSize);
    gLineW = mix(0.6, 2.0, uNodeSize) * gPxq;

    vec2 uv = vUv;
    float pd = plateDepth(uv);

    // Depth-scaled displacement of the plate, matched by the geometry below so
    // the two separate naturally instead of sliding as one flat layer. Shake
    // layers under it and is deliberately NOT matched by the geometry — the
    // network stays locked while the plate throws around behind it.
    vec2 mUv = clamp(shakeUv(uv, pd) + pd * uPointer * uParallax, 0.0, 1.0);
    vec3 base = texture(uTex, mUv).rgb * uDim;

    float waveHere = clamp(lit(pd), 0.0, 1.4);
    vec3 mask = vec3(0.0);

    if (uStyle == 3)      mask = busPass(uv)   * waveHere;
    else if (uStyle == 6) mask = blockPass(uv) * waveHere;
    else if (uStyle == 7) mask = tracePass(uv) * waveHere;
    else {
        // ── CELL styles: 0 constellation, 1 stalks, 2 bloom, 4 hud, 5 mesh ──
        vec2 q = uv * vec2(uAspect, 1.0) * gN;
        vec2 cell = floor(q);
        vec2 parQ = uPointer * (uParallax * gN) * vec2(uAspect, 1.0);

        float range = mix(0.85, 2.05, uLinkRange);
        bool wantLinks = uLinkRange > 0.02 && (uStyle == 0 || uStyle == 4 || uStyle == 5);

        // The pixel's own node — the anchor every link in this cell radiates from.
        vec2  cq  = nodeOf(cell);
        vec2  cpr = probe(cellToUv(cq));
        float ce  = smoothstep(uThreshold, uThreshold + 0.18, cpr.x);
        float cL  = max(0.0, lit(cpr.y));
        vec2  cp  = cq + cpr.y * parQ;

        float net  = 0.0;   // links / stems / rays / box strokes
        float dots = 0.0;   // node glyphs and ray tips
        float halo = 0.0;   // wide falloff around live nodes
        float text = 0.0;   // numeric labels

        vec2 glyphSz = vec2(6.0, 10.0) * gPxq;

        for (int j = -1; j <= 1; j++) {
            for (int i = -1; i <= 1; i++) {
                vec2 c = cell + vec2(float(i), float(j));
                vec2 nq = nodeOf(c);
                vec2 pr = probe(cellToUv(nq));

                float e = smoothstep(uThreshold, uThreshold + 0.18, pr.x);
                if (e <= 0.002) continue;
                float L = lit(pr.y);
                if (L <= 0.002) continue;

                vec2 n = nq + pr.y * parQ;
                float w = e * min(L, 1.4);
                float grow = clamp(L * 1.25, 0.0, 1.0);
                vec2 h2 = hash22(c + 19.3);

                if (uStyle == 4) {
                    // ── Detection HUD: hollow box, sometimes filled, + label.
                    // Max half-extent (0.58 * 1.9) + node jitter (0.31) stays
                    // under 1.5 cells, so a box can never outgrow the 3x3
                    // neighbourhood and render with clipped edges.
                    vec2 hb = vec2(0.16 + 0.42 * h2.x, 0.13 + 0.34 * h2.y)
                            * mix(0.50, 1.90, uNodeSize) * grow;
                    float bd = sdBox(q - n, hb);
                    net += stroke(abs(bd), gLineW) * w;
                    // Independent hash for the fill gate — reusing h2.x would
                    // make "filled" and "wide" the same property.
                    if (hash21(c + 5.17) > 0.72) {
                        dots += (1.0 - smoothstep(-gPxq, gPxq, bd)) * w * 0.55;
                    }

                    if (uLabel > 0) {
                        int count  = uLabel == 1 ? 2 : 5;
                        int dotIdx = uLabel == 3 ? 0 : -1;
                        int value  = uLabel == 1 ? int(hash21(c) * 99.0)
                                                 : int(hash21(c) * 89999.0) + 10000;
                        vec2 org = n - hb - vec2(0.0, glyphSz.y * 1.5);
                        float wide = glyphSz.x * (float(count) * 1.4 + 1.0);
                        // Cheap bbox reject — without it every pixel would run
                        // the digit loop for all nine neighbours.
                        if (q.x > org.x && q.x < org.x + wide &&
                            q.y > org.y && q.y < org.y + glyphSz.y) {
                            text += numberAt(q, org, glyphSz, value, count, dotIdx) * w;
                        }
                    }
                } else if (uStyle == 1) {
                    // ── Light Stalks: stem rooted below the cell, plus side rays.
                    vec2 root = vec2(n.x, c.y + 1.0 + h2.x * 0.45);
                    vec2 tip  = mix(root, n, grow);
                    net += stroke(sdSeg(q, root, tip), gLineW) * w;

                    float rayLen = (0.18 + h2.y * 0.22) * grow;
                    for (int k = 0; k < 2; k++) {
                        float a = (float(k) * 2.0 - 1.0) * (0.5 + h2.y * 0.7);
                        vec2 end = tip + vec2(sin(a), -cos(a)) * rayLen;
                        net  += stroke(sdSeg(q, tip, end), gLineW * 0.8) * w * 0.85;
                        dots += stroke(length(q - end), gNodeR * 0.35) * w;
                    }
                } else if (uStyle == 2) {
                    // ── Bloom Nodes: radial burst, a lit dot at every ray tip.
                    for (int k = 0; k < 4; k++) {
                        float fk = float(k);
                        float a = hash21(c + fk * 7.31) * 6.2831853;
                        float len = (0.20 + 0.34 * hash21(c + fk * 3.17)) * grow;
                        vec2 end = n + vec2(cos(a), sin(a)) * len;
                        net  += stroke(sdSeg(q, n, end), gLineW * 0.85) * w;
                        dots += stroke(length(q - end), gNodeR * 0.4) * w;
                    }
                } else {
                    dots += nodeGlyph(q, n) * w;
                }

                if (uStyle != 4 && uGlow > 0.0) {
                    halo += exp(-length(q - n) * 3.4) * w * uGlow;
                }

                // ── Links (constellation / hud / mesh) ────────────────────────
                if (wantLinks && ce > 0.002 && cL > 0.002 && (i != 0 || j != 0)) {
                    float dist = length(n - cp);
                    if (dist > range) continue;
                    float fall = 1.0 - smoothstep(range * 0.55, range, dist);
                    float lw = ce * e * min(min(cL, L), 1.2) * fall;
                    float g2 = clamp(min(cL, L) * 1.3, 0.0, 1.0);
                    // Mesh weaves every neighbour thinly; HUD links stay faint so
                    // the boxes keep priority.
                    float thin = uStyle == 5 ? 0.7 : (uStyle == 4 ? 0.55 : 1.0);
                    net += stroke(sdSeg(q, cp, mix(cp, n, g2)), gLineW * thin)
                         * lw * (uStyle == 4 ? 0.5 : 1.0);
                }
            }
        }

        mask = uTint * clamp(net + dots, 0.0, 2.5) * uIntensity
             + uTint * halo
             + uAccent * text * 1.35;

        // Mesh Weave finishes with a solid silhouette outline.
        if (uStyle == 5) {
            float sig = softLuma(uv) - uThreshold;
            float dpx = sig / max(1e-5, length(vec2(dFdx(sig), dFdy(sig))));
            mask += uAccent * strokePx(dpx, mix(0.6, 2.2, uNodeSize)) * waveHere * 1.2;
        }
    }

    // Soft bloom off whatever is genuinely bright in the plate — this is what
    // sells the "the light source itself is glowing" read.
    // max() guards the degenerate smoothstep(1.0, 1.0, x) at full threshold.
    float bloom = smoothstep(uThreshold, max(uThreshold + 0.02, 1.0), luma(mUv)) * uGlow;
    mask += uTint * bloom;

    // Screen blend — same composition as ScanFX, so the two FX layer identically.
    vec3 final = 1.0 - (1.0 - base) * (1.0 - clamp(mask, 0.0, 1.0));
    outColor = vec4(final, 1.0);
}`;

const UNIFORM_NAMES = [
    'uTex', 'uDepthTex', 'uMatteTex', 'uRes', 'uAspect',
    'uProgress', 'uBand', 'uIntensity', 'uDensity', 'uDim',
    'uThreshold', 'uLinkRange', 'uNodeSize', 'uGlow', 'uParallax',
    'uStyle', 'uLabel', 'uTint', 'uAccent', 'uPointer', ...SHAKE_UNIFORM_NAMES,
    'uDepthMode', 'uDepthSoften', 'uDepthContrast', 'uDepthInvert', 'uUseMatte', 'uSubject',
];

/** 0..1 channel value → real shader units. */
const lerp = (a, b, t) => a + (b - a) * t;

export class LumNetworkFX {
    static KEY = 'lumnet';
    static LABEL = 'Lum Network';

    /** Same five channel KEYS as ScanFX on purpose: the deck's channel sliders
     *  and every learned MIDI binding survive an FX switch untouched. Only the
     *  LABELS differ, and the deck re-texts the UI from this table. */
    static CHANNELS = [
        { key: 'progress',  label: 'Growth Wave',  defaults: { source: 'auto', shape: 'ease', rate: 0.16, band: 'bass', axis: 'y' } },
        { key: 'intensity', label: 'Network Glow', defaults: { source: 'manual', manual: 0.62, band: 'vol',    axis: 'radius' } },
        { key: 'band',      label: 'Wave Width',   defaults: { source: 'manual', manual: 0.34, band: 'bass',   axis: 'y' } },
        { key: 'tiling',    label: 'Grid Density', defaults: { source: 'manual', manual: 0.45, band: 'treble', axis: 'x' } },
        { key: 'dim',       label: 'Base Dim',     defaults: { source: 'manual', manual: 0.80, band: 'vol',    axis: 'y' } },
    ];

    /** Drives the Style dropdown — the deck builds the options from this. */
    static STYLES = [
        { value: 0, label: 'Constellation' },
        { value: 1, label: 'Light Stalks' },
        { value: 2, label: 'Bloom Nodes' },
        { value: 3, label: 'Circuit' },
        { value: 4, label: 'Detection HUD' },
        { value: 5, label: 'Mesh Weave' },
        { value: 6, label: 'Thermal Blocks' },
        { value: 7, label: 'Dash Contour' },
    ];

    /** Drives the Labels dropdown (Detection HUD only). */
    static LABELS = [
        { value: 0, label: 'Off' },
        { value: 1, label: 'Tag (2-digit)' },
        { value: 2, label: 'Track ID (5-digit)' },
        { value: 3, label: 'Readout (0.0000)' },
    ];

    /** Declarative UI — VJDeck builds, binds and writes these with no
     *  FX-specific code. See VJDeck's PARAM DESCRIPTORS section. */
    static PARAMS = [
        { key: 'style', type: 'select', label: 'Style',   options: LumNetworkFX.STYLES, default: 0, cols: 2 },
        { key: 'tint',  type: 'color',  label: 'Network', default: '#eaf7ff', cols: 2 },
        { key: 'accent', type: 'color', label: 'Accent',  default: '#7dff2f', cols: 2 },
        // Numeric labels only exist on Detection HUD — showing the selector for
        // the other seven topologies would be a control that silently does nothing.
        { key: 'label', type: 'select', label: 'Labels',  options: LumNetworkFX.LABELS, default: 0, cols: 2,
          showIf: (p) => (p.style ?? 0) === 4 },
        { key: 'nodeSize',  type: 'range', label: 'Node Size', min: 0, max: 1, step: 0.01, default: 0.34, digits: 2 },
        { key: 'threshold', type: 'range', label: 'Threshold', min: 0, max: 1, step: 0.01, default: 0.40, digits: 2,
          hint: 'How bright the frame must be before a node grows there.' },
        { key: 'linkRange', type: 'range', label: 'Link Range', min: 0, max: 1, step: 0.01, default: 0.50, digits: 2 },
    ];

    static RANDOM = {
        style: [0, 1, 2, 3, 4, 5, 6, 7],
        tint: ['#7fe9ff', '#eaf7ff', '#39ff9e', '#ffd27a', '#b98bff', '#ff5ecd', '#ffffff'],
        accent: ['#7dff2f', '#ffb37a', '#6aa9ff', '#35d6ff', '#ff2fd0', '#ffffff'],
        label: [0, 1, 2, 3],
        ranges: { glow: [0.08, 0.28], threshold: [0.34, 0.54], linkRange: [0.35, 0.85] },
        channels: { band: [0.24, 0.58], tiling: [0.30, 0.65] },
        shapes: ['ramp', 'ease', 'sine', 'pingpong'],
        // Slower than Scan's on purpose — a network that assembles reads badly
        // above roughly a 3-second cycle.
        rates: [0.09, 0.13, 0.18, 0.24, 0.32],
        /** Labels only mean anything on Detection HUD, so they are forced off
         *  everywhere else rather than randomized into a dead param. */
        after: (params) => { if (params.style !== 4) params.label = 0; },
    };

    constructor() {
        this._key = LumNetworkFX.KEY;
    }

    /**
     * @param {VJPass} pass
     * @param {CanvasRenderingContext2D} ctx   output 2D context (blit target)
     * @param {HTMLCanvasElement} source       the already-composited frame
     * @param {number} w @param {number} h
     * @param {object} drive    { progress, intensity, band, tiling, dim } — each 0..1
     * @param {object} p        static params from the UI
     * @param {object} depth    { mode, mapSource, mapToken, matteSource, matteToken }
     * @param {object} pointer  { x, y } in -1..1
     * @param {object} clock    { time, dt, audio, beatClock } — `time` is seconds on
     *                          the deck's show clock (MEDIA time during offline
     *                          export, wall clock live)
     */
    render(pass, ctx, source, w, h, drive, p, depth, pointer, clock) {
        const prog = pass.buildProgram(this._key, FRAG_SRC, UNIFORM_NAMES);
        if (!prog) return false;
        const u = pass.use(this._key);
        if (!u) return false;
        const gl = pass.gl;

        // ── Textures ─────────────────────────────────────────────────────────
        pass.uploadFrame(source, 0);

        const useMap = depth.mode === 1 && !!depth.mapSource;
        if (useMap) pass.uploadAux(1, depth.mapSource, depth.mapToken);
        else pass.bindBlank(1);

        const useMatte = !!depth.matteSource;
        if (useMatte) pass.uploadAux(2, depth.matteSource, depth.matteToken);
        else pass.bindBlank(2);

        gl.uniform1i(u.uTex, 0);
        gl.uniform1i(u.uDepthTex, 1);
        gl.uniform1i(u.uMatteTex, 2);

        // ── Uniforms ─────────────────────────────────────────────────────────
        const tint = this._hexToRgb(p.tint, [0.55, 0.91, 1.0]);
        const accent = this._hexToRgb(p.accent, tint);

        gl.uniform2f(u.uRes, w, h);
        gl.uniform1f(u.uAspect, w / Math.max(1, h));

        gl.uniform1f(u.uProgress, drive.progress);
        gl.uniform1f(u.uBand, lerp(0.03, 0.55, drive.band));
        gl.uniform1f(u.uIntensity, lerp(0.25, 2.60, drive.intensity));
        gl.uniform1f(u.uDensity, drive.tiling);
        // Full 0..1, unlike ScanFX's 0.25 floor — the darker styles (Circuit,
        // Thermal Blocks, Dash Contour) need the plate to be able to reach true
        // black. Every preset ships at 0.80; pull Base Dim down per look.
        gl.uniform1f(u.uDim, drive.dim);

        gl.uniform1f(u.uThreshold, p.threshold ?? 0.45);
        gl.uniform1f(u.uLinkRange, p.linkRange ?? 0.55);
        gl.uniform1f(u.uNodeSize, p.nodeSize ?? 0.4);
        gl.uniform1f(u.uGlow, p.glow ?? 0.15);
        gl.uniform1f(u.uParallax, p.parallax ?? 0.02);
        gl.uniform1i(u.uStyle, p.style ?? 0);
        gl.uniform1i(u.uLabel, p.label ?? 0);
        gl.uniform3f(u.uTint, tint[0], tint[1], tint[2]);
        gl.uniform3f(u.uAccent, accent[0], accent[1], accent[2]);
        gl.uniform2f(u.uPointer, pointer.x, pointer.y);
        // `progress` is the channel the Control selector owns — Shake rides it.
        setShakeUniforms(gl, u, p, drive.progress, clock.time);

        gl.uniform1i(u.uDepthMode, useMap ? 1 : 0);
        gl.uniform1f(u.uDepthSoften, p.depthSoften ?? 3.0);
        gl.uniform1f(u.uDepthContrast, p.depthContrast ?? 1.2);
        gl.uniform1f(u.uDepthInvert, p.depthInvert ? 1 : 0);
        gl.uniform1f(u.uUseMatte, useMatte ? 1 : 0);
        gl.uniform1f(u.uSubject, p.subject ?? 0.7);

        pass.draw();
        pass.blit(ctx, w, h);
        return true;
    }

    _hexToRgb(hex, fallback) {
        const h = String(hex || '').replace('#', '');
        const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
        if (!h || Number.isNaN(n)) return fallback;
        return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    }

    dispose() { /* all GPU state lives in the shared VJPass */ }
}
