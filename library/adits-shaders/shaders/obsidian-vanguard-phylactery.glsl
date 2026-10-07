/*{
  "ADITS": 1,
  "DESCRIPTION": "A glossy obsidian reliquary hovering in 3D space, morphing spectrally between a heavy rib-caged armored vessel, a triple-ringed biomechanical sentinel, and a radiating crystal starburst.",
  "CREDIT": "gemini-2.5-pro (Jules)",
  "DATE": "2026-08-26",
  "CATEGORIES": ["generative", "3d", "audio", "morph"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "high",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "morph_gain",     "TYPE": "float", "DEFAULT": 0.82, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Morph Sensitivity" },
    { "NAME": "rest_form",      "TYPE": "float", "DEFAULT": 0.10, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Rest Archetype" },
    { "NAME": "core_pulse",     "TYPE": "float", "DEFAULT": 0.38, "MIN": 0.10, "MAX": 0.85,
      "LABEL": "Core Pulse", "BIND": "bass", "BIND_DEPTH": 0.55 },
    { "NAME": "articular_warp", "TYPE": "float", "DEFAULT": 0.35, "MIN": 0.05, "MAX": 0.80,
      "LABEL": "Articular Warp", "BIND": "mid", "BIND_DEPTH": 0.60 },
    { "NAME": "crystal_sheen",  "TYPE": "float", "DEFAULT": 0.40, "MIN": 0.10, "MAX": 0.95,
      "LABEL": "Crystal Sheen", "BIND": "treble", "BIND_DEPTH": 0.65 },
    { "NAME": "obsidian_color", "TYPE": "color", "DEFAULT": [0.02, 0.03, 0.05, 1.00],
      "LABEL": "Obsidian Tint" },
    { "NAME": "glow_color",     "TYPE": "color", "DEFAULT": [0.20, 0.75, 1.00, 1.00],
      "LABEL": "Energy Glow" }
  ]
}*/

#define TAU    6.28318530718
#define PERIOD 16.0
#define ORBIT  5.20
#define BOUND  1.20

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

float sdCylinder(vec3 p, vec2 h) {
    vec2 d = abs(vec2(length(p.xz), p.y)) - h;
    return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

float sdBox(vec3 p, vec3 b) {
    vec3 q = abs(p) - b;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

// Global morph state variables set in main
float g_w1, g_w2, g_w3;
float g_ph;
float g_coreR, g_ribW, g_ringR, g_shardL;

float map(vec3 p) {
    // Shared inner energy core
    float dCore = length(p) - g_coreR;

    // --- Archetype 1: Armored Reliquary Vessel (Heavy Ribs) ---
    float d1 = dCore;
    vec3 p1 = p;
    float a1 = atan(p1.z, p1.x + 1e-7);
    float sec1 = TAU / 6.0;
    a1 = mod(a1 + sec1 * 0.5, sec1) - sec1 * 0.5;
    a1 = abs(a1);
    vec3 pr1 = vec3(cos(a1) * length(p1.xz), p1.y, sin(a1) * length(p1.xz));

    // Outer shell ribs
    vec3 pRib = pr1 - vec3(0.52 * (1.0 + 0.1 * g_ribW), 0.0, 0.0);
    pR(pRib.xy, p1.y * 1.5 + sin(g_ph));
    float rib = sdBox(pRib, vec3(0.08 * g_ribW, 0.55, 0.06));
    rib = max(rib, length(p) - 0.72);
    rib = min(rib, length(p) - 0.22);
    d1 = smin(d1, rib, 0.08);

    // --- Archetype 2: Triple-Ringed Biomechanical Sentinel ---
    float d2 = dCore;
    vec3 p2 = p;

    // Ring 1
    vec3 prA = p2;
    pR(prA.xy, g_ph * 1.0);
    float r1 = sdCylinder(prA, vec2(0.62 * g_ringR, 0.035));
    r1 = max(r1, abs(length(prA.xz) - 0.62 * g_ringR) - 0.04);

    // Ring 2 (counter rotating)
    vec3 prB = p2;
    pR(prB.yz, -g_ph * 1.5);
    float r2 = sdCylinder(prB, vec2(0.50 * g_ringR, 0.030));
    r2 = max(r2, abs(length(prB.xz) - 0.50 * g_ringR) - 0.035);

    // Ring 3
    vec3 prC = p2;
    pR(prC.xz, g_ph * 2.0);
    float r3 = sdCylinder(prC, vec2(0.38 * g_ringR, 0.025));

    float sentinelRings = min(r1, min(r2, r3));

    // Articulated mandibles along circumference
    float a2 = atan(p2.z, p2.x + 1e-7);
    float sec2 = TAU / 8.0;
    a2 = mod(a2 + sec2 * 0.5, sec2) - sec2 * 0.5;
    a2 = abs(a2);
    vec3 pm2 = vec3(cos(a2) * length(p2.xz), p2.y, sin(a2) * length(p2.xz));
    vec3 pSpine = pm2 - vec3(0.68, 0.0, 0.0);
    float spine = sdBox(pSpine, vec3(0.04, 0.35, 0.03));

    d2 = smin(d2, min(sentinelRings, spine), 0.06);

    // --- Archetype 3: Radiating Crystal Starburst ---
    float d3 = dCore;
    vec3 p3 = p;
    float a3 = atan(p3.z, p3.x + 1e-7);
    float sec3 = TAU / 12.0;
    a3 = mod(a3 + sec3 * 0.5, sec3) - sec3 * 0.5;
    a3 = abs(a3);
    vec3 pr3 = vec3(cos(a3) * length(p3.xz), p3.y, sin(a3) * length(p3.xz));

    // Radiating razor blades/shards
    vec3 pShard = pr3 - vec3(0.35 + 0.25 * g_shardL, 0.0, 0.0);
    pR(pShard.xy, 0.785); // 45 degree tilt
    float shard = sdBox(pShard, vec3(0.28 * g_shardL, 0.02, 0.02));
    d3 = smin(d3, shard, 0.05);

    // Blend the 3 archetypes based on spectral kernel weights
    float dCombined = g_w1 * d1 + g_w2 * d2 + g_w3 * d3;
    return dCombined;
}

vec3 calcNormal(vec3 p) {
    const vec2 k = vec2(1.0, -1.0);
    const float e = 0.0016;
    return normalize(k.xyy * map(p + k.xyy * e) +
                     k.yyx * map(p + k.yyx * e) +
                     k.yxy * map(p + k.yxy * e) +
                     k.xxx * map(p + k.xxx * e));
}

// Studio environment for reflective obsidian gloss & sharp specular highlights
vec3 envObsidian(vec3 r) {
    float up = r.y;
    // Near-black dark ambient with horizon gradient
    vec3 bg = mix(vec3(0.01, 0.015, 0.025),
                  vec3(0.03, 0.05, 0.08),
                  smoothstep(-0.4, 0.8, up));

    // Sharp hot studio specular glints
    vec3 key1 = vec3(1.0, 0.97, 0.92) * pow(max(dot(r, normalize(vec3(0.4, 0.8, 0.5))), 0.0), 64.0) * 4.0;
    vec3 key2 = vec3(0.8, 0.9, 1.0) * pow(max(dot(r, normalize(vec3(-0.6, 0.4, -0.5))), 0.0), 32.0) * 1.5;

    return bg + key1 + key2;
}

void main() {
    // Canonical preamble: exact literal match required
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE) / RENDERSIZE.y;

    float r_uv = length(uv);
    float bound = smoothstep(0.478, 0.442, r_uv);
    if (bound <= 0.0) {
        gl_FragColor = vec4(0.0);
        return;
    }

    float ph = fract(TIME / PERIOD);
    g_ph = ph * TAU;

    // ---- Spectral Morph Selector ----
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum = lo + md + hi + 1e-3;
    float tiltS = (md * 0.5 + hi) / sum;
    float sel = clamp((tiltS - 0.5) * (1.6 + 3.4 * morph_gain) + 0.5, 0.0, 1.0);
    sel = clamp(sel + 0.35 * (AUDIO_HAT - AUDIO_KICK) + 0.15 * AUDIO_SNARE, 0.0, 1.0);
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest_form, sel, live);

    // Narrow triangular kernel weights sum to 1.0
    float w1 = clamp(1.0 - abs(sel)       / 0.33, 0.0, 1.0);
    float w2 = clamp(1.0 - abs(sel - 0.5) / 0.33, 0.0, 1.0);
    float w3 = clamp(1.0 - abs(sel - 1.0) / 0.33, 0.0, 1.0);
    float ws = w1 + w2 + w3 + 1e-4;
    g_w1 = w1 / ws;
    g_w2 = w2 / ws;
    g_w3 = w3 / ws;

    // Shared continuously sliding parameters across morph range
    g_coreR  = 0.18 + 0.10 * core_pulse + 0.06 * AUDIO_KICK;
    g_ribW   = 0.80 + 0.50 * core_pulse;
    g_ringR  = 0.85 + 0.40 * articular_warp;
    g_shardL = 0.70 + 0.60 * crystal_sheen + 0.40 * AUDIO_BEAT;

    // ---- Camera Construction ----
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.8 * ww);

    // Continuous slow hypnotic precession
    float tip = 0.25 * sin(g_ph);
    pR(ro.yz, tip);
    pR(rd.yz, tip);

    vec3 col = vec3(0.0);
    float alpha = 0.0;
    float near = 1e9;

    float tb0, tb1;
    if (sph(ro, rd, BOUND, tb0, tb1)) {
        float t = max(tb0, 0.02);
        bool hit = false;
        vec3 p = ro + rd * t;
        for (int i = 0; i < 56; i++) {
            p = ro + rd * t;
            float d = map(p);
            near = min(near, d / max(t, 0.5));
            if (d < 0.001) { hit = true; break; }
            t += d * 0.82;
            if (t > tb1) break;
        }

        if (hit) {
            vec3 n = calcNormal(p);
            vec3 refl = reflect(rd, n);
            float ndv = max(dot(n, -rd), 0.0);

            // Obsidian body: near-black base + specular reflection + thin fresnel rim
            vec3 env = envObsidian(refl);
            float fresnel = pow(1.0 - ndv, 4.0);

            // Core energy emission bleeding through seams
            float distToCore = length(p) - g_coreR;
            float seamGlow = smoothstep(0.15, 0.0, distToCore) * (1.0 + 2.0 * AUDIO_BEAT);

            col = obsidian_color.rgb
                + env * (0.2 + 0.8 * fresnel)
                + glow_color.rgb * (fresnel * 1.8 + seamGlow * 2.0);

            alpha = 1.0;
        }
    }

    // Energy halo sheath around object
    float ca = clamp(1.0 - near * 5.0, 0.0, 1.0);
    float sheath = (pow(ca, 6.0) * 0.20 + pow(ca, 24.0) * 0.50) * (1.0 - alpha);
    sheath *= smoothstep(0.44, 0.10, r_uv) * (0.30 + 0.70 * crystal_sheen) * (0.50 + 0.80 * AUDIO_BEAT);

    col += glow_color.rgb * sheath;
    alpha = clamp(alpha + sheath * 0.5, 0.0, 1.0);

    // Tone mapping and premultiply
    col = col / (1.0 + col * 0.35);
    col = pow(max(col, 0.0), vec3(0.90));
    alpha = clamp(alpha, 0.0, 1.0) * bound;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
