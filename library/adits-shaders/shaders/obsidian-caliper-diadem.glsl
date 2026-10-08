/*{
  "ADITS": 1,
  "DESCRIPTION": "An obsidian biomech diadem with articulated caliper jaws and a glowing central core. Spectrally morphs between a compact pod vessel, an articulated caliper crown, and a flared biomech diadem.",
  "CREDIT": "gemini-2.5-pro (Jules)",
  "DATE": "2026-08-26",
  "CATEGORIES": ["generative", "3d", "audio", "morph"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "high",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "morph_gain",    "TYPE": "float", "DEFAULT": 0.85, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Morph Sensitivity" },
    { "NAME": "rest_form",     "TYPE": "float", "DEFAULT": 0.10, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Rest Archetype" },
    { "NAME": "jaw_opening",   "TYPE": "float", "DEFAULT": 0.35, "MIN": 0.10, "MAX": 0.85,
      "LABEL": "Jaw Opening", "BIND": "bass", "BIND_DEPTH": 0.50 },
    { "NAME": "crown_flare",   "TYPE": "float", "DEFAULT": 0.40, "MIN": 0.10, "MAX": 0.90,
      "LABEL": "Crown Flare", "BIND": "mid", "BIND_DEPTH": 0.60 },
    { "NAME": "pulse_glow",    "TYPE": "float", "DEFAULT": 0.50, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Pulse Glow", "BIND": "treble", "BIND_DEPTH": 0.70 },
    { "NAME": "carapace_tint", "TYPE": "color", "DEFAULT": [0.12, 0.14, 0.18, 1.00],
      "LABEL": "Carapace Tint" },
    { "NAME": "core_tint",     "TYPE": "color", "DEFAULT": [0.95, 0.35, 0.12, 1.00],
      "LABEL": "Core Tint" }
  ]
}*/

#define TAU    6.28318530718
#define PERIOD 16.0
#define ORBIT  5.20
#define BOUND  1.20

void pR(inout vec2 p, float a) {
    p = cos(a) * p + sin(a) * vec2(p.y, -p.x);
}

bool sph(vec3 ro, vec3 rd, float ra, out float t0, out float t1) {
    t0 = 0.0;
    t1 = 0.0;
    float b = dot(ro, rd);
    float c = dot(ro, ro) - ra * ra;
    float h = b * b - c;
    if (h < 0.0) return false;
    h = sqrt(h);
    t0 = -b - h;
    t1 = -b + h;
    return t1 > 0.0;
}

float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
}

// Global morph parameters computed in main
float g_ph;
float g_arch_k;
float g_jaw_ext;
float g_flare_rad;
float g_core_r;
float g_sub_count;

float map(vec3 p) {
    // Shared core sphere (nucleus)
    float dCore = length(p) - g_core_r;

    // Radial domain repetition around Y axis
    float sector = TAU / g_sub_count;
    float angle = atan(p.z, p.x + 1e-7); // Epsilon offset prevents origin NaN
    angle = mod(angle + sector * 0.5, sector) - sector * 0.5;
    angle = abs(angle); // Bilateral symmetry in sector

    float rXZ = length(p.xz);
    vec3 pSec = vec3(cos(angle) * rXZ, p.y, sin(angle) * rXZ);

    // Archetype 0: Pod carapace ribs
    vec3 pPod = pSec;
    pPod.x -= g_flare_rad * 0.5;
    pR(pPod.xy, 0.4 + 0.3 * sin(pPod.y * 3.0 + g_ph));
    float dPod = length(pPod.xz) - (0.12 + 0.05 * cos(pPod.y * 4.0));
    dPod = max(dPod, abs(pPod.y) - 0.70);

    // Archetype 1: Articulated Caliper Jaws
    vec3 pCal = pSec;
    pCal.x -= g_flare_rad * (0.8 + 0.4 * g_jaw_ext);
    pR(pCal.xy, -0.6 * g_jaw_ext + 0.2 * sin(pCal.y * 5.0));
    // Tapered mandible blade
    float dCal = length(vec2(pCal.x * 1.5, pCal.z)) - (0.10 - 0.08 * (pCal.y + 0.5));
    dCal = max(dCal, abs(pCal.y) - 0.65);
    // Inner serration ribs
    float serr = 0.02 * sin(pCal.y * 24.0);
    dCal += serr;

    // Archetype 2: Flared Biomech Crown Crests
    vec3 pCrest = pSec;
    pCrest.x -= g_flare_rad * 1.3;
    pR(pCrest.xy, 0.85);
    float dCrest = length(vec2(pCrest.x, pCrest.z * 1.8)) - (0.08 + 0.06 * pCrest.y);
    dCrest = max(dCrest, abs(pCrest.y) - 0.80);

    // Smooth blend between elements
    float dCarapace = smin(dPod, dCal, g_arch_k);
    dCarapace = smin(dCarapace, dCrest, g_arch_k);

    return smin(dCore, dCarapace, g_arch_k * 0.8);
}

vec3 calcNormal(vec3 p) {
    const vec2 k = vec2(1.0, -1.0);
    const float e = 0.0015;
    return normalize(k.xyy * map(p + k.xyy * e) +
                     k.yyx * map(p + k.yyx * e) +
                     k.yxy * map(p + k.yxy * e) +
                     k.xxx * map(p + k.xxx * e));
}

// Studio environment map for glossy obsidian reflection
vec3 envObsidian(vec3 r) {
    float up = r.y;
    // Dark metallic sheen with sharp horizon glint
    vec3 baseCol = mix(vec3(0.01, 0.01, 0.02),
                       carapace_tint.rgb * 0.8,
                       smoothstep(-0.2, 0.5, up));
    // Horizon glint
    baseCol += vec3(0.9, 0.95, 1.0) * smoothstep(0.05, 0.0, abs(up - 0.02)) * 0.9;
    // Key light highlight
    vec3 keyDir = normalize(vec3(0.5, 0.8, 0.5));
    baseCol += vec3(1.0, 0.98, 0.92) * pow(max(dot(r, keyDir), 0.0), 64.0) * 3.5;
    // Fill light
    vec3 fillDir = normalize(vec3(-0.6, -0.3, -0.5));
    baseCol += core_tint.rgb * pow(max(dot(r, fillDir), 0.0), 16.0) * 0.8;
    return baseCol;
}

void main() {
    // Canonical preamble (Guide §7)
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;
    float rr = length(uv);

    // Hard outer border falloff (Guide §10, §13)
    float boundMask = smoothstep(0.478, 0.442, rr);
    if (boundMask <= 0.0) {
        gl_FragColor = vec4(0.0);
        return;
    }

    // Strict loop phase (Guide §10)
    float ph = fract(TIME / PERIOD);
    g_ph = ph * TAU;

    // Spectral morph selector (Guide §12.2 - 12.4)
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum = lo + md + hi + 1e-3;
    float tiltS = (md * 0.5 + hi) / sum;
    float sel = clamp((tiltS - 0.5) * (1.6 + 3.4 * morph_gain) + 0.5, 0.0, 1.0);
    sel = clamp(sel + 0.35 * (AUDIO_HAT - AUDIO_KICK) + 0.20 * AUDIO_BEAT, 0.0, 1.0);
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest_form, sel, live);

    // Archetype blend weights (Guide §12.6)
    float w1 = clamp(1.0 - abs(sel)       / 0.33, 0.0, 1.0);
    float w2 = clamp(1.0 - abs(sel - 0.5) / 0.33, 0.0, 1.0);
    float w3 = clamp(1.0 - abs(sel - 1.0) / 0.33, 0.0, 1.0);
    float ws = w1 + w2 + w3 + 1e-4;
    w1 /= ws; w2 /= ws; w3 /= ws;

    // Interpolate morph parameters
    g_arch_k    = w1 * 0.15 + w2 * 0.08 + w3 * 0.04;
    g_jaw_ext   = (w1 * 0.2 + w2 * 0.85 + w3 * 0.5) * (0.8 + 0.4 * jaw_opening);
    g_flare_rad = (w1 * 0.35 + w2 * 0.52 + w3 * 0.75) * (0.8 + 0.4 * crown_flare);
    g_core_r    = w1 * 0.25 + w2 * 0.18 + w3 * 0.12;
    g_sub_count = floor(w1 * 6.0 + w2 * 8.0 + w3 * 12.0 + 0.5);

    // Camera setup driven by CAM_DIR and CAM_UP (Guide §5)
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.8 * ww);

    // Gentle orbital pitch wobble
    float pitch = 0.25 * sin(g_ph);
    pR(ro.yz, pitch);
    pR(rd.yz, pitch);

    vec3 col = vec3(0.0);
    float alpha = 0.0;
    float near = 1e9;

    float tb0, tb1;
    if (sph(ro, rd, BOUND, tb0, tb1)) {
        float t = max(tb0, 0.02);
        bool hit = false;
        vec3 p = ro + rd * t;

        // Raymarch loop (60 steps)
        for (int i = 0; i < 60; i++) {
            p = ro + rd * t;
            float d = map(p);
            near = min(near, d / max(t, 0.5));
            if (d < 0.001) {
                hit = true;
                break;
            }
            t += d * 0.82;
            if (t > tb1) break;
        }

        if (hit) {
            vec3 n = calcNormal(p);
            vec3 refl = reflect(rd, n);
            float ndv = max(dot(n, -rd), 0.0);

            // Obsidian surface shading: Key reflection + Fresnel rim
            vec3 env = envObsidian(refl);
            float fresnel = pow(1.0 - ndv, 3.5);

            // Core energy glow bleeding from deep internal surfaces
            float internalGlow = smoothstep(0.35, 0.0, length(p) - g_core_r);
            vec3 emissive = core_tint.rgb * (1.5 + 2.5 * pulse_glow) * (0.6 + 0.8 * AUDIO_BEAT);

            col = mix(carapace_tint.rgb * 0.2, env, 0.75)
                + vec3(1.0) * fresnel * 0.8
                + emissive * internalGlow;

            alpha = 1.0;
        }
    }

    // Volumetric core sheath from ray's closest approach
    float ca = clamp(1.0 - near * 4.5, 0.0, 1.0);
    float sheath = (pow(ca, 5.0) * 0.35 + pow(ca, 20.0) * 0.65) * (1.0 - alpha);
    sheath *= smoothstep(0.442, 0.10, rr) * (0.4 + 0.6 * pulse_glow) * (0.5 + 0.9 * AUDIO_BEAT);

    col += core_tint.rgb * sheath;
    alpha = clamp(alpha + sheath * 0.6, 0.0, 1.0);

    // Tone mapping & alpha premultiplication (Guide §8)
    col = col / (1.0 + col * 0.30);
    col = pow(max(col, 0.0), vec3(0.92));

    alpha = clamp(alpha, 0.0, 1.0) * boundMask;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
