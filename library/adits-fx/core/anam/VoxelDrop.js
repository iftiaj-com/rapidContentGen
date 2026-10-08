// =============================================================================
// VoxelDrop — Pixel-to-Voxel physics drop for the Anamorphic video/photo model.
// -----------------------------------------------------------------------------
// A faithful port of the Codrops "Pixel-to-Voxel Video Drop" (Three.js + Rapier)
// adapted into Adits' AnamorphicCamera. A 2D media texture (video or photo) is
// tiled across a grid of InstancedMesh BoxGeometry cubes, flattened in the vertex
// shader so it reads as a flat plane. A ripple raises the depth back to full cubes
// (voxelization); the moment each cube completes, its Rapier rigid body wakes and
// drops under gravity. "Back to Plane" lerps every body home and re-flattens.
//
// Differences from the tutorial (intentional, for Adits):
//  • THREE + RAPIER are injected (lazy-loaded by AnamorphicCamera), not imported.
//  • Animation is driven manually in tick() (tied to the render loop) instead of
//    GSAP, so progress never advances on frames that don't render.
//  • The grid lives in the model group's LOCAL space (~2 units), so the anamorphic
//    parallax / perspective / scale compose on top for free.
//  • Per-instance id comes from an `aInstanceId` attribute (no gl_InstanceID), so it
//    compiles in a GLSL1 ShaderMaterial on any three.js revision.
//  • Mouse grab interaction is omitted (gesture drives the camera, as before).
//
// NOTE: this file embeds GLSL template literals → it MUST stay in the
// vite-plugin-javascript-obfuscator `exclude` list (see vite.config.mjs), exactly
// like AnamorphicCamera.js.
// =============================================================================

// Same hash the tutorial uses (utils/common.js) so the JS-side ripple that wakes
// the bodies stays bit-identical to the shader's noise.
function computeNoiseOffset(index) {
    const r = (x, y) => {
        const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453123;
        return s - Math.floor(s);
    };
    return (r(index, 123.456) - 0.5) * 0.3;
}

const VOXEL_VERT = `
uniform vec2 uGridDims;
uniform vec2 uCubeSize;
uniform float uVoxelateProgress;
uniform vec2 uRippleCenter;
uniform float uEffectSpread;
uniform float uEffectDepth;
uniform float uOrganicMode;
uniform float uUseRandomDepth;
uniform float uUsePixelate;
uniform float uUseRGBShift;
uniform float uHoleMode;
uniform float uMagnetMode;
uniform vec3  uMagnetPos;
uniform float uMagnetStrength;
uniform float uMagnetRadius;
uniform float uMagnetDir;   // +1 = pull toward point, -1 = push away (Invert / gesture)
uniform float uMagnetGain;  // 0..1 overall magnet activity (0 = pixels stay in place)
uniform float uFlipMode;    // Flip — each tile rotates ±180° about its own centre
uniform float uFlipSpeed;   // Auto wave speed
uniform float uFlipRange;   // Custom-gesture influence radius (local units)
uniform vec3  uFlipCenter;  // Custom-gesture point (local space)
uniform float uFlipAxis;    // 0 = random per-tile, 1 = horizontal (X), 2 = vertical (Y)
uniform float uFlipDir;     // +1 / -1 gesture flip direction
uniform float uFlipGain;    // 0..1 gesture flip amount (palm open = 1, fist = 0)
uniform float uFlipGesture; // 0 = Auto wave, 1 = Custom Gesture drives the flip
uniform float uTime;        // seconds — drives the Auto flip wave
uniform float uGrowMode;       // Grow — city-building extrusion driven by luminance
uniform float uGrowAmount;     // 0..1+ max extrusion height (1 = full voxel height)
uniform float uGrowContrast;   // 0..1 contrast curve (0 = gentle hills, 1 = skyscrapers)
uniform float uGrowAudioPulse; // 0..1 additive audio-reactive height modulation
uniform vec3  uGrowCenter;      // Custom-gesture point (local space)
uniform float uGrowRange;       // Custom-gesture influence radius (local units)
uniform float uGrowGestureGain; // 0..1 overall gesture gain (openness)
uniform float uGrowBackside;    // 0 = grow front-only, 1 = grow both sides (symmetric)
uniform float uGrowAudioEnabled;// 0 = normal/gesture, 1 = audio reactive auto-wave
uniform float uTunnelMode;      // Pixel Tunnel — tiles become slabs flying through a two-plane tunnel
uniform float uTunnelNear;      // tunnel wrap point just past the camera (local z)
uniform float uTunnelLen;       // tunnel loop length (local units)
uniform float uTunnelSpeed;     // interactive speed multiplier (1 = normal, >1 = warp/fast)
uniform float uPyraMode;        // Pyramorphic — the plane folds into a tall 4-sided pyramid
uniform float uPyraFold;        // 0 = flat plane, 1 = fully folded pyramid
uniform float uPyraHeight;      // apex height at full fold (local units)
uniform float uPyraBase;        // base footprint scale at full fold (0..1 of the flat plane)
uniform vec2  uPyraHalf;        // plane half-extents (width/2, height/2, local units)
uniform float uPyraSides;       // footprint: 0 = cone (circle), 3/4/6/8 = regular N-gon
uniform float uPyraRect;        // 1 = base spans the media rectangle, 0 = regular short-side footprint
uniform float uPyraTop;         // truncation — flat top plate (interior: back wall) size 0..0.92
uniform float uPyraCurve;       // profile exponent: 1 = straight faces, >1 concave trumpet, <1 convex dome
uniform float uPyraInterior;    // 0 = exterior ridge (apex toward viewer), 1 = interior hollow (recedes)

attribute float aRandomDepth;
attribute float aInstanceId;
attribute float aHole;
attribute float aGrowHeight;   // per-tile luminance-based height (0..1, baked at build)

varying vec2 vUv;
varying vec3 vNormal;
varying float vHighlightStrength;
varying float vGlitchStrength;
varying float vTunnelFade;
varying float vPyraShade;
varying float vPyraR;

const float PI = 3.141592653589793;
const float SUPPRESSION_RANGE = 0.05;
const float NORMAL_DAMPING = 6.0;
const float SLOW_DAMPING = 2.0;
const float PIXELATION_TIME = 0.9;

float random(vec2 st) {
  return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

float elasticOut(float t, float p, float damp_exp) {
  float tClamped = clamp(t, 0.0, 1.0);
  if (tClamped <= 0.0001) return 0.0;
  if (tClamped >= 0.9999) return 1.0;
  return pow(2.0, -damp_exp * tClamped) * sin((tClamped - p / 4.0) * (2.0 * PI) / p) + 1.0;
}

void main() {
  float instanceId = aInstanceId;
  vPyraShade = 1.0;
  vPyraR = 0.0;

  float col = mod(instanceId, uGridDims.x);
  float row = floor(instanceId / uGridDims.x);
  vec2 uvStep = 1.0 / uGridDims;
  vec2 baseUv = vec2(col, row) * uvStep;
  vec2 centerUv = baseUv + (uvStep * 0.5);

  float gridAspect = uGridDims.x / uGridDims.y;
  vec2 aspectVec = vec2(gridAspect, 1.0);
  float distFromCenter = distance(centerUv * aspectVec, uRippleCenter * aspectVec);

  float rndPhase = random(vec2(instanceId, 123.456));
  float rndBounce = random(vec2(instanceId, 987.654));

  // A. Organic Mode (Noise, Elastic)
  float noisyDist = max(0.0, distFromCenter + (rndPhase - 0.5) * 0.3);
  float progressOrganic = clamp((uVoxelateProgress - noisyDist) / uEffectSpread, 0.0, 1.0);

  float suppression = 1.0 - smoothstep(0.0, SUPPRESSION_RANGE, noisyDist);
  float currentDamp = mix(NORMAL_DAMPING, SLOW_DAMPING, suppression);

  float valOrganic = elasticOut(progressOrganic, 0.2 + rndPhase * 0.2, currentDamp);
  float bounceDiff = max(0.0, valOrganic - 1.0);
  valOrganic += bounceDiff * (uEffectDepth + rndBounce * 1.1);

  float highlightOrganic = step(0.01, bounceDiff) * smoothstep(0.0, 0.35, 1.0 - progressOrganic) * (0.5 + rndPhase * 0.5);

  // B. Smooth Mode (No-Noise, Sine)
  float progressSmooth = smoothstep(distFromCenter, distFromCenter + uEffectSpread, uVoxelateProgress);
  float valSmoothBounce = sin(progressSmooth * PI) * step(progressSmooth, 0.99);
  float valSmooth = progressSmooth + (valSmoothBounce * uEffectDepth);
  float highlightSmooth = valSmoothBounce;

  float finalScaleVal = mix(valSmooth, valOrganic, uOrganicMode);
  vHighlightStrength = mix(highlightSmooth, highlightOrganic, uOrganicMode);

  // UV (pixelate + glitch)
  vec3 nMask = step(0.5, abs(normal));
  vec2 faceCoords = (position.zy * nMask.x) + (position.xz * nMask.y) + (position.xy * nMask.z);
  vec2 localRatio = clamp((faceCoords / uCubeSize.x) + 0.5, 0.0, 1.0);
  vec2 smoothUv = baseUv + (localRatio * uvStep);

  float effectiveProgress = mix(progressSmooth, progressOrganic, uOrganicMode);
  float pixelPhase = smoothstep(0.0, PIXELATION_TIME, effectiveProgress);
  float glitchIntensity = pow(sin(pixelPhase * PI), 0.5);

  vec2 noiseOffset = vec2(random(vec2(instanceId + pixelPhase * 100.0, 0.0)), random(vec2(instanceId + pixelPhase * 100.0, 1.0))) - 0.5;
  vec2 pixelateUv = mix(smoothUv, centerUv, pixelPhase) + (noiseOffset * glitchIntensity * 0.3);

  vUv = mix(smoothUv, pixelateUv, uUsePixelate);
  vGlitchStrength = glitchIntensity * uUseRGBShift;

  // Depth
  float baseDepth = 0.05;
  float targetDepth = mix(1.0, aRandomDepth, uUseRandomDepth);
  float currentDepth = baseDepth + (targetDepth - baseDepth) * finalScaleVal;

  // Infinite Hole: cubes inside the hole become full voxels (the physics drops
  // them through the centre); the surrounding media stays flat tiles.
  currentDepth = mix(currentDepth, mix(baseDepth, 1.0, aHole), uHoleMode);

  // Magnet: cubes near the gesture point swell to full voxels and reach toward it,
  // with a smooth distance falloff so the surrounding media stays flat.
  vec3 cubeCenter = instanceMatrix[3].xyz;
  float magInfluence = 0.0;
  if (uMagnetMode > 0.5) {
    float dXY = length(cubeCenter.xy - uMagnetPos.xy);
    magInfluence = 1.0 - smoothstep(uMagnetRadius * 0.1, uMagnetRadius, dXY);
    magInfluence *= uMagnetGain;            // gesture activity (0 = pixels stay in place)
    currentDepth = mix(currentDepth, 1.0, magInfluence);
  }

  // Grow: city-building extrusion — each tile grows perpendicular to the plane
  // by its luminance-based height. Contrast sharpens the difference between
  // bright (tall) and dark (short) pixels.
  if (uGrowMode > 0.5) {
    float h = aGrowHeight;                                       // 0..1 luminance
    h = pow(h, mix(3.0, 1.0, uGrowContrast));                   // contrast curve (reversed)
    float growH;
    if (uGrowAudioEnabled > 0.5) {
      // Audio Reactive: grow happens automatically and globally based on audio, with a spatial wave pattern.
      // We use sin/cos waves driven by uTime and the cube position, scaled by the audio pulse.
      float wave = sin(cubeCenter.x * 0.04 + uTime * 3.5) + cos(cubeCenter.y * 0.04 + uTime * 3.5);
      float waveNorm = wave * 0.4 + 0.6; // normalized wave (roughly [0.2, 1.4])
      growH = max(baseDepth, h * uGrowAmount * (uGrowAudioPulse * 1.8 * waveNorm));
    } else {
      // Normal / Gesture mode: grows locally near the tracked uGrowCenter.
      float dXY = length(cubeCenter.xy - uGrowCenter.xy);
      float growInfluence = 1.0 - smoothstep(uGrowRange * 0.1, uGrowRange, dXY);
      growInfluence *= uGrowGestureGain;
      growH = max(baseDepth, h * uGrowAmount);
      growH = mix(baseDepth, growH, growInfluence);
    }
    currentDepth = mix(currentDepth, growH, uGrowMode);
  }

  vec3 transformed = position;
  if (uGrowMode > 0.5 && uGrowBackside < 0.5) {
    // Only grow front side: pin the back face of the cube at -uCubeSize.x * 0.5
    transformed.z = (position.z + uCubeSize.x * 0.5) * currentDepth - uCubeSize.x * 0.5;
  } else {
    transformed.z *= currentDepth;
  }

  // Pixel Tunnel: tiles morph into long slabs (scaled by the voxelize amount, so
  // they morph in during the bloom and back out during the reverse flatten), and
  // a depth fog fades the far end + the wrap point so the recycling loop reads as
  // an infinite fly-through. Rare per-tile glow pulses echo the reference demo.
  float tunnelAmt = uTunnelMode * finalScaleVal;
  vTunnelFade = 1.0;
  if (tunnelAmt > 0.001) {
    transformed *= mix(vec3(1.0), vec3(1.6, 0.45, 3.0 + (uTunnelSpeed - 1.0) * 1.5), tunnelAmt);
    float fadeFar = clamp((cubeCenter.z - (uTunnelNear - uTunnelLen)) / max(uTunnelLen, 0.001), 0.0, 1.0);
    float fadeNear = 1.0 - smoothstep(uTunnelNear - 0.6, uTunnelNear, cubeCenter.z);
    vTunnelFade = mix(1.0, fadeFar * fadeFar * fadeNear, tunnelAmt);
    float sparkWin = floor(uTime * 7.0);
    float spark = step(0.997, random(vec2(instanceId, sparkWin)));
    vHighlightStrength = max(vHighlightStrength, spark * (1.0 - fract(uTime * 7.0)) * tunnelAmt);
  }

  vec3 rotNormal = normal;

  // Pyramorphic: fold the flat media into an anamorphic solid — the classic
  // folding-print illusion. The footprint shape picks the radial coordinate
  // (N-gon sectors fold into planar faces with creases between them; the cone
  // is the smooth limit), the image centre rises to the apex while the border
  // shrinks into the base. The map is closed-form and continuous (identity at
  // uPyraFold = 0), applied per-vertex so adjacent tiles keep sharing edges —
  // the folded surface stays seamless, and the radial stretch / lateral
  // squeeze of the source image (the elongated "streaks" of the physical
  // print) falls out for free. Extensions per the blueprint / guide:
  //  • uPyraTop truncates the apex into a flat plate (conic unrolling with an
  //    inner radius — the flat-top cone / truncated pyramid).
  //  • uPyraCurve bows the profile (concave trumpet / convex dome sections).
  //  • uPyraInterior inverts the projection into the hollow frustum-room view:
  //    the frame border stays pinned to the plane, the walls funnel away from
  //    the viewer toward a receding back plate (uPyraTop = back wall size).
  if (uPyraMode > 0.5) {
    float tF = clamp(uPyraFold, 0.0, 1.0);
    vec2 flatXY = cubeCenter.xy + transformed.xy;
    // Rect keeps the media rectangle as the base (classic print). The regular
    // shapes (square / cone / N-gon) use the short dimension as the footprint;
    // the print outside it stays flat at the base, like the physical brim.
    float sqHalf = min(uPyraHalf.x, uPyraHalf.y);
    vec2 normHalf = mix(vec2(sqHalf), uPyraHalf, uPyraRect);
    vec2 pn = flatXY / normHalf;
    // Footprint radial coordinate + its planar gradient direction. Sectors are
    // anchored so a face (not a vertex) sits at the bottom — for 4 sides this
    // is exactly the classic diagonal-crease square fold.
    float rSh;
    vec2 gdir;
    if (uPyraSides < 2.5) {
      float rho = length(pn);
      rSh = rho;
      gdir = (rho > 1e-4) ? pn / rho : vec2(0.0, 1.0);
    } else {
      float b = PI / uPyraSides;
      float a = atan(pn.y, pn.x) + PI * 0.5;
      float thF = floor((a + b) / (2.0 * b)) * (2.0 * b) - PI * 0.5;
      gdir = vec2(cos(thF), sin(thF));
      rSh = dot(pn, gdir);
    }
    // Raw (unclamped) radial — the fragment shader clips r > 1 for the Circle
    // print (the disc cut from the media, per the guide's boundary clipping).
    vPyraR = rSh;
    rSh = clamp(rSh, 0.0, 1.0);
    // Truncated top: a flat plate replaces the apex (interior: the back wall).
    float kT = clamp(uPyraTop, 0.0, 0.92);
    float lift = 1.0 - max(rSh - kT, 0.0) / max(1.0 - kT, 1e-3);  // 1 top … 0 base
    // Curved profile: 1 = straight faces, >1 concave trumpet, <1 convex dome.
    float liftC = pow(clamp(lift, 0.0, 1.0), uPyraCurve);
    float S = mix(1.0, -1.0, uPyraInterior);       // interior recedes away from the viewer
    float Hp = uPyraHeight * tF;
    float Bf = mix(1.0, max(uPyraBase, 0.02), tF);
    // Exterior: the whole footprint shrinks toward the base. Interior: the
    // border stays pinned to the frame and the walls funnel toward the back.
    float xyScale = mix(Bf, mix(1.0, Bf, liftC), uPyraInterior);
    vec2 foldedXY = flatXY * xyScale;
    float foldedZ = S * Hp * liftC;
    // Analytic surface normal — flat plate on the top / back wall / brim,
    // curved-profile slope on the walls (creases between N-gon faces).
    vec3 fn;
    if (rSh - kT < 1e-4 || lift <= 0.001) {
      fn = vec3(0.0, 0.0, 1.0);
    } else {
      float slopeK = uPyraCurve * pow(clamp(lift, 0.05, 1.0), uPyraCurve - 1.0);
      vec2 nGrad = (S * Hp * slopeK / max(1.0 - kT, 1e-3)) * (gdir / normHalf) / max(xyScale, 0.02);
      fn = normalize(vec3(nGrad, 1.0));
    }
    // Fold: keep the slab's own thickness hugging the surface along its normal.
    transformed.xy = foldedXY - cubeCenter.xy + fn.xy * transformed.z;
    transformed.z = foldedZ + fn.z * transformed.z;
    rotNormal = normalize(mix(rotNormal, fn, tF));
    // Per-face key light (upper-left, in front) so the faces read as a lit
    // solid — one face catches the light, its neighbours fall into shade.
    vec3 keyL = normalize(vec3(-0.35, 0.45, 0.82));
    float lambert = max(dot(fn, keyL), 0.0);
    vPyraShade = mix(1.0, 0.6 + 0.55 * lambert, tF);
  }

  // Flip: rotate each tile about its own centre (X or Y axis). Auto = an elastic
  // ping-pong wave with per-tile random axis / phase / direction (the classic
  // pixel-flip); Custom Gesture = tiles within uFlipRange of the hand flip by uFlipGain.
  if (uFlipMode > 0.5) {
    float axisPick = (uFlipAxis < 0.5)
        ? step(0.5, random(vec2(instanceId, 55.5)))
        : (uFlipAxis < 1.5 ? 0.0 : 1.0);
    float flipDir = (random(vec2(instanceId, 44.4)) < 0.5) ? -1.0 : 1.0;
    float angle;
    if (uFlipGesture > 1.5) {
      // Audio Reactive: every tile flips by the audio-driven gain, lightly staggered
      // per-tile so beats read as a wave rather than one flat snap.
      float stagger = random(vec2(instanceId, 22.2));
      float g = clamp(uFlipGain - stagger * 0.2, 0.0, 1.0);
      angle = elasticOut(g, 0.3, 5.0) * PI * flipDir;
    } else if (uFlipGesture > 0.5) {
      float dXYf = length(cubeCenter.xy - uFlipCenter.xy);
      float inflF = 1.0 - smoothstep(uFlipRange * 0.1, uFlipRange, dXYf);
      angle = inflF * uFlipGain * PI * uFlipDir;
    } else {
      float rndDelay = random(vec2(instanceId, 22.2));
      float rndDur = random(vec2(instanceId, 33.3));
      float ph = uTime * uFlipSpeed * (0.5 + rndDur) + rndDelay * 6.2831853;
      float tri = abs(fract(ph * 0.5) * 2.0 - 1.0);         // 0 → 1 → 0 ping-pong
      angle = elasticOut(tri, 0.3, 5.0) * PI * flipDir;
    }
    float sF = sin(angle), cF = cos(angle);
    if (axisPick < 0.5) {                       // rotate about X (y,z)
      transformed.yz = mat2(cF, sF, -sF, cF) * transformed.yz;
      rotNormal.yz   = mat2(cF, sF, -sF, cF) * rotNormal.yz;
    } else {                                    // rotate about Y (x,z)
      transformed.xz = mat2(cF, -sF, sF, cF) * transformed.xz;
      rotNormal.xz   = mat2(cF, -sF, sF, cF) * rotNormal.xz;
    }
  }

  vNormal = normalize((instanceMatrix * vec4(rotNormal, 0.0)).xyz);
  vec4 mvLocal = instanceMatrix * vec4(transformed, 1.0);
  mvLocal.xyz += (uMagnetPos - cubeCenter) * (magInfluence * uMagnetStrength * uMagnetDir);
  gl_Position = projectionMatrix * modelViewMatrix * mvLocal;
}
`;

const VOXEL_FRAG = `
precision mediump float;

uniform sampler2D uMap;
uniform vec3 uHighlightColor;
uniform float uHighlightIntensity;
uniform float uPyraClip;   // 1 = Circle print — discard fragments outside the disc

varying vec2 vUv;
varying vec3 vNormal;
varying float vHighlightStrength;
varying float vGlitchStrength;
varying float vTunnelFade;
varying float vPyraShade;
varying float vPyraR;

const vec3 LIGHT_DIR = vec3(0.8, 0.85, 1.0);
const float AMBIENT_INTENSITY = 0.95;
const float DIFFUSE_INTENSITY = 0.1;
const float SHIFT_OFFSET = 0.075;

void main() {
  // Circle print: the media is cut to the disc — everything outside is gone
  // (interpolated per-fragment, so the cut edge stays smooth across tiles).
  if (uPyraClip > 0.5 && vPyraR > 1.001) discard;

  float shift = vGlitchStrength * SHIFT_OFFSET;
  float r = texture2D(uMap, vUv + vec2(shift, 0.0)).r;
  float g = texture2D(uMap, vUv).g;
  float b = texture2D(uMap, vUv - vec2(shift, 0.0)).b;
  vec4 texColor = vec4(r, g, b, 1.0);

  vec3 normLightDir = normalize(LIGHT_DIR);
  float diff = max(dot(vNormal, normLightDir), 0.0);
  vec3 lighting = vec3(AMBIENT_INTENSITY) + vec3(DIFFUSE_INTENSITY) * diff;
  vec3 finalColor = texColor.rgb * lighting;
  finalColor *= mix(0.18, 1.0, vTunnelFade);   // tunnel depth fog (1.0 outside tunnel mode)
  finalColor *= vPyraShade;                    // Pyramorphic per-face shading (1.0 otherwise)

  float effectIntensity = vHighlightStrength * uHighlightIntensity;
  finalColor = mix(finalColor, uHighlightColor, effectIntensity);

  gl_FragColor = vec4(finalColor, texColor.a * smoothstep(0.0, 0.28, vTunnelFade));
}
`;

export class VoxelDrop {
    constructor({ THREE, RAPIER }) {
        this.THREE = THREE;
        this.RAPIER = RAPIER;

        this.group = null;
        this.mesh = null;
        this.material = null;
        this.world = null;
        this.groundBody = null;
        this.rigidBodies = [];
        this.initPos = [];        // {x,y} rest positions (local space)

        this.dropFlags = null;    // Uint8Array — 1 once a cube has been woken
        this.cachedUVs = null;    // Float32Array(count*2) — per-cube centre UV
        this.noiseOffsets = null; // Float32Array(count) — organic-mode wave noise

        this.grid = null;
        this.params = null;
        this._state = 'default';  // default | animating | collapsed | reversing
        this._targetVal = 0;
        this._ripple = { u: 0.5, v: 0.5 };
        this._lastT = 0;
        this._pending = [];       // [{ i, at }] deferred gravity-scale restores (dropDelay)
        this._reverse = null;     // per-body lerp data while reversing
        this._reverseT = 0;
        this._reversePhase = '';  // 'positions' | 'flatten'
        this._gravityY = -8;
        this._anyAwake = false;
        this.bodyDamping = 0.8;
        this.bodyRestitution = 1.24;

        this._holeMode = false;   // Infinite Hole — center cubes drop through a hole on loop
        this._holeRadius = 0.35;  // fraction of the plane's half-min-dimension
        this._holeMask = null;    // Uint8Array — which cubes belong to the hole
        this._holeNextDrop = null;// Float32Array — ms timestamp each hole cube re-drops
        this._aHole = null;       // Float32Array attribute mirror (full-voxel flag)
        this._aHoleAttr = null;   // the InstancedBufferAttribute
        this._holeInterval = 0.6; // base seconds a cube rests before re-dropping (staggered)

        this._magnetMode = false; // Magnet — cubes reach toward the gesture point
        this._magnetStrength = 0.6; // 0..1+ how far cubes pull toward the magnet
        this._magnetRadius = 0.7;   // local-unit influence radius
        this._magnetInvert = false; // Invert — reverse pull (toward) into push (away)

        this._flipMode = false;     // Flip — each tile rotates ±180° about its centre
        this._flipSpeed = 0.5;      // Auto wave speed
        this._flipRange = 0.7;      // local-unit gesture influence radius
        this._flipAxis = 0;         // 0 random per-tile, 1 horizontal (X), 2 vertical (Y)
        this._flipTime = 0;         // accumulated seconds driving the Auto wave

        this._growMode = false;     // Grow — city-building extrusion driven by luminance
        this._growAmount = 30.0;     // max extrusion height (30 = 3000% voxel height)
        this._growContrast = 0.5;   // contrast curve (0 = gentle hills, 1 = skyscrapers)
        this._growRange = 0.7;
        this._growBackside = false; // default: grow front side only
        this._growTime = 0;         // accumulated seconds driving the Auto wave
        this._aGrowHeight = null;   // Float32Array — per-cube luminance height
        this._aGrowHeightAttr = null; // the InstancedBufferAttribute

        this._orbitMode = false;    // Orbit drop style — tiles scatter into a cosmic galaxy disc
        this._orbit = null;         // { angle, radius, angSpeed, z, spinAxis, spinSpeed } typed arrays
        this._orbitT = 0;           // accumulated seconds driving the orbital swirl

        this._tunnelMode = false;   // Pixel Tunnel drop style — slabs fly through a two-plane tunnel
        this._tunnel = null;        // { x, y, z0, stagger } typed arrays + { len, zNear, speed }
        this._tunnelT = 0;          // accumulated seconds since the tunnel formed
        this._tunnelPhase = 0;      // accumulated flight distance along z
        this._tunnelSpeedMultiplier = 1.0;

        this._burstMode = false;    // Bursts drop style — cubes shatter apart radially, tumble, and drift to rest
        this._burst = null;         // { dir, delay, speed, spinAxis, spinSpeed } typed arrays
        this._burstT = 0;           // accumulated seconds since the burst launched

        this._pyraMode = false;     // Pyramorphic — the plane folds into a tall 4-sided pyramid
        this._pyraFold = 0;         // eased current fold (0 flat … 1 pyramid)
        this._pyraFoldTarget = 1;   // Fold slider target
        this._pyraHeight = 1.8;     // apex height at full fold (local units)
        this._pyraBase = 0.45;      // base footprint scale at full fold
        this._pyraAuto = false;     // Auto Fold — endless fold/unfold loop
        this._pyraSpeed = 0.5;      // Auto Fold speed (0.1 … 2)
        this._pyraDrive = null;     // gesture/audio fold override (0..1) or null
        this._pyraTime = 0;         // accumulated seconds driving the Auto Fold wave
        this._pyraSides = 4;        // footprint: 0 = cone (circle), 3/4/6/8 = regular N-gon
        this._pyraRect = true;      // true = base spans the media rectangle (classic print)
        this._pyraClip = false;     // true = Circle print — media cut to the disc (no brim)
        this._pyraTop = 0;          // truncation — flat top plate / back wall size (0..0.92)
        this._pyraCurve = 1;        // profile exponent (1 straight, >1 trumpet, <1 dome)
        this._pyraInterior = false; // false = Exterior ridge, true = Interior hollow (frustum room)
    }

    get state() { return this._state; }

    /** Whether a continuous render loop is still needed (animation in progress or
     *  any body still moving). The collapsed pile, once asleep, needs no frames.
     *  Infinite Hole animates forever, so it always needs frames while active. */
    needsFrames() {
        return this._holeMode || this._magnetMode || this._flipMode || this._growMode || this._pyraMode || this._orbitMode || this._tunnelMode || this._burstMode || this._state === 'animating' || this._state === 'reversing' || this._anyAwake;
    }

    /**
     * Build the voxel grid + Rapier world for a 2D media texture.
     * @param {THREE.Texture} texture  video (VideoTexture) or image texture for uMap
     * @param {number} aspect          source aspect (w/h) → grid columns/rows
     * @param {object} opts            { cols, spacing, organic, pixelate, rgbShift, dance, danceLevel, dropDelay }
     * @returns {THREE.Group} group containing the InstancedMesh (add to the model group)
     */
    build(texture, aspect, opts = {}) {
        const { THREE, RAPIER } = this;
        this.dispose();

        const cols = Math.max(4, Math.min(120, Math.round(opts.cols ?? 40)));
        const a = (aspect > 0 && isFinite(aspect)) ? aspect : 1;
        const rows = Math.max(1, Math.round(cols / a));

        // Normalize so the long side ≈ 2 local units (matches the flat photo plane).
        let cellSize;
        if (a >= 1) cellSize = 2.0 / cols;
        else        cellSize = 2.0 / rows;
        const spacing = cellSize * (opts.spacing ?? 1);
        const width = cols * spacing;
        const height = rows * spacing;
        const count = cols * rows;
        this.grid = { cols, rows, count, cellSize, spacing, width, height };

        this.params = {
            baseDuration: 2.2,
            effectSpread: 0.35,
            effectDepth: 1.5,
            organicMode: opts.organic !== false,
            usePixelate: opts.pixelate !== false,
            useRGBShift: opts.rgbShift !== false,
            dropDelay: Math.max(0, opts.dropDelay ?? 0),
            isDancing: opts.dance !== false,
            dancingLevel: opts.danceLevel ?? 4,
        };
        this.bodyDamping = this.params.isDancing ? 0.8 : 2.0;
        this.bodyRestitution = this.params.isDancing ? 1.0 + 0.6 * (this.params.dancingLevel / 10) : 0.01;
        this._gravityY = -(height * 5.0);

        // ── Physics world ──────────────────────────────────────────────────────
        this.world = new RAPIER.World({ x: 0, y: 0, z: 0 });
        // Ground well below the plane → cubes rain down and settle near the lower
        // frame edge (no side walls, so they scatter via their initial velocities).
        const groundDesc = RAPIER.RigidBodyDesc.fixed();
        this.groundBody = this.world.createRigidBody(groundDesc);
        this.world.createCollider(
            RAPIER.ColliderDesc.cuboid(60, 5, 60).setTranslation(0, -2.5 - 5, 0)
                .setFriction(0.2).setRestitution(0.6),
            this.groundBody
        );

        // ── Grid bodies ────────────────────────────────────────────────────────
        const startX = -width * 0.5 + spacing * 0.5;
        const startY = -height * 0.5 + spacing * 0.5;  // centred at origin
        const halfSize = cellSize / 2;

        this.dropFlags = new Uint8Array(count);
        this.cachedUVs = new Float32Array(count * 2);
        this.noiseOffsets = new Float32Array(count);
        this.rigidBodies = new Array(count);
        this.initPos = new Array(count);
        this._holeMask = new Uint8Array(count);      // 1 = cube belongs to the hole
        this._holeNextDrop = new Float32Array(count); // ms timestamp for next drop (loop)
        this._aHole = new Float32Array(count);        // shader: 1 = full voxel, 0 = flat
        this._aGrowHeight = new Float32Array(count);  // per-cube luminance height (0..1)
        const randomDepths = new Float32Array(count);
        const instanceIds = new Float32Array(count);

        for (let i = 0; i < count; i++) {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const x = startX + col * spacing;
            const y = startY + row * spacing;

            this.cachedUVs[i * 2] = (col + 0.5) / cols;
            this.cachedUVs[i * 2 + 1] = (row + 0.5) / rows;
            this.noiseOffsets[i] = computeNoiseOffset(i);
            randomDepths[i] = 1.0;     // shape='cube' (uUseRandomDepth=0)
            instanceIds[i] = i;
            this._aGrowHeight[i] = 0.5; // default mid-height (overwritten by _sampleHeights)

            const rb = this.world.createRigidBody(
                RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, 0)
                    .setLinearDamping(this.bodyDamping).setAngularDamping(this.bodyDamping)
            );
            this.world.createCollider(
                RAPIER.ColliderDesc.cuboid(halfSize, halfSize, halfSize)
                    .setFriction(0).setRestitution(this.bodyRestitution),
                rb
            );
            this.rigidBodies[i] = rb;
            this.initPos[i] = { x, y };
        }

        // Sample source texture luminance → per-cube heights (city skyline relief).
        this._sampleHeights(texture);

        // ── InstancedMesh ──────────────────────────────────────────────────────
        this.dummy = new THREE.Object3D();
        const geo = new THREE.BoxGeometry(cellSize, cellSize, cellSize);
        geo.setAttribute('aRandomDepth', new THREE.InstancedBufferAttribute(randomDepths, 1));
        geo.setAttribute('aInstanceId', new THREE.InstancedBufferAttribute(instanceIds, 1));
        this._aHoleAttr = new THREE.InstancedBufferAttribute(this._aHole, 1);
        geo.setAttribute('aHole', this._aHoleAttr);
        this._aGrowHeightAttr = new THREE.InstancedBufferAttribute(this._aGrowHeight, 1);
        geo.setAttribute('aGrowHeight', this._aGrowHeightAttr);

        this.material = new THREE.ShaderMaterial({
            uniforms: {
                uMap: { value: texture },
                uGridDims: { value: new THREE.Vector2(cols, rows) },
                uCubeSize: { value: new THREE.Vector2(cellSize, cellSize) },
                uVoxelateProgress: { value: 0.0 },
                uRippleCenter: { value: new THREE.Vector2(0.5, 0.5) },
                uEffectSpread: { value: this.params.effectSpread },
                uEffectDepth: { value: this.params.effectDepth },
                uHighlightIntensity: { value: 0.0 },
                uHighlightColor: { value: new THREE.Color('#f2f2f2') },
                uUseRandomDepth: { value: 0.0 },
                uOrganicMode: { value: this.params.organicMode ? 1.0 : 0.0 },
                uUsePixelate: { value: this.params.usePixelate ? 1.0 : 0.0 },
                uUseRGBShift: { value: this.params.useRGBShift ? 1.0 : 0.0 },
                uHoleMode: { value: this._holeMode ? 1.0 : 0.0 },
                uMagnetMode: { value: this._magnetMode ? 1.0 : 0.0 },
                uMagnetPos: { value: new THREE.Vector3(0, 0, 0.5) },
                uMagnetStrength: { value: this._magnetStrength },
                uMagnetRadius: { value: this._magnetRadius },
                uMagnetDir: { value: this._magnetInvert ? -1.0 : 1.0 },
                uMagnetGain: { value: 1.0 },
                uFlipMode: { value: this._flipMode ? 1.0 : 0.0 },
                uFlipSpeed: { value: this._flipSpeed },
                uFlipRange: { value: this._flipRange },
                uFlipCenter: { value: new THREE.Vector3(0, 0, 0.5) },
                uFlipAxis: { value: this._flipAxis },
                uFlipDir: { value: 1.0 },
                uFlipGain: { value: 1.0 },
                uFlipGesture: { value: 0.0 },
                uTime: { value: 0.0 },
                uGrowMode: { value: this._growMode ? 1.0 : 0.0 },
                uGrowAmount: { value: this._growAmount },
                uGrowContrast: { value: this._growContrast },
                uGrowAudioPulse: { value: 0.0 },
                uGrowCenter: { value: new THREE.Vector3(0, 0, 0.5) },
                uGrowRange: { value: this._growRange },
                uGrowGestureGain: { value: 1.0 },
                uGrowBackside: { value: this._growBackside ? 1.0 : 0.0 },
                uGrowAudioEnabled: { value: 0.0 },
                uTunnelMode: { value: 0.0 },
                uTunnelNear: { value: 1.0 },
                uTunnelLen: { value: 8.0 },
                uTunnelSpeed: { value: 1.0 },
                uPyraMode: { value: this._pyraMode ? 1.0 : 0.0 },
                uPyraFold: { value: 0.0 },
                uPyraHeight: { value: this._pyraHeight },
                uPyraBase: { value: this._pyraBase },
                uPyraHalf: { value: new THREE.Vector2(width * 0.5, height * 0.5) },
                uPyraSides: { value: this._pyraSides },
                uPyraRect: { value: this._pyraRect ? 1.0 : 0.0 },
                uPyraClip: { value: this._pyraClip ? 1.0 : 0.0 },
                uPyraTop: { value: this._pyraTop },
                uPyraCurve: { value: this._pyraCurve },
                uPyraInterior: { value: this._pyraInterior ? 1.0 : 0.0 },
            },
            vertexShader: VOXEL_VERT,
            fragmentShader: VOXEL_FRAG,
            side: THREE.DoubleSide,
        });

        this.mesh = new THREE.InstancedMesh(geo, this.material, count);
        this.mesh.frustumCulled = false;
        this._syncMesh(true);  // seed flat positions

        this.group = new THREE.Group();
        this.group.add(this.mesh);

        this.world.gravity = { x: 0, y: this._gravityY, z: 0 };
        this._state = 'default';
        this._lastT = performance.now();
        this._physAccum = 0;
        return this.group;
    }

    // ── Triggers ────────────────────────────────────────────────────────────

    startDrop() {
        if (!this.mesh || this._holeMode || this._state !== 'default') return;
        const u = Math.random();
        const v = Math.random();
        this._ripple = { u, v };
        this.material.uniforms.uRippleCenter.value.set(u, v);
        this.material.uniforms.uVoxelateProgress.value = 0;

        const aspect = this.grid.cols / this.grid.rows;
        const cx = u * aspect, cy = v;
        const corners = [[0, 0], [aspect, 0], [0, 1], [aspect, 1]];
        let maxDist = 0;
        for (const [x, y] of corners) maxDist = Math.max(maxDist, Math.hypot(x - cx, y - cy));
        this._targetVal = maxDist + this.params.effectSpread + 0.1;

        this.dropFlags.fill(0);
        this._pending.length = 0;
        this._state = 'animating';
        this._lastT = performance.now();
    }

    /**
     * Orbit drop style — instead of raining the cubes down under gravity, scatter them
     * into a slowly-swirling cosmic galaxy disc centred on the plane. The tiles voxelize
     * outward from the centre, then each cube orbits the origin at a (mildly differential)
     * angular rate, breathing outward and tumbling for a "pixels become a galaxy" look.
     * Motion is driven deterministically in _tickOrbit() (no gravity / no collisions), so
     * it loops forever until "Back to Plane". Mirrors startDrop()'s entry guard.
     */
    startOrbit() {
        if (!this.mesh || this._holeMode || this._state !== 'default') return;
        const { RAPIER } = this;

        // Voxelize radially from the centre so the galaxy blooms out of the photo.
        this._ripple = { u: 0.5, v: 0.5 };
        this.material.uniforms.uRippleCenter.value.set(0.5, 0.5);
        this.material.uniforms.uVoxelateProgress.value = 0;
        const aspect = this.grid.cols / this.grid.rows;
        this._targetVal = Math.hypot(aspect * 0.5, 0.5) + this.params.effectSpread + 0.1;

        const count = this.grid.count;
        const angle    = new Float32Array(count);
        const radius   = new Float32Array(count);
        const angSpeed = new Float32Array(count);
        const z        = new Float32Array(count);
        const spinAxis = new Float32Array(count * 3);
        const spinSpeed = new Float32Array(count);
        for (let i = 0; i < count; i++) {
            const p = this.initPos[i];
            const r = Math.hypot(p.x, p.y) || 1e-3;
            radius[i]   = r;
            angle[i]    = Math.atan2(p.y, p.x);
            // Mild differential rotation (inner a touch faster) → gentle spiral wind-up,
            // capped so the core doesn't blur. Per-tile jitter breaks up rigid banding.
            angSpeed[i] = Math.min(2.2, 0.5 + 0.35 / Math.max(r, 0.25)) * (0.8 + Math.random() * 0.4);
            z[i]        = (Math.random() - 0.5) * this.grid.cellSize * 6;  // disc thickness it eases into
            // random tumble axis (normalized) + speed for per-cube sparkle
            let ax = Math.random() - 0.5, ay = Math.random() - 0.5, az = Math.random() - 0.5;
            const al = Math.hypot(ax, ay, az) || 1; ax /= al; ay /= al; az /= al;
            spinAxis[i * 3] = ax; spinAxis[i * 3 + 1] = ay; spinAxis[i * 3 + 2] = az;
            spinSpeed[i] = (0.6 + Math.random() * 1.4) * (Math.random() < 0.5 ? -1 : 1);
        }
        this._orbit = { angle, radius, angSpeed, z, spinAxis, spinSpeed };

        // Bodies are driven by hand (Fixed + per-frame setTranslation); kill gravity so a
        // stray awake body can't fall. _syncMesh(true) reads their translations each frame.
        this.world.gravity = { x: 0, y: 0, z: 0 };
        for (let i = 0; i < count; i++) {
            const rb = this.rigidBodies[i];
            rb.setBodyType(RAPIER.RigidBodyType.Fixed);
            rb.sleep();
        }
        this.dropFlags.fill(0);
        this._pending.length = 0;
        this._orbitT = 0;
        this._orbitMode = true;
        this._state = 'animating';
        this._lastT = performance.now();
    }

    /**
     * Pixel Tunnel drop style — the media plane splits at its horizontal centreline:
     * the top half becomes the tunnel CEILING, the bottom half the FLOOR. Columns
     * keep their lateral order (widened for gaps), rows become depth ranks, so the
     * tunnel is literally the video sliced into strips. Every slab then streams
     * toward the camera along +z and wraps to the far end (hidden by the shader's
     * depth fog) for an infinite fly-through — a port of the classic two-plane
     * "pixel tunnel" three.js demo. The slab shape, fog and glow pulses all live in
     * the vertex/fragment shaders gated by uTunnelMode; motion is deterministic in
     * _tickTunnel() (Fixed bodies teleported per frame, like Orbit — no physics).
     */
    startTunnel() {
        if (!this.mesh || this._holeMode || this._state !== 'default') return;
        const { RAPIER } = this;
        const { cols, rows, count, width, height } = this.grid;

        // Voxelize radially from the centre so the tunnel blooms out of the media.
        this._ripple = { u: 0.5, v: 0.5 };
        this.material.uniforms.uRippleCenter.value.set(0.5, 0.5);
        this.material.uniforms.uVoxelateProgress.value = 0;
        const aspect = cols / rows;
        this._targetVal = Math.hypot(aspect * 0.5, 0.5) + this.params.effectSpread + 0.1;

        // Slot layout. Centre rows travel nearest the camera first, edge rows go deep,
        // so the image folds away from the viewer as the tunnel forms.
        const halfRows = Math.max(1, Math.floor(rows / 2));
        const ranksBottom = halfRows;
        const ranksTop = Math.max(1, rows - halfRows);
        const len = Math.max(4, width * 4);      // loop length (local units)
        const zNear = len * 0.35;                // wrap point, just past the camera
        const gapY = height * 0.55;              // ceiling / floor offset
        const spreadX = 1.8;                     // lateral widen → gaps between slab columns

        const tx = new Float32Array(count);
        const ty = new Float32Array(count);
        const z0 = new Float32Array(count);
        const stagger = new Float32Array(count);
        for (let i = 0; i < count; i++) {
            const row = Math.floor(i / cols);
            const top = row >= halfRows;
            const rank = top ? row - halfRows : halfRows - 1 - row;
            const zStep = len / (top ? ranksTop : ranksBottom);
            tx[i] = this.initPos[i].x * spreadX;
            ty[i] = (top ? 1 : -1) * gapY;
            z0[i] = -rank * zStep;
            stagger[i] = rank * 0.06;            // cascade outward from the centreline
        }
        this._tunnel = { x: tx, y: ty, z0, stagger, len, zNear, speed: len / 9 };

        // Bodies are driven by hand (Fixed + per-frame setTranslation); kill gravity so
        // a stray awake body can't fall. _syncMesh(true) reads them back each frame.
        this.world.gravity = { x: 0, y: 0, z: 0 };
        for (let i = 0; i < count; i++) {
            const rb = this.rigidBodies[i];
            rb.setBodyType(RAPIER.RigidBodyType.Fixed);
            rb.sleep();
        }
        this.dropFlags.fill(0);
        this._pending.length = 0;
        this._tunnelT = 0;
        this._tunnelPhase = 0;
        this._tunnelMode = true;
        this.material.uniforms.uTunnelMode.value = 1;
        this.material.uniforms.uTunnelNear.value = zNear;
        this.material.uniforms.uTunnelLen.value = len;
        this.material.uniforms.uHighlightIntensity.value = 0.85; // enable the glow pulses
        this.material.transparent = true;  // depth fog fades slabs out, not to black
        this._state = 'animating';
        this._lastT = performance.now();
    }

    /**
     * Bursts drop style — the media shatters apart radially from its centre, like a
     * Voronoi-shard explosion, each cube tumbling on its own random axis while it
     * flies outward and decelerates into a slowly-drifting debris field. A cube-native
     * take on the "exploding object" look (ExplodeShatter.js's per-triangle shatter
     * doesn't apply to an instanced grid — here every cube IS already a natural shard,
     * so no fracturing step is needed). Motion is driven deterministically in
     * _tickBursts() (Fixed bodies teleported per frame, exactly like Orbit/Tunnel —
     * no physics), so it loops (settles) forever until "Back to Plane".
     */
    startBursts() {
        if (!this.mesh || this._holeMode || this._state !== 'default') return;
        const { RAPIER } = this;

        // Voxelize radially from the centre so the burst blooms out of the photo.
        this._ripple = { u: 0.5, v: 0.5 };
        this.material.uniforms.uRippleCenter.value.set(0.5, 0.5);
        this.material.uniforms.uVoxelateProgress.value = 0;
        const aspect = this.grid.cols / this.grid.rows;
        this._targetVal = Math.hypot(aspect * 0.5, 0.5) + this.params.effectSpread + 0.1;

        const count = this.grid.count;
        const dir       = new Float32Array(count * 3); // normalised launch direction (model space)
        const delay     = new Float32Array(count);     // per-cube launch stagger
        const speed     = new Float32Array(count);      // per-cube launch speed variance
        const spinAxis  = new Float32Array(count * 3);
        const spinSpeed = new Float32Array(count);
        const R = Math.max(this.grid.width, this.grid.height) * 0.5;
        for (let i = 0; i < count; i++) {
            const p = this.initPos[i];
            // Radiate outward from the model centre with a random z pop so the burst
            // reads as a 3D scatter (a flat starburst would look like a paper cutout).
            const zKick = (Math.random() - 0.5) * 1.4;
            const dl = Math.hypot(p.x, p.y, zKick) || 1;
            dir[i * 3] = p.x / dl; dir[i * 3 + 1] = p.y / dl; dir[i * 3 + 2] = zKick / dl;
            const r = Math.hypot(p.x, p.y) / (R || 1);
            delay[i] = Math.min(1, r) * 0.4 + Math.random() * 0.5;   // outer cells launch a touch later
            speed[i] = 0.6 + Math.random() * 0.8;
            let ax = Math.random() - 0.5, ay = Math.random() - 0.5, az = Math.random() - 0.5;
            const al = Math.hypot(ax, ay, az) || 1; ax /= al; ay /= al; az /= al;
            spinAxis[i * 3] = ax; spinAxis[i * 3 + 1] = ay; spinAxis[i * 3 + 2] = az;
            spinSpeed[i] = (0.8 + Math.random() * 1.6) * (Math.random() < 0.5 ? -1 : 1);
        }
        this._burst = { dir, delay, speed, spinAxis, spinSpeed };

        // Bodies are driven by hand (Fixed + per-frame setTranslation); kill gravity so a
        // stray awake body can't fall. _syncMesh(true) reads their translations each frame.
        this.world.gravity = { x: 0, y: 0, z: 0 };
        for (let i = 0; i < count; i++) {
            const rb = this.rigidBodies[i];
            rb.setBodyType(RAPIER.RigidBodyType.Fixed);
            rb.sleep();
        }
        this.dropFlags.fill(0);
        this._pending.length = 0;
        this._burstT = 0;
        this._burstMode = true;
        this._state = 'animating';
        this._lastT = performance.now();
    }

    startReverse() {
        if (!this.mesh || this._holeMode || this._state !== 'collapsed') return;
        const { THREE, RAPIER } = this;
        // Orbit drop style → stop the swirl; the bodies hold their last orbit translation
        // so the reverse lerp brings the galaxy smoothly home to the flat plane.
        this._orbitMode = false;
        this._orbit = null;
        // Pixel Tunnel → stop the fly-through the same way. uTunnelMode stays ON so the
        // slab shape + fog drain out with the voxelize progress during the flatten phase;
        // _tickReverse's completion block resets the uniform + transparency.
        this._tunnelMode = false;
        this._tunnel = null;
        // Bursts → stop the shatter the same way; the bodies hold their last flung
        // translation so the reverse lerp brings the debris field smoothly home.
        this._burstMode = false;
        this._burst = null;
        this.material.uniforms.uHighlightIntensity.value = 0.0;
        this.world.gravity = { x: 0, y: 0, z: 0 };

        this._reverse = this.rigidBodies.map((rb, i) => {
            const p = rb.translation();
            const r = rb.rotation();
            rb.setBodyType(RAPIER.RigidBodyType.Fixed);
            rb.sleep();
            return {
                rb,
                sp: new THREE.Vector3(p.x, p.y, p.z),
                sr: new THREE.Quaternion(r.x, r.y, r.z, r.w),
                ep: new THREE.Vector3(this.initPos[i].x, this.initPos[i].y, 0),
                delay: i / this.grid.count,
            };
        });
        this._reverseT = 0;
        this._reversePhase = 'positions';
        this._state = 'reversing';
        this._lastT = performance.now();
    }

    // ── Live param setters (no rebuild) ───────────────────────────────────────

    /** Infinite Hole — toggle the shader-driven looping wormhole. Freezes physics
     *  back to the rest grid either way (the shader overrides positions while on;
     *  the flat plane shows again once off). */
    setHoleMode(on) {
        this._holeMode = !!on;
        if (this.material) this.material.uniforms.uHoleMode.value = on ? 1 : 0;
        this._freezeToPlane();              // park everything flat first
        if (this._holeMask) this._holeMask.fill(0);   // clear stale tags so a fresh enable re-schedules all
        if (on) {
            if (this.world) this.world.gravity = { x: 0, y: this._gravityY, z: 0 };
            this._applyHoleMask();
        } else if (this._aHoleAttr) {
            this._aHole.fill(0);
            this._aHoleAttr.needsUpdate = true;
        }
    }

    /** Hole size — fraction (0..1) of the plane's half-min-dimension. Live. */
    setHoleRadius(frac) {
        this._holeRadius = Math.max(0.02, Math.min(1, frac));
        if (this._holeMode) this._applyHoleMask();
    }

    /** Magnet — cubes near the gesture point swell to full voxels and reach toward
     *  it. Pure shader displacement (no physics); the rest of the media stays flat. */
    setMagnetMode(on) {
        this._magnetMode = !!on;
        if (this.material) this.material.uniforms.uMagnetMode.value = on ? 1 : 0;
        this._freezeToPlane();   // cubes sit at rest; the shader does the reaching
    }

    /** Reach (pull strength 0..1+) and Range (influence radius, local units). Live. */
    setMagnetParams(strength, radius) {
        if (strength != null) this._magnetStrength = Math.max(0, strength);
        if (radius != null) this._magnetRadius = Math.max(0.05, radius);
        if (this.material) {
            this.material.uniforms.uMagnetStrength.value = this._magnetStrength;
            this.material.uniforms.uMagnetRadius.value = this._magnetRadius;
        }
    }

    /** Invert — reverse the magnet so it pushes pixels away instead of pulling
     *  them in. Direction is the source of truth when NOT in custom-gesture mode. */
    setMagnetInvert(on) {
        this._magnetInvert = !!on;
        if (this.material) this.material.uniforms.uMagnetDir.value = this._magnetInvert ? -1.0 : 1.0;
    }

    /** Custom-gesture drive (per-frame): signed direction (+1 pull / -1 push) and
     *  gain 0..1 (0 = pixels stay in place, no swell, no displacement). */
    setMagnetDrive(dir, gain) {
        if (!this.material) return;
        this.material.uniforms.uMagnetDir.value = dir;
        this.material.uniforms.uMagnetGain.value = gain;
    }

    /** Restore the normal (non-gesture) magnet: full gain, direction from Invert. */
    clearMagnetDrive() {
        if (!this.material) return;
        this.material.uniforms.uMagnetGain.value = 1.0;
        this.material.uniforms.uMagnetDir.value = this._magnetInvert ? -1.0 : 1.0;
    }

    /** Flip — each tile rotates ±180° about its own centre. Auto = an elastic wave
     *  with per-tile random axis / phase (the classic pixel-flip); Custom Gesture =
     *  tiles within Range of the hand flip by the eased hand openness. Pure shader
     *  rotation (no physics); cubes sit at rest. */
    setFlipMode(on) {
        this._flipMode = !!on;
        if (this.material) this.material.uniforms.uFlipMode.value = on ? 1 : 0;
        this._freezeToPlane();   // cubes rest flat; the shader does the flipping
    }

    /** Speed (Auto wave) and Range (gesture influence radius, local units). Live. */
    setFlipParams(speed, range) {
        if (speed != null) this._flipSpeed = Math.max(0, speed);
        if (range != null) this._flipRange = Math.max(0.05, range);
        if (this.material) {
            this.material.uniforms.uFlipSpeed.value = this._flipSpeed;
            this.material.uniforms.uFlipRange.value = this._flipRange;
        }
    }

    /** Axis — 0 random per-tile, 1 horizontal (X), 2 vertical (Y). Live. */
    setFlipAxis(axis) {
        this._flipAxis = axis;
        if (this.material) this.material.uniforms.uFlipAxis.value = axis;
    }

    /** Custom-gesture drive (per-frame): direction (+1/-1) and gain 0..1 (palm open
     *  = 1 → flipped, fist = 0 → flat). Switches the shader off the Auto wave. */
    setFlipDrive(dir, gain) {
        if (!this.material) return;
        this.material.uniforms.uFlipGesture.value = 1;
        this.material.uniforms.uFlipDir.value = dir;
        this.material.uniforms.uFlipGain.value = gain;
    }

    /** Audio-reactive drive (per-frame): gain 0..1 from the selected band flips every
     *  tile (palm/fist not needed). Switches the shader to the audio branch. */
    setFlipAudioDrive(gain) {
        if (!this.material) return;
        this.material.uniforms.uFlipGesture.value = 2;
        this.material.uniforms.uFlipGain.value = gain;
    }

    /** Restore the Auto flip wave (no gesture, no audio). */
    clearFlipDrive() {
        if (!this.material) return;
        this.material.uniforms.uFlipGesture.value = 0;
        this.material.uniforms.uFlipGain.value = 1;
    }

    /** Move the flip centre with the smoothed gesture (same mapping as updateMagnet). */
    updateFlip(tx, ty, lean) {
        if (!this._flipMode || !this.material || !this.grid) return;
        const R = Math.max(this.grid.width, this.grid.height) * 0.65;
        const p = this.material.uniforms.uFlipCenter.value;
        const k = 0.25;
        p.x += (tx * R - p.x) * k;
        p.y += (-ty * R - p.y) * k;
        p.z += (0.5 - p.z) * k;
    }

    /** Feed the smoothed gesture each frame. tx,ty are screen-normalized (-1..1),
     *  lean is the depth signal; mapped into the plane's local space and eased. */
    updateMagnet(tx, ty, lean) {
        if (!this._magnetMode || !this.material || !this.grid) return;
        const R = Math.max(this.grid.width, this.grid.height) * 0.65;
        const targetX = tx * R;
        const targetY = -ty * R;                       // screen-down → local-up
        const targetZ = 0.5 + Math.max(0, lean || 0) * 0.9;  // lean in → reach further out
        const p = this.material.uniforms.uMagnetPos.value;
        const k = 0.25;                                // easing toward the gesture
        p.x += (targetX - p.x) * k;
        p.y += (targetY - p.y) * k;
        p.z += (targetZ - p.z) * k;
    }

    /** Tag the cubes inside the centre circle as "hole" cubes (full voxels that
     *  drop) and stagger their first drop; everything else stays a flat, fixed
     *  tile so the media plane is untouched. Safe to call live (slider) — cubes
     *  that just left the hole are returned to the plane, new ones are scheduled. */
    _applyHoleMask() {
        if (!this.rigidBodies || !this.grid) return;
        const { RAPIER } = this;
        const { width, height } = this.grid;
        const holeR = this._holeRadius * 0.5 * Math.min(width, height);
        const r2 = holeR * holeR;
        const now = performance.now();
        for (let i = 0; i < this.rigidBodies.length; i++) {
            const p = this.initPos[i];
            const inHole = (p.x * p.x + p.y * p.y) <= r2;
            const wasHole = this._holeMask[i] === 1;
            this._holeMask[i] = inHole ? 1 : 0;
            this._aHole[i] = inHole ? 1 : 0;
            if (inHole && !wasHole) {
                // Newly part of the hole → schedule its first drop.
                this._holeNextDrop[i] = now + Math.random() * this._holeInterval * 1000;
            } else if (!inHole && (wasHole || this.dropFlags[i] === 1)) {
                // Just left the hole → snap back to the plane as a fixed flat tile.
                const rb = this.rigidBodies[i];
                rb.setBodyType(RAPIER.RigidBodyType.Fixed);
                rb.setTranslation({ x: p.x, y: p.y, z: 0 }, true);
                rb.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
                rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
                rb.setAngvel({ x: 0, y: 0, z: 0 }, true);
                rb.sleep();
                this.dropFlags[i] = 0;
            }
        }
        if (this._aHoleAttr) this._aHoleAttr.needsUpdate = true;
    }

    /** Per-frame loop for Infinite Hole: drop resting hole cubes once their stagger
     *  timer elapses, and recycle any that have fallen far enough back to the plane
     *  so the centre rains pixels forever. */
    _tickHole(now) {
        if (!this._holeMask) return;
        const { RAPIER } = this;
        const resetY = -this.grid.height * 2.0;
        const resetZ = -this.grid.width * 2.0;
        for (let i = 0; i < this.rigidBodies.length; i++) {
            if (!this._holeMask[i]) continue;
            const rb = this.rigidBodies[i];
            if (this.dropFlags[i] === 0) {
                if (now >= this._holeNextDrop[i]) {
                    this._dropHoleCube(i);
                    this.dropFlags[i] = 1;
                }
            } else {
                const t = rb.translation();
                if (t.y < resetY || t.z < resetZ) {
                    rb.setBodyType(RAPIER.RigidBodyType.Fixed);
                    rb.setTranslation({ x: this.initPos[i].x, y: this.initPos[i].y, z: 0 }, true);
                    rb.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
                    rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
                    rb.setAngvel({ x: 0, y: 0, z: 0 }, true);
                    rb.sleep();
                    this.dropFlags[i] = 0;
                    this._holeNextDrop[i] = now + this._holeInterval * 1000 * (0.5 + Math.random());
                }
            }
        }
    }

    /** Send one hole cube tumbling back-and-down through the hole (behind the
     *  plane so it doesn't occlude the surrounding media). */
    _dropHoleCube(i) {
        const rb = this.rigidBodies[i];
        if (!rb) return;
        rb.setBodyType(this.RAPIER.RigidBodyType.Dynamic);
        rb.setGravityScale(1.0);
        rb.setLinearDamping(0.4);
        rb.setAngularDamping(0.3);
        rb.wakeUp();
        rb.setLinvel({ x: (Math.random() - 0.5) * 0.4, y: -0.2 - Math.random() * 0.3, z: -0.6 - Math.random() * 0.6 }, true);
        rb.setAngvel({ x: Math.random() - 0.5, y: Math.random() - 0.5, z: Math.random() - 0.5 }, true);
    }

    /** Per-frame driver for the Orbit drop style: ramp the voxelization, then swirl every
     *  cube around the plane centre (mild differential rotation), breathing the disc
     *  outward and easing in depth + per-cube tumble. Bodies are teleported (Fixed), so
     *  _syncMesh(true) pushes the new transforms to the InstancedMesh each frame. */
    _tickOrbit(dt) {
        if (!this._orbit) return;
        const { THREE } = this;
        // Bloom the tiles into full cubes as the galaxy forms; flip to 'collapsed' once
        // fully voxelized so the "Back to Plane" button enables.
        const u = this.material.uniforms.uVoxelateProgress;
        if (u.value < this._targetVal) {
            u.value = Math.min(this._targetVal, u.value + dt / this.params.baseDuration);
        } else if (this._state === 'animating') {
            this._state = 'collapsed';
        }

        this._orbitT += dt;
        const t     = this._orbitT;
        const grow  = 1 + 0.35 * Math.min(1, t * 0.25);   // disc breathes outward as it forms
        const zEase = Math.min(1, t * 0.5);               // depth eases in
        const { angle, radius, angSpeed, z, spinAxis, spinSpeed } = this._orbit;

        if (!this._qTmp) { this._qTmp = new THREE.Quaternion(); this._axTmp = new THREE.Vector3(); }
        const q = this._qTmp, ax = this._axTmp;

        for (let i = 0; i < this.rigidBodies.length; i++) {
            const rb = this.rigidBodies[i];
            if (!rb) continue;
            const ang = angle[i] + angSpeed[i] * t;
            const r   = radius[i] * grow;
            rb.setTranslation({ x: r * Math.cos(ang), y: r * Math.sin(ang), z: z[i] * zEase }, true);
            ax.set(spinAxis[i * 3], spinAxis[i * 3 + 1], spinAxis[i * 3 + 2]);
            q.setFromAxisAngle(ax, spinSpeed[i] * t);
            rb.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
        }
        this._syncMesh(true);
    }

    /** Per-frame driver for the Pixel Tunnel: ramp the voxelization, ease each tile
     *  from its grid slot into its tunnel slot (staggered outward from the centre
     *  strip), then stream everything toward the camera along +z, wrapping modulo
     *  the loop length. Bodies are teleported (Fixed), so _syncMesh(true) pushes the
     *  transforms to the InstancedMesh. No allocations, no rotations — cheap. */
    _tickTunnel(dt) {
        if (!this._tunnel) return;
        // Bloom the tiles into slabs as the tunnel forms; flip to 'collapsed' once
        // fully voxelized so the "Back to Plane" button enables (mirrors _tickOrbit).
        const u = this.material.uniforms.uVoxelateProgress;
        if (u.value < this._targetVal) {
            u.value = Math.min(this._targetVal, u.value + dt / this.params.baseDuration);
        } else if (this._state === 'animating') {
            this._state = 'collapsed';
        }

        this._tunnelT += dt;
        const t = this._tunnelT;
        this.material.uniforms.uTime.value = t;            // drives the glow pulses
        const { x, y, z0, stagger, len, zNear, speed } = this._tunnel;
        // Cruise speed eases in so the tunnel assembles before the fly-through starts.
        const speedMultiplier = this._tunnelSpeedMultiplier || 1.0;
        this._tunnelPhase += speed * speedMultiplier * Math.min(1, t * 0.45) * dt;
        const phase = this._tunnelPhase;

        for (let i = 0; i < this.rigidBodies.length; i++) {
            const rb = this.rigidBodies[i];
            if (!rb) continue;
            let m = (t - stagger[i]) / 1.6;                // grid slot → tunnel slot ease
            m = m <= 0 ? 0 : (m >= 1 ? 1 : m * m * (3 - 2 * m));
            let z = z0[i] + phase;
            z = zNear - (((zNear - z) % len) + len) % len; // wrap into (zNear-len, zNear]
            const p = this.initPos[i];
            rb.setTranslation({
                x: p.x + (x[i] - p.x) * m,
                y: p.y + (y[i] - p.y) * m,
                z: z * m,
            }, true);
        }
        this._syncMesh(true);
    }

    /** Per-frame driver for Bursts: ramp the voxelization, then launch each cube
     *  outward along its precomputed radial direction with an ease-out (decelerating,
     *  like debris under drag) so the shatter reads as a burst that flies apart and
     *  settles into a slowly tumbling debris field. Bodies are teleported (Fixed), so
     *  _syncMesh(true) pushes the transforms to the InstancedMesh. */
    _tickBursts(dt) {
        if (!this._burst) return;
        const { THREE } = this;
        // Bloom the tiles into full cubes as the shatter forms; flip to 'collapsed'
        // once fully voxelized so the "Back to Plane" button enables.
        const u = this.material.uniforms.uVoxelateProgress;
        if (u.value < this._targetVal) {
            u.value = Math.min(this._targetVal, u.value + dt / this.params.baseDuration);
        } else if (this._state === 'animating') {
            this._state = 'collapsed';
        }

        this._burstT += dt;
        const t = this._burstT;
        const { dir, delay, speed, spinAxis, spinSpeed } = this._burst;

        if (!this._qTmp) { this._qTmp = new THREE.Quaternion(); this._axTmp = new THREE.Vector3(); }
        const q = this._qTmp, ax = this._axTmp;

        for (let i = 0; i < this.rigidBodies.length; i++) {
            const rb = this.rigidBodies[i];
            if (!rb) continue;
            const p = this.initPos[i];
            const local = Math.max(0, (t - delay[i] * 0.4) * speed[i]);
            const dist = 1 - Math.exp(-local * 1.6);           // ease-out launch, settles near 1
            const reach = dist * (2.2 + speed[i] * 1.4);
            rb.setTranslation({
                x: p.x + dir[i * 3] * reach,
                y: p.y + dir[i * 3 + 1] * reach,
                z: dir[i * 3 + 2] * reach,
            }, true);
            ax.set(spinAxis[i * 3], spinAxis[i * 3 + 1], spinAxis[i * 3 + 2]);
            q.setFromAxisAngle(ax, spinSpeed[i] * t);
            rb.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
        }
        this._syncMesh(true);
    }

    /** Snap every body back to its rest grid position (fixed + asleep) and reset
     *  the ripple — used when toggling Infinite Hole on/off for a clean state. */
    _freezeToPlane() {
        const { RAPIER } = this;
        if (!this.rigidBodies) return;
        for (let i = 0; i < this.rigidBodies.length; i++) {
            const rb = this.rigidBodies[i];
            if (!rb) continue;
            rb.setBodyType(RAPIER.RigidBodyType.Fixed);
            rb.setTranslation({ x: this.initPos[i].x, y: this.initPos[i].y, z: 0 }, true);
            rb.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
            rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
            rb.setAngvel({ x: 0, y: 0, z: 0 }, true);
            rb.sleep();
        }
        if (this.dropFlags) this.dropFlags.fill(0);
        this._pending.length = 0;
        this._reverse = null;
        this._reversePhase = '';
        this._orbitMode = false;
        this._orbit = null;
        this._tunnelMode = false;
        this._tunnel = null;
        this._tunnelSpeedMultiplier = 1.0;
        this._burstMode = false;
        this._burst = null;
        this._state = 'default';
        if (this.material) {
            this.material.uniforms.uVoxelateProgress.value = 0;
            this.material.uniforms.uTunnelMode.value = 0;
            this.material.uniforms.uTunnelSpeed.value = 1.0;
            this.material.uniforms.uHighlightIntensity.value = 0.0;
            this.material.transparent = false;
            // Preserve the Grow uniform across freeze — Grow uses freeze for setup
            // but the shader keeps drawing the extrusion while the mode flag is on.
        }
        this._syncMesh(true);
    }

    setOrganic(on) { this.params && (this.params.organicMode = !!on); this.material && (this.material.uniforms.uOrganicMode.value = on ? 1 : 0); }
    setPixelate(on) { this.params && (this.params.usePixelate = !!on); this.material && (this.material.uniforms.uUsePixelate.value = on ? 1 : 0); }
    setRGBShift(on) { this.params && (this.params.useRGBShift = !!on); this.material && (this.material.uniforms.uUseRGBShift.value = on ? 1 : 0); }
    setDropDelay(s) { if (this.params) this.params.dropDelay = Math.max(0, s); }

    // ── Grow — city-building luminance extrusion ──────────────────────────────

    /** Grow mode — each tile extrudes perpendicular to the plane by its luminance.
     *  Pure shader displacement (no physics); cubes sit at rest. */
    setGrowMode(on) {
        this._growMode = !!on;
        if (this.material) this.material.uniforms.uGrowMode.value = on ? 1 : 0;
        this._freezeToPlane();
    }

    /** Max extrusion height (0..2, 1 = full voxel height). Live. */
    setGrowAmount(val) {
        this._growAmount = Math.max(0, val);
        if (this.material) this.material.uniforms.uGrowAmount.value = this._growAmount;
    }

    /** Contrast curve (0..1, 0 = gentle hills, 1 = dramatic skyscrapers). Live. */
    setGrowContrast(val) {
        this._growContrast = Math.max(0, Math.min(1, val));
        if (this.material) this.material.uniforms.uGrowContrast.value = this._growContrast;
    }

    /** Audio-reactive pulse — additive height modulation (0..1). Per-frame. */
    setGrowAudioPulse(val) {
        if (this.material) this.material.uniforms.uGrowAudioPulse.value = Math.max(0, val || 0);
    }

    setGrowGestureDrive(gain) {
        if (this.material) this.material.uniforms.uGrowGestureGain.value = Math.max(0, Math.min(1, gain));
    }

    setGrowBackside(on) {
        this._growBackside = !!on;
        if (this.material) this.material.uniforms.uGrowBackside.value = on ? 1.0 : 0.0;
    }

    setGrowAudioEnabled(on) {
        if (this.material) this.material.uniforms.uGrowAudioEnabled.value = on ? 1.0 : 0.0;
    }

    setGrowRange(radius) {
        this._growRange = Math.max(0.05, radius);
        if (this.material) this.material.uniforms.uGrowRange.value = this._growRange;
    }
    
    setTunnelDrive(multiplier) {
        this._tunnelSpeedMultiplier = multiplier;
        if (this.material) {
            this.material.uniforms.uTunnelSpeed.value = multiplier;
        }
    }

    updateGrow(tx, ty, lean) {
        if (!this._growMode || !this.material || !this.grid) return;
        const R = Math.max(this.grid.width, this.grid.height) * 0.65;
        const targetX = tx * R;
        const targetY = -ty * R;
        const targetZ = 0.5 + Math.max(0, lean || 0) * 0.9;
        const p = this.material.uniforms.uGrowCenter.value;
        const k = 0.25;
        p.x += (targetX - p.x) * k;
        p.y += (targetY - p.y) * k;
        p.z += (targetZ - p.z) * k;
    }

    // ── Pyramorphic — anamorphic pyramid fold illusion ────────────────────────

    /** Pyramorphic mode — the media plane folds into a tall 4-sided pyramid
     *  (the physical anamorphic folding-print illusion). Pure shader
     *  displacement (no physics); cubes sit at rest. The fold eases from 0 on
     *  enable so the fold-up animates like the real print being collapsed. */
    setPyraMode(on) {
        this._pyraMode = !!on;
        this._pyraFold = 0;
        this._pyraTime = 0;
        if (this.material) {
            this.material.uniforms.uPyraMode.value = on ? 1 : 0;
            this.material.uniforms.uPyraFold.value = 0;
        }
        this._freezeToPlane();
    }

    /** Fold slider target (0 flat … 1 pyramid). Eased in tick(). Live. */
    setPyraFold(frac) {
        this._pyraFoldTarget = Math.max(0, Math.min(1, frac));
    }

    /** Apex height (local units, plane long side = 2) and base footprint scale
     *  (0..1 of the flat plane) at full fold. Live uniforms. */
    setPyraParams(height, base) {
        if (height != null) this._pyraHeight = Math.max(0.1, height);
        if (base != null) this._pyraBase = Math.max(0.05, Math.min(1, base));
        if (this.material) {
            this.material.uniforms.uPyraHeight.value = this._pyraHeight;
            this.material.uniforms.uPyraBase.value = this._pyraBase;
        }
    }

    /** Footprint shape — sides 0 = cone (circle, smooth walls), 3/4/6/8 = regular
     *  N-gon (planar faces with creases). rect = true keeps the media rectangle
     *  as the base (the classic 4-fold print); false uses a regular footprint on
     *  the short dimension — the print outside it lies flat as a brim. clip =
     *  true cuts the media to the footprint (the Circle disc print — no brim,
     *  fragments outside are discarded). Live. */
    setPyraShape(sides, rect, clip) {
        this._pyraSides = Math.max(0, sides | 0);
        this._pyraRect = !!rect;
        this._pyraClip = !!clip;
        if (this.material) {
            this.material.uniforms.uPyraSides.value = this._pyraSides;
            this.material.uniforms.uPyraRect.value = this._pyraRect ? 1 : 0;
            this.material.uniforms.uPyraClip.value = this._pyraClip ? 1 : 0;
        }
    }

    /** Projection style — false = Exterior ridge (apex toward the viewer),
     *  true = Interior hollow (the centre recedes into a frustum room; the
     *  frame border stays pinned to the plane). Live. */
    setPyraStyle(interior) {
        this._pyraInterior = !!interior;
        if (this.material) this.material.uniforms.uPyraInterior.value = interior ? 1 : 0;
    }

    /** Truncation — size of the flat top plate (interior: the back wall),
     *  0 = sharp apex … 0.92. Live. */
    setPyraTop(frac) {
        this._pyraTop = Math.max(0, Math.min(0.92, frac));
        if (this.material) this.material.uniforms.uPyraTop.value = this._pyraTop;
    }

    /** Profile curve exponent — 1 = straight faces, >1 concave (trumpet bell),
     *  <1 convex (dome shoulder). Live. */
    setPyraCurve(exp) {
        this._pyraCurve = Math.max(0.25, Math.min(4, exp));
        if (this.material) this.material.uniforms.uPyraCurve.value = this._pyraCurve;
    }

    /** Auto Fold — endless fold / dwell / unfold / dwell loop (like the print
     *  being folded and opened over and over). */
    setPyraAuto(on) { this._pyraAuto = !!on; }

    /** Auto Fold speed (0.1 … 2). Live. */
    setPyraSpeed(s) { this._pyraSpeed = Math.max(0.05, s); }

    /** Gesture / audio fold override (0..1) — takes over from the slider and
     *  the Auto Fold loop while set. Per-frame. */
    setPyraDrive(gain) { this._pyraDrive = Math.max(0, Math.min(1, gain)); }

    /** Restore slider / Auto Fold control. */
    clearPyraDrive() { this._pyraDrive = null; }

    /** Sample the source texture's luminance into the per-instance aGrowHeight
     *  attribute. Draws the texture to a tiny offscreen canvas, reads the pixel
     *  data, and maps each tile's centre UV to a 0..1 brightness value. */
    _sampleHeights(texture) {
        if (!texture || !texture.image || !this._aGrowHeight || !this.grid) return;
        const img = texture.image;
        // Use a small sampling canvas — we only need one sample per tile.
        const sw = Math.min(img.width || img.videoWidth || 256, 512);
        const sh = Math.min(img.height || img.videoHeight || 256, 512);
        const c = document.createElement('canvas');
        c.width = sw; c.height = sh;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        try { ctx.drawImage(img, 0, 0, sw, sh); } catch (_) { return; }
        let data;
        try { data = ctx.getImageData(0, 0, sw, sh).data; } catch (_) { return; }
        const { cols, rows, count } = this.grid;
        for (let i = 0; i < count; i++) {
            const u = this.cachedUVs[i * 2];
            const v = this.cachedUVs[i * 2 + 1];
            const px = Math.min(sw - 1, Math.max(0, Math.floor(u * sw)));
            const py = Math.min(sh - 1, Math.max(0, Math.floor((1 - v) * sh))); // flip Y
            const idx = (py * sw + px) * 4;
            // Perceived luminance (ITU-R BT.601).
            const lum = (data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114) / 255;
            this._aGrowHeight[i] = lum;
        }
        if (this._aGrowHeightAttr) this._aGrowHeightAttr.needsUpdate = true;
    }

    setDance(on, level) {
        if (!this.params) return;
        this.params.isDancing = !!on;
        if (level != null) this.params.dancingLevel = level;
        this.bodyDamping = this.params.isDancing ? 0.8 : 2.0;
        this.bodyRestitution = this.params.isDancing ? 1.0 + 0.6 * (this.params.dancingLevel / 10) : 0.01;
        for (const rb of this.rigidBodies) {
            rb.setLinearDamping(this.bodyDamping);
            rb.setAngularDamping(this.bodyDamping);
            const c = rb.collider(0);
            if (c) c.setRestitution(this.bodyRestitution);
            rb.wakeUp();
        }
    }

    // ── Per-frame ──────────────────────────────────────────────────────────────

    tick() {
        if (!this.mesh || !this.world) return;
        const now = performance.now();
        let dt = (now - (this._lastT || now)) / 1000;
        this._lastT = now;
        dt = Math.min(dt, 0.05);   // clamp tab-switch spikes

        // Magnet: pure shader displacement toward the gesture point — no physics.
        // The cubes sit at their rest pose (instanceMatrix) and the vertex shader
        // reaches them toward uMagnetPos, so nothing to step here.
        if (this._magnetMode) return;

        // Grow: pure shader extrusion — cubes sit at rest, the vertex shader scales
        // their z by the luminance height. Advance the wave clock for audio reactive grow.
        if (this._growMode) {
            this._growTime = (this._growTime || 0) + dt;
            if (this.material) this.material.uniforms.uTime.value = this._growTime;
            return;
        }

        // Pyramorphic: pure shader fold — cubes sit at rest while the vertex
        // shader folds the plane into the pyramid. Ease the fold toward its
        // target (gesture/audio override > Auto Fold loop > Fold slider).
        if (this._pyraMode) {
            this._pyraTime += dt;
            let target;
            if (this._pyraDrive != null) {
                target = this._pyraDrive;
            } else if (this._pyraAuto) {
                // Ping-pong 0→1→0 with a dwell at both ends, like the video loop.
                const ph = (this._pyraTime * (0.04 + this._pyraSpeed * 0.22)) % 1;
                const tri = ph < 0.5 ? ph * 2 : 2 - ph * 2;
                const e = Math.max(0, Math.min(1, (tri - 0.12) / 0.76));
                target = e * e * (3 - 2 * e);
            } else {
                target = this._pyraFoldTarget;
            }
            this._pyraFold += (target - this._pyraFold) * Math.min(1, dt * 3.5);
            if (this.material) this.material.uniforms.uPyraFold.value = this._pyraFold;
            return;
        }

        // Flip: pure shader rotation about each tile's centre — no physics. Advance
        // the wave clock (Auto reads uTime; Custom Gesture reads its own uniforms).
        if (this._flipMode) {
            this._flipTime += dt;
            this.material.uniforms.uTime.value = this._flipTime;
            return;
        }

        // Orbit drop style: deterministic cosmic swirl — no physics, the bodies are
        // hand-positioned each frame. Loops forever until "Back to Plane".
        if (this._orbitMode) {
            this._tickOrbit(dt);
            return;
        }

        // Pixel Tunnel drop style: deterministic two-plane fly-through — no physics,
        // the bodies are hand-positioned each frame. Loops forever until "Back to Plane".
        if (this._tunnelMode) {
            this._tickTunnel(dt);
            return;
        }

        // Bursts drop style: deterministic radial shatter — no physics, the bodies
        // are hand-positioned each frame. Loops forever until "Back to Plane".
        if (this._burstMode) {
            this._tickBursts(dt);
            return;
        }

        // Infinite Hole: the centre cubes drop through a hole and loop forever via
        // real physics; the surrounding media plane stays put (its cubes are fixed).
        if (this._holeMode) {
            this._tickHole(now);
            this._physAccum = (this._physAccum || 0) + dt;
            if (this._physAccum >= 1 / 60) {
                this.world.step();
                this._physAccum -= 1 / 60;
                if (this._physAccum > 1 / 30) this._physAccum = 0;
            }
            this._syncMesh(true);
            return;
        }

        const st = this._state;

        if (st === 'animating') {
            const u = this.material.uniforms.uVoxelateProgress;
            u.value = Math.min(this._targetVal, u.value + dt / this.params.baseDuration);
            if (u.value > 0.01) this._checkAndActivateDrop(u.value);
            if (u.value >= this._targetVal) {
                this._forceActivateDrop();
                this._state = 'collapsed';
            }
        }

        this._processPending(now);

        if (st !== 'reversing') {
            // Fixed-timestep cap: Rapier's world.step() advances by its own fixed
            // internal dt (≈1/60 s), so calling it every rAF at 144 Hz runs physics
            // 2.4× faster than intended and wastes CPU. Accumulate real time and step
            // at most once per 1/60 s. Skip entirely when all bodies are settled.
            this._physAccum = (this._physAccum || 0) + dt;
            if (this._physAccum >= 1 / 60) {
                if (this._anyAwake || st === 'animating' || this._pending.length > 0) {
                    this.world.step();
                }
                this._physAccum -= 1 / 60;
                if (this._physAccum > 1 / 30) this._physAccum = 0; // anti-spiral after tab-switch
            }
        } else {
            this._tickReverse(dt);
        }

        // Sync visuals everywhere except a settled default plane.
        if (this._state !== 'default') this._syncMesh(this._state === 'reversing');
    }

    _tickReverse(dt) {
        if (this._reversePhase === 'positions') {
            const stagger = 2.0;
            this._reverseT = Math.min(1 + stagger, this._reverseT + dt * (1 + stagger));
            const globalT = this._reverseT;
            const qTmp = new this.THREE.Quaternion();
            for (const d of this._reverse) {
                let t = Math.max(0, Math.min(1, globalT - d.delay * stagger));
                if (t <= 0) continue;
                const x = d.sp.x + (d.ep.x - d.sp.x) * t;
                const y = d.sp.y + (d.ep.y - d.sp.y) * t;
                const z = d.sp.z + (d.ep.z - d.sp.z) * t;
                qTmp.copy(d.sr).slerp(this._IDENTITY || (this._IDENTITY = new this.THREE.Quaternion()), t);
                d.rb.setTranslation({ x, y, z }, true);
                d.rb.setRotation({ x: qTmp.x, y: qTmp.y, z: qTmp.z, w: qTmp.w }, true);
            }
            if (globalT >= 1 + stagger) this._reversePhase = 'flatten';
        } else if (this._reversePhase === 'flatten') {
            const u = this.material.uniforms.uVoxelateProgress;
            u.value = Math.max(0, u.value - dt / 0.3);
            if (u.value <= 0.0001) {
                u.value = 0;
                this.world.gravity = { x: 0, y: this._gravityY, z: 0 };
                this.dropFlags.fill(0);
                this._reverse = null;
                this._reversePhase = '';
                this._state = 'default';
                // Tunnel leftovers (slab shape / fog drained out with the flatten).
                this.material.uniforms.uTunnelMode.value = 0;
                this.material.transparent = false;
                this._syncMesh(true);
            }
        }
    }

    _checkAndActivateDrop(progress) {
        const spreadThreshold = this.params.effectSpread * 0.98;
        const rc = this._ripple;
        const aspectVecX = this.grid.cols / this.grid.rows;
        const organic = this.params.organicMode;
        const force = this.grid.spacing * 2.0;
        const count = this.grid.count;
        for (let i = 0; i < count; i++) {
            if (this.dropFlags[i] === 1) continue;
            const u = this.cachedUVs[i * 2];
            const v = this.cachedUVs[i * 2 + 1];
            const noiseOffset = organic ? this.noiseOffsets[i] : 0;
            const dx = (u - rc.u) * aspectVecX;
            const dy = v - rc.v;
            const distSq = dx * dx + dy * dy;
            const threshold = progress - spreadThreshold - noiseOffset;
            if (threshold > 0 && threshold * threshold > distSq) {
                this.dropFlags[i] = 1;
                this._activateBody(i, force);
            }
        }
    }

    _forceActivateDrop() {
        const force = 2.0;
        for (let i = 0; i < this.dropFlags.length; i++) {
            if (this.dropFlags[i] === 1) continue;
            this.dropFlags[i] = 1;
            this._activateBody(i, force);
        }
    }

    _activateBody(index, force) {
        const rb = this.rigidBodies[index];
        if (!rb) return;
        rb.setBodyType(this.RAPIER.RigidBodyType.Dynamic);
        rb.setGravityScale(0.01);   // brief float, restored after dropDelay
        rb.setLinearDamping(1.2);
        rb.wakeUp();
        rb.setLinvel({ x: (Math.random() - 0.5) * force, y: (Math.random() - 0.5) * force, z: (Math.random() - 0.5) * force }, true);
        rb.setAngvel({ x: Math.random() - 0.5, y: Math.random() - 0.5, z: Math.random() - 0.5 }, true);
        this._pending.push({ i: index, at: performance.now() + this.params.dropDelay * 1000 });
    }

    _processPending(now) {
        if (!this._pending.length) return;
        const keep = [];
        for (const p of this._pending) {
            if (now >= p.at) this._resetBodyParameters(p.i);
            else keep.push(p);
        }
        this._pending = keep;
    }

    _resetBodyParameters(index) {
        const rb = this.rigidBodies[index];
        if (!rb || !this.world.getRigidBody(rb.handle)) return;
        rb.setGravityScale(1.0);
        rb.setLinearDamping(this.bodyDamping);
        rb.setAngularDamping(this.bodyDamping);
        rb.wakeUp();
    }

    _syncMesh(force = false) {
        let anyAwake = false;
        let needsUpdate = false;
        for (let i = 0; i < this.rigidBodies.length; i++) {
            const rb = this.rigidBodies[i];
            const awake = !rb.isSleeping();
            if (awake) anyAwake = true;
            if (force || awake) {
                const p = rb.translation();
                const r = rb.rotation();
                this.dummy.position.set(p.x, p.y, p.z);
                this.dummy.quaternion.set(r.x, r.y, r.z, r.w);
                this.dummy.scale.set(1, 1, 1);
                this.dummy.updateMatrix();
                this.mesh.setMatrixAt(i, this.dummy.matrix);
                needsUpdate = true;
            }
        }
        this._anyAwake = anyAwake;
        if (needsUpdate) this.mesh.instanceMatrix.needsUpdate = true;
    }

    dispose() {
        if (this.mesh) {
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
            if (this.group) this.group.remove(this.mesh);
            this.mesh = null;
        }
        if (this.world) {
            try { this.world.free(); } catch (_) { /* ignore */ }
            this.world = null;
        }
        this.material = null;
        this.group = null;
        this.rigidBodies = [];
        this.initPos = [];
        this.dropFlags = null;
        this.cachedUVs = null;
        this.noiseOffsets = null;
        this._pending = [];
        this._reverse = null;
        this._anyAwake = false;
        this._state = 'default';
        this._holeMode = false;
        this._holeMask = null;
        this._holeNextDrop = null;
        this._aHole = null;
        this._aHoleAttr = null;
        this._magnetMode = false;
        this._magnetInvert = false;
        this._flipMode = false;
        this._flipTime = 0;
        this._growMode = false;
        this._aGrowHeight = null;
        this._aGrowHeightAttr = null;
        this._orbitMode = false;
        this._orbit = null;
        this._tunnelMode = false;
        this._tunnel = null;
        this._tunnelSpeedMultiplier = 1.0;
        this._burstMode = false;
        this._burst = null;
        this._burstT = 0;
        this._pyraMode = false;
        this._pyraFold = 0;
        this._pyraDrive = null;
        this._pyraTime = 0;
    }
}
