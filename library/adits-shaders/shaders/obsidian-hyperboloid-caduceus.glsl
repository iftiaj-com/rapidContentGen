/*{
  "ADITS": 1,
  "DESCRIPTION": "Intertwined obsidian biomech helix coiling within an articulated hyperboloid cage. Bass expands the central core, mid drives counter-rotational twist, and treble ignites glowing chitin veins.",
  "CREDIT": "gemini-2.5-pro (Jules)",
  "DATE": "2026-08-26",
  "CATEGORIES": ["generative", "3d", "audio", "morph"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "high",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "morph_gain", "TYPE": "float", "DEFAULT": 0.85, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Morph Sensitivity" },
    { "NAME": "rest_form",  "TYPE": "float", "DEFAULT": 0.00, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Rest Archetype" },
    { "NAME": "core_swell", "TYPE": "float", "DEFAULT": 0.38, "MIN": 0.10, "MAX": 0.75,
      "LABEL": "Core Swell", "BIND": "bass", "BIND_DEPTH": 0.50 },
    { "NAME": "twist_speed","TYPE": "float", "DEFAULT": 0.35, "MIN": 0.05, "MAX": 0.85,
      "LABEL": "Helix Twist", "BIND": "mid", "BIND_DEPTH": 0.60 },
    { "NAME": "glow_intensity", "TYPE": "float", "DEFAULT": 0.40, "MIN": 0.10, "MAX": 0.90,
      "LABEL": "Vein Glow", "BIND": "treble", "BIND_DEPTH": 0.70 },
    { "NAME": "obsidian_tint", "TYPE": "color", "DEFAULT": [0.03, 0.04, 0.07, 1.00],
      "LABEL": "Carapace Tint" },
    { "NAME": "vein_tint", "TYPE": "color", "DEFAULT": [0.15, 0.75, 1.00, 1.00],
      "LABEL": "Emissive Vein Tint" }
  ]
}*/

#define TAU    6.28318530718
#define PI     3.14159265359
#define PERIOD 16.0
#define ORBIT  4.80

void pR(inout vec2 p, float a) {
    p = cos(a) * p + sin(a) * vec2(p.y, -p.x);
}

float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
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

// Global morph SDF state set per-pixel in main
float g_core_r, g_helix_r, g_pitch, g_waist, g_flare, g_fin_len, g_smooth_k, g_ph;

float map(vec3 p) {
    // Smooth height tapering toward poles
    float y_norm = abs(p.y) / 0.85;
    float taper = smoothstep(1.1, 0.1, y_norm);

    // 1. Central Caduceus Double-Helix + Core Column
    float a_twist1 = p.y * g_pitch + g_ph;
    vec3 c1 = vec3(g_core_r * taper * cos(a_twist1), p.y, g_core_r * taper * sin(a_twist1));
    float d_h1 = length(p - c1) - g_helix_r * (0.35 + 0.65 * taper);

    float a_twist2 = a_twist1 + PI;
    vec3 c2 = vec3(g_core_r * taper * cos(a_twist2), p.y, g_core_r * taper * sin(a_twist2));
    float d_h2 = length(p - c2) - g_helix_r * (0.35 + 0.65 * taper);

    float d_cad = min(d_h1, d_h2);
    float d_spine = length(p.xz) - g_core_r * 0.42 * taper;
    float d_core = smin(d_cad, d_spine, g_smooth_k);

    // 2. Outer Hyperboloid Rib Cage (6-fold bilateral radial repetition)
    float sector = TAU / 6.0;
    float phi = atan(p.z, p.x + 1e-7);
    float a_sec = mod(phi + sector * 0.5, sector) - sector * 0.5;
    a_sec = abs(a_sec); // Bilateral symmetry inside sector avoids vertical seams

    vec2 q = vec2(length(p.xz), p.y);
    pR(q, a_sec);

    // Stacked hyperboloid rib rings
    float d_rings = 1e5;
    for (int i = -2; i <= 2; i++) {
        float y_i = float(i) * 0.32;
        float r_i = sqrt(g_waist * g_waist + y_i * y_i * g_flare) * taper;
        float d_r = length(vec2(q.x - r_i, q.y - y_i)) - 0.055 * (0.4 + 0.6 * taper);
        d_rings = min(d_rings, d_r);
    }

    // 3. Radial Wing Fins / Clasping Ribs
    float r_hyp = sqrt(g_waist * g_waist + p.y * p.y * g_flare) * taper;
    float d_fin_box = max(abs(q.y) - 0.78, max(q.x - (r_hyp + g_fin_len * taper), r_hyp - q.x));
    float d_fin_blade = max(d_fin_box, abs(q.y * 0.85 + (q.x - r_hyp) * 0.25) - 0.030 * taper);

    float d = smin(d_core, d_rings, g_smooth_k);
    d = smin(d, d_fin_blade, g_smooth_k * 0.75);

    // Smooth pole caps
    float d_pole_top = length(p - vec3(0.0, 0.78, 0.0)) - 0.07;
    float d_pole_bot = length(p - vec3(0.0, -0.78, 0.0)) - 0.07;
    d = smin(d, min(d_pole_top, d_pole_bot), 0.12);

    return d;
}

vec3 calcNormal(vec3 p) {
    const vec2 k = vec2(1.0, -1.0);
    const float e = 0.0012;
    return normalize(k.xyy * map(p + k.xyy * e) +
                     k.yyx * map(p + k.yyx * e) +
                     k.yxy * map(p + k.yxy * e) +
                     k.xxx * map(p + k.xxx * e));
}

float calcAO(vec3 p, vec3 n) {
    float occ = 0.0;
    float sca = 1.0;
    for (int i = 0; i < 4; i++) {
        float h = 0.015 + 0.05 * float(i);
        float d = map(p + h * n);
        occ += (h - d) * sca;
        sca *= 0.75;
    }
    return clamp(1.0 - 1.8 * occ, 0.0, 1.0);
}

void main() {
    // Canonical preamble (guide §7, rule 19)
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE) / RENDERSIZE.y;

    float rr = length(uv);
    float bound = smoothstep(0.478, 0.442, rr);
    if (bound <= 0.0) { gl_FragColor = vec4(0.0); return; }

    float ph = fract(TIME / PERIOD);
    g_ph = ph * TAU;

    // Spectral morph selector (guide §12)
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum = lo + md + hi + 1e-3;
    float tiltS = (md * 0.5 + hi) / sum;
    float sel = clamp((tiltS - 0.5) * (1.6 + 3.4 * morph_gain) + 0.5, 0.0, 1.0);
    sel = clamp(sel + 0.35 * (AUDIO_HAT - AUDIO_KICK) + 0.15 * AUDIO_SNARE, 0.0, 1.0);
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest_form, sel, live);

    // Narrow geometric kernel weights sum to 1.0
    float w1 = clamp(1.0 - abs(sel)       / 0.33, 0.0, 1.0);
    float w2 = clamp(1.0 - abs(sel - 0.5) / 0.33, 0.0, 1.0);
    float w3 = clamp(1.0 - abs(sel - 1.0) / 0.33, 0.0, 1.0);
    float ws = w1 + w2 + w3 + 1e-4;
    w1 /= ws; w2 /= ws; w3 /= ws;

    // Archetype parameters
    float swell = (0.85 + 0.45 * core_swell) * (0.96 + 0.04 * sin(g_ph));
    g_core_r   = (w1 * 0.20 + w2 * 0.14 + w3 * 0.08) * swell;
    g_helix_r  = (w1 * 0.11 + w2 * 0.08 + w3 * 0.05) * swell;
    g_pitch    = (w1 * 3.50 + w2 * 5.00 + w3 * 7.50) * (0.80 + 0.50 * twist_speed);
    g_waist    = (w1 * 0.28 + w2 * 0.40 + w3 * 0.55) * swell;
    g_flare    = w1 * 0.15 + w2 * 0.45 + w3 * 0.85;
    g_fin_len  = w1 * 0.02 + w2 * 0.12 + w3 * 0.38;
    g_smooth_k = w1 * 0.10 + w2 * 0.07 + w3 * 0.04;

    // Camera construction from CAM_DIR and CAM_UP (guide §5)
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.8 * ww);

    float tip = 0.22 * sin(g_ph);
    pR(ro.yz, tip);
    pR(rd.yz, tip);

    vec3 col = vec3(0.0);
    float alpha = 0.0;
    float near = 1e9;

    float tb0, tb1;
    if (sph(ro, rd, 1.15, tb0, tb1)) {
        float t = max(tb0, 0.02);
        bool hit = false;
        vec3 p = ro + rd * t;

        for (int i = 0; i < 64; i++) {
            p = ro + rd * t;
            float d = map(p);
            near = min(near, d / max(t, 0.5));
            if (d < 0.0008) { hit = true; break; }
            t += d * 0.65;
            if (t > tb1) break;
        }

        if (hit) {
            vec3 n = calcNormal(p);
            vec3 v = -rd;
            vec3 l = normalize(vec3(0.5, 0.8, 0.6));
            vec3 h = normalize(v + l);

            float ndl = max(dot(n, l), 0.0);
            float ndh = max(dot(n, h), 0.0);
            float ndv = max(dot(n, v), 0.0);

            float spec = pow(ndh, 36.0);
            float fresnel = pow(1.0 - ndv, 3.5);
            float ao = calcAO(p, n);

            // Chitin vein pattern along surface
            float phi_p = atan(p.z, p.x + 1e-7);
            float vein_m = smoothstep(0.025, 0.0, abs(sin(p.y * 16.0 + phi_p * 3.0 + g_ph)));
            vec3 emissive = vein_tint.rgb * vein_m * (0.5 + 1.5 * glow_intensity) * (0.8 + 0.8 * AUDIO_BEAT);

            vec3 col_body = obsidian_tint.rgb * (0.12 + 0.88 * ndl) * ao;
            vec3 col_rim = vec3(0.70, 0.85, 1.00) * fresnel * 1.6 * ao;
            vec3 col_spec = vec3(1.00, 0.98, 0.92) * spec * 2.8;

            col = col_body + col_rim + col_spec + emissive;
            alpha = 1.0;
        }
    }

    // Outer sheath glow from ray close approach
    float ca = clamp(1.0 - near * 4.8, 0.0, 1.0);
    float sheath = (pow(ca, 5.0) * 0.25 + pow(ca, 24.0) * 0.60) * (1.0 - alpha);
    sheath *= smoothstep(0.442, 0.10, rr) * (0.35 + 0.75 * glow_intensity) * (0.6 + 0.8 * AUDIO_BEAT);
    col += vein_tint.rgb * sheath;
    alpha = clamp(alpha + sheath * 0.50, 0.0, 1.0);

    // Tone mapping and premultiplication (guide §8)
    col = col / (1.0 + col * 0.35);
    col = pow(max(col, 0.0), vec3(0.90));
    alpha = clamp(alpha, 0.0, 1.0) * bound;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
