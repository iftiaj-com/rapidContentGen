import { BaseEffect } from '../../shared/BaseEffect.js';
import { buildProgramDeferred } from '../../shared/gl-link.js';

// ── Burning Frames WebGL2 shaders ────────────────────────────────────────────
// One subdivided unit-quad mesh drawn once per floating card. The vertex stage
// bends the sheet like cloth — Magic Carpet's gusted two-sine drive on SHARED
// vertices, so the paper flows continuously (no per-cell seams). The fragment
// stage is the reference burn-dissolve shader ported verbatim, per-pixel:
//   burn = distField*0.5 + fbm(uv)*0.5;  edge = burn - threshold;
//   if (edge < 0.0) discard;                       // already ash
//   ch = 1 - smoothstep(0, charW,  edge);
//   em = 1 - smoothstep(0, emberW, edge);
//   col = mix(base, charColor, ch) + emberColor*em // HDR ember rim
// with distField = distance to the paper's nearest edge (edges ignite first).
const BURN_VERTEX_SHADER = `#version 300 es
layout(location = 0) in vec2 aPos;          // unit-quad grid, 0..1
uniform vec2  uResolution;                  // target canvas size (px)
uniform vec2  uCenter;                      // card centre (px)
uniform vec2  uSize;                        // card size (px)
uniform float uRot;                         // card tilt (rad)
uniform float uTime;                        // gust clock
uniform float uWavePhase;                   // per-card phase offset
uniform float uWaveAmp;                     // ripple amplitude (fraction of height)
uniform float uGust;                        // two-sine gust level
uniform float uCurl;                        // gentle sheet bow (Curve slider)
out vec2  vUv;
out float vShade;
void main() {
    vUv = aPos;
    vec2 p = (aPos - 0.5) * uSize;
    float ph = uTime * 1.8 + uWavePhase;
    float w1 = sin(aPos.y * 6.0 + aPos.x * 3.0 + ph);
    float w2 = sin(aPos.x * 8.0 - uTime * 1.3 + uWavePhase * 1.7);
    float amp = uWaveAmp * uSize.y * (0.4 + uGust * 0.6);
    p.x += w1 * amp * 0.35;
    p.y += (w1 * 0.5 + w2 * 0.5) * amp;
    p.y -= uCurl * cos((aPos.x - 0.5) * 3.14159) * uSize.y * 0.15;
    vShade = 0.84 + 0.16 * cos(aPos.y * 6.0 + aPos.x * 3.0 + ph);
    float c = cos(uRot), s = sin(uRot);
    vec2 r = vec2(c * p.x - s * p.y, s * p.x + c * p.y) + uCenter;
    vec2 ndc = (r / uResolution) * 2.0 - 1.0;
    gl_Position = vec4(ndc.x, -ndc.y, 0.0, 1.0);
}`;

const BURN_FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2  vUv;
in float vShade;
uniform sampler2D uTex;
uniform float uThreshold;                   // sweeps the burn front
uniform float uSeed;                        // per-card burn-continent shape
uniform float uNoiseW;                      // fbm vs edge-distance mix
uniform float uFlickT;                      // animates the front (flame flicker)
uniform float uCharW;
uniform float uEmberW;
uniform vec3  uCharColor;
uniform vec3  uEmberColor;
uniform float uAlpha;                       // depth fade (output premultiplied)
out vec4 outColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + uSeed) * 43758.5453); }
float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i),                   hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)),  hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) {
        v += a * vnoise(p);
        p = p * 2.15 + vec2(uFlickT * 0.13, -uFlickT * 0.09);
        a *= 0.5;
    }
    return v;
}
void main() {
    float distField = 2.0 * min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
    float burn = mix(distField, fbm(vUv * 4.0), uNoiseW);
    float edge = burn - uThreshold;
    if (edge < 0.0) discard;                                  // already ash
    float ch = 1.0 - smoothstep(0.0, uCharW, edge);
    float em = 1.0 - smoothstep(0.0, uEmberW, edge);
    vec3 col = texture(uTex, vUv).rgb * vShade;
    col = mix(col, uCharColor, ch * 0.9);                     // charred halo
    col += uEmberColor * em * 1.6;                            // glowing rim
    col += vec3(1.0, 0.93, 0.72) * pow(em, 3.0) * 1.5;        // white-hot core
    outColor = vec4(col * uAlpha, uAlpha);
}`;

// ── Shred Frames WebGL2 shaders ──────────────────────────────────────────────
// The sheet is baked as 48 fine vertical strips whose boundary vertices are
// DUPLICATED (not shared), each carrying a strip index attribute. At runtime
// the fine strips are grouped into uStrips user-visible ribbons; every vertex
// of a group gets an identical transform, so grouped seams stay welded until
// the shred front passes. The strip logic is the reference verbatim:
//   past = clamp((uShredProgress - uv.x) / 0.4, 0.0, 1.0);
//   e    = past * past;                              // ease-in
//   pos.y -= e * (0.25 + hash(aStripIndex) * 0.25);  // gravity, per strip
//   pos    = rotateStrip(pos, aStripIndex, e * 3.0); // independent tumble
// Shading is analytic from the same wave + twist functions (no normal map).
const SHRED_VERTEX_SHADER = `#version 300 es
layout(location = 0) in vec2  aPos;         // unit-quad grid, 0..1
layout(location = 1) in float aStrip;       // fine-strip index, 0..47
uniform vec2  uResolution;                  // target canvas size (px)
uniform vec2  uCenter;                      // card centre (px)
uniform vec2  uSize;                        // card size (px)
uniform float uRot;                         // card tilt (rad)
uniform float uTime;                        // gust clock
uniform float uWavePhase;                   // per-card phase offset
uniform float uWaveAmp;                     // ripple amplitude (fraction of height)
uniform float uGust;                        // two-sine gust level
uniform float uStrips;                      // user-visible ribbon count
uniform float uShredProgress;               // shred front, sweeps 0 → 1.4
uniform float uTumble;                      // tumble angle scale (~3 rad)
uniform float uFall;                        // separation-drop distance scale
uniform float uSeed;                        // per-card strip randomisation
uniform float uDrift;                       // style: zero-g scatter distance
uniform float uCurlFreq;                    // style: helix frequency multiplier
uniform float uCoil;                        // style: ringlet length compression
uniform float uSpin;                        // style: free-float in-plane spin rate
out vec2  vUv;
out float vShade;
out float vFade;
out float vCos;
float hash1(float n) { return fract(sin(n * 127.1 + uSeed * 311.7) * 43758.5453); }
void main() {
    vUv = aPos;
    float g  = floor(aStrip * uStrips / 48.0);            // ribbon group
    float su = (g + 0.5) / uStrips;                       // ribbon centre (uv.x)
    float h0 = hash1(g), h3 = hash1(g + 3.0), h7 = hash1(g + 7.0), h11 = hash1(g + 11.0);
    float dir = h0 > 0.5 ? 1.0 : -1.0;
    // Reference strip logic: front sweeps L→R, ease-in separation per strip
    float pastRaw = (uShredProgress - su) / 0.4;
    float past  = clamp(pastRaw, 0.0, 1.0);
    float e     = past * past;                            // ease-in
    float tFree = max(0.0, pastRaw - 1.0);                // time fully loose → zero-g
    // Magic-Carpet cloth wave on the whole sheet (dies as the ribbon detaches)
    float ph = uTime * 1.8 + uWavePhase;
    float w1 = sin(aPos.y * 6.0 + aPos.x * 3.0 + ph);
    float w2 = sin(aPos.x * 8.0 - uTime * 1.3 + uWavePhase * 1.7);
    float sheetAmp = uWaveAmp * uSize.y * (0.4 + uGust * 0.6);
    float wobX = w1 * sheetAmp * 0.35 * (1.0 - e);
    float wobY = (w1 * 0.5 + w2 * 0.5) * sheetAmp * (1.0 - e);
    // Helical twist TRAVELLING ALONG THE RIBBON — the curl. The phase advances
    // with uTime forever, so shredded ribbons never freeze.
    float twist = e * uTumble * dir * (0.75 + h3 * 0.5)
                + e * (aPos.y * (6.0 + h3 * 4.0) * uCurlFreq + uTime * (1.5 + h0 * 1.5) * dir);
    float ca = cos(twist);
    float lx = (aPos.x - su) * uSize.x;
    // Serpentine wave — the ribbon snakes sideways, growing toward its tail
    float serpF = 5.0 + h7 * 6.0;
    float serp = sin(aPos.y * serpF + uTime * (1.0 + h7) * dir + h3 * 6.28);
    // Ribbon-local shape: twist foreshortening + serpentine + ringlet coil
    vec2 rp;
    rp.x = lx * ca + e * serp * uSize.x * 0.10 * (0.3 + aPos.y);
    rp.y = (aPos.y - 0.5) * uSize.y * (1.0 - uCoil * e)
         + e * cos(aPos.y * serpF * 0.5 + uTime * 0.8 * dir) * uSize.y * 0.06;
    // Zero-g free float: once fully loose the ribbon spins in-plane …
    float sp = (e * 0.3 + tFree * uSpin * (0.6 + h3 * 0.8)) * dir;
    float cs = cos(sp), ss = sin(sp);
    rp = vec2(cs * rp.x - ss * rp.y, ss * rp.x + cs * rp.y);
    // … and glides away in its own hashed direction (all directions, no bias)
    float da = h11 * 6.2832;
    float driftMag = min(tFree * 0.45, 1.8) * uDrift * uSize.y;
    // Ribbon centre: sheet slot + ref gravity during separation + drift + bob
    vec2 c0;
    c0.x = (su - 0.5) * uSize.x + e * e * (h7 - 0.5) * uSize.x * 0.25
         + cos(da) * driftMag
         + sin(uTime * (0.6 + h7 * 0.8) + h0 * 6.28) * uSize.y * 0.025 * e;
    c0.y = e * (0.25 + h0 * 0.25) * uFall * uSize.y      // per-strip gravity (ref)
         + sin(da) * 0.7 * driftMag
         + cos(uTime * (0.5 + h0 * 0.6) + h3 * 6.28) * uSize.y * 0.025 * e;
    vec2 p = c0 + rp + vec2(wobX, wobY);
    // Analytic lighting from the same wave + twist (no normal map)
    vShade = (0.84 + 0.16 * w1) * (0.5 + 0.5 * abs(ca));
    vCos   = ca;                                          // backface → paper back
    vFade  = (1.0 - 0.4 * e * e) * clamp(1.0 - tFree * 0.22, 0.0, 1.0);
    float c = cos(uRot), s = sin(uRot);
    vec2 r = vec2(c * p.x - s * p.y, s * p.x + c * p.y) + uCenter;
    vec2 ndc = (r / uResolution) * 2.0 - 1.0;
    gl_Position = vec4(ndc.x, -ndc.y, 0.0, 1.0);
}`;

const SHRED_FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2  vUv;
in float vShade;
in float vFade;
in float vCos;
uniform sampler2D uTex;
uniform float uAlpha;                       // depth fade (output premultiplied)
out vec4 outColor;
void main() {
    vec3 col = texture(uTex, vUv).rgb;
    // Twisted-away faces show the pale blank BACK of the sheet — the white
    // curling streamers in the reference footage.
    float back = smoothstep(0.0, 0.35, -vCos);
    col = mix(col, vec3(0.90, 0.88, 0.84), back * 0.9);
    col *= vShade;
    float a = uAlpha * vFade;
    outColor = vec4(col * a, a);
}`;

// Per-card shred personalities (picked by card seed): how the loose ribbons
// behave once free — like the variety of shredding papers in the reference.
const SHRED_STYLES = [
    { drift: 0.25, curl: 1.0, coil: 0.12, spin: 0.25 },   // hang & flutter
    { drift: 1.0,  curl: 0.8, coil: 0.08, spin: 1.1  },   // zero-g scatter
    { drift: 0.45, curl: 2.2, coil: 0.45, spin: 0.55 },   // ringlet coils
];

export class FrameTunnel extends BaseEffect {
    constructor() {
        super('Frame Tunnel');
        this.isGPU = false;
        this._frames = [];
        this._framesRaw = [];       // pristine extracted frames (pre-vignette source)
        this._vignBakedValue = 0;   // vignette strength currently baked into this._frames
        this._particles = [];       // {xOff, yOff} per slot (lateral drift only)
        this._sampling = false;
        this._sampleProgress = 0;
        this._lastVideoKey = null;
        this._lastTime = 0;
        this._lastCapture = 0;
        this._beatBg = 0;
        this._beatPeak = 0;
        this._tunnelPos = 0;        // belt position in slot units (increases over time)
        this._tunnelVelocity = 0;   // slots/sec — audio-sync momentum
        this._lastTunnelInt = 0;    // last integer of _tunnelPos (slot-wrap detector)
        // Rain mode state
        this._rainDrops = [];
        this._rainConfig = null;
        this._rainConfigKey = '';
        // Domino mode state
        this._dominoDrops = [];
        this._dominoN = 0;
        this._dominoTimer = -1;     // -1 = idle, >= 0 = chain running
        this._dominoResetT = -1;    // -1 = idle, >= 0 = post-fall pause
        // Globe mode state
        this._globeRotation = 0;
        this._globeTileFrames = [];   // per-tile randomized frame index
        this._globeTileFlash  = [];   // per-tile flash intensity (beat hit glow)
        this._globeTileCount  = 0;    // cols*rows when last initialized
        this._globeBeatAccum  = 0;    // accumulates beat energy for frame swaps
        // Lens mode state (magnifying fisheye bubble over a static frame grid)
        this._lensPhase    = 0;       // drift path phase for the moving lens
        this._lensStrength = 0;       // smoothed magnification (eases on beats)
        // Wormhole mode state
        this._wormholePhase = 0;      // continuous outward-flow phase (rings travel)
        this._wormholeSpin  = 0;      // accumulated whole-tunnel rotation
        // Flipbook mode state
        this._flipPos = 0;            // continuous page position (int = page, frac = flip progress)
        // Color-mode post-process scratch canvas
        this._fxCanvas = null;
        this._fxCtx = null;
        // 3D flipbook offscreen buffer (for the fisheye composite)
        this._fbCanvas = null;
        this._fbCtx = null;
        // Paper-texture overlay cache (ported from Origami)
        this._paperTextures = null;
        // Carousel-style audio flywheel velocity (drives flipbook in audio mode)
        this._carouselVel = 0;
        this._flipStep = 0;           // pages advanced last frame → motion-blur amount
        // Domino camera (NaN = uninitialised, snaps to start pos on first frame)
        this._camZ = NaN;
        this._camX = NaN;
        // Burning Frames mode state — a depth-field of floating paper cards, each
        // eaten from its edges by a noise-jagged burn front while it travels in Z;
        // fully consumed cards respawn with the next sampled frame (continuous).
        this._burnCards       = [];   // active floating cards
        this._burnFrameCursor = 0;    // next sampled-frame index handed to a respawned card
        this._burnTravel      = 0;    // monotonic travel clock (drives the Video BG scroll)
        this._burnGustPhase   = 0;    // wind-gust clock (Magic Carpet-style two-sine drive)
        this._burnSparks      = [];   // drifting ember particles off the burn lines
        this._burnGL          = null; // WebGL2 renderer { canvas, gl, prog, vao, U, textures } — lazy
        this._burnGLFailed    = false;// WebGL2 unavailable → permanent Canvas2D-mesh fallback
        this._burnTexFirst    = null; // frame-set signature (first/last refs) so live-webcam
        this._burnTexLast     = null; // frame cycling and resamples refresh the GL textures
        // 3D Gallery mode state (three.js, lazy-loaded like AnamorphicCamera) ─────
        this._g3d = null;            // { THREE, renderer, scene, camera, galleryGroup, ... }
        this._g3dReady = false;
        this._g3dLoading = false;
        this._g3dError = false;
        this._g3dPreset = null;      // built preset: 'tube' | 'sphere' | 'ruben'
        this._g3dTilesPreset = null; // preset the current tile mesh was built for
        this._g3dSizedW = 0;
        this._g3dSizedH = 0;
        this._g3dTextures = [];      // CanvasTexture per sampled frame
        this._g3dTexN = -1;          // frame-set signature (length + first/last refs)…
        this._g3dTexFirst = null;    // …so live-webcam frame cycling is detected even
        this._g3dTexLast = null;     // when the this._frames array ref is reused
        this._g3dTexDirty = false;   // textures rebuilt → tiles must rebuild
        this._g3dTileMats = [];      // tile materials (for live opacity updates)
        this._g3dTiles = [];         // all tile meshes (for back/front depth split)
        this._g3dRowGroups = [];     // per-row groups (tube/ruben rotation)
        this._g3dRowSpeed = [];      // per-row angular speed multiplier
        this._g3dLoopHeight = 0;     // tube vertical scroll wrap distance
        this._g3dAngle = 0;          // gallery spin angle
        this._g3dScroll = 0;         // tube vertical scroll position
        this._g3dSpinVel = 0;        // audio-sync flywheel velocity
        this._g3dFrontPending = false; // front tiles rendered, awaiting post-Anamorphic draw
    }

    // Called on "Restart All" / "Record FX": rewind every mode's animation back to
    // the beginning (keeps the already-extracted frames so it doesn't re-sample).
    restart() {
        this._tunnelPos = 0;
        this._tunnelVelocity = 0;
        this._lastTunnelInt = 0;
        this._wormholePhase = 0;
        this._wormholeSpin = 0;
        this._flipPos = 0;
        this._carouselVel = 0;
        this._flipStep = 0;
        this._camZ = NaN;
        this._camX = NaN;
        this._globeRotation = 0;
        this._beatBg = 0;
        this._beatPeak = 0;
        this._particles = [];
        // force per-mode systems to re-initialize from a clean state next frame
        this._rainConfigKey = '';
        this._dominoN = 0;
        this._dominoTimer = -1;
        this._dominoResetT = -1;
        this._globeTileCount = 0;
        this._globeBeatAccum = 0;
        this._lensPhase = 0;
        this._lensStrength = 0;
        // 3D Gallery: rewind spin/scroll (keep the loaded scene + textures warm)
        this._g3dAngle = 0;
        this._g3dScroll = 0;
        this._g3dSpinVel = 0;
        // Burning Frames: rebuild the floating card field from scratch
        this._burnCards = [];
        this._burnFrameCursor = 0;
        this._burnTravel = 0;
        this._burnGustPhase = 0;
        this._burnSparks = [];
    }

    _getVideoKey(media, maxFrames) {
        if (!media) return null;
        const src = media.currentSrc || media.src || '';
        return `${src}|${maxFrames}`;
    }

    _captureFrame(media, crop, w, h) {
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx2 = c.getContext('2d');
        ctx2.fillStyle = '#000';
        ctx2.fillRect(0, 0, w, h);
        ctx2.drawImage(media, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, w, h);
        return c;
    }

    // ── Seek through video timeline and extract N distinct still frames ───────

    async _sampleFrames(video, maxFrames, crop, W, H) {
        this._sampling = true;
        this._sampleProgress = 0;

        const cW = Math.max(64, Math.round(W * 0.5));
        const cH = Math.max(64, Math.round(H * 0.5));
        const newFrames = [];
        const duration = video.duration;
        const wasPlaying = !video.paused;
        if (wasPlaying) video.pause();
        const savedTime = video.currentTime;

        for (let i = 0; i < maxFrames; i++) {
            const t = maxFrames === 1 ? 0.5 : i / (maxFrames - 1);
            video.currentTime = t * duration;
            await new Promise(resolve => {
                const bail = setTimeout(resolve, 800);
                video.addEventListener('seeked', () => { clearTimeout(bail); resolve(); }, { once: true });
            });
            newFrames.push(this._captureFrame(video, crop, cW, cH));
            this._sampleProgress = (i + 1) / maxFrames;
        }

        if (newFrames.length > 0) {
            this._framesRaw = newFrames;
            this._frames = newFrames;
            this._vignBakedValue = 0;        // re-bake vignette next frame if enabled
            this._particles = [];
            this._tunnelPos = 0;
            this._tunnelVelocity = 0;
            this._lastTunnelInt = 0;
            this._rainConfigKey  = '';
            this._dominoN        = 0;
            this._globeTileCount = 0;
            this._wormholePhase  = 0;
            this._wormholeSpin   = 0;
            this._flipPos        = 0;
            this._carouselVel    = 0;
            this._burnCards      = [];
            this._burnFrameCursor = 0;
            this._burnSparks     = [];
        }

        try { video.currentTime = savedTime; } catch (_) {}
        if (wasPlaying) video.play().catch(() => {});
        this._sampling = false;
    }

    // ── Tunnel particle system ────────────────────────────────────────────────

    _ensureParticles(N) {
        if (N === 0) { this._particles = []; return; }
        while (this._particles.length < N) {
            this._particles.push({
                xOff: (Math.random() - 0.5) * 0.06,
                yOff: (Math.random() - 0.5) * 0.06,
            });
        }
        if (this._particles.length > N) this._particles.length = N;
    }

    _updateParticles(dt, motionSpeedS, N, bass, mid, treble, beatPeak, jitterEnabled, jitter) {
        if (N === 0) return;

        if (motionSpeedS > 0) {
            this._tunnelPos += (N / motionSpeedS) * dt * (1.0 + beatPeak * 0.45);
        } else {
            const dominantFreq = Math.max(bass, mid, treble);
            if (dominantFreq > 0.03) {
                const targetVel = dominantFreq * 12;
                const accelLerp = 1 - Math.pow(0.02, dt);
                this._tunnelVelocity += (targetVel - this._tunnelVelocity) * accelLerp;
            } else {
                this._tunnelVelocity *= Math.pow(0.005, dt);
                if (Math.abs(this._tunnelVelocity) < 0.01) this._tunnelVelocity = 0;
            }
            this._tunnelPos += this._tunnelVelocity * dt;
        }

        const curInt = Math.floor(this._tunnelPos);
        if (curInt !== this._lastTunnelInt) {
            const slotI = ((curInt % N) + N) % N;
            const spread = 0.06 * (jitterEnabled ? (1 + jitter / 5) : 1);
            if (slotI < this._particles.length) {
                this._particles[slotI].xOff = (Math.random() - 0.5) * spread;
                this._particles[slotI].yOff = (Math.random() - 0.5) * spread;
            }
            this._lastTunnelInt = curInt;
        }
    }

    // ── Rain particle system ──────────────────────────────────────────────────

    _initRain(N, frameCount, dirAngle, spawnCX, spawnCY, spawnSpread, sizeMin, sizeMax, wobbleAmp, wobbleFreq, spinMult, vortex) {
        const rad = dirAngle * Math.PI / 180;
        const mdx = Math.sin(rad);
        const mdy = Math.cos(rad);
        const pdx = Math.cos(rad);
        const pdy = -Math.sin(rad);

        this._rainConfig = { vortex, mdx, mdy, pdx, pdy, spawnCX, spawnCY, spawnSpread, sizeMin, sizeMax, wobbleAmp, wobbleFreq, spinMult };
        this._rainDrops  = [];

        for (let i = 0; i < N; i++) {
            const sz = sizeMin + Math.random() * Math.max(0, sizeMax - sizeMin);
            if (vortex) {
                this._rainDrops.push({
                    vortex:  true,
                    theta:   (i / N) * Math.PI * 2 + Math.random() * 0.5,
                    radius:  0.04 + Math.random() * 0.20,
                    drSpeed: 0.035 + Math.random() * 0.04,
                    angSpd:  (0.8 + Math.random() * 0.8) * (Math.random() < 0.5 ? 1 : -1),
                    sz, rot: Math.random() * Math.PI * 2,
                    rotSpd:  spinMult * (Math.random() - 0.5) * 2,
                    frameIdx: i % Math.max(1, frameCount),
                });
            } else {
                const spread = (Math.random() - 0.5) * 2 * spawnSpread;
                const pathT  = (Math.random() - 0.5) * 1.5;
                this._rainDrops.push({
                    vortex:  false,
                    x: mdx * pathT + pdx * spread + spawnCX,
                    y: mdy * pathT + pdy * spread + spawnCY,
                    vn: 0.18 + Math.random() * 0.32,
                    wobblePhase: Math.random() * Math.PI * 2,
                    sz, rot: Math.random() * Math.PI * 2,
                    rotSpd: spinMult * (Math.random() - 0.5) * 2,
                    frameIdx: i % Math.max(1, frameCount),
                });
            }
        }
    }

    _updateRain(dt, motionSpeedS, N, frameCount, bass, mid, treble, beatPeak) {
        if (N === 0 || this._rainDrops.length === 0 || !this._rainConfig) return;

        const c = this._rainConfig;
        let speedFactor;
        if (motionSpeedS <= 0) {
            const dom = Math.max(bass, mid, treble);
            if (dom > 0.08) {
                const targetVel = dom * 10;
                const accelLerp = 1 - Math.pow(0.02, dt);
                this._carouselVel += (targetVel - this._carouselVel) * accelLerp;
            } else {
                this._carouselVel *= Math.pow(0.005, dt);
                if (Math.abs(this._carouselVel) < 0.05) this._carouselVel = 0;
            }
            speedFactor = 0.3 + this._carouselVel * 0.8;
        } else {
            speedFactor = motionSpeedS / 5.0;
        }
        const beatMult = 1.0 + beatPeak * 0.8;

        for (const d of this._rainDrops) {
            d.rot += d.rotSpd * dt;
            if (c.vortex) {
                d.theta  += d.angSpd  * speedFactor * dt;
                d.radius += d.drSpeed * speedFactor * beatMult * dt;
                if (d.radius > 0.62) {
                    d.radius   = 0.03 + Math.random() * 0.05;
                    d.theta    = Math.random() * Math.PI * 2;
                    d.sz       = c.sizeMin + Math.random() * Math.max(0, c.sizeMax - c.sizeMin);
                    d.frameIdx = Math.floor(Math.random() * Math.max(1, frameCount));
                    d.drSpeed  = 0.035 + Math.random() * 0.04;
                    d.angSpd   = (0.8 + Math.random() * 0.8) * (d.angSpd >= 0 ? 1 : -1);
                    d.rotSpd   = c.spinMult * (Math.random() - 0.5) * 2;
                }
            } else {
                d.x += c.mdx * d.vn * speedFactor * beatMult * dt;
                d.y += c.mdy * d.vn * speedFactor * beatMult * dt;
                const proj = c.mdx * d.x + c.mdy * d.y;
                if (proj > 0.74) {
                    const spread = (Math.random() - 0.5) * 2 * c.spawnSpread;
                    d.x  = -c.mdx * 0.74 + c.pdx * spread + c.spawnCX;
                    d.y  = -c.mdy * 0.74 + c.pdy * spread + c.spawnCY;
                    d.vn = 0.18 + Math.random() * 0.32;
                    d.sz = c.sizeMin + Math.random() * Math.max(0, c.sizeMax - c.sizeMin);
                    d.rot = Math.random() * Math.PI * 2;
                    d.rotSpd = c.spinMult * (Math.random() - 0.5) * 2;
                    d.wobblePhase = Math.random() * Math.PI * 2;
                    d.frameIdx = Math.floor(Math.random() * Math.max(1, frameCount));
                }
            }
        }
    }

    _drawRain(ctx, W, H, masterZoom, frameOpacity, time) {
        if (this._frames.length === 0 || this._rainDrops.length === 0 || !this._rainConfig) return;

        const c = this._rainConfig;
        const sorted = this._rainDrops.slice().sort((a, b) => a.sz - b.sz);

        for (const d of sorted) {
            let dispX, dispY, alpha;

            if (c.vortex) {
                dispX = c.spawnCX + Math.cos(d.theta) * d.radius;
                dispY = c.spawnCY + Math.sin(d.theta) * d.radius;
                const rFade  = Math.max(0, Math.min(1, (0.60 - d.radius) / 0.08));
                const iFade  = Math.min(1, d.radius / 0.06);
                alpha = Math.min(1, 0.3 + d.sz * 1.3) * rFade * iFade * frameOpacity;
            } else {
                const wobble = c.wobbleAmp * Math.sin(time * c.wobbleFreq + d.wobblePhase);
                dispX = d.x + c.pdx * wobble;
                dispY = d.y + c.pdy * wobble;
                const proj     = c.mdx * d.x + c.mdy * d.y;
                const farFade  = Math.max(0, Math.min(1, (0.68 - proj) / 0.10));
                const nearFade = Math.max(0, Math.min(1, (proj + 0.68) / 0.10));
                alpha = Math.min(1, 0.30 + d.sz * 1.3) * Math.min(farFade, nearFade) * frameOpacity;
            }

            if (alpha <= 0.01) continue;

            const px = W / 2 + dispX * W;
            const py = H / 2 + dispY * H;
            const fw = d.sz * masterZoom * W;
            const fh = d.sz * masterZoom * H;
            if (fw < 2 || fh < 2) continue;

            const img = this._frames[d.frameIdx % this._frames.length];
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.translate(px, py);
            ctx.rotate(d.rot);
            ctx.drawImage(img, -fw / 2, -fh / 2, fw, fh);
            ctx.restore();
        }

        ctx.globalAlpha = 1.0;
    }

    // ── Domino chain-reaction mode ────────────────────────────────────────────

    _initDomino(N, frameCount) {
        this._dominoDrops = [];
        for (let i = 0; i < N; i++) {
            const t = N > 1 ? i / (N - 1) : 0.5;
            this._dominoDrops.push({
                t,
                fallProgress: 0.0,
                frameIdx: i % Math.max(1, frameCount),
            });
        }
        this._dominoN = N;
        this._dominoTimer = -1;
        this._dominoResetT = -1;
    }

    _updateDomino(dt, motionSpeedS, N, beatOnset) {
        if (N === 0 || this._dominoDrops.length === 0) return;

        const speed        = motionSpeedS > 0 ? motionSpeedS / 5.0 : 1.0;
        // cascadeDelay tuned so the falling frame visually reaches the next one ~just in time
        const cascadeDelay = 0.14 / speed;
        const fallDuration = 0.40 / speed;

        // ── Post-fall pause ───────────────────────────────────────────
        if (this._dominoResetT >= 0) {
            this._dominoResetT += dt;
            if (this._dominoResetT > 1.0) {
                for (const d of this._dominoDrops) d.fallProgress = 0;
                this._dominoResetT = -1;
                this._dominoTimer  = -1;
            }
            return;
        }

        // ── Trigger: auto (speed>0) or beat kick (speed=0) ────────────
        if (this._dominoTimer < 0) {
            const fire = motionSpeedS > 0 ? true : beatOnset > 0.06;
            if (fire) this._dominoTimer = 0;
            else return;
        }

        this._dominoTimer += dt;

        // ── Cascade each domino in sequence ───────────────────────────
        let allFallen = true;
        for (let i = 0; i < this._dominoDrops.length; i++) {
            const d         = this._dominoDrops[i];
            const startAt   = i * cascadeDelay;
            const elapsed   = this._dominoTimer - startAt;
            if (elapsed < 0) { allFallen = false; continue; }
            d.fallProgress  = Math.min(1.0, elapsed / fallDuration);
            if (d.fallProgress < 1.0) allFallen = false;
        }

        if (allFallen && this._dominoResetT < 0) this._dominoResetT = 0;
    }

    // Temple-Run-style domino: a perspective camera runs forward along the chain,
    // chasing the falling wavefront. Cards are placed in true 3D world space;
    // each pivots at its foot and the camera geometry gives natural foreshortening.
    _drawDomino(ctx, W, H, masterZoom, frameOpacity,
                nearX, _nearY, _nearZoom, farX, _farY, _farZoom,
                curveEnabled, curveVal, zigzagEnabled, zigzagVal) {
        const N = this._dominoDrops.length;
        if (!this._frames.length || !N) return;

        // ── World-space parameters ────────────────────────────────────
        const FOCAL   = H * 0.70;                   // perspective focal length (px)
        const CARD_H  = 2.0 * masterZoom;           // card world height
        const CAM_H   = CARD_H * 0.42;             // camera eye-height (lower = more dramatic)
        const SPACING = CARD_H * 0.54;             // foot-to-foot spacing along Z
        const START_Z = -SPACING * 1.6;            // camera rest Z (behind card 0)

        // Build world X,Z: chain drifts laterally from nearX→farX, with curve/zigzag
        const wpos = Array.from({ length: N }, (_, i) => {
            const t = N > 1 ? i / (N - 1) : 0.5;
            let wx = (nearX * (1 - t) + farX * t) * 2.4;
            if (curveEnabled)  wx += Math.sin(t * Math.PI) * (curveVal / 340);
            if (zigzagEnabled) wx += (i % 2 === 0 ? 1 : -1) * (zigzagVal / 520);
            return { x: wx, z: i * SPACING };
        });

        // ── Camera follow: chase the wavefront with lag ───────────────
        // Wavefront = furthest card that has started falling
        let wfIdx = 0;
        for (let i = 0; i < N; i++) {
            if (this._dominoDrops[i].fallProgress > 0.01) wfIdx = i;
        }
        const isResetting = this._dominoResetT >= 0;
        const lagIdx  = Math.max(0, wfIdx - 2);
        const tgtZ    = isResetting ? START_Z : wpos[lagIdx].z + START_Z;
        const tgtX    = isResetting ? 0       : wpos[lagIdx].x * 0.6; // partial X follow
        if (isNaN(this._camZ)) { this._camZ = tgtZ; this._camX = tgtX; } // snap on first frame
        this._camZ += (tgtZ - this._camZ) * 0.08;
        this._camX += (tgtX - this._camX) * 0.08;

        // ── Perspective projection ─────────────────────────────────────
        // World Y: 0 = ground, +Y = up; screen Y: H/2 = horizon, +y = down.
        // proj_y = H/2 + (CAM_H − world_y) * s  →  ground below horizon ✓
        const proj = (wx, wy, wz) => {
            const rz = wz - this._camZ;
            if (rz < 0.06) return null;
            const s = FOCAL / rz;
            return { sx: W / 2 + (wx - this._camX) * s, sy: H / 2 + (CAM_H - wy) * s, s };
        };

        // ── Draw far → near (painter's order) ─────────────────────────
        for (let i = N - 1; i >= 0; i--) {
            const d   = this._dominoDrops[i];
            const wp  = wpos[i];
            const img = this._frames[d.frameIdx % this._frames.length];
            const CARD_W = CARD_H * (img.width / img.height);

            const foot = proj(wp.x, 0, wp.z);
            if (!foot) continue;    // behind camera

            // Gravity easing + soft landing bounce
            let eased = Math.pow(d.fallProgress, 1.65);
            if (d.fallProgress > 0.84) {
                const b = (d.fallProgress - 0.84) / 0.16;
                eased += Math.sin(b * Math.PI * 2.0) * 0.024 * (1 - b);
            }
            const theta = eased * Math.PI * 0.52;  // 0 = standing, π/2 ≈ flat
            const cosT  = Math.cos(theta);
            const sinT  = Math.sin(theta);

            // Contact shadow: spreads forward as card falls
            if (0.26 * frameOpacity > 0.01) {
                const smid = proj(wp.x, 0, wp.z + CARD_H * sinT * 0.48);
                if (smid) {
                    const sw = CARD_W * foot.s * (0.45 + 0.72 * eased);
                    ctx.save();
                    ctx.globalAlpha = 0.26 * frameOpacity;
                    ctx.fillStyle   = '#000';
                    ctx.beginPath();
                    ctx.ellipse(smid.sx, smid.sy + 2, sw / 2, Math.max(2, sw * 0.07), 0, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                }
            }

            // Project all 4 corners of the card quad exactly.
            const P_FL = proj(wp.x - CARD_W / 2, 0,             wp.z);
            const P_FR = proj(wp.x + CARD_W / 2, 0,             wp.z);
            const P_TL = proj(wp.x - CARD_W / 2, CARD_H * cosT, wp.z + CARD_H * sinT);
            const P_TR = proj(wp.x + CARD_W / 2, CARD_H * cosT, wp.z + CARD_H * sinT);
            if (!P_FL || !P_FR || !P_TL || !P_TR) continue;

            const edgePt = (A, B, t) => ({ sx: A.sx + (B.sx - A.sx) * t, sy: A.sy + (B.sy - A.sy) * t });

            // Seam-free overlap via true triangle dilation: each clip triangle is grown
            // outward by M px (offset every edge along its outward normal, then re-solve
            // the vertices as offset-line intersections). The texture transform below is
            // left EXACT — only the clip grows — so edges stay perfectly straight while
            // adjacent strips/triangles overlap, hiding all clip anti-alias seams.
            const M = 1.4;
            const offEdge = (P, Q, I) => {                 // outward-offset line of edge P→Q (interior = I)
                const dx = Q.sx - P.sx, dy = Q.sy - P.sy, l = Math.hypot(dx, dy) || 1;
                let nx = dy / l, ny = -dx / l;
                if (nx * (I.sx - P.sx) + ny * (I.sy - P.sy) > 0) { nx = -nx; ny = -ny; }
                return { x: P.sx + nx * M, y: P.sy + ny * M, dx, dy };
            };
            const lineX = (L1, L2) => {                    // intersection of two parametric lines
                const den = L1.dx * L2.dy - L1.dy * L2.dx;
                if (Math.abs(den) < 1e-6) return { sx: L1.x, sy: L1.y };
                const t = ((L2.x - L1.x) * L2.dy - (L2.y - L1.y) * L2.dx) / den;
                return { sx: L1.x + L1.dx * t, sy: L1.y + L1.dy * t };
            };
            const clipDilated = (A, B, C) => {             // clip to triangle (A,B,C) grown by M
                const lAB = offEdge(A, B, C), lBC = offEdge(B, C, A), lCA = offEdge(C, A, B);
                const A2 = lineX(lCA, lAB), B2 = lineX(lAB, lBC), C2 = lineX(lBC, lCA);
                ctx.beginPath();
                ctx.moveTo(A2.sx, A2.sy); ctx.lineTo(B2.sx, B2.sy); ctx.lineTo(C2.sx, C2.sy);
                ctx.closePath(); ctx.clip();
            };

            const STRIPS = 5;
            const iw = img.width, ih = img.height;
            ctx.save();
            ctx.globalAlpha = frameOpacity;
            // Bound everything to the exact card silhouette so the dilated strip clips
            // can overlap freely inside without poking whiskers past the card edges.
            ctx.beginPath();
            ctx.moveTo(P_TL.sx, P_TL.sy); ctx.lineTo(P_TR.sx, P_TR.sy);
            ctx.lineTo(P_FR.sx, P_FR.sy); ctx.lineTo(P_FL.sx, P_FL.sy);
            ctx.closePath(); ctx.clip();
            for (let s = 0; s < STRIPS; s++) {
                const t0 = s / STRIPS, t1 = (s + 1) / STRIPS;
                const BL = edgePt(P_FL, P_TL, t0);
                const BR = edgePt(P_FR, P_TR, t0);
                const TL = edgePt(P_FL, P_TL, t1);
                const TR = edgePt(P_FR, P_TR, t1);
                const srcY = (1 - t1) * ih, srcH = (t1 - t0) * ih;
                if (srcH < 0.5) continue;

                // Triangle 1 (TL, TR, BL) — exact affine pins these 3 corners
                ctx.save();
                clipDilated(TL, TR, BL);
                ctx.setTransform(
                    (TR.sx - TL.sx) / iw,    (TR.sy - TL.sy) / iw,
                    (BL.sx - TL.sx) / srcH,   (BL.sy - TL.sy) / srcH,
                    TL.sx, TL.sy
                );
                ctx.drawImage(img, 0, srcY, iw, srcH, 0, 0, iw, srcH);
                ctx.restore();

                // Triangle 2 (TR, BR, BL) — exact affine pins the other 3 corners
                ctx.save();
                clipDilated(TR, BR, BL);
                ctx.setTransform(
                    (BR.sx - BL.sx) / iw,    (BR.sy - BL.sy) / iw,
                    (BR.sx - TR.sx) / srcH,   (BR.sy - TR.sy) / srcH,
                    TR.sx + BL.sx - BR.sx, TR.sy + BL.sy - BR.sy
                );
                ctx.drawImage(img, 0, srcY, iw, srcH, 0, 0, iw, srcH);
                ctx.restore();
            }
            ctx.setTransform(1, 0, 0, 1, 0, 0);

            // Shade the card face with the exact quad polygon
            const shade = 0.30 * eased;
            if (shade > 0.01) {
                ctx.globalCompositeOperation = 'multiply';
                ctx.fillStyle = `rgba(0,0,0,${shade.toFixed(3)})`;
                ctx.beginPath();
                ctx.moveTo(P_TL.sx, P_TL.sy); ctx.lineTo(P_TR.sx, P_TR.sy);
                ctx.lineTo(P_FR.sx, P_FR.sy); ctx.lineTo(P_FL.sx, P_FL.sy);
                ctx.closePath(); ctx.fill();
                ctx.globalCompositeOperation = 'source-over';
            }
            ctx.restore();
        }
        ctx.globalAlpha = 1.0;
    }

    // ── Globe mode rendering ──────────────────────────────────────────────────

    _initGlobeTiles(count, N) {
        this._globeTileFrames = Array.from({ length: count }, () => Math.floor(Math.random() * N));
        this._globeTileFlash  = new Float32Array(count);
        this._globeTileCount  = count;
        this._globeBeatAccum  = 0;
    }

    _drawGlobe(ctx, W, H, masterZoom, frameOpacity, tiltH, tiltV, fisheye, dt, bass, beatPeak) {
        if (!this._frames.length) return;
        const N = this._frames.length;
        const cols = Math.max(5, Math.round(Math.sqrt(N * (W / H) * 1.2)));
        const rows = Math.max(3, Math.round(N / cols));
        const total = cols * rows;

        if (this._globeTileCount !== total) this._initGlobeTiles(total, N);

        // Audio-driven frame swapping: beat peaks randomly reassign tiles
        const swapEnergy = beatPeak * 3.5 + bass * 0.6;
        this._globeBeatAccum += swapEnergy * dt;
        while (this._globeBeatAccum >= 1.0) {
            this._globeBeatAccum -= 1.0;
            const swapCount = Math.max(1, Math.round(total * (0.04 + bass * 0.18)));
            for (let s = 0; s < swapCount; s++) {
                const idx = Math.floor(Math.random() * total);
                this._globeTileFrames[idx] = Math.floor(Math.random() * N);
                this._globeTileFlash[idx]  = 1.0;
            }
        }
        // Decay beat flash
        const decay = 5.0 * dt;
        for (let i = 0; i < total; i++) {
            if (this._globeTileFlash[i] > 0) this._globeTileFlash[i] = Math.max(0, this._globeTileFlash[i] - decay);
        }

        const D = 1.8 + fisheye * 2.0;
        const minDim = Math.min(W, H);
        const thH = tiltH * Math.PI / 180;
        const thV = tiltV * Math.PI / 180;
        const cosThH = Math.cos(thH), sinThH = Math.sin(thH);
        const cosThV = Math.cos(thV), sinThV = Math.sin(thV);

        const tiles = [];
        for (let r = 0; r < rows; r++) {
            const lat = ((r / (rows - 1)) - 0.5) * Math.PI * 0.84;
            const cosLat = Math.cos(lat);
            const sinLat = Math.sin(lat);
            for (let c = 0; c < cols; c++) {
                const tileIdx = r * cols + c;
                const lon = (c / cols) * Math.PI * 2 + this._globeRotation;
                let x3 = cosLat * Math.sin(lon);
                let y3 = -sinLat;
                let z3 = cosLat * Math.cos(lon);
                // vertical tilt (X-axis)
                const y3v =  y3 * cosThV + z3 * sinThV;
                const z3v = -y3 * sinThV + z3 * cosThV;
                y3 = y3v; z3 = z3v;
                // horizontal tilt (Y-axis)
                const x3h = x3 * cosThH - z3 * sinThH;
                const z3h = x3 * sinThH + z3 * cosThH;
                x3 = x3h; z3 = z3h;
                const depth = D - z3;
                if (depth < 0.05) continue;
                const scale  = 1.0 / depth;
                const px     = W * 0.5 + x3 * scale * masterZoom * minDim * 0.52;
                const py     = H * 0.5 + y3 * scale * masterZoom * minDim * 0.52;
                const base   = scale * masterZoom * minDim * (2 * Math.PI / cols) * 0.72;
                const tileW  = base * Math.max(0.3, cosLat);
                const tileH  = base * 1.25;
                const vis    = (z3 + 1.0) * 0.5;
                const flash  = this._globeTileFlash[tileIdx];
                const alpha  = Math.min(1, (0.06 + vis * 0.94 + flash * 0.6) * frameOpacity);
                tiles.push({ px, py, tileW, tileH, alpha, z3, tileIdx });
            }
        }
        tiles.sort((a, b) => a.z3 - b.z3);
        for (const tile of tiles) {
            if (tile.alpha < 0.02 || tile.tileW < 2) continue;
            const img = this._frames[this._globeTileFrames[tile.tileIdx] % N];
            if (!img) continue;
            ctx.globalAlpha = tile.alpha;
            ctx.drawImage(img, tile.px - tile.tileW / 2, tile.py - tile.tileH / 2, tile.tileW, tile.tileH);
        }
        ctx.globalAlpha = 1;
    }

    // Cached vignette sprite — a radial alpha gradient (clear centre → black edge)
    // drawn OVER each individual frame tile so every extracted frame gets its own
    // darkened border. Built once, then cheaply stamped per tile via drawImage.
    _getVignetteSprite() {
        if (!this._vignetteSprite) {
            const S = 128;
            const c = document.createElement('canvas');
            c.width = c.height = S;
            const g = c.getContext('2d');
            const grad = g.createRadialGradient(S / 2, S / 2, S * 0.40, S / 2, S / 2, S * 0.74);
            grad.addColorStop(0, 'rgba(0,0,0,0)');
            grad.addColorStop(1, 'rgba(0,0,0,1)');
            g.fillStyle = grad;
            g.fillRect(0, 0, S, S);
            this._vignetteSprite = c;
        }
        return this._vignetteSprite;
    }

    // Rebuilds this._frames from the pristine this._framesRaw, baking a per-frame
    // vignette (darkened edges) into each tile so it shows in EVERY render mode.
    // v=0 → frames ARE the raw tiles (no copies). Larger v → stronger / wider edge
    // darkening via repeated stamping (supports the extended 0–3 range).
    _ensureVignetteBake(vignette) {
        const v = vignette > 0.001 ? Math.min(3, vignette) : 0;
        if (v === this._vignBakedValue && this._frames.length === this._framesRaw.length) return;
        if (v === 0) {
            this._frames = this._framesRaw;
        } else {
            const sprite = this._getVignetteSprite();
            this._frames = this._framesRaw.map(raw => {
                const c = document.createElement('canvas');
                c.width = raw.width; c.height = raw.height;
                const g = c.getContext('2d');
                g.drawImage(raw, 0, 0);
                let remaining = v;                    // repeated stamps → up to 3× strength
                while (remaining > 0.001) {
                    g.globalAlpha = Math.min(1, remaining);
                    g.drawImage(sprite, 0, 0, c.width, c.height);
                    remaining -= 1;
                }
                g.globalAlpha = 1;
                return c;
            });
        }
        this._vignBakedValue = v;
    }

    // ── Lens mode rendering ─────────────────────────────────────────────────────
    // A STATIC grid of frame tiles fills the whole screen. A magnifying "lens"
    // (fisheye bubble) sits at (lensX, lensY): tiles inside its radius bulge larger
    // and spread apart; tiles outside keep their normal grid size. Only the lens
    // moves (audio- or time-driven) — the grid itself never spins or shifts.
    _drawLensGrid(ctx, W, H, masterZoom, frameOpacity, lensX, lensY, lensRadius, lensStrength, frameDistance) {
        const N = this._frames.length;
        if (N === 0) return;

        const minDim = Math.min(W, H);
        const sample = this._frames[0];
        const aspect = sample.width / sample.height;

        // Base (unmagnified) tile size — Master Zoom controls grid density
        const tileH0 = minDim * 0.15 * Math.max(0.2, masterZoom);
        const tileW0 = tileH0 * aspect;
        const stepX  = tileW0;
        const stepY  = tileH0;
        if (stepX < 2 || stepY < 2) return;

        // Frame Distance (2–20) → gap on all sides; 2 = touching, 20 = wide gaps.
        // The drawn tile shrinks inside its cell, so the gap scales with the lens
        // magnification automatically and stays consistent across the bulge.
        const gapFrac   = Math.max(0, Math.min(0.55, ((frameDistance - 2) / 18) * 0.55));
        const drawScale = gapFrac > 0.001 ? (1 - gapFrac) : 1.02;   // tiny overlap when no gap

        // A few extra rows/cols of margin so edges stay filled as tiles shrink
        const cols = Math.ceil(W / stepX) + 4;
        const rows = Math.ceil(H / stepY) + 4;
        const ox = W / 2 - ((cols - 1) / 2) * stepX;
        const oy = H / 2 - ((rows - 1) / 2) * stepY;

        const invR = 1 / Math.max(1, lensRadius);
        const cells = [];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const bx = ox + c * stepX;
                const by = oy + r * stepY;
                const dx = bx - lensX, dy = by - lensY;
                const dist = Math.hypot(dx, dy);
                const t = dist * invR;
                // Smooth fisheye bulge: peaks at the lens centre, 1.0 at its rim.
                // Continuous (f²=0 at t=1) so there is no hard ring/pile-up seam.
                let mag = 1;
                if (t < 1) {
                    const f = Math.cos(t * Math.PI / 2);
                    mag = 1 + lensStrength * f * f;
                }
                // Tiles near the lens are pushed outward (spread) AND scaled up.
                const px = lensX + dx * mag;
                const py = lensY + dy * mag;
                const h = Math.abs((r * 73856093) ^ (c * 19349663));   // stable per-cell frame
                cells.push({ px, py, mag, dist, idx: h % N });
            }
        }

        // Draw far (edge) tiles first so magnified centre tiles overlap on top
        cells.sort((a, b) => b.dist - a.dist);

        ctx.globalAlpha = frameOpacity;
        for (const cell of cells) {
            const dw = tileW0 * cell.mag * drawScale;
            const dh = tileH0 * cell.mag * drawScale;
            if (dw < 1 || dh < 1) continue;
            const img = this._frames[cell.idx];
            if (!img) continue;
            ctx.drawImage(img, cell.px - dw / 2, cell.py - dh / 2, dw, dh);
        }
        ctx.globalAlpha = 1;
    }

    // ── Wormhole mode ─────────────────────────────────────────────────────────
    // Tiles the sampled frames into concentric ANGULAR rings (spoke × depth) that
    // recede toward an empty central hole — the classic "frame tunnel" wall.

    _drawWormhole(ctx, W, H, masterZoom, frameOpacity, spokes, holeFrac, twistDeg, spin, beatPeak,
                  startX = 0, startY = 0, curveEnabled = false, curveVal = 0, zigzagEnabled = false, zigzagVal = 0, bgReverse = false,
                  frameDistance = 8) {
        const N = this._frames.length;
        if (N === 0) return;

        const cx = W / 2, cy = H / 2;
        const minDim = Math.min(W, H);

        const S = Math.max(8, Math.round(spokes));
        const overlap = 1.18;                                  // >1 so tiles seam together (no gaps)
        const growth  = 1 + (Math.PI * 2 / S) * overlap;       // geometric radius step → perspective
        // Frame Distance (>8) shrinks each ring tile to open gaps on all sides;
        // <=8 keeps the original seamed wall so existing presets look unchanged.
        const gapFrac     = Math.max(0, Math.min(0.5, ((frameDistance - 8) / 12) * 0.5));
        const drawOverlap = overlap * (1 - gapFrac);

        const beat = 1 + beatPeak * 0.08;                      // subtle breathing on beats
        const Rmax = minDim * 0.70 * Math.max(0.2, masterZoom) * beat;
        const Rmin = Math.max(minDim * 0.015, Rmax * Math.min(0.6, Math.max(0.04, holeFrac)));
        if (Rmin >= Rmax || growth <= 1.0001) return;

        const twist    = twistDeg * Math.PI / 180;
        const logRatio = Math.log(Rmax / Rmin);

        // Continuous outward flow; baseSerial keeps each physical ring's frame stable as it travels
        const phaseTotal = this._wormholePhase;
        const phase      = ((phaseTotal % 1) + 1) % 1;
        const baseSerial = Math.floor(phaseTotal);
        const startRadius = Rmin * Math.pow(growth, phase);

        // ── Camera follow: chase/glide along the wormhole path ───────────
        // Calculate camera position at the near plane (dNorm = 1)
        const curveAmp = curveEnabled ? (curveVal / 250) * minDim * 0.35 : 0;
        const zigzagAmp = zigzagEnabled ? (zigzagVal / 250) * minDim * 0.12 : 0;
        const curveFreq = 0.8;
        const zigzagFreq = 2.4;

        const uCam = phaseTotal;
        const camX = (curveEnabled ? Math.sin(uCam * curveFreq) * curveAmp : 0) +
                     (zigzagEnabled ? Math.cos(uCam * zigzagFreq) * zigzagAmp : 0);
        const camY = (curveEnabled ? Math.cos(uCam * curveFreq * 0.7) * curveAmp : 0) +
                     (zigzagEnabled ? Math.sin(uCam * zigzagFreq * 1.3) * zigzagAmp : 0);

        let radius = startRadius;
        let ringIdx = 0;
        // Draw inner (small/far) rings first so outer (large/near) rings paint on top
        while (radius <= Rmax) {
            const serial = baseSerial - ringIdx;               // stable id per physical ring
            const dNorm  = Math.log(radius / Rmin) / logRatio; // 0 at hole edge, 1 at rim
            const tileW  = (Math.PI * 2 * radius / S) * drawOverlap;
            const tileH  = radius * (growth - 1) * drawOverlap;
            if (tileW < 1.5) { radius *= growth; ringIdx++; continue; }

            const holeFade  = Math.min(1, dNorm / 0.10);       // dissolve into the hole
            const rimFade   = Math.min(1, (1 - dNorm) / 0.05); // soften the outer edge
            const ringAlpha = frameOpacity * holeFade * Math.max(0.2, rimFade);
            const ringTwist = spin + twist * dNorm;

            // Calculate tunnel path center for this specific ring depth
            // Rings that are deeper (smaller dNorm) represent points further ahead in the tunnel
            const u = phaseTotal + (1 - dNorm) * 3.5;
            const ringX = (curveEnabled ? Math.sin(u * curveFreq) * curveAmp : 0) +
                          (zigzagEnabled ? Math.cos(u * zigzagFreq) * zigzagAmp : 0) +
                          startX * W * (1 - dNorm);
            const ringY = (curveEnabled ? Math.cos(u * curveFreq * 0.7) * curveAmp : 0) +
                          (zigzagEnabled ? Math.sin(u * zigzagFreq * 1.3) * zigzagAmp : 0) +
                          startY * H * (1 - dNorm);

            // Shift ring center relative to the camera position, scaled by perspective
            const rx = ringX - camX;
            const ry = ringY - camY;

            for (let s = 0; s < S; s++) {
                const ang = (s / S) * Math.PI * 2 + ringTwist;
                const px  = cx + Math.cos(ang) * radius + rx * (radius / Rmax);
                const py  = cy + Math.sin(ang) * radius + ry * (radius / Rmax);
                const idx = (((serial * 31 + s * 17) % N) + N) % N;
                const img = this._frames[idx];
                if (!img) continue;

                ctx.save();
                ctx.globalAlpha = Math.max(0, Math.min(1, ringAlpha));
                ctx.translate(px, py);
                ctx.rotate(ang + Math.PI / 2);                 // frame width runs along the ring
                ctx.drawImage(img, -tileW / 2, -tileH / 2, tileW, tileH);
                ctx.restore();
            }

            radius *= growth;
            ringIdx++;
        }
        ctx.globalAlpha = 1.0;
    }

    // ── Flipbook mode ─────────────────────────────────────────────────────────
    // A centered "pad" of pages. The top page (current frame) curls and flips about
    // a hinge edge chosen by `direction` (up / down / left / right), bending as it
    // turns and revealing the next frame beneath — a realistic per-strip page-flip.

    _drawFlipbook(ctx, W, H, masterZoom, frameOpacity, bend, beatPeak, direction) {
        const N = this._frames.length;
        if (N === 0) return;

        const total   = this._flipPos;
        const baseIdx = ((Math.floor(total) % N) + N) % N;
        const p       = total - Math.floor(total);          // 0..1 flip progress
        const curImg  = this._frames[baseIdx];
        const nextImg = this._frames[(baseIdx + 1) % N];
        if (!curImg) return;

        // ── Page geometry (centered, follows the frame aspect) ───────────
        const fa = curImg.width / curImg.height;
        let pageH = H * 0.74 * masterZoom * (1 + beatPeak * 0.04);
        let pageW = pageH * fa;
        const maxW = W * 0.92 * masterZoom;
        if (pageW > maxW) { pageW = maxW; pageH = pageW / fa; }

        const cx = W / 2, cy = H / 2;
        const xL = cx - pageW / 2, yTop = cy - pageH / 2;
        const xR = xL + pageW,     yBot = yTop + pageH;

        const vertical = (direction === 'left' || direction === 'right');

        // ── Base page = the NEXT frame, revealed as the top page lifts ───
        ctx.save();
        ctx.globalAlpha = frameOpacity;
        if (nextImg) ctx.drawImage(nextImg, xL, yTop, pageW, pageH);
        ctx.restore();

        const theta = p * Math.PI;                           // 0 → flat (covers), π → flipped behind

        // Hinge edge + the screen direction the page sweeps away from it
        let hinge, dirSign;
        if      (direction === 'up')   { hinge = yTop; dirSign =  1; }
        else if (direction === 'down') { hinge = yBot; dirSign = -1; }
        else if (direction === 'left') { hinge = xL;   dirSign =  1; }
        else                           { hinge = xR;   dirSign = -1; } // right

        const K       = 16;
        const pageLen = vertical ? pageW : pageH;
        const dL      = pageLen / K;
        const srcStep = vertical ? curImg.width / K : curImg.height / K;

        // ── Crease / contact shadow near the hinge ───────────────────────
        const shadowStrength = Math.sin(theta) * 0.45 * frameOpacity;
        if (shadowStrength > 0.01) {
            const shLen = Math.max(2, pageLen * 0.55 * Math.sin(theta));
            const lo = Math.min(hinge, hinge + dirSign * shLen);
            const g = vertical
                ? ctx.createLinearGradient(hinge, 0, hinge + dirSign * shLen, 0)
                : ctx.createLinearGradient(0, hinge, 0, hinge + dirSign * shLen);
            g.addColorStop(0, `rgba(0,0,0,${shadowStrength.toFixed(3)})`);
            g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.save(); ctx.fillStyle = g;
            if (vertical) ctx.fillRect(lo, yTop, shLen, pageH);
            else          ctx.fillRect(xL, lo, pageW, shLen);
            ctx.restore();
        }

        // ── Flipping page = current frame, curling about the hinge edge ──
        const curlSign = -1;
        let acc = hinge;
        ctx.save();
        for (let i = 0; i < K; i++) {
            const s  = (i + 0.5) / K;                        // 0 hinge → 1 free edge
            const a  = theta + bend * Math.sin(Math.PI * s) * Math.sin(theta) * curlSign;
            const ca = Math.cos(a);
            const d  = dL * ca * dirSign;                    // screen-projected strip extent
            const p0 = acc, p1 = acc + d; acc = p1;
            const lo = Math.min(p0, p1), ext = Math.abs(d);
            if (ext < 0.5) continue;

            const backFace = ca < 0;                         // past edge-on → page back
            const lit   = Math.max(0.12, Math.abs(ca));
            const shade = backFace ? lit * 0.55 : 0.35 + 0.65 * lit;

            ctx.globalAlpha = frameOpacity;
            if (vertical) {
                if (backFace) {
                    ctx.save(); ctx.translate(lo + ext, yTop); ctx.scale(-1, 1);
                    ctx.drawImage(curImg, i * srcStep, 0, srcStep, curImg.height, 0, 0, ext, pageH);
                    ctx.restore();
                } else {
                    ctx.drawImage(curImg, i * srcStep, 0, srcStep, curImg.height, lo, yTop, ext, pageH);
                }
                if (shade < 1) {
                    ctx.globalCompositeOperation = 'multiply';
                    ctx.fillStyle = `rgba(0,0,0,${(1 - shade).toFixed(3)})`;
                    ctx.fillRect(lo, yTop, ext + 0.6, pageH);
                    ctx.globalCompositeOperation = 'source-over';
                }
            } else {
                if (backFace) {
                    ctx.save(); ctx.translate(xL, lo + ext); ctx.scale(1, -1);
                    ctx.drawImage(curImg, 0, i * srcStep, curImg.width, srcStep, 0, 0, pageW, ext);
                    ctx.restore();
                } else {
                    ctx.drawImage(curImg, 0, i * srcStep, curImg.width, srcStep, xL, lo, pageW, ext);
                }
                if (shade < 1) {
                    ctx.globalCompositeOperation = 'multiply';
                    ctx.fillStyle = `rgba(0,0,0,${(1 - shade).toFixed(3)})`;
                    ctx.fillRect(xL, lo, pageW, ext + 0.6);
                    ctx.globalCompositeOperation = 'source-over';
                }
            }
        }
        ctx.restore();
        ctx.globalAlpha = 1.0;
    }

    // 3D Flipbook — an OPEN notebook: two facing curved pages meet at a centre spine
    // with a feathered gutter shadow; a leaf lifts off one side, curls over the spine
    // and lands on the OTHER side (frames move across as you flip); page-edge stacks
    // sit on the outer edges. Rendered to an offscreen buffer, then composited through
    // a barrel/fisheye lens. `direction` = which way pages turn, `bend` = page curl.

    _drawFlipbook3D(ctx, W, H, masterZoom, frameOpacity, beatPeak, direction, motionBlur, vibration) {
        const N = this._frames.length;
        if (N === 0) return;

        if (!this._fbCanvas) {
            this._fbCanvas = document.createElement('canvas');
            this._fbCtx = this._fbCanvas.getContext('2d');
        }
        if (this._fbCanvas.width !== W || this._fbCanvas.height !== H) {
            this._fbCanvas.width = W; this._fbCanvas.height = H;
        }
        const g = this._fbCtx;
        g.clearRect(0, 0, W, H);

        const updown  = (direction === 'up' || direction === 'down');
        const dirSign = (direction === 'left' || direction === 'up') ? 1 : -1;

        g.save();
        if (updown) {                       // render vertical-spine book rotated 90°
            g.translate(W / 2, H / 2);
            g.rotate(Math.PI / 2);
            g.translate(-H / 2, -W / 2);
            this._renderOpenBook(g, H, W, masterZoom, frameOpacity, beatPeak, dirSign, motionBlur, vibration);
        } else {
            this._renderOpenBook(g, W, H, masterZoom, frameOpacity, beatPeak, dirSign, motionBlur, vibration);
        }
        g.restore();

        const strength = 0.09 + beatPeak * 0.03;   // subtle fisheye bulge
        this._warpFisheye(this._fbCanvas, ctx, W, H, strength);
        ctx.globalAlpha = 1.0;
    }

    // Renders the "releasing pages" book in a BW×BH area: the active page lies FLAT
    // and fully visible on one side; the released pages sit at a ~45° tilt on the
    // other side; a leaf lifts off the flat page and swings over to the tilted side.
    // Every page is a single drawImage under an affine tilt — no per-strip warp, so
    // the frame image is never distorted (the gentle curve comes from the fisheye).
    _renderOpenBook(g, BW, BH, mz, fo, beatPeak, dirSign, motionBlur, vibration) {
        const N = this._frames.length;
        if (N === 0) return;

        const total   = this._flipPos;
        const baseIdx = ((Math.floor(total) % N) + N) % N;
        const pRaw    = total - Math.floor(total);
        const curImg  = this._frames[baseIdx];
        const prevImg = this._frames[(baseIdx - 1 + N) % N];
        const prev2   = this._frames[(baseIdx - 2 + N) % N];
        const nextImg = this._frames[(baseIdx + 1) % N];
        if (!curImg) return;

        const fa = curImg.width / curImg.height;
        let pageH = BH * 0.72 * mz * (1 + beatPeak * 0.03);
        let pageW = pageH * fa;
        const maxW = BW * 0.5 * mz;
        if (pageW > maxW) { pageW = maxW; pageH = pageW / fa; }

        const cx = BW / 2, cy = BH / 2;
        const top = cy - pageH / 2;
        const ang  = 46 * Math.PI / 180;                       // released-side tilt (≈45°)
        const cosA = Math.cos(ang);
        const spineX = cx - pageW * (1 - cosA) / 2;            // centre the spread

        g.save();
        if (dirSign < 0) { g.translate(BW, 0); g.scale(-1, 1); }

        // One page: local x∈[0,pageW] from the spine, tilted by an affine (sScale =
        // signed horizontal foreshorten, lean = vertical shear → parallelogram).
        const drawPage = (img, sScale, lean, shade, alpha) => {
            if (!img || Math.abs(sScale) < 0.02) return;
            g.save();
            g.translate(spineX, cy);
            g.transform(sScale, 0, lean, 1, 0, 0);
            g.globalAlpha = (alpha == null ? 1 : alpha) * fo;
            g.drawImage(img, 0, -pageH / 2, pageW, pageH);
            if (shade > 0.004) {
                g.globalCompositeOperation = 'multiply';
                g.fillStyle = `rgba(0,0,0,${shade.toFixed(3)})`;
                g.fillRect(0, -pageH / 2, pageW, pageH);
                g.globalCompositeOperation = 'source-over';
            }
            g.restore();
        };

        // Page-edge stack on the held (right) edge
        const drawEdge = () => {
            const ex = spineX + pageW;
            const dX = Math.max(4, pageH * 0.05), dY = Math.max(3, pageH * 0.03);
            const grad = g.createLinearGradient(ex, top, ex + dX, top + dY);
            grad.addColorStop(0, '#f1ebde'); grad.addColorStop(1, '#b0a282');
            g.fillStyle = grad;
            g.beginPath();
            g.moveTo(ex, top); g.lineTo(ex + dX, top + dY);
            g.lineTo(ex + dX, top + pageH + dY); g.lineTo(ex, top + pageH);
            g.closePath(); g.fill();
            const ln = Math.min(50, Math.max(10, Math.round(N)));
            g.lineWidth = 1;
            for (let k = 0; k <= ln; k++) {
                const t = k / ln;
                g.strokeStyle = (k % 2 === 0) ? 'rgba(120,104,76,0.26)' : 'rgba(255,251,242,0.13)';
                g.beginPath();
                g.moveTo(ex + t * dX, top + t * dY);
                g.lineTo(ex + t * dX, top + pageH + t * dY);
                g.stroke();
            }
        };

        // Feathered gutter shadow in the spine slit
        const drawGutter = () => {
            const gw = Math.max(5, pageW * 0.05);
            const grad = g.createLinearGradient(spineX - gw, 0, spineX + gw, 0);
            grad.addColorStop(0,   'rgba(0,0,0,0)');
            grad.addColorStop(0.5, `rgba(0,0,0,${(0.55 * fo).toFixed(3)})`);
            grad.addColorStop(1,   'rgba(0,0,0,0)');
            g.fillStyle = grad;
            g.fillRect(spineX - gw, top - 2, gw * 2, pageH + 4);
            g.globalAlpha = fo * 0.5;
            g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1.5;
            g.beginPath(); g.moveTo(spineX, top); g.lineTo(spineX, top + pageH); g.stroke();
            g.globalAlpha = 1;
        };

        // ── Render order ────────────────────────────────────────────────
        // released stack on the tilted (left) side — older pages steeper + darker.
        // Settle shake: the just-landed top page wobbles briefly (decays over the
        // cycle) as the next page falls onto it.
        const settle = vibration ? Math.exp(-pRaw * 8) * Math.sin(pRaw * 55) * 0.06 : 0;
        const angV   = ang + settle;
        drawPage(prev2,  -Math.cos(ang + 0.14), Math.sin(ang + 0.14) * 0.16, 0.34, 1);
        drawPage(prevImg, -Math.cos(angV), Math.sin(angV) * 0.16, 0.20, 1);
        // flat front page on the right (revealed under the releasing leaf)
        drawPage(nextImg, 1, 0, 0.0, 1);
        // held-edge thickness + spine gutter
        drawEdge();
        drawGutter();
        // ── Releasing leaf = current frame: flat-right → swings to the tilted left.
        //    Natural motion blur: temporally supersample the page across the distance
        //    it travelled this frame, so faster flips smear more (the riffle look).
        const drawLeafAt = (praw, alpha, withShade) => {
            const pe   = praw * praw * (3 - 2 * praw);         // same easing as the turn
            const phi  = pe * (Math.PI - ang);
            const cphi = Math.cos(phi), sphi = Math.sin(phi);
            const lshade = withShade ? ((1 - Math.abs(cphi)) * 0.45 + (cphi < 0 ? 0.22 : 0)) : 0;
            drawPage(curImg, cphi, sphi * 0.16, lshade, alpha);
        };
        const ease     = 6 * pRaw * (1 - pRaw);                       // screen speed: 0 at ends, peak mid-swing
        const blurSpan = motionBlur ? Math.min(0.5, (this._flipStep || 0) * 2.8 * ease) : 0;
        const blurN    = Math.max(1, Math.min(16, Math.round(blurSpan * 140)));
        if (blurN <= 1) {
            drawLeafAt(pRaw, 1, true);                          // blur off / slow / still → sharp page
        } else {
            const pStart = Math.max(0, pRaw - blurSpan);
            const a = 1 / blurN;                               // integrate the page over its travel
            for (let s = 0; s < blurN; s++) {
                drawLeafAt(pStart + (pRaw - pStart) * (s / (blurN - 1)), a, false);
            }
        }

        g.restore();
    }

    // Composites `src` onto `ctx` with a centred barrel (fisheye) bulge — no
    // getImageData: a grid of cells is magnified toward the centre and re-drawn.
    _warpFisheye(src, ctx, W, H, strength) {
        if (strength <= 0.001) { ctx.drawImage(src, 0, 0); return; }
        const cols = 30, rows = 24;                            // fine grid → smooth warp
        const cw = W / cols, ch = H / rows;
        const cx = W / 2, cy = H / 2;
        const maxR = Math.hypot(cx, cy);
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const sx = c * cw, sy = r * ch;
                const mx = sx + cw / 2, my = sy + ch / 2;
                const dx = mx - cx, dy = my - cy;
                const rr = Math.hypot(dx, dy) / maxR;
                const mag = 1 + strength * (1 - rr * rr);      // bulge centre out
                const dcx = cx + dx * mag, dcy = cy + dy * mag;
                const dw = cw * mag * 1.05, dh = ch * mag * 1.05;
                ctx.drawImage(src, sx, sy, cw, ch, dcx - dw / 2, dcy - dh / 2, dw, dh);
            }
        }
    }

    // ── Burning Frames mode ──────────────────────────────────────────────────
    // A depth-field of floating paper frames (like burning bills tumbling in
    // space): several cards live at once, each at its own depth — near cards
    // large and vivid, far cards small and dim. Every card is consumed from its
    // EDGES inward by a noise-jagged burn front while it travels away in Z
    // ("depth zoom out"), so by the end of its flight it has burnt to nothing;
    // it then respawns near with the next sampled frame — continuous motion.
    // The burn math is a direct Canvas2D port of the reference dissolve shader:
    //   burn = distField*0.5 + fbm(uv)*0.5;  edge = burn - threshold;
    //   if (edge < 0) discard;  ch = 1-smoothstep(0,charW,edge);
    //   em = 1-smoothstep(0,emberW,edge);  col = mix(base,char,ch) + ember*em
    // with `distField` = distance to the paper's nearest edge (edges ignite
    // first, the centre survives longest), `fbm` = 2-octave 2D value noise, and
    // "discard" = skipping the cell draw. Since this effect is Canvas2D-only,
    // the per-pixel shader becomes a per-cell mesh whose density scales with
    // each card's on-screen size. Solid paper still flutters via the same
    // two-sine wind-gust drive Magic Carpet uses (AnamorphicCamera._tickCarpet).

    _burnHash2(ix, iy, seed) {
        const s = Math.sin(ix * 127.1 + iy * 269.5 + seed * 311.7) * 43758.5453;
        return s - Math.floor(s);
    }

    _burnNoise2D(x, y, seed) {
        const ix = Math.floor(x), iy = Math.floor(y);
        const fx = x - ix, fy = y - iy;
        const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
        const a = this._burnHash2(ix, iy, seed),     b = this._burnHash2(ix + 1, iy, seed);
        const c = this._burnHash2(ix, iy + 1, seed), d = this._burnHash2(ix + 1, iy + 1, seed);
        return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
    }

    _burnFbm2(x, y, seed, t) {
        return this._burnNoise2D(x, y, seed) * 0.65 +
               this._burnNoise2D(x * 2.3 + t, y * 2.3 - t, seed + 7) * 0.35;
    }

    _smooth01(e0, e1, x) {
        if (e0 >= e1) return x < e0 ? 0 : 1;
        const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
        return t * t * (3 - 2 * t);
    }

    _makeBurnCard(life, N) {
        return {
            life,                                     // 0..1 travel + burn progress
            x: (Math.random() - 0.5) * 1.15,          // lateral scatter (fraction of W)
            y: (Math.random() - 0.5) * 0.85,
            rot: (Math.random() - 0.5) * 0.55,        // base tilt, like tossed paper
            seed: Math.random() * 1000,               // per-card burn-continent shape
            wavePhase: Math.random() * Math.PI * 2,
            frameIdx: (this._burnFrameCursor++) % Math.max(1, N),
        };
    }

    _updateBurn(dt, motionSpeedS, N, cardCount, bass, mid, treble, beatPeak) {
        if (N === 0) return;
        this._burnGustPhase += dt;
        if (this._burnCards.length !== cardCount) {
            this._burnCards = [];
            this._burnFrameCursor = 0;
            for (let i = 0; i < cardCount; i++) {
                this._burnCards.push(this._makeBurnCard(i / cardCount, N));
            }
        }
        let rate;
        if (motionSpeedS > 0) {
            rate = 1 / Math.max(1, motionSpeedS);     // one card's full flight per motionSpeedS s
        } else {
            const dom = Math.max(bass, mid, treble);
            rate = 0.05 + dom * 0.6;                  // audio-reactive travel/burn rate
        }
        rate *= 1 + beatPeak * 0.5;
        this._burnTravel += rate * dt;
        for (const c of this._burnCards) {
            c.life += rate * dt;
            if (c.life >= 1) Object.assign(c, this._makeBurnCard(c.life - Math.floor(c.life), N));
        }
    }

    // Spawns/advances/fades the drifting embers thrown off the burn lines.
    _updateBurnSparks(dt, emberPositions, dx, dy) {
        if (emberPositions.length > 0 && this._burnSparks.length < 48) {
            const spawnN = Math.min(3, emberPositions.length);
            for (let k = 0; k < spawnN; k++) {
                if (Math.random() >= 0.5) continue;
                const p = emberPositions[(Math.random() * emberPositions.length) | 0];
                this._burnSparks.push({
                    x: p.x, y: p.y,
                    vx: dx * (24 + Math.random() * 40) + (Math.random() - 0.5) * 26,
                    vy: dy * (24 + Math.random() * 40) + (Math.random() - 0.5) * 26,
                    life: 0, maxLife: 0.5 + Math.random() * 0.7,
                    size: 1.5 + Math.random() * 2.5,
                });
            }
        }
        for (let i = this._burnSparks.length - 1; i >= 0; i--) {
            const s = this._burnSparks[i];
            s.life += dt;
            if (s.life >= s.maxLife) { this._burnSparks.splice(i, 1); continue; }
            s.x += s.vx * dt;
            s.y += s.vy * dt;
            s.vy -= 18 * dt;                                 // gentle upward buoyancy
        }
    }

    _drawBurnSparks(ctx, emberColor, frameOpacity) {
        if (this._burnSparks.length === 0) return;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = emberColor;
        ctx.shadowColor = emberColor;
        for (const s of this._burnSparks) {
            const t = 1 - s.life / s.maxLife;
            if (t <= 0.02) continue;
            ctx.globalAlpha = t * frameOpacity;
            ctx.shadowBlur = s.size * 3;
            ctx.beginPath();
            ctx.arc(s.x, s.y, Math.max(0.4, s.size * t), 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
        ctx.globalAlpha = 1;
    }

    // Char + ember shading for one solid cell (cell rect given in current-space).
    // Ember pass is double-stamped: colored glow + a white-hot core (the "HDR"
    // rim from the reference — brightest exactly on the front line).
    _shadeBurnCell(ctx, x, y, w, h, cAmt, eAmt, alpha, charColor, emberColor, glow) {
        if (cAmt > 0.01) {
            ctx.globalCompositeOperation = 'multiply';
            ctx.globalAlpha = alpha * cAmt;
            ctx.fillStyle = charColor;
            ctx.fillRect(x, y, w, h);
        }
        if (eAmt > 0.01) {
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = alpha * eAmt;
            ctx.shadowColor = emberColor;
            ctx.shadowBlur = glow;
            ctx.fillStyle = emberColor;
            ctx.fillRect(x, y, w, h);
            ctx.globalAlpha = alpha * eAmt * eAmt * 0.85;
            ctx.fillStyle = 'rgba(255,236,190,1)';
            ctx.fillRect(x, y, w, h);
            ctx.shadowBlur = 0;
        }
        ctx.globalCompositeOperation = 'source-over';
    }

    // ── WebGL2 burn renderer (primary path) ──────────────────────────────────

    _ensureBurnGL(W, H) {
        if (this._burnGLFailed) return null;
        if (!this._burnGL) {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false });
            if (!gl) { this._burnGLFailed = true; return null; }
            // Subdivided unit quad — shared vertices, so the cloth bends seamlessly
            const GX = 48, GY = 36;
            const pos = new Float32Array((GX + 1) * (GY + 1) * 2);
            let k = 0;
            for (let j = 0; j <= GY; j++)
                for (let i = 0; i <= GX; i++) { pos[k++] = i / GX; pos[k++] = j / GY; }
            const idx = new Uint16Array(GX * GY * 6);
            k = 0;
            for (let j = 0; j < GY; j++)
                for (let i = 0; i < GX; i++) {
                    const a = j * (GX + 1) + i, b = a + 1, c = a + GX + 1, d = c + 1;
                    idx[k++] = a; idx[k++] = c; idx[k++] = b;
                    idx[k++] = b; idx[k++] = c; idx[k++] = d;
                }
            const vao = gl.createVertexArray();
            gl.bindVertexArray(vao);
            const vbo = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
            gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);
            gl.enableVertexAttribArray(0);
            gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
            const ibo = gl.createBuffer();
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
            gl.bindVertexArray(null);
            const g = { canvas, gl, prog: null, vao, idxCount: idx.length, U: null, textures: [] };
            this._burnGL = g;
            // Link off the frame (shared/gl-link.js). Until onReady fires this
            // returns null and the caller uses the Canvas2D mesh for that frame.
            buildProgramDeferred(gl, BURN_VERTEX_SHADER, BURN_FRAGMENT_SHADER, {
                label: 'FrameTunnel burn',
                onReady: (prog) => {
                    if (this._burnGL !== g) return;
                    const U = {};
                    for (const n of ['uResolution', 'uCenter', 'uSize', 'uRot', 'uTime', 'uWavePhase', 'uWaveAmp',
                                     'uGust', 'uCurl', 'uTex', 'uThreshold', 'uSeed', 'uNoiseW', 'uFlickT',
                                     'uCharW', 'uEmberW', 'uCharColor', 'uEmberColor', 'uAlpha']) {
                        U[n] = gl.getUniformLocation(prog, n);
                    }
                    g.U = U;
                    g.prog = prog;
                },
                onFail: () => { if (this._burnGL === g) this._burnGLFailed = true; },
            });
        }
        const g = this._burnGL;
        if (!g.prog) return null; // still linking
        if (g.canvas.width !== W || g.canvas.height !== H) { g.canvas.width = W; g.canvas.height = H; }
        return g;
    }

    // Re-uploads frame textures whenever the sampled-frame set changes (resample,
    // vignette rebake, or live-webcam capture push/shift — first/last refs move).
    _ensureBurnTextures(g) {
        const gl = g.gl;
        const F = this._frames;
        const first = F[0] || null, last = F[F.length - 1] || null;
        if (g.textures.length === F.length && this._burnTexFirst === first && this._burnTexLast === last) return;
        for (const t of g.textures) gl.deleteTexture(t);
        g.textures = F.map(frame => {
            const tex = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frame);
            return tex;
        });
        this._burnTexFirst = first;
        this._burnTexLast = last;
    }

    _hexToRgb01(hex) {
        const h = (hex || '#ffffff').replace('#', '');
        const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
        return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    }

    _drawBurnGL(ctx, W, H, masterZoom, frameOpacity, windAngle, jagAmount, curlAmount, rippleAmount,
                flicker, charWidth, emberWidth, charColor, emberColor, dt, reverse) {
        const g = this._ensureBurnGL(W, H);
        if (!g) return false;
        const gl = g.gl;
        const N = this._frames.length;
        this._ensureBurnTextures(g);
        if (g.textures.length === 0) return true;

        const gust = Math.max(0, Math.sin(this._burnGustPhase * 0.7) + Math.sin(this._burnGustPhase * 2.3) * 0.5 + 0.5);
        const noiseW = Math.min(0.75, 0.3 + jagAmount * 0.5);
        const flickT = this._burnGustPhase * (0.4 + flicker * 3);
        const rad = (windAngle * Math.PI) / 180;
        const driftX = Math.sin(rad), driftY = -Math.cos(rad);
        const charRgb = this._hexToRgb01(charColor);
        const emberRgb = this._hexToRgb01(emberColor);

        gl.viewport(0, 0, W, H);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.disable(gl.DEPTH_TEST);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);        // premultiplied over
        gl.useProgram(g.prog);
        gl.bindVertexArray(g.vao);
        const U = g.U;
        gl.uniform2f(U.uResolution, W, H);
        gl.uniform1f(U.uTime, this._burnGustPhase);
        gl.uniform1f(U.uGust, gust);
        gl.uniform1f(U.uCurl, curlAmount);
        gl.uniform1f(U.uNoiseW, noiseW);
        gl.uniform1f(U.uFlickT, flickT);
        gl.uniform1f(U.uCharW, Math.max(charWidth, 0.001));
        gl.uniform1f(U.uEmberW, Math.max(emberWidth, 0.001));
        gl.uniform3f(U.uCharColor, charRgb[0], charRgb[1], charRgb[2]);
        gl.uniform3f(U.uEmberColor, emberRgb[0], emberRgb[1], emberRgb[2]);
        gl.uniform1i(U.uTex, 0);
        gl.activeTexture(gl.TEXTURE0);

        // Painter's order: deepest (smallest) cards first
        const order = this._burnCards.slice().sort((a, b) => {
            const da = reverse ? a.life : 1 - a.life;
            const db = reverse ? b.life : 1 - b.life;
            return da - db;
        });

        const emberPositions = [];

        for (const card of order) {
            const depth = reverse ? card.life : 1 - card.life;   // 1 = near, 0 = far
            const scale = 0.25 + depth * 0.85;
            const threshold = card.life * 1.15;
            const img = this._frames[card.frameIdx % N];
            if (!img) continue;

            const aspect = img.width / img.height;
            let cardH = H * 0.52 * masterZoom * scale;
            let cardW = cardH * aspect;
            const maxW = W * 0.7 * masterZoom * scale;
            if (cardW > maxW) { cardW = maxW; cardH = cardW / aspect; }
            if (cardW < 8 || cardH < 8) continue;

            const px = W / 2 + card.x * W * 0.55 * (0.35 + scale * 0.65);
            const py = H / 2 + card.y * H * 0.55 * (0.35 + scale * 0.65);
            const rot = card.rot + Math.sin(this._burnGustPhase * 0.6 + card.wavePhase) * 0.05;
            const alpha = (0.45 + depth * 0.55) * frameOpacity;

            gl.uniform2f(U.uCenter, px, py);
            gl.uniform2f(U.uSize, cardW, cardH);
            gl.uniform1f(U.uRot, rot);
            gl.uniform1f(U.uWavePhase, card.wavePhase);
            gl.uniform1f(U.uWaveAmp, rippleAmount * 0.05);
            gl.uniform1f(U.uThreshold, threshold);
            gl.uniform1f(U.uSeed, card.seed);
            gl.uniform1f(U.uAlpha, alpha);
            gl.bindTexture(gl.TEXTURE_2D, g.textures[card.frameIdx % g.textures.length]);
            gl.drawElements(gl.TRIANGLES, g.idxCount, gl.UNSIGNED_SHORT, 0);

            // CPU-side samples near the front feed the Canvas2D spark particles
            const cosR = Math.cos(rot), sinR = Math.sin(rot);
            for (let t = 0; t < 8 && emberPositions.length < 24; t++) {
                const u = Math.random(), v = Math.random();
                const distField = Math.min(u, 1 - u, v, 1 - v) * 2;
                const fbm = this._burnFbm2(u * 4, v * 4, card.seed, flickT);
                const burnVal = distField * (1 - noiseW) + fbm * noiseW;
                if (Math.abs(burnVal - threshold) < Math.max(emberWidth, 0.02)) {
                    const lx = (u - 0.5) * cardW, ly = (v - 0.5) * cardH;
                    emberPositions.push({ x: px + cosR * lx - sinR * ly, y: py + sinR * lx + cosR * ly });
                }
            }
        }
        gl.bindVertexArray(null);

        ctx.drawImage(g.canvas, 0, 0);
        this._updateBurnSparks(dt, emberPositions, driftX, driftY);
        this._drawBurnSparks(ctx, emberColor, frameOpacity);
        return true;
    }

    _drawBurn(ctx, W, H, masterZoom, frameOpacity, windAngle, jagAmount, curlAmount, rippleAmount,
              flicker, charWidth, emberWidth, charColor, emberColor, dt, reverse) {
        const N = this._frames.length;
        if (N === 0 || this._burnCards.length === 0) return;

        // WebGL2 per-pixel path (smooth organic burn boundary, seamless cloth);
        // everything below is the Canvas2D cell-mesh fallback for old devices.
        if (this._drawBurnGL(ctx, W, H, masterZoom, frameOpacity, windAngle, jagAmount, curlAmount,
                rippleAmount, flicker, charWidth, emberWidth, charColor, emberColor, dt, reverse)) return;

        // Magic-Carpet-style two-sine gust drive (see AnamorphicCamera._tickCarpet)
        const gust = Math.max(0, Math.sin(this._burnGustPhase * 0.7) + Math.sin(this._burnGustPhase * 2.3) * 0.5 + 0.5);
        const noiseW = Math.min(0.75, 0.3 + jagAmount * 0.5);    // fbm vs edge-distance mix (0.4 → the ref's 50/50)
        const flickT = this._burnGustPhase * (0.4 + flicker * 3);
        const rad = (windAngle * Math.PI) / 180;
        const driftX = Math.sin(rad), driftY = -Math.cos(rad);   // 0° → embers rise straight up

        // Painter's order: deepest (smallest) cards first
        const order = this._burnCards.slice().sort((a, b) => {
            const da = reverse ? a.life : 1 - a.life;
            const db = reverse ? b.life : 1 - b.life;
            return da - db;
        });

        const emberPositions = [];

        for (const card of order) {
            // Depth flight: normal = spawn near/large, recede + burn away ("zoom
            // out"); Reverse = spawn deep and burn while approaching.
            const depth = reverse ? card.life : 1 - card.life;   // 1 = near, 0 = far
            const scale = 0.25 + depth * 0.85;
            const threshold = card.life * 1.15;                  // sweeps the burn front (ref: uBurnProgress*1.5)
            const img = this._frames[card.frameIdx % N];
            if (!img) continue;

            const aspect = img.width / img.height;
            let cardH = H * 0.52 * masterZoom * scale;
            let cardW = cardH * aspect;
            const maxW = W * 0.7 * masterZoom * scale;
            if (cardW > maxW) { cardW = maxW; cardH = cardW / aspect; }
            if (cardW < 8 || cardH < 8) continue;

            // Lateral scatter converges toward the vanishing point with depth
            const px = W / 2 + card.x * W * 0.55 * (0.35 + scale * 0.65);
            const py = H / 2 + card.y * H * 0.55 * (0.35 + scale * 0.65);
            const rot = card.rot + Math.sin(this._burnGustPhase * 0.6 + card.wavePhase) * 0.05;
            const cosR = Math.cos(rot), sinR = Math.sin(rot);
            const depthAlpha = (0.45 + depth * 0.55) * frameOpacity;

            // Mesh density scales with on-screen size (far cards stay cheap)
            const Ku = Math.max(6, Math.min(18, Math.round(cardW / 26)));
            const Kv = Math.max(5, Math.min(14, Math.round(cardH / 26)));
            const cellW = cardW / Ku, cellH = cardH / Kv;
            const srcCellW = img.width / Ku, srcCellH = img.height / Kv;
            const cellDiag = Math.hypot(cellW, cellH);
            const rippleAmp = rippleAmount * Math.min(cardW, cardH) * 0.05;
            const dw = cellW * 1.05, dh = cellH * 1.05;          // tiny overlap hides seams

            ctx.save();
            ctx.translate(px, py);
            ctx.rotate(rot);
            for (let j = 0; j < Kv; j++) {
                const v = (j + 0.5) / Kv;
                for (let i = 0; i < Ku; i++) {
                    const u = (i + 0.5) / Ku;
                    // Reference port: burn = distField*0.5 + fbm(uv)*0.5
                    const distField = Math.min(u, 1 - u, v, 1 - v) * 2;   // 0 at the paper's edge
                    const fbm = this._burnFbm2(u * 3.5, v * 3.5, card.seed, flickT);
                    const burn = distField * (1 - noiseW) + fbm * noiseW;
                    const edge = burn - threshold;
                    if (edge < 0) continue;                               // "discard" → already ash

                    const cAmt = 1 - this._smooth01(0, Math.max(charWidth, 0.001), edge);
                    const eAmt = 1 - this._smooth01(0, Math.max(emberWidth, 0.001), edge);
                    const heat = Math.max(0, 1 - edge / (charWidth + emberWidth + 0.001));

                    // Cloth flutter — solid paper rides the gust
                    const wob = Math.sin(v * 6 + u * 3 + this._burnGustPhase * 1.8 + card.wavePhase);
                    const lx = (u - 0.5) * cardW + wob * rippleAmp * 0.35 * gust;
                    const ly = (v - 0.5) * cardH + wob * rippleAmp * (0.5 + gust * 0.5);

                    if (eAmt > 0.55 && emberPositions.length < 24 && Math.random() < 0.35) {
                        emberPositions.push({ x: px + cosR * lx - sinR * ly, y: py + sinR * lx + cosR * ly });
                    }

                    if (heat > 0.01 && curlAmount > 0.01) {
                        // Heat crinkle — shrink + twist the scrap that's about to catch
                        ctx.save();
                        ctx.translate(lx, ly);
                        ctx.rotate(curlAmount * heat * 0.35 * ((i + j) % 2 === 0 ? 1 : -1));
                        const s = 1 - curlAmount * heat * 0.3;
                        ctx.scale(s, s);
                        ctx.globalAlpha = depthAlpha;
                        ctx.drawImage(img, i * srcCellW, j * srcCellH, srcCellW, srcCellH, -dw / 2, -dh / 2, dw, dh);
                        this._shadeBurnCell(ctx, -dw / 2, -dh / 2, dw, dh, cAmt, eAmt, depthAlpha, charColor, emberColor, cellDiag);
                        ctx.restore();
                    } else {
                        ctx.globalAlpha = depthAlpha;
                        ctx.drawImage(img, i * srcCellW, j * srcCellH, srcCellW, srcCellH, lx - dw / 2, ly - dh / 2, dw, dh);
                        if (cAmt > 0.01 || eAmt > 0.01) {
                            this._shadeBurnCell(ctx, lx - dw / 2, ly - dh / 2, dw, dh, cAmt, eAmt, depthAlpha, charColor, emberColor, cellDiag);
                        }
                    }
                }
            }
            ctx.restore();
        }
        ctx.globalAlpha = 1;

        this._updateBurnSparks(dt, emberPositions, driftX, driftY);
        this._drawBurnSparks(ctx, emberColor, frameOpacity);
    }

    // ── Shred Frames mode ────────────────────────────────────────────────────
    // Reuses the Burning Frames card depth-field (same _burnCards lifecycle and
    // shared GL context/textures): frames fly in from the back growing larger,
    // then run through an invisible shredder — a front sweeps left → right and
    // every ribbon past it detaches, falls under per-strip gravity and tumbles
    // independently (see SHRED_VERTEX_SHADER for the strip-index logic).

    // Builds the strip-mesh program into the shared burn GL context on demand.
    _ensureShredGL(g) {
        if (g.shred || g.shredFailed || g.shredPending) return g.shred || null;
        const gl = g.gl;
        g.shredPending = true;
        // 48 fine strips × GY rows; strip-boundary columns are DUPLICATED so
        // each strip can transform independently of its neighbour.
        const S = 48, GY = 24;
        const pos = [], stripIdx = [], idx = [];
        for (let s = 0; s < S; s++) {
            const base = pos.length / 2;
            for (let j = 0; j <= GY; j++) {
                const y = j / GY;
                pos.push(s / S, y);       stripIdx.push(s);
                pos.push((s + 1) / S, y); stripIdx.push(s);
            }
            for (let j = 0; j < GY; j++) {
                const a = base + j * 2, b = a + 1, c = a + 2, d = a + 3;
                idx.push(a, c, b, b, c, d);
            }
        }
        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);
        const vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pos), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        const sbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, sbo);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(stripIdx), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0);
        const ibo = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
        gl.bindVertexArray(null);
        const idxCount = idx.length;
        // Link off the frame (shared/gl-link.js); the caller falls back to the
        // Canvas2D shred path until onReady fires.
        buildProgramDeferred(gl, SHRED_VERTEX_SHADER, SHRED_FRAGMENT_SHADER, {
            label: 'FrameTunnel shred',
            onReady: (prog) => {
                g.shredPending = false;
                if (this._burnGL !== g) return;
                const U = {};
                for (const n of ['uResolution', 'uCenter', 'uSize', 'uRot', 'uTime', 'uWavePhase', 'uWaveAmp',
                                 'uGust', 'uStrips', 'uShredProgress', 'uTumble', 'uFall', 'uSeed',
                                 'uDrift', 'uCurlFreq', 'uCoil', 'uSpin', 'uTex', 'uAlpha']) {
                    U[n] = gl.getUniformLocation(prog, n);
                }
                g.shred = { prog, vao, idxCount, U };
            },
            onFail: () => { g.shredPending = false; g.shredFailed = true; },
        });
        return g.shred || null; // set synchronously when the extension is absent
    }

    // Card layout shared by both shred paths (mirrors the burn card layout).
    _shredCardLayout(card, W, H, masterZoom, frameOpacity, reverse, img) {
        // Default flight: spawn deep and APPROACH (grow); Reverse recedes.
        const depth = reverse ? 1 - card.life : card.life;   // 1 = near, 0 = far
        const scale = 0.25 + depth * 0.85;
        const aspect = img.width / img.height;
        let cardH = H * 0.52 * masterZoom * scale;
        let cardW = cardH * aspect;
        const maxW = W * 0.7 * masterZoom * scale;
        if (cardW > maxW) { cardW = maxW; cardH = cardW / aspect; }
        if (cardW < 8 || cardH < 8) return null;
        const px = W / 2 + card.x * W * 0.55 * (0.35 + scale * 0.65);
        const py = H / 2 + card.y * H * 0.55 * (0.35 + scale * 0.65);
        const rot = card.rot * 0.5 + Math.sin(this._burnGustPhase * 0.6 + card.wavePhase) * 0.04;
        // Shred front starts once the card is well inside view, finishes with
        // margin for the last ribbons to fall before respawn (front needs 1.4).
        const progress = Math.max(0, card.life - 0.30) * 2.0;
        const endFade = 1 - this._smooth01(0.9, 1.0, card.life);
        const alpha = (0.45 + depth * 0.55) * frameOpacity * endFade;
        return { depth, cardW, cardH, px, py, rot, progress, alpha };
    }

    _drawShredGL(ctx, W, H, masterZoom, frameOpacity, strips, tumble, rippleAmount, fallMult, reverse) {
        const g = this._ensureBurnGL(W, H);
        if (!g) return false;
        const sp = this._ensureShredGL(g);
        if (!sp) return false;
        const gl = g.gl;
        const N = this._frames.length;
        this._ensureBurnTextures(g);
        if (g.textures.length === 0) return true;

        const gust = Math.max(0, Math.sin(this._burnGustPhase * 0.7) + Math.sin(this._burnGustPhase * 2.3) * 0.5 + 0.5);

        gl.viewport(0, 0, W, H);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.disable(gl.DEPTH_TEST);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);        // premultiplied over
        gl.useProgram(sp.prog);
        gl.bindVertexArray(sp.vao);
        const U = sp.U;
        gl.uniform2f(U.uResolution, W, H);
        gl.uniform1f(U.uTime, this._burnGustPhase);
        gl.uniform1f(U.uGust, gust);
        gl.uniform1f(U.uStrips, strips);
        gl.uniform1f(U.uTumble, tumble);
        gl.uniform1f(U.uFall, fallMult);
        gl.uniform1i(U.uTex, 0);
        gl.activeTexture(gl.TEXTURE0);

        // Painter's order: deepest (smallest) cards first
        const order = this._burnCards.slice().sort((a, b) => {
            const da = reverse ? 1 - a.life : a.life;
            const db = reverse ? 1 - b.life : b.life;
            return da - db;
        });

        for (const card of order) {
            const img = this._frames[card.frameIdx % N];
            if (!img) continue;
            const L = this._shredCardLayout(card, W, H, masterZoom, frameOpacity, reverse, img);
            if (!L || L.alpha <= 0.01) continue;
            const style = SHRED_STYLES[Math.floor(this._burnHash2(1, 9, card.seed) * SHRED_STYLES.length) % SHRED_STYLES.length];
            gl.uniform2f(U.uCenter, L.px, L.py);
            gl.uniform2f(U.uSize, L.cardW, L.cardH);
            gl.uniform1f(U.uRot, L.rot);
            gl.uniform1f(U.uWavePhase, card.wavePhase);
            gl.uniform1f(U.uWaveAmp, rippleAmount * 0.05);
            gl.uniform1f(U.uShredProgress, L.progress);
            gl.uniform1f(U.uSeed, card.seed);
            gl.uniform1f(U.uDrift, style.drift);
            gl.uniform1f(U.uCurlFreq, style.curl);
            gl.uniform1f(U.uCoil, style.coil);
            gl.uniform1f(U.uSpin, style.spin);
            gl.uniform1f(U.uAlpha, L.alpha);
            gl.bindTexture(gl.TEXTURE_2D, g.textures[card.frameIdx % g.textures.length]);
            gl.drawElements(gl.TRIANGLES, sp.idxCount, gl.UNSIGNED_SHORT, 0);
        }
        gl.bindVertexArray(null);

        ctx.drawImage(g.canvas, 0, 0);
        return true;
    }

    // Canvas2D fallback: each ribbon is drawn as 6 vertical slice segments with
    // per-segment twist foreshortening + serpentine offsets — a coarse version
    // of the shader's length-wise curl (still wavy, never rigid bars).
    _drawShredCanvas(ctx, W, H, masterZoom, frameOpacity, strips, tumble, fallMult, reverse) {
        const N = this._frames.length;
        const time = this._burnGustPhase;
        const SEG = 6;

        const order = this._burnCards.slice().sort((a, b) => {
            const da = reverse ? 1 - a.life : a.life;
            const db = reverse ? 1 - b.life : b.life;
            return da - db;
        });

        for (const card of order) {
            const img = this._frames[card.frameIdx % N];
            if (!img) continue;
            const L = this._shredCardLayout(card, W, H, masterZoom, frameOpacity, reverse, img);
            if (!L || L.alpha <= 0.01) continue;

            const style = SHRED_STYLES[Math.floor(this._burnHash2(1, 9, card.seed) * SHRED_STYLES.length) % SHRED_STYLES.length];
            const stripW = L.cardW / strips;
            const srcStripW = img.width / strips;
            const srcSegH = img.height / SEG;
            ctx.save();
            ctx.translate(L.px, L.py);
            ctx.rotate(L.rot);
            for (let s = 0; s < strips; s++) {
                const su = (s + 0.5) / strips;
                const pastRaw = (L.progress - su) / 0.4;
                const past = Math.max(0, Math.min(1, pastRaw));
                const e = past * past;
                const tFree = Math.max(0, pastRaw - 1);
                const h0 = this._burnHash2(s, 1, card.seed);
                const h3 = this._burnHash2(s, 3, card.seed);
                const h7 = this._burnHash2(s, 7, card.seed);
                const h11 = this._burnHash2(s, 11, card.seed);
                const dir = h0 > 0.5 ? 1 : -1;
                // Zero-g scatter in a hashed direction + ref separation gravity
                const da = h11 * 6.2832;
                const driftMag = Math.min(tFree * 0.45, 1.8) * style.drift * L.cardH;
                const cx0 = (su - 0.5) * L.cardW + e * e * (h7 - 0.5) * L.cardW * 0.25
                          + Math.cos(da) * driftMag;
                const cy0 = e * (0.25 + h0 * 0.25) * fallMult * L.cardH
                          + Math.sin(da) * 0.7 * driftMag;
                const ribH = L.cardH * (1 - style.coil * e);   // ringlet compression
                const segH = ribH / SEG;
                const sp = (e * 0.3 + tFree * style.spin * (0.6 + h3 * 0.8)) * dir;
                const cs = Math.cos(sp), ss = Math.sin(sp);
                const baseAlpha = L.alpha * (1 - 0.4 * e * e) * Math.max(0, 1 - tFree * 0.22);
                if (baseAlpha <= 0.01) continue;
                for (let q = 0; q < SEG; q++) {
                    const vy = (q + 0.5) / SEG;
                    const twist = e * tumble * dir * (0.75 + h3 * 0.5)
                                + e * (vy * (6 + h3 * 4) * style.curl + time * (1.5 + h0 * 1.5) * dir);
                    const ca = Math.cos(twist);
                    const serp = Math.sin(vy * (5 + h7 * 6) + time * (1 + h7) * dir + h3 * 6.28);
                    // ribbon-local point, spun in-plane (zero-g tumble)
                    const rpx = e * serp * L.cardW * 0.10 * (0.3 + vy);
                    const rpy = (vy - 0.5) * ribH;
                    const dx = cx0 + cs * rpx - ss * rpy;
                    const dy = cy0 + ss * rpx + cs * rpy;
                    const w = stripW * Math.max(0.08, Math.abs(ca));
                    ctx.globalAlpha = baseAlpha * (0.5 + 0.5 * Math.abs(ca));
                    ctx.drawImage(img, s * srcStripW, q * srcSegH, srcStripW, srcSegH,
                        dx - w / 2, dy - segH / 2 - 0.5, w, segH + 1);
                    if (ca < -0.35) {                     // paper back → pale streamer
                        ctx.fillStyle = 'rgba(228,224,214,0.85)';
                        ctx.fillRect(dx - w / 2, dy - segH / 2 - 0.5, w, segH + 1);
                    }
                }
            }
            ctx.restore();
        }
        ctx.globalAlpha = 1;
    }

    _drawShred(ctx, W, H, masterZoom, frameOpacity, strips, tumble, rippleAmount, fallMult, reverse) {
        const N = this._frames.length;
        if (N === 0 || this._burnCards.length === 0) return;
        if (!this._burnGLFailed &&
            this._drawShredGL(ctx, W, H, masterZoom, frameOpacity, strips, tumble, rippleAmount, fallMult, reverse)) return;
        this._drawShredCanvas(ctx, W, H, masterZoom, frameOpacity, strips, tumble, fallMult, reverse);
    }

    // ── Paper texture (ported from Origami) ─────────────────────────────────────
    // Builds & caches 256×256 grain tiles; applied as a soft-light overlay so it
    // only textures lit pixels (pure-black backgrounds stay clean).

    _getPaperTexture(mode) {
        if (!this._paperTextures) {
            const S = 256;
            const make = (rB, gB, bB, variance, fiberCol, fiberAlpha) => {
                const c = document.createElement('canvas');
                c.width = c.height = S;
                const g = c.getContext('2d');
                const img = g.createImageData(S, S);
                const hV = variance >> 1;
                for (let p = 0; p < S * S; p++) {
                    img.data[p * 4]     = Math.max(0, Math.min(255, rB + (Math.random() * variance | 0) - hV));
                    img.data[p * 4 + 1] = Math.max(0, Math.min(255, gB + (Math.random() * variance | 0) - hV));
                    img.data[p * 4 + 2] = Math.max(0, Math.min(255, bB + (Math.random() * variance | 0) - hV));
                    img.data[p * 4 + 3] = 255;
                }
                g.putImageData(img, 0, 0);
                g.globalAlpha = fiberAlpha;
                g.strokeStyle = fiberCol;
                g.lineWidth = 0.6;
                for (let k = 0; k < 130; k++) {
                    const y = Math.random() * S;
                    g.beginPath(); g.moveTo(0, y); g.lineTo(S, y + (Math.random() - 0.5) * 7); g.stroke();
                }
                g.globalAlpha = 1;
                return c;
            };
            this._paperTextures = {
                normal:    make(205, 205, 205, 50, '#888888', 0.06),   // bright paper grain
                kraft:     make(148, 108,  62, 50, '#7a5030', 0.09),   // warm dark brown
                sand:      make(180, 158, 118, 40, '#a08060', 0.07),   // light sandy tan
                cream:     make(218, 205, 182, 25, '#c8b090', 0.05),   // soft ivory cream
                parchment: make(188, 152,  88, 45, '#907040', 0.08),   // aged amber parchment
            };
        }
        return this._paperTextures[mode] || this._paperTextures.normal;
    }

    _applyTexture(ctx, W, H, mode, amount) {
        if (!mode || mode === 'none' || amount <= 0) return;
        const tex = this._getPaperTexture(mode);
        ctx.save();
        ctx.globalCompositeOperation = 'soft-light';
        ctx.globalAlpha = Math.min(1, amount);
        for (let y = 0; y < H; y += tex.height) {
            for (let x = 0; x < W; x += tex.width) ctx.drawImage(tex, x, y);
        }
        ctx.restore();
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
    }

    // ── Universal color modes (ported from Origami) ─────────────────────────────
    // Gradient/solid fill used as a `multiply` tint over the whole output.

    _colorOverlayStyle(ctx, mode, customColor, cx, cy, S, time) {
        switch (mode) {
            case 'custom': return customColor || '#ffffff';
            case 'rainbow': {
                const lg = ctx.createLinearGradient(cx - S, cy - S, cx + S, cy + S);
                for (let i = 0; i <= 6; i++) {
                    const hue = (((time * 0.15 + i / 6) % 1.0 + 1.0) % 1.0) * 360;
                    lg.addColorStop(i / 6, `hsl(${hue.toFixed(0)}, 90%, 55%)`);
                }
                return lg;
            }
            case 'chrome': {
                const rot = time * 0.2;
                const lg = ctx.createLinearGradient(
                    cx + Math.cos(rot) * S, cy + Math.sin(rot) * S,
                    cx - Math.cos(rot) * S, cy - Math.sin(rot) * S);
                lg.addColorStop(0, '#c0c8d8'); lg.addColorStop(0.3, '#ffffff');
                lg.addColorStop(0.5, '#a8b0c0'); lg.addColorStop(0.7, '#ffffff');
                lg.addColorStop(1, '#d0d8e8');
                return lg;
            }
            case 'neon': {
                const pulse = (time * 0.8) % 1.0;
                const lg = ctx.createLinearGradient(cx - S, cy, cx + S, cy);
                lg.addColorStop(0, '#ff00ff');
                lg.addColorStop(Math.abs(Math.sin(pulse * Math.PI)), '#00ffff');
                lg.addColorStop(1, '#ffffff');
                return lg;
            }
            case 'thermal': {
                const lg = ctx.createLinearGradient(cx, cy + S, cx, cy - S);
                lg.addColorStop(0.0, '#1a0030'); lg.addColorStop(0.25, '#cc0066');
                lg.addColorStop(0.5, '#ff3300'); lg.addColorStop(0.75, '#ff9900');
                lg.addColorStop(1.0, '#ffff88');
                return lg;
            }
            case 'cosmic_vibrant': {
                const lg = ctx.createLinearGradient(cx - S, cy + S, cx + S, cy - S);
                lg.addColorStop(0, '#000050'); lg.addColorStop(0.3, '#3300cc');
                lg.addColorStop(0.6, '#e6008c'); lg.addColorStop(0.85, '#ff3300');
                lg.addColorStop(1, '#ffe600');
                return lg;
            }
            case 'cosmic_nebula': {
                const lg = ctx.createLinearGradient(cx, cy + S, cx, cy - S);
                lg.addColorStop(0, '#001a33'); lg.addColorStop(0.3, '#0077cc');
                lg.addColorStop(0.6, '#cc00ff'); lg.addColorStop(0.85, '#ff66cc');
                lg.addColorStop(1, '#ffffff');
                return lg;
            }
            case 'cosmic_supernova': {
                const lg = ctx.createLinearGradient(cx, cy - S, cx, cy + S);
                lg.addColorStop(0, '#1a0000'); lg.addColorStop(0.3, '#990033');
                lg.addColorStop(0.6, '#ff4400'); lg.addColorStop(0.85, '#ffcc00');
                lg.addColorStop(1, '#ffffff');
                return lg;
            }
            default: return '#ffffff';
        }
    }

    // Global color-mode post-process over the composited output (no getImageData).
    _applyColorMode(ctx, W, H, mode, customColor, time) {
        if (!mode || mode === 'normal') return;

        // Filter-based looks (B&W + paint styles): redraw the frame through a CSS filter
        const FILTERS = {
            bw:         'grayscale(100%)',
            pastel:     'saturate(135%) contrast(92%) blur(2px) brightness(102%)',
            watercolor: 'saturate(150%) contrast(80%) blur(2.5px) brightness(101%)',
            oil:        'saturate(260%) contrast(165%)',
            pencil:     'grayscale(100%) contrast(170%) brightness(112%)',
            paint_neon: 'saturate(420%) contrast(128%) blur(1px) brightness(108%)',
            gouache:    'saturate(195%) contrast(150%)',
        };
        const filter = FILTERS[mode];
        if (filter) {
            if (!this._fxCanvas) {
                this._fxCanvas = document.createElement('canvas');
                this._fxCtx = this._fxCanvas.getContext('2d');
            }
            if (this._fxCanvas.width !== W || this._fxCanvas.height !== H) {
                this._fxCanvas.width = W; this._fxCanvas.height = H;
            }
            this._fxCtx.clearRect(0, 0, W, H);
            this._fxCtx.drawImage(ctx.canvas, 0, 0);
            ctx.save();
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';
            ctx.filter = filter;
            ctx.clearRect(0, 0, W, H);
            ctx.drawImage(this._fxCanvas, 0, 0);
            ctx.restore();
            ctx.filter = 'none';
            return;
        }

        // Gradient/solid tint modes: multiply over the output (black stays black)
        ctx.save();
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = this._colorOverlayStyle(ctx, mode, customColor, W / 2, H / 2, Math.min(W, H) * 0.5, time);
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
        ctx.globalCompositeOperation = 'source-over';
    }

    // ── Background rendering ──────────────────────────────────────────────────

    _renderBackground(ctx, activeMedia, crop, W, H, bgMode, bgCustomColor, time, tunnelPos, bgReverse, trailEnabled) {
        const drawVideoBg = (filterStr, alpha) => {
            ctx.save();
            if (filterStr) ctx.filter = filterStr;
            ctx.globalAlpha = alpha;
            ctx.drawImage(activeMedia, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, W, H);
            ctx.restore();
        };

        const motionDir = bgReverse ? 1 : -1;

        const solidFill = (color) => {
            if (!trailEnabled) {
                ctx.fillStyle = color;
                ctx.fillRect(0, 0, W, H);
            }
        };

        switch (bgMode) {
            case 'white':
                solidFill('#fff');
                break;
            case 'normal':
                drawVideoBg(null, 0.28);
                break;
            case 'rgb':
                drawVideoBg(`hue-rotate(${(time * 120) % 360}deg) saturate(6) brightness(0.5)`, 0.38);
                break;
            case 'bw':
                drawVideoBg('grayscale(100%) brightness(0.48)', 0.38);
                break;
            case 'rainbow':
                drawVideoBg(`hue-rotate(${(time * 55) % 360}deg) saturate(4) brightness(0.42)`, 0.38);
                break;
            case 'threshold':
                drawVideoBg('contrast(1500%) grayscale(100%) brightness(0.32)', 0.38);
                break;
            case 'chrome':
                drawVideoBg('invert(1) grayscale(1) contrast(2) brightness(0.38)', 0.35);
                break;
            case 'neon':
                drawVideoBg('saturate(8) brightness(0.32) hue-rotate(150deg)', 0.38);
                break;
            case 'thermal':
                drawVideoBg('grayscale(1) sepia(1) hue-rotate(-50deg) saturate(8) brightness(0.45)', 0.35);
                break;
            case 'cosmic_vibrant': {
                if (!trailEnabled) {
                    const g = ctx.createRadialGradient(W / 2, H * 0.42, 0, W / 2, H * 0.42, Math.max(W, H) * 0.85);
                    g.addColorStop(0, '#1a0040'); g.addColorStop(0.45, '#3d0080');
                    g.addColorStop(0.8, '#1a0040'); g.addColorStop(1, '#000008');
                    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
                }
                break;
            }
            case 'cosmic_nebula': {
                if (!trailEnabled) {
                    const g = ctx.createRadialGradient(W / 2, H * 0.42, 0, W / 2, H * 0.42, Math.max(W, H) * 0.85);
                    g.addColorStop(0, '#001830'); g.addColorStop(0.45, '#002a55');
                    g.addColorStop(0.8, '#001225'); g.addColorStop(1, '#000008');
                    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
                }
                break;
            }
            case 'cosmic_supernova': {
                if (!trailEnabled) {
                    const g = ctx.createRadialGradient(W / 2, H * 0.42, 0, W / 2, H * 0.42, Math.max(W, H) * 0.85);
                    g.addColorStop(0, '#2d0008'); g.addColorStop(0.45, '#5c1200');
                    g.addColorStop(0.8, '#2d0008'); g.addColorStop(1, '#000000');
                    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
                }
                break;
            }
            case 'space': {
                solidFill('#00000c');
                const scx = W / 2, scy = H / 2;
                const maxR = Math.max(W, H) * 0.78;
                ctx.save();
                for (let i = 0; i < 220; i++) {
                    const angle = (i * 2.39996) % (Math.PI * 2);
                    const phase = (i * 0.61803) % 1.0;
                    const raw = phase + motionDir * tunnelPos * 0.06;
                    const depth = ((raw % 1.0) + 1.0) % 1.0;
                    const r = Math.pow(depth, 0.65) * maxR;
                    const px = scx + Math.cos(angle) * r;
                    const py = scy + Math.sin(angle) * r;
                    const starAlpha = Math.min(1, depth * 1.4);
                    const size = depth * 2.2 + 0.4;
                    const c = (i * 7) % 3;
                    ctx.globalAlpha = starAlpha;
                    ctx.fillStyle = c === 0 ? '#aadeff' : c === 1 ? '#ffffff' : '#fffaaa';
                    ctx.beginPath();
                    ctx.arc(px, py, size, 0, Math.PI * 2);
                    ctx.fill();
                    if (i % 18 === 0 && depth > 0.5) {
                        ctx.globalAlpha = starAlpha * 0.25;
                        ctx.beginPath();
                        ctx.arc(px, py, size * 3.5, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
                ctx.restore();
                break;
            }
            case 'light_travel': {
                solidFill('#00000a');
                const lcx = W / 2, lcy = H / 2;
                const lMaxR = Math.max(W, H) * 0.80;
                ctx.save();
                for (let i = 0; i < 150; i++) {
                    const angle = (i / 150) * Math.PI * 2 + (i * 0.07) % 0.12;
                    const phase = (i * 0.38197) % 1.0;
                    const raw = phase + motionDir * tunnelPos * 0.10;
                    const depth = ((raw % 1.0) + 1.0) % 1.0;
                    const rHead = Math.pow(depth, 0.75) * lMaxR;
                    const rTail = Math.pow(Math.max(0, depth - 0.18), 0.75) * lMaxR;
                    if (rHead < 3) continue;
                    const x1 = lcx + Math.cos(angle) * rTail;
                    const y1 = lcy + Math.sin(angle) * rTail;
                    const x2 = lcx + Math.cos(angle) * rHead;
                    const y2 = lcy + Math.sin(angle) * rHead;
                    const hue = (i * 3 + 195) % 360;
                    const lineAlpha = Math.min(depth * 1.8, 0.88);
                    const lineW = depth * 2.0 + 0.2;
                    ctx.strokeStyle = `hsla(${hue}, 75%, 80%, ${lineAlpha})`;
                    ctx.lineWidth = lineW;
                    ctx.beginPath();
                    ctx.moveTo(x1, y1);
                    ctx.lineTo(x2, y2);
                    ctx.stroke();
                }
                ctx.restore();
                break;
            }
            case 'blackhole': {
                solidFill('#000000');
                const bcx = W / 2, bcy = H * 0.46;
                const bhR = Math.min(W, H) * 0.13;
                const bhMax = Math.min(W, H) * 0.46;

                ctx.save();

                const outerGlow = ctx.createRadialGradient(bcx, bcy, bhR, bcx, bcy, bhMax * 1.6);
                outerGlow.addColorStop(0, 'rgba(0,0,0,0)');
                outerGlow.addColorStop(0.4, 'rgba(255,100,20,0.05)');
                outerGlow.addColorStop(0.75, 'rgba(255,60,0,0.07)');
                outerGlow.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = outerGlow;
                ctx.fillRect(0, 0, W, H);

                const rings = 22;
                for (let r = 0; r < rings; r++) {
                    const tRing = r / rings;
                    const radius = bhR * 1.35 + tRing * (bhMax - bhR * 1.35);
                    const rot = motionDir * tunnelPos * (r % 2 === 0 ? 0.45 : -0.32) + r * 0.29;
                    const alpha = (1 - tRing) * 0.58 + 0.03;
                    const hue = 15 + tRing * 28;
                    const lineW = Math.max(0.3, (1 - tRing) * 3.8);
                    ctx.save();
                    ctx.translate(bcx, bcy);
                    ctx.rotate(rot);
                    ctx.scale(1, 0.26);
                    ctx.strokeStyle = `hsla(${hue}, 95%, 62%, ${alpha})`;
                    ctx.lineWidth = lineW;
                    ctx.beginPath();
                    ctx.arc(0, 0, radius, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.restore();
                }

                const jetH = H * 0.42;
                const jet = ctx.createLinearGradient(bcx, bcy - jetH, bcx, bcy + jetH);
                jet.addColorStop(0, 'rgba(100,150,255,0)');
                jet.addColorStop(0.32, 'rgba(130,170,255,0.10)');
                jet.addColorStop(0.5, 'rgba(0,0,0,0)');
                jet.addColorStop(0.68, 'rgba(130,170,255,0.10)');
                jet.addColorStop(1, 'rgba(100,150,255,0)');
                const jetW = W * 0.035;
                ctx.fillStyle = jet;
                ctx.fillRect(bcx - jetW / 2, bcy - jetH, jetW, jetH * 2);

                const shadow = ctx.createRadialGradient(bcx, bcy, 0, bcx, bcy, bhR * 2.4);
                shadow.addColorStop(0, 'rgba(0,0,0,1)');
                shadow.addColorStop(0.42, 'rgba(0,0,0,1)');
                shadow.addColorStop(0.72, 'rgba(0,0,10,0.82)');
                shadow.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = shadow;
                ctx.fillRect(0, 0, W, H);

                ctx.restore();
                break;
            }
            case 'grid':
                solidFill('#050507');
                this._draw2DGrid(ctx, W, H, false, time);
                break;
            case 'grid_light':
                solidFill('#f2f2f4');
                this._draw2DGrid(ctx, W, H, true, time);
                break;
            case 'custom':
                solidFill(bgCustomColor || '#000011');
                break;
            default:
                solidFill('#000');
        }
    }

    // ── Sampling progress overlay ─────────────────────────────────────────────

    _renderPreProcessOverlay(ctx, W, H, progress) {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, 0, W, H);
        const cx = W / 2;
        const labelSize = Math.max(10, Math.round(W * 0.038));
        const subSize   = Math.max(8,  Math.round(W * 0.025));
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#a78bfa';
        ctx.font = `bold ${labelSize}px monospace`;
        ctx.fillText('📽 EXTRACTING FRAMES', cx, H * 0.46);
        const barW = W * 0.62, barH = Math.max(4, Math.round(H * 0.012));
        const barX = cx - barW / 2, barY = H * 0.505;
        ctx.fillStyle = '#3f3f46'; ctx.fillRect(barX, barY, barW, barH);
        ctx.fillStyle = '#7c3aed'; ctx.fillRect(barX, barY, barW * Math.min(progress, 1), barH);
        ctx.fillStyle = '#c4b5fd'; ctx.font = `${subSize}px monospace`;
        ctx.fillText(`${Math.round(Math.min(progress, 1) * 100)}%`, cx, barY + barH + H * 0.038);
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }

    // ── Tunnel rendering ──────────────────────────────────────────────────────

    _drawTunnel(ctx, W, H,
        startX, startY, startZoom, startRot, startPerspH, startPerspV, startPerspSX, startPerspSY,
        finishX, finishY, finishZoom, finishRot, finishPerspH, finishPerspV, finishPerspSX, finishPerspSY,
        masterZoom, curveEnabled, curveVal, zigzagEnabled, zigzagVal, focusBlurEnabled, focusBlur,
        maxZ, spacing, startAnim, finishAnim, enterWindowNorm, exitWindowNorm, beatPeak, frameOpacity) {

        const lerp = (a, b, t) => a + (b - a) * t;
        const frameCount = this._frames.length;
        if (frameCount === 0 || this._particles.length === 0) return;

        const dX = finishX - startX, dY = finishY - startY;
        const pathLen = Math.sqrt(dX * dX + dY * dY);
        let nx = 0, ny = -1;
        if (pathLen > 0.0001) { nx = -dY / pathLen; ny = dX / pathLen; }
        const midX = (startX + finishX) / 2, midY = (startY + finishY) / 2;
        const curveOffset = curveEnabled ? (curveVal / 300) * 0.8 : 0;
        const ctrlX = midX + nx * curveOffset, ctrlY = midY + ny * curveOffset;
        const zigAmp = zigzagEnabled ? (zigzagVal / 300) * 0.3 : 0;

        const slots = [];
        const tunnelFrac = this._tunnelPos % frameCount;
        for (let i = 0; i < frameCount; i++) {
            const relPos = ((i - tunnelFrac) % frameCount + frameCount) % frameCount;
            const z = relPos * spacing;
            const frameIdx = ((i + Math.floor(this._tunnelPos)) % frameCount + frameCount) % frameCount;
            slots.push({ slotI: i, z, frameIdx });
        }
        slots.sort((a, b) => b.z - a.z);

        for (const { slotI, z, frameIdx } of slots) {
            const p = this._particles[slotI];

            const tNorm = Math.max(0, Math.min(1, z / maxZ));
            const t = 1.0 - tNorm;

            const perspScale = 1.0 / (1.0 + tNorm * 3.0);

            const mt = 1.0 - t;
            let qx = mt * mt * startX + 2 * mt * t * ctrlX + t * t * finishX;
            let qy = mt * mt * startY + 2 * mt * t * ctrlY + t * t * finishY;

            qx += p.xOff * tNorm;
            qy += p.yOff * tNorm;

            if (zigAmp !== 0) {
                const wobble = Math.sin(t * 5 * Math.PI) * zigAmp;
                qx += nx * wobble; qy += ny * wobble;
            }

            const zoomAtT = lerp(startZoom, finishZoom, t);
            let fw = W * perspScale * masterZoom * zoomAtT;
            let fh = H * perspScale * masterZoom * zoomAtT;

            fw *= 1.0 + beatPeak * 0.35 * t;
            fh *= 1.0 + beatPeak * 0.35 * t;

            if (fw < 2 || fh < 2) continue;

            const fogFade  = (startAnim  !== 'none' && tNorm > 0.70) ? (1.0 - tNorm) / 0.30 : 1.0;
            const nearFade = (finishAnim !== 'none' && tNorm < 0.12) ? tNorm / 0.12 : 1.0;
            let alpha = fogFade * nearFade * frameOpacity;

            let extraRot = 0;

            if (startAnim === 'spin' && tNorm > 0.72) {
                extraRot = ((tNorm - 0.72) / 0.28) * Math.PI * 4;
            } else if (startAnim === 'zoom' && tNorm > 0.8) {
                const s = (1.0 - tNorm) / 0.2;
                fw *= s; fh *= s; alpha *= s;
            } else if (startAnim === 'fade_up' && tNorm > 0.75) {
                qy -= (tNorm - 0.75) / 0.25 * 0.12;
            } else if (startAnim === 'dissolve' && enterWindowNorm > 0 && tNorm > 1.0 - enterWindowNorm) {
                alpha *= (1.0 - tNorm) / enterWindowNorm;
            }

            if (finishAnim === 'zoom_through' && tNorm < 0.14) {
                const exitT = 1.0 - tNorm / 0.14;
                fw *= 1.0 + exitT * 4.5;
                fh *= 1.0 + exitT * 4.5;
                alpha = Math.max(0, 1.0 - exitT * 1.1);
            } else if (finishAnim === 'spin_out' && tNorm < 0.12) {
                extraRot += (1.0 - tNorm / 0.12) * Math.PI * 3;
            } else if (finishAnim === 'fade_down' && tNorm < 0.12) {
                const exitT = 1.0 - tNorm / 0.12;
                qy += exitT * 0.18;
                alpha *= (1.0 - exitT);
            } else if (finishAnim === 'dissolve' && exitWindowNorm > 0 && tNorm < exitWindowNorm) {
                alpha *= tNorm / exitWindowNorm;
            }

            if (alpha <= 0.01) continue;

            if (focusBlurEnabled && focusBlur > 0) {
                const blurPx = tNorm * focusBlur;
                ctx.filter = blurPx > 0.3 ? `blur(${blurPx.toFixed(1)}px)` : 'none';
            } else {
                ctx.filter = 'none';
            }

            const cx = W / 2 + qx * W;
            const cy = H / 2 + qy * H;

            const rotAtT = lerp(startRot, finishRot, t) * Math.PI / 180 + extraRot;
            const pH = lerp(startPerspH, finishPerspH, t);
            const pV = lerp(startPerspV, finishPerspV, t);
            const pSX = lerp(startPerspSX, finishPerspSX, t);
            const pSY = lerp(startPerspSY, finishPerspSY, t);
            const hasSX = Math.abs(pSX) > 0.5;
            const hasSY = Math.abs(pSY) > 0.5;
            const img = this._frames[frameIdx];

            ctx.save();
            ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
            ctx.translate(cx, cy);
            if (rotAtT !== 0) ctx.rotate(rotAtT);
            if (pH !== 0 || pV !== 0) {
                ctx.transform(1, Math.tan((pV * Math.PI) / 180), Math.tan((pH * Math.PI) / 180), 1, 0, 0);
            }

            if (hasSY) {
                const strips = Math.max(8, Math.min(20, Math.round(fh / 15)));
                for (let si = 0; si < strips; si++) {
                    const yNorm = (si + 0.5) / strips;
                    const wScale = Math.max(0.02, 1 + (pSY / 100) * (yNorm - 0.5) * 2);
                    const dW = fw * wScale;
                    ctx.drawImage(img, 0, si * img.height / strips, img.width, img.height / strips,
                        -dW / 2, -fh / 2 + si * (fh / strips), dW, fh / strips);
                }
            } else if (hasSX) {
                const strips = Math.max(8, Math.min(20, Math.round(fw / 15)));
                for (let sj = 0; sj < strips; sj++) {
                    const xNorm = (sj + 0.5) / strips;
                    const hScale = Math.max(0.02, 1 + (pSX / 100) * (xNorm - 0.5) * 2);
                    const dH = fh * hScale;
                    ctx.drawImage(img, sj * img.width / strips, 0, img.width / strips, img.height,
                        -fw / 2 + sj * (fw / strips), -dH / 2, fw / strips, dH);
                }
            } else {
                ctx.drawImage(img, -fw / 2, -fh / 2, fw, fh);
            }

            ctx.restore();

            if (finishAnim === 'flash' && tNorm < 0.1) {
                const flashT = 1.0 - tNorm / 0.1;
                ctx.save();
                ctx.globalAlpha = flashT * 0.45;
                ctx.fillStyle = '#fff';
                ctx.fillRect(cx - fw / 2, cy - fh / 2, fw, fh);
                ctx.restore();
            }
        }

        ctx.filter = 'none';
        ctx.globalAlpha = 1.0;
    }

    // ── 3D Gallery mode ─────────────────────────────────────────────────────────
    // A real three.js scene composited over the 2D output (mirrors AnamorphicCamera:
    // lazy-imported three.js → offscreen WebGL canvas → drawImage onto ctx, so it
    // also lands in recordings).
    // Three presets, ported from the R3F gallery study:
    //   • tube   — cylindrical rows of frame tiles, rows counter-spin at staggered
    //              speeds, with a slow vertical scroll (FiberScene).
    //   • sphere — Fibonacci-sphere of tiles all facing centre, auto-orbiting
    //              (CodropScene).
    //   • ruben  — the tube layout with fewer rows/cols (RubensScene).
    // The sampled video frames are the tile textures. The gallery has NO built-in
    // centrepiece: when AnamorphicCamera is enabled, ITS model is mid-layered between
    // the back and front tiles (see _renderGallery3D + compositeGalleryFront), so the
    // frames flow back → model → front. No GLSL template literals here (the grid
    // backdrop is a Canvas2D texture) so the obfuscator is unaffected.

    async _ensureGallery3D() {
        if (this._g3d || this._g3dLoading || this._g3dError) return;
        this._g3dLoading = true;
        try {
            // Bare specifier resolved by the index.html import map → vendored
            // core/lib/three/*; @vite-ignore keeps it intact (same as AnamorphicCamera).
            const threeSpec = 'three';
            const THREE = await import(/* @vite-ignore */ threeSpec);
            this._g3d = { THREE };
            this._buildGallery3DScene();
            this._g3dReady = true;
        } catch (_) {
            this._g3dError = true;   // WebGL/three unavailable — gallery silently no-ops
        } finally {
            this._g3dLoading = false;
        }
    }

    _buildGallery3DScene() {
        const { THREE } = this._g3d;

        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
        renderer.setPixelRatio(1);
        renderer.setClearColor(0x000000, 0);
        if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;

        const scene  = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
        camera.position.set(0, 0, 6.5);
        camera.lookAt(0, 0, 0);

        const galleryGroup = new THREE.Group();
        scene.add(galleryGroup);

        // Backdrop grid plane (textured Canvas2D grid → real perspective, no GLSL).
        const gridDark  = this._makeGridTexture(THREE, false);
        const gridLight = this._makeGridTexture(THREE, true);
        const gridMesh  = new THREE.Mesh(
            new THREE.PlaneGeometry(44, 44),
            new THREE.MeshBasicMaterial({ map: gridDark, toneMapped: false })
        );
        gridMesh.position.set(0, 0, -6);
        gridMesh.visible = false;
        scene.add(gridMesh);

        Object.assign(this._g3d, {
            renderer, scene, camera, galleryGroup,
            gridMesh, gridDark, gridLight,
            _tmpVec: new THREE.Vector3(),   // scratch for per-tile world-Z depth split
        });
    }

    _makeGridTexture(THREE, light) {
        const S = 512;
        const c = document.createElement('canvas');
        c.width = c.height = S;
        const g = c.getContext('2d');
        g.fillStyle = light ? '#f2f2f4' : '#050507';
        g.fillRect(0, 0, S, S);
        g.strokeStyle = light ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.12)';
        g.lineWidth = 1.5;
        const div = 16, step = S / div;
        for (let i = 0; i <= div; i++) {
            g.beginPath(); g.moveTo(i * step, 0); g.lineTo(i * step, S); g.stroke();
            g.beginPath(); g.moveTo(0, i * step); g.lineTo(S, i * step); g.stroke();
        }
        const tex = new THREE.CanvasTexture(c);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(3, 3);
        return tex;
    }

    // Build/refresh one CanvasTexture per sampled frame. Rebuilds (and flags tiles
    // for rebuild) whenever the underlying this._frames array is swapped — re-sample,
    // vignette rebake or a live capture.
    _ensureGalleryTextures() {
        const { THREE } = this._g3d;
        const N = this._frames.length;
        const first = this._frames[0] ?? null;
        const last  = this._frames[N - 1] ?? null;
        if (this._g3dTexN === N && this._g3dTexFirst === first && this._g3dTexLast === last) return;
        for (const t of this._g3dTextures) t.dispose();
        this._g3dTextures = this._frames.map((canvas) => {
            const tex = new THREE.CanvasTexture(canvas);
            tex.colorSpace = THREE.SRGBColorSpace;
            return tex;
        });
        this._g3dTexN = N; this._g3dTexFirst = first; this._g3dTexLast = last;
        this._g3dTexDirty = true;
    }

    _clearGalleryTiles() {
        const { galleryGroup } = this._g3d;
        for (let i = galleryGroup.children.length - 1; i >= 0; i--) {
            const child = galleryGroup.children[i];
            galleryGroup.remove(child);
            child.traverse?.((n) => { if (n.isMesh) n.geometry?.dispose(); });
        }
        for (const m of this._g3dTileMats) m.dispose();
        this._g3dTileMats = [];
        this._g3dTiles = [];
        this._g3dRowGroups = [];
    }

    _buildGalleryTiles(preset) {
        const { THREE, galleryGroup } = this._g3d;
        const textures = this._g3dTextures;
        const N = textures.length;
        this._clearGalleryTiles();
        if (N === 0) return;

        const makeTile = (texIndex, tileW, tileH) => {
            const mat = new THREE.MeshBasicMaterial({
                map: textures[texIndex % N], side: THREE.DoubleSide, toneMapped: false, transparent: true,
            });
            this._g3dTileMats.push(mat);
            const mesh = new THREE.Mesh(new THREE.PlaneGeometry(tileW, tileH), mat);
            this._g3dTiles.push(mesh);
            return mesh;
        };

        if (preset === 'sphere') {
            // Fibonacci sphere (CodropScene): even spread, every tile faces centre.
            const radius = 4.25, tileW = 0.72, tileH = 1.0;
            const count = Math.max(36, Math.min(96, N * 6));
            const golden = Math.PI * (3 - Math.sqrt(5));
            for (let i = 0; i < count; i++) {
                const t = count <= 1 ? 0.5 : i / (count - 1);
                const y = 1 - t * 2;
                const r = Math.sqrt(Math.max(0, 1 - y * y));
                const theta = golden * i;
                const mesh = makeTile(i % N, tileW, tileH);
                mesh.position.set(Math.cos(theta) * r * radius, y * radius * 0.92, Math.sin(theta) * r * radius);
                mesh.lookAt(0, 0, 0);
                galleryGroup.add(mesh);
            }
            this._g3dLoopHeight = 0;
        } else {
            // Cylinder (FiberScene / RubensScene): rows of tiles, repeated 3× tall
            // so the vertical scroll loops seamlessly. Each row counter-spins faster.
            const ruben = preset === 'ruben';
            const cols = ruben ? 6 : 12;
            const rows = ruben ? 3 : 5;
            const radius = 4.0, tileW = 0.72, tileH = 1.0, ySpacing = 2.7;
            const repeatCount = 3, totalRows = rows * repeatCount;
            this._g3dRowSpeed = [];
            for (let r = 0; r < rows; r++) {
                const t = rows <= 1 ? 0 : r / (rows - 1);
                this._g3dRowSpeed.push(0.65 + t * 0.9);
            }
            for (let rowIndex = 0; rowIndex < totalRows; rowIndex++) {
                const y = (rowIndex - (totalRows - 1) / 2) * ySpacing;
                const baseRow = rowIndex % rows;
                const rowOffset = baseRow % 2 === 0 ? 0 : 0.5;
                const rowGroup = new THREE.Group();
                rowGroup.position.y = y;
                rowGroup.userData.baseRow = baseRow;
                for (let col = 0; col < cols; col++) {
                    const theta = ((col + rowOffset) / cols) * Math.PI * 2;
                    const texIndex = (baseRow * cols + col) % N;
                    const mesh = makeTile(texIndex, tileW, tileH);
                    mesh.position.set(Math.cos(theta) * radius, 0, Math.sin(theta) * radius);
                    mesh.rotation.y = -(theta + Math.PI / 2);
                    rowGroup.add(mesh);
                }
                galleryGroup.add(rowGroup);
                this._g3dRowGroups.push(rowGroup);
            }
            this._g3dLoopHeight = rows * ySpacing;
        }
    }

    _renderGallery3D(ctx, W, H, masterZoom, frameOpacity, motionSpeedS, sdt, dt,
                     bass, mid, treble, beatPeak, bgReverse, bgMode, preset, isMainTarget) {
        if (!this._g3dReady) { this._ensureGallery3D(); return false; }

        const { renderer, scene, camera, galleryGroup, gridMesh, gridDark, gridLight } = this._g3d;

        // Resize the offscreen renderer to the output dimensions.
        if (this._g3dSizedW !== W || this._g3dSizedH !== H) {
            renderer.setSize(W, H, false);
            camera.aspect = W / H;
            camera.updateProjectionMatrix();
            this._g3dSizedW = W; this._g3dSizedH = H;
        }

        // Preset switch → adjust camera + force a tile rebuild.
        if (this._g3dPreset !== preset) {
            this._g3dPreset = preset;
            camera.position.z = preset === 'ruben' ? 6.0 : 6.5;
            this._g3dTilesPreset = null;
        }

        // Refresh textures + (re)build tiles when frames change or preset switched.
        this._ensureGalleryTextures();
        if (this._g3dTilesPreset !== preset || this._g3dTexDirty) {
            this._buildGalleryTiles(preset);
            this._g3dTilesPreset = preset;
            this._g3dTexDirty = false;
        }

        // ── Motion: auto (motion speed) or audio-sync flywheel (speed = 0) ────────
        const dir = bgReverse ? -1 : 1;
        let spinRate;
        if (motionSpeedS > 0) {
            spinRate = motionSpeedS * 0.05;
            this._g3dScroll += sdt * motionSpeedS * 0.25 * dir;
        } else {
            const dom = Math.max(bass, mid, treble);
            if (dom > 0.08) {
                const accelLerp = 1 - Math.pow(0.02, dt);
                this._g3dSpinVel += (dom * 6 - this._g3dSpinVel) * accelLerp;
            } else {
                this._g3dSpinVel *= Math.pow(0.005, dt);
                if (Math.abs(this._g3dSpinVel) < 0.02) this._g3dSpinVel = 0;
            }
            spinRate = 0.15 + this._g3dSpinVel * 0.15;
            this._g3dScroll += sdt * (0.3 + this._g3dSpinVel * 0.3) * dir;
        }
        this._g3dAngle += sdt * spinRate * dir * (1 + beatPeak * 0.4);

        // Master Zoom → whole-scene scale; beat adds a subtle breathing pulse.
        const groupScale = (0.6 + masterZoom * 0.9) * (1 + beatPeak * 0.05);
        galleryGroup.scale.setScalar(groupScale);

        if (preset === 'sphere') {
            galleryGroup.position.y = 0;
            galleryGroup.rotation.set(Math.sin(performance.now() * 0.0003) * 0.22, this._g3dAngle, 0);
        } else {
            const loop = this._g3dLoopHeight;
            if (loop > 0) {
                if (this._g3dScroll > loop / 2) this._g3dScroll -= loop;
                else if (this._g3dScroll < -loop / 2) this._g3dScroll += loop;
            }
            galleryGroup.rotation.set(0, 0, 0);
            galleryGroup.position.y = -this._g3dScroll;
            for (const rg of this._g3dRowGroups) {
                rg.rotation.y = this._g3dAngle * (this._g3dRowSpeed[rg.userData.baseRow] || 1);
            }
        }

        // Per-tile opacity (Frame Opacity slider).
        const op = Math.max(0, Math.min(1, frameOpacity));
        for (const m of this._g3dTileMats) { m.opacity = op; m.transparent = op < 0.999; }

        const wantGrid = bgMode === 'grid' || bgMode === 'grid_light';
        if (wantGrid) gridMesh.material.map = bgMode === 'grid_light' ? gridLight : gridDark;

        // ── Mid-layer split: when an Anamorphic model is active and we own the main
        //    output, draw the BACK tiles now and defer the FRONT tiles until after
        //    AnamorphicCamera composites its model (compositeGalleryFront), so frames
        //    flow back → model → front. Otherwise render the whole gallery in one pass.
        const anamOn = !!document.getElementById('anamEnabled')?.checked;
        const midLayer = isMainTarget && anamOn;

        if (!midLayer) {
            gridMesh.visible = wantGrid;
            for (const t of this._g3dTiles) t.visible = true;
            renderer.render(scene, camera);
            ctx.drawImage(renderer.domElement, 0, 0, W, H);
            return true;
        }

        // Split tiles by world-space depth (camera looks down -Z → worldZ > 0 = front).
        scene.updateMatrixWorld(true);
        const tmp = this._g3d._tmpVec;
        const fronts = [];
        for (const t of this._g3dTiles) {
            const isFront = t.getWorldPosition(tmp).z > 0;
            t.visible = !isFront;
            if (isFront) fronts.push(t);
        }
        gridMesh.visible = wantGrid;
        renderer.render(scene, camera);
        ctx.drawImage(renderer.domElement, 0, 0, W, H);

        // Render the FRONT tiles into the buffer; it's held until compositeGalleryFront
        // draws it on top of the Anamorphic model later this frame.
        gridMesh.visible = false;
        for (const t of this._g3dTiles) t.visible = false;
        for (const t of fronts) t.visible = true;
        renderer.render(scene, camera);
        this._g3dFrontPending = true;
        return true;
    }

    // Called from main.js right after AnamorphicCamera composites its model, so the
    // gallery's front-facing tiles land ON TOP of it (back → model → front). No-op for
    // every other effect/mode, and when no Anamorphic model is mid-layered this frame.
    compositeGalleryFront(ctx, w, h) {
        if (!this._g3dFrontPending || !this._g3d?.renderer) return;
        ctx.drawImage(this._g3d.renderer.domElement, 0, 0, w, h);
        this._g3dFrontPending = false;
    }

    // 2D scrolling grid backdrop for the non-gallery (Canvas2D) tunnel modes, so the
    // Grid background options work everywhere — not only inside the 3D Gallery.
    _draw2DGrid(ctx, W, H, light, time) {
        ctx.save();
        ctx.strokeStyle = light ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.14)';
        ctx.lineWidth = 1;
        const div = 18;
        const stepX = W / div, stepY = H / div;
        const off = ((time * 10) % stepY + stepY) % stepY;
        for (let x = 0; x <= W; x += stepX) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
        }
        for (let y = -stepY + off; y <= H; y += stepY) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
        }
        ctx.restore();
    }

    // ── Main render ───────────────────────────────────────────────────────────

    render(ctx, videoEngine, activeMedia, crop, audioFeatures) {
        const W = videoEngine.targetW;
        const H = videoEngine.targetH;
        const time = performance.now() * 0.001;
        const now  = performance.now();
        // Clear any stale deferred 3D-gallery front pass so it can never paint over a
        // different effect/mode (only the gallery mid-layer path below re-arms it).
        this._g3dFrontPending = false;

        // ── Read UI params ─────────────────────────────────────────
        const tunnelMode    = document.getElementById('mlTunnelMode')?.value ?? 'tunnel';
        const maxFrames     = Math.max(4, parseInt(document.getElementById('mlTunnelDepth')?.value ?? '20'));
        const spacing       = Math.max(0.5, parseFloat(document.getElementById('mlFrameDistance')?.value ?? '8'));
        const masterZoom    = parseFloat(document.getElementById('mlMasterZoom')?.value ?? '0.4');
        const motionSpeedS  = parseFloat(document.getElementById('mlMotionSpeed')?.value ?? '6.0');
        const wormholeForwardSpeed = parseFloat(document.getElementById('mlWormholeForwardSpeed')?.value ?? '6.0');
        const bgMode        = document.getElementById('mlBackground')?.value ?? 'black';
        const bgCustomColor = document.getElementById('mlBgCustomColor')?.value ?? '#000011';
        const bgReverse     = document.getElementById('mlBgReverse')?.checked ?? false;
        const colorMode     = document.getElementById('mlColorMode')?.value ?? 'normal';
        const colorCustom   = document.getElementById('mlColorCustom')?.value ?? '#ffffff';
        const flipDirection = document.getElementById('mlFlipDirection')?.value ?? 'up';
        const flipbook3D    = document.getElementById('mlFlipbook3D')?.checked ?? false;
        const flipMoBlur    = document.getElementById('mlFlipMotionBlur')?.checked ?? false;
        const flipVibrate   = document.getElementById('mlFlipVibration')?.checked ?? false;
        const textureMode   = document.getElementById('mlTexture')?.value ?? 'none';
        const textureAmount = parseFloat(document.getElementById('mlTextureAmount')?.value ?? '0.5');
        const startAnim     = document.getElementById('mlStartAnim')?.value ?? 'none';
        const finishAnim    = document.getElementById('mlFinishAnim')?.value ?? 'none';
        const enterTime     = parseFloat(document.getElementById('mlEnterTime')?.value ?? '0.3');
        const exitTime      = parseFloat(document.getElementById('mlExitTime')?.value ?? '0.3');
        const jitterEnabled = document.getElementById('mlJitterEnabled')?.checked ?? false;
        const jitter        = parseFloat(document.getElementById('mlJitter')?.value ?? '0');
        const focusBlurEnabled = document.getElementById('mlFocusBlurEnabled')?.checked ?? false;
        const frameOpacity  = parseFloat(document.getElementById('mlFrameOpacity')?.value ?? '1.0');
        const trailEnabled  = document.getElementById('mlTrailEnabled')?.checked ?? false;
        const trailIntensity = parseFloat(document.getElementById('mlTrailIntensity')?.value ?? '0.5');
        const vignette      = parseFloat(document.getElementById('mlVignette')?.value ?? '0');
        const burnCharWidth  = parseFloat(document.getElementById('mlBurnCharWidth')?.value ?? '0.12');
        const burnEmberWidth = parseFloat(document.getElementById('mlBurnEmberWidth')?.value ?? '0.04');
        const burnCharColor  = document.getElementById('mlBurnCharColor')?.value ?? '#140a05';
        const burnEmberColor = document.getElementById('mlBurnEmberColor')?.value ?? '#ff6a00';

        const maxZ = 8.0 * maxFrames;
        const enterWindowNorm = motionSpeedS > 0 ? Math.min(0.35, enterTime / motionSpeedS) : 0.08;
        const exitWindowNorm  = motionSpeedS > 0 ? Math.min(0.35, exitTime  / motionSpeedS) : 0.08;

        const startX      = parseFloat(document.getElementById('mlStartX')?.value ?? '20') / 100;
        const startY      = parseFloat(document.getElementById('mlStartY')?.value ?? '-35') / 100;
        const startZoom   = parseFloat(document.getElementById('mlStartZoom')?.value ?? '0.4');
        const startRot    = parseFloat(document.getElementById('mlStartRot')?.value ?? '0');
        const startPerspH  = parseFloat(document.getElementById('mlStartPerspH')?.value ?? '0');
        const startPerspV  = parseFloat(document.getElementById('mlStartPerspV')?.value ?? '0');
        const startPerspSX = parseFloat(document.getElementById('mlStartPerspSX')?.value ?? '0');
        const startPerspSY = parseFloat(document.getElementById('mlStartPerspSY')?.value ?? '0');

        const finishX      = parseFloat(document.getElementById('mlFinishX')?.value ?? '0') / 100;
        const finishY      = parseFloat(document.getElementById('mlFinishY')?.value ?? '20') / 100;
        const finishZoom   = parseFloat(document.getElementById('mlFinishZoom')?.value ?? '1.0');
        const finishRot    = parseFloat(document.getElementById('mlFinishRot')?.value ?? '0');
        const finishPerspH  = parseFloat(document.getElementById('mlFinishPerspH')?.value ?? '0');
        const finishPerspV  = parseFloat(document.getElementById('mlFinishPerspV')?.value ?? '0');
        const finishPerspSX = parseFloat(document.getElementById('mlFinishPerspSX')?.value ?? '0');
        const finishPerspSY = parseFloat(document.getElementById('mlFinishPerspSY')?.value ?? '0');

        const curveEnabled  = document.getElementById('mlCurveEnabled')?.checked ?? true;
        const curveVal      = parseFloat(document.getElementById('mlCurve')?.value ?? '120');
        const zigzagEnabled = document.getElementById('mlZigZagEnabled')?.checked ?? false;
        const zigzagVal     = parseFloat(document.getElementById('mlZigZag')?.value ?? '0');
        const focusBlur     = parseFloat(document.getElementById('mlFocusBlur')?.value ?? '2');

        // ── Audio ──────────────────────────────────────────────────
        const bass   = audioFeatures?.bass   ?? 0;
        const mid    = audioFeatures?.mid    ?? 0;
        const treble = audioFeatures?.treble ?? 0;
        const dt = Math.min((now - this._lastTime) / 1000, 0.1);
        this._lastTime = now;

        // ── Audio Speed Sync: when enabled, the video's playbackRate swings with the
        //    audio — scale all motion by it so every preset speeds up/down with the
        //    beat. `sdt` is the motion time-step; raw `dt` still drives audio decay.
        let speedSync = 1.0;
        if (document.getElementById('speedSyncToggle')?.checked &&
            activeMedia && activeMedia.playbackRate && !isNaN(activeMedia.playbackRate)) {
            speedSync = activeMedia.playbackRate;
        }
        const sdt = dt * speedSync;

        const bgAlpha = 1 - Math.pow(0.96, dt * 60);
        this._beatBg += (bass - this._beatBg) * bgAlpha;
        const beatOnset = Math.max(0, bass - this._beatBg - 0.05);
        const peakDecay = 1 - Math.pow(0.01, dt);
        this._beatPeak = Math.max(
            this._beatPeak - this._beatPeak * peakDecay,
            Math.min(beatOnset * 2.5, 0.8)
        );

        // ── Detect seekable video ──────────────────────────────────
        const isSeekable = activeMedia instanceof HTMLVideoElement &&
                           isFinite(activeMedia.duration) &&
                           activeMedia.duration > 0.1;

        if (isSeekable) {
            const videoKey = this._getVideoKey(activeMedia, maxFrames);
            if (!this._sampling && videoKey !== this._lastVideoKey) {
                this._lastVideoKey = videoKey;
                this._sampleFrames(activeMedia, maxFrames, crop, W, H);
            }
        }

        // ── Live / static fallback ─────────────────────────────────
        if (!isSeekable && !this._sampling && activeMedia) {
            let captureNow = false;
            if (motionSpeedS <= 0) {
                captureNow = beatOnset > 0.06 && (now - this._lastCapture) > 140;
            } else {
                const slotMs = (motionSpeedS / maxFrames) * 1000;
                captureNow = (now - this._lastCapture) >= slotMs;
            }
            if (captureNow) {
                this._lastCapture = now;
                const cW = Math.max(64, Math.round(W * 0.5));
                const cH = Math.max(64, Math.round(H * 0.5));
                this._framesRaw.push(this._captureFrame(activeMedia, crop, cW, cH));
                while (this._framesRaw.length > maxFrames) this._framesRaw.shift();
                this._vignBakedValue = -1;       // force vignette rebake to include the new frame
                this._rainConfigKey  = '';
                this._globeTileCount = 0;
            }
        }

        // Bake the per-frame vignette into the source tiles so it applies to EVERY
        // mode/preset automatically (each drawn frame carries its own darkened edges).
        this._ensureVignetteBake(vignette);

        const N = this._frames.length;

        // ── Trail: fade previous frame instead of clearing ─────────
        if (trailEnabled) {
            ctx.save();
            ctx.fillStyle = `rgba(0,0,0,${(0.9 - trailIntensity * 0.8).toFixed(3)})`;
            ctx.fillRect(0, 0, W, H);
            ctx.restore();
        }

        // ── Render background ──────────────────────────────────────
        const bgDrivePos =
            tunnelMode === 'rain'     ? (this._rainDrops[0]?.y ?? 0) * 10 :
            tunnelMode === 'domino'   ? Math.max(0, this._dominoTimer ?? 0) * 3.0 :
            tunnelMode === 'globe'    ? this._globeRotation * 5 :
            tunnelMode === 'wormhole' ? this._wormholePhase * 3 :
            tunnelMode === 'flipbook' ? this._flipPos * 4 :
            tunnelMode === 'burn'     ? this._burnTravel * 6 :
            tunnelMode === 'shred'    ? this._burnTravel * 6 :
            this._tunnelPos;
        // In 3D Gallery, a Grid background is the scene's own perspective grid plane,
        // so just clear to its base colour here (the WebGL pass paints the grid). Every
        // other background still draws on the 2D canvas and shows behind the gallery.
        const galleryGridBg = tunnelMode === 'gallery3d' && (bgMode === 'grid' || bgMode === 'grid_light');
        if (galleryGridBg) {
            ctx.fillStyle = bgMode === 'grid_light' ? '#f2f2f4' : '#050507';
            ctx.fillRect(0, 0, W, H);
        } else {
            this._renderBackground(ctx, activeMedia, crop, W, H, bgMode, bgCustomColor, time, bgDrivePos, bgReverse, trailEnabled);
        }

        // ── Mode branch ────────────────────────────────────────────
        if (tunnelMode === 'rain') {
            if (N > 0) {
                const vortex      = startRot >= 350;
                const dirAngle    = vortex ? 0 : startRot;
                const spawnSpread = Math.max(0.05, Math.abs(startPerspH) / 50);
                const wobbleAmp   = curveEnabled ? curveVal / 350 : 0;
                const wobbleFreq  = 0.5 + Math.abs(startPerspV) / 20;
                const spinMult    = zigzagEnabled ? zigzagVal / 50 : 0;
                const rainKey     = `${N}|${Math.round(startRot)}`;
                if (this._rainConfigKey !== rainKey) {
                    this._initRain(N, N, dirAngle, startX, startY, spawnSpread,
                                   startZoom, finishZoom, wobbleAmp, wobbleFreq, spinMult, vortex);
                    this._rainConfigKey = rainKey;
                } else if (this._rainConfig) {
                    // Live-update tunable params without full reinit
                    this._rainConfig.wobbleAmp   = wobbleAmp;
                    this._rainConfig.wobbleFreq  = wobbleFreq;
                    this._rainConfig.spinMult    = spinMult;
                    this._rainConfig.sizeMin     = startZoom;
                    this._rainConfig.sizeMax     = finishZoom;
                    this._rainConfig.spawnCX     = startX;
                    this._rainConfig.spawnCY     = startY;
                    this._rainConfig.spawnSpread = spawnSpread;
                }
                this._updateRain(sdt, motionSpeedS, N, N, bass, mid, treble, this._beatPeak);
                this._drawRain(ctx, W, H, masterZoom, frameOpacity, time);
            }
        } else if (tunnelMode === 'domino') {
            if (N > 0) {
                if (this._dominoN !== N) this._initDomino(N, N);
                this._updateDomino(sdt, motionSpeedS, N, beatOnset);
                this._drawDomino(ctx, W, H, masterZoom, frameOpacity,
                    startX, startY, startZoom, finishX, finishY, finishZoom,
                    curveEnabled, curveVal, zigzagEnabled, zigzagVal);
            }
        } else if (tunnelMode === 'globe') {
            const globeStyle = document.getElementById('mlGlobeStyle')?.value ?? 'orbit';
            if (globeStyle === 'lens') {
                // ── Lens Pulse: static frame grid + a moving magnifier bubble ──
                const minDim = Math.min(W, H);
                let lx = W / 2, ly = H / 2, strengthTarget, radius;
                if (motionSpeedS > 0) {
                    // Time-driven: the lens roams a slow Lissajous path
                    this._lensPhase += sdt * motionSpeedS * 0.12;
                    lx = W / 2 + Math.sin(this._lensPhase) * W * 0.24;
                    ly = H / 2 + Math.sin(this._lensPhase * 0.73 + 1.3) * H * 0.20;
                    strengthTarget = 1.7;
                    radius = minDim * 0.42;
                } else {
                    // Audio-driven: lens drifts gently and BULGES harder on every beat
                    this._lensPhase += sdt * 0.5;
                    lx = W / 2 + Math.sin(this._lensPhase) * W * 0.16;
                    ly = H / 2 + Math.cos(this._lensPhase * 0.8) * H * 0.13;
                    const audioBulge = this._beatPeak * 1.7 + bass * 0.9;
                    strengthTarget = 1.2 + audioBulge;
                    radius = minDim * (0.36 + bass * 0.12);
                }
                // Fast attack on hits, slow ease back down
                const rate = strengthTarget > this._lensStrength ? 0.35 : 0.06;
                this._lensStrength += (strengthTarget - this._lensStrength) * rate;
                if (N > 0) {
                    this._drawLensGrid(ctx, W, H, masterZoom, frameOpacity, lx, ly, radius, this._lensStrength, spacing);
                }
            } else {
                // ── Gallery Orbit: subtly spinning 3D globe of frames ──
                const rotDir = bgReverse ? -1 : 1;
                const rotSpeed = motionSpeedS > 0
                    ? motionSpeedS * 0.4
                    : (0.5 + this._beatPeak * 2.0) * 0.3;
                this._globeRotation += sdt * rotSpeed * rotDir;
                if (N > 0) {
                    this._drawGlobe(ctx, W, H, masterZoom, frameOpacity,
                        startPerspH, startPerspV, startZoom, dt, bass, this._beatPeak);
                }
            }
        } else if (tunnelMode === 'wormhole') {
            const dir = bgReverse ? -1 : 1;
            let travelRate, spinRate;

            // Forward dive speed using wormholeForwardSpeed (0 = audio sync flywheel)
            if (wormholeForwardSpeed > 0) {
                travelRate = wormholeForwardSpeed * (startRot === 0 ? 0.36 : 0.18);
            } else {
                // Linear audio logic: react faster to audio, and follow a linear increase and decrease
                const dom = Math.max(bass, mid, treble);
                const targetVel = dom > 0.08 ? dom * 20.0 : 0.0;
                
                let currentVel = this._wormholeTravelVel || 0;
                const diff = targetVel - currentVel;
                
                const attackRate = 60.0; // very fast attack
                const decayRate = 12.0;  // smooth linear decay
                
                const rate = diff > 0 ? attackRate : decayRate;
                const step = rate * dt;
                
                if (Math.abs(diff) <= step) {
                    currentVel = targetVel;
                } else {
                    currentVel += Math.sign(diff) * step;
                }
                
                this._wormholeTravelVel = currentVel;
                travelRate = this._wormholeTravelVel * (startRot === 0 ? 0.5 : 0.25);
            }

            // Spin/rotational speed using motionSpeedS (0 = audio sync flywheel)
            if (motionSpeedS > 0) {
                spinRate = motionSpeedS * 0.04;
            } else {
                const dom = Math.max(bass, mid, treble);
                if (dom > 0.08) {
                    const targetVel = dom * 12;
                    const accelLerp = 1 - Math.pow(0.02, dt);
                    this._wormholeSpinVel = (this._wormholeSpinVel || 0) + (targetVel - (this._wormholeSpinVel || 0)) * accelLerp;
                } else {
                    this._wormholeSpinVel = (this._wormholeSpinVel || 0) * Math.pow(0.005, dt);
                    if (Math.abs(this._wormholeSpinVel) < 0.05) this._wormholeSpinVel = 0;
                }
                spinRate = this._wormholeSpinVel * 0.05;
            }

            this._wormholePhase += sdt * travelRate * dir * (1 + this._beatPeak * 0.4);
            const actualSpinRate = startRot === 0 ? 0 : spinRate;
            this._wormholeSpin  += sdt * actualSpinRate * dir;
            if (N > 0) {
                const spokes   = Math.max(10, Math.round(maxFrames));       // Tunnel Depth → ring density
                const holeFrac = Math.min(0.6, Math.max(0.05, startZoom));  // Start Zoom → hole size
                this._drawWormhole(ctx, W, H, masterZoom, frameOpacity,
                    spokes, holeFrac, startRot, this._wormholeSpin, this._beatPeak,
                    startX, startY, curveEnabled, curveVal, zigzagEnabled, zigzagVal, bgReverse, spacing);
            }
        } else if (tunnelMode === 'flipbook') {
            const dir = bgReverse ? -1 : 1;
            const beforeFlip = this._flipPos;
            if (motionSpeedS > 0) {
                // Auto: steady page flips, sped up on beats
                this._flipPos += sdt * motionSpeedS * 0.32 * dir * (1 + this._beatPeak * 0.6);
            } else {
                // Audio (Carousel flywheel): velocity ramps toward the audio energy,
                // coasts down on friction, and freezes completely when it's quiet.
                const dom = Math.max(bass, mid, treble);
                if (dom > 0.08) {
                    const targetVel = dom * 9;                      // up to ~9 flips/sec at peak
                    const accelLerp = 1 - Math.pow(0.02, dt);
                    this._carouselVel += (targetVel - this._carouselVel) * accelLerp;
                } else {
                    this._carouselVel *= Math.pow(0.005, dt);
                    if (Math.abs(this._carouselVel) < 0.05) this._carouselVel = 0;
                }
                this._flipPos += this._carouselVel * sdt * dir;
            }
            this._flipStep = Math.abs(this._flipPos - beforeFlip);     // travel this frame → motion blur
            if (N > 0 && this._flipPos < 0) this._flipPos += Math.ceil(-this._flipPos / N) * N;
            if (N > 0) {
                const bend = (curveEnabled ? curveVal : 120) / 220;         // Curve → page bend amount
                if (flipbook3D) {
                    this._drawFlipbook3D(ctx, W, H, masterZoom, frameOpacity, this._beatPeak, flipDirection, flipMoBlur, flipVibrate);
                } else {
                    this._drawFlipbook(ctx, W, H, masterZoom, frameOpacity, bend, this._beatPeak, flipDirection);
                }
            }
        } else if (tunnelMode === 'burn') {
            // Reused generic sliders (consistent with Rain/Domino/Wormhole's reuse
            // convention): Start Rot = ember-drift direction, Start Zoom = burn
            // jaggedness, Curve = heat crinkle, ZigZag = cloth ripple, Jitter =
            // flame flicker, Tunnel Depth = simultaneous floating-card count
            // (slider 4–120 → 2–30 cards, effective across its whole range),
            // Reverse = cards approach instead of receding.
            const windAngle   = ((startRot % 360) + 360) % 360;
            const jagAmount   = startZoom;
            const curlAmount  = curveEnabled ? Math.abs(curveVal) / 300 : 0;
            const rippleAmount = 0.15 + (zigzagEnabled ? Math.abs(zigzagVal) / 300 : 0);
            const flickerAmt  = jitterEnabled ? jitter / 20 : 0;
            const cardCount   = Math.max(2, Math.min(30, Math.round(maxFrames / 4)));
            this._updateBurn(sdt, motionSpeedS, N, cardCount, bass, mid, treble, this._beatPeak);
            if (N > 0) {
                this._drawBurn(ctx, W, H, masterZoom, frameOpacity, windAngle, jagAmount, curlAmount, rippleAmount,
                    flickerAmt, burnCharWidth, burnEmberWidth, burnCharColor, burnEmberColor, sdt, bgReverse);
            }
        } else if (tunnelMode === 'shred') {
            // Shred Frames: frames fly in from the back, growing as they approach,
            // then run through an invisible shredder — a front sweeps across each
            // sheet and every ribbon past it drops away, tumbling independently.
            // Slider reuse: Start Zoom = ribbon density, Curve = tumble amount,
            // ZigZag = cloth ripple, Jitter = fall speed, Tunnel Depth =
            // simultaneous card count, Reverse = recede instead of approach.
            const strips     = Math.max(8, Math.min(48, Math.round(8 + startZoom * 32)));
            const tumble     = 3.0 * (curveEnabled ? Math.abs(curveVal) / 120 : 1.0);
            const rippleAmount = 0.15 + (zigzagEnabled ? Math.abs(zigzagVal) / 300 : 0);
            const fallMult   = 1.0 * (jitterEnabled ? 1 + jitter / 10 : 1.0);   // floaty drift, not a drop
            const cardCount  = Math.max(2, Math.min(30, Math.round(maxFrames / 4)));
            this._updateBurn(sdt, motionSpeedS, N, cardCount, bass, mid, treble, this._beatPeak);
            if (N > 0) {
                this._drawShred(ctx, W, H, masterZoom, frameOpacity, strips, tumble, rippleAmount, fallMult, bgReverse);
            }
        } else if (tunnelMode === 'gallery3d') {
            const galleryPreset = document.getElementById('mlGalleryPreset')?.value ?? 'tube';
            const isMainTarget = ctx === videoEngine.ctx;
            this._renderGallery3D(ctx, W, H, masterZoom, frameOpacity, motionSpeedS, sdt, dt,
                bass, mid, treble, this._beatPeak, bgReverse, bgMode, galleryPreset, isMainTarget);
        } else {
            if (N > 0) this._ensureParticles(N);
            if (N > 0 && !this._sampling) {
                this._updateParticles(sdt, motionSpeedS, N, bass, mid, treble, this._beatPeak, jitterEnabled, jitter);
            }
            if (N >= 1 && this._particles.length > 0) {
                this._drawTunnel(ctx, W, H,
                    startX, startY, startZoom, startRot, startPerspH, startPerspV, startPerspSX, startPerspSY,
                    finishX, finishY, finishZoom, finishRot, finishPerspH, finishPerspV, finishPerspSX, finishPerspSY,
                    masterZoom, curveEnabled, curveVal, zigzagEnabled, zigzagVal, focusBlurEnabled, focusBlur,
                    maxZ, spacing, startAnim, finishAnim, enterWindowNorm, exitWindowNorm, this._beatPeak, frameOpacity);
            }
        }

        // ── Paper texture overlay (soft-light; black backgrounds stay clean) ──
        this._applyTexture(ctx, W, H, textureMode, textureAmount);

        // ── Color mode post-process (applies to the whole composited output) ──
        this._applyColorMode(ctx, W, H, colorMode, colorCustom, time);

        if (this._sampling) {
            this._renderPreProcessOverlay(ctx, W, H, this._sampleProgress);
        }
    }
}
