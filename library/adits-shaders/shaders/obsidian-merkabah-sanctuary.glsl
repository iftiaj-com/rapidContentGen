/*{
  "ADITS": 1,
  "DESCRIPTION": "A star-tetrahedral obsidian sanctuary floating in space, morphing from a fused geometric vault into an unfolded counter-rotating Merkabah cage exposing a glowing crystalline core.",
  "CREDIT": "gemini-2.5-pro (Jules)",
  "DATE": "2026-08-29",
  "CATEGORIES": ["generative", "3d", "audio", "morph"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "high",
  "ASPECT": "square",
  "LOOP": 12.0,
  "INPUTS": [
    { "NAME": "morph_gain",    "TYPE": "float", "DEFAULT": 0.85, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Morph Sensitivity" },
    { "NAME": "rest_form",     "TYPE": "float", "DEFAULT": 0.10, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Rest Archetype" },
    { "NAME": "carapace_warp", "TYPE": "float", "DEFAULT": 0.35, "MIN": 0.10, "MAX": 0.80,
      "LABEL": "Carapace Warp", "BIND": "bass", "BIND_DEPTH": 0.55 },
    { "NAME": "spin_rate",     "TYPE": "float", "DEFAULT": 0.40, "MIN": 0.10, "MAX": 0.90,
      "LABEL": "Counter Rotation", "BIND": "mid", "BIND_DEPTH": 0.60 },
    { "NAME": "fissure_glow",  "TYPE": "float", "DEFAULT": 0.45, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Fissure Glow", "BIND": "treble", "BIND_DEPTH": 0.70 },
    { "NAME": "obsidian_tint", "TYPE": "color", "DEFAULT": [0.12, 0.18, 0.28, 1.00],
      "LABEL": "Obsidian Tint" },
    { "NAME": "core_glow_col", "TYPE": "color", "DEFAULT": [0.15, 0.80, 1.00, 1.00],
      "LABEL": "Core Glow" }
  ]
}*/

#define TAU    6.28318530718
#define PERIOD 12.0
#define ORBIT  5.00
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

float sdOctahedron(vec3 p, float s) {
    p = abs(p);
    return (p.x + p.y + p.z - s) * 0.57735027;
}

float g_scale, g_stellation, g_core_size, g_carapace_open, g_spin_speed, g_k_blend, g_ph;

float map(vec3 p) {
    // 1. Core crystal nucleus
    float dCore = sdOctahedron(p, g_core_size * 1.2);

    // 2. Dual counter-rotating tetrahedra (Merkabah)
    vec3 p1 = p;
    vec3 p2 = p;
    float rotA = g_ph * 1.0 * g_spin_speed;
    float rotB = g_ph * 2.0 * g_spin_speed;
    pR(p1.xz, rotA);
    pR(p1.xy, rotA * 0.5);
    pR(p2.xz, -rotA);
    pR(p2.yz, -rotB * 0.5);

    float t1 = (max(max(p1.x + p1.y + p1.z, p1.x - p1.y - p1.z),
                    max(-p1.x + p1.y - p1.z, -p1.x - p1.y + p1.z)) - g_scale * g_stellation) * 0.57735;
    float t2 = (max(max(p2.x + p2.y - p2.z, p2.x - p2.y + p2.z),
                    max(-p2.x + p2.y + p2.z, -p2.x - p2.y - p2.z)) - g_scale * g_stellation) * 0.57735;

    float dStar = smin(t1, t2, g_k_blend);

    // Carapace wall shell
    float dShellInner = dStar + 0.040 + 0.08 * g_carapace_open;
    float dShell = max(dStar, -dShellInner);

    // Cut geometric portals/fissures into the carapace shell to expose the core
    float cutRadius = 0.08 + 0.26 * g_carapace_open;
    float dSlots1 = min(length(p1.xy), min(length(p1.yz), length(p1.zx))) - cutRadius;
    float dSlots2 = min(length(p2.xy), min(length(p2.yz), length(p2.zx))) - cutRadius;
    float dSlots = min(dSlots1, dSlots2);
    dShell = max(dShell, -dSlots);

    // 3. Orbital geometry ring
    vec3 pRing = p;
    pR(pRing.xy, g_ph * 1.0);
    pR(pRing.yz, g_ph * 1.0);
    float rxy = length(pRing.xy);
    float dRing = max(abs(rxy - g_scale * 1.25), abs(pRing.z)) - 0.020;

    float dMain = min(dShell, dCore);
    return smin(dMain, dRing, 0.020);
}

vec3 calcNormal(vec3 p) {
    const vec2 k = vec2(1.0, -1.0);
    const float e = 0.0015;
    return normalize(k.xyy * map(p + k.xyy * e) +
                     k.yyx * map(p + k.yyx * e) +
                     k.yxy * map(p + k.yxy * e) +
                     k.xxx * map(p + k.xxx * e));
}

vec3 envObsidian(vec3 r, vec3 n) {
    float up = r.y;
    vec3 baseCol = mix(vec3(0.02, 0.03, 0.05), obsidian_tint.rgb, 0.65);
    vec3 skyLight = baseCol * (0.5 + 0.5 * up);
    skyLight += vec3(0.9, 0.96, 1.0) * pow(max(dot(r, normalize(vec3(0.4, 0.8, 0.5))), 0.0), 48.0) * 4.0;
    skyLight += core_glow_col.rgb * pow(max(dot(r, normalize(vec3(-0.5, 0.4, -0.6))), 0.0), 16.0) * 1.5;
    return skyLight;
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;
    float rr = length(uv);
    float bound = smoothstep(0.478, 0.442, rr);
    if (bound <= 0.0) { gl_FragColor = vec4(0.0); return; }

    float ph = fract(TIME / PERIOD);
    g_ph = ph * TAU;

    // ---- spectral morph selector (guide 12.2 - 12.4, 12.7) ----------
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum = lo + md + hi + 1e-3;
    float tiltS = (md * 0.5 + hi) / sum;
    float sel = clamp((tiltS - 0.5) * (1.6 + 3.4 * morph_gain) + 0.5, 0.0, 1.0);
    sel = clamp(sel + 0.38 * (AUDIO_HAT - AUDIO_KICK) + 0.18 * AUDIO_SNARE, 0.0, 1.0);
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest_form, sel, live);

    float w1 = clamp(1.0 - abs(sel)       / 0.33, 0.0, 1.0);
    float w2 = clamp(1.0 - abs(sel - 0.5) / 0.33, 0.0, 1.0);
    float w3 = clamp(1.0 - abs(sel - 1.0) / 0.33, 0.0, 1.0);
    float ws = w1 + w2 + w3 + 1e-4;
    w1 /= ws; w2 /= ws; w3 /= ws;

    // Archetype parameters:
    // w1: Vault (fused, heavy carapace with slit fissures)
    // w2: Merkabah (balanced star stellation, counter-rotating)
    // w3: Prismatic Core (flared open, wide portals exposing crystal nucleus)
    g_scale         = w1 * 0.620 + w2 * 0.700 + w3 * 0.780;
    g_stellation    = w1 * 0.850 + w2 * 1.080 + w3 * 1.320;
    g_core_size     = w1 * 0.160 + w2 * 0.220 + w3 * 0.290;
    g_carapace_open = w1 * 0.080 + w2 * 0.480 + w3 * 0.920;
    g_k_blend       = w1 * 0.150 + w2 * 0.070 + w3 * 0.020;

    // Shared continuous audio modulations
    float warpMod = (0.92 + 0.16 * carapace_warp) * (0.98 + 0.04 * sin(g_ph * 1.0));
    g_scale      *= warpMod;
    g_stellation *= warpMod * (0.95 + 0.10 * AUDIO_KICK);
    g_spin_speed  = (0.50 + 0.80 * spin_rate);

    // ---- camera (guide 5) -------------------------------------------
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.8 * ww);

    float tip = 0.25 * sin(g_ph * 1.0) + 0.20;
    pR(ro.yz, tip);
    pR(rd.yz, tip);

    vec3  col   = vec3(0.0);
    float alpha = 0.0;
    float near  = 1e9;

    float tb0, tb1;
    if (sph(ro, rd, BOUND, tb0, tb1)) {
        float t = max(tb0, 0.02);
        bool hit = false;
        vec3 p = ro + rd * t;
        for (int i = 0; i < 56; i++) {
            p = ro + rd * t;
            float d = map(p);
            near = min(near, d / max(t, 0.6));
            if (d < 0.0009) { hit = true; break; }
            t += d * 0.80;
            if (t > tb1) break;
        }

        if (hit) {
            vec3 n = calcNormal(p);
            vec3 refl = reflect(rd, n);
            float ndv = max(dot(n, -rd), 0.0);

            // Shading: Obsidian dark body + specular rim light + inner core glow
            vec3 env = envObsidian(refl, n);
            float rim = pow(1.0 - ndv, 3.0);
            float spec = pow(max(dot(refl, normalize(vec3(0.4, 0.8, 0.5))), 0.0), 40.0);

            // Distance to core for emissive crystal lighting
            float dC = sdOctahedron(p, g_core_size * 1.2);
            float coreEmissive = smoothstep(0.18, 0.0, dC) * (0.8 + 1.4 * fissure_glow) * (0.7 + 0.8 * AUDIO_BEAT);

            col = env * (0.30 + 0.70 * rim)
                + vec3(0.92, 0.96, 1.0) * spec * 3.0
                + core_glow_col.rgb * coreEmissive * 3.2
                + obsidian_tint.rgb * rim * 1.5;

            alpha = 1.0;
        }
    }

    // ---- bounded sheath from closest approach (guide 8) --------------
    float ca = clamp(1.0 - near * 5.2, 0.0, 1.0);
    float sheath = (pow(ca, 6.0) * 0.25 + pow(ca, 24.0) * 0.65) * (1.0 - alpha);
    sheath *= smoothstep(0.442, 0.10, rr) * (0.40 + 0.60 * fissure_glow) * (0.55 + 0.85 * AUDIO_BEAT);
    col += core_glow_col.rgb * sheath;
    alpha = clamp(alpha + sheath * 0.52, 0.0, 1.0);

    col = col / (1.0 + col * 0.35);
    col = pow(max(col, 0.0), vec3(0.90));
    alpha = clamp(alpha, 0.0, 1.0) * bound;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
