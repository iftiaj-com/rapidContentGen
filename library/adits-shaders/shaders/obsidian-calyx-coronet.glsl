/*{
  "ADITS": 1,
  "DESCRIPTION": "A biomechanical obsidian calyx enclosing a bio-luminescent core. Spectrally morphs from an armored pod to a flared coronet and an aggressive fanged crown as higher frequencies dominate.",
  "CREDIT": "gemini-2.5-pro (Jules)",
  "DATE": "2026-09-05",
  "CATEGORIES": ["generative", "3d", "audio", "morph", "biomech"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "high",
  "ASPECT": "square",
  "LOOP": 12.0,
  "INPUTS": [
    { "NAME": "morph_gain",  "TYPE": "float", "DEFAULT": 0.85, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Morph Sensitivity" },
    { "NAME": "rest_form",   "TYPE": "float", "DEFAULT": 0.15, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Rest Archetype" },
    { "NAME": "calyx_flare", "TYPE": "float", "DEFAULT": 0.40, "MIN": 0.10, "MAX": 0.85,
      "LABEL": "Calyx Flare", "BIND": "bass", "BIND_DEPTH": 0.50 },
    { "NAME": "spine_twist", "TYPE": "float", "DEFAULT": 0.35, "MIN": 0.05, "MAX": 0.80,
      "LABEL": "Spine Twist", "BIND": "mid", "BIND_DEPTH": 0.60 },
    { "NAME": "core_glow",   "TYPE": "float", "DEFAULT": 0.50, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Core Energy", "BIND": "treble", "BIND_DEPTH": 0.70 },
    { "NAME": "chitin_tint", "TYPE": "color", "DEFAULT": [0.08, 0.10, 0.16, 1.00],
      "LABEL": "Chitin Tint" },
    { "NAME": "vein_tint",   "TYPE": "color", "DEFAULT": [0.95, 0.20, 0.45, 1.00],
      "LABEL": "Core Vein Tint" }
  ]
}*/

#define TAU    6.28318530718
#define PERIOD 12.0
#define ORBIT  5.20
#define BOUND  1.22

void pR(inout vec2 p, float a) { p = cos(a) * p + sin(a) * vec2(p.y, -p.x); }

bool sph(vec3 ro, vec3 rd, float ra, out float t0, out float t1) {
    t0 = 0.0; t1 = 0.0;
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

float g_ph;
float g_flare;
float g_twist;
float g_k;
float g_petals;
float g_core_r;
float g_spine_ext;
float g_fang;

float map(vec3 p) {
    // 1. Central Bio-luminescent Core
    float d_core = length(p) - g_core_r;
    d_core += 0.012 * sin(p.y * 14.0 + g_ph);

    // 2. Calyx Petals / Armor Shell
    float phi = atan(p.z, p.x + 1e-7);
    float r_xz = length(p.xz);
    float sector = TAU / max(g_petals, 1.0);
    float an = mod(phi + sector * 0.5, sector) - sector * 0.5;
    an = abs(an); // Bilateral symmetry fold inside each sector cell

    vec2 p_sec = vec2(cos(an), sin(an)) * r_xz;
    vec3 p_cell = vec3(p_sec.x, p.y, p_sec.y);

    pR(p_cell.xz, p.y * g_twist);

    float y_norm = p_cell.y;
    float rad_profile = g_core_r + 0.14 + g_flare * smoothstep(-0.6, 0.6, y_norm) * (0.85 + 0.35 * sin(y_norm * 3.0 + g_ph));
    float thickness = 0.032 + 0.02 * (1.0 - min(abs(y_norm), 1.0));

    float d_shell = abs(length(p_cell.xz) - rad_profile) - thickness;
    float d_y = max(y_norm - 0.65 - 0.35 * g_spine_ext, -y_norm - 0.65);
    float d_petal = max(d_shell, d_y);

    float angular_mask = abs(p_cell.z) - (rad_profile * (0.28 + 0.16 * g_fang));
    d_petal = max(d_petal, angular_mask);

    vec3 p_spine = p_cell - vec3(rad_profile + thickness, 0.0, 0.0);
    float d_spine = length(p_spine.xz) - (0.022 + 0.022 * g_fang);
    d_spine = max(d_spine, d_y);

    d_petal = smin(d_petal, d_spine, 0.025);

    return smin(d_core, d_petal, g_k);
}

vec3 calcNormal(vec3 p) {
    const vec2 k = vec2(1.0, -1.0);
    const float e = 0.0015;
    return normalize(k.xyy * map(p + k.xyy * e) +
                     k.yyx * map(p + k.yyx * e) +
                     k.yxy * map(p + k.yxy * e) +
                     k.xxx * map(p + k.xxx * e));
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;
    float rr = length(uv);

    float bound = 1.0 - smoothstep(0.442, 0.478, rr);
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

    float w1 = clamp(1.0 - abs(sel)       / 0.35, 0.0, 1.0);
    float w2 = clamp(1.0 - abs(sel - 0.5) / 0.35, 0.0, 1.0);
    float w3 = clamp(1.0 - abs(sel - 1.0) / 0.35, 0.0, 1.0);
    float ws = w1 + w2 + w3 + 1e-4;
    w1 /= ws; w2 /= ws; w3 /= ws;

    g_flare     = w1 * 0.12 + w2 * 0.42 + w3 * 0.82;
    g_twist     = w1 * 0.40 + w2 * 1.10 + w3 * 2.10;
    g_k         = w1 * 0.16 + w2 * 0.07 + w3 * 0.025;
    g_petals    = w1 * 6.00 + w2 * 8.00 + w3 * 12.00;
    g_core_r    = w1 * 0.28 + w2 * 0.21 + w3 * 0.15;
    g_spine_ext = w1 * 0.10 + w2 * 0.50 + w3 * 0.95;
    g_fang      = w1 * 0.00 + w2 * 0.40 + w3 * 0.90;

    g_flare += calyx_flare * 0.35 + 0.25 * AUDIO_BASS;
    g_twist += spine_twist * 1.20 + 0.40 * AUDIO_MID;

    // ---- camera (guide 5) -------------------------------------------
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.8 * ww);

    float tip = 0.28 * sin(ph * TAU) + 0.22;
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
            near = min(near, d / max(t, 0.6));
            if (d < 0.0009) { hit = true; break; }
            t += d * 0.82;
            if (t > tb1) break;
        }

        if (hit) {
            vec3 n = calcNormal(p);
            vec3 lightDir = normalize(vec3(0.5, 0.8, 0.6));
            float diff = max(dot(n, lightDir), 0.0);
            float ndv = max(dot(n, -rd), 0.0);
            float fresnel = pow(1.0 - ndv, 3.0);

            vec3 h = normalize(lightDir - rd);
            float spec = pow(max(dot(n, h), 0.0), 48.0);

            vec3 refl = reflect(rd, n);
            vec3 env = mix(vec3(0.01, 0.015, 0.025), chitin_tint.rgb * 1.8, smoothstep(-0.2, 0.5, refl.y));
            env += vec3(1.0, 0.95, 0.90) * pow(max(dot(refl, lightDir), 0.0), 32.0) * 1.8;

            float core_dist = length(p) - g_core_r;
            float vein_emissive = (1.0 - smoothstep(0.0, 0.08, core_dist)) * (0.6 + 0.8 * core_glow) * (0.7 + 0.8 * AUDIO_BEAT);

            col = chitin_tint.rgb * (0.15 + 0.35 * diff)
                + env * (0.4 + 0.6 * fresnel)
                + vec3(1.0) * spec * 0.85
                + vein_tint.rgb * vein_emissive * 1.6;
            alpha = 1.0;
        }
    }

    // ---- bounded sheath glow (guide 8) ------------------------------
    float ca = clamp(1.0 - near * 4.8, 0.0, 1.0);
    float sheath = (pow(ca, 5.0) * 0.35 + pow(ca, 24.0) * 0.65) * (1.0 - alpha);
    sheath *= (1.0 - smoothstep(0.10, 0.48, rr)) * (0.4 + 0.8 * core_glow) * (0.6 + 0.8 * AUDIO_BEAT);
    col += vein_tint.rgb * sheath;
    alpha = clamp(alpha + sheath * 0.5, 0.0, 1.0);

    col = col / (1.0 + col * 0.32);
    col = pow(max(col, 0.0), vec3(0.95));
    alpha = clamp(alpha, 0.0, 1.0) * bound;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
