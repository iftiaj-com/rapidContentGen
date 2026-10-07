/*{
  "ADITS": 1,
  "DESCRIPTION": "An obsidian biomech water-vessel that spectrally morphs between a bulbous ovoid pod, a flared dual-chambered clepsydra, and a crown-flared hydraulic sanctum.",
  "CREDIT": "gemini-2.5-pro (Jules)",
  "DATE": "2026-08-26",
  "CATEGORIES": ["generative", "3d", "audio", "morph", "biomech"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "high",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "morph_gain",     "TYPE": "float", "DEFAULT": 0.82, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Morph Sensitivity" },
    { "NAME": "rest_form",      "TYPE": "float", "DEFAULT": 0.15, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Rest Archetype" },
    { "NAME": "vessel_swell",   "TYPE": "float", "DEFAULT": 0.40, "MIN": 0.10, "MAX": 0.85,
      "LABEL": "Vessel Swell", "BIND": "bass", "BIND_DEPTH": 0.55 },
    { "NAME": "flute_twist",    "TYPE": "float", "DEFAULT": 0.35, "MIN": 0.05, "MAX": 0.80,
      "LABEL": "Flute Twist", "BIND": "mid", "BIND_DEPTH": 0.60 },
    { "NAME": "glow_intensity", "TYPE": "float", "DEFAULT": 0.45, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Core Glow", "BIND": "treble", "BIND_DEPTH": 0.70 },
    { "NAME": "obsidian_tint",   "TYPE": "color", "DEFAULT": [0.08, 0.10, 0.14, 1.00],
      "LABEL": "Obsidian Tint" },
    { "NAME": "emissive_tint",   "TYPE": "color", "DEFAULT": [0.12, 0.78, 1.00, 1.00],
      "LABEL": "Emissive Tint" }
  ]
}*/

#define TAU    6.28318530718
#define PERIOD 16.0
#define ORBIT  5.20
#define BOUND  1.15

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

// Global morph parameters set per frame in main()
float g_ph;
float g_waist;
float g_flare;
float g_rib_num;
float g_flute_d;
float g_core_r;

float mapCore(vec3 p) {
    return length(p) - g_core_r;
}

float mapVessel(vec3 p) {
    pR(p.xz, g_ph * 0.5);

    float y = p.y;
    float r_xz = length(p.xz);

    // Height capping via smooth spherical taper to avoid hard cuts
    float h_cap = 0.52 + 0.08 * g_flare;
    float y_norm = clamp(abs(y) / h_cap, 0.0, 1.0);
    float cap_taper = sqrt(max(1.0 - y_norm * y_norm, 1e-5));

    // Base radius curve along height
    float r_base = (0.28 + g_waist * 0.15 + g_flare * 0.22 * (y_norm * y_norm)) * cap_taper;

    // Radial flutes and biomech ribbing
    float sector = TAU / max(g_rib_num, 1.0);
    float angle = atan(p.z, p.x + 1e-7) + y * flute_twist * 2.0;
    angle = mod(angle + sector * 0.5, sector) - sector * 0.5;
    angle = abs(angle); // Bilateral symmetry inside each sector to eliminate seam discontinuities

    float rib = cos(angle * g_rib_num) * g_flute_d * cap_taper;
    float d_shell = (r_xz - (r_base + rib));

    // Cap top and bottom smoothly, hollow out interior vessel chamber
    float d_vessel = max(d_shell, abs(y) - h_cap);
    d_vessel = max(d_vessel, -(d_shell + 0.035));

    return d_vessel;
}

float map(vec3 p) {
    float d_core = mapCore(p);
    float d_vessel = mapVessel(p);
    return smin(d_vessel, d_core, 0.08);
}

vec3 calcNormal(vec3 p) {
    const vec2 k = vec2(1.0, -1.0);
    const float e = 0.0016;
    return normalize(k.xyy * map(p + k.xyy * e) +
                     k.yyx * map(p + k.yyx * e) +
                     k.yxy * map(p + k.yxy * e) +
                     k.xxx * map(p + k.xxx * e));
}

vec3 envObsidian(vec3 r, vec3 n) {
    float up = r.y;
    vec3 base = mix(obsidian_tint.rgb * 0.3, obsidian_tint.rgb * 1.5, smoothstep(-0.5, 0.8, up));

    // Key light specular highlight
    vec3 keyDir = normalize(vec3(0.5, 0.85, 0.6));
    float spec = pow(max(dot(r, keyDir), 0.0), 38.0);
    base += vec3(0.9, 0.95, 1.0) * spec * 2.5;

    // Secondary rim fill light
    vec3 fillDir = normalize(vec3(-0.6, -0.3, -0.5));
    float fill = pow(max(dot(r, fillDir), 0.0), 16.0);
    base += emissive_tint.rgb * fill * 0.6;

    return base;
}

void main() {
    // §7 canonical preamble: aspect-correct and resolution-independent
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;
    float rr = length(uv);

    // Bounding smoothstep reaching zero by 0.48 to prevent edge clipping (§10)
    float bound = smoothstep(0.478, 0.442, rr);
    if (bound <= 0.0) {
        gl_FragColor = vec4(0.0);
        return;
    }

    float ph = fract(TIME / PERIOD);
    g_ph = ph * TAU;

    // ---- Spectral morph selector (§12.2 - §12.4, §12.7) -----------------
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum = lo + md + hi + 1e-3;
    float tiltS = (md * 0.5 + hi) / sum;
    float sel = clamp((tiltS - 0.5) * (1.6 + 3.4 * morph_gain) + 0.5, 0.0, 1.0);
    sel = clamp(sel + 0.38 * (AUDIO_HAT - AUDIO_KICK) + 0.18 * AUDIO_SNARE, 0.0, 1.0);

    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest_form, sel, live);

    // Archetype weights from narrow triangular kernel
    float w1 = clamp(1.0 - abs(sel)       / 0.33, 0.0, 1.0); // Arch 1: Ovoid Pod Vessel
    float w2 = clamp(1.0 - abs(sel - 0.5) / 0.33, 0.0, 1.0); // Arch 2: Clepsydra Hourglass
    float w3 = clamp(1.0 - abs(sel - 1.0) / 0.33, 0.0, 1.0); // Arch 3: Hydraulic Crown Sanctum
    float ws = w1 + w2 + w3 + 1e-4;
    w1 /= ws; w2 /= ws; w3 /= ws;

    // Interpolate structural parameters continuously across morph range
    g_waist   = w1 * 0.40 + w2 * (-0.25) + w3 * 0.15;
    g_flare   = w1 * 0.05 + w2 * 0.55    + w3 * 0.85;
    g_rib_num = floor(w1 * 6.0 + w2 * 8.0 + w3 * 10.0 + 0.5);
    g_flute_d = w1 * 0.035 + w2 * 0.065 + w3 * 0.085;
    g_core_r  = (w1 * 0.14 + w2 * 0.18 + w3 * 0.22) * (1.0 + 0.25 * vessel_swell);

    // ---- Camera setup with CAM_DIR and CAM_UP (§5) ----------------------
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.8 * ww);

    // Gentle orbital pitch wobble tied strictly to canonical phase
    float pitch = 0.22 * sin(g_ph);
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
            if (d < 0.0006) {
                hit = true;
                break;
            }
            t += d * 0.75;
            if (t > tb1) break;
        }

        if (hit) {
            vec3 n = calcNormal(p);
            vec3 refl = reflect(rd, n);
            float ndv = max(dot(n, -rd), 0.0);

            // Obsidian shell shading
            vec3 bodyCol = envObsidian(refl, n);
            float fresnel = pow(1.0 - ndv, 3.5);
            bodyCol += emissive_tint.rgb * fresnel * (1.2 + 1.5 * glow_intensity);

            // Inner core emissive glow
            vec3 coreCol = emissive_tint.rgb * (1.8 + 2.2 * glow_intensity + 1.5 * AUDIO_BEAT);

            // Smooth blend factor between vessel shell and inner core
            float dCore = mapCore(p);
            float dVessel = mapVessel(p);
            float blend = clamp(0.5 + 0.5 * (dCore - dVessel) / 0.08, 0.0, 1.0);

            col = mix(coreCol, bodyCol, smoothstep(0.25, 0.75, blend));
            alpha = 1.0;
        }
    }

    // Volumetric halo sheath around closest ray approach (§8)
    float ca = clamp(1.0 - near * 5.0, 0.0, 1.0);
    float sheath = (pow(ca, 5.0) * 0.25 + pow(ca, 24.0) * 0.60) * (1.0 - alpha);
    sheath *= smoothstep(0.442, 0.08, rr) * (0.35 + 0.65 * glow_intensity) * (0.60 + 0.85 * AUDIO_BEAT);

    col += emissive_tint.rgb * sheath;
    alpha = clamp(alpha + sheath * 0.50, 0.0, 1.0);

    // Tone map and premultiply output
    col = col / (1.0 + col * 0.35);
    col = pow(max(col, 1e-5), vec3(0.90));
    alpha = clamp(alpha, 0.0, 1.0) * bound;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
