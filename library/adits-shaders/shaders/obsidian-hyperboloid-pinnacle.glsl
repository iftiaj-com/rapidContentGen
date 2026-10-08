/*{
  "ADITS": 1,
  "DESCRIPTION": "A double-ruled obsidian hyperboloid with flared end-caps and an inner emissive core. Morphing from a monolithic ribbed cage to an open helical lattice and spiked crown pinnacles.",
  "CREDIT": "gemini-2.5-pro (Jules)",
  "DATE": "2026-08-27",
  "CATEGORIES": ["generative", "3d", "audio", "morph"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "high",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "morph_gain",  "TYPE": "float", "DEFAULT": 0.82, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Morph Sensitivity" },
    { "NAME": "rest_form",   "TYPE": "float", "DEFAULT": 0.15, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Rest Archetype" },
    { "NAME": "waist",       "TYPE": "float", "DEFAULT": 0.38, "MIN": 0.15, "MAX": 0.65,
      "LABEL": "Waist Compression", "BIND": "bass", "BIND_DEPTH": 0.50 },
    { "NAME": "twist",       "TYPE": "float", "DEFAULT": 0.40, "MIN": 0.10, "MAX": 0.80,
      "LABEL": "Helical Twist", "BIND": "mid", "BIND_DEPTH": 0.60 },
    { "NAME": "spike",       "TYPE": "float", "DEFAULT": 0.30, "MIN": 0.05, "MAX": 0.80,
      "LABEL": "Rim Sharpness", "BIND": "treble", "BIND_DEPTH": 0.70 },
    { "NAME": "accent_tint", "TYPE": "color", "DEFAULT": [1.00, 0.38, 0.12, 1.00],
      "LABEL": "Emissive Tint" },
    { "NAME": "body_tint",   "TYPE": "color", "DEFAULT": [0.03, 0.04, 0.06, 1.00],
      "LABEL": "Obsidian Base" }
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

float g_waist_r, g_flare, g_twist_ang, g_strut_r, g_ring_r, g_core_r, g_spike_h, g_k, g_ph;
float g_hit_type; // 0 = obsidian body, 1 = emissive core

float map(vec3 p) {
    float y = p.y;
    float h_limit = 0.68;
    float y_clamped = clamp(y, -h_limit, h_limit);

    // Hyperboloid profile radius at height y
    float rh = sqrt(g_waist_r * g_waist_r + g_flare * y_clamped * y_clamped);

    float r = length(p.xz);
    float a = atan(p.z, p.x);

    // 6-fold rotational symmetry for helical struts
    float sector = TAU / 6.0;
    float tw = y * g_twist_ang + g_ph;

    float a1 = mod(a - tw + sector * 0.5, sector) - sector * 0.5;
    float a2 = mod(a + tw + sector * 0.5, sector) - sector * 0.5;

    float d1 = length(vec2(r - rh, a1 * rh)) - g_strut_r;
    float d2 = length(vec2(r - rh, a2 * rh)) - g_strut_r;
    float d_lattice = min(d1, d2);

    // Y-caps bounding the struts
    float d_ycap = abs(y) - h_limit;
    d_lattice = max(d_lattice, d_ycap);

    // Top and bottom end-cap rings
    vec2 ring_p = vec2(r - rh, abs(y) - h_limit);
    float d_rings = length(ring_p) - g_ring_r;

    // Crown pinnacles / spikes extending from end-caps
    float a_spk = mod(a + sector * 0.5, sector) - sector * 0.5;
    vec2 spk_p = vec2(r - (rh + 0.08), abs(y) - (h_limit + g_spike_h * 0.5));
    float d_spikes = length(vec2(a_spk * rh, spk_p.x)) + abs(spk_p.y) * 0.25 - g_spike_h * 0.12;

    // Outer body combination
    float d_body = smin(d_lattice, d_rings, g_k);
    if (g_spike_h > 0.01) {
        d_body = smin(d_body, d_spikes, g_k * 0.8);
    }

    // Inner emissive core nucleus
    float d_core = length(p) - g_core_r;

    if (d_core < d_body) {
        g_hit_type = 1.0;
        return d_core;
    } else {
        g_hit_type = 0.0;
        return d_body;
    }
}

vec3 calcNormal(vec3 p) {
    const vec2 k = vec2(1.0, -1.0);
    const float e = 0.0015;
    return normalize(k.xyy * map(p + k.xyy * e) +
                     k.yyx * map(p + k.yyx * e) +
                     k.yxy * map(p + k.yxy * e) +
                     k.xxx * map(p + k.xxx * e));
}

vec3 envObsidian(vec3 r) {
    float up = r.y;
    vec3 base = mix(body_tint.rgb, vec3(0.08, 0.10, 0.15), smoothstep(-0.2, 0.6, up));
    // Sharp specular horizon and key light
    base += vec3(0.9, 0.95, 1.0) * pow(max(dot(r, normalize(vec3(0.5, 0.8, 0.4))), 0.0), 64.0) * 3.5;
    base += vec3(0.8, 0.85, 0.9) * pow(max(dot(r, normalize(vec3(-0.6, 0.3, -0.5))), 0.0), 32.0) * 1.5;
    return base;
}

void main() {
    // §7 canonical preamble
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;
    float rr = length(uv);

    // Absolute extents bound safety check
    float bound = smoothstep(0.478, 0.442, rr);
    if (bound <= 0.0) {
        gl_FragColor = vec4(0.0);
        return;
    }

    float ph = fract(TIME / PERIOD);
    g_ph = ph * TAU;

    // ---- Spectral morph selector (§12) -----------------------------
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

    // Archetype parameters interpolated by weights
    g_waist_r   = w1 * 0.18 + w2 * 0.28 + w3 * 0.38;
    g_flare     = w1 * 0.85 + w2 * 0.65 + w3 * 0.45;
    g_twist_ang = w1 * 1.80 + w2 * 2.80 + w3 * 3.80;
    g_strut_r   = w1 * 0.075 + w2 * 0.048 + w3 * 0.032;
    g_ring_r    = w1 * 0.080 + w2 * 0.055 + w3 * 0.040;
    g_core_r    = w1 * 0.180 + w2 * 0.130 + w3 * 0.080;
    g_spike_h   = w1 * 0.000 + w2 * 0.080 + w3 * 0.260;
    g_k         = w1 * 0.090 + w2 * 0.050 + w3 * 0.025;

    // Continuous input / bind modulations
    g_waist_r *= (0.85 + 0.30 * waist) * (0.95 + 0.05 * sin(g_ph));
    g_twist_ang *= (0.70 + 0.60 * twist);
    g_spike_h *= (0.60 + 0.80 * spike);
    g_core_r *= (0.90 + 0.40 * AUDIO_KICK);

    // ---- Camera setup (§5) -----------------------------------------
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.8 * ww);

    // Harmonic slow precession tilt (integer harmonic: 1.0 * g_ph)
    float tip = 0.25 * sin(g_ph * 1.0) + 0.15;
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
        float last_hit_type = 0.0;

        for (int i = 0; i < 56; i++) {
            p = ro + rd * t;
            float d = map(p);
            near = min(near, d / max(t, 0.5));
            if (d < 0.0009) {
                hit = true;
                last_hit_type = g_hit_type;
                break;
            }
            t += d * 0.82;
            if (t > tb1) break;
        }

        if (hit) {
            vec3 n = calcNormal(p);
            vec3 refl = reflect(rd, n);
            float ndv = max(dot(n, -rd), 0.0);

            if (last_hit_type > 0.5) {
                // Inner emissive core
                col = accent_tint.rgb * (1.8 + 1.2 * AUDIO_BEAT) + vec3(0.8);
                alpha = 1.0;
            } else {
                // Outer obsidian body
                float fresnel = pow(1.0 - ndv, 3.5);
                vec3 env = envObsidian(refl);

                vec3 spec = vec3(1.0) * pow(max(dot(refl, normalize(vec3(0.4, 0.8, 0.4))), 0.0), 32.0) * 2.0;
                vec3 rim = accent_tint.rgb * fresnel * (1.2 + 1.5 * AUDIO_BEAT);

                col = body_tint.rgb + env * (0.3 + 0.7 * fresnel) + spec + rim;
                alpha = 1.0;
            }
        }
    }

    // Bounded emissive sheath / glow from core and near approach
    float ca = clamp(1.0 - near * 4.8, 0.0, 1.0);
    float sheath = (pow(ca, 5.0) * 0.35 + pow(ca, 24.0) * 0.65) * (1.0 - alpha);
    sheath *= smoothstep(0.442, 0.10, rr) * (0.50 + 0.80 * AUDIO_BEAT);

    col += accent_tint.rgb * sheath;
    alpha = clamp(alpha + sheath * 0.60, 0.0, 1.0);

    // Tone map & premultiply
    col = col / (1.0 + col * 0.28);
    col = pow(max(col, 0.0), vec3(0.92));
    alpha = clamp(alpha, 0.0, 1.0) * bound;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
