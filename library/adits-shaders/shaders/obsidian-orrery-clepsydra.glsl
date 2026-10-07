/*{
  "ADITS": 1,
  "DESCRIPTION": "A 3D kinetic obsidian clepsydra orrery: concentric polished black-stone rings and precessing satellite nodes orbit an audio-reactive emissive core, morphing between a fused heavy equatorial vessel, a tri-axial astrolabe, and an expanded stellar spindle.",
  "CREDIT": "gemini-2.5-pro (Jules)",
  "DATE": "2026-08-27",
  "CATEGORIES": ["generative", "3d", "audio", "morph", "obsidian"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "high",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "morph_gain",    "TYPE": "float", "DEFAULT": 0.84, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Morph Sensitivity" },
    { "NAME": "rest_form",     "TYPE": "float", "DEFAULT": 0.10, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Rest Archetype" },
    { "NAME": "ring_thickness","TYPE": "float", "DEFAULT": 0.40, "MIN": 0.10, "MAX": 0.80,
      "LABEL": "Ring Thickness", "BIND": "bass", "BIND_DEPTH": 0.55 },
    { "NAME": "orbit_speed",   "TYPE": "float", "DEFAULT": 0.35, "MIN": 0.05, "MAX": 0.85,
      "LABEL": "Orbit Precession", "BIND": "mid", "BIND_DEPTH": 0.60 },
    { "NAME": "core_pulse",    "TYPE": "float", "DEFAULT": 0.45, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Emissive Core Pulse", "BIND": "treble", "BIND_DEPTH": 0.70 },
    { "NAME": "obsidian_tint", "TYPE": "color", "DEFAULT": [0.08, 0.10, 0.14, 1.00],
      "LABEL": "Obsidian Body Tint" },
    { "NAME": "emissive_tint", "TYPE": "color", "DEFAULT": [0.95, 0.65, 0.22, 1.00],
      "LABEL": "Emissive Core Tint" }
  ]
}*/

#define TAU    6.28318530718
#define PERIOD 16.0
#define ORBIT  4.80
#define BOUND  1.12

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
    float h = clamp(0.5 + 0.5 * (b - a) / max(k, 1e-4), 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
}

float sdTorus(vec3 p, vec2 t) {
    vec2 q = vec2(length(p.xz) - t.x, p.y);
    return length(q) - t.y;
}

float sdCylinder(vec3 p, float r, float h) {
    vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h);
    return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

float g_ph;
float g_core_r, g_ring1_r, g_ring1_w, g_ring2_r, g_ring2_w, g_ring3_r, g_ring3_w;
float g_node_r, g_node_dist, g_spoke_w, g_k;

float map(vec3 p) {
    // Archetype 1 & Central Core
    float dCore = length(p) - g_core_r;

    // Primary Equatorial Ring (Ring 1)
    vec3 p1 = p;
    pR(p1.xz, g_ph);
    float dRing1 = sdTorus(p1, vec2(g_ring1_r, g_ring1_w));

    // Secondary Tilted Astrolabe Ring (Ring 2)
    vec3 p2 = p;
    pR(p2.yz, 0.7853 + 0.25 * sin(g_ph));
    pR(p2.xz, -g_ph * 2.0);
    float dRing2 = sdTorus(p2, vec2(g_ring2_r, g_ring2_w));

    // Outer Precessing Ring (Ring 3)
    vec3 p3 = p;
    pR(p3.xy, 1.2566 + 0.35 * cos(g_ph * 1.5));
    pR(p3.xz, g_ph * 3.0);
    float dRing3 = sdTorus(p3, vec2(g_ring3_r, g_ring3_w));

    // Combine rings
    float dRings = smin(dRing1, dRing2, g_k);
    dRings = smin(dRings, dRing3, g_k * 0.7);

    float d = smin(dCore, dRings, g_k);

    // Radial Spokes (Archetype 3 Spindle feature)
    if (g_spoke_w > 0.001) {
        vec3 ps = p;
        float a = atan(ps.z, ps.x + 1e-7);
        float sector = TAU / 6.0;
        a = mod(a + sector * 0.5, sector) - sector * 0.5;
        a = abs(a);
        vec2 plane = vec2(cos(a), sin(a)) * length(ps.xz);
        vec3 q = vec3(plane.x, ps.y, plane.y);
        float dSpoke = sdCylinder(q.xzy, g_spoke_w, g_ring3_r * 1.05) - 0.008;
        d = smin(d, dSpoke, g_k * 0.5);
    }

    // Satellite Nodes orbiting outer ring
    if (g_node_r > 0.001) {
        for (int i = 0; i < 4; i++) {
            float fi = float(i);
            float na = fi * (TAU / 4.0) + g_ph * 2.5;
            vec3 nc = vec3(cos(na) * g_node_dist, sin(na * 2.0) * 0.12, sin(na) * g_node_dist);
            float dNode = length(p - nc) - g_node_r;
            d = smin(d, dNode, g_k * 0.6);
        }
    }

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

// Studio environment for high-gloss obsidian reflections
vec3 envObsidian(vec3 r) {
    float up = r.y;
    vec3 base = mix(obsidian_tint.rgb * 0.2, obsidian_tint.rgb * 1.5, smoothstep(-0.4, 0.6, up));
    // Sharp horizon reflection line giving liquid obsidian sheen
    base += vec3(0.95, 0.98, 1.00) * smoothstep(0.04, 0.0, abs(up - 0.02)) * 0.75;
    // Key highlight light sources
    base += vec3(1.00, 0.94, 0.82) * pow(max(dot(r, normalize(vec3(0.5, 0.75, 0.4))), 0.0), 48.0) * 3.2;
    base += emissive_tint.rgb * pow(max(dot(r, normalize(vec3(-0.6, -0.3, -0.5))), 0.0), 16.0) * 1.0;
    return base;
}

void main() {
    // §7 Canonical Preamble
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;
    float rr = length(uv);
    float bound = smoothstep(0.478, 0.442, rr);
    if (bound <= 0.0) { gl_FragColor = vec4(0.0); return; }

    float ph = fract(TIME / PERIOD);
    g_ph = ph * TAU;

    // ---- Spectral Morph Selector (Guide §12.2 - 12.4, 12.7) ----
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum = lo + md + hi + 1e-3;
    float tiltS = (md * 0.5 + hi) / sum;
    float sel = clamp((tiltS - 0.5) * (1.6 + 3.4 * morph_gain) + 0.5, 0.0, 1.0);
    sel = clamp(sel + 0.38 * (AUDIO_HAT - AUDIO_KICK) + 0.18 * AUDIO_SNARE, 0.0, 1.0);
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest_form, sel, live);

    // 3 Archetypes kernel weights
    float w1 = clamp(1.0 - abs(sel)       / 0.33, 0.0, 1.0); // Fused Heavy Vessel (Rest)
    float w2 = clamp(1.0 - abs(sel - 0.5) / 0.33, 0.0, 1.0); // Tri-axial Astrolabe
    float w3 = clamp(1.0 - abs(sel - 1.0) / 0.33, 0.0, 1.0); // Expanded Spindle & Satellite Nodes
    float ws = w1 + w2 + w3 + 1e-4;
    w1 /= ws; w2 /= ws; w3 /= ws;

    // Archetype structural morph parameters - crisper dimensions & controlled blending
    g_core_r   = w1 * 0.220 + w2 * 0.150 + w3 * 0.090;
    g_ring1_r  = w1 * 0.380 + w2 * 0.450 + w3 * 0.520;
    g_ring1_w  = w1 * 0.075 + w2 * 0.045 + w3 * 0.028;

    g_ring2_r  = w1 * 0.420 + w2 * 0.560 + w3 * 0.640;
    g_ring2_w  = w1 * 0.060 + w2 * 0.038 + w3 * 0.022;

    g_ring3_r  = w1 * 0.460 + w2 * 0.650 + w3 * 0.740;
    g_ring3_w  = w1 * 0.045 + w2 * 0.030 + w3 * 0.018;

    g_spoke_w  = w1 * 0.000 + w2 * 0.008 + w3 * 0.022;
    g_node_r   = w1 * 0.000 + w2 * 0.035 + w3 * 0.060;
    g_node_dist= w1 * 0.500 + w2 * 0.700 + w3 * 0.820;

    g_k        = w1 * 0.055 + w2 * 0.025 + w3 * 0.010;

    // Continuous Parameter Adjustments from Inputs and Audio
    float thickMod = (0.85 + 0.30 * ring_thickness) * (0.97 + 0.03 * sin(g_ph));
    g_ring1_w *= thickMod * (0.92 + 0.16 * AUDIO_KICK);
    g_ring2_w *= thickMod;
    g_ring3_w *= thickMod;
    g_k       *= 0.80 + 0.40 * ring_thickness + 0.20 * AUDIO_KICK;
    g_ph      += (0.2 + 0.8 * orbit_speed) * ph * TAU;

    // ---- Camera setup (§5) ----
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.8 * ww);

    float pitch = 0.25 * sin(ph * TAU) + 0.20;
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
        for (int i = 0; i < 56; i++) {
            p = ro + rd * t;
            float d = map(p);
            near = min(near, d / max(t, 0.6));
            if (d < 0.0009) { hit = true; break; }
            t += d * 0.75;
            if (t > tb1) break;
        }

        if (hit) {
            vec3 n = calcNormal(p);
            vec3 refl = reflect(rd, n);
            float ndv = max(dot(n, -rd), 0.0);

            // High-gloss obsidian reflection
            vec3 bodyRefl = envObsidian(refl);

            // Fresnel rim specular (gold/emerald highlights on dark obsidian edge)
            float fresnel = pow(1.0 - ndv, 3.5);
            vec3 rimColor = mix(emissive_tint.rgb, vec3(0.9, 1.0, 0.8), 0.3) * fresnel * 2.2;

            // Internal emissive core bleed through deep grooves / core proximity
            float coreProximity = smoothstep(0.20, 0.0, length(p) - g_core_r * 0.85);
            vec3 coreEmissive = emissive_tint.rgb * coreProximity * (1.4 + 1.8 * core_pulse) * (0.7 + 0.6 * AUDIO_BEAT);

            // Ambient self-occlusion approximation
            float ao = clamp(map(p + n * 0.08) / 0.08, 0.25, 1.0);

            col = (bodyRefl * obsidian_tint.rgb * 4.0 * ao) + rimColor + coreEmissive;
            alpha = 1.0;
        }
    }

    // ---- Bounded Sheath & Emissive Core Atmosphere Glow (Guide §8) ----
    float ca = clamp(1.0 - near * 5.2, 0.0, 1.0);
    float sheath = (pow(ca, 5.0) * 0.28 + pow(ca, 24.0) * 0.60) * (1.0 - alpha);
    sheath *= smoothstep(0.442, 0.10, rr) * (0.35 + 0.65 * core_pulse) * (0.60 + 0.80 * AUDIO_BEAT);
    col += emissive_tint.rgb * sheath * 0.85;
    alpha = clamp(alpha + sheath * 0.50, 0.0, 1.0);

    // Tone map & premultiply
    col = col / (1.0 + col * 0.38);
    col = pow(max(col, 0.0), vec3(0.92));
    alpha = clamp(alpha, 0.0, 1.0) * bound;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
