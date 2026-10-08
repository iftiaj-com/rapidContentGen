import { BaseEffect } from '../../shared/BaseEffect.js';
import { buildProgramDeferred } from '../../shared/gl-link.js';
// Static `?url` imports, NOT `new URL(literal, import.meta.url)`. The latter makes
// Vite splice a placeholder into THIS file's own source, and the obfuscator's code
// generator re-emits it with the other quote character, which makes Vite's later
// plain-text substitution miss and breaks the prod build. Measured at 60/60 runs.
// `?url` routes the placeholder into a separate synthesized module (id ends in the
// asset extension, not `.js`) that the obfuscator's include glob never sees.
import BIRD_URL from '../../assets/visuals/bird.gif?url';
import FLOWER_URL from '../../assets/visuals/flower.png?url';
import LEAF_URL from '../../assets/visuals/leaf.png?url';
import SMOKE_URL from '../../assets/visuals/smoke.png?url';

/**
 * Split Screen (WebGL2)
 * ─────────────────────────────────────────────────────────────
 * Self-contained vanilla WebGL2 effect (no three.js, no WebGPU): renders into
 * its own offscreen canvas through ONE master fragment shader, then composites
 * the result onto the output canvas with drawImage. Two modes share the
 * shader via an integer switch:
 *
 *   Mode 0 — LINEAR_SPLIT   vertical/horizontal boundary between texture A
 *                           (main media) and texture B, linear edge feathering,
 *                           a localized attenuation band centered on the
 *                           boundary (drop shadow), and an optional boundary
 *                           rotation (Angle).
 *   Mode 1 — SHAPE_MASK     Translate/Rotate/Scale the pixel into mask space,
 *                           evaluate a Rect / Circle / Diamond / Hexagon /
 *                           Star / Heart / Blob SDF — or sample an image mask
 *                           (Bird / Flower / Leaf / Smoke from assets/visuals,
 *                           alpha or white-on-black luminance coverage; the
 *                           bird GIF is decoded with WebCodecs ImageDecoder so
 *                           it stays animated) — feather the edge and mix
 *                           B inside the shape (invertible). Orientation
 *                           Vertical/Horizontal splits the frame into an A
 *                           half and a B half, each with a centered shape
 *                           window into the OPPOSITE texture; Overlay keeps
 *                           the single full-frame B-through-shape look.
 *
 * Optional extras (all OFF by default, original behavior when off): B blend
 * mode (Screen/Multiply/Difference instead of hard replace), border stroke on
 * the mask edge, edge chromatic aberration, mask motion paths (orbit / drift /
 * bounce / figure-8), audio-reactive mask size (slow EMA envelope — a gentle
 * swell, not a per-beat pulse) and audio beat-cycled mask shape, Side B
 * playback speed + mirror, and gesture-driven mask position via the shared
 * window._prismTrack (published by AnamorphicCamera tracking).
 *
 * (The former Mode 2 REVERSE_PHI was promoted to its own effect —
 * effects/video/ReversePhi.js, registry key `reverse_phi`.)
 *
 * Texture B: a dedicated video/image upload in the effect panel
 * (#splitMediaInput) — the effect owns the media element (muted looping
 * video / image, object-URL lifecycle included) and detects new selections
 * by polling input.files[0] each frame, so no listener wiring is needed
 * before the effect is instantiated. When nothing is uploaded (or not yet
 * decodable), texture A is re-bound on unit 1 and sampled through a zoomed
 * offset crop so the two sides never look identical. Both inputs are sampled
 * object-cover (aspect preserved) via per-texture crop rects — texture A uses
 * the pipeline's own cover crop, texture B computes its own against the
 * output aspect.
 *
 * All controls are read straight from the DOM each frame (DepthIllusion
 * pattern) into a structured state object, and every uniform is re-evaluated
 * per animation frame.
 *
 * NOTE: this file embeds GLSL template literals and IS obfuscated in prod. That
 * is fine — the obfuscator escapes them and esbuild re-templates them on the way
 * out. It used to be excluded on the belief that shaders break the build; the
 * real breaker was its four `new URL(literal, import.meta.url)` mask paths, now
 * `?url` imports. See vite.config.mjs's forbidAssetUrlLiteral().
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
uniform vec4  uCropA;          // object-cover sub-rect of A: offset.xy, size.zw (0..1)
uniform vec4  uCropB;          // object-cover sub-rect of B
uniform vec2  uRes;            // output resolution (px)
uniform float uTime;           // effect clock (s) — blob wobble

uniform int   uMode;           // 0 LINEAR_SPLIT, 1 SHAPE_MASK
uniform int   uOrientation;    // 0 VERTICAL, 1 HORIZONTAL, 2 OVERLAY (Shape Mask only)
uniform float uSplitPos;       // 0..1
uniform float uSplitAngle;     // radians — rotates the linear boundary (0 = original)
uniform float uFeather;        // 0..0.5
uniform float uShadowIntensity;// 0..1
uniform float uShadowWidth;    // 0.005..0.1
uniform int   uBlendMode;      // B combine: 0 REPLACE, 1 SCREEN, 2 MULTIPLY, 3 DIFFERENCE

uniform int   uMaskShape;      // 0 RECT, 1 CIRCLE, 2 DIAMOND, 3 HEXAGON, 4 STAR, 5 HEART, 6 BLOB, >=7 IMAGE MASK (uMaskTex)
uniform vec2  uMaskCenter;     // translate (0..1 uv)
uniform float uMaskSize;       // scale 0..1.5
uniform float uMaskRotation;   // radians
uniform float uInvertMask;     // 0/1
uniform float uStrokeWidth;    // border stroke width in screen units, 0 = off
uniform vec3  uStrokeColor;
uniform float uEdgeChroma;     // edge chromatic aberration amount, 0 = off
uniform sampler2D uMaskTex;    // image mask (unit 2) — sampled when uMaskShape >= 7
uniform float uMaskTexMode;    // coverage source: 0 = alpha (transparent GIF), 1 = luminance (white-on-black)
uniform float uMaskTexAspect;  // mask image width/height (fit inside the mask box)

vec3 sampleCover(sampler2D t, vec4 crop, vec2 uv) {
    return texture(t, crop.xy + clamp(uv, 0.0, 1.0) * crop.zw).rgb;
}

// R/B sampled at ±off — chromatic fringe (off = vec2(0) → plain sample)
vec3 sampleCoverCA(sampler2D t, vec4 crop, vec2 uv, vec2 off) {
    return vec3(
        sampleCover(t, crop, uv + off).r,
        sampleCover(t, crop, uv).g,
        sampleCover(t, crop, uv - off).b);
}

// How Side B combines with the base where the split/mask shows it
vec3 blendB(vec3 base, vec3 b) {
    if (uBlendMode == 1) return 1.0 - (1.0 - base) * (1.0 - b);  // screen
    if (uBlendMode == 2) return base * b;                        // multiply
    if (uBlendMode == 3) return abs(base - b);                   // difference
    return b;                                                    // replace
}

// ── Mode 0: linear split with feather + centered boundary shadow ──────
vec3 linearSplit(vec2 uv) {
    // Angle rotates the boundary about the frame centre (0 = axis-aligned,
    // identical to the original look).
    float ca = cos(uSplitAngle), sa = sin(uSplitAngle);
    vec2 ruv = mat2(ca, -sa, sa, ca) * (uv - 0.5) + 0.5;
    float coord = (uOrientation == 1) ? ruv.y : ruv.x;
    float d = coord - uSplitPos;
    float m = smoothstep(-uFeather * 0.5 - 1e-5, uFeather * 0.5 + 1e-5, d);
    vec3 colA = sampleCover(uTexA, uCropA, uv);
    vec3 colB = sampleCover(uTexB, uCropB, uv);
    vec3 col = mix(colA, blendB(colA, colB), m);
    // localized attenuation band centered on the boundary = drop shadow
    float shade = 1.0 - uShadowIntensity * (1.0 - smoothstep(0.0, uShadowWidth, abs(d)));
    return col * shade;
}

// ── Mode 1: SDF shape mask with T/R/S + feathered edge + inversion ────
float dot2(vec2 v) { return dot(v, v); }

float sdHexagon(vec2 p, float r) {
    const vec3 k = vec3(-0.866025404, 0.5, 0.577350269);
    p = abs(p);
    p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
    p -= vec2(clamp(p.x, -k.z * r, k.z * r), r);
    return length(p) * sign(p.y);
}

float sdStar5(vec2 p, float r, float rf) {
    const vec2 k1 = vec2(0.809016994, -0.587785252);
    const vec2 k2 = vec2(-k1.x, k1.y);
    p.x = abs(p.x);
    p -= 2.0 * max(dot(k1, p), 0.0) * k1;
    p -= 2.0 * max(dot(k2, p), 0.0) * k2;
    p.x = abs(p.x);
    p.y -= r;
    vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0.0, 1.0);
    float h = clamp(dot(p, ba) / dot2(ba), 0.0, r);
    return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
}

// Canonical heart: tip at the origin, lobes around y ≈ 1 (y-up)
float sdHeart(vec2 p) {
    p.x = abs(p.x);
    if (p.y + p.x > 1.0) return sqrt(dot2(p - vec2(0.25, 0.75))) - 0.35355339;
    return sqrt(min(dot2(p - vec2(0.0, 1.0)),
                    dot2(p - 0.5 * max(p.x + p.y, 0.0)))) * sign(p.x - p.y);
}

// Signed distance to the mask edge in SCREEN units (consistent feather/stroke)
float shapeDistAt(vec2 uv, vec2 center) {
    float aspect = uRes.x / uRes.y;
    vec2 p = uv - center;              // Translate
    p.x *= aspect;                     // square coordinate space
    float cr = cos(-uMaskRotation), sr = sin(-uMaskRotation);
    p = mat2(cr, -sr, sr, cr) * p;     // Rotate
    float sc = max(uMaskSize, 1e-4);
    p /= sc;                           // Scale
    float d;
    if (uMaskShape >= 7) {             // Image mask (bird / flower / leaf / smoke)
        // Fit the image into a 0.45 half-extent box, preserving its aspect.
        vec2 he = vec2(0.45);
        if (uMaskTexAspect >= 1.0) he.y /= uMaskTexAspect;
        else he.x *= uMaskTexAspect;
        vec2 tuv = p / (2.0 * he) + 0.5;
        float cov = 0.0;
        if (tuv.x > 0.0 && tuv.x < 1.0 && tuv.y > 0.0 && tuv.y < 1.0) {
            vec4 ms = texture(uMaskTex, tuv);
            cov = mix(ms.a, dot(ms.rgb, vec3(0.299, 0.587, 0.114)), uMaskTexMode);
        }
        // Pseudo-distance from coverage (edge at cov = 0.5) so feather,
        // stroke, invert and edge chroma all behave like the SDF shapes;
        // outside the image box grow with the real box distance.
        vec2 q = abs(p) - he;
        d = (0.5 - cov) * 0.25 + length(max(q, 0.0));
    } else if (uMaskShape == 0) {      // Rectangle (4:3-ish half extents)
        vec2 q = abs(p) - vec2(0.40, 0.30);
        d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
    } else if (uMaskShape == 1) {      // Circle
        d = length(p) - 0.40;
    } else if (uMaskShape == 2) {      // Diamond
        d = (abs(p.x) + abs(p.y)) - 0.45;
    } else if (uMaskShape == 3) {      // Hexagon
        d = sdHexagon(p, 0.40);
    } else if (uMaskShape == 4) {      // Star (y flipped: points up on screen)
        d = sdStar5(vec2(p.x, -p.y), 0.45, 0.45);
    } else if (uMaskShape == 5) {      // Heart (recentred + upright, y-down space)
        d = sdHeart(vec2(p.x / 0.8, 0.55 - p.y / 0.8)) * 0.8;
    } else {                           // Blob: circle with time-wobbled radius
        float ang = atan(p.y, p.x);
        float wob = sin(ang * 5.0 + uTime * 1.1) * 0.045
                  + sin(ang * 3.0 - uTime * 0.7) * 0.035;
        d = length(p) - (0.38 + wob);
    }
    return d * sc;                     // back to screen units
}

float maskFromDist(float d) {
    float m = 1.0 - smoothstep(-uFeather * 0.5, uFeather * 0.5 + 1e-5, d);
    return mix(m, 1.0 - m, uInvertMask);
}

vec3 shapeMask(vec2 uv) {
    // Resolve this pixel's mask centre: Overlay = one full-frame window;
    // Vertical / Horizontal = two halves (A then B), each with a centered
    // shape window into the OPPOSITE texture. Center X/Y shifts the windows.
    float seg = 0.0;
    vec2 center = uMaskCenter;
    if (uOrientation != 2) {
        float coord = (uOrientation == 1) ? uv.y : uv.x;
        seg = step(0.5, coord);        // 0 = first half, 1 = second half
        vec2 segCenter = (uOrientation == 1)
            ? vec2(0.5, 0.25 + seg * 0.5)
            : vec2(0.25 + seg * 0.5, 0.5);
        center = segCenter + (uMaskCenter - vec2(0.5));
    }
    float d = shapeDistAt(uv, center);
    float m = maskFromDist(d);

    // Edge chromatic aberration: RGB fringe fading in near the mask edge,
    // offset radially from the mask centre (zero when uEdgeChroma is 0).
    float aspect = uRes.x / uRes.y;
    vec2 dir = uv - center;
    dir.x *= aspect;
    dir /= max(length(dir), 1e-4);
    dir.x /= aspect;
    float prox = 1.0 - smoothstep(0.0, 0.12, abs(d));
    vec2 caOff = dir * (uEdgeChroma * 0.012 * prox);

    vec3 colA = sampleCoverCA(uTexA, uCropA, uv, caOff);
    vec3 colB = sampleCoverCA(uTexB, uCropB, uv, caOff);
    vec3 base = (uOrientation == 2) ? colA : mix(colA, colB, seg);
    vec3 win  = (uOrientation == 2) ? colB : mix(colB, colA, seg);
    vec3 col = mix(base, blendB(base, win), m);

    // Border stroke: solid band centered on the mask edge (|d| ≈ 0)
    if (uStrokeWidth > 0.0001) {
        float sw = uStrokeWidth * 0.5;
        float stroke = 1.0 - smoothstep(sw, sw + max(uFeather * 0.25, 0.0015), abs(d));
        col = mix(col, uStrokeColor, stroke);
    }
    return col;
}

void main() {
    vec3 col = (uMode == 0) ? linearSplit(vUv) : shapeMask(vUv);
    outColor = vec4(col, 1.0);
}`;

const UNIFORM_NAMES = [
    'uTexA', 'uTexB', 'uCropA', 'uCropB', 'uRes', 'uTime',
    'uMode', 'uOrientation', 'uSplitPos', 'uSplitAngle', 'uFeather',
    'uShadowIntensity', 'uShadowWidth', 'uBlendMode',
    'uMaskShape', 'uMaskCenter', 'uMaskSize', 'uMaskRotation', 'uInvertMask',
    'uStrokeWidth', 'uStrokeColor', 'uEdgeChroma',
    'uMaskTex', 'uMaskTexMode', 'uMaskTexAspect'
];

// Image-based mask shapes (uMaskShape >= 7). Coverage comes from the alpha
// channel for the transparent animated GIF (luma: 0) and from luminance for
// the white-on-black PNGs (luma: 1). Static URLs so Vite bundles the assets.
const MASK_TEX_SHAPES = {
    7: { key: 'bird', url: BIRD_URL, luma: 0, animated: true },
    8: { key: 'flower', url: FLOWER_URL, luma: 1, animated: false },
    9: { key: 'leaf', url: LEAF_URL, luma: 1, animated: false },
    10: { key: 'smoke', url: SMOKE_URL, luma: 1, animated: false }
};
const MASK_SHAPE_COUNT = 11;   // 7 SDF shapes + Object.keys(MASK_TEX_SHAPES).length

export class SplitScreen extends BaseEffect {
    constructor() {
        super('Split Screen (WebGL2)');
        this.isGPU = false;        // self-managed WebGL2 — uses the Canvas2D dispatch path
        this._canvas = null;
        this._gl = null;
        this._program = null;
        this._u = {};              // uniform locations
        this._texA = null;
        this._texB = null;
        this._glFailed = false;    // WebGL2 unavailable → plain-draw fallback
        this._mediaB = null;       // Side B element (video or image), owned by the effect
        this._mediaBUrl = null;    // object URL backing _mediaB
        this._lastFileB = null;    // last File seen on #splitMediaInput
        this._texBReady = false;   // _texB holds a valid frame of the CURRENT Side B media
        this._lastCropB = null;    // cover crop matching that held frame
        this._texAReady = false;   // _texA holds a valid frame of the current main media
        this._lastCropA = null;
        this._lastSrcA = null;     // identity of the media behind the held A frame
        this._time = 0;            // effect clock (blob wobble, mask motion)
        this._audioEnv = 0;        // slow EMA of the selected audio band
        this._beatHot = false;     // beat-detector state for audio shape cycling
        this._lastShapeSwap = 0;
        this._shapeStep = 0;       // shapes advanced by audio beats
        this._gx = 0;              // smoothed gesture offset on the mask centre
        this._gy = 0;
        this._texM = null;         // mask-image texture (unit 2) — static images + placeholder
        this._texMState = null;    // asset key currently uploaded to _texM
        this._maskAssets = {};     // key → { ready, img, frames, totalMs, aspect, luma, t0 }
        this._maskGifTex = null;   // { gl, key, tex[] } — one GL texture per GIF frame (upload once, bind after)
        // Structured parameter state (schema) — refreshed from DOM every frame.
        this.state = {
            effectMode: 0,          // 0 LINEAR_SPLIT, 1 SHAPE_MASK
            splitOrientation: 0,    // 0 VERTICAL, 1 HORIZONTAL, 2 OVERLAY (Shape Mask only)
            splitPosition: 0.5,
            splitAngle: 0,          // degrees — linear boundary rotation
            feather: 0.02,
            shadowIntensity: 0.5,
            shadowWidth: 0.03,
            blendMode: 0,           // 0 REPLACE, 1 SCREEN, 2 MULTIPLY, 3 DIFFERENCE
            maskShape: 0,           // 0 RECT, 1 CIRCLE, 2 DIAMOND, 3 HEX, 4 STAR, 5 HEART, 6 BLOB, 7 BIRD, 8 FLOWER, 9 LEAF, 10 SMOKE
            maskSize: 0.5,
            maskRotation: 0,        // degrees
            maskX: 0.5,
            maskY: 0.5,
            invertMask: false,
            strokeOn: false,
            strokeWidth: 0.012,
            strokeColor: '#ffffff',
            edgeChromaOn: false,
            edgeChroma: 0.5,
            maskMotion: 'none',     // none / orbit / drift / bounce / figure8
            motionSpeed: 1,
            audioSize: false,       // audio-reactive mask size (gentle swell)
            audioShape: false,      // audio beats cycle the mask shape
            audioBand: 'bass',
            audioSens: 1,
            gestureOn: false,       // window._prismTrack moves the mask centre
            bSpeed: 1,              // Side B video playbackRate
            bMirrorH: false,
            bMirrorV: false
        };
    }

    restart() {
        // Effect switched / global reset — stop Side B decode; render() resumes it.
        if (this._mediaB?.tagName === 'VIDEO') this._mediaB.pause();
    }

    // ── GL lifecycle ─────────────────────────────────────────────────────

    _ensureGL(w, h) {
        if (this._glFailed) return false;
        if (!this._gl) {
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
            if (!gl) { this._glFailed = true; return false; }
            canvas.addEventListener('webglcontextlost', (e) => {
                e.preventDefault();
                // drop everything — next frame rebuilds on a fresh canvas
                this._gl = null;
                this._canvas = null;
                this._program = null;
                this._texA = null;
                this._texB = null;
                this._texBReady = false;
                this._lastCropB = null;
                this._texAReady = false;
                this._lastCropA = null;
                this._texM = null;
                this._texMState = null;
                this._maskGifTex = null;
            });
            this._canvas = canvas;
            this._gl = gl;
            this._program = null;
            // Link off the frame (shared/gl-link.js). Until onReady fires, _program
            // stays null and the caller draws the plain fallback for that frame.
            buildProgramDeferred(gl, VERT_SRC, FRAG_SRC, {
                label: 'SplitScreen',
                onReady: (prog) => {
                    if (this._gl !== gl) return; // context lost / rebuilt meanwhile
                    gl.useProgram(prog);
                    this._u = {};
                    UNIFORM_NAMES.forEach(n => { this._u[n] = gl.getUniformLocation(prog, n); });
                    gl.uniform1i(this._u.uTexA, 0);
                    gl.uniform1i(this._u.uTexB, 1);
                    gl.uniform1i(this._u.uMaskTex, 2);
                    this._program = prog;
                },
                onFail: () => { if (this._gl === gl) this._glFailed = true; },
            });
            const makeTex = () => {
                const t = gl.createTexture();
                gl.bindTexture(gl.TEXTURE_2D, t);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                return t;
            };
            this._texA = makeTex();
            this._texB = makeTex();
            this._texM = makeTex();
            // 1×1 transparent placeholder — image shapes show nothing until loaded
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
            this._texMState = 'blank';
        }
        if (!this._program) return false; // still linking → plain draw this frame
        if (this._canvas.width !== w || this._canvas.height !== h) {
            this._canvas.width = w;
            this._canvas.height = h;
        }
        this._gl.viewport(0, 0, w, h);
        return true;
    }

    // ── Media helpers ────────────────────────────────────────────────────

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

    // Object-cover crop of media (mw×mh) onto a tw×th target, in media pixels.
    _coverCrop(mw, mh, tw, th) {
        const s = Math.max(tw / mw, th / mh);
        const sw = tw / s, sh = th / s;
        return { sx: (mw - sw) / 2, sy: (mh - sh) / 2, sw, sh };
    }

    _normCrop(crop, dims) {
        return [crop.sx / dims.w, crop.sy / dims.h, crop.sw / dims.w, crop.sh / dims.h];
    }

    // Side B media: rebuild the owned element when #splitMediaInput changes
    // (polled per frame — cheap, and survives the effect's lazy instantiation).
    _syncSideB() {
        const file = document.getElementById('splitMediaInput')?.files?.[0] || null;
        if (file === this._lastFileB) return;
        this._lastFileB = file;
        if (this._mediaB?.tagName === 'VIDEO') {
            this._mediaB.pause();
            this._mediaB.removeAttribute('src');
            this._mediaB.load();
        }
        if (this._mediaBUrl) { URL.revokeObjectURL(this._mediaBUrl); this._mediaBUrl = null; }
        this._mediaB = null;
        this._texBReady = false;   // held frame belongs to the previous file
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
            vid.muted = true;
            vid.loop = true;
            vid.playsInline = true;
            vid.onloadeddata = redraw;
            vid.src = url;
            vid.play().catch(() => { });
            this._mediaB = vid;
        }
    }

    // Side B, only when loaded and decodable this frame.
    _getSideBMedia() {
        this._syncSideB();
        const m = this._mediaB;
        if (!m || !this._isUploadable(m)) return null;
        if (m.tagName === 'VIDEO' && m.paused) m.play().catch(() => { });
        return m;
    }

    // ── Image mask shapes (bird / flower / leaf / smoke) ─────────────────

    // Kick off (once) the async load of a mask asset. Animated GIFs are
    // decoded into per-frame ImageBitmaps with WebCodecs ImageDecoder so the
    // bird actually flaps; if ImageDecoder is unavailable or decode fails,
    // fall back to a static <img> (first frame only).
    _loadMaskAsset(def) {
        const asset = { ready: false, img: null, frames: null, totalMs: 0, aspect: 1, luma: def.luma };
        const redraw = () => {
            const app = window.app;
            if (app && !app.state.isPlaying) app.drawFrameSingle();
        };
        const loadStatic = () => {
            const img = new Image();
            img.onload = () => {
                asset.img = img;
                asset.aspect = img.naturalWidth / img.naturalHeight;
                asset.ready = true;
                redraw();
            };
            img.src = def.url;
        };
        if (def.animated && typeof ImageDecoder !== 'undefined') {
            (async () => {
                try {
                    const buf = await (await fetch(def.url)).arrayBuffer();
                    const decoder = new ImageDecoder({ data: buf, type: 'image/gif' });
                    await decoder.tracks.ready;
                    const count = decoder.tracks.selectedTrack?.frameCount || 1;
                    const frames = [];
                    let totalMs = 0;
                    for (let i = 0; i < count; i++) {
                        const { image } = await decoder.decode({ frameIndex: i });
                        const bmp = await createImageBitmap(image);
                        let durMs = (image.duration || 0) / 1000;       // µs → ms
                        if (durMs <= 10) durMs = 100;                   // browser convention for 0-delay GIFs
                        totalMs += durMs;
                        image.close();
                        frames.push({ bmp, endMs: totalMs });
                    }
                    decoder.close();
                    asset.frames = frames;
                    asset.totalMs = Math.max(totalMs, 1);
                    asset.aspect = frames[0].bmp.width / frames[0].bmp.height;
                    asset.t0 = performance.now();   // wall-clock anchor — playback speed independent of render fps
                    asset.ready = true;
                    redraw();
                } catch (_e) { loadStatic(); }
            })();
        } else {
            loadStatic();
        }
        return asset;
    }

    // Bind unit 2 to the current frame of the shape's mask image. Returns the
    // asset ({ luma, aspect }) or null while loading (placeholder stays bound
    // → zero coverage → the shape simply hasn't appeared yet).
    _bindMaskTexture(gl, shapeIdx) {
        const def = MASK_TEX_SHAPES[shapeIdx];
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, this._texM);
        if (!def) return null;
        let asset = this._maskAssets[def.key];
        if (!asset) asset = this._maskAssets[def.key] = this._loadMaskAsset(def);
        if (!asset.ready) {
            if (this._texMState !== 'blank') {
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
                this._texMState = 'blank';
            }
            return null;
        }
        if (asset.frames) {
            // Wall-clock frame selection (native GIF timing regardless of the
            // render loop's fps), served from a texture-per-frame cache so
            // steady-state playback never re-uploads pixels.
            const t = (performance.now() - asset.t0) % asset.totalMs;
            let frameIdx = asset.frames.findIndex(f => t < f.endMs);
            if (frameIdx < 0) frameIdx = asset.frames.length - 1;
            let cache = this._maskGifTex;
            if (!cache || cache.gl !== gl || cache.key !== def.key) {
                if (cache && cache.gl === gl) cache.tex.forEach(tx => gl.deleteTexture(tx));
                cache = this._maskGifTex = { gl, key: def.key, tex: [] };
            }
            let tex = cache.tex[frameIdx];
            if (!tex) {
                tex = gl.createTexture();
                gl.bindTexture(gl.TEXTURE_2D, tex);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                try {
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, asset.frames[frameIdx].bmp);
                } catch (_e) {
                    gl.deleteTexture(tex);
                    gl.bindTexture(gl.TEXTURE_2D, this._texM);
                    return null;
                }
                cache.tex[frameIdx] = tex;
            } else {
                gl.bindTexture(gl.TEXTURE_2D, tex);
            }
            return asset;
        }
        if (this._texMState !== def.key) {
            try {
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, asset.img);
                this._texMState = def.key;
            } catch (_e) { return null; }
        }
        return asset;
    }

    // ── DOM → structured state (per frame) ───────────────────────────────

    _readState() {
        const val = (id, def) => parseFloat(document.getElementById(id)?.value ?? def);
        const sel = (id, def) => document.getElementById(id)?.value ?? def;
        const chk = (id) => document.getElementById(id)?.checked === true;
        const s = this.state;
        s.effectMode = { linear: 0, shape: 1 }[sel('splitMode', 'linear')] ?? 0;
        s.splitOrientation = { vertical: 0, horizontal: 1, overlay: 2 }[sel('splitOrientation', 'vertical')] ?? 0;
        s.splitPosition = val('splitPosition', 0.5);
        s.splitAngle = val('splitAngle', 0);
        s.feather = val('splitFeather', 0.02);
        s.shadowIntensity = val('splitShadowIntensity', 0.5);
        s.shadowWidth = val('splitShadowWidth', 0.03);
        s.blendMode = { replace: 0, screen: 1, multiply: 2, difference: 3 }[sel('splitBlendMode', 'replace')] ?? 0;
        s.maskShape = { rectangle: 0, circle: 1, diamond: 2, hexagon: 3, star: 4, heart: 5, blob: 6, bird: 7, flower: 8, leaf: 9, smoke: 10 }[sel('splitMaskShape', 'rectangle')] ?? 0;
        s.maskSize = val('splitMaskSize', 0.5);
        s.maskRotation = val('splitMaskRotation', 0);
        s.maskX = val('splitMaskX', 0.5);
        s.maskY = val('splitMaskY', 0.5);
        s.invertMask = chk('splitInvertMask');
        s.strokeOn = chk('splitStrokeEnabled');
        s.strokeWidth = val('splitStrokeWidth', 0.012);
        s.strokeColor = sel('splitStrokeColor', '#ffffff');
        s.edgeChromaOn = chk('splitEdgeChromaEnabled');
        s.edgeChroma = val('splitEdgeChroma', 0.5);
        s.maskMotion = sel('splitMaskMotion', 'none');
        s.motionSpeed = val('splitMaskMotionSpeed', 1);
        s.audioSize = chk('splitAudioSize');
        s.audioShape = chk('splitAudioShape');
        s.audioBand = sel('splitAudioBand', 'bass');
        s.audioSens = val('splitAudioSens', 1);
        s.gestureOn = chk('splitGestureEnabled');
        s.bSpeed = val('splitBSpeed', 1);
        s.bMirrorH = chk('splitBMirrorH');
        s.bMirrorV = chk('splitBMirrorV');
    }

    _hexToRgb(hex) {
        const n = parseInt(String(hex).slice(1), 16) || 0;
        return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    }

    // Per-frame animated values (audio swell / shape cycling, mask motion,
    // gesture). Everything is layered on top of the DOM values, so with all
    // toggles off the output is exactly the slider settings.
    _dynamics(s, audioFeatures) {
        this._time += 0.016;
        const t = this._time;

        const lvl = audioFeatures
            ? ({ bass: audioFeatures.bass, mid: audioFeatures.mid, treble: audioFeatures.treble, volume: audioFeatures.vol }[s.audioBand] || 0)
            : 0;
        // Slow EMA (attack AND release) → a gentle breathing swell, never a
        // per-beat jitter.
        this._audioEnv += (lvl - this._audioEnv) * 0.08;

        let size = s.maskSize;
        if (s.audioSize) size *= 1 + this._audioEnv * s.audioSens * 0.35;

        let shape = s.maskShape;
        if (s.audioShape) {
            // Rising-edge beat detect against the smoothed envelope, with a
            // cooldown so the shape changes at most ~2×/s.
            const hot = lvl > Math.max(0.25, this._audioEnv * 1.35);
            if (hot && !this._beatHot && t - this._lastShapeSwap > 0.45) {
                this._shapeStep = (this._shapeStep + 1) % MASK_SHAPE_COUNT;
                this._lastShapeSwap = t;
            }
            this._beatHot = hot;
            shape = (s.maskShape + this._shapeStep) % MASK_SHAPE_COUNT;
        } else {
            this._shapeStep = 0;
        }

        let mx = s.maskX, my = s.maskY;
        const spd = s.motionSpeed;
        if (s.maskMotion === 'orbit') {
            mx += Math.cos(t * spd) * 0.15;
            my += Math.sin(t * spd) * 0.15;
        } else if (s.maskMotion === 'drift') {
            mx += Math.sin(t * 0.37 * spd) * 0.18 + Math.sin(t * 1.13 * spd) * 0.02;
            my += Math.cos(t * 0.29 * spd) * 0.14 + Math.cos(t * 0.91 * spd) * 0.02;
        } else if (s.maskMotion === 'bounce') {
            my += (Math.abs(Math.sin(t * spd * 1.4)) - 0.5) * 0.3;
        } else if (s.maskMotion === 'figure8') {
            mx += Math.sin(t * spd) * 0.18;
            my += Math.sin(t * spd * 2.0) * 0.12;
        }

        if (s.gestureOn) {
            const track = window._prismTrack;   // published by AnamorphicCamera tracking
            if (track && typeof track.x === 'number') {
                this._gx += (track.x * 0.5 - this._gx) * 0.12;
                this._gy += (track.y * 0.5 - this._gy) * 0.12;
            }
            mx += this._gx;
            my += this._gy;
        } else {
            this._gx = 0;
            this._gy = 0;
        }

        return { shape, size, mx, my };
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

        // Texture A — main media, with the same hold-last-frame strategy as
        // texture B: at playback (re)start and on loop/seek the main video's
        // readyState dips below HAVE_CURRENT_DATA for a moment — plain-drawing
        // there showed the raw frame with NO effect for up to ~1s at t=0.
        // Hold the last good A frame instead; plain draw only remains for
        // before any frame of this media has ever been decodable.
        const srcKey = activeMedia ? (activeMedia.currentSrc || activeMedia.src || activeMedia) : null;
        if (srcKey !== this._lastSrcA) {
            this._lastSrcA = srcKey;
            this._texAReady = false;
            this._lastCropA = null;
        }
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this._texA);
        let cropA = null;
        if (this._isUploadable(activeMedia)) {
            try {
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, activeMedia);
                cropA = this._normCrop(crop, this._mediaDims(activeMedia));
                this._texAReady = true;
                this._lastCropA = cropA;
            } catch (_e) { /* fall through to held frame */ }
        }
        if (!cropA) {
            if (!this._texAReady || !this._lastCropA) { plainDraw(); return; }
            cropA = this._lastCropA;
        }

        // Texture B — uploaded Side B media if decodable. When a B video is
        // momentarily undecodable (readyState dips below HAVE_CURRENT_DATA on
        // loop-restart seeks / rebuffering, or texImage2D throws mid-seek),
        // HOLD the last good frame already in _texB instead of swapping to the
        // zoomed-A fallback — that swap is what showed as a sub-second flicker.
        // The zoomed-A fallback only applies when B has never been decodable.
        let cropB = null;
        const mediaB = this._getSideBMedia();
        if (mediaB?.tagName === 'VIDEO' && Math.abs(mediaB.playbackRate - s.bSpeed) > 0.001) {
            mediaB.playbackRate = s.bSpeed;
        }
        gl.activeTexture(gl.TEXTURE1);
        if (mediaB) {
            gl.bindTexture(gl.TEXTURE_2D, this._texB);
            try {
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, mediaB);
                const dimsB = this._mediaDims(mediaB);
                cropB = this._normCrop(this._coverCrop(dimsB.w, dimsB.h, tw, th), dimsB);
                this._texBReady = true;
                this._lastCropB = cropB;
            } catch (_e) { /* fall through to held frame / A fallback */ }
        }
        if (!cropB && this._texBReady && this._lastCropB) {
            gl.bindTexture(gl.TEXTURE_2D, this._texB);
            cropB = this._lastCropB;
        }
        if (!cropB) {
            gl.bindTexture(gl.TEXTURE_2D, this._texA);
            // fallback: same frame, zoomed + panned off-center (in normalized
            // crop space so it also works while the A frame is being held)
            const z = 1.3;
            const w = cropA[2] / z, h = cropA[3] / z;
            cropB = [cropA[0] + (cropA[2] - w) * 0.75, cropA[1] + (cropA[3] - h) * 0.5, w, h];
        }

        // Mirror flips the sampled crop rect — zero shader cost. Copy first so
        // the held _lastCropB is never mutated.
        if (s.bMirrorH || s.bMirrorV) {
            cropB = cropB.slice();
            if (s.bMirrorH) { cropB[0] += cropB[2]; cropB[2] = -cropB[2]; }
            if (s.bMirrorV) { cropB[1] += cropB[3]; cropB[3] = -cropB[3]; }
        }

        const dyn = this._dynamics(s, audioFeatures);
        const strokeRgb = this._hexToRgb(s.strokeColor);

        // Image mask shapes: bind the asset's current frame on unit 2 (GIF
        // frames are wall-clock selected from a texture-per-frame cache).
        let maskTexMode = 0, maskTexAspect = 1;
        if (s.effectMode === 1 && dyn.shape >= 7) {
            const maskAsset = this._bindMaskTexture(gl, dyn.shape);
            if (maskAsset) {
                maskTexMode = maskAsset.luma;
                maskTexAspect = maskAsset.aspect;
            }
        }

        // Uniforms — re-evaluated every frame
        const u = this._u;
        gl.useProgram(this._program);
        gl.uniform4fv(u.uCropA, cropA);
        gl.uniform4fv(u.uCropB, cropB);
        gl.uniform2f(u.uRes, tw, th);
        gl.uniform1f(u.uTime, this._time);
        gl.uniform1i(u.uMode, s.effectMode);
        gl.uniform1i(u.uOrientation, s.splitOrientation);
        gl.uniform1f(u.uSplitPos, s.splitPosition);
        gl.uniform1f(u.uSplitAngle, s.splitAngle * Math.PI / 180);
        gl.uniform1f(u.uFeather, s.feather);
        gl.uniform1f(u.uShadowIntensity, s.shadowIntensity);
        gl.uniform1f(u.uShadowWidth, s.shadowWidth);
        gl.uniform1i(u.uBlendMode, s.blendMode);
        gl.uniform1i(u.uMaskShape, dyn.shape);
        gl.uniform2f(u.uMaskCenter, dyn.mx, dyn.my);
        gl.uniform1f(u.uMaskSize, dyn.size);
        gl.uniform1f(u.uMaskRotation, s.maskRotation * Math.PI / 180);
        gl.uniform1f(u.uInvertMask, s.invertMask ? 1 : 0);
        gl.uniform1f(u.uStrokeWidth, s.strokeOn ? s.strokeWidth : 0);
        gl.uniform3f(u.uStrokeColor, strokeRgb[0], strokeRgb[1], strokeRgb[2]);
        gl.uniform1f(u.uEdgeChroma, s.edgeChromaOn ? s.edgeChroma : 0);
        gl.uniform1f(u.uMaskTexMode, maskTexMode);
        gl.uniform1f(u.uMaskTexAspect, maskTexAspect);

        gl.drawArrays(gl.TRIANGLES, 0, 3);
        ctx.drawImage(this._canvas, 0, 0, tw, th);
    }
}
