/*{
  "ADITS": 1,
  "DESCRIPTION": "A kinetic CSG junction morphing between an obsidian titanium vault, an iridescent plasma gyro-nut, and a hyper-resonant star-core with orbiting harmonic satellites.",
  "CREDIT": "gemini-3.7-flash",
  "DATE": "2026-08-23",
  "CATEGORIES": ["generative", "morph", "3d", "audio", "geometric"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "medium",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "morph_sens", "TYPE": "float", "DEFAULT": 0.80, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Spectral Morph Gain" },
    { "NAME": "morph_rest", "TYPE": "float", "DEFAULT": 0.35, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Rest Archetype" },
    { "NAME": "scale",      "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.24, "MAX": 0.40,
      "LABEL": "Nexus Scale", "BIND": "bass", "BIND_DEPTH": 0.25 },
    { "NAME": "bore_warp",  "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.15, "MAX": 0.95,
      "LABEL": "Bore Fluting", "BIND": "mid", "BIND_DEPTH": 0.45 },
    { "NAME": "orbit_reach","TYPE": "float", "DEFAULT": 0.58, "MIN": 0.25, "MAX": 0.85,
      "LABEL": "Satellite Orbit", "BIND": "treble", "BIND_DEPTH": 0.40 },
    { "NAME": "core_lume",  "TYPE": "float", "DEFAULT": 0.75, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Plasma Lume", "BIND": "level", "BIND_DEPTH": 0.50 }
  ]
}*/

#define PI 3.14159265359
#define TAU 6.28318530718
#define PERIOD 16.0

// Smooth CSG operations
float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
}

float smax(float a, float b, float k) {
    float h = clamp(0.5 - 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) + k * h * (1.0 - h);
}

mat2 rot2D(float a) {
    float c = cos(a), s = sin(a);
    return mat2(c, -s, s, c);
}

mat3 rotX(float theta) {
    float c = cos(theta), s = sin(theta);
    return mat3(
        vec3(1.0, 0.0, 0.0),
        vec3(0.0, c, -s),
        vec3(0.0, s, c)
    );
}

mat3 rotY(float theta) {
    float c = cos(theta), s = sin(theta);
    return mat3(
        vec3(c, 0.0, s),
        vec3(0.0, 1.0, 0.0),
        vec3(-s, 0.0, c)
    );
}

mat3 rotZ(float theta) {
    float c = cos(theta), s = sin(theta);
    return mat3(
        vec3(c, -s, 0.0),
        vec3(s, c, 0.0),
        vec3(0.0, 0.0, 1.0)
    );
}

// Geometric SDF Primitives
float sdBox(vec3 p, vec3 b, float r) {
    vec3 q = abs(p) - b + vec3(r);
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r;
}

float sdSphere(vec3 p, float r) {
    return length(p) - r;
}

float sdCylinder(vec3 p, float h, float r) {
    vec2 d = abs(vec2(length(p.xy), p.z)) - vec2(r, h * 0.5);
    return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

// Color Palette generator
vec3 pal(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
    return a + b * cos(TAU * (c * t + d));
}

vec3 spectralPal(float t) {
    return pal(t, vec3(0.55, 0.52, 0.50), vec3(0.45, 0.48, 0.50), vec3(1.0, 1.0, 1.0), vec3(0.00, 0.33, 0.67));
}

vec3 neonPal(float t) {
    return pal(t, vec3(0.50, 0.50, 0.50), vec3(0.50, 0.50, 0.50), vec3(1.0, 1.0, 1.0), vec3(0.00, 0.35, 0.65));
}

// Struct for hit data
struct HitInfo {
    float d;
    float matID;   // 1.0: CSG Nut, 2.0: Primary Satellites, 2.5: Sub Satellites, 3.0: Core Pulsar
    vec3 glowColor;
    float glowMask;
    vec3 localPos;
};

// Global morphing parameters
float g_ph;
float g_turn;
float g_morphSel;
float g_boreWarp;
float g_orbitReach;
float g_beatSnap;
float g_coreLume;

HitInfo sceneMap(vec3 p) {
    // Continuous smooth tumbling rotation
    p = rotY(g_turn * 0.25) * rotX(g_turn * 0.18) * p;

    // Archetype weights based on spectral selector
    float xw = g_morphSel * 2.0;
    float w0 = clamp(1.0 - abs(xw)       * 1.65, 0.0, 1.0);
    float w1 = clamp(1.0 - abs(xw - 1.0) * 1.65, 0.0, 1.0);
    float w2 = clamp(1.0 - abs(xw - 2.0) * 1.65, 0.0, 1.0);
    float ws = w0 + w1 + w2 + 1e-4;
    w0 /= ws; w1 /= ws; w2 /= ws;

    // Morphable parameters
    // Archetype 0 (Bass): Heavy monolithic obsidian vault with bronze/copper accents
    // Archetype 1 (Mid): Kinetic gyro-nut with helical fluted ports and electric cyan-violet seams
    // Archetype 2 (Treble): Prismatic hyper-star resonator with magenta-teal facets
    float boxSize = 0.92 * w0 + 0.84 * w1 + 0.76 * w2;
    float boxBevel = 0.14 * w0 + 0.08 * w1 + 0.20 * w2;
    float sphereRad = 1.18 * w0 + 1.06 * w1 + 0.98 * w2;

    float cylRad = (0.42 + 0.18 * sin(g_turn * 1.5)) * w0
                 + (0.52 + 0.15 * sin(g_turn * 2.0 + p.z * 2.0)) * w1
                 + (0.62 + 0.10 * cos(g_turn * 3.0)) * w2;
    
    // Internal helical fluting along cylinder walls
    float fluting = 0.06 * g_boreWarp * sin(atan(p.y, p.x) * 6.0 + p.z * 4.0 + g_turn * 2.0);
    cylRad += fluting;

    float blendK = 0.09 * w0 + 0.06 * w1 + 0.03 * w2;

    // 1. Central CSG Box & Sphere Intersection
    float dBox = sdBox(p, vec3(boxSize), boxBevel);
    float dSph = sdSphere(p, sphereRad);
    float dBase = smax(dBox, dSph, blendK);

    // 2. Three orthogonal fluted cylinders with dynamic twists
    vec3 pCylX = rotY(PI * 0.5) * p;
    vec3 pCylY = rotX(PI * 0.5) * p;
    vec3 pCylZ = p;

    // Twist deformation along cylinder bores
    pCylX.xy = rot2D(pCylX.z * 1.5 * g_boreWarp) * pCylX.xy;
    pCylY.xy = rot2D(pCylY.z * 1.5 * g_boreWarp) * pCylY.xy;
    pCylZ.xy = rot2D(pCylZ.z * 1.5 * g_boreWarp) * pCylZ.xy;

    float dCylX = sdCylinder(pCylX, 2.6, cylRad);
    float dCylY = sdCylinder(pCylY, 2.6, cylRad);
    float dCylZ = sdCylinder(pCylZ, 2.6, cylRad);

    float dCyls = smin(dCylX, smin(dCylY, dCylZ, blendK), blendK);

    // Final CSG Nut
    float dNut = smax(dBase, -dCyls, blendK);

    // 3. Central Luminous Pulsar Core
    float coreRad = 0.32 + 0.08 * sin(g_turn * 4.0) + 0.12 * AUDIO_BEAT;
    float dCore = sdSphere(p, coreRad);

    // 4. Dynamic Orbiting Satellites with harmonic precession
    float orbDist = 1.35 + 0.38 * g_orbitReach + 0.15 * sin(g_turn * 2.0) + 0.20 * AUDIO_KICK;
    float satRad = 0.16 * w0 + 0.13 * w1 + 0.10 * w2 + 0.04 * AUDIO_HAT;

    // Orbiting motion: X pair precesses, Y pair bobs, Z pair counter-rotates
    vec3 pSatX1 = p - rotY(g_turn * 0.5) * rotZ( 0.4 * sin(g_turn)) * vec3( orbDist, 0.0, 0.0);
    vec3 pSatX2 = p - rotY(g_turn * 0.5) * rotZ(-0.4 * sin(g_turn)) * vec3(-orbDist, 0.0, 0.0);

    vec3 pSatY1 = p - rotX(g_turn * 0.6) * rotY( 0.4 * cos(g_turn)) * vec3(0.0,  orbDist, 0.0);
    vec3 pSatY2 = p - rotX(g_turn * 0.6) * rotY(-0.4 * cos(g_turn)) * vec3(0.0, -orbDist, 0.0);

    vec3 pSatZ1 = p - rotZ(g_turn * 0.8) * rotX( 0.4 * sin(g_turn * 1.5)) * vec3(0.0, 0.0,  orbDist);
    vec3 pSatZ2 = p - rotZ(g_turn * 0.8) * rotX(-0.4 * sin(g_turn * 1.5)) * vec3(0.0, 0.0, -orbDist);

    float dSat1 = min(sdSphere(pSatX1, satRad), sdSphere(pSatX2, satRad));
    float dSat2 = min(sdSphere(pSatY1, satRad), sdSphere(pSatY2, satRad));
    float dSat3 = min(sdSphere(pSatZ1, satRad), sdSphere(pSatZ2, satRad));
    float dSatellites = min(dSat1, min(dSat2, dSat3));

    // Secondary micro-satellites dancing around the orbital planes
    float subOrbDist = orbDist * 0.85;
    float subRad = satRad * 0.55;
    vec3 pSub1 = p - rotY(-g_turn * 0.75) * vec3(subOrbDist * 0.707,  subOrbDist * 0.707, 0.0);
    vec3 pSub2 = p - rotY(-g_turn * 0.75) * vec3(-subOrbDist * 0.707, -subOrbDist * 0.707, 0.0);
    vec3 pSub3 = p - rotX(-g_turn * 0.85) * vec3(0.0, subOrbDist * 0.707,  subOrbDist * 0.707);
    vec3 pSub4 = p - rotX(-g_turn * 0.85) * vec3(0.0, -subOrbDist * 0.707, -subOrbDist * 0.707);
    float dSubSat = min(min(sdSphere(pSub1, subRad), sdSphere(pSub2, subRad)),
                        min(sdSphere(pSub3, subRad), sdSphere(pSub4, subRad)));

    // Determine closest primitive and hit info
    HitInfo hit;
    hit.localPos = p;

    if (dCore < dNut && dCore < dSatellites && dCore < dSubSat) {
        hit.d = dCore;
        hit.matID = 3.0;
        hit.glowColor = mix(vec3(0.20, 0.90, 1.00), vec3(1.00, 0.25, 0.85), g_morphSel);
        hit.glowMask = 1.0;
    } else if (dSubSat < dNut && dSubSat < dSatellites) {
        hit.d = dSubSat;
        hit.matID = 2.5;
        hit.glowColor = neonPal(g_ph + 0.5);
        hit.glowMask = 0.9;
    } else if (dSatellites < dNut) {
        hit.d = dSatellites;
        hit.matID = 2.0;
        hit.glowColor = spectralPal(g_ph + 0.35 * g_morphSel);
        hit.glowMask = 0.85;
    } else {
        hit.d = dNut;
        hit.matID = 1.0;
        // Iridescent seam color that shifts around the geometry
        hit.glowColor = mix(vec3(0.15, 0.85, 1.00), vec3(1.00, 0.35, 0.75), 0.5 + 0.5 * sin(length(p) * 4.0 + g_turn));
        // Seam glow along bore rims and intersection ridges
        float boreLip = smoothstep(0.08, -0.02, dCyls + 0.03);
        float edgeBevel = smoothstep(0.05, -0.01, abs(dBox - dSph));
        hit.glowMask = max(boreLip, edgeBevel * 0.7);
    }

    return hit;
}

// Distance map for 4-tap tetrahedral normal
float mapD(vec3 p) {
    return sceneMap(p).d;
}

// 4-tap Tetrahedral Normal (Rule 18)
vec3 calcNormal(vec3 p) {
    const vec2 k = vec2(1.0, -1.0);
    const float eps = 0.0018;
    return normalize(
        k.xyy * mapD(p + k.xyy * eps) +
        k.yyx * mapD(p + k.yyx * eps) +
        k.yxy * mapD(p + k.yxy * eps) +
        k.xxx * mapD(p + k.xxx * eps)
    );
}

// Ray-Sphere bounding intersection for performance optimization
bool raySphereIntersect(vec3 ro, vec3 rd, float rad, out float tNear, out float tFar) {
    float b = dot(ro, rd);
    float c = dot(ro, ro) - rad * rad;
    float h = b * b - c;
    if (h < 0.0) return false;
    float sq = sqrt(h);
    tNear = max(0.0, -b - sq);
    tFar = -b + sq;
    return tFar > 0.0;
}

void main() {
    // Canonical preamble (Rule 19)
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    float r = length(uv);

    // Smooth bounded silhouette envelope
    float boundFade = 1.0 - smoothstep(0.42, 0.48, r);
    if (boundFade <= 0.0) {
        gl_FragColor = vec4(0.0);
        return;
    }

    // Time phase for seamless loop
    g_ph = fract(TIME / PERIOD);
    g_turn = g_ph * TAU;

    // Audio-reactive spectral balance selector (§12 Morph Style)
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;

    float sel = clamp((tilt - 0.5) * (1.6 + 3.4 * morph_sens) + morph_rest, 0.0, 1.0);
    sel = clamp(sel + 0.35 * (AUDIO_HAT - AUDIO_KICK) + 0.20 * AUDIO_SNARE, 0.0, 1.0);
    float live = smoothstep(0.01, 0.08, lo + md + hi);
    g_morphSel = mix(morph_rest, sel, live);

    // Audio parameter modulations
    g_boreWarp = bore_warp * (1.0 + 0.40 * AUDIO_MID);
    g_orbitReach = orbit_reach * (1.0 + 0.35 * AUDIO_TREBLE);
    g_beatSnap = AUDIO_BEAT;
    g_coreLume = core_lume * (0.65 + 0.85 * AUDIO_LEVEL + 0.65 * AUDIO_BEAT);

    // Camera setup with CAM_DIR & CAM_UP (Section 5)
    float sc = scale * (1.0 + 0.15 * AUDIO_BASS + 0.08 * AUDIO_KICK);
    const float ORBIT_DIST = 5.6;
    vec3 ro = CAM_DIR * (ORBIT_DIST / sc);
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.85 * ww);

    vec3 col = vec3(0.0);
    float alpha = 0.0;

    // Raymarching inside bounding sphere
    float maxSceneRadius = 2.4;
    float tNear, tFar;

    if (raySphereIntersect(ro, rd, maxSceneRadius, tNear, tFar)) {
        float t = tNear;
        HitInfo hit;
        bool hasHit = false;
        vec3 p = ro + rd * t;

        // 64-step raymarching loop (Budget Rule 17)
        for (int i = 0; i < 64; i++) {
            p = ro + rd * t;
            hit = sceneMap(p);
            if (hit.d < 0.0012) {
                hasHit = true;
                break;
            }
            t += hit.d * 0.88;
            if (t > tFar) break;
        }

        if (hasHit) {
            vec3 nor = calcNormal(p);
            vec3 viewDir = -rd;

            // Dual light setup: Key warm light, backlight fill
            vec3 lightDir1 = normalize(vec3( 0.65,  0.80, -0.60));
            vec3 lightDir2 = normalize(vec3(-0.70, -0.50,  0.65));

            float diff1 = max(dot(nor, lightDir1), 0.0);
            float diff2 = max(dot(nor, lightDir2), 0.0);
            float fresnel = pow(clamp(1.0 - dot(nor, viewDir), 0.0, 1.0), 3.2);

            vec3 refl1 = reflect(-lightDir1, nor);
            float spec1 = pow(max(dot(refl1, viewDir), 0.0), 28.0);
            vec3 refl2 = reflect(-lightDir2, nor);
            float spec2 = pow(max(dot(refl2, viewDir), 0.0), 16.0);

            // Base material shading
            vec3 albedo = vec3(0.05, 0.06, 0.08); // Dark titanium base
            vec3 emissive = vec3(0.0);

            if (hit.matID > 2.8) {
                // Central Plasma Core: intense radiant energy
                emissive = hit.glowColor * (3.2 * g_coreLume) + vec3(1.0) * (1.2 * g_beatSnap);
                albedo = emissive;
            } else if (hit.matID > 2.2) {
                // Micro Satellites: jewel beads
                vec3 beadTint = hit.glowColor;
                albedo = mix(vec3(0.20, 0.22, 0.28), beadTint, 0.60);
                emissive = beadTint * (1.8 * g_coreLume);
                spec1 *= 2.2;
            } else if (hit.matID > 1.5) {
                // Orbiting Primary Satellites: iridescent chrome with neon halo
                albedo = mix(vec3(0.12, 0.15, 0.20), hit.glowColor, 0.40);
                emissive = hit.glowColor * (1.8 * g_coreLume) * (0.3 + 0.7 * fresnel);
                spec1 *= 2.8;
            } else {
                // CSG Nut body: Obsidian titanium with vibrant glowing seam filigree
                vec3 seamCol = hit.glowColor * (2.2 * g_coreLume);
                albedo = mix(vec3(0.05, 0.06, 0.09), seamCol, hit.glowMask * 0.85);
                emissive = seamCol * hit.glowMask * 1.6;
                // Subtle chromatic iridescence along glancing normal angles
                albedo += neonPal(dot(nor, vec3(0.0, 1.0, 0.0)) * 0.5 + g_ph) * fresnel * 0.25;
            }

            // Lighting combine
            vec3 lit = albedo * (0.28 + 0.90 * diff1 * vec3(1.00, 0.95, 0.88) + 0.40 * diff2 * vec3(0.35, 0.65, 1.00));
            lit += spec1 * vec3(1.00, 0.98, 0.92) * 1.4;
            lit += spec2 * hit.glowColor * 0.8;
            lit += fresnel * mix(hit.glowColor, vec3(1.0), 0.40) * 1.5;
            lit += emissive;

            col = lit;
            alpha = 1.0;
        }

        // Volumetric core plasma halo and corona bloom
        float coreDist = r;
        float coreHalo = 0.0045 / (coreDist * coreDist + 0.0035) * g_coreLume;
        vec3 haloCol = mix(vec3(0.15, 0.85, 1.00), vec3(1.00, 0.25, 0.80), g_morphSel) * coreHalo;
        col += haloCol * (1.0 - alpha * 0.75);
        alpha = clamp(alpha + coreHalo * 0.50, 0.0, 1.0);
    }

    // High-contrast tonemap and bound
    col = col / (1.0 + col * 0.24);
    col = pow(col, vec3(0.90));

    alpha = clamp(alpha, 0.0, 1.0) * boundFade;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
