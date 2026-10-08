/*{
  "ADITS": 1,
  "DESCRIPTION": "An obsidian biomech caduceus diadem featuring double-helix chitinous tendrils wrapping a ribbed core spire, spectrally morphing into an unfolding bio-armature and a flared crown diadem under audio drive.",
  "CREDIT": "gemini-2.5-pro (Jules)",
  "DATE": "2026-08-28",
  "CATEGORIES": ["generative", "3d", "audio", "morph", "biomech"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "high",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "morph_gain", "TYPE": "float", "DEFAULT": 0.85, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Morph Sensitivity" },
    { "NAME": "rest_form",  "TYPE": "float", "DEFAULT": 0.10, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Rest Archetype" },
    { "NAME": "spine_thick", "TYPE": "float", "DEFAULT": 0.35, "MIN": 0.10, "MAX": 0.70,
      "LABEL": "Spine Density", "BIND": "bass", "BIND_DEPTH": 0.50 },
    { "NAME": "helix_twist", "TYPE": "float", "DEFAULT": 0.40, "MIN": 0.10, "MAX": 0.85,
      "LABEL": "Helix Warp", "BIND": "mid", "BIND_DEPTH": 0.60 },
    { "NAME": "vein_energy", "TYPE": "float", "DEFAULT": 0.45, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Vein Energy", "BIND": "treble", "BIND_DEPTH": 0.70 },
    { "NAME": "obsidian_tint", "TYPE": "color", "DEFAULT": [0.10, 0.12, 0.16, 1.00],
      "LABEL": "Obsidian Body" },
    { "NAME": "vein_tint",     "TYPE": "color", "DEFAULT": [0.15, 0.82, 0.98, 1.00],
      "LABEL": "Emissive Vein" }
  ]
}*/

#define TAU    6.28318530718
#define PERIOD 16.0
#define ORBIT  5.20
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

float g_ph, g_k;
float g_core_r, g_helix_orb, g_helix_r, g_crown_r, g_twist, g_wings;

float map(vec3 p) {
    // Smooth vertical taper for smooth end closure
    float h_taper = clamp(1.0 - pow(abs(p.y) / 0.58, 4.0), 0.0, 1.0);

    // Core spine: central ribbed capsule spire
    float rib = 0.012 * cos(p.y * 22.0 + g_ph * 2.0);
    float r_core = g_core_r * h_taper + rib;
    vec2 p_core_capsule = vec2(length(p.xz), p.y);
    float d_core = length(p_core_capsule - vec2(0.0, clamp(p.y, -0.52, 0.52))) - r_core;

    // Double-helix tendrils wrapping central shaft with smooth height fade & capsule cap
    float ha = p.y * (3.0 + 4.0 * g_twist) + g_ph;
    float h_orb = g_helix_orb * h_taper;
    vec3 h1_pos = vec3(cos(ha) * h_orb, 0.0, sin(ha) * h_orb);
    vec3 h2_pos = vec3(cos(ha + 3.1415926) * h_orb, 0.0, sin(ha + 3.1415926) * h_orb);

    float r_helix = g_helix_r * h_taper;
    float d_h1 = max(length(p.xz - h1_pos.xz) - r_helix, abs(p.y) - 0.54);
    float d_h2 = max(length(p.xz - h2_pos.xz) - r_helix, abs(p.y) - 0.54);
    float d_helix = min(d_h1, d_h2);

    // Diadem ring / toroid crests at top and waist
    vec3 p_ring1 = p - vec3(0.0, 0.30, 0.0);
    float d_ring1 = length(vec2(length(p_ring1.xz) - g_crown_r * h_taper, p_ring1.y)) - 0.022;

    vec3 p_ring2 = p - vec3(0.0, -0.30, 0.0);
    float d_ring2 = length(vec2(length(p_ring2.xz) - g_crown_r * 0.82 * h_taper, p_ring2.y)) - 0.020;

    // Winged bio-armature ribs flared out bilaterally
    vec3 pw = p;
    pw.x = abs(pw.x + 1e-7);
    vec3 w_origin = vec3(0.08, 0.0, 0.0);
    vec3 w_tip = vec3(0.38 + 0.32 * g_wings, 0.45 * g_wings, 0.15 * cos(pw.y * 5.0 + g_ph));
    vec3 pa = pw - w_origin, ba = w_tip - w_origin;
    float h_f = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0);
    float d_wing = length(pa - ba * h_f) - (0.032 * (1.0 - 0.6 * h_f));

    // Combine features with smooth union
    float d = smin(d_core, d_helix, g_k);
    d = smin(d, min(d_ring1, d_ring2), g_k * 0.7);
    if (g_wings > 0.02) {
        d = smin(d, d_wing, g_k * 0.8);
    }

    return d;
}

vec3 calcNormal(vec3 p) {
    const vec2 k = vec2(1.0, -1.0);
    const float e = 0.0016;
    return normalize(k.xyy * map(p + k.xyy * e) +
                     k.yyx * map(p + k.yyx * e) +
                     k.yxy * map(p + k.yxy * e) +
                     k.xxx * map(p + k.xxx * e));
}

// Obsidian environment reflection studio
vec3 envObsidian(vec3 r) {
    float up = r.y;
    vec3 base = mix(vec3(0.010, 0.012, 0.018),
                    obsidian_tint.rgb * (0.85 + 0.50 * up),
                    smoothstep(-0.40, 0.50, up));
    // Horizon specular streak
    base += vec3(0.90, 0.95, 1.00) * smoothstep(0.06, 0.0, abs(up - 0.03)) * 0.75;
    // Key light highlight
    base += vec3(1.00, 0.98, 0.92) * pow(max(dot(r, normalize(vec3(0.40, 0.85, 0.45))), 0.0), 64.0) * 3.5;
    // Rim bounce
    base += vein_tint.rgb * pow(max(dot(r, normalize(vec3(-0.60, 0.20, -0.50))), 0.0), 20.0) * 1.10;
    return base;
}

void main() {
    // Canonical preamble (guide section 7)
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
    sel = clamp(sel + 0.38 * (AUDIO_HAT - AUDIO_KICK) + 0.18 * AUDIO_SNARE, 0.0, 1.0);
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest_form, sel, live);

    // Archetype weights (narrow blend kernel)
    float w1 = clamp(1.0 - abs(sel)       / 0.33, 0.0, 1.0);
    float w2 = clamp(1.0 - abs(sel - 0.5) / 0.33, 0.0, 1.0);
    float w3 = clamp(1.0 - abs(sel - 1.0) / 0.33, 0.0, 1.0);
    float ws = w1 + w2 + w3 + 1e-4;
    w1 /= ws; w2 /= ws; w3 /= ws;

    // Archetype parameter blends
    // A1: Resting caduceus shaft & tight helix
    // A2: Unfolding bio-armature wings
    // A3: Flared crown diadem
    g_k         = w1 * 0.085 + w2 * 0.120 + w3 * 0.065;
    g_core_r    = w1 * 0.120 + w2 * 0.080 + w3 * 0.055;
    g_helix_orb = w1 * 0.220 + w2 * 0.310 + w3 * 0.420;
    g_helix_r   = w1 * 0.052 + w2 * 0.040 + w3 * 0.032;
    g_crown_r   = w1 * 0.180 + w2 * 0.320 + w3 * 0.480;
    g_twist     = w1 * 0.300 + w2 * 0.600 + w3 * 1.000;
    g_wings     = w1 * 0.000 + w2 * 0.850 + w3 * 0.300;

    // Continuous shared parameter modulations from inputs
    g_core_r  *= (0.90 + 0.25 * spine_thick);
    g_twist   *= (0.85 + 0.40 * helix_twist);
    g_k       *= (0.80 + 0.40 * AUDIO_KICK);

    // Camera setup (guide section 5)
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.8 * ww);

    float tip = 0.25 * sin(g_ph) + 0.15;
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
            t += d * 0.82;
            if (t > tb1) break;
        }

        if (hit) {
            vec3 n = calcNormal(p);
            vec3 refl = reflect(rd, n);
            float ndv = max(dot(n, -rd), 0.0);

            // Fresnel rim illumination for obsidian volume
            float fresnel = pow(1.0 - ndv, 3.5);

            // Emissive interior vein pattern along helical & vertical ribs
            float vein_pattern = abs(sin(p.y * 24.0 + g_ph * 2.0)) * abs(cos(atan(p.z, p.x + 1e-7) * 4.0));
            vein_pattern = pow(vein_pattern, 4.0) * (0.50 + 1.20 * vein_energy);

            vec3 surface = envObsidian(refl) * obsidian_tint.rgb * 1.8;
            vec3 rim_col = vein_tint.rgb * fresnel * (0.80 + 1.20 * vein_energy);
            vec3 vein_col = vein_tint.rgb * vein_pattern * (0.60 + 0.80 * AUDIO_BEAT);

            col = surface + rim_col + vein_col;
            alpha = 1.0;
        }
    }

    // Bounded sheath glow from near-miss approach (guide section 8)
    float ca = clamp(1.0 - near * 5.2, 0.0, 1.0);
    float sheath = (pow(ca, 5.0) * 0.25 + pow(ca, 24.0) * 0.60) * (1.0 - alpha);
    sheath *= smoothstep(0.442, 0.10, rr) * (0.35 + 0.65 * vein_energy) * (0.50 + 0.90 * AUDIO_BEAT);
    col += vein_tint.rgb * sheath;
    alpha = clamp(alpha + sheath * 0.50, 0.0, 1.0);

    // Tone mapping & premultiplication against transparent black
    col = col / (1.0 + col * 0.32);
    col = pow(max(col, 0.0), vec3(0.92));
    alpha = clamp(alpha, 0.0, 1.0) * bound;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
