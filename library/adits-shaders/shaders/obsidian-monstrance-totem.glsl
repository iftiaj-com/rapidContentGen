/*{
  "ADITS": 1,
  "DESCRIPTION": "A monumental obsidian biomech monstrance whose architectural archetypes shift spectrally: resting as a heavy ribbed monolith, expanding into an articulated halo relic, and unfolding into radiating spires under treble drive.",
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
    { "NAME": "rest_form",  "TYPE": "float", "DEFAULT": 0.10, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Rest Archetype" },
    { "NAME": "carapace",   "TYPE": "float", "DEFAULT": 0.45, "MIN": 0.10, "MAX": 0.85,
      "LABEL": "Carapace Thickness", "BIND": "bass", "BIND_DEPTH": 0.50 },
    { "NAME": "precession", "TYPE": "float", "DEFAULT": 0.35, "MIN": 0.05, "MAX": 0.85,
      "LABEL": "Halo Precession", "BIND": "mid", "BIND_DEPTH": 0.60 },
    { "NAME": "pulse_rate", "TYPE": "float", "DEFAULT": 0.40, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Core Pulse", "BIND": "treble", "BIND_DEPTH": 0.70 },
    { "NAME": "gold_tint",  "TYPE": "color", "DEFAULT": [1.00, 0.78, 0.35, 1.00],
      "LABEL": "Relic Gold" },
    { "NAME": "cyan_glow",  "TYPE": "color", "DEFAULT": [0.15, 0.85, 1.00, 1.00],
      "LABEL": "Vein Cyan" }
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

// Global morph parameters computed in main
float g_ph;
float g_hub_r;
float g_halo_r;
float g_spire_len;
float g_rib_count;
float g_k_blend;
float g_carapace_scale;

float map(vec3 p) {
    // Bilateral and rotational symmetry
    p.x = abs(p.x);

    // Archetype 1: Monolithic Central Core
    float d_core = length(p) - g_hub_r;

    // Vertical ribbed columns on the monolith
    vec3 p_rib = p;
    float a_rib = atan(p_rib.z, p_rib.x + 1e-6);
    float r_rib = length(p_rib.xz);
    a_rib = mod(a_rib + TAU / (g_rib_count * 2.0), TAU / g_rib_count) - TAU / (g_rib_count * 2.0);
    p_rib.x = cos(a_rib) * r_rib;
    p_rib.z = sin(a_rib) * r_rib;

    // Smooth capsulated ribs along y
    float rib_r = 0.08 * g_carapace_scale;
    float rib_dist_xz = length(p_rib.xz - vec2(g_hub_r * 0.72, 0.0));
    float rib_h = max(abs(p.y) - (0.75 - rib_r), 0.0);
    float d_ribs = length(vec2(rib_dist_xz, rib_h)) - rib_r;

    // Archetype 2: Articulated Halo Ring
    vec3 p_halo = p;
    pR(p_halo.xz, g_ph * 2.0);
    pR(p_halo.xy, g_ph * 1.0);
    float d_ring = length(vec2(length(p_halo.xz) - g_halo_r, p_halo.y)) - (0.04 * g_carapace_scale);

    // Archetype 3: Radiating Biomech Spires
    vec3 p_spire = p;
    pR(p_spire.xy, g_ph * -1.0);
    float a_spire = atan(p_spire.y, p_spire.x + 1e-6);
    float r_spire = length(p_spire.xy);
    float n_spire = 8.0;
    a_spire = mod(a_spire + TAU / (n_spire * 2.0), TAU / n_spire) - TAU / (n_spire * 2.0);
    vec2 sp_uv = vec2(cos(a_spire) * r_spire, sin(a_spire) * r_spire);
    float d_spires = length(sp_uv - vec2(g_spire_len * 0.5, 0.0)) - 0.03;
    d_spires = max(d_spires, abs(p_spire.z) - 0.12);

    // Smooth CSG blend across archetypes
    float d = smin(d_core, d_ribs, 0.08);
    d = smin(d, d_ring, g_k_blend);
    d = smin(d, d_spires, g_k_blend);

    return d;
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
    vec3 baseCol = mix(vec3(0.010, 0.012, 0.018), vec3(0.08, 0.10, 0.14), smoothstep(-0.4, 0.6, up));
    // High contrast glossy specular reflections
    vec3 specKey = gold_tint.rgb * pow(max(dot(r, normalize(vec3(0.5, 0.8, 0.4))), 0.0), 48.0) * 3.5;
    vec3 specFill = cyan_glow.rgb * pow(max(dot(r, normalize(vec3(-0.6, 0.3, -0.5))), 0.0), 24.0) * 1.8;
    return baseCol + specKey + specFill;
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;
    float rr = length(uv);

    // Absolute extent bounding to avoid edge clipping or full-frame leaks
    float boundMask = 1.0 - smoothstep(0.440, 0.478, rr);
    if (boundMask <= 0.0) {
        gl_FragColor = vec4(0.0);
        return;
    }

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

    // Triadic archetype kernel weights
    float w1 = clamp(1.0 - abs(sel)       / 0.33, 0.0, 1.0);
    float w2 = clamp(1.0 - abs(sel - 0.5) / 0.33, 0.0, 1.0);
    float w3 = clamp(1.0 - abs(sel - 1.0) / 0.33, 0.0, 1.0);
    float ws = w1 + w2 + w3 + 1e-4;
    w1 /= ws; w2 /= ws; w3 /= ws;

    // Archetype parameters
    g_hub_r     = w1 * 0.38 + w2 * 0.24 + w3 * 0.16;
    g_halo_r    = w1 * 0.20 + w2 * 0.58 + w3 * 0.72;
    g_spire_len = w1 * 0.10 + w2 * 0.35 + w3 * 0.82;
    g_rib_count = floor(w1 * 6.0 + w2 * 8.0 + w3 * 12.0);
    g_k_blend   = w1 * 0.18 + w2 * 0.10 + w3 * 0.04;

    // Dynamic drive adjustments
    g_carapace_scale = (0.85 + 0.35 * carapace) * (0.95 + 0.05 * sin(g_ph));
    g_hub_r *= g_carapace_scale;
    g_halo_r *= (0.90 + 0.20 * precession);

    // ---- camera setup (guide 5) -------------------------------------
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.8 * ww);

    float tip = 0.25 * sin(g_ph * 1.0) + 0.20;
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
            if (d < 0.0009) { hit = true; break; }
            t += d * 0.82;
            if (t > tb1) break;
        }

        if (hit) {
            vec3 n = calcNormal(p);
            vec3 refl = reflect(rd, n);
            float ndv = max(dot(n, -rd), 0.0);

            // Obsidian dark gloss body + fresnel rim
            float fresnel = pow(1.0 - ndv, 3.0);
            vec3 env = envObsidian(refl);

            // Internal cyan energy vein pulse
            float pulse = 0.5 + 0.5 * sin(p.y * 12.0 - g_ph * 3.0 + pulse_rate * 6.28);
            vec3 veinGlow = cyan_glow.rgb * pow(pulse, 4.0) * (1.2 + 1.5 * AUDIO_BEAT);

            col = env * (0.4 + 0.6 * fresnel)
                + gold_tint.rgb * fresnel * 1.2
                + veinGlow;
            alpha = 1.0;
        }
    }

    // Volumetric aura around the totem
    float ca = clamp(1.0 - near * 5.0, 0.0, 1.0);
    float aura = (pow(ca, 5.0) * 0.25 + pow(ca, 20.0) * 0.55) * (1.0 - alpha);
    aura *= (1.0 - smoothstep(0.10, 0.440, rr)) * (0.5 + 0.8 * AUDIO_BEAT);

    col += cyan_glow.rgb * aura;
    alpha = clamp(alpha + aura * 0.50, 0.0, 1.0);

    // Tone map & premultiply alpha
    col = col / (1.0 + col * 0.35);
    col = pow(max(col, 0.0), vec3(0.92));
    alpha = clamp(alpha, 0.0, 1.0) * boundMask;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
