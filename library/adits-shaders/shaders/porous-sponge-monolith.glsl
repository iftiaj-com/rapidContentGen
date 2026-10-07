/*{
  "ADITS": 1,
  "DESCRIPTION": "A cavernous porous sponge monolith morphing between volcanic basalt pumice, marine biocoral aerogel, and an iridescent nano-porous crystal resonator with pulsating core caverns.",
  "CREDIT": "gemini-3.7-flash",
  "DATE": "2026-08-23",
  "CATEGORIES": ["generative", "morph", "3d", "audio", "organic"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "medium",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "morph_sens",    "TYPE": "float", "DEFAULT": 0.85, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Spectral Morph Gain" },
    { "NAME": "morph_rest",    "TYPE": "float", "DEFAULT": 0.35, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Rest Archetype" },
    { "NAME": "porosity",      "TYPE": "float", "DEFAULT": 0.52, "MIN": 0.20, "MAX": 0.85,
      "LABEL": "Cavity Porosity", "BIND": "bass", "BIND_DEPTH": 0.35 },
    { "NAME": "erosion",       "TYPE": "float", "DEFAULT": 0.48, "MIN": 0.15, "MAX": 0.85,
      "LABEL": "Lattice Erosion", "BIND": "mid", "BIND_DEPTH": 0.40 },
    { "NAME": "core_glow",     "TYPE": "float", "DEFAULT": 0.65, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Cavern Radiance", "BIND": "level", "BIND_DEPTH": 0.45 },
    { "NAME": "fossil_detail", "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Micro Pore Detail", "BIND": "treble", "BIND_DEPTH": 0.35 }
  ]
}*/

#define PI 3.14159265359
#define TAU 6.28318530718
#define PERIOD 16.0

// Rotation helpers
mat3 rotX(float a) {
    float c = cos(a), s = sin(a);
    return mat3(1.0, 0.0, 0.0, 0.0, c, -s, 0.0, s, c);
}

mat3 rotY(float a) {
    float c = cos(a), s = sin(a);
    return mat3(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c);
}

mat3 rotZ(float a) {
    float c = cos(a), s = sin(a);
    return mat3(c, -s, 0.0, s, c, 0.0, 0.0, 0.0, 1.0);
}

// Smooth maximum for clean CSG carving/subtraction
float smax(float a, float b, float k) {
    float h = max(k - abs(a - b), 0.0);
    return max(a, b) + h * h * 0.25 / k;
}

// Deterministic fast 3D hash
float hash(vec3 p) {
    p = 17.0 * fract(p * 0.3183099 + vec3(0.11, 0.17, 0.13));
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

vec3 hash3(vec3 p) {
    return vec3(hash(p), hash(p + 57.1), hash(p + 113.7));
}

// Bounding Box SDF
float sdBox(vec3 p, vec3 b) {
    vec3 d = abs(p) - b;
    return min(max(d.x, max(d.y, d.z)), 0.0) + length(max(d, 0.0));
}

// Rounded Box SDF
float sdRoundBox(vec3 p, vec3 b, float r) {
    vec3 q = abs(p) - b + vec3(r);
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r;
}

// Octahedron SDF for crystalline archetype
float sdOctahedron(vec3 p, float s) {
    p = abs(p);
    return (p.x + p.y + p.z - s) * 0.57735027;
}

// Analytic Box ray-intersection for bounding volume acceleration
vec2 iBox(in vec3 ro, in vec3 rd, in vec3 rad) {
    vec3 m = 1.0 / rd;
    vec3 n = m * ro;
    vec3 k = abs(m) * rad;
    vec3 t1 = -n - k;
    vec3 t2 = -n + k;
    float tN = max(max(t1.x, t1.y), t1.z);
    float tF = min(min(t2.x, t2.y), t2.z);
    if (tN > tF || tF < 0.0) return vec2(-1.0);
    return vec2(max(tN, 0.0), tF);
}

// Palette helper
vec3 pal(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
    return a + b * cos(TAU * (c * t + d));
}

// Global animation & audio uniforms
float g_ph;
float g_turn;
float g_morphSel;
float g_porosity;
float g_erosion;
float g_coreGlow;
float g_fossil;
float g_beatPulse;
float g_snarePop;
float g_kickSnap;

// Animated random SDF lattice placing spheres of moving sizes
float sdBase(in vec3 p, float timePhase, float radScale) {
    vec3 i = floor(p);
    vec3 f = fract(p);

    float baseRad = 0.70 * radScale;

    #define RAD(r) ((r) * (r) * baseRad)
    #define SPH(cx, cy, cz) (length(f - vec3(cx, cy, cz) - 0.08 * sin(timePhase + hash3(i + vec3(cx, cy, cz)) * TAU)) - RAD(hash(i + vec3(cx, cy, cz))))

    float d00 = min(SPH(0.0, 0.0, 0.0), SPH(0.0, 0.0, 1.0));
    float d01 = min(SPH(0.0, 1.0, 0.0), SPH(0.0, 1.0, 1.0));
    float d10 = min(SPH(1.0, 0.0, 0.0), SPH(1.0, 0.0, 1.0));
    float d11 = min(SPH(1.0, 1.0, 0.0), SPH(1.0, 1.0, 1.0));

    return min(min(d00, d01), min(d10, d11));
}

// Subtractive FBM for cellular sponge caverns
vec2 sdFbm(in vec3 p, float d, float timePhase) {
    const mat3 m = mat3(
         0.00,  0.80,  0.60,
        -0.80,  0.36, -0.48,
        -0.60, -0.48,  0.64
    );

    float t = 0.0;
    float s = 1.0;
    float radMult = 0.70 + 0.22 * g_porosity + 0.15 * g_kickSnap;
    float smoothK = 0.14 * (0.85 + 0.35 * g_erosion);

    for (int i = 0; i < 7; i++) {
        // Smooth drifting motion per octave
        vec3 pAnim = p + 0.04 * sin(vec3(1.0, 1.3, 1.7) * timePhase + float(i) * 1.5);
        float n = s * sdBase(pAnim, timePhase * 1.2 + float(i) * 0.5, radMult);
        d = smax(d, -n, smoothK * s);
        t += d;
        p = 2.0 * m * p;
        s = 0.55 * s;
    }

    return vec2(d, t);
}

// Struct for hit data
struct SceneHit {
    float d;
    float strata;
    float matID; // 1.0: Sponge Monolith, 2.0: Core Orb, 3.0: Spore Debris
    float innerGlow;
};

SceneHit map(in vec3 pos) {
    SceneHit res;

    // Scale coordinate space so the monolith bounds with clean margin in frame
    vec3 p = pos * 1.95;

    // Tumbling slow rotation
    vec3 pr = rotY(g_turn * 0.20) * rotX(g_turn * 0.14) * p;

    // Archetype weights based on spectral selector
    float xw = g_morphSel * 2.0;
    float w0 = clamp(1.0 - abs(xw)       * 1.6, 0.0, 1.0);
    float w1 = clamp(1.0 - abs(xw - 1.0) * 1.6, 0.0, 1.0);
    float w2 = clamp(1.0 - abs(xw - 2.0) * 1.6, 0.0, 1.0);
    float ws = w0 + w1 + w2 + 1e-4;
    w0 /= ws; w1 /= ws; w2 /= ws;

    // Base bounding shape morphing between monolith archetypes:
    // w0: Heavy basalt pumice cube
    // w1: Rounded organic biocoral block
    // w2: Faceted crystal octahedron
    float dBox = sdBox(pr, vec3(1.0));
    float dRound = sdRoundBox(pr, vec3(0.94), 0.12);
    float dOcta = sdOctahedron(pr, 1.38);

    float base = dBox * w0 + dRound * w1 + dOcta * w2;

    // Multi-octave subtractive FBM sponge (organically carves hollows across all scales)
    vec2 dt = sdFbm(pr + vec3(0.5), base, g_ph * TAU);
    float dSponge = dt.x / 1.95;

    // Strata metric from FBM
    float strata = clamp(0.5 + dt.y * 0.4, 0.0, 1.0);

    // Floating Core Orb nested inside cavernous void
    vec3 corePos = vec3(0.08 * sin(g_turn * 1.5), 0.09 * cos(g_turn * 1.2), 0.06 * sin(g_turn * 1.8));
    float coreRad = 0.14 + 0.04 * g_beatPulse + 0.02 * sin(g_turn * 3.5);
    float dCore = (length(pr - corePos) - coreRad) / 1.95;

    // Floating Spore mineral fragment (carved satellite)
    vec3 sporePr = rotZ(g_turn * 0.35) * pr;
    vec3 spPos = vec3(0.0, -1.05 - 0.08 * sin(g_turn * 2.0), 0.0);
    float dSpores = (sdOctahedron(sporePr - spPos, 0.18) - 0.02) / 1.95;

    // Material and hit selection
    float finalD = dSponge;
    float matID = 1.0;

    if (dCore < finalD) {
        finalD = dCore;
        matID = 2.0;
    }
    if (dSpores < finalD) {
        finalD = dSpores;
        matID = 3.0;
    }

    // Proximity to core for inner cavern glow emission
    float distToCore = length((pr - corePos) / 1.95);
    float innerGlow = smoothstep(0.35, 0.04, distToCore) * (0.3 + 0.7 * g_coreGlow + 0.9 * g_beatPulse);

    res.d = finalD;
    res.strata = strata;
    res.matID = matID;
    res.innerGlow = innerGlow;
    return res;
}

const float precis = 0.0005;

// 4-Tap Tetrahedral Normal
vec3 calcNormal(in vec3 pos) {
    const vec2 e = vec2(1.0, -1.0) * 0.5773 * precis;
    return normalize(
        e.xyy * map(pos + e.xyy).d +
        e.yyx * map(pos + e.yyx).d +
        e.yxy * map(pos + e.yxy).d +
        e.xxx * map(pos + e.xxx).d
    );
}

// Raymarching inside bounding box
struct RayResult {
    float t;
    float strata;
    float matID;
    float innerGlow;
    bool hit;
};

RayResult raycast(in vec3 ro, in vec3 rd) {
    RayResult res;
    res.t = -1.0;
    res.hit = false;
    res.strata = 0.5;
    res.matID = 1.0;
    res.innerGlow = 0.0;

    // Bounding box check
    vec2 dis = iBox(ro, rd, vec3(0.68));
    if (dis.y < 0.0) return res;

    // Raymarch
    float t = dis.x;
    for (int i = 0; i < 64; i++) {
        vec3 pos = ro + t * rd;
        SceneHit h = map(pos);
        
        if (h.d < precis) {
            res.t = t;
            res.strata = h.strata;
            res.matID = h.matID;
            res.innerGlow = h.innerGlow;
            res.hit = true;
            break;
        }
        
        t += h.d * 0.90;
        if (t > dis.y) break;
    }

    return res;
}

// Soft Shadow Marcher
float calcSoftShadow(vec3 ro, vec3 rd, float tmin, float tmax, float w) {
    vec2 dis = iBox(ro, rd, vec3(0.68));
    if (dis.y < 0.0) return 1.0;

    tmin = max(tmin, dis.x);
    tmax = min(tmax, dis.y);

    float t = tmin;
    float res = 1.0;
    for (int i = 0; i < 28; i++) {
        float h = map(ro + t * rd).d;
        res = min(res, h / (w * t));
        t += clamp(h, 0.005, 0.20);
        if (res < -1.0 || t > tmax) break;
    }
    res = max(res, -1.0);
    return 0.25 * (1.0 + res) * (1.0 + res) * (2.0 - res);
}

void main() {
    // Canonical preamble: aspect-correct, resolution-independent uv coordinates
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // Animation time phase
    g_ph = fract(TIME / PERIOD);
    g_turn = g_ph * TAU;

    // Audio reactivity & morph selector
    float lo = AUDIO_BASS;
    float md = AUDIO_MID;
    float hi = AUDIO_TREBLE;
    float sumAudio = lo + md + hi + 1e-4;
    float tilt = (md * 0.5 + hi) / sumAudio; // 0.0 = bass, 1.0 = treble

    // Spectral selector expanded around rest archetype
    float sens = morph_sens;
    float selRaw = clamp((tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5, 0.0, 1.0);

    // Audio onsets shove selector for instantaneous transitions
    float snap = 0.45 * (AUDIO_HAT - AUDIO_KICK);
    selRaw = clamp(selRaw + snap, 0.0, 1.0);

    // Fade to rest archetype at silence
    float isLive = smoothstep(0.02, 0.12, sumAudio);
    g_morphSel = mix(morph_rest, selRaw, isLive);

    // Control parameters
    g_porosity = porosity;
    g_erosion = erosion;
    g_coreGlow = core_glow;
    g_fossil = fossil_detail;

    // Direct onset transient pulses
    g_beatPulse = AUDIO_BEAT;
    g_snarePop = AUDIO_SNARE;
    g_kickSnap = AUDIO_KICK;

    // Camera setup using CAM_DIR and CAM_UP contract for 3D orbit & tracking
    const float ORBIT_DIST = 4.2;
    vec3 ro = CAM_DIR * ORBIT_DIST;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    // Focal length 2.4 tightly bounds the object silhouette inside r < 0.40
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 2.4 * ww);

    // Render raymarch
    vec3 col = vec3(0.0);
    float alpha = 0.0;

    RayResult tm = raycast(ro, rd);
    if (tm.hit) {
        vec3 pos = ro + tm.t * rd;
        vec3 nor = calcNormal(pos);
        vec3 viewDir = normalize(ro - pos);
        float occ = clamp(0.3 + 0.7 * tm.strata, 0.0, 1.0);

        // Archetype color palettes & materials:
        // Archetype 0: Volcanic Basalt Pumice / Warm Ochre & Terra-cotta
        vec3 mateBasalt = mix(vec3(0.55, 0.28, 0.12), vec3(0.92, 0.85, 0.80), tm.strata) * 0.70;
        
        // Archetype 1: Marine Biocoral Aerogel / Deep Indigo & Turquoise Pearl
        vec3 mateCoral = mix(vec3(0.18, 0.35, 0.45), vec3(0.85, 0.95, 0.98), tm.strata) * 0.78;
        
        // Archetype 2: Prismatic Nano-Porous Crystal / Amethyst & Golden Facets
        vec3 mateCrystal = pal(pos.y * 1.5 + tm.strata * 0.6 + g_turn * 0.15,
                               vec3(0.55, 0.48, 0.58), vec3(0.45, 0.42, 0.45), vec3(1.0, 1.0, 1.0), vec3(0.1, 0.35, 0.75));

        // Blend materials based on morph selector
        float xw = g_morphSel * 2.0;
        float w0 = clamp(1.0 - abs(xw)       * 1.6, 0.0, 1.0);
        float w1 = clamp(1.0 - abs(xw - 1.0) * 1.6, 0.0, 1.0);
        float w2 = clamp(1.0 - abs(xw - 2.0) * 1.6, 0.0, 1.0);
        float ws = w0 + w1 + w2 + 1e-4;
        w0 /= ws; w1 /= ws; w2 /= ws;

        vec3 mate = mateBasalt * w0 + mateCoral * w1 + mateCrystal * w2;

        if (tm.matID > 1.5 && tm.matID < 2.5) {
            // Suspended Radiant Core Orb
            vec3 coreCol = mix(vec3(1.0, 0.45, 0.15), vec3(0.25, 0.85, 1.0), g_morphSel);
            mate = coreCol * (0.9 + 0.8 * g_beatPulse);
        } else if (tm.matID > 2.5) {
            // Floating Spores
            vec3 sporeCol = mix(vec3(0.95, 0.85, 0.75), vec3(0.6, 0.9, 1.0), g_morphSel);
            mate = sporeCol * 0.9;
        }

        // Lighting
        // Key Light (warm directional orbital sun)
        vec3 lig = normalize(vec3(1.0, 0.5, 0.6));
        float dif = dot(lig, nor);
        if (dif > 0.0) dif *= calcSoftShadow(pos + nor * 0.002, lig, 0.002, 6.0, 0.0035);
        dif = clamp(dif, 0.0, 1.0);

        // Specular highlight with Fresnel
        vec3 hal = normalize(lig + viewDir);
        float spe = clamp(dot(hal, nor), 0.0, 1.0);
        spe = pow(spe, 4.0) * dif * (0.04 + 0.96 * pow(max(1.0 - dot(hal, lig), 0.0), 5.0));

        // Ambient lighting + sky bounce
        vec3 amb = mate * 0.20 * vec3(0.40, 0.45, 0.60) * occ * (0.6 + 0.4 * nor.y);

        // Inner cavern radiance
        vec3 innerLightCol = mix(vec3(1.0, 0.40, 0.10), vec3(0.20, 0.80, 1.0), g_morphSel);
        vec3 innerEmissive = innerLightCol * tm.innerGlow * (0.15 + 0.35 * g_beatPulse);

        // Surface color assembly
        col = mate * 1.5 * vec3(1.30, 0.85, 0.75) * dif + 9.0 * spe + amb + innerEmissive;

        // Surface coverage
        alpha = 1.0;
    }

    // Bounded edge fade: enforce zero coverage at frame borders (guide §8, §10)
    float frameFade = smoothstep(0.47, 0.38, length(uv));
    alpha *= frameFade;

    // Tonemap
    col = col * 1.7 / (1.0 + col);

    // Gamma correction
    col = pow(col, vec3(0.4545));

    // Premultiply alpha (guide §8)
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
