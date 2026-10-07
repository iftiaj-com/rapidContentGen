/*{
  "ADITS": 1,
  "DESCRIPTION": "A glossy obsidian sextant whose mechanical arc morphs spectrally: resting as an articulated heavy monolith, opening into a dual-vernier gimbal ring on mid frequencies, and blossoming into a radiant precision needle array on high transients.",
  "CREDIT": "gemini-2.5-pro (Jules)",
  "DATE": "2026-08-26",
  "CATEGORIES": ["generative", "3d", "audio", "morph", "biomech"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "high",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "morph_gain", "TYPE": "float", "DEFAULT": 0.85, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Morph Sensitivity" },
    { "NAME": "rest_form",  "TYPE": "float", "DEFAULT": 0.12, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Rest Archetype" },
    { "NAME": "arc_sweep",  "TYPE": "float", "DEFAULT": 0.40, "MIN": 0.10, "MAX": 0.80,
      "LABEL": "Arc Sweep", "BIND": "bass", "BIND_DEPTH": 0.50 },
    { "NAME": "vernier_spin", "TYPE": "float", "DEFAULT": 0.35, "MIN": 0.05, "MAX": 0.85,
      "LABEL": "Vernier Spin", "BIND": "mid", "BIND_DEPTH": 0.60 },
    { "NAME": "needle_flare", "TYPE": "float", "DEFAULT": 0.40, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Needle Flare", "BIND": "treble", "BIND_DEPTH": 0.70 },
    { "NAME": "chitin_tint", "TYPE": "color", "DEFAULT": [0.08, 0.10, 0.14, 1.00],
      "LABEL": "Chitin Tint" },
    { "NAME": "vein_tint",   "TYPE": "color", "DEFAULT": [0.15, 0.85, 0.95, 1.00],
      "LABEL": "Vein Tint" }
  ]
}*/

#define TAU    6.28318530718
#define PERIOD 16.0
#define ORBIT  4.80
#define BOUND  1.15

void pR(inout vec2 p, float a) { p = cos(a) * p + sin(a) * vec2(p.y, -p.x); }

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

float sdTorus(vec3 p, vec2 t) {
    vec2 q = vec2(length(p.xz) - t.x, p.y);
    return length(q) - t.y;
}

float sdBox(vec3 p, vec3 b) {
    vec3 q = abs(p) - b;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float sdCylinder(vec3 p, float h, float r) {
    vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h);
    return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

// Globals set by morph selector for map()
float g_ph;
float g_w1, g_w2, g_w3;
float g_arcR, g_arcThick, g_pivotR;
float g_veinIntensity;

float map(vec3 p) {
    float d1 = 0.0;
    float d2 = 0.0;
    float d3 = 0.0;

    // Archetype 1: Heavy Monolith Arc Sextant
    {
        vec3 p1 = p;
        pR(p1.xz, g_ph * 1.0);

        // Main arc frame
        float a1 = atan(p1.z, p1.x + 1e-7);
        // Sector cut for 60-degree sextant arc
        float arcSector = abs(a1) - (0.52 + 0.25 * arc_sweep);
        float dArc = max(sdTorus(p1, vec2(g_arcR, g_arcThick)), arcSector * g_arcR);

        // Center hub and index arm
        float dHub = sdCylinder(p1, g_arcThick * 1.6, g_pivotR);
        vec3 pArm = p1;
        pR(pArm.xz, sin(g_ph * 2.0) * 0.35);
        float dArm = sdBox(pArm - vec3(g_arcR * 0.5, 0.0, 0.0), vec3(g_arcR * 0.5, g_arcThick * 0.8, 0.025));

        d1 = smin(dArc, dHub, 0.04);
        d1 = smin(d1, dArm, 0.03);
    }

    // Archetype 2: Dual-Vernier Gimbal Ring
    {
        vec3 p2 = p;
        pR(p2.xz, g_ph * 2.0);
        pR(p2.yz, g_ph * 1.0 + vernier_spin * 2.0);

        float dOuterRing = sdTorus(p2, vec2(0.62, 0.032));

        vec3 pInner = p2;
        pR(pInner.xy, g_ph * 3.0);
        float dInnerRing = sdTorus(pInner, vec2(0.46, 0.024));

        // Vernier scale notches via radial repetition
        vec3 pNotch = p2;
        float aNotch = atan(pNotch.z, pNotch.x + 1e-7);
        float sec = TAU / 12.0;
        aNotch = mod(aNotch + sec * 0.5, sec) - sec * 0.5;
        aNotch = abs(aNotch);
        vec2 pNXZ = vec2(cos(aNotch), sin(aNotch)) * length(pNotch.xz);
        vec3 pN = vec3(pNXZ.x - 0.62, pNotch.y, pNXZ.y);
        float dNotch = sdBox(pN, vec3(0.015, 0.045, 0.015));

        d2 = smin(dOuterRing, dInnerRing, 0.05);
        d2 = max(d2, -dNotch);
    }

    // Archetype 3: Radiant Precision Needle Array
    {
        vec3 p3 = p;
        pR(p3.xz, g_ph * -2.0);

        // Core jewel
        float dJewel = length(p3) - (0.12 + 0.05 * needle_flare);

        // Radial array of needles
        float a3 = atan(p3.z, p3.x + 1e-7);
        float sec3 = TAU / 8.0;
        a3 = mod(a3 + sec3 * 0.5, sec3) - sec3 * 0.5;
        a3 = abs(a3);
        vec2 p3XZ = vec2(cos(a3), sin(a3)) * length(p3.xz);
        vec3 pNeedle = vec3(p3XZ.x - (0.38 + 0.15 * needle_flare), p3.y, p3XZ.y);

        // Tapered needle
        float dN = sdBox(pNeedle, vec3(0.22, 0.012, 0.012));

        d3 = smin(dJewel, dN, 0.04);
    }

    return d1 * g_w1 + d2 * g_w2 + d3 * g_w3;
}

vec3 calcNormal(vec3 p) {
    const vec2 k = vec2(1.0, -1.0);
    const float e = 0.0015;
    return normalize(k.xyy * map(p + k.xyy * e) +
                     k.yyx * map(p + k.yyx * e) +
                     k.yxy * map(p + k.yxy * e) +
                     k.xxx * map(p + k.xxx * e));
}

vec3 envObsidian(vec3 r, vec3 n, vec3 viewDir) {
    float up = r.y;
    vec3 c = mix(chitin_tint.rgb * 0.3,
                 chitin_tint.rgb * 2.2,
                 smoothstep(-0.4, 0.6, up));

    // Sharp specular key light
    vec3 lightDir = normalize(vec3(0.5, 0.8, 0.6));
    float spec = pow(max(dot(r, lightDir), 0.0), 64.0);
    c += vec3(1.0, 0.98, 0.92) * spec * 3.5;

    // Secondary rim fill
    vec3 rimLightDir = normalize(vec3(-0.6, 0.2, -0.5));
    float rimSpec = pow(max(dot(r, rimLightDir), 0.0), 24.0);
    c += vein_tint.rgb * rimSpec * 1.5;

    return c;
}

void main() {
    // Canonical Preamble
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;
    float rr = length(uv);

    // Absolute extent safety mask (guide 8, 10)
    float bound = smoothstep(0.478, 0.420, rr);
    if (bound <= 0.0) { gl_FragColor = vec4(0.0); return; }

    float ph = fract(TIME / PERIOD);
    g_ph = ph * TAU;

    // ---- Spectral Morph Selector (guide 12.2 - 12.4, 12.7) ----------
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum = lo + md + hi + 1e-3;
    float tiltS = (md * 0.5 + hi) / sum;
    float sel = clamp((tiltS - 0.5) * (1.6 + 3.4 * morph_gain) + 0.5, 0.0, 1.0);
    sel = clamp(sel + 0.38 * (AUDIO_HAT - AUDIO_KICK) + 0.18 * AUDIO_SNARE, 0.0, 1.0);
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest_form, sel, live);

    // Narrow triangular kernel weights
    float w1 = clamp(1.0 - abs(sel)       / 0.33, 0.0, 1.0);
    float w2 = clamp(1.0 - abs(sel - 0.5) / 0.33, 0.0, 1.0);
    float w3 = clamp(1.0 - abs(sel - 1.0) / 0.33, 0.0, 1.0);
    float ws = w1 + w2 + w3 + 1e-4;
    g_w1 = w1 / ws;
    g_w2 = w2 / ws;
    g_w3 = w3 / ws;

    // Shared morph properties
    g_arcR      = mix(0.55, 0.65, g_w2) * (0.95 + 0.10 * arc_sweep);
    g_arcThick  = mix(0.045, 0.028, g_w3);
    g_pivotR    = 0.10 + 0.05 * AUDIO_KICK;
    g_veinIntensity = 0.5 + 1.2 * needle_flare + 0.8 * AUDIO_BEAT;

    // ---- Camera setup (guide 5) -------------------------------------
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.8 * ww);

    float pitch = 0.25 * sin(g_ph) + 0.20;
    pR(ro.yz, pitch);
    pR(rd.yz, pitch);

    vec3  col   = vec3(0.0);
    float alpha = 0.0;
    float near  = 1e9;

    float tb0, tb1;
    if (sph(ro, rd, BOUND, tb0, tb1)) {
        float t = max(tb0, 0.02);
        bool hit = false;
        vec3 p = ro + rd * t;

        for (int i = 0; i < 64; i++) {
            p = ro + rd * t;
            float d = map(p);
            near = min(near, d / max(t, 0.5));
            if (d < 0.0010) { hit = true; break; }
            t += d * 0.80;
            if (t > tb1) break;
        }

        if (hit) {
            vec3 n = calcNormal(p);
            vec3 viewDir = -rd;
            vec3 refl = reflect(rd, n);
            float ndv = max(dot(n, viewDir), 0.0);

            // Obsidian fresnel rim reflection
            float fresnel = pow(1.0 - ndv, 3.5);
            vec3 baseEnv = envObsidian(refl, n, viewDir);

            // Internal glowing energy veins
            float veinPattern = sin(p.x * 20.0 + g_ph) * sin(p.y * 20.0) * sin(p.z * 20.0);
            float vein = smoothstep(0.70, 0.98, abs(veinPattern));
            vec3 veinCol = vein_tint.rgb * vein * g_veinIntensity * 2.5;

            col = baseEnv * mix(chitin_tint.rgb, vec3(1.0), fresnel * 0.7)
                + fresnel * vein_tint.rgb * 1.8
                + veinCol;

            alpha = 1.0;
        }
    }

    // ---- Bounded energy sheath / volumetric glow (guide 8) -----------
    float ca = clamp(1.0 - near * 4.8, 0.0, 1.0);
    float sheath = (pow(ca, 5.0) * 0.25 + pow(ca, 24.0) * 0.65) * (1.0 - alpha);
    sheath *= smoothstep(0.442, 0.10, rr) * (0.35 + 0.65 * needle_flare) * (0.50 + 0.90 * AUDIO_BEAT);
    col += vein_tint.rgb * sheath * 1.4;
    alpha = clamp(alpha + sheath * 0.50, 0.0, 1.0);

    // Premultiply & final tone mapping
    col = col / (1.0 + col * 0.30);
    col = pow(max(col, 0.0), vec3(0.92));
    alpha = clamp(alpha, 0.0, 1.0) * bound;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
