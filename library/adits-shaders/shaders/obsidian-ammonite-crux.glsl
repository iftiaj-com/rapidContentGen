/*{
  "ADITS": 1,
  "DESCRIPTION": "A glossy obsidian biomechanical ammonite crux with segmented whorls, pulsating energy septa, and articulated dorsal ribs. Spectral audio morphs it from a tight fossilized relic, to an arched ribbed turbine, to an open radiating biomech organism.",
  "CREDIT": "gemini-2.5-pro (Jules)",
  "DATE": "2026-08-26",
  "CATEGORIES": ["generative", "3d", "audio", "morph", "biomech"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "high",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "morph_gain",   "TYPE": "float", "DEFAULT": 0.85, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Morph Gain" },
    { "NAME": "rest_form",    "TYPE": "float", "DEFAULT": 0.15, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Rest Archetype" },
    { "NAME": "whorl_swell",  "TYPE": "float", "DEFAULT": 0.38, "MIN": 0.10, "MAX": 0.80,
      "LABEL": "Whorl Swell", "BIND": "bass", "BIND_DEPTH": 0.50 },
    { "NAME": "rib_spin",     "TYPE": "float", "DEFAULT": 0.35, "MIN": 0.05, "MAX": 0.85,
      "LABEL": "Rib Twist", "BIND": "mid", "BIND_DEPTH": 0.60 },
    { "NAME": "septa_glow",   "TYPE": "float", "DEFAULT": 0.40, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Septa Glow", "BIND": "treble", "BIND_DEPTH": 0.70 },
    { "NAME": "obsidian_tint", "TYPE": "color", "DEFAULT": [0.08, 0.10, 0.15, 1.00],
      "LABEL": "Obsidian Body" },
    { "NAME": "vein_tint",     "TYPE": "color", "DEFAULT": [0.15, 0.85, 0.95, 1.00],
      "LABEL": "Energy Septa" }
  ]
}*/

#define TAU    6.28318530718
#define PERIOD 16.0
#define ORBIT  4.80
#define BOUND  1.10

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

// Global parameters for SDF driven by selector and inputs
float g_ph;
float g_whorl;
float g_rib_freq;
float g_rib_depth;
float g_septa_open;
float g_core_r;
float g_spoke_w;
float g_scale;

float map(vec3 p) {
    p /= g_scale;

    // Central obsidian hub / core
    float r_p = length(p);
    float d_hub = r_p - g_core_r;
    float a_hub = atan(p.z, p.x + 1e-7);
    d_hub += 0.015 * cos(a_hub * 6.0 + g_ph) * cos(p.y * 12.0);

    // Spiral whorl tube (ammonite body)
    float r_xz = length(p.xz);
    float theta = atan(p.z, p.x + 1e-7);

    // Logarithmic spiral math: r = r0 * exp(b * theta)
    float b_factor = 0.16;
    float safe_r = max(r_xz, 0.06);
    float logR = log(safe_r);
    float u = (logR / b_factor - theta) / TAU;
    float n = floor(u + 0.5);
    float theta_cell = theta + n * TAU;
    float r_center = 0.18 * exp(b_factor * theta_cell);

    // Keep whorls within sensible bounds
    r_center = clamp(r_center, 0.12, 0.88);

    float tube_r = r_center * 0.32 * g_whorl;
    float d_tube = length(vec2(r_xz - r_center, p.y)) - tube_r;

    // Dorsal rib articulated ridges
    float rib_angle = theta_cell * g_rib_freq + g_ph * 2.0;
    float rib = cos(rib_angle);
    d_tube -= g_rib_depth * tube_r * rib * smoothstep(0.12, 0.75, r_xz);

    // Radial biomech crux spokes (for open archetypes)
    float d_spoke = 1e4;
    if (g_spoke_w > 0.001) {
        float sectors = 6.0;
        float sa = TAU / sectors;
        float an = atan(p.z, p.x + 1e-7) + g_ph * 0.25;
        an = mod(an + sa * 0.5, sa) - sa * 0.5;
        an = abs(an); // Enforce bilateral symmetry inside each sector to eliminate seam
        vec2 sp = vec2(cos(an), sin(an)) * r_xz;
        d_spoke = length(vec2(sp.y, p.y)) - g_spoke_w * (1.0 - smoothstep(0.15, 0.85, sp.x));
        d_spoke = max(d_spoke, r_p - 0.82);
        d_spoke = max(d_spoke, 0.18 - r_p);
    }

    float d = smin(d_hub, d_tube, 0.07);
    if (g_spoke_w > 0.001) {
        d = smin(d, d_spoke, 0.05);
    }

    return d * g_scale;
}

vec3 calcNormal(vec3 p) {
    const vec2 k = vec2(1.0, -1.0);
    const float e = 0.0015;
    return normalize(k.xyy * map(p + k.xyy * e) +
                     k.yyx * map(p + k.yyx * e) +
                     k.yxy * map(p + k.yxy * e) +
                     k.xxx * map(p + k.xxx * e));
}

// Glossy biomech studio lighting with hot specular and fresnel rim
vec3 envObsidian(vec3 r, vec3 n) {
    float up = r.y;
    vec3 baseCol = obsidian_tint.rgb;

    // Dark floor, high-contrast key rim reflection
    vec3 c = mix(baseCol * 0.2, baseCol * 1.5, smoothstep(-0.4, 0.5, up));

    // Studio key lights
    vec3 lightDir1 = normalize(vec3(0.5, 0.8, 0.6));
    vec3 lightDir2 = normalize(vec3(-0.6, -0.3, -0.5));

    float diff1 = max(dot(n, lightDir1), 0.0);
    float spec1 = pow(max(dot(r, lightDir1), 0.0), 48.0);
    float spec2 = pow(max(dot(r, lightDir2), 0.0), 24.0);

    c += vec3(0.9, 0.95, 1.0) * spec1 * 3.5;
    c += vein_tint.rgb * spec2 * 1.5;
    c += baseCol * diff1 * 0.8;
    return c;
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;
    float rr = length(uv);
    float bound = smoothstep(0.478, 0.442, rr);
    if (bound <= 0.0) { gl_FragColor = vec4(0.0); return; }

    float ph = fract(TIME / PERIOD);
    g_ph = ph * TAU;

    // Spectral morph selector (guide 12.2 - 12.4, 12.7)
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum = lo + md + hi + 1e-3;
    float tiltS = (md * 0.5 + hi) / sum;
    float sel = clamp((tiltS - 0.5) * (1.6 + 3.4 * morph_gain) + 0.5, 0.0, 1.0);
    sel = clamp(sel + 0.35 * (AUDIO_HAT - AUDIO_KICK) + 0.15 * AUDIO_SNARE, 0.0, 1.0);
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest_form, sel, live);

    // 3 Archetypes:
    // A1 (sel = 0.0): Fossilized Relic - tight whorl, dense ribs, closed hub
    // A2 (sel = 0.5): Ribbed Turbine - medium whorl, arched twist, partial spokes
    // A3 (sel = 1.0): Biomech Crux - expansive open whorl, 6-spoke crux, energy vents
    float w1 = clamp(1.0 - abs(sel)       / 0.35, 0.0, 1.0);
    float w2 = clamp(1.0 - abs(sel - 0.5) / 0.35, 0.0, 1.0);
    float w3 = clamp(1.0 - abs(sel - 1.0) / 0.35, 0.0, 1.0);
    float ws = w1 + w2 + w3 + 1e-4;
    w1 /= ws; w2 /= ws; w3 /= ws;

    g_whorl      = w1 * 0.80 + w2 * 1.10 + w3 * 1.35;
    g_rib_freq   = w1 * 14.0 + w2 * 20.0 + w3 * 8.0;
    g_rib_depth  = w1 * 0.25 + w2 * 0.45 + w3 * 0.15;
    g_septa_open = w1 * 0.20 + w2 * 0.50 + w3 * 1.00;
    g_core_r     = w1 * 0.22 + w2 * 0.16 + w3 * 0.10;
    g_spoke_w    = w1 * 0.00 + w2 * 0.04 + w3 * 0.08;
    g_scale      = w1 * 0.88 + w2 * 0.95 + w3 * 1.05;

    // Continuously modulate shared parameters with inputs & audio
    float swell = (0.92 + 0.16 * whorl_swell) * (0.98 + 0.02 * sin(g_ph));
    g_whorl *= swell;
    g_rib_freq += 4.0 * rib_spin * sin(g_ph);
    g_scale *= (0.95 + 0.10 * AUDIO_KICK);

    // Camera setup (guide 5)
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.8 * ww);

    // Precession tilt
    float tip = 0.25 * sin(g_ph) + 0.20;
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
            t += d * 0.80;
            if (t > tb1) break;
        }

        if (hit) {
            vec3 n = calcNormal(p);
            vec3 refl = reflect(rd, n);
            float ndv = max(dot(n, -rd), 0.0);

            // Fresnel rim and obsidian glossy lighting
            float fresnel = pow(1.0 - ndv, 3.5);
            vec3 envCol = envObsidian(refl, n);

            // Energy septa veins emissive pattern inside whorls
            float theta_p = atan(p.z, p.x + 1e-7);
            float septa_pattern = pow(abs(cos(theta_p * g_rib_freq * 0.5 + g_ph)), 8.0);
            vec3 septaEmissive = vein_tint.rgb * septa_pattern * g_septa_open * (0.8 + 1.8 * septa_glow) * (0.7 + 0.8 * AUDIO_BEAT);

            col = envCol + fresnel * vein_tint.rgb * 1.8 + septaEmissive;
            alpha = 1.0;
        }
    }

    // Bounded energy sheath glow around surface
    float ca = clamp(1.0 - near * 5.0, 0.0, 1.0);
    float sheath = (pow(ca, 5.0) * 0.35 + pow(ca, 24.0) * 0.65) * (1.0 - alpha);
    sheath *= smoothstep(0.442, 0.10, rr) * (0.35 + 0.65 * septa_glow) * (0.50 + 0.90 * AUDIO_BEAT);
    col += vein_tint.rgb * sheath;
    alpha = clamp(alpha + sheath * 0.50, 0.0, 1.0);

    // Tone mapping and premultiplication
    col = col / (1.0 + col * 0.30);
    col = pow(max(col, 0.0), vec3(0.92));
    alpha = clamp(alpha, 0.0, 1.0) * bound;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
