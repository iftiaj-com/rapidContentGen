/*{
  "ADITS": 1,
  "DESCRIPTION": "An obsidian diadem vessel that spectrally morphs between a bulbous biomech pod, a flared fluted chalice, and a multi-tiered crowned crucible. Bass carves deep vertical flutes, mid flares the crown blades, and treble ignites cyan rim fresnel highlights.",
  "CREDIT": "gemini-2.5-pro (Jules)",
  "DATE": "2026-08-26",
  "CATEGORIES": ["generative", "3d", "audio", "morph"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "high",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "morph_gain",    "TYPE": "float", "DEFAULT": 0.82, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Morph Sensitivity" },
    { "NAME": "rest_form",     "TYPE": "float", "DEFAULT": 0.12, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Rest Archetype" },
    { "NAME": "flute_depth",   "TYPE": "float", "DEFAULT": 0.35, "MIN": 0.05, "MAX": 0.80,
      "LABEL": "Flute Depth", "BIND": "bass", "BIND_DEPTH": 0.55 },
    { "NAME": "crown_flare",   "TYPE": "float", "DEFAULT": 0.38, "MIN": 0.05, "MAX": 0.85,
      "LABEL": "Crown Flare", "BIND": "mid", "BIND_DEPTH": 0.60 },
    { "NAME": "fresnel_glow",  "TYPE": "float", "DEFAULT": 0.40, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Fresnel Rim", "BIND": "treble", "BIND_DEPTH": 0.70 },
    { "NAME": "obsidian_tint", "TYPE": "color", "DEFAULT": [0.12, 0.55, 0.85, 1.00],
      "LABEL": "Emissive Tint" }
  ]
}*/

#define TAU    6.28318530718
#define PERIOD 16.0
#define ORBIT  4.80
#define BOUND  1.20

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

float smax(float a, float b, float k) {
    return -smin(-a, -b, k);
}

// Global morph parameters computed in main
float g_flute, g_flare, g_tier, g_radius, g_ph;

float sdCylinder(vec3 p, float h, float r) {
    vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h);
    return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

float map(vec3 p) {
    // 8-fold radial symmetry around Y-axis
    float a = atan(p.z, p.x + 1e-7);
    float r = length(p.xz);
    float sector = TAU / 8.0;
    float ma = mod(a + sector * 0.5, sector) - sector * 0.5;
    vec3  pr = vec3(cos(ma) * r, p.y, sin(ma) * r);

    // Archetype 1: Pod / Seed (Compact, rounded, deep organic vertical flutes)
    float dBody1 = length(p) - (g_radius * 0.65 + 0.12 * cos(p.y * 5.0 + g_ph));
    float dFlute1 = pr.z - (0.04 + g_flute * 0.18) * cos(ma * 8.0);
    float arch1 = smax(dBody1, -dFlute1, 0.08);

    // Archetype 2: Flared Diadem Chalice (Swept rim blades, hollow core)
    float flareProfile = g_radius * (0.45 + g_flare * 0.40 * (p.y + 0.5));
    float dOuter2 = length(pr.xz) - flareProfile;
    float dInner2 = length(pr.xz) - (flareProfile - 0.08);
    float dCutY2  = abs(p.y) - 0.55;
    float dChalice2 = max(smax(dOuter2, -dInner2, 0.05), dCutY2);
    // Add crown blade fins
    float dFins2 = length(pr.xz - vec2(flareProfile * 0.9, 0.0)) - 0.06;
    float arch2 = smin(dChalice2, dFins2, 0.06);

    // Archetype 3: Tiered Crucible (Multi-ring stacked armature with crowned spires)
    float ring1 = sdCylinder(p - vec3(0.0, -0.30, 0.0), 0.08, g_radius * 0.50);
    float ring2 = sdCylinder(p - vec3(0.0,  0.00, 0.0), 0.08, g_radius * 0.68);
    float ring3 = sdCylinder(p - vec3(0.0,  0.30, 0.0), 0.08, g_radius * 0.42);
    float rings = smin(smin(ring1, ring2, 0.08), ring3, 0.08);

    // Vertical ribs linking rings
    float rib = length(pr.xz - vec2(g_radius * 0.52, 0.0)) - 0.05;
    float arch3 = smin(rings, rib, 0.06);

    // Blend between archetypes according to global weights
    float d = smin(arch1, arch2, g_tier * 0.12 + 0.04);
    d = smin(d, arch3, (1.0 - g_tier) * 0.08 + 0.04);

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
    // Dark glossy obsidian environment reflection with sharp key highlight
    vec3 c = mix(vec3(0.008, 0.010, 0.016),
                 obsidian_tint.rgb * 0.35,
                 smoothstep(-0.40, 0.50, up));
    // Key highlight
    c += vec3(1.0, 0.98, 0.92) * pow(max(dot(r, normalize(vec3(0.40, 0.85, 0.38))), 0.0), 64.0) * 3.5;
    // Secondary rim fill
    c += obsidian_tint.rgb * pow(max(dot(r, normalize(vec3(-0.55, 0.20, -0.60))), 0.0), 16.0) * 0.90;
    return c;
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

    // Global parameters shaped by morph weights & binds
    g_flute  = (w1 * 0.85 + w2 * 0.40 + w3 * 0.20) * (0.80 + 0.45 * flute_depth);
    g_flare  = (w1 * 0.10 + w2 * 0.90 + w3 * 0.45) * (0.80 + 0.45 * crown_flare);
    g_tier   = w3 * 0.85 + w2 * 0.40;
    g_radius = (0.52 + 0.08 * sin(g_ph)) * (0.92 + 0.16 * AUDIO_KICK);

    // ---- camera (guide 5) -------------------------------------------
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.8 * ww);

    // Harmonic slow pitch oscillation
    float pitch = 0.25 * sin(g_ph * 1.0) + 0.20;
    pR(ro.yz, pitch);
    pR(rd.yz, pitch);

    // Continuous slow harmonic Y-rotation
    pR(ro.xz, g_ph * 1.0);
    pR(rd.xz, g_ph * 1.0);

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

            // Obsidian body: deep dark specular with sharp fresnel rim
            float fresnel = pow(1.0 - ndv, 3.5);
            vec3 specColor = envObsidian(refl);

            // Cyan/electric fresnel rim light driven by treble & audio beat
            vec3 rimLight = obsidian_tint.rgb * fresnel * (1.2 + 2.5 * fresnel_glow) * (0.75 + 0.75 * AUDIO_BEAT);

            col = specColor * 0.85 + rimLight;
            alpha = 1.0;
        }
    }

    // ---- bounded sheath from closest approach (guide 8) --------------
    float ca = clamp(1.0 - near * 5.0, 0.0, 1.0);
    float sheath = (pow(ca, 5.0) * 0.25 + pow(ca, 24.0) * 0.60) * (1.0 - alpha);
    sheath *= smoothstep(0.442, 0.10, rr) * (0.35 + 0.65 * fresnel_glow) * (0.50 + 0.80 * AUDIO_BEAT);
    col += obsidian_tint.rgb * sheath;
    alpha = clamp(alpha + sheath * 0.50, 0.0, 1.0);

    // Tone map & gamma correction
    col = col / (1.0 + col * 0.30);
    col = pow(max(col, 0.0), vec3(0.90));

    // Spatial premultiplied alpha
    alpha = clamp(alpha, 0.0, 1.0) * bound;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
