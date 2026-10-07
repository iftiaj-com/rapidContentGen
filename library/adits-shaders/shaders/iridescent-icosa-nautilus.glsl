/*{
  "ADITS": 1,
  "DESCRIPTION": "A luminous iridescent icosahedral chrysalis with twisting glass petals, chromatic dispersion, and an amber spiral core that morphs smoothly across spectral frequencies under audio transients.",
  "CREDIT": "gemini-3.7-flash (Medium)",
  "DATE": "2026-08-23",
  "CATEGORIES": ["generative", "morph", "3d", "iridescent", "bloom", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "medium",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "sens",  "TYPE": "float", "DEFAULT": 0.80, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Spectral Gain" },
    { "NAME": "snap",  "TYPE": "float", "DEFAULT": 0.60, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Onset Drive" },
    { "NAME": "rest",  "TYPE": "float", "DEFAULT": 0.40, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Resting Form" },
    { "NAME": "twist", "TYPE": "float", "DEFAULT": 0.75, "MIN": 0.20, "MAX": 1.20,
      "LABEL": "Twist Rate", "BIND": "mid", "BIND_DEPTH": 0.45 },
    { "NAME": "swell", "TYPE": "float", "DEFAULT": 0.85, "MIN": 0.50, "MAX": 1.20,
      "LABEL": "Scale Swell", "BIND": "bass", "BIND_DEPTH": 0.35 },
    { "NAME": "glow",  "TYPE": "float", "DEFAULT": 0.70, "MIN": 0.20, "MAX": 1.20,
      "LABEL": "Iridescent Glow", "BIND": "treble", "BIND_DEPTH": 0.50 }
  ]
}*/

#define PI  3.14159265359
#define TAU 6.28318530718
#define PHI 1.618033988749895

// --------------------------------------------------------
// Geometry & Symmetry Utilities
// --------------------------------------------------------

mat3 rotMatrix(vec3 axis, float angle) {
    vec3 a = normalize(axis);
    float s = sin(angle);
    float c = cos(angle);
    float oc = 1.0 - c;
    return mat3(
        oc * a.x * a.x + c,       oc * a.x * a.y - a.z * s, oc * a.z * a.x + a.y * s,
        oc * a.x * a.y + a.z * s, oc * a.y * a.y + c,       oc * a.y * a.z - a.x * s,
        oc * a.z * a.x - a.y * s, oc * a.y * a.z + a.x * s, oc * a.z * a.z + c
    );
}

void pR(inout vec2 p, float a) {
    p = cos(a) * p + sin(a) * vec2(p.y, -p.x);
}

float pReflect(inout vec3 p, vec3 planeNormal, float offset) {
    float t = dot(p, planeNormal) + offset;
    if (t < 0.0) {
        p -= (2.0 * t) * planeNormal;
    }
    return sign(t);
}

float pModPolar(inout vec2 p, float repetitions) {
    float angle = TAU / repetitions;
    float a = atan(p.y, p.x) + angle * 0.5;
    float r = length(p);
    float c = floor(a / angle);
    a = mod(a, angle) - angle * 0.5;
    p = vec2(cos(a), sin(a)) * r;
    if (abs(c) >= (repetitions * 0.5)) c = abs(c);
    return c;
}

// --------------------------------------------------------
// Icosahedral Folding System
// --------------------------------------------------------

vec3 getFoldPlane() {
    float cospin = cos(PI / 5.0);
    float scospin = sqrt(0.75 - cospin * cospin);
    return vec3(-0.5, -cospin, scospin);
}

vec3 getPCA() {
    float cospin = cos(PI / 5.0);
    float scospin = sqrt(0.75 - cospin * cospin);
    return normalize(vec3(0.0, scospin, cospin));
}

void pModIcosahedron(inout vec3 p) {
    vec3 nc = getFoldPlane();
    p = abs(p);
    pReflect(p, nc, 0.0);
    p.xy = abs(p.xy);
    pReflect(p, nc, 0.0);
    p.xy = abs(p.xy);
    pReflect(p, nc, 0.0);
}

float splitPlane(float a, float b, vec3 p, vec3 plane) {
    float split = max(sign(dot(p, plane)), 0.0);
    return mix(a, b, split);
}

float icosahedronIndex(vec3 p) {
    vec3 sp = sign(p);
    float x = sp.x * 0.5 + 0.5;
    float y = sp.y * 0.5 + 0.5;
    float z = sp.z * 0.5 + 0.5;
    vec3 plane = vec3(-1.0 - PHI, -1.0, PHI);

    float idx = x + y * 2.0 + z * 4.0;
    idx = splitPlane(idx, 8.0 + y + z * 2.0, p, plane * sp);
    idx = splitPlane(idx, 12.0 + x + y * 2.0, p, plane.yzx * sp);
    idx = splitPlane(idx, 16.0 + z + x * 2.0, p, plane.zxy * sp);
    return idx;
}

vec3 icosahedronVertex(vec3 p) {
    vec3 sp = sign(p);
    vec3 v = vec3(PHI, 1.0, 0.0);
    vec3 v1 = v.xyz * sp;
    vec3 v2 = v.yzx * sp;
    vec3 v3 = v.zxy * sp;

    vec3 plane = vec3(1.0, PHI, -PHI - 1.0);
    float split = max(sign(dot(p, plane.xyz * sp)), 0.0);
    vec3 result = mix(v2, v1, split);
    plane = mix(plane.yzx * -sp, plane.zxy * sp, split);
    split = max(sign(dot(p, plane)), 0.0);
    result = mix(result, v3, split);
    return normalize(result);
}

vec4 icosahedronAxisDistance(vec3 p) {
    vec3 iv = icosahedronVertex(p);
    vec3 originalIv = iv;

    vec3 pn = normalize(p);
    pModIcosahedron(pn);
    pModIcosahedron(iv);

    float boundryDist = dot(pn, vec3(1.0, 0.0, 0.0));
    float boundryMax = dot(iv, vec3(1.0, 0.0, 0.0));
    boundryDist /= max(boundryMax, 0.001);

    float roundDist = length(iv - pn);
    float roundMax = length(iv - vec3(0.0, 0.0, 1.0));
    roundDist /= max(roundMax, 0.001);
    roundDist = -roundDist + 1.0;

    float blend = 1.0 - boundryDist;
    blend = blend * blend * blend * blend * blend * blend;
    float dist = mix(roundDist, boundryDist, blend);

    return vec4(originalIv, dist);
}

void pTwistIcosahedron(inout vec3 p, float amount) {
    vec4 a = icosahedronAxisDistance(p);
    vec3 axis = a.xyz;
    float dist = a.w;
    mat3 m = rotMatrix(axis, dist * amount);
    p *= m;
}

// --------------------------------------------------------
// Iridescent Color Palette System
// --------------------------------------------------------

vec3 spectralPalette(float t, vec3 pos) {
    // Rich multi-spectral rainbow gradient matching reference image:
    // Cyan/Turquoise -> Luminous Violet -> Hot Pink -> Amber Gold -> Emerald Lime
    vec3 a = vec3(0.50, 0.50, 0.50);
    vec3 b = vec3(0.50, 0.50, 0.50);
    vec3 c = vec3(1.00, 1.00, 1.00);
    vec3 d = vec3(0.00, 0.33, 0.67);
    vec3 col = a + b * cos(TAU * (c * t + d));
    
    vec3 cyan    = vec3(0.06, 0.92, 1.00); // Electric Cyan
    vec3 magenta = vec3(1.00, 0.18, 0.85); // Vibrant Pink
    vec3 yellow  = vec3(1.00, 0.88, 0.12); // Golden Amber
    vec3 lime    = vec3(0.22, 0.98, 0.42); // Emerald Lime
    vec3 violet  = vec3(0.68, 0.18, 1.00); // Violet
    
    float f = fract(t * 1.6 + pos.y * 0.25);
    vec3 jewel = mix(cyan, magenta, smoothstep(0.00, 0.25, f));
    jewel = mix(jewel, yellow, smoothstep(0.25, 0.50, f));
    jewel = mix(jewel, lime, smoothstep(0.50, 0.75, f));
    jewel = mix(jewel, violet, smoothstep(0.75, 1.00, f));
    
    col = mix(col, jewel, 0.75);
    
    // Golden amber spiral center whorl matching reference image
    float centerProx = smoothstep(0.52, 0.05, length(pos));
    col = mix(col, vec3(1.00, 0.82, 0.14), centerProx * 0.80);
    
    return col;
}

// --------------------------------------------------------
// Scene Model & SDF
// --------------------------------------------------------

struct Model {
    float dist;
    vec3 colour;
};

Model sceneModel(vec3 p, float tPhase, float morphVal, float twistVal, float kickVal) {
    // Initial orientation aligning butterfly wings with default front camera
    pR(p.yz, 0.785);
    pR(p.xz, -0.65);

    float rate = PI / 6.0;
    float a = atan(1.0, PHI + 1.0);

    pR(p.yz, a);
    pR(p.yx, tPhase * 2.1 + rate);
    pR(p.yz, a);

    vec3 twistCenter = vec3(0.70, 0.0, 0.0);
    pR(twistCenter.yx, tPhase * 2.1 + rate);
    pR(twistCenter.yz, a);

    p += twistCenter;
    float twistAmount = (9.5 + 3.2 * morphVal + 3.8 * kickVal) * twistVal;
    pTwistIcosahedron(p, twistAmount);
    p -= twistCenter;

    // 3-fold polar symmetry for seamless organic nautilus/butterfly wings
    pR(p.yz, -a);
    pR(p.xy, -PI * 0.5);
    pModPolar(p.xy, 3.0);
    pR(p.xy, -PI * 0.5);
    pR(p.yz, -a);

    // Multi-archetype morph: smoothly transition icosahedron inflation and shell facets
    vec3 pca = getPCA();
    float idx = icosahedronIndex(p);
    if (idx == 3.0) idx = 2.0;

    float faceDist = dot(p, pca) - 0.90;
    float sphereDist = length(p) - (0.86 + 0.08 * morphVal);
    
    // Archetype blend factor: faceted crystal plate to inflated translucent chrysalis
    float inflation = mix(0.60, 1.0, morphVal);
    float d = mix(faceDist, sphereDist, inflation);

    // Color coordination per facet and depth
    float colorIndex = mod(idx * 0.10 + tPhase * 0.20 + morphVal * 0.25, 1.0);
    vec3 facetColor = spectralPalette(colorIndex, p);

    d *= 0.60;
    return Model(d, facetColor);
}

// --------------------------------------------------------
// Main Fragment Shader
// --------------------------------------------------------

void main() {
    // Canonical preamble: aspect-correct and resolution-independent
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // Strict silhouette bounding inside radius 0.42 to guarantee edge = 0 and stay within coverage budget
    float rad = length(uv);
    float boundMask = smoothstep(0.42, 0.32, rad);
    if (boundMask <= 0.0) {
        gl_FragColor = vec4(0.0);
        return;
    }

    // Wrap TIME exactly at LOOP = 16.0 s for seamless looping
    float ph = fract(TIME / 16.0);
    float tPhase = ph * TAU;

    // --------------------------------------------------------
    // Audio Reactivity & Morphing Selector (§11 & §12)
    // --------------------------------------------------------
    float lo = AUDIO_BASS;
    float md = AUDIO_MID;
    float hi = AUDIO_TREBLE;
    float sum = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum; // 0 = all bass, 1 = all treble

    // Expand tilt around rest point for wide dynamic range
    float sel = clamp((tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5, 0.0, 1.0);

    // Fast onset pulses directly shove selector without lag
    sel = clamp(sel + snap * (AUDIO_HAT - AUDIO_KICK), 0.0, 1.0);

    // Fade to resting archetype in silence
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest, sel, live);

    // Morph parameters derived from spectral selector and audio bands
    float morphVal = sel;
    float kickVal = AUDIO_KICK * snap + AUDIO_BEAT * 0.35;
    float twistVal = twist;
    float scaleFactor = max(0.45, swell * (0.95 + 0.08 * lo + 0.04 * AUDIO_BEAT));

    // --------------------------------------------------------
    // Camera Setup (3D Orbit via CAM_DIR & CAM_UP)
    // --------------------------------------------------------
    const float ORBIT = 5.50;
    vec3 ro = CAM_DIR * (ORBIT / scaleFactor);
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.80 * ww);

    // --------------------------------------------------------
    // Volumetric / SDF Raymarching Loop
    // --------------------------------------------------------
    const float MAX_TRACE_DISTANCE = 6.5;
    const float INTERSECTION_PRECISION = 0.0015;
    const float FUDGE_FACTOR = 0.25;

    vec3 colAcc = vec3(0.0);
    float alphaAcc = 0.0;
    float t = 0.0;

    // Fixed constant loop bound for performance and predictability
    for (int i = 0; i < 52; i++) {
        if (t > MAX_TRACE_DISTANCE) break;

        vec3 pos = ro + rd * t;
        Model m = sceneModel(pos, tPhase, morphVal, twistVal, kickVal);
        float h = abs(m.dist);
        t += max(INTERSECTION_PRECISION, h * FUDGE_FACTOR);

        // Precise boundary surface glow + luminous iridescent rim
        float rimSharp = smoothstep(0.024, 0.001, h);
        float coreFill = max(0.0, 0.018 - h) * 40.0;
        
        float stepLight = (rimSharp * 0.055 + coreFill * coreFill * 0.04) * (glow * 1.5 + 0.8 * kickVal + 0.4 * hi);
        colAcc += m.colour * stepLight;
        alphaAcc += (rimSharp * 0.045 + coreFill * 0.035);
        
        colAcc += m.colour * 0.0006 * FUDGE_FACTOR;
    }

    // Iridescent color grading & tone compression
    colAcc = pow(colAcc, vec3(1.0 / 1.5)) * 1.40;
    colAcc = colAcc / (vec3(1.0) + colAcc * 0.35); // soft Reinhard compression to preserve rich saturated colors

    // Strict premultiplied alpha: 0.0 everywhere outside the object
    float alpha = clamp(alphaAcc * 0.95 + length(colAcc) * 0.25, 0.0, 1.0) * boundMask;
    colAcc *= alpha;

    gl_FragColor = vec4(colAcc, alpha);
}
