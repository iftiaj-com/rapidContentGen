/*{
  "ADITS": 1,
  "DESCRIPTION": "A suspended biomechanic thurible of high-gloss obsidian and lattice vents enclosing a burning plasma core. Morphs spectrally through four archetypes: monolithic censer, filigree lattice lantern, stellate ring censer, and needle corona thurible.",
  "CREDIT": "gemini-2.5-pro (Jules)",
  "DATE": "2026-08-26",
  "CATEGORIES": ["generative", "3d", "audio", "morph", "biomech"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "high",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "morph_gain",      "TYPE": "float", "DEFAULT": 0.82, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Morph Sensitivity" },
    { "NAME": "rest_form",       "TYPE": "float", "DEFAULT": 0.12, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Rest Archetype" },
    { "NAME": "lattice_density", "TYPE": "float", "DEFAULT": 6.0,  "MIN": 3.0,  "MAX": 12.0,
      "LABEL": "Lattice Density", "BIND": "mid", "BIND_DEPTH": 0.50 },
    { "NAME": "core_glow",       "TYPE": "float", "DEFAULT": 0.45, "MIN": 0.10, "MAX": 0.90,
      "LABEL": "Plasma Core", "BIND": "bass", "BIND_DEPTH": 0.60 },
    { "NAME": "rim_sharp",       "TYPE": "float", "DEFAULT": 0.50, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Obsidian Sheen", "BIND": "treble", "BIND_DEPTH": 0.55 },
    { "NAME": "obsidian_tint",   "TYPE": "color", "DEFAULT": [0.08, 0.10, 0.14, 1.00],
      "LABEL": "Obsidian Body" },
    { "NAME": "plasma_tint",     "TYPE": "color", "DEFAULT": [0.15, 0.85, 0.95, 1.00],
      "LABEL": "Plasma Core" }
  ]
}*/

#define TAU    6.28318530718
#define PERIOD 16.0
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

float g_wall, g_twist, g_flare, g_core_r, g_ph;

float map(vec3 p) {
    // Center floating plasma sphere core
    float d_core = length(p) - g_core_r;

    // Apply slow precession tilt and rotation for symmetry
    pR(p.xz, g_ph * 0.5);

    float r_xy = length(p.xz);
    // Radial angle with epsilon offset to prevent NaN at origin
    float a = atan(p.z, p.x + 1e-7);

    // Bilateral domain repetition across 6 main radial sectors
    float sector = TAU / 6.0;
    a = mod(a + sector * 0.5, sector) - sector * 0.5;
    a = abs(a);

    // Smooth double-conical thurible body taper
    float h = clamp(p.y, -0.45, 0.45);
    float taper = 1.0 - 2.5 * h * h;
    float body_profile = max(0.06, 0.38 * taper + g_flare * 0.08 * cos(h * 6.0 + g_ph));

    // Primary shell distance
    float d_shell = r_xy - body_profile;

    // Smoothly cap top and bottom to avoid thin raymarch steps near boundaries
    float d_caps = max(p.y - 0.42, -0.42 - p.y);
    d_shell = max(d_shell, d_caps);

    // Geometric lattice vent carving attenuated near caps
    float cap_fade = smoothstep(0.42, 0.25, abs(p.y));
    float latt_freq = max(lattice_density, 2.0);
    float lattice_pattern = cos(a * latt_freq + p.y * 5.0 + g_twist)
                          * sin(p.y * 8.0 - a * (latt_freq * 0.5)) * cap_fade;

    // Carve hollow interior and lattice vents
    float interior = -(r_xy - (body_profile - g_wall));
    d_shell = max(d_shell, interior);

    // Vent cutouts
    float vent_cut = lattice_pattern - 0.12;
    d_shell = max(d_shell, vent_cut * 0.10);

    // Support chain ribs bounded strictly to thurible body height
    vec2 rib_p = vec2(r_xy - body_profile, a);
    float d_ribs = max(length(rib_p) - 0.035, d_caps);

    float d_body = min(d_shell, d_ribs);

    return smin(d_body, d_core, 0.06);
}

vec3 calcNormal(vec3 p) {
    const vec2 k = vec2(1.0, -1.0);
    const float e = 0.0016;
    return normalize(k.xyy * map(p + k.xyy * e) +
                     k.yyx * map(p + k.yyx * e) +
                     k.yxy * map(p + k.yxy * e) +
                     k.xxx * map(p + k.xxx * e));
}

// Studio environment for high-gloss obsidian and specular reflections
vec3 envObsidian(vec3 r, vec3 n) {
    float up = r.y;
    // Dark glossy obsidian base with subtle ambient reflections
    vec3 col = mix(vec3(0.015, 0.020, 0.030),
                   obsidian_tint.rgb * 0.8,
                   smoothstep(-0.2, 0.6, up));

    // Key studio soft light
    vec3 key_dir = normalize(vec3(0.45, 0.80, 0.50));
    float key_spec = pow(max(dot(r, key_dir), 0.0), 48.0);
    col += vec3(0.95, 0.98, 1.00) * key_spec * (0.8 + 1.2 * rim_sharp);

    // Rim specular light
    vec3 rim_dir = normalize(vec3(-0.6, -0.3, -0.7));
    float rim_spec = pow(max(dot(r, rim_dir), 0.0), 24.0);
    col += plasma_tint.rgb * rim_spec * 0.6;

    return col;
}

void main() {
    // Canonical preamble (guide §7, rule 19)
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;
    float rr = length(uv);

    // Absolute extent cutoff (memory / guide §10)
    float bound = smoothstep(0.478, 0.442, rr);
    if (bound <= 0.0) { gl_FragColor = vec4(0.0); return; }

    float ph = fract(TIME / PERIOD);
    g_ph = ph * TAU;

    // ---- spectral morph selector (guide §12.2 - 12.4, 12.7) ----------
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum = lo + md + hi + 1e-3;
    float tiltS = (md * 0.5 + hi) / sum;
    float sel = clamp((tiltS - 0.5) * (1.6 + 3.4 * morph_gain) + 0.5, 0.0, 1.0);
    sel = clamp(sel + 0.35 * (AUDIO_HAT - AUDIO_KICK) + 0.18 * AUDIO_SNARE, 0.0, 1.0);
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest_form, sel, live);

    // Narrow blend kernel across 4 archetypes
    float w0 = clamp(1.0 - abs(sel - 0.00) / 0.28, 0.0, 1.0);
    float w1 = clamp(1.0 - abs(sel - 0.33) / 0.28, 0.0, 1.0);
    float w2 = clamp(1.0 - abs(sel - 0.66) / 0.28, 0.0, 1.0);
    float w3 = clamp(1.0 - abs(sel - 1.00) / 0.28, 0.0, 1.0);
    float ws = w0 + w1 + w2 + w3 + 1e-4;
    w0 /= ws; w1 /= ws; w2 /= ws; w3 /= ws;

    // Archetype parameters:
    // 0: Monolithic Censer (thick wall, minimal twist, compact)
    // 1: Filigree Lattice Lantern (thin wall, open twist, medium core)
    // 2: Stellate Ring Censer (flared rings, high twist, large core)
    // 3: Needle Corona Thurible (spiky flare, narrow core, thin ribs)
    g_wall   = w0 * 0.100 + w1 * 0.045 + w2 * 0.030 + w3 * 0.020;
    g_twist  = w0 * 0.000 + w1 * 1.500 + w2 * 3.140 + w3 * 4.700;
    g_flare  = w0 * 0.050 + w1 * 0.250 + w2 * 0.700 + w3 * 1.100;
    g_core_r = w0 * 0.120 + w1 * 0.180 + w2 * 0.220 + w3 * 0.150;

    // Audio modulation
    g_core_r *= (0.85 + 0.45 * core_glow) * (1.0 + 0.25 * AUDIO_KICK);
    g_flare  *= (0.90 + 0.20 * sin(g_ph));

    // ---- camera (guide §5) -------------------------------------------
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.8 * ww);

    // Gentle orbital wobble
    float tip = 0.20 * sin(g_ph);
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
            near = min(near, d / max(t, 0.5));
            if (d < 0.001) { hit = true; break; }
            t += d * 0.80;
            if (t > tb1) break;
        }

        if (hit) {
            vec3 n = calcNormal(p);
            vec3 refl = reflect(rd, n);
            float ndv = max(dot(n, -rd), 0.0);

            // Fresnel rim effect for obsidian material
            float fresnel = pow(1.0 - ndv, 3.0);

            // Shading obsidian surface with studio reflections
            vec3 body_col = envObsidian(refl, n);
            body_col += plasma_tint.rgb * fresnel * (0.8 + 1.2 * rim_sharp);

            // Plasma core illumination leaking through lattice
            float core_dist = length(p);
            float core_emission = smoothstep(g_core_r + 0.20, g_core_r, core_dist);
            vec3 core_col = plasma_tint.rgb * core_emission * (1.5 + 2.0 * AUDIO_BEAT);

            col = body_col + core_col;
            alpha = 1.0;
        }
    }

    // Bounded volumetric plasma sheath glow from ray miss (guide §8)
    float ca = clamp(1.0 - near * 4.8, 0.0, 1.0);
    float sheath = (pow(ca, 5.0) * 0.35 + pow(ca, 24.0) * 0.65) * (1.0 - alpha);
    sheath *= smoothstep(0.442, 0.12, rr) * (0.50 + 0.80 * core_glow) * (0.60 + 0.80 * AUDIO_BEAT);
    col += plasma_tint.rgb * sheath * 1.2;
    alpha = clamp(alpha + sheath * 0.60, 0.0, 1.0);

    // Tone map & premultiply
    col = col / (1.0 + col * 0.30);
    col = pow(max(col, 0.0), vec3(0.92));
    alpha = clamp(alpha, 0.0, 1.0) * bound;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
